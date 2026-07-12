import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  ChevronRight,
  TrendingUp,
  GitBranch,
  Users,
  Layers,
  BarChart2,
  Zap,
  Lock,
  LogOut,
  ArrowLeft,
  UserCircle,
} from "lucide-react";

const COMPANIES = [
  {
    id: "herbalife",
    name: "康宝莱",
    nameEn: "Herbalife",
    tagline: "全球营养健康直销巨头",
    subtitle: "无限宽度多层次直销",
    desc: "基于康宝莱（Herbalife）原版奖金制度，包含8级会员体系、零售利润、批发利润、皇家权益金与生产奖金的完整多层次分配模型。",
    tag: "完整引擎",
    tagBg: "bg-emerald-50",
    tagText: "text-emerald-700",
    tagBorder: "border-emerald-200",
    iconBg: "bg-emerald-500",
    btnBg: "bg-emerald-500 hover:bg-emerald-600",
    accentColor: "text-emerald-600",
    borderHover: "hover:border-emerald-300",
    stats: ["8个等级", "1980年创立"],
    features: ["8级会员体系", "4类奖金分配", "组织树图可视化", "增长模拟器"],
    href: "/herbalife",
    icon: "HB",
    type: "级差制",
    locked: false,
  },
  {
    id: "syjk",
    name: "数研金控",
    nameEn: "ShuYan FinTech",
    tagline: "新一代金融科技订阅平台",
    subtitle: "订阅制多层次分润",
    desc: "数研金控采用软件订阅制结合多层次奖金体系，探索SaaS产品在MLM模式下的可持续增长逻辑，研究订阅制与传统直销的核心差异。",
    tag: "完整引擎",
    tagBg: "bg-blue-50",
    tagText: "text-blue-700",
    tagBorder: "border-blue-200",
    iconBg: "bg-blue-500",
    btnBg: "bg-blue-500 hover:bg-blue-600",
    accentColor: "text-blue-600",
    borderHover: "hover:border-blue-300",
    stats: ["6个等级", "研究模型"],
    features: ["6级分润体系", "订阅奖金分配", "组织树图可视化", "增长模拟器"],
    href: "/syjk",
    icon: "SY",
    type: "让利制",
    locked: false,
  },
  {
    id: "amway",
    name: "安利",
    nameEn: "Amway",
    tagline: "全球营业额最大直销公司",
    subtitle: "阶梯级差制",
    desc: "经典阶梯式级差提成，个人净营业额从2,500元到125,000元对应3%-21%佣金，总拨出率≤30%（中国合规版）。",
    tag: "成熟模板",
    tagBg: "bg-red-50",
    tagText: "text-red-700",
    tagBorder: "border-red-200",
    iconBg: "bg-red-500",
    btnBg: "bg-red-500 hover:bg-red-600",
    accentColor: "text-red-600",
    borderHover: "hover:border-red-300",
    stats: ["7档阶梯", "1959年创立"],
    features: ["级差制", "≤30%拨出", "领导奖制度", "模拟计算器"],
    href: "/amway",
    icon: "AM",
    type: "级差制",
    locked: false,
  },
  {
    id: "marykay",
    name: "玫琳凯",
    nameEn: "Mary Kay",
    tagline: "美容直销领导品牌",
    subtitle: "代数制",
    desc: "督导制架构，9-11个层级，零售利润高达50%，含个人团队佣金（4-13%）和多代代数奖（1-7%）。",
    tag: "成熟模板",
    tagBg: "bg-pink-50",
    tagText: "text-pink-700",
    tagBorder: "border-pink-200",
    iconBg: "bg-pink-500",
    btnBg: "bg-pink-500 hover:bg-pink-600",
    accentColor: "text-pink-600",
    borderHover: "hover:border-pink-300",
    stats: ["9-11级", "1963年创立"],
    features: ["代数制", "零售50%", "督导架构", "模拟计算器"],
    href: "/marykay",
    icon: "MK",
    type: "代数制",
    locked: false,
  },
  {
    id: "infinitus",
    name: "无限极",
    nameEn: "Infinitus",
    tagline: "中国本土直销巨头",
    subtitle: "级差+分红制",
    desc: "李锦记集团旗下，9个职级，总拨出率约60.1%，含零售利润、级差红利、全球分红及多项专项奖金，职级可世袭。",
    tag: "成熟模板",
    tagBg: "bg-orange-50",
    tagText: "text-orange-700",
    tagBorder: "border-orange-200",
    iconBg: "bg-orange-500",
    btnBg: "bg-orange-500 hover:bg-orange-600",
    accentColor: "text-orange-600",
    borderHover: "hover:border-orange-300",
    stats: ["9级职级", "1992年创立"],
    features: ["级差制", "约60%拨出", "可世袭", "模拟计算器"],
    href: "/infinitus",
    icon: "IF",
    type: "级差制",
    locked: false,
  },
  {
    id: "sunhope",
    name: "尚赫",
    nameEn: "Sunhope",
    tagline: "天津本土直销企业",
    subtitle: "店补+分红制",
    desc: "沙龙店模式，7个级别，以培养合格节点（副理）为晋级核心，总拨出率58%，含折让差（25%）、全球分红（26%）和店补（7%）。",
    tag: "成熟模板",
    tagBg: "bg-yellow-50",
    tagText: "text-yellow-700",
    tagBorder: "border-yellow-200",
    iconBg: "bg-yellow-500",
    btnBg: "bg-yellow-500 hover:bg-yellow-600",
    accentColor: "text-yellow-600",
    borderHover: "hover:border-yellow-300",
    stats: ["7级", "1995年创立"],
    features: ["店补制", "58%拨出", "沙龙模式", "模拟计算器"],
    href: "/sunhope",
    icon: "SH",
    type: "店补制",
    locked: false,
  },
  {
    id: "babycare",
    name: "葆婴",
    nameEn: "USANA",
    tagline: "雅培旗下直销品牌",
    subtitle: "双轨对碰制",
    desc: "典型双轨制（细胞矩阵法），按左右两区小区分数对碰计算业务奖金，含直推奖（5-10%）、对等奖（15-30%）和领导奖金（全球3%）。",
    tag: "成熟模板",
    tagBg: "bg-purple-50",
    tagText: "text-purple-700",
    tagBorder: "border-purple-200",
    iconBg: "bg-purple-500",
    btnBg: "bg-purple-500 hover:bg-purple-600",
    accentColor: "text-purple-600",
    borderHover: "hover:border-purple-300",
    stats: ["双轨制", "1998年创立"],
    features: ["对碰奖", "领导分红", "细胞矩阵", "模拟计算器"],
    href: "/babycare",
    icon: "BC",
    type: "双轨制",
    locked: false,
  },
  {
    id: "tianshou",
    name: "天狮",
    nameEn: "Tiens",
    tagline: "中国本土直销集团",
    subtitle: "会员等级制",
    desc: "3个会员等级（普通/VIP/云狮），按累计消费额晋级，佣金比例14.3%-25.7%，严禁团队计酬，总拨出率≤30%。",
    tag: "成熟模板",
    tagBg: "bg-indigo-50",
    tagText: "text-indigo-700",
    tagBorder: "border-indigo-200",
    iconBg: "bg-indigo-500",
    btnBg: "bg-indigo-500 hover:bg-indigo-600",
    accentColor: "text-indigo-600",
    borderHover: "hover:border-indigo-300",
    stats: ["3级会员", "1992年创立"],
    features: ["消费晋级", "≤30%拨出", "会员等级", "模拟计算器"],
    href: "/tianshou",
    icon: "TS",
    type: "会员等级",
    locked: false,
  },
  {
    id: "nuskin",
    name: "如新",
    nameEn: "Nu Skin",
    tagline: "美容科技直销领导者",
    subtitle: "Velocity计划",
    desc: "海外版采用Velocity计划，含分享奖金、阶梯建构奖金（5-40%）和代数领导奖金（5%），中国区合规版≤30%。",
    tag: "成熟模板",
    tagBg: "bg-cyan-50",
    tagText: "text-cyan-700",
    tagBorder: "border-cyan-200",
    iconBg: "bg-cyan-500",
    btnBg: "bg-cyan-500 hover:bg-cyan-600",
    accentColor: "text-cyan-600",
    borderHover: "hover:border-cyan-300",
    stats: ["Velocity", "1984年创立"],
    features: ["5-40%建构", "代数奖", "太阳线制", "模拟计算器"],
    href: "/nuskin",
    icon: "NS",
    type: "太阳线制",
    locked: false,
  },
  {
    id: "custom",
    name: "自定义制度",
    nameEn: "Custom",
    tagline: "从零设计你的奖金制度",
    subtitle: "自由设计",
    desc: "自定义层级数量、奖金比例、晋级条件、封顶规则，并支持回测验证和漏洞检测，完成后可一键嵌入到你的商城项目。",
    tag: "即将上线",
    tagBg: "bg-amber-50",
    tagText: "text-amber-700",
    tagBorder: "border-amber-200",
    iconBg: "bg-amber-400",
    btnBg: "bg-amber-400 hover:bg-amber-500",
    accentColor: "text-amber-600",
    borderHover: "hover:border-amber-300",
    stats: ["自由层级", "回测引擎"],
    features: ["漏洞检测", "自定义规则", "回测验证", "一键嵌入"],
    href: "#",
    icon: "DIY",
    type: "自定义",
    locked: true,
  },
];

