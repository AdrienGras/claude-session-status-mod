// The compact card above the prompt: a framed box at the right edge.
import type { On } from 'claude-code'
import { atom, read } from 'claude-code'

import { cardRows } from './card-rows'
import type { Part } from './card-rows'
import { normalizeSettings } from './settings'
import { EMPTY_LIVE, INITIAL_SETTINGS } from './state'
import { S } from './strings'
import type { GitSnapshot, UsageView } from '../types'

const usageAtom = atom({ plugin: 'session-status', key: 'usage' } as const, null as UsageView | null)
const liveAtom = atom({ plugin: 'session-status', key: 'live' } as const, EMPTY_LIVE)
const gitAtom = atom({ plugin: 'session-status', key: 'git' } as const, null as GitSnapshot | null)
const settingsAtom = atom({ plugin: 'session-status', key: 'settings' } as const, INITIAL_SETTINGS)

export const registerCard = (on: On): void => {
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    // The terminal only: the desktop app shows model and context on its own.
    if (e.surface !== 'terminal' || e.props.hasSurvey) return next(e)
    const rows = cardRows({
      usage: await read($, usageAtom),
      live: await read($, liveAtom),
      git: await read($, gitAtom),
      settings: normalizeSettings(await read($, settingsAtom)),
      now: await $.clock.now(),
    })
    if (rows.length === 0) return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)
    const draw = (parts: Part[]) =>
      parts.map(p => (
        <Text color={p.color} bold={p.bold} dimColor={p.dim}>
          {p.text}
        </Text>
      ))

    return (
      <Box justifyContent="flex-end">
        <Box borderStyle="round" flexDirection="column" paddingX={1}>
          {rows.map((row, i) => (
            <Box key={row.key} flexDirection="row">
              <Text>{draw(row.parts)}</Text>
              {i === 0 && (
                <Box marginLeft={2}>
                  <Button
                    key="open"
                    label={S.openPane}
                    hotkey="d"
                    plain
                    onPress={() => $.ui.open({ id: 'sst', title: S.paneTitle })}
                  />
                </Box>
              )}
            </Box>
          ))}
        </Box>
      </Box>
    )
  })
}
