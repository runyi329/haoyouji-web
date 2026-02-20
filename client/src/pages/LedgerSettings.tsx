import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { useColorTheme } from "@/contexts/ColorThemeContext";
import { Switch } from "@/components/ui/switch";
import { ChevronRight, ChevronLeft, X, Search, UserPlus } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { UserAvatar } from "@/components/UserAvatar";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function LedgerSettings() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const ledgerId = params?.id ? parseInt(params.id) : 1;

  // 获取全局主题色
  const { currentTheme, customColors } = useColorTheme();
  const themeColors = customColors || currentTheme.colors;

  // 获取账本详情
  const { data: ledgerData, isLoading } = trpc.ledger.getById.useQuery({
    ledgerId,
  });

  // 获取账本成员列表
  const { data: members } = trpc.ledger.getMembers.useQuery({ ledgerId });

  const [shareCategories, setShareCategories] = useState(true);
  const [requireImage, setRequireImage] = useState(false);
  const [showRemoveDialog, setShowRemoveDialog] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<any>(null);
  const [showRemovePicker, setShowRemovePicker] = useState(false);
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [searchUsername, setSearchUsername] = useState("");
  const [inviteMessage, setInviteMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);

  // 移除成员的mutation
  const utils = trpc.useUtils();
  const removeMemberMutation = trpc.ledger.removeMember.useMutation({
    onSuccess: () => {
      toast.success("成员已移除");
      utils.ledger.getMembers.invalidate({ ledgerId });
      setShowRemoveDialog(false);
      setMemberToRemove(null);
    },
    onError: (error) => {
      toast.error(error.message || "移除成员失败");
    },
  });

  // 处理移除成员
  const handleRemoveMember = () => {
    if (memberToRemove) {
      removeMemberMutation.mutate({
        ledgerId,
        userId: memberToRemove.userId,
      });
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
      setInviteMessage({ type: 'success', text: `已成功邀请 ${data.member.username} 加入账本` });
      setTimeout(() => {
        setShowInviteDialog(false);
        setSearchUsername("");
        setInviteMessage(null);
      }, 1500);
      utils.ledger.getMembers.invalidate({ ledgerId });
    },
    onError: (error) => {
      setInviteMessage({ type: 'error', text: `邀请失败: ${error.message}` });
      setTimeout(() => setInviteMessage(null), 3000);
    },
  });

  // 处理邀请用户
  const handleInviteUser = (username: string) => {
    inviteMutation.mutate({ ledgerId, username });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#FAF3ED] flex items-center justify-center">
        <div className="text-gray-500">加载中...</div>
      </div>
    );
  }

  if (!ledgerData) {
    return (
      <div className="min-h-screen bg-[#FAF3ED] flex items-center justify-center">
        <div className="text-gray-500">账本不存在</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF3ED] pb-20">
      {/* 顶部导航栏 */}
      <div className="bg-white border-b border-divider sticky top-0 z-10">
        <div className="container flex items-center justify-between h-14 px-4">
          <button
            onClick={() => setLocation(`/ledger/${ledgerId}`)}
            className="p-2 -ml-2"
          >
            <ChevronLeft className="w-6 h-6 text-gray-700" />
          </button>
          <h1 className="text-lg font-medium text-[#222222]">
            {ledgerData.name}
          </h1>
          <div className="w-10"></div>
        </div>
      </div>

      {/* 成员管理区域 */}
      <div className="bg-white mt-3">
        <div className="px-4 py-3 text-sm text-gray-500">
          {members?.length || 0}个共享成员
        </div>
        
        {/* 成员列表 */}
        <div className="flex items-center gap-3 px-4 pb-4 overflow-x-auto">
          {members?.map((member, index) => (
            <div key={member.userId} className="flex flex-col items-center flex-shrink-0 relative group">
              <div className="relative">
                <div className="w-16 h-16 rounded-lg overflow-hidden">
                  <UserAvatar
                    username={member.username}
                    avatar={member.avatar}
                    nickname={member.nickname}
                    size="lg"
                    className="w-full h-full rounded-lg"
                  />
                </div>
                {member.role === 'owner' && (
                  <div 
                    className="absolute top-0 left-0 text-white text-xs px-2 py-0.5 rounded-br-lg rounded-tl-lg font-medium shadow-sm" 
                    style={{ backgroundColor: themeColors.primary }}
                  >
                    创建人
                  </div>
                )}

              </div>
              <div className="text-sm text-[#222222] mt-1">
                {member.nickname || "用户"}
              </div>
            </div>
          ))}
          
          {/* 邀请按钮（+号） */}
          <button 
            onClick={() => setShowInviteDialog(true)}
            className="flex flex-col items-center flex-shrink-0 hover:opacity-80 transition-opacity"
          >
            <div className="w-16 h-16 rounded-lg border-2 border-dashed flex items-center justify-center" style={{ borderColor: themeColors.primary }}>
              <span className="text-3xl" style={{ color: themeColors.primary }}>+</span>
            </div>
            <div className="text-sm mt-1" style={{ color: themeColors.primary }}>邀请伙伴</div>
          </button>

          {/* 移除成员按钮（-号）：创建人和管理员可见，且有非owner成员时才显示 */}
          {(ledgerData?.userRole === 'owner' || ledgerData?.userRole === 'admin') && members && members.some((m: any) => m.role !== 'owner') && (
            <button 
              onClick={() => setShowRemovePicker(true)}
              className="flex flex-col items-center flex-shrink-0 hover:opacity-80 transition-opacity"
            >
              <div className="w-16 h-16 rounded-lg border-2 border-dashed flex items-center justify-center border-red-400">
                <span className="text-3xl text-red-500">−</span>
              </div>
              <div className="text-sm mt-1 text-red-500">移除成员</div>
            </button>
          )}
        </div>
      </div>

      {/* 基本设置 */}
      <div className="bg-white mt-3">
        <SettingItem 
          label="账本名称" 
          value={ledgerData.name} 
          showIcon 
          onClick={() => setLocation(`/ledger/${ledgerId}/edit-name`)}
        />
        <SettingItem 
          label="我在账本的昵称" 
          value={members?.[0]?.nickname || "未设置"} 
          showIcon 
          onClick={() => setLocation(`/ledger/${ledgerId}/edit-nickname`)}
        />



        <SettingItem 
          label="AI雇员" 
          showIcon 
          hasHelp 
          onClick={() => setLocation(`/ledger/${ledgerId}/ai-employees`)}
        />
        <SettingItem 
          label="成员权限设置" 
          showIcon 
          hasHelp 
          onClick={() => setLocation(`/ledger/${ledgerId}/permissions`)}
        />

        <SettingItem label="账目锁定" value="不限制" />
        <SettingItem 
          label="记账必须上传图片" 
          rightContent={
            <Switch 
              checked={requireImage} 
              onCheckedChange={setRequireImage}
            />
          }
          hasHelp
        />
        {/* 只有账本创建人(owner)和管理员(admin)才能看到成员记账审批 */}
        {(ledgerData?.userRole === 'owner' || ledgerData?.userRole === 'admin') && (
          <SettingItem 
            label="成员记账审批" 
            showIcon 
            hasHelp 
            onClick={() => setLocation(`/ledger/${ledgerId}/approval-settings`)}
          />
        )}
        <SettingItem label="账本预算&目标" showIcon hasHelp />
      </div>

      {/* 高级设置 */}
      <div className="bg-white mt-3">
        <SettingItem label="自动重复记账" showIcon hasHelp />
        <SettingItem 
          label="账本结算币种" 
          value="人民币 🇨🇳" 
          hasHelp 
        />
      </div>

      {/* 共享设置 */}
      <div className="bg-white mt-3">
        <SettingItem 
          label="共享账本收支条目" 
          rightContent={
            <Switch 
              checked={shareCategories} 
              onCheckedChange={setShareCategories}
            />
          }
          hasHelp
        />




      </div>

      {/* 账本管理 */}
      <div className="bg-white mt-3">
        <SettingItem label="账本状态(封账)" value="使用中" />


        <SettingItem label="删除账单找回" showIcon />
        <SettingItem label="账本日志" showIcon />
        <SettingItem label="账本图片查看" showIcon />
        <SettingItem label="账本管理员管理" showIcon onClick={() => setLocation(`/ledger/${ledgerId}/admin-management`)} />
        <SettingItem label="账本创建人转移" showIcon />
      </div>

      {/* 导入导出功能 */}
      <div className="bg-white mt-3">
        <SettingItem label="表格导入账单" showIcon />
        <SettingItem label="手动导出表格" showIcon />
        <SettingItem label="定期自动备份账目" showIcon />
      </div>

      {/* 底部操作按钮 */}
      <div className="mt-6 px-4 space-y-3">
        <button className="w-full py-3 bg-[#D32F2F]-light0 text-white rounded-lg font-medium">
          退出账本
        </button>
      </div>

      {/* 邀请成员对话框 */}
      <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
        <DialogContent className="w-[90%] max-w-md rounded-lg" showCloseButton={false}>
          <DialogTitle className="text-lg font-semibold mb-4">邀请成员</DialogTitle>
          <div className="space-y-4">
            {/* 搜索输入框 */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="搜索用户名"
                value={searchUsername}
                onChange={(e) => setSearchUsername(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* 提示信息 */}
            {inviteMessage && (
              <div className={`p-3 rounded-lg text-sm ${
                inviteMessage.type === 'success' 
                  ? 'bg-green-50 text-green-700 border border-green-200' 
                  : 'bg-[#D32F2F]-light text-red-700 border border-red-200'
              }`}>
                {inviteMessage.text}
              </div>
            )}

            {/* 搜索结果 */}
            {searchUsername && (
              <div className="max-h-60 overflow-y-auto space-y-2">
                {searchResults && searchResults.length > 0 ? (
                  searchResults.map((user: any) => (
                    <div
                      key={user.id}
                      className="flex items-center justify-between p-3 bg-[#FAF3ED] rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <UserAvatar
                          username={user.username}
                          avatar={user.avatar}
                          size="sm"
                        />
                        <div>
                          <div className="font-medium text-[#222222]">{user.username}</div>
                          {user.name && (
                            <div className="text-sm text-gray-500">{user.name}</div>
                          )}
                        </div>
                      </div>
                      {(() => {
                        const isMember = ledgerData?.members?.some(
                          (m: any) => m.userId === user.id
                        );
                        return (
                          <Button
                            size="sm"
                            onClick={() => !isMember && handleInviteUser(user.username)}
                            disabled={isMember || inviteMutation.isPending}
                            className={isMember 
                              ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                              : "text-white hover:opacity-90"
                            }
                            style={!isMember ? { backgroundColor: themeColors.primary } : {}}
                          >
                            <UserPlus className="w-4 h-4 mr-1" />
                            {isMember ? '已添加' : '添加'}
                          </Button>
                        );
                      })()}
                    </div>
                  ))
                ) : (
                  <div className="text-center text-gray-500 py-4">
                    未找到用户
                  </div>
                )}
              </div>
            )}

            {/* 关闭按钮 */}
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setShowInviteDialog(false);
                setSearchUsername("");
              }}
            >
              关闭
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 移除成员选择弹窗 */}
      <Dialog open={showRemovePicker} onOpenChange={setShowRemovePicker}>
        <DialogContent className="w-[90%] max-w-md rounded-lg" showCloseButton={false}>
          <DialogTitle className="text-lg font-semibold mb-4">选择要移除的成员</DialogTitle>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {members?.filter((m: any) => m.role !== 'owner').map((member: any) => (
              <div
                key={member.userId}
                className="flex items-center justify-between p-3 bg-[#FAF3ED] rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <UserAvatar
                    username={member.username}
                    avatar={member.avatar}
                    nickname={member.nickname}
                    size="sm"
                    className="w-10 h-10 rounded-full"
                  />
                  <div>
                    <div className="font-medium text-[#222222]">{member.nickname || member.username}</div>
                    <div className="text-xs text-gray-400">
                      {member.role === 'admin' ? '管理员' : '普通成员'}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setMemberToRemove(member);
                    setShowRemovePicker(false);
                    setShowRemoveDialog(true);
                  }}
                  className="px-3 py-1.5 bg-[#D32F2F]-light0 text-white text-sm rounded-lg hover:bg-[#D32F2F] transition-colors"
                >
                  移除
                </button>
              </div>
            ))}
          </div>
          <Button
            variant="outline"
            className="w-full mt-3"
            onClick={() => setShowRemovePicker(false)}
          >
            取消
          </Button>
        </DialogContent>
      </Dialog>

      {/* 移除成员确认对话框 */}
      <AlertDialog open={showRemoveDialog} onOpenChange={setShowRemoveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>移除成员</AlertDialogTitle>
            <AlertDialogDescription>
              确定要移除成员 "{memberToRemove?.nickname || "用户"}" 吗？移除后，TA 将无法查看和编辑该账本。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveMember}
              className="bg-[#D32F2F]-light0 hover:bg-[#D32F2F]"
            >
              确认移除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// 设置项组件
