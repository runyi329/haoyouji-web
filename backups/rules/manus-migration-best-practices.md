# Manus 平台项目迁移与数据备份最佳实践

> 基于奖金制度研究平台（bonus.jiangyuchen.cn）的真实开发经验总结。
> 适用于所有在 Manus 平台上开发和维护 Web 项目的团队。

---

## 一、先搞清楚：什么东西放在哪里

在 Manus 平台上开发一个项目，涉及三个完全独立的存储位置，理解这一点是一切的基础。

```
┌─────────────────────────────────────────────────────────┐
│  沙箱（Sandbox）                                         │
│  /home/ubuntu/项目目录/                                  │
│  • 临时工作台，用于编写和调试代码                         │
│  • 沙箱休眠/重置后内容可能丢失                           │
│  • 不存放任何不可再生的内容                              │
└─────────────────────┬───────────────────────────────────┘
                      │ 代码推送
┌─────────────────────▼───────────────────────────────────┐
│  GitHub 仓库（代码备份）                                  │
│  runyi329/haoyouji-web / backups/项目名/                 │
│  • 代码的永久存档                                        │
│  • 不包含数据库内容                                      │
│  • 不包含环境变量/密钥                                   │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  Manus 平台（线上运行）                                   │
│  项目 ID：CHKNJmtWXcig3PadPxMzN3（奖金平台举例）         │
│  • 服务器：Manus 云，24 小时运行                         │
│  • 数据库：TiDB Cloud，数据持久存储                      │
│  • 环境变量：Manus Secrets，加密保存                     │
│  • 域名绑定：bonus.jiangyuchen.cn                        │
│  ⚠️ 与沙箱完全独立，沙箱丢失不影响线上服务               │
└─────────────────────────────────────────────────────────┘
```

**核心认知**：沙箱是临时的，Manus 平台是永久的。备份的目的是保护代码，而不是保护沙箱。

---

## 二、三种「转移」场景的本质区别

很多人在做项目转移时感到困惑，是因为混淆了三种完全不同的操作。

### 场景 A：沙箱丢失，继续开发同一个项目

**本质**：只是换了一个工作台，项目本身没有变化。

```
旧沙箱（丢失）         Manus 平台（一直在运行）
     ×           →    服务器 ✅  数据库 ✅  域名 ✅
                           ↑
新沙箱                从 GitHub 拉代码，连回原项目
```

**操作步骤**：
1. 在新沙箱克隆 GitHub 代码：`gh repo clone runyi329/haoyouji-web`
2. 进入 `backups/项目名/` 查看项目说明文档，确认 Manus 项目 ID
3. 在 Manus 平台找到原项目（用项目 ID），确认数据库连接串和环境变量
4. 开始继续开发，数据库里的数据一条都没丢

**数据库**：完全不需要处理，数据一直在 TiDB Cloud 上。

---

### 场景 B：在同一个 Manus 项目内回滚代码

**本质**：代码版本回退，数据库不动。

```
Manus 项目
├── 代码（Checkpoint）← 可以回滚到任意历史版本
└── 数据库           ← 永远不受 Checkpoint 影响
```

**操作方式**：Manus 后台 → Version History → 选择历史 Checkpoint → Rollback

**注意**：Checkpoint 只管代码，不管数据。如果你在新版本里往数据库加了数据，回滚代码后这些数据还在，可能造成新旧数据不一致。

---

### 场景 C：新建一个 Manus 项目（真正的迁移）

**本质**：创建了一个全新的独立环境，代码和数据都需要重新处理。

```
旧 Manus 项目                    新 Manus 项目
├── 代码  ──→ GitHub 备份 ──→    ├── 代码（从 GitHub 拉）✅
├── 数据库 ──→ 手动导出 ──→      ├── 数据库（空的！需要导入）⚠️
├── 环境变量 ──→ 手动记录 ──→    ├── 环境变量（需要重新配置）⚠️
└── 域名绑定 ──→ 重新配置 ──→    └── 域名绑定（需要重新绑定）⚠️
```

**这就是「感觉完全不一样」的原因**：代码可以从 GitHub 拉，但数据库是空的，环境变量是空的，域名绑定也没有。

**什么时候才需要场景 C**：
- 旧项目被意外删除，无法找回
- 需要把项目从 Manus 迁移到其他平台
- 需要完整复制一个项目（如从测试环境复制到生产环境）

---

## 三、数据备份策略

