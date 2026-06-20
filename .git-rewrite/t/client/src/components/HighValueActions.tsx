import { Briefcase, Lightbulb, Calendar, FileText, ChevronRight, Crown } from 'lucide-react';

interface ActionCard {
  id: string;
  title: string;
  description: string;
  puReward: number;
  equityEstimate: string;
  icon: any;
  iconColor: string;
  bgColor: string;
  actionText: string;
  actionUrl?: string;
  isMilestone?: boolean;
  frequency?: string;
}

/**
 * 高价值市场贡献建议
 * 从积分表中提取TOP任务，做成可操作的卡片
 */
export default function HighValueActions() {
  const actions: ActionCard[] = [
    {
      id: 'complete_profile',
      title: '完善职场档案',
      description: '完善个人简介、上传真实头像、填写公司职位信息',
      puReward: 100,
      equityEstimate: '0.001%',
      icon: Briefcase,
      iconColor: 'text-[#1976D2]',
      bgColor: 'from-blue-50 to-cyan-50',
      actionText: '立即完善',
      actionUrl: '/profile/edit',
      frequency: '一次性',
    },
    {
      id: 'submit_suggestion',
      title: '提交产品建议',
      description: '为平台发展献计献策，被采纳的建议将获得高额加权',
      puReward: 500,
      equityEstimate: '0.005%',
      icon: Lightbulb,
      iconColor: 'text-yellow-600',
      bgColor: 'from-white to-white',
      actionText: '提交建议',
      actionUrl: '/feedback/suggestion',
      frequency: '无限制',
    },
    {
      id: 'continuous_login',
      title: '连续登录30天',
      description: '培养使用习惯，长期活跃关键，激活"铁杆合伙人"勋章',
      puReward: 200,
      equityEstimate: '0.002%',
      icon: Calendar,
      iconColor: 'text-[#4CAF50]',
      bgColor: 'from-white to-white',
      actionText: '查看进度',
      actionUrl: '/achievements',
      frequency: '每月一次',
    },
    {
      id: 'sign_agreement',
      title: '在线签署协议',
      description: '完成正式合伙协议签署，获得完整股东权益',
      puReward: 1000,
      equityEstimate: '0.010%',
      icon: FileText,
      iconColor: 'text-purple-600',
      bgColor: 'from-white to-white',
      actionText: '签署协议',
      actionUrl: '/agreements/sign',
      isMilestone: true,
      frequency: '里程碑',
    },
  ];

  const handleAction = (action: ActionCard) => {
    if (action.actionUrl) {
      // 实际应用中跳转到对应页面
      console.log(`Navigate to: ${action.actionUrl}`);
      // window.location.href = action.actionUrl;
    }
  };

  return (
    <div className="space-y-3">
      {/* 标题 */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">高价值市场贡献建议</h3>
        <span className="text-xs text-gray-400">基于您的L{1.04}杠杆</span>
      </div>

      {/* 任务卡片列表 */}
      <div className="space-y-2.5">
        {actions.map((action) => (
          <div
            key={action.id}
            className={`relative bg-gradient-to-r ${action.bgColor} rounded-xl p-4 border border-gray-200/50 hover:shadow-md transition-all cursor-pointer group`}
            onClick={() => handleAction(action)}
          >
            {/* 里程碑标记 */}
            {action.isMilestone && (
              <div className="absolute -top-2 -right-2">
                <div className="bg-gradient-to-br from-yellow-400 to-orange-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center space-x-1 shadow-lg">
                  <Crown className="w-3 h-3" />
                  <span>里程碑</span>
                </div>
              </div>
            )}

            <div className="flex items-start space-x-3">
              {/* 图标 */}
              <div className={`w-10 h-10 rounded-lg bg-white flex items-center justify-center flex-shrink-0 shadow-sm ${action.iconColor}`}>
                <action.icon className="w-5 h-5" />
              </div>

              {/* 内容 */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between mb-1">
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900">{action.title}</h4>
                    <p className="text-xs text-gray-600 mt-0.5 line-clamp-2">{action.description}</p>
                  </div>
                </div>

                {/* 奖励信息 */}
                <div className="flex items-center justify-between mt-2">
                  <div className="flex items-center space-x-3">
                    <div className="flex items-center space-x-1">
                      <span className="text-xs text-gray-500">奖励</span>
                      <span className={`text-sm font-bold ${action.iconColor}`}>+{action.puReward} PU</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <span className="text-xs text-gray-500">预计增值</span>
                      <span className="text-sm font-semibold text-gray-900">{action.equityEstimate}</span>
                    </div>
                  </div>

                  {/* 频率标签 */}
                  <span className="text-[10px] text-gray-400 bg-white/60 px-2 py-0.5 rounded-full">
                    {action.frequency}
                  </span>
                </div>
              </div>

              {/* 操作按钮 */}
              <div className="flex-shrink-0 self-center">
                <div className={`w-8 h-8 rounded-lg ${action.iconColor} bg-white flex items-center justify-center group-hover:scale-110 transition-transform`}>
                  <ChevronRight className="w-4 h-4" />
                </div>
              </div>
            </div>

            {/* 进度条（仅用于连续登录） */}
            {action.id === 'continuous_login' && (
              <div className="mt-3 pt-3 border-t border-gray-200/50">
                <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                  <span>当前进度</span>
                  <span className="font-semibold">7/30 天</span>
                </div>
                <div className="w-full h-1.5 bg-white/60 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-green-500 to-emerald-500 rounded-full transition-all duration-500"
                    style={{ width: '23%' }}
                  />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 底部提示 */}
      <div className="bg-gradient-to-r from-gray-50 to-gray-100 rounded-lg p-3 border border-gray-200">
        <div className="flex items-start space-x-2">
          <div className="w-1 h-1 rounded-full bg-gray-400 mt-1.5 flex-shrink-0" />
          <p className="text-xs text-gray-600 leading-relaxed">
            完成以上任务可累积<span className="font-semibold text-gray-900">1,800+ PU</span>，
            经杠杆放大后预计增值<span className="font-semibold text-orange-600">0.018%+</span>股权。
            任务完成度越高，您的股东排名将显著提升。
          </p>
        </div>
      </div>
    </div>
  );
}
