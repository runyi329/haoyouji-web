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
import { useRoute } from "wouter";
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
  gold: '#CBA471',
  goldLight: '#FFF8E1',
  bg: '#FAF3ED',
  card: '#FFFFFF',
  text: '#1A1A1A',
  sub: '#757575',
  border: '#E0E0E0',
  // 深色系（用于开奖校验区）
  darkBg: '#1A1A2E',
  darkCard: '#16213E',
  darkBorder: '#0F3460',
  darkText: '#E0E0E0',
  darkSub: '#9E9E9E',
  // 股票颜色
  stockUp: '#EF5350',
  stockDown: '#26A69A',
  // 彩票颜色
  lotteryRed: '#D32F2F',
  lotteryBlue: '#1565C0',
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
  // 计算目标时间：股票用开奖日 15:00，彩票用开奖日 22:00
  const getTargetTime = (): Date | null => {
    const dateStr = seedDate ?? drawAt;
    if (!dateStr) return null;
    const base = new Date(dateStr);
    if (isNaN(base.getTime())) return null;
    if (isStock) {
      base.setHours(15, 0, 0, 0);
    } else {
      base.setHours(22, 0, 0, 0);
    }
    return base;
  };
  const targetTime = getTargetTime();
  const countdown = useCountdown(targetTime ? targetTime.toISOString() : null);
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
  // 已过收盘/开奖时间后，计算已过去多少秒（显示 +HH:MM:SS）
  const [elapsedSec, setElapsedSec] = useState(0);
  useEffect(() => {
    if (!isPast || !targetTime) return;
    const update = () => setElapsedSec(Math.floor((Date.now() - targetTime.getTime()) / 1000));
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, [isPast, targetTime]);
  const elapsedH = Math.floor(elapsedSec / 3600);
  const elapsedM = Math.floor((elapsedSec % 3600) / 60);
  const elapsedS = elapsedSec % 60;
  return (
    <div className="px-4 pb-3 pt-1 flex items-center gap-1.5 flex-wrap" style={{ borderTop: `1px solid ${C.darkBorder}` }}>
      <Clock className="w-3 h-3 flex-shrink-0" style={{ color: C.darkSub }} />
      {hasData ? (
        <span className="text-xs font-mono" style={{ color: C.darkSub }}>
          数据已获取{fetchedAt ? `·${fetchedAt}` : (seedDate ? `·${seedDate}` : '')}
        </span>
      ) : isPast ? (
        <span className="text-xs font-mono flex items-center gap-2" style={{ color: '#F59E0B' }}>
          <span>{isStock ? '收盘后' : '开奖后'}数据获取中...</span>
          <span
            className="text-xs font-mono px-1.5 py-0.5 rounded"
            style={{ background: 'rgba(245,158,11,0.15)', color: '#F59E0B', letterSpacing: '0.05em' }}
          >
            +{elapsedH > 0 ? `${String(elapsedH).padStart(2,'0')}:` : ''}{String(elapsedM).padStart(2,'0')}:{String(elapsedS).padStart(2,'0')}
          </span>
        </span>
      ) : targetTime ? (
        <span className="text-xs font-mono" style={{ color: C.darkSub }}>
          距{isStock ? '收盘' : '开奖'}还有&nbsp;
          {countdown.d > 0 && <span style={{ color: C.darkText }}>{countdown.d}天</span>}
          {(countdown.d > 0 || countdown.h > 0) && <span style={{ color: C.darkText }}>{countdown.h}时</span>}
          <span style={{ color: C.darkText }}>{countdown.m}分{countdown.s}秒</span>
          &nbsp;·&nbsp;{isStock ? '15:00 收盘' : '22:00 开奖'}
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
    <div className="rounded-2xl overflow-hidden" style={{ background: C.darkBg }}>
      {/* 标题栏 */}
      <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: C.darkBorder }}>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <span className="text-xs font-mono" style={{ color: C.darkSub }}>MARKET DATA</span>
        </div>
        <span className="text-xs font-mono" style={{ color: C.darkSub }}>{indexCode}</span>
      </div>

      {/* 指数名称 + 价格 */}
      <div className="px-4 pt-4 pb-3">
        <div className="text-xs mb-1 font-mono tracking-widest" style={{ color: C.darkSub }}>{indexName}</div>
        {price ? (
          <div className="flex items-end gap-3">
            <span
              className="text-4xl font-bold font-mono"
              style={{ color: isUp ? C.stockUp : C.stockDown }}
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
          <div className="text-2xl font-mono" style={{ color: C.darkSub }}>待获取</div>
        )}
      </div>

      {/* 尾数提取区 */}
      {tailDigits && (
        <div className="mx-4 mb-4 rounded-xl p-3" style={{ background: C.darkCard, border: `1px solid ${C.darkBorder}` }}>
          <div className="text-xs mb-2 flex items-center gap-1" style={{ color: C.darkSub }}>
            <Hash className="w-3 h-3" />
            <span>收盘价尾数提取</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono" style={{ color: C.darkSub }}>
              {price?.replace('.', '')}
            </span>
            <span className="text-xs" style={{ color: C.darkSub }}>→ 取末两位 →</span>
            <div className="flex gap-1">
              {tailDigits.split('').map((d, i) => (
                <span
                  key={i}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-lg font-bold font-mono"
                  style={{ background: C.red, color: '#fff', boxShadow: `0 0 12px ${C.red}66` }}
                >
                  {d}
                </span>
              ))}
            </div>
            <span className="text-xs ml-1" style={{ color: C.gold }}>← 开奖基数</span>
          </div>
        </div>
      )}

      {/* 底部：去验证链接 */}
      <div className="px-4 pb-4">
        <a
          href={sinaUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs"
          style={{ color: C.gold }}
          onClick={e => e.stopPropagation()}
        >
          <ExternalLink className="w-3 h-3" />
          <span>去新浪财经查看原始数据 →</span>
        </a>
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
    <div className="rounded-2xl overflow-hidden" style={{ background: C.darkBg }}>
      {/* 标题栏 */}
      <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: C.darkBorder }}>
        <div className="flex items-center gap-2">
          <Star className="w-3.5 h-3.5" style={{ color: C.gold }} />
          <span className="text-xs font-bold tracking-widest" style={{ color: C.darkText }}>{lotteryName}</span>
        </div>
        {issueNo && (
          <span className="text-xs font-mono" style={{ color: C.darkSub }}>第 {issueNo} 期</span>
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
                    boxShadow: '0 3px 8px rgba(183,28,28,0.5), inset 0 1px 2px rgba(255,255,255,0.3)',
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
                    boxShadow: '0 3px 8px rgba(21,101,192,0.5), inset 0 1px 2px rgba(255,255,255,0.3)',
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
          <div className="text-center py-4">
            <div className="flex justify-center gap-2 mb-2">
              {Array.from({ length: isSSQ ? 7 : 7 }).map((_, i) => (
                <div
                  key={i}
                  className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold"
                  style={{
                    background: i < (isSSQ ? 6 : 5) ? 'rgba(211,47,47,0.3)' : 'rgba(21,101,192,0.3)',
                    color: C.darkSub,
                    border: `1px dashed ${C.darkBorder}`,
                  }}
                >
                  ?
                </div>
              ))}
            </div>
            <div className="text-xs" style={{ color: C.darkSub }}>等待开奖数据...</div>
          </div>
        )}
      </div>

      {/* 底部：去验证链接 */}
      <div className="px-4 pb-4 border-t" style={{ borderColor: C.darkBorder }}>
        <a
          href={officialUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs pt-3"
          style={{ color: C.gold }}
          onClick={e => e.stopPropagation()}
        >
          <ExternalLink className="w-3 h-3" />
          <span>去官方彩票网站验证原始数据 →</span>
        </a>
      </div>
      {/* 数据获取时间提示 */}
      <SeedTimingInfo seedValue={seedValue} seedSource={seedSource} drawAt={drawAt} seedDate={seedDate} seedType={seedType} />
    </div>
  );
}

