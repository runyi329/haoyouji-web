import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Loader2, ChevronLeft, PawPrint, Calendar, MapPin, Settings, ChevronRight, Search, Plus, UserCog, Cpu, X, Check, Trash2, Edit2 } from "lucide-react";
import { centerToast } from "@/components/ui/center-toast";

// 插画资源 CDN URL
const BANNER_IMG = "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/pet-platform/banner-teddy-cat-h2.webp";
const EMPTY_IMG = "https://d2xsxph8kpxj0f.cloudfront.net/310519663279996243/ivirPqo3t2YCdg32vqitTK/empty_state-Hz3oJbgUxXxExN3fGavc6E.webp";
const MACHINE_IMG = "https://d2xsxph8kpxj0f.cloudfront.net/310519663279996243/ivirPqo3t2YCdg32vqitTK/machine_icon-fj8GBGpdbCSJhZ7uRs76kF.webp";

// PPT 暖棕色系调色板
const COLORS = {
  bg: "#F5EFE6",         // 米白背景
  primary: "#B85C38",    // 砖红主色
  dark: "#5C3D1E",       // 深棕文字
  green: "#4A6741",      // 墨绿辅助
  card: "#FFFFFF",       // 卡片白
  muted: "#9C7E6A",      // 暖棕次要文字
  border: "#E8D9C8",     // 暖棕边框
  lightBg: "#FBF6F0",    // 浅米色
};

// 角色中文名映射
const ROLE_LABELS: Record<string, string> = {
  manufacturer: "厂家",
  investor: "投资人",
  promoter: "地推",
  petshop: "宠物店",
  admin: "管理员",
};

// 角色徽章颜色
const ROLE_BADGE: Record<string, { bg: string; text: string }> = {
  manufacturer: { bg: "#EBF3FF", text: "#2563EB" },
  investor: { bg: "#FEF3C7", text: "#92400E" },
  promoter: { bg: "#ECFDF5", text: "#065F46" },
  petshop: { bg: "#F5F3FF", text: "#5B21B6" },
  admin: { bg: "#FEE2E2", text: "#991B1B" },
};

// 机器状态
const STATUS_LABELS: Record<string, { label: string; color: string; dot: string }> = {
  active: { label: "运行中", color: "#4A6741", dot: "#4A6741" },
  inactive: { label: "未启用", color: "#9C7E6A", dot: "#C4A882" },
  maintenance: { label: "维护中", color: "#B85C38", dot: "#B85C38" },
};

