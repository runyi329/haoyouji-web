import { useParams, useLocation } from "wouter";
import { ArrowLeft, BookOpen, Calculator, StickyNote, Save, RotateCcw } from "lucide-react";
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

// ─── GTO 参考顾问 ────────────────────────────────────────────────────────────────
const SUITS = [
  { key: "s", label: "♠", color: "text-gray-800" },
  { key: "h", label: "♥", color: "text-red-500" },
  { key: "d", label: "♦", color: "text-red-500" },
  { key: "c", label: "♣", color: "text-gray-800" },
];

const CARD_RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];

const OPPONENT_ACTIONS = [
  { key: "none", label: "无人开牌", desc: "所有人弃牌到我" },
  { key: "limp", label: "有人跛入", desc: "有人只跟大盲" },
  { key: "open", label: "有人开牌", desc: "有人标准加注" },
  { key: "3bet", label: "有人3-Bet", desc: "有人再加注" },
  { key: "4bet", label: "有人4-Bet", desc: "有人四次加注" },
  { key: "allin", label: "有人全押", desc: "有人All-in" },
];

function getGtoAdvice(params: {
  tableSize: number;
  position: string;
  card1Rank: string;
  card1Suit: string;
  card2Rank: string;
  card2Suit: string;
  opponentAction: string;
}): { action: string; color: string; reason: string; frequency?: string } {
  const { position, card1Rank, card2Rank, card1Suit, card2Suit, opponentAction, tableSize } = params;
  if (!card1Rank || !card2Rank) return { action: "请选择手牌", color: "text-gray-400", reason: "" };

  const r1 = RANKS.indexOf(card1Rank);
  const r2 = RANKS.indexOf(card2Rank);
  const isPair = card1Rank === card2Rank;
  const isSuited = !isPair && card1Suit === card2Suit;
  const highRank = Math.min(r1, r2);
  const lowRank = Math.max(r1, r2);
  const gap = lowRank - highRank; // 0=连牌, 1=一个间隔

  // 强度评分 (越低越强)
  let strength = 0;
  if (isPair) strength = highRank * 2;
  else if (isSuited) strength = highRank * 3 + lowRank + (gap > 2 ? 10 : 0);
  else strength = highRank * 3 + lowRank + (gap > 2 ? 15 : 5);

  // 位置加成（越靠后越宽松）
  const posBonus: Record<string, number> = {
    UTG: 0, "UTG+1": 3, "UTG+2": 5, LJ: 7, HJ: 10, CO: 15, BTN: 22, SB: 18, BB: 12
  };
  const bonus = posBonus[position] || 0;
  const tableBonus = (10 - tableSize) * 2; // 人数越少越宽松
  const effectiveStrength = strength - bonus - tableBonus;

  // 对手行动影响
  if (opponentAction === "none") {
    // 无人开牌，主动开牌决策
    if (effectiveStrength <= 8) return { action: "开牌加注", color: "text-red-600", reason: `${position}位置强牌，主动开牌建立底池`, frequency: "100%" };
    if (effectiveStrength <= 18) return { action: "开牌加注", color: "text-red-500", reason: `${position}位置中等强牌，标准开牌`, frequency: "80-100%" };
    if (effectiveStrength <= 28) return { action: "开牌加注", color: "text-orange-500", reason: `${position}位置边缘牌，可以开牌但需谨慎`, frequency: "40-70%" };
    return { action: "弃牌", color: "text-gray-500", reason: `${position}位置牌力不足，GTO建议弃牌`, frequency: "0%" };
  }

  if (opponentAction === "limp") {
    if (effectiveStrength <= 6) return { action: "加注隔离", color: "text-red-600", reason: "强牌面对跛入，加注隔离建立底池", frequency: "100%" };
    if (effectiveStrength <= 16) return { action: "加注隔离", color: "text-red-500", reason: "中等强牌，加注隔离跛入者", frequency: "70-100%" };
    if (effectiveStrength <= 24) return { action: "跟注", color: "text-green-600", reason: "边缘牌，跟注看翻牌", frequency: "50%" };
    return { action: "弃牌", color: "text-gray-500", reason: "牌力不足，弃牌", frequency: "0%" };
  }

  if (opponentAction === "open") {
    // 面对开牌，跟注/3-bet/弃牌
    if (effectiveStrength <= 4) return { action: "3-Bet", color: "text-purple-600", reason: "顶级强牌，3-Bet价值下注", frequency: "100%" };
    if (effectiveStrength <= 10) return { action: "3-Bet / 跟注", color: "text-purple-500", reason: "强牌，可3-Bet或跟注，取决于对手风格", frequency: "3bet 60% / call 40%" };
    if (effectiveStrength <= 20) return { action: "跟注", color: "text-green-600", reason: "中等牌力，跟注看翻牌", frequency: "70-100%" };
    if (effectiveStrength <= 28) return { action: "弃牌 / 跟注", color: "text-yellow-600", reason: "边缘牌，位置好可跟注，位置差建议弃牌", frequency: "call 30%" };
    return { action: "弃牌", color: "text-gray-500", reason: "牌力不足以面对开牌，弃牌", frequency: "0%" };
  }

  if (opponentAction === "3bet") {
    if (effectiveStrength <= 3) return { action: "4-Bet", color: "text-red-700", reason: "顶级强牌，4-Bet价值", frequency: "100%" };
    if (effectiveStrength <= 8) return { action: "4-Bet / 跟注", color: "text-purple-600", reason: "强牌，可4-Bet或跟注", frequency: "4bet 40% / call 60%" };
    if (effectiveStrength <= 15) return { action: "跟注", color: "text-green-600", reason: "中等强牌，跟注面对3-Bet", frequency: "50-70%" };
    return { action: "弃牌", color: "text-gray-500", reason: "面对3-Bet牌力不足，弃牌", frequency: "0%" };
  }

  if (opponentAction === "4bet") {
    if (effectiveStrength <= 2) return { action: "全押", color: "text-red-700", reason: "AA/KK面对4-Bet，全押", frequency: "100%" };
    if (effectiveStrength <= 6) return { action: "跟注 / 全押", color: "text-red-600", reason: "强牌面对4-Bet，可跟注或全押", frequency: "call 50% / allin 50%" };
    return { action: "弃牌", color: "text-gray-500", reason: "面对4-Bet牌力不足，弃牌", frequency: "0%" };
  }

  if (opponentAction === "allin") {
    if (effectiveStrength <= 2) return { action: "跟注", color: "text-red-700", reason: "AA/KK面对全押，必须跟注", frequency: "100%" };
    if (effectiveStrength <= 5) return { action: "跟注", color: "text-red-600", reason: "强牌面对全押，跟注", frequency: "80-100%" };
    if (effectiveStrength <= 10) return { action: "跟注 / 弃牌", color: "text-yellow-600", reason: "中等强牌，取决于筹码深度和对手范围", frequency: "call 40%" };
    return { action: "弃牌", color: "text-gray-500", reason: "面对全押牌力不足，弃牌", frequency: "0%" };
  }

  return { action: "弃牌", color: "text-gray-500", reason: "" };
}

