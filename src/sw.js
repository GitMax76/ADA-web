import { setCacheNameDetails } from 'workbox-core';
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';

const prefix = `ada-web-${new URL(self.registration.scope).pathname}`;
const version = '0.2.0-beta';
setCacheNameDetails({ prefix, suffix: version });
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html'), {
  allowlist: [/^\/ADA-web\/(?:index\.html)?$/],
}));
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith(`${prefix}-`) && !key.endsWith(version))
      .map(key => caches.delete(key)),
  )));
});
// No skipWaiting or forced reload: updates activate after all app tabs close.
// Cache only build assets, never documents, blob URLs or arbitrary requests.
