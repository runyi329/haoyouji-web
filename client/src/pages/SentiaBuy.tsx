/**
 * Sentia (SNT) 买币页 / 定向邀请页
 * 设计风格：币安设计语言
 * 色系：#0B0E11（深黑底）+ #F0B90B（金黄主色）+ #1E2026（卡片背景）
 * 无 emoji，方角/小圆角按钮，专业交易所风格
 */
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "../lib/trpc";
import QRCode from "qrcode";

const SENTIA_ICON = "https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/snt-ai-2-N3gEAMNGbei2Fqn5vNs6VJ.png";
const SNT_PRICE = 0.04; // USDT per SNT
const SENTIA_SESSION_KEY = "sentia-auth-token"; // sessionStorage key，关闭浏览器自动清除

// 将 token 同时写入 sessionStorage 和 localStorage（供 tRPC 请求头使用）
function saveToken(token: string) {
  try {
    sessionStorage.setItem(SENTIA_SESSION_KEY, token);
    localStorage.setItem("auth-token", token);
  } catch {}
}

// 检查当前会话是否已登录
function hasSessionToken(): boolean {
  try {
    return !!sessionStorage.getItem(SENTIA_SESSION_KEY);
  } catch {
    return false;
  }
}

type Step = "login" | "buy" | "pay" | "submitted" | "orders";

// 币安色系常量
const BNB = {
  bg: "#0B0E11",
  card: "#1E2026",
  cardBorder: "#2B2F36",
  yellow: "#F0B90B",
  yellowDim: "rgba(240,185,11,0.12)",
  yellowBorder: "rgba(240,185,11,0.35)",
  text: "#EAECEF",
  textSecondary: "#848E9C",
  textMuted: "#5E6673",
  green: "#0ECB81",
  greenDim: "rgba(14,203,129,0.1)",
  greenBorder: "rgba(14,203,129,0.3)",
  red: "#F6465D",
  redDim: "rgba(246,70,93,0.1)",
  redBorder: "rgba(246,70,93,0.3)",
  blue: "#1890FF",
  blueDim: "rgba(24,144,255,0.1)",
  blueBorder: "rgba(24,144,255,0.3)",
  divider: "#2B2F36",
};

// 样式常量
const inputStyle: React.CSSProperties = {
  width: "100%", padding: "11px 14px", borderRadius: 4,
  background: BNB.bg, border: `1px solid ${BNB.cardBorder}`,
  color: BNB.text, fontSize: 14, outline: "none", boxSizing: "border-box",
};
const cardStyle: React.CSSProperties = {
  background: BNB.card,
  border: `1px solid ${BNB.divider}`,
  borderRadius: 6, padding: "20px 18px",
};
const btnPrimary: React.CSSProperties = {
  width: "100%", background: BNB.yellow,
  border: "none", borderRadius: 4, padding: "13px",
  color: "#0B0E11", fontWeight: 700, fontSize: 15, cursor: "pointer",
  letterSpacing: 0.3,
};
const btnSecondary: React.CSSProperties = {
  width: "100%", background: "transparent",
  border: `1px solid ${BNB.cardBorder}`, borderRadius: 4, padding: "13px",
  color: BNB.text, fontWeight: 500, fontSize: 14, cursor: "pointer",
};

