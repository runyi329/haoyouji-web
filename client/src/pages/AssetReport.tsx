import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Loader2, ChevronDown, ArrowLeft } from "lucide-react";
import { Link } from "wouter";

const BASE_URL = "https://www.jiangyuchen.cn";

// 保存图片到相册
const saveImageToAlbum = async (imageUrl: string) => {
  try {
    // @ts-ignore - 微信小程序 API
    if (typeof wx !== 'undefined' && wx.saveImageToPhotosAlbum) {
      // 先下载图片
      // @ts-ignore
      wx.downloadFile({
        url: imageUrl,
        success: (res: any) => {
          if (res.statusCode === 200) {
            // 保存到相册
            // @ts-ignore
            wx.saveImageToPhotosAlbum({
              filePath: res.tempFilePath,
              success: () => {
                // @ts-ignore
                wx.showToast({
                  title: '保存成功',
                  icon: 'success'
                });
              },
              fail: (err: any) => {
                if (err.errMsg.includes('auth deny')) {
                  // @ts-ignore
                  wx.showModal({
                    title: '提示',
                    content: '需要您授权保存相册权限',
                    success: (modalRes: any) => {
                      if (modalRes.confirm) {
                        // @ts-ignore
                        wx.openSetting();
                      }
                    }
                  });
                } else {
                  // @ts-ignore
                  wx.showToast({
                    title: '保存失败',
                    icon: 'none'
                  });
                }
              }
            });
          }
        },
        fail: () => {
          // @ts-ignore
          wx.showToast({
            title: '下载失败',
            icon: 'none'
          });
        }
      });
    } else {
      // 非小程序环境，提示长按保存
      alert('请长按图片保存到相册');
    }
  } catch (error) {
    console.error('保存图片失败:', error);
  }
};

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
  const itemRef = React.useRef<HTMLDivElement>(null);

  // 当展开状态变化时，滚动到项目顶部
  React.useEffect(() => {
    if (isExpanded && itemRef.current) {
      // 延迟一点执行，等待DOM更新完成
      setTimeout(() => {
        itemRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }, [isExpanded]);
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
    <div ref={itemRef} className="bg-white">
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
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  
  // 模拟全国节点总数（实际应从后端获取）
  const totalNodes = 1280520;
  
  // 对标价值（每人）
  const benchmarkValue = 100;

  // 列表数据
  const listItems: ListItem[] = [
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
                src="https://files.manuscdn.com/user_upload_by_module/session_file/310519663346422697/yNdunTloulJArwlY.jpg" 
                alt="我们的数据谁在赚钱海报" 
                className="w-full rounded-lg shadow-md cursor-pointer hover:opacity-90 transition-opacity"
                onClick={() => setPreviewImage('https://files.manuscdn.com/user_upload_by_module/session_file/310519663346422697/yNdunTloulJArwlY.jpg')}
              />
            </div>
          </div>
        </div>
      )
    },
    {
      id: 2,
      title: "我们的人脉有什么价值？",
      tag: "新",
      content: (
        <div className="space-y-4">
          {/* 你的人脉正在"沉睡" */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="font-bold text-gray-900 mb-2">你的人脉正在"沉睡"</div>
            <div className="text-sm text-gray-700 leading-relaxed space-y-2">
              <p>
                很多人热衷于扩展人脉，微信好友动辄上千。但科学研究告诉我们一个残酷的事实：
              </p>
              <div className="bg-white p-3 rounded space-y-2">
                <div className="flex items-start space-x-2">
                  <span className="text-[#FF4500] font-bold flex-shrink-0">●</span>
                  <div>
                    <span className="font-bold text-gray-900">邓巴数限制：</span>
                    <span className="text-gray-700">人类大脑只能有效维护约150个深度关系。</span>
                  </div>
                </div>
                <div className="flex items-start space-x-2">
                  <span className="text-[#FF4500] font-bold flex-shrink-0">●</span>
                  <div>
                    <span className="font-bold text-gray-900">现实困境：</span>
                    <span className="text-gray-700">你有几千个微信好友，但95%的人常年不维护。他们躺在你的微信里既不产生价值，还在随时间贬值。</span>
                  </div>
                </div>
              </div>
              <p className="pt-2 font-bold text-[#800000]">
                问题本质：不是你的人脉不够多，而是你的触达能力太有限。<span className="block mt-2">每个人都是一座金矿，关键在于如何挖掘和连接。价值不在于“拥有”，而在于“触达”。</span>
              </p>
            </div>
          </div>

          {/* 一个真实的案例 */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="font-bold text-gray-900 mb-2">一个真实的案例</div>
            <div className="text-sm text-gray-700 leading-relaxed space-y-2">
              <p>
                抖音英语老师雪梨，曾在线下教育机构工作8年。线下小班教学，每天最多触达20-30个学生。2020年转型线上平台后，通过微信视频号和抖音发布教学内容，如今拥有<span className="font-bold text-[#800000]">560万粉丝</span>，单场直播触达<span className="font-bold text-[#800000]">2.3万人</span>。即使每个课程只卖99元，一个晚上也能轻松收入过百万。
              </p>
              <p className="pt-2 font-bold text-[#800000]">
                核心差异：线下一天触达20人，线上一场触达2.3万人——触达能力提升超1000倍。决定收入上限的，不是其他老师不会教，而是触达人数。
              </p>
            </div>
          </div>

          {/* 脉动的解决方案 */}
          <div className="bg-[#800000] p-4 rounded-lg">
            <div className="font-bold text-white mb-3">脉动的解决方案：让人脉资产“核裂变”</div>
            <div className="text-sm text-white/90 leading-relaxed space-y-3">
              <p>
                我们不要求你增加人脉数量，我们只帮你提高触达效率。通过好友共享机制，让你的存量人脉产生指数级价值：
              </p>
              <div className="bg-white/10 p-3 rounded">
                <div className="font-bold text-[#FFA500] mb-1">好友共享（流量杠杆）</div>
                <p className="text-white/90 mb-2">
                  您通过平台与更多的人分享了你的人脉信息，就像老师的录播课，可以把自己的资源共享给更多需要的学生。你的人脉每共享一次，价值就提升一步。
                </p>
                <div className="bg-white/10 p-2 rounded text-xs">
                  <span className="font-bold text-[#FFA500]">举例：</span>
                  <span className="text-white/90">你认识一位资深律师，平时只能帮你自己。但是通过脉动共享，有更多有需求的人可以看到你给这位律师人脉打的主观标签，从而通过你的介绍获得律师的服务。你创造了一个三赢的局面。</span>
                </div>
              </div>
            </div>
          </div>

          {/* 海报展示 */}
          <div className="bg-gray-50 p-4 rounded-lg mt-4">
            <div className="font-bold text-gray-900 mb-3 text-center">分享海报</div>
            <div className="space-y-2">
              <img 
                src="https://files.manuscdn.com/user_upload_by_module/session_file/310519663346422697/hzwbYkVZJnEjisDu.jpg" 
                alt="我们的人脉有什么价值海报" 
                className="w-full rounded-lg shadow-md cursor-pointer hover:opacity-90 transition-opacity"
                onClick={() => setPreviewImage('https://files.manuscdn.com/user_upload_by_module/session_file/310519663346422697/hzwbYkVZJnEjisDu.jpg')}
              />
            </div>
          </div>
        </div>
      )
    },
    {
      id: 3,
      title: "资本眼里的用户价值",
      tag: "新",
      content: (
        <div className="space-y-4">
          {/* 引言 */}
          <div className="text-sm text-gray-700 leading-relaxed">
            <p className="mb-3">
              在资本市场，一个项目的估值核心，并非仅仅是用户数量，而是其数据资产的"商业厚度"与"网络密度"。相较于传统互联网项目，我们正在构建的商业关系网络，在单用户价值上实现了指数级的提升。
            </p>
          </div>

          {/* 维度差异 */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="font-bold text-gray-900 mb-2">一、维度的差异：从"物理点位"到"商业图谱"</div>
            <div className="text-sm text-gray-700 leading-relaxed space-y-2">
              <p>
                传统流量型产品，如共享单车或充电宝，其数据本质是低频、浅层的物理轨迹。每个用户只是一个孤立的数据点，商业挖掘潜力有限。
              </p>
              <p>
                与此不同，我们构建的是一张高度结构化的<span className="font-bold text-[#800000]">商业关系图谱</span>。在这里，每一位用户不再是孤立的点，而是连接着上百个高价值商业节点的枢纽。
              </p>
              <div className="bg-white p-3 rounded mt-2">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2">对比维度</th>
                      <th className="text-left py-2">传统流量产品</th>
                      <th className="text-left py-2">我们的网络</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b">
                      <td className="py-2 font-bold">数据性质</td>
                      <td className="py-2">低频、浅层轨迹</td>
                      <td className="py-2 text-[#800000] font-bold">高频、深层信用</td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-2 font-bold">资产厚度</td>
                      <td className="py-2">1用户=1数据点</td>
                      <td className="py-2 text-[#800000] font-bold">1用户≈100+节点</td>
                    </tr>
                    <tr>
                      <td className="py-2 font-bold">商业价值</td>
                      <td className="py-2">难以深度挖掘</td>
                      <td className="py-2 text-[#800000] font-bold">持续收益</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* 密度革命 */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="font-bold text-gray-900 mb-2">二、密度的革命：百倍杠杆的估值逻辑</div>
            <div className="text-sm text-gray-700 leading-relaxed space-y-2">
              <p>
                网络效应理论告诉我们，网络的价值与其节点的连接密度密切相关。高密度的网络能创造更强大的网络效应和防御壁垒。
              </p>
              <div className="bg-white p-3 rounded space-y-2">
                <div className="flex items-start space-x-2">
                  <span className="text-[#FF4500] font-bold flex-shrink-0">●</span>
                  <div>
                    <span className="font-bold text-gray-900">低密度数据：</span>
                    <span className="text-gray-700">在传统模型中，1个用户只产生1个数据点，价值增长是线性的。</span>
                  </div>
                </div>
                <div className="flex items-start space-x-2">
                  <span className="text-[#FF4500] font-bold flex-shrink-0">●</span>
                  <div>
                    <span className="font-bold text-gray-900">高密度资产：</span>
                    <span className="text-gray-700">在我们这里，资产价值由"用户数"与"商业关系节点数"的乘积决定，实现了指数级增长。</span>
                  </div>
                </div>
              </div>
              <p className="pt-2 font-bold text-[#800000]">
                这种由高密度连接驱动的价值模型，正是资本市场重新评估我们单用户价值的核心动力。
              </p>
            </div>
          </div>

          {/* 竞争壁垒 */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="font-bold text-gray-900 mb-2">三、竞争壁垒：从"流量红利"到"信用底座"</div>
            <div className="text-sm text-gray-700 leading-relaxed space-y-2">
              <p>
                缺乏数据深度的项目，竞争门槛极低，往往陷入"烧钱换规模"的恶性循环。而我们从第一天起，就在构建一个无法被轻易复制的<span className="font-bold text-[#800000]">高质量商业关系数据库</span>。
              </p>
              <div className="bg-white p-3 rounded">
                <p className="text-gray-700 italic">
                  这种壁垒的核心在于"真实性"与"排他性"。每一条人脉标签都由用户基于真实的社交链条手动维护，其背后是真实验证的商业信用。
                </p>
              </div>
              <p className="pt-2">
                我们正在解决商业社会中最昂贵的成本——<span className="font-bold text-[#800000]">信任与链接</span>。当一个网络成为全球商业链接的"信用底座"时，它就构筑了最坚实的竞争壁垒。
              </p>
            </div>
          </div>

          {/* 我们的共同事业 */}
          <div className="bg-[#800000] p-4 rounded-lg">
            <div className="font-bold text-white mb-3">我们的共同事业</div>
            <div className="text-sm text-white/90 leading-relaxed space-y-3">
              <p>
                共享单车解决了"行"的问题，估值在百亿级。而我们正在通过高密度的社交资产确权，构建商业社会的"信用引擎"。
              </p>
              <p className="pt-2 border-t border-white/20">
                在这个资本眼里的万亿级赛道上，每一位积极维护人脉标签的用户，不仅是这个高密度资产的贡献者，更是其未来价值的<span className="font-bold text-[#FFA500]">第一批共享者</span>。
              </p>
            </div>
          </div>

          {/* 海报展示 */}
          <div className="bg-gray-50 p-4 rounded-lg mt-4">
            <div className="font-bold text-gray-900 mb-3 text-center">分享海报</div>
            <div className="space-y-2">
              <img 
                src="https://files.manuscdn.com/user_upload_by_module/session_file/310519663346422697/oECpcLjZmbRuIuuO.jpg" 
                alt="资本眼里的用户价值海报" 
                className="w-full rounded-lg shadow-md cursor-pointer hover:opacity-90 transition-opacity"
                onClick={() => setPreviewImage('https://files.manuscdn.com/user_upload_by_module/session_file/310519663346422697/oECpcLjZmbRuIuuO.jpg')}
              />
            </div>
          </div>
        </div>
      )
    },
    {
      id: 4,
      title: "脉动网的价值估值逻辑",
      tag: "新",
      content: (
        <div className="space-y-4">
          {/* 引言 */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="font-bold text-gray-900 mb-2">我们如何定义“价值”？</div>
            <div className="text-sm text-gray-700 leading-relaxed space-y-2">
              <p>
                比起那些靠财务报表和讲PPT决定估值的公司而言，脉动网是一家真正具有生命力的网络。其价值应该由全网用户的实时行为共同铸就，如同一个生生不息的“数字生命体”。
              </p>
              <p>
                因此，我们的估值体系不再依赖于过时的年度审计、夸张的PPT讲故事，而是建立在一套先进的、由人工智能驱动的实时估值模型之上。这确保了公司的每一分价值增长，都与全网用户的每一次有效贡献毫秒级同步。
              </p>
            </div>
          </div>

          {/* 价值的源泉 */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="font-bold text-gray-900 mb-2">价值的源泉——用户行为即价值创造</div>
            <div className="text-sm text-gray-700 leading-relaxed space-y-2">
              <p>
                不要小看你的每一次行为！每一次打标签、每一次共享、每一个新好友，都在为整个网络注入价值。网络效应会将你的贡献放大百倍、千倍，直接推高公司估值，而你也将从中获得相应的回报。您的每一次贡献，都在提升整个网络的“商业厚度”与“网络密度”。
              </p>
              <p className="text-xs">
                <span className="text-gray-500">相关阅读：</span>
                <a href="#" className="text-[#800000] underline ml-1" onClick={(e) => { e.preventDefault(); /* 后续添加跳转逻辑 */ }}>生日悖论</a>
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="p-2 border border-gray-200">用户行为</th>
                      <th className="p-2 border border-gray-200">对应的价值贡献</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="p-2 border border-gray-200 font-bold">完善人脉标签</td>
                      <td className="p-2 border border-gray-200">注入“高纯度数据资产”，提升网络信息密度</td>
                    </tr>
                    <tr>
                      <td className="p-2 border border-gray-200 font-bold">共享人脉网络</td>
                      <td className="p-2 border border-gray-200">注入“网络流动性资本”，激活潜在商业机会</td>
                    </tr>
                    <tr>
                      <td className="p-2 border border-gray-200 font-bold">邀请新朋友</td>
                      <td className="p-2 border border-gray-200">注入“原始增量红利”，扩张网络价值边界</td>
                    </tr>
                    <tr>
                      <td className="p-2 border border-gray-200 font-bold">培养活跃节点</td>
                      <td className="p-2 border border-gray-200">注入“生态繁育能量”，创造价值的二阶增长</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="pt-2">
                这种机制的核心是强大的<b>网络效应</b>。根据经典的梅特卡夫定律（Metcalfe's Law），一个网络的价值与其节点数的平方成正比。这意味着，每增加一个新用户，带来的价值不是线性的“+1”，而是与其他所有节点建立新连接的指数级爆发。
              </p>
            </div>
          </div>

          {/* 估值算法 */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="font-bold text-gray-900 mb-2">先进的估值算法——AI驱动的实时价值计算</div>
            <div className="text-sm text-gray-700 leading-relaxed space-y-2">
              <p>
                我们与全球顶尖的数据公司合作，独创了一套基于Web3理念的动态估值引擎。该引擎融合了人工智能、拓扑数据分析与实时折现模型，确保每一份贡献都能被精准量化。
              </p>
              <p className="font-bold text-gray-900">1. 从“线性加法”到“拓扑指数”的跃迁</p>
              <p>
                我们的AI引擎识别的是全网节点的“拓扑结构”，关心的不只是“有多少人”，更是“这些人如何连接”，这使得估值模型更接近梅特卡夫定律所描述的指数级增长曲线。
              </p>
              <p className="font-bold text-gray-900">2. AI驱动的实时行为价值折现</p>
              <p>
                系统通过AI实时扫描并分析全网节点的行为数据（如信息熵增益α、网络流动性β、价值握手γ），并将其对网络未来可能产生的现金流，通过算法瞬间折现到当下的总估值中。
              </p>
            </div>
          </div>

          {/* 核心估值公式 */}
          <div className="bg-gray-50 p-4 rounded-lg border-2 border-[#800000]">
            <div className="font-bold text-gray-900 mb-3 text-center">拓扑信息密度与实时网络折现引擎</div>
            <div className="text-sm text-gray-700 leading-relaxed space-y-3">
              <div className="bg-white p-3 rounded border border-gray-300 overflow-x-auto">
                <div className="text-center font-mono text-xs">
                  <div className="mb-2">V(t) = ∫₀ᵗ [α·H(τ) + β·F(τ) + γ·T(τ)] · e<sup>-r(t-τ)</sup> · N<sub>eff</sub><sup>2</sup>(τ) dτ + λ·C(t)</div>
                </div>
              </div>
              
              <div className="space-y-2">
                <p className="font-bold text-gray-900">公式参数详解：</p>
                <div className="space-y-1.5 text-xs">
                  <div className="flex items-start space-x-2">
                    <span className="font-bold text-[#800000] flex-shrink-0">V(t)</span>
                    <span>＝ 实时估值，由AI引擎每毫秒计算更新</span>
                  </div>
                  <div className="flex items-start space-x-2">
                    <span className="font-bold text-[#800000] flex-shrink-0">α</span>
                    <span>＝ 信息熵增益系数，衡量用户打标签、完善信息等行为对数据质量的提升（当前值：0.68）</span>
                  </div>
                  <div className="flex items-start space-x-2">
                    <span className="font-bold text-[#800000] flex-shrink-0">β</span>
                    <span>＝ 网络流动性系数，衡量用户共享、互动、连接等行为对网络活跃度的贡献（当前值：0.52）</span>
                  </div>
                  <div className="flex items-start space-x-2">
                    <span className="font-bold text-[#800000] flex-shrink-0">γ</span>
                    <span>＝ 价值握手系数，衡量节点间真实业务合作对现金流的直接贡献（当前值：1.24）</span>
                  </div>
                  <div className="flex items-start space-x-2">
                    <span className="font-bold text-[#800000] flex-shrink-0">H(τ)</span>
                    <span>＝ 时刻τ的信息熵增量，通过Shannon熄公式计算数据的信息密度</span>
                  </div>
                  <div className="flex items-start space-x-2">
                    <span className="font-bold text-[#800000] flex-shrink-0">F(τ)</span>
                    <span>＝ 时刻τ的网络流动性增量，基于图论中的节点中心性算法</span>
                  </div>
                  <div className="flex items-start space-x-2">
                    <span className="font-bold text-[#800000] flex-shrink-0">T(τ)</span>
                    <span>＝ 时刻τ的价值握手事件数，由智能合约自动识别并记录</span>
                  </div>
                  <div className="flex items-start space-x-2">
                    <span className="font-bold text-[#800000] flex-shrink-0">e<sup>-r(t-τ)</sup></span>
                    <span>＝ 连续时间折现因子，将未来现金流折现到当下（r为折现率，当前值：0.12）</span>
                  </div>
                  <div className="flex items-start space-x-2">
                    <span className="font-bold text-[#800000] flex-shrink-0">N<sub>eff</sub><sup>2</sup>(τ)</span>
                    <span>＝ 有效节点数的平方，体现Metcalfe定律的网络效应（当前有效节点数：1,280,520）</span>
                  </div>
                  <div className="flex items-start space-x-2">
                    <span className="font-bold text-[#800000] flex-shrink-0">λ</span>
                    <span>＝ 现金储备权重系数，衡量公司现金储备对总估值的贡献（当前值：0.15）</span>
                  </div>
                  <div className="flex items-start space-x-2">
                    <span className="font-bold text-[#800000] flex-shrink-0">C(t)</span>
                    <span>＝ 时刻t的公司现金储备，由财务系统实时同步</span>
                  </div>
                </div>
              </div>


            </div>
          </div>

          {/* 算法优势 */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="font-bold text-gray-900 mb-2">为什么这套算法更科学？</div>
            <div className="text-sm text-gray-700 leading-relaxed space-y-2">
              <div className="flex items-start space-x-2">
                <span className="text-[#FF4500] font-bold flex-shrink-0">●</span>
                <div>
                  <span className="font-bold text-gray-900">多维度衡量：</span>
                  <span>不同于传统估值只看用户数，我们同时考虑信息质量、网络活跃度、实际交易等多个维度。</span>
                </div>
              </div>
              <div className="flex items-start space-x-2">
                <span className="text-[#FF4500] font-bold flex-shrink-0">●</span>
                <div>
                  <span className="font-bold text-gray-900">实时动态：</span>
                  <span>AI引擎每毫秒扫描全网行为，动态调整参数，确保估值始终反映最新状态。</span>
                </div>
              </div>
              <div className="flex items-start space-x-2">
                <span className="text-[#FF4500] font-bold flex-shrink-0">●</span>
                <div>
                  <span className="font-bold text-gray-900">科学严谨：</span>
                  <span>公式融合了信息论、图论、金融工程等多个学科的经典理论，经过严格数学验证。</span>
                </div>
              </div>
            </div>
          </div>

          {/* 总结 */}
          <div className="bg-[#800000] p-4 rounded-lg mt-4">
            <div className="font-bold text-white mb-3">我们是一个利益高度统一的价值共同体</div>
            <div className="text-sm text-white/90 leading-relaxed">
              <p>
                维护人脉，即是增值资产；拓展连接，即是实时加仓。公司实时估值的每一次跳动，都是全网所有节点共同努力的真实回馈。
              </p>
            </div>
          </div>

          {/* 海报展示 */}
          <div className="bg-gray-50 p-4 rounded-lg mt-4">
            <div className="font-bold text-gray-900 mb-3 text-center">分享海报</div>
            <div className="space-y-2">
              <img 
                src="https://files.manuscdn.com/user_upload_by_module/session_file/310519663346422697/oHGzHPCONtyApGMj.jpg" 
                alt="脉动网的价值估值逻辑海报" 
                className="w-full rounded-lg shadow-md cursor-pointer hover:opacity-90 transition-opacity"
                onClick={() => setPreviewImage("https://files.manuscdn.com/user_upload_by_module/session_file/310519663346422697/oHGzHPCONtyApGMj.jpg")}
              />
            </div>
          </div>
        </div>
      )
    },
    {
      id: 5,
      title: "为什么你和资本看到的价值不同？",
      tag: "新",
      content: (
        <div className="space-y-4">
          {/* 引言 */}
          <div className="text-sm text-gray-700 leading-relaxed">
            <p className="mb-3">
              您可能会觉得，自己手里那点人脉标签、几个行业联络人，就像路边的碎石子一样普通，并不值钱。
            </p>
            <p>
              但在资本的眼中，这些"碎石子"一旦进入脉动网的估值矩阵，就会发生核裂变一般的化学反应。您看到的只是一个孤立的点，而资本看到的是由无数个点连接而成的、价值连城的商业网络。
            </p>
          </div>

          {/* 生日悖论 */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="font-bold text-gray-900 mb-3">一、 一个颇覆常识的金融模型：生日悖论</div>
            <div className="text-sm text-gray-700 leading-relaxed space-y-2">
              <p>
                为了让您理解这种价值爆发的逻辑，我们先来看一个著名的金融模型——"生日悖论"。
              </p>
              <div className="bg-white p-3 rounded border-l-4 border-[#FF4500]">
                <p className="font-bold text-gray-900 mb-2">如果一个班级有50名学生，您觉得其中"至少有两个人生日相同"的概率有多大？</p>
                <p>直觉会告诉您：一年有365天，只有50个人的样本，占比都不到15%。概率是？15%、20%还是25%？</p>
                <p className="mt-2 text-[#FF4500] font-bold">
                  可能和你想的不一样，这个概率竟然高达 97%！（是不是有点出乎意料？可以打开百度或豆包求证一下。）
                </p>
              </div>
              <p>
                为什么您的直觉会错得这么离谱？因为您的大脑在进行线性计算（50人相对于365天很少），而数学在进行组合计算。50个人之间两两匹配，竟然能产生 <strong>1,225</strong> 种连接可能性！
              </p>
            </div>
          </div>

          {/* 对比表格 */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-300 px-3 py-2 text-left">人数</th>
                  <th className="border border-gray-300 px-3 py-2 text-left">可能的连接数</th>
                  <th className="border border-gray-300 px-3 py-2 text-left">生日相同的概率</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-gray-300 px-3 py-2">10人</td>
                  <td className="border border-gray-300 px-3 py-2">45</td>
                  <td className="border border-gray-300 px-3 py-2">12%</td>
                </tr>
                <tr>
                  <td className="border border-gray-300 px-3 py-2">23人</td>
                  <td className="border border-gray-300 px-3 py-2">253</td>
                  <td className="border border-gray-300 px-3 py-2">50% (临界点)</td>
                </tr>
                <tr className="bg-[#FFF3E0]">
                  <td className="border border-gray-300 px-3 py-2 font-bold">50人</td>
                  <td className="border border-gray-300 px-3 py-2 font-bold">1,225</td>
                  <td className="border border-gray-300 px-3 py-2 font-bold">97%</td>
                </tr>
                <tr>
                  <td className="border border-gray-300 px-3 py-2">70人</td>
                  <td className="border border-gray-300 px-3 py-2">2,415</td>
                  <td className="border border-gray-300 px-3 py-2">99.9%</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* 脉动网的逻辑 */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="font-bold text-gray-900 mb-3">二、 我们的逻辑：单一数据是“碎石”，连接数据是“钻石”</div>
            <div className="text-sm text-gray-700 leading-relaxed space-y-2">
              <p>
                同样的道理，您手里的一条人脉数据（比如：某行业高管的联系方式），对您个人来说，能匹配成功、产生价值的概率极低。
              </p>
              <p>
                但当这些数据进入脉动网的估值引擎时，奇迹发生了：
              </p>
              <ul className="list-disc list-inside space-y-1 ml-4">
                <li>当平台只有10个人时，连接数只有45对，火花微弱；</li>
                <li>当平台有100个人时，连接数飙升到4,950对；</li>
                <li>而当平台达到特定规模时，这种价值的匹配成功率将无限接近100%！</li>
              </ul>
              <p className="mt-2 font-bold text-[#FF4500]">
                这就是为什么您觉得“没用”的信息，在资本眼里却是无价之宝。资本买的不是您那一个点，而是您这个点进入网络后，引爆成千上万种业务可能性的那个“连接瞬间”。
              </p>
            </div>
          </div>

          {/* 660临界点 */}
          <div className="bg-[#800000] p-4 rounded-lg">
            <div className="font-bold text-white mb-3">三、 我们的“660临界点”：从概率到必然</div>
            <div className="text-sm text-white/90 leading-relaxed space-y-2">
              <p>
                通过我们精密的算法模型，我们已经计算出了那个足以改变命运的绝对值：<strong>660个超级节点</strong>。
              </p>
              <p>
                就像在班级里，50个人就是生日相同的“大概率事件”；在脉动网，660个超级节点就是价值爆发的“确定性临界点”。
              </p>
              <p>
                一旦我们的超级节点人数达到660个，全网数据之间的匹配效率、业务成交的火花频率、以及资本市场对我们的溢价评估，将不再是缓慢爬行，而是呈指数级垂直上升。在那一刻，脉动网的价值将从“可能成功”飞跃为“必然成功”。
              </p>
            </div>
          </div>

          {/* 为什么要现在加入 */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="font-bold text-gray-900 mb-3">四、 为什么要现在加入？</div>
            <div className="text-sm text-gray-700 leading-relaxed space-y-2">
              <p>
                生日悖论告诉我们：人数从23个增加到50个，概率不是翻倍，而是从50%暴涨到97%！
              </p>
              <p>
                这正是我们邀请您成为合伙人的原因。您现在贡献的一条标签、一个节点，不是在为网络做加法，而是在为整个网络的价值做<strong>乘方运算</strong>。
              </p>
              <p>
                您手中的股份，不是基于您个人的那点资源，而是基于这660个节点连接后、那个接近100%匹配成功的巨大财富网络。
              </p>
              <p className="mt-3 font-bold text-[#FF4500]">
                不要用您的直觉去怀疑数学，更不要用您的认知差去挑战资本的眼光。在脉动网，每一个“平凡”的数据，都在等待那个临界点的到来，完成从碎石到钻石的惊人一跃。
              </p>
            </div>
          </div>

          {/* 海报展示 */}
          <div className="bg-gray-50 p-4 rounded-lg mt-4">
            <div className="font-bold text-gray-900 mb-3 text-center">分享海报</div>
            <div className="space-y-2">
              <img 
                src="https://files.manuscdn.com/user_upload_by_module/session_file/310519663346422697/hAoSbkXclaLpcFbw.jpg" 
                alt="为什么你和资本看到的价值不同海报" 
                className="w-full rounded-lg shadow-md cursor-pointer hover:opacity-90 transition-opacity"
                onClick={() => setPreviewImage("https://files.manuscdn.com/user_upload_by_module/session_file/310519663346422697/hAoSbkXclaLpcFbw.jpg")}
              />
            </div>
          </div>
        </div>
      )
    },
    {
      id: 6,
      title: "价值对标：为什么现在是最佳入场时机？",
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
      id: 7,
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
      id: 8,
      title: "立即行动：如何开始经营您的人脉资产？",    content: (
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

      {/* 图片全屏预览 */}
      {previewImage && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-90 z-50 flex items-center justify-center p-4"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-w-2xl w-full">
            {/* 关闭按钮 */}
            <button
              className="absolute -top-12 right-0 text-white text-2xl w-10 h-10 flex items-center justify-center hover:bg-white/10 rounded-full transition-colors"
              onClick={() => setPreviewImage(null)}
            >
              ×
            </button>
            {/* 图片 */}
            <img 
              src={previewImage} 
              alt="海报预览" 
              className="w-full h-auto rounded-lg shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />

          </div>
        </div>
      )}
    </div>
  );
}
