import Modal from './Modal';

const HELP = {
  home: {
    title: 'Ajuda — Início',
    items: [
      { icon: '💰', title: 'Saldo Global', desc: 'Soma de todas as suas carteiras em tempo real. Toque no ícone de olho (👁) para esconder os valores.' },
      { icon: '🏦', title: 'Carteiras', desc: 'Cada bloco é uma conta ou carteira. Role horizontalmente para ver todas. O saldo inicial é configurado em Configurações → Carteiras.' },
      { icon: '📊', title: 'Divisão Percentual', desc: 'Mostra quanto da sua renda líquida você já usou em cada categoria neste mês. Barra vermelha = limite ultrapassado. Percentuais ajustáveis em Configurações → Orçamento.' },
      { icon: '✅', title: 'Conferir lançamento', desc: 'Ao tocar em um lançamento e marcá-lo como conferido, ele fica verde e é excluído dos cálculos de projeção futura — indica que já foi verificado ou pago.' },
      { icon: '💳', title: 'Cartão de crédito', desc: 'Exibe a fatura estimada do ciclo atual e o limite disponível. Aparece apenas para quem tiver cartão cadastrado. Ao conferir o pagamento da fatura, o saldo é zerado.' },
    ],
  },
  transactions: {
    title: 'Ajuda — Painel',
    items: [
      { icon: '🔍', title: 'Busca e filtros', desc: 'Filtre por período (mensal ou personalizado), tipo de lançamento e categoria para encontrar qualquer transação rapidamente.' },
      { icon: '✅', title: 'Conferido', desc: 'Lançamentos conferidos ficam marcados em verde. Use para indicar contas pagas ou valores verificados no extrato.' },
      { icon: '✏️', title: 'Editar lançamento', desc: 'Toque em um lançamento para editar. Para recorrentes e parcelados, você escolhe se a alteração vale só para aquela ocorrência ou para toda a série.' },
      { icon: '🗑️', title: 'Excluir', desc: 'Da mesma forma, é possível excluir só uma ocorrência ou cancelar toda a série de um lançamento recorrente.' },
      { icon: '📋', title: 'Tipos de lançamento', desc: 'Entrada, Saída, Diário (se repete todo dia), Parcelado (X vezes sem cartão) e Cartão (fatura do cartão de crédito).' },
    ],
  },
  projection: {
    title: 'Ajuda — Projeção',
    items: [
      { icon: '📈', title: 'Gráfico de saldo', desc: 'Mostra como seu saldo vai evoluir dia a dia com base nos seus lançamentos cadastrados. Linha abaixo de zero indica saldo negativo projetado.' },
      { icon: '💳', title: 'Badges de vencimento', desc: 'Ícones de cartão nos dias de vencimento mostram qual cartão vence e o valor estimado da fatura.' },
      { icon: '🔁', title: 'Lançamentos recorrentes', desc: 'Saídas e entradas recorrentes (mensais, semanais, diárias) são projetadas automaticamente até a data final configurada.' },
      { icon: '🛡️', title: 'Sobra Segura', desc: 'Valor que você pode gastar ou investir sem risco de ficar negativo nos próximos 45 dias, considerando todos os compromissos futuros.' },
      { icon: '📅', title: 'Visões disponíveis', desc: 'Alterne entre visão mensal (resumo por mês), diária (dia a dia) e histórico (faturas pagas de cartões).' },
    ],
  },
  reports: {
    title: 'Ajuda — Relatórios',
    items: [
      { icon: '📅', title: 'Período', desc: 'Selecione o mês e ano que deseja analisar. Os dados refletem todos os lançamentos do período escolhido.' },
      { icon: '🥧', title: 'Gráfico de pizza', desc: 'Distribuição percentual dos gastos por categoria no período. Toque em uma fatia para ver os detalhes da categoria.' },
      { icon: '📊', title: 'Evolução mensal', desc: 'Gráfico de barras com entradas, saídas e saldo líquido mês a mês para acompanhar tendências ao longo do ano.' },
      { icon: '🏷️', title: 'Por categoria', desc: 'Lista detalhada de quanto foi gasto em cada categoria, com comparativo ao limite do orçamento percentual.' },
      { icon: '🖨️', title: 'Exportar', desc: 'Toque no ícone de impressão para salvar ou imprimir o relatório do período.' },
    ],
  },
  goals: {
    title: 'Ajuda — Metas e Caixinhas',
    items: [
      { icon: '🎯', title: 'O que é uma caixinha?', desc: 'Uma reserva com objetivo definido (ex: viagem, reserva de emergência). Você deposita e resgata quando quiser.' },
      { icon: '➕', title: 'Criar caixinha', desc: 'Toque no botão "+" no canto superior direito. Defina nome, cor, meta de valor e data-alvo (opcional).' },
      { icon: '💵', title: 'Depositar e resgatar', desc: 'Dentro de cada caixinha há botões para adicionar ou retirar dinheiro. Cada movimentação gera um lançamento vinculado.' },
      { icon: '💎', title: 'Independência Financeira', desc: 'Caixinha especial que calcula quanto você precisa acumular para viver de renda com base na sua renda mensal atual.' },
      { icon: '🏦', title: 'Relação com carteiras', desc: 'O saldo das caixinhas faz parte do seu Saldo Global. Ao resgatar, o valor volta para a carteira selecionada.' },
    ],
  },
  settings: {
    title: 'Ajuda — Configurações',
    items: [
      { icon: '💰', title: 'Renda mensal líquida', desc: 'Valor que você recebe de fato na conta (já descontados INSS, IR, plano de saúde, etc.). Base de cálculo da Divisão Percentual.' },
      { icon: '📊', title: 'Orçamento percentual', desc: 'Define quanto da renda cada categoria pode usar (soma deve ser 100%). Altere conforme sua realidade.' },
      { icon: '💳', title: 'Cartões de crédito', desc: 'Cadastre seus cartões com dia de fechamento e dia de vencimento. Essencial para o cálculo correto de faturas na projeção.' },
      { icon: '🏦', title: 'Carteiras', desc: 'Gerencie suas contas. O saldo inicial deve refletir o valor real atual de cada conta.' },
      { icon: '🤖', title: 'Bot do Telegram', desc: 'Ative o assistente financeiro no Telegram para consultar saldo, projeção, categorias e receber notificações diárias pelo celular.' },
      { icon: '🔔', title: 'Notificações', desc: 'Configure quais alertas automáticos você quer receber: saldo negativo, contas a vencer, resumo semanal, metas e mais.' },
      { icon: '🔄', title: 'Reiniciar tour', desc: 'Quer rever o tour guiado de apresentação do app? Toque em "Reiniciar Tour" no final desta tela.' },
    ],
  },
};

export default function HelpModal({ screen, open, onClose }) {
  const content = HELP[screen];
  if (!content) return null;

  return (
    <Modal open={open} onClose={onClose} title={content.title}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {content.items.map((item, i) => (
          <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <span style={{
              fontSize: 22, flexShrink: 0,
              width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(99,102,241,0.08)', borderRadius: 10,
            }}>
              {item.icon}
            </span>
            <div>
              <p style={{ margin: '0 0 3px', fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                {item.title}
              </p>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                {item.desc}
              </p>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
