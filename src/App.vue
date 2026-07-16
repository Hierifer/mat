<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed, watch, provide } from 'vue'
import { useTerminalStore } from '@/stores/terminal-store'
import { useKeyboardShortcuts } from '@/composables/use-keyboard-shortcuts'
import { useUpdater } from '@/composables/use-updater'
import { useSpeechRecognition } from '@/composables/use-speech-recognition'
import { useNotification } from '@/composables/use-notification'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { useI18n } from 'vue-i18n'
import TabBar from '@/components/layout/tab-bar.vue'
import IconFont from '@/components/ui/icon-font.vue'
import SplitContainer from '@/components/layout/split-container.vue'
import AgentPanel from '@/components/studio/agent-panel.vue'
import SettingsModal from '@/components/settings/settings-modal.vue'
import AboutModal from '@/components/settings/about-modal.vue'
import UpdateDialog from '@/components/updater/update-dialog.vue'
import SpeechIndicator from '@/components/speech/speech-indicator.vue'
import SessionManager from '@/components/terminal/session-manager.vue'
import ClaudeStatusBar from '@/components/claude/claude-status-bar.vue'
import StudioSidebar from '@/components/layout/studio-sidebar.vue'
import StudioHome from '@/components/layout/studio-home.vue'
import WhatsNewModal from '@/components/settings/whats-new-modal.vue'
import { usePlatform } from '@/composables/use-platform'
import { getVersion } from '@tauri-apps/api/app'
import { open as openDialog, ask } from '@tauri-apps/plugin-dialog'

const terminalStore = useTerminalStore()
const { updateInfo, isChecking, checkForUpdates } = useUpdater()
const showUpdateDialog = ref(false)
const showWhatsNew = ref(false)
const { t } = useI18n()

const { isMacOS, isWindows, isLinux } = usePlatform()
const isLightTheme = computed(() => terminalStore.currentThemeName.includes('Light'))

// Notification system
const { notifyInfo } = useNotification()

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

const handleDismissVersion = () => {
  if (updateInfo.value) {
    localStorage.setItem('materm_dismissed_update_version', updateInfo.value.version)
    console.log('[App] Dismissed update version:', updateInfo.value.version)
  }
}

// Studio project bar: window controls & project management
const handleStudioMinimize = async () => {
  try {
    // @ts-ignore
    if (window.__TAURI_INTERNALS__) await getCurrentWindow().minimize()
  } catch (error) { console.error('Failed to minimize:', error) }
}
const handleStudioMaximize = async () => {
  try {
    // @ts-ignore
    if (window.__TAURI_INTERNALS__) await getCurrentWindow().toggleMaximize()
  } catch (error) { console.error('Failed to maximize:', error) }
}
const handleStudioClose = async () => {
  try {
    // @ts-ignore
    if (window.__TAURI_INTERNALS__) await getCurrentWindow().close()
  } catch (error) { console.error('Failed to close:', error) }
}

const openProjectPath = async (path: string) => {
  try {
    await terminalStore.addStudioProject(path)
  } catch (error: any) {
    const shouldInit = await ask(t('studio.initGitConfirm'), {
      title: t('studio.notGitRepo'),
      kind: 'warning',
      okLabel: t('common.confirm'),
      cancelLabel: t('common.cancel'),
    })
    if (shouldInit) {
      await invoke('git_init_repo', { path })
      await terminalStore.addStudioProject(path)
    }
  }
}

const handleAddProject = async () => {
  try {
    const selected = await openDialog({
      directory: true,
      multiple: false,
      title: t('studio.selectProject'),
    })
    if (!selected) return
    await openProjectPath(selected as string)
  } catch (error) {
    console.error('[App] Failed to add studio project:', error)
  }
}

const handleOpenRecentProject = async (path: string) => {
  try {
    await openProjectPath(path)
  } catch (error) {
    console.error('[App] Failed to open recent project:', error)
  }
}

const handleCloseProject = async (tabId: string) => {
  await terminalStore.closeStudioTab(tabId)
}

