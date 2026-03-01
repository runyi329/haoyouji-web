/**
 * Sentia (SNT) 买币页 / 定向邀请页
 * 设计风格：深空科技美学 × Web3 Premium
 * 步骤：登录/注册 → 填写购买数量 → USDT 支付（嫁接钱包充值流程）→ 完成
 */
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "../lib/trpc";
import QRCode from "qrcode";

const SENTIA_ICON = "https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/sentia-icon-v1_cfb26d59.png";
const SNT_PRICE = 0.04; // USDT per SNT

type Step = "login" | "buy" | "pay" | "submitted" | "orders";

// ---- 样式常量 ----
const inputStyle: React.CSSProperties = {
  width: "100%", padding: "12px 14px", borderRadius: 10,
  background: "rgba(255,255,255,0.06)", border: "1px solid rgba(124,58,237,0.3)",
  color: "#F8FAFC", fontSize: 14, outline: "none", boxSizing: "border-box",
};
const cardStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(124,58,237,0.25)",
  borderRadius: 20, padding: "24px 20px",
  backdropFilter: "blur(10px)",
};
const btnPrimary: React.CSSProperties = {
  width: "100%", background: "linear-gradient(135deg, #7C3AED, #A855F7)",
  border: "none", borderRadius: 12, padding: "14px",
  color: "#fff", fontWeight: 700, fontSize: 16, cursor: "pointer",
  boxShadow: "0 0 20px rgba(124,58,237,0.4)",
};
const btnSecondary: React.CSSProperties = {
  width: "100%", background: "transparent",
  border: "1px solid rgba(124,58,237,0.3)", borderRadius: 12, padding: "14px",
  color: "#A855F7", fontWeight: 600, fontSize: 15, cursor: "pointer",
};

