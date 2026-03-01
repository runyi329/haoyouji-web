/**
 * Sentia (SNT) 买币页 / 定向邀请页
 * 设计风格：深空科技美学 × Web3 Premium
 * 包含：登录/注册表单 + 购买表单，可切换回首页
 */
import { useState } from "react";
import { useLocation } from "wouter";

const SENTIA_ICON = "https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/sentia-icon-v1_cfb26d59.png";

type Step = "login" | "buy" | "success";

export default function SentiaBuy() {
  const [, navigate] = useLocation();
  const [step, setStep] = useState<Step>("login");
  const [isRegister, setIsRegister] = useState(false);
  const [amount, setAmount] = useState("1000");
  const [payMethod, setPayMethod] = useState<"wechat" | "alipay" | "usdt">("wechat");

  const sntAmount = parseFloat(amount) || 0;
  const usdtCost = (sntAmount * 0.04).toFixed(2);
  const cnyEstimate = (parseFloat(usdtCost) * 7.2).toFixed(0);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setStep("buy");
  };

  const handleBuy = (e: React.FormEvent) => {
    e.preventDefault();
    setStep("success");
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #0A0A1A 0%, #0F0A2E 40%, #1A0A3E 70%, #0A0A1A 100%)",
        color: "#F8FAFC",
        fontFamily: "'Inter', sans-serif",
        position: "relative",
      }}
    >
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
        background: "rgba(10,10,26,0.9)",
        backdropFilter: "blur(12px)",
        borderBottom: "1px solid rgba(124,58,237,0.2)",
        padding: "12px 20px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <button
          onClick={() => navigate("/sentia")}
          style={{
            background: "transparent", border: "none",
            color: "#94A3B8", cursor: "pointer", fontSize: 14,
            display: "flex", alignItems: "center", gap: 6,
          }}
        >
          ← 返回首页
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <img src={SENTIA_ICON} alt="SNT" style={{ width: 24, height: 24, borderRadius: "50%" }} />
          <span style={{ fontWeight: 700, fontSize: 15, background: "linear-gradient(90deg, #A855F7, #F59E0B)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            SENTIA
          </span>
        </div>
      </nav>

      <div style={{ position: "relative", zIndex: 1, padding: "24px 16px 60px", maxWidth: 420, margin: "0 auto" }}>

        {/* 步骤指示 */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 28 }}>
          {[
            { key: "login", label: "登录/注册" },
            { key: "buy", label: "购买 SNT" },
            { key: "success", label: "完成" },
          ].map((s, i) => (
            <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{
                width: 28, height: 28, borderRadius: "50%",
                background: step === s.key ? "linear-gradient(135deg, #7C3AED, #A855F7)" :
                  (step === "buy" && i === 0) || step === "success" ? "rgba(124,58,237,0.4)" : "rgba(255,255,255,0.1)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 12, fontWeight: 700, color: "#fff",
                boxShadow: step === s.key ? "0 0 12px rgba(124,58,237,0.6)" : "none",
              }}>
                {(step === "buy" && i === 0) || step === "success" ? "✓" : i + 1}
              </div>
              <span style={{ fontSize: 12, color: step === s.key ? "#A855F7" : "#64748B" }}>{s.label}</span>
              {i < 2 && <div style={{ width: 20, height: 1, background: "rgba(124,58,237,0.3)" }} />}
            </div>
          ))}
        </div>

        {/* 步骤一：登录/注册 */}
        {step === "login" && (
          <div style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(124,58,237,0.25)",
            borderRadius: 20, padding: "28px 24px",
            backdropFilter: "blur(10px)",
          }}>
            <div style={{ textAlign: "center", marginBottom: 24 }}>
              <img src={SENTIA_ICON} alt="SNT" style={{ width: 56, height: 56, borderRadius: "50%", marginBottom: 12, boxShadow: "0 0 20px rgba(124,58,237,0.5)" }} />
              <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>
                {isRegister ? "创建账户" : "欢迎回来"}
              </h2>
              <p style={{ fontSize: 13, color: "#94A3B8" }}>
                {isRegister ? "注册后即可参与 Sentia 预售" : "登录您的账户参与 SNT 预售"}
              </p>
            </div>

            <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {isRegister && (
                <div>
                  <label style={{ fontSize: 12, color: "#94A3B8", display: "block", marginBottom: 6 }}>用户名</label>
                  <input
                    type="text" placeholder="请输入用户名" required
                    style={{
                      width: "100%", padding: "12px 14px", borderRadius: 10,
                      background: "rgba(255,255,255,0.06)", border: "1px solid rgba(124,58,237,0.3)",
                      color: "#F8FAFC", fontSize: 14, outline: "none", boxSizing: "border-box",
                    }}
                  />
                </div>
              )}
              <div>
                <label style={{ fontSize: 12, color: "#94A3B8", display: "block", marginBottom: 6 }}>手机号 / 邮箱</label>
                <input
                  type="text" placeholder="请输入手机号或邮箱" required
                  style={{
                    width: "100%", padding: "12px 14px", borderRadius: 10,
                    background: "rgba(255,255,255,0.06)", border: "1px solid rgba(124,58,237,0.3)",
                    color: "#F8FAFC", fontSize: 14, outline: "none", boxSizing: "border-box",
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, color: "#94A3B8", display: "block", marginBottom: 6 }}>密码</label>
                <input
                  type="password" placeholder="请输入密码" required
                  style={{
                    width: "100%", padding: "12px 14px", borderRadius: 10,
                    background: "rgba(255,255,255,0.06)", border: "1px solid rgba(124,58,237,0.3)",
                    color: "#F8FAFC", fontSize: 14, outline: "none", boxSizing: "border-box",
                  }}
                />
              </div>
              {isRegister && (
                <div>
                  <label style={{ fontSize: 12, color: "#94A3B8", display: "block", marginBottom: 6 }}>邀请码（选填）</label>
                  <input
                    type="text" placeholder="请输入邀请码"
                    style={{
                      width: "100%", padding: "12px 14px", borderRadius: 10,
                      background: "rgba(255,255,255,0.06)", border: "1px solid rgba(124,58,237,0.3)",
                      color: "#F8FAFC", fontSize: 14, outline: "none", boxSizing: "border-box",
                    }}
                  />
                </div>
              )}
              <button
                type="submit"
                style={{
                  background: "linear-gradient(135deg, #7C3AED, #A855F7)",
                  border: "none", borderRadius: 12, padding: "14px",
                  color: "#fff", fontWeight: 700, fontSize: 16, cursor: "pointer",
                  boxShadow: "0 0 20px rgba(124,58,237,0.4)", marginTop: 4,
                }}
              >
                {isRegister ? "注册并参与预售" : "登录"}
              </button>
            </form>

            <div style={{ textAlign: "center", marginTop: 16 }}>
              <button
                onClick={() => setIsRegister(!isRegister)}
                style={{ background: "none", border: "none", color: "#A855F7", fontSize: 13, cursor: "pointer" }}
              >
                {isRegister ? "已有账户？立即登录" : "没有账户？免费注册"}
              </button>
            </div>
          </div>
        )}

        {/* 步骤二：购买 */}
        {step === "buy" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* 价格信息卡 */}
            <div style={{
              background: "linear-gradient(135deg, rgba(124,58,237,0.15), rgba(168,85,247,0.1))",
              border: "1px solid rgba(124,58,237,0.3)",
              borderRadius: 16, padding: "16px 20px",
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
            <form onSubmit={handleBuy} style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(124,58,237,0.2)",
              borderRadius: 20, padding: "24px 20px",
            }}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, color: "#94A3B8", display: "block", marginBottom: 8 }}>购买数量（SNT）</label>
                <input
                  type="number" value={amount} onChange={e => setAmount(e.target.value)}
                  min="100" step="100"
                  style={{
                    width: "100%", padding: "14px", borderRadius: 10,
                    background: "rgba(255,255,255,0.06)", border: "1px solid rgba(124,58,237,0.3)",
                    color: "#F8FAFC", fontSize: 20, fontWeight: 700, outline: "none", boxSizing: "border-box",
                  }}
                />
                {/* 快捷选择 */}
                <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                  {["500", "1000", "5000", "10000", "50000"].map(v => (
                    <button
                      key={v} type="button" onClick={() => setAmount(v)}
                      style={{
                        padding: "6px 12px", borderRadius: 8, fontSize: 12, cursor: "pointer",
                        background: amount === v ? "rgba(124,58,237,0.4)" : "rgba(255,255,255,0.06)",
                        border: `1px solid ${amount === v ? "#A855F7" : "rgba(124,58,237,0.2)"}`,
                        color: amount === v ? "#A855F7" : "#94A3B8",
                      }}
                    >
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
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ fontSize: 13, color: "#94A3B8" }}>需支付 USDT</span>
                  <span style={{ fontWeight: 700, color: "#F59E0B" }}>${usdtCost}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 13, color: "#94A3B8" }}>约合人民币</span>
                  <span style={{ fontWeight: 700, color: "#F8FAFC" }}>¥{cnyEstimate}</span>
                </div>
              </div>

              {/* 支付方式 */}
              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 12, color: "#94A3B8", display: "block", marginBottom: 10 }}>支付方式</label>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {[
                    { key: "wechat", label: "微信支付", icon: "💚", desc: "扫码支付，实时到账" },
                    { key: "alipay", label: "支付宝", icon: "💙", desc: "扫码支付，实时到账" },
                    { key: "usdt", label: "USDT 转账", icon: "🔗", desc: "TRC20 / ERC20" },
                  ].map(m => (
                    <button
                      key={m.key} type="button"
                      onClick={() => setPayMethod(m.key as typeof payMethod)}
                      style={{
                        display: "flex", alignItems: "center", gap: 12,
                        padding: "12px 14px", borderRadius: 10, cursor: "pointer",
                        background: payMethod === m.key ? "rgba(124,58,237,0.15)" : "rgba(255,255,255,0.04)",
                        border: `1px solid ${payMethod === m.key ? "#A855F7" : "rgba(124,58,237,0.15)"}`,
                        textAlign: "left",
                      }}
                    >
                      <span style={{ fontSize: 22 }}>{m.icon}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: "#F8FAFC" }}>{m.label}</div>
                        <div style={{ fontSize: 11, color: "#64748B" }}>{m.desc}</div>
                      </div>
                      <div style={{
                        width: 18, height: 18, borderRadius: "50%",
                        border: `2px solid ${payMethod === m.key ? "#A855F7" : "#475569"}`,
                        background: payMethod === m.key ? "#A855F7" : "transparent",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 10, color: "#fff",
                      }}>
                        {payMethod === m.key ? "✓" : ""}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                style={{
                  width: "100%", background: "linear-gradient(135deg, #7C3AED, #A855F7)",
                  border: "none", borderRadius: 14, padding: "16px",
                  color: "#fff", fontWeight: 700, fontSize: 17, cursor: "pointer",
                  boxShadow: "0 0 30px rgba(124,58,237,0.5)",
                }}
              >
                确认购买 {sntAmount.toLocaleString()} SNT
              </button>
              <div style={{ textAlign: "center", fontSize: 11, color: "#475569", marginTop: 10 }}>
                购买即视为同意《Sentia 预售协议》
              </div>
            </form>
          </div>
        )}

        {/* 步骤三：成功 */}
        {step === "success" && (
          <div style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(124,58,237,0.25)",
            borderRadius: 20, padding: "40px 24px",
            textAlign: "center",
          }}>
            <div style={{
              width: 80, height: 80, borderRadius: "50%", margin: "0 auto 20px",
              background: "linear-gradient(135deg, #7C3AED, #A855F7)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 36, boxShadow: "0 0 30px rgba(124,58,237,0.5)",
            }}>🎉</div>
            <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 10 }}>购买成功！</h2>
            <p style={{ fontSize: 14, color: "#94A3B8", lineHeight: 1.7, marginBottom: 24 }}>
              您的订单已提交，我们将在确认收款后<br />
              将 SNT 代币记录到您的账户
            </p>
            <div style={{
              background: "rgba(124,58,237,0.1)", border: "1px solid rgba(124,58,237,0.2)",
              borderRadius: 12, padding: "16px", marginBottom: 24,
            }}>
              <div style={{ fontSize: 12, color: "#94A3B8", marginBottom: 6 }}>购买数量</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: "#A855F7" }}>
                {parseFloat(amount).toLocaleString()} SNT
              </div>
              <div style={{ fontSize: 12, color: "#64748B", marginTop: 4 }}>
                合伙人价 · $0.04 / SNT
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button
                onClick={() => navigate("/sentia")}
                style={{
                  background: "linear-gradient(135deg, #7C3AED, #A855F7)",
                  border: "none", borderRadius: 12, padding: "14px",
                  color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer",
                }}
              >
                返回 Sentia 首页
              </button>
              <button
                onClick={() => { setStep("buy"); setAmount("1000"); }}
                style={{
                  background: "transparent", border: "1px solid rgba(124,58,237,0.3)",
                  borderRadius: 12, padding: "14px",
                  color: "#A855F7", fontWeight: 600, fontSize: 15, cursor: "pointer",
                }}
              >
                继续购买
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
