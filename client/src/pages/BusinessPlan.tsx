import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown, Circle } from 'lucide-react';

export default function BusinessPlan() {
  const [activeSection, setActiveSection] = useState(0);

  const sections = [
    { id: 0, title: '封面' },
    { id: 1, title: '现状挑战' },
    { id: 2, title: '创新概念' },
    { id: 3, title: '保障机制' },
    { id: 4, title: '竞争优势' },
    { id: 5, title: '市场价值' },
  ];

  useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.scrollY;
      const windowHeight = window.innerHeight;
      const newSection = Math.round(scrollPosition / windowHeight);
      setActiveSection(newSection);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToSection = (sectionId: number) => {
    window.scrollTo({
      top: sectionId * window.innerHeight,
      behavior: 'smooth',
    });
  };

  return (
    <div className="bg-[#1A1A1A] text-white">
      {/* 导航栏 */}
      <div className="fixed right-8 top-1/2 -translate-y-1/2 z-50 space-y-4">
        {sections.map((section) => (
          <button
            key={section.id}
            onClick={() => scrollToSection(section.id)}
            className="group flex items-center gap-3"
          >
            <span
              className={`text-sm transition-all ${
                activeSection === section.id
                  ? 'text-[#C5B358] opacity-100'
                  : 'text-gray-400 opacity-0 group-hover:opacity-100'
              }`}
            >
              {section.title}
            </span>
            <Circle
              size={12}
              className={`transition-all ${
                activeSection === section.id
                  ? 'fill-[#C5B358] text-[#C5B358]'
                  : 'fill-transparent text-gray-600'
              }`}
            />
          </button>
        ))}
      </div>

      {/* 第01章：封面 */}
      <section className="min-h-screen flex items-center justify-center relative bg-gradient-to-br from-[#A80000] to-[#660000]">
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1 }}
          className="text-center px-8"
        >
          <h1 className="text-7xl font-bold mb-8 tracking-wider">脉动</h1>
          <div className="h-1 w-32 bg-[#C5B358] mx-auto mb-8"></div>
          <h2 className="text-4xl mb-6">让您的人脉"动"起来</h2>
          <p className="text-xl text-gray-200 max-w-2xl mx-auto">
            基于分布式协议的专业人脉资本网络
          </p>
        </motion.div>

        <motion.div
          animate={{ y: [0, 10, 0] }}
          transition={{ repeat: Infinity, duration: 2 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2"
        >
          <ChevronDown size={32} className="text-[#C5B358]" />
        </motion.div>
      </section>

      {/* 第02章：现状挑战 */}
      <section className="min-h-screen flex items-center justify-center px-8 py-16">
        <div className="max-w-6xl w-full">
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            whileInView={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
          >
            <h2 className="text-5xl font-bold mb-4 text-[#C5B358]">01</h2>
            <h3 className="text-4xl font-bold mb-12">人脉管理的现状与挑战</h3>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-8 mb-16">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              viewport={{ once: true }}
              className="bg-[#2A2A2A] p-8 rounded-lg border border-[#A80000]/30 hover:border-[#A80000] transition-all"
            >
              <h4 className="text-2xl font-bold mb-4 text-[#A80000]">
                场景1：微信好友5000+的"虚假繁荣"
              </h4>
              <p className="text-gray-300 leading-relaxed">
                多数用户微信好友达上限5000人，但日常有效互动不足3%，大量联系人仅停留在"添加好友"状态，无法转化为实际机会。
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              viewport={{ once: true }}
              className="bg-[#2A2A2A] p-8 rounded-lg border border-[#A80000]/30 hover:border-[#A80000] transition-all"
            >
              <h4 className="text-2xl font-bold mb-4 text-[#A80000]">
                场景2：越来越没有存在感的通讯录
              </h4>
              <p className="text-gray-300 leading-relaxed">
                通讯录中存储的姓名、职位等静态信息，缺乏动态更新与场景化连接，导致"有资源找不到需求，有需求触达不到资源"的错位。
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              viewport={{ once: true }}
              className="bg-[#2A2A2A] p-8 rounded-lg border border-[#A80000]/30 hover:border-[#A80000] transition-all md:col-span-2"
            >
              <h4 className="text-2xl font-bold mb-4 text-[#A80000]">
                场景3：社交过后，人脉"无下文"
              </h4>
              <p className="text-gray-300 leading-relaxed">
                推杯换盏后，相见恨晚，看似建立了联系，但实际合作往往不了了之。很难获得社交以外的延展信息。
              </p>
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.5 }}
            viewport={{ once: true }}
            className="bg-gradient-to-r from-[#A80000]/20 to-[#C5B358]/20 p-8 rounded-lg border border-[#C5B358]/30"
          >
            <h4 className="text-3xl font-bold mb-6 text-[#C5B358]">
              邓巴数限制：个人管理半径的困境
            </h4>
            <div className="grid md:grid-cols-3 gap-6">
              <div>
                <h5 className="text-xl font-bold mb-3 text-white">
                  邓巴数字：认知负荷的天然边界
                </h5>
                <p className="text-gray-300">
                  人类大脑认知能力仅能稳定维护约150个强关系（邓巴数字），超出此范围的人脉难以深度管理。
                </p>
              </div>
              <div>
                <h5 className="text-xl font-bold mb-3 text-white">
                  海量数据与人脑容量的矛盾
                </h5>
                <p className="text-gray-300">
                  现代社交工具使个人联系人轻松突破5000+，但人脑无法同时处理超150人的深度关系，导致"管理半径"与"数据量"严重错位。
                </p>
              </div>
              <div>
                <h5 className="text-xl font-bold mb-3 text-white">
                  低效维护：时间成本与收益失衡
                </h5>
                <p className="text-gray-300">
                  用户试图维护超量人脉时，会陷入"广而不精"的困境：投入大量时间却无法建立信任，人脉质量与管理效率双降。
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* 第03章：创新概念 */}
      <section className="min-h-screen flex items-center justify-center px-8 py-16 bg-[#0F0F0F]">
        <div className="max-w-6xl w-full">
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            whileInView={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
          >
            <h2 className="text-5xl font-bold mb-4 text-[#C5B358]">02</h2>
            <h3 className="text-4xl font-bold mb-12">脉动的创新核心概念</h3>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
            className="mb-16"
          >
            <h4 className="text-3xl font-bold mb-8 text-[#A80000]">人脉共享</h4>
            <div className="grid md:grid-cols-2 gap-8">
              <div className="bg-[#2A2A2A] p-8 rounded-lg border border-[#C5B358]/30">
                <h5 className="text-2xl font-bold mb-4 text-[#C5B358]">
                  从线性到指数级的人脉增长
                </h5>
                <p className="text-gray-300 leading-relaxed">
                  通过人脉共享功能，让你认识一个人，就能认识他背后所有人脉，你的人脉圈即将实现指数级扩张，不再是1对1的线性积累，而是1对N的裂变式增长。
                </p>
              </div>
              <div className="bg-[#2A2A2A] p-8 rounded-lg border border-[#C5B358]/30">
                <h5 className="text-2xl font-bold mb-4 text-[#C5B358]">
                  人脉信息实时更新
                </h5>
                <p className="text-gray-300 leading-relaxed">
                  当你的共享人对他们的人脉进行新的标签或信息更新时，你会实时同步看到这些变动。确保你的人脉信息始终鲜活，精准，抓住每一个合作机会。
                </p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            viewport={{ once: true }}
          >
            <h4 className="text-3xl font-bold mb-8 text-[#A80000]">分布式管理</h4>
            <div className="space-y-6">
              <div className="bg-gradient-to-r from-[#A80000]/20 to-transparent p-8 rounded-lg border-l-4 border-[#A80000]">
                <h5 className="text-xl font-bold mb-3 text-white">
                  01 从个人维护到网络协同
                </h5>
                <p className="text-gray-300 leading-relaxed">
                  通过共享功能实现了人脉的分布式管理，打破个人管理半径限制，用户仅需维护核心150人信任圈，即可通过网络调用伙伴的人脉资源，实现"维护150人，连接10000人+"的资产倍增效应。系统会自动的将这些分散信息智能聚合，形成一个庞大而动态的整体人脉网络。
                </p>
              </div>
              <div className="bg-gradient-to-r from-[#C5B358]/20 to-transparent p-8 rounded-lg border-l-4 border-[#C5B358]">
                <h5 className="text-xl font-bold mb-3 text-white">
                  02 协议核心功能：标签索引
                </h5>
                <p className="text-gray-300 leading-relaxed">
                  协议通过标准化接口实现人脉标签的统一索引，支持用户为联系人添加"投资人""技术专家"等精准标签，标签信息在信任节点间安全交换，构建动态商业关系图谱。
                </p>
              </div>
              <div className="bg-gradient-to-r from-[#A80000]/20 to-transparent p-8 rounded-lg border-l-4 border-[#A80000]">
                <h5 className="text-xl font-bold mb-3 text-white">
                  03 熟人背书的不可替代性
                </h5>
                <p className="text-gray-300 leading-relaxed">
                  平台人脉基于真实社交关系链，每个引荐都附带多层熟人背书，这种基于现实信任的网络结构难以被陌生关系或算法推荐替代。
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* 第04章：保障机制 */}
      <section className="min-h-screen flex items-center justify-center px-8 py-16">
        <div className="max-w-6xl w-full">
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            whileInView={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
          >
            <h2 className="text-5xl font-bold mb-4 text-[#C5B358]">03</h2>
            <h3 className="text-4xl font-bold mb-12">共享背后的保障机制</h3>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
            className="bg-gradient-to-br from-[#A80000]/30 to-[#C5B358]/30 p-12 rounded-lg border border-[#C5B358]/50"
          >
            <h4 className="text-3xl font-bold mb-8 text-center text-[#C5B358]">
              安全引荐：隐私保护下的人脉调用
            </h4>
            <div className="grid md:grid-cols-3 gap-8">
              <div className="text-center">
                <div className="w-16 h-16 bg-[#A80000] rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl font-bold">01</span>
                </div>
                <h5 className="text-xl font-bold mb-3">隐私保护核心原则</h5>
                <p className="text-gray-300">
                  采用信息分级制度，仅传递需求标签与信任等级，不暴露个人敏感信息。
                </p>
              </div>
              <div className="text-center">
                <div className="w-16 h-16 bg-[#C5B358] rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl font-bold text-black">02</span>
                </div>
                <h5 className="text-xl font-bold mb-3">多层级权限控制</h5>
                <p className="text-gray-300">
                  设置"公开/私密/定向"三级权限，用户可自定义人脉开放范围，仅授权伙伴调用其已标记为"可引荐"的人脉资源。
                </p>
              </div>
              <div className="text-center">
                <div className="w-16 h-16 bg-[#A80000] rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl font-bold">03</span>
                </div>
                <h5 className="text-xl font-bold mb-3">信任连接</h5>
                <p className="text-gray-300">
                  专注于熟人关系的双向引荐，完成每一次成功的人脉引荐，都会增加双方的信任值，形成"使用-信任-再使用"的正向循环，使信任壁垒随使用时间自然增厚。
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* 第05章：竞争优势 */}
      <section className="min-h-screen flex items-center justify-center px-8 py-16 bg-[#0F0F0F]">
        <div className="max-w-6xl w-full">
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            whileInView={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
          >
            <h2 className="text-5xl font-bold mb-4 text-[#C5B358]">04</h2>
            <h3 className="text-4xl font-bold mb-12">脉动的竞争优势</h3>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
            className="mb-16"
          >
            <h4 className="text-3xl font-bold mb-8 text-[#A80000]">
              选品的顶层智慧
            </h4>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-[#2A2A2A] p-6 rounded-lg border border-[#A80000]/30 hover:border-[#A80000] transition-all">
                <h5 className="text-xl font-bold mb-3 text-[#C5B358]">
                  百倍数据杠杆
                </h5>
                <p className="text-gray-300">
                  共享单车只知道用户几点上下班活动半径，我们的每个用户会把100+重要人脉存入系统，相当于把用户的整个商业生态都映射到了数据库。同等用户体量下，我们的数据资产是其100倍。
                </p>
              </div>
              <div className="bg-[#2A2A2A] p-6 rounded-lg border border-[#A80000]/30 hover:border-[#A80000] transition-all">
                <h5 className="text-xl font-bold mb-3 text-[#C5B358]">
                  精准标签价值
                </h5>
                <p className="text-gray-300">
                  用户主动为人脉打上"投资人""股民""医生"等精准标签，这不仅是数据，更是经用户自我验证，高度结构化的商业关系图谱。其价值远超"骑行轨迹"这类浅层数据。
                </p>
              </div>
              <div className="bg-[#2A2A2A] p-6 rounded-lg border border-[#A80000]/30 hover:border-[#A80000] transition-all">
                <h5 className="text-xl font-bold mb-3 text-[#C5B358]">
                  关系资产的沉淀与绑定
                </h5>
                <p className="text-gray-300">
                  依赖于真实人脉的长期积累和信任传递，而非单纯技术架构，新进入者即便复制功能，也无法短期内构建同等密度的信任关系网络，难以突破先发优势。
                </p>
              </div>
              <div className="bg-[#2A2A2A] p-6 rounded-lg border border-[#A80000]/30 hover:border-[#A80000] transition-all">
                <h5 className="text-xl font-bold mb-3 text-[#C5B358]">
                  轻量化的产业结构
                </h5>
                <p className="text-gray-300">
                  比起共享单车，共享充电宝初创时巨大的产品设备投入（采购自行车和充电宝）脉动的产品"就是用户本身就有的人脉"，自行车充电宝越用越旧，人脉却是越用越熟。产品层面有着得天独厚的优势。
                </p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            viewport={{ once: true }}
          >
            <h4 className="text-3xl font-bold mb-8 text-[#A80000]">
              爆款的底层基因
            </h4>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-gradient-to-br from-[#A80000]/20 to-transparent p-6 rounded-lg border-l-4 border-[#A80000]">
                <h5 className="text-xl font-bold mb-3 text-white">
                  传统共享的"伪共享"困境
                </h5>
                <p className="text-gray-300">
                  共享单车，充电宝等，只解决了产品与使用者联系，用户不会主动分享传播，全靠资本砸钱和人为推动市场，增长模式单一成本高昂。
                </p>
              </div>
              <div className="bg-gradient-to-br from-[#C5B358]/20 to-transparent p-6 rounded-lg border-l-4 border-[#C5B358]">
                <h5 className="text-xl font-bold mb-3 text-white">
                  脉动天然的"爆款基因"
                </h5>
                <p className="text-gray-300">
                  当用户拥有"认识一人，瞬间共享其全部人脉"的超能力，他会天然的渴望更多人使用。人脉共享机制被写入底层基因，驱动用户主动分享与传播。
                </p>
              </div>
              <div className="bg-gradient-to-br from-[#A80000]/20 to-transparent p-6 rounded-lg border-l-4 border-[#A80000]">
                <h5 className="text-xl font-bold mb-3 text-white">
                  零成本试错 无限拓展边界
                </h5>
                <p className="text-gray-300">
                  比起传统认识人脉的成本，脉动共享的成本低至极限。即使对方未共享，自身也无实质损失。却能换来绝大多数互动，变相拥有了无限试错的超能力。
                </p>
              </div>
              <div className="bg-gradient-to-br from-[#C5B358]/20 to-transparent p-6 rounded-lg border-l-4 border-[#C5B358]">
                <h5 className="text-xl font-bold mb-3 text-white">
                  价值具象化 用我有的换我要的
                </h5>
                <p className="text-gray-300">
                  生意难做，核心就是各方都在权衡利弊。脉动将人脉具象化为价值。用"1000人脉换100人脉"交换变得天然容易，市场推动不再受阻。
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* 第06章：市场价值 + 融资 */}
      <section className="min-h-screen flex items-center justify-center px-8 py-16">
        <div className="max-w-6xl w-full">
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            whileInView={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
          >
            <h2 className="text-5xl font-bold mb-4 text-[#C5B358]">05</h2>
            <h3 className="text-4xl font-bold mb-12">市场与价值分析</h3>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
            className="mb-16"
          >
            <h4 className="text-3xl font-bold mb-8 text-[#A80000]">
              数据资产的百倍杠杆
            </h4>
            <div className="grid md:grid-cols-3 gap-6">
              <div className="bg-[#2A2A2A] p-6 rounded-lg border border-[#C5B358]/30">
                <h5 className="text-xl font-bold mb-3 text-[#C5B358]">
                  流量型产品的数据局限
                </h5>
                <p className="text-gray-300">
                  共享单车等流量型产品，单个用户仅对应基础行为数据点（如骑行轨迹），数据维度单一、价值密度低。
                </p>
              </div>
              <div className="bg-[#2A2A2A] p-6 rounded-lg border border-[#C5B358]/30">
                <h5 className="text-xl font-bold mb-3 text-[#C5B358]">
                  脉动的人脉数据杠杆效应
                </h5>
                <p className="text-gray-300">
                  脉动用户平均带来100个高质量社会关系与商务人脉，同等用户体量下，核心数据资产规模是流量型产品的100倍。
                </p>
              </div>
              <div className="bg-[#2A2A2A] p-6 rounded-lg border border-[#C5B358]/30">
                <h5 className="text-xl font-bold mb-3 text-[#C5B358]">
                  人脉网络的指数级价值
                </h5>
                <p className="text-gray-300">
                  用户人脉具备网络属性，通过"信任连接"实现资源联动，数据资产随网络扩张呈现指数级增值，突破传统流量产品线性增长瓶颈。
                </p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            viewport={{ once: true }}
            className="mb-16"
          >
            <h4 className="text-3xl font-bold mb-8 text-[#A80000]">
              数据价值的精准提纯
            </h4>
            <div className="space-y-4">
              <div className="bg-gradient-to-r from-[#A80000]/20 to-transparent p-6 rounded-lg border-l-4 border-[#A80000]">
                <h5 className="text-xl font-bold mb-3 text-white">
                  用户主动标签的自我验证机制
                </h5>
                <p className="text-gray-300">
                  用户为联系人标注"投资人""大宗贸易""股票"等精准标签，数据经用户自我验证，真实性与相关性远高于被动采集信息。
                </p>
              </div>
              <div className="bg-gradient-to-r from-[#C5B358]/20 to-transparent p-6 rounded-lg border-l-4 border-[#C5B358]">
                <h5 className="text-xl font-bold mb-3 text-white">
                  高度结构化的商业关系图谱
                </h5>
                <p className="text-gray-300">
                  标签化数据构建动态鲜活的商业关系网络，实现人脉资源的精准分类与快速匹配，解决传统通讯录"信息孤岛"问题。
                </p>
              </div>
              <div className="bg-gradient-to-r from-[#A80000]/20 to-transparent p-6 rounded-lg border-l-4 border-[#A80000]">
                <h5 className="text-xl font-bold mb-3 text-white">
                  浅层数据与深度数据的价值差异
                </h5>
                <p className="text-gray-300">
                  相较于共享单车"骑行轨迹"等浅层行为数据，脉动的标签化人脉数据直接关联商业合作可能性，商业转化效率与价值密度呈量级提升。
                </p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            viewport={{ once: true }}
            className="bg-gradient-to-br from-[#A80000] to-[#660000] p-12 rounded-lg"
          >
            <h2 className="text-5xl font-bold mb-4 text-[#C5B358]">06</h2>
            <h3 className="text-4xl font-bold mb-8">融资与愿景</h3>
            <h4 className="text-3xl font-bold mb-8 text-center">
              诚邀您成为"脉动网"的合伙人
            </h4>
            <div className="grid md:grid-cols-2 gap-8">
              <div>
                <h5 className="text-2xl font-bold mb-4 text-[#C5B358]">
                  天使轮融资计划
                </h5>
                <p className="text-gray-200 leading-relaxed mb-4">
                  本轮计划融资6600万元，资金50%将用市场份额的扩张以及城市节点布局和市场教育，加速网络效应形成。
                </p>
                <p className="text-gray-200 leading-relaxed">
                  50%将用于公司的运营与技术的储备，重点布局AI时代对脉动网的全面赋能，夯实项目技术壁垒与市场覆盖基础。
                </p>
              </div>
              <div>
                <h5 className="text-2xl font-bold mb-4 text-[#C5B358]">
                  愿景与价值共享
                </h5>
                <p className="text-gray-200 leading-relaxed">
                  我们致力于构建全国首个基于信任的人脉资本共享网，合伙人将作为"脉动网"共享网络成长红利，共同推动人脉资源从"静态存储"向"动态资本"的范式革新。
                </p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ duration: 1, delay: 0.6 }}
            viewport={{ once: true }}
            className="text-center mt-16"
          >
            <h2 className="text-6xl font-bold text-[#C5B358] mb-4">谢谢</h2>
            <p className="text-2xl text-gray-400">THE END</p>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
