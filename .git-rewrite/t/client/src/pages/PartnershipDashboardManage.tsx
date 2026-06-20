import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, Plus, Trash2, Save, Loader2, Search, Calendar, X, Check } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

/**
 * 用户搜索选择组件
 */
function UserSearchSelect({ 
  value, 
  onChange, 
  partnershipId 
}: { 
  value: string; 
  onChange: (val: string) => void; 
  partnershipId: number;
}) {
  const [searchText, setSearchText] = useState(value);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 获取企业成员列表
  const { data: members = [] } = trpc.partnership.getMembers.useQuery(
    { partnershipId },
    { enabled: true }
  );

  // 过滤匹配的成员
  const filteredMembers = members.filter(m => {
    const keyword = searchText.toLowerCase();
    return (
      (m.name || '').toLowerCase().includes(keyword) ||
      (m.email || '').toLowerCase().includes(keyword)
    );
  });

  useEffect(() => {
    setSearchText(value);
  }, [value]);

  // 点击外部关闭下拉
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
        <Input
          placeholder="搜索成员..."
          value={searchText}
          onChange={(e) => {
            setSearchText(e.target.value);
            setShowDropdown(true);
          }}
          onFocus={() => setShowDropdown(true)}
          className="text-sm pl-7 pr-7"
        />
        {searchText && (
          <button
            onClick={() => {
              setSearchText("");
              onChange("");
              setShowDropdown(false);
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2"
          >
            <X className="h-3.5 w-3.5 text-gray-400" />
          </button>
        )}
      </div>
      {showDropdown && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 max-h-40 overflow-y-auto">
          {filteredMembers.length > 0 ? (
            filteredMembers.map((member) => (
              <button
                key={member.id}
                className="w-full px-3 py-2 text-left text-sm hover:bg-[#FAF3ED] flex items-center gap-2 transition-colors"
                onClick={() => {
                  const displayName = member.name || member.email || `用户${member.id}`;
                  setSearchText(displayName);
                  onChange(displayName);
                  setShowDropdown(false);
                }}
              >
                <img
                  src={member.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${member.id}`}
                  alt=""
                  className="w-6 h-6 rounded-full"
                />
                <span className="font-medium text-[#222222]">{member.name || member.email}</span>
              </button>
            ))
          ) : (
            <div className="px-3 py-2 text-sm text-gray-400">未找到匹配成员</div>
          )}
        </div>
      )}
    </div>
  );
}

export default function PartnershipDashboardManage() {
  const [, navigate] = useLocation();
  const partnershipId = 1;

  // 获取现有数据
  const { data: existingActivities = [], refetch: refetchActivities } = trpc.partnership.getDashboardActivities.useQuery({ partnershipId });
  const { data: existingAlerts = [], refetch: refetchAlerts } = trpc.partnership.getDashboardAlerts.useQuery({ partnershipId });

  // 保存单条动态的mutation
  const saveActivityMutation = trpc.partnership.saveDashboardActivities.useMutation();
  
  // 保存单条预警的mutation
  const saveAlertMutation = trpc.partnership.saveDashboardAlerts.useMutation();

  // 删除动态
  const handleDeleteActivity = async (activityId: number) => {
    try {
      // 过滤掉要删除的动态
      const remainingActivities = existingActivities.filter(a => a.id !== activityId);
      await saveActivityMutation.mutateAsync({
        partnershipId,
        activities: remainingActivities.map(a => ({
          userName: a.userName,
          action: a.action,
          timeText: a.timeText,
        })),
      });
      await refetchActivities();
      toast.success("删除成功");
    } catch (error) {
      toast.error("删除失败");
    }
  };

  // 保存单条动态
  const handleSaveActivity = async (activity: { userName: string; action: string; timeText: string; rawDate?: string }) => {
    if (!activity.userName || !activity.action) {
      toast.error("请填写完整信息");
      return;
    }

    try {
      // 获取所有现有动态，加上当前这条
      const allActivities = [
        ...existingActivities.map(a => ({
          userName: a.userName,
          action: a.action,
          timeText: a.timeText,
        })),
        {
          userName: activity.userName,
          action: activity.action,
          timeText: activity.timeText,
        }
      ];

      await saveActivityMutation.mutateAsync({
        partnershipId,
        activities: allActivities,
      });
      
      await refetchActivities();
      toast.success("保存成功");
    } catch (error) {
      toast.error("保存失败");
    }
  };

  // 删除预警
  const handleDeleteAlert = async (alertId: number) => {
    try {
      const remainingAlerts = existingAlerts.filter(a => a.id !== alertId);
      await saveAlertMutation.mutateAsync({
        partnershipId,
        alerts: remainingAlerts.map(a => ({
          type: a.type,
          message: a.message,
          actionText: a.actionText,
        })),
      });
      await refetchAlerts();
      toast.success("删除成功");
    } catch (error) {
      toast.error("删除失败");
    }
  };

  // 保存单条预警
  const handleSaveAlert = async (alert: { type: string; message: string; actionText: string }) => {
    if (!alert.message) {
      toast.error("请填写预警信息");
      return;
    }

    try {
      const allAlerts = [
        ...existingAlerts.map(a => ({
          type: a.type,
          message: a.message,
          actionText: a.actionText,
        })),
        {
          type: alert.type,
          message: alert.message,
          actionText: alert.actionText,
        }
      ];

      await saveAlertMutation.mutateAsync({
        partnershipId,
        alerts: allAlerts,
      });
      
      await refetchAlerts();
      toast.success("保存成功");
    } catch (error) {
      toast.error("保存失败");
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF3ED]">
      {/* 顶部导航栏 */}
      <div className="bg-[#B85C38] text-white p-4 flex items-center justify-between sticky top-0 z-10">
        <button onClick={() => navigate("/admin")} className="p-1">
          <ChevronLeft className="h-6 w-6" />
        </button>
        <h1 className="text-lg font-bold">合伙人平台管理</h1>
        <div className="w-8" />
      </div>

      <div className="p-4 space-y-4 pb-20">
        {/* 最新动态管理 */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold text-[#222222]">最新动态</h2>
            <NewActivityForm onSave={handleSaveActivity} partnershipId={partnershipId} />
          </div>
          
          {existingActivities.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">
              暂无动态，点击"添加"按钮创建
            </div>
          ) : (
            <div className="space-y-2">
              {existingActivities.map((activity) => (
                <ActivityItem
                  key={activity.id}
                  activity={activity}
                  onDelete={() => handleDeleteActivity(activity.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* 预警雷达管理 */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold text-[#222222]">预警雷达</h2>
            <NewAlertForm onSave={handleSaveAlert} />
          </div>
          
          {existingAlerts.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">
              暂无预警，点击"添加"按钮创建
            </div>
          ) : (
            <div className="space-y-2">
              {existingAlerts.map((alert) => (
                <AlertItem
                  key={alert.id}
                  alert={alert}
                  onDelete={() => handleDeleteAlert(alert.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// 新增动态表单组件
function NewActivityForm({ onSave, partnershipId }: { onSave: (activity: any) => Promise<void>; partnershipId: number }) {
  const [isOpen, setIsOpen] = useState(false);
  const [userName, setUserName] = useState("");
  const [action, setAction] = useState("");
  const [rawDate, setRawDate] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (isSaving) return;
    setIsSaving(true);
    
    const timeText = rawDate 
      ? `${new Date(rawDate).getMonth() + 1}月${new Date(rawDate).getDate()}日`
      : "";

    await onSave({ userName, action, timeText, rawDate });
    
    // 重置表单
    setUserName("");
    setAction("");
    setRawDate("");
    setIsOpen(false);
    setIsSaving(false);
  };

  if (!isOpen) {
    return (
      <Button
        onClick={() => setIsOpen(true)}
        className="bg-[#B85C38] hover:bg-[#A04D2F] text-white text-sm"
        size="sm"
      >
        <Plus className="h-4 w-4 mr-1" />
        添加
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-4 w-full max-w-md space-y-3">
        <h3 className="text-base font-bold text-[#222222]">添加最新动态</h3>
        
        <div className="space-y-2">
          <label className="text-sm text-gray-600">用户名</label>
          <UserSearchSelect
            value={userName}
            onChange={setUserName}
            partnershipId={partnershipId}
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm text-gray-600">日期（选填）</label>
          <Input
            type="date"
            value={rawDate}
            onChange={(e) => setRawDate(e.target.value)}
            className="text-sm"
          />
          {rawDate && (
            <p className="text-xs text-gray-400">
              显示时间：{new Date(rawDate).getMonth() + 1}月{new Date(rawDate).getDate()}日
            </p>
          )}
        </div>

        <div className="space-y-2">
          <label className="text-sm text-gray-600">事件内容</label>
          <Textarea
            placeholder="输入事件内容，支持emoji表情 🎉📊✅..."
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="text-sm min-h-[80px]"
          />
        </div>

        <div className="flex gap-2">
          <Button
            onClick={() => setIsOpen(false)}
            variant="outline"
            className="flex-1"
            disabled={isSaving}
          >
            取消
          </Button>
          <Button
            onClick={handleSave}
            className="flex-1 bg-[#B85C38] hover:bg-[#A04D2F] text-white"
            disabled={isSaving}
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}
            保存
          </Button>
        </div>
      </div>
    </div>
  );
}

// 动态条目组件
function ActivityItem({ activity, onDelete }: { activity: any; onDelete: () => void }) {
  return (
    <div className="bg-[#FAF3ED] rounded-lg p-3 flex items-start justify-between gap-2">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium text-[#222222]">{activity.userName}</span>
          <span className="text-gray-600">{activity.action}</span>
        </div>
        <div className="text-xs text-gray-400 mt-1">{activity.timeText}</div>
      </div>
      <button
        onClick={onDelete}
        className="text-red-500 hover:text-red-600 p-1"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

// 新增预警表单组件
function NewAlertForm({ onSave }: { onSave: (alert: any) => Promise<void> }) {
  const [isOpen, setIsOpen] = useState(false);
  const [type, setType] = useState("warning");
  const [message, setMessage] = useState("");
  const [actionText, setActionText] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (isSaving) return;
    setIsSaving(true);
    
    await onSave({ type, message, actionText });
    
    setType("warning");
    setMessage("");
    setActionText("");
    setIsOpen(false);
    setIsSaving(false);
  };

  if (!isOpen) {
    return (
      <Button
        onClick={() => setIsOpen(true)}
        className="bg-[#B85C38] hover:bg-[#A04D2F] text-white text-sm"
        size="sm"
      >
        <Plus className="h-4 w-4 mr-1" />
        添加
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-4 w-full max-w-md space-y-3">
        <h3 className="text-base font-bold text-[#222222]">添加预警信息</h3>
        
        <div className="space-y-2">
          <label className="text-sm text-gray-600">预警类型</label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="warning">警告</SelectItem>
              <SelectItem value="info">信息</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className="text-sm text-gray-600">预警信息</label>
          <Textarea
            placeholder="输入预警信息..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="text-sm min-h-[60px]"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm text-gray-600">建议操作（选填）</label>
          <Input
            placeholder="例如：建议介入辅导"
            value={actionText}
            onChange={(e) => setActionText(e.target.value)}
            className="text-sm"
          />
        </div>

        <div className="flex gap-2">
          <Button
            onClick={() => setIsOpen(false)}
            variant="outline"
            className="flex-1"
            disabled={isSaving}
          >
            取消
          </Button>
          <Button
            onClick={handleSave}
            className="flex-1 bg-[#B85C38] hover:bg-[#A04D2F] text-white"
            disabled={isSaving}
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}
            保存
          </Button>
        </div>
      </div>
    </div>
  );
}

// 预警条目组件
function AlertItem({ alert, onDelete }: { alert: any; onDelete: () => void }) {
  return (
    <div className="bg-[#FAF3ED] rounded-lg p-3 flex items-start justify-between gap-2">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className={`text-xs px-2 py-0.5 rounded ${
            alert.type === 'warning' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'
          }`}>
            {alert.type === 'warning' ? '警告' : '信息'}
          </span>
        </div>
        <div className="text-sm text-[#222222]">{alert.message}</div>
        {alert.actionText && (
          <div className="text-xs text-gray-500 mt-1">{alert.actionText}</div>
        )}
      </div>
      <button
        onClick={onDelete}
        className="text-red-500 hover:text-red-600 p-1"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
