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

export const useTerminalStore = defineStore("terminal", {
  state: () => ({
    tabs: [] as TerminalTab[],
    activeTabId: null as string | null,
    activePaneId: null as string | null,
    currentThemeName: "VS Code Dark" as string,
    isSettingsOpen: false,
    isAboutOpen: false,
    dimInactivePanes: true, // 未聚焦窗格变灰功能
    enableCommandNotifications: true, // Claude 命令完成通知
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
  },
});
