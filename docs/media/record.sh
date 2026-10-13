#!/usr/bin/env bash
# Records the README demo: an asciinema session of Claude Code with session-status, turned into
# docs/media/demo.gif by agg. Needs asciinema, agg, git, and the mod installed (or --plugin-dir).
#
#   docs/media/record.sh            record, then convert
#   docs/media/record.sh --convert  convert the last recording again (other font size, trim…)
#   SELECT=event:11..event:122 docs/media/record.sh --convert   keep only that part (agg --select)
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
MEDIA="$ROOT/docs/media"
CAST="$MEDIA/demo.cast"   # kept out of git: it holds everything the terminal showed
GIF="$MEDIA/demo.gif"
DEMO_DIR=${DEMO_DIR:-/tmp/session-status-demo}
FONT=${FONT:-"FiraCode Nerd Font Mono"}
FONT_SIZE=${FONT_SIZE:-16}
THEME=${THEME:-github-dark}
SELECT=${SELECT:-}

convert() {
  agg --font-family "$FONT" --font-size "$FONT_SIZE" --theme "$THEME" \
    --idle-time-limit 2 --last-frame-duration 4 ${SELECT:+--select "$SELECT"} "$CAST" "$GIF"
  echo "→ $GIF ($(du -h "$GIF" | cut -f1))"
}

if [[ ${1:-} == --convert ]]; then convert; exit; fi

# A neutral project to record in: no personal path, no private repo on screen.
if [[ ! -d $DEMO_DIR/.git ]]; then
  git clone -q https://github.com/AdrienGras/claude-session-status-mod "$DEMO_DIR"
fi

cols=$(tput cols) rows=$(tput lines)
if (( cols < 140 || rows < 38 )); then
  echo "Terminal is ${cols}x${rows}: widen it to at least 140x38 so the pane docks beside the transcript."
  read -rp "Record anyway? [y/N] " ok; [[ $ok == y ]] || exit 1
fi

cat <<'SCENE'

  Scene (about 30 s, take your time: pauses over 2 s are cut)

  1. Wait 2 s on the empty session: the status line shows ctx ≈ (the estimate).
  2. Type:  List the files in hooks/ and say in one sentence what pane-rows.ts does.
     Watch the status line while it works, then once it answers (ctx turns real).
  3. Type:  /sst          the side pane opens. Wait 3 s.
            Keep the context lists folded: they name your MCP servers and memory files.
  4. Type:  /exit

  Recording starts in Claude Code fullscreen. Press Enter to begin.
SCENE
read -r

cd "$DEMO_DIR"
asciinema rec --overwrite --idle-time-limit 2 -c "claude" "$CAST"
convert
echo "Check the first frames: if Claude Code's welcome shows your account, trim it with"
echo "  SELECT=event:<first>..event:<last> $0 --convert   (see agg --help: --select)"
