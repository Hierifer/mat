<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useTerminalStore } from '@/stores/terminal-store'
import { useKeyboardShortcuts } from '@/composables/use-keyboard-shortcuts'
import { useUpdater } from '@/composables/use-updater'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import TabBar from '@/components/layout/tab-bar.vue'
import SplitContainer from '@/components/layout/split-container.vue'
import SettingsModal from '@/components/settings/settings-modal.vue'
import AboutModal from '@/components/settings/about-modal.vue'
import UpdateDialog from '@/components/updater/update-dialog.vue'

const terminalStore = useTerminalStore()
const { updateInfo, checkForUpdates } = useUpdater()
const showUpdateDialog = ref(false)

// Enable keyboard shortcuts
useKeyboardShortcuts()

let unlistenSettings: UnlistenFn | null = null
let unlistenAbout: UnlistenFn | null = null
let unlistenCheckUpdates: UnlistenFn | null = null

onMounted(async () => {
  console.log('App mounted, creating initial tab...')
  try {
    await terminalStore.createTab()
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
        } else {
          // Show "already up to date" message
          alert('您已经在使用最新版本！')
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
      }
    } catch (error) {
      console.error('[App] Auto update check failed:', error)
      // Silent failure for auto-check
    }
  }, 3000)
})

onUnmounted(() => {
  if (unlistenSettings) unlistenSettings()
  if (unlistenAbout) unlistenAbout()
  if (unlistenCheckUpdates) unlistenCheckUpdates()
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

    <!-- Update Dialog -->
    <update-dialog
      v-if="showUpdateDialog && updateInfo"
      :update-info="updateInfo"
      @close="showUpdateDialog = false"
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
