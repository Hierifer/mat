<script setup lang="ts">
import { computed, ref } from 'vue'
import type { SplitNode } from '@/stores/terminal-store'
import { useTerminalStore } from '@/stores/terminal-store'
import TerminalInstance from '@/components/terminal/terminal-instance.vue'
import PaneToolbar from '@/components/terminal/pane-toolbar.vue'

const props = defineProps<{
  node: SplitNode
}>()

const store = useTerminalStore()

const isPane = computed(() => props.node.type === 'pane')
const isHorizontal = computed(() => props.node.type === 'horizontal')
const isVertical = computed(() => props.node.type === 'vertical')
const isActive = computed(() => store.activePaneId === props.node.paneId)
const shouldDim = computed(() => store.dimInactivePanes && !isActive.value)

const handlePaneClick = () => {
  if (props.node.paneId) {
    store.setActivePane(props.node.paneId)
  }
}

// Dragging state
const containerRef = ref<HTMLElement | null>(null)
const isDragging = ref(false)
const draggingIndex = ref(-1)

const startDrag = (e: MouseEvent, index: number) => {
  e.preventDefault()
  isDragging.value = true
  draggingIndex.value = index

  const children = props.node.children!
  const sizes = children.map(c => c.size ?? (100 / children.length))

  const container = containerRef.value!
  const containerRect = container.getBoundingClientRect()
  const isH = isHorizontal.value

  const totalSize = isH ? containerRect.width : containerRect.height
  const startPos = isH ? e.clientX : e.clientY

  // Sum of sizes before dragging index + 1
  const leftSizeAtStart = sizes[index]
  const rightSizeAtStart = sizes[index + 1]
  const combinedSize = leftSizeAtStart + rightSizeAtStart

  const onMouseMove = (moveEvent: MouseEvent) => {
    const currentPos = isH ? moveEvent.clientX : moveEvent.clientY
    const delta = currentPos - startPos
    const deltaPercent = (delta / totalSize) * 100

    const minSize = 10 // minimum 10%
    const newLeft = Math.min(combinedSize - minSize, Math.max(minSize, leftSizeAtStart + deltaPercent))
    const newRight = combinedSize - newLeft

    const newSizes = [...sizes]
    newSizes[index] = newLeft
    newSizes[index + 1] = newRight
    store.updateChildSizes(props.node, newSizes)
  }

  const onMouseUp = () => {
    isDragging.value = false
    draggingIndex.value = -1
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
  }

  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
}

const gridStyle = computed(() => {
  const children = props.node.children
  if (!children) return { height: '100%' }

  // Build track sizes with divider gaps (4px each)
  const tracks = children.map(c => `${c.size ?? (100 / children.length)}fr`).join(' 4px ')

  if (isHorizontal.value) {
    return {
      display: 'grid',
      gridTemplateColumns: tracks,
      height: '100%',
    }
  } else if (isVertical.value) {
    return {
      display: 'grid',
      gridTemplateRows: tracks,
      height: '100%',
    }
  }
  return { height: '100%' }
})
</script>

<template>
  <div v-if="isPane" class="pane" :class="{ dimmed: shouldDim, active: isActive }" @click="handlePaneClick">
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

  <div v-else ref="containerRef" :style="gridStyle" class="split-container" :class="{ 'is-dragging': isDragging }">
    <template v-for="(child, index) in node.children" :key="child.paneId || child.type + '_' + index">
      <split-container :node="child" />
      <!-- Divider between panes (not after the last one) -->
      <div
        v-if="index < (node.children?.length ?? 0) - 1"
        class="divider"
        :class="isHorizontal ? 'divider-h' : 'divider-v'"
        @mousedown="startDrag($event, index)"
      />
    </template>
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
  transition: filter 0.2s ease, border-color 0.2s ease;
  cursor: pointer;
}

.pane.active {
  border-color: #007acc;
}

.pane.dimmed {
  filter: grayscale(0.4) brightness(0.85);
}

.terminal-wrapper {
  flex: 1;
  overflow: hidden;
  min-height: 0;
}

.split-container {
  height: 100%;
}

.split-container.is-dragging {
  user-select: none;
}

.divider {
  background: #2d2d2d;
  transition: background 0.15s ease;
  flex-shrink: 0;
}

.divider:hover,
.split-container.is-dragging .divider {
  background: #007acc;
}

.divider-h {
  cursor: col-resize;
  width: 4px;
  height: 100%;
}

.divider-v {
  cursor: row-resize;
  height: 4px;
  width: 100%;
}
</style>
