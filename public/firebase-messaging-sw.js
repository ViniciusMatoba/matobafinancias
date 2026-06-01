// ─────────────────────────────────────────────────────────────────────────────
// Service Worker único: PWA caching (Workbox CDN) + Firebase Cloud Messaging
//
// Estratégia injectManifest do vite-plugin-pwa:
//   - self.__WB_MANIFEST é substituído pelo manifesto de precache no build
//   - Elimina o conflito de escopo com o sw.js gerado automaticamente
// ─────────────────────────────────────────────────────────────────────────────

// ─── Workbox Precaching ───────────────────────────────────────────────────────
importScripts('https://storage.googleapis.com/workbox-cdn/releases/7.3.4/workbox-sw.js');

if (typeof workbox !== 'undefined') {
  workbox.setConfig({ modulePathPrefix: 'https://storage.googleapis.com/workbox-cdn/releases/7.3.4/' });
  workbox.precaching.precacheAndRoute(self.__WB_MANIFEST || []);
  workbox.precaching.cleanupOutdatedCaches();

  // NetworkFirst para version.json — garante sempre a versão mais recente
  workbox.routing.registerRoute(
    ({ url }) => url.pathname.endsWith('version.json'),
    new workbox.strategies.NetworkFirst({ cacheName: 'version-check', networkTimeoutSeconds: 3 })
  );

  // Cache-first para assets estáticos
  workbox.routing.registerRoute(
    ({ request }) => request.destination === 'image',
    new workbox.strategies.CacheFirst({ cacheName: 'images-v1' })
  );
}

// Listener de SKIP_WAITING enviado pelo vite-plugin-pwa (autoUpdate)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', (event) =>
  event.waitUntil(self.clients.claim())
);

// ─── Firebase Cloud Messaging ─────────────────────────────────────────────────
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey:            'AIzaSyC_R8dD1SFnCy0aJhsM1zafJK_9AVLo5LM',
  authDomain:        'matobafinancas.firebaseapp.com',
  projectId:         'matobafinancas',
  storageBucket:     'matobafinancas.firebasestorage.app',
  messagingSenderId: '225695230271',
  appId:             '1:225695230271:web:a0d66a56b1515738810b8a',
});

firebase.messaging();

// ─── Helpers de payload ───────────────────────────────────────────────────────
function getPayload(event) {
  if (!event.data) return {};
  try { return event.data.json(); }
  catch (_) {
    try { return JSON.parse(event.data.text()); }
    catch (_) { return {}; }
  }
}

function notificationFromPayload(payload) {
  const n = payload.notification || payload.webpush?.notification || {};
  const d = payload.data || {};
  return {
    title: n.title || d.title || 'Matoba Finanças',
    options: {
      body:               n.body   || d.body  || '',
      icon:               n.icon   || '/icons/icon-192.png',
      badge:                         '/icons/icon-192.png',
      tag:                d.tag    || n.tag   || `matoba-${Date.now()}`,
      data:               { url: d.url || n.data?.url || '/' },
      vibrate:            [200, 100, 200],
      requireInteraction: false,
    },
  };
}

// ─── Handler de push (fallback raw — cobre mensagens data-only) ───────────────
// Firebase messaging compat registra seu próprio handler para mensagens com
// campo "notification". Este handler cobre mensagens data-only que o SDK
// ignora por padrão quando não há onBackgroundMessage configurado.
self.addEventListener('push', (event) => {
  const payload = getPayload(event);
  const { title, options } = notificationFromPayload(payload);
  event.waitUntil(self.registration.showNotification(title, options));
});

// ─── Clique na notificação ────────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const existing = wins.find((w) => w.url.includes(self.location.origin));
      if (existing) return existing.focus();
      return clients.openWindow(url);
    })
  );
});
