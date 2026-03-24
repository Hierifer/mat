# Mat Terminal - 自动更新功能设计方案

## 📋 设计目标

为 Mat 终端模拟器实现安全、可靠、用户友好的自动更新系统，支持：
- 自动检测新版本
- 安全的更新包下载和验证
- 平滑的用户体验
- 跨平台支持（macOS、Windows、Linux）

## 🏗️ 技术方案

### 1. 核心技术栈

- **更新插件**: `tauri-plugin-updater` (Tauri v2 官方插件)
- **更新源**: GitHub Releases
- **签名验证**: Ed25519 数字签名
- **更新清单**: JSON 格式的版本信息文件

### 2. 架构设计

```
┌─────────────────────────────────────────────────────────┐
│                    Mat Application                       │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────┐         ┌─────────────────┐          │
│  │   Startup    │────────>│ Check for       │          │
│  │   Hook       │         │ Updates         │          │
│  └──────────────┘         └────────┬────────┘          │
│                                    │                     │
│                                    ▼                     │
│                          ┌─────────────────┐            │
│                          │ GitHub Releases │            │
│                          │  (latest.json)  │            │
│                          └────────┬────────┘            │
│                                    │                     │
│                          ┌─────────▼────────┐           │
│                          │ Version Compare  │           │
│                          └────────┬─────────┘           │
│                                   │                      │
│                    ┌──────────────┴───────────────┐     │
│                    │                              │     │
│              ┌─────▼──────┐              ┌───────▼────┐│
│              │ No Update  │              │ New Version││
│              │  Available │              │  Available ││
│              └────────────┘              └──────┬─────┘│
│                                                  │      │
│                                         ┌────────▼─────┐│
│                                         │ Show Update  ││
│                                         │   Dialog     ││
│                                         └──────┬───────┘│
│                                                │        │
│                                    ┌───────────┴────┐  │
│                                    │                │  │
│                            ┌───────▼─────┐  ┌──────▼──┐│
│                            │   Skip      │  │Download ││
│                            │   Update    │  │  Update ││
│                            └─────────────┘  └────┬────┘│
│                                                   │     │
│                                          ┌────────▼────┐│
│                                          │   Verify    ││
│                                          │  Signature  ││
│                                          └──────┬──────┘│
│                                                 │       │
│                                          ┌──────▼──────┐│
│                                          │   Install   ││
│                                          │   & Restart ││
│                                          └─────────────┘│
└─────────────────────────────────────────────────────────┘
```

## 📦 实现步骤

### Phase 1: 基础配置 (Day 1)

#### 1.1 生成签名密钥对
```bash
# 生成密钥对
pnpm tauri signer generate -w ~/.tauri/mat.key

# 输出：
# - 私钥: ~/.tauri/mat.key (用于签名，保密)
# - 公钥: 配置在 tauri.conf.json (用于验证)
```

#### 1.2 安装依赖
```bash
# 添加 updater 插件
cd frontend/src-tauri
cargo add tauri-plugin-updater
```

#### 1.3 配置 tauri.conf.json
```json
{
  "bundle": {
    "active": true,
    "createUpdaterArtifacts": true,
    "updater": {
      "active": true,
      "endpoints": [
        "https://github.com/Hierifer/mat/releases/latest/download/latest.json"
      ],
      "dialog": false,
      "pubkey": "YOUR_PUBLIC_KEY_HERE"
    }
  }
}
```

#### 1.4 配置权限 (capabilities)
```json
// src-tauri/capabilities/default.json
{
  "permissions": [
    "updater:default",
    "updater:allow-check",
    "updater:allow-download",
    "updater:allow-install"
  ]
}
```

### Phase 2: 后端实现 (Day 2)

#### 2.1 集成 Updater 插件
```rust
// src-tauri/src/lib.rs
use tauri_plugin_updater::UpdaterExt;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        // ... 其他配置
}
```

#### 2.2 创建更新检查命令
```rust
// src-tauri/src/updater/mod.rs
use tauri::{Manager, AppHandle};
use tauri_plugin_updater::UpdaterExt;

#[tauri::command]
pub async fn check_for_updates(app: AppHandle) -> Result<Option<UpdateInfo>, String> {
    match app.updater().check().await {
        Ok(Some(update)) => {
            Ok(Some(UpdateInfo {
                version: update.version,
                date: update.date,
                body: update.body,
            }))
        }
        Ok(None) => Ok(None),
        Err(e) => Err(format!("Failed to check for updates: {}", e)),
    }
}

#[derive(serde::Serialize)]
pub struct UpdateInfo {
    pub version: String,
    pub date: Option<String>,
    pub body: Option<String>,
}
```

### Phase 3: 前端实现 (Day 3)

