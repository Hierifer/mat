<script setup lang="ts">
import { computed } from 'vue'
import type { SplitNode } from '@/stores/terminal-store'
import TerminalInstance from '@/components/terminal/terminal-instance.vue'
import PaneToolbar from '@/components/terminal/pane-toolbar.vue'

const props = defineProps<{
  node: SplitNode
}>()

const isPane = computed(() => props.node.type === 'pane')
const isHorizontal = computed(() => props.node.type === 'horizontal')
const isVertical = computed(() => props.node.type === 'vertical')

const gridStyle = computed(() => {
  if (isHorizontal.value) {
    return {
      display: 'grid',
      gridTemplateColumns: props.node.children?.map(c => `${c.size || 50}%`).join(' '),
      height: '100%',
    }
  } else if (isVertical.value) {
    return {
      display: 'grid',
      gridTemplateRows: props.node.children?.map(c => `${c.size || 50}%`).join(' '),
      height: '100%',
    }
  }
  return { height: '100%' }
})
</script>

<template>
  <div v-if="isPane" class="pane">
    <pane-toolbar
      v-if="node.paneId && node.sessionId"
      :pane-id="node.paneId"
      :session-id="node.sessionId"
      :cwd="node.cwd"
    />
    <div class="terminal-wrapper">
      <terminal-instance
        v-if="node.sessionId"
        :key="node.sessionId"
        :session-id="node.sessionId"
        :pane-id="node.paneId"
      />
    </div>
  </div>

  <div v-else :style="gridStyle" class="split-container">
    <split-container
      v-for="child in node.children"
      :key="child.paneId || child.type + '_' + (child.children?.map(c => c.paneId).join('_') || Math.random())"
      :node="child"
    />
  </div>
</template>

<style scoped>
.pane {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #1e1e1e;
  border: 1px solid #333;
  overflow: hidden;
}

.terminal-wrapper {
  flex: 1;
  overflow: hidden;
  min-height: 0;
}

.split-container {
  gap: 4px;
}
</style>
