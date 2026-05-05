import { useMemo } from 'react';
import { useParams, useLocation } from 'wouter';
import { trpc } from '@/lib/trpc';
import { ChevronLeft, Users, PieChart } from 'lucide-react';

// 标签颜色列表（与LedgerDetailAA保持一致）
const COLORS = ['#D32F2F', '#1976D2', '#388E3C', '#F57C00', '#7B1FA2', '#00838F', '#C62828', '#283593', '#2E7D32'];

export default function WaveRatioManage() {
  const { id: ledgerId } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const lid = parseInt(ledgerId || '0');

  // 获取所有成员的初始金额配置
  const { data, isLoading } = trpc.ledger.adminGetAllInitialBalances.useQuery(
    { ledgerId: lid },
    { enabled: lid > 0 }
  );

  // 获取账本分类（标签列表）
  const { data: rawCategories = [] } = trpc.ledger.getCategories.useQuery(
    { ledgerId: lid, parentId: null },
    { enabled: lid > 0 }
  );

  // 过滤掉默认分类
  const categories = useMemo(() => {
    return rawCategories.filter((c: any) => !c.isDefault);
  }, [rawCategories]);

  // 构建「以标签为维度」的波比分配数据
  const tagRatioData = useMemo(() => {
    if (!data || !categories.length) return [];
    const { members, balancesMap } = data;

    return categories.map((cat: any, idx: number) => {
      const tagName = cat.name;
      const color = COLORS[idx % COLORS.length];

      // 收集每个成员对该标签的ratio
      const memberRatios: { userId: number; nickname: string; ratio: number }[] = [];
      for (const member of members) {
        const ib = balancesMap[member.userId] ?? {};
        const ratioVal = ib[`${tagName}__ratio`];
        const visible = ib[`${tagName}__visible`];
        // 只显示 visible != 0 且有ratio的成员
        if (visible === 0 || visible === '0') continue;
        if (ratioVal === undefined || ratioVal === null) continue;
        const ratio = Number(ratioVal);
        if (ratio <= 0) continue;
        const displayName = member.nickname || member.username || member.name || `用户${member.userId}`;
        memberRatios.push({ userId: member.userId, nickname: displayName, ratio });
      }

      // 按ratio降序排列
      memberRatios.sort((a, b) => b.ratio - a.ratio);

      const totalRatio = memberRatios.reduce((sum, m) => sum + m.ratio, 0);
      const remaining = Math.max(0, 100 - totalRatio);

      return { tagName, color, memberRatios, totalRatio, remaining };
    });
  }, [data, categories]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => setLocation(`/ledger/${lid}/settings`)}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
        >
          <ChevronLeft className="w-5 h-5 text-gray-600" />
        </button>
        <div>
          <div className="text-base font-bold text-gray-900">波比管理</div>
          <div className="text-xs text-gray-400">以标签视角查看比例分配情况</div>
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-gray-400 text-sm">加载中...</div>
        ) : tagRatioData.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-gray-400 text-sm">暂无标签数据</div>
        ) : (
          tagRatioData.map((tag) => (
            <div key={tag.tagName} className="bg-white rounded-2xl overflow-hidden shadow-sm">
              {/* 标签标题行 */}
              <div
                className="px-4 py-3 flex items-center justify-between"
                style={{ backgroundColor: tag.color + '12', borderBottom: `2px solid ${tag.color}22` }}
              >
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: tag.color }}
                  />
                  <span className="text-sm font-bold" style={{ color: tag.color }}>
                    {tag.tagName}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  {/* 已分配进度条 */}
                  <div className="flex items-center gap-2">
                    <div className="w-20 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.min(100, tag.totalRatio)}%`,
                          backgroundColor: tag.totalRatio >= 100 ? '#4CAF50' : tag.color,
                        }}
                      />
                    </div>
                    <span
                      className="text-xs font-semibold"
                      style={{ color: tag.totalRatio >= 100 ? '#4CAF50' : tag.color }}
                    >
                      {tag.totalRatio}%
                    </span>
                  </div>
                  {/* 剩余标签 */}
                  {tag.remaining > 0 ? (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-orange-50 text-orange-500 font-medium">
                      剩余 {tag.remaining}%
                    </span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-600 font-medium">
                      已满
                    </span>
                  )}
                </div>
              </div>

              {/* 成员列表 */}
              {tag.memberRatios.length === 0 ? (
                <div className="px-4 py-4 text-center text-xs text-gray-400">
                  <Users className="w-4 h-4 mx-auto mb-1 opacity-40" />
                  暂无用户分配到此标签
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {tag.memberRatios.map((m, idx) => (
                    <div key={m.userId} className="px-4 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {/* 排名 */}
                        <div
                          className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                          style={{ backgroundColor: idx === 0 ? '#D32F2F' : idx === 1 ? '#1976D2' : '#9E9E9E' }}
                        >
                          {idx + 1}
                        </div>
                        <span className="text-sm text-gray-800 font-medium">{m.nickname}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        {/* 比例条 */}
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${Math.min(100, m.ratio)}%`,
                                backgroundColor: tag.color,
                                opacity: 0.7,
                              }}
                            />
                          </div>
                          <span className="text-sm font-bold" style={{ color: tag.color, minWidth: 36, textAlign: 'right' }}>
                            {m.ratio}%
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* 底部汇总行 */}
              <div className="px-4 py-2.5 bg-gray-50 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs text-gray-400">
                  <PieChart className="w-3 h-3" />
                  <span>共 {tag.memberRatios.length} 位用户参与</span>
                </div>
                <div className="text-xs text-gray-500">
                  已分配 <span className="font-semibold text-gray-700">{tag.totalRatio}%</span>
                  {tag.remaining > 0 && (
                    <span className="ml-1 text-orange-500">· 待分配 <span className="font-semibold">{tag.remaining}%</span></span>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