// Persist tab/split layout (debounced) so tmux sessions can be reattached
// into the same layout after restart
let layoutSnapshotTimer: ReturnType<typeof setTimeout> | null = null
watch(
  [() => terminalStore.tabs, () => terminalStore.activeTabId, () => terminalStore.activePaneId],
  () => {
    if (!terminalStore.tmuxEnabled) return
    if (layoutSnapshotTimer) clearTimeout(layoutSnapshotTimer)
    layoutSnapshotTimer = setTimeout(() => {
      terminalStore.saveLayoutSnapshot()
    }, 500)
  },
  { deep: true },
)

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
    } else if (terminalStore.tmuxEnabled) {
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
          await invoke('set_update_menu_badge', { hasUpdate: true })
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
        // Mark menu badge regardless of whether we show the dialog
        await invoke('set_update_menu_badge', { hasUpdate: true })

        const dismissedVersion = localStorage.getItem('materm_dismissed_update_version')
        if (dismissedVersion && updateInfo.value && updateInfo.value.version === dismissedVersion) {
          console.log('[App] Update available but version is dismissed, skipping dialog')
        } else {
          console.log('[App] Update available, showing dialog')
          showUpdateDialog.value = true
          await notifyInfo(t('notifications.updateAvailable'), t('notifications.updateAvailableStartup'))
        }
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
  if (layoutSnapshotTimer) clearTimeout(layoutSnapshotTimer)
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

    <!-- Studio mode: project tab bar + horizontal layout with sidebar -->
    <template v-else>
      <!-- Project tab bar -->
      <div class="studio-project-bar" :class="{ 'light-theme': isLightTheme }">
        <div v-if="isMacOS()" class="window-controls macos">
          <button class="control-btn close" @click="handleStudioClose"></button>
          <button class="control-btn minimize" @click="handleStudioMinimize"></button>
          <button class="control-btn maximize" @click="handleStudioMaximize"></button>
        </div>

        <div class="studio-tab-list">
          <!-- Home tab (recent projects) -->
          <div
            class="studio-tab studio-home-tab"
            :class="{ active: terminalStore.activeStudioTabId === null }"
            @click="terminalStore.goStudioHome()"
          >
            <icon-font class="studio-tab-icon" name="home" :size="12" />
            <span class="studio-tab-name">{{ $t('studio.projects') }}</span>
          </div>

          <div
            v-for="tab in terminalStore.studioTabs"
            :key="tab.id"
            class="studio-tab"
            :class="{ active: tab.id === terminalStore.activeStudioTabId }"
            @click="terminalStore.switchStudioTab(tab.id)"
          >
            <icon-font class="studio-tab-icon" name="branch" :size="12" />
            <span class="studio-tab-name">{{ tab.project.name }}</span>
            <button
              class="studio-tab-close"
              @click.stop="handleCloseProject(tab.id)"
            ><icon-font name="close" :size="9" /></button>
          </div>
        </div>

        <button class="add-project-btn" @click="handleAddProject" :title="$t('studio.addProject')"><icon-font name="plus" :size="12" /></button>

        <div class="drag-spacer" data-tauri-drag-region></div>

        <button class="studio-bar-btn" @click="terminalStore.exitStudioMode()" :title="$t('studio.switchToTabs')">
          <icon-font name="layout" :size="13" />
        </button>

        <button class="studio-bar-btn" @click="terminalStore.toggleSettings" title="Settings">
          <icon-font name="setting" :size="14" />
        </button>

        <div v-if="isWindows() || isLinux()" class="window-controls windows-linux">
          <button class="control-btn-win minimize" @click="handleStudioMinimize" title="Minimize">
            <svg width="10" height="10" viewBox="0 0 10 10"><rect x="0" y="4" width="10" height="1" fill="currentColor"/></svg>
          </button>
          <button class="control-btn-win maximize" @click="handleStudioMaximize" title="Maximize">
            <svg width="10" height="10" viewBox="0 0 10 10"><rect x="0" y="0" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1"/></svg>
          </button>
          <button class="control-btn-win close" @click="handleStudioClose" title="Close">
            <svg width="10" height="10" viewBox="0 0 10 10"><path d="M0,0 L10,10 M10,0 L0,10" stroke="currentColor" stroke-width="1"/></svg>
          </button>
        </div>
      </div>

      <!-- Home view: recent project list -->
      <div v-if="terminalStore.activeStudioTabId === null" class="studio-layout">
        <studio-home
          @open="handleOpenRecentProject"
          @browse="handleAddProject"
        />
      </div>

      <div v-else class="studio-layout">
        <studio-sidebar />
        <div class="studio-content">
          <template v-for="branch in terminalStore.studioBranches" :key="branch.id">
            <div
              v-show="branch.id === terminalStore.activeStudioBranchId"
              class="branch-view"
            >
              <div class="branch-view-toolbar">
                <button
                  class="view-toggle-btn"
                  :class="{ active: branch.viewMode !== 'terminal' }"
                  @click="terminalStore.setStudioBranchViewMode(branch.id, 'agent')"
                >{{ $t('studio.agent.agentView') }}</button>
                <button
                  class="view-toggle-btn"
                  :class="{ active: branch.viewMode === 'terminal' }"
                  @click="terminalStore.setStudioBranchViewMode(branch.id, 'terminal')"
                >{{ $t('studio.agent.terminalView') }}</button>
              </div>

              <div v-show="branch.viewMode !== 'terminal'" class="agent-view">
                <agent-panel :cwd="branch.worktreePath" />
              </div>

              <div v-show="branch.viewMode === 'terminal'" class="terminal-view">
                <split-container
                  v-if="branch.sessionId"
                  :node="{
                    type: 'pane',
                    paneId: branch.paneId,
                    sessionId: branch.sessionId,
                    cwd: branch.worktreePath,
                  }"
                />
              </div>
            </div>
          </template>

          <div v-if="terminalStore.studioBranches.length === 0" class="empty-state studio-empty">
            <div class="studio-welcome">
              <icon-font name="branch" :size="48" style="opacity: 0.3; margin-bottom: 12px;" />
              <p>{{ $t('studio.newBranch') }}</p>
            </div>
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
      @dismiss-version="handleDismissVersion"
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

