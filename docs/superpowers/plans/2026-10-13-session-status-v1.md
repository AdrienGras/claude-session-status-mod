# session-status v1 — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** livrer la v1 du mod Claude Code `session-status` — carte compacte au-dessus du prompt + panneau latéral `/sst` — qui remplace `ccstatusline`.

**Architecture :** un module de hooks TypeScript. La logique pure (formatage, burn-bar, barres, contexte, git, compteurs, réglages) vit dans des fichiers `hooks/*.ts` testés unitairement ; `hooks/track.ts` branche les événements de session sur des atomes `$.state` ; `hooks/card.tsx`, `hooks/pane.tsx`, `hooks/settings-view.tsx` dessinent à partir de ces atomes ; `hooks/register.tsx` assemble.

**Tech stack :** API des mods Claude Code (`claude-code`, `claude-code/testing`), TypeScript/TSX, `claude plugin validate`, `claude plugin test`, `tsc`.

**Spec :** `docs/superpowers/specs/2026-10-13-session-status-design.md` (à lire avant toute tâche).

**Périmètre :** v1 seulement. La v2 (sous-agents, permissions, journal) et la vX (traduction) auront leur propre plan.

## Global Constraints

- Nom du plugin `session-status`, commande `/sst` ; id du panneau `sst`.
- Version cible Claude Code **2.1.296** ; aucune garantie plus ancienne.
- Toute l'interface et le README **en anglais** ; toutes les chaînes affichées dans `hooks/strings.ts`.
- Couleurs : uniquement des `ThemeKey` (ou la `color` fournie par l'API pour les catégories de contexte), jamais d'hexa.
- Paliers contexte : `success` < 50 ≤ `warning` < 80 ≤ `error`. Paliers projection quota : `success` < 80 ≤ `warning` < 130 ≤ `error`. Faible confiance (< 10 % de fenêtre écoulée) : `inactive`.
- `breakdown: 'full'` uniquement sur action explicite de l'utilisateur ; la carte et les rafraîchissements utilisent `'summary'`.
- Chaque hook d'observation rend `next(e)` inchangé ; aucun `deny`, aucune réécriture.
- Une donnée absente est masquée (ou `—`), jamais affichée à 0 ; un chiffre estimé est préfixé `≈` ou `~`.
- Réglages uniquement dans `$.store` ; jamais d'écriture dans les settings utilisateur ; pas de `userConfig` en v1.
- Pas de toast, pas d'ouverture de panneau non demandée.
- Durées : `<1m`, `1m`, `4h36`, `3d3h`, `2d`, `∞`.

## Review Focus

1. **Compte sans abonnement / avant la première réponse** (`rateLimits` vide) : aucune ligne de quota dans la carte ni dans le panneau, pas de ligne vide ni de `0%`. → test dans Task 9 et Task 10.
2. **Hors dépôt git, git absent, pas d'upstream** : la section Dépôt affiche le dossier seul, sans erreur ni `↑0 ↓0` inventé. → test dans Task 6.
3. **`context.tokens` / `percent` indéfinis** (début de session) : contexte affiché `—`, barre vide, pas de `0%`. → test dans Task 5 et Task 9.
4. **Dépassements** (`tokens > window`, `percentUsed > 100` sur `spend_limit`) : barres bornées à pleine largeur, libellés avec la vraie valeur (`112%`). → test dans Task 4.
5. **Panneau inline étroit** (`placement: 'inline'`, `bodyColumns` ≈ 60) : aucune ligne ne déborde, les barres rétrécissent. → test dans Task 10.

---

## Structure des fichiers

```
.claude-plugin/plugin.json        manifeste (name, version, description, types)
.claude-plugin/marketplace.json   rend le dépôt installable
hooks/hooks.json                  { "modules": ["./register.tsx"] }
hooks/register.tsx                assemblage : tracking, commandes, rendus
hooks/strings.ts                  toutes les chaînes UI (anglais)
hooks/format.ts                   durées, tokens, dollars, heure
hooks/burn.ts                     calcul burn-bar + verdict + paliers de couleur
hooks/bars.ts                     barres au 1/8, barre burn avec repère, barre segmentée
hooks/context.ts                  segments de contexte, MCP par serveur, marge avant compactage
hooks/git.ts                      parseurs git + lecture via $.process avec cache
hooks/session.ts                  vitesse d'un appel, coûts dérivés, ticket du tour
hooks/settings.ts                 type Settings, défauts, normalisation, $.store
hooks/state.ts                    atomes $.state
hooks/track.ts                    branchement des événements → atomes
hooks/card.tsx                    rendu AbovePrompt
hooks/pane.tsx                    rendu du panneau (sections + actions)
hooks/settings-view.tsx           vue réglages dans le panneau
types/index.d.ts                  contrat PluginState['session-status'] + types partagés
tests/*.test.ts                   un fichier par module
tsconfig.json                     extends ./.claude-plugin/types/tsconfig.json
README.md, LICENSE (MIT)
```

Commande de vérification commune (appelée **CHECK** plus bas) :

```bash
claude plugin validate . && tsc -p . && claude plugin test .
```

Référence pour le kit de test : les typings de `claude-code/testing` (dans `.claude-plugin/types/claude-code/index.d.ts` une fois le mod chargé) et, comme exemple d'usage, `~/.claude/plugins/cache/claude-flightdeck/flightdeck/0.4.0/tests/flightdeck.test.ts`.

---

### Task 1 : squelette chargeable + `/sst debug`

**Files :**
- Create : `.claude-plugin/plugin.json`, `hooks/hooks.json`, `hooks/register.tsx`, `hooks/strings.ts`, `types/index.d.ts`, `tsconfig.json`, `LICENSE`, `tests/register.test.ts`
- Modify : `.gitignore` (ajouter `.claude-plugin/types/`)

**Interfaces :**
- Produces : `register: Register` ; commande `sst` enregistrée au `session.start` (`description: S.commandDescription`) ; `/sst debug` renvoie `{ text }` = JSON indenté de `await $.session.usage({ breakdown: 'summary' })` + `model`, dernier `effort` vu, dernier `permission_mode` vu, `kind` de chaque `rateLimits`. `S` exporté depuis `hooks/strings.ts`.

- [ ] **Step 1 : test qui échoue** — `tests/register.test.ts` : `test('/sst debug dumps the raw readings')` : après `session.start`, `command.run` `{ command: 'sst', args: 'debug' }` renvoie un `text` qui contient `"context"` et `"rateLimits"`.
- [ ] **Step 2 :** `claude plugin test .` → FAIL (module absent).
- [ ] **Step 3 :** écrire le manifeste (`"name": "session-status"`, `"version": "0.1.0"`, `"types": "./types/index.d.ts"`, auteur AdrienGras, licence MIT), `hooks.json`, `tsconfig.json` (`{ "extends": "./.claude-plugin/types/tsconfig.json" }`), `types/index.d.ts` (module `claude-code` augmenté, `PluginState['session-status']` vide pour l'instant), et `register.tsx` avec `session.start` + `command.run` `{ command: 'sst' }`. Mémoriser `effort` depuis `turn.step` (`e.effort`) et `permission_mode` depuis `classic.UserPromptSubmit` dans des variables du module pour le dump.
- [ ] **Step 4 :** CHECK → PASS.
- [ ] **Step 5 : vérification sur une vraie session** — `claude --plugin-dir /srv/AdrienGras/claude-session-status-mod`, envoyer un prompt, puis `/sst debug`. Noter dans la description de la PR/issue : les `kind` de quota réellement reçus, la présence de `effort` et de `permission_mode`, la présence de `context.breakdown.categories` avec `color`/`kind`. Si `permission_mode` n'arrive pas par `classic.UserPromptSubmit`, le signaler : la Task 8 masquera le mode.
- [ ] **Step 6 : commit** — `feat: loadable plugin skeleton with /sst debug`.

### Task 2 : formatage

**Files :** Create `hooks/format.ts`, `tests/format.test.ts`

**Interfaces :**
- Produces : `fmtDur(ms: number): string` ; `fmtTokens(n: number): string` ; `fmtUsd(usd: number): string` ; `fmtClock(epochMs: number): string` (heure locale `HH:MM`).

- [ ] **Step 1 : tests** — `fmtDur` : `30_000→'<1m'`, `89_000→'1m'`, `90_000→'2m'`, `3_600_000→'1h'`, `(4h36m)→'4h36'`, `270_000_000→'3d3h'`, `172_800_000→'2d'`, `-10_000→'<1m'`, `Infinity→'∞'`. `fmtTokens` : `140_000→'140k'`, `1_000_000→'1M'`, `1_500_000→'1.5M'`, `999→'1k'`, `0→'0k'`. `fmtUsd` : `4.823→'$4.82'`, `104.4→'$104'`. `fmtClock` : une date construite en local à 17:40 → `'17:40'`.
- [ ] **Step 2 :** CHECK → FAIL.
- [ ] **Step 3 :** implémenter (mêmes arrondis que `fmt_dur` / `fmt` de `burn-bar.py` et `context-bar.py`, jours en `d`).
- [ ] **Step 4 :** CHECK → PASS.
- [ ] **Step 5 : commit** — `feat: duration, token and cost formatting`.

### Task 3 : calcul burn-bar

**Files :** Create `hooks/burn.ts`, `tests/burn.test.ts` ; Modify `hooks/strings.ts`

**Interfaces :**
- Produces :
  - `WINDOW_MS: Record<'five_hour' | 'seven_day', number>` (`5h`, `7d` en ms)
  - `type Burn = { usedPct: number; elapsedFrac: number; remainingMs: number; projection: number; juiceMs: number; marginMs: number; isLowConfidence: boolean }`
  - `computeBurn(usedPct: number, resetsAtMs: number, durationMs: number, nowMs: number): Burn | null`
  - `burnVerdict(b: Burn): string` → `'⛔ limit'`, `'✓ ∞'`, `'✓ +7h30'`, `'⚠ wall 1h04'`
  - `projectionText(b: Burn): string` → `'→ 40%'`, `'→ ~60%'`, `'→ >999%'`
  - `projectionTone(b: Burn): ThemeKey` ; `contextTone(pct: number): ThemeKey`

- [ ] **Step 1 : tests** — port de `test_burn_bar.py` en ms (`NOW = 1_000_000_000`, `H = 3_600_000`) :
  - A : `computeBurn(20, NOW+2.5H, 5H, NOW)` → `projection≈40`, `elapsedFrac≈0.5`, `juiceMs≈10H`, `marginMs≈7.5H`, `isLowConfidence=false` ; `burnVerdict→'✓ +7h30'`.
  - B : `(70, …)` → `projection≈140`, `juiceMs≈3_857_140 (±1000)`, `burnVerdict→'⚠ wall 1h04'`.
  - C : `(3, NOW+0.95×5H, 5H, NOW)` → `elapsedFrac≈0.05`, `projection≈60`, `isLowConfidence=true`, `projectionText→'→ ~60%'`, `projectionTone→'inactive'`.
  - D : `(0, …)` → `projection=0`, `juiceMs=Infinity`, `burnVerdict→'✓ ∞'`.
  - E : `(100, …)` → `juiceMs=0`, `burnVerdict→'⛔ limit'`.
  - F : `(23, NOW+3.5d, 7d, NOW)` → `projection≈46`.
  - G : `resetsAt` déjà passé → résultat non nul.
  - Paliers : `projectionTone` à 79→`success`, 80→`warning`, 129→`warning`, 130→`error` ; `contextTone` 49→`success`, 50→`warning`, 80→`error`.
- [ ] **Step 2 :** CHECK → FAIL.
- [ ] **Step 3 :** implémenter (formules de la spec, section « Logique des quotas » ; plancher de confiance 0.10). Chaînes `wall`, `limit` dans `strings.ts`.
- [ ] **Step 4 :** CHECK → PASS.
- [ ] **Step 5 : commit** — `feat: burn-rate projection ported from burn-bar.py`.

### Task 4 : barres

**Files :** Create `hooks/bars.ts`, `tests/bars.test.ts`

**Interfaces :**
- Produces :
  - `type Cell = { text: string; color?: string; role: 'fill' | 'marker' | 'empty' }`
  - `eighthBar(fraction: number, width: number, color: string): Cell[]` — remplissage au 1/8 (`▏▎▍▌▋▊▉█`), vide = espaces, `fraction` bornée à [0, 1]
  - `burnBar(b: Burn, width: number): Cell[]` — `eighthBar(usedPct/100)` + repère `┊` (role `marker`, color `text`) à `min(width-1, floor(elapsedFrac × width))`
  - `segmentBar(segments: Segment[], total: number, width: number): Cell[]` — chaque segment proportionnel à `tokens/total`, au 1/8 près, dans sa `color`
- Consumes : `Burn`, `projectionTone` (Task 3) ; `Segment` (défini dans `types/index.d.ts` ici : `{ label: string; tokens: number; color: string; kind: 'used' | 'free' | 'buffer' }`).

- [ ] **Step 1 : tests** — `eighthBar(0.14, 10)` : 1 `█` puis `▍` puis 8 espaces (10 cellules au total). `eighthBar(1.12, 10)` : 10 `█` (borné, Review Focus 4). `eighthBar(0, 10)` : 10 espaces. `burnBar` cas A, largeur 10 : repère en index 5, 2 `█` avant. `segmentBar` avec segments `[60k, 40k]` sur total `100k`, largeur 10 : 6 cellules de la 1re couleur, 4 de la 2e ; la somme des cellules vaut toujours `width`.
- [ ] **Step 2 :** CHECK → FAIL.
- [ ] **Step 3 :** implémenter.
- [ ] **Step 4 :** CHECK → PASS.
- [ ] **Step 5 : commit** — `feat: eighth-cell, burn and segmented bars`.

### Task 5 : modèle du contexte

**Files :** Create `hooks/context.ts`, `tests/context.test.ts`

**Interfaces :**
- Consumes : `SessionUsage['context']` et son `breakdown` (API).
- Produces :
  - `toSegments(breakdown: SessionContextBreakdown, tokens: number | undefined, window: number): Segment[]` — catégories `kind: 'deferred'` exclues ; catégories `used` et `buffer` mises à l'échelle pour que leur somme égale `tokens` (si `tokens` défini) ; un segment `free` = `window − somme`, couleur `subtle` ; `buffer` couleur `subtle`
  - `contextLabel(tokens: number | undefined, window: number): { text: string; pct: number | null }` → `'140k/1M 14%'` ; `'—'` et `pct: null` si `tokens` indéfini
  - `mcpByServer(tools: ContextMcpTool[]): { server: string; tokens: number; count: number }[]` trié par tokens décroissants
  - `compactHeadroom(tokens: number | undefined, threshold: number | undefined): number | null`

- [ ] **Step 1 : tests** — breakdown fictif (catégories `System prompt 6k used`, `Messages 90k used`, `Autocompact buffer 45k buffer`, `Deferred tools 3k deferred`, `Free space … free`), `tokens = 140k`, `window = 1M` : pas de segment `deferred` ; somme `used`+`buffer` = 140k ; segment `free` = 860k. `contextLabel(undefined, 1M)` → `{ text: '—', pct: null }` (Review Focus 3). `contextLabel(1_120_000, 1M)` → `'1.1M/1M 112%'`. `mcpByServer` regroupe deux outils du même serveur. `compactHeadroom(140k, 160k)` → `20k` ; `(140k, undefined)` → `null`.
- [ ] **Step 2 :** CHECK → FAIL.
- [ ] **Step 3 :** implémenter ; branche sur `kind`, jamais sur `name`.
- [ ] **Step 4 :** CHECK → PASS.
- [ ] **Step 5 : commit** — `feat: context segments and breakdown helpers`.

### Task 6 : git

**Files :** Create `hooks/git.ts`, `tests/git.test.ts` ; Modify `types/index.d.ts`

**Interfaces :**
- Produces :
  - `type GitSnapshot = { cwd: string; repo: string | null; branch: string | null; files: number; added: number; removed: number; ahead: number | null; behind: number | null; sessionFiles: string[] }` (dans `types/index.d.ts`)
  - `parseRemote(url: string | null): string | null` — `git@github.com:AdrienGras/x.git`, `https://github.com/AdrienGras/x(.git)`, `ssh://git@host:22/o/r.git` → `'AdrienGras/x'` / `'o/r'`
  - `parseShortstat(out: string): { files: number; added: number; removed: number }` — sortie vide → zéros
  - `parseAheadBehind(out: string): { ahead: number; behind: number } | null` — sortie de `git rev-list --left-right --count @{u}...HEAD` (`behind\tahead`)
  - `parsePorcelain(out: string): string[]` — chemins (renommages : chemin de destination)
  - `readGit($, startedAt: number): Promise<GitSnapshot>` — `$.session.cwd()`, `$.session.repo()`, puis `$.process.run(['git', …])` ; `sessionFiles` = fichiers du porcelain dont `$.fs.stat(path).mtimeMs >= startedAt` ; cache module de 5 s
- [ ] **Step 1 : tests** — parseurs sur les formes ci-dessus. `readGit` dans le kit avec `$.process.run` simulé : hors dépôt (`repo()` → `null`, `git` exit 128) → `{ cwd, repo: null, branch: null, files: 0, …, ahead: null, behind: null, sessionFiles: [] }` sans exception ; upstream absent (exit ≠ 0 sur `rev-list`) → `ahead/behind: null` (Review Focus 2).
- [ ] **Step 2 :** CHECK → FAIL.
- [ ] **Step 3 :** implémenter.
- [ ] **Step 4 :** CHECK → PASS.
- [ ] **Step 5 : commit** — `feat: git readings for the repo section`.

### Task 7 : réglages et atomes d'état

**Files :** Create `hooks/settings.ts`, `hooks/state.ts`, `tests/settings.test.ts` ; Modify `types/index.d.ts`

**Interfaces :**
- Produces (types dans `types/index.d.ts`) :
  - `type CardLine = 'model' | 'context' | 'five_hour' | 'seven_day' | 'cost' | 'repo'`
  - `type Settings = { cardLines: CardLine[]; barWidth: number }` ; `DEFAULT_SETTINGS = { cardLines: ['model', 'context', 'five_hour'], barWidth: 10 }`
  - `normalizeSettings(raw: unknown): Settings` — lignes inconnues retirées, doublons retirés, ordre conservé ; `barWidth` entier borné [6, 24]
  - `loadSettings($): Promise<Settings>` / `saveSettings($, s: Settings): Promise<void>` sur la clé `$.store` `'settings'`
  - `type Live = { model: string | null; effort: string | null; permissionMode: string | null; isWorking: boolean; requests: number; speed: { ttftMs: number; tokPerS: number | null } | null }`
  - `type Counters = { since: number; compactions: number; tools: Record<string, number>; subagents: number }`
  - `type Receipt = { isRunning: boolean; startedAt: number; durationMs: number | null; agents: number; edits: number; errors: number; costAddedUsd: number | null }`
  - `type UsageView = { startedAt: number; tokens?: number; window: number; rateLimits: SessionRateLimit[]; costUsd?: number; prompts: number; breakdown: SessionContextBreakdown | null; breakdownDetail: 'summary' | 'full' }`
  - `PluginState['session-status'] = { usage: UsageView | null; live: Live; counters: Counters; receipt: Receipt | null; git: GitSnapshot | null; settings: Settings; view: 'main' | 'settings'; expanded: string[] }`
  - `hooks/state.ts` : un `atom` par clé ci-dessus, `{ plugin: 'session-status', key }`.
- [ ] **Step 1 : tests** — `normalizeSettings(undefined)` → défauts ; `{ cardLines: ['cost', 'bogus', 'cost'], barWidth: 99 }` → `{ cardLines: ['cost'], barWidth: 24 }` ; `barWidth: 2` → `6`. Aller-retour `saveSettings`/`loadSettings` dans le kit.
- [ ] **Step 2 :** CHECK → FAIL.
- [ ] **Step 3 :** implémenter.
- [ ] **Step 4 :** CHECK → PASS.
- [ ] **Step 5 : commit** — `feat: settings store and state contract`.

### Task 8 : suivi de session

**Files :** Create `hooks/session.ts`, `hooks/track.ts`, `tests/session.test.ts`, `tests/track.test.ts` ; Modify `hooks/register.tsx`

**Interfaces :**
- Consumes : atomes (Task 7), `readGit` (Task 6).
- Produces :
  - `stepSpeed(sentAt: number, firstAt: number | null, stopAt: number, outTokens: number | null): { ttftMs: number; tokPerS: number | null } | null`
  - `costRates(costUsd: number | undefined, startedAt: number, now: number, prompts: number): { perHour: number | null; perPrompt: number | null }` — `null` si coût absent, durée < 1 min ou 0 prompt
  - `registerTracking(on: On): void`, appelé par `register` ; écoute :
    - `session.start` et `session.measure` → `usage` (`$.session.usage({ breakdown: 'summary' })`, `$.session.turns()`) ; si `startedAt` change (`/clear`), remise à zéro de `counters` (`since = now`) et `receipt`
    - `turn.step` (boucle principale, sans `agentId`) → `live.model`, `live.effort` (masqué si absent), `live.requests += 1`, `live.speed` (chronométré autour du flux `next(e)` : envoi, premier fragment non `engine`, `stop` ; `output_tokens` du résultat)
    - `classic.UserPromptSubmit` → `live.permissionMode`
    - `turn.start` (principale) → `live.isWorking = true`, `receipt = { isRunning: true, … }` ; `turn.complete` (principale) → `isWorking = false`, `receipt` finalisé (durée, `costAddedUsd` = différence de `cost.usd`), puis `readGit` → `git`
    - `session.compact` → `counters.compactions += 1`
    - `tool.call` → `counters.tools[e.tool] += 1` ; pendant un tour : `edits += 1` pour `Edit`/`Write`/`NotebookEdit`, `errors += 1` si le résultat est en erreur
    - `agent.spawn` → `counters.subagents += 1`, `receipt.agents += 1`
  - tous les hooks rendent le résultat de `next(e)` inchangé
- [ ] **Step 1 : tests** — `stepSpeed(0, 800, 2800, 84)` → `{ ttftMs: 800, tokPerS: 42 }` ; `firstAt: null` → `null`. `costRates(4.8, 0, 2H, 24)` → `{ perHour: 2.4, perPrompt: 0.2 }` ; `costRates(undefined, …)` → nulls. Kit : un `session.compact` incrémente `compactions` ; un `tool.call` `Edit` dans un tour incrémente `tools.Edit` et `receipt.edits` ; un `session.measure` avec un nouveau `startedAt` remet `counters` à zéro ; chaque hook renvoie exactement le résultat de `next`.
- [ ] **Step 2 :** CHECK → FAIL.
- [ ] **Step 3 :** implémenter.
- [ ] **Step 4 :** CHECK → PASS.
- [ ] **Step 5 : commit** — `feat: live session tracking`.

### Task 9 : carte compacte

**Files :** Create `hooks/card.tsx`, `tests/card.test.ts` ; Modify `hooks/register.tsx`, `hooks/strings.ts`

**Interfaces :**
- Consumes : atomes, `settings`, `burnBar`, `segmentBar`, `toSegments`, `contextLabel`, `burnVerdict`, `projectionText`, formatage.
- Produces : hook `ui.render` `{ component: 'AbovePrompt' }` ; `next(e)` si `e.surface !== 'terminal'` ou `e.props.hasSurvey`. Sinon : `Box` `justifyContent="flex-end"` contenant une `Box` `borderStyle="round"` avec une ligne par entrée de `settings.cardLines` dont la donnée existe :
  - `model` : modèle (`claude`, gras) + `effort ▮▮▮▯▯ high` (5 crans `low…max` ; masqué si `effort` nul)
  - `context` : `ctx` + `segmentBar(width = barWidth)` + `contextLabel` (couleur `contextTone`)
  - `five_hour` / `seven_day` : `5h` / `7d` + `burnBar` + `projectionText` + `burnVerdict` (couleur `projectionTone`)
  - `cost` : `fmtUsd`
  - `repo` : branche + `+added −removed`
  - bouton `[▸]` (`key="open"`, `hotkey="d"`, `onPress` → `$.ui.open({ id: 'sst', title: S.paneTitle })`)
  - aucune ligne affichable → `next(e)` (rien de dessiné)
- [ ] **Step 1 : tests** (kit, rendu) — avec usage complet : le texte rendu contient `Opus`, `ctx`, `14%`, `5h`, `→ 40%`. Avec `rateLimits: []` : aucune occurrence de `5h` ni de `%` de quota (Review Focus 1). Avec `tokens` indéfini : `—` présent, pas de `0%` (Review Focus 3). Surface `desktop` → l'arbre de l'engine (`next`). Presser `open` appelle `$.ui.open` avec `id: 'sst'`.
- [ ] **Step 2 :** CHECK → FAIL.
- [ ] **Step 3 :** implémenter.
- [ ] **Step 4 :** CHECK → PASS.
- [ ] **Step 5 : vérification visuelle** — `claude --plugin-dir .` en plein écran : la carte apparaît à droite au-dessus du prompt, suit le thème (`/theme` clair puis sombre), `[-]` de Claude Code la replie.
- [ ] **Step 6 : commit** — `feat: compact card above the prompt`.

### Task 10 : panneau latéral

**Files :** Create `hooks/pane.tsx`, `tests/pane.test.ts` ; Modify `hooks/register.tsx`, `hooks/strings.ts`

**Interfaces :**
- Consumes : tout ce qui précède ; `view` et `expanded`.
- Produces :
  - `/sst` (sans argument) bascule le panneau : ouvert → `$.ui.close({ id: 'sst' })`, sinon `$.ui.open({ id: 'sst', title: S.paneTitle })`
  - hook `ui.render` `{ component: 'Pane', requestId: 'sst' }` ; si `view === 'settings'`, délègue à Task 11 ; sinon sections dans l'ordre de la spec (En-tête, Contexte, Quotas, Session, Dépôt, Actions), largeur des barres = `min(settings.barWidth, bodyColumns − 22)` borné à ≥ 4
  - En-tête : modèle, jauge d'effort, `live.permissionMode` (masqué si nul), `● working` / `○ idle`, `live.requests` + ` req`, `ttft 0.8s · 42 tok/s` (masqué tant que `speed` est nul), fenêtre `fmtTokens(window)` + source (`breakdown.autocompactSource`)
  - Contexte : barre + légende par segment ; `compactHeadroom` ; sous-sections repliables `memory`, `mcp`, `skills`, `agents` (bouton qui bascule l'id dans `expanded`) ; indicateur `≈` tant que `breakdownDetail === 'summary'`
  - Quotas : `five_hour`/`seven_day` en burn-bar + `⧗` `fmtDur(remaining)` + `fmtClock(resetsAt)` ; autres `kind` ou sans `resetsAt` : `eighthBar(percentUsed/100)` + `percentUsed%` ; aucune fenêtre → section absente
  - Session : coût, `costRates`, durée, prompts, compactions / outils / sous-agents suffixés `S.sinceOpen`, ticket du dernier tour
  - Dépôt : `GitSnapshot` ; `↑↓` seulement si non nuls ; liste `sessionFiles` (10 max + `+n more`)
  - Actions : `[compact]` → `$.ui.ask(S.compactConfirm, [S.yes, S.no])` puis `$.command.run({ command: 'compact' })` si oui ; `[recount]` → `$.session.usage({ breakdown: 'full', columns: bodyColumns })` dans `usage` avec `breakdownDetail: 'full'` ; `[settings]` → `view = 'settings'`
- [ ] **Step 1 : tests** (kit) — rendu `placement: 'dock'`, `bodyColumns: 48` : les titres des six sections présents. `rateLimits: []` → pas de titre Quotas (Review Focus 1). `rateLimits` avec `spend_limit` à `112` sans `resetsAt` → `112%` présent, pas de `→`. `placement: 'inline'`, `bodyColumns: 60` → aucune ligne de texte rendue ne dépasse 60 colonnes (Review Focus 5). Presser `recount` appelle `usage` avec `breakdown: 'full'` ; aucun rendu ne l'appelle. `/sst` deux fois → `open` puis `close`.
- [ ] **Step 2 :** CHECK → FAIL.
- [ ] **Step 3 :** implémenter.
- [ ] **Step 4 :** CHECK → PASS.
- [ ] **Step 5 : vérification visuelle** — plein écran ≥ 110 colonnes : panneau docké ; terminal étroit : inline au-dessus du prompt ; `ctrl+x tab` puis `d` ouvre le panneau.
- [ ] **Step 6 : commit** — `feat: detailed side pane`.

### Task 11 : vue réglages + `/sst config`

**Files :** Create `hooks/settings-view.tsx`, `tests/settings-view.test.ts` ; Modify `hooks/register.tsx`, `hooks/pane.tsx`, `hooks/strings.ts`

**Interfaces :**
- Consumes : `loadSettings`, `saveSettings`, `normalizeSettings`, atome `settings`, atome `view`.
- Produces : `/sst config` ouvre le panneau avec `view = 'settings'` ; la vue liste les six `CardLine` en bascules (`[x]` / `[ ]`), monter/descendre l'ordre, `barWidth` −/+ ; chaque changement → `normalizeSettings` → `saveSettings` → atome `settings` (la carte se redessine) ; `[back]` → `view = 'main'`. Les réglages sont chargés au `session.start`.
- [ ] **Step 1 : tests** (kit) — décocher `five_hour` retire `5h` du rendu de la carte et persiste dans `$.store` ; `barWidth +` à 24 reste 24 ; `/sst config` ouvre le panneau en vue réglages.
- [ ] **Step 2 :** CHECK → FAIL.
- [ ] **Step 3 :** implémenter.
- [ ] **Step 4 :** CHECK → PASS.
- [ ] **Step 5 : commit** — `feat: settings view and /sst config`.

### Task 12 : publication 0.1.0

**Files :** Create `.claude-plugin/marketplace.json`, `README.md` ; Modify `.claude-plugin/plugin.json` (description, keywords, homepage, repository)

**Interfaces :**
- Produces : marketplace `{ "name": "claude-session-status-mod", "owner": { "name": "AdrienGras" }, "plugins": [{ "name": "session-status", "source": "./" }] }`.

- [ ] **Step 1 :** README en anglais : ce que fait le mod (carte + panneau), capture(s), installation `/plugin install session-status --marketplace AdrienGras/claude-session-status-mod`, commandes (`/sst`, `/sst config`, `/sst debug`), accès clavier (`ctrl+x tab` puis `d`, `[-]` / `ctrl+x ctrl+a`), comment retirer son `statusLine` de `~/.claude/settings.json`, ce qui est mesuré vs estimé (TTFT/tok/s locaux, `≈` du breakdown, compteurs « since open »), confidentialité (lit l'état de session, lance `git` en local, aucun réseau), version testée 2.1.296.
- [ ] **Step 2 :** CHECK → PASS ; `claude plugin validate .` ne signale aucun problème de marketplace.
- [ ] **Step 3 : vérification d'installation** — depuis une autre session : `/plugin install session-status --marketplace AdrienGras/claude-session-status-mod` (après push) installe et affiche la carte.
- [ ] **Step 4 : commit + tag** — `docs: README and marketplace for 0.1.0` ; `git tag v0.1.0`.
- [ ] **Step 5 (utilisateur) :** retirer `statusLine` de `~/.claude/settings.json` une fois satisfait.
