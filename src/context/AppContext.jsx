import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useTransactions } from '../hooks/useTransactions';
import { useCards } from '../hooks/useCards';
import { useWallets } from '../hooks/useWallets';
import { useGoals } from '../hooks/useGoals';
import { useConfig } from '../hooks/useConfig';
import { useVersionCheck, triggerUpdate } from '../hooks/useVersionCheck';
import { useToast } from '../components/shared/Toast';
import { addMonths, todayStr } from '../utils/formatters';
import { expandOccurrences } from '../utils/projectionCalc';
import { PERCENTUAL_CATEGORIES } from '../utils/categories';

const AppContext = createContext(null);

export function useAppState() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppState must be used inside AppProvider');
  return ctx;
}

export function AppProvider({ user, children }) {
  const uid = user?.uid;

  // ── Dados do Firestore ────────────────────────────────────────────────────────
  const { transactions, loading: transactionsLoading, add, update, remove } = useTransactions(uid);
  const { cards, loading: cardsLoading, add: addCard, update: updateCard, remove: removeCard } = useCards(uid);
  const { wallets, loading: walletsLoading, add: addWallet, update: updateWallet, remove: removeWallet } = useWallets(uid);
  const { goals, loading: goalsLoading, add: addGoal, update: updateGoal, remove: removeGoal } = useGoals(uid);
  const { config, configLoading, saveConfig } = useConfig(uid);
  const { showToast, ToastNode } = useToast();
  const { updateAvailable, latestVersion, latestNotes } = useVersionCheck();

  const dataLoading = configLoading || transactionsLoading || walletsLoading || goalsLoading || cardsLoading;

  // ── Estado de UI ──────────────────────────────────────────────────────────────
  const [view, setView] = useState('home');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [editingOccDate, setEditingOccDate] = useState(null);
  const [recurrenceAction, setRecurrenceAction] = useState(null);
  const [cartaoEditScope, setCartaoEditScope] = useState(null);
  const [payingItem, setPayingItem] = useState(null);
  const [tourActive, setTourActive] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [showMonthRecap, setShowMonthRecap] = useState(false);
  const [monthRecapData, setMonthRecapData] = useState(null);

  // ── Helpers ───────────────────────────────────────────────────────────────────
  const txIdSet = useMemo(() => new Set(transactions.map(t => t.id)), [transactions]);
  const isVirtualTxId = useCallback((id) => !!id && !txIdSet.has(id), [txIdSet]);

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

  const checkBudgetAlert = (cleanData, currentTransactions) => {
    const rendaMensal = config?.rendaMensal || 0;
    const budgetPcts  = config?.budgetPcts  || {};
    if (rendaMensal <= 0) return null;

    const cat = cleanData.tipo === 'cartao' ? null : cleanData.categoria;
    if (!cat || !(cat in PERCENTUAL_CATEGORIES)) return null;

    const today = todayStr();
    const monthPrefix = today.slice(0, 7);
    const from = `${monthPrefix}-01`;
    const lastDay = new Date(Number(monthPrefix.slice(0,4)), Number(monthPrefix.slice(5,7)), 0).getDate();
    const to = `${monthPrefix}-${String(lastDay).padStart(2,'0')}`;

    const allWithNew = [...currentTransactions, { ...cleanData, id: '__new__', criadoEm: null }];
    let gasto = 0;
    allWithNew.forEach(tx => {
      if (tx.tipo === 'entrada') return;
      expandOccurrences(tx, from, to).forEach(() => {
        if (tx.categoria === cat) gasto += Number(tx.valor) || 0;
      });
    });

    const budget = (rendaMensal * (Number(budgetPcts[cat]) || 0)) / 100;
    if (budget <= 0) return null;

    const pct = Math.round((gasto / budget) * 100);
    if (pct < 80) return null;

    return { catLabel: PERCENTUAL_CATEGORIES[cat]?.label || cat, pct, budget, gasto };
  };

  // ── Efeitos ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (user && config && config.onboardingDone && !config.tourDone) {
      Promise.resolve().then(() => setTourActive(true));
    }
  }, [user, config]);

  useEffect(() => {
    if (!user || !transactions.length || dataLoading) return;
    const today = new Date();
    if (today.getDate() > 5) return;
    const recapKey = `matoba:recap:${user.uid}:${today.toISOString().slice(0, 7)}`;
    if (localStorage.getItem(recapKey)) return;

    const prevMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const prevY = prevMonth.getFullYear();
    const prevM = prevMonth.getMonth() + 1;
    const prevMonthStr = `${prevY}-${String(prevM).padStart(2,'0')}`;
    const from = `${prevMonthStr}-01`;
    const lastDay = new Date(prevY, prevM, 0).getDate();
    const to   = `${prevMonthStr}-${String(lastDay).padStart(2,'0')}`;

    let entradas = 0, saidas = 0;
    const catTotals = {};
    transactions.forEach(tx => {
      expandOccurrences(tx, from, to).forEach(occ => {
        if (occ.sinal > 0) entradas += occ.valor;
        else {
          saidas += occ.valor;
          const cat = tx.categoria || 'outros';
          catTotals[cat] = (catTotals[cat] || 0) + occ.valor;
        }
      });
    });

    const rendaMensal = config?.rendaMensal || 0;
    const budgetPcts  = config?.budgetPcts  || {};
    let melhorCat = null, piorCat = null;
    let melhorPct = Infinity, piorPct = -Infinity;
    Object.entries(catTotals).forEach(([catId, gasto]) => {
      const budget = rendaMensal > 0 ? (rendaMensal * (budgetPcts[catId] || 0)) / 100 : 0;
      if (budget > 0) {
        const pct = gasto / budget;
        if (pct < melhorPct) { melhorPct = pct; melhorCat = catId; }
        if (pct > piorPct)   { piorPct  = pct; piorCat  = catId; }
      }
    });

    const MONTH_NAMES_FULL = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    Promise.resolve().then(() => {
      setMonthRecapData({
        mesNome: MONTH_NAMES_FULL[prevM - 1],
        entradas, saidas, resultado: entradas - saidas,
        melhorCat: melhorCat ? PERCENTUAL_CATEGORIES[melhorCat]?.label : null,
        piorCat:   piorCat   ? PERCENTUAL_CATEGORIES[piorCat]?.label   : null,
        recapKey,
      });
      setShowMonthRecap(true);
    });
  }, [user, transactions, dataLoading, config?.rendaMensal, config?.budgetPcts]);

  // ── Handlers ──────────────────────────────────────────────────────────────────
  const handleUpdate = async () => {
    setIsUpdating(true);
    setTimeout(() => window.location.reload(), 8000);
    await triggerUpdate();
  };

  const handleCompleteTour = async () => {
    setTourActive(false);
    await saveConfig({ tourDone: true });
    showToast('🏆 Tour guiado concluído! Aproveite o app.');
  };

  const handleNavigate = useCallback((dest) => {
    if (dest === 'add') { setEditing(null); setFormOpen(true); return; }
    setView(dest);
  }, []);

  const handleEdit = useCallback((tx, occDate) => {
    setEditing(tx);
    setEditingOccDate(occDate);
    setFormOpen(true);
  }, []);

  const handleClone = useCallback((tx) => {
    // eslint-disable-next-line no-unused-vars
    const { id, criadoEm, exclusoes, dataFim, ...cloneBase } = tx;
    setEditing({ ...cloneBase, dataInicio: new Date().toISOString().slice(0, 10) });
    setEditingOccDate(null);
    setFormOpen(true);
  }, []);

  const openPayModal = (item, occDate) => setPayingItem({ item, occDate });

  const handleAdjustBalance = async (diff, justificativa) => {
    const today = new Date().toISOString().slice(0, 10);
    const isPositive = diff > 0;
    const valor = Math.abs(diff);
    const descricao = isPositive ? 'Ajuste de saldo' : `Ajuste de saldo – ${justificativa}`;

    try {
      await add({ tipo: isPositive ? 'entrada' : 'saida', frequencia: 'unico', descricao, valor, dataInicio: today, categoria: null, dataFim: null, conferido: true });
      showToast(
        isPositive
          ? `✅ Saldo ajustado: +${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor)}`
          : `✅ Ajuste de saldo registrado: −${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor)}`
      );
    } catch (err) {
      console.error('[handleAdjustBalance]', err);
      showToast('Erro ao ajustar saldo. Tente novamente.', 'error');
    }
  };

  const handleSave = async (data) => {
    const { _overwriteId, ...cleanData } = data;

    if (cleanData.tipo === 'cartao' && hasParceladoRestante(cleanData.itens) && editing && isVirtualTxId(editing.id)) {
      const isVirtualProj = true;
      const parentId = isVirtualProj ? editing.id.split('-proj-')[0] : null;
      const parentTx = parentId ? transactions.find(t => t.id === parentId) : null;
      setCartaoEditScope({ cleanData, isVirtualProj, parentId, parentTx, editing, editingOccDate });
      setFormOpen(false);
      setEditing(null);
      setEditingOccDate(null);
      return;
    }

    if (editing && isVirtualTxId(editing.id) && editingOccDate) {
      const parentId = editing.id.split('-proj-')[0];
      const parentTx = transactions.find(t => t.id === parentId);
      if (parentTx) {
        try {
          const exclusoes = [...(parentTx.exclusoes || [])];
          if (!exclusoes.includes(editingOccDate)) exclusoes.push(editingOccDate);
          await update(parentId, { exclusoes });
          await add({
            ...cleanData, tipo: 'cartao', frequencia: 'unico', dataInicio: editingOccDate,
            descricao: cleanData.descricao?.replace(/\s*\(Parcelas restantes\)/i, '').trim() || parentTx.descricao,
            categoria: null, dataFim: null,
            itens: (cleanData.itens || editing.itens || []).map(i => ({ ...i, isParcelado: false })),
            cartaoId: parentTx.cartaoId || editing.cartaoId || null,
          });
          showToast('Fatura editada!');
        } catch (err) {
          console.error('[handleSave/cartaoVirtual]', err);
          showToast('Erro ao editar fatura. Tente novamente.', 'error');
        }
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

    try {
      if ((editing && editing.id) || _overwriteId) {
        const id = editing?.id || _overwriteId;
        await update(id, cleanData);
        showToast(_overwriteId && !editing ? 'Lançamento substituído!' : 'Lançamento atualizado!');
      } else {
        await add(cleanData);
        showToast('Lançamento adicionado com sucesso!');
      }
    } catch (err) {
      console.error('[handleSave]', err);
      showToast('Erro ao salvar lançamento. Tente novamente.', 'error');
      return;
    }
    setFormOpen(false);
    setEditing(null);
    setEditingOccDate(null);

    if (cleanData.tipo !== 'entrada') {
      const alert = checkBudgetAlert(cleanData, transactions);
      if (alert) {
        setTimeout(() => {
          if (alert.pct >= 100) {
            showToast(`🚨 Orçamento de ${alert.catLabel} estourado! (${alert.pct}% do limite)`, 'error');
          } else {
            showToast(`⚠️ ${alert.catLabel} em ${alert.pct}% do orçamento mensal`);
          }
        }, 600);
      }
    }
  };

  const confirmCartaoEditScope = async (scope) => {
    const { cleanData, isVirtualProj, parentId, parentTx, editing: editingSnap, editingOccDate: occDate } = cartaoEditScope;
    setCartaoEditScope(null);

    try {
      if (scope === 'single') {
        if (isVirtualProj && parentTx) {
          const exclusoes = [...(parentTx.exclusoes || [])];
          if (!exclusoes.includes(occDate)) exclusoes.push(occDate);
          await update(parentId, { exclusoes });
          await add({
            ...cleanData, tipo: 'cartao', frequencia: 'unico', dataInicio: occDate,
            descricao: cleanData.descricao?.replace(/\s*\(Parcelas restantes\)/i, '').trim() || parentTx.descricao,
            categoria: null, dataFim: null,
            itens: (cleanData.itens || []).map(i => ({ ...i, isParcelado: false })),
            cartaoId: parentTx.cartaoId || editingSnap.cartaoId || null,
          });
        } else {
          const originalBase = { ...editingSnap };
          delete originalBase.id;
          delete originalBase.criadoEm;
          const nextDate = addMonths(editingSnap.dataInicio, 1);
          const continuationItens = (editingSnap.itens || []).map(i =>
            i.isParcelado ? { ...i, parcelaAtual: (i.parcelaAtual || 1) + 1 } : i
          );
          await update(editingSnap.id, { ...cleanData, itens: (cleanData.itens || []).map(i => ({ ...i, isParcelado: false })) });
          await add({ ...originalBase, dataInicio: nextDate, exclusoes: [], itens: continuationItens });
        }
        showToast('Fatura editada (somente esta)!');
      } else {
        if (isVirtualProj && parentTx) {
          const d = new Date(`${occDate}T12:00:00`);
          d.setDate(d.getDate() - 1);
          await update(parentId, { dataFim: d.toISOString().slice(0, 10) });
          await add({
            ...cleanData, tipo: 'cartao', frequencia: 'unico', dataInicio: occDate,
            descricao: cleanData.descricao?.replace(/\s*\(Parcelas restantes\)/i, '').trim() || parentTx.descricao,
            categoria: null, dataFim: null, itens: cleanData.itens || [],
            cartaoId: parentTx.cartaoId || editingSnap.cartaoId || null,
          });
        } else {
          await update(editingSnap.id, cleanData);
        }
        showToast('Fatura e futuras atualizadas!');
      }
    } catch (err) {
      console.error('[confirmCartaoEditScope]', err);
      showToast('Erro ao editar fatura. Tente novamente.', 'error');
    }
  };

  const handleDelete = useCallback(async (id, occDate) => {
    if (isVirtualTxId(id)) {
      const parentId = id.split('-proj-')[0];
      const parentTx = transactions.find(t => t.id === parentId);
      if (parentTx && window.confirm('Remover esta fatura projetada?')) {
        try {
          const exclusoes = [...(parentTx.exclusoes || [])];
          if (!exclusoes.includes(occDate)) exclusoes.push(occDate);
          await update(parentId, { exclusoes });
          showToast('Fatura projetada removida.');
        } catch (err) {
          console.error('[handleDelete]', err);
          showToast('Erro ao remover fatura. Tente novamente.', 'error');
        }
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
      try {
        await remove(id);
        showToast('Lançamento removido.', 'error');
      } catch (err) {
        console.error('[handleDelete]', err);
        showToast('Erro ao remover lançamento. Tente novamente.', 'error');
      }
    }
  }, [isVirtualTxId, transactions, update, remove, showToast]);

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
        if (!parentTx) { showToast('Erro: Transação pai não encontrada.', 'error'); return; }
        const exclusoes = [...(parentTx.exclusoes || [])];
        if (!exclusoes.includes(occDate)) exclusoes.push(occDate);
        await update(parentId, { exclusoes });
        await add({ tipo: 'cartao', frequencia: 'unico', descricao: tx.descricao ? `Pagamento Fatura – ${tx.descricao}` : 'Pagamento de Fatura', valor, dataInicio: paymentDate, categoria: null, dataFim: null, itens: tx.itens || [], cartaoId: tx.cartaoId || null, conferido: true });
        showToast('✅ Pagamento de fatura antecipado!');
        return;
      }
      if (isCartao && !isVirtual) {
        await update(tx.id, { dataInicio: paymentDate, valor, conferido: true });
        showToast('✅ Fatura do cartão movimentada para a data de pagamento!');
        return;
      }
      if (!tx.frequencia || tx.frequencia === 'unico' || tx.frequencia === 'parcelado') {
        await update(tx.id, { dataInicio: paymentDate, valor, conferido: true });
        showToast('✅ Pagamento registrado!');
        return;
      }
      if (scope === 'single') {
        const exclusoes = [...(tx.exclusoes || [])];
        if (!exclusoes.includes(occDate)) exclusoes.push(occDate);
        await update(tx.id, { exclusoes });
        await add({ tipo: tx.tipo, frequencia: 'unico', descricao: tx.descricao, valor, dataInicio: paymentDate, categoria: tx.categoria || null, dataFim: null, conferido: true });
        showToast('✅ Pagamento registrado (só esta ocorrência)!');
      } else if (scope === 'future') {
        const d = new Date(`${occDate}T12:00:00`);
        d.setDate(d.getDate() - 1);
        await update(tx.id, { dataFim: d.toISOString().slice(0, 10) });
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

    try {
      if (action === 'delete') {
        if (scope === 'single') {
          const exclusoes = tx.exclusoes || [];
          if (!exclusoes.includes(occDate)) exclusoes.push(occDate);
          await update(tx.id, { exclusoes });
          showToast('Ocorrência removida.');
        } else if (scope === 'future') {
          const d = new Date(`${occDate}T12:00:00`);
          d.setDate(d.getDate() - 1);
          await update(tx.id, { dataFim: d.toISOString().slice(0, 10) });
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
          const eraConferido = tx.conferidos?.includes(occDate) ?? false;
          await add({ ...newData, frequencia: 'unico', dataInicio: occDate, dataFim: null, conferido: eraConferido });
          showToast('Ocorrência editada separadamente!');
        } else if (scope === 'future') {
          const d = new Date(`${occDate}T12:00:00`);
          d.setDate(d.getDate() - 1);
          await update(tx.id, { dataFim: d.toISOString().slice(0, 10) });
          await add({ ...newData, dataInicio: occDate });
          showToast('Ocorrências futuras alteradas!');
        } else {
          await update(tx.id, newData);
          showToast('Série completa atualizada!');
        }
      }
    } catch (err) {
      console.error('[confirmRecurrenceAction]', err);
      showToast('Erro ao processar ação. Tente novamente.', 'error');
    }
  };

  const value = {
    // dados
    transactions, cards, wallets, goals, config, saveConfig, dataLoading,
    add, update, remove,
    addCard, updateCard, removeCard,
    addWallet, updateWallet, removeWallet,
    addGoal, updateGoal, removeGoal,
    // versão/update
    updateAvailable, latestVersion, latestNotes, isUpdating, handleUpdate,
    // ui
    view, setView,
    formOpen, setFormOpen,
    editing, setEditing,
    editingOccDate, setEditingOccDate,
    recurrenceAction, setRecurrenceAction,
    cartaoEditScope, setCartaoEditScope,
    payingItem, setPayingItem,
    tourActive, setTourActive,
    showMonthRecap, setShowMonthRecap,
    monthRecapData, setMonthRecapData,
    // toast
    showToast, ToastNode,
    // handlers
    handleNavigate, handleEdit, handleClone,
    handleSave, handleDelete, handleAdjustBalance,
    openPayModal, confirmPayment,
    confirmCartaoEditScope, confirmRecurrenceAction,
    handleCompleteTour,
    // helpers
    isVirtualTxId, getParceladoEndDate,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
