/**
 * 牙伴齿科 - 创始人后台 · 大数据管理看板
 * 路由：/yaban/admin（仅创始人可见，后端 assertFounder 双重校验）
 *
 * 功能：
 *   - 顶部总览：医院总数/已开通/待审批、院长股东数、员工数、顾客数、平台营业额
 *   - 医院列表：每家医院 各角色人数 / 顾客 / 营业额，可搜索
 *   - 待审批医院：确认开通 / 驳回
 *   - 医院详情：成员名册（按角色分组）、搜索用户任命院长/股东
 * 规范：移动端优先、蓝白风格、严禁 Emoji，全部用 lucide 图标
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import {
  ChevronLeft,
  Building2,
  Users,
  UserCog,
  Wallet,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Stethoscope,
  HeartPulse,
  Phone,
  Calculator,
  ChevronRight,
  UserPlus,
  X,
  Crown,
} from "lucide-react";
import { PageTag } from "@/components/PageTag";
import { trpc } from "@/lib/trpc";

const fmtMoney = (n: number) =>
  "¥" + Number(n || 0).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ROLE_META: { key: string; label: string; icon: React.ReactNode }[] = [
  { key: "ownerCount", label: "院长/股东", icon: <Crown className="w-3.5 h-3.5 text-[#D97706]" /> },
  { key: "doctorCount", label: "医生", icon: <Stethoscope className="w-3.5 h-3.5 text-[#2196C8]" /> },
  { key: "assistantCount", label: "护士助理", icon: <HeartPulse className="w-3.5 h-3.5 text-[#16A34A]" /> },
  { key: "receptionistCount", label: "前台", icon: <Phone className="w-3.5 h-3.5 text-[#8B5CF6]" /> },
  { key: "financeCount", label: "财务", icon: <Calculator className="w-3.5 h-3.5 text-[#64748B]" /> },
];

export default function YabanAdmin() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const [keyword, setKeyword] = useState("");
  const [detailId, setDetailId] = useState<number | null>(null);

  const overview = trpc.yabanClinic.adminOverview.useQuery();
  const list = trpc.yabanClinic.adminListClinics.useQuery({ keyword });

  const approve = trpc.yabanClinic.adminApprove.useMutation({
    onSuccess: () => {
      toast.success("已确认开通");
      utils.yabanClinic.adminListClinics.invalidate();
      utils.yabanClinic.adminOverview.invalidate();
    },
    onError: (e) => toast.error(e.message || "操作失败"),
  });
  const reject = trpc.yabanClinic.adminReject.useMutation({
    onSuccess: () => {
      toast.success("已驳回");
      utils.yabanClinic.adminListClinics.invalidate();
      utils.yabanClinic.adminOverview.invalidate();
    },
    onError: (e) => toast.error(e.message || "操作失败"),
  });

  const ov = overview.data;
  const clinics = list.data || [];
  const pendingClinics = clinics.filter((c: any) => c.status === "pending");
  const activeClinics = clinics.filter((c: any) => c.status !== "pending");

  const onApprove = (c: any) => {
    if (!window.confirm(`确认开通「${c.name}」？开通后申请人将成为该医院院长/股东。`)) return;
    approve.mutate({ clinicId: c.id });
  };
  const onReject = (c: any) => {
    const reason = window.prompt("请输入驳回原因（可留空）", "");
    if (reason === null) return;
    reject.mutate({ clinicId: c.id, reason });
  };

  const StatusTag = ({ status }: { status: string }) => {
    if (status === "active")
      return <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-[#E6F7EE] text-[#16A34A]"><CheckCircle2 className="w-3 h-3" />已开通</span>;
    if (status === "pending")
      return <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-[#FEF6E6] text-[#D97706]"><Clock className="w-3 h-3" />待审批</span>;
    return <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-[#FDECEC] text-[#DC2626]"><XCircle className="w-3 h-3" />已驳回</span>;
  };

  const ClinicCard = ({ c, showActions }: { c: any; showActions?: boolean }) => (
    <div className="bg-white rounded-2xl shadow-sm p-4">
      <div className="flex items-start justify-between gap-2">
        <button onClick={() => setDetailId(c.id)} className="flex items-start gap-2 flex-1 min-w-0 text-left">
          <span className="w-9 h-9 rounded-xl bg-[#EAF4FE] flex items-center justify-center shrink-0">
            <Building2 className="w-5 h-5 text-[#1E88D6]" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-gray-800 truncate">{c.name}</span>
            <span className="block text-xs text-gray-400 mt-0.5 truncate">
              {c.taxNo ? `税号 ${c.taxNo}` : "未填写税号"}
              {c.applyUserName ? ` · 申请人 ${c.applyUserName}` : ""}
            </span>
          </span>
        </button>
        <StatusTag status={c.status} />
      </div>

      {/* 各角色人数 */}
      <div className="mt-3 grid grid-cols-5 gap-1">
        {ROLE_META.map((r) => (
          <div key={r.key} className="flex flex-col items-center justify-center bg-[#F7FAFD] rounded-lg py-1.5">
            <span className="flex items-center justify-center mb-0.5">{r.icon}</span>
            <span className="text-sm font-bold text-gray-800 leading-none">{c[r.key] ?? 0}</span>
            <span className="text-[10px] text-gray-400 mt-0.5 scale-90 whitespace-nowrap">{r.label}</span>
          </div>
        ))}
      </div>

      {/* 顾客 / 营业额 */}
      <div className="mt-2 flex items-center justify-between text-xs text-gray-500 px-1">
        <span className="inline-flex items-center gap-1"><Users className="w-3.5 h-3.5 text-[#2196C8]" />顾客 {c.customerCount ?? 0}</span>
        <span className="inline-flex items-center gap-1"><Wallet className="w-3.5 h-3.5 text-[#16A34A]" />营业额 {fmtMoney(c.revenue)}</span>
        <button onClick={() => setDetailId(c.id)} className="inline-flex items-center gap-0.5 text-[#1E88D6]">详情<ChevronRight className="w-3.5 h-3.5" /></button>
      </div>

      {c.status === "rejected" && c.rejectReason && (
        <div className="mt-2 text-[11px] text-[#DC2626] bg-[#FDECEC] rounded-lg px-2 py-1">驳回原因：{c.rejectReason}</div>
      )}

      {showActions && c.status === "pending" && (
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => onApprove(c)}
            disabled={approve.isPending}
            className="flex-1 py-2 rounded-xl bg-[#2196C8] text-white text-sm font-medium active:bg-[#1B7FB0] disabled:opacity-60"
          >
            确认开通
          </button>
          <button
            onClick={() => onReject(c)}
            disabled={reject.isPending}
            className="flex-1 py-2 rounded-xl bg-gray-100 text-gray-600 text-sm font-medium active:bg-gray-200 disabled:opacity-60"
          >
            驳回
          </button>
        </div>
      )}
    </div>
  );

  const StatCard = ({ label, value, icon, accent }: { label: string; value: React.ReactNode; icon: React.ReactNode; accent?: string }) => (
    <div className="bg-white rounded-2xl shadow-sm p-3 flex flex-col gap-1">
      <span className="flex items-center gap-1.5 text-xs text-gray-500">{icon}{label}</span>
      <span className={`text-xl font-bold ${accent || "text-[#0E5A9E]"}`}>{value}</span>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F0F4F8] pb-10">
      <PageTag code="P305" />

      {/* 头部 */}
      <div className="bg-gradient-to-b from-[#1B6FA8] to-[#2196C8] text-white">
        <div className="max-w-lg mx-auto px-4 pt-4 pb-6">
          <button onClick={() => navigate("/yaban/profile")} className="flex items-center gap-1 text-sm text-white/90 mb-3">
            <ChevronLeft className="w-5 h-5" /> 返回
          </button>
          <div className="text-lg font-bold">后台管理 · 大数据看板</div>
          <p className="text-xs text-white/85 mt-1">全平台医院经营数据总览，数据来自各院实际运营</p>
        </div>
      </div>

      {/* 总览统计 */}
      <div className="max-w-lg mx-auto px-4 -mt-4">
        {overview.isLoading ? (
          <div className="bg-white rounded-2xl shadow-sm p-8 flex justify-center"><Loader2 className="w-6 h-6 text-[#2196C8] animate-spin" /></div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            <StatCard label="医院总数" value={ov?.clinicTotal ?? 0} icon={<Building2 className="w-3.5 h-3.5 text-[#1E88D6]" />} />
            <StatCard label="待审批" value={ov?.clinicPending ?? 0} icon={<Clock className="w-3.5 h-3.5 text-[#D97706]" />} accent="text-[#D97706]" />
            <StatCard label="院长/股东" value={ov?.ownerTotal ?? 0} icon={<Crown className="w-3.5 h-3.5 text-[#D97706]" />} />
            <StatCard label="员工总数" value={ov?.staffTotal ?? 0} icon={<UserCog className="w-3.5 h-3.5 text-[#2196C8]" />} />
            <StatCard label="顾客总数" value={ov?.customerTotal ?? 0} icon={<Users className="w-3.5 h-3.5 text-[#2196C8]" />} />
            <StatCard label="平台营业额" value={fmtMoney(ov?.revenueTotal ?? 0)} icon={<Wallet className="w-3.5 h-3.5 text-[#16A34A]" />} accent="text-[#16A34A]" />
          </div>
        )}
      </div>

      {/* 搜索 */}
      <div className="max-w-lg mx-auto px-4 mt-4">
        <div className="bg-white rounded-xl shadow-sm flex items-center px-3 py-2 gap-2">
          <Search className="w-4 h-4 text-gray-400" />
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索医院名称 / 税号"
            className="flex-1 text-sm focus:outline-none bg-transparent"
          />
        </div>
      </div>

      {/* 待审批 */}
      {pendingClinics.length > 0 && (
        <div className="max-w-lg mx-auto px-4 mt-4">
          <div className="text-sm font-bold text-gray-700 mb-2 flex items-center gap-1">
            <Clock className="w-4 h-4 text-[#D97706]" /> 待审批医院（{pendingClinics.length}）
          </div>
          <div className="space-y-3">
            {pendingClinics.map((c: any) => <ClinicCard key={c.id} c={c} showActions />)}
          </div>
        </div>
      )}

      {/* 医院列表 */}
      <div className="max-w-lg mx-auto px-4 mt-4">
        <div className="text-sm font-bold text-gray-700 mb-2 flex items-center gap-1">
          <Building2 className="w-4 h-4 text-[#1E88D6]" /> 医院列表（{activeClinics.length}）
        </div>
        {list.isLoading ? (
          <div className="bg-white rounded-2xl shadow-sm p-8 flex justify-center"><Loader2 className="w-6 h-6 text-[#2196C8] animate-spin" /></div>
        ) : activeClinics.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm p-8 text-center text-sm text-gray-400">暂无医院数据</div>
        ) : (
          <div className="space-y-3">
            {activeClinics.map((c: any) => <ClinicCard key={c.id} c={c} />)}
          </div>
        )}
      </div>

      {detailId !== null && (
        <ClinicDetailSheet clinicId={detailId} onClose={() => setDetailId(null)} />
      )}
    </div>
  );
}

