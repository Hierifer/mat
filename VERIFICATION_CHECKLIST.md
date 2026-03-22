# Terminal Emulator - Verification Checklist

## Pre-Flight Checks

### 1. Build Verification
```bash
cd frontend

# Check Rust compilation
cargo check
# Expected: "Finished ... checking target(s)"

# Check TypeScript compilation
npm run type-check  # or npm run build
# Expected: No type errors
```

### 2. File Structure Verification

```bash
# All files should exist
ls -la src-tauri/src/pty/
# Expected files:
# - commands.rs
# - manager.rs
# - mod.rs
# - shell.rs (NEW)

ls -la src/components/terminal/
# Expected files:
# - terminal-instance.vue
# - pane-toolbar.vue (NEW)

ls -la src/composables/
# Expected files:
# - use-pty-session.ts
# - use-keyboard-shortcuts.ts (NEW)
```

---

## Phase 1: PTY Resize Tests

### Test 1: Basic Resize
```bash
# 1. Start the app
npm run dev

# 2. In terminal, run:
watch "tput cols && tput lines"

# 3. Resize window horizontally
# ✅ Expected: Column number increases/decreases

# 4. Resize window vertically
# ✅ Expected: Line number increases/decreases
```

**Pass Criteria**: Numbers update immediately when resizing

### Test 2: Long Output Resize
```bash
# 1. Run a command with wide output
ls -la /usr/bin

# 2. Make window narrower
# ✅ Expected: Text wraps correctly, no overlapping

# 3. Make window wider
# ✅ Expected: Text expands to use available space
```

**Pass Criteria**: No text corruption or misalignment

### Test 3: Rapid Resize
```bash
# 1. Run:
yes "This is a test line that is somewhat long"

# 2. Rapidly resize window multiple times
# ✅ Expected: No crashes, terminal keeps up

# 3. Stop with Ctrl+C
# ✅ Expected: Terminal still responsive
```

**Pass Criteria**: Application remains stable

---

## Phase 2: Cross-Platform Shell Tests

### Test 4: macOS Shell Detection
```bash
# 1. Start terminal
npm run dev

# 2. Check current shell
echo $SHELL

# ✅ Expected on macOS: /bin/zsh (or /bin/bash if zsh not available)
```

### Test 5: Environment Variable Override
```bash
# 1. Set custom shell
export SHELL=/bin/bash

# 2. Restart app
npm run dev

# 3. Verify shell
echo $0

# ✅ Expected: -bash (or your custom shell)
```

### Test 6: Shell Functionality
```bash
# 1. Test shell features (zsh example)
echo ${PATH//:/\\n}

# 2. Test command completion
cd /usr/bin
ls -l gre[TAB]

# ✅ Expected: Shell-specific features work correctly
```

**Pass Criteria**: Correct shell loads, all features work

---

## Phase 3: Split Pane Tests

### Test 7: Horizontal Split
```bash
# 1. Click the ⬌ button in toolbar
# ✅ Expected: Two panes appear side-by-side

# 2. Type different commands in each pane
# Left: echo "LEFT"
# Right: echo "RIGHT"

# ✅ Expected: Outputs appear in respective panes
```

**Pass Criteria**: Independent terminal sessions

### Test 8: Vertical Split
```bash
# 1. Click the ⬍ button in toolbar
# ✅ Expected: Two panes appear top-bottom

# 2. Run different commands
# Top: watch date
# Bottom: htop (or top)

# ✅ Expected: Both update independently
```

**Pass Criteria**: No interference between panes

### Test 9: Nested Splits (4-Pane Grid)
```bash
# 1. Click ⬌ (creates 2 panes)
# 2. Click ⬍ on left pane (creates 2 panes in left)
# 3. Click ⬍ on right pane (creates 2 panes in right)

# ✅ Expected: 4 panes in 2x2 grid

# 4. Run command in each pane:
# Top-Left: echo 1
# Top-Right: echo 2
# Bottom-Left: echo 3
# Bottom-Right: echo 4

# ✅ Expected: Numbers appear in correct panes
```

**Pass Criteria**: Complex layouts work correctly

### Test 10: Close Pane
```bash
# 1. Create 2 panes horizontally
# 2. Click ✕ on left pane

# ✅ Expected:
# - Left pane disappears
# - Right pane expands to fill space
# - Terminal still responsive
```

**Pass Criteria**: Clean removal and expansion

### Test 11: Close Nested Pane
```bash
# 1. Create 4-pane grid (Test 9)
# 2. Close top-right pane

# ✅ Expected:
# - Top-right disappears
# - Layout rebalances
# - 3 panes remain
```

**Pass Criteria**: Tree simplification works

---

## Phase 4: Keyboard Shortcut Tests

### Test 12: Horizontal Split Shortcut
```bash
# 1. Click on a pane toolbar to focus
# 2. Press Cmd+D (Mac) or Ctrl+D (Windows/Linux)

# ✅ Expected: Pane splits horizontally
```

### Test 13: Vertical Split Shortcut
```bash
# 1. Click on a pane toolbar to focus
# 2. Press Cmd+Shift+D (Mac) or Ctrl+Shift+D (Windows/Linux)

# ✅ Expected: Pane splits vertically
```

### Test 14: Close Pane Shortcut
```bash
# 1. Create 2 panes
# 2. Click on one pane's toolbar to focus
# 3. Press Cmd+W (Mac) or Ctrl+W (Windows/Linux)

# ✅ Expected: Focused pane closes
```

### Test 15: Active Pane Indicator
```bash
# 1. Create 3 panes
# 2. Click each pane's toolbar

# ✅ Expected:
# - Clicked pane gets blue border
# - Previous pane loses blue border
# - Only one pane active at a time
```

