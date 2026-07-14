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

// Module-level shared state — single Claude status tracker per app.
// All consumers (terminal-instance, claude-status-bar) share the same refs.
const _parser = new ClaudeOutputParser()
const _shared = useTaskStatus<ClaudeMetrics>(_parser, {
  completionDelay: 3000,
  metricsRetentionDelay: 5000,
})

/**
 * Claude-specific task status tracker
 * Wraps the generic useTaskStatus with Claude-specific parser
 */
export function useClaudeStatus() {
  const {
    isRunning,
    currentAction,
    metrics,
    sessionId,
    hasMetrics,
    isWaitingForInput,
    startTask,
    processOutput: processTaskOutput,
    endTask,
  } = _shared

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

  // Whether the Claude status bar overlay should be visible
  const statusBarVisible = computed(() => isRunning.value || hasMetrics.value)

  return {
    // Backwards compatible exports
    isRunning,
    currentAction,
    usage,
    sessionId,
    hasUsage: hasMetrics,
    statusBarVisible,
    contextWidth,
    contextColor,
    formatTokens,
    startSession,
    processOutput,
    endSession,
    isWaitingForInput,

    // New generic interface
    metrics,
    startTask,
    processTaskOutput,
    endTask,
  }
}
