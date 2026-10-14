import { describe, it, expect } from 'vitest';
import { sobraPorData, resumirSobra, SOBRA_MINIMA } from '../projectionCalc';

const serie = (saldos) => saldos.map((saldo, i) => ({ date: `2026-10-${String(i + 1).padStart(2, '0')}`, saldo }));

describe('sobraPorData', () => {
  it('é o mínimo do saldo daquele dia em diante', () => {
    const r = sobraPorData(serie([100, 50, 900, 800]));
    expect(r.map(x => x.sobra)).toEqual([50, 50, 800, 800]);
  });
  it('saldo negativo vira sobra 0', () => {
    expect(sobraPorData(serie([100, -30, 500])).map(x => x.sobra)).toEqual([0, 0, 500]);
  });
});

describe('resumirSobra', () => {
  it('abaixo do mínimo não é investível e aponta a próxima janela', () => {
    const r = resumirSobra(serie([3, 3, 3, 1000, 1000]));
    expect(r.hoje).toBe(3);
    expect(r.investivel).toBe(0);
    expect(r.proxima.data).toBe('2026-10-04');
    expect(r.proxima.valor).toBe(1000);
  });
  it('a partir do mínimo é investível', () => {
    const r = resumirSobra(serie([SOBRA_MINIMA, SOBRA_MINIMA]));
    expect(r.investivel).toBe(SOBRA_MINIMA);
    expect(r.proxima).toBeNull();
  });
  it('sem série não quebra', () => {
    const r = resumirSobra([]);
    expect(r.investivel).toBe(0);
    expect(r.proxima).toBeNull();
  });
});
