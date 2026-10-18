/* Service worker: la app (y todos los PK) funcionan sin conexión tras la primera visita.
   Estrategia: responde desde caché y actualiza en segundo plano (la versión nueva se ve en la siguiente apertura). */
'use strict';
var CACHE = 'kmgu-v1';
var SHELL = [
  './', 'index.html', 'manifest.webmanifest',
  'css/app.css', 'js/core.js', 'js/app.js', 'data/pk.js',
  'vendor/leaflet/leaflet.js', 'vendor/leaflet/leaflet.css',
  'vendor/fonts/oswald-500.woff2', 'vendor/fonts/oswald-700.woff2',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png',
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // teselas del mapa: caché normal del navegador
  e.respondWith(caches.open(CACHE).then(function (cache) {
    return cache.match(req, { ignoreSearch: true }).then(function (hit) {
      var net = fetch(req).then(function (res) {
        if (res && res.ok && res.type === 'basic') cache.put(req, res.clone());
        return res;
      }).catch(function () {
        if (hit) return hit;
        if (req.mode === 'navigate') return cache.match('index.html').then(function (r) { return r || Response.error(); });
        return Response.error();
      });
      return hit || net;
    });
  }));
});
