import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Users, TrendingUp, Tag, MapPin, Phone, Building, Award } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import RegionTrendChart from "@/components/RegionTrendChart";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

const COLORS = ['#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#6366f1', '#14b8a6'];

export default function DataComparison() {
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<"all" | "my" | "shared">("my");
  const { user, isLoading: authLoading } = useAuth();
  
  // 获取"我的"数据分析
  const { data: myData, isLoading, error } = trpc.analytics.myData.useQuery(undefined, {
    enabled: activeTab === "my" && !!user,
  });
  
  // 如果正在加载认证状态
  if (authLoading) {
    return (
      <div className="container py-8">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="sm" onClick={() => setLocation('/parent/contacts')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            返回
          </Button>
          <h1 className="text-2xl font-bold">数据分析</h1>
        </div>
        <div className="text-center py-12 text-muted-foreground">加载中...</div>
      </div>
    );
  }
  
  // 如果未登录，显示登录提示
  if (!user) {
    return (
      <div className="container py-8">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="sm" onClick={() => setLocation('/parent/contacts')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            返回
          </Button>
          <h1 className="text-2xl font-bold">数据分析</h1>
        </div>
        <Card className="max-w-md mx-auto">
          <CardHeader>
            <CardTitle>需要登录</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">请先登录以查看数据分析</p>
            <Button onClick={() => window.location.href = getLoginUrl()} className="w-full">
              前往登录
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  if (isLoading && activeTab === "my") {
    return (
      <div className="container py-8">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="sm" onClick={() => setLocation('/parent/contacts')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            返回
          </Button>
          <h1 className="text-2xl font-bold">数据分析</h1>
        </div>
        <div className="text-center py-12 text-muted-foreground">加载中...</div>
      </div>
    );
  }
  
  if (error && activeTab === "my") {
    return (
      <div className="container py-8">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="sm" onClick={() => setLocation('/parent/contacts')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            返回
          </Button>
          <h1 className="text-2xl font-bold">数据分析</h1>
        </div>
        <div className="text-center py-12 text-destructive">加载失败：{error.message}</div>
      </div>
    );
  }
  
  return (
    <div className="container py-4 sm:py-8 px-2 sm:px-4">
      {/* 顶部导航 */}
      <div className="flex items-center gap-4 mb-4 sm:mb-6">
        <Button variant="ghost" size="sm" onClick={() => setLocation('/parent/contacts')} className="h-8 sm:h-10">
          <ArrowLeft className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-2" />
          <span className="hidden sm:inline">返回</span>
        </Button>
        <h1 className="text-xl sm:text-2xl font-bold">数据分析</h1>
      </div>
      
      {/* Tab切换 */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-4 sm:mb-6">
          <TabsTrigger value="all">全部</TabsTrigger>
          <TabsTrigger value="my">我的</TabsTrigger>
          <TabsTrigger value="shared">共享</TabsTrigger>
        </TabsList>
        
        {/* 我的数据Tab */}
        <TabsContent value="my" className="space-y-4 sm:space-y-6">
          {myData && (
            <>
              {/* 关键指标卡片 */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
                <Card>
                  <CardHeader className="pb-2 sm:pb-3">
                    <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground flex items-center gap-1 sm:gap-2">
                      <Users className="h-3 w-3 sm:h-4 sm:w-4" />
                      人脉总数
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-xl sm:text-2xl font-bold">{myData.keyMetrics.totalContacts}</div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader className="pb-2 sm:pb-3">
                    <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground flex items-center gap-1 sm:gap-2">
                      <TrendingUp className="h-3 w-3 sm:h-4 sm:w-4" />
                      本月新增
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-xl sm:text-2xl font-bold">{myData.keyMetrics.monthlyNew}</div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader className="pb-2 sm:pb-3">
                    <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground flex items-center gap-1 sm:gap-2">
                      <Phone className="h-3 w-3 sm:h-4 sm:w-4" />
                      累计联络
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-xl sm:text-2xl font-bold">{myData.keyMetrics.totalInteractions}<span className="text-xs sm:text-sm font-normal text-muted-foreground ml-1">次</span></div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader className="pb-2 sm:pb-3">
                    <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground flex items-center gap-1 sm:gap-2">
                      <Phone className="h-3 w-3 sm:h-4 sm:w-4" />
                      联络频率
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-xl sm:text-2xl font-bold">{myData.keyMetrics.avgFrequency}<span className="text-xs sm:text-sm font-normal text-muted-foreground ml-1">天</span></div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader className="pb-2 sm:pb-3">
                    <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground flex items-center gap-1 sm:gap-2">
                      <Users className="h-3 w-3 sm:h-4 sm:w-4" />
                      活跃人脉
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-xl sm:text-2xl font-bold">{myData.keyMetrics.activeContacts}<span className="text-xs sm:text-sm font-normal text-muted-foreground ml-1">人</span></div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader className="pb-2 sm:pb-3">
                    <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground flex items-center gap-1 sm:gap-2">
                      <Award className="h-3 w-3 sm:h-4 sm:w-4" />
                      需要关注
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-xl sm:text-2xl font-bold">{myData.keyMetrics.needAttention}<span className="text-xs sm:text-sm font-normal text-muted-foreground ml-1">人</span></div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader className="pb-2 sm:pb-3">
                    <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground flex items-center gap-1 sm:gap-2">
                      <Tag className="h-3 w-3 sm:h-4 sm:w-4" />
                      累计标签
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-xl sm:text-2xl font-bold">{myData.keyMetrics.totalTags}<span className="text-xs sm:text-sm font-normal text-muted-foreground ml-1">个</span></div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader className="pb-2 sm:pb-3">
                    <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground flex items-center gap-1 sm:gap-2">
                      <Building className="h-3 w-3 sm:h-4 sm:w-4" />
                      公司数量
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-xl sm:text-2xl font-bold">{myData.keyMetrics.totalCompanies}<span className="text-xs sm:text-sm font-normal text-muted-foreground ml-1">家</span></div>
                  </CardContent>
                </Card>
              </div>
              
              {/* 人脉增长趋势 */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base sm:text-lg">人脉增长趋势</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={myData.growthTrend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis 
                        dataKey="month" 
                        tick={{ fontSize: 12, fill: '#6b7280' }}
                        stroke="#9ca3af"
                      />
                      <YAxis 
                        tick={{ fontSize: 12, fill: '#6b7280' }}
                        stroke="#9ca3af"
                      />
                      <Tooltip 
                        contentStyle={{ fontSize: 12, backgroundColor: '#fff', border: '1px solid #e5e7eb' }}
                      />
                      <Bar dataKey="newCount" fill="#8b5cf6" name="新增人脉" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              
              {/* 标签使用TOP10 */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base sm:text-lg">标签使用TOP10</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={myData.tagStats.slice(0, 10)} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis 
                        type="number" 
                        tick={{ fontSize: 12, fill: '#6b7280' }}
                        stroke="#9ca3af"
                      />
                      <YAxis 
                        type="category" 
                        dataKey="name" 
                        tick={{ fontSize: 12, fill: '#6b7280' }}
                        stroke="#9ca3af"
                        width={80}
                      />
                      <Tooltip 
                        contentStyle={{ fontSize: 12, backgroundColor: '#fff', border: '1px solid #e5e7eb' }}
                      />
                      <Bar dataKey="count" fill="#06b6d4" name="使用次数" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              
              {/* 地区分布TOP10 */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base sm:text-lg">地区分布TOP10</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={myData.regionStats.slice(0, 10)} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis 
                        type="number" 
                        tick={{ fontSize: 12, fill: '#6b7280' }}
                        stroke="#9ca3af"
                      />
                      <YAxis 
                        type="category" 
                        dataKey="province" 
                        tick={{ fontSize: 12, fill: '#6b7280' }}
                        stroke="#9ca3af"
                        width={100}
                      />
                      <Tooltip 
                        contentStyle={{ fontSize: 12, backgroundColor: '#fff', border: '1px solid #e5e7eb' }}
                      />
                      <Bar dataKey="count" fill="#10b981" name="人脉数量" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              
              {/* 地域分布趋势图 */}
              <RegionTrendChart userId={user.id} />
              
              {/* 联络趋势 */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base sm:text-lg">联络趋势</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={myData.activityStats.interactionTrend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis 
                        dataKey="month" 
                        tick={{ fontSize: 12, fill: '#6b7280' }}
                        stroke="#9ca3af"
                      />
                      <YAxis 
                        tick={{ fontSize: 12, fill: '#6b7280' }}
                        stroke="#9ca3af"
                      />
                      <Tooltip 
                        contentStyle={{ fontSize: 12, backgroundColor: '#fff', border: '1px solid #e5e7eb' }}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="count" 
                        stroke="#f59e0b" 
                        strokeWidth={2}
                        name="联络次数"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              
              {/* 活跃人脉分布 */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base sm:text-lg">活跃人脉分布</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie
                        data={myData.activityStats.distribution}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, count }) => `${name}: ${count}`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="count"
                      >
                        {myData.activityStats.distribution.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ fontSize: 12, backgroundColor: '#fff', border: '1px solid #e5e7eb' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              
              {/* 公司分布TOP10 */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base sm:text-lg">公司分布TOP10</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={myData.companyStats} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis 
                        type="number" 
                        tick={{ fontSize: 12, fill: '#6b7280' }}
                        stroke="#9ca3af"
                      />
                      <YAxis 
                        type="category" 
                        dataKey="company" 
                        tick={{ fontSize: 12, fill: '#6b7280' }}
                        stroke="#9ca3af"
                        width={120}
                      />
                      <Tooltip 
                        contentStyle={{ fontSize: 12, backgroundColor: '#fff', border: '1px solid #e5e7eb' }}
                      />
                      <Bar dataKey="count" fill="#ec4899" name="人脉数量" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              
              {/* 人脉质量分析 */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base sm:text-lg">人脉质量分析</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">信息完整度</span>
                      <span className="text-lg font-bold">{myData.qualityStats.completeRate}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-green-500 h-2 rounded-full" 
                        style={{ width: `${myData.qualityStats.completeRate}%` }}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4 mt-4">
                      <div className="text-center p-3 bg-gray-50 rounded-lg">
                        <div className="text-xs text-muted-foreground mb-1">完整信息</div>
                        <div className="text-lg font-bold">{myData.qualityStats.completeInfo}人</div>
                      </div>
                      <div className="text-center p-3 bg-gray-50 rounded-lg">
                        <div className="text-xs text-muted-foreground mb-1">缺少电话</div>
                        <div className="text-lg font-bold">{myData.qualityStats.missingInfo.phone}人</div>
                      </div>
                      <div className="text-center p-3 bg-gray-50 rounded-lg">
                        <div className="text-xs text-muted-foreground mb-1">缺少微信</div>
                        <div className="text-lg font-bold">{myData.qualityStats.missingInfo.wechat}人</div>
                      </div>
                      <div className="text-center p-3 bg-gray-50 rounded-lg">
                        <div className="text-xs text-muted-foreground mb-1">缺少地址</div>
                        <div className="text-lg font-bold">{myData.qualityStats.missingInfo.address}人</div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
        
        {/* 全部数据Tab（待开发） */}
        <TabsContent value="all">
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              全部数据分析功能开发中...
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* 共享数据Tab（待开发） */}
        <TabsContent value="shared">
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              共享数据分析功能开发中...
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
