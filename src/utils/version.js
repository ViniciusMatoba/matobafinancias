export const APP_VERSION = '1.6.9';
export const APP_VERSION_DATE = '01/06/2026';

export const CHANGELOG = [
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
