import { useParams, useLocation } from "wouter";
import { ArrowLeft, BookOpen, Calculator, StickyNote } from "lucide-react";
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

// ─── 起手牌数据 ───────────────────────────────────────────────────────────────
const RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];

type ActionType = "raise" | "call" | "fold" | "3bet" | "limp";

interface HandRange {
  [hand: string]: ActionType[];
}

// 各桌型可用位置
const TABLE_POSITIONS: Record<number, string[]> = {
  6:  ["UTG", "HJ", "CO", "BTN", "SB", "BB"],
  7:  ["UTG", "UTG+1", "HJ", "CO", "BTN", "SB", "BB"],
  8:  ["UTG", "UTG+1", "UTG+2", "HJ", "CO", "BTN", "SB", "BB"],
  9:  ["UTG", "UTG+1", "LJ", "HJ", "CO", "BTN", "SB", "BB"],
  10: ["UTG", "UTG+1", "UTG+2", "LJ", "HJ", "CO", "BTN", "SB", "BB"],
};

// 各位置在不同桌型下的开牌范围
// 规则：人数越多，早期位置越紧；BTN/SB 基本不变
const buildRanges = (tableSize: number): Record<string, HandRange> => {
  // 紧缩系数：桌越大，早期位置越紧
  const tightFactor = tableSize - 6; // 0=6人桌, 4=10人桌

  const UTG: HandRange = {
    AA:["raise"],KK:["raise"],QQ:["raise"],JJ:["raise"],TT:["raise"],
    AKs:["raise"],AQs:["raise"],AJs:["raise"],ATs:["raise"],
    AKo:["raise"],AQo:["raise"],
    KQs:["raise"],KJs:["raise"],KTs:["raise"],
    QJs:["raise"],QTs:["raise"],
    JTs:["raise"],
    "99":["raise"],"88":["raise"],
    ...(tightFactor <= 1 ? { A9s:["raise"],A8s:["raise"],KQo:["raise"],T9s:["raise"],"98s":["raise"] } : {}),
    ...(tightFactor === 0 ? { A7s:["raise"],A6s:["raise"],A5s:["raise"],K9s:["raise"],QJo:["raise"],KJo:["raise"],AJo:["raise"],ATo:["raise"],"87s":["raise"],"76s":["raise"],"66":["raise"],"55":["raise"] } : {}),
  };

  const UTGp1: HandRange = {
    AA:["raise"],KK:["raise"],QQ:["raise"],JJ:["raise"],TT:["raise"],
    AKs:["raise"],AQs:["raise"],AJs:["raise"],ATs:["raise"],A9s:["raise"],
    AKo:["raise"],AQo:["raise"],AJo:["raise"],
    KQs:["raise"],KJs:["raise"],KTs:["raise"],
    KQo:["raise"],KJo:["raise"],
    QJs:["raise"],QTs:["raise"],
    JTs:["raise"],
    "99":["raise"],"88":["raise"],
    ...(tightFactor <= 2 ? { A8s:["raise"],A7s:["raise"],K9s:["raise"],Q9s:["raise"],T9s:["raise"],"98s":["raise"],"87s":["raise"],"66":["raise"] } : {}),
    ...(tightFactor <= 1 ? { A6s:["raise"],A5s:["raise"],ATo:["raise"],"77":["raise"],"55":["raise"],"76s":["raise"] } : {}),
  };

  const UTGp2: HandRange = {
    AA:["raise"],KK:["raise"],QQ:["raise"],JJ:["raise"],TT:["raise"],"99":["raise"],"88":["raise"],"77":["raise"],
    AKs:["raise"],AQs:["raise"],AJs:["raise"],ATs:["raise"],A9s:["raise"],A8s:["raise"],A7s:["raise"],A6s:["raise"],A5s:["raise"],
    AKo:["raise"],AQo:["raise"],AJo:["raise"],ATo:["raise"],
    KQs:["raise"],KJs:["raise"],KTs:["raise"],K9s:["raise"],
    KQo:["raise"],KJo:["raise"],
    QJs:["raise"],QTs:["raise"],Q9s:["raise"],
    QJo:["raise"],
    JTs:["raise"],J9s:["raise"],
    T9s:["raise"],T8s:["raise"],
    "98s":["raise"],"97s":["raise"],
    "87s":["raise"],"76s":["raise"],
    "66":["raise"],"55":["raise"],
  };

  const LJ: HandRange = {
    AA:["raise"],KK:["raise"],QQ:["raise"],JJ:["raise"],TT:["raise"],"99":["raise"],"88":["raise"],"77":["raise"],"66":["raise"],
    AKs:["raise"],AQs:["raise"],AJs:["raise"],ATs:["raise"],A9s:["raise"],A8s:["raise"],A7s:["raise"],A6s:["raise"],A5s:["raise"],A4s:["raise"],
    AKo:["raise"],AQo:["raise"],AJo:["raise"],ATo:["raise"],A9o:["raise"],
    KQs:["raise"],KJs:["raise"],KTs:["raise"],K9s:["raise"],K8s:["raise"],
    KQo:["raise"],KJo:["raise"],KTo:["raise"],
    QJs:["raise"],QTs:["raise"],Q9s:["raise"],Q8s:["raise"],
    QJo:["raise"],QTo:["raise"],
    JTs:["raise"],J9s:["raise"],J8s:["raise"],
    T9s:["raise"],T8s:["raise"],T7s:["raise"],
    "98s":["raise"],"97s":["raise"],"96s":["raise"],
    "87s":["raise"],"86s":["raise"],
    "76s":["raise"],"75s":["raise"],
    "65s":["raise"],"55":["raise"],
  };

  const HJ: HandRange = {
    AA:["raise"],KK:["raise"],QQ:["raise"],JJ:["raise"],TT:["raise"],"99":["raise"],"88":["raise"],"77":["raise"],"66":["raise"],"55":["raise"],
    AKs:["raise"],AQs:["raise"],AJs:["raise"],ATs:["raise"],A9s:["raise"],A8s:["raise"],A7s:["raise"],A6s:["raise"],A5s:["raise"],A4s:["raise"],A3s:["raise"],
    AKo:["raise"],AQo:["raise"],AJo:["raise"],ATo:["raise"],A9o:["raise"],
    KQs:["raise"],KJs:["raise"],KTs:["raise"],K9s:["raise"],K8s:["raise"],
    KQo:["raise"],KJo:["raise"],KTo:["raise"],
    QJs:["raise"],QTs:["raise"],Q9s:["raise"],Q8s:["raise"],
    QJo:["raise"],QTo:["raise"],
    JTs:["raise"],J9s:["raise"],J8s:["raise"],
    T9s:["raise"],T8s:["raise"],T7s:["raise"],
    "98s":["raise"],"97s":["raise"],"96s":["raise"],
    "87s":["raise"],"86s":["raise"],
    "76s":["raise"],"75s":["raise"],
    "65s":["raise"],"54s":["raise"],
  };

  const CO: HandRange = {
    AA:["raise"],KK:["raise"],QQ:["raise"],JJ:["raise"],TT:["raise"],"99":["raise"],"88":["raise"],"77":["raise"],"66":["raise"],"55":["raise"],"44":["raise"],
    AKs:["raise"],AQs:["raise"],AJs:["raise"],ATs:["raise"],A9s:["raise"],A8s:["raise"],A7s:["raise"],A6s:["raise"],A5s:["raise"],A4s:["raise"],A3s:["raise"],A2s:["raise"],
    AKo:["raise"],AQo:["raise"],AJo:["raise"],ATo:["raise"],A9o:["raise"],A8o:["raise"],
    KQs:["raise"],KJs:["raise"],KTs:["raise"],K9s:["raise"],K8s:["raise"],K7s:["raise"],
    KQo:["raise"],KJo:["raise"],KTo:["raise"],
    QJs:["raise"],QTs:["raise"],Q9s:["raise"],Q8s:["raise"],
    QJo:["raise"],QTo:["raise"],
    JTs:["raise"],J9s:["raise"],J8s:["raise"],
    JTo:["raise"],
    T9s:["raise"],T8s:["raise"],T7s:["raise"],
    "98s":["raise"],"97s":["raise"],"96s":["raise"],
    "87s":["raise"],"86s":["raise"],"85s":["raise"],
    "76s":["raise"],"75s":["raise"],
    "65s":["raise"],"64s":["raise"],
    "54s":["raise"],"53s":["raise"],
  };

  const BTN: HandRange = {
    AA:["raise"],KK:["raise"],QQ:["raise"],JJ:["raise"],TT:["raise"],"99":["raise"],"88":["raise"],"77":["raise"],"66":["raise"],"55":["raise"],"44":["raise"],"33":["raise"],"22":["raise"],
    AKs:["raise"],AQs:["raise"],AJs:["raise"],ATs:["raise"],A9s:["raise"],A8s:["raise"],A7s:["raise"],A6s:["raise"],A5s:["raise"],A4s:["raise"],A3s:["raise"],A2s:["raise"],
    AKo:["raise"],AQo:["raise"],AJo:["raise"],ATo:["raise"],A9o:["raise"],A8o:["raise"],
    KQs:["raise"],KJs:["raise"],KTs:["raise"],K9s:["raise"],K8s:["raise"],K7s:["raise"],K6s:["raise"],K5s:["raise"],
    KQo:["raise"],KJo:["raise"],KTo:["raise"],
    QJs:["raise"],QTs:["raise"],Q9s:["raise"],Q8s:["raise"],
    QJo:["raise"],QTo:["raise"],
    JTs:["raise"],J9s:["raise"],J8s:["raise"],
    JTo:["raise"],
    T9s:["raise"],T8s:["raise"],T7s:["raise"],
    "98s":["raise"],"97s":["raise"],"96s":["raise"],
    "87s":["raise"],"86s":["raise"],"85s":["raise"],
    "76s":["raise"],"75s":["raise"],
    "65s":["raise"],"64s":["raise"],
    "54s":["raise"],"53s":["raise"],
    "43s":["raise"],
  };

  const SB: HandRange = {
    AA:["raise"],KK:["raise"],QQ:["raise"],JJ:["raise"],TT:["raise"],"99":["raise"],"88":["raise"],"77":["raise"],"66":["raise"],"55":["raise"],"44":["raise"],"33":["raise"],"22":["raise"],
    AKs:["raise"],AQs:["raise"],AJs:["raise"],ATs:["raise"],A9s:["raise"],A8s:["raise"],A7s:["raise"],A6s:["raise"],A5s:["raise"],A4s:["raise"],A3s:["raise"],A2s:["raise"],
    AKo:["raise"],AQo:["raise"],AJo:["raise"],ATo:["raise"],A9o:["raise"],A8o:["raise"],A7o:["raise"],
    KQs:["raise"],KJs:["raise"],KTs:["raise"],K9s:["raise"],K8s:["raise"],K7s:["raise"],
    KQo:["raise"],KJo:["raise"],KTo:["raise"],K9o:["raise"],
    QJs:["raise"],QTs:["raise"],Q9s:["raise"],Q8s:["raise"],
    QJo:["raise"],QTo:["raise"],
    JTs:["raise"],J9s:["raise"],J8s:["raise"],
    T9s:["raise"],T8s:["raise"],
    "98s":["raise"],"97s":["raise"],
    "87s":["raise"],"86s":["raise"],
    "76s":["raise"],"75s":["raise"],
    "65s":["raise"],"54s":["raise"],
  };

  const BB: HandRange = {
    AA:["3bet"],KK:["3bet"],QQ:["3bet"],JJ:["3bet"],TT:["3bet"],
    AKs:["3bet"],AQs:["3bet"],AJs:["3bet"],ATs:["3bet"],
    AKo:["3bet"],AQo:["3bet"],
    "99":["call"],"88":["call"],"77":["call"],"66":["call"],"55":["call"],"44":["call"],"33":["call"],"22":["call"],
    A9s:["call"],A8s:["call"],A7s:["call"],A6s:["call"],A5s:["3bet"],A4s:["call"],A3s:["call"],A2s:["call"],
    AJo:["call"],ATo:["call"],A9o:["call"],A8o:["call"],
    KQs:["call"],KJs:["call"],KTs:["call"],K9s:["call"],K8s:["call"],K7s:["call"],
    KQo:["call"],KJo:["call"],KTo:["call"],
    QJs:["call"],QTs:["call"],Q9s:["call"],Q8s:["call"],
    QJo:["call"],QTo:["call"],
    JTs:["call"],J9s:["call"],J8s:["call"],J7s:["call"],
    T9s:["call"],T8s:["call"],T7s:["call"],
    "98s":["call"],"97s":["call"],"96s":["call"],
    "87s":["call"],"86s":["call"],"85s":["call"],
    "76s":["call"],"75s":["call"],"74s":["call"],
    "65s":["call"],"64s":["call"],
    "54s":["call"],"53s":["call"],
    "43s":["call"],
  };

  const result: Record<string, HandRange> = { UTG, HJ, CO, BTN, SB, BB };
  if (tableSize >= 7) result["UTG+1"] = UTGp1;
  if (tableSize >= 8) result["UTG+2"] = UTGp2;
  if (tableSize >= 9) result["LJ"] = LJ;
  return result;
};

