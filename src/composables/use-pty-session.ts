import { ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'

export function usePtySession(sessionId: string) {
  const isConnected = ref(false)
  const isClosed = ref(false)
  let unlisten: UnlistenFn | null = null
  let mockOnData: ((data: Uint8Array) => void) | null = null

  async function connect(onData: (data: Uint8Array) => void) {
    // @ts-ignore
    if (!window.__TAURI_INTERNALS__) {
      console.warn('Tauri environment not detected. Using mock connect.')
      mockOnData = onData
      isConnected.value = true

      // Send welcome message for mock session
      setTimeout(() => {
        const encoder = new TextEncoder()
        const welcome = '\r\n\x1b[1;32m➜\x1b[0m \x1b[1;36mTerminal Mock Session\x1b[0m\r\n\x1b[2m(Running in browser mode - no actual shell access)\x1b[0m\r\n\r\n$ '
        onData(encoder.encode(welcome))
      }, 100)
      return
    }

    try {
      console.log(`Connecting to PTY session: ${sessionId}`)
      unlisten = await listen<number[]>(`pty_data_${sessionId}`, (event) => {
        const data = new Uint8Array(event.payload)
        onData(data)
      })
      isConnected.value = true
      console.log(`Successfully connected to PTY session: ${sessionId}`)
    } catch (error) {
      console.error(`Failed to connect to PTY session ${sessionId}:`, error)
      isConnected.value = false
      throw error
    }
  }

  async function write(data: string) {
    if (isClosed.value) return

    // @ts-ignore
    if (!window.__TAURI_INTERNALS__) {
      const encoder = new TextEncoder()
      if (mockOnData) {
        // Simple echo for mock session
        // Handle enter key specifically
        if (data === '\r') {
           mockOnData(encoder.encode('\r\n$ '))
        } else if (data === '\x7f') { // Backspace
           mockOnData(encoder.encode('\x08 \x08'))
        } else {
           mockOnData(encoder.encode(data))
        }
      }
      return
    }

    if (!isConnected.value) {
      return
    }

    const encoder = new TextEncoder()
    try {
      await invoke('pty_write', {
        sessionId,
        data: Array.from(encoder.encode(data)),
      })
    } catch (error) {
      console.error(`Failed to write to PTY session ${sessionId}:`, error)
      // Don't throw - just log the error to avoid breaking the UI
    }
  }

  async function resize(cols: number, rows: number) {
    if (isClosed.value) return

    // @ts-ignore
    if (!window.__TAURI_INTERNALS__) return

    if (!isConnected.value) {
      return
    }

    try {
      await invoke('pty_resize', { sessionId, cols, rows })
    } catch (error) {
      // Silently ignore resize errors for closed/disconnected sessions
      if (!isClosed.value) {
        console.debug(`Resize skipped for session ${sessionId}:`, error)
      }
    }
  }

  async function close() {
    isClosed.value = true
    isConnected.value = false

    // @ts-ignore
    if (!window.__TAURI_INTERNALS__) return

    if (unlisten) {
      unlisten()
      unlisten = null
    }

    try {
      await invoke('pty_close', { sessionId })
    } catch (error) {
      console.error(`Failed to close PTY session ${sessionId}:`, error)
    }
  }

  // Note: We don't automatically close sessions on unmount
  // Sessions are only closed when explicitly requested (tab close, pane close)
  // This allows tab switching without losing sessions

  return { isConnected, connect, write, resize, close }
}
