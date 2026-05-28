import { useState, useEffect, useCallback } from 'react';
import { doc, setDoc, deleteDoc, onSnapshot, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { CheckCircle, XCircle, Copy, RefreshCw, Unlink } from 'lucide-react';

// Caracteres sem ambiguidade (sem 0/O, 1/I/l)
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_TTL_MS = 15 * 60 * 1000; // 15 minutos

function generateCode(len = 6) {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, b => CHARS[b % CHARS.length]).join('');
}

function timeLeft(expiresAt) {
  if (!expiresAt) return 0;
  return Math.max(0, expiresAt - Date.now());
}

function fmtCountdown(ms) {
  const total = Math.ceil(ms / 1000);
  const m     = Math.floor(total / 60);
  const s     = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function TelegramConnect({ user, telegramChatId, onDisconnect }) {
  const [code, setCode]           = useState(null);       // código gerado
  const [expiresAt, setExpiresAt] = useState(null);       // Date.now() + TTL
  const [countdown, setCountdown] = useState(0);
  const [copied, setCopied]       = useState(false);
  const [loading, setLoading]     = useState(false);
  const [linked, setLinked]       = useState(!!telegramChatId);
  const [telegramName, setTelegramName] = useState('');

  // Sincroniza estado de vínculo via onSnapshot
  useEffect(() => {
    if (!user?.uid || !db) return;
    const unsub = onSnapshot(doc(db, 'users', user.uid), (snap) => {
      if (snap.exists()) {
        const d = snap.data();
        setLinked(!!d.telegramChatId);
        setTelegramName(d.telegramName || '');
      }
    });
    return unsub;
  }, [user?.uid]);

  // Countdown do código
  useEffect(() => {
    if (!expiresAt) return;
    const interval = setInterval(() => {
      const left = timeLeft(expiresAt);
      setCountdown(left);
      if (left === 0) {
        setCode(null);
        setExpiresAt(null);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  // Gerar código de vinculação
  const handleGenerateCode = useCallback(async () => {
    if (!user?.uid || !db) return;
    setLoading(true);
    try {
      // Remove código anterior se existir
      if (code) {
        await deleteDoc(doc(db, 'telegramLinks', code)).catch(() => {});
      }
      const newCode = generateCode();
      const exp     = Date.now() + CODE_TTL_MS;
      await setDoc(doc(db, 'telegramLinks', newCode), {
        uid:       user.uid,
        email:     user.email || '',
        expiresAt: new Date(exp),
      });
      setCode(newCode);
      setExpiresAt(exp);
      setCountdown(CODE_TTL_MS);
    } finally {
      setLoading(false);
    }
  }, [user?.uid, user?.email, code]);

  // Copiar código
  const handleCopy = () => {
    navigator.clipboard?.writeText(`/vincular ${code}`).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // Desvincular conta
  const handleDisconnect = async () => {
    if (!window.confirm('Deseja desvincular o Telegram desta conta?')) return;
    setLoading(true);
    try {
      await setDoc(doc(db, 'users', user.uid), {
        telegramChatId:  null,
        telegramName:    null,
        telegramLinkedAt: null,
      }, { merge: true });
      setLinked(false);
      onDisconnect?.();
    } finally {
      setLoading(false);
    }
  };

  // ── Conta já vinculada ───────────────────────────────────────────────────────
  if (linked) {
    return (
      <div style={{
        background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)',
        borderRadius: 12, padding: '14px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <CheckCircle size={18} color="var(--entrada)" style={{ flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
              Telegram conectado ✓
            </p>
            {telegramName && (
              <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>
                Usuário: {telegramName}
              </p>
            )}
          </div>
          <button
            onClick={handleDisconnect}
            disabled={loading}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '5px 10px', borderRadius: 8, fontSize: 12,
              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
              color: 'var(--saida)', cursor: 'pointer',
            }}
          >
            <Unlink size={12} /> Desvincular
          </button>
        </div>
      </div>
    );
  }

  // ── Instruções + gerador de código ──────────────────────────────────────────
  return (
    <div>
      {/* Passo a passo */}
      <div style={{
        background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)',
        borderRadius: 12, padding: '12px 14px', marginBottom: 14,
        fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7,
      }}>
        <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
          Como vincular?
        </p>
        <p style={{ margin: 0 }}>
          1. Abra o Telegram e inicie uma conversa com{' '}
          <a
            href="https://t.me/MatobaFinancasBot"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--primary)', fontWeight: 600 }}
          >
            @MatobaFinancasBot
          </a>
          <br />
          2. Clique em <strong style={{ color: 'var(--text-primary)' }}>Gerar Código</strong> abaixo<br />
          3. Envie o comando exibido para o bot no Telegram<br />
          4. Pronto — sua conta ficará vinculada automaticamente!
        </p>
      </div>

      {/* Código gerado */}
      {code && countdown > 0 ? (
        <div>
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 12, padding: '14px', marginBottom: 10,
          }}>
            <p style={{ margin: '0 0 6px', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Envie este comando para o bot:
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <code style={{
                flex: 1, fontSize: 18, fontWeight: 700, letterSpacing: '0.15em',
                color: 'var(--primary)', fontFamily: 'monospace',
                background: 'rgba(99,102,241,0.08)', padding: '8px 12px',
                borderRadius: 8, display: 'block',
              }}>
                /vincular {code}
              </code>
              <button
                onClick={handleCopy}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
                  padding: '8px 12px', borderRadius: 8, fontSize: 12,
                  background: copied ? 'rgba(16,185,129,0.1)' : 'rgba(99,102,241,0.1)',
                  border: `1px solid ${copied ? 'rgba(16,185,129,0.3)' : 'rgba(99,102,241,0.3)'}`,
                  color: copied ? 'var(--entrada)' : 'var(--primary)',
                  cursor: 'pointer',
                }}
              >
                <Copy size={12} /> {copied ? 'Copiado!' : 'Copiar'}
              </button>
            </div>

            {/* Countdown */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginTop: 10,
            }}>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>
                ⏱ Expira em{' '}
                <span style={{ color: countdown < 60000 ? 'var(--saida)' : 'var(--text-secondary)', fontWeight: 600 }}>
                  {fmtCountdown(countdown)}
                </span>
              </p>
              <button
                onClick={handleGenerateCode}
                disabled={loading}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  fontSize: 11, color: 'var(--text-muted)', background: 'none',
                  border: 'none', cursor: 'pointer', padding: '2px 4px',
                }}
              >
                <RefreshCw size={11} /> Novo código
              </button>
            </div>
          </div>

          {/* Aguardando vínculo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 10, background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
            <span style={{ fontSize: 14, animation: 'pulse 1.5s ease-in-out infinite' }}>⏳</span>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>
              Aguardando vinculação no Telegram...
            </p>
          </div>
          <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
        </div>
      ) : (
        <button
          onClick={handleGenerateCode}
          disabled={loading}
          style={{
            width: '100%', padding: '12px', borderRadius: 12,
            background: 'linear-gradient(135deg, #2AABEE, #229ED9)',
            color: '#fff', fontSize: 14, fontWeight: 600, border: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.7 : 1,
          }}
        >
          {/* Ícone Telegram */}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
          </svg>
          {loading ? 'Gerando...' : 'Gerar Código de Vinculação'}
        </button>
      )}
    </div>
  );
}
