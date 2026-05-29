import { useState } from 'react';
import { LogOut, User, Shield, ChevronDown, ChevronUp, Download } from 'lucide-react';
import CardManager from './CardManager';
import WalletManager from './WalletManager';
import BudgetSettings from './BudgetSettings';
import NotificationSettings from './NotificationSettings';
import TelegramSettings from './TelegramSettings';
import { useInstallPrompt } from '../../hooks/useInstallPrompt';

const CHANGELOG_DATA = [
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

export default function SettingsScreen({ user, cards, wallets, transactions, config, onSaveConfig, onAddCard, onUpdateCard, onRemoveCard, onAddWallet, onUpdateWallet, onRemoveWallet, onLogout }) {
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [cardsOpen, setCardsOpen] = useState(false);
  const [walletsOpen, setWalletsOpen] = useState(false);
  const [notifsOpen, setNotifsOpen] = useState(false);
  const [telegramOpen, setTelegramOpen] = useState(false);
  const [updatesOpen, setUpdatesOpen] = useState(false);
  const { prompt: deferredPrompt, handleInstall } = useInstallPrompt();

  const handleExportCSV = () => {
    let csv = 'Data,Tipo,Categoria,Descricao,Valor,Frequencia,Parcela,CartaoCredito\n';

    transactions.forEach(tx => {
      if (tx.tipo === 'cartao' && tx.itens && tx.itens.length > 0) {
        tx.itens.forEach(item => {
           const data = item.dataCompra || tx.dataInicio;
           const valor = (Number(item.valor) || 0).toFixed(2);
           const parc = item.isParcelado ? `${item.parcelaAtual}/${item.totalParcelas}` : '-';
           const desc = `"${(item.descricao || tx.descricao || '').replace(/"/g, '""')}"`;
           csv += `${data},${tx.tipo},${item.categoria || tx.categoria || ''},${desc},${valor},${tx.frequencia},${parc},Sim\n`;
        });
      } else {
         const data = tx.dataInicio || '';
         const valor = (Number(tx.valor) || 0).toFixed(2);
         const parc = tx.frequencia === 'parcelado' ? `${tx.parcelaAtual}/${tx.totalParcelas}` : '-';
         const desc = `"${(tx.descricao || '').replace(/"/g, '""')}"`;
         csv += `${data},${tx.tipo},${tx.categoria || ''},${desc},${valor},${tx.frequencia},${parc},Nao\n`;
      }
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `matoba_financas_export_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 90 }}>
      <div style={{ padding: '20px 20px 0' }}>
        <h1 style={{ margin: '0 0 20px', fontSize: 20, fontWeight: 700 }}>Configurações</h1>

        {/* Perfil */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 14, padding: '14px', marginBottom: 20,
        }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg, #6366f1, #a855f7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <User size={22} color="#fff" />
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ margin: '0 0 2px', fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Conta</p>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>{user?.email || user?.displayName}</p>
          </div>
          <button
            onClick={onLogout}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px',
              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
              borderRadius: 10, color: 'var(--saida)', fontSize: 13, fontWeight: 500,
            }}
          >
            <LogOut size={14} /> Sair
          </button>
        </div>

        {/* Orçamento — expansível */}
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 14, marginBottom: 16, overflow: 'hidden',
        }}>
          <button
            onClick={() => setBudgetOpen(o => !o)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 16px', background: 'none', textAlign: 'left',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 18 }}>💰</span>
              <div style={{ textAlign: 'left' }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', display: 'block' }}>
                  Divisão de Orçamento
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  Modelo de Alocação por Percentual
                </span>
              </div>
            </div>
            {budgetOpen ? <ChevronUp size={16} color="var(--text-muted)" /> : <ChevronDown size={16} color="var(--text-muted)" />}
          </button>
          {budgetOpen && (
            <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--border)' }}>
              <div style={{ paddingTop: 14 }}>
                <BudgetSettings config={config} onSave={onSaveConfig} />
              </div>
            </div>
          )}
        </div>

        {/* Cartões — expansível */}
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 14, marginBottom: 16, overflow: 'hidden',
        }}>
          <button
            onClick={() => setCardsOpen(o => !o)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 16px', background: 'none',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 18 }}>💳</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                Cartões de Crédito
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {cards.length > 0 && (
                <span style={{ fontSize: 12, color: 'var(--text-muted)', background: 'var(--bg-surface)', borderRadius: 6, padding: '2px 7px' }}>
                  {cards.length}
                </span>
              )}
              {cardsOpen ? <ChevronUp size={16} color="var(--text-muted)" /> : <ChevronDown size={16} color="var(--text-muted)" />}
            </div>
          </button>
          {cardsOpen && (
            <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--border)' }}>
              <div style={{ paddingTop: 14 }}>
                <CardManager cards={cards} onAdd={onAddCard} onUpdate={onUpdateCard} onRemove={onRemoveCard} />
              </div>
            </div>
          )}
        </div>

        {/* Carteiras — expansível */}
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 14, marginBottom: 16, overflow: 'hidden',
        }}>
          <button
            onClick={() => setWalletsOpen(o => !o)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 16px', background: 'none',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 18 }}>🏦</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                Contas e Carteiras
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {wallets?.length > 0 && (
                <span style={{ fontSize: 12, color: 'var(--text-muted)', background: 'var(--bg-surface)', borderRadius: 6, padding: '2px 7px' }}>
                  {wallets.length}
                </span>
              )}
              {walletsOpen ? <ChevronUp size={16} color="var(--text-muted)" /> : <ChevronDown size={16} color="var(--text-muted)" />}
            </div>
          </button>
          {walletsOpen && (
            <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--border)' }}>
              <div style={{ paddingTop: 14 }}>
                <WalletManager wallets={wallets || []} onAdd={onAddWallet} onUpdate={onUpdateWallet} onRemove={onRemoveWallet} />
              </div>
            </div>
          )}
        </div>

        {/* Notificações Push — card */}
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 14, marginBottom: 16, overflow: 'hidden',
        }}>
          <button
            onClick={() => setNotifsOpen(o => !o)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 16px', background: 'none',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 18 }}>🔔</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                Notificações Push
              </span>
            </div>
            {notifsOpen ? <ChevronUp size={16} color="var(--text-muted)" /> : <ChevronDown size={16} color="var(--text-muted)" />}
          </button>
          {notifsOpen && (
            <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--border)' }}>
              <div style={{ paddingTop: 14 }}>
                <NotificationSettings
                  user={user}
                  cards={cards}
                  transactions={transactions}
                  config={config}
                  onSavePrefs={onSaveConfig}
                />
              </div>
            </div>
          )}
        </div>

        {/* Bot do Telegram — card separado */}
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 14, marginBottom: 16, overflow: 'hidden',
        }}>
          <button
            onClick={() => setTelegramOpen(o => !o)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 16px', background: 'none',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {/* Ícone Telegram */}
              <svg width="22" height="22" viewBox="0 0 24 24" fill="#229ED9">
                <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
              </svg>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                Bot do Telegram
              </span>
            </div>
            {telegramOpen ? <ChevronUp size={16} color="var(--text-muted)" /> : <ChevronDown size={16} color="var(--text-muted)" />}
          </button>
          {telegramOpen && (
            <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--border)' }}>
              <div style={{ paddingTop: 14 }}>
                <TelegramSettings
                  user={user}
                  config={config}
                  onSavePrefs={onSaveConfig}
                />
              </div>
            </div>
          )}
        </div>

        {/* Notas de Atualização — card expansível */}
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 14, marginBottom: 16, overflow: 'hidden',
        }}>
          <button
            type="button"
            onClick={() => setUpdatesOpen(o => !o)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 16px', background: 'none', border: 'none', cursor: 'pointer'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 18 }}>🆕</span>
              <div style={{ textAlign: 'left' }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', display: 'block' }}>
                  Notas de Atualização
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  Versão v1.4.0 ativa
                </span>
              </div>
            </div>
            {updatesOpen ? <ChevronUp size={16} color="var(--text-muted)" /> : <ChevronDown size={16} color="var(--text-muted)" />}
          </button>
          {updatesOpen && (
            <div style={{ padding: '16px', borderTop: '1px solid var(--border)', background: 'var(--bg-surface)', fontSize: 12, lineHeight: 1.5, display: 'flex', flexDirection: 'column', gap: 16 }}>
              {CHANGELOG_DATA.map((ch, idx) => (
                <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--primary)', background: 'rgba(99,102,241,0.1)', padding: '1px 5px', borderRadius: 4 }}>
                      {ch.version}
                    </span>
                    <strong style={{ fontSize: 12, color: 'var(--text-primary)' }}>{ch.title}</strong>
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {ch.items.map((it, itemIdx) => (
                      <li key={itemIdx}>{it}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* PWA Install Button */}
        {deferredPrompt && (
          <button
            onClick={handleInstall}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '14px', marginBottom: 16, borderRadius: 14,
              background: 'linear-gradient(135deg, #6366f1, #a855f7)', border: 'none',
              color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
              boxShadow: '0 4px 16px rgba(99,102,241,0.3)'
            }}
          >
            <Download size={18} />
            Instalar Aplicativo (App Nativo)
          </button>
        )}

        {/* Exportar Excel */}
        <button
          onClick={handleExportCSV}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            padding: '14px', marginBottom: 16, borderRadius: 14,
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            color: 'var(--text-primary)', fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}
        >
          <Download size={18} />
          Exportar Dados (Excel CSV)
        </button>

        {/* Nota de segurança */}
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 10,
          background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)',
          borderRadius: 12, padding: '12px 14px', marginBottom: 8,
        }}>
          <Shield size={14} color="var(--primary)" style={{ marginTop: 1 }} />
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Seus dados são armazenados de forma segura no Firebase e sincronizados apenas para sua conta.
          </p>
        </div>
      </div>
    </div>
  );
}
