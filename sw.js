const CACHE_NAME = "fillio-v74";
const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css?v=74",
  "./app-core.js?v=74",
  "./app-data.js?v=74",
  "./app-stage.js?v=74",
  "./app.js?v=74",
  "./app-cells.js?v=74",
  "./app-library.js?v=74",
  "./app-folder.js?v=74",
  "./app-library-drag.js?v=74",
  "./app-trash.js?v=74",
  "./app-project-settings.js?v=74",
  "./app-settings.js?v=74",
  "./app-ui.js?v=74",
  "./app-project-modal.js?v=74",
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
