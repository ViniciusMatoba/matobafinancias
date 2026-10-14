import { useState } from 'react';
import { criarDadosDemo } from './dados';

let seq = 0;
export function useCards() {
  const [cards, setCards] = useState(() => criarDadosDemo().cards);
  const add = async (data) => { const id = `cartao${++seq}`; setCards(l => [...l, { ...data, id }]); return { id }; };
  const update = async (id, data) => setCards(l => l.map(c => (c.id === id ? { ...c, ...data } : c)));
  const remove = async (id) => setCards(l => l.filter(c => c.id !== id));
  return { cards, loading: false, add, update, remove };
}
