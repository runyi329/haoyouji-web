/**
 * 牙伴齿科管理 - AI 智能估值
 * 路由：/yaban/ai-valuation
 * 面向店主/投资人的门店动态价值评估展示页（1:1 还原 P403 原型）。
 * 当前为假数据展示，字段对齐 yabanValuationData.ts，后续接入实时经营数据模型。
 *
 * 设计规格（沿用原型 P403）：
 *   配色：yb-blue #1E88D6 / blue-deep #0E5A9E / blue-light #3BA9E0 / blue-faint #EAF4FE
 *         green #16A34A / orange #D97706 / purple #7C5CFC / red #DC2626
 *   渐变：header 135deg #1B6FA8->#2196C8 ; card 135deg #0E5A9E->#2196C8->#3BA9E0 ; btn #1E88D6->#3BA9E0
 *   圆角：卡片 rounded-2xl(16px) 子块 rounded-xl(12px) 标签 rounded-full
 *   动画：fadeUp 进场、barGrow 条形增长、pulse-glow 核心卡呼吸光
 *   图表：趋势折线 + 环形饼图，均用 canvas 绘制（配色见原型规格）
 * 严禁 Emoji，仅用内联 SVG 图标。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useSmartBack } from "@/hooks/useSmartBack";
import { toast } from "sonner";
import YabanTabBar from "./YabanTabBar";
import { trpc } from "@/lib/trpc";
import { CLINICS, YB, type ClinicValuation } from "./yabanValuationData";
import { useYabanClinic } from "./useYabanClinic";
import YabanClinicHeader from "./YabanClinicHeader";

/* ============== 内联 SVG 图标（等效 lucide，stroke=2，严禁 Emoji） ============== */
type IconProps = { className?: string; style?: React.CSSProperties };
const mk = (d: string) => (p: IconProps) => (
  <svg className={p.className} style={p.style} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
    {Array.isArray(d) ? null : <path strokeLinecap="round" strokeLinejoin="round" d={d} />}
  </svg>
);
const IcBack = mk("M15 19l-7-7 7-7");
const IcChevDown = mk("M19 9l-7 7-7-7");
const IcBuilding = mk(
  "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
);
const IcSparkle = mk(
  "M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z"
);
const IcArrowUp = mk("M2 12l6-6m0 0l6 6m-6-6v12");
const IcArrowDown = mk("M2 12l6 6m0 0l6-6m-6 6V6");
const IcShield = mk(
  "M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
);
const IcTrend = mk(
  "M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941"
);
const IcPie = [
  "M10.5 6a7.5 7.5 0 107.5 7.5h-7.5V6z",
  "M13.5 10.5H21A7.5 7.5 0 0013.5 3v7.5z",
];
const PieIcon = (p: IconProps) => (
  <svg className={p.className} style={p.style} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
    {IcPie.map((d) => (
      <path key={d} strokeLinecap="round" strokeLinejoin="round" d={d} />
    ))}
  </svg>
);
const IcUsers = mk(
  "M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"
);
const IcBars = mk(
  "M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
);
const IcAsset = mk(
  "M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z"
);
const IcPencil = mk(
  "M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"
);
const IcCost = mk(
  "M2.25 6L9 12.75l4.286-4.286a11.948 11.948 0 014.306 6.43l.776 2.898m0 0l3.182-5.511m-3.182 5.51l-5.511-3.181"
);
const IcWarn = mk(
  "M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
);
const IcCheckCircle = mk("M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z");
const IcInfo = mk(
  "M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
);
const IcShare = mk(
  "M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6"
);
const IcExternal = mk("M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25");
const IcClose = mk("M6 18L18 6M6 6l12 12");

/* 饼图 5 色（原型规格） */
const PIE_COLORS = [YB.blue, YB.purple, YB.green, YB.orange, "#CBD5E1"];

