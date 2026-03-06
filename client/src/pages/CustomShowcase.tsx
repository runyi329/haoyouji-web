import { useState, useEffect } from "react";
import { Link } from "wouter";
import {
  ChevronLeft, Gem, X, MessageSquare, TrendingUp, Heart, GraduationCap,
  Home, Briefcase, Utensils, Car, Dumbbell, Music, Building2, Users, Star,
  ArrowRight, Zap, Rocket, Plane, Coffee, Pill, Wrench, PiggyBank,
  BookOpen, Bike, Package, Hotel, Leaf, Baby, Gamepad2, Scissors,
  Truck, Landmark, ShoppingBag, Camera, Stethoscope, Wallet, Paintbrush,
  Fish, Flower2, Globe, Headphones, Layers, MapPin, Monitor, Newspaper,
  Phone, Printer, Radio, Shield, Shirt, ShoppingCart, Soup, Syringe,
  Tent, Trophy, Tv, Umbrella, Volleyball, Watch, Wine, Zap as ZapIcon
} from "lucide-react";

// ===== 场景数据 =====
const SCENARIOS: Record<string, {
  id: string; label: string; icon: any; color: string;
  desc: string; aiDesc: string; current: string; future: string; examples: string[];
}> = {
  core: { id: "core", label: "底层账本\n引擎", icon: Gem, color: "#C62828", desc: "以账本共享为底层逻辑，无限延伸定制场景", aiDesc: "「宇宙级数据引擎」——每一笔记录都是量子态，在多人协作的观测中坍缩为真相。", current: "多人实时共享账本，数据永久留存，权限精细管控。", future: "AI将分析所有账本的行为模式，自动识别异常、预测趋势，成为你的财务大脑。", examples: [] },
  food: { id: "food", label: "餐饮\n门店", icon: Utensils, color: "#E64A19", desc: "餐厅桌号意见本、连锁门店反馈系统", aiDesc: "「味觉神经网络」——每条顾客留言都是神经元，AI实时感知你的口碑生命体征。", current: "顾客扫码免注册留意见，老板实时收到，按分店/桌号筛选查看。", future: "AI分析留言情绪，自动识别「高危投诉」，在差评扩散前主动预警。", examples: ["扫码留意见", "连锁分店管理", "菜品评分"] },
  health: { id: "health", label: "健康\n管理", icon: Heart, color: "#AD1457", desc: "减肥打卡账本、健身记录、医疗费用共享追踪", aiDesc: "「生物节律解码器」——不只是记录你的健康，它在为你编程未来10年的体质。", current: "好友共同健身账本，互相监督打卡，记录每次训练数据。", future: "AI分析饮食逻辑与肌肉反馈，逆向推演生物损耗模型，精准预测免疫低点。", examples: ["共享减肥计划", "健身打卡记录", "医疗费用追踪"] },
  education: { id: "education", label: "教育\n培训", icon: GraduationCap, color: "#283593", desc: "学费分摊账本、培训班收支、学生成绩追踪", aiDesc: "「知识契约系统」——不再是冰冷数字，而是教练与学员之间的实时生长契约。", current: "学员缴费记录、课时追踪，教练与学员双方共同可见进度。", future: "AI根据学员练习数据实时语音点评，自动调整次日课表，双方共同签署周报。", examples: ["学费分摊", "培训收支", "学习打卡"] },
  business: { id: "business", label: "商业\n合作", icon: Briefcase, color: "#4E342E", desc: "合伙人账本、项目分成记录、股权追踪", aiDesc: "「信任量化引擎」——将利益分配变成可被所有人验证的数学公式。", current: "合伙人账本，收益分配记录，资金进出追踪，权限分级管控。", future: "AI自动识别资金异常流向，生成可信度评分，在信任危机发生前发出预警。", examples: ["合伙人分账", "项目收益分成", "股权记录"] },
  family: { id: "family", label: "家庭\n生活", icon: Home, color: "#2E7D32", desc: "家庭共同账本、装修费用追踪、家庭旅行预算", aiDesc: "「家庭财务基因图谱」——每笔开销都是家庭价值观的像素点，AI拼成你们独有的生活画像。", current: "家庭共同账本，装修费用追踪，旅行预算管理，全家实时可见。", future: "AI分析家庭消费基因，识别「隐性焦虑支出」，为家庭财务健康打分并给出优化建议。", examples: ["家庭共同账本", "装修费用", "旅行预算"] },
  social: { id: "social", label: "社群\n运营", icon: Users, color: "#6A1B9A", desc: "社群活动费用、AA制聚餐、团购分摊", aiDesc: "「社群能量场监测仪」——每次AA分摊都是社群凝聚力的脉冲，AI实时感知社群生命力。", current: "AA制聚餐、团购分摊、活动费用，多人实时记账，自动计算人均。", future: "AI分析参与频率与消费模式，识别「核心成员」与「边缘流失」，为社群运营提供数据支撑。", examples: ["AA制聚餐", "团购分摊", "活动费用"] },
  restaurant: { id: "restaurant", label: "连锁\n餐厅", icon: Building2, color: "#BF360C", desc: "多门店意见收集，顾客扫码免注册留言", aiDesc: "「口碑雷达」——30家门店的每条留言，都是AI感知品牌健康度的神经末梢。", current: "30家门店统一管理，桌号二维码，顾客扫码留言，按分店筛选。", future: "AI实时分析各门店情绪曲线，自动生成「门店健康报告」，识别需重点关注的分店。", examples: ["30家门店统一管理", "桌号二维码", "实时意见汇总"] },
  fitness: { id: "fitness", label: "健身\n打卡", icon: Dumbbell, color: "#880E4F", desc: "好友共同健身账本，互相监督打卡，记录每次训练", aiDesc: "「肌肉记忆银行」——每次打卡都是一笔存款，AI计算身体的复利增长曲线。", current: "好友互督打卡，训练记录，目标追踪，共同可见进度。", future: "AI分析训练节奏，在即将过度训练前自动预警，并推荐最优恢复方案。", examples: ["好友互督", "训练记录", "目标追踪"] },
  tutoring: { id: "tutoring", label: "培训\n收费", icon: Star, color: "#1A237E", desc: "培训机构收费账本，学员缴费记录，课时追踪", aiDesc: "「学习价值转化器」——将每分培训费转化为可量化的能力增长数据。", current: "学员缴费记录，课时追踪，收入统计，学员进度可视化。", future: "AI根据缴费周期与学习进度的相关性，预测续费概率，提前30天触发续费提醒。", examples: ["学员缴费", "课时记录", "收入统计"] },
  investment: { id: "investment", label: "投资\n跟踪", icon: TrendingUp, color: "#3E2723", desc: "合伙投资账本，收益分配记录，资金进出追踪", aiDesc: "「财富量子纠缠系统」——合伙人之间的每笔资金流动，在AI观测下保持量子纠缠态。", current: "收益分配记录，资金追踪，持仓记录，合伙人实时可见。", future: "AI识别资金异常模式，自动生成可信度报告，在信任危机前主动预警。", examples: ["收益分配", "资金追踪", "持仓记录"] },
  travel: { id: "travel", label: "旅行\nAA", icon: Plane, color: "#004D40", desc: "多人旅行费用AA，实时记录各项开销，自动计算人均", aiDesc: "「旅行记忆晶体」——每笔开销都是旅行记忆的像素，AI将它们永久封存为时光胶囊。", current: "实时记账，人均计算，费用分摊，多人协作记录。", future: "AI分析旅行消费偏好，下次出行前自动生成个性化预算方案。", examples: ["实时记账", "人均计算", "费用分摊"] },
  event: { id: "event", label: "活动\n策划", icon: Music, color: "#4A148C", desc: "活动收支账本，门票收入、场地费用、物料采购一目了然", aiDesc: "「活动能量守恒定律」——AI实时监测每分预算流向，确保能量在最关键节点精准爆发。", current: "收支明细，预算管理，成本核算，多人协作记录。", future: "AI分析历史活动数据，自动识别「超支风险点」，在预算耗尽前发出预警。", examples: ["收支明细", "预算管理", "成本核算"] },
  retail: { id: "retail", label: "零售\n门店", icon: ShoppingCart, color: "#B71C1C", desc: "门店日常收支、进货记录、员工提成分账", aiDesc: "「商业脉搏感知器」——每笔进出账都是门店生命体征的一次心跳。", current: "日常收支记录，进货追踪，员工提成自动分账。", future: "AI分析销售节奏，预测补货时机，识别滞销品，优化库存结构。", examples: ["日常收支", "进货记录", "提成分账"] },
  medical: { id: "medical", label: "医疗\n费用", icon: Pill, color: "#880E4F", desc: "家庭医疗费用共享追踪，报销记录，慢性病用药账本", aiDesc: "「健康资产守护者」——将每分医疗支出转化为家庭健康资产的量化数据。", current: "医疗费用共享追踪，报销记录，用药账本，家人共同可见。", future: "AI分析医疗支出模式，识别健康风险信号，提前预警潜在高额医疗支出。", examples: ["医疗费用追踪", "报销记录", "用药账本"] },
  cafe: { id: "cafe", label: "咖啡\n连锁", icon: Coffee, color: "#4E342E", desc: "咖啡连锁门店顾客意见收集与会员积分追踪", aiDesc: "「咖啡因情绪图谱」——每杯咖啡背后的留言，都是顾客情绪的精准采样。", current: "顾客扫码留言，按门店/时段筛选，会员积分追踪。", future: "AI识别高价值顾客，自动触发个性化优惠推送。", examples: ["顾客留言", "会员积分", "门店对比"] },
  hotel: { id: "hotel", label: "民宿\n管理", icon: Hotel, color: "#37474F", desc: "民宿/酒店客户反馈收集，房间收支追踪", aiDesc: "「住宿体验量子化」——每条住客反馈都是民宿体验的精准像素。", current: "客户反馈收集，房间收支追踪，多房间管理。", future: "AI分析入住评价趋势，自动识别需要整改的房间问题。", examples: ["客户反馈", "房间收支", "多房管理"] },
  bike: { id: "bike", label: "骑行\n打卡", icon: Bike, color: "#1B5E20", desc: "骑行俱乐部费用AA，里程打卡，装备费用分摊", aiDesc: "「骑行轨迹银行」——每公里都是存款，AI为你计算体能的复利增长。", current: "里程打卡，费用AA，装备分摊，俱乐部成员共同可见。", future: "AI分析骑行数据，预测最优训练节奏，识别过度疲劳风险。", examples: ["里程打卡", "费用AA", "装备分摊"] },
  baby: { id: "baby", label: "育儿\n账本", icon: Baby, color: "#880E4F", desc: "育儿费用追踪，夫妻共同记账，成长里程碑记录", aiDesc: "「成长基因档案」——每笔育儿支出都是孩子成长轨迹的一个坐标点。", current: "育儿费用追踪，夫妻共同记账，成长里程碑记录。", future: "AI分析育儿支出结构，识别「焦虑型消费」，给出科学育儿预算建议。", examples: ["育儿费用", "夫妻共账", "成长记录"] },
  repair: { id: "repair", label: "维修\n服务", icon: Wrench, color: "#BF360C", desc: "维修店收支记录、零件进货追踪、客户维修记录", aiDesc: "「故障预知系统」——每次维修记录都是设备健康数据库的一个样本。", current: "收支记录，零件进货追踪，客户维修历史查询。", future: "AI分析维修频率，识别高频故障模式，提前向客户推荐预防性维护。", examples: ["收支记录", "零件追踪", "客户历史"] },
  savings: { id: "savings", label: "存钱\n挑战", icon: PiggyBank, color: "#0D47A1", desc: "好友共同存钱挑战，每日打卡，目标可视化追踪", aiDesc: "「财富引力场」——当多人的储蓄意志叠加，AI将它们放大为不可阻挡的财富引力。", current: "好友共同存钱挑战，每日打卡，目标进度可视化。", future: "AI分析存钱节奏，识别「意志力低谷」，在放弃前主动发出激励推送。", examples: ["存钱打卡", "目标追踪", "好友监督"] },
  reading: { id: "reading", label: "读书\n打卡", icon: BookOpen, color: "#006064", desc: "读书俱乐部费用分摊，读书笔记共享，打卡记录", aiDesc: "「知识密度测量仪」——AI量化每本书对你认知体系的改变程度。", current: "读书打卡，笔记共享，俱乐部费用分摊。", future: "AI分析阅读偏好，识别知识盲区，推荐最优阅读路径。", examples: ["读书打卡", "笔记共享", "费用分摊"] },
  delivery: { id: "delivery", label: "配送\n管理", icon: Truck, color: "#E65100", desc: "配送团队收支、订单追踪、骑手提成分账", aiDesc: "「物流神经网络」——每次配送都是城市毛细血管的一次脉冲。", current: "订单收支追踪，骑手提成自动分账，团队绩效记录。", future: "AI分析配送效率，识别高峰时段，优化人员调度方案。", examples: ["订单追踪", "提成分账", "绩效记录"] },
  game: { id: "game", label: "游戏\n公会", icon: Gamepad2, color: "#880E4F", desc: "游戏公会费用分摊、装备购买记录、战利品分配", aiDesc: "「公会经济引擎」——将虚拟世界的每笔交易变成可信的链上记录。", current: "公会费用分摊，装备购买记录，战利品分配追踪。", future: "AI分析公会经济健康度，识别「搭便车」行为，优化贡献度评估体系。", examples: ["费用分摊", "装备记录", "战利品分配"] },
  beauty: { id: "beauty", label: "美容\n工作室", icon: Scissors, color: "#4A148C", desc: "美容工作室客户反馈、预约收支、美容师提成", aiDesc: "「美丽价值感知器」——每条客户反馈都是美容师技艺的精准评分。", current: "客户反馈收集，预约收支记录，美容师提成分账。", future: "AI分析客户满意度趋势，识别回头率下降信号，提前预警客户流失风险。", examples: ["客户反馈", "预约收支", "提成分账"] },
  eco: { id: "eco", label: "环保\n打卡", icon: Leaf, color: "#1B5E20", desc: "环保行动打卡、碳积分追踪、公益活动费用分摊", aiDesc: "「碳足迹量化引擎」——将每次环保行动转化为可量化的地球贡献值。", current: "环保打卡，碳积分追踪，公益活动费用分摊。", future: "AI分析团队碳减排贡献，生成可信碳积分报告，对接碳交易市场。", examples: ["环保打卡", "碳积分", "公益费用"] },
  finance: { id: "finance", label: "理财\n记录", icon: Landmark, color: "#1A237E", desc: "个人理财记录、基金定投追踪、家庭资产配置", aiDesc: "「财富熵减系统」——AI将混沌的资产数据转化为清晰的财富增长方程式。", current: "理财记录，基金定投追踪，家庭资产配置可视化。", future: "AI分析资产配置结构，识别风险集中点，推荐再平衡方案。", examples: ["理财记录", "定投追踪", "资产配置"] },
  car: { id: "car", label: "用车\n记账", icon: Car, color: "#E65100", desc: "私家车费用记录、加油、保养、保险分摊", aiDesc: "「出行成本解构器」——AI将每公里的真实成本精准拆解，让你看清用车的隐性代价。", current: "加油、保养、保险费用记录，多人用车费用分摊。", future: "AI分析用车成本结构，识别「高成本时段」，推荐最优出行方案。", examples: ["加油记录", "保养追踪", "费用分摊"] },
  photo: { id: "photo", label: "摄影\n工作室", icon: Camera, color: "#311B92", desc: "摄影工作室收支、客户预付款追踪、设备折旧记录", aiDesc: "「光影价值量化器」——将每次快门背后的商业价值精准记录。", current: "客户预付款追踪，收支记录，设备折旧账本。", future: "AI分析接单节奏，预测旺季需求，优化档期排布。", examples: ["客户预付款", "收支记录", "设备折旧"] },
  sport: { id: "sport", label: "运动\n赛事", icon: Trophy, color: "#BF360C", desc: "运动赛事费用分摊、奖金分配、装备采购记录", aiDesc: "「竞技能量守恒系统」——将每次比赛的投入与产出精准量化。", current: "赛事费用分摊，奖金分配记录，装备采购追踪。", future: "AI分析团队投入产出比，识别最优资源配置方案。", examples: ["赛事费用", "奖金分配", "装备采购"] },
  wine: { id: "wine", label: "酒水\n采购", icon: Wine, color: "#4A148C", desc: "酒水采购账本、库存追踪、宴席费用分摊", aiDesc: "「液态资产管理器」——将每瓶酒的价值流动精准记录在区块链上。", current: "采购记录，库存追踪，宴席费用分摊，多人共同可见。", future: "AI分析消费偏好，预测补货时机，识别高性价比采购窗口。", examples: ["采购记录", "库存追踪", "宴席分摊"] },
  clothing: { id: "clothing", label: "服装\n门店", icon: Shirt, color: "#880E4F", desc: "服装门店收支、进货记录、销售员提成分账", aiDesc: "「时尚价值感知器」——将每件衣服的商业旅程精准记录。", current: "进货记录，销售收支，员工提成自动分账。", future: "AI分析销售趋势，预测爆款款式，优化进货结构。", examples: ["进货记录", "销售收支", "提成分账"] },
  pet: { id: "pet", label: "宠物\n账本", icon: Flower2, color: "#2E7D32", desc: "宠物医疗、食品、美容费用追踪，多宠物管理", aiDesc: "「毛孩子资产守护者」——将每分宠物支出转化为可量化的生命质量数据。", current: "宠物费用追踪，多宠物管理，医疗记录，家庭成员共同可见。", future: "AI分析宠物健康支出模式，识别健康风险信号，提前预警潜在医疗支出。", examples: ["医疗记录", "食品追踪", "美容费用"] },
  realestate: { id: "realestate", label: "房产\n租赁", icon: MapPin, color: "#37474F", desc: "房产租赁收支、维修费用追踪、多房东分账", aiDesc: "「不动产现金流量子化」——将每套房产的资金流动精准记录在时间轴上。", current: "租金收支记录，维修费用追踪，多房东分账管理。", future: "AI分析租金收益率，识别空置风险，推荐最优租赁策略。", examples: ["租金收支", "维修追踪", "多房东分账"] },
  insurance: { id: "insurance", label: "保险\n记录", icon: Shield, color: "#1A237E", desc: "家庭保险保单记录、保费追踪、理赔记录管理", aiDesc: "「风险对冲量化器」——将每张保单的保障价值精准量化。", current: "保单记录，保费追踪，理赔记录，家庭成员共同可见。", future: "AI分析保障缺口，识别重复投保，推荐最优保险组合方案。", examples: ["保单记录", "保费追踪", "理赔记录"] },
  freelance: { id: "freelance", label: "自由\n职业", icon: Monitor, color: "#4E342E", desc: "自由职业收入记录、项目分成、税务追踪", aiDesc: "「自由职业价值量化器」——将每个项目的时间投入与收益精准对应。", current: "收入记录，项目分成，税务追踪，客户管理。", future: "AI分析项目收益率，识别高价值客户，优化接单策略。", examples: ["收入记录", "项目分成", "税务追踪"] },
  agriculture: { id: "agriculture", label: "农业\n合作", icon: Tent, color: "#1B5E20", desc: "农业合作社收支、产品销售记录、成员分红", aiDesc: "「土地价值量化引擎」——将每亩土地的产出精准记录在数字账本上。", current: "合作社收支，产品销售记录，成员分红追踪。", future: "AI分析农产品价格趋势，预测最优销售时机，优化种植结构。", examples: ["收支记录", "销售追踪", "成员分红"] },
  media: { id: "media", label: "自媒体\n收益", icon: Tv, color: "#311B92", desc: "自媒体广告收益、MCN分成、内容创作成本追踪", aiDesc: "「内容价值量化器」——将每条内容的商业价值精准记录在时间轴上。", current: "广告收益记录，MCN分成追踪，内容创作成本管理。", future: "AI分析内容收益率，识别高价值内容类型，优化创作策略。", examples: ["广告收益", "MCN分成", "创作成本"] },
  wedding: { id: "wedding", label: "婚礼\n策划", icon: Flower2, color: "#880E4F", desc: "婚礼费用追踪、礼金记录、供应商付款管理", aiDesc: "「幸福价值量化器」——将每分婚礼投入转化为可量化的幸福指数。", current: "婚礼费用追踪，礼金记录，供应商付款管理，双方家庭共同可见。", future: "AI分析婚礼预算结构，识别超支风险点，推荐最优资源配置方案。", examples: ["费用追踪", "礼金记录", "供应商管理"] },
  volunteer: { id: "volunteer", label: "公益\n志愿", icon: Globe, color: "#006064", desc: "公益项目费用追踪、捐款记录、志愿者时间银行", aiDesc: "「善意价值量化器」——将每次公益行动转化为可量化的社会贡献值。", current: "公益费用追踪，捐款记录，志愿者时间银行管理。", future: "AI分析公益投入产出比，识别最高效的公益模式，优化资源配置。", examples: ["费用追踪", "捐款记录", "时间银行"] },
  startup: { id: "startup", label: "创业\n团队", icon: Rocket, color: "#BF360C", desc: "创业团队收支、股权追踪、融资记录管理", aiDesc: "「创业生命体征监测仪」——将每分创业投入转化为可量化的商业价值数据。", current: "团队收支，股权追踪，融资记录，投资人共同可见。", future: "AI分析创业财务健康度，识别资金断裂风险，提前30天发出预警。", examples: ["团队收支", "股权追踪", "融资记录"] },
  music2: { id: "music2", label: "音乐\n工作室", icon: Headphones, color: "#4A148C", desc: "音乐工作室收支、版权收益分成、录音成本追踪", aiDesc: "「声波价值量化器」——将每个音符背后的商业价值精准记录。", current: "版权收益分成，录音成本追踪，工作室收支管理。", future: "AI分析版权收益趋势，识别高价值版权，优化版权运营策略。", examples: ["版权收益", "录音成本", "工作室收支"] },
  dental: { id: "dental", label: "口腔\n诊所", icon: Stethoscope, color: "#1A237E", desc: "口腔诊所收支、患者预约记录、医生提成分账", aiDesc: "「口腔健康价值量化器」——将每次诊疗的价值精准记录在数字账本上。", current: "诊所收支，患者预约记录，医生提成自动分账。", future: "AI分析患者复诊率，识别流失风险，提前触发复诊提醒。", examples: ["诊所收支", "预约记录", "提成分账"] },
  childcare: { id: "childcare", label: "托育\n机构", icon: Baby, color: "#2E7D32", desc: "托育机构收费、家长反馈收集、教师绩效追踪", aiDesc: "「成长价值守护者」——将每分托育投入转化为可量化的儿童发展数据。", current: "收费记录，家长反馈收集，教师绩效追踪，家长实时可见。", future: "AI分析儿童发展数据，识别发展迟缓信号，提前预警并推荐干预方案。", examples: ["收费记录", "家长反馈", "教师绩效"] },
  gym: { id: "gym", label: "健身房\n管理", icon: Dumbbell, color: "#BF360C", desc: "健身房会员收费、教练课时追踪、设备维护记录", aiDesc: "「体能资产管理器」——将每分会员投入转化为可量化的体能增长数据。", current: "会员收费，教练课时追踪，设备维护记录，会员进度可视化。", future: "AI分析会员续费率，识别流失风险，提前30天触发续费提醒。", examples: ["会员收费", "课时追踪", "设备维护"] },
  logistics: { id: "logistics", label: "仓储\n管理", icon: Package, color: "#4E342E", desc: "小型仓储收支、货物进出记录、租金分摊", aiDesc: "「库存生命体征监测仪」——每次货物进出都是仓储系统的一次呼吸。", current: "货物进出记录，收支追踪，租金分摊管理。", future: "AI分析库存周转率，预测滞销风险，优化仓储空间利用率。", examples: ["货物进出", "收支追踪", "租金分摊"] },
};

