// Bundle a built page into ONE self-contained HTML fragment (styles + body,
// with fonts and screenshots inlined as data URIs) for an Artifact preview.
// Output is body-content only (no <html>/<head>/<body>) per the Artifact wrapper.
//
// Usage: node scripts/bundle-artifact.mjs <route> <outfile>
//   e.g. node scripts/bundle-artifact.mjs index /path/preview-home.html
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(__dirname, '..', 'dist');
const route = process.argv[2] || 'index';
const out = process.argv[3] || resolve(__dirname, '..', 'preview.html');

const htmlPath = route === 'index' ? join(DIST, 'index.html') : join(DIST, route, 'index.html');
let doc = await readFile(htmlPath, 'utf8');

// 1. collect <style> blocks + <body> inner + any module scripts (they may be
//    hoisted into <head>, e.g. the pricing calculator)
const styles = [...doc.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
let body = doc.match(/<body[^>]*>([\s\S]*?)<\/body>/)[1];
const moduleScripts = [...doc.matchAll(/<script type="module">[\s\S]*?<\/script>/g)]
  .map((m) => m[0])
  .filter((s) => !body.includes(s))
  .join('\n');

// 2. drop external/analytics + ld+json scripts (CSP-blocked or irrelevant in preview)
body = body
  .replace(/<script[^>]*plausible[^>]*><\/script>/g, '')
  .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '');

// 3. inline fonts referenced by url(/fonts/*.woff2) in the CSS
let css = styles;
for (const font of ['public-sans-latin', 'newsreader-latin']) {
  const buf = await readFile(join(DIST, 'fonts', `${font}.woff2`));
  const uri = `data:font/woff2;base64,${buf.toString('base64')}`;
  css = css.replaceAll(`/fonts/${font}.woff2`, uri);
}

// 4. inline screenshots. Strip AVIF sources; map webp source + png img to the
//    webp data URI (webp is universally supported in the artifact runtime).
const names = new Set([...body.matchAll(/\/media\/([a-z0-9-]+)\.(?:avif|webp|png)/g)].map((m) => m[1]));
const webpUri = {};
for (const n of names) {
  const buf = await readFile(join(DIST, 'media', `${n}.webp`));
  webpUri[n] = `data:image/webp;base64,${buf.toString('base64')}`;
}
body = body
  // remove avif <source>
  .replace(/<source[^>]*type="image\/avif"[^>]*>/g, '')
  // webp source srcset → data
  .replace(/srcset="\/media\/([a-z0-9-]+)\.webp"/g, (_, n) => `srcset="${webpUri[n]}"`)
  // png img src → webp data
  .replace(/src="\/media\/([a-z0-9-]+)\.png"/g, (_, n) => `src="${webpUri[n]}"`);

// 5. neutralise the form POST (no backend in a static preview)
body = body.replace(/action="\/api\/demo"/g, 'action="#" onsubmit="return false"');

const result = `<style>\n${css}\n</style>\n${body}\n${moduleScripts}`;
await writeFile(out, result);
console.log(`  bundled ${route} → ${out}  (${(result.length / 1024).toFixed(0)} KB, ${names.size} images inlined)`);
