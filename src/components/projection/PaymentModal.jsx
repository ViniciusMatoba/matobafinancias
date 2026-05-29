import { useState } from 'react';
import { X, CheckCircle } from 'lucide-react';
import { todayStr } from '../../utils/formatters';

const FREQ_LABEL = { mensal: 'mensal', semanal: 'semanal', diario: 'diário', parcelado: 'parcelado' };

export default function PaymentModal({ item, occDate, onConfirm, onClose }) {
  const today = todayStr();
  const tx = item.tx;

  const [paymentDate, setPaymentDate] = useState(today);
  const [rawValor, setRawValor] = useState(String(Number(item.valor || 0).toFixed(2)));
  const [scope, setScope] = useState('single');

  const isRecurring = ['mensal', 'semanal', 'diario'].includes(tx.frequencia);
  const isCartao    = tx.tipo === 'cartao';
  const isVirtual   = tx.id?.includes('-proj-');
  const showScope   = isRecurring && !isCartao && !isVirtual;

  const desc       = tx.descricao || (isCartao ? 'Fatura do cartão' : 'Lançamento');
  const occFmt     = `${occDate.slice(8, 10)}/${occDate.slice(5, 7)}`;
  const valorNum   = parseFloat(String(rawValor).replace(',', '.')) || 0;
  const canConfirm = paymentDate && valorNum > 0;

  // Formata o input como decimal ao sair do campo
  const handleBlur = () => {
    const v = parseFloat(String(rawValor).replace(',', '.'));
    if (!isNaN(v)) setRawValor(v.toFixed(2));
  };

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.72)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        backdropFilter: 'blur(2px)',
      }}
    >
      <div style={{
        width: '100%', maxWidth: 480,
        background: 'var(--bg-card)',
        borderRadius: '20px 20px 0 0',
        padding: '20px 20px 40px',
        boxShadow: '0 -8px 40px rgba(0,0,0,0.5)',
      }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 12,
              background: 'rgba(16,185,129,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
            }}>
              💸
            </div>
            <div>
              <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                Registrar Pagamento
              </p>
              <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>
                Programado para {occFmt}
              </p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 6 }}>
            <X size={20} />
          </button>
        </div>

        {/* Descrição */}
        <div style={{
          background: 'var(--bg-surface)', borderRadius: 12,
          padding: '10px 14px', marginBottom: 14,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
              {desc}
            </p>
            {(isRecurring || isCartao) && (
              <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>
                {isCartao
                  ? `Fatura · ${item.tx.itens?.length ?? 0} item(ns)`
                  : `Recorrente · ${FREQ_LABEL[tx.frequencia] || tx.frequencia}`}
              </p>
            )}
            {item.parcela && (
              <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>
                Parcela {item.parcela}/{item.totalParcelas}
              </p>
            )}
          </div>
        </div>

        {/* Valor */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Valor pago
          </label>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'var(--bg-surface)', border: '1px solid var(--border)',
            borderRadius: 12, padding: '0 14px',
          }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-muted)' }}>R$</span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={rawValor}
              onChange={e => setRawValor(e.target.value)}
              onBlur={handleBlur}
              style={{
                flex: 1, background: 'none', border: 'none', outline: 'none',
                fontSize: 20, fontWeight: 700, color: 'var(--saida)',
                padding: '12px 0',
              }}
            />
          </div>
        </div>

        {/* Data */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Data do pagamento
          </label>
          <input
            type="date"
            value={paymentDate}
            onChange={e => setPaymentDate(e.target.value)}
            style={{
              width: '100%', boxSizing: 'border-box',
              background: 'var(--bg-surface)', border: '1px solid var(--border)',
              borderRadius: 12, padding: '12px 14px',
              fontSize: 15, color: 'var(--text-primary)', colorScheme: 'dark',
            }}
          />
        </div>

        {/* Escopo — só para recorrentes não-cartão */}
        {showScope && (
          <div style={{ marginBottom: 18 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Aplicar a
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              {[
                { value: 'single', label: '🎯 Só esta vez',       sub: 'Próximas não são afetadas' },
                { value: 'future', label: '📅 Esta e próximas',   sub: 'Altera o padrão recorrente' },
              ].map(opt => {
                const active = scope === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setScope(opt.value)}
                    style={{
                      flex: 1, padding: '10px 8px', borderRadius: 10, textAlign: 'left',
                      background: active ? 'rgba(99,102,241,0.18)' : 'var(--bg-surface)',
                      border: active ? '1px solid rgba(99,102,241,0.5)' : '1px solid var(--border)',
                      cursor: 'pointer',
                    }}
                  >
                    <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: active ? 'var(--primary)' : 'var(--text-primary)' }}>
                      {opt.label}
                    </p>
                    <p style={{ margin: '2px 0 0', fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.3 }}>
                      {opt.sub}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Confirmar */}
        <button
          type="button"
          onClick={() => onConfirm({ paymentDate, valor: valorNum, scope })}
          disabled={!canConfirm}
          style={{
            width: '100%', padding: '14px', borderRadius: 14, border: 'none',
            background: canConfirm ? 'linear-gradient(135deg, #10b981, #059669)' : 'var(--border)',
            color: '#fff', fontSize: 15, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            cursor: canConfirm ? 'pointer' : 'default',
            boxShadow: canConfirm ? '0 4px 16px rgba(16,185,129,0.3)' : 'none',
            transition: 'all 0.2s',
          }}
        >
          <CheckCircle size={18} />
          Confirmar Pagamento
        </button>

      </div>
    </div>
  );
}
