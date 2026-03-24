# Mat Terminal - 自动更新快速实施指南

## 🚀 快速开始（5 步搞定）

### Step 1: 生成签名密钥 (1 分钟)

```bash
# 生成密钥对
cd frontend
pnpm tauri signer generate -w ~/.tauri/mat.key

# 保存输出的公钥，后面会用到
# 输出类似: dW50cnVzdGVkIGNvbW1lbnQ6IG1pbml...
```

**⚠️ 重要**:
- 私钥文件 `~/.tauri/mat.key` **绝对不能泄露或提交到 Git**
- 公钥需要配置到 `tauri.conf.json`

---

### Step 2: 安装依赖 (1 分钟)

```bash
cd frontend/src-tauri
cargo add tauri-plugin-updater
```

---

### Step 3: 配置文件 (5 分钟)

#### 3.1 修改 `frontend/src-tauri/tauri.conf.json`

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
      "pubkey": "YOUR_PUBLIC_KEY_HERE"  // 替换为 Step 1 生成的公钥
    }
  }
}
```

#### 3.2 创建 `frontend/src-tauri/capabilities/updater.json`

```json
{
  "identifier": "updater",
  "description": "Capability for the updater",
  "windows": ["main"],
  "permissions": [
    "updater:default",
    "updater:allow-check",
    "updater:allow-download",
    "updater:allow-install",
    "updater:allow-download-and-install"
  ]
}
```

#### 3.3 更新 `frontend/src-tauri/capabilities/default.json`

在 `capabilities` 数组中添加 `"updater"`：

```json
{
  "permissions": [...],
  "capabilities": ["default", "updater"]
}
```

---

### Step 4: 后端代码 (10 分钟)

#### 4.1 修改 `frontend/src-tauri/src/lib.rs`

```rust
// 在文件开头添加
use tauri_plugin_updater::UpdaterExt;

pub fn run() {
    tauri::Builder::default()
        // 添加 updater 插件
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        // ... 其他配置
}
```

#### 4.2 在菜单中添加"检查更新"选项

```rust
let mat_menu = SubmenuBuilder::new(app, "Mat")
    .text("about", "About Mat")
    .separator()
    .text("check_updates", "Check for Updates...")  // 新增
    .text("settings", "Settings...")
    .separator()
    .hide()
    .quit()
    .build()?;
```

#### 4.3 添加菜单事件处理

```rust
app.on_menu_event(move |app_handle, event| {
    match event.id().0.as_str() {
        "check_updates" => {
            if let Some(window) = app_handle.get_webview_window("main") {
                let _ = window.emit("menu:check-updates", ());
            }
        }
        // ... 其他事件
    }
});
```

---

### Step 5: 前端代码 (20 分钟)

#### 5.1 安装前端依赖

```bash
cd frontend
pnpm add @tauri-apps/plugin-updater @tauri-apps/plugin-process
```

#### 5.2 创建 `frontend/src/composables/use-updater.ts`

```typescript
import { ref } from 'vue'
import { check } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'

export function useUpdater() {
  const updateAvailable = ref(false)
  const updateInfo = ref<any>(null)
  const isChecking = ref(false)
  const isDownloading = ref(false)
  const downloadProgress = ref(0)

  const checkForUpdates = async () => {
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
      }
      return false
    } catch (error) {
      console.error('Update check failed:', error)
      return false
    } finally {
      isChecking.value = false
    }
  }

  const downloadAndInstall = async () => {
    const update = await check()
    if (!update) return

    isDownloading.value = true
    try {
      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case 'Started':
            downloadProgress.value = 0
            break
          case 'Progress':
            downloadProgress.value = Math.round(
              (event.data.downloaded / event.data.contentLength) * 100
            )
            break
          case 'Finished':
            downloadProgress.value = 100
            break
        }
      })

      await relaunch()
    } catch (error) {
      console.error('Update failed:', error)
      throw error
    } finally {
      isDownloading.value = false
    }
  }

  return {
    updateAvailable,
    updateInfo,
    isChecking,
    isDownloading,
    downloadProgress,
    checkForUpdates,
    downloadAndInstall,
  }
}
```

#### 5.3 创建更新对话框 `frontend/src/components/updater/update-dialog.vue`

```vue
<script setup lang="ts">
import { useUpdater } from '@/composables/use-updater'

const props = defineProps<{
  updateInfo: any
}>()

const emit = defineEmits(['close', 'update'])

const { isDownloading, downloadProgress, downloadAndInstall } = useUpdater()

const handleUpdate = async () => {
  try {
    await downloadAndInstall()
  } catch (error) {
    alert('更新失败，请稍后重试')
  }
}
</script>

<template>
  <div class="update-overlay" @click.self="emit('close')">
    <div class="update-dialog">
      <div class="update-header">
        <h2>🎉 新版本可用</h2>
        <button class="close-btn" @click="emit('close')">✕</button>
      </div>

      <div class="update-content">
        <div class="version-info">
          <p class="version">版本 {{ updateInfo.version }}</p>
          <p v-if="updateInfo.date" class="date">{{ updateInfo.date }}</p>
        </div>

        <div v-if="updateInfo.body" class="release-notes">
          <h3>更新内容</h3>
          <div class="notes-content" v-html="updateInfo.body"></div>
        </div>

        <div v-if="isDownloading" class="progress-section">
          <div class="progress-bar">
            <div
              class="progress-fill"
              :style="{ width: `${downloadProgress}%` }"
            ></div>
          </div>
          <p class="progress-text">下载中... {{ downloadProgress }}%</p>
        </div>
      </div>

      <div class="update-actions">
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

