// Browser smoke test. Usage:
//   npm run build:preview && node tests/e2e/smoke.mjs preview
//   npm run build && node tests/e2e/smoke.mjs production
// Serves dist/ with `astro preview`, drives Chromium, saves screenshots to reports/screens/.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';

// CommonJS require so a globally installed Playwright is found too (CI installs it with --no-save).
const { chromium, devices } = createRequire(import.meta.url)('playwright');

const mode = process.argv[2] === 'production' ? 'production' : 'preview';
const PORT = 4329;
const BASE = `http://localhost:${PORT}/reach-prenatal/`;
const shots = 'reports/screens';
mkdirSync(shots, { recursive: true });

// Tiny static server for dist/ under the GitHub Pages base path.
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (!url.pathname.startsWith('/reach-prenatal/')) return res.writeHead(404).end();
  let p = join('dist', decodeURIComponent(url.pathname.slice('/reach-prenatal/'.length)));
  if (p.endsWith('/') || !extname(p)) p = join(p, 'index.html');
  try {
    const body = await readFile(p);
    res.writeHead(200, { 'content-type': TYPES[extname(p)] ?? 'application/octet-stream' }).end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/html' }).end('not found');
  }
});
await new Promise((r) => server.listen(PORT, r));

const results = [];
const step = async (name, fn) => {
  try {
    await Promise.race([fn(), new Promise((_, rej) => setTimeout(() => rej(new Error('timed out')), 20000))]);
    results.push(`✅ ${name}`);
  } catch (e) {
    results.push(`❌ ${name}: ${e.message}`);
  }
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 5'] });
// Never really leave during tests: answer the quick-exit site locally.
await ctx.route('https://weather.gc.ca/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<title>Weather</title>weather' }));
const page = await ctx.newPage();

try {
  await step('language picker lists English and opens home', async () => {
    await page.goto(BASE);
    await page.screenshot({ path: `${shots}/${mode}-01-picker.png` });
    await page.getByRole('link', { name: 'English' }).click();
    await page.waitForURL(`${BASE}en/`);
    assert.equal(await page.locator('html').getAttribute('lang'), 'en');
    await page.screenshot({ path: `${shots}/${mode}-02-home.png`, fullPage: true });
  });

  await step('saved language: picker redirects to it', async () => {
    await page.goto(BASE);
    await page.waitForURL(`${BASE}en/`);
  });

  await step('Help now opens the dialog with Medical and Safety choices', async () => {
    await page.getByRole('link', { name: 'Help now' }).click();
    const dlg = page.locator('dialog#help');
    assert.ok(await dlg.isVisible());
    assert.ok(await dlg.getByRole('button', { name: /Medical help/ }).isVisible());
    assert.ok(await dlg.getByRole('button', { name: /Safety & support/ }).isVisible());
    assert.equal(page.url(), `${BASE}en/`, 'opening Help must not change the URL');
  });

  await step(`Medical view shows ${mode === 'preview' ? 'the draft content' : 'the 911 fallback'}`, async () => {
    await page.getByRole('button', { name: /Medical help/ }).click();
    const view = page.locator('[data-view="medical"]');
    const text = await view.innerText();
    if (mode === 'preview') assert.match(text, /Call 911 now/);
    else assert.match(text, /In an emergency, call 911/);
    await page.screenshot({ path: `${shots}/${mode}-03-medical.png` });
    await page.getByRole('button', { name: /Back/ }).click();
  });

  await step('Safety view: no URL change, no storage written, quick exit replaces history', async () => {
    const before = await page.evaluate(() => ({ n: history.length, ls: JSON.stringify(localStorage) }));
    await page.getByRole('button', { name: /Safety & support/ }).click();
    assert.ok(await page.getByRole('button', { name: 'Quick exit' }).isVisible());
    assert.equal(page.url(), `${BASE}en/`);
    const during = await page.evaluate(() => ({ n: history.length, ls: JSON.stringify(localStorage) }));
    assert.deepEqual(during, before, 'Safety view must not add history or storage');
    await page.screenshot({ path: `${shots}/${mode}-04-safety.png` });
    await page.getByRole('button', { name: 'Quick exit' }).click();
    await page.waitForURL('https://weather.gc.ca/**');
    assert.equal(await page.evaluate(() => history.length), before.n, 'quick exit must replace, not add, a history entry');
  });

  await step('Esc in Safety view is a quick exit', async () => {
    await page.goto(`${BASE}en/about/`);
    await page.getByRole('link', { name: 'Help now' }).click();
    await page.getByRole('button', { name: /Safety & support/ }).click();
    await page.keyboard.press('Escape');
    await page.waitForURL('https://weather.gc.ca/**');
  });

  await step('Simple help menu setting hides Safety & support', async () => {
    await page.goto(`${BASE}en/my-data/`);
    await page.getByLabel(/Simple help menu/).check();
    await page.reload();
    await page.getByRole('link', { name: 'Help now' }).click();
    assert.equal(await page.getByRole('button', { name: /Safety & support/ }).isVisible(), false);
    await page.keyboard.press('Escape');
  });

  await step('Clear all my data empties storage', async () => {
    await page.goto(`${BASE}en/my-data/`);
    await page.evaluate(() => localStorage.setItem('test', '1'));
    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'Clear all my data' }).click();
    await page.getByText(/Your data was deleted/).waitFor();
    assert.equal(await page.evaluate(() => localStorage.length), 0);
  });

  if (mode === 'preview') {
    await step('TODO-VERIFY shown highlighted in preview', async () => {
      await page.goto(`${BASE}en/clinic/`);
      assert.ok((await page.locator('mark.todo').count()) > 0);
      await page.screenshot({ path: `${shots}/${mode}-05-clinic.png`, fullPage: true });
    });
    await step('Arabic (RTL test language) renders right-to-left', async () => {
      await page.goto(`${BASE}ar/path/`);
      assert.equal(await page.locator('html').getAttribute('dir'), 'rtl');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      assert.equal(overflow, false, 'no horizontal scroll');
      await page.screenshot({ path: `${shots}/${mode}-06-rtl.png`, fullPage: true });
    });
  } else {
    await step('No TODO-VERIFY values or drafts leak into production', async () => {
      await page.goto(`${BASE}en/clinic/`);
      assert.equal(await page.locator('mark.todo').count(), 0);
      assert.ok((await page.locator('.ask-staff').count()) > 0);
      const r = await page.goto(`${BASE}en/path/`);
      assert.equal(r.status(), 404, 'unreviewed page must not exist in production');
      const ar = await page.goto(`${BASE}ar/`);
      assert.equal(ar.status(), 404, 'draft language must not exist in production');
    });
  }

  await step('works offline after first visit', async () => {
    await page.goto(`${BASE}en/`);
    await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready;
      return !!reg.active;
    });
    await page.reload(); // let the service worker control the page
    await ctx.setOffline(true);
    await page.goto(`${BASE}en/about/`);
    assert.match(await page.locator('h1').innerText(), /About this app/);
    await ctx.setOffline(false);
  });
} finally {
  await browser.close();
  server.close();
}

console.log(`\n${mode} smoke test\n` + results.join('\n'));
process.exit(results.some((r) => r.startsWith('❌')) ? 1 : 0);
