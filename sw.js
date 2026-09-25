const CACHE_NAME = "fillio-v42";
const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css?v=27",
  "./app-core.js?v=42",
  "./app-data.js?v=42",
  "./app-stage.js?v=42",
  "./app.js?v=42",
  "./app-cells.js?v=42",
  "./app-library.js?v=42",
  "./app-folder.js?v=42",
  "./app-library-drag.js?v=42",
  "./app-trash.js?v=42",
  "./app-project-settings.js?v=42",
  "./app-settings.js?v=42",
  "./app-ui.js?v=42",
  "./app-project-modal.js?v=42",
  "./fillio-logo.svg",
  "./fillio-mark.svg",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-192.png",
  "./icon-maskable-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put("./index.html", copy));
          return response;
        })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
      if (response && response.status === 200) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
      }
      return response;
    }))
  );
});
