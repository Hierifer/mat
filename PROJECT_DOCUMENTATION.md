# Terminal Emulator - 项目文档

## 项目概述

这是一个基于 Tauri 和 Vue 3 构建的现代化终端模拟器应用，采用 Rust 后端和 Web 前端技术栈，旨在提供类似 iTerm2 的功能体验。

### 基本信息

- **项目名称**: Terminal Emulator
- **版本**: 0.1.0
- **包标识**: com.terminal.emulator
- **主要功能**:
  - 终端模拟器
  - PTY 会话管理
  - 分屏布局支持（开发中）
  - 标签页管理

## 技术栈

### 前端技术

| 技术 | 版本 | 用途 |
|------|------|------|
| Vue 3 | 3.5.30 | UI 框架，使用 Composition API |
| TypeScript | 5.9.3 | 类型安全的开发 |
| xterm.js | 5.3.0 | 终端渲染引擎 |
| @xterm/addon-fit | 0.11.0 | 终端自适应大小 |
| @xterm/addon-web-links | 0.12.0 | 终端内链接支持 |
| Pinia | 3.0.4 | 状态管理 |
| Tailwind CSS | 4.1.0 | CSS 框架 |
| Vite | 8.0.0 | 构建工具 |
| Bun | - | 包管理器 |

### 后端技术

| 技术 | 版本 | 用途 |
|------|------|------|
| Tauri | 2.9.1 | 桌面应用框架 |
| Rust | 2021 edition | 后端编程语言 |
| portable-pty | 0.8 | 跨平台 PTY 支持 |
| tokio | 1.x | 异步运行时 |
| serde | 1.x | 序列化/反序列化 |
| uuid | 1.x | 会话 ID 生成 |
| anyhow | 1.x | 错误处理 |

## 项目结构

```
terminal-emulator/
└── frontend/
    ├── src/                      # Vue 前端源码
    │   ├── components/           # Vue 组件
    │   │   ├── layout/
    │   │   │   └── split-container.vue    # 分屏布局容器
    │   │   └── terminal/
    │   │       └── terminal-instance.vue  # 终端实例组件
    │   ├── composables/          # Vue Composables
    │   │   └── use-pty-session.ts        # PTY 会话逻辑
    │   ├── stores/               # Pinia stores
    │   │   └── terminal-store.ts         # 终端状态管理
    │   ├── assets/               # 静态资源
    │   ├── App.vue               # 根组件
    │   ├── main.ts               # 应用入口
    │   └── style.css             # 全局样式
    ├── src-tauri/                # Tauri/Rust 后端
    │   ├── src/
    │   │   ├── pty/
    │   │   │   ├── mod.rs        # PTY 模块入口
    │   │   │   ├── manager.rs    # PTY 管理器
    │   │   │   └── commands.rs   # Tauri 命令定义
    │   │   ├── lib.rs            # Tauri 应用配置
    │   │   └── main.rs           # 入口文件
    │   ├── Cargo.toml            # Rust 依赖配置
    │   ├── build.rs              # 构建脚本
    │   └── tauri.conf.json       # Tauri 配置
    ├── public/                   # 公共资源
    ├── package.json              # 前端依赖
    ├── vite.config.ts            # Vite 配置
    ├── tsconfig.json             # TypeScript 配置
    └── README.md
```

## 核心架构

### 整体架构图

```
┌─────────────────────────────────────┐
│         Vue 3 Frontend              │
│  ┌──────────────────────────────┐   │
│  │  Terminal Instance (xterm.js)│   │
│  └──────────┬───────────────────┘   │
│             │                        │
│  ┌──────────▼───────────────────┐   │
│  │  usePtySession Composable    │   │
│  └──────────┬───────────────────┘   │
│             │                        │
│  ┌──────────▼───────────────────┐   │
│  │  Tauri IPC (invoke/listen)   │   │
│  └──────────┬───────────────────┘   │
└─────────────┼───────────────────────┘
              │
┌─────────────▼───────────────────────┐
│         Tauri Backend (Rust)        │
│  ┌──────────────────────────────┐   │
│  │     PTY Commands             │   │
│  │  - pty_spawn                 │   │
│  │  - pty_write                 │   │
│  │  - pty_resize                │   │
│  │  - pty_close                 │   │
│  └──────────┬───────────────────┘   │
│             │                        │
│  ┌──────────▼───────────────────┐   │
│  │     PTY Manager              │   │
│  │  - Session management        │   │
│  │  - Shell spawning            │   │
│  │  - I/O handling              │   │
│  └──────────┬───────────────────┘   │
│             │                        │
│  ┌──────────▼───────────────────┐   │
│  │    portable-pty              │   │
│  └──────────┬───────────────────┘   │
└─────────────┼───────────────────────┘
              │
       ┌──────▼──────┐
       │  Shell (/bin/zsh)  │
       └─────────────┘
```

