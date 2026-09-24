import { useState, useMemo } from 'react';
import { ShieldCheck, TrendingUp, Info, ChevronDown, ChevronUp, Check, AlertTriangle } from 'lucide-react';
import { formatBRL } from '../../utils/formatters';
import { expandOccurrences } from '../../utils/projectionCalc';
import { calcularSobraSegura } from '../../utils/projectionCalc';

const FAR_PAST = '2020-01-01';

const CLASSES_LABELS = {
  renda_fixa:    { label: 'Renda Fixa',    cor: '#3b82f6' },
  acoes:         { label: 'Ações',         cor: '#10b981' },
  fiis:          { label: 'FIIs',          cor: '#f59e0b' },
  cripto:        { label: 'Cripto',        cor: '#f97316' },
  internacional: { label: 'Internacional', cor: '#8b5cf6' },
  outro:         { label: 'Outro',         cor: '#6b7280' },
};

const PERFIS = [
  { id: 'concursado', label: 'Concursado/Servidor', mesesMin: 3, mesesMax: 3, rec: 3, desc: 'Alta estabilidade — 3 meses recomendados' },
  { id: 'clt',        label: 'CLT',                 mesesMin: 4, mesesMax: 6, rec: 6, desc: 'Estabilidade moderada — 4 a 6 meses recomendados' },
  { id: 'pj',         label: 'PJ / Autônomo',       mesesMin: 6, mesesMax: 12, rec: 12, desc: 'Renda variável — 6 a 12 meses recomendados' },
];

function MultiDonut({ segments, size = 96 }) {
  const r = (size / 2) - 8;
  const circ = 2 * Math.PI * r;
  const cx = size / 2, cy = size / 2;
  let offset = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--border)" strokeWidth="9" />
      {segments.map((s, i) => {
        const dash = (s.pct / 100) * circ;
        const el = (
          <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={s.cor} strokeWidth="9"
            strokeDasharray={`${dash} ${circ - dash}`}
            strokeDashoffset={-offset}
            transform={`rotate(-90 ${cx} ${cy})`}
            strokeLinecap="butt" />
        );
        offset += dash;
        return el;
      })}
    </svg>
  );
}

