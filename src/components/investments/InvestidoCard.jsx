import { useMemo, useState } from 'react';
import { formatBRL, formatBRLInput, normalizeBRLInput, parseBRLInput, todayStr } from '../../utils/formatters';
import { docAjusteValor, valoresDoInvestido } from '../../utils/classesInvestimento';
import { ehAjuste } from '../../utils/investido';

/**
 * "Minhas caixinhas e investimentos": cada caixinha (com o mesmo saldo da tela Metas) e cada classe sem caixinha, com
 * o botão "Atualizar valor". Você informa quanto vale HOJE e o app guarda a diferença como rendimento (ou perda), sem
 * mexer na conta corrente. O histórico das atualizações aparece embaixo, com "Desfazer".
 */
export default function InvestidoCard({ transactions, goals, reservaGoalId, onAdd, onRemove }) {
  const hoje = todayStr();
  const [editando, setEditando] = useState(null); // chave da linha em edição: 'caixinha:<id>' | 'classe:<id>'
  const [valor, setValor] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [verHistorico, setVerHistorico] = useState(false);

  const v = useMemo(
    () => valoresDoInvestido({ transactions, goals, hoje, reservaGoalId }),
    [transactions, goals, hoje, reservaGoalId]
  );
  const historico = useMemo(
    () => (transactions || []).filter(ehAjuste).sort((a, b) => (b.dataInicio || '').localeCompare(a.dataInicio || '')),
    [transactions]
  );

  if (!v.caixinhas.length && !v.classes.length) return null;

  const abrir = (chave, atual) => { setEditando(chave); setValor(formatBRL(atual).replace(/[^\d,.-]/g, '').trim()); };
  const salvar = async (linha) => {
    const real = parseBRLInput(valor);
    if (isNaN(real)) return;
    const doc = docAjusteValor({ alvo: linha.alvo, nome: linha.nome, atual: linha.valor, real, data: hoje });
    if (doc && onAdd) {
      setSalvando(true);
      try { await onAdd(doc); } finally { setSalvando(false); }
    }
    setEditando(null);
  };

  const linhas = [
    ...v.caixinhas.map(c => ({ chave: `caixinha:${c.id}`, alvo: { tipo: 'caixinha', id: c.id }, nome: c.nome, valor: c.valor, reserva: c.reserva, sub: 'Caixinha' })),
    ...v.classes.map(c => ({ chave: `classe:${c.id}`, alvo: { tipo: 'classe', id: c.id }, nome: c.label, valor: c.valor, reserva: false, sub: 'Investimento' })),
  ];

  return (
    <div style={{ background: 'var(--bg-surface)', borderRadius: 16, padding: 16, border: '1px solid var(--border)' }}>
      <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Minhas caixinhas e investimentos</p>
      <p style={{ margin: '0 0 12px', fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
        O valor vem dos seus aportes e resgates. Para incluir o rendimento, toque em "Atualizar valor" e informe quanto vale hoje.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {linhas.map(l => (
          <div key={l.chave} style={{ padding: '10px 12px', borderRadius: 12, background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {l.reserva ? '🛡️ ' : ''}{l.nome}
                </p>
                <p style={{ margin: '2px 0 0', fontSize: 10, color: 'var(--text-muted)' }}>{l.reserva ? 'Reserva de emergência' : l.sub}</p>
              </div>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--investimento)', whiteSpace: 'nowrap' }}>{formatBRL(l.valor)}</span>
              {editando !== l.chave && onAdd && (
                <button type="button" onClick={() => abrir(l.chave, l.valor)} style={{ fontSize: 11, fontWeight: 600, padding: '6px 10px', borderRadius: 8, background: 'transparent', color: 'var(--primary)', border: '1px solid var(--primary)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  Atualizar valor
                </button>
              )}
            </div>

            {editando === l.chave && (
              <div style={{ marginTop: 10 }}>
                <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Quanto vale hoje (R$)</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="text" inputMode="decimal" placeholder="0,00" value={valor} autoFocus
                    onChange={e => setValor(formatBRLInput(e.target.value))}
                    onBlur={e => setValor(normalizeBRLInput(e.target.value))}
                    style={{ flex: 1, fontSize: 16, fontWeight: 600 }}
                  />
                  <button type="button" disabled={salvando} onClick={() => salvar(l)} style={{ padding: '8px 14px', borderRadius: 10, fontSize: 12, fontWeight: 700, background: 'var(--primary)', color: '#fff', border: 'none', cursor: 'pointer', opacity: salvando ? 0.6 : 1 }}>
                    Salvar
                  </button>
                  <button type="button" onClick={() => setEditando(null)} style={{ padding: '8px 12px', borderRadius: 10, fontSize: 12, background: 'var(--bg-surface)', color: 'var(--text-secondary)', border: '1px solid var(--border)', cursor: 'pointer' }}>
                    Cancelar
                  </button>
                </div>
                {(() => {
                  const dif = Math.round((parseBRLInput(valor) - l.valor) * 100) / 100;
                  if (!valor || isNaN(dif) || Math.abs(dif) < 0.005) return null;
                  return (
                    <p style={{ margin: '6px 0 0', fontSize: 11, color: dif > 0 ? 'var(--entrada)' : 'var(--saida)' }}>
                      {dif > 0 ? `Rendimento de ${formatBRL(dif)}` : `Diferença de ${formatBRL(-dif)} para menos`} — não altera sua conta corrente.
                    </p>
                  );
                })()}
              </div>
            )}
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Total investido</span>
        <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--investimento)' }}>{formatBRL(v.total)}</span>
      </div>

      {historico.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <button type="button" onClick={() => setVerHistorico(h => !h)} style={{ background: 'none', border: 'none', padding: 0, fontSize: 11, color: 'var(--text-muted)', cursor: 'pointer' }}>
            {verHistorico ? '▲' : '▼'} Atualizações de valor ({historico.length})
          </button>
          {verHistorico && (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {historico.map(a => (
                <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--text-secondary)' }}>
                  <span style={{ whiteSpace: 'nowrap' }}>{(a.dataInicio || '').split('-').reverse().join('/')}</span>
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{(a.descricao || '').replace('Atualização de valor — ', '')}</span>
                  <strong style={{ color: a.valor >= 0 ? 'var(--entrada)' : 'var(--saida)' }}>{a.valor >= 0 ? '+' : '−'}{formatBRL(Math.abs(a.valor))}</strong>
                  {onRemove && (
                    <button type="button" onClick={() => onRemove(a.id)} style={{ background: 'none', border: 'none', color: 'var(--saida)', fontSize: 11, cursor: 'pointer' }}>Desfazer</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
