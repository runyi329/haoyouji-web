import { useState } from 'react';
import { useLocation } from 'wouter';
import { ChevronLeft, ChevronDown, ChevronRight } from 'lucide-react';

export default function NodeGrowthGuide() {
  const [, setLocation] = useLocation();
  
  // 从 URL参数获取默认视角和维度
  const urlParams = new URLSearchParams(window.location.search);
  const defaultView = urlParams.get('view') || 'self'; // self | mentor
  const defaultDimension = urlParams.get('dimension'); // asset | network | contact | share | replicate
  
  const [activeView, setActiveView] = useState<'self' | 'mentor'>(defaultView as 'self' | 'mentor');
  const [expandedSections, setExpandedSections] = useState<string[]>(
    defaultDimension ? [defaultDimension] : ['asset']
  );

  // 五个维度的数据
  const dimensions = [
    {
      id: 'asset',
      title: '资产力',
      score: 85,
      status: 'completed' as const,
      selfSteps: [
        '了解投资规则和份额计算方式',
        '选择适合自己的投资金额（建议10万元以上）',
        '完成实缴并获得股权确认',
      ],
      mentorSteps: [
        '强调投资的长期价值和收益预期',
        '解答伙伴关于投资金额和风险的疑问',
        '跟进实缴进度，提供必要的支持',
      ],
      currentStatus: '已完成实缴10万元',
    },
    {
      id: 'network',
      title: '蓄水力',
      score: 72,
      status: 'in_progress' as const,
      selfSteps: [
        '录入现有人脉资源到系统中',
        '为每个人脉添加详细标签（行业、职位、关系等）',
        '定期更新人脉信息，保持数据准确性',
      ],
      mentorSteps: [
        '强调人脉资源的重要性和价值',
        '教会伙伴如何使用标签分类方法',
        '跟进录入进度，确保质量而非数量',
      ],
      currentStatus: '已录入32/50个人脉资源',
    },
    {
      id: 'contact',
      title: '链接力',
      score: 68,
      status: 'in_progress' as const,
      selfSteps: [
        '主动发起与人脉的价值链接',
        '记录每次联络的主题和结果',
        '保持定期联络，建立长期关系',
      ],
      mentorSteps: [
        '指导伙伴如何发起有价值的联络',
        '提供联络话术和沟通技巧',
        '跟进联络效果，及时给予反馈',
      ],
      currentStatus: '本周已发起5次价值链接',
    },
    {
      id: 'share',
      title: '共享力',
      score: 80,
      status: 'completed' as const,
      selfSteps: [
        '识别可共享的资源和信息',
        '主动将资源共享给需要的伙伴',
        '记录共享行为并追踪效果',
      ],
      mentorSteps: [
        '引导伙伴发现自己的资源价值',
        '教会伙伴如何有效地共享资源',
        '鼓励伙伴持续贡献，形成共享习惯',
      ],
      currentStatus: '本月已共享8次资源',
    },
    {
      id: 'replicate',
      title: '复制力',
      score: 75,
      status: 'completed' as const,
      selfSteps: [
        '识别潜在的节点候选人',
        '主动邀请并培育新节点',
        '跟进新节点的成长进度',
      ],
      mentorSteps: [
        '指导伙伴如何识别优质候选人',
        '提供培育新节点的方法和工具',
        '跟进培育效果，及时给予支持',
      ],
      currentStatus: '已成功培育3个新节点',
    },
  ];

  // 计算总进度
  const totalScore = dimensions.reduce((sum, d) => sum + d.score, 0);
  const averageScore = Math.round(totalScore / dimensions.length);

  const toggleSection = (id: string) => {
    setExpandedSections(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );
  };

  const getStatusColor = (status: 'completed' | 'in_progress') => {
    return status === 'completed' ? 'text-[#4CAF50]' : 'text-[#CBA471]';
  };

  const getStatusText = (status: 'completed' | 'in_progress') => {
    return status === 'completed' ? '已达标' : '进行中';
  };

  return (
    <div className="min-h-screen bg-[#FAF3ED]">
      {/* 顶部导航栏 */}
      <div className="bg-[#D32F2F] text-white p-4 flex items-center justify-between sticky top-0 z-10">
        <button onClick={() => setLocation('/profile')} className="p-2">
          <ChevronLeft size={24} />
        </button>
        <h1 className="text-lg font-semibold">节点成长手册</h1>
        <div className="w-10"></div>
      </div>

      {/* 视角切换 */}
      <div className="bg-white p-4 mb-4">
        <div className="flex gap-2">
          <button
            onClick={() => setActiveView('self')}
            className={`flex-1 py-3 rounded-lg font-medium transition-colors ${
              activeView === 'self'
                ? 'bg-[#D32F2F] text-white'
                : 'bg-gray-100 text-gray-600'
            }`}
          >
            我要成长
          </button>
          <button
            onClick={() => setActiveView('mentor')}
            className={`flex-1 py-3 rounded-lg font-medium transition-colors ${
              activeView === 'mentor'
                ? 'bg-[#D32F2F] text-white'
                : 'bg-gray-100 text-gray-600'
            }`}
          >
            我要辅导
          </button>
        </div>
      </div>

      {/* 总进度 */}
      <div className="bg-white p-4 mb-4 mx-4 rounded-lg">
        <div className="flex items-center justify-between mb-2">
          <span className="text-gray-600">综合评分</span>
          <span className="text-2xl font-bold text-[#D32F2F]">{averageScore}</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-[#D32F2F] h-2 rounded-full transition-all"
            style={{ width: `${averageScore}%` }}
          ></div>
        </div>
        <div className="mt-2 text-sm text-gray-500 text-center">
          {averageScore >= 80 ? '表现优秀，继续保持！' : '还有提升空间，加油！'}
        </div>
      </div>

      {/* 手风琴式内容 */}
      <div className="px-4 pb-4 space-y-3">
        {dimensions.map((dimension, index) => {
          const isExpanded = expandedSections.includes(dimension.id);
          const steps = activeView === 'self' ? dimension.selfSteps : dimension.mentorSteps;

          return (
            <div key={dimension.id} className="bg-white rounded-lg overflow-hidden">
              {/* 章节标题 */}
              <button
                onClick={() => toggleSection(dimension.id)}
                className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="text-[#CBA471] font-bold text-lg">{index + 1}.</span>
                  <span className="font-semibold text-gray-800">{dimension.title}</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-500">{dimension.score}/100</span>
                    <span className={`text-sm font-medium ${getStatusColor(dimension.status)}`}>
                      {getStatusText(dimension.status)}
                    </span>
                  </div>
                  {isExpanded ? (
                    <ChevronDown size={20} className="text-gray-400" />
                  ) : (
                    <ChevronRight size={20} className="text-gray-400" />
                  )}
                </div>
              </button>

              {/* 展开内容 */}
              {isExpanded && (
                <div className="px-4 pb-4 border-t border-gray-100">
                  {/* 进度条 */}
                  <div className="mt-4 mb-4">
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-[#D32F2F] h-2 rounded-full transition-all"
                        style={{ width: `${dimension.score}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* 步骤列表 */}
                  <div className="mb-4">
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">
                      {activeView === 'self' ? '成长步骤' : '辅导要点'}
                    </h3>
                    <div className="space-y-2">
                      {steps.map((step, stepIndex) => (
                        <div key={stepIndex} className="flex gap-2">
                          <span className="text-[#D32F2F] font-medium flex-shrink-0">
                            {stepIndex + 1}.
                          </span>
                          <span className="text-gray-600 text-sm">{step}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 当前状态 */}
                  <div className="bg-[#FAF3ED] p-3 rounded-lg">
                    <div className="text-xs text-gray-500 mb-1">当前状态</div>
                    <div className="text-sm text-gray-700">{dimension.currentStatus}</div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
