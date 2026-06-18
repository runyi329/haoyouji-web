/**
 * YabanStaffDetail.tsx
 * 牙伴齿科 · 员工档案详情
 *
 * 功能（6个Tab）：
 *  - 基本信息：个人信息、在职信息、证照资质
 *  - 合同记录：合同列表、在线签约入口
 *  - 工作记录：工作履历、奖惩记录、培训成长
 *  - 员工画像：AI评分、绩效考核
 *  - 薪酬福利：薪酬信息、调薪历史
 *  - 人事流程：入职办理、转正评估、离职管理
 *
 * 路由：/yaban/staff/:id
 *
 * 接口依赖（需主沙箱补充，见文件末尾 TODO）：
 *  - trpc.yabanStaff.detail
 *  - trpc.yabanStaff.contracts
 *  - trpc.yabanStaff.workLogs
 *  - trpc.yabanStaff.portrait
 *  - trpc.yabanStaff.salary
 *  - trpc.yabanStaff.hrFlow
 */

import { useState } from "react";
import { useLocation, useParams } from "wouter";
import {
  ChevronLeft, MoreHorizontal, User, FileText, Briefcase,
  Star, DollarSign, GitBranch, Shield, Award, BookOpen,
  TrendingUp, AlertCircle, CheckCircle, Clock, Plus,
  ChevronRight, Edit3, Upload
} from "lucide-react";

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

// ─── Mock 员工数据 ─────────────────────────────────────────────────────────────
// TODO: 替换为 trpc.yabanStaff.detail.useQuery({ id, tenantId })
const MOCK_DETAIL = {
  id: 1,
  name: "洪紫钥",
  role: "院长",
  clinic: "恒愿口腔",
  joinDate: "2019-03-15",
  yearsStr: "7年",
  contractStatus: "expired",
  gender: "女",
  edu: "本科",
  phone: "138****0001",
  idCard: "310***********0012",
  address: "上海市浦东新区",
  emergency: "洪某某 · 138****9999",
  contracts: [
    { id: 1, type: "劳动合同", signDate: "2019-03-15", expireDate: "2025-03-14", status: "expired" },
    { id: 2, type: "保密协议", signDate: "2019-03-15", expireDate: "长期有效", status: "active" },
  ],
  licenses: [
    { name: "执业医师证", no: "1101***", issueDate: "2015-06-01", expireDate: "长期有效", status: "active" },
    { name: "口腔医师资格证", no: "2201***", issueDate: "2016-09-01", expireDate: "2026-09-01", status: "expiring" },
  ],
  workLogs: [
    { date: "2023-01-01", type: "晋升", content: "晋升为院长", clinic: "恒愿口腔" },
    { date: "2021-06-01", type: "调岗", content: "由主治医生调任副院长", clinic: "恒愿口腔" },
    { date: "2019-03-15", type: "入职", content: "入职恒愿口腔", clinic: "恒愿口腔" },
  ],
  rewards: [
    { date: "2024-12-01", type: "表彰", content: "年度优秀员工", result: "奖励" },
    { date: "2023-06-01", type: "嘉奖", content: "季度业绩第一", result: "奖励" },
  ],
  trainings: [
    { date: "2024-09-01", name: "正畸专项培训", type: "外部进修", hours: 16, cert: true },
    { date: "2024-03-01", name: "医院感染控制培训", type: "内部培训", hours: 4, cert: false },
    { date: "2023-11-01", name: "口腔种植学术交流会", type: "学术交流", hours: 8, cert: true },
  ],
  portrait: {
    aiScore: 88,
    dimensions: [
      { name: "专业能力", score: 92 },
      { name: "团队协作", score: 85 },
      { name: "患者满意度", score: 90 },
      { name: "出勤稳定性", score: 78 },
    ],
    assessments: [
      { period: "2024-Q4", score: 88, level: "优秀", comment: "业绩突出，团队管理能力强" },
      { period: "2024-Q3", score: 85, level: "优秀", comment: "患者满意度持续提升" },
      { period: "2024-Q2", score: 82, level: "良好", comment: "专业技能扎实，需加强行政管理" },
    ],
  },
  salary: {
    current: 18000,
    base: 12000,
    performance: 4000,
    allowance: 2000,
    history: [
      { date: "2024-01-01", before: 16000, after: 18000, delta: "+12.5%", reason: "年度调薪" },
      { date: "2023-01-01", before: 14000, after: 16000, delta: "+14.3%", reason: "晋升调薪" },
      { date: "2021-06-01", before: 12000, after: 14000, delta: "+16.7%", reason: "调岗调薪" },
    ],
    leave: { annual: 15, annualUsed: 8, sick: 10, sickUsed: 2, adjust: 3, adjustUsed: 1 },
  },
  hrFlow: {
    onboarding: [
      { item: "身份证复印件", done: true },
      { item: "学历证书", done: true },
      { item: "执业资格证", done: true },
      { item: "体检报告", done: true },
      { item: "银行卡信息", done: true },
    ],
    probation: {
      startDate: "2019-03-15",
      endDate: "2019-06-14",
      result: "转正",
      score: 92,
      comment: "试用期表现优秀，提前转正",
    },
    offboarding: null,
  },
};

