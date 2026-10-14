import { useState } from 'react';
import { criarDadosDemo } from './dados';

let seq = 0;
export function useWallets() {
  const [wallets, setWallets] = useState(() => criarDadosDemo().wallets);
  const add = async (data) => { const id = `carteira${++seq}`; setWallets(l => [...l, { ...data, id }]); return { id }; };
  const update = async (id, data) => setWallets(l => l.map(w => (w.id === id ? { ...w, ...data } : w)));
  const remove = async (id) => setWallets(l => l.filter(w => w.id !== id));
  return { wallets, loading: false, add, update, remove };
}
