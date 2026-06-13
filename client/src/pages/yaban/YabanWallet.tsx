import { useState } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft,
  ArrowDownCircle,
  ArrowUpCircle,
  Clock,
  CheckCircle2,
  XCircle,
  Eye,
  EyeOff,
} from "lucide-react";
import { trpc } from "../../lib/trpc";
import Recharge from "../Recharge";
import Withdraw from "../Withdraw";
import { PageTag } from "@/components/PageTag";

// 从交易备注中提取世界杯球队 code（小写）
function extractWcTeamCode(note: string): string | null {
  const isWcRelated = note.includes("世界杯投注") || note.includes("订单作废-退回投注");
  if (!isWcRelated) return null;
  const codeMatch = note.match(/\[([A-Z]{2,10})\]/);
  if (codeMatch) return codeMatch[1].toLowerCase();
  return null;
}

// ─── 牙伴蓝白色系 Token ───────────────────────────────────────
const Y = {
  bg: "#F2F6FA",          // 页面底色
  card: "#FFFFFF",        // 卡片底色
  cardBorder: "rgba(30,136,214,0.12)",
  blue: "#1E88D6",        // 主蓝
  blueDeep: "#0E5A9E",    // 深蓝
  blueLight: "#3BA9E0",   // 亮蓝
  blueDim: "rgba(30,136,214,0.55)",
  blueFaint: "#EAF4FE",   // 浅蓝底
  white: "#1f2937",       // 主文字（深灰）
  whiteDim: "#94a3b8",    // 次文字
  divider: "#EEF2F6",
  green: "#16a34a",       // 入账绿
  red: "#dc2626",         // 出账红
};

type ModalType = "recharge" | "withdraw" | "cny-recharge" | "cny-withdraw" | null;

function StatusIcon({ status }: { status: string }) {
  if (status === "completed" || status === "approved")
    return <CheckCircle2 className="w-3.5 h-3.5" style={{ color: Y.green }} />;
  if (status === "pending" || status === "processing")
    return <Clock className="w-3.5 h-3.5" style={{ color: "#f59e0b" }} />;
  if (status === "rejected" || status === "failed")
    return <XCircle className="w-3.5 h-3.5" style={{ color: Y.red }} />;
  return <Clock className="w-3.5 h-3.5" style={{ color: Y.whiteDim }} />;
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

// 底部弹窗（蓝白风）
function BottomSheet({ title, onClose, children }: {
  title: string; onClose: () => void; children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "rgba(15,23,42,0.45)" }}>
      <div
        className="rounded-t-3xl mt-auto overflow-hidden bg-white"
        style={{ maxHeight: "90vh", overflowY: "auto" }}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full" style={{ background: "#D7E6F4" }} />
        </div>
        <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: `1px solid ${Y.divider}` }}>
          <span className="text-base font-semibold" style={{ color: Y.blueDeep }}>{title}</span>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-lg"
            style={{ background: Y.blueFaint, color: Y.blueDim }}
          >×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// 蓝色输入框
function BlueInput({ label, value, onChange, placeholder, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder: string; type?: string;
}) {
  return (
    <div>
      <div className="text-xs mb-1.5" style={{ color: Y.whiteDim }}>{label}</div>
      <div
        className="flex items-center rounded-xl px-4 py-3"
        style={{ background: "#F5F8FB", border: `1px solid ${Y.cardBorder}` }}
      >
        {type === "number" && (
          <span className="text-lg font-bold mr-2" style={{ color: Y.blueDim }}>¥</span>
        )}
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 bg-transparent outline-none tabular-nums"
          style={{
            color: Y.white,
            fontSize: type === "number" ? "1.25rem" : "0.875rem",
            fontWeight: type === "number" ? 700 : 400,
          }}
        />
      </div>
    </div>
  );
}

// 蓝色主按钮
function BlueBtn({ children, onClick, disabled }: {
  children: React.ReactNode; onClick: () => void; disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full py-3.5 rounded-xl text-sm font-bold text-white active:scale-[0.98] transition-transform disabled:opacity-50"
      style={{
        background: `linear-gradient(135deg, ${Y.blue} 0%, ${Y.blueLight} 100%)`,
        boxShadow: "0 4px 16px rgba(30,136,214,0.3)",
      }}
    >{children}</button>
  );
}

