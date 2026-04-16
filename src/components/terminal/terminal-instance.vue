<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { Terminal } from 'xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import 'xterm/css/xterm.css'
import { usePtySession } from '@/composables/use-pty-session'
import { useTerminalStore, type SplitNode } from '@/stores/terminal-store'
import { useCommandMonitor } from '@/composables/use-command-monitor'
import { useOutputBuffer } from '@/composables/use-output-buffer'
import { useClaudeStatus } from '@/composables/use-claude-status'

const props = defineProps<{
  sessionId: string
  paneId?: string
}>()

const terminalRef = ref<HTMLElement | null>(null)
const showScrollToBottom = ref(false)
let terminal: Terminal | null = null
let fitAddon: FitAddon | null = null
let resizeObserver: ResizeObserver | null = null
let resizeTimeout: number | null = null
let resizeAnimationFrame: number | null = null
let isUnmounting = false
let outputBuffer: ReturnType<typeof useOutputBuffer> | null = null
let lastKnownDimensions: { cols: number; rows: number } | null = null

const store = useTerminalStore()
const { connect, write, resize, isConnected } = usePtySession(props.sessionId)
const { monitorInput, processOutput, stopMonitoring, isClaudeCommand } = useCommandMonitor()
const claudeStatus = useClaudeStatus()

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

