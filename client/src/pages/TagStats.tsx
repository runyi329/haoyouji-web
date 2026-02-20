import { useLocation } from 'wouter';
import { trpc } from '@/lib/trpc';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Tags, Loader2 } from 'lucide-react';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip
} from 'recharts';

export default function TagStats() {
  const [, setLocation] = useLocation();

  // 获取标签统计数据
  const { data: tagStats, isLoading } = trpc.contacts.tagInteractionStats.useQuery();

  // 颜色配置
  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#A80000', '#6b7280'];

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white pb-20">
      {/* Header */}
      <div className="bg-gradient-to-br from-[#A80000] to-[#8a0000] text-white sticky top-0 z-10 shadow-lg">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLocation('/')}
              className="text-white hover:bg-white/20"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold">累计标签统计</h1>
              <p className="text-sm opacity-90">标签使用与互动分析</p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-[#D32F2F]" />
        </div>
      ) : tagStats ? (
        <div className="container mx-auto px-4 py-6 space-y-4">
          {/* 标签总数卡片 */}
          <Card className="bg-gradient-to-br from-[#A80000] to-[#d44] text-white p-6 rounded-xl shadow-md border-none">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm opacity-90 mb-1">标签使用总数</p>
                <div className="flex items-baseline space-x-2">
                  <span className="text-4xl font-bold">
                    {tagStats.distribution.reduce((sum, t) => sum + t.contacts, 0).toLocaleString()}
                  </span>
                  <span className="text-lg opacity-80">次</span>
                </div>
                <p className="text-xs opacity-75 mt-2">
                  共 {tagStats.distribution.length} 个标签
                </p>
              </div>
              <div className="bg-white/20 p-4 rounded-full">
                <Tags className="w-8 h-8" />
              </div>
            </div>
          </Card>

          {/* 标签分布饼图 */}
          <Card className="p-4 rounded-xl shadow-sm">
            <h3 className="text-sm font-semibold text-[#424242] mb-3">标签分布(TOP5)</h3>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={(() => {
                    const top5 = tagStats.distribution.slice(0, 5);
                    const othersPercentage = tagStats.distribution.slice(5).reduce((sum, t) => sum + t.percentage, 0);
                    return [
                      ...top5.map(t => ({ name: t.tag, value: t.percentage })),
                      ...(othersPercentage > 0 ? [{ name: '其他', value: othersPercentage }] : [])
                    ];
                  })()}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value }) => `${name} ${value.toFixed(1)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {tagStats.distribution.slice(0, 6).map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: any) => `${value.toFixed(1)}%`} />
              </PieChart>
            </ResponsiveContainer>
          </Card>

          {/* 标签互动矩阵 */}
          <Card className="p-4 rounded-xl shadow-sm">
            <h3 className="text-sm font-semibold text-[#424242] mb-3">标签互动矩阵</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#E0E0E0]">
                    <th className="text-left py-2 px-2 font-semibold text-[#424242]">标签</th>
                    <th className="text-right py-2 px-2 font-semibold text-[#424242]">人数</th>
                    <th className="text-right py-2 px-2 font-semibold text-[#424242]">互动</th>
                    <th className="text-right py-2 px-2 font-semibold text-[#424242]">人均</th>
                    <th className="text-right py-2 px-2 font-semibold text-[#424242]">活跃率</th>
                  </tr>
                </thead>
                <tbody>
                  {tagStats.matrix.slice(0, 15).map((m, index) => (
                    <tr key={index} className="border-b border-[#E0E0E0]">
                      <td className="py-2 px-2 font-medium text-[#424242]">{m.tag}</td>
                      <td className="text-right py-2 px-2">{m.contacts}</td>
                      <td className="text-right py-2 px-2">{m.interactions}</td>
                      <td className="text-right py-2 px-2 text-[#1976D2] font-medium">{m.avgPerContact}</td>
                      <td className="text-right py-2 px-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs ${
                          m.activeRate >= 20 ? 'bg-[#E8F5E9] text-[#4CAF50]' :
                          m.activeRate >= 10 ? 'bg-[#F5F5F5] text-[#1976D2]' :
                          'bg-gray-100 text-[#424242]'
                        }`}>
                          {m.activeRate}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* 标签排行 */}
          <Card className="p-4 rounded-xl shadow-sm">
            <h3 className="text-sm font-semibold text-[#424242] mb-3">标签人数排行</h3>
            <div className="space-y-2">
              {tagStats.distribution.slice(0, 10).map((t, index) => (
                <div key={index} className="flex items-center gap-2">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    index === 0 ? 'bg-[#FAF3ED] text-[#CBA471]' :
                    index === 1 ? 'bg-gray-100 text-[#757575]' :
                    index === 2 ? 'bg-[#FAF3ED] text-[#CBA471]' :
                    'bg-[#F5F5F5] text-[#1976D2]'
                  }`}>
                    {index + 1}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-[#424242]">{t.tag}</span>
                      <span className="text-xs text-[#757575]">{t.contacts}人 ({t.percentage}%)</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-1.5">
                      <div 
                        className={`h-1.5 rounded-full transition-all ${
                          index === 0 ? 'bg-[#CBA471]' :
                          index === 1 ? 'bg-gray-400' :
                          index === 2 ? 'bg-[#CBA471]' :
                          'bg-[#1976D2]'
                        }`}
                        style={{ width: `${t.percentage}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* 数据洞察 */}
          <Card className="p-4 rounded-xl shadow-sm bg-gradient-to-br from-red-50 to-rose-50">
            <h3 className="text-sm font-semibold text-[#424242] mb-3 flex items-center gap-2">
              <span className="text-lg">💡</span> 标签洞察
            </h3>
            <div className="space-y-2 text-sm text-[#424242]">
              {tagStats.distribution.length > 0 && (
                <>
                  <p>• 最热门标签: <span className="font-semibold text-[#D32F2F]">{tagStats.distribution[0].tag}</span>，使用了 {tagStats.distribution[0].contacts} 次</p>
                  {tagStats.matrix.length > 0 && (
                    <>
                      <p>• 最活跃标签: <span className="font-semibold text-[#D32F2F]">
                        {tagStats.matrix.reduce((max, m) => m.activeRate > max.activeRate ? m : max).tag}
                      </span>，活跃率 {tagStats.matrix.reduce((max, m) => m.activeRate > max.activeRate ? m : max).activeRate}%</p>
                      <p>• 人均互动最高: <span className="font-semibold text-[#D32F2F]">
                        {tagStats.matrix.reduce((max, m) => m.avgPerContact > max.avgPerContact ? m : max).tag}
                      </span>，人均 {tagStats.matrix.reduce((max, m) => m.avgPerContact > max.avgPerContact ? m : max).avgPerContact} 次</p>
                    </>
                  )}
                </>
              )}
            </div>
          </Card>

          {/* 快速操作 */}
          <div className="grid grid-cols-2 gap-3">
            <Button
              onClick={() => setLocation('/parent/contacts/tags')}
              className="bg-gradient-to-r from-[#A80000] to-[#8a0000] text-white h-12 rounded-xl shadow-md hover:shadow-lg transition-all"
            >
              管理标签
            </Button>
            <Button
              onClick={() => setLocation('/parent/contacts/list')}
              variant="outline"
              className="h-12 rounded-xl border-2 border-[#D32F2F] text-[#D32F2F] hover:bg-[#D32F2F] hover:text-white transition-all"
            >
              查看人脉
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center min-h-[60vh] text-[#757575]">
          暂无标签数据
        </div>
      )}
    </div>
  );
}
