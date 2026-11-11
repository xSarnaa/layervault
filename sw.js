/* LayerVault 3D – service worker: działanie bez internetu i zawsze najnowsza wersja, gdy jest internet.
   Własne pliki: najpierw sieć (z pominięciem pamięci przeglądarki – serwer trzyma pliki 10 minut), bez sieci – ostatnia zapisana kopia.
   Biblioteki z CDN (synchronizacja, skaner, .3mf): zapamiętane po pierwszym użyciu. */
const CACHE = 'lv3d-v1';
const CORE = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png'];

self.addEventListener('install', (event) => {
    event.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

function withTimeout(promise, timeoutMs) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
        promise.then((v) => { clearTimeout(timer); resolve(v); }, (err) => { clearTimeout(timer); reject(err); });
    });
}

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);
    if (url.origin === self.location.origin) {
        // Numer wersji zawsze prosto z serwera (i nigdy do pamięci) – po nim aplikacja poznaje, że jest nowsza
        if (url.pathname.endsWith('/version.json')) return;
        // cache: 'no-cache' = zapytaj serwer, czy plik się zmienił (bez tego nowa wersja pojawiała się nawet po 10 minutach)
        const net = fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' })
            .then((res) => ({ res, copy: res && res.ok ? res.clone() : null }));
        // Zapis także wtedy, gdy odpowiedź przyszła po czasie – następny start bez internetu ma już nową wersję
        event.waitUntil(net.then(({ copy }) => (copy ? caches.open(CACHE).then((c) => c.put(req, copy)) : null)).catch(() => {}));
        event.respondWith(
            withTimeout(net, 4000)
                .then(({ res }) => res)
                .catch(() => caches.match(req, { ignoreSearch: true })
                    .then((hit) => hit || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error())))
        );
        return;
    }
    if (/(^|\.)(cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|unpkg\.com)$/.test(url.hostname)) {
        event.respondWith(
            caches.match(req).then((hit) => hit || fetch(req).then((res) => {
                if (res && (res.ok || res.type === 'opaque')) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
                return res;
            }))
        );
    }
    // pozostałe (np. synchronizacja z Supabase) – zawsze prosto z sieci
});
