<script setup lang="ts">
export interface EditorTab {
  path: string
  name: string
  modified: boolean
}

defineProps<{
  tabs: EditorTab[]
  activeIndex: number
}>()

const emit = defineEmits<{
  select: [index: number]
  close: [index: number]
}>()

function handleClose(e: MouseEvent, index: number) {
  e.stopPropagation()
  emit('close', index)
}
</script>

<template>
  <div class="editor-tabs" v-if="tabs.length > 0">
    <div
      v-for="(tab, i) in tabs"
      :key="tab.path"
      class="editor-tab"
      :class="{ active: i === activeIndex }"
      @click="emit('select', i)"
    >
      <span class="tab-name">{{ tab.name }}</span>
      <span v-if="tab.modified" class="tab-modified">●</span>
      <button class="tab-close" @click="handleClose($event, i)">×</button>
    </div>
  </div>
</template>

<style scoped>
.editor-tabs {
  display: flex;
  background: #252526;
  border-bottom: 1px solid #1e1e1e;
  overflow-x: auto;
  flex-shrink: 0;
}

.editor-tab {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  font-size: 12px;
  color: #888;
  cursor: pointer;
  border-right: 1px solid #1e1e1e;
  white-space: nowrap;
  min-width: 0;
}

.editor-tab:hover {
  color: #ccc;
}

.editor-tab.active {
  background: #1e1e1e;
  color: #fff;
  border-bottom: 1px solid #0e639c;
  margin-bottom: -1px;
}

.tab-name {
  overflow: hidden;
  text-overflow: ellipsis;
}

.tab-modified {
  color: #e8e8e8;
  font-size: 10px;
}

.tab-close {
  background: none;
  border: none;
  color: #888;
  cursor: pointer;
  font-size: 14px;
  padding: 0 2px;
  line-height: 1;
  border-radius: 3px;
  opacity: 0;
}

.editor-tab:hover .tab-close,
.editor-tab.active .tab-close {
  opacity: 1;
}

.tab-close:hover {
  background: rgba(128, 128, 128, 0.3);
  color: #fff;
}
</style>
