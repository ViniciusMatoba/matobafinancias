import { useState, useRef, useEffect } from 'react';
import { X, TrendingUp, TrendingDown, AlertTriangle, SlidersHorizontal } from 'lucide-react';
import { formatBRL, parseBRLInput, formatBRLInput, normalizeBRLInput, todayStr } from '../../utils/formatters';

/**
 * Modal para ajuste manual do saldo global.
 *
 * - Ajuste positivo (saldo sobe): cria lançamento de Entrada sem pedir justificativa.
 * - Ajuste negativo (saldo cai): exibe aviso e exige justificativa antes de confirmar.
 *   Também oferece atalho para criar lançamento de Saída real.
 *
 * Props:
 *  saldoAtual   — número com o saldo calculado atual
 *  onConfirm    — (diff, justificativa) => void — chamado com a diferença e texto
 *  onAddSaida   — () => void — abre formulário de nova saída (atalho)
 *  onClose      — () => void
 */
export default function AdjustBalanceModal({ saldoAtual, onConfirm, onAddSaida, onClose }) {
  const [inputStr, setInputStr]         = useState('');
  const [justificativa, setJustificativa] = useState('');
  const [step, setStep]                 = useState('input'); // 'input' | 'negative'
  const [shake, setShake]               = useState(false);
  const inputRef = useRef(null);
  const justRef  = useRef(null);

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 80); }, []);
  useEffect(() => { if (step === 'negative') setTimeout(() => justRef.current?.focus(), 80); }, [step]);

  const novoSaldo = parseBRLInput(inputStr);
  const diff      = novoSaldo - saldoAtual;
  const hasValue  = inputStr.trim().length > 0;
  const isPositive = diff > 0;
  const isNegative = diff < 0;
  const isZero     = diff === 0;

  const handleInputChange = (e) => setInputStr(formatBRLInput(e.target.value));
  const handleInputBlur   = (e) => setInputStr(normalizeBRLInput(e.target.value));

  const triggerShake = () => {
    setShake(true);
    setTimeout(() => setShake(false), 500);
  };

  const handleNext = () => {
    if (!hasValue || isZero) { triggerShake(); return; }
    if (isNegative) { setStep('negative'); return; }
    // Positivo → confirma direto
    onConfirm(diff, '');
  };

  const handleConfirmNegative = () => {
    if (!justificativa.trim()) { triggerShake(); return; }
    onConfirm(diff, justificativa.trim());
  };

  const diffColor    = isPositive ? '#10b981' : isNegative ? '#ef4444' : 'var(--text-muted)';
  const diffLabel    = isPositive ? `+${formatBRL(diff)}` : isNegative ? `−${formatBRL(Math.abs(diff))}` : '';
  const today        = todayStr();

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 10000,
          background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(3px)',
        }}
      />

      {/* Sheet */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 10001,
        background: 'var(--bg-surface, #1a1a2e)',
        borderRadius: '22px 22px 0 0',
        padding: '24px 20px 40px',
        boxShadow: '0 -8px 40px rgba(0,0,0,0.6)',
        animation: 'slideUp 0.25s cubic-bezier(0.34,1.56,0.64,1)',
      }}>
        <style>{`
          @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
          @keyframes shake   { 0%,100%{transform:translateX(0)} 20%,60%{transform:translateX(-6px)} 40%,80%{transform:translateX(6px)} }
          .adj-shake { animation: shake 0.4s ease; }
        `}</style>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 22 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 11,
            background: 'rgba(99,102,241,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <SlidersHorizontal size={18} color="var(--primary, #6366f1)" />
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
              Ajustar Saldo Global
            </p>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>
              Saldo atual: <strong style={{ color: saldoAtual >= 0 ? '#10b981' : '#ef4444' }}>{formatBRL(saldoAtual)}</strong>
            </p>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', padding: 4, cursor: 'pointer' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* ── STEP 1: entrada do novo saldo ─────────────────────────────── */}
        {step === 'input' && (
          <>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.6 }}>
              Novo saldo desejado
            </label>

            <div className={shake ? 'adj-shake' : ''} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: 'var(--bg-card)', border: '1.5px solid var(--border)',
              borderRadius: 14, padding: '0 14px',
              transition: 'border-color 0.2s',
            }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-muted)' }}>R$</span>
              <input
                ref={inputRef}
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={inputStr}
                onChange={handleInputChange}
                onBlur={handleInputBlur}
                onKeyDown={e => e.key === 'Enter' && handleNext()}
                style={{
                  flex: 1, background: 'none', border: 'none', outline: 'none',
                  fontSize: 24, fontWeight: 700, color: 'var(--text-primary)',
                  padding: '16px 0',
                }}
              />
            </div>

            {/* Preview da diferença */}
            {hasValue && !isZero && (
              <div style={{
                marginTop: 12, display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 14px', borderRadius: 11,
                background: isPositive ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
                border: `1px solid ${isPositive ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)'}`,
              }}>
                {isPositive
                  ? <TrendingUp size={15} color="#10b981" />
                  : <TrendingDown size={15} color="#ef4444" />
                }
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  {isPositive ? 'Saldo vai aumentar' : 'Saldo vai diminuir'} em{' '}
                  <strong style={{ color: diffColor }}>{formatBRL(Math.abs(diff))}</strong>
                </span>
              </div>
            )}

            {hasValue && isZero && (
              <p style={{ marginTop: 10, fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
                O valor informado é igual ao saldo atual.
              </p>
            )}

            {/* Info */}
            <p style={{ marginTop: 14, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
              {isPositive
                ? '💡 Será criado um lançamento de entrada do tipo "Ajuste de Saldo" na data de hoje.'
                : isNegative
                ? '⚠️ Será criado um lançamento de saída. Você precisará informar uma justificativa.'
                : '💡 Informe o novo saldo que deseja que o aplicativo exiba hoje.'}
            </p>

            <button
              onClick={handleNext}
              disabled={!hasValue || isZero}
              style={{
                width: '100%', marginTop: 18,
                padding: '15px', borderRadius: 14,
                background: (!hasValue || isZero) ? 'var(--bg-card)' : 'var(--primary, #6366f1)',
                color: (!hasValue || isZero) ? 'var(--text-muted)' : '#fff',
                fontSize: 15, fontWeight: 700, border: 'none', cursor: (!hasValue || isZero) ? 'default' : 'pointer',
                transition: 'all 0.2s',
              }}
            >
              Continuar
            </button>
          </>
        )}

        {/* ── STEP 2: justificativa para redução ────────────────────────── */}
        {step === 'negative' && (
          <>
            {/* Banner de aviso */}
            <div style={{
              display: 'flex', gap: 10, alignItems: 'flex-start',
              background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.28)',
              borderRadius: 13, padding: '12px 14px', marginBottom: 18,
            }}>
              <AlertTriangle size={16} color="#ef4444" style={{ marginTop: 1, flexShrink: 0 }} />
              <div>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#ef4444' }}>
                  Saldo vai diminuir {formatBRL(Math.abs(diff))}
                </p>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  Antes de ajustar, verifique se não há um lançamento de saída faltante (ex.: despesa não registrada). Usar o ajuste sem lançamento pode mascarar gastos reais.
                </p>
              </div>
            </div>

            {/* Atalho para criar saída real */}
            <button
              onClick={() => { onClose(); onAddSaida(); }}
              style={{
                width: '100%', marginBottom: 16,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                padding: '13px', borderRadius: 13,
                background: 'rgba(239,68,68,0.07)', border: '1px dashed rgba(239,68,68,0.4)',
                color: '#ef4444', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}
            >
              <TrendingDown size={15} />
              Incluir lançamento de saída faltante
            </button>

            {/* Justificativa */}
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.6 }}>
              Justificativa obrigatória
            </label>

            <textarea
              ref={justRef}
              value={justificativa}
              onChange={e => setJustificativa(e.target.value)}
              placeholder="Ex.: Dinheiro sacado em espécie não registrado, perda, correção de saldo inicial..."
              rows={3}
              style={{
                width: '100%', background: 'var(--bg-card)',
                border: `1.5px solid ${shake && !justificativa.trim() ? '#ef4444' : 'var(--border)'}`,
                borderRadius: 13, padding: '12px 14px',
                fontSize: 14, color: 'var(--text-primary)', resize: 'vertical',
                outline: 'none', boxSizing: 'border-box', lineHeight: 1.5,
                transition: 'border-color 0.2s',
              }}
              className={shake && !justificativa.trim() ? 'adj-shake' : ''}
            />

            {shake && !justificativa.trim() && (
              <p style={{ margin: '6px 0 0', fontSize: 12, color: '#ef4444' }}>
                Informe a justificativa para prosseguir.
              </p>
            )}

            <p style={{ marginTop: 10, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Será criado um lançamento de saída <em>"Ajuste de saldo – [sua justificativa]"</em> de{' '}
              <strong>{formatBRL(Math.abs(diff))}</strong> na data de hoje ({today.slice(8,10)}/{today.slice(5,7)}).
            </p>

            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              <button
                onClick={() => setStep('input')}
                style={{
                  flex: 1, padding: '14px', borderRadius: 13,
                  background: 'var(--bg-card)', border: '1px solid var(--border)',
                  color: 'var(--text-secondary)', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                }}
              >
                Voltar
              </button>
              <button
                onClick={handleConfirmNegative}
                style={{
                  flex: 2, padding: '14px', borderRadius: 13,
                  background: '#ef4444', color: '#fff',
                  fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer',
                }}
              >
                Confirmar ajuste
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
