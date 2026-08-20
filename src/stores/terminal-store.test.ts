import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { invoke } from '@tauri-apps/api/core'
import { useTerminalStore, type SplitNode, type SavedLayoutSnapshot } from './terminal-store'

// Mock Tauri and heavy dependencies so the store can be imported in Node/happy-dom
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({ setTitle: vi.fn() }),
}))
vi.mock('@/settings/themes', () => ({
  themes: { 'VS Code Dark': { name: 'VS Code Dark' } },
}))
vi.mock('@xterm/addon-serialize', () => ({
  SerializeAddon: vi.fn(),
}))
vi.mock('@/composables/xterm-manager', () => ({
  getAllTerminals: () => new Map(),
}))

describe('terminal-store tab notifications', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  // ---------------------------------------------------------------------------
  // findTabBySessionId
  // ---------------------------------------------------------------------------
  describe('findTabBySessionId', () => {
    it('returns the tab id for a single-pane tab', () => {
      const store = useTerminalStore()
      store.tabs.push({
        id: 'tab_1',
        title: 'Test',
        layout: { type: 'pane', paneId: 'p1', sessionId: 'sess_abc' },
        createdAt: Date.now(),
      })

      expect(store.findTabBySessionId('sess_abc')).toBe('tab_1')
    })

    it('returns the tab id when sessionId is nested in a split layout', () => {
      const store = useTerminalStore()
      const layout: SplitNode = {
        type: 'horizontal',
        children: [
          { type: 'pane', paneId: 'p1', sessionId: 'sess_1', size: 50 },
          {
            type: 'vertical',
            size: 50,
            children: [
              { type: 'pane', paneId: 'p2', sessionId: 'sess_2', size: 50 },
              { type: 'pane', paneId: 'p3', sessionId: 'sess_target', size: 50 },
            ],
          },
        ],
      }
      store.tabs.push({ id: 'tab_deep', title: 'Deep', layout, createdAt: Date.now() })

      expect(store.findTabBySessionId('sess_target')).toBe('tab_deep')
    })

    it('returns null when sessionId does not exist', () => {
      const store = useTerminalStore()
      store.tabs.push({
        id: 'tab_1',
        title: 'Test',
        layout: { type: 'pane', paneId: 'p1', sessionId: 'sess_abc' },
        createdAt: Date.now(),
      })

      expect(store.findTabBySessionId('nonexistent')).toBeNull()
    })

    it('returns the correct tab when multiple tabs exist', () => {
      const store = useTerminalStore()
      store.tabs.push(
        {
          id: 'tab_a',
          title: 'A',
          layout: { type: 'pane', paneId: 'p1', sessionId: 'sess_a' },
          createdAt: Date.now(),
        },
        {
          id: 'tab_b',
          title: 'B',
          layout: { type: 'pane', paneId: 'p2', sessionId: 'sess_b' },
          createdAt: Date.now(),
        },
      )

      expect(store.findTabBySessionId('sess_b')).toBe('tab_b')
    })
  })

  // ---------------------------------------------------------------------------
  // addTabNotification / clearTabNotification
  // ---------------------------------------------------------------------------
  describe('addTabNotification', () => {
    it('adds a tab id to the notifications list', () => {
      const store = useTerminalStore()
      store.addTabNotification('tab_1')

      expect(store.tabNotifications).toEqual(['tab_1'])
    })

    it('does not duplicate an already-existing notification', () => {
      const store = useTerminalStore()
      store.addTabNotification('tab_1')
      store.addTabNotification('tab_1')

      expect(store.tabNotifications).toEqual(['tab_1'])
    })

    it('can hold notifications for multiple tabs', () => {
      const store = useTerminalStore()
      store.addTabNotification('tab_1')
      store.addTabNotification('tab_2')

      expect(store.tabNotifications).toEqual(['tab_1', 'tab_2'])
    })
  })

  describe('clearTabNotification', () => {
    it('removes a notification by tab id', () => {
      const store = useTerminalStore()
      store.addTabNotification('tab_1')
      store.addTabNotification('tab_2')
      store.clearTabNotification('tab_1')

      expect(store.tabNotifications).toEqual(['tab_2'])
    })

    it('does nothing when the tab id is not in the list', () => {
      const store = useTerminalStore()
      store.addTabNotification('tab_1')
      store.clearTabNotification('tab_nonexistent')

      expect(store.tabNotifications).toEqual(['tab_1'])
    })
  })
})

