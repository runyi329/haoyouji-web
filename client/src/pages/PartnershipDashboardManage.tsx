import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ChevronLeft, Plus, Trash2, Save } from "lucide-react";
import { toast } from "sonner";

/**
 * 合伙人平台管理页面
 * 用于管理首页数据看板的内容
 */
export default function PartnershipDashboardManage() {
  const [, setLocation] = useLocation();

  // 最新动态管理
  const [activities, setActivities] = useState([
    { user: "张三", action: "记账", time: "2小时前" },
    { user: "李四", action: "更新", time: "5小时前" },
    { user: "王五", action: "记账", time: "1天前" }
  ]);

  // 预警雷达管理
  const [alerts, setAlerts] = useState([
    { type: "warning", message: "有3位伙伴已连续3天未联络新人", action: "建议介入辅导" },
    { type: "info", message: "本周新增2位潜在高级用户", action: "及时跟进" }
  ]);

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

  const handleSave = () => {
    // TODO: 保存到数据库
    toast.success("保存成功！");
  };

  return (
    <div className="min-h-screen bg-[#FAF3ED]">
      {/* 顶部导航栏 */}
      <div className="bg-[#D32F2F] border-b border-[#D32F2F] sticky top-0 z-10">
        <div className="px-3 py-3 flex items-center">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation("/profile")}
            className="text-white hover:bg-white/10 h-8 w-8"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          
          <h1 className="text-lg font-bold text-white absolute left-1/2 transform -translate-x-1/2">
            合伙人平台管理
          </h1>
        </div>
      </div>

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
              <div key={index} className="flex items-center gap-2 p-3 bg-[#FAF3ED] rounded-lg">
                <div className="flex-1 grid grid-cols-3 gap-2">
                  <Input
                    placeholder="用户名"
                    value={activity.user}
                    onChange={(e) => updateActivity(index, "user", e.target.value)}
                    className="text-sm"
                  />
                  <Input
                    placeholder="操作"
                    value={activity.action}
                    onChange={(e) => updateActivity(index, "action", e.target.value)}
                    className="text-sm"
                  />
                  <Input
                    placeholder="时间"
                    value={activity.time}
                    onChange={(e) => updateActivity(index, "time", e.target.value)}
                    className="text-sm"
                  />
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => removeActivity(index)}
                  className="text-red-500 hover:text-red-700 hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
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
          </div>
        </div>

        {/* 保存按钮 */}
        <Button
          onClick={handleSave}
          className="w-full bg-[#D32F2F] hover:bg-[#B71C1C] text-white py-6"
        >
          <Save className="h-5 w-5 mr-2" />
          保存所有修改
        </Button>
      </div>
    </div>
  );
}
