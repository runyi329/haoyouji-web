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
 // 
 const { data: user } = trpc.auth.me.useQuery();

 // 
 const { data: ledgerData, isLoading } = trpc.ledger.getById.useQuery({
 ledgerId,
 });

 // 
 const { data: members } = trpc.ledger.getMembers.useQuery({ ledgerId });

 // 
 const { data: permissionsData } = trpc.ledger.getMemberPermissions.useQuery({ ledgerId });
 const canBackup = (() => {
 if (!permissionsData || !user) return true; // 
 if (ledgerData?.userRole === 'owner') return true; // owner
 const myPermission = permissionsData.members?.find((m: any) => m.userId === user.id);
 if (!myPermission) return true;
 return myPermission.permissionBackup !== 'none';
 })();

 // shareCategories 
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

 // mutation
 const utils = trpc.useUtils();
 const removeMemberMutation = trpc.ledger.removeMember.useMutation({
 onSuccess: () => {
 toast.success("");
 utils.ledger.getMembers.invalidate({ ledgerId });
 setShowRemoveDialog(false);
 setMemberToRemove(null);
 },
 onError: (error) => {
 toast.error(error.message || "");
 },
 });

 // 
 const handleRemoveMember = () => {
 if (memberToRemove) {
 removeMemberMutation.mutate({
 ledgerId,
 userId: memberToRemove.userId,
 });
 }
 };

 // 
 const { data: searchResults } = trpc.sharing.searchUsers.useQuery(
 { query: searchUsername },
 { enabled: searchUsername.length > 0 }
 );

 // mutation
 const inviteMutation = trpc.ledger.inviteMember.useMutation({
 onSuccess: (data) => {
 setInviteMessage({ type: 'success', text: ` ${data.member.username} ` });
 setTimeout(() => {
 setShowInviteDialog(false);
 setSearchUsername("");
 setInviteMessage(null);
 }, 1500);
 utils.ledger.getMembers.invalidate({ ledgerId });
 },
 onError: (error) => {
 setInviteMessage({ type: 'error', text: `: ${error.message}` });
 setTimeout(() => setInviteMessage(null), 3000);
 },
 });

 // 
 const handleInviteUser = (username: string) => {
 inviteMutation.mutate({ ledgerId, username });
 };

 // mutation
 const transferOwnershipMutation = trpc.ledger.transferOwnership.useMutation({
 onSuccess: () => {
 toast.success('');
 setShowTransferWarning(false);
 setShowTransferDialog(false);
 setTransferTarget(null);
 utils.ledger.getMembers.invalidate({ ledgerId });
 utils.ledger.getById.invalidate({ ledgerId });
 },
 onError: (error) => {
 toast.error(error.message || '');
 },
 });

 // 
 const handleTransferConfirm = () => {
 if (transferTarget) {
 transferOwnershipMutation.mutate({
 ledgerId,
 newOwnerId: transferTarget.userId,
 });
 }
 };

 // 
 const { data: exportStats } = trpc.ledger.getExportStats.useQuery(
 { ledgerId },
 { enabled: showExportDialog }
 );

 // 
 const { data: backupSettings, refetch: refetchBackupSettings } = trpc.ledger.getBackupSettings.useQuery(
 { ledgerId },
 { enabled: showBackupDialog }
 );

 // mutation
 const saveBackupMutation = trpc.ledger.saveBackupSettings.useMutation({
 onSuccess: () => {
 toast.success('');
 setBackupEditMode(false);
 refetchBackupSettings();
 },
 onError: (error) => {
 toast.error(': ' + error.message);
 },
 });

 // mutation
 const sendTestBackupMutation = trpc.ledger.sendTestBackup.useMutation({
 onSuccess: () => {
 toast.success('');
 refetchBackupSettings();
 },
 onError: (error) => {
 toast.error(': ' + error.message);
 },
 });

 // 
 const handleSendTestBackup = () => {
 if (!user?.email) {
 toast.error('');
 return;
 }
 sendTestBackupMutation.mutate({ ledgerId });
 };

 // 
 useEffect(() => {
 if (backupSettings) {
 setBackupFrequency(backupSettings.frequency);
 setBackupEnabled(backupSettings.enabled === 1);
 }
 }, [backupSettings]);

 // 
 useEffect(() => {
 if (showBackupDialog) {
 // 
 if (!backupSettings) {
 setBackupEditMode(true);
 } else {
 setBackupEditMode(false);
 }
 }
 }, [showBackupDialog, backupSettings]);

 // 
 const formatDateTime = (dateStr: string | null | undefined) => {
 if (!dateStr) return '';
 const d = new Date(dateStr);
 return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
 };

 const formatDate = (dateStr: string | null | undefined) => {
 if (!dateStr) return '';
 const d = new Date(dateStr);
 return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
 };

 const frequencyLabel = (f: string) => {
 if (f === 'weekly') return '';
 if (f === 'monthly') return '';
 if (f === 'quarterly') return '';
 return f;
 };

 // 
 const handleOpenExportDialog = () => {
 setShowExportDialog(true);
 };

 // 
 const handleExport = async () => {
 setShowExportDialog(false);
 const loadingToast = toast.loading(
 <div className="flex items-center gap-2">
 <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-300 border-t-blue-500"></div>
 <span>Excel...</span>
 </div>
 );
 try {
 if (!user) {
 throw new Error('');
 }
 
 const response = await fetch(`/api/ledger/${ledgerId}/export`, {
 method: 'GET',
 headers: {
 'X-User-Id': user.id.toString(),
 },
 });
 
 if (!response.ok) {
 const error = await response.json();
 throw new Error(error.error || '');
 }
 
 const contentDisposition = response.headers.get('Content-Disposition');
 let filename = `_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')}.xlsx`;
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
 <div className="font-semibold"></div>
 <div className="text-xs text-[#757575]">{filename}</div>
 <div className="text-xs text-gray-500"></div>
 </div>,
 { duration: 4000 }
 );
 } catch (error: any) {
 toast.dismiss(loadingToast);
 toast.error(`: ${error.message || ''}`);
 }
 };

 if (isLoading) {
 return (
 <div className="min-h-screen bg-gray-50 flex items-center justify-center">
 <div className="text-gray-500">...</div>
 </div>
 );
 }

 if (!ledgerData) {
 return (
 <div className="min-h-screen bg-gray-50 flex items-center justify-center">
 <div className="text-gray-500"></div>
 </div>
 );
 }

 return (
 <div className="min-h-screen bg-gray-50 pb-20">
 {/* 导航栏 + 头像区域合并为一个白色卡片 */}
 <div className="bg-white border-b border-divider sticky top-0 z-10">
 {/* 顶部导航行 */}
 <div className="container flex items-center justify-between h-14 px-4">
 <button
 onClick={() => setLocation(ledgerData?.type === 'opinion_book' ? `/opinion/${ledgerId}` : `/ledger/${ledgerId}`)}
 className="p-2 -ml-2"
 >
 <ChevronLeft className="w-6 h-6 text-gray-700" />
 </button>
 <h1 className="text-lg font-medium text-gray-900 truncate max-w-[220px]">
 {ledgerData.name}
 </h1>
 <div className="w-10"></div>
 </div>
 {/* 头像列表区域（与导航栏同一卡片） */}
 <div className="flex items-start gap-3 px-4 pb-4 overflow-x-auto">
 {members?.map((member, index) => (
 <div key={member.userId} className="flex flex-col items-center flex-shrink-0">
 {/* 头像容器：固定 64×64 */}
 <div className="relative w-16 h-16 flex-shrink-0">
 <div className="w-16 h-16 rounded-xl overflow-hidden">
 <UserAvatar
 username={member.username}
 avatar={member.avatar}
 nickname={member.nickname}
 size="lg"
 className="w-full h-full rounded-xl"
 />
 </div>
 {/* 创建人标签：左上角 */}
 {member.role === 'owner' && (
 <div
 className="absolute top-0 left-0 text-white font-semibold shadow-sm"
 style={{
 backgroundColor: '#D32F2F',
 fontSize: '9px',
 padding: '2px 5px',
 borderRadius: '6px 0 6px 0',
 lineHeight: '13px',
 letterSpacing: '0.5px',
 }}
 >
 创建人
 </div>
 )}
 {/* AI 标签：底部居中悬浮 */}
 {(member as any).memberType === 'ai' && (
 <div
 className="absolute -bottom-2 left-1/2 -translate-x-1/2 text-white font-bold shadow-sm"
 style={{
 background: 'linear-gradient(135deg, #D32F2F, #FF5252)',
 fontSize: '9px',
 padding: '2px 7px',
 borderRadius: '8px',
 lineHeight: '14px',
 letterSpacing: '1px',
 border: '1.5px solid #fff',
 whiteSpace: 'nowrap',
 }}
 >
 AI
 </div>
 )}
 </div>
 {/* 昵称：AI成员底部留出标签空间 */}
 <div
 className="text-xs text-gray-700 text-center w-16 truncate"
 style={{ marginTop: (member as any).memberType === 'ai' ? '14px' : '6px' }}
 >
 {member.nickname || member.username || ""}
 </div>
 </div>
 ))}

 {/* 加成员按钮 */}
 <button
 onClick={() => setShowInviteDialog(true)}
 className="flex flex-col items-center flex-shrink-0 hover:opacity-75 transition-opacity"
 >
 <div
 className="w-16 h-16 rounded-xl flex items-center justify-center"
 style={{
 backgroundColor: '#FFF5F5',
 border: '1.5px solid #FFCDD2',
 }}
 >
 <span className="text-2xl font-light leading-none" style={{ color: '#D32F2F' }}>+</span>
 </div>
 <div className="text-xs mt-1.5 font-medium" style={{ color: '#D32F2F' }}>添加</div>
 </button>

 {/* 移除成员按钮（仅 owner/admin 可见） */}
 {(ledgerData?.userRole === 'owner' || ledgerData?.userRole === 'admin') && members && members.some((m: any) => m.role !== 'owner') && (
 <button
 onClick={() => setShowRemovePicker(true)}
 className="flex flex-col items-center flex-shrink-0 hover:opacity-75 transition-opacity"
 >
 <div
 className="w-16 h-16 rounded-xl flex items-center justify-center"
 style={{
 backgroundColor: '#F5F5F5',
 border: '1.5px solid #E0E0E0',
 }}
 >
 <span className="text-2xl font-light leading-none" style={{ color: '#9E9E9E' }}>−</span>
 </div>
 <div className="text-xs mt-1.5 font-medium" style={{ color: '#9E9E9E' }}>移除</div>
 </button>
 )}
 </div>
 </div>

 {/* */}
 <div className="bg-white mt-3">
 <SettingItem 
 label={ledgerData?.type === 'opinion_book' ? '店铺名称' : ['diet', 'custom_ac'].includes(ledgerData?.type) ? '减肥账本名称' : '账本名称'} 
 value={ledgerData.name} 
 showIcon 
 onClick={() => setLocation(`/ledger/${ledgerId}/edit-name`)}
 />
 <SettingItem 
 label="我在账本的昵称"
 value={members?.find(m => m.isCurrentUser)?.nickname || members?.find(m => m.isCurrentUser)?.username || ""} 
 showIcon 
 onClick={() => setLocation(`/ledger/${ledgerId}/edit-nickname`)}
 />



 {ledgerData?.type !== 'opinion_book' && (
 <SettingItem 
 label="AI 分身" 
 showIcon 
 hasHelp 
 onClick={() => setLocation(`/ledger/${ledgerId}/ai-employees`)}
 />
 )}
 <SettingItem 
 label={ledgerData?.type === 'opinion_book' ? '全成员权限设置' : '成员权限设置'} 
 showIcon 
 hasHelp 
 onClick={() => setLocation(`/ledger/${ledgerId}/permissions`)}
 />


 {/* (owner)(admin)opinion_book */}
 {ledgerData?.type !== 'opinion_book' && (ledgerData?.userRole === 'owner' || ledgerData?.userRole === 'admin') && (
 <SettingItem 
 label={ledgerData?.type === 'diet' ? '成员信息设置' : '成员记账审批'} 
 showIcon 
 hasHelp 
 onClick={() => setLocation(`/ledger/${ledgerId}/${ledgerData?.type === 'diet' ? 'member-info' : 'approval-settings'}`)}
 />
 )}
 {/* (AA)owner/admin */}
 {ledgerData?.type === 'custom_aa' && (ledgerData?.userRole === 'owner' || ledgerData?.userRole === 'admin') && (
 <SettingItem
 label="初始金额管理"
 showIcon
 onClick={() => setLocation(`/ledger/${ledgerId}/aa-initial-balance`)}
 />
 )}
 {/* AE/AF 型抽奖入口 */}
 {(ledgerData?.type === 'custom_ae' || ledgerData?.type === 'custom_af') && (ledgerData?.userRole === 'owner' || ledgerData?.userRole === 'admin') && (
 <SettingItem
 label="抽奖活动管理"
 showIcon
 onClick={() => setLocation(`/lottery/list/${ledgerId}`)}
 />
 )}
 {/* AF 型充值管理入口 */}
 {ledgerData?.type === 'custom_af' && (ledgerData?.userRole === 'owner' || ledgerData?.userRole === 'admin') && (
 <SettingItem
 label="充值管理"
 showIcon
 onClick={() => setLocation(`/ledger/${ledgerId}/af-recharge-manage`)}
 />
 )}
 {/* AF 型订单管理入口 */}
 {ledgerData?.type === 'custom_af' && (ledgerData?.userRole === 'owner' || ledgerData?.userRole === 'admin') && (
 <SettingItem
 label="订单管理"
 showIcon
 onClick={() => setLocation(`/ledger/${ledgerId}/af-order-manage`)}
 />
 )}
 {ledgerData?.type === 'custom_af' && (ledgerData?.userRole === 'owner' || ledgerData?.userRole === 'admin') && (
 <SettingItem
 label="拨比管理"
 showIcon
 onClick={() => setLocation(`/ledger/${ledgerId}/af-payout-manage`)}
 />
 )}
 {ledgerData?.type === 'custom_af' && (ledgerData?.userRole === 'owner' || ledgerData?.userRole === 'admin') && (
 <SettingItem
 label="行情评估设置"
 showIcon
 onClick={() => setLocation(`/ledger/${ledgerId}/market-eval-settings`)}
 />
 )}
 {(ledgerData?.type === 'custom_ae' || ledgerData?.type === 'custom_af') && ledgerData?.userRole !== 'owner' && ledgerData?.userRole !== 'admin' && (
 <SettingItem
 label="我的抽奖"
 showIcon
 onClick={() => setLocation(`/lottery/list/${ledgerId}`)}
 />
 )}
 {/* AG 型数据源管理入口 */}
 {(ledgerData?.type === 'custom_ag' || ledgerId === 54) && (ledgerData?.userRole === 'owner' || ledgerData?.userRole === 'admin') && (
 <SettingItem
 label="数据源管理"
 showIcon
 onClick={() => setLocation(`/ledger/${ledgerId}/ag-data-sources`)}
 />
 )}
 {/* / */}
 {(ledgerData?.userRole === 'owner' || ledgerData?.userRole === 'admin') && (
 <SettingItem
 label="账目明细"
 showIcon
 onClick={() => setLocation(`/ledger/${ledgerId}/admin-transactions`)}
 />
 )}
 {ledgerData?.type !== 'diet' && ledgerData?.type !== 'opinion_book' && <SettingItem label="账本预算&目标" showIcon hasHelp />}
 </div>

 {/* */}
 {ledgerData?.type !== 'diet' && ledgerData?.type !== 'opinion_book' && (
 <div className="bg-white mt-3">
 <SettingItem 
 label="账本结算币种"
 value={(() => {
 const currencyMap: Record<string, string> = {
 CNY: ' ',
 USD: ' ',
 EUR: ' ',
 GBP: ' ',
 JPY: ' ',
 HKD: ' ',
 USDT: 'USDT ',
 };
 const code = ledgerData?.currency || 'CNY';
 return currencyMap[code] || code;
 })()}
 hasHelp 
 />
 </div>
 )}

 {/* - */}

 {/* */}
 <div className="bg-white mt-3">



 {ledgerData?.type !== 'opinion_book' && (
 <SettingItem label="功能管理" showIcon onClick={() => setLocation(`/ledger/${ledgerId}/features`)} />
 )}
 <SettingItem label={ledgerData?.type === 'opinion_book' ? '分店管理' : '分类管理'} showIcon onClick={() => setLocation(`/ledger/${ledgerId}/categories`)} />
 {ledgerData?.type === 'opinion_book' && (
 <SettingItem label="前端面板设置" showIcon onClick={() => setLocation(`/ab/opinion/${ledgerId}`)} />
 )}
 {ledgerData?.type === 'opinion_book' && (
 <SettingItem label="二维码管理" showIcon onClick={() => setLocation(`/ledger/${ledgerId}/qrcodes`)} />
 )}
 <SettingItem label="删除找回" showIcon onClick={() => setLocation(`/ledger/${ledgerId}/deleted-records`)} />

 <SettingItem label="图片查看" showIcon onClick={() => setLocation(`/ledger/${ledgerId}/images`)} />
 <SettingItem label={ledgerData?.type === 'diet' ? '减肥教练管理' : '账本管理员管理'} showIcon onClick={() => setLocation(`/ledger/${ledgerId}/admin-management`)} />
 {/* - */}
 {(() => {
 const currentMember = members?.find(m => m.userId === user?.id);
 const isAdminOrOwner = currentMember?.role === 'owner' || currentMember?.role === 'admin';
 if (!isAdminOrOwner) return null;
 return <SecretKeyItem ledgerId={ledgerId} showSecretKey={showSecretKey} setShowSecretKey={setShowSecretKey} />;
 })()}
 <SettingItem label="创建人转移" showIcon onClick={() => {
 // owner
 const currentMember = members?.find(m => m.userId === user?.id);
 if (currentMember?.role !== 'owner') {
 toast.error('');
 return;
 }
 setShowTransferDialog(true);
 }} />
 </div>

 {/* - */}
 {ledgerData?.type !== 'diet' && ledgerData?.type !== 'opinion_book' && (
 <div className="bg-white mt-3">
 <SettingItem 
 label="表格导入账单"
 showIcon 
 onClick={() => setLocation(`/ledger/${ledgerId}/import`)} 
 />
 <SettingItem 
 label="手动导出表格"
 showIcon={canBackup}
 value={!canBackup ? "需先设置邮箱" : undefined}
 valueColor={!canBackup ? "text-red-500" : "text-gray-500"}
 onClick={canBackup ? handleOpenExportDialog : undefined} 
 />
 <SettingItem 
 label="共享账本自动备份"
 showIcon={canBackup}
 value={!canBackup ? "需先设置邮箱" : undefined}
 valueColor={!canBackup ? "text-red-500" : "text-gray-500"}
 onClick={canBackup ? () => {
 if (!user?.email) {
 toast.error("", {
 action: {
 label: "",
 onClick: () => setLocation("/profile/edit"),
 },
 });
 } else {
 setShowBackupDialog(true);
 }
 } : undefined} 
 />
 </div>
 )}



 {/* */}
 <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
 <DialogContent className="w-[90%] max-w-md rounded-lg" showCloseButton={false}>
 <DialogTitle className="text-lg font-semibold mb-4"></DialogTitle>
 <div className="space-y-4">
 {/* */}
 <div className="relative">
 <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
 <Input
 placeholder=""
 value={searchUsername}
 onChange={(e) => setSearchUsername(e.target.value)}
 className="pl-10"
 />
 </div>

 {/* */}
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

 {/* */}
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
 {isMember ? '' : ''}
 </Button>
 );
 })()}
 </div>
 ))
 ) : (
 <div className="text-center text-gray-500 py-4">
 
 </div>
 )}
 </div>
 )}

 {/* */}
 <Button
 variant="outline"
 className="w-full"
 onClick={() => {
 setShowInviteDialog(false);
 setSearchUsername("");
 }}
 >
 
 </Button>
 </div>
 </DialogContent>
 </Dialog>

 {/* */}
 <Dialog open={showRemovePicker} onOpenChange={setShowRemovePicker}>
 <DialogContent className="w-[90%] max-w-md rounded-lg" showCloseButton={false}>
 <DialogTitle className="text-lg font-semibold mb-4"></DialogTitle>
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
 {member.role === 'admin' ? (ledgerData?.type === 'diet' ? '' : '') : ''}
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
 
 </button>
 </div>
 ))}
 </div>
 <Button
 variant="outline"
 className="w-full mt-3"
 onClick={() => setShowRemovePicker(false)}
 >
 
 </Button>
 </DialogContent>
 </Dialog>

 {/* */}
 <AlertDialog open={showRemoveDialog} onOpenChange={setShowRemoveDialog}>
 <AlertDialogContent>
 <AlertDialogHeader>
 <AlertDialogTitle></AlertDialogTitle>
 <AlertDialogDescription>
 "{memberToRemove?.nickname || ""}" TA 
 </AlertDialogDescription>
 </AlertDialogHeader>
 <AlertDialogFooter>
 <AlertDialogCancel></AlertDialogCancel>
 <AlertDialogAction
 onClick={handleRemoveMember}
 className="hover:opacity-90 text-white"
 style={{ backgroundColor: 'var(--brand-red)' }}
 >
 
 </AlertDialogAction>
 </AlertDialogFooter>
 </AlertDialogContent>
 </AlertDialog>

 {/* */}
 <Dialog open={showExportDialog} onOpenChange={setShowExportDialog}>
 <DialogContent className="w-[90%] max-w-md rounded-2xl p-0" showCloseButton={false}>
 <DialogTitle className="sr-only"></DialogTitle>
 
 {exportStats ? (
 <div className="p-6">
 {/* */}
 <div className="text-center mb-6">
 <h3 className="text-xl font-semibold text-gray-900 mb-2"></h3>
 <p className="text-sm text-gray-600">{exportStats.ledgerName}</p>
 </div>

 {/* */}
 <div className="space-y-3 mb-6">
 {/* */}
 <div className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg">
 <span className="text-sm text-gray-600"></span>
 <span className="text-base font-semibold text-gray-900">{exportStats.totalRecords} </span>
 </div>

 {/* */}
 {exportStats.earliestDate && exportStats.latestDate && (
 <div className="p-3 bg-white border border-gray-200 rounded-lg">
 <div className="text-sm text-gray-600 mb-1"></div>
 <div className="text-sm font-medium text-gray-900">
 {exportStats.earliestDate} {exportStats.latestDate}
 </div>
 </div>
 )}

 {/* */}
 <div className="grid grid-cols-2 gap-3">
 <div className="p-3 bg-white border border-gray-200 rounded-lg">
 <div className="text-xs text-gray-500 mb-1"></div>
 <div className="text-base font-semibold text-green-600">¥{exportStats.totalIncome}</div>
 </div>
 <div className="p-3 bg-white border border-gray-200 rounded-lg">
 <div className="text-xs text-gray-500 mb-1"></div>
 <div className="text-base font-semibold text-red-600">¥{exportStats.totalExpense}</div>
 </div>
 </div>

 {/* */}
 <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
 <div className="flex items-center justify-between">
 <span className="text-sm text-gray-600"></span>
 <span className={`text-lg font-bold ${
 parseFloat(exportStats.balance) >= 0 ? 'text-green-600' : 'text-red-600'
 }`}>
 ¥{exportStats.balance}
 </span>
 </div>
 </div>
 </div>

 {/* */}
 <div className="space-y-2">
 <Button
 onClick={handleExport}
 className="w-full h-12 text-base font-medium text-white rounded-lg"
 style={{ backgroundColor: '#D32F2F' }}
 >
 Excel 
 </Button>
 <Button
 onClick={() => setShowExportDialog(false)}
 variant="outline"
 className="w-full h-12 text-base font-medium rounded-lg border-gray-300 text-gray-700 hover:bg-gray-50"
 >
 
 </Button>
 </div>
 </div>
 ) : (
 <div className="p-6 text-center">
 <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-300 border-t-blue-500 mx-auto mb-4"></div>
 <p className="text-gray-500">...</p>
 </div>
 )}
 </DialogContent>
 </Dialog>

 {/* */}
 <Dialog open={showBackupDialog} onOpenChange={setShowBackupDialog}>
 <DialogContent className="max-w-md mx-auto">
 <DialogTitle className="text-xl font-bold text-center mb-4">
 {backupEditMode ? '' : ''}
 </DialogTitle>
 
 {/* ===== ===== */}
 {!backupEditMode && backupSettings ? (
 <div className="space-y-4">
 {/* */}
 <div className={`flex items-center gap-2 px-4 py-3 rounded-lg ${
 backupSettings.enabled === 1 ? 'bg-green-50 border border-green-200' : 'bg-gray-50 border border-gray-200'
 }`}>
 <div className={`w-2.5 h-2.5 rounded-full ${
 backupSettings.enabled === 1 ? 'bg-green-500 animate-pulse' : 'bg-gray-400'
 }`} />
 <span className={`text-sm font-medium ${
 backupSettings.enabled === 1 ? 'text-green-700' : 'text-gray-500'
 }`}>
 {backupSettings.enabled === 1 ? '' : ''}
 </span>
 </div>

 {/* */}
 <div className="bg-gray-50 rounded-lg border border-gray-200 divide-y divide-gray-200">
 <div className="flex justify-between items-center px-4 py-3">
 <span className="text-sm text-gray-500"></span>
 <span className="text-sm font-medium text-gray-900">{user?.email || ''}</span>
 </div>
 <div className="flex justify-between items-center px-4 py-3">
 <span className="text-sm text-gray-500"></span>
 <span className="text-sm font-medium text-gray-900">{frequencyLabel(backupSettings.frequency)}</span>
 </div>
 <div className="flex justify-between items-center px-4 py-3">
 <span className="text-sm text-gray-500"></span>
 <span className="text-sm font-medium text-gray-900">{formatDate(backupSettings.createdAt)}</span>
 </div>
 <div className="flex justify-between items-center px-4 py-3">
 <span className="text-sm text-gray-500"></span>
 <span className="text-sm font-medium text-gray-900">{backupSettings.backupCount ?? 0} </span>
 </div>
 <div className="flex justify-between items-center px-4 py-3">
 <span className="text-sm text-gray-500"></span>
 <span className="text-sm font-medium text-gray-900">{formatDateTime(backupSettings.lastBackupAt)}</span>
 </div>
 <div className="flex justify-between items-center px-4 py-3">
 <span className="text-sm text-gray-500"></span>
 <span className={`text-sm font-medium ${
 backupSettings.enabled === 1 ? 'text-[#D32F2F]' : 'text-gray-400'
 }`}>
 {backupSettings.enabled === 1 ? formatDateTime(backupSettings.nextBackupAt) : ''}
 </span>
 </div>
 </div>

 {/* */}
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
 
 </Button>
 <Button
 onClick={handleSendTestBackup}
 disabled={sendTestBackupMutation.isPending || !user?.email}
 variant="outline"
 className="w-full h-11 text-sm font-medium rounded-lg border-[#D32F2F] text-[#D32F2F] hover:bg-red-50"
 >
 {sendTestBackupMutation.isPending ? '...' : ''}
 </Button>
 <Button
 onClick={() => setShowBackupDialog(false)}
 variant="outline"
 className="w-full h-11 text-sm font-medium rounded-lg border-gray-300 text-gray-700 hover:bg-gray-50"
 >
 
 </Button>
 </div>
 </div>
 ) : (
 /* ===== ===== */
 <div className="space-y-5">
 {/* */}
 <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
 <div className="text-xs text-gray-500 mb-1"></div>
 <div className="text-sm font-medium text-gray-900">{user?.email || ''}</div>
 </div>

 {/* */}
 <div>
 <label className="block text-xs font-medium text-gray-500 mb-2">
 
 </label>
 <div className="space-y-2">
 {[
 { value: 'weekly' as const, label: '' },
 { value: 'monthly' as const, label: '' },
 { value: 'quarterly' as const, label: '' },
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

 {/* */}
 <div className="flex items-center justify-between bg-gray-50 p-4 rounded-lg border border-gray-200">
 <span className="text-sm font-medium text-gray-700"></span>
 <Switch
 checked={backupEnabled}
 onCheckedChange={setBackupEnabled}
 />
 </div>

 {/* */}
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
 {saveBackupMutation.isPending ? '...' : ''}
 </Button>
 {backupSettings && (
 <Button
 onClick={() => setBackupEditMode(false)}
 variant="outline"
 className="w-full h-11 text-sm font-medium rounded-lg border-gray-300 text-gray-700 hover:bg-gray-50"
 >
 
 </Button>
 )}
 {!backupSettings && (
 <Button
 onClick={() => setShowBackupDialog(false)}
 variant="outline"
 className="w-full h-11 text-sm font-medium rounded-lg border-gray-300 text-gray-700 hover:bg-gray-50"
 >
 
 </Button>
 )}
 </div>
 </div>
 )}
 </DialogContent>
 </Dialog>

 {/* - */}
 <Dialog open={showTransferDialog} onOpenChange={setShowTransferDialog}>
 <DialogContent className="sm:max-w-md">
 <DialogTitle></DialogTitle>
 <div className="mt-2">
 <p className="text-sm text-gray-500 mb-4"></p>
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
 {member.role === 'admin' ? (ledgerData?.type === 'diet' ? '' : '') : ''}
 </div>
 </div>
 {transferTarget?.userId === member.userId && (
 <span className="text-[#D32F2F] text-lg"></span>
 )}
 </div>
 ))}
 {members?.filter(m => m.userId !== user?.id).length === 0 && (
 <div className="text-center text-gray-400 py-6 text-sm"></div>
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
 
 </Button>
 <Button
 className="flex-1 h-11 rounded-lg bg-[#D32F2F] hover:bg-[#B71C1C] text-white"
 disabled={!transferTarget}
 onClick={() => {
 setShowTransferDialog(false);
 setShowTransferWarning(true);
 }}
 >
 
 </Button>
 </div>
 </div>
 </DialogContent>
 </Dialog>

 {/* - */}
 <AlertDialog open={showTransferWarning} onOpenChange={setShowTransferWarning}>
 <AlertDialogContent>
 <AlertDialogHeader>
 <AlertDialogTitle className="text-[#D32F2F] flex items-center gap-2">
 <span className="text-xl"></span> 
 </AlertDialogTitle>
 <AlertDialogDescription asChild>
 <div className="space-y-3">
 <p className="text-sm text-gray-700 font-medium">
 <span className="text-[#D32F2F] font-bold">{transferTarget?.nickname || transferTarget?.username}</span>
 </p>
 <div className="bg-red-50 rounded-lg p-3 space-y-2">
 <p className="text-sm text-[#D32F2F] font-medium"></p>
 <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
 <li></li>
 <li></li>
 <li></li>
 <li></li>
 <li>/</li>
 </ul>
 </div>
 <div className="bg-orange-50 rounded-lg p-3">
 <p className="text-sm text-orange-700 font-medium"> </p>
 <p className="text-xs text-orange-600 mt-1"></p>
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
 
 </AlertDialogCancel>
 <AlertDialogAction
 className="flex-1 h-11 rounded-lg bg-[#D32F2F] hover:bg-[#B71C1C] text-white"
 onClick={handleTransferConfirm}
 disabled={transferOwnershipMutation.isPending}
 >
 {transferOwnershipMutation.isPending ? '...' : ''}
 </AlertDialogAction>
 </AlertDialogFooter>
 </AlertDialogContent>
 </AlertDialog>
 </div>
 );
}

// 
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
 toast.success('');
 } catch {
 // fallback
 const textarea = document.createElement('textarea');
 textarea.value = secretKeyData.secretKey;
 document.body.appendChild(textarea);
 textarea.select();
 document.execCommand('copy');
 document.body.removeChild(textarea);
 toast.success('');
 }
 }
 };

 return (
 <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
 <span className="text-[15px] text-gray-900 shrink-0"></span>
 <div className="flex items-center gap-2 ml-3 min-w-0">
 {showSecretKey && secretKeyData?.secretKey ? (
 <>
 <span className="text-xs font-mono text-gray-500 truncate max-w-[160px]">
 {secretKeyData.secretKey}
 </span>
 <button
 className="p-1 hover:bg-gray-100 rounded transition-colors shrink-0"
 onClick={handleCopy}
 title=""
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
 title={showSecretKey ? "" : ""}
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
