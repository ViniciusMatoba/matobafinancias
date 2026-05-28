import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import TelegramConnect from './TelegramConnect';

function Toggle({ value, onChange }) {
  return (
    <button
      onClick={() => onChange(!value)}
      style={{
        width: 40, height: 22, borderRadius: 11, border: 'none',
        background: value ? 'var(--primary)' : 'var(--border)',
        position: 'relative', cursor: 'pointer',
        transition: 'background 0.2s', flexShrink: 0,
      }}
    >
      <span style={{
        position: 'absolute', top: 3,
        left: value ? 21 : 3,
        width: 16, height: 16, borderRadius: '50%',
        background: '#fff', transition: 'left 0.2s',
      }} />
    </button>
  );
}

export default function TelegramSettings({ user, config, onSavePrefs }) {
  const [telegramChatId, setTelegramChatId] = useState(null);

  const prefs = config?.notificacoes || {};

  useEffect(() => {
    if (!user?.uid || !db) return;
    const unsub = onSnapshot(doc(db, 'users', user.uid), (snap) => {
      setTelegramChatId(snap.exists() ? (snap.data().telegramChatId || null) : null);
    });
    return unsub;
  }, [user?.uid]);

  const savePrefs = (patch) =>
    onSavePrefs({ notificacoes: { ...prefs, ...patch } });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <TelegramConnect
        user={user}
        telegramChatId={telegramChatId}
        onDisconnect={() => savePrefs({ telegramEnabled: false })}
      />

      {telegramChatId && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 14px',
          background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12,
        }}>
          <div>
            <p style={{ margin: '0 0 2px', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
              Receber alertas pelo Telegram
            </p>
            <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>
              Os alertas N1–N7 também serão enviados via bot
            </p>
          </div>
          <Toggle
            value={prefs.telegramEnabled === true}
            onChange={(val) => savePrefs({ telegramEnabled: val })}
          />
        </div>
      )}
    </div>
  );
}
