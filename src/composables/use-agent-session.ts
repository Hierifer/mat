import { ref, shallowRef } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'

export interface AgentToolCall {
  id: string
  name: string
  input: Record<string, unknown>
  result: string | null
  isError: boolean
}

export interface AgentTimelineItem {
  id: string
  kind: 'user' | 'assistant' | 'tool' | 'system' | 'result' | 'error'
  text: string
  tool?: AgentToolCall
  timestamp: number
}

let itemCounter = 0
function nextItemId(): string {
  return `agent_item_${Date.now()}_${itemCounter++}`
}

/**
 * Manages a headless Claude Code agent session (stream-json mode).
 * Spawns the process via the Rust `agent_spawn` command, parses the
 * stream-json events into a renderable timeline.
 */
export function useAgentSession() {
  const agentId = ref<string | null>(null)
  const items = ref<AgentTimelineItem[]>([])
  const isRunning = ref(false)   // process alive
  const isBusy = ref(false)      // waiting for current turn to finish
  const model = ref('')
  const tools = ref<string[]>([])
  const slashCommands = ref<string[]>([])
  const totalCostUsd = ref(0)
  const lastDurationMs = ref(0)
  const exitCode = ref<number | null>(null)

  const unlisteners = shallowRef<UnlistenFn[]>([])
  // Map tool_use_id -> timeline item holding the tool card
  const toolItemsById = new Map<string, AgentTimelineItem>()

  function pushItem(item: Omit<AgentTimelineItem, 'id' | 'timestamp'>): AgentTimelineItem {
    const full: AgentTimelineItem = { ...item, id: nextItemId(), timestamp: Date.now() }
    items.value.push(full)
    // Return the reactive proxy element so later mutations trigger updates
    return items.value[items.value.length - 1]
  }

  function summarizeToolInput(input: Record<string, unknown>): string {
    const candidates = ['file_path', 'path', 'command', 'pattern', 'url', 'prompt', 'description']
    for (const key of candidates) {
      const v = input[key]
      if (typeof v === 'string' && v) {
        return v.length > 120 ? v.slice(0, 120) + '…' : v
      }
    }
    const raw = JSON.stringify(input)
    return raw.length > 120 ? raw.slice(0, 120) + '…' : raw
  }

  function handleEventLine(line: string) {
    let event: any
    try {
      event = JSON.parse(line)
    } catch {
      return
    }

    switch (event.type) {
      case 'system': {
        if (event.subtype === 'init') {
          model.value = event.model || ''
          if (Array.isArray(event.tools)) {
            tools.value = event.tools.filter((t: unknown) => typeof t === 'string')
          }
          if (Array.isArray(event.slash_commands)) {
            slashCommands.value = event.slash_commands.filter((c: unknown) => typeof c === 'string')
          }
        }
        break
      }
      case 'assistant': {
        const content = event.message?.content
        if (!Array.isArray(content)) break
        for (const block of content) {
          if (block.type === 'text' && block.text) {
            pushItem({ kind: 'assistant', text: block.text })
          } else if (block.type === 'tool_use') {
            const item = pushItem({
              kind: 'tool',
              text: summarizeToolInput(block.input || {}),
              tool: {
                id: block.id,
                name: block.name,
                input: block.input || {},
                result: null,
                isError: false,
              },
            })
            toolItemsById.set(block.id, item)
          }
        }
        break
      }
      case 'user': {
        // Tool results echoed back by the CLI
        const content = event.message?.content
        if (!Array.isArray(content)) break
        for (const block of content) {
          if (block.type === 'tool_result' && block.tool_use_id) {
            const item = toolItemsById.get(block.tool_use_id)
            if (item?.tool) {
              let text = ''
              if (typeof block.content === 'string') {
                text = block.content
              } else if (Array.isArray(block.content)) {
                text = block.content
                  .filter((c: any) => c.type === 'text')
                  .map((c: any) => c.text)
                  .join('\n')
              }
              item.tool.result = text
              item.tool.isError = !!block.is_error
            }
          }
        }
        break
      }
      case 'result': {
        isBusy.value = false
        if (typeof event.total_cost_usd === 'number') {
          totalCostUsd.value = event.total_cost_usd
        }
        if (typeof event.duration_ms === 'number') {
          lastDurationMs.value = event.duration_ms
        }
        if (event.is_error) {
          pushItem({ kind: 'error', text: event.result || 'Task failed' })
        }
        break
      }
    }
  }

  async function start(cwd: string) {
    if (agentId.value) return

    // @ts-ignore
    if (!window.__TAURI_INTERNALS__) return

    items.value = []
    toolItemsById.clear()
    exitCode.value = null
    totalCostUsd.value = 0
    model.value = ''

    const response = await invoke<{ agent_id: string }>('agent_spawn', { cwd })
    const id = response.agent_id
    agentId.value = id
    isRunning.value = true

    const unEvent = await listen<string>(`agent_event_${id}`, (e) => {
      handleEventLine(e.payload)
    })
    const unStderr = await listen<string>(`agent_stderr_${id}`, (e) => {
      console.warn('[Agent] stderr:', e.payload)
    })
    const unExit = await listen<number>(`agent_exit_${id}`, (e) => {
      isRunning.value = false
      isBusy.value = false
      exitCode.value = e.payload
    })
    unlisteners.value = [unEvent, unStderr, unExit]
  }

  async function send(text: string) {
    const trimmed = text.trim()
    if (!trimmed || !agentId.value || !isRunning.value) return

    pushItem({ kind: 'user', text: trimmed })
    isBusy.value = true
    try {
      await invoke('agent_send', { agentId: agentId.value, text: trimmed })
    } catch (error) {
      isBusy.value = false
      pushItem({ kind: 'error', text: String(error) })
    }
  }

  async function stop() {
    for (const un of unlisteners.value) un()
    unlisteners.value = []

    if (agentId.value) {
      try {
        await invoke('agent_kill', { agentId: agentId.value })
      } catch (error) {
        console.warn('[Agent] Failed to kill agent:', error)
      }
      agentId.value = null
    }
    isRunning.value = false
    isBusy.value = false
  }

  async function restart(cwd: string) {
    await stop()
    await start(cwd)
  }

  return {
    agentId,
    items,
    isRunning,
    isBusy,
    model,
    tools,
    slashCommands,
    totalCostUsd,
    lastDurationMs,
    exitCode,
    start,
    send,
    stop,
    restart,
  }
}
