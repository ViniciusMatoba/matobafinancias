import { useEffect } from 'react';
import { X } from 'lucide-react';

export default function Modal({ open, onClose, title, children }) {
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{ background: 'var(--bg-surface)', borderRadius: '20px', width: '100%', maxWidth: 480, maxHeight: '90dvh', overflowY: 'auto' }}
        className="safe-bottom"
      >
        <div style={{ padding: '16px 20px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, background: 'var(--bg-surface)', zIndex: 1 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: 'var(--text-primary)' }}>{title}</h2>
          <button onClick={onClose} style={{ background: 'var(--bg-card)', borderRadius: 8, padding: 6, display: 'flex', color: 'var(--text-secondary)' }}>
            <X size={18} />
          </button>
        </div>
        <div style={{ padding: '16px 20px 24px' }}>
          {children}
        </div>
      </div>
    </div>
  );
}
