<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch, nextTick } from 'vue'
import { Terminal } from 'xterm'
import 'xterm/css/xterm.css'
import { invoke } from '@tauri-apps/api/core'
import { usePtySession } from '@/composables/use-pty-session'
import { useTerminalStore } from '@/stores/terminal-store'
import { useCommandMonitor } from '@/composables/use-command-monitor'
import { useClaudeStatus } from '@/composables/use-claude-status'
import { xtermManager, type ManagedTerminal } from '@/composables/xterm-manager'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  sessionId: string
  paneId?: string
}>()

const terminalRef = ref<HTMLElement | null>(null)
const searchInputRef = ref<HTMLInputElement | null>(null)
const showScrollToBottom = ref(false)
const showSearchBar = ref(false)
const searchQuery = ref('')
const searchResultInfo = ref('')
let managed: ManagedTerminal | null = null
let terminal: Terminal | null = null
let resizeTimeout: number | null = null
let resizeAnimationFrame: number | null = null
let isUnmounting = false
let lastKnownDimensions: { cols: number; rows: number } | null = null

const store = useTerminalStore()
const { connect, write, resize, disconnect, isConnected } = usePtySession(props.sessionId)
const { monitorInput, processOutput, stopMonitoring, isClaudeCommand } = useCommandMonitor()
const claudeStatus = useClaudeStatus()
const { t } = useI18n()

// Search functions
const toggleSearchBar = async () => {
  showSearchBar.value = !showSearchBar.value
  if (showSearchBar.value) {
    await nextTick()
    searchInputRef.value?.focus()
    searchInputRef.value?.select()
  } else {
    searchQuery.value = ''
    searchResultInfo.value = ''
    managed?.searchAddon.clearDecorations()
    terminal?.focus()
  }
}

const doSearch = (direction: 'next' | 'prev' = 'next') => {
  const searchAddon = managed?.searchAddon
  if (!searchAddon || !searchQuery.value) {
    searchResultInfo.value = ''
    searchAddon?.clearDecorations()
    return
  }
  let found: boolean
  if (direction === 'next') {
    found = searchAddon.findNext(searchQuery.value, { decorations: {
      matchOverviewRuler: '#888888',
      activeMatchColorOverviewRuler: '#007acc',
      matchBackground: '#515c6a',
      activeMatchBackground: '#007acc',
    }})
  } else {
    found = searchAddon.findPrevious(searchQuery.value, { decorations: {
      matchOverviewRuler: '#888888',
      activeMatchColorOverviewRuler: '#007acc',
      matchBackground: '#515c6a',
      activeMatchBackground: '#007acc',
    }})
  }
  searchResultInfo.value = found ? '' : t('search.noResults')
}

const handleSearchKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Enter') {
    e.preventDefault()
    doSearch(e.shiftKey ? 'prev' : 'next')
  } else if (e.key === 'Escape') {
    toggleSearchBar()
  }
}

const closeSearch = () => {
  showSearchBar.value = false
  searchQuery.value = ''
  searchResultInfo.value = ''
  managed?.searchAddon.clearDecorations()
  terminal?.focus()
}

// Buffer to accumulate input for command detection
let inputBuffer = ''
// Track if we've received any data
let hasReceivedData = false
// Function to parse OSC 7 (current directory) from terminal output
const parseOSC7 = (data: Uint8Array): string | null => {
  const text = new TextDecoder().decode(data)
  // OSC 7 format: \x1b]7;file://hostname/path\x07
  const osc7Regex = /\x1b\]7;file:\/\/[^/]*(.+?)(\x07|\x1b\\)/
  const match = text.match(osc7Regex)
  if (match && match[1]) {
    try {
      return decodeURIComponent(match[1])
    } catch (e) {
      return null
    }
  }
  return null
}

// Debounced resize function
const debouncedResize = (cols: number, rows: number) => {
  if (isUnmounting) return

  if (resizeTimeout) {
    clearTimeout(resizeTimeout)
  }
  resizeTimeout = setTimeout(() => {
    if (!isUnmounting) {
      resize(cols, rows)
    }
  }, 100) as unknown as number
}

