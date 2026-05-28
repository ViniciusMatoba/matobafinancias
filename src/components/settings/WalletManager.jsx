import { useState } from 'react';
import { Plus, Pencil, Trash2, Wallet } from 'lucide-react';
import { formatBRL, formatBRLInput, normalizeBRLInput } from '../../utils/formatters';

const DEFAULT_COLOR = '#8b5cf6';

const COLOR_OPTIONS = [
  '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e', 
  '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#d946ef', '#f43f5e', '#64748b'
];

export default function WalletManager({ wallets, onAdd, onUpdate, onRemove }) {
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  
  const [nome, setNome] = useState('');
  const [cor, setCor] = useState(DEFAULT_COLOR);
  const [saldoInicial, setSaldoInicial] = useState('');

  const resetForm = () => {
    setNome('');
    setCor(DEFAULT_COLOR);
    setSaldoInicial('');
    setEditingId(null);
    setFormOpen(false);
  };

  const handleEdit = (wallet) => {
    setNome(wallet.nome);
    setCor(wallet.cor || DEFAULT_COLOR);
    setSaldoInicial(wallet.saldoInicial ? wallet.saldoInicial.toString().replace('.', ',') : '');
    setEditingId(wallet.id);
    setFormOpen(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!nome.trim()) return;

    const data = {
      nome: nome.trim(),
      cor,
      saldoInicial: normalizeBRLInput(saldoInicial) || 0,
    };

    if (editingId) {
      onUpdate(editingId, data);
    } else {
      onAdd(data);
    }
    resetForm();
  };

  return (
    <div>
      {/* Lista de carteiras */}
      {wallets.length === 0 && !formOpen ? (
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--text-muted)' }}>
            Nenhuma carteira cadastrada.<br/>O sistema usará apenas o Saldo Global.
          </p>
          <button onClick={() => setFormOpen(true)} style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border)',
            padding: '8px 16px', borderRadius: 20, fontSize: 13, fontWeight: 600,
            color: 'var(--text-primary)', display: 'inline-flex', alignItems: 'center', gap: 6
          }}>
            <Plus size={16} /> Adicionar primeira conta
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: formOpen ? 16 : 0 }}>
          {wallets.map(w => (
            <div key={w.id} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '12px',
              background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12
            }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: w.cor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Wallet size={20} color="#fff" />
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{w.nome}</p>
                <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>
                  Saldo Inicial: {formatBRL(w.saldoInicial || 0)}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => handleEdit(w)} style={{ background: 'none', color: 'var(--text-muted)', padding: 4 }}>
                  <Pencil size={16} />
                </button>
                <button onClick={() => { if(window.confirm('Remover carteira?')) onRemove(w.id); }} style={{ background: 'none', color: 'var(--saida)', padding: 4 }}>
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
          
          {!formOpen && (
            <button onClick={() => setFormOpen(true)} style={{
              width: '100%', padding: '12px', border: '1px dashed var(--border)', borderRadius: 12,
              background: 'transparent', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 500,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 4
            }}>
              <Plus size={16} /> Adicionar carteira
            </button>
          )}
        </div>
      )}

      {/* Formulário */}
      {formOpen && (
        <form onSubmit={handleSubmit} style={{
          background: 'var(--bg-surface)', border: '1px solid var(--border)',
          borderRadius: 12, padding: '16px',
        }}>
          <h4 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 600 }}>
            {editingId ? 'Editar Carteira' : 'Nova Carteira'}
          </h4>
          
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>Nome da Conta/Carteira</label>
            <input type="text" placeholder="Ex: Conta Nubank, Carteira Física" value={nome} onChange={e => setNome(e.target.value)} required />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>Cor</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {COLOR_OPTIONS.map(c => (
                <button
                  key={c} type="button" onClick={() => setCor(c)}
                  style={{
                    width: 28, height: 28, borderRadius: 14, background: c,
                    border: cor === c ? '2px solid #fff' : '2px solid transparent',
                    boxShadow: cor === c ? `0 0 0 2px ${c}` : 'none'
                  }}
                />
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>Saldo Inicial (Opcional)</label>
            <input 
              type="text" inputMode="decimal" placeholder="0,00" 
              value={saldoInicial} 
              onChange={e => setSaldoInicial(formatBRLInput(e.target.value))}
              onBlur={e => setSaldoInicial(normalizeBRLInput(e.target.value).toString().replace('.', ','))}
            />
            <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>O saldo atual da sua conta.</p>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={resetForm} style={{ flex: 1, padding: '10px', borderRadius: 8, fontSize: 13, fontWeight: 500, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
              Cancelar
            </button>
            <button type="submit" style={{ flex: 1, padding: '10px', borderRadius: 8, fontSize: 13, fontWeight: 600, background: 'var(--primary)', color: '#fff', border: 'none' }}>
              Salvar
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
