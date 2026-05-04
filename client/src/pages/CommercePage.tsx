import { useState } from "react";
import { useLocation } from "wouter";
import { ChevronLeft, Store, TrendingUp, BarChart2, Brain } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell, LineChart, Line } from "recharts";

// ── 数据 ──────────────────────────────────────────────────────────────────────

const TABS = [
  { id: "food", label: "餐饮", icon: "" },
  { id: "retail", label: "零售", icon: "" },
  { id: "beauty", label: "美容", icon: "" },
  { id: "health", label: "医药健身", icon: "" },
  { id: "hotel", label: "酒店", icon: "" },
  { id: "service", label: "其他服务", icon: "" },
  { id: "ai", label: "AI预测", icon: "" },
];

// 餐饮连锁
const foodBrands = [
  { name: "蜜雪冰城", stores: 45000, type: "茶饮", listed: false },
  { name: "华莱士", stores: 20068, type: "快餐", listed: false },
  { name: "瑞幸咖啡", stores: 22340, type: "咖啡", listed: true },
  { name: "正新鸡排", stores: 10800, type: "小吃", listed: false },
  { name: "肯德基", stores: 10000, type: "快餐", listed: true },
  { name: "星巴克", stores: 8000, type: "咖啡", listed: true },
  { name: "塔斯汀", stores: 7254, type: "快餐", listed: false },
  { name: "茶百道", stores: 8395, type: "茶饮", listed: true },
  { name: "喜茶", stores: 4610, type: "茶饮", listed: false },
  { name: "麦当劳", stores: 6820, type: "快餐", listed: true },
  { name: "必胜客", stores: 3769, type: "快餐", listed: true },
  { name: "海底捞", stores: 1368, type: "火锅", listed: true },
  { name: "老乡鸡", stores: 1404, type: "正餐", listed: false },
  { name: "德克士", stores: 2471, type: "快餐", listed: false },
  { name: "西贝莜面村", stores: 400, type: "正餐", listed: false },
];

const foodTrend = [
  { year: "2020", total: 90 },
  { year: "2021", total: 105 },
  { year: "2022", total: 118 },
  { year: "2023", total: 138 },
  { year: "2024", total: 153 },
];

const foodTypes = [
  { name: "茶饮/咖啡", value: 58000, color: "#f97316" },
  { name: "快餐", value: 53000, color: "#ef4444" },
  { name: "小吃/其他", value: 25000, color: "#a855f7" },
  { name: "正餐/火锅", value: 17000, color: "#22c55e" },
];

// 零售连锁
const retailBrands = [
  { name: "美宜佳", stores: 37943, type: "便利店" },
  { name: "易捷(中石化)", stores: 28635, type: "便利店" },
  { name: "昆仑好客(中石油)", stores: 19700, type: "便利店" },
  { name: "天福便利", stores: 7521, type: "便利店" },
  { name: "罗森", stores: 6652, type: "便利店" },
  { name: "7-Eleven", stores: 4639, type: "便利店" },
  { name: "全家FamilyMart", stores: 3032, type: "便利店" },
  { name: "联华超市", stores: 3152, type: "超市" },
  { name: "华润万家", stores: 2200, type: "超市" },
  { name: "物美超市", stores: 918, type: "超市" },
  { name: "永辉超市", stores: 775, type: "超市" },
  { name: "大润发", stores: 505, type: "大卖场" },
  { name: "沃尔玛", stores: 334, type: "大卖场" },
  { name: "盒马鲜生", stores: 420, type: "新零售" },
  { name: "名创优品", stores: 4386, type: "品质零售" },
];

