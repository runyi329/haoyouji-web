/**
 * 润仪算力研发中心 - 建站规则（法律法规式文档）
 * 路由：/jiang/build-rules
 *
 * 脉动共享商盟架构规则文档 v1.7
 * 所有条款硬编码，按章节编号展开，无需接口加载
 * 以后有新规则直接告知加在第几条
 */
import { useLocation } from "wouter";
import { ArrowLeft, ChevronDown, ChevronRight, BookOpen, Copy, Check } from "lucide-react";
import { useState, useCallback } from "react";
import BottomNav from "@/components/BottomNav";

// ─────────────────────────────────────────────
// 工具函数：将条款内容转为纯文本
// ─────────────────────────────────────────────
function articleToText(article: Article): string {
  const lines: string[] = [article.title];
  if (Array.isArray(article.content)) {
    article.content.forEach(item => {
      // 去掉前缀符号如【强制】【入口①】等方括号内容的标记符，保留文字
      const clean = item.replace(/^【[^】]*】\s*/, "").replace(/^入口[①②③④⑤⑥]【[^】]*】：?\s*/, "");
      lines.push(clean);
    });
  } else {
    lines.push(article.content);
  }
  return lines.join("\n");
}

function chapterToText(chapter: Chapter): string {
  const lines: string[] = [`第${chapter.num}章 ${chapter.title}`];
  chapter.articles.forEach(a => {
    lines.push("");
    lines.push(articleToText(a));
  });
  return lines.join("\n");
}

// ─────────────────────────────────────────────
// 子组件：复制按钮
// ─────────────────────────────────────────────
function CopyBtn({ getText }: { getText: () => string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const text = getText();
    if (navigator.vibrate) navigator.vibrate(50);
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      const el = document.createElement("textarea");
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [getText]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="p-1.5 hover:bg-[#1e1e35] rounded transition-colors flex-shrink-0 cursor-pointer active:scale-95"
      title="复制"
    >
      {copied
        ? <Check className="w-4 h-4 text-green-400" />
        : <Copy className="w-4 h-4 text-[#555577] hover:text-[#888899]" />
      }
    </button>
  );
}

// ─────────────────────────────────────────────
// 文档数据结构
// ─────────────────────────────────────────────
interface Article {
  id: string;       // 如 "1.1"
  title: string;
  content: string | string[]; // 字符串或条款列表
  type?: "text" | "list" | "table";
  tableData?: { headers: string[]; rows: string[][] };
}

interface Chapter {
  num: string;      // 如 "一"
  title: string;
  articles: Article[];
}

