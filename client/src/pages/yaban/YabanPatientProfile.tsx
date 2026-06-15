import { useLocation, useRoute } from "wouter";
import { PageTag } from "@/components/PageTag";
import { ChevronLeft, Edit, Copy } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

// 既往病史七项标记字段（与建表字段一一对应）
const HISTORY_FIELDS: { key: string; label: string }[] = [
  { key: "heart", label: "心脏病" },
  { key: "hypertension", label: "高血压" },
  { key: "diabetes", label: "糖尿病" },
  { key: "kidney", label: "肾病" },
  { key: "infectious", label: "传染病" },
  { key: "bleeding", label: "出血史" },
  { key: "pregnant", label: "妊娠" },
];

// 判断标记是否为“有/异常”状态（用于高亮）
function isPositive(v: any): boolean {
  if (v == null) return false;
  const s = String(v).trim();
  if (!s) return false;
  return !["无", "否", "正常", "no", "false", "0", "未知", "-", "—"].includes(s.toLowerCase());
}

// 空值占位
function val(v: any): string {
  if (v == null) return "—";
  const s = String(v).trim();
  return s || "—";
}

// 时间格式化：统一显示为「年-月-日 时:分」，去掉时区与英文
function fmtTime(v: any): string {
  if (v == null) return "—";
  const s = String(v).trim();
  if (!s) return "—";
  const d = new Date(s.replace(" ", "T"));
  if (isNaN(d.getTime())) {
    return s.slice(0, 16);
  }
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// 列宽档位：sm≈四五列、md≈三列、lg≈两列、full≈整行
type Span = "sm" | "md" | "lg" | "full";
const SPAN_BASIS: Record<Span, string> = {
  sm: "120px", // 短字段：一行可排 4~5 个（自动适配剩余空间）
  md: "180px", // 中等字段：一行约 3 个
  lg: "260px", // 较长字段：一行约 2 个
  full: "100%", // 长内容独占整行
};

// 单个档案字段：标签在上、内容在下，flex-wrap 流式自适应排布
function Field({
  label,
  value,
  span = "sm",
  highlight,
}: {
  label: string;
  value: string;
  span?: Span;
  highlight?: boolean;
}) {
  return (
    <div
      className="grow border-b border-r border-dashed border-gray-200 px-3 py-2"
      style={{ flexBasis: SPAN_BASIS[span] }}
    >
      <div className="text-[11px] text-gray-400 mb-0.5 whitespace-nowrap">{label}</div>
      <div className={`text-[13px] break-words ${highlight ? "text-orange-500 font-medium" : "text-gray-800"}`}>
        {value}
      </div>
    </div>
  );
}

// 组内小标题（用于在同一容器内区隔分组）
function GroupTitle({ text }: { text: string }) {
  return (
    <div className="w-full px-3 pt-3 pb-1">
      <span className="text-[13px] font-bold text-gray-800">{text}</span>
    </div>
  );
}

export default function YabanPatientProfile() {
  const [, navigate] = useLocation();
  const [, params] = useRoute("/yaban/patient/:id/profile");
  const id = params?.id ? Number(params.id) : 0;

  const detailQuery = trpc.yabanCustomer.detail.useQuery(
    { id },
    { enabled: id > 0, refetchOnWindowFocus: false }
  );
  const r = detailQuery.data as any;

  const copy = async (text: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      toast.success("已复制");
    } catch {
      toast.error("复制失败");
    }
  };

  if (detailQuery.isLoading) {
    return (
      <div className="min-h-screen bg-[#F0F4F8] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-sky-200 border-t-sky-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!r) {
    return (
      <div className="min-h-screen bg-[#F0F4F8] flex flex-col">
        <div className="bg-gradient-to-r from-sky-500 to-sky-400 text-white">
          <div className="flex items-center justify-between px-4 py-3">
            <button onClick={() => navigate(`/yaban/patient/${id}`)} className="p-1">
              <ChevronLeft className="w-6 h-6" />
            </button>
            <span className="text-lg font-bold">详细资料</span>
            <span className="w-6" />
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">未找到该顾客</div>
        <PageTag code="P330" />
      </div>
    );
  }

  const genderColor = r.gender === "女" ? "bg-pink-400" : "bg-sky-500";
  const genderText = r.gender === "女" ? "F" : "M";
  const positiveHistory = HISTORY_FIELDS.filter((h) => isPositive(r[h.key]));

  return (
    <div className="min-h-screen bg-[#F0F4F8] pb-8">
      {/* 顶部导航 */}
      <div className="bg-gradient-to-r from-sky-500 to-sky-400 text-white sticky top-0 z-20">
        <div className="flex items-center justify-between px-4 py-3">
          <button onClick={() => navigate(`/yaban/patient/${id}`)} className="p-1">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <span className="text-lg font-bold">详细资料</span>
          <button
            onClick={() => navigate(`/yaban/patient/${id}`)}
            className="flex items-center text-white/90 text-sm"
          >
            <Edit className="w-4 h-4 mr-0.5" /> 编辑
          </button>
        </div>
      </div>

      {/* 头部摘要（头像与详情页一致：仅显示姓名首字灰底圆框） */}
      <div className="bg-white px-4 py-4 flex items-center gap-3">
        <div className="w-14 h-14 rounded-full bg-gray-200 flex items-center justify-center overflow-hidden shrink-0">
          <span className="text-xl text-gray-400">{(r.name || "客")[0]}</span>
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-gray-900 truncate">{r.name}</span>
            {r.age != null && r.age !== "" && <span className="text-gray-500 text-sm">{r.age}岁</span>}
            <span className={`w-5 h-5 rounded-full ${genderColor} flex items-center justify-center`}>
              <span className="text-white text-[10px]">{genderText}</span>
            </span>
          </div>
          <div className="text-[12px] text-gray-400 mt-1 flex items-center gap-1">
            顾客编号 <span className="text-gray-600">{val(r.medical_no)}</span>
            {r.medical_no && (
              <button onClick={() => copy(r.medical_no)} className="text-sky-500 ml-0.5">
                <Copy className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 单一档案容器：所有分组都在这一个卡片内，字段以细虚线分隔、流式自适应排布 */}
      <div className="px-3 pt-3">
        <div className="bg-white rounded-2xl overflow-hidden">
          {/* 借助底部/右侧虚线 + 容器裁切，形成档案表格栏效果 */}
          <div className="flex flex-wrap">
            <GroupTitle text="个人信息" />
            <Field label="姓名" value={val(r.name)} span="sm" />
            <Field label="昵称" value={val(r.nickname)} span="sm" />
            <Field label="性别" value={val(r.gender)} span="sm" />
            <Field label="年龄" value={r.age != null && r.age !== "" ? `${r.age}岁` : "—"} span="sm" />
            <Field label="生日" value={val(r.birthday)} span="md" />
            <Field label="星座" value={val(r.zodiac)} span="sm" />
            <Field label="生肖" value={val(r.chinese_zodiac)} span="sm" />
            <Field label="顾客类型" value={val(r.patient_type)} span="sm" />
            <Field label="顾客编号" value={val(r.medical_no)} span="md" />
            <Field label="外部编号" value={val(r.external_no)} span="md" />

            <GroupTitle text="联系方式" />
            <Field label="手机" value={val(r.mobile)} span="md" />
            <Field label="固定电话" value={val(r.phone)} span="md" />
            <Field label="邮箱" value={val(r.email)} span="lg" />
            <Field label="所在地区" value={val(r.region)} span="md" />
            <Field label="地址" value={val(r.address)} span="full" />

            <GroupTitle text="紧急联系人" />
            <Field label="联系人" value={val(r.emergency_contact)} span="sm" />
            <Field label="关系" value={val(r.emergency_relation)} span="sm" />
            <Field label="联系人电话" value={val(r.emergency_phone)} span="md" />

            <GroupTitle text="顾客信息" />
            <Field label="顾客来源" value={val(r.source)} span="sm" />
            <Field label="网电咨询师" value={val(r.net_consultant)} span="md" />
            <Field label="咨询师" value={val(r.consultant)} span="md" />
            <Field label="AI健康标签" value={val(r.history)} span="full" />

            <GroupTitle text="健康与既往病史" />
            <Field label="就诊主诉" value={val(r.chief_complaint)} span="md" />
            <Field label="健康状况" value={val(r.health_status)} span="md" />
            <Field label="药物过敏" value={val(r.drug_allergy)} span="md" highlight={isPositive(r.drug_allergy)} />
            <Field label="食物过敏" value={val(r.food_allergy)} span="md" highlight={isPositive(r.food_allergy)} />
            <Field label="正在用药" value={val(r.medication)} span="lg" highlight={isPositive(r.medication)} />
            {/* 七项病史标记：有异常的高亮汇总 */}
            <div className="w-full border-b border-dashed border-gray-200 px-3 py-2">
              <div className="text-[11px] text-gray-400 mb-1.5">既往病史</div>
              <div className="flex flex-wrap gap-1.5">
                {HISTORY_FIELDS.map((h) => {
                  const pos = isPositive(r[h.key]);
                  return (
                    <span
                      key={h.key}
                      className={`px-2 py-1 rounded-md text-[12px] ${
                        pos ? "bg-orange-50 text-orange-500 font-medium" : "bg-gray-50 text-gray-300"
                      }`}
                    >
                      {h.label}
                      {pos ? `：${val(r[h.key])}` : ""}
                    </span>
                  );
                })}
              </div>
              {positiveHistory.length === 0 && (
                <div className="text-[12px] text-gray-300 mt-1.5">暂无特殊既往病史</div>
              )}
            </div>

            <GroupTitle text="备注与建档" />
            <Field label="顾客备注" value={val(r.remark)} span="full" />
            <Field label="上次就诊医生" value={val(r.last_doctor)} span="md" />
            <Field label="上次就诊" value={val(r.last_visit)} span="md" />
            <Field label="建档时间" value={fmtTime(r.created_at)} span="lg" />
          </div>
        </div>

        {/* 编辑入口 */}
        <button
          onClick={() => navigate(`/yaban/patient/${id}`)}
          className="w-full flex items-center justify-center gap-1.5 bg-sky-500 text-white rounded-full py-3 font-medium mt-3"
        >
          <Edit className="w-5 h-5" /> 编辑资料
        </button>
      </div>

      <PageTag code="P330" />
    </div>
  );
}
