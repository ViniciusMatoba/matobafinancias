import { useMemo } from 'react';
import { formatBRL } from '../../utils/formatters';
import { calcParcelados, cronogramaParcelas } from '../../utils/parcelas';
import { rotuloMes } from '../../utils/reservaRitmo';

const card = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14 };
const rotulo = { margin: 0, fontSize: 11, color: 'var(--text-muted)' };

function Totais({ itens }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${itens.length}, 1fr)`, gap: 8 }}>
      {itens.map(([titulo, valor, destaque]) => (
        <div key={titulo} style={{ ...card, padding: '10px 12px' }}>
          <p style={rotulo}>{titulo}</p>
          <p style={{ margin: '4px 0 0', fontSize: 14, fontWeight: 700, color: destaque ? 'var(--primary)' : 'var(--text-primary)' }}>{valor}</p>
        </div>
      ))}
    </div>
  );
}

function Linha({ nome, detalhe, valor, sufixo, selo }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderTop: '1px solid var(--border)' }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nome}</span>
          {selo}
        </div>
        <p style={{ ...rotulo, marginTop: 2 }}>{detalhe}</p>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{valor}</p>
        {sufixo && <p style={{ ...rotulo, marginTop: 1 }}>{sufixo}</p>}
      </div>
    </div>
  );
}

function Secao({ titulo, subtitulo, children }) {
  return (
    <div style={{ ...card, overflow: 'hidden' }}>
      <div style={{ padding: '12px 14px' }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{titulo}</p>
        {subtitulo && <p style={{ ...rotulo, marginTop: 3, lineHeight: 1.4 }}>{subtitulo}</p>}
      </div>
      {children}
    </div>
  );
}

export default function ParcelasTab({ transactions, cards = [] }) {
  const { cartaoItems, avulsos, cron } = useMemo(() => {
    const r = calcParcelados(transactions);
    return { ...r, cron: cronogramaParcelas(r) };
  }, [transactions]);

  const nomeCartao = useMemo(() => Object.fromEntries((cards || []).map(c => [c.id, c.nome])), [cards]);
  const totalAPagar = [...cartaoItems, ...avulsos].reduce((s, i) => s + i.totalRestante, 0);
  const porCartao = {};
  for (const i of cartaoItems) (porCartao[i.cartaoId] = porCartao[i.cartaoId] || []).push(i);

  if (cartaoItems.length === 0 && avulsos.length === 0) {
    return (
      <div style={{ padding: '16px 20px 0' }}>
        <div style={{ ...card, padding: '24px 18px', textAlign: 'center' }}>
          <p style={{ margin: '0 0 6px', fontSize: 28 }}>🎉</p>
          <p style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Nenhuma compra parcelada em aberto</p>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>Você está livre de parcelas por enquanto.</p>
        </div>
      </div>
    );
  }

  const linha = (i, chave) => (
    <Linha
      key={chave}
      nome={i.descricao}
      detalhe={`parcela ${i.parcelaAtual}/${i.totalParcelas} · última em ${rotuloMes(i.ultimaData.slice(0, 7))}`}
      valor={formatBRL(i.valor)}
      sufixo={`× ${i.restam} = ${formatBRL(i.totalRestante)}`}
      selo={i.restam === 1 ? <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 6, background: '#10b98122', color: '#10b981' }}>ÚLTIMA</span> : null}
    />
  );

  return (
    <div style={{ padding: '16px 20px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Totais itens={[
        ['Ainda a pagar', formatBRL(totalAPagar)],
        ['Pesam por mês', formatBRL(cron.mensalHoje)],
        ['Livre a partir de', rotuloMes(cron.livreAPartirDe), true],
      ]} />

      <Secao titulo="Quando você fica livre" subtitulo="O mês em que cada compra termina e quanto isso libera por mês. Vale se você não fizer novas compras parceladas.">
        {cron.liberacoes.map(l => (
          <Linha
            key={l.mes}
            nome={rotuloMes(l.mes)}
            detalhe={`${l.itens.length === 1 ? 'acaba' : 'acabam'}: ${l.itens.join(', ')}`}
            valor={`+ ${formatBRL(l.libera)}`}
            sufixo="livres por mês"
          />
        ))}
      </Secao>

      {Object.entries(porCartao).map(([cartaoId, itens]) => (
        <Secao key={cartaoId} titulo={`💳 ${nomeCartao[cartaoId] || 'Cartão'}`}>
          {[...itens].sort((a, b) => b.totalRestante - a.totalRestante).map(i => linha(i, `${cartaoId}-${i.descricao}-${i.totalParcelas}`))}
        </Secao>
      ))}

      {avulsos.length > 0 && (
        <Secao titulo="📦 Parcelados avulsos">
          {[...avulsos].sort((a, b) => b.totalRestante - a.totalRestante).map(i => linha(i, `avulso-${i.descricao}-${i.totalParcelas}`))}
        </Secao>
      )}

      <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
        As datas são as de pagamento (vencimento da fatura), não a da compra. Parcela de fatura vencida e não paga continua contando como a pagar.
      </p>
    </div>
  );
}
