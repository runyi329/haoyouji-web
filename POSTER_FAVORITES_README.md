# 海报收藏功能开发文档

## 功能概述

在个人中心新增"我的收藏"功能，支持海报的分类管理、缩略图展示、点击放大预览、一键下载等功能。所有海报图片存储在腾讯云COS。

## 已完成的开发工作

### 1. 数据库设计

**文件**: `server/db-poster-favorites.ts`

创建了 `poster_favorites` 表，包含以下字段：
- `id`: 主键
- `user_id`: 用户ID（外键关联users表）
- `title`: 海报标题
- `description`: 海报描述
- `category`: 海报分类（营销类、产品教程、特定对象、品牌宣传、活动类、其他）
- `series_name`: 系列名称（如：脉动网宣传系列）
- `thumbnail_url`: 缩略图URL（存储在COS）
- `full_url`: 原图URL（存储在COS）
- `width`: 图片宽度
- `height`: 图片高度
- `file_size`: 文件大小
- `tags`: 标签数组（JSON格式）
- `sort_order`: 排序顺序
- `created_at`: 创建时间
- `updated_at`: 更新时间

### 2. 后端API

**文件**: `server/poster-favorites-router.ts`

实现了以下tRPC路由：
- `getMyPosters`: 获取用户的所有海报收藏（支持分类筛选）
- `getPosterById`: 获取单个海报详情
- `createPoster`: 创建海报收藏（自动上传图片到COS）
- `updatePoster`: 更新海报信息
- `deletePoster`: 删除海报
- `getCategoryStats`: 获取分类统计

**已注册到主路由**: `server/routers.ts` 中已添加 `posterFavorites` 路由

### 3. COS上传功能

**文件**: `server/cos-upload.ts`

已扩展支持 `posters` 文件夹，海报图片将上传到：
- 缩略图: `posters/[timestamp]-[hash]-thumbnail.jpg`
- 原图: `posters/[timestamp]-[hash]-full.jpg`

### 4. 前端页面

**文件**: `client/src/pages/PosterFavorites.tsx`

实现了完整的海报收藏页面，包含：
- 顶部导航栏（返回按钮）
- 分类筛选器（全部、营销类、产品教程等）
- 网格布局展示海报缩略图（2列）
- 点击海报弹出预览对话框
- 预览对话框支持：
  - 显示完整海报图片
  - 显示标题、系列名、描述、标签
  - 一键下载功能
  - 删除功能

**路由配置**: 已在 `client/src/App.tsx` 中添加路由 `/parent/poster-favorites`

**个人中心集成**: 已在 `client/src/pages/Profile.tsx` 中将"我的收藏"功能链接到新页面

## 部署步骤

### 1. 创建数据库表

在生产环境数据库中执行以下SQL：

```sql
CREATE TABLE IF NOT EXISTS poster_favorites (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  title VARCHAR(255) NOT NULL COMMENT '海报标题',
  description TEXT COMMENT '海报描述',
  category VARCHAR(50) NOT NULL DEFAULT 'other' COMMENT '海报分类',
  series_name VARCHAR(255) COMMENT '系列名称（如：脉动网宣传系列）',
  thumbnail_url VARCHAR(500) NOT NULL COMMENT '缩略图URL',
  full_url VARCHAR(500) NOT NULL COMMENT '原图URL',
  width INT COMMENT '图片宽度',
  height INT COMMENT '图片高度',
  file_size INT COMMENT '文件大小（字节）',
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

### 2. 确认环境变量

确保以下COS相关环境变量已配置：
- `COS_SECRET_ID`: 腾讯云COS SecretId
- `COS_SECRET_KEY`: 腾讯云COS SecretKey
- `COS_BUCKET`: COS存储桶名称
- `COS_REGION`: COS区域

### 3. 部署代码

```bash
# 安装依赖（如有新增）
pnpm install

# 构建前端
cd client && pnpm build

# 重启服务器
pm2 restart haoyouji-web
```

## 使用说明

### 用户端使用流程

1. 用户进入个人中心
2. 点击"我的收藏"图标
3. 进入海报收藏页面
4. 可以通过分类筛选器查看不同类型的海报
5. 点击海报查看大图
6. 在预览对话框中可以下载或删除海报

### 管理员添加海报

目前需要通过API手动添加海报。未来可以开发管理后台上传功能。

**示例代码**（在服务器端执行）：

```typescript
import { createPosterFavorite } from './server/db-poster-favorites';
import fs from 'fs';

// 读取海报图片
const thumbnailBuffer = fs.readFileSync('/path/to/thumbnail.jpg');
const fullBuffer = fs.readFileSync('/path/to/full.jpg');

// 转换为base64
const thumbnailBase64 = `data:image/jpeg;base64,${thumbnailBuffer.toString('base64')}`;
const fullBase64 = `data:image/jpeg;base64,${fullBuffer.toString('base64')}`;

// 调用API创建海报
await trpc.posterFavorites.createPoster.mutate({
  title: 'KTV版宣传海报',
  description: '用别人的老婆赚钱 vs 用别人的人脉赚钱',
  category: 'marketing',
  seriesName: '脉动网宣传系列',
  thumbnailData: thumbnailBase64,
  fullData: fullBase64,
  tags: ['营销', '宣传', '脉动网'],
});
```

## 技术架构

### 前端技术栈
- React + TypeScript
- Wouter (路由)
- tRPC (API调用)
- Tailwind CSS (样式)
- Shadcn UI (组件库)
- Lucide React (图标)

### 后端技术栈
- Node.js + TypeScript
- tRPC (API框架)
- Drizzle ORM (数据库操作)
- MySQL (数据库)
- 腾讯云COS (对象存储)

## 待优化项

1. **图片上传优化**
   - 添加上传进度提示
   - 支持批量上传
   - 图片压缩优化

2. **管理后台**
   - 开发管理员上传海报的界面
   - 批量管理功能
   - 海报编辑功能

3. **用户体验**
   - 添加图片懒加载
   - 优化大图预览（支持缩放、拖拽）
   - 添加分享功能

4. **性能优化**
   - 实现虚拟滚动（海报数量多时）
   - CDN加速
   - 图片格式优化（WebP）

## 文件清单

### 新增文件
- `server/db-poster-favorites.ts` - 数据库操作
- `server/poster-favorites-router.ts` - API路由
- `client/src/pages/PosterFavorites.tsx` - 前端页面
- `init-poster-favorites-table.ts` - 数据库初始化脚本
- `POSTER_FAVORITES_README.md` - 本文档

### 修改文件
- `server/routers.ts` - 注册新路由
- `server/cos-upload.ts` - 添加posters文件夹支持
- `client/src/App.tsx` - 添加页面路由
- `client/src/pages/Profile.tsx` - 集成收藏入口

## 联系方式

如有问题，请联系开发团队。
