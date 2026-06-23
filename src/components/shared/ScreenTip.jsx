import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

const TIPS = {
  transactions: 'Lista de todos os seus lançamentos. Toque em um para editar, conferir ou excluir.',
  projection:   'Visualize como seu saldo vai se comportar nos próximos meses com base nos seus lançamentos recorrentes.',
  reports:      'Relatórios mensais com gráficos de gastos por categoria e evolução do saldo.',
  goals:        'Crie metas e caixinhas para guardar dinheiro com objetivo definido.',
  settings:     'Ajuste sua renda, percentuais de orçamento, cartões, carteiras e notificações.',
};

export default function ScreenTip({ view, toursVistas = [], onDismiss }) {
  const [visible, setVisible] = useState(false);

  const tip = TIPS[view];
  const jaViu = toursVistas.includes(view);

  useEffect(() => {
    if (!tip || jaViu) return;
    setVisible(true);
    const timer = setTimeout(() => handleDismiss(), 6000);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  const handleDismiss = () => {
    setVisible(false);
    onDismiss(view);
  };

  if (!visible || !tip || jaViu) return null;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9000,
      display: 'flex', justifyContent: 'center',
      padding: '10px 16px',
      pointerEvents: 'none',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        background: 'rgba(99,102,241,0.92)', backdropFilter: 'blur(6px)',
        borderRadius: 12, padding: '10px 14px',
        maxWidth: 420, width: '100%',
        boxShadow: '0 4px 20px rgba(99,102,241,0.35)',
        animation: 'screentip-in 0.3s ease-out',
        pointerEvents: 'auto',
      }}>
        <span style={{ fontSize: 13, color: '#fff', flex: 1, lineHeight: 1.5 }}>
          💡 {tip}
        </span>
        <button
          onClick={handleDismiss}
          style={{
            flexShrink: 0, background: 'rgba(255,255,255,0.2)', border: 'none',
            borderRadius: 8, padding: '4px 10px', color: '#fff',
            fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
            display: 'flex', alignItems: 'center', gap: 4,
          }}
        >
          <X size={11} /> Ok
        </button>
      </div>

      <style>{`
        @keyframes screentip-in {
          from { opacity: 0; transform: translateY(-12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
