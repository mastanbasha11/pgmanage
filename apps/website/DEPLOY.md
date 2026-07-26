# Deploying the PGManage marketing site

## As deployed (LIVE) — EC2 + Caddy, 3-host split

The site is live on the production EC2 box (`13.126.139.161`), served by the **same Caddy** as the
app, under a hostname split:

| Host | Serves |
|---|---|
| `pgmanage.in` | this marketing site (static, from `/opt/marketing/dist`) + `/api` passthrough |
| `app.pgmanage.in` | owner/manager app (the `webdist` SPA) |
| `my.pgmanage.in` | resident portal (same SPA, lands on `/portal`) |

Config lives in `infrastructure/prod/Caddyfile` (4 vhosts) and `docker-compose.prod.yml` (a
`/opt/marketing/dist:/srv/marketing:ro` mount on caddy). Backend env gained the new hosts
(`ALLOWED_HOSTS`, `CORS_ORIGINS`, `APP_BASE_URL=https://app.pgmanage.in`).

**⚠️ Config drift:** during cutover these two tracked files + the env were edited **directly on the
server**. Merge branch `feat/marketing-website` into `main` so a future `git pull` deploy doesn't
revert them. A pre-cutover backup is at `/opt/pgmanage/_cutover-backup-<ts>/` (Caddyfile, compose,
`.env`) for instant rollback.

### Re-deploy the marketing site after a content change
```bash
cd apps/website
npm run media && npm run build                     # regenerate screenshots + build
rsync -az --delete -e "ssh -i ~/.ssh/pgmanage_prod_ed25519" \
  dist/ ubuntu@13.126.139.161:/tmp/marketing-dist/
ssh -i ~/.ssh/pgmanage_prod_ed25519 ubuntu@13.126.139.161 \
  'sudo rsync -a --delete /tmp/marketing-dist/ /opt/marketing/dist/'
```
No Caddy restart needed — it file-serves the directory live. (The sandbox's outbound IP must be
whitelisted in the EC2 security group for SSH.)

### Follow-ups (optional, nothing breaks without them)
- Re-point the Meta WhatsApp + Razorpay webhook URLs from `pgmanage.in/api/...` to
  `app.pgmanage.in/api/...` when convenient (apex still proxies `/api`, so both work).
- Existing logged-in users had sessions on `pgmanage.in`; they log in once at `app.pgmanage.in`.

---

## Alternative — Cloudflare Pages

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
