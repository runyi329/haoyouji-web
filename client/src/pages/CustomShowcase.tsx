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
  QrCode, Radio, Search, Settings, Tag, Upload, Video, Wallet,
  Factory, Anchor, Wheat, Microscope, Hammer, Zap as ZapIcon,
  BarChart2, Box, Bus, ChefHat, Clipboard, Compass, CreditCard,
  DollarSign, Edit, FileText, Flame, Glasses, HardHat, Leaf as LeafIcon,
  LifeBuoy, Lightbulb, MessageCircle, Minus, Mountain, Music2,
  Paperclip, PenTool, Percent, Pizza, Printer, Recycle, RefreshCw,
  Repeat, Ruler, Send, Server, Smile, Snowflake, Sunset, Syringe,
  Target, Terminal, Thermometer, Timer, Umbrella, UserCheck, Users2,
  Voicemail, Watch, Wind, Zap as Z2, Feather, Dribbble, Activity
} from "lucide-react";

// ===== 场景数据类型 =====
interface SceneDetail {
  label: string;
  icon: any;
  color: string;
  desc: string; // 简短介绍（用于蜂巢展示）
  useCase?: string;    // 1. 使用场景
  solution?: string[]; // 2. 工作方案（列表）
  painPoints?: string[]; // 3. 解决痛点（列表）
  aiFeature?: string;  // 4. AI加持
}

