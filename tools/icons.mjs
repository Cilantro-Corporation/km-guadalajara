// Genera los iconos de la app (PWA, iOS y Android) a partir de un SVG.
// El texto se convierte a trazados con la fuente Oswald para no depender de fuentes del sistema.
import opentype from 'opentype.js';
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const LIME = '#C6F400';
const BLACK = '#0B0B0B';

const font = opentype.loadSync(fileURLToPath(new URL('node_modules/@fontsource/oswald/files/oswald-latin-700-normal.woff', root)));

function textPath(text, size, cx, baseline) {
  const w = font.getAdvanceWidth(text, size);
  return font.getPath(text, cx - w / 2, baseline, size).toPathData(2);
}

// Escudo genérico (no institucional) con "km." dentro y una carretera estilizada
function iconSvg({ bg = true, scale = 1 } = {}) {
  const s = 1024;
  const g = `
    <g transform="translate(${(s * (1 - scale)) / 2} ${(s * (1 - scale)) / 2}) scale(${scale})">
      <path d="M512 120 L840 220 L840 560 C840 740 700 860 512 924 C324 860 184 740 184 560 L184 220 Z"
            fill="${BLACK}" stroke="${LIME}" stroke-width="44" stroke-linejoin="round"/>
      <path d="${textPath('km.', 330, 512, 560)}" fill="${LIME}"/>
      <path d="M430 820 L476 640 M594 820 L548 640" stroke="${LIME}" stroke-width="22" stroke-linecap="round"/>
      <path d="M512 650 L512 690 M512 725 L512 765 M512 800 L512 830" stroke="${LIME}" stroke-width="16" stroke-linecap="round"/>
    </g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
    ${bg ? `<rect width="${s}" height="${s}" fill="${BLACK}"/>` : ''}${g}</svg>`;
}

const out = (p) => new URL(p, root);
await mkdir(out('www/icons/'), { recursive: true });
await mkdir(out('assets/'), { recursive: true });

const full = Buffer.from(iconSvg());
const maskable = Buffer.from(iconSvg({ scale: 0.78 }));
await writeFile(out('www/icons/icon.svg'), iconSvg({ bg: false }));
for (const [name, buf, size] of [
  ['www/icons/icon-192.png', full, 192],
  ['www/icons/icon-512.png', full, 512],
  ['www/icons/maskable-512.png', maskable, 512],
  ['www/icons/apple-touch-icon.png', full, 180],
  ['www/icons/favicon-32.png', full, 32],
  ['assets/icon-only.png', maskable, 1024],
  ['assets/icon-foreground.png', Buffer.from(iconSvg({ bg: false, scale: 0.62 })), 1024],
]) {
  await sharp(buf).resize(size, size).png().toFile(fileURLToPath(out(name)));
}
await sharp({ create: { width: 1024, height: 1024, channels: 4, background: BLACK } }).png()
  .toFile(fileURLToPath(out('assets/icon-background.png')));
// Splash
const splash = `<svg xmlns="http://www.w3.org/2000/svg" width="2732" height="2732"><rect width="2732" height="2732" fill="${BLACK}"/>
  <g transform="translate(1110 1110) scale(0.5)">${iconSvg({ bg: false }).replace(/^<svg[^>]*>|<\/svg>$/g, '')}</g></svg>`;
await sharp(Buffer.from(splash)).png().toFile(fileURLToPath(out('assets/splash.png')));
await sharp(Buffer.from(splash)).png().toFile(fileURLToPath(out('assets/splash-dark.png')));
console.log('iconos generados');
