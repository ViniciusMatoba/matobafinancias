import { useState, useEffect } from 'react';
import { isConfigured } from './firebase';
import { useAuth } from './hooks/useAuth';
import { useVersionCheck, triggerUpdate } from './hooks/useVersionCheck';
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
import ReportsScreen from './components/reports/ReportsScreen';
import TourGuide from './components/shared/TourGuide';
import BottomNav from './components/shared/BottomNav';
import ReloadPrompt from './components/shared/ReloadPrompt';
import Modal from './components/shared/Modal';
import TransactionForm from './components/transactions/TransactionForm';
import { DollarSign } from 'lucide-react';
import PaymentModal from './components/projection/PaymentModal';
import { addMonths } from './utils/formatters';

export default function App() {
  const { user, login, register, loginWithGoogle, logout, justLoggedIn, redirectError } = useAuth();
  const { transactions, add, update, remove } = useTransactions(user?.uid);
  const { cards, add: addCard, update: updateCard, remove: removeCard } = useCards(user?.uid);
  const { wallets, add: addWallet, update: updateWallet, remove: removeWallet } = useWallets(user?.uid);
  const { goals, add: addGoal, update: updateGoal, remove: removeGoal } = useGoals(user?.uid);
  const { config, configLoading, saveConfig } = useConfig(user?.uid);
  const { showToast, ToastNode } = useToast();
  const { updateAvailable, latestVersion, latestNotes } = useVersionCheck();

  const [view, setView] = useState('home');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [editingOccDate, setEditingOccDate] = useState(null);
  const [authConfirmed, setAuthConfirmed] = useState(false);
  const [recurrenceAction, setRecurrenceAction] = useState(null);
  const [cartaoEditScope, setCartaoEditScope] = useState(null);
  const [payingItem, setPayingItem] = useState(null); // { item, occDate }
  const [tourActive, setTourActive] = useState(false);

  // Atualização do PWA só pode ser aplicada na tela de login
  const isLoginScreen = !isConfigured || user === undefined || !user || !authConfirmed;

  // Se o usuário acabou de voltar de um login Google via redirect
  useEffect(() => {
    if (justLoggedIn) setAuthConfirmed(true);
  }, [justLoggedIn]);

  // Ativa o tour guiado se o onboarding estiver concluído e o tour não tiver sido feito
  useEffect(() => {
    if (user && config && config.onboardingDone && !config.tourDone) {
      setTourActive(true);
    }
  }, [user, config]);

  const handleCompleteTour = async () => {
    setTourActive(false);
    await saveConfig({ tourDone: true });
    showToast('🏆 Tour guiado concluído! Aproveite o app.');
  };

  // Função auxiliar para renderizar a tela ativa com base no estado de forma estável
  const renderScreen = () => {
    if (!isConfigured) return <SetupScreen />;

    if (user === undefined || (user && configLoading)) {
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
            config={config}
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
            wallets={wallets}
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
            config={config}
            onNavigate={handleNavigate}
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
            onResetTour={async () => { await saveConfig({ tourDone: false }); setView('home'); }}
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

        {/* Modal de escopo de edição de fatura parcelada */}
        {cartaoEditScope && (() => {
          const itens = cartaoEditScope.cleanData.itens || [];
          const dataBase = cartaoEditScope.editingOccDate || cartaoEditScope.editing?.dataInicio || '';
          const endDate = getParceladoEndDate(itens, dataBase);
          const endFormatted = endDate
            ? new Date(`${endDate}T12:00:00`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
            : '';
          return (
            <Modal
              open
              onClose={() => setCartaoEditScope(null)}
              title="Editar fatura parcelada"
            >
              <div style={{ padding: '0 4px', color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.5 }}>
                <p style={{ marginBottom: 4 }}>
                  Esta fatura contém compras parceladas.
                </p>
                {endFormatted && (
                  <p style={{ marginBottom: 20, fontWeight: 600, color: 'var(--text-primary)' }}>
                    As parcelas vão até <span style={{ color: 'var(--entrada)' }}>{endFormatted}</span>.
                  </p>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <button
                    onClick={() => confirmCartaoEditScope('single')}
                    style={{ padding: '14px', borderRadius: 12, fontSize: 14, fontWeight: 600, background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)', textAlign: 'left' }}
                  >
                    Somente esta fatura
                    <span style={{ display: 'block', fontSize: 12, fontWeight: 400, color: 'var(--text-muted)', marginTop: 2 }}>As faturas futuras não serão alteradas.</span>
                  </button>
                  <button
                    onClick={() => confirmCartaoEditScope('future')}
                    style={{ padding: '14px', borderRadius: 12, fontSize: 14, fontWeight: 600, background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)', textAlign: 'left' }}
                  >
                    Esta e todas as futuras
                    <span style={{ display: 'block', fontSize: 12, fontWeight: 400, color: 'var(--text-muted)', marginTop: 2 }}>Todas as faturas a partir de agora serão atualizadas.</span>
                  </button>
                </div>
              </div>
            </Modal>
          );
        })()}

        {/* Modal de pagamento — centralizado, acessível de todas as telas */}
        {payingItem && (
          <PaymentModal
            item={payingItem.item}
            occDate={payingItem.occDate}
            onConfirm={confirmPayment}
            onClose={() => setPayingItem(null)}
          />
        )}

        {/* Tour Guiado */}
        {tourActive && (
          <TourGuide onComplete={handleCompleteTour} />
        )}
      </>
    );
  };

  // ── Ajuste manual do saldo global ────────────────────────────────────────────
  const handleAdjustBalance = async (diff, justificativa) => {
    const today = new Date().toISOString().slice(0, 10);
    const isPositive = diff > 0;
    const valor = Math.abs(diff);

    const descricao = isPositive
      ? 'Ajuste de saldo'
      : `Ajuste de saldo – ${justificativa}`;

    await add({
      tipo:       isPositive ? 'entrada' : 'saida',
      frequencia: 'unico',
      descricao,
      valor,
      dataInicio: today,
      categoria:  null,
      dataFim:    null,
      conferido:  true,
    });

    showToast(
      isPositive
        ? `✅ Saldo ajustado: +${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor)}`
        : `✅ Ajuste de saldo registrado: −${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor)}`
    );
  };

  const handleNavigate = (dest) => {
    if (dest === 'add') { setEditing(null); setFormOpen(true); return; }
    setView(dest);
  };

  const handleEdit = (tx, occDate) => { setEditing(tx); setEditingOccDate(occDate); setFormOpen(true); };

  const handleClone = (tx) => {
    // eslint-disable-next-line no-unused-vars
    const { id, criadoEm, exclusoes, dataFim, ...cloneBase } = tx;
    const cloned = {
      ...cloneBase,
      dataInicio: new Date().toISOString().slice(0, 10),
    };
    setEditing(cloned);
    setEditingOccDate(null);
    setFormOpen(true);
  };

  const hasParceladoRestante = (itens) =>
    itens?.some(i => i.isParcelado && (i.totalParcelas || 1) > (i.parcelaAtual || 1));

  const getParceladoEndDate = (itens, dataInicio) => {
    let maxRestante = 0;
    itens?.forEach(i => {
      if (i.isParcelado) {
        const restante = (i.totalParcelas || 1) - (i.parcelaAtual || 1);
        if (restante > maxRestante) maxRestante = restante;
      }
    });
    return addMonths(dataInicio, maxRestante);
  };

  // Faturas virtuais têm IDs que não existem no Firestore (gerados em projectionCalc)
  const isVirtualTxId = (id) => !!id && !transactions.find(t => t.id === id);

  const handleSave = async (data) => {
    const { _overwriteId, ...cleanData } = data;

    // Fatura de cartão com itens parcelados com parcelas restantes → perguntar escopo
    if (cleanData.tipo === 'cartao' && hasParceladoRestante(cleanData.itens) && editing) {
      const isVirtualProj = isVirtualTxId(editing.id);
      const parentId = isVirtualProj ? editing.id.split('-proj-')[0] : null;
      const parentTx = parentId ? transactions.find(t => t.id === parentId) : null;
      setCartaoEditScope({ cleanData, isVirtualProj, parentId, parentTx, editing, editingOccDate });
      setFormOpen(false);
      setEditing(null);
      setEditingOccDate(null);
      return;
    }

    // Caso de edição de fatura de cartão virtual projetada (sem parcelado restante)
    if (editing && isVirtualTxId(editing.id) && editingOccDate) {
      const parentId = editing.id.split('-proj-')[0];
      const parentTx = transactions.find(t => t.id === parentId);
      if (parentTx) {
        const exclusoes = [...(parentTx.exclusoes || [])];
        if (!exclusoes.includes(editingOccDate)) exclusoes.push(editingOccDate);
        await update(parentId, { exclusoes });
        await add({
          ...cleanData,
          tipo: 'cartao',
          frequencia: 'unico',
          dataInicio: editingOccDate,
          descricao: cleanData.descricao?.replace(/\s*\(Parcelas restantes\)/i, '').trim() || parentTx.descricao,
          categoria: null,
          dataFim: null,
          itens: (cleanData.itens || editing.itens || []).map(i => ({ ...i, isParcelado: false })),
          cartaoId: parentTx.cartaoId || editing.cartaoId || null,
        });
        showToast('Fatura editada!');
      }
      setFormOpen(false);
      setEditing(null);
      setEditingOccDate(null);
      return;
    }

    if (editing && ['diario','semanal','mensal','parcelado'].includes(editing.frequencia) && editingOccDate) {
      setRecurrenceAction({ tx: editing, occDate: editingOccDate, newData: cleanData, action: 'edit' });
      setFormOpen(false);
      setEditing(null);
      setEditingOccDate(null);
      return;
    }

    if ((editing && editing.id) || _overwriteId) {
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

  const confirmCartaoEditScope = async (scope) => {
    const { cleanData, isVirtualProj, parentId, parentTx, editing: editingSnap, editingOccDate: occDate } = cartaoEditScope;
    setCartaoEditScope(null);

    if (scope === 'single') {
      if (isVirtualProj && parentTx) {
        // Exclui esta data do pai + cria fatura real congelada (sem projeções futuras)
        const exclusoes = [...(parentTx.exclusoes || [])];
        if (!exclusoes.includes(occDate)) exclusoes.push(occDate);
        await update(parentId, { exclusoes });
        await add({
          ...cleanData,
          tipo: 'cartao',
          frequencia: 'unico',
          dataInicio: occDate,
          descricao: cleanData.descricao?.replace(/\s*\(Parcelas restantes\)/i, '').trim() || parentTx.descricao,
          categoria: null,
          dataFim: null,
          itens: (cleanData.itens || []).map(i => ({ ...i, isParcelado: false })),
          cartaoId: parentTx.cartaoId || editingSnap.cartaoId || null,
        });
      } else {
        // Doc real: congela este mês + cria novo doc fonte a partir do mês seguinte com itens originais
        const { id: _id, criadoEm: _c, ...originalBase } = editingSnap;
        const nextDate = addMonths(editingSnap.dataInicio, 1);
        const continuationItens = (editingSnap.itens || []).map(i =>
          i.isParcelado ? { ...i, parcelaAtual: (i.parcelaAtual || 1) + 1 } : i
        );
        await update(editingSnap.id, {
          ...cleanData,
          itens: (cleanData.itens || []).map(i => ({ ...i, isParcelado: false })),
        });
        await add({ ...originalBase, dataInicio: nextDate, exclusoes: [], itens: continuationItens });
      }
      showToast('Fatura editada (somente esta)!');
    } else {
      // 'future' — esta e todas as futuras
      if (isVirtualProj && parentTx) {
        // Encerra o pai antes desta data + cria novo doc real que vira nova fonte
        const d = new Date(`${occDate}T12:00:00`);
        d.setDate(d.getDate() - 1);
        const dataFimPai = d.toISOString().slice(0, 10);
        await update(parentId, { dataFim: dataFimPai });
        await add({
          ...cleanData,
          tipo: 'cartao',
          frequencia: 'unico',
          dataInicio: occDate,
          descricao: cleanData.descricao?.replace(/\s*\(Parcelas restantes\)/i, '').trim() || parentTx.descricao,
          categoria: null,
          dataFim: null,
          itens: cleanData.itens || [],
          cartaoId: parentTx.cartaoId || editingSnap.cartaoId || null,
        });
      } else {
        // Doc real: atualiza o doc fonte — todas as projeções futuras refletem automaticamente
        await update(editingSnap.id, cleanData);
      }
      showToast('Fatura e futuras atualizadas!');
    }
  };

  const handleDelete = async (id, occDate) => {
    // Caso de remoção de fatura de cartão virtual projetada
    if (isVirtualTxId(id)) {
      const parentId = id.split('-proj-')[0];
      const parentTx = transactions.find(t => t.id === parentId);
      if (parentTx && window.confirm('Remover esta fatura projetada?')) {
        const exclusoes = [...(parentTx.exclusoes || [])];
        if (!exclusoes.includes(occDate)) exclusoes.push(occDate);
        await update(parentId, { exclusoes });
        showToast('Fatura projetada removida.');
      }
      return;
    }

    const tx = transactions.find(t => t.id === id);
    if (!tx) return;
    
    if (['diario','semanal','mensal','parcelado'].includes(tx.frequencia) && occDate) {
      setRecurrenceAction({ tx, occDate, action: 'delete' });
      return;
    }

    if (window.confirm('Remover este lançamento?')) {
      await remove(id);
      showToast('Lançamento removido.', 'error');
    }
  };

  // ── Registrar pagamento (centralizado — usado por todas as telas) ─────────────
  const openPayModal = (item, occDate) => setPayingItem({ item, occDate });

  const confirmPayment = async ({ paymentDate, valor, scope }) => {
    if (!payingItem) return;
    const { item, occDate } = payingItem;
    setPayingItem(null);
    const tx        = item.tx;
    const isCartao  = tx.tipo === 'cartao';
    const isVirtual = isVirtualTxId(tx.id);

    try {
      if (isVirtual) {
        const parentId = tx.id.split('-proj-')[0];
        const parentTx = transactions.find(t => t.id === parentId);
        if (!parentTx) {
          showToast('Erro: Transação pai não encontrada.', 'error');
          return;
        }

        // 1. Exclui a projeção virtual na data futura programada
        const exclusoes = [...(parentTx.exclusoes || [])];
        if (!exclusoes.includes(occDate)) exclusoes.push(occDate);
        await update(parentId, { exclusoes });

        // 2. Cria a fatura real paga hoje contendo todo o conteúdo (itens) correspondente
        await add({
          tipo:       'cartao',
          frequencia: 'unico',
          descricao:  tx.descricao ? `Pagamento Fatura – ${tx.descricao}` : 'Pagamento de Fatura',
          valor,
          dataInicio: paymentDate,
          categoria:  null,
          dataFim:    null,
          itens:      tx.itens || [],
          cartaoId:   tx.cartaoId || null,
          conferido:  true,
        });

        showToast('✅ Pagamento de fatura antecipado!');
        return;
      }

      if (isCartao && !isVirtual) {
        // Atualiza diretamente a data e o valor da fatura de cartão no banco de dados e marca como pago.
        // Os itens internos associados permanecem na mesma transação e se movem com ela.
        await update(tx.id, { dataInicio: paymentDate, valor, conferido: true });
        showToast('✅ Fatura do cartão movimentada para a data de pagamento!');
        return;
      }

      // Lançamento único ou parcela → atualiza a data diretamente e marca como pago
      if (tx.frequencia === 'unico' || tx.frequencia === 'parcelado') {
        await update(tx.id, { dataInicio: paymentDate, valor, conferido: true });
        showToast('✅ Pagamento registrado!');
        return;
      }

      // Recorrente (mensal / semanal / diario)
      if (scope === 'single') {
        // Cria exceção para esta ocorrência e novo lançamento único na data real e marca como pago
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
          conferido:  true,
        });
        showToast('✅ Pagamento registrado (só esta ocorrência)!');
      } else if (scope === 'future') {
        // Encerra a série atual no dia anterior à ocorrência
        const d = new Date(`${occDate}T12:00:00`);
        d.setDate(d.getDate() - 1);
        const dataFim = d.toISOString().slice(0, 10);
        await update(tx.id, { dataFim });
        // Nova série a partir da data de pagamento (mesmo padrão de frequência) com o primeiro dia pago
        // eslint-disable-next-line no-unused-vars
        const { id: _id, exclusoes: _excl, dataFim: _df, ...txBase } = tx;
        await add({ ...txBase, dataInicio: paymentDate, valor, dataFim: null, exclusoes: [] });
        showToast('✅ Pagamento e próximas ocorrências atualizados!');
      }
    } catch (err) {
      console.error('[confirmPayment]', err);
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
      {/* ── Banner global de nova versão — visível para todos os usuários ── */}
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
                <p style={{
                  margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.82)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {latestNotes[0]}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={triggerUpdate}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: '#fff', color: '#6366f1',
              padding: '7px 14px', borderRadius: 8,
              fontSize: 12, fontWeight: 700, border: 'none', cursor: 'pointer',
              flexShrink: 0, boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            }}
          >
            🔄 Atualizar
          </button>
        </div>
      )}

      {renderScreen()}
      <ReloadPrompt />
      {ToastNode}
    </>
  );
}
