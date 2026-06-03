import { useState } from 'react';
import { CreditCard, Plus, Trash2, Pencil } from 'lucide-react';
import { formatBRL, formatBRLInput, normalizeBRLInput, parseBRLInput, numberToBRLInput } from '../../utils/formatters';

const CARD_COLORS = ['#3b82f6','#6366f1','#a855f7','#ec4899','#10b981','#f59e0b','#ef4444','#14b8a6'];

const EMPTY = { nome: '', limite: '', diaVencimento: '', diaFechamento: '', cor: CARD_COLORS[0] };

function CardForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(initial ? { ...initial, limite: numberToBRLInput(initial.limite) } : { ...EMPTY });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = () => {
    if (!form.nome.trim()) return;
    const limite = parseBRLInput(form.limite);
    onSave({ ...form, limite, diaVencimento: parseInt(form.diaVencimento) || 1, diaFechamento: parseInt(form.diaFechamento) || 1 });
  };

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--primary)', borderRadius: 14, padding: 16, marginBottom: 12 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>Nome do cartão</label>
          <input type="text" placeholder="Ex: Nubank, Itaú..." value={form.nome} onChange={e => set('nome', e.target.value)} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>Limite (R$)</label>
            <input type="text" inputMode="decimal" placeholder="5.000,00" value={form.limite} onChange={e => set('limite', formatBRLInput(e.target.value))} onBlur={e => set('limite', normalizeBRLInput(e.target.value))} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>Dia do vencimento</label>
            <input type="number" min="1" max="31" placeholder="10" value={form.diaVencimento} onChange={e => set('diaVencimento', e.target.value)} />
          </div>
        </div>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>Dia de fechamento</label>
          <input type="number" min="1" max="31" placeholder="3" value={form.diaFechamento} onChange={e => set('diaFechamento', e.target.value)} />
        </div>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8, display: 'block' }}>Cor</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {CARD_COLORS.map(c => (
              <button key={c} type="button" onClick={() => set('cor', c)} style={{
                width: 28, height: 28, borderRadius: '50%', background: c,
                border: form.cor === c ? '3px solid white' : '2px solid transparent',
                outline: form.cor === c ? `2px solid ${c}` : 'none',
              }} />
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onCancel} style={{ flex: 1, padding: '10px', borderRadius: 10, background: 'var(--bg-surface)', color: 'var(--text-secondary)', fontSize: 14 }}>
            Cancelar
          </button>
          <button onClick={handleSave} style={{ flex: 2, padding: '10px', borderRadius: 10, background: 'var(--primary)', color: '#fff', fontSize: 14, fontWeight: 600 }}>
            Salvar cartão
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CardManager({ cards, transactions = [], onAdd, onUpdate, onRemove }) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>Meus Cartões</p>
        {!adding && (
          <button onClick={() => setAdding(true)} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px',
            background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)',
            borderRadius: 10, color: 'var(--primary)', fontSize: 13, fontWeight: 500,
          }}>
            <Plus size={14} /> Novo
          </button>
        )}
      </div>

      {adding && (
        <CardForm onSave={data => { onAdd(data); setAdding(false); }} onCancel={() => setAdding(false)} />
      )}

      {cards.map(card => {
        // Calcular estatísticas de limite comprometido
        const todayMonth = new Date().toISOString().slice(0, 7);
        const cardTxs = transactions.filter(t => t.tipo === 'cartao' && t.cartaoId === card.id);
        let faturaAtual = 0;
        let comprometidoFuturo = 0;

        cardTxs.forEach(tx => {
          const txMonth = tx.dataInicio.slice(0, 7);
          if (tx.itens && tx.itens.length > 0) {
            tx.itens.forEach(item => {
              const val = Number(item.valor) || 0;
              if (txMonth === todayMonth) {
                faturaAtual += val;
              } else if (txMonth > todayMonth) {
                comprometidoFuturo += val;
              }
              if (item.isParcelado) {
                const remaining = Math.max(0, item.totalParcelas - (item.parcelaAtual || 1));
                comprometidoFuturo += remaining * val;
              }
            });
          } else {
            const val = Number(tx.valor) || 0;
            if (txMonth === todayMonth) {
              faturaAtual += val;
            } else if (txMonth > todayMonth) {
              comprometidoFuturo += val;
            }
          }
        });

        const totalComprometido = faturaAtual + comprometidoFuturo;
        const limiteDisponivel = Math.max(0, (card.limite || 0) - totalComprometido);

        return editing === card.id ? (
          <CardForm
            key={card.id}
            initial={card}
            onSave={data => { onUpdate(card.id, data); setEditing(null); }}
            onCancel={() => setEditing(null)}
          />
        ) : (
          <div key={card.id} style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 14, padding: '14px', marginBottom: 10,
            borderLeft: `4px solid ${card.cor || 'var(--primary)'}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: `${card.cor}22`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <CreditCard size={18} color={card.cor} />
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{card.nome}</p>
                  <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>
                    Vence dia {card.diaVencimento} · Fecha dia {card.diaFechamento}
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button onClick={() => setEditing(card.id)} style={{ background: 'none', color: 'var(--text-muted)', display: 'flex', padding: 4 }}><Pencil size={14} /></button>
                <button onClick={() => onRemove(card.id)} style={{ background: 'none', color: 'var(--saida)', display: 'flex', padding: 4 }}><Trash2 size={14} /></button>
              </div>
            </div>

            {/* Nova seção detalhada de limite e comprometimentos */}
            <div style={{
              display: 'flex', flexDirection: 'column', gap: 6,
              background: 'var(--bg-surface)', borderRadius: 10, padding: '10px 12px',
              fontSize: 11, color: 'var(--text-secondary)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Limite Total:</span>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{formatBRL(card.limite || 0)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Fatura Atual:</span>
                <span style={{ fontWeight: 600, color: 'var(--saida)' }}>-{formatBRL(faturaAtual)}</span>
              </div>
              {comprometidoFuturo > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Parcelados Futuros:</span>
                  <span style={{ color: 'var(--text-muted)' }}>-{formatBRL(comprometidoFuturo)}</span>
                </div>
              )}
              <div style={{
                display: 'flex', justifyContent: 'space-between',
                borderTop: '1px solid var(--border)', paddingTop: 6, marginTop: 2,
                fontSize: 12, fontWeight: 700
              }}>
                <span style={{ color: 'var(--text-primary)' }}>Limite Disponível:</span>
                <span style={{ color: 'var(--entrada)' }}>{formatBRL(limiteDisponivel)}</span>
              </div>
            </div>
          </div>
        );
      })}

      {cards.length === 0 && !adding && (
        <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, margin: '20px 0' }}>
          Nenhum cartão cadastrado
        </p>
      )}
    </div>
  );
}
