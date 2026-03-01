/**
 * Sentia (SNT) 官网首页
 * 设计风格：币安设计语言
 * 色系：#0B0E11（深黑底）+ #F0B90B（金黄主色）+ #1E2026（卡片背景）
 * 无 emoji，方角/小圆角按钮，专业交易所风格
 */
import { useLocation } from "wouter";

const SENTIA_ICON = "https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/sentia-icon-v1_cfb26d59.png";

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
  red: "#F6465D",
  divider: "#2B2F36",
};

export default function SentiaHome() {
  const [, navigate] = useLocation();

  return (
    <div style={{
      minHeight: "100vh",
      background: BNB.bg,
      color: BNB.text,
      fontFamily: "'Inter', 'SF Pro Display', -apple-system, sans-serif",
      overflowX: "hidden",
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
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img src={SENTIA_ICON} alt="SNT" style={{ width: 28, height: 28, borderRadius: "50%" }} />
          <span style={{ fontWeight: 700, fontSize: 17, letterSpacing: 1.5, color: BNB.yellow }}>
            SENTIA
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={() => navigate("/sentia/whitepaper")}
            style={{
              background: "transparent",
              border: `1px solid ${BNB.cardBorder}`, borderRadius: 4, padding: "7px 14px",
              color: BNB.textSecondary, fontWeight: 500, fontSize: 13, cursor: "pointer",
            }}
          >
            白皮书
          </button>
          <button
            onClick={() => navigate("/sentia/buy")}
            style={{
              background: BNB.yellow,
              border: "none", borderRadius: 4, padding: "8px 18px",
              color: "#0B0E11", fontWeight: 700, fontSize: 13, cursor: "pointer",
              letterSpacing: 0.3,
            }}
          >
            立即参与
          </button>
        </div>
      </nav>

      {/* Hero 区 */}
      <section style={{
        padding: "48px 20px 40px",
        borderBottom: `1px solid ${BNB.divider}`,
        background: `linear-gradient(180deg, #131722 0%, ${BNB.bg} 100%)`,
      }}>
        <div style={{ maxWidth: 480, margin: "0 auto", textAlign: "center" }}>
          <img
            src={SENTIA_ICON}
            alt="Sentia Token"
            style={{
              width: 88, height: 88, borderRadius: "50%",
              marginBottom: 20,
              boxShadow: `0 0 0 1px ${BNB.cardBorder}, 0 8px 32px rgba(0,0,0,0.5)`,
            }}
          />

          <div style={{
            display: "inline-block",
            background: BNB.yellowDim,
            border: `1px solid ${BNB.yellowBorder}`,
            borderRadius: 2, padding: "3px 12px", marginBottom: 18,
            fontSize: 11, color: BNB.yellow, letterSpacing: 2, fontWeight: 600,
          }}>
            AI TRACK · BINANCE LISTING
          </div>

          <h1 style={{
            fontSize: 38, fontWeight: 800, lineHeight: 1.15, marginBottom: 14,
            color: BNB.text, letterSpacing: -0.5,
          }}>
            SENTIA
            <span style={{ display: "block", fontSize: 16, fontWeight: 400, color: BNB.textSecondary, letterSpacing: 0, marginTop: 8 }}>
              AI 驱动的下一代区块链生态系统
            </span>
          </h1>

          <p style={{ fontSize: 14, color: BNB.textSecondary, lineHeight: 1.75, maxWidth: 340, margin: "0 auto 32px" }}>
            重新定义人工智能与 Web3 的边界，构建去中心化智能决策网络
          </p>

          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            <button
              onClick={() => navigate("/sentia/buy")}
              style={{
                background: BNB.yellow,
                border: "none", borderRadius: 4, padding: "13px 32px",
                color: "#0B0E11", fontWeight: 700, fontSize: 15, cursor: "pointer",
                minWidth: 160,
              }}
            >
              立即参与预售
            </button>
            <button
              onClick={() => navigate("/sentia/whitepaper")}
              style={{
                background: "transparent",
                border: `1px solid ${BNB.cardBorder}`, borderRadius: 4, padding: "13px 32px",
                color: BNB.text, fontWeight: 500, fontSize: 15, cursor: "pointer",
                minWidth: 160,
              }}
            >
              查看白皮书
            </button>
          </div>
        </div>
      </section>

      {/* 代币核心数据 */}
      <section style={{ padding: "32px 16px" }}>
        <div style={{ maxWidth: 480, margin: "0 auto" }}>
          <div style={{
            background: BNB.card,
            border: `1px solid ${BNB.divider}`,
            borderRadius: 6,
            overflow: "hidden",
          }}>
            {[
              { label: "代币名称", value: "Sentia", sub: "SNT" },
              { label: "发行总量", value: "10 亿", sub: "1,000,000,000 SNT" },
              { label: "所属赛道", value: "AI 产品", sub: "Artificial Intelligence" },
              { label: "上线交易所", value: "币安", sub: "Binance · 2025 Q2" },
              { label: "合伙人价格", value: "$0.04", sub: "USDT / SNT" },
              { label: "预期上线", value: "2025 年 6 月底", sub: "TGE · Binance" },
            ].map((item, i) => (
              <div key={i} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "14px 18px",
                borderBottom: i < 5 ? `1px solid ${BNB.divider}` : "none",
              }}>
                <span style={{ fontSize: 13, color: BNB.textSecondary }}>{item.label}</span>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: item.label === "合伙人价格" ? BNB.yellow : BNB.text }}>
                    {item.value}
                  </div>
                  <div style={{ fontSize: 11, color: BNB.textMuted, marginTop: 2 }}>{item.sub}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 释放规则 */}
      <section style={{ padding: "0 16px 32px" }}>
        <div style={{ maxWidth: 480, margin: "0 auto" }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 14, color: BNB.text, letterSpacing: 0.5 }}>
            代币释放规则
          </h2>
          <div style={{
            background: BNB.card,
            border: `1px solid ${BNB.divider}`,
            borderRadius: 6, padding: "20px 18px",
          }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{
                  width: 48, height: 48, borderRadius: 4, flexShrink: 0,
                  background: BNB.yellowDim,
                  border: `1px solid ${BNB.yellowBorder}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 15, fontWeight: 800, color: BNB.yellow,
                }}>10%</div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, color: BNB.text }}>TGE 即时释放</div>
                  <div style={{ fontSize: 12, color: BNB.textSecondary, marginTop: 3 }}>上线当日立即解锁 10% 代币</div>
                </div>
              </div>
              <div style={{ height: 1, background: BNB.divider }} />
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{
                  width: 48, height: 48, borderRadius: 4, flexShrink: 0,
                  background: "rgba(14,203,129,0.1)",
                  border: "1px solid rgba(14,203,129,0.3)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 15, fontWeight: 800, color: BNB.green,
                }}>90%</div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, color: BNB.text }}>锁仓 3 个月后线性释放</div>
                  <div style={{ fontSize: 12, color: BNB.textSecondary, marginTop: 3 }}>分 12 个月均匀释放，每月解锁 7.5%</div>
                </div>
              </div>
              {/* 进度条 */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: BNB.textMuted, marginBottom: 6 }}>
                  <span>TGE</span><span>锁仓 3 个月</span><span>线性释放 12 个月</span>
                </div>
                <div style={{ height: 6, borderRadius: 2, background: BNB.divider, overflow: "hidden", display: "flex" }}>
                  <div style={{ width: "10%", background: BNB.yellow }} />
                  <div style={{ width: "20%", background: "#2B2F36" }} />
                  <div style={{ width: "70%", background: BNB.green }} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 白皮书 / 项目介绍 */}
      <section id="whitepaper" style={{ padding: "0 16px 32px" }}>
        <div style={{ maxWidth: 480, margin: "0 auto" }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 14, color: BNB.text, letterSpacing: 0.5 }}>
            关于 Sentia
          </h2>
          <div style={{
            background: BNB.card,
            border: `1px solid ${BNB.divider}`,
            borderRadius: 6, overflow: "hidden",
          }}>
            {[
              {
                icon: "AI",
                title: "AI 原生架构",
                desc: "Sentia 构建于新一代 AI 推理层之上，将大语言模型与区块链共识机制深度融合，实现去中心化的智能决策网络。",
              },
              {
                icon: "CC",
                title: "跨链互操作",
                desc: "原生支持以太坊、BNB Chain 等主流公链，通过 SNT 代币作为跨链价值传输媒介，打通多链生态壁垒。",
              },
              {
                icon: "VC",
                title: "价值捕获机制",
                desc: "平台产生的 AI 服务费用将用于回购销毁 SNT，形成持续的通缩压力，为长期持有者创造价值。",
              },
              {
                icon: "DAO",
                title: "全球社区治理",
                desc: "SNT 持有者通过 DAO 机制参与协议升级、资金分配等核心决策，实现真正的去中心化自治。",
              },
            ].map((item, i) => (
              <div key={i} style={{
                display: "flex", gap: 14, padding: "18px",
                borderBottom: i < 3 ? `1px solid ${BNB.divider}` : "none",
              }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 4, flexShrink: 0,
                  background: BNB.yellowDim,
                  border: `1px solid ${BNB.yellowBorder}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 10, fontWeight: 800, color: BNB.yellow, letterSpacing: 0.5,
                }}>{item.icon}</div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: BNB.text, marginBottom: 5 }}>{item.title}</div>
                  <div style={{ fontSize: 12, color: BNB.textSecondary, lineHeight: 1.65 }}>{item.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 路线图 */}
      <section style={{ padding: "0 16px 32px" }}>
        <div style={{ maxWidth: 480, margin: "0 auto" }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 14, color: BNB.text, letterSpacing: 0.5 }}>
            发展路线图
          </h2>
          <div style={{
            background: BNB.card,
            border: `1px solid ${BNB.divider}`,
            borderRadius: 6, overflow: "hidden",
          }}>
            {[
              { phase: "Q1 2025", title: "项目启动", items: ["核心团队组建", "白皮书发布", "合伙人私募开启"], done: true },
              { phase: "Q2 2025", title: "生态建设", items: ["技术主网测试", "社区运营启动", "币安上线 · 6 月底"], done: false, current: true },
              { phase: "Q3 2025", title: "产品落地", items: ["AI 推理节点上线", "跨链桥接部署", "首批 DApp 接入"], done: false },
              { phase: "Q4 2025", title: "全球扩张", items: ["DAO 治理启动", "多链生态完善", "全球社区建设"], done: false },
            ].map((item, i) => (
              <div key={i} style={{
                display: "flex", gap: 0,
                borderBottom: i < 3 ? `1px solid ${BNB.divider}` : "none",
              }}>
                {/* 左侧状态条 */}
                <div style={{
                  width: 4, flexShrink: 0,
                  background: item.done ? BNB.yellow : item.current ? BNB.green : BNB.divider,
                }} />
                {/* 内容 */}
                <div style={{ padding: "16px 16px 16px 14px", flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 11, color: item.current ? BNB.green : item.done ? BNB.yellow : BNB.textMuted, fontWeight: 600, letterSpacing: 0.5 }}>
                      {item.phase}
                    </span>
                    {item.current && (
                      <span style={{
                        background: "rgba(14,203,129,0.12)", color: BNB.green,
                        border: "1px solid rgba(14,203,129,0.3)",
                        borderRadius: 2, padding: "1px 6px", fontSize: 10, fontWeight: 600,
                      }}>进行中</span>
                    )}
                    {item.done && (
                      <span style={{
                        background: BNB.yellowDim, color: BNB.yellow,
                        border: `1px solid ${BNB.yellowBorder}`,
                        borderRadius: 2, padding: "1px 6px", fontSize: 10, fontWeight: 600,
                      }}>已完成</span>
                    )}
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: BNB.text, marginBottom: 8 }}>{item.title}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {item.items.map((it, j) => (
                      <div key={j} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: BNB.textSecondary }}>
                        <span style={{
                          width: 14, height: 14, borderRadius: 2, flexShrink: 0,
                          background: item.done ? BNB.yellowDim : item.current ? "rgba(14,203,129,0.1)" : "rgba(255,255,255,0.04)",
                          border: `1px solid ${item.done ? BNB.yellowBorder : item.current ? "rgba(14,203,129,0.3)" : BNB.divider}`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 9, color: item.done ? BNB.yellow : item.current ? BNB.green : BNB.textMuted,
                        }}>
                          {item.done ? "✓" : ""}
                        </span>
                        {it}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 底部 CTA */}
      <section style={{
        padding: "32px 20px 48px",
        borderTop: `1px solid ${BNB.divider}`,
        background: "#131722",
        textAlign: "center",
      }}>
        <div style={{ maxWidth: 480, margin: "0 auto" }}>
          <div style={{ fontSize: 12, color: BNB.textMuted, marginBottom: 6, letterSpacing: 0.5 }}>合伙人专属价格</div>
          <div style={{
            fontSize: 52, fontWeight: 800,
            color: BNB.yellow,
            marginBottom: 4, letterSpacing: -1,
          }}>$0.04</div>
          <div style={{ fontSize: 13, color: BNB.textSecondary, marginBottom: 28 }}>USDT / SNT · 限时合伙人价</div>
          <button
            onClick={() => navigate("/sentia/buy")}
            style={{
              background: BNB.yellow,
              border: "none", borderRadius: 4, padding: "15px 0",
              color: "#0B0E11", fontWeight: 700, fontSize: 16, cursor: "pointer",
              width: "100%", maxWidth: 320,
              letterSpacing: 0.3,
            }}
          >
            立即参与预售
          </button>
          <div style={{ fontSize: 11, color: BNB.textMuted, marginTop: 14 }}>
            预计上线时间：2025 年 6 月底 · Binance
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{
        borderTop: `1px solid ${BNB.divider}`,
        padding: "20px 24px",
        textAlign: "center",
        fontSize: 12, color: BNB.textMuted,
        background: BNB.bg,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 8 }}>
          <img src={SENTIA_ICON} alt="SNT" style={{ width: 18, height: 18, borderRadius: "50%" }} />
          <span style={{ fontWeight: 700, color: BNB.yellow, letterSpacing: 1 }}>SENTIA</span>
        </div>
        <div style={{ color: BNB.textMuted }}>© 2025 Sentia Protocol. All rights reserved.</div>
        <div style={{ marginTop: 4, color: BNB.textMuted }}>
          本页面仅供合伙人参考，不构成投资建议
        </div>
      </footer>
    </div>
  );
}
