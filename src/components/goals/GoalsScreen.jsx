/* eslint-disable react-hooks/purity */
import { useState, useMemo, useEffect } from 'react';
import { Target, Plus, Pencil, Trash2, TrendingUp, Sparkles, Building, Car, HelpCircle } from 'lucide-react';
import { formatBRL, formatBRLInput, normalizeBRLInput, parseBRLInput, todayStr, addMonths, formatMonthYear } from '../../utils/formatters';
import { getAutoCategory, PERCENTUAL_CATEGORIES, DEFAULT_BUDGET_PCTS } from '../../utils/categories';
import { calcSaldo, expandOccurrences } from '../../utils/projectionCalc';

const COLOR_OPTIONS = [
  '#3b82f6', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316', '#eab308', '#22c55e', '#06b6d4',
];

export default function GoalsScreen({ goals, transactions, wallets = [], config, onSaveConfig, onAddGoal, onUpdateGoal, onRemoveGoal, onAddTransaction }) {
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  
  const [nome, setNome] = useState('');
  const [cor, setCor] = useState(COLOR_OPTIONS[0]);
  const [metaFinal, setMetaFinal] = useState('');
  const [dataAlvo, setDataAlvo] = useState('');

  const [isIndependencia, setIsIndependencia] = useState(false);
  const [tipoAtivo, setTipoAtivo] = useState('cdb');
  const [taxaRendimento, setTaxaRendimento] = useState('');
  const [aporteMensal, setAporteMensal] = useState('');

  const [expandedSimId, setExpandedSimId] = useState(null);

  // --- Estados do Painel Pense com Calma ---
  const [activeTab, setActiveTab] = useState('caixinhas'); // 'caixinhas' | 'penseComCalma' | 'simulador'
  const impulseItems = config?.impulseItems || [];
  const economiaAcumulada = config?.economiaAcumulada || 0;

  // --- Constantes do Simulador de Grandes Compras ---
  const TAX_SCENARIOS = useMemo(() => ({
    '1': {
      label: 'Último Ano (2025)',
      jurosFinanciamento: 11.20,
      incc: 5.94,
      tr: 1.97,
      ipca: 4.26
    },
    '3': {
      label: 'Últimos 3 Anos (2023-2025)',
      jurosFinanciamento: 10.90,
      incc: 5.32,
      tr: 1.51,
      ipca: 4.57
    },
    '5': {
      label: 'Últimos 5 Anos (2021-2025)',
      jurosFinanciamento: 9.80,
      incc: 7.82,
      tr: 1.23,
      ipca: 5.91
    }
  }), []);

  // --- Estados do Simulador de Grandes Compras ---
  const [simValorCompra, setSimValorCompra] = useState('500.000,00');
  const [simValorEntrada, setSimValorEntrada] = useState('100.000,00');
  const [simEntradaParcelada, setSimEntradaParcelada] = useState(false);
  const [simPrazoEntrada, setSimPrazoEntrada] = useState('24');
  const [simIndexadorEntrada, setSimIndexadorEntrada] = useState('incc');
  const [simTaxaIndexadorEntrada, setSimTaxaIndexadorEntrada] = useState('5,32');

  const [simPrazoFinanciamento, setSimPrazoFinanciamento] = useState('360');
  const [simTaxaJuros, setSimTaxaJuros] = useState('10,90');
  const [simAmortizacao, setSimAmortizacao] = useState('sac');
  const [simIndexadorFinanc, setSimIndexadorFinanc] = useState('tr');
  const [simTaxaIndexadorFinanc, setSimTaxaIndexadorFinanc] = useState('1,51');
  const [simTaxasExtras, setSimTaxasExtras] = useState('120,00');
  const [simComecarAposEntrada, setSimComecarAposEntrada] = useState(true);
  const [simCenarioPeriodo, setSimCenarioPeriodo] = useState('3'); // '1' | '3' | '5'

  // Handlers para preencher automaticamente taxas sugeridas de acordo com o cenário e indexadores
  const handleCenarioPeriodoChange = (periodo) => {
    setSimCenarioPeriodo(periodo);
    const sc = TAX_SCENARIOS[periodo];
    if (!sc) return;
    
    setSimTaxaJuros(sc.jurosFinanciamento.toFixed(2).replace('.', ','));

    if (simIndexadorFinanc === 'none') setSimTaxaIndexadorFinanc('0,00');
    else if (simIndexadorFinanc === 'tr') setSimTaxaIndexadorFinanc(sc.tr.toFixed(2).replace('.', ','));
    else if (simIndexadorFinanc === 'incc') setSimTaxaIndexadorFinanc(sc.incc.toFixed(2).replace('.', ','));
    else if (simIndexadorFinanc === 'ipca') setSimTaxaIndexadorFinanc(sc.ipca.toFixed(2).replace('.', ','));

    if (simIndexadorEntrada === 'none') setSimTaxaIndexadorEntrada('0,00');
    else if (simIndexadorEntrada === 'tr') setSimTaxaIndexadorEntrada(sc.tr.toFixed(2).replace('.', ','));
    else if (simIndexadorEntrada === 'incc') setSimTaxaIndexadorEntrada(sc.incc.toFixed(2).replace('.', ','));
    else if (simIndexadorEntrada === 'ipca') setSimTaxaIndexadorEntrada(sc.ipca.toFixed(2).replace('.', ','));
  };

  const handleIndexadorFinancChange = (idx) => {
    setSimIndexadorFinanc(idx);
    const sc = TAX_SCENARIOS[simCenarioPeriodo];
    if (!sc) return;
    if (idx === 'none') setSimTaxaIndexadorFinanc('0,00');
    else if (idx === 'tr') setSimTaxaIndexadorFinanc(sc.tr.toFixed(2).replace('.', ','));
    else if (idx === 'incc') setSimTaxaIndexadorFinanc(sc.incc.toFixed(2).replace('.', ','));
    else if (idx === 'ipca') setSimTaxaIndexadorFinanc(sc.ipca.toFixed(2).replace('.', ','));
  };

  const handleIndexadorEntradaChange = (idx) => {
    setSimIndexadorEntrada(idx);
    const sc = TAX_SCENARIOS[simCenarioPeriodo];
    if (!sc) return;
    if (idx === 'none') setSimTaxaIndexadorEntrada('0,00');
    else if (idx === 'tr') setSimTaxaIndexadorEntrada(sc.tr.toFixed(2).replace('.', ','));
    else if (idx === 'incc') setSimTaxaIndexadorEntrada(sc.incc.toFixed(2).replace('.', ','));
    else if (idx === 'ipca') setSimTaxaIndexadorEntrada(sc.ipca.toFixed(2).replace('.', ','));
  };

  // Projeção Mês a Mês (SAC / Price, parcelamentos e fluxo de caixa)
  const simResultados = useMemo(() => {
    const vCompra = parseBRLInput(simValorCompra) || 0;
    const vEntrada = parseBRLInput(simValorEntrada) || 0;
    const pFinanc = parseInt(simPrazoFinanciamento) || 360;
    const rateJurosAA = (parseBRLInput(simTaxaJuros) || 0) / 100;
    
    const pEntrada = simEntradaParcelada ? (parseInt(simPrazoEntrada) || 24) : 0;
    const rateIdxEntradaAA = (parseBRLInput(simTaxaIndexadorEntrada) || 0) / 100;
    const rateIdxFinancAA = (parseBRLInput(simTaxaIndexadorFinanc) || 0) / 100;
    const tExtras = parseBRLInput(simTaxasExtras) || 0;

    const vFinanciado = Math.max(0, vCompra - vEntrada);

    const jurosMensal = Math.pow(1 + rateJurosAA, 1 / 12) - 1;
    const idxEntradaMensal = Math.pow(1 + rateIdxEntradaAA, 1 / 12) - 1;
    const idxFinancMensal = Math.pow(1 + rateIdxFinancAA, 1 / 12) - 1;

    const hoje = todayStr();
    const globalTx = calcSaldo(transactions, '2020-01-01', hoje);
    const wInitials = wallets?.reduce((acc, w) => acc + (parseBRLInput(w.saldoInicial) || 0), 0) || 0;
    const saldoInicialLiquido = globalTx + wInitials;

    const expenses = transactions.filter(t => t.tipo !== 'entrada' && t.tipo !== 'investimento');
    
    const dtHoje = new Date();
    const dtPassado = new Date(dtHoje.getFullYear() - 1, dtHoje.getMonth(), dtHoje.getDate());
    const fromDateStr = dtPassado.toISOString().slice(0, 10);
    const toDateStr = hoje;
    
    const occurrences = expenses.flatMap(tx => expandOccurrences(tx, fromDateStr, toDateStr));
    
    const monthlySums = {};
    occurrences.forEach(o => {
      const m = o.date.slice(0, 7);
      monthlySums[m] = (monthlySums[m] || 0) + o.valor;
    });
    
    const activeMonths = Object.keys(monthlySums);
    const despesaMediaMensal = activeMonths.length > 0 
      ? (Object.values(monthlySums).reduce((a, b) => a + b, 0) / activeMonths.length)
      : 0;

    const rendaMensal = parseBRLInput(config?.rendaMensal) || 0;
    const sobraBaseline = Math.max(0, rendaMensal - despesaMediaMensal);

    const prazoTotalSimulado = Math.max(24, pEntrada + pFinanc);
    const timeline = [];

    let saldoPoupanca = saldoInicialLiquido;
    if (!simEntradaParcelada) {
      saldoPoupanca = Math.max(0, saldoPoupanca - vEntrada);
    }

    let saldoDevedorFinanc = vFinanciado;
    const financDiferido = simEntradaParcelada && simComecarAposEntrada;

    let prestacaoInicialFinanc = 0;
    let prestacaoFinalFinanc = 0;
    let custoTotalAmortizacao = 0;
    let custoTotalEntrada = 0;

    if (vFinanciado > 0) {
      if (simAmortizacao === 'sac') {
        const amort = vFinanciado / pFinanc;
        const juros = vFinanciado * jurosMensal;
        prestacaoInicialFinanc = amort + juros + tExtras;
        
        const amortFinal = vFinanciado / pFinanc;
        const ultimoJuros = amortFinal * jurosMensal;
        prestacaoFinalFinanc = amortFinal + ultimoJuros + tExtras;
      } else {
        const pmt = vFinanciado * (jurosMensal * Math.pow(1 + jurosMensal, pFinanc)) / (Math.pow(1 + jurosMensal, pFinanc) - 1);
        prestacaoInicialFinanc = pmt + tExtras;
        prestacaoFinalFinanc = pmt + tExtras;
      }
    }

    for (let m = 1; m <= prazoTotalSimulado; m++) {
      let parcelaEntrada = 0;
      let parcelaFinanc = 0;
      
      if (simEntradaParcelada && m <= pEntrada) {
        const parcelaBase = vEntrada / pEntrada;
        parcelaEntrada = parcelaBase * Math.pow(1 + idxEntradaMensal, m);
        custoTotalEntrada += parcelaEntrada;

        if (financDiferido) {
          saldoDevedorFinanc = saldoDevedorFinanc * (1 + idxEntradaMensal);
        }
      }

      let mesFinanciamento = 0;
      let pagandoFinanciamento = false;

      if (financDiferido) {
        if (m > pEntrada) {
          mesFinanciamento = m - pEntrada;
          pagandoFinanciamento = mesFinanciamento <= pFinanc;
        }
      } else {
        mesFinanciamento = m;
        pagandoFinanciamento = mesFinanciamento <= pFinanc;
      }

      if (vFinanciado > 0 && pagandoFinanciamento) {
        saldoDevedorFinanc = saldoDevedorFinanc * (1 + idxFinancMensal);
        const parcelasRestantes = pFinanc - mesFinanciamento + 1;

        if (simAmortizacao === 'sac') {
          const amort = saldoDevedorFinanc / parcelasRestantes;
          const juros = saldoDevedorFinanc * jurosMensal;
          parcelaFinanc = amort + juros + tExtras;
          saldoDevedorFinanc = Math.max(0, saldoDevedorFinanc - amort);
        } else {
          const pmt = saldoDevedorFinanc * (jurosMensal * Math.pow(1 + jurosMensal, parcelasRestantes)) / (Math.pow(1 + jurosMensal, parcelasRestantes) - 1);
          parcelaFinanc = pmt + tExtras;
          const amort = parcelaFinanc - tExtras - (saldoDevedorFinanc * jurosMensal);
          saldoDevedorFinanc = Math.max(0, saldoDevedorFinanc - amort);
        }

        custoTotalAmortizacao += parcelaFinanc;
      }

      const totalParcelasMes = parcelaEntrada + parcelaFinanc;
      const sobraLiquidaMes = sobraBaseline - totalParcelasMes;
      saldoPoupanca = saldoPoupanca + sobraLiquidaMes;

      if (m <= 24) {
        timeline.push({
          mes: m,
          dataLabel: formatMonthYear(addMonths(hoje, m)),
          parcelaEntrada,
          parcelaFinanc,
          totalMes: totalParcelasMes,
          sobraLiquida: sobraLiquidaMes,
          saldoAcumulado: saldoPoupanca
        });
      }
    }

    return {
      vFinanciado,
      saldoInicialLiquido,
      sobraBaseline,
      despesaMediaMensal,
      timeline,
      totalPagoFinal: (simEntradaParcelada ? custoTotalEntrada : vEntrada) + custoTotalAmortizacao,
      prestacaoInicialFinanc,
      prestacaoFinalFinanc,
      custoTotalEntrada: simEntradaParcelada ? custoTotalEntrada : vEntrada,
      comprometimentoRendaPct: rendaMensal > 0 ? (prestacaoInicialFinanc / rendaMensal) * 100 : 0
    };
  }, [
    transactions, wallets, config,
    simValorCompra, simValorEntrada, simEntradaParcelada, simPrazoEntrada, simTaxaIndexadorEntrada,
    simPrazoFinanciamento, simTaxaJuros, simAmortizacao, simTaxaIndexadorFinanc,
    simTaxasExtras, simComecarAposEntrada
  ]);

  const handlePresetImovelPronto = () => {
    setSimValorCompra('500.000,00');
    setSimValorEntrada('100.000,00');
    setSimEntradaParcelada(false);
    setSimPrazoFinanciamento('360');
    setSimAmortizacao('sac');
    setSimIndexadorFinanc('tr');
    setSimTaxasExtras('120,00');
    const sc = TAX_SCENARIOS[simCenarioPeriodo];
    if (sc) {
      setSimTaxaJuros(sc.jurosFinanciamento.toFixed(2).replace('.', ','));
      setSimTaxaIndexadorFinanc(sc.tr.toFixed(2).replace('.', ','));
    }
  };

  const handlePresetImovelPlanta = () => {
    setSimValorCompra('500.000,00');
    setSimValorEntrada('120.000,00');
    setSimEntradaParcelada(true);
    setSimPrazoEntrada('24');
    setSimIndexadorEntrada('incc');
    setSimPrazoFinanciamento('360');
    setSimAmortizacao('sac');
    setSimIndexadorFinanc('tr');
    setSimComecarAposEntrada(true);
    setSimTaxasExtras('120,00');
    const sc = TAX_SCENARIOS[simCenarioPeriodo];
    if (sc) {
      setSimTaxaJuros(sc.jurosFinanciamento.toFixed(2).replace('.', ','));
      setSimTaxaIndexadorFinanc(sc.tr.toFixed(2).replace('.', ','));
      setSimTaxaIndexadorEntrada(sc.incc.toFixed(2).replace('.', ','));
    }
  };

  const handlePresetVeiculo = () => {
    setSimValorCompra('90.000,00');
    setSimValorEntrada('20.000,00');
    setSimEntradaParcelada(false);
    setSimPrazoFinanciamento('60');
    setSimAmortizacao('price');
    setSimIndexadorFinanc('none');
    setSimTaxasExtras('0,00');
    const sc = TAX_SCENARIOS[simCenarioPeriodo];
    if (sc) {
      setSimTaxaJuros(sc.jurosFinanciamento.toFixed(2).replace('.', ','));
      setSimTaxaIndexadorFinanc('0,00');
    }
  };

  const [nomeDesejo, setNomeDesejo] = useState('');
  const [precoDesejo, setPrecoDesejo] = useState('');
  const [categoriaDesejo, setCategoriaDesejo] = useState('prazeres');
  const [penseFormOpen, setPenseFormOpen] = useState(false);
  const [, setTick] = useState(0);
  const [confettiParticles, setConfettiParticles] = useState([]);

  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 30000);
    return () => clearInterval(timer);
  }, []);

  const triggerConfetti = () => {
    const particles = [];
    const emojis = ['🎉', '💰', '💸', '✨', '💎', '🚀', '🥳'];
    for (let i = 0; i < 40; i++) {
      particles.push({
        id: Math.random(),
        emoji: emojis[Math.floor(Math.random() * emojis.length)],
        x: Math.random() * 100,
        y: -10 - Math.random() * 20,
        angle: Math.random() * 360,
        scale: 0.5 + Math.random() * 1,
        duration: 1.5 + Math.random() * 2,
        delay: Math.random() * 0.5
      });
    }
    setConfettiParticles(particles);
    setTimeout(() => {
      setConfettiParticles([]);
    }, 3500);
  };

  const handleAddImpulseItem = async (e) => {
    e.preventDefault();
    if (!nomeDesejo.trim() || !precoDesejo) return;

    const priceNum = parseBRLInput(precoDesejo) || 0;
    if (priceNum <= 0) return;

    const newItem = {
      id: Date.now().toString(),
      nome: nomeDesejo.trim(),
      preco: priceNum,
      categoria: categoriaDesejo,
      createdAt: Date.now(),
    };

    if (onSaveConfig) {
      await onSaveConfig({
        impulseItems: [newItem, ...impulseItems]
      });
    }
    setNomeDesejo('');
    setPrecoDesejo('');
    setCategoriaDesejo('prazeres');
    setPenseFormOpen(false);
  };

  const handleDesistir = async (item) => {
    triggerConfetti();
    if (onSaveConfig) {
      await onSaveConfig({
        economiaAcumulada: economiaAcumulada + item.preco,
        impulseItems: impulseItems.filter(i => i.id !== item.id)
      });
    }
  };

  const handleConfirmar = async (item) => {
    onAddTransaction({
      tipo: 'saida',
      descricao: `Compra: ${item.nome}`,
      valor: item.preco,
      categoria: item.categoria,
      frequencia: 'unico',
      dataInicio: new Date().toISOString().slice(0, 10),
    });
    if (onSaveConfig) {
      await onSaveConfig({
        impulseItems: impulseItems.filter(i => i.id !== item.id)
      });
    }
  };

  const getRemainingTime = (createdAt) => {
    const tenDaysInMs = 10 * 24 * 60 * 60 * 1000;
    const elapsed = Date.now() - createdAt;
    const remaining = tenDaysInMs - elapsed;
    if (remaining <= 0) return 'Concluído';
    
    const days = Math.floor(remaining / (24 * 60 * 60 * 1000));
    const hours = Math.floor((remaining % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
    
    if (days > 0) {
      return `${days}d e ${hours}h`;
    } else if (hours > 0) {
      return `${hours}h e ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  };

  // Poupança mensal: investimentos do mês atual (para meta de Liberdade Financeira)
  const { investidoMes, metaMensal } = useMemo(() => {
    const today = new Date();
    const monthPrefix = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}`;
    const from = `${monthPrefix}-01`;
    const lastDay = new Date(today.getFullYear(), today.getMonth()+1, 0).getDate();
    const to = `${monthPrefix}-${String(lastDay).padStart(2,'0')}`;
    let investido = 0;
    transactions.forEach(tx => {
      if (tx.tipo !== 'investimento') return;
      expandOccurrences(tx, from, to).forEach(occ => { investido += occ.valor; });
    });
    const renda = Number(config?.rendaMensal) || 0;
    const pct   = Number(config?.budgetPcts?.liberdade) || 25;
    return { investidoMes: investido, metaMensal: renda > 0 ? (renda * pct / 100) : 0 };
  }, [transactions, config]);

  const resetForm = () => {
    setNome('');
    setCor(COLOR_OPTIONS[0]);
    setMetaFinal('');
    setDataAlvo('');
    setIsIndependencia(false);
    setTipoAtivo('cdb');
    setTaxaRendimento('');
    setAporteMensal('');
    setEditingId(null);
    setFormOpen(false);
  };

  const handleEdit = (goal) => {
    setNome(goal.nome);
    setCor(goal.cor || COLOR_OPTIONS[0]);
    setMetaFinal(goal.metaFinal ? goal.metaFinal.toString().replace('.', ',') : '');
    setDataAlvo(goal.dataAlvo || '');
    setIsIndependencia(goal.isIndependencia || false);
    setTipoAtivo(goal.tipoAtivo || 'cdb');
    setTaxaRendimento(goal.taxaRendimento ? goal.taxaRendimento.toString().replace('.', ',') : '');
    setAporteMensal(goal.aporteMensal ? goal.aporteMensal.toString().replace('.', ',') : '');
    setEditingId(goal.id);
    setFormOpen(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!nome.trim()) return;

    const data = {
      nome: nome.trim(),
      cor,
      metaFinal: parseBRLInput(metaFinal) || 0,
      dataAlvo: dataAlvo || null,
      isIndependencia,
      tipoAtivo: isIndependencia ? tipoAtivo : null,
      taxaRendimento: isIndependencia ? (parseBRLInput(taxaRendimento) || 0) : null,
      aporteMensal: isIndependencia ? (parseBRLInput(aporteMensal) || 0) : null,
    };

    if (editingId) {
      onUpdateGoal(editingId, data);
    } else {
      onAddGoal(data);
    }
    resetForm();
  };

  // Calcular progresso
  const goalsWithProgress = useMemo(() => {
    if (!goals) return [];
    return goals.map(g => {
      // Somar todos os investimentos (ou transações vinculadas) a esta meta
      const vinculado = transactions.filter(t => t.metaId === g.id);
      const saldo = vinculado.reduce((acc, t) => {
        if (t.tipo === 'saida') return acc - t.valor;
        return acc + t.valor;
      }, 0);

      const progressoPct = g.metaFinal > 0 ? Math.min((saldo / g.metaFinal) * 100, 100) : (saldo > 0 ? 100 : 0);
      
      return { ...g, saldo, progressoPct };
    });
  }, [goals, transactions]);

  const handleAporte = (goal) => {
    onAddTransaction({
      tipo: 'investimento',
      metaId: goal.id,
      descricao: `Aporte: ${goal.nome}`,
      categoria: getAutoCategory('investimento') || 'liberdade',
    });
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 90 }}>
      <div style={{ padding: '20px 20px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Metas e Caixinhas</h1>
          {activeTab === 'caixinhas' && !formOpen && (
            <button onClick={() => setFormOpen(true)} style={{
              background: 'var(--investimento)', color: '#fff', border: 'none',
              borderRadius: 12, padding: '8px 12px', fontSize: 13, fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer'
            }}>
              <Plus size={16} /> Nova Meta
            </button>
          )}
        </div>

        {/* Seletor de Abas Segmentado de Alta Fidelidade */}
        <div style={{ display: 'flex', background: 'var(--bg-surface)', borderRadius: 12, padding: 4, marginBottom: 20, border: '1px solid var(--border)' }}>
          <button 
            type="button"
            onClick={() => setActiveTab('caixinhas')} 
            style={{
              flex: 1, padding: '10px 5px', borderRadius: 8, fontSize: 12, fontWeight: 600, border: 'none',
              background: activeTab === 'caixinhas' ? 'var(--bg-card)' : 'transparent',
              color: activeTab === 'caixinhas' ? 'var(--text-primary)' : 'var(--text-secondary)',
              transition: 'all 0.2s', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4
            }}
          >
            📦 Caixinhas
          </button>
          <button 
            type="button"
            onClick={() => setActiveTab('penseComCalma')} 
            style={{
              flex: 1, padding: '10px 5px', borderRadius: 8, fontSize: 12, fontWeight: 600, border: 'none',
              background: activeTab === 'penseComCalma' ? 'var(--bg-card)' : 'transparent',
              color: activeTab === 'penseComCalma' ? 'var(--text-primary)' : 'var(--text-secondary)',
              transition: 'all 0.2s', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4
            }}
          >
            ⏳ Pense com Calma
          </button>
          <button 
            type="button"
            onClick={() => setActiveTab('simulador')} 
            style={{
              flex: 1, padding: '10px 5px', borderRadius: 8, fontSize: 12, fontWeight: 600, border: 'none',
              background: activeTab === 'simulador' ? 'var(--bg-card)' : 'transparent',
              color: activeTab === 'simulador' ? 'var(--text-primary)' : 'var(--text-secondary)',
              transition: 'all 0.2s', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4
            }}
          >
            🛍️ Simular Compras
          </button>
        </div>

        {activeTab === 'caixinhas' && (
          <>
            {formOpen && (
              <form onSubmit={handleSubmit} style={{
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: 16, padding: '16px', marginBottom: 20,
              }}>
                <h4 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 600 }}>
                  {editingId ? 'Editar Meta' : 'Nova Meta'}
                </h4>
                
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>Qual é o seu objetivo?</label>
                  <input type="text" placeholder="Ex: Viagem, Carro, Reserva..." value={nome} onChange={e => setNome(e.target.value)} required />
                </div>

                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>Cor de identificação</label>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {COLOR_OPTIONS.map(c => (
                      <button
                        key={c} type="button" onClick={() => setCor(c)}
                        style={{
                          width: 28, height: 28, borderRadius: 14, background: c,
                          border: cor === c ? '2px solid #fff' : '2px solid transparent',
                          boxShadow: cor === c ? `0 0 0 2px ${c}` : 'none'
                        }}
                      />
                    ))}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>Valor Alvo (Opcional)</label>
                    <input 
                      type="text" inputMode="decimal" placeholder="0,00" 
                      value={metaFinal} 
                      onChange={e => setMetaFinal(formatBRLInput(e.target.value))}
                      onBlur={e => setMetaFinal(normalizeBRLInput(e.target.value).toString().replace('.', ','))}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>Data Limite (Opcional)</label>
                    <input type="date" value={dataAlvo} onChange={e => setDataAlvo(e.target.value)} style={{ colorScheme: 'dark' }} />
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                  <input 
                    type="checkbox" 
                    id="isIndependencia" 
                    checked={isIndependencia} 
                    onChange={e => setIsIndependencia(e.target.checked)} 
                    style={{ width: 18, height: 18, accentColor: 'var(--primary)' }}
                  />
                  <label htmlFor="isIndependencia" style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', cursor: 'pointer' }}>
                    💎 Esta caixinha é de Independência Financeira
                  </label>
                </div>

                {isIndependencia && (
                  <div style={{
                    background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)',
                    borderRadius: 12, padding: '12px', marginBottom: 16
                  }}>
                    <div style={{ marginBottom: 10 }}>
                      <label style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>Tipo de Ativo</label>
                      <select value={tipoAtivo} onChange={e => {
                        setTipoAtivo(e.target.value);
                        if (e.target.value === 'poupança') setTaxaRendimento('6,17');
                        else if (e.target.value === 'cdb') setTaxaRendimento('10,75');
                        else if (e.target.value === 'lci') setTaxaRendimento('9,0');
                        else if (e.target.value === 'acoes') setTaxaRendimento('12,0');
                      }}>
                        <option value="poupança">Poupança (Isento IR)</option>
                        <option value="cdb">CDB / Tesouro Selic (Tabela Regressiva)</option>
                        <option value="lci">LCI / LCA (Isento IR)</option>
                        <option value="acoes">Ações / FIIs (Renda Variável)</option>
                      </select>
                    </div>

                    <div style={{ display: 'flex', gap: 10 }}>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>Rend. Esperado (% a.a.)</label>
                        <input 
                          type="text" inputMode="decimal" placeholder="0,00" 
                          value={taxaRendimento} 
                          onChange={e => setTaxaRendimento(formatBRLInput(e.target.value))}
                        />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>Aporte Mensal (R$)</label>
                        <input 
                          type="text" inputMode="decimal" placeholder="0,00" 
                          value={aporteMensal} 
                          onChange={e => setAporteMensal(formatBRLInput(e.target.value))}
                        />
                      </div>
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={resetForm} style={{ flex: 1, padding: '12px', borderRadius: 10, fontSize: 13, fontWeight: 500, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                    Cancelar
                  </button>
                  <button type="submit" style={{ flex: 1, padding: '12px', borderRadius: 10, fontSize: 13, fontWeight: 600, background: 'var(--investimento)', color: '#fff', border: 'none' }}>
                    Salvar Meta
                  </button>
                </div>
              </form>
            )}

            {goalsWithProgress.length === 0 && !formOpen ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', background: 'var(--bg-card)', borderRadius: 16, border: '1px dashed var(--border)' }}>
                <Target size={32} color="var(--text-muted)" style={{ marginBottom: 12 }} />
                <p style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>Nenhuma meta criada</p>
                <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  Crie "caixinhas" para organizar seus investimentos. Pode ser uma reserva de emergência, uma viagem ou um carro novo.
                </p>
                <button onClick={() => setFormOpen(true)} style={{ background: 'var(--investimento)', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 12, fontSize: 14, fontWeight: 600 }}>
                  Criar primeira meta
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {goalsWithProgress.map(g => (
                  <div key={g.id} style={{
                    background: 'var(--bg-card)', border: '1px solid var(--border)',
                    borderRadius: 16, overflow: 'hidden'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', padding: '16px 16px 12px', position: 'relative' }}>
                      <div style={{ position: 'absolute', top: 0, left: 0, width: 4, height: '100%', background: g.cor || COLOR_OPTIONS[0] }} />
                      
                      <div style={{ flex: 1, paddingLeft: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                          <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>{g.nome} {g.isIndependencia && <span style={{ fontSize: 13 }} title="Caixinha de Independência Financeira">💎</span>}</p>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button onClick={() => handleEdit(g)} style={{ background: 'none', padding: 4, color: 'var(--text-muted)' }}><Pencil size={14} /></button>
                            <button onClick={() => { if(window.confirm('Remover esta meta? O dinheiro não será perdido do saldo geral.')) onRemoveGoal(g.id); }} style={{ background: 'none', padding: 4, color: 'var(--saida)' }}><Trash2 size={14} /></button>
                          </div>
                        </div>
                        
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                          <span style={{ fontSize: 20, fontWeight: 700, color: g.cor || COLOR_OPTIONS[0] }}>
                            {formatBRL(g.saldo)}
                          </span>
                          {g.metaFinal > 0 && (
                            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                              de {formatBRL(g.metaFinal)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {g.metaFinal > 0 && (
                      <div style={{ padding: '0 16px', marginBottom: 12 }}>
                        <div style={{ height: 6, background: 'var(--bg-surface)', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${g.progressoPct}%`, background: g.cor || COLOR_OPTIONS[0], borderRadius: 3, transition: 'width 0.5s' }} />
                        </div>
                        <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--text-secondary)', textAlign: 'right' }}>
                          {g.progressoPct.toFixed(1)}% concluído
                        </p>
                      </div>
                    )}

                    <div style={{ padding: '0 16px 16px' }}>
                      <button onClick={() => handleAporte(g)} style={{
                        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                        padding: '10px', borderRadius: 10, fontSize: 13, fontWeight: 600,
                        background: `rgba(${parseInt((g.cor || COLOR_OPTIONS[0]).slice(1,3),16)},${parseInt((g.cor || COLOR_OPTIONS[0]).slice(3,5),16)},${parseInt((g.cor || COLOR_OPTIONS[0]).slice(5,7),16)}, 0.1)`,
                        color: g.cor || COLOR_OPTIONS[0], border: 'none'
                      }}>
                        <TrendingUp size={16} /> Fazer Aporte
                      </button>
                    </div>

                    {g.isIndependencia && metaMensal > 0 && (
                      <div style={{ padding: '0 16px 10px' }}>
                        <div style={{
                          background: 'var(--bg-surface)', borderRadius: 12, padding: '12px 14px',
                          border: '1px solid var(--border)',
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
                              💎 Poupança mensal
                            </span>
                            <span style={{ fontSize: 12, fontWeight: 700, color: investidoMes >= metaMensal ? 'var(--entrada)' : 'var(--text-primary)' }}>
                              {formatBRL(investidoMes)} / {formatBRL(metaMensal)}
                            </span>
                          </div>
                          <div style={{ height: 6, background: 'var(--bg-card)', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{
                              height: '100%', borderRadius: 3, transition: 'width 0.5s',
                              width: `${Math.min(100, metaMensal > 0 ? (investidoMes / metaMensal) * 100 : 0)}%`,
                              background: investidoMes >= metaMensal ? '#10b981' : 'var(--investimento)',
                            }} />
                          </div>
                          <p style={{ margin: '4px 0 0', fontSize: 11, color: investidoMes >= metaMensal ? 'var(--entrada)' : 'var(--text-muted)', textAlign: 'right' }}>
                            {investidoMes >= metaMensal
                              ? '✅ Meta atingida este mês!'
                              : `Faltam ${formatBRL(metaMensal - investidoMes)}`}
                          </p>
                        </div>
                      </div>
                    )}

                    {g.isIndependencia && (
                      <div style={{ padding: '0 16px 16px' }}>
                        <button
                          onClick={() => setExpandedSimId(expandedSimId === g.id ? null : g.id)}
                          style={{
                            width: '100%', padding: '8px', borderRadius: 10, fontSize: 12, fontWeight: 600,
                            background: 'var(--bg-surface)', border: '1px solid var(--border)',
                            color: 'var(--text-primary)', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
                          }}
                        >
                          <span>💎 {expandedSimId === g.id ? 'Fechar Simulador' : 'Simulador Viver de Renda'}</span>
                        </button>

                        {expandedSimId === g.id && (
                          <div style={{
                            marginTop: 12, background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border)',
                            borderRadius: 12, padding: '12px', textAlign: 'left'
                          }}>
                            {(() => {
                              const taxaAnual = g.taxaRendimento || 10.75;
                              const taxaMensal = Math.pow(1 + (taxaAnual / 100), 1/12) - 1;
                              const aporte = g.aporteMensal || 0;
                              const saldoAtual = g.saldo || 0;
                              const meta = g.metaFinal || 500000;

                              let meses = 0;
                              let saldoProj = saldoAtual;
                              while (saldoProj < meta && meses < 600) {
                                meses++;
                                saldoProj = saldoProj * (1 + taxaMensal) + aporte;
                              }

                              const anos = Math.floor(meses / 12);
                              const mesesResto = meses % 12;
                              const rendimentoMensalEstimado = saldoAtual * taxaMensal;

                              let dicaTributaria = '';
                              if (g.tipoAtivo === 'poupança') {
                                dicaTributaria = 'Isento de Imposto de Renda (IR). Porém, a poupança rende pouco e costuma perder para a inflação real. Considere títulos Selic ou CDBs.';
                              } else if (g.tipoAtivo === 'cdb') {
                                dicaTributaria = 'Tributado pela tabela regressiva de IR (de 22,5% a 15% de acordo com o prazo). Evite resgates rápidos para poupar imposto e fugir do IOF.';
                              } else if (g.tipoAtivo === 'lci') {
                                dicaTributaria = 'Isento de Imposto de Renda para pessoas físicas. Excelente opção de renda fixa de médio prazo (carência mínima de 90 dias).';
                              } else if (g.tipoAtivo === 'acoes') {
                                dicaTributaria = 'Renda Variável. Rendimentos de FIIs são isentos de IR. Venda de ações é isenta até R$ 20 mil/mês. Atenção: possui oscilações e riscos do mercado.';
                              }

                              return (
                                <div>
                                  <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                                    Projeção de Independência
                                  </p>
                                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                                    <div style={{ background: 'var(--bg-surface)', padding: '8px', borderRadius: 8 }}>
                                      <span style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block' }}>Rend. Mensal Atual</span>
                                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--entrada)' }}>{formatBRL(rendimentoMensalEstimado)}</span>
                                    </div>
                                    <div style={{ background: 'var(--bg-surface)', padding: '8px', borderRadius: 8 }}>
                                      <span style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block' }}>Tempo Estimado</span>
                                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary)' }}>
                                        {meses >= 600 ? 'Mais de 50 anos' : `${anos}a ${mesesResto}m`}
                                      </span>
                                    </div>
                                  </div>

                                  <div style={{ background: 'rgba(99,102,241,0.06)', border: '1px dashed rgba(99,102,241,0.3)', borderRadius: 10, padding: '10px', fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                                    <strong style={{ color: 'var(--text-primary)', display: 'block', marginBottom: 4 }}>💡 Lembrete de Impostos & Ativos:</strong>
                                    {dicaTributaria}
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === 'penseComCalma' && (
          <div>
            {/* Placar de Economia Acumulada */}
            <div style={{
              background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.08), rgba(59, 130, 246, 0.08))',
              border: '1px solid var(--border)',
              borderRadius: 16, padding: '16px', marginBottom: 20, textAlign: 'center',
              boxShadow: '0 4px 20px rgba(0,0,0,0.05)'
            }}>
              <span style={{ fontSize: 11, color: '#10b981', fontWeight: 700, display: 'block', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 4 }}>
                🏆 Economia Acumulada
              </span>
              <span style={{ fontSize: 32, fontWeight: 800, color: 'var(--text-primary)' }}>
                {formatBRL(economiaAcumulada)}
              </span>
              <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
                Dinheiro poupado ao resistir a impulsos de consumo!
              </p>
            </div>

            {/* Cabeçalho da Seção */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>Lista de Reflexão</h2>
              {!penseFormOpen && (
                <button onClick={() => setPenseFormOpen(true)} style={{
                  background: 'var(--primary)', color: '#fff', border: 'none',
                  borderRadius: 12, padding: '8px 12px', fontSize: 12, fontWeight: 600,
                  display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer'
                }}>
                  <Plus size={14} /> Novo Item
                </button>
              )}
            </div>

            {/* Formulário de Novo Desejo */}
            {penseFormOpen && (
              <form onSubmit={handleAddImpulseItem} style={{
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: 16, padding: '16px', marginBottom: 20,
              }}>
                <h4 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 700 }}>
                  🧘‍♂️ Adicionar Desejo para Reflexão
                </h4>
                
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>O que você deseja comprar?</label>
                  <input type="text" placeholder="Ex: Novo Smartphone, Tênis de Corrida..." value={nomeDesejo} onChange={e => setNomeDesejo(e.target.value)} required />
                </div>

                <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>Preço Estimado</label>
                    <input 
                      type="text" inputMode="decimal" placeholder="0,00" 
                      value={precoDesejo} 
                      onChange={e => setPrecoDesejo(formatBRLInput(e.target.value))}
                      onBlur={e => setPrecoDesejo(normalizeBRLInput(e.target.value).toString().replace('.', ','))}
                      required
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>Categoria do Gasto</label>
                    <select value={categoriaDesejo} onChange={e => setCategoriaDesejo(e.target.value)} style={{ padding: '9px 12px', borderRadius: '10px' }}>
                      <option value="prazeres">🎉 Prazeres (Sem Culpa)</option>
                      <option value="conforto">⭐ Conforto (Qualidade de Vida)</option>
                      <option value="conhecimento">📚 Conhecimento</option>
                      <option value="custos_fixos">🏠 Custos Fixos</option>
                      <option value="metas">🎯 Metas</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={() => { setPenseFormOpen(false); setNomeDesejo(''); setPrecoDesejo(''); }} style={{ flex: 1, padding: '12px', borderRadius: 10, fontSize: 13, fontWeight: 500, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                    Cancelar
                  </button>
                  <button type="submit" style={{ flex: 1, padding: '12px', borderRadius: 10, fontSize: 13, fontWeight: 600, background: 'var(--primary)', color: '#fff', border: 'none' }}>
                    Iniciar Reflexão de 10 dias
                  </button>
                </div>
              </form>
            )}

            {/* Listagem de itens ou estado vazio */}
            {impulseItems.length === 0 && !penseFormOpen ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', background: 'var(--bg-card)', borderRadius: 16, border: '1px dashed var(--border)' }}>
                <span style={{ fontSize: 32, display: 'block', marginBottom: 12 }}>🧘‍♂️</span>
                <p style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Mente focada e orçamento seguro!</p>
                <p style={{ margin: '0 0 20px', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  Nenhum item sob reflexão no momento. Sempre que surgir aquele desejo impulsivo de compras não planejadas, adicione-o aqui para se dar tempo de refletir antes de gastar!
                </p>
                <button onClick={() => setPenseFormOpen(true)} style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 12, fontSize: 13, fontWeight: 600 }}>
                  Adicionar desejo para reflexão
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {impulseItems.map(item => {
                  const renda = config?.rendaMensal || 0;
                  const valorDiaTrabalho = renda > 0 ? (renda / 22) : 0;
                  const diasDeTrabalho = valorDiaTrabalho > 0 ? (item.preco / valorDiaTrabalho) : 0;

                  const budgetPcts = config?.budgetPcts || DEFAULT_BUDGET_PCTS;
                  const pctCategoria = budgetPcts[item.categoria] || PERCENTUAL_CATEGORIES[item.categoria]?.defaultPct || 10;
                  const budgetMensalCategoria = renda > 0 ? (renda * pctCategoria) / 100 : 0;
                  const pctDoOrcamento = budgetMensalCategoria > 0 ? (item.preco / budgetMensalCategoria) * 100 : 0;

                  const remainingText = getRemainingTime(item.createdAt);
                  const isExpired = remainingText === 'Concluído';

                  const catObj = PERCENTUAL_CATEGORIES[item.categoria] || {};

                  return (
                    <div key={item.id} style={{
                      background: 'var(--bg-card)', border: '1px solid var(--border)',
                      borderRadius: 16, padding: '16px', position: 'relative',
                      display: 'flex', flexDirection: 'column', gap: 12
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{
                          fontSize: 10, padding: '3px 8px', borderRadius: 20,
                          background: catObj.bg || 'rgba(255,255,255,0.05)',
                          color: catObj.color || 'var(--text-secondary)',
                          fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4
                        }}>
                          {catObj.icon} {catObj.label}
                        </span>
                        <span style={{
                          fontSize: 10, fontWeight: 700,
                          color: isExpired ? '#10b981' : 'var(--saida)',
                          background: isExpired ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                          padding: '3px 8px', borderRadius: 8
                        }}>
                          ⏳ {isExpired ? 'Reflexão Concluída' : `Refletir por: ${remainingText}`}
                        </span>
                      </div>

                      <div>
                        <h3 style={{ margin: '0 0 2px', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{item.nome}</h3>
                        <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)' }}>{formatBRL(item.preco)}</span>
                      </div>

                      <div style={{
                        background: 'var(--bg-surface)', borderRadius: 12, padding: '10px',
                        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, border: '1px solid var(--border)'
                      }}>
                        <div>
                          <span style={{ fontSize: 9, color: 'var(--text-secondary)', display: 'block', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.3px', marginBottom: 2 }}>Custo em Trabalho</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
                            {renda > 0 ? `${diasDeTrabalho.toFixed(1)} dias inteiros` : 'Defina sua renda'}
                          </span>
                        </div>
                        <div>
                          <span style={{ fontSize: 9, color: 'var(--text-secondary)', display: 'block', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.3px', marginBottom: 2 }}>% do Orçamento</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
                            {renda > 0 ? `${pctDoOrcamento.toFixed(1)}% da categoria` : 'Defina sua renda'}
                          </span>
                        </div>
                      </div>

                      <div style={{
                        fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.4,
                        background: 'rgba(59, 130, 246, 0.05)', border: '1px dashed rgba(59, 130, 246, 0.3)',
                        borderRadius: 10, padding: '10px'
                      }}>
                        🔍 <strong>Dica de Economia:</strong> Antes de decidir, faça uma busca detalhada na internet! Sites de comparação de preços e cupons podem poupar até 20% do valor do produto.
                      </div>

                      <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                        <button
                          type="button"
                          onClick={() => handleDesistir(item)}
                          style={{
                            flex: 1, padding: '10px', borderRadius: 10, border: 'none',
                            background: 'linear-gradient(135deg, #10b981, #059669)',
                            color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                            transition: 'opacity 0.2s', boxShadow: '0 2px 8px rgba(16,185,129,0.2)'
                          }}
                        >
                          😇 Desistir da Compra
                        </button>
                        <button
                          type="button"
                          onClick={() => handleConfirmar(item)}
                          style={{
                            flex: 1, padding: '10px', borderRadius: 10,
                            border: '1px solid var(--border)',
                            background: 'var(--bg-surface)',
                            color: 'var(--text-primary)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                            transition: 'background 0.2s'
                          }}
                        >
                          🛍️ Confirmar Compra
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'simulador' && (
          <div style={{ animation: 'fadeIn 0.2s ease-out' }}>
            {/* Presets Rápidos */}
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 12, marginBottom: 16, scrollbarWidth: 'none' }}>
              <button
                type="button"
                onClick={handlePresetImovelPronto}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 10,
                  background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.2)',
                  color: 'var(--primary)', fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0
                }}
              >
                <Building size={14} /> Imóvel Pronto (SBPE)
              </button>
              <button
                type="button"
                onClick={handlePresetImovelPlanta}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 10,
                  background: 'rgba(139, 92, 246, 0.08)', border: '1px solid rgba(139, 92, 246, 0.2)',
                  color: '#8b5cf6', fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0
                }}
              >
                <Sparkles size={14} /> Imóvel na Planta (INCC)
              </button>
              <button
                type="button"
                onClick={handlePresetVeiculo}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 10,
                  background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.2)',
                  color: 'var(--conforto)', fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0
                }}
              >
                <Car size={14} /> Veículo (Tabela Price)
              </button>
            </div>

            {/* Painel do Formulário */}
            <div style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: 16, padding: '16px', marginBottom: 20
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyIntent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: 10, marginBottom: 14 }}>
                <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>⚙️ Parâmetros da Simulação</h4>
                
                {/* Cenário de Médias */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Média:</span>
                  <select
                    value={simCenarioPeriodo}
                    onChange={e => handleCenarioPeriodoChange(e.target.value)}
                    style={{ fontSize: 11, height: 26, padding: '0 4px', borderRadius: 6, background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                  >
                    <option value="1">1 ano (2025)</option>
                    <option value="3">3 anos (2023-2025)</option>
                    <option value="5">5 anos (2021-2025)</option>
                  </select>
                </div>
              </div>

              {/* Form Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
                
                {/* Coluna 1: Entrada e Compra */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <h5 style={{ margin: 0, fontSize: 12, fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Dados do Imóvel/Compra</h5>
                  
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>Valor Total do Bem (R$)</label>
                    <input
                      type="text" inputMode="decimal" placeholder="0,00"
                      value={simValorCompra}
                      onChange={e => setSimValorCompra(formatBRLInput(e.target.value))}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>Valor da Entrada (R$)</label>
                    <input
                      type="text" inputMode="decimal" placeholder="0,00"
                      value={simValorEntrada}
                      onChange={e => setSimValorEntrada(formatBRLInput(e.target.value))}
                    />
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '6px 0' }}>
                    <input
                      type="checkbox" id="simEntradaParcelada"
                      checked={simEntradaParcelada}
                      onChange={e => setSimEntradaParcelada(e.target.checked)}
                      style={{ width: 16, height: 16, accentColor: 'var(--primary)' }}
                    />
                    <label htmlFor="simEntradaParcelada" style={{ fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Entrada Parcelada (Obras)</label>
                  </div>

                  {simEntradaParcelada && (
                    <div style={{ padding: 10, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div>
                        <label style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 3, display: 'block' }}>Prazo da Entrada (meses)</label>
                        <input
                          type="number" value={simPrazoEntrada}
                          onChange={e => setSimPrazoEntrada(e.target.value)}
                          style={{ height: 32, fontSize: 12 }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 3, display: 'block' }}>Indexador de Correção</label>
                        <select
                          value={simIndexadorEntrada}
                          onChange={e => handleIndexadorEntradaChange(e.target.value)}
                          style={{ height: 32, fontSize: 12, padding: '0 6px', background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)', borderRadius: 8 }}
                        >
                          <option value="none">Nenhum</option>
                          <option value="incc">INCC (Construção)</option>
                          <option value="ipca">IPCA (Inflação)</option>
                          <option value="tr">TR (Taxa Referencial)</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 3, display: 'block' }}>Taxa do Indexador (% a.a.)</label>
                        <input
                          type="text" inputMode="decimal"
                          value={simTaxaIndexadorEntrada}
                          onChange={e => setSimTaxaIndexadorEntrada(formatBRLInput(e.target.value))}
                          style={{ height: 32, fontSize: 12 }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Coluna 2: Financiamento */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <h5 style={{ margin: 0, fontSize: 12, fontWeight: 700, color: 'var(--investimento)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Dados do Financiamento</h5>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div>
                      <label style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>Prazo (meses)</label>
                      <input
                        type="number" value={simPrazoFinanciamento}
                        onChange={e => setSimPrazoFinanciamento(e.target.value)}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>Taxa Juros (% a.a.)</label>
                      <input
                        type="text" inputMode="decimal"
                        value={simTaxaJuros}
                        onChange={e => setSimTaxaJuros(formatBRLInput(e.target.value))}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div>
                      <label style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>Amortização</label>
                      <select
                        value={simAmortizacao}
                        onChange={e => setSimAmortizacao(e.target.value)}
                        style={{ height: 38, padding: '0 8px', background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)', borderRadius: 10 }}
                      >
                        <option value="sac">SAC (Decrescente)</option>
                        <option value="price">Price (Constante)</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>Indexador</label>
                      <select
                        value={simIndexadorFinanc}
                        onChange={e => handleIndexadorFinancChange(e.target.value)}
                        style={{ height: 38, padding: '0 8px', background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)', borderRadius: 10 }}
                      >
                        <option value="none">Nenhum</option>
                        <option value="tr">TR</option>
                        <option value="incc">INCC</option>
                        <option value="ipca">IPCA</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div>
                      <label style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>Taxa Indexador (% a.a.)</label>
                      <input
                        type="text" inputMode="decimal"
                        value={simTaxaIndexadorFinanc}
                        onChange={e => setSimTaxaIndexadorFinanc(formatBRLInput(e.target.value))}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>Taxas Extras (Seg/Adm)</label>
                      <input
                        type="text" inputMode="decimal"
                        value={simTaxasExtras}
                        onChange={e => setSimTaxasExtras(formatBRLInput(e.target.value))}
                      />
                    </div>
                  </div>

                  {simEntradaParcelada && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '6px 0' }}>
                      <input
                        type="checkbox" id="simComecarAposEntrada"
                        checked={simComecarAposEntrada}
                        onChange={e => setSimComecarAposEntrada(e.target.checked)}
                        style={{ width: 16, height: 16, accentColor: 'var(--primary)' }}
                      />
                      <label htmlFor="simComecarAposEntrada" style={{ fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Financiamento após Entrada</label>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Painel de Resultados Consolidados */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 16 }}>
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 12, textAlign: 'center' }}>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>Financiado</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{formatBRL(simResultados.vFinanciado)}</span>
              </div>
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 12, textAlign: 'center' }}>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>Total da Entrada</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--primary)' }}>{formatBRL(simResultados.custoTotalEntrada)}</span>
              </div>
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 12, textAlign: 'center' }}>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>Prestação 1 (Financ.)</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--saida)' }}>{formatBRL(simResultados.prestacaoInicialFinanc)}</span>
              </div>
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 12, textAlign: 'center' }}>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>Custo Final Pago</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{formatBRL(simResultados.totalPagoFinal)}</span>
              </div>
            </div>

            {/* Indicador de Compromisso Orçamentário e Diagnóstico */}
            <div style={{
              background: simResultados.comprometimentoRendaPct > 30 ? 'rgba(239, 68, 68, 0.06)' : 'rgba(16, 185, 129, 0.06)',
              border: `1px solid ${simResultados.comprometimentoRendaPct > 30 ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)'}`,
              borderRadius: 14, padding: '14px', marginBottom: 20
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <HelpCircle size={18} color={simResultados.comprometimentoRendaPct > 30 ? 'var(--saida)' : 'var(--entrada)'} style={{ marginTop: 2, flexShrink: 0 }} />
                <div>
                  <h5 style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 700 }}>Análise de Fluxo de Caixa</h5>
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    Sua renda mensal é de <strong>{formatBRL(config?.rendaMensal || 0)}</strong>. A despesa média recente identificada das suas transações é de <strong>{formatBRL(simResultados.despesaMediaMensal)}</strong>, o que deixa uma sobra disponível de <strong>{formatBRL(simResultados.sobraBaseline)}</strong>/mês.
                  </p>
                  <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--text-primary)', fontWeight: 600 }}>
                    🚨 Prestação do financiamento compromete {simResultados.comprometimentoRendaPct.toFixed(1)}% da sua renda mensal.
                    {simResultados.comprometimentoRendaPct > 30 && ' Recomenda-se comprometer no máximo 30% da renda mensal para evitar endividamento excessivo.'}
                  </p>
                  {simResultados.sobraBaseline - simResultados.prestacaoInicialFinanc < 0 && (
                    <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--saida)', fontWeight: 700 }}>
                      ⚠️ ATENÇÃO: A prestação excede sua sobra de caixa atual! Isso causará um déficit mensal de {formatBRL(Math.abs(simResultados.sobraBaseline - simResultados.prestacaoInicialFinanc))} no seu fluxo de caixa mensal.
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Tabela do Fluxo de Caixa Futuro */}
            <h5 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700 }}>📈 Projeção do Fluxo de Caixa (Próximos 24 Meses)</h5>
            <div style={{ overflowX: 'auto', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '10px 12px', color: 'var(--text-muted)' }}>Mês</th>
                    <th style={{ padding: '10px 12px', color: 'var(--text-muted)' }}>Parcela Entrada</th>
                    <th style={{ padding: '10px 12px', color: 'var(--text-muted)' }}>Parcela Financ.</th>
                    <th style={{ padding: '10px 12px', color: 'var(--text-muted)' }}>Sobra Líquida</th>
                    <th style={{ padding: '10px 12px', color: 'var(--text-muted)' }}>Saldo Acumulado</th>
                  </tr>
                </thead>
                <tbody>
                  {simResultados.timeline.map(t => (
                    <tr key={t.mes} style={{ borderBottom: '1px solid var(--border)', height: 38 }}>
                      <td style={{ padding: '8px 12px', fontWeight: 600 }}>{t.mes}º ({t.dataLabel})</td>
                      <td style={{ padding: '8px 12px', color: t.parcelaEntrada > 0 ? 'var(--primary)' : 'var(--text-muted)' }}>
                        {t.parcelaEntrada > 0 ? formatBRL(t.parcelaEntrada) : '-'}
                      </td>
                      <td style={{ padding: '8px 12px', color: t.parcelaFinanc > 0 ? 'var(--saida)' : 'var(--text-muted)' }}>
                        {t.parcelaFinanc > 0 ? formatBRL(t.parcelaFinanc) : '-'}
                      </td>
                      <td style={{ padding: '8px 12px', color: t.sobraLiquida >= 0 ? 'var(--entrada)' : 'var(--saida)', fontWeight: 600 }}>
                        {formatBRL(t.sobraLiquida)}
                      </td>
                      <td style={{ padding: '8px 12px', color: t.saldoAcumulado >= 0 ? 'var(--entrada)' : 'var(--saida)', fontWeight: 700 }}>
                        {formatBRL(t.saldoAcumulado)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {confettiParticles.length > 0 && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
          pointerEvents: 'none', zIndex: 9999, overflow: 'hidden'
        }}>
          {confettiParticles.map(p => (
            <div
              key={p.id}
              style={{
                position: 'absolute',
                left: `${p.x}%`,
                top: `${p.y}%`,
                fontSize: `${20 * p.scale}px`,
                transform: `rotate(${p.angle}deg)`,
                animation: `fall ${p.duration}s linear ${p.delay}s forwards`,
              }}
            >
              {p.emoji}
            </div>
          ))}
          <style>{`
            @keyframes fall {
              0% {
                top: -10%;
                transform: translateY(0) rotate(0deg);
                opacity: 1;
              }
              100% {
                top: 110%;
                transform: translateY(100vh) rotate(720deg);
                opacity: 0;
              }
            }
          `}</style>
        </div>
      )}
    </div>
  );
}
