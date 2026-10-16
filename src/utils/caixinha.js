import { sinalNaCaixinha } from './investido';

/**
 * Saldo de uma caixinha (meta). Mesma regra da tela Metas e do comando /meta do bot:
 * soma o valor dos lançamentos ligados à meta por `metaId` — saída subtrai, qualquer outro tipo
 * (investimento, entrada) soma. Cada lançamento conta uma vez, com o valor do próprio lançamento.
 *
 * O aporte pelo app é gravado com `metaId`; foi isso que a reserva de emergência ignorava (procurava
 * goalId/cartaoVinculo, campos que o app nunca grava).
 */
export function saldoCaixinha(transactions, goalId) {
  if (!goalId) return 0;
  return (transactions || [])
    .filter(t => t.metaId === goalId)
    .reduce((acc, t) => {
      return acc + sinalNaCaixinha(t) * (Number(t.valor) || 0);
    }, 0);
}

/** Valor da reserva de emergência: o saldo da caixinha escolhida, nunca negativo. */
export function reservaDaCaixinha(transactions, goals, goalId) {
  if (!goalId || !(goals || []).some(g => g.id === goalId)) return 0;
  return Math.max(saldoCaixinha(transactions, goalId), 0);
}

const semAcento = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * Caixinha que faz o papel de reserva de emergência: a escolhida na tela Investir (config.investimentos.reservaGoalId)
 * tem prioridade; sem escolha, procura uma caixinha cujo nome contenha "reserva de emergência".
 */
export function acharCaixinhaReserva(goals, config) {
  const lista = goals || [];
  const id = config?.investimentos?.reservaGoalId;
  const escolhida = id ? lista.find(g => g.id === id) : null;
  if (escolhida) return escolhida;
  return lista.find(g => semAcento(g.nome).includes('reserva de emergencia')) || null;
}

/**
 * Situação da reserva para o banner da Home. Saldo = o mesmo da tela Metas/Investir (reservaDaCaixinha).
 * Meta = a da própria caixinha; sem ela, a do perfil da tela Investir (despesas × meses). `metaRecomendada`
 * (6 meses de custos fixos pela renda) só serve para quem ainda não tem caixinha de reserva.
 */
export function resumoReservaHome({ goals, transactions, config }) {
  const custosFixos = config?.rendaMensal
    ? (config.rendaMensal * (Number(config.budgetPcts?.custos_fixos) || 30)) / 100
    : 1500;
  const metaRecomendada = custosFixos * 6;

  const goal = acharCaixinhaReserva(goals, config);
  if (!goal) return { exists: false, saldo: 0, metaFinal: 0, metaRecomendada, semMeta: false, completed: false };

  const saldo = reservaDaCaixinha(transactions, goals, goal.id);
  const inv = config?.investimentos || {};
  const metaPerfil = (Number(inv.despesasMens) || 0) * (Number(inv.mesesMeta) || 0);
  const metaFinal = Number(goal.metaFinal) > 0 ? Number(goal.metaFinal) : metaPerfil;
  const semMeta = !(metaFinal > 0);
  return { exists: true, saldo, metaFinal, metaRecomendada, semMeta, completed: !semMeta && saldo >= metaFinal };
}
