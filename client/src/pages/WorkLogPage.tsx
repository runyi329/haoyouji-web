import React, { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { trpc } from '@/lib/trpc';

interface GitCommit {
  hash: string;
  author: string;
  date: string;
  message: string;
  type: string;
  scope: string;
  cleanMessage: string;
}

interface DayStats {
  date: string;
  count: number;
  commits: GitCommit[];
}

const WorkLogPage: React.FC = () => {
  const [, setLocation] = useLocation();
  const [viewMode, setViewMode] = useState<'timeline' | 'calendar'>('timeline');
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [dayStats, setDayStats] = useState<Map<string, DayStats>>(new Map());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // 调用后端API获取工作日志
  const { data: workLogs } = trpc.workLog.getWorkLogs.useQuery();

  useEffect(() => {
    if (workLogs) {
      setCommits(workLogs);
      
      // 按日期分组统计
      const stats = new Map<string, DayStats>();
      workLogs.forEach((commit) => {
        const date = commit.date.split('T')[0]; // 提取日期部分（YYYY-MM-DD）
        if (!stats.has(date)) {
          stats.set(date, { date, count: 0, commits: [] });
        }
        const dayData = stats.get(date)!;
        dayData.count++;
        dayData.commits.push(commit);
      });
      
      setDayStats(stats);
      setLoading(false);
    }
  }, [workLogs]);

  // 获取类型对应的颜色和标签
  const getTypeInfo = (type: string): { color: string; label: string } => {
    const typeMap: Record<string, { color: string; label: string }> = {
      feat: { color: 'bg-green-100 text-green-800', label: '新功能' },
      fix: { color: 'bg-red-100 text-red-800', label: '修复' },
      docs: { color: 'bg-blue-100 text-blue-800', label: '文档' },
      style: { color: 'bg-purple-100 text-purple-800', label: '样式' },
      refactor: { color: 'bg-yellow-100 text-yellow-800', label: '重构' },
      perf: { color: 'bg-orange-100 text-orange-800', label: '性能' },
      test: { color: 'bg-indigo-100 text-indigo-800', label: '测试' },
      build: { color: 'bg-gray-100 text-gray-800', label: '构建' },
      ci: { color: 'bg-gray-100 text-gray-800', label: 'CI' },
      chore: { color: 'bg-gray-100 text-gray-800', label: '杂项' },
      revert: { color: 'bg-red-200 text-red-900', label: '回滚' },
    };
    return typeMap[type] || { color: 'bg-gray-100 text-gray-800', label: type };
  };

  // 获取热力图颜色（根据提交数量）
  const getHeatmapColor = (count: number): string => {
    if (count === 0) return 'bg-gray-100';
    if (count === 1) return 'bg-red-200';
    if (count === 2) return 'bg-red-400';
    if (count === 3) return 'bg-red-600';
    return 'bg-red-800';
  };

  // 生成日历网格（最近30天，以大格子形式展示）
  const generateCalendarDays = (): Array<{ date: string; count: number }> => {
    const days: Array<{ date: string; count: number }> = [];
    const today = new Date();
    
    for (let i = 29; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const count = dayStats.get(dateStr)?.count || 0;
      days.push({ date: dateStr, count });
    }
    
    return days;
  };

  const calendarDays = generateCalendarDays();

  // 时间线视图
  const renderTimelineView = () => {
    const sortedCommits = [...commits].sort((a, b) => 
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    return (
      <div className="space-y-6">
        {sortedCommits.map((commit, idx) => {
          const typeInfo = getTypeInfo(commit.type);
          const commitDate = new Date(commit.date).toLocaleDateString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          });

          return (
            <div key={commit.hash} className="flex gap-4">
              {/* 时间线竖线 */}
              <div className="flex flex-col items-center">
                <div className="w-3 h-3 rounded-full bg-red-500 border-2 border-white"></div>
                {idx < sortedCommits.length - 1 && (
                  <div className="w-0.5 h-24 bg-gray-300 my-2"></div>
                )}
              </div>

              {/* 提交内容 */}
              <div className="flex-1 pb-6">
                <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${typeInfo.color}`}>
                        {typeInfo.label}
                      </span>
                      {commit.scope && (
                        <span className="text-xs text-gray-600 bg-gray-100 px-2 py-1 rounded">
                          {commit.scope}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-gray-500">{commitDate}</span>
                  </div>
                  <p className="text-sm font-medium text-gray-900 mb-1">{commit.cleanMessage}</p>
                  <p className="text-xs text-gray-500">by {commit.author}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // 日历视图
  const renderCalendarView = () => {
    return (
      <div className="space-y-6">
        {/* 统计信息 */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100 flex flex-col items-center justify-center">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">活跃天数</p>
            <p className="text-xl font-bold text-red-600">{dayStats.size}</p>
          </div>
          <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100 flex flex-col items-center justify-center">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">提交总数</p>
            <p className="text-xl font-bold text-red-600">{commits.length}</p>
          </div>
          <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100 flex flex-col items-center justify-center">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">平均每天</p>
            <p className="text-xl font-bold text-red-600">
              {dayStats.size > 0 ? (commits.length / dayStats.size).toFixed(1) : 0}
            </p>
          </div>
        </div>

        {/* 大格子日历 */}
        <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-2">
          {calendarDays.map((day) => {
            const dateObj = new Date(day.date);
            const displayDate = `${dateObj.getMonth() + 1}-${dateObj.getDate()}`;
            const isSelected = selectedDate === day.date;
            
            return (
              <div
                key={day.date}
                onClick={() => setSelectedDate(day.date)}
                className={`aspect-square rounded-xl border flex flex-col items-center justify-center cursor-pointer transition-all ${
                  isSelected 
                    ? 'bg-red-500 border-red-600 shadow-md transform scale-105 z-10' 
                    : day.count > 0 
                      ? 'bg-white border-red-100 hover:border-red-300' 
                      : 'bg-gray-50 border-gray-100 opacity-60'
                }`}
              >
                <span className={`text-[10px] mb-1 ${isSelected ? 'text-red-100' : 'text-gray-400'}`}>
                  {displayDate}
                </span>
                <span className={`text-xl font-black ${isSelected ? 'text-white' : day.count > 0 ? 'text-red-600' : 'text-gray-300'}`}>
                  {day.count}
                </span>
                {day.count > 0 && !isSelected && (
                  <div className="mt-1 w-1 h-1 rounded-full bg-red-400"></div>
                )}
              </div>
            );
          })}
        </div>

        {/* 选中日期的提交记录详情 */}
        {selectedDate && (
          <div className="bg-white rounded-2xl p-5 shadow-lg border border-red-500/10 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="flex items-center justify-between mb-4 pb-4 border-b border-gray-50">
              <h3 className="text-lg font-bold text-gray-900">
                {new Date(selectedDate).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })}
              </h3>
              <span className="bg-red-50 text-red-600 px-3 py-1 rounded-full text-xs font-bold">
                {dayStats.get(selectedDate)?.count || 0} 次修改
              </span>
            </div>
            
            {dayStats.has(selectedDate) ? (
              <div className="space-y-4">
                {dayStats.get(selectedDate)?.commits.map((commit) => {
                  const typeInfo = getTypeInfo(commit.type);
                  return (
                    <div key={commit.hash} className="group">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-tight ${typeInfo.color}`}>
                          {typeInfo.label}
                        </span>
                        {commit.scope && (
                          <span className="text-[10px] text-gray-400 font-medium">
                            @{commit.scope}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-700 leading-relaxed font-medium group-hover:text-red-600 transition-colors">
                        {commit.cleanMessage}
                      </p>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-10 text-center">
                <p className="text-gray-400 text-sm italic">这一天没有修改记录</p>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-600">加载中...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 头部 */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => setLocation('/ledger/59')}
              className="text-gray-600 hover:text-gray-900 font-medium"
            >
              返回
            </button>
            <h1 className="text-xl font-bold text-gray-900">项目进展</h1>
            <div className="w-12"></div>
          </div>

          {/* Tab 切换 */}
          <div className="flex gap-2">
            <button
              onClick={() => setViewMode('timeline')}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                viewMode === 'timeline'
                  ? 'bg-red-500 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              时间线
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                viewMode === 'calendar'
                  ? 'bg-red-500 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              活跃日历
            </button>
          </div>
        </div>
      </div>

      {/* 内容区域 */}
      <div className="max-w-4xl mx-auto px-4 py-6">
        {viewMode === 'timeline' ? renderTimelineView() : renderCalendarView()}
      </div>
    </div>
  );
};

export default WorkLogPage;
