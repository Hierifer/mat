<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTerminalStore } from '@/stores/terminal-store'
import MarkdownIt from 'markdown-it'
import { useAgentSession, type AgentAttachment, type AgentTimelineItem } from '@/composables/use-agent-session'
import IconFont from '@/components/ui/icon-font.vue'
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { useNotification } from '@/composables/use-notification'

// html: false escapes raw HTML from the model output (XSS-safe)
const md = new MarkdownIt({ html: false, linkify: true, breaks: true })

function renderMarkdown(text: string): string {
  return md.render(text)
}

const props = defineProps<{
  cwd: string
  roomId?: string
  readOnly?: boolean
  resumeSessionId?: string | null
}>()

const { t } = useI18n()
const store = useTerminalStore()
const { notify } = useNotification()
const roomIdRef = computed(() => props.roomId ?? null)
const agent = useAgentSession(roomIdRef)

const isLightTheme = computed(() => store.currentThemeName.includes('Light'))

const inputText = ref('')
const timelineRef = ref<HTMLElement | null>(null)
const expandedTools = ref<Set<string>>(new Set())
const showScrollToBottom = ref(false)

function handleTimelineScroll() {
  const el = timelineRef.value
  if (!el) return
  // Show button when scrolled up more than 80px from bottom
  const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
  showScrollToBottom.value = distanceFromBottom > 80
}

// AskUserQuestion interactive card helpers
interface AskQuestion {
  question: string
  header?: string
  options: { label: string; description?: string }[]
  multiSelect?: boolean
}

function isAskUserQuestion(item: AgentTimelineItem): boolean {
  return item.kind === 'tool' && item.tool?.name === 'AskUserQuestion'
}

function getAskQuestions(item: AgentTimelineItem): AskQuestion[] {
  if (!isAskUserQuestion(item)) return []
  const input = item.tool?.input
  if (!input || !Array.isArray(input.questions)) return []
  return input.questions as AskQuestion[]
}

function isAskPending(item: AgentTimelineItem): boolean {
  return isAskUserQuestion(item) && item.tool?.result === null
}

// ExitPlanMode: render plan content as a markdown card
function isExitPlanMode(item: AgentTimelineItem): boolean {
  return item.kind === 'tool' && item.tool?.name === 'ExitPlanMode'
}

function getPlanContent(item: AgentTimelineItem): string {
  if (!isExitPlanMode(item)) return ''
  const input = item.tool?.input
  if (!input) return ''
  // The plan field contains the markdown content written to the plan file
  if (typeof input.plan === 'string') return input.plan
  // Fallback: try to extract from allowedPrompts or other fields
  return ''
}

function isPlanPending(item: AgentTimelineItem): boolean {
  return isExitPlanMode(item) && item.tool?.result === null
}

// TodoWrite card helpers
function isTodoWrite(item: AgentTimelineItem): boolean {
  return item.kind === 'tool' && item.tool?.name === 'TodoWrite'
}

const todoCompletedCount = computed(() =>
  agent.currentTodos.value.filter(t => t.status === 'completed').length
)
const todoTotalCount = computed(() => agent.currentTodos.value.length)
const todoAllDone = computed(() => todoTotalCount.value > 0 && todoCompletedCount.value === todoTotalCount.value)

// Track selected answers per AskUserQuestion item
const askSelections = ref<Record<string, Record<number, Set<number>>>>({})  // itemId -> questionIdx -> selected option indices
const askOtherTexts = ref<Record<string, Record<number, string>>>({})       // itemId -> questionIdx -> custom text
const askUsingOther = ref<Record<string, Record<number, boolean>>>({})      // itemId -> questionIdx -> using other input

function ensureAskState(itemId: string, qIdx: number) {
  if (!askSelections.value[itemId]) askSelections.value[itemId] = {}
  if (!askSelections.value[itemId][qIdx]) askSelections.value[itemId][qIdx] = new Set()
  if (!askOtherTexts.value[itemId]) askOtherTexts.value[itemId] = {}
  if (!askOtherTexts.value[itemId][qIdx]) askOtherTexts.value[itemId][qIdx] = ''
  if (!askUsingOther.value[itemId]) askUsingOther.value[itemId] = {}
  if (askUsingOther.value[itemId][qIdx] === undefined) askUsingOther.value[itemId][qIdx] = false
}

function toggleAskOption(itemId: string, qIdx: number, optIdx: number, multiSelect: boolean) {
  ensureAskState(itemId, qIdx)
  const sel = askSelections.value[itemId][qIdx]
  if (multiSelect) {
    if (sel.has(optIdx)) sel.delete(optIdx)
    else sel.add(optIdx)
  } else {
    sel.clear()
    sel.add(optIdx)
  }
  // Deselect "Other" when picking a normal option
  askUsingOther.value[itemId][qIdx] = false
}

function toggleAskOther(itemId: string, qIdx: number, multiSelect: boolean) {
  ensureAskState(itemId, qIdx)
  if (!multiSelect) {
    askSelections.value[itemId][qIdx].clear()
  }
  askUsingOther.value[itemId][qIdx] = !askUsingOther.value[itemId][qIdx]
}

function isAskOptionSelected(itemId: string, qIdx: number, optIdx: number): boolean {
  return askSelections.value[itemId]?.[qIdx]?.has(optIdx) ?? false
}

function hasAskSelection(itemId: string, questions: AskQuestion[]): boolean {
  for (let qIdx = 0; qIdx < questions.length; qIdx++) {
    const sel = askSelections.value[itemId]?.[qIdx]
    const usingOther = askUsingOther.value[itemId]?.[qIdx]
    if (usingOther) {
      if ((askOtherTexts.value[itemId]?.[qIdx] ?? '').trim()) return true
    } else if (sel && sel.size > 0) {
      return true
    }
  }
  return false
}

async function submitAskAnswer(item: AgentTimelineItem) {
  const questions = getAskQuestions(item)
  const parts: string[] = []
  for (let qIdx = 0; qIdx < questions.length; qIdx++) {
    const q = questions[qIdx]
    const usingOther = askUsingOther.value[item.id]?.[qIdx]
    if (usingOther) {
      const text = (askOtherTexts.value[item.id]?.[qIdx] ?? '').trim()
      if (text) parts.push(text)
    } else {
      const sel = askSelections.value[item.id]?.[qIdx]
      if (sel) {
        const labels = Array.from(sel).map(i => q.options[i]?.label).filter(Boolean)
        if (labels.length) parts.push(labels.join(', '))
      }
    }
  }
  if (parts.length === 0) return
  await agent.send(parts.join('\n'))
}

interface PendingFile {
  path: string
  mediaType: string
  name: string
  previewUrl?: string
}

const pendingFiles = ref<PendingFile[]>([])
const pendingFilesExpanded = ref(false)
const isDragOver = ref(false)

const visiblePendingFiles = computed(() => {
  if (pendingFilesExpanded.value || pendingFiles.value.length <= 3) return pendingFiles.value
  return pendingFiles.value.slice(0, 3)
})

const hiddenPendingCount = computed(() => {
  if (pendingFilesExpanded.value || pendingFiles.value.length <= 3) return 0
  return pendingFiles.value.length - 3
})

