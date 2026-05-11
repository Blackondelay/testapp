const CACHE_NAME = 'nexus-cache-v1';
const urlsToCache = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './manifest.json',
    './icon.svg',
    'https://unpkg.com/feather-icons'
];

// Install event: cache resources
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                return cache.addAll(urlsToCache);
            })
    );
});

// Fetch event: serve from cache or network
self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return;

    event.respondWith(
        caches.match(event.request)
            .then(response => {
                if (response) {
                    return response;
                }
                return fetch(event.request).then(
                    function(response) {
                        if(!response || response.status !== 200 || response.type !== 'basic') {
                            return response;
                        }
                        var responseToCache = response.clone();
                        caches.open(CACHE_NAME)
                            .then(function(cache) {
                                if(event.request.url.startsWith(self.location.origin) || 
                                   event.request.url.includes('unpkg.com') ||
                                   event.request.url.includes('fonts.googleapis.com') ||
                                   event.request.url.includes('ui-avatars.com')) {
                                    cache.put(event.request, responseToCache);
                                }
                            });
                        return response;
                    }
                );
            })
    );
});

// Activate event: clean up old caches
self.addEventListener('activate', event => {
    const cacheWhitelist = [CACHE_NAME];
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheWhitelist.indexOf(cacheName) === -1) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});
