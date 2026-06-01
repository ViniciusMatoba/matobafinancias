// Tipos de notificação compartilhados entre Push e Telegram.
// Cada canal tem seus próprios toggles independentes.

export const DEFAULT_NOTIFICATION_TIPOS = {
  n1: true, n2: true, n3: true, n4: true, n5: true, n6: true, n7: true,
  n8: true, n9: true, n10: true, n11: true, n12: true,
  n13: true, n14: true, n15: true, n16: true, n17: true,
};

export const TIPO_INFO = {
  n1:  { label: 'Fatura vence hoje',             icon: '💳', desc: 'Avisa no dia em que uma fatura de cartão vence' },
  n2:  { label: 'Fatura vence em X dias',        icon: '📅', desc: 'Lembrete antecipado para não perder o vencimento (prazo configurável)' },
  n3:  { label: 'Fatura fecha em 2 dias',        icon: '⏰', desc: 'Alerta quando a fatura está prestes a fechar' },
  n4:  { label: 'Orçamento acima de 80%',        icon: '⚠️', desc: 'Avisa quando uma categoria passa de 80% do limite mensal' },
  n5:  { label: 'Orçamento estourado',           icon: '🚨', desc: 'Avisa quando uma categoria ultrapassa 100% do orçamento' },
  n6:  { label: 'Saldo negativo em 7 dias',      icon: '📉', desc: 'Projeção detecta saldo negativo na próxima semana' },
  n7:  { label: 'Resumo semanal',                icon: '📊', desc: 'Total de entradas, saídas e saldo da semana (dia configurável)' },
  n8:  { label: 'Resumo diário matinal',         icon: '🌅', desc: 'Saldo atual e lançamentos do dia no horário configurado' },
  n9:  { label: 'Limite geral de gastos',        icon: '🚨', desc: 'Avisa se os gastos totais mensais atingirem 80% ou 100% da renda' },
  n10: { label: 'Contas fixas pendentes',        icon: '⏰', desc: 'Lembrete de contas fixas recorrentes a vencer em 2 dias' },
  n11: { label: 'Cartão próximo do limite',      icon: '💳', desc: 'Avisa se a fatura de algum cartão atingir 80% do limite' },
  n12: { label: 'Relatório mensal comparativo',  icon: '📈', desc: 'No dia 1º: compara os gastos do mês encerrado com o anterior' },
  n13: { label: 'Fatura fecha amanhã',           icon: '⚡', desc: 'Aviso final: fatura fecha no dia seguinte — últimas horas para compras' },
  n14: { label: 'Última parcela paga',           icon: '🎉', desc: 'Avisa quando a última parcela vence hoje, liberando o valor no orçamento' },
  n15: { label: 'Saldo abaixo do mínimo',        icon: '🔴', desc: 'Alerta quando o saldo global cai abaixo do valor mínimo configurado' },
  n16: { label: 'Resumo das caixinhas (dia 1)',  icon: '🎯', desc: 'No início do mês: progresso de todas as metas com barra visual' },
  n17: { label: 'Balanço da metade do mês',      icon: '📊', desc: 'No dia 15: projeção de como o orçamento vai fechar' },
};
