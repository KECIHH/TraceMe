const CACHE_VERSION = new URL(self.location.href).searchParams.get("v") || "dev";
const STATIC_CACHE = `traceme-static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `traceme-runtime-${CACHE_VERSION}`;
const OFFLINE_URL = "/offline.html";
const STATIC_ASSETS = [
  OFFLINE_URL,
  "/offline",
  "/manifest.webmanifest",
  "/icons/traceme-192.png",
  "/icons/traceme-192.svg",
  "/icons/traceme-512.png",
  "/icons/traceme-512.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name.startsWith("traceme-") && name !== STATIC_CACHE)
            .map((name) => caches.delete(name)),
        ),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  if (isSensitiveOrDynamicRequest(url)) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(STATIC_CACHE);
        return (await cache.match(OFFLINE_URL)) ?? Response.error();
      }),
    );
    return;
  }

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (STATIC_ASSETS.includes(url.pathname)) {
    event.respondWith(cacheFirst(request));
  }
});

async function cacheFirst(request) {
  const cached = await caches.match(request);

  if (cached) {
    return cached;
  }

  const response = await fetch(request);
  const cache = await caches.open(
    new URL(request.url).pathname.startsWith("/_next/static/")
      ? RUNTIME_CACHE
      : STATIC_CACHE,
  );

  await cache.put(request, response.clone());
  return response;
}

function isSensitiveOrDynamicRequest(url) {
  return (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/auth/") ||
    url.pathname.startsWith("/login") ||
    url.pathname.startsWith("/settings") ||
    url.pathname.startsWith("/storage/") ||
    url.pathname.includes("/documents/") ||
    url.pathname.includes("/backups/") ||
    url.pathname.includes("session") ||
    url.pathname.includes("token")
  );
}
