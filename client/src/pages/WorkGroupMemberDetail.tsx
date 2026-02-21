import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Lightbulb } from "lucide-react";
import { useState } from "react";

/**
 * 伙伴详情/经营看板
 */
export default function WorkGroupMemberDetail() {
  const { memberId } = useParams();
  const [, setLocation] = useLocation();
  const [notes, setNotes] = useState("");

  // 模拟数据
  const mockMember = {
    id: memberId,
    name: "张三",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=1",
    level: "事业合伙人",
    totalScore: 1280,
    radarData: {
      overall: 78, // 综合评分
      dimensions: [
        { name: "资产力", value: 85, max: 100 },
        { name: "蓄水力", value: 72, max: 100 },
        { name: "链接力", value: 68, max: 100 },
        { name: "共享力", value: 80, max: 100 },
        { name: "复制力", value: 75, max: 100 }
      ]
    },
    valueStream: [
      {
        id: 1,
        time: "2024-02-21 14:30",
        category: "复制类",
        action: "成功培育新节点",
        target: "李四",
        dimension: "复制力",
        points: 20
      },
      {
        id: 2,
        time: "2024-02-21 10:15",
        category: "共享类",
        action: "开启资源共享",
        target: "王五",
        dimension: "共享力",
        points: 15
      },
      {
        id: 3,
        time: "2024-02-20 16:45",
        category: "联络类",
        action: "发起价值链接",
        target: "赵六",
        dimension: "链接力",
        points: 8
      },
      {
        id: 4,
        time: "2024-02-20 09:20",
        category: "人脉类",
        action: "录入新资源",
        target: null,
        dimension: "蓄水力",
        points: 10
      },
      {
        id: 5,
        time: "2024-02-19 15:30",
        category: "人脉类",
        action: "完善标签",
        target: null,
        dimension: "蓄水力",
        points: 5
      },
      {
        id: 6,
        time: "2024-02-19 11:00",
        category: "联络类",
        action: "发起价值链接",
        target: "孙七",
        dimension: "链接力",
        points: 8
      }
    ]
  };

  // 计算雷达图的路径
  const calculateRadarPath = () => {
    const centerX = 100;
    const centerY = 100;
    const radius = 70;
    const angleStep = (Math.PI * 2) / 5;
    
    const points = mockMember.radarData.dimensions.map((dim, index) => {
      const angle = angleStep * index - Math.PI / 2;
      const value = (dim.value / dim.max) * radius;
      const x = centerX + value * Math.cos(angle);
      const y = centerY + value * Math.sin(angle);
      return `${x},${y}`;
    });
    
    return points.join(" ");
  };

  // 计算雷达图背景网格
  const renderRadarGrid = () => {
    const centerX = 100;
    const centerY = 100;
    const radius = 70;
    const angleStep = (Math.PI * 2) / 5;
    const levels = [0.2, 0.4, 0.6, 0.8, 1.0];
    
    return (
      <>
        {/* 背景网格圆圈 */}
        {levels.map((level, i) => {
          const points = mockMember.radarData.dimensions.map((_, index) => {
            const angle = angleStep * index - Math.PI / 2;
            const r = radius * level;
            const x = centerX + r * Math.cos(angle);
            const y = centerY + r * Math.sin(angle);
            return `${x},${y}`;
          });
          return (
            <polygon
              key={i}
              points={points.join(" ")}
              fill="none"
              stroke="#E0E0E0"
              strokeWidth="1"
            />
          );
        })}
        
        {/* 从中心到各个顶点的线 */}
        {mockMember.radarData.dimensions.map((_, index) => {
          const angle = angleStep * index - Math.PI / 2;
          const x = centerX + radius * Math.cos(angle);
          const y = centerY + radius * Math.sin(angle);
          return (
            <line
              key={index}
              x1={centerX}
              y1={centerY}
              x2={x}
              y2={y}
              stroke="#E0E0E0"
              strokeWidth="1"
            />
          );
        })}
      </>
    );
  };

  // 渲染雷达图标签
  const renderRadarLabels = () => {
    const centerX = 100;
    const centerY = 100;
    const radius = 85;
    const angleStep = (Math.PI * 2) / 5;
    
    return mockMember.radarData.dimensions.map((dim, index) => {
      const angle = angleStep * index - Math.PI / 2;
      const x = centerX + radius * Math.cos(angle);
      const y = centerY + radius * Math.sin(angle);
      
      return (
        <text
          key={index}
          x={x}
          y={y}
          textAnchor="middle"
          dominantBaseline="middle"
          className="text-xs font-medium fill-[#222222]"
        >
          {dim.name}
        </text>
      );
    });
  };

  // 获取类别颜色
  const getCategoryColor = (category: string) => {
    switch (category) {
      case "人脉类":
        return "text-[#CBA471]";
      case "联络类":
        return "text-[#D32F2F]";
      case "共享类":
        return "text-[#CBA471]";
      case "复制类":
        return "text-[#D32F2F]";
      default:
        return "text-[#757575]";
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF3ED] flex flex-col">
      {/* 顶部导航栏 */}
      <div className="bg-[#D32F2F] border-b border-[#D32F2F] sticky top-0 z-10">
        <div className="px-3 py-3 flex items-center justify-between">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation("/work-group/all/members")}
            className="text-white hover:bg-white/10 h-8 w-8"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          
          <h1 className="text-lg font-bold text-white absolute left-1/2 transform -translate-x-1/2">
            伙伴详情
          </h1>
          
          <div className="w-8" />
        </div>
      </div>

      {/* 主内容区 */}
      <div className="flex-1 px-4 py-4 space-y-4 overflow-y-auto">
        
        {/* 第一区：身份资产区 */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          {/* 红色顶盖 */}
          <div className="bg-gradient-to-b from-[#D32F2F] to-[#C62828] px-4 py-4">
            <div className="flex items-center gap-3">
              {/* 头像 */}
              <div className="w-16 h-16 rounded-full border-4 border-white overflow-hidden bg-white flex-shrink-0">
                <img 
                  src={mockMember.avatar} 
                  alt={mockMember.name}
                  className="w-full h-full object-cover"
                />
              </div>
              
              {/* 基础信息 */}
              <div className="flex-1">
                <h2 className="text-xl font-bold text-white mb-1">
                  {mockMember.name}
                </h2>
                <div className="inline-block px-2 py-0.5 bg-white/20 rounded-full">
                  <span className="text-xs font-medium text-white">
                    {mockMember.level}
                  </span>
                </div>
              </div>
            </div>
          </div>
          
          {/* 核心资产确权值 */}
          <div className="px-4 py-4 bg-white">
            <div className="text-center">
              <p className="text-xs text-[#757575] mb-1">已贡献资产确权总分</p>
              <p className="text-4xl font-bold text-[#D32F2F]">
                {mockMember.totalScore.toLocaleString()}
              </p>
            </div>
          </div>
        </div>

        {/* 第二区：五星能量雷达 */}
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <h3 className="text-sm font-bold text-[#222222] mb-3">五星能量雷达</h3>
          
          {/* 综合评分 */}
          <div className="text-center mb-3">
            <p className="text-xs text-[#757575] mb-1">综合评分</p>
            <p className="text-3xl font-bold text-[#D32F2F]">
              {mockMember.radarData.overall}
            </p>
          </div>
          
          {/* 雷达图 */}
          <div className="flex justify-center">
            <svg viewBox="0 0 200 200" className="w-full max-w-xs">
              {/* 背景网格 */}
              {renderRadarGrid()}
              
              {/* 数据区域 */}
              <polygon
                points={calculateRadarPath()}
                fill="#D32F2F"
                fillOpacity="0.2"
                stroke="#D32F2F"
                strokeWidth="2"
              />
              
              {/* 数据点 */}
              {mockMember.radarData.dimensions.map((dim, index) => {
                const centerX = 100;
                const centerY = 100;
                const radius = 70;
                const angleStep = (Math.PI * 2) / 5;
                const angle = angleStep * index - Math.PI / 2;
                const value = (dim.value / dim.max) * radius;
                const x = centerX + value * Math.cos(angle);
                const y = centerY + value * Math.sin(angle);
                
                return (
                  <circle
                    key={index}
                    cx={x}
                    cy={y}
                    r="3"
                    fill="#D32F2F"
                  />
                );
              })}
              
              {/* 标签 */}
              {renderRadarLabels()}
            </svg>
          </div>
          
          {/* 维度数值列表 */}
          <div className="mt-4 space-y-2">
            {mockMember.radarData.dimensions.map((dim, index) => {
              const dimensionMap: Record<string, string> = {
                '资产力': 'asset',
                '蓄水力': 'network',
                '链接力': 'contact',
                '共享力': 'share',
                '复制力': 'replicate'
              };
              const dimensionId = dimensionMap[dim.name] || 'asset';
              
              return (
                <div key={index} className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-[#757575]">{dim.name}</span>
                    <button
                      onClick={() => setLocation(`/node-growth-guide?view=mentor&dimension=${dimensionId}`)}
                      className="p-0.5 hover:bg-[#FAF3ED] rounded transition-colors"
                      title="查看提升指南"
                    >
                      <Lightbulb size={14} className="text-[#CBA471]" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-1.5 bg-[#FFEBEE] rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-[#D32F2F] rounded-full"
                        style={{ width: `${(dim.value / dim.max) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs font-bold text-[#D32F2F] w-8 text-right">
                      {dim.value}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 第三区：实时价值流 */}
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <h3 className="text-sm font-bold text-[#222222] mb-3">实时价值流</h3>
          
          <div className="space-y-3">
            {mockMember.valueStream.map((item) => (
              <div 
                key={item.id}
                className="flex items-start gap-3 pb-3 border-b border-gray-100 last:border-0 last:pb-0"
              >
                {/* 时间轴点 */}
                <div className="flex flex-col items-center flex-shrink-0">
                  <div className="w-2 h-2 rounded-full bg-[#D32F2F]" />
                  <div className="w-0.5 h-full bg-gray-200 mt-1" />
                </div>
                
                {/* 内容 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="flex-1">
                      <p className="text-xs text-[#757575] mb-0.5">
                        {item.time}
                      </p>
                      <p className="text-sm text-[#222222]">
                        {item.action}
                        {item.target && (
                          <span className="font-medium"> {item.target}</span>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <span className={`text-xs ${getCategoryColor(item.category)}`}>
                        {item.dimension}
                      </span>
                      <span className="text-sm font-bold text-[#D32F2F]">
                        +{item.points}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 第四区：经营者备注/笔记 */}
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <h3 className="text-sm font-bold text-[#222222] mb-3">合伙人攻坚笔记</h3>
          
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="点击记录该伙伴的性格特征、核心诉求或下一步跟进计划..."
            className="w-full h-32 px-3 py-2 text-sm text-[#222222] placeholder-[#BDBDBD] bg-[#FAF3ED] border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-[#D32F2F] focus:border-transparent"
            style={{
              fontFamily: "'Courier New', monospace",
              lineHeight: "1.6"
            }}
          />
          
          <div className="mt-2 flex justify-end">
            <Button
              onClick={() => {
                // TODO: 保存备注到数据库
                alert("备注已保存");
              }}
              className="bg-[#D32F2F] hover:bg-[#C62828] text-white text-sm px-4 py-2"
            >
              保存备注
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
