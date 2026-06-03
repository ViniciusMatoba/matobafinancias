import Modal from '../shared/Modal';
import { formatBRL } from '../../utils/formatters';

const DAY_NAMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTH_NAMES = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];

function formatDay(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return { dayName: DAY_NAMES[dt.getDay()], day: String(d).padStart(2, '0'), month: MONTH_NAMES[m - 1] };
}

export default function ProximasContasModal({ open, onClose, days = [] }) {
  return (
    <Modal open={open} onClose={onClose} title="📅 Próximos 7 dias">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {days.map((day, idx) => {
          const { dayName, day: d, month } = formatDay(day.date);
          const isToday = idx === 0;
          const temMovimento = day.entradas > 0 || day.saidas > 0;

          return (
            <div key={day.date} style={{
              borderRadius: 12,
              background: isToday ? 'rgba(99,102,241,0.06)' : 'transparent',
              border: isToday ? '1px solid rgba(99,102,241,0.2)' : '1px solid transparent',
              padding: '10px 12px',
              marginBottom: 2,
            }}>
              {/* Header do dia */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: temMovimento ? 6 : 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                    background: isToday ? 'var(--primary)' : 'var(--bg-surface)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <span style={{ fontSize: 8, fontWeight: 600, color: isToday ? 'rgba(255,255,255,0.8)' : 'var(--text-muted)', lineHeight: 1 }}>
                      {dayName.toUpperCase()}
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: isToday ? '#fff' : 'var(--text-primary)', lineHeight: 1.2 }}>
                      {d}
                    </span>
                    <span style={{ fontSize: 8, color: isToday ? 'rgba(255,255,255,0.7)' : 'var(--text-muted)', lineHeight: 1 }}>
                      {month}
                    </span>
                  </div>
                  <div>
                    {!temMovimento && (
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Sem movimentos</span>
                    )}
                    {temMovimento && (
                      <div style={{ display: 'flex', gap: 10 }}>
                        {day.entradas > 0 && (
                          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--entrada)' }}>
                            +{formatBRL(day.entradas)}
                          </span>
                        )}
                        {day.saidas > 0 && (
                          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--saida)' }}>
                            -{formatBRL(day.saidas)}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                {/* Saldo acumulado */}
                <div style={{ textAlign: 'right' }}>
                  <p style={{ margin: 0, fontSize: 10, color: 'var(--text-muted)' }}>saldo</p>
                  <p style={{
                    margin: 0, fontSize: 13, fontWeight: 700,
                    color: day.saldo >= 0 ? 'var(--text-primary)' : 'var(--saida)',
                  }}>
                    {formatBRL(day.saldo)}
                  </p>
                </div>
              </div>

              {/* Itens do dia */}
              {day.items.length > 0 && (
                <div style={{ marginTop: 4, paddingLeft: 44, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {day.items.map((occ, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{
                        fontSize: 11, color: 'var(--text-secondary)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '65%',
                      }}>
                        {occ.tx?.descricao || (occ.sinal > 0 ? 'Entrada' : 'Despesa')}
                      </span>
                      <span style={{
                        fontSize: 11, fontWeight: 600, flexShrink: 0,
                        color: occ.sinal > 0 ? 'var(--entrada)' : 'var(--saida)',
                      }}>
                        {occ.sinal > 0 ? '+' : '-'}{formatBRL(occ.valor)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* Mini fluxo de caixa total */}
        <div style={{
          marginTop: 8, padding: '12px 14px', borderRadius: 12,
          background: 'var(--bg-surface)', border: '1px solid var(--border)',
          display: 'grid', gridTemplateColumns: '1fr 1fr',
          gap: 8,
        }}>
          <div>
            <p style={{ margin: 0, fontSize: 10, color: 'var(--text-muted)' }}>Total entradas</p>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--entrada)' }}>
              +{formatBRL(days.reduce((s, d) => s + d.entradas, 0))}
            </p>
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 10, color: 'var(--text-muted)' }}>Total saídas</p>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--saida)' }}>
              -{formatBRL(days.reduce((s, d) => s + d.saidas, 0))}
            </p>
          </div>
          <div style={{ gridColumn: '1 / -1', borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 4 }}>
            <p style={{ margin: 0, fontSize: 10, color: 'var(--text-muted)' }}>Saldo ao final dos 7 dias</p>
            {days.length > 0 && (
              <p style={{
                margin: 0, fontSize: 16, fontWeight: 700,
                color: days[days.length - 1].saldo >= 0 ? 'var(--entrada)' : 'var(--saida)',
              }}>
                {formatBRL(days[days.length - 1].saldo)}
              </p>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
