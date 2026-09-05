const CACHE_NAME = "day-planner-v3";

const APP_FILES = [
    "/",
    "/index.html",
    "/css/style.css",
    "/js/app.js",
    "/manifest.json"
];

self.addEventListener("install", event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return cache.addAll(APP_FILES);
        })
    );

    self.skipWaiting();
});


self.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames
                    .filter(name => name !== CACHE_NAME)
                    .map(name => caches.delete(name))
            );
        })
    );

    self.clients.claim();
});


self.addEventListener("fetch", event => {

    const request = event.request;

    /*
     * API никогда не кэшируем
     */
    if (
        request.url.includes(
            "/.netlify/functions/"
        )
    ) {
        return;
    }

    /*
     * POST / PUT / DELETE тоже не кэшируем
     */
    if (request.method !== "GET") {
        return;
    }

    event.respondWith(
        fetch(request)
            .then(response => {

                /*
                 * Кэшируем только нормальные ответы
                 */
                if (
                    response &&
                    response.status === 200
                ) {

                    const responseClone =
                        response.clone();

                    caches.open(
                        CACHE_NAME
                    ).then(cache => {

                        cache.put(
                            request,
                            responseClone
                        );

                    });

                }

                return response;

            })
            .catch(() => {

                return caches.match(
                    request
                );

            })
    );

});