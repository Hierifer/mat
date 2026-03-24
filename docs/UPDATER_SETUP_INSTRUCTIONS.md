# Mat Terminal - 自动更新功能设置说明

## ✅ 已完成的工作

我已经为你实现了以下内容：

### 1. 后端 (Rust)
- ✅ 添加 `tauri-plugin-updater` 依赖
- ✅ 在 `lib.rs` 中集成 updater 插件
- ✅ 添加"Check for Updates..."菜单项
- ✅ 配置菜单事件处理

### 2. 前端 (Vue/TypeScript)
- ✅ 添加 `@tauri-apps/plugin-updater` 和 `@tauri-apps/plugin-process` 依赖
- ✅ 创建 `use-updater.ts` composable（更新逻辑）
- ✅ 创建 `update-dialog.vue` 组件（更新对话框UI）
- ✅ 在 `App.vue` 中集成自动检查和手动检查功能

### 3. 配置文件
- ✅ 更新 `tauri.conf.json` 添加 updater 配置
- ✅ 创建 `capabilities/updater.json` 权限配置
- ✅ 配置更新端点：`https://github.com/Hierifer/mat/releases/latest/download/latest.json`

### 4. CI/CD
- ✅ 创建 `.github/workflows/release.yml` GitHub Actions 工作流
- ✅ 配置自动构建、签名和发布流程

## ⚠️ 需要你完成的步骤

### Step 1: 生成签名密钥对（重要！）

**这一步必须手动完成**，因为需要交互式输入密码。

```bash
cd frontend
pnpm tauri signer generate -w ~/.tauri/mat.key
```

执行后：
1. 系统会提示输入密码，请设置一个强密码并**务必记住**
2. 生成成功后会显示公钥，类似：
   ```
   dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDYxNEU...
   ```
3. **复制这个公钥**，下一步会用到

⚠️ **警告**：
- 私钥文件 `~/.tauri/mat.key` **绝对不能提交到 Git** 或泄露
- 务必备份私钥和密码到安全的地方
- 如果丢失私钥，将无法发布更新

### Step 2: 配置公钥

用你在 Step 1 中复制的公钥替换配置文件中的占位符：

打开 `frontend/src-tauri/tauri.conf.json`，找到：

```json
"plugins": {
  "updater": {
    "pubkey": "PLACEHOLDER_PUBLIC_KEY_WILL_BE_GENERATED"
  }
}
```

替换为：

```json
"plugins": {
  "updater": {
    "pubkey": "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDYxNEU..."
  }
}
```

### Step 3: 设置 GitHub Secrets

在 GitHub 仓库设置中添加两个 secrets：

1. 进入你的 GitHub 仓库
2. 点击 **Settings** → **Secrets and variables** → **Actions**
3. 点击 **New repository secret** 添加以下两个 secrets：

#### Secret 1: TAURI_SIGNING_PRIVATE_KEY

```bash
# 读取私钥内容
cat ~/.tauri/mat.key

# 复制整个输出内容（包括开头和结尾的注释行）
# 粘贴到 GitHub Secret 的值中
```

#### Secret 2: TAURI_SIGNING_PRIVATE_KEY_PASSWORD

```
输入你在 Step 1 中设置的密码
```

### Step 4: 测试本地构建（可选）

在发布到 GitHub 之前，你可以先在本地测试构建：

```bash
cd frontend

# 设置环境变量
export TAURI_SIGNING_PRIVATE_KEY=$(cat ~/.tauri/mat.key)
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="your_password"

# 构建
npm run tauri build
```

如果构建成功，你会在 `src-tauri/target/release/bundle/` 目录下看到：
- 安装包（.dmg, .msi, .AppImage 等）
- 签名文件（.sig）
- 更新清单（latest.json）

## 🚀 如何发布新版本

### 方法一：使用 Git 标签（推荐）

这是最简单的方法，GitHub Actions 会自动处理一切：

```bash
# 1. 确保所有更改已提交
git add -A
git commit -m "feat: Add auto-update feature"

# 2. 更新版本号并创建标签
npm version patch  # 或 minor, major
# 这会自动更新 package.json 并创建 git 标签

# 3. 推送代码和标签
git push && git push --tags

# 4. GitHub Actions 会自动：
#    - 构建所有平台的安装包
#    - 使用私钥签名
#    - 创建 GitHub Release
#    - 上传所有文件
#    - 生成 latest.json
```

