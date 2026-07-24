// Service worker disabled — unregister self immediately
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
    e.waitUntil(
        self.registration.unregister().then(() => {
            return caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))));
        })
    );
});
