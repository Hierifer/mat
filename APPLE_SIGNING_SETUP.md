# Apple 代码签名设置指南

## 需要的 GitHub Secrets

在 GitHub 仓库设置中添加以下 Secrets (Settings → Secrets and variables → Actions):

### 1. APPLE_CERTIFICATE
Apple 开发者证书（.p12 格式，base64 编码）

**获取步骤**:
1. 打开 **Keychain Access** (钥匙串访问)
2. 找到你的 "Developer ID Application" 证书
3. 右键 → 导出 → 选择 .p12 格式
4. 设置密码导出
5. 转换为 base64:
   ```bash
   base64 -i ~/Desktop/certificate.p12 | pbcopy
   ```
6. 粘贴到 GitHub Secret

### 2. APPLE_CERTIFICATE_PASSWORD
导出 .p12 证书时设置的密码

### 3. KEYCHAIN_PASSWORD
临时钥匙串密码（可以随机生成）
```bash
openssl rand -base64 32
```

### 4. APPLE_SIGNING_IDENTITY
证书的 Common Name，通常是:
```
Developer ID Application: Your Name (TEAM_ID)
```

**查找方法**:
```bash
security find-identity -v -p codesigning
```
复制输出中的完整名称

### 5. APPLE_ID
你的 Apple ID 邮箱（用于公证）

### 6. APPLE_PASSWORD
App-specific password (不是 Apple ID 密码！)

**生成步骤**:
1. 访问 https://appleid.apple.com
2. 登录后进入 "安全" → "App 专用密码"
3. 点击 "生成密码"
4. 保存生成的密码到 GitHub Secret

### 7. APPLE_TEAM_ID
Apple 开发者团队 ID（10 位字符）

**查找方法**:
1. 访问 https://developer.apple.com/account
2. 登录后在右上角可以看到 Team ID
3. 或在证书名称中也能看到（括号内）

### 8. TAURI_SIGNING_PRIVATE_KEY
Tauri 更新签名私钥

**生成步骤**:
```bash
cd frontend
npm run tauri signer generate -- -w ~/.tauri/myapp.key
```
复制私钥内容到 GitHub Secret

### 9. TAURI_SIGNING_PRIVATE_KEY_PASSWORD
生成 Tauri 私钥时设置的密码（如果有）

## 申请 Apple 开发者证书

如果你还没有 Apple 开发者证书:

1. **加入 Apple Developer Program**
   - 访问 https://developer.apple.com/programs/
   - 注册并支付 $99/年

2. **创建证书**
   - 登录 https://developer.apple.com/account/resources/certificates
   - 点击 "+" 创建新证书
   - 选择 "Developer ID Application" (用于分发到 Mac App Store 之外)
   - 按照指引完成证书请求和下载

3. **安装证书**
   - 双击下载的证书文件安装到 Keychain

## 验证配置

配置完所有 Secrets 后，推送一个新的 tag 触发构建:

```bash
git tag v0.1.20-test
git push origin v0.1.20-test
```

检查 GitHub Actions 日志，确保:
- ✅ 证书成功导入
- ✅ 应用成功签名
- ✅ 公证完成（如果配置了）

## 本地测试签名

在推送到 GitHub 之前，可以本地测试:

```bash
# 设置环境变量
export APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (TEAM_ID)"

# 构建
cd frontend
npm run tauri build
```

验证签名:
```bash
codesign -dv --verbose=4 src-tauri/target/release/bundle/macos/mat.app
```

## 常见问题

### 问题 1: 证书不受信任
确保使用的是 "Developer ID Application" 证书，不是 "Mac Development" 证书

### 问题 2: 公证失败
- 检查 APPLE_ID 和 APPLE_PASSWORD 是否正确
- 确保使用的是 App-specific password，不是账户密码
- 确保 APPLE_TEAM_ID 正确

### 问题 3: 签名后无法打开
- 检查 entitlements 配置
- 确保所有依赖库也已签名

## 参考链接

- [Tauri Code Signing Guide](https://tauri.app/v1/guides/distribution/sign-macos)
- [Apple Notarization Guide](https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution)
- [GitHub Actions Secrets](https://docs.github.com/en/actions/security-guides/encrypted-secrets)
