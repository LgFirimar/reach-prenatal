#!/usr/bin/env node
// Content checks, run in CI before every build. Exit code 1 = must fix.
//   - languages.json is valid; live languages have UI strings
//   - English pages have a version; translations say which version they translate
//   - safety-critical translations are not out of date
//   - every :data[...] key exists
//   - report: all TODO-VERIFY items, stale translations, reading level (warnings)
import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import YAML from 'yaml';
import { CONTENT, ROOT, SOURCE_LANG, allLanguages, siteData, dataEntry, resolvePage } from '../src/lib/site.mjs';
import { fleschKincaidGrade, stripMarkdown } from '../src/lib/readability.mjs';

const errors = [];
const warnings = [];
const todos = [];
const stale = [];
const grades = [];

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.md') ? [p] : [];
  });
}

function parse(file) {
  const src = readFileSync(file, 'utf8');
  const m = src.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) {
    errors.push(`${rel(file)}: missing frontmatter (--- block at the top).`);
    return { data: {}, body: src };
  }
  return { data: YAML.parse(m[1]) ?? {}, body: m[2], bodyLine: m[1].split('\n').length + 3 };
}
const rel = (p) => relative(ROOT, p);

// 1. Languages
const langs = allLanguages();
const slugs = new Set();
for (const l of langs) {
  if (!l.code || !l.slug || !l.name) errors.push(`languages.json: every language needs code, slug and name (${JSON.stringify(l)}).`);
  if (slugs.has(l.slug)) errors.push(`languages.json: slug "${l.slug}" is used twice.`);
  slugs.add(l.slug);
  if (!['ltr', 'rtl'].includes(l.dir)) errors.push(`languages.json: "${l.slug}" dir must be ltr or rtl.`);
  if (!['live', 'draft'].includes(l.status)) errors.push(`languages.json: "${l.slug}" status must be live or draft.`);
  if (l.status === 'live' && l.slug !== SOURCE_LANG && !existsSync(join(CONTENT, 'ui', `${l.slug}.json`)))
    errors.push(`languages.json: "${l.slug}" is live but content/ui/${l.slug}.json is missing.`);
}

// 2. Pages
const pagesDir = join(CONTENT, 'pages');
const pages = new Map(); // lang -> slug -> {file, data, body}
for (const file of walk(pagesDir)) {
  const [lang, ...rest] = relative(pagesDir, file).replace(/\.md$/, '').split(/[\\/]/);
  if (!slugs.has(lang)) errors.push(`${rel(file)}: folder "${lang}" is not a language in languages.json.`);
  if (!pages.has(lang)) pages.set(lang, new Map());
  pages.get(lang).set(rest.join('/'), { file, ...parse(file) });
}

const en = pages.get(SOURCE_LANG) ?? new Map();
for (const [slug, p] of en) {
  if (!Number.isInteger(p.data.version)) errors.push(`${rel(p.file)}: English pages need "version: 1" (a whole number).`);
}

for (const [lang, map] of pages) {
  if (lang === SOURCE_LANG) continue;
  for (const [slug, p] of map) {
    const source = en.get(slug);
    if (!source) {
      errors.push(`${rel(p.file)}: no English page with the same path.`);
      continue;
    }
    if (!Number.isInteger(p.data.source_version))
      errors.push(`${rel(p.file)}: translations need "source_version" (the English version they translate).`);
    const r = resolvePage(source.data, p.data, 'production');
    if (r.blocked)
      errors.push(
        `${rel(p.file)}: SAFETY-CRITICAL page is out of date (English v${source.data.version}, translation v${p.data.source_version ?? 0}). ` +
          `Update it, or add "fallback_to_english: true" to show English until it is updated.`,
      );
    else if ((p.data.source_version ?? 0) < source.data.version)
      stale.push(`${lang}/${slug}: translation of v${p.data.source_version}, English is v${source.data.version}`);
  }
}

// 3. Directives: TODO-VERIFY items and data keys
const data = siteData();
for (const [lang, map] of pages) {
  for (const [slug, p] of map) {
    p.body.split('\n').forEach((line, i) => {
      const where = `${rel(p.file)}:${(p.bodyLine ?? 1) + i}`;
      for (const m of line.matchAll(/:todo\[([^\]]*)\]/g)) todos.push({ where, text: m[1], lang });
      for (const m of line.matchAll(/:data\[([^\]]*)\]/g)) {
        const e = dataEntry(data, m[1].trim());
        if (!e) errors.push(`${where}: unknown data key "${m[1]}".`);
        else if (!e.verified && lang === SOURCE_LANG) todos.push({ where, text: `${m[1]}${e.value ? ` (proposed: ${e.value})` : ''}`, lang, data: true });
      }
    });
  }
}
for (const [file, entries] of Object.entries(data)) {
  for (const [key, e] of Object.entries(entries)) {
    if (typeof e !== 'object' || e === null || !('value' in e) || typeof e.verified !== 'boolean')
      errors.push(`content/data/${file}.yaml: "${key}" must look like { value: "...", verified: false }.`);
  }
}

// 4. Reading level (English, warning only)
for (const [slug, p] of en) {
  const g = fleschKincaidGrade(stripMarkdown(p.body));
  grades.push({ slug, g });
  if (g > 7) warnings.push(`${rel(p.file)}: reading level about grade ${g.toFixed(1)} (target 6–7). Try shorter sentences and words.`);
}

// Report
const uniqTodos = todos.filter((t) => t.lang === SOURCE_LANG);
const lines = [
  '# Content report',
  '',
  `## TODO-VERIFY items in English pages (${uniqTodos.length})`,
  '',
  ...uniqTodos.map((t) => `- [ ] \`${t.where}\`: ${t.text || '(no text)'}${t.data ? ' _(data value)_' : ''}`),
  '',
  `## Out-of-date translations (${stale.length})`,
  '',
  ...(stale.length ? stale.map((s) => `- ${s}`) : ['None.']),
  '',
  '## Reading level (English, grade)',
  '',
  ...grades.map(({ slug, g }) => `- ${slug || 'index'}: ${g.toFixed(1)}${g > 7 ? ' ⚠️' : ''}`),
  '',
];
mkdirSync(join(ROOT, 'reports'), { recursive: true });
writeFileSync(join(ROOT, 'reports', 'content-report.md'), lines.join('\n'));
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n'));

for (const w of warnings) console.warn('⚠️  ' + w);
for (const e of errors) console.error('❌ ' + e);
console.log(`\n${uniqTodos.length} TODO-VERIFY items, ${stale.length} stale translations, ${warnings.length} warnings, ${errors.length} errors.`);
console.log('Full report: reports/content-report.md');
process.exit(errors.length ? 1 : 0);
