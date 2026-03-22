# Terminal Emulator

一个基于 Tauri + Vue 3 构建的现代化终端模拟器，支持 PTY 会话管理和分屏功能。

![License](https://img.shields.io/badge/license-待定-blue.svg)
![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Linux%20%7C%20Windows-lightgrey.svg)

## 特性

- 🚀 基于 Tauri 2 的原生性能
- 💻 使用 xterm.js 实现的完整终端模拟
- 🎨 VS Code 风格的现代化主题
- 📦 轻量级桌面应用
- 🔧 TypeScript + Rust 全栈类型安全
- 🎯 PTY 会话管理
- 📐 分屏布局支持（开发中）

## 技术栈

### 前端
- Vue 3 + TypeScript
- xterm.js (终端渲染)
- Pinia (状态管理)
- Tailwind CSS
- Vite

### 后端
- Tauri 2
- Rust
- portable-pty (PTY 支持)
- tokio (异步运行时)

## 快速开始

### 前置要求

- [Bun](https://bun.sh/) 或 Node.js
- [Rust](https://www.rust-lang.org/) (最新稳定版)
- [Tauri 环境要求](https://tauri.app/v2/guides/getting-started/prerequisites/)

### 安装

```bash
cd frontend
bun install
```

### 开发

```bash
bun run dev
```

这将启动 Vite 开发服务器和 Tauri 应用。

### 构建

```bash
bun run build
```

生成的应用位于 `frontend/src-tauri/target/release/`

## 项目结构

```
terminal-emulator/
└── frontend/
    ├── src/                 # Vue 前端
    │   ├── components/      # Vue 组件
    │   ├── composables/     # 可复用逻辑
    │   ├── stores/          # Pinia stores
    │   └── App.vue
    └── src-tauri/           # Rust 后端
        └── src/
            └── pty/         # PTY 管理模块
```

## 文档

详细的项目文档请查看 [PROJECT_DOCUMENTATION.md](./PROJECT_DOCUMENTATION.md)

包含内容：
- 完整的架构说明
- 核心模块详解
- 数据流图
- 开发指南
- API 参考
- 常见问题

## 开发路线图

- [x] 基础终端功能
- [x] PTY 会话管理
- [x] 终端主题
- [x] 自动调整大小
- [ ] PTY resize 完整实现
- [ ] 分屏功能
- [ ] 多标签页 UI
- [ ] 快捷键支持
- [ ] 跨平台 Shell 支持
- [ ] 配置文件
- [ ] 插件系统

## 贡献

欢迎提交 Issue 和 Pull Request！

## 许可证

待定

---

使用 ❤️ 和 Rust 构建
