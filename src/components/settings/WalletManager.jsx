import { useState, useMemo } from 'react';
import { Plus, Pencil, Trash2, Wallet, FileText } from 'lucide-react';
import { formatBRL, formatBRLInput, normalizeBRLInput, addDays } from '../../utils/formatters';
import { calcSaldo, expandOccurrences } from '../../utils/projectionCalc';
import Modal from '../shared/Modal';

const DEFAULT_COLOR = '#8b5cf6';

const COLOR_OPTIONS = [
  '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e', 
  '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#d946ef', '#f43f5e', '#64748b'
];

export default function WalletManager({ wallets, transactions = [], onAdd, onUpdate, onRemove }) {
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  
  const [nome, setNome] = useState('');
  const [cor, setCor] = useState(DEFAULT_COLOR);
  const [saldoInicial, setSaldoInicial] = useState('');

  const [activeWallet, setActiveWallet] = useState(null);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const handleOpenStatement = (wallet) => {
    setActiveWallet(wallet);
    // Configura o filtro padrão para os últimos 30 dias
    const d = new Date();
    d.setDate(d.getDate() - 30);
    setFromDate(d.toISOString().slice(0, 10));
    setToDate(new Date().toISOString().slice(0, 10));
  };

  const statementData = useMemo(() => {
    if (!activeWallet) return null;

    const walletTxs = transactions.filter(t => t.carteiraId === activeWallet.id);
    
    // Saldo inicial acumulado antes de de fromDate
    const beforeSaldo = calcSaldo(walletTxs, '2020-01-01', addDays(fromDate, -1));
    const saldoAbertura = (activeWallet.saldoInicial || 0) + beforeSaldo;

    // Ocorrências do período
    const occs = walletTxs.flatMap(tx =>
      expandOccurrences(tx, fromDate, toDate).map(o => ({ ...o, tx }))
    );
    // Ordenação cronológica crescente
    occs.sort((a, b) => a.date.localeCompare(b.date));

    let runningSaldo = saldoAbertura;
    const historyList = occs.map(o => {
      runningSaldo += o.sinal * o.valor;
      return {
        ...o,
        saldoProgressivo: runningSaldo
      };
    });

    // Inverte para exibir mais recente em primeiro
    historyList.reverse();

    let totalEntradas = 0;
    let totalSaidas = 0;
    occs.forEach(o => {
      if (o.sinal > 0) totalEntradas += o.valor;
      else totalSaidas += o.valor;
    });

    return {
      saldoAbertura,
      saldoFechamento: runningSaldo,
      historyList,
      totalEntradas,
      totalSaidas
    };
  }, [activeWallet, transactions, fromDate, toDate]);

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
                <button
                  type="button"
                  onClick={() => handleOpenStatement(w)}
                  title="Ver extrato"
                  style={{ background: 'none', color: 'var(--primary)', padding: 4, display: 'flex', alignItems: 'center', cursor: 'pointer' }}
                >
                  <FileText size={16} />
                </button>
                <button type="button" onClick={() => handleEdit(w)} style={{ background: 'none', color: 'var(--text-muted)', padding: 4, cursor: 'pointer' }}>
                  <Pencil size={16} />
                </button>
                <button type="button" onClick={() => { if(window.confirm('Remover carteira?')) onRemove(w.id); }} style={{ background: 'none', color: 'var(--saida)', padding: 4, cursor: 'pointer' }}>
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
      {/* Modal de Extrato por Carteira */}
      {activeWallet && statementData && (
        <Modal
          open={!!activeWallet}
          onClose={() => setActiveWallet(null)}
          title={`Extrato – ${activeWallet.nome}`}
        >
          <div style={{ padding: '0 4px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Seletor de Período */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '10px' }}>
              <div>
                <label style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>Data Início</label>
                <input
                  type="date"
                  value={fromDate}
                  onChange={e => setFromDate(e.target.value)}
                  style={{ width: '100%', padding: '6px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', colorScheme: 'dark', background: 'var(--bg-card)' }}
                />
              </div>
              <div>
                <label style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>Data Fim</label>
                <input
                  type="date"
                  value={toDate}
                  onChange={e => setToDate(e.target.value)}
                  style={{ width: '100%', padding: '6px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', colorScheme: 'dark', background: 'var(--bg-card)' }}
                />
              </div>
            </div>

            {/* Painel Financeiro Resumido */}
            <div style={{
              background: 'var(--bg-surface)', border: '1px solid var(--border)',
              borderRadius: 12, padding: '12px', display: 'flex', flexDirection: 'column', gap: 6,
              fontSize: 11, color: 'var(--text-secondary)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Saldo Abertura:</span>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{formatBRL(statementData.saldoAbertura)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--entrada)' }}>
                <span>Total Entradas (+):</span>
                <span style={{ fontWeight: 600 }}>{formatBRL(statementData.totalEntradas)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--saida)' }}>
                <span>Total Saídas (-):</span>
                <span style={{ fontWeight: 600 }}>{formatBRL(statementData.totalSaidas)}</span>
              </div>
              <div style={{
                display: 'flex', justifyContent: 'space-between',
                borderTop: '1px solid var(--border)', paddingTop: 6, marginTop: 2,
                fontSize: 12, fontWeight: 700
              }}>
                <span style={{ color: 'var(--text-primary)' }}>Saldo Fechamento:</span>
                <span style={{ color: statementData.saldoFechamento >= 0 ? 'var(--entrada)' : 'var(--saida)' }}>{formatBRL(statementData.saldoFechamento)}</span>
              </div>
            </div>

            {/* Lista Cronológica */}
            <p style={{ margin: '4px 0 0', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Histórico de Lançamentos</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: '35vh', overflowY: 'auto', paddingRight: 2 }}>
              {statementData.historyList.length === 0 ? (
                <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, margin: '20px 0' }}>
                  Nenhuma movimentação no período selecionado.
                </p>
              ) : statementData.historyList.map((o, idx) => {
                const isEntrada = o.sinal > 0;
                return (
                  <div key={idx} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '8px 10px', background: 'var(--bg-surface)', border: '1px solid var(--border)',
                    borderRadius: 10, fontSize: 12
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {o.tx.descricao || (isEntrada ? 'Entrada' : 'Saída')}
                      </p>
                      <p style={{ margin: 0, fontSize: 10, color: 'var(--text-muted)' }}>
                        {o.date.slice(8, 10)}/{o.date.slice(5, 7)}
                      </p>
                    </div>
                    <div style={{ textAlign: 'right', marginLeft: 8 }}>
                      <p style={{ margin: 0, fontWeight: 700, color: isEntrada ? 'var(--entrada)' : 'var(--saida)' }}>
                        {isEntrada ? '+' : '-'}{formatBRL(o.valor)}
                      </p>
                      <p style={{ margin: 0, fontSize: 9, color: 'var(--text-muted)' }}>
                        {formatBRL(o.saldoProgressivo)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
