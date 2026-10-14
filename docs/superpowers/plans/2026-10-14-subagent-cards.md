# Cartes de sous-agents (v2, #13) — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** une box **Agents** dans le panneau `/sst` : une carte par sous-agent, en direct (tâche, type, contexte, tokens générés, étapes, chrono, état), dépliable sur ses 3 derniers appels d'outils.

**Architecture :** la logique pure vit dans un nouveau `hooks/agents.ts` (cartes : création, étape, appel, fin, rapprochement avec `$.agent.list()`, tri et plafond), testé unitairement. `hooks/pane-rows.ts` ajoute la section, elle aussi pure. `hooks/track.ts` branche `agent.spawn`, `turn.step`, `tool.call` et `turn.complete` (ceux qui portent un `agentId`) sur un nouvel atome `agents`, que `hooks/pane.tsx` lit.

**Tech Stack :** API des mods Claude Code 2.1.296 (`claude-code`, `claude-code/testing`), TypeScript/TSX.

**Spec :** pas de document de conception, l'utilisateur a sauté les questions. Ce plan part de l'issue #13 et de la ligne v2 de `docs/superpowers/specs/2026-10-13-session-status-design.md` (§ « v2 — activité »). Les décisions ci-dessous sont celles de l'agent ; elles sont listées pour relecture.

## Décisions (de l'agent, à relire)

- La box s'appelle **Agents** et se place **entre Session et Repo**. Elle est masquée tant qu'aucun sous-agent n'a été vu depuis l'ouverture.
- **Carte** : une rangée bouton pleine largeur `▸ <type> · <tâche>`, avec à droite l'état et le chrono. Dessous, une rangée toujours visible et grisée `ctx 24k · 3.1k out · 7 steps` (le `ctx` est omis tant qu'aucune étape n'est connue). Dépliée, elle montre jusqu'à 3 rangées d'appels `  Read  hooks/a.ts`, ou `  no tool calls yet`.
- **États** : `●` running (`claude`), `✓` done (`success`), `✗` failed (`error`), `■` stopped (`inactive`). Chrono : maintenant − début tant que la carte tourne, fin − début ensuite, au format `fmtSpan` de `pane-rows.ts`.
- **Tri** : celles qui tournent d'abord (les plus anciennes en premier), puis les terminées (les plus récentes en premier). On garde toutes celles qui tournent et **les 3 dernières terminées**, dans l'état comme à l'affichage.
- **Contexte d'une carte** : `input_tokens + cache_read_input_tokens + cache_creation_input_tokens` de la dernière étape. **Tokens générés** : somme des `output_tokens`. **Étapes** : nombre de `turn.step` de cet agent.
- **Détail d'un appel** : la première valeur texte trouvée parmi `file_path`, `notebook_path`, `path`, `command` (première ligne), `pattern`, `url`, `query`, sinon rien. Le panneau est local, ces détails peuvent y figurer ; ils n'entrent jamais dans `/sst debug`.
- **Fin** : `turn.complete` avec `agentId`. `isAborted` ou `reason: 'aborted'` → stopped ; `'answer'` → done ; `'error'` ou `'refusal'` → failed. Un agent qui ne lève jamais `turn.complete` (tué) est rapproché de `$.agent.list()` à chaque relecture différée : `completed` → done, `failed` → failed, `killed` → stopped.
- **Redessin** : la cadence d'une seconde (`tick` de `track.ts`) tourne tant qu'un tour principal **ou** une carte tourne, pour un sous-agent en arrière-plan qui continue après la fin du tour.
- **`/clear`** vide les cartes. **`/sst debug`** n'imprime que `agents: { running, finished }` (des nombres).

## Global Constraints

- Contraintes de l'API des mods (`.claude/CLAUDE.md`) : une seule fonction de hook par événement et par module (tous ces hooks vivent dans `track.ts`) ; `$` ne traverse jamais un import ; chaque fichier déclare les atomes qu'il lit ou écrit, avec une référence littérale `atom({ plugin: 'session-status', key: 'agents' } as const, [] as AgentCard[])` ; les hooks streamés s'écrivent `async function*` et rendent `next(e)` inchangé ; les hooks d'observation rendent `next(e)` sans le modifier.
- Le contrat de types (`types/index.d.ts`) est autonome : sans `import`, avec un `type` de premier niveau exporté.
- Règles produit : clés de thème seulement, jamais d'hex ; aucun chiffre inventé (inconnu → masqué) ; chaque chaîne affichée dans `hooks/strings.ts` ; aucun toast, aucun panneau ouvert sans demande ; `/sst debug` reste une liste blanche.
- Chaque rangée du panneau fait exactement `bodyColumns` **cellules** (`cellWidth` de `hooks/cells.ts`).
- Vérification avant chaque commit : `claude plugin validate --strict . && npx -y -p typescript@5 tsc -p . && claude plugin test .`
- TDD : le test d'abord, le voir échouer pour la bonne raison, puis le code. Commits Conventional Commits en anglais, terminés par `Refs #13`.

