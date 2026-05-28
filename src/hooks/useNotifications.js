import { useState, useEffect, useCallback } from 'react';
import { getToken, onMessage } from 'firebase/messaging';
import { doc, setDoc } from 'firebase/firestore';
import { messaging, db } from '../firebase';

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY;

/**
 * Gerencia permissão, token FCM e mensagens em foreground.
 *
 * Uso:
 *   const { permission, supported, registering, enableNotifications } = useNotifications(user);
 */
export function useNotifications(user) {
  const [permission, setPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );
  const [fcmToken, setFcmToken]     = useState(null);
  const [supported, setSupported]   = useState(false);
  const [registering, setRegistering] = useState(false);

  // Detecta suporte após mount (evita SSR crash)
  useEffect(() => {
    setSupported(
      typeof Notification !== 'undefined' &&
      'serviceWorker' in navigator &&
      !!messaging
    );
  }, []);

  // Atualiza permissão se o usuário mudar no navegador
  useEffect(() => {
    if (!supported) return;
    setPermission(Notification.permission);
  }, [supported]);

  // Escuta mensagens enquanto o app está em FOREGROUND
  useEffect(() => {
    if (!messaging || !user) return;
    const unsub = onMessage(messaging, (payload) => {
      const n = payload.notification || {};
      if (Notification.permission === 'granted') {
        new Notification(n.title || 'Matoba Finanças', {
          body:  n.body || '',
          icon:  '/icons/icon-192.png',
          badge: '/icons/icon-192.png',
        });
      }
    });
    return unsub;
  }, [user]);

  /**
   * Solicita permissão, registra o SW de FCM, obtém o token e salva no Firestore.
   * Retorna { ok: boolean, reason?: string }
   */
  const enableNotifications = useCallback(async () => {
    if (!supported)  return { ok: false, reason: 'not_supported' };
    if (!user)       return { ok: false, reason: 'not_logged_in' };
    if (!db)         return { ok: false, reason: 'no_db' };
    if (!VAPID_KEY)  return { ok: false, reason: 'no_vapid' };

    setRegistering(true);
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== 'granted') return { ok: false, reason: 'denied' };

      // Registra o SW de FCM separado do SW do PWA.
      // Usa caminho relativo ('./') para funcionar em qualquer base (GitHub Pages, subpath, etc.)
      const swReg = await navigator.serviceWorker.register('./firebase-messaging-sw.js');

      const token = await getToken(messaging, {
        vapidKey:                   VAPID_KEY,
        serviceWorkerRegistration:  swReg,
      });

      if (token) {
        setFcmToken(token);
        // Salva o token no Firestore para que as Cloud Functions possam enviá-lo
        await setDoc(doc(db, 'users', user.uid), {
          fcmToken:      token,
          fcmUpdatedAt:  new Date().toISOString(),
          email:         user.email || '',
        }, { merge: true });
      }

      return { ok: true };
    } catch (err) {
      console.error('[FCM] enableNotifications:', err);
      return { ok: false, reason: 'error', message: err.message };
    } finally {
      setRegistering(false);
    }
  }, [supported, user]);

  return { permission, fcmToken, supported, registering, enableNotifications };
}