// ---------------------------------------------------------------------------
// tmux session persistence & restore
// ---------------------------------------------------------------------------
describe('terminal-store tmux persistence', () => {
  const mockInvoke = invoke as ReturnType<typeof vi.fn>

  beforeEach(() => {
    setActivePinia(createPinia())
    mockInvoke.mockReset()
    localStorage.clear()
    // Simulate Tauri environment
    ;(window as any).__TAURI_INTERNALS__ = {}
  })

  afterEach(() => {
    delete (window as any).__TAURI_INTERNALS__
  })

  describe('spawnPtyForPane / createTab', () => {
    it('records paneId -> tmux session mapping when tmux mode is enabled', async () => {
      const store = useTerminalStore()
      store.tmuxEnabled = true

      mockInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === 'pty_spawn') {
          return { session_id: 'sess_1', cwd: '/home/user', tmux_session_name: 'mat_abc' }
        }
        return undefined
      })

      await store.createTab()

      expect(store.tabs).toHaveLength(1)
      const paneId = store.tabs[0].layout.paneId!
      expect(store.sessionMapping[paneId]).toBe('mat_abc')
      expect(store.tabs[0].layout.sessionId).toBe('sess_1')

      // pty_spawn must have been called with tmuxEnabled: true
      const spawnCall = mockInvoke.mock.calls.find(c => c[0] === 'pty_spawn')!
      expect(spawnCall[1]).toMatchObject({ tmuxEnabled: true })
      // Mapping must be persisted
      expect(mockInvoke.mock.calls.some(c => c[0] === 'settings_update')).toBe(true)
    })

    it('does not record a mapping when tmux mode is disabled', async () => {
      const store = useTerminalStore()
      store.tmuxEnabled = false

      mockInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === 'pty_spawn') {
          return { session_id: 'sess_1', cwd: '/home/user', tmux_session_name: null }
        }
        return undefined
      })

      await store.createTab()

      expect(store.tabs).toHaveLength(1)
      expect(Object.keys(store.sessionMapping)).toHaveLength(0)
    })

    it('falls back to a plain shell when tmux spawn fails', async () => {
      const store = useTerminalStore()
      store.tmuxEnabled = true

      mockInvoke.mockImplementation(async (cmd: string, args: any) => {
        if (cmd === 'pty_spawn') {
          if (args.tmuxEnabled) throw new Error('tmux not found')
          return { session_id: 'sess_plain', cwd: '/home/user', tmux_session_name: null }
        }
        return undefined
      })

      const result = await store.spawnPtyForPane('pane_x')

      expect(result.sessionId).toBe('sess_plain')
      expect(store.sessionMapping['pane_x']).toBeUndefined()
      const spawnCalls = mockInvoke.mock.calls.filter(c => c[0] === 'pty_spawn')
      expect(spawnCalls).toHaveLength(2)
      expect(spawnCalls[1][1]).toMatchObject({ tmuxEnabled: false })
    })
  })

  describe('closeTab', () => {
    it('kills the tmux session and removes the mapping when tmux is enabled', async () => {
      const store = useTerminalStore()
      store.tmuxEnabled = true
      store.sessionMapping = { p1: 'mat_1' }
      store.tabs.push({
        id: 'tab_1',
        title: 'T',
        layout: { type: 'pane', paneId: 'p1', sessionId: 'sess_1' },
        createdAt: Date.now(),
      })

      mockInvoke.mockResolvedValue(undefined)

      await store.closeTab('tab_1')

      const closeCall = mockInvoke.mock.calls.find(c => c[0] === 'pty_close')!
      expect(closeCall[1]).toMatchObject({ sessionId: 'sess_1', killTmux: true })
      expect(store.sessionMapping['p1']).toBeUndefined()
      expect(store.tabs).toHaveLength(0)
    })

    it('does not kill tmux when tmux mode is disabled', async () => {
      const store = useTerminalStore()
      store.tmuxEnabled = false
      store.tabs.push({
        id: 'tab_1',
        title: 'T',
        layout: { type: 'pane', paneId: 'p1', sessionId: 'sess_1' },
        createdAt: Date.now(),
      })

      mockInvoke.mockResolvedValue(undefined)

      await store.closeTab('tab_1')

      const closeCall = mockInvoke.mock.calls.find(c => c[0] === 'pty_close')!
      expect(closeCall[1]).toMatchObject({ sessionId: 'sess_1', killTmux: false })
    })
  })

  describe('saveLayoutSnapshot', () => {
    it('persists tabs without sessionIds to localStorage', () => {
      const store = useTerminalStore()
      store.tabs.push({
        id: 'tab_1',
        title: '~/project',
        layout: {
          type: 'horizontal',
          children: [
            { type: 'pane', paneId: 'p1', sessionId: 'sess_1', cwd: '/a', size: 50 },
            { type: 'pane', paneId: 'p2', sessionId: 'sess_2', cwd: '/b', size: 50 },
          ],
        },
        createdAt: Date.now(),
      })
      store.activeTabId = 'tab_1'
      store.activePaneId = 'p2'

      store.saveLayoutSnapshot()

      const snapshot: SavedLayoutSnapshot = JSON.parse(localStorage.getItem('materm_tmux_layout')!)
      expect(snapshot.tabs).toHaveLength(1)
      expect(snapshot.activeTabId).toBe('tab_1')
      expect(snapshot.activePaneId).toBe('p2')
      const [c1, c2] = snapshot.tabs[0].layout.children!
      expect(c1).toEqual({ type: 'pane', paneId: 'p1', cwd: '/a', size: 50 })
      expect(c2.sessionId).toBeUndefined()
    })
  })

  describe('restoreSessions', () => {
    it('rebuilds layout by reattaching live sessions and respawning dead ones', async () => {
      const store = useTerminalStore()
      store.tmuxEnabled = true
      store.sessionMapping = { p1: 'mat_alive', p2: 'mat_dead' }

      const snapshot: SavedLayoutSnapshot = {
        tabs: [
          {
            id: 'tab_1',
            title: '~/work',
            layout: {
              type: 'horizontal',
              children: [
                { type: 'pane', paneId: 'p1', cwd: '/work/a', size: 50 },
                { type: 'pane', paneId: 'p2', cwd: '/work/b', size: 50 },
              ],
            },
          },
        ],
        activeTabId: 'tab_1',
        activePaneId: 'p1',
      }
      localStorage.setItem('materm_tmux_layout', JSON.stringify(snapshot))

      mockInvoke.mockImplementation(async (cmd: string, args: any) => {
        if (cmd === 'tmux_list_sessions') {
          return [
            { name: 'mat_alive', attached: false, created: 0, windows: 1 },
            { name: 'other_session', attached: false, created: 0, windows: 1 },
          ]
        }
        if (cmd === 'tmux_attach_session') {
          return { session_id: `attached_${args.name}`, cwd: '/work/a', tmux_session_name: args.name }
        }
        if (cmd === 'pty_spawn') {
          return { session_id: 'spawned_new', cwd: args.cwd || '/home', tmux_session_name: 'mat_new' }
        }
        return undefined
      })

      await store.restoreSessions()

      expect(store.tabs).toHaveLength(1)
      const [c1, c2] = store.tabs[0].layout.children!
      // p1 reattached to its live tmux session
      expect(c1.sessionId).toBe('attached_mat_alive')
      expect(c1.paneId).toBe('p1')
      // p2's session was dead -> respawned (new tmux session, cwd preserved)
      expect(c2.sessionId).toBe('spawned_new')
      expect(store.sessionMapping['p2']).toBe('mat_new')
      // active tab/pane restored
      expect(store.activeTabId).toBe('tab_1')
      expect(store.activePaneId).toBe('p1')
    })

    it('attaches orphan mat_ sessions as standalone tabs', async () => {
      const store = useTerminalStore()
      store.tmuxEnabled = true
      store.sessionMapping = { p1: 'mat_alive' }

      const snapshot: SavedLayoutSnapshot = {
        tabs: [
          {
            id: 'tab_1',
            title: '~/work',
            layout: { type: 'pane', paneId: 'p1', cwd: '/work' },
          },
        ],
        activeTabId: 'tab_1',
        activePaneId: 'p1',
      }
      localStorage.setItem('materm_tmux_layout', JSON.stringify(snapshot))

      mockInvoke.mockImplementation(async (cmd: string, args: any) => {
        if (cmd === 'tmux_list_sessions') {
          return [
            { name: 'mat_alive', attached: false, created: 0, windows: 1 },
            { name: 'mat_orphan', attached: false, created: 0, windows: 1 },
          ]
        }
        if (cmd === 'tmux_attach_session') {
          return { session_id: `attached_${args.name}`, cwd: '/work', tmux_session_name: args.name }
        }
        return undefined
      })

      await store.restoreSessions()

      expect(store.tabs).toHaveLength(2)
      // Orphan session got its own tab
      const orphanTab = store.tabs.find(t => t.title === 'mat_orphan')
      expect(orphanTab).toBeDefined()
      expect(orphanTab!.layout.sessionId).toBe('attached_mat_orphan')
      // Active tab restored from snapshot, not overridden by orphan attach
      expect(store.activeTabId).toBe('tab_1')
      expect(store.activePaneId).toBe('p1')
    })

    it('cleans up stale sessionMapping entries after restore', async () => {
      const store = useTerminalStore()
      store.tmuxEnabled = true
      store.sessionMapping = { p1: 'mat_alive', p_gone: 'mat_gone' }

      const snapshot: SavedLayoutSnapshot = {
        tabs: [
          {
            id: 'tab_1',
            title: '~/work',
            layout: { type: 'pane', paneId: 'p1', cwd: '/work' },
          },
        ],
        activeTabId: 'tab_1',
        activePaneId: 'p1',
      }
      localStorage.setItem('materm_tmux_layout', JSON.stringify(snapshot))

      mockInvoke.mockImplementation(async (cmd: string, args: any) => {
        if (cmd === 'tmux_list_sessions') {
          return [{ name: 'mat_alive', attached: false, created: 0, windows: 1 }]
        }
        if (cmd === 'tmux_attach_session') {
          return { session_id: `attached_${args.name}`, cwd: '/work', tmux_session_name: args.name }
        }
        return undefined
      })

      await store.restoreSessions()

      expect(store.sessionMapping['p1']).toBe('mat_alive')
      expect(store.sessionMapping['p_gone']).toBeUndefined()
    })

    it('creates a default tab when there is no snapshot and no live session', async () => {
      const store = useTerminalStore()
      store.tmuxEnabled = true

      mockInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === 'tmux_list_sessions') return []
        if (cmd === 'pty_spawn') {
          return { session_id: 'sess_new', cwd: '/home/user', tmux_session_name: 'mat_new' }
        }
        return undefined
      })

      await store.restoreSessions()

      expect(store.tabs).toHaveLength(1)
      expect(store.tabs[0].layout.sessionId).toBe('sess_new')
    })

    it('falls back to a default tab when restore throws', async () => {
      const store = useTerminalStore()
      store.tmuxEnabled = true

      mockInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === 'tmux_list_sessions') throw new Error('tmux failure')
        if (cmd === 'pty_spawn') {
          return { session_id: 'sess_fallback', cwd: '/home/user', tmux_session_name: null }
        }
        return undefined
      })

      await store.restoreSessions()

      expect(store.tabs).toHaveLength(1)
      expect(store.tabs[0].layout.sessionId).toBe('sess_fallback')
    })
  })
})

