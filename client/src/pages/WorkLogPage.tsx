import React, { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { trpc } from '@/lib/trpc';
import { workLogData, WorkLogEntry } from '@/data/workLogSummary';
import { gitDayStats } from '@/data/gitDayStats';

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

// 月份选项
const MONTHS = [
  { value: '02', label: '2月' },
  { value: '03', label: '3月' },
  { value: '04', label: '4月' },
  { value: '05', label: '5月' },
  { value: '06', label: '6月' },
];

const WorkLogPage: React.FC = () => {
  const [, setLocation] = useLocation();
  const [viewMode, setViewMode] = useState<'worklog' | 'calendar' | 'timeline'>('worklog');
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [dayStats, setDayStats] = useState<Map<string, DayStats>>(new Map());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [drawerDate, setDrawerDate] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string>('02');
  const [expandedDate, setExpandedDate] = useState<string | null>(null);

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

  // 生成从最早提交日期到今天的日历（周一开始），倒序排列（新在上）
  const generateCalendarWeeks = () => {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    // 优先使用静态gitDayStats确定起始日期，不依赖接口加载
    const staticDates = Object.keys(gitDayStats).sort();
    let earliestDate: Date;
    if (staticDates.length > 0) {
      earliestDate = new Date(staticDates[0] + 'T00:00:00');
    } else if (dayStats.size > 0) {
      const allDates = Array.from(dayStats.keys()).sort();
      earliestDate = new Date(allDates[0] + 'T00:00:00');
    } else {
      earliestDate = new Date(today.getFullYear(), 0, 1);
    }

    // 对齐到周一
    const startDow = earliestDate.getDay();
    const startMon = (startDow + 6) % 7;
    const alignedStart = new Date(earliestDate);
    alignedStart.setDate(earliestDate.getDate() - startMon);

    // 对齐到本周周日
    const todayDow = today.getDay();
    const todaySun = (todayDow + 6) % 7;
    const alignedEnd = new Date(today);
    alignedEnd.setDate(today.getDate() + (6 - todaySun));

    const weeks: Array<Array<{ date: string; count: number; isToday: boolean } | null>> = [];
    let currentWeek: Array<{ date: string; count: number; isToday: boolean } | null> = [];

    const cur = new Date(alignedStart);
    while (cur <= alignedEnd) {
      const dateStr = cur.toISOString().split('T')[0];
      // 优先用接口返回的实时数据，接口未加载时用静态数据平底
      const count = dayStats.get(dateStr)?.count ?? gitDayStats[dateStr] ?? 0;
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
    return weeks.reverse();
  };

  const calendarWeeks = generateCalendarWeeks();

  // 工作日志视图：按月份过滤，按天展示摘要卡片
  const renderWorkLogView = () => {
    const year = new Date().getFullYear();
    const filteredLogs = workLogData
      .filter(entry => entry.date.startsWith(`${year}-${selectedMonth}`))
      .sort((a, b) => b.date.localeCompare(a.date)); // 倒序，新的在上

    // 统计当月数据
    const totalCommits = filteredLogs.reduce((sum, e) => sum + e.commitCount, 0);
    const activeDays = filteredLogs.length;

    const monthLabel = MONTHS.find(m => m.value === selectedMonth)?.label || selectedMonth + '月';

    return (
      <div className="space-y-4">
        {/* 月份选择器 */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {MONTHS.map(m => (
            <button
              key={m.value}
              onClick={() => { setSelectedMonth(m.value); setExpandedDate(null); }}
              style={selectedMonth === m.value
                ? { backgroundColor: '#D32F2F', color: '#fff', border: 'none' }
                : { backgroundColor: '#fff', color: '#666', border: '1px solid #e5e7eb' }
              }
              className="flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-semibold transition-all"
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* 月份统计 */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: '活跃天数', value: String(activeDays) },
            { label: '部署次数', value: String(totalCommits) },
            { label: '日均部署', value: activeDays > 0 ? (totalCommits / activeDays).toFixed(1) : '0' },
          ].map(({ label, value }) => (
            <div key={label} className="bg-white rounded-xl p-3 shadow-sm border border-gray-100 flex flex-col items-center">
              <p className="text-[10px] text-gray-400 mb-1">{label}</p>
              <p style={{ color: '#D32F2F' }} className="text-2xl font-black">{value}</p>
            </div>
          ))}
        </div>

        {/* 日志卡片列表 */}
        {filteredLogs.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center shadow-sm border border-gray-100">
            <p className="text-gray-400 text-sm">{monthLabel}暂无工作日志</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredLogs.map((entry) => {
              const dateObj = new Date(entry.date + 'T00:00:00');
              const weekday = dateObj.toLocaleDateString('zh-CN', { weekday: 'short' });
              const dayStr = dateObj.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' });
              const isExpanded = expandedDate === entry.date;
              const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;

              return (
                <div
                  key={entry.date}
                  className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden"
                >
                  {/* 卡片头部 */}
                  <div
                    className="flex items-center justify-between px-4 py-3 cursor-pointer"
                    onClick={() => setExpandedDate(isExpanded ? null : entry.date)}
                  >
                    <div className="flex items-center gap-3">
                      {/* 日期圆圈 */}
                      <div
                        style={{
                          backgroundColor: isWeekend ? '#3b5fa0' : '#D32F2F',
                          color: '#fff',
                          width: 44,
                          height: 44,
                          borderRadius: '50%',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        <span style={{ fontSize: 16, fontWeight: 900, lineHeight: 1 }}>
                          {dateObj.getDate()}
                        </span>
                        <span style={{ fontSize: 10, lineHeight: 1.2, opacity: 0.9 }}>{weekday}</span>
                      </div>
                      <div>
                        <p className="text-sm font-bold text-gray-900">{dayStr}</p>
                        {entry.highlights && (
                          <p className="text-xs text-gray-500 mt-0.5 leading-tight">{entry.highlights}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <div
                        style={{ backgroundColor: '#fff0f0', color: '#D32F2F' }}
                        className="px-2.5 py-1 rounded-full text-xs font-bold"
                      >
                        {entry.commitCount} 次
                      </div>
                      <span style={{ color: '#ccc', fontSize: 18, transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
                        ▾
                      </span>
                    </div>
                  </div>

                  {/* 展开内容：工作摘要 */}
                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-gray-50">
                      <p className="text-xs text-gray-400 mt-3 mb-2 font-medium uppercase tracking-wide">本日工作内容</p>
                      <div className="space-y-2">
                        {entry.summary.map((item, idx) => (
                          <div key={idx} className="flex items-start gap-2">
                            <span
                              style={{ backgroundColor: '#D32F2F', color: '#fff', width: 18, height: 18, borderRadius: '50%', fontSize: 10, fontWeight: 700, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}
                            >
                              {idx + 1}
                            </span>
                            <p className="text-sm text-gray-700 leading-snug flex-1">{item}</p>
                          </div>
                        ))}
                      </div>

                      {/* 查看详细提交记录按钮 */}
                      {dayStats.has(entry.date) && (
                        <button
                          onClick={() => setDrawerDate(entry.date)}
                          style={{ color: '#D32F2F', border: '1px solid #fca5a5', backgroundColor: '#fff' }}
                          className="mt-3 w-full py-2 rounded-xl text-xs font-semibold"
                        >
                          查看全部 {dayStats.get(entry.date)?.count} 条提交记录
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

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
              <p style={{ color: '#D32F2F' }} className="text-2xl font-black">{value}</p>
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
                    <div style={barStyle} className="flex items-center justify-center py-0.5">
                      <span className="text-[9px] font-medium leading-tight">
                        {month}月{dayNum}日
                      </span>
                    </div>
                    <div className="flex-1 flex items-center justify-center">
                      {day.count > 0 ? (
                        <span style={{ fontSize: '1.3rem', fontWeight: 700, lineHeight: 1, color: isSelected ? '#b71c1c' : '#1a1a1a' }}>
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
            <button
              onClick={() => window.location.reload()}
              className="text-sm font-medium"
              style={{ color: '#D32F2F' }}
            >
              刷新
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-4">
        {renderCalendarView()}
      </div>

      {/* 底部抽屉：弹出当天提交详情 */}
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
            {/* 抽屉标题 */}
            <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-gray-100 sticky top-0 bg-white">
              <h3 className="text-base font-bold text-gray-900">
                {new Date(drawerDate + 'T00:00:00').toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' })}
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

            {/* 工作摘要区块（抽屉内） */}
            {(() => {
              const logEntry = workLogData.find(e => e.date === drawerDate);
              if (!logEntry) return null;
              return (
                <div className="px-4 pt-3 pb-2">
                  {logEntry.highlights && (
                    <div style={{ backgroundColor: '#fff8f8', border: '1px solid #fca5a5', borderRadius: 10, padding: '8px 12px', marginBottom: 10 }}>
                      <p style={{ color: '#D32F2F', fontSize: 11, fontWeight: 700, marginBottom: 2 }}>当日亮点</p>
                      <p style={{ color: '#333', fontSize: 13, lineHeight: 1.5 }}>{logEntry.highlights}</p>
                    </div>
                  )}
                  <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wide mb-2">工作内容摘要</p>
                  <div className="space-y-1.5 mb-3">
                    {logEntry.summary.map((item, idx) => (
                      <div key={idx} className="flex items-start gap-2">
                        <span style={{ backgroundColor: '#D32F2F', color: '#fff', width: 16, height: 16, borderRadius: '50%', fontSize: 9, fontWeight: 700, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 2 }}>
                          {idx + 1}
                        </span>
                        <p className="text-sm text-gray-700 leading-snug flex-1">{item}</p>
                      </div>
                    ))}
                  </div>
                  <div className="border-t border-gray-100 pt-2 mb-1">
                    <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wide">详细提交记录</p>
                  </div>
                </div>
              );
            })()}

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
