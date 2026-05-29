import { useState, useMemo } from 'react';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { formatBRL, TYPE_CONFIG } from '../../utils/formatters';
import { PERCENTUAL_CATEGORIES } from '../../utils/categories';

const CHART_TYPES = {
  SALDO: 'saldo',
  FLUXO: 'fluxo',
  CATEGORIAS: 'categorias',
};

const CustomTooltip = ({ active, payload, label, saldoInicial }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const isLineChart = payload[0].dataKey === 'saldo';
    const isPieChart = payload[0].name !== undefined && !isLineChart;
    
    let formattedDate = '';
    if (data.fullDate) {
      try {
        const dateObj = new Date(data.fullDate + 'T12:00:00');
        formattedDate = dateObj.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
        formattedDate = formattedDate.charAt(0).toUpperCase() + formattedDate.slice(1);
      } catch {
        formattedDate = data.fullDate;
      }
    }

    return (
      <div style={{
        background: 'rgba(23, 23, 37, 0.95)',
        backdropFilter: 'blur(8px)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '12px 16px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
        color: '#fff',
        fontSize: 12,
        fontFamily: 'inherit',
        lineHeight: 1.5,
        zIndex: 1000
      }}>
        {formattedDate && !isPieChart && (
          <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>
            {formattedDate}
          </p>
        )}
        
        {payload.map((entry, idx) => {
          const name = entry.name || entry.dataKey;
          const val = entry.value;
          const color = entry.color || entry.fill || 'var(--primary)';
          
          let formattedName = name;
          if (name === 'saldo') formattedName = '💵 Saldo Projetado';
          else if (name === 'entradas' || name === 'Entradas') formattedName = '📈 Entradas';
          else if (name === 'saidas' || name === 'Saídas') formattedName = '📉 Saídas';

          return (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, margin: '4px 0' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' }} />
                {formattedName}
              </span>
              <span style={{ fontWeight: 700, color: '#fff' }}>{formatBRL(val)}</span>
            </div>
          );
        })}

        {isLineChart && saldoInicial !== undefined && (
          <div style={{
            marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.08)',
            display: 'flex', justifyContent: 'space-between', gap: 20, fontSize: 11
          }}>
            <span style={{ color: 'var(--text-muted)' }}>📊 Variação no Período</span>
            {(() => {
              const diff = data.saldo - saldoInicial;
              const color = diff >= 0 ? 'var(--entrada)' : 'var(--saida)';
              const sign = diff >= 0 ? '+' : '';
              return (
                <span style={{ fontWeight: 700, color }}>
                  {sign}{formatBRL(diff)}
                </span>
              );
            })()}
          </div>
        )}
      </div>
    );
  }
  return null;
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
          } else {
             catTotals[cat] = (catTotals[cat] || 0) + valor;
          }
        }
      });
    });

    return Object.entries(catTotals)
      .filter(([_, val]) => val > 0)
      .map(([key, val]) => ({
        name: PERCENTUAL_CATEGORIES[key]?.label || 'Outros',
        value: val,
        color: PERCENTUAL_CATEGORIES[key]?.color || '#94a3b8'
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
                <Tooltip content={<CustomTooltip saldoInicial={saldoInicial} />} />
                <Line type="monotone" dataKey="saldo" stroke="var(--primary)" strokeWidth={3} dot={{ r: 3, fill: 'var(--bg-surface)', strokeWidth: 2 }} activeDot={{ r: 6 }} />
              </LineChart>
            )}

            {chartType === CHART_TYPES.FLUXO && (
              <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" vertical={false} />
                <XAxis dataKey="date" stroke="var(--text-muted)" fontSize={11} tickMargin={10} />
                <YAxis stroke="var(--text-muted)" fontSize={11} tickFormatter={(val) => `R$${val}`} />
                <Tooltip content={<CustomTooltip />} />
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
                <Tooltip content={<CustomTooltip />} />
                <Legend layout="horizontal" verticalAlign="bottom" align="center" wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            )}
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
