/* Service worker di BOLT: fa funzionare il gioco anche offline.
 * Generato da vite.config.ts in fase di build (npm run build), che inserisce
 * l'impronta della build e l'elenco dei file da salvare. */
const CACHE = "bolt-__VERSION__";
const PRECACHE = __PRECACHE__;

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
  // La pagina /dev/ (Tracker) è un'app a sé: questo service worker non la gestisce.
  if (url.pathname.includes("/dev/") || /\/assets\/tracker-/.test(url.pathname)) return;
  if (req.referrer && new URL(req.referrer).pathname.includes("/dev/")) return;

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
