import { atom, read, update } from 'claude-code'
import type { AgentStatus, EngineInterface, Register } from 'claude-code'

import type { SquadStatus, Squaddie } from '../types'

const PANE = 'agent-squad'
const TITLE = 'Agent squad'
const agents = atom({ plugin: 'agent-squad', key: 'agents' } as const, {})
const tick = atom({ plugin: 'agent-squad', key: 'tick' } as const, 0)

// Finished agents linger this long so you can admire them, then go home.
const LINGER_MS = 15 * 60 * 1000

const FIGURES: Record<SquadStatus, string[][]> = {
  running: [
    [' o  ', '/|\\ ', '/ \\ '],
    [' o  ', '\\|/ ', ' |  '],
    [' o_ ', '/|  ', '/ > '],
  ],
  waiting: [
    [' o z', '/|\\ ', '/ \\ '],
    [' o Z', '/|\\ ', '/ \\ '],
  ],
  done: [
    ['\\o/ ', ' |  ', '/ \\ '],
    [' o/ ', '/|  ', '/ \\ '],
  ],
  failed: [['    ', '    ', 'x-|-<']],
  killed: [['    ', '    ', 'x-|-<']],
}

const COLORS: Record<SquadStatus, string> = {
  running: 'claude',
  waiting: 'warning',
  done: 'success',
  failed: 'error',
  killed: 'inactive',
}

// Progress bands, by estimated percent. The estimate is a guess; so are the jokes.
const QUIPS: Array<[number, string[]]> = [
  [10, [
    'Stretching. Reading the prompt twice.',
    'Cracking knuckles. Locating the codebase.',
    'Asking itself "what is a repo, really?"',
  ]],
  [30, [
    'Opened a file. Opened another. Vibes are forming.',
    'Has a theory. The theory is probably wrong.',
    'Nodding thoughtfully at a function name.',
  ]],
  [60, [
    'Halfway there (allegedly).',
    'Muttering "ah, interesting" a lot.',
    'Found the bug. Lost the bug. Found it again.',
  ]],
  [85, [
    'Can smell the finish line. It smells like JSON.',
    'Drafting the summary in its head.',
    'Practising its "it was easy, actually" face.',
  ]],
  [101, [
    'Just one more grep. Promise.',
    '97% done. The hardest 97%.',
    'Polishing the report nobody will fully read.',
  ]],
]

const TOOL_QUIPS: Record<string, string> = {
  Read: 'Reading. Lips moving slightly.',
  Grep: 'Looking for something. Probably under the couch.',
  Glob: 'Rummaging through folders like a raccoon.',
  Bash: 'Typing commands with great confidence and no undo.',
  Edit: 'Editing files. Hands where we can see them.',
  Write: 'Writing a whole new file. Bold.',
  WebFetch: 'On the internet. Pray for it.',
  WebSearch: 'Googling. Will come back with 40 tabs.',
  Agent: 'Delegating. Real management material.',
}

const END_QUIPS: Record<'done' | 'failed' | 'killed', string[]> = {
  done: ['Done! Now demands a raise.', 'Finished. Taking a victory lap.', 'Clocked out. Left a note.'],
  failed: ['Has fallen and cannot get up.', 'Tripped over an edge case.', 'Error. Lying down to think about it.'],
  killed: ['Was politely asked to leave.', 'Escorted out by security.'],
}

const hash = (s: string) => [...s].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7)

const toSquad = (s: AgentStatus): SquadStatus =>
  s === 'completed' ? 'done'
    : s === 'failed' ? 'failed'
      : s === 'killed' ? 'killed'
        : s === 'waiting' || s === 'idle' ? 'waiting'
          : 'running'

const isActive = (a: Squaddie) => a.status === 'running' || a.status === 'waiting'

// No agent reports real progress, so make one up: tool calls and time both
// push it towards 100%, never quite getting there until it actually finishes.
function percent(a: Squaddie, now: number): number {
  if (a.status === 'done') return 100
  const secs = ((a.endedAt ?? now) - a.startedAt) / 1000
  const p = 1 - Math.exp(-(a.tools / 10 + secs / 120))
  return Math.min(97, Math.round(p * 100))
}

function quip(a: Squaddie, pct: number, t: number, now: number): string {
  const seed = hash(a.id) + Math.floor(t / 8)
  if (a.status === 'done' || a.status === 'failed' || a.status === 'killed') {
    const list = END_QUIPS[a.status]
    return list[hash(a.id) % list.length] ?? ''
  }
  if (a.status === 'waiting') return 'On a break. Union-mandated.'
  if (now - a.startedAt > 10 * 60 * 1000 && seed % 3 === 0) {
    return 'Gone so long we are drafting a missing-persons poster.'
  }
  const toolQuip = a.lastTool ? TOOL_QUIPS[a.lastTool] : undefined
  if (toolQuip && seed % 3 === 1) return toolQuip
  const band = QUIPS.find(([max]) => pct < max)?.[1] ?? []
  return band[seed % band.length] ?? 'Working. Probably.'
}

function elapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`
}

function bar(pct: number, width: number): string {
  const filled = Math.round((pct / 100) * width)
  return '[' + '='.repeat(Math.max(0, filled - 1)) + (filled > 0 ? '>' : '') + '.'.repeat(width - filled) + ']'
}

async function sync($: EngineInterface) {
  const live = await $.agent.list()
  const now = await $.clock.now()
  await update($, agents, all => {
    const next: Record<string, Squaddie> = { ...all }
    for (const info of live) {
      const status = toSquad(info.status)
      const prev = next[info.id]
      next[info.id] = {
        id: info.id,
        name: info.name ?? prev?.name ?? info.type,
        type: info.type,
        description: info.description || prev?.description || '',
        startedAt: prev?.startedAt ?? now,
        endedAt: status === 'running' || status === 'waiting' ? undefined : (prev?.endedAt ?? now),
        tools: prev?.tools ?? 0,
        lastTool: prev?.lastTool,
        status,
      }
    }
    for (const [id, a] of Object.entries(next)) {
      if (!isActive(a) && a.endedAt && now - a.endedAt > LINGER_MS) delete next[id]
    }
    return next
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'squad',
      description: 'Show your subagents as a squad of tiny, overworked people',
    })
    let n = 0
    $.clock.every(1000, () => {
      void (async () => {
        const all = Object.values(await read($, agents))
        if (!all.some(isActive)) return
        await update($, tick, t => t + 1)
        if (++n % 3 === 0) await sync($)
      })()
    })
    return next(e)
  })

  on('command.run', { command: 'squad' }, async $ => {
    await sync($)
    await $.ui.open({ id: PANE, title: TITLE })
    return { text: 'Squad pane opened.' }
  })

  on('agent.spawn', async ($, e, next) => {
    const result = await next(e)
    if (!('agentId' in result) || !result.agentId) return result
    const id = result.agentId
    const now = await $.clock.now().catch(() => Date.now())
    await update($, agents, all => ({
      ...all,
      [id]: {
        id,
        name: e.name ?? e.subagentType,
        type: e.subagentType,
        description: e.description,
        startedAt: now,
        tools: 0,
        status: 'running' as const,
      },
    })).catch(() => {})
    void $.ui.open({ id: PANE, title: TITLE })
    return result
  })

  on('tool.call', async ($, e, next) => {
    const id = e.agentId
    if (id) {
      // Bookkeeping only: never let the squad pane get in the way of a real tool call.
      await update($, agents, all =>
        all[id] ? { ...all, [id]: { ...all[id], tools: all[id].tools + 1, lastTool: e.tool } } : all,
      ).catch(() => {})
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const id = e.agentId
    if (id) {
      const now = await $.clock.now()
      const status: SquadStatus = e.reason === 'answer' ? 'done' : e.isAborted ? 'killed' : 'failed'
      await update($, agents, all =>
        all[id] ? { ...all, [id]: { ...all[id], status, endedAt: now } } : all,
      )
    }
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const all = Object.values(await read($, agents))
    const t = await read($, tick)
    const now = await $.clock.now()
    const cols = e.props.bodyColumns ?? 40
    const barWidth = Math.max(8, Math.min(30, cols - 18))

    if (all.length === 0) {
      return (
        <Box flexDirection="column">
          <Text dimColor>{' o '}</Text>
          <Text dimColor>{'/|\\'}</Text>
          <Text dimColor>{'/ \\'}</Text>
          <Text dimColor italic>Nobody here. The office is suspiciously quiet.</Text>
        </Box>
      )
    }

    const order = (a: Squaddie) => (a.status === 'running' ? 0 : a.status === 'waiting' ? 1 : 2)
    const sorted = all.sort((a, b) => order(a) - order(b) || b.startedAt - a.startedAt)
    const working = all.filter(isActive).length
    const done = all.filter(a => a.status === 'done').length
    const fallen = all.length - working - done

    return (
      <Box flexDirection="column" gap={1}>
        <Text bold>
          {working} working · {done} done · {fallen} fallen
        </Text>
        {sorted.map(a => {
          const pct = percent(a, now)
          const frames = FIGURES[a.status]
          const fig = frames[t % frames.length] ?? frames[0] ?? []
          const color = COLORS[a.status]
          return (
            <Box key={a.id} flexDirection="row" gap={1}>
              <Box flexDirection="column" width={5} flexShrink={0}>
                {fig.map(line => <Text color={color}>{line}</Text>)}
              </Box>
              <Box flexDirection="column" flexGrow={1}>
                <Text wrap="truncate-end">
                  <Text bold color={color}>{a.name}</Text>
                  <Text dimColor> · {a.type} · {elapsed((a.endedAt ?? now) - a.startedAt)} · {a.tools} tools</Text>
                </Text>
                {a.description && <Text wrap="truncate-end">"{a.description}"</Text>}
                <Text color={color}>
                  {bar(pct, barWidth)} {pct}%
                </Text>
                <Text dimColor italic wrap="wrap">{quip(a, pct, t, now)}</Text>
              </Box>
            </Box>
          )
        })}
      </Box>
    )
  })
}
