import { useMemo } from 'react';
import { Target, TrendingDown, TrendingUp, Zap } from 'lucide-react';
import { formatBRL, todayStr } from '../../utils/formatters';
import { expandOccurrences } from '../../utils/projectionCalc';

export default function DailyBudgetCard({ transactions, meta, currentMonth, onSetMeta }) {
  const [year, mon] = currentMonth.split('-').map(Number);
  const from = `${currentMonth}-01`;
  const diasNoMes = new Date(year, mon, 0).getDate();
  const to = `${currentMonth}-${String(diasNoMes).padStart(2, '0')}`;
  const today = todayStr();
  const diaAtual = parseInt(today.slice(8, 10));
  const isCurrentMonth = today.startsWith(currentMonth);

  const { totalGasto, diasComGasto } = useMemo(() => {
    const diarioTxs = transactions.filter(tx => tx.tipo === 'diario');
    const occs = diarioTxs.flatMap(tx => expandOccurrences(tx, from, to));
    const totalGasto = occs.reduce((s, o) => s + o.valor, 0);
    const diasComGasto = new Set(occs.map(o => o.date)).size;
    return { totalGasto, diasComGasto };
  }, [transactions, from, to]);

  const diariaPrevista = meta > 0 ? meta / diasNoMes : 0;
  const diasDecorridos = isCurrentMonth ? diaAtual : diasNoMes;
  const deveriaTerGasto = diariaPrevista * diasDecorridos;
  const saldoRestante = meta - totalGasto;
  const diasRestantes = isCurrentMonth ? diasNoMes - diaAtual + 1 : 0;
  const diariaNova = diasRestantes > 0 ? saldoRestante / diasRestantes : 0;
  const percentual = meta > 0 ? Math.min((totalGasto / meta) * 100, 100) : 0;
  const estaNoPrazo = totalGasto <= deveriaTerGasto;

  if (meta === 0) {
    return (
      <div
        onClick={onSetMeta}
        style={{
          background: 'var(--bg-card)',
          border: '1px dashed var(--border)',
          borderRadius: 16, padding: '16px',
          display: 'flex', alignItems: 'center', gap: 12,
          cursor: 'pointer', marginBottom: 16,
        }}
      >
        <div style={{
          width: 40, height: 40, borderRadius: 10, flexShrink: 0,
          background: 'rgba(245,158,11,0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Target size={20} color="var(--diario)" />
        </div>
        <div>
          <p style={{ margin: '0 0 2px', fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
            Definir meta de gastos diários
          </p>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>
            Toque para configurar o orçamento mensal
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: `1px solid ${estaNoPrazo ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
      borderRadius: 16, padding: '16px', marginBottom: 16,
    }}>
      {/* Cabeçalho */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Zap size={16} color="var(--diario)" />
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Gastos Diários</span>
        </div>
        <button
          onClick={onSetMeta}
          style={{ fontSize: 11, color: 'var(--text-muted)', background: 'none', padding: '2px 6px' }}
        >
          Meta: {formatBRL(meta)}/mês
        </button>
      </div>

      {/* Barra de progresso */}
      <div style={{ marginBottom: 12 }}>
        <div style={{
          height: 8, borderRadius: 4,
          background: 'var(--bg-surface)',
          overflow: 'hidden', position: 'relative',
        }}>
          {/* Marcador de onde deveria estar */}
          {meta > 0 && isCurrentMonth && (
            <div style={{
              position: 'absolute', top: 0, bottom: 0,
              left: `${Math.min((deveriaTerGasto / meta) * 100, 100)}%`,
              width: 2, background: 'var(--text-muted)',
              borderRadius: 1, zIndex: 2,
            }} />
          )}
          {/* Barra do gasto real */}
          <div style={{
            height: '100%',
            width: `${percentual}%`,
            borderRadius: 4,
            background: estaNoPrazo
              ? 'linear-gradient(90deg, #10b981, #34d399)'
              : 'linear-gradient(90deg, #ef4444, #f87171)',
            transition: 'width 0.5s ease',
          }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
            {percentual.toFixed(0)}% usado
          </span>
          {isCurrentMonth && (
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
              ╎ dia {diaAtual} de {diasNoMes}
            </span>
          )}
        </div>
      </div>

      {/* Números principais */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ margin: '0 0 2px', fontSize: 10, color: 'var(--text-secondary)' }}>Gasto</p>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--diario)' }}>
            {formatBRL(totalGasto)}
          </p>
        </div>
        <div style={{ textAlign: 'center', borderLeft: '1px solid var(--border)', borderRight: '1px solid var(--border)' }}>
          <p style={{ margin: '0 0 2px', fontSize: 10, color: 'var(--text-secondary)' }}>Saldo restante</p>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: saldoRestante >= 0 ? 'var(--entrada)' : 'var(--saida)' }}>
            {formatBRL(Math.abs(saldoRestante))}
            {saldoRestante < 0 && <span style={{ fontSize: 10 }}> exc.</span>}
          </p>
        </div>
        <div style={{ textAlign: 'center' }}>
          <p style={{ margin: '0 0 2px', fontSize: 10, color: 'var(--text-secondary)' }}>
            {isCurrentMonth ? 'Por dia ainda' : 'Diária'}
          </p>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: diariaPrevista > 0 ? 'var(--text-primary)' : 'var(--text-muted)' }}>
            {isCurrentMonth && diasRestantes > 0 ? formatBRL(diariaNova) : formatBRL(diariaPrevista)}
          </p>
        </div>
      </div>

      {/* Status */}
      {isCurrentMonth && (
        <div style={{
          marginTop: 10, padding: '7px 10px', borderRadius: 8,
          background: estaNoPrazo ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          {estaNoPrazo
            ? <TrendingDown size={13} color="var(--entrada)" />
            : <TrendingUp size={13} color="var(--saida)" />
          }
          <span style={{ fontSize: 12, color: estaNoPrazo ? 'var(--entrada)' : 'var(--saida)', fontWeight: 500 }}>
            {estaNoPrazo
              ? `${formatBRL(deveriaTerGasto - totalGasto)} abaixo da meta — no prazo`
              : `${formatBRL(totalGasto - deveriaTerGasto)} acima do esperado para hoje`
            }
          </span>
        </div>
      )}
    </div>
  );
}