### 方法二：手动创建标签

```bash
# 1. 更新版本号
# 手动修改 frontend/package.json 中的 version

# 2. 创建并推送标签
git tag v0.1.19
git push origin v0.1.19

# 3. GitHub Actions 会自动构建和发布
```

### 查看发布进度

1. 进入 GitHub 仓库的 **Actions** 标签页
2. 查看最新的 "Release" 工作流运行状态
3. 构建完成后，在 **Releases** 页面可以看到新版本

## 🧪 测试自动更新

### 本地测试

1. **修改版本号为低版本**
   ```bash
   # 临时修改 frontend/package.json 的 version 为 0.1.0
   ```

2. **构建并运行应用**
   ```bash
   npm run tauri dev
   ```

3. **应用启动后**：
   - 等待 3 秒，应该会自动检测到更新
   - 或者点击菜单：Mat → Check for Updates...

4. **点击"立即更新"**，观察：
   - 下载进度条
   - 下载完成后应用自动重启
   - 重启后版本已更新

### 真实环境测试

1. **发布版本 0.1.19**
   ```bash
   npm version patch
   git push && git push --tags
   ```

2. **等待 GitHub Actions 构建完成**

3. **用户安装 0.1.19 版本**

4. **发布版本 0.1.20**
   ```bash
   npm version patch
   git push && git push --tags
   ```

5. **用户应用应该会自动检测到更新**

## 📝 功能说明

### 自动检查更新
- **时机**：应用启动后 3 秒
- **行为**：
  - 如果有更新：显示更新对话框
  - 如果没有更新：静默（不打扰用户）
  - 如果检查失败：静默（记录日志）

### 手动检查更新
- **触发**：菜单 "Mat → Check for Updates..."
- **行为**：
  - 如果有更新：显示更新对话框
  - 如果没有更新：显示"已是最新版本"提示
  - 如果检查失败：显示错误提示

### 更新对话框
- **显示内容**：
  - 新版本号
  - 发布日期
  - 更新内容（来自 GitHub Release Notes）
- **操作选项**：
  - "稍后提醒"：关闭对话框
  - "立即更新"：下载并安装更新

### 更新过程
1. 点击"立即更新"
2. 显示下载进度（0-100%）
3. 下载完成后自动验证签名
4. 安装更新并重启应用

## 🔒 安全性

- ✅ 所有更新包都经过 Ed25519 签名验证
- ✅ 私钥仅存储在本地和 GitHub Secrets 中
- ✅ 公钥内嵌在应用中，无法被篡改
- ✅ 仅从 HTTPS 端点下载更新
- ✅ 签名验证失败会自动终止更新

## ❓ 常见问题

### Q: 如何禁用自动更新检查？
A: 在 `App.vue` 中注释掉 `setTimeout` 自动检查代码

### Q: 如何更改更新检查频率？
A: 修改 `App.vue` 中的 `setTimeout` 延迟时间（默认 3000ms）

### Q: 签名验证失败怎么办？
A: 确保 `tauri.conf.json` 中的公钥与私钥匹配

### Q: 如何支持 Beta 和 Stable 不同渠道？
A: 可以配置多个 `endpoints`，指向不同的 JSON 文件

### Q: 更新失败后如何回滚？
A: Tauri 会自动保留旧版本，更新失败不会影响当前版本

## 📚 相关文档

- [完整设计方案](./AUTO_UPDATE_DESIGN.md)
- [快速实施指南](./AUTO_UPDATE_QUICKSTART.md)
- [Tauri Updater 官方文档](https://v2.tauri.app/plugin/updater/)

## 🎯 下一步

1. [ ] 完成 Step 1-3：生成密钥和配置 Secrets
2. [ ] 测试本地构建
3. [ ] 发布第一个支持自动更新的版本
4. [ ] 测试自动更新功能
5. [ ] 向用户公告新功能

---

如有任何问题，请参考 [完整设计方案](./AUTO_UPDATE_DESIGN.md) 或查看 Tauri 官方文档。
