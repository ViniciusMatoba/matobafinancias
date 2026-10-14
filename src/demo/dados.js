// Dados de demonstração (SÓ para desenvolvimento: npm run dev:demo). Tudo é relativo à data de hoje, para
// as telas sempre terem meses recentes. Nada daqui vai para o build de produção.
import { todayStr, addMonths } from '../utils/formatters';

const mesDe = (hoje, deslocamento) => addMonths(`${hoje.slice(0, 7)}-01`, deslocamento).slice(0, 7);
const dia = (mes, d) => `${mes}-${String(d).padStart(2, '0')}`;

export function criarDadosDemo(hoje = todayStr()) {
  const config = {
    metaMensalDiario: 0,
    rendaMensal: 10000,
    budgetPcts: { liberdade: 10, custos_fixos: 30, conforto: 15, metas: 10, prazeres: 15, conhecimento: 10 },
    onboardingDone: true,
    tourDone: true,
    toursVistas: ['transactions', 'projection', 'reports', 'goals', 'settings'],
    tags: [
      { id: 'assinaturas', label: 'Assinaturas', cor: '#8b5cf6', limite: 60 },
      { id: 'mercado', label: 'Mercado', cor: '#10b981', limite: 380 },
      { id: 'transporte', label: 'Transporte', cor: '#3b82f6', limite: 100 },
    ],
    investimentos: { perfil: 'clt', mesesMeta: 6, despesasMens: 3000, reservaGoalId: 'g1' },
  };

  const cards = [{ id: 'c1', nome: 'Nubank', diaVencimento: 10, diaFechamento: 3, limite: 8000 }];
  const wallets = [{ id: 'w1', nome: 'Conta corrente', saldoInicial: 3000 }];
  const goals = [{ id: 'g1', nome: 'Reserva de Emergência', metaFinal: 18000, cor: '#10b981' }];

  const transactions = [
    { id: 'sal', tipo: 'entrada', frequencia: 'mensal', dataInicio: dia(mesDe(hoje, -6), 5), valor: 9000, descricao: 'Salário' },
    { id: 'alu', tipo: 'saida', frequencia: 'mensal', dataInicio: dia(mesDe(hoje, -6), 8), valor: 1800, descricao: 'Aluguel', categoria: 'custos_fixos' },
    { id: 'net', tipo: 'saida', frequencia: 'mensal', dataInicio: dia(mesDe(hoje, -6), 12), valor: 129.9, descricao: 'Internet', categoria: 'custos_fixos' },
    { id: 'saude', tipo: 'saida', frequencia: 'mensal', dataInicio: dia(mesDe(hoje, -6), 15), valor: 450, descricao: 'Plano de saúde', categoria: 'custos_fixos' },
    { id: 'apo1', tipo: 'investimento', frequencia: 'unico', dataInicio: dia(mesDe(hoje, -2), 6), valor: 1500, descricao: 'Aporte: Reserva', categoria: 'liberdade', metaId: 'g1' },
    { id: 'apo2', tipo: 'investimento', frequencia: 'unico', dataInicio: dia(mesDe(hoje, -1), 6), valor: 1500, descricao: 'Aporte: Reserva', categoria: 'liberdade', metaId: 'g1' },
  ];

  // Uma fatura por mês de compra (vence no mês seguinte). k = 0 é o mês atual.
  for (let k = 5; k >= 0; k--) {
    const mes = mesDe(hoje, -k);
    const vence = dia(mesDe(hoje, -k + 1), 10);
    const itens = [
      { descricao: 'Netflix', valor: 44.9, categoria: 'prazeres', tag: 'assinaturas', dataCompra: dia(mes, 3) },
      { descricao: 'Spotify', valor: k >= 2 ? 21.9 : 27.9, categoria: 'prazeres', tag: 'assinaturas', dataCompra: dia(mes, 4) },
      { descricao: 'Academia', valor: 119.9, categoria: 'prazeres', dataCompra: dia(mes, 2) },
      { descricao: 'Google One', valor: 9.99, categoria: 'conhecimento', dataCompra: dia(mes, 1) },
      { descricao: 'iFood', valor: 38 + (k * 7) % 23, categoria: 'prazeres', dataCompra: dia(mes, 2) },
      { descricao: 'iFood', valor: 52 + (k * 11) % 19, categoria: 'prazeres', dataCompra: dia(mes, 3) },
      { descricao: 'Uber *TRIP', valor: 18 + (k * 5) % 14, categoria: 'conforto', dataCompra: dia(mes, 1) },
      { descricao: 'Uber *TRIP', valor: 24 + (k * 3) % 11, categoria: 'conforto', dataCompra: dia(mes, 3) },
      { descricao: 'Mercado Central', valor: 310 + (k * 37) % 120, categoria: 'custos_fixos', tag: 'mercado', dataCompra: dia(mes, 2) },
    ];
    if (k <= 1) itens.push({ descricao: 'Disney+', valor: 33.9, categoria: 'prazeres', dataCompra: dia(mes, 3) });
    if (k <= 3) {
      itens.push({ descricao: 'TV', valor: 200, categoria: 'conforto', dataCompra: dia(mesDe(hoje, -4), 2), isParcelado: true, parcelaAtual: 4 - k, totalParcelas: 6 });
    }
    transactions.push({
      id: `fat${k}`, tipo: 'cartao', frequencia: 'unico', cartaoId: 'c1', descricao: 'Fatura Nubank', dataInicio: vence,
      valor: itens.reduce((s, i) => s + i.valor, 0), itens, conferido: k >= 1 && vence < hoje,
    });
  }

  return { config, cards, wallets, goals, transactions };
}
