/**
 * 抽奖活动详情页 —— 信任驱动型架构
 * 路由：/lottery/:activityId
 * 布局（从上到下）：
 *   1. Hero 区（奖品大图 + 状态 + 倒计时）
 *   2. 我的抽奖码
 *   3. 第三方开奖校验区（股票行情看板 / 彩票球形序列）
 *   4. 开奖算法公式
 *   5. 历史开奖回顾
 *   6. 奖项详情
 *   7. 参与者名单（头像阵列 + 实时滚动）
 *   8. 底部固定按钮
 */
import { useState, useEffect, useRef } from "react";
import Tooltip from '@/components/Tooltip';
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  ChevronLeft,
  Trophy,
  Users,
  Clock,
  Gift,
  CheckCircle,
  ExternalLink,
  TrendingUp,
  TrendingDown,
  Loader,
  ShieldCheck,
  Hash,
  Flame,
  Star,
} from "lucide-react";

// ─── 配色常量（深色系，与网站13色系一致）────────────────────────────────────
const C = {
  red: '#D32F2F',
  redDark: '#B71C1C',
  redLight: '#FFEBEE',
  redTint: '#FFF5F5',       // 品牌主色极浅淡化版（10-15%饱和度）
  gold: '#CBA471',
  goldLight: '#FFF8E1',
  bg: '#FAF3ED',            // 页面大背景（最浅中性暖色）
  card: '#FFFFFF',          // 卡片容器（比背景更亮一梯度）
  text: '#1A1A1A',          // 一级标题（最深中性色）
  sub: '#757575',           // 次要说明（中性灰）
  muted: '#BDBDBD',         // 更淡的次要色（链接、箭头等）
  border: '#EEEEEE',        // 容器描边（最浅中性色）
  borderMid: '#E0E0E0',     // 中等描边
  // 外部数据区（深色底，视觉区隔）
  darkBg: '#1C1C2E',
  darkCard: '#16213E',
  darkBorder: '#2A2A4A',
  darkText: '#F0F0F0',
  darkSub: '#9E9E9E',
  // 状态色
  stockUp: '#EF5350',
  stockDown: '#26A69A',
  lotteryRed: '#D32F2F',
  lotteryBlue: '#1565C0',
  // 链接/验证色（辅助蓝）
  linkBlue: '#1565C0',
  linkBlueBg: '#E3F2FD',
  // 等待状态
  waitBg: '#F5F5F5',
  waitText: '#9E9E9E',
  // 算法公式框
  formulaBg: '#F8F6FF',     // 极浅次要色（紫调）
  formulaBorder: '#E8E4F0', // 同色系稍深描边
};

// ─── 倒计时 Hook ─────────────────────────────────────────────────────────────
function useCountdown(targetTime: string | null) {
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    if (!targetTime) return;
    const update = () => setRemaining(Math.max(0, new Date(targetTime).getTime() - Date.now()));
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, [targetTime]);
  const d = Math.floor(remaining / 86400000);
  const h = Math.floor((remaining % 86400000) / 3600000);
  const m = Math.floor((remaining % 3600000) / 60000);
  const s = Math.floor((remaining % 60000) / 1000);
  return { remaining, d, h, m, s };
}

// ─── 股票行情看板 ─────────────────────────────────────────────────────────────
function SeedTimingInfo({ seedValue, seedSource, drawAt, seedDate, seedType }: {
  seedValue?: string | null;
  seedSource?: string | null;
  drawAt?: string | null;
  seedDate?: string | null;
  seedType?: string | null;
}) {
  const isStock = seedType === 'sh_index' || seedType === 'sz_index';
  // 用北京时间（UTC+8）计算目标时间：股票收盘 15:00 BJT = UTC 07:00，彩票开奖 22:00 BJT = UTC 14:00
  const getTargetTime = (): Date | null => {
    const dateStr = seedDate ?? drawAt;
    if (!dateStr) return null;
    // 从日期字符串提取 YYYY-MM-DD 部分（兼容 ISO 字符串和纯日期字符串）
    const datePart = String(dateStr).slice(0, 10); // "2026-03-10"
    if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return null;
    // 直接用 UTC 时间构造北京时间的 15:00 / 22:00
    // 北京时间 15:00 = UTC 07:00，北京时间 22:00 = UTC 14:00
    const utcHour = isStock ? 7 : 14;
    const t = new Date(`${datePart}T${String(utcHour).padStart(2,'0')}:00:00.000Z`);
    if (isNaN(t.getTime())) return null;
    return t;
  };
  const targetTime = getTargetTime();
  // 收盘/开奖后 30 分钟为预计数据获取时间
  const DATA_FETCH_DELAY_MS = 30 * 60 * 1000;
  const fetchDeadline = targetTime ? new Date(targetTime.getTime() + DATA_FETCH_DELAY_MS) : null;
  const countdown = useCountdown(targetTime ? targetTime.toISOString() : null);
  const fetchCountdown = useCountdown(fetchDeadline ? fetchDeadline.toISOString() : null);
  const now = Date.now();
  const hasData = !!seedValue;
  // 从 seedSource 解析获取时间
  let fetchedAt: string | null = null;
  if (seedSource) {
    try {
      const p = JSON.parse(seedSource);
      if (p.time) fetchedAt = String(p.time);
      else if (p.fetchedAt) fetchedAt = String(p.fetchedAt);
    } catch {}
  }
  const isPast = targetTime ? now > targetTime.getTime() : false;
  const isFetchPast = fetchDeadline ? now > fetchDeadline.getTime() : false;
  return (
    <div className="px-4 pb-3 pt-2 flex items-center gap-1.5 flex-wrap" style={{ borderTop: `1px solid ${C.darkBorder}` }}>
      <Clock className="w-3 h-3 flex-shrink-0" style={{ color: C.darkSub }} />
      {hasData ? (
        <span className="text-xs font-mono" style={{ color: C.darkSub }}>
          数据已获取{fetchedAt ? `·${fetchedAt}` : (seedDate ? `·${seedDate}` : '')}
        </span>
      ) : isPast ? (
        isFetchPast ? (
          <span className="text-xs font-mono" style={{ color: '#FBBF24' }}>
            {isStock ? '收盘后' : '开奖后'}数据获取中，请稍候...
          </span>
        ) : (
          <span className="text-xs font-mono flex items-center gap-1.5" style={{ color: '#FBBF24' }}>
            <span>距数据获取还剩</span>
            <span
              className="font-mono px-1.5 py-0.5 rounded"
              style={{ background: 'rgba(251,191,36,0.15)', color: '#FBBF24', letterSpacing: '0.05em' }}
            >
              {fetchCountdown.h > 0 && `${String(fetchCountdown.h).padStart(2,'0')}:`}{String(fetchCountdown.m).padStart(2,'0')}:{String(fetchCountdown.s).padStart(2,'0')}
            </span>
          </span>
        )
      ) : targetTime ? (
        <span className="text-xs font-mono" style={{ color: C.darkSub }}>
          距{isStock ? '收盘' : '开奖'}还有&nbsp;
          {countdown.d > 0 && <span style={{ color: C.darkText }}>{countdown.d}天</span>}
          {(countdown.d > 0 || countdown.h > 0) && <span style={{ color: C.darkText }}>{countdown.h}时</span>}
          <span style={{ color: C.darkText }}>{countdown.m}分{countdown.s}秒</span>
          &nbsp;·&nbsp;北京时间 {isStock ? '15:00 收盘' : '22:00 开奖'}
        </span>
      ) : (
        <span className="text-xs font-mono" style={{ color: C.darkSub }}>等待开奖日期确定...</span>
      )}
    </div>
  );
}

