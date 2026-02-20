import { ChevronRight, Lock, CheckCircle2, Circle } from 'lucide-react';
import { toast } from 'sonner';

interface Task {
  id: string;
  title: string;
  description: string;
  pu: number;
  leverageMultiplier: number;
  completed: boolean;
  locked: boolean;
  frequency?: string;
  progress?: {
    current: number;
    total: number;
  };
}

interface TaskTier {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  tasks: Task[];
  style: 'horizontal' | 'vertical' | 'premium';
}

interface ThreeTierEngineProps {
  leverageMultiplier: number;
}

/**
 * 三阶增值引擎
 * 
 * L1: 身份权证激活 - 横向滚动小卡片
 * L2: 市场边际扩张 - 纵向标准卡片（醒目）
 * L3: 战略价值注入 - 带锁定图标（暗金底纹）
 */
export default function ThreeTierEngine({ leverageMultiplier }: ThreeTierEngineProps) {
  // 三阶任务数据
  const tiers: TaskTier[] = [
    {
      id: 'l1',
      name: '身份权证激活',
      subtitle: 'Node Activation',
      description: '完成基础确权，激活 1.04× 原始杠杆',
      style: 'horizontal',
      tasks: [
        {
          id: 'profile-photo',
          title: '上传真实头像',
          description: '建立信任基础',
          pu: 20,
          leverageMultiplier,
          completed: false,
          locked: false,
        },
        {
          id: 'profile-career',
          title: '完善职业信息',
          description: '展示专业形象',
          pu: 50,
          leverageMultiplier,
          completed: false,
          locked: false,
        },
        {
          id: 'profile-bio',
          title: '个人简介',
          description: '≥50字',
          pu: 30,
          leverageMultiplier,
          completed: false,
          locked: false,
        },
        {
          id: 'profile-skills',
          title: '技能标签',
          description: '≥3个',
          pu: 20,
          leverageMultiplier,
          completed: false,
          locked: false,
        },
      ],
    },
    {
      id: 'l2',
      name: '市场边际扩张',
      subtitle: 'Capital Expansion',
      description: '通过人脉裂变，实现股权占位的倍数增长',
      style: 'vertical',
      tasks: [
        {
          id: 'invite-user',
          title: '邀请新股东',
          description: '每邀请1人直接增加0.05%股权',
          pu: 100,
          leverageMultiplier,
          completed: false,
          locked: false,
          frequency: '无限制',
        },
        {
          id: 'add-contact',
          title: '添加人脉',
          description: '扫码/二维码添加一度人脉',
          pu: 10,
          leverageMultiplier,
          completed: false,
          locked: false,
          frequency: '每日最多10次',
          progress: {
            current: 3,
            total: 10,
          },
        },
        {
          id: 'complete-contact-info',
          title: '完善人脉信息',
          description: '提升人脉质量权重',
          pu: 8,
          leverageMultiplier,
          completed: false,
          locked: false,
          frequency: '每日最多5次',
          progress: {
            current: 1,
            total: 5,
          },
        },
        {
          id: 'add-contact-note',
          title: '添加关键备注',
          description: '≥20字，深度人脉加权',
          pu: 15,
          leverageMultiplier,
          completed: false,
          locked: false,
          frequency: '每日最多3次',
        },
      ],
    },
    {
      id: 'l3',
      name: '战略价值注入',
      subtitle: 'Ecosystem Contribution',
      description: '深度参与经营决策，获取高权重贡献溢价',
      style: 'premium',
      tasks: [
        {
          id: 'product-suggestion',
          title: '提交产品建议',
          description: '高价值战略贡献',
          pu: 500,
          leverageMultiplier,
          completed: false,
          locked: false,
          frequency: '无限制',
        },
        {
          id: 'sign-agreement',
          title: '在线签署协议',
          description: '仪式感里程碑，解锁完整权益',
          pu: 1000,
          leverageMultiplier,
          completed: false,
          locked: false,
          frequency: '一次性',
        },
        {
          id: 'continuous-login-30',
          title: '连续登录30天',
          description: '忠诚度加权，L系数+0.05',
          pu: 200,
          leverageMultiplier,
          completed: false,
          locked: false,
          frequency: '每月一次',
          progress: {
            current: 7,
            total: 30,
          },
        },
      ],
    },
  ];

  const handleTaskClick = (task: Task) => {
    if (task.locked) {
      toast.info('该任务已锁定，请先完成前置任务');
      return;
    }
    
    if (task.completed) {
      toast.success('该任务已完成');
      return;
    }
    
    toast.info('正在跳转到任务页面...');
  };

  return (
    <div className="space-y-6">
      {tiers.map((tier) => (
        <div key={tier.id} className="space-y-3">
          {/* 阶段标题 */}
          <div className="px-1">
            <div className="flex items-baseline space-x-2">
              <h3 className="text-base font-bold text-gray-900">{tier.name}</h3>
              <span className="text-xs text-gray-400 font-medium">{tier.subtitle}</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">{tier.description}</p>
          </div>

          {/* L1: 横向滚动小卡片 */}
          {tier.style === 'horizontal' && (
            <div className="flex space-x-3 overflow-x-auto pb-2 scrollbar-hide">
              {tier.tasks.map((task) => (
                <div
                  key={task.id}
                  onClick={() => handleTaskClick(task)}
                  className="flex-shrink-0 w-32 bg-white rounded-xl p-3 border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all cursor-pointer"
                >
                  <div className="flex items-center justify-between mb-2">
                    {task.completed ? (
                      <CheckCircle2 className="w-4 h-4 text-[#4CAF50]" />
                    ) : (
                      <Circle className="w-4 h-4 text-gray-300" />
                    )}
                    <span className="text-xs font-bold text-gray-900">+{task.pu}</span>
                  </div>
                  <p className="text-xs font-semibold text-gray-700 mb-0.5">{task.title}</p>
                  <p className="text-[10px] text-gray-400 leading-tight">{task.description}</p>
                </div>
              ))}
            </div>
          )}

          {/* L2: 纵向标准卡片（醒目） */}
          {tier.style === 'vertical' && (
            <div className="space-y-2.5">
              {tier.tasks.map((task) => (
                <div
                  key={task.id}
                  onClick={() => handleTaskClick(task)}
                  className="bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition-all cursor-pointer border border-gray-100"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-1">
                        <h4 className="text-sm font-bold text-gray-900">{task.title}</h4>
                        <div className="flex items-center space-x-1">
                          <span className="text-sm font-bold text-[#A80000]">+{task.pu}</span>
                          <span className="text-[10px] text-yellow-600 font-semibold">×{task.leverageMultiplier.toFixed(2)}</span>
                        </div>
                      </div>
                      <p className="text-xs text-gray-500 mb-2">{task.description}</p>
                      
                      {task.frequency && (
                        <div className="flex items-center space-x-2 text-xs">
                          <span className="text-gray-400">{task.frequency}</span>
                          {task.progress && (
                            <span className="text-gray-600 font-medium">
                              今日 {task.progress.current}/{task.progress.total}
                            </span>
                          )}
                        </div>
                      )}
                      
                      {task.progress && (
                        <div className="mt-2">
                          <div className="w-full bg-gray-100 rounded-full h-1.5">
                            <div
                              className="bg-gradient-to-r from-[#A80000] to-[#c44] h-1.5 rounded-full transition-all"
                              style={{ width: `${(task.progress.current / task.progress.total) * 100}%` }}
                            ></div>
                          </div>
                        </div>
                      )}
                    </div>
                    
                    <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0 ml-3" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* L3: 带锁定图标（暗金底纹） */}
          {tier.style === 'premium' && (
            <div className="space-y-2.5">
              {tier.tasks.map((task) => (
                <div
                  key={task.id}
                  onClick={() => handleTaskClick(task)}
                  className="relative bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl p-4 border border-amber-200 hover:border-amber-300 hover:shadow-md transition-all cursor-pointer overflow-hidden"
                >
                  {/* 高价值标签 */}
                  <div className="absolute top-2 right-2 px-2 py-0.5 bg-gradient-to-r from-yellow-500 to-orange-500 rounded-full">
                    <span className="text-[10px] font-bold text-white">高价值</span>
                  </div>
                  
                  <div className="flex items-start justify-between pr-16">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-1">
                        {task.locked && <Lock className="w-3.5 h-3.5 text-gray-400" />}
                        <h4 className="text-sm font-bold text-gray-900">{task.title}</h4>
                        <div className="flex items-center space-x-1">
                          <span className="text-sm font-bold text-[#A80000]">+{task.pu}</span>
                          <span className="text-[10px] text-yellow-600 font-semibold">×{task.leverageMultiplier.toFixed(2)}</span>
                        </div>
                      </div>
                      <p className="text-xs text-gray-600 mb-2">{task.description}</p>
                      
                      {task.frequency && (
                        <span className="text-xs text-gray-400">{task.frequency}</span>
                      )}
                      
                      {task.progress && (
                        <div className="mt-2">
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="text-gray-500">进度</span>
                            <span className="text-gray-700 font-medium">
                              {task.progress.current}/{task.progress.total} 天
                            </span>
                          </div>
                          <div className="w-full bg-amber-200/50 rounded-full h-1.5">
                            <div
                              className="bg-gradient-to-r from-yellow-500 to-orange-500 h-1.5 rounded-full transition-all"
                              style={{ width: `${(task.progress.current / task.progress.total) * 100}%` }}
                            ></div>
                          </div>
                        </div>
                      )}
                    </div>
                    
                    <ChevronRight className="w-4 h-4 text-amber-600 flex-shrink-0 ml-3" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {/* 增值路线图建议 */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-200">
        <div className="flex items-start space-x-3">
          <div className="w-8 h-8 rounded-lg bg-[#1976D2] flex items-center justify-center flex-shrink-0">
            <span className="text-white text-sm">💡</span>
          </div>
          <div className="flex-1">
            <h4 className="text-sm font-bold text-gray-900 mb-1">最强增值路径建议</h4>
            <p className="text-xs text-gray-600 leading-relaxed mb-2">
              先完成"身份确权"（+120 PU），再通过"战略建议"（+500 PU）实现排名跨越。
            </p>
            <div className="space-y-1 text-xs text-gray-500">
              <div className="flex items-center space-x-2">
                <span className="w-4 h-4 rounded-full bg-[#1976D2] text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0">1</span>
                <span>完成L1全部任务（5分钟，+120 PU）</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="w-4 h-4 rounded-full bg-[#1976D2] text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0">2</span>
                <span>邀请10位好友（+1000 PU，+0.5%股权）</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="w-4 h-4 rounded-full bg-[#1976D2] text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0">3</span>
                <span>提交1条产品建议（+500 PU）</span>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-blue-200">
              <p className="text-xs text-blue-700 font-semibold">
                预计效果：排名提升至前50名，股权增加0.6%
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
