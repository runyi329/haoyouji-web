# 脉动平台 · 商家子页面开发规范

> 版本：v1.1 | 更新日期：2026-03-05
> 适用范围：所有接入脉动平台的商家专属子页面开发

---

## 一、整体架构说明

脉动平台采用"主 App + 商家子页面"的架构模式。每个商家拥有一套独立的子页面（如 `/wine`、`/beauty` 等），通过**底部导航栏中间按钮**与主 App 的"人脉"、"钱脉"两侧按钮并排展示，形成商家专属的沉浸式体验。

```
主 App 底部导航
┌──────────────────────────────────────┐
│  人脉   │   [商家中间按钮]   │  钱脉  │
└──────────────────────────────────────┘
```

---

## 二、底部导航栏规范（BottomNav）

**文件路径：** `client/src/components/BottomNav.tsx`

### 2.1 中间按钮规则

中间按钮为圆形悬浮按钮（`w-14 h-14 rounded-full`），是商家品牌的核心入口。

**规则一：文字与图标必须放在圆形按钮内部**

❌ **错误做法：** 将文字写在圆形按钮外部下方（`absolute -bottom-5`），在手机端会被导航栏底部截断，用户看不见。

```tsx
// ❌ 错误：文字写在圆形外面
<div className="w-14 h-14 rounded-full ...">
  <Wine className="w-6 h-6" />
</div>
<span className="absolute -bottom-5 ...">红酒</span>  {/* 会被截断！ */}
```

✅ **正确做法：** 图标和文字都放在圆形内部，使用 `flex-col` 垂直排列。

```tsx
// ✅ 正确：图标+文字都在圆形内部
<div className="w-14 h-14 rounded-full flex flex-col items-center justify-center ...">
  <Wine className="w-5 h-5 text-[#C9A84C]" />
  <span className="text-[10px] font-bold leading-none mt-0.5">红酒</span>
</div>
```

**规则二：只放文字 OR 图标+文字，二选一**

| 方案 | 适用场景 | 示例 |
|------|----------|------|
| 纯文字 | 品牌名称较短（2字以内） | "奢贝" |
| 图标 + 文字 | 有品类图标时 | 酒杯图标 + "红酒" |
| 纯图标 | 不推荐，缺少文字说明 | — |

**规则三：按钮尺寸固定**

- 圆形直径：`w-14 h-14`（56px）
- 图标尺寸：`w-5 h-5`（20px）
- 文字大小：`text-[10px]`，最多 2 个汉字
- 图标与文字间距：`mt-0.5`（2px）

### 2.2 商家识别逻辑

在 `BottomNav.tsx` 中，通过用户 `username` 判断当前用户属于哪个商家，并展示对应的中间按钮：

```tsx
const isCx8618 = user?.username === 'cx8618';   // 红酒文化商会
const isLiulifan = user?.username === 'liulifan'; // 奢贝（示例）
```

**新增商家时，需要在以下位置添加代码：**

1. `BottomNav.tsx` → 添加用户名判断变量
2. `BottomNav.tsx` → 在中间按钮 JSX 中添加对应的图标+文字
3. `BottomNav.tsx` → 添加 `isXxxPage`（判断是否在该商家页面内）
4. `App.tsx` → 添加商家页面的路由（`lazy import`）

---

## 三、全局底部导航强制保留规范

### 3.1 核心原则：底部导航是全局组件，不可替换

脉动平台的底部导航栏（`BottomNav`）是**全局强制组件**，所有商家子页面必须在页面底部渲染 `<BottomNav />`，无论商家子页面内部有多少层自己的 Tab 导航，都不能替代或隐藏全局底部导航。

```
✅ 正确的页面层级结构：

┌─────────────────────────────┐
│  商家顶部 Header（品牌名）   │  ← 商家自定义
│  商家内部 Tab 导航           │  ← 商家自定义（可选）
│                             │
│  页面主体内容               │
│                             │
│  BottomNav（全局）           │  ← 必须保留
│  人脉  │  [商家按钮]  │ 钱脉  │
└─────────────────────────────┘
```

### 3.2 为什么不能移除

底部导航的三个按钮承担不同职责，缺一不可：

