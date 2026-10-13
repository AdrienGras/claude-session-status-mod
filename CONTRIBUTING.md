# Contributing to session-status

Thanks for taking the time! Bug reports, ideas and pull requests are all welcome.
Issues and pull requests can be written in **English or French**.

## Reporting a bug

Open a [bug report](https://github.com/AdrienGras/claude-session-status-mod/issues/new?template=bug_report.yml) and paste the output of `/sst debug`. It holds figures and categories only (no path, repo, branch, MCP server, skill or agent name), so it is safe to share in a public issue.

Security issues go through a private report instead: see [SECURITY.md](SECURITY.md).

## Setting up

You need Claude Code at the version in the README badge (the mod API is early access and changes between releases).

```sh
git clone https://github.com/AdrienGras/claude-session-status-mod
cd claude-session-status-mod
claude --plugin-dir .
```

Launching Claude Code once with `--plugin-dir .` loads the mod from your clone and lays the API's type declarations in `.claude-plugin/types/` (git-ignored), which `tsc` needs.

## Checking your change

Run this before every commit:

```sh
claude plugin validate --strict . && npx -y -p typescript@5 tsc -p . && claude plugin test .
```

- `claude plugin validate` checks the manifests and the mod API's static rules.
- `tsc` type-checks against the API's declarations.
- `claude plugin test` runs every `tests/*.test.ts` with the `claude-code/testing` kit.

CI runs `validate --strict` and the tests on every push and pull request, and SonarCloud checks every pull request against its quality gate; both must pass before merging. It does not run `tsc` (the declarations only exist once a logged-in Claude Code has loaded the mod), so run it locally.

## How the code is laid out

- `hooks/*.ts` hold the pure logic (formatting, burn rate, bars, context, git parsing, status line and pane rows), each with unit tests in `tests/`.
- `hooks/*.tsx` only draw.
- `hooks/strings.ts` holds every displayed string.
- `types/index.d.ts` is the contract for the mod's state.

[`.claude/CLAUDE.md`](.claude/CLAUDE.md) lists the mod API constraints the validator enforces (one hook per event per module, `$` never crosses an import, atoms declared in each file…) and the testing kit's quirks. Read it before touching `hooks/track.ts` or `hooks/register.tsx`.

`docs/superpowers/` holds the original design and v1 plan (in French). The code and README are the truth where they differ.

## Writing code

- **Tests first**: write the test, watch it fail for the right reason, then write the code.
- **Never show an invented figure**: unknown is hidden or `—`, an estimate is marked `≈` or `~`.
- **Theme keys only** for colours, never hex.
- **Nothing local in `/sst debug`**: it is a whitelist (`hooks/debug.ts`).
- **No network, no model call** outside the buttons that say so (recount, compact).
- **Never write to the user's settings**: the mod keeps its own in `$.store`.
- UI strings, code comments and commit messages are in English.

## Commits and pull requests

- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `chore:`…), in plain sentences: `fix: a long repo name no longer cuts the frame`.
- One topic per pull request. If the UI changes, add a screenshot.
- Add a line under *Unreleased* in [CHANGELOG.md](CHANGELOG.md) for anything a user would notice.

## Releasing (maintainers)

1. Move the *Unreleased* entries of `CHANGELOG.md` under the new version.
2. Bump `version` in `.claude-plugin/plugin.json`.
3. Merge to `main`, tag `vX.Y.Z` and push the tag. The release workflow checks the tag matches `plugin.json` and publishes the GitHub release with the changelog section.

Users update with `/plugin` → update, then `/reload-plugins`.
