// Keeps a copy of the app on the phone so it opens with no signal.
// Always tries the network first, so updates arrive as soon as there's signal; falls back to the saved copy.
const CACHE = 'cbsa-app-v1';
const APP = ['/', '/index.html', '/styles.css', '/app.js', '/questions.js', '/pdf.js', '/icon.svg', '/icon-192.png', '/icon-512.png', '/icon-180.png', '/manifest.webmanifest'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(APP)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Only the app's own pages and files; the jobs themselves are saved by the app, and /api always goes to the server
  if (e.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  e.respondWith(
    fetch(e.request)
      .then(res => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return res; })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then(hit => hit || (e.request.mode === 'navigate' ? caches.match('/') : Response.error())))
  );
});
