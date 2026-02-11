import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useColorTheme } from "@/contexts/ColorThemeContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Crown, Notebook, ChevronLeft, Search, UserPlus } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { UserAvatar } from "@/components/UserAvatar";
import { toast } from "sonner";


// 模拟账本数据
const mockLedgers = [
  {
    id: 1,
    name: "家庭记账",
    isVip: true,
    members: [
      { id: 1, avatar: "" },
      { id: 2, avatar: "" },
      { id: 3, avatar: "" },
    ],
    memberCount: 3,
  },
  {
    id: 2,
    name: "生意账本",
    isVip: true,
    members: [
      { id: 1, avatar: "" },
      { id: 2, avatar: "" },
    ],
    memberCount: 2,
  },
  {
    id: 3,
    name: "澳门润仪投资有限公司",
    isVip: true,
    members: [
      { id: 1, avatar: "" },
      { id: 2, avatar: "" },
      { id: 3, avatar: "" },
      { id: 4, avatar: "" },
    ],
    memberCount: 4,
  },
  {
    id: 4,
    name: "上海润豆仪豆贸易有限公司",
    isVip: true,
    members: [
      { id: 1, avatar: "" },
      { id: 2, avatar: "" },
      { id: 3, avatar: "" },
      { id: 4, avatar: "" },
    ],
    memberCount: 4,
  },
];

