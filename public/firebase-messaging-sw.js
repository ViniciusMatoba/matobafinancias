// ─────────────────────────────────────────────────────────────────────────────
// Service Worker — Matoba Finanças
// Usa imports ES module (bundlados pelo Vite) — sem dependência de CDN externo.
// ─────────────────────────────────────────────────────────────────────────────

import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { NetworkFirst, CacheFirst } from 'workbox-strategies';
import { initializeApp } from 'firebase/app';
import { getMessaging } from 'firebase/messaging/sw';

// ─── Workbox Precaching ───────────────────────────────────────────────────────
precacheAndRoute(self.__WB_MANIFEST || []);
cleanupOutdatedCaches();

// NetworkFirst para version.json — sempre busca a versão mais recente
registerRoute(
  ({ url }) => url.pathname.endsWith('version.json'),
  new NetworkFirst({ cacheName: 'version-check', networkTimeoutSeconds: 3 })
);

// CacheFirst para imagens
registerRoute(
  ({ request }) => request.destination === 'image',
  new CacheFirst({ cacheName: 'images-v1' })
);

// ─── Ciclo de vida do SW ──────────────────────────────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) =>
  event.waitUntil(self.clients.claim())
);

// ─── Firebase Cloud Messaging ─────────────────────────────────────────────────
// Usa a API modular firebase/messaging/sw (projetada para uso em SW).
// O campo "notification" enviado pelo Cloud Function faz o SDK
// exibir a notificação automaticamente em background.
const app = initializeApp({
  apiKey:            'AIzaSyC_R8dD1SFnCy0aJhsM1zafJK_9AVLo5LM',
  authDomain:        'matobafinancas.firebaseapp.com',
  projectId:         'matobafinancas',
  storageBucket:     'matobafinancas.firebasestorage.app',
  messagingSenderId: '225695230271',
  appId:             '1:225695230271:web:a0d66a56b1515738810b8a',
});

getMessaging(app);

// ─── Clique na notificação ────────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || './';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const existing = wins.find((w) => w.url.includes(self.location.origin));
      if (existing) return existing.focus();
      return clients.openWindow(url);
    })
  );
});
