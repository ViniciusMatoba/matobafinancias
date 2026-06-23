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
| `settings` | `SettingsScreen` |

---

## Sistema de Versão

- **Arquivo**: `src/utils/version.js` — exporta `APP_VERSION`, `APP_VERSION_DATE`, `CHANGELOG[]`
- **Versão atual**: v1.6.5

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

**Versão**: v1.6.71 — 17/06/2026

**Últimas features**:
- v1.6.71 — Fix calcFaturaCard: soma lançamentos no período (prevClosing, thisClosing] usando getClosingDate real do cartão
- v1.6.65 — Fix projeção: badge de vencimento filtra ocorrências por data exata do lançamento (expandOccurrences thisVenc→thisVenc)
- v1.6.61 — Fix notificação de atualização: SW NetworkOnly + evento pwa-update-ready + polling 60s
