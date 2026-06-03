export const APP_VERSION = '1.6.34';
export const APP_VERSION_DATE = '03/06/2026';

export const CHANGELOG = [
  {
    version: '1.6.34',
    date: '03/06/2026',
    changes: [
      'Simulador: nova aba de simulação de grandes compras e financiamentos imobiliários/veículos integrada a Metas',
      'Simulador: cenários baseados em médias históricas de 1, 3 e 5 anos (juros bancários, TR, INCC e IPCA)',
      'Simulador: suporte a entradas parceladas em obras corrigidas por INCC e diferimento do cronograma de financiamento',
      'Simulador: projeção de fluxo de caixa de 24 meses e indicador de comprometimento de renda a partir do perfil do usuário',
    ],
  },
  {
    version: '1.6.33',
    date: '03/06/2026',
    changes: [
      'Busca: expandida para permitir filtrar e buscar pelo nome legível das categorias no Histórico',
      'Badges: exibição de resumo financeiro por categoria no topo do Histórico com filtros ativos em tempo real',
      'Conciliação: novo atalho "Conciliar Visíveis" para marcar lançamentos pendentes em lote com um único clique',
    ],
  },
  {
    version: '1.6.32',
    date: '03/06/2026',
    changes: [
      'Sincronização: painel "Pense com Calma" (itens de impulso e economia acumulada) agora é salvo no Firestore (multi-dispositivo)',
      'Alertas: avisos de limite orçamentário em tempo real no formulário de transação (informa antes de exceder o teto da categoria)',
    ],
  },
  {
    version: '1.6.31',
    date: '03/06/2026',
    changes: [
      'Visual: adicionado modal de carregamento para feedback visual ao atualizar o aplicativo',
      'Visual: ocultado botão "Pagar" e exibido badge "✓ Pago" para contas já liquidadas na Home',
      'Otimização: unificação dos gatilhos de atualização (banner e painel de configurações)',
    ],
  },
  {
    version: '1.6.30',
    date: '03/06/2026',
    changes: [
      'Segurança: blindagem contra sequestro de dados no Firestore para carteiras e caixinhas',
      'Segurança: permissão de deleção de códigos de vinculação obsoletos do Telegram',
      'Sincronização: exibição do carregamento unificado do banco de dados no frontend (evita flashes/dados vazios)',
      'Cartão de Crédito: alinhamento dos parcelamentos antigos e futuros no BudgetSummaryCard na Home',
      'Backend: sincronização das projeções virtuais de faturas nas Cloud Functions (alertas do Bot do Telegram)',
      'Qualidade de Código: refatoração geral e correção de lint warnings em múltiplos hooks e telas',
    ],
  },
  {
    version: '1.6.29',
    date: '03/06/2026',
    changes: [
      'Otimização: aba Histórico preserva filtros e scroll ao trocar de aba',
      'Otimização: busca no Histórico com debounce de 200ms — sem lag ao digitar',
      'Otimização: cálculos de projeção ignorados quando aba Histórico está ativa',
      'Otimização: lookup de faturas virtuais agora é O(1) via Set (era O(n) linear)',
      'Fix: scroll da lista não pula mais ao conferir pagamentos',
      'Refactor: handlers principais com useCallback — menos re-renders nos filhos',
    ],
  },
  {
    version: '1.6.28',
    date: '03/06/2026',
    changes: [
      'Fix: botão + centralizado no menu inferior (posição 3 de 5)',
    ],
  },
  {
    version: '1.6.27',
    date: '03/06/2026',
    changes: [
      'Histórico movido para dentro da tela de Projeção como nova aba',
      'Menu inferior simplificado — 5 botões (sem Histórico separado)',
      'Abas da Projeção: Mensal, Período, Anual e Histórico',
    ],
  },
  {
    version: '1.6.26',
    date: '03/06/2026',
    changes: [
      'Fix: tela de carregamento aparece corretamente em todos os fluxos de login',
      'Fix: detecção de fatura virtual agora usa ID real do Firestore (mais robusto)',
      'Fix: Toast não vaza memória ao fechar o app durante a animação de saída',
      'Refactor: constantes de meses centralizadas nas Cloud Functions (sem duplicação)',
    ],
  },
  {
    version: '1.6.25',
    date: '03/06/2026',
    changes: [
      'Fix crítico: edição de fatura parcelada não duplica mais lançamentos futuros',
      'Novo: ao editar fatura com parcelas, pergunta se aplica somente nesta ou em todas as futuras',
      'Exibe até quando vão as parcelas no diálogo de escopo',
      'Itens parcelados materializados por edição não geram mais projeções duplicadas',
    ],
  },
  {
    version: '1.6.24',
    date: '03/06/2026',
    changes: [
      'Fix crítico: bot Telegram agora lê carteiras corretamente (/saldo mostrava R$0)',
      'Fix crítico: notificações diárias incluem saldo real das carteiras',
      'Fix: campo "conferidos" inválido removido ao criar nova série de pagamento',
      'Fix: transações diárias históricas incluídas no cálculo de sobra segura',
      'Segurança: perfil do usuário (fcmToken, telegramChatId) protegido contra leitura por terceiros',
      'Regras Firestore: wallets e goals com proteção explícita por userId',
    ],
  },
  {
    version: '1.6.23',
    date: '03/06/2026',
    changes: [
      'Fix crítico: saldo do bot agora respeita exclusoes de recorrências (sem dupla contagem)',
      'Fix: alertas de orçamento (N4/N5/N9) agora contam recorrentes mensais/semanais do mês',
      'Fix: /categoria mostra corretamente aluguel e outras despesas mensais recorrentes',
    ],
  },
  {
    version: '1.6.22',
    date: '02/06/2026',
    changes: [
      'Fix crítico: saldo do bot agora inclui saldoInicial das carteiras',
      'Fix: /resumo, /mes, /semana agora expandem transações recorrentes corretamente',
      'Fix: /hoje mostra todos os tipos de lançamento do dia (não só avulsos)',
      'Fix: alertas N6, N8, N15 calculam saldo com carteiras incluídas',
      'Fix: diário acumulava apenas 1 dia em vez de todos os dias do período',
    ],
  },
  {
    version: '1.6.21',
    date: '01/06/2026',
    changes: [
      'Bot Telegram: menu /configurar com botões inline para ativar/desativar cada alerta',
      'Botões: toggle individual, "Ativar todos", "Desativar todos" e "Pronto"',
      'Menu atualiza em tempo real ao toque — sem precisar abrir o app',
      'Webhook atualizado para processar callback_query dos botões inline',
    ],
  },
  {
    version: '1.6.20',
    date: '01/06/2026',
    changes: [
      'Push e Telegram agora têm alertas completamente independentes',
      'Bot do Telegram: toggles N1–N17 exclusivos na aba de configuração',
      'Cloud Function: push usa prefs.tipos, Telegram usa prefs.telegramTipos',
    ],
  },
  {
    version: '1.6.19',
    date: '01/06/2026',
    changes: [
      'Fix crítico: botão Atualizar agora ativa o novo SW corretamente antes de recarregar',
      'Fluxo: SKIP_WAITING → aguarda controllerchange → reload (sem servir cache antigo)',
      'Fallback automático: limpa caches se SW não responder',
    ],
  },
  {
    version: '1.6.18',
    date: '01/06/2026',
    changes: [
      'N13: Alerta de fatura fechando amanhã (aviso final)',
      'N14: Notificação de última parcela paga — valor liberado no orçamento',
      'N15: Alerta de saldo abaixo do mínimo configurável',
      'N16: Resumo visual das caixinhas/metas todo dia 1 do mês',
      'N17: Balanço da metade do mês com projeção de fechamento (dia 15)',
    ],
  },
  {
    version: '1.6.17',
    date: '01/06/2026',
    changes: [
      'Fix: banner de atualização só aparece quando versão remota é MAIOR que a instalada',
      'Comparação semântica de versão evita falso positivo por cache do CDN',
    ],
  },
  {
    version: '1.6.16',
    date: '01/06/2026',
    changes: [
      'Fix crítico: Service Worker reescrito sem dependência de CDN externo',
      'Firebase e Workbox agora embutidos no SW — funciona offline e em redes lentas',
      'Timeout de 10s em navigator.serviceWorker.ready — nunca trava em "Ativando"',
      'Fallback automático se SW não responder na hora do registro do token',
    ],
  },
  {
    version: '1.6.15',
    date: '01/06/2026',
    changes: [
      'Fix crítico: tela preta ao abrir o app corrigida',
      'Safeguard de 8s: se autoUpdate travar, força reload automaticamente',
      'Removido polling periódico de atualização (verificação apenas na abertura)',
    ],
  },
  {
    version: '1.6.14',
    date: '01/06/2026',
    changes: [
      'Fix: banner de nova versão agora aparece para todos os usuários (logados ou não)',
      'Banner movido para nível global do app — não fica mais preso na tela de login',
    ],
  },
  {
    version: '1.6.13',
    date: '01/06/2026',
    changes: [
      'Fix: botão "Ativar Notificações" não travava mais em "Ativando..."',
      'Timeout de 20s no registro do token FCM com mensagem de erro clara',
      'Primeira ativação não apaga token existente antes de criar novo',
    ],
  },
  {
    version: '1.6.12',
    date: '01/06/2026',
    changes: [
      'Fix: diagnóstico de notificações sempre mostrava Service Worker como inativo',
      'Fix: token FCM com fallback automático se primeira tentativa falhar',
      'Fix: SW simplificado — Firebase SDK exibe notificações automaticamente',
      'Erro exato do Firebase agora visível no painel de diagnóstico',
    ],
  },
  {
    version: '1.6.11',
    date: '01/06/2026',
    changes: [
      'Fix crítico: notificações push voltam a funcionar após atualização do app',
      'Token FCM renovado automaticamente quando a versão do app muda',
      'Fix: handler de push no SW substituído por onBackgroundMessage (sem conflito)',
      'Fix: notificações agora funcionam em iOS (campo notification adicionado ao FCM)',
      'Fix: resumo diário (N8) não era enviado por erro de comparação estrita',
      'Fix: cálculo de parcelados nos alertas de orçamento (N4/N5/N9) corrigido',
      'Release script agora faz deploy automático das Cloud Functions quando alteradas',
    ],
  },
  {
    version: '1.6.10',
    date: '01/06/2026',
    changes: [
      'Configurações: notas de atualização agora exibem a versão atual automaticamente',
      'Versão e histórico sempre sincronizados com version.js',
    ],
  },
  {
    version: '1.6.9',
    date: '01/06/2026',
    changes: [
      'Fix: duplicação de itens parcelados no orçamento do mês',
      'Fix: número da parcela incorreto em faturas anteriores',
      'Fix: descrição "(Parcelas restantes)" sendo salva como transação real',
    ],
  },
  {
    version: '1.6.8',
    date: '01/06/2026',
    changes: [
      'Verificação de versão apenas na abertura do app ou ao voltar ao foco',
    ],
  },
  {
    version: '1.6.7',
    date: '01/06/2026',
    changes: [
      'Banner de nova versão na tela de login com notificação push automática',
      'Versão sempre atualizada via version.json com NetworkFirst no SW',
      'Botão "Atualizar" visível para todos os usuários ao abrir o app',
    ],
  },
  {
    version: '1.6.6',
    date: '01/06/2026',
    changes: [
      'Fix crítico: atualização automática do PWA para todos os usuários',
      'Migrado para registerType autoUpdate — novo SW ativa sem interação',
      'Tela de loading exibida automaticamente durante a atualização',
    ],
  },
  {
    version: '1.6.5',
    date: '01/06/2026',
    changes: [
      'Orçamento: drill-down por categoria com lista detalhada de lançamentos',
      'Badge com contagem de lançamentos por categoria',
      'Itens futuros marcados como "Previsto" no modal',
      'Sistema de versão e changelog implementado',
    ],
  },
  {
    version: '1.6.4',
    date: '01/06/2026',
    changes: [
      'Correção: orçamento exibe mês corrente independente do dia navegado',
      'Correção: data final de parcelas calculada corretamente',
      'CSV exportado com período expandido',
    ],
  },
  {
    version: '1.6.3',
    date: '01/06/2026',
    changes: [
      'Botão de ajuste manual do saldo global com justificativa obrigatória',
    ],
  },
  {
    version: '1.6.2',
    date: '01/06/2026',
    changes: [
      'Correção: overflow de addMonths para dias 29-31 em meses curtos',
    ],
  },
  {
    version: '1.6.1',
    date: '29/05/2026',
    changes: [
      'Auto-atualização silenciosa do PWA ao detectar nova versão',
      'Expansão de notificações push',
    ],
  },
  {
    version: '1.6.0',
    date: '28/05/2026',
    changes: [
      'Histórico avançado, planejamento anual e conciliação manual',
      'Relatórios em PDF',
      'Backup e restauração em JSON',
      'Tutorial de instalação PWA com atalho para Windows',
    ],
  },
];
