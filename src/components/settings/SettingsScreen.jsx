import { useState } from 'react';
import { LogOut, User, Shield, ChevronDown, ChevronUp, Download } from 'lucide-react';
import { useToast } from '../shared/Toast';
import { doc, collection, setDoc, deleteDoc, Timestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import CardManager from './CardManager';
import WalletManager from './WalletManager';
import BudgetSettings from './BudgetSettings';
import NotificationSettings from './NotificationSettings';
import TelegramSettings from './TelegramSettings';
import { useInstallPrompt } from '../../hooks/useInstallPrompt';

const CHANGELOG_DATA = [
  {
    version: 'v1.6.2 (29/05/2026)',
    title: 'Self-Healing do PWA, Projeções de Fluxo de Caixa e Limpeza da Home 🛠️',
    items: [
      'Recuperação Autônoma (Self-Healing): movido o gerenciador de atualização do PWA para fora das rotas de carregamento precoce. Agora, mesmo que haja erro nas credenciais locais, o Service Worker é executado e atualiza o app de forma totalmente transparente e automática.',
      'Projeções de fluxo de caixa: corrigido bug de herança de status pago em faturas virtuais futuras dos cartões. Agora as parcelas de meses futuros permanecem em aberto para uma estimativa precisa e real de fluxo de caixa.',
      'Limpeza de redundâncias na Home: a seção de Próximas Contas de 15 dias foi inteiramente removida do início, mantendo esses dados centralizados e organizados unicamente na aba de Projeção.'
    ]
  },
  {
    version: 'v1.6.1 (29/05/2026)',
    title: 'Controle de Pagamentos & Auto-Atualização PWA Imersiva 🔄',
    items: [
      'Controle de próximas contas: resolvido bug em que contas e faturas de cartão pagas continuavam aparecendo na lista de próximas contas de 15 dias na Home. Agora, ao registrar um pagamento, o status do lançamento é automaticamente marcado como pago (conferido) e removido dos compromissos futuros.',
      'Auto-Atualização do PWA: o aplicativo agora detecta novas versões em segundo plano instantaneamente sempre que ganha foco (visibilitychange) ou é retomado do background no celular.',
      'Instalação e recarga automática: novas atualizações do PWA são ativadas e instaladas 100% de forma autônoma e imediata, exibindo uma tela de carregamento suave e realizando o reload automaticamente sem requerer nenhuma ação manual ou navegação externa do usuário.'
    ]
  },
  {
    version: 'v1.6.0 (29/05/2026)',
    title: 'Notificações Inteligentes & Upgrade do Bot do Telegram 🌅',
    items: [
      'Novas Notificações Push/Telegram (N8 a N12): adicionados alertas de limite geral de gastos mensais, contas fixas recorrentes pendentes a vencer nos próximos 2 dias, limite de cartão comprometido e relatório comparativo de fechamento mensal.',
      'Preferências de Resumo Diário: configure horário de envio preferido (7h, 12h, 19h) e dias da semana (todo dia, dias úteis, fds) diretamente pela tela de configurações do webapp.',
      'Novos comandos no Bot do Telegram: acesse dicas personalizadas com o comando /insight e detalhe despesas ativas nos cartões de crédito com o comando /fatura.',
      'Simuladores de testes locais: pré-visualize e teste cada um dos 12 tipos de notificações com seus dados reais em tempo real clicando no botão Testar.'
    ]
  },
  {
    version: 'v1.5.5 (29/05/2026)',
    title: 'Cálculo Consistente de Cartões & Soma de Lançamentos 💳',
    items: [
      'Filtragem mensal precisa nos cartões: as estatísticas de Fatura Atual e limite disponível na Home e Configurações agora filtram transações pelo mês ativo, isolando faturas passadas ou futuras da fatura do mês corrente.',
      'Soma automática no formulário: ao lançar despesas (itens) na fatura do cartão, o total principal da fatura é somado automaticamente e mantido em perfeita sincronia.',
      'Ajuste na edição de projeções: corrigida a gravação de itens modificados de faturas virtuais separadas na área de Projeção.'
    ]
  },
  {
    version: 'v1.5.4 (29/05/2026)',
    title: 'Busca de Atualizações Precisa & PWA 🔄',
    items: [
      'Aprimoramento completo no sistema de busca de atualizações manuais: agora a verificação de nova versão se conecta em tempo real ao servidor e informa exatamente se há atualizações prontas, em andamento ou se o app já está na versão mais recente.',
      'Reset inteligente do estado oculto: fechar o aviso temporário não bloqueia mais permanentemente novos avisos automáticos de futuras versões.'
    ]
  },
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
      'Integração com o Bot de Telegram para consultas rápidos de saldo e limites.'
    ]
  }
];

