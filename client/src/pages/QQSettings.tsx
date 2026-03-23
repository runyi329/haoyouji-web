import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { ChevronLeft, ChevronRight, Plus, Trash2, Loader2, X, Check } from "lucide-react";

// 设置页面 - 主入口
export default function QQSettings() {
  const [, setLocation] = useLocation();
  const { id } = useParams<{ id: string }>();
  const ledgerId = Number(id) || 52;
  const [subPage, setSubPage] = useState<"main" | "interest">("main");

  if (subPage === "interest") {
    return (
      <InterestSettlementPage
        ledgerId={ledgerId}
        onBack={() => setSubPage("main")}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* 顶部导航 */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-900 border-b border-gray-800 sticky top-0 z-20">
        <button
          onClick={() => {
            if (window.history.length > 1) {
              window.history.back();
            } else {
              setLocation(id ? `/ledger/${id}/qq/trade` : '/');
            }
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
        </div>
      </div>

      <div className="h-10" />
    </div>
  );
}

// 已结利息管理子页面
function InterestSettlementPage({
  ledgerId,
  onBack,
}: {
  ledgerId: number;
  onBack: () => void;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [addDate, setAddDate] = useState(() => {
    const now = new Date();
    return now.toISOString().slice(0, 10);
  });
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
    onSuccess: () => {
      showToast("添加成功");
      setShowAdd(false);
      setAddAmount("");
      setAddNote("");
      refetch();
    },
    onError: (err) => {
      showToast("添加失败：" + err.message);
    },
  });

  const deleteMutation = trpc.deleteInterestSettlement.useMutation({
    onSuccess: () => {
      showToast("已删除");
      refetch();
    },
    onError: (err) => {
      showToast("删除失败：" + err.message);
    },
  });

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  }

  function handleAdd() {
    const amount = parseFloat(addAmount);
    if (isNaN(amount) || amount <= 0) {
      showToast("请输入有效金额");
      return;
    }
    addMutation.mutate({
      ledgerId,
      settleDate: addDate,
      amount,
      note: addNote || undefined,
    });
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* 顶部导航 */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-900 border-b border-gray-800 sticky top-0 z-20">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-gray-400 active:text-white"
        >
          <ChevronLeft size={20} />
          <span className="text-sm">返回</span>
        </button>
        <h1 className="text-base font-bold text-white">已结利息设置</h1>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1 text-blue-400 active:text-blue-300"
        >
          <Plus size={18} />
          <span className="text-sm">添加</span>
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-gray-700 text-white text-sm px-4 py-2 rounded-full shadow-lg">
          {toast}
        </div>
      )}

      {/* 累计已结金额 */}
      <div className="px-4 pt-4 pb-3">
        <div className="rounded-2xl px-5 py-4" style={{ background: 'linear-gradient(135deg, #1A56DB 0%, #3B82F6 100%)' }}>
          <div className="text-xs text-white/70 mb-1">累计已结利息</div>
          <div className="text-2xl font-bold text-white font-mono">
            ¥{total.toFixed(2)}
          </div>
          <div className="text-xs text-white/60 mt-1">
            ≈{(total / 7).toFixed(2)} U &nbsp;·&nbsp; 共 {list.length} 笔
          </div>
        </div>
      </div>

      {/* 添加表单 */}
      {showAdd && (
        <div className="mx-4 mb-4 rounded-xl bg-gray-900 border border-gray-700 p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-white">新增已结利息</span>
            <button onClick={() => setShowAdd(false)}>
              <X size={16} className="text-gray-500" />
            </button>
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
              <input
                type="number"
                value={addAmount}
                onChange={e => setAddAmount(e.target.value)}
                placeholder="如：5000.00"
                className="w-full bg-gray-800 text-white text-sm px-3 py-2 rounded-lg border border-gray-700 focus:border-blue-500 outline-none"
              />
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">备注（可选）</div>
              <input
                type="text"
                value={addNote}
                onChange={e => setAddNote(e.target.value)}
                placeholder="如：3月份利息结算"
                className="w-full bg-gray-800 text-white text-sm px-3 py-2 rounded-lg border border-gray-700 focus:border-blue-500 outline-none"
              />
            </div>
            <button
              onClick={handleAdd}
              disabled={addMutation.isPending}
              className="flex items-center justify-center gap-2 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium active:bg-blue-500 disabled:opacity-50"
            >
              {addMutation.isPending ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Check size={16} />
              )}
              确认添加
            </button>
          </div>
        </div>
      )}

      {/* 记录列表 */}
      <div className="px-4">
        <div className="text-xs text-gray-500 mb-2 px-1">结算记录</div>
        {isLoading ? (
          <div className="text-center py-10 text-gray-500 text-sm">加载中...</div>
        ) : list.length === 0 ? (
          <div className="text-center py-10 text-gray-600 text-sm">暂无结算记录</div>
        ) : (
          <div className="flex flex-col gap-2">
            {list.map((item) => (
              <div
                key={item.id}
                className="rounded-xl bg-gray-900 px-4 py-3 flex items-center justify-between"
              >
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white font-mono">
                      ¥{item.amount.toFixed(2)}
                    </span>
                    <span className="text-xs text-white/50">
                      ≈{(item.amount / 7).toFixed(2)} U
                    </span>
                  </div>
                  <div className="text-xs text-gray-500">
                    {item.settleDate}
                    {item.note ? <span className="ml-2 text-gray-600">{item.note}</span> : null}
                  </div>
                </div>
                <button
                  onClick={() => {
                    if (confirm('确认删除这条结算记录？')) {
                      deleteMutation.mutate({ id: item.id });
                    }
                  }}
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
