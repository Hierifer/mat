# Terminal Emulator - 最终测试指南

## 🎯 快速测试步骤

### 1. 基础启动测试

```bash
cd /Users/hierifer/Desktop/terminal-emulator/frontend
npm run tauri dev
```

**预期结果**：
- ✅ 应用启动，显示一个终端窗口
- ✅ 终端显示 shell 提示符 (zsh 或 bash)
- ✅ 能够输入命令并看到输出
- ✅ 浏览器控制台显示：
  ```
  Connecting to PTY session: 019d119d-xxx
  Successfully connected to PTY session: 019d119d-xxx
  ```

**如果看到错误**：
- 检查 Tauri 控制台输出
- 查看浏览器控制台的详细错误信息

---

### 2. PTY Resize 测试

在终端中运行：
```bash
watch "tput cols && tput lines"
```

**操作**：拖动窗口边缘，改变窗口大小

**预期结果**：
- ✅ 终端中显示的列数 (cols) 和行数 (lines) 实时更新
- ✅ 没有 "Session not found" 错误
- ✅ 文本正确换行，没有错位

---

### 3. 水平分割测试

**方法 1 - 使用按钮**：
1. 点击工具栏的 ⬌ 按钮

**方法 2 - 使用快捷键**：
1. 确保终端窗口获得焦点
2. 按 `Cmd + D` (macOS) 或 `Ctrl + D` (Windows/Linux)

**预期结果**：
- ✅ 出现两个并排的终端窗格
- ✅ 每个窗格都有独立的 shell 提示符
- ✅ 在左边输入命令，只在左边显示输出
- ✅ 在右边输入命令，只在右边显示输出
- ✅ 每个窗格的工具栏显示不同的 session ID

**验证独立性**：
```bash
# 左边窗格
echo "LEFT PANE"

# 右边窗格
echo "RIGHT PANE"
```

---

### 4. 垂直分割测试

**方法 1 - 使用按钮**：
1. 点击任意窗格工具栏的 ⬍ 按钮

**方法 2 - 使用快捷键**：
1. 点击要分割的窗格（使其获得焦点，工具栏显示蓝色边框）
2. 按 `Cmd + Shift + D` (macOS) 或 `Ctrl + Shift + D`

**预期结果**：
- ✅ 选中的窗格分成上下两部分
- ✅ 两个窗格都能独立工作

---

### 5. 创建 4 窗格网格

**步骤**：
1. 从单个窗格开始
2. 按 `Cmd + D` → 得到 2 个水平窗格
3. 点击左边窗格工具栏（激活它）
4. 按 `Cmd + Shift + D` → 左边分成上下两个
5. 点击右边窗格工具栏（激活它）
6. 按 `Cmd + Shift + D` → 右边分成上下两个

**预期结果**：
```
┌─────────┬─────────┐
│ Pane 1  │ Pane 3  │
├─────────┼─────────┤
│ Pane 2  │ Pane 4  │
└─────────┴─────────┘
```

**在每个窗格运行不同命令验证**：
```bash
# Pane 1
echo "Pane 1" && sleep 1 && echo "Working"

# Pane 2
echo "Pane 2" && date

# Pane 3
echo "Pane 3" && ls

# Pane 4
echo "Pane 4" && pwd
```

---

### 6. 关闭窗格测试

**方法 1 - 使用按钮**：
点击窗格工具栏的 ✕ 按钮

**方法 2 - 使用快捷键**：
1. 点击要关闭的窗格工具栏（激活它）
2. 按 `Cmd + W` (macOS) 或 `Ctrl + W`

**预期结果**：
- ✅ 窗格关闭
- ✅ 剩余窗格自动扩展填充空间
- ✅ 没有 "Session not found" 错误
- ✅ 如果只剩一个窗格，关闭它会关闭整个标签页

---

### 7. 焦点管理测试

**步骤**：
1. 创建 3 个窗格
2. 依次点击每个窗格的工具栏

