import { ehAjuste, ehResgate, totalInvestidoAte } from './investido';
import { saldoCaixinha } from './caixinha';
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
    if (t.tipo !== 'investimento' || ehAjuste(t)) continue;
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
  reservaGoalId && tx.metaId === reservaGoalId ? 'reserva' : (tx.classeInvestimento || (tx.metaId ? 'caixinha' : 'outro'));

export const liquidezDeOrigem = (id) => (id === 'reserva' ? 'imediata' : (CLASSE_POR_ID[id]?.liquidez || 'prazo'));

export const rotuloOrigem = (id) => (id === 'reserva' ? 'Reserva' : (CLASSE_POR_ID[id]?.label || id));

/** Investido por origem até a data: aportes − resgates, agrupados por reserva/classe. */
export function investidoPorOrigem(transactions, ate, reservaGoalId = null) {
  const b = {};
  for (const t of transactions || []) {
    const id = origemDe(t, reservaGoalId);
    if (ehAjuste(t)) { if (t.dataInicio && t.dataInicio <= ate) b[id] = (b[id] || 0) + (Number(t.valor) || 0); continue; }
    const sinal = t.tipo === 'investimento' ? 1 : ehResgate(t) ? -1 : 0;
    if (!sinal) continue;
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

// ── Lançamento de resgate (tipo "Resgate" do formulário) ─────────────────────────

/**
 * Opções de origem para o formulário: Reserva (só se houver caixinha de reserva escolhida) e as classes, na ordem de
 * resgate, cada uma com o quanto há investido ali até `ate`. `ignorarId` tira o próprio resgate que está sendo editado.
 */
export function opcoesDeOrigem({ transactions, ate, reservaGoalId = null, goals = [], ignorarId = null }) {
  const b = investidoPorOrigem((transactions || []).filter(t => t.id !== ignorarId), ate, reservaGoalId);
  const temReserva = !!reservaGoalId && (goals || []).some(g => g.id === reservaGoalId);
  return ORDEM_RESGATE
    .filter(id => id !== 'reserva' || temReserva)
    .map(id => ({ id, label: rotuloOrigem(id), disponivel: Math.max(Math.round((b[id] || 0) * 100) / 100, 0) }));
}

/** Primeira origem com saldo (na ordem de resgate); sem saldo em nenhuma, 'outro'. */
export const origemInicial = (opcoes) => (opcoes.find(o => o.disponivel > 0) || opcoes.find(o => o.id === 'outro') || opcoes[0])?.id || 'outro';

/**
 * Lançamento gravado por um resgate: ENTRADA com `resgate: true`. A reserva leva o `metaId` da caixinha; as demais, a
 * `classeInvestimento`. Os dois campos são sempre gravados (um deles null) para a edição trocar de origem sem sobras.
 */
export function docDeResgate({ valor, data, hoje, origem, reservaGoalId = null, descricao = '', conferido }) {
  const ehReserva = origem === 'reserva' && !!reservaGoalId;
  return {
    tipo: 'entrada', resgate: true, frequencia: 'unico', dataFim: null, categoria: null,
    descricao: (descricao || '').trim() || `Resgate de ${rotuloOrigem(ehReserva ? 'reserva' : origem)}`,
    valor: Math.round((Number(valor) || 0) * 100) / 100,
    dataInicio: data,
    conferido: typeof conferido === 'boolean' ? conferido : data <= hoje,
    metaId: ehReserva ? reservaGoalId : null,
    classeInvestimento: ehReserva ? null : (origem === 'reserva' ? 'outro' : origem),
  };
}

// ── Valores por caixinha/classe e atualização de valor (rendimento) ───────────────

/**
 * O que está investido, separado em CAIXINHAS (cada meta, com o mesmo saldo da tela Metas) e CLASSES (aportes que não
 * estão ligados a nenhuma caixinha). Ajustes de valor (rendimento) já estão dentro dos dois. `total` é o investido geral.
 */
export function valoresDoInvestido({ transactions, goals = [], hoje, reservaGoalId = null }) {
  const metas = new Set((goals || []).map(g => g.id));
  const caixinhas = (goals || []).map(g => ({
    id: g.id, nome: g.nome || 'Caixinha', reserva: g.id === reservaGoalId, valor: saldoCaixinha(transactions, g.id),
  }));
  const porClasse = {};
  for (const t of transactions || []) {
    if (t.metaId && metas.has(t.metaId)) continue; // já está no saldo da caixinha
    const id = t.classeInvestimento || 'outro';
    if (ehAjuste(t)) {
      if (t.dataInicio && t.dataInicio <= hoje) porClasse[id] = (porClasse[id] || 0) + (Number(t.valor) || 0);
      continue;
    }
    const sinal = t.tipo === 'investimento' ? 1 : ehResgate(t) ? -1 : 0;
    if (!sinal) continue;
    for (const o of expandOccurrences(t, '2020-01-01', hoje)) porClasse[id] = (porClasse[id] || 0) + sinal * (Number(o.valor) || 0);
  }
  const classes = ORDEM_RESGATE.filter(id => id !== 'reserva')
    .map(id => ({ id, label: rotuloOrigem(id), valor: Math.round((porClasse[id] || 0) * 100) / 100 }))
    .filter(c => Math.abs(c.valor) > 0.004);
  return { caixinhas, classes, total: totalInvestidoAte(transactions, hoje) };
}

/**
 * Lançamento de "Atualizar valor": você informa quanto vale HOJE e o app grava a diferença (rendimento, ou perda se
 * negativa) como ajuste do investido. `alvo` = { tipo: 'caixinha', id } ou { tipo: 'classe', id }. Sem diferença, null.
 */
export function docAjusteValor({ alvo, nome, atual, real, data }) {
  const delta = Math.round(((Number(real) || 0) - (Number(atual) || 0)) * 100) / 100;
  if (Math.abs(delta) < 0.005) return null;
  return {
    tipo: 'investimento', ajuste: true, frequencia: 'unico', dataFim: null, categoria: null, conferido: true,
    dataInicio: data, valor: delta,
    descricao: `Atualização de valor — ${nome}`,
    metaId: alvo.tipo === 'caixinha' ? alvo.id : null,
    classeInvestimento: alvo.tipo === 'classe' ? alvo.id : null,
  };
}
