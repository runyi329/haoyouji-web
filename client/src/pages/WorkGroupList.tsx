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
    companyName: "上海煦斌教育科技合伙企业（有限合伙）",
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
        
        {/* 大容器 - 代表一个工作群 */}
        <Card 
          className="bg-white border-2 border-gray-200 overflow-hidden hover:shadow-xl transition-shadow cursor-pointer"
          onClick={() => setLocation("/work-groups/1")}
        >
          {/* 公司名称头部 */}
          <div className="bg-gradient-to-r from-[#D32F2F] to-[#C62828] px-6 py-4">
            <h2 className="text-lg font-bold text-white text-center">
              {mockData.companyName}
            </h2>
          </div>

          {/* 成员进度区域 - 占据整行 */}
          <div className="px-6 py-6 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-3">
                  <Users className="h-6 w-6 text-[#D32F2F]" />
                  <h3 className="text-xl font-bold text-[#222222]">成员进度</h3>
                </div>
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="text-5xl font-bold text-[#D32F2F]">{mockData.members.current}</span>
                  <span className="text-3xl text-[#757575]">/ {mockData.members.max}</span>
                  <span className="text-lg text-[#757575]">人</span>
                </div>
                <p className="text-base text-[#757575]">
                  还有 <span className="font-semibold text-[#D32F2F]">{mockData.members.max - mockData.members.current}</span> 个空位
                </p>
              </div>
              
              {/* 饼图可视化 */}
              <div className="relative w-36 h-36">
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
                  <span className="text-3xl font-bold text-[#D32F2F]">{mockData.members.percentage}%</span>
                </div>
              </div>
            </div>
          </div>

          {/* 第二行：活跃度 + 收支总览 */}
          <div className="grid grid-cols-2 border-b border-gray-200">
            {/* 活跃度 */}
            <div className="px-6 py-5 border-r border-gray-200">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="h-5 w-5 text-[#4CAF50]" />
                <h3 className="text-lg font-semibold text-[#222222]">活跃度</h3>
              </div>
              <div className="flex items-baseline gap-1 mb-3">
                <span className="text-4xl font-bold text-[#4CAF50]">{mockData.active.count}</span>
                <span className="text-base text-[#757575]">人活跃</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-3 bg-[#E8F5E9] rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-[#4CAF50] rounded-full transition-all"
                    style={{ width: `${mockData.active.rate}%` }}
                  />
                </div>
                <span className="text-sm font-semibold text-[#757575]">{mockData.active.rate}%</span>
              </div>
            </div>

            {/* 收支总览 */}
            <div className="px-6 py-5">
              <div className="flex items-center gap-2 mb-3">
                <DollarSign className="h-5 w-5 text-[#CBA471]" />
                <h3 className="text-lg font-semibold text-[#222222]">收支总览</h3>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[#757575]">本月收入</span>
                  <span className="text-2xl font-bold text-[#4CAF50]">
                    ¥{mockData.finance.income.toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[#757575]">本月支出</span>
                  <span className="text-2xl font-bold text-[#D32F2F]">
                    ¥{mockData.finance.expense.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 第三行：贡献排行 + 本月记账 */}
          <div className="grid grid-cols-2 border-b border-gray-200">
            {/* 贡献排行 */}
            <div className="px-6 py-5 border-r border-gray-200">
              <div className="flex items-center gap-2 mb-3">
                <Award className="h-5 w-5 text-[#CBA471]" />
                <h3 className="text-lg font-semibold text-[#222222]">贡献排行</h3>
              </div>
              <div className="space-y-3">
                {mockData.topContributors.map((contributor, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-7 h-7 rounded-full bg-[#FAF3ED]">
                      <span className="text-sm font-bold text-[#CBA471]">
                        {index + 1}
                      </span>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-[#222222]">{contributor.name}</span>
                        <span className="text-sm font-bold text-[#D32F2F]">{contributor.value}</span>
                      </div>
                      <div className="h-2 bg-[#FFEBEE] rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-[#D32F2F] rounded-full transition-all"
                          style={{ width: `${contributor.value}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 本月记账 */}
            <div className="px-6 py-5">
              <div className="flex items-center gap-2 mb-3">
                <Calendar className="h-5 w-5 text-[#1976D2]" />
                <h3 className="text-lg font-semibold text-[#222222]">本月记账</h3>
              </div>
              <div className="flex flex-col items-center justify-center py-2">
                <div className="relative w-24 h-24 mb-2">
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
                    <span className="text-2xl font-bold text-[#1976D2]">{mockData.recordCount}</span>
                  </div>
                </div>
                <span className="text-sm text-[#757575]">记账次数</span>
              </div>
            </div>
          </div>

          {/* 最新动态区域 - 占据整行 */}
          <div className="px-6 py-5">
            <div className="flex items-center gap-2 mb-4">
              <Activity className="h-5 w-5 text-[#D32F2F]" />
              <h3 className="text-lg font-semibold text-[#222222]">最新动态</h3>
            </div>
            <div className="space-y-3">
              {mockData.recentActivities.map((activity, index) => (
                <div key={index} className="flex items-start gap-3 pb-3 border-b border-gray-100 last:border-0 last:pb-0">
                  <div className="w-2 h-2 rounded-full bg-[#D32F2F] mt-2 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[#222222]">
                      <span className="font-semibold">{activity.user}</span> {activity.action}
                    </p>
                    <p className="text-xs text-[#757575] mt-0.5">{activity.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 底部提示 */}
          <div className="bg-[#FAF3ED] px-6 py-3 text-center border-t border-gray-200">
            <p className="text-sm text-[#757575]">点击查看成员详情 →</p>
          </div>
        </Card>

        {/* 页面底部说明 */}
        <div className="text-center py-6">
          <p className="text-xs text-[#757575]">左右滑动可查看其他工作群</p>
        </div>
      </div>
    </div>
  );
}
