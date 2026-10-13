# session-status : design

Date : 2026-10-13 · Dépôt : `AdrienGras/claude-session-status-mod` (public) · Suivi : GitHub Project #4

## Intention

Remplacer la status line actuelle (`ccstatusline` v2.2.19 + deux scripts Python maison, `context-bar.py` et `burn-bar.py`) par un **mod Claude Code natif** : plus de binaire Node ni de scripts lancés toutes les 10 s à côté, mais un module qui vit dans Claude Code, lit ses données directement et s'affiche avec son thème.

C'est aussi le **premier mod** de l'auteur : le projet sert à apprendre l'API des mods. Il est **public et doit être installable par d'autres** (`/plugin install`), avec un README propre.

Références étudiées : [statuspane](https://github.com/xuanji86/claude-statuspane) (carte au-dessus du prompt) et [flightdeck](https://github.com/scasella/claude-flightdeck) (panneau d'observabilité docké). Le mod reprend des idées des deux, sans en reprendre le code.

## Deux niveaux d'affichage

### 1. Carte compacte (toujours visible)

- Site : le bandeau au-dessus du prompt, `ui.render` sur `{ component: 'AbovePrompt' }`, contenu aligné à droite (`justifyContent="flex-end"`).
- Forme retenue : **carte encadrée** (bordure `round`), trois lignes par défaut :
  1. `Opus 5.5  effort ▮▮▮▯▯ high`
  2. `ctx` + barre de contexte **segmentée par catégorie** + `140k/1M 14%`
  3. `5h` + barre de quota façon burn-bar (repère `┊`) + `→40% ✓ +7h30`
- Un bouton `[▸]` dans le cadre ouvre le panneau latéral.
- Pas de bouton de repli propre au mod : le contrôle `[-]` que Claude Code dessine déjà sur le bandeau (et `ctrl+x ctrl+a`) suffit.
- Les lignes affichées sont configurables (voir Configuration).
- La segmentation de la barre utilise l'estimation locale `$.session.usage({ breakdown: 'summary' })` (gratuite). Jamais `full` ici.
- Échelle : le libellé `140k/1M 14%` vient de `context.tokens` / `context.window` (chiffres réels). La barre est dessinée à ce total réel, et les segments de l'estimation sont mis à l'échelle proportionnellement pour le remplir. Le tampon d'auto-compactage (`kind: 'buffer'`) apparaît en `subtle` ; les lignes `deferred` sont masquées.

### 2. Panneau latéral détaillé (à la demande)

- `$.ui.open({ id: 'sst', title: 'Session' })`, dessiné par `ui.render` sur `{ component: 'Pane', requestId: 'sst' }`.
- Placement imposé par Claude Code : `dock` à côté de la conversation en plein écran ≥ 110 colonnes, sinon `inline` au-dessus du prompt. Le mod adapte sa mise en page à `placement` / `bodyColumns` mais ne choisit pas.
- Ouverture : bouton `[▸]` de la carte, `/sst`, ou `ctrl+x tab` (focus sur le bandeau) puis la touche `d`. Un mod ne peut pas créer de raccourci libre : seul un `action` existant de Claude Code peut être réutilisé.
- Fermeture : `/sst` (bascule), Échap / croix du panneau.

Contenu v1, par section :

| Section | Contenu |
|---|---|
| En-tête | modèle, jauge d'effort, mode de permission, état en direct (idle / au travail), nombre de requêtes, TTFT et tok/s du dernier appel, taille de fenêtre de contexte et sa source (`ContextWindowSource`) |
| Contexte | barre par catégorie + légende (tokens par catégorie, espace libre) ; seuil d'auto-compactage et tokens restants avant ; sections dépliables : fichiers mémoire, outils MCP groupés par serveur, skills, agents |
| Quotas | toutes les fenêtres renvoyées. `five_hour` et `seven_day` en burn-bar, avec compte à rebours **et** heure exacte du reset. Toute autre fenêtre (`spend_limit`, type inconnu) ou une fenêtre sans `resetsAt` : simple barre de pourcentage (peut dépasser 100 %), sans projection |
| Session | coût total, coût par heure (`cost.usd` / durée depuis `startedAt`), coût par prompt (`cost.usd` / `$.session.turns()`) — numérateur et dénominateur comptent tous deux depuis le premier lancement, donc cohérents après un `--resume` ; durée ; nombre de prompts ; compactages subis, appels d'outils par outil, sous-agents lancés : comptés par le mod, donc **libellés « depuis l'ouverture »** ; ticket du dernier tour (durée, agents, modifications, erreurs, coût ajouté). `/clear` remet tout à zéro, comme `startedAt` |
| Dépôt | dossier ; branche ; lignes +/- et fichiers modifiés ; dépôt distant (`owner/repo`) et avance/retard (↑↓) ; liste des fichiers modifiés **pendant cette session**, distingués du reste |
| Actions | `/compact` avec confirmation ; recomptage exact du contexte (`breakdown: 'full'`, à la demande uniquement) ; ouverture des réglages |

## Sources de données (vérifiées sur Claude Code 2.1.296)

| Donnée | Source |
|---|---|
| contexte, quotas, coût, début de session | `$.session.usage()` → `{ startedAt, context, rateLimits, cost }` ; `rateLimits[]` = `{ kind, percentUsed, resetsAt? }` ; `cost.usd` |
| répartition du contexte | `$.session.usage({ breakdown: 'summary' \| 'full', columns })` → sous `usage.context.breakdown` : `categories` (chacune avec `name`, `tokens`, `color`, `kind`), `memoryFiles`, `mcpTools`, `agents`, `skills`, `autoCompactThreshold`, `isAutoCompactEnabled` |
| rafraîchissement | événement `session.measure` (pousse les nouveaux chiffres) ; pas de polling de `usage` |
| modèle | `$.session.model()` |
| effort | `TurnStepInput.effort` (événement `turn.step` uniquement) ; absent avant la première requête et pour les modèles sans effort → la jauge est masquée |
| mode de permission | aucun événement de tour ne le porte : `permission_mode` des entrées de hooks `classic.*`, ou `agent.spawn` (mode du parent), ou les libellés du site `SessionMode`. Source exacte à confirmer au premier spike ; masqué tant qu'inconnu |
| TTFT, tok/s | chronométrés sur `turn.step` (envoi → premier fragment → arrêt ; `output_tokens` / durée de décodage). Mesure locale, pas un chiffre de l'API — à indiquer dans le README |
| état en direct, ticket du tour | `turn.start` / `turn.complete` |
| compactages | `session.compact` |
| appels d'outils, sous-agents | `tool.call` (observation, `next(e)` inchangé), `agent.spawn` |
| dossier, dépôt distant | `$.session.cwd()`, `$.session.repo()` → `{ root, remote, name, internal }` ; `name` est `null` hors dépôts internes Anthropic : `owner/repo` est **parsé depuis `remote`** (formes SSH et HTTPS) |
| branche, diff, ↑↓, fichiers de la session | **non exposés** : `git` via `$.process` (`branch --show-current`, `diff --shortstat`, `rev-list --left-right --count @{u}...HEAD`, `status --porcelain` + mtime comparé à `startedAt`) |
| persistance des réglages | `$.store` (entre sessions) ; état vivant dans `$.state` avec contrat `types/index.d.ts` |

## Logique des quotas (portée de `burn-bar.py`)

Reprise à l'identique de `compute()` :

- début de fenêtre = `resetsAt − durée` (5 h ou 7 j) ; `elapsed_frac` borné à [1e-6, 1] ;
- projection au reset = `used / elapsed_frac` ;
- rythme = `used / (elapsed_frac × durée)` ; `juice` = temps avant 100 % ; `margin = juice − remaining` ;
- affichage : `✓ +Xh` si marge ≥ 0, `⚠ wall Xh` sinon (ex-« mur »), `⛔ limit` à 100 %, `✓ ∞` à 0 % ;
- **faible confiance** sous 10 % de fenêtre écoulée : préfixe `~` et couleur atténuée ;
- barre au 1/8 de cellule (`▏▎▍▌▋▊▉█`), repère `┊` à la position du temps écoulé ;
- durées compactes : `<1m`, `42m`, `4h36`, `3d3h` (jours en `d`, interface en anglais).

Les cas de `~/.config/ccstatusline/test_burn_bar.py` servent de base aux tests du port, chaînes traduites en anglais.

## Langue

- Toute l'interface (libellés, durées, messages) et le README sont **en anglais** : le mod est public.
- Traduction (dont le français) : version ultérieure, hors v1/v2. Les chaînes sont regroupées dans un seul module pour faciliter ce futur travail.

## Couleurs

Uniquement les **clés de thème** de Claude Code (`ThemeKey`) pour suivre clair/sombre/daltonien sans rien gérer. Conséquence acceptée : pas de dégradé continu, des **paliers** :

- contexte (libellé et jauge globale) : `success` < 50 % ≤ `warning` < 80 % ≤ `error` ;
- quotas (selon la projection) : `success` < 80 % ≤ `warning` < 130 % ≤ `error` ;
- libellés, valeurs secondaires : `subtle` / `inactive` ; repère `┊` : `text` ; modèle : `claude` ;
- catégories de contexte : la `color` fournie par l'API pour chaque catégorie (celle de `/context`), pour rester cohérent avec Claude Code. Le traitement se fait sur `kind` (`used` / `free` / `buffer` / `deferred`), jamais sur le nom.

## Configuration

- **Une seule source : `$.store`.** Pas de `userConfig` en v1, pour ne jamais écrire dans le `settings.json` de l'utilisateur (non-objectif).
- Réglages v1 : lignes de la carte (modèle/effort, contexte, quota 5 h, quota 7 j, coût, dépôt), largeur des barres.
- `/sst config` (et le bouton « réglages » du panneau) ouvre une **vue de réglages dans le panneau** : une liste de bascules, enregistrées immédiatement dans `$.store`.

## Nommage

- Plugin : `session-status` ; commande : `/sst` (`/sst` bascule le panneau, `/sst config` ouvre les réglages).

## Découpage

- **v1 — remplacement de `ccstatusline`** : carte compacte + panneau (en-tête, contexte, quotas, session, dépôt, actions) + configuration + README + marketplace. Une fois en place, l'auteur retire `statusLine` de sa config.
- **v2 — activité** : cartes de sous-agents (tâche, type, contexte, tokens, étapes, chrono, dépliables avec 3 derniers appels), cases de permissions (`tool.check`) avec détail par famille d'outils, journal de session horodaté.
- **vX — traduction** : couche i18n et réglage de langue (français en premier).
- **Plus tard, peut-être** : statut CI GitHub, API de barres de progression pour d'autres scripts/mods (idées de statuspane).

## Contraintes

- API des mods en accès anticipé : elle peut bouger. Version cible : **2.1.296**, celle sur laquelle le mod est développé et testé ; le README l'annonce comme version testée, sans promettre de compatibilité plus ancienne.
- Terminal d'abord. Le panneau docké exige le mode plein écran et ≥ 110 colonnes.
- Le mod ne peut pas désactiver le `statusLine` de l'utilisateur : le README explique comment le retirer.
- Le module tourne sans DOM ni Node : tout passe par `$`.

## Non-objectifs

- Reproduire la palette brogrammer ou des couleurs hexa.
- Rendu dédié desktop / VS Code / mobile en v1.
- Suivi de l'« architecte » (flightdeck).
- Toucher à la config de l'utilisateur.

## Anti-objectifs (échec même si « ça marche »)

- Le mod consomme des tokens en tâche de fond (ex. `breakdown: 'full'` sur un timer).
- Il ralentit, bloque ou modifie quoi que ce soit : chaque hook d'observation passe l'événement inchangé et rend la main vite.
- Il fait du bruit : toasts intempestifs, panneau qui s'ouvre sans qu'on le demande.
- Il montre un chiffre inventé : une donnée absente est masquée, jamais mise à zéro ; une valeur estimée est marquée comme telle.

## Choix faits pendant la rédaction (non discutés, à vérifier)

- Pas de bouton de repli propre au mod : on s'appuie sur le `[-]` de Claude Code.
- Réglages uniquement dans `$.store`, édités dans une vue du panneau ; pas de `userConfig` en v1.
- Compteurs propres au mod libellés « depuis l'ouverture » plutôt que reconstruits depuis le transcript.
- Barre de contexte à l'échelle réelle, segments de l'estimation mis à l'échelle proportionnellement.
- Fenêtres de quota hors 5 h / 7 j : simple barre de pourcentage.
- Version cible unique : 2.1.296.

## Laissé au builder

- Découpage interne du module (fichiers, composants), structure du contrat `$.state`.
- Mise en page exacte du panneau selon la largeur, ordre fin des sections.
- Cadence et cache des appels `git` (raisonnable : au `session.measure` / `turn.complete`, cache court).
- Stratégie de tests (`*.test.ts` + `claude plugin test`), en couvrant au minimum le calcul burn-bar et les paliers de couleur.
- Développement depuis le dépôt via `claude --plugin-dir .` plutôt que le dossier `dev-mods`.
