# 系统通知功能

Mat Terminal 支持 macOS/Windows/Linux 系统级通知，可以在重要事件发生时提醒用户。

## 功能特性

- ✅ **原生系统通知** - 使用操作系统的通知中心
- ✅ **自动权限管理** - 首次使用时自动请求权限
- ✅ **多种通知类型** - 任务完成、成功、错误、信息提示
- ✅ **自定义内容** - 支持标题、正文、图标、声音

## 已实现的通知场景

### 1. 更新通知
- ✅ 发现新版本时通知
- ✅ 已是最新版本时通知

### 2. 未来可扩展场景
- ⏱️ 长时间命令执行完成
- ⏱️ 终端任务完成
- ⏱️ 错误和警告提示
- ⏱️ 自定义用户提醒

## 使用方法

### 在 Vue 组件中使用

```typescript
import { useNotification } from '@/composables/use-notification'

// 在 setup 中
const {
  notify,
  notifyTaskComplete,
  notifySuccess,
  notifyError,
  notifyInfo
} = useNotification()

// 发送自定义通知
await notify({
  title: '通知标题',
  body: '通知内容',
})

// 使用预设类型
await notifyTaskComplete('编译任务', '项目编译成功完成')
await notifySuccess('操作成功', '文件已保存')
await notifyError('操作失败', '无法连接到服务器')
await notifyInfo('提示', '有新消息')
```

### API 参考

#### `useNotification()` Composable

返回的方法：

```typescript
{
  // 权限状态
  permissionGranted: Ref<boolean>

  // 检查和请求权限
  checkPermission: () => Promise<boolean>

  // 发送自定义通知
  notify: (options: {
    title: string
    body?: string
    icon?: string
    sound?: string
  }) => Promise<boolean>

  // 预设通知类型
  notifyTaskComplete: (taskName: string, details?: string) => Promise<boolean>
  notifySuccess: (message: string, details?: string) => Promise<boolean>
  notifyError: (message: string, details?: string) => Promise<boolean>
  notifyInfo: (message: string, details?: string) => Promise<boolean>
}
```

## 权限管理

### macOS
首次使用通知时，系统会弹出权限请求：
```
"mat" would like to send you notifications.
[Don't Allow]  [Allow]
```

点击 "Allow" 授权后，所有通知功能正常工作。

### 手动管理权限

如果误点了 "Don't Allow"，可以在系统设置中手动授权：

1. 打开 **系统设置** → **通知**
2. 找到 **mat** 或 **Mat Terminal**
3. 启用 "允许通知"

## 扩展通知场景

### 示例：命令执行完成通知

虽然在终端中精确检测命令完成比较复杂，但可以在特定场景下实现：

```typescript
// 监听特定命令的完成
const runCommandWithNotification = async (command: string) => {
  // 执行命令
  await executeCommand(command)

  // 命令完成后通知
  await notifyTaskComplete(
    '命令执行完成',
    `"${command}" 已完成`
  )
}
```

### 示例：监听 PTY 输出触发通知

```typescript
// 在 terminal-instance.vue 或相关组件中
import { useNotification } from '@/composables/use-notification'

const { notifyInfo } = useNotification()

// 监听特定输出模式
terminal.onData((data) => {
  if (data.includes('[BUILD SUCCESS]')) {
    notifyTaskComplete('构建成功', '项目构建已完成')
  }
  if (data.includes('[ERROR]')) {
    notifyError('构建失败', '发现编译错误')
  }
})
```

### 示例：定时任务提醒

```typescript
// 设置定时提醒
setTimeout(async () => {
  await notifyInfo('休息提醒', '您已经工作 1 小时了，该休息一下了')
}, 60 * 60 * 1000) // 1 小时后
```

## 最佳实践

1. **不要过度使用** - 只在重要事件时发送通知
2. **提供有用信息** - 通知内容应该清晰明确
3. **尊重用户偏好** - 提供禁用选项
4. **测试权限** - 确保在发送前检查权限状态

## 技术实现

- **后端**: `tauri-plugin-notification` (Rust)
- **前端**: `@tauri-apps/plugin-notification` (TypeScript)
- **平台支持**: macOS, Windows, Linux

## 参考资料

- [Tauri Notification Plugin](https://v2.tauri.app/plugin/notification/)
- [JavaScript API Reference](https://v2.tauri.app/reference/javascript/notification/)

## 故障排除

### 通知不显示

1. **检查权限**：确保在系统设置中允许通知
2. **查看控制台**：检查是否有 `[Notification]` 标签的错误日志
3. **重启应用**：权限更改后需要重启应用

### 权限请求没有弹出

- macOS：检查 系统设置 → 通知 中的应用列表
- 确保应用有正确的签名和权限配置

---

**提示**：通知功能会在应用启动时自动初始化并请求权限。首次使用时请点击"允许"以启用所有通知功能。
