/**
 * RightInterestDetail.tsx
 * 右侧利息详情只读组件
 * 展示指定账本指定标签的利息分段明细和汇总（样式对齐 InterestManagePage 展开详情）
 * Props: ledgerId, tagName
 */
import React, { useMemo } from "react";
import { trpc } from "@/lib/trpc";

// 计算某一分段的天数（北京时间，过0点算一天）
function calcPeriodDays(startDateStr: string, endDateStr?: string | null): number {
  if (!startDateStr) return 0;
  const [sy, sm, sd] = startDateStr.split('-').map(Number);
  const startMs = new Date(sy, sm - 1, sd, 0, 0, 0, 0).getTime();
  let endMs: number;
  if (endDateStr) {
    const [ey, em, ed] = endDateStr.split('-').map(Number);
    endMs = new Date(ey, em - 1, ed, 0, 0, 0, 0).getTime();
  } else {
    const now = new Date();
    endMs = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
  }
  const diff = endMs - startMs;
  if (diff < 0) return 0;
  return Math.floor(diff / 86400000) + 1;
}

function calcPeriodInterest(principal: number, annualRate: number, days: number): number {
  if (principal <= 0 || annualRate <= 0 || days <= 0) return 0;
  return principal * (annualRate / 100 / 365) * days;
}