// ─── 算法公式展示 ─────────────────────────────────────────────────────────────
function AlgorithmBox({ seedType, mode, seedDate }: { seedType?: string | null; mode: string; seedDate?: string | null }) {
  const isStock = seedType === 'sh_index' || seedType === 'sz_index';
  const isLottery = seedType === 'ssq' || seedType === 'dlt';
  const seedName = {
    sh_index: '上证收盘尾数', sz_index: '深证收盘尾数',
    ssq: '双色球红球之和', dlt: '大乐透前区之和',
  }[seedType ?? ''] ?? '随机种子';

  return (
    <div className="rounded-2xl p-4" style={{ background: C.darkBg, border: `1px solid ${C.darkBorder}` }}>
      <div className="flex items-center gap-2 mb-3">
        <ShieldCheck className="w-4 h-4" style={{ color: C.gold }} />
        <span className="text-sm font-bold" style={{ color: C.darkText }}>开奖算法说明</span>
        <span className="ml-auto text-xs px-2 py-0.5 rounded-full font-mono" style={{ background: 'rgba(203,164,113,0.15)', color: C.gold }}>
          可验证
        </span>
      </div>

      {/* 公式框 */}
      <div className="rounded-xl p-3 mb-3 font-mono text-xs" style={{ background: C.darkCard, border: `1px solid ${C.darkBorder}` }}>
        {isStock || isLottery ? (
          <div className="space-y-1.5">
            <div style={{ color: C.darkSub }}>// 开奖计算公式</div>
            <div style={{ color: '#82AAFF' }}>
              幸运码 = <span style={{ color: C.gold }}>{seedName}</span>
            </div>
            <div style={{ color: '#82AAFF' }}>
              中奖者 = 参与者列表[幸运码 % 参与人数]
            </div>
          </div>
        ) : (
          <div className="space-y-1.5">
            <div style={{ color: C.darkSub }}>// 随机种子算法</div>
            <div style={{ color: '#82AAFF' }}>
              种子 = SHA256(时间戳 + 活动ID + 随机熵)
            </div>
            <div style={{ color: '#82AAFF' }}>
              中奖者 = 参与者列表[种子哈希 % 参与人数]
            </div>
          </div>
        )}
      </div>

      <div className="text-xs space-y-1" style={{ color: C.darkSub }}>
        <div className="flex items-start gap-1.5">
          <CheckCircle className="w-3 h-3 mt-0.5 flex-shrink-0" style={{ color: '#66BB6A' }} />
          <span>开奖前公示随机种子哈希，开奖后公开完整种子，任何人可独立验证</span>
        </div>
        {(isStock || isLottery) && (
          <div className="flex items-start gap-1.5">
            <CheckCircle className="w-3 h-3 mt-0.5 flex-shrink-0" style={{ color: '#66BB6A' }} />
            <span>开奖依据来自第三方公开数据，主办方无法干预结果</span>
          </div>
        )}
        {(isStock || isLottery) && (
          <div className="flex items-start gap-1.5 mt-1 px-2 py-1.5 rounded-lg" style={{ background: 'rgba(203,164,113,0.1)', border: '1px solid rgba(203,164,113,0.2)' }}>
            <span className="text-xs" style={{ color: C.gold }}>
              📅 开奖依据日期：
              <strong style={{ color: '#FFFFFF' }}>
                {seedDate ? seedDate : '开奖当天最新数据'}
              </strong>
              {seedDate && isStock && <span style={{ color: C.darkSub }}>（上交所收盘价）</span>}
              {seedDate && seedType === 'ssq' && <span style={{ color: C.darkSub }}>（双色球开奖号码）</span>}
              {seedDate && seedType === 'dlt' && <span style={{ color: C.darkSub }}>（大乐透开奖号码）</span>}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── 参与者名单 ───────────────────────────────────────────────────────────────
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

  return (
    <div>
      {/* 实时滚动条（最新参与者） */}
      {list.length > 0 && (
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-xl mb-3 text-xs"
          style={{ background: C.redLight, color: C.red }}
        >
          <Flame className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="truncate">
            刚刚，<strong>{list[0]?.display_name}</strong> 参与了活动
          </span>
        </div>
      )}

      {/* 头像阵列 */}
      <div className="grid grid-cols-4 gap-3">
        {display.map((p: any, idx: number) => (
          <div key={p.id} className="flex flex-col items-center gap-1">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center text-white text-base font-bold border-2"
              style={{
                background: p.avatar_url ? 'transparent' : `hsl(${(idx * 47) % 360}, 55%, 45%)`,
                borderColor: C.border,
              }}
            >
              {p.avatar_url ? (
                <img src={p.avatar_url} alt={p.display_name} className="w-full h-full rounded-full object-cover" />
              ) : (
                (p.display_name || '?')[0]
              )}
            </div>
            <span className="text-[10px] text-center truncate w-full" style={{ color: C.sub }}>
              {p.display_name}
            </span>
          </div>
        ))}
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
  const activityId = parseInt(params?.activityId ?? "0");
  const { user } = useAuth();

  const [signingUp, setSigningUp] = useState(false);
  const [participantId, setParticipantId] = useState<number | null>(null);
  const [drawResult, setDrawResult] = useState<{ prize: { name: string; description: string }; drawSeed: string } | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [showDraw, setShowDraw] = useState(false);
  const [signupError, setSignupError] = useState("");
  const [showFullParticipants, setShowFullParticipants] = useState(false);

  const { data: activity, isLoading, isError } = trpc.lottery.getActivity.useQuery({ activityId }, { retry: false });
  const countdown = useCountdown(activity?.draw_at ?? null);
  // 报名截止倒计时（必须在条件 return 之前调用，遵守 Hook 规则）
  const signupEndCountdown = useCountdown(activity?.signup_end_at ?? null);
  const signupMutation = trpc.lottery.signup.useMutation();
  const instantDrawMutation = trpc.lottery.instantDraw.useMutation();

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

  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: C.bg }}>
      <Loader className="w-6 h-6 animate-spin" style={{ color: C.red }} />
    </div>
  );

  if (isError || !activity) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ backgroundColor: C.bg }}>
      <div className="text-sm" style={{ color: C.sub }}>活动不存在或已被删除</div>
      <button
        onClick={() => window.history.back()}
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
          <button onClick={() => window.history.back()} className="p-2 -ml-2">
            <ChevronLeft className="w-6 h-6 text-white" />
          </button>
          <h1 className="flex-1 text-base font-semibold truncate text-white">{activity.title}</h1>
          <span
            className="text-xs px-2.5 py-1 rounded-full font-bold flex-shrink-0"
            style={{ background: statusConfig.bg, color: statusConfig.color }}
          >
            {statusConfig.label}
          </span>
        </div>
      </div>

      {/* ── 1. Hero 区：奖品大图 + 倒计时 ── */}
      <div className="relative" style={{ minHeight: '220px' }}>
        {activity.cover_image_url ? (
          <img
            src={activity.cover_image_url}
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

        {/* 渐变蒙层 + 倒计时 */}
        {(isOpen || isDrawing) && activity.draw_at && countdown.remaining > 0 && (
          <div
            className="absolute bottom-0 left-0 right-0 px-4 py-4"
            style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 100%)' }}
          >
            <div className="text-white/70 text-xs mb-2 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              <span>距离开奖</span>
            </div>
            <div className="flex gap-2">
              {[
                { v: countdown.d, u: '天' },
                { v: countdown.h, u: '时' },
                { v: countdown.m, u: '分' },
                { v: countdown.s, u: '秒' },
              ].map(({ v, u }) => (
                <div key={u} className="flex flex-col items-center">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center text-xl font-bold text-white"
                    style={{ background: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(4px)' }}
                  >
                    {String(v).padStart(2, '0')}
                  </div>
                  <span className="text-white/60 text-[10px] mt-1">{u}</span>
                </div>
              ))}
            </div>
          </div>
        )}

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

        {/* ── 3. 第三方开奖校验区 ── */}
        {hasExternalSeed && (
          <div>
            <div className="flex items-center gap-2 mb-2">
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

        {/* ── 4. 开奖算法公式 ── */}
        {(hasExternalSeed || activity.mode === 'scheduled') && (
          <AlgorithmBox seedType={activity.external_seed_type} mode={activity.mode} seedDate={activity.external_seed_date} />
        )}

        {/* ── 5. 开奖结果（已结束时展示）── */}
        {isCompleted && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Trophy className="w-4 h-4" style={{ color: C.gold }} />
              <span className="text-sm font-bold" style={{ color: C.text }}>开奖结果</span>
            </div>
            <DrawResultsSection activityId={activityId} />
          </div>
        )}

        {/* ── 6. 奖项详情 ── */}
        <div>
          <div className="flex items-center gap-2 mb-2">
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
                <span className="text-xl flex-shrink-0">{["🥇", "🥈", "🥉", "🏅", "🎖️"][idx] ?? "🎁"}</span>
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

        {/* ── 7. 参与者名单 ── */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4" style={{ color: C.red }} />
              <span className="text-sm font-bold" style={{ color: C.text }}>参与者名单</span>
            </div>
            <span className="text-xs" style={{ color: C.sub }}>{activity.participantCount} 人已参与</span>
          </div>
          <div
            className="rounded-2xl p-4 border"
            style={{ background: C.card, borderColor: C.border }}
          >
            <ParticipantGrid activityId={activityId} />
          </div>
        </div>

        {/* ── 即时抽奖动效区 ── */}
        {showDraw && !drawResult && (
          <div
            className="rounded-2xl p-6 border text-center"
            style={{ background: C.card, borderColor: C.border }}
          >
            <h3 className="font-bold mb-6" style={{ color: C.red }}>🎊 开始抽奖！</h3>
            {activity.instant_style === "scratch" && (
              <ScratchCard prizeName={drawing ? "..." : "刮开查看"} onReveal={handleInstantDraw} />
            )}
            {(activity.instant_style === "wheel" || !activity.instant_style) && (
              <div className="flex flex-col items-center gap-4">
                <div className="text-6xl cursor-pointer select-none transition-transform active:scale-90" onClick={handleInstantDraw}>🎡</div>
                <p className="text-sm" style={{ color: C.sub }}>点击开始抽奖</p>
              </div>
            )}
            {activity.instant_style === "egg" && (
              <div className="flex flex-col items-center gap-4">
                <div className="text-8xl cursor-pointer select-none transition-transform active:scale-90" onClick={handleInstantDraw}>🥚</div>
                <p className="text-sm" style={{ color: C.sub }}>点击金蛋，查看您的奖品</p>
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
            <div className="text-5xl mb-3">🎉</div>
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

    </div>
  );
}
