// Erzeugt die App-Icons (PNG) aus einem SVG. Einmalig ausführen: node scripts/make-icons.mjs
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';

const svg = (pad = 0) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#ECEEE9"/>
  <g transform="translate(${pad} ${pad}) scale(${(512 - pad * 2) / 512})">
    <path d="M228 140a28 28 0 1 1 28 28v26" fill="none" stroke="#23222B" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M256 194L92 300c-16 10-9 34 10 34h308c19 0 26-24 10-34L256 194" fill="none" stroke="#23222B" stroke-width="22" stroke-linejoin="round" stroke-linecap="round"/>
    <rect x="300" y="334" width="62" height="86" rx="10" fill="#3343C4"/>
    <circle cx="331" cy="356" r="8" fill="#ECEEE9"/>
  </g>
</svg>`;

mkdirSync('public/icons', { recursive: true });
writeFileSync('public/icons/favicon.svg', svg());
const render = (s, size, file) => sharp(Buffer.from(s)).resize(size, size).png().toFile(`public/icons/${file}`);
await render(svg(), 192, 'icon-192.png');
await render(svg(), 512, 'icon-512.png');
await render(svg(70), 512, 'icon-512-maskable.png');
await render(svg(20), 180, 'apple-touch-icon.png');
console.log('Icons erstellt');
