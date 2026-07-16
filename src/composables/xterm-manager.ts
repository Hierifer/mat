import { Terminal, type IDisposable } from 'xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { SearchAddon } from '@xterm/addon-search'
import { SerializeAddon } from '@xterm/addon-serialize'
import { useOutputBuffer } from '@/composables/use-output-buffer'

export interface TerminalCreateOptions {
  theme: Record<string, string>
  fontSize: number
  scrollback?: number
}

export interface ManagedTerminal {
  terminal: Terminal
  fitAddon: FitAddon
  searchAddon: SearchAddon
  serializeAddon: SerializeAddon
  outputBuffer: ReturnType<typeof useOutputBuffer>
}

interface TerminalEntry {
  managed: ManagedTerminal
  resizeObserver: ResizeObserver | null
  disposables: IDisposable[]
  cleanups: (() => void)[]
}

/**
 * Centralized xterm.js Terminal lifecycle manager.
 *
 * Responsibilities:
 * - Create Terminal instances with standard addons
 * - Track all resources associated with each terminal
 * - Provide thorough resource recycling via recycle()
 */
class XTermManager {
  private entries = new Map<string, TerminalEntry>()

  /**
   * Create and register a managed terminal with standard addons.
   * If the paneId already exists, the old one is recycled first.
   */
  create(
    paneId: string,
    container: HTMLElement,
    options: TerminalCreateOptions,
  ): ManagedTerminal {
    if (this.entries.has(paneId)) {
      console.warn(`[XTermManager] Terminal ${paneId} already exists, recycling first`)
      this.recycle(paneId)
    }

    const terminal = new Terminal({
      fontFamily: '"JetBrains Mono", "Courier New", monospace',
      fontSize: options.fontSize,
      fontWeightBold: 500,
      cursorBlink: true,
      allowTransparency: true,
      theme: options.theme,
      scrollback: options.scrollback ?? 3000,
      fastScrollModifier: 'shift',
      fastScrollSensitivity: 5,
      windowsMode: false,
    })

    const fitAddon = new FitAddon()
    const webLinksAddon = new WebLinksAddon()
    const searchAddon = new SearchAddon()
    const serializeAddon = new SerializeAddon()

    terminal.loadAddon(fitAddon)
    terminal.loadAddon(webLinksAddon)
    terminal.loadAddon(searchAddon)
    terminal.loadAddon(serializeAddon)
    terminal.open(container)

    const outputBuffer = useOutputBuffer(terminal, {
      batchInterval: 32,
      maxBufferSize: 512 * 1024,
      maxBatchSize: 16 * 1024,
      enabled: true,
    })

    const managed: ManagedTerminal = {
      terminal,
      fitAddon,
      searchAddon,
      serializeAddon,
      outputBuffer,
    }

    this.entries.set(paneId, {
      managed,
      resizeObserver: null,
      disposables: [],
      cleanups: [],
    })

    return managed
  }

  /**
   * Register an xterm IDisposable (e.g. onData, onScroll return values) for
   * automatic cleanup on recycle.
   */
  addDisposable(paneId: string, disposable: IDisposable): void {
    this.entries.get(paneId)?.disposables.push(disposable)
  }

  /**
   * Set the ResizeObserver for a terminal.
   * Previous observer (if any) is disconnected.
   */
  setResizeObserver(paneId: string, observer: ResizeObserver): void {
    const entry = this.entries.get(paneId)
    if (entry) {
      entry.resizeObserver?.disconnect()
      entry.resizeObserver = observer
    }
  }

  /**
   * Register an arbitrary cleanup callback that runs during recycle.
   * Use this for PTY unlisten, timer clears, monitor stops, etc.
   */
  addCleanup(paneId: string, fn: () => void): void {
    this.entries.get(paneId)?.cleanups.push(fn)
  }

  /**
   * Get managed terminal by paneId.
   */
  get(paneId: string): ManagedTerminal | undefined {
    return this.entries.get(paneId)?.managed
  }

  /**
   * Get raw Terminal instance by paneId.
   */
  getTerminal(paneId: string): Terminal | undefined {
    return this.entries.get(paneId)?.managed.terminal
  }

  /**
   * Get all raw Terminal instances (backwards-compatible with terminal-registry).
   */
  getAllTerminals(): Map<string, Terminal> {
    const result = new Map<string, Terminal>()
    for (const [paneId, entry] of this.entries) {
      result.set(paneId, entry.managed.terminal)
    }
    return result
  }

  /**
   * Recycle a terminal — dispose all tracked resources in correct order.
   *
   * Order of cleanup:
   * 1. Registered cleanup callbacks (timers, PTY unlisten, monitors)
   * 2. Output buffer
   * 3. ResizeObserver
   * 4. xterm event disposables (onData, onScroll, etc.)
   * 5. Addons (searchAddon explicit dispose)
   * 6. Terminal.dispose() (cleans remaining addons + internal state)
   * 7. Remove from registry
   */
  recycle(paneId: string): void {
    const entry = this.entries.get(paneId)
    if (!entry) return

    console.log(`[XTermManager] Recycling terminal: ${paneId}`)

    // 1. Run all registered cleanup callbacks
    for (const fn of entry.cleanups) {
      try {
        fn()
      } catch (e) {
        console.warn(`[XTermManager] Cleanup callback error for ${paneId}:`, e)
      }
    }
    entry.cleanups.length = 0

    // 2. Dispose output buffer (clears internal flush timer)
    try {
      entry.managed.outputBuffer.dispose()
    } catch (e) {
      console.warn(`[XTermManager] OutputBuffer dispose error for ${paneId}:`, e)
    }

    // 3. Disconnect ResizeObserver
    if (entry.resizeObserver) {
      entry.resizeObserver.disconnect()
      entry.resizeObserver = null
    }

    // 4. Dispose all tracked xterm event disposables
    for (const d of entry.disposables) {
      try {
        d.dispose()
      } catch (e) {
        // Already disposed, ignore
      }
    }
    entry.disposables.length = 0

    // 5. Dispose addons explicitly (before terminal.dispose)
    try {
      entry.managed.searchAddon.dispose()
    } catch (e) {
      // Already disposed via terminal.dispose or prior cleanup
    }

    // 6. Dispose terminal (cleans up all remaining addons and internal listeners)
    try {
      entry.managed.terminal.dispose()
    } catch (e) {
      console.warn(`[XTermManager] Terminal dispose error for ${paneId}:`, e)
    }

    // 7. Remove from registry
    this.entries.delete(paneId)

    console.log(`[XTermManager] Recycled: ${paneId}, remaining: ${this.entries.size}`)
  }

  /**
   * Recycle all managed terminals.
   */
  recycleAll(): void {
    const paneIds = [...this.entries.keys()]
    for (const paneId of paneIds) {
      this.recycle(paneId)
    }
  }

  /**
   * Check if a terminal is managed.
   */
  has(paneId: string): boolean {
    return this.entries.has(paneId)
  }

  /**
   * Number of managed terminals.
   */
  get size(): number {
    return this.entries.size
  }
}

// Singleton instance
export const xtermManager = new XTermManager()

// Backwards-compatible function exports (drop-in replacement for terminal-registry)
export function getTerminal(paneId: string): Terminal | undefined {
  return xtermManager.getTerminal(paneId)
}

export function getAllTerminals(): Map<string, Terminal> {
  return xtermManager.getAllTerminals()
}
