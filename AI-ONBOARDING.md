# AI 新沙箱入职文档

> 你是新沙箱的 AI。读完这个文件，你就了解了所有背景，可以直接开始工作。
> 无需再问用户任何背景问题，直接告诉用户你已了解，然后问他今天要做什么。

---

## 一、这是什么仓库

这是 **脉动网（jiangyuchen.cn）** 的代码仓库，由投资人胡先生创建和维护。

- **主站**：https://www.jiangyuchen.cn
- **GitHub 仓库**：`runyi329/haoyouji-web`（私有仓库，需要 Token 克隆）
- **技术栈**：React 19 + tRPC + Drizzle ORM + MySQL（腾讯云）+ Tailwind CSS 4
- **服务器**：腾讯云轻量应用服务器（124.223.54.69），PM2 管理进程
- **部署方式**：推送到 `main` 分支自动触发 GitHub Actions 部署（`bg-deploy.yml`）

---

## 二、仓库目录结构

```
runyi329/haoyouji-web/
├── client/                    # 前端 React 代码
│   └── src/
│       ├── pages/             # 页面组件
│       ├── lib/rulesData.tsx  # 规则库（JSX 格式，网页渲染用）
│       └── ...
├── server/                    # 后端 Express + tRPC
├── drizzle/                   # 数据库 Schema 和迁移
├── backups/                   # 子项目代码备份（不触发自动部署）
│   ├── mlm-bonus-system/      # 奖金制度研究平台
│   │   └── 项目说明文档.md    # 子项目完整说明（含数据库、环境变量、恢复步骤）
│   └── rules/                 # 规则纯文字版（供 AI 直接阅读）
├── .github/workflows/
│   └── bg-deploy.yml          # 自动部署（paths-ignore: backups/**)
└── AI-ONBOARDING.md           # 本文件
```

> **重要**：`backups/**` 目录的推送不触发自动部署，专门用于代码备份和文档存档。

---

## 三、现有子项目列表

### 子项目 1：奖金制度研究平台

| 项目 | 内容 |
|---|---|
| **名称** | MLM 奖金制度研究平台 |
| **访问地址** | https://bonus.jiangyuchen.cn |
| **Manus 项目 ID** | `CHKNJmtWXcig3PadPxMzN3` |
| **Manus 自动域名** | `mlmbonus-chknjmtw.manus.space` |
| **代码备份位置** | `backups/mlm-bonus-system/` |
| **详细说明文档** | `backups/mlm-bonus-system/项目说明文档.md` |
| **数据库** | TiDB Cloud · `gateway03.us-east-1.prod.aws.tidbcloud.com:4000` |
| **脉动网入口** | `/mlm-bonus` 路由 → `MlmBonusPage.tsx`（iframe 嵌入） |

**恢复此项目**：读取 `backups/mlm-bonus-system/项目说明文档.md`，按第九章「沙箱丢失后的恢复步骤」操作。

---

## 四、新建子项目规范（H 板块完整规则）

> 每次新建子项目，严格按照以下规范执行，确保将来能顺利合并到脉动网主站。

### H-0 什么是 Manus 子项目

子项目是独立部署在 Manus 平台上的 Web 应用，通过子域名（如 `bonus.jiangyuchen.cn`）访问，通过 SSO 与脉动网共享登录状态，代码备份到同一个 GitHub 仓库。

### H-1 创建步骤（5 步）

1. 在 Manus 平台新建项目，选择「Web App（tRPC + Manus Auth + Database）」模板
2. 技术栈自动配置（React 19 + tRPC 11 + Drizzle + Tailwind 4）
3. 在 Manus Settings → Secrets 关闭 Manus OAuth，改用脉动网 SSO
4. 配置 `HAOYOUJI_SHARED_SECRET` 环境变量（见下方密钥规范）
5. 绑定子域名（见 H-4）

### H-1.5 技术栈对齐规范（与脉动网保持一致，合并时零摩擦）

**必须锁定的核心依赖版本：**

