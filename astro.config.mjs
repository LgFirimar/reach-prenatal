// @ts-check
import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';
import { AstroPWAIntegration as AstroPWA } from '@vite-pwa/astro';
import remarkDirective from 'remark-directive';
import remarkReach from './src/lib/remark-reach.mjs';
import { isPreview } from './src/lib/site.mjs';

// GitHub Pages serves the site at https://<user>.github.io/reach-prenatal/.
// Set SITE_BASE=/ for a custom domain or a Cloudflare preview.
const base = process.env.SITE_BASE ?? '/reach-prenatal/';

export default defineConfig({
  site: process.env.SITE_URL ?? 'https://lgfirimar.github.io',
  base,
  trailingSlash: 'always',
  output: 'static',
  // Separate caches: rendered Markdown differs between preview and production (TODO-VERIFY values).
  cacheDir: isPreview() ? './node_modules/.astro-preview' : './node_modules/.astro',
  build: { inlineStylesheets: 'auto' },
  markdown: { remarkPlugins: [remarkDirective, remarkReach] },
  integrations: [
    preact(),
    AstroPWA({
      registerType: 'autoUpdate',
      injectRegister: 'script-defer',
      base,
      scope: base,
      manifest: {
        name: 'REACH Pregnancy',
        short_name: 'REACH',
        description: 'Pregnancy care information for REACH clinic patients',
        theme_color: '#1d4e89',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: base,
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      generateSW: {
        // MPA: every page is its own HTML file, all precached for offline use.
        // When more languages go live, switch other languages to runtime caching (PLAN.md §1).
        globPatterns: ['**/*.{html,css,js,svg,ico}'],
        navigateFallback: null,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  vite: { define: { __REACH_PREVIEW__: JSON.stringify(isPreview()) } },
});