export default function SentiaBuy() {
  const [, navigate] = useLocation();
  // 若本次浏览器会话已登录，直接进入购买步骤
  const [step, setStep] = useState<Step>(() => hasSessionToken() ? "buy" : "login");
  const [isRegister, setIsRegister] = useState(false);

  // 登录/注册表单
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  // 购买数量
  const [sntAmount, setSntAmount] = useState("1000");

  // USDT 支付
  const [network, setNetwork] = useState<"TRC20" | "ERC20" | "BEP20" | "APTOS" | "SOLANA">("TRC20");
  const [order, setOrder] = useState<any>(null);
  const [qrCode, setQrCode] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);

  const handleResumeOrder = async (o: any) => {
    setOrder(o);
    if (o.walletAddress) {
      try {
        const qr = await QRCode.toDataURL(o.walletAddress);
        setQrCode(qr);
      } catch {}
    }
    if (o.expiresAt) {
      const remaining = Math.floor((new Date(o.expiresAt).getTime() - Date.now()) / 1000);
      setTimeLeft(remaining > 0 ? remaining : 0);
    }
    setStep("pay");
  };

  // 提现弹窗状态
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  // "bind" = 绑定新地址；"withdraw" = 直接提现（已有地址）
  const [withdrawMode, setWithdrawMode] = useState<"bind" | "withdraw">("bind");
  const [newBscAddress, setNewBscAddress] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawMsg, setWithdrawMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const [bindConfirmed, setBindConfirmed] = useState(false);

  // tRPC mutations
  const loginMutation = trpc.auth.loginWithPassword.useMutation();
  const registerMutation = trpc.auth.registerWithPassword.useMutation();
  const createOrderMutation = trpc.recharge.createOrder.useMutation();
  const submitTransferMutation = trpc.recharge.submitTransfer.useMutation();
  const ordersQuery = trpc.recharge.getMyOrders.useQuery(
    { limit: 100 },
    { enabled: step === "orders" || step === "buy" }
  );
  // 仅在非登录步骤时查询已绑定的 BSC 钱包
  const bscWalletsQuery = trpc.paymentAccounts.getDigitalWallets.useQuery(
    undefined,
    { enabled: step !== "login" }
  );
  const addBscWalletMutation = trpc.paymentAccounts.addDigitalWallet.useMutation();
  const requestWithdrawMutation = trpc.recharge.requestWithdraw.useMutation();
  // 划转弹窗状态
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferKeyword, setTransferKeyword] = useState("");
  const [transferTarget, setTransferTarget] = useState<{ id: number; username: string; name?: string } | null>(null);
  const [transferAmount, setTransferAmount] = useState("");
  const [transferRemark, setTransferRemark] = useState("");
  const [transferMsg, setTransferMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [transferLoading, setTransferLoading] = useState(false);
  const [transferSearchEnabled, setTransferSearchEnabled] = useState(false);
  const searchUsersQuery = trpc.recharge.searchUserForTransfer.useQuery(
    { keyword: transferKeyword },
    { enabled: transferSearchEnabled && transferKeyword.length >= 2 }
  );
  const transferSNTMutation = trpc.recharge.transferSNT.useMutation();
  // 取第一个 BEP20 钱包地址
  const savedBscAddress: string | null = (bscWalletsQuery.data as any[])
    ?.find((w: any) => w.walletType === "blockchain" && w.network === "BEP20")
    ?.walletAddress ?? null;

  // 累计持仓
  const totalSNT = (() => {
    if (!ordersQuery.data) return null;
    const completedUSDT = ordersQuery.data
      .filter((o: any) => o.status === "completed")
      .reduce((sum: number, o: any) => sum + parseFloat(String(o.amount)), 0);
    return completedUSDT / SNT_PRICE;
  })();

  const pendingSNT = (() => {
    if (!ordersQuery.data) return null;
    const pendingUSDT = ordersQuery.data
      .filter((o: any) => o.status === "submitted" || o.status === "pending")
      .reduce((sum: number, o: any) => sum + parseFloat(String(o.amount)), 0);
    return pendingUSDT / SNT_PRICE;
  })();

  const usdtCost = (parseFloat(sntAmount) * SNT_PRICE).toFixed(2);

  // 倒计时
  useEffect(() => {
    if (timeLeft <= 0) return;
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) { clearInterval(timer); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [timeLeft]);

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // 登录/注册
  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    setAuthLoading(true);
    try {
      let token: string | undefined;
      if (isRegister) {
        const res = await registerMutation.mutateAsync({ username, password, inviteCode: inviteCode || undefined });
        token = (res as any)?.token;
      } else {
        const res = await loginMutation.mutateAsync({ username, password });
        token = (res as any)?.token;
      }
      // 保存 token 到 sessionStorage，本次会话内保持登录
      if (token) saveToken(token);
      setStep("buy");
    } catch (err: any) {
      setAuthError(err.message || (isRegister ? "注册失败，请重试" : "用户名或密码错误"));
    } finally {
      setAuthLoading(false);
    }
  };

  // 创建充值订单
  const handleCreateOrder = async () => {
    const amount = parseFloat(usdtCost);
    if (isNaN(amount) || amount < 1) {
      alert("购买金额不能低于 1 USDT，请增加购买数量");
      return;
    }
    try {
      const result = await createOrderMutation.mutateAsync({ amount, network });
      setOrder(result);
      if (result.walletAddress) {
        const qr = await QRCode.toDataURL(result.walletAddress);
        setQrCode(qr);
      }
      const expiresAt = new Date(result.expiresAt).getTime();
      setTimeLeft(Math.floor((expiresAt - Date.now()) / 1000));
      setStep("pay");
    } catch (err: any) {
      alert(err.message || "创建订单失败，请重试");
    }
  };

  // 提交转账确认
  const handleSubmitTransfer = async () => {
    if (!order?.orderNo) return;
    setSubmitting(true);
    try {
      await submitTransferMutation.mutateAsync({ orderNo: order.orderNo });
      setStep("submitted");
    } catch (err: any) {
      alert(err.message || "提交失败，请重试");
    } finally {
      setSubmitting(false);
    }
  };

  // 订单状态标签
  const statusConfig: Record<string, { label: string; color: string; bg: string; border: string }> = {
    pending:   { label: "待支付", color: BNB.yellow,  bg: BNB.yellowDim, border: BNB.yellowBorder },
    submitted: { label: "确认中", color: BNB.blue,    bg: BNB.blueDim,   border: BNB.blueBorder },
    completed: { label: "已到账", color: BNB.green,   bg: BNB.greenDim,  border: BNB.greenBorder },
    expired:   { label: "已过期", color: BNB.textMuted, bg: "rgba(255,255,255,0.04)", border: BNB.divider },
    cancelled: { label: "已取消", color: BNB.red,     bg: BNB.redDim,    border: BNB.redBorder },
  };

  const formatDate = (d: string) => {
    const dt = new Date(d);
    return `${(dt.getMonth()+1).toString().padStart(2,"0")}-${dt.getDate().toString().padStart(2,"0")} ${dt.getHours().toString().padStart(2,"0")}:${dt.getMinutes().toString().padStart(2,"0")}`;
  };

  const toSNT = (usdt: string | number) =>
    (parseFloat(String(usdt)) / SNT_PRICE).toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 });

  const stepOrder = ["login", "buy", "pay", "submitted"];
  const currentIdx = stepOrder.indexOf(step);

  return (
    <>
    <div style={{
      minHeight: "100vh",
      background: BNB.bg,
      color: BNB.text,
      fontFamily: "'Inter', 'SF Pro Display', -apple-system, sans-serif",
    }}>

      {/* 导航栏 */}
      <nav style={{
        position: "sticky", top: 0, zIndex: 100,
        background: BNB.bg,
        borderBottom: `1px solid ${BNB.divider}`,
        padding: "0 20px",
        height: 56,
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <button onClick={() => navigate("/sentia")} style={{
          background: "transparent", border: "none", color: BNB.textSecondary, cursor: "pointer", fontSize: 13,
          display: "flex", alignItems: "center", gap: 6, padding: 0,
        }}>
          <span style={{ fontSize: 16, lineHeight: 1 }}>&#8592;</span> 返回首页
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <img src={SENTIA_ICON} alt="SNT" style={{ width: 22, height: 22, borderRadius: "50%" }} />
          <span style={{ fontWeight: 700, fontSize: 14, color: BNB.yellow, letterSpacing: 1 }}>
            SENTIA
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button onClick={() => navigate("/sentia/whitepaper")} style={{
            background: "transparent", border: `1px solid ${BNB.cardBorder}`, borderRadius: 4,
            padding: "6px 12px", color: BNB.textSecondary, fontSize: 12, cursor: "pointer",
          }}>白皮书</button>
          {step !== "login" && (
            <button onClick={() => setStep("orders")} style={{
              background: "transparent", border: `1px solid ${BNB.cardBorder}`, borderRadius: 4,
              padding: "6px 12px", color: BNB.textSecondary, fontSize: 12, cursor: "pointer",
            }}>我的订单</button>
          )}
        </div>
      </nav>

      <div style={{ padding: "24px 16px 60px", maxWidth: 440, margin: "0 auto" }}>

        {/* 步骤指示器 */}
        {step !== "orders" && (
          <div style={{ display: "flex", alignItems: "center", marginBottom: 24 }}>
            {[
              { key: "login", label: "登录" },
              { key: "buy",   label: "购买" },
              { key: "pay",   label: "支付" },
              { key: "submitted", label: "完成" },
            ].map((s, i) => {
              const thisIdx = stepOrder.indexOf(s.key);
              const isDone = currentIdx > thisIdx;
              const isActive = step === s.key;
              return (
                <div key={s.key} style={{ display: "flex", alignItems: "center", flex: i < 3 ? 1 : "none" }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: "50%",
                      background: isDone ? BNB.yellow : isActive ? BNB.yellow : BNB.card,
                      border: `2px solid ${isDone || isActive ? BNB.yellow : BNB.cardBorder}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 11, fontWeight: 700,
                      color: isDone || isActive ? "#0B0E11" : BNB.textMuted,
                    }}>
                      {isDone ? "✓" : i + 1}
                    </div>
                    <span style={{ fontSize: 10, color: isActive ? BNB.yellow : isDone ? BNB.textSecondary : BNB.textMuted, whiteSpace: "nowrap" }}>
                      {s.label}
                    </span>
                  </div>
                  {i < 3 && (
                    <div style={{
                      flex: 1, height: 2, margin: "0 4px", marginBottom: 16,
                      background: isDone ? BNB.yellow : BNB.divider,
                    }} />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ===== 步骤一：登录/注册 ===== */}
        {step === "login" && (
          <div style={cardStyle}>
            <div style={{ textAlign: "center", marginBottom: 24 }}>
              <img src={SENTIA_ICON} alt="SNT" style={{ width: 52, height: 52, borderRadius: "50%", marginBottom: 14 }} />
              <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 6, color: BNB.text }}>
                {isRegister ? "创建账户" : "欢迎回来"}
              </h2>
              <p style={{ fontSize: 13, color: BNB.textSecondary }}>
                {isRegister ? "注册后即可参与 Sentia 预售" : "登录您的账户参与 SNT 预售"}
              </p>
            </div>

            <form onSubmit={handleAuth} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, color: BNB.textSecondary, display: "block", marginBottom: 6 }}>用户名</label>
                <input
                  type="text" placeholder="请输入用户名" required value={username}
                  onChange={e => setUsername(e.target.value)} style={inputStyle}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, color: BNB.textSecondary, display: "block", marginBottom: 6 }}>密码</label>
                <input
                  type="password" placeholder="请输入密码" required value={password}
                  onChange={e => setPassword(e.target.value)} style={inputStyle}
                />
              </div>
              {isRegister && (
                <div>
                  <label style={{ fontSize: 12, color: BNB.textSecondary, display: "block", marginBottom: 6 }}>邀请码（选填）</label>
                  <input
                    type="text" placeholder="请输入邀请码" value={inviteCode}
                    onChange={e => setInviteCode(e.target.value)} style={inputStyle}
                  />
                </div>
              )}
              {authError && (
                <div style={{ background: BNB.redDim, border: `1px solid ${BNB.redBorder}`, borderRadius: 4, padding: "10px 14px", fontSize: 13, color: BNB.red }}>
                  {authError}
                </div>
              )}
              <button type="submit" disabled={authLoading} style={{ ...btnPrimary, opacity: authLoading ? 0.7 : 1, marginTop: 4 }}>
                {authLoading ? "处理中..." : isRegister ? "注册并参与预售" : "登录"}
              </button>
            </form>

            <div style={{ textAlign: "center", marginTop: 16 }}>
              <button onClick={() => { setIsRegister(!isRegister); setAuthError(""); }}
                style={{ background: "none", border: "none", color: BNB.yellow, fontSize: 13, cursor: "pointer" }}>
                {isRegister ? "已有账户？立即登录" : "没有账户？免费注册"}
              </button>
            </div>
          </div>
        )}

        {/* ===== 步骤二：填写购买数量 ===== */}
        {step === "buy" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* 持仓卡 */}
            {ordersQuery.data && (totalSNT! > 0 || pendingSNT! > 0) && (
              <div style={{
                background: BNB.card,
                border: `1px solid ${BNB.yellowBorder}`,
                borderRadius: 6, padding: "16px 18px",
              }}>
                {/* 标题行：左侧「我的持仓」，右侧三个操作按钮 */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <div style={{ fontSize: 11, color: BNB.textMuted, fontWeight: 600, letterSpacing: 0.5 }}>我的持仓</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {[
                      { label: "充值", onClick: () => setStep("buy"), primary: true },
                      { label: "提现", onClick: () => alert("提现功能即将开放，敬请期待"), primary: false },
                      { label: "划转", onClick: () => { setShowTransferModal(true); setTransferTarget(null); setTransferKeyword(""); setTransferAmount(""); setTransferMsg(null); }, primary: false },
                    ].map((btn, i) => (
                      <button key={i} onClick={btn.onClick} style={{
                        background: btn.primary ? BNB.yellow : "transparent",
                        border: `1px solid ${btn.primary ? BNB.yellow : BNB.cardBorder}`,
                        borderRadius: 3, padding: "3px 9px",
                        color: btn.primary ? "#0B0E11" : BNB.textSecondary,
                        fontSize: 11, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
                      }}>
                        {btn.label}
                      </button>
                    ))}
                  </div>
                </div>
                {/* SNT 数字 */}
                <div>
                  <div style={{ fontSize: 11, color: BNB.textSecondary, marginBottom: 4 }}>累计已到账</div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                    <div style={{ fontSize: 26, fontWeight: 800, color: BNB.yellow }}>
                      {(totalSNT ?? 0).toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
                    </div>
                    <div style={{ fontSize: 13, color: BNB.textMuted, fontWeight: 600 }}>SNT</div>
                  </div>
                </div>
              </div>
            )}

            {/* 购买表单（价格标注已合并） */}
            <div style={cardStyle}>
              {/* 表单头：代币标识 + 价格小标注 */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, paddingBottom: 14, borderBottom: `1px solid ${BNB.divider}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <img src={SENTIA_ICON} alt="SNT" style={{ width: 32, height: 32, borderRadius: "50%" }} />
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: BNB.text, lineHeight: 1 }}>SNT</div>
                    <div style={{ fontSize: 11, color: BNB.textMuted, marginTop: 3 }}>Sentia Token</div>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 11, color: BNB.textMuted, marginBottom: 2 }}>合伙人价</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: BNB.yellow }}>1 SNT = $0.04</div>
                </div>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, color: BNB.textSecondary, display: "block", marginBottom: 8 }}>购买数量（SNT）</label>
                <input
                  type="number" value={sntAmount} onChange={e => setSntAmount(e.target.value)}
                  min="100" step="100"
                  style={{ ...inputStyle, fontSize: 22, fontWeight: 700 }}
                />
                {/* 快捷选择 */}
                <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                  {["500", "1000", "5000", "10000", "50000"].map(v => (
                    <button key={v} type="button" onClick={() => setSntAmount(v)} style={{
                      padding: "5px 12px", borderRadius: 4, fontSize: 12, cursor: "pointer",
                      background: sntAmount === v ? BNB.yellowDim : "transparent",
                      border: `1px solid ${sntAmount === v ? BNB.yellow : BNB.cardBorder}`,
                      color: sntAmount === v ? BNB.yellow : BNB.textSecondary,
                      fontWeight: sntAmount === v ? 600 : 400,
                    }}>
                      {parseInt(v) >= 1000 ? `${parseInt(v)/1000}K` : v}
                    </button>
                  ))}
                </div>
              </div>

              {/* 费用计算 */}
              <div style={{
                background: BNB.bg, border: `1px solid ${BNB.divider}`,
                borderRadius: 4, padding: "12px 14px", marginBottom: 16,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ fontSize: 13, color: BNB.textSecondary }}>需支付 USDT</span>
                  <span style={{ fontWeight: 700, color: BNB.yellow }}>${usdtCost}</span>
                </div>
                <div style={{ height: 1, background: BNB.divider, marginBottom: 8 }} />
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 13, color: BNB.textSecondary }}>获得 SNT</span>
                  <span style={{ fontWeight: 700, color: BNB.text }}>{parseFloat(sntAmount).toLocaleString()} SNT</span>
                </div>
              </div>

              {/* 选择网络 */}
              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 12, color: BNB.textSecondary, display: "block", marginBottom: 8 }}>选择支付网络</label>
                <select
                  value={network}
                  onChange={e => setNetwork(e.target.value as typeof network)}
                  style={{
                    ...inputStyle,
                    appearance: "none",
                    cursor: "pointer",
                  }}
                >
                  <option value="TRC20" style={{ background: BNB.card }}>TRC20 — 推荐 · 快速到账 · 低手续费</option>
                  <option value="APTOS" style={{ background: BNB.card }}>Aptos — 新一代公链 · 快速安全</option>
                  <option value="ERC20" style={{ background: BNB.card }}>ERC20 — 以太坊网络 · 手续费较高</option>
                  <option value="SOLANA" style={{ background: BNB.card }}>Solana — 高性能公链 · 极速到账</option>
                  <option value="BEP20" style={{ background: BNB.card }}>BSC (BEP20) — 币安智能链 · 快速低费</option>
                </select>
              </div>

              <button
                onClick={handleCreateOrder}
                disabled={createOrderMutation.isPending || !sntAmount || parseFloat(sntAmount) < 100}
                style={{ ...btnPrimary, opacity: createOrderMutation.isPending ? 0.7 : 1 }}
              >
                {createOrderMutation.isPending ? "创建订单中..." : `下一步：支付 $${usdtCost} USDT`}
              </button>
              <div style={{ textAlign: "center", fontSize: 11, color: BNB.textMuted, marginTop: 10 }}>
                购买即视为同意《Sentia 预售协议》
              </div>
            </div>
          </div>
        )}

        {/* ===== 步骤三：USDT 支付 ===== */}
        {step === "pay" && order && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {/* 倒计时提示 */}
            {timeLeft > 0 ? (
              <div style={{ background: BNB.yellowDim, border: `1px solid ${BNB.yellowBorder}`, borderRadius: 4, padding: "12px 16px", display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 32, height: 32, borderRadius: 4, background: BNB.yellowDim, border: `1px solid ${BNB.yellowBorder}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={BNB.yellow} strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                  </svg>
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: BNB.yellow }}>请在 {formatTime(timeLeft)} 内完成支付</div>
                  <div style={{ fontSize: 12, color: BNB.textSecondary }}>订单将在 30 分钟后自动过期</div>
                </div>
              </div>
            ) : (
              <div style={{ background: BNB.redDim, border: `1px solid ${BNB.redBorder}`, borderRadius: 4, padding: "12px 16px", display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 32, height: 32, borderRadius: 4, background: BNB.redDim, border: `1px solid ${BNB.redBorder}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={BNB.red} strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
                  </svg>
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: BNB.red }}>订单已过期</div>
                  <div style={{ fontSize: 12, color: BNB.textSecondary }}>请返回重新创建订单</div>
                </div>
              </div>
            )}

            {/* 应付金额 */}
            <div style={{ ...cardStyle, textAlign: "center" }}>
              <div style={{ fontSize: 12, color: BNB.textSecondary, marginBottom: 6 }}>应付金额</div>
              <div style={{ fontSize: 42, fontWeight: 800, color: BNB.yellow, marginBottom: 4 }}>{order.amount}</div>
              <div style={{ fontSize: 14, color: BNB.textSecondary }}>USDT ({order.network})</div>
              <div style={{ marginTop: 10, fontSize: 13, color: BNB.green }}>
                到账后将获得 <strong>{toSNT(order.amount)} SNT</strong>
              </div>
            </div>

            {/* 二维码 + 收款地址 */}
            <div style={cardStyle}>
              <div style={{ textAlign: "center", marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: BNB.textSecondary, marginBottom: 12 }}>扫码支付</div>
                {qrCode && (
                  <div style={{ display: "inline-block", padding: 12, background: "#fff", borderRadius: 4 }}>
                    <img src={qrCode} alt="QR Code" style={{ width: 160, height: 160, display: "block" }} />
                  </div>
                )}
              </div>

              {/* 收款地址 */}
              <div>
                <div style={{ fontSize: 12, color: BNB.textSecondary, marginBottom: 8 }}>收款地址</div>
                <div style={{ display: "flex", alignItems: "center", background: BNB.bg, borderRadius: 4, padding: "10px 12px", border: `1px solid ${BNB.divider}` }}>
                  <div style={{ flex: 1, fontFamily: "monospace", fontSize: 12, wordBreak: "break-all", color: BNB.text, marginRight: 8 }}>
                    {order.walletAddress}
                  </div>
                  <button onClick={() => copyToClipboard(order.walletAddress)} style={{
                    flexShrink: 0,
                    background: copied ? BNB.greenDim : BNB.yellowDim,
                    border: `1px solid ${copied ? BNB.greenBorder : BNB.yellowBorder}`,
                    borderRadius: 4, padding: "5px 10px", cursor: "pointer",
                    color: copied ? BNB.green : BNB.yellow, fontSize: 12, fontWeight: 600,
                  }}>
                    {copied ? "已复制" : "复制"}
                  </button>
                </div>
              </div>

              {/* 订单号 */}
              <div style={{ marginTop: 12, fontSize: 12, color: BNB.textMuted }}>
                订单号：<span style={{ fontFamily: "monospace", color: BNB.textSecondary }}>{order.orderNo}</span>
              </div>
            </div>

            {/* 重要提示 */}
            <div style={{ background: BNB.yellowDim, border: `1px solid ${BNB.yellowBorder}`, borderRadius: 4, padding: "14px 16px" }}>
              <div style={{ fontWeight: 600, color: BNB.yellow, marginBottom: 8, fontSize: 13 }}>注意事项</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {[
                  `请转账 ${order.amount} USDT，系统按实际到账金额入账`,
                  `请选择 ${order.network} 网络，否则资产将无法找回`,
                  "转账完成后，请点击下方按钮提交确认",
                  "到账后将按 $0.04/SNT 自动换算为 SNT 代币",
                ].map((tip, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, fontSize: 12, color: "#D4A017", lineHeight: 1.5 }}>
                    <span style={{ color: BNB.yellow, flexShrink: 0, fontWeight: 700 }}>{i + 1}.</span>
                    <span>{tip}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 提交确认按钮 */}
            <button
              onClick={handleSubmitTransfer}
              disabled={submitting || timeLeft <= 0}
              style={{ ...btnPrimary, opacity: (submitting || timeLeft <= 0) ? 0.5 : 1, fontSize: 15, padding: "14px" }}
            >
              {submitting ? "提交中..." : "我已完成转账，提交确认"}
            </button>

            <button onClick={() => setStep("buy")} style={btnSecondary}>
              返回修改数量
            </button>
          </div>
        )}

        {/* ===== 步骤四：提交成功 ===== */}
        {step === "submitted" && order && (
          <div style={{ ...cardStyle, textAlign: "center" }}>
            <div style={{
              width: 72, height: 72, borderRadius: "50%", margin: "0 auto 20px",
              background: BNB.greenDim,
              border: `2px solid ${BNB.greenBorder}`,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={BNB.green} strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 10, color: BNB.text }}>转账确认已提交</h2>
            <p style={{ fontSize: 13, color: BNB.textSecondary, lineHeight: 1.7, marginBottom: 24 }}>
              系统正在扫描链上交易<br />确认到账后将自动记录您的 SNT 代币
            </p>

            {/* 订单摘要 */}
            <div style={{ background: BNB.bg, border: `1px solid ${BNB.divider}`, borderRadius: 4, padding: "14px 16px", marginBottom: 20, textAlign: "left" }}>
              {[
                { label: "支付金额", value: `${order.amount} USDT`, color: BNB.yellow },
                { label: "预计获得", value: `${toSNT(order.amount)} SNT`, color: BNB.green },
                { label: "网络", value: order.network, color: BNB.text },
                { label: "订单号", value: order.orderNo, color: BNB.textSecondary, mono: true },
              ].map((row, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", marginBottom: i < 3 ? 10 : 0 }}>
                  <span style={{ fontSize: 13, color: BNB.textSecondary }}>{row.label}</span>
                  <span style={{ fontWeight: 600, color: row.color, fontFamily: row.mono ? "monospace" : undefined, fontSize: row.mono ? 11 : 13 }}>
                    {row.value}
                  </span>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button onClick={() => setStep("orders")} style={btnPrimary}>查看我的订单</button>
              <button onClick={() => navigate("/sentia")} style={btnSecondary}>返回 Sentia 首页</button>
            </div>
          </div>
        )}

        {/* ===== 我的订单 ===== */}
        {step === "orders" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: BNB.text }}>我的订单</h2>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                    onClick={() => alert("提现功能即将开放，敬请期待")}
                    style={{
                      background: "transparent",
                      border: `1px solid ${BNB.cardBorder}`,
                      borderRadius: 4, padding: "6px 12px",
                      color: BNB.textSecondary, fontSize: 12, fontWeight: 600, cursor: "pointer",
                    }}
                  >提现至钱包</button>
                <button onClick={() => setStep("buy")} style={{
                  background: BNB.yellow, border: "none", borderRadius: 4,
                  padding: "6px 14px", color: "#0B0E11", fontSize: 12, cursor: "pointer", fontWeight: 600,
                }}>继续购买</button>
              </div>
            </div>

            {ordersQuery.isLoading ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: BNB.textMuted }}>加载中...</div>
            ) : !ordersQuery.data || ordersQuery.data.length === 0 ? (
              <div style={{ ...cardStyle, textAlign: "center", padding: "40px 24px" }}>
                <div style={{ width: 48, height: 48, borderRadius: "50%", background: BNB.bg, border: `1px solid ${BNB.divider}`, margin: "0 auto 16px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={BNB.textMuted} strokeWidth="1.5">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                  </svg>
                </div>
                <div style={{ color: BNB.textSecondary, marginBottom: 16 }}>暂无订单记录</div>
                <button onClick={() => setStep("buy")} style={{ ...btnPrimary, maxWidth: 200, margin: "0 auto" }}>立即购买 SNT</button>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {ordersQuery.data.map((o: any) => {
                const cfg = statusConfig[o.status] || statusConfig.pending;
                const isClickable = o.status === "pending" || o.status === "submitted";
                return (
                  <div
                    key={o.id}
                    onClick={() => { if (isClickable) handleResumeOrder(o); }}
                    style={{
                      background: BNB.card,
                      border: isClickable ? `1px solid ${BNB.yellowBorder}` : `1px solid ${BNB.divider}`,
                      borderRadius: 6, padding: "14px 16px",
                      cursor: isClickable ? "pointer" : "default",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                      <div>
                        <div style={{ fontSize: 18, fontWeight: 800, color: BNB.yellow }}>{o.amount} USDT</div>
                        <div style={{ fontSize: 12, color: BNB.textSecondary, marginTop: 3 }}>
                          {o.status === "completed" ? "已到账" : "预计"} {toSNT(o.amount)} SNT
                        </div>
                      </div>
                      <span style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`, borderRadius: 2, padding: "3px 10px", fontSize: 11, fontWeight: 600 }}>
                        {cfg.label}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: BNB.textMuted, display: "flex", justifyContent: "space-between" }}>
                      <span>{o.network}</span>
                      <span>{formatDate(o.createdAt)}</span>
                    </div>
                    <div style={{ fontSize: 11, color: BNB.textMuted, marginTop: 4, fontFamily: "monospace" }}>
                      {o.orderNo}
                    </div>
                    {o.txnHash && (
                      <div style={{ fontSize: 11, color: BNB.textMuted, marginTop: 4, fontFamily: "monospace", wordBreak: "break-all" }}>
                        TxHash: {o.txnHash}
                      </div>
                    )}
                    {isClickable && (
                      <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${BNB.divider}`, fontSize: 12, color: BNB.yellow, display: "flex", alignItems: "center", gap: 6 }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={BNB.yellow} strokeWidth="2">
                          <circle cx="12" cy="12" r="10"/><polyline points="12 8 12 12 14 14"/>
                        </svg>
                        点击查看支付地址 / 二维码，继续完成转账
                      </div>
                    )}
                  </div>
                );
              })}
              </div>
            )}
          </div>
        )}

      </div>
    </div>

    {/* ===== 划转弹窗 ===== */}
    {showTransferModal && (
      <div
        onClick={() => { setShowTransferModal(false); setTransferTarget(null); setTransferKeyword(""); setTransferAmount(""); setTransferMsg(null); }}
        style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}
      >
        <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 440, background: BNB.card, borderRadius: "12px 12px 0 0", padding: "24px 20px 40px", maxHeight: "90vh", overflowY: "auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: BNB.text }}>SNT 划转</div>
            <button onClick={() => { setShowTransferModal(false); setTransferTarget(null); setTransferKeyword(""); setTransferAmount(""); setTransferMsg(null); }} style={{ background: "none", border: "none", cursor: "pointer", color: BNB.textMuted, fontSize: 22, lineHeight: 1, padding: 4 }}>×</button>
          </div>

          {/* 可划转余额 */}
          <div style={{ background: BNB.bg, border: `1px solid ${BNB.divider}`, borderRadius: 4, padding: "12px 14px", marginBottom: 20 }}>
            <div style={{ fontSize: 11, color: BNB.textMuted, marginBottom: 4 }}>可划转余额</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: BNB.yellow }}>
              {totalSNT !== null ? totalSNT.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 }) : "--"} <span style={{ fontSize: 13, fontWeight: 600, color: BNB.textMuted }}>SNT</span>
            </div>
          </div>

          {/* 搜索用户 */}
          {!transferTarget ? (
            <>
              <div style={{ fontSize: 13, color: BNB.textSecondary, marginBottom: 6 }}>输入对方用户名</div>
              <div style={{ position: "relative", marginBottom: 8 }}>
                <input
                  style={{ ...inputStyle, paddingRight: 80 }}
                  placeholder="搜索用户名（至少 2 个字符）"
                  value={transferKeyword}
                  onChange={e => { setTransferKeyword(e.target.value); setTransferSearchEnabled(false); }}
                  onKeyDown={e => { if (e.key === "Enter") setTransferSearchEnabled(true); }}
                />
                <button
                  onClick={() => setTransferSearchEnabled(true)}
                  style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: BNB.yellow, border: "none", borderRadius: 3, padding: "5px 12px", color: "#0B0E11", fontWeight: 700, fontSize: 12, cursor: "pointer" }}
                >搜索</button>
              </div>
              {/* 搜索结果 */}
              {searchUsersQuery.isFetching && <div style={{ fontSize: 12, color: BNB.textMuted, padding: "8px 0" }}>搜索中...</div>}
              {searchUsersQuery.data && !searchUsersQuery.isFetching && (
                searchUsersQuery.data.length === 0
                  ? <div style={{ fontSize: 12, color: BNB.textMuted, padding: "8px 0" }}>未找到用户</div>
                  : <div style={{ border: `1px solid ${BNB.divider}`, borderRadius: 4, overflow: "hidden", marginBottom: 8 }}>
                      {(searchUsersQuery.data as any[]).map((u: any) => (
                        <div key={u.id} onClick={() => { setTransferTarget(u); setTransferMsg(null); }}
                          style={{ padding: "10px 14px", cursor: "pointer", borderBottom: `1px solid ${BNB.divider}`, background: BNB.bg, display: "flex", alignItems: "center", gap: 10 }}
                        >
                          <div style={{ width: 32, height: 32, borderRadius: "50%", background: BNB.yellowDim, border: `1px solid ${BNB.yellowBorder}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: BNB.yellow }}>{(u.name || u.username).charAt(0).toUpperCase()}</span>
                          </div>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: BNB.text }}>{u.name || u.username}</div>
                            <div style={{ fontSize: 11, color: BNB.textMuted }}>@{u.username}</div>
                          </div>
                        </div>
                      ))}
                    </div>
              )}
            </>
          ) : (
            <>
              {/* 已选择用户 */}
              <div style={{ background: BNB.bg, border: `1px solid ${BNB.greenBorder}`, borderRadius: 4, padding: "12px 14px", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: BNB.greenDim, border: `1px solid ${BNB.greenBorder}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: BNB.green }}>{(transferTarget.name || transferTarget.username).charAt(0).toUpperCase()}</span>
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: BNB.text }}>{transferTarget.name || transferTarget.username}</div>
                    <div style={{ fontSize: 11, color: BNB.textMuted }}>@{transferTarget.username}</div>
                  </div>
                </div>
                <button onClick={() => { setTransferTarget(null); setTransferMsg(null); }} style={{ background: "none", border: `1px solid ${BNB.cardBorder}`, borderRadius: 3, padding: "4px 10px", color: BNB.textSecondary, fontSize: 11, cursor: "pointer" }}>更换</button>
              </div>

              <div style={{ fontSize: 13, color: BNB.textSecondary, marginBottom: 6 }}>划转数量（SNT）</div>
              <input
                style={{ ...inputStyle, fontSize: 20, fontWeight: 700, marginBottom: 4 }}
                type="number"
                placeholder="输入划转 SNT 数量"
                value={transferAmount}
                onChange={e => setTransferAmount(e.target.value)}
              />
              <div style={{ fontSize: 11, color: BNB.textMuted, marginBottom: 12 }}>可划转：{totalSNT !== null ? totalSNT.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 }) : "--"} SNT</div>

              <div style={{ fontSize: 13, color: BNB.textSecondary, marginBottom: 6 }}>备注（可选）</div>
              <input
                style={{ ...inputStyle, marginBottom: 16 }}
                placeholder="输入备注"
                value={transferRemark}
                onChange={e => setTransferRemark(e.target.value)}
              />

              {transferMsg && (
                <div style={{ fontSize: 12, color: transferMsg.type === "ok" ? BNB.green : BNB.red, marginBottom: 12, padding: "8px 12px", background: transferMsg.type === "ok" ? BNB.greenDim : BNB.redDim, borderRadius: 4, border: `1px solid ${transferMsg.type === "ok" ? BNB.greenBorder : BNB.redBorder}` }}>{transferMsg.text}</div>
              )}

              <button
                disabled={transferLoading || !transferAmount || parseFloat(transferAmount) <= 0}
                onClick={async () => {
                  const amt = parseFloat(transferAmount);
                  if (!amt || amt <= 0) { setTransferMsg({ type: "err", text: "请输入有效的划转数量" }); return; }
                  if (totalSNT !== null && amt > totalSNT) { setTransferMsg({ type: "err", text: "SNT 余额不足" }); return; }
                  setTransferLoading(true);
                  try {
                    await transferSNTMutation.mutateAsync({ toUserId: transferTarget!.id, sntAmount: amt, remark: transferRemark || undefined });
                    setTransferMsg({ type: "ok", text: `成功划转 ${amt.toLocaleString()} SNT 至 @${transferTarget!.username}` });
                    setTransferAmount("");
                    setTransferRemark("");
                    ordersQuery.refetch();
                  } catch (err: any) {
                    setTransferMsg({ type: "err", text: err?.message || "划转失败，请重试" });
                  } finally {
                    setTransferLoading(false);
                  }
                }}
                style={{ ...btnPrimary, opacity: (!transferAmount || parseFloat(transferAmount) <= 0 || transferLoading) ? 0.5 : 1 }}
              >{transferLoading ? "划转中..." : "确认划转"}</button>
            </>
          )}
        </div>
      </div>
    )}

    {/* ===== 提现弹窗 ===== */}  {showWithdrawModal && (
      <div
        onClick={() => setShowWithdrawModal(false)}
        style={{
          position: "fixed", inset: 0, zIndex: 200,
          background: "rgba(0,0,0,0.7)",
          display: "flex", alignItems: "flex-end", justifyContent: "center",
        }}
      >
        <div
          onClick={e => e.stopPropagation()}
          style={{
            width: "100%", maxWidth: 440,
            background: BNB.card,
            borderRadius: "12px 12px 0 0",
            padding: "24px 20px 40px",
            maxHeight: "85vh",
            overflowY: "auto",
          }}
        >
          {/* 弹窗标题 */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: BNB.text }}>
                {withdrawMode === "withdraw" ? "提现 SNT" : "绑定 BSC 钱包"}
              </div>
              <div style={{ fontSize: 12, color: BNB.textMuted, marginTop: 2 }}>网络：BNB Smart Chain (BEP20)</div>
            </div>
            <button
              onClick={() => setShowWithdrawModal(false)}
              style={{ background: "none", border: "none", cursor: "pointer", color: BNB.textMuted, fontSize: 22, lineHeight: 1, padding: 4 }}
            >×</button>
          </div>

          {/* 网络标识 */}
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            background: BNB.yellowDim, border: `1px solid ${BNB.yellowBorder}`,
            borderRadius: 4, padding: "6px 12px", marginBottom: 20,
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill={BNB.yellow}>
              <circle cx="12" cy="12" r="10"/>
            </svg>
            <span style={{ fontSize: 12, fontWeight: 600, color: BNB.yellow }}>BNB Smart Chain · BEP20</span>
          </div>

          {/* 提现模式：已绑定地址 */}
          {withdrawMode === "withdraw" && (
            <>
              <div style={{ background: BNB.bg, border: `1px solid ${BNB.divider}`, borderRadius: 4, padding: "12px 14px", marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: BNB.textMuted, marginBottom: 4 }}>提现至（已绑定地址）</div>
                    <div style={{ fontSize: 12, color: BNB.text, fontFamily: "monospace", wordBreak: "break-all", lineHeight: 1.6 }}>{savedBscAddress}</div>
                  </div>
                  <button
                    onClick={() => { setNewBscAddress(""); setBindConfirmed(false); setWithdrawMsg(null); setWithdrawMode("bind"); }}
                    style={{ background: "none", border: `1px solid ${BNB.cardBorder}`, borderRadius: 3, padding: "4px 10px", color: BNB.textSecondary, fontSize: 11, cursor: "pointer", marginLeft: 10, flexShrink: 0 }}
                  >更换</button>
                </div>
              </div>
              <div style={{ fontSize: 13, color: BNB.textSecondary, marginBottom: 6 }}>提现数量（SNT）</div>
              <input
                style={{ ...inputStyle, marginBottom: 4 }}
                type="number"
                placeholder="输入提现 SNT 数量"
                value={withdrawAmount}
                onChange={e => setWithdrawAmount(e.target.value)}
              />
              <div style={{ fontSize: 11, color: BNB.textMuted, marginBottom: 4 }}>
                可提现：{totalSNT !== null ? totalSNT.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 }) : "--"} SNT
              </div>
              <div style={{ fontSize: 11, color: BNB.textMuted, marginBottom: 16 }}>提现申请提交后由人工审核，预计 1–3 个工作日到账</div>
              {withdrawMsg && (
                <div style={{ fontSize: 12, color: withdrawMsg.type === "ok" ? BNB.green : BNB.red, marginBottom: 12 }}>{withdrawMsg.text}</div>
              )}
              <button
                disabled={withdrawLoading || !withdrawAmount}
                onClick={async () => {
                  const amt = parseFloat(withdrawAmount);
                  if (!amt || amt <= 0) { setWithdrawMsg({ type: "err", text: "请输入有效的提现数量" }); return; }
                  if (totalSNT !== null && amt > totalSNT) { setWithdrawMsg({ type: "err", text: "提现数量不能超过可用持仓" }); return; }
                  setWithdrawLoading(true);
                  try {
                    await requestWithdrawMutation.mutateAsync({
                      amount: amt,
                      paymentAccountId: 0,
                      remark: `SNT提现至BSC:${savedBscAddress}`,
                    });
                    setWithdrawMsg({ type: "ok", text: `提现申请已提交！${amt.toLocaleString()} SNT 将发送至 ${savedBscAddress!.slice(0, 8)}...${savedBscAddress!.slice(-6)}` });
                    setWithdrawAmount("");
                  } catch (err: any) {
                    setWithdrawMsg({ type: "err", text: err?.message || "提交失败，请稍后重试" });
                  } finally {
                    setWithdrawLoading(false);
                  }
                }}
                style={{ ...btnPrimary, opacity: (!withdrawAmount || withdrawLoading) ? 0.5 : 1 }}
              >{withdrawLoading ? "提交中..." : "确认提现申请"}</button>
            </>
          )}

          {/* 绑定模式：首次绑定或更换地址 */}
          {withdrawMode === "bind" && (
            <>
              {/* 重要警告 */}
              <div style={{
                background: "rgba(246,70,93,0.08)", border: "1px solid rgba(246,70,93,0.4)",
                borderRadius: 6, padding: "14px 16px", marginBottom: 20,
              }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={BNB.red} strokeWidth="2" style={{ flexShrink: 0, marginTop: 1 }}>
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                    <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                  </svg>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: BNB.red, marginBottom: 6 }}>重要提示：必须使用个人钱包地址</div>
                    <div style={{ fontSize: 12, color: "#EAECEF", lineHeight: 1.7 }}>
                      未上币安交易所之前，<strong style={{ color: BNB.red }}>严禁填写币安、OKX 等交易所充币地址或平台账号</strong>。
                      必须使用个人钱包（如 MetaMask、Trust Wallet、Binance Web3 Wallet 等）的 BEP20 地址。
                      转账至交易所将导致资产永久丢失。
                    </div>
                  </div>
                </div>
              </div>
              {/* 确认勾选 */}
              <label style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 20, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={bindConfirmed}
                  onChange={e => setBindConfirmed(e.target.checked)}
                  style={{ marginTop: 2, accentColor: BNB.yellow, width: 16, height: 16, flexShrink: 0 }}
                />
                <span style={{ fontSize: 12, color: BNB.textSecondary, lineHeight: 1.6 }}>
                  我已了解上述风险，我将要绑定的是<strong style={{ color: BNB.text }}>个人钱包的 BEP20 地址</strong>，不是交易所充币地址
                </span>
              </label>
              <div style={{ fontSize: 13, color: BNB.textSecondary, marginBottom: 6 }}>BSC 钱包地址（0x 开头，42 位）</div>
              <input
                style={{ ...inputStyle, marginBottom: 8 }}
                placeholder="输入 BNB Smart Chain (BEP20) 地址"
                value={newBscAddress}
                onChange={e => setNewBscAddress(e.target.value)}
              />
              <div style={{ fontSize: 11, color: BNB.textMuted, marginBottom: 16 }}>绑定后每次提现将自动使用此地址，可点击“更换”修改</div>
              {withdrawMsg && (
                <div style={{ fontSize: 12, color: withdrawMsg.type === "ok" ? BNB.green : BNB.red, marginBottom: 12 }}>{withdrawMsg.text}</div>
              )}
              <div style={{ display: "flex", gap: 10 }}>
                {savedBscAddress && (
                  <button
                    onClick={() => { setWithdrawMode("withdraw"); setWithdrawMsg(null); }}
                    style={{ ...btnSecondary, flex: 1 }}
                  >取消</button>
                )}
                <button
                  disabled={withdrawLoading || !newBscAddress.trim() || !bindConfirmed}
                  onClick={async () => {
                    const addr = newBscAddress.trim();
                    if (!addr.startsWith("0x") || addr.length !== 42) {
                      setWithdrawMsg({ type: "err", text: "请输入有效的 BEP20 地址（0x 开头，42 位）" });
                      return;
                    }
                    setWithdrawLoading(true);
                    try {
                      await addBscWalletMutation.mutateAsync({
                        walletType: "blockchain",
                        network: "BEP20",
                        walletAddress: addr,
                        notes: "SNT 提现钱包",
                      });
                      await bscWalletsQuery.refetch();
                      setWithdrawMode("withdraw");
                      setWithdrawMsg({ type: "ok", text: "钱包地址绑定成功！" });
                    } catch (err: any) {
                      setWithdrawMsg({ type: "err", text: err?.message || "绑定失败，请重试" });
                    } finally {
                      setWithdrawLoading(false);
                    }
                  }}
                  style={{ ...btnPrimary, flex: 2, opacity: (!newBscAddress.trim() || !bindConfirmed || withdrawLoading) ? 0.5 : 1 }}
                >{withdrawLoading ? "绑定中..." : "确认绑定"}</button>
              </div>
            </>
          )}
        </div>
      </div>
    )}
    </>
  );
}
