import { useState } from "react";
import { ArrowLeft, TrendingUp, TrendingDown, Award, Info, Trophy, UserPlus, MessageCircle, Calendar, UserCheck, CheckSquare, PartyPopper, Share2, Heart, MessageSquare, CalendarCheck, Tag } from "lucide-react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { UsdtIcon } from "@/components/icons/UsdtIcon";
import { TagLabelIcon } from "@/components/icons/TagLabelIcon";
import { LevelIcon } from "@/components/icons/LevelIcon";

type TabType = "history" | "rules" | "levels";

export default function PointsDetail() {
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<TabType>("rules");
  const [tooltipVisible, setTooltipVisible] = useState<number | null>(null);
  
  // 图标说明
  const iconDescriptions = [
    { id: 1, title: "添加联系人", desc: "每次添加新联系人可获得积分" },
    { id: 2, title: "给好友打标签", desc: "为好友添加标签可获得积分" },
    { id: 3, title: "完成互动", desc: "与联系人互动沟通可获得积分" },
    { id: 4, title: "每日签到", desc: "每天登录签到可获得积分" },
    { id: 5, title: "推荐新用户", desc: "成功推荐新用户注册可获得积分" },
    { id: 6, title: "完成任务", desc: "完成系统发布的任务可获得积分" },
    { id: 7, title: "参与活动", desc: "参与平台活动可获得积分" },
    { id: 8, title: "分享联系人", desc: "分享联系人给其他用户可获得积分" },
    { id: 9, title: "收藏内容", desc: "收藏感兴趣的内容可获得积分" },
    { id: 10, title: "发表评论", desc: "发表评论互动可获得积分" },
    { id: 11, title: "连续签到", desc: "连续多天签到可获得额外积分" },
  ];
  
  const { data: stats, isLoading: statsLoading } = trpc.rewards.getPointStats.useQuery();
  const { data: history, isLoading: historyLoading } = trpc.rewards.getPointHistory.useQuery({ limit: 50 });

  // 格式化日期
  const formatDate = (date: Date) => {
    return new Date(date).toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // 获取交易类型的中文名称和颜色
  const getTypeInfo = (type: string) => {
    const typeMap: Record<string, { label: string; color: string }> = {
      game: { label: "游戏奖励", color: "text-green-600" },
      task: { label: "任务完成", color: "text-blue-600" },
      reward: { label: "兑换奖品", color: "text-red-600" },
      admin: { label: "系统调整", color: "text-[#D32F2F]" },
    };
    return typeMap[type] || { label: "其他", color: "text-gray-600" };
  };

  // 积分等级配置
  const pointLevels = [
    { level: 1, name: "青铜", minPoints: 0, maxPoints: 999, color: "bg-orange-700" },
    { level: 2, name: "白银", minPoints: 1000, maxPoints: 4999, color: "bg-gray-400" },
    { level: 3, name: "黄金", minPoints: 5000, maxPoints: 9999, color: "bg-[#CBA471]" },
    { level: 4, name: "铂金", minPoints: 10000, maxPoints: 49999, color: "bg-cyan-500" },
    { level: 5, name: "钻石", minPoints: 50000, maxPoints: 99999, color: "bg-blue-600" },
    { level: 6, name: "王者", minPoints: 100000, maxPoints: Infinity, color: "bg-[#D32F2F]" },
  ];

  // 获取当前等级
  const getCurrentLevel = (points: number) => {
    return pointLevels.find(l => points >= l.minPoints && points <= l.maxPoints) || pointLevels[0];
  };

  const currentLevel = getCurrentLevel(stats?.currentPoints || 0);
  const nextLevel = pointLevels.find(l => l.level === (currentLevel?.level || 0) + 1);

  return (
    <div className="min-h-screen bg-gray-50 pb-8">
      {/* 头部 */}
      <div className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <div className="flex items-center gap-3 mb-3">
            <button
              onClick={() => navigate("/profile")}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-lg font-semibold">我的积分</h1>
          </div>
          
          {/* 横向菜单 */}
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab("rules")}
              className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                activeTab === "rules"
                  ? "text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
              style={activeTab === "rules" ? { backgroundColor: "var(--color-primary)" } : {}}
            >
              积分规则
            </button>
            <button
              onClick={() => setActiveTab("levels")}
              className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                activeTab === "levels"
                  ? "text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
              style={activeTab === "levels" ? { backgroundColor: "var(--color-primary)" } : {}}
            >
              积分等级
            </button>
            <button
              onClick={() => setActiveTab("history")}
              className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                activeTab === "history"
                  ? "text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
              style={activeTab === "history" ? { backgroundColor: "var(--color-primary)" } : {}}
            >
              历史明细
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-4 space-y-4">
        {/* 积分统计卡片 - 压缩版 */}
        <div className="grid grid-cols-4 gap-3">
          {/* 当前积分 */}
          <Card className="col-span-2 p-4 text-white" style={{ background: "linear-gradient(135deg, var(--color-primary), var(--color-secondary))" }}>
            {statsLoading ? (
              <Skeleton className="h-16 bg-white/20" />
            ) : (
              <>
                <div className="flex items-center gap-2 mb-1">
                  <UsdtIcon size={18} />
                  <span className="text-xs opacity-90">当前积分</span>
                </div>
                <div className="text-2xl font-bold">{stats?.currentPoints || 0}</div>
              </>
            )}
          </Card>

          {/* 本月获得 */}
          <Card className="p-4">
            {statsLoading ? (
              <Skeleton className="h-16" />
            ) : (
              <>
                <div className="flex items-center gap-1 mb-1">
                  <TrendingUp className="w-4 h-4 text-green-600" />
                  <span className="text-xs text-gray-600">本月获得</span>
                </div>
                <div className="text-xl font-bold text-green-600">
                  +{stats?.monthEarned || 0}
                </div>
              </>
            )}
          </Card>

          {/* 本月使用 */}
          <Card className="p-4">
            {statsLoading ? (
              <Skeleton className="h-16" />
            ) : (
              <>
                <div className="flex items-center gap-1 mb-1">
                  <TrendingDown className="w-4 h-4 text-red-600" />
                  <span className="text-xs text-gray-600">本月使用</span>
                </div>
                <div className="text-xl font-bold text-red-600">
                  -{stats?.monthSpent || 0}
                </div>
              </>
            )}
          </Card>
        </div>

        {/* 内容区域 */}
        {activeTab === "history" && (
          <Card className="p-4">
            <h2 className="text-base font-semibold mb-3">积分历史</h2>
            
            {historyLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-14" />
                ))}
              </div>
            ) : history && history.length > 0 ? (
              <div className="space-y-2">
                {history.map((record) => {
                  const typeInfo = getTypeInfo(record.type);
                  const isPositive = record.amount > 0;
                  
                  return (
                    <div
                      key={record.id}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className={`text-xs font-medium ${typeInfo.color}`}>
                            {typeInfo.label}
                          </span>
                          <span className="text-xs text-gray-400">
                            {formatDate(record.createdAt)}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500 truncate">
                          {record.description || "无描述"}
                        </div>
                      </div>
                      <div
                        className={`text-base font-bold ml-3 ${
                          isPositive ? "text-green-600" : "text-red-600"
                        }`}
                      >
                        {isPositive ? "+" : ""}{record.amount}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-400">
                <Award className="w-10 h-10 mx-auto mb-2 opacity-50" />
                <p className="text-sm">暂无积分记录</p>
              </div>
            )}
          </Card>
        )}

        {activeTab === "rules" && (
          <div className="space-y-3">
            <Card className="p-4">
              <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
                <Info className="w-4 h-4" style={{ color: "var(--color-primary)" }} />
                积分获取规则
              </h2>
              <div className="space-y-2 text-sm text-gray-600">
                <div className="flex gap-2">
                  <span className="font-medium min-w-[70px]">添加联系人:</span>
                  <span>每次添加新联系人可获得积分，等级越高积分越多</span>
                </div>
                <div className="flex gap-2">
                  <span className="font-medium min-w-[70px]">完成互动:</span>
                  <span>与联系人互动沟通可获得积分</span>
                </div>
                <div className="flex gap-2">
                  <span className="font-medium min-w-[70px]">每日签到:</span>
                  <span>每天登录签到可获得积分，连续签到奖励更多</span>
                </div>
                <div className="flex gap-2">
                  <span className="font-medium min-w-[70px]">推荐新用户:</span>
                  <span>成功推荐新用户注册可获得大量积分</span>
                </div>
                <div className="flex gap-2">
                  <span className="font-medium min-w-[70px]">完成任务:</span>
                  <span>完成系统发布的任务可获得积分</span>
                </div>
                <div className="flex gap-2">
                  <span className="font-medium min-w-[70px]">参与活动:</span>
                  <span>参与平台组织的各类活动可获得积分</span>
                </div>
              </div>
            </Card>

            <Card className="p-4">
              <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
                <Info className="w-4 h-4 text-amber-500" />
                积分使用说明
              </h2>
              <div className="space-y-2 text-sm text-gray-600">
                <div className="flex gap-2">
                  <span className="font-medium min-w-[70px]">兑换奖品:</span>
                  <span>使用积分在奖品商店兑换心仪的奖品</span>
                </div>
                <div className="flex gap-2">
                  <span className="font-medium min-w-[70px]">注意事项:</span>
                  <span>积分一旦使用无法退回，请谨慎兑换</span>
                </div>
              </div>
            </Card>

            {stats && (
              <Card className="p-4">
                <h2 className="text-base font-semibold mb-3">累计统计</h2>
                <div className="grid grid-cols-2 gap-4 text-center">
                  <div>
                    <div className="text-xl font-bold text-green-600">
                      {stats.totalEarned}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">累计获得</div>
                  </div>
                  <div>
                    <div className="text-xl font-bold text-red-600">
                      {stats.totalSpent}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">累计使用</div>
                  </div>
                </div>
              </Card>
            )}
          </div>
        )}

        {activeTab === "levels" && (
          <div className="space-y-3">
            {/* 积分等级规则表 */}
            <Card className="overflow-hidden">
              <h2 className="text-base font-semibold px-4 pt-4 pb-3 flex items-center gap-2">
                <Trophy className="w-4 h-4" style={{ color: "var(--color-primary)" }} />
                积分等级规则
              </h2>
              <div className="overflow-x-auto max-h-[500px]">
                <table className="w-full text-[10px] leading-tight" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
                  <thead className="sticky top-0 bg-white">
                    <tr className="border-b-2">
                      <th className="text-center py-0 px-1.5 font-light text-gray-700 sticky left-0 bg-white z-10 border border-gray-200">等级</th>
                      <th className="text-center py-0 px-1.5 font-light text-gray-700 min-w-[40px] border border-gray-200 relative">
                        <div onClick={() => setTooltipVisible(tooltipVisible === 1 ? null : 1)} className="cursor-pointer">
                          <UserPlus className="w-4 h-4 mx-auto" />
                        </div>
                        {tooltipVisible === 1 && (
                          <div className="absolute z-20 bg-gray-800 text-white text-xs rounded p-2 shadow-lg top-full mt-1 left-1/2 transform -translate-x-1/2 whitespace-nowrap">
                            <div className="font-semibold">{iconDescriptions[0].title}</div>
                            <div className="text-gray-300">{iconDescriptions[0].desc}</div>
                          </div>
                        )}
                      </th>
                      <th className="text-center py-0 px-1.5 font-light text-gray-700 min-w-[40px] border border-gray-200 relative">
                        <div onClick={() => setTooltipVisible(tooltipVisible === 2 ? null : 2)} className="cursor-pointer">
                          <TagLabelIcon size={16} className="mx-auto" />
                        </div>
                        {tooltipVisible === 2 && (
                          <div className="absolute z-20 bg-gray-800 text-white text-xs rounded p-2 shadow-lg top-full mt-1 left-1/2 transform -translate-x-1/2 whitespace-nowrap">
                            <div className="font-semibold">{iconDescriptions[1].title}</div>
                            <div className="text-gray-300">{iconDescriptions[1].desc}</div>
                          </div>
                        )}
                      </th>
                      <th className="text-center py-0 px-1.5 font-light text-gray-700 min-w-[40px] border border-gray-200 relative">
                        <div onClick={() => setTooltipVisible(tooltipVisible === 3 ? null : 3)} className="cursor-pointer">
                          <MessageCircle className="w-4 h-4 mx-auto" />
                        </div>
                        {tooltipVisible === 3 && (
                          <div className="absolute z-20 bg-gray-800 text-white text-xs rounded p-2 shadow-lg top-full mt-1 left-1/2 transform -translate-x-1/2 whitespace-nowrap">
                            <div className="font-semibold">{iconDescriptions[2].title}</div>
                            <div className="text-gray-300">{iconDescriptions[2].desc}</div>
                          </div>
                        )}
                      </th>
                      <th className="text-center py-0 px-1.5 font-light text-gray-700 min-w-[40px] border border-gray-200 relative">
                        <div onClick={() => setTooltipVisible(tooltipVisible === 4 ? null : 4)} className="cursor-pointer">
                          <Calendar className="w-4 h-4 mx-auto" />
                        </div>
                        {tooltipVisible === 4 && (
                          <div className="absolute z-20 bg-gray-800 text-white text-xs rounded p-2 shadow-lg top-full mt-1 left-1/2 transform -translate-x-1/2 whitespace-nowrap">
                            <div className="font-semibold">{iconDescriptions[3].title}</div>
                            <div className="text-gray-300">{iconDescriptions[3].desc}</div>
                          </div>
                        )}
                      </th>
                      <th className="text-center py-0 px-1.5 font-light text-gray-700 min-w-[40px] border border-gray-200 relative">
                        <div onClick={() => setTooltipVisible(tooltipVisible === 5 ? null : 5)} className="cursor-pointer">
                          <UserCheck className="w-4 h-4 mx-auto" />
                        </div>
                        {tooltipVisible === 5 && (
                          <div className="absolute z-20 bg-gray-800 text-white text-xs rounded p-2 shadow-lg top-full mt-1 left-1/2 transform -translate-x-1/2 whitespace-nowrap">
                            <div className="font-semibold">{iconDescriptions[4].title}</div>
                            <div className="text-gray-300">{iconDescriptions[4].desc}</div>
                          </div>
                        )}
                      </th>
                      <th className="text-center py-0 px-1.5 font-light text-gray-700 min-w-[40px] border border-gray-200 relative">
                        <div onClick={() => setTooltipVisible(tooltipVisible === 6 ? null : 6)} className="cursor-pointer">
                          <CheckSquare className="w-4 h-4 mx-auto" />
                        </div>
                        {tooltipVisible === 6 && (
                          <div className="absolute z-20 bg-gray-800 text-white text-xs rounded p-2 shadow-lg top-full mt-1 left-1/2 transform -translate-x-1/2 whitespace-nowrap">
                            <div className="font-semibold">{iconDescriptions[5].title}</div>
                            <div className="text-gray-300">{iconDescriptions[5].desc}</div>
                          </div>
                        )}
                      </th>
                      <th className="text-center py-0 px-1.5 font-light text-gray-700 min-w-[40px] border border-gray-200 relative">
                        <div onClick={() => setTooltipVisible(tooltipVisible === 7 ? null : 7)} className="cursor-pointer">
                          <PartyPopper className="w-4 h-4 mx-auto" />
                        </div>
                        {tooltipVisible === 7 && (
                          <div className="absolute z-20 bg-gray-800 text-white text-xs rounded p-2 shadow-lg top-full mt-1 left-1/2 transform -translate-x-1/2 whitespace-nowrap">
                            <div className="font-semibold">{iconDescriptions[6].title}</div>
                            <div className="text-gray-300">{iconDescriptions[6].desc}</div>
                          </div>
                        )}
                      </th>
                      <th className="text-center py-0 px-1.5 font-light text-gray-700 min-w-[40px] border border-gray-200 relative">
                        <div onClick={() => setTooltipVisible(tooltipVisible === 8 ? null : 8)} className="cursor-pointer">
                          <Share2 className="w-4 h-4 mx-auto" />
                        </div>
                        {tooltipVisible === 8 && (
                          <div className="absolute z-20 bg-gray-800 text-white text-xs rounded p-2 shadow-lg top-full mt-1 left-1/2 transform -translate-x-1/2 whitespace-nowrap">
                            <div className="font-semibold">{iconDescriptions[7].title}</div>
                            <div className="text-gray-300">{iconDescriptions[7].desc}</div>
                          </div>
                        )}
                      </th>
                      <th className="text-center py-0 px-1.5 font-light text-gray-700 min-w-[40px] border border-gray-200 relative">
                        <div onClick={() => setTooltipVisible(tooltipVisible === 9 ? null : 9)} className="cursor-pointer">
                          <Heart className="w-4 h-4 mx-auto" />
                        </div>
                        {tooltipVisible === 9 && (
                          <div className="absolute z-20 bg-gray-800 text-white text-xs rounded p-2 shadow-lg top-full mt-1 left-1/2 transform -translate-x-1/2 whitespace-nowrap">
                            <div className="font-semibold">{iconDescriptions[8].title}</div>
                            <div className="text-gray-300">{iconDescriptions[8].desc}</div>
                          </div>
                        )}
                      </th>
                      <th className="text-center py-0 px-1.5 font-light text-gray-700 min-w-[40px] border border-gray-200 relative">
                        <div onClick={() => setTooltipVisible(tooltipVisible === 10 ? null : 10)} className="cursor-pointer">
                          <MessageSquare className="w-4 h-4 mx-auto" />
                        </div>
                        {tooltipVisible === 10 && (
                          <div className="absolute z-20 bg-gray-800 text-white text-xs rounded p-2 shadow-lg top-full mt-1 left-1/2 transform -translate-x-1/2 whitespace-nowrap">
                            <div className="font-semibold">{iconDescriptions[9].title}</div>
                            <div className="text-gray-300">{iconDescriptions[9].desc}</div>
                          </div>
                        )}
                      </th>
                      <th className="text-center py-0 px-1.5 font-light text-gray-700 min-w-[40px] border border-gray-200 relative">
                        <div onClick={() => setTooltipVisible(tooltipVisible === 11 ? null : 11)} className="cursor-pointer">
                          <CalendarCheck className="w-4 h-4 mx-auto" />
                        </div>
                        {tooltipVisible === 11 && (
                          <div className="absolute z-20 bg-gray-800 text-white text-xs rounded p-2 shadow-lg top-full mt-1 left-1/2 transform -translate-x-1/2 whitespace-nowrap">
                            <div className="font-semibold">{iconDescriptions[10].title}</div>
                            <div className="text-gray-300">{iconDescriptions[10].desc}</div>
                          </div>
                        )}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="text-gray-600 leading-tight">
                    {Array.from({ length: 75 }, (_, i) => i + 1).map((level) => {
                      // 等差递增：1级=0.01分，75级=1分
                      const addContact = (0.01 + (level - 1) * 0.013378).toFixed(2);
                      // 给好友打标签：1级=0.02分，75级=0.35分
                      const addTag = (0.02 + (level - 1) * 0.004459).toFixed(2);
                      
                      return (
                        <tr key={level} className="hover:bg-gray-50">
                          <td className="text-center py-0 px-1.5 font-light sticky left-0 bg-white border border-gray-200">
                            <LevelIcon level={level} size={12} />
                          </td>
                          <td className="text-center py-0 px-1.5 font-light border border-gray-200">{addContact}</td>
                          <td className="text-center py-0 px-1.5 font-light border border-gray-200">{addTag}</td>
                          <td className="text-center py-0 px-1.5 font-light border border-gray-200">-</td>
                          <td className="text-center py-0 px-1.5 font-light border border-gray-200">-</td>
                          <td className="text-center py-0 px-1.5 font-light border border-gray-200">-</td>
                          <td className="text-center py-0 px-1.5 font-light border border-gray-200">-</td>
                          <td className="text-center py-0 px-1.5 font-light border border-gray-200">-</td>
                          <td className="text-center py-0 px-1.5 font-light border border-gray-200">-</td>
                          <td className="text-center py-0 px-1.5 font-light border border-gray-200">-</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
