/**
 * QibanHome - 企伴首页
 *
 * 企伴（qiban）：企业服务与商业伙伴撮合平台
 * 路由：/qiban
 *
 * 规范：
 * - 移动端优先（max-width 480px）
 * - 使用 lucide-react 图标，蓝色线条风格
 * - 严禁 Emoji 作为界面元素
 * - 通过 tRPC 调用真实接口，严禁 Mock 数据
 */
import { useLocation } from "wouter";
import { ArrowLeft, Building2, Users, FileText, Handshake, TrendingUp, Search } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

export default function QibanHome() {
  const [, navigate] = useLocation();
  const { user } = useAuth();

  // 获取企伴统计数据
  const { data: stats } = trpc.qiban.getStats.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  const menuItems = [
    {
      icon: Building2,
      label: "企业档案",
      desc: "企业信息管理",
      path: "/qiban/companies",
      color: "bg-blue-50 text-blue-600",
    },
    {
      icon: Handshake,
      label: "合作对接",
      desc: "商业合作撮合",
      path: "/qiban/partnerships",
      color: "bg-green-50 text-green-600",
    },
    {
      icon: FileText,
      label: "合同管理",
      desc: "合同签署存档",
      path: "/qiban/contracts",
      color: "bg-purple-50 text-purple-600",
    },
    {
      icon: Users,
      label: "人脉资源",
      desc: "企业人脉网络",
      path: "/qiban/contacts",
      color: "bg-orange-50 text-orange-600",
    },
    {
      icon: TrendingUp,
      label: "业务追踪",
      desc: "项目进展跟踪",
      path: "/qiban/projects",
      color: "bg-red-50 text-red-600",
    },
    {
      icon: Search,
      label: "企业查询",
      desc: "工商信息查询",
      path: "/qiban/search",
      color: "bg-cyan-50 text-cyan-600",
    },
  ];

  return (
    <div
      className="min-h-screen bg-[#FAFAFA]"
      style={{ maxWidth: 480, margin: "0 auto" }}
    >
      {/* 顶部导航栏 */}
      <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-gray-100">
        <div className="flex items-center gap-3 px-4 h-14">
          <button
            onClick={() => navigate("/")}
            className="p-1.5 -ml-1.5 rounded-full active:scale-95 transition-transform"
            aria-label="返回"
          >
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </button>
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-blue-600" />
            <h1 className="text-base font-semibold text-gray-900">企伴</h1>
          </div>
          <span className="ml-auto text-xs text-gray-400">
            {user?.name || user?.username || ""}
          </span>
        </div>
      </header>

      <main className="px-4 pt-4 pb-20 space-y-4">
        {/* 欢迎横幅 */}
        <div
          className="rounded-2xl overflow-hidden relative"
          style={{
            background: "linear-gradient(135deg, #1a56db 0%, #0e3a8a 100%)",
            minHeight: 100,
          }}
        >
          <div className="px-4 py-4">
            <p className="text-white/70 text-xs mb-1">企业服务平台</p>
            <h2 className="text-white text-lg font-bold leading-tight">
              企伴 · 让合作更简单
            </h2>
            <p className="text-white/60 text-xs mt-1">
              企业档案 · 合作对接 · 合同管理
            </p>
          </div>
          {/* 装饰圆 */}
          <div
            className="absolute -right-6 -top-6 w-28 h-28 rounded-full opacity-10"
            style={{ background: "#fff" }}
          />
          <div
            className="absolute -right-2 bottom-2 w-16 h-16 rounded-full opacity-10"
            style={{ background: "#fff" }}
          />
        </div>

        {/* 统计数据 */}
        {stats && (
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "企业数", value: stats.companyCount ?? 0 },
              { label: "合作项目", value: stats.partnershipCount ?? 0 },
              { label: "合同数", value: stats.contractCount ?? 0 },
            ].map((item) => (
              <div
                key={item.label}
                className="bg-white rounded-xl p-3 text-center shadow-sm"
              >
                <p className="text-xl font-bold text-gray-900">{item.value}</p>
                <p className="text-[11px] text-gray-500 mt-0.5">{item.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* 功能入口 */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 pt-3 pb-1">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              功能入口
            </span>
          </div>
          <div className="grid grid-cols-3 gap-0 divide-x divide-y divide-gray-100">
            {menuItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.label}
                  onClick={() => navigate(item.path)}
                  className="flex flex-col items-center justify-center py-4 px-2 active:bg-gray-50 transition-colors"
                >
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center mb-1.5 ${item.color}`}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className="text-[12px] font-medium text-gray-800 leading-tight">
                    {item.label}
                  </span>
                  <span className="text-[10px] text-gray-400 leading-tight mt-0.5">
                    {item.desc}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 近期动态（占位） */}
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-gray-900">近期动态</span>
          </div>
          <div className="text-center py-6 text-gray-400">
            <Building2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-xs">暂无动态，开始添加企业档案</p>
          </div>
        </div>
      </main>
    </div>
  );
}
