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
  const dt = new Date(y, m - 1 + n, d);
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
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

export const TYPE_CONFIG = {
  entrada:      { label: 'Entrada',       color: '#10b981', bg: 'rgba(16,185,129,0.15)',  sign: +1 },
  saida:        { label: 'Saída',         color: '#ef4444', bg: 'rgba(239,68,68,0.15)',   sign: -1 },
  diario:       { label: 'Gasto Diário',  color: '#f59e0b', bg: 'rgba(245,158,11,0.15)',  sign: -1 },
  cartao:       { label: 'Cartão',        color: '#3b82f6', bg: 'rgba(59,130,246,0.15)',  sign: -1 },
  investimento: { label: 'Investimento',  color: '#a855f7', bg: 'rgba(168,85,247,0.15)',  sign: -1 },
};

export const FREQ_LABELS = {
  unico:    'Único',
  diario:   'Diário',
  semanal:  'Semanal',
  mensal:   'Mensal',
  parcelado:'Parcelado',
};
