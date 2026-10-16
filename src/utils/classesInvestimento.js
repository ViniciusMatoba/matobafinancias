import { ehResgate } from './investido';
import { expandOccurrences } from './projectionCalc';

/**
 * Classes dos aportes (campo `classeInvestimento` do lançamento tipo 'investimento'). Fonte única para o formulário,
 * o gráfico de alocação e o reclassificador. `liquidez` descreve como o dinheiro volta para a conta.
 */
export const CLASSES_INVESTIMENTO = [
  { id: 'caixinha',      label: 'Caixinha / resgate imediato', cor: '#14b8a6', liquidez: 'imediata' },
  { id: 'renda_fixa',    label: 'Renda Fixa',                  cor: '#3b82f6', liquidez: 'prazo' },
  { id: 'acoes',         label: 'Ações',                       cor: '#10b981', liquidez: 'mercado' },
  { id: 'fiis',          label: 'FIIs',                        cor: '#f59e0b', liquidez: 'mercado' },
  { id: 'cripto',        label: 'Cripto',                      cor: '#f97316', liquidez: 'mercado' },
  { id: 'internacional', label: 'Internacional',               cor: '#8b5cf6', liquidez: 'mercado' },
  { id: 'outro',         label: 'Outro',                       cor: '#6b7280', liquidez: 'prazo' },
];

export const CLASSE_POR_ID = Object.fromEntries(CLASSES_INVESTIMENTO.map(c => [c.id, c]));

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

/**
 * Aportes agrupados por descrição (sem acento/caixa), para reclassificar vários de uma vez.
 * Cada grupo: { chave, descricao, ids, quantidade, total (até hoje), classes (ids distintos, '' = sem classe) }.
 * `soSemClasse` mostra apenas grupos com algum aporte sem classe. Ordenado pelo total, maior primeiro.
 */
export function agruparAportes(transactions, hoje, { soSemClasse = false } = {}) {
  const mapa = new Map();
  for (const t of transactions || []) {
    if (t.tipo !== 'investimento') continue;
    const chave = norm(t.descricao) || '(sem descrição)';
    const g = mapa.get(chave) || { chave, descricao: t.descricao || '(sem descrição)', ids: [], quantidade: 0, total: 0, classes: new Set() };
    g.ids.push(t.id);
    g.quantidade += 1;
    g.total += expandOccurrences(t, '2020-01-01', hoje).reduce((s, o) => s + (Number(o.valor) || 0), 0);
    g.classes.add(t.classeInvestimento || '');
    mapa.set(chave, g);
  }
  return [...mapa.values()]
    .map(g => ({ ...g, classes: [...g.classes] }))
    .filter(g => !soSemClasse || g.classes.includes(''))
    .sort((a, b) => b.total - a.total);
}

/** Atualizações em lote para o `updateMany`: grava a classe em todos os aportes do grupo ('' remove a classe). */
export function atualizacoesDeClasse(grupo, classe) {
  return grupo.ids.map(id => ({ id, data: { classeInvestimento: classe || null } }));
}

// ── Resgate por classe ──────────────────────────────────────────────────────────

/**
 * Ordem em que o resgate sai: primeiro a reserva (caixinha escolhida, resgate imediato), depois a classe de
 * resgate imediato, depois renda fixa/outro (pode ter prazo ou carência) e por último o que está no mercado.
 */
export const ORDEM_RESGATE = ['reserva', 'caixinha', 'renda_fixa', 'outro', 'acoes', 'fiis', 'internacional', 'cripto'];

/** Onde um aporte/resgate "mora": a reserva (por metaId) ou a sua classe (sem classe = 'outro'). */
export const origemDe = (tx, reservaGoalId) =>
  reservaGoalId && tx.metaId === reservaGoalId ? 'reserva' : (tx.classeInvestimento || 'outro');

export const liquidezDeOrigem = (id) => (id === 'reserva' ? 'imediata' : (CLASSE_POR_ID[id]?.liquidez || 'prazo'));

export const rotuloOrigem = (id) => (id === 'reserva' ? 'Reserva' : (CLASSE_POR_ID[id]?.label || id));

/** Investido por origem até a data: aportes − resgates, agrupados por reserva/classe. */
export function investidoPorOrigem(transactions, ate, reservaGoalId = null) {
  const b = {};
  for (const t of transactions || []) {
    const sinal = t.tipo === 'investimento' ? 1 : ehResgate(t) ? -1 : 0;
    if (!sinal) continue;
    const id = origemDe(t, reservaGoalId);
    for (const o of expandOccurrences(t, '2020-01-01', ate)) b[id] = (b[id] || 0) + sinal * (Number(o.valor) || 0);
  }
  return b;
}

/**
 * Tira `valor` das origens na ordem de resgate (altera `buckets`). Devolve [{ id, valor, liquidez }].
 * O que não couber nas origens conhecidas (saldo inconsistente) vai para 'outro'.
 */
export function sacarDasOrigens(buckets, valor) {
  const saidas = [];
  let falta = Math.round((Number(valor) || 0) * 100) / 100;
  for (const id of ORDEM_RESGATE) {
    if (falta <= 0) break;
    const disp = Math.max(buckets[id] || 0, 0);
    if (disp <= 0) continue;
    const tira = Math.round(Math.min(disp, falta) * 100) / 100;
    buckets[id] = (buckets[id] || 0) - tira;
    falta = Math.round((falta - tira) * 100) / 100;
    saidas.push({ id, valor: tira, liquidez: liquidezDeOrigem(id) });
  }
  if (falta > 0) {
    buckets.outro = (buckets.outro || 0) - falta;
    const ex = saidas.find(s => s.id === 'outro');
    if (ex) ex.valor = Math.round((ex.valor + falta) * 100) / 100;
    else saidas.push({ id: 'outro', valor: falta, liquidez: liquidezDeOrigem('outro') });
  }
  return saidas;
}
