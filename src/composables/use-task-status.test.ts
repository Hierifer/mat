import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { useTaskStatus, type OutputParser, type TaskMetrics } from './use-task-status'

interface TestMetrics extends TaskMetrics {
  count: number | null
  label: string | null
}

/** Minimal mock parser */
function createMockParser(): OutputParser<TestMetrics> {
  return {
    parseMetrics: vi.fn(() => null),
    parseAction: vi.fn(() => null),
    isComplete: vi.fn(() => false),
    stripFormatting: vi.fn((t: string) => t),
  }
}

describe('useTaskStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ---------------------------------------------------------------------------
  // startTask
  // ---------------------------------------------------------------------------
  describe('startTask', () => {
    it('sets isRunning to true and assigns sessionId', () => {
      const parser = createMockParser()
      const { startTask, isRunning, sessionId } = useTaskStatus<TestMetrics>(parser)

      startTask('sess_1', 'test')
      expect(isRunning.value).toBe(true)
      expect(sessionId.value).toBe('sess_1')
    })

    it('resets metrics and action on start', () => {
      const parser = createMockParser()
      const { startTask, metrics, currentAction } = useTaskStatus<TestMetrics>(parser)

      startTask('sess_1', 'test')
      expect(Object.keys(metrics.value).length).toBe(0)
      expect(currentAction.value).toBe('')
    })
  })

  // ---------------------------------------------------------------------------
  // processOutput
  // ---------------------------------------------------------------------------
  describe('processOutput', () => {
    it('calls parser methods with each line', () => {
      const parser = createMockParser()
      const { startTask, processOutput } = useTaskStatus<TestMetrics>(parser)

      startTask('sess_1', 'test')
      processOutput('sess_1', 'line A\nline B')

      expect(parser.stripFormatting).toHaveBeenCalledWith('line A\nline B')
      expect(parser.parseMetrics).toHaveBeenCalledWith('line A')
      expect(parser.parseMetrics).toHaveBeenCalledWith('line B')
    })

    it('updates metrics when parser returns values', () => {
      const parser = createMockParser()
      ;(parser.parseMetrics as ReturnType<typeof vi.fn>).mockReturnValueOnce({ count: 42 })
      const { startTask, processOutput, metrics } = useTaskStatus<TestMetrics>(parser)

      startTask('sess_1', 'test')
      processOutput('sess_1', 'data line')

      expect(metrics.value.count).toBe(42)
    })

    it('updates currentAction when parser returns an action', () => {
      const parser = createMockParser()
      ;(parser.parseAction as ReturnType<typeof vi.fn>).mockReturnValueOnce('Reading file')
      const { startTask, processOutput, currentAction } = useTaskStatus<TestMetrics>(parser)

      startTask('sess_1', 'test')
      processOutput('sess_1', 'spinner line')

      expect(currentAction.value).toBe('Reading file')
    })

    it('ignores output for a different session', () => {
      const parser = createMockParser()
      const { startTask, processOutput } = useTaskStatus<TestMetrics>(parser)

      startTask('sess_1', 'test')
      processOutput('sess_other', 'some data')

      // parser should not be called since sessionId doesn't match
      expect(parser.parseMetrics).not.toHaveBeenCalled()
    })

    it('re-activates a session that was auto-ended', () => {
      const parser = createMockParser()
      const { startTask, processOutput, endTask, isRunning } = useTaskStatus<TestMetrics>(parser)

      startTask('sess_1', 'test')
      endTask()
      expect(isRunning.value).toBe(false)

      // Output arrives for the same session — should re-activate
      processOutput('sess_1', 'more data')
      expect(isRunning.value).toBe(true)
    })

    it('calls endTask when parser.isComplete returns true', () => {
      const parser = createMockParser()
      ;(parser.isComplete as ReturnType<typeof vi.fn>).mockReturnValueOnce(true)
      const { startTask, processOutput, isRunning } = useTaskStatus<TestMetrics>(parser)

      startTask('sess_1', 'test')
      processOutput('sess_1', 'done marker')

      expect(isRunning.value).toBe(false)
    })
  })

  // ---------------------------------------------------------------------------
  // endTask
  // ---------------------------------------------------------------------------
  describe('endTask', () => {
    it('sets isRunning to false and clears currentAction', () => {
      const parser = createMockParser()
      const { startTask, endTask, isRunning, currentAction } = useTaskStatus<TestMetrics>(parser)

      startTask('sess_1', 'test')
      endTask()

      expect(isRunning.value).toBe(false)
      expect(currentAction.value).toBe('')
    })

    it('clears metrics after retention delay', () => {
      const parser = createMockParser()
      ;(parser.parseMetrics as ReturnType<typeof vi.fn>).mockReturnValueOnce({ count: 10 })
      const { startTask, processOutput, endTask, metrics, sessionId } =
        useTaskStatus<TestMetrics>(parser, { metricsRetentionDelay: 1000 })

      startTask('sess_1', 'test')
      processOutput('sess_1', 'data')
      expect(metrics.value.count).toBe(10)

      endTask()
      // Metrics still present right after end
      expect(metrics.value.count).toBe(10)

      // Advance past retention delay
      vi.advanceTimersByTime(1100)
      expect(Object.keys(metrics.value).length).toBe(0)
      expect(sessionId.value).toBeNull()
    })
  })

  // ---------------------------------------------------------------------------
  // Completion timer (clears action after delay)
  // ---------------------------------------------------------------------------
  describe('completion timer', () => {
    it('clears currentAction after completionDelay with no new output', () => {
      const parser = createMockParser()
      ;(parser.parseAction as ReturnType<typeof vi.fn>).mockReturnValueOnce('Working')
      const { startTask, processOutput, currentAction } = useTaskStatus<TestMetrics>(parser, {
        completionDelay: 500,
      })

      startTask('sess_1', 'test')
      processOutput('sess_1', 'action line')
      expect(currentAction.value).toBe('Working')

      vi.advanceTimersByTime(600)
      expect(currentAction.value).toBe('')
    })
  })

  // ---------------------------------------------------------------------------
  // Inactivity timer
  // ---------------------------------------------------------------------------
  describe('inactivity timer', () => {
    it('ends the task after prolonged silence (5x completionDelay)', () => {
      const parser = createMockParser()
      const { startTask, processOutput, isRunning } = useTaskStatus<TestMetrics>(parser, {
        completionDelay: 200,
      })

      startTask('sess_1', 'test')
      processOutput('sess_1', 'some data')

      // 5 * 200 = 1000ms
      vi.advanceTimersByTime(1100)
      expect(isRunning.value).toBe(false)
    })
  })

  // ---------------------------------------------------------------------------
  // hasMetrics
  // ---------------------------------------------------------------------------
  describe('hasMetrics', () => {
    it('returns false when metrics are empty', () => {
      const parser = createMockParser()
      const { hasMetrics } = useTaskStatus<TestMetrics>(parser)
      expect(hasMetrics.value).toBe(false)
    })

    it('returns true when metrics have values', () => {
      const parser = createMockParser()
      ;(parser.parseMetrics as ReturnType<typeof vi.fn>).mockReturnValueOnce({ count: 1 })
      const { startTask, processOutput, hasMetrics } = useTaskStatus<TestMetrics>(parser)

      startTask('sess_1', 'test')
      processOutput('sess_1', 'data')

      expect(hasMetrics.value).toBe(true)
    })
  })

  // ---------------------------------------------------------------------------
  // cleanup
  // ---------------------------------------------------------------------------
  describe('cleanup', () => {
    it('clears all timers without error', () => {
      const parser = createMockParser()
      const { startTask, processOutput, cleanup } = useTaskStatus<TestMetrics>(parser)

      startTask('sess_1', 'test')
      processOutput('sess_1', 'data')
      // Should not throw
      cleanup()
    })
  })
})