const TYPE_FILTERS = ["全部", "级差制", "代数制", "双轨制", "让利制", "太阳线制", "店补制", "会员等级"];

const FEATURE_ICONS: Record<string, React.ReactNode> = {
  "组织树图可视化": <GitBranch className="w-3.5 h-3.5" />,
  "增长模拟器": <TrendingUp className="w-3.5 h-3.5" />,
  "模拟计算器": <BarChart2 className="w-3.5 h-3.5" />,
  default: <Layers className="w-3.5 h-3.5" />,
};

function FeatureIcon({ label }: { label: string }) {
  return FEATURE_ICONS[label] || FEATURE_ICONS["default"];
}

export default function Home() {
  const [, setLocation] = useLocation();
  const [activeFilter, setActiveFilter] = useState("全部");
  const { user, isAuthenticated, logout } = useAuth();

  const filtered = activeFilter === "全部"
    ? COMPANIES
    : COMPANIES.filter((c) => c.type === activeFilter);

  const engineCount = COMPANIES.filter((c) => !c.locked && c.tag === "完整引擎").length;
  const templateCount = COMPANIES.filter((c) => !c.locked && c.tag === "成熟模板").length;
  const { data: customSchemes } = trpc.customScheme.list.useQuery(
    { page: 1, pageSize: 10, onlyMine: true },
    { enabled: isAuthenticated }
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top nav */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
              <BarChart2 className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-gray-900 text-sm">MLM 奖金制度研究平台</span>
            <span className="hidden sm:block text-xs text-gray-400 ml-1">多层次直销商业模型学习与分析系统</span>
          </div>
          <div className="flex items-center gap-2">
            {/* 返回脉动网按钮（登录后显示） */}
            {isAuthenticated && (
              <a
                href="https://www.jiangyuchen.cn"
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600 transition-colors border border-gray-200 rounded-lg px-2.5 py-1.5 hover:border-blue-300"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">返回脉动网</span>
                <span className="sm:hidden">脉动网</span>
              </a>
            )}
            {/* 用户状态 */}
            {isAuthenticated ? (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 text-xs text-gray-600">
                  <UserCircle className="w-4 h-4 text-blue-500" />
                  <span className="hidden sm:inline">{user?.name || "用户"}</span>
                </div>
                <button
                  onClick={logout}
                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-500 transition-colors"
                  title="退出登录"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setLocation("/login")}
                className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 border border-blue-200 hover:border-blue-400 rounded-lg px-3 py-1.5 transition-all"
              >
                <UserCircle className="w-3.5 h-3.5" />
                登录
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 py-10 text-center">
          <p className="text-xs text-gray-400 mb-3 tracking-widest uppercase">
            研究学习平台 · {engineCount} 套完整引擎 · {templateCount} 个成熟模板
          </p>
          <h1 className="text-4xl font-bold text-gray-900 mb-2">选择一家公司</h1>
          <h2 className="text-2xl font-semibold text-gray-500 mb-4">开始奖金制度研究</h2>
          <p className="text-sm text-gray-400 max-w-xl mx-auto leading-relaxed">
            通过真实的奖金计算引擎、可视化组织树图和增长模拟器，深入理解多层次直销的商业逻辑与资金流向。
          </p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="bg-white border-b border-gray-100 sticky top-14 z-10">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex gap-1 overflow-x-auto py-3 scrollbar-hide">
            {TYPE_FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setActiveFilter(f)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all border ${
                  activeFilter === f
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-gray-500 border-gray-200 hover:border-blue-300 hover:text-blue-600"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Company grid */}
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {filtered.map((company) => (
            <div
              key={company.id}
              onClick={() => !company.locked && setLocation(company.href)}
              className={`bg-white rounded-2xl border border-gray-200 p-5 transition-all duration-200 ${
                company.locked
                  ? "opacity-60 cursor-not-allowed"
                  : `cursor-pointer ${company.borderHover} hover:shadow-md active:scale-[0.99]`
              }`}
            >
              {/* Card header */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl ${company.iconBg} flex items-center justify-center text-xs font-bold text-white flex-shrink-0`}>
                    {company.icon}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-gray-900">{company.name}</span>
                      <span className="text-xs text-gray-400">{company.nameEn}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${company.tagBg} ${company.tagText} ${company.tagBorder}`}>
                        {company.tag}
                      </span>
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">{company.subtitle}</div>
                  </div>
                </div>
                {company.locked ? (
                  <Lock className="w-4 h-4 text-gray-300 flex-shrink-0 mt-1" />
                ) : (
                  <ChevronRight className={`w-4 h-4 flex-shrink-0 mt-1 ${company.accentColor}`} />
                )}
              </div>

              {/* Tagline */}
              <p className={`text-sm font-semibold mb-1 ${company.accentColor}`}>{company.tagline}</p>

              {/* Description */}
              <p className="text-xs text-gray-500 leading-relaxed mb-3">{company.desc}</p>

              {/* Stats badges */}
              <div className="flex gap-2 mb-3">
                {company.stats.map((s) => (
                  <span
                    key={s}
                    className={`text-[11px] px-2 py-0.5 rounded-full border font-medium ${company.tagBg} ${company.tagText} ${company.tagBorder}`}
                  >
                    {s}
                  </span>
                ))}
              </div>

              {/* Feature list */}
              <div className="grid grid-cols-2 gap-1.5 mb-4">
                {company.features.map((f) => (
                  <div key={f} className="flex items-center gap-1.5 text-xs text-gray-500">
                    <span className={company.accentColor}>
                      <FeatureIcon label={f} />
                    </span>
                    {f}
                  </div>
                ))}
              </div>

              {/* CTA button */}
              {!company.locked && (
                <button
                  className={`w-full py-2.5 rounded-xl text-white text-sm font-semibold transition-colors ${company.btnBg} flex items-center justify-center gap-2`}
                >
                  进入研究系统
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
              {company.locked && (
                <div className="w-full py-2.5 rounded-xl bg-gray-100 text-gray-400 text-sm font-medium text-center flex items-center justify-center gap-2">
                  <Zap className="w-4 h-4" />
                  开发中，敬请期待
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Custom scheme CTA */}
        <div className="mt-8 bg-gradient-to-r from-blue-600 to-blue-700 rounded-2xl p-6 text-white">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-bold bg-white/20 px-2 py-1 rounded">DIY</span>
                <span className="font-bold text-lg">设计你自己的奖金制度</span>
              </div>
              <p className="text-blue-100 text-sm leading-relaxed mb-4">
                通过可视化向导流程，一步一步配置层级、奖金比例、晋级条件和封顶规则。完成后可与内置制度对比分析。
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setLocation("/custom/new")}
                  className="px-5 py-2.5 bg-white text-blue-700 rounded-xl text-sm font-bold hover:bg-blue-50 transition-colors"
                >
                  开始设计
                </button>
                <button
                  onClick={() => setLocation("/compare")}
                  className="px-5 py-2.5 bg-blue-500 text-white rounded-xl text-sm font-semibold hover:bg-blue-400 transition-colors"
                >
                  对比分析
                </button>
              </div>
            </div>
            <div className="hidden sm:flex flex-col gap-2 text-right text-xs text-blue-200">
              <div>6步引导向导</div>
              <div>实时合规检查</div>
              <div>可保存对比</div>
            </div>
          </div>
        </div>

        {/* User custom schemes list - 仅登录用户可见 */}
        {isAuthenticated && customSchemes && customSchemes.length > 0 && (
          <div className="mt-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-gray-900">自建奖金制度</h3>
              <button onClick={() => setLocation("/compare")} className="text-xs text-blue-600 hover:underline">对比分析</button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {customSchemes.map((scheme) => (
                <div
                  key={scheme.id}
                  onClick={() => setLocation("/custom/" + scheme.id)}
                  className="bg-white border border-gray-200 rounded-xl p-4 cursor-pointer hover:border-blue-300 hover:shadow-sm transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
                      style={{ backgroundColor: scheme.color + "20" }}
                    >
                      {scheme.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm text-gray-900 truncate">{scheme.name}</div>
                      <div className="text-xs text-gray-400">{scheme.industry} · {scheme.schemeType === "staircase" ? "阶梯级差制" : scheme.schemeType === "generation" ? "代数制" : scheme.schemeType === "binary" ? "双轨对碰制" : scheme.schemeType === "subscription" ? "让利制" : scheme.schemeType}</div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer note */}
        <p className="text-center text-xs text-gray-400 mt-8 pb-4">
          本平台所有数据均为模拟数据，仅供学习研究多层次直销商业逻辑使用，不构成任何商业建议。
        </p>
      </div>
    </div>
  );
}
