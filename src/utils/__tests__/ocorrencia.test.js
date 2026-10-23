import { describe, it, expect } from 'vitest'
import { ocorrenciaAnterior, validarNovaData, datasDoEscopo } from '../ocorrencia'
import { expandOccurrences } from '../projectionCalc'

/** Mover uma ocorrência de um lançamento recorrente. */
const serie = { id: 's', tipo: 'saida', frequencia: 'mensal', valor: 100, descricao: 'Aluguel', dataInicio: '2026-01-10' }
const datas = (tx, de, ate) => expandOccurrences(tx, de, ate).map(o => o.date)

describe('ocorrenciaAnterior', () => {
  it('devolve a ocorrência imediatamente antes da data', () => {
    expect(ocorrenciaAnterior(serie, '2026-11-10')).toBe('2026-10-10')
  })
  it('primeira ocorrência não tem anterior', () => {
    expect(ocorrenciaAnterior(serie, '2026-01-10')).toBeNull()
  })
  it('ignora exclusões e dataFim da série (olha o padrão da série)', () => {
    expect(ocorrenciaAnterior({ ...serie, exclusoes: ['2026-10-10'], dataFim: '2026-12-31' }, '2026-11-10')).toBe('2026-10-10')
  })
})

describe('validarNovaData', () => {
  it('apenas nesta: qualquer data vale, até em outro mês', () => {
    expect(validarNovaData({ scope: 'single', tx: serie, occDate: '2026-11-10', novaData: '2026-12-03' })).toBeNull()
    expect(validarNovaData({ scope: 'single', tx: serie, occDate: '2026-11-10', novaData: '2026-10-01' })).toBeNull()
  })
  it('nesta e nas futuras: precisa ser depois da ocorrência anterior', () => {
    expect(validarNovaData({ scope: 'future', tx: serie, occDate: '2026-11-10', novaData: '2026-11-05' })).toBeNull()
    expect(validarNovaData({ scope: 'future', tx: serie, occDate: '2026-11-10', novaData: '2026-10-10' })).toMatch(/depois da ocorrência anterior \(10\/10\/2026\)/)
    expect(validarNovaData({ scope: 'future', tx: serie, occDate: '2026-11-10', novaData: '2026-10-02' })).toMatch(/10\/10\/2026/)
  })
  it('sem mudança ou em todas: sem erro', () => {
    expect(validarNovaData({ scope: 'future', tx: serie, occDate: '2026-11-10', novaData: '' })).toBeNull()
    expect(validarNovaData({ scope: 'future', tx: serie, occDate: '2026-11-10', novaData: '2026-11-10' })).toBeNull()
    expect(validarNovaData({ scope: 'all', tx: serie, occDate: '2026-11-10', novaData: '2026-01-01' })).toBeNull()
  })
})

describe('datasDoEscopo', () => {
  it('single: lançamento único na data nova; sem mexer no fim da série', () => {
    expect(datasDoEscopo({ scope: 'single', occDate: '2026-11-10', novaData: '2026-11-05' })).toEqual({ dataOcorrencia: '2026-11-05', dataFimSerieAntiga: null })
  })
  it('future: série antiga termina no dia anterior à ocorrência; nova começa na data nova', () => {
    expect(datasDoEscopo({ scope: 'future', occDate: '2026-11-10', novaData: '2026-11-05' })).toEqual({ dataOcorrencia: '2026-11-05', dataFimSerieAntiga: '2026-11-09' })
  })
  it('sem data nova mantém a data da ocorrência (comportamento antigo)', () => {
    expect(datasDoEscopo({ scope: 'future', occDate: '2026-11-10', novaData: '' }).dataOcorrencia).toBe('2026-11-10')
  })
})

describe('efeito na série (dia 30 e fevereiro)', () => {
  it('nesta e nas futuras com dia 30: fevereiro cai no último dia e março volta ao 30', () => {
    const antiga = { ...serie, dataFim: '2026-10-31' }                  // termina antes da ocorrência movida (10/11)
    const nova = { ...serie, id: 'n', dataInicio: '2026-11-30', dataFim: null }
    expect(datas(nova, '2026-11-01', '2027-04-30')).toEqual(['2026-11-30', '2026-12-30', '2027-01-30', '2027-02-28', '2027-03-30', '2027-04-30'])
    expect(datas(antiga, '2026-09-01', '2027-04-30')).toEqual(['2026-09-10', '2026-10-10'])
  })
  it('fevereiro de ano bissexto cai no 29', () => {
    const nova = { ...serie, dataInicio: '2027-11-30' }
    expect(datas(nova, '2028-02-01', '2028-03-31')).toEqual(['2028-02-29', '2028-03-30'])
  })
  it('apenas nesta: a série perde só aquela data e o lançamento único aparece na data nova', () => {
    const comExclusao = { ...serie, exclusoes: ['2026-11-10'] }
    const unico = { id: 'u', tipo: 'saida', frequencia: 'unico', valor: 100, dataInicio: '2026-11-05' }
    expect(datas(comExclusao, '2026-10-01', '2026-12-31')).toEqual(['2026-10-10', '2026-12-10'])
    expect(datas(unico, '2026-10-01', '2026-12-31')).toEqual(['2026-11-05'])
  })
})