| 按钮 | 职责 | 移除后果 |
|------|------|----------|
| **人脉**（左） | 返回主 App 人脉首页 | 用户无法回到主 App，形成死胡同 |
| **商家中间按钮** | 商家品牌入口，随时回到商家首页 | 商家子页面之间跳转后无法回到商家首页 |
| **钱脉**（右） | 进入账本/钱脉功能 | 用户在商家页面内无法访问账本功能 |

### 3.3 实现方式

在每个商家子页面组件的 JSX 最外层容器内，紧跟在主体内容之后渲染 `<BottomNav />`：

```tsx
// ✅ 正确：每个商家子页面都必须包含 BottomNav
import BottomNav from "@/components/BottomNav";

export default function WineHome() {
  return (
    <div className="min-h-screen bg-[#0d0505] text-white">
      {/* 商家顶部 Header */}
      <div className="...">...</div>

      {/* 商家内部 Tab 导航（可选，放在 Header 内或 Header 下方） */}
      <WineTabBar />

      {/* 页面主体内容，pb-20 预留底部导航高度 */}
      <div className="pb-20">...</div>

      {/* ✅ 全局底部导航，必须保留 */}
      <BottomNav />
    </div>
  );
}
```

```tsx
// ❌ 错误：移除了 BottomNav，用户无法返回主 App
export default function WineHome() {
  return (
    <div className="min-h-screen">
      <WineTabBar />
      <div>...</div>
      {/* 没有 <BottomNav />，违反规范！ */}
    </div>
  );
}
```

### 3.4 内容区底部间距

由于 `BottomNav` 是 `fixed` 定位，会覆盖页面底部内容。页面主体内容容器必须设置足够的 `padding-bottom`，避免最后一条内容被遮挡：

```tsx
// 推荐：pb-24（96px），确保内容不被底部导航遮挡
<div className="max-w-lg mx-auto pb-24">
  {/* 页面内容 */}
</div>
```

### 3.5 商家页面内的主题适配

`BottomNav` 组件内部会根据当前路由自动切换主题色。商家开发时需在 `BottomNav.tsx` 中添加对应的页面判断变量（`isXxxPage`），确保在商家子页面内时底部导航显示商家主题色：

```tsx
// BottomNav.tsx 中需要添加的判断
const isWinePage = location.startsWith('/wine');    // 红酒商会
const isJiangPage = location.startsWith('/jiang');  // 润仪算力
// ... 其他商家

// 底部导航背景色根据当前页面切换
const navBg = isWinePage
  ? 'bg-[#0d0505] border-t border-[#8B1A1A]/40'  // 红酒主题
  : 'bg-white border-t border-gray-100';           // 默认白色
```

---

## 四、商家子页面结构规范

### 4.1 目录结构

```
client/src/pages/
└── {商家英文名}/           # 商家页面目录，如 wine/、beauty/
    ├── {Name}Home.tsx      # 商家首页（对应 /{name} 路由）
    ├── {Name}News.tsx      # 资讯页（对应 /{name}/news）
    ├── {Name}Brands.tsx    # 商品/品牌中心（对应 /{name}/brands）
    ├── {Name}Profile.tsx   # 个人中心（对应 /{name}/profile）
    └── {Name}Admin.tsx     # 后台管理（对应 /{name}/admin，仅商家可见）
```

### 4.2 商家子页面内部导航

每个商家子页面**内部**有自己的 Tab 导航（通常为 4 个 Tab）：

```
首页 | 资讯 | 品牌中心 | 我的
```

这套 Tab 导航与主 App 的底部导航**相互独立**，不要混用。

### 4.3 底部导航在商家页面内的状态

当用户进入商家子页面（如 `/wine/*`）时，主 App 底部导航的三个按钮文字/颜色需要同步更新，切换为商家主题色。

---

## 五、商家个人中心（Profile 页）规范

### 5.1 固定配置项（每个商家必须实现）

以下功能项是**所有商家个人中心页面的标准配置**，开发时必须包含，不可省略：