/* ============== 趋势折线图（canvas） ============== */
function TrendChart({ data, labels }: { data: number[]; labels: string[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const draw = () => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0) return;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
      const w = rect.width,
        h = rect.height;
      const padL = 45,
        padR = 15,
        padT = 15,
        padB = 30;
      const chartW = w - padL - padR,
        chartH = h - padT - padB;
      ctx.clearRect(0, 0, w, h);
      const min = Math.min(...data) * 0.95,
        max = Math.max(...data) * 1.05;
      const getX = (i: number) => padL + (i / (data.length - 1)) * chartW;
      const getY = (v: number) => padT + (1 - (v - min) / (max - min)) * chartH;
      ctx.strokeStyle = "#f1f5f9";
      ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i++) {
        const y = padT + (i / 4) * chartH;
        ctx.beginPath();
        ctx.moveTo(padL, y);
        ctx.lineTo(w - padR, y);
        ctx.stroke();
        const val = max - (i / 4) * (max - min);
        ctx.fillStyle = "#94a3b8";
        ctx.font = "10px sans-serif";
        ctx.textAlign = "right";
        ctx.fillText(Math.round(val) + "万", padL - 5, y + 3);
      }
      ctx.fillStyle = "#94a3b8";
      ctx.font = "10px sans-serif";
      ctx.textAlign = "center";
      labels.forEach((l, i) => ctx.fillText(l, getX(i), h - 8));
      const grad = ctx.createLinearGradient(0, padT, 0, padT + chartH);
      grad.addColorStop(0, "rgba(30,136,214,0.15)");
      grad.addColorStop(1, "rgba(30,136,214,0)");
      ctx.beginPath();
      ctx.moveTo(getX(0), getY(data[0]));
      for (let i = 1; i < data.length; i++) ctx.lineTo(getX(i), getY(data[i]));
      ctx.lineTo(getX(data.length - 1), padT + chartH);
      ctx.lineTo(getX(0), padT + chartH);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(getX(0), getY(data[0]));
      for (let i = 1; i < data.length; i++) ctx.lineTo(getX(i), getY(data[i]));
      ctx.strokeStyle = YB.blue;
      ctx.lineWidth = 2.5;
      ctx.lineJoin = "round";
      ctx.stroke();
      data.forEach((v, i) => {
        ctx.beginPath();
        ctx.arc(getX(i), getY(v), 3.5, 0, Math.PI * 2);
        ctx.fillStyle = "#fff";
        ctx.fill();
        ctx.strokeStyle = YB.blue;
        ctx.lineWidth = 2;
        ctx.stroke();
      });
    };
    draw();
    window.addEventListener("resize", draw);
    return () => window.removeEventListener("resize", draw);
  }, [data, labels]);
  return <canvas ref={ref} style={{ width: "100%", height: 160 }} />;
}

