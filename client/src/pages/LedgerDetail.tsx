import React, { useState, useEffect, useRef, lazy, Suspense, useCallback, useMemo } from "react";
import { useUsdCnyRate } from "@/lib/useLivePrice"; // 规则G
import { FunderOrderCard, FunderNoteRow, formatCoinQtyFunder, useAccruedInterestFunder, COIN_OPTIONS, COIN_COLORS, STATUS_OPTIONS, INTEREST_PAYMENT_OPTIONS, getBeijingToday, DatePicker, CoinType } from "@/components/FunderOrderCard";
import { FunderOrderCardV2, FunderOrderCardV2Light, FunderOrderCardV2Silver, FunderLenderCardSilver } from "@/components/FunderOrderCardV2";
import Lottie from "lottie-react";
import aiTagAnimData from "@/assets/aitag-blue.json";
import { FunderAIPanel } from "@/components/FunderAIPanel";
import EthLeverageProduct from "@/components/EthLeverageProduct";

// PDF导出功能
function exportLedgerToPDF() {
  console.log('开始导出59号账本PDF报表...');
  
  try {
    // 获取当前时间
    const now = new Date();
    const timestamp = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 ${now.getHours()}时${now.getMinutes()}分`;
    
    // 尝试获取页面上的数据
    const ledgerName = document.querySelector('span.text-base.font-semibold')?.textContent || '蓄水池股东';
    
    // 获取成员信息
    let memberCount = 16; // 默认值
    try {
      const memberElements = document.querySelectorAll('[class*="member"], [class*="Member"]');
      if (memberElements.length > 0) {
        memberCount = memberElements.length;
      }
    } catch (e) {
      console.log('获取成员信息失败，使用默认值');
    }
    
    // 创建详细的PDF内容
    const pdfContent = `
========================================
        蓄水池股东账本报表
========================================

📅 生成时间: ${timestamp}
📊 账本ID: 59
📋 账本名称: ${ledgerName}
🏷️ 账本类型: 自定义AI账本 (custom_ai)

========================================
             股东信息
========================================

👥 总成员数: ${memberCount}人
📅 创建时间: 2026-03-25 21:17:44
👤 创建者: jiang (用户ID: 870413)

========================================
             功能状态
========================================

✅ 报销功能: 已启用
❌ 待结功能: 已禁用

========================================
             权限设置
========================================

👁️ 查看权限: 所有成员可查看所有记录
➕ 添加权限: 所有成员可添加记录
✏️ 编辑权限: 仅所有者可编辑他人记录
🗑️ 删除权限: 仅所有者可删除他人记录

========================================
             报表说明
========================================

此报表为59号账本（蓄水池股东）的简要信息汇总。

主要特点:
• 股东专用账本，非传统记账
• 用于管理股东信息和股权结构
• 支持股东间的资金往来管理
• 提供股权比例和投资金额跟踪

如需详细数据，请登录系统查看完整信息。

========================================
             生成说明
========================================

由好友记系统自动生成
© 2026 好友记 - 智能账本管理系统

版本: 1.0
生成编号: ${now.getTime()}
`;
    
    // 创建Blob对象
    const blob = new Blob([pdfContent], { type: 'application/pdf' });
    
    // 创建下载链接
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `蓄水池股东账本报表_${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}_${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}.pdf`;
    
    // 触发下载
    document.body.appendChild(a);
    a.click();
    
    // 清理
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
    
    // 显示成功提示
    alert('✅ PDF报表导出成功！\n文件已开始下载。');
    console.log('PDF导出完成');
    
  } catch (error) {
    console.error('PDF导出失败:', error);
    alert('❌ PDF导出失败，请稍后重试');
  }
}

// 精确到秒的利息计数器 Hook
function useAccruedInterest(interestBase: string | null, interestRateAnnual: string | null, interestStartDate: string | null, settledAt?: string | null) {
  const [accrued, setAccrued] = useState<number>(0);
  const computeAccrued = useCallback(() => {
    const base = parseFloat(interestBase || '0');
    const rate = parseFloat(interestRateAnnual || '0');
    if (!base || !rate || !interestStartDate) return 0;
    const startTs = new Date(interestStartDate + 'T00:00:00').getTime();
    if (isNaN(startTs)) return 0;
    const endTs = settledAt ? new Date(settledAt).getTime() : Date.now();
    const elapsedSeconds = Math.max(0, (endTs - startTs) / 1000);
    const perSecond = (base * rate / 100) / (365 * 24 * 3600);
    return perSecond * elapsedSeconds;
  }, [interestBase, interestRateAnnual, interestStartDate, settledAt]);
  useEffect(() => {
    setAccrued(computeAccrued());
    if (settledAt) return;
    const timer = setInterval(() => setAccrued(computeAccrued()), 1000);
    return () => clearInterval(timer);
  }, [computeAccrued, settledAt]);
  return accrued;
}

// 汇总所有资金股记录的股本+实时股息总和（增量权重：每笔按发放时快照的weight加权）
function useTotalSharesWithDividend(shares: any[], filterType?: string) {
  const computeTotal = useCallback(() => {
    if (!shares || shares.length === 0) return 0;
    let total = 0;
    const now = Date.now();
    const filtered = filterType ? shares.filter((s: any) => s.shareType === filterType) : shares;
    for (const s of filtered) {
      const base = Number(s.shareCount) || 0;
      // 先计算这笔的股息（不乘快照权重，卡片只显示原始股本+股息）
      let dividend = 0;
      if (base > 0 && s.grantDate) {
        const d = new Date(s.grantDate);
        const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        const startTs = new Date(dateStr + 'T00:00:00').getTime();
        if (!isNaN(startTs)) {
          const elapsedSeconds = Math.max(0, (now - startTs) / 1000);
          const rate = Number(s.annualRate ?? 6);
          const perSecond = (base * rate / 100) / (365 * 24 * 3600);
          dividend = perSecond * elapsedSeconds;
        }
      }
      // 公式：股本 + 股息（权重只在顶部总计股权处统一乘）
      total += base + dividend;
    }
    return total;
  }, [shares, filterType]);
  const [total, setTotal] = useState<number>(() => computeTotal());
  useEffect(() => {
    setTotal(computeTotal());
    const timer = setInterval(() => setTotal(computeTotal()), 1000);
    return () => clearInterval(timer);
  }, [computeTotal]);
  return total;
}

// 资金股/市场资源股单条记录，带实时滚动股息
function AngelShareRow({ s, dateStr, isLast }: { s: any; dateStr: string; isLast: boolean }) {
  const grantDateStr = dateStr; // yyyy-MM-dd
  const base = Number(s.shareCount) || 0;
  const isCashout = s.shareType === '折现退出' || base < 0;
  const accrued = useAccruedInterest(
    isCashout ? '0' : String(Math.abs(base)), // 折现记录不计算股息
    String(s.annualRate ?? 6),
    grantDateStr
  );
  const isMarket = s.shareType === '资源股';
  const w = Number(s.weight ?? 1.0);
  const total = base + (isCashout ? 0 : accrued);
  // 折现退出用红色配色，普通记录用原配色
  const cardBg = isCashout ? '#fff5f5' : '#FFF8F0';
  const cardBorder = isCashout ? '1px solid rgba(220,38,38,0.25)' : '1px solid rgba(58,20,0,0.12)';
  const labelColor = isCashout ? 'rgba(185,28,28,0.6)' : 'rgba(58,20,0,0.55)';
  const unitColor = isCashout ? 'rgba(185,28,28,0.5)' : 'rgba(58,20,0,0.6)';
  const numColor = isCashout ? '#dc2626' : '#1A0A00';
  return (
    <div className="rounded-xl mx-1 mb-2.5" style={{
      background: cardBg,
      border: cardBorder,
      boxShadow: isCashout ? '0 2px 8px rgba(220,38,38,0.08)' : '0 2px 8px rgba(58,20,0,0.08), 0 1px 2px rgba(58,20,0,0.06)'
    }}>
      <div className="px-4 py-3">
        {/* 第一行：日期 + 类型标签 + 股权编号 */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <span className="text-xs" style={{ color: labelColor }}>{dateStr}</span>
            {s.shareType && (
              <span className="text-[10px] px-1.5 py-0.5 rounded" style={
                isCashout
                  ? { background: 'rgba(220,38,38,0.1)', color: '#dc2626', border: '1px solid rgba(220,38,38,0.3)' }
                  : { background: 'rgba(232,96,28,0.12)', color: '#3D1F0D', border: '1px solid rgba(232,96,28,0.3)' }
              }>{s.shareType}</span>
            )}
          </div>
          <span
            className="text-[10px] font-mono font-semibold select-all"
            style={{ color: isCashout ? 'rgba(185,28,28,0.4)' : 'rgba(58,20,0,0.45)', letterSpacing: '0.08em', background: isCashout ? 'rgba(220,38,38,0.06)' : 'rgba(58,20,0,0.06)', padding: '1px 6px', borderRadius: '4px', cursor: 'pointer', WebkitUserSelect: 'all', userSelect: 'all' }}
            onClick={() => {
              const code = s.share_code || s.regNo || '';
              if (!code) return;
              if (navigator.clipboard) {
                navigator.clipboard.writeText(code).then(() => {
                  const el = document.getElementById('share-code-toast');
                  if (el) { el.textContent = '已复制 ' + code; el.style.opacity = '1'; setTimeout(() => { el.style.opacity = '0'; }, 1500); }
                });
              }
            }}
          >
            {s.share_code || s.regNo || ''}
          </span>
        </div>
        {isCashout ? (
          /* 折现退出：只显示减项金额，不显示股息 */
          <div className="flex items-center justify-between">
            <span className="text-[10px]" style={{ color: labelColor }}>折现减项</span>
            <div className="flex items-baseline gap-0.5">
              <span className="text-base font-bold" style={{ color: '#dc2626' }}>{base.toFixed(2)}</span>
              <span className="text-[10px]" style={{ color: unitColor }}>张</span>
            </div>
          </div>
        ) : (
          <>
            {/* 数据行：股本 + 贡献 */}
            <div className="flex items-start justify-between">
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px]" style={{ color: labelColor, lineHeight: '1.4rem' }}>股本</span>
                <span className="text-[10px]" style={{ color: labelColor, lineHeight: '1.4rem' }}>贡献</span>
              </div>
              <div className="flex flex-col gap-1.5 items-end">
                <div className="flex items-baseline gap-0.5">
                  <span className="text-sm font-bold" style={{ color: numColor }}>{base.toFixed(2)}</span>
                  <span className="text-[10px]" style={{ color: unitColor }}>张</span>
                </div>
                <div className="flex items-baseline gap-0.5">
                  <span className="text-sm font-bold" style={{ color: '#3D1F0D' }}>{accrued.toFixed(2)}</span>
                  <span className="text-[10px]" style={{ color: unitColor }}>张</span>
                </div>
              </div>
            </div>
            {/* 合计行 */}
            <div className="flex items-center justify-between mt-2 pt-2" style={{ borderTop: '1px solid rgba(58,20,0,0.1)' }}>
              <span className="text-[10px] font-semibold" style={{ color: 'rgba(58,20,0,0.5)' }}>合计</span>
              <div className="flex items-baseline gap-0.5">
                <span className="text-base font-bold" style={{ color: '#E8601C' }}>{total.toFixed(2)}</span>
                <span className="text-[10px]" style={{ color: unitColor }}>张</span>
              </div>
            </div>
          </>
        )}
        {(s.reason || (s.shareType === '资源股' && (s.sourceNickname || s.source_user_id))) && (
          <div className="flex items-center justify-between mt-1.5">
            <span className="text-[10px] shrink-0" style={{ color: labelColor }}>备注</span>
            <span className="text-[10px] text-right truncate ml-2" style={{ color: isCashout ? '#dc2626' : '#1A0A00' }}>
              {s.reason}{s.shareType === '资源股' && (s.sourceNickname || s.source_user_id) ? <span style={{ color: '#15803d' }}>{s.reason ? ' · ' : ''}来源:{s.sourceNickname || `用户#${s.source_user_id}`}{s.source_amount ? `(${Number(s.source_amount).toLocaleString()}张)` : ''}</span> : null}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// 资金股/市场资源股折叠式卡片（收起时显示汇总，展开显示明细）
function AngelShareCard({ shares, isMarket, totalWithDividend }: { shares: any[]; isMarket: boolean; totalWithDividend: number }) {
  const [expanded, setExpanded] = useState(false);
  const shareNo = shares.find((s: any) => !isMarket)?.shareNo ?? shares[0]?.shareNo;
  const angelShareNo = shares[0]?.shareNo;
  // 汇总行：最早授予日期
  const earliest = shares.reduce((min: string, s: any) => {
    const d = new Date(s.grantDate);
    const ds = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    return ds < min ? ds : min;
  }, '9999');
  const totalBase = shares.reduce((sum: number, s: any) => sum + Number(s.shareCount), 0);
  const accrued = totalWithDividend - totalBase;

  const gold = { border: '1px solid rgba(58,20,0,0.3)', shadow: '0 2px 12px rgba(58,20,0,0.15)', divider: 'rgba(58,20,0,0.15)', labelColor: '#3D1F0D', numGrad: 'none', dimColor: 'rgba(58,20,0,0.7)', dimColor2: 'rgba(58,20,0,0.5)', chevronColor: 'rgba(58,20,0,0.6)', shareNoGrad: 'none', shareNoShadow: 'none' };
  const theme = gold;

  return (
    <div className="w-full">
      {/* 类型标题行 */}
      <div className="flex items-center justify-between px-1 mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold" style={{ color: theme.labelColor }}>
            {isMarket ? '资源股' : '资金股'}
          </span>
          <span style={{ color: theme.dimColor2, fontSize: '10px' }}>（{shares.length}份）</span>
        </div>
        {angelShareNo && (
          <div className="flex items-center gap-1">
            <span className="text-[10px]" style={{ color: theme.dimColor2 }}>股东编号</span>
            <span className="text-sm font-bold tracking-widest" style={{ color: '#1A0A00' }}>{angelShareNo}</span>
          </div>
        )}
      </div>
      {/* 折叠汇总行 */}
      <button
        className="w-full px-1 py-2 flex items-center justify-between"
        style={{ background: 'transparent', border: 'none', borderBottom: expanded ? `1px solid ${theme.divider}` : 'none', cursor: 'pointer' }}
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex flex-col gap-0.5">
          {/* 第一行：总张数大数字 */}
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-bold" style={{ color: '#1A0A00' }}>
              {totalWithDividend.toFixed(2)}
            </span>
            <span className="text-xs font-normal" style={{ color: theme.dimColor }}>张</span>
          </div>

        </div>
        <span style={{ color: theme.chevronColor, fontSize: '14px', lineHeight: 1 }}>{expanded ? '▲' : '▼'}</span>
      </button>
      {/* 展开明细 */}
      {expanded && (
        <div className="pt-1">
          {shares.map((s: any, idx: number, arr: any[]) => {
            const d = new Date(s.grantDate);
            const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
            return <AngelShareRow key={s.id} s={s} dateStr={dateStr} isLast={idx === arr.length - 1} />;
          })}
        </div>
      )}
    </div>
  );
}

// 单张资金方订单卡片右栏（包含扫描数据查询）
function FunderCollateralInfoModal({ onClose, collateral, collateralItemValues, collateralItemPrices, collateralValue, buyValue, currentValue, accrued, paidInterest, shortfall, floatPnl }: {
  onClose: () => void;
  collateral: { coin: string; qty: string }[];
  collateralItemValues: (number | null)[];
  collateralItemPrices: (number | null)[];
  collateralValue: number;
  buyValue: number;
  currentValue: number | null;
  accrued: number;
  paidInterest: number;
  shortfall: number | null;
  floatPnl: number | null;
}) {
  // 风险敞口 = 担保物价値 + 浮动盈亏 - 代结利息 + 已结利息
  // 代结利息(accrued)是应计总额，已结利息(paidInterest)已收回可抵消风险
  // 敞口正数表示担保充足，负数表示缺口
  const exposure = floatPnl !== null
    ? collateralValue + floatPnl - accrued + paidInterest
    : collateralValue - accrued + paidInterest;
  const isSufficient = exposure >= 0;
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={onClose}>
      <div className="rounded-2xl p-5 mx-4 w-full max-w-xs" style={{ background: '#fff', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-bold" style={{ color: '#1A2340' }}>担保缺口计算说明</span>
          <button onClick={onClose} className="text-gray-400 text-lg leading-none">×</button>
        </div>
        <div className="text-xs space-y-2.5" style={{ color: '#4B5563' }}>
          <div className="p-2.5 rounded-lg" style={{ background: '#F0F4FF' }}>
            <div className="font-semibold mb-1" style={{ color: '#1A2340' }}>① 浮动盈亏</div>
            <div>= 当前市値 - 计息基数（正数为浮盈，负数为亏损）</div>
            <div className="mt-1 font-mono">
              {floatPnl !== null
                ? <>
                    <span style={{ color: '#3B82F6' }}>= {currentValue!.toFixed(2)} - {buyValue.toFixed(2)} = </span>
                    <strong style={{ color: floatPnl >= 0 ? '#DC2626' : '#16A34A' }}>
                      {floatPnl >= 0 ? '+' : ''}{floatPnl.toFixed(2)} U
                      {floatPnl >= 0 ? '（浮盈）' : '（亏损）'}
                    </strong>
                  </>
                : <span className="text-gray-400">当前市値暂无实时价格，暂无法计算浮动盈亏</span>
              }
            </div>
          </div>
          <div className="p-2.5 rounded-lg" style={{ background: '#F0F4FF' }}>
            <div className="font-semibold mb-1" style={{ color: '#1A2340' }}>② 担保价値</div>
            {collateral.length === 0
              ? <div className="font-mono mt-1" style={{ color: '#9CA3AF' }}>0.00 U（无担保物）</div>
              : <>
                  {collateral.map((a, idx) => {
                    const itemVal = collateralItemValues[idx];
                    return (
                      <div key={idx} className="mt-1 flex justify-between">
                        <span className="font-mono" style={{ color: '#6B7280' }}>{a.qty} {a.coin}</span>
                        {itemVal !== null
                          ? <span className="font-mono font-semibold" style={{ color: '#3B82F6' }}>{itemVal.toFixed(2)} U</span>
                          : <span className="font-mono" style={{ color: '#D1D5DB' }}>暂无实时价</span>
                        }
                      </div>
                    );
                  })}
                  {collateral.length > 1 && (
                    <div className="font-mono mt-1 pt-1 font-semibold" style={{ borderTop: '1px solid #D1D5DB', color: '#1A2340' }}>
                      合计 {collateralValue.toFixed(2)} U
                    </div>
                  )}
                </>
            }
          </div>
          <div className="p-2.5 rounded-lg" style={{ background: isSufficient ? '#FFF1F1' : '#F0FDF4' }}>
            <div className="font-semibold mb-1" style={{ color: isSufficient ? '#DC2626' : '#16A34A' }}>③ 风险敎口</div>
            <div>担保物 + 浮动盈亏 − 代结利息 + 已结利息（正数充足，负数缺口）</div>
            <div className="mt-1 font-mono">
              {floatPnl !== null
                ? <span style={{ color: '#3B82F6' }}>= {collateralValue.toFixed(2)} + ({floatPnl >= 0 ? '+' : ''}{floatPnl.toFixed(2)}) − {accrued.toFixed(2)} + {paidInterest.toFixed(2)} = <strong style={{ color: isSufficient ? '#DC2626' : '#16A34A' }}>{exposure >= 0 ? '+' : ''}{exposure.toFixed(2)} U</strong></span>
                : <span style={{ color: '#3B82F6' }}>= {collateralValue.toFixed(2)} + ---（暂无实时价） − {accrued.toFixed(2)} + {paidInterest.toFixed(2)} = <strong style={{ color: isSufficient ? '#DC2626' : '#16A34A' }}>{exposure >= 0 ? '+' : ''}{exposure.toFixed(2)} U</strong></span>
              }
            </div>
            <div className="mt-1.5" style={{ color: isSufficient ? '#DC2626' : '#16A34A' }}>
              {isSufficient
                ? `担保物充足，还有 ${exposure.toFixed(2)} U 的余量空间`
                : `担保物不足，还需补充 ${Math.abs(exposure).toFixed(2)} U 才能覆盖风险`
              }
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


// ===== FunderOrderCardLegacy 老版组件（FV0245之前的订单使用）=====
// @deprecated 禁止在 FV0245（id>=55）之后的新订单中使用此组件，请使用 FunderOrderCard
interface FunderOrderCardLegacyProps {
  order: any;
  livePrices: Record<string, number>;
  priceDirection?: Record<string, 'up' | 'down' | 'same'>;
  currentUser?: any;
  isAdmin?: boolean;
  membersData?: any[];
  ledgerId: number;
  showPaymentPanel?: number | null;
  setShowPaymentPanel?: (v: number | null) => void;
  paymentForm?: { amount: string; currency: 'CNY' | 'U'; exchangeRate: string; payDate: string; note: string };
  setPaymentForm?: (fn: (f: any) => any) => void;
  editingPaymentId?: number | null;
  setEditingPaymentId?: (v: number | null) => void;
  showPaymentDatePicker?: boolean;
  setShowPaymentDatePicker?: (v: boolean | ((v: boolean) => boolean)) => void;
  addPaymentMutation?: any;
  updatePaymentMutation?: any;
  deletePaymentMutation?: any;
  interestPayments?: any[] | undefined;
  updateMutation?: any;
  handleOpenEdit?: (order: any) => void;
  handleDelete?: (orderId: number) => void;
  setConfirmSettleId?: (id: number) => void;
  handleOpenParticipants?: (orderId: number, interestBase: string) => void;
  showParticipantsPanel?: number | null;
  getPaymentLabel?: (val: string) => string;
  isInvited?: boolean;
  participantsList?: { userId: number; displayName: string; role: string; sortOrder: number; rate: string }[];
  setParticipantsList?: (fn: (list: any[]) => any[]) => void;
  ledgerMembers?: { userId: number; displayName: string; memberRole?: string }[];
  participantsLoading?: boolean;
  roleOptions?: { value: string; label: string; color: string; defaultRateLabel: string }[];
  handleAddParticipant?: (role: any) => void;
  handleSaveParticipants?: (orderId: number) => void;
  saveParticipantsMutation?: any;
  participantsEditMode?: boolean;
  setParticipantsEditMode?: (v: boolean) => void;
}

function FunderOrderCardLegacy({
  order,
  livePrices,
  priceDirection,
  currentUser,
  isAdmin,
  membersData,
  ledgerId,
  showPaymentPanel,
  setShowPaymentPanel,
  paymentForm,
  setPaymentForm,
  editingPaymentId,
  setEditingPaymentId,
  showPaymentDatePicker,
  setShowPaymentDatePicker,
  addPaymentMutation,
  updatePaymentMutation,
  deletePaymentMutation,
  interestPayments,
  updateMutation,
  handleOpenEdit,
  handleDelete,
  setConfirmSettleId,
  handleOpenParticipants,
  showParticipantsPanel,
  getPaymentLabel,
  isInvited,
  participantsList,
  setParticipantsList,
  ledgerMembers,
  participantsLoading,
  roleOptions,
  handleAddParticipant,
  handleSaveParticipants,
  saveParticipantsMutation,
  participantsEditMode,
  setParticipantsEditMode,
}: FunderOrderCardLegacyProps) {
  // 规则G：汇率通过Cloudflare Worker代理（老方案已封存：trpc.exchange.getRate）
  const { data: _cnyRateData } = useUsdCnyRate(60000);
  const cnyRate = parseFloat((_cnyRateData as any)?.money ?? "7.2") || 7.2;
  // 共享担保池查询（仅当订单开启了本人订单共享时才查询）
  const orderShareMode = (order as any).collateral_share_mode;
  const { data: sharedPoolInfo } = trpc.ledger.funderGetSharedCollateralPool.useQuery(
    { ledgerId, userId: Number(order.user_id) },
    { enabled: ledgerId > 0 && orderShareMode === 'self', staleTime: 10000 }
  );
  const [showInterestTip, setShowInterestTip] = useState(false);
  const [showCollateralInfo, setShowCollateralInfo] = useState(false);
  const [showMarginInfo, setShowMarginInfo] = useState(false);
  const [showStatusSheet, setShowStatusSheet] = useState(false);
  const tipBtnRef = useRef<HTMLButtonElement>(null);
  const [tipPos, setTipPos] = useState<{ bottom: number; right: number }>({ bottom: 0, right: 0 });
  const accrued = useAccruedInterestFunder(
    (order.status === 'active' || order.settled_at) ? order.interest_base : null,
    (order.status === 'active' || order.settled_at) ? (isInvited ? order.participantInfo?.commissionRate : order.interest_rate_annual) : null,
    (order.status === 'active' || order.settled_at) ? (isInvited ? order.participantInfo?.commissionStartDate : order.interest_start_date) : null,
    order.settled_at
  );

  const statusLabel = STATUS_OPTIONS.find(s => s.value === order.status)?.label || order.status;
  const statusColor = order.status === 'active' ? '#22C55E' : order.status === 'settled' ? '#3B82F6' : '#9CA3AF';
  const coinColor = COIN_COLORS[order.coin as CoinType] || '#6B7280';
  const isSettled = order.status === 'settled';
  const rateStr = String(isInvited ? (order.participantInfo?.commissionRate || '') : (order.interest_rate_annual || ''));
  const isNegRate = rateStr.startsWith('-');
  const rateAbs = isNegRate ? parseFloat(rateStr.slice(1)).toFixed(0) : (rateStr ? parseFloat(rateStr).toFixed(0) : '');
  const rateSign = isNegRate ? '-' : '+';

  // 左栏数值
  const qty = parseFloat(order.buy_quantity || '0');
  const price = parseFloat(order.buy_price || '0');
  const totalU = qty > 0 && price > 0 ? qty * price : parseFloat(order.amount || '0');
  // 利息货币逻辑与 LedgerDetail FunderOrderCardRight 完全一致
  const baseCur = order.interest_base_currency || 'USDT'; // 计息基数货币
  const rateCur = order.interest_rate_currency || 'USDT'; // 约定利息货币（决定主显示单位）
  const interestUnit = rateCur === 'CNY' ? '元' : 'U';
  const altUnit = rateCur === 'CNY' ? 'U' : '元';
  // 折算：计息基数和利息货币不一致时按实时汇率折算
  const convertAccrued = (val: number): number => {
    if (baseCur === rateCur) return val;
    if (baseCur === 'USDT' && rateCur === 'CNY') return val * cnyRate; // U计息基数，元显示
    if (baseCur === 'CNY' && rateCur === 'USDT') return val / cnyRate; // 元计息基数，U显示
    return val;
  };
  const convertAlt = (val: number): number => {
    if (rateCur === 'CNY') return val / cnyRate; // 主显示元，副显示U
    return val * cnyRate; // 主显示U，副显示元
  };

  // 已结利息
  const totalPaid = (order as any).paidTotal ? parseFloat((order as any).paidTotal.amount || '0') : 0;
  const displayAccrued = convertAccrued(accrued);
  const displayPaid = convertAccrued(totalPaid);
  const altAccrued = convertAlt(displayAccrued);
  const altPaid = convertAlt(displayPaid);

  // 持有时长——已结清订单冻结在 settled_at 时刻
  const holdDurationLabel = (() => {
    if (!order.buy_date) return null;
    if (order.status !== 'active' && !order.settled_at) return null;
    const endTs = order.settled_at ? new Date(order.settled_at).getTime() : Date.now();
    const elapsed = endTs - new Date(order.buy_date + 'T00:00:00').getTime();
    if (elapsed < 0) return null;
    const totalHours = Math.floor(elapsed / (1000 * 60 * 60));
    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;
    return days > 0 ? `${days}天 ${hours}小时` : `${hours}小时`;
  })();

  // 读取 display_config（与 LedgerDetail show() 函数一致：默认全部显示，除非明确设为 false）
  const dc: Record<string, boolean> | null = (() => {
    try {
      const raw = order.display_config;
      if (!raw) return null;
      return typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch { return null; }
  })();
  const show = (key: string) => dc ? (dc[key] !== false) : true;

  // 担保物
  let collateralAssets: { coin: string; qty: string; note?: string }[] = [];
  try {
    const rawCA = order.collateral_assets;
    if (rawCA) {
      const parsed = typeof rawCA === 'string' ? JSON.parse(rawCA) : rawCA;
      if (Array.isArray(parsed)) collateralAssets = parsed;
    }
  } catch {}
  let collateralValue = 0;
  let collateralValueKnown = true;
  const collateralItemValues: (number | null)[] = [];
  const collateralItemPrices: (number | null)[] = [];
  for (const item of collateralAssets) {
    const iq = parseFloat(item.qty);
    if (!item.coin || isNaN(iq)) { collateralItemValues.push(null); collateralItemPrices.push(null); collateralValueKnown = false; continue; }
    if (item.coin === 'USDT') { collateralValue += iq; collateralItemValues.push(iq); collateralItemPrices.push(1); }
    else if (item.coin === 'CNY') { const cv = iq / cnyRate; collateralValue += cv; collateralItemValues.push(cv); collateralItemPrices.push(1 / cnyRate); }
    else {
      const p = livePrices[item.coin];
      if (p) { collateralValue += iq * p; collateralItemValues.push(iq * p); collateralItemPrices.push(p); }
      else { collateralItemValues.push(null); collateralItemPrices.push(null); collateralValueKnown = false; }
    }
  }

  // 风险敞口
  const interestBaseNum = isInvited
    ? (order.participantInfo?.commissionBase ? parseFloat(order.participantInfo.commissionBase) : totalU)
    : (order.interest_base ? Number(order.interest_base) : totalU);
  const liveP = livePrices[order.coin] ?? null;
  const currentValue = liveP !== null ? liveP * qty : null;
  const floatPnl = currentValue !== null ? currentValue - interestBaseNum : null;
  const exposure = floatPnl !== null
    ? collateralValue + floatPnl - accrued + totalPaid
    : collateralValue - accrued + totalPaid;
  const isSufficient = exposure >= 0;

  return (
    <div
      className="bg-white rounded-2xl overflow-hidden relative"
      style={isInvited
        ? { border: '1px solid #86EFAC', boxShadow: '0 1px 6px rgba(34,197,94,0.08)' }
        : { border: '1px solid #E8EDFF', boxShadow: '0 1px 4px rgba(26,35,64,0.05)' }}
    >
      {isSettled && (
        <div className="absolute inset-0 pointer-events-none select-none flex items-center justify-center" style={{ backgroundColor: 'rgba(220,38,38,0.06)', zIndex: 10 }}>
          <div style={{ border: '3px solid rgba(220,38,38,0.35)', color: 'rgba(220,38,38,0.35)', borderRadius: '8px', padding: '8px 24px', fontSize: '28px', fontWeight: 800, letterSpacing: '6px', lineHeight: '1.4', whiteSpace: 'nowrap', transform: 'rotate(-15deg)' }}>已结清</div>
        </div>
      )}

      {/* 帽子：标签行 + 操作按钮 */}
      <div className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: '1px solid #F3F4F6', backgroundColor: isInvited ? '#F0FDF4' : '#FAFBFF' }}>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: coinColor }}>
            {order.coin}
          </span>
          {order.asset_type && show('assetType') && (
            <span className="text-xs px-1.5 py-0.5 font-medium" style={{ border: '1px solid #D1D5DB', borderRadius: '3px', color: '#1A1A1A' }}>
              {order.asset_type === 'stock' ? '股票' : '数字币'}
            </span>
          )}
          {isAdmin ? (
            <button
              onClick={() => setShowStatusSheet(true)}
              className="text-xs px-1.5 py-0.5 rounded-full font-medium transition-opacity hover:opacity-70"
              style={{ backgroundColor: `${statusColor}15`, color: statusColor }}
            >
              {statusLabel}
            </button>
          ) : (
            <span className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: `${statusColor}15`, color: statusColor }}>
              {statusLabel}
            </span>
          )}
          {isInvited && (
            <span className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: '#ECFDF5', color: '#059669', border: '1px solid #A7F3D0' }}>
              受邀
            </span>
          )}
          {show('showOwnerName') && (() => {
            const label = (order as any).owner_label || (() => {
              const m = (membersData as any[])?.find((m: any) => m.userId === order.user_id);
              return m ? (m.username || m.nickname) : null;
            })();
            if (!label) return null;
            return (
              <span className="text-xs font-medium px-1.5 py-0.5" style={{ border: '1px solid #D1D5DB', borderRadius: '3px', color: '#1A1A1A' }}>
                {label}
              </span>
            );
          })()}
          {(() => {
            try {
              const t = (order as any).tags;
              const tags: string[] = Array.isArray(t) ? t : (typeof t === 'string' && t ? JSON.parse(t) : []);
              return tags.map((tag, i) => (
                <span key={i} className="text-xs font-medium px-1.5 py-0.5" style={{ border: '1px solid #D1D5DB', borderRadius: '3px', color: '#1A1A1A' }}>
                  {tag}
                </span>
              ));
            } catch { return null; }
          })()}
        </div>
        <div className="flex items-center gap-0.5">
          {!isInvited && (
            <button
              onClick={() => handleOpenParticipants?.(order.id, order.interest_base || '')}
              className="px-2 py-1 text-xs rounded-lg font-medium transition-colors"
              style={{ backgroundColor: showParticipantsPanel === order.id ? '#059669' : '#ECFDF5', color: showParticipantsPanel === order.id ? '#fff' : '#059669' }}
            >
              参与方{order.participantCount > 0 ? ` ${order.participantCount}` : ''}
            </button>
          )}
          {!isInvited && (
            <button onClick={() => handleOpenEdit?.(order)} className="p-1.5 ml-1 text-gray-300 hover:text-blue-500 rounded-lg hover:bg-blue-50 transition-colors">
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
          {!isInvited && isAdmin && !isSettled && (
            <button
              onClick={() => setConfirmSettleId && setConfirmSettleId(order.id)}
              className="px-2 py-1 text-xs rounded-lg font-medium transition-colors"
              style={{ backgroundColor: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}
              title="标记为已结清"
            >
              结清
            </button>
          )}
          {!isInvited && isAdmin && (
            <button
              onClick={() => {
                if (!window.confirm('确认删除这张订单？')) return;
                if (!window.confirm('再次确认：订单将移入回收站，可随时恢复。确定删除？')) return;
                handleDelete?.(order.id);
              }}
              className="p-1.5 text-gray-300 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"
              title="删除订单（移入回收站）"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* 主体：左右两栏布局 */}
      <div className="flex">

        {/* 左栏：持有资产 */}
        <div className="flex-1 p-4 pr-3">
          <div className="flex items-center gap-0.5 mb-0.5">
            <span className="text-[10px] font-medium" style={{ color: isInvited ? '#16A34A' : '#3B82F6' }}>{isInvited ? '订单资产' : '持有资产'}</span>
          </div>
          <div className="min-h-9 flex flex-col justify-center">
            <div className="flex items-baseline gap-1 flex-wrap">
              <span className="text-2xl font-bold tabular-nums leading-tight" style={{ color: '#1A2340' }}>
                {order.asset_type === 'stock' ? (order.amount !== null && order.amount !== undefined && order.amount !== '' ? totalU.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '0') : (order.buy_quantity !== null && order.buy_quantity !== undefined && order.buy_quantity !== '' ? formatCoinQtyFunder(qty, order.coin) : '0')}
              </span>
              <span className="text-xs font-semibold" style={{ color: '#1A2340' }}>{order.coin}</span>
            </div>
            {order.asset_type === 'stock' ? (
              totalU > 0 && order.coin === 'CNY' && (
                <div className="text-xs font-medium leading-tight" style={{ color: '#4B5563' }}>≈{(totalU / 7).toLocaleString(undefined, { maximumFractionDigits: 0 })} U</div>
              )
            ) : (
              liveP && qty > 0 && (
                <div className="text-xs font-medium leading-tight" style={{ color: '#4B5563' }}>≈{(qty * liveP).toLocaleString(undefined, { maximumFractionDigits: 2 })} U</div>
              )
            )}
          </div>
          <div className="space-y-0.5 text-xs">
            {show('buyPrice') && price > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-gray-400 shrink-0">买入币价</span>
                <span className="font-medium" style={{ color: '#4B5563' }}>{price.toLocaleString()} U</span>
              </div>
            )}
            {show('buyValue') && totalU > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-gray-400 shrink-0">买入价值</span>
                <span className="font-medium" style={{ color: '#4B5563' }}>{totalU.toLocaleString(undefined, { maximumFractionDigits: 2 })} U</span>
              </div>
            )}
            {show('interestBase') && order.interest_base && parseFloat(order.interest_base) > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-gray-400 shrink-0">{isInvited ? '计佣基数' : '计息基数'}</span>
                <span className="font-medium" style={{ color: '#4B5563' }}>
                  {parseFloat(order.interest_base).toLocaleString(undefined, { maximumFractionDigits: 2 })} {interestUnit}
                </span>
              </div>
            )}
            {show('openPrice') && order.buy_price && parseFloat(order.buy_price) > 0 && order.coin !== 'CNY' && order.coin !== 'USDT' && (
              <div className="flex items-center justify-between">
                <span className="text-gray-400 shrink-0">开仓币价</span>
                <span className="font-medium" style={{ color: '#4B5563' }}>{parseFloat(order.buy_price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} U</span>
              </div>
            )}
            {show('todayPrice') && order.coin !== 'CNY' && order.coin !== 'USDT' && (
              <div className="flex items-center justify-between">
                <span className="text-gray-400 shrink-0">当前币价</span>
                {(() => {
                  const buyPrice = order.buy_price ? parseFloat(order.buy_price) : null;
                  let priceColor = '#4B5563';
                  if (liveP != null && buyPrice != null) {
                    if (liveP > buyPrice) priceColor = '#DC2626';
                    else if (liveP < buyPrice) priceColor = '#16A34A';
                  }
                  const dir = priceDirection?.[order.coin] ?? 'same';
                  return (
                    <span className="font-medium flex items-center gap-0.5" style={{ color: priceColor }}>
                      {dir === 'up' && <span className="text-[10px] inline-flex items-center self-center" style={{ color: '#DC2626', animation: 'price-blink 1.5s ease-in-out infinite', lineHeight: 1 }}>▲</span>}
                      {dir === 'down' && <span className="text-[10px] inline-flex items-center self-center" style={{ color: '#16A34A', animation: 'price-blink 1.5s ease-in-out infinite', lineHeight: 1 }}>▼</span>}
                      {liveP != null ? liveP.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' U' : '---'}
                    </span>
                  );
                })()}
              </div>
            )}
            {show('buyDate') && order.buy_date && (
              <div className="flex items-center justify-between">
                <span className="text-gray-400 shrink-0">开仓时间</span>
                <span className="font-medium" style={{ color: '#4B5563' }}>{order.buy_date}</span>
              </div>
            )}
            {show('holdDuration') && holdDurationLabel && (
              <div className="flex items-center justify-between">
                <span className="text-gray-400 shrink-0">持有时长</span>
                <span className="font-medium" style={{ color: '#4B5563' }}>{holdDurationLabel}</span>
              </div>
            )}
            {show('orderNo') && order.order_no && (
              <div className="flex items-center justify-between">
                <span className="text-gray-400 shrink-0">订单编号</span>
                <span className="font-mono" style={{ color: '#9CA3AF', letterSpacing: '0.05em' }}>{order.order_no}</span>
              </div>
            )}
            {order.interest_payment_type && show('interestPaymentType') && (
              <div className="flex items-center justify-between">
                <span className="text-gray-400 shrink-0">付息方式</span>
                <span className="font-medium" style={{ color: '#4B5563' }}>{getPaymentLabel?.(order.interest_payment_type) ?? order.interest_payment_type}</span>
              </div>
            )}
            {order.storage_account && (
              <div className="flex items-center justify-between">
                <span className="text-gray-400 shrink-0">存放账号</span>
                <span className="font-medium truncate ml-2" style={{ color: '#4B5563' }}>{order.storage_account}</span>
              </div>
            )}
          </div>
        </div>

        {/* 中间分隔线 */}
        <div className="w-px my-3" style={{ backgroundColor: '#E8EFFF' }} />

        {/* 右栏：待结利息 */}
        <div className="p-4 pl-3 flex flex-col shrink-0" style={{ width: 'auto', minWidth: '160px', maxWidth: '200px' }}>
          <div className="flex items-center gap-1 mb-0.5 relative" style={{ height: '16px' }}>
            <span className="text-[10px]" style={{ color: '#3B82F6' }}>{isInvited ? '待结佣金' : '待结利息'}</span>
            {rateAbs && <span className="text-[10px] text-gray-400">(年化 {rateAbs}%)</span>}
            <button
              ref={tipBtnRef}
              type="button"
              onClick={() => {
                if (!showInterestTip && tipBtnRef.current) {
                  const rect = tipBtnRef.current.getBoundingClientRect();
                  setTipPos({ bottom: window.innerHeight - rect.top + 6, right: window.innerWidth - rect.right });
                }
                setShowInterestTip(v => !v);
              }}
              className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] font-bold leading-none flex-shrink-0"
              style={{ backgroundColor: '#E5E7EB', color: '#6B7280' }}
            >?</button>
            {showInterestTip && (() => {
              const startDate = (isInvited ? order.participantInfo?.commissionStartDate : order.interest_start_date) ? String(isInvited ? order.participantInfo.commissionStartDate : order.interest_start_date).slice(0, 10) : null;
              const todayStr = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
              const _tipEndTs = order.settled_at ? new Date(order.settled_at).getTime() : Date.now();
              const elapsedMs = startDate ? Math.max(0, _tipEndTs - new Date(startDate + 'T00:00:00').getTime()) : 0;
              const elapsedDays = Math.floor(elapsedMs / (1000 * 60 * 60 * 24));
              const elapsedHours = Math.floor((elapsedMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
              const elapsedMins = Math.floor((elapsedMs % (1000 * 60 * 60)) / (1000 * 60));
              const elapsedSecs = Math.floor(elapsedMs / 1000);
              const elapsedLabel = elapsedDays > 0
                ? `${elapsedDays}天 ${elapsedHours}小时 ${elapsedMins}分`
                : `${elapsedHours}小时 ${elapsedMins}分`;
              const base = order.interest_base ? parseFloat(order.interest_base) : 0;
              const rate = order.interest_rate_annual ? parseFloat(order.interest_rate_annual) : 0;
              const altAccruedTip = convertAlt(displayAccrued);
              const baseCurLabel = baseCur === 'CNY' ? '元' : 'U';
              return (
                <div className="fixed inset-0 z-[200] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={() => setShowInterestTip(false)}>
                  <div className="rounded-2xl p-5 mx-4 w-full max-w-xs" style={{ background: '#fff', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }} onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-bold" style={{ color: '#1A2340' }}>计息说明</span>
                      <button onClick={() => setShowInterestTip(false)} className="text-gray-400 text-lg leading-none">×</button>
                    </div>
                    <div className="text-xs space-y-2.5" style={{ color: '#4B5563' }}>
                      <div className="p-2.5 rounded-lg" style={{ background: '#F0F4FF' }}>
                        <div className="font-semibold mb-1" style={{ color: '#1A2340' }}>① 计息时间</div>
                        <div className="space-y-1">
                          <div className="flex justify-between"><span>开始日期</span><span className="font-mono font-medium">{startDate || '--'}</span></div>
                          <div className="flex justify-between"><span>当前日期</span><span className="font-mono font-medium">{todayStr}</span></div>
                          <div className="flex justify-between"><span>已过时间</span><span className="font-mono font-medium">{elapsedLabel}</span></div>
                        </div>
                      </div>
                      <div className="p-2.5 rounded-lg" style={{ background: '#F0F4FF' }}>
                        <div className="font-semibold mb-1" style={{ color: '#1A2340' }}>② 计算公式</div>
                        <div>计息基数 × 年化利率 ÷ 365天 ÷ 24小时 ÷ 60分 ÷ 60秒 × 已过秒数</div>
                        <div className="mt-1 font-mono">
                          <span style={{ color: '#3B82F6' }}>{base.toLocaleString()}{baseCurLabel} × {rate}% ÷ 365天 ÷ 24小时 ÷ 60分 ÷ 60秒 × {elapsedSecs.toLocaleString()}秒</span>
                        </div>
                      </div>
                      <div className="p-2.5 rounded-lg" style={{ background: '#F0F4FF' }}>
                        <div className="font-semibold mb-1" style={{ color: '#1A2340' }}>③ 计息结果</div>
                        <div className="font-mono flex items-baseline gap-1">
                          <span style={{ color: '#DC2626', fontSize: '1.5em', fontWeight: 700 }}>= {displayAccrued.toFixed(6)} {interestUnit}</span>
                        </div>
                        <div className="mt-1 font-mono" style={{ color: '#DC2626', fontSize: '1.5em', fontWeight: 700 }}>≈ {altAccruedTip.toFixed(2)} {altUnit}</div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
          <div className="min-h-9 flex flex-col justify-center">
            <div className="flex items-baseline gap-0.5">
              <span className="text-2xl font-bold tabular-nums leading-tight" style={{ color: isInvited ? '#1A2340' : (displayAccrued === 0 ? '#1A2340' : (isNegRate ? '#059669' : '#DC2626')), fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
                {isInvited ? '' : (displayAccrued === 0 ? '' : (isNegRate ? '-' : '+'))}{displayAccrued.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="text-xs font-semibold" style={{ color: '#1A2340' }}>{interestUnit}</span>
            </div>
            <div className="text-xs font-medium leading-tight" style={{ color: '#4B5563' }}>≈{altAccrued.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {altUnit}</div>
          </div>
          <div className="space-y-0.5 text-xs">
            {show('paidInterest') && (
            <>
            <div className="flex items-center justify-between">
              <span className="whitespace-nowrap">{isInvited ? '已结佣金' : '已结利息'}</span>
              <span className="font-medium" style={{ color: '#4B5563' }}>
                {displayPaid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {interestUnit}
              </span>
            </div>
            {displayPaid > 0 && (
              <div className="flex justify-end">
                <span className="text-gray-400">≈{altPaid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {altUnit}</span>
              </div>
            )}
            </>
            )}
            {show('interestStartDate') && (isInvited ? order.participantInfo?.commissionStartDate : order.interest_start_date) && (
              <div className="flex items-center justify-between">
                <span className="text-gray-400">{isInvited ? '计佣日期' : '计息日期'}</span>
                <span className="font-medium" style={{ color: '#4B5563' }}>
                  {String(isInvited ? order.participantInfo.commissionStartDate : order.interest_start_date).slice(0, 10)}
                </span>
              </div>
            )}
            {show('interestDuration') && order.interest_start_date && (order.status === 'active' || order.settled_at) && (() => {
              const endTs = order.settled_at ? new Date(order.settled_at).getTime() : Date.now();
              const elapsed = endTs - new Date(String(order.interest_start_date).slice(0, 10) + 'T00:00:00').getTime();
              if (elapsed < 0) return null;
              const totalHours = Math.floor(elapsed / (1000 * 60 * 60));
              const days = Math.floor(totalHours / 24);
              const hours = totalHours % 24;
              const label = days > 0 ? `${days}天 ${hours}小时` : `${hours}小时`;
              return (
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">计息时长</span>
                  <span className="font-medium" style={{ color: '#4B5563' }}>{label}</span>
                </div>
              );
            })()}
            {/* 担保货币（与 LedgerDetail 前端完全一致：受 display_config 开关控制） */}
            {show('collateralCoin') && (
              orderShareMode === 'self'
                ? (
                  // 开启了共享担保：标题改为红色“共享担保”
                  collateralAssets.length === 0
                    ? (
                      <div className="flex items-center justify-between text-xs mt-0.5">
                        <span className="font-semibold" style={{ color: '#A80000' }}>共享担保</span>
                        <span className="text-xs" style={{ color: '#A80000' }}>共享担保物</span>
                      </div>
                    )
                    : collateralAssets.map((a, idx) => (
                      <div key={idx}>
                        <div className="flex items-center justify-between mt-0.5">
                          <span className="font-semibold" style={{ color: '#A80000' }}>{collateralAssets.length > 1 ? `共享担保${idx + 1}` : '共享担保'}</span>
                          <span className="font-medium" style={{ color: '#4B5563' }}>{parseFloat(a.qty).toLocaleString()} {a.coin}</span>
                        </div>
                        {collateralItemValues[idx] !== null && collateralItemValues[idx] !== undefined && (
                          <div className="flex items-center justify-between mt-0.5">
                            <span></span>
                            <span className="font-medium" style={{ color: '#4B5563' }}>≈ {(collateralItemValues[idx] as number).toLocaleString(undefined, { maximumFractionDigits: 2 })} U</span>
                          </div>
                        )}
                      </div>
                    ))
                )
                : (
                  // 未开启共享：原有逻辑
                  collateralAssets.length === 0
                    ? (
                      <div className="flex items-center justify-between text-xs mt-0.5">
                        <span className="text-gray-400">担保货币</span>
                        <span className="font-medium" style={{ color: '#4B5563' }}>0</span>
                      </div>
                    )
                    : collateralAssets.map((a, idx) => (
                      <div key={idx}>
                        <div className="flex items-center justify-between mt-0.5">
                          <span className="text-gray-400">{collateralAssets.length > 1 ? `担保货币${idx + 1}` : '担保货币'}</span>
                          <span className="font-medium" style={{ color: '#4B5563' }}>{parseFloat(a.qty).toLocaleString()} {a.coin}</span>
                        </div>
                        {collateralItemValues[idx] !== null && collateralItemValues[idx] !== undefined && (
                          <div className="flex items-center justify-between mt-0.5">
                            <span></span>
                            <span className="font-medium" style={{ color: '#4B5563' }}>≈ {(collateralItemValues[idx] as number).toLocaleString(undefined, { maximumFractionDigits: 2 })} U</span>
                          </div>
                        )}
                      </div>
                    ))
                )
            )}
            {show('collateralValue') && (
              <div className="flex items-center justify-between">
                <span className={orderShareMode === 'self' ? 'font-semibold' : 'text-gray-400'} style={{ color: orderShareMode === 'self' ? '#A80000' : undefined }}>{collateralAssets.length > 1 ? '共享担保总値' : (orderShareMode === 'self' ? '共享担保价値' : '担保价値')}</span>
                <span className="font-medium" style={{ color: '#4B5563' }}>{collateralValue.toLocaleString(undefined, { maximumFractionDigits: 2 })} U</span>
              </div>
            )}
            {show('collateral') && (
              <>
              {showCollateralInfo && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={() => setShowCollateralInfo(false)}>
                  <div className="rounded-2xl p-5 mx-4 w-full max-w-xs" style={{ background: '#fff', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }} onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-bold" style={{ color: '#1A2340' }}>担保缺口计算说明</span>
                      <button onClick={() => setShowCollateralInfo(false)} className="text-gray-400 text-lg leading-none">×</button>
                    </div>
                    <div className="text-xs space-y-2.5" style={{ color: '#4B5563' }}>
                      <div className="p-2.5 rounded-lg" style={{ background: '#F0F4FF' }}>
                        <div className="font-semibold mb-1" style={{ color: '#1A2340' }}>① 浮动盈亏</div>
                        <div>= 当前市值 - 计息基数（正数为浮盈，负数为亏损）</div>
                        <div className="mt-1 font-mono">
                          {floatPnl !== null
                            ? <><span style={{ color: '#3B82F6' }}>= {currentValue!.toFixed(2)} - {interestBaseNum.toFixed(2)} = </span><strong style={{ color: floatPnl >= 0 ? '#DC2626' : '#16A34A' }}>{floatPnl >= 0 ? '+' : ''}{floatPnl.toFixed(2)} U{floatPnl >= 0 ? '（浮盈）' : '（亏损）'}</strong></>
                            : <span className="text-gray-400">当前市值暂无实时价格，暂无法计算浮动盈亏</span>
                          }
                        </div>
                      </div>
                      <div className="p-2.5 rounded-lg" style={{ background: '#F0F4FF' }}>
                        <div className="font-semibold mb-1" style={{ color: '#1A2340' }}>② 担保价值</div>
                        {collateralAssets.length === 0
                          ? <div className="font-mono mt-1" style={{ color: '#9CA3AF' }}>0.00 U（无担保物）</div>
                          : <>
                              {collateralAssets.map((a, idx) => {
                                const itemVal = collateralItemValues[idx];
                                return (
                                  <div key={idx} className="mt-1 flex justify-between">
                                    <span className="font-mono" style={{ color: '#6B7280' }}>{a.qty} {a.coin}</span>
                                    {itemVal !== null
                                      ? <span className="font-mono font-semibold" style={{ color: '#3B82F6' }}>{itemVal.toFixed(2)} U</span>
                                      : <span className="font-mono" style={{ color: '#D1D5DB' }}>暂无实时价</span>
                                    }
                                  </div>
                                );
                              })}
                              {collateralAssets.length > 1 && (
                                <div className="font-mono mt-1 pt-1 font-semibold" style={{ borderTop: '1px solid #D1D5DB', color: '#1A2340' }}>
                                  合计 {collateralValue.toFixed(2)} U
                                </div>
                              )}
                            </>
                        }
                      </div>
                      <div className="p-2.5 rounded-lg" style={{ background: isSufficient ? '#FFF1F1' : '#F0FDF4' }}>
                        <div className="font-semibold mb-1" style={{ color: isSufficient ? '#DC2626' : '#16A34A' }}>③ 风险敞口</div>
                        <div>担保物 + 浮动盈亏 − 待结利息 + 已结利息（正数充足，负数缺口）</div>
                        <div className="mt-1 font-mono">
                          {floatPnl !== null
                            ? <span style={{ color: '#3B82F6' }}>= {collateralValue.toFixed(2)} + ({floatPnl >= 0 ? '+' : ''}{floatPnl.toFixed(2)}) − {accrued.toFixed(2)} + {totalPaid.toFixed(2)} = <strong style={{ color: isSufficient ? '#DC2626' : '#16A34A' }}>{exposure >= 0 ? '+' : ''}{exposure.toFixed(2)} U</strong></span>
                            : <span style={{ color: '#3B82F6' }}>= {collateralValue.toFixed(2)} + ---（暂无实时价） − {accrued.toFixed(2)} + {totalPaid.toFixed(2)} = <strong style={{ color: isSufficient ? '#DC2626' : '#16A34A' }}>{exposure >= 0 ? '+' : ''}{exposure.toFixed(2)} U</strong></span>
                          }
                        </div>
                        <div className="mt-1.5" style={{ color: isSufficient ? '#DC2626' : '#16A34A' }}>
                          {isSufficient
                            ? `担保物充足，还有 ${exposure.toFixed(2)} U 的余量空间`
                            : `担保物不足，还需补充 ${Math.abs(exposure).toFixed(2)} U 才能覆盖风险`
                          }
                        </div>
                      </div>
                      {/* 共享担保池汇总（当订单开启了本人订单共享时显示） */}
                      {orderShareMode === 'self' && (
                        <div className="p-2.5 rounded-lg" style={{ background: '#FFF7ED', border: '1px solid #FED7AA' }}>
                          <div className="font-semibold mb-1.5 text-xs" style={{ color: '#C2410C' }}>
                            共享担保池（共 {(sharedPoolInfo as any)?.orderCount ?? 0} 张订单参与）
                          </div>
                          {sharedPoolInfo ? (
                            <>
                              <div className="space-y-1.5">
                                {((sharedPoolInfo as any).orders ?? []).map((o: any) => (
                                  <div key={o.orderId} className="text-xs">
                                    <div className="flex justify-between items-center">
                                      <span className="font-mono text-gray-700 font-medium">{o.orderNo}</span>
                                      <span className="text-gray-500">{o.coin}</span>
                                    </div>
                                    <div className="flex justify-between items-center mt-0.5">
                                      <span className="text-gray-400">融资 {o.principal.toFixed(0)} U</span>
                                      <span style={{ color: o.collateralGap >= 0 ? '#16A34A' : '#DC2626' }}>
                                        缺口 {o.collateralGap >= 0 ? '+' : ''}{o.collateralGap.toFixed(0)} U
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                              <div className="mt-2 pt-1.5 flex justify-between text-xs font-semibold" style={{ borderTop: '1px solid #FED7AA' }}>
                                <span style={{ color: '#C2410C' }}>共享池合计</span>
                                <div className="text-right">
                                  <div className="text-blue-700">担保物 {((sharedPoolInfo as any).totalCollateralValue ?? 0).toFixed(0)} U</div>
                                  <div style={{ color: ((sharedPoolInfo as any).totalGap ?? 0) >= 0 ? '#16A34A' : '#DC2626' }}>
                                    缺口 {((sharedPoolInfo as any).totalGap ?? 0) >= 0 ? '+' : ''}{((sharedPoolInfo as any).totalGap ?? 0).toFixed(0)} U
                                  </div>
                                </div>
                              </div>
                            </>
                          ) : (
                            <div className="text-xs text-gray-400">加载中...</div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-0.5">
                  <span className="text-gray-400">担保缺口</span>
                  <button
                    onClick={e => { e.stopPropagation(); setShowCollateralInfo(true); }}
                    className="w-3.5 h-3.5 rounded-full flex items-center justify-center flex-shrink-0 text-[9px] font-bold leading-none"
                    style={{ backgroundColor: '#E5E7EB', color: '#6B7280', border: 'none', cursor: 'pointer', lineHeight: 1 }}
                  >?</button>
                </div>
                <span className="font-medium" style={{ color: isSufficient ? '#4B5563' : '#16A34A' }}>
                  {isSufficient ? '100%' : `-${(Math.abs(exposure)).toLocaleString(undefined, { maximumFractionDigits: 2 })} U`}
                </span>
              </div>
              {/* 保证金率：(担保物市值 + 浮动盈亏 - 应付利息 + 已付利息) ÷ 计息基数 × 100% */}
              {show('marginRate') && collateralValueKnown && collateralAssets.length > 0 && interestBaseNum > 0 && (() => {
                const effectiveCollateral = floatPnl !== null
                  ? collateralValue + floatPnl - accrued + totalPaid
                  : collateralValue - accrued + totalPaid;
                const marginRatio = effectiveCollateral / interestBaseNum;
                const marginColor = marginRatio >= 1 ? '#16A34A' : marginRatio >= 0.5 ? '#D97706' : '#DC2626';
                const alertThreshold = (dc && typeof (dc as any).marginAlertThreshold === 'number') ? (dc as any).marginAlertThreshold as number : null;
                const isAlerting = alertThreshold !== null && (marginRatio * 100) < alertThreshold;
                return (
                  <>
                    <div className="flex items-center justify-between mt-0.5">
                      <div className="flex items-center gap-1">
                        <span className="text-gray-400">保证金率</span>
                        {isAlerting && (
                          <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full text-white text-[8px] font-bold flex-shrink-0 animate-pulse" style={{ background: '#EF4444', lineHeight: 1 }}>❗</span>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); setShowMarginInfo(true); }}
                          className="w-3.5 h-3.5 rounded-full flex items-center justify-center flex-shrink-0 text-[9px] font-bold leading-none"
                          style={{ backgroundColor: '#E5E7EB', color: '#6B7280', border: 'none', cursor: 'pointer', lineHeight: 1 }}
                        >?</button>
                      </div>
                      <span className="font-bold" style={{ color: isAlerting ? '#EF4444' : marginColor }}>{(marginRatio * 100).toFixed(1)}%{isAlerting ? ' ⚠' : ''}</span>
                    </div>
                    {showMarginInfo && (
                      <div className="fixed inset-0 z-[200] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={() => setShowMarginInfo(false)}>
                        <div className="rounded-2xl p-5 mx-4 w-full max-w-xs" style={{ background: '#fff', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }} onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-sm font-bold" style={{ color: '#1A2340' }}>保证金率计算说明</span>
                            <button onClick={() => setShowMarginInfo(false)} className="text-gray-400 text-lg leading-none">×</button>
                          </div>
                          <div className="text-xs space-y-2.5" style={{ color: '#4B5563' }}>
                            <div className="p-2.5 rounded-lg" style={{ background: '#F0F4FF' }}>
                              <div className="font-semibold mb-1" style={{ color: '#1A2340' }}>① 公式</div>
                              <div>保证金率 = (担保物市值 + 浮动盈亏 - 应付利息 + 已付利息) ÷ 计息基数 × 100%</div>
                              <div className="mt-1 font-mono text-[10px]">
                                <span style={{ color: '#3B82F6' }}>= ({collateralValue.toFixed(2)}{floatPnl !== null ? ` + (${floatPnl >= 0 ? '+' : ''}${floatPnl.toFixed(2)})` : ''} − {accrued.toFixed(2)} + {totalPaid.toFixed(2)}) ÷ {interestBaseNum.toFixed(2)} × 100% = </span>
                                <strong style={{ color: marginColor }}>{(marginRatio * 100).toFixed(1)}%</strong>
                              </div>
                            </div>
                            <div className="p-2.5 rounded-lg" style={{ background: '#F0F4FF' }}>
                              <div className="font-semibold mb-1" style={{ color: '#1A2340' }}>② 担保物当前市值</div>
                              {collateralAssets.map((a, idx) => {
                                const itemVal = collateralItemValues[idx];
                                return (
                                  <div key={idx} className="mt-1 flex justify-between">
                                    <span className="font-mono" style={{ color: '#6B7280' }}>{a.qty} {a.coin}</span>
                                    {itemVal !== null
                                      ? <span className="font-mono font-semibold" style={{ color: '#3B82F6' }}>{(itemVal as number).toFixed(2)} U</span>
                                      : <span className="font-mono" style={{ color: '#D1D5DB' }}>暂无实时价</span>
                                    }
                                  </div>
                                );
                              })}
                              {collateralAssets.length > 1 && (
                                <div className="font-mono mt-1 pt-1 font-semibold" style={{ borderTop: '1px solid #D1D5DB', color: '#1A2340' }}>
                                  合计 {collateralValue.toFixed(2)} U
                                </div>
                              )}
                            </div>
                            <div className="p-2.5 rounded-lg" style={{ background: marginRatio >= 1 ? '#F0FDF4' : marginRatio >= 0.5 ? '#FFFBEB' : '#FFF1F1' }}>
                              <div className="font-semibold mb-1" style={{ color: marginRatio >= 1 ? '#16A34A' : marginRatio >= 0.5 ? '#D97706' : '#DC2626' }}>③ 风险评估</div>
                              <div className="space-y-1">
                                <div className="flex items-center gap-1.5"><span style={{ color: '#16A34A' }}>≥ 100%</span><span>担保充足，风险可控</span></div>
                                <div className="flex items-center gap-1.5"><span style={{ color: '#D97706' }}>50% ~ 100%</span><span>担保偏低，建议补充</span></div>
                                <div className="flex items-center gap-1.5"><span style={{ color: '#DC2626' }}>&lt; 50%</span><span>担保严重不足，高风险</span></div>
                              </div>
                              <div className="mt-2 font-semibold" style={{ color: marginRatio >= 1 ? '#16A34A' : marginRatio >= 0.5 ? '#D97706' : '#DC2626' }}>
                                当前状态：{marginRatio >= 1 ? '担保充足' : marginRatio >= 0.5 ? '担保偏低，建议补充' : '担保严重不足，高风险'}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
              </>
            )}
            {/* 担保资产：仅股票类（金色）且出利息方（非受邀方）才显示 */}
            {order.asset_type === 'stock' && !isInvited && (
              <div className="flex items-center justify-between mt-1">
                <span className="flex items-center gap-1">
                  <span className="text-gray-400 whitespace-nowrap">担保资产</span>
                  <button
                    type="button"
                    className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] font-bold leading-none flex-shrink-0"
                    style={{ backgroundColor: '#DBEAFE', color: '#3B82F6' }}
                    title="担保资产"
                  >!</button>
                </span>
                <span className="font-medium" style={{ color: '#9CA3AF' }}>暂无</span>
              </div>
            )}
            {/* 收益分成（受 display_config.profitShare 开关控制；解析 commission_share 文本拿类型与比例） */}
            {show('profitShare') && order.show_profit_share && order.commission_share && (() => {
              const cs = String(order.commission_share);
              const isCoin = cs.includes('币种收益') || cs.includes('利润分成');
              const typeLabel = isCoin ? '利润分成' : '利息分成';
              const ratioMatch = cs.match(/(\d+(?:\.\d+)?)/);
              const ratioNum = ratioMatch ? parseFloat(ratioMatch[1]) : 0;
              const ratio = ratioNum / 100;
              // 待分金额：利息分成 = 本金(计息基数)×比例；利润分成 = 浮动利润×比例
              let shareAmt: number | null = null;
              if (!isCoin) {
                if (interestBaseNum > 0 && ratio > 0) shareAmt = interestBaseNum * ratio;
              } else {
                if (liveP != null && price > 0 && qty > 0 && ratio > 0) {
                  shareAmt = Math.max(0, liveP - price) * qty * ratio;
                }
              }
              return (
                <div className="border-t mt-1 pt-1" style={{ borderColor: '#E8EFFF' }}>
                  <div className="h-4 flex items-center" style={{ color: '#3B82F6' }}>
                    <span className="text-xs font-medium">收益分成</span>
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <span className="text-gray-400 shrink-0">分成类型</span>
                    <span className="font-medium" style={{ color: '#4B5563' }}>{typeLabel}</span>
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <span className="text-gray-400 shrink-0">分成比例</span>
                    <span className="font-medium" style={{ color: '#4B5563' }}>{ratioNum > 0 ? `${ratioNum}%` : '---'}</span>
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <span className="text-gray-400 shrink-0">待分金额</span>
                    <span className="font-medium" style={{ color: '#4B5563' }}>{shareAmt != null ? `≈ ${shareAmt.toLocaleString(undefined, { maximumFractionDigits: 2 })} U` : '---'}</span>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      </div>

      {/* 内部备注 */}
      {order.admin_note && (
        <div className="px-4 pb-2 text-xs text-gray-400 border-t border-gray-100 pt-2">
          内部备注：{order.admin_note}
        </div>
      )}

      {/* 参与方面板 */}
      {showParticipantsPanel === order.id && (
        <div className="px-4 pt-3 pb-3 border-t border-green-100">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs font-semibold text-green-700 flex items-center gap-1">
              <Users2 className="w-3.5 h-3.5" />
              多视角订单参与方
            </div>
            {participantsEditMode ? (
              <div className="flex gap-1">
                {roleOptions.map(r => (
                  <button
                    key={r.value}
                    onClick={() => handleAddParticipant?.(r.value)}
                    className="px-2 py-0.5 text-xs rounded-full font-medium border"
                    style={{ borderColor: r.color, color: r.color, backgroundColor: `${r.color}10` }}
                  >
                    +{r.label}
                  </button>
                ))}
              </div>
            ) : (
              <button
                onClick={() => setParticipantsEditMode?.(true)}
                className="px-2.5 py-0.5 text-xs rounded-full font-medium border flex items-center gap-1"
                style={{ borderColor: '#059669', color: '#059669', backgroundColor: '#ECFDF5' }}
              >
                <Pencil className="w-3 h-3" />编辑
              </button>
            )}
          </div>
          {participantsLoading ? (
            <div className="text-center py-3 text-xs text-gray-400">加载中...</div>
          ) : !participantsEditMode ? (
            /* 只读态：展示已保存的参与方（成员、角色、利率%、收/付） */
            participantsList.length === 0 ? (
              <div className="text-center py-3 text-xs text-gray-400 bg-gray-50 rounded-xl">暂无参与方配置</div>
            ) : (
              <div className="space-y-2">
                {participantsList.map((p, idx) => {
                  const roleOpt = roleOptions.find(r => r.value === p.role);
                  const rateNum = parseFloat(p.rate || '');
                  const hasRate = isFinite(rateNum);
                  const isNeg = hasRate && rateNum < 0;
                  const absVal = hasRate ? Math.abs(rateNum) : null;
                  return (
                    <div key={idx} className="bg-white border border-gray-100 rounded-xl px-3 py-2 flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: roleOpt?.color || '#6B7280' }} />
                        <span className="text-xs font-medium text-gray-700 truncate">{p.displayName || `用户${p.userId}`}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0" style={{ backgroundColor: `${roleOpt?.color}18`, color: roleOpt?.color }}>{roleOpt?.label || p.role}</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {hasRate ? (
                          <>
                            <span className="text-xs font-semibold tabular-nums" style={{ color: isNeg ? '#059669' : '#DC2626' }}>{absVal}%</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded-md font-semibold" style={isNeg ? { backgroundColor: '#ECFDF5', color: '#059669' } : { backgroundColor: '#FEF2F2', color: '#DC2626' }}>{isNeg ? '付' : '收'}</span>
                          </>
                        ) : (
                          <span className="text-[10px] text-gray-400">未设利率</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : participantsList.length === 0 ? (
            <div className="text-center py-3 text-xs text-gray-400 bg-gray-50 rounded-xl">
              暂无参与方配置，点击上方按钮添加
            </div>
          ) : (
            <div className="space-y-2">
              {participantsList.map((p, idx) => {
                const roleOpt = roleOptions.find(r => r.value === p.role)!;
                const rateNum = parseFloat(p.rate || '');
                const isNeg = isFinite(rateNum) && rateNum < 0;
                const absVal = isFinite(rateNum) ? Math.abs(rateNum) : '';
                const setRate = (nextAbs: string, neg: boolean) => {
                  const v = nextAbs.toString().trim();
                  if (v === '') {
                    setParticipantsList?.(list => list.map((item, i) => i === idx ? { ...item, rate: '' } : item));
                    return;
                  }
                  const num = Math.abs(parseFloat(v) || 0);
                  const signed = neg ? -num : num;
                  setParticipantsList?.(list => list.map((item, i) => i === idx ? { ...item, rate: String(signed) } : item));
                };
                return (
                  <div key={idx} className="bg-gray-50 rounded-xl px-2 py-1.5 flex items-center gap-1.5">
                    {/* 角色小点 */}
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: roleOpt?.color || '#6B7280' }} title={roleOpt?.label || p.role} />
                    {/* 成员选择 */}
                    <select
                      value={p.userId}
                      onChange={e => {
                        const uid = Number(e.target.value);
                        const member = ledgerMembers.find(m => m.userId === uid);
                        setParticipantsList?.(list => list.map((item, i) => i === idx ? { ...item, userId: uid, displayName: member?.displayName || '' } : item));
                      }}
                      className="min-w-0 flex-1 px-1.5 py-1 text-xs border border-gray-200 rounded-md bg-white"
                    >
                      <option value={0}>选成员</option>
                      {ledgerMembers.map(m => (
                        <option key={m.userId} value={m.userId}>{m.displayName}</option>
                      ))}
                    </select>
                    {/* 利率输入 */}
                    <div className="flex items-center w-16 shrink-0 px-1.5 py-1 border border-gray-200 rounded-md bg-white">
                      <input
                        type="number"
                        step="0.01"
                        value={absVal}
                        onChange={e => setRate(e.target.value, isNeg)}
                        placeholder="利率"
                        className="w-full min-w-0 text-xs outline-none bg-transparent"
                      />
                      <span className="text-[10px] text-gray-400 shrink-0">%</span>
                    </div>
                    {/* 收/付息切换 */}
                    <button
                      type="button"
                      onClick={() => setRate(String(absVal || ''), false)}
                      className="px-1.5 py-1 rounded-md text-[11px] font-semibold border shrink-0"
                      style={!isNeg ? { backgroundColor: '#FEF2F2', color: '#DC2626', borderColor: '#FCA5A5' } : { backgroundColor: '#fff', color: '#9CA3AF', borderColor: '#E5E7EB' }}
                    >收</button>
                    <button
                      type="button"
                      onClick={() => setRate(String(absVal || ''), true)}
                      className="px-1.5 py-1 rounded-md text-[11px] font-semibold border shrink-0"
                      style={isNeg ? { backgroundColor: '#ECFDF5', color: '#059669', borderColor: '#6EE7B7' } : { backgroundColor: '#fff', color: '#9CA3AF', borderColor: '#E5E7EB' }}
                    >付</button>
                    {/* 删除 */}
                    <button
                      onClick={() => setParticipantsList?.(list => list.filter((_, i) => i !== idx))}
                      className="p-0.5 text-gray-300 hover:text-red-400 shrink-0"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          {participantsEditMode && (
            <button
              onClick={() => handleSaveParticipants?.(order.id)}
              disabled={saveParticipantsMutation?.isPending}
              className="mt-3 w-full py-2 rounded-xl text-xs font-semibold text-white disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #059669, #10B981)' }}
            >
              {saveParticipantsMutation?.isPending ? '保存中...' : '保存参与方配置'}
            </button>
          )}
        </div>
      )}

      {/* 结息面板 + 备注区 */}
      <div className="px-4 pt-3 pb-3 border-t border-blue-100">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium" style={{ color: '#1A2340' }}>
            {isInvited ? '已结佣金' : '已结利息'}：<span style={{ color: '#16A34A' }}>{displayPaid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {interestUnit}</span>
          </span>
          <button
            onClick={() => { setShowPaymentPanel?.(showPaymentPanel === order.id ? null : order.id); setPaymentForm?.(() => ({ amount: '', currency: 'U', exchangeRate: '7.0', payDate: new Date().toISOString().slice(0, 10), note: '' })); }}
            className="text-xs px-3 py-1 rounded-full font-medium"
            style={{ backgroundColor: '#EEF4FF', color: '#1A56DB' }}
          >
            {showPaymentPanel === order.id ? '收起' : '+ 记录结息'}
          </button>
        </div>

        {showPaymentPanel === order.id && (
          <div className="bg-blue-50 rounded-xl p-3 mb-3 space-y-2">
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">结息金额 ({interestUnit})</label>
                <input
                  type="number"
                  inputMode="decimal"
                  value={paymentForm.amount}
                  onChange={e => setPaymentForm?.((f: any) => ({ ...f, amount: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                  placeholder="如：500"
                  style={{ display: 'block', boxSizing: 'border-box' }}
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">结息日期</label>
                <div className="relative">
                  <button
                    onClick={() => setShowPaymentDatePicker?.((v: boolean) => !v)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-left focus:outline-none"
                    style={{ backgroundColor: '#fff', color: paymentForm.payDate ? '#1A2340' : '#9CA3AF', display: 'block', boxSizing: 'border-box' }}
                  >
                    {paymentForm.payDate || '选择日期'}
                  </button>
                  {showPaymentDatePicker && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.3)' }} onClick={() => setShowPaymentDatePicker?.(false)}>
                      <div className="bg-white rounded-xl shadow-2xl mx-4 w-full" style={{ maxWidth: 320 }} onClick={e => e.stopPropagation()}>
                        <DatePicker value={paymentForm.payDate} onChange={v => { setPaymentForm?.((f: any) => ({ ...f, payDate: v })); setShowPaymentDatePicker?.(false); }} />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">备注（可选）</label>
              <input
                type="text"
                value={paymentForm.note}
                onChange={e => setPaymentForm?.((f: any) => ({ ...f, note: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                placeholder="结息说明"
                style={{ display: 'block', boxSizing: 'border-box' }}
              />
            </div>
            <button
              onClick={() => {
                if (!paymentForm.amount || parseFloat(paymentForm.amount) <= 0) { toast.error('请填写结息金额'); return; }
                addPaymentMutation?.mutate({ ledgerId, orderId: order.id, amount: parseFloat(paymentForm.amount), currency: paymentForm.currency || 'U', exchangeRate: parseFloat(paymentForm.exchangeRate || '7.0'), payDate: paymentForm.payDate || new Date().toISOString().slice(0, 10), note: paymentForm.note || undefined });
              }}
              disabled={addPaymentMutation?.isPending}
              className="w-full py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #1A56DB, #3B82F6)' }}
            >
              {addPaymentMutation?.isPending ? '提交中...' : '确认记录'}
            </button>
          </div>
        )}

        {showPaymentPanel === order.id && Array.isArray(interestPayments) && interestPayments.length > 0 && (
          <div className="space-y-1.5">
            {interestPayments.map((p: any) => (
              <div key={p.id} className="flex items-center justify-between text-xs bg-gray-50 rounded-lg px-3 py-2">
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  <span className="font-medium" style={{ color: '#16A34A' }}>+{parseFloat(p.amount).toFixed(2)} {interestUnit}</span>
                  {p.note && <span className="text-gray-400 ml-1 truncate">{p.note}</span>}
                </div>
                <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                  <span className="text-gray-400">{p.payment_date}</span>
                  <button
                    onClick={() => {
                      if (window.confirm('确认删除这条结息记录？')) {
                        deletePaymentMutation?.mutate({ ledgerId, paymentId: p.id });
                      }
                    }}
                    className="p-1 rounded hover:bg-red-50 text-red-400 hover:text-red-600 transition-colors"
                    title="删除"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 公开备注区域 */}
        <FunderNoteRow
          orderId={order.id}
          ledgerId={ledgerId}
          initialNote={order.public_note || ''}
          onSaved={(raw) => { order.public_note = raw; }}
          currentUser={currentUser ? { id: (currentUser as any).id, name: (currentUser as any).name, username: (currentUser as any).username, avatar: (currentUser as any).avatar || (membersData as any[])?.find((u: any) => u.userId === (currentUser as any).id)?.avatar || undefined } : undefined}
          isAdmin={isAdmin}
          membersData={membersData as any[]}
        />
      </div>

      {/* 状态操作底部弹窗 */}
      {showStatusSheet && (
        <div className="fixed inset-0 z-[300] flex items-end justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }} onClick={() => setShowStatusSheet(false)}>
          <div className="bg-white rounded-t-2xl w-full max-w-md px-5 pt-5 pb-8" onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />
            <div className="text-sm font-semibold text-gray-700 mb-4 text-center">订单操作</div>
            <div className="space-y-2">
              <button
                onClick={() => {
                  updateMutation.mutate({ id: order.id, ledgerId, status: 'active' });
                  setShowStatusSheet(false);
                }}
                className="w-full py-3 rounded-xl text-sm font-medium transition-colors"
                style={{ backgroundColor: order.status === 'active' ? '#DCFCE7' : '#F3F4F6', color: order.status === 'active' ? '#16A34A' : '#374151' }}
              >
                持有中{order.status === 'active' ? '（当前）' : ''}
              </button>
              <button
                onClick={() => {
                  updateMutation.mutate({ id: order.id, ledgerId, status: 'settled' });
                  setShowStatusSheet(false);
                }}
                className="w-full py-3 rounded-xl text-sm font-medium transition-colors"
                style={{ backgroundColor: order.status === 'settled' ? '#DBEAFE' : '#F3F4F6', color: order.status === 'settled' ? '#1D4ED8' : '#374151' }}
              >
                已结清{order.status === 'settled' ? '（当前）' : ''}（利息停止计算）
              </button>
              <button
                onClick={() => {
                  if (window.confirm('确认删除这张订单？订单将移入回收站，可随时恢复。')) {
                    handleDelete?.(order.id);
                    setShowStatusSheet(false);
                  }
                }}
                className="w-full py-3 rounded-xl text-sm font-medium"
                style={{ backgroundColor: '#FEF2F2', color: '#DC2626' }}
              >
                删除订单（移入回收站）
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
// ===== END FunderOrderCardLegacy =====


const FunderOrderDetailModal = lazy(() => import('@/components/FunderOrderDetailModal'));
const LedgerDetailAA = lazy(() => import('./LedgerDetailAA'));
const LedgerDetailAG = lazy(() => import('./LedgerDetailAG'));
const MemoLedgerPage = lazy(() => import('./MemoLedgerPage'));
import { useRoute, useLocation, useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
// 不再使用动态主题，固定红色配色
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import MembersDialog from "@/components/MembersDialog";
import { EquityHistoryModal } from "@/components/EquityHistoryModal";
import { UserAvatar } from "@/components/UserAvatar";

import {
  ChevronLeft,
  ChevronRight,
  Settings,
  BarChart3,
  Plus,
  Search,
  Receipt,
  Hourglass,
  Users,
  TrendingDown,
  Gift,
  Clock,
  CheckCircle,
  XCircle,
  Loader,
  Trophy,
  Flame,
  Building2,
  CalendarClock,
  PieChart,
  ShieldCheck,
  Truck,
  RefreshCw,
  Minus,
  LayoutGrid,
  LayoutList,
  Calculator,
  TrendingUp,
} from "lucide-react";
import { AJOwnerPanel, FunderViewPanel } from "@/components/AJOwnerPanel";


// ========== 中国法定节假日数据（2025-2026年） ==========
// 法定节假日放假日期（这些日期是非工作日）
const CHINA_HOLIDAYS: Record<string, string> = {
  // 2025年
  '2025-01-01': '元旦',
  '2025-01-28': '春节', '2025-01-29': '春节', '2025-01-30': '春节', '2025-01-31': '春节',
  '2025-02-01': '春节', '2025-02-02': '春节', '2025-02-03': '春节', '2025-02-04': '春节',
  '2025-04-04': '清明节', '2025-04-05': '清明节', '2025-04-06': '清明节',
  '2025-05-01': '劳动节', '2025-05-02': '劳动节', '2025-05-03': '劳动节', '2025-05-04': '劳动节', '2025-05-05': '劳动节',
  '2025-05-31': '端午节', '2025-06-01': '端午节', '2025-06-02': '端午节',
  '2025-10-01': '国庆节', '2025-10-02': '国庆节', '2025-10-03': '国庆节', '2025-10-04': '国庆节',
  '2025-10-05': '国庆节', '2025-10-06': '国庆节', '2025-10-07': '国庆节', '2025-10-08': '国庆节',
  // 2026年
  '2026-01-01': '元旦', '2026-01-02': '元旦', '2026-01-03': '元旦',
  '2026-02-15': '春节', '2026-02-16': '春节', '2026-02-17': '春节', '2026-02-18': '春节',
  '2026-02-19': '春节', '2026-02-20': '春节', '2026-02-21': '春节', '2026-02-22': '春节', '2026-02-23': '春节',
  '2026-04-04': '清明节', '2026-04-05': '清明节', '2026-04-06': '清明节',
  '2026-05-01': '劳动节', '2026-05-02': '劳动节', '2026-05-03': '劳动节', '2026-05-04': '劳动节', '2026-05-05': '劳动节',
  '2026-06-19': '端午节', '2026-06-20': '端午节', '2026-06-21': '端午节',
  '2026-09-25': '中秋节', '2026-09-26': '中秋节', '2026-09-27': '中秋节',
  '2026-10-01': '国庆节', '2026-10-02': '国庆节', '2026-10-03': '国庆节', '2026-10-04': '国庆节',
  '2026-10-05': '国庆节', '2026-10-06': '国庆节', '2026-10-07': '国庆节',
};

// 调休上班日（这些周末日期是工作日）
const WORKDAY_OVERRIDES: Set<string> = new Set([
  // 2025年
  '2025-01-26', '2025-02-08', '2025-04-27', '2025-09-28', '2025-10-11',
  // 2026年
  '2026-01-04', '2026-02-14', '2026-02-28', '2026-05-09', '2026-09-20', '2026-10-10',
]);

// 获取北京时间（UTC+8）的当前日期信息
function getBeijingNow(): { year: number; month: number; day: number; hour: number; date: Date } {
  const now = new Date();
  // 使用 Intl 获取北京时间的各个部分
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const get = (type: string) => parts.find(p => p.type === type)?.value || '0';
  const year = parseInt(get('year'));
  const month = parseInt(get('month'));
  const day = parseInt(get('day'));
  const hour = parseInt(get('hour'));
  // 返回一个代表北京时间当天开始的Date对象（用于比较）
  const date = new Date(year, month - 1, day);
  return { year, month, day, hour, date };
}

// 格式化日期为 YYYY-MM-DD
function formatDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// 判断某天是否为工作日
function isWorkday(d: Date): boolean {
  const key = formatDateKey(d);
  // 如果是调休上班日（周末但要上班），则是工作日
  if (WORKDAY_OVERRIDES.has(key)) return true;
  // 如果是法定节假日，则不是工作日
  if (CHINA_HOLIDAYS[key]) return false;
  // 周六日不是工作日
  const dow = d.getDay();
  if (dow === 0 || dow === 6) return false;
  return true;
}

// 2026年确定的报税截止日（用户提供）
const TAX_DEADLINES_2026: Record<number, number> = {
  1: 20, 2: 24, 3: 16, 4: 20, 5: 22, 6: 15,
  7: 15, 8: 17, 9: 15, 10: 26, 11: 16, 12: 15,
};

// 计算报税截止日（每月15号，遇节假日/周末顺延）
// 2026年使用确定日期，其他年份自动计算
function getTaxDeadline(year: number, month: number): { deadline: Date; originalDate: Date; postponed: boolean; reason: string } {
  const original = new Date(year, month - 1, 15); // month是1-12

  // 2026年使用确定的截止日期
  if (year === 2026 && TAX_DEADLINES_2026[month]) {
    const actualDay = TAX_DEADLINES_2026[month];
    const deadline = new Date(year, month - 1, actualDay);
    const postponed = actualDay !== 15;
    let reason = '';
    if (postponed) {
      // 生成顺延原因
      const reasons: string[] = [];
      let d = new Date(original);
      while (d < deadline) {
        const key = formatDateKey(d);
        const holidayName = CHINA_HOLIDAYS[key];
        const dow = d.getDay();
        if (holidayName && !reasons.includes(holidayName)) {
          reasons.push(holidayName);
        } else if (dow === 0 && !holidayName) {
          if (!reasons.includes('周日')) reasons.push('周日');
        } else if (dow === 6 && !holidayName) {
          if (!reasons.includes('周六')) reasons.push('周六');
        }
        d = new Date(d.getTime() + 86400000);
      }
      reason = `因${reasons.join('、')}顺延至${month}月${actualDay}日`;
    }
    return { deadline, originalDate: original, postponed, reason };
  }

  // 其他年份自动计算
  let current = new Date(original);
  const reasons: string[] = [];
  for (let i = 0; i < 30; i++) {
    if (isWorkday(current)) break;
    const key = formatDateKey(current);
    const holidayName = CHINA_HOLIDAYS[key];
    const dow = current.getDay();
    if (holidayName && !reasons.includes(holidayName)) {
      reasons.push(holidayName);
    } else if (dow === 0 && !holidayName) {
      if (!reasons.includes('周日')) reasons.push('周日');
    } else if (dow === 6 && !holidayName) {
      if (!reasons.includes('周六')) reasons.push('周六');
    }
    current = new Date(current.getTime() + 86400000);
  }
  const postponed = current.getTime() !== original.getTime();
  const reasonText = postponed
    ? `因${reasons.join('、')}顺延至${current.getMonth() + 1}月${current.getDate()}日`
    : '';
  return { deadline: current, originalDate: original, postponed, reason: reasonText };
}

// 获取下一个报税截止日信息（基于北京时间 UTC+8）
// 报税周期逻辑：
// - 每月截止日用于申报上个月的税务
// - 例如：3月16日截止日 → 申报的是2月的税务
// - 3月12日：距离3月16日还有4天，显示"申报2月税务"
// - 3月17日（过了3月截止日）：显示"申报3月税务"，截止日是4月20日
function getNextTaxDeadlineInfo(): { deadline: Date; originalDate: Date; postponed: boolean; reason: string; taxMonth: number; taxYear: number; daysLeft: number } {
  // 使用北京时间判断“今天”
  const bj = getBeijingNow();
  const currentYear = bj.year;
  const currentMonth = bj.month;
  const todayDate = bj.date; // 北京时间今天 00:00:00 的 Date 对象

  // 当月的截止日（用于申报上个月的税）
  const currentDeadline = getTaxDeadline(currentYear, currentMonth);
  // 截止日也转换为当天 00:00:00 进行比较（只比较日期，不比较时间）
  const deadlineDate = new Date(currentDeadline.deadline.getFullYear(), currentDeadline.deadline.getMonth(), currentDeadline.deadline.getDate());

  if (todayDate <= deadlineDate) {
    // 北京时间今天还没过截止日 → 正在申报上个月的税务
    // 计算剩余天数：截止日日期 - 今天日期 + 1（包含今天）
    // 例如：今天4月16日，截止日4月16日 → 剩余1天（今天是最后一天）
    const diffMs = deadlineDate.getTime() - todayDate.getTime();
    const daysLeft = Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1; // +1因为截止日当天也算
    const taxMonth = currentMonth === 1 ? 12 : currentMonth - 1;
    const taxYear = currentMonth === 1 ? currentYear - 1 : currentYear;
    return { ...currentDeadline, taxMonth, taxYear, daysLeft };
  } else {
    // 北京时间今天已过截止日 → 开始申报当月的税务，截止日是下个月
    const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;
    const nextYear = currentMonth === 12 ? currentYear + 1 : currentYear;
    const nextDeadline = getTaxDeadline(nextYear, nextMonth);
    const nextDeadlineDate = new Date(nextDeadline.deadline.getFullYear(), nextDeadline.deadline.getMonth(), nextDeadline.deadline.getDate());
    const diffMs = nextDeadlineDate.getTime() - todayDate.getTime();
    const daysLeft = Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1;
    return { ...nextDeadline, taxMonth: currentMonth, taxYear: currentYear, daysLeft };
  }
}

// ===== 实时权重展示子组件 =====
function WeightScoreDisplay({ ledgerId, userId }: { ledgerId: number; userId?: number | null }) {
  const { data: ws, isLoading } = (trpc as any).equity.getMemberWeightScore.useQuery(
    { ledgerId, ...(userId ? { userId } : {}) },
    { enabled: !!ledgerId }
  );

  const gold = '#C9A84C';
  const darkBrown = '#1A0A00';
  const dimBrown = 'rgba(58,20,0,0.5)';
  const bg = 'rgba(201,168,76,0.07)';
  const border = '1px solid rgba(201,168,76,0.2)';

  if (isLoading) {
    return (
      <div className="rounded-2xl p-4 mb-4 flex items-center justify-center" style={{ background: bg, border, minHeight: 80 }}>
        <span className="text-xs" style={{ color: dimBrown }}>计算中...</span>
      </div>
    );
  }

  if (!ws) {
    return (
      <div className="rounded-2xl p-4 mb-4 flex items-center justify-center" style={{ background: bg, border, minHeight: 80 }}>
        <span className="text-xs" style={{ color: dimBrown }}>暂无权重数据</span>
      </div>
    );
  }

  // 前端自己加总，确保与明细列表完全一致
  const capital = Math.min((ws.timeBonus ?? 0) + (ws.capitalBonus ?? 0), 2.0);
  const resourceBonus = Math.min(
    (ws.networkBonus ?? 0) + (ws.tagBonus ?? 0) + (ws.inviteBonus ?? 0),
    2.0
  );
  const total = Math.min(
    Math.round((1.0 + capital + resourceBonus) * 10000) / 10000,
    5.0
  );

  // 进度条百分比
  const totalPct = Math.min((total / 5.0) * 100, 100);
  const capitalPct = Math.min((capital / 2.0) * 100, 100);
  const resourcePct = Math.min((resourceBonus / 2.0) * 100, 100);

  // 行组件：三种层级
  // level=0: 顶级汇总行（基础权重/资金乘数/资源乘数）- 深色背景+粗字
  // level=1: 二级子项（时间乘数/资金量乘数/人脉贡献/标签贡献/邀请贡献）- 白色背景+左侧金色细线
  // level=2: 三级子项（自有/共享/拓扑人脉）- 极浅灰背景+左侧更细线+更小字
  const Row = ({ label, cap, formula, value, level = 0, max }: {
    label: string;
    cap?: string;
    formula?: string;
    value: string;
    level?: 0 | 1 | 2;
    max?: number;  // 满分数値，用于进度条计算
  }) => {
    if (level === 0) {
      // 顶级汇总行：深金色背景，字体较大，无缩进
      return (
        <div style={{ background: 'rgba(201,168,76,0.13)', borderBottom: '1px solid rgba(201,168,76,0.18)', margin: '0 -12px', padding: '6px 12px' }}>
          <div className="flex items-center">
            <div className="flex-1 min-w-0">
              <span className="font-semibold" style={{ fontSize: 11, color: darkBrown }}>{label}</span>
              {cap && <span className="ml-1.5" style={{ fontSize: 8, color: 'rgba(58,20,0,0.38)' }}>{cap}</span>}
            </div>
            <span className="font-bold ml-2 flex-shrink-0" style={{ fontSize: 13, color: gold, whiteSpace: 'nowrap' }}>{value}</span>
          </div>
        </div>
      );
    }
    if (level === 1) {
      // 二级子项：白色背景，左侧金色竖线，轻微缩进
      const rawVal1 = parseFloat(value.replace(/[^0-9.]/g, '')) || 0;
      const pct1 = max ? Math.min((rawVal1 / max) * 100, 100) : 0;
      return (
        <div style={{ background: 'rgba(255,255,255,0.7)', borderBottom: '1px solid rgba(201,168,76,0.07)', margin: '0 -12px', padding: '4px 12px 4px 20px', borderLeft: '3px solid rgba(201,168,76,0.45)' }}>
          <div className="flex items-center">
            <div className="flex-1 min-w-0">
              <span style={{ fontSize: 10, color: 'rgba(58,20,0,0.75)', fontWeight: 500 }}>{label}</span>
              {cap && <span className="ml-1.5" style={{ fontSize: 8, color: 'rgba(58,20,0,0.30)' }}>{cap}</span>}
            </div>
            <span className="font-semibold ml-2 flex-shrink-0" style={{ fontSize: 11, color: gold, whiteSpace: 'nowrap' }}>{value}</span>
          </div>
          {/* 进度条 */}
          <div className="mt-1 mb-0.5" style={{ height: 3, background: 'rgba(201,168,76,0.12)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ width: `${pct1}%`, height: '100%', background: gold, borderRadius: 2 }} />
          </div>
          {formula && (
            <div className="mb-0.5">
              <span style={{ fontSize: 8, color: 'rgba(58,20,0,0.35)', fontFamily: 'monospace' }}>{formula}</span>
            </div>
          )}
        </div>
      );
    }
    // level === 2: 三级子项：极浅灰背景，左侧更细线，更深缩进，更小字
    const rawVal2 = parseFloat(value.replace(/[^0-9.]/g, '')) || 0;
    const pct2 = max ? Math.min((rawVal2 / max) * 100, 100) : 0;
    return (
      <div style={{ background: 'rgba(248,245,238,0.9)', borderBottom: '1px solid rgba(201,168,76,0.05)', margin: '0 -12px', padding: '3px 12px 3px 32px', borderLeft: '2px solid rgba(201,168,76,0.22)' }}>
        <div className="flex items-center">
          <div className="flex-1 min-w-0">
            <span style={{ fontSize: 9, color: 'rgba(58,20,0,0.55)' }}>{label}</span>
            {cap && <span className="ml-1" style={{ fontSize: 7.5, color: 'rgba(58,20,0,0.25)' }}>{cap}</span>}
          </div>
          <span className="ml-2 flex-shrink-0" style={{ fontSize: 10, color: 'rgba(201,168,76,0.8)', fontWeight: 600, whiteSpace: 'nowrap' }}>{value}</span>
        </div>
        {/* 进度条 */}
        <div className="mt-0.5" style={{ height: 2, background: 'rgba(201,168,76,0.10)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ width: `${pct2}%`, height: '100%', background: 'rgba(201,168,76,0.65)', borderRadius: 2 }} />
        </div>
        {formula && (
          <div className="mt-0.5 mb-0.5">
            <span style={{ fontSize: 7.5, color: 'rgba(58,20,0,0.30)', fontFamily: 'monospace' }}>{formula}</span>
          </div>
        )}
      </div>
    );
  };

  // 计算过程文字
  const ownFormula = `${ws.ownContacts ?? 0}人 ÷ 100人 × 0.50倍 = +${ws.ownBonus?.toFixed(2) ?? '0.00'}倍`;
  const sharedFormula = `${ws.sharedContacts ?? 0}人 ÷ 800人 × 0.30倍 = +${ws.sharedBonus?.toFixed(2) ?? '0.00'}倍`;
  const topoFormula = `${ws.topoContacts ?? 0}人 ÷ 2000人 × 0.20倍 = +${ws.topoBonus?.toFixed(2) ?? '0.00'}倍`;
  const tagTier = ws.tagTier ?? Math.min(Math.floor(ws.avgTags ?? 0), 15);
  const tagFormula = tagTier > 0
    ? `人均${ws.avgTags ?? 0}个 → 取整第${tagTier}档 = +${ws.tagBonus?.toFixed(2) ?? '0.00'}倍`
    : `人均${ws.avgTags ?? 0}个 → 未达第1档 = +0.00倍`;
  const inviteFormula = `${ws.inviteCount ?? 0}人 ÷ 100人 × 0.40倍 = +${ws.inviteBonus?.toFixed(2) ?? '0.00'}倍`;
  const timeFormula = ws.rank ? `第${ws.rank}号入场 → 第${ws.timeTier}档 = +${ws.timeBonus?.toFixed(2) ?? '0.00'}倍` : '未入场';
  // capitalAmount 单位是元（1张资金股=1元），满分门槛10万元（100000元）
  const capitalAmountYuan = ws.capitalAmount ?? 0;
  const capitalAmountDisplay = capitalAmountYuan >= 10000
    ? `${(capitalAmountYuan / 10000).toFixed(1)}万元`
    : `${capitalAmountYuan}元`;
  const capitalFormula = capitalAmountYuan > 0
    ? `${capitalAmountDisplay} ÷ 10万元 = +${ws.capitalBonus?.toFixed(2) ?? '0.00'}倍`
    : '未出资';

  return (
    <div className="rounded-2xl p-4 mb-4" style={{ background: bg, border }}>
      {/* 标题行 */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-bold" style={{ color: darkBrown }}>我的实时权重</span>
        <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(201,168,76,0.15)', color: gold, fontWeight: 600 }}>第{ws.shareNo ?? '--'}号入场</span>
      </div>

      {/* 综合乘数大字 + 进度条 */}
      <div className="flex items-end gap-2 mb-2">
        <span className="text-3xl font-bold" style={{ color: gold, lineHeight: 1 }}>{total.toFixed(2)}</span>
        <span className="text-xs mb-1" style={{ color: dimBrown }}>倍（满分5.0倍）</span>
      </div>
      <div className="mb-3">
        <div className="rounded-full overflow-hidden" style={{ height: 5, background: 'rgba(201,168,76,0.15)' }}>
          <div className="h-full rounded-full" style={{ width: `${totalPct}%`, background: gold }} />
        </div>
      </div>

      {/* 左右汇总卡片 */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        {/* 资金乘数 */}
        <div className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(201,168,76,0.15)' }}>
          <div className="text-[10px] mb-1" style={{ color: dimBrown }}>资金乘数</div>
          <div className="text-lg font-bold" style={{ color: gold }}>{capital.toFixed(2)}<span className="text-[10px] font-normal ml-0.5">倍</span></div>
          <div className="rounded-full overflow-hidden mt-1.5" style={{ height: 3, background: 'rgba(201,168,76,0.15)' }}>
            <div className="h-full rounded-full" style={{ width: `${capitalPct}%`, background: gold }} />
          </div>
          <div className="mt-1.5 space-y-0.5">
            <div className="flex justify-between text-[9px]" style={{ color: dimBrown }}>
              <span>时间乘数</span>
              <span style={{ color: gold }}>+{ws.timeBonus?.toFixed(2) ?? '0.00'}</span>
            </div>
            <div className="flex justify-between text-[9px]" style={{ color: dimBrown }}>
              <span>资金量乘数</span>
              <span style={{ color: gold }}>+{ws.capitalBonus?.toFixed(2) ?? '0.00'}</span>
            </div>
          </div>
        </div>
        {/* 资源乘数 */}
        <div className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(201,168,76,0.15)' }}>
          <div className="text-[10px] mb-1" style={{ color: dimBrown }}>资源乘数</div>
          <div className="text-lg font-bold" style={{ color: gold }}>{resourceBonus.toFixed(2)}<span className="text-[10px] font-normal ml-0.5">倍</span></div>
          <div className="rounded-full overflow-hidden mt-1.5" style={{ height: 3, background: 'rgba(201,168,76,0.15)' }}>
            <div className="h-full rounded-full" style={{ width: `${resourcePct}%`, background: gold }} />
          </div>
          <div className="mt-1.5 space-y-0.5">
            <div className="flex justify-between text-[9px]" style={{ color: dimBrown }}>
              <span>人脉贡献</span>
              <span style={{ color: gold }}>+{ws.networkBonus?.toFixed(2) ?? '0.00'}</span>
            </div>
            <div className="flex justify-between text-[9px]" style={{ color: dimBrown }}>
              <span>标签贡献</span>
              <span style={{ color: gold }}>+{ws.tagBonus?.toFixed(2) ?? '0.00'}</span>
            </div>
            <div className="flex justify-between text-[9px]" style={{ color: dimBrown }}>
              <span>邀请贡献</span>
              <span style={{ color: gold }}>+{ws.inviteBonus?.toFixed(2) ?? '0.00'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 计分明细展开列表 */}
      <div className="rounded-xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(201,168,76,0.15)' }}>
        <div className="px-3 pt-2 pb-0" style={{ overflow: 'hidden' }}>
          <Row label="基础权重" cap="所有合伙人固定享有" value="+1.00倍" level={0} />
          <Row label="资金乘数" cap="满分2.0倍" value={`+${capital.toFixed(2)}倍`} level={0} />
          <Row label="时间乘数" cap="满分1.0倍" formula={timeFormula} value={`+${ws.timeBonus?.toFixed(2) ?? '0.00'}倍`} level={1} max={1.0} />
          <Row label="资金量乘数" cap="满分1.0倍" formula={capitalFormula} value={`+${ws.capitalBonus?.toFixed(2) ?? '0.00'}倍`} level={1} max={1.0} />
          <Row label="资源乘数" cap="满分2.0倍" value={`+${resourceBonus.toFixed(2)}倍`} level={0} />
          <Row label="人脉贡献" cap="满分1.0倍（50%自有+30%共享+20%拓扑）" value={`+${ws.networkBonus?.toFixed(2) ?? '0.00'}倍`} level={1} max={1.0} />
          <Row label="自有人脉" cap="满分0.50倍" formula={ownFormula} value={`+${ws.ownBonus?.toFixed(2) ?? '0.00'}倍`} level={2} max={0.5} />
          <Row label="共享人脉" cap="满分0.30倍" formula={sharedFormula} value={`+${ws.sharedBonus?.toFixed(2) ?? '0.00'}倍`} level={2} max={0.3} />
          <Row label="拓扑人脉" cap="满分0.20倍" formula={topoFormula} value={`+${ws.topoBonus?.toFixed(2) ?? '0.00'}倍`} level={2} max={0.2} />
          <Row label="标签贡献" cap="满分0.60倍" formula={tagFormula} value={`+${ws.tagBonus?.toFixed(2) ?? '0.00'}倍`} level={1} max={0.6} />
          <Row label="邀请贡献" cap="满分0.40倍" formula={inviteFormula} value={`+${ws.inviteBonus?.toFixed(2) ?? '0.00'}倍`} level={1} max={0.4} />
        </div>
        <div className="flex items-center justify-between px-3 py-2 mt-1" style={{ background: 'rgba(201,168,76,0.1)', borderTop: '1px solid rgba(201,168,76,0.2)' }}>
          <span className="text-[10px] font-semibold" style={{ color: darkBrown }}>综合乘数（满分5.0倍）</span>
          <span className="text-sm font-bold" style={{ color: gold }}>{total.toFixed(2)}倍</span>
        </div>
      </div>
    </div>
  );
}

export default function LedgerDetail() {
  const [, params] = useRoute("/ledger/:id");
  const [, setLocation] = useLocation();
  
  // 使用全局CSS变量，确保所有用户配色统一

  const ledgerId = params?.id ? parseInt(params.id) : 1;
  console.log('[LedgerDetail] params:', params, 'ledgerId:', ledgerId);
  
  // 读取URL查询参数
  const urlParams = new URLSearchParams(window.location.search);
  // 使用wouter的useSearch确保SPA路由下能正确读取URL参数
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);
  // 读取来源账本ID：优先从sessionStorage读取（点击图标跳转时写入），其次从URL参数读取
  const fromLedgerIdSession = sessionStorage.getItem('ledger_back_from');
  const fromLedgerIdUrl = searchParams.get('from');
  const fromLedgerId = fromLedgerIdSession || fromLedgerIdUrl;
  const backTarget = fromLedgerId ? `/ledger/${fromLedgerId}` : '/ledger';
  const filters: any = {
    ledgerId: Number(ledgerId),
    limit: 2000, // 加大limit确保加载全部历史记录（原100会截断早期数据）
  };
  
  // 从 URL 参数中读取筛选条件
  if (urlParams.has('startDate')) filters.startDate = urlParams.get('startDate')!;
  if (urlParams.has('endDate')) filters.endDate = urlParams.get('endDate')!;
  if (urlParams.has('type')) filters.type = urlParams.get('type') as 'income' | 'expense';
  if (urlParams.has('amountMin')) filters.amountMin = urlParams.get('amountMin')!;
  if (urlParams.has('amountMax')) filters.amountMax = urlParams.get('amountMax')!;
  if (urlParams.has('note')) filters.note = urlParams.get('note')!;
  
  // 处理分类 ID（只使用第一个）
  if (urlParams.has('categoryIds')) {
    const categoryIds = urlParams.get('categoryIds')!.split(',').map(Number);
    if (categoryIds.length > 0) {
      filters.categoryId = categoryIds[0];
    }
  }
  
  // 处理成员 ID（只使用第一个）
  if (urlParams.has('memberIds')) {
    const memberIds = urlParams.get('memberIds')!.split(',').map(Number);
    if (memberIds.length > 0) {
      filters.memberId = memberIds[0];
    }
  }
  
  console.log('[LedgerDetail] filters:', filters);
  
  // 使用 tRPC
  const { data: ledgerData, isLoading, error } = trpc.ledger.getById.useQuery({
    ledgerId: Number(ledgerId),
  });

  // 获取成员列表
  const { data: membersData } = trpc.ledger.getMembers.useQuery({
    ledgerId: Number(ledgerId),
  });

  // 获取记账记录列表（应用筛选条件）
  const { data: transactionsData, refetch: refetchTransactions } = trpc.ledger.getTransactions.useQuery(filters, {
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  // 成员弹窗状态
  // 图片全屏预览
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [showMembersDialog, setShowMembersDialog] = useState(false);
  const [showInviteTree, setShowInviteTree] = useState(false);
  const [editingNoteUserId, setEditingNoteUserId] = useState<number | null>(null);
  const [noteInputValue, setNoteInputValue] = useState('');
  const [localNotes, setLocalNotes] = useState<Record<number, string>>({});
  // 拨比编辑状态（YJH专属）
  const [editingRatioUserId, setEditingRatioUserId] = useState<number | null>(null);
  const [ratioInputValue, setRatioInputValue] = useState<string>('');
  // 行内编辑某个受益人的拨比
  const [editingBeneficiaryId, setEditingBeneficiaryId] = useState<number | null>(null);
  const [beneficiaryRatioInput, setBeneficiaryRatioInput] = useState<string>('');
  // 视角切换（AF 账本管理员专属）
  // viewAsUserId 从 URL 参数读取，确保刷新和子页面跳转后保持视角
  const viewAsUserIdFromUrl = urlParams.get('viewAs') ? Number(urlParams.get('viewAs')) : null;
  const [viewAsUserId, setViewAsUserIdState] = useState<number | null>(viewAsUserIdFromUrl);
  // 页面初始化时，如果 URL 有 viewAs 参数，同步写入 sessionStorage 实现身份代入
  if (viewAsUserIdFromUrl) {
    sessionStorage.setItem('view-as-user-id', String(viewAsUserIdFromUrl));
  }
  const [showViewAsPicker, setShowViewAsPicker] = useState(false);
  // 查询当前是否处于身份代入模式（用于黄色返回条，用真实用户的账本角色判断）
  const { data: viewAsStatusData } = trpc.auth.viewAsStatus.useQuery(
    { ledgerId: Number(ledgerId) },
    { enabled: !!viewAsUserId }
  );
  const isReallyViewingAs = viewAsStatusData?.isViewingAs ?? false;
  const realUserIsManagerInLedger = isReallyViewingAs && (
    viewAsStatusData?.realUserLedgerRole === 'owner' || viewAsStatusData?.realUserLedgerRole === 'admin'
  );
  // 获取待审批记账数量（后端通过身份代入自动判断权限）
  const { data: pendingApprovals = [] } = trpc.ledger.getPendingApprovals.useQuery({
    ledgerId: Number(ledgerId),
  });
  const [viewAsSearch, setViewAsSearch] = useState('');
  const [viewAsRoleFilter, setViewAsRoleFilter] = useState<'all' | 'member' | 'funder'>('all');
  const trpcUtils = trpc.useUtils();
  // 视角切换时同步写入 URL 和 sessionStorage，实现完全身份代入
  const handleSwitchView = (userId: number | null) => {
    setViewAsUserIdState(userId);
    setShowViewAsPicker(false);
    // 写入/清除 sessionStorage（tRPC 请求头会自动带上，实现后端身份代入）
    if (userId) {
      sessionStorage.setItem('view-as-user-id', String(userId));
    } else {
      sessionStorage.removeItem('view-as-user-id');
    }
    // 更新 URL 参数
    const newParams = new URLSearchParams(window.location.search);
    if (userId) {
      newParams.set('viewAs', String(userId));
    } else {
      newParams.delete('viewAs');
    }
    const newUrl = `${window.location.pathname}?${newParams.toString()}`;
    window.history.replaceState(null, '', newUrl);
    // 刷新所有查询，使身份代入立即生效
    trpcUtils.invalidate();
  };
  // 抽奖子 Tab：正在进行中 / 往期回顾
  const [lotteryTab, setLotteryTab] = useState<'active' | 'past'>('active');
  // 倒计时刻度（每秒更新）
  const [tick, setTick] = useState(0);
  // 权益卡片币种展开状态
  const [expandedCoins, setExpandedCoins] = useState<Record<string, boolean>>({});
  // 个人均价明细弹窗：记录当前展示哪个币种的明细（null=关闭）
  const [avgCostDetailCoin, setAvgCostDetailCoin] = useState<string | null>(null);
  const [avgCostDetailData, setAvgCostDetailData] = useState<{ coin: string; avgCost: number; totalQty: number; totalCost: number; orderDetails: { buyPrice: number; originalQty: number; tier: number; discountRate: number; effectiveQty: number; isGift: boolean }[] } | null>(null);
  // 权益卡片模拟价格滑动条（每个币种独立，localStorage持久化）
  const [sliderPrices, setSliderPrices] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem(`haoyouji_slider_${ledgerId}`);
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });
  const setSliderPrice = (coin: string, val: number) => {
    setSliderPrices(prev => {
      const next = { ...prev, [coin]: val };
      try { localStorage.setItem(`haoyouji_slider_${ledgerId}`, JSON.stringify(next)); } catch {}
      return next;
    });
  };
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  // 离开账本页面时清除 viewAs 身份代入状态
  useEffect(() => {
    return () => {
      sessionStorage.removeItem('view-as-user-id');
    };
  }, []);

  // 抽奖活动列表（全量，前端按子Tab过滤）
  const { data: lotteryActivities, isLoading: lotteryLoading } = trpc.lottery.listByLedger.useQuery(
    { ledgerId: Number(ledgerId) }
  );
  // ============================================================
  // ⚠️  账本类型隔离保护区 ⚠️
  // ------------------------------------------------------------
  // 账本类型一览：
  //   普通账本   type = null / 'default'  ← 绝对不能被任何定制逻辑影响
  //   减肥账本   type = 'diet' | 'custom_ac'   → isDiet
  //   AE 抽奖箱  type = 'custom_ae'            → isCustomAE
  //   AA 建议箱  type = 'custom_aa'            → isCustomAA（独立组件，早期 return）
  //   AD 永忆    type = 'custom_ad'            → isCustomAD（独立组件，早期 return）
  //
  // 修改规则（必须遵守）：
  //   1. 所有定制逻辑必须包在对应的 isXxx 条件里
  //   2. 普通账本的统计面板、记账列表、底部+按钮等，
  //      必须用 !isCustomAE && !isDiet && !isCustomAA && !isCustomAD 保护
  //   3. 每次新增定制功能，先问自己：「普通账本会受影响吗？」
  // ============================================================

  // 减肥账本数据
  const isDiet = (ledgerData as any)?.type === 'diet' || (ledgerData as any)?.type === 'custom_ac';
  const isCustomAE = (ledgerData as any)?.type === 'custom_ae';
  const isCustomAF = (ledgerData as any)?.type === 'custom_af';
  const isCustomAH = (ledgerData as any)?.type === 'custom_ah';
  const isCustomAI = (ledgerData as any)?.type === 'custom_ai';
  const isCustomAJ = (ledgerData as any)?.type === 'custom_aj';
  // AJ账本：查询当前用户（或视角用户）有权限的企业列表，用于判断是否允许进入报销申请单
  const { data: ajAccessibleCompanies } = trpc.ledger.ajGetMyCompanies.useQuery(
    { ledgerId: Number(ledgerId) },
    { enabled: isCustomAJ }
  );
  const ajHasAccessibleCompanies = isCustomAJ && (ajAccessibleCompanies as any[])?.length > 0;


  // AI 账本日历 state
  const [aiCalMonth, setAiCalMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() }; // month: 0-indexed
  });
  const isOwner = (ledgerData as any)?.userRole === 'owner';
  const isAdmin = (ledgerData as any)?.userRole === 'admin';
  const isFunder = (ledgerData as any)?.userRole === 'funder';
  const isClient = (ledgerData as any)?.userRole === 'client';
  const isEmployee = (ledgerData as any)?.userRole === 'employee';
  // AH 账本角色名称映射
  const ahRoleName = isCustomAH ? (
    isOwner ? '创建者' : isAdmin ? '管理员' : (ledgerData as any)?.userRole === 'member' ? '普通用户' : isClient ? '客户' : isEmployee ? '企业员工' : '普通用户'
  ) : '';
  // 视角切换时，用目标用户的角色来控制 UI 显示
  const viewAsRole = viewAsUserId ? ((membersData as any[])?.find((m: any) => m.userId === viewAsUserId)?.role || 'member') : null;
  const effectiveIsOwner = viewAsUserId ? viewAsRole === 'owner' : isOwner;
  const effectiveIsAdmin = viewAsUserId ? viewAsRole === 'admin' : isAdmin;
  const effectiveIsFunder = viewAsUserId ? viewAsRole === 'funder' : isFunder;
  const effectiveIsManager = effectiveIsOwner || effectiveIsAdmin;
  const isDietCoach = isDiet && (isOwner || isAdmin);
  const isDietStudent = isDiet && !isDietCoach;
  const { data: user } = trpc.auth.me.useQuery();
  // 快捷按钮配置：从数据库读取当前用户的快捷按钮开关状态
  const isShortcutLedger = ledgerId === 52 || ledgerId === 37 || ledgerId === 59;
  const { data: myShortcuts } = (trpc as any).ledger.getMyShortcutButtons.useQuery(
    { ledgerId: Number(ledgerId) },
    { enabled: isShortcutLedger }
  );
  const { data: dietStats } = trpc.diet.getStats.useQuery(
    { ledgerId: Number(ledgerId) },
    { enabled: isDiet }
  );
  // AF 账本：总资产估值（充值到账 + 手动调账）
  const { data: afTotalAsset } = trpc.ledger.afGetMyTotalAsset.useQuery(
    { ledgerId: Number(ledgerId) },
    { enabled: isCustomAF, refetchInterval: 3000, staleTime: 0 }
  );
  // 普通用户实时价格（从 afGetMyTotalAsset 返回的 livePrices，3秒刷新）
  const userLivePrices: Record<string, number> = (afTotalAsset as any)?.livePrices ?? {};
  // AF 账本：管理员统计（订单数 + 管理费）——后端控制权限，无权限返回null
  const { data: afAdminStats } = trpc.ledger.afAdminGetStats.useQuery(
    { ledgerId: Number(ledgerId) },
    { enabled: isCustomAF }
  );
  // AF 账本：实时盈亏汇总（每60秒自动刷新）
  const { data: pnlData } = trpc.ledger.afGetPnlSummary.useQuery(
    { ledgerId: Number(ledgerId) },
    { enabled: isCustomAF, refetchInterval: 60000 }
  );
  // AF 账本：资金费率日志弹窗状态（必须在 trpc 查询之前声明，避免 TDZ）
  const [showFundingRateLogs2, setShowFundingRateLogs2] = useState(false);
  const [fundingRateLogsPage2, setFundingRateLogsPage2] = useState(1);
  // AF 账本：资金费率开关状态 + 累计金额
  const { data: fundingRateStatus } = trpc.ledger.afGetFundingRateStatus.useQuery(
    { ledgerId: Number(ledgerId) },
    { enabled: isCustomAF && !effectiveIsFunder, refetchInterval: 30000 }
  );
  // 独立本地 state，初始值为 undefined（未初始化），useEffect 在服务器数据到达后初始化一次
  // 短信通知开关
  const isYJHUser = (user as any)?.id === 4957151;
  const isViewingAsYJH = viewAsUserId === 4957151;
  // 管理员自己视角（未切换）：显示131开关
  const showSms131 = isCustomAF && (isAdmin || isOwner) && !viewAsUserId;
  // 管理员切换到YJH视角：显示182开关
  const showSms182 = isCustomAF && (isAdmin || isOwner) && isViewingAsYJH;
  const showSmsSwitch = showSms131 || showSms182;
  const { data: smsNotifySettings } = trpc.ledger.afGetSmsNotifySettings.useQuery(
    { ledgerId: Number(ledgerId) },
    { enabled: showSmsSwitch }
  );
  const [localSms131, setLocalSms131] = useState<boolean | undefined>(undefined);
  const [localSms182, setLocalSms182] = useState<boolean | undefined>(undefined);
  const smsInitialized = useRef(false);
  useEffect(() => {
    if (!smsInitialized.current && smsNotifySettings !== undefined) {
      setLocalSms131(smsNotifySettings.phone131);
      setLocalSms182(smsNotifySettings.phone182);
      smsInitialized.current = true;
    }
  }, [smsNotifySettings]);
  const toggleSmsNotifyMutation = trpc.ledger.afToggleSmsNotify.useMutation({
    onMutate: (variables) => {
      if (variables.phone === '13127919173') setLocalSms131(variables.enabled);
      else if (variables.phone === '18271901931') setLocalSms182(variables.enabled);
    },
    onError: () => {
      setLocalSms131(smsNotifySettings?.phone131);
      setLocalSms182(smsNotifySettings?.phone182);
    },
  });
  const [localFundingRateEnabled, setLocalFundingRateEnabled] = useState<boolean | undefined>(undefined);
  const fundingRateInitialized = useRef(false);
  useEffect(() => {
    if (!fundingRateInitialized.current && fundingRateStatus !== undefined) {
      setLocalFundingRateEnabled(fundingRateStatus.enabled);
      fundingRateInitialized.current = true;
    }
  }, [fundingRateStatus]);
  const toggleFundingRateMutation = trpc.ledger.afToggleFundingRate.useMutation({
    onSuccess: (_data, variables) => {
      setLocalFundingRateEnabled(variables.enabled);
      if (variables.enabled) {
        // 打开时重置秒表
        setStopwatchStartMs(Date.now());
        setStopwatchElapsedMs(0);
      } else {
        // 关闭时清空秒表
        setStopwatchStartMs(null);
        setStopwatchElapsedMs(0);
      }
    },
    onError: (_err, _variables, context: any) => {
      if (context?.previousEnabled !== undefined) {
        setLocalFundingRateEnabled(context.previousEnabled);
      }
    },
    onMutate: (variables) => {
      return { previousEnabled: localFundingRateEnabled };
    },
  });
  // 秒表状态
  const [stopwatchStartMs, setStopwatchStartMs] = useState<number | null>(null);
  const [stopwatchElapsedMs, setStopwatchElapsedMs] = useState(0);
  // 用服务器返回的 openAt 初始化秒表
  useEffect(() => {
    if (fundingRateStatus?.enabled && fundingRateStatus?.openAt) {
      setStopwatchStartMs(fundingRateStatus.openAt);
      setStopwatchElapsedMs(Date.now() - fundingRateStatus.openAt);
    } else if (!fundingRateStatus?.enabled) {
      setStopwatchStartMs(null);
      setStopwatchElapsedMs(0);
    }
  }, [fundingRateStatus?.enabled, fundingRateStatus?.openAt]);
  // 秒表实时跳动
  useEffect(() => {
    if (!stopwatchStartMs) return;
    const timer = setInterval(() => {
      setStopwatchElapsedMs(Date.now() - stopwatchStartMs);
    }, 1000);
    return () => clearInterval(timer);
  }, [stopwatchStartMs]);
  // 秒表格式化函数
  const formatStopwatch = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const d = Math.floor(totalSec / 86400);
    const h = Math.floor((totalSec % 86400) / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (d > 0) return `${d}天${String(h).padStart(2,'0')}时${String(m).padStart(2,'0')}分${String(s).padStart(2,'0')}秒`;
    return `${String(h).padStart(2,'0')}时${String(m).padStart(2,'0')}分${String(s).padStart(2,'0')}秒`;
  };
  // AF 账本：资金费率日志（无限滚动，每次50条）
  const [fundingRateAllLogs, setFundingRateAllLogs] = useState<any[]>([]);
  const [fundingRateHasMore, setFundingRateHasMore] = useState(true);
  const [fundingRateLoadingMore, setFundingRateLoadingMore] = useState(false);
  const [fundingRateQueryVersion, setFundingRateQueryVersion] = useState(0);
  const { data: fundingRateLogsData, isLoading: fundingRateLogsLoading } = trpc.ledger.afGetFundingRateLogs.useQuery(
    { ledgerId: Number(ledgerId), page: fundingRateLogsPage2, pageSize: 50 },
    { enabled: isCustomAF && !effectiveIsFunder && showFundingRateLogs2 && fundingRateQueryVersion > 0, staleTime: 0 }
  );
  // ETH 持仓计算预览数据（仅 isCustomAF 时加载）
  const { data: ethPositionSettings } = trpc.ethPositionGetSettings.useQuery(
    { ledgerId: Number(ledgerId) },
    { enabled: isCustomAF }
  );
  const { data: ethPositionLevels } = trpc.ethPositionGetLevels.useQuery(
    { ledgerId: Number(ledgerId) },
    { enabled: isCustomAF }
  );
  // 计算实际持仓总量
  const ethActualQty = (ethPositionLevels?.levels ?? []).reduce((sum: number, l: any) => sum + (l.actualQty || 0), 0);
  const ethTargetQty = ethPositionSettings?.targetEthQty ?? 0;
  const ethPositionPct = ethTargetQty > 0 ? Math.min(1, ethActualQty / ethTargetQty) : 0;

  // 资方专属：资产汇总（仅 funder 角色查询，管理员视角切换时传目标用户ID）
  const { data: funderAssetSummary } = trpc.ledger.funderGetAssetSummary.useQuery(
    { ledgerId: Number(ledgerId) },
    { enabled: isCustomAF && effectiveIsFunder }
  );
  // 资方专属：资产订单列表（funder 角色查询，管理员视角切换时传目标用户ID）
  const PRICE_CACHE_KEY = `funder_live_prices_${ledgerId}`;
  const { data: funderAssetData } = trpc.ledger.funderGetAssetOrders.useQuery(
    { ledgerId: Number(ledgerId) },
    { enabled: isCustomAF && effectiveIsFunder, refetchOnWindowFocus: true, staleTime: 0 }
  );
  const funderAssetOrders = (funderAssetData as any)?.orders ?? funderAssetData ?? [];
  // livePrices：优先用接口返回的最新价格，若还未加载则从 localStorage 读取上次缓存
  const freshPrices: Record<string, number> = (funderAssetData as any)?.livePrices ?? {};
  const hasFreshPrices = Object.keys(freshPrices).length > 0;
  // 当有新数据时写入缓存
  if (hasFreshPrices) {
    try { localStorage.setItem(PRICE_CACHE_KEY, JSON.stringify(freshPrices)); } catch {}
  }
  // 读取缓存价格（新数据优先，无新数据时用缓存）
  let cachedPrices: Record<string, number> = {};
  try { cachedPrices = JSON.parse(localStorage.getItem(PRICE_CACHE_KEY) || '{}'); } catch {}
  const funderLivePrices: Record<string, number> = hasFreshPrices ? freshPrices : cachedPrices;
  // 权益卡片用：资金方用 funderLivePrices，普通用户用 userLivePrices，两者合并
  const equityLivePrices: Record<string, number> = effectiveIsFunder
    ? funderLivePrices
    : (Object.keys(userLivePrices).length > 0 ? userLivePrices : cachedPrices);
  // 实时 USD/CNY 汇率（3秒刷新，用于 CNY 订单折算 U 值）
  // 规则G：汇率通过Cloudflare Worker代理（老方案已封存：trpc.exchange.getRate）
  const { data: cnyRateData } = useUsdCnyRate(60000);
  const cnyRate = (cnyRateData?.success && cnyRateData?.money) ? parseFloat(cnyRateData.money) : 7.2;
  // 涨跌方向计算：用 localStorage 存储上一次价格，刷新页面后第一次加载就能显示筜头
  const PREV_PRICE_CACHE_KEY = `funder_prev_prices_${ledgerId}`;
  const [funderPriceDirection, setFunderPriceDirection] = useState<Record<string, 'up' | 'down' | 'same'>>({});
  // 资产订单视图模式：large=大图（单列放大），medium=中图（左右双栏），small=小图（紧凑列表）
  const [funderViewMode, setFunderViewMode] = useState<'card' | 'order'>('card');
  useEffect(() => {
    if (!hasFreshPrices) return;
    let prevPrices: Record<string, number> = {};
    try { prevPrices = JSON.parse(localStorage.getItem(PREV_PRICE_CACHE_KEY) || '{}'); } catch {}
    const newDir: Record<string, 'up' | 'down' | 'same'> = {};
    for (const coin of Object.keys(freshPrices)) {
      const prev = prevPrices[coin];
      const curr = freshPrices[coin];
      if (!prev || prev === 0) { newDir[coin] = 'same'; }
      else if (curr > prev) { newDir[coin] = 'up'; }
      else if (curr < prev) { newDir[coin] = 'down'; }
      else { newDir[coin] = 'same'; }
    }
    setFunderPriceDirection(newDir);
    // 将最新价格存入 localStorage，下次刷新时用于对比
    try { localStorage.setItem(PREV_PRICE_CACHE_KEY, JSON.stringify(freshPrices)); } catch {};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(freshPrices)]);
  const funderOrderIds = useMemo(() => (funderAssetOrders as any[]).map((o: any) => Number(o.id)), [funderAssetOrders]);
  const { data: interestSummary } = trpc.ledger.funderGetInterestPaymentSummary.useQuery(
    { ledgerId: Number(ledgerId), orderIds: funderOrderIds },
    { enabled: isCustomAF && funderOrderIds.length > 0 }
  );
  // 后端返回数组格式 [{orderId, currency, total, exchangeRate}]，按 orderId 分组，每个订单可能有多个币种
  const interestSummaryMap = useMemo(() => {
    const arr = Array.isArray(interestSummary) ? (interestSummary as any[]) : [];
    const map: Record<number, Array<{ currency: string; total: number; exchangeRate: number }>> = {};
    for (const r of arr) {
      const oid = Number(r.orderId);
      if (!map[oid]) map[oid] = [];
      map[oid].push({ currency: r.currency || 'U', total: parseFloat(r.total || '0'), exchangeRate: parseFloat(r.exchangeRate || '1') });
    }
    return map;
  }, [interestSummary]);
  // AF 账本：YJH邀请树（仅当弹窗打开时才加载）
  // 管理员/创建人点推荐时，强制以YJH(4957151)视角查询，无需切换视角
  const YJH_USER_ID = 4957151;
  const inviteTreeViewAsId = (isOwner || isAdmin) && (user as any)?.id !== YJH_USER_ID ? YJH_USER_ID : (viewAsUserId || undefined);
  const { data: inviteTreeData, isLoading: inviteTreeLoading } = trpc.ledger.afGetInviteTree.useQuery(
    { ledgerId: Number(ledgerId), ...(inviteTreeViewAsId ? { viewAsUserId: inviteTreeViewAsId } : {}) },
    { enabled: isCustomAF && (showInviteTree || (user as any)?.id === YJH_USER_ID || viewAsUserId === YJH_USER_ID) }
  );
  // AF账本推荐页动态消息（仅yjh和管理员可见）
  const YJH_USER_ID_CONST = 4957151;
  const canSeeRecentDynamics = isCustomAF && ((user as any)?.id === YJH_USER_ID_CONST || isOwner || isAdmin);
  const { data: recentDynamics = [] } = trpc.ledger.afGetRecentDynamics.useQuery(
    { ledgerId: Number(ledgerId) },
    { enabled: canSeeRecentDynamics, refetchInterval: 30000 }
  );
  const { data: recentRecharges = [] } = trpc.ledger.afGetRecentRecharges.useQuery(
    { ledgerId: Number(ledgerId) },
    { enabled: canSeeRecentDynamics && showInviteTree, refetchInterval: 30000 }
  );
  const { data: recentOrders = [] } = trpc.ledger.afGetRecentOrders.useQuery(
    { ledgerId: Number(ledgerId) },
    { enabled: canSeeRecentDynamics && showInviteTree, refetchInterval: 30000 }
  );
  // 动态Tab刷新key
  const [dynamicsRefreshKey, setDynamicsRefreshKey] = useState(0);
  // 最新充值抽屉展开状态
  const [rechargeExpanded, setRechargeExpanded] = useState(false);
  // 最新委托抽屉展开状态
  const [pendingExpanded, setPendingExpanded] = useState(false);
  const { data: recentPendingOrders = [] } = trpc.ledger.afGetRecentPendingOrders.useQuery(
    { ledgerId: Number(ledgerId) },
    { enabled: canSeeRecentDynamics && showInviteTree, staleTime: 5 * 60 * 1000 }
  );
  // 最新成交抽屉展开状态
  const [completedExpanded, setCompletedExpanded] = useState(false);
  const { data: recentCompletedOrders = [] } = trpc.ledger.afGetRecentCompletedOrders.useQuery(
    { ledgerId: Number(ledgerId) },
    { enabled: canSeeRecentDynamics && showInviteTree, staleTime: 5 * 60 * 1000 }
  );
  // 最新赠单抽屉展开状态
  const [giftExpanded, setGiftExpanded] = useState(false);
  const { data: recentGiftOrders = [] } = trpc.ledger.afGetRecentGiftOrders.useQuery(
    { ledgerId: Number(ledgerId) },
    { enabled: canSeeRecentDynamics && showInviteTree, staleTime: 5 * 60 * 1000 }
  );
  const saveInviteNoteMutation = trpc.ledger.afSaveInviteNote.useMutation({
    onSuccess: (_data, variables) => {
      // 立即更新本地显示
      setLocalNotes(prev => ({ ...prev, [variables.targetUserId]: variables.note.trim() }));
      setEditingNoteUserId(null);
    }
  });
  // YJH专属：拨比查询（只在点击编辑时才加载）
  const isYJH = user?.id === YJH_USER_ID_CONST || user?.id === 870413;
  const { data: editingMemberRatios = [], refetch: refetchMemberRatios } = trpc.ledger.afGetMemberPayoutRatios.useQuery(
    { ledgerId: Number(ledgerId), sourceUserId: editingRatioUserId ?? 0 },
    { enabled: isYJH && editingRatioUserId !== null }
  );
  const setYjhRatioMutation = trpc.ledger.afSetYjhPayoutRatio.useMutation({
    onSuccess: () => {
      refetchMemberRatios();
      setEditingBeneficiaryId(null);
      setBeneficiaryRatioInput('');
    },
    onError: (err) => {
      alert('保存失败：' + err.message);
    }
  });
  // AH 账本：公司列表和报税授权
  const { data: ahCompanies, refetch: refetchAhCompanies } = trpc.ledger.ahListCompanies.useQuery(
    { ledgerId: Number(ledgerId) },
    { enabled: isCustomAH }
  );
  const { data: ahTaxAuths, refetch: refetchAhTaxAuths } = trpc.ledger.ahGetTaxAuthorizations.useQuery(
    { ledgerId: Number(ledgerId) },
    { enabled: isCustomAH }
  );
  // AH 账本：创建公司
  const ahCreateCompanyMutation = trpc.ledger.ahCreateCompany.useMutation({
    onSuccess: () => { refetchAhCompanies(); refetchAhTaxAuths(); },
  });
  // AJ 账本：劳方撤回自己提交的「申请中」账目
  const withdrawReimbursementMutation = trpc.ledger.withdrawReimbursement.useMutation({
    onSuccess: () => {
      alert('申请已撤销');
      refetchTransactions();
    },
    onError: (err: any) => {
      alert('撤销失败：' + (err.message || '未知错误'));
    },
  });
  // AF 账本：资金费率日志弹窗状态（已在上方 trpc 查询前声明）
  const showFundingRateLogs = showFundingRateLogs2;
  const setShowFundingRateLogs = setShowFundingRateLogs2;
  const fundingRateLogsPage = fundingRateLogsPage2;
  const setFundingRateLogsPage = setFundingRateLogsPage2;
  // 当新一页数据到来时，追加到 allLogs
  useEffect(() => {
    if (!fundingRateLogsData) return;
    if (fundingRateLogsPage2 === 1) {
      setFundingRateAllLogs(fundingRateLogsData.logs);
    } else {
      setFundingRateAllLogs(prev => [...prev, ...fundingRateLogsData.logs]);
    }
    setFundingRateHasMore(fundingRateLogsData.logs.length === 50);
    setFundingRateLoadingMore(false);
  }, [fundingRateLogsData]);
  // 弹窗关闭时重置
  useEffect(() => {
    if (!showFundingRateLogs2) {
      setFundingRateLogsPage2(1);
      setFundingRateAllLogs([]);
      setFundingRateHasMore(true);
    } else {
      // 每次打开弹窗时递增版本号，强制重新请求
      setFundingRateQueryVersion(v => v + 1);
    }
  }, [showFundingRateLogs2]);

  // AH 账本：新建公司弹窗状态
  const [showAhCreateCompany, setShowAhCreateCompany] = useState(false);
  const [ahNewCompanyName, setAhNewCompanyName] = useState('');
  const [ahNewCompanyContact, setAhNewCompanyContact] = useState('');
  const [ahNewCompanyPhone, setAhNewCompanyPhone] = useState('');
  const [ahNewCompanyTaxId, setAhNewCompanyTaxId] = useState('');


  const dietConfig = (dietStats as any)?.config;
  const dietInitialWeight = dietConfig ? Number(dietConfig.initialWeight) : null;
  const dietTargetWeight = dietConfig ? Number(dietConfig.targetWeight) : null;
  const dietCurrentWeight = (dietStats as any)?.currentWeight ?? dietInitialWeight;
  const dietLostWeight = (dietInitialWeight && dietCurrentWeight) ? Math.max(0, dietInitialWeight - dietCurrentWeight) : 0;
  const dietNeedToLose = (dietInitialWeight && dietTargetWeight) ? (dietInitialWeight - dietTargetWeight) : 0;
  const dietProgress = dietNeedToLose > 0 ? Math.min(100, Math.round((dietLostWeight / dietNeedToLose) * 100)) : 0;
  const dietTotalCalories = Number((dietStats as any)?.totalCaloriesBurned ?? 0);
  
  // 统计周期状态（从 localStorage 读取上次的选择，默认为 'month'）
  const [statsPeriod, setStatsPeriod] = useState<'all' | 'day' | 'week' | 'month' | 'quarter' | 'year'>(() => {
    const saved = localStorage.getItem('statsPeriod');
    return (saved as 'all' | 'day' | 'week' | 'month' | 'quarter' | 'year') || 'month';
  });
  // AJ账本专用独立统计周期，不影响普通账本的statsPeriod（持久化到localStorage）
  const [ajStatsPeriod, setAjStatsPeriod] = useState<'all' | 'day' | 'week' | 'month' | 'quarter' | 'year'>(() => {
    const saved = localStorage.getItem(`ajStatsPeriod_ledger_${ledgerId}`);
    return (saved as 'all' | 'day' | 'week' | 'month' | 'quarter' | 'year') || 'month';
  });
  // AJ账本视角切换：企业负责人 / 业务负责人（仅isAdmin角色有此切换）
  // 优先读取 localStorage 中上次的选择，没有缓存时 funder/owner 默认资方，member 默认劳方
  const [ajViewMode, setAjViewMode] = useState<'owner' | 'salesman'>(() => {
    const cacheKey = `ajViewMode_ledger_${ledgerId}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached === 'owner' || cached === 'salesman') return cached;
    return ((ledgerData as any)?.userRole === 'funder' || (ledgerData as any)?.userRole === 'owner') ? 'owner' : 'salesman';
  });
  const [showPeriodMenu, setShowPeriodMenu] = useState(false);
  const [aiProductDetail, setAiProductDetail] = useState<string | null>(null);
  const [aiProductQty, setAiProductQty] = useState(1);
  const [aiCarouselIdx, setAiCarouselIdx] = useState(0);
  const aiCarouselRef = useRef<HTMLDivElement>(null);
  // AI 账本：当前选中的商品（null=列表页, 'icecream'=冰淇淋详情, 'chocolate'=巧克力详情）
  const [aiSelectedProduct, setAiSelectedProduct] = useState<'icecream' | 'chocolate' | 'charger' | null>(null);

  // AI 账本：商品数据（硬编码，宜家系列）
  const aiProducts = null; // 商品数据已清空，待重新配置
  // AI 账本：股权记录（支持观察视角）
  const effectiveShareUserId = viewAsUserId ?? user?.id ?? 0;
  const { data: myShares } = trpc.equity.getMemberShares.useQuery(
    { ledgerId: Number(ledgerId), userId: effectiveShareUserId },
    { enabled: isCustomAI && !!effectiveShareUserId }
  );
  const { data: memberStats } = trpc.equity.getMemberStats.useQuery(
    { userId: effectiveShareUserId },
    { enabled: isCustomAI && !!effectiveShareUserId }
  );
  // 全网持股结构数据（用于脉动网持股结构容器）
  const { data: globalShareStats } = trpc.equity.getGlobalShareStats.useQuery(
    { ledgerId: Number(ledgerId) },
    { enabled: isCustomAI }
  );
  // 全网资金股实时总张数（股本+实时股息）
  const globalAngelTotal = useTotalSharesWithDividend(globalShareStats?.angelShares ?? []);
  // 全网市场资源股实时总张数（股本+实时股息）
  const globalMarketTotal = useTotalSharesWithDividend(globalShareStats?.marketShares ?? []);
  // 资金股总持股（股本+实时股息，仅统计资金股）
  const totalSharesWithDividend = useTotalSharesWithDividend(myShares ?? [], '资金股');
  // 市场资源股总持股（股本+实时股息）
  const totalMarketSharesWithDividend = useTotalSharesWithDividend(myShares ?? [], '资源股');
  // 所有类型股权总和（用于顶部累计股权格子，未来新增类型自动包含）
  const totalAllSharesWithDividend = useTotalSharesWithDividend(myShares ?? []);
  // 查询当前用户权重
  const { data: userWeight } = trpc.equity.getMemberWeightScore.useQuery(
    { ledgerId: Number(ledgerId), userId: effectiveShareUserId },
    { enabled: isCustomAI && !!effectiveShareUserId, refetchOnWindowFocus: true, refetchOnMount: 'always', staleTime: 0 }
  );
  const totalWeight = userWeight?.totalMultiplier ?? 1.00;
  const resourceWeight = userWeight?.resourceMultiplier ?? 0;
  const capitalWeight = userWeight?.capitalMultiplier ?? 0;
  // 加权股权 = 原始张数 × 权重
  const weightedSharesTotal = totalAllSharesWithDividend * totalWeight;
  // 权重详情弹窗状态（必须在useQuery之前声明，避免初始化前访问）
  const [showWeightDetail, setShowWeightDetail] = useState(false);
  // 权重详情（仅弹窗打开时加载）
  const { data: weightDetail, isLoading: weightDetailLoading } = trpc.equity.getWeightDetail.useQuery(
    { userId: effectiveShareUserId },
    { enabled: isCustomAI && !!effectiveShareUserId && showWeightDetail, staleTime: 0 }
  );

  // 当前选中商品的快捷引用
  const aiProduct = aiSelectedProduct && aiProducts ? aiProducts[aiSelectedProduct] : null;
  const aiProductImages = aiProduct ? aiProduct.detailImages : [];
  const aiCarouselImages = aiProduct ? aiProduct.carouselImages : [];
  // 资金方订单详情弹窗 state
  const [selectedFunderOrder, setSelectedFunderOrder] = useState<any>(null);

  // 食物热量扫描相关 state
  const [foodScanImage, setFoodScanImage] = useState<string | null>(null); // base64 图片
  const [foodScanResult, setFoodScanResult] = useState<any>(null); // AI 分析结果
  const [foodScanLoading, setFoodScanLoading] = useState(false); // 加载中
  const [foodScanError, setFoodScanError] = useState<string | null>(null); // 错误信息
  const [shareholdingExpanded, setShareholdingExpanded] = useState(false); // 持股结构折叠状态（保留兼容）
  // 持股结构快照：展开时固定一次，不再实时滚动
  const [shareholdingSnapshot, setShareholdingSnapshot] = useState<{ angel: number; market: number } | null>(null);
  const [showShareholdingModal, setShowShareholdingModal] = useState(false); // 持股结构弹窗
  const [showEquityHistory, setShowEquityHistory] = useState(false); // 股权流水弹窗
  const [equityHistoryUserId, setEquityHistoryUserId] = useState<number | null>(null); // 查看哪个用户的流水（null=自己）
  const foodFileInputRef = useRef<HTMLInputElement>(null); // 文件选择器
  const foodCameraInputRef = useRef<HTMLInputElement>(null); // 摄像头输入
  
  // 保存统计周期选择到 localStorage
  useEffect(() => {
    localStorage.setItem('statsPeriod', statsPeriod);
  }, [statsPeriod]);
  // 保存AJ账本统计周期到 localStorage
  useEffect(() => {
    localStorage.setItem(`ajStatsPeriod_ledger_${ledgerId}`, ajStatsPeriod);
  }, [ajStatsPeriod, ledgerId]);

  // 记录最后访问的账本ID到localStorage
  useEffect(() => {
    if (ledgerId) {
      localStorage.setItem('lastVisitedLedgerId', String(ledgerId));
    }
  }, [ledgerId]);

  // AJ账本：如果 localStorage 中没有缓存，待角色加载完成后设置默认值
  // AJ账本角色：owner=创始人, admin=企业主(资方), member=业务员(劳方)，不存在funder角色
  useEffect(() => {
    if (isCustomAJ && (isAdmin || isOwner)) {
      const cacheKey = `ajViewMode_ledger_${ledgerId}`;
      const cached = localStorage.getItem(cacheKey);
      // 只有当 localStorage 中没有缓存时，才设置默认资方视角
      if (!cached) {
        setAjViewMode('owner');
      }
    }
  }, [isCustomAJ, isAdmin, isOwner, ledgerId]);

  // AJ账本（76号）：禁止左滑返回手势（iOS swipe-back / 浏览器手势导航）
  useEffect(() => {
    if (!isCustomAJ) return;
    let startX = 0;
    let startY = 0;
    const onTouchStart = (e: TouchEvent) => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    };
    const onTouchMove = (e: TouchEvent) => {
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      // 判断是否为从左边缘（0-30px）向右滑动，且水平分量大于垂直分量
      if (startX < 30 && dx > 0 && Math.abs(dx) > Math.abs(dy)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
    };
  }, [isCustomAJ]);

  // 定制账本(AD)：永忆
  const isCustomAD = (ledgerData as any)?.type === 'custom_ad';
  if (!isLoading && !error && isCustomAD && ledgerData) {
    return (
      <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="text-gray-500">加载中...</div></div>}>
        <MemoLedgerPage ledgerId={ledgerId} ledgerData={ledgerData} user={user} isAdmin={isOwner || isAdmin} />
      </Suspense>
    );
  }

  // 定制账本(AA)：使用专用UI
  const isCustomAA = (ledgerData as any)?.type === 'custom_aa';
  if (!isLoading && !error && isCustomAA && ledgerData) {
    return (
      <Suspense fallback={<div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#FFEBEE' }}><div style={{ color: '#222222' }}>加载中...</div></div>}>
        <LedgerDetailAA
          ledgerId={ledgerId}
          ledgerData={ledgerData}
          membersData={membersData || []}
          transactionsData={transactionsData || []}
          refetchTransactions={refetchTransactions}
          user={user}
        />
      </Suspense>
    );
  }

  // 定制账本(AG)：共享图片助记词
  const isCustomAG = (ledgerData as any)?.type === 'custom_ag';
  if (!isLoading && !error && isCustomAG && ledgerData) {
    return (
      <Suspense fallback={<div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#FAF3ED' }}><div style={{ color: '#222222' }}>加载中...</div></div>}>
        <LedgerDetailAG
          ledgerId={ledgerId}
          ledgerData={ledgerData}
          membersData={membersData || []}
          user={user}
        />
      </Suspense>
    );
  }

  if (isLoading) {
    // 读取缓存的账本类型，决定骨架屏背景色，避免闪红色
    let cachedType = '';
    try { cachedType = localStorage.getItem(`ledger_type_${ledgerId}`) || ''; } catch (e) {}
    const isBlueTheme = cachedType === 'custom_af' || cachedType === 'custom_ah' || cachedType === 'custom_aj';
    const isDarkGold = Number(ledgerId) === 59 || cachedType === 'custom_ai';
    const skeletonBg = isDarkGold
      ? 'linear-gradient(135deg, #0A0A0A 0%, #1A1A1A 100%)'
      : isBlueTheme
        ? 'linear-gradient(135deg, #1A56DB 0%, #3B82F6 100%)'
        : '#D32F2F';
    const skeletonBodyBg = isDarkGold ? '#FAF3ED' : isBlueTheme ? '#f5f7fa' : '#FAF3ED';
    return (
      <div className="min-h-screen flex flex-col" style={{ background: skeletonBg }}>
        <div className="h-32 flex-shrink-0"></div>
        <div className="flex-1 rounded-t-2xl flex items-center justify-center" style={{ backgroundColor: skeletonBodyBg }}>
          <div style={{ color: '#888' }} className="text-base">加载中...</div>
        </div>
      </div>
    );
  }
  
  if (error || !ledgerData) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#FFEBEE' }}>
        <div style={{ color: '#222222' }} className="text-lg">账本不存在或您没有权限访问</div>
      </div>
    );
  }
  
  // 使用真实数据
  const hasRecords = transactionsData && transactionsData.length > 0;

  // 根据选择的周期计算统计数据
  const now = new Date();
  // 北京时间 UTC+8
  const bjNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const today = bjNow.toISOString().split('T')[0];
  const currentMonth = today.slice(0, 7);
  const currentYear = today.slice(0, 4);
  
  // 计算本周的开始日期（周一）——北京时间
  const getWeekStart = (bjDate: Date) => {
    const d = new Date(bjDate);
    const day = d.getUTCDay();
    d.setUTCDate(d.getUTCDate() - day + (day === 0 ? -6 : 1));
    return d.toISOString().split('T')[0];
  };
  const weekStart = getWeekStart(bjNow);
  
  const monthlyStats = {
    income: 0,
    expense: 0,
    balance: 0,
  };
  
  // 判断是否有日期筛选：如果有则使用筛选范围，否则使用statsPeriod
  const hasDateFilter = filters.startDate || filters.endDate;
  
  if (transactionsData) {
    transactionsData.forEach((day: any) => {
      let shouldInclude = false;
      
      if (hasDateFilter) {
        // 有日期筛选时，统计所有返回的数据（后端已经按筛选范围过滤）
        shouldInclude = true;
      } else {
        // 没有日期筛选时，按statsPeriod统计（AJ账本使用ajStatsPeriod）
        const effectivePeriod = isCustomAJ ? ajStatsPeriod : statsPeriod;
        switch (effectivePeriod) {
          case 'day':
            shouldInclude = day.date === today;
            break;
          case 'week':
            shouldInclude = day.date >= weekStart && day.date <= today;
            break;
          case 'month':
            shouldInclude = day.date.startsWith(currentMonth);
            break;
          case 'quarter': {
            const qtr = Math.floor(bjNow.getUTCMonth() / 3);
            const qStart = new Date(Date.UTC(bjNow.getUTCFullYear(), qtr * 3, 1)).toISOString().split('T')[0];
            shouldInclude = day.date >= qStart && day.date <= today;
            break;
          }
          case 'year':
            shouldInclude = day.date.startsWith(currentYear);
            break;
          case 'all':
            shouldInclude = true;
            break;
        }
      }
      
      if (shouldInclude) {
        monthlyStats.income += day.income || 0;
        monthlyStats.expense += day.expense || 0;
      }
    });
    monthlyStats.balance = monthlyStats.income - monthlyStats.expense;
  }



  // 抽奖活动分组（在 return 前计算，避免 JSX 中使用 IIFE）
  const allLotteryActivities = (lotteryActivities as any[]) ?? [];
  // 普通用户不显示草稿状态；管理员/创建者可看到草稿
  const isManager = (ledgerData as any)?.userRole === 'owner' || (ledgerData as any)?.userRole === 'admin';
  const activeActivities = allLotteryActivities.filter((a: any) => {
    if (a.status === 'draft') return isManager; // 草稿只对管理员可见
    return ['open', 'drawing'].includes(a.status);
  });
  const pastActivities = allLotteryActivities.filter((a: any) => ['completed', 'cancelled'].includes(a.status));
  const displayLotteryList = lotteryTab === 'active' ? activeActivities : pastActivities;

  const lotteryStatusMap: Record<string, { label: string; color: string; icon: any }> = {
    draft: { label: '草稿', color: 'text-gray-500 bg-gray-100', icon: null },
    open: { label: '报名中', color: 'text-green-700 bg-green-100', icon: CheckCircle },
    drawing: { label: '开奖中', color: 'text-orange-700 bg-orange-100', icon: Loader },
    completed: { label: '已结束', color: 'text-gray-500 bg-gray-100', icon: CheckCircle },
    cancelled: { label: '已取消', color: 'text-red-700 bg-red-100', icon: XCircle },
  };
  const lotteryModeMap: Record<string, string> = {
    instant: '即时抽奖',
    scheduled: '定时开奖',
    milestone: '里程碑触发',
  };
  const lotterySeedMap: Record<string, string> = {
    sh_index: '上证指数',
    sz_index: '深证成指',
    ssq: '双色球',
    dlt: '超级大乐透',
  };
  const lotteryRegMap: Record<string, string> = {
    open: '自由报名',
    invite: '邀请制',
    organizer_add: '主办方添加',
  };

  // 倒计时辅助函数（tick 参数确保每秒重新计算）
  const formatCountdown = (targetTime: string | null | undefined): string => {
    void tick; // 依赖 tick 以触发每秒重渲染
    if (!targetTime) return '';
    const diff = new Date(targetTime).getTime() - Date.now();
    if (diff <= 0) return '即将开奖';
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    if (h > 24) {
      const d = Math.floor(h / 24);
      return `还有 ${d} 天`;
    }
    if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  };

  // 参与进度百分比（基于 max_participants）
  const getProgressPct = (activity: any): number => {
    const max = activity.max_participants;
    const cur = activity.participantCount ?? 0;
    if (!max || max <= 0) return 0;
    return Math.min(100, Math.round((cur / max) * 100));
  };

  // 奖品占位图（如果没有图片，用渐变色占位）
  const PRIZE_PLACEHOLDER_COLORS = [
    'from-[#D32F2F] to-[#B71C1C]',
    'from-[#C62828] to-[#880E4F]',
    'from-[#AD1457] to-[#6A1B9A]',
    'from-[#4527A0] to-[#1565C0]',
    'from-[#0277BD] to-[#00695C]',
  ];

  // 资方视角：直接返回独立页面，完全绕过原有复杂容器结构，避免蓝色横线
  if (isCustomAJ && isFunder && !viewAsUserId) {
    return (
      <div className="flex flex-col min-h-screen bg-white">
        <AJOwnerPanel ledgerId={Number(ledgerId)} isFunder={true} />
      </div>
    );
  }

  return (
    <div className={(isCustomAI || isCustomAJ) ? "flex flex-col" : "min-h-screen"} style={isCustomAI ? {
      height: '100dvh',
      backgroundColor: '#E8601C',
      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23n)' opacity='0.06'/%3E%3C/svg%3E"), repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(58,20,0,0.018) 2px, rgba(58,20,0,0.018) 3px), repeating-linear-gradient(90deg, transparent, transparent 4px, rgba(58,20,0,0.012) 4px, rgba(58,20,0,0.012) 5px)`,
    } : {}}>
      {/* 顶部区域 */}
      <div className={isCustomAJ && isFunder && !viewAsUserId ? "pb-0" : "pb-4"} style={isCustomAI ? { flexShrink: 0, background: 'linear-gradient(160deg, #3D1F0D 0%, #5C2E10 30%, #3D1F0D 100%)', color: '#1A0A00', borderBottom: '1px solid rgba(58,20,0,0.4)' } : (isCustomAF || isCustomAH) ? { background: 'linear-gradient(135deg, #1A56DB 0%, #3B82F6 100%)', color: '#FFFFFF' } : isCustomAJ ? (isFunder && !viewAsUserId ? { backgroundColor: 'transparent' } : { backgroundColor: '#1A2B4A', color: '#FFFFFF' }) : { backgroundColor: '#D32F2F', color: '#FFFFFF' }}>
        {/* AF/AH 账本：顶部两行布局 */}
        {(isCustomAF || isCustomAH || isCustomAI || isCustomAJ) ? (
          <div className="px-4 pt-3 pb-2">
            {/* 第一行：头像 + 名字 + 设置齿轮 */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                {(() => {
                  const viewTarget = viewAsUserId ? (membersData as any[])?.find((m: any) => m.userId === viewAsUserId) : null;
                  return (
                    <div
                      className={(!viewAsUserId && (isCustomAJ ? (isOwner || (!isOwner && !viewAsUserId)) : (isOwner || isAdmin))) ? 'cursor-pointer relative' : 'relative'}
                      onClick={() => {
                        if (isCustomAJ && !viewAsUserId) {
                          if (isOwner) { setViewAsSearch(''); setShowViewAsPicker(true); }
                          else { window.location.href = `/ledger/${ledgerId}/aj-market-team`; }
                        } else if (!isCustomAJ && !viewAsUserId && (isOwner || isAdmin)) { setViewAsSearch(''); setShowViewAsPicker(true); }
                      }}
                    >
                      {viewTarget ? (
                        <UserAvatar username={viewTarget.username} avatar={viewTarget.avatar} nickname={viewTarget.nickname} size="md" />
                      ) : user ? (
                        <UserAvatar username={user.username} avatar={user.avatar} nickname={user.nickname} size="md" />
                      ) : null}
                      {!viewAsUserId && (isCustomAJ ? true : (isOwner || isAdmin)) && (
                        <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-white/90 flex items-center justify-center">
                          {isCustomAJ && !isOwner
                            ? <TrendingUp className="w-2.5 h-2.5 text-red-600" />
                            : <Users className="w-2.5 h-2.5 text-blue-600" />}
                        </div>
                      )}
                    </div>
                  );
                })()}
                <div className="flex flex-col">
                  {isCustomAI ? (
                    <div className="flex flex-col">
                      <div className="flex items-center gap-1.5">
                        <span className="text-base font-semibold" style={{ color: '#FFF8F0' }}>{ledgerData.name}</span>
                        <span className="text-sm" style={{ color: 'rgba(255,248,240,0.5)' }}>·</span>
                        <span className="text-sm" style={{ color: 'rgba(255,248,240,0.85)' }}>
                          {(() => {
                            const viewTarget = viewAsUserId ? (membersData as any[])?.find((m: any) => m.userId === viewAsUserId) : null;
                            const target = viewTarget || user;
                            if (!target) return null;
                            const nick = (target as any).nickname;
                            const uname = (target as any).username;
                            if (nick && nick !== uname) return <>{nick} <span style={{ color: 'rgba(255,248,240,0.5)', fontSize: '0.75rem' }}>@{uname}</span></>;
                            return <>@{uname}</>;
                          })()}
                        </span>
                        {myShares && myShares.length > 0 && (myShares[0] as any).shareNo && (
                          <>
                            <span className="text-sm" style={{ color: 'rgba(255,248,240,0.4)' }}>·</span>
                            <span className="text-sm font-bold tracking-widest" style={{ color: 'rgba(255,248,240,0.9)' }}>{(myShares[0] as any).shareNo}</span>
                          </>
                        )}
                      </div>
                    </div>
                  ) : (
                    <>
                      <span className="text-base font-semibold">{ledgerData.name}</span>
                      {viewAsUserId && (() => {
                        const viewTarget = (membersData as any[])?.find((m: any) => m.userId === viewAsUserId);
                        return viewTarget ? <span className="text-xs text-white/70">查看: {viewTarget.nickname || viewTarget.username}</span> : null;
                      })()}
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {/* 快捷按钮：根据数据库配置动态显示（37/52/59号账本） */}
                {isShortcutLedger && myShortcuts && (() => {
                  const _sc = [myShortcuts.gold, myShortcuts.qq, myShortcuts.oil, myShortcuts.stock, myShortcuts.digitalB, myShortcuts.ledger59, (myShortcuts as any).ethPosition, (myShortcuts as any).worldCup].filter(Boolean).length;
                  if (_sc >= 4) return null;
                  return (<>
                    {/* 黄金（MT5）*/}
                    {myShortcuts.gold && (
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer overflow-hidden flex-shrink-0"
                        style={{ border: '1.5px solid rgba(255,255,255,0.5)' }}
                        onClick={() => setLocation(`/ledger/${ledgerId}/gold`)}
                        title="黄金行情"
                      >
                        <img
                          src="https://files.manuscdn.com/user_upload_by_module/session_file/310519663279996243/OPICjhxYcoKhRcPL.png"
                          alt="MT5"
                          className="w-full h-full object-cover rounded-full"
                        />
                      </div>
                    )}
                    {/* QQ */}
                    {myShortcuts.qq && (
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer overflow-hidden flex-shrink-0"
                        style={{ border: '1.5px solid rgba(255,255,255,0.5)' }}
                        onClick={() => setLocation(`/ledger/${ledgerId}/qq`)}
                        title="QQ"
                      >
                        <img
                          src="https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/qq-icon-circle.png"
                          alt="QQ"
                          className="w-full h-full object-cover rounded-full"
                        />
                      </div>
                    )}
                    {/* 石油 */}
                    {myShortcuts.oil && (
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer overflow-hidden flex-shrink-0"
                        style={{ border: '1.5px solid rgba(255,255,255,0.5)', backgroundColor: 'rgba(0,0,0,0.3)' }}
                        onClick={() => setLocation(`/ledger/${ledgerId}/oil`)}
                        title="石油业务"
                      >
                        <img
                          src="https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/oil-pump-icon-circle.png"
                          alt="石油"
                          className="w-full h-full object-cover rounded-full"
                        />
                      </div>
                    )}
                    {/* 股票（跳转37号账本） */}
                    {myShortcuts.stock && (
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer overflow-hidden flex-shrink-0"
                        style={{ border: '1.5px solid rgba(255,255,255,0.5)' }}
                        onClick={() => { sessionStorage.setItem('ledger_back_from', String(ledgerId)); setLocation('/ledger/37'); }}
                        title="股票行情"
                      >
                        <img
                          src="https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/ths-stock-icon-circle.png"
                          alt="股票"
                          className="w-full h-full object-cover rounded-full"
                        />
                      </div>
                    )}
                    {/* 数字B（跳转52号账本） */}
                    {myShortcuts.digitalB && (
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer overflow-hidden flex-shrink-0"
                        style={{ border: '1.5px solid rgba(255,255,255,0.5)' }}
                        onClick={() => { sessionStorage.setItem('ledger_back_from', String(ledgerId)); setLocation('/ledger/52'); }}
                        title="数字B"
                      >
                        <img
                          src="https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/icons/btc-icon-trimmed.png"
                          alt="数字B"
                          className="w-full h-full object-cover rounded-full"
                        />
                      </div>
                    )}
                    {/* 59号账本（蓄水池股东）快捷按钮 */}
                    {myShortcuts.ledger59 && (
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer overflow-hidden flex-shrink-0"
                        style={{ border: '1.5px solid rgba(255,255,255,0.5)' }}
                        onClick={() => { sessionStorage.setItem('ledger_back_from', String(ledgerId)); setLocation('/ledger/59'); }}
                        title="蓄水池股东"
                      >
                        <img
                          src="https://files.manuscdn.com/user_upload_by_module/session_file/310519663279996243/gZMsAzlHHuDFuUTJ.png"
                          alt="蓄水池"
                          className="w-full h-full object-cover rounded-full"
                        />
                      </div>
                    )}
                    {/* ETH持仓计算器快捷按钮 */}
                    {(myShortcuts as any).ethPosition && (
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer flex-shrink-0"
                        style={{ border: '1.5px solid rgba(255,255,255,0.5)', backgroundColor: 'rgba(255,255,255,0.15)' }}
                        onClick={() => setLocation(`/ledger/${ledgerId}/position-calc${viewAsUserId ? `?viewAs=${viewAsUserId}` : ''}`)}
                        title="Eth智能仓位管理"
                      >
                        <svg width="18" height="18" viewBox="0 0 256 417" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M127.961 0L125.166 9.5V285.168L127.961 287.958L255.923 212.32L127.961 0Z" fill="#FFFFFF"/>
                          <path d="M127.962 0L0 212.32L127.962 287.958V154.158V0Z" fill="rgba(255,255,255,0.6)"/>
                          <path d="M127.961 312.187L126.386 314.107V412.301L127.961 416.962L255.931 236.551L127.961 312.187Z" fill="#FFFFFF"/>
                          <path d="M127.962 416.962V312.187L0 236.551L127.962 416.962Z" fill="rgba(255,255,255,0.6)"/>
                          <path d="M127.961 287.957L255.923 212.319L127.961 154.158V287.957Z" fill="rgba(255,255,255,0.8)"/>
                          <path d="M0 212.319L127.962 287.957V154.158L0 212.319Z" fill="rgba(255,255,255,0.4)"/>
                        </svg>
                      </div>
                    )}
                    {/* 世界杯快捷按钮 */}
                    {(myShortcuts as any).worldCup && (
                      <div
                        className="w-8 h-8 rounded-full cursor-pointer overflow-hidden flex-shrink-0"
                        style={{ border: '1.5px solid rgba(255,255,255,0.5)', position: 'relative' }}
                        onClick={() => setLocation('/world-cup')}
                        title="FIFA World Cup 2026"
                      >
                        <img
                          src="/wc2026-logo.png"
                          alt="World Cup"
                          style={{ width: '105%', height: '105%', objectFit: 'cover', position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
                        />
                      </div>
                    )}
                  </>);
                })()}

              </div>
              {/* 右侧按钮组：独立flex容器，与左侧头像+名字真正两端对齐 */}
              <div className="flex items-center gap-2 flex-shrink-0">
                {/* AJ账本：刷新/返回按钮（与劳/资开关同行，仅AJ账本显示） */}
                {isCustomAJ && (
                  <>
                    {/* 签约按钮：仅劳方（非资方、非管理员）可见 */}
                    {!isFunder && !isAdmin && (
                      <button
                        onClick={() => setLocation(`/ledger/${ledgerId}/aj-contract`)}
                        className="flex items-center justify-center text-xs font-medium flex-shrink-0"
                        style={{ height: 32, padding: '0 12px', borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.35)', color: '#fff' }}
                      >
                        签约
                      </button>
                    )}
                    <button
                      onClick={() => window.location.reload()}
                      className="flex items-center justify-center text-xs font-medium text-white flex-shrink-0"
                      style={{ height: 32, padding: '0 12px', borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.35)' }}
                    >
                      刷新
                    </button>
                    <button
                      onClick={() => { sessionStorage.removeItem('ledger_back_from'); setLocation(backTarget); }}
                      className="flex items-center justify-center text-xs font-medium text-white flex-shrink-0"
                      style={{ height: 32, padding: '0 12px', borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.35)' }}
                    >
                      返回
                    </button>
                  </>
                )}

                {/* AJ账本：劳/资视角切换（圆形滑动开关，admin、funder或owner可见） */}
                {isCustomAJ && (isAdmin || isFunder || isOwner) && !viewAsUserId && (
                  <button
                    onClick={() => {
                      const newMode = ajViewMode === 'salesman' ? 'owner' : 'salesman';
                      setAjViewMode(newMode);
                      localStorage.setItem(`ajViewMode_ledger_${ledgerId}`, newMode);
                    }}
                    className="relative flex items-center flex-shrink-0"
                    style={{
                      width: 56,
                      height: 32,
                      borderRadius: 16,
                      backgroundColor: 'rgba(255,255,255,0.18)',
                      border: '1px solid rgba(255,255,255,0.35)',
                      padding: 0,
                      overflow: 'hidden',
                    }}
                    aria-label={ajViewMode === 'salesman' ? '切换到资方' : '切换到劳方'}
                  >
                    {/* 背景侧文字（未激活侧，固定位置，白色半透明） */}
                    <span
                      className="absolute flex items-center justify-center text-xs font-bold"
                      style={{
                        width: 26,
                        height: 26,
                        left: ajViewMode === 'salesman' ? 27 : 3,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        color: 'rgba(255,255,255,0.6)',
                        zIndex: 1,
                      }}
                    >
                      {ajViewMode === 'salesman' ? '资' : '劳'}
                    </span>
                    {/* 滑块（带当前激活文字，字色深红可见） */}
                    <span
                      className="absolute flex items-center justify-center text-xs font-bold"
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: '50%',
                        backgroundColor: 'rgba(255,255,255,0.95)',
                        color: '#8B0000',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        left: ajViewMode === 'salesman' ? 3 : 27,
                        transition: 'left 0.2s ease',
                        boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
                        zIndex: 2,
                      }}
                    >
                      {ajViewMode === 'salesman' ? '劳' : '资'}
                    </span>
                  </button>
                )}

                {/* 设置按鈕：AJ账本仅owner可见，其他账本管理员可见 */}
                {(isCustomAJ ? effectiveIsOwner : effectiveIsManager) && (
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer flex-shrink-0"
                    style={{ backgroundColor: 'rgba(255,255,255,0.18)' }}
                    onClick={() => setLocation(`/ledger/${ledgerId}/settings`)}
                  >
                    <Settings className="w-4 h-4 text-white" />
                  </div>
                )}
              </div>
            </div>
            {/* 第二行：操作按钮（圆圈多时分三行） */}
            <div className="flex flex-col gap-1.5 mt-2">
              {/* 圆圈多时（>=4个）移到第二行，与头像左对齐（适用于所有shortcut账本） */}
              {isShortcutLedger && myShortcuts && (() => {
                const _sc2 = [myShortcuts.gold, myShortcuts.qq, myShortcuts.oil, myShortcuts.stock, myShortcuts.digitalB, myShortcuts.ledger59, (myShortcuts as any).ethPosition, (myShortcuts as any).worldCup].filter(Boolean).length;
                if (_sc2 < 4) return null;
                return (
                  <div className="flex items-center gap-1.5 w-full mb-1.5">
                    {myShortcuts.gold && (
                      <div className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer overflow-hidden flex-shrink-0" style={{ border: '1.5px solid rgba(255,255,255,0.5)' }} onClick={() => setLocation(`/ledger/${ledgerId}/gold`)} title="黄金行情">
                        <img src="https://files.manuscdn.com/user_upload_by_module/session_file/310519663279996243/OPICjhxYcoKhRcPL.png" alt="MT5" className="w-full h-full object-cover rounded-full" />
                      </div>
                    )}
                    {myShortcuts.qq && (
                      <div className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer overflow-hidden flex-shrink-0" style={{ border: '1.5px solid rgba(255,255,255,0.5)' }} onClick={() => setLocation(`/ledger/${ledgerId}/qq`)} title="QQ">
                        <img src="https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/qq-icon-circle.png" alt="QQ" className="w-full h-full object-cover rounded-full" />
                      </div>
                    )}
                    {myShortcuts.oil && (
                      <div className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer overflow-hidden flex-shrink-0" style={{ border: '1.5px solid rgba(255,255,255,0.5)', backgroundColor: 'rgba(0,0,0,0.3)' }} onClick={() => setLocation(`/ledger/${ledgerId}/oil`)} title="石油业务">
                        <img src="https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/oil-pump-icon-circle.png" alt="石油" className="w-full h-full object-cover rounded-full" />
                      </div>
                    )}
                    {myShortcuts.stock && (
                      <div className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer overflow-hidden flex-shrink-0" style={{ border: '1.5px solid rgba(255,255,255,0.5)' }} onClick={() => { sessionStorage.setItem('ledger_back_from', String(ledgerId)); setLocation('/ledger/37'); }} title="股票行情">
                        <img src="https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/ths-stock-icon-circle.png" alt="股票" className="w-full h-full object-cover rounded-full" />
                      </div>
                    )}
                    {myShortcuts.digitalB && (
                      <div className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer overflow-hidden flex-shrink-0" style={{ border: '1.5px solid rgba(255,255,255,0.5)' }} onClick={() => { sessionStorage.setItem('ledger_back_from', String(ledgerId)); setLocation('/ledger/52'); }} title="数字B">
                        <img src="https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/icons/btc-icon-trimmed.png" alt="数字B" className="w-full h-full object-cover rounded-full" />
                      </div>
                    )}
                    {myShortcuts.ledger59 && (
                      <div className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer overflow-hidden flex-shrink-0" style={{ border: '1.5px solid rgba(255,255,255,0.5)' }} onClick={() => { sessionStorage.setItem('ledger_back_from', String(ledgerId)); setLocation('/ledger/59'); }} title="蓄水池股东">
                        <img src="https://files.manuscdn.com/user_upload_by_module/session_file/310519663279996243/gZMsAzlHHuDFuUTJ.png" alt="蓄水池" className="w-full h-full object-cover rounded-full" />
                      </div>
                    )}
                    {(myShortcuts as any).ethPosition && (
                      <div className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer flex-shrink-0" style={{ border: '1.5px solid rgba(255,255,255,0.5)', backgroundColor: 'rgba(255,255,255,0.15)' }} onClick={() => setLocation(`/ledger/${ledgerId}/position-calc${viewAsUserId ? `?viewAs=${viewAsUserId}` : ''}`)} title="Eth智能仓位管理">
                        <svg width="18" height="18" viewBox="0 0 256 417" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M127.961 0L125.166 9.5V285.168L127.961 287.958L255.923 212.32L127.961 0Z" fill="#FFFFFF"/>
                          <path d="M127.962 0L0 212.32L127.962 287.958V154.158V0Z" fill="rgba(255,255,255,0.6)"/>
                          <path d="M127.961 312.187L126.386 314.107V412.301L127.961 416.962L255.931 236.551L127.961 312.187Z" fill="#FFFFFF"/>
                          <path d="M127.962 416.962V312.187L0 236.551L127.962 416.962Z" fill="rgba(255,255,255,0.6)"/>
                          <path d="M127.961 287.957L255.923 212.319L127.961 154.158V287.957Z" fill="rgba(255,255,255,0.8)"/>
                          <path d="M0 212.319L127.962 287.957V154.158L0 212.319Z" fill="rgba(255,255,255,0.4)"/>
                        </svg>
                      </div>
                    )}
                    {/* 世界杯快捷按钮 */}
                    {(myShortcuts as any).worldCup && (
                      <div className="w-8 h-8 rounded-full cursor-pointer overflow-hidden flex-shrink-0" style={{ border: '1.5px solid rgba(255,255,255,0.5)', position: 'relative' }} onClick={() => setLocation('/world-cup')} title="FIFA World Cup 2026">
                        <img src="/wc2026-logo.png" alt="World Cup" style={{ width: '105%', height: '105%', objectFit: 'cover', position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }} />
                      </div>
                    )}
                  </div>
                );
              })()}
              {/* AI账本：操作按钮行（刷新/结构/记录/返回） */}
              {isCustomAI && (
                <div className="flex items-center gap-2 w-full">
                  <button
                    onClick={() => window.location.reload()}
                    className="flex-1 py-1.5 rounded-full text-sm font-medium text-center"
                    style={{ background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.5)', color: '#FFF8F0' }}
                  >
                    刷新
                  </button>
                  <button
                    onClick={() => { setShareholdingSnapshot({ angel: globalAngelTotal, market: globalMarketTotal }); setShowShareholdingModal(true); }}
                    className="flex-1 py-1.5 rounded-full text-sm font-medium text-center"
                    style={{ background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.5)', color: '#FFF8F0' }}
                  >
                    结构
                  </button>
                  <button
                    onClick={() => {
                      const targetUserId = viewAsUserId ?? user?.id ?? 0;
                      const isAdminFlag = !viewAsUserId && (isOwner || isAdmin);
                      const memberNickname = viewAsUserId
                        ? ((membersData as any[])?.find((m: any) => m.userId === viewAsUserId)?.nickname || '成员')
                        : (user?.nickname || user?.username || '我');
                      setLocation(`/ledger/${ledgerId}/equity-history?userId=${targetUserId}&isAdmin=${isAdminFlag ? 1 : 0}&nickname=${encodeURIComponent(memberNickname)}`);
                    }}
                    className="flex-1 py-1.5 rounded-full text-sm font-medium text-center"
                    style={{ background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.5)', color: '#FFF8F0' }}
                  >
                    记录
                  </button>
                  <button
                    onClick={() => setLocation('/work-log')}
                    className="flex-1 py-1.5 rounded-full text-sm font-medium text-center"
                    style={{ background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.5)', color: '#FFF8F0' }}
                  >
                    日志
                  </button>
                  <button
                    onClick={() => { sessionStorage.removeItem('ledger_back_from'); setLocation(backTarget); }}
                    className="flex-1 py-1.5 rounded-full text-sm font-medium text-center"
                    style={{ background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.5)', color: '#FFF8F0' }}
                  >
                    返回
                  </button>
                </div>
              )}
              {isCustomAH && (
                <span className="text-xs text-white/70 mr-1 px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}>{ahRoleName}</span>
              )}
              {/* 52号账本（AF）：操作按钮行（充值/提现/邀请/刷新/返回）横排一行 */}
              {isCustomAF && (
                <div className="flex items-center gap-2 w-full">
                  {!effectiveIsFunder && (
                    <button
                      onClick={() => setLocation(`/recharge?from=ledger&ledgerId=${ledgerId}${viewAsUserId ? `&viewAs=${viewAsUserId}` : ''}`)}
                      className="flex-1 h-9 rounded-full text-sm font-medium border border-white/60 text-white text-center"
                      style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}
                    >
                      充值
                    </button>
                  )}
                  {!effectiveIsFunder && (
                    <button
                      onClick={() => setLocation(`/ledger/${ledgerId}/af-withdraw${viewAsUserId ? `?viewAs=${viewAsUserId}` : ''}`)}
                      className="flex-1 h-9 rounded-full text-sm font-medium border border-white/60 text-white text-center"
                      style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}
                    >
                      提现
                    </button>
                  )}
                  {!effectiveIsFunder && (
                    <button
                      onClick={() => setLocation(`/ledger/${ledgerId}/af-invite${viewAsUserId ? `?viewAs=${viewAsUserId}` : ''}`)}
                      className="flex-1 h-9 rounded-full text-sm font-medium border border-white/60 text-white text-center"
                      style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}
                    >
                      邀请
                    </button>
                  )}
                  <button
                    onClick={() => window.location.reload()}
                    className="flex-1 h-9 rounded-full text-sm font-medium text-center"
                    style={{ backgroundColor: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.6)', color: '#fff' }}
                  >
                    刷新
                  </button>
                  <button
                    onClick={() => { sessionStorage.removeItem('ledger_back_from'); setLocation(backTarget); }}
                    className="flex-1 h-9 rounded-full text-sm font-medium text-center"
                    style={{ backgroundColor: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.6)', color: '#fff' }}
                  >
                    返回
                  </button>
                </div>
              )}
              {/* 网格交易模拟测算入口已移至 GTO 策略下方 */}
              {isCustomAH && (isOwner || isAdmin) && (
                <button
                  onClick={() => setShowAhCreateCompany(v => !v)}
                  className="flex-1 py-1.5 rounded-full text-sm font-medium border border-white/60 text-white text-center"
                  style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}
                >
                  新建
                </button>
              )}
              {!isCustomAI && !isCustomAF && !isCustomAJ && (
                <button
                  onClick={() => window.location.reload()}
                  className="flex-1 py-1.5 rounded-full text-sm font-medium text-center"
                  style={{ backgroundColor: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.6)', color: '#fff' }}
                >
                  刷新
                </button>
              )}
              {!isCustomAI && !isCustomAF && !isCustomAJ && (
                <button
                  onClick={() => { sessionStorage.removeItem('ledger_back_from'); setLocation(backTarget); }}
                  className="flex-1 py-1.5 rounded-full text-sm font-medium text-center"
                  style={{ backgroundColor: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.6)', color: '#fff' }}
                >
                  返回
                </button>
              )}
            </div>
          </div>
        ) : (
          <>
            {/* 标题栏 */}
            <div className="px-4 pt-3 pb-2 flex items-center justify-between">
                <button
                onClick={() => { sessionStorage.removeItem('ledger_back_from'); setLocation(backTarget); }}
                className="p-1 -ml-2"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <div className="flex items-center flex-1">
                <h1 className="text-lg font-medium">{ledgerData.name}</h1>
              </div>
            </div>

            {/* 成员头像和功能按鈕 */}
            <div className="px-4 py-2 flex items-center justify-between">
              {/* 左侧：普通账本显示所有共享成员头像；定制账本只显示当前用户 */}
              <div className="flex items-center">
                {!isCustomAE ? (
                  // 普通账本 / 减肥账本：叠加头像，最多3个，超出部分用+N气泡
                  (() => {
                    const allMembers = membersData && membersData.length > 0 ? membersData : (user ? [{ username: user.username, avatar: user.avatar, nickname: user.nickname }] : []);
                    const maxShow = 5;
                    const shown = allMembers.slice(0, maxShow);
                    const extra = allMembers.length - maxShow;
                    return (
                      <div className="flex items-center" style={{ position: 'relative' }}>
                        {shown.map((m: any, i: number) => (
                          <div key={i} style={{ marginLeft: i === 0 ? 0 : -16, zIndex: maxShow - i, position: 'relative' }}>
                            <UserAvatar
                              username={m.username || m.user?.username}
                              avatar={m.avatar || m.user?.avatar}
                              nickname={m.nickname || m.user?.nickname}
                              size="md"
                            />
                          </div>
                        ))}
                        {extra > 0 && (
                          <span
                            style={{
                              marginLeft: 4,
                              fontSize: 12,
                              fontWeight: 600,
                              color: 'rgba(255,255,255,0.9)',
                              flexShrink: 0,
                            }}
                          >
                            +{allMembers.length}
                          </span>
                        )}
                      </div>
                    );
                  })()
                ) : (
                  // AE 抽奖筱：只显示当前用户
                  user && (
                    <UserAvatar
                      username={user.username}
                      avatar={user.avatar}
                      nickname={user.nickname}
                      size="md"
                    />
                  )
                )}
              </div>

              {/* 功能按鈕（靠右） */}
              <div className="flex items-center gap-2">
                {/* 减肥账本教练：学员管理按鈕 */}
                {isDietCoach && (
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center cursor-pointer shadow-sm"
                    style={{ backgroundColor: '#FFFFFF' }}
                    onClick={() => setLocation(`/ledger/${ledgerId}/diet-members`)}
                  >
                    <Users className="w-5 h-5" style={{ color: '#1A2B4A' }} />
                  </div>
                )}
                {/* 普通账本：查找按鈕 */}
                {!isCustomAE && !isDiet && !isCustomAF && !isCustomAH && !isCustomAI && !isCustomAJ && (
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center cursor-pointer shadow-sm"
                    style={{ backgroundColor: '#FFFFFF' }}
                    onClick={() => setLocation(`/ledger/${ledgerId}/filter`)}
                  >
                    <Search className="w-5 h-5" style={{ color: '#1A2B4A' }} />
                  </div>
                )}
                {/* 普通账本：数据统计按鈕 */}
                {!isCustomAE && !isDiet && !isCustomAF && !isCustomAH && !isCustomAI && !isCustomAJ && (
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center cursor-pointer shadow-sm"
                    style={{ backgroundColor: '#FFFFFF' }}
                    onClick={() => setLocation(`/ledger/${ledgerId}/report`)}
                  >
                    <BarChart3 className="w-5 h-5" style={{ color: '#1A2B4A' }} />
                  </div>
                )}
                {/* 资金方：ETH持仓计算器快捷按钮 */}
                {isCustomAF && effectiveIsFunder && (
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center cursor-pointer shadow-sm"
                    style={{ backgroundColor: '#FFFFFF' }}
                    onClick={() => setLocation(`/ledger/${ledgerId}/position-calc${viewAsUserId ? `?viewAs=${viewAsUserId}` : ''}`)}
                    title="Eth智能仓位管理"
                  >
                    <svg width="22" height="22" viewBox="0 0 256 417" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M127.961 0L125.166 9.5V285.168L127.961 287.958L255.923 212.32L127.961 0Z" fill="#343434"/>
                      <path d="M127.962 0L0 212.32L127.962 287.958V154.158V0Z" fill="#8C8C8C"/>
                      <path d="M127.961 312.187L126.386 314.107V412.301L127.961 416.962L255.931 236.551L127.961 312.187Z" fill="#3C3C3B"/>
                      <path d="M127.962 416.962V312.187L0 236.551L127.962 416.962Z" fill="#8C8C8C"/>
                      <path d="M127.961 287.957L255.923 212.319L127.961 154.158V287.957Z" fill="#141414"/>
                      <path d="M0 212.319L127.962 287.957V154.158L0 212.319Z" fill="#393939"/>
                    </svg>
                  </div>
                )}
                {/* 管理员或创建者：设置按鈕（视角切换时按目标角色显示） */}
                {effectiveIsManager && (
                  <div 
                    className="w-10 h-10 rounded-full flex items-center justify-center cursor-pointer shadow-sm"
                    style={{ backgroundColor: '#FFFFFF' }}
                    onClick={() => setLocation(`/ledger/${ledgerId}/settings`)}
                  >
                    <Settings className="w-5 h-5" style={{ color: '#1A2B4A' }} />
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* 减肥账本：保留进度面板 */}
        {isDiet && (
          <div className="px-4 pt-2 pb-3">
            {dietConfig ? (
              <>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-center">
                    <div className="text-xs opacity-80">初始体重</div>
                    <div className="text-base font-semibold">{dietInitialWeight ?? '--'}<span className="text-xs font-normal ml-0.5">斤</span></div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs opacity-80">当前体重</div>
                    <div className="text-xl font-bold">{dietCurrentWeight ?? '--'}<span className="text-xs font-normal ml-0.5">斤</span></div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs opacity-80">目标体重</div>
                    <div className="text-base font-semibold">{dietTargetWeight ?? '--'}<span className="text-xs font-normal ml-0.5">斤</span></div>
                  </div>
                </div>
                <div className="bg-white/30 rounded-full h-2 mb-1">
                  <div className="bg-white rounded-full h-2 transition-all" style={{ width: `${dietProgress}%` }} />
                </div>
                <div className="flex justify-between text-xs opacity-80">
                  <span>已减 {dietLostWeight > 0 ? dietLostWeight.toFixed(1) : 0} 斤</span>
                  <span>{dietProgress}%</span>
                  <span>消耗 {dietTotalCalories.toLocaleString()} kcal</span>
                </div>
              </>
            ) : (
              <div className="text-center py-2 opacity-80">
                <div className="text-sm">{isDietCoach ? '在学员管理中为成员设置减肥档案' : '等待教练设置你的减肥档案'}</div>
              </div>
            )}
          </div>
        )}
        {/* AF 账本：2×2 数据容器 */}
        {isCustomAF && !isCustomAH && !effectiveIsFunder && (
          <div className="px-4 pt-2 pb-4">
            <div className="grid grid-cols-2 gap-3">
              {/* 卡片 1：普通用户看"余额"（智能钱包），资方不显示 */}
              <div className="rounded-2xl px-4 py-3 relative" style={{ backgroundColor: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(8px)' }}>
                  {/* 右上角：自动转资金费率开关 */}
                  <div className="absolute top-2 right-3 flex items-center gap-1.5">
                    <span className="text-[10px] text-white/60">闲时自动赚费</span>
                    <button
                      onClick={() => {
                        if (!viewAsUserId) {
                          const newEnabled = !(localFundingRateEnabled ?? false);
                          setLocalFundingRateEnabled(newEnabled);
                          const currentBalance = afTotalAsset ? Number(afTotalAsset.total) : 0;
                          toggleFundingRateMutation.mutate({ ledgerId: Number(ledgerId), enabled: newEnabled, currentBalance: String(currentBalance) });
                        }
                      }}
                      disabled={!!viewAsUserId || toggleFundingRateMutation.isPending}
                      className="relative inline-flex h-4 w-7 items-center rounded-full transition-colors"
                      style={{ backgroundColor: (localFundingRateEnabled ?? false) ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.25)' }}
                    >
                      <span
                        className="inline-block h-3 w-3 rounded-full bg-white shadow transition-transform"
                        style={{
                          backgroundColor: (localFundingRateEnabled ?? false) ? '#16a34a' : 'rgba(255,255,255,0.6)',
                          transform: (localFundingRateEnabled ?? false) ? 'translateX(14px)' : 'translateX(2px)',
                        }}
                      />
                    </button>
                  </div>
                  <div className="text-xs text-white/70 mb-1">余额</div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-lg font-bold text-white">
                      {afTotalAsset ? Number(afTotalAsset.total).toFixed(2) : '0.00'}
                    </span>
                    <span className="text-xs text-white/60">USDT</span>
                  </div>
                  {/* 赚费累计显示 */}
                  {(localFundingRateEnabled ?? false) && (
                    <div className="flex flex-col gap-0.5 mt-1">
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-white/60">赚费</span>
                        <span className="text-xs font-semibold text-white/90">{parseFloat(fundingRateStatus?.totalAccumulated || '0').toFixed(4)}</span>
                        <span className="text-[10px] text-white/50">USDT</span>
                        <button
                          onClick={() => setShowFundingRateLogs(true)}
                          className="ml-0.5 flex items-center"
                          title="查看自动赚费详情"
                        >
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2">
                            <circle cx="12" cy="12" r="10"/>
                            <polyline points="12 6 12 12 16 14"/>
                          </svg>
                        </button>
                      </div>
                    </div>
                  )}
              </div>
              {/* 卡片 2：推荐人数（资金方不显示） */}
              {!effectiveIsFunder && (
              <div className="rounded-2xl px-4 py-3 relative" style={{ backgroundColor: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(8px)', cursor: ((user as any)?.id === 4957151 || isOwner || isAdmin) ? 'pointer' : 'default' }} onClick={() => { if ((user as any)?.id === 4957151 || isOwner || isAdmin) setLocation(`/ledger/${ledgerId}/af-invite-tree${viewAsUserId ? `?viewAs=${viewAsUserId}` : ''}`); }}>
                {/* 右上角：短信通知开关（YJH本人或管理员视角切换到YJH时可见） */}
                {showSmsSwitch && (
                  <div className="absolute top-2 right-2 flex flex-col items-end gap-1" onClick={e => e.stopPropagation()}>
                    {/* 131 开关：管理员自己视角（未切换）时可见 */}
                    {showSms131 && (
                    <div className="flex items-center gap-1">
                      <span className="text-[9px] text-white/50">131</span>
                      <button
                        onClick={() => { const newVal = !(localSms131 ?? false); setLocalSms131(newVal); toggleSmsNotifyMutation.mutate({ ledgerId: Number(ledgerId), phone: '13127919173', enabled: newVal }); }}
                        className="relative inline-flex h-4 w-7 items-center rounded-full transition-colors"
                        style={{ backgroundColor: (localSms131 ?? false) ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.25)' }}
                      >
                        <span className="inline-block h-3 w-3 rounded-full shadow transition-transform"
                          style={{ backgroundColor: (localSms131 ?? false) ? '#16a34a' : 'rgba(255,255,255,0.6)', transform: (localSms131 ?? false) ? 'translateX(14px)' : 'translateX(2px)' }} />
                      </button>
                    </div>
                    )}
                    {/* 182 开关：管理员切换到YJH视角时可见 */}
                    {showSms182 && <div className="flex items-center gap-1">
                      <span className="text-[9px] text-white/50">182</span>
                      <button
                        onClick={() => { const newVal = !(localSms182 ?? false); setLocalSms182(newVal); toggleSmsNotifyMutation.mutate({ ledgerId: Number(ledgerId), phone: '18271901931', enabled: newVal }); }}
                        className="relative inline-flex h-4 w-7 items-center rounded-full transition-colors"
                        style={{ backgroundColor: (localSms182 ?? false) ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.25)' }}
                      >
                        <span className="inline-block h-3 w-3 rounded-full shadow transition-transform"
                          style={{ backgroundColor: (localSms182 ?? false) ? '#16a34a' : 'rgba(255,255,255,0.6)', transform: (localSms182 ?? false) ? 'translateX(14px)' : 'translateX(2px)' }} />
                      </button>
                    </div>}
                  </div>
                )}
                <div className="text-xs text-white/70 mb-1">
                  <span>推荐</span>
                </div>
                {((afTotalAsset as any)?.directReferralCount > 0 || (afTotalAsset as any)?.indirectReferralCount > 0) ? (
                  <div className="space-y-0.5">
                    <div className="flex items-baseline gap-1">
                      <span className="text-sm font-bold text-white">直接伙伴</span>
                      <span className="text-lg font-bold text-white">{(afTotalAsset as any)?.directReferralCount ?? 0}</span>
                      <span className="text-xs text-white/60">人</span>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-sm font-bold text-white">延伸伙伴</span>
                      <span className="text-lg font-bold text-white">{(afTotalAsset as any)?.indirectReferralCount ?? 0}</span>
                      <span className="text-xs text-white/60">人</span>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-baseline gap-1">
                    <span className="text-lg font-bold text-white">{(afTotalAsset as any)?.inviteCount ?? 0}</span>
                    <span className="text-xs text-white/60">人</span>
                  </div>
                )}
                {inviteTreeData?.users && inviteTreeData.users.length > 0 && ((user as any)?.id === YJH_USER_ID || viewAsUserId === YJH_USER_ID) && (
                  <div className="flex items-baseline gap-1 mt-0.5">
                    <span className="text-[10px] text-white/50">总余额</span>
                    <span className="text-xs font-bold text-white/90">{inviteTreeData.users.reduce((sum: number, u: any) => sum + (u.balance ?? 0), 0).toFixed(2)}</span>
                    <span className="text-[10px] text-white/50">U</span>
                  </div>
                )}
              </div>
              )}
              {/* 卡片 3：仓位 & 累计盈亏（合并，占满整行）——资金方不显示 */}
              {!effectiveIsFunder && (
              <div className="col-span-2 rounded-2xl px-0 py-3" style={{ backgroundColor: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.10)', overflow: 'hidden' }}>

                {/* 表头 */}
                <div className="grid mb-1.5 text-xs text-white/60" style={{ gridTemplateColumns: 'minmax(min-content, 56px) 1px 1fr 1px minmax(min-content, 44px) 1px 1fr 1px 1fr 20px' }}>
                  <span className="flex items-center justify-center py-0.5">币种</span>
                  <div style={{ background: 'rgba(255,255,255,0.07)' }}></div>
                  <span className="text-center py-0.5">币数</span>
                  <div style={{ background: 'rgba(255,255,255,0.07)' }}></div>
                  <span className="text-center py-0.5">订单</span>
                  <div style={{ background: 'rgba(255,255,255,0.07)' }}></div>
                  <span className="text-center py-0.5">实时价</span>
                  <div style={{ background: 'rgba(255,255,255,0.07)' }}></div>
                  <span className="text-center py-0.5">浮盈</span>
                  <span></span>
                </div>
                {(['BTC', 'ETH', 'SOL'].slice().sort((a, b) => {
                  const qtyA = (afTotalAsset as any)?.positions?.[a] ?? 0;
                  const qtyB = (afTotalAsset as any)?.positions?.[b] ?? 0;
                  const priceA = equityLivePrices[a] || 0;
                  const priceB = equityLivePrices[b] || 0;
                  const valA = priceA > 0 ? qtyA * priceA : qtyA;
                  const valB = priceB > 0 ? qtyB * priceB : qtyB;
                  return valB - valA;
                })).map(coin => {
                  const qty = (afTotalAsset as any)?.positions?.[coin] ?? 0;
                  const coinData = pnlData?.coins?.find((c: any) => c.coin === coin);
                  const activeCount = (coinData?.holdingCount ?? 0) + (coinData?.pendingCount ?? 0);
                  const giftCount = (coinData as any)?.giftCount ?? 0;
                  const avgCost = coinData?.avgCost ?? 0;
                  const breakevenPrice = (coinData as any)?.teamBreakevenPrice ?? 0;
                  const livePrice = equityLivePrices[coin] || 0;
                  const orderDetails: { buyPrice: number; originalQty: number; tier: number; discountRate: number; effectiveQty: number; isGift: boolean }[] = (coinData as any)?.orderDetails ?? [];
                  // 浮盈用个人均价（avgCost）作为成本基准，与显示的均价保持一致
                  const unrealizedPnl = qty > 0 && livePrice > 0 && avgCost > 0
                    ? qty * (livePrice - avgCost)
                    : 0;
                  const pnlSign = unrealizedPnl >= 0 ? '+' : '';
                  const fmtNum = (v: number) => {
                    if (!v || v <= 0) return '-';
                    const intDigits = Math.floor(Math.abs(v)).toString().length;
                    const decPlaces = Math.max(0, 5 - intDigits);
                    return v.toFixed(decPlaces);
                  };
                  const fmtQty = fmtNum(qty) === '-' ? '0' : fmtNum(qty);
                  const coinColor: Record<string, string> = { BTC: '#fb923c', ETH: '#60a5fa', SOL: '#a78bfa' };
                  // 浮盈为负时显示0，为正时正常显示
                  const displayPnl = unrealizedPnl < 0 ? 0 : unrealizedPnl;
                  const pnlColor = qty > 0 && livePrice > 0
                    ? (displayPnl > 0 ? '#4ade80' : 'rgba(255,255,255,0.4)')
                    : 'rgba(255,255,255,0.25)';
                  const isExpanded = expandedCoins[coin] || false;
                  return (
                    <div key={coin} style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                      {/* 主行：币种 + 权益数量 + 订单 + 浮盈 + 箭头 */}
                      <div
                        className="grid items-center py-2.5 cursor-pointer active:opacity-70"
                        style={{ gridTemplateColumns: 'minmax(min-content, 56px) 1px 1fr 1px minmax(min-content, 44px) 1px 1fr 1px 1fr 20px' }}
                        onClick={() => setExpandedCoins(prev => ({ ...prev, [coin]: !prev[coin] }))}
                      >
                        <span className="flex items-center justify-center text-sm font-bold" style={{ color: coinColor[coin] || 'white' }}>{coin}</span>
                        <div style={{ background: 'rgba(255,255,255,0.07)', alignSelf: 'stretch' }}></div>
                        <span className={`text-center text-base font-bold ${qty > 0 ? 'text-white' : 'text-white/30'}`} style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '0.02em' }}>{fmtQty}</span>
                        <div style={{ background: 'rgba(255,255,255,0.07)', alignSelf: 'stretch' }}></div>
                        <div className="flex flex-col items-center justify-center gap-0">
                          <span className="text-[11px] text-white/50">{activeCount > 0 ? `共${activeCount}` : '-'}</span>
                          {giftCount > 0 && <span className="text-[11px]" style={{ color: '#fbbf24' }}>{`赠${giftCount}`}</span>}
                        </div>
                        <div style={{ background: 'rgba(255,255,255,0.07)', alignSelf: 'stretch' }}></div>
                        <span className="text-center text-[11px] text-white/80" style={{ fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum"' }}>{activeCount > 0 && livePrice > 0 ? fmtNum(livePrice) : '-'}</span>
                        <div style={{ background: 'rgba(255,255,255,0.07)', alignSelf: 'stretch' }}></div>
                        <span className="text-center text-sm font-semibold" style={{ color: pnlColor }}>
                          {qty > 0 && livePrice > 0 ? (displayPnl > 0 ? `+${displayPnl.toFixed(2)}` : '0') : '-'}
                        </span>
                        <span className="flex items-center justify-center">
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', opacity: 0.5 }}>
                            <polyline points="2,3 5,7 8,3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </span>
                      </div>
                      {/* 展开详情：个人均价 / 团队均价 / 止盈+25% 一行平铺 + 模拟滑动条 */}
                      {isExpanded && (() => {
                        // 滑动条：每个币种固定区间（BTC 1万~20万, ETH 1000~5000, SOL 1~300）
                        const costRef = avgCost > 0 ? avgCost : breakevenPrice;
                        const coinRangeMap: Record<string, [number, number]> = { BTC: [10000, 200000], ETH: [1000, 5000], SOL: [1, 300] };
                        const [sliderMin, sliderMax] = coinRangeMap[coin] ?? [costRef * 0.3 || 1, costRef * 3 || 300];
                        const defaultSlider = livePrice > 0 ? livePrice : (costRef > 0 ? costRef * 1.5 : sliderMin);
                        const rawSlider = sliderPrices[coin];
                        const sliderVal = rawSlider !== undefined ? rawSlider : Math.min(Math.max(defaultSlider, sliderMin), sliderMax);
                        const simPnl = qty > 0 && costRef > 0 ? qty * (sliderVal - costRef) : 0;
                        const simPnlPositive = simPnl > 0;
                        // 滑动条百分比位置（用于标记线）
                        const sliderPct = (sliderVal - sliderMin) / (sliderMax - sliderMin);
                        // 盈亏平衡点位置
                        const breakPct = costRef > 0 ? Math.min(Math.max((costRef - sliderMin) / (sliderMax - sliderMin), 0), 1) : -1;
                        return (
                          <div style={{ background: 'rgba(0,0,0,0.15)', borderRadius: '0 0 8px 8px' }}>
                            {/* 三列数据 */}
                            <div className="flex items-center px-2 pt-2 pb-1 gap-1">
                              <div className="flex-1 flex flex-col items-center gap-0.5">
                                <span className="flex items-center gap-0.5 text-[9px] text-white/50">
                                  个人均价
                                  <span
                                    onClick={e => {
                                    e.stopPropagation();
                                    const totalOrigQty = orderDetails.reduce((s, d) => s + d.originalQty, 0);
                                    const totalCost = orderDetails.reduce((s, d) => s + d.buyPrice * d.originalQty, 0);
                                    setAvgCostDetailData({ coin, avgCost, totalQty: totalOrigQty, totalCost, orderDetails });
                                    setAvgCostDetailCoin(coin);
                                  }}
                                    style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '12px', height: '12px', borderRadius: '50%', border: '1px solid rgba(255,255,255,0.3)', color: 'rgba(255,255,255,0.4)', fontSize: '8px', cursor: 'pointer', flexShrink: 0 }}
                                  >?</span>
                                </span>
                                <span className="text-[11px] text-white/80 font-medium">{avgCost > 0 ? fmtNum(avgCost) : '-'}</span>
                              </div>
                              <div className="w-px self-stretch" style={{ background: 'rgba(255,255,255,0.1)' }}></div>
                              <div className="flex-1 flex flex-col items-center gap-0.5">
                                <span className="flex items-center gap-0.5 text-[9px]" style={{ color: '#fbbf24' }}>
                                  团队均价
                                  <span
                                    onClick={e => { e.stopPropagation(); alert('团队均价：本团队内所有用户持仓订单的整体均价，已包含各自累计的实时管理费。这是团队整体的持仓成本，价格超过此线即达到团队盈利区间。\n\n注意：团队均价并非固定，随着不同用户在不同价位持续下单，以及每日管理费的累积，团队均价会实时动态更新。'); }}
                                    style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '12px', height: '12px', borderRadius: '50%', border: '1px solid rgba(251,191,36,0.4)', color: 'rgba(251,191,36,0.5)', fontSize: '8px', cursor: 'pointer', flexShrink: 0 }}
                                  >?</span>
                                </span>
                                <span className="text-[11px] font-semibold" style={{ color: breakevenPrice > 0 ? '#fbbf24' : 'rgba(255,255,255,0.3)' }}>{breakevenPrice > 0 ? fmtNum(breakevenPrice) : '-'}</span>
                              </div>
                              <div className="w-px self-stretch" style={{ background: 'rgba(255,255,255,0.1)' }}></div>
                              <div className="flex-1 flex flex-col items-center gap-0.5">
                                <span className="text-[9px]" style={{ color: '#f87171' }}>最低止盈+25%</span>
                                <span className="text-[11px] font-semibold" style={{ color: breakevenPrice > 0 ? '#f87171' : 'rgba(255,255,255,0.3)' }}>{breakevenPrice > 0 ? fmtNum(breakevenPrice * 1.25) : '-'}</span>
                              </div>
                            </div>
                            {/* 分隔线 */}
                            {qty > 0 && costRef > 0 && (
                              <div style={{ height: '1px', background: 'rgba(255,255,255,0.08)', margin: '0 12px' }}></div>
                            )}
                            {/* 模拟滑动条 */}
                            {qty > 0 && costRef > 0 && (
                              <div className="px-3 pb-3 pt-2">
                                {/* 结果行：目标价 + 预计盈亏 */}
                                <div className="flex items-center justify-between mb-3">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[9px] text-white/40">目标价</span>
                                    <span className="text-[13px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtNum(sliderVal)}</span>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[9px] text-white/40">预计盈亏</span>
                                    <span className="text-[13px] font-bold" style={{ color: simPnlPositive ? '#f87171' : 'rgba(255,255,255,0.3)', fontVariantNumeric: 'tabular-nums' }}>
                                      {simPnlPositive ? `+${simPnl.toFixed(2)}` : '0'}
                                    </span>
                                  </div>
                                </div>
                                {/* 滑动条轨道 */}
                                <div className="relative" style={{ height: '28px' }}>
                                  {/* 轨道背景 */}
                                  <div className="absolute left-0 right-0 rounded-full" style={{ height: '22px', top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.10)' }}></div>
                                  {/* 已填充部分 */}
                                  <div className="absolute left-0 rounded-full" style={{ height: '22px', top: '50%', transform: 'translateY(-50%)', width: `${sliderPct * 100}%`, background: simPnlPositive ? 'linear-gradient(90deg,#fbbf24,#f87171)' : 'linear-gradient(90deg,#4ade80,#fbbf24)' }}></div>
                                  {/* 三根标记线：白=个人均价, 黄=团队均价, 绿=最低止盈 */}
                                  {(() => {
                                    const marks = [
                                      { price: avgCost, color: 'rgba(255,255,255,0.8)', label: '' },
                                      { price: breakevenPrice, color: '#fbbf24', label: '' },
                                      { price: breakevenPrice > 0 ? breakevenPrice * 1.25 : 0, color: '#f87171', label: '' },
                                    ];
                                    return marks.map((m, i) => {
                                      if (!m.price || m.price <= 0) return null;
                                      const pct = Math.min(Math.max((m.price - sliderMin) / (sliderMax - sliderMin), 0), 1);
                                      return (
                                        <div key={i} className="absolute" style={{ left: `${pct * 100}%`, top: '50%', transform: 'translate(-50%,-50%)', zIndex: 2 }}>
                                          <div style={{ width: '2px', height: '22px', background: m.color, borderRadius: '1px' }}></div>
                                        </div>
                                      );
                                    });
                                  })()}
                                  {/* 滑块圆点（可视化，两端限制不超出轨道） */}
                                  <div className="absolute pointer-events-none" style={{ left: `clamp(14px, calc(${sliderPct * 100}%), calc(100% - 14px))`, top: '50%', transform: 'translate(-50%,-50%)', width: '28px', height: '28px', borderRadius: '50%', background: 'white', boxShadow: '0 2px 10px rgba(0,0,0,0.6)', zIndex: 3, border: `3px solid ${simPnlPositive ? '#f87171' : '#4ade80'}` }}></div>
                                  {/* 滑块input（透明覆盖，负责交互） */}
                                  <input
                                    type="range"
                                    min={sliderMin}
                                    max={sliderMax}
                                    step={(sliderMax - sliderMin) / 200}
                                    value={sliderVal}
                                    onChange={e => setSliderPrice(coin, parseFloat(e.target.value))}
                                    className="absolute inset-0 w-full cursor-pointer"
                                    style={{ height: '28px', opacity: 0, zIndex: 4 }}
                                  />
                                </div>
                                {/* 范围标签 */}
                                <div className="flex justify-between mt-1">
                                  <span className="text-[9px] text-white/25">{fmtNum(sliderMin)}</span>
                                  <span className="text-[9px] text-white/25">{fmtNum(sliderMax)}</span>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  );
                })}
                {/* 更新时间：左下角 */}
                {pnlData?.updatedAt && (
                  <div className="mt-2 flex items-center gap-1 px-4">
                    <button
                      onClick={() => setLocation(`/ledger/${ledgerId}/crypto/funding-history`)}
                      style={{ background: "none", border: "none", padding: 0, cursor: "pointer", display: "flex", alignItems: "center" }}
                      title="查看自动赚费历史"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="2">
                        <circle cx="12" cy="12" r="10"/>
                        <polyline points="12 6 12 12 16 14"/>
                      </svg>
                    </button>
                    <span className="text-[11px] text-white/35">更新 {new Date(pnlData.updatedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}</span>
                  </div>
                )}
              </div>
              )}
              {/* 管理员统计：累计订单（后端控制权限，代看模式下隐藏，资金方不显示） */}
              {!effectiveIsFunder && !viewAsUserId && afAdminStats && (afAdminStats as any).authorized === true && (afAdminStats as any).orders && (
                <div className="rounded-2xl px-4 py-3 cursor-pointer active:opacity-75" style={{ backgroundColor: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(8px)' }} onClick={() => setLocation(`/ledger/${ledgerId}/af-order-manage`)}>
                  <div className="text-xs text-white/70 mb-1">累计订单</div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-lg font-bold text-white">{afAdminStats.orders.totalCount}</span>
                    <span className="text-xs text-white/60">笔</span>
                  </div>
                  <div className="mt-1.5 space-y-0.5">
                    <div className="flex items-baseline justify-between">
                      <span className="text-xs text-white/60">普通</span>
                      <span className="text-xs font-medium text-white">{afAdminStats.orders.normalCount} 笔</span>
                    </div>
                    <div className="flex items-baseline justify-between">
                      <span className="text-xs text-white/60">赠送</span>
                      <span className="text-xs font-medium text-amber-300">{afAdminStats.orders.giftCount} 笔</span>
                    </div>
                  </div>
                </div>
              )}
              {/* 管理员统计：管理费（后端控制权限，代看模式下隐藏） */}
              {!effectiveIsFunder && !viewAsUserId && afAdminStats && (afAdminStats as any).authorized === true && (afAdminStats as any).fees && (
                <div className="rounded-2xl px-4 py-3 cursor-pointer active:opacity-75" style={{ backgroundColor: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(8px)' }} onClick={() => setLocation(`/ledger/${ledgerId}/af-fee-detail`)}>
                  <div className="text-xs text-white/70 mb-1">管理费</div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-lg font-bold text-white">{afAdminStats.fees.totalFee.toFixed(2)}</span>
                    <span className="text-xs text-white/60">U</span>
                  </div>
                  <div className="mt-1.5 space-y-0.5">
                    <div className="flex items-baseline justify-between">
                      <span className="text-xs text-white/60">进行中</span>
                      <span className="text-xs font-medium text-amber-300">{afAdminStats.fees.ongoingFee.toFixed(2)} U</span>
                    </div>
                    <div className="flex items-baseline justify-between">
                      <span className="text-xs text-white/60">已结清</span>
                      <span className="text-xs font-medium text-green-300">{afAdminStats.fees.settledFee.toFixed(2)} U</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        {/* AI 账本：股权概览卡片 */}
        {isCustomAI && (
          <div className="px-4 pt-2 pb-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl px-4 py-3" style={{ background: '#FFF8F0', border: '1px solid rgba(58,20,0,0.25)', boxShadow: '0 2px 12px rgba(58,20,0,0.15)' }}>
                <div className="text-xs mb-1 flex items-baseline gap-1" style={{ color: 'rgba(58,20,0,0.6)' }}>
                  <span>总计股权</span>
                  {myShares && myShares.length > 0 && (myShares[0] as any).shareNo && (
                    <span className="text-[10px]" style={{ color: 'rgba(58,20,0,0.4)' }}>（{(myShares[0] as any).shareNo}）</span>
                  )}
                </div>
                {/* 加权后总计股权（主数字 = 原始张数 × 总权重） */}
                <div className="flex items-baseline gap-0.5">
                  <span className="text-lg font-bold" style={{ color: '#1A0A00' }}>
                    {myShares && myShares.length > 0 ? weightedSharesTotal.toFixed(2) : '-'}
                  </span>
                  {myShares && myShares.length > 0 && <span className="text-[10px] font-normal" style={{ color: 'rgba(58,20,0,0.6)' }}>张</span>}
                </div>
                {/* 权重标注：只显示总权重数值 + 小问号（点击弹出详细说明） */}
                {myShares && myShares.length > 0 && (
                  <div className="flex items-center gap-1 mt-1">
                    <span className="text-[10px]" style={{ color: 'rgba(58,20,0,0.5)' }}>权重</span>
                    <span className="text-[10px] font-semibold" style={{ color: '#1A0A00' }}>{totalWeight.toFixed(2)}</span>
                    <button
                      onClick={() => setShowWeightDetail(true)}
                      className="text-[10px] w-3.5 h-3.5 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ background: 'rgba(58,20,0,0.12)', color: 'rgba(58,20,0,0.55)', border: 'none', cursor: 'pointer', lineHeight: 1 }}
                    >?</button>
                  </div>
                )}
                {(!myShares || myShares.length === 0) && <div className="text-[10px] mt-1" style={{ color: 'rgba(58,20,0,0.5)' }}>暂无记录</div>}
              </div>
              <div className="rounded-2xl px-4 py-3" style={{ background: '#FFF8F0', border: '1px solid rgba(58,20,0,0.25)', boxShadow: '0 2px 12px rgba(58,20,0,0.15)' }}>
                <div className="text-xs mb-1 flex items-baseline gap-1" style={{ color: 'rgba(58,20,0,0.6)' }}>
                  <span>脉动数据</span>
                  {(() => {
                    const viewTarget = viewAsUserId ? (membersData as any[])?.find((m: any) => m.userId === viewAsUserId) : null;
                    const uname = viewTarget ? (viewTarget.username || viewTarget.nickname) : (user?.username || user?.nickname);
                    return uname ? <span className="text-[10px]" style={{ color: 'rgba(58,20,0,0.4)' }}>（{uname}）</span> : null;
                  })()}
                </div>
                <div className="grid grid-cols-3 gap-1 mt-1">
                  <div>
                    <div className="text-[10px]" style={{ color: 'rgba(58,20,0,0.55)' }}>人脉</div>
                    <div className="text-sm font-bold" style={{ color: '#1A0A00' }}>{memberStats ? memberStats.contactCount : '--'}</div>
                    <div className="text-[9px]" style={{ color: 'rgba(58,20,0,0.4)' }}>联系人</div>
                  </div>
                  <div style={{ borderLeft: '1px solid rgba(58,20,0,0.15)', paddingLeft: '4px' }}>
                    <div className="text-[10px]" style={{ color: 'rgba(58,20,0,0.55)' }}>标签</div>
                    <div className="text-sm font-bold" style={{ color: '#1A0A00' }}>{memberStats ? memberStats.tagCount : '--'}</div>
                    <div className="text-[9px]" style={{ color: 'rgba(58,20,0,0.4)' }}>次</div>
                  </div>
                  <div style={{ borderLeft: '1px solid rgba(58,20,0,0.15)', paddingLeft: '4px' }}>
                    <div className="text-[10px]" style={{ color: 'rgba(58,20,0,0.55)' }}>推荐</div>
                    <div className="text-sm font-bold" style={{ color: '#1A0A00' }}>{memberStats ? memberStats.referralCount : '--'}</div>
                    <div className="text-[9px]" style={{ color: 'rgba(58,20,0,0.4)' }}>直接</div>
                  </div>
                </div>
              </div>
            </div>

          </div>
        )}
        {/* AI 账本：持股结构弹窗 */}
        {isCustomAI && showShareholdingModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ backgroundColor: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(4px)' }}
            onClick={() => setShowShareholdingModal(false)}
          >
            <div
              className="w-full mx-4 rounded-2xl overflow-hidden"
              style={{ background: '#FFF8F0', border: '1px solid rgba(58,20,0,0.3)', boxShadow: '0 8px 40px rgba(58,20,0,0.3)', maxWidth: '420px' }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* 弹窗标题 */}
              <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(58,20,0,0.15)' }}>
                <span className="text-sm font-semibold" style={{ color: '#1A0A00', letterSpacing: '0.05em' }}>脉动网持股结构</span>
                <button
                  onClick={() => setShowShareholdingModal(false)}
                  className="w-7 h-7 rounded-full flex items-center justify-center"
                  style={{ background: 'rgba(58,20,0,0.08)', border: '1px solid rgba(58,20,0,0.25)', color: '#3D1F0D' }}
                >
                  ×
                </button>
              </div>
              {/* 内容 */}
              <div className="px-5 py-4">
                {(() => {
                  const snapAngel = shareholdingSnapshot?.angel ?? globalAngelTotal;
                  const snapMarket = shareholdingSnapshot?.market ?? globalMarketTotal;
                  const totalShares = snapAngel > 0 ? snapAngel / 0.30 : 0;
                  const marketIssued = snapMarket;
                  const marketUnissued = Math.max(0, totalShares * 0.125 - snapMarket);
                  const founderUnissued = totalShares * 0.40;
                  const employeeUnissued = totalShares * 0.15;
                  const cofounderUnissued = totalShares * 0.025;
                  const categories = [
                    { name: '天使投资人', pct: '30%', issued: snapAngel, unissued: null, singleRow: true },
                    { name: '市场贡献値', pct: '12.5%', issued: marketIssued, unissued: marketUnissued, singleRow: false },
                    { name: '创始团队', pct: '40%', issued: 0, unissued: founderUnissued, singleRow: false },
                    { name: '员工持股平台', pct: '15%', issued: 0, unissued: employeeUnissued, singleRow: false },
                    { name: '联合创始人', pct: '2.5%', issued: 0, unissued: cofounderUnissued, singleRow: false },
                  ];
                  return categories.map((cat: any, idx: number) => (
                    <div key={idx} style={{ borderBottom: '1px solid rgba(58,20,0,0.1)', marginBottom: '6px', paddingBottom: '6px' }}>
                      <div className="flex items-center justify-between py-1">
                        <div className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#3D1F0D' }} />
                          <span className="text-xs font-semibold" style={{ color: '#1A0A00' }}>{cat.name}</span>
                        </div>
                        <span className="text-xs font-bold" style={{ color: '#3D1F0D' }}>{cat.pct}</span>
                      </div>
                      {cat.singleRow ? (
                        <div className="flex items-center justify-between pl-4 py-0.5">
                          <span className="text-[11px]" style={{ color: 'rgba(58,20,0,0.6)' }}>已发行</span>
                          <span className="text-[11px] font-mono" style={{ color: '#1A0A00' }}>{cat.issued.toFixed(2)} 张</span>
                        </div>
                      ) : (
                        <>
                          {cat.issued > 0 && (
                            <div className="flex items-center justify-between pl-4 py-0.5">
                              <span className="text-[11px]" style={{ color: 'rgba(58,20,0,0.6)' }}>已发行</span>
                              <span className="text-[11px] font-mono" style={{ color: '#1A0A00' }}>{cat.issued.toFixed(2)} 张</span>
                            </div>
                          )}
                          <div className="flex items-center justify-between pl-4 py-0.5">
                            <span className="text-[11px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(58,20,0,0.08)', color: 'rgba(58,20,0,0.7)' }}>未发行</span>
                            <span className="text-[11px] font-mono" style={{ color: 'rgba(58,20,0,0.7)' }}>{cat.unissued.toFixed(2)} 张</span>
                          </div>
                        </>
                      )}
                    </div>
                  ));
                })()}
                {/* 总计行 */}
                {(() => {
                  const totalShares = shareholdingSnapshot ? shareholdingSnapshot.angel / 0.30 : (globalAngelTotal > 0 ? globalAngelTotal / 0.30 : 0);
                  return totalShares > 0 ? (
                    <div className="flex items-center justify-between pt-3 mt-1" style={{ borderTop: '1px solid rgba(58,20,0,0.2)' }}>
                      <span className="text-xs font-bold" style={{ color: '#1A0A00' }}>总计</span>
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-mono font-bold" style={{ color: '#1A0A00' }}>{totalShares.toFixed(2)} 张</span>
                        <span className="text-xs font-bold" style={{ color: '#3D1F0D' }}>100%</span>
                      </div>
                    </div>
                  ) : null;
                })()}
              </div>
            </div>
          </div>
        )}
        {/* 个人均价计算明细弹窗 */}
        {avgCostDetailCoin && avgCostDetailData && (
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(3px)' }}
            onClick={() => setAvgCostDetailCoin(null)}
          >
            <div
              className="w-full mx-4 rounded-2xl overflow-hidden"
              style={{ background: '#fff', boxShadow: '0 8px 32px rgba(0,0,0,0.22)', maxWidth: '360px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}
              onClick={e => e.stopPropagation()}
            >
              {/* 标题栏 */}
              <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid #E5E7EB' }}>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold" style={{ color: '#1A2340' }}>个人均价计算明细</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded font-mono" style={{ background: '#EFF6FF', color: '#1976D2' }}>{avgCostDetailData.coin}</span>
                  <span className="text-[10px]" style={{ color: '#9CA3AF' }}>共 {avgCostDetailData.orderDetails.length} 笔持仓</span>
                </div>
                <button
                  onClick={() => setAvgCostDetailCoin(null)}
                  className="w-6 h-6 rounded-full flex items-center justify-center text-sm"
                  style={{ background: '#F3F4F6', color: '#6B7280' }}
                >×</button>
              </div>
              {/* 订单明细列表 */}
              <div className="overflow-y-auto flex-1 px-3 py-2">
                {/* 表头 */}
                <div className="grid text-[9px] font-semibold mb-1 px-1" style={{ gridTemplateColumns: '20px 1fr 1fr 1fr 1fr', color: '#9CA3AF' }}>
                  <span>#</span>
                  <span className="text-right">买入价</span>
                  <span className="text-right">实际数量</span>
                  <span className="text-right">折后数量</span>
                  <span className="text-right">小计(U)</span>
                </div>
                {avgCostDetailData.orderDetails.map((d, i) => (
                  <div key={i} className="grid items-center py-1 px-1 rounded" style={{ gridTemplateColumns: '20px 1fr 1fr 1fr 1fr', background: i % 2 === 0 ? '#F9FAFB' : 'transparent' }}>
                    <span className="text-[9px]" style={{ color: '#9CA3AF' }}>{i + 1}</span>
                    <span className="text-right text-[10px] font-mono" style={{ color: '#1A2340' }}>
                      {d.isGift && <span className="text-[8px] mr-0.5" style={{ color: '#F59E0B' }}>赠</span>}
                      {d.buyPrice.toFixed(3)}
                    </span>
                    <span className="text-right text-[10px] font-mono" style={{ color: '#374151' }}>{d.originalQty.toFixed(3)}</span>
                    <span className="text-right text-[10px] font-mono" style={{ color: d.tier === 0 ? '#6B7280' : '#DC2626' }}>{d.effectiveQty.toFixed(3)}</span>
                    <span className="text-right text-[10px] font-mono" style={{ color: '#1976D2' }}>{(d.buyPrice * d.originalQty).toFixed(2)}</span>
                  </div>
                ))}
              </div>
              {/* 汇总行 */}
              <div className="px-3 py-3" style={{ borderTop: '1px solid #E5E7EB', background: '#F9FAFB' }}>
                {(() => {
                  const origTotalQty = avgCostDetailData.orderDetails.reduce((s, d) => s + d.originalQty, 0);
                  const effTotalQty = avgCostDetailData.orderDetails.reduce((s, d) => s + d.effectiveQty, 0);
                  const calcAvgCost = origTotalQty > 0 ? avgCostDetailData.totalCost / origTotalQty : 0;
                  return (
                    <>
                      <div className="grid text-[10px] mb-1" style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr' }}>
                        <div className="flex flex-col">
                          <span style={{ color: '#9CA3AF' }}>实际数量</span>
                          <span className="font-mono font-semibold" style={{ color: '#1A2340' }}>{origTotalQty.toFixed(3)}</span>
                        </div>
                        <div className="flex flex-col items-center">
                          <span style={{ color: '#9CA3AF' }}>折后数量</span>
                          <span className="font-mono font-semibold" style={{ color: '#DC2626' }}>{effTotalQty.toFixed(3)}</span>
                        </div>
                        <div className="flex flex-col items-center">
                          <span style={{ color: '#9CA3AF' }}>总成本</span>
                          <span className="font-mono font-semibold" style={{ color: '#1976D2' }}>{avgCostDetailData.totalCost.toFixed(2)}</span>
                        </div>
                        <div className="flex flex-col items-end">
                          <span style={{ color: '#9CA3AF' }}>个人均价</span>
                          <span className="font-mono font-bold" style={{ color: '#DC2626', fontSize: '12px' }}>{calcAvgCost > 0 ? calcAvgCost.toFixed(3) : '-'}</span>
                        </div>
                      </div>
                      <div className="text-[9px] mt-1.5 px-2 py-1.5 rounded" style={{ background: '#EFF6FF', color: '#6B7280' }}>
                        均价 = 总成本 ÷ 实际数量；折后数量为档位折扣后的收益权数量
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        )}
        {/* AH 账本：数据占位符区域 */}
        {isCustomAH && (
          <div className="px-4 pt-2 pb-4">
            <div className="grid grid-cols-2 gap-3">
              {/* 财务概览卡片 */}
              <div className="rounded-2xl px-4 py-3" style={{ backgroundColor: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(8px)' }}>
                <div className="text-xs text-white/70 mb-1">财务概览</div>
                <div className="text-lg font-bold text-white">--</div>
                <div className="text-[10px] text-white/50 mt-1">待配置</div>
              </div>
              {/* 当月收支 */}
              <div className="rounded-2xl px-4 py-3" style={{ backgroundColor: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(8px)' }}>
                <div className="text-xs text-white/70 mb-1">当月收支</div>
                <div className="text-lg font-bold text-white">--</div>
                <div className="text-[10px] text-white/50 mt-1">待配置</div>
              </div>
              {/* 应收应付 */}
              <div className="rounded-2xl px-4 py-3" style={{ backgroundColor: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(8px)' }}>
                <div className="text-xs text-white/70 mb-1">应收应付</div>
                <div className="text-lg font-bold text-white">--</div>
                <div className="text-[10px] text-white/50 mt-1">待配置</div>
              </div>
              {/* 税务申报 */}
              <div className="rounded-2xl px-4 py-3" style={{ backgroundColor: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(8px)' }}>
                <div className="text-xs text-white/70 mb-1">税务申报</div>
                <div className="text-lg font-bold text-white">--</div>
                <div className="text-[10px] text-white/50 mt-1">待配置</div>
              </div>
            </div>
          </div>
        )}
        {/* AJ 账本：业务报销汇总面板 */}
        {isCustomAJ && (
          <div className={(((isAdmin || isOwner) && ajViewMode === 'owner') || isFunder) && !viewAsUserId ? '' : 'px-4 pt-2 pb-4'}>
            {/* 资方视角：owner/admin/funder 统一使用 FunderViewPanel 新版 */}
            {(((isAdmin || isOwner) && ajViewMode === 'owner') || isFunder) && !viewAsUserId ? (
              <FunderViewPanel ledgerId={Number(ledgerId)} />
            ) : (
              <>
                {/* 劳方视角（或纯业务员）：报销汇总统计 */}
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs text-white/80">报销汇总</span>
                  <div className="relative">
                    <select
                      value={ajStatsPeriod}
                      onChange={e => setAjStatsPeriod(e.target.value as any)}
                      className="appearance-none text-xs text-white/90 pl-2 pr-6 py-1 rounded-full border border-white/30 cursor-pointer outline-none focus:outline-none focus:ring-0"
                      style={{ backgroundColor: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(8px)' }}
                    >
                      <option value="all" style={{ color: '#222' }}>全部</option>
                      <option value="day" style={{ color: '#222' }}>今日</option>
                      <option value="week" style={{ color: '#222' }}>本周</option>
                      <option value="month" style={{ color: '#222' }}>本月</option>
                      <option value="quarter" style={{ color: '#222' }}>本季</option>
                      <option value="year" style={{ color: '#222' }}>本年</option>
                    </select>
                    <svg className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 fill-white/70" viewBox="0 0 12 12"><path d="M6 8L2 4h8z"/></svg>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {/* 开票总金额 */}
                  <div className="rounded-2xl px-3 py-3" style={{ backgroundColor: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(8px)' }}>
                    <div className="text-[10px] text-white/70 mb-1">开票总额</div>
                    <div className="font-bold text-white overflow-hidden" style={{ fontSize: 'clamp(10px, 3.5vw, 16px)', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                      {`¥${monthlyStats.expense.toFixed(2)}`}
                    </div>
                  </div>
                  {/* 发票张数 */}
                  <div className="rounded-2xl px-3 py-3" style={{ backgroundColor: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(8px)' }}>
                    <div className="text-[10px] text-white/70 mb-1">发票张数</div>
                    <div className="text-base font-bold text-white">
                      {(() => {
                        if (!transactionsData) return '--';
                        let count = 0;
                        const now = new Date();
                        const bjNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
                        const today = bjNow.toISOString().split('T')[0];
                        const weekStart = (() => { const d = new Date(bjNow); d.setUTCDate(d.getUTCDate() - d.getUTCDay() + (d.getUTCDay() === 0 ? -6 : 1)); return d.toISOString().split('T')[0]; })();
                        const currentMonth = today.slice(0, 7);
                        const currentYear = today.slice(0, 4);
                        const currentQuarter = Math.floor(bjNow.getUTCMonth() / 3);
                        const quarterStart = new Date(Date.UTC(bjNow.getUTCFullYear(), currentQuarter * 3, 1)).toISOString().split('T')[0];
                        transactionsData.forEach((day: any) => {
                          let ok = false;
                          if (ajStatsPeriod === 'all') ok = true;
                          else if (ajStatsPeriod === 'day') ok = day.date === today;
                          else if (ajStatsPeriod === 'week') ok = day.date >= weekStart && day.date <= today;
                          else if (ajStatsPeriod === 'month') ok = day.date.startsWith(currentMonth);
                          else if (ajStatsPeriod === 'quarter') ok = day.date >= quarterStart && day.date <= today;
                          else if (ajStatsPeriod === 'year') ok = day.date.startsWith(currentYear);
                          if (ok) count += (day.records || []).length;
                        });
                        return `${count}张`;
                      })()}
                    </div>
                  </div>
                  {/* 企业数 */}
                  <div className="rounded-2xl px-3 py-3" style={{ backgroundColor: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(8px)' }}>
                    <div className="text-[10px] text-white/70 mb-1">企业数</div>
                    <div className="text-base font-bold text-white">
                      {ajAccessibleCompanies != null
                        ? ((ajAccessibleCompanies as any[]).length > 0 ? `${(ajAccessibleCompanies as any[]).length}家` : '--')
                        : '--'}
                    </div>
                  </div>
                </div>
                {/* 第二行：审核中 + 已通过 */}
                <div className="grid grid-cols-2 gap-3 mt-3">
                  {/* 审核中：张数 + 金额 */}
                  <div className="rounded-2xl px-3 py-3" style={{ backgroundColor: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(8px)' }}>
                    <div className="text-[10px] text-white/70 mb-1">审核中</div>
                    {(() => {
                      if (!transactionsData) return <><div className="text-base font-bold text-white leading-tight">0张</div><div className="text-[11px] text-white/80 mt-0.5">¥0.00</div></>;
                      let count = 0; let amount = 0;
                      const now = new Date();
                      const bjNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
                      const today = bjNow.toISOString().split('T')[0];
                      const weekStart = (() => { const d = new Date(bjNow); d.setUTCDate(d.getUTCDate() - d.getUTCDay() + (d.getUTCDay() === 0 ? -6 : 1)); return d.toISOString().split('T')[0]; })();
                      const currentMonth = today.slice(0, 7);
                      const currentYear = today.slice(0, 4);
                      const currentQuarter = Math.floor(bjNow.getUTCMonth() / 3);
                      const quarterStart = new Date(Date.UTC(bjNow.getUTCFullYear(), currentQuarter * 3, 1)).toISOString().split('T')[0];
                      transactionsData.forEach((day: any) => {
                        let ok = false;
                        if (ajStatsPeriod === 'all') ok = true;
                        else if (ajStatsPeriod === 'day') ok = day.date === today;
                        else if (ajStatsPeriod === 'week') ok = day.date >= weekStart && day.date <= today;
                        else if (ajStatsPeriod === 'month') ok = day.date.startsWith(currentMonth);
                        else if (ajStatsPeriod === 'quarter') ok = day.date >= quarterStart && day.date <= today;
                        else if (ajStatsPeriod === 'year') ok = day.date.startsWith(currentYear);
                        if (ok) (day.records || []).filter((r: any) => r.ajStatus === 'pending').forEach((r: any) => { count++; amount += Number(r.amount) || 0; });
                      });
                      return (
                        <>
                          <div className="text-base font-bold text-white leading-tight">{count}张</div>
                          <div className="text-[11px] text-white/80 mt-0.5 overflow-hidden" style={{ whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>¥{amount.toFixed(2)}</div>
                        </>
                      );
                    })()}
                  </div>
                  {/* 已通过：张数 + 金额 */}
                  <div className="rounded-2xl px-3 py-3" style={{ backgroundColor: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(8px)' }}>
                    <div className="text-[10px] text-white/70 mb-1">已通过</div>
                    {(() => {
                      if (!transactionsData) return <><div className="text-base font-bold text-white leading-tight">0张</div><div className="text-[11px] text-white/80 mt-0.5">¥0.00</div></>;
                      let count = 0; let amount = 0;
                      const now = new Date();
                      const bjNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
                      const today = bjNow.toISOString().split('T')[0];
                      const weekStart = (() => { const d = new Date(bjNow); d.setUTCDate(d.getUTCDate() - d.getUTCDay() + (d.getUTCDay() === 0 ? -6 : 1)); return d.toISOString().split('T')[0]; })();
                      const currentMonth = today.slice(0, 7);
                      const currentYear = today.slice(0, 4);
                      const currentQuarter = Math.floor(bjNow.getUTCMonth() / 3);
                      const quarterStart = new Date(Date.UTC(bjNow.getUTCFullYear(), currentQuarter * 3, 1)).toISOString().split('T')[0];
                      transactionsData.forEach((day: any) => {
                        let ok = false;
                        if (ajStatsPeriod === 'all') ok = true;
                        else if (ajStatsPeriod === 'day') ok = day.date === today;
                        else if (ajStatsPeriod === 'week') ok = day.date >= weekStart && day.date <= today;
                        else if (ajStatsPeriod === 'month') ok = day.date.startsWith(currentMonth);
                        else if (ajStatsPeriod === 'quarter') ok = day.date >= quarterStart && day.date <= today;
                        else if (ajStatsPeriod === 'year') ok = day.date.startsWith(currentYear);
                        if (ok) (day.records || []).filter((r: any) => r.ajStatus === 'approved').forEach((r: any) => { count++; amount += Number(r.amount) || 0; });
                      });
                      return (
                        <>
                          <div className="text-base font-bold text-white leading-tight">{count}张</div>
                          <div className="text-[11px] text-white/80 mt-0.5 overflow-hidden" style={{ whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>¥{amount.toFixed(2)}</div>
                        </>
                      );
                    })()}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
        {/* 普通账本：统计面板（总收入/总结余/总支出）融入红色头部 */}
        {!isCustomAE && !isDiet && !isCustomAF && !isCustomAH && !isCustomAI && !isCustomAJ && (
          <div className="px-4 pt-2 pb-1 relative">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="relative">
                <div className="text-xs opacity-90 flex items-center justify-center gap-1">
                  <span>
                    {!hasDateFilter && statsPeriod === 'day' && '今日'}
                    {!hasDateFilter && statsPeriod === 'week' && '本周'}
                    {!hasDateFilter && statsPeriod === 'month' && `${now.getMonth() + 1}月`}
                    {!hasDateFilter && statsPeriod === 'year' && '今年'}
                    {!hasDateFilter && statsPeriod === 'all' && '全部'}
                    总收入
                  </span>
                  <button
                    onClick={() => setShowPeriodMenu(!showPeriodMenu)}
                    className="inline-flex items-center justify-center w-4 h-4"
                  >
                    <svg className="w-4 h-4 fill-current" viewBox="0 0 12 12">
                      <path d="M6 8L2 4h8z" />
                    </svg>
                  </button>
                </div>
                <div className="text-lg font-medium">{monthlyStats.income.toFixed(2)}</div>
                {showPeriodMenu && (
                  <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden z-50 w-[5.5rem]">
                    {(['day', 'week', 'month', 'year', 'all'] as const).map((p, i) => (
                      <button
                        key={p}
                        onClick={() => { setStatsPeriod(p); setShowPeriodMenu(false); }}
                        className="w-full px-2 py-2.5 text-sm text-[#222222] active:bg-gray-100 text-center border-b border-gray-100 last:border-b-0"
                      >
                        {['按天', '按自然周', '按自然月', '按自然年', '总计'][i]}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <div className="text-xs opacity-90">
                  {!hasDateFilter && statsPeriod === 'day' && '今日'}
                  {!hasDateFilter && statsPeriod === 'week' && '本周'}
                  {!hasDateFilter && statsPeriod === 'month' && `${now.getMonth() + 1}月`}
                  {!hasDateFilter && statsPeriod === 'year' && '今年'}
                  {!hasDateFilter && statsPeriod === 'all' && '全部'}
                  总结余
                </div>
                <div className="text-lg font-medium">{monthlyStats.balance.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-xs opacity-90">
                  {!hasDateFilter && statsPeriod === 'day' && '今日'}
                  {!hasDateFilter && statsPeriod === 'week' && '本周'}
                  {!hasDateFilter && statsPeriod === 'month' && `${now.getMonth() + 1}月`}
                  {!hasDateFilter && statsPeriod === 'year' && '今年'}
                  {!hasDateFilter && statsPeriod === 'all' && '全部'}
                  总支出
                </div>
                <div className="text-lg font-medium">{monthlyStats.expense.toFixed(2)}</div>
              </div>
            </div>
          </div>
        )}
      </div>
      {/* 待审批提示：AJ账本只有owner能看，其他账本owner/admin都能看 */}
      {pendingApprovals.length > 0 && (isCustomAJ ? effectiveIsOwner : (effectiveIsOwner || effectiveIsAdmin)) && (
        <div 
          className="mx-4 mt-3 mb-2 bg-[#FFEBEE] border border-orange-200 rounded-lg p-3 flex items-center gap-2 cursor-pointer hover:bg-[#FFEBEE] transition-colors"
          onClick={() => setLocation(`/ledger/${ledgerId}/pending-approvals`)}
        >
          <Search className="w-4 h-4 text-[#CBA471] flex-shrink-0" />
          <span className="text-sm text-orange-800">
            你有 <span className="font-semibold">{pendingApprovals.length}</span> 个待审批账目
          </span>
          <ChevronRight className="w-4 h-4 text-[#CBA471] ml-auto" />
        </div>
      )}

      {/* 抽奖活动列表（双 Tab：正在进行中 / 往期回顾）—— 仅 custom_ae 账本 */}
      {isCustomAE && (
        <div className="flex-1 pb-20">
          {/* 子 Tab 切换栏 */}
          <div className="flex mx-4 mt-3 mb-3 rounded-xl overflow-hidden" style={{ backgroundColor: '#F5F5F5' }}>
            <button
              className={`flex-1 py-2.5 text-sm font-medium transition-colors rounded-xl ${
                lotteryTab === 'active'
                  ? 'bg-[#D32F2F] text-white shadow-sm'
                  : 'text-gray-500'
              }`}
              onClick={() => setLotteryTab('active')}
            >
              正在进行中
              {activeActivities.length > 0 && (
                <span className={`ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full text-xs ${
                  lotteryTab === 'active' ? 'bg-white/30 text-white' : 'bg-[#D32F2F] text-white'
                }`}>
                  {activeActivities.length}
                </span>
              )}
            </button>
            <button
              className={`flex-1 py-2.5 text-sm font-medium transition-colors rounded-xl ${
                lotteryTab === 'past'
                  ? 'bg-[#D32F2F] text-white shadow-sm'
                  : 'text-gray-500'
              }`}
              onClick={() => setLotteryTab('past')}
            >
              往期回顾
              {pastActivities.length > 0 && (
                <span className={`ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full text-xs ${
                  lotteryTab === 'past' ? 'bg-white/30 text-white' : 'bg-gray-400 text-white'
                }`}>
                  {pastActivities.length}
                </span>
              )}
            </button>
          </div>

          {/* 大图卡片流列表 */}
          <div className="px-4 space-y-3">
            {lotteryLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader className="w-6 h-6 text-[#D32F2F] animate-spin" />
              </div>
            ) : displayLotteryList.length === 0 ? (
              <div className="text-center py-12">
                <Gift className="w-14 h-14 text-gray-200 mx-auto mb-3" />
                {lotteryTab === 'active' ? (
                  <>
                    <div className="text-gray-400 text-base mb-1 font-medium">暂无进行中的活动</div>
                    <div className="text-gray-400 text-sm">账本管理员可在设置中创建抽奖活动</div>
                  </>
                ) : (
                  <>
                    <div className="text-gray-400 text-base mb-1 font-medium">还没有历史活动</div>
                    <div className="text-gray-400 text-sm">已结束或已取消的活动将在这里展示</div>
                  </>
                )}
              </div>
            ) : (
              displayLotteryList.map((activity: any, idx: number) => {
                const isActive = ['draft', 'open', 'drawing'].includes(activity.status);
                const isCompleted = activity.status === 'completed';
                const isCancelled = activity.status === 'cancelled';
                const placeholderGrad = PRIZE_PLACEHOLDER_COLORS[idx % PRIZE_PLACEHOLDER_COLORS.length];
                const firstWinnerName = activity.firstWinnerName || null;
                const recentParticipants: any[] = activity.recentParticipants ?? [];
                const participantCount = Number(activity.participantCount ?? 0);

                // 计算报名倒计时（依赖 tick 每秒刷新）
                void tick;
                const now = Date.now();
                const signupEndMs = activity.signup_end_at ? new Date(activity.signup_end_at).getTime() : null;
                const drawAtMs = activity.draw_at ? new Date(activity.draw_at).getTime() : null;
                const signupDiff = signupEndMs ? signupEndMs - now : null;
                const drawDiff = drawAtMs ? drawAtMs - now : null;

                // 格式化倒计时为 { d, h, m, s } 对象
                const parseDiff = (diff: number | null) => {
                  if (diff === null) return null;
                  if (diff <= 0) return { ended: true, d: 0, h: 0, m: 0, s: 0 };
                  const totalSec = Math.floor(diff / 1000);
                  const d = Math.floor(totalSec / 86400);
                  const h = Math.floor((totalSec % 86400) / 3600);
                  const m = Math.floor((totalSec % 3600) / 60);
                  const s = totalSec % 60;
                  return { ended: false, d, h, m, s };
                };
                const signupCd = parseDiff(signupDiff);
                const drawCd = parseDiff(drawDiff);

                // 格式化已过去时间（显示结束时间）
                const fmtDate = (ts: number) => {
                  const d = new Date(ts);
                  return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
                };

                // 翻牌数字组件（内联）
                const FlipDigit = ({ val, label }: { val: number; label: string }) => (
                  <div className="flex flex-col items-center">
                    <div
                      className="flex items-center justify-center rounded-md text-white font-bold text-[18px] leading-none"
                      style={{
                        width: '36px', height: '40px',
                        background: 'linear-gradient(180deg, #C62828 0%, #B71C1C 50%, #8B0000 50%, #7B0000 100%)',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.35)',
                        fontVariantNumeric: 'tabular-nums',
                        letterSpacing: '-0.02em',
                      }}
                    >
                      {String(val).padStart(2, '0')}
                    </div>
                    <span className="text-[9px] text-gray-400 mt-0.5">{label}</span>
                  </div>
                );

                // 倒计时显示组件
                const CountdownBlock = ({ cd, label, endedText, endedDate }: {
                  cd: ReturnType<typeof parseDiff>;
                  label: string;
                  endedText: string;
                  endedDate?: string; // 已结束时显示的日期文字（与翻牌块等高）
                }) => (
                  <div className="flex flex-col items-center">
                    <span className="text-[9px] text-gray-400 mb-1">{label}</span>
                    {!cd || cd.ended ? (
                      // 已结束：用类似翻牌块的容器显示，保持视觉高度一致
                      <div className="flex items-center gap-1">
                        <div
                          className="px-3 py-2 rounded-lg flex items-center justify-center"
                          style={{ background: '#EEEEEE', minWidth: '80px' }}
                        >
                          <span className="text-[11px] font-semibold text-center" style={{ color: '#9E9E9E' }}>
                            {endedDate ?? endedText}
                          </span>
                        </div>
                      </div>
                    ) : cd.d > 0 ? (
                      <div className="flex items-end gap-0.5">
                        <FlipDigit val={cd.d} label="天" />
                        <FlipDigit val={cd.h} label="时" />
                        <FlipDigit val={cd.m} label="分" />
                      </div>
                    ) : (
                      <div className="flex items-end gap-0.5">
                        <FlipDigit val={cd.h} label="时" />
                        <FlipDigit val={cd.m} label="分" />
                        <FlipDigit val={cd.s} label="秒" />
                      </div>
                    )}
                  </div>
                );

                return (
                  <div
                    key={activity.id}
                    className="relative rounded-2xl overflow-hidden cursor-pointer"
                    style={{
                      background: '#fff',
                      boxShadow: isActive
                        ? '0 4px 24px rgba(211,47,47,0.13)'
                        : '0 2px 10px rgba(0,0,0,0.07)',
                      opacity: isCancelled ? 0.6 : 1,
                      transition: 'transform 0.15s ease',
                    }}
                    onClick={() => setLocation(`/lottery/${activity.id}`)}
                    onTouchStart={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(0.98)'; }}
                    onTouchEnd={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; }}
                  >
                    {/* 已结束蒙层 */}
                    {!isActive && (
                      <div className="absolute inset-0 bg-white/40 z-10 pointer-events-none" />
                    )}

                    {/* Ribbon 标签 */}
                    {isCompleted && (
                      <div
                        className="absolute top-5 right-[-22px] z-20 text-white text-[9px] font-bold px-8 py-0.5 rotate-45"
                        style={{ background: '#757575', letterSpacing: '0.08em' }}
                      >
                        已开奖
                      </div>
                    )}
                    {isCancelled && (
                      <div
                        className="absolute top-5 right-[-22px] z-20 text-white text-[9px] font-bold px-8 py-0.5 rotate-45"
                        style={{ background: '#EF5350', letterSpacing: '0.08em' }}
                      >
                        已取消
                      </div>
                    )}
                    {activity.status === 'draft' && (
                      <div
                        className="absolute top-5 right-[-22px] z-20 text-white text-[9px] font-bold px-8 py-0.5 rotate-45"
                        style={{ background: '#BDBDBD', letterSpacing: '0.08em' }}
                      >
                        草稿
                      </div>
                    )}

                    {/* ── 顶部：横幅图片区（16:9） ── */}
                    <div className="relative w-full" style={{ paddingTop: '56.25%' }}>
                      {activity.banner_image_url || activity.cover_image_url ? (
                        <img
                          src={activity.banner_image_url || activity.cover_image_url}
                          alt={activity.title}
                          className="absolute inset-0 w-full h-full object-cover"
                        />
                      ) : (
                        <div
                          className={`absolute inset-0 w-full h-full bg-gradient-to-br ${placeholderGrad} flex flex-col items-center justify-center gap-2`}
                        >
                          <Gift className="w-12 h-12 text-white/70" />
                          <span className="text-white/50 text-[11px] tracking-wide">奖品图片</span>
                        </div>
                      )}
                      {/* 图片底部渐变遮罩 + 标题叠加 */}
                      <div
                        className="absolute bottom-0 left-0 right-0 px-3 pt-8 pb-2.5"
                        style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.72) 0%, transparent 100%)' }}
                      >
                        <span className="text-white text-[15px] font-bold line-clamp-1 block" style={{ lineHeight: '1.4', textShadow: '0 1px 4px rgba(0,0,0,0.5)' }}>
                          {activity.title}
                        </span>
                      </div>
                      {/* 右上角浮层已移除，倒计时改为状态条显示 */}
                      {/* 开奖中火焰标（左上角） */}
                      {activity.status === 'drawing' && (
                        <div className="absolute top-2 left-2 bg-orange-500 rounded-full p-1 z-10"
                          style={{ boxShadow: '0 2px 6px rgba(255,109,0,0.5)' }}>
                          <Flame className="w-3.5 h-3.5 text-white" />
                        </div>
                      )}
                    </div>
                    {/* ── 通栏状态条：图片下方，左边距开奖倒计时，右边报名截止时间 ── */}
                    {isActive && (
                      <div
                        className="flex items-center px-3 py-2"
                        style={{ background: 'rgba(28,18,18,0.05)', borderBottom: '1px solid rgba(0,0,0,0.05)' }}
                      >
                        {/* ─── 左1/3：距开奖 ─── */}
                        <div className="flex items-center justify-center gap-1 overflow-hidden" style={{ flex: 1 }}>
                          {drawAtMs ? (
                            <>
                              <span className="text-[10px] font-medium flex-shrink-0" style={{ color: '#B71C1C' }}>距开奖</span>
                              {drawCd && !drawCd.ended ? (
                                <span className="text-[12px] font-bold tabular-nums flex-shrink-0" style={{ color: '#B71C1C', letterSpacing: '-0.02em' }}>
                                  {drawCd.d > 0
                                    ? `${String(drawCd.d).padStart(2,'0')}天${String(drawCd.h).padStart(2,'0')}时`
                                    : `${String(drawCd.h).padStart(2,'0')}:${String(drawCd.m).padStart(2,'0')}:${String(drawCd.s).padStart(2,'0')}`
                                  }
                                </span>
                              ) : (
                                <span className="text-[10px] font-semibold flex-shrink-0" style={{ color: '#9E9E9E' }}>即将开奖</span>
                              )}
                            </>
                          ) : activity.status === 'drawing' ? (
                            <span className="text-[10px] font-bold" style={{ color: '#E65100' }}>开奖中</span>
                          ) : activity.status === 'draft' ? (
                            <span className="text-[10px] font-bold" style={{ color: '#9E9E9E' }}>草稿</span>
                          ) : <span className="text-[10px]" style={{ color: '#BDBDBD' }}>—</span>}
                        </div>

                        {/* 细竖线1 */}
                        <div className="flex-shrink-0" style={{ width: '0.5px', height: 14, background: 'rgba(0,0,0,0.13)' }} />

                        {/* ─── 中1/3：报名截止 ─── */}
                        <div className="flex items-center justify-center overflow-hidden" style={{ flex: 1 }}>
                          {signupEndMs ? (
                            <span className="text-[10px] truncate" style={{ color: signupCd?.ended ? '#9E9E9E' : '#5a5a5a' }}>
                              {signupCd?.ended ? `截止 ${fmtDate(signupEndMs)}` : `截止 ${fmtDate(signupEndMs)}`}
                            </span>
                          ) : (
                            <span className="text-[10px]" style={{ color: '#BDBDBD' }}>—</span>
                          )}
                        </div>

                        {/* 细竖线2 */}
                        <div className="flex-shrink-0" style={{ width: '0.5px', height: 14, background: 'rgba(0,0,0,0.13)' }} />

                        {/* ─── 右1/3：中奖者 ─── */}
                        <div className="flex items-center justify-center gap-1.5 overflow-hidden" style={{ flex: 1 }}>
                          {activity.firstWinnerName ? (
                            <>
                              <div className="rounded-full overflow-hidden flex-shrink-0" style={{ width: 16, height: 16 }}>
                                {activity.firstWinnerAvatar ? (
                                  <img src={activity.firstWinnerAvatar} alt={activity.firstWinnerName} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-white font-bold" style={{ background: '#B71C1C', fontSize: 7 }}>
                                    {(activity.firstWinnerName || '?')[0]}
                                  </div>
                                )}
                              </div>
                              <span className="text-[10px] truncate" style={{ color: '#5a5a5a' }}>{activity.firstWinnerName}</span>
                            </>
                          ) : (
                            <>
                              <div className="rounded-full flex-shrink-0" style={{ width: 16, height: 16, background: 'rgba(0,0,0,0.06)', border: '1px dashed rgba(0,0,0,0.15)' }} />
                              <span className="text-[10px]" style={{ color: '#BDBDBD' }}>待开奖</span>
                            </>
                          )}
                        </div>
                      </div>
                    )}

                    {/* ── 底部：参与人数 + 头像 ── */}
                    <div className="px-3 py-2.5 flex items-center gap-2 overflow-hidden">
                      {isActive ? (
                        <>
                          {/* 左侧：参与人数，不压缩 */}
                          <span className="text-[11px] text-gray-400 flex-shrink-0">{participantCount} 人已参与</span>
                          {/* 头像堆叠：紧跟在文字后，从左开始排列，不靠右 */}
                          {recentParticipants.length > 0 && (() => {
                            const MAX_SHOW = 7;
                            const shown = recentParticipants.slice(0, MAX_SHOW);
                            const extra = participantCount - shown.length;
                            const avatarSize = 30;
                            const overlapPx = 9;
                            return (
                              <div className="flex items-center">
                                {shown.map((p: any, pi: number) => (
                                  <div
                                    key={pi}
                                    className="rounded-full border-2 border-white overflow-hidden flex-shrink-0"
                                    style={{
                                      width: avatarSize,
                                      height: avatarSize,
                                      marginLeft: pi === 0 ? 0 : -overlapPx,
                                      zIndex: MAX_SHOW - pi,
                                      position: 'relative',
                                    }}
                                  >
                                    {p.avatar_url ? (
                                      <img src={p.avatar_url} alt={p.display_name} className="w-full h-full object-cover" />
                                    ) : (
                                      <div
                                        className="w-full h-full flex items-center justify-center font-bold text-white"
                                        style={{ background: '#D32F2F', fontSize: 11 }}
                                      >
                                        {(p.display_name || '?')[0]}
                                      </div>
                                    )}
                                  </div>
                                ))}
                                {extra > 0 && (
                                  <div
                                    className="rounded-full border-2 border-white flex items-center justify-center flex-shrink-0 font-bold text-white"
                                    style={{
                                      width: avatarSize,
                                      height: avatarSize,
                                      marginLeft: -overlapPx,
                                      background: '#BDBDBD',
                                      zIndex: 0,
                                      position: 'relative',
                                      fontSize: 8,
                                    }}
                                  >+{extra}</div>
                                )}
                              </div>
                            );
                          })()}
                        </>
                      ) : (
                        <>
                          {/* 已结束：中奖者或参与人数 */}
                          <div className="flex items-center gap-1">
                            {firstWinnerName ? (
                              <>
                                <Trophy className="w-3.5 h-3.5 text-[#CBA471]" />
                                <span className="text-[11px] text-gray-500 truncate max-w-[140px]">中奖：{firstWinnerName}</span>
                              </>
                            ) : (
                              <>
                                <Users className="w-3.5 h-3.5 text-gray-400" />
                                <span className="text-[11px] text-gray-400">{participantCount} 人参与</span>
                              </>
                            )}
                            {/* 已结束时间说明 */}
                            {isCompleted && drawAtMs && (
                              <span className="text-[10px] text-gray-300 ml-1">· {fmtDate(drawAtMs)} 开奖</span>
                            )}
                          </div>
                          <button
                            className="text-[11px] font-medium text-gray-400 border border-gray-200 px-3.5 py-1.5 rounded-full bg-white flex-shrink-0"
                            onClick={e => { e.stopPropagation(); setLocation(`/lottery/${activity.id}`); }}
                          >
                            查看名单
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* AF账本非资方用户：三Tab切换（谷底增筹 / 融资付息 / 行情评估） */}
      {isCustomAF && !effectiveIsFunder && (
        <div className="flex-1 px-4 pb-20">
          <div className="space-y-3 mt-2">
              {/* 谷底增筹 / 融资付息 左右两个入口按鈕 */}
              <div className="flex gap-3">
                {/* 谷底增筹 */}
                <button
                  onClick={() => setLocation(`/ledger/${ledgerId}/crypto-prediction?hideTab=1${viewAsUserId ? `&viewAs=${viewAsUserId}` : ''}`)}
                  className="flex-1 rounded-2xl flex items-center justify-center shadow-sm active:opacity-90"
                  style={{ backgroundColor: '#FFFFFF', border: '1px solid #E0E8FF', boxShadow: '0 2px 8px rgba(26,86,219,0.08)', minHeight: '64px' }}
                >
                  <span className="text-sm font-semibold" style={{ color: '#1A2340' }}>谷底增筹</span>
                </button>
                {/* 融资付息 */}
                <button
                  onClick={() => setLocation(`/ledger/${ledgerId}/crypto-prediction?tab=finance&hideTab=1${viewAsUserId ? `&viewAs=${viewAsUserId}` : ''}`)}
                  className="flex-1 rounded-2xl flex items-center justify-center shadow-sm active:opacity-90"
                  style={{ backgroundColor: '#FFFFFF', border: '1px solid #E0E8FF', boxShadow: '0 2px 8px rgba(26,86,219,0.08)', minHeight: '64px' }}
                >
                  <span className="text-sm font-semibold" style={{ color: '#1A2340' }}>融资付息</span>
                </button>
              </div>

              {/* ETH 智能仓位管理（全宽） */}
              <button
                onClick={() => setLocation(`/ledger/${ledgerId}/position-calc${viewAsUserId ? `?viewAs=${viewAsUserId}` : ''}`)}
                className="w-full rounded-2xl p-4 flex flex-col shadow-sm active:opacity-90"
                style={{ backgroundColor: '#FFFFFF', border: '1px solid #E0E8FF', boxShadow: '0 2px 8px rgba(26,86,219,0.08)' }}
              >
                {/* 标题行 */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-full flex-shrink-0 overflow-hidden flex items-center justify-center">
                      <img src="https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/eth-official.png" alt="ETH" style={{ width: '140%', height: '140%', objectFit: 'contain', transform: 'scale(1.4)' }} />
                    </div>
                    <div className="text-left">
                      <div className="font-semibold text-base" style={{ color: '#1A2340' }}>ETH 智能仓位</div>
                      <div className="text-xs mt-0.5" style={{ color: '#6B7280' }}>以太坊分批建仓管理</div>
                    </div>
                  </div>
                  <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ backgroundColor: '#3B5BDB' }}>
                    <ChevronRight className="w-4 h-4 text-white" />
                  </div>
                </div>
                {/* 进度条预览 */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs" style={{ color: '#6B7280' }}>目标仓位 {ethTargetQty > 0 ? `${Math.round(ethTargetQty)} ETH` : '--'}</span>
                    <span className="text-xs font-semibold" style={{ color: '#1A2340' }}>已建仓 <span style={{ color: '#b8860b' }}>{ethActualQty > 0 ? `${Math.round(ethActualQty)}` : '0'} ETH</span></span>
                  </div>
                  <div className="relative w-full rounded-full overflow-hidden" style={{ height: '14px', background: 'rgba(26,35,64,0.08)' }}>
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.round(ethPositionPct * 100)}%`,
                        background: 'linear-gradient(90deg, #9a7000, #d4af37, #f5e27a)',
                        transition: 'width 0.4s ease',
                        minWidth: ethPositionPct > 0 ? '28px' : '0',
                      }}
                    />
                    <span
                      className="absolute inset-0 flex items-center justify-end pr-1.5 text-[10px] font-bold"
                      style={{ color: ethPositionPct > 0.15 ? '#1A2340' : '#b8860b' }}
                    >
                      {Math.round(ethPositionPct * 100)}%
                    </span>
                  </div>
                </div>
              </button>

              {/* GTO 德州扑克入口 - 仅创建者/管理员可见，视角查看时隐藏 */}
              {(isOwner || isAdmin) && !viewAsUserId && <button
                onClick={() => setLocation(`/ledger/${ledgerId}/gto`)}
                className="w-full rounded-2xl p-4 flex items-center gap-4 shadow-sm active:opacity-90"
                style={{ background: 'linear-gradient(135deg, #0a3d1f 0%, #1a5c2e 50%, #0d4a25 100%)', border: '1px solid #2d7a3a', boxShadow: '0 2px 12px rgba(0,80,20,0.18)' }}
              >
                <div className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 text-2xl" style={{ background: 'rgba(255,255,255,0.12)', border: '1.5px solid rgba(255,255,255,0.25)' }}>
                  🃏
                </div>
                <div className="text-left flex-1">
                  <div className="font-semibold text-base text-white">GTO 策略</div>
                  <div className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.65)' }}>起手牌范围 · 赔率计算 · 策略笔记</div>
                </div>
                <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)' }}>
                  <ChevronRight className="w-4 h-4 text-white" />
                </div>
              </button>}

              {/* 网格交易模拟测算入口 - 仅创建者可见，视角查看时隐藏 */}
              {isCustomAF && isOwner && !viewAsUserId && <button
                onClick={() => setLocation(`/ledger/${ledgerId}/grid-simulator`)}
                className="w-full rounded-2xl p-4 flex items-center gap-4 shadow-sm active:opacity-90"
                style={{ background: 'linear-gradient(135deg, #0a1a3d 0%, #1a2e5c 50%, #0d1f4a 100%)', border: '1px solid #2d4a7a', boxShadow: '0 2px 12px rgba(0,20,80,0.18)' }}
              >
                <div className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 text-2xl" style={{ background: 'rgba(255,255,255,0.12)', border: '1.5px solid rgba(255,255,255,0.25)' }}>
                  📊
                </div>
                <div className="text-left flex-1">
                  <div className="font-semibold text-base text-white">网格交易模拟测算</div>
                  <div className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.65)' }}>参数设置 · 收益模拟 · 策略测算</div>
                </div>
                <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)' }}>
                  <ChevronRight className="w-4 h-4 text-white" />
                </div>
              </button>}
              {/* 固定差价止盈网格模拟测算入口 - 仅创建者可见，视角查看时隐藏 */}
              {isCustomAF && isOwner && !viewAsUserId && <button
                onClick={() => setLocation(`/ledger/${ledgerId}/grid-tp-simulator`)}
                className="w-full rounded-2xl p-4 flex items-center gap-4 shadow-sm active:opacity-90"
                style={{ background: 'linear-gradient(135deg, #1a0a3d 0%, #2e1a5c 50%, #1f0d4a 100%)', border: '1px solid #4a2d7a', boxShadow: '0 2px 12px rgba(40,0,80,0.18)' }}
              >
                <div className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 text-2xl" style={{ background: 'rgba(255,255,255,0.12)', border: '1.5px solid rgba(255,255,255,0.25)' }}>
                  📈
                </div>
                <div className="text-left flex-1">
                  <div className="font-semibold text-base text-white">固定差价止盈网格</div>
                  <div className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.65)' }}>差价设置 · 止盈模拟 · 最优差价分析</div>
                </div>
                <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)' }}>
                  <ChevronRight className="w-4 h-4 text-white" />
                </div>
              </button>}
            </div>
        </div>
      )}

      {/* ETH 杠杆产品参数展示已移除 */}

      {/* 持仓计算入口已合并到以太坊行右半 */}
      {/* 资金方专属：资产订单列表 */}
      {isCustomAF && effectiveIsFunder && (
        <div className="flex-1 px-4 pb-20">
          <div className="mt-4">

            <div className="flex items-center mb-3">
              <h3 className="text-base font-semibold" style={{ color: '#1A2340' }}>资产订单</h3>
              <span className="text-xs text-gray-400 ml-1.5">共 {(funderAssetOrders as any[])?.filter((o: any) => o.status !== 'settled').length ?? 0} 笔</span>
              {/* 左右拨动开关 */}
              <div
                className="ml-auto flex items-center"
                style={{
                  background: '#E5E7EB',
                  borderRadius: '999px',
                  padding: '2px',
                  position: 'relative',
                  cursor: 'pointer',
                  userSelect: 'none',
                  width: '160px',
                  height: '26px',
                }}
                onClick={() => setFunderViewMode(funderViewMode === 'card' ? 'order' : 'card')}
              >
                {/* 滑动块 */}
                <div style={{
                  position: 'absolute',
                  top: '2px',
                  left: funderViewMode === 'card' ? '2px' : '80px',
                  width: '78px',
                  height: '22px',
                  borderRadius: '999px',
                  background: '#1A56DB',
                  transition: 'left 0.22s cubic-bezier(0.4,0,0.2,1)',
                  boxShadow: '0 1px 4px rgba(26,86,219,0.25)',
                }} />
                {/* 左标签：卡片模式 */}
                <span style={{
                  position: 'relative', zIndex: 1,
                  fontSize: '11px', fontWeight: 500,
                  color: funderViewMode === 'card' ? '#fff' : '#9CA3AF',
                  transition: 'color 0.22s',
                  width: '80px', lineHeight: '22px', textAlign: 'center', display: 'inline-block',
                }}>卡片模式</span>
                {/* 右标签：订单模式 */}
                <span style={{
                  position: 'relative', zIndex: 1,
                  fontSize: '11px', fontWeight: 500,
                  color: funderViewMode === 'order' ? '#fff' : '#9CA3AF',
                  transition: 'color 0.22s',
                  width: '80px', lineHeight: '22px', textAlign: 'center', display: 'inline-block',
                }}>订单模式</span>
              </div>
            </div>
            {(!funderAssetOrders || (funderAssetOrders as any[]).length === 0) ? (
              <div className="text-center py-12">
                <Receipt className="w-14 h-14 text-gray-200 mx-auto mb-3" />
                <div className="text-gray-400 text-base mb-1">暂无资产订单</div>
                <div className="text-gray-400 text-sm">管理员将为您配置资产订单</div>
              </div>
            ) : funderViewMode === 'card' ? (
              /* 卡片模式：銀色铭牌风格 */
              <div className="space-y-3">
                {(funderAssetOrders as any[]).filter((order: any) => order.status !== 'settled').map((order: any) => {
                  // 按利率符号判断布局：正号（rate>=0）→付息型（突出利息），负号（rate<0）→权益型（突出持有数量/浮动盈亏）
                  const rateVal = parseFloat(String(order.interest_rate_annual || '0'));
                  return rateVal > 0 ? (
                    <FunderLenderCardSilver
                      key={order.id}
                      order={order}
                      ledgerId={ledgerId}
                      livePrices={funderLivePrices}
                      priceDirection={funderPriceDirection}
                      membersData={membersData as any[]}
                      cnyRate={cnyRate}
                    />
                  ) : (
                    <FunderOrderCardV2Silver
                      key={order.id}
                      order={order}
                      livePrices={funderLivePrices}
                      priceDirection={funderPriceDirection}
                      membersData={membersData as any[]}
                      cnyRate={cnyRate}
                    />
                  );
                })}
              </div>
            ) : (
              /* 订单模式：原始 FunderOrderCard */
              <div className="space-y-3">
                {(funderAssetOrders as any[]).filter((order: any) => order.status !== 'settled').map((order: any) => (
                  <FunderOrderCard
                    key={order.id}
                    order={order}
                    ledgerId={ledgerId}
                    livePrices={funderLivePrices}
                    priceDirection={funderPriceDirection}
                    currentUser={user}
                    membersData={membersData as any[]}
                    isAdmin={false}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 资金方订单详情弹窗 */}
      {selectedFunderOrder && (
        <Suspense fallback={null}>
          <FunderOrderDetailModal
            order={selectedFunderOrder}
            ledgerId={ledgerId}
            onClose={() => setSelectedFunderOrder(null)}
          />
        </Suspense>
      )}



      {/* AH 账本：公司列表 + 报税授权管理 */}
      {isCustomAH && (
        <div className="flex-1 px-4 pb-20">
          <div className="mt-4">


            {/* 新建公司表单 */}
            {showAhCreateCompany && (isOwner || isAdmin) && (
              <div className="mb-4 p-4 rounded-xl border border-gray-200" style={{ backgroundColor: '#F8FAFF' }}>
                <div className="space-y-2">
                  <Input
                    placeholder="公司名称 *"
                    value={ahNewCompanyName}
                    onChange={(e: any) => setAhNewCompanyName(e.target.value)}
                    className="text-sm"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      placeholder="联系人"
                      value={ahNewCompanyContact}
                      onChange={(e: any) => setAhNewCompanyContact(e.target.value)}
                      className="text-sm"
                    />
                    <Input
                      placeholder="联系电话"
                      value={ahNewCompanyPhone}
                      onChange={(e: any) => setAhNewCompanyPhone(e.target.value)}
                      className="text-sm"
                    />
                  </div>
                  <Input
                    placeholder="税号"
                    value={ahNewCompanyTaxId}
                    onChange={(e: any) => setAhNewCompanyTaxId(e.target.value)}
                    className="text-sm"
                  />
                  <div className="flex gap-2 pt-1">
                    <Button
                      size="sm"
                      className="text-white"
                      style={{ backgroundColor: '#1A56DB' }}
                      disabled={ahCreateCompanyMutation.isPending || !ahNewCompanyName.trim()}
                      onClick={() => {
                        ahCreateCompanyMutation.mutate({
                          ledgerId: Number(ledgerId),
                          name: ahNewCompanyName.trim(),
                          contactName: ahNewCompanyContact.trim() || undefined,
                          contactPhone: ahNewCompanyPhone.trim() || undefined,
                          taxId: ahNewCompanyTaxId.trim() || undefined,
                        });
                        setAhNewCompanyName('');
                        setAhNewCompanyContact('');
                        setAhNewCompanyPhone('');
                        setAhNewCompanyTaxId('');
                        setShowAhCreateCompany(false);
                      }}
                    >
                      {ahCreateCompanyMutation.isPending ? '创建中...' : '确认创建'}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setShowAhCreateCompany(false)}>取消</Button>
                  </div>
                </div>
              </div>
            )}

            {/* 公司卡片列表 */}
            {!ahCompanies || ahCompanies.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center" style={{ backgroundColor: '#EBF0FF' }}>
                  <Building2 className="w-8 h-8" style={{ color: '#3B82F6' }} />
                </div>
                <div className="text-gray-500 text-base mb-1">暂无公司</div>
                <div className="text-gray-400 text-sm">{(isOwner || isAdmin) ? '点击上方「新建公司」添加第一家客户公司' : '管理员尚未添加您的公司'}</div>
              </div>
            ) : (
              <div className="space-y-3">
                {(ahCompanies as any[]).map((company: any) => {
                  // 找到该公司最新的报税授权记录
                  const companyAuths = (ahTaxAuths as any[] || []).filter((a: any) => a.companyId === company.id);
                  const latestAuth = companyAuths.length > 0 ? companyAuths[0] : null;
                  // 计算报税截止日（含节假日/周末顺延）
                  const taxInfo = getNextTaxDeadlineInfo();
                  const { deadline: nextDue, daysLeft, postponed: isPostponed, reason: postponeReason, taxMonth: reportTaxMonth, taxYear: reportTaxYear } = taxInfo;
                  const statusColor = latestAuth?.status === 'authorized' ? '#10B981' : latestAuth?.status === 'filed' ? '#6B7280' : latestAuth?.status === 'expired' ? '#EF4444' : '#F59E0B';
                  const statusText = latestAuth?.status === 'authorized' ? '客户已授权，可申报扣税' : latestAuth?.status === 'filed' ? '已申报' : latestAuth?.status === 'expired' ? '已过期' : '待客户授权';

                  return (
                    <div key={company.id} className="rounded-xl border border-gray-100 overflow-hidden" style={{ backgroundColor: '#FFFFFF' }}>
                      {/* 公司头部 */}
                      <div className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3 flex-1 cursor-pointer" onClick={() => setLocation(`/ledger/${ledgerId}/company/${company.id}`)}>
                            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#EBF0FF' }}>
                              <Building2 className="w-5 h-5" style={{ color: '#1A56DB' }} />
                            </div>
                            <div className="flex-1">
                              <div className="font-medium text-gray-900 text-sm">{company.name}</div>
                              {company.taxId && <div className="text-xs text-gray-400 mt-0.5">税号: {company.taxId}</div>}
                              {company.contactName && <div className="text-xs text-gray-400">联系人: {company.contactName} {company.contactPhone}</div>}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* 单行预览条 */}
                      <div className="px-4 pb-3">
                        <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ backgroundColor: '#F8FAFF' }}>
                          {/* 报税标签 */}
                          <span className="text-xs text-gray-400">报税</span>
                          {/* 分隔符 */}
                          <span className="text-gray-200 text-xs">|</span>
                          {/* 申报月份 + 截止日 */}
                          <span className="text-xs text-gray-700 font-medium">{reportTaxMonth}月税务</span>
                          <span className="text-xs text-gray-400">{nextDue.getMonth() + 1}月{nextDue.getDate()}日截止</span>
                          {/* 倒计时 */}
                          <span className="text-xs font-bold ml-auto" style={{ color: daysLeft <= 3 ? '#EF4444' : daysLeft <= 7 ? '#F59E0B' : '#1A56DB' }}>还有{daysLeft}天</span>
                          {/* 分隔符 */}
                          <span className="text-gray-200 text-xs">|</span>
                          {/* 授权状态圆点 */}
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: statusColor }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* AI 账本：商品详情页（按 S1 第十三章规范，由 AI 海报图动态生成） */}
      {false && isCustomAI && (
        <div className="pb-24">
          {/* 商品详情页已清除，下次配置商品时按 S1 规范重新生成 */}
          <div className="w-full overflow-x-auto" style={{ scrollSnapType: 'x mandatory' }}>
            <div className="flex" style={{ width: '300%' }}>
              {[
                'https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/mizone/hero_banner.jpg',
                'https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/mizone/scene_outdoor.jpg',
                'https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/mizone/scene_office.jpg',
              ].map((src, i) => (
                <div key={i} className="flex-shrink-0" style={{ width: '33.333%', scrollSnapAlign: 'start' }}>
                  <img src={src} alt={`脉动主图${i+1}`} className="w-full object-cover" style={{ maxHeight: '420px', objectFit: 'cover' }} />
                </div>
              ))}
            </div>
          </div>

          {/* 2. 商品名称 + 卖点副标题 */}
          <div className="px-4 pt-4 pb-2" style={{ background: '#fff' }}>
            <div className="text-xs px-2 py-0.5 rounded-full inline-block mb-1" style={{ background: '#FFF3E0', color: '#E65100' }}>达能集团 · 正品保障</div>
            <h1 className="text-xl font-bold text-gray-900 leading-tight">脉动（Mizone）桃子口味维生素饮料</h1>
            <p className="text-sm text-gray-500 mt-1">3D源动力 · 富含维C+烟酸+B6 · 清爽补水不甜腻</p>
          </div>

          {/* 3. 价格区域 */}
          <div className="px-4 py-3" style={{ background: '#FFF8F0' }}>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold" style={{ color: '#E53935' }}>¥4.00</span>
              <span className="text-sm text-gray-400 line-through">¥6.00</span>
              <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: '#E53935', color: '#fff' }}>限时特惠</span>
            </div>
            <p className="text-xs text-gray-400 mt-1">已有 2,847 人购买</p>
          </div>

          {/* 4. 服务保障横条 */}
          <div className="px-4 py-3 flex items-center justify-around border-b border-gray-100" style={{ background: '#fff' }}>
            {[['包邮到家','🚚'],['7天退换','🔄'],['正品保证','✅'],['假一赔三','🛡️']].map(([label, icon]) => (
              <div key={label} className="flex flex-col items-center gap-0.5">
                <span className="text-base">{icon}</span>
                <span className="text-xs text-gray-500">{label}</span>
              </div>
            ))}
          </div>

          {/* 5. 品牌溯源 */}
          <div className="px-4 pt-4 pb-2" style={{ background: '#fff' }}>
            <div className="text-sm font-bold text-gray-800 mb-2">品牌溯源</div>
            <img src="https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/mizone/brand_story.jpg" alt="品牌溯源" className="w-full rounded-lg" />
            <p className="text-xs text-gray-500 mt-2 leading-relaxed">脉动（Mizone）源自新西兰，由法国达能集团旗下品牌，2003年正式进入中国市场。凭借独特的维生素配方和清爽口感，迅速成为中国维生素饮料品类第一品牌，深受年轻人和运动爱好者喜爱。</p>
          </div>

          {/* 6. 核心卖点 */}
          <div className="px-4 pt-4 pb-2 mt-2" style={{ background: '#F0F7FF' }}>
            <div className="text-sm font-bold text-gray-800 mb-3">核心卖点</div>
            {[
              { icon: '💧', title: '清爽补水', desc: '低糖配方，喝完不黏腻，运动后最佳选择' },
              { icon: '⚡', title: '3D源动力', desc: '维C+烟酸+B6三重维生素，快速恢复活力' },
              { icon: '🍑', title: '天然桃子香', desc: '真实桃子风味，不含人工色素，口感清新' },
              { icon: '🏃', title: '运动专属', desc: '适合跑步、健身、户外等各类运动场景' },
            ].map(({ icon, title, desc }) => (
              <div key={title} className="flex items-start gap-3 mb-3">
                <span className="text-2xl flex-shrink-0">{icon}</span>
                <div>
                  <div className="text-sm font-semibold text-gray-800">{title}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{desc}</div>
                </div>
              </div>
            ))}
          </div>

          {/* 7. 模特场景图 */}
          <div className="px-4 pt-4 pb-2" style={{ background: '#fff' }}>
            <div className="text-sm font-bold text-gray-800 mb-2">使用场景</div>
            <div className="grid grid-cols-2 gap-2">
              <img src="https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/mizone/scene_outdoor.jpg" alt="户外运动" className="w-full rounded-lg object-cover" style={{ height: '180px' }} />
              <img src="https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/mizone/scene_office.jpg" alt="办公室" className="w-full rounded-lg object-cover" style={{ height: '180px' }} />
            </div>
            <p className="text-xs text-gray-400 mt-1 text-center">跑步 · 健身 · 办公 · 日常补水</p>
          </div>

          {/* 8. 维生素成分细节图 */}
          <div className="px-4 pt-4 pb-2 mt-2" style={{ background: '#fff' }}>
            <div className="text-sm font-bold text-gray-800 mb-2">成分详解</div>
            <img src="https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/mizone/detail_vitamins.jpg" alt="维生素成分" className="w-full rounded-lg" />
          </div>

          {/* 9. 规格参数表 */}
          <div className="px-4 pt-4 pb-2 mt-2" style={{ background: '#fff' }}>
            <div className="text-sm font-bold text-gray-800 mb-2">规格参数</div>
            <table className="w-full text-xs">
              <tbody>
                {[
                  ['品牌','脉动（Mizone）'],
                  ['规格','400ml / 瓶'],
                  ['口味','桃子口味'],
                  ['产地','中国大陆'],
                  ['生产商','达能（中国）食品饮料有限公司'],
                  ['主要成分','水、白砂糖、桃汁、维生素C、烟酸、维生素B6'],
                  ['能量','83kJ/100ml'],
                  ['保质期','12个月'],
                ].map(([k, v]) => (
                  <tr key={k} className="border-b border-gray-100">
                    <td className="py-2 text-gray-400 w-1/3">{k}</td>
                    <td className="py-2 text-gray-700 font-medium">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 10. FAQ */}
          <div className="px-4 pt-4 pb-2 mt-2" style={{ background: '#F9F9F9' }}>
            <div className="text-sm font-bold text-gray-800 mb-3">常见问题</div>
            {[
              { q: '这款饮料含糖量高吗？', a: '低糖配方，每100ml仅含4.9g碳水化合物，适合日常饮用。' },
              { q: '运动后喝有效果吗？', a: '有效！维生素B6和烟酸帮助能量代谢，运动后补充效果更佳。' },
              { q: '可以冷藏后饮用吗？', a: '当然可以，冷藏后口感更清爽，建议4-8°C冷藏。' },
              { q: '儿童可以喝吗？', a: '适合12岁以上青少年及成人饮用，儿童建议适量。' },
            ].map(({ q, a }) => (
              <div key={q} className="mb-3">
                <div className="text-xs font-semibold text-gray-700">Q：{q}</div>
                <div className="text-xs text-gray-500 mt-0.5 pl-3">A：{a}</div>
              </div>
            ))}
          </div>

          {/* 11. 物流发货说明 */}
          <div className="px-4 pt-4 pb-2 mt-2" style={{ background: '#fff' }}>
            <div className="text-sm font-bold text-gray-800 mb-2">发货说明</div>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-xs text-gray-600">
                <span className="text-base">📦</span>
                <span>发货地：广东省广州市 · 顺丰/京东快递</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-600">
                <span className="text-base">⏱️</span>
                <span>付款后24小时内发货，节假日顺延</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-600">
                <span className="text-base">🚚</span>
                <span>全国包邮（偏远地区除外）</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-600">
                <span className="text-base">🔄</span>
                <span>7天无理由退换，收到商品请当面验货</span>
              </div>
            </div>
          </div>

          {/* 12. 底部购买按钮（吸底固定） */}
          <div className="fixed bottom-0 left-0 right-0 px-4 py-3 z-50" style={{ background: '#fff', boxShadow: '0 -2px 12px rgba(0,0,0,0.08)' }}>
            <button
              onClick={() => { window.location.href = 'https://jiangyuchen.cn/api/alipay/quick-pay?amount=4&subject=脉动桃子口味运动饮料400ml'; }}
              className="w-full py-3.5 rounded-full text-white font-bold text-base"
              style={{ background: 'linear-gradient(90deg, #FF6B35 0%, #FF4500 100%)' }}
            >
              立即购买 ¥4.00
            </button>
          </div>
        </div>
      )}

      {/* AI 账本：食物热量扫描界面（待视觉模型接入后启用） */}
      {false && isCustomAI && (
        <div className="flex-1 px-4 pb-20 pt-4">
          {/* 隐藏文件输入：相册上传 */}
          <input
            ref={foodFileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = (ev) => {
                const base64 = (ev.target?.result as string).split(',')[1];
                setFoodScanImage(ev.target?.result as string);
                setFoodScanResult(null);
                setFoodScanError(null);
                // 自动分析
                setFoodScanLoading(true);
                fetch('/api/food/analyze', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ imageBase64: base64, mimeType: file.type }),
                })
                  .then(r => r.json())
                  .then(data => {
                    if (data.success) setFoodScanResult(data);
                    else setFoodScanError(data.error || 'AI 分析失败');
                  })
                  .catch(() => setFoodScanError('网络错误，请重试'))
                  .finally(() => setFoodScanLoading(false));
              };
              reader.readAsDataURL(file);
            }}
          />
          {/* 隐藏文件输入：摄像头拍照 */}
          <input
            ref={foodCameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = (ev) => {
                const base64 = (ev.target?.result as string).split(',')[1];
                setFoodScanImage(ev.target?.result as string);
                setFoodScanResult(null);
                setFoodScanError(null);
                setFoodScanLoading(true);
                fetch('/api/food/analyze', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ imageBase64: base64, mimeType: file.type }),
                })
                  .then(r => r.json())
                  .then(data => {
                    if (data.success) setFoodScanResult(data);
                    else setFoodScanError(data.error || 'AI 分析失败');
                  })
                  .catch(() => setFoodScanError('网络错误，请重试'))
                  .finally(() => setFoodScanLoading(false));
              };
              reader.readAsDataURL(file);
            }}
          />

          {/* 标题区 */}
          <div className="text-center mb-4">
            <div className="text-xl font-bold text-gray-800">AI 食物热量扫描</div>
            <div className="text-xs text-gray-400 mt-1">拍照或上传食物图片，AI 智能识别食材并估算热量</div>
          </div>

          {/* 拍照区域 */}
          {!foodScanImage ? (
            <div
              className="relative bg-gray-50 border-2 border-dashed border-gray-200 rounded-2xl flex flex-col items-center justify-center"
              style={{ minHeight: '220px' }}
            >
              <div className="text-5xl mb-3">🍽️</div>
              <div className="text-gray-500 text-sm mb-4">点击下方按鈕开始扫描</div>
              <div className="flex gap-3">
                <button
                  className="flex items-center gap-2 bg-red-500 text-white px-5 py-2.5 rounded-xl text-sm font-semibold shadow-md"
                  onClick={() => foodCameraInputRef.current?.click()}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  拍照
                </button>
                <button
                  className="flex items-center gap-2 bg-white border border-gray-200 text-gray-600 px-5 py-2.5 rounded-xl text-sm font-semibold shadow-sm"
                  onClick={() => foodFileInputRef.current?.click()}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  上传图片
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {/* 已选图片预览 */}
              <div className="relative rounded-2xl overflow-hidden">
                <img src={foodScanImage} alt="食物图片" className="w-full max-h-56 object-cover" />
                {foodScanLoading && (
                  <div className="absolute inset-0 bg-black bg-opacity-50 flex flex-col items-center justify-center">
                    <div className="w-10 h-10 border-4 border-white border-t-transparent rounded-full animate-spin mb-2"></div>
                    <div className="text-white text-sm font-medium">AI 正在分析食物...</div>
                    <div className="text-white text-xs mt-1 opacity-70">调用 DeepSeek 智能识别</div>
                  </div>
                )}
              </div>

              {/* 重新扫描按鈕 */}
              <div className="flex gap-2">
                <button
                  className="flex-1 flex items-center justify-center gap-2 bg-red-500 text-white py-2.5 rounded-xl text-sm font-semibold"
                  onClick={() => foodCameraInputRef.current?.click()}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  重新拍照
                </button>
                <button
                  className="flex-1 flex items-center justify-center gap-2 bg-white border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm"
                  onClick={() => { setFoodScanImage(null); setFoodScanResult(null); setFoodScanError(null); }}
                >
                  清除
                </button>
              </div>

              {/* 错误提示 */}
              {foodScanError && (
                <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-red-600 text-sm text-center">
                  {foodScanError}
                </div>
              )}

              {/* AI 分析结果 */}
              {foodScanResult && !foodScanLoading && (
                <div className="space-y-3">
                  {/* 总热量卡片 */}
                  <div className="bg-gradient-to-r from-orange-500 to-red-500 rounded-2xl p-4 text-center text-white">
                    <div className="text-xs opacity-80 mb-1">AI 估算总热量</div>
                    <div className="text-4xl font-bold">{foodScanResult.totalCalories}</div>
                    <div className="text-sm opacity-90 mt-0.5">千卡 (kcal)</div>
                    {foodScanResult.confidence === 'low' && (
                      <div className="text-xs opacity-70 mt-1">(参考估算，实际热量因食材而异)</div>
                    )}
                  </div>

                  {/* 食物明细列表 */}
                  <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
                    <div className="px-4 py-3 border-b border-gray-50">
                      <div className="text-sm font-bold text-gray-700">AI 识别食物明细</div>
                    </div>
                    {foodScanResult.foods.map((food: any, idx: number) => (
                      <div key={idx} className="px-4 py-3 flex items-start justify-between border-b border-gray-50 last:border-0">
                        <div className="flex-1 pr-3">
                          <div className="text-sm font-semibold text-gray-800">{food.name}</div>
                          <div className="text-xs text-gray-400 mt-0.5">{food.quantity}</div>
                          {food.description && (
                            <div className="text-xs text-gray-400 mt-0.5">{food.description}</div>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="text-base font-bold text-orange-500">{food.calories}</div>
                          <div className="text-xs text-gray-400">千卡</div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* 健康建议 */}
                  {foodScanResult.healthTip && (
                    <div className="bg-green-50 rounded-xl px-4 py-3 flex items-start gap-2">
                      <span className="text-green-500 text-base mt-0.5">&#x1F4AA;</span>
                      <div className="text-xs text-green-700 leading-relaxed">{foodScanResult.healthTip}</div>
                    </div>
                  )}

                  {/* AI 标识 */}
                  <div className="text-center">
                    <span className="text-xs text-gray-300">Powered by DeepSeek AI</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {/* AI 账本：商品列表页（未选中商品时显示） */}
      {isCustomAI && !aiSelectedProduct && aiProducts && (
        <div className="pb-20 pt-2" style={{ backgroundColor: '#FFF0F5' }}>
          {/* 系列标题 */}
          <div className="px-4 pt-3 pb-2">
            <div className="text-xs px-2 py-0.5 rounded-full inline-block mb-2" style={{ background: '#E8F5E9', color: '#2E7D32' }}>AI精选 -- 品质生活系列</div>
            <h2 className="text-lg font-bold text-gray-900">精选商品</h2>
            <p className="text-xs text-gray-500 mt-0.5">从美食到科技，品质保证，限时特惠中</p>
          </div>
          {/* 商品卡片列表 */}
          <div className="px-4 space-y-3">
            {Object.values(aiProducts).map((product: any) => (
              <div
                key={product.id}
                className="rounded-2xl overflow-hidden cursor-pointer"
                style={{ background: '#fff', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}
                onClick={() => { setAiSelectedProduct(product.id); setAiCarouselIdx(0); setAiProductQty(1); }}
              >
                <div className="relative">
                  <img src={product.cover} alt={product.name} className="w-full" style={{ display: 'block', height: '200px', objectFit: 'cover' }} />
                  <div className="absolute top-2 left-2 text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(233,30,99,0.9)', color: '#fff' }}>限时特惠</div>
                </div>
                <div className="p-3">
                  <div className="text-xs px-2 py-0.5 rounded-full inline-block mb-1" style={{ background: '#E8F5E9', color: '#2E7D32' }}>{product.tag}</div>
                  <h3 className="text-base font-bold text-gray-900 leading-tight">{product.name}</h3>
                  <p className="text-xs text-gray-500 mt-1">{product.subtitle}</p>
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className="text-xl font-bold" style={{ color: '#E91E63' }}>¥{Number(product.basePrice).toFixed(2)}</span>
                    <span className="text-xs text-gray-400 line-through">¥{Number(product.originalPrice).toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center gap-3 text-xs text-gray-400">
                      <span className="flex items-center gap-0.5"><Truck className="w-3 h-3" />包邮</span>
                      <span className="flex items-center gap-0.5"><ShieldCheck className="w-3 h-3" />正品</span>
                    </div>
                    <span className="text-xs px-3 py-1 rounded-full font-medium" style={{ background: 'linear-gradient(90deg, #FF6B9D 0%, #E91E63 100%)', color: '#fff' }}>查看详情</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* AI 账本：商品详情页（选中商品后显示） */}
      {isCustomAI && aiProduct && (
        <div className="pb-24" style={{ backgroundColor: '#FFF0F5' }}>
          {/* 返回列表按钮 */}
          <div className="px-4 pt-2 pb-1">
            <button
              onClick={() => { setAiSelectedProduct(null); setAiCarouselIdx(0); setAiProductQty(1); }}
              className="flex items-center gap-1 text-sm py-1"
              style={{ color: '#E91E63' }}
            >
              <ChevronLeft className="w-4 h-4" />
              <span>返回商品列表</span>
            </button>
          </div>
          {/* 1. 轮播图 */}
          <div className="relative w-full overflow-hidden" style={{ background: '#FFF0F5' }}>
            <div
              ref={aiCarouselRef}
              className="flex transition-transform duration-300 ease-in-out"
              style={{ transform: `translateX(-${aiCarouselIdx * 100}%)` }}
            >
              {aiCarouselImages.map((src, i) => (
                <div key={i} className="flex-shrink-0 w-full">
                  <img src={src} alt={`主图${i + 1}`} className="w-full" style={{ display: 'block' }} />
                </div>
              ))}
            </div>
            <div className="absolute bottom-3 right-3 px-2 py-0.5 rounded-full text-xs text-white" style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}>
              {aiCarouselIdx + 1}/{aiCarouselImages.length}
            </div>
            {aiCarouselIdx > 0 && (
              <button onClick={() => setAiCarouselIdx(aiCarouselIdx - 1)} className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.3)' }}>
                <ChevronLeft className="w-5 h-5 text-white" />
              </button>
            )}
            {aiCarouselIdx < aiCarouselImages.length - 1 && (
              <button onClick={() => setAiCarouselIdx(aiCarouselIdx + 1)} className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.3)' }}>
                <ChevronRight className="w-5 h-5 text-white" />
              </button>
            )}
          </div>

          {/* 2. 商品名称 + 卖点副标题 */}
          <div className="px-4 pt-4 pb-2" style={{ background: '#fff' }}>
            <div className="text-xs px-2 py-0.5 rounded-full inline-block mb-1" style={{ background: '#E8F5E9', color: '#2E7D32' }}>{aiProduct.tag}</div>
            <h1 className="text-xl font-bold text-gray-900 leading-tight">{aiProduct.name}</h1>
            <p className="text-sm text-gray-500 mt-1">{aiProduct.subtitle}</p>
          </div>

          {/* 3. 价格区域 */}
          <div className="px-4 py-3" style={{ background: 'linear-gradient(135deg, #FFF0F5 0%, #F3E5F5 100%)' }}>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold" style={{ color: '#E91E63' }}>¥{Number(aiProduct.basePrice).toFixed(2)}</span>
              <span className="text-sm text-gray-400 line-through">¥{Number(aiProduct.originalPrice).toFixed(2)}</span>
              <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: '#E91E63', color: '#fff' }}>限时特惠</span>
            </div>
            <p className="text-xs text-gray-400 mt-1">SKU: {aiProduct.id === 'icecream' ? 'RC-DailyChiko-001' : aiProduct.id === 'chocolate' ? 'RC-Royce-001' : 'WC-AirCharge-001'}</p>
          </div>

          {/* 4. 数量选择器 */}
          <div className="px-4 py-3 flex items-center justify-between" style={{ background: '#fff', borderBottom: '1px solid #f3f3f3' }}>
            <span className="text-sm text-gray-600">购买数量</span>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setAiProductQty(Math.max(1, aiProductQty - 1))}
                className="w-8 h-8 rounded-full flex items-center justify-center border border-gray-200"
                disabled={aiProductQty <= 1}
              >
                <Minus className="w-4 h-4 text-gray-500" />
              </button>
              <span className="text-base font-semibold w-8 text-center">{aiProductQty}</span>
              <button
                onClick={() => setAiProductQty(aiProductQty + 1)}
                className="w-8 h-8 rounded-full flex items-center justify-center border border-gray-200"
              >
                <Plus className="w-4 h-4 text-gray-500" />
              </button>
            </div>
          </div>

          {/* 5. 服务保障横条 */}
          <div className="px-4 py-3 flex items-center justify-around" style={{ background: '#fff', borderBottom: '1px solid #f3f3f3' }}>
            {[
              { icon: <Truck className="w-4 h-4" style={{ color: '#E91E63' }} />, label: '包邮到家' },
              { icon: <RefreshCw className="w-4 h-4" style={{ color: '#E91E63' }} />, label: '7天退换' },
              { icon: <ShieldCheck className="w-4 h-4" style={{ color: '#E91E63' }} />, label: '正品保证' },
            ].map(({ icon, label }) => (
              <div key={label} className="flex items-center gap-1">
                {icon}
                <span className="text-xs text-gray-600">{label}</span>
              </div>
            ))}
          </div>

          {/* 6. 详情长图区 */}
          <div style={{ margin: 0, padding: 0 }}>
            {aiProductImages.map((src: string, i: number) => (
              <img
                key={i}
                src={src}
                alt={`详情海报${i + 1}`}
                style={{ width: '100%', display: 'block', margin: 0, padding: 0 }}
              />
            ))}
          </div>

          {/* 7. 底部购买按钮（吸底固定） */}
          <div className="fixed bottom-0 left-0 right-0 px-4 py-3 z-50 flex gap-3" style={{ background: '#fff', boxShadow: '0 -2px 12px rgba(0,0,0,0.08)' }}>
            <button
              onClick={() => {
                const amount = (Number(aiProduct.basePrice) * aiProductQty).toFixed(2);
                const subject = aiProduct.name;
                window.location.href = `https://jiangyuchen.cn/api/alipay/quick-pay?amount=${amount}&subject=${encodeURIComponent(subject)}`;
              }}
              className="flex-1 py-3.5 rounded-full text-white font-bold text-base"
              style={{ background: 'linear-gradient(90deg, #FF6B9D 0%, #E91E63 100%)' }}
            >
              立即购买 ¥{(Number(aiProduct.basePrice) * aiProductQty).toFixed(2)}
            </button>
          </div>
        </div>
      )}
      {/* AI 账本：股权卡片展示 */}
      {isCustomAI && !aiProducts && (
        <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '16px 16px 80px 16px', minHeight: 0 }}>
          {(!myShares || myShares.length === 0) ? (
            <div className="text-center text-gray-300 text-sm mt-16">
              <div className="text-gray-200 text-5xl mb-3 font-light">--</div>
              <div>暂无股权记录</div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* 资源股卡片（最新在上）爱马仕橙棕配色 */}
              {myShares.some((s: any) => s.shareType === '资源股') && (
                <div style={{ background: '#FFF8F0', border: '1px solid rgba(58,20,0,0.25)', borderRadius: '14px', padding: '12px 14px', boxShadow: '0 2px 12px rgba(58,20,0,0.12)' }}>
                  <AngelShareCard
                    shares={[...myShares.filter((s: any) => s.shareType === '资源股')].sort((a: any, b: any) => new Date(b.grantDate).getTime() - new Date(a.grantDate).getTime())}
                    isMarket={true}
                    totalWithDividend={totalMarketSharesWithDividend}
                  />
                </div>
              )}
              {/* 资金股卡片（最新在上）爱马仕金色配色 */}
              {myShares.some((s: any) => s.shareType === '资金股') && (
                <div style={{ background: '#FFF8F0', border: '1px solid rgba(58,20,0,0.25)', borderRadius: '14px', padding: '12px 14px', boxShadow: '0 2px 12px rgba(58,20,0,0.12)' }}>
                  <AngelShareCard
                    shares={[...myShares.filter((s: any) => s.shareType === '资金股')].sort((a: any, b: any) => new Date(b.grantDate).getTime() - new Date(a.grantDate).getTime())}
                    isMarket={false}
                    totalWithDividend={totalSharesWithDividend}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 记账记录列表 —— 非 custom_ae / custom_af / custom_ah / custom_ai 账本显示；AJ账本切换到资方视角时也隐藏 */}
      {!isCustomAE && !isCustomAF && !isCustomAH && !isCustomAI && !(isCustomAJ && (((isAdmin || isOwner) && ajViewMode === 'owner') || isFunder) && !viewAsUserId) && <div className={`flex-1 pb-20 space-y-3`}>
        {/* 搜索结果汇总卡片：仅在有搜索条件时显示 */}
        {(() => {
          const isSearchActive = !!(urlParams.has('startDate') || urlParams.has('endDate') || urlParams.has('note') || urlParams.has('type') || urlParams.has('amountMin') || urlParams.has('amountMax') || urlParams.has('categoryIds') || urlParams.has('memberIds') || urlParams.has('allTime'));
          if (!isSearchActive || !transactionsData) return null;
          
          // 汇总所有记录，同时按记账人分组
          let totalIncome = 0, totalExpense = 0, totalCount = 0;
          const allDates: string[] = [];
          // 记账人统计： id -> { name, dates: Set<string>, count }
          const memberStats = new Map<number, { name: string; dates: Set<string>; count: number }>();
          transactionsData.forEach((day: any) => {
            allDates.push(day.date);
            totalIncome += day.income || 0;
            totalExpense += day.expense || 0;
            (day.records || []).forEach((r: any) => {
              totalCount++;
              if (r.member?.id) {
                const mid = r.member.id;
                if (!memberStats.has(mid)) {
                  memberStats.set(mid, {
                    name: r.member.nickname || r.member.username || String(mid),
                    dates: new Set(),
                    count: 0,
                  });
                }
                const ms = memberStats.get(mid)!;
                ms.dates.add(day.date);
                ms.count++;
              }
            });
          });
          const balance = totalIncome - totalExpense;
          const sortedDates = [...allDates].sort();
          const earliestDate = sortedDates.length > 0 ? sortedDates[0] : '';
          const latestDate = sortedDates.length > 0 ? sortedDates[sortedDates.length - 1] : '';
          
          // 计算天数
          const calcDays = (d1: string, d2: string) => {
            if (!d1 || !d2) return 0;
            const diff = new Date(d2).getTime() - new Date(d1).getTime();
            return Math.round(diff / 86400000) + 1;
          };
          const totalDays = calcDays(earliestDate, latestDate);
          
          // 搜索条件文字
          const condParts: string[] = [];
          if (urlParams.get('note')) condParts.push(`备注「${urlParams.get('note')}」`);
          if (urlParams.get('type') === 'income') condParts.push('类型: 收入');
          if (urlParams.get('type') === 'expense') condParts.push('类型: 支出');
          if (urlParams.get('amountMin') || urlParams.get('amountMax')) {
            const min = urlParams.get('amountMin') || '';
            const max = urlParams.get('amountMax') || '';
            condParts.push(`金额: ${min || '0'} – ${max || '不限'}`);
          }
          const allTimeFlag = urlParams.get('allTime') === '1';
          
          // 整体时间范围文字
          const overallTimeText = allTimeFlag
            ? '全部时段'
            : (earliestDate && latestDate
                ? (earliestDate === latestDate
                    ? earliestDate
                    : `${earliestDate} – ${latestDate}（${totalDays}天）`)
                : '无日期');
          
          return (
            <div className="bg-white rounded-lg p-3 shadow-sm border border-blue-100 mb-1">
              {/* 标题行 */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5 text-[#1976D2]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                  <span className="text-xs font-medium text-[#1976D2]">搜索结果</span>
                  {condParts.length > 0 && <span className="text-xs text-gray-500">· {condParts.join(' / ')}</span>}
                </div>
                <span className="text-xs text-gray-400">共 {totalCount} 笔</span>
              </div>

              {/* 时间跨度区块 */}
              <div className="mb-2">
                <div className="text-[10px] text-gray-400 mb-0.5 font-medium">时间跨度</div>
                <div className="text-xs text-gray-700">{overallTimeText}</div>
              </div>

              {/* 收支合计 */}
              <div className="grid grid-cols-3 gap-2 mb-2">
                <div className="text-center">
                  <div className="text-[10px] text-gray-400 mb-0.5">收入</div>
                  <div className="text-sm font-semibold text-green-600">{totalIncome.toFixed(2)}</div>
                </div>
                <div className="text-center">
                  <div className="text-[10px] text-gray-400 mb-0.5">支出</div>
                  <div className="text-sm font-semibold text-red-600">{totalExpense.toFixed(2)}</div>
                </div>
                <div className="text-center">
                  <div className="text-[10px] text-gray-400 mb-0.5">结余</div>
                  <div className={`text-sm font-semibold ${balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>{balance.toFixed(2)}</div>
                </div>
              </div>

              {/* 记账人分列明细 */}
              {memberStats.size > 0 && (
                <div>
                  <div className="text-[10px] text-gray-400 mb-1 font-medium">记账人详情</div>
                  <div className="space-y-1">
                    {Array.from(memberStats.entries()).map(([mid, ms]) => {
                      const mDates = [...ms.dates].sort();
                      const mEarliest = mDates[0];
                      const mLatest = mDates[mDates.length - 1];
                      const mDays = calcDays(mEarliest, mLatest);
                      const mTimeText = mEarliest === mLatest
                        ? mEarliest
                        : `${mEarliest} – ${mLatest}（${mDays}天）`;
                      return (
                        <div key={mid} className="flex items-start justify-between text-xs bg-gray-50 rounded px-2 py-1">
                          <span className="text-gray-700 font-medium flex-shrink-0 mr-2">{ms.name}</span>
                          <span className="text-gray-500 text-right">{mTimeText} · {ms.count}笔</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })()}
        
        {!hasRecords ? (
          <div className="text-center py-12">
            <div className="text-gray-400 text-base mb-1">{ledgerData?.type === 'diet' ? '还没有减肥记录' : '还没有记账记录'}</div>
            <div className="text-gray-400 text-sm">{ledgerData?.type === 'diet' ? '点击下方按鈕，添加减肥记录' : '点击下方“+”按鈕开始记账'}</div>
          </div>
        ) : (
          transactionsData.map((dayRecord: any) => {
            // 计算星期
            const date = new Date(dayRecord.date);
            const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
            const dayOfWeek = weekDays[date.getDay()];
            
            return (
              <div key={dayRecord.date}>
                {/* 日期标题 */}
                <div className="flex items-center justify-between text-xs text-gray-500 pl-2" style={{ marginTop: '3px', marginBottom: '3px' }}>
                  <span>
                    {dayRecord.date} {dayOfWeek}
                  </span>
                  {!isDiet && !isCustomAJ && (
                    <span className="text-xs pr-2">
                      收:{dayRecord.income.toFixed(2)}, 支:{dayRecord.expense.toFixed(2)}, 余:{dayRecord.balance.toFixed(2)}
                    </span>
                  )}
                </div>

                {/* 当天的记录 */}
                <div className="space-y-2">
                  {dayRecord.records.map((record: any) => (
                    isCustomAJ ? (
                      /* ===== AJ账本：方案B 纸质单据+锯齿撕边 卡片 ===== */
                      <div
                        key={record.id}
                        style={{ filter: 'drop-shadow(0 2px 8px rgba(168,0,0,0.15))' }}
                        className="mb-3"
                      >
                        <div style={{
                          background: '#FDFCF7',
                          borderRadius: '8px',
                          overflow: 'hidden',
                          border: '1px solid rgba(26,43,74,0.15)'
                        }}>
                          {/* 顶部红色标题栏 */}
                          <div style={{
                            background: '#1A2B4A',
                            padding: '8px 12px 16px 12px',
                            position: 'relative',
                            clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 8px), 97% 100%, 94% calc(100% - 6px), 91% 100%, 88% calc(100% - 6px), 85% 100%, 82% calc(100% - 6px), 79% 100%, 76% calc(100% - 6px), 73% 100%, 70% calc(100% - 6px), 67% 100%, 64% calc(100% - 6px), 61% 100%, 58% calc(100% - 6px), 55% 100%, 52% calc(100% - 6px), 49% 100%, 46% calc(100% - 6px), 43% 100%, 40% calc(100% - 6px), 37% 100%, 34% calc(100% - 6px), 31% 100%, 28% calc(100% - 6px), 25% 100%, 22% calc(100% - 6px), 19% 100%, 16% calc(100% - 6px), 13% 100%, 10% calc(100% - 6px), 7% 100%, 4% calc(100% - 6px), 1% 100%, 0 calc(100% - 8px))'
                          }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ color: '#FFFFFF', fontSize: '13px', fontWeight: 700, letterSpacing: '4px' }}>报 销 申 请 单</span>
                              <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '10px', fontFamily: 'monospace' }}>
                                No.{new Date(record.createdAt).toISOString().slice(0,10).replace(/-/g,'')}-{String(record.id).padStart(3,'0')}
                              </span>
                            </div>
                          </div>

                          {/* 主体内容区 */}
                          <div style={{ padding: '10px 12px 12px 12px' }}>
                            {/* 企业名称 + 金额 */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: '11px', color: '#999', marginBottom: '2px' }}>开票单位</div>
                                <div style={{ fontSize: '14px', fontWeight: 600, color: '#333', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {record.ajCompanyName || '—'}
                                </div>
                              </div>
                              <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '12px' }}>
                                <div style={{ fontSize: '11px', color: '#999', marginBottom: '2px' }}>报销金额</div>
                                <div style={{ fontSize: '20px', fontWeight: 700, color: '#1A2B4A', lineHeight: 1 }}>
                                  ¥{record.amount.toFixed(2)}
                                </div>
                              </div>
                            </div>

                            {/* 虚线分隔 */}
                            <div style={{ borderTop: '1px dashed rgba(26,43,74,0.15)', margin: '8px 0' }} />

                            {/* 六格信息网格：第一行（申请日期、报销凭证、员工编号），第二行（报销事由、报销类目、会计科目） */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px 8px', marginBottom: '8px' }}>
                              {/* 第一行：申请日期 */}
                              <div>
                                <div style={{ fontSize: '10px', color: '#aaa' }}>申请日期</div>
                                <div style={{ fontSize: '12px', color: '#444', fontWeight: 500 }}>
                                  {(() => { const d = new Date(record.createdAt); return `${d.getFullYear()}年${String(d.getMonth()+1).padStart(2,'0')}月${String(d.getDate()).padStart(2,'0')}日`; })()}
                                </div>
                              </div>
                              {/* 第一行：报销凭证 */}
                              <div>
                                <div style={{ fontSize: '10px', color: '#aaa' }}>报销凭证</div>
                                {(() => {
                                  const imgs: string[] = Array.isArray(record.images) && record.images.length > 0
                                    ? record.images
                                    : record.imageUrl ? [record.imageUrl] : [];
                                  return imgs.length > 0 ? (
                                    <div style={{ display: 'flex', gap: '3px', marginTop: '2px', flexWrap: 'wrap' }}>
                                      {imgs.slice(0, 4).map((url: string, i: number) => (
                                        <div
                                          key={i}
                                          onClick={e => { e.stopPropagation(); setPreviewImageUrl(url); }}
                                          style={{
                                            width: '20px', height: '20px', borderRadius: '3px',
                                            overflow: 'hidden', flexShrink: 0,
                                            border: '1px solid rgba(26,43,74,0.2)',
                                            display: 'block', position: 'relative', cursor: 'pointer'
                                          }}
                                        >
                                          <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                                          {i === 3 && imgs.length > 4 && (
                                            <div style={{
                                              position: 'absolute', inset: 0,
                                              background: 'rgba(0,0,0,0.55)',
                                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                                              color: '#fff', fontSize: '8px', fontWeight: 700
                                            }}>+{imgs.length - 3}</div>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <div style={{ fontSize: '12px', color: '#ccc', marginTop: '2px' }}>无</div>
                                  );
                                })()}
                              </div>
                              {/* 第一行：员工编号 */}
                              <div>
                                <div style={{ fontSize: '10px', color: '#aaa' }}>员工编号</div>
                                <div style={{ fontSize: '12px', fontWeight: 500, color: '#444', fontFamily: 'monospace' }}>
                                  {(record as any).ajEmployeeNo || '—'}
                                </div>
                              </div>
                              {/* 第二行：报销事由 */}
                              <div>
                                <div style={{ fontSize: '10px', color: '#aaa' }}>报销事由</div>
                                <div style={{ fontSize: '12px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#444' }}>
                                  {(record as any).ajExpenseReason || '待AI主管确认'}
                                </div>
                              </div>
                              {/* 第二行：报销类目 */}
                              <div>
                                <div style={{ fontSize: '10px', color: '#aaa' }}>报销类目</div>
                                <div style={{ fontSize: '12px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#444' }}>
                                  {(record as any).ajTaxCategory || '待AI财务确认'}
                                </div>
                              </div>
                              {/* 第二行：会计科目 */}
                              <div>
                                <div style={{ fontSize: '10px', color: '#aaa' }}>会计科目</div>
                                <div style={{ fontSize: '12px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#444' }}>
                                  {(record as any).ajAccountingCode || '待AI会计确认'}
                                </div>
                              </div>
                            </div>

                            {/* 虚线分隔 */}
                            <div style={{ borderTop: '1px dashed rgba(26,43,74,0.15)', margin: '8px 0' }} />

                            {/* 底部：申请人 + 状态印章 */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                {/* 企业主视角：隐藏开票人头像，只显示用户名 */}
                                {!isAdmin && (
                                  <UserAvatar
                                    username={record.member?.username}
                                    avatar={record.member?.avatar}
                                    nickname={record.member?.nickname}
                                    size="sm"
                                  />
                                )}
                                <div>
                                  <div style={{ fontSize: '12px', color: '#555', fontWeight: 500 }}>
                                    {record.member?.nickname || record.member?.username || '未知'}
                                  </div>
                                  <div style={{ fontSize: '10px', color: '#aaa' }}>
                                    {new Date(record.createdAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                  </div>
                                </div>
                              </div>
                              {/* 状态文字标签 + 撤销按钮 */}
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                                {record.ajStatus && (
                                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                    <span style={{
                                      width: '6px',
                                      height: '6px',
                                      borderRadius: '50%',
                                      flexShrink: 0,
                                      display: 'inline-block',
                                      backgroundColor:
                                        record.ajStatus === 'pending' ? '#F59E0B' :
                                        record.ajStatus === 'approved' ? '#4CAF50' : '#BDBDBD'
                                    }} />
                                    <span style={{
                                      fontSize: '12px',
                                      fontWeight: 500,
                                      color:
                                        record.ajStatus === 'pending' ? '#B45309' :
                                        record.ajStatus === 'approved' ? '#2E7D32' : '#757575'
                                    }}>
                                      {record.ajStatus === 'pending' ? '申请中' :
                                       record.ajStatus === 'approved' ? '已通过' : '已拒绝'}
                                    </span>
                                  </div>
                                )}
                                {record.ajStatus === 'pending' && record.member?.id === user?.id && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const confirmed = window.confirm('确认撤销此申请单？\n\n撤销后将无法找回，管理员和您的记录中均不会保留此申请。');
                                      if (!confirmed) return;
                                      withdrawReimbursementMutation.mutate({ ledgerId: Number(ledgerId), recordId: record.id });
                                    }}
                                    disabled={withdrawReimbursementMutation.isPending}
                                    style={{
                                      fontSize: '11px',
                                      color: withdrawReimbursementMutation.isPending ? '#aaa' : '#DC2626',
                                      background: 'none',
                                      border: '1px solid currentColor',
                                      borderRadius: '4px',
                                      padding: '1px 6px',
                                      cursor: withdrawReimbursementMutation.isPending ? 'not-allowed' : 'pointer',
                                      lineHeight: '1.5',
                                    }}
                                  >
                                    {withdrawReimbursementMutation.isPending ? '撤销中...' : '撤销'}
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* ===== 普通账本：原有行内样式 ===== */
                      <div
                        key={record.id}
                        className="bg-white rounded-lg p-2 flex items-center gap-2.5 cursor-pointer hover:bg-[#EEF2F8] transition-colors"
                        onClick={() => setLocation(`/ledger/${ledgerId}/transaction/${record.id}`)}
                      >
                        {/* 成员头像 */}
                        <div className="flex-shrink-0">
                          <UserAvatar
                            username={record.member?.username}
                            avatar={record.member?.avatar}
                            nickname={record.member?.nickname}
                            size="sm"
                          />
                        </div>

                        {/* 分类信息 */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1">
                            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${record.type === 'expense' ? 'bg-[#D32F2F]-light0' : 'bg-[#4CAF50]'}`}></span>
                            <span className="text-xs text-[#222222] font-normal">
                              {isDiet && record.description?.startsWith('[diet:') ? (() => {
                                // 对 diet 分类名做前端清洗：去掉 emoji，并根据 description 标签补充单位
                                const desc = record.description || '';
                                const m = desc.match(/^\[diet:(\w+):([^\]]+)/);
                                const type = m ? m[1] : '';
                                const unit = m ? m[2].split(':')[0] : '';
                                // 去掉分类名中的 emoji（Unicode 范围）
                                const cleanName = (record.category || '').replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\s]+/gu, '').trim();
                                // 如果分类名已包含单位则直接显示，否则补充
                                if (cleanName.includes('/')) return cleanName;
                                // 根据类型补充单位
                                const unitMap: Record<string, string> = { weight: '斤', bmi: '', calorie: 'kcal', measurement: 'cm' };
                                const u = unit || unitMap[type] || '';
                                return u ? `${cleanName}/${u}` : cleanName;
                              })() : record.category}
                            </span>
                            {/* 图片图标 */}
                            {record.imageUrl && (
                              <svg className="w-3.5 h-3.5 ml-0.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="#1976D2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                                <circle cx="8.5" cy="8.5" r="1.5"/>
                                <polyline points="21 15 16 10 5 21"/>
                              </svg>
                            )}
                            {/* 待审批图标 */}
                            {record.approvalStatus === 'pending' && (
                              <span className="ml-1 text-[#1A2B4A] text-xs flex items-center gap-0.5">
                                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                                  <circle cx="12" cy="12" r="10" opacity="0.2" />
                                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" opacity="0.3" />
                                  <text x="12" y="16" textAnchor="middle" fontSize="10" fill="currentColor" fontWeight="bold">审</text>
                                </svg>
                              </span>
                            )}
                            {/* 报销状态图标 */}
                            {record.reimbursementStatus === 'pending' && (
                              <Receipt className="w-3.5 h-3.5 ml-0.5 text-[#1976D2] flex-shrink-0" />
                            )}
                            {/* 待结状态图标 */}
                            {record.pendingType && (
                              <Hourglass className="w-3.5 h-3.5 ml-0.5 text-[#1976D2] flex-shrink-0" title={record.pendingType === 'receivable' ? '代收' : '代付'} />
                            )}
                          </div>
                          {record.description && !record.description.startsWith('[diet:') && (
                            <div className="text-xs text-gray-500 mt-0.5 ml-2.5 font-light">{record.description}</div>
                          )}
                        </div>

                        {/* 金额 / 减肥数据 */}
                        {isDiet && record.description?.startsWith('[diet:') ? (
                          (() => {
                            // 分类名已包含单位（如"体重/斤"、"BMI"、"胸围/cm"），右侧只显示纯数字
                            const val = record.amount;
                            return (
                              <div className="text-sm font-semibold flex-shrink-0 text-[#1A2B4A]">
                                {val % 1 === 0 ? val.toFixed(0) : val.toFixed(1)}
                              </div>
                            );
                          })()
                        ) : (
                          <div className={`text-sm font-normal flex-shrink-0 ${
                            record.pendingType && record.pendingIncludeStats === 0
                              ? 'text-gray-400'
                              : record.type === 'expense' ? 'text-[#D32F2F]' : 'text-[#4CAF50]'
                          }`}>
                            {record.type === 'expense' ? '-' : '+'}{Math.abs(record.amount).toFixed(2)}
                          </div>
                        )}
                      </div>
                    )
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>}

      {/* 底部添加按鈕：AJ账本专用（劳方添加发票，资方仅 owner/创始人可添加企业） */}
      {isCustomAJ && !(((isAdmin || isOwner) && ajViewMode === 'owner' || isFunder) && !viewAsUserId) && (
        <button
          onClick={() => {
            if ((isAdmin || isOwner) && !viewAsUserId && ajViewMode === 'owner') {
              // 资方视角：添加企业申请（触发AJOwnerPanel内的添加企业弹窗）
              // 通过自定义事件通知AJOwnerPanel打开添加弹窗
              window.dispatchEvent(new CustomEvent('aj-owner-add-company'));
            } else {
              // 劳方视角：添加报销申请单
              if (!ajHasAccessibleCompanies) {
                alert('当前暂未开放，请稍后再试');
                return;
              }
              if (viewAsUserId) {
                sessionStorage.setItem('aj_view_as_user_id', String(viewAsUserId));
              } else {
                sessionStorage.removeItem('aj_view_as_user_id');
              }
              setLocation(`/ledger/${ledgerId}/add${viewAsUserId ? `?viewAs=${viewAsUserId}` : ''}`);
            }
          }}
          className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 h-14 w-14 rounded-full shadow-lg hover:shadow-xl transition-all inline-flex items-center justify-center"
          style={{ backgroundColor: '#C9A84C', color: '#1A2B4A' }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
        </button>
      )}
      {/* 底部添加按鈕：非定制账本显示 */}
      {!isCustomAE && !isDiet && !isCustomAF && !isCustomAH && !isCustomAI && !isCustomAJ && (
        <button
          onClick={() => setLocation(`/ledger/${ledgerId}/add`)}
          className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 h-14 w-14 rounded-full shadow-lg hover:shadow-xl transition-all inline-flex items-center justify-center"
          style={{ backgroundColor: '#D32F2F', color: '#FFFFFF' }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
        </button>
      )}
      {/* 减肥账本打卡按钮 */}
      {isDiet && (
        <button
          onClick={() => setLocation(`/ledger/${ledgerId}/diet-checkin`)}
          className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 h-14 w-14 rounded-full shadow-lg hover:shadow-xl transition-all inline-flex items-center justify-center"
          style={{ backgroundColor: '#D32F2F', color: '#FFFFFF' }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
        </button>
      )}

      {/* 成员列表弹窗 */}
      {membersData && (
        <MembersDialog
          open={showMembersDialog}
          onOpenChange={setShowMembersDialog}
          members={membersData}
        />
      )}

      {/* AF 账本：资金费率日志弹窗 */}
      {showFundingRateLogs && (
        <div className="fixed inset-0 z-[100] flex flex-col" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }} onClick={() => setShowFundingRateLogs(false)}>
          <div className="mt-auto mx-0 rounded-t-3xl flex flex-col" style={{ backgroundColor: '#fff', height: '80vh', minHeight: 0 }} onClick={e => e.stopPropagation()}>
            {/* 弹窗标题栏 */}
            <div className="flex-shrink-0 flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <div className="text-base font-bold text-gray-900">自动赚费详情</div>
                {stopwatchElapsedMs > 0 && (
                  <div className="flex items-center gap-1 mt-0.5">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    <span className="text-xs text-gray-400 font-mono">{formatStopwatch(stopwatchElapsedMs)}</span>
                  </div>
                )}
              </div>
              <button onClick={() => setShowFundingRateLogs(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 text-lg font-bold">×</button>
            </div>
            {/* 预估区域 */}
            {(() => {
              const balance = afTotalAsset ? Number(afTotalAsset.total) : 0;
              const perDay = balance * 0.12 / 365;
              const perHour = balance * 0.12 / 8760;
              if (balance <= 0) return null;
              return (
                <div className="flex-shrink-0 px-5 py-3 bg-green-50 border-b border-green-100">
                  <div className="text-xs text-gray-500">当前余额 <span className="font-semibold text-gray-700">{balance.toFixed(2)} USDT</span>　参考年化 ≈ <span className="font-bold text-green-600">10~12%</span></div>
                </div>
              );
            })()}
            {/* 日志列表（无限滚动） */}
            <div
              className="overflow-y-auto"
              style={{ flex: '1 1 0', minHeight: 0 }}
              onScroll={(e) => {
                const el = e.currentTarget;
                if (el.scrollHeight - el.scrollTop - el.clientHeight < 80 && fundingRateHasMore && !fundingRateLoadingMore && !fundingRateLogsLoading) {
                  setFundingRateLoadingMore(true);
                  setFundingRateLogsPage(p => p + 1);
                }
              }}
            >
              {fundingRateLogsLoading && fundingRateAllLogs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                  <svg className="animate-spin mb-3 opacity-60" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" strokeOpacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round"/></svg>
                  <div className="text-sm">加载中...</div>
                </div>
              ) : fundingRateAllLogs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-3 opacity-40">
                    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                  </svg>
                  <div className="text-sm">暂无记录</div>
                  <div className="text-xs mt-1">开启自动赚费后每小时自动结算</div>
                </div>
              ) : (
                <div>
                  {fundingRateAllLogs.map((log: any, idx: number) => {
                    const bjTime = new Date(log.created_at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
                    return (
                    <div key={log.id ?? idx} className="flex items-center justify-between px-5 py-3 border-b border-gray-50">
                      <div className="text-xs text-gray-500">{bjTime}</div>
                      <div className="text-sm font-semibold text-green-600">+{parseFloat(log.amount).toFixed(6)} USDT</div>
                    </div>
                    );
                  })}
                  {fundingRateLoadingMore && (
                    <div className="flex justify-center py-4">
                      <svg className="animate-spin opacity-40" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" strokeOpacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round"/></svg>
                    </div>
                  )}
                  {!fundingRateHasMore && fundingRateAllLogs.length > 0 && (
                    <div className="text-center text-xs text-gray-300 py-4">已加载全部记录</div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* AF 账本：YJH邀请树弹窗 */}
      {showInviteTree && (
        <div className="fixed inset-0 z-[100] flex flex-col" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }} onClick={() => setShowInviteTree(false)}>
          <div className="mt-auto mx-0 rounded-t-3xl overflow-hidden flex flex-col" style={{ backgroundColor: '#fff', maxHeight: '80vh' }} onClick={e => e.stopPropagation()}>
            {/* 弹窗标题栏 */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <div className="text-base font-bold text-gray-900">邀请名单</div>
                <div className="text-xs text-gray-400 mt-0.5">共 {inviteTreeData?.users?.length ?? 0} 人</div>
              </div>
              <button onClick={() => setShowInviteTree(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 text-lg font-bold">×</button>
            </div>
             {/* 最新动态区 - 下拉抄屉式 */}
            {canSeeRecentDynamics && (
              <div className="border-b border-gray-100" style={{ backgroundColor: '#FFFBF0' }}>
                {/* 标题行：点击展开/收起 */}
                <div
                  className="flex items-center px-3 py-2 cursor-pointer select-none"
                  style={{ borderBottom: rechargeExpanded ? '1px solid rgba(184,134,11,0.15)' : 'none' }}
                  onClick={() => setRechargeExpanded(v => !v)}
                >
                  <span className="text-xs font-semibold flex-shrink-0" style={{ color: '#B8860B' }}>最新充值</span>
                  {/* 收起时显示最新一笔 */}
                  {!rechargeExpanded && recentRecharges.length > 0 && (
                    <div className="flex items-center gap-1 ml-2 flex-1 min-w-0" style={{ overflow: 'hidden' }}>
                      <span className="text-xs text-gray-600 whitespace-nowrap flex-shrink-0">{(recentRecharges[0].userName || '').slice(0,2)}</span>
                      <span className="text-xs font-semibold whitespace-nowrap flex-shrink-0" style={{ color: '#B8860B' }}>{parseFloat(recentRecharges[0].amount).toFixed(0)}{recentRecharges[0].currency}</span>
                      <span className="text-xs text-gray-400 ml-auto whitespace-nowrap flex-shrink-0">{recentRecharges[0].eventTime ? new Date(recentRecharges[0].eventTime).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}</span>
                    </div>
                  )}
                  {!rechargeExpanded && recentRecharges.length === 0 && (
                    <span className="text-xs text-gray-300 ml-3">暂无记录</span>
                  )}
                  <span className="ml-2 flex-shrink-0 text-gray-400 text-xs">{rechargeExpanded ? '▲' : '▼'}</span>
                </div>
                {/* 展开内容：最近10条 */}
                {rechargeExpanded && (
                  <div className="px-3 py-2" style={{ maxHeight: '260px', overflowY: 'auto' }}>
                    {recentRecharges.length === 0 ? (
                      <div className="text-xs text-gray-300 py-2 text-center">暂无记录</div>
                    ) : (
                      <div className="space-y-1">
                        {recentRecharges.map((r: any) => (
                          <div key={r.id} className="flex items-center gap-2 py-1.5" style={{ borderBottom: '1px solid rgba(184,134,11,0.08)' }}>
                            <span className="text-xs text-gray-600 truncate" style={{ minWidth: '4em', maxWidth: '6em' }}>{r.userName}({r.username})</span>
                            <span className="text-xs font-semibold" style={{ color: '#B8860B' }}>{parseFloat(r.amount).toFixed(0)}{r.currency}</span>
                            <span className="text-xs text-gray-400 ml-auto whitespace-nowrap">{r.eventTime ? new Date(r.eventTime).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            {/* 最新委托抽屉 */}
            {canSeeRecentDynamics && (
              <div className="border-b border-gray-100" style={{ backgroundColor: '#F0F4FF' }}>
                <div
                  className="flex items-center px-3 py-2 cursor-pointer select-none"
                  style={{ borderBottom: pendingExpanded ? '1px solid rgba(59,130,246,0.15)' : 'none' }}
                  onClick={() => setPendingExpanded(v => !v)}
                >
                  <span className="text-xs font-semibold flex-shrink-0" style={{ color: '#1D4ED8' }}>最新委托</span>
                  {!pendingExpanded && recentPendingOrders.length > 0 && (
                    <div className="flex items-center gap-1 ml-2 flex-1 min-w-0" style={{ overflow: 'hidden' }}>
                      <span className="text-xs text-gray-600 whitespace-nowrap flex-shrink-0">{(recentPendingOrders[0].userName || '').slice(0,2)}</span>
                      <span className="text-xs font-semibold whitespace-nowrap flex-shrink-0" style={{ color: '#1D4ED8' }}>{recentPendingOrders[0].coin} {recentPendingOrders[0].side === 'buy' ? '买' : '卖'} {recentPendingOrders[0].amount}U</span>
                      <span className="text-xs text-gray-400 ml-auto whitespace-nowrap flex-shrink-0">{recentPendingOrders[0].eventTime ? new Date(recentPendingOrders[0].eventTime).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}</span>
                    </div>
                  )}
                  {!pendingExpanded && recentPendingOrders.length === 0 && (
                    <span className="text-xs text-gray-300 ml-3">暂无记录</span>
                  )}
                  <span className="ml-2 flex-shrink-0 text-gray-400 text-xs">{pendingExpanded ? '▲' : '▼'}</span>
                </div>
                {pendingExpanded && (
                  <div className="px-3 py-2" style={{ maxHeight: '260px', overflowY: 'auto' }}>
                    {recentPendingOrders.length === 0 ? (
                      <div className="text-xs text-gray-300 py-2 text-center">暂无记录</div>
                    ) : (
                      <div className="space-y-1">
                        {recentPendingOrders.map((r: any) => (
                          <div key={r.id} className="flex items-center gap-2 py-1.5" style={{ borderBottom: '1px solid rgba(59,130,246,0.08)' }}>
                            <span className="text-xs text-gray-600 truncate" style={{ minWidth: '4em', maxWidth: '6em' }}>{r.userName}({r.username})</span>
                            <span className="text-xs font-semibold" style={{ color: '#1D4ED8' }}>{r.coin} {r.side === 'buy' ? '买' : '卖'} {r.amount}U</span>
                            {r.limitPrice && <span className="text-xs text-gray-400">@{r.limitPrice}</span>}
                            <span className="text-xs text-gray-400 ml-auto whitespace-nowrap">{r.eventTime ? new Date(r.eventTime).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            {/* 最新成交抽屉 */}
            {canSeeRecentDynamics && (
              <div className="border-b border-gray-100" style={{ backgroundColor: '#F0FFF4' }}>
                <div
                  className="flex items-center px-3 py-2 cursor-pointer select-none"
                  style={{ borderBottom: completedExpanded ? '1px solid rgba(22,163,74,0.15)' : 'none' }}
                  onClick={() => setCompletedExpanded(v => !v)}
                >
                  <span className="text-xs font-semibold flex-shrink-0" style={{ color: '#15803D' }}>最新成交</span>
                  {!completedExpanded && recentCompletedOrders.length > 0 && (
                    <div className="flex items-center gap-1 ml-2 flex-1 min-w-0" style={{ overflow: 'hidden' }}>
                      <span className="text-xs text-gray-600 whitespace-nowrap flex-shrink-0">{(recentCompletedOrders[0].userName || '').slice(0,2)}</span>
                      <span className="text-xs font-semibold whitespace-nowrap flex-shrink-0" style={{ color: '#15803D' }}>{recentCompletedOrders[0].coin} {recentCompletedOrders[0].side === 'buy' ? '买' : '卖'} {recentCompletedOrders[0].amount}U</span>
                      <span className="text-xs text-gray-400 ml-auto whitespace-nowrap flex-shrink-0">{recentCompletedOrders[0].eventTime ? new Date(recentCompletedOrders[0].eventTime).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}</span>
                    </div>
                  )}
                  {!completedExpanded && recentCompletedOrders.length === 0 && (
                    <span className="text-xs text-gray-300 ml-3">暂无记录</span>
                  )}
                  <span className="ml-2 flex-shrink-0 text-gray-400 text-xs">{completedExpanded ? '▲' : '▼'}</span>
                </div>
                {completedExpanded && (
                  <div className="px-3 py-2" style={{ maxHeight: '260px', overflowY: 'auto' }}>
                    {recentCompletedOrders.length === 0 ? (
                      <div className="text-xs text-gray-300 py-2 text-center">暂无记录</div>
                    ) : (
                      <div className="space-y-1">
                        {recentCompletedOrders.map((r: any) => (
                          <div key={r.id} className="flex items-center gap-2 py-1.5" style={{ borderBottom: '1px solid rgba(22,163,74,0.08)' }}>
                            <span className="text-xs text-gray-600 truncate" style={{ minWidth: '4em', maxWidth: '6em' }}>{r.userName}({r.username})</span>
                            <span className="text-xs font-semibold" style={{ color: '#15803D' }}>{r.coin} {r.side === 'buy' ? '买' : '卖'} {r.amount}U</span>
                            {r.limitPrice && <span className="text-xs text-gray-400">@{r.limitPrice}</span>}
                            <span className="text-xs text-gray-400 ml-auto whitespace-nowrap">{r.eventTime ? new Date(r.eventTime).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            {/* 最新赠单抽屉 */}
            {canSeeRecentDynamics && (
              <div className="border-b border-gray-100" style={{ backgroundColor: '#FFF5F5' }}>
                <div
                  className="flex items-center px-3 py-2 cursor-pointer select-none"
                  style={{ borderBottom: giftExpanded ? '1px solid rgba(220,38,38,0.15)' : 'none' }}
                  onClick={() => setGiftExpanded(v => !v)}
                >
                  <span className="text-xs font-semibold flex-shrink-0" style={{ color: '#B91C1C' }}>最新赠单</span>
                  {!giftExpanded && recentGiftOrders.length > 0 && (
                    <div className="flex items-center gap-1 ml-2 flex-1 min-w-0" style={{ overflow: 'hidden' }}>
                      <span className="text-xs text-gray-600 whitespace-nowrap flex-shrink-0">{(recentGiftOrders[0].userName || '').slice(0,2)}</span>
                      <span className="text-xs font-semibold whitespace-nowrap flex-shrink-0" style={{ color: '#B91C1C' }}>{recentGiftOrders[0].coin} {recentGiftOrders[0].amount}U</span>
                      <span className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0">←{(recentGiftOrders[0].fromName || '').slice(0,2)}</span>
                      <span className="text-xs text-gray-400 ml-auto whitespace-nowrap flex-shrink-0">{recentGiftOrders[0].eventTime ? new Date(recentGiftOrders[0].eventTime).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}</span>
                    </div>
                  )}
                  {!giftExpanded && recentGiftOrders.length === 0 && (
                    <span className="text-xs text-gray-300 ml-3">暂无记录</span>
                  )}
                  <span className="ml-2 flex-shrink-0 text-gray-400 text-xs">{giftExpanded ? '▲' : '▼'}</span>
                </div>
                {giftExpanded && (
                  <div className="px-3 py-2" style={{ maxHeight: '260px', overflowY: 'auto' }}>
                    {recentGiftOrders.length === 0 ? (
                      <div className="text-xs text-gray-300 py-2 text-center">暂无记录</div>
                    ) : (
                      <div className="space-y-1">
                        {recentGiftOrders.map((r: any) => (
                          <div key={r.id} className="flex items-center gap-2 py-1.5" style={{ borderBottom: '1px solid rgba(220,38,38,0.08)' }}>
                            <span className="text-xs text-gray-600 truncate" style={{ minWidth: '4em', maxWidth: '5em' }}>{r.userName}({r.username})</span>
                            <span className="text-xs font-semibold" style={{ color: '#B91C1C' }}>{r.coin} {r.amount}U</span>
                            <span className="text-xs text-gray-400 truncate">←{r.fromName}({r.fromUsername})</span>
                            <span className="text-xs text-gray-400 ml-auto whitespace-nowrap">{r.eventTime ? new Date(r.eventTime).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            {/* 内容区 */}
            <div className="overflow-y-auto flex-1 px-4 py-3">
              {inviteTreeLoading ? (
                <div className="text-center py-10 text-gray-400 text-sm">加载中...</div>
              ) : !inviteTreeData?.users?.length ? (
                <div className="text-center py-10 text-gray-400 text-sm">暂无邀请记录</div>
              ) : (
                <div className="space-y-2">
                  {[...inviteTreeData.users].sort((a: any, b: any) => {
                    // 按总资产（充值+余额）降序排列，有资产的用户排前面
                    const assetA = Number(a.totalRecharge ?? 0) + Number(a.balance ?? 0);
                    const assetB = Number(b.totalRecharge ?? 0) + Number(b.balance ?? 0);
                    return assetB - assetA;
                  }).map((u: any) => (
                    <div key={u.id} className="rounded-xl overflow-hidden" style={{ backgroundColor: '#F9F9F9', border: '1px solid #EEEEEE' }}>
                      {/* 上层：头像 + 基本信息 */}
                      <div className="flex items-start gap-3 pt-3 pb-2.5 px-3">
                        {/* 头像 */}
                        <div className="flex-shrink-0">
                          <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold" style={{ backgroundColor: u.layer === 1 ? '#D32F2F' : u.layer === 2 ? '#E57373' : '#EF9A9A' }}>
                            {u.name.charAt(0)}
                          </div>
                        </div>
                        {/* 右侧信息 */}
                        <div className="flex-1 min-w-0">
                          {/* 第一行：昵称 + 用户名 + 层级标签 + 拨比标签 + 备注按钮 */}
                          <div className="flex items-center justify-between gap-1">
                            <div className="flex items-baseline gap-1.5 min-w-0 flex-1">
                              <span className="text-sm font-semibold text-gray-900 truncate">{u.name}</span>
                              {(u as any).username && (
                                <span className="text-xs text-gray-400 font-normal truncate">({(u as any).username})</span>
                              )}
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <span className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: u.layer === 1 ? '#FFEBEE' : '#FFF3E0', color: u.layer === 1 ? '#D32F2F' : '#E65100' }}>第{u.layer}层</span>
                              <span
                                className="text-xs px-1.5 py-0.5 rounded-full font-medium cursor-pointer"
                                style={{ backgroundColor: u.payoutRatio > 0 ? '#FFF8E1' : '#F5F5F5', color: u.payoutRatio > 0 ? '#B8860B' : '#9E9E9E' }}
                                onClick={() => {
                                  if (!isYJH) return;
                                  if (editingRatioUserId === u.id) {
                                    setEditingRatioUserId(null);
                                    setEditingBeneficiaryId(null);
                                    setBeneficiaryRatioInput('');
                                  } else {
                                    setEditingRatioUserId(u.id);
                                    setEditingBeneficiaryId(null);
                                    setBeneficiaryRatioInput('');
                                  }
                                }}
                              >{u.payoutRatio > 0 ? `拨${u.payoutRatio}%` : '拨0%'}{isYJH && <svg style={{ display: 'inline-block', marginLeft: 3, verticalAlign: 'middle' }} width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><line x1="2" y1="4" x2="14" y2="4"/><circle cx="5" cy="4" r="1.5" fill="currentColor" stroke="none"/><line x1="2" y1="9" x2="14" y2="9"/><circle cx="11" cy="9" r="1.5" fill="currentColor" stroke="none"/><line x1="2" y1="14" x2="14" y2="14"/><circle cx="7" cy="14" r="1.5" fill="currentColor" stroke="none"/></svg>}</span>
                              <button onClick={() => { setEditingNoteUserId(u.id); setNoteInputValue(localNotes[u.id] !== undefined ? localNotes[u.id] : (u.note || '')); }} className="w-6 h-6 flex items-center justify-center rounded-full text-gray-400" style={{ backgroundColor: '#EEEEEE', fontSize: 12 }} title="添加备注">注</button>
                            </div>
                          </div>
                          {/* 第二行：左侧时间+推荐人，右侧钱包状态 */}
                          <div className="flex items-center justify-between mt-1.5 gap-2">
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <span className="text-xs text-gray-400 flex-shrink-0">{(u as any).registeredAt || ''}</span>
                              {u.inviterName
                                ? <span className="text-xs text-gray-400 truncate">推荐人：<span className="text-gray-600">{u.inviterName}</span></span>
                                : <span className="text-xs text-gray-300 flex-shrink-0">无推荐人</span>
                              }
                            </div>
                            <div className="flex-shrink-0">
                              {(u as any).hasWallet
                                ? <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: '#DCFCE7', color: '#166534' }}>钱包已绑</span>
                                : <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: '#FEE2E2', color: '#991B1B' }}>未绑钱包</span>
                              }
                            </div>
                          </div>
                          {/* 第三行：备注（有才显示） */}
                          {(() => {
                            const displayNote = localNotes[u.id] !== undefined ? localNotes[u.id] : (u.note || '');
                            return displayNote ? (
                              <div className="mt-1">
                                <span className="text-xs text-amber-700 truncate block">{displayNote}</span>
                              </div>
                            ) : null;
                          })()}
                        </div>
                      </div>
                      {/* 分隔细线 */}
                      <div style={{ height: 1, backgroundColor: '#E8E8E8', marginLeft: 12, marginRight: 12 }} />
                      {/* 财务数据行：充値 / 余额 / 利润 / 获利% */}
                      {(() => {
                        const recharge = Number((u as any).totalRecharge ?? 0);
                        const balance = Number(u.balance ?? 0);
                        const profit = Number((u as any).totalProfit ?? 0);
                        const profitPct = recharge > 0 ? (profit / recharge * 100) : 0;
                        const profitColor = profit > 0 ? '#C62828' : profit < 0 ? '#2E7D32' : '#9E9E9E';
                        return (
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', borderBottom: '1px solid #F0F0F0', margin: '0 0' }}>
                            <div style={{ padding: '6px 8px', textAlign: 'center', borderRight: '1px solid #F0F0F0' }}>
                              <div style={{ fontSize: 9, color: '#9E9E9E', marginBottom: 2 }}>充値</div>
                              <div style={{ fontSize: 11, fontWeight: 600, color: recharge > 0 ? '#1565C0' : '#9E9E9E' }}>{recharge.toFixed(0)}<span style={{ fontSize: 9, fontWeight: 400 }}>U</span></div>
                            </div>
                            <div style={{ padding: '6px 8px', textAlign: 'center', borderRight: '1px solid #F0F0F0' }}>
                              <div style={{ fontSize: 9, color: '#9E9E9E', marginBottom: 2 }}>余额</div>
                              <div style={{ fontSize: 11, fontWeight: 600, color: balance > 0 ? '#2E7D32' : '#9E9E9E' }}>{balance.toFixed(0)}<span style={{ fontSize: 9, fontWeight: 400 }}>U</span></div>
                            </div>
                            <div style={{ padding: '6px 8px', textAlign: 'center', borderRight: '1px solid #F0F0F0' }}>
                              <div style={{ fontSize: 9, color: '#9E9E9E', marginBottom: 2 }}>利润</div>
                              <div style={{ fontSize: 11, fontWeight: 600, color: profitColor }}>{profit > 0 ? '+' : ''}{profit.toFixed(0)}<span style={{ fontSize: 9, fontWeight: 400 }}>U</span></div>
                            </div>
                            <div style={{ padding: '6px 8px', textAlign: 'center' }}>
                              <div style={{ fontSize: 9, color: '#9E9E9E', marginBottom: 2 }}>获利%</div>
                              <div style={{ fontSize: 11, fontWeight: 600, color: profitColor }}>{profitPct > 0 ? '+' : ''}{profitPct.toFixed(1)}<span style={{ fontSize: 9, fontWeight: 400 }}>%</span></div>
                            </div>
                          </div>
                        );
                      })()}
                      {/* 下层：持仓情况表格（持仓/挂单三行） */}
                      <div className="px-3 pt-2 pb-2">
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                          <thead>
                            <tr style={{ backgroundColor: '#F5F5F5' }}>
                              {/* A1格：持仓标题 */}
                              <th style={{ border: '1px solid #E0E0E0', padding: '3px 6px', textAlign: 'left', color: '#9E9E9E', fontWeight: 400, width: 50 }}>持仓</th>
                              <th style={{ border: '1px solid #E0E0E0', padding: '3px 6px', textAlign: 'center', color: '#9E9E9E', fontWeight: 500 }}>BTC</th>
                              <th style={{ border: '1px solid #E0E0E0', padding: '3px 6px', textAlign: 'center', color: '#9E9E9E', fontWeight: 500 }}>ETH</th>
                              <th style={{ border: '1px solid #E0E0E0', padding: '3px 6px', textAlign: 'center', color: '#9E9E9E', fontWeight: 500 }}>SOL</th>
                            </tr>
                          </thead>
                          <tbody>
                            {/* 持仓行 */}
                            <tr>
                              <td style={{ border: '1px solid #E0E0E0', padding: '3px 6px', color: '#9E9E9E', backgroundColor: '#FAFAFA' }}>持仓</td>
                              <td style={{ border: '1px solid #E0E0E0', padding: '3px 6px', textAlign: 'center', fontWeight: 600, color: (u as any).holdingBTC > 0 ? '#B45309' : '#9E9E9E' }}>{Number((u as any).holdingBTC ?? 0).toFixed(4)}</td>
                              <td style={{ border: '1px solid #E0E0E0', padding: '3px 6px', textAlign: 'center', fontWeight: 600, color: (u as any).holdingETH > 0 ? '#1D4ED8' : '#9E9E9E' }}>{Number((u as any).holdingETH ?? 0).toFixed(4)}</td>
                              <td style={{ border: '1px solid #E0E0E0', padding: '3px 6px', textAlign: 'center', fontWeight: 600, color: (u as any).holdingSOL > 0 ? '#7C3AED' : '#9E9E9E' }}>{Number((u as any).holdingSOL ?? 0).toFixed(4)}</td>
                            </tr>
                            {/* 挂单买行 */}
                            <tr>
                              <td style={{ border: '1px solid #E0E0E0', padding: '3px 6px', color: '#9E9E9E', backgroundColor: '#FAFAFA' }}>挂单买</td>
                              <td style={{ border: '1px solid #E0E0E0', padding: '3px 6px', textAlign: 'center', fontWeight: 600, color: (u as any).pendingBuyBTC > 0 ? '#B45309' : '#9E9E9E' }}>{Number((u as any).pendingBuyBTC ?? 0).toFixed(4)}</td>
                              <td style={{ border: '1px solid #E0E0E0', padding: '3px 6px', textAlign: 'center', fontWeight: 600, color: (u as any).pendingBuyETH > 0 ? '#1D4ED8' : '#9E9E9E' }}>{Number((u as any).pendingBuyETH ?? 0).toFixed(4)}</td>
                              <td style={{ border: '1px solid #E0E0E0', padding: '3px 6px', textAlign: 'center', fontWeight: 600, color: (u as any).pendingBuySOL > 0 ? '#7C3AED' : '#9E9E9E' }}>{Number((u as any).pendingBuySOL ?? 0).toFixed(4)}</td>
                            </tr>
                            {/* 挂单卖行 */}
                            <tr>
                              <td style={{ border: '1px solid #E0E0E0', padding: '3px 6px', color: '#9E9E9E', backgroundColor: '#FAFAFA' }}>挂单卖</td>
                              <td style={{ border: '1px solid #E0E0E0', padding: '3px 6px', textAlign: 'center', fontWeight: 600, color: (u as any).pendingSellBTC > 0 ? '#B45309' : '#9E9E9E' }}>{Number((u as any).pendingSellBTC ?? 0).toFixed(4)}</td>
                              <td style={{ border: '1px solid #E0E0E0', padding: '3px 6px', textAlign: 'center', fontWeight: 600, color: (u as any).pendingSellETH > 0 ? '#1D4ED8' : '#9E9E9E' }}>{Number((u as any).pendingSellETH ?? 0).toFixed(4)}</td>
                              <td style={{ border: '1px solid #E0E0E0', padding: '3px 6px', textAlign: 'center', fontWeight: 600, color: (u as any).pendingSellSOL > 0 ? '#7C3AED' : '#9E9E9E' }}>{Number((u as any).pendingSellSOL ?? 0).toFixed(4)}</td>
                            </tr>
                            {/* 已成交行 */}
                            <tr>
                              <td style={{ border: '1px solid #E0E0E0', padding: '3px 6px', color: '#9E9E9E', backgroundColor: '#FAFAFA' }}>已成交</td>
                              <td style={{ border: '1px solid #E0E0E0', padding: '3px 6px', textAlign: 'center', fontWeight: 600, color: (u as any).soldBTC > 0 ? '#B45309' : '#9E9E9E' }}>{Number((u as any).soldBTC ?? 0).toFixed(4)}</td>
                              <td style={{ border: '1px solid #E0E0E0', padding: '3px 6px', textAlign: 'center', fontWeight: 600, color: (u as any).soldETH > 0 ? '#1D4ED8' : '#9E9E9E' }}>{Number((u as any).soldETH ?? 0).toFixed(4)}</td>
                              <td style={{ border: '1px solid #E0E0E0', padding: '3px 6px', textAlign: 'center', fontWeight: 600, color: (u as any).soldSOL > 0 ? '#7C3AED' : '#9E9E9E' }}>{Number((u as any).soldSOL ?? 0).toFixed(4)}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                      {/* YJH专属：拨比编辑面板 */}
                      {isYJH && editingRatioUserId === u.id && (
                        <div className="px-3 pb-3 pt-2" style={{ backgroundColor: '#FFFBF0', borderTop: '1px solid #F5E6C8' }}>
                          <div className="text-xs font-semibold mb-2" style={{ color: '#B8860B' }}>拨比配置（来源：{u.name}）</div>
                          {editingMemberRatios.length === 0 ? (
                            <div className="text-xs text-gray-400">加载中...</div>
                          ) : (
                            <>
                              <div className="space-y-0 mb-2" style={{ borderRadius: 6, overflow: 'hidden', border: '1px solid #F5E6C8' }}>
                                {editingMemberRatios.map((r: any, idx: number) => (
                                  <div key={r.beneficiaryUserId}
                                    className="flex items-center justify-between gap-2"
                                    style={{ padding: '10px 10px', backgroundColor: idx % 2 === 0 ? '#FFFDF5' : '#FFF8E8', borderBottom: idx < editingMemberRatios.length - 1 ? '1px solid #F5E6C8' : 'none', minHeight: 44 }}
                                  >
                                    <div className="flex-1 min-w-0">
                                      <span className="text-sm text-gray-700 font-medium">{r.name}</span>
                                      {r.username ? <span className="text-xs text-gray-400 ml-1">({r.username})</span> : null}

                                    </div>
                                    {editingBeneficiaryId === r.beneficiaryUserId ? (
                                      <div className="flex items-center gap-1.5 flex-shrink-0">
                                        <input
                                          type="number"
                                          min={0}
                                          max={100}
                                          step={0.1}
                                          value={beneficiaryRatioInput}
                                          onChange={e => setBeneficiaryRatioInput(e.target.value)}
                                          className="text-sm px-2 py-1 rounded border border-amber-300 outline-none text-center"
                                          style={{ backgroundColor: '#fff', width: 72 }}
                                          autoFocus
                                        />
                                        <span className="text-sm text-gray-500">%</span>
                                        <button
                                          onClick={() => setYjhRatioMutation.mutate({
                                            ledgerId: Number(ledgerId),
                                            sourceUserId: u.id,
                                            beneficiaryUserId: r.beneficiaryUserId,
                                            newRatio: parseFloat(beneficiaryRatioInput) || 0,
                                          })}
                                          disabled={setYjhRatioMutation.isPending}
                                          className="text-sm px-3 py-1 rounded text-white font-medium"
                                          style={{ backgroundColor: '#B8860B', minWidth: 40, minHeight: 32 }}
                                        >存</button>
                                        <button
                                          onClick={() => { setEditingBeneficiaryId(null); setBeneficiaryRatioInput(''); }}
                                          className="text-sm px-2.5 py-1 rounded text-gray-500"
                                          style={{ backgroundColor: '#EEEEEE', minWidth: 36, minHeight: 32 }}
                                        >取</button>
                                      </div>
                                    ) : (
                                      <button
                                        className="flex-shrink-0 font-semibold rounded"
                                        style={{ color: '#B8860B', backgroundColor: '#FFF3CD', border: '1px solid #F5D78A', padding: '6px 12px', minWidth: 64, minHeight: 36, fontSize: 15 }}
                                        onClick={() => { setEditingBeneficiaryId(r.beneficiaryUserId); setBeneficiaryRatioInput(String(r.ratio)); }}
                                      >{r.ratio}%</button>
                                    )}
                                  </div>
                                ))}
                              </div>
                              <div className="text-xs text-gray-400">
                                已分配：{editingMemberRatios.reduce((s: number, r: any) => s + r.ratio, 0).toFixed(1)}%　剩余：{(100 - editingMemberRatios.reduce((s: number, r: any) => s + r.ratio, 0)).toFixed(1)}%
                              </div>
                              <div className="mt-2">
                                <button
                                  onClick={() => { setEditingRatioUserId(null); setEditingBeneficiaryId(null); setBeneficiaryRatioInput(''); }}
                                  className="text-xs px-3 py-1 rounded text-gray-500"
                                  style={{ backgroundColor: '#EEEEEE' }}
                                >关闭</button>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                      {/* 备注编辑区 */}
                      {editingNoteUserId === u.id && (
                        <div className="px-3 pb-3 flex gap-2">
                          <input
                            autoFocus
                            value={noteInputValue}
                            onChange={e => setNoteInputValue(e.target.value)}
                            placeholder="输入备注（最多100字）"
                            maxLength={100}
                            className="flex-1 text-sm px-3 py-1.5 rounded-lg border border-gray-200 outline-none"
                            style={{ backgroundColor: '#fff' }}
                          />
                          <button
                            onClick={() => saveInviteNoteMutation.mutate({ ledgerId: Number(ledgerId), targetUserId: u.id, note: noteInputValue })}
                            disabled={saveInviteNoteMutation.isPending}
                            className="text-xs px-3 py-1.5 rounded-lg text-white font-medium"
                            style={{ backgroundColor: '#D32F2F' }}
                          >保存</button>
                          <button
                            onClick={() => setEditingNoteUserId(null)}
                            className="text-xs px-2 py-1.5 rounded-lg text-gray-500"
                            style={{ backgroundColor: '#EEEEEE' }}
                          >取消</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* AF/AH/AI 视角切换横幅 */}
      {(isCustomAF || isCustomAH || isCustomAI || isCustomAJ) && viewAsUserId && (isReallyViewingAs || realUserIsManagerInLedger) && (
        <div className="fixed bottom-0 left-0 right-0 z-[60] flex items-center justify-between px-4 py-3 safe-area-bottom" style={{ backgroundColor: '#F59E0B', color: '#1A2340' }}>
          <div className="flex items-center gap-2 text-sm font-medium">
            <Users className="w-4 h-4" />
            <span>正在以 {(() => {
              const t = (membersData as any[])?.find((m: any) => m.userId === viewAsUserId);
              return t ? (t.nickname || t.username) : '未知用户';
            })()} 的视角查看</span>
          </div>
          <button
            onClick={() => handleSwitchView(null)}
            className="px-3 py-1 rounded-full text-xs font-medium bg-white/90 text-gray-800"
          >
            切回我的视角
          </button>
        </div>
      )}

      {/* 权重详情弹窗 */}
      {showWeightDetail && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center" onClick={() => setShowWeightDetail(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <div
            className="relative w-full rounded-t-3xl px-5 pt-5 pb-8"
            style={{ background: '#FFF8F0', boxShadow: '0 -4px 32px rgba(58,20,0,0.25)', maxHeight: '85vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}
          >
            {/* 标题行 */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-base font-bold" style={{ color: '#1A0A00' }}>权重详情</div>
                <div className="text-[11px] mt-0.5" style={{ color: 'rgba(58,20,0,0.5)' }}>最终股票数 = 资金股 × (1 + 资金乘数 + 资源乘数)</div>
              </div>
              <button onClick={() => setShowWeightDetail(false)} style={{ background: 'rgba(58,20,0,0.08)', border: 'none', borderRadius: '50%', width: 28, height: 28, cursor: 'pointer', color: 'rgba(58,20,0,0.6)', fontSize: 14 }}>×</button>
            </div>

            {/* ===== 上半部分：用户实际数据 ===== */}
            <WeightScoreDisplay ledgerId={ledgerId} userId={viewAsUserId} />

            {/* ===== 下半部分：权重规则说明 ===== */}
            <div className="rounded-2xl p-4" style={{ background: 'rgba(201,168,76,0.07)', border: '1px solid rgba(201,168,76,0.2)' }}>

              {/* 总览说明 */}
              <div className="text-xs font-bold mb-1" style={{ color: '#1A0A00' }}>权重计算规则</div>
              <div className="text-[10px] mb-4" style={{ color: 'rgba(58,20,0,0.5)' }}>最终股票数 = 资金股 × 综合乘数，综合乘数满分 <span style={{ color: '#C9A84C', fontWeight: 700 }}>5.0倍</span>（基础1.0倍 + 资金乘数2.0倍 + 资源乘数2.0倍）</div>

              {/* ===== 合并的权重规则表格（固定列宽，防止换行） ===== */}
              <table style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed', fontSize: '10px' }}>
                <colgroup>
                  <col style={{ width: '18%' }} />
                  <col style={{ width: '16%' }} />
                  <col style={{ width: '10%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '44%' }} />
                </colgroup>
                <thead>
                  <tr style={{ background: 'rgba(201,168,76,0.15)' }}>
                    <th style={{ color: '#1A0A00', fontWeight: 700, border: '1px solid rgba(201,168,76,0.25)', padding: '6px 4px', textAlign: 'center', whiteSpace: 'nowrap' }}>乘数类型</th>
                    <th style={{ color: '#1A0A00', fontWeight: 700, border: '1px solid rgba(201,168,76,0.25)', padding: '6px 4px', textAlign: 'center', whiteSpace: 'nowrap' }}>维度</th>
                    <th style={{ color: '#1A0A00', fontWeight: 700, border: '1px solid rgba(201,168,76,0.25)', padding: '6px 2px', textAlign: 'center', whiteSpace: 'nowrap' }}>权重</th>
                    <th style={{ color: '#1A0A00', fontWeight: 700, border: '1px solid rgba(201,168,76,0.25)', padding: '6px 2px', textAlign: 'center', whiteSpace: 'nowrap' }}>满分</th>
                    <th style={{ color: '#1A0A00', fontWeight: 700, border: '1px solid rgba(201,168,76,0.25)', padding: '6px 4px', textAlign: 'center' }}>计分规则</th>
                  </tr>
                </thead>
                <tbody>
                  {/* 基础权重 */}
                  <tr style={{ background: 'rgba(58,20,0,0.06)' }}>
                    <td style={{ color: '#1A0A00', fontWeight: 700, border: '1px solid rgba(201,168,76,0.2)', padding: '7px 4px', textAlign: 'center', whiteSpace: 'nowrap' }}>基础权重</td>
                    <td colSpan={4} style={{ border: '1px solid rgba(201,168,76,0.2)', padding: '7px 8px' }}>
                      <span style={{ color: '#C9A84C', fontWeight: 700 }}>固定 +1.0倍</span>
                      <span style={{ color: 'rgba(58,20,0,0.5)', fontSize: '9px', marginLeft: '6px' }}>所有合伙人均享有，无需额外条件</span>
                    </td>
                  </tr>

                  {/* 资源乘数 */}
                  <tr style={{ background: 'rgba(201,168,76,0.1)' }}>
                    <td rowSpan={8} style={{ color: '#C9A84C', fontWeight: 700, border: '1px solid rgba(201,168,76,0.2)', padding: '8px 4px', textAlign: 'center', verticalAlign: 'middle', lineHeight: '1.6' }}>
                      资源<br/>乘数<br/><span style={{ fontSize: '9px', fontWeight: 400, color: 'rgba(58,20,0,0.55)' }}>满分<br/>+2.0倍</span>
                    </td>
                    <td colSpan={4} style={{ color: 'rgba(58,20,0,0.85)', fontWeight: 700, border: '1px solid rgba(201,168,76,0.2)', padding: '5px 8px', background: 'rgba(201,168,76,0.1)' }}>
                      一、人脉贡献（50%，满分+1.0倍）
                    </td>
                  </tr>
                  <tr>
                    <td style={{ color: 'rgba(58,20,0,0.8)', border: '1px solid rgba(201,168,76,0.15)', padding: '5px 3px', textAlign: 'center', whiteSpace: 'nowrap', fontSize: '9px' }}>自有人脉</td>
                    <td style={{ color: 'rgba(58,20,0,0.7)', border: '1px solid rgba(201,168,76,0.15)', padding: '5px 2px', textAlign: 'center', whiteSpace: 'nowrap', fontSize: '9px' }}>50%</td>
                    <td style={{ color: '#C9A84C', fontWeight: 700, border: '1px solid rgba(201,168,76,0.15)', padding: '5px 2px', textAlign: 'center', whiteSpace: 'nowrap', fontSize: '9px' }}>+0.5x</td>
                    <td style={{ color: 'rgba(58,20,0,0.6)', border: '1px solid rgba(201,168,76,0.15)', padding: '5px 3px', fontSize: '9px', whiteSpace: 'nowrap' }}>每1人得1分，≥100人满</td>
                  </tr>
                  <tr style={{ background: 'rgba(201,168,76,0.04)' }}>
                    <td style={{ color: 'rgba(58,20,0,0.8)', border: '1px solid rgba(201,168,76,0.15)', padding: '5px 3px', textAlign: 'center', whiteSpace: 'nowrap', fontSize: '9px' }}>共享人脉</td>
                    <td style={{ color: 'rgba(58,20,0,0.7)', border: '1px solid rgba(201,168,76,0.15)', padding: '5px 2px', textAlign: 'center', whiteSpace: 'nowrap', fontSize: '9px' }}>30%</td>
                    <td style={{ color: '#C9A84C', fontWeight: 700, border: '1px solid rgba(201,168,76,0.15)', padding: '5px 2px', textAlign: 'center', whiteSpace: 'nowrap', fontSize: '9px' }}>+0.3x</td>
                    <td style={{ color: 'rgba(58,20,0,0.6)', border: '1px solid rgba(201,168,76,0.15)', padding: '5px 3px', fontSize: '9px', whiteSpace: 'nowrap' }}>每8人得1分，≥800人满</td>
                  </tr>
                  <tr>
                    <td style={{ color: 'rgba(58,20,0,0.8)', border: '1px solid rgba(201,168,76,0.15)', padding: '5px 3px', textAlign: 'center', whiteSpace: 'nowrap', fontSize: '9px' }}>拓扑人脉</td>
                    <td style={{ color: 'rgba(58,20,0,0.7)', border: '1px solid rgba(201,168,76,0.15)', padding: '5px 2px', textAlign: 'center', whiteSpace: 'nowrap', fontSize: '9px' }}>20%</td>
                    <td style={{ color: '#C9A84C', fontWeight: 700, border: '1px solid rgba(201,168,76,0.15)', padding: '5px 2px', textAlign: 'center', whiteSpace: 'nowrap', fontSize: '9px' }}>+0.2x</td>
                    <td style={{ color: 'rgba(58,20,0,0.6)', border: '1px solid rgba(201,168,76,0.15)', padding: '5px 3px', fontSize: '9px', whiteSpace: 'nowrap' }}>每20人得1分，≥2000人满</td>
                  </tr>
                  <tr style={{ background: 'rgba(201,168,76,0.1)' }}>
                    <td colSpan={4} style={{ color: 'rgba(58,20,0,0.85)', fontWeight: 700, border: '1px solid rgba(201,168,76,0.2)', padding: '5px 8px', background: 'rgba(201,168,76,0.1)' }}>
                      二、标签贡献（30%，满分+0.6倍）
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={4} style={{ border: '1px solid rgba(201,168,76,0.15)', padding: '3px 4px' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8px', tableLayout: 'fixed' }}>
                        <colgroup>
                          <col style={{ width: '15%' }} />
                          <col style={{ width: '18.33%' }} />
                          <col style={{ width: '15%' }} />
                          <col style={{ width: '18.33%' }} />
                          <col style={{ width: '15%' }} />
                          <col style={{ width: '18.33%' }} />
                        </colgroup>
                        <thead>
                          <tr style={{ background: 'rgba(201,168,76,0.12)' }}>
                            <th style={{ border: '1px solid rgba(201,168,76,0.2)', padding: '2px 1px', textAlign: 'center', color: 'rgba(58,20,0,0.6)', fontWeight: 600, whiteSpace: 'nowrap' }}>人均标签</th>
                            <th style={{ border: '1px solid rgba(201,168,76,0.2)', padding: '2px 1px', textAlign: 'center', color: 'rgba(58,20,0,0.6)', fontWeight: 600, whiteSpace: 'nowrap' }}>权重加成</th>
                            <th style={{ border: '1px solid rgba(201,168,76,0.2)', padding: '2px 1px', textAlign: 'center', color: 'rgba(58,20,0,0.6)', fontWeight: 600, whiteSpace: 'nowrap' }}>人均标签</th>
                            <th style={{ border: '1px solid rgba(201,168,76,0.2)', padding: '2px 1px', textAlign: 'center', color: 'rgba(58,20,0,0.6)', fontWeight: 600, whiteSpace: 'nowrap' }}>权重加成</th>
                            <th style={{ border: '1px solid rgba(201,168,76,0.2)', padding: '2px 1px', textAlign: 'center', color: 'rgba(58,20,0,0.6)', fontWeight: 600, whiteSpace: 'nowrap' }}>人均标签</th>
                            <th style={{ border: '1px solid rgba(201,168,76,0.2)', padding: '2px 1px', textAlign: 'center', color: 'rgba(58,20,0,0.6)', fontWeight: 600, whiteSpace: 'nowrap' }}>权重加成</th>
                          </tr>
                        </thead>
                        <tbody>
                          {([['1个','+0.15倍','2个','+0.24倍','3个','+0.30倍'],['4个','+0.35倍','5个','+0.39倍','6个','+0.42倍'],['7个','+0.45倍','8个','+0.48倍','9个','+0.50倍'],['10个','+0.52倍','11个','+0.54倍','12个','+0.56倍'],['13个','+0.57倍','14个','+0.59倍','≥15个','+0.60倍']] as string[][]).map((row, i) => (
                            <tr key={i} style={{ background: i % 2 === 1 ? 'rgba(201,168,76,0.04)' : 'transparent' }}>
                              {row.map((cell, j) => (
                                <td key={j} style={{ border: '1px solid rgba(201,168,76,0.12)', padding: '2px 1px', textAlign: 'center', color: j % 2 === 0 ? 'rgba(58,20,0,0.75)' : '#C9A84C', fontWeight: j % 2 === 1 ? 700 : 400, whiteSpace: 'nowrap' }}>{cell}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                  <tr style={{ background: 'rgba(201,168,76,0.1)' }}>
                    <td colSpan={4} style={{ color: 'rgba(58,20,0,0.85)', fontWeight: 700, border: '1px solid rgba(201,168,76,0.2)', padding: '5px 8px', background: 'rgba(201,168,76,0.1)' }}>
                      三、邀请贡献（20%，满分+0.4倍）
                    </td>
                  </tr>
                  <tr style={{ background: 'rgba(201,168,76,0.04)' }}>
                    <td colSpan={4} style={{ border: '1px solid rgba(201,168,76,0.15)', padding: '6px 8px', fontSize: '9px', color: 'rgba(58,20,0,0.6)', lineHeight: '1.6' }}>
                      每邀请1位用户得1分，≥100人得满分（+0.4倍）
                    </td>
                  </tr>

                  {/* 资金乘数 */}
                  <tr style={{ background: 'rgba(201,168,76,0.1)' }}>
                    <td rowSpan={6} style={{ color: '#C9A84C', fontWeight: 700, border: '1px solid rgba(201,168,76,0.2)', padding: '8px 4px', textAlign: 'center', verticalAlign: 'middle', lineHeight: '1.6' }}>
                      资金<br/>乘数<br/><span style={{ fontSize: '9px', fontWeight: 400, color: 'rgba(58,20,0,0.55)' }}>满分<br/>+2.0倍</span>
                    </td>
                    <td colSpan={4} style={{ color: 'rgba(58,20,0,0.85)', fontWeight: 700, border: '1px solid rgba(201,168,76,0.2)', padding: '5px 8px', background: 'rgba(201,168,76,0.1)' }}>
                      一、时间乘数（满分+1.0倍）
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={4} style={{ border: '1px solid rgba(201,168,76,0.15)', padding: '3px 4px' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '7.5px', tableLayout: 'fixed' }}>
                        <colgroup>
                          <col style={{ width: '20%' }} />
                          <col style={{ width: '13.33%' }} />
                          <col style={{ width: '20%' }} />
                          <col style={{ width: '13.33%' }} />
                          <col style={{ width: '20%' }} />
                          <col style={{ width: '13.33%' }} />
                        </colgroup>
                        <thead>
                          <tr style={{ background: 'rgba(201,168,76,0.12)' }}>
                            <th style={{ border: '1px solid rgba(201,168,76,0.2)', padding: '2px 1px', textAlign: 'center', color: 'rgba(58,20,0,0.6)', fontWeight: 600, whiteSpace: 'nowrap' }}>排名区间</th>
                            <th style={{ border: '1px solid rgba(201,168,76,0.2)', padding: '2px 1px', textAlign: 'center', color: 'rgba(58,20,0,0.6)', fontWeight: 600, whiteSpace: 'nowrap' }}>加成</th>
                            <th style={{ border: '1px solid rgba(201,168,76,0.2)', padding: '2px 1px', textAlign: 'center', color: 'rgba(58,20,0,0.6)', fontWeight: 600, whiteSpace: 'nowrap' }}>排名区间</th>
                            <th style={{ border: '1px solid rgba(201,168,76,0.2)', padding: '2px 1px', textAlign: 'center', color: 'rgba(58,20,0,0.6)', fontWeight: 600, whiteSpace: 'nowrap' }}>加成</th>
                            <th style={{ border: '1px solid rgba(201,168,76,0.2)', padding: '2px 1px', textAlign: 'center', color: 'rgba(58,20,0,0.6)', fontWeight: 600, whiteSpace: 'nowrap' }}>排名区间</th>
                            <th style={{ border: '1px solid rgba(201,168,76,0.2)', padding: '2px 1px', textAlign: 'center', color: 'rgba(58,20,0,0.6)', fontWeight: 600, whiteSpace: 'nowrap' }}>加成</th>
                          </tr>
                        </thead>
                        <tbody>
                          {([
                            ['1-10名','1.00x','11-20名','0.98x','21-30名','0.97x'],
                            ['31-40名','0.95x','41-50名','0.94x','51-60名','0.92x'],
                            ['61-70名','0.91x','71-80名','0.89x','81-90名','0.88x'],
                            ['91-100名','0.85x','101-120名','0.82x','121-140名','0.79x'],
                            ['141-160名','0.76x','161-180名','0.73x','181-200名','0.70x'],
                            ['201-220名','0.67x','221-240名','0.64x','241-260名','0.61x'],
                            ['261-280名','0.58x','281-300名','0.55x','301-320名','0.52x'],
                            ['321-340名','0.49x','341-360名','0.46x','361-380名','0.43x'],
                            ['381-400名','0.40x','401-420名','0.37x','421-440名','0.34x'],
                            ['441-460名','0.31x','461-480名','0.28x','481-500名','0.25x'],
                            ['501-520名','0.22x','521-540名','0.19x','541-560名','0.16x'],
                            ['561-580名','0.13x','581-600名','0.10x','601-620名','0.07x'],
                            ['621-640名','0.04x','641-660名','0.01x','661-666名','0.00x'],
                          ] as string[][]).map((row, i) => (
                            <tr key={i} style={{ background: i % 2 === 1 ? 'rgba(201,168,76,0.04)' : 'transparent' }}>
                              {row.map((cell, j) => (
                                <td key={j} style={{ border: '1px solid rgba(201,168,76,0.12)', padding: '1.5px 0px', textAlign: 'center', color: j % 2 === 0 ? 'rgba(58,20,0,0.75)' : '#C9A84C', fontWeight: j % 2 === 1 ? 700 : 400, whiteSpace: 'nowrap' }}>{cell}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div style={{ fontSize: '7.5px', color: 'rgba(58,20,0,0.45)', padding: '2px 2px', textAlign: 'center' }}>共66档，每10名一档，第667名起加成为0</div>
                    </td>
                  </tr>
                  <tr style={{ background: 'rgba(201,168,76,0.1)' }}>
                    <td colSpan={4} style={{ color: 'rgba(58,20,0,0.85)', fontWeight: 700, border: '1px solid rgba(201,168,76,0.2)', padding: '5px 8px', background: 'rgba(201,168,76,0.1)' }}>
                      二、资金量乘数（满分+1.0倍）
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={4} style={{ border: '1px solid rgba(201,168,76,0.15)', padding: '3px 4px' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8px', tableLayout: 'fixed' }}>
                        <thead>
                          <tr style={{ background: 'rgba(201,168,76,0.12)' }}>
                            <th style={{ border: '1px solid rgba(201,168,76,0.2)', padding: '2px 2px', textAlign: 'center', color: 'rgba(58,20,0,0.6)', fontWeight: 600, whiteSpace: 'nowrap' }}>出资金额</th>
                            <th style={{ border: '1px solid rgba(201,168,76,0.2)', padding: '2px 2px', textAlign: 'center', color: 'rgba(58,20,0,0.6)', fontWeight: 600, whiteSpace: 'nowrap' }}>资金加成</th>
                            <th style={{ border: '1px solid rgba(201,168,76,0.2)', padding: '2px 2px', textAlign: 'center', color: 'rgba(58,20,0,0.6)', fontWeight: 600, whiteSpace: 'nowrap' }}>出资金额</th>
                            <th style={{ border: '1px solid rgba(201,168,76,0.2)', padding: '2px 2px', textAlign: 'center', color: 'rgba(58,20,0,0.6)', fontWeight: 600, whiteSpace: 'nowrap' }}>资金加成</th>
                          </tr>
                        </thead>
                        <tbody>
                          {([['1万','0.10x','2万','0.20x'],['3万','0.30x','4万','0.40x'],['5万','0.50x','6万','0.60x'],['7万','0.70x','8万','0.80x'],['9万','0.90x','≥10万','1.00x']] as string[][]).map((row, i) => (
                            <tr key={i} style={{ background: i % 2 === 1 ? 'rgba(201,168,76,0.04)' : 'transparent' }}>
                              {row.map((cell, j) => (
                                <td key={j} style={{ border: '1px solid rgba(201,168,76,0.12)', padding: '2px 2px', textAlign: 'center', color: j % 2 === 0 ? 'rgba(58,20,0,0.75)' : '#C9A84C', fontWeight: j % 2 === 1 ? 700 : 400, whiteSpace: 'nowrap' }}>{cell}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div style={{ fontSize: '8px', color: 'rgba(58,20,0,0.45)', padding: '2px 2px', textAlign: 'center' }}>以10万元为基准，出资金额÷10万=加成倍数</div>
                    </td>
                  </tr>
                </tbody>
              </table>

            </div>

            <button
              onClick={() => setShowWeightDetail(false)}
              className="mt-4 w-full py-2.5 rounded-xl text-sm font-semibold"
              style={{ background: 'rgba(58,20,0,0.08)', color: 'rgba(58,20,0,0.7)', border: 'none', cursor: 'pointer' }}
            >关闭</button>
          </div>
        </div>
      )}

      {/* 股权流水弹窗 */}
      {showEquityHistory && isCustomAI && (
        <EquityHistoryModal
          ledgerId={Number(ledgerId)}
          userId={equityHistoryUserId ?? user?.id ?? 0}
          nickname={equityHistoryUserId
            ? ((membersData as any[])?.find((m: any) => m.userId === equityHistoryUserId)?.nickname || '成员')
            : (user?.nickname || user?.username || '我')}
          isAdmin={!viewAsUserId && (isOwner || isAdmin)}
          onClose={() => setShowEquityHistory(false)}
          onViewUser={(uid) => { setEquityHistoryUserId(uid); }}
          membersData={membersData as any[]}
        />
      )}

      {/* AF/AH 视角切换弹窗：成员列表 + 搜索 */}
      {showViewAsPicker && (isCustomAF || isCustomAH || isCustomAI || isCustomAJ) && (isCustomAJ ? isOwner : (isOwner || isAdmin)) && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center" onClick={() => setShowViewAsPicker(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative w-full max-w-md bg-white rounded-t-2xl max-h-[70vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            {/* 头部 */}
            <div className="px-4 pt-4 pb-2 border-b border-gray-100">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold text-gray-900">切换查看视角</h3>
                <button onClick={() => setShowViewAsPicker(false)} className="text-gray-400 text-xl">×</button>
              </div>
              {/* 搜索框 */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="搜索成员名称..."
                  value={viewAsSearch}
                  onChange={e => setViewAsSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
              {/* 角色筛选按钮 */}
              <div className="flex gap-2 mt-2">
                {(['all', 'member', 'funder'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setViewAsRoleFilter(f)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      viewAsRoleFilter === f
                        ? 'bg-[#A80000] text-white'
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                  >
                    {f === 'all' ? '全部' : f === 'member' ? (isCustomAJ ? '业务员' : '普通成员') : (isCustomAJ ? '企业主' : '资金方')}
                  </button>
                ))}
              </div>
            </div>
            {/* 成员列表 */}
            <div className="flex-1 overflow-y-auto px-4 py-2">
              {/* 切回自己 */}
              {viewAsUserId && (
                <button
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-xl mb-1 bg-blue-50"
                  onClick={() => handleSwitchView(null)}
                >
                  {user && <UserAvatar username={user.username} avatar={user.avatar} nickname={user.nickname} size="sm" />}
                  <div className="flex-1 text-left">
                    <div className="text-sm font-medium text-blue-700">我自己</div>
                    <div className="text-xs text-blue-500">{user?.nickname || user?.username}</div>
                  </div>
                  <span className="text-xs text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">当前</span>
                </button>
              )}
              {/* 成员列表 */}
              {((membersData as any[]) || []).filter((m: any) => {
                if (m.userId === user?.id) return false; // 排除自己
                // 角色筛选
                if (viewAsRoleFilter === 'member' && m.role !== 'member') return false;
                if (viewAsRoleFilter === 'funder' && m.role !== 'funder') return false;
                if (!viewAsSearch) return true;
                const keyword = viewAsSearch.toLowerCase();
                return (m.nickname || '').toLowerCase().includes(keyword) || (m.username || '').toLowerCase().includes(keyword);
              }).map((m: any) => (
                <button
                  key={m.userId}
                  className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl mb-1 transition-colors ${
                    viewAsUserId === m.userId ? 'bg-amber-50' : 'hover:bg-gray-50'
                  }`}
                  onClick={() => handleSwitchView(m.userId)}
                >
                  <UserAvatar username={m.username} avatar={m.avatar} nickname={m.nickname} size="sm" />
                  <div className="flex-1 text-left">
                    {/* 昵称（users.name）和账号（users.username）同时显示，相同时只显一次 */}
                    {(m as any).realName && (m as any).realName !== m.username ? (
                      <>
                        <div className="text-sm font-medium text-gray-900">{(m as any).realName}</div>
                        {m.username && <div className="text-xs text-blue-500">@{m.username}</div>}
                      </>
                    ) : (
                      <div className="text-sm font-medium text-gray-900">{m.username || '未知用户'}</div>
                    )}
                    <div className="text-xs text-gray-500 space-y-0.5">
                      <div>{isCustomAJ ? (m.role === 'owner' ? '创始人' : m.role === 'admin' ? '企业主' : '业务员') : (m.role === 'owner' ? '创始人' : m.role === 'admin' ? '管理员' : m.role === 'funder' ? '资金方' : '普通成员')}</div>
                      <div className="text-gray-400">ID: {m.userId}</div>
                    </div>
                  </div>
                  {viewAsUserId === m.userId && (
                    <span className="text-xs text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">查看中</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      {/* 报销凭证图片全屏预览 */}
      {previewImageUrl && (
        <div
          onClick={() => setPreviewImageUrl(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 99999,
            background: 'rgba(0,0,0,0.92)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <img
            src={previewImageUrl}
            alt="凭证大图"
            onClick={e => e.stopPropagation()}
            style={{
              maxWidth: '95vw', maxHeight: '90vh',
              objectFit: 'contain', borderRadius: '8px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)'
            }}
          />
          <div
            onClick={() => setPreviewImageUrl(null)}
            style={{
              position: 'absolute', top: '20px', right: '20px',
              width: '36px', height: '36px', borderRadius: '50%',
              background: 'rgba(255,255,255,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', fontSize: '20px', color: '#fff', fontWeight: 300
            }}
          >×</div>
        </div>
      )}
      {/* 股权编号复制 Toast */}
      <div
        id="share-code-toast"
        style={{
          position: 'fixed', bottom: '80px', left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(58,20,0,0.85)', color: '#FFF8F0',
          padding: '6px 16px', borderRadius: '20px', fontSize: '12px',
          fontFamily: 'monospace', letterSpacing: '0.04em',
          opacity: 0, transition: 'opacity 0.3s', zIndex: 9999,
          pointerEvents: 'none', whiteSpace: 'nowrap',
        }}
      />
    </div>
  );
}

