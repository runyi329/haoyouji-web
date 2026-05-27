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
  Wallet as WalletIcon,
} from "lucide-react";
import { trpc } from "../lib/trpc";
import Recharge from "./Recharge";
import Withdraw from "./Withdraw";

// ─── 黑金色系 Token ───────────────────────────────────────────
const G = {
  bg: "#0d0d0d",          // 页面底色
  card: "#141414",        // 卡片底色
  cardBorder: "rgba(201,168,76,0.22)", // 卡片边框
  gold: "#C9A84C",        // 主金色
  goldLight: "#F5D78E",   // 亮金色
  goldDim: "rgba(201,168,76,0.45)",
  goldFaint: "rgba(201,168,76,0.12)",
  white: "rgba(255,255,255,0.88)",
  whiteDim: "rgba(255,255,255,0.45)",
  whiteFaint: "rgba(255,255,255,0.08)",
  divider: "rgba(255,255,255,0.06)",
  green: "#34d399",       // 入账绿
  red: "#f87171",         // 出账红
};

type ModalType = "recharge" | "withdraw" | "cny-recharge" | "cny-withdraw" | null;

function StatusIcon({ status }: { status: string }) {
  if (status === "completed" || status === "approved")
    return <CheckCircle2 className="w-3.5 h-3.5" style={{ color: G.green }} />;
  if (status === "pending" || status === "processing")
    return <Clock className="w-3.5 h-3.5" style={{ color: "#fbbf24" }} />;
  if (status === "rejected" || status === "failed")
    return <XCircle className="w-3.5 h-3.5" style={{ color: G.red }} />;
  return <Clock className="w-3.5 h-3.5" style={{ color: G.whiteDim }} />;
}

function statusText(s: string) {
  return ({ completed: "已完成", approved: "已完成", pending: "处理中", processing: "处理中", rejected: "已拒绝", failed: "已失败" } as any)[s] ?? s;
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days === 0) return `今天 ${d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`;
  if (days === 1) return `昨天 ${d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`;
  if (days < 7) return `${days}天前`;
  return d.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
}

// 底部弹窗（黑金风）
function BottomSheet({ title, onClose, children }: {
  title: string; onClose: () => void; children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "rgba(0,0,0,0.75)" }}>
      <div
        className="rounded-t-3xl mt-auto overflow-hidden"
        style={{
          background: "linear-gradient(160deg, #111 0%, #1c1c1c 100%)",
          border: `1px solid ${G.cardBorder}`,
          borderBottom: "none",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        {/* 拖拽条 */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full" style={{ background: G.goldFaint }} />
        </div>
        {/* 标题行 */}
        <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: `1px solid ${G.divider}` }}>
          <span className="text-base font-semibold" style={{ color: G.goldLight }}>{title}</span>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-lg"
            style={{ background: G.whiteFaint, color: G.whiteDim }}
          >×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// 金色输入框
function GoldInput({ label, value, onChange, placeholder, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder: string; type?: string;
}) {
  return (
    <div>
      <div className="text-xs mb-1.5" style={{ color: G.whiteDim }}>{label}</div>
      <div
        className="flex items-center rounded-xl px-4 py-3"
        style={{ background: G.whiteFaint, border: `1px solid rgba(201,168,76,0.2)` }}
      >
        {type === "number" && (
          <span className="text-lg font-bold mr-2" style={{ color: G.goldDim }}>¥</span>
        )}
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 bg-transparent outline-none tabular-nums"
          style={{
            color: G.white,
            fontSize: type === "number" ? "1.25rem" : "0.875rem",
            fontWeight: type === "number" ? 700 : 400,
          }}
        />
      </div>
    </div>
  );
}

// 金色主按钮
function GoldBtn({ children, onClick, disabled }: {
  children: React.ReactNode; onClick: () => void; disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full py-3.5 rounded-xl text-sm font-bold active:scale-[0.98] transition-transform disabled:opacity-50"
      style={{
        background: `linear-gradient(135deg, ${G.gold} 0%, ${G.goldLight} 50%, ${G.gold} 100%)`,
        boxShadow: "0 4px 16px rgba(201,168,76,0.35)",
        color: "#000",
      }}
    >{children}</button>
  );
}

// 成功状态
function SuccessState({ msg, sub, onClose }: { msg: string; sub: string; onClose: () => void }) {
  return (
    <div className="px-5 py-10 flex flex-col items-center space-y-4">
      <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: "rgba(52,211,153,0.12)" }}>
        <CheckCircle2 className="w-9 h-9" style={{ color: G.green }} />
      </div>
      <div className="text-base font-semibold" style={{ color: G.white }}>{msg}</div>
      <div className="text-sm text-center" style={{ color: G.whiteDim }}>{sub}</div>
      <button
        onClick={onClose}
        className="w-full py-3 rounded-xl text-sm font-medium"
        style={{ background: G.whiteFaint, color: G.whiteDim }}
      >关闭</button>
    </div>
  );
}

