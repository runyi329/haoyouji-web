import { useState, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { Switch } from "@/components/ui/switch";
import { ChevronRight, ChevronLeft, X, Search, UserPlus, Eye, EyeOff, Copy } from "lucide-react";
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
  // 获取当前用户信息
  const { data: user } = trpc.auth.me.useQuery();

  // 获取账本详情
  const { data: ledgerData, isLoading } = trpc.ledger.getById.useQuery({
    ledgerId,
  });

  // 获取账本成员列表
  const { data: members } = trpc.ledger.getMembers.useQuery({ ledgerId });

  // 获取当前用户的备份权限
  const { data: permissionsData } = trpc.ledger.getMemberPermissions.useQuery({ ledgerId });
  const canBackup = (() => {
    if (!permissionsData || !user) return true; // 加载中默认允许
    if (ledgerData?.userRole === 'owner') return true; // owner始终允许
    const myPermission = permissionsData.members?.find((m: any) => m.userId === user.id);
    if (!myPermission) return true;
    return myPermission.permissionBackup !== 'none';
  })();

  // shareCategories 已移除，功能整合到成员权限设置中
  const [showRemoveDialog, setShowRemoveDialog] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<any>(null);
  const [showRemovePicker, setShowRemovePicker] = useState(false);
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [searchUsername, setSearchUsername] = useState("");
  const [inviteMessage, setInviteMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [showBackupDialog, setShowBackupDialog] = useState(false);
  const [backupFrequency, setBackupFrequency] = useState<'weekly' | 'monthly' | 'quarterly'>('monthly');
  const [backupEnabled, setBackupEnabled] = useState(false);
  const [backupEditMode, setBackupEditMode] = useState(false);
  const [showTransferDialog, setShowTransferDialog] = useState(false);
  const [showTransferWarning, setShowTransferWarning] = useState(false);
  const [transferTarget, setTransferTarget] = useState<any>(null);
  const [showSecretKey, setShowSecretKey] = useState(false);

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

  // 转移创建人的mutation
  const transferOwnershipMutation = trpc.ledger.transferOwnership.useMutation({
    onSuccess: () => {
      toast.success('账本创建人已成功转移');
      setShowTransferWarning(false);
      setShowTransferDialog(false);
      setTransferTarget(null);
      utils.ledger.getMembers.invalidate({ ledgerId });
      utils.ledger.getById.invalidate({ ledgerId });
    },
    onError: (error) => {
      toast.error(error.message || '转移失败');
    },
  });

  // 处理转移确认
  const handleTransferConfirm = () => {
    if (transferTarget) {
      transferOwnershipMutation.mutate({
        ledgerId,
        newOwnerId: transferTarget.userId,
      });
    }
  };

  // 获取导出统计信息
  const { data: exportStats } = trpc.ledger.getExportStats.useQuery(
    { ledgerId },
    { enabled: showExportDialog }
  );

  // 获取备份设置
  const { data: backupSettings, refetch: refetchBackupSettings } = trpc.ledger.getBackupSettings.useQuery(
    { ledgerId },
    { enabled: showBackupDialog }
  );

  // 保存备份设置的mutation
  const saveBackupMutation = trpc.ledger.saveBackupSettings.useMutation({
    onSuccess: () => {
      toast.success('备份设置已保存');
      setBackupEditMode(false);
      refetchBackupSettings();
    },
    onError: (error) => {
      toast.error('保存失败: ' + error.message);
    },
  });

  // 发送测试备份邮件的mutation
  const sendTestBackupMutation = trpc.ledger.sendTestBackup.useMutation({
    onSuccess: () => {
      toast.success('测试邮件已发送，请检查您的邮箱');
      refetchBackupSettings();
    },
    onError: (error) => {
      toast.error('发送失败: ' + error.message);
    },
  });

  // 处理发送测试邮件
  const handleSendTestBackup = () => {
    if (!user?.email) {
      toast.error('请先在个人资料中填写邮箱地址');
      return;
    }
    sendTestBackupMutation.mutate({ ledgerId });
  };

  // 当备份设置加载完成后，填充表单
  useEffect(() => {
    if (backupSettings) {
      setBackupFrequency(backupSettings.frequency);
      setBackupEnabled(backupSettings.enabled === 1);
    }
  }, [backupSettings]);

  // 打开备份对话框时，根据是否已有设置决定显示模式
  useEffect(() => {
    if (showBackupDialog) {
      // 如果没有设置过，直接进入编辑模式
      if (!backupSettings) {
        setBackupEditMode(true);
      } else {
        setBackupEditMode(false);
      }
    }
  }, [showBackupDialog, backupSettings]);

  // 格式化日期时间
  const formatDateTime = (dateStr: string | null | undefined) => {
    if (!dateStr) return '暂无';
    const d = new Date(dateStr);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return '暂无';
    const d = new Date(dateStr);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const frequencyLabel = (f: string) => {
    if (f === 'weekly') return '每周一次';
    if (f === 'monthly') return '每月一次';
    if (f === 'quarterly') return '每季度一次';
    return f;
  };

  // 打开导出预览对话框
  const handleOpenExportDialog = () => {
    setShowExportDialog(true);
  };

  // 导出账本的处理函数
  const handleExport = async () => {
    setShowExportDialog(false);
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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">加载中...</div>
      </div>
    );
  }

  if (!ledgerData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">账本不存在</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* 顶部导航栏 */}
      <div className="bg-white border-b border-divider sticky top-0 z-10">
        <div className="container flex items-center justify-between h-14 px-4">
          <button
            onClick={() => setLocation(`/ledger/${ledgerId}`)}
            className="p-2 -ml-2"
          >
            <ChevronLeft className="w-6 h-6 text-gray-700" />
          </button>
          <h1 className="text-lg font-medium text-gray-900">
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
                    className="absolute top-0 left-0 text-white px-1.5 py-0.5 rounded-br-lg rounded-tl-lg font-medium shadow-sm" 
                    style={{ backgroundColor: '#D32F2F', fontSize: '10px' }}
                  >
                    创建人
                  </div>
                )}

              </div>
              <div className="text-sm text-gray-900 mt-1">
                {member.nickname || member.username || "用户"}
              </div>
            </div>
          ))}
          
          {/* 邀请按钮（+号） */}
          <button 
            onClick={() => setShowInviteDialog(true)}
            className="flex flex-col items-center flex-shrink-0 hover:opacity-80 transition-opacity"
          >
            <div className="w-16 h-16 rounded-lg border-2 border-dashed flex items-center justify-center" style={{ borderColor: '#D32F2F' }}>
              <span className="text-3xl" style={{ color: '#D32F2F' }}>+</span>
            </div>
            <div className="text-sm mt-1" style={{ color: '#D32F2F' }}>邀请伙伴</div>
          </button>

          {/* 移除成员按钮（-号）：创建人和管理员可见，且有非owner成员时才显示 */}
          {(ledgerData?.userRole === 'owner' || ledgerData?.userRole === 'admin') && members && members.some((m: any) => m.role !== 'owner') && (
            <button 
              onClick={() => setShowRemovePicker(true)}
              className="flex flex-col items-center flex-shrink-0 hover:opacity-80 transition-opacity"
            >
              <div className="w-16 h-16 rounded-lg border-2 border-dashed flex items-center justify-center" style={{ borderColor: 'var(--brand-red)' }}>
                <span className="text-3xl" style={{ color: 'var(--brand-red)' }}>−</span>
              </div>
              <div className="text-sm mt-1" style={{ color: 'var(--brand-red)' }}>移除成员</div>
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
          value={members?.find(m => m.isCurrentUser)?.nickname || members?.find(m => m.isCurrentUser)?.username || "未设置"} 
          showIcon 
          onClick={() => setLocation(`/ledger/${ledgerId}/edit-nickname`)}
        />



        <SettingItem 
          label="AI 分身" 
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
        <SettingItem 
          label="账本结算币种" 
          value="人民币 🇨🇳" 
          hasHelp 
        />
      </div>

      {/* 共享设置 - 已移除，功能整合到成员权限设置中 */}

      {/* 账本管理 */}
      <div className="bg-white mt-3">



        <SettingItem label="账本功能管理" showIcon onClick={() => setLocation(`/ledger/${ledgerId}/features`)} />
        <SettingItem label="账本分类管理" showIcon onClick={() => setLocation(`/ledger/${ledgerId}/categories`)} />
        <SettingItem label="删除账单找回" showIcon onClick={() => setLocation(`/ledger/${ledgerId}/deleted-records`)} />

        <SettingItem label="账本图片查看" showIcon onClick={() => setLocation(`/ledger/${ledgerId}/images`)} />
        <SettingItem label="账本管理员管理" showIcon onClick={() => setLocation(`/ledger/${ledgerId}/admin-management`)} />
        {/* 账本密钥 - 只有管理员和创建人可见 */}
        {(() => {
          const currentMember = members?.find(m => m.userId === user?.id);
          const isAdminOrOwner = currentMember?.role === 'owner' || currentMember?.role === 'admin';
          if (!isAdminOrOwner) return null;
          return <SecretKeyItem ledgerId={ledgerId} showSecretKey={showSecretKey} setShowSecretKey={setShowSecretKey} />;
        })()}
        <SettingItem label="账本创建人转移" showIcon onClick={() => {
          // 只有owner才能转移
          const currentMember = members?.find(m => m.userId === user?.id);
          if (currentMember?.role !== 'owner') {
            toast.error('只有账本创建人才能转移所有权');
            return;
          }
          setShowTransferDialog(true);
        }} />
      </div>

      {/* 导入导出功能 */}
      <div className="bg-white mt-3">
        <SettingItem 
          label="表格导入账单" 
          showIcon 
          onClick={() => setLocation(`/ledger/${ledgerId}/import`)} 
        />
        <SettingItem 
          label="手动导出表格" 
          showIcon={canBackup}
          value={!canBackup ? "禁用" : undefined}
          valueColor={!canBackup ? "text-red-500" : "text-gray-500"}
          onClick={canBackup ? handleOpenExportDialog : undefined} 
        />
        <SettingItem 
          label="共享账本自动备份" 
          showIcon={canBackup}
          value={!canBackup ? "禁用" : undefined}
          valueColor={!canBackup ? "text-red-500" : "text-gray-500"}
          onClick={canBackup ? () => {
            if (!user?.email) {
              toast.error("请先在个人中心填写邮箱地址", {
                action: {
                  label: "去填写",
                  onClick: () => setLocation("/profile/edit"),
                },
              });
            } else {
              setShowBackupDialog(true);
            }
          } : undefined} 
        />
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
              <div 
                className="p-3 rounded-lg text-sm border"
                style={{
                  backgroundColor: inviteMessage.type === 'success' ? 'var(--status-success-light)' : 'var(--brand-red-light)',
                  color: inviteMessage.type === 'success' ? 'var(--status-success)' : 'var(--brand-red)',
                  borderColor: inviteMessage.type === 'success' ? 'var(--status-success)' : 'var(--brand-red)'
                }}
              >
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
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <UserAvatar
                          username={user.username}
                          avatar={user.avatar}
                          size="sm"
                        />
                        <div>
                          <div className="font-medium text-gray-900">{user.username}</div>
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
                            style={!isMember ? { backgroundColor: '#D32F2F' } : {}}
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
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
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
                    <div className="font-medium text-gray-900">{member.nickname || member.username}</div>
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
                  className="px-3 py-1.5 text-white text-sm rounded-lg hover:opacity-90 transition-colors"
                  style={{ backgroundColor: 'var(--brand-red)' }}
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
              className="hover:opacity-90 text-white"
              style={{ backgroundColor: 'var(--brand-red)' }}
            >
              确认移除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 导出预览对话框 */}
      <Dialog open={showExportDialog} onOpenChange={setShowExportDialog}>
        <DialogContent className="w-[90%] max-w-md rounded-2xl p-0" showCloseButton={false}>
          <DialogTitle className="sr-only">导出账本</DialogTitle>
          
          {exportStats ? (
            <div className="p-6">
              {/* 标题 */}
              <div className="text-center mb-6">
                <h3 className="text-xl font-semibold text-gray-900 mb-2">导出账本</h3>
                <p className="text-sm text-gray-600">{exportStats.ledgerName}</p>
              </div>

              {/* 统计信息 */}
              <div className="space-y-3 mb-6">
                {/* 记录数 */}
                <div className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg">
                  <span className="text-sm text-gray-600">记录总数</span>
                  <span className="text-base font-semibold text-gray-900">{exportStats.totalRecords} 条</span>
                </div>

                {/* 时间范围 */}
                {exportStats.earliestDate && exportStats.latestDate && (
                  <div className="p-3 bg-white border border-gray-200 rounded-lg">
                    <div className="text-sm text-gray-600 mb-1">时间范围</div>
                    <div className="text-sm font-medium text-gray-900">
                      {exportStats.earliestDate} 至 {exportStats.latestDate}
                    </div>
                  </div>
                )}

                {/* 收入支出 */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-white border border-gray-200 rounded-lg">
                    <div className="text-xs text-gray-500 mb-1">总收入</div>
                    <div className="text-base font-semibold text-green-600">¥{exportStats.totalIncome}</div>
                  </div>
                  <div className="p-3 bg-white border border-gray-200 rounded-lg">
                    <div className="text-xs text-gray-500 mb-1">总支出</div>
                    <div className="text-base font-semibold text-red-600">¥{exportStats.totalExpense}</div>
                  </div>
                </div>

                {/* 结余 */}
                <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">结余</span>
                    <span className={`text-lg font-bold ${
                      parseFloat(exportStats.balance) >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      ¥{exportStats.balance}
                    </span>
                  </div>
                </div>
              </div>

              {/* 按钮 */}
              <div className="space-y-2">
                <Button
                  onClick={handleExport}
                  className="w-full h-12 text-base font-medium text-white rounded-lg"
                  style={{ backgroundColor: '#D32F2F' }}
                >
                  下载 Excel 文件
                </Button>
                <Button
                  onClick={() => setShowExportDialog(false)}
                  variant="outline"
                  className="w-full h-12 text-base font-medium rounded-lg border-gray-300 text-gray-700 hover:bg-gray-50"
                >
                  取消
                </Button>
              </div>
            </div>
          ) : (
            <div className="p-6 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-300 border-t-blue-500 mx-auto mb-4"></div>
              <p className="text-gray-500">正在加载统计信息...</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 备份设置对话框 */}
      <Dialog open={showBackupDialog} onOpenChange={setShowBackupDialog}>
        <DialogContent className="max-w-md mx-auto">
          <DialogTitle className="text-xl font-bold text-center mb-4">
            {backupEditMode ? '共享账本自动备份' : '共享账本自动备份'}
          </DialogTitle>
          
          {/* ===== 概览模式：已设置过备份且不在编辑状态 ===== */}
          {!backupEditMode && backupSettings ? (
            <div className="space-y-4">
              {/* 状态指示 */}
              <div className={`flex items-center gap-2 px-4 py-3 rounded-lg ${
                backupSettings.enabled === 1 ? 'bg-green-50 border border-green-200' : 'bg-gray-50 border border-gray-200'
              }`}>
                <div className={`w-2.5 h-2.5 rounded-full ${
                  backupSettings.enabled === 1 ? 'bg-green-500 animate-pulse' : 'bg-gray-400'
                }`} />
                <span className={`text-sm font-medium ${
                  backupSettings.enabled === 1 ? 'text-green-700' : 'text-gray-500'
                }`}>
                  {backupSettings.enabled === 1 ? '自动备份已启用' : '自动备份已暂停'}
                </span>
              </div>

              {/* 信息卡片 */}
              <div className="bg-gray-50 rounded-lg border border-gray-200 divide-y divide-gray-200">
                <div className="flex justify-between items-center px-4 py-3">
                  <span className="text-sm text-gray-500">发送邮箱</span>
                  <span className="text-sm font-medium text-gray-900">{user?.email || '未设置'}</span>
                </div>
                <div className="flex justify-between items-center px-4 py-3">
                  <span className="text-sm text-gray-500">备份频率</span>
                  <span className="text-sm font-medium text-gray-900">{frequencyLabel(backupSettings.frequency)}</span>
                </div>
                <div className="flex justify-between items-center px-4 py-3">
                  <span className="text-sm text-gray-500">创建时间</span>
                  <span className="text-sm font-medium text-gray-900">{formatDate(backupSettings.createdAt)}</span>
                </div>
                <div className="flex justify-between items-center px-4 py-3">
                  <span className="text-sm text-gray-500">已发送次数</span>
                  <span className="text-sm font-medium text-gray-900">{backupSettings.backupCount ?? 0} 次</span>
                </div>
                <div className="flex justify-between items-center px-4 py-3">
                  <span className="text-sm text-gray-500">上次发送</span>
                  <span className="text-sm font-medium text-gray-900">{formatDateTime(backupSettings.lastBackupAt)}</span>
                </div>
                <div className="flex justify-between items-center px-4 py-3">
                  <span className="text-sm text-gray-500">下次发送</span>
                  <span className={`text-sm font-medium ${
                    backupSettings.enabled === 1 ? 'text-[#D32F2F]' : 'text-gray-400'
                  }`}>
                    {backupSettings.enabled === 1 ? formatDateTime(backupSettings.nextBackupAt) : '已暂停'}
                  </span>
                </div>
              </div>

              {/* 操作按钮 */}
              <div className="space-y-2 pt-1">
                <Button
                  onClick={() => {
                    setBackupEditMode(true);
                    setBackupFrequency(backupSettings.frequency);
                    setBackupEnabled(backupSettings.enabled === 1);
                  }}
                  className="w-full h-11 text-sm font-medium text-white rounded-lg"
                  style={{ backgroundColor: '#D32F2F' }}
                >
                  编辑设置
                </Button>
                <Button
                  onClick={handleSendTestBackup}
                  disabled={sendTestBackupMutation.isPending || !user?.email}
                  variant="outline"
                  className="w-full h-11 text-sm font-medium rounded-lg border-[#D32F2F] text-[#D32F2F] hover:bg-red-50"
                >
                  {sendTestBackupMutation.isPending ? '发送中...' : '立即发送一次'}
                </Button>
                <Button
                  onClick={() => setShowBackupDialog(false)}
                  variant="outline"
                  className="w-full h-11 text-sm font-medium rounded-lg border-gray-300 text-gray-700 hover:bg-gray-50"
                >
                  关闭
                </Button>
              </div>
            </div>
          ) : (
            /* ===== 编辑模式：首次设置 或 点击编辑 ===== */
            <div className="space-y-5">
              {/* 邮箱地址 */}
              <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                <div className="text-xs text-gray-500 mb-1">备份发送至</div>
                <div className="text-sm font-medium text-gray-900">{user?.email || '请先在个人资料中设置邮箱'}</div>
              </div>

              {/* 备份频率 */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-2">
                  备份频率
                </label>
                <div className="space-y-2">
                  {[
                    { value: 'weekly' as const, label: '每周一次' },
                    { value: 'monthly' as const, label: '每月一次' },
                    { value: 'quarterly' as const, label: '每季度一次' },
                  ].map((option) => (
                    <button
                      key={option.value}
                      onClick={() => setBackupFrequency(option.value)}
                      className={`w-full px-4 py-3 rounded-lg border-2 text-left text-sm transition-colors ${
                        backupFrequency === option.value
                          ? 'border-[#D32F2F] bg-red-50 text-[#D32F2F] font-medium'
                          : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 开关 */}
              <div className="flex items-center justify-between bg-gray-50 p-4 rounded-lg border border-gray-200">
                <span className="text-sm font-medium text-gray-700">启用自动备份</span>
                <Switch
                  checked={backupEnabled}
                  onCheckedChange={setBackupEnabled}
                />
              </div>

              {/* 按钮 */}
              <div className="space-y-2 pt-1">
                <Button
                  onClick={() => {
                    saveBackupMutation.mutate({
                      ledgerId,
                      frequency: backupFrequency,
                      enabled: backupEnabled,
                    });
                  }}
                  disabled={saveBackupMutation.isPending}
                  className="w-full h-11 text-sm font-medium text-white rounded-lg"
                  style={{ backgroundColor: '#D32F2F' }}
                >
                  {saveBackupMutation.isPending ? '保存中...' : '保存设置'}
                </Button>
                {backupSettings && (
                  <Button
                    onClick={() => setBackupEditMode(false)}
                    variant="outline"
                    className="w-full h-11 text-sm font-medium rounded-lg border-gray-300 text-gray-700 hover:bg-gray-50"
                  >
                    取消
                  </Button>
                )}
                {!backupSettings && (
                  <Button
                    onClick={() => setShowBackupDialog(false)}
                    variant="outline"
                    className="w-full h-11 text-sm font-medium rounded-lg border-gray-300 text-gray-700 hover:bg-gray-50"
                  >
                    取消
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 转移创建人 - 选择成员对话框 */}
      <Dialog open={showTransferDialog} onOpenChange={setShowTransferDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>转移账本创建人</DialogTitle>
          <div className="mt-2">
            <p className="text-sm text-gray-500 mb-4">请选择要转移给的成员：</p>
            <div className="max-h-64 overflow-y-auto space-y-2">
              {members?.filter(m => m.userId !== user?.id).map((member) => (
                <div
                  key={member.userId}
                  className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                    transferTarget?.userId === member.userId
                      ? 'bg-red-50 border-2 border-[#D32F2F]'
                      : 'bg-gray-50 border-2 border-transparent hover:bg-gray-100'
                  }`}
                  onClick={() => setTransferTarget(member)}
                >
                  <UserAvatar
                    username={member.username}
                    avatar={member.avatar}
                    nickname={member.nickname}
                    size="sm"
                  />
                  <div className="flex-1">
                    <div className="font-medium text-sm">{member.nickname || member.username}</div>
                    <div className="text-xs text-gray-400">
                      {member.role === 'admin' ? '管理员' : '普通成员'}
                    </div>
                  </div>
                  {transferTarget?.userId === member.userId && (
                    <span className="text-[#D32F2F] text-lg">✓</span>
                  )}
                </div>
              ))}
              {members?.filter(m => m.userId !== user?.id).length === 0 && (
                <div className="text-center text-gray-400 py-6 text-sm">账本中没有其他成员</div>
              )}
            </div>
            <div className="flex gap-3 mt-4">
              <Button
                variant="outline"
                className="flex-1 h-11 rounded-lg border-gray-300"
                onClick={() => {
                  setShowTransferDialog(false);
                  setTransferTarget(null);
                }}
              >
                取消
              </Button>
              <Button
                className="flex-1 h-11 rounded-lg bg-[#D32F2F] hover:bg-[#B71C1C] text-white"
                disabled={!transferTarget}
                onClick={() => {
                  setShowTransferDialog(false);
                  setShowTransferWarning(true);
                }}
              >
                下一步
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 转移创建人 - 风险提醒和二次确认 */}
      <AlertDialog open={showTransferWarning} onOpenChange={setShowTransferWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[#D32F2F] flex items-center gap-2">
              <span className="text-xl">⚠️</span> 重要提醒
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p className="text-sm text-gray-700 font-medium">
                  您即将将账本创建人转移给 <span className="text-[#D32F2F] font-bold">{transferTarget?.nickname || transferTarget?.username}</span>，请仔细阅读以下内容：
                </p>
                <div className="bg-red-50 rounded-lg p-3 space-y-2">
                  <p className="text-sm text-[#D32F2F] font-medium">转移后您将失去以下权限：</p>
                  <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
                    <li>删除账本的权限</li>
                    <li>管理账本成员的最高权限</li>
                    <li>设置账本管理员的权限</li>
                    <li>修改账本核心设置的权限</li>
                    <li>封存/解封账本的权限</li>
                  </ul>
                </div>
                <div className="bg-orange-50 rounded-lg p-3">
                  <p className="text-sm text-orange-700 font-medium">❗ 此操作不可撤回</p>
                  <p className="text-xs text-orange-600 mt-1">转移后您将无法自行恢复创建人身份，需要对方再次转移给您才能恢复。</p>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex gap-3 mt-4">
            <AlertDialogCancel
              className="flex-1 h-11 rounded-lg"
              onClick={() => {
                setShowTransferWarning(false);
                setShowTransferDialog(true);
              }}
            >
              返回重选
            </AlertDialogCancel>
            <AlertDialogAction
              className="flex-1 h-11 rounded-lg bg-[#D32F2F] hover:bg-[#B71C1C] text-white"
              onClick={handleTransferConfirm}
              disabled={transferOwnershipMutation.isPending}
            >
              {transferOwnershipMutation.isPending ? '转移中...' : '确认转移'}
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
      className="flex items-center justify-between px-4 py-3 border-b border-gray-100 last:border-b-0 cursor-pointer active:bg-gray-50"
      onClick={onClick}
    >
      <div className="flex items-center gap-2">
        <span className="text-[15px] text-gray-900">{label}</span>
        {isVip && (
          <span className="text-xs font-bold bg-gray-50 px-1.5 py-0.5 rounded" style={{ color: 'var(--status-gold)' }}>
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

function SecretKeyItem({ ledgerId, showSecretKey, setShowSecretKey }: { ledgerId: number; showSecretKey: boolean; setShowSecretKey: (v: boolean) => void }) {
  const { data: secretKeyData } = trpc.ledger.getSecretKey.useQuery(
    { ledgerId },
    { enabled: showSecretKey }
  );

  const handleCopy = async () => {
    if (secretKeyData?.secretKey) {
      try {
        await navigator.clipboard.writeText(secretKeyData.secretKey);
        toast.success('密钥已复制到剪贴板');
      } catch {
        // fallback
        const textarea = document.createElement('textarea');
        textarea.value = secretKeyData.secretKey;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        toast.success('密钥已复制到剪贴板');
      }
    }
  };

  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
      <span className="text-[15px] text-gray-900 shrink-0">账本密钥</span>
      <div className="flex items-center gap-2 ml-3 min-w-0">
        {showSecretKey && secretKeyData?.secretKey ? (
          <>
            <span className="text-xs font-mono text-gray-500 truncate max-w-[160px]">
              {secretKeyData.secretKey}
            </span>
            <button
              className="p-1 hover:bg-gray-100 rounded transition-colors shrink-0"
              onClick={handleCopy}
              title="复制密钥"
            >
              <Copy className="w-4 h-4 text-gray-500" />
            </button>
          </>
        ) : (
          <span className="text-xs text-gray-400 font-mono">••••••••••••••••</span>
        )}
        <button
          className="p-1 hover:bg-gray-100 rounded transition-colors shrink-0"
          onClick={() => setShowSecretKey(!showSecretKey)}
          title={showSecretKey ? "隐藏密钥" : "显示密钥"}
        >
          {showSecretKey ? (
            <EyeOff className="w-4 h-4 text-gray-500" />
          ) : (
            <Eye className="w-4 h-4 text-gray-500" />
          )}
        </button>
      </div>
    </div>
  );
}
