# Materm Studio Mode

## 概述

Studio 是 Materm 的项目开发模式，将终端从传统 tab 式布局切换为 Git 仓库 + 分支工作区布局。每个分支拥有独立的 Git worktree、终端会话和 Claude Code AI Agent。

切换方式：顶栏布局切换按钮（tabs ↔ studio），选择持久化到 `localStorage`（默认 studio）。

---

## 架构

```
┌─ Project Bar ─────────────────────────────────────┐
│ [Home] [Project1 ×] [Project2 ×] [+]    [⚙] [□] │
├──────────────┬────────────────────────────────────┤
│  Sidebar     │  Content Area                      │
│              │                                    │
│  Branches    │  Branch Toolbar                    │
│  ┌─────────┐ │  [Agent | Terminal]                │
│  │ main    │ │                                    │
│  │ feat/x ●│ │  Agent Panel                       │
│  │ fix/y   │ │  ┌──────────────────────────────┐  │
│  └─────────┘ │  │ Timeline (messages + tools)  │  │
│              │  │                              │  │
│  Git Panel   │  │                              │  │
│  ┌─────────┐ │  ├──────────────────────────────┤  │
│  │ Changes │ │  │ Input + Attachments          │  │
│  │ Stashes │ │  └──────────────────────────────┘  │
│  │ Commits │ │                                    │
│  └─────────┘ │  — 或 Terminal (xterm split pane) — │
└──────────────┴────────────────────────────────────┘
```

---

## 核心概念

### Display Mode

应用有两种布局模式，通过 `displayMode` 状态控制：

| 模式 | 说明 |
|------|------|
| `tabs` | 传统终端标签页 + 分屏 |
| `studio` | 项目 + 分支工作区 |

### Studio Tab = 一个项目

```typescript
interface StudioTab {
  id: string
  project: StudioProject       // { path, name, defaultBranch }
  branches: StudioBranch[]
  activeBranchId: string | null
  gitStatus: GitFileStatus[]
  gitLog: GitCommitInfo[]
  gitStashes: GitStashEntry[]
}
```

打开项目时调用 `git_validate_repo` 检测仓库信息。支持同时打开多个项目（多 tab）。

### Studio Branch = 一个工作区

```typescript
interface StudioBranch {
  id: string
  name: string                  // 分支名 (e.g. "feat/login")
  worktreePath: string          // Git worktree 隔离目录
  sessionId: string | null      // PTY 终端会话 ID
  paneId: string
  createdAt: number
  viewMode: 'agent' | 'terminal'
}
```

每个分支通过 `git worktree add` 创建独立工作目录（在 `.materm-worktrees/<branch-name>/`），允许多个分支同时 checkout 互不干扰。

---

## 功能模块

### 1. 项目管理 (studio-home.vue)

- Home 页展示最近项目列表（最多 15 个，按最后打开时间排序）
- 通过文件浏览器选择 Git 仓库目录
- 空目录自动执行 `git init`
- 右键可从列表移除

### 2. 分支管理 (studio-sidebar.vue)

- 创建分支：基于 default branch 创建新分支 + worktree
- 切换分支：点击侧栏切换活跃分支
- 重命名分支：双击行内编辑
- 删除分支：关闭 PTY 会话 → 移除 worktree → 删除 Git 分支
- 刷新 Git 信息

### 3. 双视图切换

每个分支可在两个视图间切换：

| 视图 | 说明 |
|------|------|
| `agent` | Claude Code AI 对话面板 |
| `terminal` | xterm 终端 + 分屏 |

通过分支工具栏的 Agent / Terminal 按钮切换，状态保存在 `branch.viewMode`。

### 4. Agent Panel (agent-panel.vue + use-agent-session.ts)

内嵌的 Claude Code AI 助手界面：

