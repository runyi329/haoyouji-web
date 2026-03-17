/**
 * AiCompanyWorkspace.tsx - AI 型定制账本（共享公司股权管理）工作台
 * 集成 Molynk 品牌中文介绍页面
 */
import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import {
  ArrowLeft,
  PieChart,
  Users,
  TrendingUp,
  FileText,
  Plus,
  Award,
  Globe,
  Leaf,
  ShieldCheck,
  Heart,
  Store,
  Handshake,
  Wrench,
  Newspaper,
  MapPin,
  Mail,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

type TabKey = "brand" | "overview" | "shareholders" | "dividends" | "records";

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: "brand", label: "品牌", icon: <Heart className="w-4 h-4" /> },
  { key: "overview", label: "股权", icon: <PieChart className="w-4 h-4" /> },
  { key: "shareholders", label: "股东", icon: <Users className="w-4 h-4" /> },
  { key: "dividends", label: "分红", icon: <TrendingUp className="w-4 h-4" /> },
  { key: "records", label: "变更", icon: <FileText className="w-4 h-4" /> },
];

/* ========== Molynk 品牌中文内容 ========== */

const BRAND_FEATURES = [
  {
    icon: <Award className="w-5 h-5" />,
    title: "正版授权",
    desc: "官方品牌正版授权产品",
    color: "#7C3AED",
    bg: "#F5F3FF",
  },
  {
    icon: <Heart className="w-5 h-5" />,
    title: "情绪价值",
    desc: "全新竞争优势",
    color: "#EC4899",
    bg: "#FDF2F8",
  },
  {
    icon: <Leaf className="w-5 h-5" />,
    title: "可持续材料",
    desc: "共建绿色未来",
    color: "#10B981",
    bg: "#ECFDF5",
  },
  {
    icon: <Globe className="w-5 h-5" />,
    title: "全球认证",
    desc: "全球通行证",
    color: "#3B82F6",
    bg: "#EFF6FF",
  },
];

const BRAND_MILESTONES = [
  { year: "2024年11月", event: "MOLYNK 品牌正式注册" },
  { year: "2024年10月", event: "在上海国际玩具展推出首条产品线" },
  { year: "2025年4月", event: "在北京西单大悦城开设首家快闪店，引发全国各行业及投资机构的密切关注" },
  { year: "2025年7月", event: "在上海南京东路479号4楼开设自营门店 Molynk Haus，线上浏览量突破百万" },
  { year: "2025年10月", event: "启动全球布局，进入美国、西班牙、日本等国家市场" },
];

const POPULAR_PRODUCTS = [
  { name: "恐龙面包 2", series: "侏罗纪解压系列" },
  { name: "星梦序曲：十二星座系列", series: "星梦系列" },
  { name: "星梦系列", series: "经典系列" },
  { name: "如意咬咬蛋糕", series: "甜品系列" },
];

const SERVICES = [
  {
    num: "01",
    title: "品牌共创",
    desc: "欢迎所有IP、各大品牌前来咨询与共创合作",
    icon: <Handshake className="w-5 h-5" />,
  },
  {
    num: "02",
    title: "全渠道合作",
    desc: "欢迎国内外渠道商、服务商、分销商及媒体合作",
    icon: <Store className="w-5 h-5" />,
  },
  {
    num: "03",
    title: "定制服务",
    desc: "适用于礼品、企业福利等场景，提供OEM定制服务",
    icon: <Wrench className="w-5 h-5" />,
  },
];

const NEWS_LIST = [
  { title: "上海展会 | Molynk 软蛋糕艺术：一场粉色浪漫闪击", tag: "展会" },
  { title: "Molynk 捏捏乐突破新领域，闪亮登场神户 OIOI", tag: "海外" },
  { title: "Molynk 奇趣捏捏马戏团 | 只为等你", tag: "新品" },
  { title: "莫尼熊在南京东路等你", tag: "门店" },
];

const OFFICES = [
  {
    city: "上海总部",
    company: "上海莫尼莫尼文化创意有限公司",
    companyEn: "MOLYNK (SHANGHAI) CULTURE CREATIVE CO., LTD.",
    address: "上海市闵行区吴中路1366号401",
    flag: "🇨🇳",
  },
  {
    city: "日本 · 神户",
    company: "",
    companyEn: "HEATH COURT",
    address: "ROOM 201, 9-21 HANAKUMA-CHO, CHUO-KU, KOBE, HYOGO 650-0013",
    flag: "🇯🇵",
  },
  {
    city: "美国 · 洛杉矶",
    company: "",
    companyEn: "XAVVI HOLDING INC.",
    address: "801S FIGUEROA ST FLOOR 5, LOS ANGELES, CA 90017",
    flag: "🇺🇸",
  },
  {
    city: "西班牙 · 马德里",
    company: "",
    companyEn: "M STAR TECH MEDIA SL.",
    address: "CALLE DE CALERUEGA 431C, 28033 MADRID",
    flag: "🇪🇸",
  },
];

