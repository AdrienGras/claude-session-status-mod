# Changelog

All notable changes to this project are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Contributing guide, code of conduct, security policy, issue and pull request templates.
- CI: manifest validation and tests on every push and pull request; GitHub releases published from tags.
- A **Layout** setting in `/sst config`: the status line can take a row of its own under Claude Code's hint, which then stays exactly as Claude Code draws it (coloured mode, live pills). The default is unchanged: one row.

### Changed

- Token counts under a thousand are shown as they are (`800`, not `1k` or `0k`).

### Fixed

- In a linked git worktree, the Repo box and the branch item describe that worktree, not the main checkout.
- Files with non-ASCII or quoted names stay in *changed this session*.
- A diff git can't read (a repo with no commit yet, a timeout) is left out instead of shown as `+0 −0 · 0 files`; a detached HEAD keeps its diff.
- `/sst` opens the pane while a turn is running, instead of waiting for it to end.
- `/sst` brings the pane forward when it is a tab behind the settings, instead of closing it.
- Past a window's reset, the quota shows `—` until the next reply instead of the old window's figures.
- After `/compact` (the pane's button included), the old context fill no longer stays on screen until the next turn.
- After `/clear`, the new conversation's figures and files are read at once, and its counts survive a plugin reload.
- A refused subagent isn't counted, and a denied or failed edit counts as an error, not an edit.
- The Context box's MCP group counts only the tools loaded in the window, not deferred ones.
- Wide characters (`⛔`, CJK, emoji) no longer push rows past the pane's frame or the status line past its room; a long branch name keeps the Repo box's title and corner.
- Two quick presses in `/sst config` both take effect.
- An effort level with no notches shows in the status line as its word, as in the pane.
- The *skills* list in the Context box unfolds onto its skills (the ten biggest), instead of nothing.
- The 30 s redraw (countdowns, the `┊` mark) starts even when the first usage read fails.
- The pane's turn timer counts seconds while a turn runs, instead of moving every 30 s.

### Security

- `/sst debug` prints only the Claude model name, never a configured model id such as a Bedrock ARN with an AWS account id in it.

## [0.1.1] - 2026-10-13

### Changed

- The session cost is no longer in the status line by default (it's one `/sst config` away).
- README: TL;DR install, demo GIF and screenshots.

## [0.1.0] - 2026-10-13

First release.

### Added

- Status line under the prompt: model and effort, context bar coloured by category, 5h window with burn-rate projection; 7d window, session cost and branch & diff on demand.
- Side pane (`/sst`): model, context by category, quotas, session, repo, with **compact**, **recount** and **settings** buttons.
- Settings pane (`/sst config`): pick, reorder and size the status line items.
- `/sst debug`: what the mod sees, figures and categories only.

[Unreleased]: https://github.com/AdrienGras/claude-session-status-mod/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/AdrienGras/claude-session-status-mod/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/AdrienGras/claude-session-status-mod/releases/tag/v0.1.0
