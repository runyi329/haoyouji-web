/**
 * 商品详情页
 * 路由：/products/:id
 * 遵循建站规则第23章：主图轮播区 + 价格区 + 详情区 + 吸底购买栏
 */
import { useState } from 'react';
import { useLocation, useParams } from 'wouter';
import { useAuth } from '@/_core/hooks/useAuth';
import { getLoginUrl } from '@/const';
import {
  ChevronLeft, Check, Shield, Clock, Headphones, Zap, Users, BookOpen,
  Cpu, X, CreditCard, Star, ChevronRight, MessageCircle, Phone,
} from 'lucide-react';
import BottomNav from '@/components/BottomNav';

// ============================================================
// 图片资源常量
// ============================================================
const IMG = {
  compute:   'https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/product-compute-pack-WtVSRTePjVQ8okgiDZTLxC.webp',
  contacts:  'https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/product-contacts-crm-GyKiajFycpxw8PBo8pfRUS.webp',
  ledger:    'https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/product-ledger-custom-RA4QS7aUex96Wu6jMDhoST.webp',
  homepage:  'https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/product-homepage-custom-6zUitHprMjFVkZZFYrSuQD.webp',
  enterprise:'https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/product-enterprise-suite-QVQP6uuGzUaJyibqEgyvoq.webp',
  computeUsecase:   'https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/detail-compute-usecase-2MHMaLUV8UNnZjJed5TuSf.webp',
  contactsFeatures: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/detail-contacts-features-3uapVynEydfJWPJyJzKTes.webp',
  ledgerFeatures:   'https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/detail-ledger-features-Apx7sSQvj2EBLttPNyu6bJ.webp',
  serviceGuarantee: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/detail-service-guarantee-6UTuHcizg8rLktbZ96EGed.webp',
  deliveryProcess:  'https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/detail-delivery-process-SRzDnodowNftinKk3mvgKe.webp',
  homepageShowcase: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/detail-homepage-showcase-4wXDTwydwrZSTrX773ZDcC.webp',
};

// ============================================================
// 产品数据接口
// ============================================================
interface ProductData {
  id: string;
  category: string;
  categoryId: string;
  name: string;
  fullName: string;
  price: number;
  originalPrice?: number;
  unit: string;
  tag: string;
  tagColor: string;
  images: string[];
  detailImages: string[];
  subtitle: string;
  description: string;
  whatYouGet: string[];
  features: { icon: string; title: string; desc: string }[];
  highlights: string[];
  useCases: string[];
  notice: string[];
}