/* ========== 组件 ========== */

export default function AiCompanyWorkspace() {
  const [, params] = useRoute("/ledger/:id/ai-company/:companyId");
  const [, setLocation] = useLocation();
  const ledgerId = Number(params?.id);

  const [activeTab, setActiveTab] = useState<TabKey>("brand");
  const [expandedOffice, setExpandedOffice] = useState<number | null>(null);

  const userRole = "owner";
  const companyName = "Molynk 莫尼莫尼";

  const isOwner = userRole === "owner";
  const isAdmin = userRole === "admin";
  const canManage = isOwner || isAdmin;

  const handleBack = () => {
    setLocation(`/ledger/${ledgerId}`);
  };

  return (
    <div className="flex flex-col min-h-screen" style={{ backgroundColor: "#F5F7FF" }}>
      {/* 顶部渐变头部 */}
      <div
        className="px-4 pt-4 pb-6"
        style={{
          background: "linear-gradient(135deg, #7C3AED 0%, #A78BFA 100%)",
          color: "#FFFFFF",
        }}
      >
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={handleBack}
            className="p-1.5 rounded-full"
            style={{ backgroundColor: "rgba(255,255,255,0.2)" }}
          >
            <ArrowLeft className="w-4 h-4 text-white" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold text-white truncate">{companyName}</h1>
            <p className="text-xs text-white/70 mt-0.5">用温柔拥抱世界 · Love the world with tenderness</p>
          </div>
        </div>

        {/* Tab 切换 */}
        <div className="flex gap-1 bg-white/10 rounded-xl p-1">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{
                backgroundColor: activeTab === tab.key ? "rgba(255,255,255,0.9)" : "transparent",
                color: activeTab === tab.key ? "#7C3AED" : "rgba(255,255,255,0.8)",
              }}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 px-4 pb-20 -mt-2">
        {/* ==================== 品牌介绍 Tab ==================== */}
        {activeTab === "brand" && (
          <div className="space-y-3 pt-4">
            {/* Banner 标语 */}
            <div
              className="rounded-2xl p-5 shadow-sm text-center"
              style={{
                background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
                color: "#FFFFFF",
              }}
            >
              <p className="text-lg font-bold tracking-wide" style={{ color: "#A78BFA" }}>
                STRESSED? GO PREHISTORIC!
              </p>
              <p className="text-sm mt-1 text-white/80">压力大？回到侏罗纪！</p>
              <p className="text-xs mt-2 text-white/50">口袋大小的侏罗纪解压神器</p>
            </div>

            {/* 四大特色 */}
            <div className="grid grid-cols-2 gap-2">
              {BRAND_FEATURES.map((f, i) => (
                <div
                  key={i}
                  className="rounded-xl p-3 shadow-sm"
                  style={{ backgroundColor: f.bg }}
                >
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center mb-2"
                    style={{ backgroundColor: f.color + "20", color: f.color }}
                  >
                    {f.icon}
                  </div>
                  <p className="text-sm font-semibold text-gray-800">{f.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{f.desc}</p>
                </div>
              ))}
            </div>

            {/* 关于 Molynk */}
            <div className="rounded-2xl p-4 shadow-sm" style={{ backgroundColor: "#FFFFFF" }}>
              <div className="flex items-center gap-2 mb-3">
                <div
                  className="w-1 h-5 rounded-full"
                  style={{ backgroundColor: "#7C3AED" }}
                />
                <span className="text-sm font-semibold text-gray-800">关于 Molynk</span>
              </div>
              <p className="text-xs text-gray-600 leading-relaxed">
                MOLYNK 品牌于2024年11月正式注册，同年10月在上海国际玩具展推出首条产品线。
                2025年4月，公司在北京西单大悦城开设首家快闪店，引发全国各行业及投资机构的密切关注。
                同年7月，公司在上海南京东路479号4楼开设自营门店 Molynk Haus，线上浏览量突破百万。
                10月，公司启动全球布局，进入美国、西班牙、日本等国家市场。
              </p>
            </div>

            {/* 品牌大事记 */}
            <div className="rounded-2xl p-4 shadow-sm" style={{ backgroundColor: "#FFFFFF" }}>
              <div className="flex items-center gap-2 mb-3">
                <div
                  className="w-1 h-5 rounded-full"
                  style={{ backgroundColor: "#7C3AED" }}
                />
                <span className="text-sm font-semibold text-gray-800">品牌大事记</span>
              </div>
              <div className="space-y-3">
                {BRAND_MILESTONES.map((m, i) => (
                  <div key={i} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div
                        className="w-2.5 h-2.5 rounded-full mt-1"
                        style={{ backgroundColor: "#7C3AED" }}
                      />
                      {i < BRAND_MILESTONES.length - 1 && (
                        <div
                          className="w-0.5 flex-1 mt-1"
                          style={{ backgroundColor: "#E9D5FF" }}
                        />
                      )}
                    </div>
                    <div className="flex-1 pb-2">
                      <p className="text-xs font-semibold" style={{ color: "#7C3AED" }}>
                        {m.year}
                      </p>
                      <p className="text-xs text-gray-600 mt-0.5">{m.event}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 热门产品 */}
            <div className="rounded-2xl p-4 shadow-sm" style={{ backgroundColor: "#FFFFFF" }}>
              <div className="flex items-center gap-2 mb-3">
                <div
                  className="w-1 h-5 rounded-full"
                  style={{ backgroundColor: "#EC4899" }}
                />
                <span className="text-sm font-semibold text-gray-800">热门产品</span>
              </div>
              <div className="space-y-2">
                {POPULAR_PRODUCTS.map((p, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-2.5 rounded-xl"
                    style={{ backgroundColor: "#FDF2F8" }}
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-800">{p.name}</p>
                      <p className="text-xs text-gray-500">{p.series}</p>
                    </div>
                    <span
                      className="text-xs px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: "#EC489920", color: "#EC4899" }}
                    >
                      热销
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* 我们的服务 */}
            <div className="rounded-2xl p-4 shadow-sm" style={{ backgroundColor: "#FFFFFF" }}>
              <div className="flex items-center gap-2 mb-3">
                <div
                  className="w-1 h-5 rounded-full"
                  style={{ backgroundColor: "#3B82F6" }}
                />
                <span className="text-sm font-semibold text-gray-800">我们的服务</span>
              </div>
              <div className="space-y-2">
                {SERVICES.map((s, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-3 p-3 rounded-xl"
                    style={{ backgroundColor: "#EFF6FF" }}
                  >
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: "#3B82F620", color: "#3B82F6" }}
                    >
                      {s.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className="text-xs font-bold"
                          style={{ color: "#3B82F6" }}
                        >
                          {s.num}
                        </span>
                        <span className="text-sm font-semibold text-gray-800">{s.title}</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">{s.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 新闻动态 */}
            <div className="rounded-2xl p-4 shadow-sm" style={{ backgroundColor: "#FFFFFF" }}>
              <div className="flex items-center gap-2 mb-3">
                <div
                  className="w-1 h-5 rounded-full"
                  style={{ backgroundColor: "#F59E0B" }}
                />
                <span className="text-sm font-semibold text-gray-800">新闻动态</span>
                <Newspaper className="w-4 h-4 text-gray-400 ml-auto" />
              </div>
              <div className="space-y-2">
                {NEWS_LIST.map((n, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 p-2.5 rounded-xl"
                    style={{ backgroundColor: "#FFFBEB" }}
                  >
                    <span
                      className="text-xs px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5"
                      style={{ backgroundColor: "#F59E0B20", color: "#D97706" }}
                    >
                      {n.tag}
                    </span>
                    <p className="text-xs text-gray-700 leading-relaxed">{n.title}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* 全球办公室 */}
            <div className="rounded-2xl p-4 shadow-sm" style={{ backgroundColor: "#FFFFFF" }}>
              <div className="flex items-center gap-2 mb-3">
                <div
                  className="w-1 h-5 rounded-full"
                  style={{ backgroundColor: "#10B981" }}
                />
                <span className="text-sm font-semibold text-gray-800">全球办公室</span>
                <MapPin className="w-4 h-4 text-gray-400 ml-auto" />
              </div>
              <div className="flex items-center gap-1 mb-3">
                <Mail className="w-3.5 h-3.5 text-gray-400" />
                <span className="text-xs text-gray-500">MolynkCN@molynk.cn</span>
              </div>
              <div className="space-y-2">
                {OFFICES.map((o, i) => (
                  <div key={i}>
                    <button
                      onClick={() => setExpandedOffice(expandedOffice === i ? null : i)}
                      className="w-full flex items-center justify-between p-2.5 rounded-xl"
                      style={{ backgroundColor: "#ECFDF5" }}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-base">{o.flag}</span>
                        <span className="text-sm font-medium text-gray-800">{o.city}</span>
                      </div>
                      {expandedOffice === i ? (
                        <ChevronUp className="w-4 h-4 text-gray-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-gray-400" />
                      )}
                    </button>
                    {expandedOffice === i && (
                      <div className="px-3 py-2 text-xs text-gray-600 space-y-1">
                        {o.company && <p className="font-medium">{o.company}</p>}
                        <p className="text-gray-400">{o.companyEn}</p>
                        <p>{o.address}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* 底部备案 */}
            <div className="text-center py-4">
              <p className="text-xs text-gray-400">沪ICP备2025131266号-2</p>
              <p className="text-xs mt-1" style={{ color: "#A78BFA" }}>
                Love the world with tenderness
              </p>
            </div>
          </div>
        )}

        {/* ==================== 股权概览 Tab ==================== */}
        {activeTab === "overview" && (
          <div className="space-y-3 pt-4">
            <div className="rounded-2xl p-4 shadow-sm" style={{ backgroundColor: "#FFFFFF" }}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-gray-700">总股本</span>
                {canManage && (
                  <button
                    className="text-xs px-3 py-1 rounded-full text-white flex items-center gap-1"
                    style={{ backgroundColor: "#7C3AED" }}
                  >
                    <Plus className="w-3 h-3" />
                    编辑
                  </button>
                )}
              </div>
              <div className="text-3xl font-bold" style={{ color: "#7C3AED" }}>
                —
              </div>
              <p className="text-xs text-gray-400 mt-1">暂无股权数据，管理员可在此录入</p>
            </div>

            <div className="rounded-2xl p-4 shadow-sm" style={{ backgroundColor: "#FFFFFF" }}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-gray-700">股权分布</span>
              </div>
              <div
                className="flex items-center justify-center rounded-xl"
                style={{ height: 160, backgroundColor: "#F5F3FF" }}
              >
                <div className="text-center">
                  <PieChart className="w-10 h-10 mx-auto mb-2" style={{ color: "#C4B5FD" }} />
                  <p className="text-xs text-gray-400">股权结构图将在录入数据后显示</p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl p-4 shadow-sm" style={{ backgroundColor: "#FFFFFF" }}>
              <span className="text-sm font-semibold text-gray-700">我的持股</span>
              <div className="mt-3 flex items-center gap-3">
                <div className="flex-1 p-3 rounded-xl" style={{ backgroundColor: "#F5F3FF" }}>
                  <p className="text-xs text-gray-500">持股比例</p>
                  <p className="text-lg font-bold mt-0.5" style={{ color: "#7C3AED" }}>
                    —%
                  </p>
                </div>
                <div className="flex-1 p-3 rounded-xl" style={{ backgroundColor: "#F5F3FF" }}>
                  <p className="text-xs text-gray-500">持股数量</p>
                  <p className="text-lg font-bold mt-0.5" style={{ color: "#7C3AED" }}>
                    —
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ==================== 股东名册 Tab ==================== */}
        {activeTab === "shareholders" && (
          <div className="space-y-3 pt-4">
            <div className="rounded-2xl p-4 shadow-sm" style={{ backgroundColor: "#FFFFFF" }}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-gray-700">股东名册</span>
                {canManage && (
                  <button
                    className="text-xs px-3 py-1 rounded-full text-white flex items-center gap-1"
                    style={{ backgroundColor: "#7C3AED" }}
                  >
                    <Plus className="w-3 h-3" />
                    添加股东
                  </button>
                )}
              </div>
              <div className="flex flex-col items-center justify-center py-8">
                <Users className="w-10 h-10 mb-2" style={{ color: "#C4B5FD" }} />
                <p className="text-sm text-gray-400">暂无股东信息</p>
                <p className="text-xs text-gray-300 mt-1">管理员可录入股东持股信息</p>
              </div>
            </div>
          </div>
        )}

        {/* ==================== 分红记录 Tab ==================== */}
        {activeTab === "dividends" && (
          <div className="space-y-3 pt-4">
            <div className="rounded-2xl p-4 shadow-sm" style={{ backgroundColor: "#FFFFFF" }}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-gray-700">分红记录</span>
                {canManage && (
                  <button
                    className="text-xs px-3 py-1 rounded-full text-white flex items-center gap-1"
                    style={{ backgroundColor: "#7C3AED" }}
                  >
                    <Plus className="w-3 h-3" />
                    新增分红
                  </button>
                )}
              </div>
              <div className="flex flex-col items-center justify-center py-8">
                <TrendingUp className="w-10 h-10 mb-2" style={{ color: "#C4B5FD" }} />
                <p className="text-sm text-gray-400">暂无分红记录</p>
                <p className="text-xs text-gray-300 mt-1">管理员可在此录入分红派发记录</p>
              </div>
            </div>
          </div>
        )}

        {/* ==================== 变更记录 Tab ==================== */}
        {activeTab === "records" && (
          <div className="space-y-3 pt-4">
            <div className="rounded-2xl p-4 shadow-sm" style={{ backgroundColor: "#FFFFFF" }}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-gray-700">股权变更记录</span>
              </div>
              <div className="flex flex-col items-center justify-center py-8">
                <FileText className="w-10 h-10 mb-2" style={{ color: "#C4B5FD" }} />
                <p className="text-sm text-gray-400">暂无变更记录</p>
                <p className="text-xs text-gray-300 mt-1">股权转让、增资等操作将记录于此</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
