import { useState, useEffect } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithRedirect,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { auth, googleProvider, isConfigured } from '../firebase';

export function useAuth() {
  const [user, setUser] = useState(isConfigured ? undefined : null);

  useEffect(() => {
    if (!isConfigured) return;
    return onAuthStateChanged(auth, u => setUser(u || null));
  }, []);

  const login = (email, password) => signInWithEmailAndPassword(auth, email, password);
  const register = (email, password) => createUserWithEmailAndPassword(auth, email, password);
  const loginWithGoogle = () => signInWithRedirect(auth, googleProvider);
  const logout = () => signOut(auth);

  return { user, login, register, loginWithGoogle, logout };
}
