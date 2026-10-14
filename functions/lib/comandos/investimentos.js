'use strict';

const { loadUserData } = require('../infra/dados');
const { db } = require('../infra/firebase');
const { sendMessage } = require('../infra/telegram');
const { expandRange } = require('../motor/caixa');
const { reservaDaCaixinhaBot } = require('../motor/caixinha');
const { linhaProjecaoReserva, projecaoReservaBot, ritmoDaReservaBot } = require('../motor/reservaRitmo');
const { SOBRA_MINIMA_BOT, calcSobraSeguraBot } = require('../motor/sobra');
const { dateStrFromDate, getNowBrasilia } = require('../util/datas');
const { barra, formatBRL } = require('../util/formato');

// ─── /reserva — Status da reserva de emergência ──────────────────────────────
async function handleReserva(chatId, uid) {
  const FAR_PAST = '2020-01-01';
  const configDoc = await db.collection('config').doc(uid).get();
  const config = configDoc.exists ? configDoc.data() : {};
  const inv = config.investimentos || {};

  if (!inv.perfil) {
    return sendMessage(chatId,
      `🌱 *Reserva de Emergência*\n\n` +
      `Você ainda não configurou sua reserva no app.\n\n` +
      `Configure seu perfil (Concursado/CLT/PJ) e despesas mensais para começar a acompanhar por aqui.\n\n` +
      `👉 Acesse o app → aba *Investir*`
    );
  }

  const { transactions, walletInitials } = await loadUserData(uid);
  const goalsSnap = await db.collection('goals').where('userId', '==', uid).get();
  const goals = goalsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const metaTotal = (inv.despesasMens || 0) * (inv.mesesMeta || 0);
  let reservaAtual = 0;
  if (inv.reservaGoalId) {
    const reservaGoal = goals.find(g => g.id === inv.reservaGoalId);
    if (reservaGoal) {
      reservaAtual = reservaDaCaixinhaBot(transactions, goals, inv.reservaGoalId); // igual à tela Metas
    }
  }

  const pct = metaTotal > 0 ? Math.min(100, Math.round((reservaAtual / metaTotal) * 100)) : 0;
  const { bar } = barra(reservaAtual, metaTotal);
  const completa = metaTotal > 0 && reservaAtual >= metaTotal;

  let msg = `🔐 *Reserva de Emergência*\n\n`;
  if (metaTotal > 0) {
    msg += `\`[${bar}] ${pct}%\`\n`;
    msg += `${formatBRL(reservaAtual)} de ${formatBRL(metaTotal)}\n\n`;
    msg += completa
      ? `✅ *Reserva completa!* 100% da sua sobra já pode ir para investimentos.`
      : `Falta *${formatBRL(metaTotal - reservaAtual)}* para completar.`;
    if (!completa) {
      // Projeção no ritmo real de aportes (mediana dos últimos 3 meses completos)
      const ritmo = ritmoDaReservaBot({ transactions, goalId: inv.reservaGoalId });
      const proj = projecaoReservaBot({ falta: metaTotal - reservaAtual, ritmoMensal: ritmo.ritmoMensal });
      const linha = linhaProjecaoReserva(ritmo, proj, formatBRL);
      if (linha) msg += `\n\n${linha}`;
    }
  } else {
    msg += `_Meta ainda não calculada — verifique a configuração no app._`;
  }

  return sendMessage(chatId, msg.trim());
}

// ─── /investimentos — Status geral de investimentos e sobra disponível ───────
async function handleInvestimentos(chatId, uid) {
  const FAR_PAST = '2020-01-01';
  const agora = getNowBrasilia();
  const todayStr = dateStrFromDate(agora);

  const { transactions, walletInitials } = await loadUserData(uid);
  const configDoc = await db.collection('config').doc(uid).get();
  const config = configDoc.exists ? configDoc.data() : {};
  const inv = config.investimentos || {};

  const totalInvestido = expandRange(
    transactions.filter(t => t.tipo === 'investimento'), FAR_PAST, todayStr
  ).reduce((acc, o) => acc + o.valor, 0);

  const sobraInfo = calcSobraSeguraBot(transactions, walletInitials, todayStr, agora);
  const sobra = sobraInfo.investivel; // 0 quando está abaixo de R$ 200

  let msg = `📈 *Investimentos*\n\n`;
  msg += `💰 Total investido: *${formatBRL(totalInvestido)}*\n`;
  msg += sobra > 0
    ? `💡 Sobra disponível para aportar: *${formatBRL(sobra)}*\n`
    : `💡 Sem sobra segura para aportar hoje (menos de ${formatBRL(SOBRA_MINIMA_BOT)} livres nos próximos 45 dias).\n`;
  if (sobraInfo.proxima) {
    const p = sobraInfo.proxima;
    msg += `📈 A partir de ${p.data.slice(8, 10)}/${p.data.slice(5, 7)} a sobra segura sobe para *${formatBRL(p.valor)}*.\n`;
  }
  msg += `\n`;

  if (inv.perfil && inv.mesesMeta && inv.despesasMens) {
    const metaTotal = inv.despesasMens * inv.mesesMeta;
    const goalsSnap = await db.collection('goals').where('userId', '==', uid).get();
    const goals = goalsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    let reservaAtual = 0;
    if (inv.reservaGoalId) {
      const reservaGoal = goals.find(g => g.id === inv.reservaGoalId);
      if (reservaGoal) {
        reservaAtual = reservaDaCaixinhaBot(transactions, goals, inv.reservaGoalId); // igual à tela Metas
      }
    }
    const reservaCompleta = reservaAtual >= metaTotal;
    if (sobra > 0) {
      if (reservaCompleta) {
        msg += `└ 100% livre para investir (reserva completa) ✅`;
      } else {
        msg += `├ Reserva (60%): ${formatBRL(sobra * 0.6)}\n`;
        msg += `└ Investimento (40%): ${formatBRL(sobra * 0.4)}`;
      }
    }
  } else {
    msg += `_Configure seu perfil de reserva no app → aba Investir para ver a divisão recomendada._`;
  }

  return sendMessage(chatId, msg.trim());
}

module.exports = { handleReserva, handleInvestimentos };
