// Genera www/data/pk.js a partir de:
//  raw/ign-markers.json + raw/ign-roads.json  (hitos oficiales del IGN)
//  raw/boundary.json                          (límite provincial, OSM)
//  raw/roads.json                             (trazado de carreteras, OSM) para interpolar entre hitos
//
// Para cada par de hitos consecutivos se calcula el trazado real por la carretera:
//  - U: trazado sin tener en cuenta sentidos (eje de la vía, opción "ambos sentidos")
//  - F: calzada por la que se circula en sentido km creciente (respeta sentidos únicos)
//  - B: calzada por la que se circula en sentido km decreciente
// F y B solo se guardan si son distintos de verdad (autovías y tramos de doble calzada).
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const raw = (f) => readFile(new URL(`../raw/${f}`, import.meta.url), 'utf8').then(JSON.parse);
const [markers, roadInfo, boundary, osmRoads] = await Promise.all([
  raw('ign-markers.json'), raw('ign-roads.json'), raw('boundary.json'), raw('roads.json'),
]);

const BUFFER_M = 2500; // incluir hitos hasta 2,5 km fuera del límite provincial
const R = 6371008.8;
const rad = Math.PI / 180;

// Proyección local equirectangular (metros) centrada en la provincia
const LAT0 = 40.8 * rad;
const toXY = (lat, lon) => [lon * rad * R * Math.cos(LAT0), lat * rad * R];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const llDist = (a, b) => dist(toXY(...a), toXY(...b));

function segDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return { d: Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy), t };
}

