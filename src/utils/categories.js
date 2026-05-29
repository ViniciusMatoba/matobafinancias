export const PERCENTUAL_CATEGORIES = {
  liberdade: {
    label: 'Liberdade Financeira',
    sublabel: 'Investimentos',
    color: '#10b981',
    bg: 'rgba(16,185,129,0.12)',
    icon: '📈',
    desc: 'Invista pelo menos 25% da sua renda assim que receber. É o primeiro passo para a independência financeira.',
    exemplos: 'Renda fixa, ações, fundos, CDB, Tesouro Direto',
    defaultPct: 25,
    tiposAutomatic: ['investimento'],
  },
  custos_fixos: {
    label: 'Custos Fixos',
    sublabel: 'Necessidades',
    color: '#ef4444',
    bg: 'rgba(239,68,68,0.12)',
    icon: '🏠',
    desc: 'Teto ideal de 35% (até 40% para famílias maiores). Se passar, é sinal de que você vive acima do padrão.',
    exemplos: 'Aluguel, financiamento, energia, água, transporte, alimentação básica, plano de saúde',
    defaultPct: 30,
    tiposAutomatic: [],
  },
  conforto: {
    label: 'Conforto',
    sublabel: 'Qualidade de vida',
    color: '#f59e0b',
    bg: 'rgba(245,158,11,0.12)',
    icon: '⭐',
    desc: 'Gastos que melhoram sua qualidade de vida sem ser essenciais.',
    exemplos: 'Diaristas, Netflix, Spotify, academia, móveis novos, restaurantes frequentes',
    defaultPct: 15,
    tiposAutomatic: [],
  },
  metas: {
    label: 'Metas',
    sublabel: 'Objetivos',
    color: '#3b82f6',
    bg: 'rgba(59,130,246,0.12)',
    icon: '🎯',
    desc: 'Dinheiro guardado para objetivos de curto e médio prazo.',
    exemplos: 'Trocar de carro, viagem, reforma, reserva de emergência, entrada de imóvel',
    defaultPct: 15,
    tiposAutomatic: [],
  },
  prazeres: {
    label: 'Prazeres',
    sublabel: 'Sem culpa',
    color: '#ec4899',
    bg: 'rgba(236,72,153,0.12)',
    icon: '🎉',
    desc: 'Gastos livres para curtir o momento sem culpa. Você merece.',
    exemplos: 'Jantares especiais, shows, passeios, presentes, hobby, viagens de lazer',
    defaultPct: 10,
    tiposAutomatic: [],
  },
  conhecimento: {
    label: 'Conhecimento',
    sublabel: 'Desenvolvimento',
    color: '#8b5cf6',
    bg: 'rgba(139,92,246,0.12)',
    icon: '📚',
    desc: 'Invista em você mesmo. É o ativo que ninguém pode te tirar.',
    exemplos: 'Livros, cursos, MBA, idiomas, mentorias, certificações',
    defaultPct: 5,
    tiposAutomatic: [],
  },
};

export const CATEGORY_ORDER = [
  'liberdade','custos_fixos','conforto','metas','prazeres','conhecimento',
];

// Tipos de transação que PRECISAM de categoria selecionável
export const TIPOS_COM_CATEGORIA = ['saida', 'diario', 'cartao'];

// Categoria automática por tipo
export function getAutoCategory(tipo) {
  if (tipo === 'investimento') return 'liberdade';
  return null;
}

// Opções de categoria para o formulário (excluindo liberdade, que é automática)
export const CATEGORY_OPTIONS = CATEGORY_ORDER
  .filter(id => id !== 'liberdade')
  .map(id => ({ id, ...PERCENTUAL_CATEGORIES[id] }));

export const DEFAULT_BUDGET_PCTS = Object.fromEntries(
  CATEGORY_ORDER.map(id => [id, PERCENTUAL_CATEGORIES[id].defaultPct])
);
