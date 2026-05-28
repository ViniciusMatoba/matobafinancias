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
  const [editingOccDate, setEditingOccDate] = useState(null);
  const [authConfirmed, setAuthConfirmed] = useState(false);
  const [recurrenceAction, setRecurrenceAction] = useState(null);

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

  const handleEdit = (tx, occDate) => { setEditing(tx); setEditingOccDate(occDate); setFormOpen(true); };

  const handleSave = async (data) => {
    const { _overwriteId, ...cleanData } = data;
    
    if (editing && ['diario','semanal','mensal'].includes(editing.frequencia) && editingOccDate) {
      setRecurrenceAction({ tx: editing, occDate: editingOccDate, newData: cleanData, action: 'edit' });
      setFormOpen(false);
      setEditing(null);
      setEditingOccDate(null);
      return;
    }

    if (editing || _overwriteId) {
      const id = editing?.id || _overwriteId;
      await update(id, cleanData);
      showToast(_overwriteId && !editing ? 'Lançamento substituído!' : 'Lançamento atualizado!');
    } else {
      await add(cleanData);
      showToast('Lançamento adicionado com sucesso!');
    }
    setFormOpen(false);
    setEditing(null);
    setEditingOccDate(null);
  };

  const handleDelete = async (id, occDate) => {
    const tx = transactions.find(t => t.id === id);
    if (!tx) return;
    
    if (['diario','semanal','mensal'].includes(tx.frequencia) && occDate) {
      setRecurrenceAction({ tx, occDate, action: 'delete' });
      return;
    }

    if (window.confirm('Remover este lançamento?')) {
      await remove(id);
      showToast('Lançamento removido.', 'error');
    }
  };

  const confirmRecurrenceAction = async (scope) => {
    const { tx, occDate, newData, action } = recurrenceAction;
    setRecurrenceAction(null);

    if (action === 'delete') {
      if (scope === 'single') {
        const exclusoes = tx.exclusoes || [];
        if (!exclusoes.includes(occDate)) exclusoes.push(occDate);
        await update(tx.id, { exclusoes });
        showToast('Ocorrência removida.');
      } else if (scope === 'future') {
        const d = new Date(`${occDate}T12:00:00`);
        d.setDate(d.getDate() - 1);
        const dataFim = d.toISOString().slice(0, 10);
        await update(tx.id, { dataFim });
        showToast('Ocorrências futuras removidas.');
      } else {
        await remove(tx.id);
        showToast('Série completa removida.', 'error');
      }
    } else if (action === 'edit') {
      if (scope === 'single') {
        const exclusoes = tx.exclusoes || [];
        if (!exclusoes.includes(occDate)) exclusoes.push(occDate);
        await update(tx.id, { exclusoes });
        await add({ ...newData, frequencia: 'unico', dataInicio: occDate, dataFim: null });
        showToast('Ocorrência editada separadamente!');
      } else if (scope === 'future') {
        const d = new Date(`${occDate}T12:00:00`);
        d.setDate(d.getDate() - 1);
        const dataFim = d.toISOString().slice(0, 10);
        await update(tx.id, { dataFim });
        await add({ ...newData, dataInicio: occDate });
        showToast('Ocorrências futuras alteradas!');
      } else {
        await update(tx.id, newData);
        showToast('Série completa atualizada!');
      }
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
        <ProjectionScreen
          transactions={transactions}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
      )}
      {view === 'settings' && (
        <SettingsScreen
          user={user}
          cards={cards}
          transactions={transactions}
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
          onCancel={() => { setFormOpen(false); setEditing(null); setEditingOccDate(null); }}
        />
      </Modal>

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
            <button
              onClick={() => confirmRecurrenceAction('single')}
              style={{ padding: '14px', borderRadius: 12, fontSize: 14, fontWeight: 600, background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)', textAlign: 'left' }}
            >
              Apenas nesta ocorrência
              <span style={{ display: 'block', fontSize: 12, fontWeight: 400, color: 'var(--text-muted)', marginTop: 2 }}>As outras ocorrências não serão afetadas.</span>
            </button>
            <button
              onClick={() => confirmRecurrenceAction('future')}
              style={{ padding: '14px', borderRadius: 12, fontSize: 14, fontWeight: 600, background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)', textAlign: 'left' }}
            >
              Nesta e nas futuras
              <span style={{ display: 'block', fontSize: 12, fontWeight: 400, color: 'var(--text-muted)', marginTop: 2 }}>Ocorrências passadas continuarão com o valor antigo.</span>
            </button>
            <button
              onClick={() => confirmRecurrenceAction('all')}
              style={{ padding: '14px', borderRadius: 12, fontSize: 14, fontWeight: 600, background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)', textAlign: 'left' }}
            >
              Em todas as ocorrências
              <span style={{ display: 'block', fontSize: 12, fontWeight: 400, color: 'var(--saida)', marginTop: 2 }}>Cuidado: isso vai alterar seu histórico passado também.</span>
            </button>
          </div>
        </div>
      </Modal>

      {ToastNode}
    </>
  );
}
