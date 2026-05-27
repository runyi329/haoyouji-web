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
  RefreshCw,
  TrendingUp,
} from "lucide-react";
import { trpc } from "../lib/trpc";
import Recharge from "./Recharge";
import Withdraw from "./Withdraw";

type ModalType = "recharge" | "withdraw" | "cny-recharge" | "cny-withdraw" | null;

function StatusIcon({ status }: { status: string }) {
  if (status === "completed" || status === "approved")
    return <CheckCircle2 className="w-3.5 h-3.5" style={{ color: "#10b981" }} />;
  if (status === "pending" || status === "processing")
    return <Clock className="w-3.5 h-3.5" style={{ color: "#f59e0b" }} />;
  if (status === "rejected" || status === "failed")
    return <XCircle className="w-3.5 h-3.5" style={{ color: "#ef4444" }} />;
  return <Clock className="w-3.5 h-3.5" style={{ color: "#9ca3af" }} />;
}

function statusText(status: string) {
  const map: Record<string, string> = {
    completed: "已完成", approved: "已完成",
    pending: "处理中", processing: "处理中",
    rejected: "已拒绝", failed: "已失败",
  };
  return map[status] ?? status;
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return `今天 ${d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`;
  if (days === 1) return `昨天 ${d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`;
  if (days < 7) return `${days}天前`;
  return d.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
}

// 底部弹窗
function BottomSheet({ title, onClose, children }: {
  title: string; onClose: () => void; children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "rgba(0,0,0,0.5)" }}>
      <div
        className="rounded-t-3xl mt-auto overflow-hidden"
        style={{
          background: "#fff",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <span className="text-base font-semibold text-gray-800">{title}</span>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 text-lg">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// CNY 充值弹窗
function CnyRechargeContent({ onClose }: { onClose: () => void }) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [submitted, setSubmitted] = useState(false);

  if (submitted) {
    return (
      <div className="px-5 py-10 flex flex-col items-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center">
          <CheckCircle2 className="w-9 h-9 text-green-500" />
        </div>
        <div className="text-base font-semibold text-gray-800">充值申请已提交</div>
        <div className="text-sm text-center text-gray-400">请按照收款信息完成转账，到账后将自动更新余额</div>
        <button onClick={onClose} className="w-full py-3 rounded-xl bg-gray-100 text-gray-600 text-sm font-medium">关闭</button>
      </div>
    );
  }

  return (
    <div className="px-5 pb-8 pt-4 space-y-4">
      <div className="rounded-2xl bg-blue-50 p-4 space-y-2.5">
        <div className="text-xs font-semibold text-blue-600 mb-1">收款信息</div>
        {[
          { label: "收款账户", value: "招商银行 6214 **** **** 8888" },
          { label: "收款人", value: "张三" },
          { label: "转账备注", value: "请务必填写您的用户ID" },
        ].map(({ label, value }) => (
          <div key={label} className="flex justify-between text-sm">
            <span className="text-gray-400">{label}</span>
            <span className="text-gray-700 font-medium">{value}</span>
          </div>
        ))}
      </div>

      <div>
        <div className="text-xs text-gray-400 mb-1.5">充值金额（元）</div>
        <div className="flex items-center rounded-xl border border-gray-200 px-4 py-3 bg-gray-50">
          <span className="text-lg font-bold text-blue-500 mr-2">¥</span>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="flex-1 bg-transparent text-xl font-bold outline-none tabular-nums text-gray-800"
          />
        </div>
      </div>

      <div>
        <div className="text-xs text-gray-400 mb-1.5">备注（可选）</div>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="如有特殊说明请填写"
          className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none text-gray-700"
        />
      </div>

      <button
        onClick={() => {
          if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) { alert("请输入有效金额"); return; }
          setSubmitted(true);
        }}
        className="w-full py-3.5 rounded-xl text-sm font-bold text-white active:scale-[0.98] transition-transform"
        style={{ background: "linear-gradient(135deg, #1677FF 0%, #4096ff 100%)" }}
      >
        提交充值申请
      </button>
    </div>
  );
}