function CardPicker({ label, rank, suit, onRankChange, onSuitChange }: {
  label: string;
  rank: string;
  suit: string;
  onRankChange: (r: string) => void;
  onSuitChange: (s: string) => void;
}) {
  return (
    <div>
      <div className="text-xs text-gray-500 mb-1.5 font-medium">{label}</div>
      <div className="grid grid-cols-7 gap-1 mb-1.5">
        {CARD_RANKS.map(r => (
          <button
            key={r}
            onClick={() => onRankChange(r)}
            className={`py-1.5 rounded text-xs font-bold border transition-all ${
              rank === r ? "bg-green-700 text-white border-green-700" : "bg-white text-gray-700 border-gray-200"
            }`}
          >{r}</button>
        ))}
      </div>
      <div className="grid grid-cols-4 gap-1">
        {SUITS.map(s => (
          <button
            key={s.key}
            onClick={() => onSuitChange(s.key)}
            className={`py-1.5 rounded text-sm font-bold border transition-all ${
              suit === s.key ? "bg-green-700 text-white border-green-700" : "bg-white border-gray-200"
            } ${suit !== s.key ? s.color : ""}`}
          >{s.label}</button>
        ))}
      </div>
    </div>
  );
}

// ─── 翻牌后分析工具函数 ────────────────────────────────────────────────────────
function analyzeBoardTexture(cards: Array<{rank: string; suit: string}>) {
  if (cards.length === 0) return { isMonotone: false, isTwoTone: false, isDry: true, hasHighCard: false, hasPair: false, isPossibleStraight: false, label: "" };
  const suits = cards.map(c => c.suit);
  const ranks = cards.map(c => c.rank);
  const uniqueSuits = new Set(suits).size;
  const isMonotone = uniqueSuits === 1;
  const isTwoTone = uniqueSuits === 2;
  const hasHighCard = ranks.some(r => ["A","K","Q"].includes(r));
  const rankCounts = ranks.reduce((acc, r) => { acc[r] = (acc[r] || 0) + 1; return acc; }, {} as Record<string, number>);
  const hasPair = Object.values(rankCounts).some(v => v >= 2);
  const order = ["A","2","3","4","5","6","7","8","9","T","J","Q","K","A"];
  const indices = ranks.map(r => order.indexOf(r)).filter(i => i >= 0).sort((a,b)=>a-b);
  let isPossibleStraight = false;
  for (let i = 0; i < indices.length - 1; i++) { if (indices[i+1] - indices[i] <= 2) { isPossibleStraight = true; break; } }
  const isDry = uniqueSuits === cards.length && !isPossibleStraight;
  let label = isMonotone ? "同花面" : isTwoTone ? "两花面" : "彩虹面";
  if (hasPair) label += "/对子面";
  if (isPossibleStraight) label += "/顺子面";
  if (hasHighCard) label += "/高牌面";
  return { isMonotone, isTwoTone, isDry, hasHighCard, hasPair, isPossibleStraight, label };
}

function evaluateHandWithBoard(hand: { rank1: string; suit1: string; rank2: string; suit2: string }, board: Array<{ rank: string; suit: string }>) {
  const allRanks = [hand.rank1, hand.rank2, ...board.map(c => c.rank)];
  const allSuits = [hand.suit1, hand.suit2, ...board.map(c => c.suit)];
  const RANK_ORDER = ["2","3","4","5","6","7","8","9","T","J","Q","K","A"];
  const suitCounts = allSuits.reduce((acc, s) => { acc[s] = (acc[s] || 0) + 1; return acc; }, {} as Record<string, number>);
  const hasFlushDraw = Object.values(suitCounts).some(v => v === 4);
  const hasFlush = Object.values(suitCounts).some(v => v >= 5);
  const rankCounts = allRanks.reduce((acc, r) => { acc[r] = (acc[r] || 0) + 1; return acc; }, {} as Record<string, number>);
  const pairs = Object.entries(rankCounts).filter(([,v]) => v === 2).length;
  const trips = Object.entries(rankCounts).filter(([,v]) => v === 3).length;
  const quads = Object.entries(rankCounts).filter(([,v]) => v === 4).length;
  const hitBoard = board.some(c => c.rank === hand.rank1 || c.rank === hand.rank2);
  const isPocketPair = hand.rank1 === hand.rank2;
  const myHighRank = Math.max(RANK_ORDER.indexOf(hand.rank1), RANK_ORDER.indexOf(hand.rank2));
  if (quads > 0) return { strength: "四条", score: 95, detail: "超强牌，慢玩或全押" };
  if (trips > 0 && pairs > 0) return { strength: "葫芦", score: 90, detail: "超强牌，价值下注" };
  if (hasFlush) return { strength: "同花", score: 85, detail: "强牌，积极下注" };
  if (trips > 0) return { strength: "三条", score: 75, detail: "强牌，积极下注" };
  if (pairs >= 2) return { strength: "两对", score: 65, detail: "中强牌，注意公共牌威胁" };
  if (pairs === 1 && hitBoard) { if (myHighRank >= 10) return { strength: "顶对", score: 60, detail: "中强牌，可下注" }; return { strength: "中对/底对", score: 45, detail: "中等牌力，谨慎下注" }; }
  if (isPocketPair) return { strength: "口袋对", score: 50, detail: "中等牌力" };
  if (hasFlushDraw) return { strength: "同花听牌", score: 40, detail: "有9张出路，可半诈唬" };
  return { strength: "空气/听牌", score: 20, detail: "牌力弱，考虑诈唬或弃牌" };
}

