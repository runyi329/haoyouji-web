import { useState } from "react";
import { Card } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { Loader2, ChevronDown, ChevronUp, TrendingUp, Shield, Lock, ArrowLeft } from "lucide-react";
import { Link } from "wouter";

const BASE_URL = "https://www.jiangyuchen.cn";

// 可展开卡片组件
function ExpandableCard({ 
  title, 
  summary, 
  icon, 
  children, 
  defaultExpanded = false 
}: { 
  title: string; 
  summary: string; 
  icon: React.ReactNode; 
  children: React.ReactNode;
  defaultExpanded?: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <Card className="shadow-lg overflow-hidden">
      {/* 卡片头部 - 始终可见 */}
      <div 
        className="p-6 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-start space-x-4 flex-1">
            {/* 图标 */}
            <div className="w-12 h-12 rounded-full bg-[#800000] flex items-center justify-center flex-shrink-0">
              {icon}
            </div>
            
            {/* 标题和摘要 */}
            <div className="flex-1">
              <h3 className="text-lg font-bold text-gray-900 mb-2">{title}</h3>
              <p className="text-sm text-gray-600">{summary}</p>
            </div>
          </div>
          
          {/* 展开/收起图标 */}
          <div className="ml-4 flex-shrink-0">
            {isExpanded ? (
              <ChevronUp className="w-6 h-6 text-[#800000]" />
            ) : (
              <ChevronDown className="w-6 h-6 text-gray-400" />
            )}
          </div>
        </div>
      </div>
      
      {/* 展开内容 */}
      {isExpanded && (
        <div className="px-6 pb-6 border-t border-gray-100">
          <div className="pt-6">
            {children}
          </div>
        </div>
      )}
    </Card>
  );
}

