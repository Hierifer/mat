# Task Status System

通用的任务状态跟踪系统，可用于监控任何长时间运行的任务（Claude、编译、测试等）。

## 架构

```
use-task-status.ts          # 通用状态管理
    ↓
parsers/
  ├── claude-parser.ts      # Claude 特定解析器
  ├── build-parser.ts       # 构建任务解析器（示例）
  └── test-parser.ts        # 测试任务解析器（示例）
    ↓
use-claude-status.ts        # Claude 包装器（向后兼容）
    ↓
components/
  ├── shared/task-status-bar.vue    # 通用状态栏组件
  └── claude/claude-status-bar.vue  # Claude 状态栏（使用通用组件）
```

## 核心概念

### 1. TaskMetrics

定义任务可以跟踪的指标：

```typescript
interface TaskMetrics {
  [key: string]: number | string | null
}

// 示例：Claude 指标
interface ClaudeMetrics extends TaskMetrics {
  inputTokens: number | null
  outputTokens: number | null
  cost: number | null
  contextPercent: number | null
}
```

### 2. OutputParser

解析任务输出的接口：

```typescript
interface OutputParser<T extends TaskMetrics> {
  parseMetrics(line: string): Partial<T> | null
  parseAction(line: string): string | null
  isComplete?(line: string): boolean
  stripFormatting?(text: string): string
}
```

### 3. useTaskStatus

通用状态跟踪 composable：

```typescript
const {
  isRunning,
  currentAction,
  metrics,
  startTask,
  processOutput,
  endTask,
} = useTaskStatus(parser, options)
```

## 使用示例

### 示例 1：监控 Claude 任务（已实现）

```typescript
// 1. 创建解析器
const parser = new ClaudeOutputParser()

// 2. 使用通用 composable
const status = useTaskStatus<ClaudeMetrics>(parser)

// 3. 开始任务
status.startTask('session-123', 'claude')

// 4. 处理输出
status.processOutput('session-123', terminalOutput)

// 5. 任务完成
status.endTask()
```

### 示例 2：监控构建任务

```typescript
// parsers/build-parser.ts
interface BuildMetrics extends TaskMetrics {
  filesCompiled: number | null
  warnings: number | null
  errors: number | null
  buildTime: number | null
}

class BuildOutputParser implements OutputParser<BuildMetrics> {
  parseMetrics(line: string): Partial<BuildMetrics> | null {
    // 解析 "Compiled 42 files in 3.2s"
    const match = line.match(/Compiled (\d+) files in ([\d.]+)s/)
    if (match) {
      return {
        filesCompiled: parseInt(match[1]),
        buildTime: parseFloat(match[2]),
      }
    }
    return null
  }

  parseAction(line: string): string | null {
    // 解析 "Compiling src/main.ts..."
    const match = line.match(/Compiling (.+)\.\.\./)
    return match ? `Compiling ${match[1]}` : null
  }

  stripFormatting(text: string): string {
    return text.replace(/\x1b\[[0-9;]*m/g, '')
  }
}

// 使用
const parser = new BuildOutputParser()
const buildStatus = useTaskStatus<BuildMetrics>(parser)
```

### 示例 3：在组件中使用

```vue
<script setup lang="ts">
import TaskStatusBar from '@/components/shared/task-status-bar.vue'
import { useBuildStatus } from '@/composables/use-build-status'

const { isRunning, currentAction, metrics } = useBuildStatus()

const metricsRenderer = (m: BuildMetrics) => [
  { label: 'files', value: String(m.filesCompiled) },
  { label: 'time', value: `${m.buildTime}s` },
  { label: 'errors', value: String(m.errors), variant: 'error' },
]
</script>

<template>
  <task-status-bar
    :visible="isRunning || hasMetrics"
    task-label="Build"
    task-color="#61afef"
    :is-running="isRunning"
    :current-action="currentAction"
    :metrics="metrics"
    :metrics-renderer="metricsRenderer"
  />
</template>
```

## 向后兼容性

`use-claude-status.ts` 保留了原有的 API：

```typescript
// 旧代码继续工作
const { isRunning, usage, startSession, endSession } = useClaudeStatus()

// 新代码可以使用泛型接口
const { metrics, startTask, endTask } = useClaudeStatus()
```

## 扩展指南

### 添加新的任务类型

1. **创建指标接口**

```typescript
// parsers/test-parser.ts
interface TestMetrics extends TaskMetrics {
  passed: number | null
  failed: number | null
  skipped: number | null
  duration: number | null
}
```

2. **实现解析器**

```typescript
class TestOutputParser implements OutputParser<TestMetrics> {
  parseMetrics(line: string) { /* ... */ }
  parseAction(line: string) { /* ... */ }
}
```

3. **创建包装 composable**

```typescript
// use-test-status.ts
export function useTestStatus() {
  const parser = new TestOutputParser()
  return useTaskStatus<TestMetrics>(parser, {
    completionDelay: 2000,
    metricsRetentionDelay: 10000,
  })
}
```

4. **创建 UI 组件**

```vue
<!-- test-status-bar.vue -->
<template>
  <task-status-bar
    :visible="visible"
    task-label="Tests"
    :is-running="isRunning"
    :metrics="metrics"
    :metrics-renderer="metricsRenderer"
  />
</template>
```

## 配置选项

```typescript
useTaskStatus(parser, {
  // 无输出后多久认为任务完成（毫秒）
  completionDelay: 3000,

  // 任务完成后指标保留多久（毫秒）
  metricsRetentionDelay: 5000,
})
```

## 最佳实践

1. **解析器保持纯函数** - 不要在解析器中保存状态
2. **使用类型安全** - 定义清晰的 Metrics 接口
3. **优雅降级** - 如果无法解析某行，返回 null
4. **性能考虑** - 避免在解析器中使用复杂正则表达式
5. **可测试性** - 解析器应该易于单元测试

## 测试

```typescript
import { describe, it, expect } from 'vitest'
import { ClaudeOutputParser } from './parsers/claude-parser'

describe('ClaudeOutputParser', () => {
  const parser = new ClaudeOutputParser()

  it('should parse token counts', () => {
    const line = '1,234 input, 567 output'
    const result = parser.parseMetrics(line)

    expect(result).toEqual({
      inputTokens: 1234,
      outputTokens: 567,
    })
  })

  it('should parse action from spinner', () => {
    const line = '⠋ Reading file...'
    const action = parser.parseAction(line)

    expect(action).toBe('Reading file...')
  })
})
```

## 未来改进

- [ ] 添加历史记录功能（记录多次任务运行）
- [ ] 支持任务优先级和队列
- [ ] 添加性能分析（任务耗时统计）
- [ ] 支持任务取消和暂停
- [ ] 导出指标到文件或 API
