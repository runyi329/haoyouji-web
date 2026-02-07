import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  ArrowLeft, 
  Copy, 
  Share2, 
  QrCode,
  Users,
  Download,
  ScanLine
} from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

export default function InviteCode() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [showScanner, setShowScanner] = useState(false);

  // 获取邀请信息
  const { data: inviteInfo, isLoading } = trpc.invite.getMyInviteInfo.useQuery();

  // 自动生成二维码
  const { data: qrCodeData } = trpc.invite.generateQRCode.useQuery(
    { inviteCode: inviteInfo?.inviteCode || "" },
    { 
      enabled: !!inviteInfo?.inviteCode,
    }
  );

  // 获取邀请的用户列表
  const { data: invitedUsers } = trpc.invite.getMyInvitedUsers.useQuery();

  // 复制邀请码
  const copyInviteCode = () => {
    if (inviteInfo?.inviteCode) {
      navigator.clipboard.writeText(inviteInfo.inviteCode);
      toast.success("邀请码已复制");
    }
  };

  // 复制邀请链接
  const copyInviteLink = () => {
    if (inviteInfo?.inviteLink) {
      navigator.clipboard.writeText(inviteInfo.inviteLink);
      toast.success("邀请链接已复制");
    }
  };

  // 分享邀请链接
  const shareInviteLink = async () => {
    if (!inviteInfo?.inviteLink) return;

    if (navigator.share) {
      try {
        await navigator.share({
          title: '邀请您加入',
          text: `使用我的邀请码 ${inviteInfo.inviteCode} 注册`,
          url: inviteInfo.inviteLink,
        });
        toast.success("分享成功");
      } catch (error) {
        // 用户取消分享
      }
    } else {
      // 不支持分享API,复制链接
      copyInviteLink();
    }
  };

  // 分享到微信(复制链接并提示)
  const shareToWechat = () => {
    if (inviteInfo?.inviteLink) {
      navigator.clipboard.writeText(inviteInfo.inviteLink);
      toast.success(
        "链接已复制!\n请打开微信粘贴分享给好友",
        { duration: 4000 }
      );
    }
  };

  // 复制完整邀请文案
  const copyFullInviteText = () => {
    if (!inviteInfo) return;
    
    const inviteText = `🎉 邀请您加入好友记\n\n我的专属邀请码: ${inviteInfo.inviteCode}\n\n点击链接注册: ${inviteInfo.inviteLink}\n\n使用邀请码注册,一起管理人脉关系!`;
    
    navigator.clipboard.writeText(inviteText);
    toast.success(
      "邀请文案已复制!\n可直接粘贴到微信、短信等",
      { duration: 4000 }
    );
  };

  // 下载二维码
  const downloadQRCode = () => {
    if (!qrCodeData?.qrCodeDataUrl) return;

    const link = document.createElement('a');
    link.href = qrCodeData.qrCodeDataUrl;
    link.download = `invite-${inviteInfo?.inviteCode}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("二维码已下载");
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
        <div className="text-gray-500">加载中...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 pb-20">
      {/* 顶部导航 */}
      <div className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white p-4 sticky top-0 z-50 shadow-lg">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/20"
            onClick={() => setLocation("/parent/profile")}
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-xl font-semibold flex-1">我的邀请</h1>
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/20"
            onClick={() => setShowScanner(true)}
          >
            <ScanLine className="w-5 h-5" />
          </Button>
        </div>
      </div>

      {/* 扫一扫对话框 */}
      {showScanner && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">扫描邀请二维码</h3>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowScanner(false)}
              >
                <span className="text-2xl">×</span>
              </Button>
            </div>
            <div className="text-center text-gray-500 py-8">
              <ScanLine className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p>扫一扫功能开发中...</p>
              <p className="text-sm mt-2">请使用微信扫一扫或相机扫码</p>
            </div>
          </div>
        </div>
      )}

      <div className="container max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* 邀请码卡片 */}
        <Card className="bg-gradient-to-br from-indigo-500 to-purple-600 text-white border-0">
          <CardContent className="p-6">
            <div className="text-center space-y-4">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-white/20 mb-2">
                <Share2 className="w-8 h-8" />
              </div>
              <div>
                <p className="text-sm opacity-90 mb-2">我的专属邀请码</p>
                <div className="text-4xl font-bold tracking-wider font-mono">
                  {inviteInfo?.inviteCode || "------"}
                </div>
              </div>
              <div className="flex gap-2 justify-center pt-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={copyInviteCode}
                  className="bg-white/20 hover:bg-white/30 text-white border-0"
                >
                  <Copy className="w-4 h-4 mr-2" />
                  复制邀请码
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 二维码显示 */}
        {qrCodeData?.qrCodeDataUrl && (
          <Card>
            <CardContent className="p-6">
              <div className="text-center space-y-4">
                <h3 className="font-semibold text-lg">专属邀请二维码</h3>
                <div className="flex justify-center">
                  <img 
                    src={qrCodeData.qrCodeDataUrl} 
                    alt="邀请二维码" 
                    className="w-64 h-64 border-4 border-gray-200 rounded-lg"
                  />
                </div>
                <p className="text-sm text-gray-500">
                  扫描二维码即可使用您的邀请码注册
                </p>
                <Button
                  variant="outline"
                  onClick={downloadQRCode}
                  className="w-full"
                >
                  <Download className="w-4 h-4 mr-2" />
                  下载二维码
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 邀请链接 */}
        <Card>
          <CardContent className="p-6">
            <h3 className="font-semibold text-lg mb-4">专属邀请链接</h3>
            <div className="space-y-3">
              <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg break-all text-sm font-mono">
                {inviteInfo?.inviteLink || "https://jiangyuchen.cn/register?invite=------"}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  onClick={copyInviteLink}
                  className="w-full"
                >
                  <Copy className="w-4 h-4 mr-2" />
                  复制链接
                </Button>
                <Button
                  variant="default"
                  onClick={shareToWechat}
                  className="w-full bg-green-600 hover:bg-green-700"
                >
                  <Share2 className="w-4 h-4 mr-2" />
                  分享微信
                </Button>
              </div>
              <Button
                variant="outline"
                onClick={copyFullInviteText}
                className="w-full border-indigo-200 hover:bg-indigo-50"
              >
                <Copy className="w-4 h-4 mr-2" />
                复制完整邀请文案
              </Button>
              <p className="text-xs text-gray-500 text-center pt-1">
                💡 提示: 点击“分享微信”后,打开微信粘贴发送给好友
              </p>
            </div>
          </CardContent>
        </Card>

        {/* 邀请统计 */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-lg">邀请统计</h3>
              <div className="flex items-center gap-2 text-indigo-600">
                <Users className="w-5 h-5" />
                <span className="text-2xl font-bold">{inviteInfo?.inviteCount || 0}</span>
              </div>
            </div>
            <p className="text-sm text-gray-500">
              您已成功邀请 {inviteInfo?.inviteCount || 0} 位用户
            </p>
          </CardContent>
        </Card>

        {/* 邀请的用户列表 */}
        {invitedUsers && invitedUsers.length > 0 && (
          <Card>
            <CardContent className="p-6">
              <h3 className="font-semibold text-lg mb-4">我邀请的用户</h3>
              <div className="space-y-3">
                {invitedUsers.map((invitedUser) => (
                  <div 
                    key={invitedUser.id}
                    className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
                  >
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white font-semibold">
                      {(invitedUser.name || invitedUser.username || "?").charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <div className="font-medium">
                        {invitedUser.name || invitedUser.username || "未命名"}
                      </div>
                      <div className="text-xs text-gray-500">
                        {invitedUser.invitedAt 
                          ? new Date(invitedUser.invitedAt).toLocaleDateString('zh-CN')
                          : new Date(invitedUser.createdAt).toLocaleDateString('zh-CN')
                        }
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* 使用说明 */}
        <Card>
          <CardContent className="p-6">
            <h3 className="font-semibold text-lg mb-4">如何分享</h3>
            <div className="space-y-4">
              {/* 微信分享步骤 */}
              <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
                <div className="flex items-center gap-2 mb-3">
                  <Share2 className="w-5 h-5 text-green-600" />
                  <h4 className="font-semibold text-green-700 dark:text-green-400">微信分享步骤</h4>
                </div>
                <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                  <div className="flex gap-2">
                    <span className="text-green-600 font-semibold">①</span>
                    <p>点击上方“<span className="font-semibold text-green-600">分享微信</span>”或“<span className="font-semibold text-indigo-600">复制完整邀请文案</span>”按钮</p>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-green-600 font-semibold">②</span>
                    <p>打开微信,选择好友或群聊</p>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-green-600 font-semibold">③</span>
                    <p>长按输入框,点击“粘贴”发送</p>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-green-600 font-semibold">④</span>
                    <p>好友点击链接注册即可!</p>
                  </div>
                </div>
              </div>

              {/* 其他分享方式 */}
              <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                <h4 className="font-semibold text-gray-700 dark:text-gray-300">其他分享方式</h4>
                <div className="flex gap-2">
                  <span className="text-indigo-600">•</span>
                  <p><span className="font-semibold">二维码:</span> 生成并下载二维码,发送给好友扫码注册</p>
                </div>
                <div className="flex gap-2">
                  <span className="text-indigo-600">•</span>
                  <p><span className="font-semibold">邀请码:</span> 直接告诉好友您的6位邀请码</p>
                </div>
                <div className="flex gap-2">
                  <span className="text-indigo-600">•</span>
                  <p><span className="font-semibold">短信/邮件:</span> 复制完整文案发送</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
