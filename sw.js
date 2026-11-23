/* Vault service worker: makes the app installable and usable offline.
 * Network first (so updates show up right away), cache as the offline fallback.
 * Bump VERSION with the ?v= tags in index.html. */
const VERSION = '1.2';
const CACHE = 'vault-' + VERSION;
const SHELL = [
  './', './index.html', './manifest.webmanifest',
  './css/style.css?v=' + VERSION,
  './js/core.js?v=' + VERSION, './js/storage.js?v=' + VERSION, './js/camera.js?v=' + VERSION,
  './js/feedback.js?v=' + VERSION, './js/content.js?v=' + VERSION, './js/league.js?v=' + VERSION, './js/cloud.js?v=' + VERSION, './js/app.js?v=' + VERSION,
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('vault-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // fonts etc. go straight to the network
  e.respondWith(
    fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then(hit => hit || (req.mode === 'navigate' ? caches.match('./index.html') : undefined)))
  );
});