function fmt(n: number): string {
  return n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface Props {
  ledgerId: number;
  tagName: string;
}

export function RightInterestDetail({ ledgerId, tagName }: Props) {
  // 所有分段
  const { data: allPeriods = [] } = (trpc.ledger as any).getTagInterestPeriods.useQuery(
    { ledgerId },
    { enabled: !!ledgerId && !!tagName }
  );

  // 手工调息日志（addTagInterestManualLog 写入的独立日志）
  const { data: allLogs = [] } = (trpc.ledger as any).getTagInterestManualLogs.useQuery(
    { ledgerId },
    { enabled: !!ledgerId && !!tagName }
  );

  // 标签配置（含暂停日期）
  const { data: allTagsConfig = {} } = (trpc.ledger as any).getAllTagsConfigByLedger.useQuery(
    { ledgerId },
    { enabled: !!ledgerId && !!tagName }
  );

  const tagData = useMemo(() => {
    const tagConfig = (allTagsConfig as any)[tagName];
    const pauseDate: string | null = tagConfig?.pause_date ?? null;
    const periods = (allPeriods as any[]).filter((p: any) => p.tag_name === tagName);

    const periodDetails = periods.map((p: any) => {
      const principal = parseFloat(p.principal) || 0;
      const annualRate = parseFloat(p.annual_rate) || 0;
      const effectiveEndDate = (!p.end_date && pauseDate) ? pauseDate : (p.end_date || null);
      const days = calcPeriodDays(p.start_date, effectiveEndDate);
      const isManual = p.is_manual === 1 || p.is_manual === '1' || p.is_manual === true;
      const interest = isManual ? principal : calcPeriodInterest(principal, annualRate, days);
      const dailyInterest = (!isManual && !pauseDate && principal > 0 && annualRate > 0)
        ? principal * annualRate / 100 / 365 : 0;
      return { ...p, principal, annualRate, days, interest, dailyInterest, isManual, effectiveEndDate };
    });

    const autoInterest = periodDetails.filter(p => !p.isManual).reduce((sum, p) => sum + p.interest, 0);
    const manualTotal = periodDetails.filter(p => p.isManual).reduce((sum, p) => sum + p.interest, 0);
    const totalInterest = autoInterest + manualTotal;

    return { periodDetails, autoInterest, manualTotal, totalInterest, pauseDate };
  }, [allPeriods, allLogs, allTagsConfig, tagName]);

  const { periodDetails, autoInterest, manualTotal, totalInterest, pauseDate } = tagData;

  if (periodDetails.length === 0) {
    return (
      <div className="text-xs text-gray-400 py-4 text-center">暂无利息记录</div>
    );
  }

  return (
    <div className="text-xs space-y-0">
      {/* 标签名称和暂停状态 */}
      <div className="flex items-center gap-2 pb-2 mb-1" style={{ borderBottom: '1px solid #F3F4F6' }}>
        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: pauseDate ? '#93C5FD' : '#3B82F6' }} />
        <span className="text-sm font-bold text-gray-900">{tagName}</span>
        <span className="text-xs text-gray-400">{periodDetails.length} 段</span>
        {pauseDate && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: '#DBEAFE', color: '#1D4ED8' }}>
            已暂停 {pauseDate.slice(5)}
          </span>
        )}
      </div>

      {/* 分段列表 */}
      <div className="divide-y divide-gray-50">
        {periodDetails.map((p: any, idx: number) => (
          <div key={p.id ?? idx} className="py-3">
            {p.isManual ? (
              /* 手工调息行 */
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                    style={p.principal >= 0
                      ? { backgroundColor: '#FEE2E2', color: '#B91C1C' }
                      : { backgroundColor: '#DCFCE7', color: '#15803D' }}
                  >
                    {p.principal >= 0 ? '手工加息' : '手工减息'}
                  </span>
                  <span className="text-xs text-gray-400">{p.created_at ? String(p.created_at).slice(0, 10) : '--'}</span>
                </div>
                <div className="text-xs">
                  <span className="text-gray-400">调整金额 </span>
                  <span className="font-semibold" style={{ color: p.principal >= 0 ? '#EF4444' : '#16A34A' }}>
                    {p.principal >= 0 ? '+' : ''}¥{fmt(p.principal)}
                  </span>
                  {p.manual_remark && (
                    <span className="ml-2 text-gray-400">备注：{p.manual_remark}</span>
                  )}
                </div>
              </div>
            ) : (
              /* 普通分段行 */
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold text-gray-700">
                    {p.period_label || `第 ${idx + 1} 段`}
                  </span>
                  <span className="text-xs text-gray-400">
                    {p.start_date} → {p.effectiveEndDate || '至今'}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1 text-xs">
                  <div>
                    <span className="text-gray-400">本金 </span>
                    <span className="font-medium text-gray-700">¥{fmt(p.principal)}</span>
                  </div>
                  <div>
                    <span className="text-gray-400">年化 </span>
                    <span className="font-medium text-blue-600">{p.annualRate}%</span>
                  </div>
                  <div>
                    <span className="text-gray-400">天数 </span>
                    <span className="font-medium text-gray-700">{p.days}天</span>
                  </div>
                </div>
                <div className="mt-1 text-xs">
                  <span className="text-gray-400">日利息 </span>
                  <span className="font-medium" style={{ color: '#F97316' }}>¥{fmt(p.dailyInterest)}</span>
                  <span className="mx-2 text-gray-300">|</span>
                  <span className="text-gray-400">本段利息 </span>
                  <span className="font-semibold" style={{ color: p.interest >= 0 ? '#EF4444' : '#16A34A' }}>
                    ¥{fmt(p.interest)}
                  </span>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 汇总区 */}
      <div className="mt-2 px-3 py-2 rounded-xl" style={{ backgroundColor: '#F0FDF4' }}>
        <div className="flex justify-between text-xs">
          <span className="text-gray-500">自动计息合计</span>
          <span className="font-semibold" style={{ color: autoInterest >= 0 ? '#EF4444' : '#16A34A' }}>
            ¥ {fmt(autoInterest)}
          </span>
        </div>
        {manualTotal !== 0 && (
          <div className="flex justify-between text-xs mt-0.5">
            <span className="text-gray-500">手工调整</span>
            <span className="font-semibold" style={{ color: manualTotal > 0 ? '#EF4444' : '#16A34A' }}>
              {manualTotal > 0 ? '+' : ''}{fmt(manualTotal)}
            </span>
          </div>
        )}
        <div className="flex justify-between text-xs mt-1 pt-1" style={{ borderTop: '1px solid #BBF7D0' }}>
          <span className="font-semibold text-gray-700">累计利息合计</span>
          <span className="text-sm font-bold" style={{ color: totalInterest >= 0 ? '#EF4444' : '#16A34A' }}>
            ¥ {fmt(totalInterest)}
          </span>
        </div>
      </div>
    </div>
  );
}
