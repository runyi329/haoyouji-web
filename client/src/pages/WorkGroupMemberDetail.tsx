import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { ChevronLeft, Plus, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function WorkGroupMemberDetail() {
  const [, params] = useRoute("/work-group-member/:id");
  const [, setLocation] = useLocation();
  
  const memberId = params?.id ? parseInt(params.id) : 1;
  
  // 固定使用红色主题
  const THEME_PRIMARY = '#D32F2F';
  const THEME_BG = '#FAF3ED';
  
  // 模拟成员数据
  const memberData = {
    id: memberId,
    name: "张三",
    avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${memberId}`,
    workGroups: [1, 2],
    joinDate: "2024-01-15",
    connections: 128,
    tags: 45,
    contacts: 89,
    shares: 12
  };
  
  // 模拟行为记录数据（按日期分组）
  const mockActivityData = [
    {
      date: "2024-02-21",
      activities: [
        {
          id: 1,
          type: "contact",
          title: "联络了李总",
          description: "讨论了项目合作事宜，约定下周见面详谈",
          time: "14:30",
          icon: "📞"
        },
        {
          id: 2,
          type: "share",
          title: "共享了人脉资源",
          description: "将王经理介绍给了赵总",
          time: "10:15",
          icon: "🤝"
        }
      ]
    },
    {
      date: "2024-02-20",
      activities: [
        {
          id: 3,
          type: "tag",
          title: "添加了新标签",
          description: "为张经理添加了\u201c金融行业\u201d标签",
          time: "16:45",
          icon: "🏷️"
        },
        {
          id: 4,
          type: "contact",
          title: "联络了刘总",
          description: "跟进上次的合作意向",
          time: "09:20",
          icon: "📞"
        }
      ]
    },
    {
      date: "2024-02-19",
      activities: [
        {
          id: 5,
          type: "share",
          title: "共享了商业信息",
          description: "分享了行业报告给团队成员",
          time: "15:30",
          icon: "🤝"
        }
      ]
    }
  ];
  
  // 计算统计数据（本周）
  const weeklyStats = {
    contacts: 12,
    shares: 8,
    tags: 5
  };
  
  return (
    <div className="min-h-screen bg-[#FAF3ED] flex flex-col">
      {/* 顶部区域 */}
      <div className="pb-4" style={{ backgroundColor: THEME_PRIMARY, color: '#FFFFFF' }}>
        {/* 标题栏 */}
        <div className="px-4 pt-3 pb-2 flex items-center justify-between">
          <button
            onClick={() => setLocation("/work-group-members/1")}
            className="p-1 -ml-2"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h1 className="text-lg font-medium">{memberData.name}</h1>
          <div className="w-6"></div>
        </div>

        {/* 成员信息卡片 */}
        <div className="px-4 py-3">
          <div className="flex items-center gap-3">
            {/* 头像 */}
            <img
              src={memberData.avatar}
              alt={memberData.name}
              className="w-16 h-16 rounded-full border-2 border-white/20"
            />
            
            {/* 基本信息 */}
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-base font-bold">{memberData.name}</span>
                {/* 工作群标签 */}
                <div className="flex gap-1">
                  {memberData.workGroups.map((groupNum) => (
                    <span 
                      key={groupNum}
                      className="px-1.5 py-0.5 text-xs bg-white/20 rounded"
                    >
                      群{groupNum}
                    </span>
                  ))}
                </div>
              </div>
              <div className="text-xs opacity-90">
                加入时间：{memberData.joinDate}
              </div>
            </div>
          </div>
        </div>

        {/* 统计区域 */}
        <div className="px-4 pt-2">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-xs opacity-90">本周联络</div>
              <div className="text-lg font-medium">{weeklyStats.contacts}</div>
            </div>
            <div>
              <div className="text-xs opacity-90">本周共享</div>
              <div className="text-lg font-medium">{weeklyStats.shares}</div>
            </div>
            <div>
              <div className="text-xs opacity-90">本周标签</div>
              <div className="text-lg font-medium">{weeklyStats.tags}</div>
            </div>
          </div>
        </div>
      </div>

      {/* 行为记录列表 */}
      <div className="flex-1 px-4 pb-20 space-y-2 mt-3">
        {mockActivityData.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-gray-400 text-base mb-1">还没有行为记录</div>
            <div className="text-gray-400 text-sm">点击下方"+"按钮添加记录</div>
          </div>
        ) : (
          mockActivityData.map((dayRecord) => {
            // 计算星期
            const date = new Date(dayRecord.date);
            const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
            const dayOfWeek = weekDays[date.getDay()];
            
            return (
              <div key={dayRecord.date}>
                {/* 日期标题 */}
                <div className="flex items-center gap-2 py-2 text-xs text-gray-500">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>
                    {dayRecord.date} {dayOfWeek}
                  </span>
                </div>

                {/* 当天的记录 */}
                <div className="space-y-1.5">
                  {dayRecord.activities.map((activity) => (
                    <div
                      key={activity.id}
                      className="bg-white rounded-lg p-3 cursor-pointer hover:bg-gray-50 transition-colors"
                      onClick={() => setLocation(`/work-group-member/${memberId}/activity/${activity.id}`)}
                    >
                      <div className="flex items-start gap-3">
                        {/* 图标 */}
                        <div className="text-2xl flex-shrink-0">
                          {activity.icon}
                        </div>

                        {/* 内容 */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium text-[#222222]">
                              {activity.title}
                            </span>
                            <span className="text-xs text-gray-400">
                              {activity.time}
                            </span>
                          </div>
                          {activity.description && (
                            <div className="text-xs text-gray-500">
                              {activity.description}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 固定底部中间的添加记录按钮 */}
      <Button
        onClick={() => setLocation(`/work-group-member/${memberId}/add-activity`)}
        className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 h-14 w-14 rounded-full shadow-lg hover:shadow-xl transition-all"
        style={{ backgroundColor: THEME_PRIMARY }}
        size="icon"
      >
        <Plus className="w-6 h-6 text-white" />
      </Button>
    </div>
  );
}
