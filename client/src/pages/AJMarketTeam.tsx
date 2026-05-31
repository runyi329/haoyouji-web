import { useState } from "react";
import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { ChevronLeft, Users, TrendingUp, FileCheck, FileText } from "lucide-react";
import { UserAvatar } from "@/components/UserAvatar";
import { PageTag } from "@/components/PageTag";

type Period = 'all' | 'day' | 'week' | 'month' | 'quarter' | 'year';

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'day', label: '今日' },
  { value: 'week', label: '本周' },
  { value: 'month', label: '本月' },
  { value: 'quarter', label: '本季' },
  { value: 'year', label: '本年' },
];

export default function AJMarketTeam() {
  const { ledgerId } = useParams<{ ledgerId: string }>();
  const [period, setPeriod] = useState<Period>('month');

  const { data: team = [], isLoading } = trpc.ledger.ajGetMarketTeam.useQuery(
    { ledgerId: Number(ledgerId), period },
    { enabled: !!ledgerId }
  );

  const totalInvoiceCount = team.reduce((s, m) => s + m.invoiceCount, 0);
  const totalAmount = team.reduce((s, m) => s + m.totalAmount, 0);
  const totalApprovedAmount = team.reduce((s, m) => s + m.approvedAmount, 0);

  return (
    <div className="min-h-screen bg-gray-50 max-w-md mx-auto relative">
      <PageTag code="P041" />
      {/* 顶部导航栏 */}
      <div
        className="sticky top-0 z-10 px-4 pt-4 pb-3 flex items-center gap-3"
        style={{ background: 'linear-gradient(135deg, #D32F2F 0%, #B71C1C 100%)' }}
      >
        <button
          onClick={() => window.history.back()}
          className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0"
        >
          <ChevronLeft className="w-5 h-5 text-white" />
        </button>
        <h1 className="text-lg font-bold text-white flex-1">市场管理</h1>
        {/* 时间段选择 */}
        <div className="relative">
          <select
            value={period}
            onChange={e => setPeriod(e.target.value as Period)}
            className="appearance-none text-xs text-white/90 pl-2 pr-6 py-1 rounded-full border border-white/30 cursor-pointer outline-none"
            style={{ backgroundColor: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(8px)' }}
          >
            {PERIOD_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value} style={{ color: '#222' }}>{opt.label}</option>
            ))}
          </select>
          <svg className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 fill-white/70" viewBox="0 0 12 12">
            <path d="M6 8L2 4h8z" />
          </svg>
        </div>
      </div>

      {/* 汇总统计卡片 */}
      <div className="px-4 pt-4 pb-2">
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-2xl px-3 py-3 shadow-sm text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Users className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-[10px] text-gray-400">团队人数</span>
            </div>
            <div className="text-xl font-bold text-gray-800">{team.length}</div>
          </div>
          <div className="bg-white rounded-2xl px-3 py-3 shadow-sm text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <FileText className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-[10px] text-gray-400">发票张数</span>
            </div>
            <div className="text-xl font-bold text-gray-800">{totalInvoiceCount}</div>
          </div>
          <div className="bg-white rounded-2xl px-3 py-3 shadow-sm text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <TrendingUp className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-[10px] text-gray-400">开票总额</span>
            </div>
            <div className="text-base font-bold text-[#D32F2F]">
              {totalAmount >= 10000
                ? `${(totalAmount / 10000).toFixed(1)}万`
                : `¥${totalAmount.toFixed(0)}`}
            </div>
          </div>
        </div>
        {/* 已通过金额 */}
        {totalApprovedAmount > 0 && (
          <div className="mt-2 bg-green-50 rounded-xl px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <FileCheck className="w-4 h-4 text-green-600" />
              <span className="text-xs text-green-700">已审批通过</span>
            </div>
            <span className="text-sm font-semibold text-green-700">
              ¥{totalApprovedAmount.toFixed(2)}
            </span>
          </div>
        )}
      </div>

      {/* 成员列表 */}
      <div className="px-4 pb-8 mt-2 space-y-2">
        {isLoading ? (
          <div className="flex flex-col gap-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-white rounded-2xl p-4 animate-pulse">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gray-200" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 bg-gray-200 rounded w-24" />
                    <div className="h-2.5 bg-gray-100 rounded w-16" />
                  </div>
                  <div className="h-4 bg-gray-200 rounded w-16" />
                </div>
              </div>
            ))}
          </div>
        ) : team.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <Users className="w-12 h-12 mb-3 opacity-30" />
            <p className="text-sm">暂无下线成员</p>
            <p className="text-xs mt-1 text-gray-300">通过邀请码邀请的成员会显示在这里</p>
          </div>
        ) : (
          team.map((member, idx) => {
            const displayName = member.nickname || member.name || member.username;
            return (
              <div key={member.userId} className="bg-white rounded-2xl px-4 py-3 shadow-sm">
                <div className="flex items-center gap-3">
                  {/* 排名 */}
                  <div className={`w-6 text-center text-sm font-bold flex-shrink-0 ${idx === 0 ? 'text-yellow-500' : idx === 1 ? 'text-gray-400' : idx === 2 ? 'text-amber-600' : 'text-gray-300'}`}>
                    {idx + 1}
                  </div>
                  {/* 头像 */}
                  <UserAvatar
                    username={member.username}
                    avatar={member.avatar}
                    nickname={member.nickname}
                    size="md"
                  />
                  {/* 名称 + 角色 */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-800 truncate">{displayName}</div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {member.role === 'owner' ? '创始人' : member.role === 'admin' ? '企业主' : '业务员'}
                    </div>
                  </div>
                  {/* 业绩数据 */}
                  <div className="flex flex-col items-end flex-shrink-0">
                    <div className="text-sm font-bold text-gray-800">
                      {member.totalAmount >= 10000
                        ? `¥${(member.totalAmount / 10000).toFixed(1)}万`
                        : `¥${member.totalAmount.toFixed(0)}`}
                    </div>
                    <div className="text-[10px] text-gray-400 mt-0.5">
                      {member.invoiceCount}张 · 通过{member.approvedCount}张
                    </div>
                  </div>
                </div>
                {/* 进度条：已通过/总额 */}
                {member.invoiceCount > 0 && (
                  <div className="mt-2 ml-9">
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-green-400 rounded-full transition-all"
                        style={{ width: `${member.invoiceCount > 0 ? Math.round((member.approvedCount / member.invoiceCount) * 100) : 0}%` }}
                      />
                    </div>
                    <div className="text-[9px] text-gray-300 mt-0.5">
                      审批通过率 {member.invoiceCount > 0 ? Math.round((member.approvedCount / member.invoiceCount) * 100) : 0}%
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
