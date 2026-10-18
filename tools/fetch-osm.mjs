// Descarga de OpenStreetMap (Overpass) los hitos kilométricos y las carreteras
// de la provincia de Guadalajara. Guarda el JSON bruto en raw/.
import { writeFile } from 'node:fs/promises';

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

const AREA = 'area["ISO3166-2"="ES-GU"]->.gu;';

const QUERIES = {
  boundary: `[out:json][timeout:120];rel["ISO3166-2"="ES-GU"];out geom;`,
  milestones: `[out:json][timeout:300];${AREA}node["highway"="milestone"](area.gu);out body;`,
  roads: `[out:json][timeout:600];${AREA}way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link)$"]["ref"](area.gu);out body geom;`,
};

async function run(name, q) {
  for (const url of ENDPOINTS) {
    try {
      console.log(`${name}: ${url}`);
      const res = await fetch(url, {
        method: 'POST',
        body: 'data=' + encodeURIComponent(q),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'km-guadalajara/1.0' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const txt = await res.text();
      await writeFile(new URL(`../raw/${name}.json`, import.meta.url), txt);
      console.log(`${name}: ${JSON.parse(txt).elements.length} elementos`);
      return;
    } catch (e) {
      console.log(`${name}: fallo ${e.message}`);
    }
  }
  throw new Error(`No se pudo descargar ${name}`);
}

const only = process.argv[2];
for (const [name, q] of Object.entries(QUERIES)) {
  if (!only || only === name) await run(name, q);
}
