# Skill: MAT 配置和设置

## Summary
本文档详细说明 MAT 终端模拟器的所有配置选项，包括 Tauri 配置、前端配置、后端配置和用户自定义设置。

## Quick Reference

### 关键配置文件

| 文件 | 用途 | 位置 |
|------|------|------|
| `tauri.conf.json` | Tauri 应用配置 | `frontend/src-tauri/` |
| `Cargo.toml` | Rust 依赖和元数据 | `frontend/src-tauri/` |
| `package.json` | 前端依赖和脚本 | `frontend/` |
| `vite.config.ts` | Vite 构建配置 | `frontend/` |
| `tsconfig.json` | TypeScript 配置 | `frontend/` |
| `tailwind.config.ts` | Tailwind CSS 配置 | `frontend/` |
| `capabilities/default.json` | Tauri v2 权限 | `frontend/src-tauri/capabilities/` |

[ref: PROJECT_DOCUMENTATION.md#配置说明]

### 常用配置速查

| 配置项 | 文件 | 默认值 | 说明 |
|--------|------|--------|------|
| **应用名称** | `tauri.conf.json` | "MAT" | 显示名称 |
| **应用标识** | `tauri.conf.json` | "com.terminal.emulator" | Bundle ID |
| **版本号** | `package.json` + `Cargo.toml` | "0.1.7" | 应用版本 |
| **窗口大小** | `tauri.conf.json` | 1200x800 | 初始窗口尺寸 |
| **最小尺寸** | `tauri.conf.json` | 800x600 | 最小窗口尺寸 |
| **开发端口** | `vite.config.ts` | 5173 | Vite dev server |
| **默认 Shell** | `shell.rs` | 平台相关 | 终端 shell |

## Tauri 配置详解

### 基础配置 (tauri.conf.json)

```json
{
  "$schema": "https://schema.tauri.app/config/2.0",
  "productName": "MAT",
  "identifier": "com.terminal.emulator",
  "version": "0.1.7",

  "build": {
    "beforeBuildCommand": "npm run build",
    "beforeDevCommand": "npm run dev",
    "devUrl": "http://localhost:5173",
    "frontendDist": "../dist"
  },

  "app": {
    "windows": [
      {
        "title": "MAT - Modern Terminal",
        "width": 1200,
        "height": 800,
        "minWidth": 800,
        "minHeight": 600,
        "resizable": true,
        "fullscreen": false,
        "decorations": true,
        "transparent": false
      }
    ],
    "security": {
      "csp": "default-src 'self'; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline'"
    }
  },

  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ],
    "identifier": "com.terminal.emulator",
    "category": "DeveloperTool"
  }
}
```

[ref: src-tauri/tauri.conf.json]

### 窗口配置选项

```json
{
  "app": {
    "windows": [{
      // 窗口标题
      "title": "MAT - Modern Terminal",

      // 尺寸
      "width": 1200,
      "height": 800,
      "minWidth": 800,
      "minHeight": 600,
      "maxWidth": null,    // null = 无限制
      "maxHeight": null,

      // 位置
      "x": null,           // null = 居中
      "y": null,
      "center": true,

      // 行为
      "resizable": true,
      "maximized": false,
      "fullscreen": false,
      "decorations": true,  // 显示标题栏
      "transparent": false,
      "alwaysOnTop": false,
      "visible": true,

      // 高级
      "skipTaskbar": false,
      "fileDropEnabled": true,
      "focus": true
    }]
  }
}
```

**常见自定义**:

```json
// 无边框窗口 (自定义标题栏)
{
  "decorations": false,
  "transparent": true
}

// 启动时最大化
{
  "maximized": true
}

// 固定大小 (不可调整)
{
  "resizable": false
}
```

[ref: PROJECT_DOCUMENTATION.md#Tauri 配置]

### 安全配置 (CSP)

```json
{
  "app": {
    "security": {
      "csp": "default-src 'self'; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:"
    }
  }
}
```

**CSP 指令说明**:
- `default-src 'self'` - 默认仅允许同源
- `script-src 'unsafe-eval'` - 允许 eval (Vue/Vite 开发需要)
- `style-src 'unsafe-inline'` - 允许内联样式 (xterm.js 需要)
- `img-src data:` - 允许 data: URL 图片

[ref: PROJECT_DOCUMENTATION.md#安全考虑]

### 权限配置 (Tauri v2)

`src-tauri/capabilities/default.json`:

```json
{
  "$schema": "https://schema.tauri.app/config/2.0/capability",
  "identifier": "default",
  "description": "Default permissions for MAT",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "core:event:allow-listen",
    "core:event:allow-emit",
    "core:window:default",
    "core:window:allow-close",
    "core:window:allow-maximize",
    "core:window:allow-minimize",
    "core:window:allow-set-size",
    "core:window:allow-set-position"
  ]
}
```

**权限说明**:
- `core:event:allow-listen` - 监听事件 (PTY 输出)
- `core:event:allow-emit` - 发送事件
- `core:window:*` - 窗口操作权限

[ref: IMPLEMENTATION_COMPLETE.md#Tauri v2 权限配置, src-tauri/capabilities/default.json]

### 平台特定配置

```json
{
  "bundle": {
    "macOS": {
      "frameworks": [],
      "minimumSystemVersion": "10.15",
      "exceptionDomain": "",
      "entitlements": null,
      "providerShortName": null,
      "signingIdentity": null
    },

    "windows": {
      "certificateThumbprint": null,
      "digestAlgorithm": "sha256",
      "timestampUrl": "",
      "webviewInstallMode": {
        "type": "downloadBootstrapper"
      }
    },

    "linux": {
      "deb": {
        "depends": [
          "libwebkit2gtk-4.0-37",
          "libgtk-3-0"
        ]
      }
    }
  }
}
```

## Rust 配置详解

### Cargo.toml

```toml
[package]
name = "mat"
version = "0.1.7"
description = "Modern terminal emulator with iTerm2-style features"
authors = ["Hierifer"]
edition = "2021"

[lib]
name = "mat_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
# Tauri 核心
tauri = { version = "2", features = ["devtools", "macos-private-api"] }
tauri-plugin-opener = "2"
tauri-plugin-shell = "2"
tauri-plugin-os = "2"

# 序列化
serde = { version = "1", features = ["derive"] }
serde_json = "1"

# 错误处理和日志
anyhow = "1"
log = "0.4"

# PTY 支持
portable-pty = "0.8"
uuid = { version = "1", features = ["v7"] }

# 异步运行时
tokio = { version = "1", features = ["full"] }
```

[ref: src-tauri/Cargo.toml]

### Cargo 构建配置

`.cargo/config.toml`:

```toml
[build]
# 增量编译 (开发模式加速)
incremental = true

[profile.dev]
# 开发优化 (平衡编译速度和性能)
opt-level = 1
debug = true
split-debuginfo = "unpacked"  # macOS: 更快的链接

[profile.release]
# 生产优化
opt-level = 3              # 最高优化级别
lto = true                 # Link-Time Optimization
codegen-units = 1          # 单个 codegen 单元 (更好优化)
strip = true               # 移除符号信息 (减小体积)
panic = "abort"            # panic 时直接终止 (减小体积)

[profile.release-with-debug]
inherits = "release"
debug = true
strip = false
```

**使用方法**:
```bash
# 开发构建 (快速)
cargo build

# 生产构建 (优化)
cargo build --release

# 生产构建 + 调试符号
cargo build --profile release-with-debug
```

### 日志配置

在代码中:
```rust
use log::{info, warn, error, debug, trace};

// 不同级别的日志
trace!("Detailed trace information");
debug!("Debug information");
info!("Normal information");
warn!("Warning message");
error!("Error message");
```

运行时配置:
```bash
# 设置日志级别
RUST_LOG=debug npm run tauri:dev

# 按模块配置
RUST_LOG=mat_lib::pty=debug,mat_lib=info npm run tauri:dev

# 仅显示错误
RUST_LOG=error npm run tauri:dev
```

[ref: IMPLEMENTATION_COMPLETE.md#错误处理增强]

## 前端配置详解

### package.json

```json
{
  "name": "frontend",
  "private": true,
  "version": "0.1.7",
  "type": "module",

  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "build:check": "vue-tsc -b && vite build",
    "typecheck": "vue-tsc -b --noEmit",
    "preview": "vite preview",
    "tauri": "tauri",
    "tauri:dev": "tauri dev",
    "tauri:build": "tauri build",
    "build:mac": "tauri build --target universal-apple-darwin",
    "build:windows": "tauri build --target x86_64-pc-windows-msvc",
    "build:linux": "tauri build --target x86_64-unknown-linux-gnu"
  },

  "dependencies": {
    "@tauri-apps/api": "^2.9.1",
    "@tauri-apps/plugin-opener": "^2.5.2",
    "@tauri-apps/plugin-os": "^2.3.2",
    "@tauri-apps/plugin-shell": "^2.3.0",
    "@xterm/addon-fit": "^0.11.0",
    "@xterm/addon-web-links": "^0.12.0",
    "pinia": "^3.0.4",
    "vue": "^3.5.30",
    "xterm": "^5.3.0"
  },

  "devDependencies": {
    "@tailwindcss/vite": "^4.1.0",
    "@tauri-apps/cli": "^2.9.1",
    "@types/node": "^24.12.0",
    "@vitejs/plugin-vue": "^6.0.5",
    "@vue/tsconfig": "^0.9.0",
    "tailwindcss": "^4.1.0",
    "typescript": "^5.9.3",
    "vite": "^8.0.0",
    "vue-tsc": "^3.2.5"
  }
}
```

[ref: package.json]

### Vite 配置

`vite.config.ts`:

```typescript
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss()
  ],

  // 路径别名
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },

  // 开发服务器
  server: {
    port: 5173,
    strictPort: true,  // Tauri 需要固定端口
    host: '0.0.0.0',
    hmr: true
  },

  // 构建优化
  build: {
    target: 'esnext',
    minify: 'esbuild',
    sourcemap: false,

    rollupOptions: {
      output: {
        manualChunks: {
          'vendor': ['vue', 'pinia'],
          'xterm': ['xterm', '@xterm/addon-fit', '@xterm/addon-web-links']
        }
      }
    }
  },

  // 环境变量前缀
  envPrefix: ['VITE_', 'TAURI_'],

  // 清除 console (生产环境)
  esbuild: {
    drop: process.env.NODE_ENV === 'production' ? ['console', 'debugger'] : []
  }
})
```

**优化建议**:

```typescript
// 开发时保留 console
// 生产时移除 console
esbuild: {
  drop: ['console', 'debugger']
}

// 更激进的代码分割
rollupOptions: {
  output: {
    manualChunks(id) {
      if (id.includes('node_modules')) {
        return 'vendor'
      }
    }
  }
}
```

[ref: PROJECT_DOCUMENTATION.md#Vite 配置重点]

### TypeScript 配置

`tsconfig.json`:

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ],
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

`tsconfig.app.json` (应用代码):

```json
{
  "extends": "@vue/tsconfig/tsconfig.dom.json",
  "include": ["src/**/*", "src/**/*.vue"],
  "exclude": ["src/**/__tests__/*"],
  "compilerOptions": {
    "composite": true,
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.app.tsbuildinfo",
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    },
    "types": ["vite/client"]
  }
}
```

[ref: PROJECT_DOCUMENTATION.md#TypeScript 配置]

### Tailwind CSS 配置

`tailwind.config.ts`:

```typescript
import type { Config } from 'tailwindcss'

export default {
  content: [
    './index.html',
    './src/**/*.{vue,js,ts,jsx,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        'vscode-bg': '#1e1e1e',
        'vscode-fg': '#d4d4d4',
        'vscode-border': '#323232',
        'vscode-blue': '#007acc'
      }
    }
  },
  plugins: []
} satisfies Config
```

## 终端配置

### xterm.js 配置

`src/components/terminal/terminal-instance.vue`:

```typescript
const terminal = new Terminal({
  // 字体
  fontFamily: '"JetBrains Mono", "Courier New", monospace',
  fontSize: 13,
  fontWeight: 400,
  fontWeightBold: 700,
  lineHeight: 1.2,
  letterSpacing: 0,

  // 光标
  cursorBlink: true,
  cursorStyle: 'block',  // 'block' | 'underline' | 'bar'
  cursorWidth: 1,

  // 滚动
  scrollback: 10000,
  scrollSensitivity: 1,

  // 外观
  allowTransparency: true,
  theme: {
    background: '#1e1e1e',
    foreground: '#d4d4d4',
    cursor: '#ffffff',
    cursorAccent: '#000000',
    selectionBackground: '#264f78',

    // ANSI 颜色
    black: '#000000',
    red: '#cd3131',
    green: '#0dbc79',
    yellow: '#e5e510',
    blue: '#2472c8',
    magenta: '#bc3fbc',
    cyan: '#11a8cd',
    white: '#e5e5e5',

    // 高亮色
    brightBlack: '#666666',
    brightRed: '#f14c4c',
    brightGreen: '#23d18b',
    brightYellow: '#f5f543',
    brightBlue: '#3b8eea',
    brightMagenta: '#d670d6',
    brightCyan: '#29b8db',
    brightWhite: '#e5e5e5'
  },

  // 行为
  convertEol: false,
  disableStdin: false,
  bellStyle: 'none',  // 'none' | 'sound'

  // 性能
  windowsMode: false,
  windowOptions: {
    getScreenSizePixels: false
  }
})
```

**主题自定义**:

```typescript
// 浅色主题
const lightTheme = {
  background: '#ffffff',
  foreground: '#333333',
  cursor: '#000000',
  // ...
}

// 使用
terminal.options.theme = lightTheme
```

[ref: PROJECT_DOCUMENTATION.md#Terminal Instance 组件]

### PTY 配置

`src-tauri/src/pty/manager.rs`:

```rust
// 缓冲区大小
const PTY_BUFFER_SIZE: usize = 8192;

// PTY 尺寸
let pty_size = PtySize {
    rows: rows,
    cols: cols,
    pixel_width: 0,
    pixel_height: 0,
};

// 环境变量
cmd.env("TERM", "xterm-256color");
cmd.env("COLORTERM", "truecolor");
```

**性能调优**:

```rust
// 增加缓冲区 (更高吞吐量)
const PTY_BUFFER_SIZE: usize = 16384;

// 减小缓冲区 (更低延迟)
const PTY_BUFFER_SIZE: usize = 4096;
```

[ref: PROJECT_DOCUMENTATION.md#性能考虑, src-tauri/src/pty/manager.rs]

## 用户自定义配置

### 环境变量

用户可通过环境变量自定义行为:

```bash
# 指定 Shell
export SHELL=/bin/fish

# 指定终端类型
export TERM=xterm-256color

# Rust 日志级别
export RUST_LOG=debug

# 开发模式
export NODE_ENV=development
```

[ref: QUICK_START.md#Custom Shell]

### 未来配置文件 (计划)

`~/.config/mat/config.toml`:

```toml
[general]
theme = "vscode-dark"
font-family = "JetBrains Mono"
font-size = 13

[terminal]
shell = "/bin/zsh"
scrollback = 10000
cursor-blink = true

[keybindings]
split-horizontal = "Cmd+D"
split-vertical = "Cmd+Shift+D"
close-pane = "Cmd+W"

[appearance]
window-width = 1200
window-height = 800
window-decorations = true
```

**实现优先级**: 中期目标

[ref: PROJECT_DOCUMENTATION.md#扩展建议]

## 配置最佳实践

### 1. 版本号同步

所有配置文件中的版本号应保持一致:

```bash
# package.json
"version": "0.1.7"

# Cargo.toml
version = "0.1.7"

# tauri.conf.json
"version": "0.1.7"
```

**自动化脚本**:
```bash
#!/bin/bash
VERSION="0.1.7"

# 更新所有版本号
sed -i '' "s/\"version\": \".*\"/\"version\": \"$VERSION\"/" package.json
sed -i '' "s/version = \".*\"/version = \"$VERSION\"/" Cargo.toml
sed -i '' "s/\"version\": \".*\"/\"version\": \"$VERSION\"/" tauri.conf.json
```

### 2. 开发 vs 生产

**开发配置**:
- 启用 devtools
- 保留 console.log
- 启用 sourcemap
- 不压缩代码

**生产配置**:
- 禁用 devtools
- 移除 console.log
- 禁用 sourcemap
- 启用代码压缩和优化

### 3. 安全配置

- 使用严格的 CSP 策略
- 仅授予必需的 Tauri 权限
- 不在代码中硬编码敏感信息
- 验证所有用户输入

[ref: PROJECT_DOCUMENTATION.md#安全考虑]

## References

- [tauri.conf.json](/Users/hierifer/Desktop/terminal-emulator/frontend/src-tauri/tauri.conf.json) — Tauri 主配置
- [Cargo.toml](/Users/hierifer/Desktop/terminal-emulator/frontend/src-tauri/Cargo.toml) — Rust 依赖配置
- [package.json](/Users/hierifer/Desktop/terminal-emulator/frontend/package.json) — 前端依赖配置
- [capabilities/default.json](/Users/hierifer/Desktop/terminal-emulator/frontend/src-tauri/capabilities/default.json) — Tauri v2 权限
- [PROJECT_DOCUMENTATION.md](/Users/hierifer/Desktop/terminal-emulator/PROJECT_DOCUMENTATION.md) — 详细文档

## Related Skills

- [项目概览](./project-overview.md)
- [开发流程和命令](./development-workflow.md)
- [跨平台构建](./cross-platform-build.md)