// 成功状态
function SuccessState({ msg, sub, onClose }: { msg: string; sub: string; onClose: () => void }) {
  return (
    <div className="px-5 py-10 flex flex-col items-center space-y-4">
      <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: "rgba(22,163,74,0.1)" }}>
        <CheckCircle2 className="w-9 h-9" style={{ color: Y.green }} />
      </div>
      <div className="text-base font-semibold" style={{ color: Y.white }}>{msg}</div>
      <div className="text-sm text-center" style={{ color: Y.whiteDim }}>{sub}</div>
      <button
        onClick={onClose}
        className="w-full py-3 rounded-xl text-sm font-medium"
        style={{ background: Y.blueFaint, color: Y.blueDim }}
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
      <div className="rounded-2xl p-4 space-y-2.5" style={{ background: Y.blueFaint, border: `1px solid ${Y.cardBorder}` }}>
        <div className="text-xs font-semibold mb-1" style={{ color: Y.blueDim }}>收款信息</div>
        {[
          { label: "收款账户", value: "招商银行 6214 **** **** 8888" },
          { label: "收款人", value: "张三" },
          { label: "转账备注", value: "请务必填写您的用户ID" },
        ].map(({ label, value }) => (
          <div key={label} className="flex justify-between text-sm">
            <span style={{ color: Y.whiteDim }}>{label}</span>
            <span style={{ color: Y.white, fontWeight: 500 }}>{value}</span>
          </div>
        ))}
      </div>

      <BlueInput label="充值金额（元）" value={amount} onChange={setAmount} placeholder="0.00" type="number" />
      <BlueInput label="备注（可选）" value={note} onChange={setNote} placeholder="如有特殊说明请填写" />

      <BlueBtn onClick={() => {
        if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) { alert("请输入有效金额"); return; }
        setSubmitted(true);
      }}>提交充值申请</BlueBtn>
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
      <div
        className="rounded-xl px-4 py-3 flex items-center justify-between"
        style={{ background: Y.blueFaint, border: `1px solid ${Y.cardBorder}` }}
      >
        <span className="text-sm" style={{ color: Y.whiteDim }}>可用余额</span>
        <span className="text-base font-bold" style={{ color: Y.blueDeep }}>¥ {cnyBalance.toFixed(2)}</span>
      </div>

      <div>
        <div className="text-xs mb-1.5" style={{ color: Y.whiteDim }}>提现金额（元）</div>
        <div
          className="flex items-center rounded-xl px-4 py-3"
          style={{ background: "#F5F8FB", border: `1px solid ${Y.cardBorder}` }}
        >
          <span className="text-lg font-bold mr-2" style={{ color: Y.blueDim }}>¥</span>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="flex-1 bg-transparent text-xl font-bold outline-none tabular-nums"
            style={{ color: Y.white }}
          />
          <button
            onClick={() => setAmount(cnyBalance.toFixed(2))}
            className="text-xs px-2.5 py-1 rounded-lg ml-2 font-medium"
            style={{ background: Y.blueFaint, color: Y.blue }}
          >全部</button>
        </div>
      </div>

      <div>
        <div className="text-xs mb-1.5" style={{ color: Y.whiteDim }}>收款账户信息</div>
        <textarea
          value={bankInfo}
          onChange={(e) => setBankInfo(e.target.value)}
          placeholder="请填写银行卡号、开户行、户名等信息"
          rows={3}
          className="w-full rounded-xl px-4 py-3 text-sm outline-none resize-none"
          style={{ background: "#F5F8FB", border: `1px solid ${Y.cardBorder}`, color: Y.white }}
        />
      </div>

      <BlueBtn onClick={() => {
        const num = Number(amount);
        if (!amount || isNaN(num) || num <= 0) { alert("请输入有效金额"); return; }
        if (num > cnyBalance) { alert("提现金额不能超过可用余额"); return; }
        if (!bankInfo.trim()) { alert("请填写收款账户信息"); return; }
        setSubmitted(true);
      }}>提交提现申请</BlueBtn>
    </div>
  );
}

