# CLAUDE.md — Matoba Finanças

Lido automaticamente pelo Claude Code no início de cada sessão.

---

## ⚠️ REGRA PRIMORDIAL — VERSÃO E HISTÓRICO

**APÓS TODA ALTERAÇÃO**, obrigatoriamente:

| # | Arquivo | O que alterar |
|---|---------|---------------|
| 1 | `src/utils/version.js` | Incrementar `APP_VERSION`, atualizar `APP_VERSION_DATE` e adicionar bloco no topo de `CHANGELOG[]` |
| 2 | `package.json` | Campo `"version"` |

> **FONTE ÚNICA DE CHANGELOG:** `src/utils/version.js` é a **única** fonte de dados do histórico de versões. `SettingsScreen.jsx` NÃO tem mais array local de changelog — não adicionar `CHANGELOG_DATA` ou qualquer array hardcoded lá. Toda entrada de histórico vai exclusivamente em `version.js`.

Em seguida, executar o release:

```bash
npm run release              # remoto em dia? → testes → build → commit → push → GitHub Pages → Cloud Functions
npm run release -- "Título"  # idem, com descrição no commit
npm run release -- "Título" --dry-run     # só verifica (remoto, testes, build); não commita nem publica
npm run release -- "Título" --skip-tests  # pula os testes (só em emergência)
```

> O script **para** se o `origin/main` estiver à frente (releases feitos de outra máquina), roda os testes antes de publicar, faz o build antes do push e repete o deploy do GitHub Pages uma vez se for rejeitado. As functions usam o `firebase` global com `FUNCTIONS_DISCOVERY_TIMEOUT=60`; se mesmo assim falhar, rode `firebase deploy --only functions` à mão.

> O build gera novo hash no SW → todos os usuários recebem a atualização automática em até 60 s.

### Data/hora: sempre Brasília (UTC-3)

```powershell
[System.TimeZoneInfo]::ConvertTimeBySystemTimeZoneId([DateTime]::UtcNow, 'E. South America Standard Time').ToString('dd/MM/yyyy HH:mm')
```

## Comandos Essenciais

```bash
npm run dev       # Servidor local (Vite HMR) — porta 5173
npm run build     # Build de produção
npm run deploy    # ⚠️ Só deploy — NÃO commita código
npm run release   # ✅ USAR ESTE — fluxo completo (Git Push + deploy no GitHub Pages e Firebase Cloud Functions)
```

---

## Stack

- **React 19** + **Vite 8**
- **Firebase**: Auth (email/senha) + Firestore (saves) + FCM (notificações push) + Cloud Functions (backend/bot)
- **Tailwind CSS v4** via PostCSS
- **PWA**: `vite-plugin-pwa` com `injectManifest` no `firebase-messaging-sw.js`
- **Deploy Duplo**: Código no GitHub, frontend no GitHub Pages via `gh-pages` e backend no Firebase Cloud Functions via Firebase CLI
- **Repositório**: `https://github.com/ViniciusMatoba/matobafinancias.git`


---

## Arquitetura de Navegação

`src/App.jsx` controla `currentView` via `useState`. Não há React Router.

### Telas principais

| View | Componente |
|------|-----------|
| `home` | `HomeScreen` |
| `transactions` | `TransactionsScreen` |
| `projection` | `ProjectionScreen` |
| `reports` | `ReportsScreen` |
| `goals` | `GoalsScreen` |
| `investimentos` | `InvestimentosScreen` |
| `settings` | `SettingsScreen` |

---

## Sistema de Versão

- **Arquivo**: `src/utils/version.js` — exporta `APP_VERSION`, `APP_VERSION_DATE`, `CHANGELOG[]`
- **Versão atual**: v1.6.148

### Regra de bump

- **patch** (X.Y.**Z**): correções e melhorias pequenas
- **minor** (X.**Y**.0): novas features relevantes
- **major** (**X**.0.0): redesign ou breaking change

---

## Forçar Atualização para Todos os Usuários

O SW (`public/firebase-messaging-sw.js`) chama `self.skipWaiting()` no evento `install`.
O `ReloadPrompt` detecta `needRefresh` e aplica a atualização automaticamente em 150ms.
Verificações ocorrem: na abertura, ao ganhar foco e a cada 60 segundos.

