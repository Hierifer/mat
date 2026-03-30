# macOS 麦克风权限设置指南

## 问题：没有权限对话框

如果点击麦克风按钮后没有看到系统权限对话框，需要手动授权。

## 解决方案

### 方法 1: 手动授权（推荐）

#### 步骤 1: 打开系统设置

```bash
# 方式 A: 命令行直达
open "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone"

# 方式 B: 手动打开
# 系统设置 → 隐私与安全性 → 麦克风
```

#### 步骤 2: 添加 Mat 应用

1. 查看**麦克风**权限列表
2. 如果看到 **Mat**：
   - ✅ 启用复选框
   - 🔄 重启 Mat 应用
3. 如果**没有看到 Mat**：
   - 这说明应用从未触发权限请求
   - 继续到方法 2

### 方法 2: 强制触发权限对话框

#### 使用 tccutil 重置权限

```bash
# 1. 重置 Mat 的麦克风权限
tccutil reset Microphone com.hierifer.mat

# 2. 重启 Mat 应用
# 这会让系统重新询问权限
```

#### 验证应用 Bundle ID

```bash
# 检查 Mat 的 Bundle ID
cd /Users/hierifer/Desktop/mat/frontend/src-tauri
grep "identifier" tauri.conf.json
# 应该显示: "identifier": "com.hierifer.mat"
```

### 方法 3: 使用 QuickTime 测试

#### 确认麦克风硬件正常

1. 打开 **QuickTime Player**
2. 选择 **文件 > 新建音频录制**
3. 说话测试
4. 如果能录音 ✅ → 硬件正常，是权限问题
5. 如果不能录音 ❌ → 硬件或系统问题

### 方法 4: 开发者模式测试

#### 使用诊断命令

在浏览器控制台运行：

```javascript
// 1. 测试麦克风（会尝试录制 2 秒）
const result = await window.__TAURI_INTERNALS__.invoke('speech_test_microphone')
console.log(result)

// 预期：如果没有权限，会显示错误
// 如果有权限，会显示音频统计信息
```

## 权限检查清单

### ✓ 检查项目

- [ ] **系统设置中有麦克风选项**
  - 如果没有 → macOS 版本太旧或不支持

- [ ] **Mat 出现在麦克风列表中**
  - 如果没有 → 应用从未请求权限
  - 解决: `tccutil reset` 然后重启

- [ ] **Mat 的麦克风权限已启用** ✅
  - 如果禁用 → 手动启用
  - 如果受限 → 检查家长控制/企业策略

- [ ] **其他应用有麦克风权限**
  - 如果都没有 → 系统级问题
  - 检查"勿扰模式"或"专注模式"

- [ ] **麦克风硬件工作正常**
  - 使用 QuickTime 测试
  - 检查输入电平

## 调试步骤

### 1. 查看日志

运行应用并查看终端输出：

```
[Whisper] Starting recognition...
[Whisper] Permission check (passive mode)
[Whisper] Initializing audio capture...
[Whisper] Note: On macOS, a permission dialog may appear on first use
[Whisper] Using input device: MacBook Pro麦克风
[Whisper] Audio capture started
```

### 2. 诊断错误

#### 错误 A: `No input device available`
```
找不到音频输入设备。

可能原因：
1. 没有麦克风硬件
2. 麦克风被系统禁用
3. 权限被拒绝
```

**解决**: 检查系统设置 > 麦克风权限

#### 错误 B: `Failed to get default input config`
```
无法获取音频配置: BackendSpecificError

可能是麦克风权限被拒绝。
```

**解决**: 授予麦克风权限并重启

#### 错误 C: `Failed to build input stream`
```
无法创建音频流: DeviceNotAvailable

这通常意味着麦克风权限被拒绝。
```

**解决**:
1. 系统设置 > 隐私 > 麦克风 > 启用 Mat
2. 重启应用

### 3. RMS 检查

运行后查看音频电平：

