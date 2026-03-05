# 脉动共享商盟 · 完整架构规则文档

> **文档版本**：v1.7
> **创建时间**：2026-03-05
> **适用范围**：所有在脉动网平台上开发的商家网站
> **文档用途**：本文档定义了脉动共享商盟的完整架构规则，包含平台架构、商家子页面开发规范、UI组件规范及数据打通规则。凡涉及新商家建站、功能扩展、产品录入、订单管理、UI设计等工作，均以本文档为准。引用时只需说"按架构规则文档执行"即可。

> **v1.7 变更说明**：新增第二十三章「商品展示铁规」，定义手机端商品展示的固定区域规范（主图轮播区、价格区、标题区、规格区、购买区、详情区），明确各区域的尺寸、字数、字体、间距等强制标准，以及自由装修区的边界。所有商家共享商品时展示效果自动适配，不会出现排版错乱。

> **v1.6 变更说明**：将原 `PRODUCT_RULES.md` 内容全部合并到本文档，删除独立文件。新增 §3.4 认证实现细节（自建密码登录、useAuth Hook）；在 §4 商品体系新增 §4.5 商品标准规范（分类体系/图片规范/字段规范/扩展字段/状态规范）；在 §8 平台后台商品库新增 §8.6 商品归属原则（禁止 ownerMerchantId=NULL 新增）；在 §11 开发规则新增 §11.8 路由与访问控制规范；在 §20 基础设施新增 §20.8 部署与进程管理规范；补充 §11.5 商家设置中的微信爬虫服务端注入方案。

> **v1.5 变更说明**：新增 §4.4「商品录入→入库→展示完整流程规范」，明确三层数据架构（总库/店铺陈列层/前台商城）；修复 `createProduct` 接口——商家录入商品后自动写入 `merchantShopProducts`，前台立即可见，无需额外操作；前台商品列表统一改用 `getShopProducts`（走店铺陈列层），支持上架/下架控制。

> **v1.4 变更说明**：新增第二十章「基础设施配置规范」，涵盖腾讯云服务器、腾讯云 MySQL 数据库、腾讯云 COS 对象存储的完整配置规范及代码示例；将文档中所有 S3/AWS 存储描述替换为腾讯云 COS；更新图片上传规范，明确 Sharp 压缩参数与 COS 上传流程。

---

## 目录

**前半部分：商家独立网站架构规则**

