import { useState } from 'react';
import { Target } from 'lucide-react';
import { formatBRL } from '../../utils/formatters';
import Modal from '../shared/Modal';

export default function SetMetaModal({ open, onClose, currentMeta, onSave }) {
  const [value, setValue] = useState(
    currentMeta > 0 ? String(currentMeta).replace('.', ',') : ''
  );

  const diaria = () => {
    const n = parseFloat(value.replace(',', '.'));
    return isNaN(n) || n <= 0 ? null : n / 30;
  };

  const handleSave = () => {
    const n = parseFloat(value.replace(',', '.'));
    if (!isNaN(n) && n >= 0) { onSave(n); onClose(); }
  };

  const d = diaria();

  return (
    <Modal open={open} onClose={onClose} title="Meta de Gastos Diários">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{
          background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)',
          borderRadius: 12, padding: '12px 14px',
          display: 'flex', gap: 10, alignItems: 'flex-start',
        }}>
          <Target size={16} color="var(--diario)" style={{ marginTop: 1, flexShrink: 0 }} />
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Defina quanto quer gastar em total por mês com compras, delivery e outros gastos variáveis.
            O app calcula sua diária e avisa quando você está acima do esperado.
          </p>
        </div>

        <div>
          <label style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>
            Meta mensal (R$)
          </label>
          <input
            type="text"
            inputMode="decimal"
            placeholder="Ex: 900,00"
            value={value}
            onChange={e => setValue(e.target.value.replace(/[^0-9,]/g, ''))}
            style={{ fontSize: 24, fontWeight: 700, color: 'var(--diario)', textAlign: 'center' }}
            autoFocus
          />
        </div>

        {d !== null && (
          <div style={{
            background: 'var(--bg-card)', borderRadius: 12, padding: '12px 14px',
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12,
          }}>
            <div style={{ textAlign: 'center' }}>
              <p style={{ margin: '0 0 2px', fontSize: 11, color: 'var(--text-secondary)' }}>Diária (÷ 30)</p>
              <p style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--diario)' }}>{formatBRL(d)}</p>
            </div>
            <div style={{ textAlign: 'center', borderLeft: '1px solid var(--border)' }}>
              <p style={{ margin: '0 0 2px', fontSize: 11, color: 'var(--text-secondary)' }}>Por semana</p>
              <p style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>{formatBRL(d * 7)}</p>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          {currentMeta > 0 && (
            <button
              onClick={() => { onSave(0); onClose(); }}
              style={{ padding: '12px', borderRadius: 12, background: 'rgba(239,68,68,0.1)', color: 'var(--saida)', fontSize: 14, fontWeight: 500 }}
            >
              Remover meta
            </button>
          )}
          <button
            onClick={onClose}
            style={{ flex: 1, padding: '12px', borderRadius: 12, background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: 14 }}
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={!d}
            style={{
              flex: 2, padding: '12px', borderRadius: 12, fontSize: 15, fontWeight: 600,
              background: d ? 'var(--diario)' : 'var(--border)',
              color: '#fff', cursor: d ? 'pointer' : 'default',
            }}
          >
            Salvar meta
          </button>
        </div>
      </div>
    </Modal>
  );
}
