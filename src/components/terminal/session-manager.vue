<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useTerminalStore, type TmuxSessionInfo } from '@/stores/terminal-store'
import { useI18n } from 'vue-i18n'

const store = useTerminalStore()
const { t } = useI18n()

const sessions = ref<TmuxSessionInfo[]>([])
const selectedSessionIndex = ref(0)
const isRenaming = ref(false)
const renameSessionName = ref('')
const newSessionName = ref('')

// Determine if current theme is light
const isLightTheme = computed(() => {
  return store.currentThemeName.includes('Light')
})

// Dynamic colors based on theme
const themeColors = computed(() => {
  if (isLightTheme.value) {
    return {
      overlay: 'rgba(0, 0, 0, 0.3)',
      modalBg: '#ffffff',
      modalBorder: '#e0e0e0',
      headerBg: '#f5f5f5',
      headerColor: '#000000',
      textColor: '#333333',
      mutedColor: '#666666',
      borderColor: '#e0e0e0',
      sessionBg: '#f8f8f8',
      sessionHoverBg: '#eeeeee',
      sessionActiveBg: '#e3e3e3',
      buttonBg: '#f0f0f0',
      buttonBorder: '#cccccc',
      buttonColor: '#333333',
      buttonHoverBg: '#e8e8e8',
      dangerBg: '#fee',
      dangerBorder: '#fcc',
      dangerColor: '#c00',
      inputBg: '#ffffff',
      inputBorder: '#cccccc',
      inputColor: '#333333',
    }
  } else {
    return {
      overlay: 'rgba(0, 0, 0, 0.5)',
      modalBg: '#252526',
      modalBorder: '#3e3e42',
      headerBg: '#1e1e1e',
      headerColor: '#ffffff',
      textColor: '#cccccc',
      mutedColor: '#999999',
      borderColor: '#3e3e42',
      sessionBg: '#2d2d30',
      sessionHoverBg: '#3e3e42',
      sessionActiveBg: '#37373d',
      buttonBg: '#3c3c3c',
      buttonBorder: '#555',
      buttonColor: '#e7e7e7',
      buttonHoverBg: '#454545',
      dangerBg: '#3c1f1f',
      dangerBorder: '#6b2c2c',
      dangerColor: '#f48771',
      inputBg: '#3c3c3c',
      inputBorder: '#555',
      inputColor: '#e7e7e7',
    }
  }
})

onMounted(async () => {
  await loadSessions()
})

async function loadSessions() {
  await store.loadTmuxSessions()
  sessions.value = store.tmuxSessions
}

function close() {
  store.toggleSessionManager()
}

async function attachSession(sessionName: string) {
  await store.attachToTmuxSession(sessionName)
  close()
}

async function newSession() {
  if (!newSessionName.value.trim()) return

  await store.createTabWithTmux(newSessionName.value.trim())
  newSessionName.value = ''
  await loadSessions()
}

async function deleteSession(sessionName: string) {
  const confirmed = confirm(t('sessionManager.confirmDelete', { name: sessionName }))
  if (!confirmed) return

  await store.killTmuxSession(sessionName)
  await loadSessions()
}

function startRename(sessionName: string) {
  renameSessionName.value = sessionName
  isRenaming.value = true
}

async function confirmRename() {
  if (!renameSessionName.value.trim() || !isRenaming.value) return

  const oldName = sessions.value[selectedSessionIndex.value]?.name
  if (!oldName) return

  await store.renameTmuxSession(oldName, renameSessionName.value.trim())
  isRenaming.value = false
  renameSessionName.value = ''
  await loadSessions()
}

function cancelRename() {
  isRenaming.value = false
  renameSessionName.value = ''
}

// Keyboard navigation
function handleKeyDown(event: KeyboardEvent) {
  if (isRenaming.value) {
    if (event.key === 'Enter') {
      confirmRename()
    } else if (event.key === 'Escape') {
      cancelRename()
    }
    return
  }

  switch (event.key) {
    case 'ArrowUp':
      event.preventDefault()
      if (selectedSessionIndex.value > 0) {
        selectedSessionIndex.value--
      }
      break
    case 'ArrowDown':
      event.preventDefault()
      if (selectedSessionIndex.value < sessions.value.length - 1) {
        selectedSessionIndex.value++
      }
      break
    case 'Enter':
      event.preventDefault()
      if (sessions.value[selectedSessionIndex.value]) {
        attachSession(sessions.value[selectedSessionIndex.value].name)
      }
      break
    case 'Delete':
    case 'Backspace':
      event.preventDefault()
      if (sessions.value[selectedSessionIndex.value]) {
        deleteSession(sessions.value[selectedSessionIndex.value].name)
      }
      break
    case 'Escape':
      event.preventDefault()
      close()
      break
  }
}