// Fit terminal while preserving scroll position
const safeFit = () => {
  if (!terminal || !managed?.fitAddon) return

  const buffer = terminal.buffer.active
  const wasAtBottom = buffer.viewportY >= buffer.baseY
  const previousViewportY = buffer.viewportY

  managed.fitAddon.fit()

  if (wasAtBottom) {
    terminal.scrollToBottom()
  } else {
    const currentViewportY = terminal.buffer.active.viewportY
    if (currentViewportY !== previousViewportY) {
      terminal.scrollLines(previousViewportY - currentViewportY)
    }
  }
}

// Check if terminal is scrolled to bottom
const checkScrollPosition = () => {
  if (!terminal) return

  const buffer = terminal.buffer.active
  const viewport = buffer.viewportY
  const base = buffer.baseY

  // Show button if scrolled up more than 3 lines from bottom
  showScrollToBottom.value = (base - viewport) > 3
}

// Scroll terminal to bottom
const scrollToBottom = () => {
  if (terminal) {
    terminal.scrollToBottom()
    showScrollToBottom.value = false
  }
}

// Handle image paste from clipboard
const handlePaste = async (event: ClipboardEvent) => {
  const items = event.clipboardData?.items
  if (!items) return

  let imageItem: DataTransferItem | null = null
  for (let i = 0; i < items.length; i++) {
    if (items[i].type.startsWith('image/')) {
      imageItem = items[i]
      break
    }
  }

  if (!imageItem) return // No image — let xterm handle text paste

  event.preventDefault()
  event.stopPropagation()

  const mimeType = imageItem.type
  const blob = imageItem.getAsFile()
  if (!blob) return

  try {
    const buffer = await blob.arrayBuffer()
    const data = Array.from(new Uint8Array(buffer))
    const path: string = await invoke('save_clipboard_image', { data, mimeType })
    const escapedPath = "'" + path.replace(/'/g, "'\\''") + "'"
    write(escapedPath)
  } catch (err) {
    console.error('[Terminal] Failed to paste image:', err)
  }
}

onMounted(async () => {
  console.log(`[Terminal] Mounting terminal for session: ${props.sessionId}`)
  if (!terminalRef.value || !props.paneId) return

  const paneId = props.paneId

  // Create terminal via manager (handles Terminal + all addons + outputBuffer)
  managed = xtermManager.create(paneId, terminalRef.value, {
    theme: store.currentTheme,
    fontSize: store.fontSize,
    scrollback: 3000,
  })
  terminal = managed.terminal
  const { fitAddon, outputBuffer } = managed

  // Watch for theme changes
  watch(() => store.currentThemeName, () => {
    if (terminal) {
      terminal.options.theme = store.currentTheme
    }
  })

  // Watch for font size changes
  watch(() => store.fontSize, (newSize) => {
    if (terminal && fitAddon && !isUnmounting) {
      terminal.options.fontSize = newSize
      try {
        safeFit()
      } catch (error) {
        console.warn('[Terminal] Font size fit failed:', error)
      }
    }
  })

  // Restore saved terminal content (after app update)
  const savedContent = store.getSavedPaneContent(paneId)
  if (savedContent) {
    terminal.write(savedContent)
  }

  // Intercept Cmd/Ctrl+F for search — register as disposable
  terminal.attachCustomKeyEventHandler((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'f' && e.type === 'keydown') {
      e.preventDefault()
      toggleSearchBar()
      return false
    }
    return true
  })

  // Register image paste handler on the terminal element (capture phase)
  const terminalElement = terminal.element
  if (terminalElement) {
    terminalElement.addEventListener('paste', handlePaste as EventListener, { capture: true })
    xtermManager.addCleanup(paneId, () => {
      terminalElement.removeEventListener('paste', handlePaste as EventListener, { capture: true })
    })
  }

  // Register xterm event listeners as disposables for proper cleanup
  xtermManager.addDisposable(paneId, terminal.onScroll(() => {
    checkScrollPosition()
  }))

  xtermManager.addDisposable(paneId, terminal.onWriteParsed(() => {
    checkScrollPosition()
  }))

  // Wait for terminal renderer to be fully initialized before fitting
  await new Promise(resolve => setTimeout(resolve, 0))

  if (fitAddon && terminal && !isUnmounting) {
    try {
      fitAddon.fit()
    } catch (error) {
      console.warn('[Terminal] Initial fit failed, will retry on resize:', error)
    }
  }

  // Handle user input — register as disposable
  xtermManager.addDisposable(paneId, terminal.onData((data) => {
    write(data)

    if (data === '\r' || data === '\n') {
      if (inputBuffer.trim()) {
        monitorInput(props.sessionId, inputBuffer.trim())
        if (isClaudeCommand(inputBuffer.trim())) {
          claudeStatus.startSession(props.sessionId)
        }
      }
      inputBuffer = ''
    } else if (data === '\x7f' || data === '\b') {
      inputBuffer = inputBuffer.slice(0, -1)
    } else if (data === '\x03') {
      inputBuffer = ''
    } else if (data.length === 1 && data.charCodeAt(0) >= 32) {
      inputBuffer += data
    }
  }))

  // Connect to PTY session
  await connect((data) => {
    hasReceivedData = true

    if (props.paneId) {
      const newDir = parseOSC7(data)
      if (newDir) {
        store.updatePaneCwd(props.paneId, newDir)
      }
    }

    outputBuffer.write(data)

    const outputText = new TextDecoder().decode(data)
    processOutput(props.sessionId, outputText)
    claudeStatus.processOutput(props.sessionId, outputText)
  })

  // Register cleanup callbacks with manager
  xtermManager.addCleanup(paneId, () => {
    // Disconnect PTY data listener (session close is handled by the store)
    disconnect()
  })
  xtermManager.addCleanup(paneId, () => {
    // Clear local timers
    if (resizeTimeout) clearTimeout(resizeTimeout)
    if (resizeAnimationFrame) cancelAnimationFrame(resizeAnimationFrame)
  })
  xtermManager.addCleanup(paneId, () => {
    stopMonitoring(props.sessionId)
    claudeStatus.endSession()
  })

  // Watch for tab switches - if no data received, trigger refresh
  watch(() => store.activeTabId, async (newTabId) => {
    const currentTab = store.tabs.find(t => t.id === newTabId)
    if (!currentTab) return

    const sessionBelongsToTab = (node: any): boolean => {
      if (node.type === 'pane' && node.sessionId === props.sessionId) {
        return true
      }
      if (node.children) {
        return node.children.some((child: any) => sessionBelongsToTab(child))
      }
      return false
    }

    if (sessionBelongsToTab(currentTab.layout)) {
      setTimeout(async () => {
        if (!hasReceivedData && isConnected.value && terminal) {
          console.log(`[Terminal] Tab activated but no data received for session ${props.sessionId}, triggering refresh`)
          safeFit()
          const dims = managed?.fitAddon?.proposeDimensions()
          if (dims) {
            await resize(dims.cols, dims.rows)
          }
          write('\n')
        }
      }, 200)
    }
  }, { immediate: false })

  // Handle resize with debouncing and dimension change detection
  const resizeObserver = new ResizeObserver(() => {
    if (resizeAnimationFrame) {
      cancelAnimationFrame(resizeAnimationFrame)
    }

    resizeAnimationFrame = requestAnimationFrame(() => {
      if (isUnmounting || !fitAddon || !terminal) return

      try {
        safeFit()

        const actualCols = terminal.cols
        const actualRows = terminal.rows

        // Only send resize to backend (triggers SIGWINCH) when dimensions actually changed.
        // This avoids unnecessary SIGWINCH that causes TUI apps to redraw and reset scroll.
        const dimsChanged =
          !lastKnownDimensions ||
          lastKnownDimensions.cols !== actualCols ||
          lastKnownDimensions.rows !== actualRows

        if (dimsChanged) {
          lastKnownDimensions = {
            cols: actualCols,
            rows: actualRows,
          }

          debouncedResize(actualCols, actualRows)
        }
      } catch (error) {
        console.warn('[Terminal] Resize failed (terminal may not be ready):', error)
      }
    }) as unknown as number
  })
  resizeObserver.observe(terminalRef.value)
  xtermManager.setResizeObserver(paneId, resizeObserver)
})

