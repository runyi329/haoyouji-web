import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

const COLORS = ['#A80000', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#6366f1', '#14b8a6', '#f97316', '#84cc16'];

interface RegionTrendChartProps {
  userId: number;
}

export default function RegionTrendChart({ userId }: RegionTrendChartProps) {
  const [months, setMonths] = useState<number>(6);
  
  // 获取地域趋势数据
  const { data: trendData, isLoading } = trpc.analytics.regionTrend.useQuery({
    months,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base sm:text-lg">地域分布趋势</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12 text-muted-foreground">加载中...</div>
        </CardContent>
      </Card>
    );
  }

  if (!trendData || trendData.data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base sm:text-lg">地域分布趋势</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12 text-muted-foreground">暂无数据</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4">
          <CardTitle className="text-base sm:text-lg">地域分布趋势</CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-xs sm:text-sm text-muted-foreground">时间范围:</span>
            <Select value={months.toString()} onValueChange={(v) => setMonths(Number(v))}>
              <SelectTrigger className="w-[100px] sm:w-[120px] h-8 sm:h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="3">3个月</SelectItem>
                <SelectItem value="6">6个月</SelectItem>
                <SelectItem value="12">12个月</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-xs sm:text-sm text-muted-foreground mb-3 sm:mb-4">
          展示前10个省份的人脉增长趋势
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={trendData.data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis 
              dataKey="month" 
              tick={{ fontSize: 11, fill: '#6b7280' }}
              stroke="#9ca3af"
            />
            <YAxis 
              tick={{ fontSize: 11, fill: '#6b7280' }}
              stroke="#9ca3af"
            />
            <Tooltip 
              contentStyle={{ fontSize: 12, backgroundColor: '#fff', border: '1px solid #e5e7eb' }}
            />
            <Legend 
              wrapperStyle={{ fontSize: 11 }}
              iconType="line"
            />
            {trendData.regions.map((region, index) => (
              <Line
                key={region}
                type="monotone"
                dataKey={region}
                stroke={COLORS[index % COLORS.length]}
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
                name={region}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
        
        {/* 省份图例说明 */}
        <div className="mt-4 pt-4 border-t">
          <div className="text-xs text-muted-foreground mb-2">当前展示省份:</div>
          <div className="flex flex-wrap gap-2">
            {trendData.regions.map((region, index) => (
              <div key={region} className="flex items-center gap-1.5">
                <div 
                  className="w-3 h-3 rounded-full" 
                  style={{ backgroundColor: COLORS[index % COLORS.length] }}
                />
                <span className="text-xs">{region}</span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
