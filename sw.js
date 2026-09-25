const CACHE_NAME = "fillio-v45";
const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css?v=45",
  "./app-core.js?v=45",
  "./app-data.js?v=45",
  "./app-stage.js?v=45",
  "./app.js?v=45",
  "./app-cells.js?v=45",
  "./app-library.js?v=45",
  "./app-folder.js?v=45",
  "./app-library-drag.js?v=45",
  "./app-trash.js?v=45",
  "./app-project-settings.js?v=45",
  "./app-settings.js?v=45",
  "./app-ui.js?v=45",
  "./app-project-modal.js?v=45",
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