onUnmounted(() => {
  console.log(`[Terminal] Unmounting terminal for session: ${props.sessionId}`)
  isUnmounting = true

  // Recycle via manager — handles all resource cleanup in correct order:
  // cleanup callbacks (PTY disconnect, timers, monitors) -> outputBuffer ->
  // ResizeObserver -> xterm disposables -> addons -> terminal.dispose()
  if (props.paneId) {
    xtermManager.recycle(props.paneId)
  }

  managed = null
  terminal = null
})
</script>

<template>
  <div class="terminal-wrapper">
    <!-- Search Bar -->
    <transition name="search-slide">
      <div v-if="showSearchBar" class="search-bar">
        <input
          ref="searchInputRef"
          v-model="searchQuery"
          class="search-input"
          :placeholder="t('search.placeholder')"
          @keydown="handleSearchKeydown"
          @input="doSearch('next')"
        />
        <span v-if="searchResultInfo" class="search-info">{{ searchResultInfo }}</span>
        <button class="search-nav-btn" @click="doSearch('prev')" title="Previous (Shift+Enter)">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 3L2 7h8L6 3z" fill="currentColor"/></svg>
        </button>
        <button class="search-nav-btn" @click="doSearch('next')" title="Next (Enter)">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 9L2 5h8L6 9z" fill="currentColor"/></svg>
        </button>
        <button class="search-close-btn" @click="closeSearch">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="1.5"/></svg>
        </button>
      </div>
    </transition>

    <!-- Scroll to Bottom Button -->
    <transition name="fade">
      <button
        v-if="showScrollToBottom"
        class="scroll-to-bottom-btn"
        @click="scrollToBottom"
        title="滚动到底部 (Scroll to Bottom)"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M8 12L3 7L4.4 5.6L8 9.2L11.6 5.6L13 7L8 12Z"
            fill="currentColor"
          />
          <path
            d="M3 13H13V14H3V13Z"
            fill="currentColor"
          />
        </svg>
        <span class="btn-text">回到底部</span>
      </button>
    </transition>

    <div
      ref="terminalRef"
      class="terminal-container"
      :style="{ backgroundColor: store.currentTheme.background }"
    />
  </div>