<style scoped>
.update-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 2000;
  backdrop-filter: blur(3px);
}

.update-dialog {
  width: 500px;
  max-height: 80vh;
  background: #252526;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
  border: 1px solid #3e3e42;
  overflow: hidden;
}

.update-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid #3e3e42;
  background: linear-gradient(135deg, #1e1e1e 0%, #2d2d30 100%);
}

.update-header h2 {
  margin: 0;
  font-size: 20px;
  color: #fff;
}

.close-btn {
  background: none;
  border: none;
  color: #ccc;
  font-size: 20px;
  cursor: pointer;
  width: 32px;
  height: 32px;
  border-radius: 4px;
  transition: all 0.2s;
}

.close-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.update-content {
  padding: 24px;
  max-height: 400px;
  overflow-y: auto;
}

.version-info {
  margin-bottom: 20px;
}

.version {
  font-size: 24px;
  font-weight: 600;
  color: #0078d4;
  margin: 0 0 8px 0;
}

.date {
  font-size: 14px;
  color: #999;
  margin: 0;
}

.release-notes h3 {
  font-size: 16px;
  color: #e7e7e7;
  margin: 0 0 12px 0;
}

.notes-content {
  color: #ccc;
  font-size: 14px;
  line-height: 1.6;
}

.progress-section {
  margin-top: 20px;
}

.progress-bar {
  height: 8px;
  background: #3e3e42;
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 8px;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #0078d4, #00bcf2);
  transition: width 0.3s ease;
}

.progress-text {
  text-align: center;
  color: #0078d4;
  font-size: 14px;
  font-weight: 500;
  margin: 0;
}

.update-actions {
  display: flex;
  gap: 12px;
  padding: 20px 24px;
  border-top: 1px solid #3e3e42;
  background: #1e1e1e;
}

.btn-secondary,
.btn-primary {
  flex: 1;
  padding: 10px 20px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-secondary {
  background: #3e3e42;
  color: #ccc;
}

.btn-secondary:hover:not(:disabled) {
  background: #4e4e52;
}

.btn-primary {
  background: #0078d4;
  color: #fff;
}

.btn-primary:hover:not(:disabled) {
  background: #006cbd;
}

.btn-secondary:disabled,
.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
```

#### 5.4 在 `frontend/src/App.vue` 中集成

```vue
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useUpdater } from '@/composables/use-updater'
import { listen } from '@tauri-apps/api/event'
import UpdateDialog from '@/components/updater/update-dialog.vue'

const { updateInfo, checkForUpdates } = useUpdater()
const showUpdateDialog = ref(false)

onMounted(async () => {
  // 启动 3 秒后自动检查更新
  setTimeout(async () => {
    const hasUpdate = await checkForUpdates()
    if (hasUpdate) {
      showUpdateDialog.value = true
    }
  }, 3000)

  // 监听手动检查更新
  await listen('menu:check-updates', async () => {
    const hasUpdate = await checkForUpdates()
    if (hasUpdate) {
      showUpdateDialog.value = true
    } else {
      // 显示"已是最新版本"提示
      alert('您已经在使用最新版本！')
    }
  })
})
</script>

<template>
  <!-- 现有内容 -->

  <!-- 更新对话框 -->
  <update-dialog
    v-if="showUpdateDialog && updateInfo"
    :update-info="updateInfo"
    @close="showUpdateDialog = false"
  />
</template>
```

---

## 🔐 设置 GitHub Secrets

在你的 GitHub 仓库 Settings → Secrets and variables → Actions 中添加：

1. `TAURI_SIGNING_PRIVATE_KEY`:
   ```bash
   cat ~/.tauri/mat.key
   # 复制整个内容
   ```

2. `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`:
   ```
   生成密钥时设置的密码
   ```

---

## 🚢 发布新版本

### 方式一：使用 Git 标签（推荐）

```bash
# 1. 更新版本号
npm version patch  # 0.1.18 -> 0.1.19

# 2. 推送代码和标签
git push && git push --tags

# 3. GitHub Actions 自动构建和发布
```

### 方式二：手动发布

```bash
# 1. 本地构建
cd frontend
TAURI_SIGNING_PRIVATE_KEY=$(cat ~/.tauri/mat.key) \
TAURI_SIGNING_PRIVATE_KEY_PASSWORD=your_password \
npm run tauri build

# 2. 手动上传到 GitHub Releases
```

---

## ✅ 测试自动更新

### 本地测试

1. **修改版本号**为低版本（如 0.1.0）
2. **构建应用**
3. **运行应用**，应该会检测到更新
4. **点击更新**，观察下载和安装过程

### 真实环境测试

1. **发布版本 0.1.19**
2. **用户安装 0.1.19**
3. **发布版本 0.1.20**
4. **用户应用自动检测到更新**

---

## 📚 常见问题

### Q: 签名验证失败？
A: 确保 `tauri.conf.json` 中的公钥与私钥匹配

### Q: 检测不到更新？
A: 检查 GitHub Release 中是否有 `latest.json` 文件

### Q: 下载失败？
A: 检查网络连接，确保能访问 GitHub

### Q: 如何禁用自动更新？
A: 移除启动时的自动检查代码，仅保留手动检查

---

## 🎯 下一步

- [ ] 配置 GitHub Actions 自动化发布
- [ ] 添加更新日志展示
- [ ] 实现更新进度显示
- [ ] 添加错误处理和重试机制
- [ ] 配置不同更新渠道（Beta/Stable）

---

## 📖 完整文档

参考 `AUTO_UPDATE_DESIGN.md` 获取完整的设计方案和详细说明。
