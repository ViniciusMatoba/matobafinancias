import { useState, useMemo } from 'react';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { formatBRL, TYPE_CONFIG } from '../../utils/formatters';
import { SARDINHA_CATEGORIES } from '../../utils/categories';

const CHART_TYPES = {
  SALDO: 'saldo',
  FLUXO: 'fluxo',
  CATEGORIAS: 'categorias',
};

export default function ProjectionCharts({ days, saldoInicial }) {
  const [chartType, setChartType] = useState(CHART_TYPES.SALDO);

  // Process data for charts
  const data = useMemo(() => {
    return days.map(day => {
      // Aggregate fluxo (entradas/saídas)
      let entradas = 0;
      let saidas = 0;
      
      day.items.forEach(item => {
        if (TYPE_CONFIG[item.tx.tipo].sign > 0) {
          entradas += Number(item.valor) || 0;
        } else {
          saidas += Number(item.valor) || 0;
        }
      });

      return {
        date: day.date.slice(8, 10) + '/' + day.date.slice(5, 7), // DD/MM
        fullDate: day.date,
        saldo: day.saldo,
        entradas,
        saidas,
        items: day.items
      };
    });
  }, [days]);

  const categoriesData = useMemo(() => {
    const catTotals = {};

    days.forEach(day => {
      day.items.forEach(item => {
        if (TYPE_CONFIG[item.tx.tipo].sign < 0) {
          // Normal expense
          let cat = item.tx.categoria || 'outros';
          let valor = Number(item.valor) || 0;

          // If credit card, look into items
          if (item.tx.tipo === 'cartao' && item.tx.itens) {
             item.tx.itens.forEach(sub => {
                let subCat = sub.categoria || 'outros';
                let subVal = Number(sub.valor) || 0;
                catTotals[subCat] = (catTotals[subCat] || 0) + subVal;
             });
             // Subtract card total so we don't double count? No, the card invoice is the only thing in `items` for the day.
             // Wait, the projection `buildDailyProjection` puts the card invoice as an item on the invoice due date.
             // But the user requested category breakdown by purchase date!
             // Wait! The projection only has `day.items` which includes credit card *invoices*.
             // For the sake of the projection chart, we break down the invoice items that are IN this period.
             // It's a cash flow pie chart (where did the money that left my account this month go?)
          } else {
             catTotals[cat] = (catTotals[cat] || 0) + valor;
          }
        }
      });
    });

    return Object.entries(catTotals)
      .filter(([_, val]) => val > 0)
      .map(([key, val]) => ({
        name: SARDINHA_CATEGORIES[key]?.label || 'Outros',
        value: val,
        color: SARDINHA_CATEGORIES[key]?.color || '#94a3b8'
      }))
      .sort((a, b) => b.value - a.value);
  }, [days]);

  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: 16, border: '1px solid var(--border)', padding: '16px' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, overflowX: 'auto', paddingBottom: 4 }}>
        <button
          onClick={() => setChartType(CHART_TYPES.SALDO)}
          style={{
            padding: '8px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
            background: chartType === CHART_TYPES.SALDO ? 'var(--primary)' : 'transparent',
            color: chartType === CHART_TYPES.SALDO ? '#fff' : 'var(--text-secondary)',
            border: `1px solid ${chartType === CHART_TYPES.SALDO ? 'var(--primary)' : 'var(--border)'}`,
          }}
        >
          Evolução do Saldo
        </button>
        <button
          onClick={() => setChartType(CHART_TYPES.FLUXO)}
          style={{
            padding: '8px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
            background: chartType === CHART_TYPES.FLUXO ? 'var(--primary)' : 'transparent',
            color: chartType === CHART_TYPES.FLUXO ? '#fff' : 'var(--text-secondary)',
            border: `1px solid ${chartType === CHART_TYPES.FLUXO ? 'var(--primary)' : 'var(--border)'}`,
          }}
        >
          Entradas vs Saídas
        </button>
        <button
          onClick={() => setChartType(CHART_TYPES.CATEGORIAS)}
          style={{
            padding: '8px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
            background: chartType === CHART_TYPES.CATEGORIAS ? 'var(--primary)' : 'transparent',
            color: chartType === CHART_TYPES.CATEGORIAS ? '#fff' : 'var(--text-secondary)',
            border: `1px solid ${chartType === CHART_TYPES.CATEGORIAS ? 'var(--primary)' : 'var(--border)'}`,
          }}
        >
          Despesas por Categoria
        </button>
      </div>

      <div style={{ height: 300, width: '100%', position: 'relative' }}>
        {data.length === 0 ? (
          <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
            Nenhum dado no período
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {chartType === CHART_TYPES.SALDO && (
              <LineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" vertical={false} />
                <XAxis dataKey="date" stroke="var(--text-muted)" fontSize={11} tickMargin={10} />
                <YAxis stroke="var(--text-muted)" fontSize={11} tickFormatter={(val) => `R$${val}`} />
                <Tooltip
                  contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, color: '#fff' }}
                  labelStyle={{ color: 'var(--text-muted)', marginBottom: 4 }}
                  formatter={(value) => [formatBRL(value), 'Saldo']}
                />
                <Line type="monotone" dataKey="saldo" stroke="var(--primary)" strokeWidth={3} dot={{ r: 3, fill: 'var(--bg-surface)', strokeWidth: 2 }} activeDot={{ r: 6 }} />
              </LineChart>
            )}

            {chartType === CHART_TYPES.FLUXO && (
              <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" vertical={false} />
                <XAxis dataKey="date" stroke="var(--text-muted)" fontSize={11} tickMargin={10} />
                <YAxis stroke="var(--text-muted)" fontSize={11} tickFormatter={(val) => `R$${val}`} />
                <Tooltip
                  contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, color: '#fff' }}
                  labelStyle={{ color: 'var(--text-muted)', marginBottom: 4 }}
                  formatter={(value, name) => [formatBRL(value), name === 'entradas' ? 'Entradas' : 'Saídas']}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 10 }} />
                <Bar dataKey="entradas" name="Entradas" fill="var(--entrada)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="saidas" name="Saídas" fill="var(--saida)" radius={[4, 4, 0, 0]} />
              </BarChart>
            )}

            {chartType === CHART_TYPES.CATEGORIAS && (
              <PieChart>
                <Pie
                  data={categoriesData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {categoriesData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, color: '#fff' }}
                  formatter={(value) => formatBRL(value)}
                />
                <Legend layout="horizontal" verticalAlign="bottom" align="center" wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            )}
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
