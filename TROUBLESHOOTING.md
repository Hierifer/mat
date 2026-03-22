# Terminal Emulator - Troubleshooting Guide

## Issue: "No terminal sessions" on macOS

### Step 1: Check Browser Console

1. Open the app in development mode:
   ```bash
   cd frontend
   npm run dev
   ```

2. Open browser DevTools (Right-click → Inspect, or Cmd+Option+I)

3. Check the Console tab for errors. Look for:
   - "App mounted, creating initial tab..."
   - "Tab created successfully"
   - Any red error messages

### Step 2: Verify Tauri is Running

If you see this message:
```
Tauri environment not detected. Using mock session ID.
```

This means you're running in browser-only mode. To run with actual Tauri:

```bash
cd frontend
npm run tauri dev
```

### Step 3: Check Rust Compilation

Verify the Rust backend compiles without errors:

```bash
cd frontend
cargo check
```

**Expected output**: `Finished dev [unoptimized + debuginfo] target(s)...`

**If you see errors**, they might be about:
- `Send` trait not implemented
- Async/await issues
- Missing dependencies

### Step 4: Test in Browser Mode First

The app should work in browser mode with mock terminals:

```bash
cd frontend
npm run dev
```

Open http://localhost:5173 and you should see:
- A mock terminal with green prompt
- Message: "Terminal Mock Session (Running in browser mode)"
- You can type and see echoed text

### Step 5: Run Tauri Dev Mode

Once browser mode works, try Tauri:

```bash
cd frontend
npm run tauri dev
```

This should:
1. Compile Rust backend
2. Start Vite dev server
3. Launch native window with real terminal

### Common Issues & Solutions

#### Issue: `cargo check` fails with "command not found"

**Solution**: Install Rust toolchain:
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.cargo/env
```

#### Issue: Compilation error about `Send` trait

**Error**: `Box<dyn PtySystem>: Send` is not satisfied

**Solution**: Already fixed in manager.rs line 19:
```rust
pty_system: Box<dyn PtySystem + Send>,
```

#### Issue: Terminal opens but shows blank screen

**Possible causes**:
1. PTY spawn failed → Check Tauri console for errors
2. Session ID not set → Check browser console
3. XTerm.js not loaded → Check network tab for 404s

**Debug**:
```javascript
// In browser console
console.log(window.__TAURI_INTERNALS__)  // Should be defined in Tauri mode
```

#### Issue: Split pane button doesn't work

**Solution**: Already fixed - splitPane now has mock session fallback

#### Issue: Window resize doesn't update terminal

**Expected**: Terminal dimensions update in real-time
**Test**: Run `watch "tput cols && tput lines"` and resize window

**If not working**: Check if `pty_resize` command is registered in main.rs

### Step 6: Check Tauri Configuration

Verify `src-tauri/tauri.conf.json` allows terminal access:

```json
{
  "tauri": {
    "allowlist": {
      "all": true
    }
  }
}
```

### Step 7: Check Main.rs Registration

Verify commands are registered in `src-tauri/src/main.rs`:

```rust
tauri::Builder::default()
    .manage(pty_manager)
    .invoke_handler(tauri::generate_handler![
        pty::commands::pty_spawn,
        pty::commands::pty_write,
        pty::commands::pty_resize,
        pty::commands::pty_close,
    ])
    .run(tauri::generate_context!())
```

### Step 8: Platform-Specific Issues

#### macOS

**Issue**: Permission denied to spawn shell

**Solution**: Check macOS privacy settings:
- System Preferences → Security & Privacy → Privacy
- Ensure your app has terminal/accessibility permissions

**Issue**: Wrong shell detected

**Debug**:
```bash
echo $SHELL  # Check your default shell
which zsh    # Verify zsh exists
which bash   # Verify bash exists
```

#### Linux

**Issue**: PTY not available

**Solution**: Install required dependencies:
```bash
sudo apt-get install libxcb-shape0-dev libxcb-xfixes0-dev
```

#### Windows

**Issue**: ConPTY not supported

**Solution**: Requires Windows 10 1809 or later

### Expected Behavior

**Correct startup sequence**:

1. App launches
2. Console logs:
   ```
   App mounted, creating initial tab...
   Tab created successfully
   Active tab: {id: "tab_...", title: "Terminal", ...}
   ```
3. Terminal window shows with shell prompt
4. Can type commands and see output

**Mock mode (browser)**:

1. Shows green mock prompt
2. Echo typing
3. Split/close buttons work
4. No actual shell commands

**Tauri mode (native)**:

1. Real shell (zsh/bash/powershell)
2. Full terminal functionality
3. Resize works
4. Split panes spawn real shells

### Still Not Working?

Collect debug information:

```bash
# System info
uname -a
node --version
npm --version
cargo --version

# Check package.json scripts
cat package.json | grep "scripts" -A 10

# Check for errors
npm run dev 2>&1 | tee dev.log
npm run tauri dev 2>&1 | tee tauri.log
```

Then share:
1. dev.log or tauri.log
2. Browser console screenshot
3. Tauri console output
4. cargo check output

### Quick Fix Checklist

- [ ] `npm install` completed without errors
- [ ] `cargo check` passes
- [ ] Browser mode shows mock terminal (npm run dev)
- [ ] Tauri mode launches window (npm run tauri dev)
- [ ] Console shows "Tab created successfully"
- [ ] No red errors in browser console
- [ ] Terminal instance renders in UI

If all checked, app should work! If not, there's a deeper issue requiring investigation.

---

## Emergency Fallback

If nothing works, verify the basic setup:

```bash
# Clean install
rm -rf node_modules
rm -rf src-tauri/target
npm install
cargo clean

# Try again
npm run tauri dev
```

---

**Last Updated**: 2026-03-21
