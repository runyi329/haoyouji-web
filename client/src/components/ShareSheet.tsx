/**
 * ShareSheet - 通用分享底部弹出面板
 * 仿微信/淘宝/京东分享弹窗体验
 * 
 * 使用方式：
 * <ShareSheet
 *   open={showShare}
 *   onClose={() => setShowShare(false)}
 *   shareUrl="https://jiangyuchen.cn/share/wine/product/romanico?ref=cx8618"
 *   title="ROMANICO 罗马尼克干红葡萄酒"
 *   description="RP 92分 · 西班牙托罗产区 · ¥328"
 * />
 */
import { useEffect } from "react";
import { X, Copy, MessageCircle, Users, Link } from "lucide-react";
import { toast } from "sonner";

interface ShareSheetProps {
  open: boolean;
  onClose: () => void;
  shareUrl: string;
  title?: string;
  description?: string;
}

export default function ShareSheet({ open, onClose, shareUrl, title, description }: ShareSheetProps) {
  // 点击遮罩关闭
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // 复制链接
  const handleCopy = async () => {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareUrl);
        toast.success("链接已复制", { description: "请粘贴到微信或其他应用分享" });
      } else {
        // 降级方案：创建临时 input 复制
        const el = document.createElement("textarea");
        el.value = shareUrl;
        el.style.position = "fixed";
        el.style.opacity = "0";
        document.body.appendChild(el);
        el.select();
        document.execCommand("copy");
        document.body.removeChild(el);
        toast.success("链接已复制", { description: "请粘贴到微信或其他应用分享" });
      }
    } catch {
      toast.error("复制失败", { description: "请手动复制：" + shareUrl });
    }
    onClose();
  };

  // 分享到微信好友（微信内置浏览器支持 wx.shareToFriend，但需要 JSSDK，
  // 这里退化为提示用户点击右上角"..."分享）
  const handleWechatFriend = () => {
    const isWeChat = /MicroMessenger/i.test(navigator.userAgent);
    if (isWeChat) {
      toast.info("分享给好友", {
        description: "请点击右上角「···」→「发送给朋友」",
        duration: 4000,
      });
    } else {
      // 非微信环境，复制链接
      handleCopy();
      return;
    }
    onClose();
  };

  // 分享到朋友圈
  const handleWechatMoments = () => {
    const isWeChat = /MicroMessenger/i.test(navigator.userAgent);
    if (isWeChat) {
      toast.info("分享到朋友圈", {
        description: "请点击右上角「···」→「分享到朋友圈」",
        duration: 4000,
      });
    } else {
      handleCopy();
      return;
    }
    onClose();
  };

  // 系统原生分享（支持的浏览器）
  const handleSystemShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: title || "好友推荐",
          text: description || "",
          url: shareUrl,
        });
      } catch {
        // 用户取消分享，不报错
      }
    } else {
      handleCopy();
      return;
    }
    onClose();
  };

  if (!open) return null;

  const isWeChat = /MicroMessenger/i.test(navigator.userAgent);
  const hasNativeShare = !isWeChat && !!navigator.share;

  return (
    <>
      {/* 遮罩层 */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.6)",
          zIndex: 1000,
          backdropFilter: "blur(2px)",
        }}
      />

      {/* 底部弹出面板 */}
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 1001,
          background: "#1a1a1a",
          borderRadius: "20px 20px 0 0",
          paddingBottom: "env(safe-area-inset-bottom, 16px)",
        }}
      >
        {/* 顶部拖拽条 */}
        <div style={{ display: "flex", justifyContent: "center", paddingTop: 12, paddingBottom: 4 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.2)" }} />
        </div>

        {/* 标题 */}
        <div style={{ padding: "8px 20px 16px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <p style={{ fontSize: 15, fontWeight: 600, color: "#e8d5b7", marginBottom: 2 }}>
            {title || "分享"}
          </p>
          {description && (
            <p style={{ fontSize: 12, color: "rgba(232,213,183,0.45)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {description}
            </p>
          )}
        </div>

        {/* 分享选项图标行 */}
        <div style={{ display: "flex", justifyContent: "space-around", padding: "20px 16px 8px" }}>
          {/* 微信好友 */}
          <button
            onClick={handleWechatFriend}
            style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer" }}
          >
            <div style={{
              width: 56, height: 56, borderRadius: 16,
              background: "#07C160",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <MessageCircle style={{ width: 28, height: 28, color: "#fff" }} />
            </div>
            <span style={{ fontSize: 11, color: "rgba(232,213,183,0.6)" }}>微信好友</span>
          </button>

          {/* 朋友圈 */}
          <button
            onClick={handleWechatMoments}
            style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer" }}
          >
            <div style={{
              width: 56, height: 56, borderRadius: 16,
              background: "#07C160",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Users style={{ width: 28, height: 28, color: "#fff" }} />
            </div>
            <span style={{ fontSize: 11, color: "rgba(232,213,183,0.6)" }}>朋友圈</span>
          </button>

          {/* 复制链接 */}
          <button
            onClick={handleCopy}
            style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer" }}
          >
            <div style={{
              width: 56, height: 56, borderRadius: 16,
              background: "rgba(201,168,76,0.15)",
              border: "1px solid rgba(201,168,76,0.3)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Copy style={{ width: 26, height: 26, color: "#C9A84C" }} />
            </div>
            <span style={{ fontSize: 11, color: "rgba(232,213,183,0.6)" }}>复制链接</span>
          </button>

          {/* 更多/系统分享（非微信环境显示） */}
          {hasNativeShare && (
            <button
              onClick={handleSystemShare}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer" }}
            >
              <div style={{
                width: 56, height: 56, borderRadius: 16,
                background: "rgba(255,255,255,0.08)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Link style={{ width: 26, height: 26, color: "rgba(232,213,183,0.7)" }} />
              </div>
              <span style={{ fontSize: 11, color: "rgba(232,213,183,0.6)" }}>更多</span>
            </button>
          )}
        </div>

        {/* 分割线 + 取消按钮 */}
        <div style={{ margin: "8px 16px 0", borderTop: "1px solid rgba(255,255,255,0.08)" }} />
        <button
          onClick={onClose}
          style={{
            width: "100%",
            padding: "16px",
            background: "none",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            color: "rgba(232,213,183,0.5)",
            fontSize: 15,
          }}
        >
          <X style={{ width: 16, height: 16 }} />
          取消
        </button>
      </div>
    </>
  );
}
