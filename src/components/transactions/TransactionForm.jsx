import { useState, useMemo } from 'react';
import { TYPE_CONFIG, FREQ_LABELS, todayStr, formatBRL, formatBRLInput, normalizeBRLInput, parseBRLInput, numberToBRLInput } from '../../utils/formatters';
import { SARDINHA_CATEGORIES, CATEGORY_OPTIONS, TIPOS_COM_CATEGORIA, getAutoCategory } from '../../utils/categories';
import { AlertCircle, History, Trash2, Plus, Pencil } from 'lucide-react';

const TIPOS = Object.entries(TYPE_CONFIG).map(([id, cfg]) => ({ id, ...cfg }));
const FREQS = Object.entries(FREQ_LABELS).map(([id, label]) => ({ id, label }));

// ── Similaridade de descrição ──────────────────────────────────────────────
function normalizeStr(s) {
  return (s || '').toLowerCase().trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ');
}
function isSimilarDesc(a, b) {
  const na = normalizeStr(a);
  const nb = normalizeStr(b);
  if (!na || !nb || na.length < 2 || nb.length < 2) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const wa = na.split(' ').filter(w => w.length > 2);
  const wb = nb.split(' ').filter(w => w.length > 2);
  if (!wa.length || !wb.length) return false;
  const setA = new Set(wa);
  const overlap = wb.filter(w => setA.has(w)).length;
  return overlap / Math.max(wa.length, wb.length) >= 0.6;
}

const EMPTY = {
  tipo: 'saida',
  descricao: '',
  valor: '',
  dataInicio: todayStr(),
  frequencia: 'unico',
  parcelaAtual: '',
  totalParcelas: '',
  dataFim: '',
  cartaoId: '',
  categoria: '',
};

const EMPTY_ITEM = { descricao: '', valor: '', categoria: '', dataCompra: todayStr(), isParcelado: false, parcelaAtual: '', totalParcelas: '' };