</template>

<style scoped>
.terminal-wrapper {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.terminal-container {
  position: absolute;
  inset: 0;
  padding: 8px;
  box-sizing: border-box;
  overflow: hidden;
}

:deep(.xterm) {
  width: 100%;
  height: 100%;
}

:deep(.xterm-viewport) {
  overflow-y: auto !important;
}

:deep(.xterm-screen) {
  overflow: hidden;
}

.scroll-to-bottom-btn {
  position: absolute;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 100;

  display: flex;
  align-items: center;
  gap: 6px;

  padding: 8px 16px;
  background: rgba(30, 30, 30, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  color: #ffffff;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;

  backdrop-filter: blur(8px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);

  transition: all 0.2s ease;
}

.scroll-to-bottom-btn:hover {
  background: rgba(40, 40, 40, 0.98);
  border-color: rgba(255, 255, 255, 0.3);
  transform: translateX(-50%) translateY(-2px);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.4);
}

.scroll-to-bottom-btn:active {
  transform: translateX(-50%) translateY(0);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

.scroll-to-bottom-btn svg {
  flex-shrink: 0;
}

.btn-text {
  white-space: nowrap;
}

/* Fade transition */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}

.fade-enter-from {
  opacity: 0;
  transform: translateX(-50%) translateY(-10px);
}

.fade-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-10px);
}

.fade-enter-to,
.fade-leave-from {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}

/* Search Bar */
.search-bar {
  position: absolute;
  top: 0;
  right: 16px;
  z-index: 101;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  background: rgba(37, 37, 38, 0.97);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-top: none;
  border-radius: 0 0 6px 6px;
  backdrop-filter: blur(8px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.search-input {
  width: 180px;
  padding: 4px 8px;
  background: #3c3c3c;
  border: 1px solid #555;
  border-radius: 3px;
  color: #e7e7e7;
  font-size: 13px;
  font-family: inherit;
  outline: none;
  transition: border-color 0.15s;
}

.search-input:focus {
  border-color: #007acc;
}

.search-input::placeholder {
  color: #888;
}

.search-info {
  font-size: 11px;
  color: #e88;
  white-space: nowrap;
  padding: 0 4px;
}

.search-nav-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  background: transparent;
  border: none;
  border-radius: 3px;
  color: #ccc;
  cursor: pointer;
  transition: background 0.15s;
}

.search-nav-btn:hover {
  background: #555;
  color: #fff;
}

.search-close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  background: transparent;
  border: none;
  border-radius: 3px;
  color: #ccc;
  cursor: pointer;
  transition: background 0.15s;
  margin-left: 2px;
}

.search-close-btn:hover {
  background: #d32f2f;
  color: #fff;
}

/* Search slide transition */
.search-slide-enter-active,
.search-slide-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.search-slide-enter-from {
  opacity: 0;
  transform: translateY(-10px);
}

.search-slide-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}
</style>
