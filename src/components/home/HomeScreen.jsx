import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, TrendingUp, TrendingDown, CreditCard, PiggyBank, Zap, Pencil, Trash2, AlertCircle, Target, Copy, X, SlidersHorizontal, HelpCircle, Eye, EyeOff, BarChart3 } from 'lucide-react';
import { formatBRL, TYPE_CONFIG, todayStr, addDays } from '../../utils/formatters';
import { expandOccurrences, calcSaldo, calcularSobraSegura } from '../../utils/projectionCalc';
import { PERCENTUAL_CATEGORIES } from '../../utils/categories';
import BudgetSummaryCard from './BudgetSummaryCard';
import AdjustBalanceModal from './AdjustBalanceModal';
import ProximasContasCard from './ProximasContasCard';
import HelpModal from '../shared/HelpModal';

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

export default function HomeScreen({ transactions, cards, wallets, goals, config, onSaveConfig, onEdit, onClone, onDelete, onPay, onNavigate, onAdjustBalance }) {
  const [dayOffset, setDayOffset] = useState(0);
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [inv10Modal, setInv10Modal] = useState(false); // 'ask' | 'url' | false
  const [inv10UrlInput, setInv10UrlInput] = useState('');
  const [valuesVisible, setValuesVisible] = useState(
    () => localStorage.getItem('matoba:values-visible') !== 'false'
  );
  const toggleValues = () => setValuesVisible(v => {
    const next = !v;
    localStorage.setItem('matoba:values-visible', String(next));
    return next;
  });
  const fmtVal = (n) => valuesVisible ? formatBRL(n) : '•••';
  const [bannerDismissed, setBannerDismissed] = useState(
    () => localStorage.getItem('matoba:sobra-banner-dismissed') === todayStr()
  );

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

  // Total investido acumulado (todas as transações tipo 'investimento' até a data selecionada)
  const totalInvestido = useMemo(() => {
    const invTxs = transactions.filter(t => t.tipo === 'investimento');
    return invTxs.flatMap(t => expandOccurrences(t, FAR_PAST, selectedDate))
      .reduce((acc, o) => acc + o.valor, 0);
  }, [transactions, selectedDate]);

  // Saldo individual das carteiras
  const walletsStats = useMemo(() => {
    if (!wallets?.length) return [];
    return wallets.map(w => {
      const wTx = transactions.filter(t => t.carteiraId === w.id);
      const wSaldo = (w.saldoInicial || 0) + calcSaldo(wTx, FAR_PAST, selectedDate);
      return { ...w, saldoAtual: wSaldo };
    });
  }, [wallets, transactions, selectedDate]);

  // Estatísticas de limite e saldo dos cartões
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


  // Cálculo de Sobra Segura (apenas quando é "Hoje")
  const sobraSegura = useMemo(() => {
    if (!isToday) return null;
    return calcularSobraSegura(transactions, wallets, 45); // Verifica os próximos 45 dias
  }, [transactions, wallets, isToday]);



  const reserveGoal = useMemo(() => {
    if (!goals) return null;
    return goals.find(g => 
      g.nome.toLowerCase().includes('reserva de emergência') || 
      g.nome.toLowerCase().includes('reserva de emergencia')
    );
  }, [goals]);

  const reserveStats = useMemo(() => {
    const monthlyFixedCostBudget = config?.rendaMensal 
      ? (config.rendaMensal * (Number(config.budgetPcts?.['custos_fixos']) || 30)) / 100 
      : 1500;
    const metaRecomendada = monthlyFixedCostBudget * 6;

    if (!reserveGoal) {
      return {
        exists: false,
        saldo: 0,
        metaRecomendada,
        completed: false
      };
    }

    const vinculado = transactions.filter(t => t.metaId === reserveGoal.id);
    const saldo = vinculado
      .flatMap(t => expandOccurrences(t, FAR_PAST, todayStr(), { historical: true }))
      .reduce((acc, occ) => acc + occ.sinal * occ.valor, 0);

    const completed = reserveGoal.metaFinal > 0 && saldo >= reserveGoal.metaFinal;

    return {
      exists: true,
      saldo,
      metaFinal: reserveGoal.metaFinal,
      metaRecomendada,
      completed
    };
  }, [reserveGoal, transactions, config]);

  const bannerContent = useMemo(() => {
    if (!sobraSegura) return null;
    const formatSobra = formatBRL(sobraSegura.sobra);
    const dataFim = `${sobraSegura.dataVerificada.slice(8,10)}/${sobraSegura.dataVerificada.slice(5,7)}`;
    const dataMin = sobraSegura.dataMinimoSaldo;
    const dataMinFmt = dataMin ? `${dataMin.slice(8,10)}/${dataMin.slice(5,7)}` : null;
    const isTodayMin = dataMin === today;
    const minLabel = isTodayMin
      ? `📌 Menor saldo projetado: ${formatBRL(sobraSegura.minimoSaldo)} (hoje — sem despesas fixas previstas no período)`
      : `📌 Menor saldo projetado: ${formatBRL(sobraSegura.minimoSaldo)} em ${dataMinFmt}`;

    if (!reserveStats.completed) {
      if (!reserveStats.exists) {
        return {
          title: 'Reserva de Emergência Recomendada!',
          desc: `Identificamos uma sobra projetada segura de ${formatSobra} nos próximos 45 dias (até ${dataFim}) — já considerando R$ 500 de gordura no caixa. Vimos que você ainda não criou uma caixinha de "Reserva de Emergência". Recomendamos criar uma com meta recomendada de ${formatBRL(reserveStats.metaRecomendada)} (6 meses de custos fixos) e priorizar este saldo nela!`,
          minLabel,
          buttonText: 'Criar Reserva de Emergência',
          bg: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
          shadow: 'rgba(245,158,11,0.3)',
          color: '#f59e0b',
        };
      } else {
        const falta = formatBRL(reserveStats.metaFinal - reserveStats.saldo);
        return {
          title: 'Acelere sua Reserva de Emergência!',
          desc: `Identificamos uma sobra projetada segura de ${formatSobra} nos próximos 45 dias (até ${dataFim}) — já considerando R$ 500 de gordura no caixa. Recomendamos priorizar a conclusão da sua caixinha "Reserva de Emergência" (atualmente com ${formatBRL(reserveStats.saldo)} de ${formatBRL(reserveStats.metaFinal)}). Falta apenas ${falta} para garantir sua tranquilidade financeira!`,
          minLabel,
          buttonText: 'Aportar na Reserva',
          bg: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
          shadow: 'rgba(59,130,246,0.3)',
          color: '#3b82f6',
        };
      }
    }

    return {
      title: 'Dinheiro sobrando de forma segura! 🎉',
      desc: `Parabéns! Sua Reserva de Emergência está concluída. Projetamos suas despesas até ${dataFim} e você tem ${formatSobra} livres e seguros — já considerando R$ 500 de gordura no caixa. Você pode guardar esse valor agora para acelerar suas outras metas de investimento sem comprometer seu orçamento!`,
      minLabel,
      buttonText: 'Aportar nas Caixinhas',
      bg: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
      shadow: 'rgba(16,185,129,0.3)',
      color: '#059669',
    };
  }, [sobraSegura, reserveStats, today]);

  const isOccConferido = (occ) => {
    const tx = occ.tx;
    if (!tx) return false;
    if (!tx.frequencia || tx.frequencia === 'unico' || tx.frequencia === 'parcelado') {
      return !!tx.conferido;
    }
    return !!tx.conferidos?.includes(occ.date);
  };

  const saldoPositivo = saldoAcumulado >= 0;
  const summaryCards = [
    { label: isFuture ? 'Previsto entrar' : 'Entradas', value: dayTotals.entrada, color: 'var(--entrada)' },
    { label: isFuture ? 'Previsto sair' : 'Saídas', value: dayTotals.saida + dayTotals.diario, color: 'var(--saida)' },
    { label: 'Cartão', value: dayTotals.cartao, color: 'var(--cartao)' },
    { label: 'Investido', value: dayTotals.investimento, color: 'var(--investimento)' },
  ].filter(i => i.value > 0);

  return (
    <>
    <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 90 }}>

      {/* Header */}
      <div style={{
        background: 'linear-gradient(160deg, #0f1f3d 0%, var(--bg-primary) 100%)',
        padding: '20px 20px 28px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)', letterSpacing: 1, textTransform: 'uppercase' }}>
            Matoba Finanças
          </p>
          <button onClick={() => setHelpOpen(true)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', padding: 4 }} title="Ajuda">
            <HelpCircle size={17} />
          </button>
        </div>

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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            <button onClick={toggleValues} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', padding: 4, flexShrink: 0 }} title={valuesVisible ? 'Ocultar valores' : 'Exibir valores'}>
              {valuesVisible ? <Eye size={20} /> : <EyeOff size={20} />}
            </button>
            <p style={{
              margin: 0, fontSize: 40, fontWeight: 700,
              color: saldoPositivo ? 'var(--entrada)' : 'var(--saida)',
              letterSpacing: -1,
            }}>
              {fmtVal(saldoAcumulado)}
            </p>
            {/* Botão ajustar saldo — apenas no dia de hoje */}
            {isToday && onAdjustBalance && (
              <button
                onClick={() => setAdjustOpen(true)}
                title="Ajustar saldo global"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 32, height: 32, borderRadius: 9,
                  background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)',
                  color: 'var(--primary, #6366f1)', cursor: 'pointer', flexShrink: 0,
                  transition: 'background 0.2s',
                }}
              >
                <SlidersHorizontal size={15} />
              </button>
            )}
          </div>
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
                  {fmtVal(w.saldoAtual)}
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
                <p style={{ margin: 0, fontSize: 17, fontWeight: 600, color: item.color }}>{fmtVal(item.value)}</p>
              </div>
            ))}
          </div>
        )}


        {/* Card: Total Investido */}
        {totalInvestido > 0 && (
          <button
            type="button"
            onClick={() => {
              if (config?.investidor10Url?.trim()) {
                window.open(config.investidor10Url.trim(), '_blank');
              } else {
                setInv10Modal('ask');
              }
            }}
            style={{
              marginTop: 12, width: '100%',
              background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.22)',
              borderRadius: 14, padding: '12px 14px',
              display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
            }}
          >
            <div style={{
              width: 38, height: 38, borderRadius: 10, flexShrink: 0,
              background: 'rgba(168,85,247,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <PiggyBank size={18} color="var(--investimento)" />
            </div>
            <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
              <p style={{ margin: 0, fontSize: 11, color: 'var(--text-secondary)', marginBottom: 2 }}>
                Total Investido {config?.investidor10Url ? '· Investidor 10' : ''}
              </p>
              <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--investimento)' }}>
                {fmtVal(totalInvestido)}
              </p>
            </div>
            <ChevronRight size={16} color="var(--text-muted)" style={{ flexShrink: 0 }} />
          </button>
        )}

        <button
          onClick={() => onNavigate('goals')}
          style={{
            width: '100%', marginTop: totalInvestido > 0 ? 12 : (summaryCards.length > 0 ? 12 : 18),
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

        <button
          onClick={() => onNavigate('reports')}
          style={{
            width: '100%', marginTop: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 12, padding: '13px 14px',
            background: 'rgba(99,102,241,0.10)', border: '1px solid rgba(99,102,241,0.24)',
            borderRadius: 14, color: 'var(--text-primary)', cursor: 'pointer',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <span style={{
              width: 32, height: 32, borderRadius: 10,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(99,102,241,0.16)', color: 'var(--primary)',
              flexShrink: 0,
            }}>
              <BarChart3 size={17} />
            </span>
            <span style={{ textAlign: 'left', minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                Painel
              </span>
              <span style={{ display: 'block', fontSize: 11, color: 'var(--text-secondary)' }}>
                Relatórios e análise de gastos
              </span>
            </span>
          </span>
          <ChevronRight size={17} color="var(--text-muted)" />
        </button>
      </div>

      {/* Banner de Sobra Segura Inteligente com Reserva de Emergência */}
      {sobraSegura && sobraSegura.sobra > 0 && bannerContent && !bannerDismissed && (
        <div style={{ padding: '16px 20px 0' }}>
          <div style={{
            background: bannerContent.bg,
            borderRadius: 16, padding: '16px', position: 'relative', overflow: 'hidden',
            boxShadow: `0 8px 24px ${bannerContent.shadow}`,
            transition: 'all 0.3s ease-in-out'
          }}>
            {/* Botão de Fechar */}
            <button
              onClick={() => {
                localStorage.setItem('matoba:sobra-banner-dismissed', today);
                setBannerDismissed(true);
              }}
              style={{
                position: 'absolute', top: 12, right: 12,
                background: 'none', border: 'none', color: 'rgba(255,255,255,0.72)',
                cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
                zIndex: 10
              }}
            >
              <X size={16} />
            </button>

            <div style={{ position: 'absolute', right: -20, top: -20, opacity: 0.1, transform: 'rotate(15deg)' }}>
              <Target size={120} color="#fff" />
            </div>
            <div style={{ position: 'relative', zIndex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 20 }}>🎉</span>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#fff' }}>{bannerContent.title}</h3>
              </div>
              <p style={{ margin: '0 0 8px', fontSize: 13, color: 'rgba(255,255,255,0.95)', lineHeight: 1.5 }}>
                {bannerContent.desc}
              </p>
              {bannerContent.minLabel && (
                <p style={{ margin: '0 0 10px', fontSize: 11, color: 'rgba(255,255,255,0.88)', background: 'rgba(0,0,0,0.15)', borderRadius: 8, padding: '6px 10px' }}>
                  {bannerContent.minLabel}
                </p>
              )}
              <p style={{ margin: '0 0 16px', fontSize: 11, color: 'rgba(255,255,255,0.8)', fontStyle: 'italic', borderTop: '1px dashed rgba(255,255,255,0.3)', paddingTop: 8 }}>
                ⚠️ <strong>Ação real no banco:</strong> Este controle no aplicativo é apenas virtual. Para garantir sua meta, abra o aplicativo do seu banco real e deposite este valor de verdade!
              </p>
              <button 
                onClick={() => onNavigate('goals')} 
                style={{ 
                  background: '#fff', color: bannerContent.color, border: 'none', 
                  padding: '10px 16px', borderRadius: 12, fontSize: 13, fontWeight: 700,
                  display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                }}
              >
                <PiggyBank size={16} /> {bannerContent.buttonText}
              </button>
            </div>
          </div>
        </div>
      )}




      {/* Card de Próximas Contas — fluxo dos próximos 7 dias */}
      <div style={{ padding: '16px 20px 0' }}>
        <ProximasContasCard transactions={transactions} wallets={wallets} />
      </div>

      {/* Orçamento por Divisão Percentual — sempre exibe o mês corrente,
           independente do dia selecionado na navegação diária */}
      <div style={{ padding: '16px 20px 0' }}>
        <BudgetSummaryCard
          transactions={transactions}
          cards={cards}
          rendaMensal={config?.rendaMensal || 0}
          budgetPcts={config?.budgetPcts}
          currentMonth={today.slice(0, 7)}
          onNavigateSettings={() => onNavigate('settings')}
          hideValues={!valuesVisible}
        />
      </div>





      {/* Modal de Ajuste de Saldo */}
      {adjustOpen && (
        <AdjustBalanceModal
          saldoAtual={saldoAcumulado}
          onConfirm={(diff, justificativa) => {
            setAdjustOpen(false);
            onAdjustBalance(diff, justificativa);
          }}
          onAddSaida={() => onNavigate('add')}
          onClose={() => setAdjustOpen(false)}
        />
      )}

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
                      {cfg.sign > 0 ? '+' : '-'}{fmtVal(occ.valor)}
                    </p>
                    {hasItens && (
                      <button onClick={() => toggleExpand(occ.tx.id)} style={{ background: 'none', color: 'var(--text-muted)', display: 'flex', padding: 2 }}>
                        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    {/* Botão Pagar — hoje e futuro, apenas despesas não pagas */}
                    {onPay && occ.tx.tipo !== 'entrada' && selectedDate >= today && !isOccConferido(occ) && (
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
                    {isOccConferido(occ) && (
                      <span
                        style={{
                          display: 'flex', alignItems: 'center', gap: 3,
                          height: 26, padding: '0 8px', borderRadius: 7,
                          background: 'rgba(16,185,129,0.1)',
                          color: '#10b981', fontSize: 11, fontWeight: 700,
                        }}
                      >
                        ✓ Pago
                      </span>
                    )}
                    {onClone && (
                      <button onClick={() => onClone(occ.tx)} title="Repetir lançamento" style={{ background: 'none', color: 'var(--text-muted)', display: 'flex', padding: 2, cursor: 'pointer' }}>
                        <Copy size={12} />
                      </button>
                    )}
                    <button onClick={() => onEdit(occ.tx, occ.date)} style={{ background: 'none', color: 'var(--text-muted)', display: 'flex', padding: 2, cursor: 'pointer' }}>
                      <Pencil size={12} />
                    </button>
                    <button onClick={() => onDelete(occ.tx.id, occ.date)} style={{ background: 'none', color: 'var(--saida)', display: 'flex', padding: 2, cursor: 'pointer' }}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              </div>
              {hasItens && isExpanded && (
                <div style={{ borderTop: '1px solid var(--border)', background: 'rgba(59,130,246,0.05)', padding: '8px 14px 10px' }}>
                  {occ.tx.itens.map((item, i) => {
                    const itemCat = item.categoria ? PERCENTUAL_CATEGORIES[item.categoria] : null;
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
                          {fmtVal(Number(item.valor) || 0)}
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
      <HelpModal screen="home" open={helpOpen} onClose={() => setHelpOpen(false)} />

      {/* Modal Investidor 10 */}
      {inv10Modal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          zIndex: 1000, padding: '0 0 0 0',
        }} onClick={() => setInv10Modal(false)}>
          <div
            style={{
              background: 'var(--bg-card)', borderRadius: '20px 20px 0 0',
              padding: '24px 20px 32px', width: '100%', maxWidth: 480,
            }}
            onClick={e => e.stopPropagation()}
          >
            {inv10Modal === 'ask' && (
              <>
                <div style={{ textAlign: 'center', marginBottom: 20 }}>
                  <div style={{
                    width: 52, height: 52, borderRadius: 16, margin: '0 auto 12px',
                    background: 'rgba(168,85,247,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <PiggyBank size={26} color="var(--investimento)" />
                  </div>
                  <p style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>
                    Investidor 10
                  </p>
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    Você já tem uma carteira cadastrada no Investidor 10?
                  </p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <button
                    type="button"
                    onClick={() => { setInv10UrlInput(config?.investidor10Url || ''); setInv10Modal('url'); }}
                    style={{
                      padding: '13px', borderRadius: 12, fontSize: 14, fontWeight: 600,
                      background: 'rgba(168,85,247,0.12)', border: '1px solid rgba(168,85,247,0.3)',
                      color: 'var(--investimento)', cursor: 'pointer',
                    }}
                  >
                    Sim, tenho carteira
                  </button>
                  <button
                    type="button"
                    onClick={() => { window.open('https://investidor10.com.br', '_blank'); setInv10Modal(false); }}
                    style={{
                      padding: '13px', borderRadius: 12, fontSize: 14, fontWeight: 600,
                      background: 'var(--bg-surface)', border: '1px solid var(--border)',
                      color: 'var(--text-secondary)', cursor: 'pointer',
                    }}
                  >
                    Não, quero conhecer
                  </button>
                </div>
              </>
            )}

            {inv10Modal === 'url' && (
              <>
                <div style={{ textAlign: 'center', marginBottom: 20 }}>
                  <p style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>
                    Cole o link da sua carteira
                  </p>
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    Acesse o Investidor 10, abra sua carteira e copie a URL da página.
                  </p>
                </div>
                <input
                  type="url"
                  autoFocus
                  placeholder="https://investidor10.com.br/carteira/..."
                  value={inv10UrlInput}
                  onChange={e => setInv10UrlInput(e.target.value)}
                  style={{
                    width: '100%', padding: '12px', borderRadius: 12, marginBottom: 12,
                    background: 'var(--bg-surface)', border: '1px solid var(--border)',
                    color: 'var(--text-primary)', fontSize: 14, boxSizing: 'border-box',
                  }}
                />
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    type="button"
                    onClick={() => setInv10Modal('ask')}
                    style={{
                      flex: 1, padding: '13px', borderRadius: 12, fontSize: 14, fontWeight: 600,
                      background: 'var(--bg-surface)', border: '1px solid var(--border)',
                      color: 'var(--text-secondary)', cursor: 'pointer',
                    }}
                  >
                    Voltar
                  </button>
                  <button
                    type="button"
                    disabled={!inv10UrlInput.trim()}
                    onClick={() => {
                      const url = inv10UrlInput.trim();
                      if (onSaveConfig) onSaveConfig({ investidor10Url: url });
                      window.open(url, '_blank');
                      setInv10Modal(false);
                    }}
                    style={{
                      flex: 2, padding: '13px', borderRadius: 12, fontSize: 14, fontWeight: 700,
                      background: inv10UrlInput.trim() ? 'var(--investimento)' : 'var(--bg-surface)',
                      border: 'none', color: inv10UrlInput.trim() ? '#fff' : 'var(--text-muted)',
                      cursor: inv10UrlInput.trim() ? 'pointer' : 'not-allowed',
                    }}
                  >
                    Salvar e Abrir
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
