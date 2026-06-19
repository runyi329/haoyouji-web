import { useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";

export default function LongxiaThemeManager() {
  const [, navigate] = useLocation();
  return (
    <div style={{ maxWidth: 480, margin: "0 auto", minHeight: "100dvh", background: "#f6f8fa" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 16px 12px", background: "#fff", borderBottom: "1px solid #eceff3" }}>
        <button onClick={() => navigate(-1 as any)} style={{ width: 32, height: 32, borderRadius: "50%", background: "#f6f8fa", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <ArrowLeft size={16} color="#26303c" />
        </button>
        <span style={{ fontSize: 17, fontWeight: 700, color: "#26303c" }}>主题管理</span>
      </div>
      <div style={{ padding: 32, textAlign: "center", color: "#9aa7b5", fontSize: 14 }}>
        功能开发中
      </div>
    </div>
  );
}
