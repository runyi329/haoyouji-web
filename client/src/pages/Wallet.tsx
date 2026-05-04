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
  TrendingUp,
  TrendingDown,
  RefreshCw,
} from "lucide-react";
import { trpc } from "../lib/trpc";
import Recharge from "./Recharge";
import Withdraw from "./Withdraw";

type TabType = "recharge" | "withdraw";
type ModalType = "recharge" | "withdraw" | null;

// 金色高光线组件
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

// 状态文字
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

export default function Wallet() {
  const [, setLocation] = useLocation();
  const [modal, setModal] = useState<ModalType>(null);
  const [hideBalance, setHideBalance] = useState(false);

  // 数据查询
  const balanceQuery = trpc.recharge.getBalance.useQuery();
  const pointsQuery = trpc.rewards.getPoints.useQuery();
  const recentRechargeQuery = trpc.recharge.getMyOrders.useQuery({ limit: 5 });
  const recentWithdrawQuery = trpc.recharge.getMyWithdrawHistory.useQuery({ limit: 5 });

  const balance =
    typeof balanceQuery.data === "number" ? balanceQuery.data : 0;
  const points = pointsQuery.data?.points ?? 0;

  // 合并最近交易（充值 + 提现，取最新5条）
  const recentTransactions = (() => {
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
    return [...recharges, ...withdraws]
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
      .slice(0, 5);
  })();

  // 格式化时间
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

  // 折合人民币（USDT ≈ 7.25 CNY）
  const cnyValue = (balance * 7.25).toFixed(2);

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
        {/* ── 主余额卡片 ── */}
        <div
          className="relative rounded-2xl overflow-hidden"
          style={{
            background: "linear-gradient(135deg, #111111 0%, #2a2a2a 45%, #1a1a1a 100%)",
            boxShadow:
              "0 8px 32px rgba(0,0,0,0.7), 0 2px 8px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)",
            border: "1px solid rgba(201,168,76,0.5)",
          }}
        >
          <GoldLine />
          {/* 背景光晕 */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "radial-gradient(ellipse at 20% 20%, rgba(201,168,76,0.06) 0%, transparent 60%), radial-gradient(ellipse at 80% 80%, rgba(201,168,76,0.04) 0%, transparent 60%)",
            }}
          />
          <div className="relative p-6">
            {/* 标题行 */}
            <div className="flex items-center justify-between mb-5">
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
              <button
                onClick={() => balanceQuery.refetch()}
                className="flex items-center justify-center w-7 h-7 rounded-full"
                style={{ background: "rgba(255,255,255,0.06)" }}
              >
                <RefreshCw className="w-3.5 h-3.5" style={{ color: "#C9A84C" }} />
              </button>
            </div>

            {/* 余额 */}
            <div className="mb-1">
              {hideBalance ? (
                <div className="flex items-center space-x-2">
                  <span className="text-4xl font-bold tracking-wider" style={{ color: "#F5D78E" }}>
                    ••••••
                  </span>
                </div>
              ) : (
                <div className="flex items-baseline space-x-2">
                  <span
                    className="text-4xl font-bold tabular-nums"
                    style={{
                      color: "#F5D78E",
                      textShadow: "0 0 20px rgba(245,215,142,0.3)",
                      letterSpacing: "0.02em",
                    }}
                  >
                    {balance.toFixed(2)}
                  </span>
                  <span className="text-base font-medium" style={{ color: "rgba(245,215,142,0.6)" }}>
                    USDT
                  </span>
                </div>
              )}
            </div>

            {/* 折合人民币 */}
            {!hideBalance && (
              <div className="text-xs mb-5" style={{ color: "rgba(201,168,76,0.5)" }}>
                ≈ ¥{cnyValue} 人民币
              </div>
            )}

            {/* 快捷操作按钮 */}
            <div className="grid grid-cols-2 gap-3">
              {/* 充值按钮 */}
              <button
                onClick={() => setModal("recharge")}
                className="relative flex items-center justify-center space-x-2 py-3 rounded-xl overflow-hidden active:scale-[0.97] transition-transform"
                style={{
                  background: "linear-gradient(135deg, #C9A84C 0%, #F5D78E 50%, #C9A84C 100%)",
                  boxShadow: "0 4px 16px rgba(201,168,76,0.4), inset 0 1px 0 rgba(255,255,255,0.3)",
                }}
              >
                <ArrowDownCircle className="w-4 h-4 text-black" />
                <span className="text-sm font-bold text-black tracking-wide">充值</span>
              </button>
              {/* 提现按钮 */}
              <button
                onClick={() => setModal("withdraw")}
                className="relative flex items-center justify-center space-x-2 py-3 rounded-xl overflow-hidden active:scale-[0.97] transition-transform"
                style={{
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(201,168,76,0.5)",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)",
                }}
              >
                <ArrowUpCircle className="w-4 h-4" style={{ color: "#F5D78E" }} />
                <span className="text-sm font-bold tracking-wide" style={{ color: "#F5D78E" }}>
                  提现
                </span>
              </button>
            </div>
          </div>
          {/* 底部暗影线 */}
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
          <div className="absolute inset-x-0 bottom-0 h-px" style={{ background: "rgba(0,0,0,0.4)" }} />
        </div>

        {/* ── 最近交易 ── */}
        <div
          className="relative rounded-2xl overflow-hidden"
          style={{
            background: "linear-gradient(135deg, #111111 0%, #1e1e1e 100%)",
            boxShadow: "0 4px 16px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)",
            border: "1px solid rgba(201,168,76,0.25)",
          }}
        >
          <GoldLine />
          <div className="relative px-5 pt-4 pb-2">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold tracking-wide" style={{ color: "#F5D78E" }}>
                最近交易
              </span>
              <button
                onClick={() => setLocation("/wallet/transactions")}
                className="flex items-center space-x-1 text-xs"
                style={{ color: "rgba(201,168,76,0.6)" }}
              >
                <span>全部</span>
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>

            {recentTransactions.length === 0 ? (
              <div className="py-6 text-center text-xs" style={{ color: "rgba(255,255,255,0.25)" }}>
                暂无交易记录
              </div>
            ) : (
              <div className="space-y-0">
                {recentTransactions.map((tx, idx) => (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between py-3"
                    style={{
                      borderBottom:
                        idx < recentTransactions.length - 1
                          ? "1px solid rgba(255,255,255,0.05)"
                          : "none",
                    }}
                  >
                    {/* 左侧信息 */}
                    <div className="flex items-center space-x-3">
                      <div>
                        <div className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.85)" }}>
                          {tx.type === "recharge" ? "充值" : "提现"}
                        </div>
                        <div className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
                          {formatTime(tx.createdAt)}
                        </div>
                      </div>
                    </div>
                    {/* 右侧金额 + 状态 */}
                    <div className="text-right">
                      <div
                        className="text-sm font-bold tabular-nums"
                        style={{ color: tx.type === "recharge" ? "#4ade80" : "#f87171" }}
                      >
                        {tx.type === "recharge" ? "+" : "-"}
                        {hideBalance ? "••••" : tx.amount.toFixed(2)}
                        <span className="text-xs font-normal ml-1" style={{ color: "rgba(255,255,255,0.3)" }}>
                          USDT
                        </span>
                      </div>
                      <div className="flex items-center justify-end space-x-1 mt-0.5">
                        <StatusIcon status={tx.status} />
                        <span className="text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>
                          {statusText(tx.status)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="absolute inset-x-0 bottom-0 h-px" style={{ background: "rgba(0,0,0,0.4)" }} />
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
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {/* 银行卡 - 金色3D球 */}
            <div className="flex flex-col items-center gap-1.5">
              <svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 32 32" style={{ filter: 'drop-shadow(0px 2px 5px rgba(201,168,76,0.5))' }}>
                <defs>
                  <radialGradient id="bank-bg" cx="38%" cy="30%" r="65%">
                    <stop offset="0%" stopColor="#FFE57A"/>
                    <stop offset="45%" stopColor="#C9A84C"/>
                    <stop offset="100%" stopColor="#7A5C10"/>
                  </radialGradient>
                  <radialGradient id="bank-shine" cx="35%" cy="25%" r="50%">
                    <stop offset="0%" stopColor="rgba(255,255,255,0.6)"/>
                    <stop offset="100%" stopColor="rgba(255,255,255,0)"/>
                  </radialGradient>
                  <clipPath id="bank-clip"><circle cx="16" cy="16" r="15"/></clipPath>
                </defs>
                <circle cx="16" cy="16" r="15" fill="url(#bank-bg)"/>
                <g clipPath="url(#bank-clip)" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="1.5">
                  <rect x="6" y="10" width="20" height="13" rx="2"/>
                  <line x1="6" y1="15" x2="26" y2="15"/>
                  <line x1="9" y1="19" x2="14" y2="19" strokeLinecap="round"/>
                </g>
                <circle cx="16" cy="16" r="15" fill="url(#bank-shine)"/>
                <circle cx="16" cy="16" r="15" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="0.8"/>
              </svg>
              <span className="text-xs" style={{ color: "rgba(201,168,76,0.7)" }}>银行卡</span>
            </div>
            {/* 支付宝 - 蓝色3D球 */}
            <div className="flex flex-col items-center gap-1.5">
              <svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 32 32" style={{ filter: 'drop-shadow(0px 2px 5px rgba(22,119,255,0.5))' }}>
                <defs>
                  <radialGradient id="alipay-bg" cx="38%" cy="30%" r="65%">
                    <stop offset="0%" stopColor="#69B8FF"/>
                    <stop offset="45%" stopColor="#1677FF"/>
                    <stop offset="100%" stopColor="#003A8C"/>
                  </radialGradient>
                  <radialGradient id="alipay-shine" cx="35%" cy="25%" r="50%">
                    <stop offset="0%" stopColor="rgba(255,255,255,0.55)"/>
                    <stop offset="100%" stopColor="rgba(255,255,255,0)"/>
                  </radialGradient>
                  <clipPath id="alipay-clip"><circle cx="16" cy="16" r="15"/></clipPath>
                </defs>
                <circle cx="16" cy="16" r="15" fill="url(#alipay-bg)"/>
                <g clipPath="url(#alipay-clip)">
                  <text x="16" y="21" textAnchor="middle" fontSize="13" fontWeight="bold" fill="rgba(255,255,255,0.95)" fontFamily="sans-serif">支</text>
                </g>
                <circle cx="16" cy="16" r="15" fill="url(#alipay-shine)"/>
                <circle cx="16" cy="16" r="15" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="0.8"/>
              </svg>
              <span className="text-xs" style={{ color: "rgba(201,168,76,0.7)" }}>支付宝</span>
            </div>
            {/* 微信 - 绿色3D球 */}
            <div className="flex flex-col items-center gap-1.5">
              <svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 32 32" style={{ filter: 'drop-shadow(0px 2px 5px rgba(7,193,96,0.5))' }}>
                <defs>
                  <radialGradient id="wechat-bg" cx="38%" cy="30%" r="65%">
                    <stop offset="0%" stopColor="#73D13D"/>
                    <stop offset="45%" stopColor="#07C160"/>
                    <stop offset="100%" stopColor="#004D1A"/>
                  </radialGradient>
                  <radialGradient id="wechat-shine" cx="35%" cy="25%" r="50%">
                    <stop offset="0%" stopColor="rgba(255,255,255,0.55)"/>
                    <stop offset="100%" stopColor="rgba(255,255,255,0)"/>
                  </radialGradient>
                  <clipPath id="wechat-clip"><circle cx="16" cy="16" r="15"/></clipPath>
                </defs>
                <circle cx="16" cy="16" r="15" fill="url(#wechat-bg)"/>
                <g clipPath="url(#wechat-clip)">
                  <text x="16" y="21" textAnchor="middle" fontSize="13" fontWeight="bold" fill="rgba(255,255,255,0.95)" fontFamily="sans-serif">微</text>
                </g>
                <circle cx="16" cy="16" r="15" fill="url(#wechat-shine)"/>
                <circle cx="16" cy="16" r="15" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="0.8"/>
              </svg>
              <span className="text-xs" style={{ color: "rgba(201,168,76,0.7)" }}>微信</span>
            </div>
            {/* 数字钱包 - 紫色3D球 */}
            <div className="flex flex-col items-center gap-1.5">
              <svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 32 32" style={{ filter: 'drop-shadow(0px 2px 5px rgba(126,87,194,0.5))' }}>
                <defs>
                  <radialGradient id="crypto-bg" cx="38%" cy="30%" r="65%">
                    <stop offset="0%" stopColor="#CE93D8"/>
                    <stop offset="45%" stopColor="#7E57C2"/>
                    <stop offset="100%" stopColor="#311B92"/>
                  </radialGradient>
                  <radialGradient id="crypto-shine" cx="35%" cy="25%" r="50%">
                    <stop offset="0%" stopColor="rgba(255,255,255,0.55)"/>
                    <stop offset="100%" stopColor="rgba(255,255,255,0)"/>
                  </radialGradient>
                  <clipPath id="crypto-clip"><circle cx="16" cy="16" r="15"/></clipPath>
                </defs>
                <circle cx="16" cy="16" r="15" fill="url(#crypto-bg)"/>
                <g clipPath="url(#crypto-clip)" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="1.5">
                  <rect x="5" y="11" width="22" height="12" rx="2"/>
                  <circle cx="21" cy="17" r="2" fill="rgba(255,255,255,0.9)" stroke="none"/>
                  <line x1="5" y1="15" x2="27" y2="15"/>
                </g>
                <circle cx="16" cy="16" r="15" fill="url(#crypto-shine)"/>
                <circle cx="16" cy="16" r="15" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="0.8"/>
              </svg>
              <span className="text-xs" style={{ color: "rgba(201,168,76,0.7)" }}>数字钱包</span>
            </div>
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
          <div className="font-semibold" style={{ color: "rgba(201,168,76,0.7)" }}>
            安全提示
          </div>
          <div>· 充值请确认链上地址，谨防钓鱼</div>
          <div>· 提现到账时间约 1-3 个工作日</div>
          <div>· 如有疑问请联系客服</div>
        </div>
      </div>

      {/* ── 充值弹窗 ── */}
      {modal === "recharge" && (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "rgba(0,0,0,0.85)" }}>
          <div
            className="flex-1 overflow-y-auto rounded-t-3xl mt-auto"
            style={{
              background: "linear-gradient(160deg, #0d0d0d 0%, #1a1a1a 100%)",
              border: "1px solid rgba(201,168,76,0.3)",
              borderBottom: "none",
              maxHeight: "90vh",
            }}
          >
            {/* 弹窗顶部拖拽条 */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full" style={{ background: "rgba(201,168,76,0.3)" }} />
            </div>
            <div className="flex items-center justify-between px-4 py-2">
              <span className="text-base font-bold" style={{ color: "#F5D78E" }}>充值</span>
              <button
                onClick={() => setModal(null)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-lg"
                style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)" }}
              >
                ×
              </button>
            </div>
            <Recharge hideHeader hideBalance />
          </div>
        </div>
      )}

      {/* ── 提现弹窗 ── */}
      {modal === "withdraw" && (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "rgba(0,0,0,0.85)" }}>
          <div
            className="flex-1 overflow-y-auto rounded-t-3xl mt-auto"
            style={{
              background: "linear-gradient(160deg, #0d0d0d 0%, #1a1a1a 100%)",
              border: "1px solid rgba(201,168,76,0.3)",
              borderBottom: "none",
              maxHeight: "90vh",
            }}
          >
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full" style={{ background: "rgba(201,168,76,0.3)" }} />
            </div>
            <div className="flex items-center justify-between px-4 py-2">
              <span className="text-base font-bold" style={{ color: "#F5D78E" }}>提现</span>
              <button
                onClick={() => setModal(null)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-lg"
                style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)" }}
              >
                ×
              </button>
            </div>
            <Withdraw hideHeader />
          </div>
        </div>
      )}
    </div>
  );
}
