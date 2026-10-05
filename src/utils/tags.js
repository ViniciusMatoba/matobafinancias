import { expandOccurrences } from './projectionCalc';

// Tipos que recebem tag no próprio lançamento; fatura de cartão usa a tag de cada item
export const TAGGABLE_TYPES = ['saida', 'diario'];

// Lançamentos gerados pelo app, sem sentido de classificar
const EXCLUDED_DESC_PREFIXES = ['ajuste de saldo'];

export const TAG_SUGGESTIONS = [
  'Mercado', 'Alimentação', 'Transporte', 'Streaming', 'Saúde', 'Moradia', 'Lazer', 'Educação',
];

export const TAG_COLORS = [
  '#10b981', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6',
  '#ef4444', '#14b8a6', '#f97316', '#6366f1', '#84cc16',
];

export const TAG_LABEL_MAX = 24;

export function normalizeText(s) {
  return String(s || '')
    .toLowerCase().trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ');
}

function slugify(label) {
  return normalizeText(label).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'tag';
}

/**
 * Acrescenta uma tag à lista, sem duplicar nomes (ignora acento/maiúscula).
 * Retorna { tags, tag }: `tags` é a mesma referência quando nada mudou.
 */
export function addTagToList(tags, label) {
  const current = Array.isArray(tags) ? tags : [];
  const clean = String(label || '').trim().replace(/\s+/g, ' ').slice(0, TAG_LABEL_MAX);
  if (!clean) return { tags: current, tag: null };

  const existing = current.find(t => normalizeText(t.label) === normalizeText(clean));
  if (existing) return { tags: current, tag: existing };

  const base = slugify(clean);
  let id = base;
  for (let n = 2; current.some(t => t.id === id); n++) id = `${base}-${n}`;

  const used = new Set(current.map(t => t.cor));
  const cor = TAG_COLORS.find(c => !used.has(c)) || TAG_COLORS[current.length % TAG_COLORS.length];
  const tag = { id, label: clean, cor };
  return { tags: [...current, tag], tag };
}

export function tagIdSet(tags) {
  return new Set((Array.isArray(tags) ? tags : []).map(t => t.id));
}

export function tagsById(tags) {
  return Object.fromEntries((Array.isArray(tags) ? tags : []).map(t => [t.id, t]));
}

/** Descrições iguais ou parecidas (uma contém a outra, ou 60%+ das palavras em comum). */
export function isSimilarDesc(a, b) {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  if (!na || !nb || na.length < 2 || nb.length < 2) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const wa = na.split(' ').filter(w => w.length > 2);
  const wb = nb.split(' ').filter(w => w.length > 2);
  if (!wa.length || !wb.length) return false;
  const setA = new Set(wa);
  const overlap = wb.filter(w => setA.has(w)).length;
  return overlap / Math.max(wa.length, wb.length) >= 0.6;
}

const isExcludedDesc = (norm) => EXCLUDED_DESC_PREFIXES.some(p => norm.startsWith(p));
const RECORRENTES = ['mensal', 'semanal', 'diario'];

/** Percorre tudo que pode receber tag: { kind: 'tx' | 'item', tx, item?, norm, desc } */
function* taggableEntries(transactions) {
  for (const tx of transactions || []) {
    if (TAGGABLE_TYPES.includes(tx.tipo)) {
      const norm = normalizeText(tx.descricao);
      if (!isExcludedDesc(norm)) yield { kind: 'tx', tx, norm, desc: tx.descricao || '' };
    } else if (tx.tipo === 'cartao' && Array.isArray(tx.itens)) {
      for (const item of tx.itens) {
        yield { kind: 'item', tx, item, norm: normalizeText(item.descricao), desc: item.descricao || '' };
      }
    }
  }
}

/** Quantos itens classificáveis existem e quantos ainda estão sem tag válida. */
export function countUntagged(transactions, tags) {
  const ids = tagIdSet(tags);
  let total = 0;
  let untagged = 0;
  for (const e of taggableEntries(transactions)) {
    total++;
    if (!ids.has(e.kind === 'tx' ? e.tx.tag : e.item.tag)) untagged++;
  }
  return { total, untagged };
}

/**
 * Agrupa por descrição normalizada o que está sem tag, do que mais pesou no bolso para o menos.
 * Retorna [{ key, label, count, total, recorrente }].
 */
export function buildUntaggedGroups(transactions, tags, today) {
  const ids = tagIdSet(tags);
  const map = new Map();

  for (const e of taggableEntries(transactions)) {
    if (ids.has(e.kind === 'tx' ? e.tx.tag : e.item.tag)) continue;

    let valor;
    let recorrente = false;
    if (e.kind === 'tx') {
      valor = expandOccurrences(e.tx, '2020-01-01', today, { historical: true })
        .reduce((s, o) => s + (Number(o.valor) || 0), 0);
      recorrente = RECORRENTES.includes(e.tx.frequencia);
    } else {
      valor = Number(e.item.valor) || 0;
    }

    let g = map.get(e.norm);
    if (!g) {
      g = { key: e.norm, labels: new Map(), count: 0, total: 0, recorrente: false };
      map.set(e.norm, g);
    }
    g.count += 1;
    g.total += valor;
    g.recorrente = g.recorrente || recorrente;
    const lbl = e.desc.trim();
    if (lbl) g.labels.set(lbl, (g.labels.get(lbl) || 0) + 1);
  }

  return [...map.values()]
    .map(g => {
      const best = [...g.labels.entries()].sort((a, b) => b[1] - a[1])[0];
      return { key: g.key, label: best ? best[0] : 'Sem descrição', count: g.count, total: g.total, recorrente: g.recorrente };
    })
    .sort((a, b) => (b.total - a.total) || (b.count - a.count));
}

