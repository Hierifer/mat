# Skill: MAT 开发流程和命令

## Summary
本文档整理了 MAT 终端模拟器项目的开发流程、常用命令和最佳实践，涵盖环境搭建、开发调试、构建发布全流程。

## Quick Reference

### 环境要求

| 工具 | 版本要求 | 用途 |
|------|---------|------|
| **Node.js/Bun** | LTS | 前端包管理和构建 |
| **Rust** | 最新稳定版 | 后端编译 |
| **Tauri CLI** | 2.9.1+ | 桌面应用打包 |

**平台特定要求**:
- **macOS**: Xcode Command Line Tools
- **Linux**: `webkit2gtk`, `libxcb-*` 开发包
- **Windows**: Microsoft C++ Build Tools, WebView2

[ref: README.md#前置要求, PROJECT_DOCUMENTATION.md#环境要求]

### 常用命令速查表

| 任务 | 命令 | 说明 |
|------|------|------|
| **安装依赖** | `cd frontend && npm install` | 安装前端依赖 |
| **浏览器模式开发** | `npm run dev` | Vite dev server，mock 终端 |
| **Tauri 模式开发** | `npm run tauri:dev` | 真实 Tauri 应用 + 热重载 |
| **类型检查** | `npm run typecheck` | TypeScript 类型检查 |
| **构建检查** | `npm run build:check` | 类型检查 + 构建 |
| **生产构建** | `npm run tauri:build` | 打包发布版本 |
| **Rust 检查** | `cargo check` | Rust 编译检查 |
| **清理构建** | `cargo clean && rm -rf node_modules` | 清理所有构建产物 |

[ref: package.json#scripts]

## 详细开发流程

### 1. 初始化项目

```bash
# 克隆项目
git clone <repository-url>
cd terminal-emulator/frontend

# 安装前端依赖
npm install

# 验证 Rust 环境
cargo --version
rustc --version

# 验证 Tauri CLI
npm run tauri --version
```

[ref: README.md#安装]

### 2. 开发模式

#### 方式 1: 浏览器模式 (快速 UI 开发)

```bash
npm run dev
```

**特点**:
- 启动速度快 (~2s)
- 仅需 Vite，无需编译 Rust
- Mock 终端 (无实际 shell 执行)
- 适合 UI/布局调试

**访问**: http://localhost:5173

**日志位置**: 浏览器控制台 (Cmd+Option+I)

[ref: TROUBLESHOOTING.md#Step 4, IMPLEMENTATION_COMPLETE.md#浏览器模式支持]

#### 方式 2: Tauri 模式 (完整功能开发)

```bash
npm run tauri:dev
```

**特点**:
- 完整 PTY 功能
- 真实 shell 环境
- 热重载支持
- 启动较慢 (~10-15s 首次编译)

**日志位置**:
- **前端**: Tauri 窗口的 DevTools
- **后端**: 终端输出 (Rust 日志)

[ref: README.md#开发, TROUBLESHOOTING.md#Step 5]

### 3. 调试技巧

#### 前端调试

**浏览器模式**:
```javascript
// 检查 Tauri 环境
console.log(window.__TAURI_INTERNALS__)  // undefined = 浏览器模式

// 检查 store 状态
import { useTerminalStore } from '@/stores/terminal-store'
const store = useTerminalStore()
console.log(store.tabs)
console.log(store.activeTabId)
console.log(store.activePaneId)
```

**Tauri 模式**:
- 右键点击 → Inspect (打开 DevTools)
- 或在代码中使用 `console.log()`
- 检查 Network 标签页看 IPC 调用

[ref: TROUBLESHOOTING.md#Step 1]

#### 后端调试

**添加日志**:
```rust
use log::{info, warn, error, debug};

// 在关键位置添加日志
info!("Spawning shell: {}", shell);
debug!("Session ID: {}", session_id);
error!("Failed to write to PTY: {}", err);
```

**查看日志**:
```bash
# 设置日志级别
RUST_LOG=debug npm run tauri:dev

# 仅看特定模块
RUST_LOG=mat_lib::pty=debug npm run tauri:dev
```

[ref: IMPLEMENTATION_COMPLETE.md#错误处理增强]

#### 常见调试场景

**问题: 终端不显示**
```bash
# 检查 1: PTY spawn 是否成功
# 浏览器 console 应该看到: "Tab created successfully"

# 检查 2: 事件监听是否工作
# 后端日志应该有: "Spawned shell successfully"

# 检查 3: Session ID 是否正确传递
console.log(sessionId)  // 应该是 UUID 格式
```

**问题: 分屏不工作**
```javascript
// 检查活动窗格
const store = useTerminalStore()
console.log(store.activePaneId)  // 应该有值

// 检查布局树
console.log(JSON.stringify(store.tabs[0].layout, null, 2))
```

[ref: TROUBLESHOOTING.md#Common Issues & Solutions]

### 4. 构建流程

#### 开发构建 (调试符号 + 快速编译)

```bash
npm run build
```

生成位置: `frontend/src-tauri/target/debug/`

#### 生产构建 (优化 + 小体积)

```bash
npm run tauri:build
```

**生成位置**:
- **macOS**: `src-tauri/target/release/bundle/dmg/`
- **Linux**: `src-tauri/target/release/bundle/deb/` 或 `appimage/`
- **Windows**: `src-tauri/target/release/bundle/msi/`

**构建时间**:
- 首次: ~5-10 分钟
- 增量: ~2-5 分钟

[ref: README.md#构建, IMPLEMENTATION_COMPLETE.md#部署建议]

### 5. 测试流程

#### 功能测试清单

**基础测试**:
```bash
# 1. 启动 Tauri
npm run tauri:dev

# 2. 验证终端启动
# 应该看到 shell 提示符 ($ 或 %)

# 3. 测试输入/输出
echo "Hello World"
ls -la

# 4. 测试 resize
# 拖拽窗口边缘，运行:
watch "tput cols && tput lines"
# 数字应该实时更新
```

**分屏测试**:
```bash
# 1. 水平分割 (Cmd+D)
# 2. 垂直分割 (Cmd+Shift+D)
# 3. 关闭窗格 (Cmd+W)
# 4. 在不同窗格中运行不同命令
```

**压力测试**:
```bash
# 大量输出
yes

# 长时间运行
ping google.com

# 快速分割/关闭 (10+ 次)
```

[ref: VERIFICATION_CHECKLIST.md, FINAL_TEST_GUIDE.md]

#### 性能基准测试

```bash
# 启动时间
time npm run tauri:dev

# 内存使用
# macOS: Activity Monitor
# Linux: htop
# Windows: Task Manager

# 预期值:
# - 单终端: 50-80MB
# - 4 窗格: 150-250MB
```

[ref: IMPLEMENTATION_COMPLETE.md#性能测试]

### 6. 代码组织规范

#### 前端代码规范

**组件命名**:
- 文件名: `kebab-case.vue` (如 `terminal-instance.vue`)
- 组件名: `PascalCase` (如 `TerminalInstance`)

**Composables**:
- 文件名: `use-*.ts` (如 `use-pty-session.ts`)
- 导出函数: `use*` (如 `usePtySession()`)

**Store**:
- 文件名: `*-store.ts` (如 `terminal-store.ts`)
- Store ID: `*Store` (如 `terminalStore`)

[ref: PROJECT_DOCUMENTATION.md#代码组织建议]

#### Rust 代码规范

**模块组织**:
```
src-tauri/src/
├── lib.rs          # 库导出和配置
├── main.rs         # 主入口
└── pty/            # PTY 功能模块
    ├── mod.rs      # 模块入口
    ├── manager.rs  # 核心逻辑
    ├── commands.rs # Tauri 命令
    └── shell.rs    # 工具函数
```

**命名规范**:
- 函数: `snake_case`
- 结构体: `PascalCase`
- 常量: `UPPER_SNAKE_CASE`

[ref: PROJECT_DOCUMENTATION.md#项目结构]

### 7. Git 工作流

#### Commit 规范

```bash
# 功能开发
git commit -m "feat: add horizontal split functionality"

# Bug 修复
git commit -m "fix: resolve PTY resize issue on macOS"

# 文档更新
git commit -m "docs: update installation guide"

# 性能优化
git commit -m "perf: add debounce to resize handler"

# 代码重构
git commit -m "refactor: extract shell detection logic"
```

#### 分支策略

```bash
# 主分支
main          # 稳定版本
develop       # 开发分支

# 功能分支
git checkout -b feature/tab-management
git checkout -b feature/custom-themes

# 修复分支
git checkout -b fix/resize-linux
git checkout -b fix/event-listener-leak
```

### 8. 常见问题解决

#### 问题: `cargo check` 失败

```bash
# 更新 Rust
rustup update stable

# 清理并重建
cargo clean
cargo check
```

#### 问题: 依赖安装失败

```bash
# 清理缓存
rm -rf node_modules
rm package-lock.json

# 重新安装
npm install
```

#### 问题: Tauri 权限错误

检查 `src-tauri/capabilities/default.json`:
```json
{
  "permissions": [
    "core:event:allow-listen",
    "core:event:allow-emit",
    "core:window:default"
  ]
}
```

[ref: IMPLEMENTATION_COMPLETE.md#Tauri v2 权限配置, TROUBLESHOOTING.md]

#### 问题: PTY 输出延迟

```rust
// 调整缓冲区大小 (src-tauri/src/pty/manager.rs)
const PTY_BUFFER_SIZE: usize = 8192;  // 默认值

// 尝试增加:
const PTY_BUFFER_SIZE: usize = 16384;
```

[ref: PROJECT_DOCUMENTATION.md#性能考虑]

## Python 工具

### 开发环境检查脚本

```python
#!/usr/bin/env python3
"""检查 MAT 开发环境是否就绪"""

import subprocess
import sys
from pathlib import Path

def check_command(cmd: str, name: str) -> bool:
    """检查命令是否存在"""
    try:
        result = subprocess.run(
            [cmd, "--version"],
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode == 0:
            version = result.stdout.split('\n')[0]
            print(f"✅ {name}: {version}")
            return True
        else:
            print(f"❌ {name}: 命令失败")
            return False
    except FileNotFoundError:
        print(f"❌ {name}: 未安装")
        return False
    except subprocess.TimeoutExpired:
        print(f"⚠️  {name}: 超时")
        return False

def check_directory(path: Path, name: str) -> bool:
    """检查目录是否存在"""
    if path.exists() and path.is_dir():
        print(f"✅ {name}: {path}")
        return True
    else:
        print(f"❌ {name}: 不存在 ({path})")
        return False

def main():
    print("MAT 开发环境检查\n" + "="*50 + "\n")

    checks = []

    # 检查必需工具
    print("检查必需工具:")
    checks.append(check_command("node", "Node.js"))
    checks.append(check_command("npm", "npm"))
    checks.append(check_command("cargo", "Rust"))
    checks.append(check_command("rustc", "Rust Compiler"))

    print("\n检查项目目录:")
    project_root = Path(__file__).parent.parent
    frontend = project_root / "frontend"
    src_tauri = frontend / "src-tauri"

    checks.append(check_directory(frontend, "Frontend"))
    checks.append(check_directory(src_tauri, "Tauri Backend"))
    checks.append(check_directory(frontend / "node_modules", "Node Modules"))

    print("\n检查关键文件:")
    files = [
        (frontend / "package.json", "package.json"),
        (src_tauri / "Cargo.toml", "Cargo.toml"),
        (src_tauri / "tauri.conf.json", "tauri.conf.json"),
    ]

    for file_path, name in files:
        if file_path.exists():
            print(f"✅ {name}")
            checks.append(True)
        else:
            print(f"❌ {name}: 不存在")
            checks.append(False)

    # 总结
    print("\n" + "="*50)
    passed = sum(checks)
    total = len(checks)
    print(f"检查结果: {passed}/{total} 通过")

    if passed == total:
        print("\n🎉 开发环境就绪！可以运行:")
        print("  cd frontend")
        print("  npm run dev        # 浏览器模式")
        print("  npm run tauri:dev  # Tauri 模式")
        return 0
    else:
        print("\n⚠️  请先解决上述问题")
        return 1

if __name__ == '__main__':
    sys.exit(main())
```

**使用方法**:
```bash
# 保存为 check_env.py
python3 check_env.py
```

## References

- [README.md](/Users/hierifer/Desktop/terminal-emulator/README.md) — 快速开始
- [PROJECT_DOCUMENTATION.md](/Users/hierifer/Desktop/terminal-emulator/PROJECT_DOCUMENTATION.md) — 开发指南
- [TROUBLESHOOTING.md](/Users/hierifer/Desktop/terminal-emulator/TROUBLESHOOTING.md) — 问题排查
- [VERIFICATION_CHECKLIST.md](/Users/hierifer/Desktop/terminal-emulator/VERIFICATION_CHECKLIST.md) — 测试清单
- [package.json](/Users/hierifer/Desktop/terminal-emulator/frontend/package.json) — NPM 脚本定义

## Related Skills

- [项目概览](./project-overview.md)
- [跨平台构建](./cross-platform-build.md)
- [配置和设置](./configuration.md)
