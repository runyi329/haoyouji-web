import React from 'react';
import { useLocation } from 'wouter';

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

  const userTiers: Tier[] = [
    {
      levelChar1: '标准',
      levelChar2: '用户',
      contacts: 5,
      tagsPerPerson: 1,
      frequency: 1,
      benefit: '开启基础功能，享有积分商城初级兑换权限'
    },
    {
      levelChar1: '高级',
      levelChar2: '用户',
      contacts: 10,
      tagsPerPerson: 2,
      frequency: 2,
      benefit: '享有专属礼品定期兑换权限'
    },
    {
      levelChar1: '超级',
      levelChar2: '用户',
      contacts: 20,
      tagsPerPerson: 3,
      frequency: 3,
      benefit: '获得线下人脉交流活动优先邀请权，免除参与费用'
    }
  ];

  const nodeTiers: Tier[] = [
    {
      levelChar1: '标准',
      levelChar2: '节点',
      contacts: 50,
      tagsPerPerson: 3,
      frequency: 3,
      benefit: '开启倍率收益结算，获得节点经营团队组建权限'
    },
    {
      levelChar1: '高级',
      levelChar2: '节点',
      contacts: 100,
      tagsPerPerson: 5,
      frequency: 5,
      benefit: '享有 2.2倍 收益爆发，并入围公司个人股权激励计划'
    },
    {
      levelChar1: '超级',
      levelChar2: '节点',
      contacts: 150,
      tagsPerPerson: 8,
      frequency: 10,
      benefit: '享有公司最高级权益分红，受邀入公司战略合伙人'
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 pb-20">
      {/* 顶部导航栏 */}
      <div className="bg-gradient-to-r from-[#A80000] to-[#8B0000] text-white p-4 flex items-center shadow-lg sticky top-0 z-10">
        <button onClick={() => setLocation('/parent')} className="mr-4">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-xl font-bold">晋升准则</h1>
      </div>

      {/* 用户层 */}
      <div className="p-4">
        <h2 className="text-lg font-bold text-gray-800 mb-2">用户层（使用型）</h2>
        <p className="text-sm text-gray-600 mb-4">
          适合专注于个人人脉整理与日常社交的用户，我们为您准备了丰富的礼品与活动。
        </p>
        
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <table className="w-full">
            <tbody>
              {userTiers.map((tier, index) => (
                <>
                  {/* 第1行：等级名称 + 3个指标 */}
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
                  {/* 第2行：权益（合并3列，添加上边框） */}
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
        <h2 className="text-lg font-bold text-gray-800 mb-2">节点层（经营型）</h2>
        <p className="text-sm text-gray-600 mb-4">
          适合致力于人脉资产经营与价值创造的合作伙伴，您将深度参与公司的成长和利润分享。
        </p>
        
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <table className="w-full">
            <tbody>
              {nodeTiers.map((tier, index) => (
                <>
                  {/* 第1行：等级名称 + 3个指标 */}
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
                  {/* 第2行：权益（合并3列，添加上边框） */}
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
          <div className="space-y-2 text-xs text-gray-600 leading-relaxed">
            <p>
              <span className="font-semibold text-gray-700">人脉：</span>
              账户内添加的联系人数量，不考虑信息完整度。
            </p>
            <p>
              <span className="font-semibold text-gray-700">标签：</span>
              所有联系人的平均标签数。例如3人中2人标签为0、1人标签为9，平均值为3。包含全局标签和个人标签。
            </p>
            <p>
              <span className="font-semibold text-gray-700">联络：</span>
              每个自然周（周一至周日）登记联络人脉的次数。本周权益取决于上周是否达标，上周达标本周享有权益，本周未达标下周失去权益。系统会提示您本周还差多少次联络。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PromotionRules;
