import { describe, it, expect } from 'vitest'
import { ClaudeOutputParser, formatTokens, getContextColor } from './claude-parser'

describe('ClaudeOutputParser', () => {
  const parser = new ClaudeOutputParser()

  // ---------------------------------------------------------------------------
  // stripFormatting
  // ---------------------------------------------------------------------------
  describe('stripFormatting', () => {
    it('strips ANSI color codes', () => {
      expect(parser.stripFormatting('\x1b[32mgreen\x1b[0m')).toBe('green')
    })

    it('strips cursor movement codes', () => {
      expect(parser.stripFormatting('\x1b[2Khello\x1b[1G')).toBe('hello')
    })

    it('strips OSC sequences', () => {
      expect(parser.stripFormatting('\x1b]0;title\x07text')).toBe('text')
    })

    it('returns plain text unchanged', () => {
      expect(parser.stripFormatting('hello world')).toBe('hello world')
    })
  })

  // ---------------------------------------------------------------------------
  // parseMetrics
  // ---------------------------------------------------------------------------
  describe('parseMetrics', () => {
    it('parses input and output tokens', () => {
      const result = parser.parseMetrics('Tokens: 1,234 input, 567 output')
      expect(result).toEqual(
        expect.objectContaining({ inputTokens: 1234, outputTokens: 567 }),
      )
    })

    it('parses tokens without commas', () => {
      const result = parser.parseMetrics('Tokens: 100 input, 50 output')
      expect(result).toEqual(
        expect.objectContaining({ inputTokens: 100, outputTokens: 50 }),
      )
    })

    it('parses cache read and write tokens', () => {
      const result = parser.parseMetrics('(cache: 890 read, 123 write)')
      expect(result).toEqual(
        expect.objectContaining({ cacheReadTokens: 890, cacheWriteTokens: 123 }),
      )
    })

    it('parses cost', () => {
      const result = parser.parseMetrics('Cost: $0.012')
      expect(result).toEqual(expect.objectContaining({ cost: 0.012 }))
    })

    it('parses cost without dollar sign', () => {
      const result = parser.parseMetrics('Cost: 0.05')
      expect(result).toEqual(expect.objectContaining({ cost: 0.05 }))
    })

    it('parses context window percentage', () => {
      const result = parser.parseMetrics('context window usage: 45%')
      expect(result).toEqual(expect.objectContaining({ contextPercent: 45 }))
    })

    it('parses a full metrics line with all fields', () => {
      const line =
        'Tokens: 10,500 input, 3,200 output (cache: 5,000 read, 1,000 write) | Cost: $0.123 | context: 62%'
      const result = parser.parseMetrics(line)
      expect(result).toEqual({
        inputTokens: 10500,
        outputTokens: 3200,
        cacheReadTokens: 5000,
        cacheWriteTokens: 1000,
        cost: 0.123,
        contextPercent: 62,
      })
    })

    it('returns null when no metrics found', () => {
      expect(parser.parseMetrics('hello world')).toBeNull()
    })
  })

  // ---------------------------------------------------------------------------
  // parseAction
  // ---------------------------------------------------------------------------
  describe('parseAction', () => {
    it('parses a spinner line', () => {
      const result = parser.parseAction('⠋ Reading file...')
      expect(result).toBe('Reading file...')
    })

    it('parses various spinner characters', () => {
      expect(parser.parseAction('⠹ Writing')).toBe('Writing')
      expect(parser.parseAction('⠧ Thinking')).toBe('Thinking')
    })

    it('parses bullet action lines with ●', () => {
      expect(parser.parseAction('● Edit src/main.ts')).toBe('Edit src/main.ts')
    })

    it('parses bullet action lines with •', () => {
      expect(parser.parseAction('• Read file.txt')).toBe('Read file.txt')
    })

    it('returns null for plain text', () => {
      expect(parser.parseAction('just some output')).toBeNull()
    })
  })

  // ---------------------------------------------------------------------------
  // isComplete
  // ---------------------------------------------------------------------------
  describe('isComplete', () => {
    it('always returns false (disabled by design)', () => {
      expect(parser.isComplete('$ ')).toBe(false)
      expect(parser.isComplete('done')).toBe(false)
    })
  })
})

// ---------------------------------------------------------------------------
// formatTokens
// ---------------------------------------------------------------------------
describe('formatTokens', () => {
  it('returns "-" for null', () => {
    expect(formatTokens(null)).toBe('-')
  })

  it('returns the number as string below 1000', () => {
    expect(formatTokens(500)).toBe('500')
  })

  it('formats thousands with k suffix', () => {
    expect(formatTokens(1000)).toBe('1.0k')
    expect(formatTokens(1500)).toBe('1.5k')
    expect(formatTokens(12345)).toBe('12.3k')
  })
})

// ---------------------------------------------------------------------------
// getContextColor
// ---------------------------------------------------------------------------
describe('getContextColor', () => {
  it('returns green for null', () => {
    expect(getContextColor(null)).toBe('#52c41a')
  })

  it('returns green for low usage', () => {
    expect(getContextColor(30)).toBe('#52c41a')
    expect(getContextColor(69)).toBe('#52c41a')
  })

  it('returns orange for 70-89%', () => {
    expect(getContextColor(70)).toBe('#fa8c16')
    expect(getContextColor(89)).toBe('#fa8c16')
  })

  it('returns red for 90%+', () => {
    expect(getContextColor(90)).toBe('#ff4d4f')
    expect(getContextColor(100)).toBe('#ff4d4f')
  })
})