// ---------------------------------------------------------------------------
// Studio mode
// ---------------------------------------------------------------------------
describe('terminal-store studio mode', () => {
  const mockInvoke = invoke as ReturnType<typeof vi.fn>

  function addStudioTab(store: ReturnType<typeof useTerminalStore>, id = 'stab_1') {
    store.studioTabs.push({
      id,
      project: { path: '/repo', name: 'repo', defaultBranch: 'main' },
      branches: [],
      activeBranchId: null,
      gitStatus: [],
      gitLog: [],
      gitStashes: [],
    })
    store.activeStudioTabId = id
    return store.studioTabs[store.studioTabs.length - 1]
  }

  beforeEach(() => {
    setActivePinia(createPinia())
    mockInvoke.mockReset()
    localStorage.clear()
    ;(window as any).__TAURI_INTERNALS__ = {}
  })

  afterEach(() => {
    delete (window as any).__TAURI_INTERNALS__
  })

  describe('createStudioBranch', () => {
    beforeEach(() => {
      mockInvoke.mockImplementation(async (cmd: string, args: any) => {
        if (cmd === 'git_create_worktree') {
          // Return the worktreePath that was passed in (mirror real backend behavior)
          return args?.worktreePath ?? args?.worktree_path ?? '/repo/.materm-worktrees/fallback'
        }
        if (cmd === 'pty_spawn') return { session_id: 'sess_branch', cwd: args?.cwd }
        if (cmd === 'git_status' || cmd === 'git_log' || cmd === 'git_stash_list') return []
        return undefined
      })
    })

    it('creates a worktree branch defaulting to the agent view', async () => {
      const store = useTerminalStore()
      const tab = addStudioTab(store)

      await store.createStudioBranch('feat/login')

      expect(tab.branches).toHaveLength(1)
      const branch = tab.branches[0]
      expect(branch.name).toBe('feat/login')
      expect(branch.viewMode).toBe('agent')
      expect(branch.sessionId).toBe('sess_branch')
      expect(branch.worktreePath).toBe('/repo/.materm-worktrees/feat-login')
      expect(tab.activeBranchId).toBe(branch.id)

      const worktreeCall = mockInvoke.mock.calls.find(c => c[0] === 'git_create_worktree')!
      expect(worktreeCall[1]).toMatchObject({
        repoPath: '/repo',
        branchName: 'feat/login',
        baseBranch: 'main',
      })
    })

    it('does not auto-start the claude TUI in the terminal', async () => {
      vi.useFakeTimers()
      try {
        const store = useTerminalStore()
        addStudioTab(store)

        await store.createStudioBranch('feat/x')
        await vi.advanceTimersByTimeAsync(2000)

        expect(mockInvoke.mock.calls.filter(c => c[0] === 'pty_write')).toHaveLength(0)
      } finally {
        vi.useRealTimers()
      }
    })
  })

  describe('setStudioBranchViewMode', () => {
    it('switches the view mode of the given branch', () => {
      const store = useTerminalStore()
      const tab = addStudioTab(store)
      tab.branches.push({
        id: 'b1',
        name: 'feat/a',
        worktreePath: '/repo/.materm-worktrees/feat-a',
        sessionId: 'sess_1',
        paneId: 'p1',
        createdAt: Date.now(),
        viewMode: 'agent',
      })

      store.setStudioBranchViewMode('b1', 'terminal')
      expect(tab.branches[0].viewMode).toBe('terminal')

      store.setStudioBranchViewMode('b1', 'agent')
      expect(tab.branches[0].viewMode).toBe('agent')
    })

    it('does nothing for an unknown branch id', () => {
      const store = useTerminalStore()
      addStudioTab(store)

      expect(() => store.setStudioBranchViewMode('nope', 'terminal')).not.toThrow()
    })
  })

  describe('recent projects', () => {
    it('records a project at the front of the list and persists it', () => {
      const store = useTerminalStore()
      store.recordRecentProject('/repo/a', 'a')
      store.recordRecentProject('/repo/b', 'b')

      expect(store.studioRecentProjects.map(p => p.path)).toEqual(['/repo/b', '/repo/a'])
      const saved = JSON.parse(localStorage.getItem('materm_studio_recent_projects')!)
      expect(saved.map((p: any) => p.path)).toEqual(['/repo/b', '/repo/a'])
    })

    it('moves an existing project to the front instead of duplicating it', () => {
      const store = useTerminalStore()
      store.recordRecentProject('/repo/a', 'a')
      store.recordRecentProject('/repo/b', 'b')
      store.recordRecentProject('/repo/a', 'a')

      expect(store.studioRecentProjects.map(p => p.path)).toEqual(['/repo/a', '/repo/b'])
    })

    it('caps the list at 15 entries', () => {
      const store = useTerminalStore()
      for (let i = 0; i < 20; i++) {
        store.recordRecentProject(`/repo/${i}`, `${i}`)
      }

      expect(store.studioRecentProjects).toHaveLength(15)
      expect(store.studioRecentProjects[0].path).toBe('/repo/19')
    })

    it('removes a project from the list', () => {
      const store = useTerminalStore()
      store.recordRecentProject('/repo/a', 'a')
      store.recordRecentProject('/repo/b', 'b')

      store.removeRecentProject('/repo/a')

      expect(store.studioRecentProjects.map(p => p.path)).toEqual(['/repo/b'])
    })
  })

  describe('displayMode default & persistence', () => {
    it('defaults to studio mode when nothing is saved', () => {
      const store = useTerminalStore()
      expect(store.displayMode).toBe('studio')
    })

    it('respects a previously saved tabs mode', () => {
      localStorage.setItem('materm_display_mode', 'tabs')
      setActivePinia(createPinia())
      const store = useTerminalStore()

      expect(store.displayMode).toBe('tabs')
    })

    it('falls back to studio for an invalid saved value', () => {
      localStorage.setItem('materm_display_mode', 'bogus')
      setActivePinia(createPinia())
      const store = useTerminalStore()

      expect(store.displayMode).toBe('studio')
    })

    it('persists the mode when changed', () => {
      const store = useTerminalStore()
      store.setDisplayMode('tabs')

      expect(localStorage.getItem('materm_display_mode')).toBe('tabs')

      store.setDisplayMode('studio')
      expect(localStorage.getItem('materm_display_mode')).toBe('studio')
    })

    it('persists tabs mode when exiting studio', async () => {
      const store = useTerminalStore()
      mockInvoke.mockResolvedValue(undefined)

      await store.exitStudioMode()

      expect(store.displayMode).toBe('tabs')
      expect(localStorage.getItem('materm_display_mode')).toBe('tabs')
    })
  })

  describe('closeStudioTab', () => {
    it('returns to the home view when the last project tab closes', async () => {
      const store = useTerminalStore()
      store.displayMode = 'studio'
      const tab = addStudioTab(store)
      tab.branches.push({
        id: 'b1',
        name: 'feat/a',
        worktreePath: '/repo/.materm-worktrees/feat-a',
        sessionId: 'sess_1',
        paneId: 'p1',
        createdAt: Date.now(),
        viewMode: 'agent',
      })
      mockInvoke.mockResolvedValue(undefined)

      await store.closeStudioTab('stab_1')

      expect(store.studioTabs).toHaveLength(0)
      expect(store.activeStudioTabId).toBeNull()
      expect(store.displayMode).toBe('studio')
      const closeCall = mockInvoke.mock.calls.find(c => c[0] === 'pty_close')!
      expect(closeCall[1]).toEqual({ sessionId: 'sess_1' })
    })
  })
})
