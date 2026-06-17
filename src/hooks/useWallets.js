import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * @typedef {Object} Wallet
 * @property {string}  id
 * @property {string}  nome
 * @property {number}  saldoInicial    — saldo base que entra no cálculo de sobra segura
 * @property {string}  [tipo]          — 'corrente' | 'poupanca' | 'investimento' | etc.
 * @property {string}  [cor]           — hex color para display
 */

export function useWallets(userId) {
  const [wallets, setWallets] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      Promise.resolve().then(() => {
        setWallets([]);
        setLoading(false);
      });
      return;
    }

    const q = query(collection(db, 'wallets'), where('userId', '==', userId));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = [];
      snapshot.forEach(doc => {
        data.push({ id: doc.id, ...doc.data() });
      });
      // Sort alphabetically
      data.sort((a, b) => a.nome.localeCompare(b.nome));
      setWallets(data);
      setLoading(false);
    }, (err) => {
      console.error('[useWallets]', err.code, err.message);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [userId]);

  const add = async (walletData) => {
    if (!userId) return;
    await addDoc(collection(db, 'wallets'), {
      ...walletData,
      userId,
      criadoEm: serverTimestamp()
    });
  };

  const update = async (id, walletData) => {
    if (!userId) return;
    const ref = doc(db, 'wallets', id);
    await updateDoc(ref, walletData);
  };

  const remove = async (id) => {
    if (!userId) return;
    await deleteDoc(doc(db, 'wallets', id));
  };

  return { wallets, loading, add, update, remove };
}
