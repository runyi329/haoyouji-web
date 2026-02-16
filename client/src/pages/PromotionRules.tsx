import { useLocation } from 'wouter';

export default function PromotionRules() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white pb-20">
      {/* 顶部导航栏 */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200">
        <div className="flex items-center px-4 py-3">
          <button
            onClick={() => setLocation('/parent/my-equity')}
            className="text-gray-600 hover:text-gray-900"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="flex-1 text-center text-lg font-semibold text-gray-900">
            晋升准则
          </h1>
          <div className="w-6"></div>
        </div>
      </div>

      {/* 页面顶部说明 */}
      <div className="px-4 py-6">
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl p-6 mb-4">
          <h2 className="text-base font-bold text-gray-900 mb-2">用户层（使用型）</h2>
          <p className="text-sm text-gray-600 leading-relaxed">
            适合专注于个人人脉整理与日常社交的用户，我们为您准备了丰富的礼品与活动。
          </p>
        </div>
        <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-2xl p-6">
          <h2 className="text-base font-bold text-gray-900 mb-2">节点层（经营型）</h2>
          <p className="text-sm text-gray-600 leading-relaxed">
            适合致力于人脉资产经营与价值创造的合作伙伴，您将深度参与公司的成长红利分享。
          </p>
        </div>
      </div>

      {/* 用户层卡片 */}
      <div className="px-4 space-y-4">
        {/* 卡片1：标准用户 */}
        <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-gray-900">标准用户</h3>
            <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
              <span className="text-xl">🥉</span>
            </div>
          </div>
          
          <div className="space-y-3 mb-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">人脉规模</span>
              <span className="text-base font-bold text-gray-900">5人</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">人均标签深度</span>
              <span className="text-base font-bold text-gray-900">1个</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">周均联络频次</span>
              <span className="text-base font-bold text-gray-900">日累计1人</span>
            </div>
          </div>

          <div className="bg-white/80 rounded-xl p-4">
            <div className="text-xs text-gray-500 mb-1">核心权益</div>
            <div className="text-sm text-gray-900 leading-relaxed">
              开启基础功能，享有积分商城初级兑换权限
            </div>
          </div>
        </div>

        {/* 卡片2：高级用户 */}
        <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-gray-900">高级用户</h3>
            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
              <span className="text-xl">🥈</span>
            </div>
          </div>
          
          <div className="space-y-3 mb-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">人脉规模</span>
              <span className="text-base font-bold text-gray-900">10人</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">人均标签深度</span>
              <span className="text-base font-bold text-gray-900">2个</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">周均联络频次</span>
              <span className="text-base font-bold text-gray-900">日累计2人</span>
            </div>
          </div>

          <div className="bg-white/80 rounded-xl p-4">
            <div className="text-xs text-gray-500 mb-1">核心权益</div>
            <div className="text-sm text-gray-900 leading-relaxed">
              享有专属礼品定期兑换权限
            </div>
          </div>
        </div>

        {/* 卡片3：超级用户 */}
        <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-gray-900">超级用户</h3>
            <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
              <span className="text-xl">🥇</span>
            </div>
          </div>
          
          <div className="space-y-3 mb-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">人脉规模</span>
              <span className="text-base font-bold text-gray-900">20人</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">人均标签深度</span>
              <span className="text-base font-bold text-gray-900">3个</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">周均联络频次</span>
              <span className="text-base font-bold text-gray-900">日累计3人</span>
            </div>
          </div>

          <div className="bg-white/80 rounded-xl p-4">
            <div className="text-xs text-gray-500 mb-1">核心权益</div>
            <div className="text-sm text-gray-900 leading-relaxed">
              获得线下人脉交流活动优先邀请权，免除参与费用
            </div>
          </div>
        </div>
      </div>

      {/* 视觉转场点 */}
      <div className="px-4 py-8">
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t-2 border-[#A80000]"></div>
          </div>
          <div className="relative flex justify-center">
            <span className="bg-gradient-to-r from-[#A80000] to-[#C5B358] text-white px-6 py-2 rounded-full text-sm font-semibold shadow-lg">
              从使用者到经营者，开启股权红利之路
            </span>
          </div>
        </div>
      </div>

      {/* 节点层卡片 */}
      <div className="px-4 space-y-4">
        {/* 卡片4：标准节点 */}
        <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl p-6 shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-white">标准节点</h3>
            <div className="w-10 h-10 bg-gray-700 rounded-full flex items-center justify-center">
              <span className="text-xl">💼</span>
            </div>
          </div>
          
          <div className="space-y-3 mb-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-300">人脉规模</span>
              <span className="text-base font-bold text-white">50人</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-300">人均标签深度</span>
              <span className="text-base font-bold text-white">3个</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-300">周均联络频次</span>
              <span className="text-base font-bold text-white">日累计3人</span>
            </div>
          </div>

          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
            <div className="text-xs text-gray-300 mb-1">核心权益</div>
            <div className="text-sm text-white leading-relaxed">
              开启倍率收益结算，获得节点经营团队组建权限
            </div>
          </div>
        </div>

        {/* 卡片5：高级节点 */}
        <div className="bg-gradient-to-br from-indigo-900 to-purple-900 rounded-2xl p-6 shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-white">高级节点</h3>
            <div className="w-10 h-10 bg-indigo-700 rounded-full flex items-center justify-center">
              <span className="text-xl">💎</span>
            </div>
          </div>
          
          <div className="space-y-3 mb-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-300">人脉规模</span>
              <span className="text-base font-bold text-white">100人</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-300">人均标签深度</span>
              <span className="text-base font-bold text-white">5个</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-300">周均联络频次</span>
              <span className="text-base font-bold text-white">日累计5人</span>
            </div>
          </div>

          <div className="bg-gradient-to-r from-[#C5B358]/20 to-[#D4AF37]/20 backdrop-blur-sm rounded-xl p-4 border border-[#C5B358]/30">
            <div className="text-xs text-gray-300 mb-1">核心权益</div>
            <div className="text-sm text-white leading-relaxed">
              享有 <span className="text-[#C5B358] font-bold text-base">2.2倍</span> 收益爆发，并入围公司个人<span className="text-[#C5B358] font-semibold">股权激励</span>计划
            </div>
          </div>
        </div>

        {/* 卡片6：超级节点 */}
        <div className="bg-gradient-to-br from-amber-900 to-orange-900 rounded-2xl p-6 shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-white">超级节点</h3>
            <div className="w-10 h-10 bg-amber-700 rounded-full flex items-center justify-center">
              <span className="text-xl">👑</span>
            </div>
          </div>
          
          <div className="space-y-3 mb-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-300">人脉规模</span>
              <span className="text-base font-bold text-white">150人</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-300">人均标签深度</span>
              <span className="text-base font-bold text-white">8个</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-300">周均联络频次</span>
              <span className="text-base font-bold text-white">日累计10人</span>
            </div>
          </div>

          <div className="bg-gradient-to-r from-[#C5B358]/20 to-[#D4AF37]/20 backdrop-blur-sm rounded-xl p-4 border border-[#C5B358]/30">
            <div className="text-xs text-gray-300 mb-1">核心权益</div>
            <div className="text-sm text-white leading-relaxed">
              享有公司季度<span className="text-[#C5B358] font-bold">股权分红</span>，受邀进入公司战略决策委员会
            </div>
          </div>
        </div>
      </div>

      {/* 页面底部转换提示 */}
      <div className="px-4 py-8">
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-2xl p-6 border-2 border-[#C5B358]/30">
          <div className="text-center">
            <div className="text-sm text-gray-600 leading-relaxed">
              当前为用户身份？只需提升<span className="font-semibold text-[#A80000]">"人均标签深度"</span>与<span className="font-semibold text-[#A80000]">"周联络频次"</span>，即可跨越至<span className="font-semibold text-[#A80000]">"节点身份"</span>，从使用者转变为经营者，分享股权红利！
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
