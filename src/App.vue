<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch, provide } from 'vue'
import { useTerminalStore } from '@/stores/terminal-store'
import { useKeyboardShortcuts } from '@/composables/use-keyboard-shortcuts'
import { useUpdater } from '@/composables/use-updater'
import { useSpeechRecognition } from '@/composables/use-speech-recognition'
import { useNotification } from '@/composables/use-notification'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { useI18n } from 'vue-i18n'
import TabBar from '@/components/layout/tab-bar.vue'
import SplitContainer from '@/components/layout/split-container.vue'
import SettingsModal from '@/components/settings/settings-modal.vue'
import AboutModal from '@/components/settings/about-modal.vue'
import UpdateDialog from '@/components/updater/update-dialog.vue'
import SpeechIndicator from '@/components/speech/speech-indicator.vue'
import SessionManager from '@/components/terminal/session-manager.vue'
import ClaudeStatusBar from '@/components/claude/claude-status-bar.vue'
import ConversationSidebar from '@/components/layout/conversation-sidebar.vue'
import WhatsNewModal from '@/components/settings/whats-new-modal.vue'
import { getVersion } from '@tauri-apps/api/app'

const terminalStore = useTerminalStore()
const { updateInfo, isChecking, checkForUpdates } = useUpdater()
const showUpdateDialog = ref(false)
const showWhatsNew = ref(false)
const { t } = useI18n()

// Notification system
const { notifyTaskComplete, notifySuccess, notifyInfo } = useNotification()

// Speech recognition — send only final results to terminal
// Interim results are displayed in the speech indicator UI only.
// This avoids DEL/backspace sequences that don't work in TUI apps (e.g. Claude Code).
const getActiveSessionId = (): string | undefined => {
  const activeTab = terminalStore.activeTab
  if (!activeTab) return undefined
  const find = (node: any): string | undefined => {
    if (node.type === 'pane' && node.paneId === terminalStore.activePaneId) return node.sessionId
    if (node.children) {
      for (const child of node.children) {
        const found = find(child)
        if (found) return found
      }
    }
    return undefined
  }
  return find(activeTab.layout)
}

const handleSpeechResult = async (text: string, isFinal: boolean) => {
  if (!isFinal) return

  const sessionId = getActiveSessionId()
  if (!sessionId) return

  try {
    // @ts-ignore
    if (!window.__TAURI_INTERNALS__) return

    const encoder = new TextEncoder()
    const textBytes = encoder.encode(text)
    await invoke('pty_write', { sessionId, data: Array.from(textBytes) })
  } catch (err) {
    console.error('[Speech] Failed to write to terminal:', err)
  }
}

const sendToTerminal = async (text: string) => {
  const sessionId = getActiveSessionId()
  if (!sessionId) return

  try {
    const encoder = new TextEncoder()
    const data = Array.from(encoder.encode(text))
    await invoke('pty_write', { sessionId, data })
  } catch (err) {
    console.error('[App] Failed to write to terminal:', err)
  }
}

const {
  isListening,
  displayTranscript,
  error: speechError,
  toggle: toggleSpeech,
  stop: stopSpeech,
  clear: clearTranscript,
} = useSpeechRecognition({ onResult: handleSpeechResult })

// Reset when speech stops
watch(isListening, (listening) => {
  if (!listening) {
    setTimeout(() => clearTranscript(), 1000)
  }
})

// Provide speech recognition to child components
provide('speechRecognition', {
  isListening,
  toggleSpeech,
})

// Enable keyboard shortcuts
useKeyboardShortcuts()

let unlistenSettings: UnlistenFn | null = null
let unlistenAbout: UnlistenFn | null = null
let unlistenCheckUpdates: UnlistenFn | null = null
let unlistenDragDrop: UnlistenFn | null = null
let cleanupThemeListener: (() => void) | null = null

// Speech recognition keyboard shortcut (Ctrl+Shift+V or Cmd+Shift+V)
const handleSpeechShortcut = (e: KeyboardEvent) => {
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'v') {
    e.preventDefault()
    toggleSpeech()
  }
}

