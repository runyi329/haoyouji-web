import { Card } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { Loader2, TrendingUp, Shield, Lock, ArrowLeft } from "lucide-react";
import { Link } from "wouter";

const BASE_URL = "https://www.jiangyuchen.cn";

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
      {/* 返回按钮 */}
      <div className="fixed top-4 left-4 z-50">
        <Link href={BASE_URL}>
          <a className="flex items-center space-x-2 bg-white px-4 py-2 rounded-lg shadow-md hover:shadow-lg transition-shadow">
            <ArrowLeft className="w-5 h-5 text-[#800000]" />
            <span className="text-[#800000] font-medium">返回首页</span>
          </a>
        </Link>
      </div>

      {/* 顶部：红区（Red Zone） */}
      <div className="bg-gradient-to-br from-[#800000] to-[#A80000] text-white px-6 pt-16 pb-12 rounded-b-[30px]">
        <div className="text-center space-y-4">
          {/* 主标题 */}
          <h1 className="text-2xl font-bold">
            全国熟人信任资产估值
          </h1>
          
          {/* 核心数字（动态心跳感） */}
          <div className="text-6xl font-bold animate-pulse">
            {totalNodes.toLocaleString()}
          </div>
          
          {/* 副标题 */}
          <p className="text-lg text-white/90">
            当前全平台有效信任节点总数
          </p>
          
          {/* 小字说明 */}
          <p className="text-sm text-white/70 mt-4">
            每一个节点，都是在为全平台的股价注资
          </p>
        </div>
      </div>

      {/* 中部：白区卡片一（对标逻辑） */}
      <div className="px-6 mt-6">
        <Card className="p-6 shadow-lg">
          <h2 className="text-xl font-bold text-gray-900 mb-4">
            为什么您的"熟人信任节点"更具增值潜力？
          </h2>
          
          {/* 对标表格 */}
          <div className="space-y-3">
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
          
          {/* 包装话术 */}
          <div className="mt-6 space-y-3 text-sm">
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
        </Card>
      </div>

      {/* 中部：白区卡片二（股价公式） */}
      <div className="px-6 mt-6">
        <Card className="p-6 shadow-lg">
          <h2 className="text-xl font-bold text-gray-900 mb-4">
            股价判定与增值原理
          </h2>
          
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
                <TrendingUp className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="font-bold text-gray-900 mb-1">数据资产化</div>
                <div className="text-sm text-gray-700">
                  每录入一条熟人数据，分子（资产总量）即刻增长。
                </div>
              </div>
            </div>
            
            <div className="flex items-start space-x-3">
              <div className="w-8 h-8 rounded-full bg-[#800000] flex items-center justify-center flex-shrink-0">
                <Shield className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="font-bold text-gray-900 mb-1">保护机制</div>
                <div className="text-sm text-gray-700">
                  总资产增长速度（指数级）远超股数发行速度（线性）。
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
                  只要全国人脉在增加，您的股价就在单边上扬。
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* 底部：白区卡片三（确权保障） */}
      <div className="px-6 mt-6 mb-8">
        <Card className="p-6 shadow-lg">
          <h2 className="text-xl font-bold text-gray-900 mb-4">
            确权保障机制
          </h2>
          
          <div className="space-y-4">
            <div className="flex items-start space-x-3">
              <span className="text-[#C5B358] text-2xl font-bold">●</span>
              <div>
                <div className="font-bold text-gray-900">每周定格</div>
                <div className="text-sm text-gray-700">
                  每周一结算最新股价，确保资产透明。
                </div>
              </div>
            </div>
            
            <div className="flex items-start space-x-3">
              <span className="text-[#C5B358] text-2xl font-bold">●</span>
              <div>
                <div className="font-bold text-gray-900">永久记录</div>
                <div className="text-sm text-gray-700">
                  所有确权股数均记录于数字档案，不可篡改。
                </div>
              </div>
            </div>
            
            <div className="flex items-start space-x-3">
              <span className="text-[#C5B358] text-2xl font-bold">●</span>
              <div>
                <div className="font-bold text-gray-900">价值流转</div>
                <div className="text-sm text-gray-700">
                  分红、回购、转换，全凭确权股数。
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
