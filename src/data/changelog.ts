// Auto-generated from git history. Do not edit manually.
// Regenerate: node scripts/generate-changelog.mjs

export interface ChangelogEntry {
  date: string
  features: string[]
  fixes: string[]
}

export const changelog: Record<string, ChangelogEntry> = {
  '1.7.3': {
    date: '2026-10-10',
    features: [
      'add draggable sidebar divider in Studio mode',
      'remove merge functionality (worktree does not support merge)',
      'add file browser + Monaco editor tab to Studio mode',
      'auto-resume agent session when process dies',
    ],
    fixes: [
      'use nextTick focus instead of autofocus for branch rename input',
      'update agent_spawn test assertion to include resumeSessionId',
    ],
  },
  '1.7.2': {
    date: '2026-10-09',
    features: [
      'restore active worktree sessions, agent resume, and status dot improvements',
    ],
    fixes: [],
  },
  '1.7.1': {
    date: '2026-10-09',
    features: [
      'agent interrupt button, suggested replies, and native notifications',
    ],
    fixes: [
      'studio sidebar layout — align status dots, show action buttons, cancel rename on blur',
    ],
  },
  '1.7.0': {
    date: '2026-09-30',
    features: [
      'Studio mode enhancements — SQLite chat persistence, agent panel improvements, notifications',
    ],
    fixes: [],
  },
  '1.6.2': {
    date: '2026-09-30',
    features: [
      'xterm terminal pre-warm pool for faster tab creation',
    ],
    fixes: [
      'restore terminal windows after system restart',
    ],
  },
  '1.6.0': {
    date: '2026-09-08',
    features: [
      'non-blocking update progress bar and SVG window control icons',
      'persist terminal state on quit and add manual clear option',
      'agent panel improvements, clipboard utilities, and notification enhancements',
    ],
    fixes: [
      'use toMatchObject in agent session test for forward compatibility',
      'harden createStudioBranch test mock for CI compatibility',
    ],
  },
  '1.5.3': {
    date: '2026-08-20',
    features: [],
    fixes: [
      'release microphone when speech recognition is not in use',
    ],
  },
  '1.5.2': {
    date: '2026-07-17',
    features: [],
    fixes: [
      'studio branch creation reuses existing branches/worktrees; theme-aware studio content background',
    ],
  },
  '1.5.1': {
    date: '2026-07-17',
    features: [
      'Chrome-style tab bar — active tab matches content color, inactive blends into bar',
    ],
    fixes: [
      'shifted symbol keys (e.g. Shift+9) swallowed by WebKit IME composition in terminal',
    ],
  },
  '1.5.0': {
    date: '2026-07-16',
    features: [
      'add Claude Code agent studio panel and drop-in SVG icon system',
      'auto-reattach tmux sessions with layout restore on restart',
      'add TTS voice announcements on Claude Code completion and qlty config',
      'add git tree/stash management with git2-rs and multi-project studio tabs',
      'add notification sound and breathing red dot on Claude Code completion',
      'restore cwd on update restart, add shell integration for OSC 7, fix speech input and resize',
    ],
    fixes: [
      'auto-create initial commit for empty repos so studio branch creation works',
      'drop git2 https/ssh features to unblock CI openssl-sys build failure',
      'ensure terminal textarea focus on click and share claude status state',
      'prevent terminal scroll reset during Claude Code usage',
    ],
  },
}
