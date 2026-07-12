/**
 * YabanStaffDashboard.tsx
 * 牙伴齿科 · 人事驾驶舱
 *
 * 功能：
 *  - 概览 Tab：核心数据卡片、预警中心、门店人员结构表、AI智能追踪、离职风险预警
 *  - 人员档案 Tab：员工列表（支持搜索、分组/总览切换、门店视角过滤）
 *  - 底部「我的」Tab：跳转 YabanStaffMine 页面
 *
 * 接口：
 *  - trpc.yabanStaff.list
 *  - trpc.yabanStaff.dashboardStats
 *  - trpc.yabanStaff.warnings
 *
 * 路由：/yaban/staff
 */

import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import {
  Users, AlertTriangle, FileText, ShieldAlert,
  Search, ChevronRight, TrendingUp, TrendingDown,
  Activity, UserCheck, UserX, Clock, BarChart2,
  Building2, Brain, Loader2
} from "lucide-react";
import { useYabanClinic } from "./useYabanClinic";
import { trpc } from "@/lib/trpc";

// ─── 牙伴 UI 规范色值 ────────────────────────────────────────────────────────
const C = {
  brand: "#1E88D6",
  brandGrad: "linear-gradient(135deg,#1E88D6 0%,#3D9FD6 100%)",
  bg: "#F6F8FA",
  white: "#FFFFFF",
  line100: "#ECEFF3",
  line200: "#DBE1E8",
  textWeak: "#9AA7B5",
  textSub: "#647386",
  textMain: "#26303C",
  okBg: "#EAF2EC", okFg: "#3D7A53",
  warnBg: "#F5EEDD", warnFg: "#9A6E1F",
  dangerBg: "#F7E9E7", dangerFg: "#A8463C",
  infoBg: "#E9F1F8", infoFg: "#1B6FA8",
} as const;

// ─── 合同状态标签 ─────────────────────────────────────────────────────────────
function ContractBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; bg: string; fg: string }> = {
    active:    { label: "有效", bg: C.okBg, fg: C.okFg },
    expiring:  { label: "即将到期", bg: C.warnBg, fg: C.warnFg },
    expired:   { label: "已过期", bg: C.dangerBg, fg: C.dangerFg },
    unsigned:  { label: "未签约", bg: C.dangerBg, fg: C.dangerFg },
  };
  const s = map[status] ?? { label: status, bg: C.line100, fg: C.textSub };
  return (
    <span
      className="inline-flex items-center rounded-md px-2 py-[2px] text-[11px] font-bold"
      style={{ backgroundColor: s.bg, color: s.fg }}
    >
      {s.label}
    </span>
  );
}

// ─── 预警条目 ─────────────────────────────────────────────────────────────────
function WarningItem({
  icon: Icon, label, count, level, onClick
}: {
  icon: React.ElementType;
  label: string;
  count: number;
  level: "danger" | "warn" | "info";
  onClick?: () => void;
}) {
  const colors = {
    danger: { bg: C.dangerBg, fg: C.dangerFg },
    warn:   { bg: C.warnBg,   fg: C.warnFg },
    info:   { bg: C.infoBg,   fg: C.infoFg },
  }[level];

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 text-left transition-all duration-150 active:scale-[0.98]"
      style={{ borderBottom: `1px solid ${C.line100}` }}
    >
      <div
        className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: colors.bg }}
      >
        <Icon size={15} strokeWidth={1.5} style={{ color: colors.fg }} />
      </div>
      <span className="flex-1 text-[13px]" style={{ color: C.textMain }}>{label}</span>
      <span
        className="text-[12px] font-bold rounded-md px-2 py-[2px]"
        style={{ backgroundColor: colors.bg, color: colors.fg }}
      >
        {count} 人
      </span>
      <ChevronRight size={14} strokeWidth={1.5} style={{ color: C.textWeak }} />
    </button>
  );
}

