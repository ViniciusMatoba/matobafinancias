import { useState, useEffect } from 'react';
import {
  collection, query, limit, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';

// Limite de segurança: cap em 10.000 documentos para evitar leituras excessivas no Firestore.
// NOTA: Filtrar por dataInicio >= janela quebraria transações recorrentes antigas sem dataFim
// (ex: salário mensal iniciado em 2022 seria excluído mas ainda gera ocorrências hoje).
// A paginação correta requer carregar recorrentes sem dataFim + unico/parcelado apenas recentes.
// Isso será implementado separadamente quando a base de usuários crescer o suficiente para
// justificar a complexidade (estimativa: >500 documentos/usuário).
const TRANSACTION_LIMIT = 10000;

/**
 * @typedef {'entrada'|'saida'|'diario'|'cartao'|'investimento'} TransactionTipo
 * @typedef {'unico'|'mensal'|'semanal'|'diario'|'parcelado'|'cartao'} TransactionFrequencia
 *
 * @typedef {Object} CartaoItem
 * @property {string} descricao
 * @property {number} valor
 * @property {boolean} [isParcelado]
 * @property {number} [parcelaAtual]
 * @property {number} [totalParcelas]
 *
 * @typedef {Object} Transaction
 * @property {string}               id
 * @property {TransactionTipo}      tipo
 * @property {TransactionFrequencia} frequencia
 * @property {number}               valor
 * @property {string}               dataInicio    — YYYY-MM-DD
 * @property {string}               [descricao]
 * @property {string}               [categoria]
 * @property {string}               [dataFim]     — YYYY-MM-DD; encerra recorrência
 * @property {string[]}             [exclusoes]   — datas YYYY-MM-DD excluídas da série
 * @property {string[]}             [conferidos]  — datas YYYY-MM-DD conferidas
 * @property {boolean}              [conferido]   — para lançamentos únicos
 * @property {string}               [cartaoId]    — ref ao card pai
 * @property {CartaoItem[]}         [itens]       — itens internos de fatura
 * @property {number}               [parcelaAtual]
 * @property {number}               [totalParcelas]
 */

export function useTransactions(uid) {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) {
      Promise.resolve().then(() => {
        setTransactions([]);
        setLoading(false);
      });
      return;
    }
    // Sem orderBy no servidor para evitar dependência de índice; ordenamos no cliente.
    // Limit de segurança para evitar leituras excessivas (ver TRANSACTION_LIMIT acima).
    return onSnapshot(
      query(collection(db, `transactions/${uid}/entries`), limit(TRANSACTION_LIMIT)),
      snap => {
        const txs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        txs.sort((a, b) => (b.dataInicio || '').localeCompare(a.dataInicio || ''));
        setTransactions(txs);
        setLoading(false);
      },
      err => { console.error('[useTransactions]', err.code, err.message); setLoading(false); }
    );
  }, [uid]);

  const add = async (data) => {
    const clean = removeUndef({ ...data, uid, criadoEm: serverTimestamp() });
    return addDoc(collection(db, `transactions/${uid}/entries`), clean);
  };

  const update = async (id, data) => {
    const clean = removeUndef(data);
    return updateDoc(doc(db, `transactions/${uid}/entries`, id), clean);
  };

  const remove = async (id) => deleteDoc(doc(db, `transactions/${uid}/entries`, id));

  return { transactions, loading, add, update, remove };
}

function removeUndef(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}
