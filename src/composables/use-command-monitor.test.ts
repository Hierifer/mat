import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// Mock dependencies
vi.mock('./use-notification', () => ({
  useNotification: () => ({
    notifyTaskComplete: vi.fn(),
    notifyInfo: vi.fn(),
  }),
}))
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({ setTitle: vi.fn() }),
}))
vi.mock('@/settings/themes', () => ({
  themes: { 'VS Code Dark': { name: 'VS Code Dark' } },
}))
vi.mock('@xterm/addon-serialize', () => ({ SerializeAddon: vi.fn() }))
vi.mock('@/composables/xterm-manager', () => ({ getAllTerminals: () => new Map() }))

import { useCommandMonitor } from './use-command-monitor'

describe('useCommandMonitor', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  // ---------------------------------------------------------------------------
  // isClaudeCommand / isAICommand
  // ---------------------------------------------------------------------------
  describe('isClaudeCommand', () => {
    it('detects "claude " command', () => {
      const { isClaudeCommand } = useCommandMonitor()
      expect(isClaudeCommand('claude fix the bug')).toBe(true)
    })

    it('detects "npx @claude" command', () => {
      const { isClaudeCommand } = useCommandMonitor()
      expect(isClaudeCommand('npx @claude/cli')).toBe(true)
    })

    it('detects "claude-code" command', () => {
      const { isClaudeCommand } = useCommandMonitor()
      expect(isClaudeCommand('claude-code run')).toBe(true)
    })

    it('does not match unrelated commands', () => {
      const { isClaudeCommand } = useCommandMonitor()
      expect(isClaudeCommand('ls -la')).toBe(false)
      expect(isClaudeCommand('git commit')).toBe(false)
    })
  })

  describe('isAICommand', () => {
    it('detects Claude commands', () => {
      const { isAICommand } = useCommandMonitor()
      expect(isAICommand('claude help')).toBe(true)
    })

    it('detects Codex commands', () => {
      const { isAICommand } = useCommandMonitor()
      expect(isAICommand('codex run')).toBe(true)
      expect(isAICommand('npx codex')).toBe(true)
      expect(isAICommand('npx @openai/codex')).toBe(true)
    })

    it('does not match unrelated commands', () => {
      const { isAICommand } = useCommandMonitor()
      expect(isAICommand('npm install')).toBe(false)
    })
  })

  // ---------------------------------------------------------------------------
  // monitorInput / startMonitoring
  // ---------------------------------------------------------------------------
  describe('monitorInput', () => {
    it('starts monitoring for an AI command', () => {
      const { monitorInput, runningCommands } = useCommandMonitor()
      monitorInput('sess_1', 'claude fix bug')

      expect(runningCommands.value.has('sess_1')).toBe(true)
    })

    it('ignores non-AI commands', () => {
      const { monitorInput, runningCommands } = useCommandMonitor()
      monitorInput('sess_1', 'ls -la')

      expect(runningCommands.value.has('sess_1')).toBe(false)
    })

    it('ignores empty input', () => {
      const { monitorInput, runningCommands } = useCommandMonitor()
      monitorInput('sess_1', '   ')

      expect(runningCommands.value.has('sess_1')).toBe(false)
    })
  })

  // ---------------------------------------------------------------------------
  // processOutput / completion detection
  // ---------------------------------------------------------------------------
  describe('processOutput', () => {
    it('accumulates output lines', async () => {
      const { monitorInput, processOutput, runningCommands } = useCommandMonitor()
      monitorInput('sess_1', 'claude do something')

      await processOutput('sess_1', 'line 1')
      await processOutput('sess_1', 'line 2')

      const cmd = runningCommands.value.get('sess_1')
      expect(cmd?.outputLines.length).toBe(2)
    })

    it('detects completion on clean shell prompt', async () => {
      const { monitorInput, processOutput, runningCommands } = useCommandMonitor()
      monitorInput('sess_1', 'claude fix')

      // Send the shell prompt pattern
      await processOutput('sess_1', '  $  ')

      // Command should be cleaned up
      expect(runningCommands.value.has('sess_1')).toBe(false)
    })

    it('does not fire on shell prompt with fewer than 5 output lines', async () => {
      const { monitorInput, processOutput, runningCommands } = useCommandMonitor()
      monitorInput('sess_1', 'claude fix')

      await processOutput('sess_1', 'line 1')
      await processOutput('sess_1', 'line 2')
      // $ at end (general pattern) — but only 3 lines so shouldn't complete
      await processOutput('sess_1', 'prompt $')

      expect(runningCommands.value.has('sess_1')).toBe(true)
    })

    it('fires general completion pattern after sufficient output', async () => {
      const { monitorInput, processOutput, runningCommands } = useCommandMonitor()
      monitorInput('sess_1', 'claude fix')

      // Push more than 5 lines
      for (let i = 0; i < 6; i++) {
        await processOutput('sess_1', `line ${i}`)
      }

      // Now a shell prompt should trigger completion
      await processOutput('sess_1', 'user@host $')

      expect(runningCommands.value.has('sess_1')).toBe(false)
    })

    it('ignores output for unmonitored sessions', async () => {
      const { processOutput, runningCommands } = useCommandMonitor()
      // No monitorInput call — session not tracked
      await processOutput('sess_unknown', 'some output')

      expect(runningCommands.value.size).toBe(0)
    })
  })

  // ---------------------------------------------------------------------------
  // stopMonitoring
  // ---------------------------------------------------------------------------
  describe('stopMonitoring', () => {
    it('removes a tracked session', () => {
      const { monitorInput, stopMonitoring, runningCommands } = useCommandMonitor()
      monitorInput('sess_1', 'claude run')
      expect(runningCommands.value.has('sess_1')).toBe(true)

      stopMonitoring('sess_1')
      expect(runningCommands.value.has('sess_1')).toBe(false)
    })

    it('does nothing for an unknown session', () => {
      const { stopMonitoring, runningCommands } = useCommandMonitor()
      stopMonitoring('nonexistent')
      expect(runningCommands.value.size).toBe(0)
    })
  })
})