watch(() => pendingFiles.value.length, (len) => {
  if (len <= 3) pendingFilesExpanded.value = false
})

function mimeFromExt(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, string> = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml',
  }
  return map[ext] || 'application/octet-stream'
}

function isImageMime(mime: string): boolean {
  return mime.startsWith('image/')
}

async function addFileFromBlob(blob: Blob, mimeType: string, fileName?: string) {
  const buf = await blob.arrayBuffer()
  const data = Array.from(new Uint8Array(buf))
  const path = await invoke<string>('save_clipboard_image', { data, mimeType })
  const previewUrl = URL.createObjectURL(blob)
  pendingFiles.value.push({
    path,
    mediaType: mimeType,
    name: fileName || path.split('/').pop() || 'image',
    previewUrl,
  })
}

function removePendingFile(index: number) {
  const file = pendingFiles.value[index]
  if (file.previewUrl) URL.revokeObjectURL(file.previewUrl)
  pendingFiles.value.splice(index, 1)
}

async function handlePaste(e: ClipboardEvent) {
  const items = e.clipboardData?.items
  if (!items) return
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      e.preventDefault()
      const blob = item.getAsFile()
      if (blob) await addFileFromBlob(blob, item.type)
    }
  }
}

function handleDragOver(e: DragEvent) {
  e.preventDefault()
  isDragOver.value = true
}

function handleDragLeave() {
  isDragOver.value = false
}

async function handleDrop(e: DragEvent) {
  e.preventDefault()
  isDragOver.value = false
  const files = e.dataTransfer?.files
  if (!files) return
  for (const file of files) {
    const mime = file.type || mimeFromExt(file.name)
    if (isImageMime(mime)) {
      await addFileFromBlob(file, mime, file.name)
    }
  }
}

async function handleFilePicker() {
  const selected = await open({
    multiple: true,
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] }],
  })
  if (!selected) return
  const paths = Array.isArray(selected) ? selected : [selected]
  for (const filePath of paths) {
    const name = filePath.split('/').pop() || filePath
    const mediaType = mimeFromExt(name)
    // Read file bytes via Rust and create a blob URL for preview
    let previewUrl: string | undefined
    try {
      const bytes = await invoke<number[]>('read_file_bytes', { path: filePath })
      const blob = new Blob([new Uint8Array(bytes)], { type: mediaType })
      previewUrl = URL.createObjectURL(blob)
    } catch {
      // Preview unavailable, still allow sending
    }
    pendingFiles.value.push({ path: filePath, mediaType, name, previewUrl })
  }
}

// Sync agent busy/waiting status to the global store for sidebar breathing dot
// and send system notifications on status transitions.
//
// Status semantics:
//   busy    = agent is working (blue dot, pulsing)
//   waiting = agent sent AskUserQuestion and awaits user reply (orange dot)
//   done    = agent turn finished / session exited (green dot)
let prevStatus: string | null = null

function hasPendingAsk(): boolean {
  const list = agent.items.value
  for (let i = list.length - 1; i >= 0; i--) {
    const it = list[i]
    if (it.kind === 'user') break  // stop at last user message
    if (it.kind === 'tool' && it.tool?.name === 'AskUserQuestion' && it.tool.result === null) {
      return true
    }
  }
  return false
}

watch(
  [agent.isBusy, agent.isRunning, agent.exitCode, () => agent.items.value.length],
  ([busy, running, exit]) => {
    if (!props.roomId) return

    let status: 'busy' | 'waiting' | 'done'
    if (exit !== null || !running) {
      status = 'done'
    } else if (busy) {
      status = 'busy'
    } else {
      // Not busy, still running — check if agent asked a question
      status = hasPendingAsk() ? 'waiting' : 'done'
    }

    // If user is currently viewing this branch, don't show done/waiting dots
    const isViewing = store.activeStudioBranchId === props.roomId
    if (isViewing && (status === 'done' || status === 'waiting')) {
      delete store.agentStatuses[props.roomId]
    } else {
      store.agentStatuses[props.roomId] = status
    }

    // Send system notifications on relevant transitions
    if (store.notificationsEnabled && prevStatus !== null && prevStatus !== status) {
      const branchName = store.studioBranches.find(b => b.id === props.roomId)?.name ?? ''
      if (status === 'waiting' && prevStatus === 'busy' && store.notifyOnAgentWaiting) {
        notify({ title: t('studio.agent.notifyWaitingTitle', 'Agent 等待输入'), body: branchName })
      } else if (status === 'done' && store.notifyOnAgentDone) {
        notify({ title: t('studio.agent.notifyDoneTitle', 'Agent 任务完成'), body: branchName })
      }
    }

    prevStatus = status
  },
  { immediate: true }
)

const headerStatusClass = computed(() => {
  if (!agent.isRunning.value) {
    return 'done'
  }
  if (agent.isBusy.value) {
    return 'busy'
  }
  return hasPendingAsk() ? 'waiting' : 'done'
})

const statusText = computed(() => {
  if (agent.exitCode.value !== null && !agent.canResume.value) return t('studio.agent.sessionExited')
  if (!agent.isRunning.value) return ''
  if (agent.isBusy.value) return t('studio.agent.thinking')
  return t('studio.agent.ready')
})

const costText = computed(() => {
  if (agent.totalCostUsd.value <= 0) return ''
  return `$${agent.totalCostUsd.value.toFixed(4)}`
})

// Consecutive tool calls are merged into a single scrollable list block
type TimelineBlock =
  | { type: 'item'; item: AgentTimelineItem }
  | { type: 'tools'; id: string; items: AgentTimelineItem[] }

const blocks = computed<TimelineBlock[]>(() => {
  const out: TimelineBlock[] = []
  for (const item of agent.items.value) {
    if (item.kind === 'tool' && item.tool) {
      // Filter out TodoWrite tool calls — they render as a dedicated card
      if (isTodoWrite(item)) continue
      // AskUserQuestion should render as a standalone card, not inside the scrollable tool group
      if (item.tool.name === 'AskUserQuestion') {
        out.push({ type: 'item', item })
      } else {
        const last = out[out.length - 1]
        if (last && last.type === 'tools') {
          last.items.push(item)
        } else {
          out.push({ type: 'tools', id: `tools_${item.id}`, items: [item] })
        }
      }
    } else {
      out.push({ type: 'item', item })
    }
  }
  return out
})

function toggleTool(itemId: string) {
  if (expandedTools.value.has(itemId)) {
    expandedTools.value.delete(itemId)
  } else {
    expandedTools.value.add(itemId)
  }
}

async function scrollToBottom() {
  await nextTick()
  const el = timelineRef.value
  if (el) el.scrollTop = el.scrollHeight
  showScrollToBottom.value = false
  // Keep the active tool list scrolled to the newest entry
  const lists = el?.querySelectorAll('.tool-group-list')
  if (lists && lists.length > 0) {
    const lastList = lists[lists.length - 1] as HTMLElement
    lastList.scrollTop = lastList.scrollHeight
  }
}

watch(() => agent.items.value.length, scrollToBottom)
watch(agent.isBusy, scrollToBottom)

