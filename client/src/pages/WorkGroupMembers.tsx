import { useLocation, useParams } from "wouter";

export default function WorkGroupMembers() {
  const [, setLocation] = useLocation();
  const { groupId } = useParams();

  // 模拟数据 - 6个成员
  const mockMembers = [
    {
      id: 1,
      name: "张三",
      avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=1",
      joinDate: "2024-01-15",
      connections: 128,
      tags: 45,
      contacts: 89,
      shares: 12
    },
    {
      id: 2,
      name: "李四",
      avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=2",
      joinDate: "2024-02-01",
      connections: 95,
      tags: 32,
      contacts: 67,
      shares: 8
    },
    {
      id: 3,
      name: "王五",
      avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=3",
      joinDate: "2024-02-08",
      connections: 156,
      tags: 58,
      contacts: 102,
      shares: 15
    },
    {
      id: 4,
      name: "赵六",
      avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=4",
      joinDate: "2024-01-20",
      connections: 73,
      tags: 28,
      contacts: 54,
      shares: 6
    },
    {
      id: 5,
      name: "孙七",
      avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=5",
      joinDate: "2024-02-10",
      connections: 112,
      tags: 41,
      contacts: 78,
      shares: 10
    },
    {
      id: 6,
      name: "周八",
      avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=6",
      joinDate: "2024-02-15",
      connections: 64,
      tags: 22,
      contacts: 45,
      shares: 5
    }
  ];

  return (
    <div className="min-h-screen bg-[#FAF3ED] flex flex-col">
      {/* 顶部导航栏 */}
      <div className="bg-[#D32F2F] text-white px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <button 
          onClick={() => setLocation('/work-groups')}
          className="p-1"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-lg font-bold">工作群{groupId}成员</h1>
        <div className="w-6"></div>
      </div>

      {/* 成员列表 */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-3 space-y-2">
          {mockMembers.map((member) => (
            <div
              key={member.id}
              onClick={() => setLocation(`/work-group-member/${member.id}`)}
              className="bg-white rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
            >
              <div className="flex items-center gap-3">
                {/* 头像 */}
                <img
                  src={member.avatar}
                  alt={member.name}
                  className="w-12 h-12 rounded-full border-2 border-[#D32F2F]/10"
                />

                {/* 信息区域 */}
                <div className="flex-1">
                  {/* 第一行：用户名和加入时间 */}
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-[#222222]">{member.name}</span>
                    <span className="text-xs text-[#757575]">加入 {member.joinDate}</span>
                  </div>

                  {/* 第二行：数据统计 */}
                  <div className="grid grid-cols-4 gap-2 text-xs">
                    <div className="flex flex-col items-center">
                      <span className="text-[#757575]">人脉</span>
                      <span className="font-bold text-[#D32F2F]">{member.connections}</span>
                    </div>
                    <div className="flex flex-col items-center">
                      <span className="text-[#757575]">标签</span>
                      <span className="font-bold text-[#D32F2F]">{member.tags}</span>
                    </div>
                    <div className="flex flex-col items-center">
                      <span className="text-[#757575]">联络</span>
                      <span className="font-bold text-[#D32F2F]">{member.contacts}</span>
                    </div>
                    <div className="flex flex-col items-center">
                      <span className="text-[#757575]">共享</span>
                      <span className="font-bold text-[#D32F2F]">{member.shares}</span>
                    </div>
                  </div>
                </div>

                {/* 右箭头 */}
                <svg className="w-5 h-5 text-[#757575]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
