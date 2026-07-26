# Deploying the PGManage marketing site

Static Astro build → **Cloudflare Pages**. One serverless function (the demo form) rides along
automatically from `functions/`.

## First-time local setup

```bash
cd apps/website
npm install
npm run shots:install     # one-time: Playwright Chromium, for screenshots
npm run media             # generate product screenshots + OG images (needs mockups/)
npm run build             # → dist/
```

`public/media/` and `public/og/` are gitignored and rebuilt by `npm run media`. The source
mockups live in `mockups/` (committed), so this works on any checkout.

## Deploy to Cloudflare Pages (gives a URL)

You need a Cloudflare account (free). Two one-time auth options:

**A. Interactive login (simplest)**
```bash
cd apps/website
npx wrangler login                       # opens a browser once
npm run media && npm run deploy          # builds + uploads dist/ + functions/
```
`npm run deploy` = `astro build && wrangler pages deploy dist --project-name pgmanage-site`.
First run creates the project and prints a `https://pgmanage-site.pages.dev` URL. Re-running
deploys a new version to the same URL.

**B. CI / headless (API token)**
Create a token at dash.cloudflare.com → My Profile → API Tokens → *Cloudflare Pages: Edit*, then:
```bash
export CLOUDFLARE_API_TOKEN=xxxx
export CLOUDFLARE_ACCOUNT_ID=xxxx
npm run media && npm run deploy
```

## Custom domain

In the Cloudflare Pages project → **Custom domains**, add e.g. `www.pgmanage.in` or a marketing
subdomain. (The apex `pgmanage.in` currently serves the tenant app on EC2 — do **not** repoint it
at Pages without deciding the app's new home first.) Cloudflare issues TLS automatically.

## The demo form

`functions/api/demo.ts` handles `POST /api/demo`: validates, honeypot, then 303-redirects to
`/demo/thanks` (works with JS off). It currently just logs the lead — **wire the real sink**
(forward to the PGManage leads API or email) where the `TODO(owner)` comment is.

## Analytics (optional)

Off by default. To enable Plausible, set at build time:
```
PUBLIC_PLAUSIBLE_SRC=https://plausible.io/js/script.js
PUBLIC_PLAUSIBLE_DOMAIN=pgmanage.in
```

## Regenerating screenshots

Edit a mockup in `mockups/`, then `npm run shoot` (or `npm run media` for screenshots + OG). The
site references screenshots by stable slug via `public/media/manifest.json`.
