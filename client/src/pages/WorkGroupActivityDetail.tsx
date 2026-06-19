import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { ChevronLeft, Edit, Trash2, Calendar, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function WorkGroupActivityDetail() {
  const [, params] = useRoute("/work-group-member/:memberId/activity/:activityId");
  const [, setLocation] = useLocation();
  
  const memberId = params?.memberId ? parseInt(params.memberId) : 1;
  const activityId = params?.activityId ? parseInt(params.activityId) : 1;
  
  // 固定使用红色主题
  const THEME_PRIMARY = '#D32F2F';
  const THEME_BG = '#FAF3ED';
  
  // 删除确认对话框状态
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  
  // 模拟行为记录详情数据
  const activityData = {
    id: activityId,
    type: "contact",
    title: "联络了李总",
    description: "讨论了项目合作事宜，约定下周见面详谈",
    date: "2024-02-21",
    time: "14:30",
    icon: "📞",
    member: {
      id: memberId,
      name: "张三",
      avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${memberId}`
    },
    // 详细信息
    details: {
      contactPerson: "李总",
      company: "XX科技公司",
      topic: "项目合作",
      result: "约定下周见面详谈",
      notes: "需要准备项目方案和报价单"
    }
  };
  
  // 获取行为类型的中文名称
  const getTypeLabel = (type: string) => {
    const typeMap: Record<string, string> = {
      contact: "联络记录",
      share: "共享记录",
      tag: "标签记录"
    };
    return typeMap[type] || "行为记录";
  };
  
  // 处理删除
  const handleDelete = () => {
    // TODO: 调用API删除记录
    console.log('删除记录:', activityId);
    setShowDeleteDialog(false);
    // 返回成员详情页
    setLocation(`/work-group-member/${memberId}`);
  };
  
  return (
    <div className="min-h-screen bg-[#FAF3ED] flex flex-col">
      {/* 顶部导航栏 */}
      <div className="bg-[#D32F2F] text-white px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <button 
          onClick={() => setLocation(`/work-group-member/${memberId}`)}
          className="p-1 -ml-2"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h1 className="text-lg font-medium">{getTypeLabel(activityData.type)}</h1>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setLocation(`/work-group-member/${memberId}/activity/${activityId}/edit`)}
            className="p-1"
          >
            <Edit className="w-5 h-5" />
          </button>
          <button 
            onClick={() => setShowDeleteDialog(true)}
            className="p-1"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 p-4 space-y-3">
        {/* 基本信息卡片 */}
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <div className="flex items-start gap-3 mb-4">
            <div className="text-3xl">{activityData.icon}</div>
            <div className="flex-1">
              <h2 className="text-lg font-bold text-[#222222] mb-2">
                {activityData.title}
              </h2>
              <div className="flex items-center gap-4 text-sm text-[#757575]">
                <div className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  <span>{activityData.date}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  <span>{activityData.time}</span>
                </div>
              </div>
            </div>
          </div>
          
          {activityData.description && (
            <div className="text-sm text-[#222222] bg-[#FAF3ED] rounded p-3">
              {activityData.description}
            </div>
          )}
        </div>

        {/* 详细信息卡片 */}
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <h3 className="text-base font-bold text-[#222222] mb-3">详细信息</h3>
          <div className="space-y-3">
            {activityData.type === 'contact' && (
              <>
                <div className="flex">
                  <span className="text-sm text-[#757575] w-24 flex-shrink-0">联络对象</span>
                  <span className="text-sm text-[#222222]">{activityData.details.contactPerson}</span>
                </div>
                <div className="flex">
                  <span className="text-sm text-[#757575] w-24 flex-shrink-0">所属公司</span>
                  <span className="text-sm text-[#222222]">{activityData.details.company}</span>
                </div>
                <div className="flex">
                  <span className="text-sm text-[#757575] w-24 flex-shrink-0">沟通主题</span>
                  <span className="text-sm text-[#222222]">{activityData.details.topic}</span>
                </div>
                <div className="flex">
                  <span className="text-sm text-[#757575] w-24 flex-shrink-0">沟通结果</span>
                  <span className="text-sm text-[#222222]">{activityData.details.result}</span>
                </div>
              </>
            )}
            
            {activityData.details.notes && (
              <div className="pt-2 border-t border-gray-100">
                <span className="text-sm text-[#757575] block mb-1">备注</span>
                <p className="text-sm text-[#222222]">{activityData.details.notes}</p>
              </div>
            )}
          </div>
        </div>

        {/* 操作人信息卡片 */}
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <h3 className="text-base font-bold text-[#222222] mb-3">操作人</h3>
          <div className="flex items-center gap-3">
            <img
              src={activityData.member.avatar}
              alt={activityData.member.name}
              className="w-10 h-10 rounded-full border-2 border-[#D32F2F]/10"
            />
            <span className="text-sm text-[#222222]">{activityData.member.name}</span>
          </div>
        </div>
      </div>

      {/* 删除确认对话框 */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>
              确定要删除这条行为记录吗？此操作无法撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
            >
              取消
            </Button>
            <Button
              style={{ backgroundColor: THEME_PRIMARY }}
              onClick={handleDelete}
            >
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