// ===== 场景数据：按热门度从高到低排列（索引越小越热门，放越中间）=====
const SCENE_LIST: SceneDetail[] = [
  // ===== 第1圈：超高频生活场景 =====
  {
    label: "共享建议簿",
    icon: MessageCircle,
    color: "#C62828",
    desc: "老板穿透管理层，实时掌握一线顾客真实声音",
    useCase: "适用于连锁餐饮、美业、健身等服务门店。协助老板穿透管理层，实时掌握一线顾客真实评价。",
    solution: [
      "扫码即写：顾客扫码留言（无需注册），采纳即得奖励",
      "多方同步：意见提交瞬间，老板与店长手机同步接收",
      "不可隐瞒：店长无删除权限，确保反馈直达老板眼皮底下",
      "协同闭环：店长在线提交处理凭证，由老板最终审结存档"
    ],
    painPoints: [
      "信息透明：彻底杜绝店长对负面消息的瞒报、漏报",
      "管理提效：将客诉响应时效数字化，作为考核硬指标",
      "危机拦截：在差评进入公网平台前，在私域内高效化解"
    ],
    aiFeature: "AI 情绪监控与预警：自动识别顾客怒气値。当同一问题高频出现时，AI立即向老板触发红色预警，并推荐专业公关话术，防范舆论危机。"
  },
  { label: "健康管理", icon: Heart,         color: "#AD1457", desc: "共同健身账本，互相监督打卡，医疗费用追踪" },
  { label: "教育培训", icon: GraduationCap, color: "#283593", desc: "学员缴费、课时追踪，双方共同可见进度" },
  { label: "商业合作", icon: Briefcase,     color: "#4E342E", desc: "合伙人账本，收益分配，权限分级管控" },
  { label: "家庭生活", icon: Home,          color: "#2E7D32", desc: "家庭共同账本，装修、旅行预算全家可见" },
  { label: "社群运营", icon: Users,         color: "#6A1B9A", desc: "AA聚餐、团购分摊，自动计算人均" },
  // ===== 第2圈：高频商业场景 =====
  { label: "连锁餐厅", icon: Building2,     color: "#BF360C", desc: "多门店统一管理，桌号二维码，实时汇总" },
  { label: "健身打卡", icon: Dumbbell,      color: "#880E4F", desc: "好友互督，训练记录，目标追踪" },
  { label: "培训收费", icon: Star,          color: "#1A237E", desc: "学员缴费，课时追踪，收入统计" },
  { label: "投资跟踪", icon: TrendingUp,    color: "#3E2723", desc: "收益分配，资金追踪，合伙人实时可见" },
  { label: "旅行AA",   icon: Plane,         color: "#004D40", desc: "实时记账，人均计算，多人协作" },
  { label: "活动策划", icon: Music,         color: "#4A148C", desc: "收支明细，预算管理，成本核算" },
  // ===== 第3圈：常见行业场景 =====
  { label: "零售门店", icon: ShoppingCart,  color: "#B71C1C", desc: "日常收支，进货追踪，员工提成分账" },
  { label: "医疗费用", icon: Pill,          color: "#880E4F", desc: "共享追踪，报销记录，用药账本" },
  { label: "咖啡连锁", icon: Coffee,        color: "#4E342E", desc: "顾客留言，会员积分，门店对比" },
  { label: "民宿管理", icon: Hotel,         color: "#37474F", desc: "客户反馈，房间收支，多房间管理" },
  { label: "骑行打卡", icon: Bike,          color: "#1B5E20", desc: "里程打卡，费用AA，装备分摊" },
  { label: "育儿账本", icon: Baby,          color: "#880E4F", desc: "育儿费用，夫妻共账，成长记录" },
  // ===== 第4圈：专业服务场景 =====
  { label: "维修服务", icon: Wrench, color: "#BF360C", desc: "收支记录，零件追踪，客户历史" },
  { label: "存钱挑战", icon: PiggyBank, color: "#0D47A1", desc: "好友共同挑战，每日打卡，目标追踪" },
  { label: "读书打卡", icon: BookOpen, color: "#006064", desc: "读书打卡，笔记共享，俱乐部费用" },
  { label: "配送管理", icon: Truck, color: "#E65100", desc: "订单追踪，骑手提成，团队绩效" },
  { label: "游戏公会", icon: Gamepad2, color: "#880E4F", desc: "费用分摊，装备记录，战利品分配" },
  { label: "美容工作室", icon: Scissors, color: "#4A148C", desc: "客户反馈，预约收支，提成分账" },
  // ===== 第5圈：生活方式场景 =====
  { label: "环保打卡", icon: Leaf, color: "#1B5E20", desc: "环保打卡，碳积分，公益费用" },
  { label: "理财记录", icon: Landmark, color: "#1A237E", desc: "理财记录，定投追踪，资产配置" },
  { label: "用车记账", icon: Car, color: "#E65100", desc: "加油、保养、保险，多人分摊" },
  { label: "摄影工作室", icon: Camera, color: "#311B92", desc: "客户预付款，收支记录，设备折旧" },
  { label: "运动赛事", icon: Trophy, color: "#BF360C", desc: "赛事费用，奖金分配，装备采购" },
  { label: "酒水采购", icon: Wine, color: "#4A148C", desc: "采购记录，库存追踪，宴席分摊" },
  // ===== 第6圈：消费零售场景 =====
  { label: "服装门店", icon: Shirt, color: "#880E4F", desc: "进货记录，销售收支，提成分账" },
  { label: "宠物账本", icon: Flower2, color: "#2E7D32", desc: "医疗记录，食品追踪，美容费用" },
  { label: "房产租赁", icon: MapPin, color: "#37474F", desc: "租金收支，维修追踪，多房东分账" },
  { label: "保险记录", icon: Shield, color: "#1A237E", desc: "保单记录，保费追踪，理赔记录" },
  { label: "自由职业", icon: Monitor, color: "#4E342E", desc: "收入记录，项目分成，税务追踪" },
  { label: "农业合作", icon: Tent, color: "#1B5E20", desc: "合作社收支，销售记录，成员分红" },
  // ===== 第7圈：内容创作场景 =====
  { label: "自媒体", icon: Tv, color: "#311B92", desc: "广告收益，MCN分成，创作成本" },
  { label: "婚礼策划", icon: Flower2, color: "#880E4F", desc: "费用追踪，礼金记录，供应商管理" },
  { label: "公益志愿", icon: Globe, color: "#006064", desc: "费用追踪，捐款记录，时间银行" },
  { label: "创业团队", icon: Rocket, color: "#BF360C", desc: "团队收支，股权追踪，融资记录" },
  { label: "音乐工作室", icon: Headphones, color: "#4A148C", desc: "版权收益，录音成本，工作室收支" },
  { label: "口腔诊所", icon: Stethoscope, color: "#1A237E", desc: "诊所收支，预约记录，提成分账" },
  // ===== 第8圈：专业机构场景 =====
  { label: "托育机构", icon: Baby, color: "#2E7D32", desc: "收费记录，家长反馈，教师绩效" },
  { label: "健身房", icon: Dumbbell, color: "#BF360C", desc: "会员收费，课时追踪，设备维护" },
  { label: "仓储管理", icon: Package, color: "#4E342E", desc: "货物进出，收支追踪，租金分摊" },
  { label: "钱包管理", icon: Wallet, color: "#1565C0", desc: "多账户收支，余额追踪，账单提醒" },
  { label: "礼品记录", icon: Gift, color: "#6A1B9A", desc: "礼品清单，节日提醒，收支记录" },
  { label: "现金流水", icon: Banknote, color: "#2E7D32", desc: "现金收支，流水统计，多人共账" },
  // ===== 第9圈：创意设计场景 =====
  { label: "时间账本", icon: Clock, color: "#37474F", desc: "时间记录，工时追踪，效率分析" },
  { label: "设计工作室", icon: Palette, color: "#AD1457", desc: "项目收支，客户管理，提成分账" },
  { label: "视频制作", icon: Video, color: "#311B92", desc: "项目收支，设备折旧，团队分成" },
  { label: "电话营销", icon: Phone, color: "#E65100", desc: "销售收支，客户跟进，提成分账" },
  { label: "项目管理", icon: Layers, color: "#1A237E", desc: "项目收支，里程碑，团队分成" },
  { label: "市场调研", icon: Search, color: "#4A148C", desc: "调研费用，数据追踪，报告管理" },
  // ===== 第10圈：数字科技场景 =====
  { label: "播客收益", icon: Radio, color: "#006064", desc: "广告收益，赞助追踪，制作成本" },
  { label: "区块链账", icon: Hash, color: "#1A237E", desc: "链上收支，交易追踪，资产管理" },
  { label: "联盟营销", icon: Link2, color: "#E65100", desc: "佣金收支，转化追踪，合作方管理" },
  { label: "安全账本", icon: Lock, color: "#4A148C", desc: "安全费用，风险追踪，保险管理" },
  { label: "美妆账本", icon: Sparkles, color: "#AD1457", desc: "消费记录，品牌追踪，好友分享" },
  { label: "出行记账", icon: Navigation, color: "#004D40", desc: "出行费用，多人分摊，报销追踪" },
  // ===== 第11圈：餐饮细分场景 =====
  { label: "烘焙甜品", icon: ChefHat, color: "#BF360C", desc: "原料采购，销售收支，配方成本" },
  { label: "火锅店", icon: Flame, color: "#C62828", desc: "食材进货，桌位收支，员工分账" },
  { label: "奶茶店", icon: Coffee, color: "#4E342E", desc: "原料追踪，日销统计，加盟分成" },
  { label: "外卖运营", icon: Truck, color: "#E65100", desc: "平台佣金，骑手费用，日营业额" },
  { label: "酒店餐厅", icon: Utensils, color: "#37474F", desc: "宴会收支，食材成本，服务员提成" },
  { label: "夜市摊位", icon: Sunset, color: "#BF360C", desc: "日收支记录，进货追踪，多摊位管理" },
  // ===== 第12圈：教育细分场景 =====
  { label: "幼儿园", icon: Baby, color: "#2E7D32", desc: "学费收缴，活动费用，家长反馈" },
  { label: "艺术培训", icon: Palette, color: "#AD1457", desc: "课时收费，材料费用，学员进度" },
  { label: "体育培训", icon: Trophy, color: "#BF360C", desc: "训练费用，比赛报名，装备采购" },
  { label: "语言培训", icon: Globe, color: "#006064", desc: "课时收费，教材费用，学员管理" },
  { label: "职业技能", icon: Clipboard, color: "#283593", desc: "培训收支，证书费用，学员追踪" },
  { label: "在线教育", icon: Monitor, color: "#311B92", desc: "课程收益，平台分成，内容成本" },
  // ===== 第13圈：医疗健康场景 =====
  { label: "中医诊所", icon: Stethoscope, color: "#2E7D32", desc: "诊费收支，药材采购，患者记录" },
  { label: "心理咨询", icon: Heart, color: "#AD1457", desc: "咨询收费，预约管理，案例记录" },
  { label: "养老服务", icon: Users, color: "#37474F", desc: "服务收费，护理记录，家属反馈" },
  { label: "月子中心", icon: Baby, color: "#880E4F", desc: "服务收费，物资采购，客户管理" },
  { label: "健康食品", icon: Leaf, color: "#1B5E20", desc: "采购记录，销售收支，会员管理" },
  { label: "医美机构", icon: Sparkles, color: "#4A148C", desc: "项目收费，耗材追踪，客户档案" },
  // ===== 第14圈：零售细分场景 =====
  { label: "超市便利", icon: ShoppingCart, color: "#B71C1C", desc: "日收支，进货追踪，损耗记录" },
  { label: "书店文具", icon: BookOpen, color: "#006064", desc: "进货记录，销售收支，活动费用" },
  { label: "电器数码", icon: Cpu, color: "#283593", desc: "进货追踪，维修收支，员工提成" },
  { label: "珠宝首饰", icon: Sparkles, color: "#BF360C", desc: "进货记录，销售收支，定制追踪" },
  { label: "花卉园艺", icon: Flower2, color: "#2E7D32", desc: "进货记录，销售收支，养护成本" },
  { label: "二手交易", icon: RefreshCw, color: "#4E342E", desc: "收购记录，销售收支，利润追踪" },
  // ===== 第15圈：制造工业场景 =====
  { label: "工厂制造", icon: Factory, color: "#37474F", desc: "生产成本，原料采购，工人工资" },
  { label: "建筑工程", icon: HardHat, color: "#4E342E", desc: "工程收支，材料采购，工人分账" },
  { label: "精密仪器", icon: Microscope, color: "#1A237E", desc: "设备采购，维护费用，项目收支" },
  { label: "大宗贸易", icon: Anchor, color: "#3E2723", desc: "货物采购，运输费用，利润分配" },
  { label: "农业加工", icon: Wheat, color: "#1B5E20", desc: "原料采购，加工成本，销售收支" },
  { label: "化工原料", icon: Thermometer, color: "#BF360C", desc: "采购记录，库存追踪，安全费用" },
  // ===== 第16圈：专业服务场景 =====
  { label: "律师事务", icon: Clipboard, color: "#1A237E", desc: "案件收费，差旅费用，团队分成" },
  { label: "会计事务", icon: BarChart2, color: "#283593", desc: "服务收费，项目追踪，税务记录" },
  { label: "广告公司", icon: Palette, color: "#AD1457", desc: "项目收支，媒体费用，提成分账" },
  { label: "猎头公司", icon: UserCheck, color: "#4E342E", desc: "佣金收入，候选人追踪，成本管理" },
  { label: "咨询公司", icon: Lightbulb, color: "#006064", desc: "项目收费，差旅费用，团队分成" },
  { label: "公关公司", icon: MessageCircle, color: "#4A148C", desc: "项目收支，媒体费用，活动成本" },
  // ===== 第17圈：交通物流场景 =====
  { label: "货运物流", icon: Truck, color: "#E65100", desc: "运费收支，油耗追踪，司机分账" },
  { label: "快递驿站", icon: Package, color: "#4E342E", desc: "收件收支，代收费用，日流水" },
  { label: "汽车维修", icon: Car, color: "#BF360C", desc: "维修收支，配件采购，技师提成" },
  { label: "驾校培训", icon: Car, color: "#283593", desc: "学员收费，教练分成，车辆维护" },
  { label: "船运贸易", icon: Anchor, color: "#37474F", desc: "运费收支，港口费用，货物追踪" },
  { label: "航空服务", icon: Plane, color: "#1A237E", desc: "票务收支，地勤费用，服务追踪" },
  // ===== 第18圈：能源环境场景 =====
  { label: "太阳能", icon: Zap, color: "#E65100", desc: "安装收支，维护费用，发电收益" },
  { label: "废品回收", icon: Recycle, color: "#1B5E20", desc: "回收收支，分类记录，利润追踪" },
  { label: "水处理", icon: Wind, color: "#006064", desc: "运营收支，药剂采购，设备维护" },
  { label: "园林绿化", icon: Leaf, color: "#2E7D32", desc: "工程收支，苗木采购，养护费用" },
  { label: "环境监测", icon: Activity, color: "#283593", desc: "设备费用，检测收支，报告管理" },
  { label: "清洁能源", icon: Snowflake, color: "#004D40", desc: "项目收支，设备采购，运维费用" },
  // ===== 第19圈：文化娱乐场景 =====
  { label: "剧本杀", icon: Gamepad2, color: "#4A148C", desc: "门票收支，道具采购，员工分账" },
  { label: "密室逃脱", icon: Key, color: "#BF360C", desc: "门票收支，道具维护，员工分账" },
  { label: "电影院", icon: Video, color: "#311B92", desc: "票房收支，运营成本，分成记录" },
  { label: "KTV娱乐", icon: Music2, color: "#AD1457", desc: "包厢收支，酒水采购，员工分账" },
  { label: "展览策划", icon: Palette, color: "#006064", desc: "展位收支，布展费用，参展管理" },
  { label: "旅游景区", icon: Mountain, color: "#2E7D32", desc: "票务收支，运营成本，分成记录" },
  // ===== 第20圈：金融科技场景 =====
  { label: "小额贷款", icon: DollarSign, color: "#1A237E", desc: "贷款收支，利息追踪，风控记录" },
  { label: "股权投资", icon: TrendingUp, color: "#3E2723", desc: "投资记录，分红追踪，退出管理" },
  { label: "众筹项目", icon: Users2, color: "#4A148C", desc: "筹款记录，支出追踪，回报管理" },
  { label: "数字货币", icon: Cpu, color: "#283593", desc: "交易记录，收益追踪，风险管理" },
  { label: "基金管理", icon: BarChart2, color: "#1565C0", desc: "净值追踪，收益分配，费用记录" },
  { label: "保理业务", icon: FileText, color: "#4E342E", desc: "应收账款，融资记录，利息追踪" },
  // ===== 第21圈：农业细分场景 =====
  { label: "养殖场", icon: Feather, color: "#2E7D32", desc: "饲料采购，出栏收入，兽医费用" },
  { label: "种植基地", icon: Wheat, color: "#1B5E20", desc: "农资采购，销售收入，人工费用" },
  { label: "水产养殖", icon: Anchor, color: "#004D40", desc: "饲料采购，销售收入，设备维护" },
  { label: "农产品电商", icon: ShoppingCart, color: "#BF360C", desc: "采购记录，销售收支，物流费用" },
  { label: "农机服务", icon: Hammer, color: "#4E342E", desc: "设备维护，服务收入，油耗追踪" },
  { label: "有机农场", icon: Leaf, color: "#1B5E20", desc: "认证费用，销售收支，会员管理" },
  // ===== 第22圈：科技研发场景 =====
  { label: "软件公司", icon: Terminal, color: "#283593", desc: "项目收支，人力成本，版权收益" },
  { label: "硬件研发", icon: Cpu, color: "#1A237E", desc: "研发费用，原型成本，专利追踪" },
  { label: "人工智能", icon: Database, color: "#311B92", desc: "算力费用，项目收支，授权收益" },
  { label: "物联网", icon: Server, color: "#37474F", desc: "设备采购，运维费用，服务收益" },
  { label: "生物科技", icon: Microscope, color: "#2E7D32", desc: "研发费用，试验成本，专利管理" },
  { label: "新材料", icon: Layers, color: "#4E342E", desc: "研发费用，原料采购，销售收支" },
  // ===== 补充场景：消除可见范围内重复 =====
  { label: "印刷包装", icon: Printer, color: "#4E342E", desc: "印刷收支，材料采购，客户管理" },
  { label: "广播电视", icon: Radio, color: "#311B92", desc: "广告收益，制作成本，版权管理" },
  { label: "展会策划", icon: Palette, color: "#006064", desc: "展位收支，布展费用，参展管理" },
  { label: "旅行社", icon: Globe, color: "#004D40", desc: "团费收支，供应商管理，导游分成" },
  { label: "婚庆公司", icon: Flower2, color: "#AD1457", desc: "婚礼收支，供应商管理，员工分成" },
  { label: "殡葬服务", icon: Umbrella, color: "#37474F", desc: "服务收支，物资采购，员工管理" },
  { label: "搬家公司", icon: Truck, color: "#E65100", desc: "搬运收支，车辆费用，员工分成" },
  { label: "家政服务", icon: Home, color: "#2E7D32", desc: "服务收支，员工管理，客户追踪" },
  { label: "月嫂中心", icon: Baby, color: "#880E4F", desc: "服务收费，员工管理，客户反馈" },
  { label: "宠物医院", icon: Stethoscope, color: "#1B5E20", desc: "诊费收支，药品采购，客户档案" },
  { label: "汽车租赁", icon: Car, color: "#BF360C", desc: "租金收支，车辆维护，保险管理" },
  { label: "共享单车", icon: Bike, color: "#283593", desc: "运营收支，维修费用，投放管理" },
  { label: "停车场", icon: MapPin, color: "#37474F", desc: "停车收费，运营成本，设备维护" },
  { label: "加油站", icon: ZapIcon, color: "#E65100", desc: "油品收支，运营成本，员工管理" },
  { label: "洗车店", icon: Car, color: "#1565C0", desc: "洗车收支，耗材采购，员工分成" },
  { label: "充电桩", icon: ZapIcon, color: "#1A237E", desc: "充电收益，运维费用，设备管理" },
  { label: "无人零售", icon: ShoppingCart, color: "#4E342E", desc: "销售收支，补货追踪，设备维护" },
  { label: "自动贩卖", icon: Package, color: "#006064", desc: "销售收支，补货追踪，机器维护" },
  { label: "快闪店", icon: Star, color: "#BF360C", desc: "活动收支，场地费用，销售追踪" },
  { label: "跳蚤市场", icon: ShoppingCart, color: "#4A148C", desc: "摊位收支，进货追踪，销售记录" },
  { label: "拍卖行", icon: Landmark, color: "#3E2723", desc: "拍卖收支，佣金追踪，客户管理" },
  { label: "当铺典当", icon: DollarSign, color: "#37474F", desc: "典当收支，利息追踪，物品管理" },
  { label: "彩票代理", icon: Target, color: "#B71C1C", desc: "销售收支，佣金追踪，日流水" },
  { label: "彩妆品牌", icon: Sparkles, color: "#AD1457", desc: "产品收支，渠道分成，库存追踪" },
  { label: "香薰蜡烛", icon: Flame, color: "#4A148C", desc: "产品收支，原料采购，客户管理" },
  { label: "手工皮具", icon: Scissors, color: "#4E342E", desc: "产品收支，材料采购，定制追踪" },
  { label: "陶瓷工坊", icon: PenTool, color: "#BF360C", desc: "产品收支，材料采购，展销管理" },
  { label: "木工定制", icon: Hammer, color: "#3E2723", desc: "定制收支，材料采购，工时追踪" },
  { label: "刺绣工坊", icon: Scissors, color: "#880E4F", desc: "产品收支，材料采购，订单管理" },
  { label: "茶叶经营", icon: Coffee, color: "#2E7D32", desc: "进货记录，销售收支，会员管理" },
  { label: "红酒庄园", icon: Wine, color: "#4A148C", desc: "酒品收支，酒窖管理，会员追踪" },
  { label: "有机蔬菜", icon: Leaf, color: "#1B5E20", desc: "种植成本，销售收支，会员配送" },
  { label: "蜂蜜农场", icon: Feather, color: "#E65100", desc: "养殖成本，销售收支，品牌管理" },
  { label: "民间借贷", icon: DollarSign, color: "#1A237E", desc: "借贷记录，利息追踪，还款管理" },
  { label: "互助基金", icon: Users2, color: "#283593", desc: "基金收支，成员管理，分红追踪" },
  { label: "合会标会", icon: Users, color: "#6A1B9A", desc: "会款记录，成员管理，得标追踪" },
  { label: "众包平台", icon: Globe, color: "#004D40", desc: "任务收支，佣金追踪，接单管理" },
  { label: "直播电商", icon: Tv, color: "#311B92", desc: "直播收益，货品成本，平台分成" },
  { label: "短视频带货", icon: Video, color: "#4A148C", desc: "带货收益，样品成本，佣金追踪" },
  { label: "知识付费", icon: BookOpen, color: "#1A237E", desc: "课程收益，平台分成，内容成本" },
  { label: "会员订阅", icon: CreditCard, color: "#283593", desc: "订阅收益，运营成本，续费追踪" },
  { label: "NFT创作", icon: Hash, color: "#311B92", desc: "创作收益，版税追踪，平台费用" },
  { label: "碳交易", icon: Leaf, color: "#1B5E20", desc: "碳配额收支，交易记录，核查费用" },
  { label: "废旧金属", icon: Recycle, color: "#37474F", desc: "收购记录，销售收支，运输费用" },
  { label: "旧书回收", icon: BookOpen, color: "#4E342E", desc: "收购记录，销售收支，分类追踪" },
];


