import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useTerminalStore, type SplitNode } from './terminal-store'

// Mock Tauri and heavy dependencies so the store can be imported in Node/happy-dom
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({ setTitle: vi.fn() }),
}))
vi.mock('@/settings/themes', () => ({
  themes: { 'VS Code Dark': { name: 'VS Code Dark' } },
}))
vi.mock('@xterm/addon-serialize', () => ({
  SerializeAddon: vi.fn(),
}))
vi.mock('@/composables/xterm-manager', () => ({
  getAllTerminals: () => new Map(),
}))

describe('terminal-store tab notifications', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  // ---------------------------------------------------------------------------
  // findTabBySessionId
  // ---------------------------------------------------------------------------
  describe('findTabBySessionId', () => {
    it('returns the tab id for a single-pane tab', () => {
      const store = useTerminalStore()
      store.tabs.push({
        id: 'tab_1',
        title: 'Test',
        layout: { type: 'pane', paneId: 'p1', sessionId: 'sess_abc' },
        createdAt: Date.now(),
      })

      expect(store.findTabBySessionId('sess_abc')).toBe('tab_1')
    })

    it('returns the tab id when sessionId is nested in a split layout', () => {
      const store = useTerminalStore()
      const layout: SplitNode = {
        type: 'horizontal',
        children: [
          { type: 'pane', paneId: 'p1', sessionId: 'sess_1', size: 50 },
          {
            type: 'vertical',
            size: 50,
            children: [
              { type: 'pane', paneId: 'p2', sessionId: 'sess_2', size: 50 },
              { type: 'pane', paneId: 'p3', sessionId: 'sess_target', size: 50 },
            ],
          },
        ],
      }
      store.tabs.push({ id: 'tab_deep', title: 'Deep', layout, createdAt: Date.now() })

      expect(store.findTabBySessionId('sess_target')).toBe('tab_deep')
    })

    it('returns null when sessionId does not exist', () => {
      const store = useTerminalStore()
      store.tabs.push({
        id: 'tab_1',
        title: 'Test',
        layout: { type: 'pane', paneId: 'p1', sessionId: 'sess_abc' },
        createdAt: Date.now(),
      })

      expect(store.findTabBySessionId('nonexistent')).toBeNull()
    })

    it('returns the correct tab when multiple tabs exist', () => {
      const store = useTerminalStore()
      store.tabs.push(
        {
          id: 'tab_a',
          title: 'A',
          layout: { type: 'pane', paneId: 'p1', sessionId: 'sess_a' },
          createdAt: Date.now(),
        },
        {
          id: 'tab_b',
          title: 'B',
          layout: { type: 'pane', paneId: 'p2', sessionId: 'sess_b' },
          createdAt: Date.now(),
        },
      )

      expect(store.findTabBySessionId('sess_b')).toBe('tab_b')
    })
  })

  // ---------------------------------------------------------------------------
  // addTabNotification / clearTabNotification
  // ---------------------------------------------------------------------------
  describe('addTabNotification', () => {
    it('adds a tab id to the notifications list', () => {
      const store = useTerminalStore()
      store.addTabNotification('tab_1')

      expect(store.tabNotifications).toEqual(['tab_1'])
    })

    it('does not duplicate an already-existing notification', () => {
      const store = useTerminalStore()
      store.addTabNotification('tab_1')
      store.addTabNotification('tab_1')

      expect(store.tabNotifications).toEqual(['tab_1'])
    })

    it('can hold notifications for multiple tabs', () => {
      const store = useTerminalStore()
      store.addTabNotification('tab_1')
      store.addTabNotification('tab_2')

      expect(store.tabNotifications).toEqual(['tab_1', 'tab_2'])
    })
  })

  describe('clearTabNotification', () => {
    it('removes a notification by tab id', () => {
      const store = useTerminalStore()
      store.addTabNotification('tab_1')
      store.addTabNotification('tab_2')
      store.clearTabNotification('tab_1')

      expect(store.tabNotifications).toEqual(['tab_2'])
    })

    it('does nothing when the tab id is not in the list', () => {
      const store = useTerminalStore()
      store.addTabNotification('tab_1')
      store.clearTabNotification('tab_nonexistent')

      expect(store.tabNotifications).toEqual(['tab_1'])
    })
  })
})
