// Offline support: the app shell is cached so the app opens without a
// connection. Job boards and the Anthropic API are always fetched live.

const CACHE = 'ajh-shell-v40';
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './js/app.js',
  './js/store.js',
  './js/jobs.js',
  './js/ai.js',
  './js/ui.js',
  './js/runtime.js',
  './js/files.js',
  './js/cvdoc.js',
  './js/portals.js',
  './js/style.js',
  './js/voice.js',
  './js/game.js',
  './js/account.js',
  './js/match.js',
  './js/webcache.js',
  './js/i18n.js',
  './js/suggest.js',
  './js/providers.js',
  './js/templates.js',
  './js/cv-fonts.js',
  './icons/vora-mark-96.png',
  './icons/vora-mark.png',
  './icons/favicon-48.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // The SDK module from the CDN is versioned and immutable: cache-first.
  if (url.hostname === 'cdn.jsdelivr.net') {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(request, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  // Same-origin app files: network-first so updates land fast, cache as fallback.
  event.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
        }
        return res;
      })
      .catch(() => caches.match(request).then((hit) => hit || caches.match('./index.html'))),
  );
});
