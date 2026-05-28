import { useState } from 'react';
import { LogOut, User, Shield, ChevronDown, ChevronUp, Download } from 'lucide-react';
import CardManager from './CardManager';
import BudgetSettings from './BudgetSettings';
import NotificationSettings from './NotificationSettings';
import TelegramSettings from './TelegramSettings';
import { useInstallPrompt } from '../../hooks/useInstallPrompt';

export default function SettingsScreen({ user, cards, transactions, config, onSaveConfig, onAddCard, onUpdateCard, onRemoveCard, onLogout }) {
  const [budgetOpen, setBudgetOpen] = useState(true);
  const [cardsOpen, setCardsOpen] = useState(false);
  const [notifsOpen, setNotifsOpen] = useState(false);
  const [telegramOpen, setTelegramOpen] = useState(false);
  const { prompt: deferredPrompt, handleInstall } = useInstallPrompt();

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

        {/* Notificações Push — card */}
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 14, marginBottom: 16, overflow: 'hidden',
        }}>
          <button
            onClick={() => setNotifsOpen(o => !o)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 16px', background: 'none',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 18 }}>🔔</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                Notificações Push
              </span>
            </div>
            {notifsOpen ? <ChevronUp size={16} color="var(--text-muted)" /> : <ChevronDown size={16} color="var(--text-muted)" />}
          </button>
          {notifsOpen && (
            <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--border)' }}>
              <div style={{ paddingTop: 14 }}>
                <NotificationSettings
                  user={user}
                  cards={cards}
                  transactions={transactions}
                  config={config}
                  onSavePrefs={onSaveConfig}
                />
              </div>
            </div>
          )}
        </div>

        {/* Bot do Telegram — card separado */}
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 14, marginBottom: 16, overflow: 'hidden',
        }}>
          <button
            onClick={() => setTelegramOpen(o => !o)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 16px', background: 'none',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {/* Ícone Telegram */}
              <svg width="22" height="22" viewBox="0 0 24 24" fill="#229ED9">
                <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
              </svg>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                Bot do Telegram
              </span>
            </div>
            {telegramOpen ? <ChevronUp size={16} color="var(--text-muted)" /> : <ChevronDown size={16} color="var(--text-muted)" />}
          </button>
          {telegramOpen && (
            <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--border)' }}>
              <div style={{ paddingTop: 14 }}>
                <TelegramSettings
                  user={user}
                  config={config}
                  onSavePrefs={onSaveConfig}
                />
              </div>
            </div>
          )}
        </div>

        {/* PWA Install Button */}
        {deferredPrompt && (
          <button
            onClick={handleInstall}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '14px', marginBottom: 16, borderRadius: 14,
              background: 'linear-gradient(135deg, #6366f1, #a855f7)', border: 'none',
              color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
              boxShadow: '0 4px 16px rgba(99,102,241,0.3)'
            }}
          >
            <Download size={18} />
            Instalar Aplicativo (App Nativo)
          </button>
        )}

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
