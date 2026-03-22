# Terminal Emulator - Quick Start Guide

## 🚀 Getting Started

### Installation

```bash
# Install dependencies
cd frontend
npm install

# Run in development mode
npm run dev

# Build for production
npm run build
```

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + D` | Split pane horizontally (side-by-side) |
| `Cmd/Ctrl + Shift + D` | Split pane vertically (top-bottom) |
| `Cmd/Ctrl + W` | Close active pane |

> **Note**: On macOS use `Cmd`, on Windows/Linux use `Ctrl`

---

## 🖱️ Mouse Controls

### Pane Toolbar

Each terminal pane has a toolbar at the top with these buttons:

- **⬌** - Split horizontally (creates new pane to the right)
- **⬍** - Split vertically (creates new pane below)
- **✕** - Close this pane

### Focusing Panes

Click on any pane's toolbar to make it the active pane. The active pane will have:
- A blue border at the bottom of the toolbar
- A slightly lighter background

---

## 🎯 Common Workflows

### Create a 2-Pane Layout
1. Click the **⬌** button in the toolbar
2. You now have two terminals side-by-side

### Create a 4-Pane Grid
1. Click **⬌** to split horizontally
2. Click **⬍** on the left pane to split it vertically
3. Click **⬍** on the right pane to split it vertically
4. You now have a 2x2 grid

### Close a Pane
- Click the **✕** button, or
- Focus the pane and press `Cmd/Ctrl + W`

---

## 🔧 Features

### ✅ Auto-Resize
The terminal automatically adjusts when you resize the window. No more broken output!

### ✅ Cross-Platform
- **macOS**: Uses `zsh` by default
- **Linux**: Uses `bash` by default
- **Windows**: Uses `PowerShell` by default

You can override with the `$SHELL` environment variable.

### ✅ Multiple Panes
Split your terminal into as many panes as you need. Each pane is an independent terminal session.

### ✅ Smart Cleanup
When you close a pane, the remaining panes automatically expand to fill the space.

---

## 📝 Examples

### Development Workflow
```
┌─────────────┬─────────────┐
│             │             │
│   Editor    │   Server    │
│   (vim)     │ (npm dev)   │
│             │             │
├─────────────┼─────────────┤
│             │             │
│    Git      │    Tests    │
│  (status)   │  (watch)    │
│             │             │
└─────────────┴─────────────┘
```

**Setup**:
1. Split horizontally → `Cmd+D`
2. Split left pane vertically → Click left pane, then `Cmd+Shift+D`
3. Split right pane vertically → Click right pane, then `Cmd+Shift+D`

### Monitoring Setup
```
┌─────────────────────────────┐
│      Server Logs            │
│    (tail -f server.log)     │
├─────────────┬───────────────┤
│   CPU/RAM   │   Network     │
│   (htop)    │   (nethogs)   │
└─────────────┴───────────────┘
```

**Setup**:
1. Split vertically → `Cmd+Shift+D`
2. Click bottom pane
3. Split horizontally → `Cmd+D`

---

## 🐛 Troubleshooting

### Terminal not resizing properly
1. Run `watch "tput cols && tput lines"` to test
2. Resize the window - numbers should update
3. If they don't, try restarting the terminal

### Wrong shell on startup
Set your preferred shell:
```bash
export SHELL=/bin/bash  # or /bin/zsh, /bin/fish, etc.
```

### Keyboard shortcuts not working
1. Make sure a pane is active (has blue border)
2. Click on a pane toolbar to focus it
3. Try the shortcut again

### Can't close a pane
- You must have at least one pane
- Closing the last pane closes the entire tab

---

## 🎨 Visual Reference

### Active Pane
```
┌─────────────────────────────┐
│ Session: abc12345    ⬌ ⬍ ✕ │ ← Blue border (active)
├─────────────────────────────┤
│ $ _                         │
│                             │
└─────────────────────────────┘
```

### Inactive Pane
```
┌─────────────────────────────┐
│ Session: def67890    ⬌ ⬍ ✕ │ ← Gray border (inactive)
├─────────────────────────────┤
│ $ ls                        │
│ file1.txt  file2.txt        │
└─────────────────────────────┘
```

---

## 💡 Tips

1. **Use keyboard shortcuts** - Much faster than clicking buttons
2. **Keep it organized** - Close panes you don't need to reduce clutter
3. **Focus before typing** - Always click a pane before using shortcuts
4. **Test resize** - Run `tput cols && tput lines` to verify auto-resize works

---

## 🚧 Known Limitations

- No drag-to-resize dividers (coming soon)
- Split sizes are always 50/50
- No pane reordering (drag-and-drop)
- No persistent layouts (sessions don't save on restart)

---

## 📚 Advanced Usage

### Custom Shell
Create a `.env` file:
```bash
SHELL=/usr/local/bin/fish
```

### Rapid Pane Creation
```bash
# Create a 3-column layout
Cmd+D          # Split 1
Cmd+D          # Split 2 (on active pane)
```

### Efficient Navigation
1. Click pane → `Cmd+D` → Type command
2. Click other pane → `Cmd+Shift+D` → Type command
3. Repeat as needed

---

## 🔗 See Also

- [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md) - Technical details
- [Tauri Documentation](https://tauri.app/)
- [XTerm.js](https://xtermjs.org/)

---

**Made with ❤️ using Tauri + Vue 3**
