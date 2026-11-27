# REACH Prenatal — patient app

Static, offline, multilingual PWA for REACH clinic patients (no OHIP). Plan: `PLAN.md`. Editing guide: `CONTRIBUTING-CONTENT.md`.

## Stack
Astro 7 (static) + Preact islands (none yet), @vite-pwa/astro, remark-directive. GitHub Pages at `/reach-prenatal/`.

## Layout
- `content/` — all text and data (Markdown, YAML, JSON). Never hardcode clinical/admin facts in components.
- `src/lib/site.mjs` — framework-free helpers (languages, UI strings, data, page resolution). Used by Astro, scripts and tests.
- `src/lib/remark-reach.mjs` — `:todo[...]`, `:data[key]`, `:::box{tone}` directives.
- `src/lib/pages.mjs` — Astro-side routing per language and mode.
- `src/components/HelpDialog.astro` — Help now overlay + Safety & support (no URL, quick exit).
- `scripts/check-content.mjs`, `scripts/check-budget.mjs`, `tests/*.test.mjs`, `tests/e2e/smoke.mjs`.

## Rules
- Two modes: `REACH_MODE=preview` shows drafts/TODOs; production never shows unverified values or `needs_clinical_review` pages.
- Never invent clinic facts: use `:todo[...]` or `verified: false` data.
- Safety & support content must never get a URL, storage, or appear in forms/summaries.
- CSS: logical properties only (RTL). Tap targets ≥ 48px. Keep page JS tiny (budget in check-budget).
- No patient data leaves the device; no analytics on form/safety parts.

## Commands
`npm run check:content && npm test && npm run build:preview && npm run test:e2e:preview && npm run build && npm run check:budget && npm run test:e2e`
