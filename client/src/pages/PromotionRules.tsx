import { useLocation } from 'wouter';

export default function PromotionRules() {
  const [, setLocation] = useLocation();

  // 用户层数据
  const userTiers = [
    {
      level: '标准用户',
      levelChar1: '标准',
      levelChar2: '用户',
      contacts: '5人',
      tagsPerPerson: '人均1个',
      frequency: '日累计1人',
      benefit: '开启基础功能，享有积分商城初级兑换权限',
    },
    {
      level: '高级用户',
      levelChar1: '高级',
      levelChar2: '用户',
      contacts: '10人',
      tagsPerPerson: '人均2个',
      frequency: '日累计2人',
      benefit: '享有专属礼品定期兑换权限',
    },
    {
      level: '超级用户',
      levelChar1: '超级',
      levelChar2: '用户',
      contacts: '20人',
      tagsPerPerson: '人均3个',
      frequency: '日累计3人',
      benefit: '获得线下人脉交流活动优先邀请权，免除参与费用',
    },
  ];

  // 节点层数据
  const nodeTiers = [
    {
      level: '标准节点',
      levelChar1: '标准',
      levelChar2: '节点',
      contacts: '50人',
      tagsPerPerson: '人均3个',
      frequency: '日累计3人',
      benefit: '开启倍率收益结算，获得节点经营团队组建权限',
    },
    {
      level: '高级节点',
      levelChar1: '高级',
      levelChar2: '节点',
      contacts: '100人',
      tagsPerPerson: '人均5个',
      frequency: '日累计5人',
      benefit: '享有 2.2倍 收益爆发，并入围公司个人股权激励计划',
      highlight: true,
    },
    {
      level: '超级节点',
      levelChar1: '超级',
      levelChar2: '节点',
      contacts: '150人',
      tagsPerPerson: '人均8个',
      frequency: '日累计10人',
      benefit: '享有公司季度股权分红，受邀进入公司战略决策委员会',
      highlight: true,
    },
  ];

  return (
    <div className="min-h-screen bg-[#F5F5F5] pb-8">
      {/* 顶部导航栏 */}
      <div className="sticky top-0 z-50 bg-gradient-to-r from-[#A80000] to-[#8a0000] text-white">
        <div className="flex items-center justify-between px-4 py-3">
          <button
            onClick={() => setLocation('/parent/my-equity')}
            className="p-2 -ml-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-lg font-semibold">晋升准则</h1>
          <div className="w-10" />
        </div>
      </div>

      {/* 主内容区 */}
      <div className="px-4 pt-6">
        {/* 用户层说明 */}
        <div className="mb-4">
          <h2 className="text-base font-semibold text-gray-800 mb-1.5">用户层（使用型）</h2>
          <p className="text-xs text-gray-600 leading-relaxed">
            适合专注于个人人脉整理与日常社交的用户，我们为您准备了丰富的礼品与活动。
          </p>
        </div>

        {/* 用户层表格 */}
        <div className="bg-white/60 backdrop-blur-sm border border-gray-200/60 rounded-2xl overflow-hidden shadow-sm mb-10">
          <table className="w-full">
            <tbody>
              {userTiers.map((tier, index) => (
                <>
                  {/* 第1行：等级名称 + 3个指标 */}
                  <tr key={`${index}-row1`} className={index > 0 ? 'border-t border-gray-200' : ''}>
                    <td rowSpan={2} className="w-16 bg-gray-50/80 border-r border-gray-200 text-center align-middle py-3">
                      <div className="flex flex-col items-center justify-center">
                        <div className="text-sm font-bold text-[#A80000] leading-tight">{tier.levelChar1}</div>
                        <div className="text-sm font-bold text-[#A80000] leading-tight">{tier.levelChar2}</div>
                      </div>
                    </td>
                    <td className="text-center py-2.5 px-2 border-r border-gray-200">
                      <div className="text-xs font-semibold text-gray-800">{tier.contacts}</div>
                    </td>
                    <td className="text-center py-2.5 px-2 border-r border-gray-200">
                      <div className="text-xs font-semibold text-gray-800">{tier.tagsPerPerson}</div>
                    </td>
                    <td className="text-center py-2.5 px-2">
                      <div className="text-xs font-semibold text-gray-800">{tier.frequency}</div>
                    </td>
                  </tr>
                  {/* 第2行：权益（合并3列） */}
                  <tr key={`${index}-row2`}>
                    <td colSpan={3} className="px-3 py-2.5 bg-gray-50/50">
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

        {/* 节点层说明 */}
        <div className="mb-4">
          <h2 className="text-base font-semibold text-gray-800 mb-1.5">节点层（经营型）</h2>
          <p className="text-xs text-gray-600 leading-relaxed">
            适合致力于人脉资产经营与价值创造的合作伙伴，您将深度参与公司的成长红利分享。
          </p>
        </div>

        {/* 节点层表格 */}
        <div className="bg-white/60 backdrop-blur-sm border border-gray-200/60 rounded-2xl overflow-hidden shadow-sm">
          <table className="w-full">
            <tbody>
              {nodeTiers.map((tier, index) => (
                <>
                  {/* 第1行：等级名称 + 3个指标 */}
                  <tr key={`${index}-row1`} className={index > 0 ? 'border-t border-gray-200' : ''}>
                    <td rowSpan={2} className="w-16 bg-gray-50/80 border-r border-gray-200 text-center align-middle py-3">
                      <div className="flex flex-col items-center justify-center">
                        <div className="text-sm font-bold text-[#A80000] leading-tight">{tier.levelChar1}</div>
                        <div className="text-sm font-bold text-[#A80000] leading-tight">{tier.levelChar2}</div>
                      </div>
                    </td>
                    <td className="text-center py-2.5 px-2 border-r border-gray-200">
                      <div className="text-xs font-semibold text-gray-800">{tier.contacts}</div>
                    </td>
                    <td className="text-center py-2.5 px-2 border-r border-gray-200">
                      <div className="text-xs font-semibold text-gray-800">{tier.tagsPerPerson}</div>
                    </td>
                    <td className="text-center py-2.5 px-2">
                      <div className="text-xs font-semibold text-gray-800">{tier.frequency}</div>
                    </td>
                  </tr>
                  {/* 第2行：权益（合并3列） */}
                  <tr key={`${index}-row2`}>
                    <td colSpan={3} className="px-3 py-2.5 bg-gray-50/50">
                      <div className="text-xs text-gray-600 leading-relaxed">
                        {tier.highlight ? (
                          <span dangerouslySetInnerHTML={{
                            __html: tier.benefit
                              .replace(/2\.2倍/g, '<span class="font-bold text-[#C5B358]">2.2倍</span>')
                              .replace(/股权激励/g, '<span class="font-semibold text-[#C5B358]">股权激励</span>')
                              .replace(/股权分红/g, '<span class="font-bold text-[#C5B358]">股权分红</span>')
                          }} />
                        ) : (
                          tier.benefit
                        )}
                      </div>
                    </td>
                  </tr>
                </>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
