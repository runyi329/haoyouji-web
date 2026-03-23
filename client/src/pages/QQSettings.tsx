import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { ChevronLeft, ChevronRight, Plus, Trash2, Loader2, X, Check, Calculator } from "lucide-react";

// 差值概率表（固定数据，纯计算）
const DIFF_TABLE: { diff: number; combos: number; pct: number }[] = [
  { diff: 0, combos: 10, pct: 10 },
  { diff: 1, combos: 18, pct: 18 },
  { diff: 2, combos: 16, pct: 16 },
  { diff: 3, combos: 14, pct: 14 },
  { diff: 4, combos: 12, pct: 12 },
  { diff: 5, combos: 10, pct: 10 },
  { diff: 6, combos: 8,  pct: 8  },
  { diff: 7, combos: 6,  pct: 6  },
  { diff: 8, combos: 4,  pct: 4  },
  { diff: 9, combos: 2,  pct: 2  },
];

function calcSample(digits: number[]): { combos: number; pct: number } {
  const unique = [...new Set(digits.filter(d => d >= 0 && d <= 9))];
  const combos = unique.reduce((sum, d) => sum + DIFF_TABLE[d].combos, 0);
  return { combos, pct: combos };
}

// 设置页面 - 主入口
export default function QQSettings() {
  const [, setLocation] = useLocation();
  const { id } = useParams<{ id: string }>();
  const ledgerId = Number(id) || 52;
  const [subPage, setSubPage] = useState<"main" | "interest" | "rules">("main");

  if (subPage === "interest") {
    return <InterestSettlementPage ledgerId={ledgerId} onBack={() => setSubPage("main")} />;
  }
  if (subPage === "rules") {
    return <GameRulesPage onBack={() => setSubPage("main")} />;
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* 顶部导航 */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-900 border-b border-gray-800 sticky top-0 z-20">
        <button
          onClick={() => {
            if (window.history.length > 1) window.history.back();
            else setLocation(id ? `/ledger/${id}/qq/trade` : '/');
          }}
          className="flex items-center gap-1 text-gray-400 active:text-white"
        >
          <ChevronLeft size={20} />
          <span className="text-sm">返回</span>
        </button>
        <h1 className="text-base font-bold text-white">设置</h1>
        <div className="w-14" />
      </div>

      {/* 设置列表 */}
      <div className="px-4 pt-4">
        <div className="text-xs text-gray-500 mb-2 px-1">账本管理</div>
        <div className="rounded-xl overflow-hidden bg-gray-900 divide-y divide-gray-800">
          <button
            onClick={() => setSubPage("interest")}
            className="w-full flex items-center justify-between px-4 py-4 active:bg-gray-800"
          >
            <div className="flex flex-col items-start gap-0.5">
              <span className="text-sm text-white">已结利息设置</span>
              <span className="text-xs text-gray-500">管理已结算的利息记录</span>
            </div>
            <ChevronRight size={16} className="text-gray-600" />
          </button>
          <button
            onClick={() => setSubPage("rules")}
            className="w-full flex items-center justify-between px-4 py-4 active:bg-gray-800"
          >
            <div className="flex flex-col items-start gap-0.5">
              <span className="text-sm text-white">游戏规则与概率</span>
              <span className="text-xs text-gray-500">差值概率表 · 采样中奖率计算器</span>
            </div>
            <ChevronRight size={16} className="text-gray-600" />
          </button>
        </div>
      </div>

      <div className="h-10" />
    </div>
  );
}

