import { useState, useMemo, useEffect } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { formatBRL } from '../../utils/formatters';
import { expandOccurrences } from '../../utils/projectionCalc';
import { PERCENTUAL_CATEGORIES } from '../../utils/categories';
import { TrendingUp, TrendingDown, Calendar, DollarSign, Download, ArrowLeft, Printer } from 'lucide-react';

const TABS = {
  RESUMO: 'resumo',
  CATEGORIAS: 'categorias',
  TOP_GASTOS: 'top_gastos'
};

export default function ReportsScreen({ transactions, config, onNavigate }) {
  const [activeTab, setActiveTab] = useState(TABS.RESUMO);
  const [period, setPeriod] = useState('current_month');
  
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Define as datas com base no período selecionado
  useEffect(() => {
    const d = new Date();
    const year = d.getFullYear();
    const month = d.getMonth(); // 0-indexed

    Promise.resolve().then(() => {
      if (period === 'current_month') {
        const firstDay = `${year}-${String(month + 1).padStart(2, '0')}-01`;
        const lastDay = new Date(year, month + 1, 0).getDate();
        const lastDayStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
        setFromDate(firstDay);
        setToDate(lastDayStr);
      } else if (period === 'last_month') {
        const prevMonth = month === 0 ? 11 : month - 1;
        const prevYear = month === 0 ? year - 1 : year;
        const firstDay = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-01`;
        const lastDay = new Date(prevYear, prevMonth + 1, 0).getDate();
        const lastDayStr = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
        setFromDate(firstDay);
        setToDate(lastDayStr);
      } else if (period === 'last_3_months') {
        const prev3 = new Date(year, month - 2, 1);
        const firstDay = `${prev3.getFullYear()}-${String(prev3.getMonth() + 1).padStart(2, '0')}-01`;
        const lastDay = new Date(year, month + 1, 0).getDate();
        const lastDayStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
        setFromDate(firstDay);
        setToDate(lastDayStr);
      } else if (period === 'current_year') {
        setFromDate(`${year}-01-01`);
        setToDate(`${year}-12-31`);
      }
    });
  }, [period]);

  // Ocorrências do período
  const periodOccs = useMemo(() => {
    if (!fromDate || !toDate) return [];
    return transactions.flatMap(tx =>
      expandOccurrences(tx, fromDate, toDate).map(o => ({ ...o, tx }))
    );
  }, [transactions, fromDate, toDate]);

  // Resumo Geral (Entradas vs Saídas)
  const statsGerais = useMemo(() => {
    let entradas = 0;
    let saidas = 0;

    periodOccs.forEach(o => {
      if (o.tx.tipo === 'entrada') {
        entradas += o.valor;
      } else {
        saidas += o.valor;
      }
    });

    return {
      entradas,
      saidas,
      liquido: entradas - saidas
    };
  }, [periodOccs]);

  // Distribuição de Despesas por Categoria (Divisão Percentual)
  const categoryStats = useMemo(() => {
    const stats = {};
    Object.keys(PERCENTUAL_CATEGORIES).forEach(catId => {
      stats[catId] = { id: catId, label: PERCENTUAL_CATEGORIES[catId].label, value: 0, budget: 0, color: PERCENTUAL_CATEGORIES[catId].color, icon: PERCENTUAL_CATEGORIES[catId].icon };
    });
    stats['outros'] = { id: 'outros', label: 'Outros', value: 0, budget: 0, color: '#94a3b8', icon: '❓' };

    periodOccs.forEach(o => {
      if (o.tx.tipo === 'entrada') return;

      if (o.tx.tipo === 'cartao' && o.tx.itens && o.tx.itens.length > 0) {
        o.tx.itens.forEach(item => {
          const cat = item.categoria || 'outros';
          if (!stats[cat]) stats[cat] = { id: cat, label: 'Outros', value: 0, budget: 0, color: '#94a3b8', icon: '❓' };
          stats[cat].value += Number(item.valor) || 0;
        });
      } else {
        const cat = o.tx.categoria || 'outros';
        if (!stats[cat]) stats[cat] = { id: cat, label: 'Outros', value: 0, budget: 0, color: '#94a3b8', icon: '❓' };
        stats[cat].value += o.valor;
      }
    });

    // Quantidade de meses no filtro para ratear o orçamento
    const monthsCount = (() => {
      if (!fromDate || !toDate) return 1;
      const start = new Date(fromDate);
      const end = new Date(toDate);
      const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;
      return Math.max(1, months);
    })();

    Object.keys(stats).forEach(catId => {
      if (catId === 'outros') return;
      const pct = config?.budgetPcts?.[catId] || PERCENTUAL_CATEGORIES[catId]?.defaultPct || 10;
      stats[catId].budget = ((config?.rendaMensal || 0) * pct / 100) * monthsCount;
    });

    return Object.values(stats).filter(s => s.value > 0 || s.budget > 0);
  }, [periodOccs, config, fromDate, toDate]);

  // Lista dos Top 10 maiores gastos individuais
  const topExpenses = useMemo(() => {
    const list = [];
    periodOccs.forEach(o => {
      if (o.tx.tipo === 'entrada') return;

      if (o.tx.tipo === 'cartao' && o.tx.itens && o.tx.itens.length > 0) {
        o.tx.itens.forEach(item => {
          list.push({
            descricao: item.descricao || 'Item de Cartão',
            date: item.dataCompra || o.date,
            valor: Number(item.valor) || 0,
            categoria: item.categoria || 'outros'
          });
        });
      } else {
        list.push({
          descricao: o.tx.descricao || 'Despesa',
          date: o.date,
          valor: o.valor,
          categoria: o.tx.categoria || 'outros'
        });
      }
    });

    list.sort((a, b) => b.valor - a.valor);
    return list.slice(0, 10);
  }, [periodOccs]);

  // Exportar dados do período em CSV formatado (aprimorado com ocorrências reais expandidas)
  const handleExportCSV = () => {
    let csv = '\ufeff'; // BOM para Excel abrir caracteres especiais sem corromper
    csv += 'Data,Tipo,Categoria,Descricao,Valor\n';

    periodOccs.forEach(o => {
      const typeLabel = o.tx.tipo === 'entrada' ? 'Entrada' : 'Saída';
      const catLabel = o.tx.categoria ? (PERCENTUAL_CATEGORIES[o.tx.categoria]?.label || 'Outros') : 'Sem Categoria';
      const desc = `"${(o.tx.descricao || '').replace(/"/g, '""')}"`;
      const val = o.valor.toFixed(2);
      csv += `${o.date},${typeLabel},${catLabel},${desc},${val}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `relatorio_financeiro_${fromDate}_a_${toDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const chartData = useMemo(() => {
    return categoryStats
      .filter(c => c.value > 0)
      .map(c => ({
        name: c.label,
        value: c.value,
        color: c.color
      }));
  }, [categoryStats]);

  return (
    <>
      {/* Visualização de Tela Normal */}
      <div className="no-print" style={{ flex: 1, overflowY: 'auto', paddingBottom: 90, background: 'var(--bg-primary)' }}>
        
        {/* CSS para esconder elementos não-desejados na impressão e gerenciar quebras */}
        <style>{`
          @media print {
            body {
              background: #fff !important;
              color: #000 !important;
            }
            .no-print {
              display: none !important;
            }
            .print-only {
              display: block !important;
            }
          }
        `}</style>

        {/* Cabeçalho fixo no topo */}
        <div style={{ padding: '20px 20px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button 
              onClick={() => onNavigate('home')} 
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', padding: 6, borderRadius: 8, color: 'var(--text-secondary)', display: 'flex', cursor: 'pointer' }}
            >
              <ArrowLeft size={16} />
            </button>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>Relatórios</h1>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => window.print()}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px',
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: 10, color: 'var(--text-primary)', fontSize: 12, fontWeight: 600, cursor: 'pointer'
              }}
              title="Gerar relatório impresso ou salvar em PDF A4"
            >
              <Printer size={14} /> PDF
            </button>
            <button
              onClick={handleExportCSV}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px',
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: 10, color: 'var(--text-primary)', fontSize: 12, fontWeight: 600, cursor: 'pointer'
              }}
            >
              <Download size={14} /> Planilha
            </button>
          </div>
        </div>

        {/* Seletor de Período */}
        <div style={{ padding: '16px 20px 0' }}>
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 14, padding: '14px', display: 'flex', flexDirection: 'column', gap: 12
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Calendar size={16} color="var(--primary)" />
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Período de Análise</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
              <button
                onClick={() => setPeriod('current_month')}
                style={{
                  padding: '10px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                  background: period === 'current_month' ? 'var(--primary)' : 'var(--bg-surface)',
                  border: '1px solid var(--border)', color: period === 'current_month' ? '#fff' : 'var(--text-primary)',
                  cursor: 'pointer'
                }}
              >
                Mês Atual
              </button>
              <button
                onClick={() => setPeriod('last_month')}
                style={{
                  padding: '10px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                  background: period === 'last_month' ? 'var(--primary)' : 'var(--bg-surface)',
                  border: '1px solid var(--border)', color: period === 'last_month' ? '#fff' : 'var(--text-primary)',
                  cursor: 'pointer'
                }}
              >
                Mês Anterior
              </button>
              <button
                onClick={() => setPeriod('last_3_months')}
                style={{
                  padding: '10px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                  background: period === 'last_3_months' ? 'var(--primary)' : 'var(--bg-surface)',
                  border: '1px solid var(--border)', color: period === 'last_3_months' ? '#fff' : 'var(--text-primary)',
                  cursor: 'pointer'
                }}
              >
                Últimos 3 Meses
              </button>
              <button
                onClick={() => setPeriod('current_year')}
                style={{
                  padding: '10px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                  background: period === 'current_year' ? 'var(--primary)' : 'var(--bg-surface)',
                  border: '1px solid var(--border)', color: period === 'current_year' ? '#fff' : 'var(--text-primary)',
                  cursor: 'pointer'
                }}
              >
                Ano Atual
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 4 }}>
              <div>
                <label style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>Data Início</label>
                <input
                  type="date"
                  value={fromDate}
                  onChange={e => { setPeriod('custom'); setFromDate(e.target.value); }}
                  style={{ width: '100%', padding: '8px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, colorScheme: 'dark' }}
                />
              </div>
              <div>
                <label style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>Data Fim</label>
                <input
                  type="date"
                  value={toDate}
                  onChange={e => { setPeriod('custom'); setToDate(e.target.value); }}
                  style={{ width: '100%', padding: '8px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, colorScheme: 'dark' }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Tabs Internas */}
        <div style={{ padding: '16px 20px 0', display: 'flex', gap: 6 }}>
          {Object.values(TABS).map(t => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              style={{
                flex: 1, padding: '10px', borderRadius: 10, fontSize: 12, fontWeight: 600,
                background: activeTab === t ? 'var(--bg-card)' : 'transparent',
                border: activeTab === t ? '1px solid var(--border)' : '1px solid transparent',
                color: activeTab === t ? 'var(--primary)' : 'var(--text-secondary)',
                cursor: 'pointer', transition: 'all 0.2s'
              }}
            >
              {t === TABS.RESUMO && 'Resumo'}
              {t === TABS.CATEGORIAS && 'Categorias'}
              {t === TABS.TOP_GASTOS && 'Maiores Gastos'}
            </button>
          ))}
        </div>

        {/* Conteúdo da Tab: RESUMO */}
        {activeTab === TABS.RESUMO && (
          <div style={{ padding: '16px 20px 0', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Cards de Saldo */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <div style={{ width: 24, height: 24, borderRadius: 6, background: 'rgba(16,185,129,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <TrendingUp size={14} color="#10b981" />
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Receitas</span>
                </div>
                <p style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--entrada)' }}>
                  {formatBRL(statsGerais.entradas)}
                </p>
              </div>

              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <div style={{ width: 24, height: 24, borderRadius: 6, background: 'rgba(239,68,68,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <TrendingDown size={14} color="#ef4444" />
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Despesas</span>
                </div>
                <p style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--saida)' }}>
                  {formatBRL(statsGerais.saidas)}
                </p>
              </div>
            </div>

            {/* Card de Balanço Líquido */}
            <div style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: 14, padding: '14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(99,102,241,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <DollarSign size={18} color="var(--primary)" />
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Resultado do Período</p>
                  <p style={{ margin: 0, fontSize: 10, color: 'var(--text-muted)' }}>Saldo líquido final</p>
                </div>
              </div>
              <span style={{ fontSize: 18, fontWeight: 700, color: statsGerais.liquido >= 0 ? 'var(--entrada)' : 'var(--saida)' }}>
                {formatBRL(statsGerais.liquido)}
              </span>
            </div>

            {/* Gráfico de Pizza Distribuição */}
            {chartData.length > 0 ? (
              <div style={{
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: 16, padding: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12
              }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', alignSelf: 'flex-start' }}>Distribuição dos Gastos</p>
                <div style={{ width: '100%', height: 200 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={chartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={75}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {chartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip 
                        formatter={(val) => formatBRL(Number(val))} 
                        contentStyle={{ background: 'rgba(15,23,42,0.95)', border: '1px solid var(--border)', borderRadius: 8, color: '#fff', fontSize: 11 }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                {/* Legendas customizadas */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, width: '100%', borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                  {chartData.slice(0, 6).map((c, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-secondary)' }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: c.color }} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.name}: {formatBRL(c.value)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: '30px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                Nenhum gasto registrado neste período para gerar o gráfico.
              </div>
            )}
          </div>
        )}

        {/* Conteúdo da Tab: CATEGORIAS */}
        {activeTab === TABS.CATEGORIAS && (
          <div style={{ padding: '16px 20px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ margin: '0 0 4px', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
              Comparativo de despesas reais em relação ao teto planejado do orçamento (**Divisão Percentual**):
            </p>

            {categoryStats.map(cat => {
              const pct = cat.budget > 0 ? Math.min(100, Math.round((cat.value / cat.budget) * 100)) : 0;
              const excede = cat.value > cat.budget && cat.budget > 0;
              return (
                <div key={cat.id} style={{
                  background: 'var(--bg-card)', border: '1px solid var(--border)',
                  borderRadius: 14, padding: '12px 14px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 16 }}>{cat.icon}</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{cat.label}</span>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: excede ? 'var(--saida)' : 'var(--text-secondary)' }}>
                      {pct}%
                    </span>
                  </div>

                  {/* Barra de progresso */}
                  <div style={{ width: '100%', height: 7, borderRadius: 4, background: 'var(--bg-surface)', overflow: 'hidden', marginBottom: 8 }}>
                    <div style={{
                      width: `${pct}%`, height: '100%', borderRadius: 4,
                      background: excede ? 'var(--saida)' : cat.color,
                      transition: 'width 0.4s ease-in-out'
                    }} />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)' }}>
                    <span>Gasto: <strong style={{ color: 'var(--text-primary)' }}>{formatBRL(cat.value)}</strong></span>
                    {cat.budget > 0 && (
                      <span>Teto: <strong>{formatBRL(cat.budget)}</strong></span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Conteúdo da Tab: TOP_GASTOS */}
        {activeTab === TABS.TOP_GASTOS && (
          <div style={{ padding: '16px 20px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p style={{ margin: '0 0 4px', fontSize: 12, color: 'var(--text-secondary)' }}>
              Os 10 maiores gastos individuais do período (incluindo compras parceladas e itens avulsos de cartões):
            </p>

            {topExpenses.length > 0 ? (
              topExpenses.map((exp, idx) => {
                const cat = PERCENTUAL_CATEGORIES[exp.categoria] || {};
                return (
                  <div key={idx} style={{
                    background: 'var(--bg-card)', border: '1px solid var(--border)',
                    borderRadius: 12, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10
                  }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: 8,
                      background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      <span style={{ fontSize: 14 }}>{cat.icon || '❓'}</span>
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {exp.descricao}
                      </p>
                      <p style={{ margin: 0, fontSize: 10, color: 'var(--text-muted)' }}>
                        {exp.date.slice(8, 10)}/{exp.date.slice(5, 7)} · {cat.label || 'Outros'}
                      </p>
                    </div>

                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--saida)', flexShrink: 0 }}>
                      -{formatBRL(exp.valor)}
                    </span>
                  </div>
                );
              })
            ) : (
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: '30px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                Nenhuma despesa registrada no período.
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Seção Especial de Impressão (Exclusiva do PDF / Papel A4) ──────────── */}
      <div className="print-only" style={{ display: 'none' }}>
        <style>{`
          @media print {
            body {
              background: #fff !important;
              color: #000 !important;
            }
            .print-container {
              padding: 24px;
              font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
              color: #111;
            }
            .print-header {
              border-bottom: 2px solid #222;
              padding-bottom: 12px;
              margin-bottom: 24px;
              display: flex;
              justify-content: space-between;
              align-items: flex-end;
            }
            .print-title {
              font-size: 26px;
              font-weight: 700;
              margin: 0;
              color: #1a202c;
            }
            .print-subtitle {
              font-size: 13px;
              color: #4a5568;
              margin: 3px 0 0 0;
            }
            .print-dates {
              font-size: 11px;
              color: #718096;
              margin-top: 5px;
            }
            .print-summary-grid {
              display: grid;
              grid-template-columns: repeat(3, 1fr);
              gap: 16px;
              margin-bottom: 28px;
            }
            .print-summary-card {
              border: 1px solid #cbd5e0;
              padding: 14px;
              border-radius: 8px;
              background-color: #f7fafc;
            }
            .print-summary-label {
              font-size: 10px;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              color: #4a5568;
              display: block;
              margin-bottom: 4px;
            }
            .print-summary-val {
              font-size: 18px;
              font-weight: 700;
            }
            .print-section-title {
              font-size: 15px;
              font-weight: 700;
              text-transform: uppercase;
              border-bottom: 1px solid #a0aec0;
              padding-bottom: 5px;
              margin: 28px 0 12px 0;
              page-break-after: avoid;
            }
            .print-table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 24px;
            }
            .print-table th, .print-table td {
              border: 1px solid #e2e8f0;
              padding: 8px 10px;
              text-align: left;
              font-size: 11px;
            }
            .print-table th {
              background-color: #edf2f7;
              font-weight: 600;
              color: #2d3748;
            }
            .print-table tr:nth-of-type(even) {
              background-color: #f7fafc;
            }
          }
        `}</style>
        <div className="print-container">
          <div className="print-header">
            <div>
              <h1 className="print-title">Matoba Finanças</h1>
              <p className="print-subtitle">Relatório Financeiro Consolidado</p>
              <p className="print-dates">Período de Análise: {fromDate?.split('-').reverse().join('/')} até {toDate?.split('-').reverse().join('/')}</p>
            </div>
            <div style={{ textAlign: 'right', fontSize: 10, color: '#718096' }}>
              Gerado em: {new Date().toLocaleDateString('pt-BR')} às {new Date().toLocaleTimeString('pt-BR')}
            </div>
          </div>

          {/* Grid de Resumo */}
          <div className="print-summary-grid">
            <div className="print-summary-card">
              <span className="print-summary-label">Total Receitas</span>
              <strong className="print-summary-val" style={{ color: '#2f855a' }}>{formatBRL(statsGerais.entradas)}</strong>
            </div>
            <div className="print-summary-card">
              <span className="print-summary-label">Total Despesas</span>
              <strong className="print-summary-val" style={{ color: '#c53030' }}>{formatBRL(statsGerais.saidas)}</strong>
            </div>
            <div className="print-summary-card">
              <span className="print-summary-label">Balanço Líquido</span>
              <strong className="print-summary-val" style={{ color: statsGerais.liquido >= 0 ? '#2f855a' : '#c53030' }}>{formatBRL(statsGerais.liquido)}</strong>
            </div>
          </div>

          {/* Distribuição por Categoria */}
          <h2 className="print-section-title">Distribuição por Categoria (Divisão Percentual)</h2>
          <table className="print-table">
            <thead>
              <tr>
                <th style={{ width: '40%' }}>Categoria</th>
                <th style={{ width: '15%' }}>Percentual Alocado</th>
                <th style={{ width: '20%' }}>Despesa Real</th>
                <th style={{ width: '20%' }}>Orçamento Teto</th>
                <th style={{ width: '15%' }}>Uso (%)</th>
              </tr>
            </thead>
            <tbody>
              {categoryStats.map(cat => {
                const pct = cat.budget > 0 ? Math.min(100, Math.round((cat.value / cat.budget) * 100)) : 0;
                return (
                  <tr key={cat.id}>
                    <td>{cat.icon} {cat.label}</td>
                    <td>{config?.budgetPcts?.[cat.id] || PERCENTUAL_CATEGORIES[cat.id]?.defaultPct || 10}%</td>
                    <td>{formatBRL(cat.value)}</td>
                    <td>{cat.budget > 0 ? formatBRL(cat.budget) : 'N/A'}</td>
                    <td style={{ fontWeight: 600, color: cat.value > cat.budget && cat.budget > 0 ? '#c53030' : '#2d3748' }}>{pct}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Top 10 Maiores Gastos */}
          <h2 className="print-section-title">Maiores Despesas do Período</h2>
          <table className="print-table">
            <thead>
              <tr>
                <th style={{ width: '10%' }}>#</th>
                <th style={{ width: '20%' }}>Data</th>
                <th style={{ width: '25%' }}>Categoria</th>
                <th style={{ width: '30%' }}>Descrição</th>
                <th style={{ width: '15%' }}>Valor</th>
              </tr>
            </thead>
            <tbody>
              {topExpenses.map((exp, idx) => (
                <tr key={idx}>
                  <td>{idx + 1}</td>
                  <td>{exp.date.split('-').reverse().join('/')}</td>
                  <td>{PERCENTUAL_CATEGORIES[exp.categoria]?.label || 'Outros'}</td>
                  <td>{exp.descricao}</td>
                  <td style={{ fontWeight: 600, color: '#c53030' }}>{formatBRL(exp.valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Ocorrências Expandidas Completa */}
          <h2 className="print-section-title" style={{ pageBreakBefore: 'always' }}>Extrato de Lançamentos Expandido</h2>
          <table className="print-table">
            <thead>
              <tr>
                <th style={{ width: '15%' }}>Data</th>
                <th style={{ width: '15%' }}>Fluxo</th>
                <th style={{ width: '25%' }}>Categoria</th>
                <th style={{ width: '30%' }}>Descrição</th>
                <th style={{ width: '15%' }}>Valor</th>
              </tr>
            </thead>
            <tbody>
              {periodOccs.sort((a,b) => a.date.localeCompare(b.date)).map((o, idx) => {
                const typeLabel = o.tx.tipo === 'entrada' ? 'Entrada' : 'Saída';
                const catLabel = o.tx.categoria ? (PERCENTUAL_CATEGORIES[o.tx.categoria]?.label || 'Outros') : 'Sem Categoria';
                return (
                  <tr key={idx}>
                    <td>{o.date.split('-').reverse().join('/')}</td>
                    <td style={{ fontWeight: 500, color: o.tx.tipo === 'entrada' ? '#2f855a' : '#c53030' }}>{typeLabel}</td>
                    <td>{catLabel}</td>
                    <td>{o.tx.descricao || 'Lançamento'}</td>
                    <td style={{ fontWeight: 600, color: o.tx.tipo === 'entrada' ? '#2f855a' : '#c53030' }}>
                      {o.tx.tipo === 'entrada' ? '+' : '-'}{formatBRL(o.valor)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
