import { useLocation } from "wouter";
import { ArrowLeft, Users, UserCheck, Network, TrendingUp, Share2 } from "lucide-react";
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
      <div className="bg-[#D32F2F] px-4 pt-12 pb-4">
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

      {/* 汇总数据条 */}
      {totals && (
        <div className="bg-white border-b border-gray-100 px-4 py-3">
          <div className="grid grid-cols-4 gap-0 divide-x divide-gray-100">
            <div className="text-center px-2">
              <p className="text-[10px] text-gray-400 mb-0.5">①直接添加</p>
              <p className="text-base font-bold text-[#D32F2F]">{totals.direct.toLocaleString()}</p>
            </div>
            <div className="text-center px-2">
              <p className="text-[10px] text-gray-400 mb-0.5">②扫码共享</p>
              <p className="text-base font-bold text-[#E65100]">{totals.scan.toLocaleString()}</p>
            </div>
            <div className="text-center px-2">
              <p className="text-[10px] text-gray-400 mb-0.5">③聚合介绍</p>
              <p className="text-base font-bold text-[#5E35B1]">{totals.intro.toLocaleString()}</p>
            </div>
            <div className="text-center px-2">
              <p className="text-[10px] text-gray-400 mb-0.5">合计人脉</p>
              <p className="text-base font-bold text-[#2E7D32]">{totals.total.toLocaleString()}</p>
            </div>
          </div>
        </div>
      )}

      {/* 股东明细表格 */}
      <div className="px-3 mt-3 pb-8">
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          {/* 表头 */}
          <div className="grid grid-cols-[36px_1fr_44px_44px_44px_44px_36px] bg-gray-50 border-b border-gray-200 px-2 py-2">
            <div className="text-[10px] font-semibold text-gray-400 text-center">编号</div>
            <div className="text-[10px] font-semibold text-gray-400 pl-1">姓名</div>
            <div className="text-[10px] font-semibold text-[#D32F2F] text-center">①直接</div>
            <div className="text-[10px] font-semibold text-[#E65100] text-center">②扫码</div>
            <div className="text-[10px] font-semibold text-[#5E35B1] text-center">③聚合</div>
            <div className="text-[10px] font-semibold text-[#2E7D32] text-center">合计</div>
            <div className="text-[10px] font-semibold text-[#CBA471] text-center">介绍</div>
          </div>

          {isLoading && (
            <div className="flex items-center justify-center py-10">
              <div className="w-6 h-6 border-2 border-[#D32F2F] border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {error && (
            <div className="text-center py-8 text-sm text-red-500">
              加载失败，请重试
            </div>
          )}

          {stats && stats.map((row: StatRow, idx: number) => (
            <div
              key={row.userId}
              className={`grid grid-cols-[36px_1fr_44px_44px_44px_44px_36px] px-2 py-2.5 items-center ${
                idx % 2 === 0 ? "bg-white" : "bg-gray-50/60"
              } ${idx < stats.length - 1 ? "border-b border-gray-100" : ""}`}
            >
              {/* 编号 */}
              <div className="text-center">
                <span className="text-[10px] font-mono text-gray-400">{row.shareNo}</span>
              </div>
              {/* 姓名 */}
              <div className="pl-1 min-w-0">
                <p className="text-xs font-semibold text-gray-800 truncate">{row.name}</p>
              </div>
              {/* ①直接 */}
              <div className="text-center">
                <span className={`text-xs font-bold ${row.directCount > 0 ? "text-[#D32F2F]" : "text-gray-300"}`}>
                  {row.directCount > 0 ? row.directCount.toLocaleString() : "—"}
                </span>
              </div>
              {/* ②扫码 */}
              <div className="text-center">
                <span className={`text-xs font-bold ${row.scanShareCount > 0 ? "text-[#E65100]" : "text-gray-300"}`}>
                  {row.scanShareCount > 0 ? row.scanShareCount.toLocaleString() : "—"}
                </span>
              </div>
              {/* ③聚合 */}
              <div className="text-center">
                <span className={`text-xs font-bold ${row.introCount > 0 ? "text-[#5E35B1]" : "text-gray-300"}`}>
                  {row.introCount > 0 ? row.introCount.toLocaleString() : "—"}
                </span>
              </div>
              {/* 合计 */}
              <div className="text-center">
                <span className={`text-xs font-bold ${row.total > 0 ? "text-[#2E7D32]" : "text-gray-300"}`}>
                  {row.total > 0 ? row.total.toLocaleString() : "—"}
                </span>
              </div>
              {/* 我介绍他人 */}
              <div className="text-center">
                <span className={`text-xs font-bold ${row.myIntroCount > 0 ? "text-[#CBA471]" : "text-gray-300"}`}>
                  {row.myIntroCount > 0 ? row.myIntroCount : "—"}
                </span>
              </div>
            </div>
          ))}

          {/* 合计行 */}
          {totals && stats && (
            <div className="grid grid-cols-[36px_1fr_44px_44px_44px_44px_36px] px-2 py-2.5 items-center bg-gray-100 border-t border-gray-200">
              <div />
              <div className="pl-1">
                <p className="text-xs font-bold text-gray-700">合计</p>
              </div>
              <div className="text-center">
                <span className="text-xs font-bold text-[#D32F2F]">{totals.direct.toLocaleString()}</span>
              </div>
              <div className="text-center">
                <span className="text-xs font-bold text-[#E65100]">{totals.scan.toLocaleString()}</span>
              </div>
              <div className="text-center">
                <span className="text-xs font-bold text-[#5E35B1]">{totals.intro.toLocaleString()}</span>
              </div>
              <div className="text-center">
                <span className="text-xs font-bold text-[#2E7D32]">{totals.total.toLocaleString()}</span>
              </div>
              <div className="text-center">
                <span className="text-xs font-bold text-[#CBA471]">{totals.myIntro.toLocaleString()}</span>
              </div>
            </div>
          )}
        </div>

        {/* 列说明 */}
        <div className="mt-3 bg-white rounded-xl px-4 py-3 shadow-sm">
          <p className="text-[10px] text-gray-400 font-semibold mb-1.5">列说明</p>
          <div className="space-y-1">
            <p className="text-[10px] text-gray-500"><span className="text-[#D32F2F] font-semibold">①直接</span> 自己手动录入的联系人</p>
            <p className="text-[10px] text-gray-500"><span className="text-[#E65100] font-semibold">②扫码</span> 对方直接扫码/用户名共享（无介绍人）</p>
            <p className="text-[10px] text-gray-500"><span className="text-[#5E35B1] font-semibold">③聚合</span> 通过聚合码/介绍码间接建立的共享</p>
            <p className="text-[10px] text-gray-500"><span className="text-[#2E7D32] font-semibold">合计</span> 三种来源之和</p>
            <p className="text-[10px] text-gray-500"><span className="text-[#CBA471] font-semibold">介绍</span> 我作为介绍人帮他人建立的共享连接数</p>
          </div>
        </div>
      </div>
    </div>
  );
}
