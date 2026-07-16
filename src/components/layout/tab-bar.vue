<script setup lang="ts">
import { ref, inject, computed, watch, onMounted, onUnmounted, type Ref } from 'vue'
import { useTerminalStore } from '@/stores/terminal-store'
import { useClaudeStatus } from '@/composables/use-claude-status'
import { useNotification } from '@/composables/use-notification'
import { usePlatform } from '@/composables/use-platform'
import { useTts } from '@/composables/use-tts'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { useI18n } from 'vue-i18n'
import IconFont from '@/components/ui/icon-font.vue'

const store = useTerminalStore()
const { t } = useI18n()
const claudeStatus = useClaudeStatus()
const { notifyTaskComplete } = useNotification()
const { speak } = useTts()

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

// Play a short pleasant notification tone via Web Audio API
function playNotificationSound() {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, ctx.currentTime)       // A5
    osc.frequency.setValueAtTime(1174.66, ctx.currentTime + 0.1) // D6
    gain.gain.setValueAtTime(0.3, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3)

    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.3)
    osc.onended = () => ctx.close()
  } catch {
    // Audio not available — silently ignore
  }
}

// Watch for Claude task completion (isRunning: true → false)
watch(
  () => claudeStatus.isRunning.value,
  (running, wasRunning) => {
    if (wasRunning && !running) {
      const sid = claudeStatus.sessionId.value
      if (!sid) return
      const tabId = store.findTabBySessionId(sid)
      if (!tabId) return

      // Don't show red dot on the currently active tab
      if (tabId !== store.activeTabId) {
        store.addTabNotification(tabId)
      }

      // Voice announcement replaces notification sound when enabled
      if (store.enableVoiceAnnouncements) {
        speak('任务已完成')
      } else {
        playNotificationSound()
      }

      // Send macOS system notification when app is in background
      if (store.enableCommandNotifications && !document.hasFocus()) {
        const tab = store.tabs.find(t => t.id === tabId)
        notifyTaskComplete('Claude Code 任务完成', `${tab?.title || 'Terminal'} 中的任务已完成`)
      }
    }
  },
)

// Watch for Claude waiting for input (false → true)
watch(
  () => claudeStatus.isWaitingForInput.value,
  (waiting, wasWaiting) => {
    if (waiting && !wasWaiting) {
      speak('Claude 有问题需要确认')
    }
  },
)

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
  store.clearTabNotification(tabId)
  store.setActiveTab(tabId)
}

const handleNewTab = () => {
  store.createTab()
}

// Layout preset dropdown
const showLayoutMenu = ref(false)

const toggleLayoutMenu = () => {
  showLayoutMenu.value = !showLayoutMenu.value
}

const applyPreset = (preset: 'dual' | 'quad' | 'triple') => {
  store.createTabWithPresetLayout(preset)
  showLayoutMenu.value = false
}

// Close menu on outside click
const onDocumentClick = (e: MouseEvent) => {
  const wrapper = document.querySelector('.layout-preset-wrapper')
  if (wrapper && !wrapper.contains(e.target as Node)) {
    showLayoutMenu.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', onDocumentClick)
})

onUnmounted(() => {
  document.removeEventListener('click', onDocumentClick)
})

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
    store.updateTabTitle(editingTabId.value, editingTitle.value.trim(), true)
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
  <div
    class="tab-bar"
    :class="{ 'light-theme': isLightTheme }"
    :style="{ '--tab-active-bg': store.currentTheme.background }"
  >
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
          <icon-font name="close" :size="10" />
        </button>

        <span
          v-if="store.tabNotifications.includes(tab.id)"
          class="notification-dot"
        ></span>
      </div>
    </div>

    <button class="new-tab-btn" @click="handleNewTab" title="New tab">
      <icon-font name="plus" :size="14" />
    </button>

    <!-- Layout preset dropdown -->
    <div class="layout-preset-wrapper">
      <button class="new-tab-btn" @click="toggleLayoutMenu" :title="t('layout.presets')">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <rect x="1" y="1" width="6" height="14" rx="1" stroke="currentColor" stroke-width="1.2" fill="none"/>
          <rect x="9" y="1" width="6" height="14" rx="1" stroke="currentColor" stroke-width="1.2" fill="none"/>
        </svg>
      </button>
      <div v-if="showLayoutMenu" class="layout-menu">
        <button class="layout-menu-item" @click="applyPreset('dual')">
          <svg width="24" height="16" viewBox="0 0 24 16" fill="none">
            <rect x="1" y="1" width="10" height="14" rx="1" stroke="currentColor" stroke-width="1.2" fill="none"/>
            <rect x="13" y="1" width="10" height="14" rx="1" stroke="currentColor" stroke-width="1.2" fill="none"/>
          </svg>
          <span>{{ t('layout.dual') }}</span>
        </button>
        <button class="layout-menu-item" @click="applyPreset('triple')">
          <svg width="24" height="16" viewBox="0 0 24 16" fill="none">
            <rect x="1" y="1" width="6" height="14" rx="1" stroke="currentColor" stroke-width="1.2" fill="none"/>
            <rect x="9" y="1" width="6" height="14" rx="1" stroke="currentColor" stroke-width="1.2" fill="none"/>
            <rect x="17" y="1" width="6" height="14" rx="1" stroke="currentColor" stroke-width="1.2" fill="none"/>
          </svg>
          <span>{{ t('layout.triple') }}</span>
        </button>
        <button class="layout-menu-item" @click="applyPreset('quad')">
          <svg width="24" height="16" viewBox="0 0 24 16" fill="none">
            <rect x="1" y="1" width="10" height="6" rx="1" stroke="currentColor" stroke-width="1.2" fill="none"/>
            <rect x="13" y="1" width="10" height="6" rx="1" stroke="currentColor" stroke-width="1.2" fill="none"/>
            <rect x="1" y="9" width="10" height="6" rx="1" stroke="currentColor" stroke-width="1.2" fill="none"/>
            <rect x="13" y="9" width="10" height="6" rx="1" stroke="currentColor" stroke-width="1.2" fill="none"/>
          </svg>
          <span>{{ t('layout.quad') }}</span>
        </button>
      </div>
    </div>

    <!-- Draggable spacer -->
    <div class="drag-spacer" data-tauri-drag-region></div>

    <button
      v-if="speechRecognition"
      class="speech-btn"
      :class="{ active: speechRecognition.isListening.value }"
      @click="speechRecognition.toggleSpeech"
      title="Voice input (Ctrl+Shift+V)"
    >
      <icon-font name="microphone" :size="16" />
    </button>

    <!-- Toggle to studio mode -->
    <button class="layout-btn" @click="store.toggleDisplayMode()" :title="t('studio.title')">
      <icon-font name="layout" :size="15" />
    </button>

    <button class="settings-btn" @click="store.toggleSettings" title="Settings">
      <icon-font name="setting" :size="16" />
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
  background: #141415;
  padding: 0 12px 0 8px;
  user-select: none;
  gap: 12px;
  border-radius: 10px 10px 0 0;
  transition: background 0.3s, border-color 0.3s;
}

