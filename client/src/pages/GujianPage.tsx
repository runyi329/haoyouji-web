/**
 * GujianPage.tsx
 * 谷间优筹 — 美股精选保本增值计划
 * 布局：顶部导航 → 行情选股 → 下单面板 → 我的订单列表
 */
import React, { useState, useEffect, useMemo } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { ChevronLeft, TrendingUp, TrendingDown, Loader2, RefreshCw, ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import { toast } from "sonner";

// ─── 精选股票池配置 ────────────────────────────────────────────────
const CRYPTO_ICONS: Record<string, string> = {
  BTC: "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/icons/btc-3d-icon.webp",
  ETH: "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/icons/eth-3d-icon.webp",
  SOL: "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/icons/sol-3d-icon.webp",
};

const US_STOCKS = [
  { symbol: "NVDA",  name: "NVIDIA",          nameCn: "英伟达",       logo: "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/icons/nvda-3d-icon.webp" },
  { symbol: "AAPL",  name: "Apple",           nameCn: "苹果",         logo: "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/icons/aapl-3d-icon.webp" },
  { symbol: "MSFT",  name: "Microsoft",       nameCn: "微软",         logo: "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/icons/msft-3d-icon.webp" },
  { symbol: "TSLA",  name: "Tesla",           nameCn: "特斯拉",       logo: "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/icons/tsla-3d-icon.webp" },
  { symbol: "AMZN",  name: "Amazon",          nameCn: "亚马逊",       logo: "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/icons/amzn-3d-icon.webp" },
  { symbol: "META",  name: "Meta",            nameCn: "Meta",         logo: "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/icons/meta-3d-icon.webp" },
  { symbol: "GOOGL", name: "Google",          nameCn: "谷歌",         logo: "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/icons/googl-3d-icon.webp" },
  { symbol: "NFLX",  name: "Netflix",         nameCn: "奈飞",         logo: "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/icons/nflx-3d-icon.webp" },
  { symbol: "AMD",   name: "AMD",             nameCn: "超微半导体",   logo: "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/icons/amd-3d-icon.webp" },
  { symbol: "INTC",  name: "Intel",           nameCn: "英特尔",       logo: "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/icons/intc-3d-icon.webp" },
  { symbol: "COIN",  name: "Coinbase",        nameCn: "Coinbase",     logo: "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/icons/coin-3d-icon.webp" },
  { symbol: "PLTR",  name: "Palantir",        nameCn: "Palantir",     logo: "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/icons/pltr-3d-icon.webp" },
  { symbol: "ORCL",  name: "Oracle",          nameCn: "甲骨文",       logo: "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/icons/orcl-3d-icon.webp" },
  { symbol: "MSTR",  name: "MicroStrategy",   nameCn: "微策略",       logo: "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/icons/mstr-3d-icon.webp" },
  { symbol: "TSM",   name: "TSMC",            nameCn: "台积电",       logo: "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/icons/tsm-3d-icon.webp" },
  { symbol: "HOOD",  name: "Robinhood",       nameCn: "Robinhood",    logo: "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/icons/hood-3d-icon.webp" },
  { symbol: "WDC",   name: "Western Digital", nameCn: "西部数据",     logo: "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/icons/wdc-3d-icon.webp" },
  { symbol: "SNDK",  name: "SanDisk",         nameCn: "闪迪",         logo: "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/icons/sndk-3d-icon.webp" },
];

// 分配规则（上行分成）
const PROFIT_RULES = [
  { months: 12, growth: 100, ratio: 95 },
  { months: 9,  growth: 75,  ratio: 85 },
  { months: 6,  growth: 50,  ratio: 75 },
  { months: 3,  growth: 25,  ratio: 65 },
];

// 保本规则（下行保障）
const PROTECT_RULES = [
  { months: 12, protect: 100 },
  { months: 9,  protect: 75 },
  { months: 6,  protect: 50 },
  { months: 3,  protect: 25 },
];

// 计算当前应得分成比例
function calcCurrentRatio(createdAt: string | Date, buyPrice: number, currentPrice: number) {
  const start = new Date(createdAt);
  const now = new Date();
  const monthsHeld = (now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 30);
  const growthPct = buyPrice > 0 ? ((currentPrice - buyPrice) / buyPrice) * 100 : 0;
  // 按规则从高到低匹配
  for (const rule of PROFIT_RULES) {
    if (monthsHeld >= rule.months || growthPct >= rule.growth) {
      return { ratio: rule.ratio, monthsHeld: Math.floor(monthsHeld), growthPct };
    }
  }
  // 未达到最低档
  return { ratio: 0, monthsHeld: Math.floor(monthsHeld), growthPct };
}

// 计算保本比例
function calcProtectRatio(createdAt: string | Date) {
  const start = new Date(createdAt);
  const now = new Date();
  const monthsHeld = (now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 30);
  for (const rule of PROTECT_RULES) {
    if (monthsHeld >= rule.months) return rule.protect;
  }
  return 0;
}

// ─── 收益权档位表常量（与 CryptoPrediction 一致）────────────────────────
const TIER_LABELS = [
  { tier: 1, drop: '-10%', ratio: '1/2', pct: '66.7%' },
  { tier: 2, drop: '-20%', ratio: '1/3', pct: '44.4%' },
  { tier: 3, drop: '-30%', ratio: '1/4', pct: '33.3%' },
  { tier: 4, drop: '-40%', ratio: '1/5', pct: '26.7%' },
  { tier: 5, drop: '-50%', ratio: '1/6', pct: '22.2%' },
  { tier: 6, drop: '-60%', ratio: '1/7', pct: '19.0%' },
  { tier: 7, drop: '-70%', ratio: '1/8', pct: '16.7%' },
  { tier: 8, drop: '-80%', ratio: '1/9', pct: '14.8%' },
  { tier: 9, drop: '-90%', ratio: '1/10', pct: '13.3%' },
];

// ─── 谷底增筹订单展开详情子组件（与 CryptoPrediction OrderDetail 一致）────
function GudizengchouDetail({ order, ledgerId }: { order: any; ledgerId: number }) {
  const { data: tierData, isLoading: tierLoading } = trpc.ledger.afGetTierData.useQuery(
    { orderId: order.id, ledgerId },
    { enabled: order.side === 'buy', staleTime: 8000, refetchInterval: 3000, refetchOnWindowFocus: false }
  );
  // 走服务器tRPC获取币价（price-scanner缓存，3秒刷新）
  const { data: cryptoPricesRaw } = trpc.getCryptoPrices.useQuery(undefined, { refetchInterval: 3000, staleTime: 2000 });
  const _prices = (cryptoPricesRaw as any)?.prices ?? cryptoPricesRaw;
  const livePrice = _prices?.[order.coin] ?? 0;
  const cancelMutation = trpc.ledger.afCancelOrder.useMutation({
    onSuccess: () => { toast.success('委托已撤销'); },
    onError: (e) => toast.error('撤单失败', { description: e.message }),
  });
  const triggeredTiers = new Set((tierData?.triggers || []).map((t: any) => t.tier));
  const maxTriggered = triggeredTiers.size > 0 ? Math.max(...Array.from(triggeredTiers)) : 0;
  const currentTier = maxTriggered;
  const isContract = !order.orderType || order.orderType === '无损合约';
  // 生成订单编号
  const orderDate = new Date(order.createdAt);
  const yy = String(orderDate.getFullYear()).slice(2);
  const mm = String(orderDate.getMonth() + 1).padStart(2, '0');
  const dd = String(orderDate.getDate()).padStart(2, '0');
  const orderNo = `AF${yy}${mm}${dd}${String(order.id).padStart(6, '0')}`;
  const statusLabel =
    order.sellStatus === 'sold' ? '已卖出' :
    order.sellStatus === 'selling' ? '委卖中' :
    order.status === 'completed' ? '持仓中' :
    order.status === 'cancelled' ? '已撤单' : '委买中';
  const statusColor =
    order.sellStatus === 'sold' ? '#6B7280' :
    order.sellStatus === 'selling' ? '#EF4444' :
    order.status === 'completed' ? '#0EA56A' :
    order.status === 'cancelled' ? '#94A3B8' : '#F59E0B';
  const amount = parseFloat(order.amount);
  const tradeValue = order.isGift ? amount : amount * 5.25;
  const dailyFee = tradeValue / 0.75 * 0.12 / 365;
  // 已撤单的委买订单：管理费为0（撤单时全额退回本金，未实际收取管理费）
  const isCancelledBuy = order.status === 'cancelled';
  const startDate = new Date(order.createdAt);
  const startDay = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const endDate = order.sellStatus === 'sold' && order.sellConfirmedAt ? new Date(order.sellConfirmedAt) : new Date();
  const endDay = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
  endDay.setHours(0, 0, 0, 0);
  const holdDays = isCancelledBuy ? 0 : Math.max(1, Math.floor((endDay.getTime() - startDay.getTime()) / (1000 * 60 * 60 * 24)) + 1);
  const totalFee = isCancelledBuy ? 0 : dailyFee * holdDays;
  const timeStr = new Date(order.createdAt).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <div className="px-4 pb-4 space-y-2" style={{ backgroundColor: '#FFF7ED' }}>
      <div className="h-px" style={{ backgroundColor: '#FED7AA' }} />
      {/* 基本信息 */}
      <div className="mt-2 rounded-xl p-3 space-y-2 text-[13px]" style={{ backgroundColor: '#FFFFFF', border: '1px solid #FED7AA', boxShadow: '0 2px 8px rgba(217,119,6,0.06)' }}>
        <div className="space-y-2">
          {/* 币种 */}
          <div className="flex justify-between items-center">
            <span className="text-[#9CA3AF]">币种</span>
            <span className="text-[#1E293B] font-medium">
              <span className="px-1.5 py-0.5 rounded text-[11px] font-semibold mr-1.5"
                style={{ backgroundColor: order.side === 'buy' ? '#EFF6FF' : '#FEF2F2', color: order.side === 'buy' ? '#1A56DB' : '#EF4444' }}>
                {order.side === 'buy' ? '买' : '卖'}
              </span>
              {order.coin}
            </span>
          </div>
          {/* 成交价格 */}
          <div className="flex justify-between items-center">
            <span className="text-[#9CA3AF]">成交价格</span>
            <span className="text-[#1E293B]">{parseFloat(order.limitPrice).toLocaleString()} USDT</span>
          </div>
          {/* 实际投入 */}
          <div className="flex justify-between items-center">
            <span className="text-[#9CA3AF]">实际投入</span>
            <span className="text-[#1E293B]">{amount.toFixed(2)} USDT</span>
          </div>
          {/* 成交价值 */}
          {!order.isGift && (
            <div className="flex justify-between items-center">
              <span className="text-[#9CA3AF]">成交价值</span>
              <span className="font-semibold text-[#1A56DB]">
                {tradeValue.toFixed(2)} USDT
                <span className="ml-1 text-[11px] font-normal opacity-60">(×5.25)</span>
              </span>
            </div>
          )}
          {/* 持仓数量 */}
          <div className="flex justify-between items-center">
            <span className="text-[#9CA3AF]">持仓数量</span>
            <span>
              <span className="text-[11px] text-[#9CA3AF]">{tradeValue.toFixed(2)} ÷ {parseFloat(order.limitPrice).toLocaleString()} = </span>
              <span className="text-[#1E293B] font-medium">{parseFloat(order.quantity).toFixed(8).replace(/\.?0+$/, '')} {order.coin}</span>
            </span>
          </div>
          {/* 管理费 */}
          <div className="flex justify-between items-center">
            <span className="text-[#9CA3AF]">管理费</span>
            <span className="text-[#1E293B] font-medium">
              {isCancelledBuy ? '0 u（已撤单）' : `${dailyFee.toFixed(4)}u × ${holdDays}天 = ${totalFee.toFixed(4)}u`}
            </span>
          </div>
          {/* 类型/状态 */}
          <div className="flex justify-between items-center">
            <span className="text-[#9CA3AF]">类型 / 状态</span>
            <span className="text-[#1E293B] flex items-center gap-1.5">
              谷底增筹
              <span className="mx-0.5 text-[#CBD5E1]">·</span>
              <span style={{ color: statusColor }}>{statusLabel}</span>
              <span className="mx-0.5 text-[#CBD5E1]">·</span>
              {tierData?.tierMode === 'linear'
                ? <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: '#EFF6FF', color: '#3B82F6', border: '1px solid #BFDBFE' }}>线性档位</span>
                : <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: '#FFF7ED', color: '#D97706', border: '1px solid #FED7AA' }}>阶梯档位</span>
              }
            </span>
          </div>
          {/* 卖出信息 */}
          {(order.sellStatus === 'selling' || order.sellStatus === 'sold') && (
            <div className="flex justify-between items-center">
              <span className="text-[#9CA3AF]">委卖价格</span>
              <span className="text-[#EF4444] font-medium">{parseFloat(order.sellPrice).toLocaleString()} USDT</span>
            </div>
          )}
          {order.sellStatus === 'sold' && order.sellConfirmedAt && (
            <div className="flex justify-between items-center">
              <span className="text-[#9CA3AF]">卖出时间</span>
              <span className="text-[#64748B]">{order.sellConfirmedAt}</span>
            </div>
          )}
          {/* 开仓时间 */}
          <div className="flex justify-between items-center">
            <span className="text-[#9CA3AF]">开仓时间</span>
            <span className="text-[#64748B]">{timeStr}</span>
          </div>
          {/* 登记时间（管理员确认成交的时间） */}
          {order.confirmedAt && (
            <div className="flex justify-between items-center">
              <span className="text-[#9CA3AF]">登记时间</span>
              <span className="text-[#64748B]">{order.confirmedAt}</span>
            </div>
          )}
          {/* 订单编号 + 撤单 */}
          <div className="flex justify-between items-center">
            <span className="text-[#9CA3AF]">订单编号</span>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[12px] text-[#64748B] tracking-wide">{orderNo}</span>
              {(order.status === 'pending' || order.sellStatus === 'selling') && (
                <button
                  onClick={() => {
                    const msg = order.sellStatus === 'selling' ? '确认撤销委托卖出？' : '确认撤销该委托单？';
                    if (window.confirm(msg)) { cancelMutation.mutate({ ledgerId, orderId: order.id }); }
                  }}
                  disabled={cancelMutation.isPending}
                  className="text-xs font-medium px-2 py-0.5 rounded border"
                  style={{ color: '#EF4444', borderColor: '#FECACA', backgroundColor: '#FEF2F2' }}>
                  {cancelMutation.isPending ? '撤销中...' : order.sellStatus === 'selling' ? '撤卖' : '撤单'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
      {/* 收益权档位表（谷底增筹买单均显示） */}
      {isContract && order.side === 'buy' && (
        <div className="rounded-xl p-3" style={{ backgroundColor: '#FFFFFF', border: '1px solid #FED7AA' }}>
          {/* 扫描状态栏 */}
          <div className="flex items-center justify-between mb-2">
            <span className="font-semibold" style={{ color: '#D97706' }}>收益权扫描</span>
            {order.sellStatus === 'sold' ? (
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ backgroundColor: '#6B7280' }} />
                <span className="text-xs" style={{ color: '#6B7280' }}>已结束</span>
              </div>
            ) : tierData?.scanStatus ? (
              <div className="flex items-center gap-1">
                {tierData.scanStatus.scanning ? (
                  <><Loader2 className="w-2.5 h-2.5 animate-spin" style={{ color: '#F59E0B' }} />
                  <span className="text-xs" style={{ color: '#F59E0B' }}>扫描中...</span></>
                ) : (
                  <><span className="w-1.5 h-1.5 rounded-full inline-block animate-pulse" style={{ backgroundColor: '#0EA56A' }} />
                  <span className="text-xs" style={{ color: '#0EA56A' }}>实时扫描中</span></>
                )}
              </div>
            ) : tierLoading ? (
              <span className="text-xs" style={{ color: '#9CA3AF' }}>加载中...</span>
            ) : (
              <span className="text-xs" style={{ color: '#9CA3AF' }}>等待扫描</span>
            )}
          </div>
          {/* 扫描信息 */}
          {(tierData?.scanStatus?.lastScanAt || (tierData?.scanCount ?? 0) > 0) ? (
            <div className="rounded-lg px-3 py-2 mb-2 text-[12px]" style={{ backgroundColor: '#FFF7ED' }}>
              <div className="grid gap-y-1.5" style={{ gridTemplateColumns: '3.5rem 1fr auto' }}>
                <span className="text-[#9CA3AF]">累计扫描</span>
                <span className="font-semibold text-[#D97706]">{tierData?.scanCount ?? 0} 次</span>
                <span className="text-[#94A3B8] text-right">每10秒一次</span>
                {(tierData?.latestLowPrice || tierData?.scanStatus?.lastScanAt) && (
                  <>
                    <span className="text-[#9CA3AF]">上次扫描</span>
                    <span className="font-semibold text-[#EF4444]">
                      {tierData?.latestLowPrice ? `${parseFloat(tierData.latestLowPrice).toLocaleString()} USDT` : '--'}
                    </span>
                    <span className="text-[#94A3B8] text-right">
                      {tierData?.scanStatus?.lastScanAt
                        ? new Date(tierData.scanStatus.lastScanAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
                        : '--'}
                    </span>
                  </>
                )}
                {tierData?.allTimeLowPrice && (
                  <>
                    <span className="text-[#9CA3AF]">历史最低</span>
                    <span className="font-semibold text-[#EF4444]">
                      {parseFloat(tierData.allTimeLowPrice).toLocaleString()} USDT
                    </span>
                    <span className="text-[#94A3B8] text-right">
                      {tierData?.allTimeLowAt
                        ? new Date(tierData.allTimeLowAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
                        : '--'}
                    </span>
                  </>
                )}
              </div>
            </div>
          ) : !tierLoading && (
            <div className="rounded-lg px-3 py-2 mb-2 text-[12px]" style={{ backgroundColor: '#FFF7ED' }}>
              <div className="flex justify-between items-center">
                <span className="text-[#9CA3AF] w-14 shrink-0">累计扫描</span>
                <span>
                  <span className="text-[#CBD5E1]">0 次</span>
                  <span className="text-[#CBD5E1] mx-1.5">·</span>
                  <span className="text-[#94A3B8]">每10秒一次</span>
                </span>
              </div>
            </div>
          )}
          {/* 收益权档位表 */}
          <div className="mb-1.5 text-sm" style={{ color: '#6B7A9A' }}>收益权档位表</div>
          {tierData?.tierMode === 'linear' ? (() => {
            // ===== 线性模式档位表 =====
            const buyPrice = parseFloat(order.limitPrice);
            const allTimeLow = tierData?.allTimeLowPrice ? parseFloat(String(tierData.allTimeLowPrice)) : 0;
            // 精确到0.01%的实际跌幅
            const currentDropPct = (buyPrice > 0 && allTimeLow > 0)
              ? Math.max(0, (buyPrice - allTimeLow) / buyPrice * 100)
              : 0;
            const currentEquityPct = Math.max(0, 100 - currentDropPct);
            // 只生成已触发的整数节点：每1%一行
            const maxDropInt = Math.floor(currentDropPct);
            const nodes1pct = Array.from({ length: maxDropInt }, (_, i) => i + 1);
            return (
              <>
                <div className="grid grid-cols-3 text-xs mb-1 px-1" style={{ color: '#9CA3AF' }}>
                  <span>跌幅</span>
                  <span className="text-center">收益权</span>
                  <span className="text-right">对应价格</span>
                </div>
                {/* 基准行 */}
                <div className="grid grid-cols-3 items-center py-1 px-1 rounded-lg mb-0.5"
                  style={currentDropPct < 1
                    ? { backgroundColor: 'rgba(14,165,106,0.1)', border: '1px solid rgba(14,165,106,0.4)' }
                    : { backgroundColor: '#FFF7ED' }}>
                  <span style={{ color: currentDropPct < 1 ? '#0EA56A' : '#9CA3AF', fontWeight: currentDropPct < 1 ? 600 : 400 }}>基准</span>
                  <span className="text-center font-semibold" style={{ color: currentDropPct < 1 ? '#0EA56A' : '#9CA3AF' }}>100%</span>
                  <span className="text-right" style={{ color: '#C0C8D8' }}>{buyPrice > 0 ? buyPrice.toLocaleString() : '--'}</span>
                </div>
                {/* 每1%一行，只显示已触发的整数节点 */}
                {nodes1pct.map((dropInt) => {
                  const nodePrice = buyPrice > 0 ? (buyPrice * (1 - dropInt / 100)).toFixed(2) : '--';
                  const equityAtNode = 100 - dropInt;
                  const isLastNode = dropInt === maxDropInt;
                  return (
                    <div key={dropInt} className="grid grid-cols-3 items-center py-1 px-1 rounded-lg mb-0.5"
                      style={isLastNode
                        ? { backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)' }
                        : { backgroundColor: '#FEF3C7' }}>
                      <span style={{ color: isLastNode ? '#EF4444' : '#D97706', fontWeight: isLastNode ? 600 : 400 }}>-{dropInt}%</span>
                      <span className="text-center font-semibold" style={{ color: isLastNode ? '#EF4444' : '#D97706' }}>{equityAtNode}%</span>
                      <span className="text-right" style={{ color: '#EF4444' }}>{nodePrice !== '--' ? parseFloat(nodePrice).toLocaleString() : '--'}</span>
                    </div>
                  );
                })}
                {/* 当前精确节点行（跌幅有小数时额外显示实时精确值） */}
                {currentDropPct > 0 && currentDropPct % 1 > 0.005 && (
                  <div className="grid grid-cols-3 items-center py-1 px-1 rounded-lg mb-0.5"
                    style={{ backgroundColor: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.5)' }}>
                    <span style={{ color: '#EF4444', fontWeight: 700 }}>-{currentDropPct.toFixed(2)}%</span>
                    <span className="text-center font-bold" style={{ color: '#EF4444' }}>{currentEquityPct.toFixed(2)}%</span>
                    <span className="text-right" style={{ color: '#EF4444' }}>
                      {allTimeLow > 0 ? allTimeLow.toLocaleString('zh-CN', { maximumFractionDigits: 2 }) : '--'}
                    </span>
                  </div>
                )}
              </>
            );
          })() : (
            <>
              <div className="grid grid-cols-4 text-xs mb-1 px-1" style={{ color: '#9CA3AF' }}>
                <span>跌幅档</span>
                <span className="text-center">收益权</span>
                <span className="text-center">触发时间</span>
                <span className="text-right">触发价格</span>
              </div>
              {/* 基准档 */}
              <div className="grid grid-cols-4 items-center py-1 px-1 rounded-lg mb-0.5"
                style={currentTier === 0
                  ? { backgroundColor: 'rgba(14,165,106,0.1)', border: '1px solid rgba(14,165,106,0.4)' }
                  : { backgroundColor: '#FFF7ED' }}>
                <span style={{ color: currentTier === 0 ? '#0EA56A' : '#9CA3AF', fontWeight: currentTier === 0 ? 600 : 400 }}>基准</span>
                <span className="text-center font-semibold" style={{ color: currentTier === 0 ? '#0EA56A' : '#9CA3AF' }}>100%</span>
                <span className="text-center" style={{ color: '#C0C8D8' }}>--</span>
                <span className="text-right" style={{ color: '#C0C8D8' }}>{parseFloat(order.limitPrice).toLocaleString()}</span>
              </div>
              {/* 9档 */}
              {TIER_LABELS.map(({ tier, drop, pct }) => {
                const trigger = (tierData?.triggers || []).find((t: any) => t.tier === tier);
                const isCurrentTier = currentTier === tier;
                const isTriggered = triggeredTiers.has(tier);
                return (
                  <div key={tier} className="grid grid-cols-4 items-center py-1 px-1 rounded-lg mb-0.5"
                    style={isCurrentTier
                      ? { backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)' }
                      : isTriggered
                      ? { backgroundColor: '#FEF3C7' }
                      : { backgroundColor: '#FFF7ED' }}>
                    <span style={{ color: isCurrentTier ? '#EF4444' : isTriggered ? '#D97706' : '#C0C8D8', fontWeight: isCurrentTier ? 600 : 400 }}>{drop}</span>
                    <span className="text-center font-semibold" style={{ color: isCurrentTier ? '#EF4444' : isTriggered ? '#D97706' : '#C0C8D8' }}>{pct}</span>
                    <span className="text-center text-xs" style={{ color: isTriggered ? '#9CA3AF' : '#D0DBFF' }}>
                      {trigger ? new Date(trigger.triggeredAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '--'}
                    </span>
                    <span className="text-right" style={{ color: isTriggered ? '#EF4444' : '#C0C8D8' }}>
                      {trigger
                        ? parseFloat(trigger.triggerPrice).toLocaleString()
                        : parseFloat(order.limitPrice) > 0
                          ? (parseFloat(order.limitPrice) * (1 - tier * 0.1)).toFixed(2)
                          : '--'
                      }
                    </span>
                  </div>
                );
              })}
            </>
          )}
          {/* 当前收益权摘要 + 市值 + 管理费 */}
          <div className="mt-2 rounded-lg p-3" style={{ backgroundColor: '#FEF3C7' }}>
            {(() => {
              const qty = parseFloat(order.quantity);
              // 线性模式：用历史最低价计算收益权
              let pctStr: string;
              let pct: number;
              if (tierData?.tierMode === 'linear') {
                const buyP = parseFloat(order.limitPrice);
                const allLow = tierData?.allTimeLowPrice ? parseFloat(String(tierData.allTimeLowPrice)) : 0;
                const linearRate = (buyP > 0 && allLow > 0) ? Math.max(0, 1 - (buyP - allLow) / buyP) : 1;
                pct = linearRate;
                pctStr = (linearRate * 100).toFixed(2) + '%';
              } else {
                pctStr = currentTier === 0 ? '100%' : (TIER_LABELS[currentTier - 1]?.pct || '100%');
                pct = parseFloat(pctStr) / 100;
              }
              const remaining = qty * pct;
              const displayRemaining = remaining.toFixed(6).replace(/[.]?0+$/, '');
              const displayQty = qty.toFixed(6).replace(/[.]?0+$/, '');
              const scanPrice = tierData?.scanStatus?.lowestPrice ? parseFloat(String(tierData.scanStatus.lowestPrice))
                : (tierData?.latestLowPrice ? parseFloat(String(tierData.latestLowPrice)) : 0);
              const refPrice = livePrice > 0 ? livePrice : scanPrice;
              const refPriceLabel = livePrice > 0 ? '' : (scanPrice > 0 ? '扫描价' : '');
              const marketValue = refPrice > 0 ? remaining * refPrice : null;
              const tierColor = (tierData?.tierMode === 'linear' ? pct < 1 : currentTier > 0) ? '#EF4444' : '#0EA56A';
              const labelStyle = { color: '#6B7A9A' } as React.CSSProperties;
              const dimStyle = { color: '#9CA3AF' } as React.CSSProperties;
              return (
                <>
                  <div className="flex justify-between items-center text-xs">
                    <span style={labelStyle}>当前收益权</span>
                    <span className="font-semibold" style={{ color: tierColor }}>
                      {pctStr}
                      {tierData?.tierMode !== 'linear' && (
                        <span className="font-normal ml-1" style={dimStyle}>({currentTier === 0 ? '1/1' : TIER_LABELS[currentTier - 1]?.ratio || '--'})</span>
                      )}
                    </span>
                  </div>
                  <div className="my-1.5" style={{ borderTop: '1px solid #FCD34D' }} />
                  <div className="flex justify-between items-center text-xs">
                    <span style={labelStyle} className="shrink-0 mr-2">当前持仓数量</span>
                    <span style={dimStyle} className="text-right">{displayQty} × {pctStr} = <span className="font-semibold" style={{ color: '#1A2340' }}>{displayRemaining} {order.coin}</span></span>
                  </div>
                  <div className="flex justify-between items-center text-xs mt-1">
                    <span style={labelStyle} className="shrink-0 mr-2">当前市值{refPriceLabel ? <span style={dimStyle}> ({refPriceLabel})</span> : null}</span>
                    {marketValue !== null
                      ? <span style={dimStyle} className="text-right">{displayRemaining} × {refPrice.toLocaleString('zh-CN', { maximumFractionDigits: 2 })} = <span className="font-semibold" style={{ color: '#D97706' }}>{marketValue.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} u</span></span>
                      : <span style={dimStyle}>--</span>}
                  </div>
                  <div className="flex justify-between items-center text-xs mt-1">
                    <span style={labelStyle} className="shrink-0 mr-2">管理费</span>
                    <span style={dimStyle} className="text-right">
                      {isCancelledBuy
                        ? <span className="font-semibold" style={{ color: '#1A2340' }}>0 u（已撤单）</span>
                        : <>{dailyFee.toFixed(4)}u × {holdDays}天 = <span className="font-semibold" style={{ color: '#1A2340' }}>{totalFee.toFixed(4)}u</span></>
                      }
                    </span>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

export default function GujianPage() {
  const [, params] = useRoute("/ledger/:id/gujian");
  const [, setLocation] = useLocation();
  const ledgerId = parseInt(params?.id || "0");
  // 他人视角支持
  const viewAsUserId = (() => {
    const v = new URLSearchParams(window.location.search).get('viewAs');
    return v ? parseInt(v) : undefined;
  })();

  // 选中的股票
  const [selectedStock, setSelectedStock] = useState(US_STOCKS[0]);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // 下单面板
  const [orderAmount, setOrderAmount] = useState("");
  const [orderPrice, setOrderPrice] = useState("");
  const [sliderPct, setSliderPct] = useState(0);
  const [orderSide, setOrderSide] = useState<"buy" | "sell">("buy");
  const [expandedOrderId, setExpandedOrderId] = useState<number | null>(null);
  const [expandedDateId, setExpandedDateId] = useState<number | null>(null);
  // 排序状态
  const [sortKey, setSortKey] = useState<'time' | 'coin' | 'amount' | 'price' | 'status'>('time');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');

  // 行情
  const { data: priceData, isLoading: priceLoading, refetch: refetchPrice } = trpc.getUsStockPrice.useQuery(
    { symbol: selectedStock.symbol },
    { staleTime: 30000, refetchInterval: 30000 }
  );
  const currentPrice = (priceData as any)?.price ?? 0;
  const priceChange = (priceData as any)?.change ?? 0;
  const isUp = priceChange >= 0;

  // 余额
  const { data: assetData } = trpc.ledger.afGetMyTotalAsset.useQuery(
    { ledgerId },
    { enabled: !!ledgerId, staleTime: 30000 }
  );
  const availableUsdt = (assetData as any)?.total ?? 0;

  // 订单列表
  const utils = trpc.useUtils();
  const { data: ordersData, isLoading: ordersLoading } = trpc.ledger.afGetOrders.useQuery(
    { ledgerId, ...(viewAsUserId ? { viewAsUserId } : {}) },
    { enabled: !!ledgerId, staleTime: 30000, refetchOnWindowFocus: false, refetchOnMount: "always" }
  );
  const afOrders: any[] = (ordersData as any[]) || [];

  // 从 afOrders 中按 orderType 分离谷底增筹和谷间优筹
  // - orderType 为空或 '无损合约' 的是谷底增筹（af_orders 表）
  // - orderType = '谷间优筹' 的是谷间优筹
  // finance_interest_orders 表里全是融资付息订单，不在此显示
  const gujianOrders = afOrders;

  // 排序计算
  const sortedOrders = useMemo(() => {
    const arr = [...(gujianOrders as any[])];
    arr.sort((a, b) => {
      let va: any, vb: any;
      if (sortKey === 'time') { va = a.createdAt; vb = b.createdAt; }
      else if (sortKey === 'coin') { va = a.coin; vb = b.coin; }
      else if (sortKey === 'amount') { va = parseFloat(a.amount || '0'); vb = parseFloat(b.amount || '0'); }
      else if (sortKey === 'price') { va = parseFloat(a.limitPrice || '0'); vb = parseFloat(b.limitPrice || '0'); }
      else if (sortKey === 'status') { va = a.sellStatus || a.status || ''; vb = b.sellStatus || b.status || ''; }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return arr;
  }, [gujianOrders, sortKey, sortDir]);

  // 切换排序方向的辅助函数
  const handleSort = (key: typeof sortKey) => {
    if (sortKey === key) {
      setSortDir(prev => prev === 'desc' ? 'asc' : 'desc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  // 下单
  const submitOrderMutation = trpc.ledger.afSubmitOrder.useMutation({
    onSuccess: () => {
      toast.success("委托已提交");
      setOrderAmount("");
      setOrderPrice("");
      setSliderPct(0);
      utils.ledger.afGetOrders.invalidate({ ledgerId });
      utils.ledger.afGetMyTotalAsset.invalidate({ ledgerId });
    },
    onError: (e) => toast.error("下单失败", { description: e.message }),
  });

  // 撤单
  const cancelMutation = trpc.ledger.afCancelOrder.useMutation({
    onSuccess: () => {
      toast.success("委托已撤销");
      utils.ledger.afGetOrders.invalidate({ ledgerId });
      utils.ledger.afGetMyTotalAsset.invalidate({ ledgerId });
    },
    onError: (e) => toast.error("撤单失败", { description: e.message }),
  });

  // 当前价格变化时，更新委托价格输入框（仅当为空时）
  useEffect(() => {
    if (currentPrice > 0 && !orderPrice) {
      setOrderPrice(currentPrice.toFixed(2));
    }
  }, [currentPrice]);

  // 滑块金额计算
  const sliderAmount = availableUsdt > 0 ? (availableUsdt * sliderPct / 100) : 0;

  const handleSubmit = () => {
    const price = parseFloat(orderPrice);
    if (!price || price <= 0) { toast.error("请输入委托价格"); return; }
    const amt = parseFloat(orderAmount) || sliderAmount;
    if (!amt || amt <= 0) { toast.error("请输入金额"); return; }
    if (amt > availableUsdt) { toast.error("金额超过可用余额"); return; }
    // 股票数量 = 金额 / 价格（1:1，不加杠杆）
    const qty = (amt / price).toFixed(6);
    submitOrderMutation.mutate({
      ledgerId,
      coin: selectedStock.symbol,
      side: "buy",
      limitPrice: price.toString(),
      amount: amt.toFixed(2),
      quantity: qty,
      orderType: "谷间优筹",
    });
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: "#F0F4FF" }}>
      {/* 顶部导航 */}
      <div className="flex-shrink-0 text-white px-4 pt-safe" style={{ background: "linear-gradient(135deg, #1A56DB 0%, #3B82F6 100%)" }}>
        <div className="flex items-center justify-between h-12">
          <button onClick={() => setLocation(`/ledger/${ledgerId}${viewAsUserId ? `?viewAs=${viewAsUserId}` : ''}`)} className="flex items-center gap-1 text-white/80 active:text-white">
            <ChevronLeft className="w-5 h-5" />
            <span className="text-sm">返回</span>
          </button>
          <div className="text-center">
            <div className="font-bold text-base">谷间优筹</div>
            <div className="text-[10px] text-white/70">美股精选保本增值计划</div>
          </div>
          <button onClick={() => refetchPrice()} className="text-white/70 active:text-white">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-y-auto pb-8">
        <div className="px-4 space-y-3 mt-3">

          {/* 股票选择下拉框 + 实时行情 */}
          <div className="rounded-2xl bg-white shadow-sm" style={{ border: "1px solid #E0E8FF" }}>
            {/* 下拉选股 */}
            <div className="relative">
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="w-full flex items-center gap-3 px-4 py-3 active:bg-gray-50"
              >
                <img
                  src={selectedStock.logo}
                  alt={selectedStock.name}
                  className="w-9 h-9 rounded-full object-contain border border-gray-100 flex-shrink-0"
                  onError={(e) => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${selectedStock.symbol}&background=1A56DB&color=fff&size=36`; }}
                />
                <div className="flex-1 text-left">
                  <div className="font-semibold text-sm" style={{ color: "#1A2340" }}>{selectedStock.name}</div>
                  <div className="text-xs" style={{ color: "#6B7280" }}>{selectedStock.nameCn} · {selectedStock.symbol}</div>
                </div>
                {/* 实时价格 */}
                <div className="text-right mr-1">
                  {priceLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                  ) : (
                    <>
                      <div className="font-bold text-base" style={{ color: "#1A2340" }}>
                        ${currentPrice > 0 ? currentPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "--"}
                      </div>
                      <div className={`text-xs font-medium flex items-center justify-end gap-0.5 ${isUp ? "text-[#0EA56A]" : "text-[#EF4444]"}`}>
                        {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {isUp ? "+" : ""}{priceChange.toFixed(2)}%
                      </div>
                    </>
                  )}
                </div>
                <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform ${dropdownOpen ? "rotate-180" : ""}`} style={{ color: "#9CA3AF" }} />
              </button>

              {/* 下拉列表 */}
              {dropdownOpen && (
                <div className="absolute left-0 right-0 top-full z-50 bg-white shadow-xl rounded-b-2xl border-t border-gray-100 max-h-64 overflow-y-auto">
                  {US_STOCKS.map((stock) => (
                    <button
                      key={stock.symbol}
                      onClick={() => {
                        setSelectedStock(stock);
                        setDropdownOpen(false);
                        setOrderPrice(""); // 清空价格，让新行情填入
                      }}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 active:bg-blue-50 ${selectedStock.symbol === stock.symbol ? "bg-blue-50" : ""}`}
                    >
                      <img
                        src={stock.logo}
                        alt={stock.name}
                        className="w-8 h-8 rounded-full object-contain border border-gray-100 flex-shrink-0"
                        onError={(e) => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${stock.symbol}&background=1A56DB&color=fff&size=32`; }}
                      />
                      <div className="flex-1 text-left">
                        <span className="font-medium text-sm" style={{ color: "#1A2340" }}>{stock.name}</span>
                        <span className="text-xs ml-1.5" style={{ color: "#9CA3AF" }}>{stock.nameCn}</span>
                      </div>
                      <span className="text-xs font-mono" style={{ color: "#6B7280" }}>{stock.symbol}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 下单面板 */}
          <div className="rounded-2xl bg-white shadow-sm px-4 py-4 space-y-3" style={{ border: "1px solid #E0E8FF" }}>
            {/* 买入/卖出切换 */}
            <div className="flex rounded-xl overflow-hidden border" style={{ borderColor: "#E0E8FF" }}>
              <button
                onClick={() => setOrderSide("buy")}
                className={`flex-1 py-2 text-sm font-semibold transition-colors ${orderSide === "buy" ? "text-white" : "text-gray-500"}`}
                style={orderSide === "buy" ? { background: "linear-gradient(135deg, #1A56DB 0%, #3B82F6 100%)" } : { backgroundColor: "#F8FAFF" }}
              >
                委托买入
              </button>
              <button
                onClick={() => setOrderSide("sell")}
                className={`flex-1 py-2 text-sm font-semibold transition-colors ${orderSide === "sell" ? "text-white" : "text-gray-500"}`}
                style={orderSide === "sell" ? { backgroundColor: "#EF4444" } : { backgroundColor: "#F8FAFF" }}
              >
                委托卖出
              </button>
            </div>

            {orderSide === "buy" && (
              <>
                {/* 可用余额 */}
                <div className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: "#9CA3AF" }}>可用余额</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium" style={{ color: "#1A2340" }}>
                      {availableUsdt > 0 ? availableUsdt.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "--"} USDT
                    </span>
                    <button
                      onClick={() => setLocation(`/recharge?from=ledger&ledgerId=${ledgerId}${viewAsUserId ? `&viewAs=${viewAsUserId}` : ''}`)}
                      className="w-5 h-5 rounded-full flex items-center justify-center text-xs"
                      style={{ backgroundColor: "#E8EEFF", color: "#1A56DB" }}
                    >+</button>
                  </div>
                </div>

                {/* 委托价格 */}
                <div>
                  <label className="text-xs mb-1 block" style={{ color: "#6B7280" }}>委托价格（USD）</label>
                  <input
                    type="number"
                    value={orderPrice}
                    onChange={(e) => setOrderPrice(e.target.value)}
                    placeholder={currentPrice > 0 ? `当前 $${currentPrice.toFixed(2)}` : "请输入委托价格"}
                    className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                    style={{ backgroundColor: "#F0F4FF", border: "1px solid #D0DBFF", color: "#1A2340" }}
                  />
                </div>

                {/* 金额输入 */}
                <div>
                  <label className="text-xs mb-1 block" style={{ color: "#6B7280" }}>投入金额（USDT）</label>
                  <input
                    type="number"
                    value={orderAmount}
                    onChange={(e) => {
                      setOrderAmount(e.target.value);
                      const num = parseFloat(e.target.value);
                      if (!isNaN(num) && availableUsdt > 0) {
                        setSliderPct(Math.min(100, Math.round((num / availableUsdt) * 100)));
                      }
                    }}
                    placeholder="请输入投入金额"
                    className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                    style={{ backgroundColor: "#F0F4FF", border: "1px solid #D0DBFF", color: "#1A2340" }}
                  />
                </div>

                {/* 滑块 */}
                <div>
                  <input
                    type="range" min={0} max={100} value={sliderPct}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      setSliderPct(val);
                      const amt = availableUsdt > 0 ? (availableUsdt * val / 100) : 0;
                      setOrderAmount(amt > 0 ? amt.toFixed(2) : "");
                    }}
                    className="w-full accent-blue-600"
                  />
                  <div className="flex justify-between text-[10px] mt-0.5" style={{ color: "#9CA3AF" }}>
                    <span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span>
                  </div>
                </div>

                {/* 可买数量预览 */}
                {(() => {
                  const amt = parseFloat(orderAmount) || sliderAmount;
                  const price = parseFloat(orderPrice);
                  const qty = amt > 0 && price > 0 ? (amt / price) : null;
                  return (
                    <div className="rounded-xl px-3 py-2.5" style={{ backgroundColor: "#EEF2FF", border: "1px solid #D0DBFF" }}>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold" style={{ color: "#1A56DB" }}>预计买入数量</span>
                        <span className="text-sm font-bold" style={{ color: qty !== null ? "#1A2340" : "#9CA3AF" }}>
                          {qty !== null ? `${qty.toFixed(4)} ${selectedStock.symbol}` : `-- ${selectedStock.symbol}`}
                        </span>
                      </div>
                      {qty !== null && (
                        <div className="text-xs mt-1" style={{ color: "#6B7A9A" }}>
                          {(parseFloat(orderAmount) || sliderAmount).toLocaleString("en-US", { maximumFractionDigits: 2 })} ÷ {parseFloat(orderPrice).toLocaleString()} = {qty.toFixed(4)} 股
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* 提交按钮 */}
                <button
                  onClick={handleSubmit}
                  disabled={submitOrderMutation.isPending}
                  className="w-full py-3 rounded-xl text-white font-semibold text-sm flex items-center justify-center gap-2 active:opacity-90 disabled:opacity-60"
                  style={{ background: "linear-gradient(135deg, #1A56DB 0%, #3B82F6 100%)" }}
                >
                  {submitOrderMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  确认委托买入
                </button>
              </>
            )}

            {orderSide === "sell" && (
              <>
                {/* 可委卖的订单 */}
                <div className="text-xs mb-1" style={{ color: "#6B7280" }}>选择要卖出的订单</div>
                {(() => {
                  const sellableOrders = gujianOrders.filter(
                    (o: any) => (o.status === "completed" || o.status === "pending")
                      && o.sellStatus !== "selling" && o.sellStatus !== "sold"
                  );
                  if (sellableOrders.length === 0) {
                    return <div className="text-xs text-gray-400 py-2">暂无可卖出的持仓订单</div>;
                  }
                  return (
                    <div className="space-y-2">
                      {sellableOrders.map((o: any) => (
                        <div
                          key={o.id}
                          className="rounded-xl px-3 py-2.5"
                          style={{ backgroundColor: "#F0F4FF", border: "1px solid #D0DBFF" }}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="text-sm font-semibold" style={{ color: "#1A2340" }}>{o.coin}</span>
                              <span className="text-xs ml-1.5" style={{ color: "#9CA3AF" }}>买入价 ${parseFloat(o.limitPrice).toLocaleString()}</span>
                            </div>
                            <div className="text-right">
                              <div className="text-sm font-medium" style={{ color: "#1A2340" }}>{parseFloat(o.quantity).toFixed(4)} 股</div>
                              <div className="text-xs" style={{ color: "#9CA3AF" }}>{parseFloat(o.amount).toFixed(2)} USDT</div>
                            </div>
                          </div>
                          <div className="mt-2">
                            <label className="text-xs mb-1 block" style={{ color: "#6B7280" }}>委卖价格（USD）</label>
                            <div className="flex gap-2">
                              <input
                                type="number"
                                placeholder={currentPrice > 0 ? `当前 $${currentPrice.toFixed(2)}` : "委卖价格"}
                                className="flex-1 rounded-lg px-2.5 py-1.5 text-sm outline-none"
                                style={{ backgroundColor: "#FFFFFF", border: "1px solid #D0DBFF", color: "#1A2340" }}
                                id={`sell-price-${o.id}`}
                              />
                              <button
                                onClick={() => {
                                  const priceInput = document.getElementById(`sell-price-${o.id}`) as HTMLInputElement;
                                  const price = parseFloat(priceInput?.value || "");
                                  if (!price || price <= 0) { toast.error("请输入委卖价格"); return; }
                                  submitOrderMutation.mutate({
                                    ledgerId,
                                    coin: o.coin,
                                    side: "sell",
                                    limitPrice: price.toString(),
                                    amount: o.amount,
                                    quantity: o.quantity,
                                    orderType: "谷间优筹",
                                    sourceOrderId: o.id,
                                  });
                                }}
                                className="px-3 py-1.5 rounded-lg text-xs text-white font-medium"
                                style={{ backgroundColor: "#EF4444" }}
                              >
                                委卖
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </>
            )}
          </div>

          {/* 我的订单列表 */}
          <div className="rounded-2xl bg-white shadow-sm" style={{ border: "1px solid #E0E8FF" }}>
            <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: "#E0E8FF" }}>
              <div className="flex items-center">
                <span className="font-semibold text-sm" style={{ color: "#1A2340" }}>我的订单</span>
                <span className="text-xs ml-2" style={{ color: "#9CA3AF" }}>{gujianOrders.length} 笔</span>
              </div>
              {/* 排序按鈕组 */}
              <div className="flex items-center gap-1">
                {(['time', 'coin', 'amount', 'price', 'status'] as const).map((key) => {
                  const labels: Record<string, string> = { time: '时间', coin: '币种', amount: '金额', price: '价格', status: '状态' };
                  const isActive = sortKey === key;
                  return (
                    <button
                      key={key}
                      onClick={() => handleSort(key)}
                      className="flex items-center gap-0.5 px-2 py-1 rounded text-xs transition-colors"
                      style={{
                        color: isActive ? '#2563EB' : '#9CA3AF',
                        background: isActive ? '#EFF6FF' : 'transparent',
                        fontWeight: isActive ? 600 : 400,
                      }}
                    >
                      {labels[key]}
                      {isActive ? (
                        sortDir === 'desc'
                          ? <ChevronDown className="w-3 h-3" />
                          : <ChevronUp className="w-3 h-3" />
                      ) : (
                        <ChevronsUpDown className="w-3 h-3 opacity-40" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {ordersLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
              </div>
            ) : gujianOrders.length === 0 ? (
              <div className="py-10 text-center text-sm" style={{ color: "#9CA3AF" }}>暂无订单，快去下单吧</div>
            ) : (
              <div className="divide-y" style={{ borderColor: "#F0F4FF" }}>
                {sortedOrders.map((order: any) => {
                  const isExpanded = expandedOrderId === order.id;
                  const statusLabel =
                    order.sellStatus === "sold" ? "已卖出" :
                    order.sellStatus === "selling" ? "委卖中" :
                    order.status === "completed" ? "持仓中" :
                    order.status === "cancelled" ? "已撤单" : "委买中";
                  const statusColor =
                    order.sellStatus === "sold" ? "#6B7280" :
                    order.sellStatus === "selling" ? "#EF4444" :
                    order.status === "completed" ? "#0EA56A" :
                    order.status === "cancelled" ? "#94A3B8" : "#F59E0B";

                  // 当前价格（如果选中了同一股票）
                  const livePrice = selectedStock.symbol === order.coin ? currentPrice : 0;
                  const { ratio, monthsHeld, growthPct } = livePrice > 0
                    ? calcCurrentRatio(order.createdAt, parseFloat(order.limitPrice), livePrice)
                    : { ratio: 0, monthsHeld: 0, growthPct: 0 };
                  const protectRatio = calcProtectRatio(order.createdAt);

                  // 订单时间
                  const timeStr = new Date(order.createdAt).toLocaleString("zh-CN", {
                    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
                  });

                  // 订单编号生成（与谷底增筹一致）
                  const orderDate2 = new Date(order.createdAt);
                  const yy2 = String(orderDate2.getFullYear()).slice(2);
                  const mm2 = String(orderDate2.getMonth() + 1).padStart(2, '0');
                  const dd2 = String(orderDate2.getDate()).padStart(2, '0');
                  const orderNo = `AF${yy2}${mm2}${dd2}${String(order.id).padStart(6, '0')}`;

                  // 判断是谷底增筹还是谷间优筹
                  // orderType 为空或 '无损合约' 的是谷底增筹，'谷间优筹' 的是谷间优筹
                  const isGudizengchou = !order.orderType || order.orderType === '无损合约' || order.orderType === '谷底增筹';
                  const orderTypeName = isGudizengchou ? '谷底增筹' : '谷间优筹';

                  // 谷底增筹：成交价值 = amount × 5.25
                  const tradeValue = isGudizengchou && !order.isGift ? parseFloat(order.amount) * 5.25 : parseFloat(order.amount);

                  function fFormatCoinQty(qty: number, coin: string) {
                    if (coin === 'BTC') return qty.toFixed(8).replace(/\.?0+$/, '');
                    if (coin === 'ETH' || coin === 'SOL') return qty.toFixed(6).replace(/\.?0+$/, '');
                    return qty.toFixed(4).replace(/\.?0+$/, '');
                  }

                  return (
                    <div key={order.id}>
                      {/* 订单摘要行 */}
                      <button
                        onClick={() => setExpandedOrderId(isExpanded ? null : order.id)}
                        className="w-full px-4 py-3 flex items-center gap-3 active:bg-gray-50 text-left"
                      >
                        <img
                          src={US_STOCKS.find(s => s.symbol === order.coin)?.logo || CRYPTO_ICONS[order.coin] || ""}
                          alt={order.coin}
                          className="w-8 h-8 rounded-full object-contain border border-gray-100 flex-shrink-0"
                          onError={(e) => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${order.coin}&background=1A56DB&color=fff&size=32`; }}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-semibold text-sm" style={{ color: "#1A2340" }}>{order.coin}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: `${statusColor}18`, color: statusColor }}>{statusLabel}</span>
                            {isGudizengchou && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: '#FFF7ED', color: '#D97706' }}>谷底</span>
                            )}
                          </div>
                          <div className="text-xs mt-0.5" style={{ color: "#9CA3AF" }}>
                            {isGudizengchou ? '' : '$'}{parseFloat(order.limitPrice).toLocaleString()} · {timeStr}
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="text-sm font-semibold" style={{ color: "#1A2340" }}>{parseFloat(order.amount).toFixed(2)} U</div>
                          <div className="text-xs" style={{ color: "#9CA3AF" }}>
                            {isGudizengchou ? `×5.25` : `${parseFloat(order.quantity).toFixed(4)} 股`}
                          </div>
                        </div>
                        <ChevronDown className={`w-4 h-4 flex-shrink-0 ml-1 transition-transform ${isExpanded ? "rotate-180" : ""}`} style={{ color: "#9CA3AF" }} />
                      </button>

                      {/* 展开详情 */}
                      {isExpanded && (
                        isGudizengchou ? (
                          /* 谷底增筹订单：完整详情（含收益权扫描+档位表） */
                          <GudizengchouDetail order={order} ledgerId={ledgerId} />
                        ) : (
                          /* 谷间优筹订单：原有展开详情 */
                          <div className="px-4 pb-4 space-y-2" style={{ backgroundColor: "#F8FAFF" }}>
                            <div className="h-px" style={{ backgroundColor: "#E0E8FF" }} />

                            {/* 订单编号 */}
                            <div className="flex justify-between items-center text-sm">
                              <span style={{ color: "#9CA3AF" }}>订单编号</span>
                              <span className="font-mono text-xs" style={{ color: "#1A2340" }}>{orderNo}</span>
                            </div>

                            {/* 币种 + 买卖方向 */}
                            <div className="flex justify-between items-center text-sm">
                              <span style={{ color: "#9CA3AF" }}>币种</span>
                              <span style={{ color: "#1A2340", fontWeight: 500 }}>
                                <span className="px-1.5 py-0.5 rounded text-[11px] font-semibold mr-1.5"
                                  style={{ backgroundColor: order.side === 'buy' ? '#EFF6FF' : '#FEF2F2', color: order.side === 'buy' ? '#1A56DB' : '#EF4444' }}>
                                  {order.side === 'buy' ? '买' : '卖'}
                                </span>
                                {order.coin}
                              </span>
                            </div>

                            {/* 成交价格 */}
                            <div className="flex justify-between items-center text-sm">
                              <span style={{ color: "#9CA3AF" }}>成交价格</span>
                              <span style={{ color: "#1A2340" }}>${parseFloat(order.limitPrice).toLocaleString()} USDT</span>
                            </div>

                            {/* 实际投入 */}
                            <div className="flex justify-between items-center text-sm">
                              <span style={{ color: "#9CA3AF" }}>实际投入</span>
                              <span style={{ color: "#1A2340" }}>{parseFloat(order.amount).toFixed(2)} USDT</span>
                            </div>

                            {/* 持仓数量 */}
                            <div className="flex justify-between items-center text-sm">
                              <span style={{ color: "#9CA3AF" }}>持仓数量</span>
                              <span style={{ color: "#1A2340", fontWeight: 500 }}>{parseFloat(order.quantity).toFixed(4).replace(/\.?0+$/, '')} 股</span>
                            </div>

                            {/* 类型/状态 */}
                            <div className="flex justify-between items-center text-sm">
                              <span style={{ color: "#9CA3AF" }}>类型 / 状态</span>
                              <span style={{ color: "#1A2340" }}>
                                {orderTypeName}
                                <span className="mx-1.5" style={{ color: '#CBD5E1' }}>·</span>
                                <span style={{ color: statusColor }}>{statusLabel}</span>
                              </span>
                            </div>

                            {/* 持仓中：实时收益分配 */}
                            {order.status === "completed" && order.sellStatus !== "sold" && livePrice > 0 && (
                              <div className="rounded-xl p-3 mt-2" style={{ backgroundColor: "#EEF2FF", border: "1px solid #D0DBFF" }}>
                                <div className="text-xs font-semibold mb-2" style={{ color: "#1A56DB" }}>实时收益预估</div>
                                <div className="space-y-1.5 text-xs">
                                  <div className="flex justify-between">
                                    <span style={{ color: "#6B7280" }}>当前价格</span>
                                    <span className={`font-medium ${isUp ? "text-[#0EA56A]" : "text-[#EF4444]"}`}>
                                      ${livePrice.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                                      <span className="ml-1">({growthPct >= 0 ? "+" : ""}{growthPct.toFixed(2)}%)</span>
                                    </span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span style={{ color: "#6B7280" }}>持有时长</span>
                                    <span style={{ color: "#1A2340" }}>{monthsHeld} 个月</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span style={{ color: "#6B7280" }}>当前分成比例</span>
                                    <span className="font-semibold" style={{ color: ratio > 0 ? "#0EA56A" : "#9CA3AF" }}>
                                      {ratio > 0 ? `客户得 ${ratio}%` : "未达最低档"}
                                    </span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span style={{ color: "#6B7280" }}>下行保障</span>
                                    <span className="font-semibold" style={{ color: protectRatio > 0 ? "#1A56DB" : "#9CA3AF" }}>
                                      {protectRatio > 0 ? `亏损 ${protectRatio}% 补足` : "未达保障档"}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* 卖出信息 */}
                            {order.sellStatus === "selling" && (
                              <div className="flex justify-between items-center text-sm">
                                <span style={{ color: "#9CA3AF" }}>委卖价格</span>
                                <span className="font-medium" style={{ color: "#EF4444" }}>${parseFloat(order.sellPrice).toLocaleString()}</span>
                              </div>
                            )}
                            {order.sellStatus === "sold" && (
                              <>
                                <div className="flex justify-between items-center text-sm">
                                  <span style={{ color: "#9CA3AF" }}>卖出价格</span>
                                  <span className="font-medium" style={{ color: "#0EA56A" }}>${parseFloat(order.sellPrice).toLocaleString()}</span>
                                </div>
                                {order.sellConfirmedAt && (
                                  <div className="flex justify-between items-center text-sm">
                                    <span style={{ color: "#9CA3AF" }}>卖出时间</span>
                                    <span style={{ color: "#6B7280" }}>{order.sellConfirmedAt}</span>
                                  </div>
                                )}
                              </>
                            )}

                            {/* 开仓时间 */}
                            <div className="flex justify-between items-center text-sm">
                              <span style={{ color: "#9CA3AF" }}>开仓时间</span>
                              <span style={{ color: "#6B7280" }}>{new Date(order.createdAt).toLocaleString("zh-CN")}</span>
                            </div>
                            {/* 登记时间 */}
                            {order.confirmedAt && (
                              <div className="flex justify-between items-center text-sm">
                                <span style={{ color: "#9CA3AF" }}>登记时间</span>
                                <span style={{ color: "#6B7280" }}>{order.confirmedAt}</span>
                              </div>
                            )}

                            {/* 撤单按钮 */}
                            {order.status === "pending" && order.sellStatus !== "selling" && (
                              <button
                                onClick={() => cancelMutation.mutate({ orderId: order.id, ledgerId })}
                                disabled={cancelMutation.isPending}
                                className="w-full mt-2 py-2 rounded-xl text-xs font-medium border active:opacity-80"
                                style={{ borderColor: "#E0E8FF", color: "#9CA3AF" }}
                              >
                                撤销委托
                              </button>
                            )}
                          </div>
                        )
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 底部说明 */}
          <div className="text-center text-[10px] pb-4" style={{ color: "#9CA3AF" }}>
            投资有风险，入市需谨慎。本产品不构成任何投资建议，过往业绩不代表未来表现。
          </div>
        </div>
      </div>
    </div>
  );
}
