// Pruebas automáticas del núcleo de cálculo: node tools/test-core.mjs
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const ctx = { window: {} };
vm.createContext(ctx);
for (const f of ['../www/data/pk.js', '../www/js/core.js']) {
  vm.runInContext(await readFile(new URL(f, import.meta.url), 'utf8'), ctx);
}
const { KMCore, PK_DATA } = ctx.window;
const C = KMCore.create(PK_DATA);

let fails = 0, checks = 0;
function ok(cond, msg) { checks++; if (!cond) { fails++; if (fails <= 40) console.log('FALLO:', msg); } }
const eq = (a, b, msg) => ok(Object.is(a, b) || (a === b), `${msg}: esperado ${b}, obtenido ${a}`);

// ---- parseKm / formatos ----
eq(KMCore.parseKm('44'), 44, 'parseKm 44');
eq(KMCore.parseKm('44,3'), 44.3, 'parseKm 44,3');
eq(KMCore.parseKm('44.3'), 44.3, 'parseKm 44.3');
eq(KMCore.parseKm('44+300'), 44.3, 'parseKm 44+300');
eq(KMCore.parseKm('44+050'), 44.05, 'parseKm 44+050');
eq(KMCore.parseKm(' km 12 '), 12, 'parseKm km 12');
eq(KMCore.parseKm('PK12,5'), 12.5, 'parseKm PK12,5');
ok(Number.isNaN(KMCore.parseKm('')), 'parseKm vacío');
ok(Number.isNaN(KMCore.parseKm('abc')), 'parseKm abc');
ok(Number.isNaN(KMCore.parseKm('-3')), 'parseKm negativo');
ok(Number.isNaN(KMCore.parseKm('1e5')), 'parseKm exponente');
ok(Number.isNaN(KMCore.parseKm('99999')), 'parseKm enorme');
ok(Number.isNaN(KMCore.parseKm('<script>')), 'parseKm html');
eq(KMCore.formatKm(44.3), '44,3', 'formatKm');
eq(KMCore.formatKm(44), '44', 'formatKm entero');
eq(KMCore.formatPk(44.3), '44+300', 'formatPk');
eq(KMCore.formatPk(7.05), '7+050', 'formatPk 7+050');
eq(KMCore.formatPk(12.9996), '13+000', 'formatPk redondeo');
eq(KMCore.cardinal(48), 'NE', 'cardinal 48');
eq(KMCore.cardinal(359), 'N', 'cardinal 359');

// ---- carreteras ----
eq(C.resolveRoad('a2'), 'A-2', 'resolve a2');
eq(C.resolveRoad('A 2'), 'A-2', 'resolve A 2');
eq(C.resolveRoad('cm101'), 'CM-101', 'resolve cm101');
eq(C.resolveRoad('gu-211'), 'GU-211', 'resolve gu-211');
eq(C.resolveRoad('n320'), 'N-320', 'resolve n320');
eq(C.resolveRoad('zzz'), null, 'resolve inexistente');
eq(C.resolveRoad(''), null, 'resolve vacío');
eq(C.suggest('a2')[0], 'A-2', 'suggest a2');
ok(C.suggest('cm1').includes('CM-101'), 'suggest cm1 contiene CM-101');
ok(C.suggest('101').includes('CM-101'), 'suggest 101 contiene CM-101');
ok(C.suggest('').length > 0, 'suggest vacío devuelve lista');
ok(C.suggest('<img src=x>').length === 0, 'suggest html');
const q1 = C.parseQuery('a2 44,3'); eq(q1.road, 'A-2', 'query road'); eq(q1.km, 44.3, 'query km');
const q2 = C.parseQuery('CM-101 km 12'); eq(q2.road, 'CM-101', 'query2 road'); eq(q2.km, 12, 'query2 km');
const q3 = C.parseQuery('cm-2001'); eq(q3.road, 'CM-2001', 'query3 road (no confundir número con km)'); ok(Number.isNaN(q3.km), 'query3 km NaN');

const a2 = C.roadInfo('A-2');
eq(a2.min, 37, 'A-2 min'); eq(a2.max, 143, 'A-2 max'); ok(a2.dual, 'A-2 doble calzada');
const n320 = C.roadInfo('N-320');
ok(n320.ranges.length >= 2, 'N-320 tiene varios tramos: ' + JSON.stringify(n320.ranges));
ok(!C.roadInfo('GU-211').dual, 'GU-211 sin doble calzada');
eq(C.roadInfo('NOEXISTE'), null, 'roadInfo inexistente');

