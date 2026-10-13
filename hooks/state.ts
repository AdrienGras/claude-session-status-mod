// The values the drawings read; a write redraws every reader.
import { atom } from 'claude-code'

import { DEFAULT_SETTINGS } from './settings'
import type { Counters, GitSnapshot, Live, Receipt, Settings, UsageView } from '../types'

const ref = <K extends string>(key: K) => ({ plugin: 'session-status', key }) as const

export const EMPTY_LIVE: Live = { model: null, effort: null, permissionMode: null, isWorking: false, requests: 0, speed: null }

export const emptyCounters = (since: number): Counters => ({ since, compactions: 0, tools: {}, subagents: 0 })

export const usage = atom(ref('usage'), null as UsageView | null)
export const live = atom(ref('live'), EMPTY_LIVE)
export const counters = atom(ref('counters'), emptyCounters(0))
export const receipt = atom(ref('receipt'), null as Receipt | null)
export const git = atom(ref('git'), null as GitSnapshot | null)
export const settings = atom(ref('settings'), DEFAULT_SETTINGS as Settings)
export const view = atom(ref('view'), 'main' as 'main' | 'settings')
export const expanded = atom(ref('expanded'), [] as string[])
