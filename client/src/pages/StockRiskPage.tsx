import { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";

// 加载阶段：auth → sso → iframe → done
type LoadStage = "auth" | "sso" | "iframe" | "done";

const STAGE_LABELS: Record<LoadStage, string> = {
  auth: "正在验证身份...",
  sso: "正在建立安全连接...",
  iframe: "正在加载風控數據...",
  done: "加载完成",
};

// A 股风控 Logo SVG（K线图风格）
function StockLogo({ size = 48 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      {/* 外框六边形 */}
      <polygon
        points="24,4 42,14 42,34 24,44 6,34 6,14"
        fill="none"
        stroke="#F0A500"
        strokeWidth="1.5"
        opacity="0.3"
      />
      <polygon
        points="24,10 38,18 38,30 24,38 10,30 10,18"
        fill="none"
        stroke="#F0A500"
        strokeWidth="1"
        opacity="0.5"
      />
      {/* K 线图 */}
      <line x1="16" y1="14" x2="16" y2="34" stroke="#F0A500" strokeWidth="1" opacity="0.4" />
      <rect x="13" y="18" width="6" height="8" fill="#0ECB81" opacity="0.9" rx="0.5" />
      <line x1="24" y1="12" x2="24" y2="36" stroke="#F0A500" strokeWidth="1" opacity="0.4" />
      <rect x="21" y="20" width="6" height="10" fill="#F6465D" opacity="0.9" rx="0.5" />
      <line x1="32" y1="16" x2="32" y2="32" stroke="#F0A500" strokeWidth="1" opacity="0.4" />
      <rect x="29" y="19" width="6" height="7" fill="#0ECB81" opacity="0.9" rx="0.5" />
    </svg>
  );
}

// 脉冲光环动画
function PulseRing({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <div
      style={{
        position: "absolute",
        inset: -12,
        borderRadius: "50%",
        border: "2px solid #F0A500",
        opacity: 0,
        animation: "pulse-ring 1.8s ease-out infinite",
        pointerEvents: "none",
      }}
    />
  );
}

// 步骤指示点
function StepDots({ stage }: { stage: LoadStage }) {
  const stages: LoadStage[] = ["auth", "sso", "iframe"];
  const currentIdx = stages.indexOf(stage);
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", justifyContent: "center" }}>
      {stages.map((s, i) => {
        const isActive = i === currentIdx;
        const isDone = i < currentIdx || stage === "done";
        return (
          <div
            key={s}
            style={{
              width: isActive ? 20 : 6,
              height: 6,
              borderRadius: 3,
              background: isDone ? "#0ECB81" : isActive ? "#F0A500" : "#21262D",
              transition: "all 0.4s cubic-bezier(0.23, 1, 0.32, 1)",
              opacity: isDone || isActive ? 1 : 0.4,
            }}
          />
        );
      })}
    </div>
  );
}

