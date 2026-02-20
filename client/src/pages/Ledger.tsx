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


export default function Ledger() {
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<"active" | "archived">("active");
  
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
    const loadingToast = toast.loading(
      <div className="flex items-center gap-2">
        <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-300 border-t-blue-500"></div>
        <span>正在生成Excel文件...</span>
      </div>
    );
    try {
      if (!user) {
        throw new Error('未登录');
      }
      
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
      
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = `账目导出_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')}.xlsx`;
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename[^;=\n]*=(['"]?)([^'"\n]*?)\1/);
        if (filenameMatch && filenameMatch[2]) {
          filename = decodeURIComponent(filenameMatch[2]);
        }
      }
      
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
      toast.success(
        <div className="flex flex-col gap-1">
          <div className="font-semibold">导出成功！</div>
          <div className="text-xs text-[#757575]">{filename}</div>
          <div className="text-xs text-gray-500">文件已保存到下载文件夹</div>
        </div>,
        { duration: 4000 }
      );
    } catch (error: any) {
      toast.dismiss(loadingToast);
      toast.error(`导出失败: ${error.message || '未知错误'}`);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF3ED] pb-24 max-w-md mx-auto relative shadow-2xl">
      {/* 顶部导航栏 */}
      <div className="bg-white shadow-sm sticky top-0 z-40">
        <div className="px-4 py-3 flex items-center">
          <Link href="/">
            <button className="p-2 -ml-2 hover:bg-gray-100 rounded-lg transition-colors">
              <ChevronLeft className="w-6 h-6 text-[#222222]" />
            </button>
          </Link>
          <h1 className="flex-1 text-lg font-medium text-center text-[#222222] -ml-6">我的账本</h1>
        </div>
      </div>

      {/* 切换按钮 */}
      <div className="px-4 py-3">
        <div className="flex gap-2 bg-white rounded-2xl p-1 shadow-sm">
          <button
            onClick={() => setActiveTab("active")}
            className={`flex-1 py-2 px-4 rounded-xl text-sm font-medium transition-colors ${
              activeTab === "active"
                ? "bg-[#D32F2F] text-white shadow-sm"
                : "text-[#757575] hover:bg-gray-100"
            }`}
          >
            使用中 {activeLedgers && `(${activeLedgers.length})`}
          </button>
          <button
            onClick={() => setActiveTab("archived")}
            className={`flex-1 py-2 px-4 rounded-xl text-sm font-medium transition-colors ${
              activeTab === "archived"
                ? "bg-[#D32F2F] text-white shadow-sm"
                : "text-[#757575] hover:bg-gray-100"
            }`}
          >
            已封存 {archivedLedgers && `(${archivedLedgers.length})`}
          </button>
        </div>
      </div>

      {/* 账本列表 */}
      <div className="px-4 pb-4 space-y-3">
        {isLoading ? (
          <div className="bg-white rounded-2xl p-8 shadow-sm text-center">
            <p className="text-gray-500">加载中...</p>
          </div>
        ) : filteredLedgers.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 shadow-sm text-center">
            <p className="text-gray-500">暂无{activeTab === "active" ? "使用中" : "已封存"}的账本</p>
          </div>
        ) : (
          filteredLedgers.map((ledger) => (
            <div
              key={ledger.id}
              className="cursor-pointer"
              onClick={() => setLocation(`/ledger/${ledger.id}`)}
            >
              <div className="bg-white rounded-2xl shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                <div className="px-4 py-4">
                  {/* 账本标题区 */}
                  <div className="mb-3">
                    <div className="flex items-center gap-2 mb-1.5">
                      <Notebook className="w-5 h-5 flex-shrink-0 text-[#D32F2F]" strokeWidth={2.5} />
                      <h3 className="font-bold text-lg text-[#222222] truncate">{ledger.name}</h3>
                      {ledger.isVip === true && (
                        <Badge variant="secondary" className="bg-gradient-to-r from-amber-400 to-amber-500 text-white text-xs px-1.5 py-0.5 flex-shrink-0 shadow-sm">
                          VIP
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-sm text-gray-400 font-medium">
                      <span className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                        开账 {Math.floor((Date.now() - new Date(ledger.createdAt).getTime()) / (1000 * 60 * 60 * 24))}天
                      </span>
                      <span className="text-gray-300">|</span>
                      <span className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#D32F2F]"></span>
                        {ledger.recordCount || 0}条账目
                      </span>
                    </div>
                  </div>

                  {/* 成员信息区 */}
                  <div className="flex items-center gap-3 mb-3 pb-3 border-b border-gray-100">
                    <div className="flex -space-x-2">
                      {(ledger.members || []).slice(0, 4).map((member, index) => (
                        <div key={member.userId} className="ring-2 ring-white rounded-full" style={{ zIndex: (ledger.members || []).length - index }}>
                          <UserAvatar
                            username={member.username}
                            avatar={member.avatar}
                            nickname={member.nickname}
                            size="sm"
                          />
                        </div>
                      ))}
                    </div>
                    <span className="text-sm font-semibold text-[#D32F2F]">
                      {ledger.memberCount}人共享
                    </span>
                  </div>

                  {/* 操作按钮区 */}
                  <div className="grid grid-cols-3 gap-2">
                    {activeTab === "active" && (
                      <>
                        <button
                          className="text-xs h-8 rounded-xl bg-[#FAF3ED] text-[#757575] font-medium hover:bg-gray-100 transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            setLocation(`/ledger/${ledger.id}/filter`);
                          }}
                        >
                          搜索
                        </button>
                        <button
                          className="text-xs h-8 rounded-xl bg-[#FAF3ED] text-[#757575] font-medium hover:bg-gray-100 transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            setInvitingLedgerId(ledger.id);
                            setShowInviteDialog(true);
                          }}
                        >
                          共享
                        </button>
                        <button
                          className="text-xs h-8 rounded-xl bg-[#FAF3ED] text-[#757575] font-medium hover:bg-gray-100 transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            setLocation(`/ledger/${ledger.id}/report`);
                          }}
                        >
                          报表
                        </button>
                        <button
                          className="text-xs h-8 rounded-xl bg-[#FAF3ED] text-[#757575] font-medium hover:bg-gray-100 transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleExport(ledger.id);
                          }}
                        >
                          导出
                        </button>
                        <button
                          className="text-xs h-8 rounded-xl bg-[#FAF3ED] text-[#757575] font-medium hover:bg-gray-100 transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            setLocation(`/ledger/${ledger.id}/settings`);
                          }}
                        >
                          设置
                        </button>
                        <button
                          className="text-xs h-8 rounded-xl bg-[#D32F2F]-light text-red-500 font-medium hover:bg-red-100 transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            setArchivingLedgerId(ledger.id);
                            setShowArchiveDialog(true);
                          }}
                        >
                          封存
                        </button>
                      </>
                    )}
                    {activeTab === "archived" && (
                      <>
                        <button
                          className="text-xs h-8 rounded-xl bg-[#FAF3ED] text-[#757575] font-medium hover:bg-gray-100 transition-colors col-span-2"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleExport(ledger.id);
                          }}
                        >
                          导出
                        </button>
                        <button
                          className="text-xs h-8 rounded-xl bg-[#D32F2F]-light text-red-500 font-medium hover:bg-red-100 transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDestroyingLedgerId(ledger.id);
                            setShowDestroyDialog(true);
                          }}
                        >
                          销毁
                        </button>
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
      <div className="fixed bottom-0 left-0 right-0 z-50">
        <div className="max-w-md mx-auto px-4 pb-4 pt-3 bg-white border-t border-gray-100 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
          <div className="flex gap-3">
            <button
              className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-[#D32F2F]-light text-[#D32F2F] hover:bg-red-100 transition-colors shadow-sm"
              onClick={() => {
                // TODO: 加入他人账本
              }}
            >
              加入他人账本
            </button>
            <button
              className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-[#D32F2F] text-white hover:bg-[#D32F2F]-dark transition-colors shadow-sm"
              onClick={() => setShowCreateDialog(true)}
            >
              创建新的账本
            </button>
          </div>
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
            className="w-full text-center py-3.5 text-blue-500 font-medium border-b border-divider hover:bg-[#FAF3ED] transition-colors"
          >
            新建全新账本
          </button>
          <button
            onClick={() => {
              setShowCreateDialog(false);
              // TODO: 实现复制已有账本功能
            }}
            className="w-full text-center py-3.5 text-blue-500 font-medium border-b border-divider hover:bg-[#FAF3ED] transition-colors"
          >
            复制已有账本
          </button>
          <button
            onClick={() => setShowCreateDialog(false)}
            className="w-full text-center py-3.5 text-[#757575] font-medium hover:bg-[#FAF3ED] transition-colors"
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
            <p className="text-[#222222] mb-2 font-medium">一旦封存将不可以再修改</p>
            <p className="text-sm text-gray-500">封存后的账本只能查看和导出，无法继续编辑</p>
          </div>
          <button
            onClick={handleArchiveConfirm}
            disabled={archiveMutation.isPending}
            className="w-full text-center py-3.5 text-red-500 font-medium border-t border-divider hover:bg-[#FAF3ED] transition-colors disabled:opacity-50"
          >
            {archiveMutation.isPending ? '封存中...' : '确认封存'}
          </button>
          <button
            onClick={() => {
              setShowArchiveDialog(false);
              setArchivingLedgerId(null);
            }}
            disabled={archiveMutation.isPending}
            className="w-full text-center py-3.5 text-[#757575] font-medium border-t border-divider hover:bg-[#FAF3ED] transition-colors disabled:opacity-50"
          >
            取消
          </button>
        </DialogContent>
      </Dialog>

      {/* 邀请成员对话框 */}
      <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
        <DialogContent className="w-[90%] max-w-md rounded-lg !top-[30%]" showCloseButton={false}>
          <DialogTitle className="text-lg font-semibold mb-4">邀请成员</DialogTitle>
          <div className="space-y-4">
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

            <div className="max-h-[300px] overflow-y-auto space-y-2">
              {searchUsername.length === 0 ? (
                <div className="text-center py-8 text-gray-500 text-sm">
                  请输入用户名进行搜索
                </div>
              ) : searchResults && searchResults.length > 0 ? (
                searchResults.map((user: any) => (
                  <div
                    key={user.id}
                    className="flex items-center justify-between p-3 bg-[#FAF3ED] rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <UserAvatar
                        username={user.username}
                        avatar={user.avatar}
                        size="sm"
                      />
                      <div>
                        <p className="font-medium text-[#222222]">{user.name || user.username}</p>
                        <p className="text-sm text-gray-500">@{user.username}</p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handleInviteUser(user.username)}
                      disabled={inviteMutation.isPending}
                      className="text-white hover:opacity-90 bg-[#D32F2F]"
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
            <p className="text-[#222222] mb-2 font-medium">一旦销毁将永远消失</p>
            <p className="text-sm text-gray-500">销毁后无法恢复，请谨慎操作</p>
          </div>
          <button
            onClick={handleDestroyConfirm}
            disabled={deleteMutation.isPending}
            className="w-full text-center py-3.5 text-red-500 font-medium border-t border-divider hover:bg-[#FAF3ED] transition-colors disabled:opacity-50"
          >
            {deleteMutation.isPending ? '销毁中...' : '确认销毁'}
          </button>
          <button
            onClick={() => {
              setShowDestroyDialog(false);
              setDestroyingLedgerId(null);
            }}
            className="w-full text-center py-3.5 text-[#757575] font-medium border-t border-divider hover:bg-[#FAF3ED] transition-colors"
          >
            取消
          </button>
        </DialogContent>
      </Dialog>

    </div>
  );
}
