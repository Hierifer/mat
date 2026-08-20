<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTerminalStore } from '@/stores/terminal-store'
import MarkdownIt from 'markdown-it'
import { useAgentSession, type AgentAttachment, type AgentTimelineItem } from '@/composables/use-agent-session'
import IconFont from '@/components/ui/icon-font.vue'
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'

// html: false escapes raw HTML from the model output (XSS-safe)
const md = new MarkdownIt({ html: false, linkify: true, breaks: true })

function renderMarkdown(text: string): string {
  return md.render(text)
}

const props = defineProps<{
  cwd: string
}>()

const { t } = useI18n()
const store = useTerminalStore()
const agent = useAgentSession()

const isLightTheme = computed(() => store.currentThemeName.includes('Light'))

const inputText = ref('')
const timelineRef = ref<HTMLElement | null>(null)
const expandedTools = ref<Set<string>>(new Set())

interface PendingFile {
  path: string
  mediaType: string
  name: string
  previewUrl?: string
}

const pendingFiles = ref<PendingFile[]>([])
const isDragOver = ref(false)

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

const statusText = computed(() => {
  if (agent.exitCode.value !== null) return t('studio.agent.sessionExited')
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
      const last = out[out.length - 1]
      if (last && last.type === 'tools') {
        last.items.push(item)
      } else {
        out.push({ type: 'tools', id: `tools_${item.id}`, items: [item] })
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
  if ((!text && attachments.length === 0) || !agent.isRunning.value) return
  inputText.value = ''
  // Don't revoke preview URLs — they're kept for display in sent message bubbles
  pendingFiles.value = []
  await agent.send(text, attachments.length > 0 ? attachments : undefined)
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
    if (e.key === 'Tab' || (e.key === 'Enter' && !e.isComposing)) {
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
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault()
    handleSend()
  }
}

async function handleRestart() {
  await agent.restart(props.cwd)
}

onMounted(() => {
  agent.start(props.cwd).catch((error) => {
    console.error('[Agent] Failed to start:', error)
  })
})

onUnmounted(() => {
  agent.stop()
})
</script>

<template>
  <div class="agent-panel" :class="{ 'light-theme': isLightTheme }">
    <!-- Header -->
    <div class="agent-header">
      <div class="agent-header-left">
        <span class="agent-status-dot" :class="{ running: agent.isRunning.value, busy: agent.isBusy.value }" />
        <span class="agent-title">Claude Code</span>
        <span v-if="agent.model.value" class="agent-model">{{ agent.model.value }}</span>
      </div>
      <div class="agent-header-right">
        <span v-if="costText" class="agent-cost">{{ costText }}</span>
        <span v-if="statusText" class="agent-status">{{ statusText }}</span>
        <button class="agent-restart-btn" :title="t('studio.agent.restart')" @click="handleRestart">
          <icon-font name="refresh" :size="12" />
        </button>
      </div>
    </div>

    <!-- Timeline -->
    <div ref="timelineRef" class="agent-timeline">
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
                <div v-if="item.tool" class="tool-row" :class="{ 'tool-error': item.tool.isError }" @click="toggleTool(item.id)">
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

        <!-- Error -->
        <div v-else-if="block.item.kind === 'error'" class="msg msg-error">
          {{ block.item.text }}
        </div>
      </template>

      <div v-if="agent.isBusy.value" class="agent-thinking">
        <span class="thinking-dot" /><span class="thinking-dot" /><span class="thinking-dot" />
      </div>
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
      <div class="agent-input-row">
        <textarea
          v-model="inputText"
          class="agent-input"
          rows="2"
          :placeholder="agent.isRunning.value ? t('studio.agent.inputPlaceholder') : t('studio.agent.sessionExited')"
          :disabled="!agent.isRunning.value"
          @keydown="handleKeydown"
          @paste="handlePaste"
        />
        <button
          class="agent-attach-btn"
          :title="t('studio.agent.attach', 'Attach file')"
          :disabled="!agent.isRunning.value"
          @click="handleFilePicker"
        >
          <icon-font name="add" :size="14" />
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

.agent-status-dot.running {
  background: #4caf50;
}

.agent-status-dot.busy {
  background: #ff9800;
  animation: pulse 1.2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
}

.agent-title {
  font-weight: 500;
}

.agent-model {
  color: #888;
  font-size: 11px;
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

/* Input */
.agent-input-area {
  position: relative;
  display: flex;
  align-items: flex-end;
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

.agent-attach-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: transparent;
  border: 1px solid #3c3c3c;
  border-radius: 6px;
  color: #888;
  cursor: pointer;
  padding: 0;
  flex-shrink: 0;
}

.agent-attach-btn:hover {
  background: #37373d;
  color: #fff;
}

.agent-attach-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.light-theme .agent-attach-btn {
  border-color: #ccc;
}

.light-theme .agent-attach-btn:hover {
  background: #e0e0e0;
  color: #000;
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

</style>
