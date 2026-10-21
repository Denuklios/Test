// Service Worker: nur die statische App-Huelle wird gecacht. Daten und API nie (Datenschutz, Aktualitaet).
const CACHE = 'wf-shell-v1';
const SHELL = ['assets/app.css', 'assets/i18n.js', 'assets/app.js', 'icons/icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  const p = u.pathname;
  // Nur Assets/Schriften: Netzwerk zuerst, Cache als Rueckfall (offline).
  if (p.includes('/assets/')) {
    e.respondWith(fetch(e.request).then((r) => { const c = r.clone(); caches.open(CACHE).then((ca) => ca.put(e.request, c)); return r; }).catch(() => caches.match(e.request)));
  }
});
