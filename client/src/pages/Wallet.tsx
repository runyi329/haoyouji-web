import { useState } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft,
  ArrowDownCircle,
  ArrowUpCircle,
  Clock,
  CheckCircle2,
  XCircle,
  ChevronRight,
  Eye,
  EyeOff,
  Coins,
  RefreshCw,
  TrendingUp,
} from "lucide-react";
import { trpc } from "../lib/trpc";
import Recharge from "./Recharge";
import Withdraw from "./Withdraw";

type ModalType = "recharge" | "withdraw" | "cny-recharge" | "cny-withdraw" | null;

// 金色高光线
function GoldLine() {
  return (
    <div
      className="absolute inset-x-0 top-0 h-px"
      style={{
        background:
          "linear-gradient(90deg, transparent 5%, #F5D78E 40%, #C9A84C 60%, transparent 95%)",
      }}
    />
  );
}

// 红色高光线（CNY 卡片用）
function RedLine() {
  return (
    <div
      className="absolute inset-x-0 top-0 h-px"
      style={{
        background:
          "linear-gradient(90deg, transparent 5%, #ff8a80 40%, #e53935 60%, transparent 95%)",
      }}
    />
  );
}

// 状态图标
function StatusIcon({ status }: { status: string }) {
  if (status === "completed" || status === "approved")
    return <CheckCircle2 className="w-4 h-4 text-green-400" />;
  if (status === "pending" || status === "processing")
    return <Clock className="w-4 h-4 text-yellow-400" />;
  if (status === "rejected" || status === "failed")
    return <XCircle className="w-4 h-4 text-red-400" />;
  return <Clock className="w-4 h-4 text-gray-400" />;
}

function statusText(status: string) {
  const map: Record<string, string> = {
    completed: "已完成",
    approved: "已完成",
    pending: "处理中",
    processing: "处理中",
    rejected: "已拒绝",
    failed: "已失败",
  };
  return map[status] ?? status;
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0)
    return `今天 ${d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`;
  if (days === 1)
    return `昨天 ${d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`;
  if (days < 7) return `${days}天前`;
  return d.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
}

