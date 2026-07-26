// scripts/og.mjs — generate per-page Open Graph images (1200×630) in the site's
// own type and palette. Rendered with Playwright so the real fonts are used,
// then flattened to PNG. Not a screenshot of the page — a composed card.

import { chromium } from 'playwright';
import sharp from 'sharp';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const OUT = join(ROOT, 'public', 'og');

const CARDS = [
  ['default', 'PGManage', 'Rent, beds and leads for your PG — on one screen.'],
  ['home', 'Ninety-four percent of the rent, collected by the fourth.', 'The owner app that collects on WhatsApp and keeps a name against the cash.'],
  ['pricing', 'Priced per bed, from ₹25 a month.', '30-day free trial. No card. Free migration from Excel.'],
  ['product', 'Organised around your month, not the modules.', 'Collect the rent · fill the beds · know the money.'],
  ['product-rent-collection', 'Rent collection that leaves a trail.', 'Two taps, a WhatsApp receipt, a name against every rupee of cash.'],
  ['product-occupancy', 'Fill the bed before it empties.', 'Notice tracking, whole-room detection, lead-to-bed matching.'],
  ['product-money', 'Know which room made the money.', 'Expense approvals, ROI per room type, an audit log you can trust.'],
  ['about', 'Built by someone who had to collect the rent.', 'Made inside a 121-bed co-living property in Hyderabad, and run on it daily.'],
  ['security', 'You’re storing residents’ ID. Here’s how we hold it.', 'Hosted in India, encrypted, isolated per property, fully audited.'],
  ['demo', 'Book a demo on your building.', 'We load your beds and residents before the call. No card.'],
];

const b64 = async (p) => (await readFile(p)).toString('base64');

const template = (title, sub, publicSans, newsreader) => `<!doctype html><html><head><meta charset="utf-8"/>
<style>
@font-face{font-family:'PS';src:url(data:font/woff2;base64,${publicSans}) format('woff2');font-weight:100 900}
@font-face{font-family:'NR';src:url(data:font/woff2;base64,${newsreader}) format('woff2');font-weight:200 800}
*{margin:0;box-sizing:border-box}
.card{width:1200px;height:630px;background:#1C443A;color:#F2F6F3;
  padding:76px 84px;display:flex;flex-direction:column;justify-content:space-between;
  position:relative;overflow:hidden;font-family:'PS',sans-serif}
.card::after{content:"";position:absolute;right:-140px;top:-140px;width:420px;height:420px;
  border-radius:50%;background:#2A5A4D}
.brand{display:flex;align-items:center;gap:14px;position:relative;z-index:1}
.mark{width:52px;height:52px;border-radius:14px;background:#fff;color:#1C443A;
  display:flex;align-items:center;justify-content:center;font-family:'NR';font-weight:700;font-size:30px}
.wm{font-weight:800;font-size:26px;letter-spacing:-.02em}
.title{font-family:'NR';font-weight:500;font-size:66px;line-height:1.04;letter-spacing:-.015em;
  max-width:20ch;position:relative;z-index:1}
.sub{font-size:26px;color:#BFD3C9;max-width:44ch;position:relative;z-index:1;line-height:1.4}
.rule{width:64px;height:5px;background:#C4743F;border-radius:3px;margin-bottom:26px}
.foot{display:flex;justify-content:space-between;align-items:flex-end;position:relative;z-index:1}
.dom{font-size:22px;color:#8FB0A4;font-weight:700}
</style></head><body>
<div class="card">
  <div class="brand"><div class="mark">P</div><div class="wm">PGManage</div></div>
  <div>
    <div class="rule"></div>
    <div class="title">${title}</div>
  </div>
  <div class="foot"><div class="sub">${sub}</div><div class="dom">pgmanage.in</div></div>
</div></body></html>`;

async function main() {
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });
  const ps = await b64(join(ROOT, 'public', 'fonts', 'public-sans-latin.woff2'));
  const nr = await b64(join(ROOT, 'public', 'fonts', 'newsreader-latin.woff2'));

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 2 });

  for (const [slug, title, sub] of CARDS) {
    await page.setContent(template(title, sub, ps, nr), { waitUntil: 'networkidle' });
    await page.waitForTimeout(120);
    const buf = await page.locator('.card').screenshot({ type: 'png' });
    await sharp(buf).resize(1200, 630).png({ compressionLevel: 9 }).toFile(join(OUT, `${slug}.png`));
    console.log(`  ✓ og/${slug}.png`);
  }
  await browser.close();
  await writeFile(join(OUT, '.gitkeep'), '');
  console.log(`\n  Done — ${CARDS.length} OG images → public/og/\n`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