const onWhatsNewClose = async () => {
  showWhatsNew.value = false
  try {
    const currentVersion = await getVersion()
    localStorage.setItem('materm_last_seen_version', currentVersion)
  } catch (err) {
    console.error('[App] Failed to save version:', err)
  }
}

onMounted(async () => {
  console.log('App mounted, initializing...')

  // Initialize tmux first
  await terminalStore.initTmux()

  // Load speech recognition settings
  await terminalStore.loadSpeechSettings()

  // Create initial tab or restore sessions
  try {
    // Check if there's saved terminal state from an update
    if (terminalStore.hasSavedTerminalState()) {
      console.log('Restoring terminal state from previous session...')
      const restored = await terminalStore.restoreTerminalState()
      if (!restored) {
        console.warn('State restore failed, creating fresh tab')
        await terminalStore.createTab()
      }
    } else if (terminalStore.tmuxEnabled && terminalStore.autoRestoreSessions) {
      console.log('Restoring tmux sessions...')
      await terminalStore.restoreSessions()
    } else {
      console.log('Creating initial tab...')
      await terminalStore.createTab()
    }
    console.log('Tab created successfully')
    console.log('Active tab:', terminalStore.activeTab)
    console.log('Tabs array:', terminalStore.tabs)
  } catch (error) {
    console.error('Failed to create initial tab:', error)
  }

  // Listen for menu events
  console.log('[App] ========================================')
  console.log('[App] Setting up menu event listeners...')
  console.log('[App] ========================================')

  try {
    console.log('[App] Registering menu:settings listener...')
    unlistenSettings = await listen('menu:settings', () => {
      console.log('[App] menu:settings event received')
      terminalStore.toggleSettings()
    })
    console.log('[App] ✅ menu:settings listener registered')

    console.log('[App] Registering menu:about listener...')
    unlistenAbout = await listen('menu:about', () => {
      console.log('[App] menu:about event received')
      terminalStore.toggleAbout()
    })
    console.log('[App] ✅ menu:about listener registered')

    console.log('[App] Registering menu:check-updates listener...')
    unlistenCheckUpdates = await listen('menu:check-updates', async () => {
      console.log('[App] ✅ menu:check-updates event received!')
      // Show dialog immediately with loading state
      showUpdateDialog.value = true

      try {
        const hasUpdate = await checkForUpdates(false)
        if (hasUpdate) {
          await notifyInfo(t('notifications.updateAvailable'), t('notifications.updateAvailableDesc'))
        }
      } catch (error) {
        console.error('[App] Update check failed:', error)
      }
    })
    console.log('[App] ✅ menu:check-updates listener registered')

    console.log('[App] ========================================')
    console.log('[App] ✅ All menu event listeners registered successfully')
    console.log('[App] Listeners:', {
      settings: unlistenSettings ? 'registered' : 'failed',
      about: unlistenAbout ? 'registered' : 'failed',
      checkUpdates: unlistenCheckUpdates ? 'registered' : 'failed',
    })
    console.log('[App] ========================================')
  } catch (error) {
    console.error('[App] ========================================')
    console.error('[App] ❌ Failed to setup menu event listeners!')
    console.error('[App] Error:', error)
    console.error('[App] ========================================')
  }

  // Check if we should show What's New dialog
  try {
    const currentVersion = await getVersion()
    const lastSeenVersion = localStorage.getItem('materm_last_seen_version')
    if (lastSeenVersion !== currentVersion) {
      showWhatsNew.value = true
    }
  } catch (err) {
    console.error('[App] Failed to check version for What\'s New:', err)
  }

  // Auto-check for updates on startup (delayed 3 seconds)
  setTimeout(async () => {
    console.log('[App] Auto-checking for updates on startup...')
    try {
      const hasUpdate = await checkForUpdates(true) // silent mode
      if (hasUpdate) {
        console.log('[App] Update available, showing dialog')
        showUpdateDialog.value = true
        await notifyInfo(t('notifications.updateAvailable'), t('notifications.updateAvailableStartup'))
      }
    } catch (error) {
      console.error('[App] Auto update check failed:', error)
      // Silent failure for auto-check
    }
  }, 3000)

  // Listen for file drag-drop events
  unlistenDragDrop = await listen<{ paths: string[] }>('tauri://drag-drop', (event) => {
    const paths = event.payload.paths
    if (paths && paths.length > 0) {
      const escaped = paths.map((p) => {
        // Shell-escape: wrap in single quotes, escape embedded single quotes
        return "'" + p.replace(/'/g, "'\\''") + "'"
      })
      sendToTerminal(escaped.join(' '))
    }
  })

  // Add keyboard shortcut for speech recognition
  window.addEventListener('keydown', handleSpeechShortcut)
  console.log('[App] Speech recognition shortcut registered (Ctrl+Shift+V)')

  // Apply initial theme mode and setup system theme listener
  terminalStore.applyThemeMode()

  const themeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  const handleThemeChange = () => {
    if (terminalStore.themeMode === 'auto') {
      terminalStore.applyThemeMode()
    }
  }
  themeMediaQuery.addEventListener('change', handleThemeChange)

  // Store the cleanup function
  cleanupThemeListener = () => {
    themeMediaQuery.removeEventListener('change', handleThemeChange)
  }
})

onUnmounted(() => {
  if (unlistenSettings) unlistenSettings()
  if (unlistenAbout) unlistenAbout()
  if (unlistenCheckUpdates) unlistenCheckUpdates()
  if (unlistenDragDrop) unlistenDragDrop()
  window.removeEventListener('keydown', handleSpeechShortcut)
  if (cleanupThemeListener) cleanupThemeListener()
})
</script>

<template>
  <div class="app-container">
    <!-- Tabs mode: standard vertical layout -->
    <template v-if="terminalStore.displayMode === 'tabs'">
      <tab-bar v-if="terminalStore.tabs.length > 0" />

      <div
        v-for="tab in terminalStore.tabs"
        :key="tab.id"
        v-show="tab.id === terminalStore.activeTabId"
        class="terminal-view"
      >
        <split-container :node="tab.layout" />
      </div>

      <div v-if="terminalStore.tabs.length === 0" class="empty-state">
        {{ $t('terminal.noSessions') }}
      </div>
    </template>

    <!-- Conversation mode: horizontal layout with sidebar -->
    <template v-else>
      <div class="conversation-layout">
        <conversation-sidebar />
        <div class="conversation-content">
          <div
            v-for="tab in terminalStore.tabs"
            :key="tab.id"
            v-show="tab.id === terminalStore.activeTabId"
            class="terminal-view"
          >
            <split-container :node="tab.layout" />
          </div>

          <div v-if="terminalStore.tabs.length === 0" class="empty-state">
            {{ $t('terminal.noSessions') }}
          </div>
        </div>
      </div>
    </template>

    <!-- Settings Modal -->
    <settings-modal v-if="terminalStore.isSettingsOpen" />

    <!-- About Modal -->
    <about-modal v-if="terminalStore.isAboutOpen" />

    <!-- What's New Modal -->
    <whats-new-modal v-if="showWhatsNew" @close="onWhatsNewClose" />

    <!-- Session Manager -->
    <session-manager v-if="terminalStore.isSessionManagerOpen" />

    <!-- Update Dialog -->
    <update-dialog
      v-if="showUpdateDialog"
      :update-info="updateInfo"
      :is-checking="isChecking"
      @close="showUpdateDialog = false"
    />

    <!-- Claude Status Bar -->
    <claude-status-bar />

    <!-- Speech Recognition Indicator -->
    <speech-indicator
      :is-listening="isListening"
      :transcript="displayTranscript"
      :error="speechError"
      @stop="stopSpeech"
    />
  </div>
</template>

<style scoped>
.app-container {
  width: 100vw;
  height: 100vh;
  background: #1e1e1e;
  color: #d4d4d4;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  border-radius: 10px;
}

.terminal-view {
  flex: 1;
  width: 100%;
  overflow: hidden;
}

.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  color: #666;
}

.conversation-layout {
  display: flex;
  flex-direction: row;
  flex: 1;
  overflow: hidden;
}

.conversation-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 0 10px 0 0;
}
</style>