interface SettingItemProps {
  label: string;
  value?: string;
  valueColor?: string;
  showIcon?: boolean;
  isVip?: boolean;
  hasHelp?: boolean;
  rightContent?: React.ReactNode;
  onClick?: () => void;
}

function SettingItem({
  label,
  value,
  valueColor = "text-gray-500",
  showIcon = false,
  isVip = false,
  hasHelp = false,
  rightContent,
  onClick,
}: SettingItemProps) {
  return (
    <div 
      className="flex items-center justify-between px-4 py-3 border-b border-gray-100 last:border-b-0 cursor-pointer active:bg-[#FAF3ED]"
      onClick={onClick}
    >
      <div className="flex items-center gap-2">
        <span className="text-[15px] text-[#222222]">{label}</span>
        {isVip && (
          <span className="text-xs font-bold text-[#CBA471] bg-[#FAF3ED] px-1.5 py-0.5 rounded">
            VIP
          </span>
        )}
        {hasHelp && (
          <span className="w-4 h-4 rounded-full border border-gray-300 flex items-center justify-center text-xs text-gray-400">
            ?
          </span>
        )}
      </div>
      
      <div className="flex items-center gap-2">
        {value && (
          <span className={`text-[15px] ${valueColor}`}>{value}</span>
        )}
        {rightContent}
        {showIcon && (
          <ChevronRight className="w-5 h-5 text-gray-400" />
        )}
      </div>
    </div>
  );
}
