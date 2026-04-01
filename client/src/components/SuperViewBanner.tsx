import { useQueryClient } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

// 超级视角悬浮返回条
// 当 localStorage 中存在 super_admin_original_user 时显示
export function SuperViewBanner() {
  const queryClient = useQueryClient();

  const originalUserStr = localStorage.getItem("super_admin_original_user");
  if (!originalUserStr) return null;

  let originalUser: { id: number; name: string; username: string } | null = null;
  try {
    originalUser = JSON.parse(originalUserStr);
  } catch {
    return null;
  }

  if (!originalUser) return null;

  const switchBackMutation = trpc.auth.quickLogin.useMutation({
    onSuccess: () => {
      try {
        localStorage.removeItem("super_admin_original_user");
        localStorage.removeItem("manus-runtime-user-info");
      } catch {}
      queryClient.clear();
      window.location.href = "/";
    },
    onError: (error) => {
      toast.error(error.message || "切换失败");
    },
  });

  const handleReturn = () => {
    if (!originalUser) return;
    switchBackMutation.mutate({ targetUserId: originalUser.id });
  };

  return (
    <div
      style={{
        position: "fixed",
        bottom: 60,
        left: 0,
        right: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: "#F59E0B",
        color: "#1a1a1a",
        padding: "10px 16px",
        fontSize: 13,
        fontWeight: 600,
        boxShadow: "0 -2px 8px rgba(0,0,0,0.15)",
      }}
    >
      <span>超级视角模式中</span>
      <button
        onClick={handleReturn}
        disabled={switchBackMutation.isPending}
        style={{
          background: "#1a1a1a",
          color: "#F59E0B",
          border: "none",
          borderRadius: 6,
          padding: "5px 14px",
          fontSize: 12,
          fontWeight: 700,
          cursor: "pointer",
          opacity: switchBackMutation.isPending ? 0.6 : 1,
        }}
      >
        {switchBackMutation.isPending ? "切换中..." : `返回 ${originalUser.name || originalUser.username} 账户`}
      </button>
    </div>
  );
}
