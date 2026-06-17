/**
 * 牙伴齿科管理 - 权限管理
 * 路由：/yaban/settings/roles
 * 入口：我的 -> 设置 -> 权限管理
 * 风格：蓝白风格，移动端优先，严禁 Emoji，图标统一 lucide-react
 *
 * 结构：
 *   - 顶部双 Tab：员工权限 / 顾客权限（让店长知道两边都可设置）
 *   - 多店切换：院长名下多家医院分别设置（按 tenant 隔离）
 *   - 员工 Tab：
 *       · 成员表格总览（行=员工，列=关键权限当前取值）
 *       · 点进某员工 -> 个人权限面板（开关型显示开/关；范围型显示 全部/仅自己/不允许）
 *       · 角色默认模板入口（设定各角色新员工默认权限）
 *       · 添加员工 / 改角色 / 移除
 *   - 顾客 Tab：
 *       · 顾客表格（行=顾客，列=可开通权限）
 *       · 点进某顾客 -> 设置其权限
 *
 * 取值三档：all=全部 / self=仅自己 / none=不允许；toggle 型仅 all(开)/none(关)
 */
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronDown,
  ShieldCheck,
  UserPlus,
  Users,
  UserCircle,
  Trash2,
  X,
  Loader2,
  Lock,
  SlidersHorizontal,
  Crown,
  Settings2,
  RotateCcw,
  Stethoscope,
  HeartPulse,
  ConciergeBell,
  Wallet,
  Search,
  Building2,
} from "lucide-react";
import { PageTag } from "@/components/PageTag";
import { trpc } from "@/lib/trpc";
import { useYabanClinic } from "./useYabanClinic";

type Scope = "all" | "self" | "none";

// 角色胶囊柔光铭牌：key -> 渐变两色 + 光点色
const ROLE_TONE: Record<string, { c1: string; c2: string; dot: string }> = {
  founder: { c1: "#F6C56B", c2: "#D98E1F", dot: "#FFF0CC" },
  co_founder: { c1: "#F3CE8A", c2: "#D89A2E", dot: "#FFF4D6" },
  owner: { c1: "#3D9AE0", c2: "#1366A8", dot: "#E8D6A8" },
  shareholder: { c1: "#62ACE6", c2: "#2C7BBE", dot: "#EAD9AE" },
  doctor: { c1: "#48ABEA", c2: "#1E88D6", dot: "#DCEEFB" },
  nurse: { c1: "#3FC2BF", c2: "#118C8C", dot: "#D9F2F0" },
  assistant: { c1: "#54CFCB", c2: "#159E9E", dot: "#D9F2F0" },
  receptionist: { c1: "#8A82E0", c2: "#5B53C7", dot: "#E8E5FB" },
  finance: { c1: "#4FB678", c2: "#2E8B57", dot: "#DCF2E5" },
};
// 自定义角色统一灰蓝款
const CUSTOM_TONE = { c1: "#8AA2BC", c2: "#56708C", dot: "#E4ECF4" };
// 返回胶囊铭牌的内联样式（内置角色按配色，未知/自定义角色用灰蓝款）
function roleBadgeStyle(roleKey: string): React.CSSProperties {
  const t = ROLE_TONE[roleKey] || CUSTOM_TONE;
  return {
    background: `linear-gradient(165deg, ${t.c1}, ${t.c2})`,
    color: "#fff",
    boxShadow:
      "inset 0 1px 1.5px rgba(255,255,255,.55), inset 0 -2px 4px rgba(0,0,0,.16), 0 2px 4px rgba(20,60,100,.18)",
    textShadow: "0 1px 1px rgba(0,0,0,.18)",
  };
}
function roleDotColor(roleKey: string): string {
  return (ROLE_TONE[roleKey] || CUSTOM_TONE).dot;
}

const OWNER_LOCKED = ["member_manage", "clinic_setting"];

// scope 取值的展示
const SCOPE_LABEL: Record<Scope, string> = { all: "全部", self: "仅自己", none: "不允许" };
const SCOPE_COLOR: Record<Scope, string> = {
  all: "text-[#1E88D6]",
  self: "text-[#C77700]",
  none: "text-gray-300",
};
// toggle 型展示
const TOGGLE_LABEL: Record<"all" | "none", string> = { all: "开", none: "关" };

// 三档循环：toggle 在 all/none 间切；scope 在 all/self/none 间循环
function nextScope(cur: Scope, type: "toggle" | "scope"): Scope {
  if (type === "toggle") return cur === "all" ? "none" : "all";
  if (cur === "all") return "self";
  if (cur === "self") return "none";
  return "all";
}