export default function Ledger() {
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<"active" | "archived">("active");
  
  // 获取全局主题色
  const { currentTheme, customColors } = useColorTheme();
  const themeColors = customColors || currentTheme.colors;
  
  // 移除滑动手势，只保留左上角返回按钮
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);
  const [archivingLedgerId, setArchivingLedgerId] = useState<number | null>(null);
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [invitingLedgerId, setInvitingLedgerId] = useState<number | null>(null);
  const [searchUsername, setSearchUsername] = useState("");
  const [showDestroyDialog, setShowDestroyDialog] = useState(false);
  const [destroyingLedgerId, setDestroyingLedgerId] = useState<number | null>(null);


  // 获取当前用户信息
  const { data: user } = trpc.auth.me.useQuery();
  
  // 从后端API获取账本列表
  const { data: ledgers, isLoading, refetch } = trpc.ledger.list.useQuery({
    isArchived: activeTab === "archived",
  });
  
  // 分别查询使用中和已存档的数量
  const { data: activeLedgers } = trpc.ledger.list.useQuery({ isArchived: false });
  const { data: archivedLedgers } = trpc.ledger.list.useQuery({ isArchived: true });

  const filteredLedgers = ledgers || [];

  // 封存账本的mutation
  const archiveMutation = trpc.ledger.archive.useMutation({
    onSuccess: () => {
      toast.success('账本已封存');
      refetch();
      setShowArchiveDialog(false);
      setArchivingLedgerId(null);
    },
    onError: (error) => {
      toast.error(`封存失败: ${error.message}`);
    },
  });

  // 处理封存确认
  const handleArchiveConfirm = () => {
    if (archivingLedgerId) {
      archiveMutation.mutate({ ledgerId: archivingLedgerId, isArchived: true });
    }
  };

  // 搜索用户
  const { data: searchResults } = trpc.sharing.searchUsers.useQuery(
    { query: searchUsername },
    { enabled: searchUsername.length > 0 }
  );

  // 邀请成员的mutation
  const inviteMutation = trpc.ledger.inviteMember.useMutation({
    onSuccess: (data) => {
      toast.success(`已成功邀请 ${data.member.username} 加入账本`);
      setShowInviteDialog(false);
      setSearchUsername("");
      setInvitingLedgerId(null);
      refetch();
    },
    onError: (error) => {
      toast.error(`邀请失败: ${error.message}`);
    },
  });

  // 处理邀请用户
  const handleInviteUser = (username: string) => {
    if (invitingLedgerId) {
      inviteMutation.mutate({ ledgerId: invitingLedgerId, username });
    }
  };

  // 删除账本的mutation
  const deleteMutation = trpc.ledger.delete.useMutation({
    onSuccess: () => {
      toast.success('账本已销毁');
      refetch();
      setShowDestroyDialog(false);
      setDestroyingLedgerId(null);
    },
    onError: (error) => {
      toast.error(`销毁失败: ${error.message}`);
    },
  });

  // 处理销毁确认
  const handleDestroyConfirm = () => {
    if (destroyingLedgerId) {
      deleteMutation.mutate({ ledgerId: destroyingLedgerId });
    }
  };

  // 导出账本的处理函数
  const handleExport = async (ledgerId: number) => {
    const loadingToast = toast.loading("正在导出...");
    try {
      console.log('[handleExport] 开始导出:', ledgerId);
      
      // 检查用户是否登录
      if (!user) {
        throw new Error('未登录');
      }
      
      // 直接使用HTTP请求下载文件
      const response = await fetch(`/api/ledger/${ledgerId}/export`, {
        method: 'GET',
        headers: {
          'X-User-Id': user.id.toString(),
        },
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || '导出失败');
      }
      
      // 获取文件名
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = `账目导出_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')}.xlsx`;
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename[^;=\n]*=(['"]?)([^'"\n]*?)\1/);
        if (filenameMatch && filenameMatch[2]) {
          filename = decodeURIComponent(filenameMatch[2]);
        }
      }
      
      // 下载文件
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      toast.dismiss(loadingToast);
      toast.success("导出成功！");
    } catch (error: any) {
      console.error('[handleExport] 错误:', error);
      toast.dismiss(loadingToast);
      toast.error(`导出失败: ${error.message || '未知错误'}`);
    }
  };

  return (
    <div className="min-h-screen pb-20" style={{ backgroundColor: `${themeColors.primary}15` }}>
      {/* 顶部导航栏 */}
      <div className="bg-white shadow-sm">
        <div className="container py-3 px-4 flex items-center">
          <Link href="/">
            <button
              className="p-2 -ml-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ChevronLeft className="w-6 h-6 text-gray-800" />
            </button>
          </Link>
          <h1 className="flex-1 text-lg font-medium text-center text-gray-800 -ml-6">我的账本</h1>
        </div>
      </div>

      {/* 切换按钮 */}
      <div className="container px-4 py-4">
        <div className="flex gap-2 bg-white rounded-lg p-1 shadow-sm">
          <button
            onClick={() => setActiveTab("active")}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
              activeTab === "active"
                ? "text-white"
                : "text-gray-600 hover:bg-gray-100"
            }`}
            style={activeTab === "active" ? { backgroundColor: themeColors.primary } : {}}
          >
            使用中 {activeLedgers && `(${activeLedgers.length})`}
          </button>
          <button
            onClick={() => setActiveTab("archived")}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
              activeTab === "archived"
                ? "text-white"
                : "text-gray-600 hover:bg-gray-100"
            }`}
            style={activeTab === "archived" ? { backgroundColor: themeColors.primary } : {}}
          >
            已封存 {archivedLedgers && `(${archivedLedgers.length})`}
          </button>
        </div>
      </div>

      {/* 账本列表 */}
      <div className="container px-4 pb-4 space-y-4">
        {isLoading ? (
          <Card className="p-8 text-center">
            <p className="text-gray-500">加载中...</p>
          </Card>
        ) : filteredLedgers.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-gray-500">暂无{activeTab === "active" ? "使用中" : "已封存"}的账本</p>
          </Card>
        ) : (
          filteredLedgers.map((ledger) => (
            <div
              key={ledger.id}
              className="relative cursor-pointer group"
              onClick={() => setLocation(`/ledger/${ledger.id}`)}
            >
              {/* 账本封面卡片 */}
              <div className="relative bg-gradient-to-br from-white via-gray-50 to-gray-100 rounded-xl shadow-lg hover:shadow-2xl transition-all duration-300 overflow-hidden border border-gray-200">
                {/* 封面内容 */}
                <div className="px-4 py-5">
                  {/* 账本标题区 */}
                  <div className="mb-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5">
                          <Notebook className="w-6 h-6 flex-shrink-0" style={{ color: themeColors.primary }} strokeWidth={2.5} />
                          <h3 className="font-bold text-xl text-gray-900 truncate" style={{ 
                            textShadow: '0 1px 2px rgba(0,0,0,0.05)' 
                          }}>{ledger.name}</h3>
                          {ledger.isVip === true && (
                            <Badge variant="secondary" className="bg-gradient-to-r from-amber-400 to-amber-500 text-white text-xs px-2 py-0.5 flex-shrink-0 shadow-sm">
                              <Crown className="w-3 h-3 mr-0.5" />
                              VIP
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-sm text-gray-500 font-medium">
                          <span className="flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                            开账 {Math.floor((Date.now() - new Date(ledger.createdAt).getTime()) / (1000 * 60 * 60 * 24))}天
                          </span>
                          <span className="text-gray-300">|</span>
                          <span className="flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: themeColors.primary }}></span>
                            {ledger.recordCount || 0}条账目
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 成员信息区 */}
                  <div className="flex items-center gap-3 mb-4 pb-4 border-b border-gray-200">
                    <div className="flex -space-x-3">
                      {ledger.members.slice(0, 4).map((member, index) => (
                        <div key={member.userId} className="ring-2 ring-white rounded-full" style={{ zIndex: ledger.members.length - index }}>
                          <UserAvatar
                            username={member.username}
                            avatar={member.avatar}
                            nickname={member.nickname}
                            size="sm"
                          />
                        </div>
                      ))}
                    </div>
                    <span className="text-sm font-semibold" style={{ color: themeColors.primary }}>
                      {ledger.memberCount}人共享
                    </span>
                  </div>

                  {/* 操作按钮区 - 3列2行 */}
                  <div className="grid grid-cols-3 gap-2">
                    {activeTab === "active" && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs h-9 bg-white/80 backdrop-blur-sm border-gray-300 hover:bg-white hover:border-gray-400 transition-all shadow-sm font-medium"
                          onClick={(e) => {
                            e.stopPropagation();
                            setLocation(`/ledger/${ledger.id}/filter`);
                          }}
                        >
                          搜索
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs h-9 bg-white/80 backdrop-blur-sm border-gray-300 hover:bg-white hover:border-gray-400 transition-all shadow-sm font-medium"
                          onClick={(e) => {
                            e.stopPropagation();
                            setInvitingLedgerId(ledger.id);
                            setShowInviteDialog(true);
                          }}
                        >
                          共享
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs h-9 bg-white/80 backdrop-blur-sm border-gray-300 hover:bg-white hover:border-gray-400 transition-all shadow-sm font-medium"
                          onClick={(e) => {
                            e.stopPropagation();
                            setLocation(`/ledger/${ledger.id}/report`);
                          }}
                        >
                          报表
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs h-9 bg-white/80 backdrop-blur-sm border-gray-300 hover:bg-white hover:border-gray-400 transition-all shadow-sm font-medium"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleExport(ledger.id);
                          }}
                        >
                          导出
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs h-9 bg-white/80 backdrop-blur-sm border-gray-300 hover:bg-white hover:border-gray-400 transition-all shadow-sm font-medium"
                          onClick={(e) => {
                            e.stopPropagation();
                            setLocation(`/ledger/${ledger.id}/settings`);
                          }}
                        >
                          设置
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs h-9 bg-red-50/80 backdrop-blur-sm border-red-300 text-red-600 hover:bg-red-100 hover:border-red-400 transition-all shadow-sm font-medium"
                          onClick={(e) => {
                            e.stopPropagation();
                            setArchivingLedgerId(ledger.id);
                            setShowArchiveDialog(true);
                          }}
                        >
                          封存
                        </Button>
                      </>
                    )}
                    {activeTab === "archived" && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs h-9 bg-white/80 backdrop-blur-sm border-gray-300 hover:bg-white hover:border-gray-400 transition-all shadow-sm font-medium col-span-2"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleExport(ledger.id);
                          }}
                        >
                          导出
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs h-9 bg-red-50/80 backdrop-blur-sm border-red-300 text-red-600 hover:bg-red-100 hover:border-red-400 transition-all shadow-sm font-medium"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDestroyingLedgerId(ledger.id);
                            setShowDestroyDialog(true);
                          }}
                        >
                          销毁
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 底部按钮 */}
      <div className="fixed bottom-0 left-0 right-0 px-4 pb-4 bg-white pt-4 z-50">
        <div className="container flex gap-3">
          <Button
            variant="outline"
            className="flex-1 border-0 shadow-lg"
            style={{ 
              backgroundColor: `${themeColors.primary}20`, 
              color: themeColors.text 
            }}
            onClick={() => {
              // TODO: 加入他人账本
            }}
          >
            加入他人账本
          </Button>
          <Button
            className="flex-1 text-white shadow-lg hover:opacity-90"
            style={{ backgroundColor: themeColors.primary }}
            onClick={() => setShowCreateDialog(true)}
          >
            创建新的账本
          </Button>
        </div>
      </div>



      {/* 创建账本对话框 */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="w-[85%] rounded-lg p-0 gap-0" showCloseButton={false}>
          <DialogTitle className="sr-only">创建账本</DialogTitle>
          <button
            onClick={() => {
              setShowCreateDialog(false);
              setLocation("/ledger/create-type");
            }}
            className="w-full text-center py-3.5 text-blue-500 font-medium border-b border-gray-200 hover:bg-gray-50 transition-colors"
          >
            新建全新账本
          </button>
          <button
            onClick={() => {
              setShowCreateDialog(false);
              // TODO: 实现复制已有账本功能
            }}
            className="w-full text-center py-3.5 text-blue-500 font-medium border-b border-gray-200 hover:bg-gray-50 transition-colors"
          >
            复制已有账本
          </button>
          <button
            onClick={() => setShowCreateDialog(false)}
            className="w-full text-center py-3.5 text-gray-600 font-medium hover:bg-gray-50 transition-colors"
          >
            取消
          </button>
        </DialogContent>
      </Dialog>

      {/* 封存确认对话框 */}
      <Dialog open={showArchiveDialog} onOpenChange={setShowArchiveDialog}>
        <DialogContent className="w-[85%] rounded-lg p-0 gap-0" showCloseButton={false}>
          <DialogTitle className="sr-only">封存账本</DialogTitle>
          <div className="p-6 text-center">
            <div className="text-2xl mb-4">⚠️</div>
            <p className="text-gray-800 mb-2 font-medium">一旦封存将不可以再修改</p>
            <p className="text-sm text-gray-500">封存后的账本只能查看和导出，无法继续编辑</p>
          </div>
          <button
            onClick={handleArchiveConfirm}
            disabled={archiveMutation.isPending}
            className="w-full text-center py-3.5 text-red-500 font-medium border-t border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            {archiveMutation.isPending ? '封存中...' : '确认封存'}
          </button>
          <button
            onClick={() => {
              setShowArchiveDialog(false);
              setArchivingLedgerId(null);
            }}
            disabled={archiveMutation.isPending}
            className="w-full text-center py-3.5 text-gray-600 font-medium border-t border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            取消
          </button>
        </DialogContent>
      </Dialog>

      {/* 邀请成员对话框 */}
      <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
        <DialogContent className="w-[90%] max-w-md rounded-lg" showCloseButton={false}>
          <DialogTitle className="text-lg font-semibold mb-4">邀请成员</DialogTitle>
          <div className="space-y-4">
            {/* 搜索输入框 */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                type="text"
                placeholder="输入用户名搜索..."
                value={searchUsername}
                onChange={(e) => setSearchUsername(e.target.value)}
                className="pl-10 pr-4"
              />
            </div>

            {/* 搜索结果 */}
            <div className="max-h-[300px] overflow-y-auto space-y-2">
              {searchUsername.length === 0 ? (
                <div className="text-center py-8 text-gray-500 text-sm">
                  请输入用户名进行搜索
                </div>
              ) : searchResults && searchResults.length > 0 ? (
                searchResults.map((user: any) => (
                  <div
                    key={user.id}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <UserAvatar
                        username={user.username}
                        avatar={user.avatar}
                        size="sm"
                      />
                      <div>
                        <p className="font-medium text-gray-800">{user.name || user.username}</p>
                        <p className="text-sm text-gray-500">@{user.username}</p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handleInviteUser(user.username)}
                      disabled={inviteMutation.isPending}
                      className="text-white hover:opacity-90"
                      style={{ backgroundColor: themeColors.primary }}
                    >
                      <UserPlus className="w-4 h-4 mr-1" />
                      添加
                    </Button>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-gray-500 text-sm">
                  未找到用户
                </div>
              )}
            </div>

            {/* 关闭按钮 */}
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setShowInviteDialog(false);
                setSearchUsername("");
                setInvitingLedgerId(null);
              }}
            >
              关闭
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 销毁确认对话框 */}
      <Dialog open={showDestroyDialog} onOpenChange={setShowDestroyDialog}>
        <DialogContent className="w-[85%] rounded-lg p-0 gap-0" showCloseButton={false}>
          <DialogTitle className="sr-only">销毁账本</DialogTitle>
          <div className="p-6 text-center">
            <div className="text-2xl mb-4">⚠️</div>
            <p className="text-gray-800 mb-2 font-medium">一旦销毁将永远消失</p>
            <p className="text-sm text-gray-500">销毁后无法恢复，请谨慎操作</p>
          </div>
          <button
            onClick={handleDestroyConfirm}
            disabled={deleteMutation.isPending}
            className="w-full text-center py-3.5 text-red-500 font-medium border-t border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            {deleteMutation.isPending ? '销毁中...' : '确认销毁'}
          </button>
          <button
            onClick={() => {
              setShowDestroyDialog(false);
              setDestroyingLedgerId(null);
            }}
            className="w-full text-center py-3.5 text-gray-600 font-medium border-t border-gray-200 hover:bg-gray-50 transition-colors"
          >
            取消
          </button>
        </DialogContent>
      </Dialog>

    </div>
  );
}
