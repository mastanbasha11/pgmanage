import sharp from 'sharp';

// Brand grid mark on a 48-unit grid (from pgmanagelogo.html)
const MARK = `
<rect x="5" y="5" width="9" height="11" rx="2.4" fill="#1D4A3B"/>
<rect x="19.5" y="5" width="9" height="11" rx="2.4" fill="#1D4A3B"/>
<rect x="34" y="5" width="9" height="11" rx="2.4" fill="#7C9E8B"/>
<rect x="5" y="20" width="9" height="11" rx="2.4" fill="#1D4A3B"/>
<rect x="19.5" y="20" width="9" height="11" rx="2.4" fill="#1D4A3B"/>
<rect x="34" y="20" width="9" height="11" rx="2.4" fill="#1D4A3B"/>
<rect x="5" y="35" width="38" height="8" rx="2.6" fill="#1D4A3B"/>`;

const CREAM = '#F6F8F4';

// iOS / App Store icon: opaque cream bg, mark ~64% (18% padding), NO alpha, square.
function iosSvg() {
  const scale = 17.24, tx = 512 - scale * 24;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
    <rect width="1024" height="1024" fill="${CREAM}"/>
    <g transform="translate(${tx},${tx}) scale(${scale})">${MARK}</g>
  </svg>`;
}

// Android adaptive foreground: transparent bg, mark ~55% (fits Android's central safe zone).
function adaptiveSvg() {
  const scale = 14.8, tx = 512 - scale * 24;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
    <g transform="translate(${tx},${tx}) scale(${scale})">${MARK}</g>
  </svg>`;
}

async function main() {
  const apps = [
    '/Users/mastan/pgmanage/apps/mobile/assets',        // owner
    '/Users/mastan/pgmanage/apps/mobile-tenant/assets', // resident
  ];
  for (const dir of apps) {
    await sharp(Buffer.from(iosSvg()))
      .flatten({ background: CREAM })
      .png()
      .toFile(`${dir}/icon.png`);
    await sharp(Buffer.from(adaptiveSvg()))
      .png()
      .toFile(`${dir}/adaptive-icon.png`);
    console.log('wrote', dir);
  }
}
main();
