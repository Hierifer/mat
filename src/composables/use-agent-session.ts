import { computed, ref, shallowRef, type Ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'

export interface AgentToolCall {
  id: string
  name: string
  input: Record<string, unknown>
  result: string | null
  isError: boolean
}

export interface AgentAttachment {
  path: string
  mediaType: string
  name: string
  previewUrl?: string
}

export interface AgentTimelineItem {
  id: string
  kind: 'user' | 'assistant' | 'tool' | 'system' | 'result' | 'error'
  text: string
  tool?: AgentToolCall
  attachments?: { name: string; path: string; previewUrl?: string }[]
  timestamp: number
}

export interface AgentTodoItem {
  content: string
  status: 'pending' | 'in_progress' | 'completed'
  activeForm?: string
}

let itemCounter = 0
function nextItemId(): string {
  return `agent_item_${Date.now()}_${itemCounter++}`
}

/**
 * Manages a headless Claude Code agent session (stream-json mode).
 * Spawns the process via the Rust `agent_spawn` command, parses the
 * stream-json events into a renderable timeline.
 *
 * @param roomId - Optional reactive ref to a chat room ID for SQLite persistence
 */
export function useAgentSession(roomId?: Ref<string | null>) {
  const agentId = ref<string | null>(null)
  const claudeSessionId = ref<string | null>(null) // Claude Code's own session ID (for --resume)
  const items = ref<AgentTimelineItem[]>([])
  const isRunning = ref(false)   // process alive
  const isBusy = ref(false)      // waiting for current turn to finish
  const isInitialized = ref(false) // received system/init from Claude Code
  const model = ref('')
  const tools = ref<string[]>([])
  const slashCommands = ref<string[]>([])
  const totalCostUsd = ref(0)
  const lastDurationMs = ref(0)
  const exitCode = ref<number | null>(null)
  const readOnly = ref(false)
  const suggestedResponses = ref<string[]>([])  // Claude Code's suggested replies from result event
  const currentTodos = ref<AgentTodoItem[]>([])
  const retryMessage = ref<{ text: string } | null>(null)
  // Per-turn metrics (reset when a new turn starts)
  const turnInputTokens = ref(0)
  const turnOutputTokens = ref(0)
  const busySince = ref<number | null>(null)    // Date.now() when isBusy became true

  const unlisteners = shallowRef<UnlistenFn[]>([])
  // Map tool_use_id -> timeline item holding the tool card
  const toolItemsById = new Map<string, AgentTimelineItem>()
  // Remember cwd for auto-resume
  let lastCwd = ''
  // Track the text currently being sent to the agent (for retry on error)
  let currentSendingText = ''

  function persistMessage(item: AgentTimelineItem) {
    const rid = roomId?.value
    if (!rid) return
    invoke('db_add_message', {
      message: {
        id: item.id,
        roomId: rid,
        kind: item.kind,
        text: item.text,
        toolJson: item.tool ? JSON.stringify(item.tool) : null,
        attachmentsJson: item.attachments ? JSON.stringify(item.attachments) : null,
        timestamp: item.timestamp,
      }
    }).catch(e => console.warn('[Agent] DB write failed:', e))
  }

  function pushItem(item: Omit<AgentTimelineItem, 'id' | 'timestamp'>): AgentTimelineItem {
    const full: AgentTimelineItem = { ...item, id: nextItemId(), timestamp: Date.now() }
    items.value.push(full)
    // Persist to SQLite
    persistMessage(full)
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

    console.log('[Agent] event:', event.type, event.subtype || '', JSON.stringify(event).slice(0, 500))

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
          // Capture Claude Code's session ID for future --resume
          if (event.session_id) {
            claudeSessionId.value = event.session_id
            const rid = roomId?.value
            if (rid) {
              invoke('db_update_claude_session_id', {
                roomId: rid,
                claudeSessionId: event.session_id,
              }).catch(e => console.warn('[Agent] Failed to persist claude session_id:', e))
            }
          }
        }
        break
      }
      case 'assistant': {
        // Accumulate token usage from this API call
        const usage = event.message?.usage
        if (usage) {
          if (typeof usage.input_tokens === 'number') turnInputTokens.value += usage.input_tokens
          if (typeof usage.output_tokens === 'number') turnOutputTokens.value += usage.output_tokens
        }
        const content = event.message?.content
        if (!Array.isArray(content)) break
        for (const block of content) {
          if (block.type === 'text' && block.text) {
            pushItem({ kind: 'assistant', text: block.text })
          } else if (block.type === 'tool_use') {
            // Extract TodoWrite data before creating timeline item
            if (block.name === 'TodoWrite' && Array.isArray(block.input?.todos)) {
              currentTodos.value = block.input.todos.map((t: any) => ({
                content: t.content || '',
                status: t.status || 'pending',
                activeForm: t.activeForm || '',
              }))
            }
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
              // Persist updated tool result
              persistMessage(item)
            }
          }
        }
        break
      }
      case 'result': {
        isBusy.value = false
        busySince.value = null
        if (typeof event.total_cost_usd === 'number') {
          totalCostUsd.value = event.total_cost_usd
        }
        if (typeof event.duration_ms === 'number') {
          lastDurationMs.value = event.duration_ms
        }
        if (event.is_error) {
          pushItem({ kind: 'error', text: event.result || 'Task failed' })
          // Save the first failed message for retry (don't overwrite if already set)
          if (!retryMessage.value && currentSendingText) {
            retryMessage.value = { text: currentSendingText }
          }
        } else {
          retryMessage.value = null
        }
        // Capture Claude Code's context-aware suggested replies
        if (Array.isArray(event.suggested_responses)) {
          suggestedResponses.value = event.suggested_responses.filter(
            (s: unknown) => typeof s === 'string' && s.trim()
          )
        } else {
          suggestedResponses.value = []
        }
        break
      }
    }
  }

  async function loadHistory(id: string) {
    // @ts-ignore
    if (!window.__TAURI_INTERNALS__) return

    try {
      const msgs = await invoke<Array<{
        id: string
        roomId: string
        kind: string
        text: string
        toolJson: string | null
        attachmentsJson: string | null
        timestamp: number
      }>>('db_get_messages', { roomId: id })

      for (const msg of msgs) {
        const item: AgentTimelineItem = {
          id: msg.id,
          kind: msg.kind as AgentTimelineItem['kind'],
          text: msg.text,
          tool: msg.toolJson ? JSON.parse(msg.toolJson) : undefined,
          attachments: msg.attachmentsJson ? JSON.parse(msg.attachmentsJson) : undefined,
          timestamp: msg.timestamp,
        }
        items.value.push(item)
        if (item.tool) {
          toolItemsById.set(item.tool.id, items.value[items.value.length - 1])
          // Restore currentTodos from the last TodoWrite in history
          if (item.tool.name === 'TodoWrite' && Array.isArray(item.tool.input?.todos)) {
            currentTodos.value = (item.tool.input.todos as any[]).map((t: any) => ({
              content: t.content || '',
              status: t.status || 'pending',
              activeForm: t.activeForm || '',
            }))
          }
        }
      }
    } catch (e) {
      console.warn('[Agent] Failed to load history:', e)
    }
  }

  async function start(cwd: string, resumeSessionId?: string) {
    if (agentId.value) return

    // @ts-ignore
    if (!window.__TAURI_INTERNALS__) return

    lastCwd = cwd

    // Don't clear items — loadHistory may have already populated them
    toolItemsById.clear()
    exitCode.value = null
    totalCostUsd.value = 0
    model.value = ''

    const response = await invoke<{ agent_id: string }>('agent_spawn', {
      cwd,
      resumeSessionId: resumeSessionId || null,
    })
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

  async function send(text: string, attachments?: AgentAttachment[]) {
    if (readOnly.value) return

    const trimmed = text.trim()
    const hasAttachments = attachments && attachments.length > 0
    if (!trimmed && !hasAttachments) return

    currentSendingText = trimmed

    // Auto-resume: if the process died but we have a claudeSessionId, respawn with --resume
    if (!isRunning.value && claudeSessionId.value && lastCwd) {
      pushItem({ kind: 'user', text: trimmed, attachments: attachments?.map((a) => ({ name: a.name, path: a.path, previewUrl: a.previewUrl })) })
      pushItem({ kind: 'system', text: 'Resuming session…' })
      isBusy.value = true
      busySince.value = Date.now()
      turnInputTokens.value = 0
      turnOutputTokens.value = 0
      try {
        await stop()
        await start(lastCwd, claudeSessionId.value)
        await invoke('agent_send', {
          agentId: agentId.value,
          text: trimmed,
          attachments: attachments?.map((a) => ({ path: a.path, media_type: a.mediaType })) ?? [],
        })
      } catch (error) {
        isBusy.value = false
        busySince.value = null
        pushItem({ kind: 'error', text: String(error) })
        if (!retryMessage.value) {
          retryMessage.value = { text: trimmed }
        }
      }
      return
    }

    if (!agentId.value || !isRunning.value) return

    suggestedResponses.value = []
    pushItem({
      kind: 'user',
      text: trimmed,
      attachments: attachments?.map((a) => ({ name: a.name, path: a.path, previewUrl: a.previewUrl })),
    })
    if (!isBusy.value) {
      isBusy.value = true
      busySince.value = Date.now()
      turnInputTokens.value = 0
      turnOutputTokens.value = 0
    }
    try {
      await invoke('agent_send', {
        agentId: agentId.value,
        text: trimmed,
        attachments: attachments?.map((a) => ({ path: a.path, media_type: a.mediaType })) ?? [],
      })
    } catch (error) {
      isBusy.value = false
      busySince.value = null
      pushItem({ kind: 'error', text: String(error) })
      if (!retryMessage.value) {
        retryMessage.value = { text: trimmed }
      }
    }
  }

  async function interrupt() {
    if (!agentId.value || !isRunning.value || !isBusy.value) return
    try {
      await invoke('agent_interrupt', { agentId: agentId.value })
      isBusy.value = false
    } catch (error) {
      console.warn('[Agent] Failed to interrupt:', error)
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
    items.value = []
    toolItemsById.clear()
    retryMessage.value = null
    await start(cwd)
  }

  async function retry() {
    const msg = retryMessage.value
    if (!msg || !lastCwd) return
    retryMessage.value = null
    pushItem({ kind: 'system', text: 'Retrying…' })
    isBusy.value = true
    busySince.value = Date.now()
    turnInputTokens.value = 0
    turnOutputTokens.value = 0
    currentSendingText = msg.text
    try {
      await stop()
      await start(lastCwd, claudeSessionId.value || undefined)
      await invoke('agent_send', {
        agentId: agentId.value,
        text: msg.text,
        attachments: [],
      })
    } catch (error) {
      isBusy.value = false
      busySince.value = null
      pushItem({ kind: 'error', text: String(error) })
      retryMessage.value = msg
    }
  }

  /** True when the process is dead but can be resumed via --resume */
  const canResume = computed(() => !isRunning.value && !!claudeSessionId.value && !!lastCwd)

  return {
    agentId,
    claudeSessionId,
    items,
    isRunning,
    isBusy,
    canResume,
    model,
    tools,
    slashCommands,
    totalCostUsd,
    lastDurationMs,
    exitCode,
    readOnly,
    suggestedResponses,
    currentTodos,
    retryMessage,
    start,
    send,
    interrupt,
    stop,
    restart,
    retry,
    loadHistory,
  }
}