function getPostFlopAdvice(params: { handStrength: number; boardTexture: ReturnType<typeof analyzeBoardTexture>; playersLeft: number; opponentAction: string; street: "flop"|"turn"|"river"; position: string; }): { action: string; reason: string; isBluff: boolean } {
  const { handStrength, boardTexture, playersLeft, opponentAction, street, position } = params;
  const isLatePos = ["BTN","CO","HJ"].includes(position);
  if (opponentAction === "check") {
    if (handStrength >= 75) return { action: "下注 2/3 底池", reason: "强牌价值下注，建立底池", isBluff: false };
    if (handStrength >= 50) return { action: "下注 1/2 底池", reason: "中等牌力，薄价值下注", isBluff: false };
    if (handStrength >= 35 && boardTexture.isTwoTone) return { action: "下注 1/3 底池（半诈唬）", reason: "有听牌权益，半诈唬施压", isBluff: true };
    if (handStrength < 25 && isLatePos && playersLeft === 1) return { action: "下注 2/3 底池（诈唬）", reason: "位置好，对手过牌示弱，可诈唬", isBluff: true };
    return { action: "过牌", reason: "牌力不足以下注，过牌控制底池", isBluff: false };
  }
  if (opponentAction === "bet_small") {
    if (handStrength >= 75) return { action: "加注 2.5-3x", reason: "强牌，加注价值", isBluff: false };
    if (handStrength >= 50) return { action: "跟注", reason: "中等牌力，跟注看下一张", isBluff: false };
    if (handStrength >= 35 && boardTexture.isTwoTone) return { action: "跟注", reason: "有听牌权益，赔率合适", isBluff: false };
    return { action: "弃牌", reason: "牌力不足，弃牌", isBluff: false };
  }
  if (opponentAction === "bet_big") {
    if (handStrength >= 80) return { action: "加注 / 全押", reason: "强牌面对大注，加注价值", isBluff: false };
    if (handStrength >= 60) return { action: "跟注", reason: "强牌跟注，控制底池", isBluff: false };
    if (handStrength >= 40 && street !== "river") return { action: "跟注", reason: "有权益，赔率可接受", isBluff: false };
    return { action: "弃牌", reason: "面对大注牌力不足，弃牌", isBluff: false };
  }
  if (opponentAction === "allin") {
    if (handStrength >= 85) return { action: "跟注", reason: "超强牌，必须跟注", isBluff: false };
    if (handStrength >= 65 && street !== "river") return { action: "跟注", reason: "强牌+权益，跟注合算", isBluff: false };
    return { action: "弃牌", reason: "面对全押牌力不足，弃牌", isBluff: false };
  }
  return { action: "过牌", reason: "等待更多信息", isBluff: false };
}

const STREET_ACTIONS = [
  { key: "check", label: "过牌", emoji: "✋" },
  { key: "bet_small", label: "小注", emoji: "💰", desc: "1/3底池" },
  { key: "bet_big", label: "大注", emoji: "💰💰", desc: "2/3+底池" },
  { key: "allin", label: "全押", emoji: "🔥" },
];

// 对手对我方加注/下注的回应选项
const OPP_RESPONSES = [
  { key: "fold", label: "弃牌", emoji: "🏳️" },
  { key: "call", label: "跟注", emoji: "✅" },
  { key: "reraise", label: "反加注", emoji: "⬆️" },
  { key: "allin", label: "全押", emoji: "🔥" },
];

// 我的实际行动选项
const MY_ACTIONS = [
  { key: "check", label: "过牌", emoji: "✋" },
  { key: "call", label: "跟注", emoji: "✅" },
  { key: "bet_small", label: "小注", emoji: "💰", desc: "1/3底池" },
  { key: "bet_big", label: "大注", emoji: "💰💰", desc: "2/3+底池" },
  { key: "raise", label: "加注", emoji: "⬆️" },
  { key: "allin", label: "全押", emoji: "🔥" },
  { key: "fold", label: "弃牌", emoji: "🏳️" },
];

// 从 GTO 建议文本中提取对应的 MY_ACTIONS key
function extractGtoActionKey(adviceAction: string): string {
  if (/全押/.test(adviceAction)) return "allin";
  if (/加注|4-Bet|3-Bet|Bet/.test(adviceAction)) return "raise";
  if (/大注/.test(adviceAction)) return "bet_big";
  if (/小注|1\/3/.test(adviceAction)) return "bet_small";
  if (/下注/.test(adviceAction)) {
    if (/2\/3|大/.test(adviceAction)) return "bet_big";
    return "bet_small";
  }
  if (/跟注/.test(adviceAction)) return "call";
  if (/弃牌/.test(adviceAction)) return "fold";
  if (/过牌|收锅/.test(adviceAction)) return "check";
  return "";
}

// 判断我方行动是否为主动进攻（下注/加注）
function isAggressiveAction(action: string): boolean {
  return /下注|加注|全押/.test(action);
}

// 对手回应后的第二轮 GTO 建议
function getOppRespAdvice(params: { handStrength: number; oppResp: string; street: string; myAction: string }): { action: string; reason: string; isBluff: boolean } {
  const { handStrength, oppResp, myAction } = params;
  const isAllin = /全押/.test(myAction);
  if (oppResp === "fold") {
    return { action: "收锅 ✓", reason: "对手弃牌，本轮获得底池。记录为成功施压。", isBluff: false };
  }
  if (oppResp === "call") {
    if (handStrength >= 70) return { action: "继续价值", reason: "对手跟注，我方强牌，下一街继续下注建立底池", isBluff: false };
    if (handStrength >= 45) return { action: "谨慎控池", reason: "对手跟注，中等牌力，下一街倾向过牌/小注控制底池", isBluff: false };
    return { action: "过牌/放弃", reason: "对手跟注，我方牌力弱，下一街过牌，若对手下注考虑弃牌", isBluff: false };
  }
  if (oppResp === "reraise") {
    if (handStrength >= 85) return { action: "4-Bet / 全押", reason: "超强牌面对反加注，继续加注或全押价值最大化", isBluff: false };
    if (handStrength >= 65) return { action: "跟注", reason: "强牌面对反加注，跟注控制底池，避免过度膨胀", isBluff: false };
    if (handStrength >= 40 && !isAllin) return { action: "跟注（谨慎）", reason: "中等牌力面对反加注，赔率合适可跟注，但需警惕", isBluff: false };
    return { action: "弃牌", reason: "面对反加注牌力不足，弃牌止损", isBluff: false };
  }
  if (oppResp === "allin") {
    if (handStrength >= 85) return { action: "跟注全押", reason: "超强牌面对全押，必须跟注", isBluff: false };
    if (handStrength >= 70) return { action: "跟注（接近底线）", reason: "强牌面对全押，胜率支撑跟注，但需评估赔率", isBluff: false };
    return { action: "弃牌", reason: "面对全押牌力不足，弃牌止损", isBluff: false };
  }
  return { action: "等待", reason: "等待对手行动", isBluff: false };
}

