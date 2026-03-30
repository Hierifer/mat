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
  <div
    ref="terminalRef"
    class="terminal-container"
    :style="{ backgroundColor: store.currentTheme.background }"
  />
</template>

<style scoped>
.terminal-container {
  width: 100%;
  height: 100%;
  padding: 8px;
  padding-bottom: 32px; /* Ensure space at bottom */
  box-sizing: border-box;
  overflow: hidden;
}
</style>
