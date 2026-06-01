import { useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { DollarSign } from 'lucide-react';

export default function ReloadPrompt() {
  const [updating, setUpdating] = useState(false);

  useRegisterSW({
    // onNeedRefresh: disparado pelo vite-plugin-pwa (autoUpdate) quando
    // um novo SW está esperando. Mostramos a tela de loading e o
    // vite-plugin-pwa cuida do skipWaiting + reload automaticamente.
    onNeedRefresh() {
      setUpdating(true);
    },
    onRegistered(r) {
      if (!r) return;
      const check = () => r.update().catch(() => {});
      check();
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
      setInterval(check, 60_000);
    },
    onRegisterError(err) {
      console.log('SW registration error', err);
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
