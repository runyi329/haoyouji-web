/**
 * AiCompanyWorkspace.tsx - AI 型定制账本（共享公司股权管理）工作台
 * 股东/管理员查看公司股权结构、分红记录、股权变更等
 */
import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { ArrowLeft, PieChart, Users, TrendingUp, FileText, Plus } from "lucide-react";

type TabKey = "overview" | "shareholders" | "dividends" | "records";

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: "overview", label: "股权概览", icon: <PieChart className="w-4 h-4" /> },
  { key: "shareholders", label: "股东名册", icon: <Users className="w-4 h-4" /> },
  { key: "dividends", label: "分红记录", icon: <TrendingUp className="w-4 h-4" /> },
  { key: "records", label: "变更记录", icon: <FileText className="w-4 h-4" /> },
];

export default function AiCompanyWorkspace() {
  const [, params] = useRoute("/ledger/:id/ai-company/:companyId");
  const [, setLocation] = useLocation();
  const ledgerId = Number(params?.id);
  const companyId = Number(params?.companyId);

  const [activeTab, setActiveTab] = useState<TabKey>("overview");

  // TODO: 从后端获取账本信息和用户角色
  const userRole = "owner"; // 暂时默认，后续从 trpc 获取
  const companyName = "股权管理工作台";

  const isOwner = userRole === "owner";
  const isAdmin = userRole === "admin";
  const canManage = isOwner || isAdmin;

  const handleBack = () => {
    setLocation(`/ledger/${ledgerId}`);
  };

  return (
    <div className="flex flex-col min-h-screen" style={{ backgroundColor: '#F5F7FF' }}>
      {/* 顶部渐变头部 */}
      <div
        className="px-4 pt-4 pb-6"
        style={{ background: 'linear-gradient(135deg, #7C3AED 0%, #A78BFA 100%)', color: '#FFFFFF' }}
      >
        {/* 返回 + 标题 */}
        <div className="flex items-center gap-3 mb-4">
          <button onClick={handleBack} className="p-1.5 rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}>
            <ArrowLeft className="w-4 h-4 text-white" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold text-white truncate">{companyName}</h1>
            <p className="text-xs text-white/70 mt-0.5">
              {isOwner ? "创建者" : isAdmin ? "管理员" : userRole === "observer" ? "观察者" : "股东"} · AI股权账本
            </p>
          </div>
          <PieChart className="w-6 h-6 text-white/80" />
        </div>

        {/* Tab 切换 */}
        <div className="flex gap-1 bg-white/10 rounded-xl p-1">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{
                backgroundColor: activeTab === tab.key ? 'rgba(255,255,255,0.9)' : 'transparent',
                color: activeTab === tab.key ? '#7C3AED' : 'rgba(255,255,255,0.8)',
              }}
            >
              {tab.icon}
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 px-4 pb-20 -mt-2">

        {/* 股权概览 Tab */}
        {activeTab === "overview" && (
          <div className="space-y-3 pt-4">
            {/* 总股本卡 */}
            <div className="rounded-2xl p-4 shadow-sm" style={{ backgroundColor: '#FFFFFF' }}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-gray-700">总股本</span>
                {canManage && (
                  <button className="text-xs px-3 py-1 rounded-full text-white flex items-center gap-1" style={{ backgroundColor: '#7C3AED' }}>
                    <Plus className="w-3 h-3" />
                    编辑
                  </button>
                )}
              </div>
              <div className="text-3xl font-bold" style={{ color: '#7C3AED' }}>—</div>
              <p className="text-xs text-gray-400 mt-1">暂无股权数据，管理员可在此录入</p>
            </div>

            {/* 股权分布饼图占位 */}
            <div className="rounded-2xl p-4 shadow-sm" style={{ backgroundColor: '#FFFFFF' }}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-gray-700">股权分布</span>
              </div>
              <div
                className="flex items-center justify-center rounded-xl"
                style={{ height: 160, backgroundColor: '#F5F3FF' }}
              >
                <div className="text-center">
                  <PieChart className="w-10 h-10 mx-auto mb-2" style={{ color: '#C4B5FD' }} />
                  <p className="text-xs text-gray-400">股权结构图将在录入数据后显示</p>
                </div>
              </div>
            </div>

            {/* 我的持股 */}
            <div className="rounded-2xl p-4 shadow-sm" style={{ backgroundColor: '#FFFFFF' }}>
              <span className="text-sm font-semibold text-gray-700">我的持股</span>
              <div className="mt-3 flex items-center gap-3">
                <div className="flex-1 p-3 rounded-xl" style={{ backgroundColor: '#F5F3FF' }}>
                  <p className="text-xs text-gray-500">持股比例</p>
                  <p className="text-lg font-bold mt-0.5" style={{ color: '#7C3AED' }}>—%</p>
                </div>
                <div className="flex-1 p-3 rounded-xl" style={{ backgroundColor: '#F5F3FF' }}>
                  <p className="text-xs text-gray-500">持股数量</p>
                  <p className="text-lg font-bold mt-0.5" style={{ color: '#7C3AED' }}>—</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 股东名册 Tab */}
        {activeTab === "shareholders" && (
          <div className="space-y-3 pt-4">
            <div className="rounded-2xl p-4 shadow-sm" style={{ backgroundColor: '#FFFFFF' }}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-gray-700">股东名册</span>
                {canManage && (
                  <button className="text-xs px-3 py-1 rounded-full text-white flex items-center gap-1" style={{ backgroundColor: '#7C3AED' }}>
                    <Plus className="w-3 h-3" />
                    添加股东
                  </button>
                )}
              </div>
              <div className="flex flex-col items-center justify-center py-8">
                <Users className="w-10 h-10 mb-2" style={{ color: '#C4B5FD' }} />
                <p className="text-sm text-gray-400">暂无股东信息</p>
                <p className="text-xs text-gray-300 mt-1">管理员可录入股东持股信息</p>
              </div>
            </div>
          </div>
        )}

        {/* 分红记录 Tab */}
        {activeTab === "dividends" && (
          <div className="space-y-3 pt-4">
            <div className="rounded-2xl p-4 shadow-sm" style={{ backgroundColor: '#FFFFFF' }}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-gray-700">分红记录</span>
                {canManage && (
                  <button className="text-xs px-3 py-1 rounded-full text-white flex items-center gap-1" style={{ backgroundColor: '#7C3AED' }}>
                    <Plus className="w-3 h-3" />
                    新增分红
                  </button>
                )}
              </div>
              <div className="flex flex-col items-center justify-center py-8">
                <TrendingUp className="w-10 h-10 mb-2" style={{ color: '#C4B5FD' }} />
                <p className="text-sm text-gray-400">暂无分红记录</p>
                <p className="text-xs text-gray-300 mt-1">管理员可在此录入分红派发记录</p>
              </div>
            </div>
          </div>
        )}

        {/* 变更记录 Tab */}
        {activeTab === "records" && (
          <div className="space-y-3 pt-4">
            <div className="rounded-2xl p-4 shadow-sm" style={{ backgroundColor: '#FFFFFF' }}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-gray-700">股权变更记录</span>
              </div>
              <div className="flex flex-col items-center justify-center py-8">
                <FileText className="w-10 h-10 mb-2" style={{ color: '#C4B5FD' }} />
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
