'use strict';

const { onRequest } = require('firebase-functions/v2/https');
const { REGION } = require('../infra/config');
const { tgFetch } = require('../infra/telegram');

// ─── EXPORT 3: Status e configuração do webhook ───────────────────────────────
// GET  → retorna informações atuais do webhook registrado no Telegram
// POST → registra a URL passada no body { url: "https://..." }
// Lista de comandos exibidos no menu do BotFather
const BOT_COMMANDS = [
  { command: 'saldo',      description: 'Saldo atual da conta' },
  { command: 'hoje',       description: 'Lancamentos registrados hoje' },
  { command: 'historico',  description: 'Ultimos 10 lancamentos' },
  { command: 'semana',     description: 'Grafico de saidas dos ultimos 7 dias' },
  { command: 'mes',        description: 'Resumo do mes (ex: /mes 4 para abril)' },
  { command: 'resumo',     description: 'Entradas, saidas e saldo do mes corrente' },
  { command: 'categoria',  description: 'Orcamento por categoria com barras de progresso' },
  { command: 'meta',       description: 'Status das metas da Divisao Percentual' },
  { command: 'gastos',     description: 'Despesas do mes por categoria (ex: /gastos agosto, /gastos top)' },
  { command: 'meses',      description: 'Total gasto por mes e mes mais alto' },
  { command: 'tags',       description: 'Total gasto por tag no mes (ex: /tags agosto)' },
  { command: 'reserva',    description: 'Status da reserva de emergencia' },
  { command: 'investimentos', description: 'Total investido e sobra disponivel' },
  { command: 'insight',    description: 'Dicas e analises inteligentes de gastos' },
  { command: 'cartoes',    description: 'Cartoes cadastrados e vencimentos' },
  { command: 'fatura',     description: 'Itens e total acumulado na fatura atual' },
  { command: 'projecao',   description: 'Saldo projetado para os proximos 7 dias' },
  { command: 'configurar', description: 'Ativar ou desativar alertas automaticos pelo bot' },
  { command: 'ajuda',      description: 'Lista completa de comandos' },
];

exports.setTelegramWebhook = onRequest(
  { region: REGION },
  async (req, res) => {
    if (req.method === 'POST' && req.body?.url) {
      const webhookResult = await tgFetch('setWebhook', {
        url:             req.body.url,
        allowed_updates: ['message', 'callback_query'],
        secret_token:    process.env.TELEGRAM_SECRET_TOKEN || undefined,
      });
      // Registra comandos no BotFather junto com o webhook
      const cmdsResult = await tgFetch('setMyCommands', { commands: BOT_COMMANDS });
      res.json({ registered: req.body.url, webhook: webhookResult, commands: cmdsResult });
    } else if (req.method === 'POST' && req.body?.registerCommands) {
      // POST { registerCommands: true } — apenas atualiza os comandos
      const cmdsResult = await tgFetch('setMyCommands', { commands: BOT_COMMANDS });
      res.json({ commands: cmdsResult });
    } else {
      // GET: retorna status atual do webhook
      const info = await tgFetch('getWebhookInfo', {});
      res.json(info);
    }
  }
);