// Slash command popup
const slashSelectedIndex = ref(0)
const slashDismissed = ref(false)
const slashPopupRef = ref<HTMLElement | null>(null)

const slashQuery = computed(() => {
  const m = inputText.value.match(/^\/([\w:-]*)$/)
  return m ? m[1] : null
})

const slashMatches = computed(() => {
  if (slashQuery.value === null) return []
  const q = slashQuery.value.toLowerCase()
  return agent.slashCommands.value.filter((c) => c.toLowerCase().includes(q))
})

const showSlashPopup = computed(
  () => !slashDismissed.value && slashQuery.value !== null && slashMatches.value.length > 0
)

watch(slashQuery, () => {
  slashDismissed.value = false
  slashSelectedIndex.value = 0
})

watch(slashSelectedIndex, async () => {
  await nextTick()
  slashPopupRef.value
    ?.querySelector('.slash-item.selected')
    ?.scrollIntoView({ block: 'nearest' })
})

function applySlashCommand(cmd: string) {
  inputText.value = `/${cmd} `
  slashDismissed.value = true
}

async function handleSend() {
  const text = inputText.value.trim()
  const attachments: AgentAttachment[] = pendingFiles.value.map((f) => ({
    path: f.path,
    mediaType: f.mediaType,
    name: f.name,
    previewUrl: f.previewUrl,
  }))
  console.log('[Agent] handleSend:', { text, isRunning: agent.isRunning.value, canResume: agent.canResume.value, readOnly: agent.readOnly.value })
  if ((!text && attachments.length === 0) || (!agent.isRunning.value && !agent.canResume.value)) return
  inputText.value = ''
  // Don't revoke preview URLs — they're kept for display in sent message bubbles
  pendingFiles.value = []
  await agent.send(text, attachments.length > 0 ? attachments : undefined)
}

// Guard against IME composition Enter: some input methods (e.g. Chinese on
// macOS) set isComposing=false on the compositionend event, and the subsequent
// Enter keydown that confirmed the candidate arrives with isComposing already
// false. We track composition state manually and use a cooldown to suppress
// the Enter keydown that immediately follows compositionend.
let composing = false
let justComposed = false
let composeCooldown: ReturnType<typeof setTimeout> | null = null

function handleCompositionStart() {
  composing = true
}

function handleCompositionEnd() {
  composing = false
  justComposed = true
  if (composeCooldown) clearTimeout(composeCooldown)
  composeCooldown = setTimeout(() => { justComposed = false }, 50)
}

function handleKeydown(e: KeyboardEvent) {
  if (showSlashPopup.value) {
    const count = slashMatches.value.length
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      slashSelectedIndex.value = (slashSelectedIndex.value + 1) % count
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      slashSelectedIndex.value = (slashSelectedIndex.value - 1 + count) % count
      return
    }
    if (e.key === 'Tab' || (e.key === 'Enter' && !e.isComposing && !composing && !justComposed)) {
      e.preventDefault()
      const cmd = slashMatches.value[slashSelectedIndex.value]
      if (cmd) applySlashCommand(cmd)
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      slashDismissed.value = true
      return
    }
  }
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !composing && !justComposed) {
    e.preventDefault()
    handleSend()
  }
}

async function handleInterrupt() {
  await agent.interrupt()
}

async function sendQuickReply(text: string) {
  inputText.value = ''
  await agent.send(text)
}

const suggestedReplies = computed(() => {
  if ((!agent.isRunning.value && !agent.canResume.value) || agent.isBusy.value || props.readOnly) return []
  if (agent.items.value.length === 0) return []
  // Hide when AskUserQuestion is pending (the ask-card handles interaction)
  if (hasPendingAsk()) return []

  // Use Claude Code's context-aware suggested responses if available
  if (agent.suggestedResponses.value.length > 0) {
    return agent.suggestedResponses.value.map((text, i) => ({
      key: `sr_${i}`,
      label: text,
    }))
  }

  // Fallback: minimal defaults
  return [
    { key: 'continue', label: t('studio.agent.suggestContinue', '继续') },
    { key: 'explain', label: t('studio.agent.suggestExplain', '解释一下') },
  ]
})

async function handleRestart() {
  await agent.restart(props.cwd)
}

async function handleRetry() {
  await agent.retry()
}

// Elapsed timer: ticks every second while agent is busy
const elapsedNow = ref(Date.now())
let elapsedTimer: ReturnType<typeof setInterval> | null = null

