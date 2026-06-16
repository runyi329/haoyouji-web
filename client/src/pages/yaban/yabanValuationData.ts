/**
 * 牙伴齿科管理 - AI 智能估值假数据
 * 三家门店：阳光口腔 / 星辰齿科 / 瑞尔城西
 * 字段命名严格对齐原型，后续接入实时经营数据模型时按此结构替换。
 * 严禁 Emoji。
 */

export interface TrendEvent {
  /** 圆点颜色，使用 YB 配色 hex */
  color: string;
  text: string;
}

export interface ClinicValuation {
  name: string;
  shortName: string;
  area: string;
  valuation: string;
  change: string;
  changeAmount: string;
  confidence: string;
  scale: string;
  baseValuation: string;
  dynamicPremium: string;
  // 经营指标
  revenue: string;
  revenueChange: string;
  patients: string;
  patientsChange: string;
  newPatients: string;
  newPatientsChange: string;
  returnRate: string;
  returnRateChange: string;
  chairRate: string;
  chairRateChange: string;
  avgPrice: string;
  avgPriceChange: string;
  aiSummary: string;
  // 股份
  sharePrice: string;
  dividendRate: string;
  totalShares: string;
  soldShares: string;
  remainShares: string;
  soldPercent: string;
  // 资产
  assetFixed: string;
  assetChair: string;
  assetImaging: string;
  assetSterilize: string;
  assetDecor: string;
  assetSoft: string;
  assetDoctorSenior: string;
  assetDoctorMid: string;
  assetDoctorExp: string;
  assetCert1: string;
  assetCert2: string;
  assetCert3: string;
  assetLocation: string;
  assetCommercial: string;
  assetPopulation: string;
  assetCompetition: string;
  // 支出
  costTotal: string;
  costProfitRate: string;
  costRent: string;
  costRentBar: string;
  costSalary: string;
  costSalaryBar: string;
  costOps: string;
  costOpsBar: string;
  costMkt: string;
  costMktBar: string;
  costUtil: string;
  costUtilBar: string;
  costNetProfit: string;
  // 项目结构
  pieImplant: string;
  pieOrtho: string;
  pieRestore: string;
  pieBasic: string;
  pieOther: string;
  highMarginPct: string;
  pieData: number[];
  // 客户价值
  ltvValue: string;
  cacValue: string;
  ltvCacRatio: string;
  referralRate: string;
  highValuePct: string;
  // 风险
  riskLease: string;
  riskLeaseDetail: string;
  riskDoctor: string;
  riskDoctorDetail: string;
  riskCompliance: string;
  riskComplianceDetail: string;
  riskCashflow: string;
  riskCashflowDetail: string;
  riskOverall: string;
  // 趋势
  trendData: number[];
  trendLabels: string[];
  trendEvents: TrendEvent[];
}

export const YB = {
  blue: "#1E88D6",
  blueDeep: "#0E5A9E",
  blueLight: "#3BA9E0",
  blueFaint: "#EAF4FE",
  green: "#16A34A",
  greenFaint: "#E6F7EE",
  orange: "#D97706",
  orangeFaint: "#FEF6E6",
  purple: "#7C5CFC",
  purpleFaint: "#F3F0FF",
  red: "#DC2626",
  redFaint: "#FEF2F2",
} as const;

