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

// ===== 场景数据：按热门度从高到低排列（索引越小越热门，放越中间）=====
// 格式：[标签, 图标, 颜色, 简介]
const SCENE_LIST: [string, any, string, string][] = [
  // ===== 第1圈：超高频生活场景 =====
  ["餐饮门店", Utensils,      "#E64A19", "扫码留意见，老板实时收到，多门店管理"],
  ["健康管理", Heart,         "#AD1457", "共同健身账本，互相监督打卡，医疗费用追踪"],
  ["教育培训", GraduationCap, "#283593", "学员缴费、课时追踪，双方共同可见进度"],
  ["商业合作", Briefcase,     "#4E342E", "合伙人账本，收益分配，权限分级管控"],
  ["家庭生活", Home,          "#2E7D32", "家庭共同账本，装修、旅行预算全家可见"],
  ["社群运营", Users,         "#6A1B9A", "AA聚餐、团购分摊，自动计算人均"],
  // ===== 第2圈：高频商业场景 =====
  ["连锁餐厅", Building2,     "#BF360C", "多门店统一管理，桌号二维码，实时汇总"],
  ["健身打卡", Dumbbell,      "#880E4F", "好友互督，训练记录，目标追踪"],
  ["培训收费", Star,          "#1A237E", "学员缴费，课时追踪，收入统计"],
  ["投资跟踪", TrendingUp,    "#3E2723", "收益分配，资金追踪，合伙人实时可见"],
  ["旅行AA",   Plane,         "#004D40", "实时记账，人均计算，多人协作"],
  ["活动策划", Music,         "#4A148C", "收支明细，预算管理，成本核算"],
  // ===== 第3圈：常见行业场景 =====
  ["零售门店", ShoppingCart,  "#B71C1C", "日常收支，进货追踪，员工提成分账"],
  ["医疗费用", Pill,          "#880E4F", "共享追踪，报销记录，用药账本"],
  ["咖啡连锁", Coffee,        "#4E342E", "顾客留言，会员积分，门店对比"],
  ["民宿管理", Hotel,         "#37474F", "客户反馈，房间收支，多房间管理"],
  ["骑行打卡", Bike,          "#1B5E20", "里程打卡，费用AA，装备分摊"],
  ["育儿账本", Baby,          "#880E4F", "育儿费用，夫妻共账，成长记录"],
  // ===== 第4圈：专业服务场景 =====
  ["维修服务", Wrench,        "#BF360C", "收支记录，零件追踪，客户历史"],
  ["存钱挑战", PiggyBank,     "#0D47A1", "好友共同挑战，每日打卡，目标追踪"],
  ["读书打卡", BookOpen,      "#006064", "读书打卡，笔记共享，俱乐部费用"],
  ["配送管理", Truck,         "#E65100", "订单追踪，骑手提成，团队绩效"],
  ["游戏公会", Gamepad2,      "#880E4F", "费用分摊，装备记录，战利品分配"],
  ["美容工作室", Scissors,    "#4A148C", "客户反馈，预约收支，提成分账"],
  // ===== 第5圈：生活方式场景 =====
  ["环保打卡", Leaf,          "#1B5E20", "环保打卡，碳积分，公益费用"],
  ["理财记录", Landmark,      "#1A237E", "理财记录，定投追踪，资产配置"],
  ["用车记账", Car,           "#E65100", "加油、保养、保险，多人分摊"],
  ["摄影工作室", Camera,      "#311B92", "客户预付款，收支记录，设备折旧"],
  ["运动赛事", Trophy,        "#BF360C", "赛事费用，奖金分配，装备采购"],
  ["酒水采购", Wine,          "#4A148C", "采购记录，库存追踪，宴席分摊"],
  // ===== 第6圈：消费零售场景 =====
  ["服装门店", Shirt,         "#880E4F", "进货记录，销售收支，提成分账"],
  ["宠物账本", Flower2,       "#2E7D32", "医疗记录，食品追踪，美容费用"],
  ["房产租赁", MapPin,        "#37474F", "租金收支，维修追踪，多房东分账"],
  ["保险记录", Shield,        "#1A237E", "保单记录，保费追踪，理赔记录"],
  ["自由职业", Monitor,       "#4E342E", "收入记录，项目分成，税务追踪"],
  ["农业合作", Tent,          "#1B5E20", "合作社收支，销售记录，成员分红"],
  // ===== 第7圈：内容创作场景 =====
  ["自媒体", Tv,              "#311B92", "广告收益，MCN分成，创作成本"],
  ["婚礼策划", Flower2,       "#880E4F", "费用追踪，礼金记录，供应商管理"],
  ["公益志愿", Globe,         "#006064", "费用追踪，捐款记录，时间银行"],
  ["创业团队", Rocket,        "#BF360C", "团队收支，股权追踪，融资记录"],
  ["音乐工作室", Headphones,  "#4A148C", "版权收益，录音成本，工作室收支"],
  ["口腔诊所", Stethoscope,   "#1A237E", "诊所收支，预约记录，提成分账"],
  // ===== 第8圈：专业机构场景 =====
  ["托育机构", Baby,          "#2E7D32", "收费记录，家长反馈，教师绩效"],
  ["健身房", Dumbbell,        "#BF360C", "会员收费，课时追踪，设备维护"],
  ["仓储管理", Package,       "#4E342E", "货物进出，收支追踪，租金分摊"],
  ["钱包管理", Wallet,        "#1565C0", "多账户收支，余额追踪，账单提醒"],
  ["礼品记录", Gift,          "#6A1B9A", "礼品清单，节日提醒，收支记录"],
  ["现金流水", Banknote,      "#2E7D32", "现金收支，流水统计，多人共账"],
  // ===== 第9圈：创意设计场景 =====
  ["时间账本", Clock,         "#37474F", "时间记录，工时追踪，效率分析"],
  ["设计工作室", Palette,     "#AD1457", "项目收支，客户管理，提成分账"],
  ["视频制作", Video,         "#311B92", "项目收支，设备折旧，团队分成"],
  ["电话营销", Phone,         "#E65100", "销售收支，客户跟进，提成分账"],
  ["项目管理", Layers,        "#1A237E", "项目收支，里程碑，团队分成"],
  ["市场调研", Search,        "#4A148C", "调研费用，数据追踪，报告管理"],
  // ===== 第10圈：数字科技场景 =====
  ["播客收益", Radio,         "#006064", "广告收益，赞助追踪，制作成本"],
  ["区块链账", Hash,          "#1A237E", "链上收支，交易追踪，资产管理"],
  ["联盟营销", Link2,         "#E65100", "佣金收支，转化追踪，合作方管理"],
  ["安全账本", Lock,          "#4A148C", "安全费用，风险追踪，保险管理"],
  ["美妆账本", Sparkles,      "#AD1457", "消费记录，品牌追踪，好友分享"],
  ["出行记账", Navigation,    "#004D40", "出行费用，多人分摊，报销追踪"],
  // ===== 第11圈：餐饮细分场景 =====
  ["烘焙甜品", ChefHat,       "#BF360C", "原料采购，销售收支，配方成本"],
  ["火锅店", Flame,           "#C62828", "食材进货，桌位收支，员工分账"],
  ["奶茶店", Coffee,          "#4E342E", "原料追踪，日销统计，加盟分成"],
  ["外卖运营", Truck,         "#E65100", "平台佣金，骑手费用，日营业额"],
  ["酒店餐厅", Utensils,      "#37474F", "宴会收支，食材成本，服务员提成"],
  ["夜市摊位", Sunset,        "#BF360C", "日收支记录，进货追踪，多摊位管理"],
  // ===== 第12圈：教育细分场景 =====
  ["幼儿园", Baby,            "#2E7D32", "学费收缴，活动费用，家长反馈"],
  ["艺术培训", Palette,       "#AD1457", "课时收费，材料费用，学员进度"],
  ["体育培训", Trophy,        "#BF360C", "训练费用，比赛报名，装备采购"],
  ["语言培训", Globe,         "#006064", "课时收费，教材费用，学员管理"],
  ["职业技能", Clipboard,     "#283593", "培训收支，证书费用，学员追踪"],
  ["在线教育", Monitor,       "#311B92", "课程收益，平台分成，内容成本"],
  // ===== 第13圈：医疗健康场景 =====
  ["中医诊所", Stethoscope,   "#2E7D32", "诊费收支，药材采购，患者记录"],
  ["心理咨询", Heart,         "#AD1457", "咨询收费，预约管理，案例记录"],
  ["养老服务", Users,         "#37474F", "服务收费，护理记录，家属反馈"],
  ["月子中心", Baby,          "#880E4F", "服务收费，物资采购，客户管理"],
  ["健康食品", Leaf,          "#1B5E20", "采购记录，销售收支，会员管理"],
  ["医美机构", Sparkles,      "#4A148C", "项目收费，耗材追踪，客户档案"],
  // ===== 第14圈：零售细分场景 =====
  ["超市便利", ShoppingCart,  "#B71C1C", "日收支，进货追踪，损耗记录"],
  ["书店文具", BookOpen,      "#006064", "进货记录，销售收支，活动费用"],
  ["电器数码", Cpu,           "#283593", "进货追踪，维修收支，员工提成"],
  ["珠宝首饰", Sparkles,      "#BF360C", "进货记录，销售收支，定制追踪"],
  ["花卉园艺", Flower2,       "#2E7D32", "进货记录，销售收支，养护成本"],
  ["二手交易", RefreshCw,     "#4E342E", "收购记录，销售收支，利润追踪"],
  // ===== 第15圈：制造工业场景 =====
  ["工厂制造", Factory,       "#37474F", "生产成本，原料采购，工人工资"],
  ["建筑工程", HardHat,       "#4E342E", "工程收支，材料采购，工人分账"],
  ["精密仪器", Microscope,    "#1A237E", "设备采购，维护费用，项目收支"],
  ["大宗贸易", Anchor,        "#3E2723", "货物采购，运输费用，利润分配"],
  ["农业加工", Wheat,         "#1B5E20", "原料采购，加工成本，销售收支"],
  ["化工原料", Thermometer,   "#BF360C", "采购记录，库存追踪，安全费用"],
  // ===== 第16圈：专业服务场景 =====
  ["律师事务", Clipboard,     "#1A237E", "案件收费，差旅费用，团队分成"],
  ["会计事务", BarChart2,     "#283593", "服务收费，项目追踪，税务记录"],
  ["广告公司", Palette,       "#AD1457", "项目收支，媒体费用，提成分账"],
  ["猎头公司", UserCheck,     "#4E342E", "佣金收入，候选人追踪，成本管理"],
  ["咨询公司", Lightbulb,     "#006064", "项目收费，差旅费用，团队分成"],
  ["公关公司", MessageCircle, "#4A148C", "项目收支，媒体费用，活动成本"],
  // ===== 第17圈：交通物流场景 =====
  ["货运物流", Truck,         "#E65100", "运费收支，油耗追踪，司机分账"],
  ["快递驿站", Package,       "#4E342E", "收件收支，代收费用，日流水"],
  ["汽车维修", Car,           "#BF360C", "维修收支，配件采购，技师提成"],
  ["驾校培训", Car,           "#283593", "学员收费，教练分成，车辆维护"],
  ["船运贸易", Anchor,        "#37474F", "运费收支，港口费用，货物追踪"],
  ["航空服务", Plane,         "#1A237E", "票务收支，地勤费用，服务追踪"],
  // ===== 第18圈：能源环境场景 =====
  ["太阳能", Zap,             "#E65100", "安装收支，维护费用，发电收益"],
  ["废品回收", Recycle,       "#1B5E20", "回收收支，分类记录，利润追踪"],
  ["水处理", Wind,            "#006064", "运营收支，药剂采购，设备维护"],
  ["园林绿化", Leaf,          "#2E7D32", "工程收支，苗木采购，养护费用"],
  ["环境监测", Activity,      "#283593", "设备费用，检测收支，报告管理"],
  ["清洁能源", Snowflake,     "#004D40", "项目收支，设备采购，运维费用"],
  // ===== 第19圈：文化娱乐场景 =====
  ["剧本杀", Gamepad2,        "#4A148C", "门票收支，道具采购，员工分账"],
  ["密室逃脱", Key,           "#BF360C", "门票收支，道具维护，员工分账"],
  ["电影院", Video,           "#311B92", "票房收支，运营成本，分成记录"],
  ["KTV娱乐", Music2,         "#AD1457", "包厢收支，酒水采购，员工分账"],
  ["展览策划", Palette,       "#006064", "展位收支，布展费用，参展管理"],
  ["旅游景区", Mountain,      "#2E7D32", "票务收支，运营成本，分成记录"],
  // ===== 第20圈：金融科技场景 =====
  ["小额贷款", DollarSign,    "#1A237E", "贷款收支，利息追踪，风控记录"],
  ["股权投资", TrendingUp,    "#3E2723", "投资记录，分红追踪，退出管理"],
  ["众筹项目", Users2,        "#4A148C", "筹款记录，支出追踪，回报管理"],
  ["数字货币", Cpu,           "#283593", "交易记录，收益追踪，风险管理"],
  ["基金管理", BarChart2,     "#1565C0", "净值追踪，收益分配，费用记录"],
  ["保理业务", FileText,      "#4E342E", "应收账款，融资记录，利息追踪"],
  // ===== 第21圈：农业细分场景 =====
  ["养殖场", Feather,         "#2E7D32", "饲料采购，出栏收入，兽医费用"],
  ["种植基地", Wheat,         "#1B5E20", "农资采购，销售收入，人工费用"],
  ["水产养殖", Anchor,        "#004D40", "饲料采购，销售收入，设备维护"],
  ["农产品电商", ShoppingCart,"#BF360C", "采购记录，销售收支，物流费用"],
  ["农机服务", Hammer,        "#4E342E", "设备维护，服务收入，油耗追踪"],
  ["有机农场", Leaf,          "#1B5E20", "认证费用，销售收支，会员管理"],
  // ===== 第22圈：科技研发场景 =====
  ["软件公司", Terminal,      "#283593", "项目收支，人力成本，版权收益"],
  ["硬件研发", Cpu,           "#1A237E", "研发费用，原型成本，专利追踪"],
  ["人工智能", Database,      "#311B92", "算力费用，项目收支，授权收益"],
  ["物联网", Server,          "#37474F", "设备采购，运维费用，服务收益"],
  ["生物科技", Microscope,    "#2E7D32", "研发费用，试验成本，专利管理"],
  ["新材料", Layers,          "#4E342E", "研发费用，原料采购，销售收支"],
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

// 详情弹窗
function DetailCard({ label, icon: Icon, color, desc, onClose }: {
  label: string; icon: any; color: string; desc: string; onClose: () => void;
}) {
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
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
              style={{ backgroundColor: color, boxShadow: `0 0 16px ${color}55` }}>
              <Icon size={24} color="#fff" strokeWidth={2} />
            </div>
            <div>
              <h3 className="font-bold text-lg" style={{ color: "#CBA471" }}>{label}</h3>
              <p className="text-xs" style={{ color: "#8B7355" }}>私人定制账本场景</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ backgroundColor: "rgba(203,164,113,0.12)" }}>
            <X size={16} style={{ color: "#8B7355" }} />
          </button>
        </div>
        <div className="px-5 mb-4 rounded-2xl mx-5 p-4" style={{ backgroundColor: "rgba(203,164,113,0.08)" }}>
          <div className="flex items-center gap-2 mb-2">
            <Zap size={14} style={{ color: "#CBA471" }} />
            <span className="text-xs font-bold" style={{ color: "#CBA471" }}>适用场景</span>
          </div>
          <p className="text-sm leading-relaxed" style={{ color: "#A0845C" }}>{desc}</p>
        </div>
        <div className="px-5 rounded-2xl mx-5 p-4 flex items-center justify-between"
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
      </div>
    </div>
  );
}

