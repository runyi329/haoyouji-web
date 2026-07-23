# 企伴（qiban）子项目说明

## 项目概述

- **项目名称**：企伴（qiban）
- **定位**：企业服务与商业伙伴撮合平台
- **路由前缀**：`/qiban`
- **tRPC 命名空间**：`qiban.*`
- **数据库表前缀**：`qiban_`
- **创建时间**：2026-07-23

## 技术架构

与脉动网主项目共用以下资源（不独立部署）：
- 腾讯云 CVM 服务器（124.223.54.69）
- MySQL 8 数据库（本地部署，端口 3306）
- 腾讯云 COS 图片存储（haoyouji-images-1396946788）
- 脉动网 SSO 登录体系（用户 ID 与主项目共用）

## 数据库表

| 表名 | 说明 |
|---|---|
| `qiban_companies` | 企业档案表 |
| `qiban_partnerships` | 合作项目表 |
| `qiban_contracts` | 合同管理表 |
| `qiban_contacts` | 人脉联系人表 |

> 数据由管理员手动维护，不自动触发部署。

## 文件结构

```
client/src/pages/qiban/
  QibanHome.tsx          # 企伴首页（/qiban）
  QibanEntry.tsx         # SSO 入口跳转页（未来独立部署时使用）

server/
  qiban-router.ts        # 企伴 tRPC 路由（注册在 appRouter.qiban）

drizzle/schema.ts        # 末尾追加了 4 张 qiban_ 表定义
```

## 首页入口

脉动网首页第三页（AI商城分类网格）中，添加"企伴"分类入口。
点击后跳转到 `/qiban`。
图标由管理员在后台数据库 `merchant_categories` 表中手动添加，
字段：`name = '企伴'`，`iconUrl` 填写 COS 上传后的图片地址。

## 合并路径

本子项目代码已直接合并到脉动网主仓库（`haoyouji-web`），
无需单独仓库，随主项目 CI/CD 一起部署。

## 待办事项

- [ ] 将 `qiban-banner.webp` 上传至 COS，获取 URL 后在管理后台添加"企伴"分类
- [ ] 在生产数据库执行建表 SQL（见下方）
- [ ] 后续功能：企业档案列表/详情、合作项目管理、合同管理、人脉联系人

## 建表 SQL

```sql
-- 企业档案表
CREATE TABLE IF NOT EXISTS qiban_companies (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  short_name VARCHAR(64),
  unified_code VARCHAR(32),
  industry VARCHAR(64),
  province VARCHAR(32),
  city VARCHAR(32),
  address TEXT,
  contact_name VARCHAR(64),
  contact_phone VARCHAR(20),
  contact_email VARCHAR(128),
  website VARCHAR(255),
  logo_url TEXT,
  description TEXT,
  tags JSON,
  status ENUM('active','inactive','pending') NOT NULL DEFAULT 'active',
  created_by INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX qiban_companies_name_idx (name),
  INDEX qiban_companies_created_by_idx (created_by)
);

-- 合作项目表
CREATE TABLE IF NOT EXISTS qiban_partnerships (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  company_a_id INT NOT NULL,
  company_b_id INT,
  type ENUM('supply','distribution','investment','tech','other') NOT NULL DEFAULT 'other',
  status ENUM('draft','negotiating','signed','completed','cancelled') NOT NULL DEFAULT 'draft',
  description TEXT,
  expected_amount DECIMAL(18,2),
  start_date VARCHAR(20),
  end_date VARCHAR(20),
  created_by INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX qiban_partnerships_company_a_idx (company_a_id),
  INDEX qiban_partnerships_status_idx (status)
);

-- 合同表
CREATE TABLE IF NOT EXISTS qiban_contracts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  partnership_id INT,
  title VARCHAR(255) NOT NULL,
  party_a VARCHAR(255) NOT NULL,
  party_b VARCHAR(255) NOT NULL,
  amount DECIMAL(18,2),
  sign_date VARCHAR(20),
  expiry_date VARCHAR(20),
  file_url TEXT,
  status ENUM('draft','signed','expired','terminated') NOT NULL DEFAULT 'draft',
  note TEXT,
  created_by INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX qiban_contracts_created_by_idx (created_by),
  INDEX qiban_contracts_status_idx (status)
);

-- 人脉联系人表
CREATE TABLE IF NOT EXISTS qiban_contacts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT,
  name VARCHAR(64) NOT NULL,
  title VARCHAR(64),
  phone VARCHAR(20),
  email VARCHAR(128),
  wechat VARCHAR(64),
  avatar_url TEXT,
  tags JSON,
  note TEXT,
  created_by INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX qiban_contacts_company_idx (company_id),
  INDEX qiban_contacts_created_by_idx (created_by)
);
```
