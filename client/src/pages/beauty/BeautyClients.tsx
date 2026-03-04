/**
 * 奢贝美容院 - 我的客户
 * 显示邀请的客户列表，可加减积分，优惠券功能预留
 * 路径: /beauty/clients
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  ArrowLeft, Plus, Minus, History, Gift, Search, Star, Share2, Copy, Download
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import BottomNav from "@/components/BottomNav";

export default function BeautyClients() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");

  // 积分操作弹窗状态
  const [adjustDialog, setAdjustDialog] = useState(false);
  const [adjustType, setAdjustType] = useState<"add" | "subtract">("add");
  const [adjustUserId, setAdjustUserId] = useState<number | null>(null);
  const [adjustUserName, setAdjustUserName] = useState("");
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustRemark, setAdjustRemark] = useState("");

  // 日志弹窗状态
  const [logDialog, setLogDialog] = useState(false);
  const [logUserId, setLogUserId] = useState<number | null>(null);
  const [logUserName, setLogUserName] = useState("");

  // 查询
  const clientsQuery = trpc.beauty.points.getMyClients.useQuery();
  const logQuery = trpc.beauty.points.getPointsLog.useQuery(
    { userId: logUserId! },
    { enabled: logDialog && !!logUserId }
  );
  const adjustMutation = trpc.beauty.points.adjustPoints.useMutation({
    onSuccess: (data) => {
      toast.success(`积分${adjustType === "add" ? "增加" : "扣减"}成功，当前余额: ${data.newBalance}`);
      setAdjustDialog(false);
      setAdjustAmount("");
      setAdjustRemark("");
      clientsQuery.refetch();
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  // 分享弹窗状态
  const [shareDialog, setShareDialog] = useState(false);

  // 邀请信息查询
  const inviteInfoQuery = trpc.invite.getMyInviteInfo.useQuery(undefined, {
    enabled: shareDialog,
  });
  const qrCodeQuery = trpc.invite.generateQRCode.useQuery(
    { inviteCode: inviteInfoQuery.data?.inviteCode || "" },
    { enabled: shareDialog && !!inviteInfoQuery.data?.inviteCode }
  );

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text).then(() => {
      toast.success(`${label}已复制`);
    }).catch(() => {
      toast.error("复制失败");
    });
  }

  function downloadQRCode() {
    if (!qrCodeQuery.data?.qrCodeDataUrl) return;
    const link = document.createElement('a');
    link.href = qrCodeQuery.data.qrCodeDataUrl;
    link.download = `invite-${inviteInfoQuery.data?.inviteCode}.png`;
    link.click();
  }

  const clients = clientsQuery.data ?? [];
  const filteredClients = searchTerm
    ? clients.filter((c) =>
        (c.name || c.username || "").toLowerCase().includes(searchTerm.toLowerCase())
      )
    : clients;

  function openAdjust(userId: number, userName: string, type: "add" | "subtract") {
    setAdjustUserId(userId);
    setAdjustUserName(userName);
    setAdjustType(type);
    setAdjustAmount("");
    setAdjustRemark("");
    setAdjustDialog(true);
  }

  function handleAdjustSubmit() {
    if (!adjustUserId || !adjustAmount) return;
    const num = parseInt(adjustAmount);
    if (isNaN(num) || num <= 0) {
      toast.error("请输入有效的正整数");
      return;
    }
    adjustMutation.mutate({
      userId: adjustUserId,
      amount: adjustType === "add" ? num : -num,
      remark: adjustRemark || undefined,
    });
  }

  function openLog(userId: number, userName: string) {
    setLogUserId(userId);
    setLogUserName(userName);
    setLogDialog(true);
  }

  const logs = logQuery.data ?? [];

  return (
    <div className="min-h-screen bg-gray-50 pb-28">
      {/* 顶部 */}
      <div className="bg-gradient-to-r from-rose-500 to-red-400 text-white px-5 pt-12 pb-6">
        <button
          onClick={() => setLocation('/beauty/profile')}
          className="flex items-center gap-1 text-white/80 text-sm mb-4 active:text-white"
        >
          <ArrowLeft className="w-4 h-4" />
          返回个人中心
        </button>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">我的客户</h1>
            <p className="text-white/60 text-xs mt-1">管理客户积分与优惠券</p>
          </div>
          <button
            onClick={() => setShareDialog(true)}
            className="flex items-center gap-1.5 bg-white/20 backdrop-blur-sm rounded-full px-4 py-2 text-white text-xs font-medium active:bg-white/30 transition-colors"
          >
            <Share2 className="w-3.5 h-3.5" />
            分享邀请
          </button>
        </div>
      </div>

      {/* 搜索栏 */}
      <div className="px-4 -mt-3">
        <div className="bg-white rounded-2xl shadow-sm flex items-center gap-2 px-4 py-3">
          <Search className="w-4 h-4 text-gray-300 flex-shrink-0" />
          <input
            type="text"
            placeholder="搜索客户姓名..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 text-sm outline-none bg-transparent text-gray-700 placeholder:text-gray-300"
          />
        </div>
      </div>

      {/* 客户列表 */}
      <div className="px-4 mt-4 space-y-3">
        {clientsQuery.isLoading ? (
          <div className="text-center text-gray-400 py-12 text-sm">加载中...</div>
        ) : filteredClients.length === 0 ? (
          <div className="text-center text-gray-400 py-12 text-sm">
            {searchTerm ? "未找到匹配的客户" : "暂无客户"}
          </div>
        ) : (
          filteredClients.map((client) => (
            <div key={client.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
              {/* 客户信息行 */}
              <div className="px-4 py-4 flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-rose-50 overflow-hidden flex items-center justify-center flex-shrink-0">
                  {client.avatar ? (
                    <img src={client.avatar} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-rose-400 font-bold text-sm">
                      {(client.name || client.username || "?").charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">
                    {client.name || client.username || `用户${client.id}`}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    加入时间: {client.invitedAt ? new Date(client.invitedAt).toLocaleDateString('zh-CN') : '-'}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-lg font-bold text-amber-500">{client.pointsBalance}</p>
                  <p className="text-[10px] text-gray-400">积分</p>
                </div>
              </div>

              {/* 操作按钮行 */}
              <div className="border-t border-gray-50 px-4 py-2.5 flex items-center gap-2">
                <button
                  onClick={() => openAdjust(client.id, client.name || client.username || `用户${client.id}`, "add")}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-rose-50 text-rose-500 text-xs font-medium active:bg-rose-100 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  加积分
                </button>
                <button
                  onClick={() => openAdjust(client.id, client.name || client.username || `用户${client.id}`, "subtract")}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-gray-50 text-gray-500 text-xs font-medium active:bg-gray-100 transition-colors"
                >
                  <Minus className="w-3.5 h-3.5" />
                  减积分
                </button>
                <button
                  onClick={() => openLog(client.id, client.name || client.username || `用户${client.id}`)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-gray-50 text-gray-500 text-xs font-medium active:bg-gray-100 transition-colors"
                >
                  <History className="w-3.5 h-3.5" />
                  记录
                </button>
                <button
                  onClick={() => toast.info("优惠券功能即将上线")}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-amber-50 text-amber-500 text-xs font-medium active:bg-amber-100 transition-colors"
                >
                  <Gift className="w-3.5 h-3.5" />
                  优惠券
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 积分加减弹窗 */}
      <Dialog open={adjustDialog} onOpenChange={setAdjustDialog}>
        <DialogContent className="max-w-sm mx-auto">
          <DialogHeader>
            <DialogTitle className="text-base">
              {adjustType === "add" ? "增加积分" : "扣减积分"} - {adjustUserName}
            </DialogTitle>
            <DialogDescription className="text-xs text-gray-400">
              {adjustType === "add" ? "为客户增加奢贝积分" : "扣减客户的奢贝积分"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-sm">积分数量</Label>
              <Input
                type="number"
                min="1"
                placeholder="请输入积分数量"
                value={adjustAmount}
                onChange={(e) => setAdjustAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm">备注（选填）</Label>
              <Input
                placeholder="如：消费赠送、活动奖励等"
                value={adjustRemark}
                onChange={(e) => setAdjustRemark(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustDialog(false)} className="flex-1">
              取消
            </Button>
            <Button
              onClick={handleAdjustSubmit}
              disabled={adjustMutation.isPending || !adjustAmount}
              className={`flex-1 ${adjustType === "add" ? "bg-rose-500 hover:bg-rose-600" : "bg-gray-600 hover:bg-gray-700"}`}
            >
              {adjustMutation.isPending ? "处理中..." : "确认"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 积分日志弹窗 */}
      <Dialog open={logDialog} onOpenChange={setLogDialog}>
        <DialogContent className="max-w-sm mx-auto max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">积分记录 - {logUserName}</DialogTitle>
            <DialogDescription className="text-xs text-gray-400">
              查看该客户的积分变动历史
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            {logQuery.isLoading ? (
              <p className="text-center text-gray-400 text-sm py-6">加载中...</p>
            ) : logs.length === 0 ? (
              <p className="text-center text-gray-400 text-sm py-6">暂无积分记录</p>
            ) : (
              logs.map((log) => (
                <div key={log.id} className="flex items-center justify-between py-3 border-b border-gray-50 last:border-0">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-bold ${log.amount > 0 ? "text-rose-500" : "text-gray-500"}`}>
                        {log.amount > 0 ? `+${log.amount}` : log.amount}
                      </span>
                      <Star className="w-3 h-3 text-amber-400" />
                    </div>
                    {log.remark && (
                      <p className="text-xs text-gray-400 mt-0.5 truncate">{log.remark}</p>
                    )}
                    <p className="text-[10px] text-gray-300 mt-0.5">
                      {new Date(log.createdAt).toLocaleString('zh-CN')}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs text-gray-400">余额</p>
                    <p className="text-sm font-medium text-gray-700">{log.balanceAfter}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* 分享邀请弹窗 */}
      <Dialog open={shareDialog} onOpenChange={setShareDialog}>
        <DialogContent className="max-w-sm mx-auto">
          <DialogHeader>
            <DialogTitle className="text-base">分享邀请</DialogTitle>
            <DialogDescription className="text-xs text-gray-400">
              通过以下方式邀请新客户加入
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5 py-2">
            {/* 二维码 */}
            <div className="flex flex-col items-center">
              {qrCodeQuery.isLoading ? (
                <div className="w-40 h-40 bg-gray-100 rounded-xl flex items-center justify-center">
                  <p className="text-xs text-gray-400">加载中...</p>
                </div>
              ) : qrCodeQuery.data?.qrCodeDataUrl ? (
                <div className="relative">
                  <img
                    src={qrCodeQuery.data.qrCodeDataUrl}
                    alt="邀请二维码"
                    className="w-40 h-40 rounded-xl border border-gray-100"
                  />
                  <button
                    onClick={downloadQRCode}
                    className="absolute -bottom-2 -right-2 w-8 h-8 bg-rose-500 rounded-full flex items-center justify-center text-white shadow-md active:bg-rose-600"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="w-40 h-40 bg-gray-100 rounded-xl flex items-center justify-center">
                  <p className="text-xs text-gray-400">暂无二维码</p>
                </div>
              )}
              <p className="text-xs text-gray-400 mt-3">扫码注册加入</p>
            </div>

            {/* 邀请码 */}
            <div className="bg-gray-50 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-400">我的邀请码</p>
                  <p className="text-lg font-bold text-gray-800 mt-0.5 tracking-widest">
                    {inviteInfoQuery.data?.inviteCode || "------"}
                  </p>
                </div>
                <button
                  onClick={() => inviteInfoQuery.data?.inviteCode && copyToClipboard(inviteInfoQuery.data.inviteCode, "邀请码")}
                  className="flex items-center gap-1 bg-rose-500 text-white rounded-lg px-3 py-1.5 text-xs font-medium active:bg-rose-600"
                >
                  <Copy className="w-3 h-3" />
                  复制
                </button>
              </div>
            </div>

            {/* 邀请链接 */}
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-xs text-gray-400 mb-1.5">邀请链接</p>
              <div className="flex items-center gap-2">
                <p className="flex-1 text-xs text-gray-600 truncate">
                  {inviteInfoQuery.data?.inviteLink || "------"}
                </p>
                <button
                  onClick={() => inviteInfoQuery.data?.inviteLink && copyToClipboard(inviteInfoQuery.data.inviteLink, "邀请链接")}
                  className="flex items-center gap-1 bg-gray-200 text-gray-600 rounded-lg px-3 py-1.5 text-xs font-medium active:bg-gray-300 flex-shrink-0"
                >
                  <Copy className="w-3 h-3" />
                  复制
                </button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <BottomNav />
    </div>
  );
}
