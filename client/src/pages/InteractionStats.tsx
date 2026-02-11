import { useState } from 'react';
import { useLocation } from 'wouter';
import { trpc } from '@/lib/trpc';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, TrendingUp, Users, Target, Activity, Loader2, BarChart3, Clock } from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, AreaChart
} from 'recharts';

export default function InteractionStats() {
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<'overview' | 'frequency' | 'time'>('overview');

  // 获取数据
  const { data: overview, isLoading: isLoadingOverview } = trpc.contacts.interactionOverview.useQuery();
  const { data: distribution, isLoading: isLoadingDist } = trpc.contacts.interactionDistribution.useQuery(
    undefined,
    { enabled: activeTab === 'frequency' }
  );
  const { data: timeSeries, isLoading: isLoadingTime } = trpc.contacts.interactionTimeSeries.useQuery(
    { granularity: 'day', range: 30 },
    { enabled: activeTab === 'time' }
  );

  const isLoading = isLoadingOverview;

  // Tab配置
  const tabs = [
    { id: 'overview' as const, label: '总览', icon: BarChart3 },
    { id: 'frequency' as const, label: '频次', icon: Activity },
    { id: 'time' as const, label: '时间', icon: Clock },
  ];

  // 颜色配置(适配主题)
  const colors = {
    primary: 'hsl(var(--primary))',
    secondary: 'hsl(var(--secondary))',
    success: '#10b981',
    warning: '#f59e0b',
    danger: '#ef4444',
    info: '#3b82f6',
    core: '#10b981',
    active: '#3b82f6',
    normal: '#f59e0b',
    silent: '#6b7280',
  };

  // 渲染总览Tab
  const renderOverview = () => {
    if (!overview) return null;

    const coreMetrics = [
      {
        title: '累计联络',
        value: overview.totalInteractions,
        unit: '次',
        icon: TrendingUp,
        color: 'from-blue-500 to-blue-600',
        trend: overview.trends.thisMonth.interactions > overview.trends.lastMonth.interactions ? 'up' : 'down',
        trendValue: overview.trends.lastMonth.interactions > 0 
          ? Math.round(((overview.trends.thisMonth.interactions - overview.trends.lastMonth.interactions) / overview.trends.lastMonth.interactions) * 100)
          : 0
      },
      {
        title: '活跃人脉',
        value: overview.activeContacts,
        unit: '人',
        icon: Users,
        color: 'from-green-500 to-green-600',
        trend: overview.trends.thisMonth.contacts > overview.trends.lastMonth.contacts ? 'up' : 'down',
        trendValue: overview.trends.lastMonth.contacts > 0
          ? Math.round(((overview.trends.thisMonth.contacts - overview.trends.lastMonth.contacts) / overview.trends.lastMonth.contacts) * 100)
          : 0
      },
      {
        title: '平均频次',
        value: overview.avgFrequency,
        unit: '次/人',
        icon: Target,
        color: 'from-purple-500 to-purple-600',
        trend: 'neutral' as const,
        trendValue: 0
      },
      {
        title: '核心圈层',
        value: overview.coreCircle,
        unit: '人',
        icon: Activity,
        color: 'from-orange-500 to-orange-600',
        trend: 'neutral' as const,
        trendValue: 0
      },
    ];

    return (
      <div className="space-y-4">
        {/* 核心指标卡片 */}
        <div className="grid grid-cols-2 gap-3">
          {coreMetrics.map((metric, index) => {
            const Icon = metric.icon;
            return (
              <Card key={index} className={`bg-gradient-to-br ${metric.color} text-white p-4 rounded-xl shadow-md border-none`}>
                <div className="flex items-start justify-between mb-2">
                  <div className="bg-white/20 p-2 rounded-lg">
                    <Icon className="w-4 h-4" />
                  </div>
                  {metric.trend !== 'neutral' && (
                    <div className={`text-xs px-2 py-0.5 rounded-full ${metric.trend === 'up' ? 'bg-white/20' : 'bg-black/10'}`}>
                      {metric.trend === 'up' ? '↑' : '↓'} {Math.abs(metric.trendValue)}%
                    </div>
                  )}
                </div>
                <div className="space-y-1">
                  <p className="text-xs opacity-90">{metric.title}</p>
                  <div className="flex items-baseline space-x-1">
                    <span className="text-2xl font-bold">{metric.value.toLocaleString()}</span>
                    <span className="text-sm opacity-80">{metric.unit}</span>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        {/* 洞察卡片 */}
        {overview.insights.length > 0 && (
          <Card className="p-4 rounded-xl shadow-sm bg-gradient-to-br from-blue-50 to-purple-50">
            <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <span className="text-lg">💡</span> 数据洞察
            </h3>
            <div className="space-y-2">
              {overview.insights.map((insight, index) => (
                <div key={index} className="flex items-start gap-2 text-sm text-gray-700">
                  <span className="text-blue-500 mt-0.5">•</span>
                  <span>{insight.text}</span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* 月度趋势 */}
        <Card className="p-4 rounded-xl shadow-sm">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">月度趋势对比</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
              <div>
                <p className="text-xs text-gray-600">本月互动</p>
                <p className="text-xl font-bold text-blue-600">{overview.trends.thisMonth.interactions}</p>
              </div>
              <div>
                <p className="text-xs text-gray-600">活跃人脉</p>
                <p className="text-xl font-bold text-blue-600">{overview.trends.thisMonth.contacts}</p>
              </div>
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div>
                <p className="text-xs text-gray-600">上月互动</p>
                <p className="text-xl font-bold text-gray-600">{overview.trends.lastMonth.interactions}</p>
              </div>
              <div>
                <p className="text-xs text-gray-600">活跃人脉</p>
                <p className="text-xl font-bold text-gray-600">{overview.trends.lastMonth.contacts}</p>
              </div>
            </div>
          </div>
        </Card>
      </div>
    );
  };

  // 渲染频次分布Tab
  const renderFrequency = () => {
    if (isLoadingDist) {
      return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>;
    }
    if (!distribution) return null;

    // 准备直方图数据(合并8+)
    const histogramData = distribution.histogram
      .filter(d => d.count <= 7)
      .map(d => ({ name: `${d.count}次`, value: d.contacts }));
    
    const over8 = distribution.histogram
      .filter(d => d.count >= 8)
      .reduce((sum, d) => sum + d.contacts, 0);
    
    if (over8 > 0) {
      histogramData.push({ name: '8+次', value: over8 });
    }

    // 准备帕累托数据
    const paretoData = distribution.pareto.map(p => ({
      name: p.tier,
      contacts: p.contacts,
      cumulative: Math.round(p.cumulative * 100)
    }));

    return (
      <div className="space-y-4">
        {/* 直方图 */}
        <Card className="p-4 rounded-xl shadow-sm">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">联络频次分布</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={histogramData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip 
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
                formatter={(value: any) => [`${value}人`, '人数']}
              />
              <Bar dataKey="value" fill={colors.primary} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* 帕累托图 */}
        <Card className="p-4 rounded-xl shadow-sm">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">圈层分析(帕累托)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={paretoData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis yAxisId="left" tick={{ fontSize: 12 }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar yAxisId="left" dataKey="contacts" fill={colors.info} name="人数" radius={[4, 4, 0, 0]} />
              <Line yAxisId="right" type="monotone" dataKey="cumulative" stroke={colors.danger} name="累计占比%" strokeWidth={2} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* 圈层表格 */}
        <Card className="p-4 rounded-xl shadow-sm">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">圈层分类统计</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-2 font-semibold text-gray-700">圈层</th>
                  <th className="text-right py-2 px-2 font-semibold text-gray-700">人数</th>
                  <th className="text-right py-2 px-2 font-semibold text-gray-700">占比</th>
                </tr>
              </thead>
              <tbody>
                {distribution.pareto.map((p, index) => (
                  <tr key={index} className="border-b border-gray-100">
                    <td className="py-2 px-2 flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${
                        p.tier === '核心圈' ? 'bg-green-500' :
                        p.tier === '活跃圈' ? 'bg-blue-500' :
                        p.tier === '普通圈' ? 'bg-orange-500' : 'bg-gray-500'
                      }`}></span>
                      {p.tier}
                    </td>
                    <td className="text-right py-2 px-2 font-medium">{p.contacts}</td>
                    <td className="text-right py-2 px-2 text-gray-600">{Math.round(p.cumulative * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    );
  };

  // 渲染时间分析Tab
  const renderTime = () => {
    if (isLoadingTime) {
      return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>;
    }
    if (!timeSeries) return null;

    // 准备趋势图数据
    const trendData = timeSeries.series.map(s => ({
      date: s.date,
      互动次数: s.interactions,
      活跃人脉: s.contacts
    }));

    // 准备周模式数据
    const weekData = [
      { day: '周一', value: timeSeries.weekPattern.monday || 0 },
      { day: '周二', value: timeSeries.weekPattern.tuesday || 0 },
      { day: '周三', value: timeSeries.weekPattern.wednesday || 0 },
      { day: '周四', value: timeSeries.weekPattern.thursday || 0 },
      { day: '周五', value: timeSeries.weekPattern.friday || 0 },
      { day: '周六', value: timeSeries.weekPattern.saturday || 0 },
      { day: '周日', value: timeSeries.weekPattern.sunday || 0 },
    ];

    return (
      <div className="space-y-4">
        {/* 趋势折线图 */}
        <Card className="p-4 rounded-xl shadow-sm">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">近30天互动趋势</h3>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={trendData}>
              <defs>
                <linearGradient id="colorInteractions" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={colors.info} stopOpacity={0.3}/>
                  <stop offset="95%" stopColor={colors.info} stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis 
                dataKey="date" 
                tick={{ fontSize: 10 }}
                tickFormatter={(value) => value.split('-').slice(1).join('/')}
              />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip 
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
                labelFormatter={(label) => `日期: ${label}`}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area 
                type="monotone" 
                dataKey="互动次数" 
                stroke={colors.info} 
                fillOpacity={1} 
                fill="url(#colorInteractions)" 
                strokeWidth={2}
              />
              <Line 
                type="monotone" 
                dataKey="活跃人脉" 
                stroke={colors.success} 
                strokeWidth={2}
                dot={{ r: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        {/* 周模式分析 */}
        <Card className="p-4 rounded-xl shadow-sm">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">周模式分析</h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={weekData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="day" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip 
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
                formatter={(value: any) => [`${value}次`, '互动']}
              />
              <Bar dataKey="value" fill={colors.success} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* 日历热力图简化版 */}
        {timeSeries.heatmap.length > 0 && (
          <Card className="p-4 rounded-xl shadow-sm">
            <h3 className="text-sm font-semibold text-gray-800 mb-3">每日互动强度</h3>
            <div className="grid grid-cols-7 gap-1">
              {timeSeries.heatmap.slice(-28).map((day, index) => {
                const intensity = day.value;
                const opacity = Math.min(intensity / 10, 1);
                return (
                  <div
                    key={index}
                    className="aspect-square rounded flex items-center justify-center text-xs"
                    style={{
                      backgroundColor: `rgba(59, 130, 246, ${opacity})`,
                      color: opacity > 0.5 ? 'white' : '#666'
                    }}
                    title={`${day.date}: ${day.value}次`}
                  >
                    {intensity}
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </div>
    );
  };



  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white pb-20">
      {/* Header */}
      <div className="bg-gradient-to-br from-blue-600 to-blue-700 text-white sticky top-0 z-10 shadow-lg">
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
              <p className="text-sm opacity-90">投行级数据分析报告</p>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                    activeTab === tab.id
                      ? 'bg-white text-blue-600 shadow-md'
                      : 'bg-white/10 text-white hover:bg-white/20'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      ) : (
        <div className="container mx-auto px-4 py-6">
          {activeTab === 'overview' && renderOverview()}
          {activeTab === 'frequency' && renderFrequency()}
          {activeTab === 'time' && renderTime()}
        </div>
      )}
    </div>
  );
}
