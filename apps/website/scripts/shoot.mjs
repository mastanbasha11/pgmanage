// scripts/shoot.mjs — the product-image pipeline.
//
// Renders the two app mockups in headless Chromium at deviceScaleFactor 3,
// crops each `.phone` device, and writes AVIF + WebP + PNG (via sharp) to
// public/media/, plus a manifest.json of intrinsic sizes for the components.
//
// Every product image on the site comes from here. Re-run when the mockups
// change:  npm run shoot   (once:  npm run shots:install)

import { chromium } from 'playwright';
import sharp from 'sharp';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const OUT = join(ROOT, 'public', 'media');

// Source mockups now live in the repo (mockups/) so the pipeline is
// reproducible anywhere. Override with SHOOT_SRC to point elsewhere.
const SRC = process.env.SHOOT_SRC || join(ROOT, 'mockups');

// Curated, stable slugs in the SCREENS order of each mockup. Deterministic
// so the site can reference an image by name and it never drifts when a
// mockup's label wording changes. `alt` is the human caption.
const APPS = [
  {
    file: 'owner-app.html',
    prefix: 'owner',
    screens: [
      ['home', 'Owner app — home'],
      ['collect-rent', 'Owner app — collecting rent in two taps'],
      ['rent-payments', 'Owner app — rent and payments with ageing buckets'],
      ['tenant-ledger', 'Owner app — a resident’s ledger'],
      ['vacancies', 'Owner app — vacancies with whole-room detection'],
      ['bookings', 'Owner app — bookings and the unassigned queue'],
      ['expenses', 'Owner app — expenses with receipt capture'],
      ['leads', 'Owner app — the leads pipeline'],
      ['lead-bed-match', 'Owner app — matching a lead to a bed'],
      ['roi-payback', 'Owner app — ROI payback per room type'],
      ['messages', 'Owner app — WhatsApp message sequences'],
      ['audit', 'Owner app — the audit log, before and after'],
      ['more', 'Owner app — the app hub'],
      ['setup-wizard', 'Owner app — the bulk room setup wizard'],
    ],
  },
  {
    file: 'resident-app.html',
    prefix: 'resident',
    screens: [
      ['home', 'Resident app — today digest'],
      ['payments', 'Resident app — rent and payments'],
      ['food', 'Resident app — the food menu'],
      ['my-stay', 'Resident app — my stay'],
      ['get-help', 'Resident app — get help'],
      ['my-requests', 'Resident app — my requests'],
      ['move-out', 'Resident app — move out'],
      ['refer', 'Resident app — refer a friend'],
      ['more', 'Resident app — profile'],
      ['vehicle', 'Resident app — vehicle details'],
    ],
  },
];

async function main() {
  for (const a of APPS) {
    const p = join(SRC, a.file);
    if (!existsSync(p)) {
      console.error(`\n  ✗ source mockup not found: ${p}`);
      console.error('    Set SHOOT_SRC to the folder holding the mockups.\n');
      process.exit(1);
    }
  }

  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 3 });
  const manifest = {};
  let count = 0;

  for (const app of APPS) {
    const url = pathToFileURL(join(SRC, app.file)).href;
    await page.goto(url, { waitUntil: 'networkidle' });
    // The boards are JS-rendered — wait for phones to exist, then settle.
    await page.waitForSelector('.phone', { timeout: 15000 });
    await page.waitForTimeout(400);

    const phones = page.locator('.phone');
    const n = await phones.count();
    console.log(`\n  ${app.prefix}: ${n} screens`);

    for (let i = 0; i < n; i++) {
      const phone = phones.nth(i);
      const curated = app.screens?.[i];
      const [slugPart, alt] = curated ?? [`screen-${i + 1}`, `${app.prefix} screen ${i + 1}`];
      const name = `${app.prefix}-${slugPart}`;
      const png = await phone.screenshot({ type: 'png' });

      const meta = await sharp(png).metadata();
      const base = join(OUT, name);
      await Promise.all([
        sharp(png).avif({ quality: 62, effort: 6 }).toFile(`${base}.avif`),
        sharp(png).webp({ quality: 80 }).toFile(`${base}.webp`),
        // A modest PNG fallback (not the raw 3× buffer) keeps bytes sane.
        sharp(png)
          .resize({ width: Math.round(meta.width / 1.5) })
          .png({ compressionLevel: 9, palette: true })
          .toFile(`${base}.png`),
      ]);

      manifest[name] = {
        app: app.prefix,
        alt,
        // intrinsic CSS size = pixel size / DPR, used for width/height attrs
        w: Math.round(meta.width / 3),
        h: Math.round(meta.height / 3),
      };
      count++;
      console.log(`    ✓ ${name}  (${manifest[name].w}×${manifest[name].h})`);
    }
  }

  await browser.close();
  await writeFile(
    join(OUT, 'manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n',
  );
  console.log(`\n  Done — ${count} screens → public/media/ (+ manifest.json)\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
