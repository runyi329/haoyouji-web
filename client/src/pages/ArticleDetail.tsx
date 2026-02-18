import React from "react";
import { useRoute, Link } from "wouter";
import { ArrowLeft, Share2, Check } from "lucide-react";

const BASE_URL = "https://www.jiangyuchen.cn";

// 文章数据（与AssetReport.tsx保持一致）
const articles = [
  {
    id: 1,
    title: "我们的数据谁在赚钱？",
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
              WhatsApp被Facebook以190亿美元收购时，核心价值在于用户的社交关系图谱——你和谁聊天、聊什么、何时聊。这些数据能用于精准广告投放。（<a href="https://tech.sina.cn/i/2014-02-20/detail-avxeafs7665815.d.html" target="_blank" rel="noopener noreferrer" className="text-[#FF4500] text-xs">来源：新浪科技</a>）
            </p>
            <div className="flex items-start space-x-2 bg-white p-3 rounded">
              <span className="text-[#FF4500] font-bold flex-shrink-0">●</span>
              <div>
                <span className="font-bold text-gray-900">算账：</span>
                <span className="text-gray-700">按照收购时6.8亿月活跃用户计算，每个用户的社交数据价值约280元。你的每一条消息、每一个联系人，都在为平台创造价值，而你却一无所获。</span>
              </div>
            </div>
          </div>
        </div>

        {/* 总结 */}
        <div className="bg-[#FFF9F0] border-l-4 border-[#FF4500] p-4 rounded">
          <div className="font-bold text-gray-900 mb-2">💡 核心观点</div>
          <div className="text-sm text-gray-700 leading-relaxed">
            <p className="mb-2">
              <span className="font-bold text-[#FF4500]">你的数据价值，早已被标好价格。</span>平台通过收购案把这些数字明码标价地写在了财报上，而你作为数据的真正所有者，却从未分享过这份收益。
            </p>
            <p>
              这就是为什么脉动网要打破这个不公平的游戏规则——<span className="font-bold">让用户真正拥有自己的数据价值，并从中获益。</span>
            </p>
          </div>
        </div>

        {/* 海报 */}
        <div className="mt-6">
          <img 
            src={`${BASE_URL}/posters/article_1_poster.png`}
            alt="我们的数据谁在赚钱？"
            className="w-full rounded-lg shadow-md cursor-pointer hover:shadow-xl transition-shadow"
          />
        </div>
      </div>
    ),
  },
  // 可以继续添加其他文章...
];

export default function ArticleDetail() {
  const [, params] = useRoute("/article/:id");
  const articleId = params?.id ? parseInt(params.id) : null;
  const article = articles.find(a => a.id === articleId);
  const [copied, setCopied] = React.useState(false);

  // 分享功能
  const handleShare = async () => {
    const shareUrl = `${BASE_URL}/article/${articleId}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('复制失败:', error);
    }
  };

  if (!article) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 mb-4">文章不存在</p>
          <Link href={BASE_URL}>
            <a className="text-[#A80000] hover:underline">返回首页</a>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* 顶部导航栏 */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href={`${BASE_URL}/parent/asset-report`}>
            <a className="flex items-center text-gray-700 hover:text-gray-900">
              <ArrowLeft className="w-5 h-5" />
            </a>
          </Link>
          <h1 className="text-lg font-bold text-gray-900 flex-1 text-center px-4 truncate">
            {article.title}
          </h1>
          <button
            onClick={handleShare}
            className="flex items-center space-x-1 text-[#A80000] hover:text-[#800000] transition-colors"
          >
            {copied ? (
              <>
                <Check className="w-5 h-5" />
                <span className="text-sm">已复制</span>
              </>
            ) : (
              <>
                <Share2 className="w-5 h-5" />
                <span className="text-sm">分享</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* 文章内容 */}
      <div className="max-w-3xl mx-auto px-4 py-6">
        {/* 标题和标签 */}
        <div className="mb-6">
          <div className="flex items-center space-x-2 mb-3">
            <h2 className="text-2xl font-bold text-gray-900">{article.title}</h2>
            {article.tag && (
              <span className="px-2 py-0.5 text-xs font-bold text-white bg-[#FF4500] rounded">
                {article.tag}
              </span>
            )}
          </div>
        </div>

        {/* 文章正文 */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          {article.content}
        </div>

        {/* 底部CTA */}
        <div className="mt-8 bg-gradient-to-br from-[#800000] to-[#A80000] text-white rounded-lg p-6 text-center">
          <p className="text-lg font-bold mb-2">想了解更多？</p>
          <p className="text-sm text-white/80 mb-4">加入脉动网，让你的数据价值真正属于你</p>
          <Link href={BASE_URL}>
            <a className="inline-block bg-white text-[#A80000] px-6 py-2 rounded-full font-bold hover:bg-gray-100 transition-colors">
              立即了解
            </a>
          </Link>
        </div>
      </div>
    </div>
  );
}