// 美容美发
const beautyBrands = [
  { name: "克丽缇娜", stores: 5000, type: "美容" },
  { name: "屈臣氏", stores: 3465, type: "个护" },
  { name: "丝域养发", stores: 2503, type: "养发" },
  { name: "章光101", stores: 2000, type: "养发" },
  { name: "永琪美发", stores: 1000, type: "美发" },
  { name: "名创优品(美妆)", stores: 800, type: "美妆" },
  { name: "丝芙兰", stores: 350, type: "美妆" },
  { name: "雍禾植发", stores: 63, type: "植发" },
  { name: "碧莲盛植发", stores: 43, type: "植发" },
  { name: "大麦微针植发", stores: 40, type: "植发" },
];

// 医药健身
const healthBrands = [
  { name: "大参林", stores: 17758, type: "药店" },
  { name: "老百姓大药房", stores: 15277, type: "药店" },
  { name: "益丰药房", stores: 14943, type: "药店" },
  { name: "高济医疗", stores: 15000, type: "药店" },
  { name: "一心堂", stores: 10255, type: "药店" },
  { name: "国大药房", stores: 9569, type: "药店" },
  { name: "海王星辰", stores: 5000, type: "药店" },
  { name: "漱玉平民", stores: 2000, type: "药店" },
  { name: "乐刻运动", stores: 2000, type: "健身" },
  { name: "超级猩猩", stores: 300, type: "健身" },
  { name: "KEEPLAND", stores: 200, type: "健身" },
  { name: "古德菲力", stores: 100, type: "健身" },
];

// 酒店连锁
const hotelBrands = [
  { name: "锦江国际", stores: 13400, type: "本土" },
  { name: "华住集团", stores: 11000, type: "本土" },
  { name: "首旅如家", stores: 7000, type: "本土" },
  { name: "格林酒店", stores: 2300, type: "本土" },
  { name: "温德姆", stores: 1600, type: "外资" },
  { name: "东呈集团", stores: 1600, type: "本土" },
  { name: "亚朵集团", stores: 1200, type: "本土" },
  { name: "洲际酒店", stores: 500, type: "外资" },
  { name: "万豪国际", stores: 285, type: "外资" },
  { name: "希尔顿", stores: 180, type: "外资" },
];

// 其他服务
const serviceBrands = [
  { name: "途虎养车", stores: 6874, type: "汽车后市场" },
  { name: "派多格宠物", stores: 2000, type: "宠物" },
  { name: "新东方", stores: 1025, type: "教育" },
  { name: "学而思", stores: 400, type: "教育" },
  { name: "学大教育", stores: 300, type: "教育" },
  { name: "高途", stores: 60, type: "教育" },
];

// AI预测数据（各行业门店总量预测）
const aiPrediction = [
  { year: "2024", food: 153, retail: 321, beauty: 50, health: 68, hotel: 9.3, service: 35 },
  { year: "2025", food: 162, retail: 328, beauty: 53, health: 71, hotel: 9.8, service: 37 },
  { year: "2026", food: 170, retail: 332, beauty: 55, health: 73, hotel: 10.2, service: 39 },
  { year: "2027", food: 176, retail: 334, beauty: 57, health: 74, hotel: 10.5, service: 41 },
  { year: "2028", food: 180, retail: 335, beauty: 58, health: 75, hotel: 10.7, service: 42 },
  { year: "2030", food: 185, retail: 336, beauty: 60, health: 76, hotel: 11.0, service: 44 },
];

// ── 组件 ──────────────────────────────────────────────────────────────────────

const COLORS = ["#3b82f6", "#ef4444", "#22c55e", "#f97316", "#a855f7", "#06b6d4", "#f59e0b", "#ec4899", "#84cc16", "#14b8a6"];

