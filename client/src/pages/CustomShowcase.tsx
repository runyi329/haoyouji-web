import { useState, useEffect } from "react";
import { Link } from "wouter";
import {
  ChevronLeft, Gem, X, TrendingUp, Heart, GraduationCap,
  Home, Briefcase, Utensils, Car, Dumbbell, Music, Building2, Users, Star,
  ArrowRight, Zap, Rocket, Plane, Coffee, Pill, Wrench, PiggyBank,
  BookOpen, Bike, Package, Hotel, Leaf, Baby, Gamepad2, Scissors,
  Truck, Landmark, ShoppingCart, Camera, Stethoscope, Flower2,
  Globe, Headphones, MapPin, Monitor, Shield, Shirt, Tent, Trophy, Tv, Wine,
  Sparkles, Banknote, Clock, Cpu, Database, Fingerprint, Gift, Hash,
  Inbox, Key, Layers, Link2, Lock, Mail, Navigation, Palette, Phone,
  QrCode, Radio, Search, Settings, Tag, Upload, Video, Wallet, Zap as ZapAlt
} from "lucide-react";

// ===== 场景数据（命名场景，用于中心区域） =====
const NAMED: Record<string, { label: string; icon: any; color: string; aiDesc: string; current: string; future: string; examples: string[] }> = {
  core:        { label: "底层账本\n引擎", icon: Gem,          color: "#C62828", aiDesc: "「宇宙级数据引擎」——每一笔记录都是量子态，在多人协作的观测中坍缩为真相。", current: "多人实时共享账本，数据永久留存，权限精细管控。", future: "AI将分析所有账本的行为模式，自动识别异常、预测趋势，成为你的财务大脑。", examples: [] },
  food:        { label: "餐饮\n门店",   icon: Utensils,      color: "#E64A19", aiDesc: "「味觉神经网络」——每条顾客留言都是神经元，AI实时感知你的口碑生命体征。", current: "顾客扫码免注册留意见，老板实时收到，按分店/桌号筛选查看。", future: "AI分析留言情绪，自动识别「高危投诉」，在差评扩散前主动预警。", examples: ["扫码留意见", "连锁分店管理", "菜品评分"] },
  health:      { label: "健康\n管理",   icon: Heart,         color: "#AD1457", aiDesc: "「生物节律解码器」——不只是记录你的健康，它在为你编程未来10年的体质。", current: "好友共同健身账本，互相监督打卡，记录每次训练数据。", future: "AI分析饮食逻辑与肌肉反馈，逆向推演生物损耗模型，精准预测免疫低点。", examples: ["共享减肥计划", "健身打卡记录", "医疗费用追踪"] },
  education:   { label: "教育\n培训",   icon: GraduationCap, color: "#283593", aiDesc: "「知识契约系统」——不再是冰冷数字，而是教练与学员之间的实时生长契约。", current: "学员缴费记录、课时追踪，教练与学员双方共同可见进度。", future: "AI根据学员练习数据实时语音点评，自动调整次日课表，双方共同签署周报。", examples: ["学费分摊", "培训收支", "学习打卡"] },
  business:    { label: "商业\n合作",   icon: Briefcase,     color: "#4E342E", aiDesc: "「信任量化引擎」——将利益分配变成可被所有人验证的数学公式。", current: "合伙人账本，收益分配记录，资金进出追踪，权限分级管控。", future: "AI自动识别资金异常流向，生成可信度评分，在信任危机发生前发出预警。", examples: ["合伙人分账", "项目收益分成", "股权记录"] },
  family:      { label: "家庭\n生活",   icon: Home,          color: "#2E7D32", aiDesc: "「家庭财务基因图谱」——每笔开销都是家庭价值观的像素点，AI拼成你们独有的生活画像。", current: "家庭共同账本，装修费用追踪，旅行预算管理，全家实时可见。", future: "AI分析家庭消费基因，识别「隐性焦虑支出」，为家庭财务健康打分并给出优化建议。", examples: ["家庭共同账本", "装修费用", "旅行预算"] },
  social:      { label: "社群\n运营",   icon: Users,         color: "#6A1B9A", aiDesc: "「社群能量场监测仪」——每次AA分摊都是社群凝聚力的脉冲，AI实时感知社群生命力。", current: "AA制聚餐、团购分摊、活动费用，多人实时记账，自动计算人均。", future: "AI分析参与频率与消费模式，识别「核心成员」与「边缘流失」，为社群运营提供数据支撑。", examples: ["AA制聚餐", "团购分摊", "活动费用"] },
  restaurant:  { label: "连锁\n餐厅",   icon: Building2,     color: "#BF360C", aiDesc: "「口碑雷达」——30家门店的每条留言，都是AI感知品牌健康度的神经末梢。", current: "30家门店统一管理，桌号二维码，顾客扫码留言，按分店筛选。", future: "AI实时分析各门店情绪曲线，自动生成「门店健康报告」，识别需重点关注的分店。", examples: ["30家门店统一管理", "桌号二维码", "实时意见汇总"] },
  fitness:     { label: "健身\n打卡",   icon: Dumbbell,      color: "#880E4F", aiDesc: "「肌肉记忆银行」——每次打卡都是一笔存款，AI计算身体的复利增长曲线。", current: "好友互督打卡，训练记录，目标追踪，共同可见进度。", future: "AI分析训练节奏，在即将过度训练前自动预警，并推荐最优恢复方案。", examples: ["好友互督", "训练记录", "目标追踪"] },
  tutoring:    { label: "培训\n收费",   icon: Star,          color: "#1A237E", aiDesc: "「学习价值转化器」——将每分培训费转化为可量化的能力增长数据。", current: "学员缴费记录，课时追踪，收入统计，学员进度可视化。", future: "AI根据缴费周期与学习进度的相关性，预测续费概率，提前30天触发续费提醒。", examples: ["学员缴费", "课时记录", "收入统计"] },
  investment:  { label: "投资\n跟踪",   icon: TrendingUp,    color: "#3E2723", aiDesc: "「财富量子纠缠系统」——合伙人之间的每笔资金流动，在AI观测下保持量子纠缠态。", current: "收益分配记录，资金追踪，持仓记录，合伙人实时可见。", future: "AI识别资金异常模式，自动生成可信度报告，在信任危机前主动预警。", examples: ["收益分配", "资金追踪", "持仓记录"] },
  travel:      { label: "旅行\nAA",    icon: Plane,         color: "#004D40", aiDesc: "「旅行记忆晶体」——每笔开销都是旅行记忆的像素，AI将它们永久封存为时光胶囊。", current: "实时记账，人均计算，费用分摊，多人协作记录。", future: "AI分析旅行消费偏好，下次出行前自动生成个性化预算方案。", examples: ["实时记账", "人均计算", "费用分摊"] },
  event:       { label: "活动\n策划",   icon: Music,         color: "#4A148C", aiDesc: "「活动能量守恒定律」——AI实时监测每分预算流向，确保能量在最关键节点精准爆发。", current: "收支明细，预算管理，成本核算，多人协作记录。", future: "AI分析历史活动数据，自动识别「超支风险点」，在预算耗尽前发出预警。", examples: ["收支明细", "预算管理", "成本核算"] },
  retail:      { label: "零售\n门店",   icon: ShoppingCart,  color: "#B71C1C", aiDesc: "「商业脉搏感知器」——每笔进出账都是门店生命体征的一次心跳。", current: "日常收支记录，进货追踪，员工提成自动分账。", future: "AI分析销售节奏，预测补货时机，识别滞销品，优化库存结构。", examples: ["日常收支", "进货记录", "提成分账"] },
  medical:     { label: "医疗\n费用",   icon: Pill,          color: "#880E4F", aiDesc: "「健康资产守护者」——将每分医疗支出转化为家庭健康资产的量化数据。", current: "医疗费用共享追踪，报销记录，用药账本，家人共同可见。", future: "AI分析医疗支出模式，识别健康风险信号，提前预警潜在高额医疗支出。", examples: ["医疗费用追踪", "报销记录", "用药账本"] },
  cafe:        { label: "咖啡\n连锁",   icon: Coffee,        color: "#4E342E", aiDesc: "「咖啡因情绪图谱」——每杯咖啡背后的留言，都是顾客情绪的精准采样。", current: "顾客扫码留言，按门店/时段筛选，会员积分追踪。", future: "AI识别高价值顾客，自动触发个性化优惠推送。", examples: ["顾客留言", "会员积分", "门店对比"] },
  hotel:       { label: "民宿\n管理",   icon: Hotel,         color: "#37474F", aiDesc: "「住宿体验量子化」——每条住客反馈都是民宿体验的精准像素。", current: "客户反馈收集，房间收支追踪，多房间管理。", future: "AI分析入住评价趋势，自动识别需要整改的房间问题。", examples: ["客户反馈", "房间收支", "多房管理"] },
  bike:        { label: "骑行\n打卡",   icon: Bike,          color: "#1B5E20", aiDesc: "「骑行轨迹银行」——每公里都是存款，AI为你计算体能的复利增长。", current: "里程打卡，费用AA，装备分摊，俱乐部成员共同可见。", future: "AI分析骑行数据，预测最优训练节奏，识别过度疲劳风险。", examples: ["里程打卡", "费用AA", "装备分摊"] },
  baby:        { label: "育儿\n账本",   icon: Baby,          color: "#880E4F", aiDesc: "「成长基因档案」——每笔育儿支出都是孩子成长轨迹的一个坐标点。", current: "育儿费用追踪，夫妻共同记账，成长里程碑记录。", future: "AI分析育儿支出结构，识别「焦虑型消费」，给出科学育儿预算建议。", examples: ["育儿费用", "夫妻共账", "成长记录"] },
  repair:      { label: "维修\n服务",   icon: Wrench,        color: "#BF360C", aiDesc: "「故障预知系统」——每次维修记录都是设备健康数据库的一个样本。", current: "收支记录，零件进货追踪，客户维修历史查询。", future: "AI分析维修频率，识别高频故障模式，提前向客户推荐预防性维护。", examples: ["收支记录", "零件追踪", "客户历史"] },
  savings:     { label: "存钱\n挑战",   icon: PiggyBank,     color: "#0D47A1", aiDesc: "「财富引力场」——当多人的储蓄意志叠加，AI将它们放大为不可阻挡的财富引力。", current: "好友共同存钱挑战，每日打卡，目标进度可视化。", future: "AI分析存钱节奏，识别「意志力低谷」，在放弃前主动发出激励推送。", examples: ["存钱打卡", "目标追踪", "好友监督"] },
  reading:     { label: "读书\n打卡",   icon: BookOpen,      color: "#006064", aiDesc: "「知识密度测量仪」——AI量化每本书对你认知体系的改变程度。", current: "读书打卡，笔记共享，俱乐部费用分摊。", future: "AI分析阅读偏好，识别知识盲区，推荐最优阅读路径。", examples: ["读书打卡", "笔记共享", "费用分摊"] },
  delivery:    { label: "配送\n管理",   icon: Truck,         color: "#E65100", aiDesc: "「物流神经网络」——每次配送都是城市毛细血管的一次脉冲。", current: "订单收支追踪，骑手提成自动分账，团队绩效记录。", future: "AI分析配送效率，识别高峰时段，优化人员调度方案。", examples: ["订单追踪", "提成分账", "绩效记录"] },
  game:        { label: "游戏\n公会",   icon: Gamepad2,      color: "#880E4F", aiDesc: "「公会经济引擎」——将虚拟世界的每笔交易变成可信的链上记录。", current: "公会费用分摊，装备购买记录，战利品分配追踪。", future: "AI分析公会经济健康度，识别「搭便车」行为，优化贡献度评估体系。", examples: ["费用分摊", "装备记录", "战利品分配"] },
  beauty:      { label: "美容\n工作室", icon: Scissors,      color: "#4A148C", aiDesc: "「美丽价值感知器」——每条客户反馈都是美容师技艺的精准评分。", current: "客户反馈收集，预约收支记录，美容师提成分账。", future: "AI分析客户满意度趋势，识别回头率下降信号，提前预警客户流失风险。", examples: ["客户反馈", "预约收支", "提成分账"] },
  eco:         { label: "环保\n打卡",   icon: Leaf,          color: "#1B5E20", aiDesc: "「碳足迹量化引擎」——将每次环保行动转化为可量化的地球贡献值。", current: "环保打卡，碳积分追踪，公益活动费用分摊。", future: "AI分析团队碳减排贡献，生成可信碳积分报告，对接碳交易市场。", examples: ["环保打卡", "碳积分", "公益费用"] },
  finance:     { label: "理财\n记录",   icon: Landmark,      color: "#1A237E", aiDesc: "「财富熵减系统」——AI将混沌的资产数据转化为清晰的财富增长方程式。", current: "理财记录，基金定投追踪，家庭资产配置可视化。", future: "AI分析资产配置结构，识别风险集中点，推荐再平衡方案。", examples: ["理财记录", "定投追踪", "资产配置"] },
  car:         { label: "用车\n记账",   icon: Car,           color: "#E65100", aiDesc: "「出行成本解构器」——AI将每公里的真实成本精准拆解，让你看清用车的隐性代价。", current: "加油、保养、保险费用记录，多人用车费用分摊。", future: "AI分析用车成本结构，识别「高成本时段」，推荐最优出行方案。", examples: ["加油记录", "保养追踪", "费用分摊"] },
  photo:       { label: "摄影\n工作室", icon: Camera,        color: "#311B92", aiDesc: "「光影价值量化器」——将每次快门背后的商业价值精准记录。", current: "客户预付款追踪，收支记录，设备折旧账本。", future: "AI分析接单节奏，预测旺季需求，优化档期排布。", examples: ["客户预付款", "收支记录", "设备折旧"] },
  sport:       { label: "运动\n赛事",   icon: Trophy,        color: "#BF360C", aiDesc: "「竞技能量守恒系统」——将每次比赛的投入与产出精准量化。", current: "赛事费用分摊，奖金分配记录，装备采购追踪。", future: "AI分析团队投入产出比，识别最优资源配置方案。", examples: ["赛事费用", "奖金分配", "装备采购"] },
  wine:        { label: "酒水\n采购",   icon: Wine,          color: "#4A148C", aiDesc: "「液态资产管理器」——将每瓶酒的价值流动精准记录在区块链上。", current: "采购记录，库存追踪，宴席费用分摊，多人共同可见。", future: "AI分析消费偏好，预测补货时机，识别高性价比采购窗口。", examples: ["采购记录", "库存追踪", "宴席分摊"] },
  clothing:    { label: "服装\n门店",   icon: Shirt,         color: "#880E4F", aiDesc: "「时尚价值感知器」——将每件衣服的商业旅程精准记录。", current: "进货记录，销售收支，员工提成自动分账。", future: "AI分析销售趋势，预测爆款款式，优化进货结构。", examples: ["进货记录", "销售收支", "提成分账"] },
  pet:         { label: "宠物\n账本",   icon: Flower2,       color: "#2E7D32", aiDesc: "「毛孩子资产守护者」——将每分宠物支出转化为可量化的生命质量数据。", current: "宠物费用追踪，多宠物管理，医疗记录，家庭成员共同可见。", future: "AI分析宠物健康支出模式，识别健康风险信号，提前预警潜在医疗支出。", examples: ["医疗记录", "食品追踪", "美容费用"] },
  realestate:  { label: "房产\n租赁",   icon: MapPin,        color: "#37474F", aiDesc: "「不动产现金流量子化」——将每套房产的资金流动精准记录在时间轴上。", current: "租金收支记录，维修费用追踪，多房东分账管理。", future: "AI分析租金收益率，识别空置风险，推荐最优租赁策略。", examples: ["租金收支", "维修追踪", "多房东分账"] },
  insurance:   { label: "保险\n记录",   icon: Shield,        color: "#1A237E", aiDesc: "「风险对冲量化器」——将每张保单的保障价值精准量化。", current: "保单记录，保费追踪，理赔记录，家庭成员共同可见。", future: "AI分析保障缺口，识别重复投保，推荐最优保险组合方案。", examples: ["保单记录", "保费追踪", "理赔记录"] },
  freelance:   { label: "自由\n职业",   icon: Monitor,       color: "#4E342E", aiDesc: "「自由职业价值量化器」——将每个项目的时间投入与收益精准对应。", current: "收入记录，项目分成，税务追踪，客户管理。", future: "AI分析项目收益率，识别高价值客户，优化接单策略。", examples: ["收入记录", "项目分成", "税务追踪"] },
  agriculture: { label: "农业\n合作",   icon: Tent,          color: "#1B5E20", aiDesc: "「土地价值量化引擎」——将每亩土地的产出精准记录在数字账本上。", current: "合作社收支，产品销售记录，成员分红追踪。", future: "AI分析农产品价格趋势，预测最优销售时机，优化种植结构。", examples: ["收支记录", "销售追踪", "成员分红"] },
  media:       { label: "自媒体\n收益", icon: Tv,            color: "#311B92", aiDesc: "「内容价值量化器」——将每条内容的商业价值精准记录在时间轴上。", current: "广告收益记录，MCN分成追踪，内容创作成本管理。", future: "AI分析内容收益率，识别高价值内容类型，优化创作策略。", examples: ["广告收益", "MCN分成", "创作成本"] },
  wedding:     { label: "婚礼\n策划",   icon: Flower2,       color: "#880E4F", aiDesc: "「幸福价值量化器」——将每分婚礼投入转化为可量化的幸福指数。", current: "婚礼费用追踪，礼金记录，供应商付款管理，双方家庭共同可见。", future: "AI分析婚礼预算结构，识别超支风险点，推荐最优资源配置方案。", examples: ["费用追踪", "礼金记录", "供应商管理"] },
  volunteer:   { label: "公益\n志愿",   icon: Globe,         color: "#006064", aiDesc: "「善意价值量化器」——将每次公益行动转化为可量化的社会贡献值。", current: "公益费用追踪，捐款记录，志愿者时间银行管理。", future: "AI分析公益投入产出比，识别最高效的公益模式，优化资源配置。", examples: ["费用追踪", "捐款记录", "时间银行"] },
  startup:     { label: "创业\n团队",   icon: Rocket,        color: "#BF360C", aiDesc: "「创业生命体征监测仪」——将每分创业投入转化为可量化的商业价值数据。", current: "团队收支，股权追踪，融资记录，投资人共同可见。", future: "AI分析创业财务健康度，识别资金断裂风险，提前30天发出预警。", examples: ["团队收支", "股权追踪", "融资记录"] },
  music:       { label: "音乐\n工作室", icon: Headphones,    color: "#4A148C", aiDesc: "「声波价值量化器」——将每个音符背后的商业价值精准记录。", current: "版权收益分成，录音成本追踪，工作室收支管理。", future: "AI分析版权收益趋势，识别高价值版权，优化版权运营策略。", examples: ["版权收益", "录音成本", "工作室收支"] },
  dental:      { label: "口腔\n诊所",   icon: Stethoscope,   color: "#1A237E", aiDesc: "「口腔健康价值量化器」——将每次诊疗的价值精准记录在数字账本上。", current: "诊所收支，患者预约记录，医生提成自动分账。", future: "AI分析患者复诊率，识别流失风险，提前触发复诊提醒。", examples: ["诊所收支", "预约记录", "提成分账"] },
  childcare:   { label: "托育\n机构",   icon: Baby,          color: "#2E7D32", aiDesc: "「成长价值守护者」——将每分托育投入转化为可量化的儿童发展数据。", current: "收费记录，家长反馈收集，教师绩效追踪，家长实时可见。", future: "AI分析儿童发展数据，识别发展迟缓信号，提前预警并推荐干预方案。", examples: ["收费记录", "家长反馈", "教师绩效"] },
  gym:         { label: "健身房\n管理", icon: Dumbbell,      color: "#BF360C", aiDesc: "「体能资产管理器」——将每分会员投入转化为可量化的体能增长数据。", current: "会员收费，教练课时追踪，设备维护记录，会员进度可视化。", future: "AI分析会员续费率，识别流失风险，提前30天触发续费提醒。", examples: ["会员收费", "课时追踪", "设备维护"] },
  logistics:   { label: "仓储\n管理",   icon: Package,       color: "#4E342E", aiDesc: "「库存生命体征监测仪」——每次货物进出都是仓储系统的一次呼吸。", current: "货物进出记录，收支追踪，租金分摊管理。", future: "AI分析库存周转率，预测滞销风险，优化仓储空间利用率。", examples: ["货物进出", "收支追踪", "租金分摊"] },
  // 额外场景（填充外圈）
  wallet:      { label: "钱包\n管理",   icon: Wallet,        color: "#1565C0", aiDesc: "「数字钱包守护者」——将每分数字资产精准记录。", current: "多账户收支记录，余额追踪，账单提醒。", future: "AI分析消费习惯，智能预警超支风险。", examples: ["多账户管理", "余额追踪", "账单提醒"] },
  gift:        { label: "礼品\n记录",   icon: Gift,          color: "#6A1B9A", aiDesc: "「情感价值量化器」——将每份礼物背后的情感价值精准记录。", current: "礼品收支记录，节日提醒，礼品清单管理。", future: "AI分析礼品偏好，智能推荐最优礼品方案。", examples: ["礼品清单", "节日提醒", "收支记录"] },
  banknote:    { label: "现金\n流水",   icon: Banknote,      color: "#2E7D32", aiDesc: "「现金流量化器」——将每笔现金流动精准记录在数字账本上。", current: "现金收支记录，流水统计，多人共同可见。", future: "AI分析现金流规律，预测资金紧张节点，提前预警。", examples: ["现金收支", "流水统计", "多人共账"] },
  clock:       { label: "时间\n账本",   icon: Clock,         color: "#37474F", aiDesc: "「时间价值量化器」——将每分钟的投入转化为可量化的价值数据。", current: "时间记录，项目工时追踪，效率分析。", future: "AI分析时间投入产出比，识别低效时段，优化时间配置。", examples: ["时间记录", "工时追踪", "效率分析"] },
  palette:     { label: "设计\n工作室", icon: Palette,       color: "#AD1457", aiDesc: "「创意价值量化器」——将每个设计项目的商业价值精准记录。", current: "项目收支记录，客户管理，设计师提成分账。", future: "AI分析项目收益率，识别高价值客户类型，优化接单策略。", examples: ["项目收支", "客户管理", "提成分账"] },
  video:       { label: "视频\n制作",   icon: Video,         color: "#311B92", aiDesc: "「影像价值量化器」——将每帧画面背后的商业价值精准记录。", current: "项目收支，设备折旧，团队分成追踪。", future: "AI分析内容收益趋势，识别高ROI内容类型，优化制作策略。", examples: ["项目收支", "设备折旧", "团队分成"] },
  phone:       { label: "电话\n营销",   icon: Phone,         color: "#E65100", aiDesc: "「销售漏斗量化器」——将每通电话的商业价值精准记录。", current: "销售收支记录，客户跟进追踪，提成自动分账。", future: "AI分析销售转化率，识别高价值客户特征，优化话术策略。", examples: ["销售收支", "客户跟进", "提成分账"] },
  navigation:  { label: "出行\n记账",   icon: Navigation,    color: "#004D40", aiDesc: "「出行成本追踪器」——将每次出行的真实成本精准量化。", current: "出行费用记录，多人分摊，报销追踪。", future: "AI分析出行成本结构，推荐最优出行方案。", examples: ["出行费用", "多人分摊", "报销追踪"] },
  layers:      { label: "项目\n管理",   icon: Layers,        color: "#1A237E", aiDesc: "「项目价值量化器」——将每个项目的投入产出精准记录。", current: "项目收支追踪，里程碑记录，团队分成管理。", future: "AI分析项目健康度，识别超支风险，提前预警。", examples: ["项目收支", "里程碑", "团队分成"] },
  search:      { label: "市场\n调研",   icon: Search,        color: "#4A148C", aiDesc: "「市场洞察量化器」——将每次调研的商业价值精准记录。", current: "调研费用记录，数据收集追踪，报告管理。", future: "AI分析市场趋势，识别高价值调研方向，优化资源配置。", examples: ["调研费用", "数据追踪", "报告管理"] },
  radio:       { label: "播客\n收益",   icon: Radio,         color: "#006064", aiDesc: "「声音价值量化器」——将每期播客的商业价值精准记录。", current: "广告收益记录，赞助追踪，制作成本管理。", future: "AI分析收听数据，识别高价值内容类型，优化制作策略。", examples: ["广告收益", "赞助追踪", "制作成本"] },
  tag:         { label: "标签\n分类",   icon: Tag,           color: "#BF360C", aiDesc: "「分类价值量化器」——将每个标签背后的数据价值精准记录。", current: "多维度分类记账，标签统计，数据分析。", future: "AI自动识别消费模式，智能推荐分类标签。", examples: ["多维分类", "标签统计", "数据分析"] },
  mail:        { label: "邮件\n营销",   icon: Mail,          color: "#880E4F", aiDesc: "「邮件价值量化器」——将每封邮件的商业价值精准记录。", current: "营销收支记录，转化率追踪，ROI分析。", future: "AI分析邮件营销效果，识别高转化内容，优化营销策略。", examples: ["营销收支", "转化追踪", "ROI分析"] },
  database:    { label: "数据\n资产",   icon: Database,      color: "#1565C0", aiDesc: "「数据价值量化器」——将每份数据资产的商业价值精准记录。", current: "数据资产记录，使用追踪，价值评估。", future: "AI分析数据资产价值，识别高价值数据集，优化数据策略。", examples: ["资产记录", "使用追踪", "价值评估"] },
  cpu:         { label: "科技\n创新",   icon: Cpu,           color: "#283593", aiDesc: "「创新价值量化器」——将每次技术创新的商业价值精准记录。", current: "研发收支记录，专利追踪，团队绩效管理。", future: "AI分析创新投入产出比，识别高价值研发方向，优化资源配置。", examples: ["研发收支", "专利追踪", "团队绩效"] },
  sparkles:    { label: "美妆\n账本",   icon: Sparkles,      color: "#AD1457", aiDesc: "「美丽投资量化器」——将每分美妆投入转化为可量化的价值数据。", current: "美妆消费记录，品牌追踪，好友分享账本。", future: "AI分析美妆消费偏好，识别高性价比产品，优化购买策略。", examples: ["消费记录", "品牌追踪", "好友分享"] },
  fingerprint: { label: "身份\n认证",   icon: Fingerprint,   color: "#3E2723", aiDesc: "「身份价值量化器」——将每次身份认证的安全价值精准记录。", current: "认证记录，安全追踪，权限管理。", future: "AI分析安全风险，识别异常认证行为，提前预警。", examples: ["认证记录", "安全追踪", "权限管理"] },
  key:         { label: "密钥\n管理",   icon: Key,           color: "#4E342E", aiDesc: "「安全价值量化器」——将每个密钥的安全价值精准记录。", current: "密钥记录，权限追踪，安全审计。", future: "AI分析安全漏洞，识别高风险密钥，提前预警。", examples: ["密钥记录", "权限追踪", "安全审计"] },
  qrcode:      { label: "扫码\n收款",   icon: QrCode,        color: "#1B5E20", aiDesc: "「收款价值量化器」——将每次扫码收款的价值精准记录。", current: "收款记录，统计分析，多账户管理。", future: "AI分析收款规律，识别高峰时段，优化收款策略。", examples: ["收款记录", "统计分析", "多账户"] },
  upload:      { label: "云端\n存储",   icon: Upload,        color: "#006064", aiDesc: "「云端价值量化器」——将每份云端数据的价值精准记录。", current: "存储费用记录，使用量追踪，成本优化。", future: "AI分析存储使用模式，识别冗余数据，优化存储成本。", examples: ["存储费用", "使用追踪", "成本优化"] },
  inbox:       { label: "收件\n管理",   icon: Inbox,         color: "#311B92", aiDesc: "「信息价值量化器」——将每条信息的商业价值精准记录。", current: "信息收支记录，优先级管理，团队协作追踪。", future: "AI分析信息价值，识别高优先级内容，优化处理策略。", examples: ["信息记录", "优先级管理", "团队协作"] },
  settings:    { label: "系统\n配置",   icon: Settings,      color: "#37474F", aiDesc: "「配置价值量化器」——将每次系统配置的价值精准记录。", current: "配置记录，变更追踪，成本管理。", future: "AI分析配置效果，识别高价值配置方案，优化系统性能。", examples: ["配置记录", "变更追踪", "成本管理"] },
  hash:        { label: "区块链\n记账", icon: Hash,          color: "#1A237E", aiDesc: "「链上价值量化器」——将每笔链上交易的价值精准记录。", current: "链上收支记录，交易追踪，资产管理。", future: "AI分析链上数据，识别高价值交易模式，优化资产配置。", examples: ["链上收支", "交易追踪", "资产管理"] },
  link2:       { label: "联盟\n营销",   icon: Link2,         color: "#E65100", aiDesc: "「联盟价值量化器」——将每次联盟营销的价值精准记录。", current: "佣金收支记录，转化追踪，合作方管理。", future: "AI分析联盟效果，识别高价值合作方，优化营销策略。", examples: ["佣金收支", "转化追踪", "合作方管理"] },
  lock:        { label: "安全\n账本",   icon: Lock,          color: "#4A148C", aiDesc: "「安全价值量化器」——将每次安全投入的价值精准记录。", current: "安全费用记录，风险追踪，保险管理。", future: "AI分析安全风险，识别高价值防护方案，优化安全投入。", examples: ["安全费用", "风险追踪", "保险管理"] },
};

