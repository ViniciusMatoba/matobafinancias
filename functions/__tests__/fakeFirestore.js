// Firestore em memória, só com o que o bot usa: collection/doc/get/set/update/delete/add/where('==')/limit.
// Caminhos são strings 'colecao/doc/sub/doc'. Os dados ficam em um Map.
const DELETE = Symbol('FieldValue.delete')

export const FieldValue = {
  delete: () => DELETE,
  serverTimestamp: () => new Date(),
  increment: (n) => ({ __inc: n }),
  arrayUnion: (...v) => ({ __union: v }),
  arrayRemove: (...v) => ({ __remove: v }),
}

function aplicar(base, patch) {
  const out = { ...base }
  for (const [k, v] of Object.entries(patch)) {
    if (v === DELETE) delete out[k]
    else if (v && v.__inc !== undefined) out[k] = (Number(out[k]) || 0) + v.__inc
    else if (v && v.__union) out[k] = [...new Set([...(out[k] || []), ...v.__union])]
    else if (v && v.__remove) out[k] = (out[k] || []).filter(x => !v.__remove.includes(x))
    else out[k] = v
  }
  return out
}

export function criarFakeFirestore() {
  const dados = new Map()
  let seq = 0

  const snapDoc = (path) => {
    const existe = dados.has(path)
    const id = path.split('/').pop()
    return {
      id, exists: existe, ref: docRef(path),
      data: () => (existe ? structuredCloneComDatas(dados.get(path)) : undefined),
    }
  }

  const docRef = (path) => ({
    id: path.split('/').pop(),
    path,
    collection: (sub) => colRef(`${path}/${sub}`),
    get: async () => snapDoc(path),
    set: async (data, opts = {}) => {
      if (opts.mergeFields) {
        const base = dados.get(path) || {}
        const novo = { ...base }
        for (const f of opts.mergeFields) novo[f] = data[f]
        dados.set(path, novo)
      } else if (opts.merge) {
        dados.set(path, aplicar(dados.get(path) || {}, data))
      } else {
        dados.set(path, aplicar({}, data))
      }
    },
    update: async (patch) => {
      if (!dados.has(path)) throw new Error(`NOT_FOUND: ${path}`)
      dados.set(path, aplicar(dados.get(path), patch))
    },
    delete: async () => { dados.delete(path) },
  })

  const listar = (path, filtros, max) => {
    const prefixo = `${path}/`
    let docs = [...dados.keys()]
      .filter(k => k.startsWith(prefixo) && !k.slice(prefixo.length).includes('/'))
      .map(snapDoc)
    for (const [campo, valor] of filtros) docs = docs.filter(d => d.data()?.[campo] === valor)
    if (max) docs = docs.slice(0, max)
    return { empty: docs.length === 0, size: docs.length, docs }
  }

  const query = (path, filtros = [], max = 0) => ({
    where: (campo, op, valor) => {
      if (op !== '==') throw new Error(`operador não suportado no fake: ${op}`)
      return query(path, [...filtros, [campo, valor]], max)
    },
    limit: (n) => query(path, filtros, n),
    get: async () => listar(path, filtros, max),
  })

  const colRef = (path) => ({
    ...query(path),
    doc: (id) => docRef(`${path}/${id || `auto${++seq}`}`),
    add: async (data) => {
      const ref = docRef(`${path}/auto${++seq}`)
      await ref.set(data)
      return ref
    },
  })

  const db = { collection: (nome) => colRef(nome) }
  return {
    db,
    /** Grava direto um documento (preparação do cenário). */
    seed: (path, data) => { dados.set(path, structuredCloneComDatas(data)) },
    /** Lê direto um documento (verificação). */
    ler: (path) => (dados.has(path) ? structuredCloneComDatas(dados.get(path)) : undefined),
    existe: (path) => dados.has(path),
    /** Documentos de uma coleção: [{ id, ...dados }]. */
    lista: (path) => listar(path, [], 0).docs.map(d => ({ id: d.id, ...d.data() })),
    limpar: () => { dados.clear(); seq = 0 },
  }
}

// structuredClone falha com funções (ex.: expiresAt.toDate); copia só o que é dado puro.
function structuredCloneComDatas(obj) {
  if (obj === null || typeof obj !== 'object') return obj
  if (obj instanceof Date) return new Date(obj)
  if (Array.isArray(obj)) return obj.map(structuredCloneComDatas)
  const out = {}
  for (const [k, v] of Object.entries(obj)) out[k] = typeof v === 'function' ? v : structuredCloneComDatas(v)
  return out
}