function DonutProgress({ pct, cor, size = 72 }) {
  const r = (size / 2) - 7;
  const circ = 2 * Math.PI * r;
  const dash = Math.min(pct / 100, 1) * circ;
  const cx = size / 2, cy = size / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--border)" strokeWidth="7" />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={cor} strokeWidth="7"
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`}
        style={{ transition: 'stroke-dasharray 0.6s ease' }} />
      <text x={cx} y={cy + 5} textAnchor="middle" fontSize="13" fontWeight="700" fill="var(--text-primary)">
        {Math.min(Math.round(pct), 100)}%
      </text>
    </svg>
  );
}

export default function InvestimentosScreen({ transactions, wallets, goals, config, onSaveConfig }) {
  const today = new Date().toISOString().slice(0, 10);

  // ── Config persistida ────────────────────────────────────────────────────────
  const inv = config?.investimentos || {};
  const [perfil,        setPerfil]       = useState(inv.perfil        || '');
  const [mesesMeta,     setMesesMeta]    = useState(inv.mesesMeta     || 0);
  const [despesasMens,  setDespesasMens] = useState(inv.despesasMens  || 0);
  const [reservaGoalId, setReservaGoalId]= useState(inv.reservaGoalId || '');
  const [saved, setSaved]                = useState(false);
  const [showTip, setShowTip]            = useState(false);

  // ── Sugestão automática de despesas fixas mensais ────────────────────────────
  const despesasSugeridas = useMemo(() => {
    if (!transactions?.length) return 0;
    const fixas = transactions.filter(t =>
      t.tipo === 'fixo' && t.sinal === -1 || (t.tipo === 'fixo' && !t.sinal)
    );
    // usa valor direto das recorrentes
    const recorrentes = transactions.filter(t =>
      (t.frequencia === 'mensal' || t.frequencia === 'quinzenal' || t.frequencia === 'semanal') &&
      ['fixo', 'saida', 'cartao'].includes(t.tipo)
    );
    const soma = recorrentes.reduce((acc, t) => acc + (Number(t.valor) || 0), 0);
    return Math.round(soma);
  }, [transactions]);

  // ── Saldo acumulado da caixinha de reserva ───────────────────────────────────
  const reservaAtual = useMemo(() => {
    if (!reservaGoalId || !goals?.length) return 0;
    const g = goals.find(g => g.id === reservaGoalId);
    if (!g) return 0;
    // soma movimentações do tipo investimento vinculadas à caixinha
    const movs = (transactions || []).filter(t =>
      (t.goalId === reservaGoalId || t.cartaoVinculo === reservaGoalId) &&
      (t.tipo === 'investimento' || t.tipo === 'entrada')
    );
    const total = movs.flatMap(t => expandOccurrences(t, FAR_PAST, today))
      .reduce((acc, o) => acc + o.valor * o.sinal, 0);
    // fallback: usa saldoInicial da meta se não houver movimentações
    return total !== 0 ? Math.max(total, 0) : (g.saldoInicial || 0);
  }, [reservaGoalId, goals, transactions, today]);

  // ── Sobra segura (valor disponível para poupar) ──────────────────────────────
  const sobraSegura = useMemo(() => {
    const r = calcularSobraSegura(transactions || [], wallets || [], 45);
    return Math.max(r, 0);
  }, [transactions, wallets]);

  // ── Derived ──────────────────────────────────────────────────────────────────
  const perfilObj     = PERFIS.find(p => p.id === perfil);
  const metaTotal     = (despesasMens || despesasSugeridas) * (mesesMeta || (perfilObj?.rec || 0));
  const reservaPct    = metaTotal > 0 ? (reservaAtual / metaTotal) * 100 : 0;
  const reservaCompleta = reservaAtual >= metaTotal && metaTotal > 0;
  const faltaReserva  = Math.max(metaTotal - reservaAtual, 0);

  const aporteRecomendado = sobraSegura;
  const aporteReserva     = reservaCompleta ? 0 : aporteRecomendado * 0.6;
  const aporteInvest      = reservaCompleta ? aporteRecomendado : aporteRecomendado * 0.4;

  // ── Total investido (exceto reserva) ─────────────────────────────────────────
  const totalInvestido = useMemo(() => {
    const invTxs = (transactions || []).filter(t => t.tipo === 'investimento');
    return invTxs.flatMap(t => expandOccurrences(t, FAR_PAST, today))
      .reduce((acc, o) => acc + o.valor, 0);
  }, [transactions, today]);

  // ── Alocação por classe de investimento ──────────────────────────────────────
  const alocacaoPorClasse = useMemo(() => {
    const invTxs = (transactions || []).filter(t => t.tipo === 'investimento');
    const totals = {};
    invTxs.forEach(tx => {
      const classe = tx.classeInvestimento || 'outro';
      const occs = expandOccurrences(tx, FAR_PAST, today);
      const soma = occs.reduce((acc, o) => acc + o.valor, 0);
      totals[classe] = (totals[classe] || 0) + soma;
    });
    const total = Object.values(totals).reduce((a, b) => a + b, 0);
    if (total <= 0) return { total: 0, segments: [] };
    let acc = 0;
    const segments = Object.entries(totals)
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([classe, valor]) => {
        const pct = (valor / total) * 100;
        const seg = { classe, valor, pct, cor: CLASSES_LABELS[classe]?.cor || '#6b7280', label: CLASSES_LABELS[classe]?.label || classe };
        return seg;
      });
    return { total, segments };
  }, [transactions, today]);

  const handleSave = () => {
    const despVal = despesasMens || despesasSugeridas;
    onSaveConfig({
      investimentos: {
        ...inv,
        perfil,
        mesesMeta: mesesMeta || (perfilObj?.rec || 0),
        despesasMens: despVal,
        reservaGoalId,
      }
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const hasSetup = perfil && (mesesMeta || perfilObj?.rec) && (despesasMens || despesasSugeridas);

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-primary)', paddingBottom: 96 }}>
      {/* Header */}
      <div style={{ padding: '20px 20px 0', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 38, height: 38, borderRadius: 12, background: 'linear-gradient(135deg,#10b981,#059669)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <TrendingUp size={20} color="#fff" />
        </div>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>Investimentos</h1>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>Planejamento e alocação</p>
        </div>
      </div>

      <div style={{ padding: '16px 16px 0', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* ── Card: Configuração do perfil ──────────────────────────────────── */}
        <div style={{ background: 'var(--bg-surface)', borderRadius: 16, padding: 16, border: '1px solid var(--border)' }}>
          <p style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
            <ShieldCheck size={14} style={{ marginRight: 6, verticalAlign: 'middle', color: '#10b981' }} />
            Reserva de Emergência
          </p>

          {/* Perfil */}
          <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Tipo de trabalho</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
            {PERFIS.map(p => (
              <button key={p.id} onClick={() => {
                setPerfil(p.id);
                if (!mesesMeta) setMesesMeta(p.rec);
              }} style={{
                padding: '10px 14px', borderRadius: 12, textAlign: 'left', cursor: 'pointer',
                background: perfil === p.id ? 'rgba(16,185,129,0.12)' : 'var(--bg-primary)',
                border: `1px solid ${perfil === p.id ? '#10b981' : 'var(--border)'}`,
                color: 'var(--text-primary)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{p.label}</span>
                  {perfil === p.id && <Check size={14} color="#10b981" />}
                </div>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.desc}</span>
              </button>
            ))}
          </div>

          {/* Meses */}
          {perfilObj && (
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
                Meses de reserva — recomendado: {perfilObj.rec}
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <input type="range" min={perfilObj.mesesMin} max={perfilObj.mesesMax}
                  value={mesesMeta || perfilObj.rec}
                  onChange={e => setMesesMeta(Number(e.target.value))}
                  style={{ flex: 1 }} />
                <span style={{ fontSize: 16, fontWeight: 700, color: '#10b981', minWidth: 28, textAlign: 'right' }}>
                  {mesesMeta || perfilObj.rec}
                </span>
              </div>
            </div>
          )}

          {/* Despesas mensais */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
              Despesas fixas mensais
              {despesasSugeridas > 0 && !despesasMens && (
                <span style={{ marginLeft: 6, fontSize: 11, color: '#6366f1', cursor: 'pointer' }}
                  onClick={() => setDespesasMens(despesasSugeridas)}>
                  (usar sugestão: {formatBRL(despesasSugeridas)})
                </span>
              )}
            </label>
            <input
              type="number" min="0" inputMode="numeric"
              value={despesasMens || ''}
              placeholder={despesasSugeridas > 0 ? `Sugerido: ${formatBRL(despesasSugeridas)}` : 'R$ 0,00'}
              onChange={e => setDespesasMens(Number(e.target.value))}
              style={{
                width: '100%', padding: '10px 14px', borderRadius: 12, fontSize: 14,
                background: 'var(--bg-primary)', border: '1px solid var(--border)',
                color: 'var(--text-primary)', boxSizing: 'border-box',
              }} />
          </div>

          {/* Caixinha vinculada */}
          {goals?.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
                Caixinha da reserva de emergência
              </label>
              <select value={reservaGoalId} onChange={e => setReservaGoalId(e.target.value)}
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: 12, fontSize: 13,
                  background: 'var(--bg-primary)', border: '1px solid var(--border)',
                  color: 'var(--text-primary)', boxSizing: 'border-box',
                }}>
                <option value="">— Nenhuma vinculada —</option>
                {goals.map(g => (
                  <option key={g.id} value={g.id}>{g.nome}</option>
                ))}
              </select>
            </div>
          )}

          {/* Aviso onde guardar */}
          <div style={{
            background: 'rgba(99,102,241,0.08)', borderRadius: 10, padding: '10px 12px',
            border: '1px solid rgba(99,102,241,0.2)', marginBottom: 14,
          }}>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              <Info size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />
              <strong>Onde guardar:</strong> prefira conta corrente ou caixinha com resgate imediato (ex: CDB diário, Tesouro Selic).
              Nunca imobilize a reserva em investimentos sem liquidez imediata.
            </p>
          </div>

          <button onClick={handleSave} style={{
            width: '100%', padding: '12px', borderRadius: 12, fontSize: 14, fontWeight: 700,
            background: saved ? '#10b981' : 'var(--primary)', color: '#fff', border: 'none', cursor: 'pointer',
            transition: 'background 0.3s',
          }}>
            {saved ? '✓ Salvo!' : 'Salvar configuração'}
          </button>
        </div>

        {/* ── Card: Progresso da reserva ──────────────────────────────────────── */}
        {hasSetup && (
          <div style={{ background: 'var(--bg-surface)', borderRadius: 16, padding: 16, border: `1px solid ${reservaCompleta ? 'rgba(16,185,129,0.4)' : 'var(--border)'}` }}>
            {reservaCompleta ? (
              <div style={{ textAlign: 'center', padding: '8px 0' }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>🎉</div>
                <p style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700, color: '#10b981' }}>
                  Reserva de emergência completa!
                </p>
                <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--text-secondary)' }}>
                  Você atingiu {formatBRL(metaTotal)}. Agora 100% da sua sobra vai para investimentos.
                </p>
                <div style={{ background: 'rgba(16,185,129,0.1)', borderRadius: 12, padding: '12px 16px', border: '1px solid rgba(16,185,129,0.3)' }}>
                  <p style={{ margin: '0 0 4px', fontSize: 12, color: 'var(--text-muted)' }}>Disponível para investir por mês</p>
                  <p style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#10b981' }}>{formatBRL(aporteInvest)}</p>
                </div>
              </div>
            ) : (
              <>
                <p style={{ margin: '0 0 14px', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                  Progresso da reserva
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
                  <DonutProgress pct={reservaPct} cor="#10b981" size={80} />
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: '0 0 2px', fontSize: 20, fontWeight: 800, color: 'var(--text-primary)' }}>
                      {formatBRL(reservaAtual)}
                    </p>
                    <p style={{ margin: '0 0 6px', fontSize: 12, color: 'var(--text-muted)' }}>
                      de {formatBRL(metaTotal)} ({mesesMeta || perfilObj?.rec} meses × {formatBRL(despesasMens || despesasSugeridas)})
                    </p>
                    <p style={{ margin: 0, fontSize: 12, color: '#f59e0b' }}>
                      Falta {formatBRL(faltaReserva)}
                    </p>
                  </div>
                </div>

                {/* Distribuição recomendada */}
                <div style={{ background: 'var(--bg-primary)', borderRadius: 12, padding: 12, marginBottom: 12 }}>
                  <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
                    Distribuição recomendada da sobra mensal ({formatBRL(sobraSegura)})
                  </p>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                    <div style={{ flex: 6, background: 'rgba(16,185,129,0.15)', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
                      <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>Reserva (60%)</p>
                      <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#10b981' }}>{formatBRL(aporteReserva)}</p>
                    </div>
                    <div style={{ flex: 4, background: 'rgba(99,102,241,0.12)', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
                      <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>Investir (40%)</p>
                      <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--primary)' }}>{formatBRL(aporteInvest)}</p>
                    </div>
                  </div>

                  {/* Barra proporcional */}
                  <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', height: 8 }}>
                    <div style={{ flex: 6, background: '#10b981' }} />
                    <div style={{ flex: 4, background: 'var(--primary)' }} />
                  </div>
                </div>

                {/* Estimativa de conclusão */}
                {aporteReserva > 0 && faltaReserva > 0 && (
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
                    ⏱ Estimativa: {Math.ceil(faltaReserva / aporteReserva)} meses para completar a reserva
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Card: Total investido ──────────────────────────────────────────── */}
        {totalInvestido > 0 && (
          <div style={{ background: 'var(--bg-surface)', borderRadius: 16, padding: 16, border: '1px solid var(--border)' }}>
            <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
              <TrendingUp size={14} style={{ marginRight: 6, verticalAlign: 'middle', color: 'var(--investimento)' }} />
              Total investido
            </p>
            <p style={{ margin: 0, fontSize: 26, fontWeight: 800, color: 'var(--investimento)' }}>
              {formatBRL(totalInvestido)}
            </p>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
              Acumulado em todos os lançamentos de investimento
            </p>
          </div>
        )}

        {/* ── Card: Alocação por classe ────────────────────────────────────────── */}
        {alocacaoPorClasse.total > 0 && (
          <div style={{ background: 'var(--bg-surface)', borderRadius: 16, padding: 16, border: '1px solid var(--border)' }}>
            <p style={{ margin: '0 0 14px', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
              Alocação por classe
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
              <MultiDonut segments={alocacaoPorClasse.segments} size={96} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {alocacaoPorClasse.segments.map(s => (
                  <div key={s.classe} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: s.cor, flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 12, color: 'var(--text-secondary)' }}>{s.label}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{Math.round(s.pct)}%</span>
                  </div>
                ))}
              </div>
            </div>
            <p style={{ margin: '12px 0 0', fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>
              Baseado na classe informada em cada lançamento de investimento
            </p>
          </div>
        )}

        {/* ── Aviso quando não configurado ─────────────────────────────────── */}
        {!hasSetup && (
          <div style={{ background: 'rgba(245,158,11,0.08)', borderRadius: 14, padding: 16, border: '1px solid rgba(245,158,11,0.25)', textAlign: 'center' }}>
            <AlertTriangle size={24} color="#f59e0b" style={{ marginBottom: 8 }} />
            <p style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
              Configure sua reserva de emergência
            </p>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Selecione seu perfil e informe suas despesas mensais para ver a recomendação de aporte personalizada.
            </p>
          </div>
        )}

      </div>
    </div>
  );
}
