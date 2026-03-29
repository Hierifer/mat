# Skill: GitHub Secrets 配置

## Summary
本文档记录 MAT Terminal 项目在 GitHub Actions 中使用的所有 Secrets 配置，包括 Apple 代码签名和 Tauri 更新签名。

## ✅ 已配置的 Secrets

### Apple 代码签名 Secrets (macOS)

以下 Secrets 已在 GitHub 仓库中配置完成（Settings → Secrets and variables → Actions）:

| Secret 名称 | 用途 | 配置状态 | 配置时间 |
|------------|------|---------|---------|
| `APPLE_CERTIFICATE` | Apple 开发者证书 (.p12 base64) | ✅ 已配置 | 2024-03 |
| `APPLE_CERTIFICATE_PASSWORD` | 证书导出密码 | ✅ 已配置 | 2024-03 |
| `KEYCHAIN_PASSWORD` | CI 临时钥匙串密码 | ✅ 已配置 | 2024-03 |
| `APPLE_SIGNING_IDENTITY` | 签名身份名称 | ✅ 已配置 | 2024-03 |
| `APPLE_ID` | Apple ID 邮箱 | ✅ 已配置 | 2024-03 |
| `APPLE_PASSWORD` | App-specific password | ✅ 已配置 | 2024-03 |
| `APPLE_TEAM_ID` | Apple 团队 ID (10位) | ✅ 已配置 | 2024-03 |

### Tauri 更新签名 Secrets

| Secret 名称 | 用途 | 配置状态 | 配置时间 |
|------------|------|---------|---------|
| `TAURI_SIGNING_PRIVATE_KEY` | Tauri 更新签名私钥 | ✅ 已配置 | 2024-03 |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | 私钥密码 | ✅ 已配置 | 2024-03 |

**总计**: 9 个 Secrets 全部配置完成 ✅

## GitHub Actions 工作流配置

### 使用 Secrets 的步骤

**1. 导入 Apple 证书** (`.github/workflows/release.yml`)
```yaml
- name: Import Apple Certificate (macOS)
  if: matrix.platform == 'macos-latest'
  env:
    APPLE_CERTIFICATE: ${{ secrets.APPLE_CERTIFICATE }}
    APPLE_CERTIFICATE_PASSWORD: ${{ secrets.APPLE_CERTIFICATE_PASSWORD }}
    KEYCHAIN_PASSWORD: ${{ secrets.KEYCHAIN_PASSWORD }}
  run: |
    # 创建临时钥匙串并导入证书
    ...
```

**2. 构建和签名**
```yaml
- name: Build and sign application
  env:
    TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
    TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
    APPLE_SIGNING_IDENTITY: ${{ secrets.APPLE_SIGNING_IDENTITY }}
    APPLE_ID: ${{ secrets.APPLE_ID }}
    APPLE_PASSWORD: ${{ secrets.APPLE_PASSWORD }}
    APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
  run: |
    cd frontend
    npm run tauri build -- --target ${{ matrix.target }}
```

**3. 公证 macOS 应用**
```yaml
- name: Notarize macOS app (macOS)
  if: matrix.platform == 'macos-latest'
  env:
    APPLE_ID: ${{ secrets.APPLE_ID }}
    APPLE_PASSWORD: ${{ secrets.APPLE_PASSWORD }}
    APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
  run: |
    # 提交公证并等待完成
    xcrun notarytool submit ...
```

[ref: .github/workflows/release.yml]

## Secret 详细说明

### APPLE_CERTIFICATE
- **格式**: Base64 编码的 .p12 文件
- **获取方式**:
  1. 从 Keychain Access 导出 "Developer ID Application" 证书
  2. 使用 `base64 -i certificate.p12 | pbcopy` 编码
- **注意**: 必须是 Developer ID Application 证书，不能是 Mac Development

### APPLE_CERTIFICATE_PASSWORD
- **格式**: 纯文本密码
- **用途**: 解密导入 .p12 证书
- **设置**: 导出证书时设定的密码

### KEYCHAIN_PASSWORD
- **格式**: 随机生成的密码
- **用途**: CI 中创建临时钥匙串
- **生成**: `openssl rand -base64 32`
- **注意**: 仅用于 CI，不影响本地开发

### APPLE_SIGNING_IDENTITY
- **格式**: 证书 Common Name
- **示例**: `Developer ID Application: Hierifer (TEAM123456)`
- **查找**: `security find-identity -v -p codesigning`
- **用途**: 指定 codesign 使用哪个证书

### APPLE_ID
- **格式**: Apple ID 邮箱
- **用途**: 公证服务认证
- **要求**: 必须是 Apple Developer 账号

### APPLE_PASSWORD
- **格式**: App-specific password (不是账户密码!)
- **生成位置**: https://appleid.apple.com → 安全 → App专用密码
- **用途**: 公证服务 API 认证
- **注意**: 不能使用主账户密码

### APPLE_TEAM_ID
- **格式**: 10 位字母数字
- **示例**: `A1B2C3D4E5`
- **查找**: https://developer.apple.com/account (右上角)
- **用途**: 指定开发者团队

### TAURI_SIGNING_PRIVATE_KEY
- **格式**: Tauri 生成的私钥文本
- **生成**: `npm run tauri signer generate`
- **用途**: 签名自动更新包
- **配置位置**: `tauri.conf.json` → `updater.pubkey`

