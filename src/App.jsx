import { useState, useEffect } from 'react';
import { isConfigured } from './firebase';
import { useAuth } from './hooks/useAuth';
import { useTransactions } from './hooks/useTransactions';
import { useCards } from './hooks/useCards';
import { useConfig } from './hooks/useConfig';
import { useToast } from './components/shared/Toast';
import AuthScreen from './components/auth/AuthScreen';
import SetupScreen from './components/auth/SetupScreen';
import SetupGoalsScreen from './components/onboarding/SetupGoalsScreen';
import HomeScreen from './components/home/HomeScreen';
import TransactionsScreen from './components/transactions/TransactionsScreen';
import ProjectionScreen from './components/projection/ProjectionScreen';
import SettingsScreen from './components/settings/SettingsScreen';
import BottomNav from './components/shared/BottomNav';
import Modal from './components/shared/Modal';
import TransactionForm from './components/transactions/TransactionForm';
import ReloadPrompt from './components/shared/ReloadPrompt';
import { DollarSign } from 'lucide-react';

export default function App() {
  const { user, login, register, loginWithGoogle, logout, justLoggedIn, redirectError } = useAuth();
  const { transactions, add, update, remove } = useTransactions(user?.uid);
  const { cards, add: addCard, update: updateCard, remove: removeCard } = useCards(user?.uid);
  const { config, configLoading, saveConfig } = useConfig(user?.uid);
  const { showToast, ToastNode } = useToast();

  const [view, setView] = useState('home');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [authConfirmed, setAuthConfirmed] = useState(false);

  // Se o usuário acabou de voltar de um login Google via redirect
  useEffect(() => {
    if (justLoggedIn) setAuthConfirmed(true);
  }, [justLoggedIn]);

  if (!isConfigured) return <SetupScreen />;

  if (user === undefined || (user && configLoading && authConfirmed)) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
        <div style={{
          width: 56, height: 56, borderRadius: 16,
          background: 'linear-gradient(135deg, #6366f1, #a855f7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          animation: 'pulse 1.5s ease-in-out infinite',
        }}>
          <DollarSign size={28} color="#fff" />
        </div>
        <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.6} }`}</style>
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

  // Onboarding: usuário logado mas sem renda configurada
  if (!config.onboardingDone) {
    return <SetupGoalsScreen onSave={saveConfig} />;
  }

  const handleNavigate = (dest) => {
    if (dest === 'add') { setEditing(null); setFormOpen(true); return; }
    setView(dest);
  };

  const handleEdit = (tx) => { setEditing(tx); setFormOpen(true); };

  const handleSave = async (data) => {
    if (editing) {
      await update(editing.id, data);
      showToast('Lançamento atualizado!');
    } else {
      await add(data);
      showToast('Lançamento adicionado com sucesso!');
    }
    setFormOpen(false);
    setEditing(null);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Remover este lançamento?')) {
      await remove(id);
      showToast('Lançamento removido.', 'error');
    }
  };

  return (
    <>
      {view === 'home' && (
        <HomeScreen
          transactions={transactions}
          cards={cards}
          config={config}
          metaMensal={config.metaMensalDiario}
          onSaveMeta={v => saveConfig({ metaMensalDiario: v })}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onNavigate={handleNavigate}
        />
      )}
      {view === 'history' && (
        <TransactionsScreen
          transactions={transactions}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
      )}
      {view === 'projection' && (
        <ProjectionScreen transactions={transactions} />
      )}
      {view === 'settings' && (
        <SettingsScreen
          user={user}
          cards={cards}
          config={config}
          onSaveConfig={saveConfig}
          onAddCard={addCard}
          onUpdateCard={updateCard}
          onRemoveCard={removeCard}
          onLogout={logout}
        />
      )}

      <BottomNav view={view} onNavigate={handleNavigate} />

      <Modal
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditing(null); }}
        title={editing ? 'Editar lançamento' : 'Novo lançamento'}
      >
        <TransactionForm
          initial={editing}
          cards={cards}
          transactions={transactions}
          onSave={handleSave}
          onCancel={() => { setFormOpen(false); setEditing(null); }}
        />
      </Modal>

      {ToastNode}
      <ReloadPrompt />
    </>
  );
}
