import { useState, useMemo } from 'react';
import { CalendarDays, ChevronRight } from 'lucide-react';
import { formatBRL, todayStr, addDays } from '../../utils/formatters';
import { buildDailyProjection, calcSaldo } from '../../utils/projectionCalc';
import ProximasContasModal from './ProximasContasModal';

const FAR_PAST = '2020-01-01';

export default function ProximasContasCard({ transactions, wallets }) {
  const [open, setOpen] = useState(false);

  const today = todayStr();
  const to7   = addDays(today, 6);

  const { days, totalSaidas, totalEntradas } = useMemo(() => {
    // Exclui lançamentos do tipo "diário" — são estimativas de fluxo,
    // não compromissos concretos. Devem aparecer apenas na tela de Projeção.
    const txConcretos = transactions.filter(t => t.tipo !== 'diario');

    const wInitials = wallets?.reduce((acc, w) => acc + (w.saldoInicial || 0), 0) || 0;
    const saldoAtual = calcSaldo(transactions, FAR_PAST, addDays(today, -1)) + wInitials;
    const days = buildDailyProjection(txConcretos, today, to7, saldoAtual);
    const totalSaidas  = days.reduce((s, d) => s + d.saidas,  0);
    const totalEntradas = days.reduce((s, d) => s + d.entradas, 0);
    return { days, totalSaidas, totalEntradas };
  }, [transactions, wallets, today, to7]);

  // Preview: os 3 maiores itens de saída dos próximos 7 dias
  const preview = useMemo(() => {
    const itens = [];
    days.forEach(day => {
      day.items.forEach(occ => {
        if (occ.sinal < 0) {
          itens.push({ date: day.date, desc: occ.tx?.descricao || 'Despesa', valor: occ.valor });
        }
      });
    });
    return itens.sort((a, b) => b.valor - a.valor).slice(0, 2);
  }, [days]);

  if (totalSaidas === 0 && totalEntradas === 0) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          width: '100%', textAlign: 'left', background: 'var(--bg-card)',
          border: '1px solid var(--border)', borderRadius: 16, padding: '14px 16px',
          cursor: 'pointer', transition: 'opacity 0.15s',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 10,
              background: 'rgba(99,102,241,0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <CalendarDays size={16} color="var(--primary)" />
            </div>
            <div>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Próximas Contas</p>
              <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>Próximos 7 dias</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--saida)' }}>
              -{formatBRL(totalSaidas)}
            </span>
            <ChevronRight size={16} color="var(--text-muted)" />
          </div>
        </div>

        {preview.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {preview.map((item, i) => {
              const [,, d] = item.date.split('-');
              const dayNames = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
              const [y, m] = item.date.split('-').map(Number);
              const dayName = dayNames[new Date(y, m - 1, Number(d)).getDay()];
              return (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }}>
                    {dayName} {d} · {item.desc}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--saida)', flexShrink: 0 }}>
                    -{formatBRL(item.valor)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </button>

      <ProximasContasModal open={open} onClose={() => setOpen(false)} days={days} />
    </>
  );
}