// CNY 提现弹窗
function CnyWithdrawContent({ cnyBalance, onClose }: { cnyBalance: number; onClose: () => void }) {
  const [amount, setAmount] = useState("");
  const [bankInfo, setBankInfo] = useState("");
  const [submitted, setSubmitted] = useState(false);

  if (submitted) {
    return (
      <div className="px-5 py-10 flex flex-col items-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center">
          <CheckCircle2 className="w-9 h-9 text-green-500" />
        </div>
        <div className="text-base font-semibold text-gray-800">提现申请已提交</div>
        <div className="text-sm text-center text-gray-400">预计 1-3 个工作日到账</div>
        <button onClick={onClose} className="w-full py-3 rounded-xl bg-gray-100 text-gray-600 text-sm font-medium">关闭</button>
      </div>
    );
  }

  return (
    <div className="px-5 pb-8 pt-4 space-y-4">
      <div className="rounded-2xl bg-gray-50 border border-gray-200 px-4 py-3 flex items-center justify-between">
        <span className="text-sm text-gray-400">可用余额</span>
        <span className="text-base font-bold text-gray-800">¥ {cnyBalance.toFixed(2)}</span>
      </div>

      <div>
        <div className="text-xs text-gray-400 mb-1.5">提现金额（元）</div>
        <div className="flex items-center rounded-xl border border-gray-200 px-4 py-3 bg-gray-50">
          <span className="text-lg font-bold text-blue-500 mr-2">¥</span>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="flex-1 bg-transparent text-xl font-bold outline-none tabular-nums text-gray-800"
          />
          <button
            onClick={() => setAmount(cnyBalance.toFixed(2))}
            className="text-xs px-2.5 py-1 rounded-lg bg-blue-50 text-blue-500 font-medium ml-2"
          >全部</button>
        </div>
      </div>

      <div>
        <div className="text-xs text-gray-400 mb-1.5">收款账户信息</div>
        <textarea
          value={bankInfo}
          onChange={(e) => setBankInfo(e.target.value)}
          placeholder="请填写银行卡号、开户行、户名等信息"
          rows={3}
          className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none resize-none text-gray-700"
        />
      </div>

      <button
        onClick={() => {
          const num = Number(amount);
          if (!amount || isNaN(num) || num <= 0) { alert("请输入有效金额"); return; }
          if (num > cnyBalance) { alert("提现金额不能超过可用余额"); return; }
          if (!bankInfo.trim()) { alert("请填写收款账户信息"); return; }
          setSubmitted(true);
        }}
        className="w-full py-3.5 rounded-xl text-sm font-bold text-white active:scale-[0.98] transition-transform"
        style={{ background: "linear-gradient(135deg, #1677FF 0%, #4096ff 100%)" }}
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

  const balanceQuery = trpc.recharge.getBalance.useQuery();
  const recentRechargeQuery = trpc.recharge.getMyOrders.useQuery({ limit: 3 });
  const recentWithdrawQuery = trpc.recharge.getMyWithdrawHistory.useQuery({ limit: 3 });
  const recentManualQuery = trpc.recharge.getMyManualBalances.useQuery({ limit: 3 });
  const cnyBalanceQuery = trpc.recharge.getCnyBalance.useQuery();
  const cnyHistoryQuery = trpc.recharge.getCnyHistory.useQuery({ limit: 3 });

  const balance = typeof balanceQuery.data === "number" ? balanceQuery.data : 0;
  const cnyBalance = typeof cnyBalanceQuery.data === "number" ? cnyBalanceQuery.data : 0;
  const usdtToCny = balance * 7.25;
  const totalCny = usdtToCny + cnyBalance;

  const recentUsdtTx = (() => {
    const recharges = (recentRechargeQuery.data ?? []).map((r: any) => ({
      id: `r-${r.id}`, type: "recharge" as const,
      amount: Number(r.amount), status: r.status, createdAt: r.createdAt,
    }));
    const withdraws = (recentWithdrawQuery.data ?? []).map((w: any) => ({
      id: `w-${w.id}`, type: "withdraw" as const,
      amount: Number(w.amount), status: w.status, createdAt: w.createdAt,
    }));
    const manuals = (recentManualQuery.data ?? [])
      .filter((m: any) => !(m.note || "").startsWith("[CNY]"))
      .map((m: any) => ({
        id: `m-${m.id}`,
        type: (Number(m.amount) > 0 ? "reward" : "deduct") as "reward" | "deduct",
        amount: Math.abs(Number(m.amount)), status: "completed" as const,
        createdAt: m.created_at,
      }));
    return [...recharges, ...withdraws, ...manuals]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 3);
  })();

  const recentCnyTx = (cnyHistoryQuery.data ?? []).slice(0, 3).map((m: any) => ({
    id: `cny-${m.id}`,
    amount: Math.abs(Number(m.amount)),
    isIn: Number(m.amount) > 0,
    note: (m.note || "").replace(/^\[CNY\]/, ""),
    createdAt: m.created_at,
  }));

  const mask = (v: string) => hideBalance ? "••••••" : v;

  return (
    <div className="min-h-screen" style={{ background: "#F5F7FA" }}>

      {/* ── 顶部 Hero（深蓝渐变） ── */}
      <div
        className="relative px-5 pt-12 pb-8"
        style={{
          background: "linear-gradient(145deg, #0f2460 0%, #1a3a8f 50%, #1e4fd8 100%)",
        }}
      >
        {/* 导航行 */}
        <div className="flex items-center justify-between mb-8">
          <button
            onClick={() => setLocation("/")}
            className="w-9 h-9 rounded-full flex items-center justify-center"
            style={{ background: "rgba(255,255,255,0.12)" }}
          >
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <span className="text-base font-semibold text-white tracking-wide">我的钱包</span>
          <button
            onClick={() => setHideBalance((v) => !v)}
            className="w-9 h-9 rounded-full flex items-center justify-center"
            style={{ background: "rgba(255,255,255,0.12)" }}
          >
            {hideBalance
              ? <EyeOff className="w-4 h-4 text-white opacity-70" />
              : <Eye className="w-4 h-4 text-white opacity-70" />
            }
          </button>
        </div>

        {/* 总资产 */}
        <div className="text-center">
          <div className="text-sm text-white/50 mb-2">总资产（折合人民币）</div>
          <div className="flex items-baseline justify-center space-x-1 mb-1">
            <span className="text-2xl font-light text-white/80">¥</span>
            <span className="text-5xl font-bold text-white tabular-nums tracking-tight">
              {mask(totalCny.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }))}
            </span>
          </div>
          {!hideBalance && (
            <div className="flex items-center justify-center space-x-3 mt-3">
              <div className="flex items-center space-x-1.5">
                <div className="w-2 h-2 rounded-full" style={{ background: "#F0B90B" }} />
                <span className="text-xs text-white/50">USDT ≈ ¥{usdtToCny.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              <div className="w-px h-3 bg-white/20" />
              <div className="flex items-center space-x-1.5">
                <div className="w-2 h-2 rounded-full" style={{ background: "#1677FF" }} />
                <span className="text-xs text-white/50">CNY ¥{cnyBalance.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            </div>
          )}
        </div>

        {/* 底部圆角过渡 */}
        <div
          className="absolute bottom-0 left-0 right-0 h-6 rounded-t-none"
          style={{ background: "#F5F7FA", borderRadius: "24px 24px 0 0", marginBottom: "-1px" }}
        />
      </div>

      {/* ── 账户卡片区 ── */}
      <div className="px-4 pb-24 space-y-3 -mt-1">

        {/* USDT 账户卡片 */}
        <div
          className="bg-white rounded-2xl overflow-hidden"
          style={{ boxShadow: "0 2px 16px rgba(0,0,0,0.06)" }}
        >
          {/* 左侧色条 */}
          <div className="flex">
            <div className="w-1 flex-shrink-0 rounded-l-2xl" style={{ background: "#F0B90B" }} />
            <div className="flex-1 p-4">
              {/* 标题行 */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-2.5">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                    style={{ background: "#FFF8E1", color: "#F0B90B", border: "1.5px solid #F0B90B" }}
                  >$</div>
                  <span className="text-sm font-semibold text-gray-700">USDT 账户</span>
                </div>
                <div className="flex items-center space-x-1.5">
                  <button
                    onClick={() => setLocation("/wallet/transactions")}
                    className="flex items-center space-x-0.5 px-2.5 h-7 rounded-full text-xs font-medium text-gray-500 bg-gray-100"
                  >
                    <span>明细</span>
                    <ChevronRight className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => balanceQuery.refetch()}
                    className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-gray-400" />
                  </button>
                </div>
              </div>

              {/* 余额 */}
              <div className="mb-3">
                <div className="flex items-baseline space-x-1.5">
                  <span className="text-3xl font-bold tabular-nums text-gray-800">
                    {mask(balance.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }))}
                  </span>
                  <span className="text-sm text-gray-400 font-medium">USDT</span>
                </div>
                {!hideBalance && (
                  <div className="text-xs text-gray-400 mt-0.5 flex items-center space-x-1">
                    <TrendingUp className="w-3 h-3" />
                    <span>≈ ¥{usdtToCny.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} 人民币</span>
                  </div>
                )}
              </div>

              {/* 操作按钮 */}
              <div className="grid grid-cols-2 gap-2.5 mb-3">
                <button
                  onClick={() => setModal("recharge")}
                  className="flex items-center justify-center space-x-1.5 py-2.5 rounded-xl text-sm font-semibold active:scale-[0.97] transition-transform"
                  style={{ background: "#F0B90B", color: "#000" }}
                >
                  <ArrowDownCircle className="w-4 h-4" />
                  <span>充值</span>
                </button>
                <button
                  onClick={() => setModal("withdraw")}
                  className="flex items-center justify-center space-x-1.5 py-2.5 rounded-xl text-sm font-semibold border active:scale-[0.97] transition-transform"
                  style={{ borderColor: "#F0B90B", color: "#d4a017", background: "#FFFDE7" }}
                >
                  <ArrowUpCircle className="w-4 h-4" />
                  <span>提现</span>
                </button>
              </div>

              {/* 最近流水 */}
              {recentUsdtTx.length > 0 && (
                <div className="border-t border-gray-100 pt-3 space-y-0">
                  {recentUsdtTx.map((tx, idx) => (
                    <div
                      key={tx.id}
                      className="flex items-center justify-between py-2"
                      style={{ borderBottom: idx < recentUsdtTx.length - 1 ? "1px solid #f3f4f6" : "none" }}
                    >
                      <div>
                        <div className="text-xs font-medium text-gray-600">
                          {tx.type === "recharge" ? "充值" : tx.type === "withdraw" ? "提现" : tx.type === "reward" ? "奖励" : "扣费"}
                        </div>
                        <div className="text-xs text-gray-400">{formatTime(tx.createdAt)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-bold tabular-nums"
                          style={{ color: (tx.type === "recharge" || tx.type === "reward") ? "#10b981" : "#ef4444" }}>
                          {(tx.type === "recharge" || tx.type === "reward") ? "+" : "-"}
                          {mask(tx.amount.toFixed(2))} USDT
                        </div>
                        <div className="flex items-center justify-end space-x-0.5 mt-0.5">
                          <StatusIcon status={tx.status} />
                          <span className="text-xs text-gray-400">{statusText(tx.status)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* CNY 账户卡片 */}
        <div
          className="bg-white rounded-2xl overflow-hidden"
          style={{ boxShadow: "0 2px 16px rgba(0,0,0,0.06)" }}
        >
          <div className="flex">
            <div className="w-1 flex-shrink-0 rounded-l-2xl" style={{ background: "#1677FF" }} />
            <div className="flex-1 p-4">
              {/* 标题行 */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-2.5">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                    style={{ background: "#E6F4FF", color: "#1677FF", border: "1.5px solid #1677FF" }}
                  >¥</div>
                  <span className="text-sm font-semibold text-gray-700">人民币账户</span>
                </div>
                <div className="flex items-center space-x-1.5">
                  <button
                    onClick={() => setLocation("/wallet/cny-transactions")}
                    className="flex items-center space-x-0.5 px-2.5 h-7 rounded-full text-xs font-medium text-gray-500 bg-gray-100"
                  >
                    <span>明细</span>
                    <ChevronRight className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => cnyBalanceQuery.refetch()}
                    className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-gray-400" />
                  </button>
                </div>
              </div>

              {/* 余额 */}
              <div className="mb-3">
                <div className="flex items-baseline space-x-1.5">
                  <span className="text-3xl font-bold tabular-nums text-gray-800">
                    {mask(cnyBalance.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }))}
                  </span>
                  <span className="text-sm text-gray-400 font-medium">CNY</span>
                </div>
                {!hideBalance && (
                  <div className="text-xs text-gray-400 mt-0.5">人民币本位，无需折算</div>
                )}
              </div>

              {/* 操作按钮 */}
              <div className="grid grid-cols-2 gap-2.5 mb-3">
                <button
                  onClick={() => setModal("cny-recharge")}
                  className="flex items-center justify-center space-x-1.5 py-2.5 rounded-xl text-sm font-semibold text-white active:scale-[0.97] transition-transform"
                  style={{ background: "#1677FF" }}
                >
                  <ArrowDownCircle className="w-4 h-4" />
                  <span>充值</span>
                </button>
                <button
                  onClick={() => setModal("cny-withdraw")}
                  className="flex items-center justify-center space-x-1.5 py-2.5 rounded-xl text-sm font-semibold border active:scale-[0.97] transition-transform"
                  style={{ borderColor: "#1677FF", color: "#1677FF", background: "#E6F4FF" }}
                >
                  <ArrowUpCircle className="w-4 h-4" />
                  <span>提现</span>
                </button>
              </div>

              {/* CNY 最近流水 */}
              {recentCnyTx.length > 0 ? (
                <div className="border-t border-gray-100 pt-3 space-y-0">
                  {recentCnyTx.map((tx, idx) => (
                    <div
                      key={tx.id}
                      className="flex items-center justify-between py-2"
                      style={{ borderBottom: idx < recentCnyTx.length - 1 ? "1px solid #f3f4f6" : "none" }}
                    >
                      <div>
                        <div className="text-xs font-medium text-gray-600">
                          {tx.note || (tx.isIn ? "充值" : "提现")}
                        </div>
                        <div className="text-xs text-gray-400">{formatTime(tx.createdAt)}</div>
                      </div>
                      <div
                        className="text-xs font-bold tabular-nums"
                        style={{ color: tx.isIn ? "#10b981" : "#ef4444" }}
                      >
                        {tx.isIn ? "+" : "-"}{mask(tx.amount.toFixed(2))} CNY
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="border-t border-gray-100 pt-3 text-center text-xs text-gray-300 py-3">
                  暂无交易记录
                </div>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* ── 弹窗 ── */}
      {modal === "recharge" && (
        <div className="fixed inset-0 z-50">
          <Recharge onClose={() => setModal(null)} />
        </div>
      )}
      {modal === "withdraw" && (
        <div className="fixed inset-0 z-50">
          <Withdraw onClose={() => setModal(null)} />
        </div>
      )}
      {modal === "cny-recharge" && (
        <BottomSheet title="人民币充值" onClose={() => setModal(null)}>
          <CnyRechargeContent onClose={() => setModal(null)} />
        </BottomSheet>
      )}
      {modal === "cny-withdraw" && (
        <BottomSheet title="人民币提现" onClose={() => setModal(null)}>
          <CnyWithdrawContent cnyBalance={cnyBalance} onClose={() => setModal(null)} />
        </BottomSheet>
      )}
    </div>
  );
}
