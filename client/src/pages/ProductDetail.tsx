import { useState } from 'react';
import { useLocation, useParams } from 'wouter';
import { ChevronLeft, Check, Shield, Clock, Headphones, Zap, Users, BookOpen, Cpu, X, Smartphone, CreditCard } from 'lucide-react';

// ============================================================
// 商品数据库
// ============================================================

const PRODUCT_DB: Record<string, {
  id: string;
  category: string;
  categoryId: string;
  name: string;
  price: number;
  unit: string;
  tag: string;
  tagColor: string;
  image: string;
  subtitle: string;
  description: string;
  features: { icon: string; title: string; desc: string }[];
  highlights: string[];
  notice: string[];
}> = {
  'contacts-monthly': {
    id: 'contacts-monthly',
    category: '人脉管理软件',
    categoryId: 'contacts',
    name: '月度会员',
    price: 28,
    unit: '/月',
    tag: '',
    tagColor: '',
    image: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/product-contacts-4fLDcpWoC7ZCAT35ypvu8N.webp',
    subtitle: '灵活订阅，随时开始管理您的人脉',
    description: '月度会员让您以最低成本体验好友记人脉管理的全部功能。无限添加联系人，智能标签分类，让每一段关系都清晰可见。',
    features: [
      { icon: 'users', title: '无限联系人', desc: '不限数量添加联系人，支持详细信息记录' },
      { icon: 'tag', title: '智能标签', desc: '自定义标签体系，多维度分类管理' },
      { icon: 'chart', title: '关系图谱', desc: '可视化人脉关系网络，发现潜在价值' },
      { icon: 'export', title: '数据导出', desc: '支持导出联系人数据，随时备份' },
    ],
    highlights: ['无限联系人', '智能标签分类', '人脉关系图谱', '数据导出备份', '云端同步'],
    notice: ['购买后立即生效，有效期30天', '到期后自动停止，不会自动续费', '虚拟服务，购买后不支持退款'],
  },
  'contacts-quarterly': {
    id: 'contacts-quarterly',
    category: '人脉管理软件',
    categoryId: 'contacts',
    name: '季度会员',
    price: 68,
    unit: '/季',
    tag: '省¥16',
    tagColor: '#FF6B35',
    image: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/product-contacts-4fLDcpWoC7ZCAT35ypvu8N.webp',
    subtitle: '三个月深度使用，省¥16，性价比之选',
    description: '季度会员是最受欢迎的选择。相比月度会员节省16元，让您有充足时间深度使用人脉管理功能，建立完整的人脉体系。',
    features: [
      { icon: 'users', title: '无限联系人', desc: '不限数量添加联系人，支持详细信息记录' },
      { icon: 'tag', title: '智能标签', desc: '自定义标签体系，多维度分类管理' },
      { icon: 'chart', title: '关系图谱', desc: '可视化人脉关系网络，发现潜在价值' },
      { icon: 'ai', title: 'AI智能分析', desc: '智能分析人脉价值，给出关系维护建议' },
    ],
    highlights: ['无限联系人', '智能标签分类', '人脉关系图谱', 'AI智能分析', '数据导出备份', '云端同步'],
    notice: ['购买后立即生效，有效期90天', '到期后自动停止，不会自动续费', '虚拟服务，购买后不支持退款'],
  },
  'contacts-yearly': {
    id: 'contacts-yearly',
    category: '人脉管理软件',
    categoryId: 'contacts',
    name: '年度会员',
    price: 198,
    unit: '/年',
    tag: '最受欢迎',
    tagColor: '#D32F2F',
    image: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/product-contacts-4fLDcpWoC7ZCAT35ypvu8N.webp',
    subtitle: '全年无忧，相比月付省¥138',
    description: '年度会员是最受欢迎的选择，相比按月购买节省138元。全年使用权限加上专属客服支持，让您的人脉管理更加高效。',
    features: [
      { icon: 'users', title: '无限联系人', desc: '不限数量添加联系人，支持详细信息记录' },
      { icon: 'ai', title: 'AI智能分析', desc: '智能分析人脉价值，给出关系维护建议' },
      { icon: 'chart', title: '高级图谱', desc: '多层次人脉关系图谱，深度挖掘关系价值' },
      { icon: 'service', title: '专属客服', desc: '专属客服通道，优先响应您的问题' },
    ],
    highlights: ['无限联系人', '智能标签分类', '高级关系图谱', 'AI智能分析', '数据导出备份', '专属客服', '云端同步'],
    notice: ['购买后立即生效，有效期365天', '到期后自动停止，不会自动续费', '虚拟服务，购买后不支持退款'],
  },
  'contacts-lifetime': {
    id: 'contacts-lifetime',
    category: '人脉管理软件',
    categoryId: 'contacts',
    name: '终身会员',
    price: 498,
    unit: '一次',
    tag: '最划算',
    tagColor: '#7B1FA2',
    image: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/product-contacts-4fLDcpWoC7ZCAT35ypvu8N.webp',
    subtitle: '一次购买，永久使用，终身享受所有权益',
    description: '终身会员是最划算的选择。一次付费，永久使用全部功能，无需担心续费问题。随着产品持续升级，您的权益只会越来越多。',
    features: [
      { icon: 'forever', title: '永久使用', desc: '一次购买，永久享有全部功能权益' },
      { icon: 'ai', title: 'AI全功能', desc: '所有AI功能无限使用，持续享受新功能' },
      { icon: 'service', title: 'VIP客服', desc: 'VIP专属客服，最高优先级响应' },
      { icon: 'upgrade', title: '永久升级', desc: '产品所有升级功能永久免费享有' },
    ],
    highlights: ['永久使用权限', '无限联系人', '全部AI功能', '高级关系图谱', '数据导出备份', 'VIP专属客服', '新功能永久免费'],
    notice: ['购买后立即生效，永久有效', '虚拟服务，购买后不支持退款', '如遇产品重大升级，终身会员享有优先迁移权益'],
  },
  'ledger-basic': {
    id: 'ledger-basic',
    category: '共享账本定制',
    categoryId: 'ledger',
    name: '基础定制版',
    price: 299,
    unit: '一次性',
    tag: '入门首选',
    tagColor: '#2E7D32',
    image: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/product-ledger-NQcVJ5YtbWDun8Aoa4XYAe.webp',
    subtitle: '小团队首选，快速搭建共享记账体系',
    description: '基础定制版适合小型团队或家庭使用。支持1个共享账本，最多5人协同记账，基础样式定制，快速上手，轻松管理团队财务。',
    features: [
      { icon: 'book', title: '1个共享账本', desc: '专属共享账本，团队成员协同记录' },
      { icon: 'users', title: '最多5人', desc: '支持最多5名成员同时使用' },
      { icon: 'style', title: '基础样式', desc: '提供基础样式定制，匹配您的品牌' },
      { icon: 'support', title: '配置支持', desc: '专人协助完成初始配置' },
    ],
    highlights: ['1个共享账本', '最多5人协同', '基础样式定制', '专人配置支持', '数据云端同步'],
    notice: ['购买后1-3个工作日内工作人员联系您完成配置', '虚拟服务，配置完成后不支持退款', '如需升级版本，差价补足即可'],
  },
  'ledger-standard': {
    id: 'ledger-standard',
    category: '共享账本定制',
    categoryId: 'ledger',
    name: '标准定制版',
    price: 599,
    unit: '一次性',
    tag: '团队推荐',
    tagColor: '#1565C0',
    image: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/product-ledger-NQcVJ5YtbWDun8Aoa4XYAe.webp',
    subtitle: '中型团队标配，自定义标签灵活管理',
    description: '标准定制版适合中型团队使用。支持3个共享账本，最多20人协同，自定义标签体系，满足多场景财务管理需求。',
    features: [
      { icon: 'book', title: '3个共享账本', desc: '支持3个独立账本，分类管理不同业务' },
      { icon: 'users', title: '最多20人', desc: '支持最多20名成员同时协同使用' },
      { icon: 'tag', title: '自定义标签', desc: '完全自定义标签体系，精细化分类' },
      { icon: 'report', title: '报表导出', desc: '支持多维度报表生成和导出' },
    ],
    highlights: ['3个共享账本', '最多20人协同', '自定义标签体系', '多维度报表', '专人配置支持', '数据云端同步'],
    notice: ['购买后1-3个工作日内工作人员联系您完成配置', '虚拟服务，配置完成后不支持退款', '如需升级版本，差价补足即可'],
  },
  'ledger-premium': {
    id: 'ledger-premium',
    category: '共享账本定制',
    categoryId: 'ledger',
    name: '高级定制版',
    price: 1299,
    unit: '一次性',
    tag: '企业首选',
    tagColor: '#D32F2F',
    image: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/product-ledger-NQcVJ5YtbWDun8Aoa4XYAe.webp',
    subtitle: '无限账本无限人数，专属设计彰显品牌',
    description: '高级定制版适合大型团队或企业使用。无限账本、无限人数，专属视觉设计，完整的权限管理体系，让企业财务管理更专业。',
    features: [
      { icon: 'infinity', title: '无限账本', desc: '不限账本数量，满足企业多业务需求' },
      { icon: 'users', title: '无限人数', desc: '成员数量不受限制，支持大型团队' },
      { icon: 'design', title: '专属设计', desc: '专业设计师定制专属视觉风格' },
      { icon: 'permission', title: '权限管理', desc: '完整的角色权限体系，精细化管控' },
    ],
    highlights: ['无限账本', '无限人数', '专属视觉设计', '完整权限管理', 'AI智能分析', '专属客服', '数据云端同步'],
    notice: ['购买后1-3个工作日内工作人员联系您完成配置', '虚拟服务，配置完成后不支持退款', '专属设计需额外3-5个工作日'],
  },
  'ledger-enterprise': {
    id: 'ledger-enterprise',
    category: '共享账本定制',
    categoryId: 'ledger',
    name: '企业定制版',
    price: 3999,
    unit: '一次性',
    tag: '私有化部署',
    tagColor: '#4A148C',
    image: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/product-ledger-NQcVJ5YtbWDun8Aoa4XYAe.webp',
    subtitle: '私有化部署，数据完全自主，API深度集成',
    description: '企业定制版提供私有化部署方案，数据存储在您的服务器上，完全自主可控。支持API接入，与现有系统无缝集成，专属客服全程保障。',
    features: [
      { icon: 'server', title: '私有化部署', desc: '部署在您的服务器，数据完全自主' },
      { icon: 'api', title: 'API接入', desc: '开放API接口，与现有系统深度集成' },
      { icon: 'service', title: '专属客服', desc: '专属技术支持团队，7×12小时响应' },
      { icon: 'custom', title: '深度定制', desc: '功能按需定制，满足特殊业务需求' },
    ],
    highlights: ['私有化部署', '数据完全自主', 'API接口开放', '深度功能定制', '7×12专属客服', '无限账本无限人数'],
    notice: ['购买后专属顾问联系您，制定定制方案', '部署周期约5-10个工作日', '虚拟服务，签订服务协议后不支持退款'],
  },
  'compute-100': {
    id: 'compute-100',
    category: '算力购买',
    categoryId: 'compute',
    name: '100算力包',
    price: 9.9,
    unit: '一次性',
    tag: '体验装',
    tagColor: '#0277BD',
    image: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/product-compute-2bXPVJV4rgCSkDNJEdtAFQ.webp',
    subtitle: '低成本体验AI算力，感受智能分析魅力',
    description: '100算力包是体验AI功能的最佳入口。以最低成本体验智能人脉分析、自动记账分类、数据洞察等AI驱动功能，感受算力带来的效率提升。',
    features: [
      { icon: 'ai', title: 'AI智能分析', desc: '约100次AI分析调用，智能解读数据' },
      { icon: 'auto', title: '自动分类', desc: '自动识别和分类记账条目' },
      { icon: 'insight', title: '数据洞察', desc: '深度分析数据规律，提供决策参考' },
      { icon: 'forever', title: '永不过期', desc: '算力包永不过期，随时使用' },
    ],
    highlights: ['100次AI调用', '智能人脉分析', '自动记账分类', '数据洞察报告', '永不过期'],
    notice: ['购买后立即到账，永不过期', '算力消耗后需重新购买', '虚拟服务，购买后不支持退款'],
  },
  'compute-500': {
    id: 'compute-500',
    category: '算力购买',
    categoryId: 'compute',
    name: '500算力包',
    price: 39,
    unit: '一次性',
    tag: '省¥10.5',
    tagColor: '#FF6B35',
    image: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/product-compute-2bXPVJV4rgCSkDNJEdtAFQ.webp',
    subtitle: '500次AI调用，相比单买省¥10.5',
    description: '500算力包适合日常使用。相比单独购买节省10.5元，500次AI调用满足日常人脉分析和记账分类需求，是性价比最高的选择之一。',
    features: [
      { icon: 'ai', title: '500次AI调用', desc: '充足的AI调用次数，满足日常需求' },
      { icon: 'batch', title: '批量分析', desc: '支持批量处理，一次分析多条数据' },
      { icon: 'report', title: '深度报告', desc: '生成详细的分析报告，洞察数据价值' },
      { icon: 'forever', title: '永不过期', desc: '算力包永不过期，随时使用' },
    ],
    highlights: ['500次AI调用', '批量数据分析', '深度洞察报告', '智能人脉分析', '自动记账分类', '永不过期'],
    notice: ['购买后立即到账，永不过期', '算力消耗后需重新购买', '虚拟服务，购买后不支持退款'],
  },
  'compute-2000': {
    id: 'compute-2000',
    category: '算力购买',
    categoryId: 'compute',
    name: '2000算力包',
    price: 128,
    unit: '一次性',
    tag: '最划算',
    tagColor: '#D32F2F',
    image: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/product-compute-2bXPVJV4rgCSkDNJEdtAFQ.webp',
    subtitle: '2000次AI调用，最划算的算力选择',
    description: '2000算力包是最受欢迎的算力套餐。大量AI调用次数，满足高频使用需求，单次调用成本最低，是重度用户的最佳选择。',
    features: [
      { icon: 'ai', title: '2000次AI调用', desc: '海量AI调用，满足高频使用场景' },
      { icon: 'priority', title: '优先处理', desc: '大包用户享有优先处理队列' },
      { icon: 'report', title: '高级报告', desc: '解锁高级分析报告，更深层洞察' },
      { icon: 'forever', title: '永不过期', desc: '算力包永不过期，随时使用' },
    ],
    highlights: ['2000次AI调用', '优先处理队列', '高级分析报告', '批量数据处理', '智能人脉分析', '永不过期'],
    notice: ['购买后立即到账，永不过期', '算力消耗后需重新购买', '虚拟服务，购买后不支持退款'],
  },
  'compute-5000': {
    id: 'compute-5000',
    category: '算力购买',
    categoryId: 'compute',
    name: '5000算力包',
    price: 299,
    unit: '一次性',
    tag: '企业级',
    tagColor: '#4A148C',
    image: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/product-compute-2bXPVJV4rgCSkDNJEdtAFQ.webp',
    subtitle: '5000次AI调用，企业级算力储备',
    description: '5000算力包专为企业级用户设计。超大算力储备，满足团队多人使用，享有最高优先级处理和专属技术支持。',
    features: [
      { icon: 'ai', title: '5000次AI调用', desc: '企业级算力，支持团队多人共用' },
      { icon: 'vip', title: '最高优先级', desc: '享有最高优先级处理，响应更快' },
      { icon: 'api', title: 'API调用', desc: '支持通过API调用，集成到自有系统' },
      { icon: 'forever', title: '永不过期', desc: '算力包永不过期，随时使用' },
    ],
    highlights: ['5000次AI调用', '最高优先级处理', 'API接口调用', '团队共享算力', '专属技术支持', '永不过期'],
    notice: ['购买后立即到账，永不过期', '算力消耗后需重新购买', '虚拟服务，购买后不支持退款'],
  },
};

