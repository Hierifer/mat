// Auto-generated from git history. Do not edit manually.
// Regenerate: node scripts/generate-changelog.mjs

export interface ChangelogEntry {
  date: string
  features: string[]
  fixes: string[]
}

export const changelog: Record<string, ChangelogEntry> = {
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
  '1.4.1': {
    date: '2026-06-10',
    features: [
      'migrate speech recognition to DashScope with real-time streaming',
      'add Alibaba Cloud speech recognition, manual update restart, and fix xterm scroll jump',
      'add XTermManager for centralized terminal lifecycle and resource recycling',
    ],
    fixes: [
      'skip update prompt when current version matches remote',
      'request macOS folder access permissions on startup',
      'add process plugin for relaunch ACL permission',
    ],
  },
  '1.3.2': {
    date: '2026-06-02',
    features: [
      'proactively request microphone permission on macOS',
      'preserve terminal state across app updates',
      'add preset layouts and terminal keyword search',
    ],
    fixes: [],
  },
  '1.2.6': {
    date: '2026-05-29',
    features: [
      'add inactive pane brightness slider in settings',
    ],
    fixes: [
      'move new tab button next to tab list',
    ],
  },
  '1.2.5': {
    date: '2026-05-29',
    features: [],
    fixes: [
      'pane active border not triggering when clicking terminal content',
    ],
  },
  '1.2.4': {
    date: '2026-05-28',
    features: [
      'show update dialog immediately with loading state when checking',
    ],
    fixes: [],
  },
  '1.2.3': {
    date: '2026-05-28',
    features: [],
    fixes: [
      'resolve cursor being pushed below status bar when running Claude Code',
    ],
  },
  '1.2.2': {
    date: '2026-05-27',
    features: [
      'add What\'s New dialog and fix updater download progress',
    ],
    fixes: [],
  },
  '1.2.1': {
    date: '2026-05-27',
    features: [],
    fixes: [
      'disable App Sandbox to restore PTY/shell functionality',
    ],
  },
  '1.2.0': {
    date: '2026-05-27',
    features: [],
    fixes: [
      'pin Node.js 22 and pnpm 10 in CI to fix build compatibility',
    ],
  },
}