/* ============ 医院详情抽屉：成员名册 + 搜索任命院长 ============ */
function ClinicDetailSheet({ clinicId, onClose }: { clinicId: number; onClose: () => void }) {
  const utils = trpc.useUtils();
  const detail = trpc.yabanClinic.adminClinicDetail.useQuery({ clinicId });
  const [userKw, setUserKw] = useState("");
  const [searching, setSearching] = useState(false);
  const searchUser = trpc.yabanClinic.adminSearchUser.useQuery(
    { keyword: userKw },
    { enabled: searching && userKw.trim().length > 0 }
  );

  const appoint = trpc.yabanClinic.adminAppointOwner.useMutation({
    onSuccess: () => {
      toast.success("已任命为院长/股东");
      utils.yabanClinic.adminClinicDetail.invalidate({ clinicId });
      utils.yabanClinic.adminListClinics.invalidate();
      utils.yabanClinic.adminOverview.invalidate();
      setUserKw("");
      setSearching(false);
    },
    onError: (e) => toast.error(e.message || "任命失败"),
  });
  const removeOwner = trpc.yabanClinic.adminRemoveOwner.useMutation({
    onSuccess: () => {
      toast.success("已取消任命");
      utils.yabanClinic.adminClinicDetail.invalidate({ clinicId });
      utils.yabanClinic.adminListClinics.invalidate();
    },
    onError: (e) => toast.error(e.message || "操作失败"),
  });

  const d = detail.data;
  const members = (d?.members || []) as any[];
  const owners = members.filter((m) => m.role_key === "owner");

  const roleLabel = (key: string) => {
    const map: Record<string, string> = {
      owner: "院长/股东",
      doctor: "医生",
      assistant: "护士助理",
      receptionist: "前台",
      finance: "财务",
    };
    return map[key] || key;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-[#F0F4F8] rounded-t-3xl max-h-[88vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="sticky top-0 bg-white px-4 py-3 flex items-center justify-between border-b border-gray-100 rounded-t-3xl">
          <span className="text-base font-bold text-gray-800 truncate pr-2">{d?.clinic?.name || "医院详情"}</span>
          <button onClick={onClose} className="p-1 active:bg-gray-100 rounded-full"><X className="w-5 h-5 text-gray-500" /></button>
        </div>

        {detail.isLoading ? (
          <div className="p-10 flex justify-center"><Loader2 className="w-6 h-6 text-[#2196C8] animate-spin" /></div>
        ) : (
          <div className="p-4 space-y-4">
            {/* 概览 */}
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-white rounded-xl p-3 text-center">
                <div className="text-lg font-bold text-[#0E5A9E]">{members.length}</div>
                <div className="text-[11px] text-gray-400 mt-0.5">员工</div>
              </div>
              <div className="bg-white rounded-xl p-3 text-center">
                <div className="text-lg font-bold text-[#2196C8]">{d?.customerCount ?? 0}</div>
                <div className="text-[11px] text-gray-400 mt-0.5">顾客</div>
              </div>
              <div className="bg-white rounded-xl p-3 text-center">
                <div className="text-base font-bold text-[#16A34A]">{fmtMoney(d?.revenue ?? 0)}</div>
                <div className="text-[11px] text-gray-400 mt-0.5">营业额</div>
              </div>
            </div>

            {/* 任命院长/股东 */}
            <div className="bg-white rounded-2xl p-4">
              <div className="text-sm font-bold text-gray-700 mb-2 flex items-center gap-1">
                <UserPlus className="w-4 h-4 text-[#1E88D6]" /> 任命院长/股东
              </div>
              <div className="flex gap-2">
                <input
                  value={userKw}
                  onChange={(e) => setUserKw(e.target.value)}
                  placeholder="输入用户名 / 姓名 / 手机号"
                  className="flex-1 px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#2196C8]"
                />
                <button
                  onClick={() => setSearching(true)}
                  className="px-4 py-2 rounded-xl bg-[#2196C8] text-white text-sm active:bg-[#1B7FB0]"
                >
                  搜索
                </button>
              </div>
              {searching && (
                <div className="mt-2 space-y-1.5">
                  {searchUser.isFetching ? (
                    <div className="py-3 flex justify-center"><Loader2 className="w-4 h-4 text-[#2196C8] animate-spin" /></div>
                  ) : (searchUser.data || []).length === 0 ? (
                    <div className="text-xs text-gray-400 py-2 text-center">未找到匹配用户</div>
                  ) : (
                    (searchUser.data || []).map((u: any) => (
                      <div key={u.id} className="flex items-center gap-2 py-1.5">
                        <div className="w-8 h-8 rounded-full bg-[#EAF4FE] overflow-hidden flex items-center justify-center shrink-0">
                          {u.avatar ? <img src={u.avatar} className="w-full h-full object-cover" /> : <span className="text-xs text-[#1E88D6]">{(u.name || u.username || "?").slice(0, 1)}</span>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-gray-800 truncate">{u.name || u.username}</div>
                          <div className="text-[11px] text-gray-400 truncate">{u.username}{u.phone ? ` · ${u.phone}` : ""}</div>
                        </div>
                        <button
                          onClick={() => appoint.mutate({ clinicId, userId: u.id })}
                          disabled={appoint.isPending}
                          className="px-3 py-1.5 rounded-lg bg-[#EAF4FE] text-[#1E88D6] text-xs font-medium active:bg-[#d6ebfb] disabled:opacity-60"
                        >
                          任命
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* 成员名册 */}
            <div className="bg-white rounded-2xl p-4">
              <div className="text-sm font-bold text-gray-700 mb-2 flex items-center gap-1">
                <Users className="w-4 h-4 text-[#1E88D6]" /> 成员名册（{members.length}）
              </div>
              {members.length === 0 ? (
                <div className="text-xs text-gray-400 py-4 text-center">暂无成员</div>
              ) : (
                <div className="space-y-2">
                  {members.map((m) => (
                    <div key={m.user_id} className="flex items-center gap-2">
                      <div className="w-9 h-9 rounded-full bg-[#EAF4FE] overflow-hidden flex items-center justify-center shrink-0">
                        {m.avatar ? <img src={m.avatar} className="w-full h-full object-cover" /> : <span className="text-xs text-[#1E88D6]">{(m.name || m.username || "?").slice(0, 1)}</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-gray-800 truncate">{m.name || m.username}</div>
                        <div className="text-[11px] text-gray-400 truncate">{m.username}{m.phone ? ` · ${m.phone}` : ""}</div>
                      </div>
                      <span className={`text-[11px] px-2 py-0.5 rounded-full ${m.role_key === "owner" ? "bg-[#FEF6E6] text-[#D97706]" : "bg-[#EAF4FE] text-[#1E88D6]"}`}>
                        {roleLabel(m.role_key)}
                      </span>
                      {m.role_key === "owner" && owners.length > 0 && (
                        <button
                          onClick={() => {
                            if (window.confirm(`取消「${m.name || m.username}」的院长/股东任命？`)) removeOwner.mutate({ clinicId, userId: m.user_id });
                          }}
                          disabled={removeOwner.isPending}
                          className="text-[11px] text-[#DC2626] active:opacity-60 disabled:opacity-40"
                        >
                          取消
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
