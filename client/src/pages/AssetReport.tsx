import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Loader2, ChevronDown, ArrowLeft } from "lucide-react";
import { Link } from "wouter";

const BASE_URL = "https://www.jiangyuchen.cn";

// 列表项数据类型
interface ListItem {
  id: number;
  title: string;
  tag?: string; // 可选标签：热、新等
  content: React.ReactNode;
}

// 列表项组件（新浪热榜风格）
function ListItem({ 
  item, 
  index,
  isExpanded,
  onToggle
}: { 
  item: ListItem;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  // 序号颜色：前3名使用渐变色，其他使用灰色
  const getNumberColor = (idx: number) => {
    if (idx === 0) return "text-[#FF4500]"; // 第1名：橙红色
    if (idx === 1) return "text-[#FF6347]"; // 第2名：番茄红
    if (idx === 2) return "text-[#FFA500]"; // 第3名：橙色
    return "text-gray-400"; // 其他：灰色
  };

  // 标签颜色
  const getTagColor = (tag?: string) => {
    if (tag === "热") return "bg-[#FF4500] text-white";
    if (tag === "新") return "bg-[#FFA500] text-white";
    return "bg-gray-200 text-gray-600";
  };

  return (
    <div className="bg-white">
      {/* 列表项头部 - 始终可见 */}
      <div 
        className="flex items-center px-4 py-4 cursor-pointer active:bg-gray-50 transition-colors"
        onClick={onToggle}
      >
        {/* 左侧序号 */}
        <div className={`w-8 text-xl font-bold ${getNumberColor(index)} flex-shrink-0`}>
          {index + 1}
        </div>
        
        {/* 中间标题 */}
        <div className="flex-1 px-3">
          <span className="text-gray-900 text-base">{item.title}</span>
        </div>
        
        {/* 右侧：标签 + 箭头 */}
        <div className="flex items-center space-x-2 flex-shrink-0">
          {item.tag && (
            <span className={`text-xs px-2 py-0.5 rounded ${getTagColor(item.tag)}`}>
              {item.tag}
            </span>
          )}
          <ChevronDown 
            className={`w-5 h-5 text-gray-400 transition-transform duration-300 ${
              isExpanded ? 'rotate-180' : ''
            }`} 
          />
        </div>
      </div>
      
      {/* 展开内容 */}
      {isExpanded && (
        <div className="px-4 pb-4 border-t border-gray-100">
          <div className="pt-4">
            {item.content}
          </div>
        </div>
      )}
      
      {/* 分割线 */}
      <div className="border-b border-gray-100" />
    </div>
  );
}

export default function AssetReport() {
  const { data: stats, isLoading } = trpc.contacts.stats.useQuery();
  const [expandedId, setExpandedId] = useState<number | null>(null);
  
  // 模拟全国节点总数（实际应从后端获取）
  const totalNodes = 1280520;
  
  // 对标价值（每人）
  const benchmarkValue = 100;

  // 列表数据
  const listItems: ListItem[] = [
    {
      id: 1,
      title: "价值对标：为什么现在是最佳入场时机？",
      tag: "热",
      content: (
        <div className="space-y-4">
          {/* 对标表格 */}
          <div className="space-y-3">
            {/* 叮咚买菜 */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="flex justify-between items-center mb-2">
                <span className="font-bold text-gray-900">叮咚买菜</span>
                <span className="text-gray-500 text-lg font-bold">≈ ¥714/人</span>
              </div>
              <div className="text-sm text-gray-600">
                约50亿估值 / 700万用户 · 基础消费流转
              </div>
            </div>
            
            {/* LinkedIn */}
            <div className="bg-gray-50 p-4 rounded-lg">
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
                  <span className="text-[#FFA500] text-2xl font-bold">¥{benchmarkValue}/人</span>
                  <span className="bg-[#FFA500] text-[#800000] text-xs px-2 py-1 rounded font-bold">
                    极度低估
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
              <span className="text-[#FF4500] font-bold">●</span>
              <div>
                <span className="font-bold text-gray-900">降维打击：</span>
                <span className="text-gray-700">"买菜"只是单次的消费行为，而"熟人"是长期的信用资产。</span>
              </div>
            </div>
            <div className="flex items-start space-x-2">
              <span className="text-[#FF4500] font-bold">●</span>
              <div>
                <span className="font-bold text-gray-900">价值低估：</span>
                <span className="text-gray-700">相比生鲜电商 ¥700+ 的估值，我们仅以其 1/7 的保守价值起步。</span>
              </div>
            </div>
            <div className="flex items-start space-x-2">
              <span className="text-[#FF4500] font-bold">●</span>
              <div>
                <span className="font-bold text-gray-900">增值逻辑：</span>
                <span className="text-gray-700">每一个被打上标签的熟人节点，其商业变现能力是普通消费者的 10 倍以上。</span>
              </div>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 2,
      title: "股价增值原理：您的资产如何持续升值？",
      tag: "新",
      content: (
        <div className="space-y-4">
          {/* 公式展示 */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="text-center">
              <div className="text-sm text-gray-600 mb-2">股价计算公式</div>
              <div className="text-sm font-mono">
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
          <div className="space-y-3 text-sm">
            <div className="flex items-start space-x-2">
              <div className="w-6 h-6 rounded-full bg-[#800000] flex items-center justify-center flex-shrink-0">
                <span className="text-white text-xs font-bold">1</span>
              </div>
              <div>
                <div className="font-bold text-gray-900 mb-1">数据资产化</div>
                <div className="text-gray-700">
                  每录入一条熟人数据，分子（资产总量）即刻增长。
                </div>
              </div>
            </div>
            
            <div className="flex items-start space-x-2">
              <div className="w-6 h-6 rounded-full bg-[#800000] flex items-center justify-center flex-shrink-0">
                <span className="text-white text-xs font-bold">2</span>
              </div>
              <div>
                <div className="font-bold text-gray-900 mb-1">保护机制</div>
                <div className="text-gray-700">
                  总资产增长速度（指数级）远超股数发行速度（线性），股价自然上涨。
                </div>
              </div>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 3,
      title: "确权保障：您的资产如何得到保护？",
      content: (
        <div className="space-y-3 text-sm">
          <div className="flex items-start space-x-2">
            <span className="text-[#FF4500] text-lg font-bold">●</span>
            <div>
              <div className="font-bold text-gray-900 mb-1">每周定格</div>
              <div className="text-gray-700">
                每周一结算最新股价，确保资产透明。
              </div>
            </div>
          </div>
          
          <div className="flex items-start space-x-2">
            <span className="text-[#FF4500] text-lg font-bold">●</span>
            <div>
              <div className="font-bold text-gray-900 mb-1">永久记录</div>
              <div className="text-gray-700">
                所有确权股数均记录于数字档案，不可篡改。
              </div>
            </div>
          </div>
          
          <div className="flex items-start space-x-2">
            <span className="text-[#FF4500] text-lg font-bold">●</span>
            <div>
              <div className="font-bold text-gray-900 mb-1">价值流转</div>
              <div className="text-gray-700">
                未来支持股权转让、质押等金融操作。
              </div>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 4,
      title: "立即行动：如何开始迁移数据？",
      content: (
        <div className="space-y-4">
          <div className="space-y-3 text-sm">
            <div className="flex items-start space-x-2">
              <div className="w-6 h-6 rounded-full bg-gray-300 flex items-center justify-center flex-shrink-0">
                <span className="text-white text-xs font-bold">1</span>
              </div>
              <div>
                <div className="font-bold text-gray-900">导入通讯录</div>
                <div className="text-gray-700">一键导入，自动识别</div>
              </div>
            </div>
            
            <div className="flex items-start space-x-2">
              <div className="w-6 h-6 rounded-full bg-gray-300 flex items-center justify-center flex-shrink-0">
                <span className="text-white text-xs font-bold">2</span>
              </div>
              <div>
                <div className="font-bold text-gray-900">标注关系</div>
                <div className="text-gray-700">添加标签，完善信息</div>
              </div>
            </div>
            
            <div className="flex items-start space-x-2">
              <div className="w-6 h-6 rounded-full bg-[#FFA500] flex items-center justify-center flex-shrink-0">
                <span className="text-white text-xs font-bold">3</span>
              </div>
              <div>
                <div className="font-bold text-[#800000]">确权获得股权</div>
                <div className="text-gray-700">立即享受资产增值</div>
              </div>
            </div>
          </div>
          
          {/* CTA按钮 */}
          <Link href={BASE_URL}>
            <a className="block w-full bg-gradient-to-r from-[#800000] to-[#A80000] text-white text-center py-3 rounded-lg font-bold hover:shadow-lg transition-shadow">
              立即开始迁移数据
            </a>
          </Link>
        </div>
      )
    }
  ];

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
        {/* 返回按钮 */}
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
          
          {/* 核心数字 */}
          <div className="text-5xl font-bold">
            {totalNodes.toLocaleString()}
          </div>
          
          {/* 副标题 */}
          <p className="text-base text-white/90">
            全国有效信任节点总数
          </p>
          
          {/* 核心价值主张 */}
          <div className="mt-4 text-sm text-white/90">
            <p>
              每一个节点都在为全平台的股价注资
            </p>
          </div>
        </div>
      </div>

      {/* 中部：列表区域（新浪热榜风格） */}
      <div className="mt-6">
        {listItems.map((item, index) => (
          <ListItem
            key={item.id}
            item={item}
            index={index}
            isExpanded={expandedId === item.id}
            onToggle={() => setExpandedId(expandedId === item.id ? null : item.id)}
          />
        ))}
      </div>
    </div>
  );
}