export default function SentiaBuy() {
  const [, navigate] = useLocation();
  const [step, setStep] = useState<Step>("login");
  const [isRegister, setIsRegister] = useState(false);

  // 登录/注册表单
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  // 购买数量
  const [sntAmount, setSntAmount] = useState("1000");

  // USDT 支付（嫁接充值流程）
  const [network, setNetwork] = useState<"TRC20" | "ERC20" | "BEP20" | "APTOS" | "SOLANA">("TRC20");
  const [order, setOrder] = useState<any>(null);
  const [qrCode, setQrCode] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);

  // tRPC mutations
  const loginMutation = trpc.auth.loginWithPassword.useMutation();
  const registerMutation = trpc.auth.registerWithPassword.useMutation();
  const createOrderMutation = trpc.recharge.createOrder.useMutation();
  const submitTransferMutation = trpc.recharge.submitTransfer.useMutation();
  const ordersQuery = trpc.recharge.getMyOrders.useQuery(
    { limit: 30 },
    { enabled: step === "orders" }
  );

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

  // 复制
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
      if (isRegister) {
        await registerMutation.mutateAsync({ username, password, inviteCode: inviteCode || undefined });
      } else {
        await loginMutation.mutateAsync({ username, password });
      }
      setStep("buy");
    } catch (err: any) {
      setAuthError(err.message || (isRegister ? "注册失败，请重试" : "用户名或密码错误"));
    } finally {
      setAuthLoading(false);
    }
  };

  // 创建充值订单（以 USDT 金额为准）
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
  const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
    pending:   { label: "待支付", color: "#F59E0B", bg: "rgba(245,158,11,0.15)" },
    submitted: { label: "确认中", color: "#60A5FA", bg: "rgba(96,165,250,0.15)" },
    completed: { label: "已到账", color: "#34D399", bg: "rgba(52,211,153,0.15)" },
    expired:   { label: "已过期", color: "#94A3B8", bg: "rgba(148,163,184,0.1)" },
    cancelled: { label: "已取消", color: "#F87171", bg: "rgba(248,113,113,0.15)" },
  };

  const formatDate = (d: string) => {
    const dt = new Date(d);
    return `${(dt.getMonth()+1).toString().padStart(2,"0")}-${dt.getDate().toString().padStart(2,"0")} ${dt.getHours().toString().padStart(2,"0")}:${dt.getMinutes().toString().padStart(2,"0")}`;
  };

  // SNT 数量（根据 USDT 实际到账额换算）
  const toSNT = (usdt: string | number) => (parseFloat(String(usdt)) / SNT_PRICE).toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 });

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #0A0A1A 0%, #0F0A2E 40%, #1A0A3E 70%, #0A0A1A 100%)",
      color: "#F8FAFC", fontFamily: "'Inter', sans-serif", position: "relative",
    }}>
      {/* 背景光晕 */}
      <div style={{
        position: "fixed", top: -150, left: "50%", transform: "translateX(-50%)",
        width: 500, height: 500,
        background: "radial-gradient(circle, rgba(124,58,237,0.2) 0%, transparent 70%)",
        pointerEvents: "none", zIndex: 0,
      }} />

      {/* 导航栏 */}
      <nav style={{
        position: "sticky", top: 0, zIndex: 100,
        background: "rgba(10,10,26,0.9)", backdropFilter: "blur(12px)",
        borderBottom: "1px solid rgba(124,58,237,0.2)",
        padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <button onClick={() => navigate("/sentia")} style={{
          background: "transparent", border: "none", color: "#94A3B8", cursor: "pointer", fontSize: 14,
          display: "flex", alignItems: "center", gap: 6,
        }}>← 返回首页</button>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <img src={SENTIA_ICON} alt="SNT" style={{ width: 24, height: 24, borderRadius: "50%" }} />
          <span style={{ fontWeight: 700, fontSize: 15, background: "linear-gradient(90deg, #A855F7, #F59E0B)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            SENTIA
          </span>
        </div>
        {step !== "login" && (
          <button onClick={() => setStep("orders")} style={{
            background: "transparent", border: "1px solid rgba(124,58,237,0.3)", borderRadius: 8,
            padding: "6px 12px", color: "#A855F7", fontSize: 12, cursor: "pointer",
          }}>我的订单</button>
        )}
      </nav>

      <div style={{ position: "relative", zIndex: 1, padding: "24px 16px 60px", maxWidth: 420, margin: "0 auto" }}>

        {/* 步骤指示器 */}
        {step !== "orders" && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 28 }}>
            {[
              { key: "login", label: "登录/注册" },
              { key: "buy",   label: "购买 SNT" },
              { key: "pay",   label: "USDT 支付" },
              { key: "submitted", label: "完成" },
            ].map((s, i) => {
              const stepOrder = ["login", "buy", "pay", "submitted"];
              const currentIdx = stepOrder.indexOf(step);
              const thisIdx = stepOrder.indexOf(s.key);
              const isDone = currentIdx > thisIdx;
              const isActive = step === s.key;
              return (
                <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{
                    width: 26, height: 26, borderRadius: "50%",
                    background: isDone ? "rgba(124,58,237,0.4)" : isActive ? "linear-gradient(135deg, #7C3AED, #A855F7)" : "rgba(255,255,255,0.08)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, fontWeight: 700, color: "#fff",
                    boxShadow: isActive ? "0 0 12px rgba(124,58,237,0.6)" : "none",
                  }}>
                    {isDone ? "✓" : i + 1}
                  </div>
                  <span style={{ fontSize: 11, color: isActive ? "#A855F7" : isDone ? "#7C3AED" : "#475569" }}>{s.label}</span>
                  {i < 3 && <div style={{ width: 16, height: 1, background: "rgba(124,58,237,0.25)" }} />}
                </div>
              );
            })}
          </div>
        )}

        {/* ===== 步骤一：登录/注册 ===== */}
        {step === "login" && (
          <div style={cardStyle}>
            <div style={{ textAlign: "center", marginBottom: 24 }}>
              <img src={SENTIA_ICON} alt="SNT" style={{ width: 56, height: 56, borderRadius: "50%", marginBottom: 12, boxShadow: "0 0 20px rgba(124,58,237,0.5)" }} />
              <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>{isRegister ? "创建账户" : "欢迎回来"}</h2>
              <p style={{ fontSize: 13, color: "#94A3B8" }}>
                {isRegister ? "注册后即可参与 Sentia 预售" : "登录您的账户参与 SNT 预售"}
              </p>
            </div>

            <form onSubmit={handleAuth} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, color: "#94A3B8", display: "block", marginBottom: 6 }}>用户名</label>
                <input
                  type="text" placeholder="请输入用户名" required value={username}
                  onChange={e => setUsername(e.target.value)} style={inputStyle}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, color: "#94A3B8", display: "block", marginBottom: 6 }}>密码</label>
                <input
                  type="password" placeholder="请输入密码" required value={password}
                  onChange={e => setPassword(e.target.value)} style={inputStyle}
                />
              </div>
              {isRegister && (
                <div>
                  <label style={{ fontSize: 12, color: "#94A3B8", display: "block", marginBottom: 6 }}>邀请码（选填）</label>
                  <input
                    type="text" placeholder="请输入邀请码" value={inviteCode}
                    onChange={e => setInviteCode(e.target.value)} style={inputStyle}
                  />
                </div>
              )}
              {authError && (
                <div style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#F87171" }}>
                  {authError}
                </div>
              )}
              <button type="submit" disabled={authLoading} style={{ ...btnPrimary, opacity: authLoading ? 0.7 : 1 }}>
                {authLoading ? "处理中..." : isRegister ? "注册并参与预售" : "登录"}
              </button>
            </form>

            <div style={{ textAlign: "center", marginTop: 16 }}>
              <button onClick={() => { setIsRegister(!isRegister); setAuthError(""); }}
                style={{ background: "none", border: "none", color: "#A855F7", fontSize: 13, cursor: "pointer" }}>
                {isRegister ? "已有账户？立即登录" : "没有账户？免费注册"}
              </button>
            </div>
          </div>
        )}

        {/* ===== 步骤二：填写购买数量 ===== */}
        {step === "buy" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* 价格卡 */}
            <div style={{
              background: "linear-gradient(135deg, rgba(124,58,237,0.15), rgba(168,85,247,0.1))",
              border: "1px solid rgba(124,58,237,0.3)", borderRadius: 16, padding: "16px 20px",
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <div>
                <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 4 }}>合伙人专属价格</div>
                <div style={{ fontSize: 28, fontWeight: 900, color: "#F59E0B" }}>$0.04</div>
                <div style={{ fontSize: 11, color: "#64748B" }}>USDT / SNT</div>
              </div>
              <img src={SENTIA_ICON} alt="SNT" style={{ width: 56, height: 56, borderRadius: "50%", boxShadow: "0 0 20px rgba(124,58,237,0.5)" }} />
            </div>

            {/* 购买表单 */}
            <div style={cardStyle}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, color: "#94A3B8", display: "block", marginBottom: 8 }}>购买数量（SNT）</label>
                <input
                  type="number" value={sntAmount} onChange={e => setSntAmount(e.target.value)}
                  min="100" step="100"
                  style={{ ...inputStyle, fontSize: 22, fontWeight: 700 }}
                />
                {/* 快捷选择 */}
                <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                  {["500", "1000", "5000", "10000", "50000"].map(v => (
                    <button key={v} type="button" onClick={() => setSntAmount(v)} style={{
                      padding: "6px 12px", borderRadius: 8, fontSize: 12, cursor: "pointer",
                      background: sntAmount === v ? "rgba(124,58,237,0.4)" : "rgba(255,255,255,0.06)",
                      border: `1px solid ${sntAmount === v ? "#A855F7" : "rgba(124,58,237,0.2)"}`,
                      color: sntAmount === v ? "#A855F7" : "#94A3B8",
                    }}>
                      {parseInt(v) >= 1000 ? `${parseInt(v)/1000}k` : v}
                    </button>
                  ))}
                </div>
              </div>

              {/* 费用计算 */}
              <div style={{
                background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)",
                borderRadius: 12, padding: "14px 16px", marginBottom: 16,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 13, color: "#94A3B8" }}>需支付 USDT</span>
                  <span style={{ fontWeight: 700, color: "#F59E0B" }}>${usdtCost}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 13, color: "#94A3B8" }}>获得 SNT</span>
                  <span style={{ fontWeight: 700, color: "#A855F7" }}>{parseFloat(sntAmount).toLocaleString()} SNT</span>
                </div>
              </div>

              {/* 选择网络 */}
              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 12, color: "#94A3B8", display: "block", marginBottom: 8 }}>选择支付网络</label>
                <select
                  value={network}
                  onChange={e => setNetwork(e.target.value as typeof network)}
                  style={{
                    ...inputStyle,
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(124,58,237,0.3)",
                    color: "#F8FAFC",
                    appearance: "none",
                  }}
                >
                  <option value="TRC20" style={{ background: "#1A0A3E" }}>TRC20 — 推荐 · 快速到账 · 低手续费</option>
                  <option value="APTOS" style={{ background: "#1A0A3E" }}>Aptos — 新一代公链 · 快速安全</option>
                  <option value="ERC20" style={{ background: "#1A0A3E" }}>ERC20 — 以太坊网络 · 手续费较高</option>
                  <option value="SOLANA" style={{ background: "#1A0A3E" }}>Solana — 高性能公链 · 极速到账</option>
                  <option value="BEP20" style={{ background: "#1A0A3E" }}>BSC (BEP20) — 币安智能链 · 快速低费</option>
                </select>
              </div>

              <button
                onClick={handleCreateOrder}
                disabled={createOrderMutation.isPending || !sntAmount || parseFloat(sntAmount) < 100}
                style={{ ...btnPrimary, opacity: createOrderMutation.isPending ? 0.7 : 1 }}
              >
                {createOrderMutation.isPending ? "创建订单中..." : `下一步：支付 $${usdtCost} USDT`}
              </button>
              <div style={{ textAlign: "center", fontSize: 11, color: "#475569", marginTop: 10 }}>
                购买即视为同意《Sentia 预售协议》
              </div>
            </div>
          </div>
        )}

        {/* ===== 步骤三：USDT 支付（嫁接充值流程）===== */}
        {step === "pay" && order && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* 倒计时 */}
            {timeLeft > 0 ? (
              <div style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 12, padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 20 }}>⏱</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#F59E0B" }}>请在 {formatTime(timeLeft)} 内完成支付</div>
                  <div style={{ fontSize: 12, color: "#94A3B8" }}>订单将在30分钟后自动过期</div>
                </div>
              </div>
            ) : (
              <div style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)", borderRadius: 12, padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 20 }}>⚠️</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#F87171" }}>订单已过期</div>
                  <div style={{ fontSize: 12, color: "#94A3B8" }}>请返回重新创建订单</div>
                </div>
              </div>
            )}

            {/* 应付金额 */}
            <div style={{ ...cardStyle, textAlign: "center" }}>
              <div style={{ fontSize: 13, color: "#94A3B8", marginBottom: 6 }}>应付金额</div>
              <div style={{ fontSize: 40, fontWeight: 900, color: "#F59E0B", marginBottom: 4 }}>{order.amount}</div>
              <div style={{ fontSize: 14, color: "#94A3B8" }}>USDT ({order.network})</div>
              <div style={{ marginTop: 8, fontSize: 13, color: "#A855F7" }}>
                到账后将获得 <strong>{toSNT(order.amount)} SNT</strong>
              </div>
            </div>

            {/* 二维码 */}
            <div style={cardStyle}>
              <div style={{ textAlign: "center", marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: "#94A3B8", marginBottom: 12 }}>扫码支付</div>
                {qrCode && (
                  <div style={{ display: "inline-block", padding: 12, background: "#fff", borderRadius: 12 }}>
                    <img src={qrCode} alt="QR Code" style={{ width: 160, height: 160, display: "block" }} />
                  </div>
                )}
              </div>

              {/* 收款地址 */}
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 12, color: "#94A3B8", marginBottom: 8 }}>收款地址</div>
                <div style={{ display: "flex", alignItems: "center", background: "rgba(255,255,255,0.05)", borderRadius: 10, padding: "10px 12px", border: "1px solid rgba(124,58,237,0.2)" }}>
                  <div style={{ flex: 1, fontFamily: "monospace", fontSize: 12, wordBreak: "break-all", color: "#CBD5E1", marginRight: 8 }}>
                    {order.walletAddress}
                  </div>
                  <button onClick={() => copyToClipboard(order.walletAddress)} style={{
                    flexShrink: 0, background: copied ? "rgba(52,211,153,0.2)" : "rgba(124,58,237,0.2)",
                    border: "none", borderRadius: 8, padding: "6px 10px", cursor: "pointer",
                    color: copied ? "#34D399" : "#A855F7", fontSize: 12, fontWeight: 600,
                  }}>
                    {copied ? "已复制" : "复制"}
                  </button>
                </div>
              </div>

              {/* 订单号 */}
              <div style={{ marginTop: 12, fontSize: 12, color: "#64748B" }}>
                订单号：<span style={{ fontFamily: "monospace", color: "#94A3B8" }}>{order.orderNo}</span>
              </div>
            </div>

            {/* 重要提示 */}
            <div style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 12, padding: "14px 16px" }}>
              <div style={{ fontWeight: 600, color: "#F59E0B", marginBottom: 8 }}>⚠️ 重要提示</div>
              <ul style={{ fontSize: 12, color: "#D97706", lineHeight: 1.8, paddingLeft: 0, listStyle: "none", margin: 0 }}>
                <li>• 请转账 <strong>{order.amount} USDT</strong>，系统按实际到账金额入账</li>
                <li>• 请选择 <strong>{order.network}</strong> 网络，否则资产将无法找回</li>
                <li>• 转账完成后，请点击下方按钮提交确认</li>
                <li>• 到账后将按 $0.04/SNT 自动换算为 SNT 代币</li>
              </ul>
            </div>

            {/* 提交确认按钮 */}
            <button
              onClick={handleSubmitTransfer}
              disabled={submitting || timeLeft <= 0}
              style={{ ...btnPrimary, opacity: (submitting || timeLeft <= 0) ? 0.5 : 1, fontSize: 16, padding: "16px" }}
            >
              {submitting ? "提交中..." : "✅ 我已成功转账，提交确认"}
            </button>

            <button onClick={() => setStep("buy")} style={btnSecondary}>
              ← 返回修改数量
            </button>
          </div>
        )}

        {/* ===== 步骤四：提交成功 ===== */}
        {step === "submitted" && order && (
          <div style={{ ...cardStyle, textAlign: "center" }}>
            <div style={{
              width: 80, height: 80, borderRadius: "50%", margin: "0 auto 20px",
              background: "linear-gradient(135deg, #7C3AED, #A855F7)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 36, boxShadow: "0 0 30px rgba(124,58,237,0.5)",
            }}>🎉</div>
            <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 10 }}>转账确认已提交！</h2>
            <p style={{ fontSize: 13, color: "#94A3B8", lineHeight: 1.7, marginBottom: 24 }}>
              系统正在扫描链上交易<br />确认到账后将自动记录您的 SNT 代币
            </p>

            {/* 订单摘要 */}
            <div style={{ background: "rgba(124,58,237,0.1)", border: "1px solid rgba(124,58,237,0.2)", borderRadius: 12, padding: "16px", marginBottom: 24, textAlign: "left" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 13, color: "#94A3B8" }}>支付金额</span>
                <span style={{ fontWeight: 700, color: "#F59E0B" }}>{order.amount} USDT</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 13, color: "#94A3B8" }}>预计获得</span>
                <span style={{ fontWeight: 700, color: "#A855F7" }}>{toSNT(order.amount)} SNT</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 13, color: "#94A3B8" }}>网络</span>
                <span style={{ color: "#CBD5E1" }}>{order.network}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 13, color: "#94A3B8" }}>订单号</span>
                <span style={{ fontFamily: "monospace", fontSize: 12, color: "#64748B" }}>{order.orderNo}</span>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button onClick={() => setStep("orders")} style={btnPrimary}>查看我的订单</button>
              <button onClick={() => navigate("/sentia")} style={btnSecondary}>返回 Sentia 首页</button>
            </div>
          </div>
        )}

        {/* ===== 我的订单 ===== */}
        {step === "orders" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700 }}>我的订单</h2>
              <button onClick={() => setStep("buy")} style={{
                background: "transparent", border: "1px solid rgba(124,58,237,0.3)", borderRadius: 8,
                padding: "6px 12px", color: "#A855F7", fontSize: 12, cursor: "pointer",
              }}>+ 继续购买</button>
            </div>

            {ordersQuery.isLoading ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: "#64748B" }}>加载中...</div>
            ) : !ordersQuery.data || ordersQuery.data.length === 0 ? (
              <div style={{ ...cardStyle, textAlign: "center", padding: "40px 24px" }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
                <div style={{ color: "#64748B" }}>暂无订单记录</div>
                <button onClick={() => setStep("buy")} style={{ ...btnPrimary, marginTop: 20 }}>立即购买 SNT</button>
              </div>
            ) : (
              ordersQuery.data.map((o: any) => {
                const cfg = statusConfig[o.status] || statusConfig.pending;
                return (
                  <div key={o.id} style={{
                    background: "rgba(255,255,255,0.03)", border: "1px solid rgba(124,58,237,0.2)",
                    borderRadius: 14, padding: "16px 18px",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                      <div>
                        <div style={{ fontSize: 18, fontWeight: 800, color: "#F59E0B" }}>{o.amount} USDT</div>
                        <div style={{ fontSize: 13, color: "#A855F7", marginTop: 2 }}>
                          {o.status === "completed" ? "已到账" : "预计"} {toSNT(o.amount)} SNT
                        </div>
                      </div>
                      <span style={{ background: cfg.bg, color: cfg.color, borderRadius: 20, padding: "4px 10px", fontSize: 12, fontWeight: 600 }}>
                        {cfg.label}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: "#475569", display: "flex", justifyContent: "space-between" }}>
                      <span>{o.network}</span>
                      <span>{formatDate(o.createdAt)}</span>
                    </div>
                    <div style={{ fontSize: 11, color: "#374151", marginTop: 4, fontFamily: "monospace" }}>
                      {o.orderNo}
                    </div>
                    {o.txnHash && (
                      <div style={{ fontSize: 11, color: "#374151", marginTop: 4, fontFamily: "monospace", wordBreak: "break-all" }}>
                        TxHash: {o.txnHash}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

      </div>
    </div>
  );
}
