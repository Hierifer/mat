import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { useAgentSession } from './use-agent-session'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }))

const mockInvoke = invoke as ReturnType<typeof vi.fn>
const mockListen = listen as ReturnType<typeof vi.fn>

// Captured event handlers keyed by event name, so tests can simulate
// backend emissions (agent_event_* / agent_stderr_* / agent_exit_*)
let handlers: Map<string, (event: { payload: unknown }) => void>
let unlistenSpies: ReturnType<typeof vi.fn>[]

function emit(name: string, payload: unknown) {
  handlers.get(name)?.({ payload })
}

function emitLine(agentId: string, obj: unknown) {
  emit(`agent_event_${agentId}`, JSON.stringify(obj))
}

async function startedSession(agentId = 'ag_1') {
  mockInvoke.mockImplementation(async (cmd: string) => {
    if (cmd === 'agent_spawn') return { agent_id: agentId }
    return undefined
  })
  const agent = useAgentSession()
  await agent.start('/repo/worktree')
  return agent
}

beforeEach(() => {
  handlers = new Map()
  unlistenSpies = []
  mockInvoke.mockReset()
  mockListen.mockReset()
  mockListen.mockImplementation(async (name: string, cb: (e: { payload: unknown }) => void) => {
    handlers.set(name, cb)
    const un = vi.fn(() => handlers.delete(name))
    unlistenSpies.push(un)
    return un
  })
  ;(window as any).__TAURI_INTERNALS__ = {}
})

afterEach(() => {
  delete (window as any).__TAURI_INTERNALS__
})

describe('use-agent-session start', () => {
  it('spawns the agent with the given cwd and subscribes to its events', async () => {
    const agent = await startedSession()

    expect(agent.agentId.value).toBe('ag_1')
    expect(agent.isRunning.value).toBe(true)
    const spawnCall = mockInvoke.mock.calls.find(c => c[0] === 'agent_spawn')!
    expect(spawnCall[1]).toEqual({ cwd: '/repo/worktree' })
    expect(handlers.has('agent_event_ag_1')).toBe(true)
    expect(handlers.has('agent_stderr_ag_1')).toBe(true)
    expect(handlers.has('agent_exit_ag_1')).toBe(true)
  })

  it('does nothing outside the Tauri environment', async () => {
    delete (window as any).__TAURI_INTERNALS__
    const agent = useAgentSession()
    await agent.start('/repo/worktree')

    expect(agent.agentId.value).toBeNull()
    expect(agent.isRunning.value).toBe(false)
    expect(mockInvoke).not.toHaveBeenCalled()
  })

  it('ignores a second start while a session is active', async () => {
    const agent = await startedSession()
    await agent.start('/repo/worktree')

    const spawnCalls = mockInvoke.mock.calls.filter(c => c[0] === 'agent_spawn')
    expect(spawnCalls).toHaveLength(1)
  })
})

describe('use-agent-session stream-json parsing', () => {
  it('records the model from system/init', async () => {
    const agent = await startedSession()
    emitLine('ag_1', { type: 'system', subtype: 'init', model: 'claude-fable-5' })

    expect(agent.model.value).toBe('claude-fable-5')
  })

  it('pushes assistant text blocks as timeline items', async () => {
    const agent = await startedSession()
    emitLine('ag_1', {
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'Hello there' }] },
    })

    expect(agent.items.value).toHaveLength(1)
    expect(agent.items.value[0]).toMatchObject({ kind: 'assistant', text: 'Hello there' })
  })

  it('creates a tool card for tool_use blocks with an input summary', async () => {
    const agent = await startedSession()
    emitLine('ag_1', {
      type: 'assistant',
      message: {
        content: [
          { type: 'tool_use', id: 'toolu_1', name: 'Read', input: { file_path: '/src/main.ts' } },
        ],
      },
    })

    expect(agent.items.value).toHaveLength(1)
    const item = agent.items.value[0]
    expect(item.kind).toBe('tool')
    expect(item.text).toBe('/src/main.ts')
    expect(item.tool).toMatchObject({ id: 'toolu_1', name: 'Read', result: null, isError: false })
  })

  it('attaches a string tool_result to the matching tool card', async () => {
    const agent = await startedSession()
    emitLine('ag_1', {
      type: 'assistant',
      message: { content: [{ type: 'tool_use', id: 'toolu_1', name: 'Bash', input: { command: 'ls' } }] },
    })
    emitLine('ag_1', {
      type: 'user',
      message: { content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'file_a\nfile_b' }] },
    })

    expect(agent.items.value[0].tool!.result).toBe('file_a\nfile_b')
    expect(agent.items.value[0].tool!.isError).toBe(false)
  })

  it('joins array-form tool_result text blocks', async () => {
    const agent = await startedSession()
    emitLine('ag_1', {
      type: 'assistant',
      message: { content: [{ type: 'tool_use', id: 'toolu_2', name: 'Grep', input: { pattern: 'foo' } }] },
    })
    emitLine('ag_1', {
      type: 'user',
      message: {
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'toolu_2',
            content: [
              { type: 'text', text: 'line 1' },
              { type: 'image', source: {} },
              { type: 'text', text: 'line 2' },
            ],
          },
        ],
      },
    })

    expect(agent.items.value[0].tool!.result).toBe('line 1\nline 2')
  })

  it('flags failed tool results', async () => {
    const agent = await startedSession()
    emitLine('ag_1', {
      type: 'assistant',
      message: { content: [{ type: 'tool_use', id: 'toolu_3', name: 'Bash', input: { command: 'boom' } }] },
    })
    emitLine('ag_1', {
      type: 'user',
      message: {
        content: [{ type: 'tool_result', tool_use_id: 'toolu_3', content: 'boom failed', is_error: true }],
      },
    })

    expect(agent.items.value[0].tool!.isError).toBe(true)
  })

  it('finishes the turn on result: clears busy and records cost/duration', async () => {
    const agent = await startedSession()
    await agent.send('do something')
    expect(agent.isBusy.value).toBe(true)

    emitLine('ag_1', {
      type: 'result',
      subtype: 'success',
      is_error: false,
      total_cost_usd: 0.1234,
      duration_ms: 4200,
    })

    expect(agent.isBusy.value).toBe(false)
    expect(agent.totalCostUsd.value).toBe(0.1234)
    expect(agent.lastDurationMs.value).toBe(4200)
    // Only the user message is in the timeline, no error item
    expect(agent.items.value.filter(i => i.kind === 'error')).toHaveLength(0)
  })

  it('pushes an error item when the result is an error', async () => {
    const agent = await startedSession()
    emitLine('ag_1', { type: 'result', is_error: true, result: 'API overloaded' })

    expect(agent.items.value).toHaveLength(1)
    expect(agent.items.value[0]).toMatchObject({ kind: 'error', text: 'API overloaded' })
  })

  it('ignores malformed JSON lines', async () => {
    const agent = await startedSession()
    emit('agent_event_ag_1', 'not json at all {')

    expect(agent.items.value).toHaveLength(0)
  })

  it('truncates long tool input summaries', async () => {
    const agent = await startedSession()
    emitLine('ag_1', {
      type: 'assistant',
      message: {
        content: [{ type: 'tool_use', id: 'toolu_4', name: 'Bash', input: { command: 'x'.repeat(300) } }],
      },
    })

    const text = agent.items.value[0].text
    expect(text.length).toBe(121)
    expect(text.endsWith('…')).toBe(true)
  })
})

