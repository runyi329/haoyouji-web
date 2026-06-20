import { useEffect, useState, useCallback, createContext, useContext } from "react";
import { CheckCircle2, XCircle, AlertTriangle, Info } from "lucide-react";

type ToastType = "success" | "error" | "warning" | "info";

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

interface CenterToastContextValue {
  success: (msg: string) => void;
  error: (msg: string) => void;
  warning: (msg: string) => void;
  info: (msg: string) => void;
}

const CenterToastContext = createContext<CenterToastContextValue | null>(null);

// 全局引用，供非组件代码调用
let globalToast: CenterToastContextValue | null = null;

export function useCenterToast() {
  const ctx = useContext(CenterToastContext);
  if (ctx) return ctx;
  // fallback to global
  if (globalToast) return globalToast;
  throw new Error("CenterToast not mounted");
}

// 全局函数，可以在任何地方 import 后直接调用
export const centerToast = {
  success: (msg: string) => globalToast?.success(msg),
  error: (msg: string) => globalToast?.error(msg),
  warning: (msg: string) => globalToast?.warning(msg),
  info: (msg: string) => globalToast?.info(msg),
};

let nextId = 0;

const iconMap: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle2 className="w-5 h-5 text-blue-500 flex-shrink-0" />,
  error: <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />,
  warning: <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />,
  info: <Info className="w-5 h-5 text-blue-500 flex-shrink-0" />,
};

const bgMap: Record<ToastType, string> = {
  success: "#EFF6FF",
  error: "#FEF2F2",
  warning: "#FFFBEB",
  info: "#EFF6FF",
};

const borderMap: Record<ToastType, string> = {
  success: "#BFDBFE",
  error: "#FECACA",
  warning: "#FDE68A",
  info: "#BFDBFE",
};

export function CenterToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = useCallback((type: ToastType, message: string) => {
    const id = ++nextId;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  const api: CenterToastContextValue = {
    success: (msg) => addToast("success", msg),
    error: (msg) => addToast("error", msg),
    warning: (msg) => addToast("warning", msg),
    info: (msg) => addToast("info", msg),
  };

  useEffect(() => {
    globalToast = api;
    return () => { globalToast = null; };
  });

  return (
    <CenterToastContext.Provider value={api}>
      {children}
      {/* Toast 渲染层 */}
      {toasts.length > 0 && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 999999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", alignItems: "center" }}>
            {toasts.map((t) => (
              <div
                key={t.id}
                style={{
                  pointerEvents: "auto",
                  background: bgMap[t.type],
                  border: `1px solid ${borderMap[t.type]}`,
                  borderRadius: "14px",
                  padding: "14px 20px",
                  fontSize: "14px",
                  lineHeight: "1.5",
                  color: "#1A2340",
                  boxShadow: "0 8px 32px rgba(0,0,0,0.15)",
                  maxWidth: "300px",
                  minWidth: "200px",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "10px",
                  animation: "centerToastIn 0.25s ease-out",
                }}
              >
                {iconMap[t.type]}
                <span style={{ flex: 1 }}>{t.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <style>{`
        @keyframes centerToastIn {
          from { opacity: 0; transform: scale(0.9); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </CenterToastContext.Provider>
  );
}
