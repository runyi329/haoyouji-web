import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, TrendingUp, TrendingDown } from "lucide-react";

type SortField = "direct" | "indirect" | "total";
type SortOrder = "asc" | "desc";

export default function ReferrerLeaderboard() {
  const [, setLocation] = useLocation();
  const [sortField, setSortField] = useState<SortField>("total");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  const { data: stats, isLoading } = trpc.contacts.referrerStats.list.useQuery();

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  const sortedStats = stats
    ? [...stats].sort((a, b) => {
        let aValue = 0;
        let bValue = 0;

        if (sortField === "direct") {
          aValue = a.directCount;
          bValue = b.directCount;
        } else if (sortField === "indirect") {
          aValue = a.indirectCount;
          bValue = b.indirectCount;
        } else {
          aValue = a.directCount + a.indirectCount;
          bValue = b.directCount + b.indirectCount;
        }

        return sortOrder === "asc" ? aValue - bValue : bValue - aValue;
      })
    : [];

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortOrder === "desc" ? (
      <TrendingDown className="w-4 h-4 inline ml-1" />
    ) : (
      <TrendingUp className="w-4 h-4 inline ml-1" />
    );
  };

  const medals = ["🥇", "🥈", "🥉"];

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 via-rose-50 to-red-50 p-4">
      <div className="max-w-4xl mx-auto">
        {/* 顶部导航 */}
        <div className="mb-6 flex items-center gap-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLocation("/parent/contacts")}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            返回
          </Button>
          <h1 className="text-2xl font-bold">🏆 介绍人贡献排行榜</h1>
        </div>

        {/* 排行榜卡片 */}
        <Card className="p-6">
          {isLoading ? (
            <div className="text-center py-12 text-gray-500">加载中...</div>
          ) : sortedStats.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              暂无介绍人数据
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b-2 border-gray-200">
                    <th className="py-3 px-4 text-left font-semibold text-gray-700">
                      排名
                    </th>
                    <th className="py-3 px-4 text-left font-semibold text-gray-700">
                      姓名
                    </th>
                    <th
                      className="py-3 px-4 text-center font-semibold text-gray-700 cursor-pointer hover:bg-gray-50"
                      onClick={() => handleSort("direct")}
                    >
                      直接推荐
                      <SortIcon field="direct" />
                    </th>
                    <th
                      className="py-3 px-4 text-center font-semibold text-gray-700 cursor-pointer hover:bg-gray-50"
                      onClick={() => handleSort("indirect")}
                    >
                      间接推荐
                      <SortIcon field="indirect" />
                    </th>
                    <th
                      className="py-3 px-4 text-center font-semibold text-gray-700 cursor-pointer hover:bg-gray-50"
                      onClick={() => handleSort("total")}
                    >
                      总计
                      <SortIcon field="total" />
                    </th>
                    <th className="py-3 px-4 text-center font-semibold text-gray-700">
                      贡献分
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedStats.map((stat, index) => {
                    const totalCount = stat.directCount + stat.indirectCount;
                    const isTopThree = index < 3;

                    return (
                      <tr
                        key={stat.contactId}
                        className="border-b border-gray-100 hover:bg-indigo-50 cursor-pointer transition-colors"
                        onClick={() =>
                          setLocation(`/parent/contacts/${stat.contactId}`)
                        }
                      >
                        <td className="py-4 px-4 text-center">
                          {isTopThree ? (
                            <span className="text-2xl">{medals[index]}</span>
                          ) : (
                            <span className="text-gray-600 font-medium">
                              {index + 1}
                            </span>
                          )}
                        </td>
                        <td className="py-4 px-4 font-medium text-gray-900">
                          {stat.contactName}
                        </td>
                        <td className="py-4 px-4 text-center text-[#1976D2] font-semibold">
                          {stat.directCount}人
                        </td>
                        <td className="py-4 px-4 text-center text-[#D32F2F] font-semibold">
                          {stat.indirectCount}人
                        </td>
                        <td className="py-4 px-4 text-center text-indigo-700 font-bold">
                          {totalCount}人
                        </td>
                        <td className="py-4 px-4 text-center text-[#4CAF50] font-bold">
                          {stat.totalScore.toFixed(1)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* 说明文字 */}
        <div className="mt-6 text-sm text-gray-600 space-y-2">
          <p>
            <strong>直接推荐：</strong>该介绍人直接推荐的人脉数量（一度人脉）
          </p>
          <p>
            <strong>间接推荐：</strong>
            该介绍人通过其推荐的人脉间接带来的人脉数量（二度及以上）
          </p>
          <p>
            <strong>贡献分：</strong>
            综合考虑直接和间接推荐的加权得分（权重可配置）
          </p>
          <p className="text-indigo-600">
            💡 点击任意行可查看该介绍人的详细信息
          </p>
        </div>
      </div>
    </div>
  );
}