describe('use-agent-session send', () => {
  it('pushes a user item, marks busy and forwards the text to the backend', async () => {
    const agent = await startedSession()
    await agent.send('  refactor the store  ')

    expect(agent.items.value).toHaveLength(1)
    expect(agent.items.value[0]).toMatchObject({ kind: 'user', text: 'refactor the store' })
    expect(agent.isBusy.value).toBe(true)
    const sendCall = mockInvoke.mock.calls.find(c => c[0] === 'agent_send')!
    expect(sendCall[1]).toEqual({ agentId: 'ag_1', text: 'refactor the store' })
  })

  it('ignores empty messages', async () => {
    const agent = await startedSession()
    await agent.send('   ')

    expect(agent.items.value).toHaveLength(0)
    expect(mockInvoke.mock.calls.filter(c => c[0] === 'agent_send')).toHaveLength(0)
  })

  it('ignores messages when no session is running', async () => {
    const agent = useAgentSession()
    await agent.send('hello')

    expect(agent.items.value).toHaveLength(0)
    expect(mockInvoke).not.toHaveBeenCalled()
  })

  it('recovers from a failed send with an error item', async () => {
    const agent = await startedSession()
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'agent_send') throw new Error('stdin closed')
      return undefined
    })

    await agent.send('hello')

    expect(agent.isBusy.value).toBe(false)
    const errorItem = agent.items.value.find(i => i.kind === 'error')
    expect(errorItem?.text).toContain('stdin closed')
  })
})

describe('use-agent-session lifecycle', () => {
  it('marks the session dead on exit event', async () => {
    const agent = await startedSession()
    await agent.send('task')

    emit('agent_exit_ag_1', 1)

    expect(agent.isRunning.value).toBe(false)
    expect(agent.isBusy.value).toBe(false)
    expect(agent.exitCode.value).toBe(1)
  })

  it('stop kills the process and unsubscribes all listeners', async () => {
    const agent = await startedSession()
    await agent.stop()

    const killCall = mockInvoke.mock.calls.find(c => c[0] === 'agent_kill')!
    expect(killCall[1]).toEqual({ agentId: 'ag_1' })
    expect(agent.agentId.value).toBeNull()
    expect(agent.isRunning.value).toBe(false)
    for (const un of unlistenSpies) {
      expect(un).toHaveBeenCalled()
    }
  })

  it('restart starts a fresh session with a cleared timeline', async () => {
    const agent = await startedSession()
    emitLine('ag_1', {
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'old content' }] },
    })
    expect(agent.items.value).toHaveLength(1)

    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'agent_spawn') return { agent_id: 'ag_2' }
      return undefined
    })
    await agent.restart('/repo/worktree')

    expect(agent.agentId.value).toBe('ag_2')
    expect(agent.isRunning.value).toBe(true)
    expect(agent.items.value).toHaveLength(0)
    expect(handlers.has('agent_event_ag_2')).toBe(true)
  })
})
