import { Card } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { Loader2, TrendingUp, Users, Handshake, FileSignature, ChevronDown, ChevronUp, Building2, GitBranch, DollarSign, Network } from "lucide-react";
import { Link } from "wouter";
import { useState } from "react";
import { toast } from "sonner";

// 饼图配色方案
const POOL_COLORS = [
  '#A80000', '#FF6B6B', '#F59E0B', '#10B981', '#3B82F6',
  '#8B5CF6', '#EC4899', '#14B8A6', '#F97316', '#6366F1',
  '#84CC16', '#06B6D4',
];

// 自绘SVG饼图组件：饼在左侧，引线引到右侧统一排列
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

  // 动态计算SVG高度
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
      // 完整圆
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

  // 中心显示内容
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
  const { data: equity, isLoading } = trpc.equity.getMyEquity.useQuery();
  const { data: poolConfig } = trpc.equity.getPoolConfig.useQuery();
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

  // 当前时间戳
  const now = new Date();
  const timestampStr = `${now.getFullYear()}年${String(now.getMonth() + 1).padStart(2, '0')}月${String(now.getDate()).padStart(2, '0')}日 ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  // 个人股份构成数据
  const equityParts = [
    {
      label: '投资股份',
      value: equity.investmentEquity,
      color: '#A80000',
    },
    {
      label: '邀请贡献',
      value: equity.inviteEquity,
      color: '#FF6B6B',
    },
    {
      label: '人脉贡献',
      value: equity.referralNetworkEquity,
      color: '#F59E0B',
    },
  ];

  const othersValue = Math.max(0, 100 - equity.totalEquity);

  // 公司股权架构数据（从后台股份池配置获取）
  const companyPools: { label: string; value: number; color: string }[] = [];
  if (poolConfig) {
    const poolRules = poolConfig.filter(
      (r: any) => r.ruleKey.includes('pool') && r.ruleKey.endsWith('_percentage')
    );
    poolRules.forEach((rule: any, index: number) => {
      companyPools.push({
        label: rule.ruleDescription || rule.ruleKey,
        value: rule.ruleValue,
        color: POOL_COLORS[index % POOL_COLORS.length],
      });
    });
  }

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

      <div className="max-w-md mx-auto px-4 py-4 space-y-3">
        {/* 总股份卡片 */}
        <Card className="bg-gradient-to-br from-[#A80000] to-[#8a0000] text-white p-5 rounded-2xl shadow-lg border-none">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm opacity-90">我的总股份</span>
            <TrendingUp className="w-5 h-5 opacity-90" />
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-5xl font-bold">{equity.totalEquity.toFixed(4)}</span>
            <span className="text-2xl opacity-90">%</span>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs opacity-60">在公司总股本中的占比</span>
            <span className="text-xs opacity-60 bg-white/10 px-2 py-0.5 rounded-full">
              截止 {timestampStr}
            </span>
          </div>
        </Card>

        {/* 个人股份构成饼图 */}
        <Card className="p-4 rounded-2xl shadow-sm">
          <h2 className="text-base font-bold text-gray-900 mb-2">我的股份构成</h2>
          <EquityPieChart
            parts={equityParts}
            othersValue={othersValue}
            centerLabel="我的股份"
            centerValue={equity.totalEquity.toFixed(2) + '%'}
          />
        </Card>

        {/* 公司股权架构饼图 */}
        {companyPools.length > 0 && (
          <Card className="p-4 rounded-2xl shadow-sm">
            <h2 className="text-base font-bold text-gray-900 mb-2">公司股权架构</h2>
            <EquityPieChart
              parts={companyPools}
              centerLabel="总股本"
              centerValue="100%"
            />
          </Card>
        )}

        {/* 股份明细 */}
        <Card className="p-4 rounded-2xl shadow-sm">
          <h2 className="text-base font-bold text-gray-900 mb-3">股份明细</h2>
          
          <div className="space-y-2">
            {/* 投资股份 */}
            <div className="flex items-center p-3 bg-red-50 rounded-xl">
              <div className="w-9 h-9 rounded-lg bg-[#A80000] flex items-center justify-center flex-shrink-0 mr-3">
                <DollarSign className="w-4.5 h-4.5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-900">投资股份</span>
                  <span className="text-base font-bold text-[#A80000]">{equity.investmentEquity.toFixed(4)}%</span>
                </div>
                <p className="text-xs text-gray-600 mt-0.5">
                  投资股份池中占比
                  {equity.details.userInvestment > 0 && (
                    <span className="ml-1">· 金额占比 {((equity.details.userInvestment / equity.details.totalInvestment) * 100).toFixed(2)}%</span>
                  )}
                </p>
              </div>
            </div>

            {/* 邀请贡献 */}
            <div className="flex items-center p-3 bg-red-50/60 rounded-xl">
              <div className="w-9 h-9 rounded-lg bg-[#FF6B6B] flex items-center justify-center flex-shrink-0 mr-3">
                <Users className="w-4.5 h-4.5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-900">邀请贡献</span>
                  <span className="text-base font-bold text-[#FF6B6B]">{equity.inviteEquity.toFixed(4)}%</span>
                </div>
                <p className="text-xs text-gray-600 mt-0.5">
                  已邀请 {equity.details.inviteCount} 人 × 0.05%/人
                </p>
              </div>
            </div>

            {/* 人脉贡献 */}
            <div className="flex items-center p-3 bg-amber-50 rounded-xl">
              <div className="w-9 h-9 rounded-lg bg-amber-500 flex items-center justify-center flex-shrink-0 mr-3">
                <Network className="w-4.5 h-4.5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-900">人脉贡献</span>
                  <span className="text-base font-bold text-amber-600">{equity.referralNetworkEquity.toFixed(4)}%</span>
                </div>
                <p className="text-xs text-gray-600 mt-0.5">
                  被邀请人带来 {equity.details.referralNetworkCount} 个人脉 · 每100人脉 = 0.02%
                </p>
              </div>
            </div>
          </div>
        </Card>

        {/* 如何增加股份 */}
        <Card className="p-4 rounded-2xl shadow-sm bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200">
          <h2 className="text-base font-bold text-gray-900 mb-3">如何增加股份？</h2>
          
          <div className="space-y-2.5">
            <div className="flex items-start space-x-2.5">
              <div className="w-5 h-5 rounded-full bg-[#A80000] text-white flex items-center justify-center flex-shrink-0 text-xs font-bold mt-0.5">1</div>
              <p className="text-sm text-gray-700">
                <span className="font-semibold">邀请新用户</span>
                <span className="text-gray-500"> — 每邀请1人 </span>
                <span className="text-[#A80000] font-bold">+0.05%</span>
              </p>
            </div>
            <div className="flex items-start space-x-2.5">
              <div className="w-5 h-5 rounded-full bg-[#A80000] text-white flex items-center justify-center flex-shrink-0 text-xs font-bold mt-0.5">2</div>
              <p className="text-sm text-gray-700">
                <span className="font-semibold">帮助被邀请人发展人脉</span>
                <span className="text-gray-500"> — 每增加100人脉 </span>
                <span className="text-[#A80000] font-bold">+0.02%</span>
              </p>
            </div>
            <div className="flex items-start space-x-2.5">
              <div className="w-5 h-5 rounded-full bg-[#A80000] text-white flex items-center justify-center flex-shrink-0 text-xs font-bold mt-0.5">3</div>
              <p className="text-sm text-gray-700">
                <span className="font-semibold">增加投资</span>
                <span className="text-gray-500"> — 提升在投资股份池中的占比</span>
              </p>
            </div>
          </div>

          <Link href="/parent/profile/invite">
            <button className="w-full mt-3 bg-[#A80000] text-white py-2.5 rounded-xl font-semibold hover:bg-[#8a0000] transition-colors text-sm">
              立即邀请好友
            </button>
          </Link>
        </Card>

        {/* 在线签署协议入口 */}
        <Card
          className="p-4 rounded-2xl shadow-sm border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => toast.info("需要更高权限")}
        >
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#A80000] to-[#c44] flex items-center justify-center flex-shrink-0">
              <FileSignature className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900 text-sm">在线签署股权投资协议</h3>
              <p className="text-xs text-gray-500">电子签章，具有法律效力</p>
            </div>
            <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </Card>

        {/* 股权架构说明 */}
        <Card className="rounded-2xl shadow-sm overflow-hidden">
          <button
            className="w-full p-4 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
            onClick={() => toast.info("需要更高权限")}
          >
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
                <Building2 className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 text-sm">股权架构说明</h3>
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
            <div className="px-4 pb-4 border-t border-gray-100">
              <div className="mt-3 space-y-2">
                <div className="bg-gradient-to-r from-[#A80000] to-[#c44] text-white rounded-xl p-3 text-center">
                  <p className="text-xs opacity-80">经营主体</p>
                  <p className="font-bold text-sm">上海蓄水池企业管理有限公司</p>
                </div>

                <div className="flex justify-center">
                  <div className="flex flex-col items-center">
                    <div className="w-0.5 h-3 bg-gray-300"></div>
                    <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">持股</span>
                    <div className="w-0.5 h-3 bg-gray-300"></div>
                  </div>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-center">
                  <p className="text-xs text-blue-600">投资主体（有限合伙企业）</p>
                  <p className="font-bold text-gray-900 text-sm">全体投资股东</p>
                  <p className="text-xs text-gray-500 mt-0.5">以有限合伙形式持有经营主体股权</p>
                </div>

                <div className="flex justify-center">
                  <div className="flex flex-col items-center">
                    <div className="w-0.5 h-3 bg-gray-300"></div>
                    <div className="flex items-center space-x-1">
                      <GitBranch className="w-3 h-3 text-gray-400" />
                      <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">合伙人</span>
                    </div>
                    <div className="w-0.5 h-3 bg-gray-300"></div>
                  </div>
                </div>

                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
                  <p className="text-xs text-amber-600">有限合伙人（LP）</p>
                  <p className="font-bold text-gray-900 text-sm">各位投资股东</p>
                  <p className="text-xs text-gray-500 mt-0.5">按投资额和贡献值分配合伙份额</p>
                </div>
              </div>

              <div className="mt-3 bg-gray-50 rounded-lg p-3 space-y-1.5">
                <p className="text-xs text-gray-600 leading-relaxed">
                  <span className="font-semibold text-gray-800">架构说明：</span>
                  所有投资股东以有限合伙人（LP）身份加入有限合伙企业，再由该有限合伙企业持有
                  <span className="font-semibold">上海蓄水池企业管理有限公司</span>的股权。
                </p>
                <p className="text-xs text-gray-600 leading-relaxed">
                  股份由多个股份池构成，各池比例由管理员在后台配置。
                </p>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
