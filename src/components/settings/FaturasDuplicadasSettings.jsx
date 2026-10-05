import { useMemo, useState } from 'react';
import { formatBRL } from '../../utils/formatters';
import { encontrarDuplicidades, correcaoPagamentosRedundantes } from '../../utils/faturaProjetada';

const fmtData = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(2, 4)}`;
const MAX_LISTA = 15;

const caixa = { background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' };

export default function FaturasDuplicadasSettings({ transactions = [], onUpdateMany }) {
  const [verificado, setVerificado] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState('');
  const [corrigido, setCorrigido] = useState(0);

  // Recalcula sozinho quando os lançamentos mudam (por exemplo, logo depois da correção)
  const res = useMemo(() => (verificado ? encontrarDuplicidades(transactions) : null), [verificado, transactions]);

  const corrigir = async () => {
    if (!res || busy) return;
    setBusy(true);
    setErro('');
    try {
      const updates = correcaoPagamentosRedundantes(res.pagamentosRedundantes);
      await onUpdateMany(updates);
      setCorrigido(updates.length);
      setConfirmando(false);
    } catch {
      setErro('Não foi possível salvar a correção. Verifique a conexão e tente de novo.');
    } finally {
      setBusy(false);
    }
  };

  const excedenteTotal = res ? res.parcelasEmDobro.reduce((s, p) => s + p.excedente, 0) : 0;
  const nada = res && res.parcelasEmDobro.length === 0 && res.faturasRepetidas.length === 0 && res.pagamentosRedundantes.length === 0;

  return (
    <div>
      <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
        Procura faturas de cartão em duplicidade: parcelas contadas duas vezes na Projeção, "Pagamento Fatura" que projeta
        parcelas de novo e faturas repetidas. A verificação só lê; nada é alterado sem você confirmar.
      </p>

      <button type="button" onClick={() => { setVerificado(true); setCorrigido(0); setConfirmando(false); }}
        style={{ padding: '10px 16px', borderRadius: 10, fontSize: 13, fontWeight: 600, background: 'var(--primary)', color: '#fff', border: 'none', cursor: 'pointer' }}>
        {verificado ? 'Verificar de novo' : 'Verificar agora'}
      </button>

      {corrigido > 0 && (
        <p style={{ margin: '12px 0 0', fontSize: 13, color: '#10b981', fontWeight: 600 }}>
          ✅ {corrigido} pagamento{corrigido > 1 ? 's' : ''} de fatura corrigido{corrigido > 1 ? 's' : ''}. A Projeção já foi recalculada.
        </p>
      )}

      {res && nada && (
        <p style={{ margin: '12px 0 0', fontSize: 13, color: '#10b981', fontWeight: 600 }}>✅ Nenhuma duplicidade de fatura encontrada.</p>
      )}

      {res && !nada && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
          {res.parcelasEmDobro.length > 0 && (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-primary)' }}>
              ⚠️ A Projeção está somando <strong style={{ color: 'var(--saida)' }}>{formatBRL(excedenteTotal)}</strong> a mais em{' '}
              {res.parcelasEmDobro.length} parcela{res.parcelasEmDobro.length > 1 ? 's' : ''} contada{res.parcelasEmDobro.length > 1 ? 's' : ''} em dobro.
            </p>
          )}

          {res.pagamentosRedundantes.length > 0 && (
            <div style={caixa}>
              <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                {res.pagamentosRedundantes.length} pagamento{res.pagamentosRedundantes.length > 1 ? 's' : ''} de fatura projetando parcelas de novo
              </p>
              <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                {res.pagamentosRedundantes.map(t => `${t.descricao || 'Pagamento'} (${fmtData(t.dataInicio)})`).join(' · ')}
              </p>
              <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                A correção é segura: o valor pago e a data continuam iguais; só deixa de projetar as parcelas seguintes, que a
                fatura de origem já projeta.
              </p>
              {!confirmando ? (
                <button type="button" onClick={() => setConfirmando(true)}
                  style={{ padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, background: '#10b981', color: '#fff', border: 'none', cursor: 'pointer' }}>
                  Corrigir automaticamente
                </button>
              ) : (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Corrigir {res.pagamentosRedundantes.length} lançamento{res.pagamentosRedundantes.length > 1 ? 's' : ''}?</span>
                  <button type="button" disabled={busy} onClick={corrigir}
                    style={{ padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, background: '#10b981', color: '#fff', border: 'none', cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>
                    {busy ? 'Corrigindo…' : 'Sim, corrigir'}
                  </button>
                  <button type="button" disabled={busy} onClick={() => setConfirmando(false)}
                    style={{ padding: '7px 12px', borderRadius: 8, fontSize: 12, background: 'none', color: 'var(--text-secondary)', border: '1px solid var(--border)', cursor: 'pointer' }}>
                    Cancelar
                  </button>
                </div>
              )}
            </div>
          )}

          {res.parcelasEmDobro.length > 0 && (
            <div style={caixa}>
              <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Parcelas em dobro</p>
              {res.parcelasEmDobro.slice(0, MAX_LISTA).map((p, i) => (
                <div key={i} style={{ padding: '6px 0', borderTop: i ? '1px solid var(--border)' : 'none' }}>
                  <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
                    {p.descricao} — parcela {p.parcela} <span style={{ color: 'var(--saida)' }}>(+{formatBRL(p.excedente)})</span>
                  </p>
                  <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                    {p.ocorrencias.map(o => `${fmtData(o.data)} — ${o.projetada ? 'projeção de ' : ''}${o.docDescricao}`).join('  ·  ')}
                  </p>
                </div>
              ))}
              {res.parcelasEmDobro.length > MAX_LISTA && (
                <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>… e mais {res.parcelasEmDobro.length - MAX_LISTA}.</p>
              )}
              <p style={{ margin: '10px 0 0', fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                O que não for corrigido automaticamente precisa da sua decisão: abra a fatura na lista de lançamentos e exclua ou edite a que está sobrando.
              </p>
            </div>
          )}

          {res.faturasRepetidas.length > 0 && (
            <div style={caixa}>
              <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Faturas repetidas</p>
              {res.faturasRepetidas.map((f, i) => (
                <p key={i} style={{ margin: '2px 0', fontSize: 12, color: 'var(--text-secondary)' }}>
                  {f.descricao} — {fmtData(f.data)} — {formatBRL(f.valor)}: {f.docIds.length} lançamentos idênticos
                </p>
              ))}
              <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>
                Podem ser lançamentos em duplicidade. Confira na lista e exclua a repetida, se for o caso.
              </p>
            </div>
          )}
        </div>
      )}

      {erro && <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--saida)' }}>{erro}</p>}
    </div>
  );
}
