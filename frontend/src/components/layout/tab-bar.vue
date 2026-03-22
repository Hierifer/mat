<script setup lang="ts">
import { ref } from 'vue'
import { useTerminalStore } from '@/stores/terminal-store'
import { getCurrentWindow } from '@tauri-apps/api/window'

const store = useTerminalStore()

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
  <div class="tab-bar">
    <!-- Window control buttons (macOS style) -->
    <div class="window-controls">
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

    <button class="new-tab-btn" @click="handleNewTab" title="New tab">
      +
    </button>
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
  -webkit-app-region: drag;
}

.window-controls {
  display: flex;
  gap: 8px;
  padding: 0 4px;
  -webkit-app-region: no-drag;
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

.window-controls:hover .control-btn::before {
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

.tab-list {
  display: flex;
  flex: 1;
  gap: 4px;
  overflow-x: auto;
  overflow-y: hidden;
  -webkit-app-region: no-drag;
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
  -webkit-app-region: no-drag;
}

.tab:hover {
  background: #37373d;
}

.tab.active {
  background: #1e1e1e;
  border-color: #007acc;
  border-bottom-color: #1e1e1e;
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

.tab.active .tab-title {
  color: #ffffff;
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
}

.new-tab-btn:hover {
  background: #37373d;
  border-color: #007acc;
  color: #ffffff;
}

.new-tab-btn:active {
  background: #007acc;
}
</style>
