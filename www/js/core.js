/* km. Guadalajara — núcleo de cálculo (sin dependencias, usable en navegador y en Node para tests) */
(function (root) {
  'use strict';

  var R = 6371008.8;
  var RAD = Math.PI / 180;
  var TYPE_ORDER = { A: 0, N: 1, CM: 2, GU: 3, O: 4 };
  var CARDINAL = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];

  function key(s) {
    return String(s || '').toUpperCase().normalize('NFD').replace(/[^A-Z0-9]/g, '');
  }

  // "44,3" | "44.3" | "44+300" | "km 44" -> 44.3 ; NaN si no es válido
  function parseKm(input) {
    var s = String(input == null ? '' : input).trim().replace(/\s+/g, '').replace(/^(km|pk|kм)/i, '');
    if (!s) return NaN;
    var m = /^(\d{1,4})\+(\d{1,3})$/.exec(s);
    if (m) return +m[1] + +m[2] / 1000;
    if (!/^\d{1,4}([.,]\d{1,3})?$/.test(s)) return NaN;
    var v = parseFloat(s.replace(',', '.'));
    return v >= 0 && v <= 2000 ? Math.round(v * 1000) / 1000 : NaN;
  }

  function formatKm(km) {
    var v = Math.round(km * 1000) / 1000;
    return String(v).replace('.', ',');
  }

  function formatPk(km) {
    var m = Math.round(km * 1000);
    var whole = Math.floor(m / 1000);
    return whole + '+' + String(m - whole * 1000).padStart(3, '0');
  }

  function formatDist(m) {
    if (m < 1000) return Math.round(m) + ' m';
    return (Math.round(m / 100) / 10).toString().replace('.', ',') + ' km';
  }

  function cardinal(deg) {
    return CARDINAL[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
  }

  function naturalCompare(a, b) {
    return a.localeCompare(b, 'es', { numeric: true });
  }

  function create(data) {
    if (!data || !data.roads || !data.segs) throw new Error('Datos de PK no válidos');
    var roads = data.roads;
    var segs = data.segs;
    var names = Object.keys(roads).sort(function (a, b) {
      var ta = TYPE_ORDER[roads[a].t], tb = TYPE_ORDER[roads[b].t];
      return ta !== tb ? ta - tb : naturalCompare(a, b);
    });
    var byKey = {};
    names.forEach(function (n) { byKey[key(n)] = n; });

    // ---- Geometría ----
    var segCache = {};
    function seg(i) {
      if (segCache[i]) return segCache[i];
      var s = segs[i];
      var pts = [];
      var lat = 0, lon = 0;
      for (var k = 1; k + 1 < s.length; k += 2) {
        lat = k === 1 ? s[k] : lat + s[k];
        lon = k === 1 ? s[k + 1] : lon + s[k + 1];
        pts.push([lat / 1e5, lon / 1e5]);
      }
      var cum = [0];
      for (var j = 1; j < pts.length; j++) cum.push(cum[j - 1] + distance(pts[j - 1], pts[j]));
      return (segCache[i] = { jump: s[0], pts: pts, cum: cum, total: cum[cum.length - 1] });
    }

    function distance(a, b) {
      var x = (b[1] - a[1]) * RAD * Math.cos(((a[0] + b[0]) / 2) * RAD);
      var y = (b[0] - a[0]) * RAD;
      return Math.sqrt(x * x + y * y) * R;
    }

    function along(sg, frac) {
      frac = Math.max(0, Math.min(1, frac));
      var target = frac * sg.total;
      var pts = sg.pts, cum = sg.cum;
      for (var k = 1; k < pts.length; k++) {
        if (target <= cum[k] || k === pts.length - 1) {
          var l = cum[k] - cum[k - 1];
          var t = l > 0 ? Math.max(0, Math.min(1, (target - cum[k - 1]) / l)) : 0;
          return [pts[k - 1][0] + (pts[k][0] - pts[k - 1][0]) * t, pts[k - 1][1] + (pts[k][1] - pts[k - 1][1]) * t];
        }
      }
      return pts[pts.length - 1].slice();
    }

    // ---- Carreteras ----
    var infoCache = {};
    function roadInfo(name) {
      if (!roads[name]) return null;
      if (infoCache[name]) return infoCache[name];
      var r = roads[name];
      var intervals = [];
      var dual = 0;
      r.p.forEach(function (row, i) {
        if (row[3] >= 0) intervals.push([row[0], r.p[i + seg(row[3]).jump][0]]);
        else intervals.push([row[0], row[0]]);
        if (row[4] >= 0 && row[5] >= 0) dual++;
      });
      intervals.sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
      var ranges = [];
      intervals.forEach(function (iv) {
        var last = ranges[ranges.length - 1];
        if (last && iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1]);
        else ranges.push([iv[0], iv[1]]);
      });
      return (infoCache[name] = {
        name: name,
        type: r.t,
        heading: r.h,
        min: ranges[0][0],
        max: ranges[ranges.length - 1][1],
        ranges: ranges,
        dual: dual >= 3,
        count: r.p.length,
      });
    }

    function resolveRoad(input) {
      return byKey[key(input)] || null;
    }

    function suggest(input, limit) {
      limit = limit || 15;
      var k = key(input);
      if (!k) return names.slice(0, limit);
      var digits = /^\d+$/.test(k);
      var hits = names.filter(function (n) {
        var nk = key(n);
        if (nk.indexOf(k) === 0) return true;
        if (digits) return nk.replace(/^[A-Z]+/, '').indexOf(k) === 0;
        return false;
      });
      hits.sort(function (a, b) {
        var ea = key(a) === k ? 0 : 1, eb = key(b) === k ? 0 : 1;
        if (ea !== eb) return ea - eb;
        var la = key(a).length, lb = key(b).length;
        if (la !== lb) return la - lb;
        return names.indexOf(a) - names.indexOf(b);
      });
      return hits.slice(0, limit);
    }

    // "a2 44,3" | "CM-101 km 12" -> {road, km}
    function parseQuery(input) {
      var s = String(input || '').trim();
      var m = /^(.*?)[\s]+(?:km|pk)?\s*(\d{1,4}(?:[.,+]\d{1,3})?)$/i.exec(s);
      if (m) {
        var road = resolveRoad(m[1]);
        if (road) return { road: road, km: parseKm(m[2]) };
      }
      return { road: resolveRoad(s), km: NaN };
    }

    // ---- Localizar un km ----
    // dir: 0 = eje / ambos sentidos, 1 = sentido km creciente, -1 = sentido km decreciente
    function locate(name, km, dir) {
      var r = roads[name];
      if (!r || !isFinite(km)) return [];
      dir = dir === 1 || dir === -1 ? dir : 0;
      var rows = r.p;
      var found = [];

      function add(ll, extra) {
        for (var i = 0; i < found.length; i++) if (distance(found[i], ll) < 150) return;
        var o = [ll[0], ll[1]];
        found.push(o);
        o.extra = extra;
      }

      rows.forEach(function (row, i) {
        if (row[0] !== km) return;
        var ll = [row[1] / 1e5, row[2] / 1e5];
        var onCarriageway = false;
        if (dir === 1) {
          if (row[4] >= 0) { ll = seg(row[4]).pts[0].slice(); onCarriageway = true; }
          else rows.forEach(function (o, j) {
            if (!onCarriageway && o[4] >= 0 && j + seg(o[4]).jump === i) { var p = seg(o[4]).pts; ll = p[p.length - 1].slice(); onCarriageway = true; }
          });
        } else if (dir === -1) {
          if (row[5] >= 0) { var pb = seg(row[5]).pts; ll = pb[pb.length - 1].slice(); onCarriageway = true; }
          else rows.forEach(function (o, j) {
            if (!onCarriageway && o[5] >= 0 && j + seg(o[5]).jump === i) { ll = seg(o[5]).pts[0].slice(); onCarriageway = true; }
          });
        }
        add(ll, { exact: true, from: km, to: km, carriageway: onCarriageway });
      });

      rows.forEach(function (row, i) {
        if (row[3] < 0) return;
        var u = seg(row[3]);
        var a = row[0], b = rows[i + u.jump][0];
        if (!(a < km && km < b)) return;
        var f = (km - a) / (b - a);
        if (dir === 1 && row[4] >= 0) add(along(seg(row[4]), f), { exact: false, from: a, to: b, carriageway: true });
        else if (dir === -1 && row[5] >= 0) add(along(seg(row[5]), 1 - f), { exact: false, from: a, to: b, carriageway: true });
        else add(along(u, f), { exact: false, from: a, to: b, carriageway: false });
      });

      return found.map(function (ll) {
        return { road: name, km: km, dir: dir, lat: ll[0], lon: ll[1], exact: ll.extra.exact, from: ll.extra.from, to: ll.extra.to, carriageway: ll.extra.carriageway };
      });
    }

    // ---- PK más cercano a un punto ----
    function nearest(lat, lon, maxDist, limit) {
      maxDist = maxDist || 3000;
      limit = limit || 3;
      var cosLat = Math.cos(lat * RAD);
      var px = lon * RAD * R * cosLat, py = lat * RAD * R;
      var degBox = maxDist / 111000 + 0.02;
      var best = {};
      names.forEach(function (name) {
        var rows = roads[name].p;
        rows.forEach(function (row, i) {
          var rl = row[1] / 1e5, ro = row[2] / 1e5;
          if (Math.abs(rl - lat) > degBox + 0.05 || Math.abs(ro - lon) > (degBox + 0.05) / cosLat) return;
          var cand;
          if (row[3] < 0) {
            cand = { d: distance([lat, lon], [rl, ro]), km: row[0], lat: rl, lon: ro };
          } else {
            var u = seg(row[3]);
            var a = row[0], b = rows[i + u.jump][0];
            var pts = u.pts;
            for (var k = 1; k < pts.length; k++) {
              var ax = pts[k - 1][1] * RAD * R * cosLat, ay = pts[k - 1][0] * RAD * R;
              var bx = pts[k][1] * RAD * R * cosLat, by = pts[k][0] * RAD * R;
              var dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
              var t = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
              var d = Math.sqrt(Math.pow(px - ax - t * dx, 2) + Math.pow(py - ay - t * dy, 2));
              if (!cand || d < cand.d) {
                var walked = u.cum[k - 1] + t * (u.cum[k] - u.cum[k - 1]);
                var frac = u.total > 0 ? walked / u.total : 0;
                cand = {
                  d: d,
                  km: Math.round((a + (b - a) * frac) * 1000) / 1000,
                  lat: pts[k - 1][0] + (pts[k][0] - pts[k - 1][0]) * t,
                  lon: pts[k - 1][1] + (pts[k][1] - pts[k - 1][1]) * t,
                };
              }
            }
          }
          if (cand && cand.d <= maxDist && (!best[name] || cand.d < best[name].d)) best[name] = cand;
        });
      });
      return Object.keys(best).map(function (n) {
        var c = best[n];
        return { road: n, km: c.km, d: c.d, lat: c.lat, lon: c.lon };
      }).sort(function (a, b) { return a.d - b.d; }).slice(0, limit);
    }

    // ---- Para pintar ----
    function markers() {
      var out = [];
      names.forEach(function (n) {
        var t = roads[n].t;
        roads[n].p.forEach(function (row) { out.push({ road: n, type: t, km: row[0], lat: row[1] / 1e5, lon: row[2] / 1e5 }); });
      });
      return out;
    }

    function lines(name) {
      var r = roads[name];
      if (!r) return [];
      return r.p.filter(function (row) { return row[3] >= 0; }).map(function (row) { return seg(row[3]).pts; });
    }

    return {
      names: names,
      generated: data.generated,
      roadInfo: roadInfo,
      resolveRoad: resolveRoad,
      suggest: suggest,
      parseQuery: parseQuery,
      locate: locate,
      nearest: nearest,
      markers: markers,
      lines: lines,
      distance: distance,
    };
  }

  root.KMCore = {
    create: create,
    key: key,
    parseKm: parseKm,
    formatKm: formatKm,
    formatPk: formatPk,
    formatDist: formatDist,
    cardinal: cardinal,
  };
})(typeof window !== 'undefined' ? window : globalThis);