// ---- localizar ----
const m44 = C.locate('A-2', 44, 0);
eq(m44.length, 1, 'A-2 km 44 una ubicación');
ok(m44[0].exact, 'A-2 km 44 exacto');
const m443 = C.locate('A-2', 44.3, 0)[0];
ok(m443 && !m443.exact && m443.from === 44 && m443.to === 45, 'A-2 44,3 interpolado entre 44 y 45');
const d1 = C.distance([m44[0].lat, m44[0].lon], [m443.lat, m443.lon]);
ok(d1 > 200 && d1 < 450, `A-2 44→44,3 distancia ~300 m (${d1.toFixed(0)})`);
ok(C.locate('A-2', 10, 0).length === 0, 'A-2 km 10 fuera de la provincia');
ok(C.locate('A-2', NaN, 0).length === 0, 'locate NaN');
ok(C.locate('XX', 3, 0).length === 0, 'locate carretera inexistente');

// Sentidos en la A-2: en España se circula por la derecha.
// El punto del sentido creciente debe quedar a la derecha del avance (rumbo + 90°).
let rightSide = 0, total = 0;
for (let km = 38.5; km < 140; km += 1) {
  const F = C.locate('A-2', km, 1)[0], B = C.locate('A-2', km, -1)[0];
  const F2 = C.locate('A-2', km + 0.2, 1)[0];
  if (!F || !B || !F2 || !F.carriageway || !B.carriageway) continue;
  total++;
  const hx = F2.lon - F.lon, hy = F2.lat - F.lat;            // avance en sentido creciente
  const vx = F.lon - B.lon, vy = F.lat - B.lat;              // de la calzada B a la F
  const cross = hx * vy - hy * vx;                           // < 0 => F a la derecha
  if (cross < 0) rightSide++;
  const sep = C.distance([F.lat, F.lon], [B.lat, B.lon]);
  ok(sep > 5 && sep < 400, `A-2 km ${km} separación entre calzadas ${sep.toFixed(0)} m`);
}
ok(total > 90, `A-2 tramos con dos calzadas: ${total}`);
ok(rightSide / total > 0.97, `A-2 calzada creciente a la derecha en ${rightSide}/${total}`);

// Recorrido completo: cada punto intermedio de cada carretera debe estar cerca del eje
// y el PK más cercano a ese punto debe devolver la misma carretera y el mismo km.
let roundTrips = 0, roundOk = 0;
for (const name of C.names) {
  const info = C.roadInfo(name);
  ok(info.min <= info.max, `${name} rango`);
  for (const [lo, hi] of info.ranges) {
    for (let km = lo; km <= hi; km += 0.5) {
      for (const dir of [0, 1, -1]) {
        const res = C.locate(name, km, dir);
        ok(res.length > 0, `${name} km ${km} dir ${dir} sin resultado`);
        for (const r of res) {
          ok(Number.isFinite(r.lat) && Number.isFinite(r.lon) && r.lat > 39.8 && r.lat < 41.6 && r.lon > -3.9 && r.lon < -1.2,
            `${name} km ${km} fuera de la zona: ${r.lat},${r.lon}`);
        }
        if (dir === 0 && res.length === 1 && km % 1 !== 0) {
          roundTrips++;
          const n = C.nearest(res[0].lat, res[0].lon, 200, 5);
          const same = n.find((x) => x.road === name);
          if (same && Math.abs(same.km - km) < 0.06 && same.d < 5) roundOk++;
          else if (roundTrips - roundOk <= 5) console.log('  aviso ida/vuelta', name, km, JSON.stringify(same));
        }
      }
    }
  }
}
ok(roundOk / roundTrips > 0.98, `ida y vuelta PK→punto→PK: ${roundOk}/${roundTrips}`);

// PK más cercano en un punto lejos de carreteras
ok(C.nearest(40.0, -1.0, 3000).length === 0, 'nearest fuera de la provincia vacío');

console.log(`\n${checks} comprobaciones, ${fails} fallos (ida/vuelta ${roundOk}/${roundTrips})`);
process.exit(fails ? 1 : 0);
