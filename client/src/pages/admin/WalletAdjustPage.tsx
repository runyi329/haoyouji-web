import { useState, useRef, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { ChevronLeft, Search, X, ChevronLeft as PrevIcon, ChevronRight as NextIcon } from "lucide-react";
import { toast } from "sonner";
import { mtrpc } from "../miban/mibanTrpc";

export default function WalletAdjustPage() {
  const [, setLocation] = useLocation();
  const searchStr = useSearch();
  const fromParam = new URLSearchParams(searchStr).get("from");
  const backPath = fromParam === "miban"
    ? "/p/proj_hzxm2t/admin"
    : fromParam
    ? `/ledger/${fromParam}/af-recharge-manage`
    : null;

  const utils = mtrpc.useUtils();

  // 用户搜索
  const { data: allUsers = [] } = mtrpc.adminUser.list.useQuery();
  const [search, setSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [dropdownMaxHeight, setDropdownMaxHeight] = useState(280);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchPanelRef = useRef<HTMLDivElement>(null);

  // Bug修复：当 allUsers 重新加载后，同步更新 selectedUser 的余额显示
  // 否则调账成功后，页面上显示的余额不会更新（selectedUser 是静态快照）
  useEffect(() => {
    if (!selectedUser || !(allUsers as any[]).length) return;
    const updated = (allUsers as any[]).find((u: any) => u.id === selectedUser.id);
    if (updated) {
      setSelectedUser(updated);
    }
  }, [allUsers]);

  // 移动端软键盘会缩小可视视口：结果区始终限制在键盘上方，并保留足够高度滚动选择最后一项。
  useEffect(() => {
    if (!showDropdown || !search.trim()) return;
    const visualViewport = window.visualViewport;
    const updateDropdownHeight = () => {
      const inputRect = inputRef.current?.getBoundingClientRect();
      if (!inputRect) return;
      const viewportHeight = visualViewport?.height ?? window.innerHeight;
      const availableHeight = Math.floor(viewportHeight - inputRect.bottom - 12);
      setDropdownMaxHeight(Math.max(150, Math.min(320, availableHeight)));
    };
    updateDropdownHeight();
    window.addEventListener("resize", updateDropdownHeight);
    visualViewport?.addEventListener("resize", updateDropdownHeight);
    visualViewport?.addEventListener("scroll", updateDropdownHeight);
    return () => {
      window.removeEventListener("resize", updateDropdownHeight);
      visualViewport?.removeEventListener("resize", updateDropdownHeight);
      visualViewport?.removeEventListener("scroll", updateDropdownHeight);
    };
  }, [showDropdown, search]);

  // 关闭软键盘会触发输入框失焦；结果只在点击到搜索区域外时才收起，避免无法选择底部用户。
  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!searchPanelRef.current?.contains(event.target as Node)) setShowDropdown(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  // 调账表单
  const [currency, setCurrency] = useState<"USDT" | "CNY">("USDT");
  const [direction, setDirection] = useState<"add" | "sub">("add");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  // 单用户历史
  const { data: history = [], refetch: refetchHistory } = mtrpc.adminUser.walletHistory.useQuery(
    { userId: selectedUser?.id ?? 0 },
    { enabled: !!selectedUser }
  );

  // 全局调账日志（分页）
  const [logPage, setLogPage] = useState(1);
  const PAGE_SIZE = 10;
  const { data: globalLog, refetch: refetchGlobal } = mtrpc.adminUser.walletGlobalHistory.useQuery(
    { page: logPage, pageSize: PAGE_SIZE }
  );
  const logItems = globalLog?.items ?? [];
  const logTotal = globalLog?.total ?? 0;
  const logTotalPages = Math.max(1, Math.ceil(logTotal / PAGE_SIZE));

  const adjustMut = mtrpc.adminUser.walletAdjust.useMutation({
    onSuccess: () => {
      toast.success("调账成功");
      setAmount("");
      setNote("");
      // Bug修复：刷新用户列表，触发 useEffect 同步 selectedUser 的最新余额
      utils.adminUser.list.invalidate();
      refetchHistory();
      setLogPage(1);
      refetchGlobal();
    },
    onError: (e: any) => toast.error(e.message || "调账失败"),
  });

  // 只有输入内容时才过滤并显示
  const filteredUsers = search.trim().length > 0
    ? (allUsers as any[]).filter((u: any) => {
        const q = search.toLowerCase();
        return (
          String(u.name ?? "").toLowerCase().includes(q) ||
          String(u.username ?? "").toLowerCase().includes(q) ||
          String(u.id).includes(q)
        );
      }).slice(0, 20)
    : [];

  function selectUser(u: any) {
    setSelectedUser(u);
    setSearch("");
    setShowDropdown(false);
    inputRef.current?.blur();
  }

  function clearUser() {
    setSelectedUser(null);
    setSearch("");
    setTimeout(() => inputRef.current?.focus(), 50);
  }

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
          <button onClick={() => backPath ? setLocation(backPath) : setLocation(-1 as any)} className="p-1 -ml-1">
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

          {/* 已选用户展示 */}
          {selectedUser ? (
            <div className="bg-orange-50 border border-orange-200 rounded-2xl px-4 py-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[14px] font-bold text-black">{selectedUser.name || selectedUser.username}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">ID: {selectedUser.id} · @{selectedUser.username}</p>
                </div>
                <button onClick={clearUser} className="text-[11px] text-orange-500 font-semibold px-2 py-1 rounded-lg bg-orange-100 active:bg-orange-200">
                  更换
                </button>
              </div>
              {/* 余额展示 */}
              <div className="flex gap-3 mt-3">
                <div className="flex-1 bg-white rounded-xl px-3 py-2 border border-orange-100">
                  <p className="text-[10px] text-gray-400 mb-0.5">USDT 余额</p>
                  <p className="text-[15px] font-bold text-orange-500">{Number(selectedUser.usdtBalance ?? 0).toFixed(4)}</p>
                </div>
                <div className="flex-1 bg-white rounded-xl px-3 py-2 border border-orange-100">
                  <p className="text-[10px] text-gray-400 mb-0.5">CNY 余额</p>
                  <p className="text-[15px] font-bold text-green-600">¥{Number(selectedUser.cnyBalance ?? 0).toFixed(2)}</p>
                </div>
              </div>
            </div>
          ) : (
            /* 搜索框 + 下拉 */
            <div ref={searchPanelRef} className="relative">
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 bg-gray-50 focus-within:border-orange-400">
                <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <input
                  ref={inputRef}
                  type="text"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setShowDropdown(true); }}
                  onFocus={() => setShowDropdown(true)}
                  placeholder="输入姓名 / 账号 / ID 搜索用户"
                  className="flex-1 text-[13px] bg-transparent focus:outline-none"
                />
                {search && (
                  <button onClick={() => setSearch("")} className="p-0.5">
                    <X className="w-4 h-4 text-gray-400" />
                  </button>
                )}
              </div>

              {/* 下拉结果 */}
              {showDropdown && search.trim().length > 0 && (
                <div
                  className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-2xl shadow-lg z-50 overflow-y-auto overscroll-contain"
                  style={{ maxHeight: `${dropdownMaxHeight}px` }}
                >
                  {filteredUsers.length === 0 ? (
                    <p className="text-center text-[12px] text-gray-400 py-6">未找到匹配用户</p>
                  ) : (
                    filteredUsers.map((u: any) => (
                      <button
                        key={u.id}
                        onMouseDown={() => selectUser(u)}
                        className="w-full text-left flex items-center justify-between px-4 py-3 hover:bg-orange-50 active:bg-orange-100 border-b border-gray-50 last:border-0"
                      >
                        <div>
                          <p className="text-[13px] font-semibold text-black">{u.name || u.username}</p>
                          <p className="text-[10px] text-gray-400">ID: {u.id} · @{u.username}</p>
                        </div>
                        <div className="text-right flex-shrink-0 ml-3">
                          <p className="text-[11px] text-orange-500 font-medium">USDT {Number(u.usdtBalance ?? 0).toFixed(2)}</p>
                          <p className="text-[10px] text-gray-400">CNY ¥{Number(u.cnyBalance ?? 0).toFixed(2)}</p>
                        </div>
                      </button>
                    ))
                  )}
                </div>
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

        {/* 第三步：当前用户调账历史 */}
        {selectedUser && (
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <p className="text-[13px] font-bold text-black mb-3">③ {selectedUser.name || selectedUser.username} 的调账记录</p>
            {(history as any[]).length === 0 ? (
              <p className="text-center text-[12px] text-gray-300 py-6">暂无调账记录</p>
            ) : (
              <div className="space-y-2">
                {(history as any[]).map((r: any, i: number) => (
                  <div key={r.id ?? i} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] text-gray-600 truncate">{String(r.note ?? "").replace(/\[.*?\]/g, "").trim() || "—"}</p>
                      <p className="text-[10px] text-gray-400">{new Date(r.createdAt).toLocaleString("zh-CN")} · {r.currency}</p>
                    </div>
                    <p className={`text-[14px] font-bold ml-3 flex-shrink-0 ${Number(r.amount) >= 0 ? "text-green-600" : "text-red-500"}`}>
                      {Number(r.amount) >= 0 ? "+" : ""}{r.currency === "CNY" ? "¥" : ""}{Number(r.amount).toFixed(r.currency === "CNY" ? 2 : 4)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 全局调账日志 */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[13px] font-bold text-black">全局调账日志</p>
            <span className="text-[11px] text-gray-400">共 {logTotal} 条</span>
          </div>

          {logItems.length === 0 ? (
            <p className="text-center text-[12px] text-gray-300 py-6">暂无调账记录</p>
          ) : (
            <div className="space-y-2">
              {logItems.map((r: any, i: number) => (
                <div key={r.id ?? i} className="flex items-start justify-between py-2.5 border-b border-gray-50 last:border-0">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-[12px] font-semibold text-black">{r.userName}</span>
                      <span className="text-[10px] text-gray-400">@{r.username}</span>
                    </div>
                    <p className="text-[11px] text-gray-500 truncate">{String(r.note ?? "").replace(/\[.*?\]/g, "").trim() || "—"}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">{new Date(r.createdAt).toLocaleString("zh-CN")} · {r.currency}</p>
                  </div>
                  <p className={`text-[14px] font-bold ml-3 flex-shrink-0 ${Number(r.amount) >= 0 ? "text-green-600" : "text-red-500"}`}>
                    {Number(r.amount) >= 0 ? "+" : ""}{r.currency === "CNY" ? "¥" : ""}{Number(r.amount).toFixed(r.currency === "CNY" ? 2 : 4)}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* 翻页 */}
          {logTotalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
              <button
                onClick={() => setLogPage(p => Math.max(1, p - 1))}
                disabled={logPage <= 1}
                className="flex items-center gap-1 text-[12px] px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 disabled:opacity-30"
              >
                <PrevIcon className="w-3.5 h-3.5" />上一页
              </button>
              <span className="text-[12px] text-gray-400">{logPage} / {logTotalPages}</span>
              <button
                onClick={() => setLogPage(p => Math.min(logTotalPages, p + 1))}
                disabled={logPage >= logTotalPages}
                className="flex items-center gap-1 text-[12px] px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 disabled:opacity-30"
              >
                下一页<NextIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
