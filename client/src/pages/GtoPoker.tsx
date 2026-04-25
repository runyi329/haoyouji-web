import { useParams, useLocation } from "wouter";
import { ArrowLeft, BookOpen, Calculator, StickyNote, ChevronDown } from "lucide-react";
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

// ─── 起手牌数据 ───────────────────────────────────────────────────────────────
const RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];

type ActionType = "raise" | "call" | "fold" | "3bet" | "limp";

interface HandRange {
  [hand: string]: ActionType[];
}

// 各位置 GTO 开牌范围（简化版，实际 GTO 频率）
const POSITION_RANGES: Record<string, HandRange> = {
  UTG: {
    // 强牌开牌
    AA: ["raise"], KK: ["raise"], QQ: ["raise"], JJ: ["raise"], TT: ["raise"],
    AKs: ["raise"], AQs: ["raise"], AJs: ["raise"], ATs: ["raise"],
    AKo: ["raise"], AQo: ["raise"],
    KQs: ["raise"], KJs: ["raise"], KTs: ["raise"],
    QJs: ["raise"], QTs: ["raise"],
    JTs: ["raise"],
    // 混合策略
    "99": ["raise"], "88": ["raise"],
    A9s: ["raise"], A8s: ["raise"],
    KQo: ["raise"],
    T9s: ["raise"], "98s": ["raise"],
  },
  HJ: {
    AA: ["raise"], KK: ["raise"], QQ: ["raise"], JJ: ["raise"], TT: ["raise"], "99": ["raise"], "88": ["raise"], "77": ["raise"],
    AKs: ["raise"], AQs: ["raise"], AJs: ["raise"], ATs: ["raise"], A9s: ["raise"], A8s: ["raise"], A7s: ["raise"], A6s: ["raise"], A5s: ["raise"],
    AKo: ["raise"], AQo: ["raise"], AJo: ["raise"], ATo: ["raise"],
    KQs: ["raise"], KJs: ["raise"], KTs: ["raise"], K9s: ["raise"],
    KQo: ["raise"], KJo: ["raise"],
    QJs: ["raise"], QTs: ["raise"], Q9s: ["raise"],
    QJo: ["raise"],
    JTs: ["raise"], J9s: ["raise"],
    T9s: ["raise"], T8s: ["raise"],
    "98s": ["raise"], "97s": ["raise"],
    "87s": ["raise"], "76s": ["raise"],
    "66": ["raise"], "55": ["raise"],
  },
  CO: {
    AA: ["raise"], KK: ["raise"], QQ: ["raise"], JJ: ["raise"], TT: ["raise"], "99": ["raise"], "88": ["raise"], "77": ["raise"],
    AKs: ["raise"], AQs: ["raise"], AJs: ["raise"], ATs: ["raise"], A9s: ["raise"], A8s: ["raise"], A7s: ["raise"], A6s: ["raise"], A5s: ["raise"],
    AKo: ["raise"], AQo: ["raise"], AJo: ["raise"], ATo: ["raise"],
    KQs: ["raise"], KJs: ["raise"], KTs: ["raise"], K9s: ["raise"],
    KQo: ["raise"], KJo: ["raise"],
    QJs: ["raise"], QTs: ["raise"], Q9s: ["raise"],
    QJo: ["raise"],
    JTs: ["raise"], J9s: ["raise"],
    T9s: ["raise"], T8s: ["raise"],
    "98s": ["raise"], "97s": ["raise"],
    "87s": ["raise"], "76s": ["raise"], "65s": ["raise"],
    "66": ["raise"], "55": ["raise"],
  },
  BTN: {
    AA: ["raise"], KK: ["raise"], QQ: ["raise"], JJ: ["raise"], TT: ["raise"], "99": ["raise"], "88": ["raise"], "77": ["raise"], "66": ["raise"], "55": ["raise"], "44": ["raise"], "33": ["raise"], "22": ["raise"],
    AKs: ["raise"], AQs: ["raise"], AJs: ["raise"], ATs: ["raise"], A9s: ["raise"], A8s: ["raise"], A7s: ["raise"], A6s: ["raise"], A5s: ["raise"], A4s: ["raise"], A3s: ["raise"], A2s: ["raise"],
    AKo: ["raise"], AQo: ["raise"], AJo: ["raise"], ATo: ["raise"], A9o: ["raise"], A8o: ["raise"],
    KQs: ["raise"], KJs: ["raise"], KTs: ["raise"], K9s: ["raise"], K8s: ["raise"], K7s: ["raise"], K6s: ["raise"], K5s: ["raise"],
    KQo: ["raise"], KJo: ["raise"], KTo: ["raise"],
    QJs: ["raise"], QTs: ["raise"], Q9s: ["raise"], Q8s: ["raise"],
    QJo: ["raise"], QTo: ["raise"],
    JTs: ["raise"], J9s: ["raise"], J8s: ["raise"],
    JTo: ["raise"],
    T9s: ["raise"], T8s: ["raise"], T7s: ["raise"],
    "98s": ["raise"], "97s": ["raise"], "96s": ["raise"],
    "87s": ["raise"], "86s": ["raise"], "85s": ["raise"],
    "76s": ["raise"], "75s": ["raise"],
    "65s": ["raise"], "64s": ["raise"],
    "54s": ["raise"], "53s": ["raise"],
    "43s": ["raise"],
  },
  SB: {
    AA: ["raise"], KK: ["raise"], QQ: ["raise"], JJ: ["raise"], TT: ["raise"], "99": ["raise"], "88": ["raise"], "77": ["raise"], "66": ["raise"], "55": ["raise"], "44": ["raise"], "33": ["raise"], "22": ["raise"],
    AKs: ["raise"], AQs: ["raise"], AJs: ["raise"], ATs: ["raise"], A9s: ["raise"], A8s: ["raise"], A7s: ["raise"], A6s: ["raise"], A5s: ["raise"], A4s: ["raise"], A3s: ["raise"], A2s: ["raise"],
    AKo: ["raise"], AQo: ["raise"], AJo: ["raise"], ATo: ["raise"], A9o: ["raise"], A8o: ["raise"], A7o: ["raise"],
    KQs: ["raise"], KJs: ["raise"], KTs: ["raise"], K9s: ["raise"], K8s: ["raise"], K7s: ["raise"],
    KQo: ["raise"], KJo: ["raise"], KTo: ["raise"], K9o: ["raise"],
    QJs: ["raise"], QTs: ["raise"], Q9s: ["raise"], Q8s: ["raise"],
    QJo: ["raise"], QTo: ["raise"],
    JTs: ["raise"], J9s: ["raise"], J8s: ["raise"],
    T9s: ["raise"], T8s: ["raise"],
    "98s": ["raise"], "97s": ["raise"],
    "87s": ["raise"], "86s": ["raise"],
    "76s": ["raise"], "75s": ["raise"],
    "65s": ["raise"], "54s": ["raise"],
  },
  BB: {
    // BB 面对开牌的跟注范围（宽范围）
    AA: ["3bet"], KK: ["3bet"], QQ: ["3bet"], JJ: ["3bet"], TT: ["3bet"],
    AKs: ["3bet"], AQs: ["3bet"], AJs: ["3bet"], ATs: ["3bet"],
    AKo: ["3bet"], AQo: ["3bet"],
    "99": ["call"], "88": ["call"], "77": ["call"], "66": ["call"], "55": ["call"], "44": ["call"], "33": ["call"], "22": ["call"],
    A9s: ["call"], A8s: ["call"], A7s: ["call"], A6s: ["call"], A5s: ["3bet"], A4s: ["call"], A3s: ["call"], A2s: ["call"],
    AJo: ["call"], ATo: ["call"], A9o: ["call"], A8o: ["call"],
    KQs: ["call"], KJs: ["call"], KTs: ["call"], K9s: ["call"], K8s: ["call"], K7s: ["call"],
    KQo: ["call"], KJo: ["call"], KTo: ["call"],
    QJs: ["call"], QTs: ["call"], Q9s: ["call"], Q8s: ["call"],
    QJo: ["call"], QTo: ["call"],
    JTs: ["call"], J9s: ["call"], J8s: ["call"], J7s: ["call"],
    T9s: ["call"], T8s: ["call"], T7s: ["call"],
    "98s": ["call"], "97s": ["call"], "96s": ["call"],
    "87s": ["call"], "86s": ["call"], "85s": ["call"],
    "76s": ["call"], "75s": ["call"], "74s": ["call"],
    "65s": ["call"], "64s": ["call"],
    "54s": ["call"], "53s": ["call"],
    "43s": ["call"],
  },
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

function getHandKey(r1: string, r2: string, suited: boolean): string {
  const i1 = RANKS.indexOf(r1);
  const i2 = RANKS.indexOf(r2);
  if (i1 === i2) return r1 + r2; // 对子
  if (i1 < i2) return suited ? r1 + r2 + "s" : r1 + r2 + "o";
  return suited ? r2 + r1 + "s" : r2 + r1 + "o";
}

// ─── 起手牌矩阵组件 ────────────────────────────────────────────────────────────
function HandRangeMatrix() {
  const [position, setPosition] = useState("BTN");
  const [selectedHand, setSelectedHand] = useState<string | null>(null);

  const range = POSITION_RANGES[position] || {};

  const getAction = (r1: string, r2: string): ActionType => {
    const i1 = RANKS.indexOf(r1);
    const i2 = RANKS.indexOf(r2);
    if (i1 === i2) {
      return (range[r1 + r2]?.[0]) || "fold";
    }
    const suited = i1 < i2;
    const key = suited ? `${r1}${r2}s` : `${r2}${r1}s`;
    const keyO = suited ? `${r1}${r2}o` : `${r2}${r1}o`;
    // 上三角=同花，下三角=异色
    if (i1 < i2) {
      return (range[key]?.[0]) || "fold"; // 同花
    } else {
      return (range[keyO]?.[0]) || "fold"; // 异色
    }
  };

  const positions = ["UTG", "HJ", "CO", "BTN", "SB", "BB"];

  // 统计各动作数量
  const stats = useMemo(() => {
    const counts: Record<ActionType, number> = { raise: 0, "3bet": 0, call: 0, limp: 0, fold: 0 };
    RANKS.forEach((r1, i) => {
      RANKS.forEach((r2, j) => {
        const action = getAction(r1, r2);
        counts[action]++;
      });
    });
    const total = 13 * 13;
    return Object.entries(counts).map(([k, v]) => ({
      action: k as ActionType,
      count: v,
      pct: ((v / total) * 100).toFixed(0),
    })).filter(s => s.count > 0);
  }, [position]);

  return (
    <div className="pb-4">
      {/* 位置选择 */}
      <div className="flex gap-2 px-3 py-3 overflow-x-auto">
        {positions.map(p => (
          <button
            key={p}
            onClick={() => setPosition(p)}
            className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-bold border transition-all ${
              position === p
                ? "bg-green-700 text-white border-green-700 shadow"
                : "bg-white text-gray-600 border-gray-300"
            }`}
          >
            {p}
          </button>
        ))}
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
          {/* 列标题 */}
          <div className="grid grid-cols-14 mb-0.5" style={{ gridTemplateColumns: "20px repeat(13, 1fr)" }}>
            <div />
            {RANKS.map(r => (
              <div key={r} className="text-center text-[9px] font-bold text-gray-500">{r}</div>
            ))}
          </div>
          {/* 行 */}
          {RANKS.map((r1, i) => (
            <div key={r1} className="grid mb-0.5" style={{ gridTemplateColumns: "20px repeat(13, 1fr)" }}>
              <div className="flex items-center justify-center text-[9px] font-bold text-gray-500">{r1}</div>
              {RANKS.map((r2, j) => {
                const isPair = i === j;
                const isSuited = i < j; // 上三角=同花
                const handKey = isPair
                  ? r1 + r2
                  : isSuited
                  ? `${r1}${r2}s`
                  : `${r2}${r1}o`;
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
            {POSITION_RANGES[position]?.[selectedHand]
              ? `${position} 位置：${POSITION_RANGES[position][selectedHand].map(a => ACTION_LABELS[a]).join(" / ")}`
              : `${position} 位置：弃牌（不在开牌范围）`}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 底池赔率计算器 ────────────────────────────────────────────────────────────
function OddsCalculator() {
  const [pot, setPot] = useState("");
  const [bet, setBet] = useState("");
  const [outs, setOuts] = useState("");
  const [street, setStreet] = useState<"flop" | "turn">("flop");

  const potNum = parseFloat(pot) || 0;
  const betNum = parseFloat(bet) || 0;
  const outsNum = parseInt(outs) || 0;

  // 底池赔率
  const potOdds = potNum + betNum > 0 ? betNum / (potNum + betNum) : 0;
  // 胜率（Rule of 2 and 4）
  const equity = street === "flop" ? outsNum * 4 : outsNum * 2;
  const hasValue = potNum > 0 && betNum > 0;
  const isCallable = equity > potOdds * 100;

  // 常见 outs 参考
  const outsRef = [
    { name: "后门同花顺", outs: 15, desc: "同花 + 顺子 outs" },
    { name: "同花听牌", outs: 9, desc: "9张同花牌" },
    { name: "两头顺子", outs: 8, desc: "两端各4张" },
    { name: "两对变葫芦", outs: 4, desc: "4张配对牌" },
    { name: "内顺子", outs: 4, desc: "中间缺一张" },
    { name: "一对变三条", outs: 2, desc: "2张配对牌" },
  ];

  return (
    <div className="px-4 py-4 space-y-5">
      {/* 输入区 */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-4">
        <h3 className="font-bold text-gray-800 text-base">底池赔率计算</h3>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">底池大小</label>
            <input
              type="number"
              value={pot}
              onChange={e => setPot(e.target.value)}
              placeholder="例：100"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-500"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">对手下注额</label>
            <input
              type="number"
              value={bet}
              onChange={e => setBet(e.target.value)}
              placeholder="例：50"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">我的 Outs 数</label>
            <input
              type="number"
              value={outs}
              onChange={e => setOuts(e.target.value)}
              placeholder="例：9"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-500"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">当前街道</label>
            <div className="flex gap-2">
              {(["flop", "turn"] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setStreet(s)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-all ${
                    street === s ? "bg-green-700 text-white border-green-700" : "bg-white text-gray-600 border-gray-200"
                  }`}
                >
                  {s === "flop" ? "翻牌" : "转牌"}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 结果区 */}
      {hasValue && (
        <div className={`rounded-2xl p-4 ${isCallable && outsNum > 0 ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}>
          <div className="grid grid-cols-2 gap-4 mb-3">
            <div className="text-center">
              <div className="text-xs text-gray-500 mb-1">底池赔率（需要胜率）</div>
              <div className="text-2xl font-bold text-gray-800">{(potOdds * 100).toFixed(1)}%</div>
            </div>
            {outsNum > 0 && (
              <div className="text-center">
                <div className="text-xs text-gray-500 mb-1">我的胜率（{outsNum} outs）</div>
                <div className={`text-2xl font-bold ${isCallable ? "text-green-700" : "text-red-600"}`}>{equity}%</div>
              </div>
            )}
          </div>
          {outsNum > 0 && (
            <div className={`text-center font-bold text-base py-2 rounded-xl ${isCallable ? "bg-green-700 text-white" : "bg-red-600 text-white"}`}>
              {isCallable ? "✓ 跟注合算（正期望）" : "✗ 弃牌（负期望）"}
            </div>
          )}
          <div className="mt-2 text-xs text-gray-500 text-center">
            Rule of {street === "flop" ? "4" : "2"}：outs × {street === "flop" ? "4" : "2"} ≈ 胜率%
          </div>
        </div>
      )}

      {/* Outs 参考表 */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
        <h3 className="font-bold text-gray-800 text-sm mb-3">常见 Outs 参考</h3>
        <div className="space-y-2">
          {outsRef.map(ref => (
            <button
              key={ref.name}
              onClick={() => setOuts(String(ref.outs))}
              className="w-full flex items-center justify-between py-2 px-3 rounded-lg bg-gray-50 hover:bg-green-50 transition-colors active:bg-green-100"
            >
              <div className="text-left">
                <div className="text-sm font-medium text-gray-800">{ref.name}</div>
                <div className="text-xs text-gray-400">{ref.desc}</div>
              </div>
              <div className="text-lg font-bold text-green-700 ml-3">{ref.outs}</div>
            </button>
          ))}
        </div>
      </div>

      {/* 常用赔率速查 */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
        <h3 className="font-bold text-gray-800 text-sm mb-3">常用赔率速查</h3>
        <div className="grid grid-cols-3 gap-2 text-xs">
          {[
            { bet: "1/3 底池", odds: "25%" },
            { bet: "1/2 底池", odds: "33%" },
            { bet: "2/3 底池", odds: "40%" },
            { bet: "3/4 底池", odds: "43%" },
            { bet: "满池", odds: "50%" },
            { bet: "超池", odds: ">50%" },
          ].map(item => (
            <div key={item.bet} className="bg-gray-50 rounded-lg p-2 text-center">
              <div className="text-gray-500">{item.bet}</div>
              <div className="font-bold text-green-700">{item.odds}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── GTO 笔记组件 ─────────────────────────────────────────────────────────────
function GtoNotes({ ledgerId }: { ledgerId: number }) {
  const [newNote, setNewNote] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState("");

  const { data: notes = [], refetch } = (trpc as any).gto.getNotes.useQuery({ ledgerId });
  const addMutation = (trpc as any).gto.addNote.useMutation({ onSuccess: () => { setNewNote(""); refetch(); } });
  const updateMutation = (trpc as any).gto.updateNote.useMutation({ onSuccess: () => { setEditId(null); refetch(); } });
  const deleteMutation = (trpc as any).gto.deleteNote.useMutation({ onSuccess: () => refetch() });

  const handleAdd = () => {
    if (!newNote.trim()) return;
    addMutation.mutate({ ledgerId, content: newNote.trim() });
  };

  const handleUpdate = () => {
    if (!editContent.trim() || editId === null) return;
    updateMutation.mutate({ id: editId, content: editContent.trim() });
  };

  return (
    <div className="px-4 py-4 space-y-4">
      {/* 新增笔记 */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
        <h3 className="font-bold text-gray-800 text-sm mb-3">新增 GTO 笔记</h3>
        <textarea
          value={newNote}
          onChange={e => setNewNote(e.target.value)}
          placeholder="记录你的 GTO 学习心得、策略要点、复盘总结..."
          rows={4}
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-green-500 resize-none"
        />
        <button
          onClick={handleAdd}
          disabled={!newNote.trim() || addMutation.isPending}
          className="mt-2 w-full py-2 bg-green-700 text-white rounded-xl text-sm font-medium disabled:opacity-50 active:bg-green-800"
        >
          {addMutation.isPending ? "保存中..." : "保存笔记"}
        </button>
      </div>

      {/* 笔记列表 */}
      {notes.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <BookOpen className="w-10 h-10 mx-auto mb-2 opacity-40" />
          <div className="text-sm">还没有笔记，开始记录你的 GTO 心得吧</div>
        </div>
      ) : (
        <div className="space-y-3">
          {notes.map((note: any) => (
            <div key={note.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
              {editId === note.id ? (
                <>
                  <textarea
                    value={editContent}
                    onChange={e => setEditContent(e.target.value)}
                    rows={4}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-green-500 resize-none"
                  />
                  <div className="flex gap-2 mt-2">
                    <button onClick={handleUpdate} className="flex-1 py-1.5 bg-green-700 text-white rounded-lg text-xs font-medium">保存</button>
                    <button onClick={() => setEditId(null)} className="flex-1 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-xs">取消</button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{note.content}</p>
                  <div className="flex items-center justify-between mt-3">
                    <span className="text-xs text-gray-400">
                      {new Date(note.createdAt).toLocaleDateString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <div className="flex gap-3">
                      <button
                        onClick={() => { setEditId(note.id); setEditContent(note.content); }}
                        className="text-xs text-green-600 font-medium"
                      >编辑</button>
                      <button
                        onClick={() => { if (confirm("确认删除？")) deleteMutation.mutate({ id: note.id }); }}
                        className="text-xs text-red-500 font-medium"
                      >删除</button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
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
      {/* 顶部导航 */}
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

        {/* Tab 栏 */}
        <div className="flex border-t border-green-600">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 py-2.5 text-xs font-medium transition-all ${
                tab === t.key
                  ? "bg-white/20 border-b-2 border-white"
                  : "opacity-70"
              }`}
            >
              <span className="mr-1">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* 内容区 */}
      <div className="pb-8">
        {tab === "range" && <HandRangeMatrix />}
        {tab === "odds" && <OddsCalculator />}
        {tab === "notes" && <GtoNotes ledgerId={ledgerId} />}
      </div>
    </div>
  );
}