// CNY 充值弹窗
function CnyRechargeContent({ onClose }: { onClose: () => void }) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [submitted, setSubmitted] = useState(false);

  if (submitted) return <SuccessState msg="充值申请已提交" sub="请按照收款信息完成转账，到账后将自动更新余额" onClose={onClose} />;

  return (
    <div className="px-5 pb-8 pt-4 space-y-4">
      {/* 收款信息卡 */}
      <div className="rounded-2xl p-4 space-y-2.5" style={{ background: G.goldFaint, border: `1px solid rgba(201,168,76,0.25)` }}>
        <div className="text-xs font-semibold mb-1" style={{ color: G.goldDim }}>收款信息</div>
        {[
          { label: "收款账户", value: "招商银行 6214 **** **** 8888" },
          { label: "收款人", value: "张三" },
          { label: "转账备注", value: "请务必填写您的用户ID" },
        ].map(({ label, value }) => (
          <div key={label} className="flex justify-between text-sm">
            <span style={{ color: G.whiteDim }}>{label}</span>
            <span style={{ color: G.white, fontWeight: 500 }}>{value}</span>
          </div>
        ))}
      </div>

      <GoldInput label="充值金额（元）" value={amount} onChange={setAmount} placeholder="0.00" type="number" />
      <GoldInput label="备注（可选）" value={note} onChange={setNote} placeholder="如有特殊说明请填写" />

      <GoldBtn onClick={() => {
        if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) { alert("请输入有效金额"); return; }
        setSubmitted(true);
      }}>提交充值申请</GoldBtn>
    </div>
  );
}

// CNY 提现弹窗
function CnyWithdrawContent({ cnyBalance, onClose }: { cnyBalance: number; onClose: () => void }) {
  const [amount, setAmount] = useState("");
  const [bankInfo, setBankInfo] = useState("");
  const [submitted, setSubmitted] = useState(false);

  if (submitted) return <SuccessState msg="提现申请已提交" sub="预计 1-3 个工作日到账" onClose={onClose} />;

  return (
    <div className="px-5 pb-8 pt-4 space-y-4">
      {/* 可用余额 */}
      <div
        className="rounded-xl px-4 py-3 flex items-center justify-between"
        style={{ background: G.whiteFaint, border: `1px solid rgba(201,168,76,0.15)` }}
      >
        <span className="text-sm" style={{ color: G.whiteDim }}>可用余额</span>
        <span className="text-base font-bold" style={{ color: G.goldLight }}>¥ {cnyBalance.toFixed(2)}</span>
      </div>

      {/* 金额输入 */}
      <div>
        <div className="text-xs mb-1.5" style={{ color: G.whiteDim }}>提现金额（元）</div>
        <div
          className="flex items-center rounded-xl px-4 py-3"
          style={{ background: G.whiteFaint, border: `1px solid rgba(201,168,76,0.2)` }}
        >
          <span className="text-lg font-bold mr-2" style={{ color: G.goldDim }}>¥</span>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="flex-1 bg-transparent text-xl font-bold outline-none tabular-nums"
            style={{ color: G.white }}
          />
          <button
            onClick={() => setAmount(cnyBalance.toFixed(2))}
            className="text-xs px-2.5 py-1 rounded-lg ml-2 font-medium"
            style={{ background: G.goldFaint, color: G.gold }}
          >全部</button>
        </div>
      </div>

      {/* 收款账户 */}
      <div>
        <div className="text-xs mb-1.5" style={{ color: G.whiteDim }}>收款账户信息</div>
        <textarea
          value={bankInfo}
          onChange={(e) => setBankInfo(e.target.value)}
          placeholder="请填写银行卡号、开户行、户名等信息"
          rows={3}
          className="w-full rounded-xl px-4 py-3 text-sm outline-none resize-none"
          style={{
            background: G.whiteFaint,
            border: `1px solid rgba(201,168,76,0.2)`,
            color: G.white,
          }}
        />
      </div>

      <GoldBtn onClick={() => {
        const num = Number(amount);
        if (!amount || isNaN(num) || num <= 0) { alert("请输入有效金额"); return; }
        if (num > cnyBalance) { alert("提现金额不能超过可用余额"); return; }
        if (!bankInfo.trim()) { alert("请填写收款账户信息"); return; }
        setSubmitted(true);
      }}>提交提现申请</GoldBtn>
    </div>
  );
}

