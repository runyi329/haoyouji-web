/**
 * 牙伴齿科管理 - 门诊员工与角色权限
 * 路由：/yaban/settings/roles
 * 入口：我的 -> 设置 -> 门诊员工与角色权限
 * 风格：蓝白风格，移动端优先
 * 功能：成员列表（角色标签）、添加员工（手机号/用户名+角色）、改角色、移除、查看角色权限说明
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
} from "lucide-react";
import { PageTag } from "@/components/PageTag";
import { trpc } from "@/lib/trpc";

// 权限点中文名
const PERM_LABELS: Record<string, string> = {
  patient: "患者管理",
  followup: "随访管理",
  schedule: "预约排班",
  shop_order: "商城订单",
  shop_verify: "到店核销",
  finance: "财务营收",
  member_manage: "员工管理",
  clinic_setting: "门诊设置",
};

// 角色标签配色（蓝色系深浅区分）
const ROLE_BADGE: Record<string, string> = {
  owner: "bg-[#0E5A9E] text-white",
  admin: "bg-[#1E88D6] text-white",
  doctor: "bg-[#EAF4FE] text-[#1E88D6]",
  assistant: "bg-[#EAF4FE] text-[#1E88D6]",
  receptionist: "bg-[#EAF4FE] text-[#1E88D6]",
  finance: "bg-[#FFF3E0] text-[#C77700]",
  staff: "bg-gray-100 text-gray-500",
};

export default function YabanRoles() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  const { data: my } = trpc.yabanRole.myMembership.useQuery();
  const { data: roles } = trpc.yabanRole.listRoles.useQuery();
  const canManage = !!my?.canManage;

  const membersQuery = trpc.yabanRole.listMembers.useQuery(undefined, {
    enabled: canManage,
    retry: false,
  });

  const [showAdd, setShowAdd] = useState(false);
  const [identifier, setIdentifier] = useState("");
  const [roleKey, setRoleKey] = useState("doctor");
  const [showRoleInfo, setShowRoleInfo] = useState(false);
  const [editingMember, setEditingMember] = useState<any | null>(null);

  // 可分配角色（排除 owner）
  const assignableRoles = useMemo(
    () => (roles || []).filter((r: any) => r.role_key !== "owner"),
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
          {my?.member ? (
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
          {my?.member && my.permissions.length > 0 && (
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
                    {m.role_key === "owner" ? (
                      <span className="text-[11px] text-gray-300 flex items-center gap-0.5 shrink-0">
                        <Lock className="w-3 h-3" />
                        所有者
                      </span>
                    ) : (
                      <div className="flex items-center gap-1 shrink-0">
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
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm p-6 text-center">
            <Lock className="w-8 h-8 text-[#9CC8EC] mx-auto mb-2" />
            <p className="text-sm text-gray-500">仅门诊所有者或管理员可管理员工与权限</p>
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