| 功能项 | 说明 | 入口位置 |
|--------|------|----------|
| **商家设置** | 配置商家基础信息（见第五章） | 个人中心顶部或菜单第一项 |
| **商品管理** | 跳转至 `/{name}/admin` 后台 | 菜单项 |
| **联系客服** | 商家自定义的客服联系方式 | 菜单项 |
| **关于我们** | 商家简介页面 | 菜单项 |

### 5.2 可选配置项（商家按需选择）

| 功能项 | 说明 |
|--------|------|
| 会员等级 | 展示用户在该商家的会员级别 |
| 我的订单 | 历史购买记录 |
| 收货地址 | 物流配送地址管理 |
| 优惠券 | 商家发放的优惠券 |
| 积分中心 | 商家积分体系 |

---

## 六、商家设置模块规范

### 6.1 功能说明

"商家设置"是每个商家**必须配置**的基础信息模块，配置完成后影响：
1. **分享卡片**：用户分享商家任意页面时，微信/浏览器显示商家自己的名称、Logo 和封面图
2. **页面标题**：浏览器 Tab 显示商家名称
3. **顶部展示**：商家首页顶部的名称和 Logo

### 6.2 配置项清单

#### 必填项（未配置时分享将显示脉动默认信息）

| 字段名 | 数据库字段 | 说明 | 格式要求 |
|--------|-----------|------|----------|
| 商家名称 | `shareTitle` | 分享卡片标题、页面 `<title>` | 最多 20 字 |
| 商家 Logo | `shareLogo` | 分享卡片左侧小图标 | 正方形，建议 200×200px，JPG/PNG/WebP，≤2MB |
| 分享封面图 | `shareCoverImage` | 分享卡片大图 | 建议 1200×630px（16:9），JPG/PNG/WebP，≤5MB |
| 分享描述语 | `shareDescription` | 分享卡片副标题 | 最多 30 字 |

#### 选填项

| 字段名 | 数据库字段 | 说明 |
|--------|-----------|------|
| 商家联系微信 | `contactWeChat` | 客服微信号 |
| 商家联系电话 | `contactPhone` | 客服电话 |
| 商家简介 | `aboutUs` | 关于我们页面的正文内容 |
| 商家官网 | `officialWebsite` | 外链跳转 |

### 6.3 图片上传规范

所有商家上传的图片，系统自动处理：
- **压缩**：最大宽度 1200px，质量 80%，格式转为 WebP
- **存储**：上传至 S3，数据库只保存 CDN URL
- **展示**：前端使用 `object-fit: contain`，避免变形

### 6.4 分享 Meta 标签注入逻辑

商家页面加载时，前端自动读取商家设置，动态注入以下 `<meta>` 标签：

```tsx
// 在商家首页组件中（useEffect）
useEffect(() => {
  if (merchantSettings) {
    // 修改页面标题
    document.title = merchantSettings.shareTitle || '脉动';

    // 注入 Open Graph 标签
    setMetaTag('og:title', merchantSettings.shareTitle);
    setMetaTag('og:description', merchantSettings.shareDescription);
    setMetaTag('og:image', merchantSettings.shareCoverImage);
    setMetaTag('og:type', 'website');
  }

  // 离开商家页面时恢复默认值
  return () => {
    document.title = '脉动';
    setMetaTag('og:title', '脉动');
    setMetaTag('og:image', DEFAULT_LOGO_URL);
  };
}, [merchantSettings]);
```

### 6.5 数据库字段（merchants 表扩展）

```sql
ALTER TABLE merchants ADD COLUMN share_title VARCHAR(50);
ALTER TABLE merchants ADD COLUMN share_logo TEXT;
ALTER TABLE merchants ADD COLUMN share_cover_image TEXT;
ALTER TABLE merchants ADD COLUMN share_description VARCHAR(100);
ALTER TABLE merchants ADD COLUMN contact_wechat VARCHAR(50);
ALTER TABLE merchants ADD COLUMN contact_phone VARCHAR(20);
ALTER TABLE merchants ADD COLUMN about_us TEXT;
ALTER TABLE merchants ADD COLUMN official_website VARCHAR(200);
```

---

## 七、商品库架构规范

脉动平台采用**双层商品库**架构：