.tab-bar.light-theme {
  background: #dee1e6;
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
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
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
  font-weight: 500;
}

.control-btn.minimize {
  background: #ffbd2e;
}

.control-btn.minimize::before {
  content: '−';
  font-size: 10px;
  color: #995700;
  font-weight: 500;
}

.control-btn.maximize {
  background: #27c93f;
}

.control-btn.maximize::before {
  content: '+';
  font-size: 10px;
  color: #006400;
  font-weight: 500;
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
  align-self: flex-end;
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
  height: 34px;
  padding: 0 12px;
  background: transparent;
  border: none;
  border-radius: 8px 8px 0 0;
  cursor: pointer;
  transition: background 0.15s;
  min-width: 120px;
  max-width: 200px;
  position: relative;
}

.tab:hover {
  background: rgba(255, 255, 255, 0.07);
}

.light-theme .tab:hover {
  background: rgba(0, 0, 0, 0.06);
}

.tab.active {
  background: var(--tab-active-bg, #1e1e1e);
}

.light-theme .tab.active {
  background: var(--tab-active-bg, #ffffff);
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
  background: #007acc;
  color: #ffffff;
}

.light-theme .new-tab-btn:hover {
  background: #007acc;
  color: #ffffff;
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
  background: #007acc;
  color: #ffffff;
}

.light-theme .speech-btn:hover {
  background: #007acc;
  color: #ffffff;
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

.layout-btn {
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
}

.light-theme .layout-btn {
  background: #e8e8e8;
  color: #616161;
}

.layout-btn:hover {
  background: #007acc;
  color: #ffffff;
}

.light-theme .layout-btn:hover {
  background: #007acc;
  color: #ffffff;
}

.layout-btn:active {
  background: #007acc;
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
  transition: all 0.15s;
  -webkit-app-region: no-drag;
  app-region: no-drag;
}

.light-theme .settings-btn {
  background: #e8e8e8;
  color: #616161;
}

.settings-btn:hover {
  background: #007acc;
  color: #ffffff;
}

.light-theme .settings-btn:hover {
  background: #007acc;
  color: #ffffff;
}

.settings-btn:active {
  background: #007acc;
}

/* Layout Preset Dropdown */
.layout-preset-wrapper {
  position: relative;
  -webkit-app-region: no-drag;
  app-region: no-drag;
}

.layout-menu {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 4px;
  background: #2d2d30;
  border: 1px solid #454545;
  border-radius: 6px;
  padding: 4px;
  z-index: 1000;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  min-width: 160px;
}

.light-theme .layout-menu {
  background: #f3f3f3;
  border-color: #d4d4d4;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.layout-menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 12px;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: #cccccc;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s;
  white-space: nowrap;
}

.light-theme .layout-menu-item {
  color: #333333;
}

.layout-menu-item:hover {
  background: #37373d;
}

.light-theme .layout-menu-item:hover {
  background: #e0e0e0;
}

.layout-menu-item svg {
  flex-shrink: 0;
}

/* Notification dot (breathing red dot) */
.notification-dot {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 8px;
  height: 8px;
  background: #ff4444;
  border-radius: 50%;
  animation: breathe 2s ease-in-out infinite;
  pointer-events: none;
}

.light-theme .notification-dot {
  background: #e53935;
}

@keyframes breathe {
  0%, 100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.5;
    transform: scale(0.8);
  }
}
</style>
