# Whisper 语音识别集成

## 概述

Mat Terminal 现在使用 [OpenAI Whisper](https://github.com/openai/whisper) 进行跨平台语音识别，替代了之前的 macOS Speech Framework。

## 主要特性

- ✅ **跨平台支持**: 在 macOS、Windows、Linux 上都能工作
- ✅ **离线运行**: 不需要网络连接，完全本地处理
- ✅ **多语言支持**: 支持中文、英文、日文等多种语言
- ✅ **实时转录**: 每 3 秒处理一次音频块，提供近实时的语音识别

## 架构

### 技术栈
- **whisper-rs**: Rust 版本的 Whisper 绑定
- **cpal**: 跨平台音频捕获库
- **whisper.cpp**: C++ 实现的 Whisper，提供高性能推理

### 实现细节
- 使用 `cpal` 从麦克风捕获音频
- 自动重采样到 16kHz（Whisper 要求）
- 将立体声转换为单声道
- 每 48000 个样本（3 秒@16kHz）进行一次转录
- 通过 Tauri 事件系统将结果发送到前端

## 安装和构建

### 1. 下载 Whisper 模型

```bash
cd frontend/src-tauri
./setup-whisper.sh
```

这将下载 `ggml-base.bin` 模型（141MB）到 `models/` 目录。

### 可用模型
- `ggml-tiny.bin` - 75MB - 最快但准确率较低
- `ggml-base.bin` - 141MB - **推荐** - 速度和准确率平衡
- `ggml-small.bin` - 466MB - 更好的准确率
- `ggml-medium.bin` - 1.5GB - 非常好的准确率
- `ggml-large.bin` - 2.9GB - 最佳准确率

下载其他模型：
```bash
curl -L "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin" -o "models/ggml-tiny.bin"
```

### 2. 构建项目

#### macOS (ARM/M-series)
```bash
# 使用 npm scripts（已配置环境变量）
pnpm tauri:dev
pnpm tauri:build

# 或手动设置环境变量
export WHISPER_DONT_GENERATE_BINDINGS=1
export WHISPER_NO_AVX=1
export WHISPER_NO_AVX2=1
export WHISPER_NO_FMA=1
export WHISPER_NO_F16C=1
cargo build
```

#### Windows/Linux
```bash
pnpm tauri:dev
pnpm tauri:build
```

## 使用方法

### 前端集成

语音识别会在检测到 Whisper 可用时自动启用：

```typescript
import { useSpeechRecognition } from '@/composables/use-speech-recognition'

const speech = useSpeechRecognition()

// 检查支持
await speech.checkSupport() // 会自动检测 Whisper

// 开始识别
speech.start()

// 停止识别
speech.stop()

// 监听结果
watch(() => speech.transcript.value, (text) => {
  console.log('识别结果:', text)
})
```

### Tauri 命令

```rust
// 检查 Whisper 是否可用（模型文件是否存在）
#[tauri::command]
pub async fn speech_check_availability() -> Result<bool, String>

// 开始语音识别
#[tauri::command]
pub async fn speech_start_recognition(
    app: tauri::AppHandle,
    language: Option<String>  // "zh", "en", "ja" 等
) -> Result<(), String>

// 停止语音识别
#[tauri::command]
pub async fn speech_stop_recognition(app: tauri::AppHandle) -> Result<(), String>

// 检查是否正在监听
#[tauri::command]
pub fn speech_is_listening() -> bool
```

### 事件

前端可以监听这些事件：

```typescript
import { listen } from '@tauri-apps/api/event'

// 语音识别结果
listen('speech-result', (event) => {
  const { text, is_final } = event.payload
  if (is_final) {
    console.log('最终结果:', text)
  } else {
    console.log('中间结果:', text)
  }
})

// 语音识别错误
listen('speech-error', (event) => {
  const { error, message } = event.payload
  console.error('错误:', error, message)
})
```

## 性能调优

### 模型选择
- **实时应用**: 使用 `tiny` 或 `base`
- **准确率优先**: 使用 `small` 或 `medium`
- **最佳质量**: 使用 `large`（需要更多 RAM 和 CPU）

### 音频处理
当前配置：
- 采样率: 16kHz
- 通道: 单声道
- 块大小: 3 秒（48000 样本）

可以在 `whisper.rs` 中调整这些参数：

```rust
// 调整块大小（当前 48000 = 3 秒）
if state.audio_buffer.len() >= 48000 {
    // ...
}
```

## 故障排除

### 模型未找到
错误: "Whisper model not found"

解决方案:
```bash
cd frontend/src-tauri
./setup-whisper.sh
```

### ARM Mac 编译错误
错误: "unsupported option '-mavx' for target 'arm64-apple-macosx'"

解决方案: 确保使用了正确的环境变量
```bash
export WHISPER_NO_AVX=1
export WHISPER_NO_AVX2=1
export WHISPER_NO_FMA=1
export WHISPER_NO_F16C=1
```

### 麦克风权限
macOS 会自动请求麦克风权限。如果被拒绝：
1. 打开"系统设置" > "隐私与安全性" > "麦克风"
2. 确保 Mat 已启用

### 识别质量问题
1. 尝试更大的模型（base → small → medium）
2. 确保麦克风质量良好
3. 减少背景噪音
4. 调整语言设置（zh、en、ja 等）

## 与旧实现的对比

| 特性 | macOS Speech Framework | Whisper |
|------|----------------------|---------|
| 平台支持 | 仅 macOS | 跨平台 |
| 网络依赖 | 需要（部分功能） | 不需要 |
| 多语言 | 有限 | 100+ 语言 |
| 准确率 | 中等 | 高 |
| 实时性 | 高 | 中等（3秒延迟） |
| 模型大小 | N/A | 75MB - 2.9GB |

## 开发和调试

### 启用详细日志
```rust
// 在 whisper.rs 中已有详细的 println! 日志
println!("[Whisper] Loading model from {:?}", model_path);
println!("[Whisper] Transcribed: {}", text);
```

### 测试语音识别
1. 启动应用: `pnpm tauri:dev`
2. 点击工具栏的麦克风图标
3. 说话并观察控制台输出
4. 检查识别结果是否正确

## 相关资源

- [whisper.cpp](https://github.com/ggerganov/whisper.cpp) - C++ 实现
- [whisper-rs](https://github.com/tazz4843/whisper-rs) - Rust 绑定
- [OpenAI Whisper](https://github.com/openai/whisper) - 原始 Python 实现
- [Whisper 模型](https://huggingface.co/ggerganov/whisper.cpp) - 预训练模型下载

## 许可证

Whisper 使用 MIT 许可证。模型权重使用 Apache 2.0 许可证。
