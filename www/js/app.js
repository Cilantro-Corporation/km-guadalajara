/* km. Guadalajara — interfaz */
(function () {
  'use strict';

  var K = window.KMCore;
  var C = K.create(window.PK_DATA);
  var $ = function (id) { return document.getElementById(id); };

  var ua = navigator.userAgent || '';
  var IS_IOS = /iP(hone|ad|od)/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  var IS_APPLE = IS_IOS || /Macintosh/.test(ua);
  var IS_NATIVE = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

  var TYPE_LABEL = { A: 'Autovía', N: 'Nacional', CM: 'Autonómica', GU: 'Provincial', O: 'Otra' };

  // ---------- Utilidades DOM (sin innerHTML con datos) ----------
  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') n.className = attrs[k];
      else if (k === 'text') n.textContent = attrs[k];
      else if (k.indexOf('on') === 0) n.addEventListener(k.slice(2), attrs[k]);
      else n.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c != null) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }

  var toastTimer;
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 2200);
  }

  // ---------- Almacenamiento local (favoritos / recientes) ----------
  var store = {
    read: function (k) {
      try {
        var v = JSON.parse(localStorage.getItem('kmgu.' + k) || '[]');
        return Array.isArray(v) ? v.filter(validItem).slice(0, 50) : [];
      } catch (e) { return []; }
    },
    write: function (k, v) {
      try { localStorage.setItem('kmgu.' + k, JSON.stringify(v)); } catch (e) { /* modo privado */ }
    },
  };
  function validItem(x) {
    return x && typeof x.road === 'string' && C.roadInfo(x.road) && typeof x.km === 'number' && isFinite(x.km) &&
      (x.dir === 0 || x.dir === 1 || x.dir === -1);
  }
  function itemKey(x) { return x.road + '|' + x.km + '|' + x.dir; }

  // ---------- Mapa ----------
  var bounds = L.latLngBounds(C.markers().map(function (m) { return [m.lat, m.lon]; }));
  var map = L.map('map', {
    zoomControl: false,
    attributionControl: true,
    maxBounds: bounds.pad(2.5),
    minZoom: 6,
    maxZoom: 19,
    zoomSnap: 0.25,
    zoomDelta: 0.5,
    wheelPxPerZoomLevel: 90,
  });
  var WMTS = 'https://www.ign.es/wmts/{svc}?service=WMTS&request=GetTile&version=1.0.0&layer={layer}&style=default&tilematrixset=GoogleMapsCompatible&format={fmt}&tilematrix={z}&tilerow={y}&tilecol={x}';
  var ATTR = '© <a href="https://www.ign.es" target="_blank" rel="noopener">IGN</a> · PK: IGN · trazado © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OSM</a>';
  var baseMap = L.tileLayer(WMTS, { svc: 'ign-base', layer: 'IGNBaseTodo', fmt: 'image/png', maxNativeZoom: 17, maxZoom: 19, attribution: ATTR });
  var ortho = L.layerGroup([
    L.tileLayer(WMTS, { svc: 'pnoa-ma', layer: 'OI.OrthoimageCoverage', fmt: 'image/jpeg', maxNativeZoom: 19, maxZoom: 19, attribution: ATTR + ' · PNOA' }),
    L.tileLayer(WMTS, { svc: 'ign-base', layer: 'IGNBaseOrto', fmt: 'image/png', maxNativeZoom: 17, maxZoom: 19 }),
  ]);
  baseMap.addTo(map);
  var satellite = false;
  try { satellite = localStorage.getItem('kmgu.sat') === '1'; } catch (e) { /* */ }
  function applyLayer() {
    if (satellite) { map.removeLayer(baseMap); ortho.addTo(map); } else { map.removeLayer(ortho); baseMap.addTo(map); }
    $('btnLayer').classList.toggle('on', satellite);
  }
  applyLayer();
  if (window.matchMedia('(min-width: 760px)').matches) L.control.zoom({ position: 'topright' }).addTo(map);

  // Contorno de la provincia
  var outline = (window.PK_DATA.outline || []).map(function (f) {
    var pts = [];
    for (var i = 0; i + 1 < f.length; i += 2) pts.push([f[i] / 1e4, f[i + 1] / 1e4]);
    return pts;
  });
  if (outline.length) {
    // Oscurece lo que queda fuera de la provincia
    L.polygon([[[85, -180], [85, 180], [-85, 180], [-85, -180]]].concat(outline), {
      stroke: false, fillColor: '#0B0B0B', fillOpacity: 0.28, interactive: false,
    }).addTo(map);
    L.polyline(outline, { color: '#0B0B0B', weight: 6, opacity: 0.45, interactive: false }).addTo(map);
    L.polyline(outline, { color: '#C6F400', weight: 3, opacity: 1, interactive: false }).addTo(map);
  }
  var provBounds = outline.length ? L.latLngBounds([].concat.apply([], outline)) : bounds;

  function topOffset() { return $('searchForm').getBoundingClientRect().bottom; }
  function bottomOffset() { return document.body.classList.contains('sheet-open') ? $('sheet').offsetHeight : 0; }
  function fitAll() {
    map.invalidateSize();
    map.fitBounds(provBounds, { paddingTopLeft: [8, topOffset() + 8], paddingBottomRight: [8, 8], animate: false });
  }
  map.setView(provBounds.getCenter(), 8, { animate: false });
  fitAll();
  if (!map.getSize().x) window.addEventListener('load', fitAll);

  // Centra un punto en la zona visible (entre el buscador y la ficha)
  function focusPoint(lat, lon, zoom) {
    var z = zoom == null ? Math.max(map.getZoom(), 15) : zoom;
    var size = map.getSize();
    var visTop = topOffset(), visBottom = size.y - bottomOffset();
    var dy = size.y / 2 - (visTop + visBottom) / 2;
    var pt = map.project([lat, lon], z).add([0, dy]);
    map.setView(map.unproject(pt, z), z, { animate: true });
  }

  // ---------- Hitos sobre el mapa ----------
  var allMarkers = C.markers();
  var pkLayer = L.layerGroup().addTo(map);
  var markerCache = {};
  var hlRoad = null;
  function step(z) { return z >= 13 ? 1 : z >= 11 ? 5 : z >= 9 ? 10 : 0; }
  function renderMarkers() {
    var z = map.getZoom();
    var st = step(z);
    var b = map.getBounds().pad(0.15);
    var want = {};
    if (st) {
      for (var i = 0; i < allMarkers.length; i++) {
        var m = allMarkers[i];
        if (m.km % st !== 0 && m.road !== hlRoad) continue;
        if (st === 10 && m.type === 'GU' && m.road !== hlRoad) continue;
        if (!b.contains([m.lat, m.lon])) continue;
        want[i] = true;
      }
    }
    Object.keys(markerCache).forEach(function (i) {
      if (!want[i]) { pkLayer.removeLayer(markerCache[i]); delete markerCache[i]; }
    });
    Object.keys(want).forEach(function (i) {
      var m = allMarkers[i];
      var cls = 'pk pk-' + m.type + (m.road === hlRoad ? ' road-hl' : '');
      if (markerCache[i]) {
        var node = markerCache[i].getElement();
        if (node && node.firstChild) node.firstChild.className = cls;
        return;
      }
      var span = document.createElement('span');
      span.className = cls;
      span.textContent = z >= 14 ? m.road + ' · ' + m.km : String(m.km);
      span.title = m.road + ' km ' + m.km;
      var mk = L.marker([m.lat, m.lon], {
        icon: L.divIcon({ className: 'pk-icon', html: span, iconSize: null }),
        keyboard: false,
        riseOnHover: true,
      });
      mk.on('click', function () {
        var d = m.road === selectedRoad ? dir : 0;
        // Si ese km existe en varios sitios, primero el hito pulsado
        var res = C.locate(m.road, m.km, d).sort(function (a, b) {
          return C.distance([a.lat, a.lon], [m.lat, m.lon]) - C.distance([b.lat, b.lon], [m.lat, m.lon]);
        });
        showResult(res, d, true);
      });
      markerCache[i] = mk.addTo(pkLayer);
    });
  }
  var lastZoomBand = null;
  map.on('zoomend', function () {
    var band = map.getZoom() >= 14;
    if (band !== lastZoomBand) { lastZoomBand = band; Object.keys(markerCache).forEach(function (i) { pkLayer.removeLayer(markerCache[i]); delete markerCache[i]; }); }
    renderMarkers();
  });
  map.on('moveend', renderMarkers);
  renderMarkers();

  var roadLine = L.layerGroup().addTo(map);
  function highlightRoad(name) {
    hlRoad = name;
    roadLine.clearLayers();
    if (name) {
      C.lines(name).forEach(function (pts) {
        L.polyline(pts, { color: '#0B0B0B', weight: 9, opacity: 0.55, interactive: false }).addTo(roadLine);
        L.polyline(pts, { color: '#C6F400', weight: 5, opacity: 0.95, interactive: false }).addTo(roadLine);
      });
    }
    Object.keys(markerCache).forEach(function (i) { pkLayer.removeLayer(markerCache[i]); delete markerCache[i]; });
    renderMarkers();
  }

  var targetMarker = null;
  function setTarget(lat, lon) {
    if (targetMarker) map.removeLayer(targetMarker);
    targetMarker = L.marker([lat, lon], {
      icon: L.divIcon({ className: 'pk-icon', html: '<span class="target"></span>', iconSize: [26, 26], iconAnchor: [13, 13] }),
      interactive: false, zIndexOffset: 1000, keyboard: false,
    }).addTo(map);
  }

  // ---------- Buscador ----------
  var roadInput = $('road'), kmInput = $('km'), suggestBox = $('suggest'), hint = $('hint'), dirBox = $('dir');
  var selectedRoad = null;
  var dir = 0;

  function rangesText(info) {
    return info.ranges.map(function (r) { return r[0] === r[1] ? 'km ' + r[0] : 'km ' + r[0] + '–' + r[1]; }).join(' · ');
  }

  function chip(name) {
    var info = C.roadInfo(name);
    return el('button', {
      type: 'button', class: 'chip' + (name === selectedRoad ? ' sel' : ''), role: 'option',
      onclick: function () { pickRoad(name, true); },
    }, [
      el('span', { class: 'dot road-' + info.type }),
      el('span', { class: 'chip-name', text: name }),
      el('small', { text: info.min === info.max ? 'km ' + info.min : 'km ' + info.min + '–' + info.max }),
    ]);
  }

  function renderSuggest() {
    var val = roadInput.value;
    var list = C.suggest(val, 20);
    clear(suggestBox);
    // Si ya coincide exactamente, se ofrecen solo las otras carreteras parecidas (A-2 -> A-202, A-211...)
    if (selectedRoad && C.resolveRoad(val) === selectedRoad) list = list.filter(function (n) { return n !== selectedRoad; }).slice(0, 8);
    list.forEach(function (n) { suggestBox.appendChild(chip(n)); });
    suggestBox.hidden = list.length === 0;
    if (!val.trim()) { setHint(null); return; }
    if (!list.length && !selectedRoad) setHint('No hay ninguna carretera «' + val.trim().slice(0, 20) + '» con puntos kilométricos en la provincia.', true);
    else if (!selectedRoad) setHint(null);
  }

  function setHint(content, isErr) {
    clear(hint);
    if (!content) { hint.hidden = true; return; }
    if (typeof content === 'string') hint.textContent = content; else hint.appendChild(content);
    hint.classList.toggle('err', !!isErr);
    hint.hidden = false;
  }

  function roadHint(name) {
    var info = C.roadInfo(name);
    return el('span', null, [
      el('span', { class: 'dot road-' + info.type }),
      ' ', el('b', { text: name }), ' · ' + TYPE_LABEL[info.type] + ' · en la provincia: ',
      el('b', { text: rangesText(info) }),
    ]);
  }

  function renderDir() {
    var info = selectedRoad && C.roadInfo(selectedRoad);
    var show = !!(info && info.dual);
    dirBox.hidden = !show;
    if (!show) { dir = 0; return; }
    var up = K.cardinal(info.heading), down = K.cardinal(info.heading + 180);
    var labels = { '0': 'Ambos', '1': 'km ↑ (hacia ' + up + ')', '-1': 'km ↓ (hacia ' + down + ')' };
    Array.prototype.forEach.call(dirBox.querySelectorAll('button'), function (b) {
      b.textContent = labels[b.dataset.dir];
      b.classList.toggle('active', +b.dataset.dir === dir);
      b.setAttribute('aria-pressed', +b.dataset.dir === dir ? 'true' : 'false');
    });
  }

  function pickRoad(name, focusKm) {
    selectedRoad = name;
    roadInput.value = name;
    renderSuggest();
    setHint(roadHint(name));
    renderDir();
    highlightRoad(name);
    if (focusKm) kmInput.focus();
  }

  roadInput.addEventListener('input', function () {
    var q = C.parseQuery(roadInput.value);
    if (q.road && isFinite(q.km)) {
      // Han escrito "A-2 44" en el campo de carretera
      selectedRoad = q.road;
    } else {
      var r = C.resolveRoad(roadInput.value);
      if (r !== selectedRoad) {
        selectedRoad = r;
        renderDir();
        highlightRoad(r);
      }
    }
    renderSuggest();
    if (selectedRoad && C.resolveRoad(roadInput.value) === selectedRoad) setHint(roadHint(selectedRoad));
  });
  roadInput.addEventListener('focus', function () { renderSuggest(); });
  roadInput.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    var q = C.parseQuery(roadInput.value);
    if (q.road && isFinite(q.km)) {
      pickRoad(q.road, false);
      kmInput.value = K.formatKm(q.km);
      search();
      return;
    }
    if (q.road) { pickRoad(q.road, true); return; }
    var first = C.suggest(roadInput.value, 1)[0];
    if (first) pickRoad(first, true);
  });
  $('clearRoad').addEventListener('click', function () {
    roadInput.value = ''; kmInput.value = ''; selectedRoad = null;
    renderDir(); highlightRoad(null); renderSuggest(); setHint(null); closeSheet();
    roadInput.focus();
  });
  dirBox.addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    dir = +b.dataset.dir;
    renderDir();
    if (current && current.road === selectedRoad) search();
  });

  $('searchForm').addEventListener('submit', function (e) { e.preventDefault(); search(); });

  function search() {
    var q = C.parseQuery(roadInput.value);
    var road = selectedRoad || q.road || C.suggest(roadInput.value, 1)[0];
    var km = K.parseKm(kmInput.value);
    if (!isFinite(km) && q.road && isFinite(q.km)) { km = q.km; road = q.road; }
    if (!road) { setHint('Escribe una carretera (por ejemplo A-2, CM-101 o GU-211).', true); roadInput.focus(); return; }
    if (road !== selectedRoad) pickRoad(road, false);
    if (!kmInput.value.trim()) {
      setHint(roadHint(road));
      kmInput.focus();
      var lines = C.lines(road);
      if (lines.length) map.fitBounds(L.latLngBounds([].concat.apply([], lines)), { paddingTopLeft: [10, topOffset() + 10], paddingBottomRight: [10, 20] });
      return;
    }
    if (!isFinite(km)) { setHint('Km no válido. Ejemplos: 44 · 44,3 · 44+300', true); kmInput.focus(); return; }
    var res = C.locate(road, km, dir);
    if (!res.length) {
      var info = C.roadInfo(road);
      setHint(el('span', null, ['El km ' + K.formatKm(km) + ' de la ', el('b', { text: road }), ' no está en la provincia. Tramos: ', el('b', { text: rangesText(info) })]), true);
      kmInput.focus();
      return;
    }
    setHint(roadHint(road));
    roadInput.blur(); kmInput.blur();
    suggestBox.hidden = true;
    showResult(res, dir, false);
  }

  // ---------- Ficha de resultado ----------
  var current = null, alternatives = [], altIdx = 0;

  function navLinks(lat, lon) {
    var ll = lat.toFixed(6) + ',' + lon.toFixed(6);
    return {
      google: 'https://www.google.com/maps/dir/?api=1&destination=' + ll + '&travelmode=driving',
      apple: 'https://maps.apple.com/?daddr=' + ll + '&dirflg=d',
      waze: 'https://waze.com/ul?ll=' + ll + '&navigate=yes',
      view: 'https://www.google.com/maps/search/?api=1&query=' + ll,
    };
  }

  function dirText(r) {
    if (!r.dir) return null;
    var info = C.roadInfo(r.road);
    var c = K.cardinal(r.dir === 1 ? info.heading : info.heading + 180);
    return 'Sentido ' + (r.dir === 1 ? 'creciente' : 'decreciente') + ' (hacia ' + c + ')' + (r.carriageway ? '' : ' · sin calzada separada aquí');
  }

  function showResult(list, d, fromMap) {
    if (!list || !list.length) return;
    alternatives = list; altIdx = 0;
    if (fromMap && list[0].road !== selectedRoad) {
      selectedRoad = list[0].road;
      roadInput.value = selectedRoad;
      dir = 0;
      renderDir();
      highlightRoad(selectedRoad);
      setHint(roadHint(selectedRoad));
      suggestBox.hidden = true;
    }
    if (fromMap) kmInput.value = K.formatKm(list[0].km);
    renderResult();
    addRecent(current);
  }

  function renderResult() {
    var r = current = alternatives[altIdx];
    var info = C.roadInfo(r.road);
    var rr = $('resRoad');
    rr.textContent = r.road;
    rr.className = 'res-road road-' + info.type;
    clear($('resKm'));
    $('resKm').appendChild(document.createTextNode('km ' + K.formatKm(r.km) + ' '));
    $('resKm').appendChild(el('small', { text: 'PK ' + K.formatPk(r.km) }));

    var sub = $('resSub');
    clear(sub);
    sub.appendChild(el('div', null, [el('b', { text: r.lat.toFixed(6) + ', ' + r.lon.toFixed(6) })]));
    sub.appendChild(el('div', {
      text: r.exact ? 'Hito kilométrico oficial (IGN)' : 'Posición estimada sobre la vía entre el km ' + r.from + ' y el ' + r.to,
    }));
    var dt = dirText(r);
    if (dt) sub.appendChild(el('div', { text: dt }));
    if (alternatives.length > 1) {
      sub.appendChild(el('button', {
        type: 'button', class: 'alt',
        text: 'Este km aparece en ' + alternatives.length + ' sitios · ver el siguiente (' + (altIdx + 1) + '/' + alternatives.length + ')',
        onclick: function () { altIdx = (altIdx + 1) % alternatives.length; renderResult(); },
      }));
    }

    var links = navLinks(r.lat, r.lon);
    $('navGoogle').href = links.google;
    $('navApple').href = links.apple;
    $('navWaze').href = links.waze;
    $('navApple').hidden = !IS_APPLE;
    $('navBtns').classList.toggle('one', !IS_APPLE);
    var text = r.road + ' km ' + K.formatKm(r.km) + (r.dir ? ' (' + (r.dir === 1 ? 'sentido creciente' : 'sentido decreciente') + ')' : '') + '\n' + links.view;
    $('actWhats').href = 'https://wa.me/?text=' + encodeURIComponent(text);
    renderFav();

    var sheet = $('sheet');
    sheet.hidden = false;
    document.body.classList.add('sheet-open');
    document.documentElement.style.setProperty('--sheet-h', sheet.offsetHeight + 'px');
    setTarget(r.lat, r.lon);
    focusPoint(r.lat, r.lon, Math.max(map.getZoom(), 16));
    try { history.replaceState(null, '', '#' + encodeURIComponent(r.road) + '/' + r.km + (r.dir ? '/' + r.dir : '')); } catch (e) { /* */ }
  }

  function closeSheet() {
    $('sheet').hidden = true;
    document.body.classList.remove('sheet-open');
    if (targetMarker) { map.removeLayer(targetMarker); targetMarker = null; }
    current = null;
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* */ }
  }
  $('sheetClose').addEventListener('click', closeSheet);

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).catch(function () { return legacyCopy(text); });
    }
    return legacyCopy(text);
  }
  function legacyCopy(text) {
    return new Promise(function (resolve, reject) {
      var ta = el('textarea', { readonly: '' });
      ta.style.position = 'fixed'; ta.style.top = '-100px'; ta.style.opacity = '0';
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy') ? resolve() : reject(); } catch (e) { reject(e); }
      document.body.removeChild(ta);
    });
  }
  $('actCopy').addEventListener('click', function () {
    if (!current) return;
    copyText(current.lat.toFixed(6) + ', ' + current.lon.toFixed(6))
      .then(function () { toast('Coordenadas copiadas'); }, function () { toast('No se pudo copiar'); });
  });

  // ---------- Favoritos y recientes ----------
  function compact(r) { return { road: r.road, km: r.km, dir: r.dir || 0 }; }
  function addRecent(r) {
    var item = compact(r);
    var list = store.read('rec').filter(function (x) { return itemKey(x) !== itemKey(item); });
    list.unshift(item);
    store.write('rec', list.slice(0, 20));
  }
  function isFav(r) { return store.read('fav').some(function (x) { return itemKey(x) === itemKey(compact(r)); }); }
  function renderFav() {
    var on = current && isFav(current);
    $('resFav').classList.toggle('on', !!on);
    $('resFav').setAttribute('aria-pressed', on ? 'true' : 'false');
  }
  $('resFav').addEventListener('click', function () {
    if (!current) return;
    var item = compact(current);
    var list = store.read('fav');
    if (isFav(current)) {
      list = list.filter(function (x) { return itemKey(x) !== itemKey(item); });
      toast('Quitado de favoritos');
    } else {
      list.unshift(item);
      toast('Guardado en favoritos');
    }
    store.write('fav', list.slice(0, 50));
    renderFav();
    if (!$('panel').hidden) renderList();
  });

  var tab = 'fav';
  function renderList() {
    var list = store.read(tab);
    var ul = $('list');
    clear(ul);
    if (!list.length) {
      ul.appendChild(el('li', { class: 'empty', text: tab === 'fav' ? 'Aún no tienes favoritos. Pulsa la estrella de un resultado para guardarlo aquí.' : 'Aquí aparecerán tus últimas búsquedas.' }));
      return;
    }
    list.forEach(function (x) {
      var info = C.roadInfo(x.road);
      ul.appendChild(el('li', null, [
        el('button', {
          type: 'button', class: 'open',
          onclick: function () { openItem(x); },
        }, [
          el('span', { class: 'dot road-' + info.type }),
          el('b', { text: x.road + ' · km ' + K.formatKm(x.km) }),
          x.dir ? el('span', { text: x.dir === 1 ? 'km ↑' : 'km ↓' }) : null,
        ]),
        el('button', {
          type: 'button', class: 'del', 'aria-label': 'Quitar', text: '×',
          onclick: function () {
            store.write(tab, store.read(tab).filter(function (y) { return itemKey(y) !== itemKey(x); }));
            renderList();
            if (current) renderFav();
          },
        }),
      ]));
    });
  }
  function openItem(x) {
    var res = C.locate(x.road, x.km, x.dir);
    if (!res.length) { toast('Ese punto ya no está disponible'); return; }
    $('panel').hidden = true;
    pickRoad(x.road, false);
    dir = x.dir; renderDir();
    kmInput.value = K.formatKm(x.km);
    showResult(res, x.dir, false);
  }
  $('btnLists').addEventListener('click', function () {
    var p = $('panel');
    p.hidden = !p.hidden;
    if (!p.hidden) renderList();
  });
  $('panelClose').addEventListener('click', function () { $('panel').hidden = true; });
  Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (b) {
    b.addEventListener('click', function () {
      tab = b.dataset.tab;
      Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (o) { o.classList.toggle('active', o === b); });
      renderList();
    });
  });

  // ---------- Ubicación y PK más cercano ----------
  var watchId = null, meMarker = null, accCircle = null, firstFix = false;
  function nearBox(title, lat, lon, accuracy) {
    var box = $('near');
    clear(box);
    var res = C.nearest(lat, lon, 3000, 3);
    box.appendChild(el('div', { class: 'near-t', text: title }));
    if (!res.length) {
      box.appendChild(el('div', { class: 'near-d', text: 'No hay ninguna carretera con PK a menos de 3 km.' }));
    } else {
      res.forEach(function (n, i) {
        box.appendChild(el('button', {
          type: 'button',
          onclick: function () {
            var km = Math.round(n.km * 10) / 10;
            var loc = C.locate(n.road, km, 0);
            showResult(loc.length ? loc : [{ road: n.road, km: km, dir: 0, lat: n.lat, lon: n.lon, exact: false, from: Math.floor(km), to: Math.ceil(km) }], 0, true);
          },
        }, [
          el('div', { class: i ? 'near-v near-small' : 'near-v' }, [el('em', { text: n.road }), ' km ' + K.formatKm(Math.round(n.km * 10) / 10)]),
          el('div', { class: 'near-d', text: 'a ' + K.formatDist(n.d) + (accuracy ? ' · precisión GPS ±' + Math.round(accuracy) + ' m' : '') }),
        ]));
        accuracy = null;
      });
    }
    box.hidden = false;
  }
  function stopLocate() {
    if (watchId != null) navigator.geolocation.clearWatch(watchId);
    watchId = null;
    if (meMarker) { map.removeLayer(meMarker); map.removeLayer(accCircle); meMarker = accCircle = null; }
    $('btnLocate').classList.remove('on');
    $('near').hidden = true;
  }
  $('btnLocate').addEventListener('click', function () {
    if (watchId != null) { stopLocate(); return; }
    if (!('geolocation' in navigator)) { toast('Este dispositivo no permite obtener la ubicación'); return; }
    $('btnLocate').classList.add('on');
    firstFix = true;
    toast('Buscando tu ubicación…');
    watchId = navigator.geolocation.watchPosition(function (pos) {
      var lat = pos.coords.latitude, lon = pos.coords.longitude, acc = pos.coords.accuracy;
      if (!meMarker) {
        accCircle = L.circle([lat, lon], { radius: acc, color: '#1A73E8', weight: 1, fillOpacity: 0.1, interactive: false }).addTo(map);
        meMarker = L.marker([lat, lon], { icon: L.divIcon({ className: 'pk-icon', html: '<span class="me"></span>', iconSize: [18, 18], iconAnchor: [9, 9] }), interactive: false, keyboard: false }).addTo(map);
      } else { meMarker.setLatLng([lat, lon]); accCircle.setLatLng([lat, lon]).setRadius(acc); }
      nearBox('PK más cercano a ti', lat, lon, acc);
      if (firstFix) { firstFix = false; closeSheet(); focusPoint(lat, lon, 15); }
    }, function (err) {
      stopLocate();
      toast(err.code === 1 ? 'Permiso de ubicación denegado. Actívalo en los ajustes.' : 'No se pudo obtener la ubicación');
    }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
  });

  // Mantener pulsado (o clic derecho) en el mapa: PK más cercano a ese punto.
  // iOS Safari no lanza "contextmenu" al mantener pulsado, así que se detecta a mano.
  var lastPress = 0;
  function pressAt(latlng) {
    if (Date.now() - lastPress < 800) return;
    lastPress = Date.now();
    closeSheet();
    nearBox('PK más cercano al punto marcado', latlng.lat, latlng.lng, null);
    setTarget(latlng.lat, latlng.lng);
  }
  map.on('contextmenu', function (e) { pressAt(e.latlng); });
  (function () {
    var timer = null, start = null;
    var box = map.getContainer();
    function cancel() { clearTimeout(timer); timer = null; }
    box.addEventListener('touchstart', function (e) {
      cancel();
      if (e.touches.length !== 1) return;
      var t = e.touches[0];
      start = [t.clientX, t.clientY];
      timer = setTimeout(function () {
        var r = box.getBoundingClientRect();
        pressAt(map.containerPointToLatLng([start[0] - r.left, start[1] - r.top]));
      }, 600);
    }, { passive: true });
    box.addEventListener('touchmove', function (e) {
      var t = e.touches[0];
      if (!start || !t || Math.abs(t.clientX - start[0]) > 10 || Math.abs(t.clientY - start[1]) > 10) cancel();
    }, { passive: true });
    box.addEventListener('touchend', cancel, { passive: true });
    box.addEventListener('touchcancel', cancel, { passive: true });
  })();

  $('btnLayer').addEventListener('click', function () {
    satellite = !satellite;
    try { localStorage.setItem('kmgu.sat', satellite ? '1' : '0'); } catch (e) { /* */ }
    applyLayer();
  });

  // ---------- Enlace directo #A-2/44.3/1 ----------
  function fromHash() {
    var h = (location.hash || '').slice(1);
    if (!h) return;
    var parts;
    try { parts = decodeURIComponent(h).split('/'); } catch (e) { return; }
    var road = C.resolveRoad(parts[0]);
    var km = K.parseKm(parts[1]);
    var d = parts[2] === '1' ? 1 : parts[2] === '-1' ? -1 : 0;
    if (!road) return;
    pickRoad(road, false);
    if (!isFinite(km)) return;
    dir = C.roadInfo(road).dual ? d : 0; renderDir();
    kmInput.value = K.formatKm(km);
    var res = C.locate(road, km, dir);
    if (res.length) showResult(res, dir, false);
  }
  fromHash();

  $('dataDate').textContent = 'Datos generados el ' + C.generated + '.';
  if ($('apkLink')) $('apkLink').hidden = IS_NATIVE || IS_IOS;

  // ---------- PWA ----------
  // (En la app Android los archivos ya van dentro del APK: no hace falta service worker)
  if ('serviceWorker' in navigator && location.protocol === 'https:' && location.hostname !== 'localhost' && !IS_NATIVE) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () { /* */ }); });
  }
})();
