import { useState } from 'react';
import { ChevronRight, RotateCcw, DollarSign, CheckCircle } from 'lucide-react';
import { formatBRL, formatBRLInput, normalizeBRLInput, parseBRLInput } from '../../utils/formatters';
import { PERCENTUAL_CATEGORIES, CATEGORY_ORDER, DEFAULT_BUDGET_PCTS } from '../../utils/categories';

const STEPS = ['renda', 'categorias', 'confirmar'];

export default function SetupGoalsScreen({ onSave }) {
  const [step, setStep] = useState(0);
  const [renda, setRenda] = useState('');
  const [pcts, setPcts] = useState({ ...DEFAULT_BUDGET_PCTS });

  const rendaNum = parseBRLInput(renda);
  const totalPct = Object.values(pcts).reduce((s, v) => s + Number(v), 0);
  const excede = totalPct > 100;

  const handlePctChange = (id, val) => {
    const n = Math.max(0, Math.min(100, parseInt(val) || 0));
    setPcts(p => ({ ...p, [id]: n }));
  };

  const resetPercentual = () => setPcts({ ...DEFAULT_BUDGET_PCTS });

  const handleFinish = () => {
    onSave({
      rendaMensal: rendaNum,
      budgetPcts: { ...pcts },
      onboardingDone: true,
    });
  };

  return (
    <div style={{
      minHeight: '100dvh', overflowY: 'auto',
      background: 'linear-gradient(160deg, #0f172a 0%, #0a0f1e 100%)',
    }}>
      {/* Header fixo */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        background: 'rgba(10,15,30,0.95)', backdropFilter: 'blur(8px)',
        borderBottom: '1px solid var(--border)',
        padding: '16px 20px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 10,
            background: 'linear-gradient(135deg, #6366f1, #a855f7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <DollarSign size={18} color="#fff" />
          </div>
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
            Matoba Finanças
          </span>
        </div>
        {/* Indicador de etapas */}
        <div style={{ display: 'flex', gap: 6 }}>
          {STEPS.map((_, i) => (
            <div key={i} style={{
              width: i === step ? 20 : 8, height: 8,
              borderRadius: 4,
              background: i <= step ? 'var(--primary)' : 'var(--border)',
              transition: 'all 0.3s',
            }} />
          ))}
        </div>
      </div>

      <div style={{ padding: '24px 20px 40px', maxWidth: 480, margin: '0 auto' }}>

        {/* ── STEP 0: Renda ── */}
        {step === 0 && (
          <div>
            <p style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>
              Qual é sua renda mensal líquida?
            </p>
            <p style={{ margin: '0 0 20px', fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Use o <strong style={{ color: 'var(--text-primary)' }}>valor líquido</strong> — o que você recebe de fato na conta, já descontados impostos e contribuições (INSS, IR, plano de saúde, etc.). Este valor serve para <strong style={{ color: 'var(--text-primary)' }}>estipular metas de acompanhamento</strong>; você registrará suas entradas reais normalmente depois.
            </p>

            <div style={{ marginBottom: 16 }}>
              <input
                type="text"
                inputMode="decimal"
                placeholder="Ex: 5.000,00"
                value={renda}
                onChange={e => setRenda(formatBRLInput(e.target.value))}
                onBlur={e => setRenda(normalizeBRLInput(e.target.value))}
                autoFocus
                style={{ fontSize: 28, fontWeight: 700, color: 'var(--entrada)', textAlign: 'center' }}
              />
              {rendaNum > 0 && (
                <p style={{ textAlign: 'center', margin: '8px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
                  {formatBRL(rendaNum)} por mês — valor de referência para as metas
                </p>
              )}
            </div>

            <div style={{
              background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)',
              borderRadius: 12, padding: '10px 14px', marginBottom: 16,
              display: 'flex', gap: 8, alignItems: 'flex-start',
            }}>
              <span style={{ fontSize: 16, flexShrink: 0 }}>💡</span>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                Ex: salário bruto R$5.000, mas cai R$3.800 na conta? Informe <strong style={{ color: 'var(--text-primary)' }}>R$3.800</strong>. Não precisa ser exato — você pode atualizar a qualquer momento em <strong style={{ color: 'var(--text-primary)' }}>Configurações → Orçamento</strong>.
              </p>
            </div>

            <div style={{
              background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)',
              borderRadius: 14, padding: '14px 16px', marginBottom: 24,
            }}>
              <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 600, color: 'var(--primary)' }}>
                📊 Divisão Percentual — Como funciona?
              </p>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                A Divisão Percentual recomenda distribuir a renda em 6 categorias com tetos definidos.
                A prioridade é sempre <strong style={{ color: 'var(--text-primary)' }}>investir 25% primeiro</strong> — antes de qualquer gasto.
              </p>
            </div>

            <button
              onClick={() => setStep(1)}
              disabled={rendaNum <= 0}
              style={{
                width: '100%', padding: '15px', borderRadius: 14, fontSize: 16, fontWeight: 600,
                background: rendaNum > 0 ? 'linear-gradient(135deg, #6366f1, #a855f7)' : 'var(--border)',
                color: '#fff', cursor: rendaNum > 0 ? 'pointer' : 'default',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                boxShadow: rendaNum > 0 ? '0 4px 20px rgba(99,102,241,0.4)' : 'none',
              }}
            >
              Próximo <ChevronRight size={18} />
            </button>
          </div>
        )}

        {/* ── STEP 1: Categorias ── */}
        {step === 1 && (
          <div>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 }}>
              <p style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>
                Defina seus limites
              </p>
              <button
                onClick={resetPercentual}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px',
                  background: 'var(--bg-card)', border: '1px solid var(--border)',
                  borderRadius: 8, fontSize: 12, color: 'var(--text-secondary)',
                }}
              >
                <RotateCcw size={12} /> RESETAR
              </button>
            </div>
            <p style={{ margin: '0 0 20px', fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Estes são os percentuais recomendados. Ajuste conforme sua realidade — a soma deve ser 100%.
            </p>

            {/* Total indicator */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 14px', borderRadius: 10, marginBottom: 16,
              background: excede ? 'rgba(239,68,68,0.1)' : totalPct === 100 ? 'rgba(16,185,129,0.1)' : 'var(--bg-card)',
              border: `1px solid ${excede ? 'rgba(239,68,68,0.3)' : totalPct === 100 ? 'rgba(16,185,129,0.3)' : 'var(--border)'}`,
            }}>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Total distribuído</span>
              <span style={{
                fontSize: 16, fontWeight: 700,
                color: excede ? 'var(--saida)' : totalPct === 100 ? 'var(--entrada)' : 'var(--text-primary)',
              }}>
                {totalPct}%
                {totalPct < 100 && <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-muted)' }}> (faltam {100 - totalPct}%)</span>}
                {excede && <span style={{ fontSize: 12, fontWeight: 400 }}> (excede em {totalPct - 100}%)</span>}
              </span>
            </div>

            {/* Category sliders */}
            {CATEGORY_ORDER.map(id => {
              const cat = PERCENTUAL_CATEGORIES[id];
              const val = Number(pcts[id]) || 0;
              const amount = (rendaNum * val) / 100;
              return (
                <div key={id} style={{
                  background: 'var(--bg-card)', border: '1px solid var(--border)',
                  borderRadius: 14, padding: '14px', marginBottom: 10,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 20 }}>{cat.icon}</span>
                      <div>
                        <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{cat.label}</p>
                        <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>{cat.sublabel}</p>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {rendaNum > 0 && (
                        <span style={{ fontSize: 12, color: cat.color, fontWeight: 600 }}>
                          {formatBRL(amount)}
                        </span>
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <input
                          type="number"
                          min="0" max="100"
                          value={val}
                          onChange={e => handlePctChange(id, e.target.value)}
                          style={{
                            width: 52, padding: '4px 6px', textAlign: 'center',
                            fontSize: 14, fontWeight: 700, color: cat.color,
                            borderRadius: 8,
                          }}
                        />
                        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>%</span>
                      </div>
                    </div>
                  </div>
                  {/* Barra de progresso visual do percentual */}
                  <div style={{ height: 4, background: 'var(--bg-surface)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', width: `${val}%`,
                      background: cat.color, borderRadius: 2, transition: 'width 0.3s',
                    }} />
                  </div>
                  <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                    {cat.exemplos}
                  </p>
                </div>
              );
            })}

            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <button
                onClick={() => setStep(0)}
                style={{ flex: 1, padding: '14px', borderRadius: 12, background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: 14 }}
              >
                Voltar
              </button>
              <button
                onClick={() => setStep(2)}
                disabled={excede || totalPct === 0}
                style={{
                  flex: 2, padding: '14px', borderRadius: 12, fontSize: 15, fontWeight: 600,
                  background: !excede && totalPct > 0 ? 'linear-gradient(135deg, #6366f1, #a855f7)' : 'var(--border)',
                  color: '#fff', cursor: !excede && totalPct > 0 ? 'pointer' : 'default',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                Revisar <ChevronRight size={18} />
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 2: Confirmar ── */}
        {step === 2 && (
          <div>
            <p style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>
              Tudo certo! 🎉
            </p>
            <p style={{ margin: '0 0 24px', fontSize: 14, color: 'var(--text-secondary)' }}>
              Seu orçamento mensal de <strong style={{ color: 'var(--entrada)' }}>{formatBRL(rendaNum)}</strong> distribuído assim:
            </p>

            {CATEGORY_ORDER.map(id => {
              const cat = PERCENTUAL_CATEGORIES[id];
              const val = Number(pcts[id]) || 0;
              const amount = (rendaNum * val) / 100;
              return (
                <div key={id} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 14px', marginBottom: 8,
                  background: cat.bg, borderRadius: 12,
                  border: `1px solid ${cat.color}33`,
                }}>
                  <span style={{ fontSize: 22, flexShrink: 0 }}>{cat.icon}</span>
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{cat.label}</p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: cat.color }}>{formatBRL(amount)}</p>
                    <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>{val}%</p>
                  </div>
                </div>
              );
            })}

            <p style={{
              margin: '16px 0', padding: '12px 14px',
              background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)',
              borderRadius: 12, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5,
            }}>
              💡 Você pode alterar esses valores a qualquer momento em <strong style={{ color: 'var(--text-primary)' }}>Configurações → Orçamento</strong>.
            </p>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setStep(1)}
                style={{ flex: 1, padding: '14px', borderRadius: 12, background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: 14 }}
              >
                Ajustar
              </button>
              <button
                onClick={handleFinish}
                style={{
                  flex: 2, padding: '14px', borderRadius: 12, fontSize: 15, fontWeight: 600,
                  background: 'linear-gradient(135deg, #6366f1, #a855f7)', color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  boxShadow: '0 4px 20px rgba(99,102,241,0.4)',
                }}
              >
                <CheckCircle size={18} /> Começar!
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
