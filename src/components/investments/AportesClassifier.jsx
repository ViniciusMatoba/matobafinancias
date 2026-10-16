import { useMemo, useState } from 'react';
import { formatBRL, todayStr } from '../../utils/formatters';
import { CLASSES_INVESTIMENTO, CLASSE_POR_ID, agruparAportes, atualizacoesDeClasse } from '../../utils/classesInvestimento';

/**
 * Reclassifica os aportes já lançados por descrição: um seletor por grupo grava a classe em todos os aportes do grupo
 * (Ações, FIIs, Caixinha / resgate imediato etc.). Só toca no campo `classeInvestimento`.
 */
export default function AportesClassifier({ transactions, onUpdateMany }) {
  const hoje = todayStr();
  const [soSemClasse, setSoSemClasse] = useState(true);
  const [salvando, setSalvando] = useState(null);
  const [aberto, setAberto] = useState(false);

  const todos = useMemo(() => agruparAportes(transactions, hoje), [transactions, hoje]);
  const grupos = useMemo(() => agruparAportes(transactions, hoje, { soSemClasse }), [transactions, hoje, soSemClasse]);
  const semClasse = useMemo(() => todos.filter(g => g.classes.includes('')).length, [todos]);

  if (!onUpdateMany || todos.length === 0) return null;

  const aplicar = async (grupo, classe) => {
    setSalvando(grupo.chave);
    try { await onUpdateMany(atualizacoesDeClasse(grupo, classe)); } finally { setSalvando(null); }
  };

  const valorAtual = (g) => (g.classes.length === 1 ? g.classes[0] : 'misto');

  return (
    <div style={{ background: 'var(--bg-surface)', borderRadius: 16, padding: 16, border: '1px solid var(--border)' }}>
      <button
        onClick={() => setAberto(a => !a)}
        style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text-primary)' }}
      >
        <span style={{ fontSize: 13, fontWeight: 700 }}>Classificar meus aportes</span>
        <span style={{ fontSize: 11, color: semClasse > 0 ? '#f59e0b' : 'var(--text-muted)' }}>
          {semClasse > 0 ? `${semClasse} grupo(s) sem classe` : 'tudo classificado'} {aberto ? '▲' : '▼'}
        </span>
      </button>

      {aberto && (
        <div style={{ marginTop: 12 }}>
          <p style={{ margin: '0 0 10px', fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            Aportes com a mesma descrição ficam juntos: escolher a classe grava em todos eles. Use "Caixinha / resgate imediato" para o que você pode resgatar na hora.
          </p>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>
            <input type="checkbox" checked={soSemClasse} onChange={e => setSoSemClasse(e.target.checked)} />
            Mostrar só os sem classe
          </label>

          {grupos.length === 0 && (
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>Nenhum aporte sem classe.</p>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {grupos.map(g => (
              <div key={g.chave} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 10, background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.descricao}</p>
                  <p style={{ margin: '2px 0 0', fontSize: 10, color: 'var(--text-muted)' }}>
                    {g.quantidade} lançamento(s) · {formatBRL(g.total)}
                    {g.classes.length === 1 && g.classes[0] ? ` · ${CLASSE_POR_ID[g.classes[0]]?.label || g.classes[0]}` : ''}
                    {g.classes.length > 1 ? ' · classes diferentes' : ''}
                  </p>
                </div>
                <select
                  value={valorAtual(g)}
                  disabled={salvando === g.chave}
                  onChange={e => e.target.value !== 'misto' && aplicar(g, e.target.value)}
                  style={{ maxWidth: 150, fontSize: 12 }}
                >
                  {valorAtual(g) === 'misto' && <option value="misto" disabled>Classes diferentes</option>}
                  <option value="">Sem classe</option>
                  {CLASSES_INVESTIMENTO.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
