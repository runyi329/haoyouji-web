/**
 * 牙伴齿科管理 - 门诊员工与角色权限
 * 路由：/yaban/settings/roles
 * 入口：我的 -> 设置 -> 门诊员工与角色权限
 * 风格：蓝白风格，移动端优先
 * 功能：
 *   - 我的门诊角色卡片（含创始人标识）
 *   - 门诊员工管理（添加/改角色/移除）
 *   - 权限开关面板：角色 x 功能项 矩阵开关（院长/股东可控）
 *   - 单成员个人权限覆盖
 *   - 角色说明
 * 严禁 Emoji，图标统一 lucide-react
 */
import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import {
  ChevronLeft,
  ShieldCheck,
  UserPlus,
  Users,
  Trash2,
  X,
  Loader2,
  Lock,
  SlidersHorizontal,
  Crown,
  Settings2,
  RotateCcw,
} from "lucide-react";
import { PageTag } from "@/components/PageTag";
import { trpc } from "@/lib/trpc";

// 权限点中文名
const PERM_LABELS: Record<string, string> = {
  patient: "顾客管理",
  patient_create: "顾客建档",
  followup: "随访管理",
  media_view: "影像查看",
  media_upload: "影像上传",
  media_delete: "影像删除",
  schedule: "预约排班",
  shop_order: "商城订单",
  shop_verify: "到店核销",
  finance: "财务营收",
  data_export: "数据导出",
  member_manage: "员工管理",
  clinic_setting: "门诊设置",
};

// 角色标签配色（蓝色系深浅区分）
const ROLE_BADGE: Record<string, string> = {
  founder: "bg-gradient-to-r from-[#C77700] to-[#E0A030] text-white",
  owner: "bg-[#0E5A9E] text-white",
  doctor: "bg-[#1E88D6] text-white",
  assistant: "bg-[#EAF4FE] text-[#1E88D6]",
  receptionist: "bg-[#EAF4FE] text-[#1E88D6]",
  finance: "bg-[#FFF3E0] text-[#C77700]",
};

// owner 不可关闭的权限（与后端一致）
const OWNER_LOCKED = ["member_manage", "clinic_setting"];

