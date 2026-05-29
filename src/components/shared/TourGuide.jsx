import { useState } from 'react';
import { ChevronRight, X, Play } from 'lucide-react';

const STEPS = [
  {
    title: '👋 Boas-vindas ao Matoba Finanças!',
    desc: 'Seu novo gerenciador pessoal de alta performance financeira está pronto! Vamos fazer um tour guiado de 5 passos para você dominar o aplicativo.',
    selector: null, // Centralizado
  },
  {
    title: '🏦 Seu Saldo Global e Carteiras',
    desc: 'No topo, você acompanha o seu Saldo Global Consolidado e o saldo individual de cada carteira em tempo real (role horizontalmente para ver mais).',
    selector: 'saldo-global',
  },
  {
    title: '📊 Divisão Percentual de Orçamento',
    desc: 'Sua renda mensal é distribuída de forma inteligente em 6 categorias ideais com tetos automáticos. Acompanhe se seus gastos estão dentro das metas de alocação.',
    selector: 'divisao-orcamento',
  },
  {
    title: '💸 Lançamentos Rápidos (+)',
    desc: 'Toque no botão central (+) para registrar suas entradas, saídas variáveis, gastos diários e compras parceladas em cartões de crédito de forma ágil.',
    selector: 'botao-adicionar',
  },
  {
    title: '📈 O Poder das Projeções Futuras',
    desc: 'Na aba "Projeção", você viaja no tempo e visualiza como suas decisões financeiras de hoje afetarão o seu saldo nos próximos meses ou anos.',
    selector: 'aba-projecao',
  }
];

export default function TourGuide({ onComplete }) {
  const [currentStep, setCurrentStep] = useState(0);

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(s => s + 1);
    } else {
      onComplete();
    }
  };

  const step = STEPS[currentStep];

  // Helper para renderizar o overlay posicionado ou centralizado
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 99999,
      background: 'rgba(10, 15, 30, 0.75)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '20px'
    }}>
      <div style={{
        width: '100%', maxWidth: 380, background: 'var(--bg-surface)',
        border: '1px solid var(--primary)', borderRadius: 20,
        padding: '24px', position: 'relative', boxShadow: '0 20px 50px rgba(99,102,241,0.25)',
        animation: 'mf-tour-fade 0.3s ease-out'
      }}>
        {/* Indicador de progresso */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--primary)', background: 'rgba(99,102,241,0.1)', padding: '3px 8px', borderRadius: 6 }}>
            PASSO {currentStep + 1} DE {STEPS.length}
          </span>
          <button 
            onClick={onComplete} 
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 2, display: 'flex' }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Textos */}
        <h3 style={{ margin: '0 0 10px', fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
          {step.title}
        </h3>
        <p style={{ margin: '0 0 24px', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          {step.desc}
        </p>

        {/* Botão Ação */}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={handleNext}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '10px 18px', borderRadius: 10,
              background: 'var(--primary)', border: 'none',
              color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(99,102,241,0.3)'
            }}
          >
            {currentStep === STEPS.length - 1 ? 'Concluir Tour' : 'Próximo'}
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      <style>{`
        @keyframes mf-tour-fade {
          from { opacity: 0; transform: scale(0.95) translateY(10px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
}
