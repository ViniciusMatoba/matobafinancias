import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, ChevronRight, Settings, X } from 'lucide-react';
import { formatBRL, todayStr } from '../../utils/formatters';
import { expandOccurrences } from '../../utils/projectionCalc';
import { PERCENTUAL_CATEGORIES, CATEGORY_ORDER } from '../../utils/categories';

const DAY_NAMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const SOURCE_LABELS = {
  saida:       'Saída',
  diario:      'Diário',
  investimento:'Investimento',
  cartao:      'Cartão',
};

function formatDateShort(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')} ${DAY_NAMES[dt.getDay()]}`;
}

export default function BudgetSummaryCard({
  transactions, cards, rendaMensal, budgetPcts, currentMonth, onNavigateSettings,
}) {
  const [expanded,    setExpanded]    = useState(true);
  const [selectedCat, setSelectedCat] = useState(null); // id da categoria aberta

  const today = todayStr();
  const [year, mon] = currentMonth.split('-').map(Number);
  const from    = `${currentMonth}-01`;
  const lastDay = new Date(year, mon, 0).getDate();
  const to      = `${currentMonth}-${String(lastDay).padStart(2, '0')}`;

  // Mapa de id → nome do cartão para exibir no detalhe
  const cardsMap = useMemo(() => {
    const m = {};
    (cards || []).forEach(c => { m[c.id] = c.nome; });
    return m;
  }, [cards]);

  // Calcula totais E coleta os itens detalhados por categoria
  const { totals, details } = useMemo(() => {
    const totals  = Object.fromEntries(CATEGORY_ORDER.map(id => [id, 0]));
    const details = Object.fromEntries(CATEGORY_ORDER.map(id => [id, []]));

    // Expande todas as transações no período
    const occurrences = transactions.flatMap(tx =>
      expandOccurrences(tx, from, to).map(o => ({ ...o, tx }))
    );

    occurrences.forEach(occ => {
      const tx = occ.tx;
      if (tx.tipo === 'entrada') return;

      // ── Cartão com itens (inclui faturas projetadas virtuais) ───────────────
      if (tx.tipo === 'cartao' && tx.itens?.length > 0) {
        const cartaoNome = cardsMap[tx.cartaoId] || tx.descricao || 'Cartão';

        tx.itens.forEach(item => {
          const cat = item.categoria;
          if (!cat || !(cat in totals)) return;
          const valor = Number(item.valor) || 0;

          if (item.isParcelado) {
            // Em faturas virtuais (-proj-), o expandOccurrences filtra e atualiza a parcela automaticamente.
            totals[cat] += valor;
            details[cat].push({
              descricao:  item.descricao || tx.descricao || 'Item parcelado',
              date:       occ.date,
              valor,
              source:     'cartao',
              cartaoNome,
              parcela:    `${item.parcelaAtual || 1}/${item.totalParcelas}`,
              isFuture:   occ.date > today,
            });
          } else {
            // Itens avulsos não parcelados contam apenas no mês da compra (dataCompra)
            if (!item.dataCompra?.startsWith(currentMonth)) return;
            totals[cat] += valor;
            details[cat].push({
              descricao:  item.descricao || tx.descricao || 'Item',
              date:       item.dataCompra,
              valor,
              source:     'cartao',
              cartaoNome,
              isFuture:   item.dataCompra > today,
            });
          }
        });
        return;
      }

      // ── Demais tipos (saida, diario, investimento) ─────────────────────────
      const cat = tx.categoria || (tx.tipo === 'investimento' ? 'liberdade' : null);
      if (!cat || !(cat in totals)) return;

      totals[cat] += occ.valor;
      details[cat].push({
        descricao:   tx.descricao || SOURCE_LABELS[tx.tipo] || tx.tipo,
        date:        occ.date,
        valor:       occ.valor,
        source:      tx.tipo,
        frequencia:  tx.frequencia,
        isFuture:    occ.date > today,
      });
    });

    // Ordena cada categoria por data
    CATEGORY_ORDER.forEach(cat => {
      details[cat].sort((a, b) => a.date.localeCompare(b.date));
    });

    return { totals, details };
  }, [transactions, from, to, currentMonth, today, cardsMap]);

  const totalBudget = rendaMensal;
  const totalGasto  = Object.values(totals).reduce((s, v) => s + v, 0);
  const pctGeral    = totalBudget > 0 ? Math.min((totalGasto / totalBudget) * 100, 100) : 0;

  // Categoria selecionada para o modal de detalhe
  const activeCat    = selectedCat ? PERCENTUAL_CATEGORIES[selectedCat] : null;
  const activeItems  = selectedCat ? details[selectedCat] : [];
  const activeTotal  = selectedCat ? totals[selectedCat] : 0;
  const activeBudget = selectedCat
    ? (rendaMensal * (Number(budgetPcts?.[selectedCat]) || 0)) / 100
    : 0;
  const activePct = activeBudget > 0 ? Math.round((activeTotal / activeBudget) * 100) : 0;
  const activeOver   = activeTotal > activeBudget && activeBudget > 0;

  if (rendaMensal <= 0) {
    return (
      <div
        onClick={onNavigateSettings}
        style={{
          background: 'var(--bg-card)', border: '1px dashed var(--border)',
          borderRadius: 16, padding: '16px', marginBottom: 16, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 12,
        }}
      >
        <span style={{ fontSize: 24 }}>💰</span>
        <div>
          <p style={{ margin: '0 0 2px', fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
            Configurar orçamento mensal
          </p>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>
            Toque para definir sua renda e limites por categoria
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 16, padding: '14px', marginBottom: 16,
      }}>
        {/* Cabeçalho colapsável */}
        <button
          onClick={() => setExpanded(e => !e)}
          style={{
            width: '100%', background: 'none', display: 'flex',
            alignItems: 'center', justifyContent: 'space-between', padding: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 16 }}>📊</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
              Orçamento do mês
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: pctGeral > 90 ? 'var(--saida)' : 'var(--text-secondary)' }}>
              {formatBRL(totalGasto)} / {formatBRL(totalBudget)}
            </span>
            {expanded ? <ChevronUp size={16} color="var(--text-muted)" /> : <ChevronDown size={16} color="var(--text-muted)" />}
          </div>
        </button>

        {/* Barra geral */}
        <div style={{ marginTop: 10, height: 5, background: 'var(--bg-surface)', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: `${pctGeral}%`,
            background: pctGeral > 90 ? '#ef4444' : pctGeral > 70 ? '#f59e0b' : '#6366f1',
            borderRadius: 3, transition: 'width 0.5s',
          }} />
        </div>

        {/* Lista de categorias — cada uma é clicável */}
        {expanded && (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {CATEGORY_ORDER.map(id => {
              const cat    = PERCENTUAL_CATEGORIES[id];
              const pct    = Number(budgetPcts?.[id]) || 0;
              const budget = (rendaMensal * pct) / 100;
              const gasto  = totals[id] || 0;
              const uso    = budget > 0 ? Math.min((gasto / budget) * 100, 100) : 0;
              const over   = gasto > budget && budget > 0;
              const count  = details[id]?.length || 0;

              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSelectedCat(id)}
                  style={{
                    width: '100%', background: 'none', padding: '8px 4px',
                    border: 'none', cursor: 'pointer', borderRadius: 8,
                    textAlign: 'left',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
                >
                  {/* Label + valor + chevron */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 14 }}>{cat.icon}</span>
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>
                        {cat.label}
                      </span>
                      {count > 0 && (
                        <span style={{
                          fontSize: 10, color: 'var(--text-muted)',
                          background: 'var(--bg-surface)', borderRadius: 4, padding: '1px 5px',
                        }}>
                          {count}
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: over ? 'var(--saida)' : cat.color }}>
                        {formatBRL(gasto)}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>/ {formatBRL(budget)}</span>
                      <ChevronRight size={12} color="var(--text-muted)" style={{ flexShrink: 0 }} />
                    </div>
                  </div>

                  {/* Barra de progresso */}
                  <div style={{ height: 5, background: 'var(--bg-surface)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', width: `${uso}%`,
                      background: over ? '#ef4444' : cat.color,
                      borderRadius: 3, transition: 'width 0.4s',
                    }} />
                  </div>

                  {over && (
                    <p style={{ margin: '2px 0 0', fontSize: 10, color: 'var(--saida)', textAlign: 'right' }}>
                      Excedeu em {formatBRL(gasto - budget)}
                    </p>
                  )}
                </button>
              );
            })}

            <button
              onClick={onNavigateSettings}
              style={{
                marginTop: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '8px', borderRadius: 10, background: 'var(--bg-surface)',
                border: '1px solid var(--border)', fontSize: 12, color: 'var(--text-muted)',
              }}
            >
              <Settings size={12} /> Ajustar orçamento
            </button>
          </div>
        )}
      </div>

      {/* ── Modal de detalhe da categoria ─────────────────────────────────────── */}
      {selectedCat && activeCat && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setSelectedCat(null); }}
          style={{
            position: 'fixed', inset: 0, zIndex: 300,
            background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(2px)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          }}
        >
          <div style={{
            width: '100%', maxWidth: 480,
            background: 'var(--bg-card)', borderRadius: '20px 20px 0 0',
            padding: '0 0 40px',
            boxShadow: '0 -8px 40px rgba(0,0,0,0.5)',
            maxHeight: '85vh', display: 'flex', flexDirection: 'column',
          }}>
            {/* Header fixo */}
            <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                    background: activeCat.bg,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 20,
                  }}>
                    {activeCat.icon}
                  </div>
                  <div>
                    <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                      {activeCat.label}
                    </p>
                    <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>
                      {activeCat.sublabel}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedCat(null)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 6 }}
                >
                  <X size={20} />
                </button>
              </div>

              {/* Resumo do orçamento da categoria */}
              <div style={{ marginTop: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                    <span style={{ fontSize: 18, fontWeight: 700, color: activeOver ? 'var(--saida)' : activeCat.color }}>
                      {formatBRL(activeTotal)}
                    </span>
                    {' '}de {formatBRL(activeBudget)}
                  </span>
                  <span style={{
                    fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                    background: activeOver ? 'rgba(239,68,68,0.12)' : activeCat.bg,
                    color: activeOver ? 'var(--saida)' : activeCat.color,
                  }}>
                    {activePct}%
                  </span>
                </div>
                <div style={{ height: 6, background: 'var(--bg-surface)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', width: `${Math.min(activePct, 100)}%`,
                    background: activeOver ? '#ef4444' : activeCat.color,
                    borderRadius: 3, transition: 'width 0.4s',
                  }} />
                </div>
                {activeOver && (
                  <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--saida)' }}>
                    ⚠️ Excedeu em {formatBRL(activeTotal - activeBudget)}
                  </p>
                )}
              </div>
            </div>

            {/* Lista de lançamentos — scrollável */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px' }}>
              {activeItems.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px 0' }}>
                  <span style={{ fontSize: 32 }}>🎉</span>
                  <p style={{ margin: '10px 0 0', fontSize: 14, color: 'var(--text-muted)' }}>
                    Nenhum lançamento nesta categoria este mês
                  </p>
                </div>
              ) : (
                <>
                  <p style={{
                    margin: '0 0 10px', fontSize: 11, fontWeight: 600,
                    color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em',
                  }}>
                    {activeItems.length} lançamento{activeItems.length !== 1 ? 's' : ''} do mês
                  </p>

                  {activeItems.map((item, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: 'flex', alignItems: 'flex-start', gap: 12,
                        padding: '10px 0',
                        borderBottom: idx < activeItems.length - 1
                          ? '1px solid var(--border)' : 'none',
                        opacity: item.isFuture ? 0.65 : 1,
                      }}
                    >
                      {/* Ícone do tipo */}
                      <div style={{
                        width: 34, height: 34, borderRadius: 9, flexShrink: 0,
                        background: item.isFuture
                          ? 'var(--bg-surface)'
                          : activeCat.bg,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 15,
                      }}>
                        {item.source === 'cartao'
                          ? '💳'
                          : item.source === 'investimento'
                          ? '📈'
                          : item.source === 'diario'
                          ? '⚡'
                          : '💸'}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{
                          margin: 0, fontSize: 13, fontWeight: 600,
                          color: 'var(--text-primary)',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {item.descricao}
                        </p>
                        <div style={{ display: 'flex', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            {formatDateShort(item.date)}
                          </span>
                          {item.isFuture && (
                            <span style={{
                              fontSize: 10, color: 'var(--primary)',
                              background: 'rgba(99,102,241,0.1)',
                              borderRadius: 4, padding: '1px 5px', fontWeight: 600,
                            }}>
                              Previsto
                            </span>
                          )}
                          {item.cartaoNome && (
                            <span style={{ fontSize: 11, color: 'var(--cartao)', fontStyle: 'italic' }}>
                              {item.cartaoNome}
                            </span>
                          )}
                          {item.parcela && (
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                              parcela {item.parcela}
                            </span>
                          )}
                          {!item.cartaoNome && item.frequencia && item.frequencia !== 'unico' && (
                            <span style={{ fontSize: 10, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                              {item.frequencia}
                            </span>
                          )}
                        </div>
                      </div>

                      <span style={{
                        fontSize: 14, fontWeight: 700,
                        color: activeOver ? 'var(--saida)' : activeCat.color,
                        flexShrink: 0,
                      }}>
                        {formatBRL(item.valor)}
                      </span>
                    </div>
                  ))}

                  {/* Total */}
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    marginTop: 12, padding: '10px 0 0',
                    borderTop: '2px solid var(--border)',
                  }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
                      Total da categoria
                    </span>
                    <span style={{ fontSize: 15, fontWeight: 800, color: activeOver ? 'var(--saida)' : activeCat.color }}>
                      {formatBRL(activeTotal)}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
