import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { ChevronLeft, Copy, Check } from "lucide-react";
import { trpc } from "@/lib/trpc";
import QRCode from "qrcode";

export default function AfLedgerInvite() {
  const { id } = useParams<{ id: string }>();
  const ledgerId = id;
  const [, setLocation] = useLocation();
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState("");

  // 获取当前用户信息（含6位邀请码）
  const { data: me } = trpc.auth.me.useQuery();
  const inviteCode: string = (me as any)?.inviteCode || "";

  // 使用用户固定邀请码生成邀请链接（与上方邀请码保持一致）
  const inviteLink = inviteCode
    ? `https://jiangyuchen.cn/register?invite=${inviteCode}`
    : "";

  // 生成二维码
  useEffect(() => {
    if (inviteLink) {
      QRCode.toDataURL(inviteLink, {
        width: 280,
        margin: 2,
        color: { dark: "#1a1a1a", light: "#ffffff" },
      })
        .then((url) => setQrCodeUrl(url))
        .catch((err) => console.error("生成二维码失败:", err));
    }
  }, [inviteLink]);

  // 复制邀请码
  const handleCopyCode = async () => {
    if (!inviteCode) return;
    try {
      await navigator.clipboard.writeText(inviteCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {}
  };

  // 复制邀请链接
  const handleCopyLink = async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {}
  };

  return (
    <div className="min-h-screen bg-[#f5f5f5] flex flex-col">
      {/* 顶部红色导航栏 - 直角填满 */}
      <div className="bg-[#D32F2F] w-full">
        <div className="flex items-center px-4 pt-3 pb-4">
          <button
            onClick={() => setLocation(`/ledger/${ledgerId}`)}
            className="p-1 -ml-1 mr-2"
          >
            <ChevronLeft className="w-6 h-6 text-white" />
          </button>
          <h1 className="flex-1 text-center text-lg font-semibold text-white pr-8">
            我的邀请
          </h1>
        </div>
        {/* 专属邀请码 - 一行显示，右侧一键复制图标 */}
        <div className="px-4 pb-5 flex items-center gap-2">
          <span className="text-white/80 text-sm whitespace-nowrap">我的专属邀请码</span>
          <span className="text-white font-bold text-lg tracking-widest ml-1">
            {inviteCode || "加载中..."}
          </span>
          <button
            onClick={handleCopyCode}
            disabled={!inviteCode}
            className="ml-1 p-1 rounded-full bg-white/20 active:bg-white/30 transition-colors disabled:opacity-40"
            title="复制邀请码"
          >
            {copiedCode ? (
              <Check className="w-4 h-4 text-white" />
            ) : (
              <Copy className="w-4 h-4 text-white" />
            )}
          </button>
        </div>
      </div>

      {/* 主内容区 */}
      <div className="flex-1 flex flex-col items-center px-6 pt-6 pb-8 space-y-5">
        {/* 专属二维码 */}
        <div className="bg-white rounded-2xl p-5 shadow-sm flex flex-col items-center w-full">
          <p className="text-sm text-gray-500 mb-4">专属二维码</p>
          {qrCodeUrl ? (
            <img
              src={qrCodeUrl}
              alt="邀请二维码"
              className="rounded-xl"
              style={{ width: 260, height: 260 }}
            />
          ) : (
            <div
              className="bg-gray-100 rounded-xl flex items-center justify-center"
              style={{ width: 260, height: 260 }}
            >
              <p className="text-gray-400 text-sm">生成中...</p>
            </div>
          )}
        </div>

        {/* 邀请链接 */}
        <div className="bg-white rounded-2xl p-4 shadow-sm w-full">
          <p className="text-sm text-gray-500 mb-3">邀请链接</p>
          <div className="bg-gray-50 rounded-xl px-3 py-2 text-xs text-gray-600 break-all mb-3">
            {inviteLink || "生成中..."}
          </div>
          <button
            onClick={handleCopyLink}
            disabled={!inviteLink}
            className="w-full py-2.5 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 transition-opacity disabled:opacity-50"
            style={{ backgroundColor: "#D32F2F" }}
          >
            {copiedLink ? (
              <>
                <Check className="w-4 h-4" />
                已复制
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                复制链接
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