export default function StockRiskPage() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const [, setLocation] = useLocation();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeSrc, setIframeSrc] = useState<string>("");
  const [loadStage, setLoadStage] = useState<LoadStage>("auth");
  const [iframeReady, setIframeReady] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);
  const [showProjectMenu, setShowProjectMenu] = useState(false);

  const stockRiskSsoLink = trpc.auth.stockRiskSsoLink.useMutation({
    onSuccess: (data) => {
      setLoadStage("iframe");
      setIframeSrc(data.url);
    },
    onError: () => {
      // 降级：直接加载（未登录状态）
      setLoadStage("iframe");
      setIframeSrc("https://eth-options.jiangyuchen.cn/stock-risk");
    },
  });

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      setLoadStage("iframe");
      setIframeSrc("https://eth-options.jiangyuchen.cn/stock-risk");
      return;
    }
    // 已登录：先进入 SSO 阶段
    setLoadStage("sso");
    stockRiskSsoLink.mutate();
  }, [isAuthenticated, isLoading]);

  // iframe 加载完成后触发淡出
  const handleIframeLoad = () => {
    setIframeReady(true);
    setTimeout(() => setFadeOut(true), 400);
    setTimeout(() => setLoadStage("done"), 900);
  };

  const showOverlay = loadStage !== "done";
  const avatarText = user?.name ? user.name.charAt(0).toUpperCase() : "?";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "#0D1117",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* ── 全局动画样式 ── */}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes pulse-ring {
          0%   { transform: scale(0.85); opacity: 0.6; }
          70%  { transform: scale(1.3);  opacity: 0; }
          100% { transform: scale(1.3);  opacity: 0; }
        }
        @keyframes float-y {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-6px); }
        }
        @keyframes shimmer {
          0%   { background-position: -200% center; }
          100% { background-position:  200% center; }
        }
        @keyframes fade-in-up {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes check-draw {
          from { stroke-dashoffset: 24; }
          to   { stroke-dashoffset: 0; }
        }
        .stock-float {
          animation: float-y 2.4s ease-in-out infinite;
        }
        .stage-label {
          animation: fade-in-up 0.35s cubic-bezier(0.23, 1, 0.32, 1) both;
        }
      `}</style>

      {/* ── 顶部返回栏（始终显示） ── */}
      <div
        style={{
          height: 44,
          display: "flex",
          alignItems: "center",
          padding: "0 12px",
          background: "#161B22",
          borderBottom: "1px solid #21262D",
          flexShrink: 0,
          position: "relative",
          zIndex: 2,
        }}
      >
        <button
          onClick={() => setLocation("/")}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 32,
            height: 32,
            color: "#8B949E",
            background: "none",
            border: "none",
            cursor: "pointer",
            borderRadius: 6,
            padding: 0,
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        {/* ── 项目切换下拉 ── */}
        <div style={{ flex: 1, display: "flex", justifyContent: "center", position: "relative" }}>
          <button
            onClick={() => setShowProjectMenu(m => !m)}
            style={{
              display: "flex", alignItems: "center", gap: 5,
              background: "transparent", border: "none",
              color: "#E6EDF3", fontSize: 15, fontWeight: 600,
              cursor: "pointer", padding: "4px 8px", borderRadius: 6,
            }}
          >
            潤儀投資 A 股風控
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points={showProjectMenu ? "18 15 12 9 6 15" : "6 9 12 15 18 9"} />
            </svg>
          </button>
          {showProjectMenu && (
            <div
              style={{
                position: "absolute", top: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)",
                background: "#161B22", border: "1px solid #30363D", borderRadius: 10,
                boxShadow: "0 8px 32px rgba(0,0,0,0.5)", zIndex: 9999, minWidth: 200, overflow: "hidden",
              }}
            >
              {/* ETH 期权监控 */}
              <div
                onClick={() => { setShowProjectMenu(false); setLocation("/eth-options"); }}
                style={{
                  padding: "11px 16px", display: "flex", alignItems: "center", gap: 10,
                  cursor: "pointer", transition: "background 0.15s",
                }}
                onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                <span style={{ fontSize: 16 }}>₿</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#E6EDF3" }}>ETH 期权监控工具</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 1 }}>实时期权链分析</div>
                </div>
              </div>
              {/* 当前项目：A 股风控 */}
              <div style={{
                padding: "11px 16px", display: "flex", alignItems: "center", gap: 10,
                background: "rgba(240,165,0,0.08)", borderTop: "1px solid #30363D",
              }}>
                <span style={{ fontSize: 16 }}>📊</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#F0A500" }}>潤儀投資 A 股風控</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 1 }}>当前项目</div>
                </div>
                <svg style={{ marginLeft: "auto" }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#F0A500" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
            </div>
          )}
          {/* 点击外部关闭 */}
          {showProjectMenu && (
            <div
              style={{ position: "fixed", inset: 0, zIndex: 9998 }}
              onClick={() => setShowProjectMenu(false)}
            />
          )}
        </div>
        {isAuthenticated && user ? (
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: "50%",
              background: "#F0A500",
              color: "#0D1117",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 13,
              fontWeight: 700,
              flexShrink: 0,
              overflow: "hidden",
            }}
          >
            {user.avatar ? (
              <img src={user.avatar} alt={user.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              avatarText
            )}
          </div>
        ) : (
          <div style={{ width: 30 }} />
        )}
      </div>

      {/* ── iframe（始终挂载，加载完成前透明） ── */}
      <iframe
        ref={iframeRef}
        src={iframeSrc || undefined}
        onLoad={iframeSrc ? handleIframeLoad : undefined}
        style={{
          flex: 1,
          width: "100%",
          border: "none",
          display: "block",
          opacity: loadStage === "done" ? 1 : 0,
          transition: "opacity 0.5s ease",
        }}
        allow="fullscreen"
        title="潤儀投資 A 股風控"
      />

      {/* ── 加载遮罩层 ── */}
      {showOverlay && (
        <div
          style={{
            position: "absolute",
            top: 44,
            left: 0,
            right: 0,
            bottom: 0,
            background: "#0D1117",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10,
            opacity: fadeOut ? 0 : 1,
            transition: "opacity 0.5s cubic-bezier(0.23, 1, 0.32, 1)",
            pointerEvents: fadeOut ? "none" : "auto",
          }}
        >
          {/* 背景网格光晕 */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "radial-gradient(ellipse 60% 40% at 50% 45%, rgba(240,165,0,0.06) 0%, transparent 70%)",
              pointerEvents: "none",
            }}
          />

          {/* 中心图标区 */}
          <div style={{ position: "relative", marginBottom: 32 }}>
            {/* 外层旋转光环 */}
            <div
              style={{
                position: "absolute",
                inset: -16,
                borderRadius: "50%",
                border: "1.5px solid transparent",
                borderTopColor: "#F0A500",
                borderRightColor: "rgba(240,165,0,0.3)",
                animation: "spin 1.2s linear infinite",
              }}
            />
            {/* 内层反向旋转 */}
            <div
              style={{
                position: "absolute",
                inset: -8,
                borderRadius: "50%",
                border: "1px solid transparent",
                borderBottomColor: "#F6C548",
                borderLeftColor: "rgba(246,197,72,0.3)",
                animation: "spin 2s linear infinite reverse",
              }}
            />
            {/* 脉冲光环 */}
            <PulseRing active={loadStage === "sso" || loadStage === "iframe"} />

            {/* Stock Logo */}
            <div
              className="stock-float"
              style={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                background: "linear-gradient(135deg, #161B22 0%, #1C2128 100%)",
                border: "1px solid #21262D",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 0 24px rgba(240,165,0,0.15)",
              }}
            >
              {/* 加载完成时显示对勾 */}
              {iframeReady ? (
                <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                  <circle cx="14" cy="14" r="11" stroke="#0ECB81" strokeWidth="1.5" opacity="0.3" />
                  <polyline
                    points="8,14 12,18 20,10"
                    stroke="#0ECB81"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeDasharray="24"
                    strokeDashoffset="0"
                    style={{ animation: "check-draw 0.4s ease forwards" }}
                  />
                </svg>
              ) : (
                <StockLogo size={36} />
              )}
            </div>
          </div>

          {/* 状态文字 */}
          <div style={{ textAlign: "center", marginBottom: 20 }}>
            <p
              key={loadStage}
              className="stage-label"
              style={{
                fontSize: 15,
                fontWeight: 500,
                color: iframeReady ? "#0ECB81" : "#C9D1D9",
                marginBottom: 6,
                letterSpacing: "0.01em",
              }}
            >
              {iframeReady ? "加载完成" : STAGE_LABELS[loadStage]}
            </p>
            {/* 闪光进度条 */}
            {!iframeReady && (
              <div
                style={{
                  width: 140,
                  height: 2,
                  borderRadius: 1,
                  background: "#21262D",
                  overflow: "hidden",
                  margin: "0 auto",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    borderRadius: 1,
                    background:
                      "linear-gradient(90deg, transparent 0%, #F0A500 40%, #F6C548 50%, #F0A500 60%, transparent 100%)",
                    backgroundSize: "200% 100%",
                    animation: "shimmer 1.6s ease-in-out infinite",
                  }}
                />
              </div>
            )}
          </div>

          {/* 步骤指示点 */}
          <StepDots stage={iframeReady ? "done" : loadStage} />

          {/* 底部提示 */}
          <p
            style={{
              position: "absolute",
              bottom: 32,
              fontSize: 11,
              color: "#484F58",
              letterSpacing: "0.02em",
            }}
          >
            由 Tushare 实时数据驱动
          </p>
        </div>
      )}
    </div>
  );
}