```
[Whisper] Processing chunk #1 (48000 samples, RMS: 0.0234)  ✅ 有声音
[Whisper] Processing chunk #1 (48000 samples, RMS: 0.0000)  ❌ 静音
```

- RMS > 0.01: 麦克风正常工作 ✅
- RMS = 0.0000: 权限问题或硬件静音 ❌

## 高级故障排除

### 数据库级别检查

查看 TCC 权限数据库（需要完全磁盘访问权限）：

```bash
# 查询 Mat 的权限状态
sqlite3 ~/Library/Application\ Support/com.apple.TCC/TCC.db \
  "SELECT service, client, auth_value, auth_reason
   FROM access
   WHERE service='kTCCServiceMicrophone'
   AND client LIKE '%mat%';"

# auth_value:
# 0 = 拒绝
# 1 = 未知
# 2 = 已授权
# 3 = 受限
```

### 重置所有 TCC 权限

```bash
# 警告：这会重置所有应用的所有权限
tccutil reset All

# 更安全：只重置麦克风权限
tccutil reset Microphone
```

### 检查沙盒配置

查看应用的沙盒权限：

```bash
cd /Users/hierifer/Desktop/mat/frontend/src-tauri
cat Info.plist

# 确保包含：
# <key>NSMicrophoneUsageDescription</key>
# <string>Mat Terminal needs access to your microphone...</string>
```

### 强制重新签名应用

```bash
# 有时需要重新签名才能触发权限请求
cd /Applications
codesign --force --deep --sign - Mat.app
```

## 常见场景

### 场景 1: 首次安装

**预期行为**:
1. 点击麦克风按钮
2. 系统显示权限对话框
3. 点击"好"授权
4. 开始录音

**如果没有对话框**:
→ 使用方法 1 手动授权

### 场景 2: 曾经拒绝过

**现象**: 点击按钮没反应，日志显示权限错误

**解决**:
1. 系统设置 > 隐私 > 麦克风
2. 找到 Mat，启用
3. 重启应用

### 场景 3: 开发版本

**问题**: 开发版和发布版使用不同的 Bundle ID

**解决**:
- 开发版: 通常是 `com.hierifer.mat.dev` 或类似
- 发布版: `com.hierifer.mat`
- 两者需要分别授权

### 场景 4: 蓝牙耳机

**问题**: 使用蓝牙耳机时麦克风不工作

**解决**:
1. 系统设置 > 声音 > 输入
2. 选择蓝牙设备为输入源
3. 确保蓝牙已连接

## 验证成功

成功配置后应该看到：

```
[Whisper] Starting recognition...
[Whisper] Permission check passed
[Whisper] Audio capture started
[Whisper] Processing chunk #1 (48000 samples, RMS: 0.0234)
[Whisper] ✓ Transcribed: '你好'
```

- ✅ RMS > 0（有声音）
- ✅ 能识别文字
- ✅ 实时显示结果

## 自动化脚本

### 一键检查和修复

```bash
#!/bin/bash
# check-mic-permission.sh

echo "🔍 检查麦克风权限..."

# 1. 检查 Bundle ID
BUNDLE_ID="com.hierifer.mat"
echo "Bundle ID: $BUNDLE_ID"

# 2. 重置权限
echo "重置权限..."
tccutil reset Microphone $BUNDLE_ID

# 3. 打开系统设置
echo "打开系统设置..."
open "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone"

echo ""
echo "✅ 请在系统设置中："
echo "   1. 找到 Mat"
echo "   2. 启用麦克风权限"
echo "   3. 重启 Mat 应用"
```

### 使用方法

```bash
chmod +x check-mic-permission.sh
./check-mic-permission.sh
```

## 总结

**最简单的解决方案**:

1. **打开系统设置**
   ```bash
   open "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone"
   ```

2. **找到 Mat 并启用** ✅

3. **重启应用**

4. **测试麦克风** 🎤

如果还是不行，请提供完整的日志输出！
