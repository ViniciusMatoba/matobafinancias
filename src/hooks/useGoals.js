import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

export function useGoals(userId) {
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      Promise.resolve().then(() => {
        setGoals([]);
        setLoading(false);
      });
      return;
    }

    const q = query(collection(db, 'goals'), where('userId', '==', userId));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = [];
      snapshot.forEach(doc => {
        data.push({ id: doc.id, ...doc.data() });
      });
      // Sort by creation date (fallback to name)
      data.sort((a, b) => {
        if (a.criadoEm && b.criadoEm) {
          return b.criadoEm.toMillis() - a.criadoEm.toMillis();
        }
        return a.nome.localeCompare(b.nome);
      });
      setGoals(data);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [userId]);

  const add = async (goalData) => {
    if (!userId) return;
    await addDoc(collection(db, 'goals'), {
      ...goalData,
      userId,
      criadoEm: serverTimestamp()
    });
  };

  const update = async (id, goalData) => {
    if (!userId) return;
    const ref = doc(db, 'goals', id);
    await updateDoc(ref, goalData);
  };

  const remove = async (id) => {
    if (!userId) return;
    await deleteDoc(doc(db, 'goals', id));
  };

  return { goals, loading, add, update, remove };
}
