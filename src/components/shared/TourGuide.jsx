import { useState } from 'react';
import { ChevronRight, X } from 'lucide-react';

const BASE_STEPS = [
  {
    title: '👋 Bem-vindo ao Matoba Finanças!',
    desc: 'Seu app está pronto. Vamos fazer um tour rápido para você se orientar — são apenas alguns passos curtos.',
  },
  {
    title: '🗂️ Menu inferior',
    desc: (
      <span>
        Na barra do rodapé você acessa tudo:<br /><br />
        <strong>🏠 Início</strong> — visão geral do seu dia financeiro<br />
        <strong>📋 Painel</strong> — histórico de todos os lançamentos<br />
        <strong>➕ (+)</strong> — cadastrar novo lançamento<br />
        <strong>📈 Projeção</strong> — como seu saldo vai se comportar no futuro<br />
        <strong>⚙️ Config</strong> — carteiras, cartões, orçamento e notificações
      </span>
    ),
  },
  {
    title: '💰 Saldo Global',
    desc: 'O número grande no topo é a soma de todas as suas carteiras em tempo real. Toque no ícone 👁 no canto superior direito da tela para ocultar todos os valores quando precisar de privacidade — ideal para usar o app em locais públicos.',
  },
  {
    title: '🏦 Suas Carteiras',
    desc: 'Cada bloco colorido representa uma conta ou carteira (ex: Nubank, conta corrente, dinheiro em espécie). Role horizontalmente para ver todas. O saldo inicial de cada uma é configurado em Configurações.',
  },
  {
    title: '📊 Divisão Percentual de Orçamento',
    desc: 'As 6 categorias mostram quanto da sua renda líquida mensal você já utilizou em cada área. As barras ficam vermelhas quando o limite da categoria é ultrapassado. Os percentuais são definidos por você em Configurações → Orçamento.',
  },
  {
    title: '💳 Cartão de Crédito',
    desc: 'Aqui você acompanha a fatura estimada do ciclo atual e o limite disponível de cada cartão. Ao confirmar o pagamento da fatura, o saldo do cartão é zerado automaticamente. ⚠️ Este card aparece na tela Início apenas para quem tiver um cartão cadastrado em Configurações → Cartões.',
  },
  {
    title: '📅 Lançamentos do dia',
    desc: 'Lista o que entra e sai hoje. Toque em qualquer lançamento para editar, marcar como conferido ou excluir. Lançamentos conferidos ficam marcados em verde.',
  },
  {
    title: '➕ Como cadastrar um lançamento',
    desc: (
      <span>
        Toque no botão <strong>(+)</strong> no centro do menu. Você pode registrar:<br /><br />
        <strong>💵 Entrada</strong> — salário, renda extra, transferências recebidas<br />
        <strong>💸 Saída</strong> — gastos pontuais<br />
        <strong>🔁 Diário</strong> — gasto que se repete todo dia (ex: café, transporte)<br />
        <strong>📦 Parcelado</strong> — compra em X vezes (sem cartão)<br />
        <strong>💳 Cartão</strong> — lançamento na fatura do cartão de crédito
      </span>
    ),
  },
];

export default function TourGuide({ onComplete }) {
  const steps = BASE_STEPS;
  const [currentStep, setCurrentStep] = useState(0);

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(s => s + 1);
    } else {
      onComplete();
    }
  };

  const step = steps[currentStep];

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 99999,
      background: 'rgba(10, 15, 30, 0.80)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '20px'
    }}>
      <div style={{
        width: '100%', maxWidth: 400, background: 'var(--bg-surface)',
        border: '1px solid var(--primary)', borderRadius: 20,
        padding: '24px', position: 'relative', boxShadow: '0 20px 50px rgba(99,102,241,0.25)',
        animation: 'mf-tour-fade 0.3s ease-out',
        maxHeight: '85dvh', overflowY: 'auto',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--primary)', background: 'rgba(99,102,241,0.1)', padding: '3px 8px', borderRadius: 6 }}>
            PASSO {currentStep + 1} DE {steps.length}
          </span>
          <button
            onClick={onComplete}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 2, display: 'flex' }}
            title="Pular tour"
          >
            <X size={16} />
          </button>
        </div>

        {/* Barra de progresso */}
        <div style={{ height: 3, background: 'var(--border)', borderRadius: 2, marginBottom: 20, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 2,
            width: `${((currentStep + 1) / steps.length) * 100}%`,
            background: 'linear-gradient(90deg, #6366f1, #a855f7)',
            transition: 'width 0.3s ease',
          }} />
        </div>

        {/* Título */}
        <h3 style={{ margin: '0 0 10px', fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
          {step.title}
        </h3>

        {/* Conteúdo */}
        <div style={{ margin: '0 0 24px', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.65 }}>
          {step.desc}
        </div>

        {/* Rodapé */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button
            onClick={onComplete}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer', padding: '4px 0' }}
          >
            Pular tour
          </button>
          <button
            onClick={handleNext}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '10px 18px', borderRadius: 10,
              background: 'linear-gradient(135deg, #6366f1, #a855f7)', border: 'none',
              color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(99,102,241,0.3)',
            }}
          >
            {currentStep === steps.length - 1 ? 'Concluir' : 'Próximo'}
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