// ========== 管理员：成员管理面板 ==========
function AdminMemberPanel({ onClose }: { onClose: () => void }) {
  const [keyword, setKeyword] = useState("");
  const [searchKw, setSearchKw] = useState("");
  const [editUser, setEditUser] = useState<any>(null);
  const [editRole, setEditRole] = useState<string>("");
  const [editIsAdmin, setEditIsAdmin] = useState(false);
  const [editRemark, setEditRemark] = useState("");

  // 获取已有成员列表
  const { data: members, isLoading: membersLoading, refetch: refetchMembers } = trpc.pet.adminGetUsers.useQuery();
  // 搜索用户
  const { data: searchResults, isLoading: searchLoading } = trpc.pet.adminSearchUsers.useQuery(
    { keyword: searchKw },
    { enabled: searchKw.length >= 1 }
  );

  const setRole = trpc.pet.adminSetUserRole.useMutation({
    onSuccess: () => {
      centerToast.success("保存成功");
      setEditUser(null);
      refetchMembers();
    },
    onError: (e) => centerToast.error(`保存失败：${e.message}`),
  });

  const handleEdit = (user: any) => {
    setEditUser(user);
    setEditRole(user.petRole ?? "petshop");
    setEditIsAdmin(user.petIsAdmin ?? false);
    setEditRemark(user.petRemark ?? "");
  };

  const handleSave = () => {
    if (!editUser) return;
    setRole.mutate({
      userId: editUser.id,
      role: editRole as any,
      isAdmin: editIsAdmin,
      remark: editRemark || undefined,
    });
  };

  const handleRemove = (user: any) => {
    if (!confirm(`确定移除 ${user.name || user.username} 的宠物平台角色吗？`)) return;
    setRole.mutate({ userId: user.id, role: null });
  };

  const handleAddFromSearch = (user: any) => {
    setSearchKw("");
    setKeyword("");
    handleEdit(user);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: COLORS.bg }}>
      {/* 顶部导航 */}
      <div
        className="px-4 pt-12 pb-4 flex items-center space-x-3 flex-shrink-0"
        style={{ background: COLORS.card, borderBottom: `1px solid ${COLORS.border}` }}
      >
        <button
          onClick={onClose}
          className="w-9 h-9 flex items-center justify-center rounded-full active:opacity-70"
          style={{ background: COLORS.lightBg }}
        >
          <ChevronLeft className="w-5 h-5" style={{ color: COLORS.dark }} />
        </button>
        <div className="flex items-center space-x-2">
          <UserCog className="w-5 h-5" style={{ color: COLORS.primary }} />
          <h1 className="text-base font-bold" style={{ color: COLORS.dark }}>成员管理</h1>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* 搜索添加新成员 */}
        <div
          className="rounded-3xl p-4"
          style={{ background: COLORS.card, border: `1.5px solid ${COLORS.border}` }}
        >
          <p className="text-xs font-bold mb-3" style={{ color: COLORS.muted }}>搜索并添加成员</p>
          <div className="flex space-x-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: COLORS.muted }} />
              <input
                type="text"
                placeholder="输入姓名或手机号"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                className="w-full rounded-2xl pl-9 pr-4 py-2.5 text-sm focus:outline-none"
                style={{
                  background: COLORS.lightBg,
                  border: `1.5px solid ${COLORS.border}`,
                  color: COLORS.dark,
                }}
              />
            </div>
            <button
              className="px-4 py-2.5 rounded-2xl text-sm font-bold text-white active:opacity-80"
              style={{ background: COLORS.primary }}
              onClick={() => setSearchKw(keyword)}
            >
              搜索
            </button>
          </div>

          {/* 搜索结果 */}
          {searchKw && (
            <div className="mt-3 space-y-2">
              {searchLoading ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="w-4 h-4 animate-spin" style={{ color: COLORS.muted }} />
                </div>
              ) : !searchResults || searchResults.length === 0 ? (
                <p className="text-xs text-center py-3" style={{ color: COLORS.muted }}>未找到用户</p>
              ) : (
                searchResults.map((user: any) => (
                  <div
                    key={user.id}
                    className="flex items-center justify-between p-3 rounded-2xl"
                    style={{ background: COLORS.lightBg }}
                  >
                    <div>
                      <p className="text-sm font-semibold" style={{ color: COLORS.dark }}>
                        {user.name || user.username}
                      </p>
                      {user.phone && (
                        <p className="text-xs" style={{ color: COLORS.muted }}>{user.phone}</p>
                      )}
                      {user.petRole && (
                        <span
                          className="text-[10px] px-2 py-0.5 rounded-full mt-1 inline-block"
                          style={{
                            background: ROLE_BADGE[user.petRole]?.bg ?? "#F3F4F6",
                            color: ROLE_BADGE[user.petRole]?.text ?? "#374151",
                          }}
                        >
                          {ROLE_LABELS[user.petRole] ?? user.petRole}
                          {user.petIsAdmin && " · 管理员"}
                        </span>
                      )}
                    </div>
                    <button
                      className="px-3 py-1.5 rounded-xl text-xs font-bold text-white active:opacity-80"
                      style={{ background: COLORS.primary }}
                      onClick={() => handleAddFromSearch(user)}
                    >
                      {user.petRole ? "编辑" : "添加"}
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* 现有成员列表 */}
        <div
          className="rounded-3xl overflow-hidden"
          style={{ background: COLORS.card, border: `1.5px solid ${COLORS.border}` }}
        >
          <div className="px-4 py-3.5" style={{ borderBottom: `1px solid ${COLORS.border}` }}>
            <p className="text-xs font-bold" style={{ color: COLORS.muted }}>
              当前成员
              {members && <span className="ml-1 font-normal">（{members.length} 人）</span>}
            </p>
          </div>
          {membersLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin" style={{ color: COLORS.border }} />
            </div>
          ) : !members || members.length === 0 ? (
            <div className="flex flex-col items-center py-8">
              <p className="text-sm" style={{ color: COLORS.muted }}>暂无成员</p>
            </div>
          ) : (
            members.map((user: any, idx: number) => (
              <div
                key={user.id}
                className="flex items-center justify-between px-4 py-3.5"
                style={{
                  borderBottom: idx < members.length - 1 ? `1px solid ${COLORS.border}` : "none",
                }}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2">
                    <p className="text-sm font-semibold truncate" style={{ color: COLORS.dark }}>
                      {user.name || user.username}
                    </p>
                    {user.petIsAdmin && (
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0"
                        style={{ background: "#FEE2E2", color: "#991B1B" }}
                      >
                        管理员
                      </span>
                    )}
                  </div>
                  <div className="flex items-center space-x-2 mt-0.5">
                    {user.petRole && (
                      <span
                        className="text-[10px] px-2 py-0.5 rounded-full"
                        style={{
                          background: ROLE_BADGE[user.petRole]?.bg ?? "#F3F4F6",
                          color: ROLE_BADGE[user.petRole]?.text ?? "#374151",
                        }}
                      >
                        {ROLE_LABELS[user.petRole] ?? user.petRole}
                      </span>
                    )}
                    {user.phone && (
                      <span className="text-[10px]" style={{ color: COLORS.muted }}>{user.phone}</span>
                    )}
                  </div>
                  {user.petRemark && (
                    <p className="text-[10px] mt-0.5 truncate" style={{ color: COLORS.muted }}>{user.petRemark}</p>
                  )}
                </div>
                <div className="flex items-center space-x-2 ml-2 flex-shrink-0">
                  <button
                    className="w-8 h-8 flex items-center justify-center rounded-xl active:opacity-70"
                    style={{ background: `${COLORS.primary}15` }}
                    onClick={() => handleEdit(user)}
                  >
                    <Edit2 className="w-3.5 h-3.5" style={{ color: COLORS.primary }} />
                  </button>
                  <button
                    className="w-8 h-8 flex items-center justify-center rounded-xl active:opacity-70"
                    style={{ background: "#FEE2E215" }}
                    onClick={() => handleRemove(user)}
                  >
                    <Trash2 className="w-3.5 h-3.5" style={{ color: "#DC2626" }} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 编辑用户角色弹窗 */}
      {editUser && (
        <div className="fixed inset-0 z-60 flex items-end justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setEditUser(null)} />
          <div
            className="relative w-full max-w-md rounded-t-3xl p-5 pb-10 shadow-2xl"
            style={{ background: COLORS.bg }}
          >
            <div className="flex justify-center mb-4">
              <div className="w-10 h-1 rounded-full" style={{ background: COLORS.border }} />
            </div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold" style={{ color: COLORS.dark }}>
                  设置角色
                </h3>
                <p className="text-xs mt-0.5" style={{ color: COLORS.muted }}>
                  {editUser.name || editUser.username}
                  {editUser.phone && ` · ${editUser.phone}`}
                </p>
              </div>
              <button onClick={() => setEditUser(null)}>
                <X className="w-5 h-5" style={{ color: COLORS.muted }} />
              </button>
            </div>

            <div className="space-y-4">
              {/* 角色选择 */}
              <div>
                <label className="text-xs font-medium mb-2 block" style={{ color: COLORS.muted }}>角色</label>
                <div className="grid grid-cols-2 gap-2">
                  {(["manufacturer", "investor", "promoter", "petshop"] as const).map((r) => (
                    <button
                      key={r}
                      className="py-2.5 rounded-2xl text-sm font-medium transition-all active:scale-95"
                      style={{
                        background: editRole === r ? ROLE_BADGE[r].bg : COLORS.lightBg,
                        color: editRole === r ? ROLE_BADGE[r].text : COLORS.muted,
                        border: editRole === r ? `1.5px solid ${ROLE_BADGE[r].text}40` : `1.5px solid transparent`,
                        fontWeight: editRole === r ? 700 : 500,
                      }}
                      onClick={() => setEditRole(r)}
                    >
                      {ROLE_LABELS[r]}
                    </button>
                  ))}
                </div>
              </div>

              {/* 管理员开关 */}
              <div
                className="flex items-center justify-between p-3 rounded-2xl"
                style={{ background: COLORS.lightBg }}
              >
                <div>
                  <p className="text-sm font-medium" style={{ color: COLORS.dark }}>设为管理员</p>
                  <p className="text-xs mt-0.5" style={{ color: COLORS.muted }}>管理员可管理成员和机器</p>
                </div>
                <button
                  className="w-12 h-6 rounded-full transition-all relative"
                  style={{
                    background: editIsAdmin ? COLORS.primary : COLORS.border,
                  }}
                  onClick={() => setEditIsAdmin(!editIsAdmin)}
                >
                  <div
                    className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all"
                    style={{ left: editIsAdmin ? "calc(100% - 22px)" : "2px" }}
                  />
                </button>
              </div>

              {/* 备注 */}
              <div>
                <label className="text-xs font-medium mb-1.5 block" style={{ color: COLORS.muted }}>备注（可选）</label>
                <input
                  type="text"
                  placeholder="如：北京区域地推"
                  value={editRemark}
                  onChange={(e) => setEditRemark(e.target.value)}
                  className="w-full rounded-2xl px-4 py-2.5 text-sm focus:outline-none"
                  style={{
                    background: COLORS.card,
                    border: `1.5px solid ${COLORS.border}`,
                    color: COLORS.dark,
                  }}
                />
              </div>
            </div>

            <button
              className="w-full mt-5 rounded-2xl py-3.5 text-sm font-bold text-white transition-opacity active:opacity-80 disabled:opacity-40"
              style={{ background: `linear-gradient(135deg, ${COLORS.primary}, #8B3A1E)` }}
              disabled={setRole.isPending}
              onClick={handleSave}
            >
              {setRole.isPending ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "保存"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ========== 管理员：机器管理面板 ==========
function AdminMachinePanel({ onClose }: { onClose: () => void }) {
  const [editMachine, setEditMachine] = useState<any>(null);
  const [form, setForm] = useState<any>({});

  const { data: machines, isLoading, refetch } = trpc.pet.getMyMachines.useQuery();
  const upsert = trpc.pet.adminUpsertMachine.useMutation({
    onSuccess: () => {
      centerToast.success("保存成功");
      setEditMachine(null);
      refetch();
    },
    onError: (e) => centerToast.error(`保存失败：${e.message}`),
  });

  const handleAdd = () => {
    setEditMachine({ isNew: true });
    setForm({
      machineNo: "",
      name: "",
      petshopName: "",
      address: "",
      status: "active",
      petshopRatio: 40,
      investorRatio: 35,
      promoterRatio: 10,
      manufacturerRatio: 15,
    });
  };

  const handleEdit = (m: any) => {
    setEditMachine(m);
    setForm({
      machineNo: m.machineNo ?? "",
      name: m.name ?? "",
      petshopName: m.petshopName ?? "",
      address: m.address ?? "",
      status: m.status ?? "active",
      installDate: m.installDate ?? "",
      petshopRatio: m.ratios?.petshop ?? 40,
      investorRatio: m.ratios?.investor ?? 35,
      promoterRatio: m.ratios?.promoter ?? 10,
      manufacturerRatio: m.ratios?.manufacturer ?? 15,
    });
  };

  const handleSave = () => {
    const total = (form.petshopRatio || 0) + (form.investorRatio || 0) + (form.promoterRatio || 0) + (form.manufacturerRatio || 0);
    if (Math.abs(total - 100) > 0.01) {
      centerToast.error(`分润比例之和必须为100%，当前为${total}%`);
      return;
    }
    upsert.mutate({
      id: editMachine?.isNew ? undefined : editMachine?.id,
      machineNo: form.machineNo,
      name: form.name || undefined,
      petshopName: form.petshopName || undefined,
      address: form.address || undefined,
      status: form.status || "active",
      installDate: form.installDate || undefined,
      petshopRatio: parseFloat(form.petshopRatio) || 40,
      investorRatio: parseFloat(form.investorRatio) || 35,
      promoterRatio: parseFloat(form.promoterRatio) || 10,
      manufacturerRatio: parseFloat(form.manufacturerRatio) || 15,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: COLORS.bg }}>
      {/* 顶部导航 */}
      <div
        className="px-4 pt-12 pb-4 flex items-center justify-between flex-shrink-0"
        style={{ background: COLORS.card, borderBottom: `1px solid ${COLORS.border}` }}
      >
        <div className="flex items-center space-x-3">
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-full active:opacity-70"
            style={{ background: COLORS.lightBg }}
          >
            <ChevronLeft className="w-5 h-5" style={{ color: COLORS.dark }} />
          </button>
          <div className="flex items-center space-x-2">
            <Cpu className="w-5 h-5" style={{ color: COLORS.primary }} />
            <h1 className="text-base font-bold" style={{ color: COLORS.dark }}>机器管理</h1>
          </div>
        </div>
        <button
          className="flex items-center space-x-1 px-3 py-1.5 rounded-full text-xs font-bold text-white active:opacity-80"
          style={{ background: COLORS.primary }}
          onClick={handleAdd}
        >
          <Plus className="w-3.5 h-3.5" />
          <span>添加机器</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: COLORS.border }} />
          </div>
        ) : !machines || machines.length === 0 ? (
          <div className="flex flex-col items-center py-16">
            <Cpu className="w-12 h-12 mb-3 opacity-20" style={{ color: COLORS.muted }} />
            <p className="text-sm font-medium" style={{ color: COLORS.dark }}>暂无机器</p>
            <p className="text-xs mt-1" style={{ color: COLORS.muted }}>点击右上角添加机器</p>
          </div>
        ) : (
          <div className="space-y-3">
            {machines.map((m: any) => {
              const status = STATUS_LABELS[m.status] ?? STATUS_LABELS.active;
              return (
                <div
                  key={m.id}
                  className="rounded-3xl overflow-hidden"
                  style={{
                    background: COLORS.card,
                    border: `1.5px solid ${COLORS.border}`,
                  }}
                >
                  <div className="flex items-center justify-between px-4 py-3.5">
                    <div className="flex items-center space-x-3">
                      <div
                        className="w-12 h-12 rounded-2xl flex items-center justify-center overflow-hidden flex-shrink-0"
                        style={{ background: COLORS.lightBg }}
                      >
                        <img src={MACHINE_IMG} alt="健康舱" className="w-10 h-10 object-contain" />
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="text-sm font-bold" style={{ color: COLORS.dark }}>{m.machineNo}</span>
                          {m.name && (
                            <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: COLORS.lightBg, color: COLORS.muted }}>
                              {m.name}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center space-x-1.5 mt-0.5">
                          <div className="w-1.5 h-1.5 rounded-full" style={{ background: status.dot }} />
                          <span className="text-[11px]" style={{ color: status.color }}>{status.label}</span>
                          {m.address && (
                            <span className="text-[11px]" style={{ color: COLORS.muted }}>· {m.address}</span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {m.petshopUserName && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: ROLE_BADGE.petshop.bg, color: ROLE_BADGE.petshop.text }}>
                              宠物店：{m.petshopUserName}
                            </span>
                          )}
                          {m.investorUserName && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: ROLE_BADGE.investor.bg, color: ROLE_BADGE.investor.text }}>
                              投资人：{m.investorUserName}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <button
                      className="w-9 h-9 flex items-center justify-center rounded-xl active:opacity-70 flex-shrink-0"
                      style={{ background: `${COLORS.primary}15` }}
                      onClick={() => handleEdit(m)}
                    >
                      <Edit2 className="w-4 h-4" style={{ color: COLORS.primary }} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 编辑机器弹窗 */}
      {editMachine && (
        <div className="fixed inset-0 z-60 flex items-end justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setEditMachine(null)} />
          <div
            className="relative w-full max-w-md rounded-t-3xl shadow-2xl overflow-hidden"
            style={{ background: COLORS.bg, maxHeight: "85vh" }}
          >
            <div className="p-5 overflow-y-auto" style={{ maxHeight: "85vh" }}>
              <div className="flex justify-center mb-4">
                <div className="w-10 h-1 rounded-full" style={{ background: COLORS.border }} />
              </div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-bold" style={{ color: COLORS.dark }}>
                  {editMachine.isNew ? "添加机器" : "编辑机器"}
                </h3>
                <button onClick={() => setEditMachine(null)}>
                  <X className="w-5 h-5" style={{ color: COLORS.muted }} />
                </button>
              </div>

              <div className="space-y-3">
                {/* 机器编号 */}
                <div>
                  <label className="text-xs font-medium mb-1.5 block" style={{ color: COLORS.muted }}>机器编号 *</label>
                  <input
                    type="text"
                    placeholder="如：HGM-001"
                    value={form.machineNo}
                    onChange={(e) => setForm({ ...form, machineNo: e.target.value })}
                    className="w-full rounded-2xl px-4 py-2.5 text-sm focus:outline-none"
                    style={{ background: COLORS.card, border: `1.5px solid ${COLORS.border}`, color: COLORS.dark }}
                  />
                </div>
                {/* 机器名称 */}
                <div>
                  <label className="text-xs font-medium mb-1.5 block" style={{ color: COLORS.muted }}>机器名称</label>
                  <input
                    type="text"
                    placeholder="如：朝阳店1号机"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full rounded-2xl px-4 py-2.5 text-sm focus:outline-none"
                    style={{ background: COLORS.card, border: `1.5px solid ${COLORS.border}`, color: COLORS.dark }}
                  />
                </div>
                {/* 宠物店名称 */}
                <div>
                  <label className="text-xs font-medium mb-1.5 block" style={{ color: COLORS.muted }}>宠物店名称</label>
                  <input
                    type="text"
                    placeholder="如：萌宠宠物店"
                    value={form.petshopName}
                    onChange={(e) => setForm({ ...form, petshopName: e.target.value })}
                    className="w-full rounded-2xl px-4 py-2.5 text-sm focus:outline-none"
                    style={{ background: COLORS.card, border: `1.5px solid ${COLORS.border}`, color: COLORS.dark }}
                  />
                </div>
                {/* 地址 */}
                <div>
                  <label className="text-xs font-medium mb-1.5 block" style={{ color: COLORS.muted }}>地址</label>
                  <input
                    type="text"
                    placeholder="如：北京市朝阳区xx路xx号"
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    className="w-full rounded-2xl px-4 py-2.5 text-sm focus:outline-none"
                    style={{ background: COLORS.card, border: `1.5px solid ${COLORS.border}`, color: COLORS.dark }}
                  />
                </div>
                {/* 安装日期 */}
                <div>
                  <label className="text-xs font-medium mb-1.5 block" style={{ color: COLORS.muted }}>安装日期</label>
                  <input
                    type="date"
                    value={form.installDate}
                    onChange={(e) => setForm({ ...form, installDate: e.target.value })}
                    className="w-full rounded-2xl px-4 py-2.5 text-sm focus:outline-none"
                    style={{ background: COLORS.card, border: `1.5px solid ${COLORS.border}`, color: COLORS.dark }}
                  />
                </div>
                {/* 状态 */}
                <div>
                  <label className="text-xs font-medium mb-2 block" style={{ color: COLORS.muted }}>状态</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(["active", "inactive", "maintenance"] as const).map((s) => (
                      <button
                        key={s}
                        className="py-2 rounded-2xl text-xs font-medium transition-all active:scale-95"
                        style={{
                          background: form.status === s ? `${STATUS_LABELS[s].color}15` : COLORS.lightBg,
                          color: form.status === s ? STATUS_LABELS[s].color : COLORS.muted,
                          border: form.status === s ? `1.5px solid ${STATUS_LABELS[s].color}40` : `1.5px solid transparent`,
                          fontWeight: form.status === s ? 700 : 500,
                        }}
                        onClick={() => setForm({ ...form, status: s })}
                      >
                        {STATUS_LABELS[s].label}
                      </button>
                    ))}
                  </div>
                </div>
                {/* 分润比例 */}
                <div>
                  <label className="text-xs font-medium mb-2 block" style={{ color: COLORS.muted }}>
                    分润比例（合计 {(parseFloat(form.petshopRatio || 0) + parseFloat(form.investorRatio || 0) + parseFloat(form.promoterRatio || 0) + parseFloat(form.manufacturerRatio || 0)).toFixed(0)}%，需等于100%）
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { key: "petshopRatio", label: "宠物店" },
                      { key: "investorRatio", label: "投资人" },
                      { key: "promoterRatio", label: "地推" },
                      { key: "manufacturerRatio", label: "厂家" },
                    ].map((item) => (
                      <div key={item.key}>
                        <p className="text-[10px] mb-1" style={{ color: COLORS.muted }}>{item.label}（%）</p>
                        <input
                          type="number"
                          value={form[item.key]}
                          onChange={(e) => setForm({ ...form, [item.key]: e.target.value })}
                          className="w-full rounded-xl px-3 py-2 text-sm focus:outline-none"
                          style={{ background: COLORS.card, border: `1.5px solid ${COLORS.border}`, color: COLORS.dark }}
                          min="0"
                          max="100"
                          step="1"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <button
                className="w-full mt-5 rounded-2xl py-3.5 text-sm font-bold text-white transition-opacity active:opacity-80 disabled:opacity-40"
                style={{ background: `linear-gradient(135deg, ${COLORS.primary}, #8B3A1E)` }}
                disabled={!form.machineNo || upsert.isPending}
                onClick={handleSave}
              >
                {upsert.isPending ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "保存机器"}
              </button>
              <div className="h-6" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ========== 录入营业额弹窗 ==========
function RecordModal({
  machine,
  onClose,
  onSuccess,
}: {
  machine: any;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [revenue, setRevenue] = useState("");
  const upsert = trpc.pet.upsertDailyRecord.useMutation({
    onSuccess: () => {
      centerToast.success("录入成功");
      onSuccess();
      onClose();
    },
    onError: (e) => centerToast.error(`录入失败：${e.message}`),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        className="relative w-full max-w-md rounded-t-3xl p-5 pb-10 shadow-2xl"
        style={{ background: COLORS.bg }}
      >
        {/* 拖拽条 */}
        <div className="flex justify-center mb-5">
          <div className="w-10 h-1 rounded-full" style={{ background: COLORS.border }} />
        </div>

        <h3 className="text-base font-bold mb-0.5" style={{ color: COLORS.dark }}>录入营业额</h3>
        <p className="text-xs mb-5" style={{ color: COLORS.muted }}>
          机器：{machine.machineNo}{machine.name ? ` · ${machine.name}` : ""}
        </p>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: COLORS.muted }}>日期</label>
            <input
              type="date"
              value={date}
              max={today}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-2xl px-4 py-3 text-sm focus:outline-none"
              style={{
                background: COLORS.card,
                border: `1.5px solid ${COLORS.border}`,
                color: COLORS.dark,
              }}
            />
          </div>
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: COLORS.muted }}>营业额（元）</label>
            <input
              type="number"
              placeholder="请输入今日营业额"
              value={revenue}
              onChange={(e) => setRevenue(e.target.value)}
              className="w-full rounded-2xl px-4 py-3 text-sm focus:outline-none"
              style={{
                background: COLORS.card,
                border: `1.5px solid ${COLORS.border}`,
                color: COLORS.dark,
              }}
              min="0"
              step="0.01"
            />
          </div>

          {/* 预计分润预览 */}
          {revenue && !isNaN(parseFloat(revenue)) && (
            <div className="rounded-2xl p-4" style={{ background: COLORS.lightBg, border: `1px solid ${COLORS.border}` }}>
              <p className="text-xs font-semibold mb-3" style={{ color: COLORS.dark }}>预计分润</p>
              <div className="space-y-2">
                {[
                  { label: "宠物店", ratio: machine.ratios?.petshop ?? 40, color: "#5B21B6" },
                  { label: "投资人", ratio: machine.ratios?.investor ?? 35, color: "#92400E" },
                  { label: "地推", ratio: machine.ratios?.promoter ?? 10, color: "#065F46" },
                  { label: "厂家", ratio: machine.ratios?.manufacturer ?? 15, color: "#2563EB" },
                ].map((item) => (
                  <div key={item.label} className="flex justify-between items-center">
                    <div className="flex items-center space-x-2">
                      <div className="w-1.5 h-1.5 rounded-full" style={{ background: item.color }} />
                      <span className="text-xs" style={{ color: COLORS.muted }}>
                        {item.label}（{item.ratio}%）
                      </span>
                    </div>
                    <span className="text-sm font-bold" style={{ color: COLORS.dark }}>
                      ¥{((parseFloat(revenue) * item.ratio) / 100).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <button
          className="w-full mt-5 rounded-2xl py-3.5 text-sm font-bold text-white transition-opacity active:opacity-80 disabled:opacity-40"
          style={{ background: `linear-gradient(135deg, ${COLORS.primary}, #8B3A1E)` }}
          disabled={!revenue || isNaN(parseFloat(revenue)) || upsert.isPending}
          onClick={() => {
            if (!revenue) return;
            upsert.mutate({ machineId: machine.id, recordDate: date, revenue: parseFloat(revenue) });
          }}
        >
          {upsert.isPending ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "确认录入"}
        </button>
      </div>
    </div>
  );
}

// ========== 机器卡片 ==========
function MachineCard({
  machine,
  userRole,
  onRecord,
  onDetail,
}: {
  machine: any;
  userRole: string;
  onRecord: (m: any) => void;
  onDetail: (m: any) => void;
}) {
  const status = STATUS_LABELS[machine.status] ?? STATUS_LABELS.active;
  const canRecord = userRole === "admin" || userRole === "petshop";

  return (
    <div
      className="rounded-3xl overflow-hidden active:scale-[0.99] transition-transform cursor-pointer"
      style={{
        background: COLORS.card,
        border: `1.5px solid ${COLORS.border}`,
        boxShadow: "0 2px 12px rgba(92,61,30,0.08)",
      }}
      onClick={() => onDetail(machine)}
    >
      {/* 卡片顶部：机器编号 + 插画 */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <div className="flex items-center space-x-3">
          {/* 机器小图 */}
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center overflow-hidden flex-shrink-0"
            style={{ background: COLORS.lightBg }}
          >
            <img src={MACHINE_IMG} alt="健康舱" className="w-12 h-12 object-contain" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-sm font-bold" style={{ color: COLORS.dark }}>{machine.machineNo}</span>
              {machine.name && (
                <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: COLORS.lightBg, color: COLORS.muted }}>
                  {machine.name}
                </span>
              )}
            </div>
            <div className="flex items-center space-x-1.5 mt-0.5">
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: status.dot }} />
              <span className="text-[11px] font-medium" style={{ color: status.color }}>{status.label}</span>
            </div>
          </div>
        </div>
        <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: COLORS.border }} />
      </div>

      {/* 地址 */}
      {(machine.petshopName || machine.address) && (
        <div
          className="flex items-center space-x-1.5 mx-4 mb-3 px-3 py-2 rounded-xl"
          style={{ background: COLORS.lightBg }}
        >
          <MapPin className="w-3 h-3 flex-shrink-0" style={{ color: COLORS.muted }} />
          <span className="text-xs truncate" style={{ color: COLORS.muted }}>
            {machine.petshopName || machine.address}
          </span>
        </div>
      )}

      {/* 数据区：今日 */}
      <div
        className="grid grid-cols-2 mx-4 mb-2 rounded-2xl overflow-hidden"
        style={{ background: COLORS.lightBg }}
      >
        <div className="px-4 py-3">
          <p className="text-[10px] font-medium mb-1" style={{ color: COLORS.muted }}>今日营业额</p>
          <p className="text-lg font-bold" style={{ color: COLORS.dark }}>
            ¥{machine.today.revenue.toFixed(2)}
          </p>
        </div>
        <div
          className="px-4 py-3 rounded-2xl"
          style={{ background: `${COLORS.primary}12` }}
        >
          <p className="text-[10px] font-medium mb-1" style={{ color: COLORS.primary }}>
            今日{userRole === "admin" ? "总收入" : "我的分润"}
          </p>
          <p className="text-lg font-bold" style={{ color: COLORS.primary }}>
            ¥{machine.today.myProfit.toFixed(2)}
          </p>
        </div>
      </div>

      {/* 本月数据 */}
      <div className="grid grid-cols-2 px-4 pb-3 gap-2">
        <div
          className="px-3 py-2 rounded-xl"
          style={{ background: COLORS.lightBg }}
        >
          <p className="text-[10px]" style={{ color: COLORS.muted }}>本月营业额</p>
          <p className="text-sm font-semibold" style={{ color: COLORS.dark }}>¥{machine.month.revenue.toFixed(2)}</p>
        </div>
        <div
          className="px-3 py-2 rounded-xl"
          style={{ background: `${COLORS.primary}10` }}
        >
          <p className="text-[10px]" style={{ color: COLORS.primary }}>
            本月{userRole === "admin" ? "总收入" : "我的分润"}
          </p>
          <p className="text-sm font-semibold" style={{ color: COLORS.primary }}>¥{machine.month.myProfit.toFixed(2)}</p>
        </div>
      </div>

      {/* 录入按钮 */}
      {canRecord && (
        <div className="px-4 pb-4">
          <button
            className="w-full rounded-2xl py-2.5 text-xs font-bold transition-opacity active:opacity-70"
            style={{
              background: `linear-gradient(135deg, ${COLORS.primary}, #8B3A1E)`,
              color: "#fff",
            }}
            onClick={(e) => {
              e.stopPropagation();
              onRecord(machine);
            }}
          >
            录入今日营业额
          </button>
        </div>
      )}
    </div>
  );
}

// ========== 机器详情页 ==========
function MachineDetail({ machine, userRole, onBack }: { machine: any; userRole: string; onBack: () => void }) {
  const { data: history, isLoading } = trpc.pet.getMachineHistory.useQuery({ machineId: machine.id });

  return (
    <div className="min-h-screen pb-8" style={{ background: COLORS.bg }}>
      {/* 顶部导航 */}
      <div
        className="px-4 pt-12 pb-4 flex items-center space-x-3"
        style={{ background: COLORS.card, borderBottom: `1px solid ${COLORS.border}` }}
      >
        <button
          onClick={onBack}
          className="w-9 h-9 flex items-center justify-center rounded-full active:opacity-70"
          style={{ background: COLORS.lightBg }}
        >
          <ChevronLeft className="w-5 h-5" style={{ color: COLORS.dark }} />
        </button>
        <div className="flex items-center space-x-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center overflow-hidden"
            style={{ background: COLORS.lightBg }}
          >
            <img src={MACHINE_IMG} alt="健康舱" className="w-9 h-9 object-contain" />
          </div>
          <div>
            <h1 className="text-base font-bold" style={{ color: COLORS.dark }}>{machine.machineNo}</h1>
            {machine.name && <p className="text-xs" style={{ color: COLORS.muted }}>{machine.name}</p>}
          </div>
        </div>
      </div>

      <div className="px-4 py-4 space-y-3">
        {/* 机器信息 */}
        <div
          className="rounded-3xl p-4"
          style={{ background: COLORS.card, border: `1.5px solid ${COLORS.border}` }}
        >
          <h3 className="text-xs font-bold mb-3" style={{ color: COLORS.muted }}>机器信息</h3>
          <div className="space-y-2.5">
            {machine.address && (
              <div className="flex justify-between text-sm">
                <span style={{ color: COLORS.muted }}>地址</span>
                <span className="font-medium" style={{ color: COLORS.dark }}>{machine.address}</span>
              </div>
            )}
            {machine.installDate && (
              <div className="flex justify-between text-sm">
                <span style={{ color: COLORS.muted }}>安装日期</span>
                <span className="font-medium" style={{ color: COLORS.dark }}>{machine.installDate}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span style={{ color: COLORS.muted }}>状态</span>
              <span className="font-medium" style={{ color: STATUS_LABELS[machine.status]?.color ?? COLORS.dark }}>
                {STATUS_LABELS[machine.status]?.label ?? machine.status}
              </span>
            </div>
          </div>
        </div>

        {/* 分润比例 */}
        <div
          className="rounded-3xl p-4"
          style={{ background: COLORS.card, border: `1.5px solid ${COLORS.border}` }}
        >
          <h3 className="text-xs font-bold mb-3" style={{ color: COLORS.muted }}>分润比例</h3>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "宠物店", ratio: machine.ratios?.petshop ?? 40, role: "petshop" },
              { label: "投资人", ratio: machine.ratios?.investor ?? 35, role: "investor" },
              { label: "地推", ratio: machine.ratios?.promoter ?? 10, role: "promoter" },
              { label: "厂家", ratio: machine.ratios?.manufacturer ?? 15, role: "manufacturer" },
            ].map((item) => {
              const isMe = userRole === item.role;
              return (
                <div
                  key={item.label}
                  className="rounded-2xl p-3"
                  style={{
                    background: isMe ? `${COLORS.primary}12` : COLORS.lightBg,
                    border: isMe ? `1.5px solid ${COLORS.primary}40` : `1.5px solid transparent`,
                  }}
                >
                  <p className="text-xs" style={{ color: isMe ? COLORS.primary : COLORS.muted }}>{item.label}</p>
                  <p className="text-xl font-bold mt-0.5" style={{ color: isMe ? COLORS.primary : COLORS.dark }}>
                    {item.ratio}%
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* 历史记录 */}
        <div
          className="rounded-3xl overflow-hidden"
          style={{ background: COLORS.card, border: `1.5px solid ${COLORS.border}` }}
        >
          <div className="px-4 py-3.5" style={{ borderBottom: `1px solid ${COLORS.border}` }}>
            <h3 className="text-xs font-bold" style={{ color: COLORS.muted }}>最近30天记录</h3>
          </div>
          {isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin" style={{ color: COLORS.border }} />
            </div>
          ) : !history || history.length === 0 ? (
            <div className="flex flex-col items-center py-10">
              <Calendar className="w-8 h-8 mb-2 opacity-30" style={{ color: COLORS.muted }} />
              <p className="text-sm" style={{ color: COLORS.muted }}>暂无营业记录</p>
            </div>
          ) : (
            <div>
              {history.map((rec: any, idx: number) => {
                let myProfit = parseFloat(rec.revenue ?? "0");
                if (userRole === "petshop") myProfit = parseFloat(rec.petshop_profit ?? "0");
                else if (userRole === "investor") myProfit = parseFloat(rec.investor_profit ?? "0");
                else if (userRole === "promoter") myProfit = parseFloat(rec.promoter_profit ?? "0");
                else if (userRole === "manufacturer") myProfit = parseFloat(rec.manufacturer_profit ?? "0");
                return (
                  <div
                    key={rec.id}
                    className="flex items-center justify-between px-4 py-3.5"
                    style={{
                      borderBottom: idx < history.length - 1 ? `1px solid ${COLORS.border}` : "none",
                    }}
                  >
                    <div>
                      <p className="text-sm font-semibold" style={{ color: COLORS.dark }}>{rec.record_date}</p>
                      <p className="text-xs mt-0.5" style={{ color: COLORS.muted }}>
                        营业额 ¥{parseFloat(rec.revenue).toFixed(2)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold" style={{ color: COLORS.primary }}>
                        ¥{myProfit.toFixed(2)}
                      </p>
                      <p className="text-[10px] mt-0.5" style={{ color: COLORS.muted }}>
                        {userRole === "admin" ? "总收入" : "我的分润"}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ========== 主页面 ==========
export default function PetPlatform() {
  const [, navigate] = useLocation();
  const [recordingMachine, setRecordingMachine] = useState<any>(null);
  const [detailMachine, setDetailMachine] = useState<any>(null);
  const [showMemberPanel, setShowMemberPanel] = useState(false);
  const [showMachinePanel, setShowMachinePanel] = useState(false);

  const { data: roleData, isLoading: roleLoading } = trpc.pet.getMyRole.useQuery();
  const { data: machines, isLoading: machinesLoading, refetch } = trpc.pet.getMyMachines.useQuery();

  const userRole = roleData?.role ?? "petshop";
  const isAdmin = !!(roleData?.isAdmin);
  const badge = ROLE_BADGE[userRole] ?? ROLE_BADGE.petshop;

  // 汇总数据
  const totalTodayRevenue = (machines ?? []).reduce((s: number, m: any) => s + m.today.revenue, 0);
  const totalTodayProfit = (machines ?? []).reduce((s: number, m: any) => s + m.today.myProfit, 0);
  const totalMonthRevenue = (machines ?? []).reduce((s: number, m: any) => s + m.month.revenue, 0);
  const totalMonthProfit = (machines ?? []).reduce((s: number, m: any) => s + m.month.myProfit, 0);

  // 管理员面板
  if (showMemberPanel) {
    return <AdminMemberPanel onClose={() => setShowMemberPanel(false)} />;
  }
  if (showMachinePanel) {
    return <AdminMachinePanel onClose={() => setShowMachinePanel(false)} />;
  }

  // 详情页
  if (detailMachine) {
    return (
      <MachineDetail
        machine={detailMachine}
        userRole={userRole}
        onBack={() => setDetailMachine(null)}
      />
    );
  }

  return (
    <div className="min-h-screen pb-10" style={{ background: COLORS.bg }}>
      {/* ===== 顶部插画横幅（完整显示插画） ===== */}
      <div className="relative">
        {/* 插画完整显示，不裁剪 */}
        <img
          src="https://d2xsxph8kpxj0f.cloudfront.net/310519663279996243/ivirPqo3t2YCdg32vqitTK/banner_new-L5PCLtLh7j6tJAjXpqgv6n.webp"
          alt="宠物氢氧健康舱"
          className="w-full object-contain object-top"
          style={{ display: "block" }}
        />
        {/* 顶部导航栏悬浮在插画左上角 */}
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 pt-3 pb-2">
          <div className="flex items-center space-x-2">
            <button
              onClick={() => navigate("/")}
              className="w-8 h-8 flex items-center justify-center rounded-full active:opacity-70"
              style={{ background: "rgba(0,0,0,0.22)" }}
            >
              <ChevronLeft className="w-5 h-5 text-white" />
            </button>
            {/* HaGeeMe 商标图片替换标题文字 */}
            <img
              src="https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/pet-platform/hageme-logo-transparent.png?v=3"
              alt="HaGeeMe"
              className="h-20 w-auto object-contain"
              style={{ filter: 'drop-shadow(0 1px 4px rgba(0,0,0,0.3))' }}
            />
          </div>
          <button
            onClick={() => window.location.reload()}
            className="text-white text-xs font-bold px-4 py-1.5 rounded-full active:opacity-80 shadow-md"
            style={{ background: "#2A9D8F", letterSpacing: "0.05em" }}
          >
            刷新
          </button>
        </div>
      </div>

      {/* ===== 白色内容区域 ===== */}
      <div style={{ background: COLORS.bg }}>
        {/* 角色标签 */}
        {!roleLoading && (
          <div className="flex items-center space-x-2 px-4 pt-4 pb-0">
            <span
              className="text-xs font-bold px-3 py-1 rounded-full"
              style={{ background: badge.bg, color: badge.text }}
            >
              {ROLE_LABELS[userRole] ?? "访客"}
            </span>
            {isAdmin && (
              <span
                className="text-xs font-bold px-3 py-1 rounded-full"
                style={{ background: "#FEE2E2", color: "#991B1B" }}
              >
                管理员
              </span>
            )}
            {roleData?.remark && (
              <span className="text-xs" style={{ color: COLORS.muted }}>{roleData.remark}</span>
            )}
          </div>
        )}

        {/* 汇总数据卡片 */}
        <div className="px-4 pt-3 pb-2">
          <div className="grid grid-cols-2 gap-2.5">
            <div
              className="rounded-2xl px-4 py-3.5"
              style={{
                background: `linear-gradient(135deg, ${COLORS.primary}, #8B3A1E)`,
              }}
            >
              <p className="text-white/80 text-[10px] font-medium mb-1">今日总营业额</p>
              <p className="text-white text-xl font-bold">¥{totalTodayRevenue.toFixed(2)}</p>
            </div>
            <div
              className="rounded-2xl px-4 py-3.5"
              style={{
                background: `linear-gradient(135deg, #C97A55, ${COLORS.primary})`,
              }}
            >
              <p className="text-white/80 text-[10px] font-medium mb-1">
                今日{isAdmin ? "总收入" : "我的分润"}
              </p>
              <p className="text-white text-xl font-bold">¥{totalTodayProfit.toFixed(2)}</p>
            </div>
            <div
              className="rounded-2xl px-4 py-3"
              style={{ background: COLORS.card, border: `1.5px solid ${COLORS.border}` }}
            >
              <p className="text-[10px] mb-0.5" style={{ color: COLORS.muted }}>本月营业额</p>
              <p className="text-base font-semibold" style={{ color: COLORS.dark }}>¥{totalMonthRevenue.toFixed(2)}</p>
            </div>
            <div
              className="rounded-2xl px-4 py-3"
              style={{ background: COLORS.card, border: `1.5px solid ${COLORS.border}` }}
            >
              <p className="text-[10px] mb-0.5" style={{ color: COLORS.primary }}>
                本月{isAdmin ? "总收入" : "我的分润"}
              </p>
              <p className="text-base font-semibold" style={{ color: COLORS.primary }}>¥{totalMonthProfit.toFixed(2)}</p>
            </div>
          </div>
        </div>

        {/* 管理员操作区（仅管理员可见） */}
        {isAdmin && (
          <div className="px-4 pb-2">
            <div
              className="rounded-2xl p-3"
              style={{ background: COLORS.card, border: `1.5px solid ${COLORS.border}` }}
            >
              <p className="text-xs font-bold mb-2.5" style={{ color: COLORS.muted }}>管理员操作</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  className="flex items-center justify-center space-x-2 py-3 rounded-2xl text-sm font-bold active:opacity-80 transition-opacity"
                  style={{
                    background: `linear-gradient(135deg, #2563EB15, #2563EB08)`,
                    border: `1.5px solid #2563EB30`,
                    color: "#2563EB",
                  }}
                  onClick={() => setShowMemberPanel(true)}
                >
                  <UserCog className="w-4 h-4" />
                  <span>成员管理</span>
                </button>
                <button
                  className="flex items-center justify-center space-x-2 py-3 rounded-2xl text-sm font-bold active:opacity-80 transition-opacity"
                  style={{
                    background: `linear-gradient(135deg, ${COLORS.primary}15, ${COLORS.primary}08)`,
                    border: `1.5px solid ${COLORS.primary}30`,
                    color: COLORS.primary,
                  }}
                  onClick={() => setShowMachinePanel(true)}
                >
                  <Cpu className="w-4 h-4" />
                  <span>机器管理</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ===== 机器列表区域 ===== */}
      <div className="px-4 pt-3" style={{ background: COLORS.bg }}>
        {/* 列表标题 */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <div
              className="w-1 h-4 rounded-full"
              style={{ background: COLORS.primary }}
            />
            <h2 className="text-sm font-bold" style={{ color: COLORS.dark }}>
              {isAdmin ? "所有机器" : "我的机器"}
              {machines && (
                <span className="ml-1.5 text-xs font-normal" style={{ color: COLORS.muted }}>
                  共 {machines.length} 台
                </span>
              )}
            </h2>
          </div>
        </div>

        {/* 加载状态 */}
        {roleLoading || machinesLoading ? (
          <div className="flex flex-col items-center py-16">
            <Loader2 className="w-6 h-6 animate-spin mb-3" style={{ color: COLORS.border }} />
            <p className="text-sm" style={{ color: COLORS.muted }}>加载中...</p>
          </div>
        ) : !roleData ? (
          /* 未分配角色 */
          <div className="flex flex-col items-center py-10">
            <img src={EMPTY_IMG} alt="暂无数据" className="w-48 h-48 object-contain mb-3 opacity-80" />
            <p className="text-sm font-medium" style={{ color: COLORS.dark }}>您尚未分配宠物平台角色</p>
            <p className="text-xs mt-1" style={{ color: COLORS.muted }}>请联系管理员开通权限</p>
          </div>
        ) : !machines || machines.length === 0 ? (
          /* 无机器 */
          <div className="flex flex-col items-center py-10">
            <img src={EMPTY_IMG} alt="暂无机器" className="w-48 h-48 object-contain mb-3 opacity-80" />
            <p className="text-sm font-medium" style={{ color: COLORS.dark }}>暂无关联机器</p>
            <p className="text-xs mt-1" style={{ color: COLORS.muted }}>请联系管理员添加</p>
          </div>
        ) : (
          /* 机器列表 */
          <div className="space-y-3">
            {machines.map((machine: any) => (
              <MachineCard
                key={machine.id}
                machine={machine}
                userRole={isAdmin ? "admin" : userRole}
                onRecord={setRecordingMachine}
                onDetail={setDetailMachine}
              />
            ))}
          </div>
        )}
      </div>

      {/* 录入弹窗 */}
      {recordingMachine && (
        <RecordModal
          machine={recordingMachine}
          onClose={() => setRecordingMachine(null)}
          onSuccess={() => refetch()}
        />
      )}
    </div>
  );
}
