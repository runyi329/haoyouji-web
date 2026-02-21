import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChevronLeft, Users, TrendingUp, DollarSign, Award, Calendar, Activity } from "lucide-react";

/**
 * 脉动节点合作平台 - 数据看板首页
 */
export default function WorkGroupList() {
  const [, setLocation] = useLocation();

  // 模拟数据
  const mockData = {
    groupName: "脉动节点合作平台",
    createdAt: "2024-01-15",
    members: {
      current: 5,
      max: 20,
      percentage: 25
    },
    active: {
      count: 8,
      rate: 40
    },
    finance: {
      income: 12580,
      expense: 8340
    },
    topContributors: [
      { name: "张三", value: 85 },
      { name: "李四", value: 72 },
      { name: "王五", value: 68 }
    ],
    recordCount: 128,
    todos: 3,
    recentActivities: [
      { user: "张三", action: "记账", time: "2小时前" },
      { user: "李四", action: "更新", time: "5小时前" },
      { user: "王五", action: "记账", time: "1天前" }
    ]
  };

  return (
    <div className="min-h-screen bg-[#FAF3ED]">
      {/* 顶部导航栏 */}
      <div className="bg-[#D32F2F] border-b border-[#D32F2F] sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLocation("/profile")}
              className="text-white hover:bg-white/10"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold text-white">{mockData.groupName}</h1>
              <p className="text-xs text-white/80">创建于 {mockData.createdAt}</p>
            </div>
          </div>
        </div>
      </div>

      {/* 数据看板主内容区 */}
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* 数据卡片网格 - 2行3列 */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          
          {/* 卡片1: 成员进度 - 占2列 */}
          <Card 
            className="col-span-2 p-6 bg-white border border-gray-200 hover:shadow-lg transition-shadow cursor-pointer"
            onClick={() => setLocation("/work-groups/1")}
          >
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <Users className="h-5 w-5 text-[#D32F2F]" />
                  <h3 className="text-lg font-semibold text-[#222222]">成员进度</h3>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-bold text-[#D32F2F]">{mockData.members.current}</span>
                  <span className="text-2xl text-[#757575]">/ {mockData.members.max}</span>
                  <span className="text-sm text-[#757575]">人</span>
                </div>
                <p className="text-sm text-[#757575] mt-1">
                  还有 {mockData.members.max - mockData.members.current} 个空位
                </p>
              </div>
              
              {/* 饼图可视化 */}
              <div className="relative w-32 h-32">
                <svg viewBox="0 0 100 100" className="transform -rotate-90">
                  {/* 背景圆环 */}
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="none"
                    stroke="#FFEBEE"
                    strokeWidth="20"
                  />
                  {/* 进度圆环 */}
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="none"
                    stroke="#D32F2F"
                    strokeWidth="20"
                    strokeDasharray={`${mockData.members.percentage * 2.51} 251`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-2xl font-bold text-[#D32F2F]">{mockData.members.percentage}%</span>
                </div>
              </div>
            </div>
          </Card>

          {/* 卡片2: 活跃度 */}
          <Card 
            className="p-5 bg-white border border-gray-200 hover:shadow-lg transition-shadow cursor-pointer"
            onClick={() => setLocation("/work-groups/1")}
          >
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="h-5 w-5 text-[#4CAF50]" />
              <h3 className="text-base font-semibold text-[#222222]">活跃度</h3>
            </div>
            <div className="flex items-baseline gap-1 mb-2">
              <span className="text-3xl font-bold text-[#4CAF50]">{mockData.active.count}</span>
              <span className="text-sm text-[#757575]">人活跃</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-2 bg-[#E8F5E9] rounded-full overflow-hidden">
                <div 
                  className="h-full bg-[#4CAF50] rounded-full"
                  style={{ width: `${mockData.active.rate}%` }}
                />
              </div>
              <span className="text-xs text-[#757575]">{mockData.active.rate}%</span>
            </div>
          </Card>

          {/* 卡片3: 收支总览 */}
          <Card 
            className="p-5 bg-white border border-gray-200 hover:shadow-lg transition-shadow cursor-pointer"
            onClick={() => setLocation("/work-groups/1")}
          >
            <div className="flex items-center gap-2 mb-3">
              <DollarSign className="h-5 w-5 text-[#CBA471]" />
              <h3 className="text-base font-semibold text-[#222222]">收支总览</h3>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#757575]">收入</span>
                <span className="text-lg font-bold text-[#4CAF50]">
                  ¥{mockData.finance.income.toLocaleString()}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#757575]">支出</span>
                <span className="text-lg font-bold text-[#D32F2F]">
                  ¥{mockData.finance.expense.toLocaleString()}
                </span>
              </div>
            </div>
          </Card>

          {/* 卡片4: 贡献排行 */}
          <Card 
            className="p-5 bg-white border border-gray-200 hover:shadow-lg transition-shadow cursor-pointer"
            onClick={() => setLocation("/work-groups/1")}
          >
            <div className="flex items-center gap-2 mb-3">
              <Award className="h-5 w-5 text-[#CBA471]" />
              <h3 className="text-base font-semibold text-[#222222]">贡献排行</h3>
            </div>
            <div className="space-y-2">
              {mockData.topContributors.map((contributor, index) => (
                <div key={index} className="flex items-center gap-2">
                  <span className="text-xs font-bold text-[#CBA471] w-4">
                    {index + 1}
                  </span>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-[#222222]">{contributor.name}</span>
                      <span className="text-xs font-semibold text-[#D32F2F]">{contributor.value}</span>
                    </div>
                    <div className="h-1.5 bg-[#FFEBEE] rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-[#D32F2F] rounded-full"
                        style={{ width: `${contributor.value}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* 卡片5: 本月记账 */}
          <Card 
            className="p-5 bg-white border border-gray-200 hover:shadow-lg transition-shadow cursor-pointer"
            onClick={() => setLocation("/work-groups/1")}
          >
            <div className="flex items-center gap-2 mb-3">
              <Calendar className="h-5 w-5 text-[#1976D2]" />
              <h3 className="text-base font-semibold text-[#222222]">本月记账</h3>
            </div>
            <div className="flex flex-col items-center justify-center py-2">
              <div className="relative w-20 h-20 mb-2">
                <svg viewBox="0 0 100 100" className="transform -rotate-90">
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="none"
                    stroke="#E3F2FD"
                    strokeWidth="12"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="none"
                    stroke="#1976D2"
                    strokeWidth="12"
                    strokeDasharray="180 251"
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-xl font-bold text-[#1976D2]">{mockData.recordCount}</span>
                </div>
              </div>
              <span className="text-xs text-[#757575]">记账次数</span>
            </div>
          </Card>

          {/* 卡片6: 最新动态 */}
          <Card 
            className="p-5 bg-white border border-gray-200 hover:shadow-lg transition-shadow cursor-pointer"
            onClick={() => setLocation("/work-groups/1")}
          >
            <div className="flex items-center gap-2 mb-3">
              <Activity className="h-5 w-5 text-[#D32F2F]" />
              <h3 className="text-base font-semibold text-[#222222]">最新动态</h3>
            </div>
            <div className="space-y-2">
              {mockData.recentActivities.map((activity, index) => (
                <div key={index} className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#D32F2F] mt-1.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-[#222222] truncate">
                      <span className="font-semibold">{activity.user}</span> {activity.action}
                    </p>
                    <p className="text-xs text-[#757575]">{activity.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>

        </div>

        {/* 底部提示 */}
        <div className="text-center py-4">
          <p className="text-sm text-[#757575]">点击任意卡片查看详细信息</p>
        </div>
      </div>
    </div>
  );
}
