export interface ChangelogEntry {
  date: string
  features: string[]
  fixes: string[]
}

export const changelog: Record<string, ChangelogEntry> = {
  '1.2.2': {
    date: '2025-05-27',
    features: [
      "What's New dialog on version update",
    ],
    fixes: [
      'Fix download progress showing NaN during update',
      'Fix app not restarting after update download',
    ],
  },
  '1.2.1': {
    date: '2025-05-27',
    features: [],
    fixes: [
      'Disable App Sandbox to restore PTY/shell functionality',
    ],
  },
  '1.2.0': {
    date: '2025-05-26',
    features: [],
    fixes: [
      'Pin Node.js 22 and pnpm 10 in CI to fix build compatibility',
    ],
  },
  '1.1.0': {
    date: '2025-05-25',
    features: [
      'Conversation sidebar mode',
      'Auto window title',
      'Background notifications for command completion',
    ],
    fixes: [],
  },
}
