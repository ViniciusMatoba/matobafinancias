import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw, X } from 'lucide-react';

export default function ReloadPrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      // Opcional: verificar atualizações periodicamente
      // setInterval(() => { r.update() }, 60 * 60 * 1000)
    },
    onRegisterError(error) {
      console.log('SW registration error', error);
    },
  });

  if (!needRefresh) return null;

  return (
    <div style={{
      position: 'fixed', bottom: 80, left: 16, right: 16, zIndex: 9999,
      background: 'var(--bg-surface)', border: '1px solid var(--primary)',
      borderRadius: 12, padding: '16px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', gap: 12
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: '50%', background: 'rgba(99,102,241,0.2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)'
      }}>
        <RefreshCw size={18} />
      </div>
      
      <div style={{ flex: 1 }}>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
          Nova versão disponível!
        </p>
        <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
          Clique para atualizar o aplicativo.
        </p>
      </div>

      <button
        onClick={() => updateServiceWorker(true)}
        style={{
          background: 'var(--primary)', color: '#fff', padding: '8px 16px',
          borderRadius: 8, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer'
        }}
      >
        Atualizar
      </button>

      <button
        onClick={() => setNeedRefresh(false)}
        style={{ background: 'none', border: 'none', color: 'var(--text-muted)', padding: 4, cursor: 'pointer' }}
      >
        <X size={16} />
      </button>
    </div>
  );
}
