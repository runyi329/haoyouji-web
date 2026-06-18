/**
 * 牙伴运营报表 - Mock 数据层
 * 对接真实后端时，将此文件中的数据替换为 trpc 接口调用
 * 接口规范见 接口需求单.md
 */

// ─── 店铺列表 ───────────────────────────────────────────────────────────────
export const SHOPS = [
  { id: 0, name: "全部店铺", badge: "" },
  { id: 1, name: "牙伴齿科·总院", badge: "总院" },
  { id: 2, name: "牙伴齿科·北区分院", badge: "分院" },
  { id: 3, name: "牙伴齿科·南区分院", badge: "分院" },
];

// ─── 日期快捷选项 ────────────────────────────────────────────────────────────
export const DATE_QUICK_OPTIONS = [
  { label: "今日", value: "today" },
  { label: "本周", value: "week" },
  { label: "本月", value: "month" },
  { label: "上月", value: "last_month" },
  { label: "近3月", value: "3months" },
  { label: "本年", value: "year" },
];

// ─── 总览数据 ────────────────────────────────────────────────────────────────
export interface OverviewData {
  label: string;
  amount: string;
  trendPct: number;
  trendLabel: string;
  target: string;
  patients: number;
  avgPerPatient: number;
}

export const mockOverview: OverviewData = {
  label: "本月实收",
  amount: "82.4万",
  trendPct: 12.3,
  trendLabel: "同比",
  target: "¥90.0万",
  patients: 470,
  avgPerPatient: 1752,
};

// ─── 日营收数据（柱状图）────────────────────────────────────────────────────
export interface DailyRevenue {
  date: string; // "5/19"
  value: number; // 万元
  isToday?: boolean;
  isFuture?: boolean;
  aiPredicted?: boolean;
}

function genDailyRevenue(): DailyRevenue[] {
  const base = [3.2, 4.1, 3.8, 2.8, 4.5, 5.1, 4.8, 3.6, 4.2, 3.9, 4.7, 5.3, 4.1, 3.5, 4.8, 5.2];
  const aiOffsets = [0, 0.04, 0.07, 0.06, 0.10, 0.08, 0.12, 0.09, 0.14, 0.11, 0.15, 0.13, 0.17, 0.12, 0.18, 0.14];
  const result: DailyRevenue[] = [];
  const startDay = 19; // 5月19日
  for (let i = 0; i < 16; i++) {
    const day = startDay + i;
    const month = day > 31 ? 6 : 5;
    const d = day > 31 ? day - 31 : day;
    result.push({
      date: `${month}/${d}`,
      value: base[i],
      isToday: i === 9,
      isFuture: i > 9,
      aiPredicted: i > 9,
    });
    void aiOffsets; // suppress unused warning
  }
  return result;
}

export const mockDailyRevenue = genDailyRevenue();
export const BREAKEVEN_VALUE = 1.48; // 万元/天

// ─── 热力图数据 ──────────────────────────────────────────────────────────────
export interface HeatmapCell {
  day: number; // 0=周一 ... 6=周日
  hour: number; // 8-20
  value: number; // 0-100 强度
}

export function genHeatmapData(): HeatmapCell[] {
  const cells: HeatmapCell[] = [];
  for (let d = 0; d < 7; d++) {
    for (let h = 8; h <= 20; h++) {
      let v = 0;
      if (d < 5) {
        if (h >= 9 && h <= 11) v = 60 + Math.random() * 35;
        else if (h >= 14 && h <= 17) v = 50 + Math.random() * 40;
        else if (h === 12 || h === 13) v = 20 + Math.random() * 20;
        else v = 10 + Math.random() * 20;
      } else {
        if (h >= 10 && h <= 16) v = 70 + Math.random() * 25;
        else v = 20 + Math.random() * 30;
      }
      cells.push({ day: d, hour: h, value: Math.round(v) });
    }
  }
  return cells;
}

// ─── 趋势图（面积图）数据 ────────────────────────────────────────────────────
export interface TrendPoint {
  date: string;
  actual: number;
  ai: number;
}

