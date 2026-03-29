<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch, provide } from 'vue'
import { useTerminalStore } from '@/stores/terminal-store'
import { useKeyboardShortcuts } from '@/composables/use-keyboard-shortcuts'
import { useUpdater } from '@/composables/use-updater'
import { useSpeechRecognition } from '@/composables/use-speech-recognition'
import { useNotification } from '@/composables/use-notification'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import TabBar from '@/components/layout/tab-bar.vue'
import SplitContainer from '@/components/layout/split-container.vue'
import SettingsModal from '@/components/settings/settings-modal.vue'
import AboutModal from '@/components/settings/about-modal.vue'
import UpdateDialog from '@/components/updater/update-dialog.vue'
import SpeechIndicator from '@/components/speech/speech-indicator.vue'
import SessionManager from '@/components/terminal/session-manager.vue'

const terminalStore = useTerminalStore()
const { updateInfo, checkForUpdates } = useUpdater()
const showUpdateDialog = ref(false)

// Notification system
const { notifyTaskComplete, notifySuccess, notifyInfo } = useNotification()

// Speech recognition (Web Speech API)
const {
  isListening,
  transcript,
  displayTranscript,
  error: speechError,
  toggle: toggleSpeech,
  stop: stopSpeech,
  clear: clearTranscript,
} = useSpeechRecognition()

// Send speech text to active terminal
const sendToTerminal = async (text: string) => {
  const activeTab = terminalStore.activeTab
  if (!activeTab) {
    console.warn('[Speech] No active tab')
    return
  }

  // Find the active pane's sessionId
  let sessionId: string | undefined

  const findSessionId = (node: any): string | undefined => {
    if (node.type === 'pane' && node.paneId === terminalStore.activePaneId) {
      return node.sessionId
    }
    if (node.children) {
      for (const child of node.children) {
        const found = findSessionId(child)
        if (found) return found
      }
    }
    return undefined
  }

  sessionId = findSessionId(activeTab.layout)

  if (!sessionId) {
    console.warn('[Speech] No active session found')
    return
  }

  try {
    // @ts-ignore
    if (window.__TAURI_INTERNALS__) {
      // Convert string to UTF-8 byte array
      const encoder = new TextEncoder()
      const bytes = encoder.encode(text)

      await invoke('pty_write', {
        sessionId,
        data: Array.from(bytes),
      })
      console.log(`[Speech] Sent to terminal: "${text}"`)
    } else {
      console.log(`[Speech] Mock mode - would send: "${text}"`)
    }
  } catch (error) {
    console.error('[Speech] Failed to send to terminal:', error)
  }
}

// Watch for transcript changes and send to terminal
let lastSentLength = 0
watch(transcript, (newTranscript) => {
  if (newTranscript.length > lastSentLength && isListening.value) {
    const newText = newTranscript.substring(lastSentLength)
    if (newText.trim()) {
      sendToTerminal(newText)
      lastSentLength = newTranscript.length
    }
  }
})

// Reset when speech stops
watch(isListening, (listening) => {
  if (!listening) {
    lastSentLength = 0
    // Clear transcript after a short delay
    setTimeout(() => {
      clearTranscript()
    }, 1000)
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
let cleanupThemeListener: (() => void) | null = null

// Speech recognition keyboard shortcut (Ctrl+Shift+V or Cmd+Shift+V)
const handleSpeechShortcut = (e: KeyboardEvent) => {
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'v') {
    e.preventDefault()
    toggleSpeech()
  }
}

onMounted(async () => {
  console.log('App mounted, initializing...')

  // Initialize tmux first
  await terminalStore.initTmux()

  // Create initial tab or restore sessions
  try {
    if (terminalStore.tmuxEnabled && terminalStore.autoRestoreSessions) {
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
  try {
    unlistenSettings = await listen('menu:settings', () => {
      terminalStore.toggleSettings()
    })

    unlistenAbout = await listen('menu:about', () => {
      terminalStore.toggleAbout()
    })

    unlistenCheckUpdates = await listen('menu:check-updates', async () => {
      console.log('[App] Manual update check triggered')
      try {
        const hasUpdate = await checkForUpdates(false)
        if (hasUpdate) {
          showUpdateDialog.value = true
          await notifyInfo('发现新版本', '点击更新对话框查看详情')
        } else {
          // Show "already up to date" message
          alert('您已经在使用最新版本！')
          await notifySuccess('已是最新版本', '您正在使用最新版本的 Mat Terminal')
        }
      } catch (error) {
        console.error('[App] Update check failed:', error)
        alert('检查更新失败，请稍后重试')
      }
    })
  } catch (error) {
    console.error('Failed to setup menu event listeners:', error)
  }

  // Auto-check for updates on startup (delayed 3 seconds)
  setTimeout(async () => {
    console.log('[App] Auto-checking for updates on startup...')
    try {
      const hasUpdate = await checkForUpdates(true) // silent mode
      if (hasUpdate) {
        console.log('[App] Update available, showing dialog')
        showUpdateDialog.value = true
        await notifyInfo('🎉 发现新版本', '有新版本可用，点击查看更新详情')
      }
    } catch (error) {
      console.error('[App] Auto update check failed:', error)
      // Silent failure for auto-check
    }
  }, 3000)

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
  window.removeEventListener('keydown', handleSpeechShortcut)
  if (cleanupThemeListener) cleanupThemeListener()
})
</script>

<template>
  <div class="app-container">
    <tab-bar v-if="terminalStore.tabs.length > 0" />

    <!-- Render all tabs but only show the active one to preserve terminal history -->
    <div
      v-for="tab in terminalStore.tabs"
      :key="tab.id"
      v-show="tab.id === terminalStore.activeTabId"
      class="terminal-view"
    >
      <split-container :node="tab.layout" />
    </div>

    <div v-if="terminalStore.tabs.length === 0" class="empty-state">
      No terminal sessions
    </div>

    <!-- Settings Modal -->
    <settings-modal v-if="terminalStore.isSettingsOpen" />

    <!-- About Modal -->
    <about-modal v-if="terminalStore.isAboutOpen" />

    <!-- Session Manager -->
    <session-manager v-if="terminalStore.isSessionManagerOpen" />

    <!-- Update Dialog -->
    <update-dialog
      v-if="showUpdateDialog && updateInfo"
      :update-info="updateInfo"
      @close="showUpdateDialog = false"
    />

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
</style>