### 数据流

#### 1. 用户输入流程

```
用户键盘输入
    ↓
xterm.js onData 事件
    ↓
usePtySession.write()
    ↓
Tauri invoke('pty_write')
    ↓
PTY Manager.write()
    ↓
Shell 进程
```

#### 2. Shell 输出流程

```
Shell 进程输出
    ↓
PTY Master 读取 (Tokio 异步任务)
    ↓
Tauri Event emit('pty_data_{sessionId}')
    ↓
前端 listen() 接收
    ↓
usePtySession onData 回调
    ↓
xterm.js terminal.write()
    ↓
终端显示
```

## 核心模块详解

### 1. 前端 - Terminal Instance 组件

**文件**: `src/components/terminal/terminal-instance.vue`

**职责**:
- 初始化 xterm.js 终端实例
- 管理终端生命周期
- 处理终端大小调整
- 连接 PTY 会话

**关键功能**:
```typescript
// 终端配置
const terminal = new Terminal({
  fontFamily: '"JetBrains Mono", "Courier New", monospace',
  fontSize: 13,
  cursorBlink: true,
  allowTransparency: true,
  theme: { /* VS Code 风格主题 */ }
})

// 插件加载
terminal.loadAddon(fitAddon)      // 自适应大小
terminal.loadAddon(webLinksAddon)  // 链接支持

// 用户输入处理
terminal.onData((data) => write(data))

// 自动调整大小
resizeObserver = new ResizeObserver(() => {
  fitAddon?.fit()
  resize(dims.cols, dims.rows)
})
```

### 2. 前端 - PTY Session Composable

**文件**: `src/composables/use-pty-session.ts`

**职责**:
- 封装 PTY 会话通信逻辑
- 提供响应式的会话状态
- 管理事件监听器生命周期

**API**:
```typescript
export function usePtySession(sessionId: string) {
  return {
    isConnected: Ref<boolean>,
    connect: (onData: (data: Uint8Array) => void) => Promise<void>,
    write: (data: string) => Promise<void>,
    resize: (cols: number, rows: number) => Promise<void>,
    close: () => Promise<void>
  }
}
```

### 3. 前端 - Terminal Store

**文件**: `src/stores/terminal-store.ts`

**职责**:
- 管理所有终端标签页
- 维护分屏布局树
- 处理会话的创建和关闭

**数据结构**:
```typescript
interface TerminalTab {
  id: string
  title: string
  layout: SplitNode
  createdAt: number
}

interface SplitNode {
  type: 'horizontal' | 'vertical' | 'pane'
  children?: SplitNode[]
  paneId?: string
  sessionId?: string
  size?: number // 百分比
}
```

**关键操作**:
- `createTab()`: 创建新标签页和 PTY 会话
- `closeTab(tabId)`: 关闭标签页及其所有会话
- `closeSessionsInLayout(node)`: 递归关闭布局树中的会话

### 4. 后端 - PTY Manager

**文件**: `src-tauri/src/pty/manager.rs`

**职责**:
- 管理所有活跃的 PTY 会话
- 创建和配置 PTY 进程
- 处理 I/O 操作
- 后台读取 PTY 输出

**核心实现**:

```rust
pub struct PtyManager {
    sessions: HashMap<String, PtySession>,
    pty_system: Box<dyn PtySystem>,
}

pub fn spawn_shell(&mut self, cols: u16, rows: u16, app_handle: AppHandle)
    -> Result<String, String> {
    // 1. 生成唯一会话 ID
    let session_id = Uuid::now_v7().to_string();

    // 2. 创建 PTY 对
    let pty_pair = self.pty_system.openpty(PtySize { rows, cols, ... })?;

    // 3. 启动 shell 进程
    let mut cmd = CommandBuilder::new("/bin/zsh");
    cmd.env("TERM", "xterm-256color");
    pty_pair.slave.spawn_command(cmd)?;

    // 4. 异步读取输出并发送事件
    tokio::spawn(async move {
        let mut buffer = [0u8; 8192];
        loop {
            match reader.read(&mut buffer) {
                Ok(n) => {
                    let event_name = format!("pty_data_{}", session_id);
                    app_handle.emit(&event_name, data);
                }
                ...
            }
        }
    });

    // 5. 保存会话
    self.sessions.insert(session_id.clone(), session);
    Ok(session_id)
}
```

### 5. 后端 - Tauri Commands

**文件**: `src-tauri/src/pty/commands.rs`

**暴露的命令**:

| 命令 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `pty_spawn` | cols, rows | session_id | 创建新的 PTY 会话 |
| `pty_write` | session_id, data | - | 向 PTY 写入数据 |
| `pty_resize` | session_id, cols, rows | - | 调整 PTY 大小（未实现）|
| `pty_close` | session_id | - | 关闭 PTY 会话 |

## 特性说明

### 已实现功能

