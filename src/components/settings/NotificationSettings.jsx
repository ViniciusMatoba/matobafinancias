import { useState } from 'react';
import { Bell, BellOff, CheckCircle, XCircle, Play, Loader, RefreshCw, Send } from 'lucide-react';
import { formatBRL, todayStr } from '../../utils/formatters';
import { SARDINHA_CATEGORIES, CATEGORY_ORDER } from '../../utils/categories';
import { expandOccurrences, buildDailyProjection, calcSaldo } from '../../utils/projectionCalc';
import { useNotifications } from '../../hooks/useNotifications';

// Preferências padrão (todas ativas)
const DEFAULT_TIPOS = { n1: true, n2: true, n3: true, n4: true, n5: true, n6: true, n7: true };

// Metadados dos tipos de notificação
const TIPO_INFO = {
  n1: { label: 'Fatura vence hoje',         icon: '💳', desc: 'Avisa no dia em que uma fatura de cartão vence' },
  n2: { label: 'Fatura vence em 3 dias',    icon: '📅', desc: 'Lembrete antecipado para não perder o vencimento' },
  n3: { label: 'Fatura fecha em 2 dias',    icon: '⏰', desc: 'Alerta quando a fatura está prestes a fechar' },
  n4: { label: 'Orçamento acima de 80%',    icon: '⚠️', desc: 'Avisa quando uma categoria passa de 80% do limite mensal' },
  n5: { label: 'Orçamento estourado',       icon: '🚨', desc: 'Avisa quando uma categoria ultrapassa 100% do orçamento' },
  n6: { label: 'Saldo negativo em 7 dias',  icon: '📉', desc: 'Projeção detecta saldo negativo na próxima semana' },
  n7: { label: 'Resumo semanal',            icon: '📊', desc: 'Toda segunda-feira: total de entradas, saídas e saldo da semana' },
};

// ─── Cálculo de gasto por categoria (mesmo regime de BudgetSummaryCard) ───────
function computeSpent(transactions, currentMonth) {
  const totals = Object.fromEntries(CATEGORY_ORDER.map(id => [id, 0]));
  const [year, mon] = currentMonth.split('-').map(Number);
  const from     = `${currentMonth}-01`;
  const lastDay  = new Date(year, mon, 0).getDate();
  const to       = `${currentMonth}-${String(lastDay).padStart(2, '0')}`;

  transactions.forEach(tx => {
    // Regime de competência para cartão com itens
    if (tx.tipo === 'cartao' && tx.itens?.length > 0) {
      tx.itens.forEach(item => {
        const cat = item.categoria;
        if (!cat || totals[cat] === undefined) return;
        if (item.isParcelado) {
          const startParc = item.parcelaAtual || 1;
          const remaining = (item.totalParcelas || 1) - startParc + 1;
          for (let i = 0; i < remaining; i++) {
            const [y, m] = item.dataCompra.split('-').map(Number);
            const pd    = new Date(y, m - 1 + i, 1);
            const pMonth = `${pd.getFullYear()}-${String(pd.getMonth() + 1).padStart(2, '0')}`;
            if (pMonth === currentMonth) totals[cat] += Number(item.valor) || 0;
          }
        } else {
          if (item.dataCompra?.startsWith(currentMonth)) totals[cat] += Number(item.valor) || 0;
        }
      });
    } else {
      // Regime de caixa para demais
      const occs = expandOccurrences(tx, from, to);
      if (!occs.length) return;
      const cat = tx.categoria || (tx.tipo === 'investimento' ? 'liberdade' : null);
      if (!cat) return;
      occs.forEach(o => { totals[cat] = (totals[cat] || 0) + o.valor; });
    }
  });
  return totals;
}

// ─── Toggle visual ────────────────────────────────────────────────────────────
function Toggle({ value, onChange }) {
  return (
    <button
      onClick={() => onChange(!value)}
      style={{
        width: 40, height: 22, borderRadius: 11, border: 'none',
        background: value ? 'var(--primary)' : 'var(--border)',
        position: 'relative', cursor: 'pointer',
        transition: 'background 0.2s', flexShrink: 0,
      }}
    >
      <span style={{
        position: 'absolute', top: 3,
        left: value ? 21 : 3,
        width: 16, height: 16, borderRadius: '50%',
        background: '#fff', transition: 'left 0.2s',
      }} />
    </button>
  );
}

