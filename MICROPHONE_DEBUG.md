# 麦克风诊断指南

## 问题症状

如果看到 `RMS: 0.0000`，说明麦克风没有捕获到任何音频。

## 快速诊断

### 1. 测试麦克风

在浏览器控制台运行：

```javascript
// 列出所有音频设备
await invoke('speech_list_devices')

// 测试麦克风（录制 2 秒）
await invoke('speech_test_microphone')
```

或者在 Rust 代码中添加调试按钮调用这些命令。

### 2. 检查系统权限

#### macOS

**步骤**：
1. 打开 **系统设置**
2. 进入 **隐私与安全性**
3. 点击 **麦克风**
4. 确保 **Mat** 已启用 ✅

**命令行检查**：
```bash
# 重置麦克风权限（需要重新授权）
tccutil reset Microphone com.hierifer.mat

# 查看权限数据库
sqlite3 ~/Library/Application\ Support/com.apple.TCC/TCC.db \
  "SELECT * FROM access WHERE service='kTCCServiceMicrophone'"
```

#### 常见问题

**Q: 权限列表中没有 Mat**
- A: 应用从未请求过权限，重新启动应用并点击麦克风按钮

**Q: 权限已启用但仍然 RMS 0.0000**
- A: 检查下面的硬件和系统设置

### 3. 检查硬件设置

#### macOS 音频设置

1. 打开 **系统设置** > **声音** > **输入**
2. 选择正确的输入设备（通常是 "MacBook Pro 麦克风"）
3. 对着麦克风说话，查看**输入电平**是否有波动
4. 如果没有波动 → 硬件或系统级别的问题

#### 测试系统麦克风

```bash
# 使用系统工具录音测试
rec -d test.wav trim 0 3

# 或使用 QuickTime Player
# 文件 > 新建音频录制
```

如果系统工具也录不到音频 → **不是应用的问题**

### 4. 常见解决方案

#### 方案 A: 重启音频服务

```bash
# 杀掉并重启 CoreAudio
sudo killall coreaudiod
```

#### 方案 B: 重置 NVRAM/PRAM

1. 关机
2. 开机时立即按住 **Command + Option + P + R**
3. 听到两次启动音后松开

#### 方案 C: 检查 Do Not Disturb

- macOS 专注模式可能会阻止音频输入
- 关闭 **专注模式** 或 **勿扰模式**

#### 方案 D: 检查其他应用

某些应用可能独占麦克风：
```bash
# 查看正在使用麦克风的进程
lsof | grep -i audio

# 或使用活动监视器查看
```

### 5. 代码级别诊断

#### 添加详细日志

在 `whisper.rs` 的 `capture_audio` 函数中已有详细日志：

```rust
println!("[Whisper] Using input device: {}", device.name());
println!("[Whisper] Audio format: {:?}", config);
println!("[Whisper] Audio capture started");
```

#### 调整静音阈值

如果麦克风音量太低：

```rust
// 在 whisper.rs 中修改
const SILENCE_THRESHOLD: f32 = 0.001;  // 降低阈值（默认 0.01）
```

#### 禁用 VAD 测试

临时禁用语音活动检测来排查问题：

```rust
fn has_speech_activity(audio_data: &[f32]) -> bool {
    // 临时直接返回 true
    return true;  // ← 添加这行

    // ... 其他代码
}
```

这样可以看到 Whisper 是否能接收到数据。

## 诊断流程图

```
RMS 0.0000
    ↓
系统麦克风能录音吗？
    ├─ 否 → 硬件/系统问题
    │       - 检查硬件连接
    │       - 重启 coreaudiod
    │       - 重置 NVRAM
    │
    └─ 是 → 应用权限问题
            ↓
        Mat 有麦克风权限吗？
            ├─ 否 → 授予权限
            │       - 系统设置 > 隐私 > 麦克风
            │       - 重启应用
            │
            └─ 是 → cpal 设备问题
                    ↓
                列出设备能看到麦克风吗？
                    ├─ 否 → cpal 兼容性问题
                    │       - 检查 macOS 版本
                    │       - 尝试其他音频库
                    │
                    └─ 是 → 音频流问题
                            - 检查日志中的错误
                            - 测试不同采样率
                            - 禁用 VAD 测试
```

## 已知问题

### macOS Ventura+ 权限

某些版本的 macOS 对沙盒应用有严格限制：

**解决方案**：在 `Info.plist` 中确保有：
```xml
<key>NSMicrophoneUsageDescription</key>
<string>Mat Terminal needs access to your microphone for voice-to-text input functionality.</string>
```

### M1/M2 Mac 音频问题

Apple Silicon Mac 有时需要特殊处理：

```rust
// 使用 CoreAudio 而不是 cpal（如果需要）
#[cfg(target_os = "macos")]
use coreaudio;
```

### 蓝牙耳机麦克风

蓝牙设备可能有延迟或兼容性问题：
- 优先使用内置麦克风测试
- 检查蓝牙设备是否正确连接

## 测试命令总结

```javascript
// 1. 检查 Whisper 模型
await invoke('speech_check_availability')

// 2. 列出音频设备
const devices = await invoke('speech_list_devices')
console.log(devices)

// 3. 测试麦克风（录制 2 秒）
const result = await invoke('speech_test_microphone')
console.log(result)

// 4. 开始识别
await invoke('speech_start_recognition', { language: 'zh' })

// 5. 停止识别
await invoke('speech_stop_recognition')
```

## 预期输出

### 正常工作

```
[Whisper] Using input device: MacBook Pro麦克风
[Whisper] Audio format: SampleRate(44100), F32
[Whisper] Audio capture started
[Whisper] Processing chunk #1 (48000 samples, RMS: 0.0234)
[Whisper] ✓ Transcribed: '你好'
```

### 权限问题

```
[Whisper] Using input device: MacBook Pro麦克风
[Whisper] Audio format: SampleRate(44100), F32
[Whisper] Audio capture started
[Whisper] Processing chunk #1 (48000 samples, RMS: 0.0000)  ← 一直是 0
[Whisper] ○ No speech detected (silent or filtered)
```

### 设备问题

```
Error: No input device available
```

或

```
Error: Failed to get default input config: DeviceNotAvailable
```

## 下一步

1. **运行麦克风测试命令**
2. **检查系统权限**
3. **测试系统麦克风（QuickTime）**
4. **查看详细日志**
5. **如果都不行，提供日志给开发者**

## 临时解决方案

如果无法修复麦克风，可以临时使用：

### 方案 1: 使用 Web Speech API

如果浏览器支持，可以回退到浏览器的语音识别（需要网络）。

### 方案 2: 使用外部工具

```bash
# 使用系统语音识别
say "你说的话" | pbcopy  # macOS 自带 TTS

# 使用 OpenAI Whisper CLI
whisper audio.wav --language zh
```

### 方案 3: 文本输入

暂时使用普通键盘输入，等修复后再使用语音功能。
