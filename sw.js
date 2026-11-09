/**
 * sw.js — service worker for the installed / offline app.
 *
 * What it does: keeps a copy of the app's own files (index.html, css, js,
 * icons) so the app opens with no internet. It never touches the Google Apps
 * Script API — data and saved entries are handled by js/offline.js.
 *
 * When you deploy a new version of the app, change VERSION below so every
 * device picks up the new files.
 */
const VERSION = 'v20261006';
const CACHE = 'loan-monitor-' + VERSION;
const CORE = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Cache index.html, then every local file it refers to (css/js with their ?v= versions).
    try {
      const res = await fetch('./index.html', { cache: 'reload' });
      const html = await res.clone().text();
      await cache.put('./index.html', res.clone());
      await cache.put('./', res);
      const urls = [...html.matchAll(/(?:src|href)="([^"#]+)"/g)]
        .map(m => m[1])
        .filter(u => !/^(?:[a-z]+:|\/\/)/i.test(u));
      await Promise.all(urls.map(u => cache.add(new Request(u, { cache: 'reload' })).catch(() => {})));
    } catch (e) { /* offline during install — runtime caching will fill in later */ }
    await Promise.all(CORE.map(u => cache.add(u).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('loan-monitor-') && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

async function networkFirstPage(request) {
  const cache = await caches.open(CACHE);
  try {
    const fresh = await Promise.race([
      fetch(request),
      new Promise((_, rej) => setTimeout(() => rej(new Error('slow')), 4000))
    ]);
    if (fresh && fresh.ok) { cache.put('./index.html', fresh.clone()); cache.put('./', fresh.clone()); }
    return fresh;
  } catch (e) {
    return (await cache.match('./index.html')) || (await cache.match('./')) || Response.error();
  }
}

async function cacheFirstAsset(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  try {
    const res = await fetch(request);
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  } catch (e) {
    return (await cache.match(request, { ignoreSearch: true })) || Response.error();
  }
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Google Apps Script API etc. — always network
  if (req.mode === 'navigate') { event.respondWith(networkFirstPage(req)); return; }
  event.respondWith(cacheFirstAsset(req));
});
