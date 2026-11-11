// Service Worker: macht die Galerie offline nutzbar (App-Dateien und KI-Bibliotheken werden zwischengespeichert).
const VERSION = 'galerie-v1';
const APP = [
  './', 'index.html', 'css/app.css', 'manifest.webmanifest', 'icon.svg',
  'js/app.js', 'js/util.js', 'js/db.js', 'js/store.js', 'js/exif.js', 'js/importer.js', 'js/analyzer.js', 'js/faces.js',
  'js/smart.js', 'js/search.js', 'js/viewer.js', 'js/layers.js', 'js/clip-worker.js',
  'js/fun/index.js', 'js/fun/common.js', 'js/fun/mosaic.js', 'js/fun/carousel.js', 'js/fun/slideshow.js', 'js/fun/studio.js', 'js/fun/games.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(APP)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('galerie-') && k !== VERSION && k !== 'galerie-cdn').map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // Bibliotheken und Gesichtsmodelle vom CDN: einmal laden, dann aus dem Cache (Versionen sind fest)
  if (url.hostname === 'cdn.jsdelivr.net') {
    e.respondWith(caches.open('galerie-cdn').then(async (c) => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      const res = await fetch(e.request);
      if (res.ok) c.put(e.request, res.clone());
      return res;
    }));
    return;
  }
  // eigene Dateien: erst Netz (für Updates), sonst Cache
  if (url.origin === location.origin) {
    e.respondWith(fetch(e.request).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true })));
  }
});
