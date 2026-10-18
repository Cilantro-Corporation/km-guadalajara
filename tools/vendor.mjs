// Copia las librerías de node_modules a www/vendor para que la app funcione sin internet
import { cp, mkdir } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const nm = (p) => new URL(`node_modules/${p}`, root);
const www = (p) => new URL(`www/vendor/${p}`, root);

await mkdir(www('leaflet/'), { recursive: true });
await mkdir(www('fonts/'), { recursive: true });
await cp(nm('leaflet/dist/leaflet.js'), www('leaflet/leaflet.js'));
await cp(nm('leaflet/dist/leaflet.css'), www('leaflet/leaflet.css'));
await cp(nm('leaflet/dist/images/'), www('leaflet/images/'), { recursive: true });
for (const w of [500, 700]) {
  await cp(nm(`@fontsource/oswald/files/oswald-latin-${w}-normal.woff2`), www(`fonts/oswald-${w}.woff2`));
}
console.log('vendor copiado');
