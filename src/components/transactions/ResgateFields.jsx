import { useMemo, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { formatBRL, formatBRLInput, normalizeBRLInput, parseBRLInput, todayStr } from '../../utils/formatters';
import { ehResgate } from '../../utils/investido';
import { docDeResgate, opcoesDeOrigem, origemDe, origemInicial } from '../../utils/classesInvestimento';

/**
 * Formulário do tipo "Resgate": dinheiro que volta do investimento para a conta. Grava uma ENTRADA marcada
 * `resgate: true` (ver docDeResgate). Substitui o resto do formulário de lançamento (sem categoria, tag nem frequência).
 */
export default function ResgateFields({ seletorTipo, initial, transactions, goals, config, valorInicial, dataInicial, onSave, onCancel, cor, corFundo }) {
  const hoje = todayStr();
  const reservaGoalId = config?.investimentos?.reservaGoalId || null;
  const editando = !!initial?.id && ehResgate(initial);

  const [valor, setValor] = useState(valorInicial || '');
  const [data, setData] = useState(dataInicial || hoje);
  const [descricao, setDescricao] = useState(editando ? (initial.descricao || '') : '');
  const [conferido, setConferido] = useState(editando ? !!initial.conferido : null); // null = automático (data <= hoje)
  const [erro, setErro] = useState('');

  const opcoes = useMemo(
    () => opcoesDeOrigem({ transactions, ate: data || hoje, reservaGoalId, goals, ignorarId: editando ? initial.id : null }),
    [transactions, data, hoje, reservaGoalId, goals, editando, initial]
  );
  const [origem, setOrigem] = useState(() => (editando ? origemDe(initial, reservaGoalId) : origemInicial(opcoes)));

  const valorNum = parseBRLInput(valor);
  const disponivel = opcoes.find(o => o.id === origem)?.disponivel ?? 0;
  const excede = valorNum > 0 && valorNum > disponivel + 0.001;
  const conferidoFinal = conferido === null ? (data || hoje) <= hoje : conferido;

  const salvar = (e) => {
    e.preventDefault();
    if (!valorNum || isNaN(valorNum) || valorNum <= 0) { setErro('Informe o valor do resgate.'); return; }
    if (!data) { setErro('Informe a data do resgate.'); return; }
    onSave(docDeResgate({ valor: valorNum, data, hoje, origem, reservaGoalId, descricao, conferido: conferidoFinal }));
  };

  const rotulo = { fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' };

  return (
    <form onSubmit={salvar} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {seletorTipo}

      <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
        Dinheiro que volta do investimento para a conta. Entra no saldo, diminui o total investido e não conta como receita.
      </p>

      <div>
        <label style={rotulo}>Resgatar de</label>
        <select value={origem} onChange={e => setOrigem(e.target.value)}>
          {opcoes.map(o => (
            <option key={o.id} value={o.id}>{o.label} · {formatBRL(o.disponivel)}</option>
          ))}
        </select>
      </div>

      <div>
        <label style={rotulo}>Valor</label>
        <input
          type="text" inputMode="decimal" placeholder="0,00" value={valor}
          onChange={e => setValor(formatBRLInput(e.target.value))}
          onBlur={e => setValor(normalizeBRLInput(e.target.value))}
          required style={{ fontSize: 22, fontWeight: 600, color: cor, letterSpacing: 0.5 }}
        />
        {excede && (
          <p style={{ margin: '6px 0 0', fontSize: 11, color: '#f59e0b' }}>
            Há {formatBRL(disponivel)} investidos nesta origem até a data. Você pode salvar assim mesmo (por exemplo, se o aporte nunca foi lançado).
          </p>
        )}
      </div>

      <div>
        <label style={rotulo}>Data</label>
        <input type="date" value={data} onChange={e => setData(e.target.value)} required style={{ colorScheme: 'dark' }} />
      </div>

      <div>
        <label style={rotulo}>Descrição <span style={{ color: 'var(--text-muted)' }}>(opcional)</span></label>
        <input type="text" placeholder="Resgate de …" value={descricao} onChange={e => setDescricao(e.target.value)} />
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
        <input type="checkbox" checked={conferidoFinal} onChange={e => setConferido(e.target.checked)} />
        Já caiu na conta
      </label>

      {erro && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 10, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
          <AlertCircle size={15} color="var(--saida)" />
          <span style={{ fontSize: 13, color: 'var(--saida)', fontWeight: 500 }}>{erro}</span>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
        <button type="button" onClick={onCancel} style={{ flex: 1, padding: '14px', borderRadius: 12, fontSize: 15, fontWeight: 500, background: 'var(--bg-card)', color: 'var(--text-secondary)' }}>
          Cancelar
        </button>
        <button type="submit" style={{ flex: 2, padding: '14px', borderRadius: 12, fontSize: 15, fontWeight: 600, background: cor, color: '#fff', boxShadow: `0 4px 16px ${corFundo}`, cursor: 'pointer' }}>
          {editando ? 'Salvar alterações' : 'Registrar resgate'}
        </button>
      </div>
    </form>
  );
}

