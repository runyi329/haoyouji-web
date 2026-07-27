# 企伴（Qiban）项目沙箱迁移说明

本文档记录了将企伴/脉动网项目迁移至新沙箱工作环境所需的所有配置信息，包括代码仓库、服务器地址、数据库地址、存储配置及相关环境变量。

## 1. 代码仓库与服务器信息

| 配置项 | 值 |
| --- | --- |
| **GitHub 仓库** | `https://github.com/runyi329/haoyouji-web` |
| **克隆命令** | `git clone https://github.com/runyi329/haoyouji-web.git` |
| **部署服务器 IP** | `124.223.54.69` |
| **服务器登录用户名** | `ubuntu` (使用 SSH Key 登录) |
| **应用访问地址** | `https://jiangyuchen.cn` |
| **本地开发端口** | 脉动网: `3009`, 企伴: `3000` |

## 2. 数据库配置

项目使用同一个 MySQL 实例（`crm_db`），企伴表使用 `qiban_` 前缀，与脉动网共用数据库。

| 环境 | 数据库连接字符串 (DATABASE_URL) |
| --- | --- |
| **生产环境 / 主库** | `mysql://root:Miao@20190603@124.223.54.69:3306/crm_db` |
| **本地开发 / 测试库** | `mysql://haoyouji:haoyouji123@localhost:3306/haoyouji_dev` |
| **TiDB 云端备份** | `mysql://username:password@gateway03.us-east-1.prod.aws.tidbcloud.com:4000/dWfvfUieyVkmVGc44bjad7` |

## 3. 存储桶配置 (腾讯云 COS)

图片和文件的上传存储使用腾讯云 COS。

| 配置项 | 值 |
| --- | --- |
| **COS_BUCKET** | `haoyouji-images-1396946788` |
| **COS_REGION** | `ap-shanghai` |
| **COS_SECRET_ID** | *(需从原环境或服务器获取)* |
| **COS_SECRET_KEY** | *(需从原环境或服务器获取)* |

## 4. 关键环境变量 (.env)

新沙箱环境需创建 `.env` 文件，并包含以下核心变量：

```env
# 数据库连接 (生产库)
DATABASE_URL="mysql://root:Miao@20190603@124.223.54.69:3306/crm_db"
ORIGINAL_DATABASE_URL="mysql://root:Miao@20190603@124.223.54.69:3306/crm_db"

# 基础配置
NODE_ENV=production
PORT=3009
VITE_APP_TITLE="好友记"
VITE_API_URL="https://jiangyuchen.cn"

# API 密钥 (请替换为真实密钥)
DEEPSEEK_API_KEY="YOUR_DEEPSEEK_KEY"
HUNYUAN_API_KEY="YOUR_HUNYUAN_KEY"
HUNYUAN_API_BASE="https://api.hunyuan.cloud.tencent.com/v1"

# Manus Forge 存储 API
BUILT_IN_FORGE_API_URL="https://api.manus.im/api/forge"
BUILT_IN_FORGE_API_KEY="YOUR_FORGE_KEY"
VITE_FRONTEND_FORGE_API_URL="https://forge.butterfly-effect.dev"
```

## 5. 新沙箱恢复步骤

在新沙箱中继续开发，请执行以下步骤：

1. 克隆代码库：`git clone https://github.com/runyi329/haoyouji-web.git`
2. 进入目录：`cd haoyouji-web`
3. 复制环境变量文件：将上述第 4 节的环境变量保存为 `.env` 文件
4. 安装依赖：`pnpm install`
5. 启动服务：`pnpm dev` (前端监听 3000，后端监听 3009)
6. 阅读专属开发指南：查阅 `/home/ubuntu/skills/haoyouji-web/SKILL.md`

## 6. 最新功能状态（代理记账管理）

最近一次 Commit (`3c608324c`) 已在脉动网后台(`/admin`)添加了"企伴管理"Tab，包含：
- **企业审核面板**：查看企业申请并进行审核操作
- **申报表管理面板**：按企业筛选申报表，支持上传文件/粘贴文字触发 AI 解析
- 相关数据表已在 `drizzle/schema.ts` 中映射：`qibanClientCompanies`, `qibanDeclarations`, `qibanInvoiceSuggestions`

新沙箱可以直接在此基础上继续开发。