export default function SettingsScreen({ user, cards, wallets, transactions, config, onSaveConfig, onAddCard, onUpdateCard, onRemoveCard, onAddWallet, onUpdateWallet, onRemoveWallet, onLogout, onResetTour }) {
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [cardsOpen, setCardsOpen] = useState(false);
  const [walletsOpen, setWalletsOpen] = useState(false);
  const [notifsOpen, setNotifsOpen] = useState(false);
  const [telegramOpen, setTelegramOpen] = useState(false);
  const [updatesOpen, setUpdatesOpen] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState('');
  const { prompt: deferredPrompt, handleInstall } = useInstallPrompt();
  const { showToast, ToastNode } = useToast();

  const restoreTimestamp = (val) => {
    if (!val) return val;
    if (typeof val === 'object' && val.seconds !== undefined) {
      return new Timestamp(val.seconds, val.nanoseconds || 0);
    }
    if (typeof val === 'string') {
      const d = new Date(val);
      if (!isNaN(d.getTime())) {
        return Timestamp.fromDate(d);
      }
    }
    return val;
  };

  const handleExportJSON = () => {
    const data = {
      exportedAt: new Date().toISOString(),
      version: '1.0',
      transactions: transactions || [],
      cards: cards || [],
      wallets: wallets || [],
      goals: goals || [],
      config: config || {},
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `matoba_backup_${new Date().toISOString().slice(0,10)}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImportJSON = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const fileText = await file.text();
      const data = JSON.parse(fileText);

      if (!data.transactions || !Array.isArray(data.transactions) ||
          !data.cards || !Array.isArray(data.cards) ||
          !data.wallets || !Array.isArray(data.wallets) ||
          !data.goals || !Array.isArray(data.goals) ||
          !data.config || typeof data.config !== 'object') {
        showToast('Arquivo de backup inválido. Chaves obrigatórias ausentes.', 'error');
        return;
      }

      const confirm = window.confirm(
        'Aviso Importante:\n\n' +
        'Todos os seus dados atuais (transações, cartões, carteiras, metas e configurações) serão ' +
        'substituídos pelos dados deste arquivo de backup.\n\n' +
        'Deseja prosseguir?'
      );
      if (!confirm) return;

      setImporting(true);
      setImportMessage('Limpando dados antigos...');

      const deletePromises = [];
      transactions.forEach(t => {
        deletePromises.push(deleteDoc(doc(db, `transactions/${user.uid}/entries`, t.id)));
      });
      cards.forEach(c => {
        deletePromises.push(deleteDoc(doc(db, `cards/${user.uid}/list`, c.id)));
      });
      wallets.forEach(w => {
        deletePromises.push(deleteDoc(doc(db, 'wallets', w.id)));
      });
      goals.forEach(g => {
        deletePromises.push(deleteDoc(doc(db, 'goals', g.id)));
      });

      await Promise.all(deletePromises);

      setImportMessage('Importando novos registros...');
      const writePromises = [];

      data.transactions.forEach(t => {
        const { id, criadoEm, ...txData } = t;
        const ref = id ? doc(db, `transactions/${user.uid}/entries`, id) : doc(collection(db, `transactions/${user.uid}/entries`));
        writePromises.push(setDoc(ref, { 
          ...txData, 
          uid: user.uid,
          criadoEm: criadoEm ? restoreTimestamp(criadoEm) : null
        }));
      });

      data.cards.forEach(c => {
        const { id, criadoEm, ...cardData } = c;
        const ref = id ? doc(db, `cards/${user.uid}/list`, id) : doc(collection(db, `cards/${user.uid}/list`));
        writePromises.push(setDoc(ref, { 
          ...cardData, 
          uid: user.uid,
          criadoEm: criadoEm ? restoreTimestamp(criadoEm) : null
        }));
      });

      data.wallets.forEach(w => {
        const { id, criadoEm, ...walletData } = w;
        const ref = id ? doc(db, 'wallets', id) : doc(collection(db, 'wallets'));
        writePromises.push(setDoc(ref, { 
          ...walletData, 
          userId: user.uid,
          criadoEm: criadoEm ? restoreTimestamp(criadoEm) : null
        }));
      });

      data.goals.forEach(g => {
        const { id, criadoEm, ...goalData } = g;
        const ref = id ? doc(db, 'goals', id) : doc(collection(db, 'goals'));
        writePromises.push(setDoc(ref, { 
          ...goalData, 
          userId: user.uid,
          criadoEm: criadoEm ? restoreTimestamp(criadoEm) : null
        }));
      });

      const configRef = doc(db, `config/${user.uid}`);
      writePromises.push(setDoc(configRef, { ...data.config, userId: user.uid }));

      await Promise.all(writePromises);

      setImporting(false);
      showToast('Backup restaurado com sucesso!', 'success');
    } catch (err) {
      console.error('Erro na importação de backup:', err);
      setImporting(false);
      showToast('Ocorreu um erro ao restaurar o backup: ' + err.message, 'error');
    }
  };

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
                <CardManager cards={cards} transactions={transactions} onAdd={onAddCard} onUpdate={onUpdateCard} onRemove={onRemoveCard} />
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
                <WalletManager wallets={wallets || []} transactions={transactions} onAdd={onAddWallet} onUpdate={onUpdateWallet} onRemove={onRemoveWallet} />
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
                  Versão v1.6.2 ativa
                </span>
              </div>
            </div>
            {updatesOpen ? <ChevronUp size={16} color="var(--text-muted)" /> : <ChevronDown size={16} color="var(--text-muted)" />}
          </button>
          {updatesOpen && (
            <div style={{ padding: '16px', borderTop: '1px solid var(--border)', background: 'var(--bg-surface)', fontSize: 12, lineHeight: 1.5, display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Botão de Forçar Atualização */}
              <button
                type="button"
                onClick={async () => {
                  if (!('serviceWorker' in navigator)) {
                    showToast('Seu navegador não oferece suporte a Service Workers.', 'error');
                    return;
                  }

                  // Limpa dismissed para reativar a exibição do banner global
                  localStorage.removeItem('matoba:update-dismissed');

                  try {
                    const regs = await navigator.serviceWorker.getRegistrations();
                    const reg = regs?.find(r => r.active) || regs?.[0];
                    if (!reg) {
                      showToast('Nenhum Service Worker registrado. O aplicativo pode não estar instalado ou rodando como PWA no momento.', 'error');
                      return;
                    }

                    // Se já existir uma atualização baixada e esperando ativação
                    if (reg.waiting) {
                      showToast('Nova versão pronta! Atualizando o aplicativo...', 'success');
                      reg.waiting.postMessage({ type: 'SKIP_WAITING' });
                      return;
                    }

                    // Se já estiver baixando uma atualização
                    if (reg.installing) {
                      showToast('Uma atualização já está sendo baixada. O app será reiniciado assim que concluir.', 'success');
                      const worker = reg.installing;
                      worker.addEventListener('statechange', () => {
                        if (worker.state === 'installed') {
                          worker.postMessage({ type: 'SKIP_WAITING' });
                        }
                      });
                      return;
                    }

                    // Caso geral: Checar atualização no servidor
                    let updateFound = false;
                    const handleUpdateFound = () => {
                      updateFound = true;
                      const worker = reg.installing;
                      if (worker) {
                        showToast('Nova versão encontrada! Baixando atualização...', 'success');
                        worker.addEventListener('statechange', () => {
                          if (worker.state === 'installed') {
                            worker.postMessage({ type: 'SKIP_WAITING' });
                          }
                        });
                      }
                    };

                    reg.addEventListener('updatefound', handleUpdateFound);

                    // Executa a busca real no servidor
                    await reg.update();

                    // Aguarda até 2 segundos para dar tempo do evento disparar
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    reg.removeEventListener('updatefound', handleUpdateFound);

                    if (!updateFound) {
                      showToast('O aplicativo já está na versão mais recente!', 'success');
                    }
                  } catch (err) {
                    console.error('Erro ao verificar SW:', err);
                    showToast('Erro ao buscar atualizações: ' + err.message, 'error');
                  }
                }}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  padding: '10px 14px', borderRadius: 10,
                  background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.3)',
                  color: 'var(--primary)', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  width: '100%', marginBottom: 4, transition: 'all 0.2s'
                }}
              >
                🔄 Buscar Atualização do Aplicativo (PWA)
              </button>

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

        {/* Backup e Exportação — card expansível */}
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 14, marginBottom: 16, overflow: 'hidden',
        }}>
          <button
            type="button"
            onClick={() => setBackupOpen(o => !o)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 16px', background: 'none', border: 'none', cursor: 'pointer'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 18 }}>💾</span>
              <div style={{ textAlign: 'left' }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', display: 'block' }}>
                  Backup e Exportação
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  JSON Portátil & CSV Planilha
                </span>
              </div>
            </div>
            {backupOpen ? <ChevronUp size={16} color="var(--text-muted)" /> : <ChevronDown size={16} color="var(--text-muted)" />}
          </button>
          {backupOpen && (
            <div style={{ padding: '16px', borderTop: '1px solid var(--border)', background: 'var(--bg-surface)', fontSize: 12, lineHeight: 1.5, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                Exporte ou importe todos os dados do seu aplicativo (transações, cartões, contas e configurações) em formato JSON seguro, ou exporte suas transações brutas em formato CSV para o Excel.
              </p>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* Exportar JSON */}
                <button
                  type="button"
                  onClick={handleExportJSON}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    padding: '12px', borderRadius: 10,
                    background: 'var(--bg-card)', border: '1px solid var(--border)',
                    color: 'var(--text-primary)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  <Download size={16} /> Exportar Backup (JSON)
                </button>

                {/* Importar JSON */}
                <label
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    padding: '12px', borderRadius: 10,
                    background: 'var(--bg-card)', border: '1px solid var(--border)',
                    color: 'var(--text-primary)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    textAlign: 'center'
                  }}
                >
                  <Download size={16} style={{ transform: 'rotate(180deg)' }} /> Importar Backup (JSON)
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleImportJSON}
                    style={{ display: 'none' }}
                  />
                </label>

                {/* Exportar CSV */}
                <button
                  type="button"
                  onClick={handleExportCSV}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    padding: '12px', borderRadius: 10,
                    background: 'var(--bg-card)', border: '1px solid var(--border)',
                    color: 'var(--text-primary)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  <Download size={16} /> Exportar Planilha (CSV)
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Reiniciar Tour Guiado */}
        <button
          type="button"
          onClick={onResetTour}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            padding: '14px', marginBottom: 16, borderRadius: 14,
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            transition: 'background 0.2s, border-color 0.2s'
          }}
        >
          <span>🚀</span> Reiniciar Tour do Aplicativo
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

      {/* Overlay de Importação */}
      {importing && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 99999,
          background: 'rgba(10, 15, 30, 0.9)', backdropFilter: 'blur(8px)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 24,
        }}>
          <div style={{
            width: 64, height: 64, borderRadius: 18,
            background: 'linear-gradient(135deg, var(--primary), var(--investimento))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 8px 32px rgba(99, 102, 241, 0.3)',
          }}>
            <span style={{ fontSize: 32 }}>💾</span>
          </div>
          <div style={{ position: 'relative', width: 44, height: 44 }}>
            <div style={{
              position: 'absolute', inset: 0, borderRadius: '50%',
              border: '3px solid rgba(99,102,241,0.12)',
            }} />
            <div style={{
              position: 'absolute', inset: 0, borderRadius: '50%',
              border: '3px solid transparent',
              borderTopColor: 'var(--primary)',
              animation: 'mf-spin-backup 0.75s linear infinite',
            }} />
          </div>
          <div style={{ textAlign: 'center', padding: '0 40px' }}>
            <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
              Restaurando Backup
            </p>
            <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
              {importMessage}
            </p>
          </div>
          <style>{`
            @keyframes mf-spin-backup { to { transform: rotate(360deg); } }
          `}</style>
        </div>
      )}
      {ToastNode}
    </div>
  );
}
