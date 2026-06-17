import { useState, useEffect } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db, isConfigured } from '../firebase';
import { DEFAULT_BUDGET_PCTS } from '../utils/categories';

/**
 * @typedef {Object} Config
 * @property {number}              metaMensalDiario  — meta diária de gastos (R$)
 * @property {number}              rendaMensal       — renda mensal declarada (R$)
 * @property {Record<string,number>} budgetPcts      — percentual de orçamento por categoria
 * @property {boolean}             onboardingDone
 * @property {boolean}             [tourDone]
 * @property {string}              [telegramChatId]
 */

export const DEFAULT_CONFIG = {
  metaMensalDiario: 0,
  rendaMensal: 0,
  budgetPcts: { ...DEFAULT_BUDGET_PCTS },
  onboardingDone: false,
};

export function useConfig(uid) {
  const [config, setConfigState] = useState(DEFAULT_CONFIG);
  const [configLoading, setConfigLoading] = useState(true);

  useEffect(() => {
    if (!uid || !isConfigured) {
      Promise.resolve().then(() => {
        setConfigLoading(false);
      });
      return;
    }
    return onSnapshot(
      doc(db, `config/${uid}`),
      snap => {
        if (snap.exists()) {
          setConfigState({
            ...DEFAULT_CONFIG,
            ...snap.data(),
            budgetPcts: { ...DEFAULT_BUDGET_PCTS, ...snap.data().budgetPcts },
          });
        }
        setConfigLoading(false);
      },
      err => { console.error('[useConfig]', err.code, err.message); setConfigLoading(false); }
    );
  }, [uid]);

  const saveConfig = async (updates) => {
    if (!uid) return;
    const next = { ...config, ...updates };
    if (updates.budgetPcts) next.budgetPcts = { ...config.budgetPcts, ...updates.budgetPcts };
    setConfigState(next);
    await setDoc(doc(db, `config/${uid}`), next, { merge: true });
  };

  return { config, configLoading, saveConfig };
}
