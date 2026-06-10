// Auto-generated from git history. Do not edit manually.
// Regenerate: node scripts/generate-changelog.mjs

export interface ChangelogEntry {
  date: string
  features: string[]
  fixes: string[]
}

export const changelog: Record<string, ChangelogEntry> = {
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
  '1.1.0': {
    date: '2026-05-19',
    features: [
      'add conversation sidebar mode, auto window title, and background notifications',
      'rename project from mat to Materm',
      'add Chinese/English i18n support with language switcher in settings',
      'add drag-to-resize divider for split panes',
      'add copyright notice to Windows and Linux bundles',
    ],
    fixes: [
      'enable App Sandbox entitlement for App Store submission',
      'use Info.plist file for LSApplicationCategoryType instead of inline object',
      'add LSApplicationCategoryType for App Store submission',
      'update bundle identifier to com.neohex.mat',
      'rename Mat to Materm in about modal',
      'update main.rs to use renamed materm_lib crate',
      'install create-dmg on macOS CI to fix DMG bundling',
      'skip DMG bundling on macOS, only build .app for App Store',
      'remove invalid deb copyright field and fix nsis language schema',
      'update gitignore paths and terminal layout after restructuring',
    ],
  },
  '0.2.1': {
    date: '2026-04-05',
    features: [],
    fixes: [
      'Aggressive fix for xterm selection position growth',
      'Prevent infinite row growth in xterm buffer',
      'Prevent terminal renderer crash on split pane creation',
    ],
  },
}
