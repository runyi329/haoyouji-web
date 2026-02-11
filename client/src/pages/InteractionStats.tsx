import { useState } from 'react';
import { useLocation } from 'wouter';
import { trpc } from '@/lib/trpc';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, TrendingUp, Users, Calendar, Target, Loader2 } from 'lucide-react';

export default function InteractionStats() {
  const [, setLocation] = useLocation();

  // 获取累计联络次数
  const { data: totalInteractionCount, isLoading: isLoadingTotal } = trpc.contacts.totalInteractionCount.useQuery();
  
  // 获取联系人统计
  const { data: stats, isLoading: isLoadingStats } = trpc.contacts.stats.useQuery();

  const isLoading = isLoadingTotal || isLoadingStats;

  // 格式化数字
  const formatNumber = (num: number) => {
    return num.toLocaleString('zh-CN');
  };

  // 计算平均联络次数
  const avgInteractions = stats?.totalContacts && totalInteractionCount 
    ? (totalInteractionCount / stats.totalContacts).toFixed(1)
    : '0';

  // 统计卡片数据
  const statsCards = [
    {
      title: '累计联络次数',
      value: totalInteractionCount ? formatNumber(totalInteractionCount) : '0',
      unit: '次',
      icon: TrendingUp,
      color: 'from-[#A80000] to-[#d44]',
      description: '所有人脉的总联络次数'
    },
    {
      title: '人脉总数',
      value: stats?.totalContacts ? formatNumber(stats.totalContacts) : '0',
      unit: '人',
      icon: Users,
      color: 'from-blue-500 to-blue-600',
      description: '已添加的联系人数量'
    },
    {
      title: '平均联络次数',
      value: avgInteractions,
      unit: '次/人',
      icon: Target,
      color: 'from-green-500 to-green-600',
      description: '每个人脉的平均联络频率'
    },
    {
      title: '本周新增联络',
      value: stats?.newThisWeek ? formatNumber(stats.newThisWeek) : '0',
      unit: '人',
      icon: Calendar,
      color: 'from-purple-500 to-purple-600',
      description: '本周新添加的人脉数量'
    },
  ];

  // 联络频率分析
  const interactionAnalysis = [
    { label: '高频联络', value: '活跃维护关系', color: 'text-green-600', bgColor: 'bg-green-50' },
    { label: '中频联络', value: '定期保持联系', color: 'text-blue-600', bgColor: 'bg-blue-50' },
    { label: '低频联络', value: '偶尔互动交流', color: 'text-orange-600', bgColor: 'bg-orange-50' },
    { label: '零联络', value: '待激活人脉', color: 'text-gray-600', bgColor: 'bg-gray-50' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white pb-20">
      {/* Header */}
      <div className="bg-gradient-to-br from-[#A80000] to-[#d44] text-white sticky top-0 z-10 shadow-md">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-3 mb-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLocation('/')}
              className="text-white hover:bg-white/20"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold">累计联络统计</h1>
              <p className="text-sm opacity-90">人脉联络全览分析</p>
            </div>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-[#A80000]" />
        </div>
      ) : (
        <div className="container mx-auto px-4 py-6 space-y-6">
          {/* 核心统计卡片 */}
          <div className="grid grid-cols-2 gap-3">
            {statsCards.map((card, index) => {
              const Icon = card.icon;
              return (
                <Card key={index} className={`bg-gradient-to-br ${card.color} text-white p-4 rounded-2xl shadow-lg border-none`}>
                  <div className="flex items-start justify-between mb-2">
                    <div className="bg-white/20 p-2 rounded-lg">
                      <Icon className="w-5 h-5" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs opacity-90">{card.title}</p>
                    <div className="flex items-baseline space-x-1">
                      <span className="text-2xl font-bold">{card.value}</span>
                      <span className="text-sm opacity-80">{card.unit}</span>
                    </div>
                    <p className="text-xs opacity-75 mt-1">{card.description}</p>
                  </div>
                </Card>
              );
            })}
          </div>

          {/* 联络频率分析 */}
          <Card className="p-5 rounded-2xl shadow-sm">
            <h2 className="text-lg font-bold text-gray-800 mb-4">联络频率分析</h2>
            <div className="space-y-3">
              {interactionAnalysis.map((item, index) => (
                <div key={index} className={`${item.bgColor} p-4 rounded-xl flex items-center justify-between`}>
                  <div>
                    <p className={`font-semibold ${item.color}`}>{item.label}</p>
                    <p className="text-sm text-gray-600 mt-0.5">{item.value}</p>
                  </div>
                  <div className={`w-2 h-2 rounded-full ${item.color.replace('text-', 'bg-')}`}></div>
                </div>
              ))}
            </div>
          </Card>

          {/* 数据洞察 */}
          <Card className="p-5 rounded-2xl shadow-sm bg-gradient-to-br from-blue-50 to-purple-50">
            <h2 className="text-lg font-bold text-gray-800 mb-3">💡 数据洞察</h2>
            <div className="space-y-2 text-sm text-gray-700">
              <p>• 累计联络次数反映了您的人脉维护活跃度</p>
              <p>• 平均联络次数越高，说明人脉关系越紧密</p>
              <p>• 建议定期联络重要人脉，保持关系温度</p>
              <p>• 可以通过互动记录功能记录每次联络</p>
            </div>
          </Card>

          {/* 快速操作 */}
          <div className="grid grid-cols-2 gap-3">
            <Button
              onClick={() => setLocation('/parent/contacts/list')}
              className="bg-gradient-to-r from-[#A80000] to-[#d44] text-white h-12 rounded-xl shadow-md hover:shadow-lg transition-all"
            >
              查看人脉列表
            </Button>
            <Button
              onClick={() => setLocation('/parent/contacts/add')}
              variant="outline"
              className="h-12 rounded-xl border-2 border-[#A80000] text-[#A80000] hover:bg-[#A80000] hover:text-white transition-all"
            >
              添加新人脉
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
