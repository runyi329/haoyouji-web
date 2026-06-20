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
  ChevronRight
} from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

export default function InviteCode() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();


  // 获取邀请信息
  const { data: inviteInfo, isLoading } = trpc.invite.getMyInviteInfo.useQuery();

  // 自动生成二维码
  const { data: qrCodeData } = trpc.invite.generateQRCode.useQuery(
    { inviteCode: inviteInfo?.inviteCode || "" },
    { 
      enabled: !!inviteInfo?.inviteCode,
    }
  );



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
    
    const inviteText = `🎉 邀请您加入脉动网\n\n我的专属邀请码: ${inviteInfo.inviteCode}\n\n点击链接注册: ${inviteInfo.inviteLink}\n\n使用邀请码注册,一起管理人脉关系!`;
    
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
    <div className="max-w-md mx-auto shadow-2xl bg-gray-50 min-h-screen">
      {/* 顶部导航 */}
      <div className="bg-gradient-to-r from-[#A80000] to-[#d44] text-white p-4 sticky top-0 z-50 shadow-lg rounded-t-2xl">
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
        </div>
      </div>



      <div className="px-4 py-4 space-y-3">
        {/* 邀请统计卡片 */}
        <Card className="bg-white rounded-2xl shadow-sm border-0">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-[#FFEBEE]">
                  <Users className="w-5 h-5 text-[#D32F2F]" />
                </div>
                <div>
                  <p className="text-xs text-gray-600 dark:text-gray-400">已邀请好友</p>
                  <p className="text-2xl font-bold text-[#D32F2F]">
                    {inviteInfo?.inviteCount || 0}<span className="text-sm font-normal ml-1">人</span>
                  </p>
                </div>
              </div>
              {/* 箭头按钮 */}
              {(inviteInfo?.inviteCount || 0) > 0 && (
                <button
                  onClick={() => setLocation("/invited-friends")}
                  className="p-2 hover:bg-[#FFEBEE] rounded-full transition-colors"
                >
                  <ChevronRight className="w-5 h-5 text-[#D32F2F]" />
                </button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* 邀请码卡片 */}
        <Card className="bg-gradient-to-r from-[#A80000] to-[#d44] text-white border-0 rounded-2xl shadow-sm">
          <CardContent className="p-4">
            <div className="text-center space-y-2">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-white/20">
                <Share2 className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs opacity-90">我的专属邀请码</p>
                <div className="text-3xl font-bold tracking-wider font-mono">
                  {inviteInfo?.inviteCode || "------"}
                </div>
              </div>
              <div className="flex gap-2 justify-center pt-1">
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
          <Card className="bg-white rounded-2xl shadow-sm border-0">
            <CardContent className="p-4">
              <div className="text-center space-y-2">
                <h3 className="font-semibold text-base">专属邀请二维码</h3>
                <div className="flex justify-center">
                  <img 
                    src={qrCodeData.qrCodeDataUrl} 
                    alt="邀请二维码" 
                    className="w-48 h-48 border-2 border-gray-200 rounded-lg"
                  />
                </div>
                <p className="text-xs text-gray-500">
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
        <Card className="bg-white rounded-2xl shadow-sm border-0">
          <CardContent className="p-6">
            <h3 className="font-semibold text-lg mb-4">专属邀请链接</h3>
            <div className="space-y-3">
              <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg break-all text-sm font-mono">
                {inviteInfo?.inviteLink || "https://jiangyuchen.cn/login?invite=------"}
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
                  className="w-full bg-[#4CAF50] hover:bg-green-700"
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


      </div>
    </div>
  );
}
