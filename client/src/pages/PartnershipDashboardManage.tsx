import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ChevronLeft, Plus, Trash2, Save, Loader2, Search, Calendar, X } from "lucide-react";
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
                <span className="font-medium">{member.name || '未命名'}</span>
                {member.email && (
                  <span className="text-xs text-gray-400 ml-auto">@{member.email}</span>
                )}
              </button>
            ))
          ) : (
            <div className="px-3 py-2 text-sm text-gray-400 text-center">
              {searchText ? "未找到匹配成员" : "暂无成员"}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * 合伙人平台管理页面
 * 用于管理首页数据看板的内容（数据持久化到数据库）
 */
export default function PartnershipDashboardManage() {
  const [, setLocation] = useLocation();
  const partnershipId = 1;
  const [isSaving, setIsSaving] = useState(false);

  // 最新动态管理
  const [activities, setActivities] = useState<Array<{ user: string; action: string; time: string }>>([]);
  // 预警雷达管理
  const [alerts, setAlerts] = useState<Array<{ type: string; message: string; action: string }>>([]);

  // 从数据库加载最新动态
  const { data: dbActivities, isLoading: loadingActivities } = trpc.partnership.getDashboardActivities.useQuery({
    partnershipId,
  });

  // 从数据库加载预警雷达
  const { data: dbAlerts, isLoading: loadingAlerts } = trpc.partnership.getDashboardAlerts.useQuery({
    partnershipId,
  });

  // 保存最新动态
  const saveActivitiesMutation = trpc.partnership.saveDashboardActivities.useMutation();

  // 保存预警雷达
  const saveAlertsMutation = trpc.partnership.saveDashboardAlerts.useMutation();

  // 数据库数据加载后同步到本地状态
  useEffect(() => {
    if (dbActivities) {
      setActivities(dbActivities.map(a => ({
        user: a.userName,
        action: a.action,
        time: a.timeText,
      })));
    }
  }, [dbActivities]);

  useEffect(() => {
    if (dbAlerts) {
      setAlerts(dbAlerts.map(a => ({
        type: a.type,
        message: a.message,
        action: a.actionText,
      })));
    }
  }, [dbAlerts]);

  const addActivity = () => {
    setActivities([...activities, { user: "", action: "", time: "" }]);
  };

  const removeActivity = (index: number) => {
    setActivities(activities.filter((_, i) => i !== index));
  };

  const updateActivity = (index: number, field: string, value: string) => {
    const newActivities = [...activities];
    newActivities[index] = { ...newActivities[index], [field]: value };
    setActivities(newActivities);
  };

  const addAlert = () => {
    setAlerts([...alerts, { type: "info", message: "", action: "" }]);
  };

  const removeAlert = (index: number) => {
    setAlerts(alerts.filter((_, i) => i !== index));
  };

  const updateAlert = (index: number, field: string, value: string) => {
    const newAlerts = [...alerts];
    newAlerts[index] = { ...newAlerts[index], [field]: value };
    setAlerts(newAlerts);
  };

  const handleSave = async () => {
    if (isSaving) return;
    setIsSaving(true);

    try {
      // 同时保存动态和预警
      await Promise.all([
        saveActivitiesMutation.mutateAsync({
          partnershipId,
          activities: activities.map(a => ({
            userName: a.user,
            action: a.action,
            timeText: a.time,
          })),
        }),
        saveAlertsMutation.mutateAsync({
          partnershipId,
          alerts: alerts.map(a => ({
            type: a.type,
            message: a.message,
            actionText: a.action,
          })),
        }),
      ]);

      toast.success("保存成功！");
    } catch (error: any) {
      toast.error("保存失败：" + (error?.message || "未知错误"));
    } finally {
      setIsSaving(false);
    }
  };

  // 格式化日期为 M月D日
  const formatDateDisplay = (dateStr: string) => {
    if (!dateStr) return "";
    // 如果已经是中文格式，直接返回
    if (dateStr.includes("月")) return dateStr;
    // 尝试解析日期
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return `${date.getMonth() + 1}月${date.getDate()}日`;
  };

  const isLoading = loadingActivities || loadingAlerts;

  return (
    <div className="min-h-screen bg-[#FAF3ED]">
      {/* 顶部导航栏 */}
      <div className="bg-[#D32F2F] border-b border-[#D32F2F] sticky top-0 z-10">
        <div className="px-3 py-3 flex items-center">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation("/admin")}
            className="text-white hover:bg-white/10 h-8 w-8"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          
          <h1 className="text-lg font-bold text-white absolute left-1/2 transform -translate-x-1/2">
            合伙人平台管理
          </h1>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-[#D32F2F]" />
          <span className="ml-2 text-[#757575]">加载中...</span>
        </div>
      ) : (
        <div className="p-4 space-y-4">
          {/* 最新动态管理 */}
          <div className="bg-white rounded-2xl shadow-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold text-[#222222]">最新动态</h2>
              <Button
                size="sm"
                onClick={addActivity}
                className="bg-[#D32F2F] hover:bg-[#B71C1C]"
              >
                <Plus className="h-4 w-4 mr-1" />
                添加
              </Button>
            </div>

            <div className="space-y-3">
              {activities.map((activity, index) => (
                <div key={index} className="p-3 bg-[#FAF3ED] rounded-lg space-y-2">
                  {/* 第一行：用户名搜索 + 日期选择 + 删除 */}
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <UserSearchSelect
                        value={activity.user}
                        onChange={(val) => updateActivity(index, "user", val)}
                        partnershipId={partnershipId}
                      />
                    </div>
                    <div className="relative flex-shrink-0">
                      <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
                      <input
                        type="date"
                        value={activity.time && !activity.time.includes("月") ? activity.time : ""}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val) {
                            updateActivity(index, "time", formatDateDisplay(val));
                          } else {
                            updateActivity(index, "time", "");
                          }
                        }}
                        className="w-[120px] pl-7 pr-2 py-1.5 border border-gray-300 rounded-md text-sm bg-white"
                        placeholder="选填"
                      />
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => removeActivity(index)}
                      className="text-red-500 hover:text-red-700 hover:bg-red-50 flex-shrink-0"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  {/* 时间提示 */}
                  <div className="flex items-center gap-1 px-1">
                    <span className="text-xs text-gray-400">
                      {activity.time ? `显示时间：${activity.time}` : "未选择日期，将显示发布时间"}
                    </span>
                  </div>
                  {/* 第二行：事件内容（支持emoji） */}
                  <Textarea
                    placeholder="输入事件内容，支持emoji表情 🎉📊✅..."
                    value={activity.action}
                    onChange={(e) => updateActivity(index, "action", e.target.value)}
                    className="text-sm min-h-[60px] resize-none"
                    rows={2}
                  />
                </div>
              ))}
              {activities.length === 0 && (
                <p className="text-center text-[#757575] text-sm py-4">暂无动态，点击"添加"按钮创建</p>
              )}
            </div>
          </div>

          {/* 预警雷达管理 */}
          <div className="bg-white rounded-2xl shadow-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold text-[#222222]">预警雷达</h2>
              <Button
                size="sm"
                onClick={addAlert}
                className="bg-[#D32F2F] hover:bg-[#B71C1C]"
              >
                <Plus className="h-4 w-4 mr-1" />
                添加
              </Button>
            </div>

            <div className="space-y-3">
              {alerts.map((alert, index) => (
                <div key={index} className="p-3 bg-[#FAF3ED] rounded-lg space-y-2">
                  <div className="flex items-center gap-2">
                    <select
                      value={alert.type}
                      onChange={(e) => updateAlert(index, "type", e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded-md text-sm"
                    >
                      <option value="warning">警告</option>
                      <option value="info">信息</option>
                    </select>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => removeAlert(index)}
                      className="text-red-500 hover:text-red-700 hover:bg-red-50 ml-auto"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <Textarea
                    placeholder="预警消息"
                    value={alert.message}
                    onChange={(e) => updateAlert(index, "message", e.target.value)}
                    className="text-sm"
                    rows={2}
                  />
                  <Input
                    placeholder="建议操作"
                    value={alert.action}
                    onChange={(e) => updateAlert(index, "action", e.target.value)}
                    className="text-sm"
                  />
                </div>
              ))}
              {alerts.length === 0 && (
                <p className="text-center text-[#757575] text-sm py-4">暂无预警，点击"添加"按钮创建</p>
              )}
            </div>
          </div>

          {/* 保存按钮 */}
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="w-full bg-[#D32F2F] hover:bg-[#B71C1C] text-white py-6"
          >
            {isSaving ? (
              <>
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                保存中...
              </>
            ) : (
              <>
                <Save className="h-5 w-5 mr-2" />
                保存所有修改
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
