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

const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

const WorkLogPage: React.FC = () => {
  const [, setLocation] = useLocation();
  const [viewMode, setViewMode] = useState<'timeline' | 'calendar'>('timeline');
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [dayStats, setDayStats] = useState<Map<string, DayStats>>(new Map());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [drawerDate, setDrawerDate] = useState<string | null>(null);

  const { data: workLogs, isLoading } = trpc.workLog.getWorkLogs.useQuery();

  useEffect(() => {
    if (workLogs) {
      setCommits(workLogs);
      const stats = new Map<string, DayStats>();
      workLogs.forEach((commit) => {
        const date = commit.date.substring(0, 10);
        if (!stats.has(date)) {
          stats.set(date, { date, count: 0, commits: [] });
        }
        const dayData = stats.get(date)!;
        dayData.count++;
        dayData.commits.push(commit);
      });
      setDayStats(stats);
    }
  }, [workLogs]);

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

  // 生成从今年1月1日到今天的日历（周一开始），倒序排列（新在上）
  const generateCalendarWeeks = () => {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    // 从今年1月1日开始
    const yearStart = new Date(today.getFullYear(), 0, 1);
    // 找到周一对齐的起始日
    const startDow = yearStart.getDay();
    const startMon = (startDow + 6) % 7;
    const alignedStart = new Date(yearStart);
    alignedStart.setDate(yearStart.getDate() - startMon);

    // 找到本周周日结束
    const todayDow = today.getDay();
    const todaySun = (todayDow + 6) % 7;
    const alignedEnd = new Date(today);
    alignedEnd.setDate(today.getDate() + (6 - todaySun));

    const weeks: Array<Array<{ date: string; count: number; isToday: boolean } | null>> = [];
    let currentWeek: Array<{ date: string; count: number; isToday: boolean } | null> = [];

    const cur = new Date(alignedStart);
    while (cur <= alignedEnd) {
      const dateStr = cur.toISOString().split('T')[0];
      const count = dayStats.get(dateStr)?.count || 0;
      currentWeek.push({ date: dateStr, count, isToday: dateStr === todayStr });
      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
      cur.setDate(cur.getDate() + 1);
    }
    if (currentWeek.length > 0) {
      while (currentWeek.length < 7) currentWeek.push(null);
      weeks.push(currentWeek);
    }
    // 倒序：新的在上，旧的在下
    return weeks.reverse();
  };

  const calendarWeeks = generateCalendarWeeks();

  const renderTimelineView = () => {
    if (isLoading) {
      return <div className="flex items-center justify-center py-20"><p className="text-gray-400">加载中...</p></div>;
    }
    if (commits.length === 0) {
      return <div className="flex items-center justify-center py-20"><p className="text-gray-400">暂无提交记录</p></div>;
    }

    const sortedCommits = [...commits].sort((a, b) =>
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    return (
      <div className="space-y-3">
        {sortedCommits.map((commit, idx) => {
          const typeInfo = getTypeInfo(commit.type);
          const commitDate = new Date(commit.date).toLocaleDateString('zh-CN', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit',
          });

          return (
            <div key={commit.hash} className="flex gap-3">
              <div className="flex flex-col items-center flex-shrink-0">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500 mt-1.5"></div>
                {idx < sortedCommits.length - 1 && (
                  <div className="w-px flex-1 bg-gray-200 my-1 min-h-[1.5rem]"></div>
                )}
              </div>
              <div className="flex-1 pb-3">
                <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100">
                  <div className="flex items-start justify-between mb-1.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${typeInfo.color}`}>
                        {typeInfo.label}
                      </span>
                      {commit.scope && (
                        <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                          {commit.scope}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-gray-400 flex-shrink-0 ml-1">{commitDate}</span>
                  </div>
                  <p className="text-sm font-medium text-gray-800 leading-snug">{commit.cleanMessage}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderCalendarView = () => {
    return (
      <div className="space-y-4">
        {/* 统计卡片 */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: '活跃天数', value: isLoading ? '-' : String(dayStats.size) },
            { label: '提交总数', value: isLoading ? '-' : String(commits.length) },
            { label: '平均每天', value: isLoading ? '-' : dayStats.size > 0 ? (commits.length / dayStats.size).toFixed(1) : '0' },
          ].map(({ label, value }) => (
            <div key={label} className="bg-white rounded-xl p-3 shadow-sm border border-gray-100 flex flex-col items-center">
              <p className="text-[10px] text-gray-400 mb-1">{label}</p>
              <p className="text-2xl font-black text-red-600">{value}</p>
            </div>
          ))}
        </div>

        {/* 日历主体 */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {/* 周表头 */}
          <div className="grid grid-cols-7 bg-gray-50 border-b border-gray-100">
            {WEEKDAYS.map((day, i) => (
              <div
                key={day}
                className={`py-2 text-center text-[11px] font-bold ${
                  i >= 5 ? 'text-red-400' : 'text-gray-500'
                }`}
              >
                {day}
              </div>
            ))}
          </div>

          {/* 周行 */}
          {calendarWeeks.map((week, weekIdx) => (
            <div key={weekIdx} className="grid grid-cols-7 border-b border-gray-50 last:border-b-0">
              {week.map((day, dayIdx) => {
                if (!day) {
                  return <div key={dayIdx} className="h-16 bg-gray-50/30"></div>;
                }

                const dateObj = new Date(day.date);
                const dayNum = dateObj.getDate();
                const month = dateObj.getMonth() + 1;
                const isSelected = selectedDate === day.date;
                const isWeekend = dayIdx >= 5;

                // 横条颜色：平日暗淡红，双休日暗淡蓝，今天深色，选中深红
                let barStyle: React.CSSProperties = { backgroundColor: '#e8e8e8', color: '#fff' };
                if (isSelected) { barStyle = { backgroundColor: '#b71c1c', color: '#fff' }; }
                else if (day.isToday) { barStyle = { backgroundColor: '#c62828', color: '#fff' }; }
                else if (isWeekend) { barStyle = { backgroundColor: '#5c7fa3', color: '#fff' }; }
                else { barStyle = { backgroundColor: '#b85c5c', color: '#fff' }; }

                return (
                  <div
                    key={day.date}
                    onClick={() => {
                      setSelectedDate(isSelected ? null : day.date);
                      if (day.count > 0) setDrawerDate(day.date);
                    }}
                    className={`h-16 flex flex-col cursor-pointer transition-colors border-r border-gray-50 last:border-r-0 ${
                      isSelected ? 'bg-red-50' : 'hover:bg-gray-50/80'
                    }`}
                  >
                    {/* 日期横条 */}
                    <div style={barStyle} className="flex items-center justify-center py-0.5">
                      <span className="text-[9px] font-medium leading-tight">
                        {month}月{dayNum}日
                      </span>
                    </div>

                    {/* 数字居中 */}
                    <div className="flex-1 flex items-center justify-center">
                      {day.count > 0 ? (
                        <span style={{ fontSize: day.count >= 10 ? '1.4rem' : '1.8rem', fontWeight: 900, lineHeight: 1, color: isSelected ? '#b71c1c' : '#c0392b' }}>
                          {day.count}
                        </span>
                      ) : (
                        <span style={{ color: '#ddd', fontSize: '1rem', fontWeight: 400 }}>0</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* 选中日期详情 */}
        {selectedDate && (
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-red-100">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-bold text-gray-900">
                {new Date(selectedDate).toLocaleDateString('zh-CN', {
                  month: 'long', day: 'numeric', weekday: 'short'
                })}
              </h3>
              <span className="bg-red-50 text-red-600 px-2.5 py-1 rounded-full text-xs font-bold">
                {dayStats.get(selectedDate)?.count || 0} 次修改
              </span>
            </div>

            {dayStats.has(selectedDate) ? (
              <div className="space-y-3">
                {dayStats.get(selectedDate)?.commits.map((commit) => {
                  const typeInfo = getTypeInfo(commit.type);
                  return (
                    <div key={commit.hash} className="flex gap-2">
                      <div className="w-1 rounded-full bg-red-400 flex-shrink-0 mt-1 self-stretch"></div>
                      <div>
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${typeInfo.color}`}>
                            {typeInfo.label}
                          </span>
                          {commit.scope && (
                            <span className="text-[10px] text-gray-400">@{commit.scope}</span>
                          )}
                        </div>
                        <p className="text-sm text-gray-700 leading-snug">{commit.cleanMessage}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-center text-gray-400 text-sm py-6">这一天没有修改记录</p>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 头部 */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={() => setLocation('/ledger/59')}
              className="text-gray-500 hover:text-gray-800 text-sm font-medium"
            >
              返回
            </button>
            <h1 className="text-lg font-bold text-gray-900">项目进展</h1>
            <div className="w-10"></div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setViewMode('timeline')}
              className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-all ${
                viewMode === 'timeline'
                  ? 'bg-red-500 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              时间线
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-all ${
                viewMode === 'calendar'
                  ? 'bg-red-500 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              活跃日历
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-4">
        {viewMode === 'timeline' ? renderTimelineView() : renderCalendarView()}
      </div>

      {/* 底部抄屉：弹出当天提交详情 */}
      {drawerDate && (
        <div
          className="fixed inset-0 z-50"
          style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
          onClick={() => setDrawerDate(null)}
        >
          <div
            className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl"
            style={{ maxHeight: '75vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}
          >
            {/* 抄屉标题 */}
            <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-gray-100 sticky top-0 bg-white">
              <h3 className="text-base font-bold text-gray-900">
                {new Date(drawerDate).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' })}
              </h3>
              <div className="flex items-center gap-2">
                <span className="bg-red-50 text-red-600 px-2.5 py-1 rounded-full text-xs font-bold">
                  {dayStats.get(drawerDate)?.count || 0} 条改动
                </span>
                <button
                  onClick={() => setDrawerDate(null)}
                  className="text-gray-400 text-xl leading-none w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100"
                >
                  ×
                </button>
              </div>
            </div>

            {/* 提交列表 */}
            <div className="px-4 py-3 space-y-3">
              {dayStats.has(drawerDate) ? (
                dayStats.get(drawerDate)!.commits.map((commit, idx) => {
                  const typeInfo = getTypeInfo(commit.type);
                  return (
                    <div key={commit.hash} className="flex gap-3 items-start">
                      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-red-50 flex items-center justify-center">
                        <span className="text-[11px] font-bold text-red-500">{idx + 1}</span>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${typeInfo.color}`}>
                            {typeInfo.label}
                          </span>
                          {commit.scope && (
                            <span className="text-[10px] text-gray-400">@{commit.scope}</span>
                          )}
                          <span className="text-[10px] text-gray-300 ml-auto">
                            {new Date(commit.date).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="text-sm text-gray-800 leading-snug">{commit.cleanMessage}</p>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-center text-gray-400 text-sm py-6">这一天没有修改记录</p>
              )}
            </div>
            <div className="h-6"></div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WorkLogPage;