// ============================================================
// 产品数据库（10款产品）
// ============================================================
const PRODUCT_DB: Record<string, ProductData> = {
  'compute-99': {
    id: 'compute-99',
    category: '算力包',
    categoryId: 'compute',
    name: '体验算力包',
    fullName: '润仪算力 · 体验装（100点）',
    price: 9.9,
    unit: '一次性',
    tag: '入门体验',
    tagColor: '#0277BD',
    images: [IMG.compute],
    detailImages: [IMG.computeUsecase, IMG.serviceGuarantee],
    subtitle: '9.9元开启AI算力体验，永不过期',
    description: '润仪算力体验包是您进入AI智能世界的第一步。购买后立即获得100点算力，可用于智能人脉分析、自动记账分类、数据洞察报告、AI助手对话等全部AI功能。算力永不过期，用完再买，无任何隐藏费用。适合想低成本体验AI能力的个人用户。我们的AI算力由国内顶级算力中心提供支撑，稳定可靠，响应迅速。每一点算力都经过精密计量，确保您的每一分钱都花在刀刃上。',
    whatYouGet: [
      '100点AI算力（永不过期）',
      '智能人脉分析功能使用权',
      '自动记账分类功能使用权',
      'AI助手对话功能使用权',
      '数据洞察报告生成（基础版）',
    ],
    features: [
      { icon: 'cpu', title: '100点算力', desc: '可驱动约100次AI智能分析调用' },
      { icon: 'forever', title: '永不过期', desc: '算力不设有效期，随时使用' },
      { icon: 'instant', title: '即时到账', desc: '支付成功后算力立即到账' },
      { icon: 'safe', title: '安全可靠', desc: '支付宝担保交易，资金安全' },
    ],
    highlights: ['100点AI算力', '永不过期', '即时到账', '全功能体验', '支付宝安全支付'],
    useCases: [
      '首次体验AI人脉分析功能',
      '试用自动记账分类效果',
      '偶尔使用AI助手处理问题',
      '低频使用场景的个人用户',
    ],
    notice: [
      '购买后算力立即到账，永不过期',
      '算力消耗后需重新购买，不自动续费',
      '虚拟商品，购买后不支持退款',
      '如有疑问请联系客服：service@jiangyuchen.cn',
    ],
  },

  'compute-500': {
    id: 'compute-500',
    category: '算力包',
    categoryId: 'compute',
    name: '基础算力包',
    fullName: '润仪算力 · 基础版（500点）',
    price: 39,
    originalPrice: 49.5,
    unit: '一次性',
    tag: '省¥10.5',
    tagColor: '#FF6B35',
    images: [IMG.compute],
    detailImages: [IMG.computeUsecase, IMG.serviceGuarantee],
    subtitle: '500点算力，日常使用性价比之选',
    description: '润仪算力基础包适合日常频繁使用AI功能的个人用户。500点算力相比体验包单价降低21%，可支撑约500次AI调用，满足日常人脉管理、账本分析、AI对话等需求。购买后立即到账，永不过期，是个人用户最受欢迎的入门套餐。我们的AI系统基于大语言模型和专有知识库，能够精准理解您的人脉关系和财务数据，给出专业的分析和建议。',
    whatYouGet: [
      '500点AI算力（永不过期）',
      '全部AI功能无限制使用权',
      '智能人脉分析（高级版）',
      '自动记账分类（含自定义规则）',
      '数据洞察报告（完整版）',
      'AI助手多轮对话',
    ],
    features: [
      { icon: 'cpu', title: '500点算力', desc: '支撑约500次AI智能分析调用' },
      { icon: 'discount', title: '单价更低', desc: '相比体验包单次成本降低21%' },
      { icon: 'forever', title: '永不过期', desc: '算力不设有效期，随时使用' },
      { icon: 'full', title: '全功能解锁', desc: '解锁全部AI高级功能' },
    ],
    highlights: ['500点AI算力', '永不过期', '全功能解锁', '单价更优惠', '即时到账'],
    useCases: [
      '每天使用AI分析人脉关系的个人',
      '需要AI辅助记账分类的用户',
      '经常使用AI助手处理工作的人',
      '中频使用场景的个人用户',
    ],
    notice: [
      '购买后算力立即到账，永不过期',
      '算力消耗后需重新购买，不自动续费',
      '虚拟商品，购买后不支持退款',
      '如有疑问请联系客服：service@jiangyuchen.cn',
    ],
  },

  'compute-2000': {
    id: 'compute-2000',
    category: '算力包',
    categoryId: 'compute',
    name: '标准算力包',
    fullName: '润仪算力 · 标准版（2000点）',
    price: 128,
    originalPrice: 198,
    unit: '一次性',
    tag: '最划算',
    tagColor: '#D32F2F',
    images: [IMG.compute],
    detailImages: [IMG.computeUsecase, IMG.serviceGuarantee],
    subtitle: '2000点算力，重度用户首选，省¥70',
    description: '润仪算力标准包是最受欢迎的算力套餐。2000点算力相比单次购买节省70元，单次调用成本最低，是重度AI用户的最佳选择。支持团队内部分享使用，适合需要大量AI分析的个人或小团队。购买后立即到账，永不过期。标准包用户还享有优先响应队列，AI处理速度更快，让您的工作效率大幅提升。',
    whatYouGet: [
      '2000点AI算力（永不过期）',
      '全部AI功能无限制使用权',
      '智能人脉分析（专业版）',
      '自动记账分类（含批量处理）',
      '数据洞察报告（高级版）',
      'AI助手多轮对话（优先响应）',
      '月度使用报告',
    ],
    features: [
      { icon: 'cpu', title: '2000点算力', desc: '支撑约2000次AI智能分析调用' },
      { icon: 'discount', title: '省¥70', desc: '相比单次购买节省70元' },
      { icon: 'priority', title: '优先响应', desc: 'AI处理优先级高于基础套餐' },
      { icon: 'forever', title: '永不过期', desc: '算力不设有效期，随时使用' },
    ],
    highlights: ['2000点AI算力', '永不过期', '优先响应', '省¥70', '月度报告'],
    useCases: [
      '每天高频使用AI功能的重度用户',
      '需要批量处理数据的个人用户',
      '小团队共享算力使用',
      '对AI响应速度有要求的用户',
    ],
    notice: [
      '购买后算力立即到账，永不过期',
      '算力消耗后需重新购买，不自动续费',
      '虚拟商品，购买后不支持退款',
      '如有疑问请联系客服：service@jiangyuchen.cn',
    ],
  },

  'compute-10000': {
    id: 'compute-10000',
    category: '算力包',
    categoryId: 'compute',
    name: '企业算力包',
    fullName: '润仪算力 · 企业版（10000点）',
    price: 499,
    originalPrice: 990,
    unit: '一次性',
    tag: '企业首选',
    tagColor: '#4A148C',
    images: [IMG.compute],
    detailImages: [IMG.computeUsecase, IMG.serviceGuarantee],
    subtitle: '10000点算力，企业级储备，省¥491',
    description: '润仪算力企业包专为企业级用户和大型团队设计。10000点算力相比单次购买节省491元，支持多人共享使用，享有最高优先级处理和专属技术支持。适合需要大规模AI分析的企业用户，可用于批量人脉管理、财务数据分析、定制化AI应用开发等场景。企业包用户还可获得API接口调用权限，将AI能力无缝集成到您的现有系统中。',
    whatYouGet: [
      '10000点AI算力（永不过期）',
      '全部AI功能企业级使用权',
      '多人共享算力池',
      '最高优先级处理',
      '专属技术支持（工作日响应）',
      'API接口调用权限',
      '季度使用分析报告',
      '专属客服通道',
    ],
    features: [
      { icon: 'cpu', title: '10000点算力', desc: '企业级算力，支持多人共享' },
      { icon: 'discount', title: '省¥491', desc: '相比单次购买节省近50%' },
      { icon: 'api', title: 'API权限', desc: '支持API接口调用，集成自有系统' },
      { icon: 'support', title: '专属支持', desc: '专属技术支持和客服通道' },
    ],
    highlights: ['10000点AI算力', '永不过期', 'API接口权限', '多人共享', '专属技术支持', '省¥491'],
    useCases: [
      '需要大规模AI分析的企业团队',
      '需要API接口集成的技术团队',
      '多部门共享AI算力的企业',
      '需要专属技术支持的重要客户',
    ],
    notice: [
      '购买后算力立即到账，永不过期',
      '算力消耗后需重新购买，不自动续费',
      '虚拟商品，购买后不支持退款',
      'API使用需提前申请开通',
      '如有疑问请联系客服：service@jiangyuchen.cn',
    ],
  },

  'contacts-yearly': {
    id: 'contacts-yearly',
    category: '人脉管理软件',
    categoryId: 'contacts',
    name: '人脉管理年度版',
    fullName: '好友记人脉管理 · 年度会员',
    price: 198,
    originalPrice: 336,
    unit: '/年',
    tag: '最受欢迎',
    tagColor: '#D32F2F',
    images: [IMG.contacts],
    detailImages: [IMG.contactsFeatures, IMG.serviceGuarantee],
    subtitle: '全年无忧，相比月付省¥138，人脉管理专业工具',
    description: '好友记人脉管理年度会员是最受欢迎的选择。专业的个人CRM系统，帮助您系统化管理所有人脉关系。无限添加联系人，智能标签分类，可视化人脉图谱，AI智能分析关系价值，让每一段关系都清晰可见、持续产生价值。相比按月购买节省138元，全年使用加上专属客服支持，是个人和商务人士的最佳选择。\n\n好友记人脉管理系统由润仪算力团队自主研发，专注于中国商务人士的人脉管理需求。系统支持微信好友导入、名片扫描识别、关系强度评估等功能，让您的人脉管理更加高效、科学。',
    whatYouGet: [
      '365天人脉管理软件使用权',
      '无限联系人添加（不限数量）',
      '智能标签分类系统',
      '可视化人脉关系图谱',
      'AI智能分析关系价值',
      '关系互动时间轴记录',
      '数据导出与备份',
      '云端同步（多设备）',
      '专属客服支持',
    ],
    features: [
      { icon: 'users', title: '无限联系人', desc: '不限数量添加，支持详细信息记录' },
      { icon: 'tag', title: '智能标签', desc: '自定义标签体系，多维度分类管理' },
      { icon: 'graph', title: '关系图谱', desc: '可视化人脉网络，发现潜在价值' },
      { icon: 'ai', title: 'AI分析', desc: '智能分析关系价值，给出维护建议' },
    ],
    highlights: ['无限联系人', '智能标签分类', '人脉关系图谱', 'AI智能分析', '数据导出备份', '云端同步', '专属客服'],
    useCases: [
      '销售人员管理客户关系',
      '创业者维护投资人和合作伙伴',
      '职场人士管理职业人脉',
      '社交达人系统化管理朋友圈',
    ],
    notice: [
      '购买后立即生效，有效期365天',
      '到期后自动停止，不会自动续费',
      '虚拟服务，购买后不支持退款',
      '如有疑问请联系客服：service@jiangyuchen.cn',
    ],
  },

  'contacts-lifetime': {
    id: 'contacts-lifetime',
    category: '人脉管理软件',
    categoryId: 'contacts',
    name: '人脉管理终身版',
    fullName: '好友记人脉管理 · 终身会员',
    price: 498,
    originalPrice: 792,
    unit: '一次性',
    tag: '最划算',
    tagColor: '#7B1FA2',
    images: [IMG.contacts],
    detailImages: [IMG.contactsFeatures, IMG.serviceGuarantee],
    subtitle: '一次购买，终身使用，永久享有所有功能',
    description: '好友记人脉管理终身会员是最超值的选择。一次购买，终身使用，永久享有所有功能更新。无需担心续费问题，让您专注于人脉管理本身。终身会员还享有优先体验新功能、专属VIP客服通道等特权。适合长期重视人脉管理的商务人士和创业者。\n\n我们承诺：只要润仪算力平台持续运营，终身会员的权益永久有效。我们会持续迭代产品功能，终身会员用户将永久免费享有所有新功能。',
    whatYouGet: [
      '终身人脉管理软件使用权',
      '无限联系人添加（不限数量）',
      '智能标签分类系统（高级版）',
      '可视化人脉关系图谱（3D版）',
      'AI智能分析关系价值（深度版）',
      '关系互动时间轴记录',
      '数据导出与备份（无限次）',
      '云端同步（多设备无限制）',
      'VIP专属客服通道',
      '新功能优先体验权',
      '永久免费功能升级',
    ],
    features: [
      { icon: 'forever', title: '终身使用', desc: '一次购买，永久有效，无需续费' },
      { icon: 'vip', title: 'VIP特权', desc: '专属VIP客服，优先体验新功能' },
      { icon: 'upgrade', title: '永久升级', desc: '所有功能更新永久免费享有' },
      { icon: 'ai', title: 'AI深度分析', desc: '深度AI分析，挖掘人脉潜在价值' },
    ],
    highlights: ['终身使用权', 'VIP专属客服', '永久功能升级', '无限联系人', '3D关系图谱', '深度AI分析'],
    useCases: [
      '长期重视人脉建设的商务人士',
      '需要系统化管理大量关系的创业者',
      '销售总监、BD经理等职业人士',
      '希望一次投入长期受益的用户',
    ],
    notice: [
      '购买后立即生效，永久有效',
      '虚拟服务，购买后不支持退款',
      '如有疑问请联系客服：service@jiangyuchen.cn',
    ],
  },

  'ledger-basic': {
    id: 'ledger-basic',
    category: '定制账本',
    categoryId: 'ledger',
    name: '定制账本基础版',
    fullName: '好友记定制账本 · 基础定制版',
    price: 299,
    unit: '一次性',
    tag: '入门首选',
    tagColor: '#2E7D32',
    images: [IMG.ledger],
    detailImages: [IMG.ledgerFeatures, IMG.deliveryProcess, IMG.serviceGuarantee],
    subtitle: '专属定制账本，3-5天交付，满足个性化记账需求',
    description: '好友记定制账本基础版，为您量身定制一款专属账本。我们根据您的业务场景和记账需求，设计专属的账本类型、字段结构和分类体系。支持共享账本（多人协作）、自定义字段、AI自动分类等功能。适合个人创业者、小微商家、家庭理财等场景。\n\n购买后1个工作日内，我们的专业顾问将主动联系您，深入了解您的记账需求，为您量身设计最适合的账本结构。3-5个工作日内完成开发和交付，让您快速拥有一款真正属于自己的智能账本。',
    whatYouGet: [
      '1款专属定制账本',
      '自定义账本名称和图标',
      '最多10个自定义字段',
      '自定义分类体系（最多3级）',
      '共享账本功能（最多3人）',
      'AI自动分类（基础版）',
      '数据导出（Excel格式）',
      '3个月免费维护',
    ],
    features: [
      { icon: 'custom', title: '专属定制', desc: '根据您的需求量身设计账本结构' },
      { icon: 'share', title: '多人共享', desc: '最多3人共享同一账本，实时同步' },
      { icon: 'ai', title: 'AI分类', desc: 'AI自动识别并分类记账条目' },
      { icon: 'export', title: '数据导出', desc: '支持导出Excel，方便对账分析' },
    ],
    highlights: ['1款专属账本', '自定义字段', '3人共享', 'AI自动分类', 'Excel导出', '3个月维护'],
    useCases: [
      '小微商家的日常收支管理',
      '家庭共同理财记账',
      '个人创业项目的资金追踪',
      '社群/团队的费用分摊管理',
    ],
    notice: [
      '购买后1个工作日内，工作人员将联系您确认需求',
      '3-5个工作日完成定制开发和交付',
      '包含3个月免费维护（功能调整和Bug修复）',
      '定制服务，交付后不支持退款',
      '如有疑问请联系客服：service@jiangyuchen.cn',
    ],
  },

  'ledger-standard': {
    id: 'ledger-standard',
    category: '定制账本',
    categoryId: 'ledger',
    name: '定制账本标准版',
    fullName: '好友记定制账本 · 标准定制版',
    price: 799,
    originalPrice: 1299,
    unit: '一次性',
    tag: '团队推荐',
    tagColor: '#1565C0',
    images: [IMG.ledger],
    detailImages: [IMG.ledgerFeatures, IMG.deliveryProcess, IMG.serviceGuarantee],
    subtitle: '多场景账本定制，团队协作，AI深度分析',
    description: '好友记定制账本标准版，为团队和中小企业提供专业的账本定制服务。支持多款账本同时定制，最多10人共享协作，配备AI深度分析和自动报表功能。适合门店管理、项目收支、合伙人账本、教育培训等多种业务场景。\n\n我们提供从需求分析到上线运营的全程服务，确保账本真正解决您的业务痛点。专业的产品经理将与您深度沟通，理解您的业务逻辑，设计出最贴合实际需求的账本体系。',
    whatYouGet: [
      '3款专属定制账本',
      '自定义账本名称、图标和主题色',
      '每款账本最多20个自定义字段',
      '自定义分类体系（最多5级）',
      '共享账本功能（最多10人）',
      'AI深度分析（含趋势预测）',
      '自动生成月度/季度报表',
      '数据导出（Excel/PDF格式）',
      '6个月免费维护',
      '专属客服支持',
    ],
    features: [
      { icon: 'multi', title: '3款账本', desc: '同时定制3款不同场景的专属账本' },
      { icon: 'team', title: '10人协作', desc: '最多10人共享，权限分级管理' },
      { icon: 'report', title: '自动报表', desc: '月度/季度报表自动生成，一键分享' },
      { icon: 'ai', title: 'AI深度分析', desc: '趋势预测、异常检测、智能建议' },
    ],
    highlights: ['3款专属账本', '10人协作', '自动报表', 'AI深度分析', 'PDF导出', '6个月维护'],
    useCases: [
      '连锁门店的多店收支管理',
      '合伙人创业的资金透明化',
      '教育培训机构的学员缴费管理',
      '项目制团队的费用追踪',
    ],
    notice: [
      '购买后1个工作日内，工作人员将联系您确认需求',
      '5-7个工作日完成定制开发和交付',
      '包含6个月免费维护（功能调整和Bug修复）',
      '定制服务，交付后不支持退款',
      '如有疑问请联系客服：service@jiangyuchen.cn',
    ],
  },

  'homepage-basic': {
    id: 'homepage-basic',
    category: '主页定制',
    categoryId: 'homepage',
    name: '商家主页基础版',
    fullName: '润仪算力 · 商家主页定制（基础版）',
    price: 1299,
    unit: '一次性',
    tag: '快速交付',
    tagColor: '#2E7D32',
    images: [IMG.homepage],
    detailImages: [IMG.homepageShowcase, IMG.deliveryProcess, IMG.serviceGuarantee],
    subtitle: 'AI全程参与，7天交付，含商城/预约/会员功能',
    description: '润仪算力商家主页定制基础版，为您打造一个专属的移动端商家主页。基于脉动共享商盟架构，内置商城、预约、会员管理三大核心功能，AI全程参与设计和开发，确保7天内完成交付。\n\n您的主页将拥有专属域名、品牌视觉、商品展示、在线支付等完整功能，让您的生意在移动端全面数字化。我们的AI设计系统会根据您的行业特点和品牌调性，自动生成最适合的视觉方案，大幅缩短设计周期，降低定制成本。',
    whatYouGet: [
      '1个专属商家主页（移动端H5）',
      '品牌视觉设计（Logo+配色+字体）',
      '商品展示与在线购买功能',
      '预约服务功能',
      '会员管理系统（基础版）',
      '在线支付接入（支付宝）',
      '人脉管理模块',
      '钱脉账本模块',
      '1年免费托管',
      '3个月免费维护',
    ],
    features: [
      { icon: 'shop', title: '在线商城', desc: '商品展示、购物车、在线支付一体化' },
      { icon: 'book', title: '预约系统', desc: '在线预约服务，自动提醒，减少爽约' },
      { icon: 'member', title: '会员管理', desc: '会员积分、等级、专属优惠管理' },
      { icon: 'ai', title: 'AI辅助', desc: 'AI参与设计和内容创作，提升品质' },
    ],
    highlights: ['专属移动端主页', '在线商城', '预约系统', '会员管理', '支付宝接入', '1年免费托管'],
    useCases: [
      '餐饮门店的外卖和预约服务',
      '美容美发的预约和会员管理',
      '健身房的课程预约和会员卡',
      '教育培训的课程销售和管理',
    ],
    notice: [
      '购买后1个工作日内，工作人员将联系您确认需求和品牌资料',
      '7个工作日内完成设计和开发，交付可用版本',
      '包含3个月免费维护（内容更新和功能调整）',
      '定制服务，交付后不支持退款',
      '如有疑问请联系客服：service@jiangyuchen.cn',
    ],
  },

  'enterprise-full': {
    id: 'enterprise-full',
    category: '企业套餐',
    categoryId: 'enterprise',
    name: '企业数字化全套',
    fullName: '润仪算力 · 企业数字化全套解决方案',
    price: 39999,
    unit: '一次性',
    tag: '旗舰定制',
    tagColor: '#B8860B',
    images: [IMG.enterprise],
    detailImages: [IMG.homepageShowcase, IMG.ledgerFeatures, IMG.contactsFeatures, IMG.deliveryProcess, IMG.serviceGuarantee],
    subtitle: '企业级全栈定制：主页+CRM+账本+算力，一站式数字化',
    description: '润仪算力企业数字化全套解决方案，是我们最高端的定制服务。为企业提供从品牌建设、客户管理、财务管理到AI赋能的完整数字化基础设施。包含：企业官网+商城（三端适配）、定制CRM人脉管理系统、多场景定制账本体系、企业级AI算力包（50000点）、专属运营支持团队。\n\n我们的企业数字化团队拥有丰富的行业经验，服务过餐饮、零售、教育、美业等多个行业的中型企业。我们不只是提供软件，更是您的数字化转型伙伴，全程陪伴您完成从传统经营到数字化运营的转变。',
    whatYouGet: [
      '企业官网+商城（H5+PC+小程序三端）',
      '定制CRM人脉管理系统（不限用户数）',
      '多场景定制账本体系（最多10款）',
      '50000点企业AI算力包（永不过期）',
      '完整VI品牌视觉设计系统',
      '多种支付方式接入（支付宝+微信）',
      '数据中台和分析仪表盘',
      '员工权限管理系统',
      '专属项目经理+运营顾问',
      '3年免费托管',
      '2年免费维护和迭代',
      '季度运营复盘和优化建议',
    ],
    features: [
      { icon: 'enterprise', title: '全栈定制', desc: '主页+CRM+账本+算力，一站式解决' },
      { icon: 'team', title: '不限用户', desc: 'CRM和账本系统支持不限数量用户' },
      { icon: 'ai', title: '50000点算力', desc: '企业级AI算力，驱动全业务智能化' },
      { icon: 'support', title: '2年维护', desc: '专属团队2年持续维护和迭代升级' },
    ],
    highlights: ['三端全栈定制', '不限用户CRM', '10款定制账本', '50000点算力', '专属运营团队', '2年维护迭代'],
    useCases: [
      '需要全面数字化转型的中型企业',
      '连锁品牌的统一数字化管理平台',
      '需要定制化CRM+财务系统的企业',
      '希望AI全面赋能业务的创新企业',
    ],
    notice: [
      '购买前请先联系客服进行需求沟通和方案确认',
      '专属项目经理将在1个工作日内联系您启动项目',
      '30-60个工作日完成全部开发和交付',
      '包含2年免费维护和功能迭代',
      '定制服务，签订合同后不支持退款',
      '如有疑问请联系客服：service@jiangyuchen.cn',
    ],
  },
};