function StockBoard({ seedType, seedValue, seedSource, drawAt, seedDate }: {
  seedType: string;
  seedValue?: string | null;
  seedSource?: string | null;
  drawAt?: string | null;
  seedDate?: string | null;
}) {
  const indexName = seedType === 'sh_index' ? '上证指数' : '深证成指';
  const indexCode = seedType === 'sh_index' ? '000001.SH' : '399001.SZ';
  const sinaUrl = seedType === 'sh_index'
    ? 'https://finance.sina.com.cn/realstock/company/sh000001/nc.shtml'
    : 'https://finance.sina.com.cn/realstock/company/sz399001/nc.shtml';

  // 解析 seedValue（格式如 "3456.78" 或从 seedSource JSON 中取）
  let price: string | null = null;
  let change: string | null = null;
  let isUp = true;
  let tailDigits: string | null = null;

  if (seedValue) {
    price = seedValue;
    const num = parseFloat(seedValue);
    if (!isNaN(num)) {
      const str = num.toFixed(2);
      tailDigits = str.replace('.', '').slice(-2);
    }
  }
  if (seedSource) {
    try {
      const parsed = JSON.parse(seedSource);
      if (parsed.price) price = String(parsed.price);
      if (parsed.change) { change = String(parsed.change); isUp = parseFloat(parsed.change) >= 0; }
      if (parsed.close) {
        const str = parseFloat(parsed.close).toFixed(2).replace('.', '');
        tailDigits = str.slice(-2);
      }
    } catch {}
  }

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: C.darkBg, border: `1px solid ${C.darkBorder}` }}>
      {/* 标题栏：深色底 */}
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${C.darkBorder}` }}>
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold" style={{ color: C.darkText }}>{indexName}</span>
          <span className="text-[10px] font-mono" style={{ color: C.darkSub }}>{indexCode}</span>
        </div>
        <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(203,164,113,0.15)', color: C.gold, border: `1px solid rgba(203,164,113,0.3)` }}>官方数据源</span>
      </div>

      {/* 指数名称 + 价格 */}
      <div className="px-4 pt-4 pb-3">
        {price ? (
          <div className="flex items-end gap-3">
            {/* 数字标牌字体，视觉上与 App 文本隔离 */}
            <span
              className="text-4xl font-bold"
              style={{ color: isUp ? C.stockUp : C.stockDown, fontFamily: "'Courier New', 'Roboto Mono', monospace", letterSpacing: '0.02em' }}
            >
              {price}
            </span>
            {change && (
              <div className="flex items-center gap-1 mb-1">
                {isUp ? <TrendingUp className="w-4 h-4" style={{ color: C.stockUp }} /> : <TrendingDown className="w-4 h-4" style={{ color: C.stockDown }} />}
                <span className="text-sm font-mono" style={{ color: isUp ? C.stockUp : C.stockDown }}>{change}</span>
              </div>
            )}
          </div>
        ) : (
          // 待获取状态：展示框（不是输入框）+ 脱冲动效
          <div>
            <div
              className="rounded-xl px-4 py-3 mb-2"
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: `1px solid rgba(255,255,255,0.12)`,
              }}
            >
              <div className="flex items-center gap-2">
                {/* 脱骨屏脆山脸动效块 */}
                <div
                  className="h-7 rounded"
                  style={{
                    width: '120px',
                    background: 'linear-gradient(90deg, rgba(255,255,255,0.06) 25%, rgba(255,255,255,0.12) 50%, rgba(255,255,255,0.06) 75%)',
                    backgroundSize: '200% 100%',
                    animation: 'shimmer 1.8s infinite',
                  }}
                />
                <span
                  className="text-xs px-2 py-0.5 rounded font-semibold"
                  style={{ background: 'rgba(217,119,6,0.2)', color: '#FBBF24', border: '1px solid rgba(217,119,6,0.3)' }}
                >
                  官方结算中...
                </span>
              </div>
              <div className="text-xs mt-2" style={{ color: C.darkSub }}>
                将于开奖当天封盘后自动获取：
                <span style={{ color: C.gold }}>
                  {seedDate
                    ? `${seedDate} 北京时间 15:00 ${indexName}收盘价`
                    : `开奖当天北京时间 15:00 ${indexName}收盘价`
                  }
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 尾数提取区 */}
      {tailDigits && (
        <div className="mx-4 mb-4 rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${C.darkBorder}` }}>
          <div className="text-xs mb-2 flex items-center gap-1" style={{ color: C.darkSub }}>
            <Hash className="w-3 h-3" />
            <span>收盘价尾数提取</span>
          </div>
          {/* 三列线性排版：原始收盘价 → 取数逻辑 → 开奖基数 */}
          <div className="flex items-center gap-2">
            {/* 左：原始收盘价 */}
            <div className="flex flex-col items-center">
              <span className="text-[10px] mb-1" style={{ color: C.darkSub }}>原始收盘价</span>
              <span className="font-mono text-sm" style={{ color: C.darkText }}>
                {price?.split('.')[0]}.<span style={{ color: C.red, fontWeight: 700 }}>{price?.split('.')[1] ?? tailDigits}</span>
              </span>
            </div>
            {/* 中：取数逻辑 */}
            <div className="flex flex-col items-center px-1">
              <span className="text-[10px] mb-1" style={{ color: C.darkSub }}>取数逻辑</span>
              <span className="text-xs" style={{ color: C.muted }}>→ 取末两位 →</span>
            </div>
            {/* 右：开奖基数 */}
            <div className="flex flex-col items-center">
              <span className="text-[10px] mb-1" style={{ color: C.darkSub }}>开奖基数</span>
              <div className="flex gap-1">
                {tailDigits.split('').map((d, i) => (
                  <span
                    key={i}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-lg font-bold"
                    style={{ background: C.red, color: '#fff', fontFamily: "'Courier New', monospace" }}
                  >
                    {d}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 底部：验证链接 */}
      <div className="px-4 pb-4" style={{ borderTop: `1px solid ${C.darkBorder}` }}>
        <div className="flex items-center justify-between pt-3">
          <a
            href={sinaUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs"
            style={{ color: '#64B5F6' }}
            onClick={e => e.stopPropagation()}
          >
            <span>新浪财经原始数据</span>
          </a>
          <a
            href={sinaUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center"
            style={{ color: '#64B5F6' }}
            onClick={e => e.stopPropagation()}
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
      {/* 数据获取时间提示 */}
      <SeedTimingInfo seedValue={seedValue} seedSource={seedSource} drawAt={drawAt} seedDate={seedDate} seedType={seedType} />
    </div>
  );
}

// ─── 彩票球形序列 ─────────────────────────────────────────────────────────────
function LotteryBalls({ seedType, seedValue, seedSource, drawAt, seedDate }: {
  seedType: string;
  seedValue?: string | null;
  seedSource?: string | null;
  drawAt?: string | null;
  seedDate?: string | null;
}) {
  const isSSQ = seedType === 'ssq';
  const lotteryName = isSSQ ? '双色球' : '超级大乐透';
  const officialUrl = isSSQ
    ? 'https://www.cwl.gov.cn/ygkj/wqkjgg/ssq/'
    : 'https://www.lottery.gov.cn/kj/kjlb.html?dlt';

  // 解析号码
  let redBalls: string[] = [];
  let blueBalls: string[] = [];
  let issueNo = '';
  let drawTime = '';

  if (seedSource) {
    try {
      const parsed = JSON.parse(seedSource);
      if (parsed.red) redBalls = String(parsed.red).split(',').map((s: string) => s.trim().padStart(2, '0'));
      if (parsed.blue) blueBalls = String(parsed.blue).split(',').map((s: string) => s.trim().padStart(2, '0'));
      if (parsed.issue) issueNo = String(parsed.issue);
      if (parsed.time) drawTime = String(parsed.time);
    } catch {}
  }
  if (seedValue && redBalls.length === 0) {
    // fallback: seedValue 格式 "01,02,03,04,05,06+07"
    const parts = seedValue.split('+');
    redBalls = (parts[0] || '').split(',').map(s => s.trim().padStart(2, '0'));
    blueBalls = (parts[1] || '').split(',').map(s => s.trim().padStart(2, '0'));
  }

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: C.darkBg, border: `1px solid ${C.darkBorder}` }}>
      {/* 标题栏：深色底 + 外部数据源标识 */}
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${C.darkBorder}` }}>
        <div className="flex items-center gap-2">
          <Gift className="w-3.5 h-3.5" style={{ color: C.gold }} />
          <span className="text-xs font-semibold" style={{ color: C.darkText }}>{lotteryName}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(203,164,113,0.15)', color: C.gold, border: `1px solid rgba(203,164,113,0.3)` }}>官方数据源</span>
        </div>
        {issueNo && (
          <span className="text-[11px] font-mono" style={{ color: C.darkSub }}>第 {issueNo} 期</span>
        )}
      </div>

      {/* 球形序列 */}
      <div className="px-4 py-5">
        {redBalls.length > 0 ? (
          <>
            <div className="flex flex-wrap gap-2 justify-center mb-3">
              {redBalls.map((n, i) => (
                <div
                  key={i}
                  className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white"
                  style={{
                    background: 'radial-gradient(circle at 35% 35%, #EF5350, #B71C1C)',
                    boxShadow: '0 3px 8px rgba(183,28,28,0.4), inset 0 1px 2px rgba(255,255,255,0.3)',
                    fontFamily: "'Courier New', monospace",
                  }}
                >
                  {n}
                </div>
              ))}
              {blueBalls.map((n, i) => (
                <div
                  key={`b${i}`}
                  className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white"
                  style={{
                    background: 'radial-gradient(circle at 35% 35%, #42A5F5, #1565C0)',
                    boxShadow: '0 3px 8px rgba(21,101,192,0.4), inset 0 1px 2px rgba(255,255,255,0.3)',
                    fontFamily: "'Courier New', monospace",
                  }}
                >
                  {n}
                </div>
              ))}
            </div>
            {drawTime && (
              <div className="text-center text-xs" style={{ color: C.darkSub }}>
                开奖时间：{drawTime}
              </div>
            )}
          </>
        ) : (
          // 待获取状态：展示框 + 脱骨屏动效
          <div>
            <div
              className="rounded-xl px-4 py-3 mb-3"
              style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid rgba(255,255,255,0.12)` }}
            >
              <div className="flex items-center gap-2 mb-2">
                <div className="flex gap-1.5">
                  {Array.from({ length: isSSQ ? 7 : 7 }).map((_, i) => (
                    <div
                      key={i}
                      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                      style={{
                        background: i < (isSSQ ? 6 : 5) ? 'rgba(239,83,80,0.15)' : 'rgba(66,165,245,0.15)',
                        color: 'rgba(255,255,255,0.25)',
                        border: `1px dashed rgba(255,255,255,0.15)`,
                      }}
                    >?</div>
                  ))}
                </div>
                <span
                  className="text-xs px-2 py-0.5 rounded font-semibold flex-shrink-0"
                  style={{ background: 'rgba(217,119,6,0.2)', color: '#FBBF24', border: '1px solid rgba(217,119,6,0.3)' }}
                >
                  官方结算中...
                </span>
              </div>
              <div className="text-xs" style={{ color: C.darkSub }}>
                将于开奖当天自动获取：
                <span style={{ color: C.gold }}>
                  {seedDate
                    ? `${seedDate} 北京时间 22:00 ${lotteryName}开奖号码`
                    : `开奖当天北京时间 22:00 ${lotteryName}开奖号码`
                  }
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 底部：验证链接（辅助蓝色） */}
      <div className="px-4 pb-4" style={{ borderTop: `1px solid ${C.darkBorder}` }}>
        <a
          href={officialUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs pt-3"
          style={{ color: '#64B5F6' }}
          onClick={e => e.stopPropagation()}
        >
          <ExternalLink className="w-3.5 h-3.5" />
          <span style={{ textDecoration: 'underline', textUnderlineOffset: '2px' }}>去官方彩票网站验证原始数据</span>
          <span style={{ color: C.darkSub }}>（官方来源）</span>
        </a>
      </div>
      {/* 数据获取时间提示 */}
      <SeedTimingInfo seedValue={seedValue} seedSource={seedSource} drawAt={drawAt} seedDate={seedDate} seedType={seedType} />
    </div>
  );
}

