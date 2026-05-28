import { useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw, X, DollarSign } from 'lucide-react';

const DISMISSED_UPDATE_KEY = 'matoba:update-dismissed';

export default function ReloadPrompt() {
  const [updating, setUpdating] = useState(false);
  const [dismissed, setDismissed] = useState(
    () => sessionStorage.getItem(DISMISSED_UPDATE_KEY) === '1'
  );

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError(error) {
      console.log('SW registration error', error);
    },
  });

  const handleUpdate = () => {
    setUpdating(true);
    sessionStorage.removeItem(DISMISSED_UPDATE_KEY);
    // Pequeno delay para garantir que a tela de loading renderiza antes do reload
    setTimeout(() => updateServiceWorker(true), 80);
  };

  const handleDismiss = () => {
    sessionStorage.setItem(DISMISSED_UPDATE_KEY, '1');
    setDismissed(true);
    setNeedRefresh(false);
  };

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

  // ── Banner de atualização disponível ──────────────────────────────────────
  if (!needRefresh || dismissed) return null;

  return (
    <div style={{
      position: 'fixed', top: 16, left: 16, right: 16, zIndex: 9999,
      background: 'var(--bg-surface, #1a1a2e)', border: '1px solid var(--primary, #6366f1)',
      borderRadius: 14, padding: '14px 16px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: '50%',
        background: 'rgba(99,102,241,0.18)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--primary, #6366f1)', flexShrink: 0,
      }}>
        <RefreshCw size={17} />
      </div>

      <div style={{ flex: 1 }}>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-primary, #f1f1f9)' }}>
          Nova versão disponível!
        </p>
        <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-secondary, #8b8fa8)' }}>
          Toque em <strong>Atualizar</strong> para instalar.
        </p>
      </div>

      <button
        onClick={handleUpdate}
        style={{
          background: 'var(--primary, #6366f1)', color: '#fff',
          padding: '8px 16px', borderRadius: 9,
          fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        Atualizar
      </button>

      <button
        onClick={handleDismiss}
        style={{ background: 'none', border: 'none', color: 'var(--text-muted, #555)', padding: 4, cursor: 'pointer', flexShrink: 0 }}
      >
        <X size={16} />
      </button>
    </div>
  );
}
