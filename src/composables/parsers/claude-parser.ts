import type { OutputParser } from '../use-task-status'

/**
 * Claude-specific metrics
 */
export interface ClaudeMetrics {
  inputTokens: number | null
  outputTokens: number | null
  cacheReadTokens: number | null
  cacheWriteTokens: number | null
  cost: number | null
  contextPercent: number | null
}

/**
 * Claude Code output parser
 */
export class ClaudeOutputParser implements OutputParser<ClaudeMetrics> {
  private spinnerChars = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

  /**
   * Strip ANSI escape codes and control characters
   */
  stripFormatting(text: string): string {
    return text
      .replace(/\x1b\[[0-9;]*[mGKHF]/g, '')
      .replace(/\x1b\][^\x07]*\x07/g, '')
  }

  /**
   * Parse token and cost information
   * Format: "Tokens: 1,234 input, 567 output (cache: 890 read, 123 write) | Cost: $0.012"
   */
  parseMetrics(line: string): Partial<ClaudeMetrics> | null {
    const result: Partial<ClaudeMetrics> = {}

    // Input/output tokens
    const tokenMatch = line.match(/(\d[\d,]*)\s+input,\s*(\d[\d,]*)\s+output/)
    if (tokenMatch) {
      result.inputTokens = parseInt(tokenMatch[1].replace(/,/g, ''))
      result.outputTokens = parseInt(tokenMatch[2].replace(/,/g, ''))
    }

    // Cache tokens
    const cacheMatch = line.match(/cache:\s*(\d[\d,]*)\s+read,\s*(\d[\d,]*)\s+write/)
    if (cacheMatch) {
      result.cacheReadTokens = parseInt(cacheMatch[1].replace(/,/g, ''))
      result.cacheWriteTokens = parseInt(cacheMatch[2].replace(/,/g, ''))
    }

    // Cost
    const costMatch = line.match(/Cost:\s*\$?([\d.]+)/)
    if (costMatch) {
      result.cost = parseFloat(costMatch[1])
    }

    // Context window percentage
    const contextMatch = line.match(/context\s*(?:window)?\s*(?:usage)?[:\s]+(\d+)\s*%/i)
    if (contextMatch) {
      result.contextPercent = parseInt(contextMatch[1])
    }

    return Object.keys(result).length > 0 ? result : null
  }

  /**
   * Parse current action from spinner or bullet lines
   */
  parseAction(line: string): string | null {
    // Check for spinner characters
    for (const ch of this.spinnerChars) {
      if (line.includes(ch)) {
        return line.replace(ch, '').trim()
      }
    }

    // Claude Code bullet action lines: "● ToolName..."
    const bulletMatch = line.match(/^[●•]\s+(.+)/)
    if (bulletMatch) {
      return bulletMatch[1].trim()
    }

    return null
  }

  /**
   * Detect Claude completion markers
   */
  isComplete(line: string): boolean {
    const completionPatterns = [
      /task\s+complete/i,
      /done/i,
      /finished/i,
      /successfully\s+completed/i,
      /\[✓\]/,
      /✅/,
    ]

    return completionPatterns.some(pattern => pattern.test(line))
  }
}

/**
 * Helper function to format token counts
 */
export function formatTokens(n: number | null): string {
  if (n === null) return '-'
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

/**
 * Helper function to get context window color
 */
export function getContextColor(percent: number | null): string {
  if (percent === null) return '#52c41a'
  if (percent >= 90) return '#ff4d4f'
  if (percent >= 70) return '#fa8c16'
  return '#52c41a'
}
