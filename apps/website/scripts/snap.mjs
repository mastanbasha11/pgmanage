// Verification screenshots — render built pages at 3 breakpoints so they can
// actually be looked at. Usage: node scripts/snap.mjs [baseURL]
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.argv[2] || 'http://localhost:4321';
const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '..', 'verify');

const PAGES = [
  ['home', '/'],
  ['pricing', '/pricing'],
  ['product', '/product'],
  ['product-rent', '/product/rent-collection'],
  ['about', '/about'],
  ['security', '/security'],
  ['demo', '/demo'],
];
const WIDTHS = [
  ['1440', 1440],
  ['768', 768],
  ['360', 360],
];

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
for (const [name, path] of PAGES) {
  for (const [wname, w] of WIDTHS) {
    const page = await browser.newPage({ viewport: { width: w, height: 900 }, deviceScaleFactor: 1 });
    await page.goto(BASE + path, { waitUntil: 'networkidle' });
    await page.waitForTimeout(250);
    await page.screenshot({ path: join(OUT, `${name}-${wname}.png`), fullPage: true });
    await page.close();
    console.log(`  ✓ ${name} @ ${wname}`);
  }
}
await browser.close();
console.log(`\n  → verify/  (${PAGES.length * WIDTHS.length} shots)\n`);