export const CLINICS: ClinicValuation[] = [
  {
    name: "阳光口腔门诊部",
    shortName: "阳光口腔",
    area: "杭州市 西湖区",
    valuation: "3,680,000",
    change: "+4.5%",
    changeAmount: "较上月增长 16万",
    confidence: "87%",
    scale: "7-10张牙椅 / 开业7年",
    baseValuation: "2,800,000",
    dynamicPremium: "880,000",
    revenue: "42.6万",
    revenueChange: "+8.2%",
    patients: "1,286",
    patientsChange: "+156",
    newPatients: "89",
    newPatientsChange: "+12%",
    returnRate: "68.5%",
    returnRateChange: "+3.2%",
    chairRate: "76.3%",
    chairRateChange: "-1.8%",
    avgPrice: "3,312",
    avgPriceChange: "+5.6%",
    aiSummary:
      "该门店位于杭州市西湖区核心商圈，开业7年，经营稳定。月均营收42.6万元，高于同规模门诊均值18%。存量客户1,286人，近半年月均新增89人，客户增速处于行业前25%分位。复诊率68.5%，客户粘性良好。高毛利项目（种植+正畸）占比64%，客户LTV达8,640元，获客成本仅320元，LTV/CAC比值27:1，远超行业健康线。综合评估：该门店属于成熟期优质资产，估值区间为350-390万元，建议关注椅位利用率提升空间及核心医生持股绑定。",
    sharePrice: "36,800",
    dividendRate: "12.8%",
    totalShares: "100",
    soldShares: "23",
    remainShares: "77",
    soldPercent: "23%",
    assetFixed: "约 68 万元",
    assetChair: "7 台（进口 A-dec）",
    assetImaging: "CBCT + 数字全景",
    assetSterilize: "全自动高压灭菌柜",
    assetDecor: "约 18 万元",
    assetSoft: "高价值",
    assetDoctorSenior: "2",
    assetDoctorMid: "3",
    assetDoctorExp: "均 8 年",
    assetCert1: "口腔种植专科",
    assetCert2: "正畸专科",
    assetCert3: "儿牙专科",
    assetLocation: "优质地段",
    assetCommercial: "A 级",
    assetPopulation: "8.2 万/km2",
    assetCompetition: "低竞争",
    costTotal: "约 28.4 万元",
    costProfitRate: "33.3%",
    costRent: "9.8 万",
    costRentBar: "35%",
    costSalary: "14.2 万",
    costSalaryBar: "50%",
    costOps: "2.6 万",
    costOpsBar: "20%",
    costMkt: "1.2 万",
    costMktBar: "15%",
    costUtil: "0.6 万",
    costUtilBar: "8%",
    costNetProfit: "约 14.2 万元",
    pieImplant: "38%",
    pieOrtho: "26%",
    pieRestore: "18%",
    pieBasic: "12%",
    pieOther: "6%",
    highMarginPct: "64%",
    pieData: [38, 26, 18, 12, 6],
    ltvValue: "8,640",
    cacValue: "320",
    ltvCacRatio: "27:1",
    referralRate: "32.5%",
    highValuePct: "28.6%",
    riskLease: "低风险",
    riskLeaseDetail: "剩余租期 4.5 年，含优先续租权",
    riskDoctor: "中风险",
    riskDoctorDetail: "2名核心医生未持股，患者跟随医生比例约35%",
    riskCompliance: "低风险",
    riskComplianceDetail: "无医疗纠纷记录，证照齐全，医责险已覆盖",
    riskCashflow: "优良",
    riskCashflowDetail: "应收账款周期 3 天，预收储值卡余额 42 万",
    riskOverall: "低风险（A级）",
    trendData: [320, 328, 345, 352, 360, 368],
    trendLabels: ["1月", "2月", "3月", "4月", "5月", "6月"],
    trendEvents: [
      { color: YB.green, text: "3月 新增1名主任医师，估值上涨5.2%" },
      { color: YB.blue, text: "5月 月营收突破40万，连续3月增长" },
      { color: YB.orange, text: "6月 椅位利用率小幅回调，估值增速放缓" },
    ],
  },
  {
    name: "星辰齿科诊所",
    shortName: "星辰齿科",
    area: "杭州市 拱墅区",
    valuation: "2,150,000",
    change: "+6.8%",
    changeAmount: "较上月增长 13.7万",
    confidence: "82%",
    scale: "4-6张牙椅 / 开业3年",
    baseValuation: "1,520,000",
    dynamicPremium: "630,000",
    revenue: "28.3万",
    revenueChange: "+11.5%",
    patients: "756",
    patientsChange: "+98",
    newPatients: "112",
    newPatientsChange: "+18%",
    returnRate: "62.1%",
    returnRateChange: "+5.1%",
    chairRate: "82.7%",
    chairRateChange: "+2.3%",
    avgPrice: "2,860",
    avgPriceChange: "+3.2%",
    aiSummary:
      "该诊所位于杭州市拱墅区新兴商业区，开业3年，处于快速成长期。月均营收28.3万元，近半年增速达11.5%，明显高于行业均值。新客获取能力突出，月均新增112人，获客成本仅280元。种植+正畸占比52%，正在向高毛利结构转型。综合评估：该诊所属于成长期潜力资产，估值区间为200-230万元，建议关注客户留存率提升。",
    sharePrice: "21,500",
    dividendRate: "9.6%",
    totalShares: "100",
    soldShares: "15",
    remainShares: "85",
    soldPercent: "15%",
    assetFixed: "约 38 万元",
    assetChair: "5 台（国产优质）",
    assetImaging: "数字全景 + 口内相机",
    assetSterilize: "半自动灭菌设备",
    assetDecor: "约 8 万元",
    assetSoft: "成长期",
    assetDoctorSenior: "1",
    assetDoctorMid: "3",
    assetDoctorExp: "均 5 年",
    assetCert1: "口腔种植专科",
    assetCert2: "正畸专科",
    assetCert3: "牙体修复专科",
    assetLocation: "新兴商圈",
    assetCommercial: "B 级",
    assetPopulation: "6.5 万/km2",
    assetCompetition: "中等竞争",
    costTotal: "约 18.6 万元",
    costProfitRate: "34.3%",
    costRent: "5.2 万",
    costRentBar: "28%",
    costSalary: "10.1 万",
    costSalaryBar: "54%",
    costOps: "1.8 万",
    costOpsBar: "10%",
    costMkt: "1.0 万",
    costMktBar: "5%",
    costUtil: "0.5 万",
    costUtilBar: "3%",
    costNetProfit: "约 9.7 万元",
    pieImplant: "28%",
    pieOrtho: "24%",
    pieRestore: "22%",
    pieBasic: "18%",
    pieOther: "8%",
    highMarginPct: "52%",
    pieData: [28, 24, 22, 18, 8],
    ltvValue: "6,200",
    cacValue: "280",
    ltvCacRatio: "22:1",
    referralRate: "26.8%",
    highValuePct: "19.2%",
    riskLease: "中风险",
    riskLeaseDetail: "剩余租期 2 年，续租条款待协商",
    riskDoctor: "低风险",
    riskDoctorDetail: "核心医生为合伙人，持股15%",
    riskCompliance: "低风险",
    riskComplianceDetail: "无纠纷记录，证照齐全",
    riskCashflow: "良好",
    riskCashflowDetail: "应收账款周期 5 天，储值卡余额 18 万",
    riskOverall: "中低风险（B+级）",
    trendData: [168, 175, 182, 192, 201, 215],
    trendLabels: ["1月", "2月", "3月", "4月", "5月", "6月"],
    trendEvents: [
      { color: YB.green, text: "2月 新增正畸项目，高毛利占比提升" },
      { color: YB.blue, text: "4月 月新增客户破100，增速领先同区" },
      { color: YB.green, text: "6月 椅位利用率达82.7%，运营效率优秀" },
    ],
  },
  {
    name: "瑞尔口腔连锁(城西店)",
    shortName: "瑞尔城西",
    area: "杭州市 余杭区",
    valuation: "5,420,000",
    change: "+2.1%",
    changeAmount: "较上月增长 11.2万",
    confidence: "91%",
    scale: "10张以上牙椅 / 开业12年",
    baseValuation: "4,200,000",
    dynamicPremium: "1,220,000",
    revenue: "68.9万",
    revenueChange: "+3.8%",
    patients: "2,341",
    patientsChange: "+87",
    newPatients: "65",
    newPatientsChange: "+5%",
    returnRate: "74.2%",
    returnRateChange: "+1.5%",
    chairRate: "71.8%",
    chairRateChange: "-0.5%",
    avgPrice: "4,580",
    avgPriceChange: "+2.1%",
    aiSummary:
      "该门店为瑞尔口腔连锁品牌城西分店，位于余杭区核心地段，开业12年，品牌知名度高。月均营收68.9万元，客单价4,580元，属于中高端定位。存量客户2,341人，复诊率74.2%，客户资产雄厚。种植+正畸占比71%，高净值客户占比35.8%，LTV高达12,400元。综合评估：该门店属于成熟期稳健资产，估值区间为520-560万元，分红能力稳定。",
    sharePrice: "54,200",
    dividendRate: "15.2%",
    totalShares: "100",
    soldShares: "41",
    remainShares: "59",
    soldPercent: "41%",
    assetFixed: "约 145 万元",
    assetChair: "12 台（全进口配置）",
    assetImaging: "CBCT + 全局数字化",
    assetSterilize: "工厂级全自动灭菌系统",
    assetDecor: "约 42 万元",
    assetSoft: "极高价值",
    assetDoctorSenior: "4",
    assetDoctorMid: "6",
    assetDoctorExp: "均 12 年",
    assetCert1: "口腔种植专科",
    assetCert2: "正畸专科",
    assetCert3: "颌面外科",
    assetLocation: "核心商圈",
    assetCommercial: "S 级",
    assetPopulation: "11.4 万/km2",
    assetCompetition: "高竞争但品牌屏障",
    costTotal: "约 46.1 万元",
    costProfitRate: "33.1%",
    costRent: "16.5 万",
    costRentBar: "36%",
    costSalary: "22.8 万",
    costSalaryBar: "49%",
    costOps: "4.2 万",
    costOpsBar: "9%",
    costMkt: "1.8 万",
    costMktBar: "4%",
    costUtil: "0.8 万",
    costUtilBar: "2%",
    costNetProfit: "约 22.8 万元",
    pieImplant: "42%",
    pieOrtho: "29%",
    pieRestore: "15%",
    pieBasic: "9%",
    pieOther: "5%",
    highMarginPct: "71%",
    pieData: [42, 29, 15, 9, 5],
    ltvValue: "12,400",
    cacValue: "580",
    ltvCacRatio: "21:1",
    referralRate: "38.2%",
    highValuePct: "35.8%",
    riskLease: "低风险",
    riskLeaseDetail: "自有物业，无租约风险",
    riskDoctor: "低风险",
    riskDoctorDetail: "4名核心医生均持股，团队稳定12年",
    riskCompliance: "低风险",
    riskComplianceDetail: "连锁品牌合规体系完善，零纠纷",
    riskCashflow: "极优",
    riskCashflowDetail: "应收账款周期 1 天，储值卡余额 128 万",
    riskOverall: "极低风险（A+级）",
    trendData: [498, 505, 512, 520, 530, 542],
    trendLabels: ["1月", "2月", "3月", "4月", "5月", "6月"],
    trendEvents: [
      { color: YB.green, text: "1月 品牌升级完成，客单价提升8%" },
      { color: YB.blue, text: "3月 储值卡余额突破100万，现金流极优" },
      { color: YB.green, text: "5月 高净值客户占比突破35%" },
    ],
  },
];
