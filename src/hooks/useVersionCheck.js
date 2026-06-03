import { useEffect, useState, useCallback } from 'react';
import { APP_VERSION } from '../utils/version';

const VERSION_URL = './version.json';

// Compara versões semver simples (ex: '1.6.16' > '1.6.15')
// Retorna true somente se remoteVersion é MAIS NOVA que localVersion
function isNewerVersion(remoteVersion, localVersion) {
  const parse = (v) => String(v).split('.').map(Number);
  const [rMaj, rMin, rPat] = parse(remoteVersion);
  const [lMaj, lMin, lPat] = parse(localVersion);
  if (rMaj !== lMaj) return rMaj > lMaj;
  if (rMin !== lMin) return rMin > lMin;
  return rPat > lPat;
}

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

// Ativa o novo SW corretamente antes de recarregar a página.
// window.location.reload() simples serve o cache antigo — esta função
// garante que o novo SW esteja ativo antes do reload.
export async function triggerUpdate() {
  try {
    const reg = await navigator.serviceWorker.getRegistration();

    // Caso 1: já há um SW novo aguardando → ativa e aguarda controllerchange
    if (reg?.waiting) {
      await new Promise((resolve) => {
        navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true });
        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      });
      window.location.reload();
      return;
    }

    // Caso 2: força verificação de atualização no servidor
    if (reg) {
      await reg.update().catch(() => {});
      if (reg.waiting) {
        await new Promise((resolve) => {
          navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true });
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        });
        window.location.reload();
        return;
      }
    }

    // Caso 3 (fallback): limpa caches do SW e recarrega
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
    window.location.reload();
  } catch {
    window.location.reload();
  }
}

export function useVersionCheck() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [latestVersion, setLatestVersion]     = useState(null);
  const [latestNotes,   setLatestNotes]       = useState([]);

  const check = useCallback(async () => {
    try {
      const data = await fetchLatestVersion();
      if (data?.version && isNewerVersion(data.version, APP_VERSION)) {
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
    Promise.resolve().then(() => {
      check();
    });

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