**预期结果**：
- ✅ 被点击的窗格工具栏显示蓝色底部边框
- ✅ 背景变为稍浅的颜色 (#3d3d3d)
- ✅ 之前激活的窗格失去蓝色边框
- ✅ 快捷键作用于当前激活的窗格

---

### 8. 窗口调整大小 + 多窗格测试

**步骤**：
1. 创建 4 窗格网格
2. 在所有窗格运行：`watch "tput cols && tput lines"`
3. 调整窗口大小（水平和垂直方向）

**预期结果**：
- ✅ 所有 4 个窗格的尺寸同时更新
- ✅ 每个窗格显示正确的列数和行数
- ✅ 没有控制台错误

---

### 9. 压力测试

#### 9.1 快速连续分割
```bash
# 快速按 Cmd+D 10 次
```

**预期结果**：
- ✅ 创建多个窗格，没有崩溃
- ✅ 每个窗格都能正常工作

#### 9.2 快速连续关闭
```bash
# 创建 8 个窗格，然后快速按 Cmd+W 关闭它们
```

**预期结果**：
- ✅ 窗格依次关闭
- ✅ 布局正确重排
- ✅ 没有内存泄漏

#### 9.3 长时间运行
```bash
# 在 4 个窗格分别运行：
# Pane 1:
watch date

# Pane 2:
ping 8.8.8.8

# Pane 3:
yes "test" | head -1000

# Pane 4:
while true; do echo "Running..."; sleep 1; done
```

**让它们运行 5-10 分钟，然后**：
- ✅ 检查 Activity Monitor / 任务管理器
- ✅ 内存使用应该稳定（不持续增长）
- ✅ CPU 使用合理
- ✅ 所有终端仍然响应

---

### 10. 跨平台测试

#### macOS
```bash
# 检查默认 shell
echo $SHELL
# 应该是: /bin/zsh

# 测试 zsh 特性
echo ${PATH//:/\\n}
```

#### Linux (如果有)
```bash
# 检查默认 shell
echo $SHELL
# 应该是: /bin/bash

# 测试 bash 特性
echo ${HOME}
```

#### Windows (如果有)
```powershell
# 应该启动 PowerShell
$PSVersionTable.PSVersion
```

---

## 🐛 常见问题排查

### 问题 1: "Session not found"

**症状**：控制台显示 "Failed to resize/write PTY session ... Session not found"

**可能原因**：
1. Vue 组件复用问题（已修复）
2. Session 在前端创建完成前就尝试使用
3. Session 被意外删除

**调试步骤**：
1. 查看 Tauri 控制台的日志：
   ```
   PTY session created: 019d119d-xxx (total sessions: 1)
   ```
2. 查看浏览器控制台的连接日志：
   ```
   Connecting to PTY session: 019d119d-xxx
   Successfully connected to PTY session: 019d119d-xxx
   ```
3. 如果看到不同的 session ID，说明存在组件复用问题

**解决方案**：
- 已添加正确的 `:key` 属性
- 已添加连接状态检查
- 已添加详细日志

---

### 问题 2: 终端显示空白

**症状**：窗格显示但是没有提示符

**可能原因**：
1. PTY 连接失败
2. Event listener 未正确设置
3. XTerm.js 未正确初始化

**调试步骤**：
1. 打开浏览器控制台，检查是否有错误
2. 查看 Network 标签，确认没有 404 错误
3. 检查 Tauri 权限配置

---

### 问题 3: 无法输入命令

**症状**：终端显示但键盘输入无响应

**可能原因**：
1. write 命令失败
2. Terminal.onData 未正确连接
3. 窗格未获得焦点

**调试步骤**：
1. 检查控制台是否有 "Failed to write" 错误
2. 尝试点击终端内容区域
3. 检查 `isConnected` 状态

---

### 问题 4: 分割后一个窗格不工作

**症状**：分割后新窗格是空白的或无响应

**可能原因**：
1. 新 session 创建失败
2. TerminalInstance 组件未正确挂载
3. SessionId 传递错误

**调试步骤**：
1. 查看控制台确认新 session 是否创建：
   ```
   PTY session created: 019d119e-xxx (total sessions: 2)
   ```
2. 检查 split-container 的 `:key` 是否正确
3. 验证 sessionId prop 传递正确

---

## ✅ 通过标准

### 所有测试通过的标准：

- [ ] 应用启动，显示单个终端
- [ ] 能够输入和执行命令
- [ ] 窗口调整大小时终端尺寸正确更新
- [ ] 水平分割创建两个独立终端
- [ ] 垂直分割创建两个独立终端
- [ ] 可以创建复杂布局（如 4 窗格网格）
- [ ] 关闭窗格时布局正确重排
- [ ] Cmd+D / Ctrl+D 快捷键工作
- [ ] Cmd+Shift+D / Ctrl+Shift+D 快捷键工作
- [ ] Cmd+W / Ctrl+W 快捷键工作
- [ ] 激活的窗格有视觉指示（蓝色边框）
- [ ] 快捷键作用于激活的窗格
- [ ] 没有 "Session not found" 错误
- [ ] 没有未捕获的 JavaScript 异常
- [ ] 内存使用稳定（长时间运行无泄漏）
- [ ] 在目标平台上 shell 正确启动

**如果所有项都打勾，恭喜！你的终端模拟器已经完全可用！** 🎉

---

## 📊 性能基准

### 预期性能指标：

- **启动时间**：< 3 秒到第一个可用终端
- **分割延迟**：< 200ms 创建新窗格
- **调整大小响应**：< 100ms 更新终端尺寸（带防抖）
- **内存使用**：
  - 1 窗格：~50-80MB
  - 4 窗格：~150-250MB
  - 16 窗格：~300-500MB
- **CPU 使用**：
  - 空闲时：< 1%
  - 活跃输出时：< 10%

---

## 🎓 高级用法示例

### 开发环境布局
```
┌────────────────┬────────────────┐
│                │                │
│   Editor       │   Dev Server   │
│   (vim/code)   │   (npm dev)    │
│                │                │
├────────────────┼────────────────┤
│                │                │
│   Git Status   │   Tests        │
│   (watch git)  │   (npm test)   │
│                │                │
└────────────────┴────────────────┘
```

### 监控面板
```
┌─────────────────────────────────┐
│    Server Logs                  │
│    (tail -f app.log)            │
├────────────────┬────────────────┤
│   System       │   Network      │
│   (htop)       │   (nethogs)    │
└────────────────┴────────────────┘
```

### 数据库操作
```
┌────────────────┬────────────────┐
│   PostgreSQL   │   MongoDB      │
│   (psql)       │   (mongosh)    │
├────────────────┴────────────────┤
│   Database Logs                 │
│   (tail -f db.log)              │
└─────────────────────────────────┘
```

---

## 📝 报告问题

如果测试失败，请收集以下信息：

1. **环境信息**：
   ```bash
   uname -a
   node --version
   npm --version
   cargo --version
   ```

2. **错误日志**：
   - 浏览器控制台完整输出
   - Tauri 控制台完整输出
   - 截图（如果是视觉问题）

3. **复现步骤**：
   - 详细的操作步骤
   - 预期行为
   - 实际行为

4. **系统状态**：
   - 内存使用情况
   - CPU 使用情况
   - 打开的窗格数量

---

**测试愉快！** 🚀
