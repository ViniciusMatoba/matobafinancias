export const APP_VERSION = '1.6.80';
export const APP_VERSION_DATE = '18/06/2026';

export const CHANGELOG = [
  {
    version: '1.6.80',
    date: '18/06/2026',
    changes: [
      'Bot: novo comando /saldofinal — exibe saldo projetado no fim de cada mês (próximos 6 meses por padrão, ou meses específicos: /saldofinal 6 7 8, /saldofinal junho, /saldofinal ano)',
    ],
  },
  {
    version: '1.6.79',
    date: '18/06/2026',
    changes: [
      'Fix: compras parceladas agora aparecem automaticamente nas faturas futuras até o número correto de parcelas — CartaoFaturaCard projeta parcelas quando não há lançamento real cadastrado para o ciclo',
    ],
  },
  {
    version: '1.6.78',
    date: '18/06/2026',
    changes: [
      'UI: checkboxes "É parcelado?" e "Conferido" substituídos por botões toggle pill com ✓ verde/azul quando ativos — feedback visual claro',
    ],
  },
  {
    version: '1.6.77',
    date: '18/06/2026',
    changes: [
      'Fix: editar fatura real de cartão com itens parcelados não duplica mais o lançamento no mês seguinte — dialog de escopo só aparece para faturas virtuais projetadas',
    ],
  },
  {
    version: '1.6.76',
    date: '18/06/2026',
    changes: [
      'Fix: clicar no lápis de item de fatura agora rola automaticamente até o formulário de edição (modal tem scroll próprio e o form ficava fora do viewport)',
    ],
  },
  {
    version: '1.6.75',
    date: '18/06/2026',
    changes: [
      'Fix: botão lápis de editar item de fatura agora abre corretamente — editItem usa cópia do objeto evitando bailout do React por referência igual',
      'Fix: dataCompra undefined em item não causa input de data descontrolado',
    ],
  },
  {
    version: '1.6.74',
    date: '18/06/2026',
    changes: [
      'Fix: número de parcela (X/Yx) exibido mesmo quando isParcelado não estava salvo no item — retrocompatível com dados antigos',
      'Fix: campo conferido dos itens preservado ao re-salvar transação de cartão',
      'Fix: save de itens infere isParcelado automaticamente se parcelaAtual e totalParcelas estão preenchidos',
    ],
  },
  {
    version: '1.6.73',
    date: '18/06/2026',
    changes: [
      'Testes: cobertura de getProximoVencimento, getClosingDate e calcFaturaCard (73 testes passando)',
    ],
  },
  {
    version: '1.6.72',
    date: '18/06/2026',
    changes: [
      'Fix: calcFaturaCard filtra por janela de vencimento (prevVenc, proximoVenc] — alinha cabeçalho com lista de lançamentos expandida',
      'Fix: parcelas futuras de itens parcelados somadas ao comprometidoFuturo — limite disponível reflete comprometimento real',
      'Fix: CartaoFaturaCard usa mesma janela de calcFaturaCard para listar lançamentos do card expandido',
    ],
  },
  {
    version: '1.6.71',
    date: '17/06/2026',
    changes: [
      'Fix: calcFaturaCard soma lançamentos cartão dentro do período (fechamento anterior, fechamento atual] — ciclo real de fechamento do cartão',
    ],
  },
  {
    version: '1.6.70',
    date: '17/06/2026',
    changes: [
      'Fix: faturaAtual usa dataInicio === proximoVenc (igualdade exata), evitando somar faturas anteriores abertas na fatura corrente',
    ],
  },
  {
    version: '1.6.69',
    date: '17/06/2026',
    changes: [
      'Fix: calcFaturaCard usa tx.valor do lançamento cartão diretamente, sem iterar tx.itens — alinhado com filtro do componente Home',
    ],
  },
  {
    version: '1.6.63',
    date: '17/06/2026',
    changes: [
      'Fix: calcFaturaCard agora usa getClosingDate (diaFechamento real) para delimitar o ciclo, alinhando Home e Projeção ao mesmo intervalo de datas',
      'Refactor: getClosingDate extraída para projectionCalc.js e compartilhada entre Projeção e calcFaturaCard',
    ],
  },
  {
    version: '1.6.62',
    date: '17/06/2026',
    changes: [
      'Fix: valor da fatura nos badges de vencimento futuros agora usa expandOccurrences, capturando corretamente parcelas de transações cujo dataInicio é anterior à janela do ciclo',
    ],
  },
  {
    version: '1.6.61',
    date: '17/06/2026',
    changes: [
      'Fix notificação de atualização: SW usa NetworkOnly para version.json (sem cache), evento pwa-update-ready liga SW ao banner instantaneamente e onRegistered verifica SW a cada 60s',
    ],
  },
  {
    version: '1.6.60',
    date: '17/06/2026',
    changes: [
      'Fix: badge de vencimento na Projeção agora usa o diaFechamento real do cartão para delimitar o ciclo, corrigindo casos onde a fatura paga não aparecia como "Pago" quando o fechamento é distante do vencimento (ex: fecha dia 11, vence dia 3)',
    ],
  },
  {
    version: '1.6.59',
    date: '17/06/2026',
    changes: [
      'Fix: badge de vencimento de cartão na Projeção muda para verde "✓ Pago" quando a fatura do ciclo já foi quitada antes do vencimento',
    ],
  },
  {
    version: '1.6.58',
    date: '17/06/2026',
    changes: [
      'Fix: valor da fatura no badge de vencimento da Projeção agora exibe o valor correto do ciclo daquela data específica, não o ciclo atual',
    ],
  },
  {
    version: '1.6.57',
    date: '17/06/2026',
    changes: [
      'Fix: notificação de atualização restaurada corretamente — SW agora aguarda confirmação do usuário antes de recarregar, garantindo que o banner "Nova versão disponível" sempre apareça',
    ],
  },
  {
    version: '1.6.56',
    date: '17/06/2026',
    changes: [
      'Performance: code splitting — bundle inicial cai de 1,4 MB para ~840 KB; telas secundárias carregadas sob demanda',
      'Projeção: badge de vencimento de cartão agora exibe o valor da fatura aberta',
      'Cartão: cada item da fatura pode ser marcado como Conferido (opcional) no formulário',
      'Cartão: botão "Histórico" na Home exibe faturas pagas agrupadas por mês',
    ],
  },
  {
    version: '1.6.55',
    date: '17/06/2026',
    changes: [
      'Fix: notificação de atualização restaurada — polling de 60 segundos no useVersionCheck garante que o banner apareça enquanto o app está aberto',
    ],
  },
  {
    version: '1.6.54',
    date: '17/06/2026',
    changes: [
      'Fix: fatura atual agora usa apenas o ciclo corrente (entre o vencimento anterior e o próximo), evitando que faturas de meses passados não conferidas inflassem o valor',
      'Refactor: cálculo de fatura centralizado em calcFaturaCard() — elimina 4 cópias duplicadas da mesma lógica',
    ],
  },
  {
    version: '1.6.53',
    date: '17/06/2026',
    changes: [
      'Novo: dashboard de cartões de crédito na Home — card por cartão com fatura aberta, barra de limite, disponível e badges de fechamento/vencimento iminente',
      'Novo: card expansível mostra todos os lançamentos e itens da fatura atual ao tocar',
      'Melhoria: alertas simples de vencimento substituídos pelo novo painel de cartões',
    ],
  },
  {
    version: '1.6.52',
    date: '17/06/2026',
    changes: [
      'Fix: cálculo de fatura atual agora usa o próximo vencimento real do cartão (baseado em diaFechamento + diaVencimento) em vez do mês calendário, corrigindo casos onde a fatura vence no início do mês seguinte (ex: vence dia 3)',
    ],
  },
  {
    version: '1.6.51',
    date: '17/06/2026',
    changes: [
      'Fix: fatura atual do cartão não considera mais lançamentos já pagos (conferido), evitando que faturas quitadas inflassem o limite comprometido',
    ],
  },
  {
    version: '1.6.50',
    date: '17/06/2026',
    changes: [
      'Fix: revínculo em massa agora detecta lançamentos com frequência "cartao" além do tipo "cartao", cobrindo lançamentos antigos criados antes da integração completa',
    ],
  },
  {
    version: '1.6.49',
    date: '17/06/2026',
    changes: [
      'Novo: lançamentos de cartão sem vínculo agora aparecem em Config > Cartões para revínculo em massa',
      'Novo: ao selecionar o cartão no formulário, a data é preenchida automaticamente com o próximo vencimento',
      'Novo: painel de limite disponível, fatura atual e parcelados futuros exibido no formulário ao selecionar o cartão',
      'Novo: badges de fechamento (📅) e vencimento (💳) de cada cartão aparecem nos dias correspondentes na tela de Projeção',
    ],
  },
  {
    version: '1.6.48',
    date: '17/06/2026',
    changes: [
      'Melhoria: tratamento de erros com toast nas operações de salvar, excluir, pagar e editar recorrências — o usuário agora é informado quando uma operação falha',
      'Novo: testes automatizados (Vitest) para as funções críticas de cálculo financeiro e datas (54 casos cobrindo expandOccurrences, calcSaldo, addMonths, etc.)',
      'Refactor: lógica de estado e handlers extraída de App.jsx para AppContext — manutenção simplificada sem alteração de comportamento',
      'Docs: JSDoc com shapes completos (Transaction, Card, Wallet, Goal, Config) nos hooks de dados',
      'Segurança: limite de 10.000 documentos por usuário no Firestore para evitar leituras excessivas em caso de volume muito alto de transações',
    ],
  },
  {
    version: '1.6.47',
    date: '17/06/2026',
    changes: [
      'Novo: agrupamento dinâmico de despesas por descrição (como subcategorias implícitas) no modal de drill-down de orçamentos',
      'Melhoria: integração das principais despesas do mês nos alertas de orçamento push (N4/N5)',
      'Melhoria: integração dos maiores gastos por categoria nos comandos do bot do Telegram (/categoria e /insight)',
    ],
  },
  {
    version: '1.6.46',
    date: '17/06/2026',
    changes: [
      'Fix: cálculo de limite geral de gastos (N9) e relatório comparativo mensal (N12) corrigidos para incluir lançamentos recorrentes semanais/diários e respeitar exclusões',
      'Segurança: verificação de segredo de webhook (secret_token) adicionada para evitar spoofing no bot do Telegram',
      'Melhoria: detecção automática de bloqueios do bot (erro 403) ou chats inexistentes para limpar e desativar alertas do Telegram dos respectivos usuários',
    ],
  },
  {
    version: '1.6.45',
    date: '08/06/2026',
    changes: [
      'Fix: bot Telegram agora exibe o SALDO GLOBAL correto — transações do tipo "Diário" (estimativas) não eram excluídas do saldo passado, gerando valores inflados',
      'Fix: alertas de orçamento por categoria (N4/N5) continuam contando estimativas diárias para fins de planejamento',
    ],
  },
  {
    version: '1.6.44',
    date: '08/06/2026',
    changes: [
      'Fix: card "Próximas Contas" agora exibe apenas lançamentos concretos — lançamentos do tipo Diário (estimativas) são excluídos e continuam visíveis apenas na tela de Projeção',
    ],
  },
  {
    version: '1.6.43',
    date: '08/06/2026',
    changes: [
      'Melhoria: alerta de vencimento de fatura restaurado na Home com valor da fatura do mês vinculado',
      'Melhoria: alerta muda de cor conforme urgência — azul (>2 dias), laranja (≤2 dias), vermelho (hoje)',
    ],
  },
  {
    version: '1.6.42',
    date: '08/06/2026',
    changes: [
      'Removido: cards de cartões de crédito da tela inicial (limite/disponível) — não havia integração com bancos, gerava confusão',
      'Removido: alerta de vencimento de fatura na tela inicial',
    ],
  },
  {
    version: '1.6.41',
    date: '08/06/2026',
    changes: [
      'Fix: lançamentos mensais no dia 31 (ou 30) agora preservam o dia original em todos os meses — quando o mês não tem o dia, usa o último dia do mês; no mês seguinte volta ao dia correto',
    ],
  },
  {
    version: '1.6.40',
    date: '08/06/2026',
    changes: [
      'Novo: campo "Quantidade de vezes" nos lançamentos recorrentes — informe quantas vezes e a data fim é calculada automaticamente',
      'Novo: toggle 📅 Data / 🔢 Qtde disponível para frequências mensal, semanal, diário e tipo Diário',
      'Melhoria: preview da última ocorrência exibida em tempo real ao digitar a quantidade',
    ],
  },
  {
    version: '1.6.39',
    date: '03/06/2026',
    changes: [
      'Obrigatório: categoria agora é exigida em todos os lançamentos (saída, diário, cartão)',
      'Novo: card "Próximas Contas" na Home — clique para ver fluxo de caixa dos próximos 7 dias',
      'Novo: resumo automático de virada de mês (aparece nos dias 1–5 com resultado do mês anterior)',
      'Novo: barra de poupança mensal na meta de Liberdade Financeira (GoalsScreen)',
      'Novo: gráfico ComposedChart na aba Evolução — entradas, saídas e saldo dos últimos 6 meses',
      'Bot: novos comandos /proximas, /previsao e /economias',
      'Bot: /hoje agora mostra pago vs pendente',
      'Notificações: N19 (gasto atípico), N20 (progresso metas sexta), N21 (lembrete conferência dia 20)',
    ],
  },
  {
    version: '1.6.38',
    date: '03/06/2026',
    changes: [
      'Fix: edição de ocorrência única agora preserva status de conciliação da recorrência original',
      'Fix: dependência redundante removida de handleDelete (performance)',
      'Novo: alerta proativo ao salvar despesa que ultrapassa 80% ou 100% do orçamento da categoria',
      'Novo: aba "Evolução" em Relatórios — comparativo dos últimos 3 meses por categoria com tendência ↑↓',
      'Melhoria: exportação CSV agora inclui itens individuais de cartão, carteira, conferido e parcela',
    ],
  },
  {
    version: '1.6.37',
    date: '03/06/2026',
    changes: [
      'N18: novo alerta "Economia do dia" — às 19h, parabeniza quando gastos previstos não foram registrados',
      'N18: exibe total economizado no mês até hoje',
      'N18: dispara para todos os usuários às 19h, independente do horário configurado',
      'Toggle N18 disponível em Notificações Push e Bot Telegram',
    ],
  },
  {
    version: '1.6.36',
    date: '03/06/2026',
    changes: [
      'Conciliação: corrigido alinhamento lógico de conciliação bancária e pagamentos para transações legadas sem propriedade frequencia',
    ],
  },
  {
    version: '1.6.35',
    date: '03/06/2026',
    changes: [
      'Simulador: correção de bug crítico de parse de strings BRL para números nas fórmulas de amortização',
      'Carteiras: corrigida gravação de saldoInicial como string no Firestore para evitar NaNs em somatórios acumulados',
    ],
  },
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
