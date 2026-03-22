# Skill: MAT 跨平台构建

## Summary
本文档详细说明如何为 MAT 终端模拟器构建跨平台发布版本，包括 macOS、Linux 和 Windows 平台的构建配置、命令和注意事项。

## Quick Reference

### 平台构建命令

| 平台 | 命令 | 输出格式 | 输出位置 |
|------|------|---------|---------|
| **macOS** | `npm run build:mac` | .dmg, .app | `src-tauri/target/release/bundle/dmg/` |
| **Windows** | `npm run build:windows` | .msi | `src-tauri/target/release/bundle/msi/` |
| **Linux** | `npm run build:linux` | .deb, .appimage | `src-tauri/target/release/bundle/deb/` 或 `appimage/` |
| **当前平台** | `npm run tauri:build` | 自动检测 | `src-tauri/target/release/bundle/` |

[ref: package.json#scripts]

### 系统要求

| 平台 | 最低版本 | 依赖要求 |
|------|---------|---------|
| **macOS** | 10.15 Catalina | Xcode Command Line Tools |
| **Linux** | glibc 2.27+ | GTK 3.0+, webkit2gtk, libxcb-* |
| **Windows** | Windows 10 1809+ | ConPTY 支持, WebView2 |

[ref: IMPLEMENTATION_COMPLETE.md#系统要求]

### Shell 平台差异

| 平台 | 默认 Shell | 备选 Shell | 环境变量覆盖 |
|------|-----------|-----------|-------------|
| **macOS** | `/bin/zsh` | `/bin/bash` | `$SHELL` |
| **Linux** | `/bin/bash` | `/bin/sh` | `$SHELL` |
| **Windows** | `pwsh.exe` | `powershell.exe` | `%COMSPEC%` |

[ref: IMPLEMENTATION_COMPLETE.md#跨平台 Shell 支持, src-tauri/src/pty/shell.rs]

## 详细构建流程

### 1. macOS 构建

#### 环境准备

```bash
# 安装 Xcode Command Line Tools
xcode-select --install

# 验证安装
xcode-select -p
# 应输出: /Library/Developer/CommandLineTools

# 安装 Rust (如未安装)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

#### 构建命令

```bash
cd frontend

# 通用二进制 (Intel + Apple Silicon)
npm run build:mac

# 或等价命令
npm run tauri build -- --target universal-apple-darwin
```

**构建产物**:
- `mat_0.1.7_universal.dmg` - DMG 安装包
- `MAT.app` - 应用包

**安装测试**:
```bash
# 挂载 DMG
open src-tauri/target/release/bundle/dmg/*.dmg

# 拖拽到 Applications 文件夹
# 或直接运行
open src-tauri/target/release/bundle/macos/MAT.app
```

#### 代码签名 (可选)

```bash
# 查看可用证书
security find-identity -v -p codesigning

# 签名应用
codesign --force --sign "Developer ID Application: Your Name" \
  src-tauri/target/release/bundle/macos/MAT.app

# 验证签名
codesign --verify --verbose=4 \
  src-tauri/target/release/bundle/macos/MAT.app
```

[ref: IMPLEMENTATION_COMPLETE.md#部署建议]

### 2. Linux 构建

#### 环境准备 (Ubuntu/Debian)

```bash
# 安装系统依赖
sudo apt-get update
sudo apt-get install -y \
  libwebkit2gtk-4.0-dev \
  build-essential \
  curl \
  wget \
  file \
  libssl-dev \
  libgtk-3-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  libxcb-render0-dev \
  libxcb-shape0-dev \
  libxcb-xfixes0-dev

# 安装 Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.cargo/env
```

#### 环境准备 (Fedora/RHEL)

```bash
sudo dnf install -y \
  webkit2gtk4.0-devel \
  openssl-devel \
  curl \
  wget \
  file \
  gtk3-devel \
  librsvg2-devel \
  libxcb-devel
```

#### 构建命令

```bash
cd frontend

# x86_64 构建
npm run build:linux

# 或等价命令
npm run tauri build -- --target x86_64-unknown-linux-gnu
```

**构建产物**:
- `mat_0.1.7_amd64.deb` - Debian 包
- `mat_0.1.7_amd64.AppImage` - AppImage (便携版)

**安装测试**:
```bash
# 安装 .deb
sudo dpkg -i src-tauri/target/release/bundle/deb/*.deb

# 运行
mat

# 或运行 AppImage (无需安装)
chmod +x src-tauri/target/release/bundle/appimage/*.AppImage
./src-tauri/target/release/bundle/appimage/*.AppImage
```

#### 打包额外格式

```bash
# 添加到 tauri.conf.json
{
  "bundle": {
    "targets": ["deb", "appimage", "rpm"]
  }
}

# 重新构建
npm run tauri:build
```

[ref: TROUBLESHOOTING.md#Linux]

### 3. Windows 构建

#### 环境准备

```powershell
# 安装 Visual Studio Build Tools
# 从 https://visualstudio.microsoft.com/downloads/ 下载
# 选择 "Desktop development with C++"

# 安装 Rust
# 从 https://rustup.rs/ 下载 rustup-init.exe
rustup-init.exe

# 安装 WebView2 (Windows 10)
# 从 https://developer.microsoft.com/microsoft-edge/webview2/
```

#### 构建命令

```powershell
cd frontend

# x64 构建
npm run build:windows

# 或等价命令
npm run tauri build -- --target x86_64-pc-windows-msvc
```

**构建产物**:
- `mat_0.1.7_x64_en-US.msi` - MSI 安装包
- `mat.exe` - 可执行文件

**安装测试**:
```powershell
# 运行 MSI 安装器
Start-Process src-tauri\target\release\bundle\msi\*.msi

# 或直接运行 exe
.\src-tauri\target\release\mat.exe
```

#### PowerShell 兼容性

Windows 版本使用 PowerShell 作为默认 shell:

```rust
// src-tauri/src/pty/shell.rs
#[cfg(target_os = "windows")]
pub fn get_shell() -> String {
    // 尝试 pwsh.exe (PowerShell Core)
    // 回退到 powershell.exe (Windows PowerShell)
    std::env::var("COMSPEC")
        .unwrap_or_else(|_| "powershell.exe".to_string())
}
```

[ref: src-tauri/src/pty/shell.rs, QUICK_START.md#Cross-Platform]

### 4. 交叉编译

#### macOS → Windows (不推荐)

```bash
# 安装 Windows 目标
rustup target add x86_64-pc-windows-msvc

# 需要 Windows SDK (复杂，不推荐)
# 建议使用 GitHub Actions 或 Windows 虚拟机
```

#### Linux → Windows

```bash
# 安装 MinGW
sudo apt-get install mingw-w64

# 添加 Rust 目标
rustup target add x86_64-pc-windows-gnu

# 构建 (可能遇到兼容性问题)
cargo build --target x86_64-pc-windows-gnu
```

**推荐方案**: 使用 CI/CD (见下文)

### 5. CI/CD 构建 (GitHub Actions)

创建 `.github/workflows/build.yml`:

```yaml
name: Build Multi-Platform

on:
  push:
    tags:
      - 'v*'

jobs:
  build-macos:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Setup Rust
        uses: dtolnay/rust-toolchain@stable
      - name: Install dependencies
        run: cd frontend && npm install
      - name: Build
        run: cd frontend && npm run build:mac
      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: macos-dmg
          path: frontend/src-tauri/target/release/bundle/dmg/*.dmg

  build-windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Setup Rust
        uses: dtolnay/rust-toolchain@stable
      - name: Install dependencies
        run: cd frontend && npm install
      - name: Build
        run: cd frontend && npm run build:windows
      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: windows-msi
          path: frontend/src-tauri/target/release/bundle/msi/*.msi

  build-linux:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Install dependencies (system)
        run: |
          sudo apt-get update
          sudo apt-get install -y libwebkit2gtk-4.0-dev \
            build-essential curl wget file libssl-dev \
            libgtk-3-dev librsvg2-dev
      - name: Setup Rust
        uses: dtolnay/rust-toolchain@stable
      - name: Install dependencies
        run: cd frontend && npm install
      - name: Build
        run: cd frontend && npm run build:linux
      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: linux-packages
          path: |
            frontend/src-tauri/target/release/bundle/deb/*.deb
            frontend/src-tauri/target/release/bundle/appimage/*.AppImage
```

**触发构建**:
```bash
git tag v0.1.7
git push origin v0.1.7
```

## 构建配置

### Tauri 配置 (tauri.conf.json)

```json
{
  "productName": "MAT",
  "identifier": "com.terminal.emulator",
  "version": "0.1.7",
  "build": {
    "beforeBuildCommand": "npm run build",
    "beforeDevCommand": "npm run dev",
    "devUrl": "http://localhost:5173",
    "frontendDist": "../dist"
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
    "resources": [],
    "externalBin": [],
    "copyright": "",
    "category": "DeveloperTool",
    "shortDescription": "Modern terminal emulator",
    "longDescription": "A modern terminal emulator with split panes and tabs",
    "macOS": {
      "frameworks": [],
      "minimumSystemVersion": "10.15",
      "exceptionDomain": ""
    },
    "windows": {
      "certificateThumbprint": null,
      "digestAlgorithm": "sha256",
      "timestampUrl": ""
    },
    "linux": {
      "deb": {
        "depends": []
      }
    }
  }
}
```

[ref: src-tauri/tauri.conf.json]

### Cargo 配置优化

创建 `.cargo/config.toml`:

```toml
[build]
# 增量编译 (开发模式)
incremental = true

[profile.dev]
# 开发优化
opt-level = 1

[profile.release]
# 生产优化
opt-level = 3
lto = true           # Link-Time Optimization
codegen-units = 1    # 更好的优化
strip = true         # 移除符号 (减小体积)
```

**构建时间对比**:
- 无优化: ~3-5 分钟
- 带优化: ~5-10 分钟 (但体积减小 40%)

## 平台特定问题

### macOS

#### 问题: Gatekeeper 阻止运行

```bash
# 用户报告: "无法打开应用，因为它来自未识别的开发者"

# 解决方案 1: 允许任意来源 (不推荐)
sudo spctl --master-disable

# 解决方案 2: 添加例外
xattr -cr /Applications/MAT.app

# 解决方案 3: 正确签名和公证 (推荐)
```

#### 问题: ARM vs Intel

```bash
# 检查架构
file src-tauri/target/release/mat

# Universal Binary (推荐)
# 应输出: Mach-O universal binary with 2 architectures
```

[ref: TROUBLESHOOTING.md#macOS]

### Linux

#### 问题: Missing shared libraries

```bash
# 检查依赖
ldd src-tauri/target/release/mat

# 常见缺失:
# - libwebkit2gtk-4.0.so.37
# - libgtk-3.so.0

# 解决: 安装对应开发包
sudo apt-get install libwebkit2gtk-4.0-37
```

#### 问题: AppImage 无法运行

```bash
# 赋予执行权限
chmod +x mat.AppImage

# 如果还是失败，提取并运行
./mat.AppImage --appimage-extract
./squashfs-root/AppRun
```

[ref: TROUBLESHOOTING.md#Linux]

### Windows

#### 问题: ConPTY 不可用

```powershell
# 检查 Windows 版本
[System.Environment]::OSVersion.Version

# 需要 Build 17763+ (Windows 10 1809)
# 如果版本太低，升级 Windows
```

#### 问题: PowerShell 执行策略

```powershell
# 检查策略
Get-ExecutionPolicy

# 如果是 Restricted，改为 RemoteSigned
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

[ref: TROUBLESHOOTING.md#Windows]

## 发布清单

### 构建前检查

- [ ] 更新版本号 (`package.json` + `Cargo.toml` + `tauri.conf.json`)
- [ ] 更新 CHANGELOG.md
- [ ] 运行所有测试 (`npm run test`)
- [ ] 更新文档和截图
- [ ] 验证 icons 存在 (所有尺寸)

### 构建步骤

- [ ] 清理构建 (`cargo clean && rm -rf node_modules`)
- [ ] 重新安装依赖 (`npm install`)
- [ ] 在所有平台运行构建
- [ ] 测试每个平台的安装包
- [ ] 检查应用大小是否合理

### 发布后

- [ ] 创建 GitHub Release
- [ ] 上传所有平台的安装包
- [ ] 发布 Release Notes
- [ ] 更新文档网站
- [ ] 通知用户

## 体积优化

### 减小应用大小

**Rust 优化**:
```toml
[profile.release]
strip = true          # 移除符号: -40%
lto = true            # LTO: -15%
codegen-units = 1     # 单个 codegen: -5%
```

**前端优化**:
```typescript
// vite.config.ts
export default {
  build: {
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,  // 移除 console.log
        drop_debugger: true
      }
    }
  }
}
```

**预期体积**:
- macOS: ~30-40 MB (Universal)
- Windows: ~20-30 MB
- Linux: ~25-35 MB

## References

- [package.json](/Users/hierifer/Desktop/terminal-emulator/frontend/package.json) — 构建脚本
- [tauri.conf.json](/Users/hierifer/Desktop/terminal-emulator/frontend/src-tauri/tauri.conf.json) — Tauri 配置
- [Cargo.toml](/Users/hierifer/Desktop/terminal-emulator/frontend/src-tauri/Cargo.toml) — Rust 配置
- [IMPLEMENTATION_COMPLETE.md](/Users/hierifer/Desktop/terminal-emulator/IMPLEMENTATION_COMPLETE.md) — 系统要求
- [TROUBLESHOOTING.md](/Users/hierifer/Desktop/terminal-emulator/TROUBLESHOOTING.md) — 平台问题

## Related Skills

- [项目概览](./project-overview.md)
- [开发流程和命令](./development-workflow.md)
- [配置和设置](./configuration.md)