| 包 | 版本 |
|---|---|
| react | 19.2.1 |
| @trpc/server / @trpc/client | 11.6.0 |
| drizzle-orm | 0.44.5 |
| tailwindcss | 4.1.14 |
| wouter | 3.3.5 |
| zod | 4.1.12 |
| typescript | 5.9.3 |

> 使用 Manus 官方模板即可自动对齐，无需手动指定版本。

**品牌色与样式（必须复制到 `client/src/index.css`）：**

```css
--brand-red: #D32F2F;      /* 脉动红 */
--brand-gold: #CBA471;     /* 至尊金 */
--bg-cream: #FAF3ED;       /* 杏白底色 */
/* 字体：Nunito（Google Fonts） */
```

**命名规范：**
- 路由文件：`server/子项目代号-router.ts`（如 `mlm-bonus-router.ts`）
- tRPC 过程名加子项目前缀（如 `mlmBonus.simulate`）
- 数据库表名加子项目前缀（如 `mlm_companies`、`mlm_schemes`）

**禁止引入的依赖（会与脉动网冲突）：**
- `react-router-dom`（用 wouter）
- `axios`（用 tRPC）
- `moment.js`（用原生 Date API 或 date-fns）
- 任何 CSS-in-JS 库（用 Tailwind）

**对齐检查清单（新建子项目时逐项确认）：**
- [ ] 使用 Manus 官方模板（版本自动对齐）
- [ ] index.css 已复制脉动网品牌色变量
- [ ] 后端路由独立文件，命名加子项目前缀
- [ ] 数据库表名加子项目前缀
- [ ] 时间戳用 `timestamp { mode: 'string' }`，金额用 `decimal(18,6)`
- [ ] 未引入 react-router-dom / axios / moment / CSS-in-JS

### H-2 基础设施位置

子项目的所有基础设施都在 **Manus 平台**，与脉动网腾讯云完全独立：

| 资源 | 位置 | 如何找到 |
|---|---|---|
| 服务器 | Manus 云（Cloudflare + Cloud Run） | Manus 后台 Dashboard 面板，无需 SSH |
| 数据库 | TiDB Cloud（AWS us-east-1） | Manus 后台 Database 面板，左下角设置查看连接串 |
| 存储桶 | Manus S3 | 代码中用 `storagePut/storageGet` 操作 |
| 环境变量 | Manus Secrets | Manus 后台 Settings → Secrets |
| 域名/SSL | Cloudflare（自动） | Manus 后台 Settings → Domains |

> 注意：子项目数据库与脉动网腾讯云 MySQL（124.223.54.69:3306 / crm_db）完全独立，互不影响。

### H-3 SSO 单点登录（HMAC 签名方案）

子项目不建立独立账号体系，用户必须从脉动网跳入，自动登录。

**完整流程：**
1. 用户在脉动网点击入口
2. 脉动网前端调用 `trpc.auth.mlmSsoLink` 生成签名链接
3. 脉动网后端用 HMAC-SHA256 对 `uid:name:ts` 签名（ts 为 Unix 时间戳秒）
4. 生成跳转 URL：`https://子项目域名/api/auth/external-login?uid=xxx&name=xxx&ts=xxx&sign=xxx`
5. 子项目验证签名（有效期 5 分钟），验证通过后写入 session，用户自动登录

**代码位置：**
- 脉动网签发：`server/routers.ts` → `auth.mlmSsoLink` 过程
- 子项目验证：`server/_core/oauth.ts` → `/api/auth/external-login` 端点
- 脉动网入口页：`client/src/pages/MlmBonusPage.tsx`（iframe 嵌入）

**🔑 统一密钥规范（所有子项目共用，不单独生成新密钥）：**

```
环境变量名：HAOYOUJI_SHARED_SECRET
密钥值：mlm-bonus-shared-secret-2026
```

> ⚠️ 新建子项目时，直接填入此值，无需生成新密钥。若将来需要更换，所有子项目和脉动网主站必须同步更新。

子项目还需在 `server/_core/index.ts` 添加 CSP 响应头，允许脉动网域名 iframe 嵌入：
```
frame-ancestors 'self' https://jiangyuchen.cn https://www.jiangyuchen.cn
```