## Review Focus

- Un sous-agent tué qui ne lève jamais `turn.complete` doit cesser d'afficher `● running` dès la relecture suivante (test en Task 3).
- Des étapes ou des appels portant un `agentId` sans carte (fork interne, agent de workflow, mod chargé en cours de route) sont ignorés, sans créer de carte et sans erreur (test en Task 3).
- Une tâche longue, ou du CJK dans la tâche ou un chemin, garde chaque rangée exactement à `bodyColumns` cellules (test en Task 2).
- Dix sous-agents en parallèle : tous ceux qui tournent sont visibles, les terminés plafonnés à 3 (tests en Task 1 et Task 2).
- `/clear` pendant que des sous-agents tournent vide les cartes et arrête la cadence d'une seconde (test en Task 3).

---

### Task 1: Le modèle des cartes

**Files:**
- Create: `hooks/agents.ts`
- Modify: `types/index.d.ts` (le type `AgentCard`, la clé `agents` de `PluginState['session-status']`)
- Test: `tests/agents.test.ts`

**Interfaces:**
- Produces, dans `types/index.d.ts` :
  ```ts
  export type AgentState = 'running' | 'done' | 'failed' | 'stopped'
  export type AgentCall = { tool: string; detail: string | null }
  export type AgentCard = {
    id: string; type: string; task: string
    startedAt: number; endedAt: number | null; state: AgentState
    steps: number; contextTokens: number | null; outputTokens: number
    calls: AgentCall[] // les plus récents à la fin, 3 au plus
  }
  ```
  et `agents: AgentCard[]` dans `PluginState['session-status']`.
- Produces, dans `hooks/agents.ts` :
  - `spawnCard(id: string, type: string, task: string, now: number): AgentCard`
  - `stepCard(card: AgentCard, usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number } | null): AgentCard`
  - `callCard(card: AgentCard, tool: string, input: unknown): AgentCard`
  - `callDetail(input: unknown): string | null`
  - `endCard(card: AgentCard, end: { reason: string; isAborted: boolean }, now: number): AgentCard` (une carte déjà terminée reste telle quelle)
  - `reconcile(cards: readonly AgentCard[], listed: readonly { id: string; status: string }[], now: number): AgentCard[]`
  - `withCard(cards: readonly AgentCard[], id: string, change: (c: AgentCard) => AgentCard): AgentCard[]` (id inconnu → liste inchangée)
  - `keepCards(cards: readonly AgentCard[]): AgentCard[]` (tri et plafond de la section Décisions)
  - `MAX_CALLS = 3`, `MAX_FINISHED = 3`

