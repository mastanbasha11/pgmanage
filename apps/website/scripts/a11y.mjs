// axe-core accessibility check on every page. Fails loud on any violation.
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const BASE = process.argv[2] || 'http://localhost:4321';
const PATHS = [
  '/', '/pricing', '/product', '/product/rent-collection', '/product/occupancy',
  '/product/money', '/about', '/security', '/demo', '/demo/thanks', '/privacy',
  '/terms', '/styleguide',
];

const browser = await chromium.launch();
const context = await browser.newContext();
let total = 0;
for (const path of PATHS) {
  const page = await context.newPage();
  await page.goto(BASE + path, { waitUntil: 'networkidle' });
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  if (violations.length) {
    total += violations.length;
    console.log(`\n  ✗ ${path} — ${violations.length} violation(s)`);
    for (const v of violations) {
      console.log(`    · [${v.impact}] ${v.id}: ${v.help}`);
      for (const n of v.nodes.slice(0, 3)) console.log(`        ${n.target.join(' ')}`);
    }
  } else {
    console.log(`  ✓ ${path}`);
  }
  await page.close();
}
await browser.close();
console.log(`\n  ${total === 0 ? '✓ ZERO violations across all pages' : `✗ ${total} total violations`}\n`);
process.exit(total === 0 ? 0 : 1);