// ============================================================
// 支付弹窗组件
// ============================================================
function PaymentModal({
  product,
  onClose,
}: {
  product: typeof PRODUCT_DB[string];
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<'alipay' | 'wechat'>('alipay');
  const [confirming, setConfirming] = useState(false);

  const handlePay = () => {
    setConfirming(true);
    // TODO: 接入真实支付接口
    setTimeout(() => {
      setConfirming(false);
      alert(`支付功能接入中，请联系客服完成购买\n商品：${product.name}\n金额：¥${product.price}`);
      onClose();
    }, 800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={onClose}>
      <div
        className="w-full bg-white rounded-t-2xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 弹窗头部 */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100">
          <div>
            <p className="text-sm text-gray-500">{product.name}</p>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold text-[#D32F2F]">¥{product.price % 1 === 0 ? product.price : product.price.toFixed(1)}</span>
              <span className="text-sm text-gray-400">{product.unit}</span>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100">
            <X size={16} className="text-gray-500" />
          </button>
        </div>

        {/* 支付方式选择 */}
        <div className="px-5 py-4">
          <p className="text-sm font-medium text-gray-700 mb-3">选择支付方式</p>
          <div className="space-y-3">
            {/* 支付宝 */}
            <button
              onClick={() => setSelected('alipay')}
              className={`w-full flex items-center gap-3 p-3.5 rounded-xl border-2 transition-colors ${
                selected === 'alipay' ? 'border-[#1677FF] bg-blue-50' : 'border-gray-200 bg-white'
              }`}
            >
              <div className="w-9 h-9 bg-[#1677FF] rounded-lg flex items-center justify-center flex-shrink-0">
                <span className="text-white font-bold text-sm">支</span>
              </div>
              <div className="flex-1 text-left">
                <p className="text-sm font-medium text-gray-900">支付宝</p>
                <p className="text-xs text-gray-400">推荐使用支付宝支付</p>
              </div>
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                selected === 'alipay' ? 'border-[#1677FF] bg-[#1677FF]' : 'border-gray-300'
              }`}>
                {selected === 'alipay' && <Check size={12} className="text-white" />}
              </div>
            </button>

            {/* 微信支付 */}
            <button
              onClick={() => setSelected('wechat')}
              className={`w-full flex items-center gap-3 p-3.5 rounded-xl border-2 transition-colors ${
                selected === 'wechat' ? 'border-[#07C160] bg-green-50' : 'border-gray-200 bg-white'
              }`}
            >
              <div className="w-9 h-9 bg-[#07C160] rounded-lg flex items-center justify-center flex-shrink-0">
                <span className="text-white font-bold text-sm">微</span>
              </div>
              <div className="flex-1 text-left">
                <p className="text-sm font-medium text-gray-900">微信支付</p>
                <p className="text-xs text-gray-400">使用微信扫码或H5支付</p>
              </div>
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                selected === 'wechat' ? 'border-[#07C160] bg-[#07C160]' : 'border-gray-300'
              }`}>
                {selected === 'wechat' && <Check size={12} className="text-white" />}
              </div>
            </button>
          </div>
        </div>

        {/* 安全提示 */}
        <div className="mx-5 mb-4 flex items-center gap-2 text-xs text-gray-400">
          <Shield size={12} />
          <span>支付安全由支付宝/微信保障，信息加密传输</span>
        </div>

        {/* 确认支付按钮 */}
        <div className="px-5 pb-8">
          <button
            onClick={handlePay}
            disabled={confirming}
            className="w-full py-4 bg-[#D32F2F] text-white font-semibold text-base rounded-xl active:opacity-90 disabled:opacity-60 transition-opacity"
          >
            {confirming ? '处理中...' : `确认支付 ¥${product.price % 1 === 0 ? product.price : product.price.toFixed(1)}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 主组件
// ============================================================
export default function ProductDetail() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const [showPayment, setShowPayment] = useState(false);

  const product = PRODUCT_DB[params.id || ''];

  if (!product) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-gray-500 mb-4">商品不存在</p>
          <button
            onClick={() => setLocation('/products')}
            className="text-[#D32F2F] font-medium"
          >
            返回商品列表
          </button>
        </div>
      </div>
    );
  }

  const categoryIcon = product.categoryId === 'contacts' ? Users :
    product.categoryId === 'ledger' ? BookOpen : Cpu;
  const CategoryIcon = categoryIcon;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <div className="bg-[#D32F2F] text-white">
        <div className="flex items-center p-4">
          <button onClick={() => setLocation('/products')} className="mr-3">
            <ChevronLeft size={24} />
          </button>
          <h1 className="text-lg font-semibold">商品详情</h1>
        </div>
      </div>

      {/* 商品主图 */}
      <div className="relative h-52 overflow-hidden">
        <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-5">
          <div className="flex items-center gap-2 mb-1">
            <CategoryIcon size={16} className="text-white/80" />
            <span className="text-white/80 text-xs">{product.category}</span>
          </div>
          <h2 className="text-white text-xl font-bold">{product.name}</h2>
          <p className="text-white/80 text-sm mt-0.5">{product.subtitle}</p>
        </div>
      </div>

      {/* 价格区域 */}
      <div className="bg-white mx-4 -mt-3 relative z-10 rounded-xl shadow-sm p-4 flex items-center justify-between">
        <div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-bold text-[#D32F2F]">
              ¥{product.price % 1 === 0 ? product.price : product.price.toFixed(1)}
            </span>
            <span className="text-sm text-gray-400">{product.unit}</span>
          </div>
          {product.tag && (
            <span
              className="inline-block mt-1 text-xs font-medium px-2 py-0.5 rounded-full text-white"
              style={{ backgroundColor: product.tagColor }}
            >
              {product.tag}
            </span>
          )}
        </div>
        <button
          onClick={() => setShowPayment(true)}
          className="bg-[#D32F2F] text-white font-semibold px-6 py-3 rounded-xl text-sm active:opacity-90"
        >
          立即购买
        </button>
      </div>

      {/* 商品描述 */}
      <div className="bg-white mx-4 mt-3 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-2">商品介绍</h3>
        <p className="text-sm text-gray-600 leading-relaxed">{product.description}</p>
      </div>

      {/* 核心权益 */}
      <div className="bg-white mx-4 mt-3 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">核心权益</h3>
        <div className="grid grid-cols-2 gap-3">
          {product.features.map((feature, idx) => (
            <div key={idx} className="bg-gray-50 rounded-lg p-3">
              <div className="w-8 h-8 bg-[#D32F2F]/10 rounded-lg flex items-center justify-center mb-2">
                <Zap size={16} className="text-[#D32F2F]" />
              </div>
              <p className="text-xs font-semibold text-gray-900 mb-0.5">{feature.title}</p>
              <p className="text-xs text-gray-500 leading-relaxed">{feature.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 包含内容清单 */}
      <div className="bg-white mx-4 mt-3 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">包含内容</h3>
        <div className="space-y-2">
          {product.highlights.map((item, idx) => (
            <div key={idx} className="flex items-center gap-2.5">
              <div className="w-5 h-5 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                <Check size={12} className="text-green-600" />
              </div>
              <span className="text-sm text-gray-700">{item}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 服务保障 */}
      <div className="bg-white mx-4 mt-3 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">服务保障</h3>
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center">
            <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center mx-auto mb-1.5">
              <Shield size={18} className="text-blue-600" />
            </div>
            <p className="text-xs text-gray-600">安全支付</p>
          </div>
          <div className="text-center">
            <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center mx-auto mb-1.5">
              <Clock size={18} className="text-green-600" />
            </div>
            <p className="text-xs text-gray-600">即时生效</p>
          </div>
          <div className="text-center">
            <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center mx-auto mb-1.5">
              <Headphones size={18} className="text-orange-600" />
            </div>
            <p className="text-xs text-gray-600">客服支持</p>
          </div>
        </div>
      </div>

      {/* 购买须知 */}
      <div className="bg-white mx-4 mt-3 rounded-xl p-4 mb-28">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">购买须知</h3>
        <div className="space-y-2">
          {product.notice.map((item, idx) => (
            <p key={idx} className="text-xs text-gray-500 leading-relaxed">• {item}</p>
          ))}
          <p className="text-xs text-gray-500 leading-relaxed">• 如有疑问请联系客服：service@jiangyuchen.cn</p>
        </div>
      </div>

      {/* 底部固定购买栏 */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-4 py-3 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <div className="flex items-baseline gap-1">
              <span className="text-xl font-bold text-[#D32F2F]">
                ¥{product.price % 1 === 0 ? product.price : product.price.toFixed(1)}
              </span>
              <span className="text-xs text-gray-400">{product.unit}</span>
            </div>
            {product.tag && (
              <span className="text-xs text-gray-400">{product.tag}</span>
            )}
          </div>
          <button
            onClick={() => setShowPayment(true)}
            className="flex-1 py-3.5 bg-[#D32F2F] text-white font-semibold text-base rounded-xl active:opacity-90"
          >
            立即购买
          </button>
        </div>
      </div>

      {/* 支付弹窗 */}
      {showPayment && (
        <PaymentModal product={product} onClose={() => setShowPayment(false)} />
      )}
    </div>
  );
}
