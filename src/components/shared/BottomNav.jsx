import { Home, List, PlusCircle, TrendingUp, Settings } from 'lucide-react';

const TABS = [
  { id: 'home',       icon: Home,        label: 'Início'    },
  { id: 'history',   icon: List,        label: 'Histórico' },
  { id: 'add',        icon: PlusCircle,  label: null        },
  { id: 'projection', icon: TrendingUp,  label: 'Projeção'  },
  { id: 'settings',  icon: Settings,    label: 'Config'    },
];

export default function BottomNav({ view, onNavigate }) {
  return (
    <nav
      style={{
        position: 'fixed',
        bottom: 0,
        left: '50%',
        transform: 'translateX(-50%)',
        width: '100%',
        maxWidth: 480,
        background: 'var(--bg-surface)',
        borderTop: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        zIndex: 40,
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      {TABS.map(tab => {
        const isAdd = tab.id === 'add';
        const active = view === tab.id;

        if (isAdd) {
          return (
            <button
              key={tab.id}
              onClick={() => onNavigate('add')}
              style={{
                flex: 1,
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                padding: '8px 0',
                background: 'none',
              }}
            >
              <div style={{
                background: 'var(--primary)',
                borderRadius: '50%',
                width: 48,
                height: 48,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 0 20px rgba(99,102,241,0.5)',
              }}>
                <tab.icon size={24} color="#fff" />
              </div>
            </button>
          );
        }

        return (
          <button
            key={tab.id}
            onClick={() => onNavigate(tab.id)}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 3,
              padding: '10px 0 8px',
              background: 'none',
              color: active ? 'var(--primary)' : 'var(--text-muted)',
              transition: 'color 0.2s',
            }}
          >
            <tab.icon size={20} />
            <span style={{ fontSize: 10, fontWeight: active ? 600 : 400 }}>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
