// Copia www/ a build/www-android/ para empaquetarla en el APK con Capacitor.
// Diferencias con la web: Capacitor inyecta su puente JS como script en línea, así que la CSP
// del APK permite 'unsafe-inline' en scripts (el APK solo carga archivos propios, nada remoto salvo las teselas del IGN).
// Tampoco se incluye el service worker (no hace falta: los archivos ya van dentro del APK).
import { cp, rm, readFile, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const src = new URL('www/', root);
const dst = new URL('build/www-android/', root);

await rm(dst, { recursive: true, force: true });
await cp(src, dst, { recursive: true });
await rm(new URL('sw.js', dst), { force: true });
await rm(new URL('manifest.webmanifest', dst), { force: true });

const indexUrl = new URL('index.html', dst);
let html = await readFile(indexUrl, 'utf8');
const before = html;
html = html.replace("script-src 'self';", "script-src 'self' 'unsafe-inline';");
html = html.replace(/\s*<link rel="manifest"[^>]*>/, '');
if (html === before) throw new Error('No se pudo adaptar index.html para Android');
await writeFile(indexUrl, html);
console.log('build/www-android listo');
