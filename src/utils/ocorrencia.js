import { addDays } from './formatters';
import { expandOccurrences } from './projectionCalc';

/**
 * Mover UMA ocorrência de um lançamento recorrente para outra data ("Data desta ocorrência" no editar lançamento).
 *
 * - 'single': a ocorrência sai da série (exclusoes) e nasce um lançamento único na data nova (pode ser em outro mês).
 * - 'future': a série antiga termina no dia anterior à ocorrência e a nova começa na data nova; os meses seguintes
 *   seguem o novo dia (o motor de recorrência já leva dia 29–31 para o último dia dos meses curtos e volta depois).
 * - 'all': ignora a data da ocorrência (vale o "Início da série" do formulário).
 */

/** Data da ocorrência da série imediatamente anterior a `occDate` (ou null se for a primeira). */
export function ocorrenciaAnterior(tx, occDate) {
  const antes = addDays(occDate, -1);
  if (!tx?.dataInicio || tx.dataInicio > antes) return null;
  const ocs = expandOccurrences({ ...tx, dataFim: null, exclusoes: [] }, tx.dataInicio, antes);
  return ocs.length ? ocs[ocs.length - 1].date : null;
}

/**
 * Valida a data nova para o escopo. Retorna uma mensagem de erro ou null.
 * Em 'future' a série nova não pode começar antes (ou no dia) da ocorrência anterior da série antiga.
 */
export function validarNovaData({ scope, tx, occDate, novaData }) {
  if (!novaData || novaData === occDate || scope === 'all') return null;
  if (scope === 'future') {
    const anterior = ocorrenciaAnterior(tx, occDate);
    if (anterior && novaData <= anterior) {
      return `A nova data precisa ser depois da ocorrência anterior (${anterior.split('-').reverse().join('/')}).`;
    }
  }
  return null;
}

/**
 * Datas que o escopo vai gravar. `novaData` vazia/igual a `occDate` mantém o comportamento antigo (sem mover).
 * Retorna { dataOcorrencia, dataFimSerieAntiga } — `dataOcorrencia` é o dataInicio do lançamento novo
 * ('single': único; 'future': nova série); `dataFimSerieAntiga` só existe em 'future'.
 */
export function datasDoEscopo({ scope, occDate, novaData }) {
  const dataOcorrencia = novaData || occDate;
  if (scope === 'future') return { dataOcorrencia, dataFimSerieAntiga: addDays(occDate, -1) };
  return { dataOcorrencia, dataFimSerieAntiga: null };
}
