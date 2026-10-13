# session-status

A Claude Code mod that replaces your status line with a native card and side pane. It shows the model, effort, context by category, rate-limit windows with a burn-rate projection, session cost and your repo. Everything is read from the session itself: no script polling every few seconds, no separate binary.

Tested on Claude Code **2.1.296**. Mods are an early-access Claude Code feature and their API may change between releases.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install session-status --marketplace AdrienGras/claude-session-status-mod
```

Answer `y` to add the marketplace, then pick a scope (user scope loads it in every session).

## What you see

### The card

A framed card at the right edge, just above the prompt, with three lines by default:

- **Model and effort**: `Opus 5.5  effort ▮▮▮▯▯ high`
- **Context**: a bar coloured by category, the same colours `/context` uses, then `140k/1M 14%`
- **5h window**: a bar of what you used, a `┊` mark where you would be at an even pace, the projection at reset and the verdict: `→ 40% ✓ +7h30` (time to spare) or `→ 140% ⚠ wall 1h04` (when you hit 100% at this pace)

`▸` (or `ctrl+x tab` then `d`) opens the side pane. Claude Code's own `[-]` control on the band, or `ctrl+x ctrl+a`, hides the card.

### The side pane

`/sst` toggles it. In fullscreen at 110 columns or more it docks beside the transcript; otherwise it sits above the prompt.

| Section | Shows |
| --- | --- |
| Model | model, effort, permission mode, working/idle, requests, time to first token and tokens per second of the last request, context window and where its size comes from |
| Context | the bar with a legend per category, tokens left before auto-compaction, and unfoldable lists of memory files, MCP servers, skills and agents |
| Quotas | every window your plan reports: 5h and 7d as burn bars with time to reset and reset clock time; any other window (a spend limit) as a plain gauge |
| Session | cost, cost per hour and per prompt, duration, prompts, compactions, tool calls by tool, subagents, and the last turn (duration, cost added, agents, edits, errors) |
| Repo | folder, `owner/repo`, branch, `+added −removed`, files changed, ahead/behind upstream, files changed during this session |

Buttons: **compact** runs `/compact` after asking, **recount** counts the context exactly as `/context` does, **settings** opens the settings pane.

## Commands

| Command | Does |
| --- | --- |
| `/sst` | open or close the side pane |
| `/sst config` | open the settings pane: which lines the card shows, their order, bar width (6–24) |
| `/sst debug` | print what the mod reads, for a bug report |

`/sst debug` prints figures and categories only: no path, MCP server, agent, skill, repo or branch name. It is safe to paste in an issue.

## Replacing your status line

The mod does not touch your settings. Once you are happy with it, remove the `statusLine` entry from `~/.claude/settings.json` yourself.

## Measured, estimated, counted

- **Colours** come from your Claude Code theme, so light, dark and colour-blind themes all read. Gauges step from success to warning to error: at 50% and 80% for context, and at 80% and 130% of projected use for quotas.
- **The context breakdown is an estimate** (Claude Code's local one, which costs nothing). The pane marks it `≈` until you press **recount**, which sends one token-count request per tool and memory file, as `/context` does. The total and percentage are the real figures.
- **Burn-rate projections** assume your pace so far holds until the reset. Early in a window (under 10% elapsed) they are marked `~` and drawn dim.
- **Time to first token and tokens per second** are timed by the mod around each request, so they include the network and other mods' hooks. They are not the API's own figures.
- **Compactions, tool calls and subagents** are counted by the mod from when it loaded, and labelled *since open*. Cost, duration and prompts come from Claude Code and cover the whole session, a resumed one included.
- A figure Claude Code does not have is left out, never shown as zero.

## Privacy

Everything runs locally. The mod reads Claude Code's session data and runs `git` in your project for the repo section. It makes no network request and calls no model. It keeps only its settings across sessions.

## Development

```sh
git clone https://github.com/AdrienGras/claude-session-status-mod
cd claude-session-status-mod
claude plugin validate .
claude plugin test .
claude --plugin-dir .
```

The pure logic (formatting, burn rate, bars, context, git parsing, card and pane lines) lives in `hooks/*.ts` and is unit-tested. The `*.tsx` files only draw. All displayed strings are in `hooks/strings.ts`.

## License

MIT
