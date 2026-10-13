# Security policy

## Supported versions

Only the latest release gets fixes. Update with `/plugin` → update, then `/reload-plugins`.

## Reporting a vulnerability

Please **do not open a public issue**. Use GitHub's private reporting instead:
[Report a vulnerability](https://github.com/AdrienGras/claude-session-status-mod/security/advisories/new).

Include what you found, how to reproduce it, and which versions of the mod and Claude Code you used. You'll get an answer within a week. Once a fix is out, the advisory is published and you are credited, unless you'd rather not be.

## What counts

The mod runs inside your Claude Code session. Relevant reports include, for example:

- `/sst debug` leaking something local (a path, a repo or branch name, an MCP server, skill or agent name): its output is meant to be pasted in public issues.
- The mod running a command other than the read-only `git` calls of the repo box, or running `git` with input it shouldn't trust.
- The mod making a network request or a model call outside the **recount** and **compact** buttons.
- The mod writing outside its own `$.store`, such as to your Claude Code settings.

Issues in Claude Code itself go to [Anthropic](https://github.com/anthropics/claude-code/security).
