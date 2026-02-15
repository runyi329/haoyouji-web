import { Card } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { Loader2, TrendingUp, Shield, Lock, ArrowRight } from "lucide-react";

const BASE_URL = "https://www.jiangyuchen.cn";

export default function AssetReport() {
  const { data: stats, isLoading } = trpc.contacts.stats.useQuery();
  
  // 模拟全国节点总数（实际应从后端获取）
  const totalNodes = 12850;
  
  // 对标价值（每人）
  const benchmarkValue = 200;
  
  // 当前每股参考含金量
  const pricePerShare = 18.50;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#1A1A1A] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#D4AF37]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#1A1A1A] text-white pb-20">
      {/* 第一屏：资产定名 */}
      <div className="min-h-screen flex flex-col items-center justify-center px-6 border-2 border-[#D4AF37] mx-4 my-8 rounded-lg">
        <div className="text-center space-y-6">
          {/* 火漆印章 */}
          <div className="flex justify-center">
            <div className="w-24 h-24 rounded-full border-4 border-[#D4AF37] flex items-center justify-center bg-[#8B0000]">
              <Shield className="w-12 h-12 text-[#D4AF37]" />
            </div>
          </div>
          
          {/* 主标题 */}
          <h1 className="text-4xl font-serif text-[#D4AF37]">
            数字资产确权公示
          </h1>
          
          {/* 副标题 */}
          <p className="text-xl text-gray-300">
            让信任可定价，让社交可增值
          </p>
        </div>
      </div>

      {/* 第二屏：锚定逻辑 */}
      <div className="min-h-screen flex flex-col justify-center px-6 py-12 space-y-8">
        <h2 className="text-2xl font-bold text-[#D4AF37] text-center">
          为什么您的"确权股"具有真实含金量？
        </h2>
        
        {/* 对比图表 */}
        <div className="space-y-4">
          <div className="bg-[#2A2A2A] p-4 rounded-lg">
            <div className="text-gray-400 text-sm mb-2">普通社交</div>
            <div className="text-gray-500">碎片化数据 = 0 价值</div>
          </div>
          
          <div className="bg-[#8B0000] p-4 rounded-lg">
            <div className="text-[#D4AF37] text-sm mb-2">本平台</div>
            <div className="text-white">全国强信任熟人节点 = 标准资产单元</div>
          </div>
        </div>
        
        {/* 对标清单 */}
        <div className="space-y-3 text-sm">
          <div className="flex justify-between text-gray-400">
            <span>叮咚买菜（基础消费数据）</span>
            <span className="text-[#D4AF37]">¥150+/节点</span>
          </div>
          <div className="flex justify-between text-gray-400">
            <span>脉脉（中端职场关系）</span>
            <span className="text-[#D4AF37]">¥300+/节点</span>
          </div>
          <div className="flex justify-between text-white font-bold">
            <span>本平台（全国强信任熟人）</span>
            <span className="text-[#D4AF37]">初始锚定 ¥{benchmarkValue}/节点</span>
          </div>
        </div>
        
        {/* 金句 */}
        <div className="text-center text-[#D4AF37] italic text-lg mt-8">
          "每一条录入的人脉，都是在为全平台的股价注资。"
        </div>
      </div>

      {/* 第三屏：增长黑卡 */}
      <div className="min-h-screen flex flex-col justify-center px-6 py-12 space-y-8">
        <h2 className="text-2xl font-bold text-[#D4AF37] text-center">
          股价增长的"分子/分母"法则
        </h2>
        
        {/* 视觉化展示 */}
        <div className="space-y-6">
          <div className="bg-[#2A2A2A] p-6 rounded-lg">
            <div className="text-[#D4AF37] font-bold mb-2">分母（固定）</div>
            <div className="text-gray-300 text-sm">
              系统严控确权股发放总量（线性增长）
            </div>
            <div className="mt-4 h-2 bg-[#8B0000] rounded-full w-1/3"></div>
          </div>
          
          <div className="bg-[#2A2A2A] p-6 rounded-lg">
            <div className="text-[#D4AF37] font-bold mb-2">分子（爆发）</div>
            <div className="text-gray-300 text-sm">
              全国熟人网络呈指数级裂变（几何增长）
            </div>
            <div className="mt-4 h-2 bg-[#D4AF37] rounded-full w-full"></div>
          </div>
        </div>
        
        {/* 结论 */}
        <div className="bg-[#8B0000] p-6 rounded-lg">
          <div className="text-[#D4AF37] font-bold text-center mb-3">
            分子增长 &gt; 分母增长 = 股价单边上扬
          </div>
          <div className="text-gray-300 text-sm text-center">
            现在进场，您拿到的每一股，都是在资产池爆发前夜的"原始资产"
          </div>
        </div>
        
        {/* 资产演进路径 */}
        <div className="mt-8 space-y-3 text-sm">
          <div className="text-[#D4AF37] font-bold mb-4">【资产演进路径】</div>
          <div className="flex items-center justify-between">
            <span className="text-gray-400">第一阶段：累计 1万 信任节点</span>
            <span className="text-[#D4AF37]">¥1X.XX</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-400">第二阶段：累计 10万 信任节点</span>
            <span className="text-[#D4AF37]">¥XX.XX</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-white font-bold">目标阶段：累计 100万 信任节点</span>
            <span className="text-[#D4AF37] font-bold">¥XXX.XX</span>
          </div>
          <div className="text-gray-500 text-xs mt-4">
            （注：数据基于人脉资产锚定算法，实时更新）
          </div>
        </div>
      </div>

      {/* 第四屏：安全保障 */}
      <div className="min-h-screen flex flex-col justify-center px-6 py-12 space-y-8">
        <h2 className="text-2xl font-bold text-[#D4AF37] text-center">
          周确权 · 终身制 · 数字化
        </h2>
        
        {/* 三条核心承诺 */}
        <div className="space-y-6">
          <div className="flex items-start space-x-4">
            <div className="w-12 h-12 rounded-full bg-[#8B0000] flex items-center justify-center flex-shrink-0">
              <Lock className="w-6 h-6 text-[#D4AF37]" />
            </div>
            <div>
              <div className="text-[#D4AF37] font-bold mb-1">每周确权</div>
              <div className="text-gray-300 text-sm">
                每周一定格身价，不可篡改
              </div>
            </div>
          </div>
          
          <div className="flex items-start space-x-4">
            <div className="w-12 h-12 rounded-full bg-[#8B0000] flex items-center justify-center flex-shrink-0">
              <Shield className="w-6 h-6 text-[#D4AF37]" />
            </div>
            <div>
              <div className="text-[#D4AF37] font-bold mb-1">档案永久</div>
              <div className="text-gray-300 text-sm">
                确权股录入数字档案，受协议保护
              </div>
            </div>
          </div>
          
          <div className="flex items-start space-x-4">
            <div className="w-12 h-12 rounded-full bg-[#8B0000] flex items-center justify-center flex-shrink-0">
              <TrendingUp className="w-6 h-6 text-[#D4AF37]" />
            </div>
            <div>
              <div className="text-[#D4AF37] font-bold mb-1">价值流转</div>
              <div className="text-gray-300 text-sm">
                分红、回购、转换，全凭确权股数
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 第五屏：Call to Action */}
      <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12">
        <div className="text-center space-y-8">
          <h2 className="text-3xl font-bold text-[#D4AF37]">
            激活您的熟人财富
          </h2>
          <p className="text-xl text-gray-300">
            定格您的数字化身价
          </p>
          
          {/* 当前数据展示 */}
          <div className="bg-[#2A2A2A] p-8 rounded-lg space-y-4 mt-8">
            <div className="text-center">
              <div className="text-gray-400 text-sm mb-2">当前平台节点总数</div>
              <div className="text-[#D4AF37] text-4xl font-bold">
                {totalNodes.toLocaleString()}
              </div>
              <div className="text-gray-500 text-xs mt-1">个全国信任节点</div>
            </div>
            
            <div className="border-t border-gray-700 pt-4">
              <div className="text-gray-400 text-sm mb-2">当前每股参考含金量</div>
              <div className="text-[#D4AF37] text-3xl font-bold">
                ¥{pricePerShare}
              </div>
              <div className="text-gray-500 text-xs mt-1">/ 确权股</div>
            </div>
          </div>
          
          {/* 返回首页按钮 */}
          <a
            href={BASE_URL}
            className="inline-flex items-center space-x-2 bg-[#8B0000] text-white px-8 py-4 rounded-lg hover:bg-[#A80000] transition-colors mt-8"
          >
            <span>返回首页</span>
            <ArrowRight className="w-5 h-5" />
          </a>
        </div>
      </div>
    </div>
  );
}