- [一、核心定位与设计理念](#一核心定位与设计理念)
- [二、底部导航框架（核心规则）](#二底部导航框架核心规则)
- [三、用户体系与登录态管理](#三用户体系与登录态管理)
- [四、商品体系](#四商品体系)
- [五、共享商品机制（人脉共享经济）](#五共享商品机制人脉共享经济)
- [六、资金托管与自动分账](#六资金托管与自动分账)
- [七、风险控制体系](#七风险控制体系)
- [八、平台后台商品库](#八平台后台商品库)
- [九、商家个人中心（轻量版后台）](#九商家个人中心轻量版后台)
- [十、订单路由机制](#十订单路由机制)
- [十一、开发规则](#十一开发规则)
- [十二、分阶段实现计划](#十二分阶段实现计划)
- [十三、数据库核心表结构](#十三数据库核心表结构)
- [十四、新商家建站流程](#十四新商家建站流程)

**后半部分：脉动网与商家网站衔接规则**

- [十五、脉动网底部导航组件规范](#十五脉动网底部导航组件规范)
- [十六、红白金13色设计系统](#十六红白金13色设计系统)
- [十七、脉动网UI组件规范](#十七脉动网ui组件规范)
- [十八、商家网站与脉动网的数据打通规则](#十八商家网站与脉动网的数据打通规则)
- [十九、参考案例](#十九参考案例)
- [二十、基础设施配置规范（腾讯云）](#二十基础设施配置规范腾讯云)
- [二十一、AI 商品图处理规范](#二十一ai-商品图处理规范)
- [二十二、认证、路由与部署运维规范（实现细节）](#二十二认证路由与部署运维规范实现细节)
- [二十三、商品展示铁规（手机端固定区域规范）](#二十三商品展示铁规手机端固定区域规范)

---

## 前半部分：商家独立网站架构规则

---

## 一、核心定位与设计理念

### 1.1 脉动共享商盟的价值主张

脉动网不是一个普通的建站工具，而是一套**商家网站 + 人脉管理 + 钱脉管理**三合一的商业基础设施。

> **核心理念**：不管做什么生意，都需要管客户（人脉）、管账（钱脉）。脉动网把这两个能力内嵌到每一个商家网站里，成为商家最强有力的管理工具。

商家的网站是他对外展示的门面，人脉是他管理客户关系的工具，钱脉是他管理财务的工具，三者共生在同一个框架内，互相打通数据。

### 1.2 商家网站的内容自由度

商家的H5网站内容**完全自由**，可以是商城、公司介绍、个人主页、服务预约平台，或任意其他形态。脉动网不限制商家网站的内容形态，只提供统一的框架和工具。

### 1.3 首页三大必备入口（强制规则）

> **无论商家网站是什么形态，首页必须包含以下三个入口。这是不可妥协的强制规则。**

| 入口 | 功能 | 呈现形式（可灵活选择） |
|------|------|---------------------|
| **分享** | 生成公开链接，分享给陌生人 | 顶部分享图标 / 顶部分享按钮 / 悬浮分享按钮 |
| **注册/登录** | 引导访客注册或登录 | 顶部右上角按钮 / 头像位置点击触发 / 页面内文字按钮 |
| **个人中心** | 商家管理商品/订单/设置，访客查看自己的信息 | 头像点击进入 / 「我的」Tab / 顶部右上角图标 |

**呈现形式的自由度**：三个入口的视觉样式完全由商家网站定制，可以是图标、文字按钮、头像入口、悬浮按钮等任意形态，但**功能必须存在，且用户能够找到**。

**典型实现示例**：

```
美容院（奢贝）：
  - 分享：顶部右上角分享图标
  - 注册：顶部右上角「登录」文字按钮
  - 个人中心：底部「我的」Tab

红酒商城（cx8618）：
  - 分享：顶部右上角分享图标
  - 注册：头像区域点击触发登录弹窗
  - 个人中心：头像点击进入

公司介绍网站：
  - 分享：页面内「分享此页面」文字按钮
  - 注册：顶部「加入我们」按钮
  - 个人中心：顶部头像图标
```

---

## 二、底部导航框架（核心规则）

### 2.1 标准底部导航结构

所有商家网站的底部导航遵循统一的**三按钮结构**：

```
┌──────────────────────────────────────────────────────┐
│                                                      │
│              商家网站内容区域                         │
│         （商家自定义，完全自由）                      │
│                                                      │
├──────────────────────────────────────────────────────┤
│  [人脉]      [商家名称]      [钱脉]                  │
│  左侧小图标   中间大圆形按钮   右侧小图标              │
└──────────────────────────────────────────────────────┘
```

| 位置 | 按钮 | 样式 | 功能 |
|------|------|------|------|
| 左 | 人脉 | 小图标 + 文字 | 进入人脉管理页面 |
| 中 | 商家名称 | 大圆形按钮（商家主题色） | 商家网站首页（默认打开页面） |
| 右 | 钱脉 | 小图标 + 文字 | 进入钱脉账本页面 |

### 2.2 原「添加人脉」按钮的替换规则

**原来**：脉动网底部中间是红色圆形「添加人脉」按钮（`+` 图标）。

**现在**：当用户拥有商家网站时，中间按钮替换为该商家的网站入口按钮（显示商家名称缩写）。

- **添加人脉的新入口**：移至人脉Tab内部的「+」按钮
- **添加账本的新入口**：移至钱脉Tab内部的「+」按钮

### 2.3 商家网站内部导航

商家网站内部可以有自己的Tab导航（与底部脉动导航相互独立），例如：

- 美容院：首页 / 预约 / 商城 / 我的
- 红酒商城：首页 / 分类 / 商城 / 我的
- 公司网站：首页 / 产品 / 关于 / 联系

商家内部导航完全由商家自定义，脉动网不做限制。

---

## 三、用户体系与登录态管理

### 3.1 统一用户体系

> **规则**：所有用户数据全局统一。无论用户从哪个入口注册（脉动网人脉页、某商家的H5页面、红酒网站、美容院网站），都进入同一个用户数据库。同一个手机号/账号，在整个脉动网生态里只有一个身份。

数据打通逻辑：用户在商家A的网站注册后，自动进入脉动网用户体系；商家A的人脉列表里自动出现该用户；该用户可以用同一账号访问其他商家网站；该用户的消费记录可以在钱脉账本中查看。

### 3.2 两种访问模式

**模式A：商家本人访问（长期登录）**

商家本人打开自己的网站时，系统自动识别为已登录状态（通过 localStorage + refresh token 实现长期保持）。人脉按钮进入商家自己的人脉数据，钱脉按钮进入商家自己的钱脉账本，个人中心可管理商品、查看订单。

**模式B：陌生访客通过分享链接访问（无需登录）**

商家点击「分享」按钮时，生成一个**公开链接**（不携带登录态）。陌生人打开此链接后，直接看到商家网站内容，无需注册或登录；底部导航与商家本人看到的**完全一样**（三个按钮）；点击「人脉」或「钱脉」后提示登录/注册；登录后进入访客自己的人脉和钱脉数据。

### 3.3 登录态对比

| 访问者 | 打开方式 | 底部导航 | 人脉/钱脉内容 |
|--------|---------|---------|-------------|
| 商家本人 | 直接打开自己的网址 | 人脉 \| 商家名 \| 钱脉 | 商家自己的数据 |
| 陌生访客 | 通过分享链接打开 | 人脉 \| 商家名 \| 钱脉 | 需登录，登录后是访客自己的数据 |

**关键规则**：底部导航对所有人完全一样，区别只在于登录状态和数据归属。

### 3.4 认证实现细节（开发必读）

**登录方式**：脉动平台使用**自建密码登录**（非 Manus OAuth），用户通过用户名 + 密码登录。

| 项目 | 说明 |
|------|------|
| 登录接口 | `trpc.auth.loginWithPassword` |
| Token 存储 | `localStorage('auth-token')` + Cookie `app_session_id` |
| 登出操作 | 清除 localStorage token 和所有 React Query 缓存 |

**认证状态读取**：所有页面通过 `useAuth()` Hook 读取当前用户状态：

```ts
const { user, loading, isAuthenticated, logout } = useAuth();
```

需要强制登录的页面，使用：

```ts
useAuth({ redirectOnUnauthenticated: true });
```

**首页访问控制（HomeEntry 组件）**：

| 用户状态 | 行为 |
|----------|------|
| 已登录 | 正常显示人脉首页（`Home.tsx`） |
| 未登录 | 自动跳转到 `/login` 登录页 |
| 加载中 | 显示空白（不渲染内容，避免闪烁） |

**特殊跳转规则**：
- `liulifan` 用户首次打开网站时，自动跳转到奢贝首页 `/beauty`（仅每次会话跳转一次，由 `App.tsx` Router 组件处理）
- `cx8618` 用户点击底部中间按鈕时，跳转到红酒商会 `/wine`（由 `BottomNav.tsx` 处理）

---

## 四、商品体系

### 4.1 商品来源的三种类型

**类型A：商家自有商品**

商家自己有货源，在个人中心录入商品。入口为：商家网站头像 → 个人中心 → 商品管理 → 添加商品。商家自己管理库存、价格、图片，商品归属该商家独有。

**类型B：平台配置的共享商品（平台撮合）**

平台管理员在后台将供应商A的商品「共享」给商家B，商家B的网站自动显示这些商品，无需商家B操作。适用于平台统一运营的品类。

**类型C：人脉共享商品（商家互相共享，详见第五章）**

商家A和商家B互相共享人脉后，经过双方确认，A可以选择B的商品放到自己的商城销售，反之亦然。

### 4.2 商品录入入口

```
商家网站 → 点击头像 → 进入个人中心 → 商品管理 → 添加/编辑商品
```

每个商家网站的个人中心都必须包含商品管理入口，这是平台的强制标准。

### 4.3 商品展示页面规范（结构固定，样式可定制）

> **核心规则**：商品陈列页面和商品详情页面的**信息结构固定**，确保任何来源的商品都能在任何商家店铺中完美展示。颜色、背景、字体等视觉样式可跟随商家主题定制。

**结构固定的原因**：商品可能来自多个入口录入（商家自录、平台共享、人脉共享），如果展示结构不统一，不同来源的商品在不同店铺会显示错乱，影响用户体验和订单准确性。

#### 必须固定的结构元素

| 元素 | 固定规则 | 原因 |
|------|---------|------|
| 商品主图 | 必须在最顶部，比例统一为 3:4 | 所有商品都有图，图是第一视觉 |
| 商品名称 | 必须紧跟图片下方，最多2行 | 商品数据库的核心字段 |
| 价格 | 必须清晰可见，紧跟名称 | 购买决策的核心信息 |
| 购买/加购按钮 | 必须存在，位置固定 | 交易入口，不能被淹没 |
| 规格选择区 | 有多规格时必须存在 | 字段内容动态，但区域必须有 |
| 商品来源标签 | 必须显示「自营」「平台」或「共享」 | 用于后台订单路由识别 |

#### 可定制的视觉元素

主题色（按钮颜色、标签颜色、强调色）、页面背景色、字体颜色、图片数量（商家上传多少显示多少）、详情介绍区域（文字/图片/视频，可以很长）、是否显示评价、库存、销量等辅助信息。

#### 动态字段规则

不同品类的商品有不同的专属字段，这些字段从数据库动态渲染，不影响模板结构：

| 品类 | 专属字段示例 |
|------|------------|
| 红酒 | 年份、产区、葡萄品种、酒精度 |
| 美容品 | 功效、成分、适用肤质、规格 |
| 海鲜 | 产地、规格、新鲜度、烹饪建议 |
| 食品 | 保质期、产地、配料、净重 |

### 4.4 商品录入→入库→展示完整流程规范（强制）

> **核心原则**：商家录入商品后应立即在前台商城可见，无需任何额外操作。这是商家的基本期望，也是平台的强制要求。

#### 三层数据架构

```
第一层：商品总库（merchant_products 表）
    └── 存储所有商品的完整信息（名称/价格/图片/描述等）
    └── ownerMerchantId = 商家ID 表示商家自有商品
    └── ownerMerchantId = NULL 表示平台总库商品

第二层：店铺陈列层（merchant_shop_products 表）
    └── 控制「哪些商品在哪个店铺展示」
    └── isVisible = 1 表示上架，= 0 表示下架
    └── 支持自定义展示价格、自定义排序、自定义分类

第三层：前台商城（用户看到的页面）
    └── 只展示 status = 'active' 且 isVisible = 1 的商品
    └── 使用 getShopProducts 接口查询（走店铺陈列层）
```

#### 商家自有商品录入流程（当前实现）

```
商家在后台填写表单点击「保存」
    ↓
山山 createProduct 接口（protectedProcedure）
    ↓
    Step 1：写入 merchant_products（商品总库）
    Step 2：自动写入 merchant_shop_products（店铺陈列层）
             isVisible = status === 'active' ? 1 : 0
    ↓
前台 getShopProducts 查询即可返回新商品
    ↓
用户刷新页面即可看到新商品 ✅
```

#### 平台共享商品录入流程

```
平台管理员在平台后台录入商品（ownerMerchantId = NULL）
    ↓
平台主动将商品分配给商家（写入 merchant_shop_products）
    ↓
商家的店铺自动展示该商品，商家无需操作 ✅
```

#### 商品上架/下架操作

| 操作 | 修改的字段 | 前台效果 |
|------|------------|--------|
| 上架 | `isVisible = 1` （merchant_shop_products） | 立即展示 |
| 下架 | `isVisible = 0` （merchant_shop_products） | 立即隐藏 |
| 彻底删除 | `status = 'inactive'` （merchant_products） | 全平台不可见 |

#### 前台商品列表查询规范（强制）

> **所有商家子页面的前台商品列表，必须使用 `getShopProducts` 接口，禁止使用 `getPublicProducts`。**

```typescript
// ✅ 正确：走店铺陈列层，支持上架/下架控制
// 内联查询 merchant_shop_products + merchant_products
// 只返回 isVisible = 1 且 status = 'active' 的商品
const { data: products } = trpc.merchant.getShopProducts.useQuery({
  merchantCode: MERCHANT_CODE,
});

// ❌ 错误：直接查总库，绕过店铺陈列层，无法控制上架/下架
const { data: products } = trpc.merchant.getPublicProducts.useQuery(...);
```
```

### 4.5 商品标准规范（开发必读）

> 参考淘宝/拼多多标准体系制定，适用于脉动平台所有商家类型。

#### 4.5.1 商品分类体系

脉动平台采用**两级分类**结构：

- **一级分类**：平台公共分类（`merchantId = NULL`），由平台统一维护，适用于所有商家类型
- **二级分类**：商家专属分类（`merchantId = 具体ID`），由各商家自定义，用于细化本店商品

**平台公共一级分类**（共 15 个，已写入数据库）：

| 排序 | 分类名称 | 适用场景 |
|------|----------|----------|
| 10 | 美妆护肤 | 护肤品、彩妆、香水、美容仪器 |
| 20 | 美容服务 | 美容院服务项目，面部/身体护理、仪器疗程 |
| 30 | 养生健康 | 健康管理、理疗、养生项目 |
| 40 | 食品饮料 | 零食、饮料、保健食品、酒水 |
| 50 | 酒水茶饮 | 葡萄酒、白酒、啤酒、茶叶、咖啡 |
| 60 | 服装鞋包 | 男装、女装、童装、鞋靴、箱包 |
| 70 | 家居生活 | 家居用品、家纺、收纳、清洁 |
| 80 | 数码电器 | 手机、电脑、家用电器、数码配件 |
| 90 | 母婴用品 | 奶粉、尿不湿、玩具、婴儿护理 |
| 100 | 运动户外 | 运动装备、户外用品、健身器材 |
| 110 | 珠宝配饰 | 项链、手链、戒指、耳环、手表 |
| 120 | 图书文化 | 书籍、音像、文具、艺术品 |
| 130 | 宠物用品 | 宠物食品、宠物用品、宠物服务 |
| 140 | 汽车用品 | 汽车配件、车载用品、汽车服务 |
| 999 | 其他 | 不属于以上类别的商品 |

**红酒文化商会（merchantId=1）专属分类**（共 10 个）：

| 分类名称 | 说明 |
|----------|---------|
| 法国红酒 | 波尔多、勃艮第、罗纳河谷等法国产区 |
| 意大利红酒 | 托斯卡纳、皮埃蒙特等意大利产区 |
| 西班牙红酒 | 里奥哈、普里奥拉托等西班牙产区 |
| 新世界红酒 | 澳大利亚、智利、阿根廷、美国等 |
| 中国红酒 | 宁夏、新疆、云南等国产产区 |
| 白葡萄酒 | 各产区白葡萄酒、桃红葡萄酒 |
| 起泡酒香槟 | 香槟、普罗塞克、卡瓦等起泡酒 |
| 烈酒威士忌 | 威士忌、白兰地、伏特加等烈酒 |
| 品鉴套装 | 多瓶组合品鉴套装、礼盒装 |
| 酒具周边 | 醒酒器、酒杯、开瓶器、酒柜等 |

**奢贝美容院（merchantId=2）专属分类**（共 9 个）：

| 分类名称 | 说明 |
|----------|---------|
| 红光疗程 | 红光/近红外光细胞焕能疗程，含单次/套餐/月卡/年卡 |
| 面部护理 | 面部清洁、补水、抗衰、提升等护理项目 |
| 身体护理 | 全身按摩、淋巴排毒、塑形等身体护理项目 |
| 仪器疗程 | 射频、超声刀、热玛吉等专业仪器疗程 |
| 头皮发质 | 头皮护理、生发、染发等发质管理项目 |
| 美甲美睫 | 美甲、美睫、纹绣等精细美容项目 |
| 私密护理 | 私密部位专项护理疗程 |
| 会员套餐 | 年度私定、季度套餐等综合会员服务包 |
| 护肤品零售 | 美容院专供护肤品、精华液、面膜等 |

#### 4.5.2 商品图片规范

| 图片类型 | 尺寸要求 | 格式 | 大小限制 | 说明 |
|----------|----------|------|----------|------|
| **主图**（必填） | 800×800px 或以上，正方形（1:1） | JPG / WebP | ≤ 3MB | 白底或纯色背景，清晰展示商品主体 |
| 副图（可选） | 800×800px，正方形（1:1） | JPG / WebP | ≤ 3MB | 最多 9 张，展示不同角度/细节 |
| 详情图（可选） | 宽度 750px，高度不限 | JPG / WebP | 每张 ≤ 2MB | 长图，展示商品详细信息 |
| 分享封面（可选） | 1200×630px，横版（16:9 近似） | JPG / WebP | ≤ 1MB | 用于微信分享卡片 |

**图片质量要求**：
- 主图必须清晰，禁止模糊、水印遮挡、大面积文字覆盖
- 图片内容必须与商品名称一致，禁止使用无关图片
- 上传前建议压缩处理（推荐使用 WebP 格式，体积更小）

**存储规则**：所有图片上传到腾讯云 COS，数据库只保存 CDN URL，格式：
```
https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/{merchantCode}/{filename}
```

#### 4.5.3 商品字段规范

**必填字段**：

| 字段 | 数据库列 | 长度限制 | 说明 |
|------|----------|----------|------|
| 商品名称 | `name` | 最多 60 字 | 简洁明确，包含核心关键词 |
| 基础价格 | `basePrice` | 正数，最多 2 位小数 | 实际销售价格 |
| 商品主图 | `mainImageUrl` | - | 必须上传至少 1 张主图 |
| 分类 | `categoryId` | - | 必须选择商家专属分类或平台公共分类 |

**推荐填写字段**：

| 字段 | 数据库列 | 长度限制 | 说明 |
|------|----------|----------|------|
| 副标题/简介 | `subtitle` | 最多 100 字 | 一句话描述商品特点 |
| 划线原价 | `originalPrice` | 正数 | 用于展示折扣，必须 ≥ basePrice |
| 单位 | `unit` | 最多 10 字 | 默认“件”，可改为“次”、“瓶”、“套”等 |
| 库存 | `stock` | 正整数 | 默认 999，实际库存商品请填写真实数量 |
| 商品描述 | `description` | 富文本 | 详细介绍，支持 HTML |
| 排序权重 | `sortOrder` | 整数 | 数值越小越靠前，默认 0 |

**商品名称规范**：

- 长度：**10～60 个字符**
- 禁止：全大写英文、特殊符号堆砌（如 `!!!`、`★★★`）
- 推荐格式：`品牌 + 商品类型 + 核心属性 + 规格`
  - 示例（红酒）：`FIDENCIO RESERVA 飞腾干红葡萄酒 750ml 智利产区`
  - 示例（美容）：`细胞焕能红光养护 · 季卡（12次）`

**单位参考表**：

| 商家类型 | 常用单位 |
|----------|-----------|
| 美容院 | 次、套、张（卡）、月、年 |
| 红酒商 | 瓶、筱（6瓶）、套（礼盒）|
| 通用实物 | 件、个、套、盒、袋 |
| 通用服务 | 次、小时、天、月、年 |

#### 4.5.4 扩展字段规范（extendedFields）

`extendedFields` 字段存储 JSON 格式的行业特有属性，不同商家类型使用不同的字段集合：

**红酒商品扩展字段**（`shopType = "wine"`）：
```json
{
  "vintage": "2019",           // 年份
  "winery": "飞腾酒庄",        // 酒庄名称
  "region": "智利·中央山谷",   // 产区
  "grape": "赤霞珠",           // 葡萄品种
  "alcoholContent": "13.5%",  // 酒精度
  "volume": "750ml",           // 容量
  "taste": "干型",             // 口感类型（干型/半干/甜型）
  "awards": "WA 92分"          // 获奖/评分（可选）
}
```

**美容服务扩展字段**（`shopType = "beauty"`）：
```json
{
  "duration": "60分钟",        // 单次服务时长
  "sessions": 3,               // 套餐包含次数
  "validityDays": 90,          // 有效期（天）
  "deviceModel": "RQ-22",      // 使用仪器型号（可选）
  "skinType": "全肤质",        // 适合肤质（可选）
  "contraindications": "孕妇禁用" // 禁忌事项（可选）
}
```

#### 4.5.5 商品状态规范

| 状态值 | 含义 | 前台显示 |
|--------|------|----------|
| `active` | 上架中 | 显示，可购买 |
| `inactive` | 已下架 | 不显示 |
| `draft` | 草稿 | 不显示，仅后台可见 |

---
## 五、共享商品机制（人脉共享经济）
### 5.1 核心理念
> **人脉共享 → 商品共享 → 共同销售**。只要A和B互相共享了人脉，且双方都是商家，A就有权申请销售B的商品，B也有权申请销售A的商品。这形成了一个基于信任关系的共享经济网络。

### 5.2 共享商品的触发流程

共享人脉只是「我认识你」，共享商品涉及资金，**必须经过双方明确确认**，不自动共享。

```
第1步：A 和 B 互相共享人脉（已有）
    ↓
第2步：A 向 B 发起「商品共享申请」
    - A 选择想销售的商品类目
    - A 提出佣金比例建议（如：我给你20%佣金）
    ↓
第3步：B 审核并确认
    - B 同意/拒绝
    - B 可以修改佣金比例
    - B 可以设定最低售价保护（防止A低价倾销）
    ↓
第4步：A 获得 B 的商品库访问权
    - A 在「共享商品库」中浏览 B 的商品
    - A 自主选择哪些商品上架到自己的商城
    - A 可以对引入的商品重新分类、设定展示价格
    ↓
第5步：A 的客户下单 B 的商品
    - 资金进入平台托管（详见第六章）
    - 系统自动通知 B 发货
    - 平台自动分账
```

### 5.3 商家A对共享商品的操作权限

| 操作 | A 是否可以做 | 说明 |
|------|------------|------|
| 选择上架/下架 | ✅ | A 自主决定展示哪些 |
| 修改展示价格 | ✅ | A 可以在B设定的最低价以上自由定价 |
| 重新分类 | ✅ | A 可以把B的商品放到自己的分类体系里 |
| 修改商品名称/图片 | ❌ | 商品本体由B维护，A不可修改 |
| 修改商品描述 | ❌ | 商品本体由B维护，A不可修改 |
| 查看B的库存 | ✅ | 实时同步，防止超卖 |

### 5.4 平台的最终控制权

尽管共享关系由商家自主建立，平台保留以下控制权：

- 随时关闭任何商家的共享资格
- 设定某些商品「不允许被共享」
- 在纠纷时冻结相关资金
- 对违规商家进行处罚（警告/暂停/封禁）

---

## 六、资金托管与自动分账

### 6.1 资金流向原则（方案C：平台托管）

> **核心原则**：客户付款进入平台托管账户，B发货且客户确认收货后，平台自动执行分账。任何一方都不能在交易完成前单独拿到全部资金。

这是淘宝、京东、拼多多均采用的模式，可有效防止买卖双方的资金风险。

### 6.2 完整资金流程

```
第1步：客户下单付款
客户付款 → 钱进入「脉动网平台托管账户」（支付宝担保交易）
订单状态：待发货
B 收到通知：「您有新订单，请在48小时内发货」
A 收到通知：「您的商城有新订单」

第2步：B 发货（48小时内）
B 填写快递单号 → 系统记录物流信息
订单状态：已发货，客户收到发货通知

第3步：客户确认收货
客户主动点击「确认收货」
或：快递签收后 7 天无异议，系统自动确认
订单状态：已完成

第4步：系统自动分账
B 的货款（约70-80%）→ 打入 B 的余额账户
A 的佣金（约15-25%）→ 打入 A 的余额账户
平台手续费（约3-5%）→ 留在平台
（具体比例由 A 和 B 在共享申请时协商确定）
```

### 6.3 佣金比例参考

| 角色 | 分成比例范围 | 说明 |
|------|------------|------|
| B（货源方/供应商） | 70% - 80% | 提供商品、负责发货、售后 |
| A（销售方/经销商） | 15% - 25% | 引流、销售、客户服务 |
| 平台 | 3% - 5% | 提供系统、资金托管、纠纷仲裁 |

具体比例由A和B在共享申请时协商，平台只收固定手续费，不干预A和B之间的分成比例。

### 6.4 技术实现

接入支付宝「担保交易」或「分账」功能：

| 功能 | 支付宝产品 | 说明 |
|------|-----------|------|
| 资金托管 | 担保交易 | 钱在支付宝冻结，不到商家账户 |
| 自动分账 | 分账产品API | 确认收货后自动按比例分账 |
| 退款 | 退款API | 交易取消时原路退款 |
| 最长托管时间 | 最长180天 | 足够覆盖所有交易场景 |

---

## 七、风险控制体系

### 7.1 B 不发货的处理机制

**情况一：B 超时未发货（超过48小时未填快递单号）**

```
系统自动检测超时 → 自动触发退款 → 客户全额退款（原路退回）
→ B 的账户记录「违约1次」
→ 累计违约超过3次 → 平台暂停B的商品共享资格
```

**情况二：B 虚假发货（填了单号但实际未发货）**

```
客户申请「未收到货」→ 平台介入审核（查快递物流记录）
→ 确认虚假发货 → 全额退款给客户
→ B 的账户扣除违约金（货款的10-20%）
→ 情节严重 → 封禁B的商家资格
```

**情况三：B 发货但快递丢失**

```
客户申请「未收到货」→ 平台查快递物流
→ 物流显示丢失 → 快递公司赔付，平台先行垫付
→ 物流显示运输中 → 等待或联系快递公司
→ 物流显示已签收但客户否认 → 客户举证，平台仲裁
```

### 7.2 事前风险控制（商家入驻审核）

商家申请开通「商品共享」功能时，需通过以下审核：

| 审核项目 | 是否必须 | 说明 |
|---------|---------|------|
| 实名认证 | 必须 | 身份证实名 |
| 手机号绑定 | 必须 | 用于接收订单通知 |
| 营业执照 | 建议 | 企业商家必须，个人商家可选 |
| 缴纳保证金 | 建议 | 500-2000元，违约时用于赔付 |

### 7.3 完整风险控制矩阵

| 风险场景 | 控制机制 | 处理结果 |
|---------|---------|---------|
| B 不发货 | 资金托管，超时自动退款 | 客户全额退款，B记违约 |
| B 虚假发货 | 物流核验，平台介入 | 退款 + 违约金 + 可能封号 |
| A 低价倾销 | B 设定最低售价保护 | 系统拒绝低于最低价上架 |
| 客户恶意退款 | 物流证据 + 平台仲裁 | 有物流证据则驳回退款申请 |
| 平台资金安全 | 资金在支付宝托管，不在平台账户 | 平台无法挪用客户资金 |
| 商家跑路 | 保证金制度 + 实名认证 | 保证金用于赔付买家 |

---

## 八、平台后台商品库

### 8.1 商品库的必要性

> **商品库是整个共享商盟的核心基础设施**。所有商家的商品、所有共享关系、所有订单路由，都依赖一个统一的中央商品库。没有商品库，共享商品机制无法运转。

### 8.2 商品库的三个层次

```
【平台中央商品库】（最高层）
  ├── 平台自营商品（平台直接销售）
  ├── 已审核的商家商品（可被其他商家共享）
  └── 商品分类体系（无限层级，参考淘宝）

【商家商品库】（中间层）
  ├── 商家自有商品（自己录入）
  └── 引入的共享商品（从其他商家/平台引入）

【店铺陈列】（展示层）
  └── 商家选择哪些商品在自己的店铺展示
```

**当前实现（merchant_products 表双用途架构）**：

```
脉动平台总库（merchant_products，ownerMerchantId = NULL）
    ↓ 平台主动推送 / 商家申请导入（product_import_requests）
商家私库（merchant_products，ownerMerchantId = 商家ID）
    ↓ 上架 / 下架
商家前台商城（只展示 status = 'active' 的商品）
```

> **存储说明**：所有商品图片均存储于腾讯云 COS，数据库只保存 CDN URL。详见第二十章。

| `sourceType` 值 | 含义 |
|----------------|------|
| `platform` | 平台总库录入的商品 |
| `merchant` | 商家自己录入的商品 |
| `shared` | 从平台导入到商家私库的商品 |

| `status` 值 | 含义 | 前台可见 |
|------------|------|---------|
| `active` | 已上架 | ✅ 是 |
| `inactive` | 未上架 | ❌ 否 |

### 8.3 商品库管理后台（需新建）

平台管理员需要一个独立的后台管理系统，包含以下功能模块：

| 模块 | 功能 |
|------|------|
| 商品审核 | 审核商家提交的商品，决定是否进入中央库 |
| 分类管理 | 维护三级分类体系（参考淘宝分类） |
| 模板管理 | 为不同品类配置字段模板（红酒/美容/海鲜等） |
| 共享管理 | 查看所有共享关系，可强制关闭 |
| 商家管理 | 查看所有商家，管理入驻状态 |
| 订单管理 | 查看所有订单，处理纠纷 |
| 财务管理 | 查看资金流水，管理分账 |

### 8.4 商品分类体系（三级结构，无限扩展）

```
一级分类（大类）
  ├── 食品饮料
  │   ├── 二级分类：酒水饮料
  │   │   ├── 三级分类：红酒
  │   │   ├── 三级分类：白酒
  │   │   └── 三级分类：啤酒
  │   └── 二级分类：生鲜食品
  │       ├── 三级分类：海鲜水产
  │       └── 三级分类：肉禽蛋
  ├── 美容个护
  │   ├── 二级分类：护肤品
  │   └── 二级分类：美容服务
  └── 数字服务
      ├── 二级分类：软件工具
      └── 二级分类：算力资源
```

分类体系参考淘宝标准，支持无限层级扩展，新增品类无需修改代码，只需在数据库添加分类记录。

### 8.5 商品字段模板系统

不同品类的商品有不同的必填字段，通过模板系统动态配置：

```sql
-- 红酒模板字段
{
  "vintage": { "label": "年份", "type": "number", "required": true },
  "region": { "label": "产区", "type": "text", "required": true },
  "grape": { "label": "葡萄品种", "type": "text", "required": false },
  "alcohol": { "label": "酒精度", "type": "number", "required": false }
}

-- 美容服务模板字段
{
  "duration": { "label": "服务时长", "type": "number", "required": true },
  "effect": { "label": "功效", "type": "text", "required": true },
  "skin_type": { "label": "适用肤质", "type": "select", "required": false }
}
```

### 8.6 商品归属原则（强制）

> **核心规则**：`ownerMerchantId = NULL` 仅用于平台总库的历史数据，**禁止通过任何新接口创建此类商品**。

| `ownerMerchantId` 值 | 含义 | 谁可以创建 |
|---------------------|------|----------|
| `NULL` | 平台总库商品（历史遗留） | 仅平台管理员，且已停止新增 |
| `商家ID`（正整数） | 商家自有商品 | 商家本人，通过 `createProduct` 接口 |

**新商品一律归属商家**：所有通过 `createProduct` 接口创建的商品，`ownerMerchantId` 必须等于当前登录商家的 ID，不得为 NULL。

**`sourceType` 字段规范**：

| `sourceType` 值 | 含义 | 新增规则 |
|----------------|------|----------|
| `merchant` | 商家自己录入的商品 | ✅ 允许，默认值 |
| `platform` | 平台总库录入的商品 | ❌ 禁止通过商家接口新增 |
| `shared` | 从平台导入到商家私库的商品 | ✅ 允许，通过导入流程 |

---
## 九、商家个人中心（轻量版后台）
### 9.1 入口

```
商家网站 → 点击头像（或「我的」Tab）→ 进入个人中心
```

### 9.2 个人中心功能模块

个人中心分为**固定配置项**（所有商家必须实现）和**可选配置项**（按需选择）两类。

#### 固定配置项（每个商家必须实现）

以下功能项是所有商家个人中心页面的标准配置，开发时**必须包含，不可省略**：

| 功能项 | 说明 | 入口位置 |
|--------|------|----------|
| **商家设置** | 配置商家基础信息（分享标题、Logo、封面图、描述语等，详见第十一章 §11.5） | 个人中心顶部或菜单第一项 |
| **商品管理** | 跳转至 `/{name}/admin` 后台，管理自有商品及平台导入商品 | 菜单项 |
| **联系客服** | 商家自定义的客服联系方式（微信号/电话，来自商家设置） | 菜单项 |
| **关于我们** | 商家简介页面（内容来自商家设置中的 `aboutUs` 字段） | 菜单项 |

#### 可选配置项（商家按需选择）

| 功能项 | 说明 |
|--------|------|
| 会员等级 | 展示用户在该商家的会员级别 |
| 我的订单 | 历史购买记录 |
| 收货地址 | 物流配送地址管理 |
| 优惠券 | 商家发放的优惠券 |
| 积分中心 | 商家积分体系 |
| 数据统计 | 销售额、访客数、热销商品 |

### 9.3 数据隔离规则

商家个人中心只能看到自己的数据：只能看到自己店铺的订单，只能管理自己的商品，不能看到其他商家的数据，不能访问平台管理后台。

---

## 十、订单路由机制

### 10.1 自有商品订单

```
客户在商家A的店铺下单（商品为商家A自有）
    ↓
订单进入系统（display_merchant = A，source_merchant = A）
    ↓
资金进入平台托管
    ↓
通知A发货 → A发货 → 客户确认 → A收到货款
```

### 10.2 共享商品订单（货源路由）

```
客户在商家A的店铺下单（商品来源为商家B）
    ↓
订单进入系统（display_merchant = A，source_merchant = B）
    ↓
资金进入平台托管
    ↓
通知B发货（同时通知A有新订单）
    ↓
B发货 → 客户确认 → 平台自动分账（B收货款，A收佣金）
```

### 10.3 平台配置商品订单

```
客户在商家A的店铺下单（商品来源为平台供应商）
    ↓
订单进入系统（display_merchant = A，source_merchant = 平台供应商）
    ↓
资金进入平台托管
    ↓
平台通知供应商发货
    ↓
供应商发货 → 客户确认 → 平台自动分账
```

---

## 十一、开发规则

### 11.1 定制开发范围

| 页面/功能 | 是否可定制 | 备注 |
|----------|-----------|------|
| 商家首页（整体布局） | ✅ 完全自定义 | 私人定制开发 |
| 首页「分享」入口 | ❌ 必须存在 | 样式可定制，功能不可省略 |
| 首页「注册/登录」入口 | ❌ 必须存在 | 样式可定制，功能不可省略 |
| 首页「个人中心」入口 | ❌ 必须存在 | 样式可定制，功能不可省略 |
| 商家内部导航 | ✅ 完全自定义 | 商家自定义Tab |
| 关于/介绍页 | ✅ 完全自定义 | 私人定制开发 |
| 预约/服务页 | ✅ 完全自定义 | 私人定制开发 |
| 商品陈列页（信息结构） | ❌ 结构固定 | 样式可跟随主题色定制 |
| 商品详情页（信息结构） | ❌ 结构固定 | 样式可跟随主题色定制 |
| 个人中心功能结构 | ❌ 功能模块固定 | 视觉风格可定制 |
| 底部导航结构 | ❌ 三按钮结构固定 | 中间按钮颜色可定制 |

### 11.2 主题色定制规则

| 商家类型 | 主色 | 辅色 | 背景色 |
|---------|------|------|-------|
| 美容院 | 粉红 `#FF69B4` | 深粉 `#FF1493` | 浅粉 `#FFF5F7` |
| 红酒商城 | 深红 `#722F37` | 金色 `#D4AF37` | 暖白 `#FFF8F0` |
| 海鲜水产 | 深蓝 `#0066CC` | 珊瑚红 `#FF6B6B` | 浅蓝 `#F0F8FF` |
| 食品农产品 | 绿色 `#2E7D32` | 暖黄 `#F9A825` | 暖白 `#FFF8E1` |

### 11.3 URL规则

```
商家网站访问地址：https://[域名]/shop/[商家标识]
商家个人中心：    https://[域名]/shop/[商家标识]/center
商品列表页：      https://[域名]/shop/[商家标识]/products
商品详情页：      https://[域名]/shop/[商家标识]/product/[商品ID]
```

### 11.4 底部导航中间按钮规范（强制）

> **这是移动端适配的关键规则，违反此规则会导致手机端文字被截断，用户看不见按钮标签。**

**规则一：文字与图标必须放在圆形按钮内部**

❌ **错误做法**：将文字写在圆形按钮外部下方（`absolute -bottom-5`），在手机端会被导航栏底部截断。

```tsx
// ❌ 错误：文字写在圆形外面
<div className="w-14 h-14 rounded-full ...">
  <Wine className="w-6 h-6" />
</div>
<span className="absolute -bottom-5 ...">红酒</span>  {/* 会被截断！ */}
```

✅ **正确做法**：图标和文字都放在圆形内部，使用 `flex-col` 垂直排列。

```tsx
// ✅ 正确：图标+文字都在圆形内部
<div className="w-14 h-14 rounded-full flex flex-col items-center justify-center ...">
  <Wine className="w-5 h-5 text-[#C9A84C]" />
  <span className="text-[10px] font-bold leading-none mt-0.5">红酒</span>
</div>
```

**规则二：内容方案选择**

| 方案 | 适用场景 | 示例 |
|------|----------|------|
| 纯文字 | 品牌名称较短（2字以内） | "奢贝" |
| 图标 + 文字 | 有品类图标时 | 酒杯图标 + "红酒" |
| 纯图标 | 不推荐，缺少文字说明 | — |

**规则三：按钮尺寸固定**

| 元素 | 规格 |
|------|------|
| 圆形直径 | `w-14 h-14`（56px） |
| 图标尺寸 | `w-5 h-5`（20px） |
| 文字大小 | `text-[10px]`，最多 2 个汉字 |
| 图标与文字间距 | `mt-0.5`（2px） |

**商家识别逻辑**（在 `BottomNav.tsx` 中通过用户名判断）：

```tsx
const isCx8618 = user?.username === 'cx8618';   // 红酒文化商会
const isLiulifan = user?.username === 'liulifan'; // 奢贝美容院

// 中间按钮内容渲染
{isLiulifan ? (
  <span className="text-white text-xs font-bold">奢贝</span>
) : isCx8618 ? (
  <div className="flex flex-col items-center justify-center">
    <Wine className="w-5 h-5 text-[#C9A84C]" />
    <span className="text-[10px] font-bold leading-none mt-0.5">红酒</span>
  </div>
) : (
  <Plus className="w-7 h-7 text-white" />
)}
```

**新增商家时，需要在以下位置添加代码**：

1. `BottomNav.tsx` → 添加用户名判断变量（`const isXxx = user?.username === 'xxx'`）
2. `BottomNav.tsx` → 在中间按钮 JSX 中添加对应的图标+文字（图标+文字必须在圆形内部）
3. `BottomNav.tsx` → 添加 `isXxxPage`（判断是否在该商家页面内，用于激活状态）
4. `App.tsx` → 添加商家页面的路由（`lazy import`）

### 11.5 商家设置模块规范（强制）

"商家设置"是每个商家**必须配置**的基础信息模块，对应路由 `/{name}/settings`，配置完成后影响：

1. **分享卡片**：用户分享商家任意页面时，微信/浏览器显示商家自己的名称、Logo 和封面图
2. **页面标题**：浏览器 Tab 显示商家名称
3. **顶部展示**：商家首页顶部的名称和 Logo

#### 必填配置项（未配置时分享将显示脉动默认信息）

| 字段名 | 数据库字段 | 说明 | 格式要求 |
|--------|-----------|------|----------|
| 商家名称 | `share_title` | 分享卡片标题、页面 `<title>` | 最多 20 字 |
| 商家 Logo | `share_logo` | 分享卡片左侧小图标 | 正方形，建议 200×200px，JPG/PNG/WebP，≤2MB |
| 分享封面图 | `share_cover_image` | 分享卡片大图 | 建议 1200×630px（16:9），JPG/PNG/WebP，≤5MB |
| 分享描述语 | `share_description` | 分享卡片副标题 | 最多 30 字 |

#### 选填配置项

| 字段名 | 数据库字段 | 说明 |
|--------|-----------|------|
| 商家联系微信 | `contact_wechat` | 客服微信号（供"联系客服"菜单使用） |
| 商家联系电话 | `contact_phone` | 客服电话（供"联系客服"菜单使用） |
| 商家简介 | `about_us` | 关于我们页面的正文内容 |
| 商家官网 | `website` | 外链跳转 |

#### 图片上传规范

所有商家上传的图片，系统自动处理：

- **压缩**：最大宽度 1200px，质量 80%，格式转为 WebP（使用 Sharp 库）
- **存储**：上传至腾讯云 COS，数据库只保存 CDN URL（详见第二十章）
- **展示**：前端使用 `object-fit: contain`，避免变形

#### 分享 Meta 标签注入逻辑

商家页面加载时，前端自动读取商家设置，动态注入 `<meta>` 标签。在商家首页组件中实现：

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

#### 数据库字段（merchants 表扩展）

```sql
ALTER TABLE merchants ADD COLUMN share_title VARCHAR(50);
ALTER TABLE merchants ADD COLUMN share_logo TEXT;
ALTER TABLE merchants ADD COLUMN share_cover_image TEXT;
ALTER TABLE merchants ADD COLUMN share_description VARCHAR(100);
ALTER TABLE merchants ADD COLUMN contact_wechat VARCHAR(50);
ALTER TABLE merchants ADD COLUMN contact_phone VARCHAR(20);
ALTER TABLE merchants ADD COLUMN about_us TEXT;
ALTER TABLE merchants ADD COLUMN website VARCHAR(200);
```

### 11.6 商家子页面目录结构规范

```
client/src/pages/
└── {商家英文名}/           # 商家页面目录，如 wine/、beauty/
    ├── {Name}Home.tsx      # 商家首页（对应 /{name} 路由）
    ├── {Name}News.tsx      # 资讯页（对应 /{name}/news）
    ├── {Name}Brands.tsx    # 商品/品牌中心（对应 /{name}/brands）
    ├── {Name}Profile.tsx   # 个人中心（对应 /{name}/profile）
    ├── {Name}Settings.tsx  # 商家设置（对应 /{name}/settings）
    └── {Name}Admin.tsx     # 后台管理（对应 /{name}/admin，仅商家可见）
```

### 11.7 路由注册规范

在 `client/src/App.tsx` 中，商家子页面路由使用 `lazy` 懒加载：

```tsx
// 1. 在文件顶部添加 lazy import
const WineHome = lazy(() => import('./pages/wine/WineHome'));
const WineNews = lazy(() => import('./pages/wine/WineNews'));
const WineBrands = lazy(() => import('./pages/wine/WineBrands'));
const WineProfile = lazy(() => import('./pages/wine/WineProfile'));
const WineSettings = lazy(() => import('./pages/wine/WineSettings'));
const WineAdmin = lazy(() => import('./pages/wine/WineAdmin'));

// 2. 在路由配置中添加（放在 404 路由之前）
<Route path="/wine" component={WineHome} />
<Route path="/wine/news" component={WineNews} />
<Route path="/wine/brands" component={WineBrands} />
<Route path="/wine/profile" component={WineProfile} />
<Route path="/wine/settings" component={WineSettings} />
<Route path="/wine/admin" component={WineAdmin} />
````

### 11.8 路由与访问控制规范

#### 商家后台访问控制（`/{name}/admin`）

| 访问者 | 权限 | 处理方式 |
|--------|------|----------|
| 商家本人（匹配 `merchantCode`） | 完整后台权限 | 正常进入 |
| 其他登录用户 | 无权限 | 跳转到 `/` 首页 |
| 未登录访客 | 无权限 | 跳转到 `/login` |

**后台访问控制实现**（在商家后台页面组件顶部加入）：

```tsx
// 在 {Name}Admin.tsx 顶部
const { user, isAuthenticated, loading } = useAuth();
if (loading) return null;
if (!isAuthenticated) { navigate('/login'); return null; }
if (user?.username !== MERCHANT_CODE) { navigate('/'); return null; }
```

#### 商家设置页访问控制（`/{name}/settings`）

与后台页相同的权限控制，仅商家本人可访问。

#### 商家公开页访问控制（`/{name}`、`/{name}/brands` 等）

公开页面无需登录即可访问，但如果用户尝试下单或查看订单，需要引导登录。

#### 路由命名规范（强制）

| 路由类型 | 格式 | 示例 |
|----------|------|------|
| 商家首页 | `/{merchantCode}` | `/wine`、`/beauty` |
| 商家子页 | `/{merchantCode}/{page}` | `/wine/brands`、`/beauty/profile` |
| 商家后台 | `/{merchantCode}/admin` | `/wine/admin`、`/beauty/admin` |
| 商家设置 | `/{merchantCode}/settings` | `/wine/settings` |
| 商家商品详情 | `/{merchantCode}/product/{id}` | `/wine/product/123` |

**禁止使用数字 ID 作为商家标识**：商家标识统一使用英文小写字符串（`merchantCode`），不得使用数字 ID。

---
## 十二、分阶段实现计划
> **重要认知**：做一个漂亮的商城页面很简单，但真正要让商品交易跑起来，背后需要一整套成熟的机制支撑。**卖商品 ≠ 做网站**。以下分阶段计划确保每个阶段都有实际价値交付，同时为下一阶段打好基础。

### 第一阶段：商家网站建设（当前）

**目标**：先把网站做好，验证商家需求

| 功能 | 状态 |
|------|------|
| 商家H5网站前端（首页/商品展示/个人中心） | 开发中 |
| 商品录入界面 | 待开发 |
| 底部导航框架（人脉/商家/钱脉） | 待开发 |
| 商品展示页（统一模板） | 待开发 |

**注意**：此阶段商品只展示，购买跳转到微信/电话联系，不涉及真实在线交易。

### 第二阶段：基础支付接入

**目标**：单商家自有商品的简单收款

| 功能 | 状态 |
|------|------|
| 支付宝H5支付接入 | 已开通，待配置密钥 |
| 单商家收款流程 | 待开发 |
| 基础退款流程 | 待开发 |
| 订单管理（商家个人中心） | 待开发 |

### 第三阶段：平台后台商品库

**目标**：建立中央商品库，支持平台运营

| 功能 | 状态 |
|------|------|
| 平台管理后台 | 待开发 |
| 商品库（三级分类 + 字段模板） | 待开发 |
| 平台配置共享商品 | 待开发 |
| 商家入驻审核 | 待开发 |

### 第四阶段：共享商品完整机制

**目标**：实现人脉共享经济闭环

| 功能 | 状态 |
|------|------|
| 资金托管（支付宝担保交易） | 待接入 |
| 自动分账API | 待接入 |
| 商家间共享申请/确认流程 | 待开发 |
| 物流核验系统 | 待开发 |
| 风险控制（违约记录/保证金） | 待开发 |
| 纠纷仲裁流程 | 待开发 |

---

## 十三、数据库核心表结构

### 13.1 商家表

```sql
CREATE TABLE merchants (
  id            BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id       BIGINT NOT NULL,
  merchant_slug VARCHAR(100) UNIQUE,
  merchant_name VARCHAR(200),
  merchant_type VARCHAR(50),
  theme_color   VARCHAR(20),
  logo_url      VARCHAR(500),
  description   TEXT,
  -- 商家设置字段（v1.3 新增）
  share_title   VARCHAR(50),
  share_logo    TEXT,
  share_cover_image TEXT,
  share_description VARCHAR(100),
  contact_wechat VARCHAR(50),
  contact_phone VARCHAR(20),
  about_us      TEXT,
  website       VARCHAR(200),
  -- 风控字段
  deposit_amount DECIMAL(10,2) DEFAULT 0,  -- 保证金
  violation_count INT DEFAULT 0,           -- 违约次数
  status        VARCHAR(20) DEFAULT 'active', -- active/suspended/banned
  created_at    TIMESTAMP DEFAULT NOW()
);
```

### 13.2 商品分类表

```sql
CREATE TABLE categories (
  id            BIGINT PRIMARY KEY AUTO_INCREMENT,
  parent_id     BIGINT DEFAULT NULL,       -- NULL表示一级分类
  category_name VARCHAR(100),
  level         INT,                       -- 1/2/3 级分类
  sort_order    INT DEFAULT 0,
  is_active     BOOLEAN DEFAULT TRUE
);
```

### 13.3 商品字段模板表

```sql
CREATE TABLE product_templates (
  id            BIGINT PRIMARY KEY AUTO_INCREMENT,
  category_id   BIGINT NOT NULL,
  template_name VARCHAR(100),
  fields        JSON,                      -- 字段定义（名称/类型/是否必填）
  created_at    TIMESTAMP DEFAULT NOW()
);
```

### 13.4 商品表（merchant_products，双用途）

```sql
CREATE TABLE merchant_products (
  id                BIGINT PRIMARY KEY AUTO_INCREMENT,
  owner_merchant_id BIGINT DEFAULT NULL,   -- NULL = 平台总库；非NULL = 商家私库
  source_type       VARCHAR(20),           -- 'platform' / 'merchant' / 'shared'
  product_name      VARCHAR(200),
  price             DECIMAL(10,2),
  min_price         DECIMAL(10,2),         -- 最低售价保护
  stock             INT,
  images            JSON,                  -- 存储腾讯云 COS URL 数组
  extra_fields      JSON,                  -- 动态字段（年份/产区等）
  is_shareable      BOOLEAN DEFAULT TRUE,  -- 是否允许被共享
  status            VARCHAR(20) DEFAULT 'active', -- active/inactive
  created_at        TIMESTAMP DEFAULT NOW()
);
```

### 13.5 商品共享关系表

```sql
CREATE TABLE product_share_agreements (
  id                BIGINT PRIMARY KEY AUTO_INCREMENT,
  source_merchant_id BIGINT NOT NULL,      -- 货源商家（B）
  display_merchant_id BIGINT NOT NULL,     -- 销售商家（A）
  commission_rate   DECIMAL(5,2),          -- 佣金比例（A的分成%）
  status            VARCHAR(20),           -- pending/active/terminated
  created_at        TIMESTAMP DEFAULT NOW()
);
```

### 13.6 店铺陈列表

```sql
CREATE TABLE product_listings (
  id                BIGINT PRIMARY KEY AUTO_INCREMENT,
  product_id        BIGINT NOT NULL,
  merchant_id       BIGINT NOT NULL,       -- 展示商家
  display_price     DECIMAL(10,2),         -- 展示价格
  display_category  VARCHAR(100),          -- 商家自定义分类
  is_active         BOOLEAN DEFAULT TRUE,
  created_at        TIMESTAMP DEFAULT NOW()
);
```

### 13.7 订单表

```sql
CREATE TABLE orders (
  id                    BIGINT PRIMARY KEY AUTO_INCREMENT,
  display_merchant_id   BIGINT NOT NULL,   -- 展示商家（客户下单的店铺）
  source_merchant_id    BIGINT NOT NULL,   -- 货源商家（实际发货方）
  customer_id           BIGINT,
  product_id            BIGINT NOT NULL,
  quantity              INT,
  unit_price            DECIMAL(10,2),
  total_price           DECIMAL(10,2),
  commission_amount     DECIMAL(10,2),     -- A的佣金金额
  platform_fee          DECIMAL(10,2),     -- 平台手续费
  source_amount         DECIMAL(10,2),     -- B的货款金额
  tracking_number       VARCHAR(100),      -- 快递单号
  status                VARCHAR(50),       -- pending/shipped/completed/cancelled/disputed
  payment_status        VARCHAR(50),       -- held/released/refunded
  created_at            TIMESTAMP DEFAULT NOW(),
  shipped_at            TIMESTAMP,
  completed_at          TIMESTAMP
);
```

### 13.8 平台商品导入申请表

```sql
CREATE TABLE product_import_requests (
  id                BIGINT PRIMARY KEY AUTO_INCREMENT,
  merchant_id       BIGINT NOT NULL,       -- 申请导入的商家
  product_id        BIGINT NOT NULL,       -- 申请导入的平台商品
  status            VARCHAR(20) DEFAULT 'pending', -- pending/approved/rejected
  created_at        TIMESTAMP DEFAULT NOW()
);
```

### 13.9 产区管理表（红酒专用）

```sql
CREATE TABLE wine_regions (
  id            BIGINT PRIMARY KEY AUTO_INCREMENT,
  merchant_id   BIGINT NOT NULL,
  name          VARCHAR(100) NOT NULL,
  country       VARCHAR(50),
  description   TEXT,
  created_at    TIMESTAMP DEFAULT NOW()
);
```

---

## 十四、新商家建站流程

每次新增商家，按以下步骤执行，并逐项确认检查清单。

### 14.1 基础信息确认

- [ ] 确认商家用户名（`username`），用于 BottomNav 识别
- [ ] 确认商家品牌名称（≤ 2 个汉字，用于中间按钮文字）
- [ ] 确认商家主题色（主色、辅色）
- [ ] 确认商家品类图标（从 `lucide-react` 选取）
- [ ] 确认商家标识（slug）、类型

### 14.2 数据库准备

- [ ] 在 `merchants` 表中为该商家创建记录（含 slug、name、type、theme_color）
- [ ] 确认 `merchants` 表已有商家设置字段（`share_title`、`share_logo`、`share_cover_image`、`share_description`、`contact_wechat`、`contact_phone`、`about_us`、`website`）

### 14.3 代码开发

- [ ] 创建商家页面目录 `client/src/pages/{name}/`
- [ ] 创建 6 个页面文件（Home / News / Brands / Profile / Settings / Admin）
- [ ] **Profile 页面**：菜单包含"商家设置"、"联系客服"、"关于我们"三个固定项（必填）
- [ ] **Settings 页面**：包含 share_title、share_logo、share_cover_image、share_description 四个必填字段的表单
- [ ] **Admin 页面**：包含商品管理、产区管理功能（如适用）
- [ ] 在 `App.tsx` 注册路由（6个，使用 `lazy` 懒加载）
- [ ] 在 `BottomNav.tsx` 添加用户名判断变量
- [ ] 在 `BottomNav.tsx` 添加中间按钮样式（**图标+文字必须在圆形内部**）
- [ ] 在 `BottomNav.tsx` 添加 `is{Name}Page` 判断（用于激活状态）
- [ ] 在商家首页 `useEffect` 中注入 og:title / og:image / og:description meta 标签

### 14.4 测试验证

- [ ] 底部导航切换正常（激活/非激活状态）
- [ ] 中间按钮文字/图标在圆形内部显示完整（手机端不被截断）
- [ ] 商家设置页面保存正常（图片上传压缩至 WebP）
- [ ] 分享卡片显示商家信息（非脉动默认）
- [ ] 商品上架流程正常（自有商品 + 平台导入商品）
- [ ] 图片上传压缩正常（Sharp 压缩至 WebP，最大 800px）
- [ ] 商家本人长期登录 + 访客公开访问均正常

### 14.5 上线发布

- [ ] 配置域名/路由
- [ ] 交付商家，提供操作说明

---

## 后半部分：脉动网与商家网站衔接规则

---

## 十五、脉动网底部导航组件规范

### 15.1 组件文件位置

```
/client/src/components/BottomNav.tsx
```

### 15.2 当前实现逻辑

底部导航组件通过判断当前登录用户来决定中间按钮的行为：

```typescript
const isLiulifan = user?.username === 'liulifan';
const isCx8618 = user?.username === 'cx8618';

const handlePlusClick = () => {
  if (isLiulifan) {
    setLocation('/beauty');       // 有商家网站：跳转到商家首页
  } else if (isCx8618) {
    setLocation('/wine');         // 红酒商城
  } else if (isLedgerPage) {
    setShowLedgerMenu(!showLedgerMenu);  // 钱脉页面：弹出账本操作菜单
  } else {
    setLocation('/parent/contacts/add'); // 普通用户：跳转到添加人脉
  }
};
```

### 15.3 扩展新商家的规则

每新增一个商家用户，需要在 BottomNav.tsx 中添加对应的判断逻辑：

```typescript
// 扩展示例：新增红酒商家 cx8618
const isCx8618 = user?.username === 'cx8618';

const handlePlusClick = () => {
  if (isLiulifan) {
    setLocation('/beauty');
  } else if (isCx8618) {
    setLocation('/wine');   // 红酒商城
  } else if (isLedgerPage) {
    setShowLedgerMenu(!showLedgerMenu);
  } else {
    setLocation('/parent/contacts/add');
  }
};

// 中间按钮显示内容（图标+文字必须在圆形内部）
{isLiulifan ? (
  <span className="text-white text-xs font-bold">奢贝</span>
) : isCx8618 ? (
  <div className="flex flex-col items-center justify-center">
    <Wine className="w-5 h-5 text-[#C9A84C]" />
    <span className="text-[10px] font-bold leading-none mt-0.5">红酒</span>
  </div>
) : (
  <Plus className="w-7 h-7 text-white" />
)}
```

### 15.4 激活状态判断规则

```typescript
const isContactsActive = !isLedgerPage && !isBeautyPage && !isWinePage;
const isLedgerActive = isLedgerPage;
```

---

## 十六、红白金13色设计系统

脉动网使用统一的**红白金13色系统**，所有商家网站的人脉、钱脉部分均使用此色系，保证品牌一致性。

### 16.1 13色完整定义

| 编号 | 名称 | 色值 | CSS变量 | 用途 |
|------|------|------|---------|------|
| 1 | **脉动红**（主色） | `#D32F2F` | `--brand-red` | 主按钮、链接、主要交互 |
| 2 | **触控红**（按下态） | `#B71C1C` | `--brand-red-dark` | 按钮按下状态 |
| 3 | **高光红**（选中背景） | `#FFEBEE` | `--brand-red-light` | 选中背景、hover背景 |
| 4 | **至尊金**（装饰色） | `#CBA471` | `--brand-gold` | 装饰边框、高端感元素 |
| 5 | **杏白底**（全站背景） | `#FAF3ED` | `--bg-cream` | 全站页面背景色 |
| 6 | **极净白**（卡片背景） | `#FFFFFF` | `--bg-white` | 卡片、弹窗背景 |
| 7 | **核心黑**（主要文字） | `#222222` | `--text-black` | 标题、主要文字 |
| 8 | **沉稳灰**（辅助文字） | `#757575` | `--text-gray` | 副标题、说明文字 |
| 9 | **分割灰**（边框线） | `#E0E0E0` | `--border-gray` | 分割线、边框 |
| 10 | **成功绿** | `#4CAF50` | `--status-success` | 成功状态、收入 |
| 11 | **告警橙** | `#FFA000` | `--status-warning` | 警告、待处理 |
| 12 | **冲突红**（错误/删除） | `#F44336` | `--status-error` | 错误提示、删除操作 |
| 13 | **极速蓝**（链接） | `#1976D2` | `--status-link` | 超链接、外部跳转 |

### 16.2 色彩使用规则

**主色（脉动红 #D32F2F）的使用场景**：底部导航中间按钮（默认无商家网站时）、人脉/钱脉激活状态的图标和文字颜色、主要操作按钮、重要数字和金额高亮。

**至尊金（#CBA471）的使用场景**：高端商品的装饰边框、VIP标识、奖励和荣誉类元素。

**背景色使用规则**：全站背景使用杏白底 `#FAF3ED`，卡片背景使用极净白 `#FFFFFF`，选中/hover背景使用高光红 `#FFEBEE`。

### 16.3 商家主题色与13色系统的关系

商家网站的主题色**仅用于商家自己的内容区域**（商家首页、商品页、个人中心等）。当用户切换到人脉或钱脉Tab时，界面自动切换回脉动网的红白金13色系统。

---

## 十七、脉动网UI组件规范

### 17.1 字体系统

```css
--font-sans: 'Nunito', -apple-system, BlinkMacSystemFont, 'Segoe UI',
             'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
```

Nunito 字体通过 Google Fonts 镜像加载，保证国内访问速度。

### 17.2 圆角系统

```css
--radius: 1rem;       /* 基础圆角 16px */
--radius-sm: 0.75rem; /* 小圆角 12px */
--radius-md: 0.875rem;/* 中圆角 14px */
--radius-lg: 1rem;    /* 大圆角 16px */
--radius-xl: 1.25rem; /* 超大圆角 20px */
```

### 17.3 阴影系统

```css
.shadow-soft    { box-shadow: 0 4px 20px -2px rgba(211, 47, 47, 0.1); }
.shadow-soft-lg { box-shadow: 0 10px 40px -5px rgba(211, 47, 47, 0.15); }
```

### 17.4 动画规范

| 动画类名 | 效果 | 用途 |
|---------|------|------|
| `animate-float` | 上下浮动 3s | 装饰性图标 |
| `animate-pulse-soft` | 呼吸渐隐 2s | 加载中状态 |
| `animate-bounce-soft` | 轻弹跳动 1s | 提示引导 |
| `animate-shimmer` | 光泽扫过 2s | 骨架屏加载 |
| `animate-shake` | 左右抖动 0.5s | 错误提示 |

### 17.5 微信环境适配

```css
body.wechat-env { font-size: 85%; }
```

所有页面需考虑微信内嵌浏览器的兼容性。

---

## 十八、商家网站与脉动网的数据打通规则

### 18.1 用户认证打通

商家网站使用与脉动网相同的认证接口（`trpc.auth.me`），用户在商家网站登录后，人脉和钱脉数据自动关联。

```typescript
const { data: user } = trpc.auth.me.useQuery();
const isMerchantOwner = user?.username === merchantSlug;
```

### 18.2 人脉数据打通

客户在商家网站注册/购买后，自动加入商家的人脉列表；商家可以在人脉Tab中查看、管理所有客户；人脉数据与脉动网主系统完全同步。

### 18.3 钱脉数据打通

客户在商家网站的消费记录可以同步到钱脉账本；商家的收入记录自动进入钱脉；支持多账本（个人账本 + 商家账本分开管理）。

### 18.4 路由规则

```typescript
// App.tsx 路由注册规则
<Route path="/beauty" component={BeautyHome} />
<Route path="/beauty/:page" component={BeautyPage} />
<Route path="/wine" component={WineHome} />
<Route path="/wine/news" component={WineNews} />
<Route path="/wine/brands" component={WineBrands} />
<Route path="/wine/profile" component={WineProfile} />
<Route path="/wine/settings" component={WineSettings} />
<Route path="/wine/admin" component={WineAdmin} />
// 通用商家路由（未来扩展）
<Route path="/shop/:slug" component={MerchantHome} />
<Route path="/shop/:slug/:page" component={MerchantPage} />
```

---

## 十九、参考案例

### 案例一：奢贝美容院（liulifan）

| 属性 | 值 |
|------|---|
| 商家标识 | `liulifan` |
| 商家类型 | 美容院（beauty） |
| 主题色 | 粉红渐变 |
| 内部导航 | 首页 / 预约 / 商城 / 我的 |
| 底部按钮文字 | 奢贝（纯文字，在圆形内部） |
| 路由前缀 | `/beauty` |
| 商品类型 | 美容服务 |
| 接入状态 | 已接入 |

### 案例二：红酒文化商会（cx8618）

| 属性 | 值 |
|------|---|
| 商家标识 | `cx8618` |
| 商家类型 | 红酒销售（wine） |
| 主题色 | 深红 `#8B1A1A` + 金色 `#C9A84C` |
| 内部导航 | 首页 / 资讯 / 品牌中心 / 我的 |
| 底部按钮 | 酒杯图标 + "红酒"（图标+文字在圆形内部） |
| 路由前缀 | `/wine` |
| 商品类型 | 红酒（含年份/产区/葡萄品种等动态字段） |
| 商家设置 | 已实现（share_title/share_logo/share_cover_image/share_description） |
| 接入状态 | 已接入（参考实现，作为新商家开发标准） |

**已实现功能清单（cx8618 作为参考标准）**：

- 4 个页面：WineHome / WineNews / WineBrands / WineProfile
- 商家设置页面（WineSettings）：图片上传、分享配置、联系方式
- 后台管理（WineAdmin）：商品管理、产区管理、平台商品导入申请
- 双层商品库：平台总库（ownerMerchantId = NULL）+ 商家私库
- 动态 meta 标签注入（og:title / og:image / og:description）
- 底部导航中间按钮：酒杯图标 + "红酒" 文字，均在圆形内部

---

## 已接入商家列表

| 商家 | 用户名 | 路由前缀 | 中间按钮 | 主题色 | 接入日期 |
|------|--------|----------|----------|--------|----------|
| 奢贝美容院 | liulifan | `/beauty` | 奢贝（纯文字） | 粉红渐变 | — |
| 红酒文化商会 | cx8618 | `/wine` | 🍷 红酒 | `#8B1A1A` / `#C9A84C` | 2026-03-05 |

---

## 二十、基础设施配置规范（腾讯云）

> **重要**：脉动平台的所有生产环境基础设施均托管于腾讯云。本章为权威配置规范，开发时必须以此为准，不得使用 AWS S3、TiDB Cloud 等其他云服务商替代。

### 20.1 服务器（腾讯云 CVM）

| 属性 | 值 |
|------|----|
| 云服务商 | 腾讯云 CVM（Cloud Virtual Machine） |
| 操作系统 | Linux（Ubuntu 或 CentOS） |
| 服务器 IP | `124.223.54.69`（生产环境） |
| 应用端口 | `3009`（Node.js 服务） |
| 进程管理 | PM2（`pm2 start dist/index.js --name haoyouji`） |
| 反向代理 | Nginx（80/443 → 3009） |

**Nginx 配置示例**：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:3009;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }
}
```

**部署流程**：

```bash
# 1. 构建生产包
pnpm run build

# 2. 上传到服务器（scp 或 git pull）
scp -r dist/ ubuntu@124.223.54.69:/home/ubuntu/haoyouji-web/

# 3. 在服务器上重启应用
cd /home/ubuntu/haoyouji-web
pm2 restart haoyouji
# 或首次启动
pm2 start dist/index.js --name haoyouji
pm2 save
pm2 startup
```

### 20.2 数据库（腾讯云 MySQL）

| 属性 | 值 |
|------|----|
| 云服务商 | 腾讯云 MySQL（TencentDB for MySQL） |
| 数据库类型 | MySQL 8.0 |
| 连接方式 | mysql2 + Drizzle ORM |
| 字符集 | utf8mb4 |
| SSL | 开启（`rejectUnauthorized: false`） |

**环境变量配置**：

```bash
# 生产数据库（腾讯云 MySQL）
ORIGINAL_DATABASE_URL=mysql://用户名:密码@124.223.54.69:3306/数据库名

# 开发/临时数据库（Manus 提供的临时库，仅开发环境）
DATABASE_URL=mysql://用户名:密码@临时地址:端口/数据库名

# 是否强制使用开发库（true = 使用 DATABASE_URL，false = 使用 ORIGINAL_DATABASE_URL）
USE_DEV_DB=false
```

**数据库连接代码**（`server/db.ts`）：

```typescript
import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';

// 生产环境使用 ORIGINAL_DATABASE_URL（腾讯云 MySQL）
const dbUrl = process.env.ORIGINAL_DATABASE_URL || process.env.DATABASE_URL;

const connection = await mysql.createConnection({
  uri: dbUrl,
  connectTimeout: 30000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  // 腾讯云 MySQL 需要 SSL，但不校验证书
  ssl: { rejectUnauthorized: false },
  charset: 'utf8mb4',
});

const db = drizzle(connection);
```

**数据库规范**：

| 规则 | 说明 |
|------|------|
| ORM | Drizzle ORM（`drizzle-orm/mysql2`） |
| Schema 文件 | `drizzle/schema.ts` |
| 迁移命令 | `pnpm db:push`（`drizzle-kit generate && drizzle-kit migrate`） |
| 时间戳 | 所有表使用 `created_at TIMESTAMP DEFAULT NOW()` + `updated_at TIMESTAMP DEFAULT NOW() ON UPDATE NOW()` |
| 主键 | `BIGINT AUTO_INCREMENT`（或 `INT AUTO_INCREMENT` 对于小表） |
| 字符集 | 建表时指定 `CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci` |
| 直接 SQL | 通过 `(db as any).execute(sql, params)` 执行原始 SQL |

### 20.3 对象存储（腾讯云 COS）

| 属性 | 值 |
|------|----|
| 云服务商 | 腾讯云 COS（Cloud Object Storage） |
| SDK | `cos-nodejs-sdk-v5` |
| Bucket 访问权限 | 公有读私有写（图片 URL 可直接访问，无需签名） |
| URL 格式 | `https://{Bucket}.cos.{Region}.myqcloud.com/{Key}` |

**环境变量配置**：

```bash
# 腾讯云 COS 配置
COS_SECRET_ID=你的SecretId
COS_SECRET_KEY=你的SecretKey
COS_BUCKET=你的Bucket名称（如 haoyouji-1234567890）
COS_REGION=你的地域（如 ap-guangzhou、ap-shanghai）
```

**SecretId / SecretKey 获取方式**：腾讯云控制台 → 访问管理（CAM）→ API 密钥管理 → 新建密钥。

**Bucket 命名规则**：`{自定义名称}-{APPID}`，例如 `haoyouji-1234567890`。

**核心上传工具函数**（`server/cos-upload.ts`）：

```typescript
import COS from 'cos-nodejs-sdk-v5';
import crypto from 'crypto';

const cos = new COS({
  SecretId: process.env.COS_SECRET_ID!,
  SecretKey: process.env.COS_SECRET_KEY!,
});

const BUCKET = process.env.COS_BUCKET!;
const REGION = process.env.COS_REGION!;

/**
 * 上传图片到腾讯云 COS
 * @param imageData base64 字符串或 Buffer
 * @param folder 存储目录（avatars / wine-products / merchant-logos 等）
 * @returns 公网可访问的 CDN URL
 */
export async function uploadImageToCOS(
  imageData: string | Buffer,
  folder: string = 'uploads'
): Promise<string> {
  let buffer: Buffer;
  let contentType = 'image/webp';

  if (typeof imageData === 'string') {
    const matches = imageData.match(/^data:image\/(\w+);base64,(.+)$/);
    if (matches) {
      contentType = `image/${matches[1]}`;
      buffer = Buffer.from(matches[2], 'base64');
    } else {
      buffer = Buffer.from(imageData, 'base64');
    }
  } else {
    buffer = imageData;
  }

  const hash = crypto.createHash('md5').update(buffer).digest('hex').slice(0, 8);
  const key = `${folder}/${Date.now()}-${hash}.webp`;

  await cos.putObject({
    Bucket: BUCKET,
    Region: REGION,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  });

  return `https://${BUCKET}.cos.${REGION}.myqcloud.com/${key}`;
}
```

**图片上传完整流程**（以商品图片为例，`server/merchant-router.ts`）：

```typescript
import sharp from 'sharp';
import { uploadImageToCOS } from './cos-upload';

// 商品图片上传（最大 800px，转 WebP）
uploadProductImage: protectedProcedure
  .input(z.object({
    base64: z.string(),   // 前端传来的 base64 图片
    mimeType: z.string(),
  }))
  .mutation(async ({ input }) => {
    // 1. 解码 base64
    const base64Data = input.base64.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    // 2. Sharp 压缩（商品图：最大 800px，质量 80，转 WebP）
    const compressed = await sharp(buffer)
      .resize({ width: 800, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();

    // 3. 上传到腾讯云 COS
    const url = await uploadImageToCOS(compressed, 'wine-products');

    // 4. 数据库只保存 URL
    return { url };
  }),

// 商家 Logo 上传（最大 1200px，转 WebP）
uploadMerchantLogo: protectedProcedure
  .input(z.object({ base64: z.string() }))
  .mutation(async ({ input, ctx }) => {
    const buffer = Buffer.from(input.base64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    const compressed = await sharp(buffer)
      .resize({ width: 1200, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
    const url = await uploadImageToCOS(compressed, 'merchant-logos');
    // 更新数据库
    await db.execute(`UPDATE merchants SET share_logo=? WHERE id=?`, [url, merchantId]);
    return { url };
  }),
```

**各类图片的 COS 存储目录规范**：

| 图片类型 | COS 目录 | Sharp 最大宽度 | 说明 |
|---------|---------|--------------|------|
| 用户头像 | `avatars/` | 400px | 圆形展示，小尺寸足够 |
| 商品主图 | `wine-products/`（或 `{商家}-products/`） | 800px | 商品列表/详情展示 |
| 商家 Logo | `merchant-logos/` | 1200px | 分享卡片小图标，建议正方形 |
| 商家封面图 | `merchant-covers/` | 1200px | 分享卡片大图，建议 16:9 |
| 账本凭证 | `ledger-photos/` | 1200px | 报销/收支凭证 |
| 收款码 | `payment-qrcodes/` | 800px | 微信/支付宝收款二维码 |
| 海报 | `posters/` | 原尺寸 | 合成海报，不压缩 |

**删除 COS 文件**：

```typescript
export async function deleteImageFromCOS(url: string): Promise<void> {
  const urlObj = new URL(url);
  const key = urlObj.pathname.substring(1); // 去掉开头的 /
  await cos.deleteObject({ Bucket: BUCKET, Region: REGION, Key: key });
}
```

### 20.4 环境变量完整清单

以下为生产环境所需的全部环境变量，在服务器 `.env` 文件中配置：

```bash
# ===== 数据库 =====
# 腾讯云 MySQL（生产主库，服务器本地连接）
ORIGINAL_DATABASE_URL=mysql://root:Miao@20190603@127.0.0.1:3306/crm_db
# 从沙箱/外部连接腾讯云数据库（公网IP，仅用于数据维护脚本）
# ORIGINAL_DATABASE_URL=mysql://root:Miao@20190603@124.223.54.69:3306/crm_db
# 是否强制使用开发库（生产环境必须设为 false）
USE_DEV_DB=false

# ===== 腾讯云 COS =====
COS_SECRET_ID=【见服务器.env文件，勿提交到Git】
COS_SECRET_KEY=【见服务器.env文件，勿提交到Git】
COS_BUCKET=haoyouji-images-1396946788
COS_REGION=ap-shanghai

# ===== 应用安全 =====
JWT_SECRET=随机生成的长字符串（至少64位）
NODE_ENV=production
PORT=3009

# ===== 第三方 API（按需配置）=====
DEEPSEEK_API_KEY=你的DeepSeek密钥
QICHACHA_APP_KEY=企查查AppKey
QICHACHA_SECRET_KEY=企查查SecretKey

# ===== Manus 平台（开发环境使用）=====
BUILT_IN_FORGE_API_URL=https://api.manus.im/api/forge
BUILT_IN_FORGE_API_KEY=你的ForgeApiKey
```

### 20.5 本地开发 vs 生产环境对比

| 配置项 | 本地开发环境 | 生产环境（腾讯云） |
|--------|------------|------------------|
| 数据库连接 | 公网 IP `124.223.54.69:3306`（沙箱脚本维护用） | 本地 `127.0.0.1:3306`（服务器内网，速度更快） |
| 数据库名 | `crm_db` | `crm_db`（同一个库） |
| 数据库用户 | `root` | `root` |
| 图片存储 | 腾讯云 COS `haoyouji-images-1396946788` | 腾讯云 COS `haoyouji-images-1396946788`（同一个 Bucket） |
| 服务器端口 | `localhost:3009` | `124.223.54.69:3009`（Nginx 代理） |
| SSL | 公网连接需要 SSL（`rejectUnauthorized: false`） | 本地连接无需 SSL |
| `USE_DEV_DB` | `false`（统一用腾讯云库） | `false` |

> **重要原则**：所有环境（沙箱开发、生产服务器）统一使用腾讯云 `crm_db` 数据库，不使用 Manus 临时数据库。图片统一上传到腾讯云 COS `haoyouji-images-1396946788`，上传前必须用 Sharp 压缩到适合手机浏览的尺寸（商品图 ≤800px，封面图 ≤1200px，转 WebP 格式）。

### 20.6 数据库连接说明

腾讯云 MySQL 运行在服务器本机（`127.0.0.1:3306`），**只能从服务器内部访问**。从外部（沙箱、本地电脑）维护数据时，使用公网 IP `124.223.54.69:3306` 连接，需要开放 3306 端口的安全组规则。

**数据库基本信息：**

| 项目 | 值 |
|------|----|
| 主机（服务器内） | `127.0.0.1` |
| 主机（外部访问） | `124.223.54.69` |
| 端口 | `3306` |
| 数据库名 | `crm_db` |
| 用户名 | `root` |
| 密码 | `Miao@20190603` |
| 字符集 | `utf8mb4` |

**商家相关表清单（已在腾讯云 crm_db 中创建）：**

| 表名 | 用途 | 当前数据 |
|------|------|--------|
| `merchants` | 商家基础信息 | 1 条（cx8618 红酒文化商会） |
| `merchant_products` | 商品总库 | 3 条（飞腾/玛莎/罗马尼克） |
| `merchant_shop_products` | 店铺陈列层（上架控制） | 3 条（全部上架） |
| `wine_regions` | 红酒产区管理 | 0 条 |
| `product_import_requests` | 商品导入申请 | 0 条 |

### 20.7 腾讯云 COS 配置

| 项目 | 值 |
|------|----|
| Bucket 名称 | `haoyouji-images-1396946788` |
| 地域 | `ap-shanghai`（上海） |
| SecretId | `【见服务器.env文件，勿提交到Git】` |
| SecretKey | `【见服务器.env文件，勿提交到Git】` |
| 访问 URL 格式 | `https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/{key}` |
| SDK | `cos-nodejs-sdk-v5` |

**图片压缩规范（Sharp）：**

| 图片类型 | 最大宽度 | 格式 | 质量 | COS 目录 |
|---------|---------|------|------|--------|
| 商品主图 | 800px | WebP | 80 | `wine-products/` |
| 商家 Logo | 1200px | WebP | 80 | `merchant-logos/` |
| 商家封面图 | 1200px | WebP | 80 | `merchant-covers/` |
| 用户头像 | 400px | WebP | 80 | `avatars/` |
| 账本凭证 | 1200px | WebP | 80 | `ledger-photos/` 
---

### 20.8 部署与进程管理规范

#### 部署方式

| 项目 | 配置 |
|------|------|
| 服务器 | 腾讯云 CVM，公网 IP `43.136.232.116` |
| 进程管理 | PM2，配置文件 `ecosystem.config.cjs` |
| 反向代理 | Nginx，监听 80/443 端口，转发到 Node.js 3000 端口 |
| 部署分支 | `main` 分支，通过 GitHub Actions 自动部署 |

#### 常用运维命令

```bash
# 查看进程状态
pm2 status
pm2 logs haoyouji-web --lines 50

# 重启服务
pm2 restart haoyouji-web

# 手动部署（通常由 GitHub Actions 自动执行）
cd /www/wwwroot/haoyouji-web
git pull origin main
pnpm install --frozen-lockfile
pnpm build
pm2 restart haoyouji-web
```

#### 数据库迁移规范

```bash
# 在服务器上执行迁移（部署后如有 schema 变更）
cd /www/wwwroot/haoyouji-web
pnpm db:push
```

> **警告**：`pnpm db:push` 会直接修改生产数据库结构，执行前必须备份数据库。

#### 环境变量管理

生产环境变量存储在服务器 `/www/wwwroot/haoyouji-web/.env` 文件中，不得提交到 Git 仓库。关键变量包括：

| 变量名 | 用途 |
|---------|------|
| `DATABASE_URL` | 腾讯云 MySQL 连接字符串 |
| `COS_SECRET_ID` | 腾讯云 COS SecretId |
| `COS_SECRET_KEY` | 腾讯云 COS SecretKey |
| `JWT_SECRET` | JWT 签名密鑰 |
| `ALIPAY_APP_ID` | 支付宝应用 ID |
| `ALIPAY_PRIVATE_KEY` | 支付宝应用私鑰 |

---
*本文档为脉动共享商盟产品架构的权威规则文档，所有开发工作以此为准。如有规则变更，需更新文档版本号并记录变更内容。*
---
## 二十一、AI 商品图处理规范

### 21.1 核心原则：保留真实性

**商家提供的原始产品图片是商品的真实凭证，AI 处理必须在保留真实元素的前提下进行美化，严禁替换或伪造产品标签、品牌标志、酒瓶外观。**

> 规则来源：用户明确要求「保留原图里的酒瓶、标签、品牌标志这些真实元素，通过抠图、换背景、加场景等方式制作精美产品图，不能直接把标志都改了」。

### 21.2 允许的 AI 处理操作

| 操作类型 | 说明 | 允许 |
|---------|------|------|
| 换背景 | 将原图背景替换为高端摄影风格背景（暗调、大理石、木质等） | ✅ |
| 场景合成 | 将酒瓶放入配餐场景（牛排、奶酪、餐桌等） | ✅ |
| 光影优化 | 增强酒瓶的光泽感、阴影、高光效果 | ✅ |
| 背景模糊 | 对背景进行虚化处理，突出产品主体 | ✅ |
| 色调调整 | 统一图片色调与品牌主题色（如红酒主题的暗红金色调） | ✅ |
| 尺寸裁剪 | 按展示需求裁剪为合适比例（1:1、3:4、16:9等） | ✅ |

### 21.3 禁止的 AI 处理操作

| 操作类型 | 原因 | 禁止 |
|---------|------|------|
| 替换酒瓶标签 | 破坏产品真实性，涉及虚假宣传 | ❌ |
| 修改品牌名称/Logo | 侵犯商标权，误导消费者 | ❌ |
| 生成全新酒瓶（不含原图元素） | 与实际商品不符，欺骗消费者 | ❌ |
| 修改年份、产区等规格文字 | 虚假信息 | ❌ |
| 添加虚假评分/认证标志 | 虚假宣传 | ❌ |

### 21.4 AI 图片处理工作流

```
商家上传原始照片（手机拍摄）
        ↓
[AI 处理层]
1. 识别产品主体（酒瓶/包装）
2. 分离背景
3. 保留原始标签和品牌标志
4. 生成高端场景背景（暗调摄影/配餐场景/酒庄场景）
5. 合成最终图片
        ↓
[压缩层]
Sharp 压缩 → WebP 格式 → 最大 800px
        ↓
[存储层]
上传腾讯云 COS → wine-products/ 目录
        ↓
[数据库层]
只保存 COS URL，不存储图片字节
```

### 21.5 AI 图片生成 Prompt 规范

为保证 AI 生成图片的一致性，使用以下 Prompt 模板：

**主图 Prompt 模板（暗调摄影风格）：**
```
Professional luxury wine product photography. Keep the exact wine bottle 
with its original label, brand name, and all text completely unchanged and 
clearly visible. Place it on a dark marble surface with dramatic side lighting. 
Dark moody background (#0d0505 to #1a0a0a). Gold rim light on the bottle. 
High-end commercial photography style. The label must remain 100% authentic.
```

**配餐场景 Prompt 模板：**
```
Luxury fine dining scene. Keep the exact wine bottle with its original label 
and brand name completely unchanged. Place it on an elegant dining table with 
[配餐食物描述]. Candlelight ambiance, dark moody atmosphere. The wine label 
must remain authentic and legible.
```

### 21.6 后续 AI 辅助编辑功能规划

计划在商家后台（`/wine/admin`）中集成 AI 图片处理功能，允许商家：

1. **上传原始照片** → AI 自动生成多种风格的产品图（主图、配餐图、分享图）
2. **一键换背景** → 提供多种预设场景模板（暗调摄影、餐厅、酒庄、户外）
3. **批量处理** → 一次上传多张原图，批量生成所有风格
4. **预览与选择** → 商家可预览 AI 生成结果，选择满意的图片保存
5. **自动压缩上传** → 选定后自动压缩为 WebP 并上传到腾讯云 COS

**技术实现方向**：使用图像编辑 AI API（如 Stability AI 的 inpainting/outpainting），前端提供拖拽上传界面，后端调用 AI API 处理后直接存入 COS。

> **核心约束**：无论使用何种 AI 技术，都必须遵守 §21.3 的禁止操作，确保产品标签和品牌信息的真实性。


---

## 二十二、认证、路由与部署运维规范（实现细节汇总）

> 本章将分散在各章节的实现细节集中汇总，方便开发时快速查阅。内容与 §3.4、§11.8、§20.8 保持一致，以本章为最终参考。

### 22.1 认证体系总览

脉动平台使用**自建密码认证**，不依赖第三方 OAuth。

| 层次 | 实现 |
|------|------|
| 登录接口 | `trpc.auth.loginWithPassword({ username, password })` |
| Token 存储 | `localStorage('auth-token')` + Cookie `app_session_id`（双保险） |
| 认证状态 | `useAuth()` Hook，返回 `{ user, loading, isAuthenticated, logout }` |
| 强制登录 | `useAuth({ redirectOnUnauthenticated: true })` |
| 登出 | 清除 localStorage token + 清除所有 React Query 缓存 |

### 22.2 首页访问控制逻辑

```
用户访问 /
    ↓
HomeEntry 组件检查认证状态
    ├── loading = true → 显示空白（不渲染，避免闪烁）
    ├── isAuthenticated = false → 跳转 /login
    └── isAuthenticated = true → 渲染 Home.tsx（人脉首页）
                                    ├── username = 'liulifan' → 跳转 /beauty（每次会话一次）
                                    └── 其他用户 → 正常显示人脉首页
```

### 22.3 商家后台权限检查模板

```tsx
// 在 {Name}Admin.tsx 和 {Name}Settings.tsx 顶部使用
const { user, isAuthenticated, loading } = useAuth();
const navigate = useNavigate();

useEffect(() => {
  if (loading) return;
  if (!isAuthenticated) {
    navigate('/login');
    return;
  }
  if (user?.username !== MERCHANT_CODE) {
    navigate('/');
    return;
  }
}, [loading, isAuthenticated, user]);

if (loading || !isAuthenticated || user?.username !== MERCHANT_CODE) {
  return null;
}
```

### 22.4 路由层级规范

| 路由 | 访问权限 | 说明 |
|------|---------|------|
| `/` | 需登录 | 人脉首页（HomeEntry 控制） |
| `/login` | 公开 | 登录页 |
| `/{merchantCode}` | 公开 | 商家首页 |
| `/{merchantCode}/brands` | 公开 | 商品展示 |
| `/{merchantCode}/profile` | 公开（查看需登录） | 个人中心 |
| `/{merchantCode}/admin` | 仅商家本人 | 商品管理后台 |
| `/{merchantCode}/settings` | 仅商家本人 | 商家设置 |

### 22.5 微信爬虫分享 Meta 标签注入

微信爬虫不执行 JavaScript，因此分享卡片的 Meta 标签需要**服务端注入**。

**实现方案**（Express 中间件）：

```ts
// server/routes/merchant-share.ts
app.get('/:merchantCode', async (req, res, next) => {
  const merchant = await getMerchantByCode(req.params.merchantCode);
  if (!merchant) return next();
  
  const html = await fs.readFile(path.join(distDir, 'index.html'), 'utf-8');
  const injected = html.replace(
    '<head>',
    `<head>
    <meta property="og:title" content="${merchant.shareTitle}" />
    <meta property="og:description" content="${merchant.shareDescription}" />
    <meta property="og:image" content="${merchant.shareCoverImage}" />
    <meta property="og:type" content="website" />
    <title>${merchant.shareTitle}</title>`
  );
  res.send(injected);
});
```

> **注意**：此中间件需在 Vite 静态文件服务之前注册，且仅处理商家首页路由（`/{merchantCode}`），其他路由走默认 SPA 处理。

### 22.6 GitHub Actions 自动部署流程

```yaml
# .github/workflows/deploy.yml（简化版）
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Deploy to server
        uses: appleboy/ssh-action@v0.1.10
        with:
          host: 43.136.232.116
          username: root
          password: ${{ secrets.SERVER_PASSWORD }}
          script: |
            cd /www/wwwroot/haoyouji-web
            git pull origin main
            pnpm install --frozen-lockfile
            pnpm build
            pm2 restart haoyouji-web
```

---

*本文档为脉动共享商盟产品架构的权威规则文档，所有开发工作以此为准。如有规则变更，需更新文档版本号并记录变更内容。*


---

## 二十三、商品展示铁规（手机端固定区域规范）

> **核心思想**：参考淘宝/京东手机端商品详情页的成熟规范，将商品详情页拆分为**固定区域**和**自由区域**两部分。固定区域的尺寸、字数、字体、间距全部强制锁死，任何商家、任何商品都不得修改；自由区域由商家自由装修。这样无论 A 店的商品被共享到 B 店展示，固定区域的排版永远整齐统一，不会出现错乱。

---

### 23.1 商品详情页整体结构（从上到下）

```
┌─────────────────────────────────────┐
│  ① 主图轮播区（固定）                │  ← 不可自定义
│  ② 价格 + 标题区（固定）             │  ← 不可自定义
│  ③ 规格选择区（固定）                │  ← 不可自定义
│  ④ 购买操作区（固定）                │  ← 不可自定义
├─────────────────────────────────────┤
│  ⑤ 商家自由装修区（自由）            │  ← 商家可自定义
│     - 商品亮点/卖点模块              │
│     - 品牌故事模块                   │
│     - 使用说明/服务流程模块          │
│     - 其他自定义内容                 │
├─────────────────────────────────────┤
│  ⑥ 商品详情图区（固定格式，内容自由）│  ← 格式固定，图片内容自由
└─────────────────────────────────────┘
```

> **强制规则**：①②③④ 四个固定区域的 HTML 结构和 CSS 样式由平台统一提供，商家**不得修改**这四个区域的任何样式。⑤ 自由区域商家可以完全自定义。⑥ 详情图区格式固定（宽度、间距），但图片内容由商家上传。

---

### 23.2 ① 主图轮播区规范（固定）

**设计参考**：淘宝/京东手机端主图区均采用全宽正方形轮播，宽度 = 屏幕宽度，高度 = 宽度（1:1 正方形）。

| 属性 | 规范值 | 说明 |
|------|--------|------|
| **宽度** | `100vw`（屏幕全宽） | 撑满屏幕，不留边距 |
| **高度** | 等于宽度（1:1 正方形） | `aspect-ratio: 1/1` |
| **图片填充** | `object-fit: cover` | 图片居中裁切，不变形 |
| **轮播点** | 底部居中，圆点样式 | 激活点比非激活点大 1.5 倍 |
| **最多张数** | 9 张（主图 1 张必填，副图最多 8 张） | 超出 9 张不显示 |
| **视频支持** | 第一帧可放商品视频（可选） | 视频时长 15-60 秒，16:9 |
| **背景色** | `#000000`（黑色） | 图片加载前的占位背景 |

**CSS 实现规范**：

```css
.product-image-carousel {
  width: 100vw;
  aspect-ratio: 1 / 1;
  overflow: hidden;
  background: #000;
}

.product-image-carousel img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
```

**禁止行为**：
- 禁止给主图区添加圆角
- 禁止在主图上叠加文字（如"限时特惠"、"爆款"等标签）——这些应放在价格区
- 禁止修改主图区的宽高比

---

### 23.3 ② 价格 + 标题区规范（固定）

**设计参考**：淘宝手机端价格区在主图正下方，红色大字显示价格，标题黑色中等字体，副标题灰色小字。

#### 价格行

| 属性 | 规范值 | 说明 |
|------|--------|------|
| **区域背景** | `#FFFFFF`（白色） | 与主图区无缝衔接 |
| **区域内边距** | `12px 16px`（上下 12px，左右 16px） | 统一间距 |
| **现价字体大小** | `28px`，`font-weight: 700` | 红色，醒目 |
| **现价颜色** | `#E02020`（标准红） | 与脉动红系配色一致 |
| **现价前缀** | `¥` 符号，`18px`，同色 | 符号比数字小 |
| **划线原价** | `16px`，`#999999`，`text-decoration: line-through` | 仅当 `originalPrice > basePrice` 时显示 |
| **折扣标签** | `12px`，白字红底，圆角 `4px`，`padding: 2px 6px` | 自动计算：`折扣 = basePrice / originalPrice × 10` |

#### 标题行

| 属性 | 规范值 | 说明 |
|------|--------|------|
| **商品名称字体** | `16px`，`font-weight: 500`，`line-height: 1.5` | 最多显示 2 行，超出省略 |
| **商品名称颜色** | `#1A1A1A`（近黑） | |
| **商品名称最大字数** | 60 字（数据库强制限制） | 手机端最多显示约 40 字（2 行 × 20 字） |
| **副标题字体** | `13px`，`font-weight: 400`，`line-height: 1.4` | 最多显示 1 行，超出省略 |
| **副标题颜色** | `#666666`（中灰） | |
| **副标题最大字数** | 100 字（数据库强制限制） | 手机端最多显示约 20 字 |

#### 标签行（可选）

| 属性 | 规范值 | 说明 |
|------|--------|------|
| **标签字体** | `11px`，白字 | |
| **标签背景** | 商家主题色（默认 `#E02020`） | |
| **标签圆角** | `3px` | |
| **标签间距** | `4px` | |
| **最多标签数** | 3 个 | 超出不显示 |

**CSS 实现规范**：

```css
.product-info-section {
  background: #fff;
  padding: 12px 16px;
}

.product-price-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 8px;
}

.price-current {
  font-size: 28px;
  font-weight: 700;
  color: #E02020;
  line-height: 1;
}

.price-current::before {
  content: '¥';
  font-size: 18px;
}

.price-original {
  font-size: 16px;
  color: #999;
  text-decoration: line-through;
}

.product-title {
  font-size: 16px;
  font-weight: 500;
  color: #1A1A1A;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin-bottom: 4px;
}

.product-subtitle {
  font-size: 13px;
  color: #666;
  line-height: 1.4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
```

---

### 23.4 ③ 规格选择区规范（固定）

> 规格区仅在商品有多个 SKU（如不同容量、不同次数的套餐）时显示。单规格商品不显示此区域。

| 属性 | 规范值 | 说明 |
|------|--------|------|
| **区域背景** | `#FFFFFF` | |
| **区域内边距** | `12px 16px` | |
| **分隔线** | `1px solid #F0F0F0`，上方 | 与价格区分隔 |
| **规格标签字体** | `13px`，`#333333` | 如"规格"、"套餐" |
| **规格选项字体** | `13px`，`#1A1A1A` | |
| **规格选项背景（未选）** | `#F5F5F5`，圆角 `4px` | |
| **规格选项背景（已选）** | 商家主题色（浅色），边框商家主题色 | |
| **规格选项内边距** | `6px 12px` | |
| **规格选项间距** | `8px` | |
| **数量选择器** | `+/-` 按钮，中间显示数字，字体 `16px` | 最小值 1，最大值 = 库存 |

---

### 23.5 ④ 购买操作区规范（固定，吸底）

> 购买区**固定吸附在屏幕底部**，不随页面滚动。这是手机端电商的通用规范（淘宝、京东、拼多多均如此）。

| 属性 | 规范值 | 说明 |
|------|--------|------|
| **区域高度** | `56px`（不含安全区） | iOS 底部安全区额外增加 `env(safe-area-inset-bottom)` |
| **区域背景** | `#FFFFFF` | |
| **区域阴影** | `0 -2px 8px rgba(0,0,0,0.08)` | 与页面内容分隔 |
| **按钮布局** | 左侧图标区（联系商家、收藏）+ 右侧操作按钮 | |
| **「加入购物车」按钮** | 高度 `40px`，圆角 `20px`，背景 `#FF6B35`（橙色），白字 `15px` | 可选，部分商家不需要 |
| **「立即购买」按钮** | 高度 `40px`，圆角 `20px`，背景商家主题色（默认 `#E02020`），白字 `15px` | 必须有 |
| **左侧图标大小** | `24px × 24px` | |
| **左侧图标颜色** | `#666666` | |
| **左侧图标文字** | `10px`，`#666666` | |

**CSS 实现规范**：

```css
.product-action-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 56px;
  padding-bottom: env(safe-area-inset-bottom);
  background: #fff;
  box-shadow: 0 -2px 8px rgba(0,0,0,0.08);
  display: flex;
  align-items: center;
  padding: 0 12px;
  gap: 8px;
  z-index: 100;
}

.btn-buy-now {
  height: 40px;
  border-radius: 20px;
  background: var(--merchant-primary-color, #E02020);
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  padding: 0 24px;
  border: none;
  flex: 1;
}
```

> **页面底部留白**：由于购买区吸底，页面内容区域底部必须增加 `padding-bottom: 72px`，避免内容被购买区遮挡。

---

### 23.6 ⑤ 商家自由装修区规范（自由，但有边界）

自由装修区是商家体现品牌个性的区域，**不限制内容**，但有以下边界约束：

| 约束项 | 规范 | 说明 |
|--------|------|------|
| **最大宽度** | `100vw`（屏幕全宽） | 不得超出屏幕宽度，禁止横向滚动 |
| **左右内边距** | 最小 `12px` | 文字内容不得贴边 |
| **字体最小值** | `12px` | 禁止使用小于 12px 的字体 |
| **行高最小值** | `1.4` | 保证可读性 |
| **图片宽度** | `100%`（撑满容器） | 图片不得超出容器宽度 |
| **图片格式** | JPG / WebP | 禁止 GIF（影响加载速度） |
| **单张图片大小** | ≤ 2MB | 超出会影响加载速度 |
| **禁止内容** | 不得覆盖固定区域（①②③④） | 自由区在固定区下方 |

**商家可以在自由区做的事**：
- 添加品牌故事文字模块
- 添加商品亮点图文模块
- 添加使用场景图片
- 添加服务流程说明（美容院）
- 添加产区/酒庄介绍（红酒商）
- 添加用户评价模块（未来功能）
- 添加相关商品推荐（未来功能）

---

### 23.7 ⑥ 商品详情图区规范（格式固定，内容自由）

详情图区是商家上传的长图展示区，格式固定但图片内容完全由商家决定。

| 属性 | 规范值 | 说明 |
|------|--------|------|
| **图片宽度** | `100vw`（屏幕全宽） | 撑满屏幕 |
| **图片高度** | 不限（自适应） | 长图自动撑开 |
| **图片间距** | `0`（无间距） | 多张详情图无缝拼接，形成长图效果 |
| **图片填充** | `object-fit: contain`，`width: 100%` | 不裁切，完整展示 |
| **最多张数** | 20 张 | 超出不显示 |
| **单张大小** | ≤ 2MB | |
| **推荐尺寸** | 宽度 750px，高度不限（建议单张 ≤ 1500px） | 参考淘宝手机端详情图标准 |

**CSS 实现规范**：

```css
.product-detail-images {
  width: 100%;
}

.product-detail-images img {
  width: 100%;
  height: auto;
  display: block;
  object-fit: contain;
  /* 无间距，多图拼接成长图 */
  margin: 0;
  padding: 0;
}
```

---

### 23.8 商品列表卡片规范（商品列表页）

商品列表页（如 `/wine/brands`、`/beauty/brands`）的商品卡片同样需要遵守固定规范，确保不同商家的商品在同一列表中显示整齐。

#### 双列卡片（默认布局）

| 属性 | 规范值 | 说明 |
|------|--------|------|
| **列数** | 2 列 | 手机端默认双列 |
| **卡片间距** | `8px`（列间）、`8px`（行间） | |
| **列表左右边距** | `8px` | |
| **缩略图比例** | 1:1（正方形） | `aspect-ratio: 1/1`，`object-fit: cover` |
| **缩略图圆角** | `8px`（上方两角） | 下方无圆角 |
| **商品名称字体** | `13px`，`#1A1A1A`，最多 2 行 | 超出省略 |
| **价格字体** | `16px`，`font-weight: 700`，`#E02020` | 价格前加 `¥` |
| **价格前缀** | `¥`，`12px`，同色 | |
| **卡片背景** | `#FFFFFF` | |
| **卡片圆角** | `8px` | |
| **卡片阴影** | `0 1px 4px rgba(0,0,0,0.06)` | 轻微阴影 |
| **卡片内边距** | 图片无内边距，文字区 `8px` | |

#### 单列卡片（可选布局）

| 属性 | 规范值 | 说明 |
|------|--------|------|
| **布局** | 左图右文 | 图片在左，文字在右 |
| **图片尺寸** | `100px × 100px`，正方形 | `object-fit: cover` |
| **图片圆角** | `6px` | |
| **商品名称字体** | `14px`，`#1A1A1A`，最多 2 行 | |
| **副标题字体** | `12px`，`#999999`，最多 1 行 | |
| **价格字体** | `16px`，`font-weight: 700`，`#E02020` | |

---

### 23.9 商品展示铁规总表（快速查阅）

| 区域 | 关键规范 | 是否可自定义 |
|------|---------|------------|
| **主图轮播** | 100vw × 100vw，1:1 正方形，object-fit: cover | ❌ 不可修改 |
| **价格区** | 现价 28px 红色 #E02020，划线价 16px 灰色 | ❌ 不可修改 |
| **商品名称** | 16px，最多 2 行，60 字上限 | ❌ 不可修改（字数上限） |
| **副标题** | 13px 灰色，最多 1 行，100 字上限 | ❌ 不可修改（字数上限） |
| **规格选择** | 13px，选中态用商家主题色 | ❌ 不可修改（颜色跟随主题） |
| **购买按钮** | 吸底 56px，圆角 20px，主题色背景 | ❌ 不可修改（颜色跟随主题） |
| **自由装修区** | 宽度 100vw，字体 ≥ 12px，图片 ≤ 2MB | ✅ 完全自由 |
| **详情图** | 宽度 100%，无间距拼接，≤ 20 张 | ✅ 内容自由，格式固定 |
| **列表卡片** | 双列，1:1 缩略图，名称 2 行，价格红色 | ❌ 不可修改 |

---

### 23.10 共享商品的展示适配规则

当 A 店的商品被共享到 B 店展示时，**固定区域（①②③④）的样式由 B 店的主题色决定**，内容（图片、标题、价格）来自 A 店的商品数据。

| 数据来源 | 说明 |
|---------|------|
| **商品图片** | 来自 A 店（原始上传的 CDN URL） |
| **商品名称、价格、副标题** | 来自 A 店（`merchant_products` 表） |
| **规格选项** | 来自 A 店（`product_skus` 表） |
| **主题色（价格颜色、按钮颜色）** | 来自 B 店（`merchant_settings.primaryColor`） |
| **购买按钮文字** | 来自 B 店（可自定义，默认"立即购买"） |
| **自由装修区内容** | 来自 A 店（A 店的品牌介绍等） |

> **核心保障**：由于固定区域的 HTML 结构和 CSS 由平台统一提供，无论商品来自哪个商家，在任何商家的店铺展示时，固定区域的排版永远整齐，不会因为商品数据不同而出现错乱。

---

### 23.11 开发实现要求

1. **组件化**：固定区域（①②③④）必须封装为独立的 React 组件（`ProductImageCarousel`、`ProductPriceTitle`、`ProductSpecSelector`、`ProductActionBar`），不得在各商家页面中重复实现。

2. **组件路径**：固定区域组件统一放在 `client/src/components/product/` 目录下，所有商家的商品详情页必须引用这些组件，不得自行实现。

3. **主题色注入**：固定区域组件通过 CSS 变量 `--merchant-primary-color` 接收商家主题色，商家详情页在根元素上设置此变量即可。

4. **禁止覆盖样式**：商家页面的 CSS 不得使用 `!important` 覆盖固定区域的样式，也不得通过父级选择器修改固定区域组件的内部样式。

5. **商品详情页路由**：统一使用 `/{merchantCode}/product/:productId`，组件内通过 `productId` 查询商品数据。

**目录结构示例**：

```
client/src/components/product/
  ProductImageCarousel.tsx    ← 主图轮播区（固定）
  ProductPriceTitle.tsx       ← 价格+标题区（固定）
  ProductSpecSelector.tsx     ← 规格选择区（固定）
  ProductActionBar.tsx        ← 购买操作区（固定，吸底）
  ProductDetailImages.tsx     ← 详情图区（格式固定）
  ProductCard.tsx             ← 列表卡片（固定）
```

**商品详情页使用示例**：

```tsx
// client/src/pages/wine/WineProductDetail.tsx
import { ProductImageCarousel } from '@/components/product/ProductImageCarousel';
import { ProductPriceTitle } from '@/components/product/ProductPriceTitle';
import { ProductSpecSelector } from '@/components/product/ProductSpecSelector';
import { ProductActionBar } from '@/components/product/ProductActionBar';
import { ProductDetailImages } from '@/components/product/ProductDetailImages';

export function WineProductDetail() {
  const { productId } = useParams();
  const { data: product } = trpc.product.getById.useQuery({ id: productId });

  return (
    <div style={{ '--merchant-primary-color': '#8B1A1A' } as React.CSSProperties}>
      {/* ① 固定：主图轮播 */}
      <ProductImageCarousel images={product?.images} />
      
      {/* ② 固定：价格+标题 */}
      <ProductPriceTitle product={product} />
      
      {/* ③ 固定：规格选择（有多规格时显示） */}
      {product?.skus?.length > 1 && <ProductSpecSelector skus={product.skus} />}
      
      {/* ⑤ 自由装修区：红酒商家自定义内容 */}
      <WineProductCustomSection product={product} />
      
      {/* ⑥ 固定格式：详情图 */}
      <ProductDetailImages images={product?.detailImages} />
      
      {/* ④ 固定：购买操作区（吸底） */}
      <ProductActionBar product={product} />
    </div>
  );
}
```

---

*本文档为脉动共享商盟产品架构的权威规则文档，所有开发工作以此为准。如有规则变更，需更新文档版本号并记录变更内容。*
