import Modal from '../shared/Modal';
import { formatBRL, formatDate } from '../../utils/formatters';
import { PERCENTUAL_CATEGORIES } from '../../utils/categories';

const MONTH_NAMES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

function formatMes(yyyymm) {
  const [y, m] = yyyymm.split('-');
  return `${MONTH_NAMES[parseInt(m, 10) - 1]}/${y}`;
}

export default function FaturaHistoricoModal({ card, transactions, open, onClose }) {
  if (!card) return null;

  // Faturas pagas (conferido === true) deste cartão
  const pagas = transactions
    .filter(t => t.tipo === 'cartao' && t.cartaoId === card.id && t.conferido)
    .sort((a, b) => b.dataInicio.localeCompare(a.dataInicio));

  // Agrupa por mês (YYYY-MM)
  const grupos = {};
  pagas.forEach(tx => {
    const mes = tx.dataInicio.slice(0, 7);
    if (!grupos[mes]) grupos[mes] = [];
    grupos[mes].push(tx);
  });
  const meses = Object.keys(grupos).sort((a, b) => b.localeCompare(a));

  return (
    <Modal open={open} onClose={onClose} title={`Histórico — ${card.nome}`}>
      {meses.length === 0 ? (
        <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 14, padding: '24px 0' }}>
          Nenhuma fatura paga registrada para este cartão.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {meses.map(mes => {
            const txs = grupos[mes];
            const total = txs.reduce((sum, tx) => {
              if (tx.itens?.length > 0) return sum + tx.itens.reduce((s, it) => s + (Number(it.valor) || 0), 0);
              return sum + (Number(tx.valor) || 0);
            }, 0);

            return (
              <div key={mes}>
                {/* Cabeçalho do mês */}
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  marginBottom: 8, paddingBottom: 6, borderBottom: '1px solid var(--border)',
                }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)' }}>
                    {formatMes(mes)}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--saida)' }}>
                    {formatBRL(total)}
                  </span>
                </div>

                {/* Transações do mês */}
                {txs.map(tx => {
                  const hasItens = tx.itens?.length > 0;
                  return (
                    <div key={tx.id} style={{ marginBottom: 10 }}>
                      {hasItens ? (
                        <>
                          <p style={{
                            margin: '0 0 4px', fontSize: 11, fontWeight: 700,
                            color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4,
                          }}>
                            {tx.descricao || 'Fatura'} · {formatDate(tx.dataInicio)}
                          </p>
                          {tx.itens.map((item, idx) => {
                            const cat = item.categoria ? PERCENTUAL_CATEGORIES[item.categoria] : null;
                            return (
                              <div key={idx} style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                padding: '4px 0',
                                borderBottom: idx < tx.itens.length - 1 ? '1px solid var(--border)' : 'none',
                              }}>
                                {cat && <span style={{ fontSize: 13, flexShrink: 0 }}>{cat.icon}</span>}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <p style={{
                                    margin: 0, fontSize: 13, color: 'var(--text-primary)',
                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                  }}>
                                    {item.descricao || 'Item'}
                                    {(item.isParcelado || (item.parcelaAtual && item.totalParcelas)) && (
                                      <span style={{ color: 'var(--text-muted)', fontSize: 11, marginLeft: 4 }}>
                                        {item.parcelaAtual}/{item.totalParcelas}x
                                      </span>
                                    )}
                                  </p>
                                  {item.dataCompra && (
                                    <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>
                                      {formatDate(item.dataCompra)}{cat ? ` · ${cat.label}` : ''}
                                    </p>
                                  )}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                                  {item.conferido && <span style={{ fontSize: 10, color: '#10b981', fontWeight: 700 }}>✓</span>}
                                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--saida)' }}>
                                    {formatBRL(Number(item.valor) || 0)}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                          <span style={{ fontSize: 14, flexShrink: 0 }}>💳</span>
                          <div style={{ flex: 1 }}>
                            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-primary)' }}>
                              {tx.descricao || 'Fatura'}
                            </p>
                            <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>
                              {formatDate(tx.dataInicio)}
                            </p>
                          </div>
                          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--saida)', flexShrink: 0 }}>
                            {formatBRL(Number(tx.valor) || 0)}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
