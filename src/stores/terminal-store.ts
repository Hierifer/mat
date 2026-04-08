import { defineStore } from 'pinia'
import { invoke } from '@tauri-apps/api/core'
import { themes, type ITheme } from "@/settings/themes";

export interface TerminalTab {
  id: string
  title: string
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
  autoRestoreSessions: boolean
  sessionMapping: Record<string, string>
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
    enableCommandNotifications: true, // Claude 命令完成通知
    fontSize: 13 as number, // 字体大小
    locale: 'zh-CN' as string, // 语言
    // tmux related
    tmuxEnabled: false,
    tmuxSessions: [] as TmuxSessionInfo[],
    sessionMapping: {} as Record<string, string>, // paneId -> tmux session name
    autoRestoreSessions: false,
    isSessionManagerOpen: false,
  }),

  getters: {
    currentTheme(state): ITheme {
      return themes[state.currentThemeName] || themes["VS Code Dark"];
    },
    availableThemes(): string[] {
      return Object.keys(themes);
    },
    activeTab: (state) => state.tabs.find((t) => t.id === state.activeTabId),
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

    async createTab() {
      const tabId = `tab_${Date.now()}`;
      const paneId = `pane_${Date.now()}`;

      // Spawn PTY session
      let sessionId = `mock_session_${Date.now()}`;
      let cwd = "~";

      try {
        // Check if running in Tauri environment
        // @ts-ignore
        if (window.__TAURI_INTERNALS__) {
          const response = await invoke<{ session_id: string; cwd: string }>(
            "pty_spawn",
            { cols: 80, rows: 24 },
          );
          sessionId = response.session_id;
          cwd = response.cwd;
          console.log(`[Store] Created PTY session for new tab: ${sessionId}`);
        } else {
          console.warn(
            "Tauri environment not detected. Using mock session ID.",
          );
        }
      } catch (error) {
        console.error("Failed to spawn PTY session:", error);
      }

      const tab: TerminalTab = {
        id: tabId,
        title: "Terminal",
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
            await invoke("pty_close", { sessionId: node.sessionId });
            console.log(
              `[Store] Successfully closed session: ${node.sessionId}`,
            );
          }
        } catch (error) {
          console.error("Failed to close PTY session:", error);
        }
      } else if (node.children) {
        for (const child of node.children) {
          await this.closeSessionsInLayout(child);
        }
      }
    },

    async setActiveTab(tabId: string) {
      console.log(`[Store] Switching to tab: ${tabId}`);
      const tab = this.tabs.find((t) => t.id === tabId);
      if (tab) {
        console.log(`[Store] Tab layout:`, tab.layout);
      }
      this.activeTabId = tabId;

      // Debug: List active sessions in backend
      try {
        // @ts-ignore
        if (window.__TAURI_INTERNALS__) {
          const sessions = await invoke<string[]>("pty_list_sessions");
          console.log(`[Store] Active backend sessions:`, sessions);
        }
      } catch (error) {
        console.error("Failed to list sessions:", error);
      }
    },

    updateTabTitle(tabId: string, title: string) {
      const tab = this.tabs.find((t) => t.id === tabId);
      if (tab) {
        tab.title = title;
      }
    },

    setActivePane(paneId: string) {
      this.activePaneId = paneId;
    },

    updatePaneCwd(paneId: string, cwd: string) {
      const tab = this.activeTab;
      if (!tab) return;

      const node = this.findNodeByPaneId(tab.layout, paneId);
      if (node && node.type === "pane") {
        node.cwd = cwd;
      }
    },

    async splitPane(paneId: string, direction: "horizontal" | "vertical") {
      const tab = this.activeTab;
      if (!tab) return;

      const targetNode = this.findNodeByPaneId(tab.layout, paneId);
      if (!targetNode || targetNode.type !== "pane") return;

      // Create new PTY session
      const newPaneId = `pane_${Date.now()}`;
      let sessionId = `mock_session_${Date.now()}`;
      let cwd = targetNode.cwd || "~";

      try {
        // Check if running in Tauri environment
        // @ts-ignore
        if (window.__TAURI_INTERNALS__) {
          const response = await invoke<{ session_id: string; cwd: string }>(
            "pty_spawn",
            { cols: 80, rows: 24 },
          );
          sessionId = response.session_id;
          cwd = response.cwd;
        } else {
          console.warn(
            "Tauri environment not detected. Using mock session ID for split.",
          );
        }
      } catch (error) {
        console.error("Failed to spawn PTY session for split:", error);
      }

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
                invoke("pty_close", { sessionId: child.sessionId });
              }
            } catch (error) {
              console.error("Failed to close PTY session:", error);
            }
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
        this.autoRestoreSessions = settings.autoRestoreSessions;
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
            autoRestoreSessions: this.autoRestoreSessions,
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
          const response = await invoke<{ session_id: string; cwd: string }>(
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
          if (this.tmuxEnabled && sessionName) {
            this.sessionMapping[paneId] = sessionName;
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

    async restoreSessions() {
      try {
        const sessions = await invoke<TmuxSessionInfo[]>('tmux_list_sessions');

        if (sessions.length === 0) {
          // No sessions to restore, create default
          await this.createTab();
          return;
        }

        // Restore each MAT session as a tab
        for (const session of sessions) {
          if (session.name.startsWith('mat_')) {
            await this.attachToTmuxSession(session.name);
          }
        }

        console.log(`Restored ${sessions.length} tmux sessions`);
      } catch (error) {
        console.error('Failed to restore sessions:', error);
        await this.createTab(); // Fallback to default tab
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
            autoRestoreSessions: this.autoRestoreSessions,
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
  },
});
