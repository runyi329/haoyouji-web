import React, { useState } from "react";
import { ChevronLeft, TrendingUp, Shield, Users, BarChart2, Activity, Award, Settings } from "lucide-react";
import { useLocation, useRoute } from "wouter";
import { trpc } from "@/lib/trpc";

// ─── 主题色（与GridTradeSimulator一致）─────────────────────────
const BG_PAGE    = "#f5f6f8";
const BG_WHITE   = "#ffffff";
const BORDER     = "#e4e7ed";
const TEXT_MAIN  = "#1a1a2e";
const TEXT_SUB   = "#6b7280";
const TEXT_MUTED = "#9ca3af";
const ACCENT     = "#1a56db";
const ACCENT_BG  = "#eff6ff";
const ACCENT_LIGHT = "#dbeafe";
const BG_SUBTLE  = "#f0f2f5";
const GREEN      = "#16a34a";
const RED        = "#dc2626";
const ORANGE     = "#ea580c";
const ORANGE_BG  = "#fff7ed";

// 日志已迁移至服务端数据库

// ─── 指标评级 ──────────────────────────────────────────────────
function sharpeLabel(v: number) {
  if (v > 2) return { text: '优秀', color: RED };
  if (v > 1) return { text: '良好', color: ACCENT };
  if (v > 0.5) return { text: '可接受', color: '#d97706' };
  return { text: '较差', color: GREEN };
}
function calmarLabel(v: number) {
  if (v > 2) return { text: '优秀', color: RED };
  if (v > 1) return { text: '良好', color: ACCENT };
  if (v > 0.5) return { text: '可接受', color: '#d97706' };
  return { text: '较差', color: GREEN };
}

// ─── 小工具 ────────────────────────────────────────────────────
const fmt2 = (n: number) => n.toFixed(2);
const fmtPct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
const fmtU = (n: number) => `${Math.round(n).toLocaleString('zh-CN')} u`;
const fmtSign = (n: number) => `${n >= 0 ? '+' : ''}${Math.round(n).toLocaleString('zh-CN')} u`;
const profitColor = (n: number) => n >= 0 ? RED : GREEN;

// ─── 分组卡片 ──────────────────────────────────────────────────
function SectionCard({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl overflow-hidden mb-3" style={{ background: BG_WHITE, border: `1px solid ${BORDER}` }}>
      <div className="flex items-center gap-2 px-4 py-3" style={{ background: ACCENT_BG, borderBottom: `1px solid ${ACCENT_LIGHT}` }}>
        <span style={{ color: ACCENT }}>{icon}</span>
        <span className="text-sm font-bold" style={{ color: ACCENT }}>{title}</span>
      </div>
      {children}
    </div>
  );
}

// ─── 双列数据行 ────────────────────────────────────────────────
function DataRow({ label, value, valueColor, note, isOdd }: { label: string; value: string; valueColor?: string; note?: string; isOdd?: boolean }) {
  return (
    <div className="px-4 py-2.5 flex items-center justify-between" style={{ background: isOdd ? BG_SUBTLE : BG_WHITE, borderTop: `1px solid ${BORDER}` }}>
      <div>
        <span className="text-xs" style={{ color: TEXT_MUTED }}>{label}</span>
        {note && <span className="text-xs ml-1" style={{ color: TEXT_MUTED, opacity: 0.7 }}>({note})</span>}
      </div>
      <span className="text-sm font-bold" style={{ color: valueColor ?? TEXT_MAIN }}>{value}</span>
    </div>
  );
}