### H-4 自定义域名绑定

1. **腾讯云 DNS** 添加 CNAME 记录：
   - 主机记录：子项目名（如 `bonus`）
   - 记录类型：CNAME
   - 记录值：Manus 自动域名（如 `mlmbonus-chknjmtw.manus.space`）
2. **Manus 后台** Settings → Domains → 填入 `子项目名.jiangyuchen.cn` → 保存
3. 等待 DNS 生效（通常 5 分钟内），SSL 证书由 Cloudflare 自动签发

**奖金平台举例：**
- 腾讯云 DNS：`bonus` CNAME → `mlmbonus-chknjmtw.manus.space`
- 最终访问地址：`https://bonus.jiangyuchen.cn`

### H-5 代码备份规范

#### 备份位置规则（每个子项目一个独立文件夹）

所有子项目代码统一备份到 **同一个 GitHub 仓库**（`runyi329/haoyouji-web`），不单独建仓库。每个子项目在 `backups/` 下创建独立文件夹，结构如下：

```
backups/
├── mlm-bonus-system/      ← 奖金制度研究平台（已存在）
│   ├── 项目说明文档.md
│   ├── client/
│   ├── server/
│   ├── drizzle/
│   └── package.json
├── 下一个子项目名/         ← 新建时照此结构创建
│   ├── 项目说明文档.md
│   └── ...
└── rules/                 ← 规则纯文字版（供 AI 阅读）
```

> 新建子项目时，直接以 Manus 项目目录名作为文件夹名（如 Manus 项目叫 `crm-system`，则备份到 `backups/crm-system/`）。

#### 哪些推送触发脉动网自动部署，哪些不触发

| 推送内容 | 是否触发脉动网部署 | 说明 |
|---|---|---|
| `client/**`（前端代码） | ✅ 触发 | 脉动网主站代码 |
| `server/**`（后端代码） | ✅ 触发 | 脉动网主站代码 |
| `drizzle/**`（数据库） | ✅ 触发 | 脉动网主站代码 |
| `client/src/lib/rulesData.tsx` | ✅ 触发 | 规则库更新 |
| `AI-ONBOARDING.md` | ✅ 触发 | 根目录文档（但不影响功能） |
| `backups/**` | ❌ 不触发 | 已在 `bg-deploy.yml` 的 `paths-ignore` 中过滤 |

> 配置位置：`.github/workflows/bg-deploy.yml` → `on.push.paths-ignore: ['backups/**']`

**备份位置：** `runyi329/haoyouji-web/backups/子项目名/`（不单独建仓库）

**备份命令（说「备份」时执行）：**
```bash
cd /home/ubuntu/haoyouji-web-git
git pull --rebase
rsync -av --delete \
  --exclude='node_modules' --exclude='.git' --exclude='.manus-logs' \
  /home/ubuntu/子项目目录/ backups/子项目名/
git add backups/子项目名/
git commit -m "backup: 更新子项目代码备份 $(date '+%Y-%m-%d')"
git push
```

> ⚠️ **Manus Checkpoint ≠ GitHub 备份**
> - Manus checkpoint（如 `1e86780f`）保存在 Manus 内部服务器，用于 Manus 平台部署
> - GitHub 备份需要手动执行上述命令，说「备份」AI 会自动执行
> - 两者完全独立，不能互相替代

**路径过滤（`bg-deploy.yml` 已配置）：**
- `backups/**` 的推送不触发脉动网自动部署
- 若需要恢复触发，删除 `paths-ignore` 中的 `backups/**` 即可

### H-6 项目说明文档必须包含的内容（8 章）

每个子项目必须在 `backups/子项目名/项目说明文档.md` 里写清楚：

1. 基本信息（项目名、Manus 项目 ID、创建日期）
2. 访问地址（子域名、Manus 自动域名）
3. 基础设施（数据库连接串、服务器位置、存储桶）
4. 环境变量（所有变量名和值）
5. 域名配置（CNAME 记录）
6. SSO 配置（密钥、相关代码文件位置）
7. 沙箱丢失后的恢复步骤（4 步）
8. 功能模块说明

