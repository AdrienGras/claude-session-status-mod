// The side pane: docked beside the transcript in fullscreen, inline above the prompt otherwise.
import type { On } from 'claude-code'
import { atom, read, update } from 'claude-code'

import type { Part } from './parts'
import { toBreakdownView } from './context'
import { paneSections } from './pane-rows'
import { normalizeSettings } from './settings'
import { EMPTY_LIVE, emptyCounters, INITIAL_SETTINGS } from './state'
import { S } from './strings'
import type { GitSnapshot, Receipt, UsageView } from '../types'

export const PANE_ID = 'sst'

const usageAtom = atom({ plugin: 'session-status', key: 'usage' } as const, null as UsageView | null)
const liveAtom = atom({ plugin: 'session-status', key: 'live' } as const, EMPTY_LIVE)
const countersAtom = atom({ plugin: 'session-status', key: 'counters' } as const, emptyCounters(0))
const receiptAtom = atom({ plugin: 'session-status', key: 'receipt' } as const, null as Receipt | null)
const gitAtom = atom({ plugin: 'session-status', key: 'git' } as const, null as GitSnapshot | null)
const settingsAtom = atom({ plugin: 'session-status', key: 'settings' } as const, INITIAL_SETTINGS)
const expandedAtom = atom({ plugin: 'session-status', key: 'expanded' } as const, [] as string[])

export const registerPane = (on: On): void => {
  on('ui.render', { component: 'Pane', requestId: PANE_ID }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const columns = e.props.bodyColumns
    const sections = paneSections({
      usage: await read($, usageAtom),
      live: await read($, liveAtom),
      counters: await read($, countersAtom),
      receipt: await read($, receiptAtom),
      git: await read($, gitAtom),
      settings: normalizeSettings(await read($, settingsAtom)),
      expanded: await read($, expandedAtom),
      now: await $.clock.now(),
      columns,
    })
    const draw = (parts: Part[]) =>
      parts.map(p => (
        <Text color={p.color} bold={p.bold} dimColor={p.dim}>
          {p.text}
        </Text>
      ))

    const toggle = (key: string) => update($, expandedAtom, list => (list.includes(key) ? list.filter(k => k !== key) : [...list, key]))

    const compact = async () => {
      // A dismissed question rejects: that is a no.
      const answer = await $.ui.ask(S.compactConfirm, [S.compactYes, S.compactNo]).catch(() => S.compactNo)
      if (answer === S.compactYes) await $.command.run({ command: 'compact' })
    }

    // The exact count, as /context makes it: one token-count request per tool and memory file.
    const recount = async () => {
      const u = await $.session.usage({ breakdown: 'full', columns })
      const b = u.context.breakdown
      if (b) await update($, usageAtom, v => v && { ...v, tokens: u.context.tokens, breakdown: toBreakdownView(b), breakdownDetail: 'full' as const })
    }

    return (
      <Box flexDirection="column">
        {sections.map(s => (
          <Box key={`s-${s.key}`} flexDirection="column" marginBottom={1}>
            <Text bold color="claude">
              {s.title}
            </Text>
            {s.lines.map(line => (
              <Text>{draw(line)}</Text>
            ))}
            {s.groups.map(g => (
              <Box flexDirection="column">
                <Button key={`g-${g.key}`} label={g.key} plain onPress={() => toggle(g.key)}>
                  {draw(g.summary)}
                </Button>
                {g.items.map(line => (
                  <Text>{draw(line)}</Text>
                ))}
              </Box>
            ))}
          </Box>
        ))}
        <Box flexDirection="row">
          <Button key="compact" label={S.actionCompact} hotkey="c" onPress={compact} />
          <Text> </Text>
          <Button key="recount" label={S.actionRecount} hotkey="r" onPress={recount} />
          <Text> </Text>
          <Button
            key="settings"
            label={S.actionSettings}
            hotkey="s"
            onPress={() => $.ui.open({ id: 'sst-config', title: S.settingsTitle, focus: true, closeOnEscape: true })}
          />
        </Box>
      </Box>
    )
  })
}