function DiagnosticItem({ label, ok, value }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)',
    }}>
      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{label}</span>
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        fontSize: 11, fontWeight: 600,
        color: ok ? 'var(--entrada)' : 'var(--text-muted)',
      }}>
        {ok ? <CheckCircle size={12} /> : <XCircle size={12} />}
        {value || (ok ? 'OK' : 'Pendente')}
      </span>
    </div>
  );
}

// ─── Componente principal ──────────────────────────────────────────────────────
export default function NotificationSettings({ user, cards, transactions, config, onSavePrefs }) {
  const {
    permission,
    supported,
    registering,
    diagnostics,
    diagnosticsLoading,
    testSending,
    testResult,
    enableNotifications,
    refreshDiagnostics,
    sendTestPush,
  } = useNotifications(user);

  const prefs = config?.notificacoes || { enabled: false, tipos: { ...DEFAULT_TIPOS } };
  const tipos = { ...DEFAULT_TIPOS, ...(prefs.tipos || {}) };

  const [testingId, setTestingId] = useState(null);
  const [activateError, setActivateError] = useState('');

  // ── Salvar preferências ──────────────────────────────────────────────────────
  const savePrefs    = (patch) => onSavePrefs({ notificacoes: { ...prefs, ...patch } });
  const saveTipo     = (id, val) => savePrefs({ tipos: { ...tipos, [id]: val } });

  // ── Ativar notificações ──────────────────────────────────────────────────────
  const handleEnable = async () => {
    setActivateError('');
    const result = await enableNotifications();
    if (result.ok) {
      savePrefs({ enabled: true });
    } else if (result.reason === 'denied') {
      // A UI já reflete o estado "bloqueado" automaticamente
    } else if (result.reason === 'error') {
      setActivateError(`Erro ao ativar: ${result.message || 'verifique o console do navegador.'}`);
    }
  };

  const handleSendTestPush = async () => {
    setActivateError('');
    const result = await sendTestPush();
    if (!result.ok) {
      setActivateError(result.message || 'Erro ao enviar push de teste.');
    }
  };

  // ── Exibir notificação local (teste) ─────────────────────────────────────────
  // Android bloqueia new Notification() na thread principal.
  // A única forma confiável é serviceWorker.ready → showNotification().
  // Não usamos navigator.serviceWorker.controller porque pode ser null na
  // primeira carga (antes do SW reivindicar a página via clients.claim()).
  const showNotif = async (title, body, tag = 'test') => {
    if (Notification.permission !== 'granted') {
      alert(`[Prévia da notificação]\n\n${title}\n${body}`);
      return;
    }
    const opts = {
      body,
      icon:    './icons/icon-192.png',
      badge:   './icons/icon-192.png',
      tag,
      data:    { url: './' },
      vibrate: [200, 100, 200],
    };

    if ('serviceWorker' in navigator) {
      // serviceWorker.ready aguarda o SW ficar ativo (resolve mesmo sem controller)
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(title, opts); // await para capturar erros
      return;
    }
    // Fallback desktop puro (sem service worker)
    new Notification(title, opts);
  };

  // ── Funções de teste com dados reais ─────────────────────────────────────────
  const runTest = async (id) => {
    setTestingId(id);
    setActivateError('');
    try {
      const today       = new Date();
      const todayDay    = today.getDate();
      const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

      switch (id) {

        // N1 — Fatura vence hoje
        case 'n1': {
          const card = cards.find(c => c.diaVencimento === todayDay) || cards[0];
          if (!card) {
            await showNotif('💳 Fatura vence hoje!', 'Exemplo: Nubank — verifique o valor e pague!');
          } else {
            const isToday = card.diaVencimento === todayDay;
            await showNotif('💳 Fatura vence hoje!',
              `${card.nome} (dia ${card.diaVencimento})${isToday ? '' : ' — usando cartão disponível como exemplo'}`);
          }
          break;
        }

        // N2 — Fatura vence em 3 dias
        case 'n2': {
          const d3   = new Date(today); d3.setDate(d3.getDate() + 3);
          const card = cards.find(c => c.diaVencimento === d3.getDate())
            || cards.find(c => c.diaVencimento > todayDay)
            || cards[0];
          if (!card) {
            await showNotif('📅 Fatura vence em 3 dias', 'Exemplo: Itaú — vence no dia 15');
          } else {
            await showNotif('📅 Fatura vence em 3 dias', `${card.nome} — vence no dia ${card.diaVencimento}`);
          }
          break;
        }

        // N3 — Fatura fecha em 2 dias
        case 'n3': {
          const d2   = new Date(today); d2.setDate(d2.getDate() + 2);
          const card = cards.find(c => c.diaFechamento === d2.getDate())
            || cards.find(c => c.diaFechamento > todayDay)
            || cards[0];
          if (!card) {
            await showNotif('⏰ Fatura fecha em 2 dias', 'Exemplo: Nubank — últimos dias para compras nesta fatura!');
          } else {
            await showNotif('⏰ Fatura fecha em 2 dias',
              `${card.nome} fecha dia ${card.diaFechamento} — últimos dias para compras nesta fatura!`);
          }
          break;
        }

        // N4 — Orçamento > 80%
        case 'n4': {
          const rendaMensal = config?.rendaMensal || 0;
          const budgetPcts  = config?.budgetPcts  || {};
          if (rendaMensal <= 0) {
            await showNotif('⚠️ Orçamento acima de 80%', 'Configure sua renda em Configurações → Orçamento para receber este alerta.');
            break;
          }
          const spent = computeSpent(transactions, currentMonth);
          let worstId = null, worstPct = 0;
          CATEGORY_ORDER.forEach(catId => {
            const budget = (rendaMensal * (Number(budgetPcts[catId]) || 0)) / 100;
            const uso    = budget > 0 ? (spent[catId] / budget) * 100 : 0;
            if (uso > worstPct) { worstPct = uso; worstId = catId; }
          });
          if (worstId) {
            const cat    = SARDINHA_CATEGORIES[worstId];
            const budget = (rendaMensal * (Number(budgetPcts[worstId]) || 0)) / 100;
            await showNotif(
              `⚠️ ${cat.label} em ${Math.round(worstPct)}%`,
              `${formatBRL(spent[worstId])} de ${formatBRL(budget)} utilizados este mês`
            );
          } else {
            await showNotif('⚠️ Orçamento sob controle', 'Todas as categorias abaixo de 80% — parabéns!');
          }
          break;
        }

        // N5 — Orçamento estourado (> 100%)
        case 'n5': {
          const rendaMensal = config?.rendaMensal || 0;
          const budgetPcts  = config?.budgetPcts  || {};
          if (rendaMensal <= 0) {
            await showNotif('🚨 Orçamento estourado', 'Configure sua renda em Configurações → Orçamento para receber este alerta.');
            break;
          }
          const spent    = computeSpent(transactions, currentMonth);
          const overCats = CATEGORY_ORDER
            .map(catId => {
              const budget = (rendaMensal * (Number(budgetPcts[catId]) || 0)) / 100;
              return { catId, budget, s: spent[catId], over: spent[catId] > budget && budget > 0 };
            })
            .filter(x => x.over);

          if (overCats.length > 0) {
            const { catId, budget, s } = overCats.reduce((a, b) => (b.s - b.budget > a.s - a.budget ? b : a));
            const cat = SARDINHA_CATEGORIES[catId];
            await showNotif(
              `🚨 ${cat.label} estourou o orçamento!`,
              `${formatBRL(s - budget)} acima do limite de ${formatBRL(budget)}`
            );
          } else {
            await showNotif('🚨 Teste N5', 'Nenhuma categoria estourada este mês — ótimo controle!');
          }
          break;
        }

        // N6 — Saldo negativo projetado em 7 dias
        case 'n6': {
          const hoje       = todayStr();
          const [y, m, d]  = hoje.split('-').map(Number);
          const futDt      = new Date(y, m - 1, d + 7);
          const futStr     = `${futDt.getFullYear()}-${String(futDt.getMonth() + 1).padStart(2, '0')}-${String(futDt.getDate()).padStart(2, '0')}`;
          const saldoIni   = calcSaldo(transactions, '2020-01-01', hoje);
          const projection = buildDailyProjection(transactions, hoje, futStr, saldoIni);
          const negDay     = projection.find(p => p.saldo < 0);

          if (negDay) {
            await showNotif(
              '📉 Alerta: saldo negativo em 7 dias!',
              `Projeção: ${formatBRL(negDay.saldo)} em ${negDay.date.split('-').reverse().join('/')}`
            );
          } else {
            const lastSaldo = projection[projection.length - 1]?.saldo ?? saldoIni;
            await showNotif(
              '📉 Projeção dos próximos 7 dias',
              `Saldo projetado: ${formatBRL(lastSaldo)} — tudo certo!`
            );
          }
          break;
        }

        // N7 — Resumo semanal
        case 'n7': {
          const hoje      = todayStr();
          const d7ago     = new Date(today); d7ago.setDate(d7ago.getDate() - 7);
          const fromStr   = `${d7ago.getFullYear()}-${String(d7ago.getMonth() + 1).padStart(2, '0')}-${String(d7ago.getDate()).padStart(2, '0')}`;
          let entradas = 0, saidas = 0;
          transactions.forEach(tx => {
            expandOccurrences(tx, fromStr, hoje).forEach(o => {
              if (o.valor > 0) entradas += o.valor;
              else              saidas   += Math.abs(o.valor);
            });
          });
          const saldo = entradas - saidas;
          await showNotif(
            '📊 Resumo da semana',
            `Entradas ${formatBRL(entradas)} · Saídas ${formatBRL(saidas)} · Saldo ${formatBRL(saldo)}`
          );
          break;
        }

        default: break;
      }
    } catch (err) {
      console.error('[runTest]', err);
      setActivateError(`Erro no teste: ${err?.message || String(err)}`);
    } finally {
      setTimeout(() => setTestingId(null), 1500);
    }
  };

  // ── Não suportado ─────────────────────────────────────────────────────────────
  if (!supported) {
    return (
      <div style={{ padding: '8px 0' }}>
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 10,
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
          borderRadius: 12, padding: '12px 14px',
        }}>
          <BellOff size={16} color="var(--saida)" style={{ marginTop: 1, flexShrink: 0 }} />
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Push notifications não são suportadas neste navegador. Use o Chrome no Android ou Safari no iOS 16.4+.
          </p>
        </div>
      </div>
    );
  }

  const isEnabled = prefs.enabled && permission === 'granted';

  return (
    <div>

      {/* ── Seção de status e ativação ──────────────────────────────────────── */}
      <div style={{ marginBottom: 16 }}>

        {/* Permissão bloqueada pelo navegador */}
        {permission === 'denied' && (
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 10,
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
            borderRadius: 12, padding: '12px 14px',
          }}>
            <XCircle size={16} color="var(--saida)" style={{ marginTop: 1, flexShrink: 0 }} />
            <div>
              <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                Permissão bloqueada
              </p>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                Notificações foram bloqueadas pelo navegador. Para reativar, acesse as configurações do site no navegador e permita notificações.
              </p>
            </div>
          </div>
        )}

        {/* Ativas */}
        {isEnabled && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)',
            borderRadius: 12, padding: '12px 14px',
          }}>
            <CheckCircle size={16} color="var(--entrada)" style={{ flexShrink: 0 }} />
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', flex: 1, lineHeight: 1.5 }}>
              Notificações ativas. Configure os tipos abaixo.
            </p>
            <button
              onClick={() => savePrefs({ enabled: false })}
              style={{
                padding: '5px 10px', borderRadius: 8, fontSize: 12, flexShrink: 0,
                background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
                color: 'var(--saida)', cursor: 'pointer',
              }}
            >
              Desativar
            </button>
          </div>
        )}

        {/* Botão de ativação */}
        {permission !== 'denied' && !isEnabled && (
          <div>
            <button
              onClick={handleEnable}
              disabled={registering}
              style={{
                width: '100%', padding: '12px', borderRadius: 12, border: 'none',
                background: 'linear-gradient(135deg, #6366f1, #a855f7)',
                color: '#fff', fontSize: 14, fontWeight: 600,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                cursor: registering ? 'default' : 'pointer',
                opacity: registering ? 0.7 : 1,
              }}
            >
              {registering
                ? <><Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /> Ativando...</>
                : <><Bell size={16} /> Ativar Notificações Push</>
              }
            </button>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {/* Erro ao ativar */}
        {activateError && (
          <div style={{
            marginTop: 10, display: 'flex', alignItems: 'flex-start', gap: 8,
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
            borderRadius: 10, padding: '10px 12px',
          }}>
            <span style={{ fontSize: 14, flexShrink: 0 }}>⚠️</span>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--saida)', lineHeight: 1.5 }}>
              {activateError}
            </p>
          </div>
        )}

        {(isEnabled || permission === 'granted') && (
          <div style={{
            marginTop: 12,
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: '12px 14px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <Bell size={15} color="var(--primary)" />
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', flex: 1 }}>
                Diagnóstico do push
              </p>
              <button
                onClick={refreshDiagnostics}
                disabled={diagnosticsLoading}
                title="Atualizar diagnóstico"
                style={{
                  width: 28, height: 28, borderRadius: 8,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  background: 'transparent', border: '1px solid var(--border)',
                  color: 'var(--text-secondary)', cursor: diagnosticsLoading ? 'default' : 'pointer',
                }}
              >
                <RefreshCw size={13} style={{ animation: diagnosticsLoading ? 'spin 1s linear infinite' : 'none' }} />
              </button>
            </div>

            <DiagnosticItem label="Permissão do navegador" ok={permission === 'granted'} value={permission === 'granted' ? 'Permitida' : permission} />
            <DiagnosticItem label="Chave VAPID" ok value={diagnostics.vapidConfigured ? 'Configurada' : 'Padrão FCM'} />
            <DiagnosticItem label="Service worker" ok={diagnostics.serviceWorkerReady} value={diagnostics.serviceWorkerReady ? 'Registrado' : 'Pendente'} />
            <DiagnosticItem label="Token FCM salvo" ok={diagnostics.tokenSaved} value={diagnostics.tokenSaved ? 'Salvo' : 'Ausente'} />
            <DiagnosticItem label="Token sincronizado" ok={diagnostics.tokenMatchesSaved} value={diagnostics.tokenMatchesSaved ? 'Atual' : 'Verificar'} />
            <DiagnosticItem label="Token com VAPID atual" ok={diagnostics.tokenUsesCurrentVapid} value={diagnostics.tokenUsesCurrentVapid ? 'Atual' : 'Renovar'} />

            {diagnostics.tokenUpdatedAt && (
              <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>
                Última atualização: {new Date(diagnostics.tokenUpdatedAt).toLocaleString('pt-BR')}
              </p>
            )}

            {diagnostics.lastError && (
              <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--saida)', lineHeight: 1.4 }}>
                {diagnostics.lastError}
              </p>
            )}

            <button
              onClick={handleSendTestPush}
              disabled={testSending || !diagnostics.tokenSaved}
              style={{
                width: '100%', marginTop: 12, padding: '10px 12px', borderRadius: 10,
                border: '1px solid rgba(99,102,241,0.25)',
                background: diagnostics.tokenSaved ? 'rgba(99,102,241,0.12)' : 'var(--border)',
                color: diagnostics.tokenSaved ? 'var(--primary)' : 'var(--text-muted)',
                fontSize: 13, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                cursor: testSending || !diagnostics.tokenSaved ? 'default' : 'pointer',
              }}
            >
              {testSending
                ? <><Loader size={15} style={{ animation: 'spin 1s linear infinite' }} /> Enviando push real...</>
                : <><Send size={15} /> Enviar push de teste</>
              }
            </button>

            {testResult?.ok && (
              <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--entrada)', lineHeight: 1.4 }}>
                Push de teste enviado pelo Firebase.
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Lista de tipos (visível quando ativado OU permissão já concedida) ── */}
      {(isEnabled || permission === 'granted') && (
        <div>
          <p style={{
            margin: '0 0 10px', fontSize: 11, fontWeight: 600,
            color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em',
          }}>
            Tipos de alerta
          </p>

          {Object.entries(TIPO_INFO).map(([id, info]) => {
            const ativo = tipos[id] !== false;
            return (
              <div key={id} style={{
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: 12, padding: '12px 14px', marginBottom: 8,
                opacity: ativo ? 1 : 0.6, transition: 'opacity 0.2s',
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <span style={{ fontSize: 20, flexShrink: 0, lineHeight: 1.3 }}>{info.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: '0 0 2px', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                      {info.label}
                    </p>
                    <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                      {info.desc}
                    </p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, marginTop: 1 }}>
                    {/* Botão testar */}
                    <button
                      onClick={() => runTest(id)}
                      disabled={testingId === id}
                      title="Testar notificação com seus dados reais"
                      style={{
                        display: 'flex', alignItems: 'center', gap: 4,
                        padding: '4px 9px', borderRadius: 8,
                        background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)',
                        color: 'var(--primary)', fontSize: 11, cursor: 'pointer',
                        opacity: testingId === id ? 0.5 : 1,
                      }}
                    >
                      <Play size={10} />
                      {testingId === id ? '...' : 'Testar'}
                    </button>

                    {/* Toggle on/off */}
                    <Toggle value={ativo} onChange={(val) => saveTipo(id, val)} />
                  </div>
                </div>
              </div>
            );
          })}

          {/* Aviso: sem cartões */}
          {cards.length === 0 && (
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 8,
              background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)',
              borderRadius: 10, padding: '10px 12px',
            }}>
              <span style={{ fontSize: 14 }}>💡</span>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                Cadastre cartões em <strong style={{ color: 'var(--text-primary)' }}>Cartões de Crédito</strong> para receber os alertas de vencimento (N1 · N2 · N3).
              </p>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
