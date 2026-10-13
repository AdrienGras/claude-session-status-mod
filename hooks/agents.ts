// The subagent cards: pure transitions over a list of cards, fed by the events in track.ts.
import type { AgentCard } from '../types'

export const MAX_CALLS = 3
export const MAX_FINISHED = 3

type StepUsage = {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
}

export const spawnCard = (id: string, type: string, task: string, now: number): AgentCard => ({
  id,
  type,
  task,
  startedAt: now,
  endedAt: null,
  state: 'running',
  steps: 0,
  contextTokens: null,
  outputTokens: 0,
  calls: [],
})

/** A step always counts; its usage, when known, sums the output and replaces the context. */
export const stepCard = (card: AgentCard, usage: StepUsage | null): AgentCard => {
  if (!usage) return { ...card, steps: card.steps + 1 }
  return {
    ...card,
    steps: card.steps + 1,
    contextTokens: usage.input_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens,
    outputTokens: card.outputTokens + usage.output_tokens,
  }
}

const DETAIL_KEYS = ['file_path', 'notebook_path', 'path', 'command', 'pattern', 'url', 'query'] as const

/** The first non-empty text field of a tool's input, cut to its first line. */
export const callDetail = (input: unknown): string | null => {
  if (typeof input !== 'object' || input === null) return null
  const fields = input as Record<string, unknown>
  for (const key of DETAIL_KEYS) {
    const value = fields[key]
    if (typeof value === 'string' && value !== '') return value.split('\n')[0] ?? null
  }
  return null
}

export const callCard = (card: AgentCard, tool: string, input: unknown): AgentCard => ({
  ...card,
  calls: [...card.calls, { tool, detail: callDetail(input) }].slice(-MAX_CALLS),
})

/** The state is set once: a card already ended stays as it is. */
export const endCard = (card: AgentCard, end: { reason: string; isAborted: boolean }, now: number): AgentCard => {
  if (card.state !== 'running') return card
  const state =
    end.isAborted || end.reason === 'aborted' ? 'stopped' : end.reason === 'error' || end.reason === 'refusal' ? 'failed' : 'done'
  return { ...card, state, endedAt: now }
}

const LISTED_END = {
  completed: { reason: 'answer', isAborted: false },
  failed: { reason: 'error', isAborted: false },
  killed: { reason: 'aborted', isAborted: true },
} as const

/** An agent that never raised `turn.complete` (killed) is ended from what the agent list reports. */
export const reconcile = (
  cards: readonly AgentCard[],
  listed: readonly { id: string; status: string }[],
  now: number,
): AgentCard[] =>
  cards.map((card) => {
    const status = listed.find((l) => l.id === card.id)?.status
    const end = status && status in LISTED_END ? LISTED_END[status as keyof typeof LISTED_END] : null
    return end ? endCard(card, end, now) : card
  })

export const withCard = (cards: readonly AgentCard[], id: string, change: (c: AgentCard) => AgentCard): AgentCard[] =>
  cards.map((card) => (card.id === id ? change(card) : card))

/** Every running card (oldest first), then the last finished ones (newest first). */
export const keepCards = (cards: readonly AgentCard[]): AgentCard[] => {
  const running = cards.filter((c) => c.state === 'running').sort((a, b) => a.startedAt - b.startedAt)
  const finished = cards
    .filter((c) => c.state !== 'running')
    .sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0))
    .slice(0, MAX_FINISHED)
  return [...running, ...finished]
}