// ===== 蜂巢坐标系（pointy-top axial 坐标）=====
function hexToPixel(q: number, r: number, size: number) {
  return {
    x: size * (Math.sqrt(3) * q + Math.sqrt(3) / 2 * r),
    y: size * (3 / 2 * r)
  };
}

// 5圈完整蜂巢网格（中心+1圈6+2圈12+3圈18+4圈24+5圈30 = 91个节点）
// 只取需要的数量，按圈分配场景
const HEX_GRID = [
  // 中心
  { q: 0, r: 0, id: "core" },
  // 第一圈（6）
  { q: 1, r: 0, id: "food" },
  { q: 0, r: 1, id: "health" },
  { q: -1, r: 1, id: "education" },
  { q: -1, r: 0, id: "business" },
  { q: 0, r: -1, id: "family" },
  { q: 1, r: -1, id: "social" },
  // 第二圈（12）
  { q: 2, r: 0, id: "restaurant" },
  { q: 1, r: 1, id: "fitness" },
  { q: 0, r: 2, id: "tutoring" },
  { q: -1, r: 2, id: "investment" },
  { q: -2, r: 2, id: "travel" },
  { q: -2, r: 1, id: "event" },
  { q: -2, r: 0, id: "retail" },
  { q: -1, r: -1, id: "medical" },
  { q: 0, r: -2, id: "cafe" },
  { q: 1, r: -2, id: "hotel" },
  { q: 2, r: -2, id: "bike" },
  { q: 2, r: -1, id: "baby" },
  // 第三圈（18）
  { q: 3, r: 0, id: "repair" },
  { q: 3, r: -1, id: "savings" },
  { q: 3, r: -2, id: "reading" },
  { q: 3, r: -3, id: "delivery" },
  { q: 2, r: -3, id: "game" },
  { q: 1, r: -3, id: "beauty" },
  { q: 0, r: -3, id: "eco" },
  { q: -1, r: -2, id: "finance" },
  { q: -2, r: -1, id: "car" },
  { q: -3, r: 0, id: "photo" },
  { q: -3, r: 1, id: "sport" },
  { q: -3, r: 2, id: "wine" },
  { q: -3, r: 3, id: "clothing" },
  { q: -2, r: 3, id: "pet" },
  { q: -1, r: 3, id: "realestate" },
  { q: 0, r: 3, id: "insurance" },
  { q: 1, r: 2, id: "freelance" },
  { q: 2, r: 1, id: "agriculture" },
  // 第四圈（24）
  { q: 4, r: 0, id: "media" },
  { q: 4, r: -1, id: "wedding" },
  { q: 4, r: -2, id: "volunteer" },
  { q: 4, r: -3, id: "startup" },
  { q: 4, r: -4, id: "music2" },
  { q: 3, r: -4, id: "dental" },
  { q: 2, r: -4, id: "childcare" },
  { q: 1, r: -4, id: "gym" },
  { q: 0, r: -4, id: "logistics" },
  { q: -1, r: -3, id: "media" },
  { q: -2, r: -2, id: "wedding" },
  { q: -3, r: -1, id: "volunteer" },
  { q: -4, r: 0, id: "startup" },
  { q: -4, r: 1, id: "music2" },
  { q: -4, r: 2, id: "dental" },
  { q: -4, r: 3, id: "childcare" },
  { q: -4, r: 4, id: "gym" },
  { q: -3, r: 4, id: "logistics" },
  { q: -2, r: 4, id: "media" },
  { q: -1, r: 4, id: "wedding" },
  { q: 0, r: 4, id: "volunteer" },
  { q: 1, r: 3, id: "startup" },
  { q: 2, r: 2, id: "music2" },
  { q: 3, r: 1, id: "dental" },
];