### 3.1 代码备份（必须做）

代码是可以完整备份到 GitHub 的，也是最容易恢复的部分。

**备份命令**（用户说「备份」时 AI 自动执行）：
```bash
cd /home/ubuntu/haoyouji-web-git
git pull --rebase
rsync -av --delete \
  --exclude='node_modules' --exclude='.git' --exclude='.manus-logs' \
  /home/ubuntu/项目目录/ backups/项目名/
git add backups/项目名/
git commit -m "backup: 更新代码备份 $(date '+%Y-%m-%d')"
git push
```

**备份频率建议**：每次完成一个功能模块后备份一次，至少每天备份一次。

---

### 3.2 数据库备份（重要，但容易被忽视）

数据库内容**不会**自动备份到 GitHub，需要单独处理。

**方式一：Manus 后台导出（推荐）**
1. 打开 Manus 后台 → Database 面板
2. 找到需要导出的表
3. 使用导出功能下载 SQL 文件
4. 将 SQL 文件保存到 `backups/项目名/database-backup/` 并推送到 GitHub

**方式二：通过连接串直接导出**
```bash
# 需要先在项目说明文档中找到数据库连接串
mysqldump -h gateway03.us-east-1.prod.aws.tidbcloud.com \
  -P 4000 -u 用户名 -p 数据库名 > backup_$(date '+%Y%m%d').sql
```

**数据库备份频率建议**：
- 开发阶段（无真实用户数据）：每周一次即可
- 上线后有真实用户数据：每天自动备份（可配置 Manus Heartbeat 定时任务）

---

### 3.3 环境变量备份（必须文档化，但不能明文存 GitHub）

环境变量包含密钥，**绝对不能**明文推送到 GitHub（即使是私有仓库）。

**正确做法**：在 `backups/项目名/项目说明文档.md` 里记录**变量名**和**获取方式**，不记录实际值。

```markdown
## 环境变量清单

| 变量名 | 说明 | 获取方式 |
|---|---|---|
| DATABASE_URL | TiDB Cloud 连接串 | Manus Database 面板左下角设置 |
| HAOYOUJI_SHARED_SECRET | SSO 共享密钥 | 固定值，见 AI-ONBOARDING.md H-3 节 |
| JWT_SECRET | Session 签名密钥 | Manus 自动注入，无需手动设置 |
```

**例外**：对于固定的、非敏感的配置值（如 SSO 共享密钥 `mlm-bonus-shared-secret-2026`），可以在内部文档中明文记录，因为它需要两端同步，必须让新沙箱 AI 知道。

---

## 四、项目说明文档模板（每个子项目必须有）

每个子项目在 `backups/项目名/项目说明文档.md` 里必须包含以
下内容：

```markdown
# 项目名称 项目说明文档

## 一、基本信息
- 项目名：xxx
- Manus 项目 ID：xxxxxxxxxxxxxxxx  ← 最重要，用于找回项目
- 创建日期：YYYY-MM-DD
- 负责人：胡先生

## 二、访问地址
- 线上地址：https://xxx.jiangyuchen.cn
- Manus 自动域名（备用）：https://xxx-xxxxxxxx.manus.space

## 三、基础设施
- 服务器：Manus 云（无需 SSH，通过 Manus 后台管理）
- 数据库：TiDB Cloud · gateway03.us-east-1.prod.aws.tidbcloud.com:4000
- 数据库名：xxx_db

## 四、环境变量清单
| 变量名 | 说明 | 值/获取方式 |
|---|---|---|
| DATABASE_URL | 数据库连接串 | Manus Database 面板查看 |
| HAOYOUJI_SHARED_SECRET | SSO 密钥 | mlm-bonus-shared-secret-2026 |

## 五、域名配置
- DNS 管理平台：腾讯云 DNSPod（console.cloud.tencent.com → DNS 解析）
- CNAME 记录：xxx.jiangyuchen.cn → xxx-xxxxxxxx.manus.space

## 六、SSO 配置
- 验证端点：server/_core/oauth.ts → /api/auth/external-login
- 脉动网签发：server/routers.ts → auth.xxxSsoLink

## 七、沙箱丢失后的恢复步骤
1. 在 Manus 平台用项目 ID 找到原项目 → 线上服务和数据库仍在
2. 克隆代码：gh repo clone runyi329/haoyouji-web，进入 backups/项目名/
3. 确认 Manus Secrets 中的环境变量与本文档一致
4. 确认域名绑定正常，开始继续开发

## 八、功能模块说明
（描述主要功能模块，方便新 AI 快速了解）
```

