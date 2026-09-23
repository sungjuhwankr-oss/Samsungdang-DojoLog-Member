const CACHE_NAME = "samsungdang-member-phase4i-b-v1";
const BUILD_ASSETS = /*__BUILD_ASSETS__*/ [];

function scoped(path) {
  return new URL(path.replace(/^\//, ""), self.registration.scope).toString();
}

const SHELL_PATHS = [
  "./",
  "./import/",
  "./membership/",
  "./promotion/",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
  ...BUILD_ASSETS
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_PATHS.map(scoped)))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(event.request, { ignoreSearch: true });
          if (cached) return cached;
          if (url.pathname.endsWith("/membership/") || url.pathname.endsWith("/membership")) {
            return caches.match(scoped("./membership/"));
          }
          if (url.pathname.endsWith("/promotion/") || url.pathname.endsWith("/promotion")) {
            return caches.match(scoped("./promotion/"));
          }
          if (url.pathname.endsWith("/import/") || url.pathname.endsWith("/import")) {
            return caches.match(scoped("./import/"));
          }
          return caches.match(scoped("./"));
        })
    );
    return;
  }

  if (url.pathname.includes("/_next/static/") || url.pathname.includes("/icons/") || url.pathname.endsWith("manifest.webmanifest")) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        });
      })
    );
  }
});
