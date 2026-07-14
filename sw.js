// Service Worker — estratégia network-first para código, cache-first para ícones/imagens.
// Bump esta versão sempre que quiser forçar update no cliente.
const CACHE_NAME = "precis-finance-v4";
const STATIC_ASSETS = [
  "/manifest.webmanifest",
  "/assets/icon.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)).catch(() => null)
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

function isHtmlRequest(request) {
  return request.mode === "navigate" || request.destination === "document";
}

function isCodeRequest(url) {
  return /\.(js|css|mjs|map)$/i.test(url.pathname) || url.pathname.endsWith("/env.js");
}

function isStaticAsset(url) {
  return /\.(svg|png|jpg|jpeg|gif|webp|ico|woff2?)$/i.test(url.pathname) || url.pathname === "/manifest.webmanifest";
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Nunca intercepta chamadas ao Supabase/APIs externas.
  if (url.origin !== self.location.origin) return;

  // HTML e código: network-first para nunca servir bundle desatualizado.
  if (isHtmlRequest(request) || isCodeRequest(url)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => null);
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          if (isHtmlRequest(request)) {
            const shell = await caches.match("/index.html");
            if (shell) return shell;
          }
          return Response.error();
        })
    );
    return;
  }

  // Ícones/imagens/manifest: cache-first com atualização em segundo plano.
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request)
          .then((response) => {
            if (response && response.ok) {
              const copy = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => null);
            }
            return response;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
  }
});
