<script setup lang="ts">
import { computed, ref, nextTick, watch } from 'vue'
import { useTerminalStore } from '@/stores/terminal-store'
import { usePtySession } from '@/composables/use-pty-session'

const props = defineProps<{
  paneId: string
  sessionId: string
  cwd?: string
}>()

const store = useTerminalStore()
const { write } = usePtySession(props.sessionId)

const isActive = computed(() => store.activePaneId === props.paneId)

// Determine if current theme is light
const isLightTheme = computed(() => {
  return store.currentThemeName.includes('Light')
})
const isEditing = ref(false)
const editingCwd = ref(props.cwd || '~')
const cwdInput = ref<HTMLInputElement | null>(null)

// Watch for editing state changes to focus input
watch(isEditing, async (newVal) => {
  if (newVal) {
    await nextTick()
    cwdInput.value?.focus()
    cwdInput.value?.select()
  }
})

// Watch for cwd prop changes
watch(() => props.cwd, (newCwd) => {
  if (!isEditing.value) {
    editingCwd.value = newCwd || '~'
  }
})

const handleSplitHorizontal = () => {
  store.splitPane(props.paneId, 'horizontal')
}

const handleSplitVertical = () => {
  store.splitPane(props.paneId, 'vertical')
}

const handleClose = () => {
  store.closePane(props.paneId)
}

const handlePaneClick = () => {
  store.setActivePane(props.paneId)
}

const startEditing = (e: Event) => {
  e.stopPropagation()
  isEditing.value = true
  editingCwd.value = props.cwd || '~'
}

const finishEditing = () => {
  if (isEditing.value && editingCwd.value !== props.cwd) {
    // Send cd command to terminal
    write(`cd ${editingCwd.value}\n`)
    // Update store
    store.updatePaneCwd(props.paneId, editingCwd.value)
  }
  isEditing.value = false
}

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Enter') {
    finishEditing()
  } else if (e.key === 'Escape') {
    editingCwd.value = props.cwd || '~'
    isEditing.value = false
  }
}
</script>

<template>
  <div class="pane-toolbar" :class="{ active: isActive, 'light-theme': isLightTheme }" @click="handlePaneClick">
    <div class="toolbar-title">
      <input
        v-if="isEditing"
        v-model="editingCwd"
        class="cwd-input"
        @blur="finishEditing"
        @keydown="handleKeydown"
        @click.stop
        ref="cwdInput"
      />
      <span v-else class="cwd-display" @dblclick="startEditing" :title="cwd">
        {{ cwd || '~' }}
      </span>
    </div>
    <div class="toolbar-actions">
      <button
        @click="handleSplitHorizontal"
        title="Split Horizontal"
        class="toolbar-btn"
      >
        ⬌
      </button>
      <button
        @click="handleSplitVertical"
        title="Split Vertical"
        class="toolbar-btn"
      >
        ⬍
      </button>
      <button
        @click="handleClose"
        title="Close Pane"
        class="toolbar-btn close-btn"
      >
        ✕
      </button>
    </div>
  </div>
</template>

<style scoped>
.pane-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 24px;
  background: #2d2d2d;
  border-bottom: 1px solid #444;
  border-top: 2px solid transparent;
  padding: 0 8px;
  font-size: 12px;
  font-family: monospace;
  color: #ccc;
  user-select: none;
  cursor: pointer;
  transition: all 0.15s;
}

.pane-toolbar.light-theme {
  background: #e8e8e8;
  border-bottom: 1px solid #d4d4d4;
  color: #616161;
}

.pane-toolbar.active {
  background: #3d3d3d;
  border-top-color: #007acc;
  border-bottom-color: #007acc;
}

.pane-toolbar.light-theme.active {
  background: #d8d8d8;
  border-top-color: #007acc;
  border-bottom-color: #007acc;
}

.toolbar-title {
  font-size: 11px;
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.cwd-display {
  opacity: 0.8;
  cursor: text;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: block;
  padding: 2px 4px;
  border-radius: 2px;
  transition: background 0.15s;
}

.cwd-display:hover {
  opacity: 1;
  background: rgba(255, 255, 255, 0.05);
}

.cwd-input {
  background: #1e1e1e;
  border: 1px solid #007acc;
  color: #fff;
  padding: 2px 4px;
  font-family: monospace;
  font-size: 11px;
  border-radius: 2px;
  outline: none;
  width: 100%;
  box-sizing: border-box;
}

.toolbar-actions {
  display: flex;
  gap: 2px;
}

.toolbar-btn {
  background: transparent;
  border: none;
  color: #ccc;
  cursor: pointer;
  padding: 2px 6px;
  font-size: 14px;
  border-radius: 3px;
  transition: all 0.15s;
}

.light-theme .toolbar-btn {
  color: #616161;
}

.toolbar-btn:hover {
  background: #444;
  color: white;
}

.light-theme .toolbar-btn:hover {
  background: #d0d0d0;
  color: #000;
}

.toolbar-btn:active {
  background: #555;
}

.light-theme .toolbar-btn:active {
  background: #c0c0c0;
}

.close-btn:hover {
  background: #d32f2f;
  color: white;
}
</style>
