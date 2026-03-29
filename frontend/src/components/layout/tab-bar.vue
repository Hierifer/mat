<script setup lang="ts">
import { ref, inject, computed, type Ref } from 'vue'
import { useTerminalStore } from '@/stores/terminal-store'
import { usePlatform } from '@/composables/use-platform'
import { getCurrentWindow } from '@tauri-apps/api/window'

const store = useTerminalStore()

// Inject speech recognition
const speechRecognition = inject<{
  isListening: Ref<boolean>
  toggleSpeech: () => void
}>('speechRecognition')
const { isMacOS, isWindows, isLinux } = usePlatform()

// Determine if current theme is light
const isLightTheme = computed(() => {
  return store.currentThemeName.includes('Light')
})

const handleMinimize = async () => {
  try {
    // @ts-ignore - Check if Tauri is available
    if (window.__TAURI_INTERNALS__) {
      const appWindow = getCurrentWindow()
      await appWindow.minimize()
    }
  } catch (error) {
    console.error('Failed to minimize window:', error)
  }
}

const handleMaximize = async () => {
  try {
    // @ts-ignore
    if (window.__TAURI_INTERNALS__) {
      const appWindow = getCurrentWindow()
      await appWindow.toggleMaximize()
    }
  } catch (error) {
    console.error('Failed to maximize window:', error)
  }
}

const handleClose = async () => {
  try {
    // @ts-ignore
    if (window.__TAURI_INTERNALS__) {
      const appWindow = getCurrentWindow()
      await appWindow.close()
    }
  } catch (error) {
    console.error('Failed to close window:', error)
  }
}

const editingTabId = ref<string | null>(null)
const editingTitle = ref('')

const handleTabClick = (tabId: string) => {
  store.setActiveTab(tabId)
}

const handleNewTab = () => {
  store.createTab()
}

const handleCloseTab = (tabId: string, event: Event) => {
  event.stopPropagation()
  store.closeTab(tabId)
}

const startEditing = (tabId: string, currentTitle: string, event: Event) => {
  event.stopPropagation()
  editingTabId.value = tabId
  editingTitle.value = currentTitle
}

const finishEditing = () => {
  if (editingTabId.value && editingTitle.value.trim()) {
    store.updateTabTitle(editingTabId.value, editingTitle.value.trim())
  }
  editingTabId.value = null
  editingTitle.value = ''
}

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Enter') {
    finishEditing()
  } else if (e.key === 'Escape') {
    editingTabId.value = null
    editingTitle.value = ''
  }
}
</script>

