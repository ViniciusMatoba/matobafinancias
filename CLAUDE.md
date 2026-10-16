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
- **Versão atual**: v1.6.183

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

**Versão**: v1.6.183 — 16/10/2026

**Últimas features**:
- v1.6.183 — PROJEÇÃO: DIAS NEGATIVOS COM DINHEIRO GUARDADO. Investimento é saída da conta (Projeção mostra só a conta corrente), então aporte planejado e reserva faziam o saldo parecer negativo. `src/utils/coberturaProjecao.js` (`classificarDiasNegativos`): por dia negativo → `aporte` (sem os aportes planejados depois de hoje o saldo seria >= 0; tem prioridade), `reserva` (reserva da caixinha, valor de hoje, >= buraco) ou `falta` (valor descoberto). `ProjectionScreen` recebe `goals`/`config`; badge no lugar de "NEG", linha "Reserva · Investido" e resumo no card, frase ao expandir o dia. Só a reserva conta como cobertura; total investido é informativo. Bot: N6 diz se a reserva cobre. Testes: `coberturaProjecao.test.js`, `n6Reserva.test.js`
- v1.6.182 — Item 2 do plano de melhorias: AVISO DE ASSINATURAS (N26), DESLIGADO por padrão. `functions/lib/alertas/assinaturas.js` (`alertasAssinaturasBot`) chamado em `checkNotifications` só quando `tipos.n26 === true` (ao contrário dos demais, que valem até serem desligados); `n26:false` em `DEFAULT_NOTIFICATION_TIPOS` e `DEFAULT_TG_TIPOS`. Regras sem estado próprio (dedupe pela memória de avisos, chave `assin:<chave do item>`, sig `r:<valor>` ou `n:<valor>`): REAJUSTE = assinatura com ≥3 meses e `ultimoReajuste` no mês atual/anterior (sobe ou baixa); NOVA = 2 meses seguidos, sem aparecer antes, e `contexto.historicoMeses ≥ 4`; tag "Assinaturas" avisa na 1ª aparição. Os motores (app e bot) ganharam `contexto {mesAtual, mesAnterior, historicoMeses}`. Limitação: 2 reajustes na janela de 6 meses viram "variável" e deixam de avisar. Plano de melhorias concluído (itens 1 a 5); o N26 só deve ser ligado depois da revisão da lista de assinaturas
- v1.6.181 — Item 4 do plano de melhorias: DATA DE QUITAÇÃO DAS PARCELAS. `calcParceladosBot` agora devolve `ultimaData` (data do caixa da última parcela) por item e `cronogramaParcelasBot` agrupa por mês de término (libera = Σ parcela mensal; `livreAPartirDe` = mês seguinte à última parcela); seção "Quando você fica livre" no `/parcelados`. App: `src/utils/parcelas.js` (`calcParcelados` + `cronogramaParcelas`, cópia fiel do bot, paridade em 300 cenários) + aba "Parcelas" no Painel (`ParcelasTab.jsx`; `ReportsScreen` agora recebe `cards`). Datas = vencimento da fatura (caixa), não a da compra. Dados do demo ajustados: só a fatura de origem da TV é `isParcelado` e ela exclui as datas que já têm fatura real (faturas manuais duplicando parcelas distorciam o resultado — o mesmo caso que "Verificar duplicidades de fatura" aponta)
- v1.6.180 — Item 5 do plano de melhorias: PROJEÇÃO DA RESERVA NO RITMO REAL. Motor `src/utils/reservaRitmo.js` (app) + cópia `functions/lib/motor/reservaRitmo.js` (bot; também `linhaProjecaoReserva` para os textos), paridade em 300 cenários. Regras: ritmo = MEDIANA do líquido mensal da caixinha (metaId; saída subtrai, o resto soma) nos 3 meses COMPLETOS (mês atual fora; meses antes do 1º movimento não contam; meses sem aporte depois dele contam como zero); ocorrências de recorrentes valem todo mês (o SALDO segue a regra da tela Metas, recorrente uma vez — limitação documentada em teste); meses = ceil(falta/ritmo), teto 120 (>10 anos). Aparece na tela Investir (principal, acima da estimativa da sobra sugerida), no `/reserva` e no N23
- v1.6.179 — Item 3 do plano de melhorias: LIMITE MENSAL POR TAG (opcional, editável a qualquer momento). Dado: `config.tags[i].limite` (R$, campo opcional; `setTagLimit`/`limiteDaTag`/`statusLimite`/`limitesDoMes` em `src/utils/tags.js`; renomear preserva). UI: botão "+ Limite" em Configurações → Tags (`TagSettings.jsx`) e bloco "Limites do mês" na aba Tags do Painel (só períodos Mês atual/anterior). Bot: alerta N27 em `lib/alertas/notificacoes.js` (80% e >100%, estado `tag-limite:<mês>:<tag>`, sig 80/100, só tags com limite, gasto por competência), linhas de limite no `/tags`. `n27` entrou nas listas do app (`notificationTypes.js`) e do bot (`configurar.js`); n26 fica reservado para o aviso de assinaturas; `limiteTag.test.js` compara as duas listas. Armadilha encontrada na tela: regex com `d` perdeu a barra ao gravar o arquivo (campo apagava os dígitos) — conferir regex no navegador
- v1.6.178 — Item 1 do plano de melhorias: ASSINATURAS. Motor `src/utils/assinaturas.js` (app) + cópia `functions/lib/motor/assinaturas.js` (bot), paridade testada em 300 cenários; regras: mesma descrição normalizada (sem números/datas) em meses seguidos, 1 ocorrência por mês, valor estável (≤1 mudança >5%), deslize de 3 dias entre meses, tag "Assinaturas" sempre inclui, itens variáveis à parte; recorrentes comuns (saída mensal/semanal) numa seção separada. UI: aba Assinaturas no Painel (`AssinaturasTab.jsx`, "Ocultar" grava `config.assinaturasIgnoradas`); bot: `/assinaturas`. NOVO modo demonstração: `npm run dev:demo` (porta 5174, `.claude/launch.json` "demo") troca firebase/hooks por `src/demo/*` com dados fictícios (alias só no modo demo; não vai ao build). Próximos itens do plano: 2 (aviso de reajuste/assinatura nova, N26 nasce DESLIGADO até revisar a lista), 3 (limite por tag, opcional), 5 (reserva no ritmo atual), 4 (data de quitação das parcelas)
- v1.6.177 — Segredo do webhook no Secret Manager: `defineSecret('TELEGRAM_SECRET_TOKEN')` ligado em `lib/entradas/webhookTelegram` e `setWebhook` (`firebase functions:secrets:set TELEGRAM_SECRET_TOKEN`); depois do deploy é preciso REGISTRAR o webhook de novo (POST em `setTelegramWebhook` com `{url}`) para o Telegram passar a enviar o cabeçalho. Corrige o 503 que derrubava comandos/botões desde a v1.6.150
- v1.6.176 — Divisão do `functions/index.js`, etapa 5/5 (concluída): `lib/entradas` (roteador, webhookTelegram, agendador, sendTestPush, setWebhook, smsWebhook); `index.js` virou fachada de 45 linhas que só registra as 5 funções e expõe `__test` sob VITEST. Estrutura final: `lib/infra`, `lib/util`, `lib/motor`, `lib/alertas`, `lib/comandos`, `lib/acoes`, `lib/onboarding`, `lib/entradas`. Para achar uma função: o nome do módulo diz a área; `npm run lint:functions` pega import esquecido
- v1.6.175 — Divisão do `functions/index.js`, etapa 4/5: `lib/acoes` (pagar, despesaPendente, callbacks), `lib/onboarding` (passos, fluxo) e `lib/comandos/vincular`. Movido VERBATIM por script; validado por lint:functions, fumaca.test.js e suíte completa
- v1.6.174 — Divisão do `functions/index.js`, etapa 3/5: `lib/comandos` (consultas, planejamento, gastos, investimentos, faturas, configurar, ajuda). Movido VERBATIM por script; validado por lint:functions, fumaca.test.js e suíte completa
- v1.6.173 — Divisão do `functions/index.js`, etapa 2/5: `lib/alertas` (notificacoes = checkNotifications N1-N23, aporte = N24, acimaMedia = N25, economiaDia = N18, memoria = memória de avisos). Movido VERBATIM por script; validado por lint:functions, fumaca.test.js e suíte completa
- v1.6.172 — Divisão do `functions/index.js`, etapa 1/5: `lib/infra` (firebase, telegram, config, dados), `lib/util` (datas, formato) e `lib/motor` (caixa, competência, fatura projetada, sobra, caixinha, parcelados). Código movido VERBATIM por script (trecho a trecho, comparado ao original) e conferido por `npm run lint:functions` + `fumaca.test.js`
- v1.6.171 — Etapa 0 da divisão do `functions/index.js` em módulos: `fumaca.test.js` (todo comando/botão/exportada roda sem erro) e `npm run lint:functions` (`eslint.functions.config.mjs`, só `no-undef`; também roda no release)
- v1.6.170 — Revisão geral final: removida constante sem uso (`PROJECT_ID`) e corrigida nota desatualizada do onboarding neste arquivo. Suíte (494 testes) verificada em 4 fusos horários (UTC, São Paulo, Tóquio, Los Angeles). Risco conhecido: o bot depende de o servidor rodar em UTC (`getNowBrasilia` devolve uma data "deslocada" lida com getHours/getDate locais) — os testes fixam TZ=UTC como na produção
- v1.6.169 — N23: fim do mês = `min(30, último dia do mês)` (fevereiro 28/29; demais meses seguem no dia 30); cabeçalho com o dia real; `n23.test.js` varre todos os dias de 2026 e fev/2028 (exatamente 2 relatórios por mês). Escolhida a regra R1 (R2 = sempre o último dia, mudaria 7 meses)
- v1.6.168 — Home: banner da reserva usa `resumoReservaHome`/`acharCaixinhaReserva` (`src/utils/caixinha.js`): caixinha = `config.investimentos.reservaGoalId` (senão o nome), saldo = `saldoCaixinha` (igual Metas; recorrente conta uma vez), meta = `goal.metaFinal` (senão `despesasMens × mesesMeta`), caso `semMeta` com botão "Definir a meta da reserva". Antes: busca só por nome, saldo pelo sinal do caixa (aporte negativo), meta de 3 fontes. `caixinha.test.js` (18)
- v1.6.167 — Onboarding: comandos "/x" passam durante o cadastro (com lembrete; `/pular` segue sendo resposta); `completeOnboarding` grava em `notificacoes.telegramTipos` (base = telegramTipos ou tipos atuais) e não mexe mais em `tipos` (push). Todos os 4 defeitos do onboarding resolvidos (v1.6.166 e v1.6.167). Escolhido entre 5 planos: Plano 2 (duas versões por risco)
- v1.6.166 — Onboarding: estado gravado com `mergeFields:['telegramOnboarding']` (substitui; `merge:true` mesclava `data` e vazava `tempSelections`), `completeOnboarding` descarta `tempSelections`, horário reconhecido por número inteiro. (defeitos 3 e 4 resolvidos na v1.6.167)
- v1.6.165 — Testes do onboarding (`onboarding.test.js`); o Firestore fake agora mescla mapas aninhados em `set(..., {merge:true})` como o real (isso expôs o vazamento de `tempSelections`, corrigido na v1.6.166). Os 4 defeitos do onboarding foram resolvidos nas v1.6.166 e v1.6.167
- v1.6.164 — N24/N25 passam a devolver `{ text, confirmar }`: o estado (`reservaTracking.lastRemindData`, `alertasAcimaMedia`) só é gravado DEPOIS de o Telegram aceitar o envio (falha = tenta de novo no próximo ciclo das 19h); `n25.test.js` + casos de falha em `agendador.test.js`. Escolhido entre 3 planos (só testes / testes + confirmar-depois-do-envio / migrar para `alertasEstado`): a migração foi descartada por risco e porque a regra de 5 dias do N24 não cabe no modelo de assinatura
- v1.6.163 — N24 corrigido (só bot): aporte reconhecido por OCORRÊNCIAS de sobraData até hoje, inclusive (recorrente e mesmo dia), sobra zerada encerra o rastreio, aviso usa min(valor guardado, sobra de hoje); `n24Diferencial.test.js` prova identidade com a versão antiga nos aportes únicos. Aporte agendado para o futuro não encerra a cobrança (a sobra já o desconta). Efeito conhecido: o aporte que reinicia o rastreio é visto mais uma vez no dia seguinte (atrasa a cobrança em 1 dia, uma vez)
- v1.6.162 — Testes do N24 (`n24.test.js`) e do agendador `dailyNotifications.run` (`agendador.test.js`; `helpers.js` fixa TZ=UTC como a produção e simula o push). (achados do N24 resolvidos na v1.6.163.) N24/N25 só rodam no ciclo das 19h (junto do N18), independente de `horaAlerta`
- v1.6.161 — Reserva de emergência = saldo da caixinha por `metaId` (mesma regra da tela Metas/`/meta`): `src/utils/caixinha.js` (`saldoCaixinha`, `reservaDaCaixinha`) usada na tela Investir; `saldoCaixinhaBot`/`reservaDaCaixinhaBot` no bot (N23, `/reserva`, `/investimentos`); `reserva.test.js` compara com a conta literal da tela Metas. Antes procurava `goalId`/`cartaoVinculo` (nunca gravados). Aporte recorrente conta uma vez (como na tela Metas). (N23 em fevereiro resolvido na v1.6.169); (card de reserva da Home corrigido na v1.6.168)
- v1.6.160 — Testes do N23 (`n23.test.js`)
- v1.6.159 — Removidos `calcFaturaCardBot`/`calcCicloFaturaBot`/`vencimentoAnteriorBot`; o bot só tem `calcFaturaCardApp` (paridade total com o app, sem divergências conhecidas de fatura)
- v1.6.158 — Bot: `handlePayCardCallback` paga a fatura da DATA do botão por ocorrências pendentes (fatura paga continua projetando; real vira conferida; projeções viram um pagamento + exclusão no original; nada pendente = no-op "já estava paga"); N1/N2 mandam a data real do vencimento; `pagoCartao.test.js`.
- v1.6.157 — Bot: `calcParceladosBot` (por ocorrências, só leitura) alimenta `/parcelados`; fatura paga continua listando parcelas futuras e avulsos contam só de hoje em diante; `parcelados.test.js` (inclui bate-com-o-caixa)
- v1.6.156 — Bot: `calcFaturaCardApp` (cópia fiel de `calcFaturaCard` do app, por expansão de ocorrências) alimenta `/fatura` e N11, só leitura; `faturaPeloApp.test.js` compara 400 cenários com o app (zero diferenças). (resolvido na v1.6.157)
- v1.6.155 — Bot: `calcFaturaCardBot` espelha a regra de fatura em atraso do app (`calcCicloFaturaBot` + `vencimentoAnteriorBot`); `handlePayCardCallback` quita a fatura real do ciclo (não cria 2º pagamento). Divergência que RESTA (documentada em `paridade.test.js`): parcelas futuras de fatura já paga — o app conta na fatura do mês, o bot ignora lançamentos conferidos
- v1.6.154 — Fix functions com firebase-admin 14 (`getFirestore`/`FieldValue`/`getMessaging` de `firebase-admin/*`; `admin.firestore()` não existe mais). `carga.test.js` carrega o `index.js` com as libs reais como o deploy; o fake de Firestore agora entra via `require.cache` de `firebase-admin/firestore`
- v1.6.153 — Firebase atualizado: app `firebase` 13, functions `firebase-admin` 14 e `firebase-functions` 7. Resta 1 alerta do `npm audit` no app (`@grpc/grpc-js` dentro do `@firebase/firestore`; é código de Node, não vai no bundle do navegador)
- v1.6.152 — Testes do bot de ponta a ponta: `functions/__tests__/fakeFirestore.js` (Firestore em memória, injetado no `firebase-admin` por `helpers.js`), `comandos.test.js` (comandos, Pago/Adiar), `webhooks.test.js` (telegramWebhook e smsWebhook). `firebase.json` ignora `__tests__` no deploy
- v1.6.151 — Testes do bot em `functions/__tests__/` (`helpers.js` carrega o `index.js` com `VITEST=true`, que expõe `__test`): paridade app×bot (`paridade.test.js`) e alertas/dedupe (`alertas.test.js`). Divergência conhecida documentada: fatura vencida não paga (app mostra a vencida, bot a próxima). Ao mudar regra de caixa/competência/alerta, rodar `npx vitest run`
- v1.6.150 — Estado de avisos só dos enviados (`estadoAposEnvio`); webhook Telegram recusa sem `TELEGRAM_SECRET_TOKEN`; regra `users/{uid}` bloqueia o app de alterar `telegramChatId` (deploy: `firebase deploy --only firestore:rules`); `npm audit fix`; lint limpo (resta só react-refresh em AppContext)
- v1.6.149 — Telegram/push sem repetição (estado em `alertasEstado/{uid}`, `estado:{chave,sig,repetirDias}` nas msgs, `filtrarAlertasRepetidos`); Liberdade = meta; sobra segura ≥ R$ 200 (`SOBRA_MINIMA`) + próxima janela (`sobraPorData`/`resumirSobra` no app, `calcSobraSeguraBot` no bot); fix dupla contagem de hoje no bot
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
