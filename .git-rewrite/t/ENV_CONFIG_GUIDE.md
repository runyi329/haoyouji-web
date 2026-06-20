# 环境变量配置指南

## 📋 需要配置的环境变量

为了让AI助手的企业查询功能正常工作，需要在服务器上配置以下环境变量：

```bash
DEEPSEEK_API_KEY=你的DeepSeek API密钥
QICHACHA_APP_KEY=152b7fd199d145579398ac5203aa77e1
QICHACHA_SECRET_KEY=F158CC5678656B62B985E75D5A3DFB82
```

## 🔧 配置方法

### 方法一：直接在服务器上配置（推荐）

1. SSH登录到腾讯云服务器：
   ```bash
   ssh root@你的服务器IP
   ```

2. 进入项目目录：
   ```bash
   cd /root/haoyouji-web
   ```

3. 创建 `.env` 文件：
   ```bash
   cat > .env << 'EOF'
   DEEPSEEK_API_KEY=你的DeepSeek API密钥
   QICHACHA_APP_KEY=152b7fd199d145579398ac5203aa77e1
   QICHACHA_SECRET_KEY=F158CC5678656B62B985E75D5A3DFB82
   EOF
   ```

4. 重启PM2服务：
   ```bash
   pm2 restart haoyouji-web
   ```

5. 验证配置：
   ```bash
   pm2 logs haoyouji-web
   ```

### 方法二：通过GitHub Actions配置

1. 访问GitHub仓库：https://github.com/runyi329/haoyouji-web

2. 点击 **Settings** → **Secrets and variables** → **Actions**

3. 添加以下Repository secrets：
   - `DEEPSEEK_API_KEY`
   - `QICHACHA_APP_KEY`
   - `QICHACHA_SECRET_KEY`

4. 修改 `.github/workflows/deploy.yml`，在部署步骤中添加环境变量写入逻辑

5. 推送代码触发自动部署

## ✅ 验证配置是否生效

配置完成后，访问AI助手页面，尝试以下查询：

- "帮我查一下腾讯"
- "查询阿里巴巴的企业信息"

如果能正常返回企业信息，说明配置成功！

## 🔒 安全提示

- `.env` 文件已添加到 `.gitignore`，不会被提交到Git
- 环境变量包含敏感信息，请妥善保管
- 不要在代码中硬编码API密钥

## 📞 需要帮助？

如果配置过程中遇到问题，请联系技术支持。