#### 3.1 创建更新管理 Composable
```typescript
// src/composables/use-updater.ts
import { ref } from 'vue'
import { check } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'

export interface UpdateInfo {
  version: string
  date?: string
  body?: string
}

export function useUpdater() {
  const isChecking = ref(false)
  const isDownloading = ref(false)
  const updateAvailable = ref(false)
  const updateInfo = ref<UpdateInfo | null>(null)
  const downloadProgress = ref(0)

  const checkForUpdates = async (showNoUpdateMessage = false) => {
    isChecking.value = true
    try {
      const update = await check()

      if (update) {
        updateAvailable.value = true
        updateInfo.value = {
          version: update.version,
          date: update.date,
          body: update.body,
        }
        return true
      } else {
        if (showNoUpdateMessage) {
          // 显示"已是最新版本"提示
        }
        return false
      }
    } catch (error) {
      console.error('Failed to check for updates:', error)
      throw error
    } finally {
      isChecking.value = false
    }
  }

  const downloadAndInstall = async () => {
    if (!updateInfo.value) return

    isDownloading.value = true
    try {
      const update = await check()
      if (!update) return

      // 下载并安装
      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case 'Started':
            downloadProgress.value = 0
            break
          case 'Progress':
            downloadProgress.value = (event.data.downloaded / event.data.contentLength) * 100
            break
          case 'Finished':
            downloadProgress.value = 100
            break
        }
      })

      // 重启应用
      await relaunch()
    } catch (error) {
      console.error('Failed to download and install update:', error)
      throw error
    } finally {
      isDownloading.value = false
    }
  }

  return {
    isChecking,
    isDownloading,
    updateAvailable,
    updateInfo,
    downloadProgress,
    checkForUpdates,
    downloadAndInstall,
  }
}
```

#### 3.2 创建更新对话框组件
```vue
<!-- src/components/updater/update-dialog.vue -->
<script setup lang="ts">
import { useUpdater } from '@/composables/use-updater'

const {
  updateInfo,
  isDownloading,
  downloadProgress,
  downloadAndInstall,
} = useUpdater()

const emit = defineEmits(['close'])

const handleUpdate = async () => {
  try {
    await downloadAndInstall()
  } catch (error) {
    // 显示错误提示
  }
}
</script>

<template>
  <div class="update-dialog-overlay">
    <div class="update-dialog">
      <h2>🎉 新版本可用</h2>

      <div class="update-info">
        <p class="version">版本 {{ updateInfo?.version }}</p>
        <p class="date" v-if="updateInfo?.date">
          发布日期: {{ updateInfo.date }}
        </p>

        <div class="release-notes" v-if="updateInfo?.body">
          <h3>更新内容:</h3>
          <div v-html="updateInfo.body"></div>
        </div>
      </div>

      <div v-if="isDownloading" class="download-progress">
        <div class="progress-bar">
          <div
            class="progress-fill"
            :style="{ width: `${downloadProgress}%` }"
          ></div>
        </div>
        <p>下载中... {{ downloadProgress.toFixed(0) }}%</p>
      </div>

      <div class="actions">
        <button
          @click="emit('close')"
          :disabled="isDownloading"
          class="btn-secondary"
        >
          稍后提醒
        </button>
        <button
          @click="handleUpdate"
          :disabled="isDownloading"
          class="btn-primary"
        >
          {{ isDownloading ? '下载中...' : '立即更新' }}
        </button>
      </div>
    </div>
  </div>
</template>
```

#### 3.3 集成到应用主入口
```vue
<!-- src/App.vue -->
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useUpdater } from '@/composables/use-updater'
import UpdateDialog from '@/components/updater/update-dialog.vue'

const { updateAvailable, checkForUpdates } = useUpdater()
const showUpdateDialog = ref(false)

onMounted(async () => {
  // 启动时检查更新（延迟3秒，避免影响启动速度）
  setTimeout(async () => {
    const hasUpdate = await checkForUpdates()
    if (hasUpdate) {
      showUpdateDialog.value = true
    }
  }, 3000)
})
</script>

<template>
  <!-- 现有内容 -->

  <!-- 更新对话框 -->
  <update-dialog
    v-if="showUpdateDialog"
    @close="showUpdateDialog = false"
  />
</template>
```

#### 3.4 添加手动检查更新菜单项
```rust
// 在菜单中添加"检查更新"选项
let mat_menu = SubmenuBuilder::new(app, "Mat")
    .text("about", "About Mat")
    .separator()
    .text("check_updates", "Check for Updates...")
    .text("settings", "Settings...")
    // ...
```

### Phase 4: CI/CD 配置 (Day 4)