### TAURI_SIGNING_PRIVATE_KEY_PASSWORD
- **格式**: 私钥密码（如果设置了）
- **用途**: 解密 Tauri 私钥
- **注意**: 可选，如果生成密钥时未设密码则留空

## 安全最佳实践

### ✅ 正确做法
- ✅ 所有敏感信息都存储在 GitHub Secrets 中
- ✅ 使用临时钥匙串，构建后立即删除
- ✅ 使用 App-specific password，不使用主账户密码
- ✅ 设置钥匙串自动锁定时间 (21600秒 = 6小时)
- ✅ 构建完成后清理钥匙串: `security delete-keychain`

### ❌ 禁止操作
- ❌ 不要在代码中硬编码证书或密码
- ❌ 不要提交 .p12 文件到 Git
- ❌ 不要在日志中打印 Secret 值
- ❌ 不要使用 Apple ID 主密码
- ❌ 不要跳过钥匙串清理步骤

## 本地开发签名

### 环境变量配置

本地构建时可设置环境变量使用签名:

```bash
# 设置签名身份
export APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (TEAMID)"

# 构建
cd frontend
npm run tauri build
```

### 验证签名

```bash
# 查看签名信息
codesign -dv --verbose=4 src-tauri/target/release/bundle/macos/mat.app

# 验证签名
codesign --verify --verbose=4 src-tauri/target/release/bundle/macos/mat.app

# 检查 Gatekeeper
spctl -a -v src-tauri/target/release/bundle/macos/mat.app
```

## 故障排查

### 问题 1: 证书导入失败
**错误**: `security: SecKeychainItemImport: The specified item already exists in the keychain.`

**解决**:
```bash
# 删除已存在的钥匙串
security delete-keychain $RUNNER_TEMP/app-signing.keychain-db
```

### 问题 2: 签名失败 - 找不到身份
**错误**: `error: No signing identity found`

**检查**:
1. 确认 `APPLE_SIGNING_IDENTITY` 格式正确
2. 确认证书已正确导入: `security find-identity -v -p codesigning`
3. 确认钥匙串已解锁

### 问题 3: 公证失败
**错误**: `Error: Unable to authenticate`

**检查**:
1. 确认使用的是 App-specific password，不是主密码
2. 确认 Apple ID 和 Team ID 正确
3. 确认 Apple Developer 账号有效

### 问题 4: Tauri 更新签名失败
**错误**: `Error: Invalid signature`

**检查**:
1. 确认 `TAURI_SIGNING_PRIVATE_KEY` 和 `tauri.conf.json` 中的 `pubkey` 匹配
2. 确认密码正确（如果设置了）

## 维护和更新

### 证书过期
Apple 开发者证书有效期为 5 年。证书过期前需要:

1. 在 Apple Developer 网站续期或创建新证书
2. 导出新证书为 .p12
3. 更新 `APPLE_CERTIFICATE` Secret
4. 更新 `APPLE_CERTIFICATE_PASSWORD` Secret (如果密码变更)
5. 更新 `APPLE_SIGNING_IDENTITY` Secret (如果证书名称变更)

### App-specific Password 失效
如果更改了 Apple ID 密码，App-specific password 会失效:

1. 访问 https://appleid.apple.com
2. 撤销旧的 App-specific password
3. 生成新的 App-specific password
4. 更新 `APPLE_PASSWORD` Secret

### Tauri 密钥轮换
建议定期轮换更新签名密钥:

```bash
# 生成新密钥对
cd frontend
npm run tauri signer generate -- -w ~/.tauri/mat-new.key

# 更新 Secrets
# 1. TAURI_SIGNING_PRIVATE_KEY → 新私钥
# 2. tauri.conf.json → pubkey → 新公钥

# 注意: 使用旧密钥签名的更新包将无法验证
```

## 相关文档

- [APPLE_SIGNING_SETUP.md](../APPLE_SIGNING_SETUP.md) - 详细设置指南
- [.github/workflows/release.yml](../.github/workflows/release.yml) - CI/CD 工作流
- [tauri.conf.json](../frontend/src-tauri/tauri.conf.json) - Tauri 配置

## 快速参考

### 检查 Secrets 配置

访问: https://github.com/Hierifer/mat/settings/secrets/actions

确保所有 9 个 Secrets 都已配置:
- [x] APPLE_CERTIFICATE
- [x] APPLE_CERTIFICATE_PASSWORD
- [x] KEYCHAIN_PASSWORD
- [x] APPLE_SIGNING_IDENTITY
- [x] APPLE_ID
- [x] APPLE_PASSWORD
- [x] APPLE_TEAM_ID
- [x] TAURI_SIGNING_PRIVATE_KEY
- [x] TAURI_SIGNING_PRIVATE_KEY_PASSWORD

### 触发签名构建

```bash
# 创建 release tag
git tag v0.1.20
git push origin v0.1.20

# GitHub Actions 会自动:
# 1. 导入证书
# 2. 构建并签名应用
# 3. 公证 macOS 应用
# 4. 上传到 GitHub Release
```

## 更新日志

- 2024-03-29: 初始配置所有 9 个 Secrets
- 2024-03-29: 添加 Apple 代码签名和公证流程
- 2024-03-29: 创建本文档

---

**注意**: 本文档包含项目签名配置的完整信息。所有 Secrets 已配置完成，无需重复询问或配置。
