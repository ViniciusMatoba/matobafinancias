import { useState } from 'react';
import { CreditCard, ChevronDown, ChevronUp } from 'lucide-react';
import { formatBRL, formatDate, todayStr, getProximoVencimento, addMonths } from '../../utils/formatters';
import { PERCENTUAL_CATEGORIES } from '../../utils/categories';

export default function CartaoFaturaCard({ cardsStats, transactions }) {
  const [expandedId, setExpandedId] = useState(null);

  if (!cardsStats?.length) return null;

  const today = todayStr();

  // Dias restantes até uma data no formato YYYY-MM-DD
  const diasAte = (dateStr) => {
    const diff = (new Date(dateStr + 'T00:00:00') - new Date(today + 'T00:00:00')) / 86400000;
    return Math.round(diff);
  };

  // Próxima data de fechamento para um cartão
  const proximoFechamento = (card) => {
    const [y, m, d] = today.split('-').map(Number);
    const diaFech = card.diaFechamento || card.diaVencimento;
    let mes = m, ano = y;
    if (d >= diaFech) { mes += 1; if (mes > 12) { mes = 1; ano += 1; } }
    const lastDay = new Date(ano, mes, 0).getDate();
    const dia = Math.min(diaFech, lastDay);
    return `${ano}-${String(mes).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {cardsStats.map(card => {
        const isExpanded = expandedId === card.id;
        const limite = card.limite || 0;
        const pctUsado = limite > 0 ? (card.faturaAtual + card.comprometidoFuturo) / limite : 0;
        const corBarra = pctUsado < 0.5 ? '#10b981' : pctUsado < 0.8 ? '#f59e0b' : '#ef4444';
        const corDisponivel = pctUsado < 0.5 ? 'var(--entrada)' : pctUsado < 0.8 ? '#f59e0b' : 'var(--saida)';

        const proximoVenc = getProximoVencimento(card, today);
        const diasVenc = diasAte(proximoVenc);
        const diasFech = diasAte(proximoFechamento(card));

        const vencLabel = diasVenc === 0 ? 'Vence HOJE' : diasVenc === 1 ? 'Vence amanhã' : `Vence em ${diasVenc}d`;
        const fechLabel = diasFech === 0 ? 'Fecha HOJE' : diasFech === 1 ? 'Fecha amanhã' : `Fecha em ${diasFech}d`;

        const urgVenc = diasVenc <= 0;
        const avVenc  = diasVenc <= 3;
        const urgFech = diasFech <= 0;
        const avFech  = diasFech <= 2;

        // Lançamentos do ciclo atual (não conferidos, dentro do intervalo (vencAnterior, proximoVenc])
        const vencAnterior = addMonths(proximoVenc, -1);
        const lançamentos = transactions.filter(
          t => t.tipo === 'cartao' && t.cartaoId === card.id && !t.conferido
            && t.dataInicio > vencAnterior && t.dataInicio <= proximoVenc
        );

        return (
          <div key={card.id} style={{
            background: 'var(--bg-card)',
            border: `1px solid var(--border)`,
            borderLeft: `4px solid ${card.cor || 'var(--primary)'}`,
            borderRadius: 14,
            overflow: 'hidden',
          }}>
            {/* ── Header clicável ── */}
            <button
              onClick={() => setExpandedId(isExpanded ? null : card.id)}
              style={{
                width: '100%', background: 'none', border: 'none',
                padding: '14px 14px 12px', cursor: 'pointer', textAlign: 'left',
              }}
            >
              {/* Linha 1: nome + badges de data */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 8,
                    background: `${card.cor || 'var(--primary)'}22`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <CreditCard size={16} color={card.cor || 'var(--primary)'} />
                  </div>
                  <div>
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                      {card.nome}
                    </p>
                    <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>
                      Fecha dia {card.diaFechamento || card.diaVencimento} · Vence dia {card.diaVencimento}
                    </p>
                  </div>
                </div>

                {/* Badges de urgência + chevron */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {(urgFech || avFech) && (
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20,
                      background: urgFech ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)',
                      color: urgFech ? '#ef4444' : '#f59e0b',
                    }}>
                      {fechLabel}
                    </span>
                  )}
                  {(urgVenc || avVenc) && (
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20,
                      background: urgVenc ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)',
                      color: urgVenc ? '#ef4444' : '#f59e0b',
                    }}>
                      {vencLabel}
                    </span>
                  )}
                  {isExpanded ? <ChevronUp size={16} color="var(--text-muted)" /> : <ChevronDown size={16} color="var(--text-muted)" />}
                </div>
              </div>

              {/* Linha 2: valores */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 8 }}>
                <div>
                  <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>Fatura aberta</p>
                  <p style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>
                    {formatBRL(card.faturaAtual)}
                  </p>
                  {card.comprometidoFuturo > 0 && (
                    <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>
                      + {formatBRL(card.comprometidoFuturo)} futuro
                    </p>
                  )}
                </div>
                {limite > 0 && (
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>Disponível</p>
                    <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: corDisponivel }}>
                      {formatBRL(card.limiteDisponivel)}
                    </p>
                    <p style={{ margin: 0, fontSize: 10, color: 'var(--text-muted)' }}>
                      de {formatBRL(limite)}
                    </p>
                  </div>
                )}
              </div>

              {/* Barra de progresso */}
              {limite > 0 && (
                <div style={{ height: 5, borderRadius: 3, background: 'var(--border)', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 3,
                    width: `${Math.min(100, pctUsado * 100).toFixed(1)}%`,
                    background: corBarra,
                    transition: 'width 0.4s ease',
                  }} />
                </div>
              )}

              {/* Indicador de lançamentos */}
              <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>
                {lançamentos.length === 0
                  ? 'Nenhum lançamento nesta fatura'
                  : `${lançamentos.length} lançamento${lançamentos.length > 1 ? 's' : ''} · toque para ver`}
              </p>
            </button>

            {/* ── Lançamentos expandidos ── */}
            {isExpanded && lançamentos.length > 0 && (
              <div style={{
                borderTop: '1px solid var(--border)',
                background: 'rgba(0,0,0,0.03)',
                padding: '10px 14px 12px',
              }}>
                {lançamentos.map(tx => {
                  const hasItens = tx.itens?.length > 0;
                  return (
                    <div key={tx.id} style={{ marginBottom: 8 }}>
                      {hasItens ? (
                        /* Fatura com itens detalhados */
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
                                padding: '5px 0',
                                borderBottom: idx < tx.itens.length - 1 ? '1px solid var(--border)' : 'none',
                              }}>
                                {cat && (
                                  <span style={{ fontSize: 14, flexShrink: 0 }}>{cat.icon}</span>
                                )}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <p style={{
                                    margin: 0, fontSize: 13, color: 'var(--text-primary)',
                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                  }}>
                                    {item.descricao || 'Item'}
                                    {item.isParcelado && (
                                      <span style={{ color: 'var(--text-muted)', fontSize: 11, marginLeft: 4 }}>
                                        {item.parcelaAtual}/{item.totalParcelas}x
                                      </span>
                                    )}
                                  </p>
                                  {item.dataCompra && (
                                    <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>
                                      {formatDate(item.dataCompra)}
                                      {cat && ` · ${cat.label}`}
                                    </p>
                                  )}
                                </div>
                                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--saida)', flexShrink: 0 }}>
                                  {formatBRL(Number(item.valor) || 0)}
                                </span>
                              </div>
                            );
                          })}
                        </>
                      ) : (
                        /* Fatura como valor único */
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: '5px 0',
                          borderBottom: '1px solid var(--border)',
                        }}>
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
                            {formatBRL(tx.valor || 0)}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Total da fatura */}
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 4,
                }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
                    Total da fatura aberta
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--saida)' }}>
                    {formatBRL(card.faturaAtual)}
                  </span>
                </div>
              </div>
            )}

            {isExpanded && lançamentos.length === 0 && (
              <div style={{
                borderTop: '1px solid var(--border)',
                padding: '14px', textAlign: 'center',
                color: 'var(--text-muted)', fontSize: 13,
              }}>
                Nenhum lançamento registrado para esta fatura
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
