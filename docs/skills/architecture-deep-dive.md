# Skill: MAT 架构深入理解

## Summary
本文档深入解析 MAT 终端模拟器的架构设计、技术决策、数据流、状态管理和关键实现细节，帮助开发者理解系统的内部运作机制。

## Quick Reference

### 核心架构模式

| 模式 | 应用位置 | 说明 |
|------|---------|------|
| **事件驱动** | 前后端通信 | Tauri IPC 基于事件系统 |
| **观察者模式** | PTY 输出 | 后端发送事件，前端监听 |
| **组合模式** | 分屏布局 | 树形结构表示嵌套布局 |
| **单例模式** | PTY Manager | 全局唯一的 PTY 管理器 |
| **策略模式** | Shell 检测 | 根据平台选择不同 shell |
| **装饰器模式** | xterm.js addons | 功能插件扩展 |

[ref: PROJECT_DOCUMENTATION.md#核心架构]

### 关键数据结构

```typescript
// 分屏布局树
interface SplitNode {
  type: 'horizontal' | 'vertical' | 'pane'
  children?: SplitNode[]
  paneId?: string
  sessionId?: string
  size?: number
}

// 终端标签页
interface TerminalTab {
  id: string
  title: string
  layout: SplitNode
  createdAt: number
}
```

```rust
// PTY 会话
pub struct PtySession {
    writer: Box<dyn Write + Send>,
    master: Arc<TokioMutex<Box<dyn MasterPty + Send>>>,
}

// PTY 管理器
pub struct PtyManager {
    sessions: HashMap<String, PtySession>,
    pty_system: Box<dyn PtySystem + Send>,
}
```

[ref: PROJECT_DOCUMENTATION.md#核心模块详解]

## 架构分层

### 层级划分

```
┌─────────────────────────────────────────────────────┐
│         表现层 (Presentation Layer)                  │
│  - Vue 组件 (terminal-instance, split-container)    │
│  - xterm.js 渲染                                     │
│  - UI 交互逻辑                                       │
└─────────────────────┬───────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────┐
│         逻辑层 (Business Logic Layer)                │
│  - Terminal Store (状态管理)                         │
│  - Composables (可复用逻辑)                          │
│  - 分屏布局算法                                       │
└─────────────────────┬───────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────┐
│         通信层 (Communication Layer)                 │
│  - Tauri IPC (invoke/listen)                        │
│  - 事件序列化/反序列化                                │
│  - 错误处理和重试                                     │
└─────────────────────┬───────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────┐
│         服务层 (Service Layer)                       │
│  - PTY Commands (Tauri 命令)                         │
│  - PTY Manager (会话管理)                            │
│  - Shell 检测和配置                                   │
└─────────────────────┬───────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────┐
│         系统层 (System Layer)                        │
│  - portable-pty (跨平台 PTY)                         │
│  - tokio (异步运行时)                                │
│  - 操作系统 API                                       │
└─────────────────────────────────────────────────────┘
```

[ref: PROJECT_DOCUMENTATION.md#整体架构图]

## 前端架构详解

### 1. 状态管理 (Pinia Store)

#### Store 结构

```typescript
// src/stores/terminal-store.ts

export const useTerminalStore = defineStore('terminalStore', () => {
  // 状态
  const tabs = ref<TerminalTab[]>([])
  const activeTabId = ref<string | null>(null)
  const activePaneId = ref<string | null>(null)

  // 计算属性
  const activeTab = computed(() =>
    tabs.value.find(t => t.id === activeTabId.value)
  )

  const activePane = computed(() => {
    if (!activeTab.value || !activePaneId.value) return null
    return findNodeByPaneId(activeTab.value.layout, activePaneId.value)
  })

  // Actions
  async function createTab() { /* ... */ }
  async function closeTab(tabId: string) { /* ... */ }
  async function splitPane(direction: 'horizontal' | 'vertical') { /* ... */ }
  async function closePane(paneId: string) { /* ... */ }

  return {
    tabs,
    activeTabId,
    activePaneId,
    activeTab,
    activePane,
    createTab,
    closeTab,
    splitPane,
    closePane
  }
})
```

**设计要点**:
- 使用 Composition API 风格
- 状态和逻辑集中管理
- 计算属性自动更新
- 异步操作统一处理

[ref: PROJECT_DOCUMENTATION.md#前端 - Terminal Store]

#### 树操作算法

```typescript
// 查找节点
function findNodeByPaneId(node: SplitNode, paneId: string): SplitNode | null {
  if (node.type === 'pane' && node.paneId === paneId) {
    return node
  }

  if (node.children) {
    for (const child of node.children) {
      const found = findNodeByPaneId(child, paneId)
      if (found) return found
    }
  }

  return null
}

// 替换节点
function replaceNode(
  node: SplitNode,
  targetPaneId: string,
  newNode: SplitNode
): boolean {
  if (node.children) {
    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i]

      if (child.type === 'pane' && child.paneId === targetPaneId) {
        node.children[i] = newNode
        return true
      }

      if (replaceNode(child, targetPaneId, newNode)) {
        return true
      }
    }
  }

  return false
}

// 删除节点并简化树
function removePaneFromLayout(
  node: SplitNode,
  paneId: string
): SplitNode | null {
  if (node.type === 'pane' && node.paneId === paneId) {
    return null
  }

  if (node.children) {
    node.children = node.children
      .map(child => removePaneFromLayout(child, paneId))
      .filter((child): child is SplitNode => child !== null)

    // 简化: 如果只剩一个子节点，提升它
    if (node.children.length === 1) {
      return node.children[0]
    }

    // 如果没有子节点，删除此节点
    if (node.children.length === 0) {
      return null
    }
  }

  return node
}
```

**算法复杂度**:
- 查找: O(n)，n 为节点数
- 替换: O(n)
- 删除: O(n)

**优化建议**: 如果窗格数量 > 100，考虑使用哈希表索引

[ref: IMPLEMENTATION_COMPLETE.md#分屏功能, src/stores/terminal-store.ts]

### 2. Composables 设计

#### usePtySession

```typescript
// src/composables/use-pty-session.ts

export function usePtySession(sessionId: string) {
  const isConnected = ref(false)
  let unlistenFn: UnlistenFn | null = null

  async function connect(onData: (data: Uint8Array) => void) {
    if (isConnected.value) return

    // @ts-ignore
    if (window.__TAURI_INTERNALS__) {
      // Tauri 模式: 真实 PTY
      const eventName = `pty_data_${sessionId}`
      unlistenFn = await listen<number[]>(eventName, (event) => {
        const data = new Uint8Array(event.payload)
        onData(data)
      })
    } else {
      // 浏览器模式: Mock 终端
      const mockData = new TextEncoder().encode(
        '\r\n\x1b[32m$ \x1b[0m'  // 绿色提示符
      )
      setTimeout(() => onData(mockData), 100)
    }

    isConnected.value = true
  }

  async function write(data: string) {
    if (!isConnected.value) return

    // @ts-ignore
    if (window.__TAURI_INTERNALS__) {
      await invoke('pty_write', { sessionId, data })
    } else {
      // Mock: 回显输入
      console.log('[Mock PTY] Write:', data)
    }
  }

  async function resize(cols: number, rows: number) {
    if (!isConnected.value) return

    // @ts-ignore
    if (window.__TAURI_INTERNALS__) {
      await invoke('pty_resize', { sessionId, cols, rows })
    }
  }

  async function close() {
    if (!isConnected.value) return

    if (unlistenFn) {
      unlistenFn()
      unlistenFn = null
    }

    // @ts-ignore
    if (window.__TAURI_INTERNALS__) {
      await invoke('pty_close', { sessionId })
    }

    isConnected.value = false
  }

  onUnmounted(() => {
    close()
  })

  return {
    isConnected,
    connect,
    write,
    resize,
    close
  }
}
```

**设计要点**:
- 环境自适应 (Tauri/浏览器)
- 自动清理资源
- 错误处理
- 防抖和节流

[ref: PROJECT_DOCUMENTATION.md#前端 - PTY Session Composable, src/composables/use-pty-session.ts]

#### useKeyboardShortcuts

```typescript
// src/composables/use-keyboard-shortcuts.ts

export function useKeyboardShortcuts() {
  const store = useTerminalStore()

  function handleKeyDown(event: KeyboardEvent) {
    const isCmd = event.metaKey || event.ctrlKey

    if (isCmd && event.shiftKey && event.key === 'D') {
      // Cmd+Shift+D: 垂直分割
      event.preventDefault()
      store.splitPane('vertical')
    } else if (isCmd && event.key === 'd') {
      // Cmd+D: 水平分割
      event.preventDefault()
      store.splitPane('horizontal')
    } else if (isCmd && event.key === 'w') {
      // Cmd+W: 关闭窗格
      event.preventDefault()
      if (store.activePaneId) {
        store.closePane(store.activePaneId)
      }
    }
  }

  onMounted(() => {
    window.addEventListener('keydown', handleKeyDown)
  })

  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeyDown)
  })
}
```

**设计要点**:
- 跨平台快捷键 (metaKey/ctrlKey)
- 防止默认行为
- 事件监听器清理
- 可配置和扩展

[ref: IMPLEMENTATION_COMPLETE.md#键盘快捷键, src/composables/use-keyboard-shortcuts.ts]

### 3. 组件通信模式

#### 父子通信 (Props & Emits)

```vue
<!-- split-container.vue -->
<script setup lang="ts">
interface Props {
  node: SplitNode
}

const props = defineProps<Props>()

const emit = defineEmits<{
  paneClick: [paneId: string]
}>()

function handlePaneClick(paneId: string) {
  emit('paneClick', paneId)
}
</script>
```

#### 兄弟组件通信 (Store)

```typescript
// 组件 A
const store = useTerminalStore()
store.setActivePane(paneId)

// 组件 B (自动响应)
const activePaneId = computed(() => store.activePaneId)
watch(activePaneId, (newId) => {
  console.log('Active pane changed:', newId)
})
```

#### 跨层级通信 (Provide/Inject)

```typescript
// App.vue
provide('theme', ref('dark'))

// 深层子组件
const theme = inject<Ref<string>>('theme')
```

[ref: PROJECT_DOCUMENTATION.md#代码组织建议]

## 后端架构详解

### 1. PTY Manager 实现

#### 核心结构

```rust
// src-tauri/src/pty/manager.rs

pub struct PtyManager {
    sessions: HashMap<String, PtySession>,
    pty_system: Box<dyn PtySystem + Send>,
}

pub struct PtySession {
    writer: Box<dyn Write + Send>,
    master: Arc<TokioMutex<Box<dyn MasterPty + Send>>>,
}

impl PtyManager {
    pub fn new() -> Self {
        Self {
            sessions: HashMap::new(),
            pty_system: portable_pty::native_pty_system(),
        }
    }
}
```

**设计要点**:
- `HashMap` 存储会话 (O(1) 查找)
- `Arc<Mutex<>>` 实现线程安全
- Trait 对象支持跨平台

[ref: PROJECT_DOCUMENTATION.md#后端 - PTY Manager, src-tauri/src/pty/manager.rs]

#### Spawn Shell 流程

```rust
pub async fn spawn_shell(
    &mut self,
    cols: u16,
    rows: u16,
    app_handle: AppHandle,
) -> Result<String, String> {
    // 1. 生成唯一会话 ID
    let session_id = Uuid::now_v7().to_string();
    log::info!("Spawning shell with session ID: {}", session_id);

    // 2. 创建 PTY 尺寸
    let pty_size = PtySize {
        rows,
        cols,
        pixel_width: 0,
        pixel_height: 0,
    };

    // 3. 创建 PTY 对
    let pty_pair = self
        .pty_system
        .openpty(pty_size)
        .map_err(|e| format!("Failed to open PTY: {}", e))?;

    // 4. 获取 shell 路径
    let shell = crate::pty::shell::get_shell();
    log::info!("Using shell: {}", shell);

    // 5. 配置 shell 命令
    let mut cmd = CommandBuilder::new(shell);
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");

    // 6. 启动 shell 进程
    let _child = pty_pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("Failed to spawn shell: {}", e))?;

    // 7. 包装 master 为线程安全
    let master = Arc::new(TokioMutex::new(pty_pair.master));

    // 8. 克隆 reader
    let reader = master
        .lock()
        .await
        .try_clone_reader()
        .map_err(|e| format!("Failed to clone reader: {}", e))?;

    // 9. 启动后台读取任务
    let session_id_clone = session_id.clone();
    tokio::spawn(async move {
        let mut buffer = [0u8; 8192];
        let mut reader = reader;

        loop {
            match reader.read(&mut buffer) {
                Ok(0) => {
                    log::info!("PTY closed for session {}", session_id_clone);
                    break;
                }
                Ok(n) => {
                    let data: Vec<u8> = buffer[..n].to_vec();
                    let event_name = format!("pty_data_{}", session_id_clone);

                    if let Err(e) = app_handle.emit(&event_name, data) {
                        log::error!("Failed to emit PTY data: {}", e);
                        break;
                    }
                }
                Err(e) => {
                    log::error!("Error reading from PTY: {}", e);
                    break;
                }
            }
        }
    });

    // 10. 获取 writer
    let writer = master
        .lock()
        .await
        .take_writer()
        .map_err(|e| format!("Failed to take writer: {}", e))?;

    // 11. 存储会话
    self.sessions.insert(
        session_id.clone(),
        PtySession { writer, master },
    );

    log::info!("Shell spawned successfully: {}", session_id);
    Ok(session_id)
}
```

**关键决策**:
- 使用 UUID v7 (时间排序)
- Arc + Mutex 实现共享所有权
- Tokio 异步任务处理 I/O
- 缓冲区大小 8KB (性能平衡)

[ref: IMPLEMENTATION_COMPLETE.md#后端架构, src-tauri/src/pty/manager.rs]

#### Write 实现

```rust
pub fn write(&mut self, session_id: &str, data: &str) -> Result<(), String> {
    log::debug!("Writing to session {}: {} bytes", session_id, data.len());

    let session = self
        .sessions
        .get_mut(session_id)
        .ok_or_else(|| format!("Session not found: {}", session_id))?;

    session
        .writer
        .write_all(data.as_bytes())
        .map_err(|e| format!("Failed to write to PTY: {}", e))?;

    session
        .writer
        .flush()
        .map_err(|e| format!("Failed to flush PTY: {}", e))?;

    Ok(())
}
```

**设计要点**:
- 立即刷新 (低延迟)
- 错误传播
- 日志记录

#### Resize 实现

```rust
pub async fn resize(
    &mut self,
    session_id: &str,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    log::debug!("Resizing session {} to {}x{}", session_id, cols, rows);

    let session = self
        .sessions
        .get(session_id)
        .ok_or_else(|| format!("Session not found: {}", session_id))?;

    let pty_size = PtySize {
        rows,
        cols,
        pixel_width: 0,
        pixel_height: 0,
    };

    session
        .master
        .lock()
        .await
        .resize(pty_size)
        .map_err(|e| format!("Failed to resize PTY: {}", e))?;

    Ok(())
}
```

**技术难点**:
- 需要 `async` (因为 `lock().await`)
- 不能用 `blocking_lock()` (会 panic)

[ref: IMPLEMENTATION_COMPLETE.md#PTY Resize 功能]

### 2. Shell 检测策略

```rust
// src-tauri/src/pty/shell.rs

pub fn get_shell() -> String {
    // 1. 优先使用环境变量
    if let Ok(shell) = std::env::var("SHELL") {
        if is_shell_valid(&shell) {
            return shell;
        }
    }

    // 2. 使用平台默认值
    #[cfg(target_os = "macos")]
    {
        for shell in ["/bin/zsh", "/bin/bash", "/bin/sh"] {
            if is_shell_valid(shell) {
                return shell.to_string();
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        for shell in ["/bin/bash", "/bin/sh"] {
            if is_shell_valid(shell) {
                return shell.to_string();
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        for shell in ["pwsh.exe", "powershell.exe", "cmd.exe"] {
            if is_shell_valid(shell) {
                return shell.to_string();
            }
        }
    }

    // 3. 最终回退
    "/bin/sh".to_string()
}

fn is_shell_valid(shell: &str) -> bool {
    std::path::Path::new(shell).exists()
}
```

**策略模式应用**:
- 策略链: 环境变量 → 平台默认 → 回退
- 验证逻辑: 检查文件存在性
- 可扩展: 添加新平台只需新增 `cfg` 块

[ref: IMPLEMENTATION_COMPLETE.md#跨平台 Shell 支持, src-tauri/src/pty/shell.rs]

### 3. Tauri Commands 设计

```rust
// src-tauri/src/pty/commands.rs

#[tauri::command]
pub async fn pty_spawn(
    cols: u16,
    rows: u16,
    state: State<'_, Arc<Mutex<PtyManager>>>,
    app: AppHandle,
) -> Result<String, String> {
    let mut manager = state.lock().unwrap();
    manager.spawn_shell(cols, rows, app).await
}

#[tauri::command]
pub fn pty_write(
    session_id: String,
    data: String,
    state: State<'_, Arc<Mutex<PtyManager>>>,
) -> Result<(), String> {
    let mut manager = state.lock().unwrap();
    manager.write(&session_id, &data)
}

#[tauri::command]
pub async fn pty_resize(
    session_id: String,
    cols: u16,
    rows: u16,
    state: State<'_, Arc<Mutex<PtyManager>>>,
) -> Result<(), String> {
    let mut manager = state.lock().unwrap();
    manager.resize(&session_id, cols, rows).await
}

#[tauri::command]
pub fn pty_close(
    session_id: String,
    state: State<'_, Arc<Mutex<PtyManager>>>,
) -> Result<(), String> {
    let mut manager = state.lock().unwrap();
    manager.close_session(&session_id)
}
```

**设计要点**:
- `async` 命令用于长时间操作
- `State` 管理全局状态
- `Arc<Mutex<>>` 实现并发安全
- 错误统一返回 `Result<T, String>`

[ref: PROJECT_DOCUMENTATION.md#后端 - Tauri Commands, src-tauri/src/pty/commands.rs]

## 通信协议

### 1. IPC 数据流

#### 前端 → 后端 (Invoke)

```typescript
// 调用 Rust 命令
const sessionId = await invoke<string>('pty_spawn', {
  cols: 80,
  rows: 24
})

// Tauri 序列化为 JSON:
// {"cols": 80, "rows": 24}

// Rust 反序列化:
// cols: u16 = 80
// rows: u16 = 24
```

#### 后端 → 前端 (Emit/Listen)

```rust
// Rust 发送事件
app_handle.emit("pty_data_abc123", vec![72, 101, 108, 108, 111])

// Tauri 序列化为 JSON:
// [72, 101, 108, 108, 111]

// 前端监听:
await listen<number[]>("pty_data_abc123", (event) => {
  const data = new Uint8Array(event.payload)
  // data = Uint8Array([72, 101, 108, 108, 111]) = "Hello"
})
```

**数据类型映射**:

| Rust | TypeScript | 说明 |
|------|-----------|------|
| `String` | `string` | UTF-8 文本 |
| `u16`, `u32` | `number` | 数字 |
| `Vec<u8>` | `number[]` | 字节数组 |
| `bool` | `boolean` | 布尔值 |
| `Option<T>` | `T \| null` | 可选值 |
| `Result<T, E>` | `Promise<T>` | 异步结果 |

[ref: PROJECT_DOCUMENTATION.md#数据流]

### 2. 事件命名规范

```typescript
// PTY 数据事件
`pty_data_${sessionId}`

// 窗口事件
`window_${action}_${windowId}`

// 自定义事件
`custom_${feature}_${action}`
```

**规范目的**:
- 避免事件名冲突
- 便于调试和日志
- 支持动态订阅

### 3. 错误处理策略

```typescript
// 前端
try {
  await invoke('pty_write', { sessionId, data })
} catch (error) {
  console.error('Failed to write to PTY:', error)
  // 显示用户友好错误
  showNotification('Failed to write to terminal')
}
```

```rust
// 后端
pub fn write(&mut self, session_id: &str, data: &str) -> Result<(), String> {
    self.sessions
        .get_mut(session_id)
        .ok_or_else(|| format!("Session not found: {}", session_id))?
        .writer
        .write_all(data.as_bytes())
        .map_err(|e| format!("Failed to write: {}", e))?;

    Ok(())
}
```

**错误处理原则**:
- 后端返回描述性错误消息
- 前端捕获并转换为用户友好提示
- 关键错误记录日志
- 不暴露敏感信息

[ref: IMPLEMENTATION_COMPLETE.md#错误处理增强]

## 性能优化

### 1. 前端优化

#### 防抖 (Debounce)

```typescript
// src/components/terminal/terminal-instance.vue

let resizeTimeout: number | null = null

function handleResize() {
  if (resizeTimeout) {
    clearTimeout(resizeTimeout)
  }

  resizeTimeout = setTimeout(() => {
    fitAddon?.fit()
    const dims = fitAddon?.dimensions
    if (dims) {
      resize(dims.cols, dims.rows)
    }
  }, 100) // 100ms 防抖
}
```

**效果**: resize 调用从 ~50次/秒 降低到 ~10次/秒

[ref: IMPLEMENTATION_COMPLETE.md#Resize 防抖优化]

#### 虚拟滚动 (未实现)

```typescript
// 大量输出时使用虚拟滚动
// xterm.js 内置了基于 Canvas 的优化
terminal.options.scrollback = 10000 // 限制滚动缓冲区
```

#### 组件懒加载

```typescript
// 懒加载大型组件
const TerminalInstance = defineAsyncComponent(() =>
  import('./components/terminal/terminal-instance.vue')
)
```

### 2. 后端优化

#### 缓冲区调优

```rust
// 8KB 缓冲区平衡性能和延迟
const PTY_BUFFER_SIZE: usize = 8192;

// 高吞吐量场景 (牺牲延迟)
const PTY_BUFFER_SIZE: usize = 16384;

// 低延迟场景 (牺牲吞吐量)
const PTY_BUFFER_SIZE: usize = 4096;
```

#### 异步 I/O

```rust
// 使用 Tokio 异步运行时
tokio::spawn(async move {
    // 非阻塞读取
    match reader.read(&mut buffer) {
        Ok(n) => { /* ... */ }
        Err(e) => { /* ... */ }
    }
});
```

**优势**:
- 不阻塞主线程
- 高并发支持
- 资源利用率高

#### 内存优化

```rust
// 及时清理会话
pub fn close_session(&mut self, session_id: &str) -> Result<(), String> {
    self.sessions.remove(session_id)
        .ok_or_else(|| format!("Session not found: {}", session_id))?;
    Ok(())
}
```

[ref: PROJECT_DOCUMENTATION.md#性能考虑]

## 技术难点和解决方案

### 1. Tokio 运行时与 blocking 操作

**问题**: 在 async 上下文中使用 `blocking_lock()` 导致 panic

```rust
// ❌ 错误
pub async fn resize(&mut self, session_id: &str, cols: u16, rows: u16) {
    let master = self.sessions[session_id].master.blocking_lock();
    master.resize(pty_size)?;
}
// Panic: Cannot block inside async context
```

**解决方案**: 使用 `.lock().await`

```rust
// ✅ 正确
pub async fn resize(&mut self, session_id: &str, cols: u16, rows: u16) {
    let master = self.sessions[session_id].master.lock().await;
    master.resize(pty_size)?;
}
```

[ref: IMPLEMENTATION_COMPLETE.md#经验教训]

### 2. Vue 组件 Key 问题

**问题**: 使用 `index` 作为 key 导致组件复用错误

```vue
<!-- ❌ 错误 -->
<terminal-instance
  v-for="(child, index) in node.children"
  :key="index"
  :session-id="child.sessionId"
/>
```

**问题表现**: 关闭窗格后，其他窗格的 session 错乱

**解决方案**: 使用稳定的唯一标识符

```vue
<!-- ✅ 正确 -->
<terminal-instance
  v-for="child in node.children"
  :key="child.paneId || child.sessionId"
  :session-id="child.sessionId"
/>
```

[ref: IMPLEMENTATION_COMPLETE.md#Vue 组件 Key 修复]

### 3. Tauri v2 权限系统

**问题**: 事件监听权限被拒绝

```
Error: Permission denied for event 'pty_data_...'
```

**解决方案**: 创建 capabilities 配置

```json
{
  "permissions": [
    "core:event:allow-listen",
    "core:event:allow-emit"
  ]
}
```

[ref: IMPLEMENTATION_COMPLETE.md#Tauri v2 权限配置]

### 4. 跨平台 Shell 兼容性

**问题**: 硬编码 `/bin/zsh` 在 Windows 和部分 Linux 上失败

**解决方案**: 平台检测 + 回退机制

```rust
#[cfg(target_os = "macos")]
const DEFAULT_SHELLS: &[&str] = &["/bin/zsh", "/bin/bash"];

#[cfg(target_os = "linux")]
const DEFAULT_SHELLS: &[&str] = &["/bin/bash", "/bin/sh"];

#[cfg(target_os = "windows")]
const DEFAULT_SHELLS: &[&str] = &["pwsh.exe", "powershell.exe"];
```

[ref: IMPLEMENTATION_COMPLETE.md#跨平台 Shell 支持]

## 未来架构改进

### 1. 插件系统

```typescript
// 插件接口
interface TerminalPlugin {
  name: string
  version: string
  onSessionCreate?: (sessionId: string) => void
  onSessionClose?: (sessionId: string) => void
  onData?: (data: Uint8Array) => Uint8Array
}

// 注册插件
registerPlugin(myPlugin)
```

### 2. 配置系统

```typescript
// 用户配置
interface UserConfig {
  terminal: {
    shell: string
    fontSize: number
    theme: string
  }
  keybindings: Record<string, string>
}

// 加载配置
const config = await loadConfig()
```

### 3. 会话持久化

```typescript
// 保存会话
interface SessionSnapshot {
  sessionId: string
  cwd: string
  history: string[]
  layout: SplitNode
}

// 恢复会话
await restoreSession(snapshot)
```

[ref: PROJECT_DOCUMENTATION.md#扩展建议]

## References

- [PROJECT_DOCUMENTATION.md](/Users/hierifer/Desktop/terminal-emulator/PROJECT_DOCUMENTATION.md) — 完整架构文档
- [IMPLEMENTATION_COMPLETE.md](/Users/hierifer/Desktop/terminal-emulator/IMPLEMENTATION_COMPLETE.md) — 实现总结
- [src/stores/terminal-store.ts](/Users/hierifer/Desktop/terminal-emulator/frontend/src/stores/terminal-store.ts) — 状态管理
- [src-tauri/src/pty/manager.rs](/Users/hierifer/Desktop/terminal-emulator/frontend/src-tauri/src/pty/manager.rs) — PTY 管理器
- [src-tauri/src/pty/commands.rs](/Users/hierifer/Desktop/terminal-emulator/frontend/src-tauri/src/pty/commands.rs) — Tauri 命令

## Related Skills

- [项目概览](./project-overview.md)
- [开发流程和命令](./development-workflow.md)
- [跨平台构建](./cross-platform-build.md)
- [配置和设置](./configuration.md)