// 程序化生成蜂巢网格
function generateHexGrid(maxRing: number) {
  const cells: { q: number; r: number; ring: number }[] = [];
  for (let q = -maxRing; q <= maxRing; q++) {
    for (let r = -maxRing; r <= maxRing; r++) {
      const s = -q - r;
      const ring = Math.max(Math.abs(q), Math.abs(r), Math.abs(s));
      if (ring <= maxRing) cells.push({ q, r, ring });
    }
  }
  cells.sort((a, b) => a.ring - b.ring);
  return cells;
}

// 全屏详情弹窗
function DetailCard({ scene, onClose }: {
  scene: SceneDetail; onClose: () => void;
}) {
  const Icon = scene.icon;
  const hasFull = !!(scene.useCase || scene.solution || scene.painPoints || scene.aiFeature);

  return (
    <div className="fixed inset-0 z-50 flex flex-col"
      style={{ background: "linear-gradient(170deg,#120800 0%,#0D0400 100%)", animation: "slideUp 0.3s cubic-bezier(0.34,1.56,0.64,1)" }}>

      {/* 顶部导航 */}
      <div style={{ padding: "52px 16px 0", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 8, marginLeft: -8 }}>
            <ChevronLeft size={24} style={{ color: "#CBA471" }} />
          </button>
          <div style={{ flex: 1, textAlign: "center" }}>
            <div style={{ fontSize: 13, color: "#8B7355" }}>定制案例</div>
          </div>
          <div style={{ width: 40 }} />
        </div>
      </div>

      {/* 内容区域（可滚动） */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 16px 32px" }}>

        {/* 标题头部 */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "20px 0 18px" }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16, flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            backgroundColor: scene.color, boxShadow: `0 0 20px ${scene.color}66`
          }}>
            <Icon size={26} color="#fff" strokeWidth={2} />
          </div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#CBA471", lineHeight: 1.2 }}>定制案例</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#fff", marginTop: 2 }}>{scene.label}</div>
          </div>
        </div>

        {/* 分隔线 */}
        <div style={{ height: 1, background: "linear-gradient(to right,transparent,rgba(203,164,113,0.3),transparent)", marginBottom: 20 }} />

        {/* 如果没有详细内容，显示简介 */}
        {!hasFull && (
          <div style={{ padding: "16px", borderRadius: 14, backgroundColor: "rgba(203,164,113,0.08)", marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: "#CBA471", fontWeight: 700, marginBottom: 6 }}>场景简介</div>
            <div style={{ fontSize: 14, color: "#A0845C", lineHeight: 1.7 }}>{scene.desc}</div>
          </div>
        )}

        {/* 1. 使用场景 */}
        {scene.useCase && (
          <div style={{ padding: "14px 16px", borderRadius: 14, backgroundColor: "rgba(203,164,113,0.07)", marginBottom: 12, border: "1px solid rgba(203,164,113,0.12)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
              <MapPin size={13} style={{ color: "#CBA471", flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: "#CBA471" }}>1. 使用场景</span>
            </div>
            <div style={{ fontSize: 13, color: "#C8A87A", lineHeight: 1.75 }}>{scene.useCase}</div>
          </div>
        )}

        {/* 2. 工作方案 */}
        {scene.solution && scene.solution.length > 0 && (
          <div style={{ padding: "14px 16px", borderRadius: 14, backgroundColor: "rgba(203,164,113,0.07)", marginBottom: 12, border: "1px solid rgba(203,164,113,0.12)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
              <Settings size={13} style={{ color: "#CBA471", flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: "#CBA471" }}>2. 工作方案</span>
            </div>
            {scene.solution.map((item, i) => (
              <div key={i} style={{ display: "flex", gap: 8, marginBottom: i < scene.solution!.length - 1 ? 8 : 0 }}>
                <div style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: scene.color, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                  <span style={{ fontSize: 10, color: "#fff", fontWeight: 700 }}>{i + 1}</span>
                </div>
                <div style={{ fontSize: 13, color: "#C8A87A", lineHeight: 1.65, flex: 1 }}>{item}</div>
              </div>
            ))}
          </div>
        )}

        {/* 3. 解决痛点 */}
        {scene.painPoints && scene.painPoints.length > 0 && (
          <div style={{ padding: "14px 16px", borderRadius: 14, backgroundColor: "rgba(203,164,113,0.07)", marginBottom: 12, border: "1px solid rgba(203,164,113,0.12)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
              <Target size={13} style={{ color: "#CBA471", flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: "#CBA471" }}>3. 解决痛点</span>
            </div>
            {scene.painPoints.map((item, i) => (
              <div key={i} style={{ display: "flex", gap: 8, marginBottom: i < scene.painPoints!.length - 1 ? 7 : 0 }}>
                <div style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: "#CBA471", flexShrink: 0, marginTop: 7 }} />
                <div style={{ fontSize: 13, color: "#C8A87A", lineHeight: 1.65, flex: 1 }}>{item}</div>
              </div>
            ))}
          </div>
        )}

        {/* 4. AI加持 */}
        {scene.aiFeature && (
          <div style={{
            padding: "14px 16px", borderRadius: 14, marginBottom: 20,
            background: "linear-gradient(135deg,rgba(203,164,113,0.15),rgba(198,40,40,0.1))",
            border: "1px solid rgba(203,164,113,0.3)",
            boxShadow: "0 0 20px rgba(203,164,113,0.08)"
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
              <Sparkles size={13} style={{ color: "#CBA471", filter: "drop-shadow(0 0 4px #CBA471)", flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: "#CBA471", textShadow: "0 0 8px rgba(203,164,113,0.5)" }}>4. AI 加持</span>
            </div>
            <div style={{ fontSize: 13, color: "#D4A96A", lineHeight: 1.75, textShadow: "0 0 6px rgba(203,164,113,0.2)" }}>{scene.aiFeature}</div>
          </div>
        )}

        {/* 底部CTA */}
        <div style={{
          padding: "14px 16px", borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "space-between",
          background: "linear-gradient(135deg,rgba(203,164,113,0.2),rgba(198,40,40,0.15))",
          border: "1px solid rgba(203,164,113,0.25)"
        }}>
          <div>
            <div style={{ fontSize: 11, color: "#8B7355", marginBottom: 3 }}>想要这个场景的定制账本？</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#CBA471" }}>联系管理员进行私人定制</div>
          </div>
          <div style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: "#CBA471", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 14px rgba(203,164,113,0.5)", flexShrink: 0 }}>
            <ArrowRight size={16} color="#1A1000" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CustomShowcase() {
  const [selected, setSelected] = useState<SceneDetail | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [dims, setDims] = useState({ w: window.innerWidth, h: window.innerHeight });

  useEffect(() => {
    const t = setTimeout(() => setRevealed(true), 100);
    const fn = () => setDims({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", fn);
    return () => { clearTimeout(t); window.removeEventListener("resize", fn); };
  }, []);

  const CANVAS_W = dims.w;
  const CANVAS_H = dims.h;
  const CX = CANVAS_W / 2;
  const CY = CANVAS_H / 2;

  // 六边形尺寸：适配手机屏幕
  const BASE_R = Math.min(38, dims.w / 10);

  // 计算需要多少圈铺满屏幕
  const ringsNeeded = Math.ceil(Math.max(
    CANVAS_W / (Math.sqrt(3) * BASE_R * 2),
    CANVAS_H / (BASE_R * 3)
  )) + 2;

  const hexGrid = generateHexGrid(ringsNeeded);

  // 场景分配：按圈顺序唯一分配，不循环，超出场景库的节点用占位样式
  // 先过滤出屏幕内可见节点，再按距离中心的顺序分配场景
  const EXTRA_COLORS = ["#37474F","#4E342E","#1A237E","#2E7D32","#311B92","#006064","#4A148C","#880E4F","#BF360C","#283593"];
  const EXTRA_ICONS = [Package, Box, Layers, Globe, Server, Database, Cpu, Wallet, Landmark, Shield];
  const EXTRA_LABELS = ["待开发","待定制","待探索","待解锁","待激活","待配置","待开通","待升级","待接入","待评估"];

  let sceneIdx = 0;
  const hexList = hexGrid.map(({ q, r, ring }, idx) => {
    const px = CX + BASE_R * Math.sqrt(3) * (q + r / 2);
    const py = CY + BASE_R * 1.5 * r;

    let label: string, icon: any, color: string, desc: string;
    if (q === 0 && r === 0) {
      label = "钱脉"; icon = Gem; color = "#C62828"; desc = "多人实时共享账本，数据永久留存，权限精细管控。AI分析行为模式，自动识别异常、预测趋势。";
    } else if (sceneIdx < SCENE_LIST.length) {
      // 场景库内：唯一分配
      const s = SCENE_LIST[sceneIdx];
      label = s.label; icon = s.icon; color = s.color; desc = s.desc;
      sceneIdx++;
    } else {
      // 超出场景库：用占位样式，显示为待开发状态
      const ei = (sceneIdx - SCENE_LIST.length) % EXTRA_COLORS.length;
      label = EXTRA_LABELS[ei % EXTRA_LABELS.length];
      icon = EXTRA_ICONS[ei];
      color = EXTRA_COLORS[ei];
      desc = "此场景正在开发中，敌请期待。";
      sceneIdx++;
    }

    // 保存完整场景对象引用
    const sceneRef: SceneDetail | null = (q === 0 && r === 0) ? null :
      (sceneIdx - 1 >= 0 && sceneIdx - 1 < SCENE_LIST.length) ? SCENE_LIST[sceneIdx - 1] : null;
    return { q, r, px, py, ring, label, icon, color, desc, sceneRef, idx };
  });

  // 透明度：中心亮，边缘渐暗但可见
  function getOpacity(px: number, py: number) {
    const dist = Math.sqrt((px - CX) ** 2 + (py - CY) ** 2);
    const maxDist = Math.sqrt(CX ** 2 + CY ** 2);
    const t = Math.min(dist / (maxDist * 0.9), 1);
    return Math.max(0.2, 1 - t * 0.78);
  }

  function hexPoints(cx: number, cy: number, r: number) {
    return Array.from({ length: 6 }, (_, i) => {
      const a = (Math.PI / 3) * i - Math.PI / 6;
      return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
    }).join(" ");
  }

  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden", background: "#0D0800", position: "relative" }}>
      {/* 蜂巢全屏 */}
      <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
        <svg width={CANVAS_W} height={CANVAS_H} style={{ position: "absolute", top: 0, left: 0, overflow: "visible" }}>
          {hexList.map(({ px, py, ring, label, icon: Icon, color, desc, sceneRef, idx }) => {
            const isCenter = ring === 0;
            const isSelected = selected?.label === label && selected?.color === color;
            const opacity = getOpacity(px, py);
            const r = isCenter ? BASE_R * 1.15 : BASE_R * 0.96;
            const pts = hexPoints(px, py, r - 0.8);
            const delay = Math.min(ring * 50, 600);
            const showText = true; // 所有节点都显示文字，边缘被截断也没关系

            // 标签处理：超过4字换行
            const labelLines = label.length <= 4
              ? [label]
              : label.length <= 6
                ? [label.slice(0, Math.ceil(label.length / 2)), label.slice(Math.ceil(label.length / 2))]
                : [label.slice(0, 3), label.slice(3)];

            return (
              <g key={`h${idx}`}
                onClick={() => {
                  if (opacity < 0.35) return;
                  if (sceneRef) {
                    setSelected(sceneRef);
                  } else {
                    setSelected({ label, icon: Icon, color, desc });
                  }
                }}
                style={{
                  cursor: opacity >= 0.28 ? "pointer" : "default",
                  opacity: revealed ? opacity : 0,
                  transition: `opacity 0.5s ease ${delay}ms`
                }}>
                {isCenter && (
                  <polygon points={hexPoints(px, py, r + 7)} fill="none"
                    stroke="#CBA471" strokeWidth={2.5}
                    style={{ filter: "drop-shadow(0 0 12px #CBA471)" }}
                    className="hex-pulse" />
                )}
                {isSelected && (
                  <polygon points={hexPoints(px, py, r + 4)} fill="none"
                    stroke="#CBA471" strokeWidth={2}
                    style={{ filter: "drop-shadow(0 0 8px #CBA471)" }} />
                )}
                <polygon points={pts} fill={color}
                  stroke="rgba(203,164,113,0.18)" strokeWidth={0.7}
                  style={{ filter: isCenter ? "drop-shadow(0 4px 16px rgba(0,0,0,0.8))" : "drop-shadow(0 1px 3px rgba(0,0,0,0.6))" }} />
                <polygon points={pts} fill="none" stroke="rgba(203,164,113,0.22)" strokeWidth={0.5} />
                {showText && (
                  <foreignObject x={px - r} y={py - r} width={r * 2} height={r * 2} style={{ pointerEvents: "none" }}>
                    <div style={{
                      width: "100%", height: "100%", display: "flex", flexDirection: "column",
                      alignItems: "center", justifyContent: "center", color: "#fff", gap: "1px"
                    }}>
                      <Icon size={isCenter ? 17 : ring <= 1 ? 14 : 12} strokeWidth={2} />
                      {labelLines.map((line, i) => (
                        <div key={i} style={{
                          fontSize: isCenter ? 11 : ring <= 1 ? 10.5 : ring <= 3 ? 10 : 9.5,
                          fontWeight: 800,
                          lineHeight: 1.1,
                          textAlign: "center",
                          textShadow: "0 1px 3px rgba(0,0,0,0.95), 0 0 6px rgba(0,0,0,0.8)",
                          letterSpacing: "0.02em"
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

      {/* 顶部导航叠加层 */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 10, padding: "48px 16px 16px", background: "linear-gradient(to bottom,rgba(13,8,0,0.92) 55%,transparent)", pointerEvents: "none" }}>
        <div style={{ display: "flex", alignItems: "center", pointerEvents: "auto" }}>
          <Link href="/ledger">
            <button style={{ padding: "8px", marginLeft: "-8px", background: "none", border: "none", cursor: "pointer" }}>
              <ChevronLeft style={{ width: 24, height: 24, color: "#CBA471" }} />
            </button>
          </Link>
          <div style={{ flex: 1, textAlign: "center" }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#CBA471" }}>私人定制</div>
          </div>
          <div style={{ width: 40 }} />
        </div>
      </div>

      {selected && (
        <DetailCard
          scene={selected}
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