onMounted(async () => {
  console.log(`[Terminal] Mounting terminal for session: ${props.sessionId}`)
  if (!terminalRef.value) return

  // Initialize xterm.js with performance optimizations
  terminal = new Terminal({
    fontFamily: '"JetBrains Mono", "Courier New", monospace',
    fontSize: store.fontSize,
    cursorBlink: true,
    allowTransparency: true,
    theme: store.currentTheme,
    // 性能优化选项
    scrollback: 3000, // 减少到 3000 行，防止内存泄漏（之前 10000 太大）
    fastScrollModifier: 'shift', // Shift+滚轮快速滚动
    fastScrollSensitivity: 5, // 快速滚动敏感度
    windowsMode: false, // 禁用 Windows 换行模式可以提升性能
  })

  // Monitor buffer size and enforce scrollback limit
  let lastBufferCheck = Date.now()
  let lastBufferSize = 0
  const BUFFER_CHECK_INTERVAL = 1000 // Check every 1 second
  const MAX_BUFFER_ROWS = 5000 // Hard limit: 3000 scrollback + 2000 buffer = 5000 max

  const checkAndTrimBuffer = () => {
    if (!terminal) return

    const now = Date.now()
    if (now - lastBufferCheck < BUFFER_CHECK_INTERVAL) return

    lastBufferCheck = now
    const buffer = terminal.buffer.active
    const totalRows = buffer.baseY + buffer.cursorY

    // Also check viewport and selection coordinates
    const viewportY = buffer.viewportY
    const baseY = buffer.baseY

    // Log detailed buffer state
    if (totalRows > lastBufferSize + 1000) {
      console.log(`[Terminal] Buffer state:`, {
        totalRows,
        baseY,
        viewportY,
        cursorY: buffer.cursorY,
        growth: totalRows - lastBufferSize
      })
      lastBufferSize = totalRows
    }

    // CRITICAL: Force buffer reset if coordinates are broken
    if (totalRows > MAX_BUFFER_ROWS || baseY > MAX_BUFFER_ROWS) {
      console.error(`[Terminal] ⚠️ CRITICAL: Buffer corruption detected!`)
      console.error(`[Terminal] totalRows: ${totalRows}, baseY: ${baseY}`)
      console.error(`[Terminal] Xterm scrollback is NOT working - forcing buffer clear`)

      // Pause output
      if (outputBuffer) {
        outputBuffer.pause()
      }

      // Force clear the terminal buffer to reset coordinates
      // This will lose history but prevents crash
      try {
        // Method 1: Clear scrollback
        terminal.clear()

        // Method 2: Reset the terminal completely
        terminal.reset()

        console.log('[Terminal] Terminal reset complete, coordinates should be fixed')
        console.log('[Terminal] Buffer state after reset:', {
          totalRows: terminal.buffer.active.baseY + terminal.buffer.active.cursorY,
          baseY: terminal.buffer.active.baseY,
        })

        // Show warning to user
        const warningMsg = '\r\n\x1b[33m⚠️  Terminal buffer was reset due to excessive growth\x1b[0m\r\n'
        terminal.write(warningMsg)
      } catch (error) {
        console.error('[Terminal] Failed to reset:', error)
      }

      // Resume output after a delay
      setTimeout(() => {
        if (outputBuffer) {
          outputBuffer.resume()
          console.log('[Terminal] Output resumed')
        }
      }, 1000)

      // Reset tracking
      lastBufferSize = 0
    }
  }

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
        fitAddon.fit()
      } catch (error) {
        console.warn('[Terminal] Font size fit failed:', error)
      }
    }
  })

  fitAddon = new FitAddon()
  const webLinksAddon = new WebLinksAddon()

  terminal.loadAddon(fitAddon)
  terminal.loadAddon(webLinksAddon)
  terminal.open(terminalRef.value)

  // Listen for scroll events to show/hide scroll-to-bottom button
  terminal.onScroll(() => {
    checkScrollPosition()
  })

  // Also check on write events (when new data arrives)
  terminal.onWriteParsed(() => {
    checkScrollPosition()
    checkAndTrimBuffer() // Prevent infinite buffer growth
  })

  // 初始化输出缓冲器（减少批次大小防止 buffer 增长）
  outputBuffer = useOutputBuffer(terminal, {
    batchInterval: 32, // 降低到 ~30fps，给 xterm 更多时间处理
    maxBufferSize: 512 * 1024, // 减少到 512KB（之前 1MB 太大）
    maxBatchSize: 16 * 1024, // 减少到 16KB（之前 64KB 太大）
    enabled: true, // 启用输出节流
  })

  // Wait for terminal renderer to be fully initialized before fitting
  // This prevents "Cannot read properties of undefined" errors
  await new Promise(resolve => setTimeout(resolve, 0))

  // Fit terminal to container (only after renderer is ready)
  if (fitAddon && terminal && !isUnmounting) {
    try {
      fitAddon.fit()
    } catch (error) {
      console.warn('[Terminal] Initial fit failed, will retry on resize:', error)
    }
  }

  // Handle user input
  terminal.onData((data) => {
    write(data)

    // Monitor input for command detection
    if (data === '\r' || data === '\n') {
      // Enter key pressed - check if it's a Claude command
      if (inputBuffer.trim()) {
        monitorInput(props.sessionId, inputBuffer.trim())
        if (isClaudeCommand(inputBuffer.trim())) {
          claudeStatus.startSession(props.sessionId)
        }
      }
      inputBuffer = ''
    } else if (data === '\x7f' || data === '\b') {
      // Backspace - remove last character
      inputBuffer = inputBuffer.slice(0, -1)
    } else if (data === '\x03') {
      // Ctrl+C - clear buffer
      inputBuffer = ''
    } else if (data.length === 1 && data.charCodeAt(0) >= 32) {
      // Regular printable character
      inputBuffer += data
    }
  })

  // Connect to PTY session
  await connect((data) => {
    hasReceivedData = true

    // Parse OSC 7 sequences for directory tracking
    if (props.paneId) {
      const newDir = parseOSC7(data)
      if (newDir) {
        store.updatePaneCwd(props.paneId, newDir)
      }
    }

    // 使用输出缓冲器写入数据（优化性能）
    if (outputBuffer) {
      outputBuffer.write(data)
    } else {
      // 后备方案：直接写入
      terminal?.write(data)
    }

    // Monitor output for command completion
    const outputText = new TextDecoder().decode(data)
    processOutput(props.sessionId, outputText)
    claudeStatus.processOutput(props.sessionId, outputText)
  })

  // Watch for tab switches - if no data received, trigger refresh
  watch(() => store.activeTabId, async (newTabId) => {
    // Check if this terminal's tab just became active
    const currentTab = store.tabs.find(t => t.id === newTabId)
    if (!currentTab) return

    // Check if this session belongs to the active tab
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
      // This terminal's tab just became active
      // Wait a bit then check if we have data
      setTimeout(async () => {
        if (!hasReceivedData && isConnected.value && terminal) {
          console.log(`[Terminal] Tab activated but no data received for session ${props.sessionId}, triggering refresh`)
          // Try to trigger shell to redraw by resizing
          fitAddon?.fit()
          const dims = fitAddon?.proposeDimensions()
          if (dims) {
            await resize(dims.cols, dims.rows)
          }
          // Send a newline to potentially trigger a prompt redraw
          write('\n')
        }
      }, 200)
    }
  }, { immediate: false })

  // Handle resize with debouncing and dimension change detection
  resizeObserver = new ResizeObserver(() => {
    // Cancel any pending animation frame to avoid multiple rapid calls
    if (resizeAnimationFrame) {
      cancelAnimationFrame(resizeAnimationFrame)
    }

    // Use requestAnimationFrame to batch resize operations
    resizeAnimationFrame = requestAnimationFrame(() => {
      // Guard: check all prerequisites before attempting resize
      if (isUnmounting || !fitAddon || !terminal) return

      try {
        // Get proposed dimensions before fitting
        const proposedDims = fitAddon.proposeDimensions()
        if (!proposedDims) return

        // Check if dimensions actually changed
        const dimsChanged =
          !lastKnownDimensions ||
          lastKnownDimensions.cols !== proposedDims.cols ||
          lastKnownDimensions.rows !== proposedDims.rows

        if (dimsChanged) {
          // Update last known dimensions
          lastKnownDimensions = {
            cols: proposedDims.cols,
            rows: proposedDims.rows,
          }

          // Fit the terminal to new dimensions
          fitAddon.fit()

          // Debounce the PTY resize call
          debouncedResize(proposedDims.cols, proposedDims.rows)
        }
      } catch (error) {
        // Catch renderer initialization errors gracefully
        // This can happen during split pane creation before terminal is fully ready
        console.warn('[Terminal] Resize failed (terminal may not be ready):', error)
      }
    }) as unknown as number
  })
  resizeObserver.observe(terminalRef.value)
})

onUnmounted(() => {
  console.log(`[Terminal] Unmounting terminal for session: ${props.sessionId}`)
  isUnmounting = true

  // Clean up timers and animation frames
  if (resizeTimeout) {
    clearTimeout(resizeTimeout)
  }
  if (resizeAnimationFrame) {
    cancelAnimationFrame(resizeAnimationFrame)
  }

  // 清理输出缓冲器
  outputBuffer?.dispose()
  outputBuffer = null

  resizeObserver?.disconnect()
  terminal?.dispose()

  // Stop monitoring this session
  stopMonitoring(props.sessionId)
  claudeStatus.endSession()
})
</script>

<template>
  <div class="terminal-wrapper">
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
  padding-bottom: 32px;
  box-sizing: border-box;
  overflow: hidden;
}

:deep(.xterm) {
  width: 100%;
  height: 100%;
}

:deep(.xterm-viewport) {
  overflow-y: scroll !important;
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
</style>
