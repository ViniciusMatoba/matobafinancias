import { useEffect, useState } from 'react';
import { CheckCircle, AlertCircle } from 'lucide-react';

export function Toast({ message, type = 'success', onDone }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => { setVisible(false); setTimeout(onDone, 300); }, 2500);
    return () => clearTimeout(t);
  }, [onDone]);

  const isSuccess = type === 'success';

  return (
    <div style={{
      position: 'fixed',
      bottom: 90,
      left: '50%',
      transform: `translateX(-50%) translateY(${visible ? 0 : 20}px)`,
      opacity: visible ? 1 : 0,
      transition: 'all 0.3s ease',
      zIndex: 100,
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '12px 20px',
      borderRadius: 14,
      background: isSuccess ? 'rgba(16,185,129,0.95)' : 'rgba(239,68,68,0.95)',
      backdropFilter: 'blur(8px)',
      boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
      color: '#fff',
      fontSize: 14,
      fontWeight: 500,
      whiteSpace: 'nowrap',
      maxWidth: 'calc(100vw - 40px)',
    }}>
      {isSuccess
        ? <CheckCircle size={18} color="#fff" />
        : <AlertCircle size={18} color="#fff" />
      }
      {message}
    </div>
  );
}

export function useToast() {
  const [toast, setToast] = useState(null);

  const showToast = (message, type = 'success') => {
    setToast({ message, type, key: Date.now() });
  };

  const ToastNode = toast ? (
    <Toast
      key={toast.key}
      message={toast.message}
      type={toast.type}
      onDone={() => setToast(null)}
    />
  ) : null;

  return { showToast, ToastNode };
}
