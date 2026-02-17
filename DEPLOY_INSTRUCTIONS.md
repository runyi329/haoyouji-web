# 部署说明

## 🚀 自动部署流程

本项目使用GitHub Actions自动部署到腾讯云服务器。

## ⚙️ 环境变量配置

### 方法一：使用部署后脚本（推荐）

在服务器上运行以下命令：

```bash
cd /root/haoyouji-web
bash scripts/post-deploy.sh
pm2 restart haoyouji-web
```

### 方法二：手动创建.env文件

在服务器项目根目录创建`.env`文件：

```bash
cd /root/haoyouji-web
cat > .env << 'EOF'
DEEPSEEK_API_KEY=REDACTED_KEY_1
QICHACHA_APP_KEY=152b7fd199d145579398ac5203aa77e1
QICHACHA_SECRET_KEY=F158CC5678656B62B985E75D5A3DFB82
EOF
pm2 restart haoyouji-web
```

## ✅ 验证配置

配置完成后，访问AI助手页面测试：

- "帮我查一下腾讯"
- "查询阿里巴巴的企业信息"

如果能正常返回企业信息，说明配置成功！

## 📝 注意事项

- `.env`文件已添加到`.gitignore`，不会被提交到Git
- 环境变量包含敏感信息，请妥善保管
- 每次部署后需要重启PM2服务才能生效
