import { onMounted, onUnmounted } from 'vue'
import { useTerminalStore } from '@/stores/terminal-store'

export function useKeyboardShortcuts() {
  const store = useTerminalStore()

  const handleKeyDown = (event: KeyboardEvent) => {
    // Check for Cmd (Mac) or Ctrl (Windows/Linux)
    const modifier = event.metaKey || event.ctrlKey

    if (!modifier) return

    // Cmd/Ctrl + T: New Tab
    if (event.key === 't') {
      event.preventDefault()
      store.createTab()
      return
    }

    // Cmd/Ctrl + Shift + W: Close Tab
    if (event.key === 'W' && event.shiftKey) {
      event.preventDefault()
      if (store.activeTabId && store.tabs.length > 1) {
        store.closeTab(store.activeTabId)
      }
      return
    }

    // Cmd/Ctrl + 1-9: Switch to tab by number
    if (event.key >= '1' && event.key <= '9') {
      event.preventDefault()
      const tabIndex = parseInt(event.key) - 1
      if (tabIndex < store.tabs.length) {
        store.setActiveTab(store.tabs[tabIndex].id)
      }
      return
    }

    const tab = store.activeTab
    if (!tab) return

    // Get the active pane (for now, just use the first pane in the layout)
    const activePaneId = store.activePaneId || findFirstPaneId(tab.layout)
    if (!activePaneId) return

    // Cmd/Ctrl + D: Split Horizontal
    if (event.key === 'd' && !event.shiftKey) {
      event.preventDefault()
      store.splitPane(activePaneId, 'horizontal')
      return
    }

    // Cmd/Ctrl + Shift + D: Split Vertical
    if (event.key === 'D' && event.shiftKey) {
      event.preventDefault()
      store.splitPane(activePaneId, 'vertical')
      return
    }

    // Cmd/Ctrl + W: Close Pane
    if (event.key === 'w' && !event.shiftKey) {
      event.preventDefault()
      store.closePane(activePaneId)
      return
    }
  }

  // Helper to find the first pane ID in a layout
  function findFirstPaneId(node: any): string | null {
    if (node.type === 'pane' && node.paneId) {
      return node.paneId
    }
    if (node.children) {
      for (const child of node.children) {
        const found = findFirstPaneId(child)
        if (found) return found
      }
    }
    return null
  }

  onMounted(() => {
    window.addEventListener('keydown', handleKeyDown)
  })

  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeyDown)
  })
}
