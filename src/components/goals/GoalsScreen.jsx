/* eslint-disable react-hooks/purity */
import { useState, useMemo, useEffect } from 'react';
import { Target, Plus, Pencil, Trash2, TrendingUp } from 'lucide-react';
import { formatBRL, formatBRLInput, normalizeBRLInput } from '../../utils/formatters';
import { getAutoCategory, PERCENTUAL_CATEGORIES, DEFAULT_BUDGET_PCTS } from '../../utils/categories';

const COLOR_OPTIONS = [
  '#3b82f6', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316', '#eab308', '#22c55e', '#06b6d4',
];

export default function GoalsScreen({ goals, transactions, config, onSaveConfig, onAddGoal, onUpdateGoal, onRemoveGoal, onAddTransaction }) {
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  
  const [nome, setNome] = useState('');
  const [cor, setCor] = useState(COLOR_OPTIONS[0]);
  const [metaFinal, setMetaFinal] = useState('');
  const [dataAlvo, setDataAlvo] = useState('');

  const [isIndependencia, setIsIndependencia] = useState(false);
  const [tipoAtivo, setTipoAtivo] = useState('cdb');
  const [taxaRendimento, setTaxaRendimento] = useState('');
  const [aporteMensal, setAporteMensal] = useState('');

  const [expandedSimId, setExpandedSimId] = useState(null);

  // --- Estados do Painel Pense com Calma ---
  const [activeTab, setActiveTab] = useState('caixinhas'); // 'caixinhas' | 'penseComCalma'
  const impulseItems = config?.impulseItems || [];
  const economiaAcumulada = config?.economiaAcumulada || 0;

  const [nomeDesejo, setNomeDesejo] = useState('');
  const [precoDesejo, setPrecoDesejo] = useState('');
  const [categoriaDesejo, setCategoriaDesejo] = useState('prazeres');
  const [penseFormOpen, setPenseFormOpen] = useState(false);
  const [, setTick] = useState(0);
  const [confettiParticles, setConfettiParticles] = useState([]);

  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 30000);
    return () => clearInterval(timer);
  }, []);

  const triggerConfetti = () => {
    const particles = [];
    const emojis = ['🎉', '💰', '💸', '✨', '💎', '🚀', '🥳'];
    for (let i = 0; i < 40; i++) {
      particles.push({
        id: Math.random(),
        emoji: emojis[Math.floor(Math.random() * emojis.length)],
        x: Math.random() * 100,
        y: -10 - Math.random() * 20,
        angle: Math.random() * 360,
        scale: 0.5 + Math.random() * 1,
        duration: 1.5 + Math.random() * 2,
        delay: Math.random() * 0.5
      });
    }
    setConfettiParticles(particles);
    setTimeout(() => {
      setConfettiParticles([]);
    }, 3500);
  };

  const handleAddImpulseItem = async (e) => {
    e.preventDefault();
    if (!nomeDesejo.trim() || !precoDesejo) return;

    const priceNum = normalizeBRLInput(precoDesejo) || 0;
    if (priceNum <= 0) return;

    const newItem = {
      id: Date.now().toString(),
      nome: nomeDesejo.trim(),
      preco: priceNum,
      categoria: categoriaDesejo,
      createdAt: Date.now(),
    };

    if (onSaveConfig) {
      await onSaveConfig({
        impulseItems: [newItem, ...impulseItems]
      });
    }
    setNomeDesejo('');
    setPrecoDesejo('');
    setCategoriaDesejo('prazeres');
    setPenseFormOpen(false);
  };

  const handleDesistir = async (item) => {
    triggerConfetti();
    if (onSaveConfig) {
      await onSaveConfig({
        economiaAcumulada: economiaAcumulada + item.preco,
        impulseItems: impulseItems.filter(i => i.id !== item.id)
      });
    }
  };

  const handleConfirmar = async (item) => {
    onAddTransaction({
      tipo: 'saida',
      descricao: `Compra: ${item.nome}`,
      valor: item.preco,
      categoria: item.categoria,
      frequencia: 'unico',
      dataInicio: new Date().toISOString().slice(0, 10),
    });
    if (onSaveConfig) {
      await onSaveConfig({
        impulseItems: impulseItems.filter(i => i.id !== item.id)
      });
    }
  };

  const getRemainingTime = (createdAt) => {
    const tenDaysInMs = 10 * 24 * 60 * 60 * 1000;
    const elapsed = Date.now() - createdAt;
    const remaining = tenDaysInMs - elapsed;
    if (remaining <= 0) return 'Concluído';
    
    const days = Math.floor(remaining / (24 * 60 * 60 * 1000));
    const hours = Math.floor((remaining % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
    
    if (days > 0) {
      return `${days}d e ${hours}h`;
    } else if (hours > 0) {
      return `${hours}h e ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  };

  const resetForm = () => {
    setNome('');
    setCor(COLOR_OPTIONS[0]);
    setMetaFinal('');
    setDataAlvo('');
    setIsIndependencia(false);
    setTipoAtivo('cdb');
    setTaxaRendimento('');
    setAporteMensal('');
    setEditingId(null);
    setFormOpen(false);
  };

  const handleEdit = (goal) => {
    setNome(goal.nome);
    setCor(goal.cor || COLOR_OPTIONS[0]);
    setMetaFinal(goal.metaFinal ? goal.metaFinal.toString().replace('.', ',') : '');
    setDataAlvo(goal.dataAlvo || '');
    setIsIndependencia(goal.isIndependencia || false);
    setTipoAtivo(goal.tipoAtivo || 'cdb');
    setTaxaRendimento(goal.taxaRendimento ? goal.taxaRendimento.toString().replace('.', ',') : '');
    setAporteMensal(goal.aporteMensal ? goal.aporteMensal.toString().replace('.', ',') : '');
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
      isIndependencia,
      tipoAtivo: isIndependencia ? tipoAtivo : null,
      taxaRendimento: isIndependencia ? (normalizeBRLInput(taxaRendimento) || 0) : null,
      aporteMensal: isIndependencia ? (normalizeBRLInput(aporteMensal) || 0) : null,
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
        if (t.tipo === 'saida') return acc - t.valor;
        return acc + t.valor;
      }, 0);

      const progressoPct = g.metaFinal > 0 ? Math.min((saldo / g.metaFinal) * 100, 100) : (saldo > 0 ? 100 : 0);
      
      return { ...g, saldo, progressoPct };
    });
  }, [goals, transactions]);

  const handleAporte = (goal) => {
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
          {activeTab === 'caixinhas' && !formOpen && (
            <button onClick={() => setFormOpen(true)} style={{
              background: 'var(--investimento)', color: '#fff', border: 'none',
              borderRadius: 12, padding: '8px 12px', fontSize: 13, fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer'
            }}>
              <Plus size={16} /> Nova Meta
            </button>
          )}
        </div>

        {/* Seletor de Abas Segmentado de Alta Fidelidade */}
        <div style={{ display: 'flex', background: 'var(--bg-surface)', borderRadius: 12, padding: 4, marginBottom: 20, border: '1px solid var(--border)' }}>
          <button 
            type="button"
            onClick={() => setActiveTab('caixinhas')} 
            style={{
              flex: 1, padding: '10px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: 'none',
              background: activeTab === 'caixinhas' ? 'var(--bg-card)' : 'transparent',
              color: activeTab === 'caixinhas' ? 'var(--text-primary)' : 'var(--text-secondary)',
              transition: 'all 0.2s', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
            }}
          >
            📦 Minhas Caixinhas
          </button>
          <button 
            type="button"
            onClick={() => setActiveTab('penseComCalma')} 
            style={{
              flex: 1, padding: '10px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: 'none',
              background: activeTab === 'penseComCalma' ? 'var(--bg-card)' : 'transparent',
              color: activeTab === 'penseComCalma' ? 'var(--text-primary)' : 'var(--text-secondary)',
              transition: 'all 0.2s', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
            }}
          >
            ⏳ Pense com Calma
          </button>
        </div>

        {activeTab === 'caixinhas' ? (
          <>
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

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                  <input 
                    type="checkbox" 
                    id="isIndependencia" 
                    checked={isIndependencia} 
                    onChange={e => setIsIndependencia(e.target.checked)} 
                    style={{ width: 18, height: 18, accentColor: 'var(--primary)' }}
                  />
                  <label htmlFor="isIndependencia" style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', cursor: 'pointer' }}>
                    💎 Esta caixinha é de Independência Financeira
                  </label>
                </div>

                {isIndependencia && (
                  <div style={{
                    background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)',
                    borderRadius: 12, padding: '12px', marginBottom: 16
                  }}>
                    <div style={{ marginBottom: 10 }}>
                      <label style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>Tipo de Ativo</label>
                      <select value={tipoAtivo} onChange={e => {
                        setTipoAtivo(e.target.value);
                        if (e.target.value === 'poupança') setTaxaRendimento('6,17');
                        else if (e.target.value === 'cdb') setTaxaRendimento('10,75');
                        else if (e.target.value === 'lci') setTaxaRendimento('9,0');
                        else if (e.target.value === 'acoes') setTaxaRendimento('12,0');
                      }}>
                        <option value="poupança">Poupança (Isento IR)</option>
                        <option value="cdb">CDB / Tesouro Selic (Tabela Regressiva)</option>
                        <option value="lci">LCI / LCA (Isento IR)</option>
                        <option value="acoes">Ações / FIIs (Renda Variável)</option>
                      </select>
                    </div>

                    <div style={{ display: 'flex', gap: 10 }}>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>Rend. Esperado (% a.a.)</label>
                        <input 
                          type="text" inputMode="decimal" placeholder="0,00" 
                          value={taxaRendimento} 
                          onChange={e => setTaxaRendimento(formatBRLInput(e.target.value))}
                        />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>Aporte Mensal (R$)</label>
                        <input 
                          type="text" inputMode="decimal" placeholder="0,00" 
                          value={aporteMensal} 
                          onChange={e => setAporteMensal(formatBRLInput(e.target.value))}
                        />
                      </div>
                    </div>
                  </div>
                )}

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
                          <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>{g.nome} {g.isIndependencia && <span style={{ fontSize: 13 }} title="Caixinha de Independência Financeira">💎</span>}</p>
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

                    {g.isIndependencia && (
                      <div style={{ padding: '0 16px 16px' }}>
                        <button 
                          onClick={() => setExpandedSimId(expandedSimId === g.id ? null : g.id)}
                          style={{
                            width: '100%', padding: '8px', borderRadius: 10, fontSize: 12, fontWeight: 600,
                            background: 'var(--bg-surface)', border: '1px solid var(--border)',
                            color: 'var(--text-primary)', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
                          }}
                        >
                          <span>💎 {expandedSimId === g.id ? 'Fechar Simulador' : 'Simulador Viver de Renda'}</span>
                        </button>

                        {expandedSimId === g.id && (
                          <div style={{
                            marginTop: 12, background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border)',
                            borderRadius: 12, padding: '12px', textAlign: 'left'
                          }}>
                            {(() => {
                              const taxaAnual = g.taxaRendimento || 10.75;
                              const taxaMensal = Math.pow(1 + (taxaAnual / 100), 1/12) - 1;
                              const aporte = g.aporteMensal || 0;
                              const saldoAtual = g.saldo || 0;
                              const meta = g.metaFinal || 500000;

                              let meses = 0;
                              let saldoProj = saldoAtual;
                              while (saldoProj < meta && meses < 600) {
                                meses++;
                                saldoProj = saldoProj * (1 + taxaMensal) + aporte;
                              }

                              const anos = Math.floor(meses / 12);
                              const mesesResto = meses % 12;
                              const rendimentoMensalEstimado = saldoAtual * taxaMensal;

                              let dicaTributaria = '';
                              if (g.tipoAtivo === 'poupança') {
                                dicaTributaria = 'Isento de Imposto de Renda (IR). Porém, a poupança rende pouco e costuma perder para a inflação real. Considere títulos Selic ou CDBs.';
                              } else if (g.tipoAtivo === 'cdb') {
                                dicaTributaria = 'Tributado pela tabela regressiva de IR (de 22,5% a 15% de acordo com o prazo). Evite resgates rápidos para poupar imposto e fugir do IOF.';
                              } else if (g.tipoAtivo === 'lci') {
                                dicaTributaria = 'Isento de Imposto de Renda para pessoas físicas. Excelente opção de renda fixa de médio prazo (carência mínima de 90 dias).';
                              } else if (g.tipoAtivo === 'acoes') {
                                dicaTributaria = 'Renda Variável. Rendimentos de FIIs são isentos de IR. Venda de ações é isenta até R$ 20 mil/mês. Atenção: possui oscilações e riscos do mercado.';
                              }

                              return (
                                <div>
                                  <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                                    Projeção de Independência
                                  </p>
                                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                                    <div style={{ background: 'var(--bg-surface)', padding: '8px', borderRadius: 8 }}>
                                      <span style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block' }}>Rend. Mensal Atual</span>
                                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--entrada)' }}>{formatBRL(rendimentoMensalEstimado)}</span>
                                    </div>
                                    <div style={{ background: 'var(--bg-surface)', padding: '8px', borderRadius: 8 }}>
                                      <span style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block' }}>Tempo Estimado</span>
                                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary)' }}>
                                        {meses >= 600 ? 'Mais de 50 anos' : `${anos}a ${mesesResto}m`}
                                      </span>
                                    </div>
                                  </div>

                                  <div style={{ background: 'rgba(99,102,241,0.06)', border: '1px dashed rgba(99,102,241,0.3)', borderRadius: 10, padding: '10px', fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                                    <strong style={{ color: 'var(--text-primary)', display: 'block', marginBottom: 4 }}>💡 Lembrete de Impostos & Ativos:</strong>
                                    {dicaTributaria}
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div>
            {/* Placar de Economia Acumulada */}
            <div style={{
              background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.08), rgba(59, 130, 246, 0.08))',
              border: '1px solid var(--border)',
              borderRadius: 16, padding: '16px', marginBottom: 20, textAlign: 'center',
              boxShadow: '0 4px 20px rgba(0,0,0,0.05)'
            }}>
              <span style={{ fontSize: 11, color: '#10b981', fontWeight: 700, display: 'block', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 4 }}>
                🏆 Economia Acumulada
              </span>
              <span style={{ fontSize: 32, fontWeight: 800, color: 'var(--text-primary)' }}>
                {formatBRL(economiaAcumulada)}
              </span>
              <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
                Dinheiro poupado ao resistir a impulsos de consumo!
              </p>
            </div>

            {/* Cabeçalho da Seção */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>Lista de Reflexão</h2>
              {!penseFormOpen && (
                <button onClick={() => setPenseFormOpen(true)} style={{
                  background: 'var(--primary)', color: '#fff', border: 'none',
                  borderRadius: 12, padding: '8px 12px', fontSize: 12, fontWeight: 600,
                  display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer'
                }}>
                  <Plus size={14} /> Novo Item
                </button>
              )}
            </div>

            {/* Formulário de Novo Desejo */}
            {penseFormOpen && (
              <form onSubmit={handleAddImpulseItem} style={{
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: 16, padding: '16px', marginBottom: 20,
              }}>
                <h4 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 700 }}>
                  🧘‍♂️ Adicionar Desejo para Reflexão
                </h4>
                
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>O que você deseja comprar?</label>
                  <input type="text" placeholder="Ex: Novo Smartphone, Tênis de Corrida..." value={nomeDesejo} onChange={e => setNomeDesejo(e.target.value)} required />
                </div>

                <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>Preço Estimado</label>
                    <input 
                      type="text" inputMode="decimal" placeholder="0,00" 
                      value={precoDesejo} 
                      onChange={e => setPrecoDesejo(formatBRLInput(e.target.value))}
                      onBlur={e => setPrecoDesejo(normalizeBRLInput(e.target.value).toString().replace('.', ','))}
                      required
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>Categoria do Gasto</label>
                    <select value={categoriaDesejo} onChange={e => setCategoriaDesejo(e.target.value)} style={{ padding: '9px 12px', borderRadius: '10px' }}>
                      <option value="prazeres">🎉 Prazeres (Sem Culpa)</option>
                      <option value="conforto">⭐ Conforto (Qualidade de Vida)</option>
                      <option value="conhecimento">📚 Conhecimento</option>
                      <option value="custos_fixos">🏠 Custos Fixos</option>
                      <option value="metas">🎯 Metas</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={() => { setPenseFormOpen(false); setNomeDesejo(''); setPrecoDesejo(''); }} style={{ flex: 1, padding: '12px', borderRadius: 10, fontSize: 13, fontWeight: 500, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                    Cancelar
                  </button>
                  <button type="submit" style={{ flex: 1, padding: '12px', borderRadius: 10, fontSize: 13, fontWeight: 600, background: 'var(--primary)', color: '#fff', border: 'none' }}>
                    Iniciar Reflexão de 10 dias
                  </button>
                </div>
              </form>
            )}

            {/* Listagem de itens ou estado vazio */}
            {impulseItems.length === 0 && !penseFormOpen ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', background: 'var(--bg-card)', borderRadius: 16, border: '1px dashed var(--border)' }}>
                <span style={{ fontSize: 32, display: 'block', marginBottom: 12 }}>🧘‍♂️</span>
                <p style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Mente focada e orçamento seguro!</p>
                <p style={{ margin: '0 0 20px', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  Nenhum item sob reflexão no momento. Sempre que surgir aquele desejo impulsivo de compras não planejadas, adicione-o aqui para se dar tempo de refletir antes de gastar!
                </p>
                <button onClick={() => setPenseFormOpen(true)} style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 12, fontSize: 13, fontWeight: 600 }}>
                  Adicionar desejo para reflexão
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {impulseItems.map(item => {
                  const renda = config?.rendaMensal || 0;
                  const valorDiaTrabalho = renda > 0 ? (renda / 22) : 0;
                  const diasDeTrabalho = valorDiaTrabalho > 0 ? (item.preco / valorDiaTrabalho) : 0;

                  const budgetPcts = config?.budgetPcts || DEFAULT_BUDGET_PCTS;
                  const pctCategoria = budgetPcts[item.categoria] || PERCENTUAL_CATEGORIES[item.categoria]?.defaultPct || 10;
                  const budgetMensalCategoria = renda > 0 ? (renda * pctCategoria) / 100 : 0;
                  const pctDoOrcamento = budgetMensalCategoria > 0 ? (item.preco / budgetMensalCategoria) * 100 : 0;

                  const remainingText = getRemainingTime(item.createdAt);
                  const isExpired = remainingText === 'Concluído';

                  const catObj = PERCENTUAL_CATEGORIES[item.categoria] || {};

                  return (
                    <div key={item.id} style={{
                      background: 'var(--bg-card)', border: '1px solid var(--border)',
                      borderRadius: 16, padding: '16px', position: 'relative',
                      display: 'flex', flexDirection: 'column', gap: 12
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{
                          fontSize: 10, padding: '3px 8px', borderRadius: 20,
                          background: catObj.bg || 'rgba(255,255,255,0.05)',
                          color: catObj.color || 'var(--text-secondary)',
                          fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4
                        }}>
                          {catObj.icon} {catObj.label}
                        </span>
                        <span style={{
                          fontSize: 10, fontWeight: 700,
                          color: isExpired ? '#10b981' : 'var(--saida)',
                          background: isExpired ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                          padding: '3px 8px', borderRadius: 8
                        }}>
                          ⏳ {isExpired ? 'Reflexão Concluída' : `Refletir por: ${remainingText}`}
                        </span>
                      </div>

                      <div>
                        <h3 style={{ margin: '0 0 2px', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{item.nome}</h3>
                        <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)' }}>{formatBRL(item.preco)}</span>
                      </div>

                      <div style={{
                        background: 'var(--bg-surface)', borderRadius: 12, padding: '10px',
                        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, border: '1px solid var(--border)'
                      }}>
                        <div>
                          <span style={{ fontSize: 9, color: 'var(--text-secondary)', display: 'block', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.3px', marginBottom: 2 }}>Custo em Trabalho</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
                            {renda > 0 ? `${diasDeTrabalho.toFixed(1)} dias inteiros` : 'Defina sua renda'}
                          </span>
                        </div>
                        <div>
                          <span style={{ fontSize: 9, color: 'var(--text-secondary)', display: 'block', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.3px', marginBottom: 2 }}>% do Orçamento</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
                            {renda > 0 ? `${pctDoOrcamento.toFixed(1)}% da categoria` : 'Defina sua renda'}
                          </span>
                        </div>
                      </div>

                      <div style={{
                        fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.4,
                        background: 'rgba(59, 130, 246, 0.05)', border: '1px dashed rgba(59, 130, 246, 0.3)',
                        borderRadius: 10, padding: '10px'
                      }}>
                        🔍 <strong>Dica de Economia:</strong> Antes de decidir, faça uma busca detalhada na internet! Sites de comparação de preços e cupons podem poupar até 20% do valor do produto.
                      </div>

                      <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                        <button
                          type="button"
                          onClick={() => handleDesistir(item)}
                          style={{
                            flex: 1, padding: '10px', borderRadius: 10, border: 'none',
                            background: 'linear-gradient(135deg, #10b981, #059669)',
                            color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                            transition: 'opacity 0.2s', boxShadow: '0 2px 8px rgba(16,185,129,0.2)'
                          }}
                        >
                          😇 Desistir da Compra
                        </button>
                        <button
                          type="button"
                          onClick={() => handleConfirmar(item)}
                          style={{
                            flex: 1, padding: '10px', borderRadius: 10,
                            border: '1px solid var(--border)',
                            background: 'var(--bg-surface)',
                            color: 'var(--text-primary)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                            transition: 'background 0.2s'
                          }}
                        >
                          🛍️ Confirmar Compra
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {confettiParticles.length > 0 && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
          pointerEvents: 'none', zIndex: 9999, overflow: 'hidden'
        }}>
          {confettiParticles.map(p => (
            <div
              key={p.id}
              style={{
                position: 'absolute',
                left: `${p.x}%`,
                top: `${p.y}%`,
                fontSize: `${20 * p.scale}px`,
                transform: `rotate(${p.angle}deg)`,
                animation: `fall ${p.duration}s linear ${p.delay}s forwards`,
              }}
            >
              {p.emoji}
            </div>
          ))}
          <style>{`
            @keyframes fall {
              0% {
                top: -10%;
                transform: translateY(0) rotate(0deg);
                opacity: 1;
              }
              100% {
                top: 110%;
                transform: translateY(100vh) rotate(720deg);
                opacity: 0;
              }
            }
          `}</style>
        </div>
      )}
    </div>
  );
}
