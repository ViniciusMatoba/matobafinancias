// Service Worker dedicado ao Firebase Cloud Messaging (FCM)
// Separado do SW gerado pelo vite-plugin-pwa — convivem sem conflito.
// Atualizar a versão abaixo sempre que o firebase no package.json mudar.
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

// Configuração pública do Firebase — não é segredo (já está no bundle do app)
firebase.initializeApp({
  apiKey:            'AIzaSyC_R8dD1SFnCy0aJhsM1zafJK_9AVLo5LM',
  authDomain:        'matobafinancas.firebaseapp.com',
  projectId:         'matobafinancas',
  storageBucket:     'matobafinancas.firebasestorage.app',
  messagingSenderId: '225695230271',
  appId:             '1:225695230271:web:a0d66a56b1515738810b8a',
});

const messaging = firebase.messaging();

// Mensagens recebidas quando o app está em BACKGROUND ou fechado
messaging.onBackgroundMessage((payload) => {
  const n   = payload.notification || {};
  const d   = payload.data        || {};

  self.registration.showNotification(n.title || 'Matoba Finanças', {
    body:  n.body  || '',
    icon:  '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag:   d.tag   || 'matoba-financas',
    data:  { url: d.url || '/' },
    vibrate: [200, 100, 200],
  });
});

// Clique na notificação: foca a aba aberta ou abre uma nova
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
