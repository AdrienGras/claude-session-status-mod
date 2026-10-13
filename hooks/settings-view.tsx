// The settings pane: which lines the card shows, in what order, how wide its bars are, and where it sits.
import type { On } from 'claude-code'
import { atom, read, update } from 'claude-code'

import { moveLine, normalizeSettings, resizeBars, SETTINGS_KEY, settingsRows, toggleLayout, toggleLine } from './settings'
import { INITIAL_SETTINGS } from './state'
import { S } from './strings'
import type { CardLine, Settings } from '../types'

export const CONFIG_PANE_ID = 'sst-config'

const settingsAtom = atom({ plugin: 'session-status', key: 'settings' } as const, INITIAL_SETTINGS)

const LABEL: Record<CardLine, string> = {
  model: S.lineModel,
  context: S.lineContext,
  five_hour: S.lineFiveHour,
  seven_day: S.lineSevenDay,
  cost: S.lineCost,
  repo: S.lineRepo,
}

export const registerSettingsView = (on: On): void => {
  on('ui.render', { component: 'Pane', requestId: CONFIG_PANE_ID }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const current = normalizeSettings(await read($, settingsAtom))

    // Drawn at once (the status line reads the same atom) and kept. The change goes to `update`
    // itself, so two presses before a redraw both land; the store gets the latest settings.
    const change = async (fn: (s: Settings) => Settings) => {
      await update($, settingsAtom, s => fn(normalizeSettings(s)))
      await $.store.set(SETTINGS_KEY, normalizeSettings(await read($, settingsAtom)))
    }

    return (
      <Box flexDirection="column">
        <Text bold color="claude">
          {S.cardLines}
        </Text>
        {settingsRows(current).map(({ line, isOn }) => (
          <Box key={`row-${line}`} flexDirection="row">
            <Button key={`line-${line}`} label={`${isOn ? '[x]' : '[ ]'} ${LABEL[line]}`} plain onPress={() => change(s => toggleLine(s, line))} />
            {isOn && (
              <Box marginLeft={1} flexDirection="row">
                <Button key={`up-${line}`} label="↑" plain onPress={() => change(s => moveLine(s, line, -1))} />
                <Text> </Text>
                <Button key={`down-${line}`} label="↓" plain onPress={() => change(s => moveLine(s, line, 1))} />
              </Box>
            )}
          </Box>
        ))}
        <Box marginTop={1} flexDirection="row">
          <Text>{`${S.barWidth} ${current.barWidth}  `}</Text>
          <Button key="narrower" label="−" hotkey="n" onPress={() => change(s => resizeBars(s, -1))} />
          <Text> </Text>
          <Button key="wider" label="+" hotkey="w" onPress={() => change(s => resizeBars(s, 1))} />
        </Box>
        <Box marginTop={1} flexDirection="row">
          <Text>{`${S.layout} ${current.hintLayout === 'below' ? S.layoutBelow : S.layoutInline}  `}</Text>
          <Button key="layout" label={S.layoutSwitch} hotkey="l" onPress={() => change(toggleLayout)} />
        </Box>
        <Box marginTop={1}>
          <Button key="done" label={S.done} role="dismiss" onPress={() => $.ui.close({ id: CONFIG_PANE_ID })} />
        </Box>
      </Box>
    )
  })
}