function BrandBarList({ brands, maxStores, color }: { brands: { name: string; stores: number; type: string }[]; maxStores: number; color: string }) {
  const sorted = [...brands].sort((a, b) => b.stores - a.stores);
  return (
    <div className="space-y-2">
      {sorted.map((b, i) => {
        const pct = Math.round((b.stores / maxStores) * 100);
        return (
          <div key={i} className="flex items-center gap-2">
            <span className="text-xs text-gray-500 w-4 text-right">{i + 1}</span>
            <span className="text-xs font-medium text-gray-800 w-20 shrink-0 truncate">{b.name}</span>
            <div className="flex-1 relative h-5 bg-gray-100 rounded-full overflow-visible">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${pct}%`, background: color }}
              />
            </div>
            <span className="text-xs font-bold text-gray-700 w-16 text-right shrink-0">
              {b.stores >= 10000 ? `${(b.stores / 10000).toFixed(1)}万` : b.stores.toLocaleString()}
            </span>
            <span className="text-xs text-gray-400 w-14 shrink-0">{b.type}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── 主页面 ────────────────────────────────────────────────────────────────────

export default function CommercePage() {
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState("food");
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 800);
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-8 max-w-md mx-auto">
      {/* 顶部导航 */}
      <div className="sticky top-0 z-20 bg-white border-b border-gray-100 flex items-center justify-between px-4 py-3">
        <button onClick={() => navigate("/smart-finance")} className="flex items-center gap-1 text-gray-600">
          <ChevronLeft className="w-5 h-5" />
          <span className="text-sm">返回</span>
        </button>
        <h1 className="text-base font-bold text-gray-800">商业×AI</h1>
        <button
          onClick={handleRefresh}
          className={`text-sm text-blue-500 font-medium transition-opacity ${refreshing ? "opacity-50" : ""}`}
        >
          {refreshing ? "刷新中..." : "刷新"}
        </button>
      </div>

      {/* 概览卡片 */}
      <div className="mx-4 mt-4 bg-gradient-to-r from-violet-600 to-indigo-600 rounded-2xl p-4 text-white">
        <div className="flex items-center gap-2 mb-3">
          <Store className="w-5 h-5 opacity-80" />
          <span className="text-sm font-medium opacity-90">全国主要连锁品牌概览（2024）</span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center">
            <div className="text-xl font-bold">153万+</div>
            <div className="text-xs opacity-75 mt-0.5">餐饮门店</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-bold">321万+</div>
            <div className="text-xs opacity-75 mt-0.5">零售门店</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-bold">68万+</div>
            <div className="text-xs opacity-75 mt-0.5">药店门店</div>
          </div>
        </div>
      </div>

      {/* Tab 导航 */}
      <div className="mx-4 mt-4 flex gap-1 overflow-x-auto scrollbar-hide">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
              activeTab === tab.id
                ? "bg-violet-600 text-white shadow-sm"
                : "bg-white text-gray-600 border border-gray-200"
            }`}
          >
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* 内容区 */}
      <div className="mx-4 mt-4 space-y-4">

        {/* ── 餐饮 ── */}
        {activeTab === "food" && (
          <>
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <BarChart2 className="w-4 h-4 text-orange-500" />
                <span className="text-sm font-bold text-gray-800">餐饮连锁门店数量排行（2024）</span>
              </div>
              <BrandBarList brands={foodBrands} maxStores={45000} color="#f97316" />
            </div>

            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-4 h-4 text-orange-500" />
                <span className="text-sm font-bold text-gray-800">餐饮连锁总门店数趋势（万家）</span>
              </div>
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={foodTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} domain={[80, 160]} unit="万" />
                  <Tooltip formatter={(v: number) => [`${v}万家`, "总门店数"]} />
                  <Line type="monotone" dataKey="total" stroke="#f97316" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-sm font-bold text-gray-800">餐饮品类分布</span>
              </div>
              <div className="flex items-center gap-4">
                <PieChart width={120} height={120}>
                  <Pie data={foodTypes} cx={55} cy={55} innerRadius={30} outerRadius={55} dataKey="value" paddingAngle={2}>
                    {foodTypes.map((entry, index) => (
                      <Cell key={index} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
                <div className="flex-1 space-y-2">
                  {foodTypes.map((t, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ background: t.color }} />
                        <span className="text-xs text-gray-600">{t.name}</span>
                      </div>
                      <span className="text-xs font-bold text-gray-800">{(t.value / 10000).toFixed(1)}万</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-orange-50 rounded-2xl p-4 border border-orange-100">
              <div className="text-xs font-bold text-orange-800 mb-2">行业洞察</div>
              <div className="text-xs text-orange-700 leading-relaxed space-y-1">
                <p>• 蜜雪冰城以 <strong>4.5万家</strong>门店位居全国餐饮连锁第一，超越所有快餐品牌</p>
                <p>• 瑞幸咖啡（2.23万）已超越星巴克（0.8万），成为中国最大咖啡连锁</p>
                <p>• 华莱士（2万+）是中国最大本土快餐品牌，门店数是麦当劳的3倍</p>
                <p>• 新茶饮赛道竞争激烈，塔斯汀、茶百道快速扩张中</p>
              </div>
            </div>
          </>
        )}

        {/* ── 零售 ── */}
        {activeTab === "retail" && (
          <>
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <BarChart2 className="w-4 h-4 text-blue-500" />
                <span className="text-sm font-bold text-gray-800">零售连锁门店数量排行（2024）</span>
              </div>
              <BrandBarList brands={retailBrands} maxStores={37943} color="#3b82f6" />
            </div>

            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-bold text-gray-800">便利店 vs 超市 门店规模对比</span>
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={[
                  { name: "美宜佳", stores: 37943 },
                  { name: "易捷", stores: 28635 },
                  { name: "昆仑好客", stores: 19700 },
                  { name: "天福", stores: 7521 },
                  { name: "罗森", stores: 6652 },
                  { name: "名创优品", stores: 4386 },
                  { name: "7-Eleven", stores: 4639 },
                  { name: "联华超市", stores: 3152 },
                ]} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => v >= 10000 ? `${(v/10000).toFixed(0)}万` : v.toString()} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={55} />
                  <Tooltip formatter={(v: number) => [v.toLocaleString() + "家", "门店数"]} />
                  <Bar dataKey="stores" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-blue-50 rounded-2xl p-4 border border-blue-100">
              <div className="text-xs font-bold text-blue-800 mb-2">行业洞察</div>
              <div className="text-xs text-blue-700 leading-relaxed space-y-1">
                <p>• 便利店行业：美宜佳（3.8万）是7-Eleven（4639）的8倍，本土品牌占绝对优势</p>
                <p>• 两桶油旗下便利店（易捷+昆仑好客）合计近5万家，依托加油站优势</p>
                <p>• 大卖场持续萎缩，家乐福已退出中国，沃尔玛关闭多家门店</p>
                <p>• 折扣超市、会员店（山姆、Costco）逆势增长，成为新增长极</p>
              </div>
            </div>
          </>
        )}

        {/* ── 美容 ── */}
        {activeTab === "beauty" && (
          <>
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <BarChart2 className="w-4 h-4 text-pink-500" />
                <span className="text-sm font-bold text-gray-800">美容美发连锁门店排行（2024）</span>
              </div>
              <BrandBarList brands={beautyBrands} maxStores={5000} color="#ec4899" />
            </div>

            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="text-sm font-bold text-gray-800 mb-3">行业规模概览</div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "全国美容美发门店", value: "约50万家", sub: "含个体小店" },
                  { label: "连锁化率", value: "约15%", sub: "仍以个体为主" },
                  { label: "植发连锁", value: "约146家", sub: "雍禾+碧莲盛+大麦" },
                  { label: "年市场规模", value: "约5000亿", sub: "2024年估算" },
                ].map((item, i) => (
                  <div key={i} className="bg-pink-50 rounded-xl p-3">
                    <div className="text-xs text-pink-600 mb-1">{item.label}</div>
                    <div className="text-base font-bold text-pink-800">{item.value}</div>
                    <div className="text-xs text-pink-400">{item.sub}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-pink-50 rounded-2xl p-4 border border-pink-100">
              <div className="text-xs font-bold text-pink-800 mb-2">行业洞察</div>
              <div className="text-xs text-pink-700 leading-relaxed space-y-1">
                <p>• 美容行业连锁化率仅15%，大量门店仍为个体经营，连锁化空间巨大</p>
                <p>• 植发赛道快速崛起，雍禾、碧莲盛、大麦三强竞争，年增速超30%</p>
                <p>• 屈臣氏门店数下降（高峰期4000+），受电商冲击明显</p>
                <p>• 养发护发赛道（丝域2500+）成为新蓝海，客单价高、复购率强</p>
              </div>
            </div>
          </>
        )}

        {/* ── 医药健身 ── */}
        {activeTab === "health" && (
          <>
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <BarChart2 className="w-4 h-4 text-green-500" />
                <span className="text-sm font-bold text-gray-800">药店连锁门店排行（2024）</span>
              </div>
              <BrandBarList brands={healthBrands.filter(b => b.type === "药店")} maxStores={17758} color="#22c55e" />
            </div>

            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-sm font-bold text-gray-800">健身连锁门店排行（2024）</span>
              </div>
              <BrandBarList brands={healthBrands.filter(b => b.type === "健身")} maxStores={2000} color="#06b6d4" />
            </div>

            <div className="bg-green-50 rounded-2xl p-4 border border-green-100">
              <div className="text-xs font-bold text-green-800 mb-2">行业洞察</div>
              <div className="text-xs text-green-700 leading-relaxed space-y-1">
                <p>• 全国药店总数约68万家，四大连锁（大参林/老百姓/益丰/一心堂）合计约6万家</p>
                <p>• 药店行业趋于饱和，头部企业通过并购扩张，中小药店生存压力大</p>
                <p>• 健身行业小型化趋势明显，乐刻运动（2000家）模式跑通，扩张加速</p>
                <p>• 传统大型健身房（威尔士、一兆韦德）持续关店，小型精品健身崛起</p>
              </div>
            </div>
          </>
        )}

        {/* ── 酒店 ── */}
        {activeTab === "hotel" && (
          <>
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <BarChart2 className="w-4 h-4 text-amber-500" />
                <span className="text-sm font-bold text-gray-800">酒店连锁集团门店排行（2024）</span>
              </div>
              <BrandBarList brands={hotelBrands} maxStores={13400} color="#f59e0b" />
            </div>

            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="text-sm font-bold text-gray-800 mb-3">本土 vs 外资 规模对比</div>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={[
                  { name: "本土品牌合计", stores: 36600 },
                  { name: "外资品牌合计", stores: 2565 },
                ]}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => [v.toLocaleString() + "家", "门店数"]} />
                  <Bar dataKey="stores" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-amber-50 rounded-2xl p-4 border border-amber-100">
              <div className="text-xs font-bold text-amber-800 mb-2">行业洞察</div>
              <div className="text-xs text-amber-700 leading-relaxed space-y-1">
                <p>• 本土酒店集团（锦江+华住+首旅）合计超3万家，占绝对主导</p>
                <p>• 锦江国际（1.34万）是全球最大酒店集团之一，旗下含维也纳、丽笙等品牌</p>
                <p>• 亚朵（1200家）专注中高端，人均消费高，口碑好，持续扩张</p>
                <p>• 外资品牌（希尔顿、万豪）在中国门店数量有限，主攻高端市场</p>
              </div>
            </div>
          </>
        )}

        {/* ── 其他服务 ── */}
        {activeTab === "service" && (
          <>
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <BarChart2 className="w-4 h-4 text-purple-500" />
                <span className="text-sm font-bold text-gray-800">其他服务连锁门店排行（2024）</span>
              </div>
              <BrandBarList brands={serviceBrands} maxStores={6874} color="#a855f7" />
            </div>

            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="text-sm font-bold text-gray-800 mb-3">各行业连锁门店总量对比（万家）</div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={[
                  { name: "零售便利", stores: 321 },
                  { name: "药店", stores: 68 },
                  { name: "餐饮", stores: 153 },
                  { name: "美容", stores: 50 },
                  { name: "教育服务", stores: 35 },
                  { name: "酒店", stores: 9.3 },
                  { name: "健身", stores: 12 },
                ]} layout="vertical" margin={{ left: 15, right: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis type="number" tick={{ fontSize: 10 }} unit="万" />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={55} />
                  <Tooltip formatter={(v: number) => [`${v}万家`, "门店数"]} />
                  <Bar dataKey="stores" radius={[0, 4, 4, 0]}>
                    {["#3b82f6", "#22c55e", "#f97316", "#ec4899", "#a855f7", "#f59e0b", "#06b6d4"].map((color, i) => (
                      <Cell key={i} fill={color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-purple-50 rounded-2xl p-4 border border-purple-100">
              <div className="text-xs font-bold text-purple-800 mb-2">行业洞察</div>
              <div className="text-xs text-purple-700 leading-relaxed space-y-1">
                <p>• 途虎养车（6874家）是汽车后市场最大连锁，已上市，持续扩张</p>
                <p>• 宠物行业连锁化加速，派多格（2000家）领跑，行业规模超3000亿</p>
                <p>• 教育行业双减后大幅收缩，新东方转型素质教育，学而思门店减少</p>
                <p>• 洗车、家政等生活服务连锁化仍处早期，市场分散，整合机会大</p>
              </div>
            </div>
          </>
        )}

        {/* ── AI预测 ── */}
        {activeTab === "ai" && (
          <>
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <Brain className="w-4 h-4 text-violet-500" />
                <span className="text-sm font-bold text-gray-800">主要行业门店数量预测（万家）</span>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={aiPrediction}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} unit="万" />
                  <Tooltip formatter={(v: number) => [`${v}万家`]} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Line type="monotone" dataKey="food" name="餐饮" stroke="#f97316" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="retail" name="零售" stroke="#3b82f6" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="health" name="药店" stroke="#22c55e" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="beauty" name="美容" stroke="#ec4899" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="text-sm font-bold text-gray-800 mb-3">2026年各行业AI预测门店数</div>
              <div className="space-y-2">
                {[
                  { name: "零售便利店", pred: "332万家", growth: "+3.4%", color: "#3b82f6", trend: "↗" },
                  { name: "餐饮连锁", pred: "170万家", growth: "+11.1%", color: "#f97316", trend: "↗↗" },
                  { name: "药店连锁", pred: "73万家", growth: "+7.4%", color: "#22c55e", trend: "↗" },
                  { name: "美容美发", pred: "55万家", growth: "+10%", color: "#ec4899", trend: "↗" },
                  { name: "酒店连锁", pred: "10.2万家", growth: "+9.7%", color: "#f59e0b", trend: "↗" },
                  { name: "教育服务", pred: "39万家", growth: "+11.4%", color: "#a855f7", trend: "↗" },
                ].map((item, i) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ background: item.color }} />
                      <span className="text-sm text-gray-700">{item.name}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold text-gray-800">{item.pred}</span>
                      <span className="text-xs text-green-600 font-medium">{item.growth}</span>
                      <span className="text-xs text-green-500">{item.trend}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-violet-50 rounded-2xl p-4 border border-violet-100">
              <div className="text-xs font-bold text-violet-800 mb-2">AI核心判断</div>
              <div className="text-xs text-violet-700 leading-relaxed space-y-2">
                <p><strong>高增长赛道：</strong>新茶饮（蜜雪冰城模式下沉）、咖啡（瑞幸持续扩张）、小型健身（乐刻）、宠物服务</p>
                <p><strong>稳健增长：</strong>药店（老龄化驱动）、中端酒店（商务出行恢复）、汽车后市场</p>
                <p><strong>承压赛道：</strong>大卖场（持续关店）、传统美发（个体为主难连锁化）、K12教育（政策限制）</p>
                <p><strong>投资机会：</strong>下沉市场连锁化（三四线城市渗透率低）、宠物/养老/健康管理等新赛道</p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
