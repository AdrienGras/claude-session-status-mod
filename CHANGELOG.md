# Changelog

All notable changes to this project are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Contributing guide, code of conduct, security policy, issue and pull request templates.
- CI: manifest validation and tests on every push and pull request; GitHub releases published from tags.

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