/** descrição normalizada → { tag, label } do que já foi classificado (o mais recente vence). */
export function buildTaggedIndex(transactions, tags) {
  const ids = tagIdSet(tags);
  const index = new Map();
  for (const e of taggableEntries(transactions)) {
    const tag = e.kind === 'tx' ? e.tx.tag : e.item.tag;
    if (!e.norm || !ids.has(tag) || index.has(e.norm)) continue;
    index.set(e.norm, { tag, label: e.desc.trim() });
  }
  return index;
}

/** Sugere tag para um grupo: mesma descrição já classificada, senão uma parecida. */
export function suggestTag(group, taggedIndex) {
  if (!group || !taggedIndex) return null;
  const exact = taggedIndex.get(group.key);
  if (exact) return { ...exact, exata: true };
  if (group.key.length < 3) return null;
  for (const [norm, v] of taggedIndex) {
    if (isSimilarDesc(norm, group.key)) return { ...v, exata: false };
  }
  return null;
}

/**
 * Monta as gravações para aplicar `tagId` a todo item sem tag válida do grupo `key`.
 * `undo` traz o estado anterior para desfazer. Só toca em `tag` e em `itens`.
 */
export function buildTagUpdates(transactions, key, tagId, tags) {
  const ids = tagIdSet(tags);
  const updates = [];
  const undo = [];

  for (const tx of transactions || []) {
    if (TAGGABLE_TYPES.includes(tx.tipo)) {
      const norm = normalizeText(tx.descricao);
      if (norm === key && !isExcludedDesc(norm) && !ids.has(tx.tag)) {
        updates.push({ id: tx.id, data: { tag: tagId } });
        undo.push({ id: tx.id, data: { tag: tx.tag ?? null } });
      }
    } else if (tx.tipo === 'cartao' && Array.isArray(tx.itens)) {
      let changed = false;
      const itens = tx.itens.map(item => {
        if (normalizeText(item.descricao) === key && !ids.has(item.tag)) {
          changed = true;
          return { ...item, tag: tagId };
        }
        return item;
      });
      if (changed) {
        updates.push({ id: tx.id, data: { itens } });
        undo.push({ id: tx.id, data: { itens: tx.itens } });
      }
    }
  }
  return { updates, undo };
}

export const SEM_TAG = '__sem_tag';

/**
 * Despesas do período por tag, a partir de ocorrências [{ tx, valor }] (expandOccurrences + tx).
 * Investimento e entrada ficam de fora; cartão com itens conta cada item. Tag apagada vira "Sem tag".
 * Retorna { total, list, catTags }: `list` ordenada por valor (Sem tag por último) e `catTags`
 * = { categoria: { tagId: valor } } só com tags reais.
 */
export function computeTagStats(occs, tags) {
  const map = tagsById(tags);
  const byTag = {};
  const catTags = {};
  let total = 0;

  const add = (tagId, cat, valor) => {
    if (!valor) return;
    const key = map[tagId] ? tagId : SEM_TAG;
    const meta = key === SEM_TAG
      ? { label: 'Sem tag', cor: '#94a3b8' }
      : { label: map[key].label, cor: map[key].cor };
    const g = byTag[key] || (byTag[key] = { id: key, ...meta, value: 0, count: 0, cats: {} });
    g.value += valor;
    g.count += 1;
    g.cats[cat] = (g.cats[cat] || 0) + valor;
    total += valor;
    if (key !== SEM_TAG) {
      const ct = catTags[cat] || (catTags[cat] = {});
      ct[key] = (ct[key] || 0) + valor;
    }
  };

  for (const o of occs || []) {
    const tx = o.tx;
    if (!tx || tx.tipo === 'entrada' || tx.tipo === 'investimento') continue;
    if (tx.tipo === 'cartao' && tx.itens?.length > 0) {
      tx.itens.forEach(item => add(item.tag, item.categoria || 'outros', Number(item.valor) || 0));
    } else {
      add(tx.tag, tx.categoria || 'outros', Number(o.valor) || 0);
    }
  }

  const list = Object.values(byTag)
    .map(g => ({
      ...g,
      pct: total > 0 ? Math.round((g.value / total) * 100) : 0,
      catList: Object.entries(g.cats).map(([cat, value]) => ({ cat, value })).sort((a, b) => b.value - a.value),
    }))
    .sort((a, b) => (a.id === SEM_TAG) - (b.id === SEM_TAG) || b.value - a.value);

  return { total, list, catTags };
}

/** Quantos lançamentos e itens de fatura usam cada tag: { [tagId]: n } */
export function countTagUsage(transactions) {
  const counts = {};
  for (const tx of transactions || []) {
    if (tx.tag) counts[tx.tag] = (counts[tx.tag] || 0) + 1;
    if (Array.isArray(tx.itens)) {
      for (const item of tx.itens) {
        if (item.tag) counts[item.tag] = (counts[item.tag] || 0) + 1;
      }
    }
  }
  return counts;
}
