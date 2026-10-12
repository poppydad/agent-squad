import { expect, mock, test } from 'claude-code/testing'

const PANE = {
  component: 'Pane',
  requestId: 'agent-squad',
  props: {
    title: 'Agent squad',
    isFocused: false,
    bodyColumns: 50,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

test('an empty squad says so', async ($, on) => {
  mock.clock(on)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'agent-squad', surface, ...PANE })
    expect(await ui.find({ type: 'Text', text: /suspiciously quiet/ })).toBeDefined()
    await ui.unmount()
  }
})

test('a spawned agent shows up working, then finishes', async ($, on) => {
  mock.clock(on)
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('agent.spawn', () => ({ model: 'haiku', agentId: 'a1' }))
  await $.agent.spawn({ prompt: 'look around', description: 'find the auth code', subagentType: 'Explore', name: 'scout' })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'agent-squad', surface, ...PANE })
    expect(await ui.find({ type: 'Text', text: /1 working/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /scout/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /find the auth code/ })).toBeDefined()
    await ui.unmount()
  }

  await $.turn.complete({
    answer: 'found it', durationMs: 1000, isAborted: false, turnId: 't1', agentId: 'a1', reason: 'answer',
  } as never)

  const ui = await $.ui.mount({ plugin: 'agent-squad', surface: 'terminal', ...PANE })
  expect(await ui.find({ type: 'Text', text: /1 done/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /100%/ })).toBeDefined()
})
