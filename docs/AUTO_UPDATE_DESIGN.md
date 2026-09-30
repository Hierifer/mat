# Materm Auto-Update Spec

## 概述

Materm 使用 Tauri v2 官方 `tauri-plugin-updater` 实现自动更新，更新源为 GitHub Releases，通过 Ed25519 签名验证安全性。

---

## 技术栈

| 组件 | 技术 |
|------|------|
| 更新插件 | `tauri-plugin-updater` v2.10.0 (Rust + JS) |
| 更新源 | GitHub Releases `latest.json` |
| 签名验证 | Ed25519 (公钥内嵌 `tauri.conf.json`) |
| 前端框架 | Vue 3 Composable 单例模式 |
| 构建产物 | `createUpdaterArtifacts: true` 自动生成 |

---

## 架构

```
┌─ Rust Backend ──────────────────────────────────────┐
│  lib.rs                                              │
│  ├─ tauri_plugin_updater 注册                        │
│  ├─ set_update_menu_badge() — 菜单角标 ●             │
│  └─ menu event "check_updates" → emit 到前端         │
└──────────────────────────────────────────────────────┘
         │ event: "menu:check-updates"
         ▼
┌─ Frontend ───────────────────────────────────────────┐
│                                                       │
│  composables/use-updater.ts  (单例状态)               │
│  ├─ checkForUpdates(silent)                           │
│  │   └─ check() → 比较 remote vs getVersion()        │
│  ├─ downloadAndInstall()                              │
│  │   └─ pendingUpdate.downloadAndInstall(callback)    │
│  ├─ restartApp()                                      │
│  │   └─ saveTerminalState() → relaunch()             │
│  └─ reset()                                           │
│                                                       │
│  components/updater/                                  │
│  ├─ update-dialog.vue      — 全屏模态弹窗             │
│  └─ update-progress-bar.vue — 窗口底部进度条          │
│                                                       │
│  App.vue                                              │
│  ├─ onMounted → 3s 后 silent checkForUpdates          │
│  ├─ listen("menu:check-updates") → 非 silent 检查     │
│  ├─ dismissed version 记忆 (localStorage)             │
│  └─ What's New 版本变化检测                           │
└───────────────────────────────────────────────────────┘
```

---

## 状态管理 (use-updater.ts)

单例 ref，所有 `useUpdater()` 消费者共享同一份状态：

| 状态 | 类型 | 说明 |
|------|------|------|
| `updateAvailable` | `boolean` | 是否有可用更新 |
| `updateInfo` | `UpdateInfo \| null` | 版本号、日期、release notes |
| `isChecking` | `boolean` | 正在检查中 |
| `isDownloading` | `boolean` | 正在下载中 |
| `isReadyToRestart` | `boolean` | 下载完成，等待重启 |
| `downloadProgress` | `number` | 下载进度 0–100 |
| `error` | `string \| null` | 错误信息 |

内部变量 `pendingUpdate: Update | null` 缓存 check() 返回的 Update 对象，避免重复请求。

---

## 更新流程

### 1. 启动自动检查

```
App mounted
  → 延迟 3s
  → checkForUpdates(silent=true)
  → 如果有更新:
      → set_update_menu_badge(true)  // 菜单角标
      → 检查 localStorage dismissed version
      → 如未 dismiss → showUpdateDialog = true
  → 如果无更新或出错: 静默忽略
```

### 2. 手动检查 (菜单)

```
用户点击 "Check for Updates..."
  → Rust emit "menu:check-updates"
  → 前端 listen → showUpdateDialog = true (立即显示 loading)
  → checkForUpdates(silent=false)
  → 如果有更新 → dialog 显示版本信息
  → 如果无更新 → dialog 显示 "已是最新版本"
  → 如果出错 → dialog 显示错误信息
```

### 3. 下载安装

```
用户点击 "Update Now"
  → downloadAndInstall()
  → 回调事件: Started → Progress → Finished
  → 进度通过 downloadProgress 实时更新
  → 完成后 isReadyToRestart = true
  → 用户点击 "Restart Now"
  → saveTerminalState() + relaunch()
```

---

## UI 组件

### update-dialog.vue (模态弹窗)

全屏遮罩 + 居中 500px 对话框，状态驱动显示：

| 状态 | 显示内容 |
|------|----------|
| `isChecking` | Spinner + "正在检查..." |
| `!updateInfo` | 绿色勾 + "已是最新版本" |
| `updateInfo` 存在 | 版本号、日期、release notes (v-html) |
| `isDownloading` | 进度条 + 百分比 |
| `isReadyToRestart` | 绿色提示 + "Restart Now" 按钮 |
| `error` | 红色错误信息 |

按钮:
- **Dismiss Version** — 记录到 localStorage，该版本不再提醒
- **Update Now** — 开始下载
- **Restart Now** — 下载完成后出现

### update-progress-bar.vue (底部进度条)

固定在窗口底部 (position: fixed, bottom: 0)，高 32px，z-index 600。
使用 `<transition name="progress-slide">` 滑入/滑出动画。

| 状态 | 显示 |
|------|------|
| 有更新未下载 | 蓝色文字 "vX.Y.Z available" + Download 按钮 |
| 下载中 | 顶部 2px 进度线 + 百分比文字 |
| 下载完成 | 绿色进度线 + "Restart Now" 按钮 |
| 出错 | 红色错误文字 + "Retry" 按钮 |

