const CACHE_NAME = "fillio-v126";
const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css?v=126",
  "./app-core.js?v=126",
  "./app-i18n.js?v=126",
  "./app-data.js?v=126",
  "./app-stage.js?v=126",
  "./app.js?v=126",
  "./app-cells.js?v=126",
  "./app-library.js?v=126",
  "./app-folder.js?v=126",
  "./app-library-drag.js?v=126",
  "./app-trash.js?v=126",
  "./app-project-settings.js?v=126",
  "./app-settings.js?v=126",
  "./app-ui.js?v=126",
  "./app-project-modal.js?v=126",
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