export default function CustomShowcase() {
  const [selected, setSelected] = useState<{ label: string; icon: any; color: string; desc: string } | null>(null);
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

  // 场景分配：按圈顺序分配，中心最热门
  let sceneIdx = 0;
  const hexList = hexGrid.map(({ q, r, ring }, idx) => {
    const px = CX + BASE_R * Math.sqrt(3) * (q + r / 2);
    const py = CY + BASE_R * 1.5 * r;

    let label: string, icon: any, color: string, desc: string;
    if (q === 0 && r === 0) {
      label = "前麦"; icon = Gem; color = "#C62828"; desc = "多人实时共享账本，数据永久留存，权限精细管控。AI分析行为模式，自动识别异常、预测趋势。";
    } else {
      const scene = SCENE_LIST[sceneIdx % SCENE_LIST.length];
      sceneIdx++;
      [label, icon, color, desc] = scene;
    }

    return { q, r, px, py, ring, label, icon, color, desc, idx };
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
          {hexList.map(({ px, py, ring, label, icon: Icon, color, desc, idx }) => {
            const isCenter = ring === 0;
            const isSelected = selected?.label === label && selected?.color === color;
            const opacity = getOpacity(px, py);
            const r = isCenter ? BASE_R * 1.15 : BASE_R * 0.96;
            const pts = hexPoints(px, py, r - 0.8);
            const delay = Math.min(ring * 50, 600);
            const showText = opacity >= 0.22;

            // 标签处理：超过4字换行
            const labelLines = label.length <= 4
              ? [label]
              : label.length <= 6
                ? [label.slice(0, Math.ceil(label.length / 2)), label.slice(Math.ceil(label.length / 2))]
                : [label.slice(0, 3), label.slice(3)];

            return (
              <g key={`h${idx}`}
                onClick={() => opacity >= 0.28 && setSelected({ label, icon: Icon, color, desc })}
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
                      <Icon size={isCenter ? 15 : ring <= 1 ? 12 : 10} strokeWidth={2} />
                      {labelLines.map((line, i) => (
                        <div key={i} style={{
                          fontSize: isCenter ? 9 : ring <= 1 ? 8.5 : ring <= 3 ? 8 : 7.5,
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
          label={selected.label}
          icon={selected.icon}
          color={selected.color}
          desc={selected.desc}
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
