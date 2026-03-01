/**
 * Sentia (SNT) — Official Website
 * Design: International Web3 project, inspired by Celestia / EigenLayer / Aptos
 * Palette: #080B10 (deep black) + #F5A623 (amber) + #0E1117 (card bg)
 * Language: English-first with ZH/EN toggle, no emoji, minimal, technical
 */
import { useEffect, useState, useRef } from "react";
import { useLocation } from "wouter";

const SENTIA_ICON = "https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/snt-ai-2-N3gEAMNGbei2Fqn5vNs6VJ.png";
const ARCH_IMG = "https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/sentia-architecture-JytKdDgdamwyKmCB9WsXzP.webp";

const C = {
  bg: "#080B10",
  surface: "#0E1117",
  border: "#1C2030",
  amber: "#F5A623",
  amberDim: "rgba(245,166,35,0.10)",
  amberBorder: "rgba(245,166,35,0.28)",
  text: "#E8EAF0",
  sub: "#7A8099",
  muted: "#3D4460",
  green: "#22C55E",
};

type Lang = "en" | "zh";

const T = {
  en: {
    navDocs: "Docs",
    navBuy: "Buy SNT",
    navAbout: "About",
    navTokenomics: "Tokenomics",
    navRoadmap: "Roadmap",
    navWhitepaper: "Whitepaper",
    navPrivateSale: "Private Sale",
    navSwitchLang: "切换中文",
    badge: "PRIVATE SALE · LIVE",
    heroSub: "SNT Protocol",
    heroTitle: "Decentralized AI Intelligence Layer",
    heroSubtitle: "for the Next-Generation Web3 Ecosystem",
    heroDesc: "Sentia bridges on-chain consensus with federated AI inference, enabling verifiable, permissionless intelligence across distributed networks.",
    heroCta1: "Join Private Sale",
    heroCta2: "Explore Architecture",
    heroWhitepaper: "Read Technical Whitepaper",
    statsSupply: "Total Supply",
    statsNetwork: "Network",
    statsConsensus: "Consensus",
    statsPrivateSale: "Private Sale",
    statsAllocation: "Allocation",
    archLabel: "Technical Architecture",
    archTitle: "Three-Layer Protocol Stack",
    archDesc: "Sentia separates AI inference, consensus validation, and data availability into distinct layers — enabling modular scalability and verifiable computation.",
    layer1: "AI Inference Layer",
    layer1Desc: "Federated learning nodes process inference requests with ZK-proof verification",
    layer2: "Consensus Layer",
    layer2Desc: "PoS validators finalize state transitions and AI output commitments",
    layer3: "Data Layer",
    layer3Desc: "Sharded storage with erasure coding ensures persistent data availability",
    featLabel: "Core Properties",
    featTitle: "Built for Verifiable Intelligence",
    feat1Title: "ZK-Verified Inference",
    feat1Desc: "Every AI output is accompanied by a zero-knowledge proof, making results cryptographically verifiable on-chain.",
    feat2Title: "Federated Learning Nodes",
    feat2Desc: "Distributed AI nodes collaborate without sharing raw data, preserving privacy while enabling collective intelligence.",
    feat3Title: "Modular Architecture",
    feat3Desc: "Execution, consensus, and data availability are decoupled — each layer upgradeable independently.",
    feat4Title: "Permissionless Participation",
    feat4Desc: "Anyone can operate a node, stake SNT, and earn rewards — no whitelisting, no gatekeepers.",
    tokenLabel: "Token Parameters",
    tokenTitle: "SNT Token Overview",
    tokenName: "Token Name",
    tokenSupply: "Total Supply",
    tokenSector: "Sector",
    tokenNetwork: "Network",
    tokenConsensus: "Consensus",
    tokenOpenSource: "Open Source",
    tokenSectorVal: "AI Infrastructure",
    tokenSectorSub: "Artificial Intelligence · Web3",
    tokenNetworkSub: "BEP-20 Standard",
    tokenConsensusSub: "AI-Enhanced Consensus Layer",
    tokenOpenSourceVal: "Planned",
    tokenOpenSourceSub: "GitHub repository pending",
    tokenSupplySub: "Fixed, non-inflationary",
    roadmapLabel: "Roadmap",
    roadmapTitle: "Development Milestones",
    phase1: "Foundation",
    phase1Items: ["Protocol design & whitepaper", "Core team formation", "Private sale initiation"],
    phase2: "Infrastructure",
    phase2Items: ["Testnet deployment", "AI node client v0.1", "Smart contract audit"],
    phase3: "Ecosystem",
    phase3Items: ["Mainnet launch", "Developer SDK release", "Strategic partnerships"],
    phase4: "Expansion",
    phase4Items: ["Cross-chain bridge", "Governance module", "Exchange listing"],
    statusCompleted: "Completed",
    statusInProgress: "In Progress",
    statusUpcoming: "Upcoming",
    statusPlanned: "Planned",
    footerTagline: "Decentralized AI Intelligence Layer for Web3",
    footerResources: "Resources",
    footerProtocol: "Protocol",
    footerWhitepaper: "Whitepaper",
    footerPrivateSale: "Private Sale",
    footerCopyright: "© 2025 Sentia Protocol. All rights reserved.",
    footerDisclaimer: "This is not investment advice. Digital assets carry risk.",
  },
  zh: {
    navDocs: "文档",
    navBuy: "购买 SNT",
    navAbout: "关于",
    navTokenomics: "代币经济",
    navRoadmap: "路线图",
    navWhitepaper: "白皮书",
    navPrivateSale: "私募认购",
    navSwitchLang: "Switch to English",
    badge: "私募认购 · 进行中",
    heroSub: "SNT 协议",
    heroTitle: "去中心化 AI 智能层",
    heroSubtitle: "面向下一代 Web3 生态系统",
    heroDesc: "Sentia 将链上共识与联邦 AI 推理相结合，在分布式网络中实现可验证、无需许可的智能计算。",
    heroCta1: "参与私募认购",
    heroCta2: "探索架构",
    heroWhitepaper: "阅读技术白皮书",
    statsSupply: "总供应量",
    statsNetwork: "网络",
    statsConsensus: "共识机制",
    statsPrivateSale: "私募",
    statsAllocation: "分配比例",
    archLabel: "技术架构",
    archTitle: "三层协议栈",
    archDesc: "Sentia 将 AI 推理、共识验证和数据可用性分离为独立层级，实现模块化扩展和可验证计算。",
    layer1: "AI 推理层",
    layer1Desc: "联邦学习节点通过零知识证明验证处理推理请求",
    layer2: "共识层",
    layer2Desc: "PoS 验证者完成状态转换和 AI 输出承诺的最终确认",
    layer3: "数据层",
    layer3Desc: "分片存储结合纠删码确保数据持久可用",
    featLabel: "核心特性",
    featTitle: "为可验证智能而生",
    feat1Title: "ZK 验证推理",
    feat1Desc: "每个 AI 输出都附带零知识证明，使结果可在链上进行密码学验证。",
    feat2Title: "联邦学习节点",
    feat2Desc: "分布式 AI 节点在不共享原始数据的情况下协作，保护隐私同时实现集体智能。",
    feat3Title: "模块化架构",
    feat3Desc: "执行、共识和数据可用性解耦，每层可独立升级。",
    feat4Title: "无需许可参与",
    feat4Desc: "任何人都可以运行节点、质押 SNT 并获得奖励，无需白名单，无守门人。",
    tokenLabel: "代币参数",
    tokenTitle: "SNT 代币概览",
    tokenName: "代币名称",
    tokenSupply: "总供应量",
    tokenSector: "赛道",
    tokenNetwork: "网络",
    tokenConsensus: "共识机制",
    tokenOpenSource: "开源状态",
    tokenSectorVal: "AI 基础设施",
    tokenSectorSub: "人工智能 · Web3",
    tokenNetworkSub: "BEP-20 标准",
    tokenConsensusSub: "AI 增强共识层",
    tokenOpenSourceVal: "计划中",
    tokenOpenSourceSub: "GitHub 仓库待发布",
    tokenSupplySub: "固定供应，不增发",
    roadmapLabel: "路线图",
    roadmapTitle: "开发里程碑",
    phase1: "基础建设",
    phase1Items: ["协议设计与白皮书", "核心团队组建", "私募认购启动"],
    phase2: "基础设施",
    phase2Items: ["测试网部署", "AI 节点客户端 v0.1", "智能合约审计"],
    phase3: "生态系统",
    phase3Items: ["主网上线", "开发者 SDK 发布", "战略合作伙伴"],
    phase4: "扩张",
    phase4Items: ["跨链桥", "治理模块", "交易所上市"],
    statusCompleted: "已完成",
    statusInProgress: "进行中",
    statusUpcoming: "即将开始",
    statusPlanned: "计划中",
    footerTagline: "面向 Web3 的去中心化 AI 智能层",
    footerResources: "资源",
    footerProtocol: "协议",
    footerWhitepaper: "白皮书",
    footerPrivateSale: "私募认购",
    footerCopyright: "© 2025 Sentia Protocol. 保留所有权利。",
    footerDisclaimer: "本内容不构成投资建议。数字资产存在风险。",
  },
};

