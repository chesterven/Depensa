/**
 * Service worker de Despensa.
 * - Precarga todos los archivos estáticos para funcionar sin conexión.
 * - Navegaciones: red primero, con respaldo en caché (la app sigue abriendo offline).
 * - Recursos: caché primero, con actualización en segundo plano.
 * Los datos del usuario NO pasan por aquí: viven en IndexedDB.
 */
const VERSION = 'v2.0.0';
const CACHE_NAME = `despensa-${VERSION}`;

/* precache:start */
const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './css/responsive.css',
  './css/styles.css',
  './js/app-info.js',
  './js/app.js',
  './js/components/category-form.js',
  './js/components/product-form.js',
  './js/components/shopping-item-form.js',
  './js/components/store-form.js',
  './js/components/ui/confirm.js',
  './js/components/ui/empty.js',
  './js/components/ui/form.js',
  './js/components/ui/sheet.js',
  './js/components/ui/toast.js',
  './js/components/views/backup.js',
  './js/components/views/categories.js',
  './js/components/views/dashboard.js',
  './js/components/views/inventory.js',
  './js/components/views/more.js',
  './js/components/views/privacy.js',
  './js/components/views/product-detail.js',
  './js/components/views/settings.js',
  './js/components/views/shopping-list.js',
  './js/components/views/stores.js',
  './js/database/categories.js',
  './js/database/database.js',
  './js/database/photos.js',
  './js/database/products.js',
  './js/database/settings.js',
  './js/database/shopping-list.js',
  './js/database/stores.js',
  './js/install.js',
  './js/router.js',
  './js/services/backup-service.js',
  './js/services/demo-data.js',
  './js/services/inventory-service.js',
  './js/services/shopping-service.js',
  './js/state.js',
  './js/theme.js',
  './js/utils/date.js',
  './js/utils/dom.js',
  './js/utils/format.js',
  './js/utils/icons.js',
  './js/utils/id.js',
  './assets/fonts/fraunces-var.woff2',
  './assets/fonts/hanken-var.woff2',
  './assets/icons/apple-touch-icon.png',
  './assets/icons/favicon.ico',
  './assets/icons/icon-128.png',
  './assets/icons/icon-152.png',
  './assets/icons/icon-16.png',
  './assets/icons/icon-167.png',
  './assets/icons/icon-192.png',
  './assets/icons/icon-256.png',
  './assets/icons/icon-32.png',
  './assets/icons/icon-384.png',
  './assets/icons/icon-48.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-96.png',
  './assets/icons/maskable-192.png',
  './assets/icons/maskable-512.png',
  './assets/icons/splash-1125x2436.png',
  './assets/icons/splash-1170x2532.png',
  './assets/icons/splash-1179x2556.png',
  './assets/icons/splash-1242x2688.png',
  './assets/icons/splash-1290x2796.png',
  './assets/icons/splash-1536x2048.png',
  './assets/icons/splash-1668x2388.png',
  './assets/icons/splash-2048x2732.png',
  './assets/icons/splash-750x1334.png',
  './assets/icons/splash-828x1792.png',
];
/* precache:end */

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // addAll falla si un solo archivo falla: se agregan de a uno para ser tolerantes.
    await Promise.all(PRECACHE.map(async (url) => {
      try {
        await cache.add(new Request(url, { cache: 'reload' }));
      } catch (error) {
        console.warn('[sw] no se pudo precargar', url, error);
      }
    }));
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith('despensa-') && key !== CACHE_NAME)
      .map((key) => caches.delete(key)));
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.enable(); } catch (_) { /* sin soporte */ }
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

function isSameOrigin(url) {
  return new URL(url, self.location.href).origin === self.location.origin;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || !isSameOrigin(request.url)) return;

  // Navegación: red primero para recibir actualizaciones, caché como respaldo offline.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const preloaded = await event.preloadResponse;
        if (preloaded) return preloaded;
        const network = await fetch(request);
        const cache = await caches.open(CACHE_NAME);
        cache.put('./index.html', network.clone()).catch(() => {});
        return network;
      } catch (_) {
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match('./index.html'))
          || (await cache.match('./'))
          || new Response('<h1>Sin conexión</h1><p>Abre la aplicación una vez con Internet para poder usarla offline.</p>', {
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
            status: 200,
          });
      }
    })());
    return;
  }

  // Recursos estáticos: caché primero + revalidación en segundo plano.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request, { ignoreSearch: true });
    const network = fetch(request).then((response) => {
      if (response && response.status === 200 && response.type === 'basic') {
        cache.put(request, response.clone()).catch(() => {});
      }
      return response;
    }).catch(() => null);

    if (cached) {
      network.catch(() => {});
      return cached;
    }
    const response = await network;
    if (response) return response;
    return new Response('', { status: 504, statusText: 'Sin conexión' });
  })());
});
