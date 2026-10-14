import { useState } from 'react';
import { criarDadosDemo } from './dados';

export const DEFAULT_CONFIG = { metaMensalDiario: 0, rendaMensal: 0, budgetPcts: {}, onboardingDone: false, tags: [] };

export function useConfig() {
  const [config, setConfig] = useState(() => criarDadosDemo().config);
  const saveConfig = async (updates) => setConfig(c => {
    const next = { ...c, ...updates };
    if (updates.budgetPcts) next.budgetPcts = { ...c.budgetPcts, ...updates.budgetPcts };
    return next;
  });
  return { config, configLoading: false, saveConfig };
}
