const CACHE_NAME = "fillio-v83";
const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css?v=83",
  "./app-core.js?v=83",
  "./app-data.js?v=83",
  "./app-stage.js?v=83",
  "./app.js?v=83",
  "./app-cells.js?v=83",
  "./app-library.js?v=83",
  "./app-folder.js?v=83",
  "./app-library-drag.js?v=83",
  "./app-trash.js?v=83",
  "./app-project-settings.js?v=83",
  "./app-settings.js?v=83",
  "./app-ui.js?v=83",
  "./app-project-modal.js?v=83",
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