// ============================================================
// 图片轮播组件
// ============================================================
function ImageCarousel({ images }: { images: string[] }) {
  const [current, setCurrent] = useState(0);
  let startX = 0;

  const handleTouchStart = (e: React.TouchEvent) => {
    startX = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const diff = startX - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) {
      if (diff > 0 && current < images.length - 1) setCurrent(c => c + 1);
      if (diff < 0 && current > 0) setCurrent(c => c - 1);
    }
  };

  return (
    <div
      className="relative w-full overflow-hidden bg-gray-900"
      style={{ aspectRatio: '1/1' }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {images.map((src, i) => (
        <img
          key={i}
          src={src}
          alt={`商品图 ${i + 1}`}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${i === current ? 'opacity-100' : 'opacity-0'}`}
          loading={i === 0 ? 'eager' : 'lazy'}
        />
      ))}
      {images.length > 1 && (
        <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5">
          {images.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              className={`h-1.5 rounded-full transition-all ${i === current ? 'bg-white w-4' : 'bg-white/50 w-1.5'}`}
            />
          ))}
        </div>
      )}
      {images.length > 1 && (
        <div className="absolute top-3 right-3 bg-black/40 text-white text-xs px-2 py-0.5 rounded-full">
          {current + 1}/{images.length}
        </div>
      )}
    </div>
  );
}

// ============================================================
// 支付弹窗组件
// ============================================================
function PaymentModal({ product, onClose }: { product: ProductData; onClose: () => void }) {
  const [selected, setSelected] = useState<'alipay' | 'wechat'>('alipay');
  const [confirming, setConfirming] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const { isAuthenticated } = useAuth();

  const handlePay = async () => {
    if (selected === 'wechat') {
      alert('微信支付暂未开通，请使用支付宝支付');
      return;
    }
    if (!isAuthenticated) {
      window.location.href = getLoginUrl() + '?returnUrl=' + encodeURIComponent(window.location.pathname);
      return;
    }
    setConfirming(true);
    setErrorMsg(null);
    try {
      const token = localStorage.getItem('auth-token');
      const res = await fetch('/api/alipay/create-order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({
          productId: product.id,
          productName: product.fullName,
          amount: product.price,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || '创建订单失败');
      window.location.href = data.payUrl;
    } catch (err: any) {
      setConfirming(false);
      setErrorMsg(err?.message || '支付失败，请重试');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={onClose}>
      <div className="w-full bg-white rounded-t-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100">
          <div>
            <p className="text-sm text-gray-500 truncate max-w-[200px]">{product.fullName}</p>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold text-[#D32F2F]">
                ¥{product.price % 1 === 0 ? product.price : product.price.toFixed(1)}
              </span>
              <span className="text-sm text-gray-400">{product.unit}</span>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100">
            <X size={16} className="text-gray-500" />
          </button>
        </div>
        <div className="px-5 py-4">
          <p className="text-sm font-medium text-gray-700 mb-3">选择支付方式</p>
          <div className="space-y-3">
            <button
              onClick={() => setSelected('alipay')}
              className={`w-full flex items-center gap-3 p-3.5 rounded-xl border-2 ${selected === 'alipay' ? 'border-[#1677FF] bg-blue-50' : 'border-gray-200 bg-white'}`}
            >
              <div className="w-9 h-9 bg-[#1677FF] rounded-lg flex items-center justify-center flex-shrink-0">
                <span className="text-white font-bold text-sm">支</span>
              </div>
              <div className="flex-1 text-left">
                <p className="text-sm font-medium text-gray-900">支付宝</p>
                <p className="text-xs text-gray-400">推荐使用支付宝支付</p>
              </div>
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${selected === 'alipay' ? 'border-[#1677FF] bg-[#1677FF]' : 'border-gray-300'}`}>
                {selected === 'alipay' && <Check size={12} className="text-white" />}
              </div>
            </button>
            <button
              onClick={() => setSelected('wechat')}
              className={`w-full flex items-center gap-3 p-3.5 rounded-xl border-2 ${selected === 'wechat' ? 'border-[#07C160] bg-green-50' : 'border-gray-200 bg-white'}`}
            >
              <div className="w-9 h-9 bg-[#07C160] rounded-lg flex items-center justify-center flex-shrink-0">
                <span className="text-white font-bold text-sm">微</span>
              </div>
              <div className="flex-1 text-left">
                <p className="text-sm font-medium text-gray-900">微信支付</p>
                <p className="text-xs text-gray-400">暂未开通</p>
              </div>
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${selected === 'wechat' ? 'border-[#07C160] bg-[#07C160]' : 'border-gray-300'}`}>
                {selected === 'wechat' && <Check size={12} className="text-white" />}
              </div>
            </button>
          </div>
          {errorMsg && <p className="mt-3 text-sm text-red-500 text-center">{errorMsg}</p>}
          <button
            onClick={handlePay}
            disabled={confirming}
            className="mt-4 w-full py-4 bg-[#D32F2F] text-white font-bold text-base rounded-xl active:opacity-90 disabled:opacity-60"
          >
            {confirming ? '跳转支付中...' : `确认支付 ¥${product.price % 1 === 0 ? product.price : product.price.toFixed(1)}`}
          </button>
          <p className="mt-3 text-xs text-gray-400 text-center">支付即表示同意服务条款，虚拟商品不支持退款</p>
        </div>
        <div className="h-6" />
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
  const { isAuthenticated } = useAuth();

  const product = PRODUCT_DB[params.id || ''];

  if (!product) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center">
        <p className="text-gray-500 mb-4">商品不存在</p>
        <button onClick={() => setLocation('/jiang/shop')} className="text-[#D32F2F] text-sm">
          返回商城
        </button>
      </div>
    );
  }

  const handleBuy = () => {
    if (!isAuthenticated) {
      window.location.href = getLoginUrl() + '?returnUrl=' + encodeURIComponent(window.location.pathname);
      return;
    }
    setShowPayment(true);
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-36">
      {/* 顶部导航 */}
      <div className="bg-[#D32F2F] text-white sticky top-0 z-20">
        <div className="flex items-center px-4 py-3">
          <button onClick={() => setLocation('/jiang/shop')} className="mr-3 p-1">
            <ChevronLeft size={22} />
          </button>
          <h1 className="text-base font-semibold flex-1">商品详情</h1>
          <button
            onClick={() => {
              if (navigator.share) {
                navigator.share({ title: product.fullName, url: window.location.href });
              } else {
                navigator.clipboard?.writeText(window.location.href).then(() => alert('链接已复制'));
              }
            }}
            className="p-1 text-white/80"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      {/* ① 主图轮播区（1:1 正方形） */}
      <ImageCarousel images={product.images} />

      {/* ② 价格 + 标题区 */}
      <div className="bg-white px-4 pt-4 pb-3">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-3xl font-bold text-[#D32F2F]">
            ¥{product.price % 1 === 0 ? product.price : product.price.toFixed(1)}
          </span>
          <span className="text-sm text-gray-400">{product.unit}</span>
          {product.originalPrice && (
            <span className="text-sm text-gray-400 line-through">原价¥{product.originalPrice}</span>
          )}
        </div>
        {product.tag && (
          <span
            className="inline-block mt-1.5 text-xs font-medium px-2.5 py-0.5 rounded-full text-white"
            style={{ backgroundColor: product.tagColor }}
          >
            {product.tag}
          </span>
        )}
        <h2 className="text-lg font-bold text-gray-900 mt-2 leading-snug">{product.fullName}</h2>
        <p className="text-sm text-gray-500 mt-1 leading-relaxed">{product.subtitle}</p>
      </div>

      <div className="h-2 bg-gray-100" />

      {/* 商品介绍 */}
      <div className="bg-white px-4 py-4">
        <h3 className="text-sm font-bold text-gray-900 mb-2 flex items-center gap-2">
          <BookOpen size={15} className="text-[#D32F2F]" />
          商品介绍
        </h3>
        {product.description.split('\n\n').map((para, i) => (
          <p key={i} className="text-sm text-gray-600 leading-relaxed mb-2">{para}</p>
        ))}
      </div>

      <div className="h-2 bg-gray-100" />

      {/* 购买后获得 */}
      <div className="bg-white px-4 py-4">
        <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
          <Star size={15} className="text-[#D32F2F]" />
          购买后您将获得
        </h3>
        <div className="space-y-2">
          {product.whatYouGet.map((item, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <div className="w-5 h-5 bg-[#D32F2F]/10 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                <Check size={11} className="text-[#D32F2F]" />
              </div>
              <span className="text-sm text-gray-700 leading-relaxed">{item}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="h-2 bg-gray-100" />

      {/* 核心功能 */}
      <div className="bg-white px-4 py-4">
        <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
          <Zap size={15} className="text-[#D32F2F]" />
          核心功能
        </h3>
        <div className="grid grid-cols-2 gap-3">
          {product.features.map((f, i) => (
            <div key={i} className="bg-gray-50 rounded-xl p-3">
              <div className="w-8 h-8 bg-[#D32F2F]/10 rounded-lg flex items-center justify-center mb-2">
                <Cpu size={16} className="text-[#D32F2F]" />
              </div>
              <p className="text-xs font-semibold text-gray-900 mb-0.5">{f.title}</p>
              <p className="text-xs text-gray-500 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="h-2 bg-gray-100" />

      {/* 图文详情区 */}
      {product.detailImages.length > 0 && (
        <>
          <div className="bg-white px-4 pt-4 pb-2">
            <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
              <Users size={15} className="text-[#D32F2F]" />
              图文详情
            </h3>
          </div>
          <div className="space-y-1">
            {product.detailImages.map((src, i) => (
              <img key={i} src={src} alt={`详情图${i + 1}`} className="w-full object-contain" loading="lazy" />
            ))}
          </div>
          <div className="h-2 bg-gray-100" />
        </>
      )}

      {/* 适用场景 */}
      <div className="bg-white px-4 py-4">
        <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
          <MessageCircle size={15} className="text-[#D32F2F]" />
          适用场景
        </h3>
        <div className="space-y-2">
          {product.useCases.map((item, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <span className="text-[#D32F2F] text-sm flex-shrink-0 mt-0.5">·</span>
              <span className="text-sm text-gray-600 leading-relaxed">{item}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="h-2 bg-gray-100" />

      {/* 服务保障 */}
      <div className="bg-white px-4 py-4">
        <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
          <Shield size={15} className="text-[#D32F2F]" />
          服务保障
        </h3>
        <div className="grid grid-cols-4 gap-2">
          {[
            { icon: Shield, label: '安全支付', color: 'bg-blue-50', iconColor: 'text-blue-600' },
            { icon: Clock, label: '按时交付', color: 'bg-green-50', iconColor: 'text-green-600' },
            { icon: Headphones, label: '7×24客服', color: 'bg-orange-50', iconColor: 'text-orange-600' },
            { icon: CreditCard, label: '售后保障', color: 'bg-purple-50', iconColor: 'text-purple-600' },
          ].map(({ icon: Icon, label, color, iconColor }, i) => (
            <div key={i} className="text-center">
              <div className={`w-10 h-10 ${color} rounded-xl flex items-center justify-center mx-auto mb-1.5`}>
                <Icon size={18} className={iconColor} />
              </div>
              <p className="text-[11px] text-gray-600">{label}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="h-2 bg-gray-100" />

      {/* 联系客服 */}
      <div className="bg-white px-4 py-4">
        <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
          <div className="w-10 h-10 bg-[#D32F2F]/10 rounded-full flex items-center justify-center flex-shrink-0">
            <Phone size={18} className="text-[#D32F2F]" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-900">有疑问？联系客服</p>
            <p className="text-xs text-gray-500">service@jiangyuchen.cn · 工作日 9:00-18:00</p>
          </div>
          <ChevronRight size={16} className="text-gray-400" />
        </div>
      </div>

      <div className="h-2 bg-gray-100" />

      {/* 购买须知 */}
      <div className="bg-white px-4 py-4">
        <h3 className="text-sm font-bold text-gray-900 mb-3">购买须知</h3>
        <div className="space-y-2">
          {product.notice.map((item, i) => (
            <p key={i} className="text-xs text-gray-500 leading-relaxed">· {item}</p>
          ))}
        </div>
      </div>

      {/* 吸底购买栏 */}
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-gray-100 shadow-lg">
        <div className="px-4 py-3 flex items-center gap-3">
          <div className="flex-1">
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-bold text-[#D32F2F]">
                ¥{product.price % 1 === 0 ? product.price : product.price.toFixed(1)}
              </span>
              <span className="text-xs text-gray-400">{product.unit}</span>
            </div>
            {product.originalPrice && (
              <p className="text-xs text-gray-400 line-through">原价 ¥{product.originalPrice}</p>
            )}
          </div>
          <button
            onClick={handleBuy}
            className="flex-1 py-3.5 bg-[#D32F2F] text-white font-bold text-base rounded-xl active:opacity-90"
          >
            立即购买
          </button>
        </div>
        <BottomNav />
      </div>

      {showPayment && <PaymentModal product={product} onClose={() => setShowPayment(false)} />}
    </div>
  );
}
