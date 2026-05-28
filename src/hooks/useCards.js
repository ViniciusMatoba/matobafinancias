import { useState, useEffect } from 'react';
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';

export function useCards(uid) {
  const [cards, setCards] = useState([]);

  useEffect(() => {
    if (!uid) { setCards([]); return; }
    return onSnapshot(
      collection(db, `cards/${uid}/list`),
      snap => { setCards(snap.docs.map(d => ({ id: d.id, ...d.data() }))); },
      err => { console.error('[useCards]', err.code, err.message); }
    );
  }, [uid]);

  const add = async (data) =>
    addDoc(collection(db, `cards/${uid}/list`), { ...data, uid, criadoEm: serverTimestamp() });

  const update = async (id, data) =>
    updateDoc(doc(db, `cards/${uid}/list`, id), data);

  const remove = async (id) =>
    deleteDoc(doc(db, `cards/${uid}/list`, id));

  return { cards, add, update, remove };
}
