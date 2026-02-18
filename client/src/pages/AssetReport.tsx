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
        className="flex items-center px-4 py-2.5 cursor-pointer active:bg-gray-50 transition-colors"
        onClick={onToggle}
      >
        {/* 左侧序号 */}
        <div className={`w-8 text-xl font-bold ${getNumberColor(index)} flex-shrink-0`}>
          {index + 1}
        </div>
        
        {/* 中间标题 */}
        <div className="flex-1 px-3">
          <span className="text-gray-900 text-sm">{item.title}</span>
        </div>
        
        {/* 右侧：标签 + 箭头 */}
        <div className="flex items-center space-x-2 flex-shrink-0">
          {item.tag && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${getTagColor(item.tag)}`}>
              {item.tag}
            </span>
          )}
          <ChevronDown 
            className={`w-4 h-4 text-gray-400 transition-transform duration-300 ${
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
      title: "你的数据谁在赚钱？",
      tag: "热",
      content: (
        <div className="space-y-4">
          {/* 引言 */}
          <div className="text-sm text-gray-700 leading-relaxed">
            <p className="mb-3">
              在数字时代，我们每天使用各种App服务，却不知不觉中成了平台的"商品"。你付费消费的同时，你的每一次点击、购买和社交互动，都在暗中被标价——但这份数据价值，你一分钱也没拿到。
            </p>
            <p>
              以下通过三个真实收购案例，我们来算一笔账，看看你的数据到底价值几何。这些数据不是抽象的概念，而是直接转化为"收购价"的真实价值。
            </p>
          </div>

          {/* 案例1：买菜App */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="font-bold text-gray-900 mb-2">1. 买菜App：每个用户价值约700元</div>
            <div className="text-sm text-gray-700 leading-relaxed space-y-2">
              <p>
                以叮咚买菜和美团的并购案为例（50多亿人民币，最高活跃用户700万），美团收购这类社区电商时，看重的不是送货车队，而是用户背后的家庭消费数据——你买的每一颗白菜、每份食材，都记录了你的生活习惯和消费偏好。（<a href="https://finance.sina.cn/stock/jdts/2026-02-16/detail-inhmyzkh2857813.d.html" target="_blank" rel="noopener noreferrer" className="text-[#FF4500] text-xs">来源：新浪财经</a>）
              </p>
              <div className="flex items-start space-x-2 bg-white p-3 rounded">
                <span className="text-[#FF4500] font-bold flex-shrink-0">●</span>
                <div>
                  <span className="font-bold text-gray-900">算账：</span>
                  <span className="text-gray-700">根据收购总价和日活跃用户量折算，单个用户的"数据所有权"约值700元。你付费买菜的同时，还为平台贡献了宝贵数据，而平台转手就把这份数据变现了。你只拿到了白菜，平台却增加了身价。</span>
                </div>
              </div>
            </div>
          </div>

          {/* 案例2：共享出行 */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="font-bold text-gray-900 mb-2">2. 共享出行：180亿被平台独享</div>
            <div className="text-sm text-gray-700 leading-relaxed space-y-2">
              <p>
                摩拜单车被美团180亿人民币收购时，核心资产是用户的出行轨迹——你住在哪个小区、上班去哪里、日常路径如何。这些数据能生成"城市交通热力图"，用于广告精准投放或城市规划。（<a href="http://tech.sina.cn/zt_d/mobikemeituan" target="_blank" rel="noopener noreferrer" className="text-[#FF4500] text-xs">来源：新浪科技</a>）
              </p>
              <div className="flex items-start space-x-2 bg-white p-3 rounded">
                <span className="text-[#FF4500] font-bold flex-shrink-0">●</span>
                <div>
                  <span className="font-bold text-gray-900">算账：</span>
                  <span className="text-gray-700">你每天顶着太阳骑车，其实是在用体力为平台采集数据，平台却独享180亿收益，而你什么也拿不到。</span>
                </div>
              </div>
            </div>
          </div>

          {/* 案例3：社交通讯 */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="font-bold text-gray-900 mb-2">3. 社交/通讯工具：每个用户价值约280元</div>
            <div className="text-sm text-gray-700 leading-relaxed space-y-2">
              <p>
                参考Facebook（现Meta）以190亿美元收购WhatsApp的案例。这是一个纯通讯软件，没有广告收入，为什么值这么多钱？因为里面藏着数亿用户的社交关系网——你的联系人、聊天频率，都能被用于算法优化和广告。（<a href="http://tech.sina.com.cn/i/2014-02-20/06389176473.shtml" target="_blank" rel="noopener noreferrer" className="text-[#FF4500] text-xs">来源：新浪科技</a>）
              </p>
              <div className="flex items-start space-x-2 bg-white p-3 rounded">
                <span className="text-[#FF4500] font-bold flex-shrink-0">●</span>
                <div>
                  <span className="font-bold text-gray-900">算账：</span>
                  <span className="text-gray-700">折算下来，每个用户只需"呆在里面"，就值约40美元（折合人民币280元）。你的社交数据被平台垄断，你却一无所获。</span>
                </div>
              </div>
            </div>
          </div>

          {/* 脉动方案 */}
          <div className="bg-[#800000] p-4 rounded-lg">
            <div className="font-bold text-white mb-3">脉动平台的共赢方案：从被动到主动收益</div>
            <div className="text-sm text-white/90 leading-relaxed space-y-3">
              <p>
                在脉动，我们打破了传统互联网的"数据霸权"。你的数据值钱，这不该由平台独吞。我们主张好友人脉的共享，通过用户互动，实现共赢：
              </p>
              <div className="space-y-2">
                <div className="flex items-start space-x-2">
                  <span className="text-[#FFA500] font-bold flex-shrink-0">●</span>
                  <div>
                    <span className="font-bold text-white">传统平台：</span>
                    <span className="text-white/90">你贡献数据，平台卖钱，你得0元。</span>
                  </div>
                </div>
                <div className="flex items-start space-x-2">
                  <span className="text-[#FFA500] font-bold flex-shrink-0">●</span>
                  <div>
                    <span className="font-bold text-white">脉动平台：</span>
                    <span className="text-white/90">你维护人脉、积极共享，平台通过AI算法将数据溢价转化为直接价值，直接返还给你。</span>
                  </div>
                </div>
              </div>
              <p className="pt-2 border-t border-white/20">
                在脉动，你不是在为别人创造价值，而是在经营自己的"人脉资产包"。每一次点击联络，都是在为你的资产"除尘"和"增值"。加入脉动，掌握你的数据主权，从"被售卖"转向"主动变现"。
              </p>
            </div>
          </div>

          {/* 海报展示 */}
          <div className="bg-gray-50 p-4 rounded-lg mt-4">
            <div className="font-bold text-gray-900 mb-3 text-center">分享海报</div>
            <div className="space-y-2">
              <img 
                src="https://files.manuscdn.com/user_upload_by_module/session_file/310519663346422697/rtosbfhixyHXlIjl.jpg" 
                alt="你的数据谁在赚钱海报" 
                className="w-full rounded-lg shadow-md"
              />
              <p className="text-sm text-gray-500 text-center">长按保存海报</p>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 2,
      title: "价值对标：为什么现在是最佳入场时机？",
      tag: "新",
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
      id: 3,
      title: "股价增值原理：您的资产如何持续升值？",
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
      id: 4,
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
      id: 5,
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