.studio-layout {
  display: flex;
  flex-direction: row;
  flex: 1;
  overflow: hidden;
}

.studio-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.branch-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.branch-view-toolbar {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px 8px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--border-color, #333);
}

.view-toggle-btn {
  background: transparent;
  border: none;
  border-radius: 4px;
  color: #888;
  cursor: pointer;
  font-size: 11px;
  padding: 3px 10px;
  transition: all 0.15s;
}

.view-toggle-btn:hover {
  color: #ccc;
  background: rgba(128, 128, 128, 0.15);
}

.view-toggle-btn.active {
  color: #fff;
  background: #0e639c;
}

.agent-view {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.studio-empty {
  flex-direction: column;
}

.studio-welcome {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  color: #666;
  font-size: 14px;
}

/* Studio project tab bar */
.studio-project-bar {
  display: flex;
  align-items: center;
  height: 40px;
  background: #1e1e1e;
  border-bottom: 1px solid #333;
  padding: 0 12px 0 8px;
  user-select: none;
  gap: 8px;
  border-radius: 10px 10px 0 0;
  flex-shrink: 0;
  transition: background 0.3s, border-color 0.3s;
}

.studio-project-bar.light-theme {
  background: #f3f3f3;
  border-bottom-color: #d4d4d4;
}

.studio-project-bar .window-controls.macos {
  display: flex;
  gap: 8px;
  padding: 0 4px;
  -webkit-app-region: no-drag;
  app-region: no-drag;
}

.studio-project-bar .control-btn {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: none;
  cursor: pointer;
  transition: all 0.15s;
  position: relative;
}

.studio-project-bar .control-btn::before {
  content: '';
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  opacity: 0;
  transition: opacity 0.15s;
}

.studio-project-bar:hover .control-btn::before {
  opacity: 1;
}

.studio-project-bar .control-btn.close { background: #ff5f56; }
.studio-project-bar .control-btn.close::before { content: '\00d7'; font-size: 10px; color: #4d0000; font-weight: bold; }
.studio-project-bar .control-btn.minimize { background: #ffbd2e; }
.studio-project-bar .control-btn.minimize::before { content: '\2212'; font-size: 10px; color: #995700; font-weight: bold; }
.studio-project-bar .control-btn.maximize { background: #27c93f; }
.studio-project-bar .control-btn.maximize::before { content: '+'; font-size: 10px; color: #006400; font-weight: bold; }

.studio-project-bar .window-controls.windows-linux {
  display: flex;
  gap: 0;
}

.studio-project-bar .control-btn-win {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 40px;
  background: transparent;
  border: none;
  color: #cccccc;
  cursor: pointer;
  transition: background 0.15s;
}

.studio-project-bar .control-btn-win:hover {
  background: #3e3e42;
}

.studio-project-bar .control-btn-win.close:hover {
  background: #e81123;
  color: white;
}

.studio-tab-list {
  display: flex;
  gap: 4px;
  overflow-x: auto;
  overflow-y: hidden;
  flex-shrink: 1;
  min-width: 0;
  -webkit-app-region: no-drag;
  app-region: no-drag;
}

.studio-tab-list::-webkit-scrollbar {
  height: 0;
}

.studio-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: #2d2d30;
  border: 1px solid transparent;
  border-radius: 4px 4px 0 0;
  cursor: pointer;
  transition: all 0.15s;
  min-width: 80px;
  max-width: 180px;
  position: relative;
  white-space: nowrap;
}

.studio-project-bar.light-theme .studio-tab {
  background: #e8e8e8;
}

.studio-tab:hover {
  background: #37373d;
}

.studio-project-bar.light-theme .studio-tab:hover {
  background: #d8d8d8;
}

.studio-tab.active {
  background: #1e1e1e;
  border-color: #007acc;
  border-bottom-color: #1e1e1e;
}

.studio-project-bar.light-theme .studio-tab.active {
  background: #f3f3f3;
  border-color: #007acc;
  border-bottom-color: #f3f3f3;
}

.studio-tab-icon {
  color: #888;
  flex-shrink: 0;
}

.studio-tab.active .studio-tab-icon {
  color: #007acc;
}

.studio-tab-name {
  font-size: 13px;
  color: #cccccc;
  overflow: hidden;
  text-overflow: ellipsis;
}

.studio-project-bar.light-theme .studio-tab-name {
  color: #616161;
}

.studio-tab.active .studio-tab-name {
  color: #ffffff;
}

.studio-project-bar.light-theme .studio-tab.active .studio-tab-name {
  color: #000000;
}

.studio-tab-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  background: transparent;
  border: none;
  border-radius: 3px;
  color: #858585;
  cursor: pointer;
  font-size: 14px;
  padding: 0;
  transition: all 0.15s;
  opacity: 0;
  flex-shrink: 0;
}

.studio-tab:hover .studio-tab-close {
  opacity: 1;
}

.studio-tab-close:hover {
  background: #e81123;
  color: white;
}

.add-project-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: #2d2d30;
  border: 1px solid transparent;
  border-radius: 4px;
  color: #cccccc;
  cursor: pointer;
  font-size: 18px;
  transition: all 0.15s;
  flex-shrink: 0;
  -webkit-app-region: no-drag;
  app-region: no-drag;
}

.studio-project-bar.light-theme .add-project-btn {
  background: #e8e8e8;
  color: #616161;
}

.add-project-btn:hover {
  background: #37373d;
  border-color: #007acc;
  color: #ffffff;
}

.studio-project-bar.light-theme .add-project-btn:hover {
  background: #d8d8d8;
  border-color: #007acc;
  color: #000000;
}

.studio-project-bar .drag-spacer {
  flex: 1;
  min-width: 40px;
  height: 40px;
  -webkit-app-region: drag;
  app-region: drag;
}

.studio-bar-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: #2d2d30;
  border: 1px solid transparent;
  border-radius: 4px;
  color: #cccccc;
  cursor: pointer;
  transition: all 0.15s;
  flex-shrink: 0;
  -webkit-app-region: no-drag;
  app-region: no-drag;
}

.studio-project-bar.light-theme .studio-bar-btn {
  background: #e8e8e8;
  color: #616161;
}

.studio-bar-btn:hover {
  background: #37373d;
  border-color: #007acc;
  color: #ffffff;
}

.studio-project-bar.light-theme .studio-bar-btn:hover {
  background: #d8d8d8;
  border-color: #007acc;
  color: #000000;
}
</style>
