#!/usr/bin/env node
// Size budget for low-end phones (PLAN.md §1). Run after `npm run build`.
// Counts gzip size of the JS and CSS each page loads (inline + external).
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const DIST = 'dist';
const BUDGET = { js: 15 * 1024, css: 25 * 1024 }; // per content page, gzip
const TOTAL = 600 * 1024; // whole precache for one language, gzip (approx.)

const gz = (s) => gzipSync(s).length;
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const base = '/reach-prenatal/';
const read = (url) => {
  const p = join(DIST, url.startsWith(base) ? url.slice(base.length) : url.replace(/^\//, ''));
  return existsSync(p) ? readFileSync(p) : Buffer.alloc(0);
};

let fail = false;
const rows = [];
for (const file of walk(DIST).filter((f) => f.endsWith('.html'))) {
  const html = readFileSync(file, 'utf8');
  let js = 0;
  let css = 0;
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    const src = m[1].match(/src="([^"]+)"/)?.[1];
    js += gz(src ? read(src) : m[2]);
  }
  for (const m of html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g)) css += gz(read(m[1]));
  for (const m of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)) css += gz(m[1]);
  const over = js > BUDGET.js || css > BUDGET.css;
  if (over) fail = true;
  rows.push(`${over ? '❌' : '✅'} ${file.slice(DIST.length)}  js ${(js / 1024).toFixed(1)} KB  css ${(css / 1024).toFixed(1)} KB`);
}
const total = walk(DIST)
  .filter((f) => /\.(html|css|js|svg|ico|png|webmanifest)$/.test(f) && !/\/(es|pt-br|vi|ar)\//.test(f))
  .reduce((n, f) => n + (f.endsWith('.png') ? statSync(f).size : gz(readFileSync(f))), 0);
if (total > TOTAL) fail = true;
console.log(rows.join('\n'));
console.log(`${total > TOTAL ? '❌' : '✅'} English site total ≈ ${(total / 1024).toFixed(0)} KB (budget ${TOTAL / 1024} KB)`);
process.exit(fail ? 1 : 0);