// 底部弹窗容器
function BottomSheet({
  title,
  onClose,
  children,
  accentColor = "#F5D78E",
  borderColor = "rgba(201,168,76,0.3)",
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  accentColor?: string;
  borderColor?: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "rgba(0,0,0,0.85)" }}>
      <div
        className="flex-1 overflow-y-auto rounded-t-3xl mt-auto"
        style={{
          background: "linear-gradient(160deg, #0d0d0d 0%, #1a1a1a 100%)",
          border: `1px solid ${borderColor}`,
          borderBottom: "none",
          maxHeight: "90vh",
        }}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full" style={{ background: borderColor }} />
        </div>
        <div className="flex items-center justify-between px-4 py-2">
          <span className="text-base font-bold" style={{ color: accentColor }}>{title}</span>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-lg"
            style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)" }}
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// CNY 充值弹窗内容（提示用户转账，等待确认）
function CnyRechargeContent({ onClose }: { onClose: () => void }) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = () => {
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      alert("请输入有效金额");
      return;
    }
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="px-5 py-8 flex flex-col items-center space-y-4">
        <CheckCircle2 className="w-14 h-14 text-green-400" />
        <div className="text-base font-bold text-white">充值申请已提交</div>
        <div className="text-sm text-center" style={{ color: "rgba(255,255,255,0.5)" }}>
          请按照收款信息完成转账，到账后将自动更新余额
        </div>
        <button
          onClick={onClose}
          className="w-full py-3 rounded-xl text-sm font-bold"
          style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.7)" }}
        >
          关闭
        </button>
      </div>
    );
  }

  return (
    <div className="px-5 pb-8 space-y-4">
      {/* 收款信息 */}
      <div
        className="rounded-xl p-4 space-y-2"
        style={{ background: "rgba(229,57,53,0.08)", border: "1px solid rgba(229,57,53,0.25)" }}
      >
        <div className="text-xs font-semibold" style={{ color: "rgba(255,138,128,0.9)" }}>收款信息</div>
        <div className="space-y-1.5">
          {[
            { label: "收款账户", value: "招商银行 6214 **** **** 8888" },
            { label: "收款人", value: "张三" },
            { label: "转账备注", value: "请务必填写您的用户ID" },
          ].map(({ label, value }) => (
            <div key={label} className="flex justify-between text-xs">
              <span style={{ color: "rgba(255,255,255,0.4)" }}>{label}</span>
              <span style={{ color: "rgba(255,255,255,0.85)" }}>{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 金额输入 */}
      <div>
        <div className="text-xs mb-1.5" style={{ color: "rgba(255,255,255,0.4)" }}>充值金额（元）</div>
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
          placeholder="如有特殊说明请填写"
          className="w-full rounded-xl px-4 py-3 text-sm outline-none"
          style={{
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.1)",
            color: "rgba(255,255,255,0.85)",
          }}
        />
      </div>

      <button
        onClick={handleSubmit}
        className="w-full py-3.5 rounded-xl text-sm font-bold active:scale-[0.98] transition-transform"
        style={{
          background: "linear-gradient(135deg, #e53935 0%, #ff8a80 100%)",
          boxShadow: "0 4px 16px rgba(229,57,53,0.4)",
          color: "#fff",
        }}
      >
        提交充值申请
      </button>
    </div>
  );
}

// CNY 提现弹窗内容
function CnyWithdrawContent({ cnyBalance, onClose, onSuccess }: { cnyBalance: number; onClose: () => void; onSuccess: () => void }) {
  const [amount, setAmount] = useState("");
  const [bankInfo, setBankInfo] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = () => {
    const num = Number(amount);
    if (!amount || isNaN(num) || num <= 0) {
      alert("请输入有效金额");
      return;
    }
    if (num > cnyBalance) {
      alert("提现金额不能超过可用余额");
      return;
    }
    if (!bankInfo.trim()) {
      alert("请填写收款账户信息");
      return;
    }
    setSubmitted(true);
    onSuccess();
  };

  if (submitted) {
    return (
      <div className="px-5 py-8 flex flex-col items-center space-y-4">
        <CheckCircle2 className="w-14 h-14 text-green-400" />
        <div className="text-base font-bold text-white">提现申请已提交</div>
        <div className="text-sm text-center" style={{ color: "rgba(255,255,255,0.5)" }}>
          预计 1-3 个工作日到账
        </div>
        <button
          onClick={onClose}
          className="w-full py-3 rounded-xl text-sm font-bold"
          style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.7)" }}
        >
          关闭
        </button>
      </div>
    );
  }

  return (
    <div className="px-5 pb-8 space-y-4">
      {/* 可用余额 */}
      <div
        className="rounded-xl px-4 py-3 flex items-center justify-between"
        style={{ background: "rgba(229,57,53,0.08)", border: "1px solid rgba(229,57,53,0.2)" }}
      >
        <span className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>可用余额</span>
        <span className="text-base font-bold" style={{ color: "#ff8a80" }}>
          ¥ {cnyBalance.toFixed(2)}
        </span>
      </div>

      {/* 金额 */}
      <div>
        <div className="text-xs mb-1.5" style={{ color: "rgba(255,255,255,0.4)" }}>提现金额（元）</div>
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
          <button
            onClick={() => setAmount(cnyBalance.toFixed(2))}
            className="text-xs px-2 py-1 rounded-lg ml-2"
            style={{ background: "rgba(229,57,53,0.2)", color: "#ff8a80" }}
          >
            全部
          </button>
        </div>
      </div>

      {/* 收款账户 */}
      <div>
        <div className="text-xs mb-1.5" style={{ color: "rgba(255,255,255,0.4)" }}>收款账户信息</div>
        <textarea
          value={bankInfo}
          onChange={(e) => setBankInfo(e.target.value)}
          placeholder="请填写银行卡号、开户行、户名等信息"
          rows={3}
          className="w-full rounded-xl px-4 py-3 text-sm outline-none resize-none"
          style={{
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.1)",
            color: "rgba(255,255,255,0.85)",
          }}
        />
      </div>

      <button
        onClick={handleSubmit}
        className="w-full py-3.5 rounded-xl text-sm font-bold active:scale-[0.98] transition-transform"
        style={{
          background: "linear-gradient(135deg, #e53935 0%, #ff8a80 100%)",
          boxShadow: "0 4px 16px rgba(229,57,53,0.4)",
          color: "#fff",
        }}
      >
        提交提现申请
      </button>
    </div>
  );
}

