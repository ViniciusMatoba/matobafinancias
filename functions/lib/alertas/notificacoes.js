'use strict';

const { calcFaturaCardApp, calcSaldoSimples, cartaoComFaturaRealNoMes, expandRange } = require('../motor/caixa');
const { reservaDaCaixinhaBot } = require('../motor/caixinha');
const { linhaProjecaoReserva, projecaoReservaBot, ritmoDaReservaBot } = require('../motor/reservaRitmo');
const { CATEGORY_ORDER, collectMonthExpenses, computeSpentByCategory, expandDespesasBot, getTopExpensesForCategory } = require('../motor/competencia');
const { SOBRA_MINIMA_BOT, calcSobraSeguraBot } = require('../motor/sobra');
const { addOneMonthClamped, dateStrFromDate, getNowBrasilia } = require('../util/datas');
const { barra, formatBRL, mdEscape } = require('../util/formato');

// ─── Verificações de notificação (N1-N17) ───────────────────────────────────
function checkNotifications(cards, transactions, config, prefs, goals = [], walletInitials = 0) {
  const msgs  = [];
  const tipos = prefs?.tipos ?? {};
  const hoje  = getNowBrasilia();
  const day   = hoje.getDate();
  const weekday = hoje.getDay(); // 0=Dom 1=Seg
  const currentMonth = `${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}`;
  const todayStr     = dateStrFromDate(hoje);

  // N1 — Fatura vence hoje
  if (tipos.n1 !== false) {
    for (const card of cards) {
      if (card.diaVencimento === day) {
        // Vence HOJE: a data do botão é hoje (e não o "próximo ciclo" pela regra de fechamento)
        const realTx = transactions.find(
          t => t.tipo === 'cartao' && t.cartaoId === card.id && t.dataInicio === todayStr && !t.conferido
        );
        msgs.push({
          text: `💳 *Fatura vence hoje!*\n${card.nome} — não esqueça de efetuar o pagamento.`,
          txId: realTx ? realTx.id : `virtual:${card.id}`,
          occDate: todayStr
        });
      }
    }
  }

  // N2 — Fatura vence em X dias (suporta múltiplos prazos configurados)
  if (tipos.n2 !== false) {
    const raw = prefs.diasAntecedenciaVencimento;
    const diasArr = Array.isArray(raw) ? raw : [raw || 3];
    for (const diasAviso of diasArr) {
      const dX = new Date(hoje); dX.setDate(dX.getDate() + diasAviso);
      for (const card of cards) {
        if (card.diaVencimento === dX.getDate()) {
          // A data do botão é a do vencimento que o aviso anuncia (hoje + X dias)
          const proximoVenc = dateStrFromDate(dX);
          const realTx = transactions.find(
            t => t.tipo === 'cartao' && t.cartaoId === card.id && t.dataInicio === proximoVenc && !t.conferido
          );
          msgs.push({
            text: `📅 *Fatura em ${diasAviso} dia${diasAviso > 1 ? 's' : ''}*\n${card.nome} vence no dia *${card.diaVencimento}*.`,
            txId: realTx ? realTx.id : `virtual:${card.id}`,
            occDate: proximoVenc
          });
        }
      }
    }
  }

  // N3 — Fatura fecha em 2 dias
  if (tipos.n3 !== false) {
    const d2 = new Date(hoje); d2.setDate(d2.getDate() + 2);
    for (const card of cards) {
      if (card.diaFechamento === d2.getDate()) {
        msgs.push(`⏰ *Fatura fecha em 2 dias*\n${card.nome} — últimos dias para compras nesta fatura!`);
      }
    }
  }

  // N4/N5 — Orçamento
  if (tipos.n4 !== false || tipos.n5 !== false) {
    const rendaMensal = config?.rendaMensal || 0;
    const budgetPcts  = config?.budgetPcts  || {};
    if (rendaMensal > 0) {
      const spent = computeSpentByCategory(transactions, currentMonth);
      const LABELS = {
        liberdade: 'Liberdade Financeira', custos_fixos: 'Custos Fixos',
        conforto: 'Conforto', metas: 'Metas', prazeres: 'Prazeres', conhecimento: 'Conhecimento',
      };
      for (const catId of CATEGORY_ORDER) {
        const budget = (rendaMensal * (Number(budgetPcts[catId]) || 0)) / 100;
        if (budget <= 0) continue;
        const s   = spent[catId] || 0;
        const pct = (s / budget) * 100;
        // Liberdade Financeira é meta de INVESTIR (passar de 100% é bom), não gasto a conter
        const ehMeta = catId === 'liberdade';
        // Só reavisa quando muda de faixa (10 em 10 pontos), não todo dia com o mesmo valor
        const faixa  = Math.floor(pct / 10);
        const chave  = `orc:${currentMonth}:${catId}`;
        if (tipos.n5 !== false && pct > 100) {
          if (ehMeta) {
            msgs.push({
              text: `🎉 *Meta de ${LABELS[catId]} superada!*\nVocê investiu ${formatBRL(s)} este mês — ${formatBRL(s - budget)} acima da meta de ${formatBRL(budget)}.`,
              estado: { chave, sig: 'meta-superada' },
            });
          } else {
            const top = getTopExpensesForCategory(transactions, catId, currentMonth);
            const topStr = top ? `\nPrincipais gastos: _${top}_.` : '';
            msgs.push({
              text: `🚨 *${LABELS[catId]} estourou!*\nGasto ${formatBRL(s)} de ${formatBRL(budget)} — excedeu em *${formatBRL(s - budget)}*.${topStr}`,
              estado: { chave, sig: `5:${faixa}` },
            });
          }
        } else if (tipos.n4 !== false && pct >= 80 && pct <= 100) {
          if (ehMeta) {
            msgs.push({
              text: `🎯 *Meta de ${LABELS[catId]} em ${Math.round(pct)}%*\n${formatBRL(s)} de ${formatBRL(budget)} investidos este mês.`,
              estado: { chave, sig: 'meta-80' },
            });
          } else {
            const top = getTopExpensesForCategory(transactions, catId, currentMonth);
            const topStr = top ? `\nPrincipais gastos: _${top}_.` : '';
            msgs.push({
              text: `⚠️ *${LABELS[catId]} em ${Math.round(pct)}%*\n${formatBRL(s)} de ${formatBRL(budget)} utilizados este mês.${topStr}`,
              estado: { chave, sig: `4:${faixa}` },
            });
          }
        }
      }
    }
  }

  // N6 — Saldo negativo (atual ou projetado em 7 dias)
  if (tipos.n6 !== false) {
    const saldoAtual = calcSaldoSimples(transactions, todayStr, walletInitials);
    const d7 = new Date(hoje); d7.setDate(d7.getDate() + 7);
    const in7 = dateStrFromDate(d7);
    const saldoProjetado = calcSaldoSimples(transactions, in7, walletInitials);
    // Urgente: reavisa se a situação mudar, ou a cada 3 dias enquanto continuar
    if (saldoAtual < 0) {
      msgs.push({
        text: `🚨 *Saldo atual negativo!*\nSeu saldo está em *${formatBRL(saldoAtual)}* agora. Revise seus lançamentos e evite novos gastos até regularizar.`,
        estado: { chave: 'saldo-negativo', sig: `atual:${Math.round(saldoAtual / 100)}`, repetirDias: 3 },
      });
    } else if (saldoProjetado < 0) {
      msgs.push({
        text: `📉 *Alerta: saldo pode ficar negativo!*\nSaldo atual ${formatBRL(saldoAtual)} · Projeção *${formatBRL(saldoProjetado)}* em 7 dias.`,
        estado: { chave: 'saldo-negativo', sig: `proj:${Math.round(saldoProjetado / 100)}`, repetirDias: 3 },
      });
    }
  }

  // N7 — Resumo semanal + projeção até fim do mês
  const rawDiaSem = prefs.diaSemanaResumo;
  const diasSemArr = Array.isArray(rawDiaSem) ? rawDiaSem : [rawDiaSem ?? 1];
  if (tipos.n7 !== false && diasSemArr.includes(weekday)) {
    const d7ago = new Date(hoje); d7ago.setDate(d7ago.getDate() - 7);
    const fromStr7 = dateStrFromDate(d7ago);
    const comFaturaReal7 = cartaoComFaturaRealNoMes(transactions, fromStr7, todayStr);
    const occs7 = expandRange(transactions, fromStr7, todayStr, { historical: true });
    let entradas = 0, saidas = 0;
    for (const o of occs7) {
      if (o.tx?.id?.includes('-proj-') && comFaturaReal7.has(o.tx?.cartaoId)) continue;
      if (o.tipo === 'entrada') entradas += o.valor;
      else saidas += o.valor;
    }

    // Projeção até fim do mês
    const lastDay = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
    const endOfMonthStr = dateStrFromDate(lastDay);
    const saldoAtualN7 = calcSaldoSimples(transactions, todayStr, walletInitials);
    const saldoFimMes  = calcSaldoSimples(transactions, endOfMonthStr, walletInitials);
    const diasRestantes = lastDay.getDate() - hoje.getDate();

    const nomeMesN7 = hoje.toLocaleString('pt-BR', { month: 'long', timeZone: 'America/Sao_Paulo' });
    let msgN7 = `📊 *Resumo Semanal*\n\n`;
    msgN7 += `✅ Entradas: ${formatBRL(entradas)}\n`;
    msgN7 += `❌ Saiu do caixa: ${formatBRL(saidas)}\n`;
    msgN7 += `💰 Saldo do caixa na semana: *${formatBRL(entradas - saidas)}*\n\n`;
    msgN7 += `📅 *Projeção até fim de ${nomeMesN7.charAt(0).toUpperCase() + nomeMesN7.slice(1)}*\n`;
    msgN7 += `Saldo atual: ${formatBRL(saldoAtualN7)}\n`;
    msgN7 += `Saldo projetado (${endOfMonthStr.slice(8)}/${endOfMonthStr.slice(5,7)}): *${formatBRL(saldoFimMes)}*\n`;
    if (diasRestantes > 0 && saldoFimMes > 0) {
      const gastoPorDia = saldoFimMes / diasRestantes;
      msgN7 += `💡 Pode gastar até *${formatBRL(gastoPorDia)}/dia* com os ${diasRestantes} dias restantes.`;
    } else if (saldoFimMes < 0) {
      msgN7 += `⚠️ _Projeção indica saldo negativo no fim do mês. Revise os gastos._`;
    }
    msgs.push(msgN7.trim());
  }

  // N8 — Resumo diário matinal (dias configuráveis: todos / uteis / fds)
  if (tipos.n8 !== false) {
    const diasDiario = prefs.diasResumoDiario || 'todos';
    const enviarN8 =
      diasDiario === 'todos' ||
      (diasDiario === 'uteis' && weekday >= 1 && weekday <= 5) ||
      (diasDiario === 'fds'   && (weekday === 0 || weekday === 6));

    if (enviarN8) {
    const saldoAtual = calcSaldoSimples(transactions, todayStr, walletInitials);
    // Expande TODAS as ocorrências de hoje (unico, recorrentes, parcelados, diario)
    const occsHoje   = expandRange(transactions, todayStr, todayStr);

    const [, , dd] = todayStr.split('-');
    const nomeMesHoje = hoje.toLocaleString('pt-BR', { month: 'long', timeZone: 'America/Sao_Paulo' });
    let msg = `🌅 *Bom dia! Resumo de ${dd} de ${nomeMesHoje}*\n\n`;
    msg += `💰 Saldo atual: *${formatBRL(saldoAtual)}*\n\n`;

    if (occsHoje.length > 0) {
      let entH = 0, saiH = 0;
      msg += `📋 *Lançamentos de hoje:*\n`;
      for (const o of occsHoje) {
        const v    = o.valor;
        const icon = o.tipo === 'entrada' ? '✅' : '❌';
        const sign = o.tipo === 'entrada' ? '+' : '-';
        const desc = o.tx?.descricao || o.tipo;
        // Indica se é recorrente ou parcelado
        const freqTag = o.tx?.frequencia === 'mensal' ? ' 🔄' :
                        o.tx?.frequencia === 'semanal' ? ' 🔄' :
                        o.tx?.frequencia === 'parcelado' ? ` (${o.tx.parcelaAtual}/${o.tx.totalParcelas}x)` :
                        o.tx?.tipo === 'diario' ? ' (diário)' : '';
        msg += `${icon} ${desc}${freqTag}: *${sign}${formatBRL(v)}*\n`;
        if (o.tipo === 'entrada') entH += v; else saiH += v;
      }
      if (occsHoje.length > 1) msg += `_Saldo do dia: ${formatBRL(entH - saiH)}_\n\n`;
      else msg += '\n';
    } else {
      msg += `_Nenhum lançamento para hoje._\n\n`;
    }

    // Inclui faturas só se N1 estiver explicitamente desativado
    // (N1 é ativo por padrão quando tipos.n1 !== false, então só omite quando === false)
    if (tipos.n1 === false) {
      const fatHoje = cards.filter(c => c.diaVencimento === day);
      if (fatHoje.length > 0) {
        msg += `💳 *Fatura vencendo hoje:*\n`;
        for (const c of fatHoje) msg += `• ${c.nome}\n`;
        msg += '\n';
      }
    }

    msg += `_Bom dia e boas finanças! 🚀_`;
    msgs.push(msg.trim());
    } // fim if (enviarN8)
  }

  // N9 — Limite Geral de Gastos Mensais
  if (tipos.n9 !== false) {
    const rendaMensal = config?.rendaMensal || 0;
    if (rendaMensal > 0) {
      const fromStr = `${currentMonth}-01`;
      const [y9, m9] = currentMonth.split('-').map(Number);
      const lastDay9 = new Date(y9, m9, 0).getDate();
      const toStr = `${currentMonth}-${String(lastDay9).padStart(2, '0')}`;

      // Gastos do mês por competência: compra à vista na data da compra, parcela mês a mês
      // (não depende de quando a fatura vence nem de qual ciclo está aberto)
      const totalGasto = expandDespesasBot(transactions, fromStr, toStr)
        .reduce((sum, e) => sum + e.valor, 0);

      const pct = (totalGasto / rendaMensal) * 100;
      const faixa9 = Math.floor(pct / 10); // só reavisa quando muda de faixa
      if (pct > 100) {
        msgs.push({
          text: `🚨 *Limite Geral Ultrapassado!*\nSeus gastos totais atingiram ${formatBRL(totalGasto)} de ${formatBRL(rendaMensal)} (excedeu o orçamento geral em *${formatBRL(totalGasto - rendaMensal)}*).`,
          estado: { chave: `limite-geral:${currentMonth}`, sig: `estourou:${faixa9}` },
        });
      } else if (pct >= 80) {
        msgs.push({
          text: `⚠️ *Limite Geral em ${Math.round(pct)}%*\nVocê já utilizou ${formatBRL(totalGasto)} de ${formatBRL(rendaMensal)} do seu orçamento geral deste mês.`,
          estado: { chave: `limite-geral:${currentMonth}`, sig: `${faixa9}` },
        });
      }
    }
  }

  // N27 — Limite mensal por tag (opcional: só tags que têm `limite`). Avisa em 80% e em 100% do limite,
  // uma vez por patamar em cada mês. Gasto por competência (data da compra), igual ao Painel.
  if (tipos.n27 !== false) {
    const tagsComLimite = (Array.isArray(config?.tags) ? config.tags : []).filter(t => t && t.id && Number(t.limite) > 0);
    if (tagsComLimite.length > 0) {
      const gastoPorTag = {};
      for (const e of collectMonthExpenses(transactions, currentMonth)) {
        if (e.tipo === 'investimento' || !e.tag) continue;
        gastoPorTag[e.tag] = (gastoPorTag[e.tag] || 0) + e.valor;
      }
      for (const tag of tagsComLimite) {
        const limite = Number(tag.limite);
        const gasto = gastoPorTag[tag.id] || 0;
        const pct = (gasto / limite) * 100;
        const chave = `tag-limite:${currentMonth}:${tag.id}`;
        const nome = mdEscape(tag.label);
        if (pct > 100) {
          msgs.push({
            text: `🚨 *Limite da tag ${nome} estourado!*\nGasto ${formatBRL(gasto)} de ${formatBRL(limite)} neste mês — passou *${formatBRL(gasto - limite)}*.`,
            estado: { chave, sig: '100' },
          });
        } else if (pct >= 80) {
          msgs.push({
            text: `⚠️ *Tag ${nome} em ${Math.round(pct)}% do limite*\n${formatBRL(gasto)} de ${formatBRL(limite)} neste mês — restam *${formatBRL(limite - gasto)}*.`,
            estado: { chave, sig: '80' },
          });
        }
      }
    }
  }

  // N10 — Alerta de Contas Fixas/Lançamentos Recorrentes Pendentes
  if (tipos.n10 !== false) {
    const d2 = new Date(hoje); d2.setDate(d2.getDate() + 2);
    const in2Str = dateStrFromDate(d2);
    
    for (const tx of transactions) {
      if (tx.tipo === 'entrada' || tx.tipo === 'cartao') continue;
      const v = Number(tx.valor) || 0;
      if (!v || !tx.dataInicio) continue;

      if (tx.frequencia === 'mensal') {
        const txDay = parseInt(tx.dataInicio.split('-')[2], 10);
        // Extrai dia/mês diretamente de in2Str (evita d2.getDate() em UTC do servidor)
        const [, in2MM, in2DD] = in2Str.split('-');
        const diaIn2 = parseInt(in2DD, 10);
        const excluida = Array.isArray(tx.exclusoes) && tx.exclusoes.includes(in2Str);
        if (!excluida && diaIn2 === txDay && in2Str >= tx.dataInicio && (!tx.dataFim || in2Str <= tx.dataFim)) {
          const jaPago = Array.isArray(tx.conferidos) && tx.conferidos.includes(in2Str);
          if (!jaPago) {
            msgs.push({
              text: `⏰ *Conta fixa vence em 2 dias!*\n${tx.descricao || tx.tipo} — valor de *${formatBRL(v)}* está previsto para ${in2DD}/${in2MM}.`,
              txId: tx.id,
              occDate: in2Str
            });
          }
        }
      } else if (tx.frequencia === 'semanal') {
        let cur = new Date(tx.dataInicio + 'T00:00:00');
        const endLimit = tx.dataFim ? tx.dataFim : in2Str;
        let achouOcorrencia = false;
        while (dateStrFromDate(cur) <= in2Str) {
          const ds = dateStrFromDate(cur);
          if (ds === in2Str && ds <= endLimit) {
            achouOcorrencia = true;
            break;
          }
          cur.setDate(cur.getDate() + 7);
        }
        const excluida = Array.isArray(tx.exclusoes) && tx.exclusoes.includes(in2Str);
        if (!excluida && achouOcorrencia) {
          const jaPago = Array.isArray(tx.conferidos) && tx.conferidos.includes(in2Str);
          if (!jaPago) {
            const [, in2MM, in2DD] = in2Str.split('-');
            msgs.push({
              text: `⏰ *Conta semanal vence em 2 dias!*\n${tx.descricao || tx.tipo} — valor de *${formatBRL(v)}* está previsto para ${in2DD}/${in2MM}.`,
              txId: tx.id,
              occDate: in2Str
            });
          }
        }
      }
    }
  }

  // N11 — Limite de Cartão Comprometido
  if (tipos.n11 !== false) {
    for (const card of cards) {
      if (!card.limite || card.limite <= 0) continue;

      const { faturaAtual, comprometidoFuturo } = calcFaturaCardApp(card, transactions, todayStr);
      const totalComprometido = faturaAtual + comprometidoFuturo;
      const pct = (totalComprometido / card.limite) * 100;
      if (pct >= 80) {
        msgs.push({
          text: `💳 *Limite de Cartão próximo do fim!*\nA fatura do seu cartão *${card.nome}* atingiu *${Math.round(pct)}%* do limite total (${formatBRL(totalComprometido)} de ${formatBRL(card.limite)}).`,
          estado: { chave: `cartao-limite:${card.id}`, sig: `${Math.floor(pct / 10)}` },
        });
      }
    }
  }

  // N12 — Relatório Comparativo de Fechamento de Mês
  if (tipos.n12 !== false && day === 1) {
    const dtPassado = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
    const dtRetrasado = new Date(hoje.getFullYear(), hoje.getMonth() - 2, 1);
    const mesPassadoStr = `${dtPassado.getFullYear()}-${String(dtPassado.getMonth()+1).padStart(2,'0')}`;
    const mesRetrasadoStr = `${dtRetrasado.getFullYear()}-${String(dtRetrasado.getMonth()+1).padStart(2,'0')}`;

    const calcGastoMes = (targetMonth) => {
      const fromStr = `${targetMonth}-01`;
      const [y, m] = targetMonth.split('-').map(Number);
      const lastDay = new Date(y, m, 0).getDate();
      const toStr = `${targetMonth}-${String(lastDay).padStart(2, '0')}`;
      // Por competência: o gasto conta no mês em que aconteceu (compra à vista / parcela), não no da fatura
      return expandDespesasBot(transactions, fromStr, toStr).reduce((sum, e) => sum + e.valor, 0);
    };

    const spentPassado = calcGastoMes(mesPassadoStr);
    const spentRetrasado = calcGastoMes(mesRetrasadoStr);

    const nomeMesPassado = dtPassado.toLocaleString('pt-BR', { month: 'long', timeZone: 'America/Sao_Paulo' });
    const nomeMesRetrasado = dtRetrasado.toLocaleString('pt-BR', { month: 'long', timeZone: 'America/Sao_Paulo' });

    if (spentRetrasado > 0) {
      const diffPct = ((spentPassado - spentRetrasado) / spentRetrasado) * 100;
      if (diffPct < 0) {
        msgs.push(`📊 *Relatório do Mês Anterior (${nomeMesPassado.toUpperCase()})*\nEconomia de *${Math.abs(Math.round(diffPct))}%* em relação a ${nomeMesRetrasado}! Gastos: ${formatBRL(spentPassado)} vs ${formatBRL(spentRetrasado)}. Parabéns! 🚀`);
      } else if (diffPct > 0) {
        msgs.push(`📊 *Relatório do Mês Anterior (${nomeMesPassado.toUpperCase()})*\nSeus gastos subiram *${Math.round(diffPct)}%* em relação a ${nomeMesRetrasado}. Gastos: ${formatBRL(spentPassado)} vs ${formatBRL(spentRetrasado)}. Fique atento neste mês! ⚠️`);
      }
    } else if (spentPassado > 0) {
      msgs.push(`📊 *Relatório do Mês Anterior (${nomeMesPassado.toUpperCase()})*\nGastos totais no mês recém-encerrado: *${formatBRL(spentPassado)}*.`);
    }
  }

  // ── N13 — Fatura fecha AMANHÃ ────────────────────────────────────────────────
  if (tipos.n13 !== false) {
    const d1 = new Date(hoje); d1.setDate(d1.getDate() + 1);
    for (const card of cards) {
      if (card.diaFechamento === d1.getDate()) {
        msgs.push(
          `⚠️ *Fatura fecha AMANHÃ!*\n${card.nome} — últimas horas para lançar compras nesta fatura!`
        );
      }
    }
  }

  // ── N14 — Última parcela paga hoje ───────────────────────────────────────────
  if (tipos.n14 !== false) {
    for (const tx of transactions) {
      if (tx.frequencia !== 'parcelado') continue;
      const parcAtual = tx.parcelaAtual || 1;
      const parcTotal = tx.totalParcelas || 1;
      if (parcAtual !== parcTotal) continue;          // não é a última
      
      const pd = new Date(tx.dataInicio + 'T00:00:00');
      // Data da parcela atual = dataInicio + (parcelaAtual - 1) meses
      const diffMonths = (tx.parcelaAtual || 1) - 1;
      for (let j = 0; j < diffMonths; j++) addOneMonthClamped(pd);
      const ds = dateStrFromDate(pd);
      if (ds !== todayStr) continue; // não vence hoje
      
      msgs.push(
        `🎉 *Última parcela!*\n${tx.descricao || 'Lançamento parcelado'} — a partir do próximo mês *${formatBRL(tx.valor)}* serão liberados no seu orçamento!`
      );
    }
  }

  // ── N15 — Saldo abaixo do mínimo configurado ─────────────────────────────────
  if (tipos.n15 !== false) {
    const saldoMinimo = Number(config.saldoMinimoAlerta ?? 200);
    if (saldoMinimo > 0) {
      const saldoAtual = calcSaldoSimples(transactions, todayStr, walletInitials);
      if (saldoAtual < saldoMinimo) {
        msgs.push({
          text: `🚨 *Saldo baixo!*\nSeu saldo atual é *${formatBRL(saldoAtual)}* — abaixo do mínimo de *${formatBRL(saldoMinimo)}*. Atenção ao caixa!`,
          estado: { chave: 'saldo-baixo', sig: `${Math.round(saldoAtual / 100)}`, repetirDias: 3 },
        });
      }
    }
  }

  // ── N16 — Resumo das metas/caixinhas (dia 1 do mês) ─────────────────────────
  if (tipos.n16 !== false && day === 1 && goals.length > 0) {
    const metasComMeta = goals.filter(g => g.metaFinal > 0);
    if (metasComMeta.length > 0) {
      let texto = `🎯 *Resumo das Caixinhas — ${hoje.toLocaleString('pt-BR', { month: 'long', timeZone: 'America/Sao_Paulo' }).toUpperCase()}*\n\n`;
      for (const goal of metasComMeta) {
        const saldoMeta = transactions
          .filter(t => t.metaId === goal.id)
          .reduce((acc, t) => t.tipo === 'saida' ? acc - (Number(t.valor)||0) : acc + (Number(t.valor)||0), 0);
        const pct = Math.min(Math.round((saldoMeta / goal.metaFinal) * 100), 100);
        const { bar } = barra(saldoMeta, goal.metaFinal);
        const status = pct >= 100 ? '✅ Concluída!' : pct >= 75 ? '🔥 Quase lá!' : pct >= 50 ? '💪 Na metade!' : '🌱 Em andamento';
        texto += `*${goal.nome}*\n\`[${bar}] ${pct}%\` — ${formatBRL(saldoMeta)} de ${formatBRL(goal.metaFinal)} ${status}\n\n`;
      }
      texto += `_Acesse o app para aportar nas caixinhas!_`;
      msgs.push(texto.trim());
    }
  }

  // ── N17 — Balanço da metade do mês (dia 15) ──────────────────────────────────
  if (tipos.n17 !== false && day === 15) {
    const rendaMensal = config?.rendaMensal || 0;
    if (rendaMensal > 0) {
      const spent = computeSpentByCategory(transactions, currentMonth);
      const totalGasto = Object.values(spent).reduce((a, b) => a + b, 0);
      const pct        = Math.round((totalGasto / rendaMensal) * 100);
      // Projeção linear: gasto dos 15 dias × 2
      const projecao   = totalGasto * 2;
      const saldoProj  = rendaMensal - projecao;
      const nomeMes    = hoje.toLocaleString('pt-BR', { month: 'long', timeZone: 'America/Sao_Paulo' });
      const { bar }    = barra(totalGasto, rendaMensal);

      let msg = `📊 *Metade de ${nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1)}!*\n\n`;
      msg += `Gasto até agora: *${formatBRL(totalGasto)}* de *${formatBRL(rendaMensal)}*\n`;
      msg += `\`[${bar}] ${pct}%\`\n\n`;
      msg += `Projeção de fechamento: *${formatBRL(projecao)}*\n`;
      if (saldoProj >= 0) {
        msg += `✅ Projetando *${formatBRL(saldoProj)} de sobra* — bom ritmo!`;
      } else {
        msg += `⚠️ Projetando *extrapolar em ${formatBRL(-saldoProj)}* — atenção aos gastos!`;
      }
      msgs.push(msg);
    }
  }

  // ── N19 — Alerta de padrão incomum de gastos (dia atípico) ──────────────────
  if (tipos.n19 !== false) {
    const todayS2 = dateStrFromDate(hoje);
    const ago30   = (() => { const d = new Date(hoje); d.setDate(d.getDate() - 30); return dateStrFromDate(d); })();
    // Gasto do dia = o que aconteceu hoje (compra, parcela do mês, conta). A fatura que vence hoje NÃO
    // conta como gasto de hoje, e aporte de investimento não é gasto.
    const eventos30 = expandDespesasBot(transactions, ago30, todayS2).filter(e => e.tipo !== 'investimento');
    const gastoHoje2 = eventos30.filter(e => e.date === todayS2).reduce((s, e) => s + e.valor, 0);
    const somaUltimos30 = eventos30.reduce((s, e) => s + e.valor, 0);
    const media = somaUltimos30 / 30;
    // media > 0 evita falso positivo quando não há gastos históricos (ex: primeiro gasto do mês)
    if (media > 0 && gastoHoje2 > media * 2 && gastoHoje2 > 50) {
      const mult = (gastoHoje2 / media).toFixed(1);
      let msg = `⚠️ *Dia atípico de gastos!*\n\n`;
      msg += `Você registrou *${formatBRL(gastoHoje2)}* hoje — `;
      msg += `*${mult}×* acima da sua média diária (${formatBRL(media)}).\n`;
      msg += `_Tudo planejado?_`;
      msgs.push(msg);
    }
  }

  // ── N20 — Progresso semanal das metas (toda sexta-feira) ─────────────────────
  if (tipos.n20 !== false && weekday === 5 && goals.length > 0) {
    const metasComMeta = goals.filter(g => g.metaFinal > 0);
    if (metasComMeta.length > 0) {
      let msg = `🎯 *Progresso das Metas — Semana*\n\n`;
      metasComMeta.forEach(g => {
        // g.saldo não é persistido no Firestore — calcula a partir das transações vinculadas
        const saldoMeta = transactions
          .filter(t => t.metaId === g.id)
          .reduce((acc, t) => t.tipo === 'saida' ? acc - (Number(t.valor) || 0) : acc + (Number(t.valor) || 0), 0);
        const pct = Math.min(100, Math.round((saldoMeta / g.metaFinal) * 100));
        const barF = Math.round(pct / 10);
        const barLine = '█'.repeat(barF) + '░'.repeat(10 - barF);
        msg += `${g.nome}: *${formatBRL(saldoMeta)}* / ${formatBRL(g.metaFinal)} (${pct}%)\n`;
        msg += `\`[${barLine}]\`\n\n`;
      });
      msgs.push(msg.trim());
    }
  }

  // ── N22 — Sobra projetada segura (só avisa quando muda; abaixo de R$ 200 não é valor para investir) ───
  if (tipos.n22 !== false) {
    const s = calcSobraSeguraBot(transactions, walletInitials, todayStr, hoje);
    const fmtDia = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
    const proxTxt = s.proxima
      ? `📈 *A partir de ${fmtDia(s.proxima.data)}* a sobra segura sobe para *${formatBRL(s.proxima.valor)}* (+${formatBRL(s.proxima.aumento)}).`
      : '';
    const menorTxt = `_Menor saldo nos próximos 45 dias: ${formatBRL(s.minSaldo)}${s.minDate === todayStr ? ' (hoje)' : ` em ${fmtDia(s.minDate)}`}_`;

    let text = null;
    if (s.investivel > 0) {
      text = `💡 *Sobra Projetada Segura*\n\nVocê pode guardar ou investir *${formatBRL(s.investivel)}* hoje sem faltar dinheiro nos próximos 45 dias — pode ir tudo para a reserva (resgate imediato), sobrando só os centavos na conta.\n\n${menorTxt}${proxTxt ? `\n${proxTxt}` : ''}`;
    } else if (s.proxima) {
      text = `💡 *Sobra Projetada Segura*\n\nHoje não há valor seguro para investir (menos de ${formatBRL(SOBRA_MINIMA_BOT)} livres).\n\n${menorTxt}\n${proxTxt}`;
    }
    if (text) {
      msgs.push({
        text,
        estado: {
          chave: 'sobra-segura',
          sig: `${Math.floor(s.investivel / 100)}|${s.proxima ? s.proxima.data : ''}|${s.proxima ? Math.floor(s.proxima.valor / 100) : ''}`,
        },
      });
    }
  }

  // ── N23 — Lembrete de investimento e reserva (dia 15 e fim do mês) ──────────────
  // Fim do mês = dia 30, ou o último dia quando o mês é menor (fevereiro: 28/29). Antes só havia o dia 30,
  // então o relatório nunca saía em fevereiro.
  const ultimoDiaMesN23 = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
  const diaFimN23 = Math.min(30, ultimoDiaMesN23);
  if (tipos.n23 !== false && (day === 15 || day === diaFimN23)) {
    const FAR_PAST = '2020-01-01';
    const invConfig = config?.investimentos || {};
    const temPerfil = !!invConfig.perfil;
    const mesesMeta = invConfig.mesesMeta || 0;
    const despesasMens = invConfig.despesasMens || 0;
    const reservaGoalId = invConfig.reservaGoalId || '';

    // Calcula reserva atual (soma das transações vinculadas à caixinha de reserva)
    let reservaAtual = 0;
    let metaTotal = 0;
    if (reservaGoalId && goals.length > 0) {
      const reservaGoal = goals.find(g => g.id === reservaGoalId);
      if (reservaGoal) {
        // Mesmo número da tela Metas (aportes ligados à caixinha por metaId)
        reservaAtual = reservaDaCaixinhaBot(transactions, goals, reservaGoalId);
        metaTotal = despesasMens * mesesMeta;
      }
    }

    // Total investido
    const totalInvestido = expandRange(
      transactions.filter(t => t.tipo === 'investimento'), FAR_PAST, todayStr
    ).reduce((acc, o) => acc + o.valor, 0);

    // Sobra segura (abaixo de R$ 200 não é tratada como valor para investir)
    const sobraInfoN23 = calcSobraSeguraBot(transactions, walletInitials, todayStr, hoje);
    const sobraN23 = sobraInfoN23.investivel;
    const aporteReserva = (metaTotal > 0 && reservaAtual < metaTotal) ? sobraN23 * 0.6 : 0;
    const aporteInvest  = (metaTotal > 0 && reservaAtual < metaTotal) ? sobraN23 * 0.4 : sobraN23;
    const reservaCompleta = metaTotal > 0 && reservaAtual >= metaTotal;

    const nomeMes = hoje.toLocaleString('pt-BR', { month: 'long', timeZone: 'America/Sao_Paulo' });

    if (!temPerfil) {
      // Sem configuração: mensagem motivacional
      let msg = `🌱 *Lembrete de Investimento — Dia ${day}*\n\n`;
      msg += `Você ainda não configurou sua reserva de emergência no app.\n\n`;
      msg += `🔐 *Por que começar?*\nUma reserva de emergência de 3 a 12 meses de despesas fixas te protege de imprevistos e te dá liberdade para investir com tranquilidade.\n\n`;
      msg += `💡 *Dica:* Guarde em conta corrente ou CDB/Tesouro com liquidez diária.\n\n`;
      msg += `_Acesse o app → aba Investir para configurar!_`;
      msgs.push(msg);
    } else {
      // Com configuração: relatório com saldos reais
      let msg = `📈 *Relatório de Investimentos — Dia ${day} de ${nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1)}*\n\n`;

      if (metaTotal > 0) {
        const pct = Math.min(100, Math.round((reservaAtual / metaTotal) * 100));
        const { bar } = barra(reservaAtual, metaTotal);
        msg += `🔐 *Reserva de Emergência*\n`;
        msg += `\`[${bar}] ${pct}%\` — ${formatBRL(reservaAtual)} de ${formatBRL(metaTotal)}\n`;
        if (reservaCompleta) {
          msg += `✅ _Reserva completa! Parabéns!_\n\n`;
        } else {
          msg += `Falta: *${formatBRL(metaTotal - reservaAtual)}*\n`;
          // Projeção no ritmo real de aportes (mediana dos últimos 3 meses completos)
          const ritmo = ritmoDaReservaBot({ transactions, goalId: reservaGoalId });
          const proj = projecaoReservaBot({ falta: metaTotal - reservaAtual, ritmoMensal: ritmo.ritmoMensal });
          const linhaProj = linhaProjecaoReserva(ritmo, proj, formatBRL);
          msg += linhaProj ? `${linhaProj}\n\n` : `\n`;
        }
      }

      if (totalInvestido > 0) {
        msg += `📊 *Total Investido*: ${formatBRL(totalInvestido)}\n\n`;
      }

      if (sobraN23 > 0) {
        msg += `💡 *Sobra disponível para aportar*: *${formatBRL(sobraN23)}*\n`;
        if (!reservaCompleta && metaTotal > 0) {
          msg += `├ Reserva (60%): ${formatBRL(aporteReserva)}\n`;
          msg += `└ Investimento (40%): ${formatBRL(aporteInvest)}\n`;
        } else {
          msg += `└ 100% livre para investir!\n`;
        }
        msg += `\n_Sem colchão: só os centavos ficam na conta corrente._\n`;
      } else {
        msg += `_Sem sobra segura para aportar hoje (menos de ${formatBRL(SOBRA_MINIMA_BOT)} livres nos próximos 45 dias)._\n`;
      }
      if (sobraInfoN23.proxima) {
        const p = sobraInfoN23.proxima;
        msg += `📈 *A partir de ${p.data.slice(8, 10)}/${p.data.slice(5, 7)}* a sobra segura sobe para *${formatBRL(p.valor)}*.\n`;
      }

      msg += `\n_Acesse o app → aba Investir para acompanhar!_`;
      msgs.push(msg.trim());
    }
  }

  // ── N21 — Lembrete de conferência bancária (dia 20) ───────────────────────────
  if (tipos.n21 !== false && day === 20) {
    const currentMonthStr = `${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}`;
    const fromConf = `${currentMonthStr}-01`;
    const lastDayConf = new Date(hoje.getFullYear(), hoje.getMonth()+1, 0).getDate();
    const toConf = `${currentMonthStr}-${String(lastDayConf).padStart(2,'0')}`;
    const todayStr21 = dateStrFromDate(hoje);
    const isConferido21 = (o) => {
      const tx = o.tx;
      if (!tx) return false;
      if (!tx.frequencia || tx.frequencia === 'unico' || tx.frequencia === 'parcelado') return !!tx.conferido;
      return !!(tx.conferidos && tx.conferidos.includes(o.date));
    };
    const occsConf = expandRange(transactions, fromConf, toConf);
    const pendentes = occsConf.filter(o => o.date <= todayStr21 && !isConferido21(o) && o.tipo !== 'entrada').length;
    if (pendentes > 0) {
      let msg = `📋 *Hora de conciliar seu extrato!*\n\n`;
      msg += `Você tem *${pendentes} lançamento${pendentes > 1 ? 's' : ''} pendente${pendentes > 1 ? 's' : ''}* de conferência neste mês.\n\n`;
      msg += `Confira seu extrato bancário e marque o que já foi debitado.\n`;
      msg += `_App → Histórico → filtro "Pendentes"_`;
      msgs.push(msg);
    }
  }

  return msgs;
}

module.exports = { checkNotifications };
