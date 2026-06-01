import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import TelegramConnect from './TelegramConnect';
import { DEFAULT_NOTIFICATION_TIPOS, TIPO_INFO } from '../../utils/notificationTypes';

function Toggle({ value, onChange }) {
  return (
    <button
      onClick={() => onChange(!value)}
      style={{
        width: 40, height: 22, borderRadius: 11, border: 'none',
        background: value ? '#2AABEE' : 'var(--border)',
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

  // Tipos específicos do Telegram — independentes dos tipos de push
  // Fallback: se nunca configurado, usa os mesmos defaults
  const telegramTipos = {
    ...DEFAULT_NOTIFICATION_TIPOS,
    ...(prefs.telegramTipos || {}),
  };

  useEffect(() => {
    if (!user?.uid || !db) return;
    const unsub = onSnapshot(doc(db, 'users', user.uid), (snap) => {
      setTelegramChatId(snap.exists() ? (snap.data().telegramChatId || null) : null);
    });
    return unsub;
  }, [user?.uid]);

  const savePrefs = (patch) =>
    onSavePrefs({ notificacoes: { ...prefs, ...patch } });

  const saveTipo = (id, val) =>
    savePrefs({ telegramTipos: { ...telegramTipos, [id]: val } });

  const isEnabled = prefs.telegramEnabled === true && !!telegramChatId;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* ── Vinculação ──────────────────────────────────────────────────────── */}
      <TelegramConnect
        user={user}
        telegramChatId={telegramChatId}
        onDisconnect={() => savePrefs({ telegramEnabled: false })}
      />

      {telegramChatId && (
        <>
          {/* Toggle principal */}
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
                Configure individualmente quais alertas enviar abaixo
              </p>
            </div>
            <Toggle
              value={isEnabled}
              onChange={(val) => savePrefs({ telegramEnabled: val })}
            />
          </div>

          {/* ── Lista de tipos — visível quando habilitado ─────────────────── */}
          {isEnabled && (
            <div>
              <p style={{
                margin: '4px 0 10px', fontSize: 11, fontWeight: 600,
                color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em',
              }}>
                Alertas via Telegram
              </p>

              {Object.entries(TIPO_INFO).map(([id, info]) => {
                const ativo = telegramTipos[id] !== false;
                return (
                  <div key={id} style={{
                    background: 'var(--bg-card)', border: '1px solid var(--border)',
                    borderRadius: 12, padding: '12px 14px', marginBottom: 8,
                    opacity: ativo ? 1 : 0.6, transition: 'opacity 0.2s',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      <span style={{ fontSize: 18, flexShrink: 0, lineHeight: 1.3 }}>{info.icon}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: '0 0 2px', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                          {info.label}
                        </p>
                        <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                          {info.desc}
                        </p>
                      </div>
                      <Toggle value={ativo} onChange={(val) => saveTipo(id, val)} />
                    </div>
                  </div>
                );
              })}

              <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                💡 Estes alertas são <strong>independentes</strong> das notificações push — você pode configurar cada canal separadamente.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
