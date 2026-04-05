# Cross-Platform Build Guide

This guide covers building the terminal emulator for macOS, Linux, and Windows.

## Prerequisites

### All Platforms

- **Node.js** (v18 or later)
- **Bun** (or npm/yarn/pnpm)
- **Rust** (v1.70 or later)
  ```bash
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
  ```

### macOS

- **Xcode Command Line Tools**
  ```bash
  xcode-select --install
  ```

### Linux (Ubuntu/Debian)

- **Build essentials**
  ```bash
  sudo apt update
  sudo apt install -y \
    libwebkit2gtk-4.1-dev \
    build-essential \
    curl \
    wget \
    file \
    libssl-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev
  ```

### Windows

- **Visual Studio 2022** (with C++ build tools)
- **WebView2** (usually pre-installed on Windows 11)
- **Rust** (via rustup-init.exe from rust-lang.org)

---

## Building for Your Platform

### 1. Install Dependencies

```bash
# In the frontend directory
bun install

# Or with npm
npm install
```

### 2. Development Mode

Run in development with hot-reload:

```bash
bun run tauri:dev
```

### 3. Production Build

Build for your current platform:

```bash
bun run tauri:build
```

Output locations:
- **macOS**: `src-tauri/target/release/bundle/macos/`
- **Linux**: `src-tauri/target/release/bundle/appimage/` or `/deb/`
- **Windows**: `src-tauri/target/release/bundle/msi/` or `/nsis/`

---

## Cross-Platform Builds

### Building for macOS

**On macOS:**

```bash
# Universal binary (Intel + Apple Silicon)
bun run build:mac

# Or target-specific
rustup target add aarch64-apple-darwin
rustup target add x86_64-apple-darwin
bun run tauri build --target aarch64-apple-darwin
bun run tauri build --target x86_64-apple-darwin
```

**Output**: `.dmg` and `.app` in `src-tauri/target/release/bundle/macos/`

### Building for Linux

**On Linux:**

```bash
# Build for x86_64 Linux
bun run build:linux

# Generate .deb package
bun run tauri build -- --bundles deb

# Generate AppImage
bun run tauri build -- --bundles appimage
```

**Output**: `.deb` and `.AppImage` in `src-tauri/target/release/bundle/`

**Cross-compiling from macOS (advanced):**

```bash
# Install cross-compilation tools
brew install messense/macos-cross-toolchains/x86_64-unknown-linux-gnu

# Add target
rustup target add x86_64-unknown-linux-gnu

# Build
CARGO_TARGET_X86_64_UNKNOWN_LINUX_GNU_LINKER=x86_64-unknown-linux-gnu-gcc \
  bun run tauri build --target x86_64-unknown-linux-gnu
```

### Building for Windows

**On Windows:**

```bash
# Build for 64-bit Windows
bun run build:windows

# Or with PowerShell
npm run tauri:build
```

**Output**: `.msi` and `.exe` in `src-tauri\target\release\bundle\`

**Cross-compiling from macOS/Linux (advanced):**

```bash
# Install Windows target
rustup target add x86_64-pc-windows-msvc

# Install Wine for testing (optional)
brew install --cask wine-stable

