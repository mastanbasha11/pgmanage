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
      // Keep the sitemap in lock-step with what's indexable. Google's guidance
      // is to NOT list noindex URLs in a sitemap, so every page that renders a
      // `noindex` robots meta (see Base.astro `noindex` prop) is excluded here.
      // Keep this list in sync with those pages: styleguide, privacy, terms,
      // delete-account, demo/thanks.
      filter: (page) =>
        ![
          '/styleguide',
          '/privacy',
          '/terms',
          '/delete-account',
          '/demo/thanks',
        ].some((p) => new URL(page).pathname.replace(/\/$/, '') === p),
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
