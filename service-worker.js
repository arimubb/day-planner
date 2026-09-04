const CACHE_NAME = "day-planner-v1";

const APP_FILES = [
    "/",
    "/index.html",
    "/css/style.css",
    "/js/app.js",
    "/manifest.json"
];

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(APP_FILES);
        })
    );

    self.skipWaiting();
});


self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter((name) => name !== CACHE_NAME)
                    .map((name) => caches.delete(name))
            );
        })
    );

    self.clients.claim();
});


self.addEventListener("fetch", (event) => {

    /*
     * API-запросы не кэшируем.
     * Задачи должны всегда загружаться
     * актуальными из Supabase через Netlify.
     */
    if (
        event.request.url.includes("/.netlify/functions/")
    ) {
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then((response) => {

                const responseClone = response.clone();

                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, responseClone);
                });

                return response;
            })
            .catch(() => {
                return caches.match(event.request);
            })
    );

});