// ---------- Límite provincial ----------
const bSegs = [];
for (const rel of boundary.elements) {
  for (const m of rel.members || []) {
    if (m.type !== 'way' || m.role !== 'outer' || !m.geometry) continue;
    for (let i = 1; i < m.geometry.length; i++) {
      bSegs.push([toXY(m.geometry[i - 1].lat, m.geometry[i - 1].lon), toXY(m.geometry[i].lat, m.geometry[i].lon)]);
    }
  }
}
if (bSegs.length < 100) throw new Error('Límite provincial vacío o incompleto');
function inProvince(p) {
  let inside = false;
  for (const [a, b] of bSegs) {
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  if (inside) return true;
  for (const [a, b] of bSegs) if (segDist(p, a, b).d < BUFFER_M) return true;
  return false;
}

// ---------- Hitos por carretera ----------
const normRef = (s) => s.toUpperCase().replace(/\s+/g, '').replace(/^([A-Z]+)(\d)/, '$1-$2');
const byRoad = new Map();
for (const m of markers) {
  const info = roadInfo[m.road];
  if (!info?.name || !Number.isFinite(m.km) || !Number.isFinite(m.lat) || !Number.isFinite(m.lon)) continue;
  const p = toXY(m.lat, m.lon);
  if (!inProvince(p)) continue;
  const name = normRef(info.name);
  if (!byRoad.has(name)) byRoad.set(name, []);
  byRoad.get(name).push({ km: m.km, lat: m.lat, lon: m.lon, p });
}

// Fusiona hitos duplicados (mismo km a < 300 m, p. ej. las dos calzadas de una autovía)
for (const [name, list] of byRoad) {
  list.sort((a, b) => a.km - b.km);
  const out = [];
  for (const m of list) {
    const twin = out.find((o) => o.km === m.km && dist(o.p, m.p) < 300);
    if (twin) {
      twin.n++;
      twin.lat += (m.lat - twin.lat) / twin.n;
      twin.lon += (m.lon - twin.lon) / twin.n;
      twin.p = toXY(twin.lat, twin.lon);
    } else out.push({ ...m, n: 1 });
  }
  // km 0 suelto en una carretera que en la provincia empieza mucho más adelante (dato erróneo)
  const firstReal = out.find((m) => m.km > 0)?.km ?? 0;
  byRoad.set(name, firstReal > 3 ? out.filter((m) => m.km > 0) : out);
}
// Solo códigos de carretera (A-2, CM-101, GU-CR-2, SO-P-3008...), no nombres de calle
for (const name of byRoad.keys()) {
  if (!/^[A-Z]{1,4}(-[A-Z]{1,2})?-\d+[A-Z]?$/.test(name) || !byRoad.get(name).length) byRoad.delete(name);
}
console.log(`hitos en la provincia: ${[...byRoad.values()].reduce((s, l) => s + l.length, 0)} en ${byRoad.size} carreteras`);

// ---------- Grafo dirigido de cada carretera (OSM) ----------
// segs: {a, b, fwd, bwd}  (fwd = se puede circular de a hacia b)
function onewayOf(tags) {
  const o = tags.oneway;
  if (o === 'yes' || o === '1' || o === 'true') return 1;
  if (o === '-1' || o === 'reverse') return -1;
  if (o === 'no') return 0;
  if (tags.junction === 'roundabout' || tags.highway === 'motorway' || tags.highway === 'motorway_link') return 1;
  return 0;
}
const graphs = new Map();
for (const w of osmRoads.elements) {
  if (w.type !== 'way' || !w.tags?.ref || !w.geometry || w.geometry.length !== w.nodes.length) continue;
  const ow = onewayOf(w.tags);
  for (const ref of w.tags.ref.split(';').map(normRef)) {
    if (!byRoad.has(ref)) continue;
    if (!graphs.has(ref)) graphs.set(ref, { nodes: new Map(), out: new Map(), segs: [] });
    const g = graphs.get(ref);
    for (let i = 0; i < w.nodes.length; i++) {
      const id = w.nodes[i];
      if (!g.nodes.has(id)) g.nodes.set(id, { xy: toXY(w.geometry[i].lat, w.geometry[i].lon), ll: [w.geometry[i].lat, w.geometry[i].lon] });
      if (!g.out.has(id)) g.out.set(id, []);
      if (i > 0) {
        const a = w.nodes[i - 1], b = id;
        const len = dist(g.nodes.get(a).xy, g.nodes.get(b).xy);
        const fwd = ow >= 0, bwd = ow <= 0;
        g.segs.push({ a, b, len, fwd, bwd });
        // aristas: [destino, peso, dirigido-permitido]
        g.out.get(a).push([b, len, fwd]);
        g.out.get(b).push([a, len, bwd]);
      }
    }
  }
}

// Segmentos candidatos cerca de un hito
function candidates(g, p) {
  const list = [];
  for (const s of g.segs) {
    const A = g.nodes.get(s.a), B = g.nodes.get(s.b);
    const { d, t } = segDist(p, A.xy, B.xy);
    if (d < 250) list.push({ s, d, t, ll: [A.ll[0] + (B.ll[0] - A.ll[0]) * t, A.ll[1] + (B.ll[1] - A.ll[1]) * t] });
  }
  if (!list.length) return list;
  const best = Math.min(...list.map((c) => c.d));
  return list.filter((c) => c.d <= Math.max(70, best + 30));
}

class Heap {
  constructor() { this.h = []; }
  get size() { return this.h.length; }
  push(x) {
    const h = this.h; h.push(x);
    for (let i = h.length - 1; i > 0;) { const p = (i - 1) >> 1; if (h[p][0] <= h[i][0]) break; [h[p], h[i]] = [h[i], h[p]]; i = p; }
  }
  pop() {
    const h = this.h, top = h[0], last = h.pop();
    if (h.length) {
      h[0] = last;
      for (let i = 0; ;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < h.length && h[l][0] < h[m][0]) m = l;
        if (r < h.length && h[r][0] < h[m][0]) m = r;
        if (m === i) break; [h[m], h[i]] = [h[i], h[m]]; i = m;
      }
    }
    return top;
  }
}