const CHAPTERS: Chapter[] = [
  {
    num: "一",
    title: "核心定位与设计理念",
    articles: [
      {
        id: "1.1",
        title: "脉动共享商盟的价值主张",
        content: "脉动网不是一个普通的建站工具，而是一套「商家网站 + 人脉管理 + 钱脉管理」三合一的商业基础设施。核心理念：不管做什么生意，都需要管客户（人脉）、管账（钱脉）。脉动网把这两个能力内嵌到每一个商家网站里，成为商家最强有力的管理工具。商家的网站是对外展示的门面，人脉是管理客户关系的工具，钱脉是管理财务的工具，三者共生在同一个框架内，互相打通数据。",
      },
      {
        id: "1.2",
        title: "商家网站的内容自由度与开发边界",
        type: "list",
        content: [
          "商家的H5网站内容完全自由，可以是商城、公司介绍、个人主页、服务预约平台，或任意其他形态。脉动网不限制商家网站的内容形态，只提供统一的框架和工具。",
          "可定制：页面内容、视觉样式、内部导航结构、功能模块的增减。",
          "不可定制：底部三按鈕导航结构、用户体系、订单归属规则、资金流向规则。",
          "框架层（server/_core、BottomNav 核心逻辑）不得修改，只能在业务层添加功能。",
        ],
      },
      {
        id: "1.3",
        title: "首页三大必备入口（强制规则）",
        type: "list",
        content: [
          "【强制】无论商家网站是什么形态，首页必须包含以下三个入口，这是不可妥协的强制规则。",
          "入口①【分享】：生成公开链接，分享给陌生人。呈现形式可选：顶部分享图标 / 顶部分享按钮 / 悬浮分享按钮。",
          "入口②【注册/登录】：引导访客注册或登录。呈现形式可选：顶部右上角按钮 / 头像位置点击触发 / 页面内文字按钮。",
          "入口③【个人中心】：商家管理商品/订单/设置，访客查看自己的信息。呈现形式可选：头像点击进入 / 「我的」Tab / 顶部右上角图标。",
          "三个入口的视觉样式完全由商家网站定制，可以是图标、文字按钮、头像入口、悬浮按钮等任意形态，但功能必须存在，且用户能够找到。",
        ],
      },
    ],
  },
  {
    num: "二",
    title: "底部导航框架（核心规则）",
    articles: [
      {
        id: "2.1",
        title: "标准底部导航结构",
        type: "list",
        content: [
          "所有商家网站的底部导航遵循统一的三按钮结构：左侧「人脉」小图标、中间「商家名称」大圆形按钮、右侧「钱脉」小图标。",
          "左按钮【人脉】：小图标 + 文字，功能为进入人脉管理页面。",
          "中按钮【商家名称】：大圆形按钮（商家主题色），功能为商家网站首页（默认打开页面）。",
          "右按钮【钱脉】：小图标 + 文字，功能为进入钱脉账本页面。",
        ],
      },
      {
        id: "2.2",
        title: "原「添加人脉」按钮的替换规则",
        type: "list",
        content: [
          "原来：脉动网底部中间是红色圆形「添加人脉」按钮（+ 图标）。",
          "现在：当用户拥有商家网站时，中间按钮替换为该商家的网站入口按钮（显示商家名称缩写）。",
          "添加人脉的新入口：移至人脉Tab内部的「+」按钮。",
          "添加账本的新入口：移至钱脉Tab内部的「+」按钮。",
        ],
      },
      {
        id: "2.3",
        title: "商家网站内部导航",
        content: "商家网站内部可以有自己的Tab导航（与底部脉动导航相互独立）。商家内部导航完全由商家自定义，脉动网不做限制。",
      },
      {
        id: "2.4",
        title: "全局底部导航强制保留规则（强制）",
        type: "list",
        content: [
          "【铁律】BottomNav 是全局强制组件，每个商家子页面都必须引入并渲染 <BottomNav />，不可被商家自己的 Tab 导航替换或省略。",
          "【禁止】商家不得在自己的页面中隐藏、覆盖或移除底部三个按钮（人脉 / 商家 / 钱脉）。",
          "【原因】人脉按钮是用户回到主 App 的唯一通道；钱脉按钮是用户访问账本的唯一通道；商家按钮是用户在商家各子页面间快速回到首页的通道。移除任何一个都会造成用户迷失在商家子页面中无法返回。",
          "【内容区间距】商家子页面内容区底部必须添加 pb-24（96px）的内边距，防止内容被底部导航遮挡。",
          "【中间按鈕文字/图标规范】文字与图标必须放在圆形按鈕内部，使用 flex-col 垂直排列，图标 w-5 h-5，文字 text-[10px]，不得将文字写在圆形按鈕外部下方（会被手机截断）。",
        ],
      },
      {
        id: "2.5",
        title: "主题色定制规则",
        type: "list",
        content: [
          "每个商家有自己的主题色，用于底部导航中间按鈕、页面强调色、按鈕颜色等。",
          "主题色必须在 BottomNav.tsx 中通过 isXxxPage 判断来切换，不得全局修改 CSS 变量。",
          "商家页面内部可以自由使用主题色，但不得影响脉动主 App 的全局样式。",
        ],
      },
      {
        id: "2.6",
        title: "底部导航中间按鈕样式规范（强制）",
        type: "list",
        content: [
          "样式：圆形悬浮按鈕，w-14 h-14 rounded-full，商家主题色背景。",
          "内容：图标（w-5 h-5）+ 文字（text-[10px]），flex-col 垂直排列，全部在圆形内部。",
          "【禁止】将文字写在圆形按鈕外部下方（absolute -bottom-5），在手机端会被截断。",
          "激活状态：在商家所有子页面（/jiang/*）浏览时，中间按鈕保持高亮/激活状态。",
          "点击行为：点击中间按鈕跳转到商家首页（/{merchantName}）。",
        ],
      },
    ],
  },
  {
    num: "三",
    title: "用户体系与登录态管理",
    articles: [
      {
        id: "3.1",
        title: "统一用户体系",
        content: "所有用户数据全局统一。无论用户从哪个入口注册（脉动网人脉页、某商家的H5页面、红酒网站、美容院网站），都进入同一个用户数据库。同一个手机号/账号，在整个脉动网生态里只有一个身份。用户在商家A的网站注册后，自动进入脉动网用户体系；商家A的人脉列表里自动出现该用户；该用户可以用同一账号访问其他商家网站。",
      },
      {
        id: "3.2",
        title: "两种访问模式",
        type: "list",
        content: [
          "模式A【商家本人访问】：系统自动识别为已登录状态（通过 localStorage + refresh token 实现长期保持）。除非商家主动点击退出，否则始终保持登录态。",
          "模式B【陌生访客访问】：全站所有浏览类页面（首页、品牌中心、商品详情页）对未登录用户完全开放，不做任何登录检查、不弹出登录提示、不遮挡内容。",
          "只有以下操作才触发登录跳转：点击底部导航的「人脉」按钮、点击底部导航的「钱脉」按钮、点击商品页的「购买」「加入购物车」按钮、点击页面上的「登录」按钮。",
          "登录成功后，自动回到触发登录前的页面，进入访客自己的人脉和钱脉数据。",
        ],
      },
      {
        id: "3.3",
        title: "登录态核心原则",
        content: "底部导航对所有人完全一样，区别只在于登录状态和数据归属。浏览类操作（看首页、看商品、看详情）永远不要求登录；交互类操作（购买、进入人脉/钱脉）才要求登录。",
      },
      {
        id: "3.4",
        title: "分享链接自带邀请码机制（开发必读）",
        type: "list",
        content: [
          "所有分享链接必须自动携带当前登录用户的邀请码，格式为 ?ref={当前用户inviteCode}。未登录时使用商城默认邀请码。",
          "ref= 参数的唯一作用是推荐注册绑定，与订单归属无关。",
          "已有账号的用户：正常登录，不重复绑定邀请关系，登录后返回原页面。",
          "新用户：跳转到注册页，自动预填邀请码，注册完成后该客人自动成为分享者的人脉。",
          "系统在 localStorage 中存储 ref 参数（有效期 7 天），防止用户中途关闭页面后丢失邀请关系。",
          "分享面板 UI 规则：面板顶部必须显示当前用户的邀请码，例如「已包含您的邀请码 cx8618，好友注册后自动成为您的人脉」。",
        ],
      },
      {
        id: "3.5",
        title: "订单归属铁律",
        type: "list",
        content: [
          "订单归属由商品所在的商城决定，与分享者无关。",
          "A 分享自己商城的商品链接 → 订单归 A，佣金归 A。",
          "B 分享 A 商城的商品链接 → 订单归 A，B 不计算佣金。",
          "B 有自己的商城且上架了同款商品，B 分享自己商城的链接 → 订单归 B，佣金归 B。",
          "核心原则：想获得佣金，必须在自己的商城里上架商品，分享自己商城的链接。",
        ],
      },
    ],
  },
  {
    num: "四",
    title: "商品体系",
    articles: [
      {
        id: "4.1",
        title: "商品来源的两种类型",
        type: "list",
        content: [
          "类型A【商家自有商品】：商家自己录入、自己销售、自己发货，完全归属商家。",
          "类型B【共享商品】：A 和 B 互相共享人脉后，A 可申请销售 B 的商品，经 B 审核确认后，B 的商品出现在 A 的商城里。发货由 B 负责，佣金按约定比例分配。",
          "【重要】平台不直接发布商品。平台即使有商品，也必须以某个用户/商家的身份录入，所有商品都必须归属于一个具体的商家用户。平台层面不存在「平台配置商品」这一类型。",
        ],
      },
      {
        id: "4.2",
        title: "前台商品列表查询规范（强制）",
        type: "list",
        content: [
          "【强制】所有商家子页面的前台商品列表，必须使用 getShopProducts 接口，禁止使用 getPublicProducts。",
          "正确做法：trpc.merchant.getShopProducts.useQuery({ merchantCode: MERCHANT_CODE })，走店铺陈列层，支持上架/下架控制，只返回 isVisible=1 且 status='active' 的商品。",
          "错误做法：trpc.merchant.getPublicProducts，直接查总库，绕过店铺陈列层，无法控制上架/下架。",
        ],
      },
      {
        id: "4.3",
        title: "商品图片规范",
        type: "list",
        content: [
          "主图（必填）：800×800px 或以上，正方形（1:1），JPG/WebP，≤3MB，白底或纯色背景。",
          "副图（可选）：800×800px，正方形（1:1），JPG/WebP，≤3MB，最多9张。",
          "详情图（可选）：宽度750px，高度不限，JPG/WebP，每张≤2MB，长图展示详细信息。",
          "分享封面（可选）：1200×630px，横版（16:9近似），JPG/WebP，≤1MB，用于微信分享卡片。",
          "所有图片上传到腾讯云 COS，数据库只保存 CDN URL。",
        ],
      },
    ],
  },
  {
    num: "五",
    title: "共享商品机制（人脉共享经济）",
    articles: [
      {
        id: "5.1",
        title: "核心理念",
        content: "人脉共享 → 商品共享 → 共同销售。只要A和B互相共享了人脉，且双方都是商家，A就有权申请销售B的商品，B也有权申请销售A的商品。这形成了一个基于信任关系的共享经济网络。",
      },
      {
        id: "5.2",
        title: "共享商品触发流程",
        type: "list",
        content: [
          "第1步：A 和 B 互相共享人脉（已有）。",
          "第2步：A 向 B 发起「商品共享申请」，A 选择想销售的商品类目，A 提出佣金比例建议（如：我给你20%佣金）。",
          "第3步：B 审核并确认（或拒绝）。",
          "第4步：B 确认后，A 的商城里出现 B 的商品，A 可以开始销售。",
          "共享人脉只是「我认识你」，共享商品涉及资金，必须经过双方明确确认，不自动共享。",
        ],
      },
      {
        id: "5.3",
        title: "商家A对共享商品的操作权限",
        type: "list",
        content: [
          "可以：在自己的商城里展示/隐藏该商品（控制上下架）。",
          "可以：修改展示价格（在B设定的价格基础上加价，不能低于B的价格）。",
          "不可以：修改商品的基础信息（名称、描述、主图等），这些由B控制。",
          "不可以：修改库存数量，库存由B管理。",
        ],
      },
    ],
  },
  {
    num: "六",
    title: "资金托管与自动分账",
    articles: [
      {
        id: "6.1",
        title: "资金流向原则（方案C：平台托管）",
        type: "list",
        content: [
          "买家付款 → 资金进入平台托管账户（不直接到商家）。",
          "商家发货 → 买家确认收货 → 平台自动将货款（扣除平台服务费）转给商家。",
          "共享商品订单 → 平台自动按约定比例将佣金分给分销商家。",
          "平台服务费：从每笔成功交易中收取，比例待定（参考行业标准3%-5%）。",
        ],
      },
      {
        id: "6.2",
        title: "佣金比例参考",
        type: "list",
        content: [
          "标准品类（实物商品）：建议佣金比例 15%-25%。",
          "高端品类（奢侈品、定制服务）：建议佣金比例 10%-20%。",
          "服务类（美容、咨询）：建议佣金比例 20%-30%。",
          "具体比例由商家A和商家B协商确定，平台不强制规定。",
        ],
      },
    ],
  },
  {
    num: "七",
    title: "风险控制体系",
    articles: [
      {
        id: "7.1",
        title: "B 不发货的处理机制",
        type: "list",
        content: [
          "买家付款后，系统自动通知B发货（短信 + App 通知）。",
          "48小时内未发货：系统自动提醒B，同时通知A（分销商）跟进。",
          "72小时内未发货：买家可申请退款，平台介入处理。",
          "退款成功后：平台记录B的违约行为，累计3次违约暂停B的商品共享资格。",
        ],
      },
      {
        id: "7.2",
        title: "事前风险控制（商家入驻审核）",
        type: "list",
        content: [
          "商家入驻需提供：真实姓名、联系方式、营业执照（可选）、商品样品图。",
          "平台人工审核，审核周期1-3个工作日。",
          "高价值商品（单价>1000元）需额外提供商品真实性证明。",
        ],
      },
    ],
  },
  {
    num: "八",
    title: "平台后台商品库",
    articles: [
      {
        id: "8.1",
        title: "商品库的两个层次",
        type: "list",
        content: [
          "层次1【商家自有商品库】：商家自己录入，只在自己的商城展示，完全由商家控制。",
          "层次2【店铺陈列层】：商家决定哪些商品出现在自己的店铺前台（可以是自有商品+共享商品的混合）。",
          "【废除】平台公共商品库不再存在。平台不直接维护商品，所有商品必须由具体商家用户录入和归属。",
        ],
      },
      {
        id: "8.2",
        title: "商品归属原则（强制）",
        type: "list",
        content: [
          "【强制】每个商品必须有且只有一个「原始归属商家」（merchantId），即最初录入该商品的商家。",
          "共享商品在其他商家的店铺展示时，原始归属不变，只是增加了一条「共享关系记录」。",
          "【强制】不存在 merchantId = NULL 的商品。所有商品必须归属于一个具体的商家用户，平台不直接拥有商品。",
          "商品的基础信息（名称、描述、主图）只有原始归属商家才能修改。",
        ],
      },
    ],
  },
  {
    num: "九",
    title: "用户个人中心体系（双层架构）",
    articles: [
      {
        id: "9.1",
        title: "双层个人中心架构（核心规则）",
        type: "list",
        content: [
          "每位用户拥有两个个人中心入口，数据完全打通，只是展示范围和入口位置不同。",
          "完整版个人中心：位于脉动人脉网主 App，包含全部数据——人脉、账本、所有商家订单、积分、设置等。",
          "轻量版个人中心：位于商家子页面，仅展示该商家相关内容，内容由商家自行决定。",
          "商家通常只推广自己的子页面，用户在商家页面内通过轻量版个人中心即可完成常用操作，需要完整数据时可跳转主 App。",
        ],
      },
      {
        id: "9.2",
        title: "未登录用户规则（强制）",
        type: "list",
        content: [
          "未登录用户不显示「个人中心」Tab 或任何个人中心入口。",
          "仅在页面顶部左上角或右上角显示一个简洁的「登录」按钮（不写「注册」字样）。",
          "点击「登录」按钮进入登录页，系统自动判断：已注册用户直接登录，新用户显示注册流程。",
          "【禁止】在首页内容区域放置注册引导卡片、注册弹窗或任何注册相关的大面积 UI。",
        ],
      },
      {
        id: "9.3",
        title: "已登录普通用户的轻量版个人中心规则",
        type: "list",
        content: [
          "已登录用户可见「我的」Tab 或个人中心入口（具体呈现形式由商家自定义）。",
          "轻量版个人中心的内容完全由商家自行决定，平台不做强制约定。",
          "建议包含：我的订单（用户最常用需求）、联系客服、分享入口。",
          "可选包含：我的积分/余额、我的会员等级、优惠券、收货地址等。",
          "建议提供「进入完整版个人中心」的引导入口，跳转到脉动主 App 个人中心。",
        ],
      },
      {
        id: "9.4",
        title: "商家管理员的个人中心规则",
        type: "list",
        content: [
          "商家管理员（username === merchantCode）的个人中心显示管理功能，与普通用户不同。",
          "商家管理员必须实现的固定配置项：商家设置（名称/Logo/封面图/简介）、商品管理、建站规则入口。",
          "商家管理员可选配置项：订单管理、数据统计、优惠券管理、共享商品管理。",
          "权限判断方式：前端通过 useAuth().user?.username === merchantCode 判断，后端通过 ctx.user.username 验证。",
        ],
      },
      {
        id: "9.5",
        title: "数据隔离与打通规则",
        type: "list",
        content: [
          "商家只能看到自己商城的数据（商品、订单、访客统计）。",
          "用户在轻量版个人中心看到的订单，与完整版个人中心的订单数据完全一致（同一数据库）。",
          "跨商家的数据查询必须经过权限验证，禁止商家 A 查询商家 B 的订单数据。",
          "用户在轻量版个人中心只能看到自己的订单和信息，不能看到其他用户的数据。",
        ],
      },
    ],
  },
  {
    num: "十",
    title: "通用商家设置组件规范",
    articles: [
      {
        id: "10.1",
        title: "通用设置组件原则（核心规范）",
        type: "list",
        content: [
          "所有商家共用同一套 MerchantSettingsPage 组件，UI 布局和功能字段完全相同。",
          "通过 merchantCode 参数区分数据，每个商家的设置数据互相独立，互不影响。",
          "新增商家时，只需创建一个薄包装页（如 JiangSettings.tsx），传入 merchantCode 等参数即可，无需重新开发设置页。",
          "组件路径：client/src/components/MerchantSettingsPage.tsx",
        ],
      },
      {
        id: "10.2",
        title: "设置组件必须包含的字段",
        type: "list",
        content: [
          "分享配置（必填）：商家 Logo（建议 400×400px）、分享封面图（建议 1200×630px）、分享标题（最多 50 字）、分享描述语（最多 100 字）。",
          "联系方式（可选）：微信号、联系电话、官网地址。",
          "关于我们（可选）：品牌/团队/服务介绍（最多 500 字）。",
          "图片上传：自动压缩为 WebP 格式，存储至 S3，禁止将图片字节存入数据库。",
        ],
      },
      {
        id: "10.3",
        title: "商家页面路由与访问控制规范",
        type: "list",
        content: [
          "商家首页：/{merchantName}（如 /wine、/beauty、/jiang），所有人可访问，无需登录。",
          "商家子页面：/{merchantName}/{pageName}（如 /wine/brands、/jiang/shop），所有人可访问。",
          "商家设置：/{merchantName}/settings，仅 username === merchantCode 的管理员可访问，非管理员显示权限拦截页。",
          "商家后台：/{merchantName}/admin，仅 username === merchantCode 的用户可访问，其他用户跳转首页。",
          "商家商品详情：/{merchantName}/product/{slug}，公开访问。",
          "分享页：/share/{merchantName} 或 /share/{merchantName}/product/{slug}，所有人可访问，无需登录，不含任何 App 导航元素。",
          "路由命名：全部小写，单词间用连字符（-）分隔，如 /jiang/build-rules。",
          "返回按鈕默认指向 /{merchantCode}/profile（个人中心）。",
        ],
      },
      {
        id: "10.4",
        title: "薄包装页写法（新商家接入示例）",
        type: "list",
        content: [
          "在 pages/{name}/ 目录下创建 {Name}Settings.tsx，内容只需引入 MerchantSettingsPage 并传入参数。",
          "必须传入的参数：merchantCode（商家编码）、adminUsername（管理员用户名）。",
          "可选参数：accentColor（主题色）、bgColor（背景色）、cardBgColor（卡片色）、backPath（返回路径）。",
          "在 App.tsx 中注册路由：<Route path=\"/{name}/settings\" component={NameSettings} />",
        ],
      },
      {
        id: "10.5",
        title: "设置数据生效范围",
        type: "list",
        content: [
          "保存后立即生效：分享链接的 OG 标签（og:title、og:description、og:image）。",
          "保存后立即生效：商家首页顶部的名称和 Logo 展示。",
          "保存后立即生效：微信/浏览器分享卡片显示商家自己的信息。",
          "服务端 MERCHANT_PATH_MAP 必须包含该商家路径，否则 OG 标签不会注入。",
          "未配置时，微信分享将显示脉动默认信息（脉动网 Logo 和标题），影响商家品牌形象。",
        ],
      },
      {
        id: "10.6",
        title: "商家子页面目录结构规范",
        type: "list",
        content: [
          "所有商家子页面文件放在 client/src/pages/{merchantName}/ 目录下。",
          "文件命名：{MerchantName}{PageName}.tsx，如 JiangHome.tsx、JiangShop.tsx。",
          "必须创建的文件：{Name}Home.tsx（首页）、{Name}Profile.tsx（个人中心）、{Name}TabBar.tsx（内部导航）、{Name}Share.tsx（分享海报页）。",
          "路由注册在 client/src/App.tsx 中统一管理。",
        ],
      },
    ],
  },
  {
    num: "二十三",
    title: "商品展示铁规（手机端固定区域规范）",
    articles: [
      {
        id: "23.1",
        title: "商品详情页整体结构（从上到下）",
        type: "list",
        content: [
          "① 主图轮播区（固定，不可省略）：全宽，高度 = 屏幕宽度（1:1正方形），支持左右滑动切换。",
          "② 价格 + 标题区（固定，不可省略）：价格行、标题行、标签行（可选）。",
          "③ 规格选择区（固定，有规格时必须显示）：颜色/尺寸/套餐等规格选择。",
          "④ 购买操作区（固定，吸底显示）：加入购物车 + 立即购买，或直接购买按钮。",
          "⑤ 商家自由装修区（自由，但有边界）：商家自定义内容区域。",
          "⑥ 商品详情图区（格式固定，内容自由）：长图展示区。",
        ],
      },
      {
        id: "23.2",
        title: "主图轮播区规范（固定）",
        type: "list",
        content: [
          "尺寸：全宽（100vw），高度 = 屏幕宽度（aspect-ratio: 1/1），不可改变比例。",
          "图片数量：1-9张，支持左右滑动，底部显示小圆点指示器。",
          "图片质量：必须使用 object-fit: cover，禁止拉伸变形。",
          "加载策略：第一张图片优先加载（loading=eager），其余懒加载。",
        ],
      },
      {
        id: "23.3",
        title: "价格区规范（固定）",
        type: "list",
        content: [
          "价格行：销售价格（大字，主题色或红色）+ 划线原价（小字，灰色，可选）。",
          "价格字号：销售价格 text-2xl font-bold，原价 text-sm line-through。",
          "标题行：商品名称，text-lg font-semibold，最多显示2行，超出省略。",
          "标签行（可选）：商品标签，如「包邮」「限时优惠」「热销」，小圆角标签样式。",
        ],
      },
      {
        id: "23.4",
        title: "购买操作区规范（固定，吸底）",
        type: "list",
        content: [
          "位置：固定在屏幕底部（position: fixed, bottom: 底部导航高度），不随页面滚动。",
          "高度：64px（h-16），背景白色或商家主题色。",
          "按钮布局：「加入购物车」（左，次要色）+ 「立即购买」（右，主题色），各占50%宽度。",
          "未登录点击：跳转登录页，登录后自动返回该商品页。",
          "已售罄：按钮变灰，显示「已售罄」，不可点击。",
        ],
      },
    ],
  },
  {
    num: "二十四",
    title: "商品分享页架构规则（双链接体系）",
    articles: [
      {
        id: "24.1",
        title: "双链接定义",
        type: "list",
        content: [
          "商品详情页（/{name}/product/:slug）：需要登录才能购买，App 内部使用，有返回按钮、底部 TabBar。",
          "商品分享页（/share/{name}/product/:slug）：无需登录，对外传播，无返回按钮、无顶部导航、无底部 TabBar。",
          "两个链接指向同一个商品，但面向不同场景：内部使用 vs 对外分享。",
        ],
      },
      {
        id: "24.2",
        title: "分享页四大设计原则",
        type: "list",
        content: [
          "原则①【零门槛访问】：不做任何登录检查，内容完整展示，陌生人打开链接即可看到全部商品信息。",
          "原则②【独立页面结构】：不含 App 任何导航元素（无顶部返回、无底部 TabBar、无侧边栏），顶部只能放商家 Logo。",
          "原则③【唯一行动入口】：底部固定「立即购买」按钮，点击后未登录跳转登录页，登录后自动回到详情页（不是分享页）。",
          "原则④【可二次分享】：分享页自带分享按钮，可继续裂变传播，分享链接携带当前用户邀请码。",
        ],
      },
      {
        id: "24.3",
        title: "路由规范",
        type: "list",
        content: [
          "分享页统一以 /share/ 前缀开头。",
          "商家首页分享：/share/{merchantName}。",
          "商品分享：/share/{merchantName}/product/{slug}。",
          "分享页路由在 App.tsx 中注册，必须放在商家路由之后，避免路由冲突。",
          "分享页不需要登录保护，直接渲染，不走 HomeEntry 组件的登录检查逻辑。",
        ],
      },
      {
        id: "24.4",
        title: "分享页与详情页对照表",
        type: "list",
        content: [
          "顶部导航：详情页有（商家Logo + 返回按钮），分享页只有商家Logo，无返回按钮。",
          "底部导航：详情页有（人脉/商家/钱脉），分享页无。",
          "登录要求：详情页浏览不需要，购买需要；分享页完全不需要。",
          "购买按钮：详情页吸底显示，分享页吸底显示（点击后跳转登录再回详情页）。",
          "分享按钮：两者都有，但分享页的分享按钮更突出。",
          "ref= 邀请码：两者都携带，存储到 localStorage（7天有效期）。",
        ],
      },
    ],
  },
];