// ─── 主页面 ──────────────────────────────────────────────────
export default function YabanWallet() {
  const [, setLocation] = useLocation();
  const [modal, setModal] = useState<ModalType>(null);
  const [hideBalance, setHideBalance] = useState(false);
  // 牙伴入口默认停在人民币(CNY)
  const [activeTab, setActiveTab] = useState<"usdt" | "cny">("cny");

  const balanceQuery = trpc.recharge.getBalance.useQuery();
  const recentRechargeQuery = trpc.recharge.getMyOrders.useQuery({ limit: 5 });
  const recentWithdrawQuery = trpc.recharge.getMyWithdrawHistory.useQuery({ limit: 5 });
  const recentManualQuery = trpc.recharge.getMyManualBalances.useQuery({ limit: 5 });
  const recentBalanceHistoryQuery = trpc.recharge.getBalanceHistory.useQuery({ limit: 5 });
  const cnyBalanceQuery = trpc.recharge.getCnyBalance.useQuery();
  const cnyHistoryQuery = trpc.recharge.getCnyHistory.useQuery({ limit: 5 });

  const balance = typeof balanceQuery.data === "number" ? balanceQuery.data : 0;
  const cnyBalance = typeof cnyBalanceQuery.data === "number" ? cnyBalanceQuery.data : 0;
  const usdtToCny = balance * 7.25;

  const recentUsdtTx = (() => {
    const recharges = (recentRechargeQuery.data ?? []).map((r: any) => ({
      id: `r-${r.id}`, type: "recharge" as const,
      amount: Number(r.amount), status: r.status, createdAt: r.createdAt,
      note: "", wcCode: null,
    }));
    const withdraws = (recentWithdrawQuery.data ?? []).map((w: any) => ({
      id: `w-${w.id}`, type: "withdraw" as const,
      amount: Number(w.amount), status: w.status, createdAt: w.createdAt,
      note: "", wcCode: null,
    }));
    const manuals = (recentManualQuery.data ?? [])
      .filter((m: any) => !(m.note || "").startsWith("[CNY]"))
      .map((m: any) => ({
        id: `m-${m.id}`,
        type: (Number(m.amount) > 0 ? "reward" : "deduct") as "reward" | "deduct",
        amount: Math.abs(Number(m.amount)), status: "completed" as const,
        note: m.note || "",
        wcCode: extractWcTeamCode(m.note || ""),
        createdAt: m.created_at,
      }));
    const balanceHistoryItems = (recentBalanceHistoryQuery.data ?? [])
      .filter((h: any) => h.type === "consume" || h.type === "refund")
      .map((h: any) => ({
        id: `bh-${h.id}`,
        type: (h.type === "refund" ? "reward" : "deduct") as "reward" | "deduct",
        amount: Math.abs(Number(h.amount)), status: "completed" as const,
        note: h.description || "",
        wcCode: extractWcTeamCode(h.description || ""),
        createdAt: h.createdAt,
      }));
    return [...recharges, ...withdraws, ...manuals, ...balanceHistoryItems]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 3);
  })();

  const recentCnyTx = (cnyHistoryQuery.data ?? []).slice(0, 3).map((m: any) => ({
    id: `cny-${m.id}`,
    amount: Math.abs(Number(m.amount)),
    isIn: Number(m.amount) > 0,
    note: (m.note || "").replace(/^\[CNY\]/, ""),
    wcCode: extractWcTeamCode((m.note || "").replace(/^\[CNY\]/, "")),
    createdAt: m.created_at,
  }));

  const mask = (v: string) => hideBalance ? "••••••" : v;

  // 账户卡片通用渲染
  const AccountCard = ({
    icon, label, balance: bal, unit, subLine,
    onRecharge, onWithdraw, txList,
  }: {
    icon: string; label: string; balance: string; unit: string; subLine?: React.ReactNode;
    onRecharge: () => void; onWithdraw: () => void; txList: React.ReactNode;
  }) => (
    <div
      className="rounded-2xl overflow-hidden bg-white"
      style={{ border: `1px solid ${Y.cardBorder}`, boxShadow: "0 4px 20px rgba(30,136,214,0.08)" }}
    >
      {/* 顶部蓝色渐变条 */}
      <div
        className="h-1.5"
        style={{ background: `linear-gradient(90deg, ${Y.blue} 0%, ${Y.blueLight} 100%)` }}
      />
      <div className="p-5">
        {/* 标题行 */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2.5">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white"
              style={{ background: `linear-gradient(135deg, ${Y.blue} 0%, ${Y.blueLight} 100%)` }}
            >{icon}</div>
            <span className="text-sm font-semibold tracking-wide" style={{ color: Y.white }}>{label}</span>
            <button
              onClick={() => setHideBalance((v) => !v)}
              className="w-6 h-6 flex items-center justify-center"
            >
              {hideBalance
                ? <EyeOff className="w-3.5 h-3.5" style={{ color: Y.whiteDim }} />
                : <Eye className="w-3.5 h-3.5" style={{ color: Y.whiteDim }} />
              }
            </button>
          </div>
          {/* 切换胶囊 */}
          <div
            className="flex items-center rounded-full p-0.5"
            style={{ background: Y.blueFaint }}
          >
            {(["usdt", "cny"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className="px-3 h-6 rounded-full text-xs font-bold transition-all"
                style={{
                  background: activeTab === tab
                    ? `linear-gradient(135deg, ${Y.blue} 0%, ${Y.blueLight} 100%)`
                    : "transparent",
                  color: activeTab === tab ? "#fff" : Y.blueDim,
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
              style={{ fontSize: "2rem", lineHeight: 1.1, color: Y.blueDeep }}
            >{bal}</span>
            <span className="text-sm font-medium" style={{ color: Y.whiteDim }}>{unit}</span>
          </div>
        </div>
        {subLine && <div className="mb-4">{subLine}</div>}

        {/* 操作按钮 */}
        <div className="grid grid-cols-2 gap-2.5 mb-1">
          <button
            onClick={onRecharge}
            className="flex items-center justify-center space-x-1.5 py-2.5 rounded-xl text-sm font-bold text-white active:scale-[0.97] transition-transform"
            style={{
              background: `linear-gradient(135deg, ${Y.blue} 0%, ${Y.blueLight} 100%)`,
              boxShadow: "0 4px 14px rgba(30,136,214,0.28)",
            }}
          >
            <ArrowDownCircle className="w-4 h-4" />
            <span>充值</span>
          </button>
          <button
            onClick={onWithdraw}
            className="flex items-center justify-center space-x-1.5 py-2.5 rounded-xl text-sm font-bold active:scale-[0.97] transition-transform"
            style={{ background: "transparent", border: `1px solid ${Y.blue}`, color: Y.blue }}
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
    <div className="min-h-screen" style={{ background: Y.bg }}>
      <PageTag code="P008" />

      {/* ── 顶部导航栏（蓝色渐变） ── */}
      <div
        className="relative px-4"
        style={{
          background: `linear-gradient(135deg, ${Y.blue} 0%, ${Y.blueLight} 100%)`,
          paddingTop: "calc(env(safe-area-inset-top, 44px) + 8px)",
          paddingBottom: "10px",
        }}
      >
        <div className="flex items-center justify-between">
          {/* 返回 → 回到「我的」 */}
          <button
            onClick={() => setLocation("/yaban/profile")}
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: "rgba(255,255,255,0.2)" }}
          >
            <ArrowLeft className="w-4 h-4 text-white" />
          </button>

          <span className="text-base font-semibold text-white">我的钱包</span>

          {/* 右侧：明细 */}
          <button
            onClick={() => setLocation(activeTab === "usdt" ? "/wallet/transactions" : "/wallet/cny-transactions")}
            className="px-2.5 h-7 rounded-full text-xs font-medium text-white"
            style={{ background: "rgba(255,255,255,0.2)" }}
          >
            明细
          </button>
        </div>
      </div>

      {/* ── 账户卡片 ── */}
      <div className="px-4 pt-4 pb-24 space-y-3">

        {/* USDT */}
        {activeTab === "usdt" && <AccountCard
          icon="$"
          label="USDT 账户"
          balance={mask(balance.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }))}
          unit="USDT"
          subLine={!hideBalance && (
            <div className="flex items-center space-x-1 mt-0.5" style={{ color: Y.whiteDim }}>
              <span className="text-xs">≈ ¥{usdtToCny.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} 人民币</span>
            </div>
          )}
          onRecharge={() => setModal("recharge")}
          onWithdraw={() => setModal("withdraw")}
          txList={
            recentUsdtTx.length > 0 ? (
              <div className="mt-4 pt-3" style={{ borderTop: `1px solid ${Y.divider}` }}>
                {recentUsdtTx.map((tx, idx) => (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between py-2"
                    style={{ borderBottom: idx < recentUsdtTx.length - 1 ? `1px solid ${Y.divider}` : "none" }}
                  >
                    <div className="flex items-center space-x-2">
                      {(tx as any).wcCode ? (
                        <img
                          src={`/flags/${(tx as any).wcCode}.png`}
                          alt={(tx as any).wcCode}
                          className="w-7 h-7 rounded-full object-cover flex-shrink-0"
                        />
                      ) : null}
                      <div>
                        {!(tx as any).wcCode && (
                          <div className="text-xs font-medium" style={{ color: Y.white }}>
                            {tx.type === "recharge" ? "充值" : tx.type === "withdraw" ? "提现" : tx.type === "reward" ? "奖励" : "扣费"}
                          </div>
                        )}
                        <div className="text-xs" style={{ color: Y.whiteDim }}>{formatTime(tx.createdAt)}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-bold tabular-nums"
                        style={{ color: (tx.type === "recharge" || tx.type === "reward") ? Y.green : Y.red }}>
                        {(tx.type === "recharge" || tx.type === "reward") ? "+" : "-"}
                        {mask(tx.amount.toFixed(2))} USDT
                      </div>
                      <div className="flex items-center justify-end space-x-0.5 mt-0.5">
                        <StatusIcon status={tx.status} />
                        <span className="text-xs" style={{ color: Y.whiteDim }}>{statusText(tx.status)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 pt-3 text-center text-xs" style={{ borderTop: `1px solid ${Y.divider}`, color: Y.whiteDim }}>
                暂无交易记录
              </div>
            )
          }
        />}

        {/* CNY */}
        {activeTab === "cny" && <AccountCard
          icon="¥"
          label="CNY 账户"
          balance={mask(cnyBalance.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }))}
          unit="CNY"
          subLine={!hideBalance && (
            <span className="text-xs" style={{ color: Y.whiteDim }}>≈ {(cnyBalance / 7.25).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT</span>
          )}
          onRecharge={() => setModal("cny-recharge")}
          onWithdraw={() => setModal("cny-withdraw")}
          txList={
            recentCnyTx.length > 0 ? (
              <div className="mt-4 pt-3" style={{ borderTop: `1px solid ${Y.divider}` }}>
                {recentCnyTx.map((tx, idx) => (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between py-2"
                    style={{ borderBottom: idx < recentCnyTx.length - 1 ? `1px solid ${Y.divider}` : "none" }}
                  >
                    <div className="flex items-center space-x-2">
                      {(tx as any).wcCode ? (
                        <img
                          src={`/flags/${(tx as any).wcCode}.png`}
                          alt={(tx as any).wcCode}
                          className="w-7 h-7 rounded-full object-cover flex-shrink-0"
                        />
                      ) : null}
                      <div>
                        {!(tx as any).wcCode && (
                          <div className="text-xs font-medium" style={{ color: Y.white }}>
                            {tx.note || (tx.isIn ? "充值" : "提现")}
                          </div>
                        )}
                        <div className="text-xs" style={{ color: Y.whiteDim }}>{formatTime(tx.createdAt)}</div>
                      </div>
                    </div>
                    <div
                      className="text-xs font-bold tabular-nums"
                      style={{ color: tx.isIn ? Y.green : Y.red }}
                    >
                      {tx.isIn ? "+" : "-"}{mask(tx.amount.toFixed(2))} CNY
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 pt-3 text-center text-xs" style={{ borderTop: `1px solid ${Y.divider}`, color: Y.whiteDim }}>
                暂无交易记录
              </div>
            )
          }
        />}

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
