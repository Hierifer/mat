# Skill: MAT 项目概览

## Summary
MAT (Modern Terminal Emulator) 是一个基于 Tauri 2 + Vue 3 + Rust 构建的跨平台终端模拟器，提供类似 iTerm2 的分屏和多标签功能，支持 macOS、Linux 和 Windows 平台。

## Quick Reference

### 项目基本信息
- **项目名称**: MAT (Modern Terminal Emulator)
- **版本**: 0.1.7
- **包标识**: com.terminal.emulator
- **作者**: Hierifer
- **许可证**: 待定

### 核心技术栈

| 层级 | 技术 | 版本 | 用途 |
|------|------|------|------|
| **前端框架** | Vue 3 | 3.5.30 | UI 框架 (Composition API) |
| | TypeScript | 5.9.3 | 类型安全 |
| | Vite | 8.0.0 | 构建工具 |
| **状态管理** | Pinia | 3.0.4 | 全局状态管理 |
| **终端渲染** | xterm.js | 5.3.0 | 终端模拟引擎 |
| | @xterm/addon-fit | 0.11.0 | 自适应大小 |
| | @xterm/addon-web-links | 0.12.0 | 链接支持 |
| **样式** | Tailwind CSS | 4.1.0 | CSS 框架 |
| **桌面框架** | Tauri | 2.9.1 | 跨平台应用 |
| **后端语言** | Rust | 2021 edition | 后端逻辑 |
| **PTY** | portable-pty | 0.8 | 终端伪终端支持 |
| **异步运行时** | tokio | 1.x | 异步 I/O |

