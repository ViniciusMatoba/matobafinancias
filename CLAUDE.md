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
npm run release              # commit + push + build + deploy
npm run release -- "Título"  # idem, com descrição no commit
```

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
- **Versão atual**: v1.6.136

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

**Versão**: v1.6.136 — 26/09/2026

**Últimas features**:
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
- `InvestimentosScreen.jsx` — tela de alocação: perfil de trabalho, meses de reserva, despesas fixas (auto-sugeridas), vínculo com caixinha (goal), distribuição 60/40 da sobra
- `config.investimentos` — `{ perfil, mesesMeta, despesasMens, reservaGoalId }` persistido no Firestore
- `calcularSobraSegura` (projectionCalc.js) — usa o **mínimo** do saldo projetado em 45 dias, subtrai buffer fixo de R$500 (`BUFFER_CAIXA`); retorna também `dataMinimoSaldo` e `minimoSaldo`
- `saldoColor()` em ProjectionScreen.jsx — gradiente verde/amarelo/vermelho baseado no saldo (>500 verde, 500 amarelo, <0 vermelho)
- Cloud Function N22 — espelha `calcularSobraSegura` do frontend, envia aviso diário no Telegram quando há sobra
- Cloud Function N23 — dias 15/30: lê `config.investimentos`, calcula reserva atual via transações vinculadas ao `goalId`, envia relatório ou mensagem motivacional
- `config.investidor10Url` — URL da carteira no Investidor 10; card "Total Investido" na Home abre link (com modal de cadastro se ainda não configurado)
- BottomNav atual: Início / Investir / (+) / Projeção / Config — atalho para Painel (reports) fica dentro da Home
- `CartaoFaturaCard.jsx` — componente de card de cartão na Home (atualmente removido da Home, arquivo existe)
- `calcFaturaCard` — usa `cartaoVinculo` além de `cartaoId` para vincular provisões
- `cardBadges` no ProjectionScreen — usa clamp `Math.min(diaVenc, lastDayOfMonth)` para meses curtos
- `saldoInicial` no ProjectionScreen — inclui `wInitials` das carteiras, sem `historical:true`