export function genTrendData(): TrendPoint[] {
  const months = ["1月", "2月", "3月", "4月", "5月", "6月"];
  return months.map((m, i) => ({
    date: m,
    actual: 65 + i * 4 + Math.random() * 8,
    ai: 63 + i * 4.5 + Math.random() * 6,
  }));
}

// ─── 周对比数据 ──────────────────────────────────────────────────────────────
export interface WeekCompareData {
  day: string;
  thisWeek: number;
  lastWeek: number;
  aiNext: number;
}

export const mockWeekCompare: WeekCompareData[] = [
  { day: "周一", thisWeek: 3.8, lastWeek: 3.2, aiNext: 4.1 },
  { day: "周二", thisWeek: 4.5, lastWeek: 4.1, aiNext: 4.8 },
  { day: "周三", thisWeek: 3.6, lastWeek: 3.8, aiNext: 3.9 },
  { day: "周四", thisWeek: 5.1, lastWeek: 4.6, aiNext: 5.4 },
  { day: "周五", thisWeek: 4.8, lastWeek: 4.2, aiNext: 5.0 },
  { day: "周六", thisWeek: 6.2, lastWeek: 5.8, aiNext: 6.5 },
  { day: "周日", thisWeek: 5.4, lastWeek: 5.0, aiNext: 5.7 },
];

// ─── 收入结构 ────────────────────────────────────────────────────────────────
export interface RevenueCategory {
  name: string;
  value: number; // 万元
  pct: number;
  color: string;
}

export const mockRevenueStructure: RevenueCategory[] = [
  { name: "正畸", value: 28.4, pct: 34.5, color: "#1E88D6" },
  { name: "种植", value: 22.1, pct: 26.8, color: "#3BA9E0" },
  { name: "修复", value: 14.6, pct: 17.7, color: "#5BC0F0" },
  { name: "洁牙", value: 8.3, pct: 10.1, color: "#7DD4F8" },
  { name: "其他", value: 9.0, pct: 10.9, color: "#A8E4FF" },
];

// ─── 医生绩效 ────────────────────────────────────────────────────────────────
export interface DoctorPerf {
  name: string;
  value: number; // 万元
  patients: number;
  avgPerPatient: number;
  pct: number; // 占总产值%
}

export const mockDoctorPerf: DoctorPerf[] = [
  { name: "张医生", value: 24.6, patients: 68, avgPerPatient: 3618, pct: 29.9 },
  { name: "李医生", value: 19.8, patients: 55, avgPerPatient: 3600, pct: 24.0 },
  { name: "王医生", value: 16.3, patients: 72, avgPerPatient: 2264, pct: 19.8 },
  { name: "陈医生", value: 12.7, patients: 48, avgPerPatient: 2646, pct: 15.4 },
  { name: "刘医生", value: 9.0, patients: 41, avgPerPatient: 2195, pct: 10.9 },
];

// ─── 咨询师转化 ──────────────────────────────────────────────────────────────
export interface ConsultantData {
  name: string;
  leads: number;
  converted: number;
  convRate: number; // %
  revenue: number; // 万元
}

export const mockConsultants: ConsultantData[] = [
  { name: "小美", leads: 42, converted: 28, convRate: 66.7, revenue: 18.4 },
  { name: "小华", leads: 38, converted: 23, convRate: 60.5, revenue: 15.2 },
  { name: "小丽", leads: 35, converted: 19, convRate: 54.3, revenue: 12.8 },
  { name: "小强", leads: 28, converted: 14, convRate: 50.0, revenue: 9.6 },
];

// ─── 患者分析 ────────────────────────────────────────────────────────────────
export interface PatientAnalysis {
  newPatients: number;
  returnPatients: number;
  returnRate: number;
  avgAge: number;
  genderMale: number;
  genderFemale: number;
  ageGroups: { label: string; count: number }[];
}

