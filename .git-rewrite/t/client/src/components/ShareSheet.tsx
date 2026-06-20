/**
 * ShareSheet - 通用分享底部弹出面板
 *
 * 分享策略：
 * - Safari/Chrome（非微信）：调用 navigator.share() 弹出系统级分享菜单，可直接选择微信/朋友圈
 * - 微信内置浏览器：显示引导提示，告知用户点右上角「···」→「发送给朋友」/「分享到朋友圈」
 *   同时提供「复制链接」备用
 *
 * 邀请码规则：
 * - shareUrl 应已包含 ?ref={inviteCode}，由调用方动态拼接
 * - inviteCode 用于在面板顶部展示提示，让用户知道邀请码已包含在链接中
 */
import { useEffect } from "react";
import { X, Copy, MessageCircle, Users, Share2 } from "lucide-react";
import { toast } from "sonner";

interface ShareSheetProps {
  open: boolean;
  onClose: () => void;
  shareUrl: string;
  title?: string;
  description?: string;
  /** 当前登录用户的邀请码，用于在面板顶部显示提示 */
  inviteCode?: string | null;
  /** 当前是否已登录 */
  isLoggedIn?: boolean;
}

const isWeChatBrowser = () => /MicroMessenger/i.test(navigator.userAgent);

const copyToClipboard = async (text: string): Promise<boolean> => {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}
  try {
    const el = document.createElement("textarea");
    el.value = text;
    el.style.cssText = "position:fixed;top:-9999px;left:-9999px;opacity:0;";
    document.body.appendChild(el);
    el.focus();
    el.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
};