export default function AssetReport() {
  const { data: stats, isLoading } = trpc.contacts.stats.useQuery();
  
  // 模拟全国节点总数（实际应从后端获取）
  const totalNodes = 1280520;
  
  // 对标价值（每人）
  const benchmarkValue = 100;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#800000]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* 顶部：红区（Red Zone） - 核心价值主张 */}
      <div className="bg-gradient-to-br from-[#800000] to-[#A80000] text-white px-6 pt-6 pb-12 rounded-b-[30px] relative">
        {/* 返回按钮 - 固定在红色区域内 */}
        <Link href={BASE_URL}>
          <a className="flex items-center space-x-1 text-white/90 hover:text-white transition-colors mb-6">
            <ArrowLeft className="w-5 h-5" />
            <span className="font-medium">返回</span>
          </a>
        </Link>
        <div className="text-center space-y-4">
          {/* 主标题 */}
          <h1 className="text-2xl font-bold">
            为什么要把人脉数据迁移到这里？
          </h1>
          
          {/* 核心数字（动态心跳感） */}
          <div className="text-6xl font-bold animate-pulse">
            {totalNodes.toLocaleString()}
          </div>
          
          {/* 副标题 */}
          <p className="text-lg text-white/90">
            全国有效信任节点总数
          </p>
          
          {/* 核心价值主张 */}
          <div className="mt-6 space-y-2 text-sm text-white/90">
            <p className="text-base font-semibold text-white">
              每一个节点都在为全平台的股价注资
            </p>
            <p>
              您的人脉不再是通讯录里的"死数据"，而是可增值的"信任资产"
            </p>
            <p>
              越早迁移，越早确权，越早享受资产增值红利
            </p>
          </div>
        </div>
      </div>

      {/* 中部：可展开卡片区域 */}
      <div className="px-6 mt-6 space-y-4">
        {/* 卡片1：价值对标 - 默认展开 */}
        <ExpandableCard
          title="价值对标：为什么现在是最佳入场时机？"
          summary="相比叮咚买菜¥714/人、LinkedIn¥450/人，我们仅以¥100/人起步，极度低估"
          icon={<TrendingUp className="w-6 h-6 text-white" />}
          defaultExpanded={true}
        >
          {/* 对标表格 */}
          <div className="space-y-3 mb-6">
            {/* 叮咚买菜 */}
            <div className="bg-gray-100 p-4 rounded-lg">
              <div className="flex justify-between items-center mb-2">
                <span className="font-bold text-gray-900">叮咚买菜</span>
                <span className="text-gray-500 text-lg font-bold">≈ ¥714/人</span>
              </div>
              <div className="text-sm text-gray-600">
                约50亿估值 / 700万用户 · 基础消费流转
              </div>
            </div>
            
            {/* LinkedIn */}
            <div className="bg-gray-100 p-4 rounded-lg">
              <div className="flex justify-between items-center mb-2">
                <span className="font-bold text-gray-900">LinkedIn</span>
                <span className="text-gray-500 text-lg font-bold">≈ ¥450/人</span>
              </div>
              <div className="text-sm text-gray-600">
                262亿美元收购 / 4亿用户 · 职场社交关系
              </div>
            </div>
            
            {/* 本平台 */}
            <div className="bg-[#800000] p-4 rounded-lg relative">
              <div className="flex justify-between items-center mb-2">
                <span className="font-bold text-white">本平台</span>
                <div className="flex items-center space-x-2">
                  <span className="text-[#C5B358] text-2xl font-bold">¥{benchmarkValue}/人</span>
                  <span className="bg-[#C5B358] text-[#800000] text-xs px-2 py-1 rounded font-bold">
                    极度低估·建议入场
                  </span>
                </div>
              </div>
              <div className="text-sm text-white/90">
                全国强信任关系网络 · 高转化熟人节点
              </div>
            </div>
          </div>
          
          {/* 核心逻辑 */}
          <div className="space-y-3 text-sm">
            <div className="flex items-start space-x-2">
              <span className="text-[#C5B358] font-bold">●</span>
              <div>
                <span className="font-bold text-gray-900">降维打击：</span>
                <span className="text-gray-700">"买菜"只是单次的消费行为，而"熟人"是长期的信用资产。</span>
              </div>
            </div>
            <div className="flex items-start space-x-2">
              <span className="text-[#C5B358] font-bold">●</span>
              <div>
                <span className="font-bold text-gray-900">价值低估：</span>
                <span className="text-gray-700">相比生鲜电商 ¥700+ 的估值，我们仅以其 1/7 的保守价值起步。</span>
              </div>
            </div>
            <div className="flex items-start space-x-2">
              <span className="text-[#C5B358] font-bold">●</span>
              <div>
                <span className="font-bold text-gray-900">增值逻辑：</span>
                <span className="text-gray-700">每一个被打上标签（如：高净值、决策者、技术专家）的熟人节点，其商业变现能力是普通消费者的 10 倍以上。</span>
              </div>
            </div>
          </div>
          
          {/* 霸气回应 */}
          <div className="mt-6 bg-[#FFF9E6] border-l-4 border-[#C5B358] p-4 rounded">
            <p className="text-sm text-gray-800 italic">
              "这就是我们的<span className="font-bold text-[#800000]">估值红利期</span>。叮咚买菜那是已经上市或者被收购后的'透支价'。我们现在定 ¥100，是给咱们早期合伙人留出了 <span className="font-bold text-[#800000]">7倍甚至10倍的翻盘空间</span>。等平台全国节点过千万的时候，每一个节点的商业租金和撮合价值，绝对不止这几百块。"
            </p>
          </div>
        </ExpandableCard>

        {/* 卡片2：股价增值原理 */}
        <ExpandableCard
          title="股价增值原理：您的资产如何持续升值？"
          summary="数据资产化 + 指数级增长 = 股价单边上扬"
          icon={<TrendingUp className="w-6 h-6 text-white" />}
        >
          {/* 公式展示 */}
          <div className="bg-gray-50 p-6 rounded-lg mb-6">
            <div className="text-center">
              <div className="text-sm text-gray-600 mb-2">股价计算公式</div>
              <div className="text-lg font-mono">
                <span className="text-gray-900">股价 = </span>
                <span className="text-[#800000] font-bold">
                  (全国资产总量 + 现金储备)
                </span>
                <span className="text-gray-900"> / </span>
                <span className="text-[#800000] font-bold">
                  已发行确权股总数
                </span>
              </div>
            </div>
          </div>
          
          {/* 核心解释 */}
          <div className="space-y-4">
            <div className="flex items-start space-x-3">
              <div className="w-8 h-8 rounded-full bg-[#800000] flex items-center justify-center flex-shrink-0">
                <span className="text-white font-bold">1</span>
              </div>
              <div>
                <div className="font-bold text-gray-900 mb-1">数据资产化</div>
                <div className="text-sm text-gray-700">
                  每录入一条熟人数据，分子（资产总量）即刻增长。您的每一个人脉节点，都在为全平台的资产池注资。
                </div>
              </div>
            </div>
            
            <div className="flex items-start space-x-3">
              <div className="w-8 h-8 rounded-full bg-[#800000] flex items-center justify-center flex-shrink-0">
                <span className="text-white font-bold">2</span>
              </div>
              <div>
                <div className="font-bold text-gray-900 mb-1">保护机制</div>
                <div className="text-sm text-gray-700">
                  总资产增长速度（指数级）远超股数发行速度（线性）。这意味着分子增长快，分母增长慢，股价自然上涨。
                </div>
              </div>
            </div>
            
            <div className="flex items-start space-x-3">
              <div className="w-8 h-8 rounded-full bg-[#C5B358] flex items-center justify-center flex-shrink-0">
                <span className="text-white font-bold text-lg">✓</span>
              </div>
              <div>
                <div className="font-bold text-[#800000] mb-1">结论</div>
                <div className="text-sm text-gray-700">
                  只要全国人脉在增加，您的股价就在单边上扬。早期入场者，享受最大增值红利。
                </div>
              </div>
            </div>
          </div>
        </ExpandableCard>

        {/* 卡片3：确权保障机制 */}
        <ExpandableCard
          title="确权保障：您的资产如何得到保护？"
          summary="每周定格股价 + 永久数字档案 + 价值流转保障"
          icon={<Shield className="w-6 h-6 text-white" />}
        >
          <div className="space-y-4">
            <div className="flex items-start space-x-3">
              <span className="text-[#C5B358] text-2xl font-bold">●</span>
              <div>
                <div className="font-bold text-gray-900 mb-1">每周定格</div>
                <div className="text-sm text-gray-700">
                  每周一结算最新股价，确保资产透明。您可以随时查看自己的股权价值变化。
                </div>
              </div>
            </div>
            
            <div className="flex items-start space-x-3">
              <span className="text-[#C5B358] text-2xl font-bold">●</span>
              <div>
                <div className="font-bold text-gray-900 mb-1">永久记录</div>
                <div className="text-sm text-gray-700">
                  所有确权股数均记录于数字档案，不可篡改。您的贡献和权益，永久保存。
                </div>
              </div>
            </div>
            
            <div className="flex items-start space-x-3">
              <span className="text-[#C5B358] text-2xl font-bold">●</span>
              <div>
                <div className="font-bold text-gray-900 mb-1">价值流转</div>
                <div className="text-sm text-gray-700">
                  分红、回购、转换，全凭确权股数。您的资产可以真正流转变现。
                </div>
              </div>
            </div>
          </div>
          
          {/* 安全提示 */}
          <div className="mt-6 bg-green-50 border-l-4 border-green-500 p-4 rounded">
            <p className="text-sm text-gray-800">
              <span className="font-bold text-green-700">安全承诺：</span>
              您的人脉数据仅用于资产确权和价值计算，绝不对外泄露或出售。我们采用银行级加密技术保护您的隐私。
            </p>
          </div>
        </ExpandableCard>

        {/* 卡片4：立即行动 */}
        <ExpandableCard
          title="立即行动：如何开始迁移数据？"
          summary="三步完成迁移，立即开始享受资产增值"
          icon={<Lock className="w-6 h-6 text-white" />}
        >
          <div className="space-y-4">
            <div className="flex items-start space-x-3">
              <div className="w-8 h-8 rounded-full bg-[#800000] flex items-center justify-center flex-shrink-0">
                <span className="text-white font-bold">1</span>
              </div>
              <div>
                <div className="font-bold text-gray-900 mb-1">导入人脉数据</div>
                <div className="text-sm text-gray-700">
                  支持从微信、通讯录、Excel等多种方式导入。一键批量导入，省时省力。
                </div>
              </div>
            </div>
            
            <div className="flex items-start space-x-3">
              <div className="w-8 h-8 rounded-full bg-[#800000] flex items-center justify-center flex-shrink-0">
                <span className="text-white font-bold">2</span>
              </div>
              <div>
                <div className="font-bold text-gray-900 mb-1">标签化管理</div>
                <div className="text-sm text-gray-700">
                  为您的人脉打上标签（行业、职位、资源等），提升节点价值。
                </div>
              </div>
            </div>
            
            <div className="flex items-start space-x-3">
              <div className="w-8 h-8 rounded-full bg-[#C5B358] flex items-center justify-center flex-shrink-0">
                <span className="text-white font-bold">3</span>
              </div>
              <div>
                <div className="font-bold text-gray-900 mb-1">确权获得股权</div>
                <div className="text-sm text-gray-700">
                  系统自动计算您的贡献值，发放对应的确权股。开始享受资产增值。
                </div>
              </div>
            </div>
          </div>
          
          {/* CTA按钮 */}
          <div className="mt-6">
            <Link href={`${BASE_URL}/contacts`}>
              <a className="block w-full bg-gradient-to-r from-[#800000] to-[#A80000] text-white text-center py-4 rounded-lg font-bold text-lg hover:shadow-lg transition-shadow">
                立即开始迁移数据 →
              </a>
            </Link>
          </div>
        </ExpandableCard>
      </div>

      {/* 底部提示 */}
      <div className="px-6 mt-6 mb-8">
        <div className="bg-white p-6 rounded-lg shadow-md text-center">
          <p className="text-sm text-gray-600">
            点击上方卡片可展开查看详细说明
          </p>
          <p className="text-xs text-gray-500 mt-2">
            有疑问？联系客服：support@example.com
          </p>
        </div>
      </div>
    </div>
  );
}
