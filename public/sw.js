/**
 * PDF Form Filler — Service Worker
 * Caches app shell for offline support and fast loading
 */

const CACHE_NAME = 'pdf-filler-v5';
const OFFLINE_URL = '/offline.html';

// App shell files to pre-cache
const APP_SHELL = [
    '/',
    '/app.html',
    '/login.html',
    '/editor.html',
    '/bulk-fill.html',
    '/offline.html',
    '/css/styles.css',
    '/js/app.js',
    '/js/auth.js',
    '/js/bulk-fill.js',
    '/js/components.js',
    '/js/editor.js',
    '/js/fieldManager.js',
    '/js/pdfViewer.js',
    '/js/signature.js',
    '/js/Firebase-config.js',
    '/manifest.json',
    '/icons/icon-192.png',
    '/icons/icon-512.png'
];

// Install — pre-cache app shell
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[SW] Pre-caching app shell');
            return cache.addAll(APP_SHELL);
        })
    );
    self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter((name) => name !== CACHE_NAME)
                    .map((name) => {
                        console.log('[SW] Removing old cache:', name);
                        return caches.delete(name);
                    })
            );
        })
    );
    self.clients.claim();
});

// Fetch strategy
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Skip non-GET requests (POST, PUT, DELETE APIs)
    if (request.method !== 'GET') {
        return; // Let the browser handle these normally
    }

    // Skip cross-origin requests (Firebase, Google Fonts CDN, etc.)
    if (url.origin !== location.origin) return;

    // API calls → Network first, no cache fallback
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(
            fetch(request).catch(() => {
                return new Response(
                    JSON.stringify({ error: 'You are offline' }),
                    { status: 503, headers: { 'Content-Type': 'application/json' } }
                );
            })
        );
        return;
    }

    // Static assets & pages → Stale-While-Revalidate
    event.respondWith(
        caches.match(request).then((cachedResponse) => {
            const fetchPromise = fetch(request).then((networkResponse) => {
                // Return cache if it's there AND we're ok. Just update cache in background 
                // for HTML and JS specifically to avoid thrashing.
                if (networkResponse.ok && (request.destination === 'document' || request.destination === 'script' || request.destination === 'style')) {
                    const clone = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(request, clone);
                    });
                }
                return networkResponse;
            }).catch(() => {
                if (request.mode === 'navigate') {
                    return caches.match(OFFLINE_URL);
                }
                return new Response('Offline', { status: 503 });
            });

            // Return cached response immediately if available, otherwise wait for network
            return cachedResponse || fetchPromise;
        })
    );
});
