import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// Static output. The one dynamic surface — the demo POST — is a Cloudflare
// Pages Function under /functions, so the site itself stays fully static and
// deploys to Cloudflare Pages with zero server runtime.
export default defineConfig({
  site: 'https://pgmanage.in',
  output: 'static',
  trailingSlash: 'ignore',
  integrations: [
    sitemap({
      // /styleguide is noindex + excluded from search
      filter: (page) => !page.includes('/styleguide'),
    }),
  ],
  image: {
    // AVIF with WebP fallback is handled per-<Image>; sharp is the service.
    service: { entrypoint: 'astro/assets/services/sharp' },
  },
  build: {
    inlineStylesheets: 'always',
  },
  devToolbar: { enabled: false },
});
