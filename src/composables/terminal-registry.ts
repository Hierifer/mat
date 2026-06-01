import type { Terminal } from 'xterm'

/**
 * Global registry mapping paneId -> Terminal instance.
 * Used by the store to serialize terminal state before app updates.
 */
const registry = new Map<string, Terminal>()

export function registerTerminal(paneId: string, terminal: Terminal) {
  registry.set(paneId, terminal)
}

export function unregisterTerminal(paneId: string) {
  registry.delete(paneId)
}

export function getTerminal(paneId: string): Terminal | undefined {
  return registry.get(paneId)
}

export function getAllTerminals(): Map<string, Terminal> {
  return registry
}
