import { useState } from 'react';
import { LogOut, User, Shield, ChevronDown, ChevronUp } from 'lucide-react';
import CardManager from './CardManager';
import BudgetSettings from './BudgetSettings';

export default function SettingsScreen({ user, cards, config, onSaveConfig, onAddCard, onUpdateCard, onRemoveCard, onLogout }) {
  const [budgetOpen, setBudgetOpen] = useState(true);
  const [cardsOpen, setCardsOpen] = useState(false);

  return (
    <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 90 }}>
      <div style={{ padding: '20px 20px 0' }}>
        <h1 style={{ margin: '0 0 20px', fontSize: 20, fontWeight: 700 }}>Configurações</h1>

        {/* Perfil */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 14, padding: '14px', marginBottom: 20,
        }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg, #6366f1, #a855f7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <User size={22} color="#fff" />
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ margin: '0 0 2px', fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Conta</p>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>{user?.email || user?.displayName}</p>
          </div>
          <button
            onClick={onLogout}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px',
              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
              borderRadius: 10, color: 'var(--saida)', fontSize: 13, fontWeight: 500,
            }}
          >
            <LogOut size={14} /> Sair
          </button>
        </div>

        {/* Orçamento — expansível */}
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 14, marginBottom: 16, overflow: 'hidden',
        }}>
          <button
            onClick={() => setBudgetOpen(o => !o)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 16px', background: 'none',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 18 }}>💰</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                Orçamento / Método Sardinha
              </span>
            </div>
            {budgetOpen ? <ChevronUp size={16} color="var(--text-muted)" /> : <ChevronDown size={16} color="var(--text-muted)" />}
          </button>
          {budgetOpen && (
            <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--border)' }}>
              <div style={{ paddingTop: 14 }}>
                <BudgetSettings config={config} onSave={onSaveConfig} />
              </div>
            </div>
          )}
        </div>

        {/* Cartões — expansível */}
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 14, marginBottom: 16, overflow: 'hidden',
        }}>
          <button
            onClick={() => setCardsOpen(o => !o)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 16px', background: 'none',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 18 }}>💳</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                Cartões de Crédito
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {cards.length > 0 && (
                <span style={{ fontSize: 12, color: 'var(--text-muted)', background: 'var(--bg-surface)', borderRadius: 6, padding: '2px 7px' }}>
                  {cards.length}
                </span>
              )}
              {cardsOpen ? <ChevronUp size={16} color="var(--text-muted)" /> : <ChevronDown size={16} color="var(--text-muted)" />}
            </div>
          </button>
          {cardsOpen && (
            <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--border)' }}>
              <div style={{ paddingTop: 14 }}>
                <CardManager cards={cards} onAdd={onAddCard} onUpdate={onUpdateCard} onRemove={onRemoveCard} />
              </div>
            </div>
          )}
        </div>

        {/* Nota de segurança */}
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 10,
          background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)',
          borderRadius: 12, padding: '12px 14px', marginBottom: 8,
        }}>
          <Shield size={14} color="var(--primary)" style={{ marginTop: 1 }} />
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Seus dados são armazenados de forma segura no Firebase e sincronizados apenas para sua conta.
          </p>
        </div>
      </div>
    </div>
  );
}