watch(agent.isBusy, (busy) => {
  if (busy) {
    elapsedNow.value = Date.now()
    elapsedTimer = setInterval(() => { elapsedNow.value = Date.now() }, 1000)
  } else {
    if (elapsedTimer) { clearInterval(elapsedTimer); elapsedTimer = null }
  }
}, { immediate: true })

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  if (totalSec < 60) return `${totalSec}s`
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}m ${s}s`
}

const thinkingMeta = computed(() => {
  const since = agent.busySince.value
  if (!since) return ''
  const parts: string[] = []
  const elapsed = elapsedNow.value - since
  if (elapsed >= 1000) parts.push(formatElapsed(elapsed))
  const tokens = agent.turnInputTokens.value + agent.turnOutputTokens.value
  if (tokens > 0) parts.push(`${tokens.toLocaleString()} tokens`)
  return parts.length > 0 ? `(${parts.join(' · ')})` : ''
})

onMounted(async () => {
  if (props.readOnly) {
    agent.readOnly.value = true
    if (props.roomId) {
      await agent.loadHistory(props.roomId)
    }
    return
  }

  // Set cwd for lazy start, load history only — agent process is spawned on first user message
  agent.setCwd(props.cwd)
  if (props.resumeSessionId) {
    agent.claudeSessionId.value = props.resumeSessionId
  }
  if (props.roomId) {
    await agent.loadHistory(props.roomId)
  }
})

onUnmounted(() => {
  if (elapsedTimer) { clearInterval(elapsedTimer); elapsedTimer = null }
  agent.stop()
})
</script>

<template>
  <div class="agent-panel" :class="{ 'light-theme': isLightTheme }">
    <!-- Header -->
    <div class="agent-header">
      <div class="agent-header-left">
        <span class="agent-status-dot" :class="headerStatusClass" />
        <span class="agent-title">Claude Code</span>
        <span v-if="agent.model.value" class="agent-model">{{ agent.model.value }}</span>
        <span class="agent-badge-skip">skip-permissions</span>
      </div>
      <div class="agent-header-right">
        <span v-if="costText" class="agent-cost">{{ costText }}</span>
        <span v-if="statusText" class="agent-status">{{ statusText }}</span>
        <button v-if="!props.readOnly" class="agent-restart-btn" :title="t('studio.agent.restart')" @click="handleRestart">
          <icon-font name="refresh" :size="12" />
        </button>
      </div>
    </div>

    <!-- Timeline -->
    <div class="agent-timeline-wrapper">
      <div ref="timelineRef" class="agent-timeline" @scroll="handleTimelineScroll">
      <div v-if="agent.items.value.length === 0" class="agent-empty">
        <p>{{ t('studio.agent.emptyHint') }}</p>
        <p class="agent-empty-cwd">{{ props.cwd }}</p>
      </div>

      <template v-for="block in blocks" :key="block.type === 'tools' ? block.id : block.item.id">
        <!-- Consecutive tool calls: single scrollable list (~5 rows visible) -->
        <div v-if="block.type === 'tools'" class="msg msg-tool">
          <div class="tool-group">
            <div class="tool-group-list">
              <template v-for="item in block.items" :key="item.id">
                <!-- AskUserQuestion: interactive card -->
                <div v-if="isAskUserQuestion(item)" class="ask-card">
                  <div v-for="(q, qIdx) in getAskQuestions(item)" :key="qIdx" class="ask-question">
                    <div v-if="q.header" class="ask-header">{{ q.header }}</div>
                    <div class="ask-question-text">{{ q.question }}</div>
                    <div class="ask-options">
                      <button
                        v-for="(opt, oIdx) in q.options"
                        :key="oIdx"
                        class="ask-option-btn"
                        :class="{ selected: isAskOptionSelected(item.id, qIdx, oIdx) }"
                        :disabled="!isAskPending(item)"
                        @click="toggleAskOption(item.id, qIdx, oIdx, !!q.multiSelect)"
                      >
                        <span class="ask-check">{{ q.multiSelect ? (isAskOptionSelected(item.id, qIdx, oIdx) ? '☑' : '☐') : (isAskOptionSelected(item.id, qIdx, oIdx) ? '◉' : '○') }}</span>
                        <span class="ask-option-content">
                          <span class="ask-option-label">{{ opt.label }}</span>
                          <span v-if="opt.description" class="ask-option-desc">{{ opt.description }}</span>
                        </span>
                      </button>
                      <!-- Other (free input) -->
                      <button
                        class="ask-option-btn"
                        :class="{ selected: askUsingOther[item.id]?.[qIdx] }"
                        :disabled="!isAskPending(item)"
                        @click="toggleAskOther(item.id, qIdx, !!q.multiSelect)"
                      >
                        <span class="ask-check">{{ q.multiSelect ? (askUsingOther[item.id]?.[qIdx] ? '☑' : '☐') : (askUsingOther[item.id]?.[qIdx] ? '◉' : '○') }}</span>
                        <span class="ask-option-label">Other</span>
                      </button>
                      <input
                        v-if="askUsingOther[item.id]?.[qIdx]"
                        v-model="askOtherTexts[item.id][qIdx]"
                        class="ask-other-input"
                        placeholder="Type your answer..."
                        :disabled="!isAskPending(item)"
                        @keydown.enter.prevent="submitAskAnswer(item)"
                      />
                    </div>
                  </div>
                  <button
                    v-if="isAskPending(item)"
                    class="ask-submit-btn"
                    :disabled="!hasAskSelection(item.id, getAskQuestions(item))"
                    @click="submitAskAnswer(item)"
                  >Submit</button>
                  <div v-else-if="item.tool?.result" class="ask-answered">
                    <icon-font name="check" :size="11" />
                    <span>{{ item.tool.result }}</span>
                  </div>
                </div>

                <!-- ExitPlanMode: render plan as markdown card -->
                <div v-else-if="isExitPlanMode(item)" class="plan-card">
                  <div class="plan-card-header">
                    <icon-font name="fold" :size="10" />
                    <span class="plan-card-title">Plan</span>
                    <span v-if="isPlanPending(item)" class="tool-spinner" />
                    <span v-else-if="item.tool?.isError" class="tool-badge tool-badge-error"><icon-font name="error" :size="11" /></span>
                    <span v-else class="tool-badge tool-badge-ok"><icon-font name="check" :size="11" /></span>
                  </div>
                  <!-- eslint-disable-next-line vue/no-v-html -- markdown-it with html:false escapes raw HTML -->
                  <div v-if="getPlanContent(item)" class="plan-card-body msg-assistant-md" v-html="renderMarkdown(getPlanContent(item))" />
                  <div v-if="item.tool?.result && !item.tool.isError" class="plan-card-footer">
                    {{ item.tool.result }}
                  </div>
                </div>

                <!-- Regular tool row -->
                <div v-else-if="item.tool" class="tool-row" :class="{ 'tool-error': item.tool.isError }" @click="toggleTool(item.id)">
                  <div class="tool-header">
                    <icon-font class="tool-chevron" :class="{ expanded: expandedTools.has(item.id) }" name="fold" :size="9" />
                    <span class="tool-name">{{ item.tool.name }}</span>
                    <span class="tool-summary">{{ item.text }}</span>
                    <span v-if="item.tool.result === null" class="tool-spinner" />
                    <span v-else-if="item.tool.isError" class="tool-badge tool-badge-error"><icon-font name="error" :size="11" /></span>
                    <span v-else class="tool-badge tool-badge-ok"><icon-font name="check" :size="11" /></span>
                  </div>
                  <pre v-if="expandedTools.has(item.id) && item.tool.result" class="tool-result">{{ item.tool.result }}</pre>
                </div>
              </template>
            </div>
          </div>
        </div>

        <!-- User message -->
        <div v-else-if="block.item.kind === 'user'" class="msg msg-user">
          <div v-if="block.item.attachments?.length" class="msg-user-attachments">
            <div v-for="(att, i) in block.item.attachments" :key="i" class="msg-attachment-thumb">
              <img v-if="att.previewUrl" :src="att.previewUrl" :alt="att.name" />
              <span class="msg-attachment-name">{{ att.name }}</span>
            </div>
          </div>
          <div v-if="block.item.text" class="msg-user-bubble">{{ block.item.text }}</div>
        </div>

        <!-- Assistant text (markdown) -->
        <div v-else-if="block.item.kind === 'assistant'" class="msg msg-assistant">
          <!-- eslint-disable-next-line vue/no-v-html -- markdown-it with html:false escapes raw HTML -->
          <div class="msg-assistant-md" v-html="renderMarkdown(block.item.text)" />
        </div>

        <!-- AskUserQuestion (standalone, outside tool-group scroll) -->
        <div v-else-if="block.item.kind === 'tool' && isAskUserQuestion(block.item)" class="msg msg-tool">
          <div class="ask-card">
            <div v-for="(q, qIdx) in getAskQuestions(block.item)" :key="qIdx" class="ask-question">
              <div v-if="q.header" class="ask-header">{{ q.header }}</div>
              <div class="ask-question-text">{{ q.question }}</div>
              <div class="ask-options">
                <button
                  v-for="(opt, oIdx) in q.options"
                  :key="oIdx"
                  class="ask-option-btn"
                  :class="{ selected: isAskOptionSelected(block.item.id, qIdx, oIdx) }"
                  :disabled="!isAskPending(block.item)"
                  @click="toggleAskOption(block.item.id, qIdx, oIdx, !!q.multiSelect)"
                >
                  <span class="ask-check">{{ q.multiSelect ? (isAskOptionSelected(block.item.id, qIdx, oIdx) ? '☑' : '☐') : (isAskOptionSelected(block.item.id, qIdx, oIdx) ? '◉' : '○') }}</span>
                  <span class="ask-option-content">
                    <span class="ask-option-label">{{ opt.label }}</span>
                    <span v-if="opt.description" class="ask-option-desc">{{ opt.description }}</span>
                  </span>
                </button>
                <!-- Other (free input) -->
                <button
                  class="ask-option-btn"
                  :class="{ selected: askUsingOther[block.item.id]?.[qIdx] }"
                  :disabled="!isAskPending(block.item)"
                  @click="toggleAskOther(block.item.id, qIdx, !!q.multiSelect)"
                >
                  <span class="ask-check">{{ q.multiSelect ? (askUsingOther[block.item.id]?.[qIdx] ? '☑' : '☐') : (askUsingOther[block.item.id]?.[qIdx] ? '◉' : '○') }}</span>
                  <span class="ask-option-label">Other</span>
                </button>
                <input
                  v-if="askUsingOther[block.item.id]?.[qIdx]"
                  v-model="askOtherTexts[block.item.id][qIdx]"
                  class="ask-other-input"
                  placeholder="Type your answer..."
                  :disabled="!isAskPending(block.item)"
                  @keydown.enter.prevent="submitAskAnswer(block.item)"
                />
              </div>
            </div>
            <button
              v-if="isAskPending(block.item)"
              class="ask-submit-btn"
              :disabled="!hasAskSelection(block.item.id, getAskQuestions(block.item))"
              @click="submitAskAnswer(block.item)"
            >Submit</button>
            <div v-else-if="block.item.tool?.result" class="ask-answered">
              <icon-font name="check" :size="11" />
              <span>{{ block.item.tool.result }}</span>
            </div>
          </div>
        </div>

        <!-- Error -->
        <div v-else-if="block.item.kind === 'error'" class="msg msg-error">
          {{ block.item.text }}
        </div>
      </template>

      <!-- TodoWrite task card -->
      <div v-if="agent.currentTodos.value.length > 0" class="todo-card" :class="{ 'todo-done': todoAllDone }">
        <div class="todo-header">
          <span class="todo-title">Tasks</span>
          <span class="todo-count">{{ todoCompletedCount }}/{{ todoTotalCount }}</span>
          <div class="todo-progress-bar">
            <div class="todo-progress-fill" :style="{ width: (todoCompletedCount / todoTotalCount * 100) + '%' }" />
          </div>
        </div>
        <div class="todo-list">
          <div
            v-for="(todo, idx) in agent.currentTodos.value"
            :key="idx"
            class="todo-item"
            :class="'todo-' + todo.status"
          >
            <span class="todo-icon">
              <template v-if="todo.status === 'completed'">&#10003;</template>
              <template v-else-if="todo.status === 'in_progress'"><span class="todo-spinner" /></template>
              <template v-else>&#9675;</template>
            </span>
            <span class="todo-text">
              <template v-if="todo.status === 'in_progress' && todo.activeForm">{{ todo.activeForm }}</template>
              <template v-else>{{ todo.content }}</template>
            </span>
          </div>
        </div>
      </div>

      <div v-if="agent.isBusy.value" class="agent-thinking">
        <span class="thinking-dot" /><span class="thinking-dot" /><span class="thinking-dot" />
        <span v-if="thinkingMeta" class="thinking-meta">{{ thinkingMeta }}</span>
      </div>

      <div v-if="!agent.isRunning.value && !agent.isBusy.value && agent.retryMessage.value" class="agent-retry">
        <button class="retry-btn" @click="handleRetry">
          <icon-font name="refresh" :size="11" />
          {{ t('studio.agent.retry', '重试') }}
        </button>
      </div>
    </div>

      <!-- Scroll to bottom button -->
      <transition name="fade">
        <button
          v-if="showScrollToBottom"
          class="scroll-to-bottom-btn"
          :title="t('studio.agent.scrollToBottom', '回到底部')"
          @click="scrollToBottom"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M8 12L3 7L4.4 5.6L8 9.2L11.6 5.6L13 7L8 12Z" fill="currentColor" />
            <path d="M3 13H13V14H3V13Z" fill="currentColor" />
          </svg>
        </button>
      </transition>
    </div>

    <!-- Input -->
    <div
      class="agent-input-area"
      :class="{ 'drag-over': isDragOver }"
      @dragover="handleDragOver"
      @dragleave="handleDragLeave"
      @drop="handleDrop"
    >
      <div v-if="showSlashPopup" ref="slashPopupRef" class="slash-popup">
        <div
          v-for="(cmd, i) in slashMatches"
          :key="cmd"
          class="slash-item"
          :class="{ selected: i === slashSelectedIndex }"
          @mousedown.prevent="applySlashCommand(cmd)"
          @mousemove="slashSelectedIndex = i"
        >
          /{{ cmd }}
        </div>
      </div>
      <!-- Pending file previews -->
      <div v-if="pendingFiles.length > 0" class="pending-files">
        <div v-for="(file, i) in pendingFiles" :key="file.path" class="pending-file">
          <img v-if="file.previewUrl" :src="file.previewUrl" class="pending-thumb" :alt="file.name" />
          <span v-else class="pending-file-icon">📎</span>
          <span class="pending-file-name">{{ file.name }}</span>
          <button class="pending-file-remove" @click="removePendingFile(i)">&times;</button>
        </div>
      </div>
      <!-- Suggested quick replies -->
      <div v-if="suggestedReplies.length > 0" class="suggested-replies">
        <button
          v-for="sr in suggestedReplies"
          :key="sr.key"
          class="suggested-reply-btn"
          @click="sendQuickReply(sr.label)"
        >{{ sr.label }}</button>
      </div>
      <div class="agent-input-row">
        <textarea
          v-model="inputText"
          class="agent-input"
          rows="2"
          :placeholder="props.readOnly ? t('studio.agent.archived', '聊天已归档（只读）') : (agent.isRunning.value ? t('studio.agent.inputPlaceholder') : (agent.canResume.value ? t('studio.agent.inputPlaceholder') : t('studio.agent.sessionExited')))"
          :disabled="props.readOnly || (!agent.isRunning.value && !agent.canResume.value)"
          @keydown="handleKeydown"
          @compositionstart="handleCompositionStart"
          @compositionend="handleCompositionEnd"
          @paste="handlePaste"
        />
        <button v-if="!props.readOnly && agent.isBusy.value" class="agent-interrupt-btn" :title="t('studio.agent.interrupt', '中断')" @click="handleInterrupt">
          <icon-font name="stop" :size="14" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.agent-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: #1e1e1e;
  color: #d4d4d4;
}

.agent-panel.light-theme {
  background: #fafafa;
  color: #333;
}

/* Header */
.agent-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  border-bottom: 1px solid #333;
  flex-shrink: 0;
  font-size: 12px;
}

.light-theme .agent-header {
  border-bottom-color: #ddd;
}

.agent-header-left,
.agent-header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.agent-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #666;
  flex-shrink: 0;
}

.agent-status-dot.busy {
  background: #2196f3;
  animation: agent-pulse 1.2s ease-in-out infinite;
}

.agent-status-dot.waiting {
  background: #ff9800;
  animation: agent-breathe 2s ease-in-out infinite;
}

.agent-status-dot.done {
  background: #4caf50;
}

@keyframes agent-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
}

@keyframes agent-breathe {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(1.1); }
}

.agent-title {
  font-weight: 500;
}

.agent-model {
  color: #888;
  font-size: 11px;
}

.agent-badge-skip {
  font-size: 10px;
  font-family: 'SF Mono', 'Monaco', 'Menlo', monospace;
  color: #e8ab6a;
  background: rgba(232, 171, 106, 0.12);
  border: 1px solid rgba(232, 171, 106, 0.25);
  border-radius: 3px;
  padding: 1px 6px;
  line-height: 1.3;
}

.light-theme .agent-badge-skip {
  color: #b5651d;
  background: rgba(181, 101, 29, 0.08);
  border-color: rgba(181, 101, 29, 0.2);
}

.agent-cost {
  color: #888;
  font-size: 11px;
  font-family: 'SF Mono', 'Monaco', 'Menlo', monospace;
}

.agent-status {
  color: #888;
  font-size: 11px;
}

.agent-restart-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  background: transparent;
  border: none;
  border-radius: 3px;
  color: #888;
  cursor: pointer;
  padding: 0;
}

.agent-restart-btn:hover {
  background: #37373d;
  color: #fff;
}

.light-theme .agent-restart-btn:hover {
  background: #e0e0e0;
  color: #000;
}

/* Timeline wrapper (holds timeline + scroll-to-bottom button) */
.agent-timeline-wrapper {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

/* Timeline */
.agent-timeline {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* Scroll to bottom button */
.scroll-to-bottom-btn {
  position: absolute;
  bottom: 12px;
  right: 16px;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: rgba(37, 37, 38, 0.95);
  border: 1px solid #454545;
  border-radius: 50%;
  color: #d4d4d4;
  cursor: pointer;
  backdrop-filter: blur(8px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  transition: all 0.2s ease;
}

.scroll-to-bottom-btn:hover {
  background: rgba(50, 50, 50, 0.98);
  border-color: #007acc;
  color: #fff;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
}

.scroll-to-bottom-btn:active {
  transform: scale(0.95);
}

.light-theme .scroll-to-bottom-btn {
  background: rgba(255, 255, 255, 0.95);
  border-color: #ccc;
  color: #555;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
}

.light-theme .scroll-to-bottom-btn:hover {
  background: rgba(255, 255, 255, 0.98);
  border-color: #007acc;
  color: #333;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.18);
}

.fade-enter-active, .fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from, .fade-leave-to {
  opacity: 0;
}

.agent-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  color: #666;
  font-size: 13px;
  gap: 4px;
}

.agent-empty-cwd {
  font-size: 11px;
  font-family: 'SF Mono', 'Monaco', 'Menlo', monospace;
  color: #555;
  margin: 0;
}

.agent-empty p {
  margin: 0;
}

.msg {
  display: flex;
  flex-direction: column;
}

.msg-user {
  align-items: flex-end;
}

.msg-user-bubble {
  max-width: 80%;
  background: #0e639c;
  color: #fff;
  border-radius: 10px 10px 2px 10px;
  padding: 8px 12px;
  font-size: 13px;
  white-space: pre-wrap;
  word-break: break-word;
}

.light-theme .msg-user-bubble {
  background: #007acc;
}

/* Assistant markdown */
.msg-assistant-md {
  font-size: 13px;
  line-height: 1.55;
  word-break: break-word;
}

.msg-assistant-md :deep(p) {
  margin: 0 0 8px;
}

.msg-assistant-md :deep(p:last-child) {
  margin-bottom: 0;
}

.msg-assistant-md :deep(h1),
.msg-assistant-md :deep(h2),
.msg-assistant-md :deep(h3),
.msg-assistant-md :deep(h4) {
  margin: 12px 0 6px;
  font-weight: 500;
  line-height: 1.3;
}

.msg-assistant-md :deep(h1) { font-size: 16px; }
.msg-assistant-md :deep(h2) { font-size: 15px; }
.msg-assistant-md :deep(h3) { font-size: 14px; }
.msg-assistant-md :deep(h4) { font-size: 13px; }

.msg-assistant-md :deep(ul),
.msg-assistant-md :deep(ol) {
  margin: 4px 0 8px;
  padding-left: 20px;
}

.msg-assistant-md :deep(li) {
  margin: 2px 0;
}

.msg-assistant-md :deep(code) {
  background: rgba(255, 255, 255, 0.08);
  border-radius: 3px;
  padding: 1px 5px;
  font-size: 12px;
  font-family: 'SF Mono', 'Monaco', 'Menlo', monospace;
}

.light-theme .msg-assistant-md :deep(code) {
  background: rgba(0, 0, 0, 0.06);
}

.msg-assistant-md :deep(pre) {
  background: #252526;
  border: 1px solid #333;
  border-radius: 6px;
  padding: 8px 10px;
  margin: 6px 0 10px;
  overflow-x: auto;
}

.light-theme .msg-assistant-md :deep(pre) {
  background: #f0f0f0;
  border-color: #ddd;
}

.msg-assistant-md :deep(pre code) {
  background: none;
  padding: 0;
  font-size: 12px;
}

.msg-assistant-md :deep(table) {
  border-collapse: collapse;
  margin: 6px 0 10px;
  font-size: 12px;
  display: block;
  overflow-x: auto;
  max-width: 100%;
}

.msg-assistant-md :deep(th),
.msg-assistant-md :deep(td) {
  border: 1px solid #444;
  padding: 4px 8px;
  text-align: left;
}

.light-theme .msg-assistant-md :deep(th),
.light-theme .msg-assistant-md :deep(td) {
  border-color: #ccc;
}

.msg-assistant-md :deep(th) {
  background: rgba(255, 255, 255, 0.05);
  font-weight: 500;
}

.light-theme .msg-assistant-md :deep(th) {
  background: rgba(0, 0, 0, 0.04);
}

.msg-assistant-md :deep(blockquote) {
  margin: 6px 0;
  padding: 2px 10px;
  border-left: 3px solid #555;
  color: #999;
}

.light-theme .msg-assistant-md :deep(blockquote) {
  border-left-color: #bbb;
  color: #666;
}

.msg-assistant-md :deep(a) {
  color: #4fc1ff;
}

.light-theme .msg-assistant-md :deep(a) {
  color: #0066b8;
}

.msg-assistant-md :deep(hr) {
  border: none;
  border-top: 1px solid #333;
  margin: 10px 0;
}

.light-theme .msg-assistant-md :deep(hr) {
  border-top-color: #ddd;
}

/* Tool group (consecutive tool calls in one scrollable list) */
.tool-group {
  background: #252526;
  border: 1px solid #333;
  border-radius: 6px;
  overflow: hidden;
}

.light-theme .tool-group {
  background: #f0f0f0;
  border-color: #ddd;
}

.tool-group-list {
  /* ~5 rows visible; auto-scrolls to the newest entry */
  max-height: 148px;
  overflow-y: auto;
}

.tool-row {
  cursor: pointer;
  border-bottom: 1px solid #2d2d2d;
}

.tool-row:last-child {
  border-bottom: none;
}

.light-theme .tool-row {
  border-bottom-color: #e2e2e2;
}

.tool-row:hover {
  background: #2a2d2e;
}

.light-theme .tool-row:hover {
  background: #e8e8e8;
}

.tool-row.tool-error .tool-name {
  color: #f48771;
}

.tool-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  font-size: 12px;
}

.tool-chevron {
  color: #888;
  transition: transform 0.15s;
  flex-shrink: 0;
  /* fold icon points up; collapsed = right, expanded = down */
  transform: rotate(90deg);
}

.tool-chevron.expanded {
  transform: rotate(180deg);
}

.tool-name {
  font-weight: 500;
  color: #4fc1ff;
  flex-shrink: 0;
}

.light-theme .tool-name {
  color: #0066b8;
}

.tool-summary {
  color: #888;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
  font-family: 'SF Mono', 'Monaco', 'Menlo', monospace;
  font-size: 11px;
}

.tool-badge {
  flex-shrink: 0;
  font-size: 11px;
}

.tool-badge-ok {
  color: #4caf50;
}

.tool-badge-error {
  color: #f48771;
}

.tool-spinner {
  flex-shrink: 0;
  width: 10px;
  height: 10px;
  border: 2px solid #444;
  border-top-color: #4fc1ff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.tool-result {
  margin: 0;
  padding: 8px 10px;
  border-top: 1px solid #333;
  font-size: 11px;
  font-family: 'SF Mono', 'Monaco', 'Menlo', monospace;
  color: #aaa;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 240px;
  overflow-y: auto;
}

.light-theme .tool-result {
  border-top-color: #ddd;
  color: #555;
}

.msg-error {
  background: rgba(232, 17, 35, 0.12);
  border: 1px solid rgba(232, 17, 35, 0.4);
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 12px;
  color: #f48771;
}

/* Thinking dots */
.agent-thinking {
  display: flex;
  gap: 4px;
  padding: 4px 2px;
}

.thinking-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #888;
  animation: thinking 1.2s ease-in-out infinite;
}

.thinking-dot:nth-child(2) { animation-delay: 0.2s; }
.thinking-dot:nth-child(3) { animation-delay: 0.4s; }

@keyframes thinking {
  0%, 100% { opacity: 0.25; transform: translateY(0); }
  50% { opacity: 1; transform: translateY(-2px); }
}

.thinking-meta {
  font-size: 11px;
  color: #666;
  font-family: 'SF Mono', 'Monaco', 'Menlo', monospace;
  margin-left: 4px;
}

.light-theme .thinking-meta {
  color: #999;
}

/* Input */
.agent-input-area {
  position: relative;
  display: flex;
  flex-direction: column;
  padding: 10px 12px;
  border-top: 1px solid #333;
  flex-shrink: 0;
}

/* Slash command popup */
.slash-popup {
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: calc(100% + 4px);
  max-height: 200px;
  overflow-y: auto;
  background: #252526;
  border: 1px solid #454545;
  border-radius: 6px;
  box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.35);
  z-index: 10;
  padding: 4px 0;
}

.light-theme .slash-popup {
  background: #fff;
  border-color: #ccc;
  box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.12);
}

.slash-item {
  padding: 5px 12px;
  font-size: 12px;
  font-family: 'SF Mono', 'Monaco', 'Menlo', monospace;
  color: #d4d4d4;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.light-theme .slash-item {
  color: #333;
}

.slash-item.selected {
  background: #094771;
  color: #fff;
}

.light-theme .slash-item.selected {
  background: #cce5ff;
  color: #000;
}

.light-theme .agent-input-area {
  border-top-color: #ddd;
}

.agent-input {
  flex: 1;
  resize: none;
  background: #252526;
  border: 1px solid #3c3c3c;
  border-radius: 6px;
  color: #d4d4d4;
  font-size: 13px;
  font-family: inherit;
  line-height: 1.4;
  padding: 8px 10px;
  outline: none;
}

.agent-input:focus {
  border-color: #007acc;
}

.agent-input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.light-theme .agent-input {
  background: #fff;
  border-color: #ccc;
  color: #333;
}

/* Input row with attach button */
.agent-input-row {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  flex: 1;
}

.agent-input-row .agent-input {
  flex: 1;
}

/* Drag over indicator */
.agent-input-area.drag-over {
  background: rgba(0, 122, 204, 0.08);
  border-color: #007acc;
}

/* Pending files preview strip */
.pending-files {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding-bottom: 8px;
  width: 100%;
}

.pending-file {
  display: flex;
  align-items: center;
  gap: 4px;
  background: #252526;
  border: 1px solid #3c3c3c;
  border-radius: 6px;
  padding: 4px 8px 4px 4px;
  font-size: 11px;
  max-width: 180px;
}

.light-theme .pending-file {
  background: #f0f0f0;
  border-color: #ddd;
}

.pending-thumb {
  width: 32px;
  height: 32px;
  object-fit: cover;
  border-radius: 4px;
  flex-shrink: 0;
}

.pending-file-icon {
  font-size: 16px;
  flex-shrink: 0;
}

.pending-file-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #bbb;
  flex: 1;
  min-width: 0;
}

.light-theme .pending-file-name {
  color: #555;
}

.pending-file-remove {
  background: none;
  border: none;
  color: #888;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  padding: 0 2px;
  flex-shrink: 0;
}

.pending-file-remove:hover {
  color: #f48771;
}

/* User message attachments */
.msg-user-attachments {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: flex-end;
  margin-bottom: 4px;
}

.msg-attachment-thumb {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  max-width: 80px;
}

.msg-attachment-thumb img {
  max-height: 60px;
  max-width: 80px;
  border-radius: 6px;
  object-fit: cover;
}

.msg-attachment-name {
  font-size: 10px;
  color: #aaa;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 80px;
  text-align: center;
}

.light-theme .msg-attachment-name {
  color: #777;
}

/* ExitPlanMode plan card */
.plan-card {
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.plan-card-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #c586c0;
}

.light-theme .plan-card-header {
  color: #8b3e8b;
}

.plan-card-title {
  font-weight: 600;
  flex: 1;
}

.plan-card-body {
  max-height: 400px;
  overflow-y: auto;
  padding: 8px 10px;
  background: #1e1e1e;
  border: 1px solid #333;
  border-radius: 4px;
}

.light-theme .plan-card-body {
  background: #fafafa;
  border-color: #ddd;
}

.plan-card-footer {
  font-size: 11px;
  color: #888;
  font-family: 'SF Mono', 'Monaco', 'Menlo', monospace;
}

/* AskUserQuestion card */
.ask-card {
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: #252526;
  border: 1px solid #333;
  border-radius: 6px;
}

.light-theme .ask-card {
  background: #f0f0f0;
  border-color: #ddd;
}

.ask-question {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ask-header {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #4fc1ff;
  background: rgba(79, 193, 255, 0.1);
  padding: 2px 8px;
  border-radius: 3px;
  align-self: flex-start;
}

.light-theme .ask-header {
  color: #0066b8;
  background: rgba(0, 102, 184, 0.08);
}

.ask-question-text {
  font-size: 13px;
  color: #d4d4d4;
  line-height: 1.4;
}

.light-theme .ask-question-text {
  color: #333;
}

.ask-options {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ask-option-btn {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  background: #2d2d30;
  border: 1px solid #3c3c3c;
  border-radius: 6px;
  padding: 8px 10px;
  color: #d4d4d4;
  cursor: pointer;
  text-align: left;
  font-size: 12px;
  transition: all 0.15s;
}

.ask-option-btn:hover:not(:disabled) {
  border-color: #007acc;
  background: #37373d;
}

.ask-option-btn.selected {
  border-color: #007acc;
  background: rgba(0, 122, 204, 0.15);
}

.ask-option-btn:disabled {
  opacity: 0.6;
  cursor: default;
}

.light-theme .ask-option-btn {
  background: #f5f5f5;
  border-color: #ddd;
  color: #333;
}

.light-theme .ask-option-btn:hover:not(:disabled) {
  background: #e8e8e8;
  border-color: #007acc;
}

.light-theme .ask-option-btn.selected {
  background: rgba(0, 122, 204, 0.08);
  border-color: #007acc;
}

.ask-check {
  flex-shrink: 0;
  font-size: 13px;
  line-height: 1;
  color: #888;
}

.ask-option-btn.selected .ask-check {
  color: #007acc;
}

.ask-option-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.ask-option-label {
  font-weight: 500;
}

.ask-option-desc {
  font-size: 11px;
  color: #888;
  line-height: 1.3;
}

.light-theme .ask-option-desc {
  color: #666;
}

.ask-other-input {
  background: #252526;
  border: 1px solid #3c3c3c;
  border-radius: 4px;
  color: #d4d4d4;
  font-size: 12px;
  padding: 6px 8px;
  outline: none;
  margin-top: 2px;
}

.ask-other-input:focus {
  border-color: #007acc;
}

.light-theme .ask-other-input {
  background: #fff;
  border-color: #ccc;
  color: #333;
}

.ask-submit-btn {
  align-self: flex-end;
  background: #007acc;
  border: none;
  border-radius: 4px;
  color: #fff;
  font-size: 12px;
  font-weight: 500;
  padding: 6px 16px;
  cursor: pointer;
  transition: opacity 0.15s;
}

.ask-submit-btn:hover {
  opacity: 0.9;
}

.ask-submit-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.ask-answered {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: #4caf50;
  padding: 4px 0;
}

/* Interrupt button (inside input row) */
.agent-interrupt-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: rgba(244, 135, 113, 0.12);
  border: 2px solid rgba(244, 135, 113, 0.5);
  border-radius: 6px;
  color: #f48771;
  cursor: pointer;
  padding: 0;
  flex-shrink: 0;
  transition: all 0.15s;
}

.agent-interrupt-btn:hover {
  background: rgba(244, 135, 113, 0.25);
  border-color: rgba(244, 135, 113, 0.7);
  color: #ff6b56;
}

.light-theme .agent-interrupt-btn {
  background: rgba(220, 50, 30, 0.06);
  border-color: rgba(220, 50, 30, 0.35);
  color: #d32f2f;
}

.light-theme .agent-interrupt-btn:hover {
  background: rgba(220, 50, 30, 0.12);
  border-color: rgba(220, 50, 30, 0.5);
}

/* Suggested quick replies */
.suggested-replies {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding-bottom: 8px;
}

.suggested-reply-btn {
  background: #2d2d30;
  border: 1px solid #3c3c3c;
  border-radius: 12px;
  color: #d4d4d4;
  font-size: 12px;
  padding: 4px 12px;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}

.suggested-reply-btn:hover {
  border-color: #007acc;
  background: #37373d;
  color: #fff;
}

.light-theme .suggested-reply-btn {
  background: #f0f0f0;
  border-color: #ddd;
  color: #333;
}

.light-theme .suggested-reply-btn:hover {
  background: #e0e0e0;
  border-color: #007acc;
  color: #000;
}

/* TodoWrite task card */
.todo-card {
  background: #252526;
  border: 1px solid #333;
  border-radius: 6px;
  overflow: hidden;
  transition: border-color 0.3s, opacity 0.3s;
}

.todo-card.todo-done {
  border-color: #4caf50;
  opacity: 0.7;
}

.light-theme .todo-card {
  background: #f0f0f0;
  border-color: #ddd;
}

.light-theme .todo-card.todo-done {
  border-color: #4caf50;
}

.todo-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-bottom: 1px solid #2d2d2d;
}

.light-theme .todo-header {
  border-bottom-color: #e2e2e2;
}

.todo-title {
  font-size: 12px;
  font-weight: 500;
  color: #d4d4d4;
}

.light-theme .todo-title {
  color: #333;
}

.todo-count {
  font-size: 11px;
  color: #888;
  font-family: 'SF Mono', 'Monaco', 'Menlo', monospace;
}

.todo-progress-bar {
  flex: 1;
  height: 4px;
  background: #3c3c3c;
  border-radius: 2px;
  overflow: hidden;
}

.light-theme .todo-progress-bar {
  background: #ddd;
}

.todo-progress-fill {
  height: 100%;
  background: #4caf50;
  border-radius: 2px;
  transition: width 0.3s ease;
}

.todo-list {
  padding: 4px 0;
}

.todo-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 10px;
  font-size: 12px;
}

.todo-icon {
  flex-shrink: 0;
  width: 14px;
  text-align: center;
  font-size: 11px;
}

.todo-completed .todo-icon {
  color: #4caf50;
}

.todo-pending .todo-icon {
  color: #666;
}

.todo-in_progress .todo-icon {
  color: #4fc1ff;
}

.todo-text {
  color: #d4d4d4;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.light-theme .todo-text {
  color: #333;
}

.todo-completed .todo-text {
  color: #888;
  text-decoration: line-through;
}

.light-theme .todo-completed .todo-text {
  color: #999;
}

.todo-in_progress .todo-text {
  color: #4fc1ff;
}

.light-theme .todo-in_progress .todo-text {
  color: #0066b8;
}

.todo-spinner {
  display: inline-block;
  width: 10px;
  height: 10px;
  border: 2px solid #444;
  border-top-color: #4fc1ff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.light-theme .todo-spinner {
  border-color: #ccc;
  border-top-color: #0066b8;
}

/* Retry button */
.agent-retry {
  display: flex;
  justify-content: center;
  padding: 8px 0;
}

.retry-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(232, 171, 106, 0.12);
  border: 1px solid rgba(232, 171, 106, 0.3);
  border-radius: 16px;
  color: #e8ab6a;
  font-size: 12px;
  padding: 6px 16px;
  cursor: pointer;
  transition: all 0.15s;
}

.retry-btn:hover {
  background: rgba(232, 171, 106, 0.22);
  border-color: rgba(232, 171, 106, 0.5);
}

.light-theme .retry-btn {
  background: rgba(181, 101, 29, 0.08);
  border-color: rgba(181, 101, 29, 0.25);
  color: #b5651d;
}

.light-theme .retry-btn:hover {
  background: rgba(181, 101, 29, 0.15);
  border-color: rgba(181, 101, 29, 0.4);
}

</style>