**Pass Criteria**: Visual feedback clear

---

## Integration Tests

### Test 16: Split + Resize
```bash
# 1. Create 4-pane grid
# 2. Run in each pane: watch "tput cols && tput lines"
# 3. Resize window

# ✅ Expected: All panes update dimensions correctly
```

### Test 17: Rapid Operations
```bash
# 1. Press Cmd+D 5 times rapidly
# ✅ Expected: Creates multiple splits without errors

# 2. Press Cmd+W 5 times rapidly
# ✅ Expected: Closes panes cleanly, no crashes
```

### Test 18: Full Workflow
```bash
# 1. Start with 1 pane
# 2. Cmd+D (2 panes horizontal)
# 3. Left pane: Cmd+Shift+D (3 panes)
# 4. Right pane: Cmd+Shift+D (4 panes in grid)
# 5. Run: ls in each pane
# 6. Close bottom-left: Cmd+W
# 7. Resize window
# 8. Close bottom-right: Click ✕

# ✅ Expected: All operations smooth, no errors
```

---

## Stress Tests

### Test 19: Many Panes
```bash
# 1. Create 16 panes (split repeatedly)
# 2. Run simple command in each: echo "Pane N"

# ✅ Expected:
# - Memory usage < 500MB
# - All panes responsive
# - No lag when typing
```

### Test 20: Long-Running Processes
```bash
# 1. Create 4 panes
# 2. In each, run different long-running command:
# Pane 1: watch date
# Pane 2: yes "test" | head -1000
# Pane 3: ping 8.8.8.8
# Pane 4: while true; do date; sleep 1; done

# 3. Let run for 5 minutes
# 4. Close all panes

# ✅ Expected:
# - All processes run correctly
# - Clean shutdown
# - No memory leaks (check Activity Monitor/Task Manager)
```

---

## Error Handling Tests

### Test 21: Close Last Pane
```bash
# 1. Create 1 pane (default)
# 2. Press Cmd+W or click ✕

# ✅ Expected: Tab closes (or app closes if last tab)
```

### Test 22: Kill Shell Process
```bash
# 1. Create pane
# 2. Run: ps aux | grep zsh  # (or bash/powershell)
# 3. From another terminal: kill -9 <PID>

# ✅ Expected: Pane shows disconnected or closes gracefully
```

### Test 23: Invalid Resize
```bash
# 1. Minimize window to very small size (< 10x10)
# 2. Restore to normal

# ✅ Expected: No crashes, terminal recovers
```

---

## Visual Regression Tests

### Test 24: UI Consistency
```bash
# 1. Create various layouts
# 2. Check each pane toolbar:

# ✅ Verify:
# - All buttons visible (⬌ ⬍ ✕)
# - Session ID shown
# - Hover effects work
# - Active state blue border
# - Close button red on hover
```

### Test 25: Layout Integrity
```bash
# 1. Create complex layout
# 2. Resize window multiple times

# ✅ Verify:
# - No overlapping panes
# - No gaps between panes
# - Borders align correctly
# - Toolbars don't clip
```

---

## Performance Benchmarks

### Test 26: Startup Time
```bash
# 1. Measure app startup
time npm run dev

# ✅ Target: < 3 seconds to first terminal
```

### Test 27: Split Performance
```bash
# 1. Time creating 8 panes
# 2. Use developer tools to measure

# ✅ Target: < 100ms per split operation
```

### Test 28: Resize Performance
```bash
# 1. Create 4-pane grid
# 2. Resize window 20 times rapidly
# 3. Check for frame drops (use developer tools)

# ✅ Target: Maintains 60 FPS
```

---

## Browser Console Checks

### Test 29: No Errors in Console
```bash
# 1. Open developer tools (F12)
# 2. Go to Console tab
# 3. Perform all operations above

# ✅ Expected:
# - No red errors
# - Warnings acceptable (Vue dev mode)
# - No memory leak warnings
```

### Test 30: Proper Event Cleanup
```bash
# 1. Open developer tools > Performance
# 2. Start recording
# 3. Create and close 10 panes
# 4. Stop recording

# ✅ Expected:
# - No unbounded event listener growth
# - PTY events properly cleaned up
# - No memory retained from closed panes
```

---

## Summary Checklist

Use this quick checklist for daily verification:

- [ ] App builds without errors (`cargo check` + `npm run build`)
- [ ] Basic resize works (Test 1)
- [ ] Correct shell loads (Test 4)
- [ ] Horizontal split works (Test 7)
- [ ] Vertical split works (Test 8)
- [ ] Close pane works (Test 10)
- [ ] Cmd+D splits (Test 12)
- [ ] Cmd+Shift+D splits (Test 13)
- [ ] Cmd+W closes (Test 14)
- [ ] Active pane indicator visible (Test 15)
- [ ] No console errors (Test 29)

**All 11 items passing = Ready for release ✅**

---

## Reporting Issues

If any test fails, collect this information:

1. **Environment**:
   - OS: [macOS 13.0 / Windows 11 / Ubuntu 22.04]
   - Node version: `node --version`
   - Cargo version: `cargo --version`

2. **Test Details**:
   - Test number and name
   - Expected behavior
   - Actual behavior

3. **Logs**:
   - Browser console output
   - Tauri dev console output
   - Screenshot if visual issue

4. **Reproduction Steps**:
   - Minimal steps to reproduce
   - Whether issue is consistent

---

## Automation

Future: Convert this to automated tests using:

- **Rust**: `#[cfg(test)]` for PTY logic
- **TypeScript**: Vitest for store/composables
- **E2E**: Playwright for UI tests

---

**Last Updated**: 2026-03-21
**Version**: 1.0.0
