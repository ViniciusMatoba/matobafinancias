import { useState, useEffect } from 'react';
import { isConfigured } from './firebase';
import { useAuth } from './hooks/useAuth';
import { useTransactions } from './hooks/useTransactions';
import { useCards } from './hooks/useCards';
import { useWallets } from './hooks/useWallets';
import { useGoals } from './hooks/useGoals';
import { useConfig } from './hooks/useConfig';
import { useToast } from './components/shared/Toast';
import AuthScreen from './components/auth/AuthScreen';
import SetupScreen from './components/auth/SetupScreen';
import SetupGoalsScreen from './components/onboarding/SetupGoalsScreen';
import HomeScreen from './components/home/HomeScreen';
import TransactionsScreen from './components/transactions/TransactionsScreen';
import ProjectionScreen from './components/projection/ProjectionScreen';
import GoalsScreen from './components/goals/GoalsScreen';
import SettingsScreen from './components/settings/SettingsScreen';
import BottomNav from './components/shared/BottomNav';
import ReloadPrompt from './components/shared/ReloadPrompt';
import Modal from './components/shared/Modal';
import TransactionForm from './components/transactions/TransactionForm';
import { DollarSign } from 'lucide-react';

export default function App() {
  const { user, login, register, loginWithGoogle, logout, justLoggedIn, redirectError } = useAuth();
  const { transactions, add, update, remove } = useTransactions(user?.uid);
  const { cards, add: addCard, update: updateCard, remove: removeCard } = useCards(user?.uid);
  const { wallets, add: addWallet, update: updateWallet, remove: removeWallet } = useWallets(user?.uid);
  const { goals, add: addGoal, update: updateGoal, remove: removeGoal } = useGoals(user?.uid);
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

  // ── Registrar pagamento a partir da Projeção ──────────────────────────────────
  const handlePay = async (item, occDate, { paymentDate, valor, scope }) => {
    const tx        = item.tx;
    const isCartao  = tx.tipo === 'cartao';
    const isVirtual = String(tx.id).includes('-proj-');

    try {
      // Cartão ou projeção virtual de parcelas → cria lançamento de pagamento
      if (isCartao || isVirtual) {
        const nomeDesc = tx.descricao ? `Pagamento Fatura – ${tx.descricao}` : 'Pagamento de Fatura';
        await add({
          tipo:       'saida',
          frequencia: 'unico',
          descricao:  nomeDesc,
          valor,
          dataInicio: paymentDate,
          categoria:  'custos_fixos',
          dataFim:    null,
        });
        showToast('✅ Pagamento de fatura registrado!');
        return;
      }

      // Lançamento único ou parcela → atualiza a data diretamente
      if (tx.frequencia === 'unico' || tx.frequencia === 'parcelado') {
        await update(tx.id, { dataInicio: paymentDate, valor });
        showToast('✅ Pagamento registrado!');
        return;
      }

      // Recorrente (mensal / semanal / diario)
      if (scope === 'single') {
        // Cria exceção para esta ocorrência e novo lançamento único na data real
        const exclusoes = [...(tx.exclusoes || [])];
        if (!exclusoes.includes(occDate)) exclusoes.push(occDate);
        await update(tx.id, { exclusoes });
        await add({
          tipo:       tx.tipo,
          frequencia: 'unico',
          descricao:  tx.descricao,
          valor,
          dataInicio: paymentDate,
          categoria:  tx.categoria || null,
          dataFim:    null,
        });
        showToast('✅ Pagamento registrado (só esta ocorrência)!');
      } else if (scope === 'future') {
        // Encerra a série atual no dia anterior à ocorrência
        const d = new Date(`${occDate}T12:00:00`);
        d.setDate(d.getDate() - 1);
        const dataFim = d.toISOString().slice(0, 10);
        await update(tx.id, { dataFim });
        // Nova série a partir da data de pagamento (mesmo padrão de frequência)
        // eslint-disable-next-line no-unused-vars
        const { id: _id, exclusoes: _excl, dataFim: _df, ...txBase } = tx;
        await add({ ...txBase, dataInicio: paymentDate, valor, dataFim: null, exclusoes: [] });
        showToast('✅ Pagamento e próximas ocorrências atualizados!');
      }
    } catch (err) {
      console.error('[handlePay]', err);
      showToast('Erro ao registrar pagamento.', 'error');
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
          wallets={wallets}
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
      {view === 'goals' && (
        <GoalsScreen
          goals={goals}
          transactions={transactions}
          onAddGoal={addGoal}
          onUpdateGoal={updateGoal}
          onRemoveGoal={removeGoal}
          onAddTransaction={(prefill) => {
            setEditing(prefill);
            setFormOpen(true);
          }}
        />
      )}
      {view === 'projection' && (
        <ProjectionScreen
          transactions={transactions}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onPay={handlePay}
        />
      )}
      {view === 'settings' && (
        <SettingsScreen
          user={user}
          cards={cards}
          wallets={wallets}
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
        />
      )}

      <BottomNav view={view} onNavigate={handleNavigate} />
      <ReloadPrompt hidden={view === 'settings'} />

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
