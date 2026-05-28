import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, TrendingUp, TrendingDown, CreditCard, PiggyBank, Zap, ListFilter, Calendar } from 'lucide-react';
import { formatBRL, TYPE_CONFIG, todayStr, addDays, addMonths } from '../../utils/formatters';
import { buildDailyProjection, calcSaldo } from '../../utils/projectionCalc';

const TIPO_ICONS = {
  entrada: TrendingUp, saida: TrendingDown, diario: Zap, cartao: CreditCard, investimento: PiggyBank,
};

const DAY_NAMES_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTH_NAMES = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const MONTH_NAMES_FULL = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const FAR_PAST = '2020-01-01';

function dayName(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return DAY_NAMES_SHORT[new Date(y, m - 1, d).getDay()];
}

function formatDayNum(dateStr) {
  return dateStr.split('-')[2];
}

function formatRangeLabel(from, to) {
  if (!from || !to) return '';
  const [, mf, df] = from.split('-').map(Number);
  const [yt, mt, dt] = to.split('-').map(Number);
  if (mf === mt) return `${String(df).padStart(2,'0')} – ${String(dt).padStart(2,'0')} ${MONTH_NAMES[mf-1]} ${yt}`;
  return `${String(df).padStart(2,'0')} ${MONTH_NAMES[mf-1]} – ${String(dt).padStart(2,'0')} ${MONTH_NAMES[mt-1]} ${yt}`;
}

export default function ProjectionScreen({ transactions }) {
  const [monthOffset, setMonthOffset] = useState(0);
  const [expanded, setExpanded] = useState({});
  const [isSummaryMode, setIsSummaryMode] = useState(false);
  
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

  const from = isSummaryMode ? customFrom : fromMonth;
  const to = isSummaryMode ? customTo : toMonth;

  // Saldo acumulado antes do período
  const saldoInicial = useMemo(() => {
    if (!from) return 0;
    const dayBefore = addDays(from, -1);
    return calcSaldo(transactions, FAR_PAST, dayBefore);
  }, [transactions, from]);

  const days = useMemo(() => {
    if (!from || !to || from > to) return [];
    return buildDailyProjection(transactions, from, to, saldoInicial);
  }, [transactions, from, to, saldoInicial]);

  const toggle = (date) => setExpanded(e => ({ ...e, [date]: !e[date] }));

  const saldoFim = days.length > 0 ? days[days.length - 1].saldo : saldoInicial;
  const minSaldo = days.length > 0 ? Math.min(...days.map(d => d.saldo)) : saldoInicial;
  const maxSaldo = days.length > 0 ? Math.max(...days.map(d => d.saldo)) : saldoInicial;

  return (
    <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 90 }}>

      {/* Header fixo */}
      <div style={{
        padding: '14px 20px',
        background: 'var(--bg-primary)',
        position: 'sticky', top: 0, zIndex: 10,
        borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Projeção</h1>
          <button
            onClick={() => setIsSummaryMode(!isSummaryMode)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, background: isSummaryMode ? 'var(--primary)' : 'var(--bg-card)',
              color: isSummaryMode ? '#fff' : 'var(--primary)', padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
              border: `1px solid ${isSummaryMode ? 'transparent' : 'var(--primary)'}`
            }}
          >
            {isSummaryMode ? <Calendar size={14} /> : <ListFilter size={14} />}
            {isSummaryMode ? 'Ver por mês' : 'Resumo por período'}
          </button>
        </div>

        {isSummaryMode ? (
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>Data Início</label>
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} style={{ padding: '8px 10px', fontSize: 13, colorScheme: 'dark', width: '100%' }} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>Data Fim</label>
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} style={{ padding: '8px 10px', fontSize: 13, colorScheme: 'dark', width: '100%' }} />
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <button onClick={() => setMonthOffset(o => o - 1)} style={{ background: 'var(--bg-card)', borderRadius: 8, padding: 6, display: 'flex', color: 'var(--text-secondary)' }}>
              <ChevronLeft size={18} />
            </button>
            <div style={{ textAlign: 'center' }}>
              <p style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>
                {MONTH_NAMES_FULL[month - 1]} {year}
              </p>
              {!isAtCurrentMonth && (
                <button onClick={() => setMonthOffset(0)} style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--primary)', background: 'none', padding: 0 }}>
                  Mês atual
                </button>
              )}
            </div>
            <button onClick={() => setMonthOffset(o => o + 1)} style={{ background: 'var(--bg-card)', borderRadius: 8, padding: 6, display: 'flex', color: 'var(--text-secondary)' }}>
              <ChevronRight size={18} />
            </button>
          </div>
        )}
      </div>

      <div style={{ padding: '16px 20px 0' }}>

        {/* Resumo do período */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(99,102,241,0.12), rgba(168,85,247,0.08))',
          border: '1px solid rgba(99,102,241,0.25)',
          borderRadius: 16, padding: '14px 16px', marginBottom: 16,
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12,
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
              }}
            >
              <button
                onClick={() => hasItems && toggle(day.date)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'stretch',
                  background: 'none', padding: 0, cursor: hasItems ? 'pointer' : 'default',
                }}
              >
                {/* Esquerda: data + eventos */}
                <div style={{ flex: 1, padding: '8px 10px', textAlign: 'left' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: hasItems ? 4 : 0 }}>
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
                    <span style={{ color: 'var(--text-muted)' }}>
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
                    return (
                      <div key={i} style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '6px 0',
                        borderBottom: i < day.items.length - 1 ? '1px solid var(--border)' : 'none',
                      }}>
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
                          </p>
                          <p style={{ margin: 0, fontSize: 10, color: 'var(--text-muted)' }}>
                            {cfg.label}
                            {item.parcela ? ` · ${item.parcela}/${item.totalParcelas}x` : ''}
                            {item.tx.frequencia !== 'unico' && item.tx.frequencia !== 'parcelado' ? ' · Recorrente' : ''}
                          </p>
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 600, color: cfg.color, flexShrink: 0 }}>
                          {cfg.sign > 0 ? '+' : '-'}{formatBRL(item.valor)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        <div style={{ height: 8 }} />
      </div>
    </div>
  );
}
