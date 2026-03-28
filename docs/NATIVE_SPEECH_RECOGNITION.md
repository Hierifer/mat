# 原生语音识别实施指南

## 概述

Mat Terminal 现在使用 **tauri-plugin-stt** 来实现原生语音识别功能，替代了之前不兼容 macOS WebView 的 Web Speech API。

## 为什么需要原生插件？

在 macOS 上，Tauri 使用的 WKWebView 不支持 Web Speech API，导致 `service-not-allowed` 错误。原生插件通过直接调用系统级 Speech Recognition API 解决了这个问题。

## 技术栈

- **后端**: tauri-plugin-stt (Rust 插件)
- **前端**: tauri-plugin-stt-api (TypeScript API)
- **支持平台**:
  - macOS (使用系统 Speech Recognition)
  - Windows (使用 Vosk 离线引擎)
  - Linux (使用 Vosk 离线引擎)
  - iOS/Android (使用原生 API)

## 已完成的配置

### 1. Rust 后端配置

**`frontend/src-tauri/Cargo.toml`**
```toml
[dependencies]
tauri-plugin-stt = "0.1"
```

**`frontend/src-tauri/src/lib.rs`**
```rust
.plugin(tauri_plugin_stt::init())
```

### 2. macOS 权限配置

**`frontend/src-tauri/Info.plist`**
```xml
<key>NSMicrophoneUsageDescription</key>
<string>Mat Terminal needs access to your microphone for voice-to-text input functionality.</string>
<key>NSSpeechRecognitionUsageDescription</key>
<string>Mat Terminal needs speech recognition to convert voice to text for terminal input.</string>
```

### 3. Tauri 权限配置

**`frontend/src-tauri/capabilities/default.json`**
```json
{
  "permissions": [
    "stt:default"
  ]
}
```

### 4. 前端依赖

**`frontend/package.json`**
```json
{
  "dependencies": {
    "tauri-plugin-stt-api": "^0.1.0"
  }
}
```

### 5. Vue Composable

创建了 `frontend/src/composables/use-native-speech.ts`，提供以下功能：

- ✅ 检查语音识别可用性
- ✅ 启动/停止语音识别
- ✅ 实时转录（interim results）
- ✅ 最终转录结果
- ✅ 错误处理和用户友好的错误消息
- ✅ 自动清理监听器

### 6. App.vue 集成

- 使用 `useNativeSpeech()` 替换 `useSpeechRecognition()`
- 保留所有现有功能：
  - 自动发送转录文本到活动终端
  - Ctrl+Shift+V 快捷键
  - 语音指示器显示
  - 错误提示

## 使用方法

### 启动语音识别

1. 点击 Tab Bar 右侧的麦克风图标
2. 或使用快捷键 `Ctrl+Shift+V` (Windows/Linux) 或 `Cmd+Shift+V` (macOS)

### 首次使用

首次使用时，macOS 会弹出权限请求：

```
"mat" would like to access the microphone.
"mat" would like to use Speech Recognition.
```

点击 "OK" 授权两个权限。

### 语音输入流程

1. 点击麦克风按钮开始录音（图标变蓝并有脉冲动画）
2. 说话，实时转录的文本会出现在浮动指示器中
3. 转录完成的文本自动发送到当前活动的终端窗格
4. 再次点击麦克风按钮或按快捷键停止录音

## API 说明

### useNativeSpeech() Composable

```typescript
const {
  isListening,          // ref<boolean> - 是否正在录音
  transcript,           // ref<string> - 最终转录文本
  interimTranscript,    // ref<string> - 临时转录文本
  displayTranscript,    // computed<string> - 组合显示的转录文本
  isSupported,          // ref<boolean> - 是否支持语音识别
  error,                // ref<string | null> - 错误消息
  state,                // ref<'idle' | 'listening' | 'processing'> - 当前状态
  start,                // () => Promise<void> - 开始录音
  stop,                 // () => Promise<void> - 停止录音
  toggle,               // () => Promise<void> - 切换录音状态
  getFinalTranscript,   // () => string - 获取最终转录文本
  clear,                // () => void - 清除转录文本
} = useNativeSpeech()
```

## 错误处理

插件会自动处理以下错误并显示中文提示：

| 错误代码 | 用户提示 |
|---------|---------|
| `PERMISSION_DENIED` | 麦克风权限被拒绝。请在系统设置中允许访问。 |
| `NOT_AVAILABLE` | 语音识别服务不可用 |
| `NO_SPEECH` | 未检测到语音输入 |
| `TIMEOUT` | 语音识别超时 |

详细的权限设置指南请参考：[MICROPHONE_PERMISSIONS.md](./MICROPHONE_PERMISSIONS.md)

## 编译和测试

### 开发环境

```bash
cd frontend
npm run tauri:dev
```

### 生产构建

```bash
cd frontend
npm run tauri:build
```

构建后的应用会在 `frontend/src-tauri/target/release/bundle/` 目录中。

## 注意事项

1. **首次构建时间较长**: tauri-plugin-stt 会下载语音识别模型（仅桌面平台）
2. **模型大小**: 中文模型约 40-50MB，会自动下载到用户目录
3. **网络连接**: 首次使用需要网络连接以下载模型
4. **权限要求**: macOS 需要两个权限（麦克风 + 语音识别）

## 故障排除

### 权限被拒绝

- 打开 系统设置 → 隐私与安全性 → 麦克风/语音识别
- 找到 "mat" 并启用
- 重启应用

### 语音识别不可用

- 检查是否有网络连接（首次使用需要下载模型）
- 查看控制台日志中的 `[NativeSpeech]` 标签
- 确认 tauri-plugin-stt 依赖已正确安装

### 模型下载失败

- 检查网络连接
- 重启应用重试
- 查看 ~/.cache/ 目录是否有足够空间

## 相关文档

- [tauri-plugin-stt GitHub](https://github.com/brenogonzaga/tauri-plugin-stt)
- [麦克风权限设置指南](./MICROPHONE_PERMISSIONS.md)
- [Tauri 插件系统](https://v2.tauri.app/plugin/)

## 开发者笔记

如果需要修改语音识别行为，主要修改点：

1. **语言设置**: 在 `use-native-speech.ts` 的 `start()` 函数中修改 `language` 参数
2. **连续识别**: 修改 `continuous` 参数
3. **临时结果**: 修改 `interimResults` 参数
4. **最大时长**: 修改 `maxDuration` 参数（0 = 无限制）

例如，切换到英文识别：

```typescript
await api.startListening({
  language: 'en-US',  // 改为 en-US
  interimResults: true,
  continuous: true,
  maxDuration: 0,
})
```
