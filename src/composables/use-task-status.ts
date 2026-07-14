import { ref, computed } from 'vue'

/**
 * Generic task metrics that can be tracked
 */
export interface TaskMetrics {
  [key: string]: number | string | null
}

/**
 * Generic task status interface
 */
export interface TaskStatus<T extends TaskMetrics = TaskMetrics> {
  isRunning: boolean
  currentAction: string
  metrics: T
  sessionId: string | null
  taskType?: string
}

/**
 * Output parser interface - implement this for different task types
 */
export interface OutputParser<T extends TaskMetrics = TaskMetrics> {
  /**
   * Parse output line and extract metrics
   */
  parseMetrics(line: string): Partial<T> | null

  /**
   * Parse current action from output
   */
  parseAction(line: string): string | null

  /**
   * Detect if task is complete from output
   */
  isComplete?(line: string): boolean

  /**
   * Detect if task is waiting for user input
   */
  isWaitingForInput?(line: string): boolean

  /**
   * Strip formatting/control characters
   */
  stripFormatting?(text: string): string
}

/**
 * Generic task status tracker - can be used for any async task
 */
export function useTaskStatus<T extends TaskMetrics = TaskMetrics>(
  parser: OutputParser<T>,
  options: {
    completionDelay?: number // Delay before considering task done (ms)
    metricsRetentionDelay?: number // How long to show metrics after completion (ms)
  } = {}
) {
  const {
    completionDelay = 3000,
    metricsRetentionDelay = 5000,
  } = options

  const isRunning = ref(false)
  const currentAction = ref('')
  const sessionId = ref<string | null>(null)
  const taskType = ref<string>('')
  const metrics = ref<T>({} as T)
  const isWaitingForInput = ref(false)

  let completionTimer: ReturnType<typeof setTimeout> | null = null
  let inactivityTimer: ReturnType<typeof setTimeout> | null = null
  let pendingWaitingForInput = false

  /**
   * Start tracking a new task
   */
  const startTask = (sid: string, type: string = 'generic') => {
    isRunning.value = true
    sessionId.value = sid
    taskType.value = type
    currentAction.value = ''
    metrics.value = {} as T
    isWaitingForInput.value = false
    pendingWaitingForInput = false

    if (completionTimer) {
      clearTimeout(completionTimer)
      completionTimer = null
    }
    if (inactivityTimer) {
      clearTimeout(inactivityTimer)
      inactivityTimer = null
    }
  }

  /**
   * Process task output and extract status/metrics
   */
  const processOutput = (sid: string, raw: string) => {
    if (sessionId.value !== sid) return

    // Re-activate if we receive output for a tracked session that was
    // auto-ended by the inactivity timer (e.g. after a long thinking pause)
    if (!isRunning.value && sessionId.value === sid) {
      isRunning.value = true
    }

    // Strip formatting if parser provides it
    const cleaned = parser.stripFormatting ? parser.stripFormatting(raw) : raw
    const lines = cleaned.split(/\r?\n/)

    for (const line of lines) {
      // Parse metrics
      const parsedMetrics = parser.parseMetrics(line)
      if (parsedMetrics) {
        metrics.value = { ...metrics.value, ...parsedMetrics }
      }

      // Parse action — if a new action is detected, reset waiting state
      const action = parser.parseAction(line)
      if (action) {
        currentAction.value = action
        // New action means Claude is working again, not waiting
        if (pendingWaitingForInput || isWaitingForInput.value) {
          pendingWaitingForInput = false
          isWaitingForInput.value = false
        }
      }

      // Check if waiting for input
      if (parser.isWaitingForInput && parser.isWaitingForInput(line)) {
        pendingWaitingForInput = true
      }

      // Check if complete
      if (parser.isComplete && parser.isComplete(line)) {
        endTask()
        return
      }
    }

    // Reset completion timer on any output
    if (completionTimer) clearTimeout(completionTimer)
    completionTimer = setTimeout(() => {
      if (isRunning.value) {
        currentAction.value = ''
        // If we have a pending waiting-for-input marker, confirm it after idle period
        if (pendingWaitingForInput) {
          isWaitingForInput.value = true
          pendingWaitingForInput = false
        }
      }
    }, completionDelay)

    // Reset inactivity timer — end task after prolonged silence.
    // This handles the case where isComplete patterns are disabled or
    // unreliable. If output resumes later, processOutput re-activates.
    if (inactivityTimer) clearTimeout(inactivityTimer)
    inactivityTimer = setTimeout(() => {
      if (isRunning.value) {
        endTask()
      }
    }, completionDelay * 5) // 15s default (5× completionDelay)
  }

  /**
   * End current task
   */
  const endTask = () => {
    isRunning.value = false
    currentAction.value = ''
    isWaitingForInput.value = false
    pendingWaitingForInput = false

    if (completionTimer) {
      clearTimeout(completionTimer)
      completionTimer = null
    }

    // Clear metrics after retention delay
    setTimeout(() => {
      if (!isRunning.value) {
        metrics.value = {} as T
        sessionId.value = null
      }
    }, metricsRetentionDelay)
  }

  /**
   * Check if any metrics are available
   */
  const hasMetrics = computed(() => {
    return Object.values(metrics.value).some(v => v !== null && v !== undefined)
  })

  /**
   * Get specific metric
   */
  const getMetric = (key: keyof T): T[keyof T] | null => {
    return metrics.value[key] ?? null
  }

  /**
   * Cleanup on unmount
   */
  const cleanup = () => {
    if (completionTimer) {
      clearTimeout(completionTimer)
      completionTimer = null
    }
    if (inactivityTimer) {
      clearTimeout(inactivityTimer)
      inactivityTimer = null
    }
  }

  return {
    // State
    isRunning,
    currentAction,
    metrics,
    sessionId,
    taskType,
    hasMetrics,
    isWaitingForInput,

    // Actions
    startTask,
    processOutput,
    endTask,
    getMetric,
    cleanup,
  }
}
