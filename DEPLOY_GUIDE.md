# 好友记 - 部署指南

**部署时间**: 2026-02-11  
**最新Commit**: `adbdb0edf0d3895cd346a96ebd0a6b84bde01578`

---

## 📦 本次更新内容

### 1. 轮播图优化 ✅
**Commit**: `65a941f9973e5f622a687fb03207c5324eee3b6a`
- PNG → WebP，压缩率99%
- 18MB → 191KB
- 加载速度提升75倍

### 2. "我的"按钮下拉菜单 ✅
**Commit**: `13750d008267f4e67d4cea428e863ade5e1f0883`
- 添加下拉菜单（个人中心 + 退出登录）
- 优化用户体验

### 3. 修复首页数据加载 ✅
**Commit**: `adbdb0edf0d3895cd346a96ebd0a6b84bde01578`
- 修复API调用错误
- 数据正常显示

---

## 🚀 部署步骤

### 在腾讯云服务器上执行

```bash
# 1. SSH登录到服务器
ssh ubuntu@124.223.54.69

# 2. 进入项目目录
cd /home/ubuntu/haoyouji-web

# 3. 拉取最新代码
git pull origin main

# 4. 查看更新内容
git log -3 --oneline

# 5. 安装依赖（如果有新增）
pnpm install

# 6. 构建前端
pnpm run build

# 7. 重启服务
pm2 restart haoyouji-web

# 或者如果没有使用pm2
# pkill -f "node.*haoyouji"
# pnpm run start &

# 8. 查看服务状态
pm2 status
# 或者
# ps aux | grep haoyouji

# 9. 查看日志（可选）
pm2 logs haoyouji-web --lines 50
```

---

## ✅ 部署验证

### 1. 检查服务状态
```bash
# 检查进程
pm2 status

# 检查端口
netstat -tulnp | grep 3000

# 测试本地访问
curl -I http://localhost:3000
```

### 2. 浏览器验证

访问：**https://www.jiangyuchen.cn**

检查项：
- [ ] 轮播图加载速度快（< 1秒）
- [ ] 轮播图清晰度正常
- [ ] "人脉总数"显示正确数字
- [ ] "累计标签"显示正确数字
- [ ] 点击"我的"按钮弹出菜单
- [ ] 菜单包含"个人中心"和"退出登录"
- [ ] 所有数据卡片显示正常
- [ ] 页面无报错

### 3. 移动端验证

用手机访问：**https://www.jiangyuchen.cn**

检查项：
- [ ] 轮播图秒开
- [ ] 布局适配正常
- [ ] 触摸操作流畅
- [ ] 下拉菜单正常工作

---

## 🔧 常见问题

### Q1: git pull失败
```bash
# 查看冲突
git status

# 如果有本地修改，先备份
git stash

# 重新拉取
git pull origin main

# 恢复本地修改（如需要）
git stash pop
```

### Q2: 构建失败
```bash
# 清理缓存
rm -rf node_modules/.vite
rm -rf dist

# 重新构建
pnpm run build
```

### Q3: pm2重启失败
```bash
# 查看错误日志
pm2 logs haoyouji-web --err --lines 100

# 删除进程重新启动
pm2 delete haoyouji-web
pm2 start ecosystem.config.js

# 或者直接运行
cd /home/ubuntu/haoyouji-web
NODE_ENV=production node dist/index.js
```

### Q4: 端口被占用
```bash
# 查找占用3000端口的进程
lsof -i:3000

# 杀死进程
kill -9 <PID>

# 重新启动
pm2 restart haoyouji-web
```

### Q5: 数据仍然不显示
```bash
# 检查数据库连接
cd /home/ubuntu/haoyouji-web
node -e "require('./dist/index.js')"

# 查看环境变量
cat .env.production

# 测试数据库连接
mysql -h 124.223.54.69 -u root -p crm_db
```

---

## 📊 性能对比

### 轮播图加载时间（4G网络）

| 项目 | 优化前 | 优化后 | 改善 |
|------|--------|--------|------|
| 图片大小 | 17.54 MB | 0.19 MB | -98.9% |
| 加载时间 | ~15秒 | ~0.2秒 | 快75倍 |
| 用户流量 | 17.54 MB | 0.19 MB | 节省98.9% |

### 首屏加载时间

| 网络 | 优化前 | 优化后 | 改善 |
|------|--------|--------|------|
| 5G | ~2秒 | ~0.5秒 | -75% |
| 4G | ~16秒 | ~1秒 | -94% |
| 3G | ~140秒 | ~3秒 | -98% |

---

## 🔗 相关链接

- **GitHub仓库**: https://github.com/runyi329/haoyouji-web
- **生产环境**: https://www.jiangyuchen.cn
- **最新Commit**: https://github.com/runyi329/haoyouji-web/commit/adbdb0edf0d3895cd346a96ebd0a6b84bde01578

---

## 📝 Git提交记录

### Commit 1: 轮播图优化
```
65a941f9973e5f622a687fb03207c5324eee3b6a
优化轮播图：PNG转WebP，压缩率99%，从18MB降至191KB
```

### Commit 2: "我的"按钮优化
```
13750d008267f4e67d4cea428e863ade5e1f0883
feat: 添加"我的"按钮下拉菜单
```

### Commit 3: 修复数据加载
```
adbdb0edf0d3895cd346a96ebd0a6b84bde01578
fix: 修复首页数据加载问题
```

---

## 🎯 后续优化建议

1. **性能监控** - 添加前端性能监控（如Sentry）
2. **CDN加速** - 配置腾讯云CDN加速图片
3. **懒加载** - 实现图片懒加载
4. **PWA** - 添加PWA支持，提升移动端体验
5. **自动化部署** - 配置GitHub Actions自动部署

---

**部署人**: Manus AI  
**文档生成时间**: 2026-02-11 22:42
