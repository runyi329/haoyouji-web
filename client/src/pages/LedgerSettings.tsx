import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { Switch } from "@/components/ui/switch";
import { ChevronRight, ChevronLeft, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
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

  // 获取账本详情
  const { data: ledgerData, isLoading } = trpc.ledger.getById.useQuery({
    ledgerId,
  });

  // 获取账本成员列表
  const { data: members } = trpc.ledger.getMembers.useQuery({ ledgerId });

  const [shareCategories, setShareCategories] = useState(true);
  const [shareAccounts, setShareAccounts] = useState(true);
  const [recordNotification, setRecordNotification] = useState(false);
  const [requireImage, setRequireImage] = useState(false);
  const [showRemoveDialog, setShowRemoveDialog] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<any>(null);

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
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
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
                <div className="w-16 h-16 rounded-lg bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center text-white text-xl font-medium">
                  {member.nickname?.[0] || "U"}
                </div>
                {member.role === 'owner' && (
                  <div className="absolute -top-1 -left-1 bg-[#ff7f50] text-white text-xs px-1.5 py-0.5 rounded">
                    创建人
                  </div>
                )}
                {/* 移除按钮（只有创建人可以移除其他成员，且不能移除自己） */}
                {ledgerData?.userRole === 'owner' && member.role !== 'owner' && (
                  <button
                    onClick={() => {
                      setMemberToRemove(member);
                      setShowRemoveDialog(true);
                    }}
                    className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <div className="text-sm text-gray-900 mt-1">
                {member.nickname || "用户"}
              </div>
            </div>
          ))}
          
          {/* 邀请按钮 */}
          <button 
            onClick={() => setLocation(`/ledger/${ledgerId}/invite`)}
            className="flex flex-col items-center flex-shrink-0 hover:opacity-80 transition-opacity"
          >
            <div className="w-16 h-16 rounded-lg border-2 border-dashed border-[#ff7f50] flex items-center justify-center">
              <span className="text-3xl text-[#ff7f50]">+</span>
            </div>
            <div className="text-sm text-[#ff7f50] mt-1">邀请伙伴</div>
          </button>
        </div>
      </div>

      {/* 基本设置 */}
      <div className="bg-white mt-3">
        <SettingItem label="账本名称" value={ledgerData.name} />
        <SettingItem label="我在账本的昵称" value={members?.[0]?.nickname || "未设置"} />
        <SettingItem label="账本二维码（邀请伙伴）" showIcon />
        <SettingItem label="定时提醒记账" showIcon />
        <SettingItem 
          label="账本变动通知" 
          rightContent={
            <Switch 
              checked={recordNotification} 
              onCheckedChange={setRecordNotification}
            />
          }
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
        <SettingItem label="记账默认类型" value="默认:支出,显示转账" hasHelp />
        <SettingItem label="首页统计方式" value="自然月统计" />
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
        <SettingItem label="成员记账审批" showIcon hasHelp />
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
        <SettingItem label="账本收入条目" showIcon />
        <SettingItem label="账本支出条目" showIcon />
        <SettingItem 
          label="共享账本资金账户" 
          rightContent={
            <Switch 
              checked={shareAccounts} 
              onCheckedChange={setShareAccounts}
            />
          }
          hasHelp
        />
        <SettingItem label="账本资金账户" showIcon />
      </div>

      {/* 账本管理 */}
      <div className="bg-white mt-3">
        <SettingItem label="账本状态(封账)" value="使用中" />
        <SettingItem label="账本统计" value="0条账目" />
        <SettingItem label="账单搜索" showIcon />
        <SettingItem label="删除账单找回" showIcon />
        <SettingItem label="账本日志" showIcon />
        <SettingItem label="账本图片查看" showIcon />
        <SettingItem label="账本管理员管理" showIcon />
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
        <button className="w-full py-3 bg-white border border-gray-300 rounded-lg text-gray-900 font-medium">
          邀请伙伴加入此账本
        </button>
        <button className="w-full py-3 bg-red-500 text-white rounded-lg font-medium">
          退出账本
        </button>
      </div>

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
              className="bg-red-500 hover:bg-red-600"
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
      className="flex items-center justify-between px-4 py-3 border-b border-gray-100 last:border-b-0 cursor-pointer active:bg-gray-50"
      onClick={onClick}
    >
      <div className="flex items-center gap-2">
        <span className="text-[15px] text-gray-900">{label}</span>
        {isVip && (
          <span className="text-xs font-bold text-orange-500 bg-orange-50 px-1.5 py-0.5 rounded">
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
