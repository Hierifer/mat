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
let isUnmounting = false
let outputBuffer: ReturnType<typeof useOutputBuffer> | null = null

const store = useTerminalStore()
const { connect, write, resize, isConnected } = usePtySession(props.sessionId)
const { monitorInput, processOutput, stopMonitoring } = useCommandMonitor()

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
    scrollback: 10000, // 限制滚动缓冲区为 10000 行（默认 1000）
    fastScrollModifier: 'shift', // Shift+滚轮快速滚动
    fastScrollSensitivity: 5, // 快速滚动敏感度
    windowsMode: false, // 禁用 Windows 换行模式可以提升性能
  })

  // Watch for theme changes
  watch(() => store.currentThemeName, () => {
    if (terminal) {
      terminal.options.theme = store.currentTheme
    }
  })

  // Watch for font size changes
  watch(() => store.fontSize, (newSize) => {
    if (terminal) {
      terminal.options.fontSize = newSize
      fitAddon?.fit()
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
  })

  // 初始化输出缓冲器
  outputBuffer = useOutputBuffer(terminal, {
    batchInterval: 16, // ~60fps
    maxBufferSize: 1024 * 1024, // 1MB
    maxBatchSize: 64 * 1024, // 64KB per batch
    enabled: true, // 启用输出节流
  })

  // Fit terminal to container
  fitAddon.fit()

  // Handle user input
  terminal.onData((data) => {
    write(data)

    // Monitor input for command detection
    if (data === '\r' || data === '\n') {
      // Enter key pressed - check if it's a Claude command
      if (inputBuffer.trim()) {
        monitorInput(props.sessionId, inputBuffer.trim())
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

  // Handle resize with debouncing
  resizeObserver = new ResizeObserver(() => {
    fitAddon?.fit()
    const dims = fitAddon?.proposeDimensions()
    if (dims) {
      debouncedResize(dims.cols, dims.rows)
    }
  })
  resizeObserver.observe(terminalRef.value)
})

onUnmounted(() => {
  console.log(`[Terminal] Unmounting terminal for session: ${props.sessionId}`)
  isUnmounting = true

  if (resizeTimeout) {
    clearTimeout(resizeTimeout)
  }

  // 清理输出缓冲器
  outputBuffer?.dispose()
  outputBuffer = null

  resizeObserver?.disconnect()
  terminal?.dispose()

  // Stop monitoring this session
  stopMonitoring(props.sessionId)
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
}

.terminal-container {
  width: 100%;
  height: 100%;
  padding: 8px;
  padding-bottom: 32px; /* Ensure space at bottom */
  box-sizing: border-box;
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