- [ ] **Step 1: Write the failing tests** dans `tests/agents.test.ts` :
  - `a spawned card runs, with nothing measured yet` : `spawnCard('a1', 'Explore', 'find the auth code', 1_000)` vaut `{ id: 'a1', type: 'Explore', task: 'find the auth code', startedAt: 1_000, endedAt: null, state: 'running', steps: 0, contextTokens: null, outputTokens: 0, calls: [] }`.
  - `a step counts, sums output and takes the last context` : deux `stepCard` avec `{ input_tokens: 1_000, cache_read_input_tokens: 20_000, cache_creation_input_tokens: 500, output_tokens: 300 }` puis `{ input_tokens: 2_000, cache_read_input_tokens: 21_000, cache_creation_input_tokens: 0, output_tokens: 200 }` donnent `steps: 2`, `contextTokens: 23_000`, `outputTokens: 500` ; `stepCard(c, null)` donne `steps + 1` et ne change ni le contexte ni la sortie.
  - `calls keep the last three, newest last` : 4 `callCard` (`Read`, `Grep`, `Bash`, `Edit`) laissent `calls.map(c => c.tool)` à `['Grep', 'Bash', 'Edit']`.
  - `a call's detail is its first telling field` : `callDetail({ file_path: '/w/a.ts' })` → `'/w/a.ts'` ; `callDetail({ command: 'npm test\nmore' })` → `'npm test'` ; `callDetail({ pattern: 'TODO', path: 'src' })` → `'src'` (`path` passe avant `pattern`) ; `callDetail({ url: 'https://x.dev' })` → `'https://x.dev'` ; `callDetail({ todos: [] })`, `callDetail(null)` et `callDetail({ file_path: 3 })` → `null`.
  - `an end sets the state once` : `endCard(c, { reason: 'answer', isAborted: false }, 5_000)` → `state: 'done'`, `endedAt: 5_000` ; `{ reason: 'aborted', isAborted: true }` → `'stopped'` ; `{ reason: 'answer', isAborted: true }` → `'stopped'` ; `{ reason: 'error', isAborted: false }` → `'failed'` ; un second `endCard` sur une carte `done` la rend inchangée.
  - `a killed agent the list reports is ended` : `reconcile([running a1, running a2, running a3], [{ id: 'a1', status: 'killed' }, { id: 'a2', status: 'completed' }, { id: 'a3', status: 'running' }], 9_000)` → `a1` stopped, `a2` done (avec `endedAt: 9_000`), `a3` running ; un id absent de la liste reste tel quel.
  - `an unknown id changes nothing` : `withCard([a1], 'zz', c => ({ ...c, steps: 9 }))` est égal à `[a1]`.
  - `ten in parallel: every running one kept, three finished, running first` : 10 cartes qui tournent (débuts 1..10) et 5 terminées (fins 100..500) donnent 13 cartes ; les 10 premières tournent, rangées par début croissant ; les 3 dernières sont les fins 500, 400, 300.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `claude plugin test .`