**Conclusão**: qualquer novo build + deploy força atualização automática para todos os usuários.

---

## Serviços e Utils Principais

| Arquivo | Conteúdo |
|---------|----------|
| `src/firebase.js` | Inicialização Firebase, auth, Firestore, messaging |
| `src/hooks/useAuth.js` | Login, registro, logout |
| `src/hooks/useTransactions.js` | CRUD de transações no Firestore |
| `src/hooks/useCards.js` | Cartões de crédito |
| `src/hooks/useWallets.js` | Carteiras/contas |
| `src/hooks/useGoals.js` | Metas e caixinhas |
| `src/hooks/useConfig.js` | Renda, orçamento percentual, configurações |
| `src/utils/version.js` | Versão e changelog |
| `src/utils/categories.js` | `PERCENTUAL_CATEGORIES`, `CATEGORY_ORDER` |
| `src/utils/formatters.js` | `formatBRL`, `todayStr`, `TYPE_CONFIG` |
| `src/utils/projectionCalc.js` | `getClosingDate`, `expandOccurrences`, `calcSaldo`, `calcularSobraSegura`, `calcFaturaCard` |

---

## Estado Atual (atualizar após cada sessão)

**Versão**: v1.6.148 — 05/10/2026

**Últimas features**:
- v1.6.148 — Fix parcelas em dobro na Projeção (pagar/editar fatura projetada, no app e no bot); Projeção respeita `dataFim`; Configurações → "Verificar duplicidades de fatura"
- v1.6.147 — Bot: N19/N12/N9 por competência (fim dos falsos "dia atípico" em dia de fatura/aporte); N7 com rótulos de caixa
- v1.6.146 — Fix onboarding (`setView` indefinido no App); teste de fatura em atraso atualizado para a regra da v1.6.116 (suíte 117/117)
- v1.6.145 — Despesas por competência (compra à vista na data da compra; parcela mês a mês a partir dela) em categorias/tags/Painel/aviso do formulário/fechamento do mês/bot; "Gastos" × "Saiu do caixa"; caixa e Projeção intocados e travados por testes
- v1.6.144 — Tags (Fase 3): aba Tags no Painel (`computeTagStats`), tags nos cartões de Categorias, coluna Tag no CSV; bot `/gastos <tag>` e `/tags`
- v1.6.143 — Tags (Fase 2): classificação em lote do histórico em Configurações → Tags (só com lançamentos sem tag), por descrição, com sugestão (igual/parecida), pular e desfazer; `updateMany` (writeBatch) em useTransactions
- v1.6.142 — Tags de despesa (Fase 1): criar/renomear/excluir em Configurações → Tags, seletor no formulário (lançamento e item de fatura), tag automática por descrição idêntica, chip/filtro na lista de lançamentos
- v1.6.141 — Fix Projeção: saldo positivo baixo (0–500) não aparece mais em vermelho (só negativo); rótulos Início/Fim do mês ou do período conforme a aba
- v1.6.140 — Projeção: card "Saldo hoje (= Saldo Global)" no mês corrente; "Saldo inicial/final" renomeados para "Início/Fim do mês"
- v1.6.139 — Sobra segura sem colchão de R$500 (menor saldo em 45 dias, arredondado para reais inteiros); fix NaN na tela Investir
- v1.6.138 — N25 (categoria acima da média dos últimos 3 meses, Telegram); toggles para N22–N25 no app e no bot
- v1.6.137 — Telegram `/gastos` com mês e `top`; novo `/meses` (total por mês, mês mais alto/baixo, média)
- v1.6.136 — Telegram `/gastos` (despesas do mês por categoria; filtro por categoria ou termo livre)
- v1.6.135 — Classe de investimento nos aportes + donut de alocação; comandos `/reserva` e `/investimentos`; N24 alerta de aporte perdido
- v1.6.134 — Cloud Functions N22 (sobra projetada segura diária) e N23 (relatório investimentos/reserva dias 15 e 30) no Telegram
- v1.6.133 — Remove: widget "Pode gastar por dia" da Home
- v1.6.132 — Banner sobra segura exibe data e valor do menor saldo projetado no período
- v1.6.131 — Projeção: gradiente de cor no saldo diário (verde >500 → amarelo 500 → vermelho <0)
- v1.6.130 — Sobra segura: volta a usar o mínimo do período (não o saldo final) menos buffer de R$500
- v1.6.129 — Sobra segura: deduz buffer de R$500 de gordura no caixa
- v1.6.128 — Fix sobra segura: usa saldo projetado no fim do período (revertido em 1.6.130)
- v1.6.127 — Nav: Projeção volta ao menu inferior; Investir substitui Painel; atalho Painel na Home
- v1.6.126 — Nova tela Investimentos: reserva de emergência por perfil (Concursado/CLT/PJ), meses configuráveis, sugestão automática de despesas, vínculo com caixinha, distribuição 60/40
- v1.6.125 — Modal Investidor 10 no card Home (pergunta se tem carteira → pede URL → salva e abre)
- v1.6.124 — Card Total Investido abre Investidor 10 + campo URL da carteira nas Configurações
- v1.6.123 — Card "Total Investido" na Home (visível apenas quando há investimentos)
- v1.6.122 — Fix calcularSobraSegura: usa historical:false para consistência com saldo da Home
- v1.6.121 — Widget gastoPorDia (removido em 1.6.133), donut de metas, N6 saldo negativo, N7 projeção fim do mês
- v1.6.120 — Fix notificações N10 ignoram ocorrências excluídas (exclusoes[])
- v1.6.119 — Fix Projeção: removido historical:true do saldo inicial — restaura consistência com saldo da Home (mantém wInitials)