// 预构建各桌型范围
const ALL_RANGES: Record<number, Record<string, HandRange>> = {
  6: buildRanges(6),
  7: buildRanges(7),
  8: buildRanges(8),
  9: buildRanges(9),
  10: buildRanges(10),
};

const ACTION_COLORS: Record<ActionType, string> = {
  raise: "bg-red-600 text-white",
  "3bet": "bg-purple-600 text-white",
  call: "bg-green-600 text-white",
  limp: "bg-yellow-500 text-white",
  fold: "bg-gray-200 text-gray-400",
};

const ACTION_LABELS: Record<ActionType, string> = {
  raise: "开牌",
  "3bet": "3-Bet",
  call: "跟注",
  limp: "跛入",
  fold: "弃牌",
};

// ─── 起手牌矩阵组件 ────────────────────────────────────────────────────────────
function HandRangeMatrix() {
  const [tableSize, setTableSize] = useState(6);
  const [position, setPosition] = useState("BTN");

  const positions = TABLE_POSITIONS[tableSize];
  const rangeMap = ALL_RANGES[tableSize];
  const range = rangeMap[position] || {};

  // 当切换桌型时，如果当前位置不在新桌型中，重置为 BTN
  const safePosition = positions.includes(position) ? position : "BTN";
  if (safePosition !== position) {
    // trigger reset via useMemo dependency
  }

  const getAction = (r1: string, r2: string): ActionType => {
    const i1 = RANKS.indexOf(r1);
    const i2 = RANKS.indexOf(r2);
    if (i1 === i2) return (range[r1 + r2]?.[0]) || "fold";
    if (i1 < i2) return (range[`${r1}${r2}s`]?.[0]) || "fold";
    return (range[`${r2}${r1}o`]?.[0]) || "fold";
  };

  const stats = useMemo(() => {
    const counts: Record<ActionType, number> = { raise: 0, "3bet": 0, call: 0, limp: 0, fold: 0 };
    RANKS.forEach(r1 => RANKS.forEach(r2 => { counts[getAction(r1, r2)]++; }));
    const total = 13 * 13;
    return Object.entries(counts)
      .map(([k, v]) => ({ action: k as ActionType, count: v, pct: ((v / total) * 100).toFixed(0) }))
      .filter(s => s.count > 0 && s.action !== "fold");
  }, [tableSize, safePosition]);

  const [selectedHand, setSelectedHand] = useState<string | null>(null);

  const handleTableChange = (size: number) => {
    setTableSize(size);
    const newPositions = TABLE_POSITIONS[size];
    if (!newPositions.includes(position)) setPosition("BTN");
    setSelectedHand(null);
  };

  return (
    <div className="pb-4">
      {/* 桌型选择 */}
      <div className="px-3 pt-3 pb-1">
        <div className="text-xs text-gray-400 mb-1.5 font-medium">桌型人数</div>
        <div className="flex gap-1.5">
          {[6, 7, 8, 9, 10].map(n => (
            <button
              key={n}
              onClick={() => handleTableChange(n)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                tableSize === n
                  ? "bg-green-800 text-white border-green-800 shadow"
                  : "bg-white text-gray-500 border-gray-200"
              }`}
            >
              {n}人桌
            </button>
          ))}
        </div>
      </div>

      {/* 位置选择 */}
      <div className="px-3 pt-2 pb-1">
        <div className="text-xs text-gray-400 mb-1.5 font-medium">座位位置</div>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {TABLE_POSITIONS[tableSize].map(p => (
            <button
              key={p}
              onClick={() => { setPosition(p); setSelectedHand(null); }}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
                safePosition === p
                  ? "bg-green-700 text-white border-green-700 shadow"
                  : "bg-white text-gray-600 border-gray-300"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* 统计栏 */}
      <div className="flex gap-2 px-3 pb-2 flex-wrap">
        {stats.map(s => (
          <div key={s.action} className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs ${ACTION_COLORS[s.action]}`}>
            <span>{ACTION_LABELS[s.action]}</span>
            <span className="font-bold">{s.pct}%</span>
          </div>
        ))}
      </div>

      {/* 矩阵 */}
      <div className="px-2 overflow-x-auto">
        <div className="min-w-[320px]">
          <div className="grid mb-0.5" style={{ gridTemplateColumns: "20px repeat(13, 1fr)" }}>
            <div />
            {RANKS.map(r => (
              <div key={r} className="text-center text-[9px] font-bold text-gray-500">{r}</div>
            ))}
          </div>
          {RANKS.map((r1, i) => (
            <div key={r1} className="grid mb-0.5" style={{ gridTemplateColumns: "20px repeat(13, 1fr)" }}>
              <div className="flex items-center justify-center text-[9px] font-bold text-gray-500">{r1}</div>
              {RANKS.map((r2, j) => {
                const isPair = i === j;
                const isSuited = i < j;
                const handKey = isPair ? r1 + r2 : isSuited ? `${r1}${r2}s` : `${r2}${r1}o`;
                const action = getAction(r1, r2);
                const isSelected = selectedHand === handKey;
                return (
                  <button
                    key={r2}
                    onClick={() => setSelectedHand(isSelected ? null : handKey)}
                    className={`aspect-square flex items-center justify-center text-[7px] font-bold rounded-sm mx-px transition-all ${ACTION_COLORS[action]} ${isSelected ? "ring-2 ring-yellow-400 scale-110 z-10 relative" : ""}`}
                    title={handKey}
                  >
                    {isPair ? r1 + r2 : isSuited ? "s" : "o"}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* 图例 */}
      <div className="flex flex-wrap gap-2 px-3 pt-3">
        {(Object.entries(ACTION_COLORS) as [ActionType, string][]).map(([action, cls]) => (
          <div key={action} className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs ${cls}`}>
            {ACTION_LABELS[action]}
          </div>
        ))}
        <div className="text-xs text-gray-400 ml-1 self-center">上三角=同花 下三角=异色</div>
      </div>

      {/* 选中手牌说明 */}
      {selectedHand && (
        <div className="mx-3 mt-3 p-3 bg-green-50 border border-green-200 rounded-xl">
          <div className="font-bold text-green-800 text-base mb-1">{selectedHand}</div>
          <div className="text-sm text-green-700">
            {rangeMap[safePosition]?.[selectedHand]
              ? `${safePosition} 位置（${tableSize}人桌）：${rangeMap[safePosition][selectedHand].map(a => ACTION_LABELS[a]).join(" / ")}`
              : `${safePosition} 位置（${tableSize}人桌）：弃牌（不在开牌范围）`}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 赔率计算器 ────────────────────────────────────────────────────────────────
function OddsCalculator() {
  const [potSize, setPotSize] = useState("");
  const [betSize, setBetSize] = useState("");
  const [street, setStreet] = useState("flop");

  const streets = [
    { key: "preflop", label: "翻牌前" },
    { key: "flop", label: "翻牌" },
    { key: "turn", label: "转牌" },
    { key: "river", label: "河牌" },
  ];

  const pot = parseFloat(potSize) || 0;
  const bet = parseFloat(betSize) || 0;
  const totalPot = pot + bet;
  const potOdds = totalPot > 0 && bet > 0 ? (bet / totalPot * 100) : 0;
  const isGoodCall = potOdds > 0;

  const outs = [
    { name: "同花听牌", outs: 9, flop: 35, turn: 20 },
    { name: "两头顺子", outs: 8, flop: 31, turn: 17 },
    { name: "内顺子", outs: 4, flop: 17, turn: 9 },
    { name: "一对→三条", outs: 2, flop: 8, turn: 4 },
    { name: "同花+两头顺", outs: 15, flop: 54, turn: 33 },
  ];

  return (
    <div className="px-4 py-4 space-y-5">
      {/* 街道选择 */}
      <div>
        <div className="text-xs text-gray-500 mb-2 font-medium">当前街道</div>
        <div className="grid grid-cols-4 gap-1.5">
          {streets.map(s => (
            <button
              key={s.key}
              onClick={() => setStreet(s.key)}
              className={`py-2 rounded-lg text-xs font-bold border transition-all ${
                street === s.key ? "bg-green-700 text-white border-green-700" : "bg-white text-gray-600 border-gray-200"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* 输入 */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-xs text-gray-500 mb-1">底池大小</div>
          <input
            type="number"
            value={potSize}
            onChange={e => setPotSize(e.target.value)}
            placeholder="例：100"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-500"
          />
        </div>
        <div>
          <div className="text-xs text-gray-500 mb-1">对方下注</div>
          <input
            type="number"
            value={betSize}
            onChange={e => setBetSize(e.target.value)}
            placeholder="例：50"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-500"
          />
        </div>
      </div>

      {/* 结果 */}
      {pot > 0 && bet > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">总底池</span>
            <span className="font-bold">{totalPot.toFixed(0)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">底池赔率</span>
            <span className="font-bold text-green-700">{potOdds.toFixed(1)}%</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">跟注所需最低胜率</span>
            <span className="font-bold text-red-600">{potOdds.toFixed(1)}%</span>
          </div>
          <div className="text-xs text-gray-500 mt-1 pt-2 border-t border-green-200">
            若你的手牌胜率 &gt; {potOdds.toFixed(1)}%，跟注有正期望值
          </div>
        </div>
      )}

      {/* Outs 参考表 */}
      <div>
        <div className="text-xs text-gray-500 mb-2 font-medium">常见听牌胜率参考</div>
        <div className="rounded-xl border border-gray-100 overflow-hidden">
          <div className="grid grid-cols-4 bg-gray-50 px-3 py-2 text-xs text-gray-400 font-medium">
            <span>听牌类型</span>
            <span className="text-center">Outs</span>
            <span className="text-center">翻牌后</span>
            <span className="text-center">转牌后</span>
          </div>
          {outs.map((o, i) => (
            <div key={i} className={`grid grid-cols-4 px-3 py-2.5 text-xs ${i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}`}>
              <span className="text-gray-700">{o.name}</span>
              <span className="text-center font-bold text-green-700">{o.outs}</span>
              <span className="text-center text-blue-600">{o.flop}%</span>
              <span className="text-center text-orange-500">{o.turn}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── GTO 笔记 ─────────────────────────────────────────────────────────────────
function GtoNotes({ ledgerId }: { ledgerId: number }) {
  const [content, setContent] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState("");

  const { data: notes = [], refetch } = trpc.gtoGetNotes.useQuery({ ledgerId });

  const addNote = trpc.gtoAddNote.useMutation({
    onSuccess: () => { setContent(""); refetch(); toast.success("笔记已保存"); },
    onError: () => toast.error("保存失败"),
  });

  const updateNote = trpc.gtoUpdateNote.useMutation({
    onSuccess: () => { setEditId(null); refetch(); toast.success("已更新"); },
    onError: () => toast.error("更新失败"),
  });

  const deleteNote = trpc.gtoDeleteNote.useMutation({
    onSuccess: () => { refetch(); toast.success("已删除"); },
    onError: () => toast.error("删除失败"),
  });

  return (
    <div className="px-4 py-4 space-y-4">
      <div>
        <div className="text-xs text-gray-500 mb-2 font-medium">新增笔记</div>
        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder="记录你的 GTO 心得、策略调整、复盘笔记..."
          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-green-500 resize-none"
          rows={4}
        />
        <button
          onClick={() => content.trim() && addNote.mutate({ ledgerId, content: content.trim() })}
          disabled={!content.trim() || addNote.isPending}
          className="mt-2 w-full py-2.5 bg-green-700 text-white rounded-xl text-sm font-bold disabled:opacity-40"
        >
          {addNote.isPending ? "保存中..." : "保存笔记"}
        </button>
      </div>

      <div className="space-y-3">
        {notes.length === 0 && (
          <div className="text-center text-gray-400 text-sm py-8">暂无笔记，记录你的第一条 GTO 心得</div>
        )}
        {(notes as any[]).map((note: any) => (
          <div key={note.id} className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm">
            {editId === note.id ? (
              <>
                <textarea
                  value={editContent}
                  onChange={e => setEditContent(e.target.value)}
                  className="w-full border border-green-300 rounded-lg px-2 py-1.5 text-sm resize-none focus:outline-none"
                  rows={3}
                />
                <div className="flex gap-2 mt-2">
                  <button onClick={() => updateNote.mutate({ id: note.id, content: editContent })} className="flex-1 py-1.5 bg-green-700 text-white rounded-lg text-xs font-bold">保存</button>
                  <button onClick={() => setEditId(null)} className="flex-1 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-xs">取消</button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{note.content}</p>
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-50">
                  <span className="text-xs text-gray-400">{new Date(note.createdAt).toLocaleString()}</span>
                  <div className="flex gap-2">
                    <button onClick={() => { setEditId(note.id); setEditContent(note.content); }} className="text-xs text-green-600 font-medium">编辑</button>
                    <button onClick={() => deleteNote.mutate({ id: note.id })} className="text-xs text-red-500 font-medium">删除</button>
                  </div>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── 主页面 ────────────────────────────────────────────────────────────────────
export default function GtoPoker() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const ledgerId = Number(id);
  const [tab, setTab] = useState<"range" | "odds" | "notes">("range");

  const tabs = [
    { key: "range" as const, label: "起手牌范围", icon: "🃏" },
    { key: "odds" as const, label: "赔率计算", icon: "🧮" },
    { key: "notes" as const, label: "GTO 笔记", icon: "📝" },
  ];

  return (
    <div className="min-h-screen bg-gray-50 max-w-md mx-auto">
      <div className="bg-gradient-to-r from-green-900 to-green-700 text-white">
        <div className="flex items-center p-3">
          <button onClick={() => navigate(`/ledger/${ledgerId}`)}>
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 text-center pr-5">
            <div className="font-bold text-base">GTO 策略</div>
            <div className="text-xs opacity-75">德州扑克博弈论最优</div>
          </div>
        </div>
        <div className="flex border-t border-green-600">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 py-2.5 text-xs font-medium transition-all ${
                tab === t.key ? "bg-white/20 border-b-2 border-white" : "opacity-70"
              }`}
            >
              <span className="mr-1">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="pb-8">
        {tab === "range" && <HandRangeMatrix />}
        {tab === "odds" && <OddsCalculator />}
        {tab === "notes" && <GtoNotes ledgerId={ledgerId} />}
      </div>
    </div>
  );
}
