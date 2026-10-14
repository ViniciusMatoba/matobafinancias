import { useEffect } from 'react';

const USUARIO_DEMO = { uid: 'demo', email: 'demo@local.test', displayName: 'Demonstração' };

// Faixa fixa avisando que os dados são fictícios e não vão para lugar nenhum
function marcarDemo() {
  if (document.getElementById('faixa-demo')) return;
  const faixa = document.createElement('div');
  faixa.id = 'faixa-demo';
  faixa.textContent = 'MODO DEMONSTRAÇÃO — dados fictícios, nada é salvo';
  faixa.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#f59e0b;color:#000;' +
    'font:700 11px sans-serif;text-align:center;padding:2px;pointer-events:none';
  document.body.appendChild(faixa);
}

export function useAuth() {
  useEffect(marcarDemo, []);
  const nada = async () => {};
  return {
    user: USUARIO_DEMO, login: nada, register: nada, loginWithGoogle: nada, logout: nada,
    justLoggedIn: false, redirectError: null,
  };
}
