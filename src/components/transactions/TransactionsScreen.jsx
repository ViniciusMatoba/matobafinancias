import { useState, useMemo } from 'react';
import { Search, TrendingUp, TrendingDown, CreditCard, PiggyBank, Zap, Pencil, Trash2, Filter, ChevronDown, ChevronUp } from 'lucide-react';
import { formatBRL, formatDateShort, TYPE_CONFIG, todayStr } from '../../utils/formatters';
import { expandOccurrences } from '../../utils/projectionCalc';
import { SARDINHA_CATEGORIES } from '../../utils/categories';

const TIPO_ICONS = {
  entrada: TrendingUp, saida: TrendingDown, diario: Zap, cartao: CreditCard, investimento: PiggyBank,
};

function monthStr(offset) {
  const base = todayStr().slice(0, 7);
  const [y, m] = base.split('-').map(Number);
  const d = new Date(y, m - 1 + offset, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function TransactionsScreen({ transactions, onEdit, onDelete }) {
  const [search, setSearch] = useState('');
  const [filterTipo, setFilterTipo] = useState('');
  const [monthOffset, setMonthOffset] = useState(0);

  const [expandedIds, setExpandedIds] = useState(new Set());

  const toggleExpand = (id) => setExpandedIds(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const currentMonth = monthStr(monthOffset);
  const [year, mon] = currentMonth.split('-').map(Number);
  const from = `${currentMonth}-01`;
  const lastDay = new Date(year, mon, 0).getDate();
  const to = `${currentMonth}-${String(lastDay).padStart(2, '0')}`;
  const MONTH_NAMES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

  const allOccs = useMemo(() => {
    return transactions
      .flatMap(tx => expandOccurrences(tx, from, to).map(o => ({ ...o, tx })))
      .filter(o => {
        if (filterTipo && o.tx.tipo !== filterTipo) return false;
        if (search && !o.tx.descricao?.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [transactions, from, to, filterTipo, search]);

  const grouped = useMemo(() => {
    const g = {};
    allOccs.forEach(o => { if (!g[o.date]) g[o.date] = []; g[o.date].push(o); });
    return Object.entries(g).sort(([a], [b]) => b.localeCompare(a));
  }, [allOccs]);

  return (
    <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 90 }}>
      {/* Header */}
      <div style={{ padding: '20px 20px 0', background: 'var(--bg-primary)', position: 'sticky', top: 0, zIndex: 10, borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Histórico</h1>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button onClick={() => setMonthOffset(o => o - 1)} style={{ background: 'var(--bg-card)', borderRadius: 8, padding: '4px 8px', fontSize: 12, color: 'var(--text-secondary)' }}>
              ‹ {MONTH_NAMES[(() => { const [y,m] = monthStr(monthOffset-1).split('-').map(Number); return m-1; })()]}
            </button>
            <button onClick={() => setMonthOffset(o => o + 1)} style={{ background: 'var(--bg-card)', borderRadius: 8, padding: '4px 8px', fontSize: 12, color: 'var(--text-secondary)' }}>
              {MONTH_NAMES[(() => { const [y,m] = monthStr(monthOffset+1).split('-').map(Number); return m-1; })()] } ›
            </button>
          </div>
        </div>

        {/* Busca */}
        <div style={{ position: 'relative', marginBottom: 10 }}>
          <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Buscar descrição..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ paddingLeft: 36 }}
          />
        </div>

        {/* Filtro de tipo */}
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 12 }}>
          <button
            onClick={() => setFilterTipo('')}
            style={{ padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500, flexShrink: 0,
              background: !filterTipo ? 'var(--primary)' : 'var(--bg-card)',
              color: !filterTipo ? '#fff' : 'var(--text-secondary)',
              border: '1px solid ' + (!filterTipo ? 'transparent' : 'var(--border)'),
            }}
          >Todos</button>
          {Object.entries(TYPE_CONFIG).map(([id, cfg]) => (
            <button
              key={id}
              onClick={() => setFilterTipo(filterTipo === id ? '' : id)}
              style={{ padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500, flexShrink: 0,
                background: filterTipo === id ? cfg.bg : 'var(--bg-card)',
                color: filterTipo === id ? cfg.color : 'var(--text-secondary)',
                border: `1px solid ${filterTipo === id ? cfg.color : 'var(--border)'}`,
              }}
            >{cfg.label}</button>
          ))}
        </div>
      </div>

      {/* Lista */}
      <div style={{ padding: '16px 20px 0' }}>
        <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--text-secondary)' }}>
          {allOccs.length} lançamento{allOccs.length !== 1 ? 's' : ''} · {MONTH_NAMES[mon-1]} {year}
        </p>

        {grouped.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: 40 }}>Nenhum resultado</p>
        ) : grouped.map(([date, items]) => (
          <div key={date} style={{ marginBottom: 20 }}>
            <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>
              {formatDateShort(date)}
            </p>
            {items.map((occ, idx) => {
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
                    <div style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, background: cfg.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon size={16} color={cfg.color} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {occ.tx.descricao || cfg.label}
                      </p>
                      <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>
                        {cfg.label}{occ.parcela ? ` · ${occ.parcela}/${occ.totalParcelas}x` : ''}
                        {hasItens ? ` · ${occ.tx.itens.length} iten${occ.tx.itens.length !== 1 ? 's' : ''}` : ''}
                      </p>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, marginLeft: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: cfg.color }}>
                          {cfg.sign > 0 ? '+' : '-'}{formatBRL(occ.valor)}
                        </p>
                        {hasItens && (
                          <button onClick={() => toggleExpand(occ.tx.id)} style={{ background: 'none', color: 'var(--text-muted)', display: 'flex', padding: 2 }}>
                            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </button>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => onEdit(occ.tx)} style={{ background: 'none', color: 'var(--text-muted)', display: 'flex', padding: 2 }}><Pencil size={12} /></button>
                        <button onClick={() => onDelete(occ.tx.id)} style={{ background: 'none', color: 'var(--saida)', display: 'flex', padding: 2 }}><Trash2 size={12} /></button>
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
        ))}
      </div>
    </div>
  );
}
