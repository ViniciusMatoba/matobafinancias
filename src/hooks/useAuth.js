import { useState, useEffect } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
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
  const loginWithGoogle = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      return result;
    } catch (error) {
      if (error.code === 'auth/popup-blocked') {
        // Fallback para mobile que bloqueia popups
        await signInWithRedirect(auth, googleProvider);
      } else {
        throw error;
      }
    }
  };
  const logout = () => signOut(auth);

  return { user, login, register, loginWithGoogle, logout, justLoggedIn, redirectError };
}