[ref: README.md#技术栈, PROJECT_DOCUMENTATION.md#技术栈]

### 主要功能

- ✅ 完整终端模拟 (基于 xterm.js)
- ✅ PTY 会话管理
- ✅ 跨平台 Shell 支持 (zsh/bash/PowerShell)
- ✅ 分屏功能 (水平/垂直分割)
- ✅ 多标签页管理
- ✅ 键盘快捷键
- ✅ 自动调整终端大小
- ✅ VS Code 风格主题
- ✅ 浏览器模式 (mock 终端用于 UI 开发)

[ref: IMPLEMENTATION_COMPLETE.md#已完成的功能]

## 详细架构

### 整体架构图

```
┌─────────────────────────────────────┐
│      Vue 3 Frontend (UI)            │
│                                     │
│  ┌────────────────────────────┐    │
│  │  Terminal Instance         │    │
│  │  (xterm.js)                │    │
│  └────────┬───────────────────┘    │
│           │                         │
│  ┌────────▼───────────────────┐    │
│  │  usePtySession             │    │
│  │  (Composable)              │    │
│  └────────┬───────────────────┘    │
│           │                         │
│  ┌────────▼───────────────────┐    │
│  │  Tauri IPC                 │    │
│  │  (invoke/listen)           │    │
│  └────────┬───────────────────┘    │
└───────────┼─────────────────────────┘
            │
            │ IPC Bridge
            │
┌───────────▼─────────────────────────┐
│      Tauri Backend (Rust)           │
│                                     │
│  ┌────────────────────────────┐    │
│  │  PTY Commands              │    │
│  │  (pty_spawn, pty_write,    │    │
│  │   pty_resize, pty_close)   │    │
│  └────────┬───────────────────┘    │
│           │                         │
│  ┌────────▼───────────────────┐    │
│  │  PTY Manager               │    │
│  │  - Session management      │    │
│  │  - Shell spawning          │    │
│  │  - I/O handling            │    │
│  └────────┬───────────────────┘    │
│           │                         │
│  ┌────────▼───────────────────┐    │
│  │  portable-pty              │    │
│  │  (Cross-platform PTY)      │    │
│  └────────┬───────────────────┘    │
└───────────┼─────────────────────────┘
            │
            ▼
    ┌───────────────┐
    │ Shell Process │
    │ (zsh/bash/ps) │
    └───────────────┘
```

[ref: PROJECT_DOCUMENTATION.md#整体架构图]

### 目录结构

```
terminal-emulator/
├── frontend/
│   ├── src/                           # Vue 前端源码
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   ├── split-container.vue    # 递归分屏容器
│   │   │   │   └── tab-bar.vue            # 标签栏
│   │   │   └── terminal/
│   │   │       ├── terminal-instance.vue  # 终端实例
│   │   │       └── pane-toolbar.vue       # 窗格工具栏
│   │   ├── composables/
│   │   │   ├── use-pty-session.ts         # PTY 会话管理
│   │   │   ├── use-keyboard-shortcuts.ts  # 快捷键系统
│   │   │   └── use-platform.ts            # 平台检测
│   │   ├── stores/
│   │   │   └── terminal-store.ts          # Pinia 状态管理
│   │   ├── App.vue                        # 根组件
│   │   ├── main.ts                        # 入口文件
│   │   └── style.css                      # 全局样式
│   ├── src-tauri/                         # Rust 后端
│   │   ├── src/
│   │   │   ├── pty/
│   │   │   │   ├── mod.rs                 # PTY 模块入口
│   │   │   │   ├── manager.rs             # PTY 管理器
│   │   │   │   ├── commands.rs            # Tauri 命令
│   │   │   │   └── shell.rs               # 跨平台 Shell 检测
│   │   │   ├── lib.rs                     # 库配置
│   │   │   └── main.rs                    # 主入口
│   │   ├── capabilities/
│   │   │   └── default.json               # Tauri v2 权限配置
│   │   ├── Cargo.toml                     # Rust 依赖
│   │   └── tauri.conf.json                # Tauri 配置
│   ├── package.json                       # 前端依赖
│   ├── vite.config.ts                     # Vite 配置
│   └── tsconfig.json                      # TypeScript 配置
├── README.md                              # 项目简介
├── PROJECT_DOCUMENTATION.md               # 详细文档
├── QUICK_START.md                         # 快速开始
├── IMPLEMENTATION_COMPLETE.md             # 实现总结
├── TROUBLESHOOTING.md                     # 故障排查
└── VERIFICATION_CHECKLIST.md              # 测试清单
```

[ref: README.md#项目结构, PROJECT_DOCUMENTATION.md#项目结构]

### 核心数据流

#### 用户输入流程
```
用户键盘输入
  → xterm.js onData 事件
  → usePtySession.write()
  → Tauri invoke('pty_write')
  → PtyManager.write()
  → Shell 进程
```

#### Shell 输出流程
```
Shell 进程输出
  → PTY Master 读取 (Tokio 异步)
  → Tauri emit('pty_data_{sessionId}')
  → 前端 listen() 接收
  → usePtySession onData 回调
  → xterm.js terminal.write()
  → 终端显示
```

[ref: PROJECT_DOCUMENTATION.md#数据流]

## 核心模块

### 前端核心模块

#### 1. Terminal Store (状态管理)
```typescript
interface TerminalTab {
  id: string
  title: string
  layout: SplitNode      // 分屏布局树
  createdAt: number
}

interface SplitNode {
  type: 'horizontal' | 'vertical' | 'pane'
  children?: SplitNode[]
  paneId?: string
  sessionId?: string
  size?: number
}
```

**关键 Actions**:
- `createTab()` - 创建新标签页
- `splitPane(direction)` - 分割窗格
- `closePane(paneId)` - 关闭窗格
- `setActivePane(paneId)` - 设置活动窗格

[ref: PROJECT_DOCUMENTATION.md#前端 - Terminal Store]

#### 2. usePtySession Composable
封装 PTY 会话通信逻辑，提供:
- `connect(onData)` - 连接会话并监听输出
- `write(data)` - 向 PTY 写入输入
- `resize(cols, rows)` - 调整 PTY 大小
- `close()` - 关闭会话

[ref: PROJECT_DOCUMENTATION.md#前端 - PTY Session Composable]

### 后端核心模块

#### 1. PTY Manager (Rust)
```rust
pub struct PtyManager {
    sessions: HashMap<String, PtySession>,
    pty_system: Box<dyn PtySystem + Send>,
}

pub struct PtySession {
    writer: Box<dyn Write + Send>,
    master: Arc<TokioMutex<Box<dyn MasterPty + Send>>>,
}
```

**关键方法**:
- `spawn_shell(cols, rows)` - 创建新 PTY 会话
- `write(session_id, data)` - 写入数据
- `resize(session_id, cols, rows)` - 调整大小
- `close_session(session_id)` - 关闭会话

[ref: PROJECT_DOCUMENTATION.md#后端 - PTY Manager]

#### 2. Tauri Commands
| 命令 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `pty_spawn` | cols, rows | session_id | 创建 PTY 会话 |
| `pty_write` | session_id, data | - | 写入数据 |
| `pty_resize` | session_id, cols, rows | - | 调整大小 |
| `pty_close` | session_id | - | 关闭会话 |

[ref: PROJECT_DOCUMENTATION.md#后端 - Tauri Commands]

## 关键特性

### 1. 跨平台 Shell 支持
- **macOS**: `/bin/zsh` → `/bin/bash`
- **Linux**: `/bin/bash` → `/bin/sh`
- **Windows**: `pwsh.exe` → `powershell.exe`
- 支持 `$SHELL` 环境变量覆盖

[ref: IMPLEMENTATION_COMPLETE.md#跨平台 Shell 支持]

### 2. 分屏功能
- 递归树形布局结构
- 支持无限嵌套
- 水平/垂直分割
- 动态大小调整
- 智能窗格关闭和布局重组

[ref: IMPLEMENTATION_COMPLETE.md#分屏功能]

### 3. 键盘快捷键
- `Cmd/Ctrl + D` - 水平分割
- `Cmd/Ctrl + Shift + D` - 垂直分割
- `Cmd/Ctrl + W` - 关闭窗格

[ref: QUICK_START.md#键盘快捷键]

### 4. 浏览器模式
- 自动检测 Tauri 环境
- 非 Tauri 环境提供 mock 终端
- 用于 UI 开发和测试

[ref: IMPLEMENTATION_COMPLETE.md#浏览器模式支持]

## 性能指标

- **启动时间**: < 3s
- **分割延迟**: < 200ms
- **Resize 响应**: < 100ms (带防抖)
- **单终端内存**: ~50-80MB
- **4 窗格内存**: ~150-250MB

[ref: IMPLEMENTATION_COMPLETE.md#性能测试]

## 安全性

### Tauri 权限配置
使用最小权限原则，仅授予:
- `core:event:allow-listen` - 监听 PTY 输出
- `core:event:allow-emit` - 发送事件
- `core:window:default` - 基础窗口操作

[ref: IMPLEMENTATION_COMPLETE.md#Tauri 权限, src-tauri/capabilities/default.json]

### Shell 安全
- 不执行用户提供的 shell 路径
- 仅使用系统默认或 `$SHELL` 环境变量
- 所有操作在隔离的 PTY 中进行

[ref: PROJECT_DOCUMENTATION.md#安全考虑]

## References

- [README.md](/Users/hierifer/Desktop/terminal-emulator/README.md) — 项目简介和快速开始
- [PROJECT_DOCUMENTATION.md](/Users/hierifer/Desktop/terminal-emulator/PROJECT_DOCUMENTATION.md) — 详细架构和 API 文档
- [IMPLEMENTATION_COMPLETE.md](/Users/hierifer/Desktop/terminal-emulator/IMPLEMENTATION_COMPLETE.md) — 实现总结和技术细节
- [QUICK_START.md](/Users/hierifer/Desktop/terminal-emulator/QUICK_START.md) — 用户快速开始指南
- [TROUBLESHOOTING.md](/Users/hierifer/Desktop/terminal-emulator/TROUBLESHOOTING.md) — 故障排查指南

## Related Skills

- [开发流程和命令](./development-workflow.md)
- [跨平台构建](./cross-platform-build.md)
- [配置和设置](./configuration.md)
- [架构深入理解](./architecture-deep-dive.md)
