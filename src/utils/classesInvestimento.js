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