# Build (requires wine and cross-compilation setup)
bun run tauri build --target x86_64-pc-windows-msvc
```

---

## Platform-Specific Features

### macOS
- ✅ Native window controls (traffic light buttons)
- ✅ Universal binary support (Intel + Apple Silicon)
- ✅ .dmg installer with drag-to-Applications
- ✅ Code signing (requires Apple Developer account)

### Linux
- ✅ GTK-based window decorations
- ✅ .deb packages for Debian/Ubuntu
- ✅ AppImage for universal compatibility
- ✅ Wayland and X11 support

### Windows
- ✅ Native Win32 window controls
- ✅ .msi installer
- ✅ WebView2 integration
- ✅ Windows 10/11 support

---

## Configuration

### Tauri Config

Platform-specific settings in `src-tauri/tauri.conf.json`:

```json
{
  "bundle": {
    "identifier": "com.hierifer.mat",
    "targets": ["app", "dmg"],  // macOS
    // "targets": ["msi", "nsis"],  // Windows
    // "targets": ["deb", "appimage"],  // Linux
    "macOS": {
      "minimumSystemVersion": "10.15"
    },
    "windows": {
      "webviewInstallMode": {
        "type": "embedBootstrapper"
      }
    }
  }
}
```

### Window Decorations

The app uses `decorations: false` with custom window controls that adapt per platform:

- **macOS**: Red/Yellow/Green circular buttons (left)
- **Windows/Linux**: Minimize/Maximize/Close icons (right)

---

## Code Signing & Distribution

### macOS

1. **Obtain Apple Developer Certificate**
2. **Configure in tauri.conf.json**:
   ```json
   "bundle": {
     "macOS": {
       "signingIdentity": "Developer ID Application: Your Name (TEAM_ID)"
     }
   }
   ```
3. **Notarization** (required for Gatekeeper):
   ```bash
   xcrun notarytool submit path/to/app.dmg \
     --apple-id your@email.com \
     --password app-specific-password \
     --team-id TEAM_ID
   ```

### Windows

1. **Code Signing Certificate** (optional but recommended)
2. **Sign the .exe**:
   ```bash
   signtool sign /f certificate.pfx /p password /t http://timestamp.digicert.com mat.exe
   ```

### Linux

No code signing required. Use GPG signatures for package integrity:

```bash
gpg --detach-sign mat_0.1.0_amd64.deb
```

---

## Troubleshooting

### macOS: "App is damaged and can't be opened"

This occurs with unsigned apps. Users can bypass with:

```bash
xattr -cr /Applications/mat.app
```

Or distribute a signed/notarized build.

### Linux: Missing dependencies

```bash
# Debian/Ubuntu
sudo apt install libwebkit2gtk-4.1-0

# Fedora
sudo dnf install webkit2gtk4.1
```

### Windows: WebView2 not found

Install the **WebView2 Runtime**:
- Download from [Microsoft Edge WebView2](https://developer.microsoft.com/microsoft-edge/webview2/)

### Build fails with "linker not found"

Ensure platform toolchain is installed:

```bash
# Check installed targets
rustup target list --installed

# Add missing target
rustup target add <target-triple>
```

---

## CI/CD Automation

### GitHub Actions Example

Create `.github/workflows/build.yml`:

```yaml
name: Build

on:
  push:
    tags:
      - 'v*'

jobs:
  build-macos:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - uses: dtolnay/rust-toolchain@stable
      - run: cd frontend && bun install && bun run build:mac
      - uses: actions/upload-artifact@v4
        with:
          name: macos-build
          path: frontend/src-tauri/target/release/bundle/macos/

  build-linux:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: |
          sudo apt update
          sudo apt install -y libwebkit2gtk-4.1-dev build-essential
      - uses: actions/setup-node@v4
      - uses: dtolnay/rust-toolchain@stable
      - run: cd frontend && bun install && bun run build:linux
      - uses: actions/upload-artifact@v4
        with:
          name: linux-build
          path: frontend/src-tauri/target/release/bundle/

  build-windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - uses: dtolnay/rust-toolchain@stable
      - run: cd frontend && npm install && npm run build:windows
      - uses: actions/upload-artifact@v4
        with:
          name: windows-build
          path: frontend/src-tauri/target/release/bundle/
```

---

## Release Checklist

- [ ] Update version in `package.json` and `src-tauri/Cargo.toml`
- [ ] Test on all target platforms
- [ ] Build production bundles
- [ ] Sign and notarize macOS builds
- [ ] Test installers on clean VMs
- [ ] Create GitHub release with binaries
- [ ] Update changelog

---

## Performance Optimization

### Bundle Size

Current bundle sizes (approximate):
- **macOS**: ~15-20 MB (universal)
- **Linux**: ~10-15 MB (AppImage)
- **Windows**: ~12-18 MB (.msi)

### Build Time Optimization

Use `sccache` to speed up Rust compilation:

```bash
# Install sccache
cargo install sccache

# Configure in ~/.cargo/config.toml
[build]
rustc-wrapper = "sccache"
```

---

## Resources

- [Tauri Documentation](https://tauri.app/v1/guides/)
- [Rust Cross-Compilation](https://rust-lang.github.io/rustup/cross-compilation.html)
- [portable-pty](https://docs.rs/portable-pty/latest/portable_pty/)
- [XTerm.js Documentation](https://xtermjs.org/)

---

## Support

For build issues, check:
1. Rust version: `rustc --version` (should be 1.70+)
2. Tauri CLI: `bunx tauri --version`
3. Platform dependencies (see Prerequisites)

Open an issue if problems persist with full error logs and system info.
