import { useState, useEffect } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { auth, googleProvider, isConfigured } from '../firebase';

export function useAuth() {
  const [user, setUser] = useState(isConfigured ? undefined : null);
  const [justLoggedIn, setJustLoggedIn] = useState(false);
  const [redirectError, setRedirectError] = useState(null);

  useEffect(() => {
    if (!isConfigured) return;
    
    getRedirectResult(auth)
      .then(result => {
        if (result) setJustLoggedIn(true);
      })
      .catch(err => {
        console.error("Redirect Error:", err);
        setRedirectError(err);
      });

    return onAuthStateChanged(auth, u => setUser(u || null));
  }, []);

  const login = (email, password) => signInWithEmailAndPassword(auth, email, password);
  const register = (email, password) => createUserWithEmailAndPassword(auth, email, password);
  const loginWithGoogle = () => signInWithRedirect(auth, googleProvider);
  const logout = () => signOut(auth);

  return { user, login, register, loginWithGoogle, logout, justLoggedIn, redirectError };
}
