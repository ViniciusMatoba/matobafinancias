'use strict';

const { APP_URL, sendMessage } = require('../infra/telegram');

async function handleAjuda(chatId) {
  const MAIN_KEYBOARD = {
    keyboard: [
      [{ text: '💰 Saldo' },      { text: '💳 Cartões' },   { text: '🧾 Fatura' }],
      [{ text: '📊 Categorias' }, { text: '🎯 Metas' },     { text: '📈 Projeção' }],
      [{ text: '💡 Insight' },    { text: '📋 Parcelados' },{ text: '📅 Saldo Fim Mês' }],
      [{ text: '🔐 Reserva' },   { text: '📈 Investimentos' }, { text: '🏷️ Tags' }],
      [{ text: '⚙️ Configurar' }],
      [{ text: '❓ Ajuda' }],
    ],
    resize_keyboard: true,
  };
  return sendMessage(chatId,
    `🤖 *Matoba Finanças — Comandos disponíveis*\n\n` +

    `*📊 Consultas financeiras*\n` +
    `/saldo — Saldo atual da sua conta\n` +
    `/hoje — Lançamentos registrados hoje\n` +
    `/historico — Últimos 10 lançamentos\n` +
    `/semana — Gráfico de saídas dos últimos 7 dias\n` +
    `/mes — Resumo do mês atual _(ex: /mes 4 para abril)_\n` +
    `/resumo — Entradas, saídas e saldo do mês corrente\n\n` +

    `*🎯 Orçamento e metas*\n` +
    `/categoria — Orçamento por categoria com barras de progresso\n` +
    `/gastos — Todas as despesas do mês por categoria _(ex: /gastos conforto, /gastos mercado, /gastos agosto, /gastos top)_\n` +
    `/tags — Total gasto por tag no mês _(ex: /tags agosto; veja uma tag com /gastos mercado)_\n` +
    `/meses — Total gasto por mês e qual foi o mês mais alto _(ex: /meses 6)_\n` +
    `/meta — Status de cada meta da Divisão Percentual\n` +
    `/insight — Dicas e análises dinâmicas de gastos 💡\n\n` +

    `*🔐 Reserva e Investimentos*\n` +
    `/reserva — Status da sua reserva de emergência\n` +
    `/investimentos — Total investido e sobra disponível para aportar\n\n` +

    `*💳 Cartões de Crédito*\n` +
    `/cartoes — Seus cartões, limites e vencimentos\n` +
    `/fatura — Detalhamento de faturas e compras do ciclo atual 🧾\n` +
    `/parcelados — Compras parceladas em aberto: parcelas restantes e valores 📋\n` +
    `/assinaturas — O que cai todo mês: assinaturas no cartão, Pix/débito e totais 🔁\n\n` +

    `*📈 Projeção e Economia*\n` +
    `/saldofinal — Saldo projetado no fim de cada mês 📅\n` +
    `/projecao — Saldo projetado nos próximos 7 dias\n` +
    `/proximas — Próximas despesas dos próximos 7 dias\n` +
    `/previsao — Fluxo de caixa para os próximos 30 dias\n` +
    `/economias — Gastos não registrados e meta de poupança\n\n` +

    `*⚙️ Configurações*\n` +
    `/configurar — Ativar/desativar alertas diretamente aqui no Telegram\n\n` +

    `📱 *Para adicionar ou editar lançamentos use o app:*\n` +
    `👉 ${APP_URL}\n\n` +
    `_Para desvincular: Configurações → Bot do Telegram → Desvincular_`,
    { reply_markup: MAIN_KEYBOARD }
  );
}

module.exports = { handleAjuda };