<template>
  <div class="tab-bar" :class="{ 'light-theme': isLightTheme }">
    <!-- macOS style window controls (left side) -->
    <div v-if="isMacOS()" class="window-controls macos">
      <button class="control-btn close" @click="handleClose" title="Close"></button>
      <button class="control-btn minimize" @click="handleMinimize" title="Minimize"></button>
      <button class="control-btn maximize" @click="handleMaximize" title="Maximize"></button>
    </div>

    <div class="tab-list">
      <div
        v-for="tab in store.tabs"
        :key="tab.id"
        class="tab"
        :class="{ active: tab.id === store.activeTabId }"
        @click="handleTabClick(tab.id)"
      >
        <span class="tab-number">{{ store.tabs.indexOf(tab) + 1 }}</span>

        <input
          v-if="editingTabId === tab.id"
          v-model="editingTitle"
          class="tab-title-input"
          @blur="finishEditing"
          @keydown="handleKeydown"
          @click.stop
          autofocus
        />
        <span
          v-else
          class="tab-title"
          @dblclick="startEditing(tab.id, tab.title, $event)"
        >
          {{ tab.title }}
        </span>

        <button
          v-if="store.tabs.length > 1"
          class="tab-close"
          @click="handleCloseTab(tab.id, $event)"
          title="Close tab"
        >
          ✕
        </button>
      </div>
    </div>

    <!-- Draggable spacer -->
    <div class="drag-spacer" data-tauri-drag-region></div>

    <button class="new-tab-btn" @click="handleNewTab" title="New tab">
      +
    </button>

    <button
      v-if="speechRecognition"
      class="speech-btn"
      :class="{ active: speechRecognition.isListening.value }"
      @click="speechRecognition.toggleSpeech"
      title="Voice input (Ctrl+Shift+V)"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M8 1C7.17 1 6.5 1.67 6.5 2.5V8C6.5 8.83 7.17 9.5 8 9.5C8.83 9.5 9.5 8.83 9.5 8V2.5C9.5 1.67 8.83 1 8 1Z" fill="currentColor"/>
        <path d="M11 8C11 9.66 9.66 11 8 11C6.34 11 5 9.66 5 8H3.5C3.5 10.07 5.07 11.75 7 12.09V14H9V12.09C10.93 11.75 12.5 10.07 12.5 8H11Z" fill="currentColor"/>
      </svg>
    </button>

    <button class="settings-btn" @click="store.toggleSettings" title="Settings">
      ⚙
    </button>

    <!-- Windows/Linux style window controls (right side) -->
    <div v-if="isWindows() || isLinux()" class="window-controls windows-linux">
      <button class="control-btn-win minimize" @click="handleMinimize" title="Minimize">
        <svg width="10" height="10" viewBox="0 0 10 10">
          <rect x="0" y="4" width="10" height="1" fill="currentColor"/>
        </svg>
      </button>
      <button class="control-btn-win maximize" @click="handleMaximize" title="Maximize">
        <svg width="10" height="10" viewBox="0 0 10 10">
          <rect x="0" y="0" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1"/>
        </svg>
      </button>
      <button class="control-btn-win close" @click="handleClose" title="Close">
        <svg width="10" height="10" viewBox="0 0 10 10">
          <path d="M0,0 L10,10 M10,0 L0,10" stroke="currentColor" stroke-width="1"/>
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.tab-bar {
  display: flex;
  align-items: center;
  height: 40px;
  background: #1e1e1e;
  border-bottom: 1px solid #333;
  padding: 0 12px 0 8px;
  user-select: none;
  gap: 12px;
  border-radius: 10px 10px 0 0;
  transition: background 0.3s, border-color 0.3s;
}

.tab-bar.light-theme {
  background: #f3f3f3;
  border-bottom: 1px solid #d4d4d4;
}

.window-controls {
  display: flex;
  -webkit-app-region: no-drag;
  app-region: no-drag;
}

/* macOS style controls */
.window-controls.macos {
  gap: 8px;
  padding: 0 4px;
}

.control-btn {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: none;
  cursor: pointer;
  transition: all 0.15s;
  position: relative;
}

.control-btn::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  opacity: 0;
  transition: opacity 0.15s;
}

.window-controls.macos:hover .control-btn::before {
  opacity: 1;
}

.control-btn.close {
  background: #ff5f56;
}

.control-btn.close::before {
  content: '×';
  font-size: 10px;
  color: #4d0000;
  font-weight: bold;
}

.control-btn.minimize {
  background: #ffbd2e;
}

.control-btn.minimize::before {
  content: '−';
  font-size: 10px;
  color: #995700;
  font-weight: bold;
}

.control-btn.maximize {
  background: #27c93f;
}

.control-btn.maximize::before {
  content: '+';
  font-size: 10px;
  color: #006400;
  font-weight: bold;
  line-height: 1;
}

/* Windows/Linux style controls */
.window-controls.windows-linux {
  gap: 0;
}

.control-btn-win {
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

.control-btn-win:hover {
  background: #3e3e42;
}

.control-btn-win.close:hover {
  background: #e81123;
  color: white;
}

.control-btn-win svg {
  width: 10px;
  height: 10px;
}

.tab-list {
  display: flex;
  gap: 4px;
  overflow-x: auto;
  overflow-y: hidden;
  flex-shrink: 1;
  min-width: 0;
  -webkit-app-region: no-drag;
  app-region: no-drag;
}

.drag-spacer {
  flex: 1;
  min-width: 60px;
  height: 40px;
  cursor: grab;
  position: relative;
  /* Combine both methods for compatibility */
  -webkit-app-region: drag;
  app-region: drag;
}

.drag-spacer:active {
  cursor: grabbing;
}

/* Visual hint for drag area */
.drag-spacer::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 40px;
  height: 4px;
  background: linear-gradient(90deg,
    transparent 0%,
    rgba(255, 255, 255, 0.05) 20%,
    rgba(255, 255, 255, 0.1) 50%,
    rgba(255, 255, 255, 0.05) 80%,
    transparent 100%);
  border-radius: 2px;
  opacity: 0;
  transition: opacity 0.2s;
}

