import { useState, useEffect } from 'react';
import { isConfigured } from './firebase';
import { useAuth } from './hooks/useAuth';
import { AppProvider, useAppState } from './context/AppContext';
import AuthScreen from './components/auth/AuthScreen';
import SetupScreen from './components/auth/SetupScreen';
import SetupGoalsScreen from './components/onboarding/SetupGoalsScreen';
import HomeScreen from './components/home/HomeScreen';
import ProjectionScreen from './components/projection/ProjectionScreen';
import GoalsScreen from './components/goals/GoalsScreen';
import SettingsScreen from './components/settings/SettingsScreen';
import ReportsScreen from './components/reports/ReportsScreen';
import TourGuide from './components/shared/TourGuide';
import BottomNav from './components/shared/BottomNav';
import ReloadPrompt from './components/shared/ReloadPrompt';
import Modal from './components/shared/Modal';
import TransactionForm from './components/transactions/TransactionForm';
import { DollarSign } from 'lucide-react';
import PaymentModal from './components/projection/PaymentModal';

// ── Shell interno — renderiza as telas usando o contexto ──────────────────────
function AppShell({ user, authConfirmed, setAuthConfirmed, login, register, loginWithGoogle, logout, redirectError }) {
  const {
    transactions, cards, wallets, goals, config, saveConfig, dataLoading,
    addCard, updateCard, removeCard,
    addWallet, updateWallet, removeWallet,
    addGoal, updateGoal, removeGoal,
    updateAvailable, latestVersion, latestNotes, isUpdating, handleUpdate,
    view,
    formOpen, setFormOpen,
    editing, setEditing, setEditingOccDate,
    recurrenceAction, setRecurrenceAction,
    cartaoEditScope, setCartaoEditScope,
    payingItem, setPayingItem,
    tourActive,
    showMonthRecap, setShowMonthRecap,
    monthRecapData,
    showToast, ToastNode,
    handleNavigate, handleEdit, handleClone,
    handleSave, handleDelete, handleAdjustBalance,
    openPayModal, confirmPayment,
    confirmCartaoEditScope, confirmRecurrenceAction,
    handleCompleteTour,
    getParceladoEndDate,
    update,
  } = useAppState();

  const renderScreen = () => {
    if (!isConfigured) return <SetupScreen />;

    if (user === undefined || (user && dataLoading)) {
      return (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 20, background: 'var(--bg-primary)' }}>
          <div style={{
            width: 72, height: 72, borderRadius: 20,
            background: 'linear-gradient(135deg, var(--primary), var(--investimento))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
            boxShadow: '0 8px 32px rgba(99, 102, 241, 0.3)'
          }}>
            <DollarSign size={36} color="#fff" />
          </div>
          <h1 style={{
            margin: 0, fontSize: 24, fontWeight: 700,
            background: 'linear-gradient(135deg, #fff, #A1A5C1)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            animation: 'fadeIn 1s ease-out'
          }}>
            Matoba Finanças
          </h1>
          <style>{`
            @keyframes pulse { 0%,100%{opacity:1; transform: scale(1);} 50%{opacity:0.8; transform: scale(0.95);} }
            @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
          `}</style>
        </div>
      );
    }

    if (!user || !authConfirmed) {
      return (
        <AuthScreen
          user={user}
          redirectError={redirectError}
          onLogin={async (e, p) => { await login(e, p); setAuthConfirmed(true); }}
          onRegister={async (e, p) => { await register(e, p); setAuthConfirmed(true); }}
          onLoginWithGoogle={async () => { await loginWithGoogle(); }}
          onConfirm={() => setAuthConfirmed(true)}
          onLogout={async () => { await logout(); setAuthConfirmed(false); }}
        />
      );
    }

    if (!config.onboardingDone) {
      return <SetupGoalsScreen onSave={saveConfig} />;
    }

    return (
      <>
        {view === 'home' && (
          <HomeScreen
            transactions={transactions}
            cards={cards}
            wallets={wallets}
            goals={goals}
            config={config}
            metaMensal={config.metaMensalDiario}
            onSaveMeta={v => saveConfig({ metaMensalDiario: v })}
            onEdit={handleEdit}
            onClone={handleClone}
            onDelete={handleDelete}
            onPay={openPayModal}
            onNavigate={handleNavigate}
            onAdjustBalance={handleAdjustBalance}
          />
        )}
        {view === 'goals' && (
          <GoalsScreen
            goals={goals}
            transactions={transactions}
            wallets={wallets}
            config={config}
            onAddGoal={addGoal}
            onUpdateGoal={updateGoal}
            onRemoveGoal={removeGoal}
            onSaveConfig={saveConfig}
            onAddTransaction={(prefill) => {
              setEditing(prefill);
              setFormOpen(true);
            }}
          />
        )}
        {view === 'projection' && (
          <ProjectionScreen
            transactions={transactions}
            wallets={wallets}
            cards={cards}
            onEdit={handleEdit}
            onClone={handleClone}
            onDelete={handleDelete}
            onPay={openPayModal}
            onUpdate={update}
          />
        )}
        {view === 'reports' && (
          <ReportsScreen
            transactions={transactions}
            wallets={wallets}
            config={config}
            onNavigate={handleNavigate}
          />
        )}
        {view === 'settings' && (
          <SettingsScreen
            user={user}
            cards={cards}
            wallets={wallets}
            goals={goals}
            transactions={transactions}
            config={config}
            onSaveConfig={saveConfig}
            onAddCard={addCard}
            onUpdateCard={updateCard}
            onRemoveCard={removeCard}
            onAddWallet={addWallet}
            onUpdateWallet={updateWallet}
            onRemoveWallet={removeWallet}
            onLogout={logout}
            onResetTour={async () => { await saveConfig({ tourDone: false }); }}
            onUpdateApp={handleUpdate}
            onUpdateTransaction={update}
          />
        )}

        <BottomNav view={view} onNavigate={handleNavigate} />

        <Modal
          open={formOpen}
          onClose={() => { setFormOpen(false); setEditing(null); setEditingOccDate(null); }}
          title={editing?.id ? 'Editar lançamento' : 'Novo lançamento'}
        >
          <TransactionForm
            initial={editing}
            cards={cards}
            wallets={wallets}
            goals={goals}
            transactions={transactions}
            config={config}
            onSave={handleSave}
            onCancel={() => { setFormOpen(false); setEditing(null); setEditingOccDate(null); }}
          />
        </Modal>

        {/* Modal de Resumo de Virada de Mês */}
        {showMonthRecap && monthRecapData && (
          <Modal open onClose={() => { setShowMonthRecap(false); localStorage.setItem(monthRecapData.recapKey, '1'); }} title={`☀️ Fechamento de ${monthRecapData.mesNome}`}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div style={{ background: 'rgba(16,185,129,0.08)', borderRadius: 12, padding: '12px', border: '1px solid rgba(16,185,129,0.2)' }}>
                  <p style={{ margin: '0 0 2px', fontSize: 11, color: 'var(--text-muted)' }}>Receitas</p>
                  <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--entrada)' }}>+{new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(monthRecapData.entradas)}</p>
                </div>
                <div style={{ background: 'rgba(239,68,68,0.08)', borderRadius: 12, padding: '12px', border: '1px solid rgba(239,68,68,0.2)' }}>
                  <p style={{ margin: '0 0 2px', fontSize: 11, color: 'var(--text-muted)' }}>Despesas</p>
                  <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--saida)' }}>-{new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(monthRecapData.saidas)}</p>
                </div>
              </div>
              <div style={{ background: monthRecapData.resultado >= 0 ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)', borderRadius: 12, padding: '14px 16px', textAlign: 'center', border: `1px solid ${monthRecapData.resultado >= 0 ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}` }}>
                <p style={{ margin: '0 0 4px', fontSize: 12, color: 'var(--text-secondary)' }}>Resultado do mês</p>
                <p style={{ margin: 0, fontSize: 22, fontWeight: 800, color: monthRecapData.resultado >= 0 ? 'var(--entrada)' : 'var(--saida)' }}>
                  {monthRecapData.resultado >= 0 ? '+' : ''}{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(monthRecapData.resultado)}
                </p>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                  {monthRecapData.resultado >= 0 ? '✅ Mês no azul! Ótimo trabalho.' : '⚠️ Mês no vermelho. Que tal revisar os gastos?'}
                </p>
              </div>
              {(monthRecapData.melhorCat || monthRecapData.piorCat) && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {monthRecapData.melhorCat && <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>✅ Melhor categoria: <strong>{monthRecapData.melhorCat}</strong></p>}
                  {monthRecapData.piorCat && monthRecapData.piorCat !== monthRecapData.melhorCat && <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>⚠️ Maior consumo: <strong>{monthRecapData.piorCat}</strong></p>}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => { setShowMonthRecap(false); localStorage.setItem(monthRecapData.recapKey, '1'); handleNavigate('projection'); }}
                  style={{ flex: 1, padding: '12px', borderRadius: 12, fontSize: 13, fontWeight: 600, background: 'var(--primary)', color: '#fff', border: 'none', cursor: 'pointer' }}
                >
                  Ver Histórico
                </button>
                <button
                  onClick={() => { setShowMonthRecap(false); localStorage.setItem(monthRecapData.recapKey, '1'); }}
                  style={{ flex: 1, padding: '12px', borderRadius: 12, fontSize: 13, fontWeight: 600, background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)', cursor: 'pointer' }}
                >
                  Fechar
                </button>
              </div>
            </div>
          </Modal>
        )}

        {/* Modal de Exceção Recorrente */}
        <Modal
          open={!!recurrenceAction}
          onClose={() => setRecurrenceAction(null)}
          title={recurrenceAction?.action === 'edit' ? 'Editar lançamento recorrente' : 'Remover lançamento recorrente'}
        >
          <div style={{ padding: '0 4px', color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.5 }}>
            <p style={{ marginBottom: 20 }}>
              Este é um lançamento que se repete ({recurrenceAction?.tx?.frequencia}).<br />
              Você deseja aplicar essa alteração apenas nesta ocorrência, ou nas futuras também?
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button onClick={() => confirmRecurrenceAction('single')} style={{ padding: '14px', borderRadius: 12, fontSize: 14, fontWeight: 600, background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)', textAlign: 'left' }}>
                Apenas nesta ocorrência
                <span style={{ display: 'block', fontSize: 12, fontWeight: 400, color: 'var(--text-muted)', marginTop: 2 }}>As outras ocorrências não serão afetadas.</span>
              </button>
              <button onClick={() => confirmRecurrenceAction('future')} style={{ padding: '14px', borderRadius: 12, fontSize: 14, fontWeight: 600, background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)', textAlign: 'left' }}>
                Nesta e nas futuras
                <span style={{ display: 'block', fontSize: 12, fontWeight: 400, color: 'var(--text-muted)', marginTop: 2 }}>Ocorrências passadas continuarão com o valor antigo.</span>
              </button>
              <button onClick={() => confirmRecurrenceAction('all')} style={{ padding: '14px', borderRadius: 12, fontSize: 14, fontWeight: 600, background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)', textAlign: 'left' }}>
                Em todas as ocorrências
                <span style={{ display: 'block', fontSize: 12, fontWeight: 400, color: 'var(--saida)', marginTop: 2 }}>Cuidado: isso vai alterar seu histórico passado também.</span>
              </button>
            </div>
          </div>
        </Modal>

        {/* Modal de escopo de edição de fatura parcelada */}
        {cartaoEditScope && (() => {
          const itens = cartaoEditScope.cleanData.itens || [];
          const dataBase = cartaoEditScope.editingOccDate || cartaoEditScope.editing?.dataInicio || '';
          const endDate = getParceladoEndDate(itens, dataBase);
          const endFormatted = endDate
            ? new Date(`${endDate}T12:00:00`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
            : '';
          return (
            <Modal open onClose={() => setCartaoEditScope(null)} title="Editar fatura parcelada">
              <div style={{ padding: '0 4px', color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.5 }}>
                <p style={{ marginBottom: 4 }}>Esta fatura contém compras parceladas.</p>
                {endFormatted && (
                  <p style={{ marginBottom: 20, fontWeight: 600, color: 'var(--text-primary)' }}>
                    As parcelas vão até <span style={{ color: 'var(--entrada)' }}>{endFormatted}</span>.
                  </p>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <button onClick={() => confirmCartaoEditScope('single')} style={{ padding: '14px', borderRadius: 12, fontSize: 14, fontWeight: 600, background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)', textAlign: 'left' }}>
                    Somente esta fatura
                    <span style={{ display: 'block', fontSize: 12, fontWeight: 400, color: 'var(--text-muted)', marginTop: 2 }}>As faturas futuras não serão alteradas.</span>
                  </button>
                  <button onClick={() => confirmCartaoEditScope('future')} style={{ padding: '14px', borderRadius: 12, fontSize: 14, fontWeight: 600, background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)', textAlign: 'left' }}>
                    Esta e todas as futuras
                    <span style={{ display: 'block', fontSize: 12, fontWeight: 400, color: 'var(--text-muted)', marginTop: 2 }}>Todas as faturas a partir de agora serão atualizadas.</span>
                  </button>
                </div>
              </div>
            </Modal>
          );
        })()}

        {/* Modal de pagamento */}
        {payingItem && (
          <PaymentModal
            item={payingItem.item}
            occDate={payingItem.occDate}
            onConfirm={confirmPayment}
            onClose={() => setPayingItem(null)}
          />
        )}

        {tourActive && <TourGuide onComplete={handleCompleteTour} />}
      </>
    );
  };

  return (
    <>
      {/* Banner global de nova versão */}
      {updateAvailable && latestVersion && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9500,
          background: 'linear-gradient(90deg, #6366f1, #a855f7)',
          padding: '12px 20px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          boxShadow: '0 4px 20px rgba(99,102,241,0.45)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 18, flexShrink: 0 }}>🆕</span>
            <div style={{ minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#fff' }}>
                Versão {latestVersion} disponível!
              </p>
              {latestNotes?.[0] && (
                <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.82)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {latestNotes[0]}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={handleUpdate}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#fff', color: '#6366f1', padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, border: 'none', cursor: 'pointer', flexShrink: 0, boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}
          >
            🔄 Atualizar
          </button>
        </div>
      )}

      {renderScreen()}
      <ReloadPrompt />

      {isUpdating && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'var(--bg-primary, #0f0f1a)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 28 }}>
          <div style={{ width: 76, height: 76, borderRadius: 22, background: 'linear-gradient(135deg, #6366f1, #a855f7)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 40px rgba(99,102,241,0.35)' }}>
            <DollarSign size={38} color="#fff" />
          </div>
          <div style={{ position: 'relative', width: 52, height: 52 }}>
            <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '3px solid rgba(99,102,241,0.12)' }} />
            <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '3px solid transparent', borderTopColor: '#6366f1', animation: 'mf-spin-app 0.75s linear infinite' }} />
          </div>
          <div style={{ textAlign: 'center', padding: '0 40px' }}>
            <p style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--text-primary, #f1f1f9)' }}>Atualizando o aplicativo</p>
            <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--text-secondary, #8b8fa8)', lineHeight: 1.5 }}>Instalando a nova versão…<br />O app será recarregado em instantes.</p>
          </div>
          <style>{`@keyframes mf-spin-app { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}
      {ToastNode}
    </>
  );
}

// ── Componente raiz — gerencia apenas autenticação ────────────────────────────
export default function App() {
  const { user, login, register, loginWithGoogle, logout, justLoggedIn, redirectError } = useAuth();
  const [authConfirmed, setAuthConfirmed] = useState(false);

  useEffect(() => {
    if (justLoggedIn) Promise.resolve().then(() => setAuthConfirmed(true));
  }, [justLoggedIn]);

  return (
    <AppProvider user={user}>
      <AppShell
        user={user}
        authConfirmed={authConfirmed}
        setAuthConfirmed={setAuthConfirmed}
        login={login}
        register={register}
        loginWithGoogle={loginWithGoogle}
        logout={logout}
        redirectError={redirectError}
      />
    </AppProvider>
  );
}
