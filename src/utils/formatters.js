export const formatBRL = (value) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);

export const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
};

export const formatDateShort = (dateStr) => {
  if (!dateStr) return '';
  const [, m, d] = dateStr.split('-');
  const months = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  return `${d} ${months[parseInt(m) - 1]}`;
};

export const formatMonthYear = (dateStr) => {
  if (!dateStr) return '';
  const [y, m] = dateStr.split('-');
  const months = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
    'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  return `${months[parseInt(m) - 1]} ${y}`;
};

export const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};

export const addMonths = (dateStr, n) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  const targetYear  = y + Math.floor((m - 1 + n) / 12);
  const targetMonth = ((m - 1 + n) % 12 + 12) % 12; // 0-indexed
  const lastDay     = new Date(targetYear, targetMonth + 1, 0).getDate();
  const clampedDay  = Math.min(d, lastDay);
  return `${targetYear}-${String(targetMonth + 1).padStart(2,'0')}-${String(clampedDay).padStart(2,'0')}`;
};

export const addDays = (dateStr, n) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
};

export const addWeeks = (dateStr, n) => addDays(dateStr, n * 7);

export const startOfMonth = (dateStr) => `${dateStr.slice(0, 7)}-01`;

export const endOfMonth = (dateStr) => {
  const [y, m] = dateStr.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return `${dateStr.slice(0, 7)}-${String(last).padStart(2,'0')}`;
};

/**
 * Calcula a data do próximo vencimento de um cartão a partir de hoje.
 * Leva em conta diaFechamento e diaVencimento para determinar a qual ciclo pertence a fatura atual.
 * @param {{ diaFechamento?: number, diaVencimento: number }} card
 * @param {string} today - 'YYYY-MM-DD'
 * @returns {string} 'YYYY-MM-DD'
 */
export const getProximoVencimento = (card, today) => {
  const [y, m, d] = today.split('-').map(Number);
  const diaFech = card.diaFechamento || card.diaVencimento;
  const diaVenc = card.diaVencimento;
  let mes = m, ano = y;
  if (d > diaFech) { mes += 1; if (mes > 12) { mes = 1; ano += 1; } }
  if (diaVenc < diaFech) { mes += 1; if (mes > 12) { mes = 1; ano += 1; } }
  const lastDay = new Date(ano, mes, 0).getDate();
  const dia = Math.min(diaVenc, lastDay);
  return `${ano}-${String(mes).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;
};

export const TYPE_CONFIG = {
  entrada:      { label: 'Entrada',       color: '#10b981', bg: 'rgba(16,185,129,0.15)',  sign: +1 },
  saida:        { label: 'Saída',         color: '#ef4444', bg: 'rgba(239,68,68,0.15)',   sign: -1 },
  diario:       { label: 'Gasto Diário',  color: '#f59e0b', bg: 'rgba(245,158,11,0.15)',  sign: -1 },
  cartao:       { label: 'Cartão',        color: '#3b82f6', bg: 'rgba(59,130,246,0.15)',  sign: -1 },
  investimento: { label: 'Investimento',  color: '#a855f7', bg: 'rgba(168,85,247,0.15)',  sign: -1 },
};

/**
 * Formata valor BRL durante a digitação (onChange).
 * Mantém pontos de milhar automáticos, MAS não auto-adiciona vírgula/centavos —
 * isso evita que o cursor fique preso e impeça continuar digitando.
 * A normalização completa (ex: "1.500" → "1.500,00") é feita no onBlur via normalizeBRLInput.
 *
 * Exemplos onChange:
 *   "1"        → "1"
 *   "15"       → "15"
 *   "1500"     → "1.500"
 *   "1500,"    → "1.500,"      (usuário acabou de digitar a vírgula)
 *   "1500,5"   → "1.500,5"
 *   "1500,50"  → "1.500,50"
 *
 * Exemplos onBlur (normalizeBRLInput):
 *   "1.500"    → "1.500,00"
 *   "1.500,5"  → "1.500,50"
 */
export function formatBRLInput(raw) {
  if (!raw) return '';
  // Remove pontos de milhar (são só display), mantém vírgula e dígitos
  const clean = String(raw).replace(/\./g, '');
  const commaIdx = clean.indexOf(',');

  if (commaIdx === -1) {
    // Sem vírgula ainda: apenas formata o inteiro com pontos de milhar
    const digits = clean.replace(/\D/g, '');
    if (!digits) return '';
    const n = parseInt(digits, 10);
    if (n === 0) return '';
    return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  // Com vírgula: formata parte inteira + até 2 dígitos de centavos
  const intStr = clean.substring(0, commaIdx).replace(/\D/g, '');
  const decStr = clean.substring(commaIdx + 1).replace(/\D/g, '').slice(0, 2);
  const intFormatted = intStr
    ? parseInt(intStr, 10).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
    : '0';
  return `${intFormatted},${decStr}`;
}

/**
 * Normaliza valor BRL ao sair do campo (onBlur).
 * Completa centavos faltando e mantém formatação correta.
 *   "1.500"   → "1.500,00"
 *   "1.500,5" → "1.500,50"
 *   "150,50"  → "150,50"
 *   ""        → ""
 */
export function normalizeBRLInput(str) {
  if (!str) return '';
  const n = parseBRLInput(str);
  if (!n) return '';
  return numberToBRLInput(n);
}

/**
 * Converte string formatada de input BRL para número.
 * Ex: "1.500,50" → 1500.50  |  "1" → 1  |  "151,12" → 151.12
 */
export function parseBRLInput(formatted) {
  if (!formatted) return 0;
  return parseFloat(String(formatted).replace(/\./g, '').replace(',', '.')) || 0;
}

/**
 * Converte número para string de input BRL formatada (para carregar valores existentes).
 * Ex: 1500.5 → "1.500,50"  |  1 → "1,00"
 */
export function numberToBRLInput(num) {
  if (!num) return '';
  const n = Number(num);
  if (!n) return '';
  const reais = Math.floor(n);
  const cents = Math.round((n - reais) * 100);
  return reais.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + String(cents).padStart(2, '0');
}

export const FREQ_LABELS = {
  unico:    'Único',
  diario:   'Diário',
  semanal:  'Semanal',
  mensal:   'Mensal',
  parcelado:'Parcelado',
};