// Format timestamp
function formatTimestamp(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp * 1000 // timestamp is in seconds
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return t('common.justNow', 'Just now')
  if (minutes < 60) return t('common.minutesAgo', { minutes }, `${minutes}m ago`)
  if (hours < 24) return t('common.hoursAgo', { hours }, `${hours}h ago`)
  return t('common.daysAgo', { days }, `${days}d ago`)
}
</script>

<template>
  <div
    class="session-manager-overlay"
    :style="{ background: themeColors.overlay }"
    @click.self="close"
    @keydown="handleKeyDown"
    tabindex="0"
  >
    <div
      class="session-manager-modal"
      :style="{
        background: themeColors.modalBg,
        borderColor: themeColors.modalBorder,
      }"
    >
      <!-- Header -->
      <div class="header" :style="{ background: themeColors.headerBg, borderBottomColor: themeColors.borderColor }">
        <h2 :style="{ color: themeColors.headerColor }">{{ $t('sessionManager.title') }}</h2>
        <button
          class="close-btn"
          :style="{ color: themeColors.mutedColor }"
          @click="close"
        >
          ✕
        </button>
      </div>

      <!-- Session List -->
      <div class="session-list">
        <div v-if="sessions.length === 0" class="empty-state" :style="{ color: themeColors.mutedColor }">
          {{ $t('sessionManager.noSessions', 'No tmux sessions found') }}
        </div>

        <div
          v-for="(session, index) in sessions"
          :key="session.name"
          class="session-item"
          :class="{ active: index === selectedSessionIndex }"
          :style="{
            background: index === selectedSessionIndex ? themeColors.sessionActiveBg : themeColors.sessionBg,
            borderColor: themeColors.borderColor,
          }"
          @click="selectedSessionIndex = index"
          @dblclick="attachSession(session.name)"
        >
          <div class="session-info">
            <div class="session-name" :style="{ color: themeColors.textColor }">
              <span class="status-dot" :class="{ attached: session.attached }"></span>
              {{ session.name }}
            </div>
            <div class="session-meta" :style="{ color: themeColors.mutedColor }">
              {{ session.windows }} {{ $t('sessionManager.windows', 'window(s)') }} •
              {{ formatTimestamp(session.created) }}
            </div>
          </div>

          <div class="session-actions">
            <button
              v-if="session.attached"
              class="action-btn"
              :style="{ color: themeColors.buttonColor, background: themeColors.buttonBg, borderColor: themeColors.buttonBorder }"
              @click.stop="attachSession(session.name)"
            >
              {{ $t('sessionManager.detach', 'Detach') }}
            </button>
            <button
              v-else
              class="action-btn"
              :style="{ color: themeColors.buttonColor, background: themeColors.buttonBg, borderColor: themeColors.buttonBorder }"
              @click.stop="attachSession(session.name)"
            >
              {{ $t('sessionManager.attach') }}
            </button>
            <button
              class="action-btn"
              :style="{ color: themeColors.buttonColor, background: themeColors.buttonBg, borderColor: themeColors.buttonBorder }"
              @click.stop="startRename(session.name)"
            >
              {{ $t('sessionManager.rename') }}
            </button>
            <button
              class="action-btn danger"
              :style="{ color: themeColors.dangerColor, background: themeColors.dangerBg, borderColor: themeColors.dangerBorder }"
              @click.stop="deleteSession(session.name)"
            >
              {{ $t('sessionManager.delete') }}
            </button>
          </div>
        </div>
      </div>

      <!-- Rename Dialog -->
      <div v-if="isRenaming" class="rename-dialog" :style="{ background: themeColors.headerBg, borderTopColor: themeColors.borderColor }">
        <input
          v-model="renameSessionName"
          class="rename-input"
          :style="{
            background: themeColors.inputBg,
            borderColor: themeColors.inputBorder,
            color: themeColors.inputColor,
          }"
          :placeholder="$t('sessionManager.newSessionName', 'New session name')"
          @keydown.enter="confirmRename"
          @keydown.esc="cancelRename"
        />
        <button
          class="action-btn"
          :style="{ color: themeColors.buttonColor, background: themeColors.buttonBg, borderColor: themeColors.buttonBorder }"
          @click="confirmRename"
        >
          {{ $t('common.confirm', 'Confirm') }}
        </button>
        <button
          class="action-btn"
          :style="{ color: themeColors.buttonColor, background: themeColors.buttonBg, borderColor: themeColors.buttonBorder }"
          @click="cancelRename"
        >
          {{ $t('common.cancel', 'Cancel') }}
        </button>
      </div>

      <!-- Footer -->
      <div class="footer" :style="{ background: themeColors.headerBg, borderTopColor: themeColors.borderColor }">
        <div class="new-session-form">
          <input
            v-model="newSessionName"
            class="new-session-input"
            :style="{
              background: themeColors.inputBg,
              borderColor: themeColors.inputBorder,
              color: themeColors.inputColor,
            }"
            :placeholder="$t('sessionManager.newSessionPlaceholder', 'Session name...')"
            @keydown.enter="newSession"
          />
          <button
            class="action-btn primary"
            :style="{ color: '#fff', background: '#0078d4', borderColor: '#0078d4' }"
            @click="newSession"
          >
            {{ $t('sessionManager.newSession') }}
          </button>
        </div>
        <div class="footer-actions">
          <button
            class="action-btn"
            :style="{ color: themeColors.buttonColor, background: themeColors.buttonBg, borderColor: themeColors.buttonBorder }"
            @click="loadSessions"
          >
            {{ $t('sessionManager.refresh', 'Refresh') }}
          </button>
          <button
            class="action-btn"
            :style="{ color: themeColors.buttonColor, background: themeColors.buttonBg, borderColor: themeColors.buttonBorder }"
            @click="close"
          >
            {{ $t('common.close', 'Close') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.session-manager-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 2000;
  backdrop-filter: blur(2px);
  transition: background 0.3s;
}

.session-manager-modal {
  width: 700px;
  max-height: 600px;
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  display: flex;
  flex-direction: column;
  border: 1px solid;
  transition: background 0.3s, border-color 0.3s;
}

.header {
  padding: 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid;
  transition: background 0.3s, border-color 0.3s;
}

.header h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  transition: color 0.3s;
}