// 所有场景ID列表（按圈分组，用于循环分配）
const NAMED_KEYS = Object.keys(NAMED).filter(k => k !== "core");

// 颜色池（用于填充无名节点）
const COLOR_POOL = [
  "#C62828","#E64A19","#AD1457","#283593","#4E342E","#2E7D32","#6A1B9A",
  "#BF360C","#880E4F","#1A237E","#3E2723","#004D40","#4A148C","#B71C1C",
  "#37474F","#1B5E20","#0D47A1","#006064","#E65100","#311B92","#1565C0",
];

// 程序化生成蜂巢网格（axial坐标，覆盖足够多的圈）
function generateHexGrid(maxRing: number) {
  const cells: { q: number; r: number; ring: number }[] = [];
  for (let q = -maxRing; q <= maxRing; q++) {
    for (let r = -maxRing; r <= maxRing; r++) {
      const s = -q - r;
      const ring = Math.max(Math.abs(q), Math.abs(r), Math.abs(s));
      if (ring <= maxRing) {
        cells.push({ q, r, ring });
      }
    }
  }
  // 按圈排序，中心优先
  cells.sort((a, b) => a.ring - b.ring);
  return cells;
}

// 详情弹窗
function DetailCard({ scenario, onClose }: {
  scenario: { label: string; icon: any; color: string; aiDesc: string; current: string; future: string; examples: string[]; id: string };
  onClose: () => void;
}) {
  const Icon = scenario.icon;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.82)" }} onClick={onClose}>
      <div className="w-full max-w-md rounded-t-3xl pb-10"
        style={{ background: "linear-gradient(160deg,#1A1000,#0D0800)", border: "1px solid rgba(203,164,113,0.25)", animation: "slideUp 0.3s cubic-bezier(0.34,1.56,0.64,1)" }}
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
              <h3 className="font-bold text-base" style={{ color: "#CBA471" }}>{scenario.label.replace("\n", "")}</h3>
              <p className="text-xs" style={{ color: "#8B7355" }}>私人定制账本场景</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ backgroundColor: "rgba(203,164,113,0.12)" }}>
            <X size={16} style={{ color: "#8B7355" }} />
          </button>
        </div>
        <div className="px-5 mb-4">
          <p className="text-sm leading-relaxed italic" style={{ color: "#CBA471" }}>"{scenario.aiDesc}"</p>
        </div>
        <div className="px-5 space-y-3">
          <div className="rounded-2xl p-4" style={{ backgroundColor: "rgba(203,164,113,0.08)" }}>
            <div className="flex items-center gap-2 mb-2">
              <Zap size={14} style={{ color: "#CBA471" }} />
              <span className="text-xs font-bold" style={{ color: "#CBA471" }}>🔧 当前功能：解决「此刻之痛」</span>
            </div>
            <p className="text-xs leading-relaxed" style={{ color: "#A0845C" }}>{scenario.current}</p>
            {scenario.examples.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {scenario.examples.map((ex, i) => (
                  <span key={i} className="text-xs px-2.5 py-0.5 rounded-full font-medium"
                    style={{ border: "1px solid #CBA471", color: "#CBA471", backgroundColor: "rgba(203,164,113,0.1)" }}>{ex}</span>
                ))}
              </div>
            )}
          </div>
          <div className="rounded-2xl p-4"
            style={{ background: "linear-gradient(135deg,rgba(203,164,113,0.12),rgba(180,80,30,0.08))", border: "1px solid rgba(203,164,113,0.18)" }}>
            <div className="flex items-center gap-2 mb-2">
              <Rocket size={14} style={{ color: "#CBA471" }} />
              <span className="text-xs font-bold" style={{ color: "#CBA471" }}>🚀 未来 AI 升级</span>
            </div>
            <p className="text-xs leading-relaxed italic" style={{ color: "#CBA471" }}>[预言家模式]：{scenario.future}</p>
          </div>
          {scenario.id !== "core" && (
            <div className="rounded-2xl p-4 flex items-center justify-between"
              style={{ background: "linear-gradient(135deg,rgba(203,164,113,0.18),rgba(198,40,40,0.12))", border: "1px solid rgba(203,164,113,0.2)" }}>
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

export default function CustomShowcase() {
  const [selected, setSelected] = useState<any | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [dims, setDims] = useState({ w: window.innerWidth, h: window.innerHeight });

  useEffect(() => {
    const t = setTimeout(() => setRevealed(true), 100);
    const onResize = () => setDims({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => { clearTimeout(t); window.removeEventListener("resize", onResize); };
  }, []);

  const NAV_H = 88;
  const CANVAS_W = dims.w;
  const CANVAS_H = dims.h - NAV_H;
  const CX = CANVAS_W / 2;
  const CY = CANVAS_H / 2;

  // 固定六边形半径：比上一版大约50%
  // 上一版自动计算约 ~26px，现在固定为 40px（手机约390px宽时合适）
  // 用屏幕宽度做适配：390px宽 -> 40px，更小的屏幕等比缩小
  const BASE_R = Math.min(40, dims.w / 9.5);

  // 需要多少圈才能铺满屏幕？
  // 蜂巢宽度 = (2*rings+1) * sqrt(3) * R，高度 = (2*rings+1) * 1.5 * R
  // 需要覆盖 CANVAS_W 和 CANVAS_H
  const ringsNeeded = Math.ceil(Math.max(
    CANVAS_W / (Math.sqrt(3) * BASE_R * 2),
    CANVAS_H / (BASE_R * 3)
  )) + 1;

  const hexGrid = generateHexGrid(ringsNeeded);

  // 为每个格子分配场景数据
  let namedIdx = 0;
  const hexList = hexGrid.map(({ q, r, ring }, idx) => {
    const px = CX + BASE_R * Math.sqrt(3) * (q + r / 2);
    const py = CY + BASE_R * 1.5 * r;

    let scenario: any;
    if (q === 0 && r === 0) {
      scenario = { ...NAMED.core, id: "core" };
    } else {
      // 按顺序分配命名场景，循环使用
      const key = NAMED_KEYS[namedIdx % NAMED_KEYS.length];
      namedIdx++;
      scenario = { ...NAMED[key], id: key };
    }

    return { q, r, px, py, ring, scenario, idx };
  });

  // 亮度：中心亮，边缘暗（但边缘仍可见）
  const FADE_START = 2; // 从第几圈开始渐暗
  function getOpacity(ring: number, px: number, py: number) {
    // 基于到屏幕中心的像素距离
    const dist = Math.sqrt((px - CX) ** 2 + (py - CY) ** 2);
    const maxDist = Math.sqrt(CX ** 2 + CY ** 2);
    const t = Math.min(dist / (maxDist * 0.85), 1);
    // 中心1.0，边缘最低0.18（隐约可见）
    return Math.max(0.18, 1 - t * 0.82);
  }

  function hexPoints(cx: number, cy: number, r: number) {
    return Array.from({ length: 6 }, (_, i) => {
      const a = (Math.PI / 3) * i - Math.PI / 6;
      return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
    }).join(" ");
  }

  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden", background: "#0D0800", position: "relative" }}>
      {/* 顶部导航（覆盖在蜂巢上方） */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 10, padding: "48px 16px 12px", background: "linear-gradient(to bottom,rgba(13,8,0,0.95) 60%,transparent)" }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <Link href="/ledger">
            <button style={{ padding: "8px", marginLeft: "-8px", background: "none", border: "none", cursor: "pointer" }}>
              <ChevronLeft style={{ width: 24, height: 24, color: "#CBA471" }} />
            </button>
          </Link>
          <div style={{ flex: 1, textAlign: "center" }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#CBA471" }}>私人定制账本</div>
            <div style={{ fontSize: 11, color: "#8B7355", marginTop: 1 }}>无限蜂巢 · 点击任意场景了解详情</div>
          </div>
          <div style={{ width: 40 }} />
        </div>
      </div>

      {/* 蜂巢区域（从顶部开始，覆盖全屏） */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, overflow: "hidden" }}>
        <svg width={CANVAS_W} height={dims.h} style={{ position: "absolute", top: 0, left: 0, overflow: "visible" }}>
          {hexList.map(({ px, py, ring, scenario, idx }) => {
            if (!scenario) return null;
            const isCenter = ring === 0;
            const isSelected = selected?.id === scenario.id && selected?.q === undefined;
            const opacity = getOpacity(ring, px, py);

            // 圈越外六边形越小（保持层级感，但差异不大）
            const r = isCenter ? BASE_R * 1.15 : ring <= 1 ? BASE_R * 1.0 : ring <= 2 ? BASE_R * 0.95 : BASE_R * 0.92;
            const pts = hexPoints(px, py, r - 0.8);
            const Icon = scenario.icon;

            // 入场延迟：按圈计算，不按索引（避免延迟过长）
            const delay = Math.min(ring * 60, 500);

            return (
              <g key={`hex-${idx}`}
                onClick={() => {
                  if (opacity < 0.3) return; // 太暗的不响应点击
                  setSelected(prev => prev?.id === scenario.id ? null : { ...scenario, _idx: idx });
                }}
                style={{
                  cursor: opacity >= 0.3 ? "pointer" : "default",
                  opacity: revealed ? opacity : 0,
                  transition: `opacity 0.5s ease ${delay}ms`
                }}>
                {/* 呼吸光晕（中心） */}
                {isCenter && (
                  <polygon points={hexPoints(px, py, r + 7)} fill="none"
                    stroke="#CBA471" strokeWidth={2.5}
                    style={{ filter: "drop-shadow(0 0 12px #CBA471)" }}
                    className="hex-pulse" />
                )}
                {/* 选中光晕 */}
                {isSelected && (
                  <polygon points={hexPoints(px, py, r + 4)} fill="none"
                    stroke="#CBA471" strokeWidth={2}
                    style={{ filter: "drop-shadow(0 0 8px #CBA471)" }} />
                )}
                {/* 主体 */}
                <polygon points={pts}
                  fill={scenario.color}
                  stroke={`rgba(203,164,113,0.15)`}
                  strokeWidth={0.7}
                  style={{ filter: isCenter ? "drop-shadow(0 4px 16px rgba(0,0,0,0.8))" : "drop-shadow(0 2px 4px rgba(0,0,0,0.5))" }} />
                {/* AI金边 */}
                <polygon points={pts} fill="none" stroke="rgba(203,164,113,0.2)" strokeWidth={0.5} />
                {/* 图标+文字（只在足够亮的节点显示） */}
                {opacity >= 0.25 && (
                  <foreignObject x={px - r} y={py - r} width={r * 2} height={r * 2} style={{ pointerEvents: "none" }}>
                    <div style={{
                      width: "100%", height: "100%", display: "flex", flexDirection: "column",
                      alignItems: "center", justifyContent: "center", color: "#fff", padding: "1px"
                    }}>
                      <Icon size={isCenter ? 16 : ring <= 1 ? 12 : ring <= 2 ? 10 : 8} strokeWidth={2} />
                      {scenario.label.split("\n").map((line: string, i: number) => (
                        <div key={i} style={{
                          fontSize: isCenter ? 8 : ring <= 1 ? 7 : ring <= 2 ? 6 : 5.5,
                          fontWeight: 700, lineHeight: 1.15, textAlign: "center", marginTop: i === 0 ? 1.5 : 0,
                          textShadow: "0 1px 3px rgba(0,0,0,0.95)"
                        }}>{line}</div>
                      ))}
                    </div>
                  </foreignObject>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {selected && (
        <DetailCard
          scenario={selected}
          onClose={() => setSelected(null)}
        />
      )}

      <style>{`
        @keyframes slideUp { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .hex-pulse { animation: hexPulse 2.8s ease-in-out infinite; }
        @keyframes hexPulse { 0%,100% { opacity: 0.2; } 50% { opacity: 0.75; } }
      `}</style>
    </div>
  );
}