export const mockPatientAnalysis: PatientAnalysis = {
  newPatients: 186,
  returnPatients: 284,
  returnRate: 60.4,
  avgAge: 34,
  genderMale: 42,
  genderFemale: 58,
  ageGroups: [
    { label: "18-25", count: 68 },
    { label: "26-35", count: 142 },
    { label: "36-45", count: 118 },
    { label: "46-55", count: 86 },
    { label: "55+", count: 56 },
  ],
};

// ─── 患者来源 ────────────────────────────────────────────────────────────────
export interface PatientSource {
  channel: string;
  count: number;
  revenue: number;
  cost: number;
  roi: number;
}

export const mockPatientSources: PatientSource[] = [
  { channel: "老患者转介绍", count: 142, revenue: 28.6, cost: 0, roi: 0 },
  { channel: "抖音/短视频", count: 86, revenue: 18.4, cost: 4.2, roi: 338 },
  { channel: "美团/大众点评", count: 72, revenue: 14.8, cost: 3.6, roi: 311 },
  { channel: "微信公众号", count: 58, revenue: 10.2, cost: 1.8, roi: 467 },
  { channel: "自然搜索", count: 48, revenue: 8.6, cost: 0.8, roi: 975 },
  { channel: "其他", count: 64, revenue: 9.8, cost: 1.2, roi: 717 },
];

// ─── 运营效率 ────────────────────────────────────────────────────────────────
export interface OperationEfficiency {
  chairUsageRate: number; // %
  avgTreatmentTime: number; // 分钟
  noShowRate: number; // %
  rescheduledRate: number; // %
  chairCount: number;
  peakHourRevenue: number; // 万元
}

export const mockOperationEfficiency: OperationEfficiency = {
  chairUsageRate: 78.4,
  avgTreatmentTime: 42,
  noShowRate: 8.2,
  rescheduledRate: 12.6,
  chairCount: 8,
  peakHourRevenue: 2.8,
};

// ─── 收费方式 ────────────────────────────────────────────────────────────────
export interface PaymentMethod {
  method: string;
  amount: number;
  pct: number;
  color: string;
}

export const mockPaymentMethods: PaymentMethod[] = [
  { method: "微信支付", amount: 32.6, pct: 39.6, color: "#07C160" },
  { method: "支付宝", amount: 21.4, pct: 26.0, color: "#1677FF" },
  { method: "银行卡", amount: 14.8, pct: 18.0, color: "#1E88D6" },
  { method: "储值卡", amount: 8.6, pct: 10.4, color: "#FF9800" },
  { method: "医保", amount: 5.0, pct: 6.1, color: "#9C27B0" },
];

// ─── 欠费预警 ────────────────────────────────────────────────────────────────
export interface DebtRecord {
  patientName: string;
  amount: number;
  daysOverdue: number;
  lastContact: string;
  doctor: string;
}

export const mockDebtRecords: DebtRecord[] = [
  { patientName: "张**", amount: 8600, daysOverdue: 32, lastContact: "6/8", doctor: "张医生" },
  { patientName: "李**", amount: 6200, daysOverdue: 18, lastContact: "6/12", doctor: "李医生" },
  { patientName: "王**", amount: 4800, daysOverdue: 45, lastContact: "5/28", doctor: "王医生" },
  { patientName: "陈**", amount: 3600, daysOverdue: 12, lastContact: "6/15", doctor: "张医生" },
  { patientName: "刘**", amount: 2400, daysOverdue: 8, lastContact: "6/16", doctor: "李医生" },
];

// ─── 年度进度 ────────────────────────────────────────────────────────────────
export interface MonthlyRevenue {
  month: string;
  actual: number;
  target: number;
}

export const mockAnnualProgress: MonthlyRevenue[] = [
  { month: "1月", actual: 68.2, target: 75 },
  { month: "2月", actual: 54.6, target: 75 },
  { month: "3月", actual: 78.4, target: 80 },
  { month: "4月", actual: 82.1, target: 80 },
  { month: "5月", actual: 86.3, target: 85 },
  { month: "6月", actual: 82.4, target: 90 },
  { month: "7月", actual: 0, target: 90 },
  { month: "8月", actual: 0, target: 90 },
  { month: "9月", actual: 0, target: 95 },
  { month: "10月", actual: 0, target: 95 },
  { month: "11月", actual: 0, target: 100 },
  { month: "12月", actual: 0, target: 100 },
];

