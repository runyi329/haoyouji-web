import { useLocation } from 'wouter';
import { useState } from 'react';

export default function PromotionRules() {
  const [, setLocation] = useLocation();
  const [showModal, setShowModal] = useState<string | null>(null);

  // 用户层数据
  const userTiers = [
    {
      level: '标准用户',
      levelChar1: '标准',
      levelChar2: '用户',
      contacts: '5',
      tagsPerPerson: '1',
      frequency: '1',
      benefit: '开启基础功能，享有积分商城初级兑换权限',
      showTooltip: true, // 显示问号
    },
    {
      level: '高级用户',
      levelChar1: '高级',
      levelChar2: '用户',
      contacts: '10',
      tagsPerPerson: '2',
      frequency: '2',
      benefit: '享有专属礼品定期兑换权限',
      showTooltip: false,
    },
    {
      level: '超级用户',
      levelChar1: '超级',
      levelChar2: '用户',
      contacts: '20',
      tagsPerPerson: '3',
      frequency: '3',
      benefit: '获得线下人脉交流活动优先邀请权，免除参与费用',
      showTooltip: false,
    },
  ];

  // 节点层数据
  const nodeTiers = [
    {
      level: '标准节点',
      levelChar1: '标准',
      levelChar2: '节点',
      contacts: '50',
      tagsPerPerson: '3',
      frequency: '3',
      benefit: '开启倍率收益结算，获得节点经营团队组建权限',
      showTooltip: true, // 显示问号
    },
    {
      level: '高级节点',
      levelChar1: '高级',
      levelChar2: '节点',
      contacts: '100',
      tagsPerPerson: '5',
      frequency: '5',
      benefit: '享有 2.2倍 收益爆发，并入围公司个人股权激励计划',
      highlight: true,
      showTooltip: false,
    },
    {
      level: '超级节点',
      levelChar1: '超级',
      levelChar2: '节点',
      contacts: '150',
      tagsPerPerson: '8',
      frequency: '10',
      benefit: '享有公司季度股权分红，受邀进入公司战略决策委员会',
      highlight: true,
      showTooltip: false,
    },
  ];

  const tooltipContent: { [key: string]: { title: string; content: string } } = {
    'contacts': {
      title: '人脉规模',
      content: '指您在"好友记"中录入并维护的有效联系人总数。（具体说明待补充）'
    },
    'tags': {
      title: '标签深度',
      content: '指平均每位联系人身上添加的标签数量，反映您对人脉的了解程度。（具体说明待补充）'
    },
    'frequency': {
      title: '联络频次',
      content: '指您每日平均与多少位联系人进行有效互动或记录联络。（具体说明待补充）'
    }
  };

  const handleModalOpen = (key: string) => {
    setShowModal(key);
  };

  const handleModalClose = () => {
    setShowModal(null);
  };

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
                  <tr key={`${index}-row1`} className={index > 0 ? 'border-t-2 border-gray-200' : ''}>
                    <td rowSpan={2} className="w-16 bg-gray-50/80 border-r border-gray-200 text-center align-middle py-3">
                      <div className="flex flex-col items-center justify-center">
                        <div className="text-sm font-bold text-[#A80000] leading-tight">{tier.levelChar1}</div>
                        <div className="text-sm font-bold text-[#A80000] leading-tight">{tier.levelChar2}</div>
                      </div>
                    </td>
                    <td className="text-center py-3 px-2 border-r border-gray-200">
                      <div className="flex items-center justify-center gap-1.5 relative">
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                        <span className="text-sm font-bold text-gray-800">{tier.contacts}</span>
                        {tier.showTooltip && (
                          <button
                            onClick={() => handleModalOpen('contacts')}
                            className="absolute left-[calc(50%+20px)] flex-shrink-0"
                          >
                            <svg className="w-3.5 h-3.5 text-gray-400 hover:text-[#A80000]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="text-center py-3 px-2 border-r border-gray-200">
                      <div className="flex items-center justify-center gap-1.5 relative">
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                        </svg>
                        <span className="text-sm font-bold text-gray-800">{tier.tagsPerPerson}</span>
                        {tier.showTooltip && (
                          <button
                            onClick={() => handleModalOpen('tags')}
                            className="absolute left-[calc(50%+12px)] flex-shrink-0"
                          >
                            <svg className="w-3.5 h-3.5 text-gray-400 hover:text-[#A80000]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="text-center py-3 px-2">
                      <div className="flex items-center justify-center gap-1.5 relative">
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                        <span className="text-sm font-bold text-gray-800">{tier.frequency}</span>
                        {tier.showTooltip && (
                          <button
                            onClick={() => handleModalOpen('frequency')}
                            className="absolute left-[calc(50%+12px)] flex-shrink-0"
                          >
                            <svg className="w-3.5 h-3.5 text-gray-400 hover:text-[#A80000]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </button>
                        )}
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
                  <tr key={`${index}-row1`} className={index > 0 ? 'border-t-2 border-gray-200' : ''}>
                    <td rowSpan={2} className="w-16 bg-gray-50/80 border-r border-gray-200 text-center align-middle py-3">
                      <div className="flex flex-col items-center justify-center">
                        <div className="text-sm font-bold text-[#A80000] leading-tight">{tier.levelChar1}</div>
                        <div className="text-sm font-bold text-[#A80000] leading-tight">{tier.levelChar2}</div>
                      </div>
                    </td>
                    <td className="text-center py-3 px-2 border-r border-gray-200">
                      <div className="flex items-center justify-center gap-1.5 relative">
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                        <span className="text-sm font-bold text-gray-800">{tier.contacts}</span>
                        {tier.showTooltip && (
                          <button
                            onClick={() => handleModalOpen('contacts')}
                            className="absolute left-[calc(50%+24px)] flex-shrink-0"
                          >
                            <svg className="w-3.5 h-3.5 text-gray-400 hover:text-[#A80000]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="text-center py-3 px-2 border-r border-gray-200">
                      <div className="flex items-center justify-center gap-1.5 relative">
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                        </svg>
                        <span className="text-sm font-bold text-gray-800">{tier.tagsPerPerson}</span>
                        {tier.showTooltip && (
                          <button
                            onClick={() => handleModalOpen('tags')}
                            className="absolute left-[calc(50%+12px)] flex-shrink-0"
                          >
                            <svg className="w-3.5 h-3.5 text-gray-400 hover:text-[#A80000]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="text-center py-3 px-2">
                      <div className="flex items-center justify-center gap-1.5 relative">
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                        <span className="text-sm font-bold text-gray-800">{tier.frequency}</span>
                        {tier.showTooltip && (
                          <button
                            onClick={() => handleModalOpen('frequency')}
                            className="absolute left-[calc(50%+16px)] flex-shrink-0"
                          >
                            <svg className="w-3.5 h-3.5 text-gray-400 hover:text-[#A80000]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {/* 第2行：权益（合并3列，添加上边框） */}
                  <tr key={`${index}-row2`}>
                    <td colSpan={3} className="px-3 py-2.5 bg-gray-50/50 border-t border-gray-200">
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

      {/* 提示框模态窗口 */}
      {showModal && (
        <div 
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] px-4"
          onClick={handleModalClose}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-5 relative"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 关闭按钮 */}
            <button
              onClick={handleModalClose}
              className="absolute top-3 right-3 text-gray-400 hover:text-gray-600"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* 标题 */}
            <h3 className="text-base font-bold text-gray-900 mb-3 pr-6">
              {tooltipContent[showModal]?.title}
            </h3>

            {/* 内容 */}
            <p className="text-sm text-gray-700 leading-relaxed">
              {tooltipContent[showModal]?.content}
            </p>

            {/* 确定按钮 */}
            <button
              onClick={handleModalClose}
              className="mt-4 w-full bg-[#A80000] text-white py-2.5 rounded-xl font-medium hover:bg-[#8a0000] transition-colors"
            >
              我知道了
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
