export const APP_VERSION = '1.6.5';
export const APP_VERSION_DATE = '01/06/2026';

export const CHANGELOG = [
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