```
脉动平台总库（merchant_products，ownerMerchantId = NULL）
    ↓ 平台主动推送 / 商家申请导入（product_import_requests）
商家私库（merchant_products，ownerMerchantId = 商家ID）
    ↓ 上架 / 下架
商家前台商城（只展示 status = 'active' 的商品）
```

### 7.1 商品来源标记

| `sourceType` 值 | 含义 |
|----------------|------|
| `platform` | 平台总库录入的商品 |
| `merchant` | 商家自己录入的商品 |
| `shared` | 从平台导入到商家私库的商品 |

### 7.2 商品状态

| `status` 值 | 含义 | 前台可见 |
|------------|------|---------|
| `active` | 已上架 | ✅ 是 |
| `inactive` | 未上架 | ❌ 否 |

### 7.3 图片上传规范

- 上传后自动压缩：最大宽度 800px，格式转为 WebP，质量 80%
- 存储至 S3，数据库只保存 URL
- 前台展示使用 `object-fit: contain`，避免图片变形

---

## 八、路由注册规范

在 `client/src/App.tsx` 中，商家子页面路由使用 `lazy` 懒加载：

```tsx
// 1. 在文件顶部添加 lazy import
const WineHome = lazy(() => import('./pages/wine/WineHome'));
const WineNews = lazy(() => import('./pages/wine/WineNews'));
const WineBrands = lazy(() => import('./pages/wine/WineBrands'));
const WineProfile = lazy(() => import('./pages/wine/WineProfile'));
const WineAdmin = lazy(() => import('./pages/wine/WineAdmin'));

// 2. 在路由配置中添加（放在 404 路由之前）
<Route path="/wine" component={WineHome} />
<Route path="/wine/news" component={WineNews} />
<Route path="/wine/brands" component={WineBrands} />
<Route path="/wine/profile" component={WineProfile} />
<Route path="/wine/admin" component={WineAdmin} />
```

---

## 九、新商家接入检查清单

接入一个新商家时，按以下顺序操作：

**基础配置**
- [ ] 确认商家用户名（`username`），用于 BottomNav 识别
- [ ] 确认商家品牌名称（≤ 2 个汉字，用于中间按钮文字）
- [ ] 确认商家主题色（主色、辅色）
- [ ] 确认商家品类图标（从 `lucide-react` 选取）

**代码开发**
- [ ] 创建商家页面目录 `client/src/pages/{name}/`
- [ ] 创建 5 个页面文件（Home / News / Brands / Profile / Admin）
- [ ] Profile 页面包含“商家设置”入口（必填）
- [ ] Admin 页面包含商品管理、产区管理功能
- [ ] 在 `App.tsx` 注册路由（5个）
- [ ] 在 `BottomNav.tsx` 添加用户名判断和中间按鈕样式
- [ ] 在 `BottomNav.tsx` 添加 `is{Name}Page` 判断（用于激活状态）
- [ ] **每个商家子页面均已引入并渲染 `<BottomNav />`（必需，见第三章）**

**数据库**
- [ ] 在 `merchants` 表中为该商家创建记录
- [ ] 确认 `merchants` 表已有商家设置字段（shareTitle 等）

**测试验证**
- [ ] 底部导航切换正常（激活/非激活状态）
- [ ] 中间按鈕文字/图标在圆形内部显示完整
- [ ] **所有商家子页面底部均显示全局导航（人脉 / 商家按鈕 / 钱脉）**
- [ ] 点击底部导航“人脉”按鈕可正常返回主 App 首页
- [ ] 商品上架流程正常
- [ ] 图片上传压缩正常
- [ ] 商家设置保存后，分享卡片显示商家信息（非脉动默认）

---

## 十、已接入商家列表

| 商家 | 用户名 | 路由前缀 | 中间按钮 | 主题色 | 接入日期 |
|------|--------|----------|----------|--------|----------|
| 红酒文化商会 | cx8618 | `/wine` | 🍷 红酒 | `#8B1A1A` / `#C9A84C` | 2026-03-05 |
| 润仪算力研发中心 | jiang | `/jiang` | ⚙️ 润仪 | `#D32F2F` / `#0A0A0F` | 2026-03-07 |

---

*本文档由开发团队维护，每次新增商家后需同步更新"已接入商家列表"及检查清单。*
