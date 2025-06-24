// Простейший рабочий вариант
const CACHE_NAME = 'v1';
const urlsToCache = [
  '/',
  '/public/index.html',
  '/public/styles/main.css',
  '/public/scripts/main.js',
  '/icon-512x512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});
