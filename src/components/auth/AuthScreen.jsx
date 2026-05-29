import { useState } from 'react';
import { DollarSign } from 'lucide-react';
import { useInstallPrompt } from '../../hooks/useInstallPrompt';

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18L12.048 13.56C11.24 14.1 10.211 14.42 9 14.42c-2.341 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.659 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  );
}

const ERROR_MSGS = {
  'auth/invalid-credential':    'Email ou senha incorretos.',
  'auth/email-already-in-use':  'Email já cadastrado.',
  'auth/weak-password':         'Senha muito fraca (mínimo 6 caracteres).',
  'auth/invalid-email':         'Email inválido.',
  'auth/user-not-found':        'Usuário não encontrado.',
  'auth/wrong-password':        'Senha incorreta.',
  'auth/popup-closed-by-user':  'Login cancelado.',
  'auth/cancelled-popup-request': 'Login cancelado.',
  'auth/unauthorized-domain':   'Domínio não autorizado. Adicione "viniciusmatoba.github.io" no painel do Firebase (Authentication > Configurações > Domínios autorizados).',
};

const CHANGELOG_DATA = [
  {
    version: 'v1.5.3 (29/05/2026)',
    title: 'Edição e Exclusão de Projeções 🛠️',
    items: [
      'Correção na exclusão e edição de faturas de cartão projetadas (virtuais): agora é possível remover ou editar faturas futuras, gerando a exclusão na transação pai de cartão e permitindo criar exceções personalizadas.',
      'Suporte completo a lançamentos parcelados: a edição e exclusão de ocorrências individuais de compras parceladas agora segue o mesmo padrão flexível de recorrência (apenas esta, esta e próximas, todas) e respeita a data final definida no motor de projeção.'
    ]
  },
  {
    version: 'v1.5.2 (29/05/2026)',
    title: 'Notificações PWA Globais & Ajustes Finos 🚀',
    items: [
      'Configuração global das notificações de atualização do PWA em todas as telas, garantindo que usuários logados recebam avisos imediatos de novas versões sem depender da tela de login.',
      'Implementação de botão de fechar (X) com persistência diária em localStorage no banner inteligente de Sobra Segura na Home, permitindo ocultar recomendações temporariamente por 24 horas.'
    ]
  },
  {
    version: 'v1.5.1 (29/05/2026)',
    title: 'Correção de Pagamentos Antecipados 💳',
    items: [
      'Resolução definitiva na antecipação de faturas de cartão: ao pagar antecipadamente, a fatura programada e suas cobranças internas (itens) são movidas juntas para a data do pagamento real, limpando o dia futuro.',
      'Sincronização do motor de projeção de parcelas para evitar duplicidades visuais e respeitar exclusões de faturas pagas.'
    ]
  },
  {
    version: 'v1.5.0 (29/05/2026)',
    title: 'Controle de Pagamentos & Projeções Inteligentes 💸',
    items: [
      'Novo botão universal "Pagar" na Projeção, Home e Histórico com modal centralizado para simplificar o controle.',
      'Planejamento anual expandido, histórico avançado de transações com filtros e conciliação manual rápida.',
      'Relatórios financeiros em formato PDF de alto padrão prontos para exportação direta.',
      'Painel dinâmico de contas próximas a vencer no topo da Home e limite detalhado de cartões de crédito.'
    ]
  },
  {
    version: 'v1.4.0 (29/05/2026)',
    title: 'Educação Financeira & Controle de Impulsos 🧘‍♂️',
    items: [
      'Painel "Pense com Calma" para controle de compras impulsivas com contagem regressiva de 10 dias.',
      'Cálculo de impacto em dias comerciais de trabalho (Preço / Salário Diário) e porcentagem da categoria.',
      'Scoreboard de Economia Acumulada persistente com animação de confetes ao desistir de compras supérfluas.',
      'Simulador "Viver de Renda" nas Caixinhas de Independência Financeira (FIRE) com projeção de juros compostos.',
      'Guia tributário real de investimentos com orientações sobre Poupança, CDB/Selic, LCI/LCA e Ações/FIIs.',
      'Novo banner inteligente de Sobra Segura ciente da conclusão da sua Reserva de Emergência.',
      'Higienização completa de marcas anteriores para o termo neutro "Divisão Percentual".',
      'Personalização de Tooltips gráficos com dia da semana e variação acumulada colorida.'
    ]
  },
  {
    version: 'v1.3.0 (28/05/2026)',
    title: 'Pagamentos em Lote & Navegação Precisa 💸',
    items: [
      'Novo recurso de lote rápido "Pagar" para faturas e lançamentos recorrentes.',
      'Paginação mensal fixa por calendário na Projeção (resolvendo furos do dia 31).',
      'Visão flexível de Resumo por Período customizado.',
      'Lançamentos recorrentes diários automáticos com divisão por 30 (rateio).'
    ]
  },
  {
    version: 'v1.2.0 (15/05/2026)',
    title: 'Segurança & Sincronização offline 🔒',
    items: [
      'Criptografia completa ponta a ponta com o Firebase Authentication.',
      'Suporte offline completo PWA e instalação na tela inicial.',
      'Integração com o Bot de Telegram para consultas rápidas de saldo e limites.'
    ]
  }
];

