import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { Tag, User, TrendingUp, Hash } from "lucide-react";

type DataScope = "all" | "mine" | "shared";

const COLORS = [
  "#8b5cf6", // 紫色
  "#3b82f6", // 蓝色
  "#10b981", // 绿色
  "#f59e0b", // 橙色
  "#ef4444", // 红色
  "#ec4899", // 粉色
  "#06b6d4", // 青色
  "#8b5cf6", // 紫色
];

export default function TagAnalytics() {
  const [scope, setScope] = useState<DataScope>("all");
  
  const { data, isLoading } = trpc.contacts.tags.analytics.useQuery({ scope });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50 p-3">
        <div className="container max-w-2xl mx-auto space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="p-4 animate-pulse">
              <div className="h-20 bg-gray-200 rounded" />
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50 flex items-center justify-center p-4">
        <Card className="p-6 text-center">
          <p className="text-gray-500">暂无数据</p>
        </Card>
      </div>
    );
  }

  const { overallStats, globalRanking, personalRanking, userDistribution } = data;

  // 转换数据格式
  const globalTagsData = globalRanking.map(tag => ({
    name: tag.tagName,
    count: tag.usageCount,
    color: tag.tagColor,
  }));

  const personalTagsData = personalRanking.map(tag => ({
    name: tag.tagName,
    count: tag.usageCount,
    color: tag.tagColor,
  }));

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50 pb-20">
      {/* 头部 */}
      <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white p-4 sticky top-0 z-10 shadow-lg">
        <div className="container max-w-2xl mx-auto">
          <div className="flex flex-col gap-2">
            <div>
              <h1 className="text-lg font-bold">标签数据透视</h1>
              <p className="text-xs text-purple-100 mt-0.5">全面分析标签使用情况</p>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant={scope === 'all' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setScope('all')}
                className="h-7 px-3 text-xs text-white hover:bg-white/20"
              >
                全部
              </Button>
              <Button
                variant={scope === 'mine' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setScope('mine')}
                className="h-7 px-3 text-xs text-white hover:bg-white/20"
              >
                我的
              </Button>
              <Button
                variant={scope === 'shared' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setScope('shared')}
                className="h-7 px-3 text-xs text-white hover:bg-white/20"
              >
                共享
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="container max-w-2xl mx-auto p-3 space-y-3">
        {/* 关键指标 - 2x2 网格 */}
        <div className="grid grid-cols-2 gap-2">
          <Card className="p-3 bg-gradient-to-br from-purple-500 to-purple-600 text-white border-0 shadow-md">
            <div className="flex items-center gap-2 mb-1">
              <Tag className="w-3.5 h-3.5" />
              <span className="text-xs opacity-90">全局标签</span>
            </div>
            <div className="text-2xl font-bold">{overallStats.globalTags.totalTags}</div>
            <div className="text-xs opacity-80 mt-0.5">使用 {overallStats.globalTags.totalUsage} 次</div>
          </Card>

          <Card className="p-3 bg-gradient-to-br from-blue-500 to-blue-600 text-white border-0 shadow-md">
            <div className="flex items-center gap-2 mb-1">
              <Hash className="w-3.5 h-3.5" />
              <span className="text-xs opacity-90">个人标签</span>
            </div>
            <div className="text-2xl font-bold">{overallStats.personalTags.totalTags}</div>
            <div className="text-xs opacity-80 mt-0.5">自定义标签</div>
          </Card>

          <Card className="p-3 bg-gradient-to-br from-green-500 to-green-600 text-white border-0 shadow-md">
            <div className="flex items-center gap-2 mb-1">
              <User className="w-3.5 h-3.5" />
              <span className="text-xs opacity-90">标记人脉</span>
            </div>
            <div className="text-2xl font-bold">{overallStats.contacts.withGlobalTags}</div>
            <div className="text-xs opacity-80 mt-0.5">使用全局标签</div>
          </Card>

          <Card className="p-3 bg-gradient-to-br from-orange-500 to-orange-600 text-white border-0 shadow-md">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-3.5 h-3.5" />
              <span className="text-xs opacity-90">累计使用</span>
            </div>
            <div className="text-2xl font-bold">{overallStats.overall.totalUsage}</div>
            <div className="text-xs opacity-80 mt-0.5">总使用次数</div>
          </Card>
        </div>

        {/* 标签页 */}
        <Tabs defaultValue="global" className="w-full">
          <TabsList className="grid w-full grid-cols-3 h-9">
            <TabsTrigger value="global" className="text-xs">全局标签</TabsTrigger>
            <TabsTrigger value="personal" className="text-xs">个人标签</TabsTrigger>
            <TabsTrigger value="users" className="text-xs">用户分布</TabsTrigger>
          </TabsList>

          {/* 全局标签排行 */}
          <TabsContent value="global" className="mt-3 space-y-3">
            <Card className="p-3 shadow-md">
              <h3 className="text-sm font-semibold mb-2">全局标签使用排行</h3>
              <p className="text-xs text-gray-500 mb-3">按使用人数排序</p>
              
              {globalTagsData.length > 0 ? (
                <ResponsiveContainer width="100%" height={Math.min(globalTagsData.length * 28 + 40, 400)}>
                  <BarChart
                    data={globalTagsData.slice(0, 15)}
                    layout="vertical"
                    margin={{ top: 5, right: 20, left: 5, bottom: 5 }}
                  >
                    <XAxis type="number" tick={{ fontSize: 10 }} />
                    <YAxis 
                      dataKey="name" 
                      type="category" 
                      width={60}
                      tick={{ fontSize: 10 }}
                    />
                    <Tooltip 
                      contentStyle={{ fontSize: 12 }}
                      formatter={(value: number) => [`${value} 次`, "使用次数"]}
                    />
                    <Bar dataKey="count" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-center text-gray-400 text-xs py-8">暂无数据</p>
              )}
            </Card>
          </TabsContent>

          {/* 个人标签排行 */}
          <TabsContent value="personal" className="mt-3 space-y-3">
            <Card className="p-3 shadow-md">
              <h3 className="text-sm font-semibold mb-2">个人标签排行</h3>
              <p className="text-xs text-gray-500 mb-3">按标签数量排序</p>
              
              {personalTagsData.length > 0 ? (
                <ResponsiveContainer width="100%" height={Math.min(personalTagsData.length * 28 + 40, 400)}>
                  <BarChart
                    data={personalTagsData.slice(0, 15)}
                    layout="vertical"
                    margin={{ top: 5, right: 20, left: 5, bottom: 5 }}
                  >
                    <XAxis type="number" tick={{ fontSize: 10 }} />
                    <YAxis 
                      dataKey="name" 
                      type="category" 
                      width={60}
                      tick={{ fontSize: 10 }}
                    />
                    <Tooltip 
                      contentStyle={{ fontSize: 12 }}
                      formatter={(value: number) => [`${value} 个`, "标签数"]}
                    />
                    <Bar dataKey="count" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-center text-gray-400 text-xs py-8">暂无数据</p>
              )}
            </Card>

            {/* 个人标签分布饼图 */}
            {personalTagsData.length > 0 && (
              <Card className="p-3 shadow-md">
                <h3 className="text-sm font-semibold mb-2">个人标签分布</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={personalTagsData.slice(0, 8)}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={2}
                      dataKey="count"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      labelLine={{ stroke: "#666", strokeWidth: 1 }}
                    >
                      {personalTagsData.slice(0, 8).map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </Card>
            )}
          </TabsContent>

          {/* 用户分布 */}
          <TabsContent value="users" className="mt-3 space-y-3">
            <Card className="p-3 shadow-md">
              <h3 className="text-sm font-semibold mb-2">用户标签使用分布</h3>
              <p className="text-xs text-gray-500 mb-3">每个用户使用标签的情况</p>
              
              {userDistribution.length > 0 ? (
                <div className="space-y-2">
                  {userDistribution.slice(0, 10).map((user, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <div className="w-8 text-xs text-gray-500 font-medium">#{index + 1}</div>
                      <div className="flex-1">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-xs font-medium truncate">{user.userName}</span>
                          <span className="text-xs text-gray-600 ml-2">{user.totalTags} 个</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-1.5">
                          <div
                            className="bg-gradient-to-r from-green-500 to-green-600 h-1.5 rounded-full transition-all"
                            style={{
                              width: `${(user.totalTags / Math.max(...userDistribution.map(u => u.totalTags))) * 100}%`,
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-gray-400 text-xs py-8">暂无数据</p>
              )}
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
