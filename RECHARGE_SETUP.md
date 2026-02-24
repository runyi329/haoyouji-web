# 充值系统设置指南

## 问题：扫描器状态显示"未启动"

如果在充值系统监控页面看到扫描器状态为"未启动"，收款地址显示"未配置"，说明环境变量还没有被PM2进程加载。

## 解决方案

在服务器上执行以下命令：

```bash
# 方案1：重新加载PM2进程（推荐）
cd /root/haoyouji-web
pm2 reload haoyouji-web --update-env

# 方案2：如果方案1不生效，完全重启PM2
pm2 restart haoyouji-web

# 方案3：如果还不行，删除PM2进程并重新启动
pm2 delete haoyouji-web
pm2 start ecosystem.config.js
```

## 验证

执行完上述命令后，等待1-2分钟，然后刷新充值系统监控页面，应该能看到：

- ✅ 扫描器状态：运行中
- ✅ 收款地址：TTHZ7NvpKSMCyU3JNLLN6zZNruysy5emQJ
- ✅ 扫描间隔：60秒
- ✅ 网络：TRC20 (Tron)

## 环境变量配置

充值系统需要以下环境变量（已自动添加到 `.env` 文件）：

```env
# 充值配置
RECHARGE_WALLET_ADDRESS_TRC20=TTHZ7NvpKSMCyU3JNLLN6zZNruysy5emQJ
RECHARGE_MIN_AMOUNT=1
RECHARGE_ORDER_EXPIRE_MINUTES=30
```

## 自动部署流程

每次部署时，脚本会自动：

1. 执行数据库迁移
2. 检查并添加充值配置到 `.env`
3. 重启PM2进程

但由于PM2的环境变量缓存机制，第一次添加配置时可能需要手动重新加载。

## 常见问题

### Q: 为什么第一次部署后扫描器没有启动？

A: PM2进程在启动时会缓存环境变量。如果 `.env` 文件是在PM2进程启动后才添加的配置，需要手动重新加载。

### Q: 如何确认环境变量已生效？

A: 在服务器上执行：
```bash
pm2 env haoyouji-web | grep RECHARGE
```

应该能看到充值相关的环境变量。

### Q: 扫描器多久扫描一次？

A: 默认每60秒扫描一次TronGrid API，查询收款地址的最新TRC20 USDT转账记录。
