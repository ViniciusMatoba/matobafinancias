import { useState, useEffect } from 'react';

// Mantém o evento globalmente caso dispare antes de algum componente usar o hook
let globalDeferredPrompt = null;
const listeners = new Set();

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  globalDeferredPrompt = e;
  listeners.forEach(listener => listener(e));
});

export function useInstallPrompt() {
  const [prompt, setPrompt] = useState(globalDeferredPrompt);

  useEffect(() => {
    const listener = (e) => setPrompt(e);
    listeners.add(listener);
    
    return () => listeners.delete(listener);
  }, []);

  const handleInstall = async () => {
    if (!prompt) return;
    prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === 'accepted') {
      globalDeferredPrompt = null;
      setPrompt(null);
      listeners.forEach(listener => listener(null));
    }
  };

  return { prompt, handleInstall };
}