export default function TransactionForm({ onSave, onCancel, initial, cards, transactions = [] }) {
  const [form, setForm] = useState(initial ? {
    ...EMPTY, ...initial,
    // diário: stored value is valor/30, so reconstitute the monthly amount for editing
    valor: initial.tipo === 'diario'
      ? numberToBRLInput(parseFloat((initial.valor * 30).toFixed(2)))
      : numberToBRLInput(initial.valor),
    totalParcelas: initial.totalParcelas ? String(initial.totalParcelas) : '',
    parcelaAtual: initial.parcelaAtual ? String(initial.parcelaAtual) : '',
    // dataFim already comes from ...initial spread above
  } : { ...EMPTY });

  // Itens da fatura (apenas para cartão)
  const [itens, setItens] = useState(
    initial?.itens?.map(item => ({
      ...item,
      valor: numberToBRLInput(item.valor),
    })) || []
  );
  const [novoItem, setNovoItem] = useState({ ...EMPTY_ITEM });
  const [editItemIdx, setEditItemIdx] = useState(null);

  const [erro, setErro] = useState('');
  const set = (key, value) => { setErro(''); setForm(f => ({ ...f, [key]: value })); };

  // ── Detecção de duplicata ──────────────────────────────────────────────────
  const [dupChoice, setDupChoice] = useState(null);      // null | 'overwrite' | 'keep'
  const [overwriteTarget, setOverwriteTarget] = useState(null);

  const dupMatch = useMemo(() => {
    if (initial) return null; // modo edição: não verifica
    const desc = form.descricao.trim();
    if (desc.length < 2) return null;
    return transactions.find(tx => isSimilarDesc(tx.descricao, desc)) || null;
  }, [form.descricao, transactions, initial]);

  const setTipo = (tipo) => {
    setErro('');
    const auto = getAutoCategory(tipo);
    setForm(f => ({
      ...f, tipo,
      categoria: auto || (TIPOS_COM_CATEGORIA.includes(tipo) ? f.categoria : ''),
    }));
  };

  // Derivadas do tipo (antes dos memos que as usam)
  const tipoConfig = TYPE_CONFIG[form.tipo];
  const needsCat = TIPOS_COM_CATEGORIA.includes(form.tipo);
  const autocat = getAutoCategory(form.tipo);
  const selectedCat = autocat
    ? SARDINHA_CATEGORIES[autocat]
    : (form.categoria ? SARDINHA_CATEGORIES[form.categoria] : null);

  // Modo com itens: cartão com pelo menos 1 item adicionado
  const useItens = form.tipo === 'cartao' && itens.length > 0;
  const totalItens = itens.reduce((s, item) => s + parseBRLInput(item.valor), 0);

  // ── Histórico ──────────────────────────────────────────────────────────────
  const sortedHistory = useMemo(() =>
    [...transactions].sort((a, b) => {
      const ta = a.criadoEm?.toMillis?.() ?? a.dataInicio ?? '';
      const tb = b.criadoEm?.toMillis?.() ?? b.dataInicio ?? '';
      return tb > ta ? 1 : -1;
    }),
    [transactions]
  );

  const pastDescriptions = useMemo(() => {
    const seen = new Set();
    const result = [];
    for (const tx of sortedHistory) {
      if (tx.tipo === form.tipo && tx.descricao && !seen.has(tx.descricao)) {
        seen.add(tx.descricao);
        result.push(tx.descricao);
        if (result.length >= 30) break;
      }
    }
    return result;
  }, [sortedHistory, form.tipo]);

  const pastItemDescriptions = useMemo(() => {
    const seen = new Set();
    const result = [];
    for (const tx of sortedHistory) {
      if (tx.itens?.length) {
        for (const item of tx.itens) {
          if (item.descricao && !seen.has(item.descricao)) {
            seen.add(item.descricao);
            result.push(item.descricao);
            if (result.length >= 30) break;
          }
        }
      }
      if (result.length >= 30) break;
    }
    return result;
  }, [sortedHistory]);

  const suggestedCat = useMemo(() => {
    const desc = form.descricao.trim().toLowerCase();
    if (!desc || autocat || !needsCat || useItens) return null;
    const match = sortedHistory.find(
      tx => tx.descricao?.trim().toLowerCase() === desc && tx.categoria && TIPOS_COM_CATEGORIA.includes(tx.tipo)
    );
    if (!match) return null;
    return match.categoria !== form.categoria ? match.categoria : null;
  }, [form.descricao, form.categoria, sortedHistory, autocat, needsCat, useItens]);

  // Sugestão de categoria para o item em edição
  const novoItemSuggestedCat = useMemo(() => {
    const desc = novoItem.descricao.trim().toLowerCase();
    if (!desc) return null;
    for (const tx of sortedHistory) {
      if (tx.itens?.length) {
        const match = tx.itens.find(i => i.descricao?.trim().toLowerCase() === desc && i.categoria);
        if (match) return match.categoria !== novoItem.categoria ? match.categoria : null;
      }
    }
    return null;
  }, [novoItem.descricao, novoItem.categoria, sortedHistory]);
  // ── fim Histórico ──────────────────────────────────────────────────────────

  const addItem = () => {
    const v = parseBRLInput(novoItem.valor);
    if (!v || isNaN(v)) return;
    if (editItemIdx !== null) {
      setItens(prev => {
        const next = [...prev];
        next[editItemIdx] = { ...novoItem };
        return next;
      });
      setEditItemIdx(null);
    } else {
      setItens(prev => [...prev, { ...novoItem }]);
    }
    setNovoItem({ ...EMPTY_ITEM });
  };

  const editItem = (idx) => {
    setNovoItem(itens[idx]);
    setEditItemIdx(idx);
  };

  const removeItem = (idx) => {
    if (editItemIdx === idx) {
      setNovoItem({ ...EMPTY_ITEM });
      setEditItemIdx(null);
    } else if (editItemIdx !== null && editItemIdx > idx) {
      setEditItemIdx(editItemIdx - 1);
    }
    setItens(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    // Bloquear se duplicata não resolvida
    if (dupMatch && dupChoice === null) {
      setErro('Escolha o que fazer com o lançamento similar antes de continuar.');
      return;
    }

    let valor;
    let itensToSave = null;

    valor = parseBRLInput(form.valor);
    if (!valor || isNaN(valor)) { setErro('Informe o valor principal válido.'); return; }

    if (useItens) {
      itensToSave = itens.map(item => ({
        descricao: item.descricao.trim() || 'Item',
        valor: parseBRLInput(item.valor),
        categoria: item.categoria || null,
        dataCompra: item.dataCompra,
        ...(item.isParcelado ? {
          isParcelado: true,
          parcelaAtual: parseInt(item.parcelaAtual) || 1,
          totalParcelas: parseInt(item.totalParcelas) || 1,
        } : {})
      }));
    } else {
      if (form.tipo !== 'cartao' && needsCat && !autocat && !form.categoria) {
        setErro('Selecione uma categoria antes de continuar.');
        return;
      }
    }

    let finalValor = valor;
    let finalFreq = form.tipo === 'diario' ? 'diario' : form.frequencia;
    let finalDataFim = form.dataFim;

    if (form.tipo === 'diario') {
      finalValor = parseFloat((valor / 30).toFixed(2));
      // Se vazio → sem data de fim (para sempre); se preenchido → usa o valor
      finalDataFim = form.dataFim || null;
    }

    const autocatVal = getAutoCategory(form.tipo);

    const data = {
      tipo: form.tipo,
      descricao: form.descricao.trim() || TYPE_CONFIG[form.tipo].label,
      valor: finalValor,
      dataInicio: form.dataInicio,
      frequencia: finalFreq,
      categoria: itensToSave ? null : (autocatVal || form.categoria || null),
    };

    if (itensToSave) data.itens = itensToSave;

    if (finalFreq === 'parcelado') {
      data.totalParcelas = parseInt(form.totalParcelas) || 1;
      if (form.parcelaAtual) data.parcelaAtual = parseInt(form.parcelaAtual);
    } else if (['diario', 'semanal', 'mensal'].includes(finalFreq)) {
      // Sempre inclui dataFim (null = sem fim). Sem isso, updateDoc mantém o valor antigo.
      data.dataFim = finalDataFim || null;
    }

    if (form.tipo === 'cartao' && form.cartaoId) {
      data.cartaoId = form.cartaoId;
    }

    // Subscrever (substituir) lançamento similar existente
    if (dupChoice === 'overwrite' && overwriteTarget?.id) {
      data._overwriteId = overwriteTarget.id;
    }

    onSave(data);
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Seletor de tipo */}
      <div>
        <label style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8, display: 'block' }}>Tipo</label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {TIPOS.map(t => (
            <button key={t.id} type="button" onClick={() => setTipo(t.id)} style={{
              padding: '6px 12px', borderRadius: 20, fontSize: 13, fontWeight: 500,
              border: `1px solid ${form.tipo === t.id ? t.color : 'var(--border)'}`,
              background: form.tipo === t.id ? t.bg : 'transparent',
              color: form.tipo === t.id ? t.color : 'var(--text-secondary)',
              transition: 'all 0.15s',
            }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Descrição */}
      <div>
        <label style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>
          {form.tipo === 'cartao' ? 'Nome da fatura' : 'Descrição'}
          <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>(opcional)</span>
        </label>
        <input
          type="text" list="tx-desc-history" placeholder={tipoConfig.label}
          value={form.descricao}
          onChange={e => {
            set('descricao', e.target.value);
            // Reset escolha de duplicata ao alterar descrição
            if (dupChoice !== null) { setDupChoice(null); setOverwriteTarget(null); }
          }}
          maxLength={60} autoComplete="off"
        />
        {pastDescriptions.length > 0 && (
          <datalist id="tx-desc-history">
            {pastDescriptions.map(desc => <option key={desc} value={desc} />)}
          </datalist>
        )}

        {/* ── Banner de duplicata ────────────────────────────────────────── */}
        {dupMatch && dupChoice === null && (
          <div style={{
            marginTop: 8, padding: '10px 12px', borderRadius: 10,
            background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.35)',
          }}>
            <p style={{ margin: '0 0 4px', fontSize: 12, fontWeight: 600, color: '#d97706' }}>
              ⚠️ Lançamento similar já existe
            </p>
            <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--text-secondary)' }}>
              <strong style={{ color: 'var(--text-primary)' }}>"{dupMatch.descricao}"</strong>
              {' — '}{formatBRL(dupMatch.valor)}
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button"
                onClick={() => { setDupChoice('overwrite'); setOverwriteTarget(dupMatch); }}
                style={{
                  flex: 1, padding: '8px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                  background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                  color: 'var(--saida)', cursor: 'pointer',
                }}>
                Subscrever (substituir)
              </button>
              <button type="button"
                onClick={() => setDupChoice('keep')}
                style={{
                  flex: 1, padding: '8px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                  background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)',
                  color: 'var(--primary)', cursor: 'pointer',
                }}>
                Criar separado
              </button>
            </div>
          </div>
        )}

        {/* Confirmação: Subscrever escolhido */}
        {dupChoice === 'overwrite' && overwriteTarget && (
          <div style={{
            marginTop: 8, display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 12px', borderRadius: 10,
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
          }}>
            <span style={{ fontSize: 13 }}>⚠️</span>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--saida)', flex: 1 }}>
              Irá substituir: <strong>"{overwriteTarget.descricao}"</strong>
            </p>
            <button type="button"
              onClick={() => { setDupChoice(null); setOverwriteTarget(null); }}
              style={{ fontSize: 11, color: 'var(--text-muted)', background: 'none', padding: '2px 6px', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer' }}>
              Cancelar
            </button>
          </div>
        )}
        {/* ── fim Banner ────────────────────────────────────────────────── */}

        {suggestedCat && SARDINHA_CATEGORIES[suggestedCat] && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, marginTop: 6,
            padding: '8px 12px', borderRadius: 10,
            background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)',
          }}>
            <History size={13} color="var(--primary)" />
            <span style={{ flex: 1, fontSize: 12, color: 'var(--text-secondary)' }}>
              Usado antes como{' '}
              <strong style={{ color: 'var(--text-primary)' }}>
                {SARDINHA_CATEGORIES[suggestedCat].icon} {SARDINHA_CATEGORIES[suggestedCat].label}
              </strong>
            </span>
            <button type="button" onClick={() => set('categoria', suggestedCat)} style={{
              fontSize: 12, fontWeight: 700, color: 'var(--primary)', background: 'none',
              padding: '2px 6px', border: '1px solid rgba(99,102,241,0.4)', borderRadius: 6,
            }}>Usar</button>
          </div>
        )}
      </div>

      {/* Valor principal */}
      <div>
        <label style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>
          {form.tipo === 'cartao'
            ? 'Valor Total da Fatura (R$)'
            : form.tipo === 'diario'
              ? 'Estimativa mensal (R$)'
              : 'Valor (R$)'}
        </label>
        <input
          type="text" inputMode="decimal" placeholder="0,00"
          value={form.valor} onChange={e => set('valor', formatBRLInput(e.target.value))}
          onBlur={e => set('valor', normalizeBRLInput(e.target.value))}
          required style={{ fontSize: 22, fontWeight: 600, color: tipoConfig.color, letterSpacing: 0.5 }}
        />
        {/* Hint em tempo real para o diário */}
        {form.tipo === 'diario' && parseBRLInput(form.valor) > 0 && (
          <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--diario, #f59e0b)', textAlign: 'center' }}>
            = {formatBRL(parseBRLInput(form.valor) / 30)} <span style={{ color: 'var(--text-muted)' }}>por dia</span>
          </p>
        )}
      </div>

      {/* Data de início */}
      <div>
        <label style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>
          {form.tipo === 'diario' ? 'A partir de' : form.frequencia === 'unico' ? 'Data' : 'Data de início'}
        </label>
        <input type="date" value={form.dataInicio} onChange={e => set('dataInicio', e.target.value)}
          required style={{ colorScheme: 'dark' }} />
      </div>

      {/* Campo dataFim exclusivo para o tipo diário */}
      {form.tipo === 'diario' && (
        <div>
          <label style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>
            Vigente até{' '}
            <span style={{ color: 'var(--text-muted)' }}>
              {form.dataFim ? '(projetado até esta data)' : '(vazio = sem data de fim)'}
            </span>
          </label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="date"
              value={form.dataFim}
              min={form.dataInicio}
              onChange={e => set('dataFim', e.target.value)}
              style={{ colorScheme: 'dark', flex: 1 }}
            />
            {form.dataFim && (
              <button
                type="button"
                onClick={() => set('dataFim', '')}
                title="Remover data de fim (para sempre)"
                style={{
                  padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                  background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                  color: 'var(--saida)', cursor: 'pointer', whiteSpace: 'nowrap',
                }}
              >
                ✕ Sem fim
              </button>
            )}
          </div>
        </div>
      )}

      {form.tipo === 'diario' && (
        <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 10, padding: '10px 12px', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          💡 O valor é dividido por 30 e aparece como previsão diária na projeção.
          Cada dia à meia-noite o contador reinicia — os gastos reais do dia são registrados separadamente como <strong style={{ color: 'var(--text-primary)' }}>Saídas</strong>.
        </div>
      )}

      {/* Frequência */}
      {form.tipo !== 'diario' && (
        <div>
          <label style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>Frequência</label>
          <select value={form.frequencia} onChange={e => set('frequencia', e.target.value)}>
            {FREQS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
          </select>
        </div>
      )}

      {form.tipo !== 'diario' && form.frequencia === 'parcelado' && (
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>Parcela atual</label>
            <input type="number" min="1" max="120" placeholder="Ex: 1" value={form.parcelaAtual}
              onChange={e => set('parcelaAtual', e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>Total de parcelas</label>
            <input type="number" min="2" max="120" placeholder="Ex: 12" value={form.totalParcelas}
              onChange={e => set('totalParcelas', e.target.value)} required />
          </div>
        </div>
      )}

      {form.tipo !== 'diario' && ['diario', 'semanal', 'mensal'].includes(form.frequencia) && (
        <div>
          <label style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>
            Até quando <span style={{ color: 'var(--text-muted)' }}>(vazio = sem fim)</span>
          </label>
          <input type="date" value={form.dataFim} onChange={e => set('dataFim', e.target.value)} style={{ colorScheme: 'dark' }} />
        </div>
      )}

      {/* Cartão selector */}
      {form.tipo === 'cartao' && cards?.length > 0 && (
        <div>
          <label style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>Cartão</label>
          <select value={form.cartaoId} onChange={e => set('cartaoId', e.target.value)}>
            <option value="">Selecione um cartão</option>
            {cards.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </div>
      )}

      {/* ── Itens da fatura (somente cartão) ─────────────────────────────────── */}
      {form.tipo === 'cartao' && (
        <div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <label style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>
                Itens da fatura
              </label>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--cartao)' }}>
                {formatBRL(totalItens)} / {formatBRL(parseBRLInput(form.valor))}
              </span>
            </div>
            {/* Barra de progresso visual */}
            {(() => {
              const faturaValor = parseBRLInput(form.valor);
              const excedeu = totalItens > faturaValor;
              return (
                <>
                  <div style={{ height: 6, background: 'var(--bg-surface)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      width: `${Math.min((totalItens / (faturaValor || 1)) * 100, 100)}%`,
                      background: excedeu ? 'var(--saida)' : 'var(--cartao)',
                      transition: 'width 0.3s',
                    }} />
                  </div>
                  {faturaValor > 0 && (
                    <p style={{ margin: 0, fontSize: 11, textAlign: 'right', color: excedeu ? 'var(--saida)' : 'var(--text-muted)' }}>
                      {excedeu
                        ? `Excedeu ${formatBRL(totalItens - faturaValor)}`
                        : `Falta ${formatBRL(faturaValor - totalItens)}`}
                    </p>
                  )}
                </>
              );
            })()}
          </div>

          {/* Lista de itens adicionados */}
          {itens.map((item, idx) => {
            const cat = item.categoria ? SARDINHA_CATEGORIES[item.categoria] : null;
            return (
              <div key={idx} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: 'var(--bg-surface)', border: '1px solid var(--border)',
                borderRadius: 10, padding: '8px 10px', marginBottom: 6,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.dataCompra && <span style={{ color: 'var(--text-muted)', fontSize: 11, marginRight: 4 }}>{item.dataCompra.slice(8, 10)}/{item.dataCompra.slice(5, 7)} ·</span>}
                    {item.descricao || 'Sem descrição'}
                    {item.isParcelado && <span style={{ color: 'var(--text-muted)', fontSize: 11, marginLeft: 4 }}>· {item.parcelaAtual}/{item.totalParcelas}x</span>}
                  </p>
                  {cat && (
                    <p style={{ margin: 0, fontSize: 11, color: cat.color }}>
                      {cat.icon} {cat.label}
                    </p>
                  )}
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--cartao)', flexShrink: 0 }}>
                  {formatBRL(parseBRLInput(item.valor))}
                </span>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button type="button" onClick={() => editItem(idx)}
                    style={{ background: 'none', color: 'var(--text-muted)', display: 'flex', padding: 2 }}>
                    <Pencil size={14} />
                  </button>
                  <button type="button" onClick={() => removeItem(idx)}
                    style={{ background: 'none', color: 'var(--saida)', display: 'flex', padding: 2 }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}

          {/* Formulário de novo item */}
          <div style={{
            background: 'var(--bg-card)', border: '1px dashed var(--border)',
            borderRadius: 12, padding: '10px 12px',
          }}>
            <p style={{ margin: '0 0 8px', fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {editItemIdx !== null ? 'Editar item' : 'Adicionar item'}
            </p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input
                type="date"
                value={novoItem.dataCompra}
                onChange={e => setNovoItem(i => ({ ...i, dataCompra: e.target.value }))}
                style={{ flex: 1, colorScheme: 'dark' }}
                required
              />
              <input
                type="text" list="tx-item-desc-history" placeholder="Descrição"
                value={novoItem.descricao}
                onChange={e => setNovoItem(i => ({ ...i, descricao: e.target.value }))}
                maxLength={60} autoComplete="off" style={{ flex: 2 }}
              />
            </div>
            {pastItemDescriptions.length > 0 && (
              <datalist id="tx-item-desc-history">
                {pastItemDescriptions.map(desc => <option key={desc} value={desc} />)}
              </datalist>
            )}

            {/* Sugestão de categoria para o item */}
            {novoItemSuggestedCat && SARDINHA_CATEGORIES[novoItemSuggestedCat] && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8,
                padding: '6px 10px', borderRadius: 8,
                background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)',
              }}>
                <History size={11} color="var(--primary)" />
                <span style={{ flex: 1, fontSize: 11, color: 'var(--text-secondary)' }}>
                  Antes: <strong style={{ color: 'var(--text-primary)' }}>
                    {SARDINHA_CATEGORIES[novoItemSuggestedCat].icon} {SARDINHA_CATEGORIES[novoItemSuggestedCat].label}
                  </strong>
                </span>
                <button type="button"
                  onClick={() => setNovoItem(i => ({ ...i, categoria: novoItemSuggestedCat }))}
                  style={{ fontSize: 11, fontWeight: 700, color: 'var(--primary)', background: 'none', padding: '1px 5px', border: '1px solid rgba(99,102,241,0.4)', borderRadius: 5 }}>
                  Usar
                </button>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input
                type="text" inputMode="decimal" placeholder="0,00"
                value={novoItem.valor}
                onChange={e => setNovoItem(i => ({ ...i, valor: formatBRLInput(e.target.value) }))}
                onBlur={e => setNovoItem(i => ({ ...i, valor: normalizeBRLInput(e.target.value) }))}
                style={{ flex: 1, fontSize: 16, fontWeight: 600, color: 'var(--cartao)' }}
              />
              <select
                value={novoItem.categoria}
                onChange={e => setNovoItem(i => ({ ...i, categoria: e.target.value }))}
                style={{ flex: 1 }}
              >
                <option value="">Categoria</option>
                {CATEGORY_OPTIONS.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.icon} {cat.label}</option>
                ))}
              </select>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={novoItem.isParcelado} onChange={e => setNovoItem(i => ({ ...i, isParcelado: e.target.checked }))} />
              É parcelado?
            </label>
            {novoItem.isParcelado && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <input type="number" min="1" placeholder="Parcela atual (ex: 1)" value={novoItem.parcelaAtual} onChange={e => setNovoItem(i => ({ ...i, parcelaAtual: e.target.value }))} style={{ flex: 1, fontSize: 13 }} />
                <input type="number" min="2" placeholder="Total (ex: 12)" value={novoItem.totalParcelas} onChange={e => setNovoItem(i => ({ ...i, totalParcelas: e.target.value }))} style={{ flex: 1, fontSize: 13 }} />
              </div>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              {editItemIdx !== null && (
                <button type="button" onClick={() => { setNovoItem({ ...EMPTY_ITEM }); setEditItemIdx(null); }} style={{
                  flex: 1, padding: '10px', borderRadius: 10, fontSize: 13, fontWeight: 500,
                  background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)'
                }}>Cancelar</button>
              )}
              <button type="button" onClick={addItem} disabled={!novoItem.valor} style={{
                flex: editItemIdx !== null ? 1 : undefined,
                width: editItemIdx !== null ? undefined : '100%',
                padding: '10px', borderRadius: 10, fontSize: 13, fontWeight: 600,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                background: novoItem.valor ? 'rgba(59,130,246,0.12)' : 'transparent',
                color: novoItem.valor ? 'var(--cartao)' : 'var(--text-muted)',
                border: `1px solid ${novoItem.valor ? 'rgba(59,130,246,0.3)' : 'var(--border)'}`,
              }}>
                {editItemIdx !== null ? 'Salvar item' : <><Plus size={14} /> Adicionar item</>}
              </button>
            </div>
          </div>

          {/* Separador visual */}
          {itens.length === 0 && (
            <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>
              Sem itens — o valor acima será usado como total da fatura
            </p>
          )}
        </div>
      )}
      {/* ── fim Itens ──────────────────────────────────────────────────────────── */}

      {/* Categoria Sardinha — oculta para cartão (feito por item) */}
      {form.tipo !== 'cartao' && (autocat ? (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
          background: selectedCat.bg, border: `1px solid ${selectedCat.color}44`, borderRadius: 10,
        }}>
          <span style={{ fontSize: 18 }}>{selectedCat.icon}</span>
          <div>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: selectedCat.color }}>
              {selectedCat.label} — automático
            </p>
            <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>
              Investimentos entram direto nesta categoria
            </p>
          </div>
        </div>
      ) : needsCat && (
        <div>
          <label style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>
            Categoria <span style={{ color: 'var(--saida)', fontSize: 11 }}>*obrigatória</span>
          </label>
          <select value={form.categoria} onChange={e => set('categoria', e.target.value)}>
            <option value="">Selecione uma categoria...</option>
            {CATEGORY_OPTIONS.map(cat => (
              <option key={cat.id} value={cat.id}>{cat.icon} {cat.label} ({cat.defaultPct}%)</option>
            ))}
          </select>
          {form.categoria && SARDINHA_CATEGORIES[form.categoria] && (
            <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--text-muted)', paddingLeft: 4 }}>
              {SARDINHA_CATEGORIES[form.categoria].desc}
            </p>
          )}
        </div>
      ))}

      {erro && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 10, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
          <AlertCircle size={15} color="var(--saida)" />
          <span style={{ fontSize: 13, color: 'var(--saida)', fontWeight: 500 }}>{erro}</span>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
        <button type="button" onClick={onCancel} style={{
          flex: 1, padding: '14px', borderRadius: 12, fontSize: 15, fontWeight: 500,
          background: 'var(--bg-card)', color: 'var(--text-secondary)',
        }}>Cancelar</button>
        <button type="submit" style={{
          flex: 2, padding: '14px', borderRadius: 12, fontSize: 15, fontWeight: 600,
          background: tipoConfig.color, color: '#fff',
          boxShadow: `0 4px 16px ${tipoConfig.bg}`, cursor: 'pointer',
        }}>
          {initial ? 'Salvar alterações' : 'Adicionar'}
        </button>
      </div>
    </form>
  );
}