1. **基础终端功能**
   - ✅ 终端渲染（xterm.js）
   - ✅ PTY 会话管理
   - ✅ Shell 进程控制（macOS zsh）
   - ✅ 双向数据流（输入/输出）
   - ✅ 终端主题（VS Code 风格）

2. **UI 功能**
   - ✅ 响应式布局
   - ✅ 自动调整终端大小
   - ✅ 标签页管理
   - ✅ 链接点击支持

3. **技术特性**
   - ✅ 前后端类型安全（TypeScript + Rust）
   - ✅ 异步 I/O（Tokio）
   - ✅ 事件驱动架构
   - ✅ 状态管理（Pinia）

### 待实现/改进功能

1. **核心功能**
   - ⚠️ PTY 窗口大小调整（resize 函数未完全实现）
   - 🔲 分屏功能（水平/垂直分割）
   - 🔲 多标签页完整支持
   - 🔲 会话持久化

2. **UI/UX 改进**
   - 🔲 标签页切换 UI
   - 🔲 分屏拖拽调整
   - 🔲 右键菜单
   - 🔲 快捷键支持
   - 🔲 主题切换

3. **高级功能**
   - 🔲 搜索功能
   - 🔲 历史记录
   - 🔲 会话恢复
   - 🔲 跨平台 Shell 支持（当前硬编码 zsh）
   - 🔲 配置文件支持

## 开发指南

### 环境要求

- Node.js / Bun
- Rust (最新稳定版)
- macOS / Linux / Windows

### 安装依赖

```bash
cd frontend
bun install
```

### 开发模式

```bash
bun run dev
```

这会同时启动：
1. Vite 开发服务器 (http://localhost:5173)
2. Tauri 桌面应用（热重载）

### 构建生产版本

```bash
bun run build
```

生成的应用在 `src-tauri/target/release/`

### 代码组织建议

1. **前端组件**：单一职责原则，组件应专注于特定功能
2. **Composables**：可复用的逻辑应提取为 composables
3. **Store**：全局状态使用 Pinia，局部状态使用 `ref`/`reactive`
4. **Rust 模块**：按功能划分模块，保持清晰的模块边界

## 配置说明

### Tauri 配置 (`tauri.conf.json`)

```json
{
  "productName": "Terminal Emulator",
  "identifier": "com.terminal.emulator",
  "app": {
    "windows": [{
      "width": 1200,
      "height": 800,
      "minWidth": 800,
      "minHeight": 600
    }]
  }
}
```

### Vite 配置重点

```typescript
server: {
  port: 5173,
  strictPort: true  // Tauri 需要固定端口
}
```

### TypeScript 配置

- `tsconfig.app.json`: 应用代码配置
- `tsconfig.node.json`: Node 工具配置
- `tsconfig.json`: 基础配置

## 性能考虑

1. **PTY 读取缓冲**: 8KB 缓冲区平衡性能和延迟
2. **异步架构**: Tokio 确保非阻塞 I/O
3. **事件传输**: 直接发送 Vec<u8> 避免字符串转换
4. **终端渲染**: xterm.js 使用 Canvas/WebGL 优化渲染

## 安全考虑

1. **CSP 配置**: 当前为 null，生产环境应配置严格的 CSP
2. **Shell 命令**: 当前硬编码 `/bin/zsh`，应验证路径
3. **会话隔离**: 每个会话独立，防止交叉污染
4. **资源清理**: 及时关闭 PTY 会话避免资源泄漏

## 常见问题

### 1. 终端大小不正确

**原因**: `pty_resize` 命令未完全实现

**临时方案**: 重启会话会使用当前窗口大小

**TODO**: 实现 PTY 大小调整功能

### 2. 非 macOS 系统无法运行

**原因**: Shell 路径硬编码为 `/bin/zsh`

**解决方案**:
```rust
// 需要改进 src-tauri/src/pty/manager.rs
#[cfg(target_os = "macos")]
let shell = "/bin/zsh";
#[cfg(target_os = "linux")]
let shell = "/bin/bash";
#[cfg(target_os = "windows")]
let shell = "powershell.exe";
```

### 3. 终端输出延迟

**可能原因**:
- 缓冲区大小不合适
- 事件处理瓶颈

**排查方向**:
- 调整 `PTY_BUFFER_SIZE`
- 检查前端事件处理性能

## 扩展建议

### 短期目标

1. 实现 PTY resize 功能
2. 添加跨平台 Shell 支持
3. 完善分屏 UI 交互

### 中期目标

1. 多标签页完整实现
2. 快捷键系统
3. 配置文件支持
4. 主题系统

### 长期目标

1. 插件系统
2. SSH 连接支持
3. 会话管理和恢复
4. AI 辅助功能

## 贡献指南

1. Fork 项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

## 许可证

待定

## 联系方式

待补充

---

**文档版本**: 1.0
**最后更新**: 2026-03-20
**维护者**: [待补充]
