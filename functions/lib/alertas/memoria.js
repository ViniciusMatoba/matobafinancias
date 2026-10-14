'use strict';

const { logger } = require('firebase-functions');
const { db } = require('../infra/firebase');
const { diffDaysStr } = require('../util/datas');

// ─── Memória de avisos: não repete o que não mudou ────────────────────────────
// Cada aviso pode trazer estado: { chave, sig, repetirDias? }. Só é enviado se a assinatura
// (sig) mudou desde o último envio, ou se passou repetirDias (avisos urgentes). Chaves que
// deixaram de disparar saem do estado — se a condição voltar, avisa de novo.
function filtrarAlertasRepetidos(msgs, estadoAnterior, hojeStr) {
  const ant = estadoAnterior || {};
  const enviar = [];
  const estadoNovo = {};
  for (const msg of msgs) {
    const est = typeof msg === 'object' ? msg.estado : null;
    if (!est || !est.chave) { enviar.push(msg); continue; }
    const prev = ant[est.chave];
    const dias = prev?.data ? diffDaysStr(prev.data, hojeStr) : Infinity;
    const repete = est.repetirDias ? dias >= est.repetirDias : false;
    if (prev && prev.sig === est.sig && !repete) {
      estadoNovo[est.chave] = prev;
    } else {
      enviar.push(msg);
      estadoNovo[est.chave] = { sig: est.sig, data: hojeStr };
    }
  }
  return { enviar, estadoNovo };
}

// Aviso cujo envio falhou não pode ficar marcado como "já avisado": volta ao estado anterior.
function estadoAposEnvio(estadoNovo, estadoAnterior, chavesFalhas) {
  const out = { ...estadoNovo };
  for (const chave of chavesFalhas) {
    if (estadoAnterior && estadoAnterior[chave]) out[chave] = estadoAnterior[chave];
    else delete out[chave];
  }
  return out;
}

async function lerEstadoAlertas(uid, canal) {
  try {
    const snap = await db.collection('alertasEstado').doc(uid).get();
    return (snap.exists && snap.data()[canal]) || {};
  } catch (e) {
    logger.error(`[ALERTAS] leitura de estado uid=${uid}:`, e.message);
    return {};
  }
}

async function gravarEstadoAlertas(uid, canal, estado) {
  try {
    await db.collection('alertasEstado').doc(uid).set({ [canal]: estado }, { mergeFields: [canal] });
  } catch (e) {
    logger.error(`[ALERTAS] gravação de estado uid=${uid}:`, e.message);
  }
}

module.exports = { filtrarAlertasRepetidos, estadoAposEnvio, lerEstadoAlertas, gravarEstadoAlertas };
