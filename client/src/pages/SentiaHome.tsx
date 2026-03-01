/**
 * Sentia (SNT) 官网首页
 * 设计风格：深空科技美学 × Web3 Premium
 * 深色背景 + 紫色渐变 + 金色点缀 + 星空粒子效果
 * 移动端优先，单页滚动
 */
import { useLocation } from "wouter";
import { useEffect, useRef } from "react";

const SENTIA_ICON = "https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/sentia-icon-v1_cfb26d59.png";

export default function SentiaHome() {
  const [, navigate] = useLocation();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // 星空粒子动画
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const stars: { x: number; y: number; r: number; speed: number; opacity: number }[] = [];
    for (let i = 0; i < 120; i++) {
      stars.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: Math.random() * 1.5 + 0.3,
        speed: Math.random() * 0.3 + 0.05,
        opacity: Math.random() * 0.7 + 0.3,
      });
    }

    let animId: number;
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      stars.forEach((s) => {
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(200, 180, 255, ${s.opacity})`;
        ctx.fill();
        s.y += s.speed;
        if (s.y > canvas.height) {
          s.y = 0;
          s.x = Math.random() * canvas.width;
        }
      });
      animId = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #0A0A1A 0%, #0F0A2E 40%, #1A0A3E 70%, #0A0A1A 100%)",
        color: "#F8FAFC",
        fontFamily: "'Inter', sans-serif",
        position: "relative",
        overflowX: "hidden",
      }}
    >
      {/* 星空背景 */}
      <canvas
        ref={canvasRef}
        style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 0 }}
      />

      {/* 顶部光晕 */}
      <div style={{
        position: "fixed", top: -100, left: "50%", transform: "translateX(-50%)",
        width: 400, height: 400,
        background: "radial-gradient(circle, rgba(124,58,237,0.25) 0%, transparent 70%)",
        pointerEvents: "none", zIndex: 0,
      }} />

      {/* 导航栏 */}
      <nav style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
        background: "rgba(10,10,26,0.8)",
        backdropFilter: "blur(12px)",
        borderBottom: "1px solid rgba(124,58,237,0.2)",
        padding: "12px 20px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img src={SENTIA_ICON} alt="SNT" style={{ width: 32, height: 32, borderRadius: "50%" }} />
          <span style={{ fontWeight: 700, fontSize: 18, letterSpacing: 2, background: "linear-gradient(90deg, #A855F7, #F59E0B)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            SENTIA
          </span>
        </div>
        <button
          onClick={() => navigate("/sentia/buy")}
          style={{
            background: "linear-gradient(135deg, #7C3AED, #A855F7)",
            border: "none", borderRadius: 20, padding: "8px 18px",
            color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer",
            boxShadow: "0 0 15px rgba(124,58,237,0.5)",
          }}
        >
          立即参与 →
        </button>
      </nav>

      {/* 主内容区 */}
      <div style={{ position: "relative", zIndex: 1, paddingTop: 70 }}>

        {/* Hero 区 */}
        <section style={{ textAlign: "center", padding: "60px 24px 40px" }}>
          {/* 代币图标 + 光环动画 */}
          <div style={{ position: "relative", display: "inline-block", marginBottom: 28 }}>
            <div style={{
              position: "absolute", inset: -16,
              borderRadius: "50%",
              background: "conic-gradient(from 0deg, #7C3AED, #A855F7, #F59E0B, #7C3AED)",
              animation: "spin 6s linear infinite",
              opacity: 0.6,
              filter: "blur(8px)",
            }} />
            <div style={{
              position: "absolute", inset: -8,
              borderRadius: "50%",
              background: "radial-gradient(circle, rgba(124,58,237,0.4) 0%, transparent 70%)",
            }} />
            <img
              src={SENTIA_ICON}
              alt="Sentia Token"
              style={{
                width: 120, height: 120, borderRadius: "50%",
                position: "relative", zIndex: 1,
                boxShadow: "0 0 40px rgba(124,58,237,0.6), 0 0 80px rgba(168,85,247,0.3)",
                animation: "float 4s ease-in-out infinite",
              }}
            />
          </div>

          <div style={{
            display: "inline-block",
            background: "rgba(124,58,237,0.15)",
            border: "1px solid rgba(124,58,237,0.4)",
            borderRadius: 20, padding: "4px 14px", marginBottom: 16,
            fontSize: 12, color: "#A855F7", letterSpacing: 2, fontWeight: 600,
          }}>
            AI TRACK · BINANCE LISTING
          </div>

          <h1 style={{
            fontSize: 42, fontWeight: 900, lineHeight: 1.1, marginBottom: 16,
            background: "linear-gradient(135deg, #FFFFFF 0%, #E2D9FF 50%, #A855F7 100%)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            letterSpacing: -1,
          }}>
            SENTIA
          </h1>
          <p style={{ fontSize: 16, color: "#94A3B8", lineHeight: 1.7, maxWidth: 320, margin: "0 auto 32px" }}>
            下一代 AI 驱动的区块链生态系统<br />
            重新定义人工智能与 Web3 的边界
          </p>

          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <button
              onClick={() => navigate("/sentia/buy")}
              style={{
                background: "linear-gradient(135deg, #7C3AED, #A855F7)",
                border: "none", borderRadius: 28, padding: "14px 32px",
                color: "#fff", fontWeight: 700, fontSize: 16, cursor: "pointer",
                boxShadow: "0 0 30px rgba(124,58,237,0.5)",
                animation: "pulse-glow 2s ease-in-out infinite",
              }}
            >
              🚀 立即参与预售
            </button>
            <button
              onClick={() => {
                document.getElementById("whitepaper")?.scrollIntoView({ behavior: "smooth" });
              }}
              style={{
                background: "transparent",
                border: "1px solid rgba(124,58,237,0.5)", borderRadius: 28, padding: "14px 32px",
                color: "#A855F7", fontWeight: 600, fontSize: 16, cursor: "pointer",
              }}
            >
              📄 查看白皮书
            </button>
          </div>
        </section>

        {/* 代币核心数据 */}
        <section style={{ padding: "0 16px 40px" }}>
          <div style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(124,58,237,0.2)",
            borderRadius: 20, padding: "24px 20px",
            backdropFilter: "blur(10px)",
          }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              {[
                { label: "代币名称", value: "Sentia", sub: "SNT" },
                { label: "发行总量", value: "10亿", sub: "1,000,000,000 SNT" },
                { label: "赛道", value: "AI 产品", sub: "Artificial Intelligence" },
                { label: "上线交易所", value: "币安", sub: "Binance · 2025 Q2" },
                { label: "合伙人价格", value: "$0.04", sub: "USDT / SNT" },
                { label: "预期上线", value: "6月底", sub: "2025 · TGE" },
              ].map((item, i) => (
                <div key={i} style={{
                  background: "rgba(124,58,237,0.08)",
                  border: "1px solid rgba(124,58,237,0.15)",
                  borderRadius: 14, padding: "16px 14px",
                }}>
                  <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 6, letterSpacing: 1 }}>{item.label}</div>
                  <div style={{
                    fontSize: 20, fontWeight: 800,
                    background: "linear-gradient(135deg, #F8FAFC, #A855F7)",
                    WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
                  }}>{item.value}</div>
                  <div style={{ fontSize: 10, color: "#64748B", marginTop: 3 }}>{item.sub}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 释放规则 */}
        <section style={{ padding: "0 16px 40px" }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16, textAlign: "center", color: "#E2D9FF" }}>
            代币释放规则
          </h2>
          <div style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(245,158,11,0.2)",
            borderRadius: 20, padding: "20px",
            backdropFilter: "blur(10px)",
          }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: "50%", flexShrink: 0,
                  background: "linear-gradient(135deg, #F59E0B, #D97706)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 18, fontWeight: 800, color: "#fff",
                }}>10%</div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15, color: "#F8FAFC" }}>TGE 即时释放</div>
                  <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>上线当日立即解锁 10% 代币</div>
                </div>
              </div>
              <div style={{ height: 1, background: "rgba(124,58,237,0.2)" }} />
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: "50%", flexShrink: 0,
                  background: "linear-gradient(135deg, #7C3AED, #A855F7)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 18, fontWeight: 800, color: "#fff",
                }}>90%</div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15, color: "#F8FAFC" }}>锁仓 3 个月后线性释放</div>
                  <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>分 12 次释放，每月解锁 7.5%</div>
                </div>
              </div>
              {/* 进度条可视化 */}
              <div style={{ marginTop: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#64748B", marginBottom: 6 }}>
                  <span>TGE</span><span>锁仓期 3个月</span><span>线性释放 12个月</span>
                </div>
                <div style={{ height: 8, borderRadius: 4, background: "rgba(255,255,255,0.08)", overflow: "hidden", display: "flex" }}>
                  <div style={{ width: "10%", background: "linear-gradient(90deg, #F59E0B, #D97706)", borderRadius: "4px 0 0 4px" }} />
                  <div style={{ width: "20%", background: "rgba(255,255,255,0.05)" }} />
                  <div style={{ width: "70%", background: "linear-gradient(90deg, #7C3AED, #A855F7)", borderRadius: "0 4px 4px 0" }} />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 白皮书 / 项目介绍 */}
        <section id="whitepaper" style={{ padding: "0 16px 40px" }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16, textAlign: "center", color: "#E2D9FF" }}>
            关于 Sentia
          </h2>
          <div style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(124,58,237,0.2)",
            borderRadius: 20, padding: "24px 20px",
            backdropFilter: "blur(10px)",
          }}>
            {[
              {
                icon: "🧠",
                title: "AI 原生架构",
                desc: "Sentia 构建于新一代 AI 推理层之上，将大语言模型与区块链共识机制深度融合，实现去中心化的智能决策网络。",
              },
              {
                icon: "🔗",
                title: "跨链互操作",
                desc: "原生支持以太坊、BNB Chain 等主流公链，通过 SNT 代币作为跨链价值传输媒介，打通多链生态壁垒。",
              },
              {
                icon: "💎",
                title: "价值捕获机制",
                desc: "平台产生的 AI 服务费用将用于回购销毁 SNT，形成持续的通缩压力，为长期持有者创造价值。",
              },
              {
                icon: "🌐",
                title: "全球社区治理",
                desc: "SNT 持有者通过 DAO 机制参与协议升级、资金分配等核心决策，实现真正的去中心化自治。",
              },
            ].map((item, i) => (
              <div key={i} style={{ display: "flex", gap: 14, marginBottom: i < 3 ? 20 : 0 }}>
                <div style={{ fontSize: 28, flexShrink: 0, marginTop: 2 }}>{item.icon}</div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: "#F8FAFC", marginBottom: 6 }}>{item.title}</div>
                  <div style={{ fontSize: 13, color: "#94A3B8", lineHeight: 1.6 }}>{item.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 路线图 */}
        <section style={{ padding: "0 16px 40px" }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16, textAlign: "center", color: "#E2D9FF" }}>
            发展路线图
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {[
              { phase: "Q1 2025", title: "项目启动", items: ["核心团队组建", "白皮书发布", "合伙人私募开启"], done: true },
              { phase: "Q2 2025", title: "生态建设", items: ["技术主网测试", "社区运营启动", "币安上线 · 6月底"], done: false, current: true },
              { phase: "Q3 2025", title: "产品落地", items: ["AI 推理节点上线", "跨链桥接部署", "首批 DApp 接入"], done: false },
              { phase: "Q4 2025", title: "全球扩张", items: ["DAO 治理启动", "多链生态完善", "全球社区建设"], done: false },
            ].map((item, i) => (
              <div key={i} style={{ display: "flex", gap: 16 }}>
                {/* 时间轴 */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 24, flexShrink: 0 }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
                    background: item.done ? "linear-gradient(135deg, #F59E0B, #D97706)" :
                      item.current ? "linear-gradient(135deg, #7C3AED, #A855F7)" : "rgba(255,255,255,0.1)",
                    border: item.current ? "2px solid #A855F7" : "none",
                    boxShadow: item.current ? "0 0 12px rgba(168,85,247,0.6)" : "none",
                    marginTop: 4,
                  }} />
                  {i < 3 && <div style={{ width: 2, flex: 1, background: "rgba(124,58,237,0.2)", margin: "4px 0" }} />}
                </div>
                {/* 内容 */}
                <div style={{ paddingBottom: 24 }}>
                  <div style={{ fontSize: 11, color: item.current ? "#A855F7" : "#64748B", letterSpacing: 1, marginBottom: 4 }}>
                    {item.phase} {item.current && "· 进行中"}
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: "#F8FAFC", marginBottom: 8 }}>{item.title}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {item.items.map((it, j) => (
                      <div key={j} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#94A3B8" }}>
                        <span style={{ color: item.done ? "#F59E0B" : item.current ? "#A855F7" : "#475569" }}>
                          {item.done ? "✓" : "·"}
                        </span>
                        {it}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 底部 CTA */}
        <section style={{
          padding: "40px 24px 60px", textAlign: "center",
          background: "linear-gradient(180deg, transparent, rgba(124,58,237,0.1))",
        }}>
          <div style={{ fontSize: 13, color: "#64748B", marginBottom: 8 }}>合伙人专属价格</div>
          <div style={{
            fontSize: 48, fontWeight: 900,
            background: "linear-gradient(135deg, #F59E0B, #FBBF24)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            marginBottom: 4,
          }}>$0.04</div>
          <div style={{ fontSize: 13, color: "#94A3B8", marginBottom: 28 }}>USDT / SNT · 限时合伙人价</div>
          <button
            onClick={() => navigate("/sentia/buy")}
            style={{
              background: "linear-gradient(135deg, #7C3AED, #A855F7)",
              border: "none", borderRadius: 32, padding: "16px 48px",
              color: "#fff", fontWeight: 700, fontSize: 18, cursor: "pointer",
              boxShadow: "0 0 40px rgba(124,58,237,0.6)",
              width: "100%", maxWidth: 320,
            }}
          >
            🚀 立即参与预售
          </button>
          <div style={{ fontSize: 11, color: "#475569", marginTop: 16 }}>
            预计上线时间：2025年6月底 · Binance
          </div>
        </section>

        {/* Footer */}
        <footer style={{
          borderTop: "1px solid rgba(124,58,237,0.15)",
          padding: "20px 24px",
          textAlign: "center",
          fontSize: 12, color: "#475569",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 8 }}>
            <img src={SENTIA_ICON} alt="SNT" style={{ width: 20, height: 20, borderRadius: "50%" }} />
            <span style={{ fontWeight: 700, color: "#7C3AED" }}>SENTIA</span>
          </div>
          <div>© 2025 Sentia Protocol. All rights reserved.</div>
          <div style={{ marginTop: 4, color: "#374151" }}>
            本页面仅供合伙人参考，不构成投资建议
          </div>
        </footer>
      </div>

      {/* CSS 动画 */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-10px); }
        }
        @keyframes pulse-glow {
          0%, 100% { box-shadow: 0 0 30px rgba(124,58,237,0.5); }
          50% { box-shadow: 0 0 50px rgba(168,85,247,0.8), 0 0 80px rgba(124,58,237,0.4); }
        }
      `}</style>
    </div>
  );
}
