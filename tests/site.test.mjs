import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkDirective from 'remark-directive';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import remarkReach from '../src/lib/remark-reach.mjs';
import { resolvePage, splitId, enabledLanguages } from '../src/lib/site.mjs';

const en = (o = {}) => ({ version: 2, needs_clinical_review: false, ...o });

test('resolvePage: English page, reviewed → shown', () => {
  assert.equal(resolvePage(en(), undefined, 'production').show, 'english');
});
test('resolvePage: unreviewed page hidden in production, shown in preview', () => {
  assert.equal(resolvePage(en({ needs_clinical_review: true }), undefined, 'production').show, null);
  assert.equal(resolvePage(en({ needs_clinical_review: true }), undefined, 'preview').show, 'english');
});
test('resolvePage: up-to-date translation shown', () => {
  assert.deepEqual(resolvePage(en(), { source_version: 2 }, 'production'), { show: 'translation', stale: false });
});
test('resolvePage: stale translation shown with stale flag', () => {
  assert.deepEqual(resolvePage(en(), { source_version: 1 }, 'production'), { show: 'translation', stale: true });
});
test('resolvePage: stale safety-critical translation blocks the build', () => {
  assert.equal(resolvePage(en({ safety_critical: true }), { source_version: 1 }, 'production').blocked, true);
});
test('resolvePage: stale safety-critical with fallback_to_english → English', () => {
  assert.equal(resolvePage(en({ safety_critical: true }), { source_version: 1, fallback_to_english: true }).show, 'english');
});
test('resolvePage: unreviewed translation falls back to English in production', () => {
  assert.equal(resolvePage(en(), { source_version: 2, needs_clinical_review: true }, 'production').show, 'english');
});
test('splitId', () => {
  assert.deepEqual(splitId('en/path/index'), { lang: 'en', slug: 'path' });
  assert.deepEqual(splitId('es/about'), { lang: 'es', slug: 'about' });
  assert.deepEqual(splitId('en/index'), { lang: 'en', slug: '' });
});
test('enabledLanguages: drafts only in preview', () => {
  const prod = enabledLanguages('production').map((l) => l.slug);
  const prev = enabledLanguages('preview').map((l) => l.slug);
  assert.ok(prod.includes('en'));
  assert.ok(!prod.includes('ar'));
  assert.ok(prev.includes('ar'));
});

async function md(src, mode) {
  const old = process.env.REACH_MODE;
  process.env.REACH_MODE = mode;
  try {
    const f = await unified().use(remarkParse).use(remarkDirective).use(remarkReach).use(remarkRehype).use(rehypeStringify)
      .process({ value: src, path: 'content/pages/en/x.md' });
    return String(f);
  } finally {
    process.env.REACH_MODE = old;
  }
}

test('TODO-VERIFY never shows the guessed value in production', async () => {
  const html = await md('Hours: :todo[Tue 9-4]', 'production');
  assert.ok(!html.includes('Tue 9-4'));
  assert.ok(html.includes('Ask clinic staff'));
});
test('TODO-VERIFY is highlighted in preview', async () => {
  const html = await md('Hours: :todo[Tue 9-4]', 'preview');
  assert.match(html, /<mark class="todo"[^>]*>Tue 9-4/);
  assert.ok(html.includes('TODO-VERIFY'));
});
test('verified phone data renders as a tel link', async () => {
  const html = await md('Call :data[emergency.911]', 'production');
  assert.ok(html.includes('href="tel:911"'));
});
test('unverified data value is hidden in production', async () => {
  const html = await md('Call :data[emergency.awhl]', 'production');
  assert.ok(!html.includes('863'));
  assert.ok(html.includes('Ask clinic staff'));
});
test('unknown text directives are left as text (e.g. "10:30")', async () => {
  const html = await md('Note:thing and 10:30', 'production');
  assert.ok(html.includes('Note:thing'));
  assert.ok(html.includes('10:30'));
});
test('box directive renders a coloured section', async () => {
  const html = await md(':::box{tone="red"}\nHi\n:::', 'production');
  assert.match(html, /<section class="box box-red">/);
});