export default function Wallet() {
  const [, setLocation] = useLocation();
  const [modal, setModal] = useState<ModalType>(null);
  const [hideBalance, setHideBalance] = useState(false);

  // USDT 数据
  const balanceQuery = trpc.recharge.getBalance.useQuery();
  const pointsQuery = trpc.rewards.getPoints.useQuery();
  const recentRechargeQuery = trpc.recharge.getMyOrders.useQuery({ limit: 3 });
  const recentWithdrawQuery = trpc.recharge.getMyWithdrawHistory.useQuery({ limit: 3 });
  const recentManualQuery = trpc.recharge.getMyManualBalances.useQuery({ limit: 3 });

  // CNY 数据
  const cnyBalanceQuery = trpc.recharge.getCnyBalance.useQuery();
  const cnyHistoryQuery = trpc.recharge.getCnyHistory.useQuery({ limit: 3 });

  const balance = typeof balanceQuery.data === "number" ? balanceQuery.data : 0;
  const cnyBalance = typeof cnyBalanceQuery.data === "number" ? cnyBalanceQuery.data : 0;
  const points = pointsQuery.data?.points ?? 0;

  // USDT 折合人民币（实时汇率约 7.25）
  const usdtToCny = balance * 7.25;
  // 总资产折合人民币
  const totalCny = usdtToCny + cnyBalance;

  // 合并 USDT 最近交易
  const recentUsdtTx = (() => {
    const recharges = (recentRechargeQuery.data ?? []).map((r: any) => ({
      id: `r-${r.id}`,
      type: "recharge" as const,
      amount: Number(r.amount),
      status: r.status,
      createdAt: r.createdAt,
      remark: r.remark || "",
    }));
    const withdraws = (recentWithdrawQuery.data ?? []).map((w: any) => ({
      id: `w-${w.id}`,
      type: "withdraw" as const,
      amount: Number(w.amount),
      status: w.status,
      createdAt: w.createdAt,
      remark: w.remark || "",
    }));
    const manuals = (recentManualQuery.data ?? [])
      .filter((m: any) => !(m.note || "").startsWith("[CNY]"))
      .map((m: any) => ({
        id: `m-${m.id}`,
        type: (Number(m.amount) > 0 ? "reward" : "deduct") as "reward" | "deduct",
        amount: Math.abs(Number(m.amount)),
        status: "completed" as const,
        createdAt: m.created_at,
        remark: m.note || "",
      }));
    return [...recharges, ...withdraws, ...manuals]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 3);
  })();

  // CNY 最近流水
  const recentCnyTx = (cnyHistoryQuery.data ?? []).slice(0, 3).map((m: any) => ({
    id: `cny-${m.id}`,
    amount: Math.abs(Number(m.amount)),
    isIn: Number(m.amount) > 0,
    note: (m.note || "").replace(/^\[CNY\]/, ""),
    createdAt: m.created_at,
  }));

  return (
    <div
      className="min-h-screen"
      style={{ background: "linear-gradient(160deg, #0d0d0d 0%, #1a1a1a 50%, #111111 100%)" }}
    >
      {/* ── 顶部导航 ── */}
      <div
        className="sticky top-0 z-20 flex items-center justify-between px-4 py-3"
        style={{
          background: "rgba(13,13,13,0.95)",
          borderBottom: "1px solid rgba(201,168,76,0.25)",
          backdropFilter: "blur(10px)",
        }}
      >
        <button
          onClick={() => setLocation("/")}
          className="flex items-center justify-center w-9 h-9 rounded-full"
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(201,168,76,0.3)" }}
        >
          <ArrowLeft className="w-5 h-5" style={{ color: "#F5D78E" }} />
        </button>
        <span
          className="text-base font-bold tracking-widest"
          style={{ color: "#F5D78E", textShadow: "0 0 12px rgba(245,215,142,0.4)" }}
        >
          我的钱包
        </span>
        <button
          onClick={() => setHideBalance((v) => !v)}
          className="flex items-center justify-center w-9 h-9 rounded-full"
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(201,168,76,0.3)" }}
        >
          {hideBalance ? (
            <EyeOff className="w-4 h-4" style={{ color: "#C9A84C" }} />
          ) : (
            <Eye className="w-4 h-4" style={{ color: "#C9A84C" }} />
          )}
        </button>
      </div>

      <div className="px-4 pb-24 space-y-4 pt-4">

        {/* ── 总资产折算条 ── */}
        <div
          className="relative rounded-2xl overflow-hidden px-5 py-4"
          style={{
            background: "linear-gradient(135deg, #1a1200 0%, #2a2000 50%, #1a1200 100%)",
            border: "1px solid rgba(201,168,76,0.4)",
            boxShadow: "0 4px 20px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06)",
          }}
        >
          <GoldLine />
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs mb-1" style={{ color: "rgba(201,168,76,0.5)" }}>
                总资产（折合人民币）
              </div>
              <div className="flex items-baseline space-x-1.5">
                <span className="text-3xl font-bold tabular-nums" style={{ color: "#F5D78E" }}>
                  {hideBalance ? "••••••" : `¥ ${totalCny.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                </span>
              </div>
            </div>
            <div className="flex items-center space-x-1 px-3 py-1.5 rounded-xl" style={{ background: "rgba(201,168,76,0.1)" }}>
              <TrendingUp className="w-3.5 h-3.5" style={{ color: "#C9A84C" }} />
              <span className="text-xs font-medium" style={{ color: "#C9A84C" }}>2 个账户</span>
            </div>
          </div>
          {!hideBalance && (
            <div className="flex items-center space-x-4 mt-3 pt-3" style={{ borderTop: "1px solid rgba(201,168,76,0.1)" }}>
              <div className="text-xs" style={{ color: "rgba(201,168,76,0.45)" }}>
                USDT ≈ ¥{usdtToCny.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="w-px h-3" style={{ background: "rgba(201,168,76,0.2)" }} />
              <div className="text-xs" style={{ color: "rgba(201,168,76,0.45)" }}>
                CNY ¥{cnyBalance.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
          )}
        </div>

        {/* ── USDT 账户卡片 ── */}
        <div
          className="relative rounded-2xl overflow-hidden"
          style={{
            background: "linear-gradient(135deg, #111111 0%, #2a2a2a 45%, #1a1a1a 100%)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.08)",
            border: "1px solid rgba(201,168,76,0.5)",
          }}
        >
          <GoldLine />
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "radial-gradient(ellipse at 20% 20%, rgba(201,168,76,0.06) 0%, transparent 60%)",
            }}
          />
          <div className="relative p-5">
            {/* 标题行 */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={{
                    background: "radial-gradient(circle at 35% 35%, #F5D78E 0%, #C9A84C 50%, #8B6914 100%)",
                    boxShadow: "0 2px 8px rgba(201,168,76,0.5)",
                  }}
                >
                  <span className="text-xs font-bold text-black">$</span>
                </div>
                <span className="text-sm font-semibold tracking-wider" style={{ color: "#F5D78E" }}>
                  USDT 账户
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setLocation("/wallet/transactions")}
                  className="flex items-center space-x-1 px-2 h-7 rounded-full text-xs font-medium"
                  style={{ background: "rgba(255,255,255,0.06)", color: "rgba(201,168,76,0.8)" }}
                >
                  <span>明细</span>
                  <ChevronRight className="w-3 h-3" />
                </button>
                <button
                  onClick={() => balanceQuery.refetch()}
                  className="flex items-center justify-center w-7 h-7 rounded-full"
                  style={{ background: "rgba(255,255,255,0.06)" }}
                >
                  <RefreshCw className="w-3.5 h-3.5" style={{ color: "#C9A84C" }} />
                </button>
              </div>
            </div>

            {/* 余额 */}
            <div className="mb-1">
              {hideBalance ? (
                <span className="text-4xl font-bold tracking-wider" style={{ color: "#F5D78E" }}>••••••</span>
              ) : (
                <div className="flex items-baseline space-x-2">
                  <span
                    className="text-4xl font-bold tabular-nums"
                    style={{ color: "#F5D78E", textShadow: "0 0 20px rgba(245,215,142,0.3)" }}
                  >
                    {balance.toFixed(2)}
                  </span>
                  <span className="text-base font-medium" style={{ color: "rgba(245,215,142,0.6)" }}>USDT</span>
                </div>
              )}
            </div>
            {!hideBalance && (
              <div className="text-xs mb-4" style={{ color: "rgba(201,168,76,0.5)" }}>
                ≈ ¥{usdtToCny.toFixed(2)} 人民币
              </div>
            )}

            {/* 操作按钮 */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setModal("recharge")}
                className="flex items-center justify-center space-x-2 py-2.5 rounded-xl active:scale-[0.97] transition-transform"
                style={{
                  background: "linear-gradient(135deg, #C9A84C 0%, #F5D78E 50%, #C9A84C 100%)",
                  boxShadow: "0 4px 16px rgba(201,168,76,0.4)",
                }}
              >
                <ArrowDownCircle className="w-4 h-4 text-black" />
                <span className="text-sm font-bold text-black">充值</span>
              </button>
              <button
                onClick={() => setModal("withdraw")}
                className="flex items-center justify-center space-x-2 py-2.5 rounded-xl active:scale-[0.97] transition-transform"
                style={{
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(201,168,76,0.5)",
                }}
              >
                <ArrowUpCircle className="w-4 h-4" style={{ color: "#F5D78E" }} />
                <span className="text-sm font-bold" style={{ color: "#F5D78E" }}>提现</span>
              </button>
            </div>

            {/* USDT 最近流水 */}
            {recentUsdtTx.length > 0 && (
              <div className="mt-4 pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                <div className="space-y-0">
                  {recentUsdtTx.map((tx, idx) => (
                    <div
                      key={tx.id}
                      className="flex items-center justify-between py-2"
                      style={{
                        borderBottom: idx < recentUsdtTx.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                      }}
                    >
                      <div>
                        <div className="text-xs font-medium" style={{ color: "rgba(255,255,255,0.75)" }}>
                          {tx.type === "recharge" ? "充值" : tx.type === "withdraw" ? "提现" : tx.type === "reward" ? "奖励" : "扣费"}
                        </div>
                        <div className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>{formatTime(tx.createdAt)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-bold tabular-nums" style={{ color: (tx.type === "recharge" || tx.type === "reward") ? "#4ade80" : "#f87171" }}>
                          {(tx.type === "recharge" || tx.type === "reward") ? "+" : "-"}
                          {hideBalance ? "••••" : tx.amount.toFixed(2)} USDT
                        </div>
                        <div className="flex items-center justify-end space-x-0.5 mt-0.5">
                          <StatusIcon status={tx.status} />
                          <span className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>{statusText(tx.status)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="absolute inset-x-0 bottom-0 h-px" style={{ background: "rgba(0,0,0,0.5)" }} />
        </div>

        {/* ── CNY 账户卡片 ── */}
        <div
          className="relative rounded-2xl overflow-hidden"
          style={{
            background: "linear-gradient(135deg, #130000 0%, #2a0a0a 45%, #1a0000 100%)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.06)",
            border: "1px solid rgba(229,57,53,0.45)",
          }}
        >
          <RedLine />
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "radial-gradient(ellipse at 20% 20%, rgba(229,57,53,0.06) 0%, transparent 60%)",
            }}
          />
          <div className="relative p-5">
            {/* 标题行 */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={{
                    background: "radial-gradient(circle at 35% 35%, #ff8a80 0%, #e53935 50%, #7f0000 100%)",
                    boxShadow: "0 2px 8px rgba(229,57,53,0.5)",
                  }}
                >
                  <span className="text-xs font-bold text-white">¥</span>
                </div>
                <span className="text-sm font-semibold tracking-wider" style={{ color: "#ff8a80" }}>
                  人民币账户
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setLocation("/wallet/cny-transactions")}
                  className="flex items-center space-x-1 px-2 h-7 rounded-full text-xs font-medium"
                  style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,138,128,0.8)" }}
                >
                  <span>明细</span>
                  <ChevronRight className="w-3 h-3" />
                </button>
                <button
                  onClick={() => cnyBalanceQuery.refetch()}
                  className="flex items-center justify-center w-7 h-7 rounded-full"
                  style={{ background: "rgba(255,255,255,0.06)" }}
                >
                  <RefreshCw className="w-3.5 h-3.5" style={{ color: "#e53935" }} />
                </button>
              </div>
            </div>

            {/* 余额 */}
            <div className="mb-1">
              {hideBalance ? (
                <span className="text-4xl font-bold tracking-wider" style={{ color: "#ff8a80" }}>••••••</span>
              ) : (
                <div className="flex items-baseline space-x-2">
                  <span
                    className="text-4xl font-bold tabular-nums"
                    style={{ color: "#ff8a80", textShadow: "0 0 20px rgba(229,57,53,0.3)" }}
                  >
                    {cnyBalance.toFixed(2)}
                  </span>
                  <span className="text-base font-medium" style={{ color: "rgba(255,138,128,0.6)" }}>CNY</span>
                </div>
              )}
            </div>
            {!hideBalance && (
              <div className="text-xs mb-4" style={{ color: "rgba(229,57,53,0.5)" }}>
                人民币本位，无需折算
              </div>
            )}

            {/* 操作按钮 */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setModal("cny-recharge")}
                className="flex items-center justify-center space-x-2 py-2.5 rounded-xl active:scale-[0.97] transition-transform"
                style={{
                  background: "linear-gradient(135deg, #b71c1c 0%, #ff8a80 50%, #b71c1c 100%)",
                  boxShadow: "0 4px 16px rgba(229,57,53,0.4)",
                }}
              >
                <ArrowDownCircle className="w-4 h-4 text-white" />
                <span className="text-sm font-bold text-white">充值</span>
              </button>
              <button
                onClick={() => setModal("cny-withdraw")}
                className="flex items-center justify-center space-x-2 py-2.5 rounded-xl active:scale-[0.97] transition-transform"
                style={{
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(229,57,53,0.5)",
                }}
              >
                <ArrowUpCircle className="w-4 h-4" style={{ color: "#ff8a80" }} />
                <span className="text-sm font-bold" style={{ color: "#ff8a80" }}>提现</span>
              </button>
            </div>

            {/* CNY 最近流水 */}
            {recentCnyTx.length > 0 ? (
              <div className="mt-4 pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                <div className="space-y-0">
                  {recentCnyTx.map((tx, idx) => (
                    <div
                      key={tx.id}
                      className="flex items-center justify-between py-2"
                      style={{
                        borderBottom: idx < recentCnyTx.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                      }}
                    >
                      <div>
                        <div className="text-xs font-medium" style={{ color: "rgba(255,255,255,0.75)" }}>
                          {tx.note || (tx.isIn ? "充值" : "提现")}
                        </div>
                        <div className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>{formatTime(tx.createdAt)}</div>
                      </div>
                      <div className="text-xs font-bold tabular-nums" style={{ color: tx.isIn ? "#4ade80" : "#f87171" }}>
                        {tx.isIn ? "+" : "-"}
                        {hideBalance ? "••••" : tx.amount.toFixed(2)} CNY
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mt-4 pt-3 text-center text-xs" style={{ borderTop: "1px solid rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.2)" }}>
                暂无交易记录
              </div>
            )}
          </div>
          <div className="absolute inset-x-0 bottom-0 h-px" style={{ background: "rgba(0,0,0,0.5)" }} />
        </div>

        {/* ── 积分余额卡片 ── */}
        <div
          className="relative rounded-2xl overflow-hidden"
          style={{
            background: "linear-gradient(135deg, #111111 0%, #2a2a2a 45%, #1a1a1a 100%)",
            boxShadow: "0 4px 16px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)",
            border: "1px solid rgba(201,168,76,0.3)",
          }}
        >
          <GoldLine />
          <div className="relative flex items-center justify-between px-5 py-4">
            <div className="flex items-center space-x-3">
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center"
                style={{
                  background: "radial-gradient(circle at 35% 35%, #FFD700 0%, #C9A84C 50%, #7A5C00 100%)",
                  boxShadow: "0 2px 8px rgba(201,168,76,0.4)",
                }}
              >
                <Coins className="w-4 h-4 text-black" />
              </div>
              <div>
                <div className="text-xs" style={{ color: "rgba(245,215,142,0.5)" }}>SNT 积分</div>
                <div className="text-lg font-bold tabular-nums" style={{ color: "#F5D78E" }}>
                  {hideBalance ? "••••" : points.toLocaleString()}
                </div>
              </div>
            </div>
            <button
              onClick={() => setLocation("/parent/points")}
              className="flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-medium active:scale-[0.97] transition-transform"
              style={{
                background: "rgba(201,168,76,0.12)",
                border: "1px solid rgba(201,168,76,0.3)",
                color: "#C9A84C",
              }}
            >
              <span>积分中心</span>
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* ── 收款账户快捷入口 ── */}
        <div
          className="rounded-xl px-4 py-3 cursor-pointer active:opacity-80 transition-opacity"
          style={{
            background: "linear-gradient(135deg, rgba(201,168,76,0.08) 0%, rgba(201,168,76,0.04) 100%)",
            border: "1px solid rgba(201,168,76,0.25)",
          }}
          onClick={() => { sessionStorage.setItem("payment_accounts_back", "/wallet"); setLocation("/payment-accounts"); }}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{ background: "linear-gradient(135deg, #C9A84C 0%, #F5D78E 100%)" }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <rect x="2" y="5" width="20" height="14" rx="2" stroke="#1a1a1a" strokeWidth="2"/>
                  <path d="M2 10h20" stroke="#1a1a1a" strokeWidth="2"/>
                  <path d="M6 15h4" stroke="#1a1a1a" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </div>
              <span className="text-sm font-semibold" style={{ color: "#F5D78E" }}>收款账户</span>
            </div>
            <div className="flex items-center gap-1" style={{ color: "rgba(201,168,76,0.5)" }}>
              <span className="text-xs">管理绑定</span>
              <ChevronRight className="w-3 h-3" />
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: "银行卡", color1: "#FFE57A", color2: "#C9A84C", color3: "#7A5C10", shadow: "rgba(201,168,76,0.5)", char: null, isBank: true },
              { label: "支付宝", color1: "#69B8FF", color2: "#1677FF", color3: "#003A8C", shadow: "rgba(22,119,255,0.5)", char: "支", isBank: false },
              { label: "微信", color1: "#73D13D", color2: "#07C160", color3: "#004D1A", shadow: "rgba(7,193,96,0.5)", char: "微", isBank: false },
              { label: "数字钱包", color1: "#CE93D8", color2: "#7E57C2", color3: "#311B92", shadow: "rgba(126,87,194,0.5)", char: null, isWallet: true },
            ].map((item, i) => (
              <div key={i} className="flex flex-col items-center gap-1.5">
                <svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 32 32" style={{ filter: `drop-shadow(0px 2px 5px ${item.shadow})` }}>
                  <defs>
                    <radialGradient id={`grad-${i}`} cx="38%" cy="30%" r="65%">
                      <stop offset="0%" stopColor={item.color1}/>
                      <stop offset="45%" stopColor={item.color2}/>
                      <stop offset="100%" stopColor={item.color3}/>
                    </radialGradient>
                    <radialGradient id={`shine-${i}`} cx="35%" cy="25%" r="50%">
                      <stop offset="0%" stopColor="rgba(255,255,255,0.55)"/>
                      <stop offset="100%" stopColor="rgba(255,255,255,0)"/>
                    </radialGradient>
                    <clipPath id={`clip-${i}`}><circle cx="16" cy="16" r="15"/></clipPath>
                  </defs>
                  <circle cx="16" cy="16" r="15" fill={`url(#grad-${i})`}/>
                  <g clipPath={`url(#clip-${i})`}>
                    {item.char && <text x="16" y="21" textAnchor="middle" fontSize="13" fontWeight="bold" fill="rgba(255,255,255,0.95)" fontFamily="sans-serif">{item.char}</text>}
                    {item.isBank && <g fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="1.5"><rect x="6" y="10" width="20" height="13" rx="2"/><line x1="6" y1="15" x2="26" y2="15"/><line x1="9" y1="19" x2="14" y2="19" strokeLinecap="round"/></g>}
                    {item.isWallet && <g fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="1.5"><rect x="5" y="11" width="22" height="12" rx="2"/><circle cx="21" cy="17" r="2" fill="rgba(255,255,255,0.9)" stroke="none"/><line x1="5" y1="15" x2="27" y2="15"/></g>}
                  </g>
                  <circle cx="16" cy="16" r="15" fill={`url(#shine-${i})`}/>
                  <circle cx="16" cy="16" r="15" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="0.8"/>
                </svg>
                <span className="text-xs" style={{ color: "rgba(201,168,76,0.7)" }}>{item.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── 安全提示 ── */}
        <div
          className="rounded-xl px-4 py-3 text-xs space-y-1"
          style={{
            background: "rgba(201,168,76,0.06)",
            border: "1px solid rgba(201,168,76,0.15)",
            color: "rgba(201,168,76,0.5)",
          }}
        >
          <div className="font-semibold" style={{ color: "rgba(201,168,76,0.7)" }}>安全提示</div>
          <div>· USDT 充值请确认链上地址，谨防钓鱼</div>
          <div>· 人民币充值请通过官方收款账户转账</div>
          <div>· 提现到账时间约 1-3 个工作日</div>
          <div>· 如有疑问请联系客服</div>
        </div>
      </div>

      {/* ── USDT 充值弹窗 ── */}
      {modal === "recharge" && (
        <BottomSheet title="USDT 充值" onClose={() => setModal(null)}>
          <Recharge hideHeader hideBalance />
        </BottomSheet>
      )}

      {/* ── USDT 提现弹窗 ── */}
      {modal === "withdraw" && (
        <BottomSheet title="USDT 提现" onClose={() => setModal(null)}>
          <Withdraw hideHeader />
        </BottomSheet>
      )}

      {/* ── CNY 充值弹窗 ── */}
      {modal === "cny-recharge" && (
        <BottomSheet
          title="人民币充值"
          onClose={() => setModal(null)}
          accentColor="#ff8a80"
          borderColor="rgba(229,57,53,0.3)"
        >
          <CnyRechargeContent onClose={() => setModal(null)} />
        </BottomSheet>
      )}

      {/* ── CNY 提现弹窗 ── */}
      {modal === "cny-withdraw" && (
        <BottomSheet
          title="人民币提现"
          onClose={() => setModal(null)}
          accentColor="#ff8a80"
          borderColor="rgba(229,57,53,0.3)"
        >
          <CnyWithdrawContent
            cnyBalance={cnyBalance}
            onClose={() => setModal(null)}
            onSuccess={() => cnyBalanceQuery.refetch()}
          />
        </BottomSheet>
      )}
    </div>
  );
}