function QuickCardPicker({ label, rank, suit, onSelect, usedCards = [] }: { label: string; rank: string; suit: string; onSelect: (rank: string, suit: string) => void; usedCards?: string[]; }) {
  const [pendingRank, setPendingRank] = useState(rank);
  return (
    <div className="space-y-1">
      <div className="text-[10px] text-gray-400 font-medium">{label}</div>
      <div className="grid grid-cols-7 gap-0.5">
        {CARD_RANKS.map(r => (
          <button key={r} onClick={() => { setPendingRank(r); if (suit) onSelect(r, suit); }}
            className={`py-1.5 rounded text-xs font-bold border transition-all ${
              (rank === r || pendingRank === r) ? "bg-green-700 text-white border-green-700" : "bg-white text-gray-700 border-gray-200"
            }`}
          >{r}</button>
        ))}
      </div>
      <div className="grid grid-cols-4 gap-0.5">
        {SUITS.map(s => {
          const used = usedCards.includes(`${pendingRank || rank}${s.key}`);
          return (
            <button key={s.key} onClick={() => { if (!used && (pendingRank || rank)) onSelect(pendingRank || rank, s.key); }}
              disabled={used || !(pendingRank || rank)}
              className={`py-1.5 rounded text-sm font-bold border transition-all ${
                suit === s.key && rank === (pendingRank || rank) ? "bg-green-700 text-white border-green-700" :
                used ? "bg-gray-100 text-gray-300 border-gray-100" :
                `bg-white border-gray-200 ${s.color}`
              }`}
            >{s.label}</button>
          );
        })}
      </div>
    </div>
  );
}

function CardDisplay({ rank, suit, size = "sm" }: { rank: string; suit: string; size?: "sm"|"md" }) {
  const suitObj = SUITS.find(s => s.key === suit);
  if (!rank || !suit) return (
    <div className={`${size === "md" ? "w-10 h-14" : "w-8 h-11"} rounded border-dashed border-2 border-gray-300 bg-gray-50 flex items-center justify-center`}>
      <span className="text-gray-300 text-xs">?</span>
    </div>
  );
  return (
    <div className={`${size === "md" ? "w-10 h-14" : "w-8 h-11"} rounded border-2 border-green-400 bg-white shadow flex flex-col items-center justify-center`}>
      <span className="text-xs font-bold leading-none">{rank}</span>
      <span className={`text-sm leading-none ${suitObj?.color}`}>{suitObj?.label}</span>
    </div>
  );
}

function AdviceCard({ action, reason, isBluff, detail }: { action: string; reason: string; isBluff?: boolean; detail?: string }) {
  return (
    <div className={`rounded-xl p-3 ${isBluff ? "bg-purple-900" : "bg-green-900"} text-white`}>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-base">{isBluff ? "🎭" : "🎯"}</span>
        <span className="text-lg font-black">{action}</span>
        {isBluff && <span className="text-xs bg-purple-700 px-1.5 py-0.5 rounded-full">诈唬</span>}
      </div>
      {detail && <div className="text-xs text-green-300 mb-0.5">{detail}</div>}
      <div className="text-xs text-green-100 leading-relaxed">{reason}</div>
    </div>
  );
}

