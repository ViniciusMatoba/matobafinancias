import { useState, useEffect } from 'react';
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';

export function useTransactions(uid) {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) { setTransactions([]); setLoading(false); return; }
    // Sem orderBy no servidor para evitar dependência de índice; ordenamos no cliente
    return onSnapshot(
      collection(db, `transactions/${uid}/entries`),
      snap => {
        const txs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        txs.sort((a, b) => (b.dataInicio || '').localeCompare(a.dataInicio || ''));
        setTransactions(txs);
        setLoading(false);
      },
      err => { console.error('[useTransactions]', err.code, err.message); setLoading(false); }
    );
  }, [uid]);

  const add = async (data) => {
    const clean = removeUndef({ ...data, uid, criadoEm: serverTimestamp() });
    return addDoc(collection(db, `transactions/${uid}/entries`), clean);
  };

  const update = async (id, data) => {
    const clean = removeUndef(data);
    return updateDoc(doc(db, `transactions/${uid}/entries`, id), clean);
  };

  const remove = async (id) => deleteDoc(doc(db, `transactions/${uid}/entries`, id));

  return { transactions, loading, add, update, remove };
}

function removeUndef(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}
