'use strict';

const { FieldValue, db } = require('../infra/firebase');
const { expandRange } = require('../motor/caixa');
const { calcSobraSeguraBot } = require('../motor/sobra');
const { dateStrFromDate, getNowBrasilia } = require('../util/datas');
const { formatBRL } = require('../util/formato');

// ─── N24 — Alerta de aporte perdido ───────────────────────────────────────────
// Rastreia quando a sobra projetada é detectada e cobra caso o usuário não
// registre nenhum aporte (tipo='investimento') dentro de LIMIAR_DIAS.
async function checkN24AportePerdido(uid, transactions, config, walletInitials, tipos) {
  if (tipos.n24 === false) return null;

  const LIMIAR_DIAS = 5;
  const hoje = getNowBrasilia();
  const todayStr = dateStrFromDate(hoje);
  // Só conta como sobra a partir do mínimo (R$ 200); um troco não gera cobrança de aporte
  const sobra = calcSobraSeguraBot(transactions, walletInitials, todayStr, hoje).investivel;

  const tracking = config?.reservaTracking || {};
  const daysBetween = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);

  // Aportou desde a sobra? Olha as OCORRÊNCIAS dos investimentos de sobraData até hoje (inclusive os dois
  // dias): reconhece aporte no mesmo dia da sobra e aporte recorrente (mensal/semanal) criado antes dela.
  // Só conta o que já aconteceu; a sobra segura já desconta o que está agendado para o futuro.
  const investedSince = tracking.sobraData
    ? expandRange(transactions.filter(t => t.tipo === 'investimento'), tracking.sobraData, todayStr)
        .some(o => o.date >= tracking.sobraData && o.date <= todayStr)
    : false;

  // Sem rastreio ativo ou usuário já aportou desde então: (re)inicia o rastreio
  if (investedSince || !tracking.sobraData) {
    if (sobra > 0) {
      await db.collection('config').doc(uid).set({
        reservaTracking: { sobraData: todayStr, sobraValor: sobra, lastRemindData: null }
      }, { merge: true }).catch(() => {});
    } else if (tracking.sobraData) {
      await db.collection('config').doc(uid).set({
        reservaTracking: FieldValue.delete()
      }, { merge: true }).catch(() => {});
    }
    return null;
  }

  // A sobra acabou antes de o usuário aportar: não há mais o que cobrar, encerra o rastreio
  if (sobra <= 0) {
    await db.collection('config').doc(uid).set({
      reservaTracking: FieldValue.delete()
    }, { merge: true }).catch(() => {});
    return null;
  }

  const diasSemAporte = daysBetween(tracking.sobraData, todayStr);
  if (diasSemAporte < LIMIAR_DIAS) return null;

  const diasDesdeLembrete = tracking.lastRemindData ? daysBetween(tracking.lastRemindData, todayStr) : 999;
  if (diasDesdeLembrete < LIMIAR_DIAS) return null;

  // Valor que ainda está disponível hoje (a sobra pode ter diminuído desde o primeiro dia)
  const valorAviso = Math.min(Number(tracking.sobraValor) || sobra, sobra);
  const [, mm, dd] = tracking.sobraData.split('-');
  const text = `🔔 *Aporte pendente!*\n\nVocê tinha *${formatBRL(valorAviso)}* disponíveis para guardar ou investir desde ${dd}/${mm} e ainda não registrou nenhum aporte.\n\n_Que tal lançar agora no app?_`;
  // O lembrete só é registrado quando quem chama confirma que o aviso FOI enviado; se o envio falhar,
  // ele é tentado de novo no próximo ciclo (antes ficava marcado como enviado e se perdia por 5 dias).
  const confirmar = () => db.collection('config').doc(uid).set({
    reservaTracking: { ...tracking, lastRemindData: todayStr }
  }, { merge: true }).catch(() => {});
  return { text, confirmar };
}

module.exports = { checkN24AportePerdido };
