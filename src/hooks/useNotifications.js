import { useState, useEffect, useCallback } from 'react';
import { deleteToken, getToken, onMessage } from 'firebase/messaging';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { messaging, db, functions } from '../firebase';

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY;
const VAPID_ID = VAPID_KEY || 'firebase-default';

function getNotificationPermission() {
  return typeof Notification !== 'undefined' ? Notification.permission : 'default';
}

function getMessagingSwUrl() {
  if (typeof window === 'undefined') return './firebase-messaging-sw.js';
  return new URL('firebase-messaging-sw.js', window.location.href).toString();
}

async function showForegroundNotification(payload) {
  const n = payload.notification || {};
  const d = payload.data || {};
  const title = n.title || d.title || 'Matoba Financas';
  const options = {
    body: n.body || d.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: d.tag || 'matoba-financas',
    data: { url: d.url || '/' },
  };

  if (navigator.serviceWorker?.ready) {
    const registration = await navigator.serviceWorker.ready;
    return registration.showNotification(title, options);
  }

  return new Notification(title, options);
}

export function useNotifications(user) {
  const [permission, setPermission] = useState(getNotificationPermission);
  const [fcmToken, setFcmToken] = useState(null);
  const [supported, setSupported] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false);
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [diagnostics, setDiagnostics] = useState({
    vapidConfigured: !!VAPID_KEY,
    permission: getNotificationPermission(),
    serviceWorkerReady: false,
    tokenInMemory: false,
    tokenSaved: false,
    tokenMatchesSaved: false,
    tokenUpdatedAt: null,
    lastError: '',
  });

  const canUsePush = useCallback(() => (
    typeof Notification !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    !!messaging
  ), []);

  const saveToken = useCallback(async (token) => {
    if (!db || !user || !token) return;
    await setDoc(doc(db, 'users', user.uid), {
      fcmToken: token,
      fcmVapidKey: VAPID_ID,
      fcmUpdatedAt: new Date().toISOString(),
      email: user.email || '',
    }, { merge: true });
  }, [user]);

  const registerMessagingSw = useCallback(async () => {
    if (!canUsePush()) return null;
    // O firebase-messaging-sw.js já é registrado pelo vite-plugin-pwa como
    // SW único (injectManifest). Não registramos um segundo SW — apenas
    // aguardamos o SW ativo, eliminando o conflito de escopo que bloqueava push.
    return navigator.serviceWorker.ready;
  }, [canUsePush]);

  const syncToken = useCallback(async ({ save = false, forceRefresh = false } = {}) => {
    if (!canUsePush() || getNotificationPermission() !== 'granted') {
      return null;
    }

    const swReg = await registerMessagingSw();
    if (forceRefresh) {
      try { await deleteToken(messaging); } catch { /* token pode ainda não existir */ }
    }

    const tokenOptions = {
      serviceWorkerRegistration: swReg,
    };
    if (VAPID_KEY) tokenOptions.vapidKey = VAPID_KEY;

    const token = await getToken(messaging, tokenOptions);

    if (token) {
      setFcmToken(token);
      if (save) await saveToken(token);
    }

    return token;
  }, [canUsePush, registerMessagingSw, saveToken]);

  const refreshDiagnostics = useCallback(async () => {
    const currentPermission = getNotificationPermission();
    setPermission(currentPermission);
    const pushSupported = canUsePush();
    setSupported(pushSupported);
    setDiagnosticsLoading(true);

    try {
      let token = fcmToken;
      let savedToken = null;
      let savedVapidKey = null;
      let tokenUpdatedAt = null;
      let serviceWorkerReady = false;

      if (pushSupported) {
        const reg = await navigator.serviceWorker.getRegistration(getMessagingSwUrl());
        serviceWorkerReady = !!reg;
      }

      if (db && user) {
        const userSnap = await getDoc(doc(db, 'users', user.uid));
        savedToken = userSnap.data()?.fcmToken || null;
        savedVapidKey = userSnap.data()?.fcmVapidKey || null;
        tokenUpdatedAt = userSnap.data()?.fcmUpdatedAt || null;
      }

      if (pushSupported && currentPermission === 'granted') {
        token = await syncToken({ save: true, forceRefresh: !!savedVapidKey && savedVapidKey !== VAPID_ID });
        serviceWorkerReady = true;

        if (db && user) {
          const userSnap = await getDoc(doc(db, 'users', user.uid));
          savedToken = userSnap.data()?.fcmToken || null;
          savedVapidKey = userSnap.data()?.fcmVapidKey || null;
          tokenUpdatedAt = userSnap.data()?.fcmUpdatedAt || null;
        }
      }

      setDiagnostics({
        vapidConfigured: !!VAPID_KEY,
        permission: currentPermission,
        serviceWorkerReady,
        tokenInMemory: !!token,
        tokenSaved: !!savedToken,
        tokenMatchesSaved: !!token && !!savedToken && token === savedToken,
        tokenUsesCurrentVapid: savedVapidKey === VAPID_ID,
        tokenUpdatedAt,
        lastError: '',
      });
    } catch (err) {
      setDiagnostics((prev) => ({
        ...prev,
        permission: currentPermission,
        lastError: err.message || 'Falha ao atualizar diagnostico.',
      }));
    } finally {
      setDiagnosticsLoading(false);
    }
  }, [canUsePush, fcmToken, syncToken, user]);

  useEffect(() => {
    setSupported(canUsePush());
  }, [canUsePush]);

  useEffect(() => {
    if (!user) return;
    refreshDiagnostics();
  }, [refreshDiagnostics, user]);

  useEffect(() => {
    if (!messaging || !user) return;
    const unsub = onMessage(messaging, (payload) => {
      if (getNotificationPermission() === 'granted') {
        showForegroundNotification(payload).catch((err) => {
          console.error('[FCM] foreground notification:', err);
        });
      }
    });
    return unsub;
  }, [user]);

  const enableNotifications = useCallback(async () => {
    if (!supported) return { ok: false, reason: 'not_supported' };
    if (!user) return { ok: false, reason: 'not_logged_in' };
    if (!db) return { ok: false, reason: 'no_db' };

    setRegistering(true);
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== 'granted') return { ok: false, reason: 'denied' };

      const token = await syncToken({ save: true, forceRefresh: true });
      await refreshDiagnostics();

      return token ? { ok: true } : { ok: false, reason: 'no_token' };
    } catch (err) {
      console.error('[FCM] enableNotifications:', err);
      setDiagnostics((prev) => ({ ...prev, lastError: err.message || 'Erro ao ativar push.' }));
      return { ok: false, reason: 'error', message: err.message };
    } finally {
      setRegistering(false);
    }
  }, [refreshDiagnostics, supported, syncToken, user]);

  const sendTestPush = useCallback(async () => {
    if (!functions) return { ok: false, reason: 'no_functions' };
    if (!user) return { ok: false, reason: 'not_logged_in' };

    setTestSending(true);
    setTestResult(null);
    try {
      await syncToken({ save: true });
      const callSendTestPush = httpsCallable(functions, 'sendTestPush');
      const response = await callSendTestPush();
      const result = { ok: true, ...response.data };
      setTestResult(result);
      await refreshDiagnostics();
      return result;
    } catch (err) {
      const result = {
        ok: false,
        reason: err.code || 'error',
        message: err.message || 'Erro ao enviar push de teste.',
      };
      setTestResult(result);
      await refreshDiagnostics();
      return result;
    } finally {
      setTestSending(false);
    }
  }, [refreshDiagnostics, syncToken, user]);

  return {
    permission,
    fcmToken,
    supported,
    registering,
    diagnostics,
    diagnosticsLoading,
    testSending,
    testResult,
    enableNotifications,
    refreshDiagnostics,
    sendTestPush,
  };
}
