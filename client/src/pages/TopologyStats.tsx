import { useLocation } from "wouter";
import { ArrowLeft, Users, UserCheck, Network, Share2, TrendingUp } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

interface StatRow {
  shareNo: string;
  name: string;
  userId: number;
  directCount: number;
  scanShareCount: number;
  introCount: number;
  total: number;
  myIntroCount: number;
}

export default function TopologyStats() {
  const [, navigate] = useLocation();
  const { user } = useAuth();

  const { data: stats, isLoading, error } = trpc.topology.getShareholderContactStats.useQuery(undefined, {
    enabled: user?.role === "super_admin" || user?.role === "admin",
  });

  if (user && user.role !== "super_admin" && user.role !== "admin") {
    return (
      <div className="min-h-screen bg-[#F5F5F5] flex items-center justify-center">
        <div className="text-center text-gray-500">
          <p className="text-base">无权限访问此页面</p>
        </div>
      </div>
    );
  }

  // 汇总数据
  const totals = stats
    ? {
        direct: stats.reduce((s: number, r: StatRow) => s + r.directCount, 0),
        scan: stats.reduce((s: number, r: StatRow) => s + r.scanShareCount, 0),
        intro: stats.reduce((s: number, r: StatRow) => s + r.introCount, 0),
        total: stats.reduce((s: number, r: StatRow) => s + r.total, 0),
        myIntro: stats.reduce((s: number, r: StatRow) => s + r.myIntroCount, 0),
      }
    : null;

  return (
    <div className="min-h-screen bg-[#F5F5F5]">
      {/* 顶部导航 */}
      <div className="bg-[#D32F2F] px-4 pt-12 pb-5">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/parent/profile")}
            className="p-1.5 rounded-full bg-white/10 active:bg-white/20"
          >
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-white">拓扑人脉统计</h1>
            <p className="text-xs text-white/70 mt-0.5">59号账本 · 14位股东 · 三种来源分析</p>
          </div>
        </div>
      </div>

      {/* 汇总卡片 */}
      {totals && (
        <div className="px-4 -mt-1 pt-4">
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">全体汇总</h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-[#FFF8F8] rounded-xl p-3 border border-[#FFEBEE]">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-7 h-7 rounded-full bg-[#FFEBEE] flex items-center justify-center">
                    <Users className="w-3.5 h-3.5 text-[#D32F2F]" />
                  </div>
                  <span className="text-xs text-gray-500">①直接添加</span>
                </div>
                <p className="text-xl font-bold text-[#D32F2F]">{totals.direct.toLocaleString()}</p>
              </div>
              <div className="bg-[#FFF8F0] rounded-xl p-3 border border-[#FFE0B2]">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-7 h-7 rounded-full bg-[#FFE0B2] flex items-center justify-center">
                    <UserCheck className="w-3.5 h-3.5 text-[#E65100]" />
                  </div>
                  <span className="text-xs text-gray-500">②扫码共享</span>
                </div>
                <p className="text-xl font-bold text-[#E65100]">{totals.scan.toLocaleString()}</p>
              </div>
              <div className="bg-[#F3F0FF] rounded-xl p-3 border border-[#E8E0FF]">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-7 h-7 rounded-full bg-[#E8E0FF] flex items-center justify-center">
                    <Network className="w-3.5 h-3.5 text-[#5E35B1]" />
                  </div>
                  <span className="text-xs text-gray-500">③聚合码介绍</span>
                </div>
                <p className="text-xl font-bold text-[#5E35B1]">{totals.intro.toLocaleString()}</p>
              </div>
              <div className="bg-[#F0FFF4] rounded-xl p-3 border border-[#C8E6C9]">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-7 h-7 rounded-full bg-[#C8E6C9] flex items-center justify-center">
                    <TrendingUp className="w-3.5 h-3.5 text-[#2E7D32]" />
                  </div>
                  <span className="text-xs text-gray-500">合计可见人脉</span>
                </div>
                <p className="text-xl font-bold text-[#2E7D32]">{totals.total.toLocaleString()}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 说明卡片 */}
      <div className="px-4 mt-3">
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700 mb-2">来源说明</h2>
          <div className="space-y-2">
            <div className="flex items-start gap-2">
              <span className="w-5 h-5 rounded-full bg-[#FFEBEE] text-[#D32F2F] text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">①</span>
              <p className="text-xs text-gray-600"><span className="font-medium text-gray-800">直接添加</span>：自己手动录入的联系人（contacts表中 parentUserId=本人）</p>
            </div>
            <div className="flex items-start gap-2">
              <span className="w-5 h-5 rounded-full bg-[#FFE0B2] text-[#E65100] text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">②</span>
              <p className="text-xs text-gray-600"><span className="font-medium text-gray-800">扫码共享</span>：对方直接扫码或输入用户名共享给我的联系人（无介绍人）</p>
            </div>
            <div className="flex items-start gap-2">
              <span className="w-5 h-5 rounded-full bg-[#E8E0FF] text-[#5E35B1] text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">③</span>
              <p className="text-xs text-gray-600"><span className="font-medium text-gray-800">聚合码介绍</span>：通过他人聚合码/介绍码间接建立的共享（有 introducer_id）</p>
            </div>
          </div>
        </div>
      </div>

      {/* 股东明细列表 */}
      <div className="px-4 mt-3 pb-8">
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700">股东明细</h2>
          </div>

          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-[#D32F2F] border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {error && (
            <div className="text-center py-8 text-sm text-red-500">
              加载失败，请重试
            </div>
          )}

          {stats && stats.map((row: StatRow, idx: number) => (
            <div key={row.userId} className={`px-4 py-3 ${idx < stats.length - 1 ? "border-b border-gray-50" : ""}`}>
              {/* 股东标题行 */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded">{row.shareNo}</span>
                  <span className="text-sm font-semibold text-gray-800">{row.name}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-gray-400">合计</span>
                  <span className="text-sm font-bold text-[#D32F2F]">{row.total.toLocaleString()}</span>
                </div>
              </div>

              {/* 三种来源数据条 */}
              <div className="grid grid-cols-3 gap-2">
                <div className="text-center bg-[#FFF8F8] rounded-lg py-1.5">
                  <p className="text-xs text-gray-400 mb-0.5">①直接</p>
                  <p className="text-sm font-bold text-[#D32F2F]">{row.directCount.toLocaleString()}</p>
                </div>
                <div className="text-center bg-[#FFF8F0] rounded-lg py-1.5">
                  <p className="text-xs text-gray-400 mb-0.5">②扫码</p>
                  <p className="text-sm font-bold text-[#E65100]">{row.scanShareCount.toLocaleString()}</p>
                </div>
                <div className="text-center bg-[#F3F0FF] rounded-lg py-1.5">
                  <p className="text-xs text-gray-400 mb-0.5">③聚合</p>
                  <p className="text-sm font-bold text-[#5E35B1]">{row.introCount.toLocaleString()}</p>
                </div>
              </div>

              {/* 我介绍他人 */}
              {row.myIntroCount > 0 && (
                <div className="mt-2 flex items-center gap-1.5">
                  <Share2 className="w-3 h-3 text-[#CBA471]" />
                  <span className="text-xs text-gray-500">我作为介绍人帮助建立了 <span className="font-semibold text-[#CBA471]">{row.myIntroCount}</span> 条共享连接</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