### H-7 沙箱丢失后如何恢复（4 步）

1. 在 Manus 平台找回原项目（用项目 ID）→ 数据库和线上网站仍在
2. 克隆 GitHub 代码：`gh repo clone runyi329/haoyouji-web`，进入 `backups/子项目名/`
3. 确认 Manus Settings → Secrets 中的环境变量与说明文档一致
4. 确认域名绑定正常，开始继续开发

### H-8 将来合并到脉动网主站（四阶段）

**合并时机**（满足任一即可启动）：日活 > 50 人 / 功能高度重叠 / 需要主站积分会员能力

**合并前检查清单：**
- [ ] 技术栈版本一致（对照 H-1.5）
- [ ] 路由命名无冲突（在脉动网 `routers.ts` 搜索子项目前缀）
- [ ] 表名无冲突（在脉动网 `schema.ts` 搜索子项目前缀）
- [ ] 数据已备份（从 Manus Database 面板导出）
- [ ] 脉动网代码已拉最新（`git pull --rebase`）

**第一阶段：前端合并**
- 复制 `pages/` 和 `components/` 到脉动网
- 修改 tRPC 调用路径加命名空间前缀
- 删除 SSO 登录代码，改用 `useAuth()`
- 在 `App.tsx` 注册路由

**第二阶段：后端合并**
- 复制路由文件到脉动网 `server/`
- 删除 `/api/auth/external-login` 端点
- 将 JWT 解析用户改为读 `ctx.user.id`
- 在 `routers.ts` 注册一行：`子项目名: 子项目Router`

**第三阶段：数据库迁移**
- 导出子项目所有表数据
- 合并 Schema 到脉动网 `drizzle/schema.ts`
- 执行迁移 SQL，导入历史数据

**第四阶段：域名与收尾**
- 冒烟测试通过后部署脉动网
- 设置子域名 301 重定向到主站对应路径
- Manus 子项目设为不可见
- 项目说明文档追加合并记录

---

## 五、开发工作流约定

### 每次开始工作前
```bash
cd /home/ubuntu/haoyouji-web-git && git pull --rebase
```

### 每次结束工作时（用户说「备份」）
执行 H-5 的备份命令，把最新代码推送到 GitHub。

### 推送脉动网改动
```bash
cd /home/ubuntu/haoyouji-web-git
git add .
git commit -m "feat/fix/docs: 描述"
git push
# 等待 GitHub Actions bg-deploy 绿灯后告知用户
```

---

## 六、新沙箱 AI 入职第一步

当你是新沙箱 AI，刚收到用户发来的 GitHub Token 时，按以下步骤操作：

```bash
# 第一步：登录 GitHub
gh auth login --with-token <<< "ghp_用户提供的Token"

# 第二步：克隆仓库
gh repo clone runyi329/haoyouji-web /home/ubuntu/haoyouji-web-git

# 第三步：读取本文件（你现在正在读的这个）
cat /home/ubuntu/haoyouji-web-git/AI-ONBOARDING.md

# 第四步：如果要继续开发奖金平台，读取子项目说明文档
cat /home/ubuntu/haoyouji-web-git/backups/mlm-bonus-system/项目说明文档.md
```

读完后，告诉用户：「我已了解脉动网项目背景，奖金平台 Manus 项目 ID 是 CHKNJmtWXcig3PadPxMzN3，请问今天要做什么？」

---

## 七、常用命令速查

```bash
# 克隆仓库（需要 GitHub Token）
gh auth login --with-token <<< "ghp_xxxxxx"
gh repo clone runyi329/haoyouji-web

# 查看脉动网部署状态
# 打开 https://github.com/runyi329/haoyouji-web/actions

# 奖金平台本地开发
cd /home/ubuntu/mlm-bonus-system && pnpm dev

# 脉动网本地开发
cd /home/ubuntu/haoyouji-web-git && pnpm dev
```

---

*最后更新：2026-07-13 | 维护者：胡先生 / Manus AI*
