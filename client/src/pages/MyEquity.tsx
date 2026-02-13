import { Card } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { Loader2, TrendingUp, Users, Handshake, PieChart as PieChartIcon, FileSignature, ChevronDown, ChevronUp, Building2, GitBranch } from "lucide-react";
import { Link } from "wouter";
import { useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { toast } from "sonner";

export default function MyEquity() {
  const { data: equity, isLoading } = trpc.equity.getMyEquity.useQuery();
  const [showStructure, setShowStructure] = useState(false);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#A80000]" />
      </div>
    );
  }

  if (!equity) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500">暂无股权数据</p>
        </div>
      </div>
    );
  }

  // 准备饼图数据
  const pieData = [
    { name: '投资股份', value: equity.investmentEquity, color: '#A80000' },
    { name: '邀请贡献', value: equity.inviteEquity, color: '#FF6B6B' },
    { name: '人脉贡献', value: equity.referralNetworkEquity, color: '#FFA07A' },
    { name: '其他股东', value: Math.max(0, 100 - equity.totalEquity), color: '#E5E7EB' },
  ];

  // 当前时间戳
  const now = new Date();
  const timestampStr = `${now.getFullYear()}年${String(now.getMonth() + 1).padStart(2, '0')}月${String(now.getDate()).padStart(2, '0')}日 ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* 顶部导航 */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center">
          <Link href="/parent/profile">
            <button className="text-gray-600 hover:text-gray-900">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          </Link>
          <h1 className="flex-1 text-center text-lg font-bold text-gray-900">我的股权</h1>
          <div className="w-6"></div>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 py-6 space-y-4">
        {/* 总股份卡片 — 带时间戳 */}
        <Card className="bg-gradient-to-br from-[#A80000] to-[#8a0000] text-white p-6 rounded-2xl shadow-lg border-none">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm opacity-90">我的总股份</span>
            <TrendingUp className="w-5 h-5 opacity-90" />
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-5xl font-bold">{equity.totalEquity.toFixed(4)}</span>
            <span className="text-2xl opacity-90">%</span>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-xs opacity-60">在公司总股本中的占比</span>
            <span className="text-xs opacity-60 bg-white/10 px-2 py-0.5 rounded-full">
              截止 {timestampStr}
            </span>
          </div>
        </Card>

        {/* 在线签署协议入口 */}
        <Card
          className="p-4 rounded-2xl shadow-sm border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => toast.info("在线签署功能即将上线，敬请期待")}
        >
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#A80000] to-[#c44] flex items-center justify-center flex-shrink-0">
              <FileSignature className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-gray-900">在线签署股权投资协议</h3>
              <p className="text-xs text-gray-500 mt-0.5">电子签章，具有法律效力</p>
            </div>
            <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </Card>

        {/* 股权架构说明 — 可折叠 */}
        <Card className="rounded-2xl shadow-sm overflow-hidden">
          <button
            className="w-full p-4 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
            onClick={() => setShowStructure(!showStructure)}
          >
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
                <Building2 className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 text-sm">股权架构说明</h3>
                <p className="text-xs text-gray-500">了解公司股权结构</p>
              </div>
            </div>
            {showStructure ? (
              <ChevronUp className="w-5 h-5 text-gray-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-gray-400" />
            )}
          </button>

          {showStructure && (
            <div className="px-4 pb-5 border-t border-gray-100">
              {/* 架构图 */}
              <div className="mt-4 space-y-3">
                {/* 经营主体 */}
                <div className="relative">
                  <div className="bg-gradient-to-r from-[#A80000] to-[#c44] text-white rounded-xl p-4 text-center">
                    <p className="text-xs opacity-80 mb-1">经营主体</p>
                    <p className="font-bold text-base">上海蓄水池企业管理有限公司</p>
                  </div>
                </div>

                {/* 连接线 */}
                <div className="flex justify-center">
                  <div className="flex flex-col items-center">
                    <div className="w-0.5 h-4 bg-gray-300"></div>
                    <div className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">持股</div>
                    <div className="w-0.5 h-4 bg-gray-300"></div>
                  </div>
                </div>

                {/* 有限合伙 */}
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
                  <p className="text-xs text-blue-600 mb-1">投资主体（有限合伙企业）</p>
                  <p className="font-bold text-gray-900 text-base">全体投资股东</p>
                  <p className="text-xs text-gray-500 mt-1">以有限合伙形式持有经营主体股权</p>
                </div>

                {/* 连接线 */}
                <div className="flex justify-center">
                  <div className="flex flex-col items-center">
                    <div className="w-0.5 h-4 bg-gray-300"></div>
                    <div className="flex items-center space-x-1">
                      <GitBranch className="w-3 h-3 text-gray-400" />
                      <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">合伙人</span>
                    </div>
                    <div className="w-0.5 h-4 bg-gray-300"></div>
                  </div>
                </div>

                {/* 投资人 */}
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
                  <p className="text-xs text-amber-600 mb-1">有限合伙人（LP）</p>
                  <p className="font-bold text-gray-900 text-base">各位投资股东</p>
                  <p className="text-xs text-gray-500 mt-1">按投资额和贡献值分配合伙份额</p>
                </div>
              </div>

              {/* 说明文字 */}
              <div className="mt-4 bg-gray-50 rounded-lg p-3 space-y-2">
                <p className="text-xs text-gray-600 leading-relaxed">
                  <span className="font-semibold text-gray-800">架构说明：</span>
                  所有投资股东以有限合伙人（LP）身份加入有限合伙企业，再由该有限合伙企业持有
                  <span className="font-semibold">上海蓄水池企业管理有限公司</span>
                  的股权。您在本页面看到的股份比例，即为您在有限合伙企业中的份额占比。
                </p>
                <p className="text-xs text-gray-500 leading-relaxed">
                  股份由两部分构成：<span className="text-[#A80000] font-semibold">投资股份池（33.33%）</span>按投资金额比例分配；
                  <span className="text-[#A80000] font-semibold">贡献股份池（66.67%）</span>按邀请用户数和被邀请人的人脉增长分配。
                </p>
              </div>
            </div>
          )}
        </Card>

        {/* 股份构成饼图 */}
        <Card className="p-6 rounded-2xl shadow-sm">
          <div className="flex items-center space-x-2 mb-4">
            <PieChartIcon className="w-5 h-5 text-[#A80000]" />
            <h2 className="text-lg font-bold text-gray-900">股份构成</h2>
          </div>
          
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value }) => value > 0 ? `${name} ${value.toFixed(2)}%` : ''}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => `${value.toFixed(4)}%`} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* 股份明细 */}
        <Card className="p-6 rounded-2xl shadow-sm">
          <h2 className="text-lg font-bold text-gray-900 mb-4">股份明细</h2>
          
          <div className="space-y-4">
            {/* 投资股份 */}
            <div className="flex items-start space-x-3 p-4 bg-red-50 rounded-xl">
              <div className="w-10 h-10 rounded-full bg-[#A80000] flex items-center justify-center flex-shrink-0">
                <span className="text-white text-xl">💰</span>
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-gray-900">投资股份</span>
                  <span className="text-lg font-bold text-[#A80000]">{equity.investmentEquity.toFixed(4)}%</span>
                </div>
                <p className="text-sm text-gray-600">
                  在投资股份池(33.33%)中占比
                </p>
                {equity.details.userInvestment > 0 && (
                  <p className="text-xs text-gray-500 mt-1">
                    投资金额占比: {((equity.details.userInvestment / equity.details.totalInvestment) * 100).toFixed(2)}%
                  </p>
                )}
              </div>
            </div>

            {/* 邀请贡献 */}
            <div className="flex items-start space-x-3 p-4 bg-orange-50 rounded-xl">
              <div className="w-10 h-10 rounded-full bg-[#FF6B6B] flex items-center justify-center flex-shrink-0">
                <Users className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-gray-900">邀请贡献</span>
                  <span className="text-lg font-bold text-[#FF6B6B]">{equity.inviteEquity.toFixed(4)}%</span>
                </div>
                <p className="text-sm text-gray-600">
                  已邀请 {equity.details.inviteCount} 人 × 0.05%/人
                </p>
              </div>
            </div>

            {/* 人脉贡献 */}
            <div className="flex items-start space-x-3 p-4 bg-amber-50 rounded-xl">
              <div className="w-10 h-10 rounded-full bg-[#FFA07A] flex items-center justify-center flex-shrink-0">
                <Handshake className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-gray-900">人脉贡献</span>
                  <span className="text-lg font-bold text-[#FFA07A]">{equity.referralNetworkEquity.toFixed(4)}%</span>
                </div>
                <p className="text-sm text-gray-600">
                  被邀请人带来 {equity.details.referralNetworkCount} 个人脉
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  每100人脉 = 0.02%
                </p>
              </div>
            </div>
          </div>
        </Card>

        {/* 如何增加股份 */}
        <Card className="p-6 rounded-2xl shadow-sm bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200">
          <h2 className="text-lg font-bold text-gray-900 mb-4">💡 如何增加股份？</h2>
          
          <div className="space-y-3">
            <div className="flex items-start space-x-3">
              <div className="w-6 h-6 rounded-full bg-[#A80000] text-white flex items-center justify-center flex-shrink-0 text-xs font-bold">
                1
              </div>
              <div>
                <p className="font-semibold text-gray-900">邀请新用户</p>
                <p className="text-sm text-gray-600">每邀请1人 → <span className="text-[#A80000] font-bold">+0.05%</span></p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <div className="w-6 h-6 rounded-full bg-[#A80000] text-white flex items-center justify-center flex-shrink-0 text-xs font-bold">
                2
              </div>
              <div>
                <p className="font-semibold text-gray-900">帮助被邀请人发展人脉</p>
                <p className="text-sm text-gray-600">被邀请人每增加100人脉 → <span className="text-[#A80000] font-bold">+0.02%</span></p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <div className="w-6 h-6 rounded-full bg-[#A80000] text-white flex items-center justify-center flex-shrink-0 text-xs font-bold">
                3
              </div>
              <div>
                <p className="font-semibold text-gray-900">增加投资</p>
                <p className="text-sm text-gray-600">提升在投资股份池中的占比</p>
              </div>
            </div>
          </div>

          <Link href="/parent/profile/invite">
            <button className="w-full mt-4 bg-[#A80000] text-white py-3 rounded-xl font-semibold hover:bg-[#8a0000] transition-colors">
              立即邀请好友
            </button>
          </Link>
        </Card>
      </div>
    </div>
  );
}
