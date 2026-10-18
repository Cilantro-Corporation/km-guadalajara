// Descarga los hitos kilométricos oficiales (IGN, Redes de Transporte, INSPIRE tn:MarkerPost)
// de la zona de Guadalajara y el código de cada carretera (tn-ro:Road).
// Salida: raw/ign-markers.json  [{id, lat, lon, km, road}]  y  raw/ign-roads.json {roadId: {name, code}}
import { writeFile, readFile } from 'node:fs/promises';

const WFS = 'https://servicios.idee.es/wfs-inspire/transportes';
// Caja que envuelve la provincia (lat/lon EPSG:4258), con margen
const BBOX = '40.05,-3.62,41.36,-1.52';
const PAGE = 5000;

async function get(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      if (i === tries - 1) throw e;
      await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
    }
  }
}

async function fetchMarkers() {
  const out = [];
  for (let start = 0; ; start += PAGE) {
    const url = `${WFS}?service=WFS&version=2.0.0&request=GetFeature&typeNames=tn:MarkerPost` +
      `&count=${PAGE}&startIndex=${start}&bbox=${BBOX},urn:ogc:def:crs:EPSG::4258`;
    const xml = await get(url);
    const members = xml.split('<wfs:member>').slice(1);
    for (const m of members) {
      const road = m.match(/ID=TN-RO_ROAD_([A-Za-z0-9_]+)/);
      if (!road) continue; // hitos de ferrocarril
      const pos = m.match(/<gml:pos>([-\d.]+) ([-\d.]+)/);
      const km = m.match(/<tn:location uom="km">([-\d.]+)</);
      const id = m.match(/<base:localId>([^<]+)</);
      if (!pos || !km) continue;
      out.push({ id: id?.[1], lat: +pos[1], lon: +pos[2], km: +km[1], road: road[1] });
    }
    console.log(`hitos: página ${start / PAGE + 1}, ${members.length} elementos, ${out.length} de carretera`);
    if (members.length < PAGE) break;
  }
  return out;
}

async function fetchRoads(ids) {
  const roads = {};
  let done = 0;
  const queue = [...ids];
  async function worker() {
    while (queue.length) {
      const id = queue.shift();
      const xml = await get(`${WFS}?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature` +
        `&STOREDQUERY_ID=urn:ogc:def:query:OGC-WFS::GetFeatureById&ID=TN-RO_ROAD_${id}`);
      const names = [...xml.matchAll(/<gn:text>([^<]+)<\/gn:text>/g)].map((x) => x[1].trim());
      const code = xml.match(/<tn-ro:nationalRoadCode>([^<]+)</)?.[1]?.trim();
      roads[id] = { name: names[0] || null, code: code || null };
      if (++done % 25 === 0) console.log(`carreteras: ${done}/${ids.length}`);
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker));
  return roads;
}

const rawDir = new URL('../raw/', import.meta.url);
let markers;
if (process.argv.includes('--reuse')) {
  markers = JSON.parse(await readFile(new URL('ign-markers.json', rawDir), 'utf8'));
} else {
  markers = await fetchMarkers();
  await writeFile(new URL('ign-markers.json', rawDir), JSON.stringify(markers));
}
const ids = [...new Set(markers.map((m) => m.road))];
console.log(`${markers.length} hitos, ${ids.length} carreteras distintas`);
const roads = await fetchRoads(ids);
await writeFile(new URL('ign-roads.json', rawDir), JSON.stringify(roads, null, 1));
console.log('listo');
