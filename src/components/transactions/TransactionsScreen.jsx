import { useState, useMemo, useEffect, useRef } from 'react';
import { Search, TrendingUp, TrendingDown, CreditCard, PiggyBank, Zap, Pencil, Trash2, Filter, ChevronDown, ChevronUp, Copy, Calendar, X, RefreshCw } from 'lucide-react';
import { formatBRL, formatDateShort, TYPE_CONFIG, todayStr } from '../../utils/formatters';
import { expandOccurrences } from '../../utils/projectionCalc';
import { PERCENTUAL_CATEGORIES } from '../../utils/categories';

const TIPO_ICONS = {
  entrada: TrendingUp, saida: TrendingDown, diario: Zap, cartao: CreditCard, investimento: PiggyBank,
};

function monthStr(offset) {
  const base = todayStr().slice(0, 7);
  const [y, m] = base.split('-').map(Number);
  const d = new Date(y, m - 1 + offset, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function TransactionsScreen({ transactions, wallets = [], onEdit, onClone, onDelete, onPay, onUpdate }) {
  const [viewMode, setViewMode] = useState('mensal'); // 'mensal' | 'completo'
  const [search, setSearch] = useState('');
  const [filterTipo, setFilterTipo] = useState('');
  const [monthOffset, setMonthOffset] = useState(0);

  // Filtros Avançados
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [filterCategory, setFilterCategory] = useState('');
  const [filterWallet, setFilterWallet] = useState('');
  const [filterConciliacao, setFilterConciliacao] = useState('todos'); // 'todos' | 'conferidos' | 'pendentes'
  const [filterFromDate, setFilterFromDate] = useState('');
  const [filterToDate, setFilterToDate] = useState('');

  // Limite de itens visíveis para performance
  const [visibleCount, setVisibleCount] = useState(50);

  const [expandedIds, setExpandedIds] = useState(new Set());

  const toggleExpand = (id) => setExpandedIds(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const currentMonth = monthStr(monthOffset);
  const [year, mon] = currentMonth.split('-').map(Number);
  const MONTH_NAMES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

  // Intervalo de datas calculado baseado na visão
  const from = useMemo(() => {
    if (viewMode === 'mensal') {
      return `${currentMonth}-01`;
    }
    return filterFromDate || '2024-01-01';
  }, [viewMode, currentMonth, filterFromDate]);

  const to = useMemo(() => {
    if (viewMode === 'mensal') {
      const lastDay = new Date(year, mon, 0).getDate();
      return `${currentMonth}-${String(lastDay).padStart(2, '0')}`;
    }
    return filterToDate || '2028-12-31';
  }, [viewMode, currentMonth, year, mon, filterToDate]);

  // Auxiliares de conciliação
  const isOccConferido = (occ) => {
    const tx = occ.tx;
    if (!tx) return false;
    if (tx.frequencia === 'unico' || tx.frequencia === 'parcelado') {
      return !!tx.conferido;
    }
    return !!tx.conferidos?.includes(occ.date);
  };

  const handleToggleConferido = async (occ) => {
    const tx = occ.tx;
    if (!tx || !onUpdate) return;
    
    if (tx.frequencia === 'unico' || tx.frequencia === 'parcelado') {
      await onUpdate(tx.id, { conferido: !tx.conferido });
    } else {
      let newConferidos = [...(tx.conferidos || [])];
      if (newConferidos.includes(occ.date)) {
        newConferidos = newConferidos.filter(d => d !== occ.date);
      } else {
        newConferidos.push(occ.date);
      }
      await onUpdate(tx.id, { conferidos: newConferidos });
    }
  };

  // Reseta o limite de visibilidade ao alterar filtros
  useEffect(() => {
    setVisibleCount(50);
  }, [viewMode, search, filterTipo, filterCategory, filterWallet, filterConciliacao, filterFromDate, filterToDate]);

  const allOccs = useMemo(() => {
    return transactions
      .flatMap(tx => expandOccurrences(tx, from, to).map(o => ({ ...o, tx })))
      .filter(o => {
        // 1. Filtro Tipo
        if (filterTipo && o.tx.tipo !== filterTipo) return false;
        
        // 2. Busca textual
        if (search) {
          const s = search.toLowerCase();
          const matchDesc = o.tx.descricao?.toLowerCase().includes(s);
          const matchCat = o.tx.categoria?.toLowerCase().includes(s);
          const matchItems = o.tx.itens?.some(item => 
            item.descricao?.toLowerCase().includes(s) || item.categoria?.toLowerCase().includes(s)
          );
          if (!matchDesc && !matchCat && !matchItems) return false;
        }

        // 3. Categoria da Divisão Percentual
        if (filterCategory) {
          const matchMain = o.tx.categoria === filterCategory;
          const matchItems = o.tx.itens?.some(item => item.categoria === filterCategory);
          if (!matchMain && !matchItems) return false;
        }

        // 4. Carteira / Conta
        if (filterWallet) {
          if (o.tx.carteiraId !== filterWallet) return false;
        }

        // 5. Conciliação
        if (filterConciliacao !== 'todos') {
          const isConf = isOccConferido(o);
          if (filterConciliacao === 'conferidos' && !isConf) return false;
          if (filterConciliacao === 'pendentes' && isConf) return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (viewMode === 'mensal') {
          return a.date.localeCompare(b.date);
        } else {
          return b.date.localeCompare(a.date);
        }
      });
  }, [transactions, from, to, filterTipo, search, filterCategory, filterWallet, filterConciliacao, viewMode]);

  // Totalizador de pendências (apenas anteriores a hoje, independente do filtro de visualização)
  const pendingCount = useMemo(() => {
    const today = todayStr();
    // Gera todas as ocorrências de lançamentos até hoje para contabilizar pendências
    return transactions
      .flatMap(tx => expandOccurrences(tx, '2024-01-01', today).map(o => ({ ...o, tx })))
      .filter(o => !isOccConferido(o))
      .length;
  }, [transactions]);

  const visibleOccs = useMemo(() => {
    return allOccs.slice(0, visibleCount);
  }, [allOccs, visibleCount]);

  const grouped = useMemo(() => {
    const g = {};
    visibleOccs.forEach(o => { if (!g[o.date]) g[o.date] = []; g[o.date].push(o); });
    return Object.entries(g).sort(([a], [b]) => {
      return viewMode === 'mensal' ? a.localeCompare(b) : b.localeCompare(a);
    });
  }, [visibleOccs, viewMode]);

  // Rola para o final automaticamente apenas no modo mensal ao mudar de mês
  const listRef = useRef(null);
  useEffect(() => {
    if (viewMode === 'mensal' && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [grouped, viewMode, monthOffset]);

  const clearFilters = () => {
    setSearch('');
    setFilterTipo('');
    setFilterCategory('');
    setFilterWallet('');
    setFilterConciliacao('todos');
    setFilterFromDate('');
    setFilterToDate('');
  };

  return (
    <div ref={listRef} style={{ flex: 1, overflowY: 'auto', paddingBottom: 90 }}>
      {/* Header */}
      <div style={{ padding: '20px 20px 0', background: 'var(--bg-primary)', position: 'sticky', top: 0, zIndex: 10, borderBottom: '1px solid var(--border)' }}>
        
        {/* Seletor de Visão e Título */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Histórico</h1>
          
          {/* Segmented Control */}
          <div style={{ display: 'flex', background: 'var(--bg-card)', padding: 3, borderRadius: 10, border: '1px solid var(--border)' }}>
            <button
              onClick={() => setViewMode('mensal')}
              style={{
                padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                background: viewMode === 'mensal' ? 'var(--primary)' : 'none',
                color: viewMode === 'mensal' ? '#fff' : 'var(--text-secondary)',
                border: 'none', cursor: 'pointer', transition: 'all 0.2s'
              }}
            >
              Mensal
            </button>
            <button
              onClick={() => setViewMode('completo')}
              style={{
                padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                background: viewMode === 'completo' ? 'var(--primary)' : 'none',
                color: viewMode === 'completo' ? '#fff' : 'var(--text-secondary)',
                border: 'none', cursor: 'pointer', transition: 'all 0.2s'
              }}
            >
              Geral
            </button>
          </div>
        </div>

        {/* Controles do Modo Mensal */}
        {viewMode === 'mensal' && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
              Período de Referência
            </span>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button onClick={() => setMonthOffset(o => o - 1)} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '5px 10px', fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)', cursor: 'pointer' }}>
                ‹ {MONTH_NAMES[(() => { const [y,m] = monthStr(monthOffset-1).split('-').map(Number); return m-1; })()]}
              </button>
              <button onClick={() => setMonthOffset(0)} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '5px 10px', fontSize: 11, fontWeight: 500, color: 'var(--primary)', cursor: 'pointer' }}>
                Hoje
              </button>
              <button onClick={() => setMonthOffset(o => o + 1)} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '5px 10px', fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)', cursor: 'pointer' }}>
                {MONTH_NAMES[(() => { const [y,m] = monthStr(monthOffset+1).split('-').map(Number); return m-1; })()] } ›
              </button>
            </div>
          </div>
        )}

        {/* Barra de Busca e Filtro Avançado */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Buscar descrição ou categoria..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ paddingLeft: 36, height: 38 }}
            />
          </div>
          <button
            onClick={() => setShowAdvanced(o => !o)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', width: 38, height: 38,
              borderRadius: 10, background: showAdvanced ? 'var(--primary)' : 'var(--bg-card)',
              border: `1px solid ${showAdvanced ? 'var(--primary)' : 'var(--border)'}`,
              color: showAdvanced ? '#fff' : 'var(--text-secondary)', cursor: 'pointer', transition: 'all 0.2s'
            }}
            title="Filtros Avançados"
          >
            <Filter size={16} />
          </button>
        </div>

        {/* Painel de Filtros Avançados */}
        {showAdvanced && (
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 12, padding: '14px', marginBottom: 12,
            display: 'flex', flexDirection: 'column', gap: 10,
            animation: 'fadeIn 0.2s ease-out'
          }}>
            {/* Grid de seletores */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
              
              {/* Filtro de Categoria da Divisão Percentual */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)' }}>Divisão Percentual</span>
                <select
                  value={filterCategory}
                  onChange={e => setFilterCategory(e.target.value)}
                  style={{ fontSize: 12, height: 34, padding: '0 8px', borderRadius: 8, background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                >
                  <option value="">Todas</option>
                  {Object.entries(PERCENTUAL_CATEGORIES).map(([id, cat]) => (
                    <option key={id} value={id}>{cat.icon} {cat.label}</option>
                  ))}
                </select>
              </div>

              {/* Filtro de Carteira */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)' }}>Carteira / Conta</span>
                <select
                  value={filterWallet}
                  onChange={e => setFilterWallet(e.target.value)}
                  style={{ fontSize: 12, height: 34, padding: '0 8px', borderRadius: 8, background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                >
                  <option value="">Todas</option>
                  {wallets.map(w => (
                    <option key={w.id} value={w.id}>{w.nome}</option>
                  ))}
                </select>
              </div>

              {/* Filtro de Conciliação */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)' }}>Conciliação</span>
                <select
                  value={filterConciliacao}
                  onChange={e => setFilterConciliacao(e.target.value)}
                  style={{ fontSize: 12, height: 34, padding: '0 8px', borderRadius: 8, background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                >
                  <option value="todos">Todas</option>
                  <option value="conferidos">Conferidas (✓)</option>
                  <option value="pendentes">Pendentes (✗)</option>
                </select>
              </div>
            </div>

            {/* Filtro de Data Personalizado (Apenas Geral) */}
            {viewMode === 'completo' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)' }}>De</span>
                  <input
                    type="date"
                    value={filterFromDate}
                    onChange={e => setFilterFromDate(e.target.value)}
                    style={{ fontSize: 12, height: 34, padding: '0 8px', borderRadius: 8, background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                  />
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)' }}>Até</span>
                  <input
                    type="date"
                    value={filterToDate}
                    onChange={e => setFilterToDate(e.target.value)}
                    style={{ fontSize: 12, height: 34, padding: '0 8px', borderRadius: 8, background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                  />
                </div>
              </div>
            )}

            {/* Ações de Limpeza */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
              <button
                type="button"
                onClick={clearFilters}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', borderRadius: 8,
                  background: 'none', border: '1px solid var(--border)', color: 'var(--text-secondary)',
                  fontSize: 11, fontWeight: 600, cursor: 'pointer'
                }}
              >
                <X size={12} /> Limpar Filtros
              </button>
            </div>
          </div>
        )}

        {/* Filtro Rápido de Tipo */}
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 12 }}>
          <button
            onClick={() => setFilterTipo('')}
            style={{ padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500, flexShrink: 0,
              background: !filterTipo ? 'var(--primary)' : 'var(--bg-card)',
              color: !filterTipo ? '#fff' : 'var(--text-secondary)',
              border: '1px solid ' + (!filterTipo ? 'transparent' : 'var(--border)'),
              cursor: 'pointer'
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
                cursor: 'pointer'
              }}
            >{cfg.label}</button>
          ))}
        </div>
      </div>

      {/* Lista */}
      <div style={{ padding: '16px 20px 0' }}>
        
        {/* Banner de Conciliação Pendente */}
        {pendingCount > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)',
            borderRadius: 12, padding: '10px 14px', marginBottom: 16,
            animation: 'fadeIn 0.3s ease-out'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 16 }}>⚖️</span>
              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--conforto)' }}>
                {pendingCount} lançamentos pendentes de conferência.
              </span>
            </div>
            <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-muted)', background: 'rgba(245,158,11,0.1)', padding: '2px 6px', borderRadius: 4 }}>
              Até hoje
            </span>
          </div>
        )}

        <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--text-secondary)' }}>
          {viewMode === 'mensal' ? (
            `${allOccs.length} lançamento${allOccs.length !== 1 ? 's' : ''} · ${MONTH_NAMES[mon-1]} ${year}`
          ) : (
            `${allOccs.length} lançamento${allOccs.length !== 1 ? 's' : ''} no total`
          )}
        </p>

        {grouped.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: 60, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 32 }}>🔍</span>
            <p style={{ margin: 0 }}>Nenhum lançamento encontrado</p>
            {(search || filterTipo || filterCategory || filterWallet || filterConciliacao !== 'todos' || filterFromDate || filterToDate) && (
              <button
                onClick={clearFilters}
                style={{
                  padding: '6px 12px', borderRadius: 8, background: 'var(--bg-card)',
                  border: '1px solid var(--border)', color: 'var(--primary)', fontSize: 11, fontWeight: 600, cursor: 'pointer'
                }}
              >
                Limpar todos os filtros
              </button>
            )}
          </div>
        ) : (
          <>
            {grouped.map(([date, items]) => (
              <div key={date} style={{ marginBottom: 20 }}>
                <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>
                  {formatDateShort(date)}
                </p>
                {items.map((occ, idx) => {
                  const Icon = TIPO_ICONS[occ.tx.tipo] || Zap;
                  const cfg = TYPE_CONFIG[occ.tx.tipo];
                  const hasItens = occ.tx.tipo === 'cartao' && (occ.tx.itens?.length ?? 0) > 0;
                  const isExpanded = expandedIds.has(occ.tx.id);
                  const isConferido = isOccConferido(occ);

                  return (
                    <div key={`${occ.tx.id}-${idx}`} style={{
                      background: 'var(--bg-card)', border: '1px solid var(--border)',
                      borderRadius: 12, marginBottom: 6, overflow: 'hidden',
                      boxShadow: '0 2px 4px rgba(0, 0, 0, 0.08)',
                      transition: 'border-color 0.2s',
                      borderColor: isConferido ? 'rgba(99, 102, 241, 0.15)' : 'var(--border)'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px' }}>
                        
                        {/* Checkbox de Conciliação */}
                        {onUpdate && (
                          <button
                            onClick={() => handleToggleConferido(occ)}
                            style={{
                              background: 'none', border: 'none', padding: '0 2px 0 0', cursor: 'pointer',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                            }}
                            title={isConferido ? "Marcar como não conferido" : "Marcar como conferido"}
                          >
                            <div style={{
                              width: 18, height: 18, borderRadius: '50%',
                              border: `2px solid ${isConferido ? 'var(--primary)' : 'var(--border)'}`,
                              background: isConferido ? 'var(--primary)' : 'transparent',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              transition: 'all 0.2s ease'
                            }}>
                              {isConferido && (
                                <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                                  <path d="M1 4L3.5 6.5L9 1" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              )}
                            </div>
                          </button>
                        )}

                        {/* Ícone */}
                        <div style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, background: cfg.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Icon size={16} color={cfg.color} />
                        </div>

                        {/* Descrição e Detalhes */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {occ.tx.descricao || cfg.label}
                          </p>
                          <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>
                            {cfg.label}{occ.parcela ? ` · ${occ.parcela}/${occ.totalParcelas}x` : ''}
                            {hasItens ? ` · ${occ.tx.itens.length} iten${occ.tx.itens.length !== 1 ? 's' : ''}` : ''}
                          </p>
                        </div>

                        {/* Valor e Ações */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, marginLeft: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: cfg.color }}>
                              {cfg.sign > 0 ? '+' : '-'}{formatBRL(occ.valor)}
                            </p>
                            {hasItens && (
                              <button onClick={() => toggleExpand(occ.tx.id)} style={{ background: 'none', color: 'var(--text-muted)', display: 'flex', padding: 2, cursor: 'pointer', border: 'none' }}>
                                {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                              </button>
                            )}
                          </div>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            {/* Botão Pagar — apenas para despesas futuras ou de hoje */}
                            {onPay && occ.tx.tipo !== 'entrada' && occ.date >= todayStr() && (
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
                            {onClone && (
                              <button onClick={() => onClone(occ.tx)} title="Repetir lançamento" style={{ background: 'none', color: 'var(--text-muted)', display: 'flex', padding: 2, cursor: 'pointer', border: 'none' }}>
                                <Copy size={12} />
                              </button>
                            )}
                            <button onClick={() => onEdit(occ.tx, occ.date)} style={{ background: 'none', color: 'var(--text-muted)', display: 'flex', padding: 2, cursor: 'pointer', border: 'none' }}><Pencil size={12} /></button>
                            <button onClick={() => onDelete(occ.tx.id, occ.date)} style={{ background: 'none', color: 'var(--saida)', display: 'flex', padding: 2, cursor: 'pointer', border: 'none' }}><Trash2 size={12} /></button>
                          </div>
                        </div>
                      </div>
                      
                      {/* Itens do Cartão Expansíveis */}
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
            
            {/* Botão Carregar Mais para Performance */}
            {allOccs.length > visibleCount && (
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: 10, marginBottom: 20 }}>
                <button
                  onClick={() => setVisibleCount(c => c + 50)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '10px 20px', borderRadius: 10,
                    background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--primary)',
                    fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s'
                  }}
                >
                  <RefreshCw size={14} /> Carregar mais lançamentos ({allOccs.length - visibleCount} restantes)
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
