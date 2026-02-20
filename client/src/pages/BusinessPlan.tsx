// 商业计划书页面 - 红白双色卡片布局 v2.0
import { ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";

export default function BusinessPlan() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-[#FAF3ED] pb-20">
      {/* 顶部返回区域 */}
      <div className="bg-white border-b border-[#E0E0E0] sticky top-0 z-10">
        <div className="px-4 py-3 flex items-center">
          <button
            onClick={() => setLocation("/parent/profile")}
            className="flex items-center text-[#757575] hover:text-[#424242]"
          >
            <ArrowLeft className="w-5 h-5 mr-1" />
            <span>返回</span>
          </button>
          <h1 className="ml-4 text-lg font-semibold text-[#424242]">关于脉动</h1>
        </div>
      </div>

      {/* 页面内容 */}
      <div className="p-4 space-y-4">
        {/* 卡片1：品牌核心理念 */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="bg-[#D32F2F] px-6 py-8 text-center">
            <h2 className="text-3xl font-bold text-white mb-2">脉动</h2>
            <p className="text-white/90 text-lg">让您的人脉"动"起来</p>
          </div>
          <div className="p-6">
            <p className="text-[#424242] text-center leading-relaxed">
              基于分布式协议的专业人脉资本网络，将静态通讯录转化为动态资产，让人脉在流动中产生复利。
            </p>
          </div>
        </div>

        {/* 卡片2：现状与挑战 */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="bg-[#D32F2F] px-6 py-6">
            <h2 className="text-xl font-bold text-white mb-1">人脉管理的现状与挑战</h2>
            <p className="text-white/80 text-sm">为什么您的通讯录是"死的"？</p>
          </div>
          <div className="p-6 space-y-6">
            {/* 三大场景痛点 */}
            <div className="space-y-4">
              <div className="border-l-4 border-[#D32F2F] pl-4">
                <h3 className="font-semibold text-[#424242] mb-2">场景1：微信好友5000+的"虚假繁荣"</h3>
                <p className="text-[#757575] text-sm leading-relaxed">
                  多数用户微信好友达上限5000人，但日常有效互动不足3%，大量联系人仅停留在"添加好友"状态，无法转化为实际机会。
                </p>
              </div>
              <div className="border-l-4 border-[#D32F2F] pl-4">
                <h3 className="font-semibold text-[#424242] mb-2">场景2：越来越没有存在感的通讯录</h3>
                <p className="text-[#757575] text-sm leading-relaxed">
                  通讯录中存储的姓名、职位等静态信息，缺乏动态更新与场景化连接，导致"有资源找不到需求，有需求触达不到资源"的错位。
                </p>
              </div>
              <div className="border-l-4 border-[#D32F2F] pl-4">
                <h3 className="font-semibold text-[#424242] mb-2">场景3：社交过后，人脉"无下文"</h3>
                <p className="text-[#757575] text-sm leading-relaxed">
                  推杯换盏后，相见恨晚，看似建立了联系，但实际合作往往不了了之。很难获得社交以外的延展信息。
                </p>
              </div>
            </div>

            {/* 邓巴数限制 */}
            <div className="bg-[#FAF3ED] rounded-lg p-5">
              <h3 className="font-semibold text-[#424242] mb-4">邓巴数限制：个人管理半径的困境</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <h4 className="font-medium text-[#424242] mb-2 text-sm">邓巴数字：认知负荷的天然边界</h4>
                  <p className="text-[#757575] text-xs leading-relaxed">
                    人类大脑认知能力仅能稳定维护约150个强关系（邓巴数字），超出此范围的人脉难以深度管理。
                  </p>
                </div>
                <div>
                  <h4 className="font-medium text-[#424242] mb-2 text-sm">海量数据与人脑容量的矛盾</h4>
                  <p className="text-[#757575] text-xs leading-relaxed">
                    现代社交工具使个人联系人轻松突破5000+，但人脑无法同时处理超150人的深度关系，导致"管理半径"与"数据量"严重错位。
                  </p>
                </div>
                <div>
                  <h4 className="font-medium text-[#424242] mb-2 text-sm">低效维护：时间成本与收益失衡</h4>
                  <p className="text-[#757575] text-xs leading-relaxed">
                    用户试图维护超量人脉时，会陷入"广而不精"的困境：投入大量时间却无法建立信任，人脉质量与管理效率双降。
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 卡片3：创新概念 */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="bg-[#D32F2F] px-6 py-6">
            <h2 className="text-xl font-bold text-white mb-1">脉动的创新核心概念</h2>
            <p className="text-white/80 text-sm">从"互相看名单"到"信任资产联网"</p>
          </div>
          <div className="p-6 space-y-6">
            {/* 人脉共享 */}
            <div>
              <h3 className="font-semibold text-[#424242] mb-3 text-lg">人脉共享</h3>
              <div className="space-y-3">
                <div className="bg-[#FAF3ED] rounded-lg p-4">
                  <h4 className="font-medium text-[#424242] mb-2">从线性到指数级的人脉增长</h4>
                  <p className="text-[#757575] text-sm leading-relaxed">
                    通过人脉共享功能，让你认识一个人，就能认识他背后所有人脉，你的人脉圈即将实现指数级扩张，不再是1对1的线性积累，而是1对N的裂变式增长。
                  </p>
                </div>
                <div className="bg-[#FAF3ED] rounded-lg p-4">
                  <h4 className="font-medium text-[#424242] mb-2">人脉信息实时更新</h4>
                  <p className="text-[#757575] text-sm leading-relaxed">
                    当你的共享人对他们的人脉进行新的标签或信息更新时，你会实时同步看到这些变动。确保你的人脉信息始终鲜活，精准，抓住每一个合作机会。
                  </p>
                </div>
              </div>
            </div>

            {/* 分布式管理 */}
            <div>
              <h3 className="font-semibold text-[#424242] mb-3 text-lg">分布式管理</h3>
              <div className="space-y-3">
                <div className="bg-[#FAF3ED] rounded-lg p-4">
                  <h4 className="font-medium text-[#424242] mb-2">从个人维护到网络协同</h4>
                  <p className="text-[#757575] text-sm leading-relaxed">
                    通过共享功能实现了人脉的分布式管理，打破个人管理半径限制，用户仅需维护核心150人信任圈，即可通过网络调用伙伴的人脉资源，实现"维护150人，连接10000人+"的资产倍增效应。
                  </p>
                </div>
                <div className="bg-[#FAF3ED] rounded-lg p-4">
                  <h4 className="font-medium text-[#424242] mb-2">协议核心功能：标签索引</h4>
                  <p className="text-[#757575] text-sm leading-relaxed">
                    协议通过标准化接口实现人脉标签的统一索引，支持用户为联系人添加"投资人""技术专家"等精准标签，标签信息在信任节点间安全交换，构建动态商业关系图谱。
                  </p>
                </div>
                <div className="bg-[#FAF3ED] rounded-lg p-4">
                  <h4 className="font-medium text-[#424242] mb-2">熟人背书的不可替代性</h4>
                  <p className="text-[#757575] text-sm leading-relaxed">
                    平台人脉基于真实社交关系链，每个引荐都附带多层熟人背书，这种基于现实信任的网络结构难以被陌生关系或算法推荐替代。
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 卡片4：保障机制 */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="bg-[#D32F2F] px-6 py-6">
            <h2 className="text-xl font-bold text-white mb-1">共享背后的保障机制</h2>
            <p className="text-white/80 text-sm">安全引荐 - 隐私保护下的人脉调用</p>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-[#FAF3ED] rounded-lg p-5">
                <div className="w-10 h-10 bg-[#D32F2F] text-white rounded-full flex items-center justify-center font-bold mb-3">
                  01
                </div>
                <h3 className="font-semibold text-[#424242] mb-2">隐私保护核心原则</h3>
                <p className="text-[#757575] text-sm leading-relaxed">
                  采用信息分级制度，仅传递需求标签与信任等级，不暴露个人敏感信息。
                </p>
              </div>
              <div className="bg-[#FAF3ED] rounded-lg p-5">
                <div className="w-10 h-10 bg-[#CBA471] text-white rounded-full flex items-center justify-center font-bold mb-3">
                  02
                </div>
                <h3 className="font-semibold text-[#424242] mb-2">多层级权限控制</h3>
                <p className="text-[#757575] text-sm leading-relaxed">
                  设置"公开/私密/定向"三级权限，用户可自定义人脉开放范围，仅授权伙伴调用其已标记为"可引荐"的人脉资源。
                </p>
              </div>
              <div className="bg-[#FAF3ED] rounded-lg p-5">
                <div className="w-10 h-10 bg-[#D32F2F] text-white rounded-full flex items-center justify-center font-bold mb-3">
                  03
                </div>
                <h3 className="font-semibold text-[#424242] mb-2">信任连接</h3>
                <p className="text-[#757575] text-sm leading-relaxed">
                  专注于熟人关系的双向引荐，完成每一次成功的人脉引荐，都会增加双方的信任值，形成"使用-信任-再使用"的正向循环。
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* 卡片5：竞争优势 */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="bg-[#D32F2F] px-6 py-6">
            <h2 className="text-xl font-bold text-white mb-1">脉动的竞争优势</h2>
            <p className="text-white/80 text-sm">信任壁垒 - 越用越厚，学不会也带不走</p>
          </div>
          <div className="p-6 space-y-6">
            {/* 选品的顶层智慧 */}
            <div>
              <h3 className="font-semibold text-[#424242] mb-3 text-lg">选品的顶层智慧</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="border border-[#E0E0E0] rounded-lg p-4 hover:border-[#D32F2F] transition-colors">
                  <h4 className="font-medium text-[#424242] mb-2">百倍数据杠杆</h4>
                  <p className="text-[#757575] text-sm leading-relaxed">
                    共享单车只知道用户几点上下班活动半径，我们的每个用户会把100+重要人脉存入系统，相当于把用户的整个商业生态都映射到了数据库。同等用户体量下，我们的数据资产是其100倍。
                  </p>
                </div>
                <div className="border border-[#E0E0E0] rounded-lg p-4 hover:border-[#D32F2F] transition-colors">
                  <h4 className="font-medium text-[#424242] mb-2">精准标签价值</h4>
                  <p className="text-[#757575] text-sm leading-relaxed">
                    用户主动为人脉打上"投资人""股民""医生"等精准标签，这不仅是数据，更是经用户自我验证，高度结构化的商业关系图谱。其价值远超"骑行轨迹"这类浅层数据。
                  </p>
                </div>
                <div className="border border-[#E0E0E0] rounded-lg p-4 hover:border-[#D32F2F] transition-colors">
                  <h4 className="font-medium text-[#424242] mb-2">关系资产的沉淀与绑定</h4>
                  <p className="text-[#757575] text-sm leading-relaxed">
                    依赖于真实人脉的长期积累和信任传递，而非单纯技术架构，新进入者即便复制功能，也无法短期内构建同等密度的信任关系网络，难以突破先发优势。
                  </p>
                </div>
                <div className="border border-[#E0E0E0] rounded-lg p-4 hover:border-[#D32F2F] transition-colors">
                  <h4 className="font-medium text-[#424242] mb-2">轻量化的产业结构</h4>
                  <p className="text-[#757575] text-sm leading-relaxed">
                    比起共享单车、共享充电宝初创时巨大的产品设备投入，脉动的产品"就是用户本身就有的人脉"，自行车充电宝越用越旧，人脉却是越用越熟。产品层面有着得天独厚的优势。
                  </p>
                </div>
              </div>
            </div>

            {/* 爆款的底层基因 */}
            <div>
              <h3 className="font-semibold text-[#424242] mb-3 text-lg">爆款的底层基因</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="border border-[#E0E0E0] rounded-lg p-4 hover:border-[#CBA471] transition-colors">
                  <h4 className="font-medium text-[#424242] mb-2">传统共享的"伪共享"困境</h4>
                  <p className="text-[#757575] text-sm leading-relaxed">
                    共享单车、充电宝等，只解决了产品与使用者联系，用户不会主动分享传播，全靠资本砸钱和人为推动市场，增长模式单一成本高昂。
                  </p>
                </div>
                <div className="border border-[#E0E0E0] rounded-lg p-4 hover:border-[#CBA471] transition-colors">
                  <h4 className="font-medium text-[#424242] mb-2">脉动天然的"爆款基因"</h4>
                  <p className="text-[#757575] text-sm leading-relaxed">
                    当用户拥有"认识一人，瞬间共享其全部人脉"的超能力，他会天然的渴望更多人使用。人脉共享机制被写入底层基因，驱动用户主动分享与传播。
                  </p>
                </div>
                <div className="border border-[#E0E0E0] rounded-lg p-4 hover:border-[#CBA471] transition-colors">
                  <h4 className="font-medium text-[#424242] mb-2">零成本试错 无限拓展边界</h4>
                  <p className="text-[#757575] text-sm leading-relaxed">
                    比起传统认识人脉的成本，脉动共享的成本低至极限。即使对方未共享，自身也无实质损失。却能换来绝大多数互动，变相拥有了无限试错的超能力。
                  </p>
                </div>
                <div className="border border-[#E0E0E0] rounded-lg p-4 hover:border-[#CBA471] transition-colors">
                  <h4 className="font-medium text-[#424242] mb-2">价值具象化 用我有的换我要的</h4>
                  <p className="text-[#757575] text-sm leading-relaxed">
                    生意难做，核心就是各方都在权衡利弊。脉动将人脉具象化为价值。用"1000人脉换100人脉"交换变得天然容易，市场推动不再受阻。
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 卡片6：市场价值 */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="bg-[#D32F2F] px-6 py-6">
            <h2 className="text-xl font-bold text-white mb-1">市场与价值分析</h2>
            <p className="text-white/80 text-sm">数据资产的百倍杠杆</p>
          </div>
          <div className="p-6 space-y-6">
            {/* 数据资产的百倍杠杆 */}
            <div>
              <h3 className="font-semibold text-[#424242] mb-3 text-lg">数据资产的百倍杠杆</h3>
              <div className="space-y-3">
                <div className="bg-[#FAF3ED] rounded-lg p-4">
                  <h4 className="font-medium text-[#424242] mb-2">流量型产品的数据局限</h4>
                  <p className="text-[#757575] text-sm leading-relaxed">
                    共享单车等流量型产品，单个用户仅对应基础行为数据点（如骑行轨迹），数据维度单一、价值密度低。
                  </p>
                </div>
                <div className="bg-[#FAF3ED] rounded-lg p-4">
                  <h4 className="font-medium text-[#424242] mb-2">脉动的人脉数据杠杆效应</h4>
                  <p className="text-[#757575] text-sm leading-relaxed">
                    脉动用户平均带来100个高质量社会关系与商务人脉，同等用户体量下，核心数据资产规模是流量型产品的100倍。
                  </p>
                </div>
                <div className="bg-[#FAF3ED] rounded-lg p-4">
                  <h4 className="font-medium text-[#424242] mb-2">人脉网络的指数级价值</h4>
                  <p className="text-[#757575] text-sm leading-relaxed">
                    用户人脉具备网络属性，通过"信任连接"实现资源联动，数据资产随网络扩张呈现指数级增值，突破传统流量产品线性增长瓶颈。
                  </p>
                </div>
              </div>
            </div>

            {/* 数据价值的精准提纯 */}
            <div>
              <h3 className="font-semibold text-[#424242] mb-3 text-lg">数据价值的精准提纯</h3>
              <div className="space-y-3">
                <div className="bg-[#FAF3ED] rounded-lg p-4">
                  <h4 className="font-medium text-[#424242] mb-2">用户主动标签的自我验证机制</h4>
                  <p className="text-[#757575] text-sm leading-relaxed">
                    用户为联系人标注"投资人""大宗贸易""股票"等精准标签，数据经用户自我验证，真实性与相关性远高于被动采集信息。
                  </p>
                </div>
                <div className="bg-[#FAF3ED] rounded-lg p-4">
                  <h4 className="font-medium text-[#424242] mb-2">高度结构化的商业关系图谱</h4>
                  <p className="text-[#757575] text-sm leading-relaxed">
                    标签化数据构建动态鲜活的商业关系网络，实现人脉资源的精准分类与快速匹配，解决传统通讯录"信息孤岛"问题。
                  </p>
                </div>
                <div className="bg-[#FAF3ED] rounded-lg p-4">
                  <h4 className="font-medium text-[#424242] mb-2">浅层数据与深度数据的价值差异</h4>
                  <p className="text-[#757575] text-sm leading-relaxed">
                    相较于共享单车"骑行轨迹"等浅层行为数据，脉动的标签化人脉数据直接关联商业合作可能性，商业转化效率与价值密度呈量级提升。
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 卡片7：融资与愿景 */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="bg-[#D32F2F] px-6 py-6">
            <h2 className="text-xl font-bold text-white mb-1">融资与愿景</h2>
            <p className="text-white/80 text-sm">诚邀您成为"脉动网"的合伙人</p>
          </div>
          <div className="p-6">
            {/* 愿景与价值共享 */}
            <div className="bg-[#FAF3ED] rounded-lg p-6">
              <h3 className="font-semibold text-[#424242] mb-3 text-lg">愿景与价值共享</h3>
              <p className="text-[#424242] leading-relaxed">
                我们致力于构建全国首个基于信任的人脉资本共享网，合伙人将作为"脉动网"共享网络成长红利，共同推动人脉资源从"静态存储"向"动态资本"的范式革新。
              </p>
            </div>
          </div>
        </div>

        {/* 底部结束标识 */}
        <div className="text-center py-8">
          <p className="text-[#757575] text-sm">— END —</p>
        </div>
      </div>
    </div>
  );
}
