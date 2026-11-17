/* Service worker di BOLT: fa funzionare il gioco anche offline.
 * Generato da vite.config.ts in fase di build (npm run build), che inserisce
 * l'impronta della build e l'elenco dei file da salvare. */
const CACHE = "bolt-24ffd1bcd0d1";
const PRECACHE = [
  "./",
  "./assets/bricolage-grotesque-latin-600-normal-Bw0J83-2.woff",
  "./assets/bricolage-grotesque-latin-600-normal-nxTgbNFE.woff2",
  "./assets/bricolage-grotesque-latin-800-normal-Br4b-5gk.woff",
  "./assets/bricolage-grotesque-latin-800-normal-J50vIsBe.woff2",
  "./assets/index-BqXx7w82.css",
  "./assets/index-CXCR58zL.js",
  "./assets/outfit-latin-400-normal-BGsTXAXT.woff2",
  "./assets/outfit-latin-400-normal-DMwTpYkH.woff",
  "./assets/outfit-latin-500-normal-ClnHRwRh.woff",
  "./assets/outfit-latin-500-normal-DKnIMDSk.woff2",
  "./favicon.svg",
  "./icons/apple-touch-icon.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/maskable-512.png",
  "./index.html",
  "./manifest.webmanifest"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("bolt-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Pagina (anche con ?c=CODICE): prima la rete, se manca si usa la copia salvata.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put("./index.html", copy));
          }
          return res;
        })
        .catch(() =>
          caches.match("./index.html", { ignoreVary: true }).then((hit) => hit || caches.match("./", { ignoreSearch: true, ignoreVary: true })),
        ),
    );
    return;
  }

  // File statici (hanno l'impronta nel nome): prima la copia salvata, poi la rete.
  event.respondWith(
    caches.match(req, { ignoreSearch: true, ignoreVary: true }).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok && res.type === "basic") {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
