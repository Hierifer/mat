import { defineStore } from 'pinia'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { themes, type ITheme } from "@/settings/themes";
import { SerializeAddon } from '@xterm/addon-serialize'
import { getAllTerminals } from '@/composables/xterm-manager'

const SAVED_STATE_KEY = 'materm_terminal_state'
const TMUX_LAYOUT_KEY = 'materm_tmux_layout'
const RECENT_PROJECTS_KEY = 'materm_studio_recent_projects'
const RECENT_PROJECTS_MAX = 15
const DISPLAY_MODE_KEY = 'materm_display_mode'

export interface SavedTerminalState {
  tabs: Array<{
    id: string
    title: string
    titleManuallySet?: boolean
    layout: SplitNode
  }>
  activeTabId: string | null
  activePaneId: string | null
  paneContents: Record<string, string> // paneId -> serialized terminal content
}

export interface SavedLayoutSnapshot {
  tabs: Array<{
    id: string
    title: string
    titleManuallySet?: boolean
    layout: SplitNode
  }>
  activeTabId: string | null
  activePaneId: string | null
}

export interface TerminalTab {
  id: string
  title: string
  titleManuallySet?: boolean
  layout: SplitNode
  createdAt: number
}

export interface SplitNode {
  type: 'horizontal' | 'vertical' | 'pane'
  children?: SplitNode[]
  paneId?: string
  sessionId?: string
  cwd?: string // current working directory
  size?: number // percentage
}

export interface TmuxSessionInfo {
  name: string
  attached: boolean
  created: number
  windows: number
}

export interface AppSettings {
  tmuxEnabled: boolean
  tmuxScrollbackLimit: number
  sessionMapping: Record<string, string>
}

export interface StudioProject {
  path: string              // repository root directory
  name: string              // repository name (directory name)
  defaultBranch: string     // detected default branch
}

export interface StudioRecentProject {
  path: string
  name: string
  lastOpenedAt: number
}

// Studio is the default layout; the user's last choice is persisted
function loadDisplayMode(): 'tabs' | 'studio' {
  const saved = localStorage.getItem(DISPLAY_MODE_KEY)
  return saved === 'tabs' || saved === 'studio' ? saved : 'studio'
}

function loadRecentProjects(): StudioRecentProject[] {
  try {
    const raw = localStorage.getItem(RECENT_PROJECTS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed
    }
  } catch (err) {
    console.warn('[Studio] Invalid recent projects data, ignoring:', err)
  }
  return []
}

export interface StudioBranch {
  id: string                // unique ID
  name: string              // branch name (e.g. feat/login)
  worktreePath: string      // worktree directory path
  sessionId: string | null  // PTY session ID (lazy-created)
  paneId: string            // pane ID
  createdAt: number
  viewMode: 'agent' | 'terminal'  // which view is shown for this branch
}

export interface GitFileStatus {
  path: string
  status: string   // "modified" | "new" | "deleted" | "renamed" | "typechange"
  staged: boolean
}

export interface GitCommitInfo {
  hash: string
  short_hash: string
  message: string
  author: string
  timestamp: number
  parent_count: number
}

export interface GitStashEntry {
  index: number
  message: string
  timestamp: number
}

export interface StudioTab {
  id: string
  project: StudioProject
  branches: StudioBranch[]
  activeBranchId: string | null
  gitStatus: GitFileStatus[]
  gitLog: GitCommitInfo[]
  gitStashes: GitStashEntry[]
}

function shortenPath(cwd: string): string {
  return cwd
    .replace(/^\/Users\/[^/]+/, '~')
    .replace(/^\/home\/[^/]+/, '~')
}

// Strip sessionId from a layout tree (sessions are recreated on restore)
function stripSessionIds(node: SplitNode): SplitNode {
  if (node.type === 'pane') {
    return { type: 'pane', paneId: node.paneId, cwd: node.cwd, size: node.size }
  }
  return {
    type: node.type,
    size: node.size,
    children: node.children?.map(stripSessionIds),
  }
}

