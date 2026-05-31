import { useState } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft,
  Plus,
  Search,
  ArrowDownCircle,
  ArrowUpCircle,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { PageTag } from "@/components/PageTag";

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" }) +
    " " + d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

export default function AdminCnyManage() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [showAdjust, setShowAdjust] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [amount, setAmount] = useState("");
  const [direction, setDirection] = useState<"add" | "sub">("add");
  const [note, setNote] = useState("");
  const [expandedUser, setExpandedUser] = useState<number | null>(null);

  // 获取所有用户（带CNY余额）
  const usersQuery = trpc.recharge.adminGetAllUsersCnyBalance.useQuery();

  const adjustMutation = trpc.recharge.adminAdjustCny.useMutation({
    onSuccess: () => {
      toast.success("调账成功");
      setShowAdjust(false);
      setSelectedUser(null);
      setAmount("");
      setNote("");
      usersQuery.refetch();
    },
    onError: (e) => toast.error(e.message || "调账失败"),
  });

  const users = (usersQuery.data ?? []).filter((u: any) => {
    if (!search) return true;
    return (u.name || "").includes(search) || (u.username || "").includes(search);
  });

  const handleAdjust = () => {
    const num = parseFloat(amount);
    if (!selectedUser || isNaN(num) || num <= 0) {
      toast.error("请输入有效金额");
      return;
    }
    adjustMutation.mutate({
      userId: selectedUser.id,
      amount: direction === "add" ? num : -num,
      note: note || undefined,
    });
  };

  return (
    <div
      className="min-h-screen"
      style={{ background: "linear-gradient(160deg, #0d0d0d 0%, #1a1a1a 50%, #111111 100%)" }}
    >
        <PageTag code="P211" />
      {/* 顶部导航 */}
      <div
        className="sticky top-0 z-20 flex items-center justify-between px-4 py-3"
        style={{
          background: "rgba(13,13,13,0.95)",
          borderBottom: "1px solid rgba(229,57,53,0.2)",
          backdropFilter: "blur(10px)",
        }}
      >
        <button
          onClick={() => setLocation(-1 as any)}
          className="flex items-center justify-center w-9 h-9 rounded-full"
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(229,57,53,0.3)" }}
        >
          <ArrowLeft className="w-5 h-5" style={{ color: "#ff8a80" }} />
        </button>
        <span className="text-base font-bold tracking-widest" style={{ color: "#ff8a80" }}>
          人民币账户管理
        </span>
        <button
          onClick={() => usersQuery.refetch()}
          className="flex items-center justify-center w-9 h-9 rounded-full"
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(229,57,53,0.3)" }}
        >
          <RefreshCw className="w-4 h-4" style={{ color: "#e53935" }} />
        </button>
      </div>

      <div className="px-4 pt-4 pb-24 space-y-4">
        {/* 搜索栏 */}
        <div
          className="flex items-center space-x-2 rounded-xl px-3 py-2.5"
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
        >
          <Search className="w-4 h-4 flex-shrink-0" style={{ color: "rgba(255,255,255,0.3)" }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索用户名"
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: "rgba(255,255,255,0.85)" }}
          />
        </div>

        {/* 统计条 */}
        {usersQuery.data && (
          <div
            className="rounded-xl px-4 py-3 flex items-center justify-between"
            style={{ background: "rgba(229,57,53,0.08)", border: "1px solid rgba(229,57,53,0.2)" }}
          >
            <div className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
              共 {usersQuery.data.length} 位用户
            </div>
            <div className="text-sm font-bold" style={{ color: "#ff8a80" }}>
              总 CNY ¥{(usersQuery.data as any[]).reduce((s: number, u: any) => s + Number(u.cnyBalance || 0), 0).toFixed(2)}
            </div>
          </div>
        )}

        {/* 用户列表 */}
        {usersQuery.isLoading ? (
          <div className="py-12 text-center text-xs" style={{ color: "rgba(255,255,255,0.25)" }}>加载中...</div>
        ) : users.length === 0 ? (
          <div className="py-12 text-center text-xs" style={{ color: "rgba(255,255,255,0.25)" }}>暂无用户</div>
        ) : (
          <div className="space-y-2">
            {users.map((user: any) => (
              <div
                key={user.id}
                className="rounded-2xl overflow-hidden"
                style={{
                  background: "linear-gradient(135deg, #111111 0%, #1e1e1e 100%)",
                  border: "1px solid rgba(229,57,53,0.2)",
                }}
              >
                {/* 用户行 */}
                <div
                  className="flex items-center justify-between px-4 py-3 cursor-pointer"
                  onClick={() => setExpandedUser(expandedUser === user.id ? null : user.id)}
                >
                  <div className="flex items-center space-x-3">
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                      style={{ background: "rgba(229,57,53,0.2)", color: "#ff8a80" }}
                    >
                      {(user.name || user.username || "?")[0]}
                    </div>
                    <div>
                      <div className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.85)" }}>
                        {user.name || user.username}
                      </div>
                      <div className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
                        ID: {user.id}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    <div className="text-right">
                      <div className="text-sm font-bold tabular-nums" style={{ color: "#ff8a80" }}>
                        ¥{Number(user.cnyBalance || 0).toFixed(2)}
                      </div>
                      <div className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>CNY</div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedUser(user);
                        setDirection("add");
                        setAmount("");
                        setNote("");
                        setShowAdjust(true);
                      }}
                      className="w-8 h-8 rounded-full flex items-center justify-center"
                      style={{ background: "rgba(229,57,53,0.2)", border: "1px solid rgba(229,57,53,0.4)" }}
                    >
                      <Plus className="w-4 h-4" style={{ color: "#ff8a80" }} />
                    </button>
                    <ChevronRight
                      className="w-4 h-4 transition-transform"
                      style={{
                        color: "rgba(255,255,255,0.3)",
                        transform: expandedUser === user.id ? "rotate(90deg)" : "rotate(0deg)",
                      }}
                    />
                  </div>
                </div>

                {/* 展开：最近流水 */}
                {expandedUser === user.id && (
                  <UserCnyHistory userId={user.id} />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 调账弹窗 */}
      {showAdjust && selectedUser && (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "rgba(0,0,0,0.85)" }}>
          <div
            className="rounded-t-3xl mt-auto overflow-hidden"
            style={{
              background: "linear-gradient(160deg, #0d0d0d 0%, #1a1a1a 100%)",
              border: "1px solid rgba(229,57,53,0.3)",
              borderBottom: "none",
            }}
          >
            {/* 拖拽条 */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full" style={{ background: "rgba(229,57,53,0.3)" }} />
            </div>
            <div className="flex items-center justify-between px-4 py-2">
              <span className="text-base font-bold" style={{ color: "#ff8a80" }}>
                CNY 调账 · {selectedUser.name || selectedUser.username}
              </span>
              <button
                onClick={() => setShowAdjust(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-lg"
                style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)" }}
              >
                ×
              </button>
            </div>

            <div className="px-5 pb-8 space-y-4">
              {/* 当前余额 */}
              <div
                className="rounded-xl px-4 py-3 flex items-center justify-between"
                style={{ background: "rgba(229,57,53,0.08)", border: "1px solid rgba(229,57,53,0.2)" }}
              >
                <span className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>当前余额</span>
                <span className="text-base font-bold" style={{ color: "#ff8a80" }}>
                  ¥ {Number(selectedUser.cnyBalance || 0).toFixed(2)}
                </span>
              </div>

              {/* 方向选择 */}
              <div className="grid grid-cols-2 gap-2">
                {(["add", "sub"] as const).map((d) => (
                  <button
                    key={d}
                    onClick={() => setDirection(d)}
                    className="flex items-center justify-center space-x-2 py-2.5 rounded-xl text-sm font-semibold transition-all"
                    style={
                      direction === d
                        ? {
                            background: d === "add" ? "rgba(74,222,128,0.2)" : "rgba(248,113,113,0.2)",
                            border: `1px solid ${d === "add" ? "#4ade80" : "#f87171"}`,
                            color: d === "add" ? "#4ade80" : "#f87171",
                          }
                        : {
                            background: "rgba(255,255,255,0.05)",
                            border: "1px solid rgba(255,255,255,0.1)",
                            color: "rgba(255,255,255,0.4)",
                          }
                    }
                  >
                    {d === "add"
                      ? <><ArrowDownCircle className="w-4 h-4" /><span>入账</span></>
                      : <><ArrowUpCircle className="w-4 h-4" /><span>出账</span></>
                    }
                  </button>
                ))}
              </div>

              {/* 金额 */}
              <div>
                <div className="text-xs mb-1.5" style={{ color: "rgba(255,255,255,0.4)" }}>金额（元）</div>
                <div
                  className="flex items-center rounded-xl px-4 py-3"
                  style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
                >
                  <span className="text-lg font-bold mr-2" style={{ color: "rgba(229,57,53,0.8)" }}>¥</span>
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="flex-1 bg-transparent text-xl font-bold outline-none tabular-nums"
                    style={{ color: "#fff" }}
                  />
                </div>
              </div>

              {/* 备注 */}
              <div>
                <div className="text-xs mb-1.5" style={{ color: "rgba(255,255,255,0.4)" }}>备注（可选）</div>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="如：充值确认、提现到账等"
                  className="w-full rounded-xl px-4 py-3 text-sm outline-none"
                  style={{
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    color: "rgba(255,255,255,0.85)",
                  }}
                />
              </div>

              <button
                onClick={handleAdjust}
                disabled={adjustMutation.isPending}
                className="w-full py-3.5 rounded-xl text-sm font-bold active:scale-[0.98] transition-transform disabled:opacity-50"
                style={{
                  background: "linear-gradient(135deg, #b71c1c 0%, #ff8a80 100%)",
                  boxShadow: "0 4px 16px rgba(229,57,53,0.4)",
                  color: "#fff",
                }}
              >
                {adjustMutation.isPending ? "处理中..." : "确认调账"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// 用户CNY流水子组件
function UserCnyHistory({ userId }: { userId: number }) {
  const historyQuery = trpc.recharge.adminGetUserCnyHistory.useQuery({ userId, limit: 5 });
  const records = historyQuery.data ?? [];

  return (
    <div
      className="px-4 pb-3"
      style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}
    >
      {historyQuery.isLoading ? (
        <div className="py-3 text-center text-xs" style={{ color: "rgba(255,255,255,0.2)" }}>加载中...</div>
      ) : records.length === 0 ? (
        <div className="py-3 text-center text-xs" style={{ color: "rgba(255,255,255,0.2)" }}>暂无流水</div>
      ) : (
        <div className="space-y-0 mt-2">
          {(records as any[]).map((r: any, idx: number) => (
            <div
              key={r.id}
              className="flex items-center justify-between py-2"
              style={{
                borderBottom: idx < records.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
              }}
            >
              <div>
                <div className="text-xs" style={{ color: "rgba(255,255,255,0.6)" }}>
                  {(r.note || "").replace(/^\[CNY\]/, "") || (Number(r.amount) > 0 ? "入账" : "出账")}
                </div>
                <div className="text-xs" style={{ color: "rgba(255,255,255,0.25)" }}>
                  {formatTime(r.created_at)}
                </div>
              </div>
              <div
                className="text-xs font-bold tabular-nums"
                style={{ color: Number(r.amount) > 0 ? "#4ade80" : "#f87171" }}
              >
                {Number(r.amount) > 0 ? "+" : ""}{Number(r.amount).toFixed(2)} CNY
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
