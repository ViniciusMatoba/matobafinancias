import { useState } from 'react';
import { RotateCcw, Check } from 'lucide-react';
import { formatBRL } from '../../utils/formatters';
import { SARDINHA_CATEGORIES, CATEGORY_ORDER, DEFAULT_BUDGET_PCTS } from '../../utils/categories';

export default function BudgetSettings({ config, onSave }) {
  const [renda, setRenda] = useState(
    config.rendaMensal > 0 ? String(config.rendaMensal).replace('.', ',') : ''
  );
  const [pcts, setPcts] = useState({ ...DEFAULT_BUDGET_PCTS, ...config.budgetPcts });
  const [saved, setSaved] = useState(false);

  const rendaNum = parseFloat(String(renda).replace(',', '.')) || 0;
  const totalPct = Object.values(pcts).reduce((s, v) => s + Number(v), 0);
  const excede = totalPct > 100;

  const handleSave = async () => {
    await onSave({ rendaMensal: rendaNum, budgetPcts: { ...pcts } });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>
          Orçamento Mensal
        </p>
        <button
          onClick={() => setPcts({ ...DEFAULT_BUDGET_PCTS })}
          style={{
            display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px',
            background: 'var(--bg-surface)', border: '1px solid var(--border)',
            borderRadius: 8, fontSize: 12, color: 'var(--text-secondary)',
          }}
        >
          <RotateCcw size={11} /> RESETAR
        </button>
      </div>

      {/* Renda */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>
          Renda mensal (R$)
        </label>
        <input
          type="text"
          inputMode="decimal"
          placeholder="Ex: 5.000,00"
          value={renda}
          onChange={e => setRenda(e.target.value.replace(/[^0-9,]/g, ''))}
          style={{ fontSize: 18, fontWeight: 600, color: 'var(--entrada)' }}
        />
      </div>

      {/* Total */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 12px', borderRadius: 8, marginBottom: 12,
        background: excede ? 'rgba(239,68,68,0.1)' : totalPct === 100 ? 'rgba(16,185,129,0.1)' : 'var(--bg-surface)',
        border: `1px solid ${excede ? 'rgba(239,68,68,0.3)' : totalPct === 100 ? 'rgba(16,185,129,0.3)' : 'var(--border)'}`,
      }}>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Total</span>
        <span style={{
          fontSize: 14, fontWeight: 700,
          color: excede ? 'var(--saida)' : totalPct === 100 ? 'var(--entrada)' : 'var(--text-primary)',
        }}>
          {totalPct}% {totalPct < 100 ? `(faltam ${100 - totalPct}%)` : ''}{excede ? `(excede ${totalPct - 100}%)` : ''}
        </span>
      </div>

      {/* Categorias */}
      {CATEGORY_ORDER.map(id => {
        const cat = SARDINHA_CATEGORIES[id];
        const val = Number(pcts[id]) || 0;
        const amount = rendaNum > 0 ? (rendaNum * val) / 100 : null;
        return (
          <div key={id} style={{
            display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8,
            padding: '10px 12px',
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 12,
          }}>
            <span style={{ fontSize: 18, flexShrink: 0 }}>{cat.icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {cat.label}
              </p>
              {amount !== null && (
                <p style={{ margin: 0, fontSize: 11, color: cat.color }}>{formatBRL(amount)}/mês</p>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
              <input
                type="number" min="0" max="100"
                value={val}
                onChange={e => setPcts(p => ({ ...p, [id]: Math.max(0, Math.min(100, parseInt(e.target.value) || 0)) }))}
                style={{
                  width: 48, padding: '4px 6px', textAlign: 'center',
                  fontSize: 14, fontWeight: 700, color: cat.color, borderRadius: 8,
                }}
              />
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>%</span>
            </div>
          </div>
        );
      })}

      <button
        onClick={handleSave}
        disabled={excede}
        style={{
          width: '100%', marginTop: 8, padding: '13px', borderRadius: 12,
          fontSize: 15, fontWeight: 600,
          background: saved ? 'var(--entrada)' : excede ? 'var(--border)' : 'var(--primary)',
          color: '#fff', cursor: excede ? 'default' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          transition: 'background 0.3s',
        }}
      >
        {saved ? <><Check size={16} /> Salvo!</> : 'Salvar orçamento'}
      </button>
    </div>
  );
}
