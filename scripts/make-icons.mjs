// Erzeugt die App-Icons (PNG + SVG): weißer Kleiderbügel auf Rosé-Verlauf.
// Ausführen: node scripts/make-icons.mjs
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';

// Bügel im 512er Raster; scale < 1 verkleinert ihn (z. B. für maskable mit Sicherheitszone)
const hanger = (scale = 1) => {
  const t = `translate(256 262) scale(${scale}) translate(-256 -262)`;
  return `<g transform="${t}" fill="none" stroke="#fff" stroke-linecap="round" stroke-linejoin="round">
    <path d="M222 158a34 34 0 1 1 49 30.5c-9.4 4.9-15 14.5-15 25.1v13.4" stroke-width="26"/>
    <path d="M256 226L104 323c-17 10.8-9.3 37 10.8 37h282.4c20.1 0 27.8-26.2 10.8-37L256 226z" stroke-width="26"/>
  </g>`;
};
const bg = (rounded) => `
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FF6B8A"/><stop offset="1" stop-color="#FF2D55"/>
    </linearGradient>
    <radialGradient id="h" cx=".3" cy=".12" r=".9">
      <stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
    <filter id="s" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="8" stdDeviation="10" flood-color="#9E0028" flood-opacity=".28"/></filter>
  </defs>
  <rect width="512" height="512" ${rounded ? 'rx="114"' : ''} fill="url(#g)"/>
  <rect width="512" height="512" ${rounded ? 'rx="114"' : ''} fill="url(#h)"/>`;
const svg = ({ scale = 0.9, rounded = false } = {}) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${bg(rounded)}<g filter="url(#s)">${hanger(scale)}</g></svg>`;

mkdirSync('public/icons', { recursive: true });
writeFileSync('public/icons/favicon.svg', svg({ rounded: true }));
const render = (s, size, file) => sharp(Buffer.from(s)).resize(size, size).png().toFile(`public/icons/${file}`);
// iOS rundet selbst ab → volle Fläche; maskable mit 80 %-Sicherheitszone
await render(svg(), 180, 'apple-touch-icon.png');
await render(svg(), 192, 'icon-192.png');
await render(svg(), 512, 'icon-512.png');
await render(svg({ scale: 0.72 }), 512, 'icon-512-maskable.png');
console.log('Icons erstellt');
