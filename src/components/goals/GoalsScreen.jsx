import { useState, useMemo } from 'react';
import { Target, Plus, Pencil, Trash2, TrendingUp } from 'lucide-react';
import { formatBRL, formatBRLInput, normalizeBRLInput } from '../../utils/formatters';
import { getAutoCategory } from '../../utils/categories';

const COLOR_OPTIONS = [
  '#3b82f6', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316', '#eab308', '#22c55e', '#06b6d4',
];

export default function GoalsScreen({ goals, transactions, onAddGoal, onUpdateGoal, onRemoveGoal, onAddTransaction }) {
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  
  const [nome, setNome] = useState('');
  const [cor, setCor] = useState(COLOR_OPTIONS[0]);
  const [metaFinal, setMetaFinal] = useState('');
  const [dataAlvo, setDataAlvo] = useState('');

  const resetForm = () => {
    setNome('');
    setCor(COLOR_OPTIONS[0]);
    setMetaFinal('');
    setDataAlvo('');
    setEditingId(null);
    setFormOpen(false);
  };

  const handleEdit = (goal) => {
    setNome(goal.nome);
    setCor(goal.cor || COLOR_OPTIONS[0]);
    setMetaFinal(goal.metaFinal ? goal.metaFinal.toString().replace('.', ',') : '');
    setDataAlvo(goal.dataAlvo || '');
    setEditingId(goal.id);
    setFormOpen(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!nome.trim()) return;

    const data = {
      nome: nome.trim(),
      cor,
      metaFinal: normalizeBRLInput(metaFinal) || 0,
      dataAlvo: dataAlvo || null,
    };

    if (editingId) {
      onUpdateGoal(editingId, data);
    } else {
      onAddGoal(data);
    }
    resetForm();
  };

  // Calcular progresso
  const goalsWithProgress = useMemo(() => {
    if (!goals) return [];
    return goals.map(g => {
      // Somar todos os investimentos (ou transações vinculadas) a esta meta
      const vinculado = transactions.filter(t => t.metaId === g.id);
      const saldo = vinculado.reduce((acc, t) => {
        // Se for investimento/entrada atrelado à meta, soma. Se for saida, subtrai.
        // Na prática, aportes são "investimento"
        if (t.tipo === 'saida') return acc - t.valor;
        return acc + t.valor;
      }, 0);

      const progressoPct = g.metaFinal > 0 ? Math.min((saldo / g.metaFinal) * 100, 100) : (saldo > 0 ? 100 : 0);
      
      return { ...g, saldo, progressoPct };
    });
  }, [goals, transactions]);

  const handleAporte = (goal) => {
    // Abre form de adicionar transação com os dados pré-preenchidos
    onAddTransaction({
      tipo: 'investimento',
      metaId: goal.id,
      descricao: `Aporte: ${goal.nome}`,
      categoria: getAutoCategory('investimento') || 'liberdade',
    });
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 90 }}>
      <div style={{ padding: '20px 20px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Metas e Caixinhas</h1>
          {!formOpen && (
            <button onClick={() => setFormOpen(true)} style={{
              background: 'var(--investimento)', color: '#fff', border: 'none',
              borderRadius: 12, padding: '8px 12px', fontSize: 13, fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 6
            }}>
              <Plus size={16} /> Nova Meta
            </button>
          )}
        </div>

        {formOpen && (
          <form onSubmit={handleSubmit} style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 16, padding: '16px', marginBottom: 20,
          }}>
            <h4 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 600 }}>
              {editingId ? 'Editar Meta' : 'Nova Meta'}
            </h4>
            
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>Qual é o seu objetivo?</label>
              <input type="text" placeholder="Ex: Viagem, Carro, Reserva..." value={nome} onChange={e => setNome(e.target.value)} required />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>Cor de identificação</label>
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

            <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>Valor Alvo (Opcional)</label>
                <input 
                  type="text" inputMode="decimal" placeholder="0,00" 
                  value={metaFinal} 
                  onChange={e => setMetaFinal(formatBRLInput(e.target.value))}
                  onBlur={e => setMetaFinal(normalizeBRLInput(e.target.value).toString().replace('.', ','))}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>Data Limite (Opcional)</label>
                <input type="date" value={dataAlvo} onChange={e => setDataAlvo(e.target.value)} style={{ colorScheme: 'dark' }} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={resetForm} style={{ flex: 1, padding: '12px', borderRadius: 10, fontSize: 13, fontWeight: 500, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                Cancelar
              </button>
              <button type="submit" style={{ flex: 1, padding: '12px', borderRadius: 10, fontSize: 13, fontWeight: 600, background: 'var(--investimento)', color: '#fff', border: 'none' }}>
                Salvar Meta
              </button>
            </div>
          </form>
        )}

        {goalsWithProgress.length === 0 && !formOpen ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', background: 'var(--bg-card)', borderRadius: 16, border: '1px dashed var(--border)' }}>
            <Target size={32} color="var(--text-muted)" style={{ marginBottom: 12 }} />
            <p style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>Nenhuma meta criada</p>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Crie "caixinhas" para organizar seus investimentos. Pode ser uma reserva de emergência, uma viagem ou um carro novo.
            </p>
            <button onClick={() => setFormOpen(true)} style={{ background: 'var(--investimento)', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 12, fontSize: 14, fontWeight: 600 }}>
              Criar primeira meta
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {goalsWithProgress.map(g => (
              <div key={g.id} style={{
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: 16, overflow: 'hidden'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', padding: '16px 16px 12px', position: 'relative' }}>
                  <div style={{ position: 'absolute', top: 0, left: 0, width: 4, height: '100%', background: g.cor || COLOR_OPTIONS[0] }} />
                  
                  <div style={{ flex: 1, paddingLeft: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{g.nome}</p>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => handleEdit(g)} style={{ background: 'none', padding: 4, color: 'var(--text-muted)' }}><Pencil size={14} /></button>
                        <button onClick={() => { if(window.confirm('Remover esta meta? O dinheiro não será perdido do saldo geral.')) onRemoveGoal(g.id); }} style={{ background: 'none', padding: 4, color: 'var(--saida)' }}><Trash2 size={14} /></button>
                      </div>
                    </div>
                    
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                      <span style={{ fontSize: 20, fontWeight: 700, color: g.cor || COLOR_OPTIONS[0] }}>
                        {formatBRL(g.saldo)}
                      </span>
                      {g.metaFinal > 0 && (
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                          de {formatBRL(g.metaFinal)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {g.metaFinal > 0 && (
                  <div style={{ padding: '0 16px', marginBottom: 12 }}>
                    <div style={{ height: 6, background: 'var(--bg-surface)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${g.progressoPct}%`, background: g.cor || COLOR_OPTIONS[0], borderRadius: 3, transition: 'width 0.5s' }} />
                    </div>
                    <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--text-secondary)', textAlign: 'right' }}>
                      {g.progressoPct.toFixed(1)}% concluído
                    </p>
                  </div>
                )}

                <div style={{ padding: '0 16px 16px' }}>
                  <button onClick={() => handleAporte(g)} style={{
                    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    padding: '10px', borderRadius: 10, fontSize: 13, fontWeight: 600,
                    background: `rgba(${parseInt((g.cor || COLOR_OPTIONS[0]).slice(1,3),16)},${parseInt((g.cor || COLOR_OPTIONS[0]).slice(3,5),16)},${parseInt((g.cor || COLOR_OPTIONS[0]).slice(5,7),16)}, 0.1)`,
                    color: g.cor || COLOR_OPTIONS[0], border: 'none'
                  }}>
                    <TrendingUp size={16} /> Fazer Aporte
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
