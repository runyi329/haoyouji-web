/**
 * Sentia (SNT) — Official Website
 * Design: International Web3 project, inspired by Celestia / EigenLayer / Aptos
 * Palette: #080B10 (deep black) + #F5A623 (amber) + #0E1117 (card bg)
 * Language: English-first, no emoji, minimal, technical
 */
import { useEffect } from "react";
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

export default function SentiaHome() {
  const [, navigate] = useLocation();

  useEffect(() => {
    const prev = document.title;
    document.title = "";
    return () => { document.title = prev; };
  }, []);

  return (
    <div style={{
      minHeight: "100vh",
      background: C.bg,
      color: C.text,
      fontFamily: "'Inter', 'SF Pro Display', -apple-system, sans-serif",
      overflowX: "hidden",
    }}>

      {/* NAV */}
      <nav style={{
        position: "sticky", top: 0, zIndex: 100,
        background: "rgba(8,11,16,0.92)",
        backdropFilter: "blur(12px)",
        borderBottom: `1px solid ${C.border}`,
        padding: "0 24px",
        height: 58,
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img src={SENTIA_ICON} alt="SNT" style={{ width: 26, height: 26, borderRadius: "50%" }} />
          <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: 2, color: C.amber }}>SENTIA</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={() => navigate("/sentia/whitepaper")}
            style={{
              background: "transparent",
              border: `1px solid ${C.border}`,
              borderRadius: 4, padding: "7px 14px",
              color: C.sub, fontSize: 13, cursor: "pointer", fontWeight: 500,
            }}
          >
            Docs
          </button>
          <button
            onClick={() => navigate("/sentia/buy")}
            style={{
              background: C.amber,
              border: "none", borderRadius: 4, padding: "7px 16px",
              color: "#080B10", fontWeight: 700, fontSize: 13, cursor: "pointer",
              letterSpacing: 0.3,
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
            </svg>
            Join Private Sale
          </button>
        </div>
      </nav>

      {/* HERO */}
      <section style={{
        padding: "72px 24px 64px",
        background: `radial-gradient(ellipse 80% 60% at 50% 0%, rgba(245,166,35,0.06) 0%, transparent 70%), ${C.bg}`,
        borderBottom: `1px solid ${C.border}`,
        textAlign: "center",
      }}>
        <div style={{ maxWidth: 600, margin: "0 auto" }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            background: C.amberDim,
            border: `1px solid ${C.amberBorder}`,
            borderRadius: 20, padding: "4px 14px", marginBottom: 28,
            fontSize: 11, color: C.amber, letterSpacing: 1.8, fontWeight: 600,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.green, display: "inline-block" }} />
            PRIVATE SALE · LIVE
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, marginBottom: 20 }}>
            <img src={SENTIA_ICON} alt="SNT" style={{ width: 64, height: 64, borderRadius: "50%", boxShadow: `0 0 0 1px ${C.border}, 0 12px 40px rgba(0,0,0,0.6)` }} />
            <div style={{ textAlign: "left" }}>
              <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: -1, color: C.text, lineHeight: 1 }}>SENTIA</div>
              <div style={{ fontSize: 13, color: C.sub, letterSpacing: 0.5, marginTop: 4 }}>SNT Protocol</div>
            </div>
          </div>

          <h1 style={{ fontSize: 22, fontWeight: 600, color: C.text, lineHeight: 1.5, marginBottom: 14, maxWidth: 480, margin: "0 auto 14px" }}>
            Decentralized AI Intelligence Layer<br />
            <span style={{ color: C.sub, fontWeight: 400, fontSize: 16 }}>for the Next-Generation Web3 Ecosystem</span>
          </h1>

          <p style={{ fontSize: 14, color: C.sub, lineHeight: 1.8, maxWidth: 400, margin: "0 auto 36px" }}>
            Sentia bridges on-chain consensus with federated AI inference,
            enabling verifiable, permissionless intelligence across distributed networks.
          </p>

          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <button
              onClick={() => navigate("/sentia/buy")}
              style={{
                background: C.amber,
                border: "none", borderRadius: 4, padding: "13px 28px",
                color: "#080B10", fontWeight: 700, fontSize: 15, cursor: "pointer",
                letterSpacing: 0.2,
              }}
            >
              Join Private Sale
            </button>
            <button
              onClick={() => {
                const el = document.getElementById("architecture");
                if (el) el.scrollIntoView({ behavior: "smooth" });
              }}
              style={{
                background: "transparent",
                border: `1px solid ${C.border}`, borderRadius: 4, padding: "13px 28px",
                color: C.text, fontWeight: 500, fontSize: 15, cursor: "pointer",
              }}
            >
              Explore Architecture
            </button>
          </div>

          <button
            onClick={() => navigate("/sentia/whitepaper")}
            style={{
              marginTop: 18,
              background: "transparent", border: "none", cursor: "pointer",
              color: C.sub, fontSize: 12, display: "inline-flex", alignItems: "center", gap: 5,
              letterSpacing: 0.3,
            }}
          >
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
              <path d="M3 2h6l2 2v8H3V2z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
              <path d="M5 6h4M5 8h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
            Read Technical Whitepaper
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
              <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </section>

      {/* STATS BAR */}
      <section style={{
        padding: "0 24px",
        background: C.surface,
        borderBottom: `1px solid ${C.border}`,
      }}>
        <div style={{ maxWidth: 700, margin: "0 auto", display: "flex", overflowX: "auto" }}>
          {[
            { label: "Total Supply", value: "1,000,000,000", unit: "SNT" },
            { label: "Network", value: "BNB Chain", unit: "BEP-20" },
            { label: "Consensus", value: "PoS + AI", unit: "Layer" },
            { label: "Private Sale", value: "20%", unit: "Allocation" },
          ].map((s, i) => (
            <div key={i} style={{
              flex: "0 0 auto",
              padding: "18px 24px",
              borderRight: i < 3 ? `1px solid ${C.border}` : "none",
              minWidth: 140,
            }}>
              <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>{s.label}</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: C.text, letterSpacing: -0.3 }}>{s.value}</div>
              <div style={{ fontSize: 11, color: C.sub, marginTop: 2 }}>{s.unit}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ARCHITECTURE */}
      <section id="architecture" style={{ padding: "64px 24px" }}>
        <div style={{ maxWidth: 700, margin: "0 auto" }}>
          <div style={{ marginBottom: 36 }}>
            <div style={{ fontSize: 11, color: C.amber, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", marginBottom: 10 }}>
              Technical Architecture
            </div>
            <h2 style={{ fontSize: 26, fontWeight: 800, color: C.text, lineHeight: 1.25, marginBottom: 12 }}>
              Three-Layer Protocol Stack
            </h2>
            <p style={{ fontSize: 14, color: C.sub, lineHeight: 1.8, maxWidth: 480 }}>
              Sentia separates AI inference, consensus validation, and data availability
              into distinct layers — enabling modular scalability and verifiable computation.
            </p>
          </div>
          <div style={{
            borderRadius: 8,
            overflow: "hidden",
            border: `1px solid ${C.border}`,
            background: C.surface,
          }}>
            <img
              src={ARCH_IMG}
              alt="Sentia Architecture"
              style={{ width: "100%", display: "block" }}
            />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginTop: 16 }}>
            {[
              { label: "AI Inference Layer", desc: "Federated learning nodes process inference requests with ZK-proof verification", color: "#F5A623" },
              { label: "Consensus Layer", desc: "PoS validators finalize state transitions and AI output commitments", color: "#60A5FA" },
              { label: "Data Layer", desc: "Sharded storage with erasure coding ensures persistent data availability", color: "#34D399" },
            ].map((l, i) => (
              <div key={i} style={{
                background: C.surface,
                border: `1px solid ${C.border}`,
                borderRadius: 6, padding: "14px",
                borderTop: `2px solid ${l.color}`,
              }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: l.color, marginBottom: 6 }}>{l.label}</div>
                <div style={{ fontSize: 11, color: C.sub, lineHeight: 1.6 }}>{l.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* KEY FEATURES */}
      <section style={{
        padding: "64px 24px",
        background: C.surface,
        borderTop: `1px solid ${C.border}`,
        borderBottom: `1px solid ${C.border}`,
      }}>
        <div style={{ maxWidth: 700, margin: "0 auto" }}>
          <div style={{ fontSize: 11, color: C.amber, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", marginBottom: 10 }}>
            Core Properties
          </div>
          <h2 style={{ fontSize: 26, fontWeight: 800, color: C.text, marginBottom: 36, lineHeight: 1.25 }}>
            Built for Verifiable Intelligence
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {[
              {
                icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.amber} strokeWidth="1.8"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
                title: "ZK-Verified Inference",
                desc: "Every AI output is accompanied by a zero-knowledge proof, making results cryptographically verifiable on-chain.",
              },
              {
                icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.amber} strokeWidth="1.8"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/></svg>,
                title: "Federated Learning Nodes",
                desc: "Distributed AI nodes collaborate without sharing raw data, preserving privacy while enabling collective intelligence.",
              },
              {
                icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.amber} strokeWidth="1.8"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>,
                title: "Modular Architecture",
                desc: "Execution, consensus, and data availability are decoupled — each layer upgradeable independently.",
              },
              {
                icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.amber} strokeWidth="1.8"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
                title: "Permissionless Participation",
                desc: "Anyone can operate a node, stake SNT, and earn rewards — no whitelisting, no gatekeepers.",
              },
            ].map((f, i) => (
              <div key={i} style={{
                background: C.bg,
                border: `1px solid ${C.border}`,
                borderRadius: 8, padding: "20px 18px",
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 6,
                  background: C.amberDim, border: `1px solid ${C.amberBorder}`,
                  display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14,
                }}>{f.icon}</div>
                <div style={{ fontWeight: 700, fontSize: 14, color: C.text, marginBottom: 8 }}>{f.title}</div>
                <div style={{ fontSize: 12, color: C.sub, lineHeight: 1.7 }}>{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TOKEN PARAMETERS */}
      <section id="tokenomics" style={{ padding: "64px 24px" }}>
        <div style={{ maxWidth: 700, margin: "0 auto" }}>
          <div style={{ fontSize: 11, color: C.amber, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", marginBottom: 10 }}>
            Token Parameters
          </div>
          <h2 style={{ fontSize: 26, fontWeight: 800, color: C.text, marginBottom: 32, lineHeight: 1.25 }}>
            SNT Token Overview
          </h2>
          <div style={{
            background: C.surface,
            border: `1px solid ${C.border}`,
            borderRadius: 8, overflow: "hidden",
          }}>
            {[
              { label: "Token Name", value: "Sentia", sub: "SNT" },
              { label: "Total Supply", value: "1,000,000,000", sub: "Fixed, non-inflationary" },
              { label: "Sector", value: "AI Infrastructure", sub: "Artificial Intelligence · Web3" },
              { label: "Network", value: "BNB Chain", sub: "BEP-20 Standard" },
              { label: "Consensus", value: "PoS + AI", sub: "AI-Enhanced Consensus Layer" },
              { label: "Open Source", value: "Planned", sub: "GitHub repository pending" },
            ].map((item, i, arr) => (
              <div key={i} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "16px 20px",
                borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : "none",
              }}>
                <span style={{ fontSize: 13, color: C.sub }}>{item.label}</span>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{item.value}</div>
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{item.sub}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ROADMAP */}
      <section style={{
        padding: "64px 24px",
        background: C.surface,
        borderTop: `1px solid ${C.border}`,
        borderBottom: `1px solid ${C.border}`,
      }}>
        <div style={{ maxWidth: 700, margin: "0 auto" }}>
          <div style={{ fontSize: 11, color: C.amber, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", marginBottom: 10 }}>
            Roadmap
          </div>
          <h2 style={{ fontSize: 26, fontWeight: 800, color: C.text, marginBottom: 36, lineHeight: 1.25 }}>
            Development Milestones
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {[
              { phase: "Phase 01", title: "Foundation", status: "Completed", items: ["Protocol design & whitepaper", "Core team formation", "Private sale initiation"] },
              { phase: "Phase 02", title: "Infrastructure", status: "In Progress", items: ["Testnet deployment", "AI node client v0.1", "Smart contract audit"] },
              { phase: "Phase 03", title: "Ecosystem", status: "Upcoming", items: ["Mainnet launch", "Developer SDK release", "Strategic partnerships"] },
              { phase: "Phase 04", title: "Expansion", status: "Planned", items: ["Cross-chain bridge", "Governance module", "Exchange listing"] },
            ].map((r, i) => (
              <div key={i} style={{
                display: "flex", gap: 20,
                paddingBottom: i < 3 ? 32 : 0,
                position: "relative",
              }}>
                {i < 3 && (
                  <div style={{
                    position: "absolute", left: 15, top: 32, bottom: 0,
                    width: 1, background: C.border,
                  }} />
                )}
                <div style={{
                  width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
                  background: r.status === "Completed" ? C.amber : r.status === "In Progress" ? C.amberDim : C.bg,
                  border: `2px solid ${r.status === "Completed" ? C.amber : r.status === "In Progress" ? C.amber : C.border}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  zIndex: 1,
                }}>
                  {r.status === "Completed" && (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6l3 3 5-5" stroke="#080B10" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                  {r.status === "In Progress" && (
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.amber }} />
                  )}
                </div>
                <div style={{ paddingTop: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                    <span style={{ fontSize: 11, color: C.sub, fontWeight: 600, letterSpacing: 1 }}>{r.phase}</span>
                    <span style={{
                      fontSize: 10, padding: "2px 8px", borderRadius: 10,
                      background: r.status === "Completed" ? "rgba(34,197,94,0.12)" : r.status === "In Progress" ? C.amberDim : C.surface,
                      color: r.status === "Completed" ? C.green : r.status === "In Progress" ? C.amber : C.muted,
                      border: `1px solid ${r.status === "Completed" ? "rgba(34,197,94,0.3)" : r.status === "In Progress" ? C.amberBorder : C.border}`,
                      fontWeight: 600,
                    }}>{r.status}</span>
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 8 }}>{r.title}</div>
                  <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                    {r.items.map((item, j) => (
                      <li key={j} style={{ fontSize: 13, color: C.sub, display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ width: 4, height: 4, borderRadius: "50%", background: C.muted, flexShrink: 0 }} />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{
        borderTop: `1px solid ${C.border}`,
        padding: "32px 24px",
        background: C.bg,
      }}>
        <div style={{ maxWidth: 700, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 24, marginBottom: 28 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <img src={SENTIA_ICON} alt="SNT" style={{ width: 20, height: 20, borderRadius: "50%" }} />
                <span style={{ fontWeight: 700, color: C.amber, letterSpacing: 1.5, fontSize: 14 }}>SENTIA</span>
              </div>
              <div style={{ fontSize: 12, color: C.muted, maxWidth: 220, lineHeight: 1.6 }}>
                Decentralized AI Intelligence Layer for Web3
              </div>
            </div>
            <div style={{ display: "flex", gap: 32 }}>
              <div>
                <div style={{ fontSize: 11, color: C.sub, fontWeight: 700, letterSpacing: 1, marginBottom: 10, textTransform: "uppercase" }}>Resources</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {[
                    { label: "Whitepaper", action: () => navigate("/sentia/whitepaper") },
                    { label: "Private Sale", action: () => navigate("/sentia/buy") },
                  ].map((l, i) => (
                    <button key={i} onClick={l.action} style={{
                      background: "none", border: "none", cursor: "pointer",
                      color: C.sub, fontSize: 13, textAlign: "left", padding: 0,
                    }}>{l.label}</button>
                  ))}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: C.sub, fontWeight: 700, letterSpacing: 1, marginBottom: 10, textTransform: "uppercase" }}>Protocol</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {["BNB Chain", "BEP-20", "PoS + AI"].map((l, i) => (
                    <span key={i} style={{ color: C.muted, fontSize: 13 }}>{l}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 20, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <div style={{ fontSize: 12, color: C.muted }}>© 2025 Sentia Protocol. All rights reserved.</div>
            <div style={{ fontSize: 12, color: C.muted }}>This is not investment advice. Digital assets carry risk.</div>
          </div>
        </div>
      </footer>
    </div>
  );
}