export default function YabanRoles() {
  const [, navigate] = useLocation();
  const { current } = useYabanClinic();
  const clinicName = current?.name?.trim() || current?.shortName?.trim() || "";

  const { data: my } = trpc.yabanRole.myMembership.useQuery();
  const canManage = !!my?.canManage;

  // 可管理的医院列表
  const clinicsQuery = trpc.yabanRole.myManageableClinics.useQuery(undefined, {
    enabled: canManage,
    retry: false,
  });
  const clinics = clinicsQuery.data || [];
  // 支持通过 URL ?tenant=ID 指定初始医院（创始人后台下钻进入）
  const urlTenantId = (() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      const v = sp.get("tenant");
      return v ? Number(v) : null;
    } catch {
      return null;
    }
  })();
  const [tenantId, setTenantId] = useState<number | null>(null);
  useEffect(() => {
    if (tenantId == null && clinics.length > 0) {
      const fromUrl = urlTenantId != null && clinics.some((c: any) => c.tenantId === urlTenantId) ? urlTenantId : null;
      setTenantId(fromUrl ?? clinics[0].tenantId);
    }
  }, [clinics, tenantId, urlTenantId]);
  const [showClinicPicker, setShowClinicPicker] = useState(false);
  const currentClinic = clinics.find((c: any) => c.tenantId === tenantId);

  const [tab, setTab] = useState<"staff" | "customer">("staff");
  const [showRoleInfo, setShowRoleInfo] = useState(false);

  return (
    <div className="min-h-screen bg-[#F0F4F8] pb-24">
      <PageTag code="P317" />

      {/* 头部 */}
      <div className="sticky top-0 z-30 bg-gradient-to-r from-[#2196C8] to-[#3BA9E0] text-white">
        <div className="flex items-center gap-2 px-4 py-3">
          <button onClick={() => navigate("/yaban/profile")} aria-label="返回">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <div className="flex flex-col flex-1">
            <span className="text-base font-bold leading-tight">权限管理</span>
            {clinicName && <span className="text-[11px] font-normal text-white/80 leading-tight mt-0.5">所属：{clinicName}</span>}
          </div>
          <button
            onClick={() => setShowRoleInfo(true)}
            className="text-xs bg-white/20 rounded-full px-3 py-1 active:opacity-80"
          >
            角色说明
          </button>
        </div>

        {/* 多店切换 */}
        {canManage && clinics.length > 0 && (
          <div className="px-4 pb-2">
            <button
              onClick={() => clinics.length > 1 && setShowClinicPicker(true)}
              className="inline-flex items-center gap-1.5 bg-white/15 rounded-full px-3 py-1.5 text-xs active:opacity-80"
            >
              <Building2 className="w-3.5 h-3.5" />
              <span className="font-medium">{currentClinic?.name || "选择医院"}</span>
              {clinics.length > 1 && <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>
        )}

        {/* 双 Tab */}
        {canManage && (
          <div className="flex px-4">
            {[
              { key: "staff", label: "员工权限" },
              { key: "customer", label: "顾客权限" },
            ].map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key as any)}
                className={`flex-1 py-2.5 text-sm font-medium relative ${
                  tab === t.key ? "text-white" : "text-white/60"
                }`}
              >
                {t.label}
                {tab === t.key && (
                  <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-white rounded-full" />
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-3">
        {!canManage ? (
          <>
            <MyRoleCard my={my} />
            <div className="bg-white rounded-2xl shadow-sm p-6 text-center">
              <Lock className="w-8 h-8 text-[#9CC8EC] mx-auto mb-2" />
              <p className="text-sm text-gray-500">仅门诊院长可管理员工与权限</p>
            </div>
          </>
        ) : tenantId == null ? (
          <div className="py-16 flex justify-center">
            <Loader2 className="w-6 h-6 text-[#9CC8EC] animate-spin" />
          </div>
        ) : tab === "staff" ? (
          <StaffTab tenantId={tenantId} my={my} />
        ) : (
          <CustomerTab tenantId={tenantId} />
        )}
      </div>

      {/* 医院选择 */}
      {showClinicPicker && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center" onClick={() => setShowClinicPicker(false)}>
          <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <span className="text-base font-bold text-gray-800">选择医院</span>
              <button onClick={() => setShowClinicPicker(false)} aria-label="关闭">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <ul className="space-y-2">
              {clinics.map((c: any) => (
                <li key={c.tenantId}>
                  <button
                    onClick={() => {
                      setTenantId(c.tenantId);
                      setShowClinicPicker(false);
                    }}
                    className={`w-full flex items-center gap-2 rounded-xl px-3 py-3 border ${
                      c.tenantId === tenantId
                        ? "border-[#1E88D6] bg-[#EAF4FE]"
                        : "border-gray-200"
                    }`}
                  >
                    <Building2 className="w-4 h-4 text-[#1E88D6]" />
                    <span className="text-sm font-medium text-gray-800">{c.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {showRoleInfo && <RoleInfoSheet onClose={() => setShowRoleInfo(false)} />}
    </div>
  );
}

// ============ 我的角色卡片 ============
function MyRoleCard({ my }: { my: any }) {
  const ROLE_NAME: Record<string, string> = {
    founder: "创始人", co_founder: "创始股东", owner: "院长", shareholder: "股东",
    doctor: "医生", nurse: "护士", assistant: "助理", receptionist: "前台", finance: "财务",
  };
  return (
    <div className="bg-white rounded-2xl shadow-sm p-4">
      <div className="flex items-center gap-2 mb-2">
        <ShieldCheck className="w-4 h-4 text-[#1E88D6]" />
        <span className="text-sm font-bold text-gray-800">我的角色</span>
      </div>
      {(my?.roleBadgeItems?.length || my?.roleBadges?.length) ? (
        <div className="flex flex-wrap items-center gap-2">
          {(my.roleBadgeItems
            ? my.roleBadgeItems
            : my.roleBadges.map((k: string) => ({ key: k, label: ROLE_NAME[k] || k, builtin: !!ROLE_TONE[k] }))
          ).map((it: { key: string; label: string; builtin: boolean }) => (
            <span
              key={it.key}
              className="relative inline-flex items-center justify-center gap-1.5 h-[24px] px-3 rounded-full text-xs font-bold"
              style={roleBadgeStyle(it.builtin ? it.key : "__custom__")}
            >
              <span
                className="w-[5px] h-[5px] rounded-full shrink-0"
                style={{ background: roleDotColor(it.builtin ? it.key : "__custom__"), boxShadow: "0 0 2px rgba(255,255,255,.8)" }}
              />
              {it.label}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-400">您还不是该门诊的员工</p>
      )}
    </div>
  );
}

// ============ 员工权限 Tab ============
function StaffTab({ tenantId, my }: { tenantId: number; my: any }) {
  const utils = trpc.useUtils();
  const matrixQuery = trpc.yabanRole.getStaffMatrix.useQuery({ tenantId }, { retry: false });
  const { data: roles } = trpc.yabanRole.listRoles.useQuery({ tenantId });

  const [showAdd, setShowAdd] = useState(false);
  const [identifier, setIdentifier] = useState("");
  const [roleKey, setRoleKey] = useState("doctor");
  const [editingMember, setEditingMember] = useState<any | null>(null);
  const [showTemplate, setShowTemplate] = useState(false);
  const [showCustomRoles, setShowCustomRoles] = useState(false);
  const [permMember, setPermMember] = useState<any | null>(null);

  const assignableRoles = useMemo(
    () => (roles || []).filter((r: any) => r.role_key !== "founder" && r.role_key !== "co_founder"),
    [roles]
  );

  // 刷新员工列表：同时失效带参/不带参的缓存并强制 refetch，避免添加后不刷新
  const reloadMembers = async () => {
    await Promise.all([
      utils.yabanRole.getStaffMatrix.invalidate(),
      utils.yabanRole.getStaffMatrix.refetch({ tenantId }),
      utils.yabanRole.myMembership.invalidate(),
    ]);
  };
  const addMember = trpc.yabanRole.addMember.useMutation({
    onSuccess: async (res: any) => {
      // 诊断：打印写入 tenant 与列表查询 tenant，便于核对是否同源
      try { console.log("[yaban addMember] saved=", res?.saved, "writeTenant=", res?.tenantId, "listTenant=", tenantId); } catch {}
      toast.success("已添加门诊员工");
      setShowAdd(false);
      setIdentifier("");
      setRoleKey("doctor");
      await reloadMembers();
    },
    onError: (e) => toast.error(e.message || "添加失败"),
  });
  const updateRole = trpc.yabanRole.updateMemberRole.useMutation({
    onSuccess: async () => {
      toast.success("角色已更新");
      setEditingMember(null);
      await reloadMembers();
    },
    onError: (e) => toast.error(e.message || "更新失败"),
  });
  const removeMember = trpc.yabanRole.removeMember.useMutation({
    onSuccess: async () => {
      toast.success("已移除");
      await reloadMembers();
    },
    onError: (e) => toast.error(e.message || "移除失败"),
  });

  const data = matrixQuery.data;
  const members = data?.members || [];
  // 表格展示的关键列（避免过宽，挑选代表性列）
  const KEY_COLS = ["patient", "patient_edit", "media_view", "finance", "data_export"];

  return (
    <>
      <MyRoleCard my={my} />

      {/* 角色默认模板入口 */}
      <button
        onClick={() => setShowTemplate(true)}
        className="w-full bg-white rounded-2xl shadow-sm p-4 flex items-center gap-3 active:opacity-80"
      >
        <span className="w-9 h-9 rounded-xl bg-[#EAF4FE] flex items-center justify-center shrink-0">
          <SlidersHorizontal className="w-4 h-4 text-[#1E88D6]" />
        </span>
        <span className="flex-1 text-left">
          <span className="block text-sm font-medium text-gray-800">角色默认权限模板</span>
          <span className="block text-xs text-gray-400 mt-0.5">
            设定各角色新员工进来时的默认权限
          </span>
        </span>
        <ChevronLeft className="w-4 h-4 text-gray-300 rotate-180" />
      </button>

      {/* 自定义角色管理入口 */}
      <button
        onClick={() => setShowCustomRoles(true)}
        className="w-full bg-white rounded-2xl shadow-sm p-4 flex items-center gap-3 active:opacity-80"
      >
        <span className="w-9 h-9 rounded-xl bg-[#EAF4FE] flex items-center justify-center shrink-0">
          <ShieldCheck className="w-4 h-4 text-[#1E88D6]" />
        </span>
        <span className="flex-1 text-left">
          <span className="block text-sm font-medium text-gray-800">自定义角色</span>
          <span className="block text-xs text-gray-400 mt-0.5">
            在默认角色之外新建专属角色供成员分配
          </span>
        </span>
        <ChevronLeft className="w-4 h-4 text-gray-300 rotate-180" />
      </button>

      {/* 成员表格 */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-[#1E88D6]" />
            <span className="text-sm font-bold text-gray-800">成员列表（{members.length}）</span>
          </div>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1 text-xs font-medium text-white bg-[#1E88D6] rounded-full px-3 py-1.5 active:opacity-80"
          >
            <UserPlus className="w-3.5 h-3.5" />
            添加成员
          </button>
        </div>

        {matrixQuery.isLoading ? (
          <div className="py-10 flex justify-center">
            <Loader2 className="w-6 h-6 text-[#9CC8EC] animate-spin" />
          </div>
        ) : members.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-400">暂无成员</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#F6FAFE] text-[11px] text-gray-500">
                  <th className="sticky left-0 bg-[#F6FAFE] px-3 py-2 font-medium z-10">成员</th>
                  {KEY_COLS.map((k) => {
                    const def = data!.perms.find((p: any) => p.key === k);
                    return (
                      <th key={k} className="px-2 py-2 font-medium text-center whitespace-nowrap">
                        {def?.name}
                      </th>
                    );
                  })}
                  <th className="px-2 py-2 font-medium text-center">操作</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m: any) => (
                  <tr key={m.userId} className="border-t border-gray-50">
                    <td className="sticky left-0 bg-white px-3 py-2.5 z-10">
                      <div className="flex items-center gap-2 min-w-[100px]">
                        <span className="w-8 h-8 rounded-full bg-[#EAF4FE] overflow-hidden flex items-center justify-center shrink-0">
                          {m.avatar ? (
                            <img src={m.avatar} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-xs text-[#1E88D6] font-bold">
                              {(m.name || m.username || "?").slice(0, 1)}
                            </span>
                          )}
                        </span>
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-gray-800 truncate max-w-[72px]">
                            {m.name || m.username}
                          </div>
                          <span
                            className="inline-flex items-center justify-center text-[10px] font-bold rounded-full px-2 py-0.5"
                            style={roleBadgeStyle(ROLE_TONE[m.roleKey] ? m.roleKey : "__custom__")}
                          >
                            {roles?.find((r: any) => r.role_key === m.roleKey)?.name || m.roleKey}
                          </span>
                        </div>
                      </div>
                    </td>
                    {KEY_COLS.map((k) => {
                      const def = data!.perms.find((p: any) => p.key === k);
                      const sc = (m.scopes[k] || "none") as Scope;
                      const txt = def?.type === "toggle" ? TOGGLE_LABEL[sc === "none" ? "none" : "all"] : SCOPE_LABEL[sc];
                      return (
                        <td key={k} className="px-2 py-2.5 text-center">
                          <span className={`text-xs font-medium ${SCOPE_COLOR[sc]}`}>{txt}</span>
                        </td>
                      );
                    })}
                    <td className="px-2 py-2.5 text-center">
                      <button
                        onClick={() => setPermMember(m)}
                        className="text-xs text-[#1E88D6] font-medium active:opacity-70 whitespace-nowrap"
                      >
                        设置
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="px-4 py-2.5 border-t border-gray-50 flex flex-wrap gap-x-4 gap-y-1">
          <span className="text-[11px] text-[#1E88D6]">全部：可操作全院记录</span>
          <span className="text-[11px] text-[#C77700]">仅自己：只能操作本人登记的</span>
          <span className="text-[11px] text-gray-400">不允许：无此权限</span>
        </div>
      </div>

      {/* 添加成员弹窗 */}
      {showAdd && (
        <RoleSelectModal
          title="添加门诊成员"
          roles={assignableRoles}
          roleKey={roleKey}
          setRoleKey={setRoleKey}
          showIdentifier
          identifier={identifier}
          setIdentifier={setIdentifier}
          loading={addMember.isPending}
          onClose={() => setShowAdd(false)}
          onConfirm={(pickedUser?: any) => {
            if (pickedUser && pickedUser.userId != null) {
              // 联想选中：按 userId 精确添加
              addMember.mutate({ tenantId, userId: Number(pickedUser.userId), roleKey });
              return;
            }
            const idv = (identifier || "").trim();
            if (!idv) return toast.error("请选择或输入手机号/用户名");
            addMember.mutate({ tenantId, identifier: idv, roleKey });
          }}
        />
      )}

      {/* 改角色弹窗 */}
      {editingMember && (
        <RoleSelectModal
          title={`修改「${editingMember.name || editingMember.username}」的角色`}
          roles={assignableRoles}
          roleKey={roleKey}
          setRoleKey={setRoleKey}
          loading={updateRole.isPending}
          onClose={() => setEditingMember(null)}
          onConfirm={() => updateRole.mutate({ tenantId, memberId: editingMember.memberId, roleKey })}
        />
      )}

      {/* 角色默认模板 */}
      {showTemplate && <RoleTemplateSheet tenantId={tenantId} onClose={() => setShowTemplate(false)} />}

      {/* 自定义角色管理 */}
      {showCustomRoles && <CustomRolesSheet tenantId={tenantId} onClose={() => setShowCustomRoles(false)} />}

      {/* 个人权限面板 */}
      {permMember && (
        <MemberPermSheet
          tenantId={tenantId}
          member={permMember}
          onChangeRole={() => {
            setRoleKey(permMember.roleKey);
            setEditingMember(permMember);
            setPermMember(null);
          }}
          onRemove={() => {
            if (!window.confirm(`确认将「${permMember.name || permMember.username}」移出门诊？`)) return;
            removeMember.mutate({ tenantId, memberId: permMember.memberId });
            setPermMember(null);
          }}
          onClose={() => setPermMember(null)}
        />
      )}
    </>
  );
}

// ============ 角色选择弹窗（添加/改角色复用） ============
function RoleSelectModal({
  title, roles, roleKey, setRoleKey, showIdentifier, identifier, setIdentifier, loading, onClose, onConfirm,
}: {
  title: string;
  roles: any[];
  roleKey: string;
  setRoleKey: (v: string) => void;
  showIdentifier?: boolean;
  identifier?: string;
  setIdentifier?: (v: string) => void;
  loading: boolean;
  onClose: () => void;
  onConfirm: (pickedUser?: any) => void;
}) {
  // 联想搜索（仅添加员工时启用）
  const [picked, setPicked] = useState<any | null>(null);
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced((identifier || "").trim()), 300);
    return () => clearTimeout(t);
  }, [identifier]);
  const searchQuery = trpc.yabanRole.searchUsers.useQuery(
    { keyword: debounced },
    { enabled: !!showIdentifier && debounced.length >= 1 && !picked, staleTime: 10000 }
  );
  const results = (searchQuery.data as any[]) || [];

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center">
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <span className="text-base font-bold text-gray-800">{title}</span>
          <button onClick={onClose} aria-label="关闭">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>
        {showIdentifier && (
          <>
            <label className="block text-xs text-gray-500 mb-1">成员手机号或用户名</label>
            {picked ? (
              <div className="flex items-center gap-3 border border-[#1E88D6] bg-[#EAF4FE] rounded-xl px-3 py-2.5 mb-4">
                {picked.avatar ? (
                  <img src={picked.avatar} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-[#1E88D6] text-white flex items-center justify-center flex-shrink-0">
                    <UserCircle className="w-5 h-5" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-800 truncate">{picked.name}</div>
                  <div className="text-xs text-gray-500 truncate">
                    {picked.phone || picked.username || ""}
                  </div>
                </div>
                <button
                  onClick={() => { setPicked(null); setIdentifier?.(""); }}
                  className="text-xs text-[#1E88D6] flex-shrink-0"
                >
                  重选
                </button>
              </div>
            ) : (
              <div className="relative mb-4">
                <div className="flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2.5 focus-within:border-[#1E88D6]">
                  <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <input
                    value={identifier}
                    onChange={(e) => setIdentifier?.(e.target.value)}
                    placeholder="输入手机号、用户名或姓名搜索成员"
                    className="flex-1 text-sm outline-none bg-transparent"
                  />
                  {searchQuery.isFetching && <Loader2 className="w-4 h-4 text-gray-300 animate-spin flex-shrink-0" />}
                </div>
                {debounced.length >= 1 && (
                  <div className="absolute left-0 right-0 mt-1 bg-white border border-gray-100 rounded-xl shadow-lg max-h-60 overflow-y-auto z-10">
                    {searchQuery.isFetching && results.length === 0 && (
                      <div className="px-3 py-3 text-xs text-gray-400 text-center">搜索中…</div>
                    )}
                    {!searchQuery.isFetching && results.length === 0 && (
                      <div className="px-3 py-3 text-xs text-gray-400 text-center">未找到匹配的脉动网用户</div>
                    )}
                    {results.map((u) => (
                      <button
                        key={u.userId}
                        onClick={() => {
                          setPicked(u);
                          setIdentifier?.(u.phone || u.username || "");
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 text-left"
                      >
                        {u.avatar ? (
                          <img src={u.avatar} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-gray-200 text-gray-500 flex items-center justify-center flex-shrink-0">
                            <UserCircle className="w-5 h-5" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-800 truncate">{u.name}</div>
                          <div className="text-xs text-gray-400 truncate">
                            {[u.phone, u.username].filter(Boolean).join(" · ") || "脉动网用户"}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
        <label className="block text-xs text-gray-500 mb-2">分配角色</label>
        <div className="grid grid-cols-2 gap-2 mb-5">
          {roles.map((r: any) => (
            <button
              key={r.role_key}
              onClick={() => setRoleKey(r.role_key)}
              className={`text-sm rounded-xl py-2.5 border transition-colors ${
                roleKey === r.role_key
                  ? "border-[#1E88D6] bg-[#EAF4FE] text-[#1E88D6] font-medium"
                  : "border-gray-200 text-gray-600"
              }`}
            >
              {r.name}
            </button>
          ))}
        </div>
        <button
          onClick={() => onConfirm(picked || undefined)}
          disabled={loading}
          className="w-full bg-gradient-to-r from-[#2196C8] to-[#3BA9E0] text-white rounded-xl py-3 text-sm font-medium active:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          确认
        </button>
      </div>
    </div>
  );
}

// ============ 三档/开关 控件 ============
function ScopeControl({
  type, value, onChange, disabled,
}: {
  type: "toggle" | "scope";
  value: Scope;
  onChange: (v: Scope) => void;
  disabled?: boolean;
}) {
  if (type === "toggle") {
    const on = value !== "none";
    return (
      <button
        disabled={disabled}
        onClick={() => onChange(on ? "none" : "all")}
        className="disabled:opacity-60"
        aria-label="切换"
      >
        <span
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
            on ? "bg-[#1E88D6]" : "bg-gray-200"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              on ? "translate-x-4" : "translate-x-0.5"
            }`}
          />
        </span>
      </button>
    );
  }
  // scope 三档：分段控件
  const opts: Scope[] = ["all", "self", "none"];
  return (
    <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
      {opts.map((o) => (
        <button
          key={o}
          disabled={disabled}
          onClick={() => onChange(o)}
          className={`text-[11px] px-2 py-1 transition-colors disabled:opacity-60 ${
            value === o
              ? o === "all"
                ? "bg-[#1E88D6] text-white"
                : o === "self"
                ? "bg-[#C77700] text-white"
                : "bg-gray-400 text-white"
              : "bg-white text-gray-500"
          }`}
        >
          {SCOPE_LABEL[o]}
        </button>
      ))}
    </div>
  );
}

// ============ 角色默认模板设置弹层 ============
function RoleTemplateSheet({ tenantId, onClose }: { tenantId: number; onClose: () => void }) {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.yabanRole.getRoleTemplateMatrix.useQuery({ tenantId }, { retry: false });
  const setRolePerm = trpc.yabanRole.setRolePerm.useMutation({
    onSuccess: () => {
      utils.yabanRole.getRoleTemplateMatrix.invalidate({ tenantId });
      utils.yabanRole.getStaffMatrix.invalidate({ tenantId });
      utils.yabanRole.listRoles.invalidate();
    },
    onError: (e) => toast.error(e.message || "操作失败"),
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center">
      <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl p-5 max-h-[88vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-1">
          <span className="text-base font-bold text-gray-800">角色默认权限模板</span>
          <button onClick={onClose} aria-label="关闭">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>
        <p className="text-xs text-gray-400 mb-4">
          设定每个角色的默认权限，新员工按此初始化。个人可在其上单独定制覆盖。
        </p>
        {isLoading ? (
          <div className="py-10 flex justify-center">
            <Loader2 className="w-6 h-6 text-[#9CC8EC] animate-spin" />
          </div>
        ) : data ? (
          <div className="space-y-4">
            {data.roles.map((r: any) => (
              <div key={r.role_key} className="border border-gray-100 rounded-xl overflow-hidden">
                <div className="px-3 py-2 bg-[#F6FAFE] flex items-center gap-2">
                  <span
                    className="inline-flex items-center justify-center text-[11px] font-bold rounded-full px-2.5 py-0.5"
                    style={roleBadgeStyle(ROLE_TONE[r.role_key] ? r.role_key : "__custom__")}
                  >
                    {r.name}
                  </span>
                  {r.is_builtin === 0 && (
                    <span className="text-[10px] text-[#1E88D6] bg-[#EAF4FE] rounded px-1.5 py-0.5">自定义</span>
                  )}
                  <span className="text-[11px] text-gray-400 truncate">{r.description}</span>
                </div>
                <div>
                  {data.perms.map((p: any) => {
                    const sc = (data.matrix[r.role_key]?.[p.key] || "none") as Scope;
                    const locked = r.role_key === "owner" && OWNER_LOCKED.includes(p.key);
                    return (
                      <div
                        key={p.key}
                        className="flex items-center justify-between px-3 py-2 border-b border-gray-50 last:border-0"
                      >
                        <span className="text-xs text-gray-700">
                          {p.name}
                          <span className="text-[10px] text-gray-300 ml-1">
                            {p.type === "scope" ? "范围" : "开关"}
                          </span>
                        </span>
                        <ScopeControl
                          type={p.type}
                          value={sc}
                          disabled={locked || setRolePerm.isPending}
                          onChange={(v) =>
                            setRolePerm.mutate({ tenantId, roleKey: r.role_key, permKey: p.key, scope: v })
                          }
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-10 text-center text-sm text-gray-400">暂无数据</div>
        )}
      </div>
    </div>
  );
}

// ============ 单成员个人权限面板 ============
function MemberPermSheet({
  tenantId, member, onChangeRole, onRemove, onClose,
}: {
  tenantId: number;
  member: any;
  onChangeRole: () => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.yabanRole.getMemberPerms.useQuery({ tenantId, userId: member.userId }, { retry: false });
  const setMemberPerm = trpc.yabanRole.setMemberPerm.useMutation({
    onSuccess: () => {
      utils.yabanRole.getMemberPerms.invalidate({ tenantId, userId: member.userId });
      utils.yabanRole.getStaffMatrix.invalidate({ tenantId });
    },
    onError: (e) => toast.error(e.message || "操作失败"),
  });

  // 按分组归类
  const grouped = useMemo(() => {
    const g: Record<string, any[]> = {};
    (data?.perms || []).forEach((p: any) => {
      (g[p.group] = g[p.group] || []).push(p);
    });
    return g;
  }, [data]);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center">
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 max-h-[88vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-1">
          <span className="text-base font-bold text-gray-800 flex items-center gap-2">
            {member.name || member.username} 的权限
            <span
              className="inline-flex items-center justify-center text-[10px] font-bold rounded-full px-2 py-0.5"
              style={roleBadgeStyle(ROLE_TONE[member.roleKey] ? member.roleKey : "__custom__")}
            >
              {member.roleName || member.roleKey}
            </span>
          </span>
          <button onClick={onClose} aria-label="关闭">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>
        <p className="text-xs text-gray-400 mb-3">
          单独为该员工设置，优先级高于角色默认。带「定制」的项已偏离角色默认。
        </p>

        <div className="flex gap-2 mb-4">
          <button
            onClick={onChangeRole}
            className="flex-1 text-xs text-[#1E88D6] border border-[#CFE3F5] rounded-lg py-2 active:bg-[#EAF4FE]"
          >
            修改角色
          </button>
          <button
            onClick={onRemove}
            className="flex-1 text-xs text-[#E2553C] border border-[#F3D2CB] rounded-lg py-2 active:bg-[#FCEEEB]"
          >
            移出门诊
          </button>
        </div>

        {isLoading ? (
          <div className="py-10 flex justify-center">
            <Loader2 className="w-6 h-6 text-[#9CC8EC] animate-spin" />
          </div>
        ) : data ? (
          <div className="space-y-4">
            {Object.entries(grouped).map(([group, perms]) => (
              <div key={group} className="border border-gray-100 rounded-xl overflow-hidden">
                <div className="px-3 py-2 bg-[#F6FAFE] text-xs font-medium text-gray-600">{group}</div>
                <div>
                  {perms.map((p: any) => {
                    const eff = (data.effective[p.key] || "none") as Scope;
                    const customized = data.customized.includes(p.key);
                    return (
                      <div
                        key={p.key}
                        className="flex items-center justify-between px-3 py-2.5 border-b border-gray-50 last:border-0"
                      >
                        <span className="flex items-center gap-1.5 min-w-0">
                          <span className="text-xs text-gray-700">{p.name}</span>
                          {customized && (
                            <span className="text-[10px] text-[#C77700] bg-[#FFF3E0] rounded px-1 py-0.5 shrink-0">
                              定制
                            </span>
                          )}
                        </span>
                        <span className="flex items-center gap-2 shrink-0">
                          {customized && (
                            <button
                              onClick={() =>
                                setMemberPerm.mutate({ tenantId, userId: member.userId, permKey: p.key, reset: true })
                              }
                              className="text-gray-300 active:text-[#1E88D6] p-1"
                              aria-label="恢复角色默认"
                              title="恢复角色默认"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <ScopeControl
                            type={p.type}
                            value={eff}
                            disabled={setMemberPerm.isPending}
                            onChange={(v) =>
                              setMemberPerm.mutate({ tenantId, userId: member.userId, permKey: p.key, scope: v })
                            }
                          />
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-10 text-center text-sm text-gray-400">暂无数据</div>
        )}
      </div>
    </div>
  );
}

// ============ 自定义角色管理弹层 ============
function CustomRolesSheet({ tenantId, onClose }: { tenantId: number; onClose: () => void }) {
  const utils = trpc.useUtils();
  const rolesQuery = trpc.yabanRole.listRoles.useQuery({ tenantId });
  const roles = rolesQuery.data || [];
  const customRoles = useMemo(() => roles.filter((r: any) => r.is_builtin === 0), [roles]);

  const [editing, setEditing] = useState<any | null>(null); // 正在编辑的角色（null=未打开编辑器）
  const [creating, setCreating] = useState(false);

  const refresh = async () => {
    await Promise.all([
      utils.yabanRole.listRoles.invalidate(),
      utils.yabanRole.getStaffMatrix.invalidate({ tenantId }),
      utils.yabanRole.getRoleTemplateMatrix.invalidate({ tenantId }),
    ]);
  };

  const deleteRole = trpc.yabanRole.deleteCustomRole.useMutation({
    onSuccess: async () => {
      toast.success("已删除角色");
      await refresh();
    },
    onError: (e) => toast.error(e.message || "删除失败"),
  });

  // 打开编辑/新建器时不渲染列表
  if (creating) {
    return (
      <CustomRoleEditor
        tenantId={tenantId}
        role={null}
        onClose={() => setCreating(false)}
        onSaved={async () => { setCreating(false); await refresh(); }}
      />
    );
  }
  if (editing) {
    return (
      <CustomRoleEditor
        tenantId={tenantId}
        role={editing}
        onClose={() => setEditing(null)}
        onSaved={async () => { setEditing(null); await refresh(); }}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center">
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 max-h-[88vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-1">
          <span className="text-base font-bold text-gray-800">自定义角色</span>
          <button onClick={onClose} aria-label="关闭">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>
        <p className="text-xs text-gray-400 mb-4">
          在默认角色之外新建专属角色。新建后可在「添加成员」中分配。
        </p>

        {rolesQuery.isLoading ? (
          <div className="py-10 flex justify-center">
            <Loader2 className="w-6 h-6 text-[#9CC8EC] animate-spin" />
          </div>
        ) : (
          <div className="space-y-2 mb-4">
            {customRoles.length === 0 ? (
              <div className="py-8 text-center text-sm text-gray-400">暂无自定义角色</div>
            ) : (
              customRoles.map((r: any) => (
                <div
                  key={r.role_key}
                  className="flex items-center gap-2 border border-gray-100 rounded-xl px-3 py-3"
                >
                  <span className="w-8 h-8 rounded-lg bg-[#EAF4FE] flex items-center justify-center shrink-0">
                    <ShieldCheck className="w-4 h-4 text-[#1E88D6]" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-800 truncate">{r.name}</div>
                    <div className="text-xs text-gray-400 truncate">{r.description || "未填写描述"}</div>
                  </div>
                  <button
                    onClick={() => setEditing(r)}
                    className="text-xs text-[#1E88D6] px-2 py-1 active:opacity-70"
                  >
                    编辑
                  </button>
                  <button
                    onClick={() => {
                      if (!window.confirm(`确认删除角色「${r.name}」？`)) return;
                      deleteRole.mutate({ tenantId, roleKey: r.role_key });
                    }}
                    className="text-gray-300 active:text-[#E2553C] p-1"
                    aria-label="删除"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        <button
          onClick={() => setCreating(true)}
          className="w-full bg-gradient-to-r from-[#2196C8] to-[#3BA9E0] text-white rounded-xl py-3 text-sm font-medium active:opacity-90 flex items-center justify-center gap-2"
        >
          <UserPlus className="w-4 h-4" />
          新建自定义角色
        </button>
      </div>
    </div>
  );
}

// ============ 自定义角色新建/编辑器 ============
function CustomRoleEditor({
  tenantId, role, onClose, onSaved,
}: {
  tenantId: number;
  role: any | null; // null=新建
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!role;
  const { data: permDefs } = trpc.yabanRole.listPermDefs.useQuery();
  const staffPerms = (permDefs?.staff as any[]) || [];

  const [name, setName] = useState(role?.name || "");
  const [description, setDescription] = useState(role?.description || "");
  // 权限模板：perm_key -> scope（编辑时从 role.scopes 初始化，新建时默认 none）
  const [perms, setPerms] = useState<Record<string, Scope>>(() => {
    const init: Record<string, Scope> = {};
    for (const p of staffPerms) init[p.key] = (role?.scopes?.[p.key] || "none") as Scope;
    return init;
  });
  // permDefs 加载后补齐初始值
  useEffect(() => {
    if (staffPerms.length === 0) return;
    setPerms((prev) => {
      const next = { ...prev };
      for (const p of staffPerms) {
        if (next[p.key] == null) next[p.key] = (role?.scopes?.[p.key] || "none") as Scope;
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permDefs]);

  const grouped = useMemo(() => {
    const g: Record<string, any[]> = {};
    staffPerms.forEach((p) => { (g[p.group] = g[p.group] || []).push(p); });
    return g;
  }, [staffPerms]);

  const createRole = trpc.yabanRole.createCustomRole.useMutation({
    onSuccess: () => { toast.success("已创建角色"); onSaved(); },
    onError: (e) => toast.error(e.message || "创建失败"),
  });
  const updateRole = trpc.yabanRole.updateCustomRole.useMutation({
    onError: (e) => toast.error(e.message || "保存失败"),
  });
  const setRolePerm = trpc.yabanRole.setRolePerm.useMutation();

  const [saving, setSaving] = useState(false);
  const handleSave = async () => {
    const nm = name.trim();
    if (!nm) return toast.error("请输入角色名称");
    setSaving(true);
    try {
      if (!isEdit) {
        await createRole.mutateAsync({ tenantId, name: nm, description: description.trim(), perms });
      } else {
        // 先改名称/描述
        await updateRole.mutateAsync({ tenantId, roleKey: role.role_key, name: nm, description: description.trim() });
        // 再逐项保存变动的权限
        for (const p of staffPerms) {
          const cur = perms[p.key] || "none";
          const old = (role.scopes?.[p.key] || "none") as Scope;
          if (cur !== old) {
            await setRolePerm.mutateAsync({ tenantId, roleKey: role.role_key, permKey: p.key, scope: cur });
          }
        }
        toast.success("已保存");
      }
      onSaved();
    } catch (e) {
      // 错误已在 onError 提示
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center">
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <span className="text-base font-bold text-gray-800">{isEdit ? "编辑自定义角色" : "新建自定义角色"}</span>
          <button onClick={onClose} aria-label="关闭">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <label className="block text-xs text-gray-500 mb-1">角色名称</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例如：咨询师、店长助理"
          maxLength={20}
          className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 mb-3 outline-none focus:border-[#1E88D6]"
        />
        <label className="block text-xs text-gray-500 mb-1">角色描述（选填）</label>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="简要说明该角色职责"
          maxLength={100}
          className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 mb-4 outline-none focus:border-[#1E88D6]"
        />

        <label className="block text-xs text-gray-500 mb-2">权限设置</label>
        <div className="space-y-4 mb-5">
          {Object.entries(grouped).map(([group, ps]) => (
            <div key={group} className="border border-gray-100 rounded-xl overflow-hidden">
              <div className="px-3 py-2 bg-[#F6FAFE] text-xs font-medium text-gray-600">{group}</div>
              <div>
                {ps.map((p: any) => (
                  <div
                    key={p.key}
                    className="flex items-center justify-between px-3 py-2.5 border-b border-gray-50 last:border-0"
                  >
                    <span className="text-xs text-gray-700">
                      {p.name}
                      <span className="text-[10px] text-gray-300 ml-1">{p.type === "scope" ? "范围" : "开关"}</span>
                    </span>
                    <ScopeControl
                      type={p.type}
                      value={(perms[p.key] || "none") as Scope}
                      onChange={(v) => setPerms((prev) => ({ ...prev, [p.key]: v }))}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-gradient-to-r from-[#2196C8] to-[#3BA9E0] text-white rounded-xl py-3 text-sm font-medium active:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          {isEdit ? "保存" : "创建角色"}
        </button>
      </div>
    </div>
  );
}

// ============ 顾客权限 Tab ============
function CustomerTab({ tenantId }: { tenantId: number }) {
  const [keyword, setKeyword] = useState("");
  const [search, setSearch] = useState("");
  const customerQuery = trpc.yabanRole.getCustomerMatrix.useQuery(
    { tenantId, keyword: search, limit: 50 },
    { retry: false }
  );
  const [permCustomer, setPermCustomer] = useState<any | null>(null);

  const data = customerQuery.data;
  const customers = data?.customers || [];

  return (
    <>
      <div className="bg-white rounded-2xl shadow-sm p-3">
        <div className="flex items-center gap-2 bg-[#F6FAFE] rounded-xl px-3 py-2">
          <Search className="w-4 h-4 text-gray-400" />
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && setSearch(keyword.trim())}
            placeholder="搜索顾客姓名或手机号"
            className="flex-1 bg-transparent text-sm outline-none"
          />
          <button
            onClick={() => setSearch(keyword.trim())}
            className="text-xs text-[#1E88D6] font-medium"
          >
            搜索
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
          <UserCircle className="w-4 h-4 text-[#1E88D6]" />
          <span className="text-sm font-bold text-gray-800">顾客（{customers.length}）</span>
        </div>
        {customerQuery.isLoading ? (
          <div className="py-10 flex justify-center">
            <Loader2 className="w-6 h-6 text-[#9CC8EC] animate-spin" />
          </div>
        ) : customers.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-400">暂无顾客</div>
        ) : (
          <ul>
            {customers.map((c: any) => {
              const onCount = data!.perms.filter((p: any) => (c.scopes[p.key] || "none") !== "none").length;
              return (
                <li
                  key={c.userId}
                  className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0"
                >
                  <span className="w-10 h-10 rounded-full bg-[#EAF4FE] overflow-hidden flex items-center justify-center shrink-0">
                    {c.avatar ? (
                      <img src={c.avatar} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-sm text-[#1E88D6] font-bold">
                        {(c.name || "?").slice(0, 1)}
                      </span>
                    )}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-800 truncate">{c.name || "未命名"}</div>
                    <div className="text-xs text-gray-400 truncate">{c.phone || ""}</div>
                  </div>
                  <span className="text-xs text-gray-400 mr-1">已开通 {onCount} 项</span>
                  <button
                    onClick={() => setPermCustomer(c)}
                    className="text-xs text-[#1E88D6] font-medium active:opacity-70"
                  >
                    设置
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {permCustomer && (
        <CustomerPermSheet
          tenantId={tenantId}
          customer={permCustomer}
          perms={data?.perms || []}
          onClose={() => setPermCustomer(null)}
        />
      )}
    </>
  );
}

// ============ 顾客权限设置弹层 ============
function CustomerPermSheet({
  tenantId, customer, perms, onClose,
}: {
  tenantId: number;
  customer: any;
  perms: any[];
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const [local, setLocal] = useState<Record<string, Scope>>(customer.scopes || {});
  const setCustomerPerm = trpc.yabanRole.setCustomerPerm.useMutation({
    onSuccess: () => utils.yabanRole.getCustomerMatrix.invalidate({ tenantId }),
    onError: (e) => toast.error(e.message || "操作失败"),
  });

  const grouped = useMemo(() => {
    const g: Record<string, any[]> = {};
    perms.forEach((p: any) => {
      (g[p.group] = g[p.group] || []).push(p);
    });
    return g;
  }, [perms]);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center">
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 max-h-[88vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-1">
          <span className="text-base font-bold text-gray-800">{customer.name || "顾客"} 的权限</span>
          <button onClick={onClose} aria-label="关闭">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>
        <p className="text-xs text-gray-400 mb-4">为该顾客单独开通或关闭可见功能，仅影响本门诊。</p>
        <div className="space-y-4">
          {Object.entries(grouped).map(([group, gperms]) => (
            <div key={group} className="border border-gray-100 rounded-xl overflow-hidden">
              <div className="px-3 py-2 bg-[#F6FAFE] text-xs font-medium text-gray-600">{group}</div>
              <div>
                {gperms.map((p: any) => {
                  const val = (local[p.key] || "none") as Scope;
                  const on = val !== "none";
                  return (
                    <div
                      key={p.key}
                      className="flex items-center justify-between px-3 py-2.5 border-b border-gray-50 last:border-0"
                    >
                      <span className="text-xs text-gray-700">{p.name}</span>
                      <button
                        disabled={setCustomerPerm.isPending}
                        onClick={() => {
                          const next: Scope = on ? "none" : "all";
                          setLocal((s) => ({ ...s, [p.key]: next }));
                          setCustomerPerm.mutate({ tenantId, userId: customer.userId, permKey: p.key, scope: next });
                        }}
                        className="disabled:opacity-60"
                      >
                        <span
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                            on ? "bg-[#1E88D6]" : "bg-gray-200"
                          }`}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                              on ? "translate-x-4" : "translate-x-0.5"
                            }`}
                          />
                        </span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============ 角色说明弹层 ============
function RoleInfoSheet({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center">
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <span className="text-base font-bold text-gray-800">角色说明</span>
          <button onClick={onClose} aria-label="关闭">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>
        <div className="flex flex-col items-center">
          <div className="flex items-center gap-3">
            <div className="w-32 rounded-2xl bg-gradient-to-b from-[#1E88D6] to-[#0E5A9E] text-white shadow-sm px-4 py-3 flex flex-col items-center">
              <Crown className="w-6 h-6 mb-1" />
              <span className="text-base font-bold tracking-wide">院长</span>
            </div>
            <div className="w-32 rounded-2xl bg-gradient-to-b from-[#E0A030] to-[#C77700] text-white shadow-sm px-4 py-3 flex flex-col items-center">
              <Crown className="w-6 h-6 mb-1" />
              <span className="text-base font-bold tracking-wide">股东</span>
            </div>
          </div>
          <p className="text-[11px] text-gray-400 mt-2">院长管运营 · 股东看数据</p>
          <div className="w-px h-5 bg-[#CFE3F5]" />
          <div className="w-[80%] h-px bg-[#CFE3F5]" />
        </div>
        <div className="grid grid-cols-2 gap-3 mt-3">
          {[
            { key: "doctor", name: "医生", Icon: Stethoscope },
            { key: "nurse", name: "护士", Icon: HeartPulse },
            { key: "assistant", name: "助理", Icon: HeartPulse },
            { key: "receptionist", name: "前台", Icon: ConciergeBell },
            { key: "finance", name: "财务", Icon: Wallet },
          ].map(({ key, name, Icon }) => (
            <div
              key={key}
              className="rounded-2xl bg-[#EAF4FE] border border-[#DCEBFB] px-3 py-4 flex flex-col items-center"
            >
              <Icon className="w-6 h-6 text-[#1E88D6] mb-1.5" />
              <span className="text-sm font-medium text-[#1E5C92]">{name}</span>
            </div>
          ))}
        </div>
        <div className="mt-5 rounded-xl bg-[#F6F9FC] border border-[#E6EEF6] p-3.5 space-y-2">
          <p className="text-xs text-gray-600 leading-relaxed">
            角色决定了一个人进来时的默认权限，并作为身份标识显示。真正能做什么，以「权限管理」里逐人逐项的设置为准。
          </p>
          <p className="text-xs text-gray-600 leading-relaxed">
            取值分三档：全部（可操作全院记录）、仅自己（只能操作本人登记的）、不允许（无此权限）。院长可为每位员工与顾客单独定制。
          </p>
        </div>
      </div>
    </div>
  );
}