export default function AuthScreen({ user, redirectError, onLogin, onRegister, onLoginWithGoogle, onConfirm, onLogout }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(redirectError ? ERROR_MSGS[redirectError.code] || `Erro: ${redirectError.message}` : '');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const { prompt: deferredPrompt, handleInstall: handleInstallClick } = useInstallPrompt();
  const [showChangelog, setShowChangelog] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'login') await onLogin(email, password);
      else await onRegister(email, password);
    } catch (err) {
      setError(ERROR_MSGS[err.code] || `Erro: ${err.code} - ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError('');
    setGoogleLoading(true);
    try {
      await onLoginWithGoogle();
    } catch (err) {
      if (err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-popup-request') {
        setError(ERROR_MSGS[err.code] || `Erro Google: ${err.code}`);
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100dvh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '32px 24px',
      background: 'linear-gradient(160deg, #0f172a 0%, #0a0f1e 100%)',
    }}>
      {/* Logo */}
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <div style={{
          width: 64, height: 64, borderRadius: 18,
          background: 'linear-gradient(135deg, #6366f1, #a855f7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 16px',
          boxShadow: '0 8px 32px rgba(99,102,241,0.4)',
        }}>
          <DollarSign size={32} color="#fff" />
        </div>
        <h1 style={{ margin: '0 0 6px', fontSize: 26, fontWeight: 700, color: 'var(--text-primary)' }}>
          Matoba Finanças
        </h1>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--text-secondary)' }}>
          Controle financeiro pessoal
        </p>
      </div>

      {/* Card */}
      <div style={{
        width: '100%', maxWidth: 380,
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 20,
        padding: '28px 24px',
      }}>
        {user ? (
          <div style={{ textAlign: 'center' }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>Olá novamente!</h2>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 28 }}>
              Você está conectado como<br />
              <strong style={{ color: 'var(--text-primary)' }}>{user.email}</strong>
            </p>
            
            <button
              onClick={onConfirm}
              style={{
                width: '100%', padding: '14px', borderRadius: 12, fontSize: 15, fontWeight: 600,
                background: 'linear-gradient(135deg, #6366f1, #a855f7)', color: '#fff',
                border: 'none', cursor: 'pointer', marginBottom: 16,
                boxShadow: '0 4px 20px rgba(99,102,241,0.4)',
              }}
            >
              Entrar no aplicativo
            </button>
            
            <button
              onClick={onLogout}
              style={{
                width: '100%', padding: '14px', borderRadius: 12, fontSize: 14, fontWeight: 500,
                background: 'transparent', color: 'var(--text-muted)',
                border: '1px solid var(--border)', cursor: 'pointer',
              }}
            >
              Entrar com outra conta
            </button>
          </div>
        ) : (
          <>
            {/* Google */}
            <button
              onClick={handleGoogle}
              disabled={googleLoading}
              style={{
                width: '100%', padding: '13px', borderRadius: 12,
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                fontSize: 15, fontWeight: 500, color: 'var(--text-primary)',
                marginBottom: 20, cursor: googleLoading ? 'default' : 'pointer',
                opacity: googleLoading ? 0.6 : 1,
                transition: 'border-color 0.2s',
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--primary)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
            >
              <GoogleIcon />
              {googleLoading ? 'Aguarde...' : 'Continuar com Google'}
            </button>

            {/* Divisor */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>ou</span>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            </div>

            {/* Tab toggle */}
            <div style={{
              display: 'flex', background: 'var(--bg-primary)',
              borderRadius: 10, padding: 4, marginBottom: 20,
            }}>
              {['login', 'register'].map(m => (
                <button
                  key={m}
                  onClick={() => { setMode(m); setError(''); }}
                  style={{
                    flex: 1, padding: '8px', borderRadius: 8, fontSize: 14, fontWeight: 500,
                    background: mode === m ? 'var(--primary)' : 'transparent',
                    color: mode === m ? '#fff' : 'var(--text-secondary)',
                    transition: 'all 0.2s', border: 'none', cursor: 'pointer'
                  }}
                >
                  {m === 'login' ? 'Entrar' : 'Cadastrar'}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>Email</label>
                <input
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>Senha</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                />
              </div>

              {error && (
                <p style={{
                  margin: 0, padding: '10px 12px',
                  background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                  borderRadius: 8, fontSize: 13, color: '#ef4444',
                }}>
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                style={{
                  marginTop: 4, padding: '14px', borderRadius: 12, fontSize: 15, fontWeight: 600,
                  background: loading ? 'var(--border)' : 'linear-gradient(135deg, #6366f1, #a855f7)',
                  color: '#fff', cursor: loading ? 'default' : 'pointer', border: 'none',
                  boxShadow: loading ? 'none' : '0 4px 20px rgba(99,102,241,0.4)',
                }}
              >
                {loading ? 'Aguarde...' : mode === 'login' ? 'Entrar' : 'Criar conta'}
              </button>
            </form>
          </>
        )}
      </div>

      {/* Botao de Instalacao do PWA */}
      {deferredPrompt ? (
        <button
          onClick={handleInstallClick}
          style={{
            marginTop: 24, padding: '12px 24px', borderRadius: 12,
            background: 'rgba(99,102,241,0.15)', border: '1px solid var(--primary)',
            color: 'var(--primary)', fontSize: 14, fontWeight: 600,
            display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(99,102,241,0.2)'
          }}
        >
          Baixar aplicativo
        </button>
      ) : (
        <div style={{
          marginTop: 22,
          width: '100%',
          maxWidth: 380,
          padding: '12px 14px',
          borderRadius: 14,
          background: 'rgba(99,102,241,0.1)',
          border: '1px solid rgba(99,102,241,0.25)',
          color: 'var(--text-secondary)',
          fontSize: 12,
          lineHeight: 1.5,
          textAlign: 'center',
        }}>
          Para instalar no celular, abra o menu do navegador e escolha
          <strong style={{ color: 'var(--text-primary)' }}> Adicionar a tela inicial</strong>.
        </div>
      )}

      {/* Rótulo de versão com notas de atualização */}
      <div style={{ marginTop: 24, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          Versão v1.5.3
        </span>
        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>•</span>
        <button
          type="button"
          onClick={() => setShowChangelog(true)}
          style={{
            background: 'none', border: 'none', color: 'var(--primary)',
            fontSize: 12, fontWeight: 600, padding: 0, cursor: 'pointer',
            textDecoration: 'underline'
          }}
        >
          Notas de Atualização
        </button>
      </div>

      {/* Janela Modal do Changelog */}
      {showChangelog && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
          background: 'rgba(10, 15, 30, 0.85)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '20px', zIndex: 10000
        }}>
          <div style={{
            width: '100%', maxWidth: 440, background: 'var(--bg-surface)',
            border: '1px solid var(--border)', borderRadius: 20,
            padding: '24px', display: 'flex', flexDirection: 'column', gap: 16,
            maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 20px 50px rgba(0,0,0,0.5)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                🆕 Histórico de Alterações
              </h3>
              <button 
                type="button"
                onClick={() => setShowChangelog(false)}
                style={{
                  background: 'var(--bg-card)', border: '1px solid var(--border)',
                  color: 'var(--text-primary)', padding: '6px 12px', borderRadius: 8,
                  fontSize: 12, fontWeight: 600, cursor: 'pointer'
                }}
              >
                Fechar
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {CHANGELOG_DATA.map((ch, idx) => (
                <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--primary)', background: 'rgba(99,102,241,0.1)', padding: '2px 6px', borderRadius: 4 }}>
                      {ch.version}
                    </span>
                    <strong style={{ fontSize: 13, color: 'var(--text-primary)' }}>{ch.title}</strong>
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 20, color: 'var(--text-secondary)', fontSize: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {ch.items.map((it, itemIdx) => (
                      <li key={itemIdx}>{it}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