#### 4.1 配置 GitHub Actions 自动发布
```yaml
# .github/workflows/release.yml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    strategy:
      matrix:
        platform: [macos-latest, ubuntu-latest, windows-latest]
    runs-on: ${{ matrix.platform }}

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install Rust
        uses: dtolnay/rust-toolchain@stable

      - name: Install dependencies
        run: npm install
        working-directory: ./frontend

      - name: Build and sign
        env:
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
        run: npm run tauri build
        working-directory: ./frontend

      - name: Upload Release Assets
        uses: softprops/action-gh-release@v1
        with:
          files: |
            frontend/src-tauri/target/release/bundle/**/*.dmg
            frontend/src-tauri/target/release/bundle/**/*.app.tar.gz
            frontend/src-tauri/target/release/bundle/**/*.msi
            frontend/src-tauri/target/release/bundle/**/*.AppImage
            frontend/src-tauri/target/release/bundle/**/*.deb
            frontend/src-tauri/target/release/bundle/**/*.sig
```

#### 4.2 设置 GitHub Secrets
在 GitHub 仓库设置中添加：
- `TAURI_SIGNING_PRIVATE_KEY`: 私钥内容
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: 私钥密码

## 🎨 用户体验设计

### 更新检查时机
1. **应用启动**: 延迟 3 秒后自动检查
2. **手动触发**: 菜单 "Mat → Check for Updates..."
3. **定期检查**: 每 24 小时自动检查一次

### 更新提示策略
1. **有更新**: 显示对话框，展示版本信息和更新内容
2. **无更新**:
   - 启动时检查：静默（不打扰用户）
   - 手动检查：显示"已是最新版本"提示
3. **检查失败**: 静默处理，记录日志

### 更新过程
1. **下载**: 显示进度条
2. **验证**: 自动验证签名（失败则终止）
3. **安装**: 自动安装并重启应用

## 🔒 安全性考虑

1. **签名验证**: 所有更新包必须通过 Ed25519 签名验证
2. **HTTPS**: 仅通过 HTTPS 下载更新
3. **密钥管理**:
   - 私钥仅存储在 CI/CD secrets 中
   - 公钥内嵌在应用配置中
4. **更新来源**: 仅从 GitHub Releases 获取更新

## 📊 监控和日志

```typescript
// 记录更新事件
const logUpdateEvent = (event: string, data?: any) => {
  console.log(`[Updater] ${event}`, data)
  // 可以发送到分析服务
}

// 使用示例
logUpdateEvent('check_started')
logUpdateEvent('update_available', { version: '0.1.19' })
logUpdateEvent('download_started')
logUpdateEvent('download_completed')
logUpdateEvent('install_started')
```

## 🧪 测试计划

### 测试场景
1. ✅ 检测到新版本
2. ✅ 已是最新版本
3. ✅ 网络错误处理
4. ✅ 签名验证失败
5. ✅ 下载中断恢复
6. ✅ 安装过程中断
7. ✅ 跨版本更新（跳过多个版本）
8. ✅ 降级保护

### 测试环境
- macOS (Intel & Apple Silicon)
- Windows 10/11
- Ubuntu 20.04/22.04

## 📝 发布流程

1. **代码准备**
   ```bash
   # 更新版本号
   npm version patch  # 或 minor, major
   git push && git push --tags
   ```

2. **GitHub Actions 自动构建**
   - 自动触发 CI/CD
   - 编译各平台安装包
   - 生成签名文件
   - 创建 latest.json

3. **发布到 GitHub Releases**
   - 上传安装包
   - 上传签名文件
   - 上传 latest.json
   - 填写 Release Notes

4. **用户接收更新**
   - 应用自动检测新版本
   - 提示用户更新
   - 一键下载安装

## 📚 参考资源

- [Tauri Updater Plugin](https://v2.tauri.app/plugin/updater/)
- [Tauri v2 Auto-Update Guide](https://docs.crabnebula.dev/cloud/guides/auto-updates-tauri/)
- [GitHub Actions for Tauri](https://tauri.app/v1/guides/building/cross-platform)
- [Tauri Signing Guide](https://tauri.app/v1/guides/distribution/sign-windows)

## 🎯 时间线

- **Day 1**: 基础配置和密钥生成 ✅
- **Day 2**: 后端集成和命令实现 ✅
- **Day 3**: 前端 UI 和用户体验 ✅
- **Day 4**: CI/CD 配置和自动化 ✅
- **Day 5**: 测试和优化 ⏳
- **Day 6**: 文档和发布 ⏳

## ✨ 未来增强

1. **增量更新**: 仅下载差异部分，减少流量
2. **多渠道支持**: 支持 Beta/Stable 不同更新通道
3. **回滚功能**: 更新出错时自动回滚
4. **更新统计**: 收集更新成功率等数据
5. **自定义更新服务器**: 企业内网部署
