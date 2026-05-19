<script setup lang="ts">
import { ref, computed, inject, type Ref } from 'vue'
import { useTerminalStore } from '@/stores/terminal-store'
import { usePlatform } from '@/composables/use-platform'
import { getCurrentWindow } from '@tauri-apps/api/window'

const store = useTerminalStore()
const { isMacOS } = usePlatform()

// Inject speech recognition
const speechRecognition = inject<{
  isListening: Ref<boolean>
  toggleSpeech: () => void
}>('speechRecognition')

const isLightTheme = computed(() => {
  return store.currentThemeName.includes('Light')
})

// Window controls
const handleMinimize = async () => {
  try {
    // @ts-ignore
    if (window.__TAURI_INTERNALS__) {
      await getCurrentWindow().minimize()
    }
  } catch (error) {
    console.error('Failed to minimize:', error)
  }
}

const handleMaximize = async () => {
  try {
    // @ts-ignore
    if (window.__TAURI_INTERNALS__) {
      await getCurrentWindow().toggleMaximize()
    }
  } catch (error) {
    console.error('Failed to maximize:', error)
  }
}

const handleClose = async () => {
  try {
    // @ts-ignore
    if (window.__TAURI_INTERNALS__) {
      await getCurrentWindow().close()
    }
  } catch (error) {
    console.error('Failed to close:', error)
  }
}

// Session management
const editingTabId = ref<string | null>(null)
const editingTitle = ref('')

const handleSessionClick = (tabId: string) => {
  store.setActiveTab(tabId)
}

const handleCloseSession = (tabId: string, event: Event) => {
  event.stopPropagation()
  store.closeTab(tabId)
}