// Ruta más corta entre dos hitos. directed=true respeta los sentidos únicos.
// Coste = longitud por la vía + distancia de cada hito a la vía (para preferir la calzada pegada al hito).
function route(g, from, to, directed, maxLen) {
  const S = candidates(g, from), E = candidates(g, to);
  if (!S.length || !E.length) return null;
  const ok = (allowed) => !directed || allowed;
  let best = { cost: Infinity };
  // Mismo segmento
  for (const s of S) for (const e of E) {
    if (s.s !== e.s) continue;
    const forward = e.t >= s.t;
    if (forward ? ok(s.s.fwd) : ok(s.s.bwd)) {
      const cost = s.d + e.d + Math.abs(e.t - s.t) * s.s.len;
      if (cost < best.cost) best = { cost, pts: [s.ll, e.ll] };
    }
  }
  const D = new Map(), prev = new Map(), heap = new Heap();
  const relax = (id, d, from) => {
    if (d > maxLen || (D.has(id) && D.get(id) <= d)) return;
    D.set(id, d); prev.set(id, from); heap.push([d, id]);
  };
  S.forEach((c, k) => {
    if (ok(c.s.fwd)) relax(c.s.b, c.d + (1 - c.t) * c.s.len, { start: k });
    if (ok(c.s.bwd)) relax(c.s.a, c.d + c.t * c.s.len, { start: k });
  });
  // Llegada: nodo -> [coste restante, candidato]
  const arrive = new Map();
  E.forEach((c, k) => {
    const add = (id, cost) => { if (!arrive.has(id)) arrive.set(id, []); arrive.get(id).push([cost, k]); };
    if (ok(c.s.fwd)) add(c.s.a, c.d + c.t * c.s.len);
    if (ok(c.s.bwd)) add(c.s.b, c.d + (1 - c.t) * c.s.len);
  });
  let bestEnd = null;
  while (heap.size) {
    const [d, id] = heap.pop();
    if (d > D.get(id) || d >= best.cost) continue;
    for (const [c, k] of arrive.get(id) || []) {
      if (d + c < best.cost) { best = { cost: d + c }; bestEnd = { id, k }; }
    }
    for (const [n, w, allowed] of g.out.get(id)) if (ok(allowed)) relax(n, d + w, id);
  }
  if (bestEnd) {
    const pts = [E[bestEnd.k].ll];
    let id = bestEnd.id;
    for (;;) {
      pts.push(g.nodes.get(id).ll);
      const p = prev.get(id);
      if (typeof p === 'object') { pts.push(S[p.start].ll); break; }
      id = p;
    }
    best.pts = pts.reverse();
  }
  return best.pts || null;
}

const lengthOf = (pts) => { let L = 0; for (let k = 1; k < pts.length; k++) L += llDist(pts[k - 1], pts[k]); return L; };
function pointAt(pts, frac) {
  const total = lengthOf(pts);
  let left = frac * total;
  for (let k = 1; k < pts.length; k++) {
    const l = llDist(pts[k - 1], pts[k]);
    if (left <= l || k === pts.length - 1) {
      const t = l ? Math.min(1, left / l) : 0;
      return [pts[k - 1][0] + (pts[k][0] - pts[k - 1][0]) * t, pts[k - 1][1] + (pts[k][1] - pts[k - 1][1]) * t];
    }
    left -= l;
  }
  return pts[pts.length - 1];
}

// Douglas-Peucker en metros
function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const xy = pts.map(([la, lo]) => toXY(la, lo));
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop();
    let md = 0, mi = -1;
    for (let k = i + 1; k < j; k++) { const d = segDist(xy[k], xy[i], xy[j]).d; if (d > md) { md = d; mi = k; } }
    if (md > tol) { keep[mi] = 1; stack.push([i, mi], [mi, j]); }
  }
  return pts.filter((_, k) => keep[k]);
}

// ---------- Salida compacta ----------
// roads: { "A-2": { t: tipo, h: rumbo km creciente (grados), p: [[km, lat*1e5, lon*1e5, segU, segF, segB], ...] } }
// segs[i] = [salto al índice del hito siguiente, lat0, lon0, dLat1, dLon1, ...] (enteros, *1e5, deltas)
// segU y segF van del hito i al siguiente; segB va del hito siguiente al hito i.
const E5 = (v) => Math.round(v * 1e5);
const out = { generated: new Date().toISOString().slice(0, 10), roads: {}, segs: [] };
const stats = { U: 0, straight: 0, dual: 0 };
const roadType = (r) =>
  /^(A|AP|R|E)-/.test(r) ? 'A' : /^N-/.test(r) ? 'N' : /^CM-/.test(r) ? 'CM' : /^GU-/.test(r) ? 'GU' : 'O';

function pushSeg(jump, pts) {
  const flat = [jump];
  let pla = 0, plo = 0;
  pts.forEach(([la, lo], k) => {
    const a = E5(la), b = E5(lo);
    flat.push(k ? a - pla : a, k ? b - plo : b); pla = a; plo = b;
  });
  out.segs.push(flat);
  return out.segs.length - 1;
}