// ─── 核心数据卡片 ─────────────────────────────────────────────────────────────
function StatCard({
  label, value, unit, icon: Icon, trend, trendLabel, color
}: {
  label: string; value: number; unit?: string;
  icon: React.ElementType; trend?: "up" | "down" | "flat";
  trendLabel?: string; color: string;
}) {
  return (
    <div
      className="flex-1 rounded p-3 flex flex-col gap-1"
      style={{ backgroundColor: C.white, boxShadow: `0 1px 3px rgba(20,40,60,.06)` }}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px]" style={{ color: C.textSub }}>{label}</span>
        <div
          className="w-6 h-6 rounded-md flex items-center justify-center"
          style={{ backgroundColor: color + "18" }}
        >
          <Icon size={13} strokeWidth={1.5} style={{ color }} />
        </div>
      </div>
      <div className="flex items-end gap-1">
        <span className="text-[22px] font-extrabold leading-none" style={{ color: C.textMain }}>{value}</span>
        {unit && <span className="text-[11px] mb-[2px]" style={{ color: C.textSub }}>{unit}</span>}
      </div>
      {trendLabel && (
        <div className="flex items-center gap-1">
          {trend === "up" && <TrendingUp size={11} strokeWidth={1.5} style={{ color: C.okFg }} />}
          {trend === "down" && <TrendingDown size={11} strokeWidth={1.5} style={{ color: C.dangerFg }} />}
          <span className="text-[10px]" style={{ color: C.textWeak }}>{trendLabel}</span>
        </div>
      )}
    </div>
  );
}

