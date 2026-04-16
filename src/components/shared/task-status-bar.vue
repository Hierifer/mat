<script setup lang="ts" generic="T extends TaskMetrics">
import { computed } from 'vue'
import type { TaskMetrics } from '@/composables/use-task-status'

interface Props {
  visible: boolean
  taskLabel: string
  taskColor?: string
  isRunning: boolean
  currentAction?: string
  doneLabel?: string
  metrics?: T
  metricsRenderer?: (metrics: T) => Array<{ label: string; value: string; variant?: string }>
}

const props = withDefaults(defineProps<Props>(), {
  taskColor: '#d97757',
  currentAction: '',
  doneLabel: 'Done',
  metrics: () => ({} as T),
  metricsRenderer: () => [],
})

const renderedMetrics = computed(() => {
  if (props.metricsRenderer) {
    return props.metricsRenderer(props.metrics)
  }
  return []
})
</script>

<template>
  <transition name="statusbar-slide">
    <div v-if="visible" class="task-status-bar">
      <!-- Left: Task indicator + action -->
      <div class="status-left">
        <span class="task-badge" :style="{ color: taskColor }">
          <span class="task-dot" :class="{ active: isRunning }"></span>
          {{ taskLabel }}
        </span>
        <span v-if="isRunning && currentAction" class="current-action">
          {{ currentAction }}
        </span>
        <span v-else-if="!isRunning && renderedMetrics.length > 0" class="done-label">
          {{ doneLabel }}
        </span>
      </div>

      <!-- Right: Metrics -->
      <div v-if="renderedMetrics.length > 0" class="status-right">
        <span
          v-for="(metric, idx) in renderedMetrics"
          :key="idx"
          class="stat"
          :class="metric.variant"
        >
          <span v-if="metric.label" class="stat-label">{{ metric.label }}</span>
          <span class="stat-value">{{ metric.value }}</span>
        </span>
      </div>

      <!-- Custom slot for additional content -->
      <slot name="center" />
    </div>
  </transition>
</template>

<style scoped>
.task-status-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 28px;
  z-index: 500;

  display: flex;
  align-items: center;
  gap: 16px;
  padding: 0 16px;

  background: rgba(18, 18, 18, 0.92);
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(12px);
  font-size: 11px;
  font-family: "JetBrains Mono", monospace;
  color: #aaa;
  user-select: none;
}

.status-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.task-badge {
  display: flex;
  align-items: center;
  gap: 5px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.task-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #555;
  transition: background 0.3s;
}

.task-dot.active {
  background: #52c41a;
  box-shadow: 0 0 6px #52c41a88;
  animation: pulse 1.2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.current-action {
  color: #888;
  max-width: 280px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.done-label {
  color: #52c41a;
  font-size: 10px;
}

.status-right {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-left: auto;
  flex-shrink: 0;
}

.stat {
  display: flex;
  align-items: center;
  gap: 3px;
}

.stat-label {
  color: #555;
  font-size: 10px;
}

.stat-value {
  color: #888;
}

.stat.cache .stat-label,
.stat.cache .stat-value {
  color: #4a4a6a;
}

.stat.cost .stat-value {
  color: #7c6f64;
}

.stat.warning .stat-value {
  color: #fa8c16;
}

.stat.error .stat-value {
  color: #ff4d4f;
}

.stat.success .stat-value {
  color: #52c41a;
}

/* Slide transition */
.statusbar-slide-enter-active,
.statusbar-slide-leave-active {
  transition: transform 0.25s ease, opacity 0.25s ease;
}

.statusbar-slide-enter-from,
.statusbar-slide-leave-to {
  transform: translateY(100%);
  opacity: 0;
}
</style>
