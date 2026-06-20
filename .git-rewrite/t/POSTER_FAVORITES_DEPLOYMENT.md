# 海报收藏功能部署指南

> 本指南专门用于部署海报收藏功能到生产环境

## 功能概述

在个人中心新增"我的收藏"功能，支持：
- 海报分类管理（营销类、产品教程、特定对象等）
- 缩略图网格展示
- 点击放大预览
- 一键下载
- 图片存储在腾讯云COS

## 部署步骤

### 步骤1：创建数据库表

登录生产服务器，执行以下SQL：

```sql
CREATE TABLE IF NOT EXISTS poster_favorites (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL COMMENT '用户ID',
  title VARCHAR(255) NOT NULL COMMENT '海报标题',
  description TEXT COMMENT '海报描述',
  category VARCHAR(50) NOT NULL DEFAULT 'other' COMMENT '海报分类',
  series_name VARCHAR(255) COMMENT '系列名称',
  thumbnail_url VARCHAR(500) NOT NULL COMMENT '缩略图URL',
  full_url VARCHAR(500) NOT NULL COMMENT '原图URL',
  width INT COMMENT '图片宽度',
  height INT COMMENT '图片高度',
  file_size INT COMMENT '文件大小',
  tags JSON COMMENT '标签数组',
  sort_order INT DEFAULT 0 COMMENT '排序顺序',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_user_id (user_id),
  INDEX idx_category (category),
  INDEX idx_series (series_name),
  INDEX idx_created_at (created_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='海报收藏表';
```

### 步骤2：同步代码

```bash
cd /path/to/haoyouji-web
git pull origin main
```

### 步骤3：安装依赖

```bash
pnpm install
cd client && pnpm install
```

### 步骤4：构建前端

```bash
cd /path/to/haoyouji-web/client
pnpm build
```

### 步骤5：重启服务器

```bash
cd /path/to/haoyouji-web
pm2 restart haoyouji-web
pm2 logs haoyouji-web --lines 50
```

### 步骤6：验证功能

1. 访问 https://www.jiangyuchen.cn
2. 登录账号
3. 进入个人中心
4. 点击"我的收藏"
5. 确认页面正常显示

## 涉及的文件

### 新增文件
- `server/db-poster-favorites.ts` - 数据库操作
- `server/poster-favorites-router.ts` - API路由
- `client/src/pages/PosterFavorites.tsx` - 前端页面
- `database/poster_favorites.sql` - 数据库表SQL

### 修改文件
- `server/routers.ts` - 注册新路由
- `server/cos-upload.ts` - 添加posters文件夹支持
- `client/src/App.tsx` - 添加页面路由
- `client/src/pages/Profile.tsx` - 集成收藏入口
- `client/src/pages/admin/ValuationManagement.tsx` - 修复市值管理页面错误

## 同时修复的问题

本次部署还修复了**市值管理页面报错**的问题：
- 问题：使用了错误的Link组件嵌套写法
- 修复：改用useLocation hook和navigate函数

## 后续工作

1. **上传示例海报到COS**
   - 使用 `manus-upload-file` 命令上传海报图片
   - 获取COS URL

2. **添加示例数据**
   ```sql
   INSERT INTO poster_favorites (user_id, title, description, category, series_name, thumbnail_url, full_url, tags) VALUES
   (1, 'KTV版宣传海报', '用别人的老婆赚钱 → KTV看到了', 'marketing', '脉动网宣传系列', 
    'https://your-cos-url/posters/ktv-thumbnail.jpg',
    'https://your-cos-url/posters/ktv-full.jpg',
    '["营销", "宣传", "脉动网"]');
   ```

3. **开发管理后台上传功能**（可选）
   - 方便管理员直接上传海报
   - 批量管理功能

## 检查清单

- [ ] 数据库表创建成功
- [ ] 代码同步完成
- [ ] 依赖安装完成
- [ ] 前端构建成功
- [ ] 服务器重启成功
- [ ] "我的收藏"可以访问
- [ ] 海报收藏页面正常显示
- [ ] 市值管理页面不再报错
- [ ] 无控制台错误

## 问题排查

如果遇到问题，请检查：

1. **数据库表是否创建成功**
   ```sql
   SHOW TABLES LIKE 'poster_favorites';
   DESC poster_favorites;
   ```

2. **服务器日志**
   ```bash
   pm2 logs haoyouji-web --lines 100
   ```

3. **前端构建是否成功**
   ```bash
   ls -la client/dist/public/
   ```

4. **API是否正常**
   - 打开浏览器开发者工具
   - 查看Network标签
   - 检查API请求是否返回200

---

**部署日期**：2025-02-20
**功能版本**：v1.0
