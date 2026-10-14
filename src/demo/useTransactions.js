import { useState } from 'react';
import { criarDadosDemo } from './dados';

let seq = 0;
export function useTransactions() {
  const [transactions, setTransactions] = useState(() => criarDadosDemo().transactions);
  const add = async (data) => { const id = `novo${++seq}`; setTransactions(l => [...l, { ...data, id }]); return { id }; };
  const update = async (id, data) => setTransactions(l => l.map(t => (t.id === id ? { ...t, ...data } : t)));
  const remove = async (id) => setTransactions(l => l.filter(t => t.id !== id));
  const updateMany = async (updates) => setTransactions(l => l.map(t => {
    const u = (updates || []).find(x => x.id === t.id);
    return u ? { ...t, ...(u.data || u) } : t;
  }));
  return { transactions, loading: false, add, update, updateMany, remove };
}
