/* Service worker de LA RAMAL.
 * - La app (HTML, JS, CSS) queda guardada: abre aunque no haya señal.
 * - HTML: primero la red (para tomar versiones nuevas), si no hay, lo guardado.
 * - Archivos con hash de Vite (/assets/): primero lo guardado (nunca cambian).
 * - Nunca guarda llamadas a Firebase ni a otros sitios.
 * - Background Sync: cuando vuelve la señal, le avisa a la app que vacíe la cola de reportes.
 */
const VERSION = "la-ramal-v1";
// Rutas relativas al lugar donde está publicada (sirve en / y en /la-ramal/ de GitHub Pages).
const BASE = new URL("./", self.location).pathname;
const BASICOS = ["", "index.html", "manifest.webmanifest", "icono.svg"].map((p) => BASE + p);

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(BASICOS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith(BASE + "assets/")) {
    e.respondWith(
      caches.match(e.request).then((r) => r || fetch(e.request).then((resp) => {
        const copia = resp.clone();
        caches.open(VERSION).then((c) => c.put(e.request, copia));
        return resp;
      })),
    );
    return;
  }
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request)
        .then((resp) => {
          const copia = resp.clone();
          caches.open(VERSION).then((c) => c.put(e.request, copia));
          return resp;
        })
        .catch(() => caches.match(e.request).then((r) => r || caches.match(BASE))),
    );
  }
});

self.addEventListener("sync", (e) => {
  if (e.tag !== "cola-reportes") return;
  e.waitUntil(self.clients.matchAll({ includeUncontrolled: true }).then((cs) => cs.forEach((c) => c.postMessage("vaciar-cola"))));
});
