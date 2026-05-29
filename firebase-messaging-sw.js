// Service Worker dedicado ao Firebase Cloud Messaging (FCM).
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

function getPayload(event) {
  if (!event.data) return {};
  try {
    return event.data.json();
  } catch (_) {
    try {
      return JSON.parse(event.data.text());
    } catch (_) {
      return {};
    }
  }
}

function notificationFromPayload(payload) {
  const n = payload.notification || payload.webpush?.notification || {};
  const d = payload.data || {};

  return {
    title: n.title || d.title || 'Matoba Financas',
    options: {
      body: n.body || d.body || '',
      icon: n.icon || '/icons/icon-192.png',
      badge: n.badge || '/icons/icon-192.png',
      tag: d.tag || n.tag || `matoba-financas-${Date.now()}`,
      data: { url: d.url || n.data?.url || '/' },
      vibrate: [200, 100, 200],
      requireInteraction: false,
    },
  };
}

function showPayloadNotification(payload) {
  const { title, options } = notificationFromPayload(payload);
  return self.registration.showNotification(title, options);
}

// Fallback direto: exibe qualquer Web Push recebido, sem depender do helper
// onBackgroundMessage. Isso cobre PWA/GitHub Pages quando o FCM aceita o envio
// mas nao dispara a exibicao automatica no Android.
self.addEventListener('push', (event) => {
  const payload = getPayload(event);
  event.waitUntil(showPayloadNotification(payload));
});

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
