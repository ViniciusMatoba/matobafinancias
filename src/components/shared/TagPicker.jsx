import { useState } from 'react';
import { Plus } from 'lucide-react';
import { TAG_SUGGESTIONS, TAG_LABEL_MAX, normalizeText } from '../../utils/tags';

export default function TagPicker({ tags = [], value, onChange, onCreate, compact = false }) {
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');

  const create = (label) => {
    const tag = onCreate?.(label);
    if (tag) onChange(tag.id);
    setText('');
    setAdding(false);
  };

  const existing = new Set(tags.map(t => normalizeText(t.label)));
  const suggestions = TAG_SUGGESTIONS.filter(s => !existing.has(normalizeText(s)));

  const chip = (active, cor) => ({
    padding: compact ? '4px 10px' : '6px 12px',
    borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
    border: `1.5px solid ${active ? cor : 'var(--border)'}`,
    background: active ? `${cor}26` : 'transparent',
    color: active ? cor : 'var(--text-secondary)',
  });

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {tags.map(t => (
          <button key={t.id} type="button"
            onClick={() => onChange(value === t.id ? '' : t.id)}
            style={chip(value === t.id, t.cor)}>
            {t.label}
          </button>
        ))}
        {onCreate && !adding && (
          <button type="button" onClick={() => setAdding(true)}
            style={{ ...chip(false, 'var(--primary)'), display: 'flex', alignItems: 'center', gap: 4, borderStyle: 'dashed' }}>
            <Plus size={12} /> Nova tag
          </button>
        )}
      </div>

      {tags.length === 0 && !adding && (
        <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>
          Você ainda não criou tags. Toque em "Nova tag" para começar.
        </p>
      )}

      {adding && (
        <div style={{ marginTop: 8 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              type="text" autoFocus placeholder="Nome da tag (ex: Mercado)"
              value={text} maxLength={TAG_LABEL_MAX} autoComplete="off"
              onChange={e => setText(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); if (text.trim()) create(text); }
                if (e.key === 'Escape') { setAdding(false); setText(''); }
              }}
              style={{ flex: 1, fontSize: 13 }}
            />
            <button type="button" disabled={!text.trim()} onClick={() => create(text)}
              style={{
                padding: '0 14px', borderRadius: 10, fontSize: 13, fontWeight: 600,
                background: text.trim() ? 'var(--primary)' : 'var(--bg-surface)',
                color: text.trim() ? '#fff' : 'var(--text-muted)', border: 'none',
              }}>
              Criar
            </button>
            <button type="button" onClick={() => { setAdding(false); setText(''); }}
              style={{ padding: '0 10px', borderRadius: 10, fontSize: 13, background: 'none', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
              Cancelar
            </button>
          </div>
          {suggestions.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Sugestões:</span>
              {suggestions.map(s => (
                <button key={s} type="button" onClick={() => create(s)}
                  style={{ ...chip(false, 'var(--primary)'), padding: '3px 9px', fontSize: 11 }}>
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
