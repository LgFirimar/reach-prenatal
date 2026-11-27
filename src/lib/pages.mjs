// Astro-side page resolution: which pages exist in which language, in this build mode.
import { getCollection } from 'astro:content';
import { enabledLanguages, resolvePage, splitId, SOURCE_LANG } from './site.mjs';

// Pages that never get their own URL (shown only inside the Help now overlay).
export const NO_URL = new Set(['help/safety']);

let cache;
async function index() {
  if (cache) return cache;
  const all = await getCollection('pages');
  const byLang = new Map();
  for (const e of all) {
    const { lang, slug } = splitId(e.id);
    if (!byLang.has(lang)) byLang.set(lang, new Map());
    byLang.get(lang).set(slug, e);
  }
  cache = byLang;
  return cache;
}

/** Resolve one page for a language. Returns { entry, english, status } or null when unpublished. */
export async function pageFor(langSlug, slug) {
  const byLang = await index();
  const en = byLang.get(SOURCE_LANG)?.get(slug);
  const tr = langSlug === SOURCE_LANG ? undefined : byLang.get(langSlug)?.get(slug);
  const r = resolvePage(en?.data, tr?.data);
  if (r.blocked) {
    throw new Error(
      `Safety-critical page "${slug}" in "${langSlug}" is out of date (English v${en.data.version}, ` +
        `translation of v${tr.data.source_version ?? 0}). Update the translation, or set fallback_to_english: true.`,
    );
  }
  if (!r.show) return null;
  if (langSlug === SOURCE_LANG) return { entry: en, english: true, status: 'ok' };
  if (r.show === 'english') return { entry: en, english: true, status: 'missing' };
  return { entry: tr, english: false, status: r.stale ? 'stale' : 'ok' };
}

/** All published { lang, slug } pairs that get a URL. */
export async function allRoutes() {
  const byLang = await index();
  const slugs = [...(byLang.get(SOURCE_LANG)?.keys() ?? [])].filter((s) => s !== '' && !NO_URL.has(s));
  const out = [];
  for (const lang of enabledLanguages()) {
    for (const slug of slugs) {
      const p = await pageFor(lang.slug, slug);
      if (p) out.push({ lang, slug, page: p });
    }
  }
  return out;
}

export async function publishedSlugs(langSlug) {
  return new Set((await allRoutes()).filter((r) => r.lang.slug === langSlug).map((r) => r.slug));
}
