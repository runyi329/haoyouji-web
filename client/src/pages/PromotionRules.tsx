import { useLocation } from 'wouter';

export default function PromotionRules() {
  const [, setLocation] = useLocation();

  // 用户层数据
  const userTiers = [
    {
      level: '标准用户',
      contacts: '5人',
      tagsPerPerson: '人均1个',
      frequency: '日累计1人',
      benefit: '开启基础功能，享有积分商城初级兑换权限',
    },
    {
      level: '高级用户',
      contacts: '10人',
      tagsPerPerson: '人均2个',
      frequency: '日累计2人',
      benefit: '享有专属礼品定期兑换权限',
    },
    {
      level: '超级用户',
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
      contacts: '50人',
      tagsPerPerson: '人均3个',
      frequency: '日累计3人',
      benefit: '开启倍率收益结算，获得节点经营团队组建权限',
    },
    {
      level: '高级节点',
      contacts: '100人',
      tagsPerPerson: '人均5个',
      frequency: '日累计5人',
      benefit: '享有 2.2倍 收益爆发，并入围公司个人股权激励计划',
      highlight: true,
    },
    {
      level: '超级节点',
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
          <h2 className="text-base font-semibold text-gray-800 mb-1">用户层（使用型）</h2>
          <p className="text-xs text-gray-600 leading-relaxed">
            适合专注于个人人脉整理与日常社交的用户，我们为您准备了丰富的礼品与活动。
          </p>
        </div>

        {/* 用户层卡片 */}
        <div className="space-y-2 mb-6">
          {userTiers.map((tier, index) => (
            <div
              key={index}
              className="bg-white/50 backdrop-blur-sm border border-gray-200/50 rounded-xl p-3"
            >
              {/* 级别标题 */}
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-bold text-[#A80000]">{tier.level}</h3>
              </div>

              {/* 准入要求（横向布局） */}
              <div className="flex items-center gap-3 text-xs text-gray-700 mb-2">
                <div className="flex items-center gap-1">
                  <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  <span className="font-medium">{tier.contacts}</span>
                </div>
                <div className="w-px h-3 bg-gray-300" />
                <div className="flex items-center gap-1">
                  <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                  </svg>
                  <span className="font-medium">{tier.tagsPerPerson}</span>
                </div>
                <div className="w-px h-3 bg-gray-300" />
                <div className="flex items-center gap-1">
                  <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  <span className="font-medium">{tier.frequency}</span>
                </div>
              </div>

              {/* 权益 */}
              <div className="text-xs text-gray-600 leading-relaxed">
                {tier.benefit}
              </div>
            </div>
          ))}
        </div>

        {/* 节点层说明 */}
        <div className="mb-4 mt-8">
          <h2 className="text-base font-semibold text-gray-800 mb-1">节点层（经营型）</h2>
          <p className="text-xs text-gray-600 leading-relaxed">
            适合致力于人脉资产经营与价值创造的合作伙伴，您将深度参与公司的成长红利分享。
          </p>
        </div>

        {/* 节点层卡片 */}
        <div className="space-y-2">
          {nodeTiers.map((tier, index) => (
            <div
              key={index}
              className="bg-white/50 backdrop-blur-sm border border-gray-200/50 rounded-xl p-3"
            >
              {/* 级别标题 */}
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-bold text-[#A80000]">{tier.level}</h3>
              </div>

              {/* 准入要求（横向布局） */}
              <div className="flex items-center gap-3 text-xs text-gray-700 mb-2">
                <div className="flex items-center gap-1">
                  <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  <span className="font-medium">{tier.contacts}</span>
                </div>
                <div className="w-px h-3 bg-gray-300" />
                <div className="flex items-center gap-1">
                  <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                  </svg>
                  <span className="font-medium">{tier.tagsPerPerson}</span>
                </div>
                <div className="w-px h-3 bg-gray-300" />
                <div className="flex items-center gap-1">
                  <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  <span className="font-medium">{tier.frequency}</span>
                </div>
              </div>

              {/* 权益 */}
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
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