.drag-spacer:hover::after {
  opacity: 1;
}

.tab-list::-webkit-scrollbar {
  height: 0;
}

.tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: #2d2d30;
  border: 1px solid transparent;
  border-radius: 4px 4px 0 0;
  cursor: pointer;
  transition: all 0.15s;
  min-width: 120px;
  max-width: 200px;
  position: relative;
}

.light-theme .tab {
  background: #e8e8e8;
}

.tab:hover {
  background: #37373d;
}

.light-theme .tab:hover {
  background: #d8d8d8;
}

.tab.active {
  background: #1e1e1e;
  border-color: #007acc;
  border-bottom-color: #1e1e1e;
}

.light-theme .tab.active {
  background: #f3f3f3;
  border-color: #007acc;
  border-bottom-color: #f3f3f3;
}

.tab-number {
  font-size: 11px;
  color: #858585;
  font-weight: 500;
  min-width: 14px;
}

.tab.active .tab-number {
  color: #007acc;
}

.tab-title {
  flex: 1;
  font-size: 13px;
  color: #cccccc;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.light-theme .tab-title {
  color: #616161;
}

.tab.active .tab-title {
  color: #ffffff;
}

.light-theme .tab.active .tab-title {
  color: #000000;
}

.tab-title-input {
  flex: 1;
  background: #1e1e1e;
  border: 1px solid #007acc;
  color: #fff;
  padding: 2px 4px;
  font-size: 13px;
  border-radius: 2px;
  outline: none;
}

.tab-close {
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
}

.tab:hover .tab-close {
  opacity: 1;
}

.tab-close:hover {
  background: #e81123;
  color: white;
}

.new-tab-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: #2d2d30;
  border: 1px solid transparent;
  border-radius: 4px;
  color: #cccccc;
  cursor: pointer;
  font-size: 20px;
  transition: all 0.15s;
  -webkit-app-region: no-drag;
  app-region: no-drag;
}

.light-theme .new-tab-btn {
  background: #e8e8e8;
  color: #616161;
}

.new-tab-btn:hover {
  background: #37373d;
  border-color: #007acc;
  color: #ffffff;
}

.light-theme .new-tab-btn:hover {
  background: #d8d8d8;
  border-color: #007acc;
  color: #000000;
}

.new-tab-btn:active {
  background: #007acc;
}

.speech-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: #2d2d30;
  border: 1px solid transparent;
  border-radius: 4px;
  color: #cccccc;
  cursor: pointer;
  transition: all 0.15s;
  -webkit-app-region: no-drag;
  app-region: no-drag;
  position: relative;
}

.light-theme .speech-btn {
  background: #e8e8e8;
  color: #616161;
}

.speech-btn:hover {
  background: #37373d;
  border-color: #007acc;
  color: #ffffff;
}

.light-theme .speech-btn:hover {
  background: #d8d8d8;
  border-color: #007acc;
  color: #000000;
}

.speech-btn:active {
  background: #007acc;
}

.speech-btn.active {
  background: #007acc;
  border-color: #0078d4;
  color: #ffffff;
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% {
    box-shadow: 0 0 0 0 rgba(0, 122, 204, 0.7);
  }
  50% {
    box-shadow: 0 0 0 4px rgba(0, 122, 204, 0);
  }
}

.speech-btn.active::after {
  content: '';
  position: absolute;
  top: -2px;
  right: -2px;
  width: 8px;
  height: 8px;
  background: #ff4444;
  border-radius: 50%;
  border: 2px solid #1e1e1e;
}

.settings-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: #2d2d30;
  border: 1px solid transparent;
  border-radius: 4px;
  color: #cccccc;
  cursor: pointer;
  font-size: 18px;
  transition: all 0.15s;
  -webkit-app-region: no-drag;
  app-region: no-drag;
}

.light-theme .settings-btn {
  background: #e8e8e8;
  color: #616161;
}

.settings-btn:hover {
  background: #37373d;
  border-color: #007acc;
  color: #ffffff;
}

.light-theme .settings-btn:hover {
  background: #d8d8d8;
  border-color: #007acc;
  color: #000000;
}

.settings-btn:active {
  background: #007acc;
}
</style>
