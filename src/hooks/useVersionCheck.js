import { useEffect, useState, useCallback } from 'react';
import { APP_VERSION } from '../utils/version';

const VERSION_URL = './version.json';

async function fetchLatestVersion() {
  const res = await fetch(`${VERSION_URL}?t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('version.json não disponível');
  return res.json();
}

async function showUpdateNotification(version, notes) {
  if (typeof Notification === 'undefined') return;
  if (Notification.permission !== 'granted') return;
  if (!navigator.serviceWorker?.ready) return;

  const reg = await navigator.serviceWorker.ready;
  reg.showNotification(`Matoba Finanças v${version} disponível!`, {
    body: notes?.[0] || 'Nova versão disponível. Toque para atualizar.',
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    tag: `matoba-update-${version}`,
    renotify: true,
    data: { url: window.location.href },
  });
}

export function useVersionCheck() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [latestVersion, setLatestVersion]     = useState(null);
  const [latestNotes,   setLatestNotes]       = useState([]);

  const check = useCallback(async () => {
    try {
      const data = await fetchLatestVersion();
      if (data?.version && data.version !== APP_VERSION) {
        setUpdateAvailable(true);
        setLatestVersion(data.version);
        setLatestNotes(data.notes || []);
        showUpdateNotification(data.version, data.notes);
      }
    } catch {
      // silencioso — offline ou primeiro acesso
    }
  }, []);

  useEffect(() => {
    check();

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') check();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [check]);

  return { updateAvailable, latestVersion, latestNotes };
}
