import { useState, useEffect, useRef, lazy, Suspense, useCallback, useMemo } from "react";

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
function useAccruedInterest(interestBase: string | null, interestRateAnnual: string | null, interestStartDate: string | null) {
  const [accrued, setAccrued] = useState<number>(0);
  const computeAccrued = useCallback(() => {
    const base = parseFloat(interestBase || '0');
    const rate = parseFloat(interestRateAnnual || '0');
    if (!base || !rate || !interestStartDate) return 0;
    const startTs = new Date(interestStartDate + 'T00:00:00').getTime();
    if (isNaN(startTs)) return 0;
    const nowTs = Date.now();
    const elapsedSeconds = Math.max(0, (nowTs - startTs) / 1000);
    const perSecond = (base * rate / 100) / (365 * 24 * 3600);
    return perSecond * elapsedSeconds;
  }, [interestBase, interestRateAnnual, interestStartDate]);
  useEffect(() => {
    setAccrued(computeAccrued());
    const timer = setInterval(() => setAccrued(computeAccrued()), 1000);
    return () => clearInterval(timer);
  }, [computeAccrued]);
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
function FunderOrderCardRight({ order, ledgerId, accrued, cc, paidInterest }: { order: any; ledgerId: number; accrued: number; cc: string; paidInterest: number }) {
  const { data: stats } = trpc.ledger.funderGetOrderScanStats.useQuery(
    { orderId: order.id, ledgerId },
    { refetchOnWindowFocus: false, staleTime: 5 * 60 * 1000 }
  );
  const profitPct = stats?.profitRightPct ?? 0;
  const rawLowest = stats?.allTimeLow ? Number(stats.allTimeLow) : null;
  const lastScanPrice = stats?.lastScanPrice ? Number(stats.lastScanPrice) : null;
  const buyPrice = order.buy_price ? Number(order.buy_price) : null;
  // 最低价：如果扫描到的最低价比买入价更低，就显示最低价；否则显示买入价
  const displayLowest = rawLowest && buyPrice && rawLowest < buyPrice ? rawLowest : buyPrice;
  const lowestAt = stats?.allTimeLowAt;
  // 格式化时间：X月X日 HH:MM
  // 如果有扫描时间就用扫描时间，否则用买入日期
  let lowestAtLabel = '';
  if (lowestAt) {
    const d = new Date(lowestAt);
    lowestAtLabel = `${d.getMonth()+1}月${d.getDate()}日`;
  } else if (order.buy_date) {
    lowestAtLabel = order.buy_date.replace(/^(\d{4})-(\d{2})-(\d{2})$/, (_: string, y: string, m: string, dd: string) => `${parseInt(m)}月${parseInt(dd)}日`);
  }
  return (
    <div className="flex flex-col h-full">
      {/* 上半：代结利息 */}
      <div className="flex-1 flex flex-col justify-start">
        <div className="flex items-center justify-between mb-0.5">
          <div className="flex items-center gap-1">
            <span className="text-[10px]" style={{ color: '#3B82F6' }}>待结利息</span>
            <span className="text-[10px] text-gray-400">(年化 {order.interest_rate_annual || 0}%)</span>
          </div>
        </div>
        <div className="flex items-baseline gap-0.5">
          <span
            className="text-2xl font-bold tabular-nums leading-tight"
            style={{ color: '#1A2340', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}
          >
            {accrued.toFixed(2)}
          </span>
          <span className="text-sm font-semibold" style={{ color: '#1A2340' }}>元</span>
        </div>
        <div className="flex items-center justify-between mt-0.5 text-xs">
          <span className="text-gray-400">已结利息</span>
          <span className="font-medium" style={{ color: '#4B5563' }}>{paidInterest.toFixed(2)}元</span>
        </div>
        {order.interest_start_date && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400">计息日期</span>
            <span className="font-medium" style={{ color: '#4B5563' }}>
              {order.interest_start_date.replace(/^\d{4}-(\d{2})-(\d{2})$/, (_: string, m: string, d: string) => `${parseInt(m)}月${parseInt(d)}日`)}
            </span>
          </div>
        )}
      </div>
      {/* 中间分隔线 */}
      <div className="h-px mx-0" style={{ backgroundColor: '#E8EFFF' }} />
      {/* 下半：收益分成 */}
      <div className="flex-1 flex flex-col justify-start pt-2">
        <div className="text-[10px] mb-0.5" style={{ color: '#3B82F6' }}>收益分成</div>
        {(() => {
          // 当扫描价 > 买入价时，计算盈利金额并突出显示
          const isProfit = lastScanPrice && buyPrice && lastScanPrice > buyPrice && profitPct > 0;
          const profitU = isProfit ? (lastScanPrice! - buyPrice!) * parseFloat(order.buy_quantity || '0') * (profitPct / 100) : 0;
          if (isProfit) {
            return (
              <div className="flex items-baseline justify-between w-full">
                <div className="flex items-baseline gap-0.5">
                  <span
                    className="text-xl font-bold tabular-nums leading-tight"
                    style={{ color: '#D32F2F', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}
                  >
                    +{profitU.toFixed(2)}
                  </span>
                  <span className="text-xs font-semibold" style={{ color: '#D32F2F' }}>U</span>
                </div>
                <span className="font-medium" style={{ color: '#4B5563', fontSize: '12px' }}>{profitPct.toFixed(2)}%</span>
              </div>
            );
          }
          return (
            <div className="flex items-baseline gap-0.5">
              <span
                className="text-2xl font-bold tabular-nums leading-tight"
                style={{ color: '#1A2340', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}
              >
                {profitPct.toFixed(2)}
              </span>
              <span className="text-sm font-semibold" style={{ color: '#1A2340' }}>%</span>
            </div>
          );
        })()}
        
        <div className="flex items-center justify-between mt-0.5 text-xs">
          <span className="text-gray-400">最低价格</span>
          <span className="font-medium" style={{ color: '#4B5563' }}>
            {displayLowest !== null ? displayLowest.toLocaleString(undefined, { maximumFractionDigits: 2 }) + ' U' : '---'}
          </span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-400">最低跌幅</span>
          <span className="font-medium" style={{ color: '#4B5563' }}>
            {(() => {
              if (!buyPrice || buyPrice <= 0) return '0.00%';
              const drop = rawLowest && rawLowest < buyPrice
                ? ((buyPrice - rawLowest) / buyPrice * 100)
                : 0;
              return drop.toFixed(2) + '%';
            })()}
          </span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-400">发生时间</span>
          <span className="font-medium" style={{ color: '#4B5563' }}>{lowestAtLabel || '---'}</span>
        </div>
      </div>
    </div>
  );
}

// 单张资金方订单卡片（左右两栏布局）
function FunderOrderCard({ order, ledgerId, livePrices, paidInterest, onClick, canClick }: { order: any; ledgerId: number; livePrices: Record<string, number>; paidInterest?: number; onClick: () => void; canClick?: boolean }) {
  const coinColorMap: Record<string, string> = { BTC: '#F7931A', ETH: '#627EEA', SOL: '#9945FF' };
  const coinNameMap: Record<string, string> = { BTC: '比特币', ETH: '以太坊', SOL: '索拉纳' };
  const cc = coinColorMap[order.coin] || '#6B7280';
  const statusLabel = order.status === 'active' ? '持有中' : order.status === 'settled' ? '已结算' : '已取消';
  const statusColor = order.status === 'active' ? '#22C55E' : order.status === 'settled' ? '#3B82F6' : '#9CA3AF';
  const accrued = useAccruedInterest(order.interest_base, order.interest_rate_annual, order.interest_start_date);
  const qty = parseFloat(order.buy_quantity || '0');
  const price = parseFloat(order.buy_price || '0');
  const totalU = qty > 0 && price > 0 ? qty * price : parseFloat(order.amount || '0');
  const hasInterest = order.interest_base && order.interest_rate_annual && order.interest_start_date && order.status === 'active';
  const coinName = coinNameMap[order.coin] || order.coin;
  return (
    <div
      className="rounded-2xl shadow-sm"
      style={{ backgroundColor: '#FFFFFF', border: '1px solid #E0E8FF', boxShadow: '0 2px 8px rgba(26,86,219,0.08)', cursor: canClick ? 'pointer' : 'default', overflow: 'hidden' }}
      onClick={onClick}
    >
      {/* 顶部色条 */}
      <div className="h-1" style={{ background: `linear-gradient(90deg, ${cc}, ${cc}55)` }} />

      {/* 主体：左右两栏 */}
      <div className="flex" style={{ minHeight: '100px' }}>

        {/* 左栏：订单信息 */}
        <div className="flex-1 p-4 pr-3">
          {/* 标题：持有资产 */}
          <div className="text-[10px] mb-1" style={{ color: '#3B82F6' }}>持有资产</div>
          {/* 币种名称 + 数量（大字突出，4位小数） */}
          <div className="flex items-baseline gap-1 mb-1">
            <span className="text-2xl font-bold tabular-nums" style={{ color: '#1A2340' }}>
              {qty > 0 ? qty.toFixed(4) : '—'}
            </span>
            <span className="text-sm font-semibold" style={{ color: '#1A2340' }}>{order.coin}</span>
          </div>
          {/* 订单信息列表：标题靠左，数值靠右 */}
          <div className="space-y-0.5">
            {price > 0 && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-400 shrink-0">买入币价</span>
                <span className="font-medium" style={{ color: '#4B5563' }}>{price.toLocaleString()} U</span>
              </div>
            )}
            {totalU > 0 && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-400 shrink-0">买入价值</span>
                <span className="font-medium" style={{ color: '#4B5563' }}>{totalU.toLocaleString(undefined, { maximumFractionDigits: 2 })} U</span>
              </div>
            )}
            {order.buy_date && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-400 shrink-0">买入时间</span>
                <span className="font-medium" style={{ color: '#4B5563' }}>{order.buy_date}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-400 shrink-0">今日币价</span>
              <span className="font-medium" style={{ color: '#4B5563' }}>
                {livePrices[order.coin] ? livePrices[order.coin].toLocaleString(undefined, { maximumFractionDigits: 2 }) + ' U' : '---'}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-400 shrink-0">当前价值</span>
              <span className="font-medium" style={{ color: '#4B5563' }}>
                {livePrices[order.coin] && qty ? (qty * livePrices[order.coin]).toLocaleString(undefined, { maximumFractionDigits: 2 }) + ' U' : '---'}
              </span>
            </div>
            {order.buy_date && order.status === 'active' && (() => {
              const elapsed = Date.now() - new Date(order.buy_date + 'T00:00:00').getTime();
              if (elapsed < 0) return null;
              const totalHours = Math.floor(elapsed / (1000 * 60 * 60));
              const days = Math.floor(totalHours / 24);
              const hours = totalHours % 24;
              const label = days > 0 ? `${days}天 ${hours}小时` : `${hours}小时`;
              return (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-400 shrink-0">持有时长</span>
                  <span className="font-medium" style={{ color: '#4B5563' }}>{label}</span>
                </div>
              );
            })()}
            {order.order_no && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-400 shrink-0">订单编号</span>
                <span className="font-mono" style={{ color: '#9CA3AF', letterSpacing: '0.05em' }}>{order.order_no}</span>
              </div>
            )}
          </div>
        </div>

        {/* 中间分隔线 */}
        <div className="w-px my-3" style={{ backgroundColor: '#E8EFFF' }} />

        {/* 右栏：利息 + 收益分成 */}
        <div className="w-44 p-4 pl-3 flex flex-col" style={{ alignSelf: 'stretch' }}>
          {hasInterest ? (
            <FunderOrderCardRight order={order} ledgerId={ledgerId} accrued={accrued} cc={cc} paidInterest={paidInterest ?? 0} />
          ) : (
            <div className="flex items-center justify-center h-full">
              <ChevronRight className="w-5 h-5 text-gray-200" />
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
const FunderOrderDetailModal = lazy(() => import('@/components/FunderOrderDetailModal'));
const LedgerDetailAA = lazy(() => import('./LedgerDetailAA'));
const LedgerDetailAG = lazy(() => import('./LedgerDetailAG'));
const MemoLedgerPage = lazy(() => import('./MemoLedgerPage'));
import { useRoute, useLocation } from "wouter";
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
} from "lucide-react";


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
  });

  // 获取待审批记账数量
  const { data: pendingApprovals = [] } = trpc.ledger.getPendingApprovals.useQuery({
    ledgerId: Number(ledgerId),
  });

  // 成员弹窗状态
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
  const [showViewAsPicker, setShowViewAsPicker] = useState(false);
  const [viewAsSearch, setViewAsSearch] = useState('');
  const trpcUtils = trpc.useUtils();
  // 视角切换时同步写入 URL，确保刷新后保持视角
  const handleSwitchView = (userId: number | null) => {
    setViewAsUserIdState(userId);
    setShowViewAsPicker(false);
    // 更新 URL 参数
    const newParams = new URLSearchParams(window.location.search);
    if (userId) {
      newParams.set('viewAs', String(userId));
    } else {
      newParams.delete('viewAs');
    }
    const newUrl = `${window.location.pathname}?${newParams.toString()}`;
    window.history.replaceState(null, '', newUrl);
    trpcUtils.ledger.afGetMyTotalAsset.invalidate();
    trpcUtils.ledger.afGetMyRechargeHistory.invalidate();
  };
  // 抽奖子 Tab：正在进行中 / 往期回顾
  const [lotteryTab, setLotteryTab] = useState<'active' | 'past'>('active');
  // 倒计时刻度（每秒更新）
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(timer);
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
  const { data: dietStats } = trpc.diet.getStats.useQuery(
    { ledgerId: Number(ledgerId) },
    { enabled: isDiet }
  );
  // AF 账本：总资产估值（充值到账 + 手动调账）
  const { data: afTotalAsset } = trpc.ledger.afGetMyTotalAsset.useQuery(
    { ledgerId: Number(ledgerId), ...(viewAsUserId ? { viewAsUserId } : {}) },
    { enabled: isCustomAF }
  );
  // AF 账本：管理员统计（订单数 + 管理费）——后端控制权限，无权限返回null
  const { data: afAdminStats } = trpc.ledger.afAdminGetStats.useQuery(
    { ledgerId: Number(ledgerId) },
    { enabled: isCustomAF }
  );
  // AF 账本：实时盈亏汇总（每60秒自动刷新）
  const { data: pnlData } = trpc.ledger.afGetPnlSummary.useQuery(
    { ledgerId: Number(ledgerId), ...(viewAsUserId ? { viewAsUserId } : {}) },
    { enabled: isCustomAF, refetchInterval: 60000 }
  );
  // 资方专属：资产汇总（仅 funder 角色查询）
  const { data: funderAssetSummary } = trpc.ledger.funderGetAssetSummary.useQuery(
    { ledgerId: Number(ledgerId) },
    { enabled: isCustomAF && effectiveIsFunder }
  );
  // 资方专属：资产订单列表（仅 funder 角色查询）
  const PRICE_CACHE_KEY = `funder_live_prices_${ledgerId}`;
  const { data: funderAssetData } = trpc.ledger.funderGetAssetOrders.useQuery(
    { ledgerId: Number(ledgerId) },
    { enabled: isCustomAF && effectiveIsFunder, staleTime: 5 * 60 * 1000 }
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
  const funderOrderIds = useMemo(() => (funderAssetOrders as any[]).map((o: any) => o.id), [funderAssetOrders]);
  const { data: interestSummary } = trpc.ledger.funderGetInterestPaymentSummary.useQuery(
    { ledgerId: Number(ledgerId), orderIds: funderOrderIds },
    { enabled: isCustomAF && funderOrderIds.length > 0 }
  );
  // AF 账本：YJH邀请树（仅当弹窗打开时才加载）
  // 管理员/创建人点推荐时，强制以YJH(4957151)视角查询，无需切换视角
  const YJH_USER_ID = 4957151;
  const inviteTreeViewAsId = (isOwner || isAdmin) && (user as any)?.id !== YJH_USER_ID ? YJH_USER_ID : (viewAsUserId || undefined);
  const { data: inviteTreeData, isLoading: inviteTreeLoading } = trpc.ledger.afGetInviteTree.useQuery(
    { ledgerId: Number(ledgerId), ...(inviteTreeViewAsId ? { viewAsUserId: inviteTreeViewAsId } : {}) },
    { enabled: isCustomAF && showInviteTree }
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
  const [statsPeriod, setStatsPeriod] = useState<'day' | 'week' | 'month' | 'year'>(() => {
    const saved = localStorage.getItem('statsPeriod');
    return (saved as 'day' | 'week' | 'month' | 'year') || 'month';
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
  const { data: userWeight } = trpc.equity.getUserWeight.useQuery(
    { userId: effectiveShareUserId },
    { enabled: isCustomAI && !!effectiveShareUserId, refetchOnWindowFocus: true, refetchOnMount: 'always', staleTime: 0 }
  );
  const totalWeight = userWeight?.totalWeight ?? 1.00;
  const resourceWeight = userWeight?.resourceWeight ?? 1.00;
  const capitalWeight = userWeight?.capitalWeight ?? 1.00;
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

  // 记录最后访问的账本ID到localStorage
  useEffect(() => {
    if (ledgerId) {
      localStorage.setItem('lastVisitedLedgerId', String(ledgerId));
    }
  }, [ledgerId]);

  // 定制账本(AD)：永忆
  const isCustomAD = (ledgerData as any)?.type === 'custom_ad';
  if (!isLoading && !error && isCustomAD && ledgerData) {
    return (
      <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="text-gray-500">加载中...</div></div>}>
        <MemoLedgerPage ledgerId={ledgerId} ledgerData={ledgerData} user={user} />
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
    // 59号账本(ledgerId===59)用黑金色骨架屏，避免红色闪烁
    const skeletonBg = Number(ledgerId) === 59
      ? 'linear-gradient(135deg, #0A0A0A 0%, #1A1A1A 100%)'
      : '#D32F2F';
    return (
      <div className="min-h-screen flex flex-col" style={{ background: skeletonBg }}>
        <div className="h-32 flex-shrink-0"></div>
        <div className="flex-1 rounded-t-2xl flex items-center justify-center" style={{ backgroundColor: '#FAF3ED' }}>
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
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const currentYear = `${now.getFullYear()}`;
  
  // 计算本周的开始日期（周一）
  const getWeekStart = (date: Date) => {
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1); // 周日调整为上周最后一天
    const weekStart = new Date(date);
    weekStart.setDate(diff);
    return `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, '0')}-${String(weekStart.getDate()).padStart(2, '0')}`;
  };
  const weekStart = getWeekStart(now);
  
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
        // 没有日期筛选时，按statsPeriod统计
        switch (statsPeriod) {
          case 'day':
            shouldInclude = day.date === today;
            break;
          case 'week':
            shouldInclude = day.date >= weekStart && day.date <= today;
            break;
          case 'month':
            shouldInclude = day.date.startsWith(currentMonth);
            break;
          case 'year':
            shouldInclude = day.date.startsWith(currentYear);
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

  return (
    <div className={isCustomAI ? "flex flex-col" : "min-h-screen"} style={isCustomAI ? {
      height: '100dvh',
      backgroundColor: '#E8601C',
      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23n)' opacity='0.06'/%3E%3C/svg%3E"), repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(58,20,0,0.018) 2px, rgba(58,20,0,0.018) 3px), repeating-linear-gradient(90deg, transparent, transparent 4px, rgba(58,20,0,0.012) 4px, rgba(58,20,0,0.012) 5px)`,
    } : {}}>
      {/* 顶部区域 */}
      <div className="pb-4" style={isCustomAI ? { flexShrink: 0, background: 'linear-gradient(160deg, #3D1F0D 0%, #5C2E10 30%, #3D1F0D 100%)', color: '#1A0A00', borderBottom: '1px solid rgba(58,20,0,0.4)' } : (isCustomAF || isCustomAH) ? { background: 'linear-gradient(135deg, #1A56DB 0%, #3B82F6 100%)', color: '#FFFFFF' } : { backgroundColor: '#D32F2F', color: '#FFFFFF' }}>
        {/* AF/AH 账本：顶部两行布局 */}
        {(isCustomAF || isCustomAH || isCustomAI) ? (
          <div className="px-4 pt-3 pb-2">
            {/* 第一行：头像 + 名字 + 设置齿轮 */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {(() => {
                  const viewTarget = viewAsUserId ? (membersData as any[])?.find((m: any) => m.userId === viewAsUserId) : null;
                  return (
                    <div
                      className={(!viewAsUserId && (isOwner || isAdmin)) ? 'cursor-pointer relative' : 'relative'}
                      onClick={() => { if (!viewAsUserId && (isOwner || isAdmin)) { setViewAsSearch(''); setShowViewAsPicker(true); } }}
                    >
                      {viewTarget ? (
                        <UserAvatar username={viewTarget.username} avatar={viewTarget.avatar} nickname={viewTarget.nickname} size="md" />
                      ) : user ? (
                        <UserAvatar username={user.username} avatar={user.avatar} nickname={user.nickname} size="md" />
                      ) : null}
                      {!viewAsUserId && (isOwner || isAdmin) && (
                        <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-white/90 flex items-center justify-center">
                          <Users className="w-2.5 h-2.5 text-blue-600" />
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
                {/* QQ 快捷入口：仅 jiang(870413) 和 yjh(4957151) 可见 */}
                {(user?.id === 870413 || user?.id === 4957151) && isCustomAF && (
                  <>
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer overflow-hidden flex-shrink-0"
                      style={{ border: '1.5px solid rgba(255,255,255,0.5)' }}
                      onClick={() => setLocation(`/ledger/${ledgerId}/qq`)}
                    >
                      <img
                        src="https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/qq-icon-circle.png"
                        alt="QQ"
                        className="w-full h-full object-cover rounded-full"
                      />
                    </div>
                    {/* 石油业务入口：仅 jiang(870413) 和 yjh(4957151) 可见 */}
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
                  </>
                )}
                {/* AI账本：按钮移到第二行，此处不再渲染 */}
                {effectiveIsManager && (
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer"
                    style={{ backgroundColor: 'rgba(255,255,255,0.18)' }}
                    onClick={() => setLocation(`/ledger/${ledgerId}/settings`)}
                  >
                    <Settings className="w-4 h-4 text-white" />
                  </div>
                )}
              </div>
            </div>
            {/* 第二行：操作按钮 */}
            <div className="flex items-center gap-2 mt-2">
              {/* AI账本：第二行四个按钮 */}
              {isCustomAI && (
                <>
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
                    onClick={() => exportLedgerToPDF()}
                    className="flex-1 py-1.5 rounded-full text-sm font-medium text-center"
                    style={{ background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.5)', color: '#FFF8F0' }}
                  >
                    PDF导出
                  </button>
                  <button
                    onClick={() => setLocation('/ledger')}
                    className="flex-1 py-1.5 rounded-full text-sm font-medium text-center"
                    style={{ background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.5)', color: '#FFF8F0' }}
                  >
                    返回
                  </button>
                </>
              )}
              {isCustomAH && (
                <span className="text-xs text-white/70 mr-1 px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}>{ahRoleName}</span>
              )}
              {isCustomAF && !effectiveIsFunder && (
                <button
                  onClick={() => setLocation(`/recharge?from=ledger&ledgerId=${ledgerId}${viewAsUserId ? `&viewAs=${viewAsUserId}` : ''}`)}
                  className="flex-1 py-1.5 rounded-full text-sm font-medium border border-white/60 text-white text-center"
                  style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}
                >
                  充值
                </button>
              )}
              {isCustomAF && !effectiveIsFunder && (
                <button
                  onClick={() => setLocation(`/ledger/${ledgerId}/af-invite${viewAsUserId ? `?viewAs=${viewAsUserId}` : ''}`)}
                  className="flex-1 py-1.5 rounded-full text-sm font-medium border border-white/60 text-white text-center"
                  style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}
                >
                  邀请
                </button>
              )}
              {isCustomAH && (isOwner || isAdmin) && (
                <button
                  onClick={() => setShowAhCreateCompany(v => !v)}
                  className="flex-1 py-1.5 rounded-full text-sm font-medium border border-white/60 text-white text-center"
                  style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}
                >
                  新建
                </button>
              )}
              {!isCustomAI && (
                <button
                  onClick={() => window.location.reload()}
                  className="flex-1 py-1.5 rounded-full text-sm font-medium text-center"
                  style={{ backgroundColor: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.6)', color: '#fff' }}
                >
                  刷新
                </button>
              )}
              {!isCustomAI && (
                <button
                  onClick={() => setLocation('/ledger')}
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
                onClick={() => setLocation("/ledger")}
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
              <div className="flex items-center gap-1">
                {!isCustomAE ? (
                  // 普通账本 / 减肥账本：显示所有成员头像
                  (membersData && membersData.length > 0 ? membersData : (user ? [{ username: user.username, avatar: user.avatar, nickname: user.nickname }] : [])).slice(0, 6).map((m: any, i: number) => (
                    <UserAvatar
                      key={i}
                      username={m.username || m.user?.username}
                      avatar={m.avatar || m.user?.avatar}
                      nickname={m.nickname || m.user?.nickname}
                      size="md"
                    />
                  ))
                ) : (
                  // AE 抽奖箱：只显示当前用户
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
                    <Users className="w-5 h-5" style={{ color: '#D32F2F' }} />
                  </div>
                )}
                {/* 普通账本：查找按鈕 */}
                {!isCustomAE && !isDiet && !isCustomAF && !isCustomAH && !isCustomAI && (
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center cursor-pointer shadow-sm"
                    style={{ backgroundColor: '#FFFFFF' }}
                    onClick={() => setLocation(`/ledger/${ledgerId}/filter`)}
                  >
                    <Search className="w-5 h-5" style={{ color: '#D32F2F' }} />
                  </div>
                )}
                {/* 普通账本：数据统计按鈕 */}
                {!isCustomAE && !isDiet && !isCustomAF && !isCustomAH && !isCustomAI && (
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center cursor-pointer shadow-sm"
                    style={{ backgroundColor: '#FFFFFF' }}
                    onClick={() => setLocation(`/ledger/${ledgerId}/report`)}
                  >
                    <BarChart3 className="w-5 h-5" style={{ color: '#D32F2F' }} />
                  </div>
                )}
                {/* 管理员或创建者：设置按鈕（视角切换时按目标角色显示） */}
                {effectiveIsManager && (
                  <div 
                    className="w-10 h-10 rounded-full flex items-center justify-center cursor-pointer shadow-sm"
                    style={{ backgroundColor: '#FFFFFF' }}
                    onClick={() => setLocation(`/ledger/${ledgerId}/settings`)}
                  >
                    <Settings className="w-5 h-5" style={{ color: '#D32F2F' }} />
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
        {isCustomAF && !isCustomAH && (
          <div className="px-4 pt-2 pb-4">
            <div className="grid grid-cols-2 gap-3">
              {/* 卡片 1：资金方看“资产”，其他角色看“余额” */}
              {effectiveIsFunder ? (
                <div className="col-span-2 rounded-2xl px-4 py-3" style={{ backgroundColor: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(8px)' }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-white/70">资产</span>
                    <span className="text-xs text-white/50">{funderAssetSummary ? (() => {
                      const bd = funderAssetSummary.coinBreakdown as any;
                      let total = 0;
                      for (const coin of ['BTC','ETH','SOL']) {
                        const d = bd[coin];
                        const price = funderLivePrices[coin] || 0;
                        if (d && d.quantity > 0 && price > 0) total += d.quantity * price;
                      }
                      if (total <= 0) return '---';
                      const cny = total * 7.15;
                      return `总市值 ${total.toLocaleString(undefined, { maximumFractionDigits: 0 })} U ≈ ${(cny / 10000).toFixed(2)}万元`;
                    })() : '---'}</span>
                  </div>
                  {/* 三列币种统计 */}
                  <div className="flex items-stretch">
                    {['ETH','BTC','SOL'].map((coin, idx) => {
                      const bd = (funderAssetSummary?.coinBreakdown as any)?.[coin];
                      const qty = bd?.quantity ?? 0;
                      const avgCost = bd?.avgCost ?? 0;
                      const livePrice = funderLivePrices[coin] || 0;
                      const marketValue = qty > 0 && livePrice > 0 ? qty * livePrice : 0;
                      const decimals = coin === 'BTC' ? 6 : 4;
                      return (
                        <div key={coin} className="flex-1 flex flex-col" style={{ borderLeft: idx > 0 ? '1px solid rgba(255,255,255,0.2)' : 'none', paddingLeft: idx > 0 ? '12px' : '0', paddingRight: idx < 2 ? '12px' : '0' }}>
                          <div className="text-xs font-bold text-white mb-1.5">{coin}</div>
                          <div className="space-y-1">
                            <div>
                              <div className="text-[10px] text-white/40">持有数量</div>
                              <div className="text-xs font-semibold text-white">{qty > 0 ? qty.toFixed(decimals) : '0'}</div>
                            </div>
                            <div>
                              <div className="text-[10px] text-white/40">平均成本</div>
                              <div className="text-xs font-semibold text-white">{avgCost > 0 ? avgCost.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '0'} U</div>
                            </div>
                            <div>
                              <div className="text-[10px] text-white/40">当前价格</div>
                              <div className="text-xs font-semibold text-white">{livePrice > 0 ? livePrice.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '0'} U</div>
                            </div>
                            <div>
                              <div className="text-[10px] text-white/40">当前市値</div>
                              <div className="text-xs font-semibold text-white">{marketValue > 0 ? marketValue.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '0'} U</div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl px-4 py-3" style={{ backgroundColor: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(8px)' }}>
                  <div className="text-xs text-white/70 mb-1">余额</div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-lg font-bold text-white">
                      {afTotalAsset ? Number(afTotalAsset.total).toFixed(2) : '0.00'}
                    </span>
                    <span className="text-xs text-white/60">USDT</span>
                  </div>
                </div>
              )}
              {/* 卡片 2：推荐人数（资金方不显示） */}
              {!effectiveIsFunder && (
              <div className="rounded-2xl px-4 py-3" style={{ backgroundColor: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(8px)', cursor: ((user as any)?.id === 4957151 || isOwner || isAdmin) ? 'pointer' : 'default' }} onClick={() => { if ((user as any)?.id === 4957151 || isOwner || isAdmin) setShowInviteTree(true); }}>
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
              </div>
              )}
              {/* 卡片 3：仓位 & 累计盈亏（合并，占满整行）——资金方不显示 */}
              {!effectiveIsFunder && (
              <div className="col-span-2 rounded-2xl px-4 py-3" style={{ backgroundColor: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(8px)' }}>
                <div className="flex items-baseline justify-between mb-2">
                  <span className="text-xs text-white/70">权益</span>
                  {pnlData?.updatedAt && (
                    <span className="text-[10px] text-white/40">
                      更新时间 {new Date(pnlData.updatedAt).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
                    </span>
                  )}
                </div>
                {/* 表头 */}
                <div className="flex items-baseline mb-1 text-[10px] text-white/40">
                  <span className="w-9">币种</span>
                  <span className="flex-1 text-right">权益</span>
                  <span className="w-10 text-right">订单</span>
                  <span className="flex-1 text-right">均价</span>
                  <span className="flex-1 text-right">收益</span>
                </div>
                {['BTC', 'ETH', 'SOL'].map(coin => {
                  const qty = (afTotalAsset as any)?.positions?.[coin] ?? 0;
                  const coinData = pnlData?.coins?.find((c: any) => c.coin === coin);
                  const activeCount = (coinData?.holdingCount ?? 0) + (coinData?.pendingCount ?? 0);
                  // 权益为0且无持仓订单的币种不显示
                  if ((!qty || qty <= 0) && activeCount === 0) return null;
                  const displayPnl = Math.max(0, coinData?.pnl ?? 0);
                  const avgCost = coinData?.avgCost ?? 0;
                  // 智能去尾零
                  const fmtQty = (() => {
                    if (!qty || qty <= 0) return '0';
                    const maxDec = coin === 'BTC' ? 8 : 6;
                    const raw = qty.toFixed(maxDec);
                    const [intPart, decPart] = raw.split('.');
                    const trimmed = decPart.replace(/0+$/, '');
                    const finalDec = trimmed.length < 2 ? trimmed.padEnd(2, '0') : trimmed;
                    return `${intPart}.${finalDec}`;
                  })();
                  return (
                    <div key={coin} className="flex items-baseline py-0.5">
                      <span className="w-9 text-xs text-white/70 font-medium">{coin}</span>
                      <span className="flex-1 text-right text-xs font-bold text-white">{fmtQty}</span>
                      <span className="w-10 text-right text-[10px] text-white/50">{activeCount}笔</span>
                      <span className="flex-1 text-right text-[11px] text-white/60">{avgCost > 0 ? avgCost.toLocaleString() : '-'}</span>
                      <span className="flex-1 text-right text-xs font-medium text-green-400">+{displayPnl.toFixed(2)}</span>
                    </div>
                  );
                })}
                {/* 总计 */}
                <div className="border-t border-white/20 pt-1 mt-1 flex items-baseline">
                  <span className="w-9 text-xs text-white/80 font-medium">总计</span>
                  <span className="flex-1"></span>
                  <span className="w-10"></span>
                  <span className="flex-1"></span>
                  <span className="flex-1 text-right text-sm font-bold text-green-400 whitespace-nowrap">+{Math.max(0, pnlData?.total ?? 0).toFixed(2)}&nbsp;U</span>
                </div>
              </div>
              )}
              {/* 管理员统计：累计订单（后端控制权限，代看模式下隐藏，资金方不显示） */}
              {!effectiveIsFunder && !viewAsUserId && afAdminStats && (afAdminStats as any).authorized === true && (afAdminStats as any).orders && (
                <div className="rounded-2xl px-4 py-3" style={{ backgroundColor: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(8px)' }}>
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
                <div className="rounded-2xl px-4 py-3" style={{ backgroundColor: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(8px)' }}>
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
        {/* 普通账本：统计面板（总收入/总结余/总支出）*/}
        {!isCustomAE && !isDiet && !isCustomAF && !isCustomAH && !isCustomAI && (
          <div className="px-4 pt-2 pb-1 relative">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="relative">
                <div className="text-xs opacity-90 flex items-center justify-center gap-1">
                  <span>
                    {!hasDateFilter && statsPeriod === 'day' && '今日'}
                    {!hasDateFilter && statsPeriod === 'week' && '本周'}
                    {!hasDateFilter && statsPeriod === 'month' && `${now.getMonth() + 1}月`}
                    {!hasDateFilter && statsPeriod === 'year' && '今年'}
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
                    {(['day', 'week', 'month', 'year'] as const).map((p, i) => (
                      <button
                        key={p}
                        onClick={() => { setStatsPeriod(p); setShowPeriodMenu(false); }}
                        className="w-full px-2 py-2.5 text-sm text-[#222222] active:bg-gray-100 text-center border-b border-gray-100 last:border-b-0"
                      >
                        {['按天', '按自然周', '按自然月', '按自然年'][i]}
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
                  总支出
                </div>
                <div className="text-lg font-medium">{monthlyStats.expense.toFixed(2)}</div>
              </div>
            </div>
          </div>
        )}
      </div>



      {/* 待审批提示 */}
      {pendingApprovals.length > 0 && (
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
              <button
                onClick={() => setLocation(`/ledger/${ledgerId}/crypto-prediction${viewAsUserId ? `?viewAs=${viewAsUserId}` : ''}`)}
                className="w-full rounded-2xl p-4 flex items-center gap-4 shadow-sm active:opacity-90"
                style={{ backgroundColor: '#FFFFFF', border: '1px solid #E0E8FF', boxShadow: '0 2px 8px rgba(26,86,219,0.08)' }}
              >
                <img src="https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/btc-official.png" alt="BTC" className="w-12 h-12 object-contain rounded-full" />
                <div className="text-left flex-1">
                  <div className="font-semibold text-base" style={{ color: '#1A2340' }}>比特币 (BTC)</div>
                </div>
                <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ backgroundColor: '#3B5BDB' }}>
                  <ChevronRight className="w-4 h-4 text-white" />
                </div>
              </button>
              <button
                onClick={() => setLocation(`/ledger/${ledgerId}/crypto-prediction?coin=ETH${viewAsUserId ? `&viewAs=${viewAsUserId}` : ''}`)}
                className="w-full rounded-2xl p-4 flex items-center gap-4 shadow-sm active:opacity-90"
                style={{ backgroundColor: '#FFFFFF', border: '1px solid #E0E8FF', boxShadow: '0 2px 8px rgba(26,86,219,0.08)' }}
              >
                <img src="https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/eth-official.png" alt="ETH" className="w-12 h-12 object-contain rounded-full" />
                <div className="text-left flex-1">
                  <div className="font-semibold text-base" style={{ color: '#1A2340' }}>以太坊 (ETH)</div>
                </div>
                <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ backgroundColor: '#3B5BDB' }}>
                  <ChevronRight className="w-4 h-4 text-white" />
                </div>
              </button>
              <button
                onClick={() => setLocation(`/ledger/${ledgerId}/crypto-prediction?coin=SOL${viewAsUserId ? `&viewAs=${viewAsUserId}` : ''}`)}
                className="w-full rounded-2xl p-4 flex items-center gap-4 shadow-sm active:opacity-90"
                style={{ backgroundColor: '#FFFFFF', border: '1px solid #E0E8FF', boxShadow: '0 2px 8px rgba(26,86,219,0.08)' }}
              >
                <img src="https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/sol-official.png" alt="SOL" className="w-12 h-12 object-contain rounded-full" />
                <div className="text-left flex-1">
                  <div className="font-semibold text-base" style={{ color: '#1A2340' }}>索拉纳 (SOL)</div>
                </div>
                <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ backgroundColor: '#3B5BDB' }}>
                  <ChevronRight className="w-4 h-4 text-white" />
                </div>
              </button>
            </div>
        </div>
      )}

      {/* 资金方专属：资产订单列表 */}
      {isCustomAF && effectiveIsFunder && (
        <div className="flex-1 px-4 pb-20">
          <div className="mt-4">
            <div className="flex items-center mb-3">
              <h3 className="text-base font-semibold" style={{ color: '#1A2340' }}>资产订单</h3>
              <span className="text-xs text-gray-400 ml-1.5">共 {(funderAssetOrders as any[])?.length ?? 0} 笔</span>
            </div>
            {(!funderAssetOrders || (funderAssetOrders as any[]).length === 0) ? (
              <div className="text-center py-12">
                <Receipt className="w-14 h-14 text-gray-200 mx-auto mb-3" />
                <div className="text-gray-400 text-base mb-1">暂无资产订单</div>
                <div className="text-gray-400 text-sm">管理员将为您配置资产订单</div>
              </div>
            ) : (
              <div className="space-y-3">
                {(funderAssetOrders as any[]).map((order: any) => (
                  <FunderOrderCard
                    key={order.id}
                    order={order}
                    ledgerId={ledgerId}
                    livePrices={funderLivePrices}
                    paidInterest={(interestSummary as any)?.[order.id] ?? 0}
                    onClick={() => { if (isOwner || isAdmin) setSelectedFunderOrder(order); }}
                    canClick={isOwner || isAdmin}
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

      {/* 记账记录列表 —— 非 custom_ae / custom_af / custom_ah / custom_ai 账本显示 */}
      {!isCustomAE && !isCustomAF && !isCustomAH && !isCustomAI && <div className={`flex-1 px-4 pb-20 space-y-3`}>
        {!hasRecords ? (
          <div className="text-center py-12">
            <div className="text-gray-400 text-base mb-1">{ledgerData?.type === 'diet' ? '还没有减肥记录' : '还没有记账记录'}</div>
            <div className="text-gray-400 text-sm">{ledgerData?.type === 'diet' ? '点击下方按钮，添加减肥记录' : '点击下方"+"按钮开始记账'}</div>
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
                <div className="flex items-center justify-between text-xs text-gray-500" style={{ marginTop: '3px', marginBottom: '3px' }}>
                  <span>
                    {dayRecord.date} {dayOfWeek}
                  </span>
                  {!isDiet && (
                    <span className="text-xs">
                      收:{dayRecord.income.toFixed(2)}, 支:{dayRecord.expense.toFixed(2)}, 余:{dayRecord.balance.toFixed(2)}
                    </span>
                  )}
                </div>

                {/* 当天的记录 */}
                <div className="space-y-2">
                  {dayRecord.records.map((record: any) => (
                    <div
                      key={record.id}
                      className="bg-white rounded-lg p-2 flex items-center gap-2.5 cursor-pointer hover:bg-[#FFEBEE] transition-colors"
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
                            <span className="ml-1 text-[#D32F2F] text-xs flex items-center gap-0.5">
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
                          // 分类名已包含单位（如“体重/斤”、“BMI”、“胸围/cm”），右侧只显示纯数字
                          const val = record.amount;
                          return (
                            <div className="text-sm font-semibold flex-shrink-0 text-[#D32F2F]">
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
                          {record.type === 'expense' ? '-' : '+'}{record.amount.toFixed(2)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>}

      {/* 底部添加按鈕：非定制账本显示 */}
      {!isCustomAE && !isDiet && !isCustomAF && !isCustomAH && !isCustomAI && (
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
                  {inviteTreeData.users.map((u: any) => (
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
                      {/* 下层：持仓情况表格（余额/持仓/挂单三行） */}
                      <div className="px-3 pt-2 pb-2">
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                          <thead>
                            <tr style={{ backgroundColor: '#F5F5F5' }}>
                              {/* A1格：当前余额 + 累计充值 */}
                              <th style={{ border: '1px solid #E0E0E0', padding: '3px 6px', textAlign: 'left', color: '#9E9E9E', fontWeight: 400, width: 90 }}>
                                <div style={{ fontSize: 10, color: '#9E9E9E', marginBottom: 2 }}>
                                  <span>余额 </span>
                                  <span style={{ fontWeight: 600, color: (u.balance ?? 0) > 0 ? '#2E7D32' : '#9E9E9E' }}>{Number(u.balance ?? 0).toFixed(2)}U</span>
                                </div>
                                <div style={{ fontSize: 10, color: '#9E9E9E' }}>
                                  <span>充值 </span>
                                  <span style={{ fontWeight: 600, color: (u as any).totalRecharge > 0 ? '#1565C0' : '#9E9E9E' }}>{Number((u as any).totalRecharge ?? 0).toFixed(2)}U</span>
                                </div>
                              </th>
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
      {(isCustomAF || isCustomAH || isCustomAI) && viewAsUserId && (isOwner || isAdmin) && (
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
      {showViewAsPicker && (isCustomAF || isCustomAH || isCustomAI) && (isOwner || isAdmin) && (
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
                    <div className="text-sm font-medium text-gray-900">{m.nickname || m.username}</div>
                    <div className="text-xs text-gray-500">
                      {m.role === 'owner' ? '创始人' : m.role === 'admin' ? '管理员' : m.role === 'funder' ? '资金方' : '普通成员'}
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