- **会话管理**：通过 Rust 后端 `agent_spawn` 启动 Claude Code 进程（stream-json 模式）
- **Timeline 视图**：按时间线展示用户消息、AI 回复、工具调用（可折叠展开）
- **输入区**：
  - 支持 `/` 前缀 slash command 自动补全
  - 文件拖拽 / 粘贴附件（图片等）
  - Enter 发送，Shift+Enter 换行
- **工具可视化**：显示工具名称、输入摘要、执行结果、错误状态
- **费用追踪**：显示当前会话总 API 费用
- **重启**：销毁当前进程并重新启动

### 5. Git Panel (studio-git-panel.vue)

活跃分支的 Git 操作面板：

- **Changes**：显示已暂存 / 已修改 / 未跟踪文件
- **Stashes**：保存 / 弹出 / 应用 / 删除 stash
- **Commits**：最近 50 条提交历史

Git 操作通过 Rust 后端（`src-tauri/src/git.rs`）执行，使用 git2 库 + shell 命令。

---

## 状态管理

所有 Studio 状态在 `terminal-store.ts` 中管理：

| 状态 | 说明 |
|------|------|
| `displayMode` | 当前布局模式 |
| `studioTabs` | 已打开的项目列表 |
| `activeStudioTabId` | 当前活跃项目（null = Home 页） |
| `studioRecentProjects` | 最近项目列表 |
| `studioGitLoading` | Git 信息加载中标志 |

### localStorage 键

| Key | 用途 |
|-----|------|
| `materm_display_mode` | 布局模式持久化 |
| `materm_studio_recent_projects` | 最近项目列表（JSON 数组） |

---

## 工作流

```
1. 切换到 Studio 模式
2. Home 页 → 选择/添加 Git 仓库
3. 侧栏 → 创建分支 → 自动创建 worktree + PTY
4. 默认进入 Agent 视图，与 Claude Code 对话完成开发
5. 切换到 Terminal 视图执行命令
6. Git Panel 查看变更、管理 stash
7. 完成后删除分支（清理 worktree + 分支）
```

---

## 文件索引

| 文件 | 职责 |
|------|------|
| `src/stores/terminal-store.ts` | Studio 状态管理 + actions |
| `src/App.vue` | Studio 布局渲染 |
| `src/components/layout/studio-home.vue` | 最近项目列表 |
| `src/components/layout/studio-sidebar.vue` | 分支列表 + Git Panel 入口 |
| `src/components/layout/studio-git-panel.vue` | Git 变更 / stash / 提交 |
| `src/components/studio/agent-panel.vue` | Claude Code AI 界面 |
| `src/composables/use-agent-session.ts` | Agent 会话逻辑（spawn / send / stream） |
| `src-tauri/src/git.rs` | Rust 端 Git 操作 |
| `src-tauri/src/agent/manager.rs` | Agent 进程管理（spawn / kill / send） |
| `src-tauri/src/agent/commands.rs` | Agent Tauri 命令入口 |
| `src/i18n/locales/en.ts` | Studio 国际化文本 (`studio.*`) |

---

## Agent 进程管理

### 懒启动 (Lazy Start)

Agent 进程不在组件挂载时启动，而是在用户首次发送消息时按需 spawn。`agent-panel.vue` 的 `onMounted` 只调用 `setCwd()` 设置工作目录和加载历史记录。

### 进程清理

每个 agent session 可独立存在（多分支各自保持 agent）。进程终止时使用 `libc::kill` 发送 SIGTERM（进程组）+ SIGKILL（单进程），确保子 claude 进程也被清理。spawn 时通过 `.process_group(0)` 为子进程创建独立进程组，避免 kill 信号波及 Tauri 主进程。

### 自动恢复 (Auto-Resume)

当进程退出后用户再次发消息，`use-agent-session.ts` 的 `send()` 检测到 `!isRunning && lastCwd` 时会自动重新 spawn 进程，并通过 `--resume <session_id>` 恢复 Claude Code 会话上下文。
