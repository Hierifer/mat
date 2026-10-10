<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import FileTree from './file-tree.vue'
import EditorTabs from './editor-tabs.vue'
import type { EditorTab } from './editor-tabs.vue'
import MonacoWrapper from './monaco-wrapper.vue'
import { detectLanguage } from '@/utils/editor-utils'
import { useTerminalStore } from '@/stores/terminal-store'

const store = useTerminalStore()

const props = defineProps<{
  cwd: string
  lightTheme?: boolean
}>()

interface OpenFile {
  path: string
  name: string
  content: string
  originalContent: string
  language: string
}

const openFiles = ref<OpenFile[]>([])
const activeFileIndex = ref(-1)

const activeFile = computed(() => {
  if (activeFileIndex.value >= 0 && activeFileIndex.value < openFiles.value.length) {
    return openFiles.value[activeFileIndex.value]
  }
  return null
})

const tabs = computed<EditorTab[]>(() =>
  openFiles.value.map(f => ({
    path: f.path,
    name: f.name,
    modified: f.content !== f.originalContent,
  }))
)

// Resizable panel
const treeWidth = ref(250)
const isResizing = ref(false)

function startResize(e: MouseEvent) {
  isResizing.value = true
  const startX = e.clientX
  const startWidth = treeWidth.value

  const onMove = (me: MouseEvent) => {
    const delta = me.clientX - startX
    treeWidth.value = Math.max(150, Math.min(500, startWidth + delta))
  }
  const onUp = () => {
    isResizing.value = false
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
  }
  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}

async function handleOpenFile(path: string) {
  // If already open, just switch to it
  const existingIndex = openFiles.value.findIndex(f => f.path === path)
  if (existingIndex >= 0) {
    activeFileIndex.value = existingIndex
    return
  }

  try {
    const content: string = await invoke('fs_read_file', { path })
    const name = path.split('/').pop() ?? path
    const language = detectLanguage(name)

    openFiles.value.push({
      path,
      name,
      content,
      originalContent: content,
      language,
    })
    activeFileIndex.value = openFiles.value.length - 1
  } catch (err) {
    console.error('Failed to open file:', err)
  }
}

function handleSelectTab(index: number) {
  activeFileIndex.value = index
}

function handleCloseTab(index: number) {
  openFiles.value.splice(index, 1)
  if (activeFileIndex.value >= openFiles.value.length) {
    activeFileIndex.value = openFiles.value.length - 1
  }
}

function handleContentChange(value: string) {
  if (activeFile.value) {
    activeFile.value.content = value
  }
}

async function handleSave() {
  if (!activeFile.value) return
  try {
    await invoke('fs_write_file', {
      path: activeFile.value.path,
      content: activeFile.value.content,
    })
    activeFile.value.originalContent = activeFile.value.content
  } catch (err) {
    console.error('Failed to save file:', err)
  }
}

// Watch for external file open requests (e.g. from git panel)
watch(() => store.pendingEditorFile, (filePath) => {
  if (filePath) {
    handleOpenFile(filePath)
    store.pendingEditorFile = null
  }
})
</script>

<template>
  <div class="editor-layout" :class="{ 'light-theme': lightTheme }">
    <div class="file-tree-panel" :style="{ width: treeWidth + 'px' }">
      <FileTree :root-path="cwd" :light-theme="lightTheme" @open-file="handleOpenFile" />
    </div>
    <div class="resize-handle" @mousedown="startResize"></div>
    <div class="editor-panel">
      <EditorTabs
        :tabs="tabs"
        :active-index="activeFileIndex"
        :light-theme="lightTheme"
        @select="handleSelectTab"
        @close="handleCloseTab"
      />
      <div class="editor-content">
        <MonacoWrapper
          v-if="activeFile"
          :model-value="activeFile.content"
          :language="activeFile.language"
          :file-path="activeFile.path"
          :light-theme="lightTheme"
          @update:model-value="handleContentChange"
          @save="handleSave"
        />
        <div v-else class="editor-empty">
          <span>Open a file from the explorer to start editing</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.editor-layout {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.file-tree-panel {
  flex-shrink: 0;
  overflow: hidden;
}

.resize-handle {
  width: 3px;
  cursor: col-resize;
  background: #888;
  flex-shrink: 0;
}
.resize-handle:hover {
  background: #aaa;
}

.editor-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
}

.editor-content {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.editor-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #555;
  font-size: 14px;
  background: #1e1e1e;
  transition: background 0.3s, color 0.3s;
}

.light-theme .resize-handle:hover {
  background: #007acc;
}

.light-theme .editor-empty {
  background: #f3f3f3;
  color: #999;
}
</style>
