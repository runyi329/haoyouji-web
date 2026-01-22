import { useState } from 'react';
import React from 'react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { BarChart3, TrendingUp, Users, Clock, Tag, Filter } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function TagAnalytics() {
  const [scope, setScope] = React.useState<'all' | 'mine' | 'shared' | 'global'>('all');
  const { data, isLoading } = trpc.contacts.tags.analytics.useQuery({ scope });

  if (isLoading) {
    return (
      <div className="container mx-auto py-6 space-y-6">
        <Skeleton className="h-12 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="container mx-auto py-6">
        <div className="text-center text-muted-foreground">暂无数据</div>
      </div>
    );
  }

  const { overallStats, globalRanking, personalRanking, userDistribution, recentTags } = data;

  return (
    <div className="container mx-auto py-4 px-4 space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">标签大数据透视</h1>
          <p className="text-sm text-muted-foreground mt-1">全面分析标签使用情况和趋势</p>
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={scope} onValueChange={(value: any) => setScope(value)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部</SelectItem>
              <SelectItem value="mine">自己</SelectItem>
              <SelectItem value="shared">共享</SelectItem>
              <SelectItem value="global">全局</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* 关键指标卡片 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Tag className="h-4 w-4 text-blue-500" />
              全局标签
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overallStats?.globalTags.totalTags || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              使用 {overallStats?.globalTags.totalUsage || 0} 次
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Tag className="h-4 w-4 text-purple-500" />
              个人标签
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overallStats?.personalTags.totalTags || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              自定义标签
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="h-4 w-4 text-green-500" />
              标记人脉
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overallStats?.contacts.withGlobalTags || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              使用全局标签
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-orange-500" />
              累计使用
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overallStats?.overall.totalUsage || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              总使用次数
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 标签页 */}
      <Tabs defaultValue="global" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="global">全局标签</TabsTrigger>
          <TabsTrigger value="personal">个人标签</TabsTrigger>
          <TabsTrigger value="users">用户分布</TabsTrigger>
        </TabsList>

        {/* 全局标签排行榜 */}
        <TabsContent value="global" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                全局标签使用排行
              </CardTitle>
              <CardDescription>按使用人数排序，显示最热门的标签</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {globalRanking.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">暂无数据</div>
                ) : (
                  globalRanking.slice(0, 20).map((tag, index) => (
                    <div key={tag.tagId} className="flex items-center gap-3">
                      <div className="w-8 text-center font-bold text-muted-foreground">
                        #{index + 1}
                      </div>
                      <Badge style={{ backgroundColor: tag.tagColor }} className="text-white">
                        {tag.tagName}
                      </Badge>
                      <div className="flex-1">
                        <div className="h-2 bg-secondary rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-500 transition-all"
                            style={{
                              width: `${(tag.usageCount / (globalRanking[0]?.usageCount || 1)) * 100}%`,
                            }}
                          />
                        </div>
                      </div>
                      <div className="w-16 text-right font-semibold">
                        {tag.usageCount} 次
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 个人标签排行榜 */}
        <TabsContent value="personal" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                个人标签使用排行
              </CardTitle>
              <CardDescription>按标签数量排序，显示使用最多的个人标签</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {personalRanking.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">暂无数据</div>
                ) : (
                  personalRanking.slice(0, 20).map((tag, index) => (
                    <div key={index} className="flex items-center gap-3">
                      <div className="w-8 text-center font-bold text-muted-foreground">
                        #{index + 1}
                      </div>
                      <Badge style={{ backgroundColor: tag.tagColor }} className="text-white">
                        {tag.tagName}
                      </Badge>
                      <div className="flex-1">
                        <div className="h-2 bg-secondary rounded-full overflow-hidden">
                          <div
                            className="h-full bg-purple-500 transition-all"
                            style={{
                              width: `${(tag.usageCount / (personalRanking[0]?.usageCount || 1)) * 100}%`,
                            }}
                          />
                        </div>
                      </div>
                      <div className="w-16 text-right font-semibold">
                        {tag.usageCount} 个
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 用户分布 */}
        <TabsContent value="users" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                用户标签使用分布
              </CardTitle>
              <CardDescription>每个用户使用标签的情况统计</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {userDistribution.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">暂无数据</div>
                ) : (
                  userDistribution.slice(0, 20).map((user, index) => (
                    <div key={user.userId} className="flex items-center gap-3">
                      <div className="w-8 text-center font-bold text-muted-foreground">
                        #{index + 1}
                      </div>
                      <div className="w-32 truncate font-medium">
                        {user.userName}
                      </div>
                      <div className="flex-1 flex gap-2 items-center">
                        <div className="flex-1">
                          <div className="h-2 bg-secondary rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all"
                              style={{
                                width: `${(user.totalTags / (userDistribution[0]?.totalTags || 1)) * 100}%`,
                              }}
                            />
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          全局: {user.globalTags} | 个人: {user.personalTags}
                        </div>
                      </div>
                      <div className="w-16 text-right font-semibold">
                        {user.totalTags}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>

      {/* 最近创建的标签 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            最近创建的标签
          </CardTitle>
          <CardDescription>最新添加的标签列表</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {recentTags.length === 0 ? (
              <div className="text-center text-muted-foreground py-4 w-full">暂无数据</div>
            ) : (
              recentTags.map((tag) => (
                <Badge
                  key={`${tag.type}-${tag.id}`}
                  style={{ backgroundColor: tag.color }}
                  className="text-white"
                >
                  {tag.name}
                  <span className="ml-1 text-xs opacity-75">
                    ({tag.type === 'global' ? '全局' : '个人'})
                  </span>
                </Badge>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