// ─── 通用组件 ─────────────────────────────────────────────────────────────────
function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start py-2.5" style={{ borderBottom: `1px solid ${C.line100}` }}>
      <span className="w-24 flex-shrink-0 text-[12px]" style={{ color: C.textSub }}>{label}</span>
      <span className="flex-1 text-[13px] font-bold" style={{ color: C.textMain }}>{value}</span>
    </div>
  );
}

function SectionCard({ title, icon: Icon, children, rightSlot }: {
  title: string; icon?: React.ElementType; children: React.ReactNode; rightSlot?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: C.white, boxShadow: `0 1px 3px rgba(20,40,60,.06)` }}>
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${C.line100}` }}>
        <div className="flex items-center gap-2">
          {Icon && <Icon size={15} strokeWidth={1.5} style={{ color: C.brand }} />}
          <span className="text-[15px] font-extrabold" style={{ color: C.textMain }}>{title}</span>
        </div>
        {rightSlot}
      </div>
      <div className="px-4">{children}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; bg: string; fg: string }> = {
    active:    { label: "有效", bg: C.okBg, fg: C.okFg },
    expiring:  { label: "即将到期", bg: C.warnBg, fg: C.warnFg },
    expired:   { label: "已过期", bg: C.dangerBg, fg: C.dangerFg },
    unsigned:  { label: "未签约", bg: C.dangerBg, fg: C.dangerFg },
    pending:   { label: "待签署", bg: C.warnBg, fg: C.warnFg },
    signed:    { label: "已签署", bg: C.okBg, fg: C.okFg },
    rejected:  { label: "已拒签", bg: C.dangerBg, fg: C.dangerFg },
  };
  const s = map[status] ?? { label: status, bg: C.line100, fg: C.textSub };
  return (
    <span className="inline-flex items-center rounded-full px-2 py-[2px] text-[11px] font-bold" style={{ backgroundColor: s.bg, color: s.fg }}>
      {s.label}
    </span>
  );
}

// ─── Tab 内容：基本信息 ───────────────────────────────────────────────────────
function TabBasic({ data }: { data: typeof MOCK_DETAIL }) {
  return (
    <div className="flex flex-col gap-3 py-3">
      <SectionCard title="个人信息" icon={User}>
        <InfoRow label="姓名" value={data.name} />
        <InfoRow label="性别" value={data.gender} />
        <InfoRow label="学历" value={data.edu} />
        <InfoRow label="联系电话" value={data.phone} />
        <InfoRow label="身份证号" value={data.idCard} />
        <InfoRow label="居住地址" value={data.address} />
        <InfoRow label="紧急联系" value={data.emergency} />
      </SectionCard>

      <SectionCard title="在职信息" icon={Briefcase}>
        <InfoRow label="所属门店" value={data.clinic} />
        <InfoRow label="职位" value={data.role} />
        <InfoRow label="入职日期" value={data.joinDate} />
        <InfoRow label="在职年限" value={data.yearsStr} />
        <InfoRow label="合同状态" value={data.contractStatus === "expired" ? "已过期" : "有效"} />
      </SectionCard>

      <SectionCard title="证照资质" icon={Shield}
        rightSlot={
          <button className="flex items-center gap-1 px-3 py-1 rounded-full text-[12px] font-bold" style={{ backgroundColor: C.infoBg, color: C.infoFg }}>
            <Plus size={12} strokeWidth={2} /> 上传
          </button>
        }
      >
        {data.licenses.map((lic, i) => (
          <div key={i} className="py-2.5 flex items-center justify-between" style={{ borderBottom: i < data.licenses.length - 1 ? `1px solid ${C.line100}` : "none" }}>
            <div>
              <div className="text-[13px] font-bold" style={{ color: C.textMain }}>{lic.name}</div>
              <div className="text-[11px] mt-0.5" style={{ color: C.textSub }}>证号：{lic.no} · 到期：{lic.expireDate}</div>
            </div>
            <StatusBadge status={lic.status} />
          </div>
        ))}
      </SectionCard>
    </div>
  );
}

// ─── Tab 内容：合同记录 ───────────────────────────────────────────────────────
function TabContract({ data, onInitiateSign }: { data: typeof MOCK_DETAIL; onInitiateSign: () => void }) {
  return (
    <div className="flex flex-col gap-3 py-3">
      {/* 在线签约入口 */}
      <div
        className="rounded-2xl p-4 flex items-center justify-between"
        style={{ background: C.brandGrad }}
      >
        <div>
          <div className="text-[13px] font-extrabold text-white">在线签约</div>
          <div className="text-[11px] text-white/70 mt-0.5">发起合同签署，员工手机端确认</div>
        </div>
        <button
          onClick={onInitiateSign}
          className="px-4 py-2 rounded-full text-[12px] font-bold transition-all duration-150 active:scale-[0.97]"
          style={{ backgroundColor: "#fff", color: C.brand, boxShadow: `0 4px 14px rgba(30,136,214,.32)` }}
        >
          发起签约
        </button>
      </div>

      <SectionCard title="合同记录" icon={FileText}>
        {data.contracts.map((c, i) => (
          <div key={c.id} className="py-3" style={{ borderBottom: i < data.contracts.length - 1 ? `1px solid ${C.line100}` : "none" }}>
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-bold" style={{ color: C.textMain }}>{c.type}</span>
              <StatusBadge status={c.status} />
            </div>
            <div className="mt-1.5 flex gap-4">
              <div>
                <div className="text-[10px]" style={{ color: C.textWeak }}>签约日期</div>
                <div className="text-[12px] font-bold" style={{ color: C.textMain }}>{c.signDate}</div>
              </div>
              <div>
                <div className="text-[10px]" style={{ color: C.textWeak }}>到期日期</div>
                <div className="text-[12px] font-bold" style={{ color: C.textMain }}>{c.expireDate}</div>
              </div>
            </div>
          </div>
        ))}
      </SectionCard>

      <SectionCard title="合同影像" icon={Upload}
        rightSlot={
          <button className="flex items-center gap-1 px-3 py-1 rounded-full text-[12px] font-bold" style={{ backgroundColor: C.infoBg, color: C.infoFg }}>
            <Plus size={12} strokeWidth={2} /> 上传
          </button>
        }
      >
        <div className="py-8 flex flex-col items-center gap-2">
          <FileText size={32} strokeWidth={1} style={{ color: C.textWeak, opacity: 0.4 }} />
          <div className="text-[12px]" style={{ color: C.textWeak }}>暂无合同影像，点击右上角上传</div>
        </div>
      </SectionCard>
    </div>
  );
}

// ─── Tab 内容：工作记录 ───────────────────────────────────────────────────────
function TabWorkLog({ data }: { data: typeof MOCK_DETAIL }) {
  const typeColor: Record<string, { bg: string; fg: string }> = {
    入职: { bg: C.okBg, fg: C.okFg },
    晋升: { bg: C.infoBg, fg: C.infoFg },
    调岗: { bg: C.warnBg, fg: C.warnFg },
    离职: { bg: C.dangerBg, fg: C.dangerFg },
  };

  return (
    <div className="flex flex-col gap-3 py-3">
      <SectionCard title="工作履历" icon={Briefcase}>
        {data.workLogs.map((log, i) => (
          <div key={i} className="flex gap-3 py-3" style={{ borderBottom: i < data.workLogs.length - 1 ? `1px solid ${C.line100}` : "none" }}>
            <div className="flex flex-col items-center gap-1 flex-shrink-0">
              <div
                className="w-2 h-2 rounded-full mt-1"
                style={{ backgroundColor: typeColor[log.type]?.fg ?? C.brand }}
              />
              {i < data.workLogs.length - 1 && <div className="flex-1 w-px" style={{ backgroundColor: C.line100 }} />}
            </div>
            <div className="flex-1 pb-1">
              <div className="flex items-center gap-2">
                <span
                  className="inline-flex items-center rounded-full px-2 py-[1px] text-[11px] font-bold"
                  style={{ backgroundColor: typeColor[log.type]?.bg ?? C.infoBg, color: typeColor[log.type]?.fg ?? C.infoFg }}
                >
                  {log.type}
                </span>
                <span className="text-[11px]" style={{ color: C.textWeak }}>{log.date}</span>
              </div>
              <div className="mt-1 text-[13px]" style={{ color: C.textMain }}>{log.content}</div>
              <div className="mt-0.5 text-[11px]" style={{ color: C.textSub }}>{log.clinic}</div>
            </div>
          </div>
        ))}
      </SectionCard>

      <SectionCard title="奖惩记录" icon={Award}
        rightSlot={
          <button className="flex items-center gap-1 px-3 py-1 rounded-full text-[12px] font-bold" style={{ backgroundColor: C.infoBg, color: C.infoFg }}>
            <Plus size={12} strokeWidth={2} /> 新增
          </button>
        }
      >
        {data.rewards.map((r, i) => (
          <div key={i} className="py-2.5 flex items-center justify-between" style={{ borderBottom: i < data.rewards.length - 1 ? `1px solid ${C.line100}` : "none" }}>
            <div>
              <div className="text-[13px] font-bold" style={{ color: C.textMain }}>{r.content}</div>
              <div className="text-[11px] mt-0.5" style={{ color: C.textSub }}>{r.date}</div>
            </div>
            <span
              className="inline-flex items-center rounded-full px-2 py-[2px] text-[11px] font-bold"
              style={{ backgroundColor: C.okBg, color: C.okFg }}
            >
              {r.type}
            </span>
          </div>
        ))}
      </SectionCard>

      <SectionCard title="培训成长" icon={BookOpen}
        rightSlot={
          <button className="flex items-center gap-1 px-3 py-1 rounded-full text-[12px] font-bold" style={{ backgroundColor: C.infoBg, color: C.infoFg }}>
            <Plus size={12} strokeWidth={2} /> 新增
          </button>
        }
      >
        <div className="py-2 flex items-center gap-3" style={{ borderBottom: `1px solid ${C.line100}` }}>
          <div className="text-[12px]" style={{ color: C.textSub }}>累计培训学时</div>
          <span className="text-[18px] font-extrabold" style={{ color: C.brand }}>
            {data.trainings.reduce((s, t) => s + t.hours, 0)}
          </span>
          <span className="text-[12px]" style={{ color: C.textSub }}>小时</span>
        </div>
        {data.trainings.map((t, i) => (
          <div key={i} className="py-2.5" style={{ borderBottom: i < data.trainings.length - 1 ? `1px solid ${C.line100}` : "none" }}>
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-bold" style={{ color: C.textMain }}>{t.name}</span>
              {t.cert && (
                <span className="inline-flex items-center rounded-full px-2 py-[1px] text-[10px] font-bold" style={{ backgroundColor: C.okBg, color: C.okFg }}>
                  有证书
                </span>
              )}
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-[11px]" style={{ color: C.textSub }}>
              <span>{t.date}</span>
              <span>·</span>
              <span>{t.type}</span>
              <span>·</span>
              <span>{t.hours}学时</span>
            </div>
          </div>
        ))}
      </SectionCard>
    </div>
  );
}

// ─── Tab 内容：员工画像 ───────────────────────────────────────────────────────
function TabPortrait({ data }: { data: typeof MOCK_DETAIL }) {
  const AI_LOGO_BASE = "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/ai-logos";

  return (
    <div className="flex flex-col gap-3 py-3">
      <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: C.white, boxShadow: `0 1px 3px rgba(20,40,60,.06)` }}>
        <div className="p-4 flex items-center gap-4" style={{ borderBottom: `1px solid ${C.line100}` }}>
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center text-[28px] font-extrabold flex-shrink-0"
            style={{ background: C.brandGrad, color: "#fff" }}
          >
            {data.portrait.aiScore}
          </div>
          <div>
            <div className="flex items-center gap-1">
              <span className="text-[15px] font-extrabold" style={{ color: C.textMain }}>综合评分</span>
              <img src={`${AI_LOGO_BASE}/deepseek.png`} alt="AI" className="w-4 h-4 rounded" style={{ objectFit: "contain" }} />
            </div>
            <div className="text-[12px] mt-0.5" style={{ color: C.textSub }}>AI 综合评估 · 基于多维度数据</div>
            <span className="inline-flex items-center rounded-full px-2 py-[1px] text-[11px] font-bold mt-1" style={{ backgroundColor: C.okBg, color: C.okFg }}>
              优秀
            </span>
          </div>
        </div>
        <div className="px-4 py-3 flex flex-col gap-2">
          {data.portrait.dimensions.map((d, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="w-20 text-[12px] flex-shrink-0" style={{ color: C.textSub }}>{d.name}</span>
              <div className="flex-1 h-1.5 rounded-full" style={{ backgroundColor: C.line100 }}>
                <div
                  className="h-1.5 rounded-full transition-all duration-500"
                  style={{ width: `${d.score}%`, background: C.brandGrad }}
                />
              </div>
              <span className="text-[12px] font-bold w-8 text-right" style={{ color: C.textMain }}>{d.score}</span>
            </div>
          ))}
        </div>
      </div>

      <SectionCard title="绩效考核" icon={Star}
        rightSlot={
          <button className="flex items-center gap-1 px-3 py-1 rounded-full text-[12px] font-bold" style={{ backgroundColor: C.infoBg, color: C.infoFg }}>
            <Plus size={12} strokeWidth={2} /> 新增
          </button>
        }
      >
        {data.portrait.assessments.map((a, i) => (
          <div key={i} className="py-3" style={{ borderBottom: i < data.portrait.assessments.length - 1 ? `1px solid ${C.line100}` : "none" }}>
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-bold" style={{ color: C.textMain }}>{a.period}</span>
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-extrabold" style={{ color: C.brand }}>{a.score}</span>
                <span className="inline-flex items-center rounded-full px-2 py-[1px] text-[11px] font-bold" style={{ backgroundColor: C.okBg, color: C.okFg }}>
                  {a.level}
                </span>
              </div>
            </div>
            <div className="mt-1 text-[12px]" style={{ color: C.textSub }}>{a.comment}</div>
          </div>
        ))}
      </SectionCard>
    </div>
  );
}

// ─── Tab 内容：薪酬福利 ───────────────────────────────────────────────────────
function TabSalary({ data }: { data: typeof MOCK_DETAIL }) {
  const { salary } = data;
  return (
    <div className="flex flex-col gap-3 py-3">
      <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: C.white, boxShadow: `0 1px 3px rgba(20,40,60,.06)` }}>
        <div className="px-4 py-3" style={{ borderBottom: `1px solid ${C.line100}` }}>
          <div className="text-[11px]" style={{ color: C.textSub }}>当前月薪</div>
          <div className="flex items-end gap-1 mt-1">
            <span className="text-[22px] font-extrabold" style={{ color: C.textMain }}>¥{salary.current.toLocaleString()}</span>
          </div>
        </div>
        <div className="px-4 py-3 flex gap-4">
          {[
            { label: "基本工资", value: salary.base },
            { label: "绩效工资", value: salary.performance },
            { label: "岗位津贴", value: salary.allowance },
          ].map(item => (
            <div key={item.label} className="flex-1">
              <div className="text-[10px]" style={{ color: C.textWeak }}>{item.label}</div>
              <div className="text-[13px] font-bold mt-0.5" style={{ color: C.textMain }}>¥{item.value.toLocaleString()}</div>
            </div>
          ))}
        </div>
      </div>

      <SectionCard title="假期余额" icon={Clock}>
        {[
          { label: "年假", total: salary.leave.annual, used: salary.leave.annualUsed },
          { label: "病假", total: salary.leave.sick, used: salary.leave.sickUsed },
          { label: "调休", total: salary.leave.adjust, used: salary.leave.adjustUsed },
        ].map((l, i) => (
          <div key={i} className="py-2.5 flex items-center gap-3" style={{ borderBottom: i < 2 ? `1px solid ${C.line100}` : "none" }}>
            <span className="w-12 text-[12px]" style={{ color: C.textSub }}>{l.label}</span>
            <div className="flex-1 h-1.5 rounded-full" style={{ backgroundColor: C.line100 }}>
              <div className="h-1.5 rounded-full" style={{ width: `${(l.used / l.total) * 100}%`, backgroundColor: C.brand }} />
            </div>
            <span className="text-[12px] font-bold" style={{ color: C.textMain }}>
              剩余 {l.total - l.used}/{l.total} 天
            </span>
          </div>
        ))}
      </SectionCard>

      <SectionCard title="调薪历史" icon={TrendingUp}>
        {salary.history.map((h, i) => (
          <div key={i} className="py-3" style={{ borderBottom: i < salary.history.length - 1 ? `1px solid ${C.line100}` : "none" }}>
            <div className="flex items-center justify-between">
              <span className="text-[12px]" style={{ color: C.textSub }}>{h.date}</span>
              <span className="text-[13px] font-extrabold" style={{ color: C.okFg }}>{h.delta}</span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-[13px]" style={{ color: C.textSub }}>¥{h.before.toLocaleString()}</span>
              <ChevronRight size={12} strokeWidth={1.5} style={{ color: C.textWeak }} />
              <span className="text-[13px] font-bold" style={{ color: C.textMain }}>¥{h.after.toLocaleString()}</span>
              <span className="ml-auto text-[11px]" style={{ color: C.textSub }}>{h.reason}</span>
            </div>
          </div>
        ))}
      </SectionCard>
    </div>
  );
}

// ─── Tab 内容：人事流程 ───────────────────────────────────────────────────────
function TabHRFlow({ data }: { data: typeof MOCK_DETAIL }) {
  const { hrFlow } = data;
  const doneCount = hrFlow.onboarding.filter(o => o.done).length;

  return (
    <div className="flex flex-col gap-3 py-3">
      <SectionCard title="入职办理" icon={CheckCircle}>
        <div className="py-2.5 flex items-center gap-3" style={{ borderBottom: `1px solid ${C.line100}` }}>
          <div className="flex-1 h-2 rounded-full" style={{ backgroundColor: C.line100 }}>
            <div
              className="h-2 rounded-full transition-all duration-500"
              style={{ width: `${(doneCount / hrFlow.onboarding.length) * 100}%`, background: C.brandGrad }}
            />
          </div>
          <span className="text-[12px] font-bold" style={{ color: C.brand }}>{doneCount}/{hrFlow.onboarding.length}</span>
        </div>
        {hrFlow.onboarding.map((item, i) => (
          <div key={i} className="py-2.5 flex items-center gap-3" style={{ borderBottom: i < hrFlow.onboarding.length - 1 ? `1px solid ${C.line100}` : "none" }}>
            <div
              className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: item.done ? C.okBg : C.line100 }}
            >
              {item.done
                ? <CheckCircle size={12} strokeWidth={2} style={{ color: C.okFg }} />
                : <div className="w-2 h-2 rounded-full" style={{ backgroundColor: C.textWeak }} />
              }
            </div>
            <span className="text-[13px]" style={{ color: item.done ? C.textMain : C.textWeak }}>{item.item}</span>
            {item.done && <span className="ml-auto text-[11px]" style={{ color: C.okFg }}>已完成</span>}
          </div>
        ))}
      </SectionCard>

      <SectionCard title="试用期与转正" icon={GitBranch}>
        <div className="py-3">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-bold" style={{ color: C.textMain }}>试用期</span>
            <span className="inline-flex items-center rounded-full px-2 py-[2px] text-[11px] font-bold" style={{ backgroundColor: C.okBg, color: C.okFg }}>
              {hrFlow.probation.result}
            </span>
          </div>
          <div className="mt-2 flex gap-4">
            <div>
              <div className="text-[10px]" style={{ color: C.textWeak }}>开始日期</div>
              <div className="text-[12px] font-bold" style={{ color: C.textMain }}>{hrFlow.probation.startDate}</div>
            </div>
            <div>
              <div className="text-[10px]" style={{ color: C.textWeak }}>结束日期</div>
              <div className="text-[12px] font-bold" style={{ color: C.textMain }}>{hrFlow.probation.endDate}</div>
            </div>
            <div>
              <div className="text-[10px]" style={{ color: C.textWeak }}>评估得分</div>
              <div className="text-[12px] font-bold" style={{ color: C.brand }}>{hrFlow.probation.score}</div>
            </div>
          </div>
          <div className="mt-2 text-[12px]" style={{ color: C.textSub }}>{hrFlow.probation.comment}</div>
        </div>
      </SectionCard>

      <SectionCard title="离职管理" icon={AlertCircle}>
        {hrFlow.offboarding ? (
          <div className="py-3">
            <div className="text-[13px]" style={{ color: C.textMain }}>离职申请详情</div>
          </div>
        ) : (
          <div className="py-6 flex flex-col items-center gap-2">
            <CheckCircle size={28} strokeWidth={1} style={{ color: C.okFg, opacity: 0.5 }} />
            <div className="text-[13px] font-bold" style={{ color: C.okFg }}>当前在职</div>
            <div className="text-[12px]" style={{ color: C.textWeak }}>无离职申请记录</div>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

// ─── 在线签约弹窗 ─────────────────────────────────────────────────────────────
function SignContractModal({ onClose, staffName }: { onClose: () => void; staffName: string }) {
  const [contractType, setContractType] = useState("劳动合同");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [remark, setRemark] = useState("");

  const fieldClass = "w-full h-10 rounded-[10px] border border-[#DBE1E8] px-3 text-[13px] text-[#26303C] placeholder:text-[#9AA7B5] bg-white outline-none transition-colors duration-150";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ maxWidth: 480, margin: "0 auto" }}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full rounded-t-2xl bg-white pb-8" style={{ boxShadow: `0 6px 22px rgba(0,80,140,.10)` }}>
        <div className="flex items-center justify-between px-4 py-4" style={{ borderBottom: `1px solid ${C.line100}` }}>
          <span className="text-[15px] font-extrabold" style={{ color: C.textMain }}>发起在线签约</span>
          <button onClick={onClose} className="text-[12px]" style={{ color: C.textSub }}>取消</button>
        </div>
        <div className="px-4 pt-4 flex flex-col gap-4">
          <div className="text-[12px]" style={{ color: C.textSub }}>签约对象：<span className="font-bold" style={{ color: C.textMain }}>{staffName}</span></div>

          <div>
            <div className="text-[13px] font-bold mb-1.5" style={{ color: C.textMain }}>合同类型</div>
            <div className="flex gap-2 flex-wrap">
              {["劳动合同", "实习协议", "保密协议", "居间协议"].map(t => (
                <button
                  key={t}
                  onClick={() => setContractType(t)}
                  className="px-3 py-1.5 rounded-full text-[12px] font-bold transition-all duration-150"
                  style={{
                    backgroundColor: contractType === t ? C.brand : C.bg,
                    color: contractType === t ? "#fff" : C.textSub,
                    border: `1px solid ${contractType === t ? C.brand : C.line200}`,
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <div className="text-[13px] font-bold mb-1.5" style={{ color: C.textMain }}>开始日期</div>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className={fieldClass} />
            </div>
            <div className="flex-1">
              <div className="text-[13px] font-bold mb-1.5" style={{ color: C.textMain }}>结束日期</div>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className={fieldClass} />
            </div>
          </div>

          <div>
            <div className="text-[13px] font-bold mb-1.5" style={{ color: C.textMain }}>备注说明</div>
            <textarea
              value={remark}
              onChange={e => setRemark(e.target.value)}
              placeholder="可填写签约说明或注意事项"
              rows={3}
              className="w-full rounded-[10px] border border-[#DBE1E8] px-3 py-2 text-[13px] text-[#26303C] placeholder:text-[#9AA7B5] bg-white outline-none resize-none"
            />
          </div>

          <button
            onClick={() => {
              // TODO: trpc.yabanStaff.initiateSign.mutate({ staffId, contractType, startDate, endDate, remark })
              onClose();
            }}
            className="w-full h-11 rounded-full text-[14px] font-extrabold text-white transition-all duration-150 active:scale-[0.97]"
            style={{ background: C.brandGrad, boxShadow: `0 4px 14px rgba(30,136,214,.32)` }}
          >
            发起签约
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── 主组件 ───────────────────────────────────────────────────────────────────
const TABS = [
  { key: "basic",    label: "基本信息" },
  { key: "contract", label: "合同记录" },
  { key: "worklog",  label: "工作记录" },
  { key: "portrait", label: "员工画像" },
  { key: "salary",   label: "薪酬福利" },
  { key: "hrflow",   label: "人事流程" },
] as const;

type TabKey = typeof TABS[number]["key"];

export default function YabanStaffDetail() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<TabKey>("basic");
  const [showSignModal, setShowSignModal] = useState(false);

  // TODO: 替换为 trpc.yabanStaff.detail.useQuery({ id: Number(params.id), tenantId: currentTenantId ?? undefined })
  const data = MOCK_DETAIL;

  return (
    <div
      className="min-h-screen"
      style={{ maxWidth: 480, margin: "0 auto", backgroundColor: C.bg, fontFamily: "Nunito, -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif" }}
    >
      {/* ── 顶栏 ── */}
      <div style={{ background: C.brandGrad }}>
        <div className="flex items-center justify-between px-4 py-3">
          <button onClick={() => navigate("/yaban/staff")} className="p-1 -ml-1">
            <ChevronLeft size={22} strokeWidth={2} style={{ color: "#fff" }} />
          </button>
          <span className="text-[18px] font-extrabold text-white">{data.name} · 员工档案</span>
          <button className="p-1 -mr-1">
            <MoreHorizontal size={20} strokeWidth={1.5} style={{ color: "#fff" }} />
          </button>
        </div>

        {/* 员工头像卡 */}
        <div className="px-4 pb-4 flex items-center gap-3">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center text-[22px] font-extrabold flex-shrink-0"
            style={{ backgroundColor: "rgba(255,255,255,0.25)", color: "#fff" }}
          >
            {data.name[0]}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[18px] font-extrabold text-white">{data.name}</span>
              <span
                className="inline-flex items-center rounded-full px-2 py-[2px] text-[11px] font-bold"
                style={{ backgroundColor: "rgba(255,255,255,0.25)", color: "#fff" }}
              >
                {data.role}
              </span>
            </div>
            <div className="text-[12px] text-white/70 mt-0.5">
              {data.clinic} · 入职 {data.joinDate} · {data.yearsStr}
            </div>
          </div>
        </div>

        {/* Tab 导航 */}
        <div className="flex overflow-x-auto scrollbar-none" style={{ borderBottom: "1px solid rgba(255,255,255,0.15)" }}>
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className="flex-shrink-0 px-4 py-2.5 text-[12px] font-bold transition-all duration-150"
              style={{
                color: activeTab === tab.key ? "#fff" : "rgba(255,255,255,0.6)",
                borderBottom: activeTab === tab.key ? "2px solid #fff" : "2px solid transparent",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab 内容 ── */}
      <div className="px-4">
        {activeTab === "basic"    && <TabBasic data={data} />}
        {activeTab === "contract" && <TabContract data={data} onInitiateSign={() => setShowSignModal(true)} />}
        {activeTab === "worklog"  && <TabWorkLog data={data} />}
        {activeTab === "portrait" && <TabPortrait data={data} />}
        {activeTab === "salary"   && <TabSalary data={data} />}
        {activeTab === "hrflow"   && <TabHRFlow data={data} />}
      </div>

      {/* ── 在线签约弹窗 ── */}
      {showSignModal && (
        <SignContractModal staffName={data.name} onClose={() => setShowSignModal(false)} />
      )}
    </div>
  );
}

/*
 * TODO: 接口需求单（需主沙箱补充）
 *
 * 1. trpc.yabanStaff.detail
 *    入参: { id: number; tenantId?: number }
 *    出参: 完整员工档案对象（含合同、证照、工作记录、画像、薪酬、人事流程）
 *
 * 2. trpc.yabanStaff.initiateSign
 *    入参: { staffId: number; contractType: string; startDate: string; endDate: string; remark?: string; tenantId?: number }
 *    出参: { signRequestId: number; status: "pending" }
 *
 * 3. trpc.yabanStaff.uploadLicense
 *    入参: { staffId: number; licenseType: string; fileUrl: string; expireDate?: string; tenantId?: number }
 *    出参: { id: number }
 *
 * 4. trpc.yabanStaff.addWorkLog / addReward / addTraining
 *    入参: { staffId: number; ...fields; tenantId?: number }
 *    出参: { id: number }
 *
 * 5. trpc.yabanStaff.addAssessment
 *    入参: { staffId: number; period: string; score: number; level: string; comment?: string; tenantId?: number }
 *    出参: { id: number }
 */