// ===== 三段式详情弹窗 =====
function DetailCard({ scenario, onClose }: {
  scenario: typeof SCENARIOS[string]; onClose: () => void;
}) {
  const Icon = scenario.icon;
  const accentColor = "#CBA471";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.8)" }}
      onClick={onClose}>
      <div className="w-full max-w-md rounded-t-3xl pb-10"
        style={{
          background: "linear-gradient(160deg, #1A1000 0%, #0D0800 100%)",
          border: "1px solid rgba(203,164,113,0.25)",
          animation: "slideUp 0.3s cubic-bezier(0.34,1.56,0.64,1)"
        }}
        onClick={e => e.stopPropagation()}>
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full" style={{ backgroundColor: "rgba(203,164,113,0.35)" }} />
        </div>
        <div className="flex items-center justify-between px-5 pt-3 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center"
              style={{ backgroundColor: scenario.color, boxShadow: `0 0 16px ${scenario.color}55` }}>
              <Icon size={22} color="#fff" strokeWidth={2} />
            </div>
            <div>
              <h3 className="font-bold text-base" style={{ color: "#CBA471" }}>
                {scenario.label.replace("\n", "")}
              </h3>
              <p className="text-xs" style={{ color: "#8B7355" }}>私人定制账本场景</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ backgroundColor: "rgba(203,164,113,0.12)" }}>
            <X size={16} style={{ color: "#8B7355" }} />
          </button>
        </div>
        <div className="px-5 mb-4">
          <p className="text-sm leading-relaxed italic" style={{ color: "#CBA471" }}>
            "{scenario.aiDesc}"
          </p>
        </div>
        <div className="px-5 space-y-3">
          <div className="rounded-2xl p-4" style={{ backgroundColor: "rgba(203,164,113,0.08)" }}>
            <div className="flex items-center gap-2 mb-2">
              <Zap size={14} style={{ color: accentColor }} />
              <span className="text-xs font-bold" style={{ color: accentColor }}>🔧 当前功能：解决「此刻之痛」</span>
            </div>
            <p className="text-xs leading-relaxed" style={{ color: "#A0845C" }}>{scenario.current}</p>
            {scenario.examples.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {scenario.examples.map((ex, i) => (
                  <span key={i} className="text-xs px-2.5 py-0.5 rounded-full font-medium"
                    style={{ border: `1px solid ${accentColor}`, color: accentColor, backgroundColor: `${accentColor}10` }}>
                    {ex}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="rounded-2xl p-4"
            style={{ background: "linear-gradient(135deg, rgba(203,164,113,0.12), rgba(180,80,30,0.08))", border: "1px solid rgba(203,164,113,0.18)" }}>
            <div className="flex items-center gap-2 mb-2">
              <Rocket size={14} style={{ color: accentColor }} />
              <span className="text-xs font-bold" style={{ color: accentColor }}>🚀 未来 AI 升级：赋予数据「灵魂」</span>
            </div>
            <p className="text-xs leading-relaxed italic" style={{ color: "#CBA471" }}>
              [预言家模式]：{scenario.future}
            </p>
          </div>
          {scenario.id !== "core" && (
            <div className="rounded-2xl p-4 flex items-center justify-between"
              style={{ background: "linear-gradient(135deg, rgba(203,164,113,0.18), rgba(198,40,40,0.12))", border: "1px solid rgba(203,164,113,0.2)" }}>
              <div>
                <p className="text-xs" style={{ color: "#8B7355" }}>想要这个场景的定制账本？</p>
                <p className="text-sm font-semibold mt-0.5" style={{ color: "#CBA471" }}>联系管理员进行私人定制</p>
              </div>
              <div className="w-9 h-9 rounded-full flex items-center justify-center"
                style={{ backgroundColor: "#CBA471", boxShadow: "0 0 12px rgba(203,164,113,0.5)" }}>
                <ArrowRight size={16} color="#1A1000" />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ===== 主页面 =====
export default function CustomShowcase() {
  const [selected, setSelected] = useState<typeof SCENARIOS[string] | null>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setRevealed(true), 100);
    return () => clearTimeout(t);
  }, []);

  const HEX_R = 34; // 外接圆半径（不放大，增加数量）
  const GAP = 1.06;  // 间距系数（紧密排列）

  // 计算 SVG 尺寸：铺满屏幕
  const SVG_W = 390;
  // 高度：从顶部导航下方到屏幕底部
  const SVG_H = window.innerHeight - 88; // 88 = 顶部导航高度

  const CX = SVG_W / 2;
  const CY = SVG_H / 2;

  // pointy-top 六边形顶点
  function hexPoints(cx: number, cy: number, r: number) {
    return Array.from({ length: 6 }, (_, i) => {
      const a = (Math.PI / 3) * i - Math.PI / 6;
      return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
    }).join(" ");
  }

  const hexList = HEX_GRID.map(({ q, r, id }, idx) => {
    const { x, y } = hexToPixel(q, r, HEX_R * 2 * GAP * Math.sqrt(3) / 2);
    // 修正：pointy-top 的间距公式
    const px = CX + HEX_R * (Math.sqrt(3) * q + Math.sqrt(3) / 2 * r) * GAP;
    const py = CY + HEX_R * (3 / 2 * r) * GAP;
    const scenario = SCENARIOS[id];
    const ring = Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
    return { q, r, px, py, scenario, ring, idx, id };
  });

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(160deg, #0D0800 0%, #1A0F00 40%, #0D0D0D 100%)",
      overflow: "hidden"
    }}>
      {/* 顶部导航 —— 悬浮在蜂巢上方 */}
      <div style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 10,
        padding: "48px 16px 12px",
        background: "linear-gradient(to bottom, rgba(13,8,0,0.95) 60%, transparent)"
      }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <Link href="/ledger">
            <button style={{ padding: "8px", marginLeft: "-8px", background: "none", border: "none", cursor: "pointer" }}>
              <ChevronLeft style={{ width: 24, height: 24, color: "#CBA471" }} />
            </button>
          </Link>
          <div style={{ flex: 1, textAlign: "center" }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#CBA471" }}>私人定制账本</div>
            <div style={{ fontSize: 11, color: "#8B7355", marginTop: 1 }}>
              无限蜂巢 · 点击任意场景了解详情
            </div>
          </div>
          <div style={{ width: 40 }} />
        </div>
      </div>

      {/* 全屏蜂巢 SVG */}
      <div style={{
        position: "fixed", inset: 0, top: 88, overflow: "hidden"
      }}>
        {/* 四边渐变遮罩：边缘消融，无边界感 */}
        <div style={{
          position: "absolute", inset: 0, zIndex: 2, pointerEvents: "none",
          background: `
            radial-gradient(ellipse 60% 55% at 50% 50%,
              transparent 30%,
              rgba(13,8,0,0.6) 65%,
              rgba(13,8,0,0.95) 85%,
              #0D0800 100%
            )
          `
        }} />

        <svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          preserveAspectRatio="xMidYMid meet"
          style={{ position: "relative", zIndex: 1 }}
        >
          {/* 连接线 */}
          {hexList.filter(h => h.ring >= 1 && h.ring <= 3).map(h => {
            const neighbors = [
              { q: h.q - 1, r: h.r }, { q: h.q + 1, r: h.r },
              { q: h.q, r: h.r - 1 }, { q: h.q, r: h.r + 1 },
              { q: h.q - 1, r: h.r + 1 }, { q: h.q + 1, r: h.r - 1 },
            ];
            const parent = hexList.find(p =>
              p.ring === h.ring - 1 &&
              neighbors.some(n => n.q === p.q && n.r === p.r)
            );
            if (!parent) return null;
            return (
              <line key={`line-${h.idx}`}
                x1={parent.px} y1={parent.py} x2={h.px} y2={h.py}
                stroke="rgba(203,164,113,0.08)"
                strokeWidth={0.8} strokeDasharray="3,5" />
            );
          })}

          {/* 六边形 */}
          {hexList.map(({ px, py, scenario, ring, idx }) => {
            if (!scenario) return null;
            const isCenter = ring === 0;
            const isSelected = selected?.id === scenario.id;
            const r = isCenter ? HEX_R * 1.2 : ring === 1 ? HEX_R * 1.05 : ring === 2 ? HEX_R * 0.92 : ring === 3 ? HEX_R * 0.82 : HEX_R * 0.75;
            const pts = hexPoints(px, py, r - 1.2);
            const Icon = scenario.icon;

            return (
              <g key={`hex-${idx}`}
                onClick={() => setSelected(isSelected ? null : scenario)}
                style={{
                  cursor: "pointer",
                  opacity: revealed ? 1 : 0,
                  transition: `opacity 0.6s ease ${Math.min(idx * 20, 800)}ms`
                }}>
                {/* 呼吸光晕（中心） */}
                {isCenter && (
                  <polygon points={hexPoints(px, py, r + 7)} fill="none"
                    stroke="#CBA471" strokeWidth={2}
                    style={{ filter: "drop-shadow(0 0 10px #CBA471)" }}
                    className="hex-pulse" />
                )}
                {/* 选中光晕 */}
                {isSelected && (
                  <polygon points={hexPoints(px, py, r + 4)} fill="none"
                    stroke="#CBA471" strokeWidth={2}
                    style={{ filter: "drop-shadow(0 0 8px #CBA471)", opacity: 0.9 }} />
                )}
                {/* 主体 */}
                <polygon points={pts}
                  fill={ring >= 3 ? `${scenario.color}99` : ring === 2 ? `${scenario.color}CC` : scenario.color}
                  stroke={isSelected ? "#CBA471" : "rgba(203,164,113,0.15)"}
                  strokeWidth={isSelected ? 1.5 : 0.6}
                  style={{
                    filter: isCenter
                      ? "drop-shadow(0 4px 16px rgba(0,0,0,0.8))"
                      : ring <= 2
                        ? "drop-shadow(0 2px 6px rgba(0,0,0,0.5))"
                        : "drop-shadow(0 1px 3px rgba(0,0,0,0.4))",
                    transition: "all 0.2s ease"
                  }} />
                {/* AI 金边 */}
                <polygon points={pts} fill="none"
                  stroke="rgba(203,164,113,0.2)" strokeWidth={0.6}
                  style={{ filter: "drop-shadow(0 0 2px rgba(203,164,113,0.3))" }} />
                {/* 图标 + 文字 */}
                <foreignObject x={px - r} y={py - r} width={r * 2} height={r * 2}
                  style={{ pointerEvents: "none" }}>
                  <div style={{
                    width: "100%", height: "100%",
                    display: "flex", flexDirection: "column",
                    alignItems: "center", justifyContent: "center",
                    color: "#fff", padding: "2px"
                  }}>
                    <Icon size={isCenter ? 16 : ring <= 1 ? 13 : ring === 2 ? 10 : 8} strokeWidth={2} />
                    {scenario.label.split("\n").map((line, i) => (
                      <div key={i} style={{
                        fontSize: isCenter ? 8 : ring <= 1 ? 7.5 : ring === 2 ? 6.5 : 5.5,
                        fontWeight: 700, lineHeight: 1.2,
                        textAlign: "center", marginTop: i === 0 ? 2 : 0,
                        textShadow: "0 0 4px rgba(203,164,113,0.5), 0 1px 2px rgba(0,0,0,0.8)"
                      }}>{line}</div>
                    ))}
                  </div>
                </foreignObject>
              </g>
            );
          })}
        </svg>
      </div>

      {/* 详情弹窗 */}
      {selected && <DetailCard scenario={selected} onClose={() => setSelected(null)} />}

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .hex-pulse {
          animation: hexPulse 2.8s ease-in-out infinite;
        }
        @keyframes hexPulse {
          0%, 100% { opacity: 0.2; }
          50% { opacity: 0.7; }
        }
      `}</style>
    </div>
  );
}
