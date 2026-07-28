import { useState, useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { DollarSign } from 'lucide-react';

export default function ReloadPrompt() {
  const [updating, setUpdating] = useState(false);

  // Detecta quando o SW novo assumiu o controle (controllerchange).
  // Com skipWaiting no install, isso acontece automaticamente após cada deploy.
  // Mostra a tela de loading e recarrega para servir os novos assets.
  useEffect(() => {
    if (!navigator.serviceWorker) return;
    const handleControllerChange = () => {
      setUpdating(true);
      setTimeout(() => window.location.reload(), 1_500);
    };
    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);
    return () => navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
  }, []);

  useRegisterSW({
    onRegistered(r) {
      if (!r) return;
      const check = () => r.update().catch(() => {});
      // Verifica ao abrir, ao voltar ao foco e a cada 60s
      check();
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
      setInterval(check, 60_000);
    },
    onRegisterError(err) {
      console.error('SW registration error', err);
    },
  });

  // ── Tela de loading enquanto instala a atualização ─────────────────────────
  if (updating) {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 99999,
        background: 'var(--bg-primary, #0f0f1a)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 28,
      }}>
        {/* Ícone do app */}
        <div style={{
          width: 76, height: 76, borderRadius: 22,
          background: 'linear-gradient(135deg, #6366f1, #a855f7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 0 40px rgba(99,102,241,0.35)',
        }}>
          <DollarSign size={38} color="#fff" />
        </div>

        {/* Spinner */}
        <div style={{ position: 'relative', width: 52, height: 52 }}>
          <div style={{
            position: 'absolute', inset: 0, borderRadius: '50%',
            border: '3px solid rgba(99,102,241,0.12)',
          }} />
          <div style={{
            position: 'absolute', inset: 0, borderRadius: '50%',
            border: '3px solid transparent',
            borderTopColor: '#6366f1',
            animation: 'mf-spin 0.75s linear infinite',
          }} />
        </div>

        {/* Textos */}
        <div style={{ textAlign: 'center', padding: '0 40px' }}>
          <p style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--text-primary, #f1f1f9)' }}>
            Atualizando o aplicativo
          </p>
          <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--text-secondary, #8b8fa8)', lineHeight: 1.5 }}>
            Instalando a nova versão…<br />O app será recarregado em instantes.
          </p>
        </div>

        <style>{`
          @keyframes mf-spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  return null;
}
