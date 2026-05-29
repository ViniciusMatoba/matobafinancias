import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, TrendingUp, TrendingDown, CreditCard, PiggyBank, Zap, Pencil, Trash2, AlertCircle, Target } from 'lucide-react';
import { formatBRL, TYPE_CONFIG, todayStr, addDays } from '../../utils/formatters';
import { expandOccurrences, calcSaldo, calcularSobraSegura } from '../../utils/projectionCalc';
import { SARDINHA_CATEGORIES } from '../../utils/categories';
import BudgetSummaryCard from './BudgetSummaryCard';

const TIPO_ICONS = {
  entrada: TrendingUp, saida: TrendingDown, diario: Zap, cartao: CreditCard, investimento: PiggyBank,
};

const DAY_NAMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTH_NAMES = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];

function formatDayHeader(dateStr, isToday) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const dayName = isToday ? 'Hoje' : DAY_NAMES[dt.getDay()];
  const currentYear = new Date().getFullYear();
  const yearSuffix = y !== currentYear ? ` ${y}` : '';
  return `${dayName}, ${String(d).padStart(2, '0')} ${MONTH_NAMES[m - 1]}${yearSuffix}`;
}

const FAR_PAST = '2020-01-01';

export default function HomeScreen({ transactions, cards, wallets, config, onEdit, onDelete, onPay, onNavigate }) {
  const [dayOffset, setDayOffset] = useState(0);
  const [expandedIds, setExpandedIds] = useState(new Set());

  const toggleExpand = (id) => setExpandedIds(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const today = todayStr();
  const selectedDate = dayOffset === 0 ? today : addDays(today, dayOffset);
  const isToday = dayOffset === 0;
  const isFuture = dayOffset > 0;
  const currentMonth = selectedDate.slice(0, 7);

  // Saldo acumulado (transações + saldo inicial das carteiras)
  const saldoAcumulado = useMemo(() => {
    const globalTx = calcSaldo(transactions, FAR_PAST, selectedDate);
    const wInitials = wallets?.reduce((acc, w) => acc + (w.saldoInicial || 0), 0) || 0;
    return globalTx + wInitials;
  }, [transactions, wallets, selectedDate]);

  // Saldo individual das carteiras
  const walletsStats = useMemo(() => {
    if (!wallets?.length) return [];
    return wallets.map(w => {
      const wTx = transactions.filter(t => t.carteiraId === w.id);
      const wSaldo = (w.saldoInicial || 0) + calcSaldo(wTx, FAR_PAST, selectedDate);
      return { ...w, saldoAtual: wSaldo };
    });
  }, [wallets, transactions, selectedDate]);

  // Ocorrências apenas do dia selecionado
  const dayOccs = useMemo(() =>
    transactions.flatMap(tx =>
      expandOccurrences(tx, selectedDate, selectedDate).map(o => ({ ...o, tx }))
    ),
    [transactions, selectedDate]
  );

  // Totais do dia
  const dayTotals = useMemo(() => {
    const t = { entrada: 0, saida: 0, diario: 0, cartao: 0, investimento: 0 };
    dayOccs.forEach(o => { t[o.tx.tipo] = (t[o.tx.tipo] || 0) + o.valor; });
    return t;
  }, [dayOccs]);

  // Alertas de cartão (somente quando hoje)
  const cardAlerts = useMemo(() => {
    if (!isToday) return [];
    const weekTo = (() => { const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().slice(0, 10); })();
    return cards.filter(card => {
      const d = new Date();
      const thisMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const vencDate = `${thisMonth}-${String(card.diaVencimento).padStart(2, '0')}`;
      return vencDate >= today && vencDate <= weekTo;
    });
  }, [cards, today, isToday]);

  // Cálculo de Sobra Segura (apenas quando é "Hoje")
  const sobraSegura = useMemo(() => {
    if (!isToday) return null;
    return calcularSobraSegura(transactions, wallets, 45); // Verifica os próximos 45 dias
  }, [transactions, wallets, isToday]);

  const saldoPositivo = saldoAcumulado >= 0;
  const summaryCards = [
    { label: isFuture ? 'Previsto entrar' : 'Entradas', value: dayTotals.entrada, color: 'var(--entrada)' },
    { label: isFuture ? 'Previsto sair' : 'Saídas', value: dayTotals.saida + dayTotals.diario, color: 'var(--saida)' },
    { label: 'Cartão', value: dayTotals.cartao, color: 'var(--cartao)' },
    { label: 'Investido', value: dayTotals.investimento, color: 'var(--investimento)' },
  ].filter(i => i.value > 0);

  return (
    <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 90 }}>

      {/* Header */}
      <div style={{
        background: 'linear-gradient(160deg, #0f1f3d 0%, var(--bg-primary) 100%)',
        padding: '20px 20px 28px',
      }}>
        <p style={{ margin: '0 0 4px', fontSize: 12, color: 'var(--text-secondary)', letterSpacing: 1, textTransform: 'uppercase' }}>
          Matoba Finanças
        </p>

        {/* Navegação diária */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <button
            onClick={() => setDayOffset(o => o - 1)}
            style={{ background: 'var(--bg-card)', borderRadius: 8, padding: 6, display: 'flex', color: 'var(--text-secondary)' }}
          >
            <ChevronLeft size={18} />
          </button>

          <div style={{ textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>
              {formatDayHeader(selectedDate, isToday)}
            </p>
            {isFuture && (
              <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--primary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Projeção futura
              </p>
            )}
            {!isToday && !isFuture && (
              <button
                onClick={() => setDayOffset(0)}
                style={{ marginTop: 4, fontSize: 11, color: 'var(--primary)', background: 'none', padding: 0 }}
              >
                Voltar para hoje
              </button>
            )}
          </div>

          <button
            onClick={() => setDayOffset(o => o + 1)}
            style={{ background: 'var(--bg-card)', borderRadius: 8, padding: 6, display: 'flex', color: 'var(--text-secondary)' }}
          >
            <ChevronRight size={18} />
          </button>
        </div>

        {/* Saldo acumulado Global */}
        <div style={{ textAlign: 'center', marginBottom: walletsStats.length > 0 ? 16 : (summaryCards.length > 0 ? 24 : 0) }}>
          <p style={{ margin: '0 0 4px', fontSize: 12, color: 'var(--text-secondary)' }}>
            {isFuture ? 'Saldo projetado' : 'Saldo Global'}
          </p>
          <p style={{
            margin: 0, fontSize: 40, fontWeight: 700,
            color: saldoPositivo ? 'var(--entrada)' : 'var(--saida)',
            letterSpacing: -1,
          }}>
            {formatBRL(saldoAcumulado)}
          </p>
        </div>

        {/* Contas/Carteiras em Scroll Horizontal */}
        {walletsStats.length > 0 && (
          <div style={{ 
            display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 16, marginBottom: summaryCards.length > 0 ? 8 : 0,
            scrollbarWidth: 'none' // Firefox
          }}>
            {walletsStats.map(w => (
              <div key={w.id} style={{
                minWidth: 140, background: 'var(--bg-card)', border: `1px solid ${w.cor}40`,
                borderRadius: 14, padding: '12px 14px', flexShrink: 0,
                position: 'relative', overflow: 'hidden'
              }}>
                <div style={{ position: 'absolute', top: 0, left: 0, width: 4, height: '100%', background: w.cor }} />
                <p style={{ margin: '0 0 4px', fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{w.nome}</p>
                <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: w.saldoAtual >= 0 ? 'var(--entrada)' : 'var(--saida)' }}>
                  {formatBRL(w.saldoAtual)}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Cards de atividade do dia (só se houver movimentação) */}
        {summaryCards.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(summaryCards.length, 2)}, 1fr)`, gap: 10 }}>
            {summaryCards.map(item => (
              <div key={item.label} style={{
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: 14, padding: '12px 14px',
              }}>
                <p style={{ margin: '0 0 4px', fontSize: 11, color: 'var(--text-secondary)' }}>{item.label}</p>
                <p style={{ margin: 0, fontSize: 17, fontWeight: 600, color: item.color }}>{formatBRL(item.value)}</p>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={() => onNavigate('goals')}
          style={{
            width: '100%', marginTop: summaryCards.length > 0 ? 12 : 18,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 12, padding: '13px 14px',
            background: 'rgba(168,85,247,0.12)', border: '1px solid rgba(168,85,247,0.28)',
            borderRadius: 14, color: 'var(--text-primary)', cursor: 'pointer',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <span style={{
              width: 32, height: 32, borderRadius: 10,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(168,85,247,0.18)', color: 'var(--investimento)',
              flexShrink: 0,
            }}>
              <Target size={17} />
            </span>
            <span style={{ textAlign: 'left', minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                Metas e Caixinhas
              </span>
              <span style={{ display: 'block', fontSize: 11, color: 'var(--text-secondary)' }}>
                Acompanhe objetivos e reservas
              </span>
            </span>
          </span>
          <ChevronRight size={17} color="var(--text-muted)" />
        </button>
      </div>

      {/* Banner de Sobra Segura Inteligente */}
      {sobraSegura && sobraSegura.sobra > 0 && (
        <div style={{ padding: '16px 20px 0' }}>
          <div style={{
            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            borderRadius: 16, padding: '16px', position: 'relative', overflow: 'hidden',
            boxShadow: '0 8px 24px rgba(16,185,129,0.3)'
          }}>
            <div style={{ position: 'absolute', right: -20, top: -20, opacity: 0.1, transform: 'rotate(15deg)' }}>
              <Target size={120} color="#fff" />
            </div>
            <div style={{ position: 'relative', zIndex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 20 }}>🎉</span>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#fff' }}>Dinheiro sobrando!</h3>
              </div>
              <p style={{ margin: '0 0 14px', fontSize: 13, color: 'rgba(255,255,255,0.9)', lineHeight: 1.5 }}>
                Avaliamos suas despesas até <strong>{sobraSegura.dataVerificada.slice(8,10)}/{sobraSegura.dataVerificada.slice(5,7)}</strong> e você tem 
                <strong style={{ fontSize: 15, marginLeft: 4 }}>{formatBRL(sobraSegura.sobra)}</strong> livres. 
                <br/>Você pode guardar esse valor agora sem comprometer seu orçamento diário nem suas faturas futuras.
              </p>
              <button 
                onClick={() => onNavigate('goals')} 
                style={{ 
                  background: '#fff', color: '#059669', border: 'none', 
                  padding: '10px 16px', borderRadius: 12, fontSize: 13, fontWeight: 700,
                  display: 'flex', alignItems: 'center', gap: 6
                }}
              >
                <PiggyBank size={16} /> Guardar na Caixinha
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Alertas de cartão */}
      {cardAlerts.length > 0 && (
        <div style={{ padding: '16px 20px 0' }}>
          {cardAlerts.map(card => (
            <div key={card.id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)',
              borderRadius: 12, padding: '12px 14px', marginBottom: 8,
            }}>
              <AlertCircle size={16} color="var(--cartao)" />
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>
                  Fatura {card.nome} vence dia {card.diaVencimento}
                </p>
                {card.limite && (
                  <p style={{ margin: 0, fontSize: 11, color: 'var(--text-secondary)' }}>Limite: {formatBRL(card.limite)}</p>
                )}
              </div>
              <button onClick={() => onNavigate('settings')} style={{ fontSize: 11, color: 'var(--cartao)', background: 'none' }}>
                Ver
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Orçamento Sardinha (mensal do mês selecionado) */}
      <div style={{ padding: '16px 20px 0' }}>
        <BudgetSummaryCard
          transactions={transactions}
          rendaMensal={config?.rendaMensal || 0}
          budgetPcts={config?.budgetPcts}
          currentMonth={currentMonth}
          onNavigateSettings={() => onNavigate('settings')}
        />
      </div>



      {/* Lançamentos do dia */}
      <div style={{ padding: '0 20px 16px' }}>
        <p style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.8 }}>
          {isFuture ? 'Previsão do dia' : isToday ? 'Lançamentos de hoje' : 'Lançamentos do dia'}
        </p>

        {dayOccs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '30px 0' }}>
            <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
              {isFuture ? 'Nenhum lançamento previsto' : 'Nenhum lançamento neste dia'}
            </p>
            {isToday && (
              <button
                onClick={() => onNavigate('add')}
                style={{ marginTop: 12, padding: '10px 20px', borderRadius: 10, background: 'var(--primary)', color: '#fff', fontSize: 14, fontWeight: 500 }}
              >
                Adicionar primeiro
              </button>
            )}
          </div>
        ) : dayOccs.map((occ, idx) => {
          const Icon = TIPO_ICONS[occ.tx.tipo] || Zap;
          const cfg = TYPE_CONFIG[occ.tx.tipo];
          const hasItens = occ.tx.tipo === 'cartao' && (occ.tx.itens?.length ?? 0) > 0;
          const isExpanded = expandedIds.has(occ.tx.id);
          return (
            <div key={`${occ.tx.id}-${idx}`} style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: 12, marginBottom: 6, overflow: 'hidden',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px' }}>
                <div style={{
                  width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                  background: cfg.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Icon size={18} color={cfg.color} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {occ.tx.descricao || cfg.label}
                  </p>
                  <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>
                    {cfg.label}
                    {occ.tx.carteiraId && wallets?.find(w => w.id === occ.tx.carteiraId) ? ` · ${wallets.find(w => w.id === occ.tx.carteiraId).nome}` : ''}
                    {occ.parcela ? ` · ${occ.parcela}/${occ.totalParcelas}x` : ''}
                    {occ.tx.frequencia !== 'unico' && occ.tx.frequencia !== 'parcelado' ? ' · Recorrente' : ''}
                    {hasItens ? ` · ${occ.tx.itens.length} iten${occ.tx.itens.length !== 1 ? 's' : ''}` : ''}
                  </p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, marginLeft: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: cfg.color }}>
                      {cfg.sign > 0 ? '+' : '-'}{formatBRL(occ.valor)}
                    </p>
                    {hasItens && (
                      <button onClick={() => toggleExpand(occ.tx.id)} style={{ background: 'none', color: 'var(--text-muted)', display: 'flex', padding: 2 }}>
                        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    {/* Botão Pagar — hoje e futuro, apenas despesas */}
                    {onPay && occ.tx.tipo !== 'entrada' && selectedDate >= today && (
                      <button
                        onClick={() => onPay(occ, occ.date)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 3,
                          height: 26, padding: '0 7px', borderRadius: 7,
                          background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.35)',
                          color: '#10b981', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                        }}
                      >
                        💸 Pagar
                      </button>
                    )}
                    <button onClick={() => onEdit(occ.tx, occ.date)} style={{ background: 'none', color: 'var(--text-muted)', display: 'flex', padding: 2 }}>
                      <Pencil size={12} />
                    </button>
                    <button onClick={() => onDelete(occ.tx.id, occ.date)} style={{ background: 'none', color: 'var(--saida)', display: 'flex', padding: 2 }}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              </div>
              {hasItens && isExpanded && (
                <div style={{ borderTop: '1px solid var(--border)', background: 'rgba(59,130,246,0.05)', padding: '8px 14px 10px' }}>
                  {occ.tx.itens.map((item, i) => {
                    const itemCat = item.categoria ? SARDINHA_CATEGORIES[item.categoria] : null;
                    return (
                      <div key={i} style={{
                        display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0',
                        borderBottom: i < occ.tx.itens.length - 1 ? '1px solid var(--border)' : 'none',
                      }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ fontSize: 12, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                            {item.dataCompra && <span style={{ color: 'var(--text-muted)', fontSize: 10, marginRight: 4 }}>{item.dataCompra.slice(8, 10)}/{item.dataCompra.slice(5, 7)} ·</span>}
                            {item.descricao || 'Item'}
                            {item.isParcelado && <span style={{ color: 'var(--text-muted)', fontSize: 10, marginLeft: 4 }}>· {item.parcelaAtual}/{item.totalParcelas}x</span>}
                          </span>
                          {itemCat && (
                            <span style={{ fontSize: 10, color: itemCat.color }}>{itemCat.icon} {itemCat.label}</span>
                          )}
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--cartao)', flexShrink: 0 }}>
                          {formatBRL(Number(item.valor) || 0)}
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

    </div>
  );
}
