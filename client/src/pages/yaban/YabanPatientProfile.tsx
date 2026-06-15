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
    // 解析失败时退化为截取前 16 位（YYYY-MM-DD HH:mm）
    return s.slice(0, 16);
  }
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// 单个字段单元：上标签下内容，half=半宽（两列并排），full=整行
function Cell({
  label,
  value,
  half = true,
  highlight,
}: {
  label: string;
  value: string;
  half?: boolean;
  highlight?: boolean;
}) {
  return (
    <div className={half ? "w-1/2 px-2 py-2" : "w-full px-2 py-2"}>
      <div className="text-[11px] text-gray-400 mb-0.5">{label}</div>
      <div className={`text-[13px] break-all ${highlight ? "text-orange-500 font-medium" : "text-gray-800"}`}>
        {value}
      </div>
    </div>
  );
}

// 卡片容器（内部以 flex-wrap 实现多列信息表布局）
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl px-2 pt-3 pb-2 mb-3">
      <div className="text-[13px] font-bold text-gray-800 px-2 pb-1">{title}</div>
      <div className="flex flex-wrap divide-gray-50">{children}</div>
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

  // 既往病史标记汇总
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

      <div className="px-3 pt-3">
        {/* 个人信息 */}
        <Card title="个人信息">
          <Cell label="姓名" value={val(r.name)} />
          <Cell label="昵称" value={val(r.nickname)} />
          <Cell label="性别" value={val(r.gender)} />
          <Cell label="生日" value={val(r.birthday)} />
          <Cell label="年龄" value={r.age != null && r.age !== "" ? `${r.age}岁` : "—"} />
          <Cell label="星座/生肖" value={val(r.zodiac)} />
          <Cell label="顾客类型" value={val(r.patient_type)} />
          <Cell label="顾客编号" value={val(r.medical_no)} />
          <Cell label="外部编号" value={val(r.external_no)} />
        </Card>

        {/* 联系方式 */}
        <Card title="联系方式">
          <Cell label="手机" value={val(r.mobile)} />
          <Cell label="固定电话" value={val(r.phone)} />
          <Cell label="邮箱" value={val(r.email)} full />
          <Cell label="所在地区" value={val(r.region)} />
          <Cell label="地址" value={val(r.address)} full />
        </Card>

        {/* 紧急联系人 */}
        <Card title="紧急联系人">
          <Cell label="联系人" value={val(r.emergency_contact)} />
          <Cell label="关系" value={val(r.emergency_relation)} />
          <Cell label="联系人电话" value={val(r.emergency_phone)} full />
        </Card>

        {/* 顾客信息 */}
        <Card title="顾客信息">
          <Cell label="顾客来源" value={val(r.source)} />
          <Cell label="网电咨询师" value={val(r.net_consultant)} />
          <Cell label="咨询师" value={val(r.consultant)} />
          <Cell label="AI健康标签" value={val(r.history)} full />
        </Card>

        {/* 健康与既往病史 */}
        <Card title="健康与既往病史">
          <Cell label="就诊主诉" value={val(r.chief_complaint)} />
          <Cell label="健康状况" value={val(r.health_status)} />
          <Cell label="药物过敏" value={val(r.drug_allergy)} highlight={isPositive(r.drug_allergy)} />
          <Cell label="食物过敏" value={val(r.food_allergy)} highlight={isPositive(r.food_allergy)} />
          <Cell label="正在用药" value={val(r.medication)} full highlight={isPositive(r.medication)} />
          {/* 七项病史标记：有异常的高亮汇总 */}
          <div className="w-full px-2 py-2">
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
        </Card>

        {/* 备注与建档 */}
        <Card title="备注与建档">
          <Cell label="顾客备注" value={val(r.remark)} full />
          <Cell label="上次就诊医生" value={val(r.last_doctor)} />
          <Cell label="上次就诊" value={val(r.last_visit)} />
          <Cell label="建档时间" value={fmtTime(r.created_at)} full />
        </Card>

        {/* 编辑入口 */}
        <button
          onClick={() => navigate(`/yaban/patient/${id}`)}
          className="w-full flex items-center justify-center gap-1.5 bg-sky-500 text-white rounded-full py-3 font-medium mt-1"
        >
          <Edit className="w-5 h-5" /> 编辑资料
        </button>
      </div>

      <PageTag code="P330" />
    </div>
  );
}
