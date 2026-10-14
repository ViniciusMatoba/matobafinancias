'use strict';

const { db } = require('../infra/firebase');
const { tgFetch } = require('../infra/telegram');

// ─── Configuração de alertas via bot (menu interativo inline) ─────────────────

const DEFAULT_TG_TIPOS = {
  n1:true,n2:true,n3:true,n4:true,n5:true,n6:true,n7:true,
  n8:true,n9:true,n10:true,n11:true,n12:true,
  n13:true,n14:true,n15:true,n16:true,n17:true,n18:true,
  n19:true,n20:true,n21:true,n22:true,n23:true,n24:true,n25:true,
  n27:true, // limite mensal por tag (n26 é reservado para o aviso de assinaturas)
};

const ALERT_LABELS = {
  n1:'Fatura vence hoje',   n2:'Vence em X dias',      n3:'Fecha em 2 dias',
  n4:'Orçamento >80%',      n5:'Orçamento estourado',  n6:'Saldo negativo 7d',
  n7:'Resumo semanal',      n8:'Resumo diário',         n9:'Limite geral gastos',
  n10:'Contas fixas',       n11:'Cartão no limite',     n12:'Rel. mensal',
  n13:'Fecha amanhã',       n14:'Última parcela',       n15:'Saldo mínimo',
  n16:'Caixinhas (dia 1)',  n17:'Metade do mês',        n18:'Economia do dia',
  n19:'Gasto atípico do dia', n20:'Progresso metas (sex)', n21:'Conferência (dia 20)',
  n22:'Sobra segura',          n23:'Relatório invest. (15/fim)', n24:'Aporte pendente',
  n25:'Acima da média',
  n27:'Limite por tag',
};

// Grupos de alertas para organizar o menu
const ALERT_GROUPS = [
  { emoji:'💳', title:'Cartão',        ids:['n1','n2','n3','n13'] },
  { emoji:'💰', title:'Orçamento',     ids:['n4','n5','n9','n27'] },
  { emoji:'⚠️', title:'Alertas',       ids:['n6','n10','n11','n14','n15'] },
  { emoji:'📊', title:'Resumos',       ids:['n7','n8','n12','n16','n17'] },
  { emoji:'💚', title:'Economia',      ids:['n18','n19','n25'] },
  { emoji:'🎯', title:'Metas e Banco', ids:['n20','n21'] },
  { emoji:'📈', title:'Investimentos', ids:['n22','n23','n24'] },
];

// Texto do menu de configuração
function buildConfigText(tipos) {
  let t = `⚙️ *Configurar Alertas do Telegram*\n`;
  t += `_Toque em um alerta para ativar ✅ ou desativar ❌_\n\n`;
  for (const g of ALERT_GROUPS) {
    t += `${g.emoji} *${g.title}*\n`;
    for (const id of g.ids) {
      t += `${tipos[id] !== false ? '✅' : '❌'} ${ALERT_LABELS[id]}\n`;
    }
    t += '\n';
  }
  const ativos = Object.values(tipos).filter(v => v !== false).length;
  t += `_${ativos} de ${Object.keys(ALERT_LABELS).length} alertas ativos_`;
  return t.trim();
}

// Teclado inline com botões de toggle por grupo (2 por linha)
function buildConfigKeyboard(tipos) {
  const rows = [];
  for (const g of ALERT_GROUPS) {
    // Cabeçalho do grupo como botão desabilitado (apenas texto)
    rows.push([{ text: `${g.emoji} ${g.title}`, callback_data: 'noop' }]);
    // Botões de toggle, 2 por linha
    for (let i = 0; i < g.ids.length; i += 2) {
      const row = [];
      for (let j = i; j < Math.min(i + 2, g.ids.length); j++) {
        const id = g.ids[j];
        const on = tipos[id] !== false;
        row.push({ text: `${on ? '✅' : '❌'} ${ALERT_LABELS[id]}`, callback_data: `tgl_${id}` });
      }
      rows.push(row);
    }
  }
  // Botões de ação globais
  rows.push([
    { text: '✅ Ativar todos',   callback_data: 'cfg_all_on'  },
    { text: '❌ Desativar todos', callback_data: 'cfg_all_off' },
  ]);
  rows.push([{ text: '✔️ Pronto — fechar menu', callback_data: 'cfg_done' }]);
  return { inline_keyboard: rows };
}

// Lê telegramTipos do Firestore (com defaults)
async function getTelegramTipos(uid) {
  const configDoc = await db.collection('config').doc(uid).get();
  const prefs     = configDoc.exists ? (configDoc.data().notificacoes || {}) : {};
  return { ...DEFAULT_TG_TIPOS, ...(prefs.telegramTipos ?? prefs.tipos ?? {}) };
}

// Salva telegramTipos no Firestore
async function saveTelegramTipos(uid, tipos) {
  const configDoc = await db.collection('config').doc(uid).get();
  const prefs     = configDoc.exists ? (configDoc.data().notificacoes || {}) : {};
  await db.collection('config').doc(uid).set(
    { notificacoes: { ...prefs, telegramTipos: tipos } },
    { merge: true }
  );
}

async function handleConfigurar(chatId, uid) {
  const tipos = await getTelegramTipos(uid);
  return tgFetch('sendMessage', {
    chat_id:      chatId,
    text:         buildConfigText(tipos),
    parse_mode:   'Markdown',
    reply_markup: buildConfigKeyboard(tipos),
  });
}

module.exports = { DEFAULT_TG_TIPOS, ALERT_LABELS, ALERT_GROUPS, buildConfigText, buildConfigKeyboard, getTelegramTipos, saveTelegramTipos, handleConfigurar };