export default function ShareSheet({ open, onClose, shareUrl, title, description, inviteCode, isLoggedIn }: ShareSheetProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const inWeChat = isWeChatBrowser();
  const hasNativeShare = !inWeChat && !!navigator.share;

  const handleCopy = async () => {
    const ok = await copyToClipboard(shareUrl);
    if (ok) {
      toast.success("链接已复制", { description: "请打开微信粘贴给好友" });
    } else {
      toast.info("请手动复制链接", { description: shareUrl, duration: 8000 });
    }
    onClose();
  };

  const handleSystemShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: title || "好友推荐", text: description || "", url: shareUrl });
      } catch {}
    } else {
      await handleCopy();
      return;
    }
    onClose();
  };

  if (!open) return null;

  return (
    <>
      {/* 遮罩层 */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0,
          background: "rgba(0,0,0,0.6)",
          zIndex: 1000,
          backdropFilter: "blur(2px)",
        }}
      />

      {/* 底部弹出面板 */}
      <div
        style={{
          position: "fixed", bottom: 0, left: 0, right: 0,
          zIndex: 1001,
          background: "#1a1a1a",
          borderRadius: "20px 20px 0 0",
          paddingBottom: "env(safe-area-inset-bottom, 16px)",
        }}
      >
        {/* 拖拽条 */}
        <div style={{ display: "flex", justifyContent: "center", paddingTop: 12, paddingBottom: 4 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.2)" }} />
        </div>

        {/* 标题 */}
        <div style={{ padding: "8px 20px 12px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <p style={{ fontSize: 15, fontWeight: 600, color: "#e8d5b7", marginBottom: 2 }}>
            {title || "分享"}
          </p>
          {description && (
            <p style={{ fontSize: 12, color: "rgba(232,213,183,0.45)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {description}
            </p>
          )}
        </div>

        {/* 邀请码提示栏 */}
        <div style={{ padding: "12px 20px 0" }}>
          {isLoggedIn && inviteCode ? (
            <div style={{
              background: "rgba(201,168,76,0.1)",
              border: "1px solid rgba(201,168,76,0.25)",
              borderRadius: 10,
              padding: "10px 14px",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}>
              <span style={{ fontSize: 16 }}>🎁</span>
              <p style={{ fontSize: 12, color: "rgba(232,213,183,0.85)", lineHeight: 1.5 }}>
                已包含您的邀请码 <strong style={{ color: "#C9A84C", letterSpacing: 1 }}>{inviteCode}</strong>，好友注册后自动成为您的人脉
              </p>
            </div>
          ) : (
            <div style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 10,
              padding: "10px 14px",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}>
              <span style={{ fontSize: 16 }}>🔗</span>
              <p style={{ fontSize: 12, color: "rgba(232,213,183,0.55)", lineHeight: 1.5 }}>
                好友通过此链接注册后，将绑定本商城
              </p>
            </div>
          )}
        </div>

        {/* 微信内：引导提示 */}
        {inWeChat && (
          <div style={{ padding: "12px 20px 0" }}>
            <div style={{
              background: "rgba(7,193,96,0.1)",
              border: "1px solid rgba(7,193,96,0.3)",
              borderRadius: 12,
              padding: "14px",
              display: "flex",
              alignItems: "flex-start",
              gap: 12,
            }}>
              <div style={{ fontSize: 24, lineHeight: 1 }}>☝️</div>
              <div>
                <p style={{ fontSize: 14, fontWeight: 600, color: "#07C160", marginBottom: 4 }}>
                  点右上角「···」分享
                </p>
                <p style={{ fontSize: 12, color: "rgba(232,213,183,0.6)", lineHeight: 1.6 }}>
                  选「发送给朋友」可分享给微信好友<br />
                  选「分享到朋友圈」可发朋友圈
                </p>
              </div>
            </div>
          </div>
        )}

        {/* 分享选项 */}
        <div style={{ display: "flex", justifyContent: inWeChat ? "center" : "space-around", gap: inWeChat ? 32 : 0, padding: "20px 16px 8px" }}>

          {/* 非微信环境：微信好友 */}
          {!inWeChat && (
            <button
              onClick={handleSystemShare}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer" }}
            >
              <div style={{ width: 56, height: 56, borderRadius: 16, background: "#07C160", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <MessageCircle style={{ width: 28, height: 28, color: "#fff" }} />
              </div>
              <span style={{ fontSize: 11, color: "rgba(232,213,183,0.6)" }}>微信好友</span>
            </button>
          )}

          {/* 非微信环境：朋友圈 */}
          {!inWeChat && (
            <button
              onClick={handleSystemShare}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer" }}
            >
              <div style={{ width: 56, height: 56, borderRadius: 16, background: "#07C160", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Users style={{ width: 28, height: 28, color: "#fff" }} />
              </div>
              <span style={{ fontSize: 11, color: "rgba(232,213,183,0.6)" }}>朋友圈</span>
            </button>
          )}

          {/* 复制链接（始终显示） */}
          <button
            onClick={handleCopy}
            style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer" }}
          >
            <div style={{ width: 56, height: 56, borderRadius: 16, background: "rgba(201,168,76,0.15)", border: "1px solid rgba(201,168,76,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Copy style={{ width: 26, height: 26, color: "#C9A84C" }} />
            </div>
            <span style={{ fontSize: 11, color: "rgba(232,213,183,0.6)" }}>复制链接</span>
          </button>

          {/* 更多（非微信且支持系统分享时显示） */}
          {hasNativeShare && (
            <button
              onClick={handleSystemShare}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer" }}
            >
              <div style={{ width: 56, height: 56, borderRadius: 16, background: "rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Share2 style={{ width: 26, height: 26, color: "rgba(232,213,183,0.7)" }} />
              </div>
              <span style={{ fontSize: 11, color: "rgba(232,213,183,0.6)" }}>更多</span>
            </button>
          )}
        </div>

        {/* 取消 */}
        <div style={{ margin: "0 16px", borderTop: "1px solid rgba(255,255,255,0.08)" }} />
        <button
          onClick={onClose}
          style={{ width: "100%", padding: "16px", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, color: "rgba(232,213,183,0.5)", fontSize: 15 }}
        >
          <X style={{ width: 16, height: 16 }} />
          取消
        </button>
      </div>
    </>
  );
}