---

## localStorage 键

| Key | 用途 |
|-----|------|
| `materm_dismissed_update_version` | 用户选择忽略的版本号 |
| `materm_last_seen_version` | What's New 上次展示的版本 |

---

## 配置

### tauri.conf.json

```json
{
  "plugins": {
    "updater": {
      "active": true,
      "endpoints": [
        "https://github.com/Hierifer/mat/releases/latest/download/latest.json"
      ],
      "pubkey": "<Ed25519 公钥>"
    }
  },
  "bundle": {
    "createUpdaterArtifacts": true
  }
}
```

### CI (release.yml)

- 触发条件: push `v*` tag
- 版本同步: 从 tag 自动写入 `package.json` / `Cargo.toml` / `tauri.conf.json`
- 构建: `tauri-apps/tauri-action@v0` 生成 updater artifacts + 签名
- 输出: `latest.json` 上传到 GitHub Release

---

## 已知问题

### BUG-1: 启动时自动检查可能不生效

当 `tauri.conf.json` 中版本号与实际发布版本不一致时（当前 1.3.2 vs 实际 1.6.0），`check()` 返回的 remote version 可能与 `getVersion()` 匹配导致跳过更新。CI 构建时会从 tag 同步版本号，但本地开发和非 CI 构建场景下版本可能不匹配。

### BUG-2: 进度条显隐震荡

`update-progress-bar.vue` 的可见性由 `v-if="updateAvailable || isDownloading || isReadyToRestart || error"` 控制。当 `isDownloading` 在 `downloadAndInstall()` 的 finally 块中被设为 false、而 `isReadyToRestart` 还未被设为 true 之间存在一个短暂的间隙，所有条件都为 false，导致进度条先消失再出现（震荡）。

**修复方向**: 确保状态切换是原子的 — 在设置 `isReadyToRestart = true` 之后再设置 `isDownloading = false`，或使用一个统一的 phase 状态机替代多个独立 boolean。

### BUG-3: Dialog 缺少"后台更新"选项

当前 dialog 点击 "Update Now" 后，下载进度在 dialog 内部显示，用户必须保持 dialog 打开才能看到进度。没有办法把下载放到后台、关闭 dialog、仅在底部进度条显示进度、下载完成后再弹出提示。

---

## 改进计划

### 1. 后台更新模式

Dialog 增加"后台更新"按钮，点击后:
1. 关闭 dialog
2. 调用 `downloadAndInstall()` 在后台下载
3. 底部 `update-progress-bar` 显示下载进度
4. 下载完成后重新弹出 dialog 提示重启

```
用户看到更新 dialog
  ├─ 点击 "Update Now" → dialog 内显示进度（当前行为）
  └─ 点击 "Background Update" → 关闭 dialog
       → 底部进度条显示下载进度
       → 下载完成 → 自动弹出 dialog（仅显示 "Restart Now"）
```

需要的状态变化:
- `use-updater.ts`: 无需改动，状态已是全局单例
- `update-dialog.vue`: 增加 "Background Update" 按钮，emit 新事件
- `update-progress-bar.vue`: 已有下载进度展示能力，无需改动
- `App.vue`: 监听 `isReadyToRestart`，当后台下载完成时自动打开 dialog

### 2. 修复进度条震荡

将 `use-updater.ts` 中的状态切换改为原子操作:

```typescript
// downloadAndInstall() 中:
// 当前:
//   isReadyToRestart.value = true  (line 129)
//   isDownloading.value = false    (finally, line 136)
// → 无震荡，顺序已正确

// 但 update-progress-bar 的 v-if 条件需要覆盖过渡态
// 方案: 引入 phase 状态或确保 transition 不会因瞬间消失重新触发
```

更稳妥的方案: 用 `phase` 状态机替代多个 boolean:

```typescript
type UpdatePhase = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error'
const phase = ref<UpdatePhase>('idle')
```

### 3. i18n 新增键

```typescript
updater: {
  backgroundUpdate: 'Background Update',  // 后台更新按钮
  backgroundUpdateDesc: 'Download in background, notify when ready',
}
```

---

## 安全性

- **签名验证**: Ed25519，公钥内嵌 tauri.conf.json，私钥仅存 GitHub Secrets
- **传输安全**: HTTPS only (GitHub Releases)
- **来源限制**: 仅 `github.com/Hierifer/mat` releases endpoint
- **release notes**: 通过 `v-html` 渲染 — 内容来自 GitHub Release body，仅项目维护者可编辑

---

## 文件索引

| 文件 | 职责 |
|------|------|
| `src-tauri/src/lib.rs` | Rust 端 updater 插件注册、菜单角标、事件转发 |
| `src-tauri/tauri.conf.json` | updater endpoint / pubkey / createUpdaterArtifacts |
| `src/composables/use-updater.ts` | 核心更新逻辑，单例状态管理 |
| `src/components/updater/update-dialog.vue` | 更新弹窗 UI |
| `src/components/updater/update-progress-bar.vue` | 底部常驻进度条 UI |
| `src/App.vue` | 启动自动检查、事件监听、组件挂载 |
| `src/i18n/locales/en.ts` | 更新相关国际化文本 |
| `.github/workflows/release.yml` | CI 构建 + 签名 + 发布 |
