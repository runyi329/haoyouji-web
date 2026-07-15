import { useLocation } from "wouter";

export default function RiceProductPage() {
  const [, navigate] = useLocation();

  return (
    <div style={{ position: "fixed", inset: 0, background: "#fff", zIndex: 50 }}>
      {/* 返回按钮 */}
      <button
        onClick={() => navigate("/")}
        style={{
          position: "absolute",
          top: 10,
          left: 12,
          zIndex: 100,
          background: "rgba(0,0,0,0.35)",
          color: "#fff",
          border: "none",
          borderRadius: "50%",
          width: 32,
          height: 32,
          fontSize: 18,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
        }}
      >
        ‹
      </button>
      <iframe
        src="/rice-product/index.html"
        style={{ width: "100%", height: "100%", border: "none" }}
        title="稻花香桓仁大米"
      />
    </div>
  );
}
