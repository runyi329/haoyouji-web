import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";

/**
 * 脉动节点合作平台 - 数据看板首页
 */
export default function WorkGroupList() {
  const [, setLocation] = useLocation();

  // 计算运行天数
  const startDate = new Date('2026-02-08');
  const today = new Date();
  const runningDays = Math.floor((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

  // 模拟数据
  const mockData = {
    companyName: "上海煦斌教育科技合伙企业（有限合伙）",
    groupName: "脉动节点合作平台",
    startDate: "2026年2月8日",
    today: today.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }),
    runningDays: runningDays,
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
    <div className="min-h-screen bg-[#FAF3ED] flex flex-col">
      {/* 顶部导航栏 */}
      <div className="bg-[#D32F2F] border-b border-[#D32F2F] sticky top-0 z-10">
        <div className="px-3 py-3 flex items-center justify-between">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation("/profile")}
            className="text-white hover:bg-white/10 h-8 w-8"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          
          <h1 className="text-lg font-bold text-white absolute left-1/2 transform -translate-x-1/2">
            {mockData.groupName}
          </h1>
          
          <div className="w-8" />
        </div>
      </div>

      {/* 数据看板主内容区 */}
      <div className="flex-1 px-4 py-4 overflow-hidden">
        
        {/* 工作群卡片 */}
        <div 
          className="bg-white rounded-2xl shadow-lg hover:shadow-xl transition-shadow cursor-pointer overflow-hidden border border-gray-100"
          onClick={() => setLocation("/work-groups/1")}
        >
          {/* 公司名称头部 */}
          <div className="px-4 py-2.5 border-b border-gray-200 bg-gradient-to-b from-white to-gray-50">
            <h2 className="text-sm font-bold text-[#222222] text-center leading-tight">
              {mockData.companyName}
            </h2>
          </div>

          {/* 第一行：成员人数 + 预留区 + 时间 */}
          <div className="grid grid-cols-3 px-4 py-2.5 border-b border-gray-200">
            
            {/* 1/3: 合伙人数 - 最左边 */}
            <div className="border-r border-gray-200 pr-2">
              <h3 className="text-xs font-bold text-[#222222] mb-1">合伙人数</h3>
              <div className="flex items-center justify-between">
                <div className="flex items-baseline gap-0.5">
                  <span className="text-xs text-[#757575]">{mockData.members.max}</span>
                  <span className="text-xs text-[#757575]">-</span>
                  <span className="text-xl font-bold text-[#D32F2F]">{mockData.members.current}</span>
                  <span className="text-xs text-[#757575]">人</span>
                </div>
                
                {/* 饼图 */}
                <div className="relative w-12 h-12">
                  <svg viewBox="0 0 100 100" className="transform -rotate-90">
                    <circle cx="50" cy="50" r="45" fill="none" stroke="#FFEBEE" strokeWidth="10" />
                    <circle
                      cx="50" cy="50" r="45" fill="none" stroke="#D32F2F" strokeWidth="10"
                      strokeDasharray={`${mockData.members.percentage * 2.83} 283`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-xs font-bold text-[#D32F2F]">{mockData.members.percentage}%</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 2/3: 预留区 */}
            <div className="border-r border-gray-200 px-2">
              {/* 预留给未来功能 */}
            </div>

            {/* 3/3: 时间 - 最右边 */}
            <div className="pl-2">
              <h3 className="text-xs font-bold text-[#222222] mb-1">时间</h3>
              <div className="space-y-1">
                {/* 突出运行天数 */}
                <div className="flex items-baseline gap-1">
                  <span className="text-xs text-[#757575]">运行</span>
                  <span className="text-xl font-bold text-[#D32F2F]">{mockData.runningDays}</span>
                  <span className="text-xs text-[#757575]">天</span>
                </div>
                {/* 启动日期 */}
                <div className="text-xs text-[#757575]">
                  启动 {mockData.startDate}
                </div>
              </div>
            </div>
          </div>

          {/* 第二行：活跃度 + 收支总览 */}
          <div className="grid grid-cols-2 border-b border-gray-200">
            {/* 活跃度 */}
            <div className="px-4 py-2.5 border-r border-gray-200">
              <h3 className="text-xs font-bold text-[#222222] mb-1.5">活跃度</h3>
              <div className="flex items-baseline gap-1 mb-1.5">
                <span className="text-xl font-bold text-[#4CAF50]">{mockData.active.count}</span>
                <span className="text-xs text-[#757575]">人活跃</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="flex-1 h-1.5 bg-[#E8F5E9] rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-[#4CAF50] rounded-full transition-all"
                    style={{ width: `${mockData.active.rate}%` }}
                  />
                </div>
                <span className="text-xs font-semibold text-[#757575]">{mockData.active.rate}%</span>
              </div>
            </div>

            {/* 收支总览 */}
            <div className="px-4 py-2.5">
              <h3 className="text-xs font-bold text-[#222222] mb-1.5">收支总览</h3>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[#757575]">收入</span>
                  <span className="text-xl font-bold text-[#4CAF50]">
                    ¥{mockData.finance.income.toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[#757575]">支出</span>
                  <span className="text-xl font-bold text-[#D32F2F]">
                    ¥{mockData.finance.expense.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 第三行：贡献排行 + 本月记账 */}
          <div className="grid grid-cols-2 border-b border-gray-200">
            {/* 贡献排行 */}
            <div className="px-4 py-2.5 border-r border-gray-200">
              <h3 className="text-xs font-bold text-[#222222] mb-1.5">贡献排行</h3>
              <div className="space-y-1">
                {mockData.topContributors.map((contributor, index) => (
                  <div key={index} className="flex items-center gap-1.5">
                    <div className="flex items-center justify-center w-4 h-4 rounded-full bg-[#FAF3ED]">
                      <span className="text-xs font-bold text-[#CBA471]">{index + 1}</span>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-xs font-medium text-[#222222]">{contributor.name}</span>
                        <span className="text-xs font-bold text-[#D32F2F]">{contributor.value}</span>
                      </div>
                      <div className="h-1 bg-[#FFEBEE] rounded-full overflow-hidden">
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
            <div className="px-4 py-2.5">
              <h3 className="text-xs font-bold text-[#222222] mb-1.5">本月记账</h3>
              <div className="flex flex-col items-center justify-center">
                <div className="relative w-10 h-10 mb-1">
                  <svg viewBox="0 0 100 100" className="transform -rotate-90">
                    <circle cx="50" cy="50" r="45" fill="none" stroke="#E3F2FD" strokeWidth="8" />
                    <circle
                      cx="50" cy="50" r="45" fill="none" stroke="#1976D2" strokeWidth="8"
                      strokeDasharray="200 283" strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-xs font-bold text-[#1976D2]">{mockData.recordCount}</span>
                  </div>
                </div>
                <span className="text-xs text-[#757575]">记账次数</span>
              </div>
            </div>
          </div>

          {/* 最新动态区域 */}
          <div className="px-4 py-2.5">
            <h3 className="text-xs font-bold text-[#222222] mb-1.5">最新动态</h3>
            <div className="space-y-1">
              {mockData.recentActivities.map((activity, index) => (
                <div key={index} className="flex items-start gap-1.5 pb-1 border-b border-gray-100 last:border-0 last:pb-0">
                  <div className="w-1 h-1 rounded-full bg-[#D32F2F] mt-1 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-[#222222]">
                      <span className="font-semibold">{activity.user}</span> {activity.action}
                    </p>
                    <p className="text-xs text-[#757575]">{activity.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 圆点指示器 */}
        <div className="flex items-center justify-center gap-2 mt-4">
          <div className="w-2 h-2 rounded-full bg-[#D32F2F]" />
          <div className="w-2 h-2 rounded-full bg-gray-300" />
          <div className="w-2 h-2 rounded-full bg-gray-300" />
        </div>
      </div>
    </div>
  );
}
