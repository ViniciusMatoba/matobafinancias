export const APP_VERSION = '1.6.14';
export const APP_VERSION_DATE = '01/06/2026';

export const CHANGELOG = [
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
