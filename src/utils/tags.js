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
