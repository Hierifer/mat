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

  // Patterns to detect Codex commands
  const codexCommandPatterns = [
    /codex\s+/i,            // codex command
    /npx\s+codex/i,         // npx codex
    /npx\s+@openai\/codex/i, // npx @openai/codex
  ]

  // Patterns to detect command completion
  const completionPatterns = [
    /\$\s*$/,               // Shell prompt (bash/zsh)
    /%\s*$/,                // Shell prompt (zsh)
    />\s*$/,                // Shell prompt (cmd/powershell)
    /\n$/,                  // Empty newline (potential end)
  ]

  // Special Claude completion patterns
  // NOTE: Patterns must be strict to avoid false positives. Previously
  // /done/i matched any line containing "done", causing premature
  // completion detection during normal Claude Code output.
  const claudeCompletionPatterns = [
    /^\s*\$\s*$/,              // Clean shell prompt (task truly finished)
  ]

  /**
   * Check if a line contains a Claude command
   */
  const isClaudeCommand = (line: string): boolean => {
    return claudeCommandPatterns.some(pattern => pattern.test(line))
  }

  /**
   * Check if a line contains any AI command (Claude or Codex)
   */
  const isAICommand = (line: string): boolean => {
    return isClaudeCommand(line) || codexCommandPatterns.some(pattern => pattern.test(line))
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
    if (!isAICommand(command)) {
      return false
    }

    console.log('[CommandMonitor] Started monitoring AI command:', command)

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

      const isCodex = codexCommandPatterns.some(p => p.test(running.command))
      const toolName = isCodex ? 'Codex' : 'Claude'

      console.log(`[CommandMonitor] ${toolName} command completed:`, {
        command: running.command,
        duration: durationText,
        outputLines: running.outputLines.length,
      })

      // Send system notification only when app is in background (not focused)
      if (store.enableCommandNotifications && !document.hasFocus()) {
        await notifyTaskComplete(
          `${toolName} 任务完成`,
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
    // Check if this is an AI command (Claude or Codex)
    const trimmedInput = input.trim()

    if (trimmedInput && isAICommand(trimmedInput)) {
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
    isAICommand,
  }
}