export const useTerminalStore = defineStore("terminal", {
  state: () => ({
    tabs: [] as TerminalTab[],
    activeTabId: null as string | null,
    activePaneId: null as string | null,
    currentThemeName: "VS Code Dark" as string,
    themeMode: 'auto' as 'auto' | 'light' | 'dark', // 主题模式
    isSettingsOpen: false,
    isAboutOpen: false,
    dimInactivePanes: true, // 未聚焦窗格变灰功能
    inactivePaneBrightness: 85 as number, // 未聚焦窗格亮度 (0-100)
    enableCommandNotifications: true, // Claude 命令完成通知
    fontSize: 13 as number, // 字体大小
    locale: 'zh-CN' as string, // 语言
    // tmux related
    tmuxEnabled: false,
    tmuxSessions: [] as TmuxSessionInfo[],
    sessionMapping: {} as Record<string, string>, // paneId -> tmux session name
    isSessionManagerOpen: false,
    displayMode: loadDisplayMode() as 'tabs' | 'studio', // 布局模式（默认 studio，记住上次选择）
    // Studio mode state (multi-project tabs)
    studioTabs: [] as StudioTab[],
    activeStudioTabId: null as string | null, // null = home tab (recent projects)
    studioRecentProjects: loadRecentProjects() as StudioRecentProject[],
    // Speech recognition settings
    speechProvider: 'whisper' as 'whisper' | 'alibaba',
    alibabaApiKey: '' as string,
    // TTS (voice announcements) settings
    enableVoiceAnnouncements: false,
    ttsVoice: 'longxiaochun' as string,
    // Transient: saved pane contents during restore (not persisted)
    _savedPaneContents: null as Record<string, string> | null,
    // Tab notifications (breathing red dot for completed Claude tasks)
    tabNotifications: [] as string[],
    // Git panel loading flag (studio mode)
    studioGitLoading: false,
  }),

  getters: {
    currentTheme(state): ITheme {
      return themes[state.currentThemeName] || themes["VS Code Dark"];
    },
    availableThemes(): string[] {
      return Object.keys(themes);
    },
    activeTab: (state) => state.tabs.find((t) => t.id === state.activeTabId),
    activeStudioTab: (state) => state.studioTabs.find((t) => t.id === state.activeStudioTabId),
    studioProject(): StudioProject | null {
      return this.activeStudioTab?.project ?? null
    },
    studioBranches(): StudioBranch[] {
      return this.activeStudioTab?.branches ?? []
    },
    activeStudioBranchId(): string | null {
      return this.activeStudioTab?.activeBranchId ?? null
    },
    activeStudioBranch(): StudioBranch | undefined {
      const tab = this.activeStudioTab
      if (!tab) return undefined
      return tab.branches.find((b: StudioBranch) => b.id === tab.activeBranchId)
    },
    studioGitStatus(): GitFileStatus[] {
      return this.activeStudioTab?.gitStatus ?? []
    },
    studioGitLog(): GitCommitInfo[] {
      return this.activeStudioTab?.gitLog ?? []
    },
    studioGitStashes(): GitStashEntry[] {
      return this.activeStudioTab?.gitStashes ?? []
    },
  },

  actions: {
    toggleSettings() {
      this.isSettingsOpen = !this.isSettingsOpen;
    },

    toggleAbout() {
      this.isAboutOpen = !this.isAboutOpen;
    },

    setTheme(themeName: string) {
      if (themes[themeName]) {
        this.currentThemeName = themeName;
      }
    },

    toggleDimInactivePanes() {
      this.dimInactivePanes = !this.dimInactivePanes;
    },

    setInactivePaneBrightness(value: number) {
      this.inactivePaneBrightness = Math.max(0, Math.min(100, Math.round(value)));
    },

    toggleCommandNotifications() {
      this.enableCommandNotifications = !this.enableCommandNotifications;
    },

    setThemeMode(mode: 'auto' | 'light' | 'dark') {
      this.themeMode = mode;
      this.applyThemeMode();
    },

    setFontSize(size: number) {
      this.fontSize = Math.max(8, Math.min(32, size)); // 限制范围 8-32
    },

    increaseFontSize() {
      this.setFontSize(this.fontSize + 1);
    },

    decreaseFontSize() {
      this.setFontSize(this.fontSize - 1);
    },

    resetFontSize() {
      this.setFontSize(13);
    },

    setLocale(locale: string) {
      this.locale = locale;
    },

    applyThemeMode() {
      if (this.themeMode === 'auto') {
        // 检测系统主题
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const defaultTheme = prefersDark ? 'VS Code Dark' : 'VS Code Light';
        if (this.currentThemeName.includes('Dark') || this.currentThemeName.includes('Light')) {
          this.setTheme(defaultTheme);
        }
      } else if (this.themeMode === 'light') {
        // 切换到浅色主题
        if (this.currentThemeName.includes('Dark')) {
          this.setTheme('VS Code Light');
        }
      } else if (this.themeMode === 'dark') {
        // 切换到深色主题
        if (this.currentThemeName.includes('Light')) {
          this.setTheme('VS Code Dark');
        }
      }
    },

    // Helper: Find node by paneId
    findNodeByPaneId(node: SplitNode, paneId: string): SplitNode | null {
      if (node.type === "pane" && node.paneId === paneId) {
        return node;
      }
      if (node.children) {
        for (const child of node.children) {
          const found = this.findNodeByPaneId(child, paneId);
          if (found) return found;
        }
      }
      return null;
    },

    // Helper: Replace node in tree
    replaceNode(root: SplitNode, paneId: string, newNode: SplitNode): boolean {
      if (root.children) {
        for (let i = 0; i < root.children.length; i++) {
          const child = root.children[i];
          if (child.type === "pane" && child.paneId === paneId) {
            root.children[i] = newNode;
            return true;
          }
          if (this.replaceNode(child, paneId, newNode)) {
            return true;
          }
        }
      }
      return false;
    },

    /**
     * Unified PTY spawn entry for all pane-creation paths.
     * Spawns with tmux when tmux mode is enabled (falling back to a plain
     * shell if tmux spawn fails), and records the paneId -> tmux session
     * mapping for later reattach.
     */
    async spawnPtyForPane(paneId: string, cwd?: string): Promise<{ sessionId: string; cwd: string }> {
      let sessionId = `mock_session_${Date.now()}`;
      let resolvedCwd = cwd || "~";

      // @ts-ignore
      if (!window.__TAURI_INTERNALS__) {
        console.warn("Tauri environment not detected. Using mock session ID.");
        return { sessionId, cwd: resolvedCwd };
      }

      const spawn = (tmuxEnabled: boolean) =>
        invoke<{ session_id: string; cwd: string; tmux_session_name?: string | null }>(
          "pty_spawn",
          { cols: 80, rows: 24, tmuxEnabled, cwd: cwd || undefined },
        );

      try {
        let response;
        try {
          response = await spawn(this.tmuxEnabled);
        } catch (error) {
          if (!this.tmuxEnabled) throw error;
          // tmux spawn failed (e.g. tmux not installed) — fall back to plain shell
          console.warn("tmux spawn failed, falling back to plain shell:", error);
          response = await spawn(false);
        }
        sessionId = response.session_id;
        resolvedCwd = response.cwd;

        if (response.tmux_session_name) {
          this.sessionMapping[paneId] = response.tmux_session_name;
          await this.saveSessionMapping();
        }
      } catch (error) {
        console.error("Failed to spawn PTY session:", error);
      }

      return { sessionId, cwd: resolvedCwd };
    },

    async createTab() {
      const tabId = `tab_${Date.now()}`;
      const paneId = `pane_${Date.now()}`;

      const { sessionId, cwd } = await this.spawnPtyForPane(paneId);

      const tab: TerminalTab = {
        id: tabId,
        title: shortenPath(cwd),
        layout: {
          type: "pane",
          paneId,
          sessionId,
          cwd,
        },
        createdAt: Date.now(),
      };

      this.tabs.push(tab);
      this.activeTabId = tabId;
      this.activePaneId = paneId;
    },

    async closeTab(tabId: string) {
      const tab = this.tabs.find((t) => t.id === tabId);
      if (!tab) return;

      // Close all PTY sessions in this tab
      await this.closeSessionsInLayout(tab.layout);

      this.tabs = this.tabs.filter((t) => t.id !== tabId);

      if (this.activeTabId === tabId) {
        this.activeTabId = this.tabs[0]?.id || null;
      }
    },

    async closeSessionsInLayout(node: SplitNode) {
      if (node.type === "pane" && node.sessionId) {
        console.log(`[Store] Closing PTY session: ${node.sessionId}`);
        try {
          // @ts-ignore
          if (window.__TAURI_INTERNALS__) {
            await invoke("pty_close", {
              sessionId: node.sessionId,
              killTmux: this.tmuxEnabled,
            });
            console.log(
              `[Store] Successfully closed session: ${node.sessionId}`,
            );
          }
        } catch (error) {
          console.error("Failed to close PTY session:", error);
        }
        if (node.paneId && this.sessionMapping[node.paneId]) {
          delete this.sessionMapping[node.paneId];
          await this.saveSessionMapping();
        }
      } else if (node.children) {
        for (const child of node.children) {
          await this.closeSessionsInLayout(child);
        }
      }
    },

    setActiveTab(tabId: string) {
      this.activeTabId = tabId;

      const tab = this.tabs.find((t) => t.id === tabId);
      if (tab) {
        // Fire-and-forget: don't block UI for IPC
        this.syncWindowTitle(tab.title);
      }
    },

    updateTabTitle(tabId: string, title: string, manual = false) {
      const tab = this.tabs.find((t) => t.id === tabId);
      if (tab) {
        tab.title = title;
        if (manual) {
          tab.titleManuallySet = true;
        }
        // Sync OS window title if this is the active tab
        if (tabId === this.activeTabId) {
          this.syncWindowTitle(title);
        }
      }
    },

    async syncWindowTitle(title: string) {
      try {
        // @ts-ignore
        if (window.__TAURI_INTERNALS__) {
          await getCurrentWindow().setTitle(title ? `${title} - Materm` : 'Materm')
        }
      } catch (error) {
        console.error('Failed to sync window title:', error)
      }
    },

    setActivePane(paneId: string) {
      this.activePaneId = paneId;
      // Update tab title to reflect the new active pane's CWD
      const tab = this.activeTab;
      if (tab && !tab.titleManuallySet) {
        const node = this.findNodeByPaneId(tab.layout, paneId);
        if (node?.type === 'pane' && node.cwd) {
          tab.title = shortenPath(node.cwd);
          this.syncWindowTitle(tab.title);
        }
      }
    },

    updatePaneCwd(paneId: string, cwd: string) {
      for (const tab of this.tabs) {
        const node = this.findNodeByPaneId(tab.layout, paneId);
        if (node && node.type === "pane") {
          node.cwd = cwd;
          // Auto-update tab title to CWD when this pane is active in this tab
          if (!tab.titleManuallySet && paneId === this.activePaneId) {
            tab.title = shortenPath(cwd);
            if (tab.id === this.activeTabId) {
              this.syncWindowTitle(tab.title);
            }
          }
          break;
        }
      }
    },

    async splitPane(paneId: string, direction: "horizontal" | "vertical") {
      const tab = this.activeTab;
      if (!tab) return;

      const targetNode = this.findNodeByPaneId(tab.layout, paneId);
      if (!targetNode || targetNode.type !== "pane") return;

      // Create new PTY session (inherit cwd from the pane being split)
      const newPaneId = `pane_${Date.now()}`;
      const { sessionId, cwd } = await this.spawnPtyForPane(newPaneId, targetNode.cwd);

      // Build new layout with two panes
      const newLayout: SplitNode = {
        type: direction,
        children: [
          { ...targetNode, size: 50 },
          {
            type: "pane",
            paneId: newPaneId,
            sessionId,
            cwd,
            size: 50,
          },
        ],
      };

      // Handle root node replacement
      if (tab.layout.paneId === paneId) {
        tab.layout = newLayout;
      } else {
        this.replaceNode(tab.layout, paneId, newLayout);
      }

      // Set the newly created pane as active
      this.activePaneId = newPaneId;
    },

    async closePane(paneId: string) {
      const tab = this.activeTab;
      if (!tab) return;

      // If closing the root pane, close the entire tab
      if (tab.layout.type === "pane" && tab.layout.paneId === paneId) {
        await this.closeTab(tab.id);
        return;
      }

      // Find parent and remove the pane
      const removed = this.removePaneFromLayout(tab.layout, paneId);
      if (removed) {
        // Cleanup will happen through closeSessionsInLayout if needed
      }
    },

    // Helper: Remove pane and simplify layout
    removePaneFromLayout(node: SplitNode, paneId: string): boolean {
      if (!node.children) return false;

      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];

        if (child.type === "pane" && child.paneId === paneId) {
          // Close the session
          if (child.sessionId) {
            try {
              // @ts-ignore
              if (window.__TAURI_INTERNALS__) {
                invoke("pty_close", {
                  sessionId: child.sessionId,
                  killTmux: this.tmuxEnabled,
                });
              }
            } catch (error) {
              console.error("Failed to close PTY session:", error);
            }
          }
          if (this.sessionMapping[paneId]) {
            delete this.sessionMapping[paneId];
            this.saveSessionMapping();
          }

          // Remove this child
          node.children.splice(i, 1);

          // If only one child left, collapse the parent
          if (node.children.length === 1) {
            const remaining = node.children[0];
            node.type = remaining.type;
            node.children = remaining.children;
            node.paneId = remaining.paneId;
            node.sessionId = remaining.sessionId;
            node.size = remaining.size;
          }

          return true;
        }

        // Recursively search in children
        if (this.removePaneFromLayout(child, paneId)) {
          return true;
        }
      }

      return false;
    },

    // Update sizes of children in a split node
    updateChildSizes(parentNode: SplitNode, sizes: number[]) {
      if (!parentNode.children || parentNode.children.length !== sizes.length) return
      parentNode.children.forEach((child, i) => {
        child.size = sizes[i]
      })
    },

    // ============================================================================
    // tmux Actions
    // ============================================================================

    async initTmux() {
      try {
        // @ts-ignore
        if (!window.__TAURI_INTERNALS__) return;

        // Load settings from backend
        const settings = await invoke<AppSettings>('settings_get');
        this.tmuxEnabled = settings.tmuxEnabled;
        this.sessionMapping = settings.sessionMapping;

        if (this.tmuxEnabled) {
          await this.loadTmuxSessions();
        }
      } catch (error) {
        console.error('Failed to initialize tmux:', error);
      }
    },

    async toggleTmux(enabled: boolean) {
      this.tmuxEnabled = enabled;
      try {
        await invoke('settings_update', {
          settings: {
            tmuxEnabled: enabled,
            tmuxScrollbackLimit: 0,
            sessionMapping: this.sessionMapping,
          }
        });

        if (enabled) {
          await this.loadTmuxSessions();
        }
      } catch (error) {
        console.error('Failed to toggle tmux:', error);
      }
    },

    async loadTmuxSessions() {
      try {
        this.tmuxSessions = await invoke<TmuxSessionInfo[]>('tmux_list_sessions');
      } catch (error) {
        console.error('Failed to load tmux sessions:', error);
        this.tmuxSessions = [];
      }
    },

    async createTabWithTmux(sessionName?: string) {
      const tabId = `tab_${Date.now()}`;
      const paneId = `pane_${Date.now()}`;

      let sessionId = `mock_session_${Date.now()}`;
      let cwd = "~";

      try {
        // @ts-ignore
        if (window.__TAURI_INTERNALS__) {
          const response = await invoke<{ session_id: string; cwd: string; tmux_session_name?: string | null }>(
            "pty_spawn",
            {
              cols: 80,
              rows: 24,
              tmuxEnabled: this.tmuxEnabled,
              tmuxSessionName: sessionName,
            },
          );
          sessionId = response.session_id;
          cwd = response.cwd;

          // Store session mapping if tmux is enabled
          if (response.tmux_session_name) {
            this.sessionMapping[paneId] = response.tmux_session_name;
            await this.saveSessionMapping();
          }

          console.log(`[Store] Created PTY session: ${sessionId}`);
        }
      } catch (error) {
        console.error("Failed to spawn PTY session:", error);
      }

      const tab: TerminalTab = {
        id: tabId,
        title: sessionName || "Terminal",
        layout: {
          type: "pane",
          paneId,
          sessionId,
          cwd,
        },
        createdAt: Date.now(),
      };

      this.tabs.push(tab);
      this.activeTabId = tabId;
      this.activePaneId = paneId;
    },

    async attachToTmuxSession(sessionName: string) {
      const tabId = `tab_${Date.now()}`;
      const paneId = `pane_${Date.now()}`;

      try {
        // @ts-ignore
        if (!window.__TAURI_INTERNALS__) {
          console.warn('Cannot attach to tmux session: Not in Tauri environment');
          return;
        }

        const response = await invoke<{ session_id: string; cwd: string }>(
          "tmux_attach_session",
          {
            name: sessionName,
            cols: 80,
            rows: 24,
          },
        );

        // Store session mapping
        this.sessionMapping[paneId] = sessionName;
        await this.saveSessionMapping();

        const tab: TerminalTab = {
          id: tabId,
          title: sessionName,
          layout: {
            type: "pane",
            paneId,
            sessionId: response.session_id,
            cwd: response.cwd,
          },
          createdAt: Date.now(),
        };

        this.tabs.push(tab);
        this.activeTabId = tabId;
        this.activePaneId = paneId;

        await this.loadTmuxSessions();
      } catch (error) {
        console.error('Failed to attach to tmux session:', error);
      }
    },

    /**
     * Persist the current tab/split layout (without sessionIds) so that
     * tmux sessions can be reattached into the same layout after restart.
     */
    saveLayoutSnapshot() {
      try {
        const snapshot: SavedLayoutSnapshot = {
          tabs: this.tabs.map(tab => ({
            id: tab.id,
            title: tab.title,
            titleManuallySet: tab.titleManuallySet,
            layout: stripSessionIds(tab.layout),
          })),
          activeTabId: this.activeTabId,
          activePaneId: this.activePaneId,
        };
        localStorage.setItem(TMUX_LAYOUT_KEY, JSON.stringify(snapshot));
      } catch (err) {
        console.error('[Store] Failed to save layout snapshot:', err);
      }
    },

    /**
     * Recursively rebuild a layout tree by reattaching to live tmux sessions
     * (via sessionMapping) or spawning fresh sessions for dead panes.
     */
    async rebuildTmuxLayout(
      node: SplitNode,
      aliveNames: Set<string>,
      usedSessions: Set<string>,
    ): Promise<SplitNode> {
      if (node.type === 'pane') {
        const paneId = node.paneId || `pane_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const mapped = this.sessionMapping[paneId];

        if (mapped && aliveNames.has(mapped) && !usedSessions.has(mapped)) {
          usedSessions.add(mapped);
          try {
            const response = await invoke<{ session_id: string; cwd: string }>(
              'tmux_attach_session',
              { name: mapped, cols: 80, rows: 24 },
            );
            return {
              type: 'pane',
              paneId,
              sessionId: response.session_id,
              cwd: response.cwd || node.cwd,
              size: node.size,
            };
          } catch (error) {
            console.error(`[Store] Failed to reattach tmux session ${mapped}:`, error);
          }
        }

        // Session is gone (or attach failed) — spawn a fresh one in the saved cwd
        const { sessionId, cwd } = await this.spawnPtyForPane(paneId, node.cwd);
        return {
          type: 'pane',
          paneId,
          sessionId,
          cwd: cwd || node.cwd,
          size: node.size,
        };
      }

      const children: SplitNode[] = [];
      for (const child of node.children || []) {
        children.push(await this.rebuildTmuxLayout(child, aliveNames, usedSessions));
      }
      return { type: node.type, size: node.size, children };
    },

    /**
     * Restore terminals after restart in tmux mode: rebuild the saved layout
     * by reattaching live tmux sessions, attach orphan mat_ sessions as
     * standalone tabs, and clean up stale sessionMapping entries.
     */
    async restoreSessions() {
      try {
        // @ts-ignore
        if (!window.__TAURI_INTERNALS__) {
          await this.createTab();
          return;
        }

        const sessions = await invoke<TmuxSessionInfo[]>('tmux_list_sessions');
        const aliveNames = new Set(
          sessions.filter(s => s.name.startsWith('mat_')).map(s => s.name),
        );

        let snapshot: SavedLayoutSnapshot | null = null;
        try {
          const raw = localStorage.getItem(TMUX_LAYOUT_KEY);
          if (raw) snapshot = JSON.parse(raw);
        } catch (err) {
          console.warn('[Store] Invalid layout snapshot, ignoring:', err);
        }

        const usedSessions = new Set<string>();

        // 1. Rebuild tabs from the layout snapshot
        if (snapshot?.tabs?.length) {
          for (const savedTab of snapshot.tabs) {
            const layout = await this.rebuildTmuxLayout(savedTab.layout, aliveNames, usedSessions);
            this.tabs.push({
              id: savedTab.id,
              title: savedTab.title,
              titleManuallySet: savedTab.titleManuallySet,
              layout,
              createdAt: Date.now(),
            });
          }
        }

        // 2. Orphan mat_ sessions not referenced by the snapshot -> standalone tabs
        for (const name of aliveNames) {
          if (!usedSessions.has(name)) {
            await this.attachToTmuxSession(name);
          }
        }

        // 3. Fallback: nothing restored at all
        if (this.tabs.length === 0) {
          await this.createTab();
          return;
        }

        // 4. Restore active tab/pane from snapshot (attachToTmuxSession may have overridden them)
        if (snapshot?.activeTabId && this.tabs.find(t => t.id === snapshot!.activeTabId)) {
          this.activeTabId = snapshot.activeTabId;
          if (snapshot.activePaneId) {
            this.activePaneId = snapshot.activePaneId;
          }
        } else if (!this.activeTabId) {
          this.activeTabId = this.tabs[0].id;
        }

        const activeTab = this.tabs.find(t => t.id === this.activeTabId);
        if (activeTab) {
          this.syncWindowTitle(activeTab.title);
        }

        // 5. Clean up sessionMapping entries whose panes no longer exist
        const validPaneIds = new Set<string>();
        const collectPaneIds = (node: SplitNode) => {
          if (node.type === 'pane' && node.paneId) validPaneIds.add(node.paneId);
          node.children?.forEach(collectPaneIds);
        };
        for (const tab of this.tabs) collectPaneIds(tab.layout);

        let mappingChanged = false;
        for (const paneId of Object.keys(this.sessionMapping)) {
          if (!validPaneIds.has(paneId)) {
            delete this.sessionMapping[paneId];
            mappingChanged = true;
          }
        }
        if (mappingChanged) {
          await this.saveSessionMapping();
        }

        console.log(`[Store] Restored ${this.tabs.length} tabs from tmux sessions`);
      } catch (error) {
        console.error('Failed to restore sessions:', error);
        if (this.tabs.length === 0) {
          await this.createTab(); // Fallback to default tab
        }
      }
    },

    async killTmuxSession(sessionName: string) {
      try {
        await invoke('tmux_kill_session', { name: sessionName });
        await this.loadTmuxSessions();

        // Remove from session mapping
        for (const [paneId, name] of Object.entries(this.sessionMapping)) {
          if (name === sessionName) {
            delete this.sessionMapping[paneId];
          }
        }
        await this.saveSessionMapping();

        console.log(`Killed tmux session: ${sessionName}`);
      } catch (error) {
        console.error('Failed to kill tmux session:', error);
      }
    },

    async renameTmuxSession(oldName: string, newName: string) {
      try {
        await invoke('tmux_rename_session', { oldName, newName });
        await this.loadTmuxSessions();

        // Update session mapping
        for (const [paneId, name] of Object.entries(this.sessionMapping)) {
          if (name === oldName) {
            this.sessionMapping[paneId] = newName;
          }
        }
        await this.saveSessionMapping();

        // Update tab titles
        for (const tab of this.tabs) {
          if (tab.title === oldName) {
            tab.title = newName;
          }
        }

        console.log(`Renamed tmux session: ${oldName} -> ${newName}`);
      } catch (error) {
        console.error('Failed to rename tmux session:', error);
      }
    },

    async saveSessionMapping() {
      try {
        await invoke('settings_update', {
          settings: {
            tmuxEnabled: this.tmuxEnabled,
            tmuxScrollbackLimit: 0,
            sessionMapping: this.sessionMapping,
          }
        });
      } catch (error) {
        console.error('Failed to save session mapping:', error);
      }
    },

    toggleSessionManager() {
      this.isSessionManagerOpen = !this.isSessionManagerOpen;
    },

    toggleDisplayMode() {
      if (this.displayMode === 'studio') {
        this.exitStudioMode()
      } else {
        this.setDisplayMode('studio')
      }
    },

    setDisplayMode(mode: 'tabs' | 'studio') {
      this.displayMode = mode
      localStorage.setItem(DISPLAY_MODE_KEY, mode)
    },

    // ============================================================================
    // Studio Mode Actions
    // ============================================================================

    saveRecentProjects() {
      try {
        localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(this.studioRecentProjects))
      } catch (err) {
        console.error('[Studio] Failed to save recent projects:', err)
      }
    },

    recordRecentProject(path: string, name: string) {
      this.studioRecentProjects = [
        { path, name, lastOpenedAt: Date.now() },
        ...this.studioRecentProjects.filter(p => p.path !== path),
      ].slice(0, RECENT_PROJECTS_MAX)
      this.saveRecentProjects()
    },

    removeRecentProject(path: string) {
      this.studioRecentProjects = this.studioRecentProjects.filter(p => p.path !== path)
      this.saveRecentProjects()
    },

    goStudioHome() {
      this.activeStudioTabId = null
    },

    async addStudioProject(projectPath: string) {
      // @ts-ignore
      if (!window.__TAURI_INTERNALS__) return

      // Already open — just switch to that tab
      const existing = this.studioTabs.find(t => t.project.path === projectPath)
      if (existing) {
        this.activeStudioTabId = existing.id
        this.recordRecentProject(existing.project.path, existing.project.name)
        this.refreshAllGitInfo()
        return
      }

      const info = await invoke<{ default_branch: string; repo_name: string }>(
        'git_validate_repo',
        { path: projectPath },
      )

      const tabId = `studio_project_${Date.now()}`
      const newTab: StudioTab = {
        id: tabId,
        project: {
          path: projectPath,
          name: info.repo_name,
          defaultBranch: info.default_branch,
        },
        branches: [],
        activeBranchId: null,
        gitStatus: [],
        gitLog: [],
        gitStashes: [],
      }

      this.studioTabs.push(newTab)
      this.activeStudioTabId = tabId
      this.recordRecentProject(projectPath, info.repo_name)
      console.log(`[Studio] Added project ${info.repo_name}`)
    },

    async exitStudioMode() {
      // Close all branch sessions across all project tabs
      for (const tab of this.studioTabs) {
        for (const branch of tab.branches) {
          if (branch.sessionId) {
            try {
              // @ts-ignore
              if (window.__TAURI_INTERNALS__) {
                await invoke('pty_close', { sessionId: branch.sessionId })
              }
            } catch (error) {
              console.error(`[Studio] Failed to close session for branch ${branch.name}:`, error)
            }
          }
        }
      }

      this.studioTabs = []
      this.activeStudioTabId = null
      this.studioGitLoading = false
      this.setDisplayMode('tabs')

      console.log('[Studio] Exited studio mode')
    },

    async closeStudioTab(tabId: string) {
      const tab = this.studioTabs.find(t => t.id === tabId)
      if (!tab) return

      // Close all branch sessions for this tab
      for (const branch of tab.branches) {
        if (branch.sessionId) {
          try {
            // @ts-ignore
            if (window.__TAURI_INTERNALS__) {
              await invoke('pty_close', { sessionId: branch.sessionId })
            }
          } catch (error) {
            console.error(`[Studio] Failed to close session:`, error)
          }
        }
      }

      this.studioTabs = this.studioTabs.filter(t => t.id !== tabId)

      // If no tabs left, go to the home tab (recent projects)
      if (this.studioTabs.length === 0) {
        this.activeStudioTabId = null
        return
      }

      // Switch to another tab if the active one was closed
      if (this.activeStudioTabId === tabId) {
        this.activeStudioTabId = this.studioTabs[0].id
        this.refreshAllGitInfo()
      }
    },

    switchStudioTab(tabId: string) {
      this.activeStudioTabId = tabId
      this.refreshAllGitInfo()
    },

    async createStudioBranch(branchName: string) {
      const tab = this.activeStudioTab as StudioTab | undefined
      if (!tab) return

      // Branch already in the list: just switch to it
      const existing = tab.branches.find(b => b.name === branchName)
      if (existing) {
        tab.activeBranchId = existing.id
        return
      }

      const project = tab.project
      const sanitizedName = branchName.replace(/\//g, '-')
      const worktreePath = `${project.path}/.materm-worktrees/${sanitizedName}`
      const branchId = `studio_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
      const paneId = `pane_studio_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`

      try {
        // @ts-ignore
        if (!window.__TAURI_INTERNALS__) return

        // Returns the effective worktree path: reuses the existing worktree
        // if the branch is already checked out somewhere
        const effectivePath = await invoke<string>('git_create_worktree', {
          repoPath: project.path,
          branchName,
          baseBranch: project.defaultBranch,
          worktreePath,
        })

        const response = await invoke<{ session_id: string; cwd: string }>(
          'pty_spawn',
          { cols: 80, rows: 24, cwd: effectivePath },
        )

        const branch: StudioBranch = {
          id: branchId,
          name: branchName,
          worktreePath: effectivePath,
          sessionId: response.session_id,
          paneId,
          createdAt: Date.now(),
          viewMode: 'agent',
        }

        tab.branches.push(branch)
        tab.activeBranchId = branchId
        this.refreshAllGitInfo()

        console.log(`[Studio] Created branch ${branchName} with worktree at ${worktreePath}`)
      } catch (error) {
        console.error(`[Studio] Failed to create branch ${branchName}:`, error)
        throw error
      }
    },

    async removeStudioBranch(branchId: string) {
      const tab = this.activeStudioTab as StudioTab | undefined
      if (!tab) return

      const branch = tab.branches.find(b => b.id === branchId)
      if (!branch) return

      try {
        // @ts-ignore
        if (window.__TAURI_INTERNALS__) {
          if (branch.sessionId) {
            await invoke('pty_close', { sessionId: branch.sessionId })
          }
          await invoke('git_remove_worktree', {
            repoPath: tab.project.path,
            worktreePath: branch.worktreePath,
            deleteBranch: false,
          })
          await invoke('git_delete_branch', {
            repoPath: tab.project.path,
            branchName: branch.name,
          })
        }
      } catch (error) {
        console.error(`[Studio] Failed to remove branch ${branch.name}:`, error)
      }

      tab.branches = tab.branches.filter(b => b.id !== branchId)
      if (tab.activeBranchId === branchId) {
        tab.activeBranchId = tab.branches[0]?.id || null
      }

      console.log(`[Studio] Removed branch ${branch.name}`)
    },

    setActiveStudioBranch(branchId: string) {
      const tab = this.activeStudioTab as StudioTab | undefined
      if (tab) {
        tab.activeBranchId = branchId
      }
      this.refreshAllGitInfo()
    },

    setStudioBranchViewMode(branchId: string, mode: 'agent' | 'terminal') {
      const tab = this.activeStudioTab as StudioTab | undefined
      const branch = tab?.branches.find(b => b.id === branchId)
      if (branch) {
        branch.viewMode = mode
      }
    },

    // ============================================================================
    // Git Panel Actions (Studio Mode)
    // ============================================================================

    async refreshGitStatus() {
      const tab = this.activeStudioTab as StudioTab | undefined
      if (!tab) return
      const branch = tab.branches.find(b => b.id === tab.activeBranchId)
      if (!branch) return
      try {
        // @ts-ignore
        if (!window.__TAURI_INTERNALS__) return
        tab.gitStatus = await invoke<GitFileStatus[]>('git_status', { path: branch.worktreePath })
      } catch (error) {
        console.error('[Studio] Failed to refresh git status:', error)
        tab.gitStatus = []
      }
    },

    async refreshGitLog() {
      const tab = this.activeStudioTab as StudioTab | undefined
      if (!tab) return
      const branch = tab.branches.find(b => b.id === tab.activeBranchId)
      if (!branch) return
      try {
        // @ts-ignore
        if (!window.__TAURI_INTERNALS__) return
        tab.gitLog = await invoke<GitCommitInfo[]>('git_log', { path: branch.worktreePath, limit: 50 })
      } catch (error) {
        console.error('[Studio] Failed to refresh git log:', error)
        tab.gitLog = []
      }
    },

    async refreshGitStashes() {
      const tab = this.activeStudioTab as StudioTab | undefined
      if (!tab) return
      try {
        // @ts-ignore
        if (!window.__TAURI_INTERNALS__) return
        tab.gitStashes = await invoke<GitStashEntry[]>('git_stash_list', { repoPath: tab.project.path })
      } catch (error) {
        console.error('[Studio] Failed to refresh git stashes:', error)
        tab.gitStashes = []
      }
    },

    async refreshAllGitInfo() {
      this.studioGitLoading = true
      try {
        await Promise.all([
          this.refreshGitStatus(),
          this.refreshGitLog(),
          this.refreshGitStashes(),
        ])
      } finally {
        this.studioGitLoading = false
      }
    },

    async saveStash(message?: string, includeUntracked?: boolean) {
      const tab = this.activeStudioTab as StudioTab | undefined
      if (!tab) return
      try {
        // @ts-ignore
        if (!window.__TAURI_INTERNALS__) return
        await invoke('git_stash_save', {
          repoPath: tab.project.path,
          message: message || null,
          includeUntracked: includeUntracked || false,
        })
        await this.refreshAllGitInfo()
      } catch (error) {
        console.error('[Studio] Failed to save stash:', error)
        throw error
      }
    },

    async popStash(index: number) {
      const tab = this.activeStudioTab as StudioTab | undefined
      if (!tab) return
      try {
        // @ts-ignore
        if (!window.__TAURI_INTERNALS__) return
        await invoke('git_stash_pop', { repoPath: tab.project.path, index })
        await this.refreshAllGitInfo()
      } catch (error) {
        console.error('[Studio] Failed to pop stash:', error)
        throw error
      }
    },

    async applyStash(index: number) {
      const tab = this.activeStudioTab as StudioTab | undefined
      if (!tab) return
      try {
        // @ts-ignore
        if (!window.__TAURI_INTERNALS__) return
        await invoke('git_stash_apply', { repoPath: tab.project.path, index })
        await this.refreshAllGitInfo()
      } catch (error) {
        console.error('[Studio] Failed to apply stash:', error)
        throw error
      }
    },

    async dropStash(index: number) {
      const tab = this.activeStudioTab as StudioTab | undefined
      if (!tab) return
      try {
        // @ts-ignore
        if (!window.__TAURI_INTERNALS__) return
        await invoke('git_stash_drop', { repoPath: tab.project.path, index })
        await this.refreshGitStashes()
      } catch (error) {
        console.error('[Studio] Failed to drop stash:', error)
        throw error
      }
    },

    // ============================================================================
    // Tab Notifications (Claude completion red dot)
    // ============================================================================

    /** Walk all tab layouts to find which tab contains a given sessionId */
    findTabBySessionId(sessionId: string): string | null {
      const walk = (node: SplitNode): boolean => {
        if (node.type === 'pane' && node.sessionId === sessionId) return true
        if (node.children) {
          for (const child of node.children) {
            if (walk(child)) return true
          }
        }
        return false
      }
      for (const tab of this.tabs) {
        if (walk(tab.layout)) return tab.id
      }
      return null
    },

    addTabNotification(tabId: string) {
      if (!this.tabNotifications.includes(tabId)) {
        this.tabNotifications.push(tabId)
      }
    },

    clearTabNotification(tabId: string) {
      const idx = this.tabNotifications.indexOf(tabId)
      if (idx !== -1) {
        this.tabNotifications.splice(idx, 1)
      }
    },

    // ============================================================================
    // Speech Recognition Settings
    // ============================================================================

    toggleVoiceAnnouncements() {
      this.enableVoiceAnnouncements = !this.enableVoiceAnnouncements;
    },

    setTtsVoice(voice: string) {
      this.ttsVoice = voice;
    },

    setSpeechProvider(provider: 'whisper' | 'alibaba') {
      this.speechProvider = provider;
    },

    async saveSpeechSettings() {
      try {
        // @ts-ignore
        if (window.__TAURI_INTERNALS__) {
          await invoke('speech_save_settings', {
            provider: this.speechProvider,
            alibabaApiKey: this.alibabaApiKey,
          });
          console.log('[Store] Speech settings saved');
        }
      } catch (error) {
        console.error('Failed to save speech settings:', error);
      }
    },

    async loadSpeechSettings() {
      try {
        // @ts-ignore
        if (window.__TAURI_INTERNALS__) {
          const settings = await invoke<{
            provider: string;
            alibabaApiKey: string;
          }>('speech_load_settings');
          this.speechProvider = (settings.provider === 'alibaba' ? 'alibaba' : 'whisper');
          this.alibabaApiKey = settings.alibabaApiKey;
          console.log('[Store] Speech settings loaded (provider:', this.speechProvider, ')');
        }
      } catch (error) {
        console.error('Failed to load speech settings:', error);
      }
    },

    // ============================================================================
    // Terminal State Save / Restore (for app updates)
    // ============================================================================

    /**
     * Serialize all terminal buffers and save layout state to localStorage.
     * Call this BEFORE app relaunch during updates.
     */
    saveTerminalState() {
      try {
        const terminals = getAllTerminals()
        const paneContents: Record<string, string> = {}

        for (const [paneId, terminal] of terminals) {
          try {
            // Use the serialize addon already loaded on the terminal
            const addon = new SerializeAddon()
            terminal.loadAddon(addon)
            paneContents[paneId] = addon.serialize()
            addon.dispose()
          } catch (err) {
            console.warn(`[Store] Failed to serialize pane ${paneId}:`, err)
          }
        }

        const state: SavedTerminalState = {
          tabs: this.tabs.map(tab => ({
            id: tab.id,
            title: tab.title,
            titleManuallySet: tab.titleManuallySet,
            layout: stripSessionIds(tab.layout),
          })),
          activeTabId: this.activeTabId,
          activePaneId: this.activePaneId,
          paneContents,
        }

        localStorage.setItem(SAVED_STATE_KEY, JSON.stringify(state))
        console.log(`[Store] Terminal state saved (${Object.keys(paneContents).length} panes)`)
      } catch (err) {
        console.error('[Store] Failed to save terminal state:', err)
      }
    },

    /**
     * Check if there's saved terminal state from a previous session (e.g., after update).
     */
    hasSavedTerminalState(): boolean {
      return localStorage.getItem(SAVED_STATE_KEY) !== null
    },

    /**
     * Restore tabs from saved state, spawning new PTY sessions for each pane.
     * Returns true if state was restored successfully.
     */
    async restoreTerminalState(): Promise<boolean> {
      const raw = localStorage.getItem(SAVED_STATE_KEY)
      if (!raw) return false

      try {
        const state: SavedTerminalState = JSON.parse(raw)
        // Store pane contents temporarily for terminal-instance to pick up
        this._savedPaneContents = state.paneContents

        // Rebuild each tab with new PTY sessions
        for (const savedTab of state.tabs) {
          const tabId = savedTab.id
          const layout = await this.rebuildLayoutWithSessions(savedTab.layout)

          const tab: TerminalTab = {
            id: tabId,
            title: savedTab.title,
            titleManuallySet: savedTab.titleManuallySet,
            layout,
            createdAt: Date.now(),
          }

          this.tabs.push(tab)
        }

        // Restore active tab/pane
        if (state.activeTabId && this.tabs.find(t => t.id === state.activeTabId)) {
          this.activeTabId = state.activeTabId
        } else if (this.tabs.length > 0) {
          this.activeTabId = this.tabs[0].id
        }

        if (state.activePaneId) {
          this.activePaneId = state.activePaneId
        }

        // Sync window title for the restored active tab
        const activeTab = this.tabs.find(t => t.id === this.activeTabId)
        if (activeTab) {
          this.syncWindowTitle(activeTab.title)
        }

        console.log(`[Store] Terminal state restored (${this.tabs.length} tabs)`)

        // Clean up saved state after a delay (give terminals time to mount and read content)
        setTimeout(() => {
          this.clearSavedTerminalState()
        }, 5000)

        return true
      } catch (err) {
        console.error('[Store] Failed to restore terminal state:', err)
        this.clearSavedTerminalState()
        return false
      }
    },

    /**
     * Get saved pane content for a specific pane (called by terminal-instance on mount).
     */
    getSavedPaneContent(paneId: string): string | null {
      return this._savedPaneContents?.[paneId] || null
    },

    clearSavedTerminalState() {
      localStorage.removeItem(SAVED_STATE_KEY)
      this._savedPaneContents = null
    },

    /**
     * Recursively rebuild a layout tree, spawning new PTY sessions for each pane.
     */
    async rebuildLayoutWithSessions(node: SplitNode): Promise<SplitNode> {
      if (node.type === 'pane') {
        const paneId = node.paneId || `pane_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
        const { sessionId, cwd } = await this.spawnPtyForPane(paneId, node.cwd)
        return {
          type: 'pane',
          paneId, // Keep the same paneId so saved content matches
          sessionId,
          cwd: cwd || node.cwd,
          size: node.size,
        }
      }

      const children = await Promise.all(
        (node.children || []).map(child => this.rebuildLayoutWithSessions(child))
      )
      return {
        type: node.type,
        size: node.size,
        children,
      }
    },

    // ============================================================================
    // Preset Layout Actions
    // ============================================================================

    async spawnPane(): Promise<{ paneId: string; sessionId: string; cwd: string }> {
      const paneId = `pane_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const { sessionId, cwd } = await this.spawnPtyForPane(paneId);
      return { paneId, sessionId, cwd };
    },

    async createTabWithPresetLayout(preset: 'dual' | 'quad' | 'triple') {
      const tabId = `tab_${Date.now()}`;
      let layout: SplitNode;

      if (preset === 'dual') {
        const [p1, p2] = await Promise.all([this.spawnPane(), this.spawnPane()]);
        layout = {
          type: 'horizontal',
          children: [
            { type: 'pane', paneId: p1.paneId, sessionId: p1.sessionId, cwd: p1.cwd, size: 50 },
            { type: 'pane', paneId: p2.paneId, sessionId: p2.sessionId, cwd: p2.cwd, size: 50 },
          ],
        };
        this.activePaneId = p1.paneId;
      } else if (preset === 'quad') {
        const [p1, p2, p3, p4] = await Promise.all([
          this.spawnPane(), this.spawnPane(), this.spawnPane(), this.spawnPane(),
        ]);
        layout = {
          type: 'vertical',
          children: [
            {
              type: 'horizontal',
              size: 50,
              children: [
                { type: 'pane', paneId: p1.paneId, sessionId: p1.sessionId, cwd: p1.cwd, size: 50 },
                { type: 'pane', paneId: p2.paneId, sessionId: p2.sessionId, cwd: p2.cwd, size: 50 },
              ],
            },
            {
              type: 'horizontal',
              size: 50,
              children: [
                { type: 'pane', paneId: p3.paneId, sessionId: p3.sessionId, cwd: p3.cwd, size: 50 },
                { type: 'pane', paneId: p4.paneId, sessionId: p4.sessionId, cwd: p4.cwd, size: 50 },
              ],
            },
          ],
        };
        this.activePaneId = p1.paneId;
      } else {
        // triple: left-center-right
        const [p1, p2, p3] = await Promise.all([
          this.spawnPane(), this.spawnPane(), this.spawnPane(),
        ]);
        layout = {
          type: 'horizontal',
          children: [
            { type: 'pane', paneId: p1.paneId, sessionId: p1.sessionId, cwd: p1.cwd, size: 33.33 },
            { type: 'pane', paneId: p2.paneId, sessionId: p2.sessionId, cwd: p2.cwd, size: 33.34 },
            { type: 'pane', paneId: p3.paneId, sessionId: p3.sessionId, cwd: p3.cwd, size: 33.33 },
          ],
        };
        this.activePaneId = p1.paneId;
      }

      // Find the active pane's CWD for the title
      const activePaneNode = this.findNodeByPaneId(layout, this.activePaneId!);
      const tab: TerminalTab = {
        id: tabId,
        title: shortenPath(activePaneNode?.cwd || '~'),
        layout,
        createdAt: Date.now(),
      };

      this.tabs.push(tab);
      this.activeTabId = tabId;
    },
  },
});
