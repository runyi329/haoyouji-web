# 脉动 - 产品业务规则文档

> 本文档记录脉动平台所有核心业务规则和产品逻辑，供开发时参考。
> 最后更新：2026-03-05

---

## §1 路由与访问控制

### §1.1 主站首页访问控制（HomeEntry）

**规则**：用户访问 `/`（主站首页）时：

| 用户状态 | 行为 |
|----------|------|
| **已登录** | 正常显示人脉首页（`Home.tsx`） |
| **未登录** | 自动跳转到 `/login` 登录页 |
| **加载中** | 显示空白（不渲染内容，避免闪烁） |

**实现位置**：`client/src/pages/HomeEntry.tsx`

**特殊规则**：
- `liulifan` 用户首次打开网站时，自动跳转到奢贝首页 `/beauty`（仅每次会话跳转一次，由 `App.tsx` Router 组件处理）
- `cx8618` 用户点击底部中间按钮时，跳转到红酒商会 `/wine`（由 `BottomNav.tsx` 处理）

---

### §1.2 商家子站访问控制

**规则**：商家专属页面（如 `/wine`、`/beauty`）对所有用户开放（无需登录），但部分功能需要登录：

| 商家 | 路径 | 登录要求 |
|------|------|----------|
| 红酒文化商会（cx8618） | `/wine/*` | 首页公开，设置页需登录 |
| 奢贝美容院（liulifan） | `/beauty/*` | 首页公开，预约/积分需登录 |

---

## §2 商家功能规则

### §2.1 商家分享设置

商家可在"商家设置"页面（`/wine/settings`）配置以下分享信息：

| 字段 | 数据库列 | 说明 |
|------|----------|------|
| 商家 Logo | `share_logo` | 微信分享时的小图标（400×400px，WebP） |
| 分享封面图 | `share_cover_image` | 微信分享卡片大图（1200×630px） |
| 分享标题 | `share_title` | 微信分享卡片标题（最多50字） |
| 分享描述 | `share_description` | 微信分享卡片描述（最多100字） |

**微信分享图标实现方式**（§2.1.1）：

微信爬虫在用户分享链接时会抓取页面的静态 HTML，前端 JS 动态修改的 meta 标签**对微信爬虫无效**。因此采用**服务端注入**方案：

- 服务器在返回 HTML 时，检测请求路径是否为商家页面
- 若是，从数据库查询商家信息，将 `og:image`、`apple-touch-icon` 等 meta 标签注入到 `<head>` 中
- 实现位置：`server/_core/vite.ts` → `getMerchantMetaForPath()` 函数
- 商家路径映射：`MERCHANT_PATH_MAP`（`/wine` → `cx8618`）

**新增商家时**，需在 `server/_core/vite.ts` 的 `MERCHANT_PATH_MAP` 中添加对应映射。

---

### §2.2 商家图片上传

图片上传到腾讯云 COS，使用 drizzle ORM 的 `update()` 方法保存 URL 到数据库。

**注意**：不可使用 `(db as any).execute(sql, [params])` 语法，drizzle-orm 不支持参数数组，会导致 SQL 参数为 undefined。

正确写法：
```ts
await db.update(merchants).set({ share_logo: url }).where(eq(merchants.id, merchantId));
```

---

## §3 用户认证规则

### §3.1 登录方式

脉动平台使用**自建密码登录**（非 Manus OAuth），用户通过用户名+密码登录。

- 登录接口：`trpc.auth.loginWithPassword`
- 登录成功后，token 存储在 `localStorage('auth-token')` 和 Cookie `app_session_id` 中
- 登出时清除 localStorage token 和所有 React Query 缓存

### §3.2 认证状态读取

所有页面通过 `useAuth()` hook 读取当前用户状态：

```ts
const { user, loading, isAuthenticated, logout } = useAuth();
```

需要强制登录的页面，使用：
```ts
useAuth({ redirectOnUnauthenticated: true });
```

---

## §4 部署规则

### §4.1 PM2 进程管理

服务器使用 `ecosystem.config.cjs` 管理 PM2 进程和环境变量：
- 文件位置：`/root/haoyouji-web/ecosystem.config.cjs`（服务器本地，不提交到 Git）
- 包含：COS 密钥、数据库连接串、PORT=3001、NODE_ENV=production

### §4.2 Nginx 代理端口

Nginx 将 `jiangyuchen.cn` 反向代理到 `localhost:3001`，PM2 进程**必须**监听 3001 端口。

### §4.3 GitHub Actions 部署

每次推送到 `main` 分支自动触发部署，部署命令：
```bash
pm2 startOrRestart /root/haoyouji-web/ecosystem.config.cjs --env production
```

---

## §5 数据库规则

### §5.1 商家表（merchants）

关键字段：
- `merchantCode`：商家唯一标识（如 `cx8618`）
- `userId`：关联的用户 ID（本地数据库 ID，非 OAuth openId）
- `share_logo`、`share_cover_image`、`share_title`、`share_description`：分享设置
- `shopLogoUrl`：商家 Logo（备用字段）

---

*文档由 AI 助手维护，如有业务规则变更请及时更新本文档。*
