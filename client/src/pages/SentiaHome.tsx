/**
 * Sentia (SNT) 官网首页
 * 设计风格：币安设计语言
 * 色系：#0B0E11（深黑底）+ #F0B90B（金黄主色）+ #1E2026（卡片背景）
 * 无 emoji，方角/小圆角按钮，专业交易所风格
 */
import { useLocation } from "wouter";

const SENTIA_ICON = "https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/snt-ai-2-N3gEAMNGbei2Fqn5vNs6VJ.png";

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
              { label: "私募价格", value: "$0.04", sub: "USDT / SNT" },
              { label: "预期上线", value: "2025 年 6 月底", sub: "TGE · Binance" },
            ].map((item, i) => (
              <div key={i} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "14px 18px",
                borderBottom: i < 5 ? `1px solid ${BNB.divider}` : "none",
              }}>
                <span style={{ fontSize: 13, color: BNB.textSecondary }}>{item.label}</span>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: item.label === "私募价格" ? BNB.yellow : BNB.text }}>
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

      {/* ===== 应用场景滚动标签 ===== */}
      <section style={{ padding: "40px 0 0", background: BNB.bg, overflow: "hidden" }}>
        <div style={{ maxWidth: 480, margin: "0 auto", textAlign: "center", padding: "0 16px", marginBottom: 24 }}>
          <div style={{ fontSize: 11, color: BNB.yellow, fontWeight: 700, letterSpacing: 1.5, marginBottom: 8, textTransform: "uppercase" }}>AI 能力场景</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: BNB.text, lineHeight: 1.3 }}>Sentia Agent 能做什么</div>
        </div>
        <div style={{ overflow: "hidden", marginBottom: 10 }}>
          <div style={{ display: "flex", gap: 10, width: "max-content",
            animation: "scrollLeft 28s linear infinite" }}>
            {["共享人脉匹配", "智能名片管理", "关系图谱分析", "共享账本记账",
              "节点共享奖励", "商机自动匹配", "社交信用评分", "链上身份认证",
              "共享人脉匹配", "智能名片管理", "关系图谱分析", "共享账本记账",
              "节点共享奖励", "商机自动匹配", "社交信用评分", "链上身份认证",
            ].map((tag, i) => (
              <span key={i} style={{
                background: BNB.card, border: `1px solid ${BNB.divider}`,
                borderRadius: 20, padding: "7px 18px",
                fontSize: 13, color: BNB.textSecondary, whiteSpace: "nowrap", fontWeight: 500,
              }}>{tag}</span>
            ))}
          </div>
        </div>
        <div style={{ overflow: "hidden", marginBottom: 40 }}>
          <div style={{ display: "flex", gap: 10, width: "max-content",
            animation: "scrollRight 32s linear infinite" }}>
            {["DeFi 资产管理", "跨链划转", "DAO 治理投票", "AI 投资顾问",
              "人脉价值量化", "隐私社交证明", "多链钱包聚合", "智能合约执行",
              "DeFi 资产管理", "跨链划转", "DAO 治理投票", "AI 投资顾问",
              "人脉价值量化", "隐私社交证明", "多链钱包聚合", "智能合约执行",
            ].map((tag, i) => (
              <span key={i} style={{
                background: BNB.card, border: `1px solid ${BNB.yellowBorder}`,
                borderRadius: 20, padding: "7px 18px",
                fontSize: 13, color: BNB.yellow, whiteSpace: "nowrap", fontWeight: 500,
              }}>{tag}</span>
            ))}
          </div>
        </div>
        <style>{`
          @keyframes scrollLeft { from { transform: translateX(0); } to { transform: translateX(-50%); } }
          @keyframes scrollRight { from { transform: translateX(-50%); } to { transform: translateX(0); } }
        `}</style>
      </section>

      {/* ===== 核心架构特性 4 宫格 ===== */}
      <section style={{ padding: "40px 16px", background: BNB.bg }}>
        <div style={{ maxWidth: 480, margin: "0 auto" }}>
          <div style={{ fontSize: 11, color: BNB.yellow, fontWeight: 700, letterSpacing: 1.5, marginBottom: 8, textTransform: "uppercase", textAlign: "center" }}>核心架构</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: BNB.text, textAlign: "center", marginBottom: 28, lineHeight: 1.3 }}>为 AI 社交而生的底层协议</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {[
              {
                icon: (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={BNB.yellow} strokeWidth="1.8">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                  </svg>
                ),
                title: "共享人脉图谱",
                desc: "基于 ZKP 的链上社交关系网络，AI 自动匹配高价值商业连接，人脉价值通过 SNT 结算可量化。",
              },
              {
                icon: (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={BNB.yellow} strokeWidth="1.8">
                    <rect x="2" y="3" width="20" height="14" rx="2"/>
                    <path d="M8 21h8M12 17v4M7 8h10M7 12h6"/>
                  </svg>
                ),
                title: "共享账本系统",
                desc: "去中心化多方共享记账协议，团队账本实时同步，所有记录上链存证，不可篡改。",
              },
              {
                icon: (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={BNB.yellow} strokeWidth="1.8">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                  </svg>
                ),
                title: "AI 代理执行层",
                desc: "LLM 驱动的任务链引擎，Agent 自主完成人脉维护、账单催收、商机跟进等复杂工作流。",
              },
              {
                icon: (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={BNB.yellow} strokeWidth="1.8">
                    <circle cx="12" cy="12" r="10"/>
                    <path d="M12 6v6l4 2"/>
                  </svg>
                ),
                title: "节点共享奖励",
                desc: "每个用户都是网络节点，共享人脉、贡献数据、推广生态均可获得 SNT 奖励，形成正向飞轮。",
              },
            ].map((item, i) => (
              <div key={i} style={{
                background: BNB.card,
                border: `1px solid ${BNB.divider}`,
                borderRadius: 8, padding: "18px 16px",
              }}>
                <div style={{
                  width: 38, height: 38, borderRadius: 6,
                  background: BNB.yellowDim,
                  border: `1px solid ${BNB.yellowBorder}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  marginBottom: 12,
                }}>{item.icon}</div>
                <div style={{ fontWeight: 700, fontSize: 13, color: BNB.text, marginBottom: 6 }}>{item.title}</div>
                <div style={{ fontSize: 12, color: BNB.textSecondary, lineHeight: 1.65 }}>{item.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== 生态数据统计 ===== */}
      <section style={{
        padding: "40px 16px",
        background: "#131722",
        borderTop: `1px solid ${BNB.divider}`,
        borderBottom: `1px solid ${BNB.divider}`,
      }}>
        <div style={{ maxWidth: 480, margin: "0 auto" }}>
          <div style={{ fontSize: 11, color: BNB.yellow, fontWeight: 700, letterSpacing: 1.5, marginBottom: 8, textTransform: "uppercase", textAlign: "center" }}>生态数据</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: BNB.text, textAlign: "center", marginBottom: 28, lineHeight: 1.3 }}>SNT 生态正在快速成长</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
            {[
              { label: "私募参与人数", value: "12,000+", sub: "来自 38 个国家和地区" },
              { label: "SNT 已分配", value: "480M", sub: "占总供应量 48%" },
              { label: "共享节点数量", value: "3,200+", sub: "活跃共享节点" },
              { label: "目标上线时间", value: "2025 Q3", sub: "Binance 智能链" },
            ].map((stat, i) => (
              <div key={i} style={{
                background: BNB.card,
                border: `1px solid ${BNB.divider}`,
                padding: "22px 18px",
                borderRadius: i === 0 ? "8px 0 0 0" : i === 1 ? "0 8px 0 0" : i === 2 ? "0 0 0 8px" : "0 0 8px 0",
              }}>
                <div style={{ fontSize: 11, color: BNB.textMuted, fontWeight: 600, letterSpacing: 0.8, marginBottom: 8, textTransform: "uppercase" }}>{stat.label}</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: BNB.yellow, marginBottom: 4, letterSpacing: -0.5 }}>{stat.value}</div>
                <div style={{ fontSize: 12, color: BNB.textSecondary }}>{stat.sub}</div>
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
          <div style={{ fontSize: 12, color: BNB.textMuted, marginBottom: 6, letterSpacing: 0.5 }}>私募价格</div>
          <div style={{
            fontSize: 52, fontWeight: 800,
            color: BNB.yellow,
            marginBottom: 4, letterSpacing: -1,
          }}>$0.04</div>
          <div style={{ fontSize: 13, color: BNB.textSecondary, marginBottom: 28 }}>USDT / SNT · 私募阶段</div>
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
