import { useState, useEffect } from 'react';
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';

/**
 * @typedef {Object} Card
 * @property {string}  id
 * @property {string}  nome
 * @property {number}  limite
 * @property {number}  diaFechamento   — dia do mês em que fecha a fatura
 * @property {number}  diaVencimento   — dia do mês em que vence a fatura
 * @property {string}  [cor]           — hex color para display
 * @property {string}  [bandeira]      — 'visa' | 'mastercard' | etc.
 */

export function useCards(uid) {
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) {
      Promise.resolve().then(() => {
        setCards([]);
        setLoading(false);
      });
      return;
    }
    return onSnapshot(
      collection(db, `cards/${uid}/list`),
      snap => {
        setCards(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      err => {
        console.error('[useCards]', err.code, err.message);
        setLoading(false);
      }
    );
  }, [uid]);

  const add = async (data) =>
    addDoc(collection(db, `cards/${uid}/list`), { ...data, uid, criadoEm: serverTimestamp() });

  const update = async (id, data) =>
    updateDoc(doc(db, `cards/${uid}/list`, id), data);

  const remove = async (id) =>
    deleteDoc(doc(db, `cards/${uid}/list`, id));

  return { cards, loading, add, update, remove };
}