/* ============== 环形饼图（canvas） ============== */
function PieChart({ data }: { data: number[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = 120 * dpr;
    canvas.height = 120 * dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, 120, 120);
    const total = data.reduce((a, b) => a + b, 0);
    let startAngle = -Math.PI / 2;
    data.forEach((val, i) => {
      const sliceAngle = (val / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(60, 60);
      ctx.arc(60, 60, 55, startAngle, startAngle + sliceAngle);
      ctx.closePath();
      ctx.fillStyle = PIE_COLORS[i];
      ctx.fill();
      startAngle += sliceAngle;
    });
    ctx.beginPath();
    ctx.arc(60, 60, 32, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.fillStyle = "#1f2937";
    ctx.font = "bold 12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("营收", 60, 57);
    ctx.fillText("结构", 60, 72);
  }, [data]);
  return <canvas ref={ref} width={120} height={120} style={{ width: 120, height: 120 }} className="flex-shrink-0" />;
}

/* ============== 板块标题 ============== */
function SectionTitle({
  icon,
  title,
  hint,
  color = YB.blue,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  hint?: string;
  color?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 mb-2.5 px-1">
      <span style={{ color }} className="w-4 h-4 flex-shrink-0">
        {icon}
      </span>
      <span className="text-sm font-bold text-gray-800">{title}</span>
      {hint && <span className="text-[11px] text-gray-400 ml-auto">{hint}</span>}
      {action}
    </div>
  );
}

/* ============== 编辑弹窗 ============== */
const ASSET_FORM: { label: string; opts: string[]; multi?: boolean }[] = [
  { label: "牙椅数量", opts: ["3台", "5台", "7台", "10台", "12台", "15台+"] },
  { label: "牙椅品牌", opts: ["A-dec", "KaVo", "Sirona", "国产优质", "国产标准"] },
  { label: "影像设备", opts: ["CBCT+数字全景", "数字全景+口内相机", "仅数字全景", "传统胶片"] },
  { label: "主任医师数", opts: ["0", "1", "2", "3", "4", "5+"] },
  { label: "专科资质（可多选）", opts: ["种植", "正畸", "儿牙", "牙体修复", "牙周", "颜面外科"], multi: true },
  { label: "商圈等级", opts: ["S级", "A级", "B级", "C级", "社区店"] },
];
const COST_FORM: { label: string; opts: string[] }[] = [
  { label: "月房租/物业", opts: ["2万以下", "2-5万", "5-10万", "10-15万", "15-20万", "20万+"] },
  { label: "月人力成本", opts: ["5万以下", "5-10万", "10-15万", "15-20万", "20-30万", "30万+"] },
  { label: "月耗材/运营", opts: ["1万以下", "1-3万", "3-5万", "5-8万", "8万+"] },
  { label: "月营销推广", opts: ["0.5万以下", "0.5-1万", "1-2万", "2-3万", "3万+"] },
];

function EditModal({
  open,
  type,
  onClose,
  tenantId,
  currentData,
  onSaved,
}: {
  open: boolean;
  type: "asset" | "cost";
  onClose: () => void;
  tenantId: number | null;
  currentData: ClinicValuation;
  onSaved: () => void;
}) {
  const [single, setSingle] = useState<Record<string, string>>({});
  const [multi, setMulti] = useState<Record<string, boolean>>({});
  const saveMutation = trpc.yabanValuation.save.useMutation();
  if (!open) return null;
  const groups = type === "asset" ? ASSET_FORM : COST_FORM;

  const handleSave = async () => {
    if (tenantId == null) {
      toast.error("未识别当前医院");
      return;
    }
    try {
      const selections = {
        ...((currentData as any).editSelections || {}),
        [type]: { single, multi, savedAt: new Date().toISOString() },
      };
      await saveMutation.mutateAsync({
        tenantId,
        data: { ...currentData, editSelections: selections } as any,
      });
      toast.success("已保存");
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err?.message || "保存失败");
    }
  };
  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-lg rounded-t-2xl max-h-[85vh] overflow-y-auto"
        style={{ animation: "ybSlideUp 0.3s cubic-bezier(0.23,1,0.32,1)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between rounded-t-2xl z-10">
          <span className="text-base font-bold text-gray-800">
            {type === "asset" ? "编辑资产信息" : "编辑月度支出"}
          </span>
          <button onClick={onClose} className="text-gray-400 p-1">
            <IcClose className="w-5 h-5" />
          </button>
        </div>
        <div className="space-y-4 p-4">
          {groups.map((g) => (
            <div key={g.label}>
              <div className="text-sm font-medium text-gray-700 mb-2">{g.label}</div>
              <div className="flex flex-wrap gap-2">
                {g.opts.map((v) => {
                  const isMulti = "multi" in g && g.multi;
                  const active = isMulti
                    ? !!multi[`${g.label}_${v}`]
                    : single[g.label] === v;
                  return (
                    <span
                      key={v}
                      onClick={() => {
                        if (isMulti) {
                          setMulti((m) => ({ ...m, [`${g.label}_${v}`]: !m[`${g.label}_${v}`] }));
                        } else {
                          setSingle((s) => ({ ...s, [g.label]: v }));
                        }
                      }}
                      className="inline-block px-3.5 py-1.5 rounded-full text-[13px] cursor-pointer transition-all border"
                      style={
                        active
                          ? isMulti
                            ? { background: YB.purpleFaint, color: YB.purple, borderColor: YB.purple }
                            : { background: YB.blueFaint, color: YB.blue, borderColor: YB.blue }
                          : { background: "#f3f4f6", color: "#4b5563", borderColor: "transparent" }
                      }
                    >
                      {v}
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="sticky bottom-0 bg-white border-t border-gray-100 p-4">
          <button
            onClick={handleSave}
            disabled={saveMutation.isPending}
            className="w-full py-3 rounded-xl text-white text-sm font-bold active:scale-[0.98] transition-transform disabled:opacity-60"
            style={{ background: `linear-gradient(135deg, ${YB.blue} 0%, ${YB.blueLight} 100%)` }}
          >
            {saveMutation.isPending ? "保存中..." : "保存修改"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============== 小组件 ============== */
function ChangePill({ text, down }: { text: string; down?: boolean }) {
  return (
    <span
      className="text-[11px] mt-1 flex items-center gap-0.5"
      style={{ color: down ? YB.red : YB.green }}
    >
      {down ? <IcArrowDown className="w-3 h-3" /> : <IcArrowUp className="w-3 h-3" />}
      <span>{text}</span>
    </span>
  );
}

/* ============== 主页面 ============== */
export default function YabanAiValuation() {
  const [, setLocation] = useLocation();
  const goBack = useSmartBack("/yaban/features");
  const { currentTenantId, current } = useYabanClinic();
  const [edit, setEdit] = useState<{ open: boolean; type: "asset" | "cost" }>({
    open: false,
    type: "asset",
  });

  // 按当前医院 tenantId 读取真实估值数据
  const valuationQuery = trpc.yabanValuation.get.useQuery(
    currentTenantId != null ? { tenantId: currentTenantId } : undefined,
    { enabled: currentTenantId != null }
  );

  // 真实数据；接口无数据时回退到演示模板（避免空白），并补齐门店名
  const c: ClinicValuation = useMemo(() => {
    const remote = valuationQuery.data?.exists ? (valuationQuery.data.data as ClinicValuation) : null;
    const base = remote || CLINICS[0];
    const name = current?.name || base.name;
    const shortName = current?.shortName || base.shortName;
    return { ...base, name, shortName } as ClinicValuation;
  }, [valuationQuery.data, current]);

  const loading = currentTenantId != null && valuationQuery.isLoading;

  const headerGrad = "linear-gradient(135deg, #1B6FA8 0%, #2196C8 100%)";
  const cardGrad = "linear-gradient(135deg, #0E5A9E 0%, #2196C8 50%, #3BA9E0 100%)";
  const btnGrad = `linear-gradient(135deg, ${YB.blue} 0%, ${YB.blueLight} 100%)`;

  return (
    <div className="min-h-screen bg-slate-100">

      {/* 局部样式（动画与渐变进度条） */}
      <style>{`
        @keyframes ybFadeUp { from { transform: translateY(12px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes ybBarGrow { from { width: 0; } }
        @keyframes ybSlideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes ybPulseGlow { 0%,100% { box-shadow: 0 8px 32px rgba(30,136,214,0.3); } 50% { box-shadow: 0 8px 32px rgba(30,136,214,0.3), 0 0 20px 4px rgba(30,136,214,0.15); } }
        .yb-fade { animation: ybFadeUp 0.5s ease-out forwards; opacity: 0; }
        .yb-fade-1 { animation-delay: 0.05s; }
        .yb-fade-2 { animation-delay: 0.12s; }
        .yb-fade-3 { animation-delay: 0.2s; }
        .yb-fade-4 { animation-delay: 0.28s; }
        .yb-fade-5 { animation-delay: 0.36s; }
        .yb-bar { animation: ybBarGrow 0.8s ease-out forwards; }
        @media (prefers-reduced-motion: reduce) {
          .yb-fade, .yb-bar { animation: none !important; opacity: 1 !important; }
        }
      `}</style>

      {/* 顶部 Header */}
      <div className="text-white sticky top-0 z-40" style={{ background: headerGrad }}>
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <button onClick={goBack} className="p-1" aria-label="返回">
            <IcBack className="w-6 h-6" />
          </button>
          <span className="text-base font-bold">AI 智能估值</span>
          <YabanClinicHeader compact />
        </div>
      </div>

      <div className="max-w-lg mx-auto pb-24">
        {/* 核心估值卡 */}
        <div
          className="mx-3 mt-3 rounded-2xl p-5 text-white relative overflow-hidden yb-fade yb-fade-1"
          style={{ background: cardGrad, animation: "ybPulseGlow 3s infinite, ybFadeUp 0.5s ease-out forwards" }}
        >
          <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white opacity-10" />
          <div className="absolute -bottom-6 -left-6 w-24 h-24 rounded-full bg-white opacity-10" />
          <div className="flex items-center gap-2 mb-3 relative">
            <IcBuilding className="w-4 h-4 opacity-80" />
            <span className="text-sm opacity-90 font-medium">{c.name}</span>
            <span className="ml-auto text-xs opacity-60 bg-white/15 px-2 py-0.5 rounded-full">
              {c.area}
            </span>
          </div>
          <div className="relative">
            <div className="text-xs opacity-70 flex items-center gap-1">
              <IcSparkle className="w-3.5 h-3.5" />
              AI 实时动态估值
            </div>
            <div className="mt-1.5 flex items-end gap-3">
              <span className="text-[32px] font-bold tracking-tight leading-none">¥{c.valuation}</span>
              <span className="text-sm font-medium flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-white/20">
                <IcArrowUp className="w-3.5 h-3.5" />
                <span>{c.change}</span>
              </span>
            </div>
            <div className="mt-2 text-xs opacity-70 flex items-center gap-3">
              <span>{c.changeAmount}</span>
              <span className="flex items-center gap-0.5">
                <IcShield className="w-3 h-3" />
                <span>置信度 {c.confidence}</span>
              </span>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-white/20 grid grid-cols-2 gap-3">
            <div className="bg-white/10 rounded-lg px-3 py-2">
              <div className="text-[10px] opacity-60">基础估值（静态资产）</div>
              <div className="text-base font-bold mt-0.5">¥{c.baseValuation}</div>
            </div>
            <div className="bg-white/10 rounded-lg px-3 py-2">
              <div className="text-[10px] opacity-60">动态溢价（经营表现）</div>
              <div className="text-base font-bold mt-0.5">+¥{c.dynamicPremium}</div>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-white/20 flex items-center justify-between text-xs opacity-70">
            <span>更新时间：2026-06-16 09:30</span>
            <span>{c.scale}</span>
          </div>
        </div>

        {/* 估值趋势图 */}
        <div className="px-3 mt-4 yb-fade yb-fade-2">
          <SectionTitle icon={<IcTrend className="w-4 h-4" />} title="估值趋势" hint="近6个月" />
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <TrendChart data={c.trendData} labels={c.trendLabels} />
            <div className="mt-3 space-y-1.5">
              {c.trendEvents.map((e) => (
                <div key={e.text} className="flex items-center gap-2 text-[11px]">
                  <span
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ background: e.color }}
                  />
                  <span className="text-gray-500">{e.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 项目结构（饼图） */}
        <div className="px-3 mt-4 yb-fade yb-fade-2">
          <SectionTitle icon={<PieIcon className="w-4 h-4" />} title="项目结构" hint="营收来源占比" />
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <div className="flex items-center gap-4">
              <PieChart data={c.pieData} />
              <div className="flex-1 space-y-2">
                {[
                  { label: "种植", value: c.pieImplant, color: PIE_COLORS[0] },
                  { label: "正畸", value: c.pieOrtho, color: PIE_COLORS[1] },
                  { label: "修复", value: c.pieRestore, color: PIE_COLORS[2] },
                  { label: "洁牙/基础", value: c.pieBasic, color: PIE_COLORS[3] },
                  { label: "其他", value: c.pieOther, color: PIE_COLORS[4] },
                ].map((it) => (
                  <div key={it.label} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: it.color }} />
                      <span className="text-xs text-gray-600">{it.label}</span>
                    </div>
                    <span className="text-xs font-bold text-gray-800">{it.value}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-gray-50 text-[11px] text-gray-400">
              高毛利项目（种植+正畸）占比{" "}
              <span className="font-bold" style={{ color: YB.blue }}>
                {c.highMarginPct}
              </span>
              ，高于行业均值52%
            </div>
          </div>
        </div>

        {/* 客户价值 */}
        <div className="px-3 mt-4 yb-fade yb-fade-2">
          <SectionTitle icon={<IcUsers className="w-4 h-4" />} title="客户价值" hint="核心资产指标" />
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center rounded-xl py-3 px-2" style={{ background: YB.blueFaint }}>
                <div className="text-[11px]" style={{ color: YB.blue }}>客户LTV</div>
                <div className="text-base font-bold mt-1" style={{ color: YB.blueDeep }}>¥{c.ltvValue}</div>
                <div className="text-[10px] text-gray-400 mt-0.5">年均消费</div>
              </div>
              <div className="text-center rounded-xl py-3 px-2" style={{ background: YB.greenFaint }}>
                <div className="text-[11px]" style={{ color: YB.green }}>获客成本</div>
                <div className="text-base font-bold mt-1" style={{ color: YB.green }}>¥{c.cacValue}</div>
                <div className="text-[10px] text-gray-400 mt-0.5">CAC</div>
              </div>
              <div className="text-center rounded-xl py-3 px-2" style={{ background: YB.purpleFaint }}>
                <div className="text-[11px]" style={{ color: YB.purple }}>LTV/CAC</div>
                <div className="text-base font-bold mt-1" style={{ color: YB.purple }}>{c.ltvCacRatio}</div>
                <div className="text-[10px] text-gray-400 mt-0.5">极优</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div className="bg-gray-50 rounded-xl p-3">
                <div className="text-[11px] text-gray-500">转介绍率</div>
                <div className="text-sm font-bold text-gray-800 mt-0.5">{c.referralRate}</div>
                <div className="text-[10px] mt-0.5" style={{ color: YB.green }}>高于行业均值15%</div>
              </div>
              <div className="bg-gray-50 rounded-xl p-3">
                <div className="text-[11px] text-gray-500">高净值客户占比</div>
                <div className="text-sm font-bold text-gray-800 mt-0.5">{c.highValuePct}</div>
                <div className="text-[10px] text-gray-400 mt-0.5">年消费&gt;1.5万</div>
              </div>
            </div>
          </div>
        </div>

        {/* 经营指标 */}
        <div className="px-3 mt-4 yb-fade yb-fade-2">
          <SectionTitle icon={<IcBars className="w-4 h-4" />} title="经营指标" hint="数据驱动估值" />
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "月均营收", value: c.revenue, change: c.revenueChange, down: false },
              { label: "存量客户", value: c.patients, change: c.patientsChange, down: false },
              { label: "月新增客户", value: c.newPatients, change: c.newPatientsChange, down: false },
              { label: "复诊率", value: c.returnRate, change: c.returnRateChange, down: false },
              { label: "椅位利用率", value: c.chairRate, change: c.chairRateChange, down: c.chairRateChange.startsWith("-") },
              { label: "客单价", value: c.avgPrice, change: c.avgPriceChange, down: c.avgPriceChange.startsWith("-") },
            ].map((m) => (
              <div key={m.label} className="bg-white rounded-xl p-3 shadow-sm">
                <div className="text-[11px] text-gray-400">{m.label}</div>
                <div className="text-base font-bold text-gray-800 mt-1">{m.value}</div>
                <ChangePill text={m.change} down={m.down} />
              </div>
            ))}
          </div>
        </div>

        {/* 资产评估 */}
        <div className="px-3 mt-4 yb-fade yb-fade-3">
          <SectionTitle
            icon={<IcAsset className="w-4 h-4" />}
            title="资产评估"
            action={
              <button
                onClick={() => setEdit({ open: true, type: "asset" })}
                className="ml-auto flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full"
                style={{ color: YB.blue, background: YB.blueFaint }}
              >
                <IcPencil className="w-3 h-3" />
                编辑
              </button>
            }
          />
          <div className="bg-white rounded-2xl shadow-sm p-4 space-y-4">
            {/* 固定资产 */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: YB.blue }} />
                  <span className="text-sm font-medium text-gray-700">固定资产</span>
                </div>
                <span className="text-sm font-bold" style={{ color: YB.blue }}>{c.assetFixed}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { k: "牙椅设备", v: c.assetChair },
                  { k: "影像设备", v: c.assetImaging },
                  { k: "消毒灭菌", v: c.assetSterilize },
                  { k: "装修净值", v: c.assetDecor },
                ].map((it) => (
                  <div key={it.k} className="bg-gray-50 rounded-lg px-3 py-2">
                    <div className="text-[10px] text-gray-400">{it.k}</div>
                    <div className="text-xs font-medium text-gray-700 mt-0.5">{it.v}</div>
                  </div>
                ))}
              </div>
            </div>
            {/* 软资产 */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: YB.purple }} />
                  <span className="text-sm font-medium text-gray-700">软资产（团队资质）</span>
                </div>
                <span className="text-xs font-bold" style={{ color: YB.purple }}>{c.assetSoft}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 mb-2">
                {[
                  { v: c.assetDoctorSenior, k: "主任医师" },
                  { v: c.assetDoctorMid, k: "执业医师" },
                  { v: c.assetDoctorExp, k: "平均从业" },
                ].map((it) => (
                  <div key={it.k} className="text-center rounded-lg py-2" style={{ background: YB.purpleFaint }}>
                    <div className="text-base font-bold" style={{ color: YB.purple }}>{it.v}</div>
                    <div className="text-[10px] text-gray-400">{it.k}</div>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[c.assetCert1, c.assetCert2, c.assetCert3].map((cert) => (
                  <span
                    key={cert}
                    className="text-[11px] px-2 py-0.5 rounded-full border"
                    style={{ color: YB.purple, background: YB.purpleFaint, borderColor: "rgba(124,92,252,0.3)" }}
                  >
                    {cert}
                  </span>
                ))}
              </div>
            </div>
            {/* 区位资产 */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: YB.orange }} />
                  <span className="text-sm font-medium text-gray-700">区位资产</span>
                </div>
                <span className="text-xs font-bold" style={{ color: YB.orange }}>{c.assetLocation}</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { v: c.assetCommercial, k: "商圈等级" },
                  { v: c.assetPopulation, k: "人口密度" },
                  { v: c.assetCompetition, k: "500m内同类" },
                ].map((it) => (
                  <div key={it.k} className="text-center rounded-lg py-2" style={{ background: YB.orangeFaint }}>
                    <div className="text-sm font-bold" style={{ color: YB.orange }}>{it.v}</div>
                    <div className="text-[10px] text-gray-400">{it.k}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* 月度支出 */}
        <div className="px-3 mt-4 yb-fade yb-fade-3">
          <SectionTitle
            icon={<IcCost className="w-4 h-4" />}
            title="月度支出"
            color={YB.red}
            action={
              <button
                onClick={() => setEdit({ open: true, type: "cost" })}
                className="ml-auto flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full"
                style={{ color: YB.blue, background: YB.blueFaint }}
              >
                <IcPencil className="w-3 h-3" />
                编辑
              </button>
            }
          />
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-[11px] text-gray-400">月均总支出</div>
                <div className="text-lg font-bold mt-0.5" style={{ color: "#ef4444" }}>{c.costTotal}</div>
              </div>
              <div className="text-right">
                <div className="text-[11px] text-gray-400">利润率</div>
                <div className="text-lg font-bold mt-0.5" style={{ color: YB.green }}>{c.costProfitRate}</div>
              </div>
            </div>
            <div className="space-y-2.5">
              {[
                { k: "房租/物业", v: c.costRent, bar: c.costRentBar, color: "#f87171" },
                { k: "人力成本", v: c.costSalary, bar: c.costSalaryBar, color: "#ef4444" },
                { k: "耗材/运营", v: c.costOps, bar: c.costOpsBar, color: "#fb923c" },
                { k: "营销推广", v: c.costMkt, bar: c.costMktBar, color: "#eab308" },
                { k: "水电/其他", v: c.costUtil, bar: c.costUtilBar, color: "#d1d5db" },
              ].map((it) => (
                <div key={it.k} className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: it.color }} />
                  <span className="text-sm text-gray-600 w-20">{it.k}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                    <div className="h-full rounded-full yb-bar" style={{ width: it.bar, background: it.color }} />
                  </div>
                  <span className="text-sm font-medium text-gray-700 w-14 text-right">{it.v}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-gray-50 flex items-center justify-between">
              <span className="text-sm text-gray-500">月均净利润</span>
              <span className="text-base font-bold" style={{ color: YB.green }}>{c.costNetProfit}</span>
            </div>
          </div>
        </div>

        {/* 风险提示 */}
        <div className="px-3 mt-4 yb-fade yb-fade-3">
          <SectionTitle icon={<IcWarn className="w-4 h-4" />} title="风险提示" hint="估值折损因子" color={YB.orange} />
          <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
            {[
              { k: "租约稳定性", level: c.riskLease, detail: c.riskLeaseDetail },
              { k: "医生绑定度", level: c.riskDoctor, detail: c.riskDoctorDetail },
              { k: "合规状态", level: c.riskCompliance, detail: c.riskComplianceDetail },
              { k: "现金流质量", level: c.riskCashflow, detail: c.riskCashflowDetail },
            ].map((r) => {
              const mid = r.level.includes("中");
              const tone = mid
                ? { bg: YB.orangeFaint, fg: YB.orange }
                : { bg: YB.greenFaint, fg: YB.green };
              return (
                <div key={r.k} className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: tone.bg }}
                  >
                    {mid ? (
                      <IcWarn className="w-4 h-4" style={{ color: tone.fg }} />
                    ) : (
                      <IcCheckCircle className="w-4 h-4" style={{ color: tone.fg }} />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700">{r.k}</span>
                      <span
                        className="text-[11px] px-2 py-0.5 rounded-full font-medium"
                        style={{ background: tone.bg, color: tone.fg }}
                      >
                        {r.level}
                      </span>
                    </div>
                    <div className="text-[11px] text-gray-400 mt-0.5">{r.detail}</div>
                  </div>
                </div>
              );
            })}
            <div className="mt-2 pt-3 border-t border-gray-50 flex items-center justify-between">
              <span className="text-sm text-gray-500">综合风险评级</span>
              <span className="text-sm font-bold" style={{ color: YB.green }}>{c.riskOverall}</span>
            </div>
          </div>
        </div>

        {/* 估值构成 */}
        <div className="px-3 mt-4 yb-fade yb-fade-3">
          <SectionTitle icon={<PieIcon className="w-4 h-4" />} title="估值构成" />
          <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
            {[
              { k: "客户资产", pct: "35%", color: YB.blue, desc: "存量客户数、增速、复诊粘性" },
              { k: "营收能力", pct: "28%", color: YB.green, desc: "月营收、客单价、回款率" },
              { k: "增长潜力", pct: "22%", color: YB.purple, desc: "新客增速、市场渗透率" },
              { k: "区位价值", pct: "15%", color: YB.orange, desc: "商圈等级、人口密度、竞争格局" },
            ].map((it) => (
              <div key={it.k}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-700">{it.k}</span>
                  <span className="text-sm font-bold" style={{ color: it.color }}>{it.pct}</span>
                </div>
                <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                  <div className="h-full rounded-full yb-bar" style={{ width: it.pct, background: it.color }} />
                </div>
                <div className="text-[11px] text-gray-400 mt-0.5">{it.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* AI 分析摘要 */}
        <div className="px-3 mt-4 yb-fade yb-fade-4">
          <SectionTitle icon={<IcSparkle className="w-4 h-4" />} title="AI 分析摘要" />
          <div
            className="bg-white rounded-2xl shadow-sm p-4 relative overflow-hidden"
            style={{ borderLeft: `3px solid ${YB.blue}` }}
          >
            <p className="text-sm text-gray-600 leading-relaxed">{c.aiSummary}</p>
            <div className="mt-3 flex items-center gap-1 text-[11px] text-gray-400">
              <IcInfo className="w-3 h-3" />
              由 AI 模型基于实时经营数据自动生成，仅供参考
            </div>
          </div>
        </div>

        {/* 股份信息 */}
        <div className="px-3 mt-4 yb-fade yb-fade-5">
          <SectionTitle icon={<IcShare className="w-4 h-4" />} title="股份信息" />
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl p-3" style={{ background: YB.blueFaint }}>
                <div className="text-[11px]" style={{ color: YB.blue }}>每股价格</div>
                <div className="text-lg font-bold mt-0.5" style={{ color: YB.blueDeep }}>¥{c.sharePrice}</div>
              </div>
              <div className="rounded-xl p-3" style={{ background: YB.greenFaint }}>
                <div className="text-[11px]" style={{ color: YB.green }}>预期年分红率</div>
                <div className="text-lg font-bold mt-0.5" style={{ color: YB.green }}>{c.dividendRate}</div>
              </div>
              <div className="rounded-xl p-3" style={{ background: YB.purpleFaint }}>
                <div className="text-[11px]" style={{ color: YB.purple }}>总份额</div>
                <div className="text-lg font-bold mt-0.5" style={{ color: YB.purple }}>{c.totalShares} 股</div>
              </div>
              <div className="rounded-xl p-3" style={{ background: YB.orangeFaint }}>
                <div className="text-[11px]" style={{ color: YB.orange }}>已售份额</div>
                <div className="text-lg font-bold mt-0.5" style={{ color: YB.orange }}>{c.soldShares} 股</div>
                <div className="text-[10px] text-gray-400 mt-0.5">剩余 {c.remainShares} 股可售</div>
              </div>
            </div>
            <div className="mt-3">
              <div className="flex items-center justify-between text-[11px] text-gray-500 mb-1">
                <span>已售出 {c.soldShares}/{c.totalShares}</span>
                <span>{c.soldPercent}</span>
              </div>
              <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                <div className="h-full rounded-full yb-bar" style={{ width: c.soldPercent, background: btnGrad }} />
              </div>
            </div>
          </div>
        </div>

        {/* 底部行动按钮 */}
        <div className="px-3 mt-5">
          <button
            className="w-full py-3.5 rounded-2xl text-white text-sm font-bold active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
            style={{ background: btnGrad, boxShadow: "0 4px 16px rgba(30,136,214,0.3)" }}
            onClick={() => setLocation("/yaban/partner-profile")}
          >
            <IcExternal className="w-4 h-4" />
            查看股份详情
          </button>
        </div>

        {/* 估值说明 */}
        <div className="px-3 mt-4 mb-4">
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <div className="text-sm font-semibold text-gray-800 mb-2 flex items-center gap-1.5">
              <IcInfo className="w-4 h-4 text-gray-400" />
              估值模型说明
            </div>
            <p className="text-xs text-gray-500 leading-relaxed">
              AI 估值 = 基础估值（静态资产评估）+ 动态溢价（经营表现加成）- 风险折扣。基础估值依据门店固定资产、团队资质、区位价值等静态因子测算；动态溢价基于实时经营数据（营收增长、客户LTV、项目结构、获客效率等）动态加权；风险折扣综合考虑租约稳定性、医生绑定度、合规状态等。模型每日自动更新，仅供参考，不构成投资建议。
            </p>
          </div>
        </div>
      </div>

      <EditModal
        open={edit.open}
        type={edit.type}
        tenantId={currentTenantId}
        currentData={c}
        onSaved={() => valuationQuery.refetch()}
        onClose={() => setEdit((e) => ({ ...e, open: false }))}
      />

      <YabanTabBar />
    </div>
  );
}
