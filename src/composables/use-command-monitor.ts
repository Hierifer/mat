import { ref } from 'vue'
import { useNotification } from './use-notification'
import { useTerminalStore } from '@/stores/terminal-store'

interface RunningCommand {
  command: string
  sessionId: string
  startTime: number
  outputLines: string[]
}

export function useCommandMonitor() {
  const runningCommands = ref<Map<string, RunningCommand>>(new Map())
  const { notifyTaskComplete, notifyInfo } = useNotification()
  const store = useTerminalStore()

  // Patterns to detect Claude commands
  const claudeCommandPatterns = [
    /claude\s+/i,           // claude command
    /npx\s+@claude/i,       // npx @claude
    /claude-code/i,         // claude-code
  ]

  // Patterns to detect command completion
  const completionPatterns = [
    /\$\s*$/,               // Shell prompt (bash/zsh)
    /%\s*$/,                // Shell prompt (zsh)
    />\s*$/,                // Shell prompt (cmd/powershell)
    /\n$/,                  // Empty newline (potential end)
  ]

  // Special Claude completion patterns
  const claudeCompletionPatterns = [
    /task\s+complete/i,
    /done/i,
    /finished/i,
    /successfully\s+completed/i,
    /\[✓\]/,
    /✅/,
  ]

  /**
   * Check if a line contains a Claude command
   */
  const isClaudeCommand = (line: string): boolean => {
    return claudeCommandPatterns.some(pattern => pattern.test(line))
  }

  /**
   * Check if output indicates command completion
   */
  const isCommandComplete = (output: string, sessionId: string): boolean => {
    const running = runningCommands.value.get(sessionId)
    if (!running) return false

    // Check for Claude-specific completion markers
    const hasClaudeCompletion = claudeCompletionPatterns.some(pattern =>
      pattern.test(output)
    )

    if (hasClaudeCompletion) {
      return true
    }

    // Check for general completion patterns (shell prompt)
    // Only consider it complete if we've received some output
    if (running.outputLines.length > 5) {
      return completionPatterns.some(pattern => pattern.test(output))
    }

    return false
  }

  /**
   * Start monitoring a command
   */
  const startMonitoring = (sessionId: string, command: string) => {
    if (!isClaudeCommand(command)) {
      return false
    }

    console.log('[CommandMonitor] Started monitoring Claude command:', command)

    runningCommands.value.set(sessionId, {
      command,
      sessionId,
      startTime: Date.now(),
      outputLines: [],
    })

    return true
  }

  /**
   * Process terminal output
   */
  const processOutput = async (sessionId: string, output: string) => {
    const running = runningCommands.value.get(sessionId)
    if (!running) return

    // Add output line
    running.outputLines.push(output)

    // Check for completion
    if (isCommandComplete(output, sessionId)) {
      const duration = Date.now() - running.startTime
      const durationText = formatDuration(duration)

      console.log('[CommandMonitor] Claude command completed:', {
        command: running.command,
        duration: durationText,
        outputLines: running.outputLines.length,
      })

      // Send notification only if enabled
      if (store.enableCommandNotifications) {
        await notifyTaskComplete(
          'Claude 任务完成',
          `命令执行完成 (用时 ${durationText})\n${truncateCommand(running.command)}`
        )
      }

      // Clean up
      runningCommands.value.delete(sessionId)
    }
  }

  /**
   * Monitor a line of input (when user types a command)
   */
  const monitorInput = (sessionId: string, input: string) => {
    // Check if this is a Claude command
    const trimmedInput = input.trim()

    if (trimmedInput && isClaudeCommand(trimmedInput)) {
      startMonitoring(sessionId, trimmedInput)
    }
  }

  /**
   * Stop monitoring a session (e.g., when session closes)
   */
  const stopMonitoring = (sessionId: string) => {
    runningCommands.value.delete(sessionId)
  }

  /**
   * Format duration in human-readable format
   */
  const formatDuration = (ms: number): string => {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)

    if (hours > 0) {
      return `${hours}小时 ${minutes % 60}分钟`
    } else if (minutes > 0) {
      return `${minutes}分钟 ${seconds % 60}秒`
    } else {
      return `${seconds}秒`
    }
  }

  /**
   * Truncate long commands for display
   */
  const truncateCommand = (command: string, maxLength = 50): string => {
    if (command.length <= maxLength) {
      return command
    }
    return command.substring(0, maxLength - 3) + '...'
  }

  return {
    runningCommands,
    monitorInput,
    processOutput,
    stopMonitoring,
    isClaudeCommand,
  }
}