// ─────────────────────────────────────────────
// 子组件：单条条款
// ─────────────────────────────────────────────
function ArticleItem({ article }: { article: Article }) {
  const [open, setOpen] = useState(false);
  const getText = useCallback(() => articleToText(article), [article]);

  return (
    <div className="border-b border-[#1a1a2e] last:border-0">
      <div className="flex items-start gap-2 px-4 py-3">
        <button
          onClick={() => setOpen(!open)}
          className="flex items-start gap-3 flex-1 text-left min-w-0"
        >
          <span className="text-[#D32F2F] text-xs font-mono font-bold mt-0.5 shrink-0 w-8">
            {article.id}
          </span>
          <span className="text-[#ccccdd] text-sm flex-1 leading-snug">{article.title}</span>
          {open
            ? <ChevronDown className="w-4 h-4 text-[#444466] shrink-0 mt-0.5" />
            : <ChevronRight className="w-4 h-4 text-[#444466] shrink-0 mt-0.5" />
          }
        </button>
        <CopyBtn getText={getText} />
      </div>

      {open && (
        <div className="px-4 pb-4">
          {Array.isArray(article.content) ? (
            <ul className="space-y-2">
              {article.content.map((item, i) => (
                <li key={i} className="flex gap-2 text-xs text-[#9999bb] leading-relaxed">
                  <span className="text-[#D32F2F] shrink-0 mt-0.5">·</span>
                  <span className="flex-1 min-w-0 break-words">{item}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-[#9999bb] leading-relaxed break-words">{article.content}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// 子组件：章节
// ─────────────────────────────────────────────
function ChapterSection({ chapter }: { chapter: Chapter }) {
  const [open, setOpen] = useState(false);
  const getText = useCallback(() => chapterToText(chapter), [chapter]);

  return (
    <div className="mb-3">
      <div className="flex items-center gap-2 bg-[#0d0d1a] border border-[#1e1e35] rounded-2xl px-4 py-3">
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-3 flex-1 min-w-0 text-left"
        >
          <div className="w-8 h-8 rounded-full bg-[#D32F2F]/20 flex items-center justify-center shrink-0">
            <span className="text-[#D32F2F] text-[10px] font-bold">{chapter.num}</span>
          </div>
          <span className="text-white text-sm font-semibold flex-1">
            第{chapter.num}章 · {chapter.title}
          </span>
          <span className="text-[#444466] text-[10px]">{chapter.articles.length}条</span>
          {open
            ? <ChevronDown className="w-4 h-4 text-[#444466] shrink-0" />
            : <ChevronRight className="w-4 h-4 text-[#444466] shrink-0" />
          }
        </button>
        <CopyBtn getText={getText} />
      </div>

      {open && (
        <div className="mt-1 bg-[#0d0d1a] border border-[#1e1e35] rounded-2xl">
          {chapter.articles.map(article => (
            <ArticleItem key={article.id} article={article} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// 主页面
// ─────────────────────────────────────────────
export default function JiangBuildRules() {
  const [, setLocation] = useLocation();
  const totalArticles = CHAPTERS.reduce((sum, c) => sum + c.articles.length, 0);

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white">
      {/* 顶部 Header */}
      <div className="bg-[#0d0d14] border-b border-[#D32F2F]/20 sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => setLocation("/jiang/profile")}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-[#1a1a2e] text-[#888899] hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-[#D32F2F]" />
            <div>
              <div className="text-sm font-bold text-white leading-tight">建站规则</div>
              <div className="text-[10px] text-[#D32F2F] leading-tight">脉动共享商盟架构规则 v1.7</div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4 pb-28">
        {/* 文档说明卡片 */}
        <div className="bg-[#0d0d1a] border border-[#D32F2F]/30 rounded-2xl p-4 mb-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#D32F2F]/20 flex items-center justify-center shrink-0">
              <BookOpen className="w-5 h-5 text-[#D32F2F]" />
            </div>
            <div className="flex-1">
              <div className="text-white text-sm font-bold">脉动共享商盟架构规则文档</div>
              <div className="text-[11px] text-[#888899] leading-relaxed mt-1">
                本文档定义了所有在脉动网平台上开发的商家网站的完整架构规则。凡涉及新商家建站、功能扩展、UI设计等工作，均以本文档为准。
              </div>
              <div className="flex items-center gap-3 mt-2">
                <span className="text-[10px] text-[#444466]">版本 v1.7</span>
                <span className="text-[10px] text-[#444466]">{CHAPTERS.length} 章 · {totalArticles} 条</span>
                <span className="text-[10px] bg-[#D32F2F]/20 text-[#D32F2F] px-2 py-0.5 rounded-full">权威文档</span>
              </div>
            </div>
          </div>
        </div>

        {/* 章节列表 */}
        {CHAPTERS.map(chapter => (
          <ChapterSection key={chapter.num} chapter={chapter} />
        ))}

        {/* 底部说明 */}
        <div className="mt-4 text-center text-[10px] text-[#333355] leading-relaxed">
          <p>本文档由润仪算力研发中心维护</p>
          <p>如需新增或修改条款，请联系管理员</p>
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