.close-btn {
  background: none;
  border: none;
  font-size: 20px;
  cursor: pointer;
  line-height: 1;
  transition: color 0.2s;
}

.close-btn:hover {
  opacity: 0.7;
}

.session-list {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.empty-state {
  text-align: center;
  padding: 40px 20px;
  font-size: 14px;
  transition: color 0.3s;
}

.session-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px;
  margin-bottom: 10px;
  border-radius: 6px;
  border: 1px solid;
  cursor: pointer;
  transition: all 0.2s;
}

.session-item:hover {
  transform: translateY(-2px);
  opacity: 0.9;
}

.session-item.active {
  box-shadow: 0 0 0 2px #0078d4;
}

.session-info {
  flex: 1;
}

.session-name {
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 5px;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: color 0.3s;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #666;
}

.status-dot.attached {
  background: #0078d4;
}

.session-meta {
  font-size: 12px;
  transition: color 0.3s;
}

.session-actions {
  display: flex;
  gap: 8px;
}

.action-btn {
  padding: 6px 12px;
  font-size: 12px;
  border: 1px solid;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.action-btn:hover {
  opacity: 0.9;
  transform: translateY(-1px);
}

.action-btn.danger:hover {
  opacity: 0.9;
}

.action-btn.primary {
  font-weight: 500;
}

.rename-dialog {
  padding: 15px 20px;
  display: flex;
  gap: 10px;
  align-items: center;
  border-top: 1px solid;
  transition: background 0.3s, border-color 0.3s;
}

.rename-input {
  flex: 1;
  padding: 8px 12px;
  font-size: 14px;
  border: 1px solid;
  border-radius: 4px;
  outline: none;
  transition: all 0.2s;
}

.rename-input:focus {
  border-color: #0078d4;
}

.footer {
  padding: 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-top: 1px solid;
  transition: background 0.3s, border-color 0.3s;
}

.new-session-form {
  display: flex;
  gap: 10px;
  flex: 1;
  margin-right: 20px;
}

.new-session-input {
  flex: 1;
  padding: 8px 12px;
  font-size: 14px;
  border: 1px solid;
  border-radius: 4px;
  outline: none;
  transition: all 0.2s;
}

.new-session-input:focus {
  border-color: #0078d4;
}

.footer-actions {
  display: flex;
  gap: 10px;
}
</style>