Expected: `tests/agents.test.ts` → `(fail) the file did not load` (le module `hooks/agents.ts` n'existe pas).

- [ ] **Step 3: Implement** `types/index.d.ts` (les types ci-dessus et la clé `agents`) et `hooks/agents.ts` (les fonctions des Interfaces, pures, sans `$`). `callDetail` lit l'entrée comme un objet, et prend la première valeur `string` non vide parmi `file_path`, `notebook_path`, `path`, `command`, `pattern`, `url`, `query`, coupée à sa première ligne.

- [ ] **Step 4: Run the full check**

Run: `claude plugin validate --strict . && npx -y -p typescript@5 tsc -p . && claude plugin test .`
Expected: `✔ Validation passed`, aucune erreur `tsc`, `0 fail`.

- [ ] **Step 5: Commit** : `git add hooks/agents.ts types/index.d.ts tests/agents.test.ts && git commit -m "feat: the subagent card model"` (corps : `Refs #13`).

### Task 2: La box Agents

**Files:**
- Modify: `hooks/pane-rows.ts` :
  - `PaneInput.agents: readonly AgentCard[]` ;
  - `GroupKey` élargi à `` `agent:${string}` `` ;
  - `Group` reçoit `isWide?: boolean` et `under?: Row[]`, et `frameGroups` dessine un groupe large seul sur sa rangée, à pleine largeur, suivi de ses `under` ;
  - la section `agents(input)`, placée entre `session` et `repo`.
- Modify: `hooks/pane.tsx` (le champ `agents: []` passé à `paneRows`, en attendant l'atome de Task 3)
- Modify: `hooks/strings.ts` (`agentsTitle: 'Agents'`, `running: 'running'`, `out: 'out'`, `step: 'step'`, `noCalls: 'no tool calls yet'`)
- Test: `tests/pane-rows.test.ts` (`input()` gagne `agents: []` par défaut)

**Interfaces:**
- Consumes : `AgentCard` (Task 1).
- Produces : `paneRows(input)` qui lit `input.agents`, et la clé de groupe `agent:<id>`, dont le bouton dans `pane.tsx` est `g-agent:<id>`.

- [ ] **Step 1: Write the failing tests** dans `tests/pane-rows.test.ts` :
  - `agents: one card per subagent, state and time in the row, figures under it` : avec `now = NOW`, une carte `running` (`id: 'a1'`, `type: 'Explore'`, `task: 'find the auth code'`, début `NOW - 72_000`, 7 étapes, contexte `24_000`, sortie `3_100`) et une `done` (de `NOW - 60_000` à `NOW - 12_000`). La box `Agents` a pour aside `1 running`, puis une rangée qui contient `▸ Explore · find the auth code` et `● 1m12s`, la rangée `ctx 24k · 3.1k out · 7 steps`, et une rangée avec `✓ 48s`. La carte qui tourne est dessinée avant la terminée.
  - `agents: unfolded, the last calls; none yet, said so` : `expanded: ['agent:a1']` avec l'appel `{ tool: 'Read', detail: '/w/a.ts' }` montre `Read` et `/w/a.ts` ; une carte sans appels, dépliée, montre `no tool calls yet` ; une carte sans contexte connu a une rangée grisée qui commence par `0 out` (sans `ctx`).
  - `agents: no subagent, no box` : `box(input(), 'Agents')` vaut `undefined`.
  - `agents: wide glyphs and long tasks stay in the frame` : une tâche de 200 caractères avec du CJK et un appel `ドキュメント/会議.md`, dépliée, donnent `cellWidth(r) === 48` pour chaque rangée de `all(...)`.
- [ ] **Step 2: Run to verify they fail** : `claude plugin test .`. Expected : les nouveaux tests échouent, faute de box Agents.
- [ ] **Step 3: Implement** la section et le groupe large. La rangée bouton reprend `▸`/`▾` des groupes existants, à pleine largeur, avec à droite l'état et le chrono ; `under` porte la rangée grisée. `fmtSpan` et `fmtTokens` fournissent les chiffres, `plural(n, S.step)` les étapes, et `keepCards` l'ordre.
- [ ] **Step 4: Run the full check** (la commande de Task 1). Expected : `0 fail`.
- [ ] **Step 5: Commit** : `feat: the Agents box, a card per subagent` (`Refs #13`).

### Task 3: Le suivi des sous-agents

**Files:**
- Modify: `hooks/track.ts` (les hooks `agent.spawn`, `turn.step`, `tool.call`, `turn.complete`, `session.end`, `refreshLater`, la cadence `tick`)
- Modify: `hooks/pane.tsx` (déclare et lit l'atome `agents` au lieu du `[]` de Task 2)
- Modify: `tests/engine.ts` : `fake.agents: { id: string; status: string; description: string; type: string }[]`, répondu par `on('agent.list', () => ({ value: fake.agents }))` ; `on('agent.spawn')` répond `fake.spawnAnswer`, par défaut `{ model: 'claude-haiku-5-5', agentId: 'a1' }`.
- Test: `tests/agents-track.test.ts`

**Interfaces:**
- Consumes : le Produces de Task 1 ; `paneRows` et la clé `g-agent:<id>` de Task 2.
- Produces : l'atome `atom({ plugin: 'session-status', key: 'agents' } as const, [] as AgentCard[])`, écrit **seulement** par `track.ts`, toujours passé par `keepCards`.

- [ ] **Step 1: Write the failing tests** dans `tests/agents-track.test.ts`. Ils lisent le résultat en montant `paneTarget()` ; les entrées incomplètes des événements passent par `as never`, comme dans les tests existants. `turn.step` est répondu comme dans `tests/track-fixes.test.ts` (avec `usage`), `tool.call` par `{ result: {} }`, et `turn.complete` par `{ text: '' }`. La fin d'un sous-agent s'écrit `{ ...answered('x'), agentId: 'a1' }`.
  - `a spawned subagent gets a running card` : `$.agent.spawn({ prompt: 'p', description: 'find the auth code', subagentType: 'Explore' } as never)`, puis le panneau montre `Explore · find the auth code` et `●`.
  - `its steps and calls fill the card; its end sets the state` : un `turn.step` et un `tool.call` (`tool: 'Read'`, `input: { file_path: '/w/a.ts' }`), tous deux avec `agentId: 'a1'`, puis la fin de `a1`. Le panneau montre `1 step` et `✓`, et `/w/a.ts` une fois la carte dépliée (`ui.press({ key: 'g-agent:a1' })`).
  - `a refused spawn gets no card` : avec `fake.spawnAnswer = { deny: 'no' }`, aucune box Agents.
  - `steps and calls of an unknown agent are ignored` : un `turn.step` et un `tool.call` avec `agentId: 'zz'`, sans spawn préalable, ne créent pas de box Agents et ne lèvent rien.
  - `a killed agent stops running at the next read` : spawn de `a1`, `fake.agents = [{ id: 'a1', status: 'killed', description: '', type: 'Explore' }]`, `turn.start` puis `turn.complete(answered('T1'))` du tour principal, `fake.clock.settle()`. Le panneau montre `■` et plus `●`.
  - `/clear empties the cards and stops the tick` : spawn de `a1`, `session.end({ reason: 'clear', sessionId: 's' })`. Aucune box Agents, et avec un compteur `ui.invalidate`, `fake.clock.advance(5_000)` donne 0 redessin.
  - `a background agent keeps the tick after the main turn ends` : `turn.start`, spawn de `a1`, `turn.complete` du tour principal. `fake.clock.advance(3_000)` donne au moins 2 redessins ; après la fin de `a1`, `advance(5_000)` en donne 0.
  - Le tour principal reste inchangé : `tests/track.test.ts` et `tests/track-fixes.test.ts` passent sans modification.
- [ ] **Step 2: Run to verify they fail** : `claude plugin test .`. Expected : les nouveaux tests échouent, faute de carte.
- [ ] **Step 3: Implement** dans `track.ts` :
  - `agent.spawn` : si `r.agentId`, faire `update(agentsAtom, cs => keepCards([...cs, spawnCard(r.agentId, e.subagentType, e.description, now)]))`.
  - `turn.step` avec `e.agentId` : `const result = yield* next(e)`, puis `withCard(... stepCard(c, result.usage))`, et `return result`.
  - `tool.call` avec `e.agentId` : après `next`, `withCard(... callCard(c, e.tool, e.input))`. Le comptage par outil de la Session est inchangé.
  - `turn.complete` avec `e.agentId` : `withCard(... endCard(c, e, now))`.
  - `refreshLater` : `reconcile` avec `await $.agent.list()`, la lecture refusée étant ignorée.
  - `session.end` (`clear`/`resume`) : `[]`.
  - La cadence : une fonction `syncTick($)`, déclarée dans `track.ts`, la démarre si `live.isWorking` ou si une carte tourne, et l'arrête sinon. Elle est appelée après `turn.start`, `turn.complete` (principal comme sous-agent), `agent.spawn`, `session.end` et `reconcile`, et remplace les `tick?.cancel()` / `$.clock.every` actuels.
- [ ] **Step 4: Run the full check.** Expected : `0 fail`, validation passée.
- [ ] **Step 5: Commit** : `feat: subagents tracked live from spawn to end` (`Refs #13`).

### Task 4: Debug, docs, vérification réelle

**Files:**
- Modify: `hooks/debug.ts`, `hooks/register.tsx` (`mod.agents = { running, finished }`)
- Modify: `tests/debug.test.ts`, `README.md` (la ligne **Agents** du tableau du panneau), `CHANGELOG.md` (*Unreleased → Added*), `.claude/CLAUDE.md` (la ligne `agents.ts` du tableau Layout)

- [ ] **Step 1: Write the failing test** `tests/debug.test.ts` `the debug report counts subagents, never their task or calls` : avec deux cartes (une qui tourne, une terminée), dont la tâche est `secret-task` et l'appel `/home/alice/x`, `debugReport(...)` donne `mod.agents` égal à `{ running: 1, finished: 1 }`, et son JSON ne contient ni `secret-task`, ni `alice`, ni `Explore`.
- [ ] **Step 2: Run to verify it fails** (`claude plugin test .`).
- [ ] **Step 3: Implement** `debugReport(usage, mod)`, où `ModState` gagne `agents: AgentCard[]` ; `register.tsx` lit l'atome `agents`, déclaré dans ce fichier. Mettre à jour README, CHANGELOG et CLAUDE.md.
- [ ] **Step 4: Run the full check**, puis une **vérification en vraie session**. Lancer `claude --plugin-dir .` avec le mod installé désactivé (`--settings '{"enabledPlugins":{"session-status@claude-session-status-mod":false}}'`) ; demander « lance un sous-agent Explore qui liste hooks/ » ; ouvrir `/sst`. La carte apparaît, tourne puis passe à `✓`, et elle se déplie. Rendu : le pilote pty et `pyte` utilisés pour #23, ou une capture à la main.
- [ ] **Step 5: Commit** : `docs: the Agents box in the README, changelog and notes` (`Refs #13`).
