# MAT Terminal Emulator - Skills Documentation

本目录包含 MAT (Modern Terminal Emulator) 项目的结构化技能文档，旨在帮助开发者快速了解项目、开展开发和进行跨平台构建。

## 文档索引

### 1. [项目概览](./project-overview.md)
**适合**: 新加入的开发者、项目评审

**内容**:
- 项目基本信息和技术栈
- 核心功能和特性
- 整体架构图和数据流
- 目录结构和模块划分
- 性能指标和安全性

**快速查询**:
- 技术栈版本对照表
- 核心模块速查
- 关键数据结构定义

---

### 2. [开发流程和命令](./development-workflow.md)
**适合**: 日常开发、调试问题

**内容**:
- 环境搭建步骤
- 开发模式 (浏览器 vs Tauri)
- 常用命令速查表
- 调试技巧和工具
- 测试流程和清单
- 代码组织规范

**快速查询**:
- npm 脚本命令
- 调试方法和日志配置
- 常见问题解决方案

**Python 工具**:
- 开发环境检查脚本

---

### 3. [跨平台构建](./cross-platform-build.md)
**适合**: 发布版本、CI/CD 配置

**内容**:
- macOS/Linux/Windows 构建流程
- 平台特定依赖和配置
- 交叉编译方案
- CI/CD 配置示例 (GitHub Actions)
- 构建优化和体积优化
- 平台特定问题排查

**快速查询**:
- 构建命令对照表
- 系统要求清单
- 构建产物位置

---

### 4. [配置和设置](./configuration.md)
**适合**: 自定义配置、性能调优

**内容**:
- Tauri 配置详解 (tauri.conf.json)
- Rust 配置 (Cargo.toml, .cargo/config.toml)
- 前端配置 (package.json, vite.config.ts, tsconfig.json)
- 终端配置 (xterm.js, PTY)
- 权限配置 (Tauri v2 capabilities)
- 平台特定配置

**快速查询**:
- 关键配置文件清单
- 常用配置选项速查
- 环境变量配置

---

### 5. [架构深入理解](./architecture-deep-dive.md)
**适合**: 深度开发、架构优化

**内容**:
- 架构分层和设计模式
- 前端状态管理和树操作算法
- 后端 PTY 管理器实现
- 通信协议和数据流
- 性能优化策略
- 技术难点和解决方案
- 未来架构改进方向

**快速查询**:
- 核心架构模式对照表
- 关键数据结构定义
- 技术难点速查

---

## 使用指南

### 快速开始

1. **我是新开发者**: 从 [项目概览](./project-overview.md) 开始
2. **我要开发功能**: 查看 [开发流程和命令](./development-workflow.md)
3. **我要构建发布**: 查看 [跨平台构建](./cross-platform-build.md)
4. **我要调整配置**: 查看 [配置和设置](./configuration.md)
5. **我要深入理解**: 查看 [架构深入理解](./architecture-deep-dive.md)

### 文档特点

每个 skill 文档都包含:

- **Summary**: 2-3 句话概述
- **Quick Reference**: 速查表格和要点
- **详细章节**: 深入说明和示例代码
- **References**: 源文档引用
- **Related Skills**: 相关文档链接

### 引用规范

文档中的引用格式:
```
[ref: filename.md#section]
```

示例:
```
[ref: README.md#技术栈]
[ref: PROJECT_DOCUMENTATION.md#核心架构]
```

### 源文档

所有 skill 文档都基于以下源文档提炼:

| 源文档 | 说明 |
|--------|------|
| [README.md](/Users/hierifer/Desktop/terminal-emulator/README.md) | 项目简介 |
| [PROJECT_DOCUMENTATION.md](/Users/hierifer/Desktop/terminal-emulator/PROJECT_DOCUMENTATION.md) | 详细技术文档 |
| [IMPLEMENTATION_COMPLETE.md](/Users/hierifer/Desktop/terminal-emulator/IMPLEMENTATION_COMPLETE.md) | 实现总结 |
| [QUICK_START.md](/Users/hierifer/Desktop/terminal-emulator/QUICK_START.md) | 用户快速开始 |
| [TROUBLESHOOTING.md](/Users/hierifer/Desktop/terminal-emulator/TROUBLESHOOTING.md) | 故障排查 |
| [VERIFICATION_CHECKLIST.md](/Users/hierifer/Desktop/terminal-emulator/VERIFICATION_CHECKLIST.md) | 测试清单 |

## 项目信息

- **项目名称**: MAT (Modern Terminal Emulator)
- **版本**: 0.1.7
- **技术栈**: Tauri 2 + Vue 3 + Rust + TypeScript
- **平台**: macOS, Linux, Windows
- **作者**: Hierifer

## 快速链接

### 代码仓库结构
```
terminal-emulator/
├── frontend/
│   ├── src/              # Vue 前端
│   └── src-tauri/        # Rust 后端
├── .claude/
│   └── skills/           # 本文档目录
└── *.md                  # 项目文档
```

### 关键文件
- [package.json](../../frontend/package.json) - 前端依赖和脚本
- [Cargo.toml](../../frontend/src-tauri/Cargo.toml) - Rust 依赖
- [tauri.conf.json](../../frontend/src-tauri/tauri.conf.json) - Tauri 配置
- [terminal-store.ts](../../frontend/src/stores/terminal-store.ts) - 状态管理
- [manager.rs](../../frontend/src-tauri/src/pty/manager.rs) - PTY 管理器

### 外部资源
- [Tauri 官方文档](https://tauri.app/v2/)
- [Vue 3 文档](https://vuejs.org/)
- [xterm.js 文档](https://xtermjs.org/)
- [portable-pty](https://docs.rs/portable-pty/)

## 维护说明

### 更新文档

当项目发生重大变更时，请更新相应的 skill 文档:

1. 更新相关章节内容
2. 确保引用正确 (`[ref: ...]`)
3. 更新 Quick Reference 表格
4. 检查相关文档的交叉引用

### 添加新 Skill

创建新 skill 文档时，请遵循以下模板:

```markdown
# Skill: [技能名称]

## Summary
[2-3 句话概述]

## Quick Reference
[速查表格/要点]

## 详细章节

### [主题 1]
[内容]
[ref: source.md#section]

### [主题 2]
[内容]

## Python Tools (可选)

### [工具名称]
```python
# 工具代码
```

## References
- [source1.md](path) — 说明
- [source2.md](path) — 说明

## Related Skills
- [相关技能 1](./skill1.md)
- [相关技能 2](./skill2.md)
```

### 文档质量标准

- **准确性**: 所有信息可追溯到源文档
- **完整性**: 覆盖主要使用场景
- **简洁性**: 快速参考优先使用表格和列表
- **可操作性**: 提供可直接使用的命令和代码
- **一致性**: 所有文档遵循相同格式

## 贡献

欢迎改进 skill 文档:

1. 发现错误或过时信息时，请更新
2. 添加实用的速查表和示例
3. 补充 Python 工具脚本
4. 改进文档结构和可读性

---

**文档生成**: 2026-03-22
**维护者**: Claude Code (Skill Writer Agent)
**基于**: MAT v0.1.7 项目文档
