import { useMemo, useState } from 'react';
import { formatBRL } from '../../utils/formatters';
import { detectarAssinaturas } from '../../utils/assinaturas';

const card = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14 };
const rotulo = { margin: 0, fontSize: 11, color: 'var(--text-muted)' };
const SEM_IGNORADAS = [];
const mesAno = (iso) => `${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

function Totais({ itens }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${itens.length}, 1fr)`, gap: 8 }}>
      {itens.map(([titulo, valor, destaque]) => (
        <div key={titulo} style={{ ...card, padding: '10px 12px' }}>
          <p style={rotulo}>{titulo}</p>
          <p style={{ margin: '4px 0 0', fontSize: 15, fontWeight: 700, color: destaque ? 'var(--primary)' : 'var(--text-primary)' }}>{formatBRL(valor)}</p>
        </div>
      ))}
    </div>
  );
}

function Linha({ nome, detalhe, valor, sufixo, selo, onIgnorar }) {
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
        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{formatBRL(valor)}</p>
        {sufixo && <p style={{ ...rotulo, marginTop: 1 }}>{sufixo}</p>}
      </div>
      {onIgnorar && (
        <button type="button" onClick={onIgnorar} title="Não é uma assinatura — ocultar" aria-label={`Ocultar ${nome}`}
          style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-muted)', fontSize: 11, padding: '4px 8px', cursor: 'pointer', flexShrink: 0 }}>
          Ocultar
        </button>
      )}
    </div>
  );
}

const Selo = ({ texto, cor }) => (
  <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 6, background: `${cor}22`, color: cor, whiteSpace: 'nowrap' }}>{texto}</span>
);

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

export default function AssinaturasTab({ transactions, config, onSaveConfig }) {
  const [verVariaveis, setVerVariaveis] = useState(false);
  const ignoradas = Array.isArray(config?.assinaturasIgnoradas) ? config.assinaturasIgnoradas : SEM_IGNORADAS;

  const r = useMemo(
    () => detectarAssinaturas({ transactions, tags: config?.tags, ignoradas }),
    [transactions, config?.tags, ignoradas]
  );

  const salvarIgnoradas = (lista) => Promise.resolve(onSaveConfig?.({ assinaturasIgnoradas: lista })).catch(() => {});
  const ignorar = (chave) => salvarIgnoradas([...ignoradas, chave]);
  const semDados = !r.assinaturas.length && !r.variaveis.length && !r.recorrentesComuns.length;

  return (
    <div style={{ padding: '16px 20px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Totais itens={[
        ['No cartão por mês', r.totais.mensalCartao],
        ['No cartão por ano', r.totais.anualCartao],
        ['Com Pix/débito, por mês', r.totais.geralMensal, true],
      ]} />

      {semDados && (
        <div style={{ ...card, padding: '24px 18px', textAlign: 'center' }}>
          <p style={{ margin: '0 0 6px', fontSize: 28 }}>🔁</p>
          <p style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Nada recorrente encontrado ainda</p>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Quando um item de cartão se repetir em meses seguidos, ele aparece aqui. Dica: use a tag <strong>Assinaturas</strong> para marcar o que você já sabe que é assinatura.
          </p>
        </div>
      )}

      {r.assinaturas.length > 0 && (
        <Secao titulo="Assinaturas no cartão" subtitulo="Itens que repetem todo mês, uma vez por mês, com valor estável — e tudo que tem a tag Assinaturas.">
          {r.assinaturas.map(a => (
            <Linha
              key={a.chave}
              nome={a.nome}
              detalhe={`desde ${mesAno(a.desde)} · ${a.meses} ${a.meses > 1 ? 'meses' : 'mês'}`}
              valor={a.valorAtual}
              sufixo={`${formatBRL(a.valorAtual * 12)} por ano`}
              selo={<>
                {a.marcada && <Selo texto="TAG" cor="#8b5cf6" />}
                {a.ultimoReajuste && (
                  <Selo texto={`${a.ultimoReajuste.para > a.ultimoReajuste.de ? '▲' : '▼'} ${formatBRL(a.ultimoReajuste.de)} → ${formatBRL(a.ultimoReajuste.para)}`}
                    cor={a.ultimoReajuste.para > a.ultimoReajuste.de ? '#ef4444' : '#10b981'} />
                )}
              </>}
              onIgnorar={() => ignorar(a.chave)}
            />
          ))}
        </Secao>
      )}

      {r.recorrentesComuns.length > 0 && (
        <Secao titulo="Recorrentes fora do cartão" subtitulo="Lançamentos mensais ou semanais (Pix, débito) que se repetem sozinhos.">
          {r.recorrentesComuns.map(c => (
            <Linha
              key={c.chave}
              nome={c.nome}
              detalhe={c.frequencia === 'semanal' ? 'toda semana' : `todo dia ${c.dia}`}
              valor={c.valorMensal}
              sufixo={c.frequencia === 'semanal' ? `${formatBRL(c.valor)} por semana` : null}
              onIgnorar={() => ignorar(c.chave)}
            />
          ))}
        </Secao>
      )}

      {r.variaveis.length > 0 && (
        <Secao
          titulo="Repetem todo mês, mas o valor varia"
          subtitulo={`Mercado, delivery, transporte… Média de ${formatBRL(r.totais.variaveisMensal)} por mês. Não entram nos totais.`}
        >
          <button type="button" onClick={() => setVerVariaveis(v => !v)} style={{ width: '100%', padding: '9px 14px', background: 'none', border: 'none', borderTop: '1px solid var(--border)', color: 'var(--primary)', fontSize: 12, fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}>
            {verVariaveis ? 'Esconder' : `Ver os ${r.variaveis.length} itens`}
          </button>
          {verVariaveis && r.variaveis.map(v => (
            <Linha key={v.chave} nome={v.nome} detalhe={`${v.meses} ${v.meses > 1 ? 'meses' : 'mês'} · média por mês`} valor={v.media} onIgnorar={() => ignorar(v.chave)} />
          ))}
        </Secao>
      )}

      {ignoradas.length > 0 && (
        <button type="button" onClick={() => salvarIgnoradas([])} style={{ ...card, padding: '10px 14px', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', textAlign: 'left' }}>
          {r.ignoradosCount} {r.ignoradosCount === 1 ? 'item oculto' : 'itens ocultos'} — <strong style={{ color: 'var(--primary)' }}>mostrar de novo</strong>
        </button>
      )}

      <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
        A lista usa os últimos 6 meses de compras no cartão (pela data da compra). Valores até 5% diferentes contam como o mesmo; acima disso aparece como reajuste.
      </p>
    </div>
  );
}
