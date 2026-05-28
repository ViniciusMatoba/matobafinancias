import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Settings } from 'lucide-react';
import { formatBRL, todayStr } from '../../utils/formatters';
import { expandOccurrences } from '../../utils/projectionCalc';
import { SARDINHA_CATEGORIES, CATEGORY_ORDER, TIPOS_COM_CATEGORIA } from '../../utils/categories';

export default function BudgetSummaryCard({ transactions, rendaMensal, budgetPcts, currentMonth, onNavigateSettings }) {
  const [expanded, setExpanded] = useState(true);

  const [year, mon] = currentMonth.split('-').map(Number);
  const from = `${currentMonth}-01`;
  const lastDay = new Date(year, mon, 0).getDate();
  const to = `${currentMonth}-${String(lastDay).padStart(2, '0')}`;

  const spent = useMemo(() => {
    const totals = Object.fromEntries(CATEGORY_ORDER.map(id => [id, 0]));
    transactions.forEach(tx => {
      // REGIME DE COMPETÊNCIA PARA CARTÃO DE CRÉDITO
      if (tx.tipo === 'cartao' && tx.itens?.length > 0) {
        tx.itens.forEach(item => {
          const cat = item.categoria;
          if (!cat || totals[cat] === undefined) return;
          
          if (item.isParcelado) {
            const startParc = item.parcelaAtual || 1;
            const remaining = (item.totalParcelas || 1) - startParc + 1;
            
            for (let i = 0; i < remaining; i++) {
              const [y, m] = item.dataCompra.split('-').map(Number);
              const parcelDate = new Date(y, m - 1 + i, 1);
              const parcelMonthStr = `${parcelDate.getFullYear()}-${String(parcelDate.getMonth() + 1).padStart(2, '0')}`;
              
              if (parcelMonthStr === currentMonth) {
                totals[cat] += Number(item.valor) || 0;
              }
            }
          } else {
            if (item.dataCompra?.startsWith(currentMonth)) {
              totals[cat] += Number(item.valor) || 0;
            }
          }
        });
      } 
      // REGIME DE CAIXA PARA AS DEMAIS TRANSAÇÕES
      else {
        const occs = expandOccurrences(tx, from, to);
        if (!occs.length) return;
        
        const cat = tx.categoria || (tx.tipo === 'investimento' ? 'liberdade' : null);
        if (!cat) return;
        
        occs.forEach(o => { totals[cat] = (totals[cat] || 0) + o.valor; });
      }
    });
    return totals;
  }, [transactions, from, to, currentMonth]);

  const totalBudget = rendaMensal;
  const totalGasto = Object.values(spent).reduce((s, v) => s + v, 0);
  const pctGeral = totalBudget > 0 ? Math.min((totalGasto / totalBudget) * 100, 100) : 0;

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
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 16, padding: '14px', marginBottom: 16,
    }}>
      {/* Cabeçalho */}
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

      {/* Detalhes por categoria */}
      {expanded && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {CATEGORY_ORDER.map(id => {
            const cat = SARDINHA_CATEGORIES[id];
            const pct = Number(budgetPcts?.[id]) || 0;
            const budget = (rendaMensal * pct) / 100;
            const gasto = spent[id] || 0;
            const uso = budget > 0 ? Math.min((gasto / budget) * 100, 100) : 0;
            const over = gasto > budget && budget > 0;

            return (
              <div key={id}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 14 }}>{cat.icon}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>{cat.label}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: over ? 'var(--saida)' : cat.color }}>
                      {formatBRL(gasto)}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>/ {formatBRL(budget)}</span>
                  </div>
                </div>
                <div style={{ height: 5, background: 'var(--bg-surface)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', width: `${uso}%`,
                    background: over ? '#ef4444' : cat.color,
                    borderRadius: 3, transition: 'width 0.4s',
                  }} />
                </div>
                {over && (
                  <p style={{ margin: '2px 0 0', fontSize: 10, color: 'var(--saida)' }}>
                    Excedeu em {formatBRL(gasto - budget)}
                  </p>
                )}
              </div>
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
  );
}
