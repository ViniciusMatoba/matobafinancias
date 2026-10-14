'use strict';

const { logger } = require('firebase-functions');
const { handleCallbackQuery } = require('../acoes/callbacks');
const { handleAjuda } = require('../comandos/ajuda');
const { handleConfigurar } = require('../comandos/configurar');
const { handleCartoes, handleCategoria, handleHistorico, handleHoje, handleMes, handleMeta, handleResumo, handleSaldo, handleSemana, msgSomenteApp } = require('../comandos/consultas');
const { handleFatura, handleParcelados } = require('../comandos/faturas');
const { handleGastos, handleMeses, handleTags } = require('../comandos/gastos');
const { handleInvestimentos, handleReserva } = require('../comandos/investimentos');
const { handleEconomias, handleInsight, handlePrevisao, handleProjecao, handleProximas, handleSaldoFinal } = require('../comandos/planejamento');
const { handleVincular } = require('../comandos/vincular');
const { db } = require('../infra/firebase');
const { sendMessage } = require('../infra/telegram');
const { handleOnboardingStep } = require('../onboarding/fluxo');

// ─── Processamento do update Telegram ────────────────────────────────────────
async function processUpdate(update) {
  // callback_query = botões inline pressionados
  if (update.callback_query) {
    return handleCallbackQuery(update.callback_query);
  }

  const msg = update.message || update.edited_message;
  if (!msg || !msg.text) return;

  const chatId   = msg.chat.id;
  const fromUser = msg.from;
  const text     = msg.text.trim();

  logger.info(`[TG] chat=${chatId} text="${text}"`);

  // Verifica se o usuário já está vinculado
  const usersSnap = await db.collection('users').where('telegramChatId', '==', String(chatId)).limit(1).get();
  const isLinked  = !usersSnap.empty;
  const uid       = isLinked ? usersSnap.docs[0].id : null;

  // Parse do comando
  const [rawCmd, ...argParts] = text.split(/\s+/);
  let cmd  = rawCmd.toLowerCase().replace(/@\w+$/, ''); // remove @BotName
  const args = argParts.join(' ');

  // Normalização do comando (mapeia botões de teclado personalizados)
  // Verifica o texto completo (não só cmd) para suportar botões com emoji prefix: "💰 Saldo" → cmd='💰'
  if (!cmd.startsWith('/')) {
    const t = text.toLowerCase();
    if (t.includes('saldo') && (t.includes('final') || t.includes('fim'))) cmd = '/saldofinal';
    else if (t.includes('saldo')) cmd = '/saldo';
    else if (t.includes('cart') || t.includes('cartões')) cmd = '/cartoes';
    else if (t.includes('fatur')) cmd = '/fatura';
    else if (t.includes('proje') || t.includes('projeção')) cmd = '/projecao';
    else if (t.includes('categor')) cmd = '/categoria';
    else if (t.includes('configur') || t.includes('alerta') || t.includes('⚙️')) cmd = '/configurar';
    else if (t.includes('meta')) cmd = '/meta';
    else if (/\btags?\b/.test(t)) cmd = '/tags';
    else if (t.includes('meses')) cmd = '/meses';
    else if (t.includes('gasto')) cmd = '/gastos';
    else if (t.includes('reserva')) cmd = '/reserva';
    else if (t.includes('investiment')) cmd = '/investimentos';
    else if (t.includes('insig') || t.includes('dica') || t.includes('insight')) cmd = '/insight';
    else if (t.includes('ajuda') || t.includes('help')) cmd = '/ajuda';
    else if (t.includes('parcela')) cmd = '/parcelados';
    else if (t.includes('hoje')) cmd = '/hoje';
    else if (t.includes('hist')) cmd = '/historico';
    else if (t.includes('seman')) cmd = '/semana';
    else if (t.includes('mes') || t.includes('mês')) cmd = '/mes';
    else if (t.includes('resum')) cmd = '/resumo';
  }

  // Comandos que não precisam de vínculo
  if (cmd === '/start' || cmd === '/vincular') {
    const code = args || (cmd === '/start' && argParts[0]) || '';
    return handleVincular(chatId, code, fromUser);
  }

  if (!isLinked) {
    return sendMessage(chatId,
      '👋 Olá! Para usar o bot, vincule sua conta:\n\n' +
      '1. Abra o app *Matoba Finanças*\n' +
      `2. Vá em *Configurações → Bot do Telegram*\n` +
      '3. Gere um código e envie `/vincular CÓDIGO` aqui'
    );
  }

  // Onboarding ativo: as respostas (texto comum e /pular) vão para o cadastro de alertas. Comandos com "/"
  // funcionam normalmente (antes eram tratados como resposta inválida) e o bot lembra que o cadastro segue pendente.
  let lembreteOnboarding = false;
  {
    const userData   = usersSnap.docs[0].data();
    const onboarding = userData.telegramOnboarding;
    if (onboarding?.active) {
      const ehPular = /^\/(pular|skip)$/i.test(text);
      if (!text.startsWith('/') || ehPular) {
        return handleOnboardingStep(chatId, uid, onboarding, text);
      }
      lembreteOnboarding = true;
    }
  }

  // Comandos que tentam adicionar/editar → redireciona para o app
  const CMDS_BLOQUEADOS = ['/adicionar','/add','/novo','/new','/editar','/edit','/excluir','/deletar','/delete','/remover','/remove'];
  if (CMDS_BLOQUEADOS.includes(cmd)) {
    return msgSomenteApp(chatId);
  }

  const executarComando = async () => {
  switch (cmd) {
    case '/saldo':     return handleSaldo(chatId, uid);
    case '/hoje':      return handleHoje(chatId, uid);
    case '/historico': return handleHistorico(chatId, uid);
    case '/semana':    return handleSemana(chatId, uid);
    case '/mes':       return handleMes(chatId, uid, args);
    case '/resumo':    return handleResumo(chatId, uid);
    case '/categoria': return handleCategoria(chatId, uid);
    case '/meta':      return handleMeta(chatId, uid);
    case '/gastos':         return handleGastos(chatId, uid, args);
    case '/meses':          return handleMeses(chatId, uid, args);
    case '/tags':           return handleTags(chatId, uid, args);
    case '/reserva':        return handleReserva(chatId, uid);
    case '/investimentos':  return handleInvestimentos(chatId, uid);
    case '/cartoes':   return handleCartoes(chatId, uid);
    case '/fatura':    return handleFatura(chatId, uid);
    case '/projecao':  return handleProjecao(chatId, uid);
    case '/insight':    return handleInsight(chatId, uid);
    case '/proximas':    return handleProximas(chatId, uid);
    case '/previsao':    return handlePrevisao(chatId, uid);
    case '/economias':   return handleEconomias(chatId, uid);
    case '/parcelados':  return handleParcelados(chatId, uid);
    case '/saldofinal':  return handleSaldoFinal(chatId, uid, args);
    case '/configurar':
    case '/alertas':   return handleConfigurar(chatId, uid);
    case '/ajuda':
    case '/help':      return handleAjuda(chatId);
    default:
      return sendMessage(chatId,
        `Comando não reconhecido. Use /ajuda para ver todos os comandos disponíveis.`
      );
  }
  };

  const resultado = await executarComando();
  if (lembreteOnboarding) {
    await sendMessage(chatId,
      `ℹ️ _Seu cadastro de alertas ainda está em andamento. Quando quiser, responda a última pergunta ou envie /pular para usar o padrão._`
    );
  }
  return resultado;
}

module.exports = { processUpdate };
