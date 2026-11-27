// Shared, framework-free helpers. Used by Astro pages, the remark plugin,
// and the Node check scripts, so keep this file plain JavaScript.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import YAML from 'yaml';

export const ROOT = process.cwd();
export const CONTENT = join(ROOT, 'content');
export const SOURCE_LANG = 'en';

/** 'preview' shows drafts, unreviewed pages and TODO-VERIFY values. Anything else = production. */
export function buildMode() {
  return process.env.REACH_MODE === 'preview' ? 'preview' : 'production';
}
export const isPreview = () => buildMode() === 'preview';

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

export function allLanguages() {
  return readJson(join(CONTENT, 'languages.json')).languages;
}

/** Languages built in this mode: live always, draft only in preview. */
export function enabledLanguages(mode = buildMode()) {
  return allLanguages().filter((l) => l.status === 'live' || (mode === 'preview' && l.status === 'draft'));
}

export function languageBySlug(slug) {
  return allLanguages().find((l) => l.slug === slug);
}

/** UI strings for a language, falling back to English key by key. */
export function uiStrings(slug) {
  const en = readJson(join(CONTENT, 'ui', `${SOURCE_LANG}.json`));
  const p = join(CONTENT, 'ui', `${slug}.json`);
  const own = slug !== SOURCE_LANG && existsSync(p) ? readJson(p) : {};
  return { ...en, ...own };
}

/** All data/*.yaml files merged as { file: { key: entry } }. */
export function siteData() {
  const dir = join(CONTENT, 'data');
  const out = {};
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.yaml')) continue;
    out[f.replace(/\.yaml$/, '')] = YAML.parse(readFileSync(join(dir, f), 'utf8')) ?? {};
  }
  return out;
}

/** Look up "clinic.phone" → entry object, or undefined. */
export function dataEntry(data, key) {
  const [file, ...rest] = key.split('.');
  return data[file]?.[rest.join('.')];
}

export function sources() {
  return YAML.parse(readFileSync(join(CONTENT, 'sources.yaml'), 'utf8')) ?? {};
}

/**
 * Decide what to show for one page in one language.
 * en / tr are frontmatter objects (tr may be undefined).
 * Returns { show: 'translation' | 'english' | null, stale, missing, blocked }.
 *  - show null: the page is not published in this mode.
 *  - blocked: a safety-critical translation is stale (the build must fail).
 */
export function resolvePage(en, tr, mode = buildMode()) {
  const preview = mode === 'preview';
  if (!en) return { show: null };
  if (en.needs_clinical_review && !preview) return { show: null };
  if (!tr) return { show: 'english', missing: true };
  const stale = (tr.source_version ?? 0) < en.version;
  if (stale && en.safety_critical) {
    // Emergency text must never be out of date. Falling back to English is allowed
    // only when the translation explicitly says so.
    if (tr.fallback_to_english) return { show: 'english', missing: true };
    return { show: null, stale: true, blocked: true };
  }
  if (tr.needs_clinical_review && !preview) return { show: 'english', missing: true };
  return { show: 'translation', stale };
}

/** "en/path/index" → { lang: "en", slug: "path" } */
export function splitId(id) {
  const [lang, ...rest] = id.split('/');
  let slug = rest.join('/');
  if (slug === 'index') slug = '';
  slug = slug.replace(/\/index$/, '');
  return { lang, slug };
}
