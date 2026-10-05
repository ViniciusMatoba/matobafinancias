import { useState, useMemo } from 'react';
import { Pencil, Trash2, Check, X, ChevronDown, ChevronUp } from 'lucide-react';
import { addTagToList, countTagUsage, countUntagged, normalizeText, TAG_SUGGESTIONS, TAG_LABEL_MAX } from '../../utils/tags';
import TagBatchClassifier from './TagBatchClassifier';

const btnIcon = { background: 'none', border: 'none', padding: 4, display: 'flex', cursor: 'pointer', color: 'var(--text-muted)' };

export default function TagSettings({ tags = [], transactions = [], onSaveConfig, onUpdateMany }) {
  const [batchOpen, setBatchOpen] = useState(false);
  const [novo, setNovo] = useState('');
  const [editId, setEditId] = useState(null);
  const [editText, setEditText] = useState('');
  const [confirmId, setConfirmId] = useState(null);
  const [erro, setErro] = useState('');

  const usage = useMemo(() => countTagUsage(transactions), [transactions]);
  const pending = useMemo(() => countUntagged(transactions, tags), [transactions, tags]);
  const existing = new Set(tags.map(t => normalizeText(t.label)));
  const suggestions = TAG_SUGGESTIONS.filter(s => !existing.has(normalizeText(s)));

  const save = (next) => Promise.resolve(onSaveConfig({ tags: next })).catch(() => setErro('Não foi possível salvar. Tente novamente.'));

  const add = (label) => {
    setErro('');
    const { tags: next, tag } = addTagToList(tags, label);
    if (!tag) return;
    if (next === tags) { setErro(`A tag "${tag.label}" já existe.`); return; }
    save(next);
    setNovo('');
  };

  const startEdit = (t) => { setEditId(t.id); setEditText(t.label); setConfirmId(null); setErro(''); };

  const commitEdit = () => {
    const label = editText.trim().replace(/\s+/g, ' ').slice(0, TAG_LABEL_MAX);
    if (!label) { setErro('O nome não pode ficar vazio.'); return; }
    if (tags.some(t => t.id !== editId && normalizeText(t.label) === normalizeText(label))) {
      setErro(`Já existe uma tag chamada "${label}".`);
      return;
    }
    save(tags.map(t => (t.id === editId ? { ...t, label } : t)));
    setEditId(null);
    setErro('');
  };

  const remove = (id) => {
    save(tags.filter(t => t.id !== id));
    setConfirmId(null);
  };

  // Usado pelo seletor do lote: devolve a tag na hora para já poder aplicá-la
  const createTag = (label) => {
    const { tags: next, tag } = addTagToList(tags, label);
    if (tag && next !== tags) save(next);
    return tag;
  };

  return (
    <div>
      <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
        Tags detalham suas despesas além das categorias do orçamento (ex: Mercado, Streaming, Transporte).
        Cada lançamento tem no máximo uma tag. Você também pode criar tags direto ao lançar uma despesa.
      </p>

      {tags.length === 0 ? (
        <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--text-secondary)' }}>
          Nenhuma tag criada ainda.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
          {tags.map(t => (
            <div key={t.id} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
              background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10,
            }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: t.cor, flexShrink: 0 }} />

              {editId === t.id ? (
                <>
                  <input
                    type="text" autoFocus value={editText} maxLength={TAG_LABEL_MAX}
                    onChange={e => setEditText(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { e.preventDefault(); commitEdit(); }
                      if (e.key === 'Escape') setEditId(null);
                    }}
                    style={{ flex: 1, fontSize: 13, height: 32 }}
                  />
                  <button type="button" onClick={commitEdit} style={{ ...btnIcon, color: '#10b981' }} title="Salvar"><Check size={16} /></button>
                  <button type="button" onClick={() => { setEditId(null); setErro(''); }} style={btnIcon} title="Cancelar"><X size={16} /></button>
                </>
              ) : confirmId === t.id ? (
                <>
                  <span style={{ flex: 1, fontSize: 12, color: 'var(--text-secondary)' }}>
                    Excluir <strong>{t.label}</strong>?
                    {usage[t.id] > 0 && ` ${usage[t.id]} lançamento${usage[t.id] > 1 ? 's' : ''} ficará${usage[t.id] > 1 ? 'ão' : ''} sem tag.`}
                  </span>
                  <button type="button" onClick={() => remove(t.id)}
                    style={{ ...btnIcon, color: 'var(--saida)', fontSize: 12, fontWeight: 700 }}>Excluir</button>
                  <button type="button" onClick={() => setConfirmId(null)}
                    style={{ ...btnIcon, fontSize: 12 }}>Não</button>
                </>
              ) : (
                <>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{t.label}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {usage[t.id] || 0} lançamento{(usage[t.id] || 0) === 1 ? '' : 's'}
                  </span>
                  <button type="button" onClick={() => startEdit(t)} style={btnIcon} title="Renomear"><Pencil size={14} /></button>
                  <button type="button" onClick={() => { setConfirmId(t.id); setEditId(null); setErro(''); }}
                    style={{ ...btnIcon, color: 'var(--saida)' }} title="Excluir"><Trash2 size={14} /></button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 6 }}>
        <input
          type="text" placeholder="Nova tag (ex: Mercado)" value={novo} maxLength={TAG_LABEL_MAX}
          autoComplete="off"
          onChange={e => { setNovo(e.target.value); setErro(''); }}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (novo.trim()) add(novo); } }}
          style={{ flex: 1, fontSize: 13 }}
        />
        <button type="button" disabled={!novo.trim()} onClick={() => add(novo)}
          style={{
            padding: '0 16px', borderRadius: 10, fontSize: 13, fontWeight: 600, border: 'none',
            background: novo.trim() ? 'var(--primary)' : 'var(--bg-surface)',
            color: novo.trim() ? '#fff' : 'var(--text-muted)',
          }}>
          Criar
        </button>
      </div>

      {suggestions.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Sugestões:</span>
          {suggestions.map(s => (
            <button key={s} type="button" onClick={() => add(s)}
              style={{
                padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                background: 'transparent', color: 'var(--text-secondary)', border: '1.5px solid var(--border)',
              }}>
              + {s}
            </button>
          ))}
        </div>
      )}

      {erro && <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--saida)' }}>{erro}</p>}

      {/* Classificação em lote — só aparece enquanto houver lançamentos sem tag (ou durante a sessão aberta) */}
      {onUpdateMany && (pending.untagged > 0 || batchOpen) && (
        <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
          <button
            type="button"
            onClick={() => setBatchOpen(o => !o)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
              background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.25)',
            }}
          >
            <span style={{ textAlign: 'left' }}>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                🗂️ Classificar lançamentos antigos
              </span>
              <span style={{ display: 'block', fontSize: 11, color: 'var(--text-secondary)' }}>
                {pending.untagged > 0
                  ? `${pending.untagged} sem tag — classifique por descrição, de uma vez`
                  : 'Tudo classificado'}
              </span>
            </span>
            {batchOpen ? <ChevronUp size={16} color="var(--text-muted)" /> : <ChevronDown size={16} color="var(--text-muted)" />}
          </button>
          {batchOpen && (
            <div style={{ paddingTop: 12 }}>
              <TagBatchClassifier
                tags={tags}
                transactions={transactions}
                onApply={onUpdateMany}
                onCreateTag={createTag}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
