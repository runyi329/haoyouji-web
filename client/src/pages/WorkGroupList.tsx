import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ChevronLeft, BookOpen } from "lucide-react";
import { trpc } from '../lib/trpc';
import { useMemo } from 'react';

/**
 * 脉动节点合作平台 - 数据看板首页
 */
export default function WorkGroupList() {
  const [, setLocation] = useLocation();

  // 固定的有限合伙企业ID（目前只有一个企业）
  const partnershipId = 1;

  // 获取工作群列表
  const { data: workGroupsData = [] } = trpc.partnership.getWorkGroups.useQuery(
    { partnershipId },
    { enabled: true }
  );

  // 获取所有成员数据
  const { data: membersData = [] } = trpc.partnership.getMembers.useQuery(
    { partnershipId },
    { enabled: true }
  );

  // 计算运行天数
  const startDate = new Date('2026-02-08');
  const today = new Date();
  const runningDays = Math.floor((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

  // 按工作群分组成员
  const workGroupsWithMembers = useMemo(() => {
    return workGroupsData.map(group => {
      // 找到属于这个工作群的所有成员
      const groupMembers = membersData.filter(member =>
        member.workGroups?.some((wg: any) => wg.id === group.id)
      );

      return {
        ...group,
        members: groupMembers.map(member => ({
          id: member.id,
          name: member.name || '未命名',
          avatar: member.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${member.id}`
        }))
      };
    });
  }, [workGroupsData, membersData]);

  // 模拟数据（其他部分暂时保留）
  const mockData = {
    companyName: "上海煦斌教育科技合伙企业（有限合伙）",
    groupName: "脉动节点合作平台",
    startDate: "2026年2月8日",
    today: today.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }),
    runningDays: runningDays,
    members: {
      current: membersData.length || 7,
      max: 50,
      percentage: Math.round((membersData.length || 7) / 50 * 100)
    },
    poolProgress: {
      target: 12.5,
      current: 3.8,
      percentage: 30.4
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
    leapList: [
      { name: "周八", growth: 45 },
      { name: "孙七", growth: 32 },
      { name: "赵六", growth: 28 }
    ],
    recordCount: 128,
    recentActivities: [
      { user: "张三", action: "记账", time: "2小时前" },
      { user: "李四", action: "更新", time: "5小时前" },
      { user: "王五", action: "记账", time: "1天前" }
    ],
    alerts: [
      { type: "warning", message: "有3位伙伴已连续3天未联络新人", action: "建议介入辅导" },
      { type: "info", message: "本周新增2位潜在高级用户", action: "及时跟进" }
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
          
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation("/node-growth-guide?view=mentor")}
            className="text-white hover:bg-white/10 h-8 w-8"
            title="节点成长手册"
          >
            <BookOpen className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* 数据看板主内容区 */}
      <div className="flex-1 px-4 py-4 overflow-hidden">
        
        {/* 工作群卡片 */}
        <div 
          className="bg-white rounded-2xl shadow-lg hover:shadow-xl transition-shadow cursor-pointer overflow-hidden border border-gray-100"
          onClick={() => setLocation("/work-group/all/members")}
        >
          {/* 公司名称头部 */}
          <div className="px-4 py-2.5 border-b border-gray-200 bg-gradient-to-b from-white to-gray-50">
            <h2 className="text-sm font-bold text-[#222222] text-center leading-tight">
              {mockData.companyName}
            </h2>
          </div>

          {/* 第一行：成员人数 + 池子可视化 + 时间 */}
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

            {/* 2/3: 池子可视化 */}
            <div className="border-r border-gray-200 px-2">
              <h3 className="text-xs font-bold text-[#222222] mb-1">总资产进度</h3>
              <div className="space-y-1">
                <div className="flex items-baseline gap-0.5">
                  <span className="text-xl font-bold text-[#D32F2F]">{mockData.poolProgress.current}</span>
                  <span className="text-xs text-[#757575]">/{mockData.poolProgress.target}%</span>
                </div>
                {/* 进度条 */}
                <div className="h-2 bg-[#FFEBEE] rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-[#D32F2F] rounded-full transition-all"
                    style={{ width: `${mockData.poolProgress.percentage}%` }}
                  />
                </div>
                <p className="text-xs text-[#757575]">已完成 {mockData.poolProgress.percentage.toFixed(1)}%</p>
              </div>
            </div>

            {/* 3/3: 时间 - 最右边 */}
            <div className="pl-2">
              <h3 className="text-xs font-bold text-[#222222] mb-1">时间</h3>
              <div className="space-y-1">
                <div className="flex items-baseline gap-1">
                  <span className="text-xs text-[#757575]">运行</span>
                  <span className="text-xl font-bold text-[#D32F2F]">{mockData.runningDays}</span>
                  <span className="text-xs text-[#757575]">天</span>
                </div>
                <div className="text-xs text-[#757575]">
                  启动 2/8
                </div>
              </div>
            </div>
          </div>

          {/* 第二行：工作群 */}
          <div className="grid grid-cols-3 border-b border-gray-200">
            {workGroupsWithMembers.map((group, index) => (
              <div 
                key={group.id}
                className={`px-4 py-2.5 cursor-pointer hover:bg-[#FAF3ED]/50 transition-colors ${
                  index < workGroupsWithMembers.length - 1 ? 'border-r border-gray-200' : ''
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  setLocation(`/work-group/all/members`);
                }}
              >
                <h3 className="text-xs font-bold text-[#222222] mb-1.5">{group.name}</h3>
                
                {/* 成员头像展示 */}
                <div className="flex items-center">
                  {/* 头像重叠展示 */}
                  <div className="flex -space-x-2">
                    {group.members.slice(0, 4).map((member, idx) => (
                      <div
                        key={member.id}
                        className="w-8 h-8 rounded-full border-2 border-white bg-white overflow-hidden"
                        style={{ zIndex: 10 - idx }}
                      >
                        <img 
                          src={member.avatar} 
                          alt={member.name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ))}
                    {/* 添加按钮 */}
                    <div 
                      className="w-8 h-8 rounded-full border-2 border-white bg-[#D32F2F] flex items-center justify-center text-white text-sm font-bold"
                      style={{ zIndex: 5 }}
                    >
                      +
                    </div>
                  </div>
                  
                  {/* 成员数量 */}
                  <span className="ml-2 text-xs text-[#757575]">
                    {group.members.length}人
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* 第三行：飞跃榜 + 本月记账 */}
          <div className="grid grid-cols-2 border-b border-gray-200">
            {/* 飞跃榜 */}
            <div className="px-4 py-2.5 border-r border-gray-200">
              <h3 className="text-xs font-bold text-[#222222] mb-1.5">
                飞跃榜
                <span className="text-xs font-normal text-[#757575] ml-1">(本周进步)</span>
              </h3>
              <div className="space-y-1.5">
                {mockData.leapList.map((member, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <div className="flex items-center justify-center w-5 h-5 rounded-full bg-[#FAF3ED]">
                      <span className="text-xs font-bold text-[#CBA471]">{index + 1}</span>
                    </div>
                    <div className="flex-1 flex items-center justify-between">
                      <span className="text-xs font-medium text-[#222222]">{member.name}</span>
                      <span className="text-xs font-bold text-[#D32F2F]">+{member.growth}</span>
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
                    <circle cx="50" cy="50" r="45" fill="none" stroke="#FFEBEE" strokeWidth="8" />
                    <circle
                      cx="50" cy="50" r="45" fill="none" stroke="#D32F2F" strokeWidth="8"
                      strokeDasharray="200 283" strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-xs font-bold text-[#D32F2F]">71%</span>
                  </div>
                </div>
                <span className="text-sm font-bold text-[#D32F2F]">{mockData.recordCount}</span>
                <span className="text-xs text-[#757575]">记账次数</span>
              </div>
            </div>
          </div>

          {/* 第四行：预警雷达 */}
          <div className="px-4 py-2.5">
            <h3 className="text-xs font-bold text-[#222222] mb-1.5">预警雷达</h3>
            <div className="space-y-2">
              {mockData.alerts.map((alert, index) => (
                <div 
                  key={index}
                  className="flex items-start gap-2 p-2 rounded-lg bg-[#FAF3ED]/50 hover:bg-[#FAF3ED] transition-colors cursor-pointer"
                >
                  <div className={`w-1 h-full rounded-full ${
                    alert.type === 'warning' ? 'bg-[#FF9800]' : 'bg-[#2196F3]'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-[#222222] mb-0.5">{alert.message}</p>
                    <p className="text-xs text-[#757575]">{alert.action}</p>
                  </div>
                  <button className="px-2 py-0.5 text-xs font-medium text-[#D32F2F] hover:bg-[#FFEBEE] rounded transition-colors">
                    处理
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 最新动态 */}
        <div className="mt-4 bg-white rounded-2xl shadow-lg p-4">
          <h3 className="text-sm font-bold text-[#222222] mb-3">最新动态</h3>
          <div className="space-y-2">
            {mockData.recentActivities.map((activity, index) => (
              <div key={index} className="flex items-center gap-2 text-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-[#D32F2F]" />
                <span className="font-medium text-[#222222]">{activity.user}</span>
                <span className="text-[#757575]">{activity.action}</span>
                <span className="ml-auto text-[#757575]">{activity.time}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