export const ANNUAL_TARGET = 1050; // 万元

// ─── 成本与利润 ──────────────────────────────────────────────────────────────
export interface CostProfit {
  revenue: number;
  materialCost: number;
  laborCost: number;
  rentCost: number;
  marketingCost: number;
  otherCost: number;
  grossProfit: number;
  grossMargin: number;
  netProfit: number;
  netMargin: number;
}

export const mockCostProfit: CostProfit = {
  revenue: 82.4,
  materialCost: 14.8,
  laborCost: 22.6,
  rentCost: 6.4,
  marketingCost: 5.2,
  otherCost: 3.8,
  grossProfit: 67.6,
  grossMargin: 82.0,
  netProfit: 29.6,
  netMargin: 35.9,
};

// ─── 库存与耗材 ──────────────────────────────────────────────────────────────
export interface InventoryItem {
  name: string;
  stock: number;
  unit: string;
  monthUsage: number;
  daysLeft: number;
  status: "normal" | "warning" | "critical";
}

export const mockInventory: InventoryItem[] = [
  { name: "种植体（士卓曼）", stock: 12, unit: "颗", monthUsage: 18, daysLeft: 20, status: "warning" },
  { name: "正畸托槽", stock: 240, unit: "套", monthUsage: 45, daysLeft: 160, status: "normal" },
  { name: "牙科麻药", stock: 8, unit: "支", monthUsage: 60, daysLeft: 4, status: "critical" },
  { name: "一次性手套", stock: 2400, unit: "双", monthUsage: 800, daysLeft: 90, status: "normal" },
  { name: "根管锉", stock: 15, unit: "盒", monthUsage: 12, daysLeft: 37, status: "normal" },
];

// ─── 预约漏斗 ────────────────────────────────────────────────────────────────
export interface FunnelStep {
  label: string;
  count: number;
  pct: number;
}

export const mockAppointmentFunnel: FunnelStep[] = [
  { label: "咨询量", count: 680, pct: 100 },
  { label: "预约量", count: 512, pct: 75.3 },
  { label: "到诊量", count: 470, pct: 69.1 },
  { label: "方案接受", count: 368, pct: 54.1 },
  { label: "成交量", count: 312, pct: 45.9 },
];

// ─── 会员与储值 ──────────────────────────────────────────────────────────────
export interface MemberData {
  totalMembers: number;
  activeMembers: number;
  totalDeposit: number; // 万元
  usedDeposit: number;
  newMembersThisMonth: number;
  avgDepositPerMember: number;
}

export const mockMemberData: MemberData = {
  totalMembers: 1248,
  activeMembers: 486,
  totalDeposit: 186.4,
  usedDeposit: 124.8,
  newMembersThisMonth: 38,
  avgDepositPerMember: 1494,
};

// ─── 时段效率 ────────────────────────────────────────────────────────────────
export interface TimeSlotData {
  hour: string;
  patients: number;
  revenue: number;
}

export const mockTimeSlots: TimeSlotData[] = [
  { hour: "8-9", patients: 12, revenue: 1.8 },
  { hour: "9-10", patients: 28, revenue: 4.6 },
  { hour: "10-11", patients: 42, revenue: 7.2 },
  { hour: "11-12", patients: 38, revenue: 6.4 },
  { hour: "12-13", patients: 18, revenue: 2.8 },
  { hour: "13-14", patients: 22, revenue: 3.4 },
  { hour: "14-15", patients: 36, revenue: 5.8 },
  { hour: "15-16", patients: 44, revenue: 7.6 },
  { hour: "16-17", patients: 40, revenue: 6.8 },
  { hour: "17-18", patients: 32, revenue: 5.2 },
  { hour: "18-19", patients: 20, revenue: 3.2 },
  { hour: "19-20", patients: 8, revenue: 1.2 },
];
