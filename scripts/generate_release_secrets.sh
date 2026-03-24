#!/bin/bash

# Target Identity
IDENTITY="Developer ID Application: Teng Hu (86UK82S9M4)"
OUTPUT_P12="certs/developer_id_app.p12"
P12_PASSWORD="release-secret-password-123" # Temporary password used for export

echo "============================================================"
echo "正在导出 Developer ID Application 证书..."
echo "目标身份: \"$IDENTITY\""
echo "============================================================"
echo ""
echo "⚠️  注意：系统可能会弹窗要求访问钥匙串，请输入你的登录密码并点击【允许】。"
echo ""

# Export the certificate
security export -k ~/Library/Keychains/login.keychain-db -t priv -f pkcs12 -P "$P12_PASSWORD" -o "$OUTPUT_P12" -c "$IDENTITY"

if [ -f "$OUTPUT_P12" ]; then
    echo "✅ 导出成功！"
    echo ""
    echo "即将生成 GitHub Release Action 需要的 Secrets..."
    echo ""
    
    # Generate Base64
    BASE64_CERT=$(base64 -i "$OUTPUT_P12")

    echo "============================================================"
    echo "=========== GitHub Secrets 配置信息 (Release 用) ==========="
    echo "============================================================"
    echo ""
    echo "1. Secret Name: APPLE_CERTIFICATE (复制整行)"
    echo "------------------------------------------------------------"
    echo "$BASE64_CERT"
    echo "------------------------------------------------------------"
    echo ""
    echo "2. Secret Name: APPLE_CERTIFICATE_PASSWORD"
    echo "   Value: $P12_PASSWORD"
    echo ""
    echo "3. Secret Name: APPLE_SIGNING_IDENTITY"
    echo "   Value: $IDENTITY"
    echo ""
    echo "4. Secret Name: APPLE_TEAM_ID"
    # Extract Team ID from the identity string (inside parentheses)
    TEAM_ID=$(echo "$IDENTITY" | grep -o '\([A-Z0-9]\{10\}\)' | tail -n1)
    echo "   Value: $TEAM_ID"
    echo ""
    echo "============================================================"
    echo "⚠️  请立即去 GitHub 更新这几个 Secrets。"
    
    # Optional: Save base64 to a file for easier copying
    echo "$BASE64_CERT" > certs/release_cert_base64.txt
    echo "已将 Base64 保存到 certs/release_cert_base64.txt 方便复制。"
    
    # Cleanup p12 for security? Maybe keep it for reference?
    # rm "$OUTPUT_P12" 
else
    echo "❌ 导出失败。"
    echo "请确认你的钥匙串中确实有 \"$IDENTITY\" 并且包含私钥。"
    echo "或者尝试手动导出 p12 文件到 certs/ 目录，然后用 base64 命令生成。"
fi