for (const [name, list] of [...byRoad].sort((a, b) => a[0].localeCompare(b[0], 'es', { numeric: true }))) {
  const g = graphs.get(name);
  const rows = [];
  list.forEach((m, i) => {
    let segU = -1, segF = -1, segB = -1;
    // siguiente hito: el más cercano con km mayor (hasta +3 km)
    let next = -1, nd = Infinity;
    for (let j = i + 1; j < list.length && list[j].km <= m.km + 3; j++) {
      if (list[j].km === m.km) continue;
      const d = dist(m.p, list[j].p);
      if (d < nd && d < (list[j].km - m.km) * 1000 * 2.5 + 500) { nd = d; next = j; }
    }
    if (next >= 0) {
      const n = list[next];
      const span = (n.km - m.km) * 1000;
      const maxLen = span * 2.2 + 600;
      const valid = (pts) => pts && (() => { const L = lengthOf(pts); return L >= span * 0.4 && L <= maxLen; })();
      let U = g ? route(g, m.p, n.p, false, maxLen) : null;
      if (!valid(U)) U = null;
      if (U) { U = simplify(U, 6); stats.U++; } else { U = [[m.lat, m.lon], [n.lat, n.lon]]; stats.straight++; }
      U[0] = [m.lat, m.lon]; U[U.length - 1] = [n.lat, n.lon]; // los extremos son los hitos reales
      segU = pushSeg(next - i, U);

      if (g) {
        let F = route(g, m.p, n.p, true, maxLen);
        let B = route(g, n.p, m.p, true, maxLen);
        if (valid(F) && valid(B)) {
          // ¿Son calzadas distintas? Compara puntos a 1/4, 1/2 y 3/4 del recorrido
          const sep = Math.max(...[0.25, 0.5, 0.75].map((f) => llDist(pointAt(F, f), pointAt(B, 1 - f))));
          if (sep > 12) {
            segF = pushSeg(next - i, simplify(F, 4));
            segB = pushSeg(next - i, simplify(B, 4));
            stats.dual++;
          }
        }
      }
    }
    rows.push([m.km, E5(m.lat), E5(m.lon), segU, segF, segB]);
  });
  const first = list[0], last = list[list.length - 1];
  const [x0, y0] = first.p, [x1, y1] = last.p;
  const h = Math.round(((Math.atan2(x1 - x0, y1 - y0) / rad) + 360) % 360);
  out.roads[name] = { t: roadType(name), h, p: rows };
}
console.log(`tramos con trazado: ${stats.U}, en línea recta: ${stats.straight}, con doble calzada: ${stats.dual}`);

// Contorno provincial simplificado (para dibujarlo en el mapa): [[lat*1e4, lon*1e4, ...], ...]
// Se unen los tramos del límite en anillos cerrados.
out.outline = [];
const pieces = [];
for (const rel of boundary.elements) {
  for (const m of rel.members || []) {
    if (m.type === 'way' && m.role === 'outer' && m.geometry) pieces.push(m.geometry.map((g) => [g.lat, g.lon]));
  }
}
const same = (a, b) => Math.abs(a[0] - b[0]) < 1e-7 && Math.abs(a[1] - b[1]) < 1e-7;
while (pieces.length) {
  let ring = pieces.shift();
  for (let grew = true; grew && !same(ring[0], ring[ring.length - 1]);) {
    grew = false;
    for (let i = 0; i < pieces.length; i++) {
      const p = pieces[i], end = ring[ring.length - 1];
      if (same(p[0], end)) ring = ring.concat(p.slice(1));
      else if (same(p[p.length - 1], end)) ring = ring.concat(p.slice(0, -1).reverse());
      else continue;
      pieces.splice(i, 1); grew = true; break;
    }
  }
  if (ring.length > 20) {
    const pts = simplify(ring, 50);
    out.outline.push(pts.flatMap(([la, lo]) => [Math.round(la * 1e4), Math.round(lo * 1e4)]));
  }
}
console.log(`contorno: ${out.outline.length} anillo(s), ${out.outline.reduce((s, r) => s + r.length / 2, 0)} puntos`);

await mkdir(new URL('../www/data/', import.meta.url), { recursive: true });
const js = `window.PK_DATA=${JSON.stringify(out)};`;
await writeFile(new URL('../www/data/pk.js', import.meta.url), js);
console.log(`www/data/pk.js: ${(js.length / 1024).toFixed(0)} KB, ${Object.keys(out.roads).length} carreteras`);