// ─── 游戏规则与概率计算器 ───────────────────────────────────────────────────
function GameRulesPage({ onBack }: { onBack: () => void }) {
  // 采样列表：每项是一组数字
  const [samples, setSamples] = useState<{ id: number; digits: number[] }[]>([]);
  const [inputVal, setInputVal] = useState("");
  const nextId = useState(() => 1)[0];
  const idRef = { current: nextId };

  function addSample() {
    const raw = inputVal.trim();
    if (!raw) return;
    // 解析：支持 "0369" 或 "0,3,6,9" 或 "0 3 6 9"
    const digits = raw
      .split(/[,\s]+/)
      .map(s => parseInt(s.trim(), 10))
      .filter(n => !isNaN(n) && n >= 0 && n <= 9);
    if (digits.length === 0) return;
    setSamples(prev => [...prev, { id: Date.now(), digits }]);
    setInputVal("");
  }

  function removeSample(id: number) {
    setSamples(prev => prev.filter(s => s.id !== id));
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* 顶部导航 */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-900 border-b border-gray-800 sticky top-0 z-20">
        <button onClick={onBack} className="flex items-center gap-1 text-gray-400 active:text-white">
          <ChevronLeft size={20} />
          <span className="text-sm">返回</span>
        </button>
        <h1 className="text-base font-bold text-white">游戏规则与概率</h1>
        <div className="w-14" />
      </div>

      <div className="px-4 pt-4 pb-10 flex flex-col gap-4">

        {/* 规则说明 */}
        <div className="rounded-xl bg-gray-900 px-4 py-3 border border-gray-800">
          <div className="text-xs font-semibold text-blue-400 mb-2">游戏规则</div>
          <div className="text-xs text-gray-400 leading-5">
            每分钟开出的 QQ 号码中取两位数字，计算其<span className="text-white font-medium">绝对差值</span>（0~9）作为开奖结果。
            总组合数为 10×10 = 100 种，每种差值的出现概率见下表。
            竞猜时可同时选多个差值，中奖概率等于所选差值的组合数之和 ÷ 100。
          </div>
        </div>

        {/* 差值概率表 */}
        <div className="rounded-xl bg-gray-900 border border-gray-800 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-800">
            <span className="text-xs font-semibold text-blue-400">差值概率表</span>
          </div>
          {/* 表头 */}
          <div style={{ display: 'flex' }} className="px-4 py-1.5 bg-gray-800/60">
            <div style={{ flex: '1 1 0' }} className="text-[10px] text-gray-500">差值</div>
            <div style={{ flex: '1 1 0' }} className="text-[10px] text-gray-500 text-center">组合数</div>
            <div style={{ flex: '1 1 0' }} className="text-[10px] text-gray-500 text-right">中奖概率</div>
          </div>
          {DIFF_TABLE.map(row => (
            <div key={row.diff} style={{ display: 'flex' }} className="px-4 py-2 border-t border-gray-800/60">
              <div style={{ flex: '1 1 0' }}>
                <span className="text-sm font-bold font-mono text-white">{row.diff}</span>
              </div>
              <div style={{ flex: '1 1 0' }} className="text-center">
                <span className="text-sm font-mono text-gray-300">{row.combos} 种</span>
              </div>
              <div style={{ flex: '1 1 0' }} className="text-right">
                <span
                  className="text-sm font-bold font-mono"
                  style={{ color: row.pct >= 14 ? '#3DD68C' : row.pct >= 8 ? '#FACC15' : '#F87171' }}
                >
                  {row.pct}%
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* 采样计算器 */}
        <div className="rounded-xl bg-gray-900 border border-gray-800 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-800 flex items-center gap-2">
            <Calculator size={14} className="text-blue-400" />
            <span className="text-xs font-semibold text-blue-400">采样中奖率计算器</span>
          </div>

          {/* 输入区 */}
          <div className="px-4 py-3 border-b border-gray-800">
            <div className="text-xs text-gray-500 mb-2">输入选号（如：0369 或 0,3,6,9）</div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                value={inputVal}
                onChange={e => setInputVal(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addSample()}
                placeholder="例：0369"
                className="bg-gray-800 text-white text-sm px-3 py-2 rounded-lg border border-gray-700 focus:border-blue-500 outline-none"
                style={{ flex: '1 1 0', minWidth: 0 }}
              />
              <button
                onClick={addSample}
                className="flex items-center gap-1 px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium active:bg-blue-500"
              >
                <Plus size={15} />
                添加
              </button>
            </div>
          </div>

          {/* 采样结果列表 */}
          {samples.length === 0 ? (
            <div className="text-center py-6 text-gray-600 text-xs">暂无采样，请输入选号后点击添加</div>
          ) : (
            <div className="divide-y divide-gray-800/60">
              {/* 列表表头 */}
              <div style={{ display: 'flex' }} className="px-4 py-1.5 bg-gray-800/40">
                <div style={{ flex: '2 1 0' }} className="text-[10px] text-gray-500">选号</div>
                <div style={{ flex: '1 1 0' }} className="text-[10px] text-gray-500 text-center">组合数</div>
                <div style={{ flex: '1 1 0' }} className="text-[10px] text-gray-500 text-center">中奖率</div>
                <div style={{ width: '28px' }} />
              </div>
              {samples.map(s => {
                const { combos, pct } = calcSample(s.digits);
                const label = [...new Set(s.digits)].sort((a, b) => a - b).join(', ');
                return (
                  <div key={s.id} style={{ display: 'flex', alignItems: 'center' }} className="px-4 py-2.5">
                    <div style={{ flex: '2 1 0' }}>
                      <span className="text-sm font-mono text-white">{label}</span>
                    </div>
                    <div style={{ flex: '1 1 0' }} className="text-center">
                      <span className="text-sm font-mono text-gray-300">{combos} 种</span>
                    </div>
                    <div style={{ flex: '1 1 0' }} className="text-center">
                      <span
                        className="text-sm font-bold font-mono"
                        style={{ color: pct >= 30 ? '#3DD68C' : pct >= 15 ? '#FACC15' : '#F87171' }}
                      >
                        {pct}%
                      </span>
                    </div>
                    <button
                      onClick={() => removeSample(s.id)}
                      style={{ width: '28px' }}
                      className="text-gray-700 active:text-red-400 flex justify-end"
                    >
                      <X size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

// ─── 已结利息管理子页面 ────────────────────────────────────────────────────
function InterestSettlementPage({
  ledgerId,
  onBack,
}: {
  ledgerId: number;
  onBack: () => void;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [addDate, setAddDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [addAmount, setAddAmount] = useState("");
  const [addNote, setAddNote] = useState("");
  const [toast, setToast] = useState("");

  const { data, refetch, isLoading } = trpc.getInterestSettlements.useQuery(
    { ledgerId },
    { refetchOnWindowFocus: false }
  );
  const list = data?.list || [];
  const total = data?.total || 0;

  const addMutation = trpc.addInterestSettlement.useMutation({
    onSuccess: () => { showToast("添加成功"); setShowAdd(false); setAddAmount(""); setAddNote(""); refetch(); },
    onError: (err) => showToast("添加失败：" + err.message),
  });

  const deleteMutation = trpc.deleteInterestSettlement.useMutation({
    onSuccess: () => { showToast("已删除"); refetch(); },
    onError: (err) => showToast("删除失败：" + err.message),
  });

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  }

  function handleAdd() {
    const amount = parseFloat(addAmount);
    if (isNaN(amount) || amount <= 0) { showToast("请输入有效金额"); return; }
    addMutation.mutate({ ledgerId, settleDate: addDate, amount, note: addNote || undefined });
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="flex items-center justify-between px-4 py-3 bg-gray-900 border-b border-gray-800 sticky top-0 z-20">
        <button onClick={onBack} className="flex items-center gap-1 text-gray-400 active:text-white">
          <ChevronLeft size={20} />
          <span className="text-sm">返回</span>
        </button>
        <h1 className="text-base font-bold text-white">已结利息设置</h1>
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-1 text-blue-400 active:text-blue-300">
          <Plus size={18} />
          <span className="text-sm">添加</span>
        </button>
      </div>

      {toast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-gray-700 text-white text-sm px-4 py-2 rounded-full shadow-lg">
          {toast}
        </div>
      )}

      <div className="px-4 pt-4 pb-3">
        <div className="rounded-2xl px-5 py-4" style={{ background: 'linear-gradient(135deg, #1A56DB 0%, #3B82F6 100%)' }}>
          <div className="text-xs text-white/70 mb-1">累计已结利息</div>
          <div className="text-2xl font-bold text-white font-mono">¥{total.toFixed(2)}</div>
          <div className="text-xs text-white/60 mt-1">≈{(total / 7).toFixed(2)} U &nbsp;·&nbsp; 共 {list.length} 笔</div>
        </div>
      </div>

      {showAdd && (
        <div className="mx-4 mb-4 rounded-xl bg-gray-900 border border-gray-700 p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-white">新增已结利息</span>
            <button onClick={() => setShowAdd(false)}><X size={16} className="text-gray-500" /></button>
          </div>
          <div className="flex flex-col gap-3">
            <div>
              <div className="text-xs text-gray-500 mb-1">结算日期</div>
              <div className="w-full">
                <input
                  type="date"
                  value={addDate}
                  onChange={e => setAddDate(e.target.value)}
                  style={{ width: '100%', minWidth: '100%', display: 'block', boxSizing: 'border-box' }}
                  className="bg-gray-800 text-white text-sm px-3 py-2 rounded-lg border border-gray-700 focus:border-blue-500 outline-none appearance-none"
                />
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">结算金额（元）</div>
              <input type="number" value={addAmount} onChange={e => setAddAmount(e.target.value)} placeholder="如：5000.00"
                className="w-full bg-gray-800 text-white text-sm px-3 py-2 rounded-lg border border-gray-700 focus:border-blue-500 outline-none" />
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">备注（可选）</div>
              <input type="text" value={addNote} onChange={e => setAddNote(e.target.value)} placeholder="如：3月份利息结算"
                className="w-full bg-gray-800 text-white text-sm px-3 py-2 rounded-lg border border-gray-700 focus:border-blue-500 outline-none" />
            </div>
            <button onClick={handleAdd} disabled={addMutation.isPending}
              className="flex items-center justify-center gap-2 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium active:bg-blue-500 disabled:opacity-50">
              {addMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              确认添加
            </button>
          </div>
        </div>
      )}

      <div className="px-4">
        <div className="text-xs text-gray-500 mb-2 px-1">结算记录</div>
        {isLoading ? (
          <div className="text-center py-10 text-gray-500 text-sm">加载中...</div>
        ) : list.length === 0 ? (
          <div className="text-center py-10 text-gray-600 text-sm">暂无结算记录</div>
        ) : (
          <div className="flex flex-col gap-2">
            {list.map((item) => (
              <div key={item.id} className="rounded-xl bg-gray-900 px-4 py-3 flex items-center justify-between">
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white font-mono">¥{item.amount.toFixed(2)}</span>
                    <span className="text-xs text-white/50">≈{(item.amount / 7).toFixed(2)} U</span>
                  </div>
                  <div className="text-xs text-gray-500">
                    {item.settleDate}
                    {item.note ? <span className="ml-2 text-gray-600">{item.note}</span> : null}
                  </div>
                </div>
                <button
                  onClick={() => { if (confirm('确认删除这条结算记录？')) deleteMutation.mutate({ id: item.id }); }}
                  disabled={deleteMutation.isPending}
                  className="text-gray-700 active:text-red-400 disabled:opacity-40 ml-3"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="h-10" />
    </div>
  );
}
