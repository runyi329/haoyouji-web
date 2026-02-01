import { useState, useEffect } from "react";
import { useParams, useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChevronLeft, Share2, Copy, Check } from "lucide-react";
import { trpc } from "@/lib/trpc";
import QRCode from "qrcode";
import { useColorTheme } from "@/contexts/ColorThemeContext";

export default function LedgerInvite() {
  const { id } = useParams<{ id: string }>();
  const ledgerId = id;
  const [, setLocation] = useLocation();
  const [copied, setCopied] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState("");

  // 获取全局主题色
  const { currentTheme, customColors } = useColorTheme();
  const themeColors = customColors || currentTheme.colors;

  // 获取账本信息
  const { data: ledger } = trpc.ledger.getById.useQuery(
    { ledgerId: parseInt(ledgerId!) },
    { enabled: !!ledgerId }
  );

  // 生成邀请token
  const { data: inviteData } = trpc.ledger.generateInviteToken.useQuery(
    { ledgerId: parseInt(ledgerId!) },
    { enabled: !!ledgerId }
  );

  // 生成邀请链接
  const inviteLink = inviteData?.token
    ? `${window.location.origin}/ledger/join/${inviteData.token}`
    : "";

  // 生成二维码
  useEffect(() => {
    if (inviteLink) {
      QRCode.toDataURL(inviteLink, {
        width: 256,
        margin: 2,
        color: {
          dark: themeColors.text,
          light: "#ffffff",
        },
      })
        .then((url) => setQrCodeUrl(url))
        .catch((err) => console.error("生成二维码失败:", err));
    }
  }, [inviteLink, themeColors.text]);

  // 复制邀请链接
  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("复制失败:", err);
    }
  };

  // 分享到微信（调用微信分享API）
  const handleShareToWechat = () => {
    // 这里需要集成微信JS-SDK
    // 暂时使用复制链接的方式
    handleCopyLink();
    alert("邀请链接已复制，请在微信中粘贴分享");
  };

  if (!ledger) {
    return <div className="flex items-center justify-center h-screen">加载中...</div>;
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: `${themeColors.primary}15` }}>
      {/* 顶部导航栏 */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 flex items-center">
          <Link href={`/ledger/${id}/settings`}>
            <button className="p-2 -ml-2 hover:bg-gray-100 rounded-lg transition-colors">
              <ChevronLeft className="w-6 h-6 text-gray-800" />
            </button>
          </Link>
          <h1 className="flex-1 text-center text-lg font-semibold text-gray-800">
            邀请伙伴
          </h1>
          <div className="w-10" /> {/* 占位，保持标题居中 */}
        </div>
      </div>

      {/* 主要内容 */}
      <div className="container mx-auto px-4 py-6 space-y-6">
        {/* 账本信息 */}
        <Card className="p-6 bg-white">
          <h2 className="text-xl font-bold mb-2" style={{ color: themeColors.text }}>{ledger.name}</h2>
          <p className="text-gray-600">邀请伙伴一起记账</p>
        </Card>

        {/* 二维码 */}
        <Card className="p-6 bg-white flex flex-col items-center">
          <h3 className="text-lg font-semibold mb-4" style={{ color: themeColors.text }}>扫描二维码加入</h3>
          {qrCodeUrl ? (
            <img src={qrCodeUrl} alt="邀请二维码" className="w-64 h-64 border-4 border-gray-200 rounded-lg" />
          ) : (
            <div className="w-64 h-64 bg-gray-100 rounded-lg flex items-center justify-center">
              <p className="text-gray-500">生成二维码中...</p>
            </div>
          )}
          <p className="text-sm text-gray-500 mt-4 text-center">
            使用脉动APP扫描二维码即可加入账本
          </p>
        </Card>

        {/* 邀请链接 */}
        <Card className="p-6 bg-white">
          <h3 className="text-lg font-semibold mb-4" style={{ color: themeColors.text }}>邀请链接</h3>
          <div className="bg-gray-50 p-3 rounded-lg mb-4 break-all text-sm text-gray-700">
            {inviteLink || "生成链接中..."}
          </div>
          <div className="flex gap-3">
            <Button
              onClick={handleCopyLink}
              className="flex-1"
              style={{ backgroundColor: `${themeColors.primary}30`, color: themeColors.text }}
              disabled={!inviteLink}
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 mr-2" />
                  已复制
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 mr-2" />
                  复制链接
                </>
              )}
            </Button>
            <Button
              onClick={handleShareToWechat}
              className="flex-1 text-white hover:opacity-90"
              style={{ backgroundColor: themeColors.primary }}
              disabled={!inviteLink}
            >
              <Share2 className="w-4 h-4 mr-2" />
              分享到微信
            </Button>
          </div>
        </Card>

        {/* 提示信息 */}
        <Card className="p-6 bg-white">
          <h3 className="text-lg font-semibold mb-3" style={{ color: themeColors.text }}>温馨提示</h3>
          <ul className="space-y-2 text-sm text-gray-600">
            <li className="flex items-start">
              <span className="mr-2" style={{ color: themeColors.primary }}>•</span>
              <span>被邀请人必须先注册脉动账号才能加入账本</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2" style={{ color: themeColors.primary }}>•</span>
              <span>邀请链接和二维码长期有效，可重复使用</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2" style={{ color: themeColors.primary }}>•</span>
              <span>账本创建人可以在设置页面管理成员</span>
            </li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
