import { Card } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { Loader2, TrendingUp, Trophy, Target, Activity, DollarSign, Users, Network, ChevronRight, Sparkles, Award, Crown, Gem, Medal } from "lucide-react";
import { Link } from "wouter";
import { useState, useEffect, createElement } from "react";
import { toast } from "sonner";
import EquityEnergyRing from "@/components/EquityEnergyRing";
import PrecisionSimulator, { SimulationResult } from "@/components/PrecisionSimulator";
import ThreeTierEngine from "@/components/ThreeTierEngine";
import AchievementWall from "@/components/AchievementWall";
import CompanyEquityStructure from "@/components/CompanyEquityStructure";
import CompanyEquityStructureCard from "@/components/CompanyEquityStructureCard";
import LegalAgreementZone from "@/components/LegalAgreementZone";
import LegalAgreementCard from "@/components/LegalAgreementCard";
import BlockchainProof from "@/components/BlockchainProof";
import InvestorFAQ from "@/components/InvestorFAQ";
import FAQCard from "@/components/FAQCard";
import NodeAchievementBadge from "@/components/NodeAchievementBadge";
import ShareholderSection from "@/components/ShareholderSection";

// FAQ手风琴组件
function FAQAccordion() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const faqs = [
    {
      question: '我投这点钱到底占多少股？',
      answerText: `公司不按传统的"拍脑袋估值"来谈，要的是"同舟共济"。

它是动态的增长票
公司现在是初创期，不想随便定个虚高估值套住您，也不想低估公司潜力。这30%是专门给首批天使投资人的"原始红利池"。

您的份额由您的胆识决定
如果本轮只需300万就能跑通市场，那您这50万就占了整个天使池的1/6，折合总股本5%。

您有"二次增持"的机会
除了这笔钱，如果您能利用资源帮公司拓展市场（利用那15%的贡献池），您的资金权重会被双倍放大。这意味着，您不仅是出钱的股东，您还是能通过贡献"赚"回更多股权的合伙人。`,
      answerBlocks: [
        { text: '公司不按传统的"拍脑袋估值"来谈，要的是"同舟共济"。' },
        { title: '它是动态的增长票', text: '公司现在是初创期，不想随便定个虚高估值套住您，也不想低估公司潜力。这30%是专门给首批天使投资人的"原始红利池"。' },
        { title: '您的份额由您的胆识决定', text: '如果本轮只需300万就能跑通市场，那您这50万就占了整个天使池的1/6，折合总股本5%。' },
        { title: '您有"二次增持"的机会', text: '除了这笔钱，如果您能利用资源帮公司拓展市场（利用那15%的贡献池），您的资金权重会被双倍放大。这意味着，您不仅是出钱的股东，您还是能通过贡献"赚"回更多股权的合伙人。' },
      ],
    },
    {
      question: '别人投的多了，我会被稀释吗？',
      answerText: `这是封闭池，不是无限稀释
这30%的天使池是封闭的，公司不会无限扩张这个池子。您担心的不是公司稀释您，而是要一起寻找"最高质量的队友"。

比例动态调整，但价值在增长
进来的人越多，说明公司资金储备越厚。您手中的份额虽然比例在调整，但背后的公司估值和抗风险能力是在成倍增加的。

举个例子
假设您现在占天使池的20%（总股本6%），如果后续又有人投入，您可能变成15%（总股本4.5%），但此时公司估值可能已经翻倍，您的股权价值反而更高了。`,
      answerBlocks: [
        { title: '这是封闭池，不是无限稀释', text: '这30%的天使池是封闭的，公司不会无限扩张这个池子。您担心的不是公司稀释您，而是要一起寻找"最高质量的队友"。' },
        { title: '比例动态调整，但价值在增长', text: '进来的人越多，说明公司资金储备越厚。您手中的份额虽然比例在调整，但背后的公司估值和抗风险能力是在成倍增加的。' },
        { title: '举个例子', text: '假设您现在占天使池的20%（总股本6%），如果后续又有人投入，您可能变成15%（总股本4.5%），但此时公司估值可能已经翻倍，您的股权价值反而更高了。' },
      ],
    },
    {
      question: '比例动态在变，如何保证合规又不乱？',
      answerText: `持股平台统一管理
这点您完全放心。在工商层面，这45%（30%+15%）的股份会统一放在一个有限合伙企业（GP/LP模式）里。对外部投资者来说，结构非常干净，就是一个单一的持股平台。

内部灵活，外部专业
公司讨论的所有动态调整，都是在这个平台内部进行的协议约定。这既保证了内部激励的灵活性，又保证了公司外部形象的专业性和融资的顺畅。

VC看到的是什么
未来红杉、经纬这些机构进场时，他们看到的是一个规范的持股平台，而不是一堆散户。您的退出路径是清晰的，不会因为内部调整而影响。`,
      answerBlocks: [
        { title: '持股平台统一管理', text: '这点您完全放心。在工商层面，这45%（30%+15%）的股份会统一放在一个有限合伙企业（GP/LP模式）里。对外部投资者来说，结构非常干净，就是一个单一的持股平台。' },
        { title: '内部灵活，外部专业', text: '公司讨论的所有动态调整，都是在这个平台内部进行的协议约定。这既保证了内部激励的灵活性，又保证了公司外部形象的专业性和融资的顺畅。' },
        { title: 'VC看到的是什么', text: '未来红杉、经纬这些机构进场时，他们看到的是一个规范的持股平台，而不是一堆散户。您的退出路径是清晰的，不会因为内部调整而影响。' },
      ],
    },
  ];

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }).catch(() => {
      setCopiedId(`error-${id}`);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  return (
    <div className="space-y-2">
      {faqs.map((faq, index) => (
        <div key={index} className="border border-divider rounded-xl overflow-hidden bg-white-pure shadow-sm">
          <button
            onClick={() => setOpenIndex(openIndex === index ? null : index)}
            className="w-full px-3 py-2.5 flex items-center justify-between text-left hover:bg-cream transition-colors"
          >
            <span className="text-sm font-semibold text-core-black pr-3">{faq.question}</span>
            <svg
              className={`w-4 h-4 text-gray-500 flex-shrink-0 transition-transform ${
                openIndex === index ? 'rotate-180' : ''
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          
          {openIndex === index && (
            <div className="px-3 pb-3 pt-2 border-t border-gray-100">
              <div className="space-y-2.5">
                {faq.answerBlocks.map((block, i) => {
                  const blockId = `${index}-${i}`;
                  const blockText = block.title ? `${block.title}\n${block.text}` : block.text;
                  const isCopied = copiedId === blockId;
                  const isError = copiedId === `error-${blockId}`;
                  
                  return (
                    <div key={i} className="text-sm relative group">
                      {block.title && (
                        <div className="font-bold text-core-black mb-1">{block.title}</div>
                      )}
                      <div className="text-gray-700 leading-relaxed flex items-start justify-between">
                        <span className="flex-1 pr-2">{block.text}</span>
                        <button
                          onClick={() => handleCopy(blockText, blockId)}
                          className="flex-shrink-0 ml-1 mt-0.5 p-1 hover:bg-gray-100 rounded transition-colors relative"
                          title="复制这段"
                        >
                          <svg className="w-3.5 h-3.5 text-gray-400 hover:text-stable-gray" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                          {isCopied && (
                            <span className="absolute -top-6 right-0 bg-green-500 text-white text-xs px-2 py-0.5 rounded whitespace-nowrap">
                              已复制
                            </span>
                          )}
                          {isError && (
                            <span className="absolute -top-6 right-0 bg-brand-red-light0 text-white text-xs px-2 py-0.5 rounded whitespace-nowrap">
                              复制失败
                            </span>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              
              <button
                onClick={() => handleCopy(faq.answerText, `all-${index}`)}
                className="mt-3 w-full bg-gray-100 hover:bg-gray-200 text-gray-700 py-2 rounded-lg text-xs font-medium transition-colors flex items-center justify-center space-x-1 relative"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                <span>复制全部文字</span>
                {copiedId === `all-${index}` && (
                  <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-green-500 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                    已复制全部
                  </span>
                )}
                {copiedId === `error-all-${index}` && (
                  <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-brand-red-light0 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                    复制失败
                  </span>
                )}
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// 饼图配色方案
const POOL_COLORS = [
  '#A80000', '#FF6B6B', '#F59E0B', '#10B981', '#3B82F6',
  '#8B5CF6', '#EC4899', '#14B8A6', '#F97316', '#6366F1',
  '#84CC16', '#06B6D4',
];

// 自绘SVG饼图组件
function EquityPieChart({
  parts,
  othersValue,
  centerLabel,
  centerValue,
}: {
  parts: { label: string; value: number; color: string }[];
  othersValue?: number;
  centerLabel?: string;
  centerValue?: string;
}) {
  const cx = 90;
  const cy = 100;
  const r = 72;
  const svgW = 360;

  const allParts = [
    ...parts.filter(p => p.value > 0),
    ...(othersValue && othersValue > 0 ? [{ label: '其他股东', value: othersValue, color: '#D1D5DB' }] : []),
  ];
  const total = allParts.reduce((s, p) => s + p.value, 0);
  if (total === 0) return null;

  const labelGap = 42;
  const labelStartY = 30;
  const svgH = Math.max(200, labelStartY + allParts.length * labelGap + 10);

  let cumAngle = -90;
  const sectors = allParts.map((part) => {
    const angle = (part.value / total) * 360;
    const startAngle = cumAngle;
    const endAngle = cumAngle + angle;
    const midAngle = cumAngle + angle / 2;
    cumAngle = endAngle;
    return { ...part, startAngle, endAngle, midAngle, angleDeg: angle };
  });

  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const sectorPath = (startAngle: number, endAngle: number) => {
    if (endAngle - startAngle >= 359.99) {
      return `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r} Z`;
    }
    const largeArc = endAngle - startAngle > 180 ? 1 : 0;
    const x1 = cx + r * Math.cos(toRad(startAngle));
    const y1 = cy + r * Math.sin(toRad(startAngle));
    const x2 = cx + r * Math.cos(toRad(endAngle));
    const y2 = cy + r * Math.sin(toRad(endAngle));
    return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
  };

  const labelX = 210;
  const cLabel = centerLabel || '总股份';
  const cValue = centerValue || allParts.filter(p => p.label !== '其他股东').reduce((s, p) => s + p.value, 0).toFixed(2) + '%';

  return (
    <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full" style={{ maxHeight: `${svgH}px` }}>
      <defs>
        <filter id="pieShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#000" floodOpacity="0.08" />
        </filter>
      </defs>

      <g filter="url(#pieShadow)">
        {sectors.map((s, i) => (
          <path
            key={i}
            d={sectorPath(s.startAngle, s.endAngle)}
            fill={s.color}
            stroke="white"
            strokeWidth="2"
          />
        ))}
        <circle cx={cx} cy={cy} r={r * 0.45} fill="white" />
        <text x={cx} y={cy - 6} textAnchor="middle" className="text-[11px]" fill="#666" fontWeight="400">{cLabel}</text>
        <text x={cx} y={cy + 14} textAnchor="middle" className="text-[16px]" fill="#A80000" fontWeight="700">
          {cValue}
        </text>
      </g>

      {sectors.map((s, i) => {
        const midRad = toRad(s.midAngle);
        const edgeX = cx + (r + 4) * Math.cos(midRad);
        const edgeY = cy + (r + 4) * Math.sin(midRad);
        const elbowX = cx + (r + 20) * Math.cos(midRad);
        const elbowY = cy + (r + 20) * Math.sin(midRad);
        const targetY = labelStartY + i * labelGap;
        const targetX = labelX - 8;

        return (
          <g key={`label-${i}`}>
            <polyline
              points={`${edgeX},${edgeY} ${elbowX},${elbowY} ${targetX},${targetY + 8}`}
              fill="none"
              stroke={s.color}
              strokeWidth="1.2"
              strokeDasharray={s.label === '其他股东' ? '3,2' : 'none'}
              opacity="0.6"
            />
            <circle cx={targetX} cy={targetY + 8} r="3" fill={s.color} />

            <g>
              <rect x={labelX} y={targetY} width="3" height={32} rx="1.5" fill={s.color} />
              <text x={labelX + 10} y={targetY + 12} fill="#374151" fontSize="12" fontWeight="600">{s.label}</text>
              <text x={labelX + 10} y={targetY + 28} fill={s.color} fontSize="14" fontWeight="700">{s.value.toFixed(2)}%</text>
            </g>
          </g>
        );
      })}
    </svg>
  );
}

export default function MyEquity() {
  const { data: enhanced, isLoading } = trpc.equity.getMyEquityEnhanced.useQuery();
  const { data: poolConfig } = trpc.equity.getPoolConfig.useQuery();
  const { data: valuationHistory } = trpc.equity.getValuationHistory.useQuery();
  const { data: recentActivities } = trpc.equity.getRecentActivities.useQuery();
  const { data: overviewStats } = trpc.contacts.overviewStats.useQuery();
  
  const [simulateInvites, setSimulateInvites] = useState(0);
  const [simulateInvestment, setSimulateInvestment] = useState(0);
  const [simulationResult, setSimulationResult] = useState<SimulationResult | null>(null);
  const [isEquityExpanded, setIsEquityExpanded] = useState(false);


  if (isLoading) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#A80000]" />
      </div>
    );
  }

  if (!enhanced) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500">暂无股权数据</p>
        </div>
      </div>
    );
  }

  const equity = enhanced;
  
  // 确保所有必需字段都有默认值
  if (!equity.details) {
    equity.details = {
      inviteCount: 0,
      userInvestment: 0,
      totalInvestment: 1,
      referralNetworkCount: 0,
    };
  }
  if (!equity.ranking) {
    equity.ranking = null;
  }
  
  const now = new Date();
  const timestampStr = `${now.getFullYear()}年${String(now.getMonth() + 1).padStart(2, '0')}月${String(now.getDate()).padStart(2, '0')}日 ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  // 个人股份构成数据（升级话术）
  const equityParts = [
    { 
      label: '投资股份', 
      value: equity.investmentEquity || 0, 
      color: '#A80000',
      upgradeLabel: '原始核心权证',
      description: '稳健底仓，由投资转化'
    },
    { 
      label: '邀请贡献', 
      value: equity.inviteEquity || 0, 
      color: '#FF6B6B',
      upgradeLabel: '渠道裂变加权',
      description: `已邀请 ${equity.details?.inviteCount || 0} 人`
    },
    { 
      label: '人脉贡献', 
      value: equity.referralNetworkEquity || 0, 
      color: '#F59E0B',
      upgradeLabel: '社会化杠杆溢价',
      description: `人脉网络 ${equity.details?.referralNetworkCount || 0} 人`
    },
  ];
  const othersValue = Math.max(0, 100 - (equity.totalEquity || 0));

  // 公司股权架构数据
  const companyPools: { label: string; value: number; color: string }[] = [];
  if (poolConfig && Array.isArray(poolConfig)) {
    const poolRules = poolConfig.filter(
      (r: any) => r.ruleKey.includes('pool') && r.ruleKey.endsWith('_percentage')
    );
    poolRules.sort((a: any, b: any) => a.ruleValue - b.ruleValue);
    poolRules.forEach((rule: any, index: number) => {
      companyPools.push({
        label: rule.ruleDescription || rule.ruleKey,
        value: rule.ruleValue,
        color: POOL_COLORS[index % POOL_COLORS.length],
      });
    });
  }

  // 股份增长模拟
  const inviteRule = 0.05;
  const networkRule = 0.02;
  const simulatedInviteEquity = simulateInvites * inviteRule;
  const simulatedTotalEquity = equity.totalEquity + simulatedInviteEquity;

  // 里程碑定义
  const milestones = [
    {
      category: '邀请成就',
      icon: Users,
      levels: [
        { name: '铜牌股东', threshold: 5, icon: Medal, color: '#CD7F32' },
        { name: '银牌股东', threshold: 20, icon: Award, color: '#C0C0C0' },
        { name: '金牌股东', threshold: 50, icon: Trophy, color: '#FFD700' },
        { name: '钻石股东', threshold: 100, icon: Gem, color: '#B9F2FF' },
      ],
      current: equity.details?.inviteCount || 0,
    },
    {
      category: '投资成就',
      icon: DollarSign,
      levels: [
        { name: '铜牌投资人', threshold: 10000, icon: Medal, color: '#CD7F32' },
        { name: '银牌投资人', threshold: 50000, icon: Award, color: '#C0C0C0' },
        { name: '金牌投资人', threshold: 100000, icon: Trophy, color: '#FFD700' },
        { name: '钻石投资人', threshold: 500000, icon: Crown, color: '#B9F2FF' },
      ],
      current: equity.details?.userInvestment || 0,
    },
    {
      category: '持股成就',
      icon: TrendingUp,
      levels: [
        { name: '铜牌持股人', threshold: 1, icon: Medal, color: '#CD7F32' },
        { name: '银牌持股人', threshold: 3, icon: Award, color: '#C0C0C0' },
        { name: '金牌持股人', threshold: 5, icon: Trophy, color: '#FFD700' },
        { name: '钻石持股人', threshold: 10, icon: Crown, color: '#B9F2FF' },
      ],
      current: equity.totalEquity || 0,
    },
  ];

  return (
    <div className="min-h-screen bg-cream pb-20">
      {/* 顶部导航 */}
      <div className="bg-white-pure border-b sticky top-0 z-10">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center">
          <Link href="/parent/profile">
            <button className="text-stable-gray hover:text-core-black">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          </Link>
          <h1 className="flex-1 text-center text-lg font-bold text-core-black">我的股权</h1>
          <div className="w-6"></div>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 py-4 space-y-3">
        {/* 第一层：现状层（红色 + 灰色仪表盘融合） */}
        <div className="space-y-0">
        {/* 1. 股权透视卡片（可点击展开） */}
        <Card 
          className="bg-gradient-to-br from-[#A80000] to-[#8a0000] text-white p-3.5 rounded-t-2xl rounded-b-none shadow-none border-none cursor-pointer transition-all"
          onClick={() => setIsEquityExpanded(!isEquityExpanded)}
        >
          {/* 席位编号 - 右上角 */}
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm opacity-90">资本权证资产</span>
            <div className="flex items-center space-x-2">
              {equity.dynamicLeverage && (
                <span className="text-[10px] font-mono tracking-wider opacity-50 bg-white/10 px-1.5 py-0.5 rounded">
                  编号 {String(equity.dynamicLeverage.seatNumber).padStart(4, '0')}
                </span>
              )}
              <TrendingUp className="w-5 h-5 opacity-90" />
              <svg
                className={`w-5 h-5 opacity-90 transition-transform ${
                  isEquityExpanded ? 'rotate-180' : ''
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-5xl font-bold">{equity.totalEquity.toFixed(4)}</span>
            <span className="text-2xl opacity-90">%</span>
          </div>
          <div className="mt-1 flex items-center justify-between">
            <span className="text-xs opacity-60">当前综合权重</span>
            <span className="text-[10px] opacity-50">截止 {timestampStr}</span>
          </div>

          {/* === 权重拆解区域（始终可见） === */}
          {(() => {
            const baseEquity = equity.investmentEquity || 0;
            const contribEquity = (equity.inviteEquity || 0) + (equity.referralNetworkEquity || 0);
            const totalEq = baseEquity + contribEquity;
            const basePct = totalEq > 0 ? (baseEquity / totalEq) * 100 : 100;
            const contribPct = totalEq > 0 ? (contribEquity / totalEq) * 100 : 0;
            return (
              <div className="mt-2 pt-2 border-t border-white/15">
                {/* 拆解：单行紧凑布局 */}
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center space-x-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-white/80" />
                    <span className="opacity-70">基础权证</span>
                    <span className="font-bold">{baseEquity.toFixed(4)}%</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
                    <span className="opacity-70">贡献加成</span>
                    <span className="font-bold text-yellow-300">+{contribEquity.toFixed(4)}%</span>
                  </div>
                </div>
                {/* 横向比例条 */}
                <div className="h-1.5 rounded-full overflow-hidden bg-white/10 flex mt-1.5">
                  <div
                    className="h-full bg-white/70 transition-all duration-700"
                    style={{ width: `${Math.max(basePct, 2)}%` }}
                  />
                  <div
                    className="h-full bg-gradient-to-r from-yellow-400 to-orange-400 transition-all duration-700"
                    style={{ width: `${Math.max(contribPct, contribEquity > 0 ? 2 : 0)}%` }}
                  />
                </div>
                <div className="mt-1 flex items-center justify-between text-[10px] opacity-50">
                  <span>资本底盘 · 静态确权</span>
                  <span>市场贡献 · 动态增长</span>
                </div>
              </div>
            );
          })()}
          
          {/* 展开后的股权透视内容 */}
          {isEquityExpanded && (
            <div className="mt-2.5 pt-2.5 border-t border-white/20 space-y-2.5">
              {/* 动态杠杆系数区域 */}
              <div className="bg-gradient-to-r from-yellow-400/20 to-orange-400/20 rounded-xl p-3 border border-yellow-400/30">
                {/* 杠杆主数值 + 席位信息 */}
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <div className="text-xs opacity-70 mb-1">资本加速（风险补偿）</div>
                    <div className="text-2xl font-bold text-yellow-300 font-mono">
                      {equity.dynamicLeverage ? `×${equity.dynamicLeverage.leverage.toFixed(4)}` : '×1.0000'}
                    </div>
                    <div className="text-[10px] opacity-50 mt-0.5">已锁定 · 永久有效</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs opacity-70">编号 {equity.dynamicLeverage ? String(equity.dynamicLeverage.seatNumber).padStart(4, '0') : '0000'}</div>
                    <div className="text-xs opacity-60 mt-1">
                      {equity.details?.userInvestment ? `${(equity.details.userInvestment / 10000).toFixed(0)}万级别` : '未投资'}
                    </div>
                  </div>
                </div>

                {/* 红利余量进度条 */}
                {equity.dynamicLeverage?.currentRound && (
                  <div className="mt-1.5">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] opacity-60">
                        {equity.dynamicLeverage.currentRound.name}（{equity.dynamicLeverage.currentRound.maxLeverage}x → {equity.dynamicLeverage.currentRound.minLeverage}x）
                      </span>
                      <span className="text-[10px] text-yellow-300 font-bold">
                        剩余 {Math.round((1 - equity.dynamicLeverage.currentRound.progress) * 100)}%
                      </span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden bg-white/10">
                      <div
                        className="h-full rounded-full transition-all duration-1000"
                        style={{
                          width: `${equity.dynamicLeverage.currentRound.progress * 100}%`,
                          background: 'linear-gradient(90deg, #F59E0B, #EF4444)',
                        }}
                      />
                    </div>
                    <div className="text-[10px] text-yellow-200/70 mt-1">
                      本轮高倍红利席位即将收官
                      {equity.dynamicLeverage.nextRound && (
                        <span>，下一轮杠杆将下调至 {equity.dynamicLeverage.nextRound.maxLeverage}x</span>
                      )}
                    </div>
                  </div>
                )}

                {/* 犹豫成本计费器 */}
                {equity.dynamicLeverage && equity.details?.userInvestment ? (
                  <div className="mt-2 pt-2 border-t border-yellow-400/20">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className="text-[10px] opacity-50 mb-0.5">当前价值</div>
                        <div className="text-sm font-bold text-green-400">
                          {(equity.details.userInvestment / 10000).toFixed(0)}万 → {((equity.details.userInvestment * equity.dynamicLeverage.leverage) / 10000).toFixed(2)}万
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] opacity-50 mb-0.5">犹豫成本</div>
                        <div className="text-sm font-bold text-red-400">
                          -{((equity.details.userInvestment * equity.dynamicLeverage.hesitationCost) / 10000).toFixed(2)}万
                        </div>
                      </div>
                    </div>
                    <div className="text-[10px] text-red-300/60 mt-1 text-right">
                      若错过本轮，资产将缩水 {(equity.dynamicLeverage.hesitationCost * 10000).toFixed(0)} 权证点
                    </div>
                  </div>
                ) : null}
              </div>
              
              {/* 资本底仓（静态） */}
              <div className="bg-white/10 rounded-lg p-3 border border-white/20">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-semibold opacity-90">资本底仓（静态确权）</div>
                  <div className="text-xs opacity-70">我的投资</div>
                </div>
                <div className="flex items-baseline space-x-1">
                  <span className="text-xl font-bold">{(equity.details?.userInvestment || 0).toLocaleString()}</span>
                  <span className="text-sm opacity-70">元</span>
                </div>
                <div className="text-xs opacity-60 mt-1">
                  转化为 {(equity.investmentEquity || 0).toFixed(4)}% 基础权证
                </div>
              </div>

              {/* 股权确权状态 */}
              <div className="bg-white/10 rounded-lg p-3 border border-white/20">
                <div className="text-xs font-semibold opacity-90 mb-2">确权状态</div>
                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="opacity-70">电子股权协议</span>
                    <span className="font-bold text-yellow-300">待签署</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="opacity-70">权证下发状态</span>
                    <span className="font-bold text-green-400">已确权</span>
                  </div>
                </div>
              </div>

              {/* 贡献加成引导钩子 → 滚动到第二层 */}
              <div
                className="bg-gradient-to-r from-yellow-400/10 to-orange-400/10 rounded-lg p-3 border border-yellow-400/20 cursor-pointer hover:border-yellow-400/40 transition-all"
                onClick={(e) => {
                  e.stopPropagation();
                  const el = document.getElementById('market-contribution-section');
                  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs opacity-70 mb-0.5">贡献加成</div>
                    <div className="text-lg font-bold text-yellow-300">
                      +{((equity.inviteEquity || 0) + (equity.referralNetworkEquity || 0)).toFixed(4)}%
                    </div>
                  </div>
                  <div className="flex items-center space-x-1">
                    <span className="text-[10px] opacity-50">查看市场贡献明细</span>
                    <svg className="w-4 h-4 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>
          )}
        </Card>

        {/* 2. 资产仪表盘：估值 + 排名（左右布局） + 饼图 */}
        <Card className="bg-cream rounded-t-none rounded-b-3xl shadow-sm border-none p-5">
          {/* 左右双列：估值 vs 排名 */}
          <div className="grid grid-cols-2 gap-6 mb-5 relative">
            {/* 左侧：我的股权估值 */}
            <div>
              <div className="text-xs text-gray-500 mb-1 flex items-center">
                <Sparkles className="w-3 h-3 mr-1" />
                我的股权估值
              </div>
              <div className="flex items-baseline space-x-1">
                <span className="text-2xl font-bold text-orange-600">¥{(equity.estimatedValue / 10000).toFixed(2)}</span>
                <span className="text-sm text-stable-gray">万</span>
              </div>
              <div className="mt-1 text-xs text-gray-400">
                基于估值 ¥{(equity.companyValuation / 10000).toFixed(0)}万
              </div>
            </div>
            
            {/* 中间分割线 */}
            <div className="absolute left-1/2 top-0 bottom-0 w-px bg-gray-300" style={{transform: 'translateX(-50%)'}}></div>
            
            {/* 右侧：当前持股排名 */}
            <div className="text-right">
              <div className="text-xs text-gray-500 mb-1 flex items-center justify-end">
                <Trophy className="w-3 h-3 mr-1" />
                当前持股排名
              </div>
              {equity.ranking ? (
                <>
                  <div className="text-2xl font-bold text-core-black">No.{equity.ranking.rank}</div>
                  <div className="mt-1 text-xs text-gray-400">
                    共{equity.ranking.total}位股东
                  </div>
                </>
              ) : (
                <div className="text-2xl font-bold text-gray-400">--</div>
              )}
            </div>
          </div>
          
          {/* 虚线分割 */}
          <div className="border-t border-dashed border-gray-300 my-4"></div>
          
          {/* 3D能量环区域 */}
          <div>
            <EquityEnergyRing
              parts={equityParts}
              othersValue={othersValue}
              totalEquity={equity.totalEquity}
            />
          </div>
        </Card>
        </div>
        {/* 第一层结束 */}

        {/* 第二层：市场贡献中心 */}
        <div id="market-contribution-section" className="mt-6">
          <NodeAchievementBadge
            level={equity.details?.inviteCount >= 1 ? 'standard' : 'none'}
            equityBonus={0.009}
            contributionScore={equity.details?.inviteCount * 2 || 0}
            marketShare={0.06}
            isQualified={equity.details?.inviteCount >= 1}
            estimatedEquityBonus={0.0015}
            contactCount={overviewStats?.totalContacts || 0}
            tagAverage={overviewStats?.averageTagCount || 0}
            contactFrequency={overviewStats?.dailyContactFrequency || 0}
            standardNodeCount={0}
            advancedNodeCount={0}
            totalEquity={equity.totalEquity || 0}
            investmentEquity={equity.investmentEquity || 0}
            contribEquity={(equity.inviteEquity || 0) + (equity.referralNetworkEquity || 0)}
            inviteEquity={equity.inviteEquity || 0}
            referralNetworkEquity={equity.referralNetworkEquity || 0}
            inviteCount={equity.details?.inviteCount || 0}
            referralNetworkCount={equity.details?.referralNetworkCount || 0}
            dynamicLeverage={equity.dynamicLeverage || null}
          />
        </div>

        {/* 第三层：股东保障中心 - 统一红帽子+灰色底座 */}
        <div className="mt-6 space-y-0">
          {/* 红色顶盖（红帽子） */}
          <div className="bg-gradient-to-br from-[#A80000] to-[#8a0000] text-white p-5 rounded-t-2xl rounded-b-none">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm opacity-90">股东保障中心</span>
              <svg className="w-5 h-5 opacity-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div className="text-lg font-bold">契约、背书与底层逻辑</div>
            <div className="mt-1">
              <span className="text-xs opacity-60">为660位创始股东构建信任基石</span>
            </div>
            {/* 三项概览 */}
            <div className="mt-4 grid grid-cols-3 gap-3">
              <div className="bg-white/10 rounded-xl p-2.5 text-center">
                <div className="text-2xl font-bold">100%</div>
                <div className="text-xs opacity-60 mt-0.5">股权分配</div>
              </div>
              <div className="bg-white/10 rounded-xl p-2.5 text-center">
                <div className="text-2xl font-bold">0/1</div>
                <div className="text-xs opacity-60 mt-0.5">协议签署</div>
              </div>
              <div className="bg-white/10 rounded-xl p-2.5 text-center">
                <div className="text-2xl font-bold">3</div>
                <div className="text-xs opacity-60 mt-0.5">核心问答</div>
              </div>
            </div>
          </div>

          {/* 灰色底座 */}
          <div className="bg-cream rounded-t-none rounded-b-3xl p-5">
            {/* 模块一：公司股权分配 - 内嵌手风琴 */}
            <ShareholderSection
              title="公司股权分配"
              subtitle="4个股权池 · 总股本100%"
              icon="shield"
              defaultOpen={false}
            >
              <CompanyEquityStructureCard />
            </ShareholderSection>

            <div className="border-t border-dashed border-gray-300 my-4"></div>

            {/* 模块二：在线签署 - 内嵌手风琴 */}
            <ShareholderSection
              title="在线签署"
              subtitle="0/1 份协议已签署"
              icon="file"
              defaultOpen={false}
            >
              <LegalAgreementCard
                agreements={[
                  {
                    id: 'equity-investment-agreement',
                    title: '电子股权投资协议',
                    description: '明确股东权益、义务及退出机制',
                    status: 'unsigned',
                    hashValue: '0x7a2d8f3e9c1b5a4d6f8e2c9a1b3d5e7f9a2c4e6d8f1a3b5c7d9e1f3a5b7c9d1e3f',
                    blockchainTxId: 'BH9872F3A...A82',
                  },
                ]}
                onSign={(id) => {
                  toast.info('没有需要签署的新合同');
                }}
                onDownload={(id) => {
                  toast.success('协议下载中...');
                }}
              />
            </ShareholderSection>

            <div className="border-t border-dashed border-gray-300 my-4"></div>

            {/* 模块三：常见问题 - 内嵌手风琴 */}
            <ShareholderSection
              title="常见问题"
              subtitle=""
              icon="help"
              defaultOpen={false}
            >
              <FAQCard />
            </ShareholderSection>
          </div>
        </div>


      </div>
    </div>
  );
}
