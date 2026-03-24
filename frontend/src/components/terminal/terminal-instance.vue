<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { Terminal } from 'xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import 'xterm/css/xterm.css'
import { usePtySession } from '@/composables/use-pty-session'
import { useTerminalStore } from '@/stores/terminal-store'

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

const store = useTerminalStore()
const { connect, write, resize } = usePtySession(props.sessionId)

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

  // Initialize xterm.js
  terminal = new Terminal({
    fontFamily: '"JetBrains Mono", "Courier New", monospace',
    fontSize: 13,
    cursorBlink: true,
    allowTransparency: true,
    theme: store.currentTheme,
  })

  // Watch for theme changes
  watch(() => store.currentThemeName, () => {
    if (terminal) {
      terminal.options.theme = store.currentTheme
    }
  })

  fitAddon = new FitAddon()
  const webLinksAddon = new WebLinksAddon()

  terminal.loadAddon(fitAddon)
  terminal.loadAddon(webLinksAddon)
  terminal.open(terminalRef.value)

  // Fit terminal to container
  fitAddon.fit()

  // Handle user input
  terminal.onData((data) => {
    write(data)
  })

  // Connect to PTY session
  await connect((data) => {
    // Parse OSC 7 sequences for directory tracking
    if (props.paneId) {
      const newDir = parseOSC7(data)
      if (newDir) {
        store.updatePaneCwd(props.paneId, newDir)
      }
    }

    // Write data to terminal
    terminal?.write(data)
  })

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
  resizeObserver?.disconnect()
  terminal?.dispose()
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
