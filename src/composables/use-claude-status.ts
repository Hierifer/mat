import { computed } from 'vue'
import { useTaskStatus } from './use-task-status'
import {
  ClaudeOutputParser,
  type ClaudeMetrics,
  formatTokens as formatTokensUtil,
  getContextColor as getContextColorUtil,
} from './parsers/claude-parser'

/**
 * Legacy interface for backwards compatibility
 */
export interface ClaudeUsage {
  inputTokens: number | null
  outputTokens: number | null
  cacheReadTokens: number | null
  cacheWriteTokens: number | null
  cost: number | null
  contextPercent: number | null
}

export interface ClaudeStatus {
  isRunning: boolean
  currentAction: string
  usage: ClaudeUsage
  sessionId: string | null
}

/**
 * Claude-specific task status tracker
 * Wraps the generic useTaskStatus with Claude-specific parser
 */
export function useClaudeStatus() {
  const parser = new ClaudeOutputParser()

  const {
    isRunning,
    currentAction,
    metrics,
    sessionId,
    hasMetrics,
    startTask,
    processOutput: processTaskOutput,
    endTask,
  } = useTaskStatus<ClaudeMetrics>(parser, {
    completionDelay: 3000,
    metricsRetentionDelay: 5000,
  })

  // Map metrics to legacy 'usage' interface for backwards compatibility
  const usage = computed<ClaudeUsage>(() => ({
    inputTokens: metrics.value.inputTokens ?? null,
    outputTokens: metrics.value.outputTokens ?? null,
    cacheReadTokens: metrics.value.cacheReadTokens ?? null,
    cacheWriteTokens: metrics.value.cacheWriteTokens ?? null,
    cost: metrics.value.cost ?? null,
    contextPercent: metrics.value.contextPercent ?? null,
  }))

  // Computed helpers
  const contextWidth = computed(() => {
    const p = metrics.value.contextPercent
    return p !== null ? `${p}%` : '0%'
  })

  const contextColor = computed(() => {
    return getContextColorUtil(metrics.value.contextPercent ?? null)
  })

  const formatTokens = (n: number | null): string => {
    return formatTokensUtil(n)
  }

  // Wrapper methods for backwards compatibility
  const startSession = (sid: string) => {
    startTask(sid, 'claude')
  }

  const processOutput = (sid: string, raw: string) => {
    processTaskOutput(sid, raw)
  }

  const endSession = () => {
    endTask()
  }

  return {
    // Backwards compatible exports
    isRunning,
    currentAction,
    usage,
    sessionId,
    hasUsage: hasMetrics,
    contextWidth,
    contextColor,
    formatTokens,
    startSession,
    processOutput,
    endSession,

    // New generic interface
    metrics,
    startTask,
    processTaskOutput,
    endTask,
  }
}
