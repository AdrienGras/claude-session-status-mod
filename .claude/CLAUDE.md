# session-status: notes for Claude

A Claude Code mod (hooks module, mod API of Claude Code 2.1.296): a status line under the prompt (`PromptHint` site), a side pane `/sst`, a settings pane `/sst config`, a debug dump `/sst debug`. Public repo, installed through its own marketplace.

- Design: `docs/superpowers/specs/2026-10-13-session-status-design.md` (French). v1 plan: `docs/superpowers/plans/2026-10-13-session-status-v1.md`. The UX changed after v1 testing (status line moved under the prompt, thin bars, framed pane): the code and README are the truth where they differ from the spec.
- Work is tracked in GitHub issues + Project #4 (`AdrienGras`), with a `Version` field (v1 / v2 / vX). Keep issues up to date as you go: comment with the commit, move the status, close when done.
- UI, README, commits and code comments in English; conversation with the user in French.

## Check before every commit

```sh
claude plugin validate --strict . && npx -y -p typescript@5 tsc -p . && claude plugin test .
```

`tsc -p .` works once Claude Code has loaded the mod from this folder (it lays `.claude-plugin/types/`, git-ignored). On a fresh clone, run `claude --plugin-dir .` once first. CI (`.github/workflows/ci.yml`) runs `validate --strict` and the tests on Claude Code 2.1.296, without `tsc` (no logged-in session there); test workflows locally with `act`.

TDD: write the test, watch it fail for the right reason, then the code.

## Layout

| File | Role |
| --- | --- |
| `hooks/register.tsx` | entry: wires the modules, answers `/sst`, `/sst config`, `/sst debug` |
| `hooks/track.ts` | the one `session.start` hook (registers `/sst`), session events → state atoms, git read after hooks hand back, 30 s redraw |
| `hooks/minibar.tsx` / `minibar-rows.ts` | status line under the prompt: drawing / pure line builder |
| `hooks/pane.tsx` / `pane-rows.ts` | side pane: drawing + buttons / pure framed rows, every row exactly `bodyColumns` wide |
| `hooks/settings-view.tsx` | settings pane (`sst-config`, a separate pane) |
| `hooks/parts.ts`, `bars.ts`, `burn.ts`, `context.ts`, `format.ts`, `git.ts`, `session.ts`, `settings.ts`, `debug.ts` | pure logic, unit-tested |
| `hooks/strings.ts` | every displayed string (future i18n) |
| `hooks/state.ts` | initial values of the atoms only |
| `types/index.d.ts` | the `$.state` contract |
| `tests/engine.ts` | fake engine for integration tests |

Pure logic goes in `*.ts` with unit tests; `*.tsx` only draws.

## Mod API constraints (learnt the hard way, enforced by `claude plugin validate`)

- **One hook per event per module** without a matcher: `session.start` lives in `track.ts` only. Two `ui.render` on the same `{ component, requestId }` are refused too, hence the settings are their own pane.
- **`$` never crosses an import**, and is never passed to a function received as a parameter: a helper that uses `$` must be declared in the same file as the hook. Pure helpers take plain values, or a narrow deps object built in that file (see `readGit` in `track.ts` wrapping `makeGitReader`).
- **A function that receives `on` must not have its return value kept** (`const x = registerFoo(on)` is refused).
- **Each file declares the atoms it reads or writes**, with a literal ref: `atom({ plugin: 'session-status', key: 'live' } as const, EMPTY_LIVE)`. Importing atoms from another file is refused.
- **The type contract (`types/index.d.ts`) is self-contained**: no `import`, it exports at least one type; API shapes it needs are copied (`RateLimit`, `BreakdownView`).
- **Streaming events** (`turn.step`) take `async function*` hooks: `return yield* next(e)`.
- **Observing hooks hand back `next(e)` unchanged** and stay fast: slow work (git, usage refresh) runs in `$.clock.after(0, …)` after the dispatch.
- `/clear` raises `session.end` with `reason: 'clear'`, not `session.start`.
- Effort is only on `turn.step` (`e.effort`), absent for models without effort. Permission mode comes from `classic.UserPromptSubmit` (`e.permission_mode`).
- `$.session.repo().name` is null for ordinary repos: `owner/repo` is parsed from `remote`.
- `$.ui.ask` goes through a `tool.call` of `AskUserQuestion`, and rejects when dismissed.

## Testing kit (`claude-code/testing`)

- **Nothing sits beneath the plugin**: the test answers every call the mod makes. Calls answer `{ value }`, events their result. `tests/engine.ts` (`fakeEngine`) covers session, usage, model, turns, panes, commands, repo, store (`mock.store`) and clock (`mock.clock`).
- The test's `$` has no `clock`, `process`, `fs` or `state`. Read the mod's state through `/sst debug` (`modState` in `tests/engine.ts`). Test helpers that need those nouns through a deps object.
- Inputs must be complete: a `turn.complete` needs `answer`, a compaction's messages need `{ role, text, toolUses }`, a `Pane` or `AbovePrompt` mount needs `view: {}`.
- `fake.clock.settle()` / `advance(ms)` runs work deferred with `$.clock.after`.
- A test-level `ui.render` answer is a plain element: `{ type: 'Text', props: {}, children: ['…'] }`.

## Product rules

- Theme keys only for colours, never hex (category colours come from the API's breakdown).
- Never show an invented figure: unknown → hidden or `—`; estimate → `≈` or `~`.
- `breakdown: 'full'` only on the **recount** button. No toasts, no pane opened unasked.
- `/sst debug` is a whitelist (`debug.ts`): figures and categories only, nothing local (no path, MCP server, skill, agent, repo, branch). It ends up in public issues.
- Never write to the user's settings; the mod's settings live in `$.store`.

## Git workflow

- **Never commit or push to `main` directly.** `main` is protected: every change goes through a branch (`feat/…`, `fix/…`, `docs/…`, `chore/…`) and a pull request, merged only once CI (`check`) and the SonarCloud quality gate (`SonarCloud Code Analysis`, automatic analysis through the GitHub app, no token) are green.
- **Before opening a PR**, run the full check above locally (`validate --strict`, `tsc`, `test`) and make sure it passes. CI doesn't run `tsc`, so a type error only shows up locally. If `.github/workflows/` changed, run it with `act` first.
- **Every user-visible change** gets a line under *Unreleased* in `CHANGELOG.md`, in the same PR (Added / Changed / Fixed / Removed).
- Conventional Commits (`feat:`, `fix:`, `docs:`, `ci:`, `chore:`…), one topic per commit; the PR body says `Closes #N` and fills the template's checklist.
- Keep the issue and Project #4 in step with the PR: comment with the commits, move the status, let the merge close it.

## Release

Every version bump is a **GitHub release**, never just a pushed commit. On a `release/vX.Y.Z` branch: move the *Unreleased* entries of `CHANGELOG.md` under `## [X.Y.Z] - date` (and update the compare links at the bottom), bump `version` in `.claude-plugin/plugin.json` (and the Claude Code version in the README badge and `ci.yml` if it changes). PR, green CI, merge. Then tag the merge commit on `main` `vX.Y.Z` and push the tag: `release.yml` reruns the checks, refuses a tag that doesn't match `plugin.json` or has no changelog section, and publishes the release from it. Semver: `fix` → patch, `feat` → minor, a change that breaks stored settings → major (or a migration in `settings.ts`). Users update with `/plugin` → update, then `/reload-plugins`. Demo GIF: `docs/media/record.sh` (asciinema + agg), trim with `SELECT=event:a..event:b docs/media/record.sh --convert`.