function GtoAdvisor({ ledgerId }: { ledgerId: number }) {
  const [tableSize, setTableSize] = useState(6);
  const [position, setPosition] = useState("");
  const [hand, setHand] = useState({ rank1: "", suit1: "", rank2: "", suit2: "" });
  const [preflopAction, setPreflopAction] = useState("");
  const [flopCards, setFlopCards] = useState([{ rank: "", suit: "" }, { rank: "", suit: "" }, { rank: "", suit: "" }]);
  const [flopPlayersLeft, setFlopPlayersLeft] = useState(0);
  const [flopAction, setFlopAction] = useState("");
  const [turnCard, setTurnCard] = useState({ rank: "", suit: "" });
  const [turnPlayersLeft, setTurnPlayersLeft] = useState(0);
  const [turnAction, setTurnAction] = useState("");
  const [riverCard, setRiverCard] = useState({ rank: "", suit: "" });
  const [riverPlayersLeft, setRiverPlayersLeft] = useState(0);
  const [riverAction, setRiverAction] = useState("");
  const [result, setResult] = useState<"win"|"lose"|"tie"|"">("");
  const [opponentCards, setOpponentCards] = useState("");
  const [isBluffHand, setIsBluffHand] = useState(false);
  // 对手回应（我方下注/加注后，对手的行动）
  const [flopOppResp, setFlopOppResp] = useState("");
  const [turnOppResp, setTurnOppResp] = useState("");
  const [riverOppResp, setRiverOppResp] = useState("");
  // 我的实际行动（可能与GTO建议不同）
  const [preflopMyAction, setPreflopMyAction] = useState("");
  const [flopMyAction, setFlopMyAction] = useState("");
  const [turnMyAction, setTurnMyAction] = useState("");
  const [riverMyAction, setRiverMyAction] = useState("");
  // legacy compat
  const card1Rank = hand.rank1; const card1Suit = hand.suit1; const card2Rank = hand.rank2; const card2Suit = hand.suit2;
  const opponentAction = preflopAction;

  const positions = TABLE_POSITIONS[tableSize];
  const usedCards = useMemo(() => {
    const cards: string[] = [];
    if (hand.rank1 && hand.suit1) cards.push(`${hand.rank1}${hand.suit1}`);
    if (hand.rank2 && hand.suit2) cards.push(`${hand.rank2}${hand.suit2}`);
    flopCards.forEach(c => { if (c.rank && c.suit) cards.push(`${c.rank}${c.suit}`); });
    if (turnCard.rank && turnCard.suit) cards.push(`${turnCard.rank}${turnCard.suit}`);
    if (riverCard.rank && riverCard.suit) cards.push(`${riverCard.rank}${riverCard.suit}`);
    return cards;
  }, [hand, flopCards, turnCard, riverCard]);

  const preflopAdvice = useMemo(() => {
    if (!position || !hand.rank1 || !hand.suit1 || !hand.rank2 || !hand.suit2 || !preflopAction) return null;
    return getGtoAdvice({ tableSize, position, card1Rank: hand.rank1, card1Suit: hand.suit1, card2Rank: hand.rank2, card2Suit: hand.suit2, opponentAction: preflopAction });
  }, [tableSize, position, hand, preflopAction]);

  const flopComplete = flopCards.every(c => c.rank && c.suit);
  const flopBoard = flopComplete ? flopCards : [];
  const flopTexture = useMemo(() => analyzeBoardTexture(flopBoard), [flopBoard]);
  const flopHandEval = useMemo(() => { if (!flopComplete || !hand.rank1) return null; return evaluateHandWithBoard(hand, flopBoard); }, [flopComplete, hand, flopBoard]);
  const flopAdvice = useMemo(() => { if (!flopHandEval || !flopAction || flopPlayersLeft === 0) return null; return getPostFlopAdvice({ handStrength: flopHandEval.score, boardTexture: flopTexture, playersLeft: flopPlayersLeft, opponentAction: flopAction, street: "flop", position }); }, [flopHandEval, flopTexture, flopPlayersLeft, flopAction, position]);
  // 我方下注/加注后，对手回应的第二轮建议
  const flopAdvice2 = useMemo(() => { if (!flopAdvice || !isAggressiveAction(flopAdvice.action) || !flopOppResp || !flopHandEval) return null; return getOppRespAdvice({ handStrength: flopHandEval.score, oppResp: flopOppResp, street: "flop", myAction: flopAdvice.action }); }, [flopAdvice, flopOppResp, flopHandEval]);

  const turnBoard = [...flopBoard, ...(turnCard.rank && turnCard.suit ? [turnCard] : [])];
  const turnTexture = useMemo(() => analyzeBoardTexture(turnBoard), [turnBoard]);
  const turnHandEval = useMemo(() => { if (!turnCard.rank || !hand.rank1) return null; return evaluateHandWithBoard(hand, turnBoard); }, [turnCard, hand, turnBoard]);
  const turnAdvice = useMemo(() => { if (!turnHandEval || !turnAction || turnPlayersLeft === 0) return null; return getPostFlopAdvice({ handStrength: turnHandEval.score, boardTexture: turnTexture, playersLeft: turnPlayersLeft, opponentAction: turnAction, street: "turn", position }); }, [turnHandEval, turnTexture, turnPlayersLeft, turnAction, position]);
  const turnAdvice2 = useMemo(() => { if (!turnAdvice || !isAggressiveAction(turnAdvice.action) || !turnOppResp || !turnHandEval) return null; return getOppRespAdvice({ handStrength: turnHandEval.score, oppResp: turnOppResp, street: "turn", myAction: turnAdvice.action }); }, [turnAdvice, turnOppResp, turnHandEval]);

  const riverBoard = [...turnBoard, ...(riverCard.rank && riverCard.suit ? [riverCard] : [])];
  const riverTexture = useMemo(() => analyzeBoardTexture(riverBoard), [riverBoard]);
  const riverHandEval = useMemo(() => { if (!riverCard.rank || !hand.rank1) return null; return evaluateHandWithBoard(hand, riverBoard); }, [riverCard, hand, riverBoard]);
  const riverAdvice = useMemo(() => { if (!riverHandEval || !riverAction || riverPlayersLeft === 0) return null; return getPostFlopAdvice({ handStrength: riverHandEval.score, boardTexture: riverTexture, playersLeft: riverPlayersLeft, opponentAction: riverAction, street: "river", position }); }, [riverHandEval, riverTexture, riverPlayersLeft, riverAction, position]);
  const riverAdvice2 = useMemo(() => { if (!riverAdvice || !isAggressiveAction(riverAdvice.action) || !riverOppResp || !riverHandEval) return null; return getOppRespAdvice({ handStrength: riverHandEval.score, oppResp: riverOppResp, street: "river", myAction: riverAdvice.action }); }, [riverAdvice, riverOppResp, riverHandEval]);

  const saveHand = trpc["gto.saveHand"].useMutation({
    onSuccess: () => { toast.success("牌局已保存"); resetAll(); },
    onError: () => toast.error("保存失败"),
  });

  function resetAll() {
    setPosition(""); setHand({ rank1: "", suit1: "", rank2: "", suit2: "" }); setPreflopAction("");
    setFlopCards([{ rank: "", suit: "" }, { rank: "", suit: "" }, { rank: "", suit: "" }]);
    setFlopPlayersLeft(0); setFlopAction("");
    setTurnCard({ rank: "", suit: "" }); setTurnPlayersLeft(0); setTurnAction("");
    setRiverCard({ rank: "", suit: "" }); setRiverPlayersLeft(0); setRiverAction("");
    setResult(""); setOpponentCards(""); setIsBluffHand(false);
    setFlopOppResp(""); setTurnOppResp(""); setRiverOppResp("");
    setPreflopMyAction(""); setFlopMyAction(""); setTurnMyAction(""); setRiverMyAction("");
  }

  const canSave = result !== "" && hand.rank1 && position;

  return (
    <div className="px-3 py-3 space-y-4">
      <div className="flex justify-end">
        <button onClick={resetAll} className="flex items-center gap-1 text-xs text-gray-400 border border-gray-200 rounded-lg px-2.5 py-1.5">
          <RotateCcw className="w-3 h-3" /> 新局
        </button>
      </div>

      {/* ① 桌型 */}
      <div>
        <div className="text-xs font-bold text-gray-600 mb-1.5">① 几人桌</div>
        <div className="flex gap-1.5">
          {[6, 7, 8, 9, 10].map(n => (
            <button key={n} onClick={() => { setTableSize(n); setPosition(""); }}
              className={`flex-1 py-2.5 rounded-lg text-sm font-bold border transition-all ${tableSize === n ? "bg-green-800 text-white border-green-800" : "bg-white text-gray-600 border-gray-200"}`}
            >{n}人</button>
          ))}
        </div>
      </div>

      {/* ② 位置 */}
      <div>
        <div className="text-xs font-bold text-gray-600 mb-1.5">② 我的位置</div>
        <div className="flex flex-wrap gap-1.5">
          {positions.map(p => (
            <button key={p} onClick={() => setPosition(p)}
              className={`px-4 py-2.5 rounded-lg text-sm font-bold border transition-all ${position === p ? "bg-green-700 text-white border-green-700" : "bg-white text-gray-600 border-gray-200"}`}
            >{p}</button>
          ))}
        </div>
      </div>

      {/* ③ 手牌 */}
      <div>
        <div className="text-xs font-bold text-gray-600 mb-2">③ 我的手牌</div>
        {(hand.rank1 || hand.rank2) && (
          <div className="flex gap-2 mb-2">
            <CardDisplay rank={hand.rank1} suit={hand.suit1} size="md" />
            <CardDisplay rank={hand.rank2} suit={hand.suit2} size="md" />
          </div>
        )}
        <div className="space-y-2">
          <QuickCardPicker label="第一张" rank={hand.rank1} suit={hand.suit1}
            onSelect={(r, s) => setHand(h => ({ ...h, rank1: r, suit1: s }))}
            usedCards={usedCards.filter(c => c !== `${hand.rank1}${hand.suit1}`)}
          />
          <QuickCardPicker label="第二张" rank={hand.rank2} suit={hand.suit2}
            onSelect={(r, s) => setHand(h => ({ ...h, rank2: r, suit2: s }))}
            usedCards={usedCards.filter(c => c !== `${hand.rank2}${hand.suit2}`)}
          />
        </div>
      </div>

      {/* ④ 翻牌前对手行动 */}
      <div>
        <div className="text-xs font-bold text-gray-600 mb-1.5">④ 翻牌前对手行动</div>
        <div className="grid grid-cols-2 gap-1.5">
          {OPPONENT_ACTIONS.map(a => (
            <button key={a.key} onClick={() => setPreflopAction(a.key)}
              className={`py-2.5 px-2 rounded-lg border transition-all text-left ${preflopAction === a.key ? "bg-green-700 text-white border-green-700" : "bg-white border-gray-200"}`}
            >
              <div className="text-xs font-bold">{a.label}</div>
              <div className={`text-[10px] mt-0.5 ${preflopAction === a.key ? "text-green-100" : "text-gray-400"}`}>{a.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {preflopAdvice && (
        <AdviceCard action={preflopAdvice.action} reason={preflopAdvice.reason} detail={preflopAdvice.frequency ? `执行频率 ${preflopAdvice.frequency}` : undefined} />
      )}
      {preflopAdvice && (
        <div className="mt-2 border-t border-gray-100 pt-2">
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className="text-xs font-bold text-gray-700">我的实际行动</span>
            <span className="text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">⭐ GTO推荐：{preflopAdvice.action}</span>
          </div>
          <div className="grid grid-cols-4 gap-1 mb-1">
            {MY_ACTIONS.map(a => {
              const isGto = extractGtoActionKey(preflopAdvice.action) === a.key;
              return (
                <button key={a.key} onClick={() => setPreflopMyAction(a.key)}
                  className={`py-2 rounded-lg border text-xs font-bold transition-all relative ${
                    preflopMyAction === a.key ? "bg-gray-700 text-white border-gray-700" :
                    isGto ? "bg-amber-50 border-amber-400 text-amber-800" :
                    "bg-white border-gray-200 text-gray-700"
                  }`}
                >
                  {isGto && preflopMyAction !== a.key && <span className="absolute -top-1.5 -right-1 text-[9px] bg-amber-400 text-white px-0.5 rounded">GTO</span>}
                  {a.emoji} {a.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── FLOP ─── */}
      {preflopAdvice && (
        <div className="border-t-2 border-green-200 pt-3">
          <div className="text-xs font-bold text-green-700 mb-2">🃏 FLOP（翻牌）</div>
          <div className="flex gap-2 mb-2">
            {flopCards.map((c, i) => <CardDisplay key={i} rank={c.rank} suit={c.suit} size="md" />)}
          </div>
          <div className="space-y-2 mb-2">
            {flopCards.map((c, i) => (
              <QuickCardPicker key={i} label={`公共牌 ${i + 1}`} rank={c.rank} suit={c.suit}
                onSelect={(r, s) => setFlopCards(prev => prev.map((card, idx) => idx === i ? { rank: r, suit: s } : card))}
                usedCards={usedCards.filter(u => u !== `${c.rank}${c.suit}`)}
              />
            ))}
          </div>
          {flopComplete && (
            <div className="text-xs text-green-700 bg-green-50 rounded-lg px-2 py-1 mb-2">牌面：{flopTexture.label}</div>
          )}
          {flopComplete && (
            <>
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="text-xs font-bold text-gray-600">还剩几人</span>
                <span className="text-xs text-gray-400">（含自己）</span>
              </div>
              <div className="flex gap-1.5 mb-2">
                {[1,2,3,4,5].map(n => (
                  <button key={n} onClick={() => setFlopPlayersLeft(n)}
                    className={`flex-1 py-2 rounded-lg text-sm font-bold border transition-all ${flopPlayersLeft === n ? "bg-green-700 text-white border-green-700" : "bg-white text-gray-600 border-gray-200"}`}
                  >{n}人</button>
                ))}
              </div>
              <div className="text-xs font-bold text-gray-600 mb-1.5">对手行动</div>
              <div className="grid grid-cols-2 gap-1.5 mb-2">
                {STREET_ACTIONS.map(a => (
                  <button key={a.key} onClick={() => setFlopAction(a.key)}
                    className={`py-2.5 rounded-lg border text-xs font-bold transition-all ${flopAction === a.key ? "bg-green-700 text-white border-green-700" : "bg-white border-gray-200 text-gray-700"}`}
                  >{a.emoji} {a.label}{(a as any).desc ? ` (${(a as any).desc})` : ""}</button>
                ))}
              </div>
              {flopHandEval && <div className="text-xs text-purple-700 bg-purple-50 rounded-lg px-2 py-1 mb-2">我的牌力：{flopHandEval.strength} · {flopHandEval.detail}</div>}
              {flopAdvice && <AdviceCard action={flopAdvice.action} reason={flopAdvice.reason} isBluff={flopAdvice.isBluff} />}
              {flopAdvice && (
                <div className="mt-2 border-t border-gray-100 pt-2">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-xs font-bold text-gray-700">我的实际行动</span>
                    <span className="text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">⭐ GTO推荐：{flopAdvice.action}</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1 mb-1">
                    {MY_ACTIONS.map(a => {
                      const isGto = extractGtoActionKey(flopAdvice.action) === a.key;
                      return (
                        <button key={a.key} onClick={() => setFlopMyAction(a.key)}
                          className={`py-2 rounded-lg border text-xs font-bold transition-all relative ${
                            flopMyAction === a.key ? "bg-green-700 text-white border-green-700" :
                            isGto ? "bg-amber-50 border-amber-400 text-amber-800" :
                            "bg-white border-gray-200 text-gray-700"
                          }`}
                        >
                          {isGto && flopMyAction !== a.key && <span className="absolute -top-1.5 -right-1 text-[9px] bg-amber-400 text-white px-0.5 rounded">GTO</span>}
                          {a.emoji} {a.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {flopAdvice && isAggressiveAction(flopAdvice.action) && (
                <div className="mt-2 border-t border-green-100 pt-2">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-xs font-bold text-gray-600">对手回应</span>
                    <span className="text-xs text-gray-400">（我方下注后）</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5 mb-2">
                    {OPP_RESPONSES.map(r => (
                      <button key={r.key} onClick={() => setFlopOppResp(r.key)}
                        className={`py-2 rounded-lg border text-xs font-bold transition-all ${flopOppResp === r.key ? "bg-red-700 text-white border-red-700" : "bg-white border-gray-200 text-gray-700"}`}
                      >{r.emoji} {r.label}</button>
                    ))}
                  </div>
                  {flopAdvice2 && <AdviceCard action={flopAdvice2.action} reason={flopAdvice2.reason} isBluff={flopAdvice2.isBluff} />}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ─── TURN ─── */}
      {flopAdvice && (
        <div className="border-t-2 border-blue-200 pt-3">
          <div className="text-xs font-bold text-blue-700 mb-2">🃏 TURN（转牌）</div>
          <div className="flex gap-1.5 mb-2">
            {flopCards.map((c, i) => <CardDisplay key={i} rank={c.rank} suit={c.suit} />)}
            <CardDisplay rank={turnCard.rank} suit={turnCard.suit} />
          </div>
          <QuickCardPicker label="转牌" rank={turnCard.rank} suit={turnCard.suit}
            onSelect={(r, s) => setTurnCard({ rank: r, suit: s })}
            usedCards={usedCards.filter(u => u !== `${turnCard.rank}${turnCard.suit}`)}
          />
          {turnCard.rank && turnCard.suit && (
            <>
              <div className="flex items-center gap-1.5 mb-1.5 mt-2">
                <span className="text-xs font-bold text-gray-600">还剩几人</span>
                <span className="text-xs text-gray-400">（含自己）</span>
              </div>
              <div className="flex gap-1.5 mb-2">
                {[1,2,3,4,5].map(n => (
                  <button key={n} onClick={() => setTurnPlayersLeft(n)}
                    className={`flex-1 py-2 rounded-lg text-sm font-bold border transition-all ${turnPlayersLeft === n ? "bg-blue-700 text-white border-blue-700" : "bg-white text-gray-600 border-gray-200"}`}
                  >{n}人</button>
                ))}
              </div>
              <div className="text-xs font-bold text-gray-600 mb-1.5">对手行动</div>
              <div className="grid grid-cols-2 gap-1.5 mb-2">
                {STREET_ACTIONS.map(a => (
                  <button key={a.key} onClick={() => setTurnAction(a.key)}
                    className={`py-2.5 rounded-lg border text-xs font-bold transition-all ${turnAction === a.key ? "bg-blue-700 text-white border-blue-700" : "bg-white border-gray-200 text-gray-700"}`}
                  >{a.emoji} {a.label}{(a as any).desc ? ` (${(a as any).desc})` : ""}</button>
                ))}
              </div>
              {turnHandEval && <div className="text-xs text-purple-700 bg-purple-50 rounded-lg px-2 py-1 mb-2">我的牌力：{turnHandEval.strength} · {turnHandEval.detail}</div>}
              {turnAdvice && <AdviceCard action={turnAdvice.action} reason={turnAdvice.reason} isBluff={turnAdvice.isBluff} />}
              {turnAdvice && (
                <div className="mt-2 border-t border-gray-100 pt-2">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-xs font-bold text-gray-700">我的实际行动</span>
                    <span className="text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">⭐ GTO推荐：{turnAdvice.action}</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1 mb-1">
                    {MY_ACTIONS.map(a => {
                      const isGto = extractGtoActionKey(turnAdvice.action) === a.key;
                      return (
                        <button key={a.key} onClick={() => setTurnMyAction(a.key)}
                          className={`py-2 rounded-lg border text-xs font-bold transition-all relative ${
                            turnMyAction === a.key ? "bg-blue-700 text-white border-blue-700" :
                            isGto ? "bg-amber-50 border-amber-400 text-amber-800" :
                            "bg-white border-gray-200 text-gray-700"
                          }`}
                        >
                          {isGto && turnMyAction !== a.key && <span className="absolute -top-1.5 -right-1 text-[9px] bg-amber-400 text-white px-0.5 rounded">GTO</span>}
                          {a.emoji} {a.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {turnAdvice && isAggressiveAction(turnAdvice.action) && (
                <div className="mt-2 border-t border-blue-100 pt-2">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-xs font-bold text-gray-600">对手回应</span>
                    <span className="text-xs text-gray-400">（我方下注后）</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5 mb-2">
                    {OPP_RESPONSES.map(r => (
                      <button key={r.key} onClick={() => setTurnOppResp(r.key)}
                        className={`py-2 rounded-lg border text-xs font-bold transition-all ${turnOppResp === r.key ? "bg-red-700 text-white border-red-700" : "bg-white border-gray-200 text-gray-700"}`}
                      >{r.emoji} {r.label}</button>
                    ))}
                  </div>
                  {turnAdvice2 && <AdviceCard action={turnAdvice2.action} reason={turnAdvice2.reason} isBluff={turnAdvice2.isBluff} />}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ─── RIVER ─── */}
      {turnAdvice && (
        <div className="border-t-2 border-orange-200 pt-3">
          <div className="text-xs font-bold text-orange-700 mb-2">🃏 RIVER（河牌）</div>
          <div className="flex gap-1.5 mb-2">
            {flopCards.map((c, i) => <CardDisplay key={i} rank={c.rank} suit={c.suit} />)}
            <CardDisplay rank={turnCard.rank} suit={turnCard.suit} />
            <CardDisplay rank={riverCard.rank} suit={riverCard.suit} />
          </div>
          <QuickCardPicker label="河牌" rank={riverCard.rank} suit={riverCard.suit}
            onSelect={(r, s) => setRiverCard({ rank: r, suit: s })}
            usedCards={usedCards.filter(u => u !== `${riverCard.rank}${riverCard.suit}`)}
          />
          {riverCard.rank && riverCard.suit && (
            <>
              <div className="flex items-center gap-1.5 mb-1.5 mt-2">
                <span className="text-xs font-bold text-gray-600">还剩几人</span>
                <span className="text-xs text-gray-400">（含自己）</span>
              </div>
              <div className="flex gap-1.5 mb-2">
                {[1,2,3,4,5].map(n => (
                  <button key={n} onClick={() => setRiverPlayersLeft(n)}
                    className={`flex-1 py-2 rounded-lg text-sm font-bold border transition-all ${riverPlayersLeft === n ? "bg-orange-700 text-white border-orange-700" : "bg-white text-gray-600 border-gray-200"}`}
                  >{n}人</button>
                ))}
              </div>
              <div className="text-xs font-bold text-gray-600 mb-1.5">对手行动</div>
              <div className="grid grid-cols-2 gap-1.5 mb-2">
                {STREET_ACTIONS.map(a => (
                  <button key={a.key} onClick={() => setRiverAction(a.key)}
                    className={`py-2.5 rounded-lg border text-xs font-bold transition-all ${riverAction === a.key ? "bg-orange-700 text-white border-orange-700" : "bg-white border-gray-200 text-gray-700"}`}
                  >{a.emoji} {a.label}{(a as any).desc ? ` (${(a as any).desc})` : ""}</button>
                ))}
              </div>
              {riverHandEval && <div className="text-xs text-purple-700 bg-purple-50 rounded-lg px-2 py-1 mb-2">最终牌力：{riverHandEval.strength} · {riverHandEval.detail}</div>}
              {riverAdvice && <AdviceCard action={riverAdvice.action} reason={riverAdvice.reason} isBluff={riverAdvice.isBluff} />}
              {riverAdvice && (
                <div className="mt-2 border-t border-gray-100 pt-2">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-xs font-bold text-gray-700">我的实际行动</span>
                    <span className="text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">⭐ GTO推荐：{riverAdvice.action}</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1 mb-1">
                    {MY_ACTIONS.map(a => {
                      const isGto = extractGtoActionKey(riverAdvice.action) === a.key;
                      return (
                        <button key={a.key} onClick={() => setRiverMyAction(a.key)}
                          className={`py-2 rounded-lg border text-xs font-bold transition-all relative ${
                            riverMyAction === a.key ? "bg-orange-700 text-white border-orange-700" :
                            isGto ? "bg-amber-50 border-amber-400 text-amber-800" :
                            "bg-white border-gray-200 text-gray-700"
                          }`}
                        >
                          {isGto && riverMyAction !== a.key && <span className="absolute -top-1.5 -right-1 text-[9px] bg-amber-400 text-white px-0.5 rounded">GTO</span>}
                          {a.emoji} {a.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {riverAdvice && isAggressiveAction(riverAdvice.action) && (
                <div className="mt-2 border-t border-orange-100 pt-2">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-xs font-bold text-gray-600">对手回应</span>
                    <span className="text-xs text-gray-400">（我方下注后）</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5 mb-2">
                    {OPP_RESPONSES.map(r => (
                      <button key={r.key} onClick={() => setRiverOppResp(r.key)}
                        className={`py-2 rounded-lg border text-xs font-bold transition-all ${riverOppResp === r.key ? "bg-red-700 text-white border-red-700" : "bg-white border-gray-200 text-gray-700"}`}
                      >{r.emoji} {r.label}</button>
                    ))}
                  </div>
                  {riverAdvice2 && <AdviceCard action={riverAdvice2.action} reason={riverAdvice2.reason} isBluff={riverAdvice2.isBluff} />}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ─── 结果 ─── */}
      {(riverAdvice || (flopAdvice && !turnCard.rank) || (turnAdvice && !riverCard.rank)) && (
        <div className="border-t-2 border-gray-200 pt-3">
          <div className="text-xs font-bold text-gray-600 mb-2">🏆 结果</div>
          <div className="flex gap-2 mb-3">
            {(["win","lose","tie"] as const).map(key => (
              <button key={key} onClick={() => setResult(key)}
                className={`flex-1 py-3 rounded-xl text-sm font-black border-2 transition-all ${
                  result === key ?
                    (key === "win" ? "bg-red-600 text-white border-red-600" : key === "lose" ? "bg-gray-600 text-white border-gray-600" : "bg-yellow-600 text-white border-yellow-600") :
                    "bg-white text-gray-600 border-gray-200"
                }`}
              >{key === "win" ? "赢了" : key === "lose" ? "输了" : "平局"}</button>
            ))}
          </div>
          <button onClick={() => setIsBluffHand(!isBluffHand)}
            className={`w-full py-2.5 rounded-xl text-xs font-bold border-2 transition-all mb-3 ${isBluffHand ? "bg-purple-700 text-white border-purple-700" : "bg-white text-gray-600 border-gray-200"}`}
          >🎭 {isBluffHand ? "已标记为诈唬" : "标记为诈唬"}</button>
          <input value={opponentCards} onChange={e => setOpponentCards(e.target.value)}
            placeholder="对手亮牌（可选，如 AhKd）"
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm mb-3 focus:outline-none focus:border-green-500"
          />
          <button
            onClick={() => canSave && saveHand.mutate({ ledgerId, tableSize, position, holeCards: `${hand.rank1}${hand.suit1}${hand.rank2}${hand.suit2}`, preflopAction, flopCards: flopCards.map(c => `${c.rank}${c.suit}`).join(""), flopAction, turnCard: `${turnCard.rank}${turnCard.suit}`, turnAction, riverCard: `${riverCard.rank}${riverCard.suit}`, riverAction, result, opponentCards, isBluff: isBluffHand, preflopGtoAdvice: preflopAdvice?.action ?? "", preflopMyAction, flopGtoAdvice: flopAdvice?.action ?? "", flopMyAction, turnGtoAdvice: turnAdvice?.action ?? "", turnMyAction, riverGtoAdvice: riverAdvice?.action ?? "", riverMyAction })}
            disabled={!canSave || saveHand.isPending}
            className="w-full py-3 bg-green-800 text-white rounded-xl text-sm font-black disabled:opacity-40 flex items-center justify-center gap-2"
          >
            <Save className="w-4 h-4" />
            {saveHand.isPending ? "保存中..." : "保存牌局"}
          </button>
        </div>
      )}

      {!preflopAdvice && (
        <div className="text-center text-gray-400 text-sm py-4">完成以上4步选择，即可获得 GTO 策略建议</div>
      )}
    </div>
  );
}

// ─── GTO 笔记 ─────────────────────────────────────────────────────────────────
function GtoNotes({ ledgerId }: { ledgerId: number }) {
  const [content, setContent] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState("");
  const { data: notes = [], refetch } = trpc["gto.getNotes"].useQuery({ ledgerId });

  const addNote = trpc["gto.addNote"].useMutation({
    onSuccess: () => { setContent(""); refetch(); toast.success("笔记已保存"); },
    onError: () => toast.error("保存失败"),
  });

  const updateNote = trpc["gto.updateNote"].useMutation({
    onSuccess: () => { setEditId(null); refetch(); toast.success("已更新"); },
    onError: () => toast.error("更新失败"),
  });

  const deleteNote = trpc["gto.deleteNote"].useMutation({
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
  const [tab, setTab] = useState<"range" | "odds" | "notes" | "advisor">("range");

  const tabs = [
    { key: "range" as const, label: "起手牌", icon: "🃏" },
    { key: "odds" as const, label: "赔率", icon: "🧮" },
    { key: "advisor" as const, label: "参考", icon: "🎯" },
    { key: "notes" as const, label: "笔记", icon: "📝" },
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
        {tab === "advisor" && <GtoAdvisor ledgerId={ledgerId} />}
        {tab === "notes" && <GtoNotes ledgerId={ledgerId} />}
      </div>
    </div>
  );
}
