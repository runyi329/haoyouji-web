import React, { useState } from 'react';
import { useLocation } from 'wouter';
import { toast } from 'sonner';
import { MoreVertical, Share2 } from 'lucide-react';
import { trpc } from '@/lib/trpc';

interface Tier {
  levelChar1: string;
  levelChar2: string;
  contacts: number;
  tagsPerPerson: number;
  frequency: number;
  benefit: string;
}

const PromotionRules: React.FC = () => {
  const [, setLocation] = useLocation();
  const [showMenu, setShowMenu] = useState(false);
  
  // 获取晋升统计数据
  const { data: promotionStats } = trpc.equity.getPromotionStats.useQuery(undefined, {
    retry: 2,
    staleTime: 5 * 60 * 1000,
  });

  const userTiers: Tier[] = [
    {
      levelChar1: '标准',
      levelChar2: '用户',
      contacts: 10,
      tagsPerPerson: 20,
      frequency: 30,
      benefit: '全功能免费使用+脉动网礼品兑换'
    },
    {
      levelChar1: '高级',
      levelChar2: '用户',
      contacts: 20,
      tagsPerPerson: 50,
      frequency: 60,
      benefit: '标准权限全覆盖+私域好友共享会'
    },
    {
      levelChar1: '超级',
      levelChar2: '用户',
      contacts: 30,
      tagsPerPerson: 100,
      frequency: 120,
      benefit: '高级权限全覆盖+AI社交优先体验'
    }
  ];

  const nodeTiers: Tier[] = [
    {
      levelChar1: '标准',
      levelChar2: '节点',
      contacts: 50,
      tagsPerPerson: 100,
      frequency: 150,
      benefit: '专属邀请码推荐+贡献持股权奖励'
    },
    {
      levelChar1: '高级',
      levelChar2: '节点',
      contacts: 100,
      tagsPerPerson: 300,
      frequency: 180,
      benefit: '标准权限全覆盖+业务端资源扶持'
    },
    {
      levelChar1: '超级',
      levelChar2: '节点',
      contacts: 150,
      tagsPerPerson: 500,
      frequency: 210,
      benefit: '高级权限全覆盖+受邀联合创始人'
    }
  ];

  // 分享链接
  const handleShareLink = () => {
    const url = window.location.href;
    
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => {
        toast.success('链接已复制到剪贴板!', { duration: 500 });
        setShowMenu(false);
      }).catch(() => {
        toast.error('复制失败,请手动复制');
      });
    } else {
      toast.error('您的浏览器不支持自动复制');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 pb-20">
      {/* 顶部导航栏 */}
      <div className="bg-gradient-to-r from-[#A80000] to-[#8B0000] text-white p-4 flex items-center justify-between shadow-lg sticky top-0 z-10">
        <div className="flex items-center">
          <button onClick={() => setLocation('/parent/my-equity')} className="mr-4">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-xl font-bold">晋升攻略</h1>
        </div>
        
        {/* 分享按钮 */}
        <button 
          onClick={handleShareLink}
          className="p-2 hover:bg-white/10 rounded-full transition-colors"
        >
          <Share2 className="w-6 h-6" />
        </button>
      </div>

      {/* 内容区域 */}
      <div>
      {/* 用户层 */}
      <div className="p-4">
        <h2 className="text-lg font-bold text-gray-800 mb-2">用户层(使用型)</h2>
        <p className="text-sm text-gray-600 mb-4">
          适合专注于个人人脉整理与日常社交的用户,我们为您准备了丰富的礼品与活动。
        </p>
        
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <table className="w-full">
            <tbody>
              {userTiers.map((tier, index) => (
                <>
                  {/* 第1行:等级名称 + 3个指标 */}
                  <tr key={`${index}-row1`} className={index > 0 ? 'border-t-2 border-gray-200' : ''}>
                    <td rowSpan={2} className="w-16 bg-gray-50/80 border-r border-gray-200 text-center align-middle py-3">
                      <div className="flex flex-col items-center justify-center">
                        <div className="text-sm font-bold text-[#A80000] leading-tight">{tier.levelChar1}</div>
                        <div className="text-sm font-bold text-[#A80000] leading-tight">{tier.levelChar2}</div>
                      </div>
                    </td>
                    <td className="text-center py-3 px-2 border-r border-gray-200">
                      <div className="text-xs text-gray-600">
                        人脉×<span className="font-bold text-gray-800">{tier.contacts}</span>
                      </div>
                    </td>
                    <td className="text-center py-3 px-2 border-r border-gray-200">
                      <div className="text-xs text-gray-600">
                        标签×<span className="font-bold text-gray-800">{tier.tagsPerPerson}</span>
                      </div>
                    </td>
                    <td className="text-center py-3 px-2">
                      <div className="text-xs text-gray-600">
                        联络×<span className="font-bold text-gray-800">{tier.frequency}</span>
                      </div>
                    </td>
                  </tr>
                  {/* 第2行:权益(合并3列,添加上边框) */}
                  <tr key={`${index}-row2`}>
                    <td colSpan={3} className="px-3 py-2.5 bg-gray-50/50 border-t border-gray-200">
                      <div className="text-xs text-gray-600 leading-relaxed">
                        {tier.benefit}
                      </div>
                    </td>
                  </tr>
                </>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 节点层 */}
      <div className="p-4">
        <h2 className="text-lg font-bold text-gray-800 mb-2">节点层(经营型)</h2>
        <p className="text-sm text-gray-600 mb-4">
          适合致力于人脉资产经营与价值创造的合作伙伴,您将深度参与公司的成长和利润分享。
        </p>
        
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <table className="w-full">
            <tbody>
              {nodeTiers.map((tier, index) => (
                <>
                  {/* 第1行:等级名称 + 3个指标 */}
                  <tr key={`${index}-row1`} className={index > 0 ? 'border-t-2 border-gray-200' : ''}>
                    <td rowSpan={2} className="w-16 bg-gray-50/80 border-r border-gray-200 text-center align-middle py-3">
                      <div className="flex flex-col items-center justify-center">
                        <div className="text-sm font-bold text-[#A80000] leading-tight">{tier.levelChar1}</div>
                        <div className="text-sm font-bold text-[#A80000] leading-tight">{tier.levelChar2}</div>
                      </div>
                    </td>
                    <td className="text-center py-3 px-2 border-r border-gray-200">
                      <div className="text-xs text-gray-600">
                        人脉×<span className="font-bold text-gray-800">{tier.contacts}</span>
                      </div>
                    </td>
                    <td className="text-center py-3 px-2 border-r border-gray-200">
                      <div className="text-xs text-gray-600">
                        标签×<span className="font-bold text-gray-800">{tier.tagsPerPerson}</span>
                      </div>
                    </td>
                    <td className="text-center py-3 px-2">
                      <div className="text-xs text-gray-600">
                        联络×<span className="font-bold text-gray-800">{tier.frequency}</span>
                      </div>
                    </td>
                  </tr>
                  {/* 第2行:权益(合并3列,添加上边框) */}
                  <tr key={`${index}-row2`}>
                    <td colSpan={3} className="px-3 py-2.5 bg-gray-50/50 border-t border-gray-200">
                      <div className="text-xs text-gray-600 leading-relaxed">
                        {tier.benefit}
                      </div>
                    </td>
                  </tr>
                </>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 考核指标说明 */}
      <div className="p-4 pb-6">
        <div className="bg-white rounded-lg shadow-sm p-4">
          <h3 className="text-xs font-bold text-gray-700 mb-3">晋升攻略</h3>
          <div className="space-y-3 text-xs text-gray-600 leading-relaxed">
            <div>
              <p className="mb-2">
                <span className="font-semibold text-gray-700">人脉:</span>
                账户内添加的联系人数量,不考虑信息完整度。
              </p>
              {promotionStats && (
                <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">使用至今已添加：</span>
                    <span className="font-bold text-[#A80000] text-sm">
                      {promotionStats.contactCount}人
                    </span>
                  </div>
                </div>
              )}
            </div>
            <div>
              <p className="mb-2">
                <span className="font-semibold text-gray-700">标签:</span>
                所有好友的标签总和（包含全局标签和个人标签）。
              </p>
              {promotionStats && (
                <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">使用至今已添加：</span>
                    <span className="font-bold text-[#A80000] text-sm">
                      {promotionStats.tagCount}个
                    </span>
                  </div>
                </div>
              )}
            </div>
            <div>
              <p className="mb-2">
                <span className="font-semibold text-gray-700">联络:</span>
                每周日晚上12点作为统计节点，统计该节点往前推30天的累计联络次数。符合条件则接下来一周保持该级别，下周日再次统计。
              </p>
              {promotionStats?.assessmentPeriod && (
                <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                <div className="text-xs space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">本考核周期联络：</span>
                    <span className="font-bold text-[#A80000] text-sm">
                      {promotionStats.assessmentPeriod.currentInteractionCount}次
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-gray-500">
                    <span>考核期进度：</span>
                    <span>
                      已过{promotionStats.assessmentPeriod.daysPassed}天，剩{promotionStats.assessmentPeriod.daysRemaining}天
                    </span>
                  </div>
                  <div className="text-[10px] text-gray-400 mt-2 pt-2 border-t border-gray-200">
                    考核期：{promotionStats.assessmentPeriod.startDate} 至 {promotionStats.assessmentPeriod.endDate}
                  </div>
                </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
};

export default PromotionRules;