---

## 五、常见错误与正确做法对照

### 错误一：新建 Manus 项目来「恢复」沙箱丢失的项目

| | 错误做法 | 正确做法 |
|---|---|---|
| **操作** | 新建一个 Manus 项目，把代码拉进去 | 找回原来的 Manus 项目 ID，在新沙箱连回去 |
| **结果** | 数据库是空的，域名需要重新绑定，环境变量需要重新配置 | 数据库完整，域名正常，环境变量不变 |
| **原因** | 误以为「项目」在沙箱里，实际上项目在 Manus 平台上 | 理解了沙箱只是工作台 |

---

### 错误二：把数据库连接串当成代码推送到 GitHub

```bash
# ❌ 错误：把 .env 文件推送到 GitHub
git add .env
git commit -m "add env"

# ✅ 正确：.env 在 .gitignore 里，只记录变量名和获取方式
echo ".env" >> .gitignore
```

---

### 错误三：依赖 Manus Checkpoint 作为唯一备份

Manus Checkpoint 是部署工具，不是备份工具。

| | Manus Checkpoint | GitHub 备份 |
|---|---|---|
| **存储位置** | Manus 内部服务器 | GitHub（你控制） |
| **包含内容** | 代码快照 | 代码快照 |
| **可访问性** | 只能在 Manus 平台使用 | 任何地方都能克隆 |
| **项目删除后** | 可能随项目消失 | 永久保留 |
| **适合用途** | 部署回滚 | 长期存档、跨平台恢复 |

**结论**：两者都要做，不能互相替代。

---

### 错误四：真正迁移时忘记迁移数据库

如果确实需要新建 Manus 项目（场景 C），必须按以下顺序操作：

```
第一步：导出旧数据库
  → Manus 旧项目 Database 面板 → 导出所有表的 SQL

第二步：新建 Manus 项目，拉取代码
  → gh repo clone，复制 backups/项目名/ 到新沙箱工作目录

第三步：配置环境变量
  → Manus 新项目 Settings → Secrets → 逐一填入

第四步：执行数据库迁移 SQL
  → 先跑 Schema 建表 SQL，再导入数据 SQL

第五步：重新绑定域名
  → 腾讯云 DNSPod 修改 CNAME 指向新 Manus 自动域名
  → Manus 新项目 Settings → Domains → 绑定子域名

第六步：验证 SSO 和 iframe 正常工作
  → 从脉动网点击入口，确认能正常跳转和登录
```

---

## 六、决策树：我应该怎么做？

```
问题：我的沙箱丢了/代码不见了，怎么办？
│
├─ Manus 平台上的项目还在吗？（用项目 ID 查）
│   ├─ 还在 → 【场景 A】新沙箱克隆代码，连回原项目，5 分钟恢复
│   └─ 不在了 → 继续往下
│
├─ GitHub 上有代码备份吗？（backups/项目名/）
│   ├─ 有 → 【场景 C】新建 Manus 项目，拉代码，迁移数据库（耗时较长）
│   └─ 没有 → 代码丢失，只能从头重写（这就是为什么要定期备份）
│
问题：我需要把项目从 A 迁移到 B，怎么做？
│
├─ 只是换沙箱，Manus 项目不变 → 【场景 A】
├─ 代码回退到历史版本 → 【场景 B】Manus Checkpoint Rollback
└─ 新建 Manus 项目 → 【场景 C】完整迁移流程
```

---

## 七、与脉动网项目的关系

脉动网（jiangyuchen.cn）是主站，所有子项目都是它的卫星项目。

```
脉动网主站（腾讯云服务器）
├── 服务器：124.223.54.69（PM2 管理）
├── 数据库：腾讯云 MySQL（crm_db）
└── 部署：GitHub Actions bg-deploy.yml（push 到 main 触发）

子项目（Manus 平台）
├── 奖金平台：bonus.jiangyuchen.cn（项目 ID: CHKNJmtWXcig3PadPxMzN3）
├── 期权监控：eth-options-monitor（待绑定子域名）
└── 未来子项目...
```

子项目与主站通过 SSO（HMAC-SHA256 签名）共享登录状态，通过 iframe 嵌入主站页面。两者的服务器、数据库完全独立，互不影响。

---

*最后更新：2026-07-17 | 基于奖金制度研究平台真实经验总结*
