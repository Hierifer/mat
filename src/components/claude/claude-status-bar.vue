<script setup lang="ts">
import { computed } from 'vue'
import { useClaudeStatus } from '@/composables/use-claude-status'
import TaskStatusBar from '@/components/shared/task-status-bar.vue'
import type { ClaudeMetrics } from '@/composables/parsers/claude-parser'
import { formatTokens } from '@/composables/parsers/claude-parser'

const {
  isRunning,
  currentAction,
  usage,
  hasUsage,
  contextWidth,
  contextColor,
} = useClaudeStatus()

const visible = computed(() => isRunning.value || hasUsage.value)

// Convert Claude metrics to generic metric display format
const metricsRenderer = (metrics: ClaudeMetrics) => {
  const result = []

  if (metrics.inputTokens !== null) {
    result.push({
      label: 'in',
      value: formatTokens(metrics.inputTokens),
    })
  }

  if (metrics.outputTokens !== null) {
    result.push({
      label: 'out',
      value: formatTokens(metrics.outputTokens),
    })
  }

  if (metrics.cacheReadTokens !== null) {
    result.push({
      label: 'cache',
      value: formatTokens(metrics.cacheReadTokens),
      variant: 'cache',
    })
  }

  if (metrics.cost !== null) {
    result.push({
      label: '',
      value: `$${metrics.cost.toFixed(4)}`,
      variant: 'cost',
    })
  }

  return result
}

// Cast usage to ClaudeMetrics for type safety
const claudeMetrics = computed(() => usage.value as ClaudeMetrics)
</script>

<template>
  <task-status-bar
    :visible="visible"
    task-label="Claude"
    task-color="#d97757"
    :is-running="isRunning"
    :current-action="currentAction"
    done-label="Done"
    :metrics="claudeMetrics"
    :metrics-renderer="metricsRenderer"
  >
    <!-- Custom center slot for context window bar -->
    <template #center>
      <div v-if="usage.contextPercent !== null" class="context-section">
        <span class="context-label">Context</span>
        <div class="context-bar">
          <div
            class="context-fill"
            :style="{ width: contextWidth, background: contextColor }"
          ></div>
        </div>
        <span class="context-percent" :style="{ color: contextColor }">
          {{ usage.contextPercent }}%
        </span>
      </div>
    </template>
  </task-status-bar>
</template>

<style scoped>
/* Context window specific styles */
.context-section {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  max-width: 240px;
}

.context-label {
  color: #666;
  flex-shrink: 0;
  font-size: 11px;
}

.context-bar {
  flex: 1;
  height: 4px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
  overflow: hidden;
}

.context-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.4s ease, background 0.4s ease;
}

.context-percent {
  flex-shrink: 0;
  font-size: 10px;
  min-width: 30px;
  text-align: right;
  transition: color 0.4s ease;
}
</style>
