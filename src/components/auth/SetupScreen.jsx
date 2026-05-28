import { DollarSign, ExternalLink, Copy, Check } from 'lucide-react';
import { useState } from 'react';

const STEPS = [
  {
    n: 1,
    title: 'Criar projeto Firebase',
    desc: 'Acesse console.firebase.google.com e crie um novo projeto.',
    link: 'https://console.firebase.google.com',
  },
  {
    n: 2,
    title: 'Ativar Authentication',
    desc: 'No menu lateral: Authentication → Começar → E-mail/senha → Ativar.',
  },
  {
    n: 3,
    title: 'Criar banco de dados Firestore',
    desc: 'No menu lateral: Firestore Database → Criar banco → Modo produção.',
  },
  {
    n: 4,
    title: 'Obter configurações do app',
    desc: 'Configurações do projeto → Seus apps → Web → Registrar app → Copiar firebaseConfig.',
  },
  {
    n: 5,
    title: 'Preencher o .env.local',
    desc: 'Abra o arquivo .env.local na pasta do projeto e cole os valores correspondentes.',
    code: true,
  },
];

export default function SetupScreen() {
  const [copied, setCopied] = useState(false);

  const envExample = `VITE_FIREBASE_API_KEY=sua-api-key
VITE_FIREBASE_AUTH_DOMAIN=projeto.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=nome-do-projeto
VITE_FIREBASE_STORAGE_BUCKET=projeto.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123:web:abc`;

  const copy = () => {
    navigator.clipboard.writeText(envExample);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '32px 24px' }}>
      {/* Logo */}
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div style={{
          width: 64, height: 64, borderRadius: 18,
          background: 'linear-gradient(135deg, #6366f1, #a855f7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 16px',
          boxShadow: '0 8px 32px rgba(99,102,241,0.4)',
        }}>
          <DollarSign size={32} color="#fff" />
        </div>
        <h1 style={{ margin: '0 0 8px', fontSize: 24, fontWeight: 700 }}>Matoba Finanças</h1>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--text-secondary)' }}>
          Configure o Firebase para começar
        </p>
      </div>

      {STEPS.map(step => (
        <div key={step.n} style={{
          display: 'flex', gap: 14, marginBottom: 20,
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 14, padding: '14px',
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
            background: 'linear-gradient(135deg, #6366f1, #a855f7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 700, color: '#fff',
          }}>
            {step.n}
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
              {step.title}
            </p>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              {step.desc}
            </p>
            {step.link && (
              <a href={step.link} target="_blank" rel="noreferrer" style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                marginTop: 8, fontSize: 13, color: 'var(--primary)', textDecoration: 'none',
              }}>
                Abrir Console Firebase <ExternalLink size={12} />
              </a>
            )}
            {step.code && (
              <div style={{ marginTop: 10, position: 'relative' }}>
                <pre style={{
                  margin: 0, padding: '12px', borderRadius: 8,
                  background: 'var(--bg-primary)', border: '1px solid var(--border)',
                  fontSize: 11, color: 'var(--text-secondary)', overflowX: 'auto',
                  fontFamily: 'monospace', lineHeight: 1.6,
                }}>
                  {envExample}
                </pre>
                <button onClick={copy} style={{
                  position: 'absolute', top: 8, right: 8,
                  background: 'var(--bg-card)', borderRadius: 6,
                  padding: '4px 8px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4,
                  color: copied ? 'var(--entrada)' : 'var(--text-secondary)',
                  border: '1px solid var(--border)',
                }}>
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                  {copied ? 'Copiado!' : 'Copiar'}
                </button>
              </div>
            )}
          </div>
        </div>
      ))}

      <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-muted)', marginTop: 8 }}>
        Após preencher o .env.local, reinicie o servidor com <code style={{ background: 'var(--bg-card)', padding: '2px 6px', borderRadius: 4, fontSize: 12 }}>npm run dev</code>
      </p>
    </div>
  );
}