// ─── 指标卡（带评级）──────────────────────────────────────────
function MetricCard({ label, value, unit, rating, desc }: { label: string; value: string; unit?: string; rating?: { text: string; color: string }; desc: string }) {
  return (
    <div className="rounded-lg p-3 flex flex-col gap-1" style={{ background: BG_SUBTLE, border: `1px solid ${BORDER}` }}>
      <div className="flex items-center justify-between">
        <span className="text-xs" style={{ color: TEXT_MUTED }}>{label}</span>
        {rating && (
          <span className="text-xs px-1.5 py-0.5 rounded-full font-bold" style={{ background: rating.color + '20', color: rating.color }}>{rating.text}</span>
        )}
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-lg font-bold" style={{ color: TEXT_MAIN }}>{value}</span>
        {unit && <span className="text-xs" style={{ color: TEXT_MUTED }}>{unit}</span>}
      </div>
      <span className="text-xs" style={{ color: TEXT_MUTED }}>{desc}</span>
    </div>
  );
}

// ─── 主页面 ────────────────────────────────────────────────────
export default function GridSimLogDetail() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/ledger/:id/grid-simulator/log/:logId");
  const ledgerId = params?.id ?? '';
  const logId = params?.logId ?? '';

  const { data: logsRaw, isLoading } = trpc.getGridSimLogs.useQuery(
    { ledgerId: Number(ledgerId) || 52 },
    { staleTime: 5000 }
  );
  const entry = (logsRaw || []).find((l: any) => String(l.id) === String(logId));

  const [expandedParticipants, setExpandedParticipants] = useState(false);

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center" style={{ background: BG_PAGE }}>
        <p className="text-sm" style={{ color: TEXT_MUTED }}>正在加载日志数据...</p>
      </div>
    );
  }

  if (!entry) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center" style={{ background: BG_PAGE }}>
        <p className="text-sm" style={{ color: TEXT_MUTED }}>未找到该日志记录</p>
        <button className="mt-4 px-4 py-2 rounded-lg text-sm" style={{ background: ACCENT, color: '#fff' }}
          onClick={() => setLocation(`/ledger/${ledgerId}/grid-simulator`)}>返回</button>
      </div>
    );
  }

  const s = entry.summary;
  const p = entry.params;
  const totalSlots = p.numGridsUp + p.numGridsDown + 1;
  const totalPool = totalSlots * entry.perSlotFund;

  // 月份标签
  const MONTH_MAP: Record<string, string> = { '1':'1月','2':'2月','3':'3月','4':'4月','5':'5月','6':'6月','7':'7月','8':'8月','9':'9月','10':'10月','11':'11月','12':'12月' };
  const monthLabels = entry.months.map((m: string) => MONTH_MAP[m] ?? m).join('、');

  // 时间格式化
  const dt = new Date(entry.createdAt);
  const dtStr = `${dt.getFullYear()}/${dt.getMonth()+1}/${dt.getDate()} ${dt.getHours().toString().padStart(2,'0')}:${dt.getMinutes().toString().padStart(2,'0')}:${dt.getSeconds().toString().padStart(2,'0')}`;

  // 持仓浮盈评估
  const holdingFloatPct = s.avgHoldingCost > 0 ? ((s.finalPrice - s.avgHoldingCost) / s.avgHoldingCost * 100) : 0;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: BG_PAGE, color: TEXT_MAIN, maxWidth: 480, margin: '0 auto' }}>
      {/* 顶部导航 */}
      <div className="sticky top-0 z-20 flex items-center px-4 py-3" style={{ background: BG_WHITE, borderBottom: `1px solid ${BORDER}` }}>
        <button className="w-8 h-8 rounded-full flex items-center justify-center mr-3" onClick={() => setLocation(`/ledger/${ledgerId}/grid-simulator`)}
          style={{ background: BG_SUBTLE }}>
          <ChevronLeft className="w-5 h-5" style={{ color: TEXT_MAIN }} />
        </button>
        <div className="flex-1">
          <p className="text-sm font-bold" style={{ color: TEXT_MAIN }}>回测详情报告</p>
          <p className="text-xs" style={{ color: TEXT_MUTED }}>2025年 {monthLabels} · {dtStr}</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-bold" style={{ color: profitColor(s.roi) }}>{fmtPct(s.roi)}</p>
          <p className="text-xs" style={{ color: TEXT_MUTED }}>整体收益率</p>
        </div>
      </div>

      <div className="flex-1 px-4 py-4 pb-8">

        {/* ── 核心结果横幅 ── */}
        <div className="rounded-xl p-4 mb-3 flex items-center justify-between" style={{ background: s.roi >= 0 ? '#fef2f2' : '#f0fdf4', border: `1px solid ${s.roi >= 0 ? '#fecaca' : '#bbf7d0'}` }}>
          <div>
            <p className="text-xs mb-1" style={{ color: TEXT_MUTED }}>整体净利润</p>
            <p className="text-2xl font-bold" style={{ color: profitColor(s.totalNet) }}>{fmtSign(s.totalNet)}</p>
            <p className="text-xs mt-1" style={{ color: TEXT_MUTED }}>总资金池 {fmtU(totalPool)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs mb-1" style={{ color: TEXT_MUTED }}>年化收益率</p>
            <p className="text-xl font-bold" style={{ color: profitColor(s.annualizedRoi) }}>{fmtPct(s.annualizedRoi)}</p>
            <p className="text-xs mt-1" style={{ color: TEXT_MUTED }}>回测 {s.klineCount?.toLocaleString()} 根K线</p>
          </div>
        </div>

        {/* ── 回测配置 ── */}
        <SectionCard icon={<Settings className="w-4 h-4" />} title="回测配置">
          {[
            { label: '回测时段', value: `2025年 ${monthLabels}` },
            { label: '价格基准点', value: `${p.initialPrice.toLocaleString()} u` },
            { label: '每档间隔', value: `${p.gridInterval} u` },
            { label: '向上档数', value: `${p.numGridsUp} 档（最高 ${p.initialPrice + p.gridInterval * p.numGridsUp} u）` },
            { label: '向下档数', value: `${p.numGridsDown} 档（最低 ${p.initialPrice - p.gridInterval * p.numGridsDown} u）` },
            { label: '参与者岗位', value: `${totalSlots} 人` },
            { label: '每档投入资金', value: fmtU(entry.perSlotFund) },
            { label: '总资金池', value: fmtU(totalPool) },
            { label: '执行者保留', value: `${Math.round(p.executorShare * 100)}%` },
            { label: '公共资金池', value: `${Math.round(p.poolShare * 100)}%` },
            { label: '再分配比例', value: `${Math.round(p.redistributionShare * 100)}%` },
            { label: '衰减系数 r', value: `${p.decayFactor}` },
          ].map((item, idx) => (
            <DataRow key={item.label} label={item.label} value={item.value} isOdd={idx % 2 !== 0} />
          ))}
        </SectionCard>

        {/* ── 币价走势 ── */}
        <SectionCard icon={<TrendingUp className="w-4 h-4" />} title="币价走势">
          {[
            { label: '开始币价', value: `${s.startPrice.toFixed(0)} u` },
            { label: '期末币价', value: `${s.finalPrice.toFixed(0)} u`, color: profitColor(s.priceChange) },
            { label: '币价涨跌幅', value: fmtPct(s.priceChange), color: profitColor(s.priceChange) },
            { label: '回测最高价', value: `${s.priceHigh.toFixed(0)} u` },
            { label: '回测最低价', value: `${s.priceLow.toFixed(0)} u` },
            { label: '价格振幅', value: s.startPrice > 0 ? `${((s.priceHigh - s.priceLow) / s.startPrice * 100).toFixed(1)}%` : '—' },
          ].map((item: any, idx) => (
            <DataRow key={item.label} label={item.label} value={item.value} valueColor={item.color} isOdd={idx % 2 !== 0} />
          ))}
        </SectionCard>

        {/* ── 风险指标 ── */}
        <SectionCard icon={<Shield className="w-4 h-4" />} title="风险指标">
          <div className="p-3 grid grid-cols-2 gap-2">
            <MetricCard
              label="夏普比率 Sharpe"
              value={fmt2(s.sharpeRatio ?? 0)}
              rating={sharpeLabel(s.sharpeRatio ?? 0)}
              desc="每单位总波动的超额收益，>1 为良好"
            />
            <MetricCard
              label="索提诺比率 Sortino"
              value={fmt2(s.sortinoRatio ?? 0)}
              rating={sharpeLabel(s.sortinoRatio ?? 0)}
              desc="仅考虑下行风险，比夏普更真实"
            />
            <MetricCard
              label="卡玛比率 Calmar"
              value={fmt2(s.calmarRatio ?? 0)}
              rating={calmarLabel(s.calmarRatio ?? 0)}
              desc="收益率 / 最大回撤，>1 为良好"
            />
            <MetricCard
              label="最大回撤"
              value={`${(s.maxDrawdown ?? 0).toFixed(2)}%`}
              desc={`发生时价格约 ${(s.maxDrawdownPrice ?? 0).toFixed(0)} u`}
            />
          </div>
          <DataRow label="最大回撤" value={`${(s.maxDrawdown ?? 0).toFixed(2)}%`} valueColor={s.maxDrawdown > 20 ? GREEN : s.maxDrawdown > 10 ? '#d97706' : RED} note="组合净值从高点的最大跌幅" isOdd={false} />
          <DataRow label="最大回撤时价格" value={`${(s.maxDrawdownPrice ?? 0).toFixed(0)} u`} isOdd={true} />
          <DataRow label="年化收益率" value={fmtPct(s.annualizedRoi ?? 0)} valueColor={profitColor(s.annualizedRoi ?? 0)} note="按525600分钟/年折算" isOdd={false} />
        </SectionCard>

        {/* ── 交易质量 ── */}
        <SectionCard icon={<BarChart2 className="w-4 h-4" />} title="交易质量">
          {[
            { label: '总买入次数', value: `${(s.totalBuyTrades ?? 0).toLocaleString()} 次` },
            { label: '总止盈次数', value: `${s.totalSellTrades.toLocaleString()} 次` },
            { label: '胜率', value: `${(s.winRate ?? 0).toFixed(1)}%`, color: (s.winRate ?? 0) >= 60 ? RED : TEXT_MAIN, note: '止盈次数 / 买入次数' },
            { label: '盈亏比 Profit Factor', value: fmt2(s.profitFactor ?? 0), color: (s.profitFactor ?? 0) >= 1.5 ? RED : TEXT_MAIN, note: '总毛利 / 总亏损' },
            { label: '平均每次止盈收益', value: fmtU(s.avgProfitPerTrade ?? 0) },
            { label: '公共资金池累计', value: fmtU(s.publicPool) },
            { label: '资金利用率', value: `${(s.capitalUtilization ?? 0).toFixed(1)}%`, note: '实际动用资金 / 总资金池' },
          ].map((item: any, idx) => (
            <DataRow key={item.label} label={item.label} value={item.value} valueColor={item.color} note={item.note} isOdd={idx % 2 !== 0} />
          ))}
        </SectionCard>

        {/* ── 期末持仓分析 ── */}
        <SectionCard icon={<Activity className="w-4 h-4" />} title="期末持仓分析">
          {[
            { label: '有持仓人数', value: `${s.holdingCount} 人`, color: s.holdingCount > 0 ? ORANGE : GREEN },
            { label: '无持仓人数', value: `${s.noHoldingCount} 人（已全部止盈）`, color: s.noHoldingCount > 0 ? RED : TEXT_MUTED },
            { label: '总持仓币数', value: `${(s.totalHoldingQty ?? 0).toFixed(2)} 枚` },
            { label: '持仓均价', value: s.avgHoldingCost > 0 ? `${s.avgHoldingCost.toFixed(1)} u` : '—' },
            { label: '期末价格', value: `${s.finalPrice.toFixed(0)} u` },
            { label: '持仓浮动盈亏', value: s.floatPnl !== undefined ? fmtSign(s.floatPnl) : '—', color: s.floatPnl !== undefined ? profitColor(s.floatPnl) : TEXT_MUTED },
            { label: '持仓浮动盈亏率', value: `${holdingFloatPct >= 0 ? '+' : ''}${holdingFloatPct.toFixed(2)}%`, color: profitColor(holdingFloatPct), note: '相对持仓均价' },
            { label: '持仓市值', value: fmtU((s.totalHoldingQty ?? 0) * s.finalPrice) },
          ].map((item: any, idx) => (
            <DataRow key={item.label} label={item.label} value={item.value} valueColor={item.color} note={item.note} isOdd={idx % 2 !== 0} />
          ))}
        </SectionCard>

        {/* ── 参与者明细 ── */}
        {entry.participants && entry.participants.length > 0 && (
          <SectionCard icon={<Users className="w-4 h-4" />} title={`参与者明细（${entry.participants.length} 人）`}>
            {/* 前5名收益排行 */}
            <div className="px-4 pt-3 pb-1">
              <p className="text-xs font-bold mb-2" style={{ color: TEXT_SUB }}>收益排行 Top 5</p>
              {[...entry.participants]
                .sort((a: any, b: any) => b.returnRate - a.returnRate)
                .slice(0, 5)
                .map((p: any, idx: number) => (
                  <div key={p.id} className="flex items-center justify-between py-1.5" style={{ borderBottom: `1px solid ${BORDER}` }}>
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold"
                        style={{ background: idx === 0 ? '#fef3c7' : idx === 1 ? '#f3f4f6' : idx === 2 ? '#fef3c7' : BG_SUBTLE, color: idx < 3 ? '#d97706' : TEXT_MUTED }}>
                        {idx + 1}
                      </span>
                      <span className="text-xs" style={{ color: TEXT_MAIN }}>{p.id}号 · 承诺价 {p.commitPrice.toLocaleString()} u</span>
                    </div>
                    <span className="text-xs font-bold" style={{ color: profitColor(p.returnRate) }}>{fmtPct(p.returnRate)}</span>
                  </div>
                ))}
            </div>

            {/* 展开/收起全部 */}
            <button
              className="w-full py-2.5 text-xs font-bold"
              style={{ color: ACCENT, borderTop: `1px solid ${BORDER}`, background: ACCENT_BG }}
              onClick={() => setExpandedParticipants(v => !v)}
            >
              {expandedParticipants ? '收起全部参与者 ▲' : `展开全部 ${entry.participants.length} 位参与者 ▼`}
            </button>

            {expandedParticipants && entry.participants.map((p: any, idx: number) => {
              const isBase = p.commitPrice === entry.params.initialPrice;
              return (
                <div key={p.id} style={{ borderTop: `1px solid ${BORDER}`, background: isBase ? ORANGE_BG : idx % 2 === 0 ? BG_WHITE : BG_SUBTLE }}>
                  {/* 参与者标题行 */}
                  <div className="flex items-center justify-between px-4 py-2">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold"
                        style={{ background: isBase ? ORANGE : ACCENT, color: '#fff' }}>{p.id}</span>
                      <div>
                        <span className="text-xs font-bold" style={{ color: isBase ? ORANGE : TEXT_MAIN }}>
                          承诺价 {p.commitPrice.toLocaleString()} u
                          {isBase && <span className="ml-1 text-xs px-1 py-0.5 rounded" style={{ background: ORANGE, color: '#fff' }}>现价买入</span>}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold" style={{ color: profitColor(p.netProfit) }}>{fmtSign(p.netProfit)}</p>
                      <p className="text-xs" style={{ color: profitColor(p.returnRate) }}>{fmtPct(p.returnRate)}</p>
                    </div>
                  </div>
                  {/* 参与者详情 */}
                  <div className="grid grid-cols-2 gap-0 px-4 pb-2">
                    {[
                      { k: '初始出资', v: fmtU(p.initialCash) },
                      { k: '买入枚数/次', v: `${p.qty.toFixed(1)} 枚` },
                      { k: '买入次数', v: `${p.buyCount} 次` },
                      { k: '止盈次数', v: `${p.sellCount} 次` },
                      { k: '执行者利润', v: fmtU(p.execIncome) },
                      { k: '衰减再分配', v: fmtU(p.redistIncome) },
                      { k: '期末持仓', v: p.holdingQty > 0 ? `${p.holdingQty.toFixed(1)} 枚` : '无持仓' },
                      { k: '持仓市值', v: p.holdingQty > 0 ? fmtU(p.holdingValue) : '—' },
                      { k: '期末总资产', v: fmtU(p.totalAssets) },
                      { k: '净利润', v: fmtSign(p.netProfit), c: profitColor(p.netProfit) },
                    ].map((item: any) => (
                      <div key={item.k} className="py-1">
                        <p className="text-xs" style={{ color: TEXT_MUTED }}>{item.k}</p>
                        <p className="text-xs font-bold" style={{ color: item.c ?? TEXT_MAIN }}>{item.v}</p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </SectionCard>
        )}

        {/* ── 策略评估总结 ── */}
        <SectionCard icon={<Award className="w-4 h-4" />} title="策略综合评估">
          <div className="p-4 space-y-2">
            {/* 收益评估 */}
            <div className="rounded-lg p-3" style={{ background: BG_SUBTLE }}>
              <p className="text-xs font-bold mb-1" style={{ color: TEXT_SUB }}>收益表现</p>
              <p className="text-xs" style={{ color: TEXT_MUTED }}>
                本次回测整体收益率 <span style={{ color: profitColor(s.roi), fontWeight: 'bold' }}>{fmtPct(s.roi)}</span>，
                年化收益率 <span style={{ color: profitColor(s.annualizedRoi), fontWeight: 'bold' }}>{fmtPct(s.annualizedRoi)}</span>。
                共触发止盈 <span style={{ fontWeight: 'bold' }}>{s.totalSellTrades}</span> 次，
                胜率 <span style={{ fontWeight: 'bold' }}>{(s.winRate ?? 0).toFixed(1)}%</span>。
              </p>
            </div>
            {/* 风险评估 */}
            <div className="rounded-lg p-3" style={{ background: BG_SUBTLE }}>
              <p className="text-xs font-bold mb-1" style={{ color: TEXT_SUB }}>风险评估</p>
              <p className="text-xs" style={{ color: TEXT_MUTED }}>
                最大回撤 <span style={{ color: s.maxDrawdown > 20 ? GREEN : '#d97706', fontWeight: 'bold' }}>{(s.maxDrawdown ?? 0).toFixed(2)}%</span>，
                夏普比率 <span style={{ color: ACCENT, fontWeight: 'bold' }}>{fmt2(s.sharpeRatio ?? 0)}</span>（{sharpeLabel(s.sharpeRatio ?? 0).text}），
                卡玛比率 <span style={{ color: ACCENT, fontWeight: 'bold' }}>{fmt2(s.calmarRatio ?? 0)}</span>（{calmarLabel(s.calmarRatio ?? 0).text}）。
                {(s.maxDrawdown ?? 0) > 20 && <span style={{ color: GREEN }}> 最大回撤偏高，建议适当缩小档数范围或增加每档间隔。</span>}
              </p>
            </div>
            {/* 持仓评估 */}
            <div className="rounded-lg p-3" style={{ background: BG_SUBTLE }}>
              <p className="text-xs font-bold mb-1" style={{ color: TEXT_SUB }}>期末持仓</p>
              <p className="text-xs" style={{ color: TEXT_MUTED }}>
                期末 <span style={{ fontWeight: 'bold' }}>{s.holdingCount}</span> 人持仓，
                <span style={{ fontWeight: 'bold' }}>{s.noHoldingCount}</span> 人已全部止盈。
                {s.holdingCount > 0 && <>
                  持仓均价 <span style={{ fontWeight: 'bold' }}>{s.avgHoldingCost.toFixed(1)} u</span>，
                  相对期末价格浮动 <span style={{ color: profitColor(holdingFloatPct), fontWeight: 'bold' }}>{holdingFloatPct >= 0 ? '+' : ''}{holdingFloatPct.toFixed(2)}%</span>。
                </>}
              </p>
            </div>
          </div>
        </SectionCard>

      </div>
    </div>
  );
}