export default function SentiaHome() {
  const [, navigate] = useLocation();
  const [lang, setLang] = useState<Lang>("en");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const t = T[lang];

  useEffect(() => {
    const prev = document.title;
    document.title = "Sentia — SNT Protocol";
    return () => { document.title = prev; };
  }, []);

  // Close menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  // Close menu on scroll
  useEffect(() => {
    if (menuOpen) {
      const handler = () => setMenuOpen(false);
      window.addEventListener("scroll", handler, { passive: true });
      return () => window.removeEventListener("scroll", handler);
    }
  }, [menuOpen]);

  const menuItems = [
    { label: t.navAbout, href: "#architecture" },
    { label: t.navTokenomics, href: "#tokenomics" },
    { label: t.navRoadmap, href: "#roadmap" },
    { label: t.navWhitepaper, action: () => navigate("/sentia/whitepaper") },
    { label: t.navPrivateSale, action: () => navigate("/sentia/buy") },
  ];

  return (
    <div style={{
      minHeight: "100vh",
      background: C.bg,
      color: C.text,
      fontFamily: "'Inter', 'SF Pro Display', -apple-system, sans-serif",
      overflowX: "hidden",
    }}>

      {/* HAMBURGER MENU OVERLAY */}
      {menuOpen && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 200,
          background: "rgba(0,0,0,0.5)",
          backdropFilter: "blur(2px)",
        }} />
      )}

      {/* SLIDE-IN MENU */}
      <div
        ref={menuRef}
        style={{
          position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 300,
          width: 260,
          background: "#0A0D14",
          borderRight: `1px solid ${C.border}`,
          transform: menuOpen ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 0.28s cubic-bezier(0.4,0,0.2,1)",
          display: "flex", flexDirection: "column",
          boxShadow: menuOpen ? "4px 0 32px rgba(0,0,0,0.6)" : "none",
        }}
      >
        {/* Menu Header */}
        <div style={{
          padding: "18px 20px",
          borderBottom: `1px solid ${C.border}`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <img src={SENTIA_ICON} alt="SNT" style={{ width: 22, height: 22, borderRadius: "50%" }} />
            <span style={{ fontWeight: 700, fontSize: 14, letterSpacing: 2, color: C.amber }}>SENTIA</span>
          </div>
          <button
            onClick={() => setMenuOpen(false)}
            style={{
              background: "transparent", border: "none", cursor: "pointer",
              color: C.sub, padding: 4, display: "flex", alignItems: "center",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Menu Items */}
        <nav style={{ flex: 1, padding: "12px 0", overflowY: "auto" }}>
          {menuItems.map((item, i) => (
            <button
              key={i}
              onClick={() => {
                setMenuOpen(false);
                if (item.action) {
                  item.action();
                } else if (item.href) {
                  const el = document.querySelector(item.href);
                  if (el) el.scrollIntoView({ behavior: "smooth" });
                }
              }}
              style={{
                display: "block", width: "100%", textAlign: "left",
                padding: "13px 24px",
                background: "transparent", border: "none", cursor: "pointer",
                color: C.text, fontSize: 14, fontWeight: 500,
                borderBottom: `1px solid ${C.border}`,
                transition: "background 0.15s",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = C.surface)}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {/* Language Toggle */}
        <div style={{
          padding: "16px 20px",
          borderTop: `1px solid ${C.border}`,
        }}>
          <button
            onClick={() => {
              setLang(lang === "en" ? "zh" : "en");
              setMenuOpen(false);
            }}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              width: "100%", padding: "10px 14px",
              background: C.amberDim,
              border: `1px solid ${C.amberBorder}`,
              borderRadius: 6, cursor: "pointer",
              color: C.amber, fontSize: 13, fontWeight: 600,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
            </svg>
            {t.navSwitchLang}
          </button>
        </div>
      </div>

      {/* NAV */}
      <nav style={{
        position: "sticky", top: 0, zIndex: 100,
        background: "rgba(8,11,16,0.92)",
        backdropFilter: "blur(12px)",
        borderBottom: `1px solid ${C.border}`,
        padding: "0 20px",
        height: 54,
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        {/* Left: Hamburger + Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={() => setMenuOpen(true)}
            style={{
              background: "transparent", border: "none", cursor: "pointer",
              color: C.sub, padding: "6px 4px",
              display: "flex", flexDirection: "column", gap: 4,
              alignItems: "center", justifyContent: "center",
            }}
            aria-label="Open menu"
          >
            <span style={{ display: "block", width: 18, height: 1.5, background: C.text, borderRadius: 1 }} />
            <span style={{ display: "block", width: 14, height: 1.5, background: C.sub, borderRadius: 1 }} />
            <span style={{ display: "block", width: 18, height: 1.5, background: C.text, borderRadius: 1 }} />
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <img src={SENTIA_ICON} alt="SNT" style={{ width: 24, height: 24, borderRadius: "50%" }} />
            <span style={{ fontWeight: 700, fontSize: 14, letterSpacing: 2, color: C.amber }}>SENTIA</span>
          </div>
        </div>

        {/* Right: Docs + Buy */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={() => navigate("/sentia/whitepaper")}
            style={{
              background: "transparent",
              border: `1px solid ${C.border}`,
              borderRadius: 4, padding: "6px 12px",
              color: C.sub, fontSize: 12, cursor: "pointer", fontWeight: 500,
            }}
          >
            {t.navDocs}
          </button>
          <button
            onClick={() => navigate("/sentia/buy")}
            style={{
              background: C.amber,
              border: "none", borderRadius: 4, padding: "6px 14px",
              color: "#080B10", fontWeight: 700, fontSize: 12, cursor: "pointer",
              letterSpacing: 0.3,
              display: "flex", alignItems: "center", gap: 5,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
            </svg>
            {t.navBuy}
          </button>
        </div>
      </nav>

      {/* HERO */}
      <section style={{
        padding: "64px 20px 56px",
        background: `radial-gradient(ellipse 80% 60% at 50% 0%, rgba(245,166,35,0.06) 0%, transparent 70%), ${C.bg}`,
        borderBottom: `1px solid ${C.border}`,
        textAlign: "center",
      }}>
        <div style={{ maxWidth: 580, margin: "0 auto" }}>
          {/* Badge */}
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            background: C.amberDim,
            border: `1px solid ${C.amberBorder}`,
            borderRadius: 20, padding: "4px 14px", marginBottom: 24,
            fontSize: 10, color: C.amber, letterSpacing: 1.8, fontWeight: 600,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.green, display: "inline-block" }} />
            {t.badge}
          </div>

          {/* Logo + Name */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, marginBottom: 18 }}>
            <img src={SENTIA_ICON} alt="SNT" style={{ width: 56, height: 56, borderRadius: "50%", boxShadow: `0 0 0 1px ${C.border}, 0 12px 40px rgba(0,0,0,0.6)` }} />
            <div style={{ textAlign: "left" }}>
              <div style={{ fontSize: 36, fontWeight: 800, letterSpacing: -1, color: C.text, lineHeight: 1 }}>SENTIA</div>
              <div style={{ fontSize: 12, color: C.sub, letterSpacing: 0.5, marginTop: 3 }}>{t.heroSub}</div>
            </div>
          </div>

          {/* Title */}
          <h1 style={{ fontSize: 20, fontWeight: 600, color: C.text, lineHeight: 1.5, marginBottom: 12, maxWidth: 460, margin: "0 auto 12px" }}>
            {t.heroTitle}<br />
            <span style={{ color: C.sub, fontWeight: 400, fontSize: 15 }}>{t.heroSubtitle}</span>
          </h1>

          {/* Description */}
          <p style={{ fontSize: 13, color: C.sub, lineHeight: 1.8, maxWidth: 380, margin: "0 auto 28px" }}>
            {t.heroDesc}
          </p>

          {/* CTA Buttons */}
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            <button
              onClick={() => navigate("/sentia/buy")}
              style={{
                background: C.amber,
                border: "none", borderRadius: 4, padding: "11px 22px",
                color: "#080B10", fontWeight: 700, fontSize: 13, cursor: "pointer",
                letterSpacing: 0.2, whiteSpace: "nowrap",
              }}
            >
              {t.heroCta1}
            </button>
            <button
              onClick={() => {
                const el = document.getElementById("architecture");
                if (el) el.scrollIntoView({ behavior: "smooth" });
              }}
              style={{
                background: "transparent",
                border: `1px solid ${C.border}`, borderRadius: 4, padding: "11px 22px",
                color: C.text, fontWeight: 500, fontSize: 13, cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {t.heroCta2}
            </button>
          </div>

          {/* Whitepaper link */}
          <button
            onClick={() => navigate("/sentia/whitepaper")}
            style={{
              marginTop: 16,
              background: "transparent", border: "none", cursor: "pointer",
              color: C.sub, fontSize: 12, display: "inline-flex", alignItems: "center", gap: 5,
              letterSpacing: 0.3,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
              <path d="M3 2h6l2 2v8H3V2z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
              <path d="M5 6h4M5 8h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
            {t.heroWhitepaper}
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
              <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </section>

      {/* STATS BAR */}
      <section style={{
        padding: "0 20px",
        background: C.surface,
        borderBottom: `1px solid ${C.border}`,
      }}>
        <div style={{ maxWidth: 700, margin: "0 auto", display: "flex", overflowX: "auto" }}>
          {[
            { label: t.statsSupply, value: "1,000,000,000", unit: "SNT" },
            { label: t.statsNetwork, value: "BNB Chain", unit: "BEP-20" },
            { label: t.statsConsensus, value: "PoS + AI", unit: "Layer" },
            { label: t.statsPrivateSale, value: "20%", unit: t.statsAllocation },
          ].map((s, i) => (
            <div key={i} style={{
              flex: "0 0 auto",
              padding: "16px 22px",
              borderRight: i < 3 ? `1px solid ${C.border}` : "none",
              minWidth: 130,
            }}>
              <div style={{ fontSize: 10, color: C.muted, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", marginBottom: 5 }}>{s.label}</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: C.text, letterSpacing: -0.3 }}>{s.value}</div>
              <div style={{ fontSize: 10, color: C.sub, marginTop: 2 }}>{s.unit}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ARCHITECTURE */}
      <section id="architecture" style={{ padding: "56px 20px" }}>
        <div style={{ maxWidth: 700, margin: "0 auto" }}>
          <div style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 10, color: C.amber, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>
              {t.archLabel}
            </div>
            <h2 style={{ fontSize: 24, fontWeight: 800, color: C.text, lineHeight: 1.25, marginBottom: 10 }}>
              {t.archTitle}
            </h2>
            <p style={{ fontSize: 13, color: C.sub, lineHeight: 1.8, maxWidth: 480 }}>
              {t.archDesc}
            </p>
          </div>
          <div style={{
            borderRadius: 8, overflow: "hidden",
            border: `1px solid ${C.border}`,
            background: C.surface,
          }}>
            <img src={ARCH_IMG} alt="Sentia Architecture" style={{ width: "100%", display: "block" }} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 14 }}>
            {[
              { label: t.layer1, desc: t.layer1Desc, color: "#F5A623" },
              { label: t.layer2, desc: t.layer2Desc, color: "#60A5FA" },
              { label: t.layer3, desc: t.layer3Desc, color: "#34D399" },
            ].map((l, i) => (
              <div key={i} style={{
                background: C.surface,
                border: `1px solid ${C.border}`,
                borderRadius: 6, padding: "12px",
                borderTop: `2px solid ${l.color}`,
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: l.color, marginBottom: 5 }}>{l.label}</div>
                <div style={{ fontSize: 11, color: C.sub, lineHeight: 1.6 }}>{l.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section style={{
        padding: "56px 20px",
        background: C.surface,
        borderTop: `1px solid ${C.border}`,
        borderBottom: `1px solid ${C.border}`,
      }}>
        <div style={{ maxWidth: 700, margin: "0 auto" }}>
          <div style={{ fontSize: 10, color: C.amber, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>
            {t.featLabel}
          </div>
          <h2 style={{ fontSize: 24, fontWeight: 800, color: C.text, marginBottom: 28, lineHeight: 1.25 }}>
            {t.featTitle}
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            {[
              {
                icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.amber} strokeWidth="1.8"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
                title: t.feat1Title, desc: t.feat1Desc,
              },
              {
                icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.amber} strokeWidth="1.8"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/></svg>,
                title: t.feat2Title, desc: t.feat2Desc,
              },
              {
                icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.amber} strokeWidth="1.8"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>,
                title: t.feat3Title, desc: t.feat3Desc,
              },
              {
                icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.amber} strokeWidth="1.8"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
                title: t.feat4Title, desc: t.feat4Desc,
              },
            ].map((f, i) => (
              <div key={i} style={{
                background: C.bg,
                border: `1px solid ${C.border}`,
                borderRadius: 8, padding: "18px 16px",
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 6,
                  background: C.amberDim, border: `1px solid ${C.amberBorder}`,
                  display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12,
                }}>{f.icon}</div>
                <div style={{ fontWeight: 700, fontSize: 13, color: C.text, marginBottom: 6 }}>{f.title}</div>
                <div style={{ fontSize: 12, color: C.sub, lineHeight: 1.7 }}>{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TOKEN PARAMETERS */}
      <section id="tokenomics" style={{ padding: "56px 20px" }}>
        <div style={{ maxWidth: 700, margin: "0 auto" }}>
          <div style={{ fontSize: 10, color: C.amber, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>
            {t.tokenLabel}
          </div>
          <h2 style={{ fontSize: 24, fontWeight: 800, color: C.text, marginBottom: 24, lineHeight: 1.25 }}>
            {t.tokenTitle}
          </h2>
          <div style={{
            background: C.surface,
            border: `1px solid ${C.border}`,
            borderRadius: 8, overflow: "hidden",
          }}>
            {[
              { label: t.tokenName, value: "Sentia", sub: "SNT" },
              { label: t.tokenSupply, value: "1,000,000,000", sub: t.tokenSupplySub },
              { label: t.tokenSector, value: t.tokenSectorVal, sub: t.tokenSectorSub },
              { label: t.tokenNetwork, value: "BNB Chain", sub: t.tokenNetworkSub },
              { label: t.tokenConsensus, value: "PoS + AI", sub: t.tokenConsensusSub },
              { label: t.tokenOpenSource, value: t.tokenOpenSourceVal, sub: t.tokenOpenSourceSub },
            ].map((item, i, arr) => (
              <div key={i} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "14px 18px",
                borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : "none",
              }}>
                <span style={{ fontSize: 13, color: C.sub }}>{item.label}</span>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{item.value}</div>
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{item.sub}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ROADMAP */}
      <section id="roadmap" style={{
        padding: "56px 20px",
        background: C.surface,
        borderTop: `1px solid ${C.border}`,
        borderBottom: `1px solid ${C.border}`,
      }}>
        <div style={{ maxWidth: 700, margin: "0 auto" }}>
          <div style={{ fontSize: 10, color: C.amber, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>
            {t.roadmapLabel}
          </div>
          <h2 style={{ fontSize: 24, fontWeight: 800, color: C.text, marginBottom: 32, lineHeight: 1.25 }}>
            {t.roadmapTitle}
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {[
              { phase: "Phase 01", title: t.phase1, status: "Completed", items: t.phase1Items },
              { phase: "Phase 02", title: t.phase2, status: "In Progress", items: t.phase2Items },
              { phase: "Phase 03", title: t.phase3, status: "Upcoming", items: t.phase3Items },
              { phase: "Phase 04", title: t.phase4, status: "Planned", items: t.phase4Items },
            ].map((r, i) => {
              const statusLabel =
                r.status === "Completed" ? t.statusCompleted :
                r.status === "In Progress" ? t.statusInProgress :
                r.status === "Upcoming" ? t.statusUpcoming : t.statusPlanned;
              return (
                <div key={i} style={{
                  display: "flex", gap: 18,
                  paddingBottom: i < 3 ? 28 : 0,
                  position: "relative",
                }}>
                  {i < 3 && (
                    <div style={{
                      position: "absolute", left: 14, top: 30, bottom: 0,
                      width: 1, background: C.border,
                    }} />
                  )}
                  <div style={{
                    width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
                    background: r.status === "Completed" ? C.amber : r.status === "In Progress" ? C.amberDim : C.bg,
                    border: `2px solid ${r.status === "Completed" ? C.amber : r.status === "In Progress" ? C.amber : C.border}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    zIndex: 1,
                  }}>
                    {r.status === "Completed" && (
                      <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                        <path d="M2 6l3 3 5-5" stroke="#080B10" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                    {r.status === "In Progress" && (
                      <div style={{ width: 7, height: 7, borderRadius: "50%", background: C.amber }} />
                    )}
                  </div>
                  <div style={{ paddingTop: 3 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                      <span style={{ fontSize: 10, color: C.sub, fontWeight: 600, letterSpacing: 1 }}>{r.phase}</span>
                      <span style={{
                        fontSize: 10, padding: "2px 7px", borderRadius: 10,
                        background: r.status === "Completed" ? "rgba(34,197,94,0.12)" : r.status === "In Progress" ? C.amberDim : C.surface,
                        color: r.status === "Completed" ? C.green : r.status === "In Progress" ? C.amber : C.muted,
                        border: `1px solid ${r.status === "Completed" ? "rgba(34,197,94,0.3)" : r.status === "In Progress" ? C.amberBorder : C.border}`,
                        fontWeight: 600,
                      }}>{statusLabel}</span>
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 7 }}>{r.title}</div>
                    <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                      {r.items.map((item, j) => (
                        <li key={j} style={{ fontSize: 12, color: C.sub, display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ width: 4, height: 4, borderRadius: "50%", background: C.muted, flexShrink: 0 }} />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{
        borderTop: `1px solid ${C.border}`,
        padding: "28px 20px",
        background: C.bg,
      }}>
        <div style={{ maxWidth: 700, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 20, marginBottom: 24 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <img src={SENTIA_ICON} alt="SNT" style={{ width: 18, height: 18, borderRadius: "50%" }} />
                <span style={{ fontWeight: 700, color: C.amber, letterSpacing: 1.5, fontSize: 13 }}>SENTIA</span>
              </div>
              <div style={{ fontSize: 12, color: C.muted, maxWidth: 200, lineHeight: 1.6 }}>
                {t.footerTagline}
              </div>
            </div>
            <div style={{ display: "flex", gap: 28 }}>
              <div>
                <div style={{ fontSize: 10, color: C.sub, fontWeight: 700, letterSpacing: 1, marginBottom: 10, textTransform: "uppercase" }}>{t.footerResources}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {[
                    { label: t.footerWhitepaper, action: () => navigate("/sentia/whitepaper") },
                    { label: t.footerPrivateSale, action: () => navigate("/sentia/buy") },
                  ].map((l, i) => (
                    <button key={i} onClick={l.action} style={{
                      background: "none", border: "none", cursor: "pointer",
                      color: C.sub, fontSize: 12, textAlign: "left", padding: 0,
                    }}>{l.label}</button>
                  ))}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: C.sub, fontWeight: 700, letterSpacing: 1, marginBottom: 10, textTransform: "uppercase" }}>{t.footerProtocol}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {["BNB Chain", "BEP-20", "PoS + AI"].map((l, i) => (
                    <span key={i} style={{ color: C.muted, fontSize: 12 }}>{l}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 18, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <div style={{ fontSize: 11, color: C.muted }}>{t.footerCopyright}</div>
            <div style={{ fontSize: 11, color: C.muted }}>{t.footerDisclaimer}</div>
          </div>
        </div>
      </footer>
    </div>
  );
}