// ─── 算法公式展示 ─────────────────────────────────────────────────────────────
function AlgorithmBox({ seedType, mode, seedDate, participantCount, participantScale, activityId }: {
  seedType?: string | null;
  mode: string;
  seedDate?: string | null;
  participantCount?: number;
  participantScale?: string | null;
  activityId?: number;
}) {
  const isStock = seedType === 'sh_index' || seedType === 'sz_index';
  const isLottery = seedType === 'ssq' || seedType === 'dlt';
  const seedLabel = {
    sh_index: '上证指数收盘价尾数', sz_index: '深证指数收盘价尾数',
    ssq: '双色球红球号码之和', dlt: '大乐透前区号码之和',
  }[seedType ?? ''] ?? '随机种子';

  // 查询真实参与者列表
  const { data: participantsData } = trpc.lottery.getPublicParticipants.useQuery(
    { activityId: activityId! },
    { enabled: !!activityId }
  );
  const realParticipants: any[] = (participantsData as any[]) ?? [];

  // 实际人数：优先用真实参与者数量，其次用 participantCount，默认3；至少为 1，防止除以零崩溃
  const actualN = Math.max(1,
    realParticipants.length > 0 ? realParticipants.length
    : (participantCount && participantCount > 0 ? participantCount : 3)
  );
  // 对照表展示上限
  const exampleN = actualN;
  // 编号位数（编号从 00 开始）
  const digits = actualN <= 100 ? 2 : actualN < 1000 ? 3 : 4;
  const fmtNo = (n: number) => String(n).padStart(digits, '0');

  const [showTip, setShowTip] = useState(false);
  const algoHelpRef = useRef<HTMLButtonElement>(null);
  const [showProbDetail, setShowProbDetail] = useState(false);

  return (
    <div className="rounded-2xl p-4" style={{ background: C.card, border: `1px solid ${C.border}` }}>

      {/* 实例说明 */}
      {(isStock || isLottery) ? (
        <div className="space-y-3">
          {/* 取数方式 + 对照表 — 合并为一个卡片 */}
          {(() => {
            const intPart = '4162';
            // 计算每个编号获得的尾数数量（编号从 00 开始，即索引 0~N-1）
            const countPerPerson: number[] = Array(exampleN).fill(0);
            for (let t = 0; t <= 99; t++) {
              const person = t % exampleN; // 余数直接对应编号（从 0 开始）
              countPerPerson[person]++;
            }
            // 对照表行数：1人→1行(100%)，2人→2行，3+人→每人一行（最多展示9行）
            // 使用伪随机打乱：看起来随机但每个参与者恰好被算到一次
            let exampleTails: number[];
            if (exampleN === 1) {
              exampleTails = [88]; // 1人必中，只展示1行
            } else if (exampleN === 2) {
              exampleTails = [88, 25]; // 2人展示2行
            } else {
              // 3人以上：每人展示1个代表性尾数，看起来随机但每人恰好出现一次
              const displayN = Math.min(exampleN, 9);
              // 为每个编号 idx 选一个该编号对应的尾数（尾数 t 满足 t % exampleN === idx）
              // 每个编号对应的尾数列表中，选一个看起来不是第一个的（用一个固定偏移量模拟随机感）
              const offsets = [3, 7, 1, 5, 9, 2, 8, 4, 6]; // 预设偏移量，看起来随机
              exampleTails = Array.from({ length: displayN }, (_, i) => {
                // 尾数 t 满足 t % exampleN === i 的列表：t = i, i+N, i+2N, ...
                const tailsForIdx: number[] = [];
                for (let t = i; t <= 99; t += exampleN) tailsForIdx.push(t);
                // 用偏移量选一个看起来不是顺序的尾数
                const offset = offsets[i % offsets.length];
                return tailsForIdx[offset % tailsForIdx.length];
              });
            }
            const rows = exampleTails.map(tail => {
              const tailStr = String(tail).padStart(2, '0');
              const remainder = tail % exampleN;
              const winner = remainder; // 余数直接就是中奖编号（00号开始）
              const participant = realParticipants[winner]; // 对应的真实参与者（0-indexed）
              return { tail, tailStr, remainder, winner, participant };
            });
            return (
              <div className="text-xs rounded-xl overflow-hidden" style={{ border: `1px solid ${C.formulaBorder}`, background: C.formulaBg }}>
                {/* 头部：取数方式 — 单行 */}
                <div className="px-3 py-2.5 flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-xs" style={{ color: C.text }}>取数方式：</span>
                  <span style={{ color: C.sub }} className="text-xs">例：</span>
                  <span className="font-mono font-bold text-sm" style={{ color: C.text }}>
                    4162.<span style={{ color: C.red, border: `1.5px solid ${C.red}`, borderRadius: '3px', padding: '0 2px', display: 'inline-block', lineHeight: 1.3 }}>88</span>
                  </span>
                  <span style={{ color: C.sub }} className="text-xs">→ 取 <strong style={{ color: C.red }}>88</strong></span>
                  <button
                    ref={algoHelpRef}
                    type="button"
                    onClick={() => setShowTip(v => !v)}
                    className="w-3.5 h-3.5 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: C.border, color: C.sub, fontSize: 9, fontWeight: 700, lineHeight: 1 }}
                  >?</button>
                  <Tooltip
                    isOpen={showTip}
                    onClose={() => setShowTip(false)}
                    triggerRef={algoHelpRef as React.RefObject<HTMLElement>}
                    content={
                      <div className="space-y-1">
                        <div className="font-bold text-sm pb-1 border-b border-gray-200" style={{ color: C.red }}>取数方式说明</div>
                        <div className="text-xs leading-relaxed" style={{ color: '#444' }}>
                          取 <span style={{ color: C.red }}>{seedLabel}</span> 小数点后两位作为开奖基数，
                          除以参与人数取余数，<strong>余数直接对应中奖编号</strong>：余数 0 → 00号，余数 1 → 01号，以此类推。没有特例，不需要加一。
                        </div>
                      </div>
                    }
                  />
                </div>
                {/* 分隔线 */}
                <div style={{ borderTop: `1px solid ${C.formulaBorder}` }} />
                {/* 对照表头部 */}
                <div className="px-3 py-1.5 font-semibold" style={{ background: 'rgba(0,0,0,0.03)', color: C.sub }}>
                  对照表：尾数对应中奖编号（共 {exampleN} 人）
                  {exampleN > 9 && <span className="ml-1 font-normal" style={{ color: C.sub }}>· 仅展示前9行示例</span>}
                </div>
                <table className="w-full">
                  <thead>
                    <tr style={{ background: 'rgba(0,0,0,0.04)' }}>
                      <th className="text-left px-2 py-1.5" style={{ color: C.sub, fontWeight: 500 }}>收盘价示例</th>
                      <th className="text-center px-2 py-1.5" style={{ color: C.sub, fontWeight: 500 }}>计算</th>
                      <th className="text-center px-2 py-1.5" style={{ color: C.sub, fontWeight: 500 }}>中奖示例</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(({ tail, tailStr, remainder, winner, participant }, i) => (
                      <tr key={i} style={{ borderTop: `1px solid ${C.border}`, background: remainder === 0 ? '#FFF8F8' : undefined }}>
                        <td className="px-2 py-1.5 font-mono" style={{ color: C.text }}>
                          {intPart}.<span style={{ color: C.red, fontWeight: 700 }}>{tailStr}</span>
                        </td>
                        <td className="text-center px-2 py-1.5 font-mono" style={{ color: C.sub }}>
                          {/* 尾数用红框，人数用红框，让用户清楚两个数字的来源 */}
                          <span style={{ border: `1.5px solid ${C.red}`, borderRadius: '3px', padding: '0 3px', color: C.red, fontWeight: 700 }}>{tailStr}</span>
                          <span className="mx-0.5">÷</span>
                          <span style={{ border: `1.5px solid ${C.red}`, borderRadius: '3px', padding: '0 3px', color: C.red, fontWeight: 700 }}>{exampleN}人</span>
                          <span className="mx-0.5">余</span>
                          <span style={{ color: C.text, fontWeight: 600 }}>{remainder}</span>
                        </td>
                        <td className="px-2 py-1.5">
                          {/* 中奖列：显示真实参与者头像+编号，无参与者时显示编号文字 */}
                          <div className="flex items-center gap-1.5 justify-center">
                            {participant ? (
                              <>
                                {/* 头像 */}
                                <div
                                  className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0"
                                  style={{
                                    background: participant.avatar_url ? 'transparent' : `hsl(${(winner * 47) % 360}, 55%, 45%)`,
                                    overflow: 'hidden',
                                  }}
                                >
                                  {participant.avatar_url
                                    ? <img src={participant.avatar_url} alt="" className="w-full h-full object-cover" />
                                    : (participant.display_name ?? '?').charAt(0)
                                  }
                                </div>
                                {/* 编号+名字 */}
                                <div className="flex flex-col items-start">
                                  <span className="font-mono font-bold leading-none" style={{ color: C.text, fontSize: '0.9em' }}>中奖编号 {fmtNo(winner)}</span>
                                  <span className="leading-none mt-0.5 truncate max-w-[60px]" style={{ color: C.sub, fontSize: '0.85em' }}>{participant.display_name}</span>
                                </div>
                              </>
                            ) : (
                              <span className="font-mono font-bold" style={{ color: C.text }}>中奖编号 {fmtNo(winner)}</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {/* 每个人的中奖概率 - 可折叠 */}
                <div style={{ borderTop: `1px solid ${C.border}` }}>
                  {/* 标题行（点击展开/收起） */}
                  <button
                    type="button"
                    className="w-full flex items-center justify-between px-3 py-2"
                    style={{ background: '#FAFAFA' }}
                    onClick={() => setShowProbDetail(v => !v)}
                  >
                    <span className="font-semibold text-xs" style={{ color: C.sub }}>每人中奖概率</span>
                    <svg
                      width="14" height="14" viewBox="0 0 14 14" fill="none"
                      style={{ color: C.sub, transform: showProbDetail ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
                    >
                      <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>

                  {/* 展开内容 */}
                  {showProbDetail && (
                    <div className="px-3 pb-3 pt-2" style={{ background: '#F5F5F5' }}>
                      {exampleN === 1 ? (
                        /* 唯一参与者特殊展示 */
                        <div className="rounded-xl p-3 flex items-center gap-3" style={{ background: C.card, boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
                          <div
                            className="w-11 h-11 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                            style={{ background: realParticipants[0]?.avatar_url ? 'transparent' : C.red, overflow: 'hidden' }}
                          >
                            {realParticipants[0]?.avatar_url
                              ? <img src={realParticipants[0].avatar_url} alt="" className="w-full h-full object-cover" />
                              : (realParticipants[0]?.display_name ?? '?').charAt(0)}
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <div className="text-sm font-bold font-mono" style={{ color: C.text }}>{fmtNo(0)}号</div>
                            <div className="text-sm font-bold" style={{ color: C.gold }}>100.00%</div>
                          </div>
                          <div className="flex-1 text-[11px] text-right" style={{ color: C.sub }}>唯一参与者，必定中奖</div>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2">
                          {Array.from({ length: Math.min(exampleN, 50) }, (_, idx) => {
                            const cnt = countPerPerson[idx];
                            const pct = (cnt / 100 * 100).toFixed(2);
                            const participant = realParticipants[idx];
                            const bgColor = `hsl(${(idx * 47) % 360}, 55%, 45%)`;
                            // 计算该人对应的所有尾数
                            const myTails: string[] = [];
                            for (let t = 0; t <= 99; t++) {
                              if (t % exampleN === idx) myTails.push(String(t).padStart(2, '0'));
                            }
                            return (
                              <div
                                key={idx}
                                className="rounded-xl p-3 flex items-center gap-3"
                                style={{ background: C.card, boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}
                              >
                                {/* 头像（放大，撑两行高度） */}
                                <div className="flex-shrink-0">
                                  <div
                                    className="w-11 h-11 rounded-full flex items-center justify-center text-white text-sm font-bold"
                                    style={{ background: participant?.avatar_url ? 'transparent' : bgColor, overflow: 'hidden' }}
                                  >
                                    {participant?.avatar_url
                                      ? <img src={participant.avatar_url} alt="" className="w-full h-full object-cover" />
                                      : (participant?.display_name ?? '?').charAt(0)}
                                  </div>
                                </div>
                                {/* 编号 + 概率（固定宽度，无标签） */}
                                <div className="flex flex-col items-center gap-0.5 flex-shrink-0" style={{ width: '52px' }}>
                                  <div className="text-sm font-bold font-mono" style={{ color: C.text }}>{fmtNo(idx)}号</div>
                                  <div className="text-sm font-bold" style={{ color: C.gold }}>{pct}%</div>
                                </div>
                                {/* 尾数矩阵：每个数字一个圆角矩形底色 */}
                                <div className="flex-1 flex flex-wrap gap-1 min-w-0">
                                  {myTails.map(t => (
                                    <span
                                      key={t}
                                      className="font-mono text-[11px] font-medium px-1.5 py-0.5 rounded"
                                      style={{ background: C.redLight, color: C.red }}
                                    >{t}</span>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                          {exampleN > 50 && (
                            <div className="text-[10px] py-1" style={{ color: C.sub }}>共 {exampleN} 人，每人约 {(100/exampleN).toFixed(2)}%</div>
                          )}
                        </div>
                      )}
                      <div className="mt-2 text-[10px]" style={{ color: C.sub }}>
                        公式：余数 = 中奖编号（编号从 00 开始）。{exampleN} 人参与，100 个尾数均分，每人概率几乎相同。
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}


        </div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-xl p-3 font-mono text-xs" style={{ background: C.formulaBg, border: `1px solid ${C.formulaBorder}` }}>
            <div style={{ color: C.sub }}>// 随机种子算法</div>
            <div style={{ color: C.text }}>种子 = SHA256(时间戳 + 活动ID + 随机熵)</div>
            <div style={{ color: C.text }}>中奖者 = 参与者列表[种子哈希 % 参与人数]</div>
          </div>

        </div>
      )}
    </div>
  );
}

// ─── 参与者名单 ───────────────────────────────────────────────────────────────
// 删除参与者列表组件（管理员专用）
function ParticipantRemoveList({
  activityId,
  removingId,
  onRemove,
}: {
  activityId: number;
  removingId: number | null;
  onRemove: (participantId: number) => void;
}) {
  const { data: participants, isLoading } = trpc.lottery.getPublicParticipants.useQuery({ activityId });
  if (isLoading) {
    return <div className="text-center py-6 text-sm" style={{ color: C.sub }}>加载中...</div>;
  }
  if (!participants || participants.length === 0) {
    return <div className="text-center py-6 text-sm" style={{ color: C.sub }}>暫无参与者</div>;
  }

  // 编号位数自适应
  const total = participants.length;
  const digits = total >= 1000 ? 4 : total >= 100 ? 3 : 2;
  const fmtNo = (n: number) => String(n).padStart(digits, '0');

  return (
    <div className="space-y-2">
      {participants.map((p: any, idx: number) => {
        const no = fmtNo(idx); // 编号从 00 开始
        const initials = (p.display_name || '?').charAt(0);
        const bgColor = `hsl(${(idx * 47) % 360}, 55%, 45%)`;
        const isRemoving = removingId === p.id;
        return (
          <div
            key={p.id}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
            style={{ background: C.bg, border: `1px solid ${C.border}`, opacity: isRemoving ? 0.5 : 1 }}
          >
            {/* 头像 */}
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
              style={{ background: p.avatar_url ? 'transparent' : bgColor, overflow: 'hidden' }}
            >
              {p.avatar_url
                ? <img src={p.avatar_url} alt="" className="w-full h-full object-cover" />
                : initials
              }
            </div>
            {/* 名字和编号 */}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold truncate" style={{ color: C.text }}>{p.display_name}</div>
              <div className="text-xs" style={{ color: C.sub }}>抽奖编号 {no}</div>
            </div>
            {/* 删除按鈕 */}
            <button
              onClick={() => onRemove(p.id)}
              disabled={isRemoving}
              className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold disabled:opacity-50"
              style={{ background: '#FFF0F0', color: C.red, border: `1px solid ${C.red}` }}
            >
              {isRemoving ? '删除中...' : '删除'}
            </button>
          </div>
        );
      })}
    </div>
  );
}

function ParticipantGrid({ activityId }: { activityId: number }) {
  const { data: participants, isLoading } = trpc.lottery.getPublicParticipants.useQuery({ activityId });
  const [showAll, setShowAll] = useState(false);

  if (isLoading) return (
    <div className="flex justify-center py-6">
      <Loader className="w-5 h-5 animate-spin" style={{ color: C.red }} />
    </div>
  );

  const list = (participants as any[]) ?? [];
  const display = showAll ? list : list.slice(0, 12);

  if (list.length === 0) return (
    <div className="text-center py-8">
      <Users className="w-10 h-10 mx-auto mb-2" style={{ color: C.border }} />
      <div className="text-sm" style={{ color: C.sub }}>暂无参与者</div>
    </div>
  );

  // 根据总人数自动适配编号位数：<100人用两位，<1000人用三位，否则四位
  const digits = list.length < 100 ? 2 : list.length < 1000 ? 3 : 4;
  const formatNo = (n: number) => String(n).padStart(digits, '0');

  return (
    <div>


      {/* 头像阵列 */}
      <div className="grid grid-cols-4 gap-3">
        {display.map((p: any, idx: number) => {
          // 实际序号 = 在全列表中的真实位置（编号从 00 开始）
          const realIdx = list.findIndex((x: any) => x.id === p.id);
          const no = formatNo(realIdx); // 编号从 00 开始
          return (
            <div key={p.id} className="flex flex-col items-center gap-0.5">
              {/* 头像 */}
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center text-white text-base font-bold border-2"
                style={{
                  background: p.avatar_url ? 'transparent' : `hsl(${(realIdx * 47) % 360}, 55%, 45%)`,
                  borderColor: C.border,
                }}
              >
                {p.avatar_url ? (
                  <img src={p.avatar_url} alt={p.display_name} className="w-full h-full rounded-full object-cover" />
                ) : (
                  (p.display_name || '?')[0]
                )}
              </div>
              {/* 昵称 */}
              <span className="text-[10px] text-center truncate w-full" style={{ color: C.sub }}>
                {p.display_name}
              </span>
              {/* 抽奖编号 */}
              <span
                className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-full"
                style={{ background: C.redLight, color: C.red }}
              >
                抽奖编号 {no}
              </span>
            </div>
          );
        })}
      </div>

      {list.length > 12 && !showAll && (
        <button
          className="w-full mt-3 py-2 text-xs rounded-xl border"
          style={{ color: C.sub, borderColor: C.border }}
          onClick={() => setShowAll(true)}
        >
          查看全部 {list.length} 位参与者
        </button>
      )}
    </div>
  );
}

// ─── 开奖结果展示 ─────────────────────────────────────────────────────────────
function DrawResultsSection({ activityId }: { activityId: number }) {
  const { data, isLoading } = trpc.lottery.getResults.useQuery({ activityId });

  if (isLoading) return (
    <div className="flex justify-center py-6">
      <Loader className="w-5 h-5 animate-spin" style={{ color: C.red }} />
    </div>
  );

  const results = (data?.results ?? []) as any[];
  const fairness = data?.fairnessInfo as any;

  if (results.length === 0) return (
    <div className="text-center py-6">
      <Trophy className="w-10 h-10 mx-auto mb-2" style={{ color: C.border }} />
      <div className="text-sm" style={{ color: C.sub }}>开奖结果将在此公示</div>
    </div>
  );

  const grouped: Record<string, { prizeName: string; sortOrder: number; winners: any[] }> = {};
  for (const r of results) {
    if (!grouped[r.prize_id]) grouped[r.prize_id] = { prizeName: r.prize_name, sortOrder: r.prize_sort_order, winners: [] };
    grouped[r.prize_id].winners.push(r);
  }
  const sortedGroups = Object.values(grouped).sort((a, b) => a.sortOrder - b.sortOrder);
  const prizeIcons = ["🥇", "🥈", "🥉", "🏅", "🎖️"];

  return (
    <div className="space-y-3">
      {sortedGroups.map((group, gIdx) => (
        <div key={gIdx} className="rounded-2xl overflow-hidden border" style={{ borderColor: C.border }}>
          <div className="px-4 py-3 flex items-center gap-2" style={{ background: C.redLight }}>
            <span className="text-base">{prizeIcons[gIdx] ?? "🎁"}</span>
            <span className="font-semibold text-sm" style={{ color: C.red }}>{group.prizeName}</span>
            <span className="ml-auto text-xs" style={{ color: C.sub }}>{group.winners.length} 人获奖</span>
          </div>
          <div className="divide-y divide-gray-100">
            {group.winners.map((w: any, wIdx: number) => (
              <div key={wIdx} className="px-4 py-3 flex items-center gap-3">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                  style={{ background: C.red }}
                >
                  {wIdx + 1}
                </div>
                <span className="text-sm font-medium" style={{ color: C.text }}>{w.winner_name}</span>
                <CheckCircle className="w-4 h-4 ml-auto" style={{ color: '#66BB6A' }} />
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* 公平性验证 */}
      {fairness?.random_seed && (
        <div className="rounded-2xl p-4" style={{ background: C.darkBg }}>
          <div className="flex items-center gap-2 mb-3">
            <ShieldCheck className="w-4 h-4" style={{ color: C.gold }} />
            <span className="text-sm font-bold" style={{ color: C.darkText }}>公平性验证</span>
          </div>
          <div className="space-y-2 text-xs font-mono" style={{ color: C.darkSub }}>
            <div>
              <span style={{ color: C.darkText }}>随机种子：</span>
              <span className="break-all">{fairness.random_seed.slice(0, 40)}...</span>
            </div>
            <div>
              <span style={{ color: C.darkText }}>种子哈希：</span>
              <span className="break-all">{fairness.random_seed_hash?.slice(0, 40)}...</span>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-1.5 text-xs" style={{ color: '#66BB6A' }}>
            <CheckCircle className="w-3.5 h-3.5" />
            <span>开奖结果可通过种子独立验证，不可篡改</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 刮刮乐动效 ──────────────────────────────────────────────────────────────
function ScratchCard({ prizeName, onReveal }: { prizeName: string; onReveal: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [revealed, setRevealed] = useState(false);
  const [scratching, setScratching] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = C.red;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < 200; i++) {
      ctx.fillStyle = `rgba(${180 + Math.random() * 40}, ${20 + Math.random() * 20}, 20, 0.3)`;
      ctx.fillRect(Math.random() * canvas.width, Math.random() * canvas.height, 2, 2);
    }
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.font = "bold 14px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("← 用手指刮开 →", canvas.width / 2, canvas.height / 2);
  }, []);

  const scratch = (x: number, y: number) => {
    const canvas = canvasRef.current;
    if (!canvas || revealed) return;
    const ctx = canvas.getContext("2d")!;
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(x, y, 22, 0, Math.PI * 2);
    ctx.fill();
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let transparent = 0;
    for (let i = 3; i < imageData.data.length; i += 4) {
      if (imageData.data[i] < 128) transparent++;
    }
    if (transparent / (canvas.width * canvas.height) > 0.5 && !revealed) {
      setRevealed(true);
      onReveal();
    }
  };

  return (
    <div className="relative w-64 h-40 mx-auto rounded-2xl overflow-hidden shadow-xl">
      <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ backgroundColor: C.bg }}>
        <div className="text-4xl mb-2">🎁</div>
        <div className="font-bold text-xl" style={{ color: C.red }}>{prizeName}</div>
        <div className="text-sm mt-1" style={{ color: C.sub }}>恭喜中奖！</div>
      </div>
      {!revealed && (
        <canvas
          ref={canvasRef}
          width={256}
          height={160}
          className="absolute inset-0 cursor-crosshair"
          onMouseDown={() => setScratching(true)}
          onMouseUp={() => setScratching(false)}
          onMouseMove={e => { if (!scratching) return; const r = canvasRef.current!.getBoundingClientRect(); scratch(e.clientX - r.left, e.clientY - r.top); }}
          onTouchStart={() => setScratching(true)}
          onTouchEnd={() => setScratching(false)}
          onTouchMove={e => { e.preventDefault(); const r = canvasRef.current!.getBoundingClientRect(); const t = e.touches[0]; scratch(t.clientX - r.left, t.clientY - r.top); }}
          style={{ touchAction: "none" }}
        />
      )}
    </div>
  );
}

// ─── 主页面 ──────────────────────────────────────────────────────────────────
export default function LotteryActivity() {
  const [, params] = useRoute("/lottery/:activityId");
  const [, navigate] = useLocation();
  const activityId = parseInt(params?.activityId ?? "0");
  const { user } = useAuth();

  const [signingUp, setSigningUp] = useState(false);
  const [participantId, setParticipantId] = useState<number | null>(null);
  const [drawResult, setDrawResult] = useState<{ prize: { name: string; description: string }; drawSeed: string } | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [showDraw, setShowDraw] = useState(false);
  const [signupError, setSignupError] = useState("");
  const [showFullParticipants, setShowFullParticipants] = useState(false);

  // 管理员邀请参与者弹窗
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteTab, setInviteTab] = useState<'add' | 'remove'>('add'); // 添加/删除 Tab
  const [inviteSearchQuery, setInviteSearchQuery] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [inviting, setInviting] = useState(false);
  const [addedUserIds, setAddedUserIds] = useState<Set<number>>(new Set());
  const [removingId, setRemovingId] = useState<number | null>(null); // 正在删除的参与者 id

  const { data: activity, isLoading, isError } = trpc.lottery.getActivity.useQuery({ activityId }, { retry: false });
  const utils = trpc.useUtils();
  const countdown = useCountdown(activity?.draw_at ?? null);
  // 报名截止倒计时（必须在条件 return 之前调用，遵守 Hook 规则）
  const signupEndCountdown = useCountdown(activity?.signup_end_at ?? null);
  const signupMutation = trpc.lottery.signup.useMutation();
  const instantDrawMutation = trpc.lottery.instantDraw.useMutation();
  const adminAddMutation = trpc.lottery.adminAddParticipant.useMutation();
  const adminRemoveMutation = trpc.lottery.adminRemoveParticipant.useMutation();
  // 用户搜索（与账本邀请相同的即时搜索逻辑）
  const { data: searchResults, isFetching: isSearching } = trpc.sharing.searchUsers.useQuery(
    { query: inviteSearchQuery.trim() },
    { enabled: inviteSearchQuery.trim().length > 0 }
  );

  const handleSignup = async () => {
    if (!user) { setSignupError("请先登录后再报名"); return; }
    setSigningUp(true);
    setSignupError("");
    try {
      const result = await signupMutation.mutateAsync({ activityId, displayName: user.name ?? user.username ?? "匿名用户", userId: user.id });
      setParticipantId(result.id);
      if (activity?.mode === "instant") setShowDraw(true);
    } catch (e: any) {
      setSignupError(e.message || "报名失败");
    } finally {
      setSigningUp(false);
    }
  };

  const handleInstantDraw = async () => {
    if (!participantId) return;
    setDrawing(true);
    try {
      const result = await instantDrawMutation.mutateAsync({ activityId, participantId });
      setDrawResult(result);
    } catch (e: any) {
      setSignupError(e.message || "抽奖失败");
    } finally {
      setDrawing(false);
    }
  };

  const handleAdminInvite = async (userId: number) => {
    setInviting(true);
    setInviteError("");
    try {
      await adminAddMutation.mutateAsync({ activityId, userId });
      // 刷新参与者列表和活动详情（人数）
      await utils.lottery.getPublicParticipants.invalidate({ activityId });
      await utils.lottery.getActivity.invalidate({ activityId });
      // 标记已添加，避免重复点击
      setAddedUserIds(prev => new Set(prev).add(userId));
    } catch (e: any) {
      setInviteError(e.message || "添加失败");
    } finally {
      setInviting(false);
    }
  };

  const handleAdminRemove = async (participantId: number) => {
    setRemovingId(participantId);
    setInviteError("");
    try {
      await adminRemoveMutation.mutateAsync({ activityId, participantId });
      await utils.lottery.getPublicParticipants.invalidate({ activityId });
      await utils.lottery.getActivity.invalidate({ activityId });
    } catch (e: any) {
      setInviteError(e.message || "删除失败");
    } finally {
      setRemovingId(null);
    }
  };

  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: C.bg }}>
      <Loader className="w-6 h-6 animate-spin" style={{ color: C.red }} />
    </div>
  );

  if (isError || !activity) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ backgroundColor: C.bg }}>
      <div className="text-sm" style={{ color: C.sub }}>活动不存在或已被删除</div>
      <button
        onClick={() => navigate('/ledger/0' as any)}
        className="text-xs px-4 py-2 rounded-full text-white"
        style={{ backgroundColor: C.red }}
      >返回上一页</button>
    </div>
  );

  const isOpen = activity.status === "open";
  const isDrawing = activity.status === "drawing";
  const isCompleted = activity.status === "completed";
  const hasExternalSeed = !!activity.external_seed_type;
  const isStock = activity.external_seed_type === 'sh_index' || activity.external_seed_type === 'sz_index';
  const isLottery = activity.external_seed_type === 'ssq' || activity.external_seed_type === 'dlt';

  // 报名时间窗口判断（必须在 getOpenStatusLabel 之前定义）
  const signupStartAt = activity.signup_start_at ? new Date(activity.signup_start_at) : null;
  const signupEndAt = activity.signup_end_at ? new Date(activity.signup_end_at) : null;
  const isSignupNotStarted = signupStartAt ? Date.now() < signupStartAt.getTime() : false;
  const isSignupClosed = signupEndAt ? Date.now() > signupEndAt.getTime() : false;
  const canSignup = isOpen && !isSignupNotStarted && !isSignupClosed;

  // 生成右上角报名状态标签文字
  const getOpenStatusLabel = () => {
    if (isSignupNotStarted && signupStartAt) {
      const fmt = signupStartAt.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
      return `报名开放于 ${fmt}`;
    }
    if (isSignupClosed && signupEndAt) {
      const fmt = signupEndAt.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
      return `报名已截止 · ${fmt}`;
    }
    if (signupEndAt && !isSignupClosed) {
      const { d, h, m, s } = signupEndCountdown;
      if (d > 0) return `报名中 · 还剩 ${d}天${h}时${m}分`;
      if (h > 0) return `报名中 · 还剩 ${h}时${m}分${s}秒`;
      if (m > 0) return `报名中 · 还剩 ${m}分${s}秒`;
      return `报名中 · 即将截止`;
    }
    return '报名中';
  };

  const getOpenStatusStyle = () => {
    if (isSignupNotStarted) return { bg: '#E3F2FD', color: '#1565C0' };
    if (isSignupClosed) return { bg: '#FFEBEE', color: '#C62828' };
    if (signupEndAt && !isSignupClosed) {
      const { d, h } = signupEndCountdown;
      if (d === 0 && h < 2) return { bg: '#FFF3E0', color: '#E65100' }; // 不到2小时，橙色警示
    }
    return { bg: '#E8F5E9', color: '#2E7D32' };
  };

  const statusConfig = {
    draft: { label: '草稿', bg: '#E0E0E0', color: '#757575' },
    open: { label: getOpenStatusLabel(), ...getOpenStatusStyle() },
    drawing: { label: '开奖中', bg: '#FFF3E0', color: '#E65100' },
    completed: { label: '已结束', bg: '#F5F5F5', color: '#9E9E9E' },
    cancelled: { label: '已取消', bg: '#FFEBEE', color: '#D32F2F' },
  }[activity.status as string] ?? { label: activity.status, bg: '#F5F5F5', color: '#9E9E9E' };

  // 底部按鈕逻辑（顶层变量，避免 IIFE 导致崩溃）
  const regMode = activity.registration_mode ?? 'open';
  const isOrganizer = activity.created_by === user?.id;
  const isInviteOnly = (regMode === 'invite' || regMode === 'organizer_add') && !isOrganizer;

  return (
    <div className="min-h-screen pb-32" style={{ backgroundColor: C.bg }}>

      {/* ── 顶部导航栏 ── */}
      <div className="sticky top-0 z-20" style={{ backgroundColor: C.red }}>
        <div className="flex items-center h-14 px-4 gap-3">
          <button onClick={() => navigate(`/ledger/${activity.ledger_id}` as any)} className="p-2 -ml-2">
            <ChevronLeft className="w-6 h-6 text-white" />
          </button>
          <h1 className="flex-1 text-base font-semibold text-white">{activity.title}</h1>
        </div>
      </div>

      {/* ── 1. Hero 区：奖品大图 + 倒计时 ── */}
      <div className="relative" style={{ minHeight: '220px' }}>
        {(activity.banner_image_url || activity.cover_image_url) ? (
          <img
            src={activity.banner_image_url || activity.cover_image_url}
            alt={activity.title}
            className="w-full object-cover"
            style={{ height: '220px' }}
          />
        ) : (
          <div
            className="w-full flex flex-col items-center justify-center gap-3"
            style={{
              height: '220px',
              background: `linear-gradient(135deg, ${C.redDark} 0%, ${C.red} 60%, #E57373 100%)`,
            }}
          >
            <Gift className="w-16 h-16 text-white/60" />
            <span className="text-white/70 text-sm">奖品图片</span>
          </div>
        )}

        {/* Hero 区倒计时已移至开奖数据卡片底部显示 */}

        {/* 开奖中动效标 */}
        {isDrawing && (
          <div
            className="absolute top-3 left-3 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-white text-xs font-bold"
            style={{ background: 'rgba(255,109,0,0.9)', backdropFilter: 'blur(4px)' }}
          >
            <Flame className="w-3.5 h-3.5" />
            <span>开奖进行中</span>
          </div>
        )}
      </div>

      <div className="px-4 pt-4 max-w-lg mx-auto space-y-4">

        {/* ── 2. 我的抽奖码（已报名时显示）── */}
        {participantId && (
          <div
            className="rounded-2xl p-4 flex items-center gap-3"
            style={{ background: C.darkBg, border: `1px solid ${C.darkBorder}` }}
          >
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: C.red }}
            >
              <Hash className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="text-xs mb-0.5" style={{ color: C.darkSub }}>我的参与编号</div>
              <div className="text-xl font-bold font-mono" style={{ color: C.gold }}>
                #{String(participantId).padStart(4, '0')}
              </div>
            </div>
            <div className="ml-auto text-right">
              <div className="text-xs" style={{ color: C.darkSub }}>报名成功</div>
              <CheckCircle className="w-5 h-5 mt-1 ml-auto" style={{ color: '#66BB6A' }} />
            </div>
          </div>
        )}

        {/* ── 3. 开奖结果（已结束时展示）── */}
        {isCompleted && (
          <div>
            <div className="flex items-center gap-2.5 mb-2">
              <div className="w-1 h-4 rounded-full flex-shrink-0" style={{ background: C.gold }} />
              <Trophy className="w-4 h-4" style={{ color: C.gold }} />
              <span className="text-sm font-bold" style={{ color: C.text }}>开奖结果</span>
            </div>
            <DrawResultsSection activityId={activityId} />
          </div>
        )}

        {/* ── 4. 参与者名单 ── */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2.5">
              <div className="w-1 h-4 rounded-full flex-shrink-0" style={{ background: C.red }} />
              <Users className="w-4 h-4" style={{ color: C.red }} />
              <span className="text-sm font-bold" style={{ color: C.text }}>参与者名单</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs" style={{ color: C.sub }}>{activity.participantCount} 人已参与</span>
              {isOrganizer && (
                <button
                  onClick={() => { setShowInviteModal(true); setInviteTab('add'); setInviteError(""); setInviteSearchQuery(''); }}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold"
                  style={{ background: C.red, color: '#fff' }}
                >
                  <span style={{ fontSize: '14px', lineHeight: 1 }}>+</span>
                  <span>邀请</span>
                </button>
              )}
            </div>
          </div>
          <div
            className="rounded-2xl p-4 border"
            style={{ background: C.card, borderColor: C.border }}
          >
            <ParticipantGrid activityId={activityId} />
          </div>
        </div>

        {/* ── 5. 奖项详情 ── */}
        <div>
          <div className="flex items-center gap-2.5 mb-2">
            <div className="w-1 h-4 rounded-full flex-shrink-0" style={{ background: C.red }} />
            <Gift className="w-4 h-4" style={{ color: C.red }} />
            <span className="text-sm font-bold" style={{ color: C.text }}>奖项设置</span>
          </div>
          <div className="space-y-2">
            {(activity.prizes ?? []).map((prize: any, idx: number) => (
              <div
                key={prize.id}
                className="flex items-center gap-3 rounded-2xl px-4 py-3 border"
                style={{ background: C.card, borderColor: C.border }}
              >
                <span
                  className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                  style={{ background: idx === 0 ? C.gold : idx === 1 ? '#9E9E9E' : idx === 2 ? '#A1887F' : C.border, color: idx < 3 ? '#fff' : C.sub }}
                >{idx + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm truncate" style={{ color: C.text }}>{prize.name}</div>
                  {prize.description && (
                    <div className="text-xs truncate" style={{ color: C.sub }}>{prize.description}</div>
                  )}
                </div>
                <span
                  className="text-xs px-2 py-0.5 rounded-full flex-shrink-0"
                  style={{ background: C.redLight, color: C.red }}
                >
                  {prize.is_consolation ? '保底' : `×${prize.quantity}`}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* ── 6. 第三方开奖校验区 ── */}
        {hasExternalSeed && (
          <div>
            <div className="flex items-center gap-2.5 mb-2">
              <div className="w-1 h-4 rounded-full flex-shrink-0" style={{ background: C.gold }} />
              <ShieldCheck className="w-4 h-4" style={{ color: C.gold }} />
              <span className="text-sm font-bold" style={{ color: C.text }}>第三方开奖数据</span>
            </div>
            {isStock && (
              <StockBoard
                seedType={activity.external_seed_type}
                seedValue={activity.external_seed_value}
                seedSource={activity.external_seed_source}
                drawAt={activity.draw_at}
                seedDate={activity.external_seed_date}
              />
            )}
            {isLottery && (
              <LotteryBalls
                seedType={activity.external_seed_type}
                seedValue={activity.external_seed_value}
                seedSource={activity.external_seed_source}
                drawAt={activity.draw_at}
                seedDate={activity.external_seed_date}
              />
            )}
          </div>
        )}

        {/* ── 7. 开奖算法公式 ── */}
        {(hasExternalSeed || activity.mode === 'scheduled') && (
          <div>
            <div className="flex items-center gap-2.5 mb-2">
              <div className="w-1 h-4 rounded-full flex-shrink-0" style={{ background: C.red }} />
              <ShieldCheck className="w-4 h-4" style={{ color: C.red }} />
              <span className="text-sm font-bold" style={{ color: C.text }}>开奖算法说明</span>
            </div>
            <AlgorithmBox seedType={activity.external_seed_type} mode={activity.mode} seedDate={activity.external_seed_date} participantCount={activity.participantCount} participantScale={activity.participant_scale} activityId={activityId} />
          </div>
        )}

        {/* ── 即时抽奖动效区 ── */}
        {showDraw && !drawResult && (
          <div
            className="rounded-2xl p-6 border text-center"
            style={{ background: C.card, borderColor: C.border }}
          >
            <h3 className="font-bold mb-6" style={{ color: C.red }}>开始抽奖</h3>
            {activity.instant_style === "scratch" && (
              <ScratchCard prizeName={drawing ? "..." : "刮开查看"} onReveal={handleInstantDraw} />
            )}
            {(activity.instant_style === "wheel" || !activity.instant_style) && (
              <div className="flex flex-col items-center gap-4">
                <button
                  onClick={handleInstantDraw}
                  className="w-20 h-20 rounded-full flex items-center justify-center active:scale-90 transition-transform"
                  style={{ background: `radial-gradient(circle at 35% 35%, ${C.red}, ${C.redDark})`, boxShadow: `0 6px 20px rgba(183,28,28,0.4)` }}
                >
                  <Star className="w-9 h-9 text-white" />
                </button>
                <p className="text-sm" style={{ color: C.sub }}>点击开始抽奖</p>
              </div>
            )}
            {activity.instant_style === "egg" && (
              <div className="flex flex-col items-center gap-4">
                <button
                  onClick={handleInstantDraw}
                  className="w-20 h-20 rounded-full flex items-center justify-center active:scale-90 transition-transform"
                  style={{ background: `radial-gradient(circle at 35% 35%, ${C.gold}, #A0784A)`, boxShadow: `0 6px 20px rgba(203,164,113,0.5)` }}
                >
                  <Gift className="w-9 h-9 text-white" />
                </button>
                <p className="text-sm" style={{ color: C.sub }}>点击开启奖品</p>
              </div>
            )}
          </div>
        )}

        {/* ── 抽奖结果 ── */}
        {drawResult && (
          <div
            className="rounded-2xl p-6 border text-center"
            style={{ background: C.redLight, borderColor: C.red }}
          >
            <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3" style={{ background: C.redLight }}>
              <Trophy className="w-7 h-7" style={{ color: C.red }} />
            </div>
            <div className="text-2xl font-bold mb-1" style={{ color: C.red }}>{drawResult.prize.name}</div>
            {drawResult.prize.description && (
              <div className="text-sm mb-4" style={{ color: C.sub }}>{drawResult.prize.description}</div>
            )}
            <div className="text-xs mt-4 break-all" style={{ color: '#BDBDBD' }}>
              随机种子：{drawResult.drawSeed.slice(0, 16)}...
              <span className="ml-1" style={{ color: C.red }}>（可验证公正性）</span>
            </div>
          </div>
        )}

      </div>

      {/* ── 底部固定按钮 ── */}
      {canSignup && !participantId && !showDraw && isInviteOnly && (
        <div
          className="fixed bottom-0 left-0 right-0 px-4 pb-6 pt-3 z-30"
          style={{ background: 'linear-gradient(to top, rgba(250,243,237,1) 70%, rgba(250,243,237,0) 100%)' }}
        >
          <div
            className="max-w-lg mx-auto rounded-2xl py-3 px-4 flex items-center gap-3"
            style={{ background: '#FFF3E0', border: '1px solid #FFB74D' }}
          >
            <span className="text-xl flex-shrink-0">&#128274;</span>
            <div>
              <div className="font-bold text-sm" style={{ color: '#E65100' }}>此活动为邀请制</div>
              <div className="text-xs" style={{ color: '#757575' }}>请联系活动组织者获取邀请</div>
            </div>
          </div>
        </div>
      )}
      {canSignup && !participantId && !showDraw && !isInviteOnly && (
        <div
          className="fixed bottom-0 left-0 right-0 px-4 pb-6 pt-3 z-30"
          style={{ background: 'linear-gradient(to top, rgba(250,243,237,1) 70%, rgba(250,243,237,0) 100%)' }}
        >
          <div className="max-w-lg mx-auto">
            {!user && (
              <div className="mb-2 text-xs text-center" style={{ color: C.sub }}>请先登录后再报名</div>
            )}
            {signupError && (
              <div className="mb-2 text-xs text-center" style={{ color: C.red }}>{signupError}</div>
            )}
            {user && (
              <div className="mb-2 flex items-center gap-2 px-1">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                  style={{ background: C.red }}
                >
                  {(user.name ?? user.username ?? '?')[0]?.toUpperCase()}
                </div>
                <span className="text-xs" style={{ color: C.sub }}>以 <strong style={{ color: C.text }}>{user.name ?? user.username}</strong> 的身份参与</span>
              </div>
            )}
            <button
              onClick={handleSignup}
              disabled={signingUp || !user}
              className="w-full py-4 rounded-full text-white font-bold text-base transition-opacity disabled:opacity-50"
              style={{
                background: user ? `linear-gradient(135deg, ${C.red}, ${C.redDark})` : '#BDBDBD',
                boxShadow: user ? `0 4px 16px ${C.red}55` : 'none',
              }}
            >
              {signingUp ? "报名中..." : "立即参与报名"}
            </button>
            {parseFloat(activity.signup_fee) > 0 && (
              <p className="text-center text-xs mt-2" style={{ color: C.sub }}>报名费：¥{activity.signup_fee}</p>
            )}
          </div>
        </div>
      )}

      {/* 已报名（定时模式）提示 */}
      {participantId && activity.mode === "scheduled" && !drawResult && (
        <div
          className="fixed bottom-0 left-0 right-0 px-4 pb-6 pt-3 z-30"
          style={{ background: 'linear-gradient(to top, rgba(250,243,237,1) 70%, rgba(250,243,237,0) 100%)' }}
        >
          <div
            className="max-w-lg mx-auto rounded-2xl py-3 px-4 flex items-center gap-3"
            style={{ background: '#E8F5E9', border: '1px solid #A5D6A7' }}
          >
            <CheckCircle className="w-5 h-5 flex-shrink-0" style={{ color: '#2E7D32' }} />
            <div>
              <div className="font-bold text-sm" style={{ color: '#2E7D32' }}>报名成功！</div>
              <div className="text-xs" style={{ color: '#757575' }}>请等待开奖，结果将在上方公示</div>
            </div>
          </div>
        </div>
      )}

      {/* ── 管理员邀请参与者弹窗 ── */}
      {showInviteModal && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ background: 'rgba(0,0,0,0.45)' }}
          onClick={e => { if (e.target === e.currentTarget) { setShowInviteModal(false); setInviteSearchQuery(''); setInviteError(''); } }}
        >
          <div
            className="w-full max-w-lg rounded-t-3xl px-5 pt-5 pb-8"
            style={{ background: C.card, maxHeight: '82vh', overflowY: 'auto' }}
          >
            {/* 弹窗标题 */}
            <div className="flex items-center justify-between mb-4">
              <span className="text-base font-bold" style={{ color: C.text }}>参与者管理</span>
              <button
                onClick={() => { setShowInviteModal(false); setInviteSearchQuery(''); setInviteError(''); }}
                className="w-7 h-7 rounded-full flex items-center justify-center text-base"
                style={{ background: C.bg, color: C.sub }}
              >×</button>
            </div>

            {/* Tab 切换 */}
            <div className="flex mb-4 rounded-xl overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
              {(['add', 'remove'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => { setInviteTab(tab); setInviteError(''); setInviteSearchQuery(''); }}
                  className="flex-1 py-2 text-sm font-semibold"
                  style={inviteTab === tab
                    ? { background: C.red, color: '#fff' }
                    : { background: C.bg, color: C.sub }
                  }
                >
                  {tab === 'add' ? '添加参与者' : '删除参与者'}
                </button>
              ))}
            </div>

            {/* 添加 Tab */}
            {inviteTab === 'add' && (
              <>
                {/* 搜索框 */}
                <div className="mb-3 relative">
                  <input
                    type="text"
                    value={inviteSearchQuery}
                    onChange={e => { setInviteSearchQuery(e.target.value); setInviteError(''); }}
                    placeholder="搜索用户昵称或账号"
                    className="w-full px-3 py-2.5 rounded-xl text-sm outline-none pr-8"
                    style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text }}
                    autoFocus
                  />
                  {isSearching && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: C.sub }}>搜索中...</span>
                  )}
                </div>

                {/* 搜索结果列表 */}
                {inviteSearchQuery.trim().length > 0 ? (
                  <div className="mb-3">
                    {!isSearching && (!searchResults || searchResults.length === 0) ? (
                      <div className="text-center py-6 text-sm" style={{ color: C.sub }}>未找到匹配用户</div>
                    ) : (
                      <div className="space-y-2">
                        {(searchResults || []).map((u: any) => {
                          const isAdded = addedUserIds.has(u.id);
                          const initials = (u.name || u.username || '?').charAt(0).toUpperCase();
                          const bgColors = ['#C62828','#AD1457','#6A1B9A','#1565C0','#00695C','#E65100'];
                          const bg = bgColors[u.id % bgColors.length];
                          return (
                            <div
                              key={u.id}
                              className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                              style={{ background: C.bg, border: `1px solid ${C.border}` }}
                            >
                              {u.avatar ? (
                                <img src={u.avatar} alt={u.name} className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                              ) : (
                                <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-white text-sm font-bold" style={{ background: bg }}>{initials}</div>
                              )}
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-semibold truncate" style={{ color: C.text }}>{u.name || u.username}</div>
                                {u.name && u.username && (
                                  <div className="text-xs truncate" style={{ color: C.sub }}>@{u.username}</div>
                                )}
                              </div>
                              <button
                                onClick={() => handleAdminInvite(u.id)}
                                disabled={inviting || isAdded}
                                className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold disabled:opacity-50"
                                style={isAdded
                                  ? { background: C.bg, color: C.sub, border: `1px solid ${C.border}` }
                                  : { background: C.red, color: '#fff' }
                                }
                              >
                                {isAdded ? '已添加' : inviting ? '添加中...' : '添加'}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-4 text-xs" style={{ color: C.sub }}>输入一两个字即可搜索平台用户，搜到后点击“添加”即可加入名单</div>
                )}
              </>
            )}

            {/* 删除 Tab */}
            {inviteTab === 'remove' && (
              <ParticipantRemoveList
                activityId={activityId}
                removingId={removingId}
                onRemove={handleAdminRemove}
              />
            )}

            {inviteError && (
              <div className="mt-2 text-xs text-center" style={{ color: C.red }}>{inviteError}</div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