**Arquitetura relevante desta sessão**:
- **Dois olhares sobre o dinheiro — não misturar.** *Caixa* (quando sai da conta): `expandOccurrences`/`calcSaldo`/`buildDailyProjection`/`calcFaturaCard` no app e `expandRange`/`calcSaldoSimples`/`calcFaturaCardBot` no bot — data e valor da fatura; **não alterar**, travado por `src/utils/__tests__/caixa.test.js` (inclui comportamentos discutíveis de propósito). *Competência* (quando o gasto aconteceu): `src/utils/despesas.js` (`expandDespesas`) e, espelhado, `expandDespesasBot` em `functions/index.js` — à vista na `dataCompra`; parcela k em `dataCompra + (k-1)` meses (o usuário sempre preenche a data **original** da compra); parcela repetida em mais de uma fatura conta uma vez (chave cartão+descrição+compra+total+k, real vence projetada); fatura recorrente conta cada ocorrência na própria data. Só leitura: o pagar da fatura continua movendo `dataInicio` (caixa) e isso não afeta as despesas.
- Consomem competência: Home (`BudgetSummaryCard`), Painel (categorias, tags, top gastos, evolução, CSV, card "Gastos"; "Saiu do caixa" vem das ocorrências), aviso de orçamento do `TransactionForm`, fechamento do mês (`AppContext`), `computeTagStats`, e no bot `computeSpentByCategory`/`getTopExpensesForCategory`/`collectMonthExpenses` (→ `/categoria`, `/meta`, `/gastos`, `/tags`, `/meses`, N4/N5/N17/N25) e `/resumo`/`/mes` (Gastos + Saiu do caixa). Se mudar a regra, mudar app e bot juntos (a paridade foi checada rodando os mesmos cenários nos dois motores).
- **Não mexer** na lista de lançamentos (`TransactionsScreen`): o `occ.tx` das linhas projetadas decide se editar/pagar cria fatura do mês ou altera a original (caixa). **Não reverter** `isParcelado:false` dos itens convertidos ao editar/pagar fatura projetada: é isso que impede o caixa de projetar a parcela de novo (a competência reconhece a parcela por `parcelaAtual`/`totalParcelas`).
- Por caixa de propósito no bot: N7 (rotulado "Saiu do caixa"), N8, N6, N15, N18, N22, N23, `/semana`, `/hoje`, `/saldo`, `/projecao`, `/previsao`. N9, N12 e N19 migraram para competência na v1.6.147 (N19 não conta fatura que vence hoje nem investimento como gasto do dia).
- **Faturas projetadas → lançamentos reais (v1.6.148).** Uma fatura única com parcelas projeta sozinha os meses seguintes; quando uma projeção vira lançamento real (pagar, editar), o lançamento NOVO **não pode projetar de novo** — os itens vão com `isParcelado:false` (parcela segue reconhecível por `parcelaAtual`/`totalParcelas`). Código único: `src/utils/faturaProjetada.js` (`docPagamentoFaturaProjetada`, `itensDoLancamentoReal`); o bot espelha em `itensDoLancamentoRealBot`/`ocorrenciaProjetada` (pagar fatura, pagar projeção e adiar). "Esta e todas as futuras" grava `dataFim` no lançamento de origem e o cálculo de projeção **respeita `dataFim`** (app `expandOccurrences`, bot `expandRange`, e os dois motores de competência). Antes disso, os três fluxos somavam as parcelas futuras em dobro na Projeção. Ferramenta: Configurações → "Verificar duplicidades de fatura" (`encontrarDuplicidades`; corrige só pagamentos redundantes cujo original ainda projeta as mesmas parcelas; o resto é decisão do usuário). Fatura nova lançada à mão sem excluir a projeção do original ainda soma em dobro no caixa (`caixa.test.js` documenta) — a verificação acusa; o usuário edita pela projeção ("Somente esta").
- **Tags** (plano em 3 fases: 1 = núcleo no app ✅ v1.6.142; 2 = classificação em lote do histórico ✅ v1.6.143 (`TagBatchClassifier.jsx`, em Configurações → Tags, visível só quando houver lançamentos sem tag; não grava nada além de `tag`/`itens`); 3 = Painel + bot ✅ v1.6.144 — plano das tags concluído)
- Bot: `loadTags(uid)` lê `config.tags`; `collectMonthExpenses` devolve `tag`/`tipo` por lançamento; `/gastos <tag>` (nome exato vence a categoria; prefixo só se não for categoria) e `/tags [mês]`. Cuidado: não passar `linha` direto em `.map(linha)` (o índice viraria o 2º parâmetro `comTag`)
- `config.tags` = `[{ id, label, cor }]` (id é slug estável; renomear só muda o `label`). `tag` (id) fica no lançamento e em `itens[].tag` da fatura de cartão; uma tag por lançamento; só para `saida`/`diario`/`cartao`. Tag excluída deixa o id órfão nos lançamentos, tratado como "sem tag" (recriar uma tag com o mesmo nome religa os órfãos)
- `src/utils/tags.js` (`addTagToList`, `countTagUsage`, `normalizeText`), `shared/TagPicker.jsx`, `settings/TagSettings.jsx`. Guardar `tags` sempre como **array** no `saveConfig` (merge de mapa não remove chaves; array é substituído por inteiro)
- `InvestimentosScreen.jsx` — tela de alocação: perfil de trabalho, meses de reserva, despesas fixas (auto-sugeridas), vínculo com caixinha (goal), distribuição 60/40 da sobra
- `config.investimentos` — `{ perfil, mesesMeta, despesasMens, reservaGoalId }` persistido no Firestore
- `calcularSobraSegura` (projectionCalc.js) — usa o **mínimo** do saldo projetado em 45 dias, arredonda para baixo em reais inteiros (sem colchão; era R$500 até a v1.6.138); retorna também `dataMinimoSaldo` e `minimoSaldo`
- `saldoColor()` em ProjectionScreen.jsx — vermelho só para saldo negativo; de 0 a 500 gradiente amarelo → verde; verde a partir de 500
- Cloud Function N22 — espelha `calcularSobraSegura` do frontend, envia aviso diário no Telegram quando há sobra
- Cloud Function N23 — dias 15/30: lê `config.investimentos`, calcula reserva atual via transações vinculadas ao `goalId`, envia relatório ou mensagem motivacional
- `config.investidor10Url` — URL da carteira no Investidor 10; card "Total Investido" na Home abre link (com modal de cadastro se ainda não configurado)
- BottomNav atual: Início / Investir / (+) / Projeção / Config — atalho para Painel (reports) fica dentro da Home
- `CartaoFaturaCard.jsx` — componente de card de cartão na Home (atualmente removido da Home, arquivo existe)
- `calcFaturaCard` — usa `cartaoVinculo` além de `cartaoId` para vincular provisões
- `cardBadges` no ProjectionScreen — usa clamp `Math.min(diaVenc, lastDayOfMonth)` para meses curtos
- `saldoInicial` no ProjectionScreen — inclui `wInitials` das carteiras, sem `historical:true`
