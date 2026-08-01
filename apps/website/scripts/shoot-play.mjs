// scripts/shoot-play.mjs — Google Play store screenshots (framed marketing panels).
//
// Rebuilds the 8+8 Play listing screenshots from the *masked* mockups so no
// real name or number ships. Each panel is 1080x1920: dark board, a letter-
// spaced eyebrow, a serif headline, and the phone screen cropped from the
// mockup. Output is 24-bit PNG, no alpha (what Play requires).
//
//   node scripts/shoot-play.mjs     (playwright + sharp already installed)

import { chromium } from 'playwright';
import sharp from 'sharp';
import { mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SRC = process.env.SHOOT_SRC || join(ROOT, 'mockups');
const OUT = process.env.OUT_DIR ? resolve(process.env.OUT_DIR) : join(ROOT, 'play-shots');

// Canvas size. Default = Play/Android 1080x1920 (9:16). Override for iOS 6.7"
// (App Store: 1290x2796) via CANVAS_W / CANVAS_H. Layout is derived from the
// 1080x1920 reference design so both look identical, just re-fitted.
const CW = Number(process.env.CANVAS_W) || 1080;
const CH = Number(process.env.CANVAS_H) || 1920;
const SX = CW / 1080; // horizontal scale
const SY = CH / 1920; // vertical scale

// Palette lifted from the pack panels: board #12332a, eyebrow sage-mint
// #A9C6B6, headline white. Phone is 682px wide, centred, top at y=315 on the
// reference canvas; both scale with the target size.
const BG = '#12332a';
const EYEBROW = '#a9c6b6';
const PHONE_W = Math.round(682 * SX);
const PHONE_TOP = Math.round(315 * SY);
const CAP_TOP = Math.round(96 * SY);
const EYEBROW_FS = Math.max(14, Math.round(21 * SX));
const EYEBROW_LS = (4.5 * SX).toFixed(2);
const HEADLINE_FS = Math.round(47 * SX);
const RADIUS = Math.round(80 * SX);

// Curated screens per app: [mockupIndex, eyebrow, headline]. Index is the DOM
// order of `.phone` in each mockup (same order shoot.mjs uses).
const APPS = [
  {
    file: 'owner-app.html',
    prefix: 'owner',
    panels: [
      [0, 'Dashboard', 'Your building,\nat a glance'],
      [1, 'Collection', 'Collect rent\nin two taps'],
      [2, 'Dues', "See who's late,\nand how late"],
      [4, 'Vacancy', 'Every free bed, and\nwhat comes free next'],
      [7, 'Leads', "Enquiries that\ndon't get forgotten"],
      [8, 'Matching', 'Match a lead to\nthe bed that fits'],
      [6, 'Expenses', 'Log expenses\nwhere they happen'],
      [3, 'Ledger', 'One resident,\nthe whole history'],
    ],
  },
  {
    file: 'resident-app.html',
    prefix: 'resident',
    panels: [
      [0, 'Home', 'Everything about your stay,\non one screen'],
      [1, 'Rent', 'Pay rent in seconds.\nReceipt on the spot.'],
      [2, 'Food', "This week's menu,\nbefore you walk down"],
      [5, 'Requests', 'Raise it, track it,\nsee it closed'],
      [3, 'My stay', 'Your room, deposit and\nagreement in one place'],
      [6, 'Moving out', 'Give notice without\na single phone call'],
      [7, 'Referrals', 'Refer a friend\nto a free bed'],
      [8, 'Profile', 'Your documents and\nvehicle, on record'],
    ],
  },
];

const b64 = (buf) => buf.toString('base64');

function panelHtml({ eyebrow, headline, phoneDataUri, sans, serif }) {
  const headlineHtml = headline
    .split('\n')
    .map((l) => `<span>${l}</span>`)
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @font-face{font-family:'PS';font-weight:100 900;src:url(data:font/woff2;base64,${sans}) format('woff2-variations')}
    @font-face{font-family:'NR';font-weight:200 800;src:url(data:font/woff2;base64,${serif}) format('woff2-variations')}
    *{margin:0;padding:0;box-sizing:border-box}
    html,body{width:${CW}px;height:${CH}px;background:${BG};overflow:hidden}
    .cap{position:absolute;top:${CAP_TOP}px;left:0;right:0;text-align:center;padding:0 ${Math.round(80 * SX)}px}
    .eyebrow{font-family:'PS';font-weight:700;font-size:${EYEBROW_FS}px;letter-spacing:${EYEBROW_LS}px;
      text-transform:uppercase;color:${EYEBROW};margin-bottom:${Math.round(18 * SY)}px}
    .headline{font-family:'NR';font-weight:500;font-size:${HEADLINE_FS}px;line-height:1.14;color:#fff}
    .headline span{display:block}
    .phone{position:absolute;top:${PHONE_TOP}px;left:50%;transform:translateX(-50%);
      width:${PHONE_W}px;border-radius:${RADIUS}px;overflow:hidden;
      box-shadow:0 30px 60px rgba(0,0,0,.45)}
    .phone img{display:block;width:100%;height:auto}
  </style></head><body>
    <div class="cap">
      <div class="eyebrow">${eyebrow}</div>
      <div class="headline">${headlineHtml}</div>
    </div>
    <div class="phone"><img src="${phoneDataUri}"></div>
  </body></html>`;
}

async function main() {
  const sans = b64(await readFile(join(ROOT, 'public/fonts/public-sans-latin.woff2')));
  const serif = b64(await readFile(join(ROOT, 'public/fonts/newsreader-latin.woff2')));

  await rm(OUT, { recursive: true, force: true });

  const browser = await chromium.launch();
  const mockPage = await browser.newPage({ deviceScaleFactor: 3 });
  const panelPage = await browser.newPage({
    viewport: { width: CW, height: CH },
    deviceScaleFactor: 1,
  });
  let count = 0;

  for (const app of APPS) {
    const dir = join(OUT, app.prefix);
    await mkdir(dir, { recursive: true });
    await mockPage.goto(pathToFileURL(join(SRC, app.file)).href, {
      waitUntil: 'networkidle',
    });
    await mockPage.waitForSelector('.phone', { timeout: 15000 });
    await mockPage.waitForTimeout(400);
    const phones = mockPage.locator('.phone');

    console.log(`\n  ${app.prefix}:`);
    for (let n = 0; n < app.panels.length; n++) {
      const [idx, eyebrow, headline] = app.panels[n];
      // Screenshot the device; omit page bg so the rounded-corner triangles are
      // transparent, then the .phone clip in the panel hides them cleanly.
      const shot = await phones.nth(idx).screenshot({ type: 'png', omitBackground: true });
      const phoneDataUri = `data:image/png;base64,${b64(shot)}`;
      await panelPage.setContent(
        panelHtml({ eyebrow, headline, phoneDataUri, sans, serif }),
        { waitUntil: 'load' },
      );
      await panelPage.evaluate(() => document.fonts.ready);
      await panelPage.waitForTimeout(150);
      const png = await panelPage.screenshot({
        clip: { x: 0, y: 0, width: CW, height: CH },
      });
      const file = join(dir, `phone-${String(n + 1).padStart(2, '0')}.png`);
      // Flatten to 24-bit, no alpha — Play rejects alpha on screenshots.
      await sharp(png).flatten({ background: BG }).png({ compressionLevel: 9 }).toFile(file);
      count++;
      console.log(`    ✓ phone-${String(n + 1).padStart(2, '0')}  ${eyebrow} — ${headline.replace(/\n/g, ' ')}`);
    }
  }

  await browser.close();
  console.log(`\n  Done — ${count} Play screenshots → play-shots/\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
