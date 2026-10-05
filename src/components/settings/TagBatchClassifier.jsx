import { useMemo, useState } from 'react';
import { Undo2 } from 'lucide-react';
import TagPicker from '../shared/TagPicker';
import { formatBRL, todayStr } from '../../utils/formatters';
import { buildTagUpdates, buildTaggedIndex, buildUntaggedGroups, countUntagged, suggestTag } from '../../utils/tags';

const MAX_HISTORY = 20;

export default function TagBatchClassifier({ tags, transactions, onApply, onCreateTag }) {
  const [skipped, setSkipped] = useState(() => new Set());
  const [history, setHistory] = useState([]);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState('');

  const today = todayStr();
  const progress = useMemo(() => countUntagged(transactions, tags), [transactions, tags]);
  const groups = useMemo(() => buildUntaggedGroups(transactions, tags, today), [transactions, tags, today]);
  const taggedIndex = useMemo(() => buildTaggedIndex(transactions, tags), [transactions, tags]);

  const visible = groups.filter(g => !skipped.has(g.key));
  const current = visible[0] || null;
  const suggestion = useMemo(() => suggestTag(current, taggedIndex), [current, taggedIndex]);
  const tagById = useMemo(() => Object.fromEntries(tags.map(t => [t.id, t])), [tags]);

  const classified = progress.total - progress.untagged;
  const pct = progress.total > 0 ? Math.round((classified / progress.total) * 100) : 100;

  const run = async (updates) => {
    setBusy(true);
    setErro('');
    try {
      await onApply(updates);
      return true;
    } catch {
      setErro('Não foi possível salvar. Verifique a conexão e tente novamente.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const apply = async (tagId) => {
    if (!current || busy || !tagId) return;
    const { updates, undo } = buildTagUpdates(transactions, current.key, tagId, tags);
    if (updates.length === 0) return;
    const ok = await run(updates);
    if (ok) setHistory(h => [...h.slice(-(MAX_HISTORY - 1)), { label: current.label, undo }]);
  };

  const undoLast = async () => {
    const last = history[history.length - 1];
    if (!last || busy) return;
    const ok = await run(last.undo);
    if (ok) setHistory(h => h.slice(0, -1));
  };

  const skip = () => current && setSkipped(prev => new Set(prev).add(current.key));

  const lastUndo = history[history.length - 1];

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
          <span>{pct}% classificado</span>
          <span>{progress.untagged} sem tag</span>
        </div>
        <div style={{ height: 6, borderRadius: 3, background: 'var(--bg-surface)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: '#10b981', transition: 'width 0.3s' }} />
        </div>
      </div>

      {current ? (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
          <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', wordBreak: 'break-word' }}>
            {current.label}
          </p>
          <p style={{ margin: '4px 0 12px', fontSize: 12, color: 'var(--text-muted)' }}>
            {current.count} lançamento{current.count > 1 ? 's' : ''}
            {current.recorrente ? ' (inclui recorrente)' : ''} · {formatBRL(current.total)}
          </p>

          {suggestion && tagById[suggestion.tag] && (
            <button type="button" disabled={busy} onClick={() => apply(suggestion.tag)}
              style={{
                width: '100%', textAlign: 'left', marginBottom: 12, padding: '8px 10px', borderRadius: 10,
                background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.25)',
                color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer',
              }}>
              💡 {suggestion.exata ? 'Já classificado antes como' : `Parecido com "${suggestion.label}":`}{' '}
              <strong style={{ color: tagById[suggestion.tag].cor }}>{tagById[suggestion.tag].label}</strong>
              {' '}— toque para aplicar
            </button>
          )}

          <p style={{ margin: '0 0 6px', fontSize: 11, color: 'var(--text-muted)' }}>
            Toque numa tag para aplicar a todos os {current.count}:
          </p>
          <div style={{ opacity: busy ? 0.5 : 1, pointerEvents: busy ? 'none' : 'auto' }}>
            <TagPicker tags={tags} value="" onChange={apply} onCreate={onCreateTag} />
          </div>

          <button type="button" onClick={skip} disabled={busy}
            style={{
              marginTop: 12, padding: '8px 14px', borderRadius: 10, fontSize: 12, fontWeight: 600,
              background: 'none', border: '1px solid var(--border)', color: 'var(--text-secondary)', cursor: 'pointer',
            }}>
            Pular por enquanto
          </button>
        </div>
      ) : groups.length > 0 ? (
        <div style={{ textAlign: 'center', padding: '10px 0' }}>
          <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--text-secondary)' }}>
            Você pulou {skipped.size} descrição{skipped.size > 1 ? 'ões' : ''}.
          </p>
          <button type="button" onClick={() => setSkipped(new Set())}
            style={{ padding: '8px 14px', borderRadius: 10, fontSize: 12, fontWeight: 600, background: 'var(--primary)', color: '#fff', border: 'none', cursor: 'pointer' }}>
            Rever as puladas
          </button>
        </div>
      ) : (
        <p style={{ margin: 0, textAlign: 'center', fontSize: 14, fontWeight: 600, color: '#10b981', padding: '10px 0' }}>
          🎉 Tudo classificado!
        </p>
      )}

      {visible.length > 1 && (
        <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>
          Faltam {visible.length - 1} descrição{visible.length - 1 > 1 ? 'ões' : ''} depois desta (das que mais pesaram primeiro)
        </p>
      )}

      {lastUndo && (
        <button type="button" onClick={undoLast} disabled={busy}
          style={{
            marginTop: 12, display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 10,
            background: 'none', border: '1px solid var(--border)', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer',
          }}>
          <Undo2 size={13} /> Desfazer "{lastUndo.label}"
        </button>
      )}

      {erro && <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--saida)' }}>{erro}</p>}
    </div>
  );
}
