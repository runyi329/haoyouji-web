import { useState } from "react";
import { useLocation } from "wouter";
import { ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { mtrpc } from "../miban/mibanTrpc";

export default function WalletAdjustPage() {
  const [, setLocation] = useLocation();

  // 用户搜索
  const { data: allUsers = [] } = mtrpc.mibanAdminUser.list.useQuery();
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<any>(null);

  // 调账表单
  const [currency, setCurrency] = useState<"USDT" | "CNY">("USDT");
  const [direction, setDirection] = useState<"add" | "sub">("add");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  // 历史记录
  const { data: history = [], refetch: refetchHistory } = mtrpc.mibanAdminUser.walletHistory.useQuery(
    { userId: selectedUser?.id ?? 0 },
    { enabled: !!selectedUser }
  );

  const adjustMut = mtrpc.mibanAdminUser.walletAdjust.useMutation({
    onSuccess: () => {
      toast.success("调账成功");
      setAmount("");
      setNote("");
      refetchHistory();
    },
    onError: (e: any) => toast.error(e.message || "调账失败"),
  });

  const filteredUsers = (allUsers as any[]).filter((u: any) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      String(u.name ?? "").toLowerCase().includes(q) ||
      String(u.username ?? "").toLowerCase().includes(q) ||
      String(u.id).includes(q)
    );
  });

  function handleSubmit() {
    if (!selectedUser) { toast.error("请先选择用户"); return; }
    const num = parseFloat(amount);
    if (isNaN(num) || num <= 0) { toast.error("请输入大于0的金额"); return; }
    if (!note.trim()) { toast.error("备注不能为空"); return; }
    const finalAmount = direction === "sub" ? -num : num;
    adjustMut.mutate({ userId: selectedUser.id, currency, amount: finalAmount, note: note.trim() });
  }

  return (
    <div className="min-h-screen bg-[#F8F6F3] pb-24">
      {/* 顶部导航 */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="flex items-center h-14 px-4 gap-3">
          <button onClick={() => setLocation(-1 as any)} className="p-1 -ml-1">
            <ChevronLeft className="w-6 h-6 text-gray-700" />
          </button>
          <div>
            <h1 className="text-[16px] font-bold text-black">智能钱包手动调账</h1>
            <p className="text-[11px] text-gray-400">统一 USDT / CNY 充值与扣款</p>
          </div>
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* 第一步：选用户 */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <p className="text-[13px] font-bold text-black mb-3">① 选择用户</p>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索姓名 / 账号 / ID"
            className="w-full text-[13px] px-3 py-2 rounded-xl border border-gray-200 bg-gray-50 focus:outline-none focus:border-orange-400 mb-3"
          />
          {/* 已选用户展示 */}
          {selectedUser && (
            <div className="flex items-center justify-between bg-orange-50 border border-orange-200 rounded-xl px-3 py-2 mb-2">
              <div>
                <p className="text-[13px] font-semibold text-black">{selectedUser.name || selectedUser.username}</p>
                <p className="text-[10px] text-gray-400">ID: {selectedUser.id} · USDT: {Number(selectedUser.usdtBalance ?? 0).toFixed(2)} · CNY: ¥{Number(selectedUser.cnyBalance ?? 0).toFixed(2)}</p>
              </div>
              <button onClick={() => setSelectedUser(null)} className="text-[11px] text-orange-500 font-medium">更换</button>
            </div>
          )}
          {/* 用户列表（未选时显示） */}
          {!selectedUser && (
            <div className="max-h-48 overflow-y-auto space-y-1">
              {filteredUsers.slice(0, 30).map((u: any) => (
                <button
                  key={u.id}
                  onClick={() => { setSelectedUser(u); setSearch(""); }}
                  className="w-full text-left flex items-center justify-between px-3 py-2 rounded-xl hover:bg-gray-50 active:bg-gray-100 border border-transparent hover:border-gray-100"
                >
                  <div>
                    <p className="text-[13px] font-medium text-black">{u.name || u.username}</p>
                    <p className="text-[10px] text-gray-400">ID: {u.id} · @{u.username}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] text-gray-500">USDT {Number(u.usdtBalance ?? 0).toFixed(2)}</p>
                    <p className="text-[10px] text-gray-400">CNY ¥{Number(u.cnyBalance ?? 0).toFixed(2)}</p>
                  </div>
                </button>
              ))}
              {filteredUsers.length === 0 && (
                <p className="text-center text-[12px] text-gray-300 py-4">未找到用户</p>
              )}
            </div>
          )}
        </div>

        {/* 第二步：调账表单 */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <p className="text-[13px] font-bold text-black mb-3">② 填写调账信息</p>

          {/* 币种选择 */}
          <div className="flex gap-2 mb-3">
            {(["USDT", "CNY"] as const).map((c) => (
              <button
                key={c}
                onClick={() => setCurrency(c)}
                className="flex-1 py-2 rounded-xl text-[13px] font-semibold border-2 transition-all"
                style={{
                  borderColor: currency === c ? "#FF6900" : "#e5e7eb",
                  color: currency === c ? "#FF6900" : "#6b7280",
                  background: currency === c ? "#fff7f0" : "#f9fafb",
                }}
              >
                {c}
              </button>
            ))}
          </div>

          {/* 方向选择 */}
          <div className="flex gap-2 mb-3">
            {([["add", "充值 (+)"], ["sub", "扣款 (-)"]] as const).map(([d, label]) => (
              <button
                key={d}
                onClick={() => setDirection(d)}
                className="flex-1 py-2 rounded-xl text-[13px] font-semibold border-2 transition-all"
                style={{
                  borderColor: direction === d ? (d === "add" ? "#16a34a" : "#dc2626") : "#e5e7eb",
                  color: direction === d ? (d === "add" ? "#16a34a" : "#dc2626") : "#6b7280",
                  background: direction === d ? (d === "add" ? "#f0fdf4" : "#fef2f2") : "#f9fafb",
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* 金额 */}
          <div className="mb-3">
            <label className="text-[11px] text-gray-400 mb-1 block">金额（{currency}）</label>
            <input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={`输入${currency}金额`}
              className="w-full text-[14px] px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 focus:outline-none focus:border-orange-400"
            />
          </div>

          {/* 备注 */}
          <div className="mb-4">
            <label className="text-[11px] text-gray-400 mb-1 block">备注（必填）</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="如：充值确认、手动退款等"
              className="w-full text-[13px] px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 focus:outline-none focus:border-orange-400"
            />
          </div>

          <button
            onClick={handleSubmit}
            disabled={adjustMut.isPending || !selectedUser}
            className="w-full py-3 rounded-2xl text-[14px] font-bold text-white disabled:opacity-40"
            style={{ background: "#FF6900" }}
          >
            {adjustMut.isPending ? "处理中..." : `确认${direction === "add" ? "充值" : "扣款"} ${currency}`}
          </button>
        </div>

        {/* 第三步：调账历史 */}
        {selectedUser && (
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <p className="text-[13px] font-bold text-black mb-3">③ 调账历史（最近50条）</p>
            {(history as any[]).length === 0 ? (
              <p className="text-center text-[12px] text-gray-300 py-6">暂无调账记录</p>
            ) : (
              <div className="space-y-2">
                {(history as any[]).map((r: any) => (
                  <div key={r.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] text-gray-600 truncate">{r.note.replace(/\[.*?\]/g, "").trim()}</p>
                      <p className="text-[10px] text-gray-400">{new Date(r.createdAt).toLocaleString("zh-CN")} · {r.currency}</p>
                    </div>
                    <p className={`text-[14px] font-bold ml-3 flex-shrink-0 ${r.amount >= 0 ? "text-green-600" : "text-red-500"}`}>
                      {r.amount >= 0 ? "+" : ""}{r.currency === "CNY" ? "¥" : ""}{r.amount.toFixed(r.currency === "CNY" ? 2 : 4)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
