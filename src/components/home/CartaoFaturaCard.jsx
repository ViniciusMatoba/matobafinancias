import { useState } from 'react';
import { CreditCard, ChevronDown, ChevronUp, Plus, X } from 'lucide-react';
import { formatBRL, formatDate, todayStr, addMonths, getProximoVencimento } from '../../utils/formatters';
import { expandOccurrences } from '../../utils/projectionCalc';
import { PERCENTUAL_CATEGORIES } from '../../utils/categories';
import { useAppState } from '../../context/AppContext';

export default function CartaoFaturaCard({ cardsStats, transactions, onVerHistorico, hideValues = false }) {
  const { add, update, showToast } = useAppState();
  const [expandedId, setExpandedId] = useState(null);
  const [quickAddCard, setQuickAddCard] = useState(null);
  const [formData, setFormData] = useState({
    valor: '',
    descricao: '',
    categoria: 'prazeres',
    dataCompra: todayStr(),
    isParcelado: false,
    totalParcelas: '2'
  });

  const fmtVal = (n) => hideValues ? '•••' : formatBRL(n);

  const parseBRLInput = (val) => {
    if (!val) return 0;
    const clean = String(val).replace(/[^\d]/g, '');
    return parseFloat(clean) / 100 || 0;
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const formatInputBRL = (rawVal) => {
    const clean = String(rawVal).replace(/[^\d]/g, '');
    if (!clean) return '';
    const number = parseFloat(clean) / 100;
    return number.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const handleQuickAddSubmit = async (e) => {
    e.preventDefault();
    if (!quickAddCard) return;

    const value = parseBRLInput(formData.valor);
    if (value <= 0) {
      alert("Por favor, insira um valor válido.");
      return;
    }

    const desc = formData.descricao.trim();
    if (!desc) {
      alert("Por favor, insira uma descrição.");
      return;
    }

    const card = quickAddCard;
    setQuickAddCard(null);

    try {
      const proximoVenc = getProximoVencimento(card, formData.dataCompra);

      if (formData.isParcelado) {
        const total = parseInt(formData.totalParcelas) || 2;
        const valuePerParcel = Number((value / total).toFixed(2));

        for (let p = 1; p <= total; p++) {
          const vencDate = addMonths(proximoVenc, p - 1);
          const newItem = {
            descricao: `${desc} ${p}/${total}`,
            valor: valuePerParcel,
            categoria: formData.categoria,
            dataCompra: formData.dataCompra,
            isParcelado: true,
            parcelaAtual: p,
            totalParcelas: total,
            conferido: false
          };

          const matchInvoice = transactions.find(
            t => t.tipo === 'cartao' && t.cartaoId === card.id && t.dataInicio === vencDate
          );

          if (matchInvoice) {
            const currentItens = Array.isArray(matchInvoice.itens) ? matchInvoice.itens : [];
            const updatedItens = [...currentItens, newItem];
            const newTotal = updatedItens.reduce((sum, item) => sum + (Number(item.valor) || 0), 0);
            await update(matchInvoice.id, {
              itens: updatedItens,
              valor: newTotal
            });
          } else {
            await add({
              tipo: 'cartao',
              frequencia: 'unico',
              descricao: `Fatura - ${card.nome}`,
              valor: valuePerParcel,
              dataInicio: vencDate,
              categoria: null,
              dataFim: null,
              itens: [newItem],
              cartaoId: card.id,
              conferido: false
            });
          }
        }
        showToast('✅ Despesa parcelada cadastrada com sucesso!');
      } else {
        // Gasto único (1x)
        const newItem = {
          descricao: desc,
          valor: value,
          categoria: formData.categoria,
          dataCompra: formData.dataCompra,
          isParcelado: false,
          conferido: false
        };

        const matchInvoice = transactions.find(
          t => t.tipo === 'cartao' && t.cartaoId === card.id && t.dataInicio === proximoVenc
        );

        if (matchInvoice) {
          const currentItens = Array.isArray(matchInvoice.itens) ? matchInvoice.itens : [];
          const updatedItens = [...currentItens, newItem];
          const newTotal = updatedItens.reduce((sum, item) => sum + (Number(item.valor) || 0), 0);
          await update(matchInvoice.id, {
            itens: updatedItens,
            valor: newTotal
          });
        } else {
          await add({
            tipo: 'cartao',
            frequencia: 'unico',
            descricao: `Fatura - ${card.nome}`,
            valor: value,
            dataInicio: proximoVenc,
            categoria: null,
            dataFim: null,
            itens: [newItem],
            cartaoId: card.id,
            conferido: false
          });
        }
        showToast('✅ Gasto cadastrado no cartão!');
      }
    } catch (err) {
      console.error('[QuickAddExpense]', err);
      showToast('❌ Erro ao salvar gasto no cartão.', 'error');
    }
  };

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

        // proximoVenc vem de calcFaturaCard (já resolvido: overdue ou próximo ciclo)
        const proximoVenc = card.proximoVenc;
        const diasVenc = diasAte(proximoVenc);
        const diasFech = diasAte(proximoFechamento(card));

        const vencLabel = diasVenc < 0 ? `Venceu há ${Math.abs(diasVenc)}d` : diasVenc === 0 ? 'Vence HOJE' : diasVenc === 1 ? 'Vence amanhã' : `Vence em ${diasVenc}d`;
        const fechLabel = diasFech === 0 ? 'Fecha HOJE' : diasFech === 1 ? 'Fecha amanhã' : `Fecha em ${diasFech}d`;

        const urgVenc = diasVenc <= 0;
        const avVenc  = diasVenc <= 3;
        const urgFech = diasFech <= 0;
        const avFech  = diasFech <= 2;

        // Lançamentos da fatura aberta — mesma lógica da Projeção: expandOccurrences no vencimento exato
        const cardTxs = transactions.filter(t => t.tipo === 'cartao' && t.cartaoId === card.id);
        const lançamentos = cardTxs
          .flatMap(t => expandOccurrences(t, proximoVenc, proximoVenc))
          .filter(o => !o.tx.conferido)
          .map(o => ({ ...o.tx, dataInicio: o.date }));
        const isVirtual = false;

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
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      setQuickAddCard(card);
                      setFormData({
                        valor: '',
                        descricao: '',
                        categoria: 'prazeres',
                        dataCompra: todayStr(),
                        isParcelado: false,
                        totalParcelas: '2'
                      });
                    }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)',
                      borderRadius: 8, padding: '4px 8px', fontSize: 10, fontWeight: 700,
                      color: 'var(--entrada)', cursor: 'pointer', transition: 'all 0.2s', marginRight: 4
                    }}
                  >
                    <Plus size={12} /> Gasto
                  </button>
                  {onVerHistorico && (
                    <button
                      onClick={e => { e.stopPropagation(); onVerHistorico(card); }}
                      style={{
                        background: 'var(--bg-surface)', border: '1px solid var(--border)',
                        borderRadius: 6, padding: '2px 8px', fontSize: 10, fontWeight: 600,
                        color: 'var(--text-secondary)', cursor: 'pointer',
                      }}
                    >
                      Histórico
                    </button>
                  )}
                  {isExpanded ? <ChevronUp size={16} color="var(--text-muted)" /> : <ChevronDown size={16} color="var(--text-muted)" />}
                </div>
              </div>

              {/* Linha 2: valores */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 8 }}>
                <div>
                  <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>Fatura aberta</p>
                  <p style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>
                    {fmtVal(card.faturaAtual)}
                  </p>
                  {card.comprometidoFuturo > 0 && (
                    <div style={{ marginTop: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>
                        + {fmtVal(card.comprometidoFuturo)} futuro
                      </p>
                      {card.parcelasFuturasDetalhadas?.length > 0 && (
                        <p style={{ margin: 0, fontSize: 10, color: 'var(--text-muted)', opacity: 0.85, whiteSpace: 'pre-wrap', lineHeight: 1.2 }}>
                          {card.parcelasFuturasDetalhadas.map(p => {
                            const [, m, d] = p.vencimento.split('-');
                            const mesAbr = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][parseInt(m,10)-1];
                            return `${mesAbr}: ${fmtVal(p.valor)}`;
                          }).join(' · ')}
                        </p>
                      )}
                    </div>
                  )}
                </div>
                {limite > 0 && (
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>Disponível</p>
                    <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: corDisponivel }}>
                      {fmtVal(card.limiteDisponivel)}
                    </p>
                    <p style={{ margin: 0, fontSize: 10, color: 'var(--text-muted)' }}>
                      de {fmtVal(limite)}
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
                  : isVirtual
                    ? `${lançamentos.length} parcela${lançamentos.length > 1 ? 's' : ''} projetada${lançamentos.length > 1 ? 's' : ''} · toque para ver`
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
                {isVirtual && (
                  <p style={{
                    margin: '0 0 8px', fontSize: 11, color: 'var(--cartao)',
                    fontWeight: 600, fontStyle: 'italic',
                  }}>
                    Parcelas projetadas — nenhum lançamento cadastrado para este ciclo
                  </p>
                )}
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
                                    {(item.isParcelado || (item.parcelaAtual && item.totalParcelas)) && (
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
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                                  {item.conferido && <span style={{ fontSize: 11, color: '#10b981', fontWeight: 700 }}>✓</span>}
                                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--saida)' }}>
                                    {fmtVal(Number(item.valor) || 0)}
                                  </span>
                                </div>
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
                            {fmtVal(tx.valor || 0)}
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
                    {fmtVal(card.faturaAtual)}
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

      {/* ── Modal de Adição Rápida ── */}
      {quickAddCard && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100,
          background: 'rgba(5, 5, 10, 0.85)', backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
        }}>
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 16, width: '100%', maxWidth: 360, overflow: 'hidden',
            boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
          }}>
            {/* Header do Modal */}
            <div style={{
              padding: '14px 16px', background: 'var(--bg-surface)',
              borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between'
            }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                Novo Gasto no {quickAddCard.nome}
              </p>
              <button
                type="button"
                onClick={() => setQuickAddCard(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Corpo do Modal */}
            <form onSubmit={handleQuickAddSubmit} style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              
              {/* Campo Valor */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                  Valor (R$)
                </label>
                <input
                  type="text"
                  placeholder="0,00"
                  required
                  value={formData.valor}
                  onChange={e => handleInputChange('valor', formatInputBRL(e.target.value))}
                  style={{
                    background: 'var(--bg-surface)', border: '1px solid var(--border)',
                    borderRadius: 10, padding: '10px 12px', fontSize: 15, color: 'var(--text-primary)',
                    width: '100%', outline: 'none'
                  }}
                />
              </div>

              {/* Campo Descrição */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                  Descrição
                </label>
                <input
                  type="text"
                  placeholder="Ex: Uber, Supermercado..."
                  required
                  value={formData.descricao}
                  onChange={e => handleInputChange('descricao', e.target.value)}
                  style={{
                    background: 'var(--bg-surface)', border: '1px solid var(--border)',
                    borderRadius: 10, padding: '10px 12px', fontSize: 14, color: 'var(--text-primary)',
                    width: '100%', outline: 'none'
                  }}
                />
              </div>

              {/* Campo Categoria */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                  Categoria (Divisão Percentual)
                </label>
                <select
                  value={formData.categoria}
                  onChange={e => handleInputChange('categoria', e.target.value)}
                  style={{
                    background: 'var(--bg-surface)', border: '1px solid var(--border)',
                    borderRadius: 10, padding: '10px 12px', fontSize: 14, color: 'var(--text-primary)',
                    width: '100%', outline: 'none'
                  }}
                >
                  {Object.entries(PERCENTUAL_CATEGORIES).map(([id, cat]) => (
                    <option key={id} value={id}>
                      {cat.icon} {cat.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Campo Data de Compra */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                  Data da Compra
                </label>
                <input
                  type="date"
                  required
                  value={formData.dataCompra}
                  onChange={e => handleInputChange('dataCompra', e.target.value)}
                  style={{
                    background: 'var(--bg-surface)', border: '1px solid var(--border)',
                    borderRadius: 10, padding: '10px 12px', fontSize: 13, color: 'var(--text-primary)',
                    width: '100%', outline: 'none', colorScheme: 'dark'
                  }}
                />
              </div>

              {/* Toggle Parcelado */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
                  Compra Parcelada?
                </span>
                <button
                  type="button"
                  onClick={() => handleInputChange('isParcelado', !formData.isParcelado)}
                  style={{
                    width: 36, height: 20, borderRadius: 10, border: 'none',
                    background: formData.isParcelado ? 'var(--primary)' : 'var(--border)',
                    position: 'relative', cursor: 'pointer', transition: 'background 0.2s'
                  }}
                >
                  <span style={{
                    position: 'absolute', top: 2,
                    left: formData.isParcelado ? 18 : 2,
                    width: 16, height: 16, borderRadius: '50%',
                    background: '#fff', transition: 'left 0.2s'
                  }} />
                </button>
              </div>

              {/* Campo Qtde Parcelas */}
              {formData.isParcelado && (
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                    Quantidade de Parcelas
                  </label>
                  <input
                    type="number"
                    min="2"
                    max="72"
                    required
                    value={formData.totalParcelas}
                    onChange={e => handleInputChange('totalParcelas', e.target.value)}
                    style={{
                      background: 'var(--bg-surface)', border: '1px solid var(--border)',
                      borderRadius: 10, padding: '10px 12px', fontSize: 14, color: 'var(--text-primary)',
                      width: '100%', outline: 'none'
                    }}
                  />
                </div>
              )}

              {/* Ações */}
              <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                <button
                  type="button"
                  onClick={() => setQuickAddCard(null)}
                  style={{
                    flex: 1, padding: '12px', borderRadius: 10,
                    background: 'var(--bg-surface)', border: '1px solid var(--border)',
                    color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer'
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  style={{
                    flex: 1, padding: '12px', borderRadius: 10,
                    background: 'var(--primary)', color: '#fff', border: 'none',
                    fontSize: 13, fontWeight: 700, cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(99,102,241,0.2)'
                  }}
                >
                  Salvar Gasto
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
