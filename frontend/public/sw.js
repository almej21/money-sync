const SW_VERSION =
  new URL(self.location.href).searchParams.get("v") || "dev";
const CACHE_NAME = `money-sync-${SW_VERSION}`;
const APP_SHELL = ["/", "/index.html"];

function isManifestOrIconRequest(pathname) {
  return (
    pathname === "/manifest.webmanifest" ||
    pathname === "/apple-touch-icon.png" ||
    pathname === "/favicon-32x32.png" ||
    pathname.startsWith("/icons/")
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.map((key) => (key !== CACHE_NAME ? caches.delete(key) : null)),
        ),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  if (isManifestOrIconRequest(url.pathname)) {
    event.respondWith(
      fetch(event.request, { cache: "no-store" }).catch(() =>
        caches.match(event.request),
      ),
    );
    return;
  }

  // SPA navigation fallback.
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() => caches.match("/index.html")),
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request)
        .then((response) => {
          if (!response || response.status !== 200 || response.type !== "basic") {
            return response;
          }
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => cached);

      return cached || networkFetch;
    }),
  );
});