export default function YabanRoles() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  const { data: my } = trpc.yabanRole.myMembership.useQuery();
  const { data: roles } = trpc.yabanRole.listRoles.useQuery();
  const canManage = !!my?.canManage;
  const isFounder = !!my?.isFounder;

  const membersQuery = trpc.yabanRole.listMembers.useQuery(undefined, {
    enabled: canManage,
    retry: false,
  });

  // 权限矩阵
  const matrixQuery = trpc.yabanRole.getPermMatrix.useQuery(undefined, {
    enabled: canManage,
    retry: false,
  });

  const [showAdd, setShowAdd] = useState(false);
  const [identifier, setIdentifier] = useState("");
  const [roleKey, setRoleKey] = useState("doctor");
  const [showRoleInfo, setShowRoleInfo] = useState(false);
  const [editingMember, setEditingMember] = useState<any | null>(null);
  const [showPanel, setShowPanel] = useState(false);
  const [permMember, setPermMember] = useState<any | null>(null);

  // 可分配角色（含全部诊所角色）
  const assignableRoles = useMemo(
    () => (roles || []).filter((r: any) => r.role_key !== "founder"),
    [roles]
  );

  const addMember = trpc.yabanRole.addMember.useMutation({
    onSuccess: () => {
      toast.success("已添加门诊员工");
      setShowAdd(false);
      setIdentifier("");
      setRoleKey("doctor");
      utils.yabanRole.listMembers.invalidate();
    },
    onError: (e) => toast.error(e.message || "添加失败"),
  });

  const updateRole = trpc.yabanRole.updateMemberRole.useMutation({
    onSuccess: () => {
      toast.success("角色已更新");
      setEditingMember(null);
      utils.yabanRole.listMembers.invalidate();
    },
    onError: (e) => toast.error(e.message || "更新失败"),
  });

  const removeMember = trpc.yabanRole.removeMember.useMutation({
    onSuccess: () => {
      toast.success("已移除");
      utils.yabanRole.listMembers.invalidate();
    },
    onError: (e) => toast.error(e.message || "移除失败"),
  });

  const setRolePerm = trpc.yabanRole.setRolePerm.useMutation({
    onSuccess: () => {
      utils.yabanRole.getPermMatrix.invalidate();
      utils.yabanRole.listRoles.invalidate();
    },
    onError: (e) => toast.error(e.message || "操作失败"),
  });

  const onAdd = () => {
    if (!identifier.trim()) {
      toast.error("请输入手机号或用户名");
      return;
    }
    addMember.mutate({ identifier: identifier.trim(), roleKey });
  };

  const onRemove = (m: any) => {
    if (!window.confirm(`确认将「${m.name || m.username}」移出门诊？`)) return;
    removeMember.mutate({ memberId: m.id });
  };

  const members = membersQuery.data || [];

  return (
    <div className="min-h-screen bg-[#F0F4F8] pb-24">
      <PageTag code="P317" />

      {/* 头部 */}
      <div className="sticky top-0 z-30 bg-gradient-to-r from-[#2196C8] to-[#3BA9E0] text-white">
        <div className="flex items-center gap-2 px-4 py-3">
          <button onClick={() => navigate("/yaban/settings")} aria-label="返回">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <span className="text-base font-bold flex-1">门诊员工与角色权限</span>
          <button
            onClick={() => setShowRoleInfo(true)}
            className="text-xs bg-white/20 rounded-full px-3 py-1 active:opacity-80"
          >
            角色说明
          </button>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-3">
        {/* 我的角色卡片 */}
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <div className="flex items-center gap-2 mb-2">
            <ShieldCheck className="w-4 h-4 text-[#1E88D6]" />
            <span className="text-sm font-bold text-gray-800">我的门诊角色</span>
          </div>
          {isFounder ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium rounded-full px-2.5 py-1 inline-flex items-center gap-1 bg-gradient-to-r from-[#C77700] to-[#E0A030] text-white">
                <Crown className="w-3 h-3" />
                牙伴创始人
              </span>
              <span className="text-xs text-gray-400">平台级最高权限，可管理所有门诊</span>
            </div>
          ) : my?.member ? (
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`text-xs font-medium rounded-full px-2.5 py-1 ${
                  ROLE_BADGE[my.member.role_key] || "bg-gray-100 text-gray-500"
                }`}
              >
                {roles?.find((r: any) => r.role_key === my.member.role_key)?.name ||
                  my.member.role_key}
              </span>
              <span className="text-xs text-gray-400">
                共 {my.permissions.length} 项权限
              </span>
            </div>
          ) : (
            <p className="text-sm text-gray-400">您还不是该门诊的员工</p>
          )}
          {!isFounder && my?.member && my.permissions.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {my.permissions.map((p: string) => (
                <span
                  key={p}
                  className="text-[11px] text-[#1E88D6] bg-[#EAF4FE] rounded px-2 py-0.5"
                >
                  {PERM_LABELS[p] || p}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* 权限开关面板入口（仅管理者可见） */}
        {canManage && (
          <button
            onClick={() => setShowPanel(true)}
            className="w-full bg-white rounded-2xl shadow-sm p-4 flex items-center gap-3 active:opacity-80"
          >
            <span className="w-9 h-9 rounded-xl bg-[#EAF4FE] flex items-center justify-center shrink-0">
              <SlidersHorizontal className="w-4 h-4 text-[#1E88D6]" />
            </span>
            <span className="flex-1 text-left">
              <span className="block text-sm font-medium text-gray-800">权限开关面板</span>
              <span className="block text-xs text-gray-400 mt-0.5">
                为每个角色逐项开启或关闭功能权限
              </span>
            </span>
            <ChevronLeft className="w-4 h-4 text-gray-300 rotate-180" />
          </button>
        )}

        {/* 成员管理（仅管理者可见） */}
        {canManage ? (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-[#1E88D6]" />
                <span className="text-sm font-bold text-gray-800">
                  门诊员工（{members.length}）
                </span>
              </div>
              <button
                onClick={() => setShowAdd(true)}
                className="flex items-center gap-1 text-xs font-medium text-white bg-[#1E88D6] rounded-full px-3 py-1.5 active:opacity-80"
              >
                <UserPlus className="w-3.5 h-3.5" />
                添加员工
              </button>
            </div>

            {membersQuery.isLoading ? (
              <div className="py-10 flex justify-center">
                <Loader2 className="w-6 h-6 text-[#9CC8EC] animate-spin" />
              </div>
            ) : members.length === 0 ? (
              <div className="py-10 text-center text-sm text-gray-400">暂无门诊员工</div>
            ) : (
              <ul>
                {members.map((m: any) => (
                  <li
                    key={m.id}
                    className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0"
                  >
                    <span className="w-10 h-10 rounded-full bg-[#EAF4FE] overflow-hidden flex items-center justify-center shrink-0">
                      {m.avatar ? (
                        <img src={m.avatar} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-sm text-[#1E88D6] font-bold">
                          {(m.name || m.username || "?").slice(0, 1)}
                        </span>
                      )}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-800 truncate">
                          {m.name || m.username}
                        </span>
                        <span
                          className={`text-[11px] font-medium rounded-full px-2 py-0.5 shrink-0 ${
                            ROLE_BADGE[m.role_key] || "bg-gray-100 text-gray-500"
                          }`}
                        >
                          {m.role_name || m.role_key}
                        </span>
                      </div>
                      <div className="text-xs text-gray-400 truncate">
                        {m.phone || m.username}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => setPermMember(m)}
                        className="text-gray-400 active:text-[#1E88D6] p-1"
                        aria-label="个人权限"
                        title="个人权限"
                      >
                        <Settings2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          setEditingMember(m);
                          setRoleKey(m.role_key);
                        }}
                        className="text-xs text-[#1E88D6] px-2 py-1 active:opacity-70"
                      >
                        改角色
                      </button>
                      <button
                        onClick={() => onRemove(m)}
                        className="text-gray-300 active:text-[#E2553C] p-1"
                        aria-label="移除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm p-6 text-center">
            <Lock className="w-8 h-8 text-[#9CC8EC] mx-auto mb-2" />
            <p className="text-sm text-gray-500">仅门诊院长/股东或牙伴创始人可管理员工与权限</p>
          </div>
        )}
      </div>

      {/* 添加员工弹窗 */}
      {showAdd && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center">
          <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <span className="text-base font-bold text-gray-800">添加门诊员工</span>
              <button onClick={() => setShowAdd(false)} aria-label="关闭">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <label className="block text-xs text-gray-500 mb-1">员工手机号或用户名</label>
            <input
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="请输入已注册的手机号或用户名"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#1E88D6] mb-4"
            />
            <label className="block text-xs text-gray-500 mb-2">分配角色</label>
            <div className="grid grid-cols-2 gap-2 mb-5">
              {assignableRoles.map((r: any) => (
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
              onClick={onAdd}
              disabled={addMember.isPending}
              className="w-full bg-gradient-to-r from-[#2196C8] to-[#3BA9E0] text-white rounded-xl py-3 text-sm font-medium active:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {addMember.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              确认添加
            </button>
          </div>
        </div>
      )}

      {/* 改角色弹窗 */}
      {editingMember && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center">
          <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <span className="text-base font-bold text-gray-800">
                修改「{editingMember.name || editingMember.username}」的角色
              </span>
              <button onClick={() => setEditingMember(null)} aria-label="关闭">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-5">
              {assignableRoles.map((r: any) => (
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
              onClick={() =>
                updateRole.mutate({ memberId: editingMember.id, roleKey })
              }
              disabled={updateRole.isPending}
              className="w-full bg-gradient-to-r from-[#2196C8] to-[#3BA9E0] text-white rounded-xl py-3 text-sm font-medium active:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {updateRole.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              保存
            </button>
          </div>
        </div>
      )}

      {/* 权限开关面板（角色 x 功能项矩阵） */}
      {showPanel && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center">
          <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl p-5 max-h-[88vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-1">
              <span className="text-base font-bold text-gray-800">权限开关面板</span>
              <button onClick={() => setShowPanel(false)} aria-label="关闭">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <p className="text-xs text-gray-400 mb-4">
              为每个角色逐项开启或关闭功能。修改即时生效，仅影响本门诊。
            </p>
            {matrixQuery.isLoading ? (
              <div className="py-10 flex justify-center">
                <Loader2 className="w-6 h-6 text-[#9CC8EC] animate-spin" />
              </div>
            ) : matrixQuery.data ? (
              <div className="space-y-4">
                {matrixQuery.data.roles.map((r: any) => (
                  <div key={r.role_key} className="border border-gray-100 rounded-xl overflow-hidden">
                    <div className="px-3 py-2 bg-[#F6FAFE] flex items-center gap-2">
                      <span
                        className={`text-[11px] font-medium rounded-full px-2 py-0.5 ${
                          ROLE_BADGE[r.role_key] || "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {r.name}
                      </span>
                      <span className="text-[11px] text-gray-400">{r.description}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-2">
                      {matrixQuery.data.perms.map((p: any) => {
                        const on = matrixQuery.data.matrix[r.role_key]?.[p.key];
                        const locked =
                          r.role_key === "owner" && OWNER_LOCKED.includes(p.key);
                        return (
                          <button
                            key={p.key}
                            disabled={locked || setRolePerm.isPending}
                            onClick={() =>
                              setRolePerm.mutate({
                                roleKey: r.role_key,
                                permKey: p.key,
                                enabled: !on,
                              })
                            }
                            className="flex items-center justify-between px-3 py-2.5 border-b border-gray-50 active:bg-gray-50 disabled:opacity-60"
                          >
                            <span className="text-xs text-gray-700">{p.name}</span>
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
      )}

      {/* 单成员个人权限覆盖 */}
      {permMember && (
        <MemberPermSheet member={permMember} onClose={() => setPermMember(null)} />
      )}

      {/* 角色说明弹窗 */}
      {showRoleInfo && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center">
          <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <span className="text-base font-bold text-gray-800">角色与权限说明</span>
              <button onClick={() => setShowRoleInfo(false)} aria-label="关闭">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <div className="mb-4 rounded-xl bg-[#FFF8EE] border border-[#F0E0C0] p-3">
              <div className="flex items-center gap-2 mb-1">
                <Crown className="w-3.5 h-3.5 text-[#C77700]" />
                <span className="text-xs font-bold text-[#C77700]">牙伴创始人</span>
              </div>
              <p className="text-[11px] text-[#8A6A2A]">
                平台级最高权限，可管理所有门诊与数据，由脉动网系统管理员任命。
              </p>
            </div>
            <div className="space-y-3">
              {(roles || []).map((r: any) => (
                <div key={r.role_key} className="border border-gray-100 rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`text-xs font-medium rounded-full px-2 py-0.5 ${
                        ROLE_BADGE[r.role_key] || "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {r.name}
                    </span>
                  </div>
                  {r.description && (
                    <p className="text-xs text-gray-500 mb-2">{r.description}</p>
                  )}
                  <div className="flex flex-wrap gap-1.5">
                    {(r.permissions || []).map((p: string) => (
                      <span
                        key={p}
                        className="text-[11px] text-[#1E88D6] bg-[#EAF4FE] rounded px-2 py-0.5"
                      >
                        {PERM_LABELS[p] || p}
                      </span>
                    ))}
                    {(r.permissions || []).length === 0 && (
                      <span className="text-[11px] text-gray-300">无</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============ 单成员个人权限覆盖弹层 ============
function MemberPermSheet({ member, onClose }: { member: any; onClose: () => void }) {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.yabanRole.getMemberPerms.useQuery({ userId: member.user_id });

  const setMemberPerm = trpc.yabanRole.setMemberPerm.useMutation({
    onSuccess: () => {
      utils.yabanRole.getMemberPerms.invalidate({ userId: member.user_id });
    },
    onError: (e) => toast.error(e.message || "操作失败"),
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center">
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-1">
          <span className="text-base font-bold text-gray-800">
            {member.name || member.username} 的个人权限
          </span>
          <button onClick={onClose} aria-label="关闭">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>
        <p className="text-xs text-gray-400 mb-4">
          单独为该员工开关功能，优先级高于角色设置。带「自定义」标记的项已偏离角色默认。
        </p>
        {isLoading ? (
          <div className="py-10 flex justify-center">
            <Loader2 className="w-6 h-6 text-[#9CC8EC] animate-spin" />
          </div>
        ) : data ? (
          <div className="space-y-1">
            {data.perms.map((p: any) => {
              const on = data.effective[p.key];
              const overridden = p.key in data.override;
              return (
                <div
                  key={p.key}
                  className="flex items-center justify-between px-3 py-2.5 border-b border-gray-50"
                >
                  <span className="flex items-center gap-2">
                    <span className="text-sm text-gray-700">{p.name}</span>
                    {overridden && (
                      <span className="text-[10px] text-[#C77700] bg-[#FFF3E0] rounded px-1.5 py-0.5">
                        自定义
                      </span>
                    )}
                  </span>
                  <span className="flex items-center gap-2">
                    {overridden && (
                      <button
                        onClick={() =>
                          setMemberPerm.mutate({
                            userId: member.user_id,
                            permKey: p.key,
                            enabled: false,
                            reset: true,
                          })
                        }
                        className="text-gray-300 active:text-[#1E88D6] p-1"
                        aria-label="恢复角色默认"
                        title="恢复角色默认"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      disabled={setMemberPerm.isPending}
                      onClick={() =>
                        setMemberPerm.mutate({
                          userId: member.user_id,
                          permKey: p.key,
                          enabled: !on,
                        })
                      }
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
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-10 text-center text-sm text-gray-400">暂无数据</div>
        )}
      </div>
    </div>
  );
}
