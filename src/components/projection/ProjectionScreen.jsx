import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, TrendingUp, TrendingDown, CreditCard, PiggyBank, Zap, ListFilter, Pencil, Trash2, BarChart2, Copy, List, HelpCircle } from 'lucide-react';
import HelpModal from '../shared/HelpModal';
import TransactionsScreen from '../transactions/TransactionsScreen';
import { formatBRL, TYPE_CONFIG, todayStr, addDays } from '../../utils/formatters';
import { buildDailyProjection, calcSaldo, expandOccurrences } from '../../utils/projectionCalc';
import { PERCENTUAL_CATEGORIES } from '../../utils/categories';
import ProjectionCharts from './ProjectionCharts';

const TIPO_ICONS = {
  entrada: TrendingUp, saida: TrendingDown, diario: Zap, cartao: CreditCard, investimento: PiggyBank,
};

const DAY_NAMES_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTH_NAMES_FULL = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const FAR_PAST = '2020-01-01';

function dayName(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return DAY_NAMES_SHORT[new Date(y, m - 1, d).getDay()];
}

function formatDayNum(dateStr) {
  return dateStr.split('-')[2];
}

export default function ProjectionScreen({ transactions, wallets, cards = [], onEdit, onClone, onDelete, onPay, onUpdate }) {
  const [helpOpen, setHelpOpen] = useState(false);
  const [viewTab, setViewTab] = useState('mensal'); // 'mensal' | 'resumo' | 'anual'
  const [monthOffset, setMonthOffset] = useState(0);
  const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear());
  const [expanded, setExpanded] = useState({});
  const [isChartMode, setIsChartMode] = useState(false);
  
  const today = todayStr();
  const [customFrom, setCustomFrom] = useState(today);
  const [customTo, setCustomTo] = useState(addDays(today, 29));

  // Cálculo da data a partir do mês calendário
  const baseMonthStr = today.slice(0, 7);
  const [baseY, baseM] = baseMonthStr.split('-').map(Number);
  
  const dateFromOffset = new Date(baseY, baseM - 1 + monthOffset, 1);
  const year = dateFromOffset.getFullYear();
  const month = dateFromOffset.getMonth() + 1;
  
  const fromMonth = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const toMonth = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  
  const isAtCurrentMonth = monthOffset === 0;

  const from = viewTab === 'resumo' ? customFrom : fromMonth;
  const to = viewTab === 'resumo' ? customTo : toMonth;

  // Saldo acumulado antes do período — não calcula em abas que não usam projeção diária
  const saldoInicial = useMemo(() => {
    if (viewTab === 'anual' || viewTab === 'historico') return 0;
    if (!from) return 0;
    const dayBefore = addDays(from, -1);
    return calcSaldo(transactions, FAR_PAST, dayBefore);
  }, [transactions, from, viewTab]);

  const days = useMemo(() => {
    if (viewTab === 'anual' || viewTab === 'historico' || !from || !to || from > to) return [];
    return buildDailyProjection(transactions, from, to, saldoInicial);
  }, [transactions, from, to, saldoInicial, viewTab]);

  const toggle = (date) => setExpanded(e => ({ ...e, [date]: !e[date] }));

  // Mapa de badges de fechamento/vencimento por data
  const cardBadges = useMemo(() => {
    if (!cards?.length || !days.length) return {};
    const map = {};
    days.forEach(day => {
      const [dy, dm, dd] = day.date.split('-').map(Number);
      const d = dd;
      const lastDayOfMonth = new Date(dy, dm, 0).getDate();
      const fechamentos = cards.filter(c =>
        Math.min(Number(c.diaFechamento) || Number(c.diaVencimento), lastDayOfMonth) === d
      );
      const vencimentos = cards.filter(c =>
        Math.min(Number(c.diaVencimento), lastDayOfMonth) === d
      );
      if (fechamentos.length || vencimentos.length) {
        // Para cada vencimento, usa o fechamento real como limite do ciclo:
        // (fechamento anterior, fechamento deste ciclo]
        const vencFaturas = {};
        const vencPago   = {};
        vencimentos.forEach(c => {
          const thisVenc = day.date;
          // dataInicio dos lançamentos de cartão É a data de vencimento,
          // então filtramos exatamente pelo dia do vencimento
          const cicloOccs = transactions
            .filter(t => t.tipo === 'cartao' && t.cartaoId === c.id)
            .flatMap(t => expandOccurrences(t, thisVenc, thisVenc));
          const totalCiclo = cicloOccs.reduce((sum, occ) => sum + occ.valor, 0);
          const pendente   = cicloOccs
            .filter(occ => !occ.tx.conferido)
            .reduce((sum, occ) => sum + occ.valor, 0);
          vencFaturas[c.id] = pendente;
          // Pago = houve despesas no ciclo e nenhuma pendente
          vencPago[c.id] = totalCiclo > 0 && pendente === 0;
        });
        map[day.date] = { fechamentos, vencimentos, vencFaturas, vencPago };
      }
    });
    return map;
  }, [cards, days, transactions]);

  const saldoFim = days.length > 0 ? days[days.length - 1].saldo : saldoInicial;
  const minSaldo = days.length > 0 ? Math.min(...days.map(d => d.saldo)) : saldoInicial;
  const maxSaldo = days.length > 0 ? Math.max(...days.map(d => d.saldo)) : saldoInicial;

  // ── Cálculo do Planejamento Anual ──────────────────────────────────────────
  const annualData = useMemo(() => {
    if (viewTab !== 'anual') return [];
    
    const yearStart = `${selectedYear}-01-01`;
    const yearEnd = `${selectedYear}-12-31`;
    
    // Saldo no dia anterior ao início do ano
    const prevYearEnd = `${selectedYear - 1}-12-31`;
    const startBalance = calcSaldo(transactions, FAR_PAST, prevYearEnd);
    
    // Projeta todos os dias do ano
    const yearDays = buildDailyProjection(transactions, yearStart, yearEnd, startBalance);
    
    // Agrupa por mês
    const months = [];
    let prevMonthEndBalance = startBalance;
    
    for (let m = 0; m < 12; m++) {
      const monthNum = m + 1;
      const monthPrefix = `${selectedYear}-${String(monthNum).padStart(2, '0')}`;
      const mDays = yearDays.filter(d => d.date.startsWith(monthPrefix));
      
      let entradas = 0;
      let saidas = 0;
      
      mDays.forEach(d => {
        d.items.forEach(item => {
          if (item.tx.tipo === 'entrada') {
            entradas += item.valor;
          } else {
            saidas += item.valor;
          }
        });
      });
      
      const saldoFim = mDays.length > 0 ? mDays[mDays.length - 1].saldo : prevMonthEndBalance;
      const saldoInicio = prevMonthEndBalance;
      const resultado = entradas - saidas;
      
      months.push({
        monthIndex: m,
        monthName: MONTH_NAMES_FULL[m],
        saldoInicio,
        entradas,
        saidas,
        resultado,
        saldoFim
      });
      
      prevMonthEndBalance = saldoFim;
    }
    
    return months;
  }, [transactions, selectedYear, viewTab]);

  // Totais anuais
  const annualSummary = useMemo(() => {
    if (viewTab !== 'anual' || annualData.length === 0) return null;
    const startBalance = annualData[0].saldoInicio;
    const endBalance = annualData[11].saldoFim;
    const totalEntradas = annualData.reduce((acc, cur) => acc + cur.entradas, 0);
    const totalSaidas = annualData.reduce((acc, cur) => acc + cur.saidas, 0);
    const totalResultado = totalEntradas - totalSaidas;
    return { startBalance, endBalance, totalEntradas, totalSaidas, totalResultado };
  }, [annualData, viewTab]);

  return (
    <>
    <div style={{ flex: 1, overflowY: viewTab === 'historico' ? 'hidden' : 'auto', paddingBottom: viewTab === 'historico' ? 0 : 90, display: 'flex', flexDirection: 'column' }}>

      {/* Header fixo */}
      <div style={{
        padding: '14px 20px',
        background: 'var(--bg-primary)',
        position: 'sticky', top: 0, zIndex: 10,
        borderBottom: '1px solid var(--border)',
      }}>
        {/* Título e Seletor de Visão (Segmented Control) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Projeção</h1>
              <button onClick={() => setHelpOpen(true)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', padding: 4 }} title="Ajuda" className="no-print">
                <HelpCircle size={17} />
              </button>
              {viewTab !== 'historico' && (
                <button
                  onClick={() => window.print()}
                  style={{
                    background: 'none', border: 'none', color: 'var(--text-muted)',
                    cursor: 'pointer', display: 'flex', padding: 4, marginLeft: 2
                  }}
                  title="Exportar PDF"
                  className="no-print"
                >
                  <span style={{ fontSize: 16 }}>🖨️</span>
                </button>
              )}
            </div>
            
            {/* Segmented Control de 3 opções */}
            <div style={{ display: 'flex', background: 'var(--bg-card)', padding: 3, borderRadius: 10, border: '1px solid var(--border)' }}>
              <button
                onClick={() => { setViewTab('mensal'); setIsChartMode(false); }}
                style={{
                  padding: '6px 10px', borderRadius: 8, fontSize: 10, fontWeight: 600,
                  background: viewTab === 'mensal' ? 'var(--primary)' : 'none',
                  color: viewTab === 'mensal' ? '#fff' : 'var(--text-secondary)',
                  border: 'none', cursor: 'pointer', transition: 'all 0.2s'
                }}
              >
                Mensal
              </button>
              <button
                onClick={() => { setViewTab('resumo'); setIsChartMode(false); }}
                style={{
                  padding: '6px 10px', borderRadius: 8, fontSize: 10, fontWeight: 600,
                  background: viewTab === 'resumo' ? 'var(--primary)' : 'none',
                  color: viewTab === 'resumo' ? '#fff' : 'var(--text-secondary)',
                  border: 'none', cursor: 'pointer', transition: 'all 0.2s'
                }}
              >
                Período
              </button>
              <button
                onClick={() => { setViewTab('anual'); setIsChartMode(false); }}
                style={{
                  padding: '6px 10px', borderRadius: 8, fontSize: 10, fontWeight: 600,
                  background: viewTab === 'anual' ? 'var(--primary)' : 'none',
                  color: viewTab === 'anual' ? '#fff' : 'var(--text-secondary)',
                  border: 'none', cursor: 'pointer', transition: 'all 0.2s'
                }}
              >
                Anual
              </button>
              <button
                onClick={() => { setViewTab('historico'); setIsChartMode(false); }}
                style={{
                  padding: '6px 10px', borderRadius: 8, fontSize: 10, fontWeight: 600,
                  background: viewTab === 'historico' ? 'var(--primary)' : 'none',
                  color: viewTab === 'historico' ? '#fff' : 'var(--text-secondary)',
                  border: 'none', cursor: 'pointer', transition: 'all 0.2s',
                  display: 'flex', alignItems: 'center', gap: 4,
                }}
              >
                <List size={11} />
                Histórico
              </button>
            </div>
          </div>
        </div>

        {/* Controles dinâmicos de acordo com a aba selecionada */}
        {viewTab === 'historico' && null}
        {viewTab === 'resumo' && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', animation: 'fadeIn 0.2s ease-out' }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>Data Início</label>
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} style={{ padding: '8px 10px', fontSize: 13, colorScheme: 'dark', width: '100%' }} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>Data Fim</label>
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} style={{ padding: '8px 10px', fontSize: 13, colorScheme: 'dark', width: '100%' }} />
            </div>
          </div>
        )}

        {viewTab === 'mensal' && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', animation: 'fadeIn 0.2s ease-out' }}>
            <button onClick={() => setMonthOffset(o => o - 1)} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: 6, display: 'flex', color: 'var(--text-secondary)', cursor: 'pointer' }}>
              <ChevronLeft size={18} />
            </button>
            <div style={{ textAlign: 'center' }}>
              <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                {MONTH_NAMES_FULL[month - 1]} {year}
              </p>
              {!isAtCurrentMonth && (
                <button onClick={() => setMonthOffset(0)} style={{ margin: '2px 0 0', fontSize: 10, color: 'var(--primary)', background: 'none', border: 'none', padding: 0, fontWeight: 600, cursor: 'pointer' }}>
                  Ir para mês atual
                </button>
              )}
            </div>
            <button onClick={() => setMonthOffset(o => o + 1)} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: 6, display: 'flex', color: 'var(--text-secondary)', cursor: 'pointer' }}>
              <ChevronRight size={18} />
            </button>
          </div>
        )}

        {viewTab === 'anual' && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', animation: 'fadeIn 0.2s ease-out' }}>
            <button onClick={() => setSelectedYear(y => y - 1)} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: 6, display: 'flex', color: 'var(--text-secondary)', cursor: 'pointer' }}>
              <ChevronLeft size={18} />
            </button>
            <div style={{ textAlign: 'center' }}>
              <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                Planejamento Anual · {selectedYear}
              </p>
              {selectedYear !== new Date().getFullYear() && (
                <button onClick={() => setSelectedYear(new Date().getFullYear())} style={{ margin: '2px 0 0', fontSize: 10, color: 'var(--primary)', background: 'none', border: 'none', padding: 0, fontWeight: 600, cursor: 'pointer' }}>
                  Ano Atual
                </button>
              )}
            </div>
            <button onClick={() => setSelectedYear(y => y + 1)} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: 6, display: 'flex', color: 'var(--text-secondary)', cursor: 'pointer' }}>
              <ChevronRight size={18} />
            </button>
          </div>
        )}
      </div>

      {/* Histórico — sempre montado para preservar filtros e scroll entre trocas de aba */}
      <div style={{ display: viewTab === 'historico' ? 'flex' : 'none', flex: 1, flexDirection: 'column' }}>
        <TransactionsScreen
          transactions={transactions}
          wallets={wallets}
          onEdit={onEdit}
          onClone={onClone}
          onDelete={onDelete}
          onPay={onPay}
          onUpdate={onUpdate}
        />
      </div>

      {/* Conteúdo Principal — Projeção */}
      {viewTab !== 'historico' && <div style={{ padding: '16px 20px 0' }}>

        {/* Visualização de Resumo/Mensal */}
        {viewTab !== 'anual' && (
          <>
            {/* Resumo do período */}
            <div style={{
              background: 'linear-gradient(135deg, rgba(99,102,241,0.12), rgba(168,85,247,0.08))',
              border: '1px solid rgba(99,102,241,0.25)',
              borderRadius: 16, padding: '14px 16px', marginBottom: 16,
              display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12,
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
            }}>
              <div>
                <p style={{ margin: '0 0 2px', fontSize: 11, color: 'var(--text-secondary)' }}>Saldo inicial</p>
                <p style={{ margin: 0, fontSize: 17, fontWeight: 700, color: saldoInicial >= 0 ? 'var(--entrada)' : 'var(--saida)' }}>
                  {formatBRL(saldoInicial)}
                </p>
              </div>
              <div>
                <p style={{ margin: '0 0 2px', fontSize: 11, color: 'var(--text-secondary)' }}>Saldo final</p>
                <p style={{ margin: 0, fontSize: 17, fontWeight: 700, color: saldoFim >= 0 ? 'var(--entrada)' : 'var(--saida)' }}>
                  {formatBRL(saldoFim)}
                </p>
              </div>
              <div>
                <p style={{ margin: '0 0 2px', fontSize: 11, color: 'var(--text-secondary)' }}>Mínimo projetado</p>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: minSaldo >= 0 ? 'var(--entrada)' : 'var(--saida)' }}>
                  {formatBRL(minSaldo)}
                </p>
              </div>
              <div>
                <p style={{ margin: '0 0 2px', fontSize: 11, color: 'var(--text-secondary)' }}>Máximo projetado</p>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--entrada)' }}>
                  {formatBRL(maxSaldo)}
                </p>
              </div>
            </div>

            <button
              onClick={() => setIsChartMode(!isChartMode)}
              style={{
                width: '100%', padding: '12px', borderRadius: 12, marginBottom: 16,
                background: isChartMode ? 'var(--primary)' : 'var(--bg-card)',
                color: isChartMode ? '#fff' : 'var(--primary)',
                border: `1px solid var(--primary)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                fontSize: 14, fontWeight: 600, cursor: 'pointer',
                transition: 'all 0.2s',
                boxShadow: '0 2px 8px rgba(99,102,241,0.1)'
              }}
            >
              {isChartMode ? <ListFilter size={16} /> : <BarChart2 size={16} />}
              {isChartMode ? 'Voltar para Lista' : 'Verificar Gráficos'}
            </button>

            {isChartMode ? (
              <ProjectionCharts days={days} saldoInicial={saldoInicial} />
            ) : (
              <>
                {/* Legenda */}
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6, padding: '0 4px' }}>
                  <span style={{ flex: 1, fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Dia / Movimentações
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, minWidth: 90, textAlign: 'right' }}>
                    Saldo
                  </span>
                </div>

                {/* Lista de dias */}
                {days.map(day => {
                  const isDayToday = day.date === today;
                  const isPast = day.date < today;
                  const hasItems = day.items.length > 0;
                  const isOpen = expanded[day.date];
                  const dNum = formatDayNum(day.date);
                  const dName = dayName(day.date);

                  return (
                    <div
                      key={day.date}
                      style={{
                        marginBottom: 3,
                        border: isDayToday ? '1px solid var(--primary)' : '1px solid var(--border)',
                        borderRadius: 10,
                        background: isDayToday
                          ? 'rgba(99,102,241,0.08)'
                          : isPast && !hasItems ? 'transparent'
                          : 'var(--bg-card)',
                        overflow: 'hidden',
                        opacity: isPast && !hasItems ? 0.45 : 1,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                      }}
                    >
                      <button
                        onClick={() => hasItems && toggle(day.date)}
                        style={{
                          width: '100%', display: 'flex', alignItems: 'stretch',
                          background: 'none', border: 'none', padding: 0, cursor: hasItems ? 'pointer' : 'default',
                        }}
                      >
                        {/* Esquerda: data + eventos */}
                        <div style={{ flex: 1, padding: '8px 10px', textAlign: 'left' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: (hasItems || cardBadges[day.date]) ? 4 : 0 }}>
                            <span style={{
                              fontSize: 15, fontWeight: 700,
                              color: isDayToday ? 'var(--primary)' : 'var(--text-primary)',
                            }}>
                              {dNum}
                            </span>
                            <span style={{
                              fontSize: 11, fontWeight: isDayToday ? 700 : 400,
                              color: isDayToday ? 'var(--primary)' : 'var(--text-muted)',
                              textTransform: 'uppercase',
                            }}>
                              {dName}{isDayToday ? ' · Hoje' : ''}
                            </span>
                          </div>

                          {cardBadges[day.date] && (
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: hasItems ? 4 : 0 }}>
                              {cardBadges[day.date].fechamentos.map(c => (
                                <span key={`f-${c.id}`} style={{
                                  background: 'rgba(245,158,11,0.15)', color: '#f59e0b',
                                  borderRadius: 6, padding: '2px 7px', fontSize: 10, fontWeight: 600,
                                  display: 'flex', alignItems: 'center', gap: 3,
                                }}>
                                  📅 Fecha {c.nome}
                                </span>
                              ))}
                              {cardBadges[day.date].vencimentos.map(c => {
                                const pago    = cardBadges[day.date].vencPago[c.id];
                                const valor   = cardBadges[day.date].vencFaturas[c.id];
                                return (
                                  <span key={`v-${c.id}`} style={{
                                    background: pago ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                                    color: pago ? '#10b981' : '#ef4444',
                                    borderRadius: 6, padding: '2px 7px', fontSize: 10, fontWeight: 600,
                                    display: 'flex', alignItems: 'center', gap: 3,
                                  }}>
                                    {pago
                                      ? `✓ ${c.nome} · Pago`
                                      : `💳 Vence ${c.nome}${valor > 0 ? ` · ${formatBRL(valor)}` : ''}`}
                                  </span>
                                );
                              })}
                            </div>
                          )}

                          {hasItems && !isOpen && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                              {day.items.slice(0, 2).map((item, i) => {
                                const cfg = TYPE_CONFIG[item.tx.tipo];
                                const Icon = TIPO_ICONS[item.tx.tipo] || Zap;
                                return (
                                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                    <Icon size={10} color={cfg.color} />
                                    <span style={{
                                      fontSize: 11, color: 'var(--text-secondary)',
                                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140,
                                    }}>
                                      {item.tx.descricao || cfg.label}
                                    </span>
                                    <span style={{ fontSize: 11, color: cfg.color, flexShrink: 0 }}>
                                      {cfg.sign > 0 ? '+' : '-'}{formatBRL(item.valor)}
                                    </span>
                                  </div>
                                );
                              })}
                              {day.items.length > 2 && (
                                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>+{day.items.length - 2} mais</span>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Direita: saldo */}
                        <div style={{
                          borderLeft: '1px solid var(--border)',
                          padding: '8px 10px',
                          display: 'flex', flexDirection: 'column',
                          alignItems: 'flex-end', justifyContent: 'center',
                          minWidth: 96, flexShrink: 0, gap: 2,
                        }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: day.saldo >= 0 ? 'var(--entrada)' : 'var(--saida)' }}>
                            {formatBRL(day.saldo)}
                          </span>
                          {day.saldo < 0 && (
                            <span style={{
                              fontSize: 9, fontWeight: 700, color: 'var(--saida)',
                              background: 'rgba(239,68,68,0.12)', padding: '1px 5px', borderRadius: 4,
                            }}>
                              NEG
                            </span>
                          )}
                          {hasItems && (
                            <span style={{ color: 'var(--text-muted)', display: 'flex' }}>
                              {isOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                            </span>
                          )}
                        </div>
                      </button>

                      {/* Expansão: detalhes */}
                      {isOpen && hasItems && (
                        <div style={{
                          borderTop: '1px solid var(--border)',
                          background: 'rgba(0,0,0,0.15)',
                          padding: '8px 10px 10px',
                        }}>
                          {day.items.map((item, i) => {
                            const cfg = TYPE_CONFIG[item.tx.tipo];
                            const Icon = TIPO_ICONS[item.tx.tipo] || Zap;
                            const hasSubItens = item.tx.tipo === 'cartao' && (item.tx.itens?.length ?? 0) > 0;
                            return (
                              <div key={i} style={{
                                padding: '6px 0',
                                borderBottom: i < day.items.length - 1 ? '1px solid var(--border)' : 'none',
                              }}>
                                {/* Linha principal da transação */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <div style={{
                                    width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                                    background: cfg.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  }}>
                                    <Icon size={13} color={cfg.color} />
                                  </div>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <p style={{
                                      margin: 0, fontSize: 12, fontWeight: 500, color: 'var(--text-primary)',
                                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                    }}>
                                      {item.tx.descricao || cfg.label}
                                      {hasSubItens && (
                                        <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 4 }}>
                                          · {item.tx.itens.length} iten{item.tx.itens.length !== 1 ? 's' : ''}
                                        </span>
                                      )}
                                    </p>
                                    <p style={{ margin: 0, fontSize: 10, color: 'var(--text-muted)' }}>
                                      {cfg.label}
                                      {item.parcela ? ` · ${item.parcela}/${item.totalParcelas}x` : ''}
                                      {item.tx.frequencia !== 'unico' && item.tx.frequencia !== 'parcelado' ? ' · Recorrente' : ''}
                                    </p>
                                  </div>
                                  <span style={{ fontSize: 13, fontWeight: 600, color: cfg.color, flexShrink: 0, marginRight: 8 }}>
                                    {cfg.sign > 0 ? '+' : '-'}{formatBRL(item.valor)}
                                  </span>
                                  {/* Ações: pagar / editar / excluir */}
                                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                                    {/* Botão Pagar — visível para despesas de hoje em diante */}
                                    {onPay && item.tx.tipo !== 'entrada' && day.date >= today && (
                                      <button
                                        type="button"
                                        onClick={e => { e.stopPropagation(); onPay(item, day.date); }}
                                        title="Registrar pagamento"
                                        style={{
                                          display: 'flex', alignItems: 'center', gap: 4,
                                          height: 28, padding: '0 8px', borderRadius: 7,
                                          background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.35)',
                                          color: '#10b981', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                                        }}
                                      >
                                        💸 Pagar
                                      </button>
                                    )}
                                    {onClone && (
                                      <button
                                        type="button"
                                        onClick={e => { e.stopPropagation(); onClone(item.tx); }}
                                        title="Repetir"
                                        style={{
                                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                                          width: 28, height: 28, borderRadius: 7,
                                          background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)',
                                          color: 'var(--text-secondary)', cursor: 'pointer',
                                        }}
                                      >
                                        <Copy size={12} />
                                      </button>
                                    )}
                                    {onEdit && (
                                      <button
                                        type="button"
                                        onClick={e => { e.stopPropagation(); onEdit(item.tx, item.date); }}
                                        title="Editar"
                                        style={{
                                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                                          width: 28, height: 28, borderRadius: 7,
                                          background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)',
                                          color: 'var(--primary)', cursor: 'pointer',
                                        }}
                                      >
                                        <Pencil size={12} />
                                      </button>
                                    )}
                                    {onDelete && (
                                      <button
                                        type="button"
                                        onClick={e => { e.stopPropagation(); onDelete(item.tx.id, item.date); }}
                                        title="Excluir"
                                        style={{
                                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                                          width: 28, height: 28, borderRadius: 7,
                                          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                                          color: 'var(--saida)', cursor: 'pointer',
                                        }}
                                      >
                                        <Trash2 size={12} />
                                      </button>
                                    )}
                                  </div>
                                </div>

                                {/* Sub-itens da fatura do cartão */}
                                {hasSubItens && (
                                  <div style={{ marginTop: 4, marginLeft: 36, display: 'flex', flexDirection: 'column', gap: 2 }}>
                                    {item.tx.itens.map((subItem, j) => {
                                      const subCat = subItem.categoria ? PERCENTUAL_CATEGORIES[subItem.categoria] : null;
                                      return (
                                        <div key={j} style={{
                                          display: 'flex', alignItems: 'center', gap: 6,
                                          padding: '3px 8px', borderRadius: 6,
                                          background: 'rgba(59,130,246,0.07)',
                                        }}>
                                          <div style={{ flex: 1, minWidth: 0 }}>
                                            <span style={{ fontSize: 11, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                                              {subItem.dataCompra && (
                                                <span style={{ color: 'var(--text-muted)', fontSize: 10, marginRight: 4 }}>
                                                  {subItem.dataCompra.slice(8, 10)}/{subItem.dataCompra.slice(5, 7)} ·
                                                </span>
                                              )}
                                              {subItem.descricao || 'Item'}
                                              {subItem.isParcelado && (
                                                <span style={{ color: 'var(--text-muted)', fontSize: 10, marginLeft: 4 }}>
                                                  · {subItem.parcelaAtual}/{subItem.totalParcelas}x
                                                </span>
                                              )}
                                            </span>
                                            {subCat && (
                                              <span style={{ fontSize: 10, color: subCat.color }}>{subCat.icon} {subCat.label}</span>
                                            )}
                                          </div>
                                          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--cartao)', flexShrink: 0 }}>
                                            {formatBRL(Number(subItem.valor) || 0)}
                                          </span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </>
        )}

        {/* Visualização de Planejamento Anual */}
        {viewTab === 'anual' && annualSummary && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, animation: 'fadeIn 0.25s ease-out' }}>
            
            {/* Cartão de Resumo Anual */}
            <div style={{
              background: 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(139,92,246,0.1))',
              border: '1px solid rgba(99,102,241,0.3)',
              borderRadius: 16, padding: '16px',
              display: 'flex', flexDirection: 'column', gap: 12,
              boxShadow: '0 4px 16px rgba(99,102,241,0.12)'
            }}>
              <div style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Consolidado Estimado {selectedYear}
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <p style={{ margin: '0 0 2px', fontSize: 10, color: 'var(--text-secondary)' }}>Faturamento Projetado</p>
                  <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--entrada)' }}>
                    +{formatBRL(annualSummary.totalEntradas)}
                  </p>
                </div>
                <div>
                  <p style={{ margin: '0 0 2px', fontSize: 10, color: 'var(--text-secondary)' }}>Compromissos Projetados</p>
                  <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--saida)' }}>
                    -{formatBRL(annualSummary.totalSaidas)}
                  </p>
                </div>
                <div>
                  <p style={{ margin: '0 0 2px', fontSize: 10, color: 'var(--text-secondary)' }}>Resultado Líquido do Ano</p>
                  <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: annualSummary.totalResultado >= 0 ? 'var(--entrada)' : 'var(--saida)' }}>
                    {formatBRL(annualSummary.totalResultado)}
                  </p>
                </div>
                <div>
                  <p style={{ margin: '0 0 2px', fontSize: 10, color: 'var(--text-secondary)' }}>Saldo Final Previsto</p>
                  <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: annualSummary.endBalance >= 0 ? 'var(--primary)' : 'var(--saida)' }}>
                    {formatBRL(annualSummary.endBalance)}
                  </p>
                </div>
              </div>
            </div>

            {/* Grid dos 12 meses */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
              {annualData.map(m => {
                const isPositive = m.resultado >= 0;
                return (
                  <div
                    key={m.monthIndex}
                    style={{
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border)',
                      borderRadius: 14,
                      padding: '14px 16px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                      boxShadow: '0 2px 6px rgba(0,0,0,0.06)',
                      transition: 'transform 0.2s, border-color 0.2s',
                      cursor: 'default',
                    }}
                  >
                    {/* Linha do Nome do Mês */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: 6 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                        {m.monthName}
                      </span>
                      <span style={{
                        fontSize: 10, fontWeight: 700,
                        color: isPositive ? 'var(--entrada)' : 'var(--saida)',
                        background: isPositive ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
                        padding: '2px 7px', borderRadius: 6
                      }}>
                        {isPositive ? 'SOBRA' : 'DEFICIT'}
                      </span>
                    </div>

                    {/* Dados Financeiros */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div>
                        <span style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block' }}>Receitas (+)</span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--entrada)' }}>
                          {formatBRL(m.entradas)}
                        </span>
                      </div>
                      <div>
                        <span style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block' }}>Despesas (-)</span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--saida)' }}>
                          {formatBRL(m.saidas)}
                        </span>
                      </div>
                      <div>
                        <span style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block' }}>Resultado Líquido</span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: isPositive ? 'var(--entrada)' : 'var(--saida)' }}>
                          {formatBRL(m.resultado)}
                        </span>
                      </div>
                      <div>
                        <span style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block' }}>Saldo Acumulado</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: m.saldoFim >= 0 ? 'var(--text-primary)' : 'var(--saida)' }}>
                          {formatBRL(m.saldoFim)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div style={{ height: 8 }} />
      </div>}
    </div>
    <HelpModal screen="projection" open={helpOpen} onClose={() => setHelpOpen(false)} />

    {/* ── Seção Especial de Impressão (Exclusiva do PDF / Papel A4) ──────────── */}
    <div className="print-only" style={{ display: 'none' }}>
      <style>{`
        @media print {
          /* Ocultar elementos desnecessários da interface web */
          header, footer, nav, aside, .no-print, button, select, input,
          div[style*="position: sticky"], 
          div[style*="padding: 14px 20px"],
          div[style*="background: var(--bg-primary)"] {
            display: none !important;
          }

          #root {
            max-width: none !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            height: auto !important;
            min-height: 0 !important;
            display: block !important;
          }

          /* Oculta tudo dentro do root exceto a seção de print */
          #root > div > *:not(.print-only) {
            display: none !important;
          }

          body {
            background: #fff !important;
            color: #000 !important;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
          }

          .print-only {
            display: block !important;
            padding: 20px !important;
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
            grid-template-columns: repeat(4, 1fr);
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

          .print-table tr {
            page-break-inside: avoid;
          }

          .print-neg {
            color: #c53030 !important;
          }

          .print-pos {
            color: #2f855a !important;
          }
        }
      `}</style>

      <div className="print-container">
        <div className="print-header">
          <div>
            <h1 className="print-title">Matoba Finanças</h1>
            <p className="print-subtitle">Projeção Financeira — Aba: {viewTab === 'anual' ? 'Anual' : viewTab === 'resumo' ? 'Período' : 'Mensal'}</p>
            <p className="print-dates">Período: {from.split('-').reverse().join('/')} até {to.split('-').reverse().join('/')}</p>
          </div>
          <div style={{ textAlign: 'right', fontSize: 10, color: '#718096' }}>
            Gerado em: {new Date().toLocaleDateString('pt-BR')} às {new Date().toLocaleTimeString('pt-BR')}
          </div>
        </div>

        {viewTab !== 'anual' && (
          <div className="print-summary-grid">
            <div className="print-summary-card">
              <span className="print-summary-label">Saldo Inicial</span>
              <strong className="print-summary-val" style={{ color: saldoInicial >= 0 ? '#2f855a' : '#c53030' }}>{formatBRL(saldoInicial)}</strong>
            </div>
            <div className="print-summary-card">
              <span className="print-summary-label">Saldo Final</span>
              <strong className="print-summary-val" style={{ color: saldoFim >= 0 ? '#2f855a' : '#c53030' }}>{formatBRL(saldoFim)}</strong>
            </div>
            <div className="print-summary-card">
              <span className="print-summary-label">Mínimo Projetado</span>
              <strong className="print-summary-val" style={{ color: minSaldo >= 0 ? '#2f855a' : '#c53030' }}>{formatBRL(minSaldo)}</strong>
            </div>
            <div className="print-summary-card">
              <span className="print-summary-label">Máximo Projetado</span>
              <strong className="print-summary-val" style={{ color: '#2f855a' }}>{formatBRL(maxSaldo)}</strong>
            </div>
          </div>
        )}

        {viewTab === 'anual' ? (
          <div>
            <h2 className="print-section-title">Resumo Mensal de Planejamento Anual ({selectedYear})</h2>
            <table className="print-table">
              <thead>
                <tr>
                  <th style={{ width: '25%' }}>Mês</th>
                  <th style={{ width: '18%' }}>Entradas</th>
                  <th style={{ width: '18%' }}>Saídas</th>
                  <th style={{ width: '18%' }}>Balanço</th>
                  <th style={{ width: '21%' }}>Saldo Projetado</th>
                </tr>
              </thead>
              <tbody>
                {annualData.map((m, idx) => (
                  <tr key={idx}>
                    <td><strong>{MONTH_NAMES_FULL[m.monthIndex]}</strong></td>
                    <td className="print-pos">{formatBRL(m.entradas)}</td>
                    <td className="print-neg">{formatBRL(m.saidas)}</td>
                    <td className={m.resultado >= 0 ? "print-pos" : "print-neg"}>{formatBRL(m.resultado)}</td>
                    <td><strong>{formatBRL(m.saldoFim)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div>
            <h2 className="print-section-title">Detalhamento dos Lançamentos e Projeção Diária</h2>
            <table className="print-table">
              <thead>
                <tr>
                  <th style={{ width: '15%' }}>Data</th>
                  <th style={{ width: '10%' }}>Dia</th>
                  <th style={{ width: '55%' }}>Detalhamento das Movimentações</th>
                  <th style={{ width: '20%', textAlign: 'right' }}>Saldo Final</th>
                </tr>
              </thead>
              <tbody>
                {days.map(day => {
                  const hasItems = day.items.length > 0;
                  const dNum = formatDayNum(day.date);
                  const dName = dayName(day.date);
                  const dataFmt = day.date.split('-').reverse().join('/');
                  
                  const desc = hasItems
                    ? day.items.map(it => {
                        const sign = it.tx.tipo === 'entrada' ? '+' : '-';
                        const descTx = it.tx.descricao || it.tx.tipo;
                        return `${descTx} (${sign}${formatBRL(it.valor)})`;
                      }).join(', ')
                    : 'Sem movimentações';

                  return (
                    <tr key={day.date}>
                      <td>{dataFmt}</td>
                      <td>{dName}</td>
                      <td>{desc}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatBRL(day.saldo)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
    </>
  );
}
