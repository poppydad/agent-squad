export type SquadStatus = 'running' | 'waiting' | 'done' | 'failed' | 'killed'

export type Squaddie = {
  id: string
  name: string
  type: string
  description: string
  startedAt: number
  endedAt?: number
  tools: number
  lastTool?: string
  status: SquadStatus
}

declare module 'claude-code' {
  interface PluginState {
    'agent-squad': { agents: Record<string, Squaddie>; tick: number }
  }
}
