'use strict';

const { expandDespesasBot } = require('./competencia');
const { addDaysFn, addMonthsStr, todayStrBrasilia } = require('../util/datas');

/**
 * Assinaturas e recorrentes — cópia fiel de src/utils/assinaturas.js do app (a paridade é testada).
 * Regras: ver o arquivo do app. Resumo:
 *  - assinaturas:       itens de cartão que repetem em meses seguidos, UMA vez por mês, valor estável (no máximo
 *                       um reajuste na janela) + tudo que tem a tag "Assinaturas".
 *  - variaveis:         repetem todo mês mas o valor oscila / várias vezes no mês (só informativo).
 *  - recorrentesComuns: saída mensal ou semanal ativa fora do cartão (Pix, débito).
 */

const ASSINATURAS_CFG = {
  janelaMeses: 6,
  tolerancia: 0.05,
  deslizeDias: 3,
  maxInativoMeses: 2,
};

const TAG_ASSINATURAS = 'assinaturas';

const arred = (n) => Math.round(n * 100) / 100;

function normalizarTexto(s) {
  return String(s || '')
    .toLowerCase().trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ');
}

function chaveDescricao(desc) {
  let s = normalizarTexto(desc);
  s = s.replace(/\(?\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b\)?/g, ' ');
  s = s.replace(/[*#_\-–—.,;:()[\]]+/g, ' ');
  return s.split(' ').filter(t => t && !/^\d+$/.test(t)).join(' ').trim();
}

const mesLogico = (date, deslize) => addDaysFn(date, -deslize).slice(0, 7);

function mesesEntre(a, b) {
  const [ya, ma] = a.split('-').map(Number);
  const [yb, mb] = b.split('-').map(Number);
  return (yb - ya) * 12 + (mb - ma);
}

function temDoisSeguidos(meses) {
  for (let i = 1; i < meses.length; i++) if (mesesEntre(meses[i - 1], meses[i]) === 1) return true;
  return false;
}

function mudancasDeValor(serie, tolerancia) {
  const out = [];
  for (let i = 1; i < serie.length; i++) {
    const de = serie[i - 1].valor;
    const para = serie[i].valor;
    if (de > 0 && Math.abs(para - de) / de > tolerancia) out.push({ mes: serie[i].mes, de, para });
  }
  return out;
}

function detectarAssinaturasBot({ transactions, tags, ignoradas, hoje = todayStrBrasilia(), cfg = ASSINATURAS_CFG }) {
  const ignorados = new Set(Array.isArray(ignoradas) ? ignoradas : []);
  const tagAssinaturas = (Array.isArray(tags) ? tags : []).find(t => normalizarTexto(t.label) === TAG_ASSINATURAS)?.id || null;

  const mesAtual = hoje.slice(0, 7);
  const from = addMonthsStr(`${mesAtual}-01`, -(cfg.janelaMeses - 1));
  const mesAtualLogico = mesLogico(hoje, cfg.deslizeDias);

  const eventos = expandDespesasBot(transactions || [], from, hoje)
    .filter(e => e.tipo === 'cartao' && !e.parcela && !e.projetada);

  const contexto = {
    mesAtual: mesAtualLogico,
    mesAnterior: addMonthsStr(`${mesAtualLogico}-01`, -1).slice(0, 7),
    historicoMeses: new Set(eventos.map(e => mesLogico(e.date, cfg.deslizeDias))).size,
  };

  const grupos = new Map();
  for (const e of eventos) {
    const chaveNome = chaveDescricao(e.descricao);
    if (!chaveNome) continue;
    const chave = `${e.tx?.cartaoId || ''}|${chaveNome}`;
    const g = grupos.get(chave) || { chave, eventos: [] };
    g.eventos.push(e);
    grupos.set(chave, g);
  }

  const assinaturas = [];
  const variaveis = [];
  let ignoradosCount = 0;

  for (const g of grupos.values()) {
    if (ignorados.has(g.chave)) { ignoradosCount++; continue; }

    const porMes = new Map();
    for (const e of g.eventos) {
      const m = mesLogico(e.date, cfg.deslizeDias);
      (porMes.get(m) || porMes.set(m, []).get(m)).push(e);
    }
    const meses = [...porMes.keys()].sort();
    const ultimoMes = meses.at(-1);
    if (mesesEntre(ultimoMes, mesAtualLogico) > cfg.maxInativoMeses) continue;

    const multiplos = meses.some(m => porMes.get(m).length > 1);
    const serie = meses.map(m => {
      const lista = porMes.get(m);
      return { mes: m, valor: arred(lista.reduce((s, e) => s + e.valor, 0) / (multiplos ? 1 : lista.length)) };
    });
    const marcada = !!tagAssinaturas && g.eventos.some(e => e.tag === tagAssinaturas);
    const seguidos = temDoisSeguidos(meses);
    const mudancas = mudancasDeValor(serie, cfg.tolerancia);
    const estavel = !multiplos && (meses.length <= 2 ? mudancas.length === 0 : mudancas.length <= 1);

    const ultimo = g.eventos.reduce((a, e) => (e.date > a.date ? e : a), g.eventos[0]);
    const base = {
      chave: g.chave,
      nome: ultimo.descricao,
      cartaoId: ultimo.tx?.cartaoId || null,
      tag: ultimo.tag || null,
      meses: meses.length,
      desde: g.eventos.reduce((a, e) => (e.date < a ? e.date : a), g.eventos[0].date),
    };

    if (marcada || (seguidos && estavel)) {
      assinaturas.push({
        ...base,
        valorAtual: serie.at(-1).valor,
        marcada,
        ultimoReajuste: mudancas.length ? mudancas.at(-1) : null,
      });
    } else if (seguidos) {
      variaveis.push({ ...base, media: arred(serie.reduce((s, x) => s + x.valor, 0) / serie.length) });
    }
  }

  assinaturas.sort((a, b) => b.valorAtual - a.valorAtual || a.nome.localeCompare(b.nome));
  variaveis.sort((a, b) => b.media - a.media || a.nome.localeCompare(b.nome));

  const recorrentesComuns = [];
  for (const tx of transactions || []) {
    if (tx.tipo !== 'saida' || (tx.frequencia !== 'mensal' && tx.frequencia !== 'semanal')) continue;
    if (!tx.dataInicio || tx.dataInicio > hoje || (tx.dataFim && tx.dataFim < hoje)) continue;
    if (normalizarTexto(tx.descricao).startsWith('ajuste de saldo')) continue;
    const chave = `rec:${tx.id}`;
    if (ignorados.has(chave)) { ignoradosCount++; continue; }
    const valor = Number(tx.valor) || 0;
    if (!valor) continue;
    recorrentesComuns.push({
      chave, id: tx.id, nome: tx.descricao || 'Sem descrição', valor, frequencia: tx.frequencia,
      valorMensal: arred(tx.frequencia === 'semanal' ? (valor * 52) / 12 : valor),
      dia: Number(tx.dataInicio.slice(8, 10)), tag: tx.tag || null, categoria: tx.categoria || null,
    });
  }
  recorrentesComuns.sort((a, b) => b.valorMensal - a.valorMensal || a.nome.localeCompare(b.nome));

  const mensalCartao = arred(assinaturas.reduce((s, a) => s + a.valorAtual, 0));
  const comunsMensal = arred(recorrentesComuns.reduce((s, r) => s + r.valorMensal, 0));
  const totais = {
    mensalCartao,
    anualCartao: arred(mensalCartao * 12),
    variaveisMensal: arred(variaveis.reduce((s, v) => s + v.media, 0)),
    comunsMensal,
    comunsAnual: arred(comunsMensal * 12),
    geralMensal: arred(mensalCartao + comunsMensal),
    geralAnual: arred((mensalCartao + comunsMensal) * 12),
  };

  return { assinaturas, variaveis, recorrentesComuns, totais, ignoradosCount, contexto };
}

module.exports = { ASSINATURAS_CFG, TAG_ASSINATURAS, chaveDescricao, detectarAssinaturasBot };
