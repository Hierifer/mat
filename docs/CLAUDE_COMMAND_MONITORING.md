# Claude 命令监测与完成通知

Mat Terminal 可以自动检测 Claude 命令的执行，并在命令完成时发送系统通知。

## 功能特性

- ✅ **自动检测** - 识别 `claude`、`npx @claude`、`claude-code` 等命令
- ✅ **智能完成检测** - 通过输出模式和提示符检测命令完成
- ✅ **执行时间统计** - 显示命令执行耗时
- ✅ **系统通知** - 在后台运行时提醒用户

## 支持的命令模式

自动监测以下 Claude 相关命令：

```bash
# 标准 Claude CLI
claude ask "帮我写一个函数"
claude code "实现这个功能"

# NPX 方式
npx @claude/cli ask "问题"

# Claude Code CLI
claude-code run task.md

# 任何包含 claude 的命令
claude --version
```

## 工作原理

### 1. 命令检测

当你在终端输入命令并按下 Enter 时：
- 系统检查命令是否匹配 Claude 相关模式
- 如果匹配，开始监测该命令的执行

### 2. 输出监测

命令执行过程中：
- 持续监听终端输出
- 记录输出行数和内容
- 检测完成标志

### 3. 完成检测

通过以下方式判断命令完成：

**Claude 特定标记：**
- `task complete`
- `done`
- `finished`
- `successfully completed`
- `[✓]`
- `✅`

**通用完成标记：**
- Shell 提示符返回（`$`, `%`, `>`）
- 至少接收到 5 行输出后的提示符

### 4. 发送通知

命令完成时自动发送系统通知：
```
✅ Claude 任务完成
命令执行完成 (用时 2分钟 15秒)
claude ask "帮我写一个函数"
```

## 使用场景

### 场景 1：长时间运行的任务

```bash
# 执行复杂的代码生成任务
claude code "重构整个项目结构"

# 切换到其他应用工作
# 任务完成后会收到通知 ✅
```

### 场景 2：后台执行

```bash
# 启动长时间的分析任务
claude analyze codebase.tar.gz

# 最小化终端窗口
# 完成时会弹出系统通知
```

### 场景 3：批量操作

```bash
# 运行多个 Claude 命令
for file in *.md; do
  claude summarize "$file"
done

# 每个命令完成时都会通知
```

## 配置说明

### 通知权限

首次使用需要授权系统通知：
- macOS: 系统设置 → 通知 → Mat Terminal
- Windows: 设置 → 系统 → 通知
- Linux: 根据桌面环境不同而异

### 自定义检测模式

如果需要监测其他命令模式，可以修改配置：

```typescript
// frontend/src/composables/use-command-monitor.ts

// 添加自定义命令模式
const claudeCommandPatterns = [
  /claude\s+/i,
  /npx\s+@claude/i,
  /claude-code/i,
  /your-custom-pattern/i,  // 添加你的模式
]

// 添加自定义完成标记
const claudeCompletionPatterns = [
  /task\s+complete/i,
  /done/i,
  /your-completion-marker/i,  // 添加你的标记
]
```

## 技术实现

### 命令检测流程

```
用户输入 → 检测 Enter → 匹配模式 → 开始监测
    ↓
终端输出 → 累积内容 → 检测完成 → 发送通知
```

### 核心组件

**1. useCommandMonitor** (Composable)
- 管理正在运行的命令
- 检测命令模式和完成状态
- 发送通知

**2. terminal-instance.vue** (组件)
- 监听用户输入 (onData)
- 处理终端输出 (connect callback)
- 集成命令监测器

### 数据流

```typescript
interface RunningCommand {
  command: string       // 执行的命令
  sessionId: string    // 终端会话 ID
  startTime: number    // 开始时间戳
  outputLines: string[] // 输出行数组
}
```

## 调试

### 查看监测日志

打开开发者工具（F12）查看控制台：

```
[CommandMonitor] Started monitoring Claude command: claude ask "..."
[CommandMonitor] Claude command completed: { command, duration, outputLines }
```

### 常见问题

**Q: 为什么没有收到通知？**
A: 检查：
1. 系统通知权限是否开启
2. 命令是否匹配监测模式
3. 是否收到至少 5 行输出
4. 查看控制台是否有错误日志

**Q: 通知太早或太晚？**
A: 调整完成检测逻辑：
```typescript
// 修改最小输出行数要求
if (running.outputLines.length > 5) {  // 改为 10 或其他值
  // ...
}
```

**Q: 想监测非 Claude 命令？**
A: 修改 `claudeCommandPatterns` 添加你的命令模式

## 扩展功能

### 监测特定输出模式

```typescript
// 在 processOutput 中添加自定义检测
if (output.includes('[BUILD SUCCESS]')) {
  notifySuccess('构建完成', '项目构建成功')
}
```

### 添加命令历史

```typescript
// 记录所有完成的命令
const commandHistory = ref<RunningCommand[]>([])

// 在命令完成时保存
commandHistory.value.push({...running})
```

### 统计分析

```typescript
// 计算平均执行时间
const averageDuration = commandHistory.value
  .reduce((sum, cmd) => sum + (Date.now() - cmd.startTime), 0)
  / commandHistory.value.length
```

## 最佳实践

1. **不要过度依赖** - 始终查看实际输出确认结果
2. **保持终端活跃** - 某些命令可能需要交互
3. **注意性能** - 监测不会影响终端性能
4. **合理使用** - 主要用于长时间运行的任务

## 未来改进

- [ ] 支持更多命令工具（git, npm, cargo 等）
- [ ] 可配置的监测规则
- [ ] 命令执行历史记录
- [ ] 失败检测和错误通知
- [ ] 执行时间统计和分析

---

**提示**：此功能在后台默认启用。运行任何 Claude 命令时，系统会自动监测并在完成时通知你！
