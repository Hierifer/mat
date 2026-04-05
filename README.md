# MAT - Modern Terminal Emulator

A modern, cross-platform terminal emulator built with Tauri, Vue 3, and Rust. Features iTerm2-inspired split panes, multi-tab support, and native performance.

![Platform Support](https://img.shields.io/badge/platform-macOS%20%7C%20Linux%20%7C%20Windows-blue)
![License](https://img.shields.io/badge/license-MIT-green)

## ✨ Features

### Core Functionality
- ✅ **True PTY Support** - Full pseudo-terminal implementation with proper resize handling
- ✅ **Multi-Tab Interface** - Create unlimited terminal tabs with independent sessions
- ✅ **Split Panes** - Horizontal and vertical splits for multi-terminal workflows
- ✅ **Cross-Platform** - Native builds for macOS, Linux, and Windows
- ✅ **Platform-Adaptive UI** - Window controls match platform conventions

### Terminal Features
- 🎨 XTerm.js rendering with 256-color support
- 📁 Working directory display and navigation
- ⌨️ Comprehensive keyboard shortcuts
- 🔄 Session persistence across tab switches
- 📊 Terminal history preservation

### Platform-Specific Features

#### macOS
- Native traffic light window controls (Red/Yellow/Green)
- Universal binary support (Intel + Apple Silicon)
- Drag-to-move window from tab bar

#### Linux
- GTK-based window decorations
- Supports both Wayland and X11
- Distribution-agnostic AppImage builds

#### Windows
- Native Win32 window controls
- WebView2 integration
- Standard Windows installer (.msi)

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18+ or **Bun**
- **Rust** 1.70+ ([Install](https://rustup.rs/))
- Platform-specific dependencies (see [BUILD.md](BUILD.md))

### Development

```bash
# Install dependencies
bun install

# Run in development mode
bun run tauri:dev
```

### Building

```bash
# Build for current platform
bun run tauri:build

# Platform-specific builds
bun run build:mac      # macOS universal binary
bun run build:linux    # Linux (x86_64)
bun run build:windows  # Windows (x86_64)
```

For detailed build instructions and cross-compilation, see [BUILD.md](BUILD.md).

## ⌨️ Keyboard Shortcuts

### Tabs
- `Cmd/Ctrl + T` - New tab
- `Cmd/Ctrl + W` - Close current tab
- `Cmd/Ctrl + Shift + W` - Close all tabs
- `Cmd/Ctrl + 1-9` - Switch to tab 1-9

### Panes
- `Cmd/Ctrl + D` - Split horizontal
- `Cmd/Ctrl + Shift + D` - Split vertical
- `Cmd/Ctrl + W` - Close current pane (when multiple panes exist)

### Window
- `Cmd/Ctrl + M` - Minimize window
- `Cmd/Ctrl + Q` - Quit application

## 🏗️ Architecture

### Technology Stack

**Frontend:**
- Vue 3 + TypeScript
- Pinia (state management)
- XTerm.js (terminal rendering)
- Vite (build tool)
- Tailwind CSS

**Backend:**
- Rust + Tokio (async runtime)
- Tauri 2.x (application framework)
- portable-pty (cross-platform PTY)

### Project Structure

```
frontend/
├── src/
│   ├── components/
│   │   ├── layout/          # Tab bar, split container
│   │   └── terminal/        # Terminal instance, pane toolbar
│   ├── composables/         # Vue composables
│   │   ├── use-pty-session.ts
│   │   ├── use-keyboard-shortcuts.ts
│   │   └── use-platform.ts
│   ├── stores/
│   │   └── terminal-store.ts
│   └── App.vue
├── src-tauri/
│   ├── src/
│   │   ├── pty/
│   │   │   ├── manager.rs   # PTY session management
│   │   │   ├── commands.rs  # Tauri commands
│   │   │   └── shell.rs     # Cross-platform shell detection
│   │   └── lib.rs
│   └── Cargo.toml
└── BUILD.md
```

## 🔧 Configuration

### Shell Detection

The terminal automatically detects and uses the appropriate shell:

- **macOS**: `/bin/zsh` (default), falls back to `/bin/bash`
- **Linux**: `/bin/bash` (default), falls back to `/bin/sh`
- **Windows**: `powershell.exe`

Override with `$SHELL` environment variable:

```bash
SHELL=/bin/fish bun run tauri:dev
```

### Working Directory Tracking

To enable automatic directory display, add to your shell config:

**Zsh** (`~/.zshrc`):
```zsh
precmd() { print -Pn "\e]7;file://${HOST}${PWD}\e\\" }
```

**Bash** (`~/.bashrc`):
```bash
PROMPT_COMMAND='echo -ne "\e]7;file://${HOSTNAME}${PWD}\e\\"'
```

## 📦 Distribution

### macOS
- **Format**: `.dmg` with drag-to-Applications
- **Architectures**: Universal (x86_64 + arm64)
- **Minimum Version**: macOS 10.15+

### Linux
- **Formats**: `.deb`, `.AppImage`
- **Architectures**: x86_64, aarch64
- **Dependencies**: Listed in BUILD.md

### Windows
- **Format**: `.msi` installer
- **Architectures**: x86_64
- **Requirements**: Windows 10+ with WebView2

## 🛠️ Development

### Running Tests

```bash
# Rust tests
cd src-tauri && cargo test

# Frontend tests
bun test
```

### Code Quality

```bash
# Rust linting
cargo clippy

# Frontend linting
bun run lint
```

### Debug Mode

Enable verbose logging:

```bash
RUST_LOG=debug bun run tauri:dev
```

## 🐛 Troubleshooting

### Session Lost on Tab Switch

**Fixed**: Sessions now persist across tab switches. Terminals use `v-show` instead of `v-if` to preserve XTerm.js state.

### Window Controls Not Showing

Check platform detection:
```typescript
import { usePlatform } from '@/composables/use-platform'
const { platform, isMacOS } = usePlatform()
console.log('Current platform:', platform.value)
```

### PTY Resize Not Working

Ensure `portable-pty` version is 0.8+:
```bash
cd src-tauri && cargo update -p portable-pty
```

For more issues, see [BUILD.md](BUILD.md#troubleshooting).

## 🤝 Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Test on your target platform
4. Submit a pull request

### Development Workflow

1. Make changes
2. Test with `bun run tauri:dev`
3. Build with `bun run tauri:build`
4. Test the bundled app

## 📄 License

MIT License - see LICENSE file for details

## 🙏 Acknowledgments

- [Tauri](https://tauri.app/) - Application framework
- [XTerm.js](https://xtermjs.org/) - Terminal emulator
- [portable-pty](https://docs.rs/portable-pty/) - PTY implementation
- [Vue.js](https://vuejs.org/) - Frontend framework

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/hierifer/terminal-emulator/issues)
- **Documentation**: [BUILD.md](BUILD.md)
- **Discussions**: [GitHub Discussions](https://github.com/hierifer/terminal-emulator/discussions)

---

Made with ❤️ by Hierifer