// ─── 主页面 ──────────────────────────────────────────────────
export default function Wallet() {
  const [, setLocation] = useLocation();
  const [modal, setModal] = useState<ModalType>(null);
  const [hideBalance, setHideBalance] = useState(false);
  const [activeTab, setActiveTab] = useState<"usdt" | "cny">("usdt");

  const balanceQuery = trpc.recharge.getBalance.useQuery();
  const recentRechargeQuery = trpc.recharge.getMyOrders.useQuery({ limit: 3 });
  const recentWithdrawQuery = trpc.recharge.getMyWithdrawHistory.useQuery({ limit: 3 });
  const recentManualQuery = trpc.recharge.getMyManualBalances.useQuery({ limit: 3 });
  const cnyBalanceQuery = trpc.recharge.getCnyBalance.useQuery();
  const cnyHistoryQuery = trpc.recharge.getCnyHistory.useQuery({ limit: 3 });

  const balance = typeof balanceQuery.data === "number" ? balanceQuery.data : 0;
  const cnyBalance = typeof cnyBalanceQuery.data === "number" ? cnyBalanceQuery.data : 0;
  const usdtToCny = balance * 7.25;

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

  // 账户卡片通用渲染
  const AccountCard = ({
    icon, label, balance: bal, unit, subLine,
    txPath, onRefresh, onRecharge, onWithdraw,
    txList, isUsdt,
  }: {
    icon: string; label: string; balance: string; unit: string; subLine?: React.ReactNode;
    txPath: string; onRefresh: () => void; onRecharge: () => void; onWithdraw: () => void;
    txList: React.ReactNode; isUsdt: boolean;
  }) => (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: G.card,
        border: `1px solid ${G.cardBorder}`,
        boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
      }}
    >
      {/* 顶部金线 */}
      <div
        className="h-px"
        style={{
          background: `linear-gradient(90deg, transparent 5%, ${G.gold} 40%, ${G.goldLight} 60%, transparent 95%)`,
        }}
      />
      <div className="p-5">
        {/* 标题行：左侧图标+名称，右侧切换胶囊 */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2.5">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
              style={{
                background: `radial-gradient(circle at 35% 35%, ${G.goldLight} 0%, ${G.gold} 50%, #6b4e0a 100%)`,
                boxShadow: `0 2px 8px rgba(201,168,76,0.4)`,
                color: "#000",
              }}
            >{icon}</div>
            <span className="text-sm font-semibold tracking-wide" style={{ color: G.goldLight }}>{label}</span>
            {/* 眼睛按钮：账户名称右边 */}
            <button
              onClick={() => setHideBalance((v) => !v)}
              className="w-6 h-6 flex items-center justify-center"
            >
              {hideBalance
                ? <EyeOff className="w-3.5 h-3.5" style={{ color: G.goldDim }} />
                : <Eye className="w-3.5 h-3.5" style={{ color: G.goldDim }} />
              }
            </button>
          </div>
          {/* 切换胶囊：卡片内右上角 */}
          <div
            className="flex items-center rounded-full p-0.5"
            style={{ background: G.whiteFaint, border: `1px solid ${G.cardBorder}` }}
          >
            {(["usdt", "cny"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className="px-3 h-6 rounded-full text-xs font-bold transition-all"
                style={{
                  background: activeTab === tab
                    ? `linear-gradient(135deg, ${G.gold} 0%, ${G.goldLight} 100%)`
                    : "transparent",
                  color: activeTab === tab ? "#000" : G.goldDim,
                  boxShadow: activeTab === tab ? "0 2px 6px rgba(201,168,76,0.4)" : "none",
                }}
              >
                {tab === "usdt" ? "USDT" : "CNY"}
              </button>
            ))}
          </div>
        </div>

        {/* 余额 */}
        <div className="mb-1">
          <div className="flex items-baseline space-x-2">
            <span
              className="tabular-nums font-bold"
              style={{
                fontSize: "2rem",
                lineHeight: 1.1,
                color: G.goldLight,
                textShadow: "0 0 20px rgba(245,215,142,0.25)",
              }}
            >{bal}</span>
            <span className="text-sm font-medium" style={{ color: G.goldDim }}>{unit}</span>
          </div>
        </div>
        {subLine && <div className="mb-4">{subLine}</div>}

        {/* 操作按钮 */}
        <div className="grid grid-cols-2 gap-2.5 mb-1">
          <button
            onClick={onRecharge}
            className="flex items-center justify-center space-x-1.5 py-2.5 rounded-xl text-sm font-bold active:scale-[0.97] transition-transform"
            style={{
              background: `linear-gradient(135deg, ${G.gold} 0%, ${G.goldLight} 50%, ${G.gold} 100%)`,
              boxShadow: "0 4px 14px rgba(201,168,76,0.35)",
              color: "#000",
            }}
          >
            <ArrowDownCircle className="w-4 h-4" />
            <span>充值</span>
          </button>
          <button
            onClick={onWithdraw}
            className="flex items-center justify-center space-x-1.5 py-2.5 rounded-xl text-sm font-bold active:scale-[0.97] transition-transform"
            style={{
              background: "transparent",
              border: `1px solid ${G.gold}`,
              color: G.goldLight,
            }}
          >
            <ArrowUpCircle className="w-4 h-4" />
            <span>提现</span>
          </button>
        </div>

        {/* 流水 */}
        {txList}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen" style={{ background: G.bg }}>

      {/* ── 顶部导航栏 ── */}
      <div
        className="relative px-4"
        style={{
          background: "linear-gradient(160deg, #0d0d0d 0%, #1a1500 60%, #0d0d0d 100%)",
          borderBottom: `1px solid ${G.cardBorder}`,
          paddingTop: "calc(env(safe-area-inset-top, 44px) + 8px)",
          paddingBottom: "8px",
        }}
      >
        <div className="flex items-center justify-between">
          {/* 返回 */}
          <button
            onClick={() => setLocation("/")}
            className="w-7 h-7 rounded-full flex items-center justify-center"
            style={{ background: G.whiteFaint, border: `1px solid ${G.cardBorder}` }}
          >
            <ArrowLeft className="w-4 h-4" style={{ color: G.goldLight }} />
          </button>

          {/* 右侧：明细 + 刷新 */}
          <div className="flex items-center space-x-1">
            <button
              onClick={() => setLocation(activeTab === "usdt" ? "/wallet/transactions" : "/wallet/cny-transactions")}
              className="px-2.5 h-6 rounded-full text-xs font-medium"
              style={{ background: G.whiteFaint, color: G.goldDim }}
            >
              明细
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-2.5 h-6 rounded-full text-xs font-medium"
              style={{ background: G.whiteFaint, color: G.goldDim }}
            >
              刷新
            </button>
          </div>
        </div>
      </div>

      {/* ── 账户卡片 ── */}
      <div className="px-4 pt-4 pb-24 space-y-3">

        {/* USDT（仅 activeTab === usdt 时显示） */}
        {activeTab === "usdt" && <AccountCard
          icon="$"
          label="USDT 账户"
          balance={mask(balance.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }))}
          unit="USDT"
          subLine={!hideBalance && (
            <div className="flex items-center space-x-1 mt-0.5" style={{ color: G.goldDim }}>
              <span className="text-xs">≈ ¥{usdtToCny.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} 人民币</span>
            </div>
          )}
          txPath="/wallet/transactions"
          onRefresh={() => balanceQuery.refetch()}
          onRecharge={() => setModal("recharge")}
          onWithdraw={() => setModal("withdraw")}
          isUsdt={true}
          txList={
            recentUsdtTx.length > 0 ? (
              <div className="mt-4 pt-3" style={{ borderTop: `1px solid ${G.divider}` }}>
                {recentUsdtTx.map((tx, idx) => (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between py-2"
                    style={{ borderBottom: idx < recentUsdtTx.length - 1 ? `1px solid ${G.divider}` : "none" }}
                  >
                    <div>
                      <div className="text-xs font-medium" style={{ color: G.white }}>
                        {tx.type === "recharge" ? "充值" : tx.type === "withdraw" ? "提现" : tx.type === "reward" ? "奖励" : "扣费"}
                      </div>
                      <div className="text-xs" style={{ color: G.whiteDim }}>{formatTime(tx.createdAt)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-bold tabular-nums"
                        style={{ color: (tx.type === "recharge" || tx.type === "reward") ? G.green : G.red }}>
                        {(tx.type === "recharge" || tx.type === "reward") ? "+" : "-"}
                        {mask(tx.amount.toFixed(2))} USDT
                      </div>
                      <div className="flex items-center justify-end space-x-0.5 mt-0.5">
                        <StatusIcon status={tx.status} />
                        <span className="text-xs" style={{ color: G.whiteDim }}>{statusText(tx.status)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : null
          }
        />}

        {/* CNY（仅 activeTab === cny 时显示） */}
        {activeTab === "cny" && <AccountCard
          icon="¥"
          label="CNY 账户"
          balance={mask(cnyBalance.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }))}
          unit="CNY"
          subLine={!hideBalance && (
            <span className="text-xs" style={{ color: G.goldDim }}>≈ {(cnyBalance / 7.25).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT</span>
          )}
          txPath="/wallet/cny-transactions"
          onRefresh={() => cnyBalanceQuery.refetch()}
          onRecharge={() => setModal("cny-recharge")}
          onWithdraw={() => setModal("cny-withdraw")}
          isUsdt={false}
          txList={
            recentCnyTx.length > 0 ? (
              <div className="mt-4 pt-3" style={{ borderTop: `1px solid ${G.divider}` }}>
                {recentCnyTx.map((tx, idx) => (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between py-2"
                    style={{ borderBottom: idx < recentCnyTx.length - 1 ? `1px solid ${G.divider}` : "none" }}
                  >
                    <div>
                      <div className="text-xs font-medium" style={{ color: G.white }}>
                        {tx.note || (tx.isIn ? "充值" : "提现")}
                      </div>
                      <div className="text-xs" style={{ color: G.whiteDim }}>{formatTime(tx.createdAt)}</div>
                    </div>
                    <div
                      className="text-xs font-bold tabular-nums"
                      style={{ color: tx.isIn ? G.green : G.red }}
                    >
                      {tx.isIn ? "+" : "-"}{mask(tx.amount.toFixed(2))} CNY
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 pt-3 text-center text-xs" style={{ borderTop: `1px solid ${G.divider}`, color: G.whiteDim }}>
                暂无交易记录
              </div>
            )
          }
        />}

        {/* 钱包绑定管理入口 */}
        <button
          onClick={() => {
            sessionStorage.setItem("payment_accounts_back", "/wallet");
            setLocation("/payment-accounts");
          }}
          className="w-full flex items-center justify-between rounded-2xl px-5 py-4 active:scale-[0.98] transition-transform"
          style={{
            background: G.card,
            border: `1px solid ${G.cardBorder}`,
            boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
          }}
        >
          <div className="flex items-center space-x-3">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center"
              style={{
                background: `radial-gradient(circle at 35% 35%, ${G.goldLight} 0%, ${G.gold} 50%, #6b4e0a 100%)`,
                boxShadow: "0 2px 8px rgba(201,168,76,0.4)",
              }}
            >
              <WalletIcon className="w-4 h-4" style={{ color: "#000" }} />
            </div>
            <span className="text-sm font-semibold tracking-wide" style={{ color: G.goldLight }}>钱包绑定管理</span>
          </div>
          <ChevronRight className="w-4 h-4" style={{ color: G.goldDim }} />
        </button>

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
