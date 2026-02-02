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
import { useSwipeGesture } from "@/hooks/useSwipeGesture";
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
  
  // 添加滑动手势支持
  useSwipeGesture({
    onSwipeRight: () => {
      // 向右滑动,切换到人脉页面
      setLocation('/contacts');
      toast.success('切换到人脉', { duration: 1000 });
    },
  });
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);
  const [archivingLedgerId, setArchivingLedgerId] = useState<number | null>(null);
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [invitingLedgerId, setInvitingLedgerId] = useState<number | null>(null);
  const [searchUsername, setSearchUsername] = useState("");
  const [showDestroyDialog, setShowDestroyDialog] = useState(false);
  const [destroyingLedgerId, setDestroyingLedgerId] = useState<number | null>(null);


  // 从后端API获取账本列表
  const { data: ledgers, isLoading, refetch } = trpc.ledger.list.useQuery({
    isArchived: activeTab === "archived",
  });
  
  // 分别查询使用中和已存档的数量
  const { data: activeLedgers } = trpc.ledger.list.useQuery({ isArchived: false });
  const { data: archivedLedgers } = trpc.ledger.list.useQuery({ isArchived: true });

  const filteredLedgers = ledgers || [];

  // 存档账本的mutation
  const archiveMutation = trpc.ledger.archive.useMutation({
    onSuccess: () => {
      toast.success('账本已存档');
      refetch();
      setShowArchiveDialog(false);
      setArchivingLedgerId(null);
    },
    onError: (error) => {
      toast.error(`存档失败: ${error.message}`);
    },
  });

  // 处理存档确认
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

  return (
    <div className="min-h-screen pb-20" style={{ backgroundColor: `${themeColors.primary}15` }}>
      {/* 顶部导航栏 */}
      <div className="bg-white shadow-sm">
        <div className="container py-3 px-4 flex items-center">
          <Link href="/contacts">
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
            已存档 {archivedLedgers && `(${archivedLedgers.length})`}
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
            <p className="text-gray-500">暂无{activeTab === "active" ? "使用中" : "已存档"}的账本</p>
          </Card>
        ) : (
          filteredLedgers.map((ledger) => (
            <Card
              key={ledger.id}
              className="p-2 h-[120px] cursor-pointer hover:shadow-md transition-shadow overflow-hidden"
              onClick={() => setLocation(`/ledger/${ledger.id}`)}
            >
              {/* 账本名称和VIP标识 */}
              <div className="flex items-center gap-2 -mb-3">
                <Notebook className="w-4 h-4 text-blue-500 mt-0.5" strokeWidth={1.5} />
                <div className="flex-1 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-base leading-none text-gray-800">{ledger.name}</h3>
                    {ledger.isVip === true && (
                      <Badge variant="secondary" className="bg-amber-100 text-amber-700 text-xs">
                        <Crown className="w-3 h-3 mr-1" />
                        VIP
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 mt-3 mr-2">
                    <div className="text-xs leading-none text-gray-400 whitespace-nowrap">
                      开账日期 {new Date(ledger.createdAt).toLocaleDateString('zh-CN').replace(/\//g, '-')} · 至今 {Math.floor((Date.now() - new Date(ledger.createdAt).getTime()) / (1000 * 60 * 60 * 24))}天
                    </div>
                    <div className="text-xs leading-none text-gray-400 whitespace-nowrap">
                      账目总数 × {ledger.recordCount || 0}条
                    </div>
                  </div>
                </div>
              </div>

              {/* 成员头像 */}
              <div className="flex items-center gap-2 -mb-3 -mt-2">
                <div className="flex -space-x-2">
                  {ledger.members.slice(0, 4).map((member, index) => (
                    <UserAvatar
                      key={member.userId}
                      username={member.username}
                      avatar={member.avatar}
                      nickname={member.nickname}
                      size="sm"
                      style={{ zIndex: ledger.members.length - index }}
                    />
                  ))}
                </div>
                <span className="text-sm leading-none text-gray-500">{ledger.memberCount}人共享+</span>
              </div>

              {/* 操作按钮 */}
              <div className="flex gap-1 -mt-2">
                {activeTab === "active" && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-sm leading-none px-2 py-1 h-8 flex-1"
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
                      className="text-sm leading-none px-2 py-1 h-8 flex-1"
                      onClick={async (e) => {
                        e.stopPropagation();
                        try {
                          const result = await trpc.ledger.exportToExcel.query({
                            ledgerId: ledger.id,
                          });
                          
                          // 将base64转换为Blob并下载
                          const byteCharacters = atob(result.data);
                          const byteNumbers = new Array(byteCharacters.length);
                          for (let i = 0; i < byteCharacters.length; i++) {
                            byteNumbers[i] = byteCharacters.charCodeAt(i);
                          }
                          const byteArray = new Uint8Array(byteNumbers);
                          const blob = new Blob([byteArray], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
                          
                          // 创建下载链接
                          const url = window.URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = result.filename;
                          document.body.appendChild(a);
                          a.click();
                          document.body.removeChild(a);
                          window.URL.revokeObjectURL(url);
                          
                          toast.success("导出成功！");
                        } catch (error: any) {
                          toast.error(`导出失败: ${error.message}`);
                        }
                      }}
                    >
                      导出
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-sm leading-none px-2 py-1 h-8 flex-1"
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
                      className="text-sm leading-none px-2 py-1 h-8 flex-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        setInvitingLedgerId(ledger.id);
                        setShowInviteDialog(true);
                      }}
                    >
                      邀请
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-sm leading-none px-2 py-1 h-8 flex-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        setArchivingLedgerId(ledger.id);
                        setShowArchiveDialog(true);
                      }}
                    >
                      存档
                    </Button>
                  </>
                )}
                {activeTab === "archived" && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-sm leading-none px-2 py-1 h-8 flex-1"
                      onClick={async (e) => {
                        e.stopPropagation();
                        try {
                          const result = await trpc.ledger.exportToExcel.query({
                            ledgerId: ledger.id,
                          });
                          
                          // 将base64转换为Blob并下载
                          const byteCharacters = atob(result.data);
                          const byteNumbers = new Array(byteCharacters.length);
                          for (let i = 0; i < byteCharacters.length; i++) {
                            byteNumbers[i] = byteCharacters.charCodeAt(i);
                          }
                          const byteArray = new Uint8Array(byteNumbers);
                          const blob = new Blob([byteArray], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
                          
                          // 创建下载链接
                          const url = window.URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = result.filename;
                          document.body.appendChild(a);
                          a.click();
                          document.body.removeChild(a);
                          window.URL.revokeObjectURL(url);
                          
                          toast.success("导出成功！");
                        } catch (error: any) {
                          toast.error(`导出失败: ${error.message}`);
                        }
                      }}
                    >
                      导出
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-sm leading-none px-2 py-1 h-8 flex-1 text-red-500 hover:bg-red-50"
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
            </Card>
          ))
        )}
      </div>

      {/* 底部按钮 */}
      <div className="fixed bottom-0 left-0 right-0 px-4 pb-4 bg-white pt-4">
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

      {/* 存档确认对话框 */}
      <Dialog open={showArchiveDialog} onOpenChange={setShowArchiveDialog}>
        <DialogContent className="w-[85%] rounded-lg p-0 gap-0" showCloseButton={false}>
          <DialogTitle className="sr-only">存档账本</DialogTitle>
          <div className="p-6 text-center">
            <div className="text-2xl mb-4">⚠️</div>
            <p className="text-gray-800 mb-2 font-medium">一旦存档将不可以再修改</p>
            <p className="text-sm text-gray-500">存档后的账本只能查看和导出，无法继续编辑</p>
          </div>
          <button
            onClick={handleArchiveConfirm}
            disabled={archiveMutation.isPending}
            className="w-full text-center py-3.5 text-red-500 font-medium border-t border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            {archiveMutation.isPending ? '存档中...' : '确认存档'}
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
            onClick={async () => {
              if (destroyingLedgerId) {
                try {
                  await trpc.ledger.delete.mutate({ ledgerId: destroyingLedgerId });
                  toast.success('账本已销毁');
                  refetch();
                  setShowDestroyDialog(false);
                  setDestroyingLedgerId(null);
                } catch (error: any) {
                  toast.error(`销毁失败: ${error.message}`);
                }
              }
            }}
            className="w-full text-center py-3.5 text-red-500 font-medium border-t border-gray-200 hover:bg-gray-50 transition-colors"
          >
            确认销毁
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