// ─── 门店人员结构表 ───────────────────────────────────────────────────────────
function ClinicStructureTable({ staff }: { staff: any[] }) {
  const clinics = Array.from(new Set(staff.map(s => s.clinic))).filter(Boolean);
  const roles = ["院长", "医生", "护士", "前台", "助理", "财务"];

  const matrix: Record<string, Record<string, number>> = {};
  clinics.forEach(c => {
    matrix[c] = {};
    roles.forEach(r => { matrix[c][r] = 0; });
  });
  staff.forEach(s => {
    if (matrix[s.clinic]) {
      const r = s.role;
      if (matrix[s.clinic][r] !== undefined) matrix[s.clinic][r]++;
      else matrix[s.clinic][r] = 1;
    }
  });

  if (clinics.length === 0) {
    return (
      <div className="py-6 text-center text-[12px]" style={{ color: C.textWeak }}>
        暂无数据
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px]" style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ backgroundColor: C.bg }}>
            <th className="text-left px-3 py-2 font-bold" style={{ color: C.textSub }}>门店</th>
            {roles.map(r => (
              <th key={r} className="text-center px-2 py-2 font-bold" style={{ color: C.textSub }}>{r}</th>
            ))}
            <th className="text-center px-2 py-2 font-bold" style={{ color: C.textSub }}>合计</th>
          </tr>
        </thead>
        <tbody>
          {clinics.map((clinic, idx) => {
            const total = roles.reduce((s, r) => s + (matrix[clinic][r] || 0), 0);
            return (
              <tr
                key={clinic}
                style={{ borderTop: `1px solid ${C.line100}`, backgroundColor: idx % 2 === 0 ? C.white : C.bg }}
              >
                <td className="px-3 py-2 font-bold text-[12px]" style={{ color: C.textMain }}>{clinic}</td>
                {roles.map(r => (
                  <td key={r} className="text-center px-2 py-2" style={{ color: matrix[clinic][r] > 0 ? C.textMain : C.textWeak }}>
                    {matrix[clinic][r] > 0 ? matrix[clinic][r] : "—"}
                  </td>
                ))}
                <td className="text-center px-2 py-2 font-bold" style={{ color: C.brand }}>{total}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── AI 智能追踪指标卡 ────────────────────────────────────────────────────────
const AI_LOGO_BASE = "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/ai-logos";

function AiIndicatorCard({
  title, value, unit, sub, badge, badgeBg, badgeFg
}: {
  title: string; value: string | number; unit?: string;
  sub?: string; badge?: string; badgeBg?: string; badgeFg?: string;
}) {
  return (
    <div
      className="flex-1 rounded p-3 flex flex-col gap-1 min-w-[calc(50%-6px)]"
      style={{ backgroundColor: C.white, boxShadow: `0 1px 3px rgba(20,40,60,.06)` }}
    >
      <div className="flex items-center gap-1 flex-wrap">
        <span className="text-[12px] font-bold" style={{ color: C.textMain }}>{title}</span>
        <img
          src={`${AI_LOGO_BASE}/deepseek.png`}
          alt="DeepSeek"
          className="w-4 h-4 rounded"
          style={{ objectFit: "contain" }}
        />
        {badge && (
          <span
            className="ml-auto inline-flex items-center rounded-md px-2 py-[1px] text-[10px] font-bold"
            style={{ backgroundColor: badgeBg, color: badgeFg }}
          >
            {badge}
          </span>
        )}
      </div>
      <div className="flex items-end gap-1">
        <span className="text-[18px] font-extrabold leading-none" style={{ color: C.textMain }}>{value}</span>
        {unit && <span className="text-[11px] mb-[1px]" style={{ color: C.textSub }}>{unit}</span>}
      </div>
      {sub && <span className="text-[11px]" style={{ color: C.textWeak }}>{sub}</span>}
    </div>
  );
}

// ─── 员工列表行 ───────────────────────────────────────────────────────────────
function StaffRow({ staff, onPress }: { staff: any; onPress: () => void }) {
  return (
    <button
      onClick={onPress}
      className="w-full flex items-center gap-3 px-4 py-3 text-left transition-all duration-150 active:scale-[0.98]"
      style={{ borderBottom: `1px solid ${C.line100}` }}
    >
      <div
        className="w-9 h-9 rounded-md flex items-center justify-center text-[14px] font-bold flex-shrink-0"
        style={{ background: C.brandGrad, color: "#fff" }}
      >
        {(staff.name || "?")[0]}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-bold" style={{ color: C.textMain }}>{staff.name}</span>
          <span
            className="inline-flex items-center rounded-md px-2 py-[1px] text-[11px] font-bold"
            style={{ backgroundColor: C.infoBg, color: C.infoFg }}
          >
            {staff.role}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[11px]" style={{ color: C.textSub }}>{staff.clinic}</span>
          {staff.joinDate && (
            <span className="text-[11px]" style={{ color: C.textWeak }}>
              · 入职 {staff.joinDate}
              {staff.yearsStr ? ` (${staff.yearsStr})` : ""}
            </span>
          )}
        </div>
      </div>
      <ContractBadge status={staff.contractStatus || "active"} />
    </button>
  );
}

// ─── 主组件 ───────────────────────────────────────────────────────────────────
export default function YabanStaffDashboard() {
  const [, navigate] = useLocation();
  const { currentTenantId } = useYabanClinic();

  const [mainTab, setMainTab] = useState<"overview" | "staff">("overview");
  const [selectedClinic, setSelectedClinic] = useState("全部");
  const [searchText, setSearchText] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "group">("list");

  // ── 真实接口调用 ──
  const clinicFilter = selectedClinic === "全部" ? undefined : selectedClinic;

  const staffQuery = trpc.yabanStaff.list.useQuery(
    { tenantId: currentTenantId ?? undefined, clinicFilter, search: searchText || undefined },
    { retry: false }
  );
  const statsQuery = trpc.yabanStaff.dashboardStats.useQuery(
    { tenantId: currentTenantId ?? undefined, clinicFilter },
    { retry: false }
  );
  const warningsQuery = trpc.yabanStaff.warnings.useQuery(
    { tenantId: currentTenantId ?? undefined, clinicFilter },
    { retry: false }
  );

  const staffList: any[] = staffQuery.data || [];
  const stats = statsQuery.data || { total: 0, contractWarn: 0, newThisMonth: 0, licenseWarn: 0, doctorCount: 0, nurseCount: 0, newbieCount: 0 };
  const warningList: any[] = warningsQuery.data || [];

  // 从员工列表中提取门店列表
  const clinics = useMemo(() => {
    const names = Array.from(new Set(staffList.map((s: any) => s.clinic).filter(Boolean)));
    return ["全部", ...names];
  }, [staffList]);

  // 过滤后的员工列表（搜索已在后端处理，这里只做前端门店过滤的补充）
  const filteredStaff = useMemo(() => {
    if (!searchText && selectedClinic === "全部") return staffList;
    return staffList.filter((s: any) => {
      const matchClinic = selectedClinic === "全部" || s.clinic === selectedClinic;
      const matchSearch = !searchText || s.name.includes(searchText) || s.role.includes(searchText);
      return matchClinic && matchSearch;
    });
  }, [staffList, selectedClinic, searchText]);

  // 按门店分组
  const groupedStaff = useMemo(() => {
    const groups: Record<string, any[]> = {};
    filteredStaff.forEach((s: any) => {
      if (!groups[s.clinic]) groups[s.clinic] = [];
      groups[s.clinic].push(s);
    });
    return groups;
  }, [filteredStaff]);

  // 预警分类统计
  const warningCounts = useMemo(() => {
    const contractExpired = warningList.filter((w: any) => w.type === "contract" && w.detail.includes("已于")).length;
    const contractExpiring = warningList.filter((w: any) => w.type === "contract" && w.detail.includes("将于")).length;
    const contractUnsigned = warningList.filter((w: any) => w.type === "contract" && w.detail.includes("未签")).length;
    const licenseWarn = warningList.filter((w: any) => w.type === "license").length;
    return { contractExpired, contractExpiring, contractUnsigned, licenseWarn };
  }, [warningList]);

  // AI 追踪指标（基于真实数据计算）
  const aiStats = useMemo(() => {
    const { total, contractWarn, doctorCount, nurseCount, newbieCount } = stats;
    return { total, contractRisk: contractWarn, doctors: doctorCount, nurses: nurseCount, newbies: newbieCount };
  }, [stats]);

  const isLoading = staffQuery.isLoading || statsQuery.isLoading;

  return (
    <div
      className="min-h-screen"
      style={{ maxWidth: 480, margin: "0 auto", backgroundColor: C.bg, fontFamily: "Nunito, -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif" }}
    >
      {/* ── 顶栏 ── */}
      <div style={{ background: C.brandGrad, paddingBottom: 0 }}>
        <div className="flex items-center justify-between px-4 pt-4 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <div className="text-[18px] font-extrabold text-white">人事驾驶舱</div>
              {isLoading && (
                <Loader2 size={14} strokeWidth={1.5} className="text-white/70 animate-spin" />
              )}
            </div>
            <div className="text-[11px] text-white/70 mt-0.5">员工档案与人事管理</div>
          </div>
          <div
            className="flex items-center gap-1 px-3 py-1.5 rounded-md text-[12px] font-bold"
            style={{ backgroundColor: "rgba(255,255,255,0.18)", color: "#fff" }}
          >
            <Building2 size={13} strokeWidth={1.5} />
            <span>{selectedClinic}</span>
          </div>
        </div>

        {/* 门店切换 */}
        <div className="flex gap-2 px-4 pb-3 overflow-x-auto scrollbar-none">
          {clinics.map(c => (
            <button
              key={c}
              onClick={() => setSelectedClinic(c)}
              className="flex-shrink-0 px-3 py-1 rounded-md text-[12px] font-bold transition-all duration-150"
              style={{
                backgroundColor: selectedClinic === c ? "#fff" : "rgba(255,255,255,0.18)",
                color: selectedClinic === c ? C.brand : "#fff",
              }}
            >
              {c}
            </button>
          ))}
        </div>

        {/* 主 Tab 导航 */}
        <div className="flex px-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.15)" }}>
          {([["overview", "概览"], ["staff", "人员档案"]] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setMainTab(key)}
              className="px-4 py-2.5 text-[13px] font-bold transition-all duration-150"
              style={{
                color: mainTab === key ? "#fff" : "rgba(255,255,255,0.6)",
                borderBottom: mainTab === key ? "2px solid #fff" : "2px solid transparent",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── 概览 Tab ── */}
      {mainTab === "overview" && (
        <div className="px-4 py-4 flex flex-col gap-4">
          {/* 核心数据卡片 */}
          <div className="flex gap-3">
            <StatCard label="在职人员" value={stats.total} unit="人" icon={Users} color={C.brand} trend="flat" trendLabel="当前在职" />
            <StatCard label="合同预警" value={stats.contractWarn} unit="人" icon={AlertTriangle} color={C.dangerFg} trend={stats.contractWarn > 0 ? "up" : "flat"} trendLabel="需处理" />
          </div>
          <div className="flex gap-3">
            <StatCard label="本月新入" value={stats.newThisMonth} unit="人" icon={UserCheck} color={C.okFg} trend="flat" trendLabel="本月入职" />
            <StatCard label="证照预警" value={stats.licenseWarn} unit="人" icon={ShieldAlert} color={C.warnFg} trend="flat" trendLabel="30天内到期" />
          </div>

          {/* 预警中心 */}
          <div className="rounded overflow-hidden" style={{ backgroundColor: C.white, boxShadow: `0 1px 3px rgba(20,40,60,.06)` }}>
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${C.line100}` }}>
              <span className="text-[15px] font-extrabold" style={{ color: C.textMain }}>预警中心</span>
              <span className="text-[11px]" style={{ color: C.textWeak }}>点击跳转处理</span>
            </div>
            {warningCounts.contractExpired > 0 && (
              <WarningItem icon={FileText} label="合同已过期" count={warningCounts.contractExpired} level="danger" onClick={() => setMainTab("staff")} />
            )}
            {warningCounts.contractExpiring > 0 && (
              <WarningItem icon={Clock} label="合同30天内到期" count={warningCounts.contractExpiring} level="warn" onClick={() => setMainTab("staff")} />
            )}
            {warningCounts.contractUnsigned > 0 && (
              <WarningItem icon={UserX} label="未签劳动合同" count={warningCounts.contractUnsigned} level="danger" onClick={() => setMainTab("staff")} />
            )}
            {warningCounts.licenseWarn > 0 && (
              <WarningItem icon={ShieldAlert} label="证照即将到期" count={warningCounts.licenseWarn} level="warn" onClick={() => setMainTab("staff")} />
            )}
            {warningList.length === 0 && !warningsQuery.isLoading && (
              <div className="px-4 py-6 text-center text-[13px]" style={{ color: C.textWeak }}>
                暂无预警，一切正常
              </div>
            )}
          </div>

          {/* 门店人员结构 + AI 智能追踪 */}
          <div className="rounded overflow-hidden" style={{ backgroundColor: C.white, boxShadow: `0 1px 3px rgba(20,40,60,.06)` }}>
            <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: `1px solid ${C.line100}` }}>
              <BarChart2 size={16} strokeWidth={1.5} style={{ color: C.brand }} />
              <span className="text-[15px] font-extrabold" style={{ color: C.textMain }}>门店人员结构</span>
            </div>
            <div className="px-2 py-2">
              <ClinicStructureTable staff={filteredStaff} />
            </div>

            {/* AI 智能追踪分隔 */}
            <div
              className="flex items-center gap-2 px-4 py-2.5"
              style={{ borderTop: `1px solid ${C.line100}`, borderBottom: `1px solid ${C.line100}` }}
            >
              <Brain size={14} strokeWidth={1.5} style={{ color: C.brand }} />
              <span className="text-[12px] font-bold" style={{ color: C.textSub }}>AI 智能追踪 · 基于以上数据综合计算</span>
            </div>
            <div className="flex flex-wrap gap-3 p-3">
              <AiIndicatorCard
                title="合同风险"
                value={aiStats.contractRisk}
                unit="人"
                sub="未签/过期/即将到期"
                badge={aiStats.contractRisk > 2 ? "高风险" : "正常"}
                badgeBg={aiStats.contractRisk > 2 ? C.dangerBg : C.okBg}
                badgeFg={aiStats.contractRisk > 2 ? C.dangerFg : C.okFg}
              />
              <AiIndicatorCard
                title="医护配比"
                value={`${aiStats.doctors}:${aiStats.nurses}`}
                sub={`医生 ${aiStats.doctors} · 护士 ${aiStats.nurses}`}
                badge={aiStats.nurses > 0 && aiStats.doctors / aiStats.nurses < 0.8 ? "偏低" : "合理"}
                badgeBg={aiStats.nurses > 0 && aiStats.doctors / aiStats.nurses < 0.8 ? C.warnBg : C.okBg}
                badgeFg={aiStats.nurses > 0 && aiStats.doctors / aiStats.nurses < 0.8 ? C.warnFg : C.okFg}
              />
              <AiIndicatorCard
                title="团队稳定性"
                value={aiStats.total > 0 ? Math.round(((aiStats.total - aiStats.contractRisk) / aiStats.total) * 100) : 0}
                unit="%"
                sub={`共 ${aiStats.total} 人在职`}
                badge={aiStats.total > 0 && ((aiStats.total - aiStats.contractRisk) / aiStats.total) > 0.8 ? "稳定" : "待关注"}
                badgeBg={aiStats.total > 0 && ((aiStats.total - aiStats.contractRisk) / aiStats.total) > 0.8 ? C.okBg : C.warnBg}
                badgeFg={aiStats.total > 0 && ((aiStats.total - aiStats.contractRisk) / aiStats.total) > 0.8 ? C.okFg : C.warnFg}
              />
              <AiIndicatorCard
                title="新人占比"
                value={aiStats.total > 0 ? Math.round((aiStats.newbies / aiStats.total) * 100) : 0}
                unit="%"
                sub={`在职 3 个月内 ${aiStats.newbies} 人`}
                badge={aiStats.newbies > 2 ? "偏高" : "正常"}
                badgeBg={aiStats.newbies > 2 ? C.warnBg : C.okBg}
                badgeFg={aiStats.newbies > 2 ? C.warnFg : C.okFg}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── 人员档案 Tab ── */}
      {mainTab === "staff" && (
        <div className="flex flex-col">
          {/* 搜索栏 */}
          <div className="px-4 py-3 flex items-center gap-2" style={{ backgroundColor: C.white, borderBottom: `1px solid ${C.line100}` }}>
            <div
              className="flex-1 flex items-center gap-2 px-3 h-9 rounded-[10px]"
              style={{ backgroundColor: C.bg, border: `1px solid ${C.line200}` }}
            >
              <Search size={14} strokeWidth={1.5} style={{ color: C.textWeak }} />
              <input
                type="text"
                placeholder="搜索姓名或职位"
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                className="flex-1 bg-transparent text-[13px] outline-none"
                style={{ color: C.textMain }}
              />
            </div>
            <button
              onClick={() => setViewMode(v => v === "list" ? "group" : "list")}
              className="px-3 h-9 rounded-[10px] text-[12px] font-bold transition-all duration-150"
              style={{ backgroundColor: C.infoBg, color: C.infoFg }}
            >
              {viewMode === "list" ? "分组" : "列表"}
            </button>
          </div>

          {/* 员工列表 */}
          <div style={{ backgroundColor: C.white }}>
            {staffQuery.isLoading ? (
              <div className="py-12 flex justify-center">
                <Loader2 size={24} strokeWidth={1.5} style={{ color: C.textWeak }} className="animate-spin" />
              </div>
            ) : viewMode === "list" ? (
              filteredStaff.length > 0
                ? filteredStaff.map((s: any) => (
                    <StaffRow
                      key={s.id}
                      staff={s}
                      onPress={() => navigate(`/yaban/staff/${s.id}`)}
                    />
                  ))
                : (
                  <div className="py-12 text-center" style={{ color: C.textWeak }}>
                    <Users size={32} strokeWidth={1} className="mx-auto mb-2 opacity-40" />
                    <div className="text-[13px]">
                      {staffQuery.error ? "加载失败，请检查权限" : "暂无员工数据"}
                    </div>
                  </div>
                )
            ) : (
              Object.entries(groupedStaff).map(([clinic, members]) => (
                <div key={clinic}>
                  <div
                    className="px-4 py-2 text-[12px] font-bold flex items-center gap-2"
                    style={{ backgroundColor: C.bg, color: C.textSub }}
                  >
                    <Building2 size={13} strokeWidth={1.5} />
                    {clinic}
                    <span
                      className="ml-auto inline-flex items-center rounded-md px-2 py-[1px] text-[10px] font-bold"
                      style={{ backgroundColor: C.infoBg, color: C.infoFg }}
                    >
                      {members.length} 人
                    </span>
                  </div>
                  {members.map((s: any) => (
                    <StaffRow
                      key={s.id}
                      staff={s}
                      onPress={() => navigate(`/yaban/staff/${s.id}`)}
                    />
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ── 底部导航 ── */}
      <div
        className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full flex"
        style={{ maxWidth: 480, backgroundColor: C.white, borderTop: `1px solid ${C.line100}` }}
      >
        {([
          ["overview", "概览", BarChart2],
          ["staff", "人员档案", Users],
          ["mine", "我的", UserCheck],
        ] as const).map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => {
              if (key === "mine") {
                navigate("/yaban/staff/mine");
              } else {
                setMainTab(key);
              }
            }}
            className="flex-1 flex flex-col items-center py-2 gap-0.5 transition-all duration-150"
          >
            <Icon
              size={20}
              strokeWidth={1.5}
              style={{ color: mainTab === key ? C.brand : C.textWeak }}
            />
            <span
              className="text-[10px] font-bold"
              style={{ color: mainTab === key ? C.brand : C.textWeak }}
            >
              {label}
            </span>
          </button>
        ))}
      </div>

      {/* 底部导航占位 */}
      <div className="h-16" />
    </div>
  );
}
