<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useTerminalStore } from '@/stores/terminal-store'
import { useKeyboardShortcuts } from '@/composables/use-keyboard-shortcuts'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import TabBar from '@/components/layout/tab-bar.vue'
import SplitContainer from '@/components/layout/split-container.vue'
import SettingsModal from '@/components/settings/settings-modal.vue'
import AboutModal from '@/components/settings/about-modal.vue'

const terminalStore = useTerminalStore()

// Enable keyboard shortcuts
useKeyboardShortcuts()

let unlistenSettings: UnlistenFn | null = null
let unlistenAbout: UnlistenFn | null = null

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
  } catch (error) {
    console.error('Failed to setup menu event listeners:', error)
  }
})

onUnmounted(() => {
  if (unlistenSettings) unlistenSettings()
  if (unlistenAbout) unlistenAbout()
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
