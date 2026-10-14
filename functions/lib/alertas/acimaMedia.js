'use strict';

const { db } = require('../infra/firebase');
const { GASTOS_CATS, collectMonthExpenses } = require('../motor/competencia');
const { getNowBrasilia } = require('../util/datas');
const { formatBRL, normTxt } = require('../util/formato');

// ─── N25 — Categoria acima da média dos últimos meses ────────────────────────
// Compara o mês corrente (mês inteiro, lançado + previsto) com a média dos até 3
// meses anteriores, categoria a categoria. Avisa no máximo 1x por categoria/mês.
async function checkN25AcimaDaMedia(uid, transactions, config, tipos) {
  if (tipos.n25 === false) return null;

  const LIMIAR = 1.3;     // 30% acima da média
  const MIN_MEDIA = 50;   // ignora categorias de valor irrelevante
  const hoje = getNowBrasilia();
  const keyOf = (offset) => {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - offset, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };
  const mesAtual = keyOf(0);
  // historical:true em todos os meses para comparar igual com igual (gastos diários contam)
  const coletar = (key) => collectMonthExpenses(transactions, key, { historical: true });
  const somaPorCat = (list) => list.reduce((acc, e) => { acc[e.cat] = (acc[e.cat] || 0) + e.valor; return acc; }, {});

  const hist = [1, 2, 3].map(o => coletar(keyOf(o))).filter(list => list.length > 0);
  if (hist.length < 2) return null;

  const atual = somaPorCat(coletar(mesAtual));
  const histSomas = hist.map(somaPorCat);
  const jaAvisadas = config?.alertasAcimaMedia?.[mesAtual] || [];

  const novas = [];
  for (const cat of Object.keys(atual)) {
    if (cat === 'liberdade' || cat === 'sem_categoria') continue; // investir mais não é alerta
    if (jaAvisadas.includes(cat)) continue;
    const media = histSomas.reduce((s, m) => s + (m[cat] || 0), 0) / hist.length;
    if (media < MIN_MEDIA) continue;
    if (atual[cat] >= media * LIMIAR) {
      novas.push({ cat, gasto: atual[cat], media, pct: Math.round((atual[cat] / media - 1) * 100) });
    }
  }
  if (novas.length === 0) return null;

  // O estado só é gravado quando quem chama confirma que o aviso FOI enviado; se o envio falhar, as categorias
  // continuam "não avisadas" e o aviso é tentado de novo no próximo ciclo.
  // mergeFields substitui o campo inteiro, descartando meses antigos.
  const confirmar = () => db.collection('config').doc(uid).set(
    { alertasAcimaMedia: { [mesAtual]: [...jaAvisadas, ...novas.map(n => n.cat)] } },
    { mergeFields: ['alertasAcimaMedia'] }
  ).catch(() => {});

  novas.sort((a, b) => b.pct - a.pct);
  let msg = `📈 *Gastos acima do seu padrão*\n\n`;
  for (const n of novas) {
    const c = GASTOS_CATS[n.cat];
    msg += `${c.icon} *${c.label}*: ${formatBRL(n.gasto)} lançados no mês — *${n.pct}% acima* da média dos últimos ${hist.length} meses (${formatBRL(n.media)})\n`;
  }
  msg += `\n_Veja os lançamentos: /gastos ${normTxt(GASTOS_CATS[novas[0].cat].label)}_`;
  return { text: msg, confirmar };
}

module.exports = { checkN25AcimaDaMedia };
