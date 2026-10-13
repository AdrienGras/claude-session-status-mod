// Initial values of the state atoms. Each file that reads or writes an atom declares it itself,
// with a literal reference (the validator reads them where they are used):
//   const live = atom({ plugin: 'session-status', key: 'live' } as const, EMPTY_LIVE)
import { DEFAULT_SETTINGS } from './settings'
import type { Counters, Live, Settings } from '../types'

export const EMPTY_LIVE: Live = { model: null, effort: null, permissionMode: null, isWorking: false, requests: 0, speed: null }

export const emptyCounters = (since: number): Counters => ({ since, compactions: 0, tools: {}, subagents: 0 })

export const INITIAL_SETTINGS: Settings = DEFAULT_SETTINGS
