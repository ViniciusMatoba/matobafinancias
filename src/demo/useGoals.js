import { useState } from 'react';
import { criarDadosDemo } from './dados';

let seq = 0;
export function useGoals() {
  const [goals, setGoals] = useState(() => criarDadosDemo().goals);
  const add = async (data) => { const id = `meta${++seq}`; setGoals(l => [...l, { ...data, id }]); return { id }; };
  const update = async (id, data) => setGoals(l => l.map(g => (g.id === id ? { ...g, ...data } : g)));
  const remove = async (id) => setGoals(l => l.filter(g => g.id !== id));
  return { goals, loading: false, add, update, remove };
}