const handleNewSession = () => {
  store.createTab()
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
  <div class="conversation-sidebar" :class="{ 'light-theme': isLightTheme }">
    <!-- Header with window controls -->
    <div class="sidebar-header">
      <div v-if="isMacOS()" class="window-controls">
        <button class="control-btn close" @click="handleClose"></button>
        <button class="control-btn minimize" @click="handleMinimize"></button>
        <button class="control-btn maximize" @click="handleMaximize"></button>
      </div>
      <div class="header-drag" data-tauri-drag-region></div>
    </div>

    <!-- Session list -->
    <div class="session-list">
      <div
        v-for="(tab, index) in store.tabs"
        :key="tab.id"
        class="session-item"
        :class="{ active: tab.id === store.activeTabId }"
        @click="handleSessionClick(tab.id)"
      >
        <span class="session-number">{{ index + 1 }}</span>

        <input
          v-if="editingTabId === tab.id"
          v-model="editingTitle"
          class="session-title-input"
          @blur="finishEditing"
          @keydown="handleKeydown"
          @click.stop
          autofocus
        />
        <div v-else class="session-info" @dblclick="startEditing(tab.id, tab.title, $event)">
          <span class="session-title">{{ tab.title }}</span>
        </div>

        <button
          v-if="store.tabs.length > 1"
          class="session-close"
          @click="handleCloseSession(tab.id, $event)"
        >&times;</button>
      </div>
    </div>

    <!-- Footer -->
    <div class="sidebar-footer">
      <button class="footer-btn" @click="handleNewSession" title="New Session">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M7 1V13M1 7H13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </button>

      <button
        v-if="speechRecognition"
        class="footer-btn"
        :class="{ active: speechRecognition.isListening.value }"
        @click="speechRecognition.toggleSpeech"
        title="Voice input"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path d="M8 1C7.17 1 6.5 1.67 6.5 2.5V8C6.5 8.83 7.17 9.5 8 9.5C8.83 9.5 9.5 8.83 9.5 8V2.5C9.5 1.67 8.83 1 8 1Z" fill="currentColor"/>
          <path d="M11 8C11 9.66 9.66 11 8 11C6.34 11 5 9.66 5 8H3.5C3.5 10.07 5.07 11.75 7 12.09V14H9V12.09C10.93 11.75 12.5 10.07 12.5 8H11Z" fill="currentColor"/>
        </svg>
      </button>

      <!-- Toggle to tabs mode -->
      <button class="footer-btn" @click="store.toggleDisplayMode()" title="Switch to tabs mode">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <rect x="1" y="1" width="12" height="3" rx="0.5" stroke="currentColor" stroke-width="1"/>
          <rect x="1" y="5" width="12" height="8" rx="0.5" stroke="currentColor" stroke-width="1"/>
        </svg>
      </button>

      <button class="footer-btn" @click="store.toggleSettings" title="Settings">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <circle cx="7" cy="7" r="2" stroke="currentColor" stroke-width="1.2"/>
          <path d="M7 1V3M7 11V13M1 7H3M11 7H13M2.76 2.76L4.17 4.17M9.83 9.83L11.24 11.24M11.24 2.76L9.83 4.17M4.17 9.83L2.76 11.24" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.conversation-sidebar {
  display: flex;
  flex-direction: column;
  width: 240px;
  min-width: 180px;
  max-width: 400px;
  background: #1e1e1e;
  border-right: 1px solid #333;
  user-select: none;
  border-radius: 10px 0 0 0;
  transition: background 0.3s, border-color 0.3s;
}

.conversation-sidebar.light-theme {
  background: #f3f3f3;
  border-right-color: #d4d4d4;
}

/* Header */
.sidebar-header {
  display: flex;
  align-items: center;
  height: 40px;
  padding: 0 12px;
  gap: 8px;
  flex-shrink: 0;
}

.window-controls {
  display: flex;
  gap: 8px;
  -webkit-app-region: no-drag;
  app-region: no-drag;
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

.sidebar-header:hover .control-btn::before {
  opacity: 1;
}

.control-btn.close { background: #ff5f56; }
.control-btn.close::before { content: '\00d7'; font-size: 10px; color: #4d0000; font-weight: bold; }
.control-btn.minimize { background: #ffbd2e; }
.control-btn.minimize::before { content: '\2212'; font-size: 10px; color: #995700; font-weight: bold; }
.control-btn.maximize { background: #27c93f; }
.control-btn.maximize::before { content: '+'; font-size: 10px; color: #006400; font-weight: bold; }

.header-drag {
  flex: 1;
  height: 40px;
  -webkit-app-region: drag;
  app-region: drag;
}

/* Session list */
.session-list {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 4px 0;
}

.session-list::-webkit-scrollbar {
  width: 4px;
}

.session-list::-webkit-scrollbar-track {
  background: transparent;
}

.session-list::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 2px;
}

.light-theme .session-list::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.15);
}

.session-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  cursor: pointer;
  transition: background 0.15s;
  border-left: 3px solid transparent;
  position: relative;
}

.session-item:hover {
  background: #2a2d2e;
}

.light-theme .session-item:hover {
  background: #e8e8e8;
}

.session-item.active {
  background: #37373d;
  border-left-color: #007acc;
}

.light-theme .session-item.active {
  background: #e0e0e0;
  border-left-color: #007acc;
}

.session-number {
  font-size: 11px;
  color: #666;
  min-width: 16px;
  text-align: center;
  flex-shrink: 0;
}

.session-item.active .session-number {
  color: #007acc;
}

.session-info {
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.session-title {
  display: block;
  font-size: 13px;
  color: #ccc;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.light-theme .session-title {
  color: #333;
}

.session-item.active .session-title {
  color: #fff;
  font-weight: 500;
}

.light-theme .session-item.active .session-title {
  color: #000;
  font-weight: 500;
}

.session-title-input {
  flex: 1;
  background: #1e1e1e;
  border: 1px solid #007acc;
  color: #fff;
  padding: 2px 6px;
  font-size: 13px;
  border-radius: 3px;
  outline: none;
  width: 100%;
}

.session-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  background: transparent;
  border: none;
  border-radius: 3px;
  color: #666;
  cursor: pointer;
  font-size: 16px;
  padding: 0;
  transition: all 0.15s;
  opacity: 0;
  flex-shrink: 0;
}

.session-item:hover .session-close {
  opacity: 1;
}

.session-close:hover {
  background: #e81123;
  color: white;
}

/* Footer */
.sidebar-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 8px 12px;
  border-top: 1px solid #333;
  flex-shrink: 0;
}

.light-theme .sidebar-footer {
  border-top-color: #d4d4d4;
}

.footer-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 4px;
  color: #999;
  cursor: pointer;
  transition: all 0.15s;
}

.light-theme .footer-btn {
  color: #666;
}

.footer-btn:hover {
  background: #37373d;
  border-color: #555;
  color: #fff;
}

.light-theme .footer-btn:hover {
  background: #e0e0e0;
  border-color: #ccc;
  color: #000;
}

.footer-btn.active {
  background: #007acc;
  border-color: #0078d4;
  color: #fff;
}
</style>
