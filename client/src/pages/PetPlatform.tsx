import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Loader2, ChevronLeft, ChevronRight, Calendar, MapPin, Settings, Plus, Search, X, Pencil, Users, Cpu } from "lucide-react";
import { centerToast } from "@/components/ui/center-toast";

// 插画资源 CDN URL
const EMPTY_IMG = "https://d2xsxph8kpxj0f.cloudfront.net/310519663279996243/ivirPqo3t2YCdg32vqitTK/empty_state-Hz3oJbgUxXxExN3fGavc6E.webp";
const MACHINE_IMG = "https://d2xsxph8kpxj0f.cloudfront.net/310519663279996243/ivirPqo3t2YCdg32vqitTK/machine_icon-fj8GBGpdbCSJhZ7uRs76kF.webp";

// PPT 暖棕色系调色板
const COLORS = {
  bg: "#F5EFE6",
  primary: "#B85C38",
  dark: "#5C3D1E",
  green: "#4A6741",
  card: "#FFFFFF",
  muted: "#9C7E6A",
  border: "#E8D9C8",
  lightBg: "#FBF6F0",
};

const ROLE_LABELS: Record<string, string> = {
  manufacturer: "厂家",
  investor: "投资人",
  promoter: "地推",
  petshop: "宠物店",
  admin: "管理员",
};

const ROLE_BADGE: Record<string, { bg: string; text: string }> = {
  manufacturer: { bg: "#EBF3FF", text: "#2563EB" },
  investor: { bg: "#FEF3C7", text: "#92400E" },
  promoter: { bg: "#ECFDF5", text: "#065F46" },
  petshop: { bg: "#F5F3FF", text: "#5B21B6" },
  admin: { bg: "#FEE2E2", text: "#991B1B" },
};

const STATUS_LABELS: Record<string, { label: string; color: string; dot: string }> = {
  active: { label: "运行中", color: "#4A6741", dot: "#4A6741" },
  inactive: { label: "未启用", color: "#9C7E6A", dot: "#C4A882" },
  maintenance: { label: "维护中", color: "#B85C38", dot: "#B85C38" },
};

// ===== 录入营业额弹窗 =====
function RecordModal({ machine, onClose, onSuccess }: { machine: any; onClose: () => void; onSuccess: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [revenue, setRevenue] = useState("");
  const upsert = trpc.pet.upsertDailyRecord.useMutation({
    onSuccess: () => { centerToast.success("录入成功"); onSuccess(); onClose(); },
    onError: (e) => centerToast.error(`录入失败：${e.message}`),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-t-3xl p-5 pb-10 shadow-2xl" style={{ background: COLORS.bg }}>
        <div className="flex justify-center mb-5">
          <div className="w-10 h-1 rounded-full" style={{ background: COLORS.border }} />
        </div>
        <h3 className="text-base font-bold mb-0.5" style={{ color: COLORS.dark }}>录入营业额</h3>
        <p className="text-xs mb-5" style={{ color: COLORS.muted }}>机器：{machine.machineNo}{machine.name ? ` · ${machine.name}` : ""}</p>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: COLORS.muted }}>日期</label>
            <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-2xl px-4 py-3 text-sm focus:outline-none"
              style={{ background: COLORS.card, border: `1.5px solid ${COLORS.border}`, color: COLORS.dark }} />
          </div>
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: COLORS.muted }}>营业额（元）</label>
            <input type="number" placeholder="请输入今日营业额" value={revenue} onChange={(e) => setRevenue(e.target.value)}
              className="w-full rounded-2xl px-4 py-3 text-sm focus:outline-none"
              style={{ background: COLORS.card, border: `1.5px solid ${COLORS.border}`, color: COLORS.dark }}
              min="0" step="0.01" />
          </div>
          {revenue && !isNaN(parseFloat(revenue)) && (
            <div className="rounded-2xl p-4" style={{ background: COLORS.lightBg, border: `1px solid ${COLORS.border}` }}>
              <p className="text-xs font-semibold mb-3" style={{ color: COLORS.dark }}>预计分润</p>
              <div className="space-y-2">
                {[
                  { label: "宠物店", ratio: machine.ratios?.petshop ?? 40 },
                  { label: "投资人", ratio: machine.ratios?.investor ?? 35 },
                  { label: "地推", ratio: machine.ratios?.promoter ?? 10 },
                  { label: "厂家", ratio: machine.ratios?.manufacturer ?? 15 },
                ].map((item) => (
                  <div key={item.label} className="flex justify-between items-center">
                    <span className="text-xs" style={{ color: COLORS.muted }}>{item.label}（{item.ratio}%）</span>
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
          onClick={() => { if (!revenue) return; upsert.mutate({ machineId: machine.id, recordDate: date, revenue: parseFloat(revenue) }); }}
        >
          {upsert.isPending ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "确认录入"}
        </button>
      </div>
    </div>
  );
}

// ===== 机器卡片 =====
function MachineCard({ machine, userRole, onRecord, onDetail }: { machine: any; userRole: string; onRecord: (m: any) => void; onDetail: (m: any) => void }) {
  const status = STATUS_LABELS[machine.status] ?? STATUS_LABELS.active;
  const canRecord = userRole === "admin" || userRole === "petshop";
  return (
    <div className="rounded-3xl overflow-hidden active:scale-[0.99] transition-transform cursor-pointer"
      style={{ background: COLORS.card, border: `1.5px solid ${COLORS.border}`, boxShadow: "0 2px 12px rgba(92,61,30,0.08)" }}
      onClick={() => onDetail(machine)}>
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <div className="flex items-center space-x-3">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center overflow-hidden flex-shrink-0" style={{ background: COLORS.lightBg }}>
            <img src={MACHINE_IMG} alt="健康舱" className="w-12 h-12 object-contain" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-sm font-bold" style={{ color: COLORS.dark }}>{machine.machineNo}</span>
              {machine.name && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: COLORS.lightBg, color: COLORS.muted }}>{machine.name}</span>}
            </div>
            <div className="flex items-center space-x-1.5 mt-0.5">
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: status.dot }} />
              <span className="text-[11px] font-medium" style={{ color: status.color }}>{status.label}</span>
            </div>
          </div>
        </div>
        <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: COLORS.border }} />
      </div>
      {(machine.petshopName || machine.address) && (
        <div className="flex items-center space-x-1.5 mx-4 mb-3 px-3 py-2 rounded-xl" style={{ background: COLORS.lightBg }}>
          <MapPin className="w-3 h-3 flex-shrink-0" style={{ color: COLORS.muted }} />
          <span className="text-xs truncate" style={{ color: COLORS.muted }}>{machine.petshopName || machine.address}</span>
        </div>
      )}
      <div className="grid grid-cols-2 mx-4 mb-2 rounded-2xl overflow-hidden" style={{ background: COLORS.lightBg }}>
        <div className="px-4 py-3">
          <p className="text-[10px] font-medium mb-1" style={{ color: COLORS.muted }}>今日营业额</p>
          <p className="text-lg font-bold" style={{ color: COLORS.dark }}>¥{machine.today.revenue.toFixed(2)}</p>
        </div>
        <div className="px-4 py-3 rounded-2xl" style={{ background: `${COLORS.primary}12` }}>
          <p className="text-[10px] font-medium mb-1" style={{ color: COLORS.primary }}>今日{userRole === "admin" ? "总收入" : "我的分润"}</p>
          <p className="text-lg font-bold" style={{ color: COLORS.primary }}>¥{machine.today.myProfit.toFixed(2)}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 px-4 pb-3 gap-2">
        <div className="px-3 py-2 rounded-xl" style={{ background: COLORS.lightBg }}>
          <p className="text-[10px]" style={{ color: COLORS.muted }}>本月营业额</p>
          <p className="text-sm font-semibold" style={{ color: COLORS.dark }}>¥{machine.month.revenue.toFixed(2)}</p>
        </div>
        <div className="px-3 py-2 rounded-xl" style={{ background: `${COLORS.primary}10` }}>
          <p className="text-[10px]" style={{ color: COLORS.primary }}>本月{userRole === "admin" ? "总收入" : "我的分润"}</p>
          <p className="text-sm font-semibold" style={{ color: COLORS.primary }}>¥{machine.month.myProfit.toFixed(2)}</p>
        </div>
      </div>
      {canRecord && (
        <div className="px-4 pb-4">
          <button className="w-full rounded-2xl py-2.5 text-xs font-bold transition-opacity active:opacity-70"
            style={{ background: `linear-gradient(135deg, ${COLORS.primary}, #8B3A1E)`, color: "#fff" }}
            onClick={(e) => { e.stopPropagation(); onRecord(machine); }}>
            录入今日营业额
          </button>
        </div>
      )}
    </div>
  );
}

// ===== 机器详情页 =====
function MachineDetail({ machine, userRole, onBack }: { machine: any; userRole: string; onBack: () => void }) {
  const { data: history, isLoading } = trpc.pet.getMachineHistory.useQuery({ machineId: machine.id });
  return (
    <div className="min-h-screen pb-8" style={{ background: COLORS.bg }}>
      <div className="px-4 pt-12 pb-4 flex items-center space-x-3" style={{ background: COLORS.card, borderBottom: `1px solid ${COLORS.border}` }}>
        <button onClick={onBack} className="w-9 h-9 flex items-center justify-center rounded-full active:opacity-70" style={{ background: COLORS.lightBg }}>
          <ChevronLeft className="w-5 h-5" style={{ color: COLORS.dark }} />
        </button>
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center overflow-hidden" style={{ background: COLORS.lightBg }}>
            <img src={MACHINE_IMG} alt="健康舱" className="w-9 h-9 object-contain" />
          </div>
          <div>
            <h1 className="text-base font-bold" style={{ color: COLORS.dark }}>{machine.machineNo}</h1>
            {machine.name && <p className="text-xs" style={{ color: COLORS.muted }}>{machine.name}</p>}
          </div>
        </div>
      </div>
      <div className="px-4 py-4 space-y-3">
        <div className="rounded-3xl p-4" style={{ background: COLORS.card, border: `1.5px solid ${COLORS.border}` }}>
          <h3 className="text-xs font-bold mb-3" style={{ color: COLORS.muted }}>机器信息</h3>
          <div className="space-y-2.5">
            {machine.address && <div className="flex justify-between text-sm"><span style={{ color: COLORS.muted }}>地址</span><span className="font-medium" style={{ color: COLORS.dark }}>{machine.address}</span></div>}
            {machine.installDate && <div className="flex justify-between text-sm"><span style={{ color: COLORS.muted }}>安装日期</span><span className="font-medium" style={{ color: COLORS.dark }}>{machine.installDate}</span></div>}
            <div className="flex justify-between text-sm"><span style={{ color: COLORS.muted }}>状态</span><span className="font-medium" style={{ color: STATUS_LABELS[machine.status]?.color ?? COLORS.dark }}>{STATUS_LABELS[machine.status]?.label ?? machine.status}</span></div>
          </div>
        </div>
        <div className="rounded-3xl p-4" style={{ background: COLORS.card, border: `1.5px solid ${COLORS.border}` }}>
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
                <div key={item.label} className="rounded-2xl p-3"
                  style={{ background: isMe ? `${COLORS.primary}12` : COLORS.lightBg, border: isMe ? `1.5px solid ${COLORS.primary}40` : `1.5px solid transparent` }}>
                  <p className="text-xs" style={{ color: isMe ? COLORS.primary : COLORS.muted }}>{item.label}</p>
                  <p className="text-xl font-bold mt-0.5" style={{ color: isMe ? COLORS.primary : COLORS.dark }}>{item.ratio}%</p>
                </div>
              );
            })}
          </div>
        </div>
        <div className="rounded-3xl overflow-hidden" style={{ background: COLORS.card, border: `1.5px solid ${COLORS.border}` }}>
          <div className="px-4 py-3.5" style={{ borderBottom: `1px solid ${COLORS.border}` }}>
            <h3 className="text-xs font-bold" style={{ color: COLORS.muted }}>最近30天记录</h3>
          </div>
          {isLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin" style={{ color: COLORS.border }} /></div>
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
                  <div key={rec.id} className="flex items-center justify-between px-4 py-3.5"
                    style={{ borderBottom: idx < history.length - 1 ? `1px solid ${COLORS.border}` : "none" }}>
                    <div>
                      <p className="text-sm font-semibold" style={{ color: COLORS.dark }}>{rec.record_date}</p>
                      <p className="text-xs mt-0.5" style={{ color: COLORS.muted }}>营业额 ¥{parseFloat(rec.revenue).toFixed(2)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold" style={{ color: COLORS.primary }}>¥{myProfit.toFixed(2)}</p>
                      <p className="text-[10px] mt-0.5" style={{ color: COLORS.muted }}>{userRole === "admin" ? "总收入" : "我的分润"}</p>
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

// ===== 编辑角色弹窗 =====
function EditRoleModal({ user, onClose, onSave, isSaving }: {
  user: any;
  onClose: () => void;
  onSave: (role: any, isAdmin: boolean, remark: string) => void;
  isSaving: boolean;
}) {
  const [role, setRole] = useState<string | null>(user.petRole ?? null);
  const [isAdmin, setIsAdmin] = useState<boolean>(user.petIsAdmin ?? false);
  const [remark, setRemark] = useState<string>(user.petRemark ?? "");

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-t-3xl p-5 pb-10 shadow-2xl" style={{ background: COLORS.bg }}>
        <div className="flex justify-center mb-4">
          <div className="w-10 h-1 rounded-full" style={{ background: COLORS.border }} />
        </div>
        <h3 className="text-base font-bold mb-0.5" style={{ color: COLORS.dark }}>设置成员角色</h3>
        <p className="text-xs mb-5" style={{ color: COLORS.muted }}>{user.name || user.username || `用户${user.id}`}{user.phone ? ` · ${user.phone}` : ""}</p>

        <div className="mb-4">
          <p className="text-xs font-medium mb-2" style={{ color: COLORS.muted }}>角色</p>
          <div className="grid grid-cols-2 gap-2">
            {[
              { value: 'petshop', label: '宠物店' },
              { value: 'investor', label: '投资人' },
              { value: 'promoter', label: '地推' },
              { value: 'manufacturer', label: '厂家' },
            ].map((r) => (
              <button key={r.value}
                className="py-2.5 rounded-2xl text-sm font-medium transition-colors"
                style={{
                  background: role === r.value ? COLORS.primary : COLORS.card,
                  color: role === r.value ? '#fff' : COLORS.dark,
                  border: `1.5px solid ${role === r.value ? COLORS.primary : COLORS.border}`,
                }}
                onClick={() => setRole(role === r.value ? null : r.value)}
              >{r.label}</button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between mb-4 px-4 py-3 rounded-2xl" style={{ background: COLORS.card, border: `1.5px solid ${COLORS.border}` }}>
          <div>
            <p className="text-sm font-medium" style={{ color: COLORS.dark }}>宠物平台管理员</p>
            <p className="text-xs" style={{ color: COLORS.muted }}>可管理成员和机器</p>
          </div>
          <button
            className="w-12 h-6 rounded-full transition-colors relative flex-shrink-0"
            style={{ background: isAdmin ? COLORS.primary : COLORS.border }}
            onClick={() => setIsAdmin(!isAdmin)}
          >
            <div className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all"
              style={{ left: isAdmin ? '26px' : '2px' }} />
          </button>
        </div>

        <div className="mb-5">
          <label className="text-xs font-medium mb-1.5 block" style={{ color: COLORS.muted }}>备注（可选）</label>
          <input type="text" placeholder="如：XX宠物店、XX投资人" value={remark} onChange={(e) => setRemark(e.target.value)}
            className="w-full rounded-2xl px-4 py-3 text-sm focus:outline-none"
            style={{ background: COLORS.card, border: `1.5px solid ${COLORS.border}`, color: COLORS.dark }} />
        </div>

        <div className="flex space-x-3">
          {(user.petRole || user.petIsAdmin) && (
            <button
              className="flex-1 rounded-2xl py-3 text-sm font-bold transition-opacity active:opacity-70"
              style={{ background: COLORS.lightBg, color: COLORS.muted, border: `1.5px solid ${COLORS.border}` }}
              disabled={isSaving}
              onClick={() => onSave(null, false, "")}
            >移除角色</button>
          )}
          <button
            className="flex-1 rounded-2xl py-3 text-sm font-bold text-white transition-opacity active:opacity-80 disabled:opacity-40"
            style={{ background: `linear-gradient(135deg, ${COLORS.primary}, #8B3A1E)` }}
            disabled={isSaving || (!role && !isAdmin)}
            onClick={() => onSave(role as any, isAdmin, remark)}
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ===== 管理面板：成员管理 =====
function AdminMembersPanel({ onBack }: { onBack: () => void }) {
  const [searchInput, setSearchInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const [tab, setTab] = useState<'list' | 'search'>('list');
  const [editingUser, setEditingUser] = useState<any>(null);

  const { data: members, isLoading: membersLoading, refetch: refetchMembers } = trpc.pet.adminGetUsers.useQuery();
  const { data: searchResults, isLoading: searchLoading } = trpc.pet.adminSearchUsers.useQuery(
    { keyword },
    { enabled: keyword.length >= 1 }
  );

  const setRole = trpc.pet.adminSetUserRole.useMutation({
    onSuccess: () => { centerToast.success("设置成功"); refetchMembers(); setEditingUser(null); },
    onError: (e) => centerToast.error(`设置失败：${e.message}`),
  });

  const displayList = tab === 'search' ? (searchResults ?? []) : (members ?? []);

  return (
    <div className="min-h-screen pb-8" style={{ background: COLORS.bg }}>
      <div className="px-4 pt-12 pb-4 flex items-center space-x-3" style={{ background: COLORS.card, borderBottom: `1px solid ${COLORS.border}` }}>
        <button onClick={onBack} className="w-9 h-9 flex items-center justify-center rounded-full active:opacity-70" style={{ background: COLORS.lightBg }}>
          <ChevronLeft className="w-5 h-5" style={{ color: COLORS.dark }} />
        </button>
        <div className="flex items-center space-x-2">
          <Users className="w-5 h-5" style={{ color: COLORS.primary }} />
          <h1 className="text-base font-bold" style={{ color: COLORS.dark }}>成员管理</h1>
        </div>
      </div>

      <div className="px-4 pt-4 pb-2">
        <div className="flex items-center space-x-2 rounded-2xl px-4 py-2.5" style={{ background: COLORS.card, border: `1.5px solid ${COLORS.border}` }}>
          <Search className="w-4 h-4 flex-shrink-0" style={{ color: COLORS.muted }} />
          <input
            className="flex-1 text-sm bg-transparent focus:outline-none"
            style={{ color: COLORS.dark }}
            placeholder="搜索姓名 / 手机号 / 用户名"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          {searchInput && (
            <button onClick={() => { setSearchInput(""); setKeyword(""); setTab('list'); }}>
              <X className="w-4 h-4" style={{ color: COLORS.muted }} />
            </button>
          )}
          <button
            className="text-xs font-bold px-3 py-1 rounded-xl"
            style={{ background: COLORS.primary, color: "#fff" }}
            onClick={() => { if (searchInput.trim()) { setKeyword(searchInput.trim()); setTab('search'); } }}
          >搜索</button>
        </div>
      </div>

      <div className="flex px-4 pb-3 space-x-2">
        <button
          className="text-xs font-bold px-3 py-1.5 rounded-xl"
          style={{ background: tab === 'list' ? COLORS.primary : COLORS.lightBg, color: tab === 'list' ? '#fff' : COLORS.muted }}
          onClick={() => setTab('list')}
        >已分配成员</button>
        {keyword && (
          <button
            className="text-xs font-bold px-3 py-1.5 rounded-xl"
            style={{ background: tab === 'search' ? COLORS.primary : COLORS.lightBg, color: tab === 'search' ? '#fff' : COLORS.muted }}
            onClick={() => setTab('search')}
          >搜索结果</button>
        )}
      </div>

      <div className="px-4 space-y-2">
        {(tab === 'list' ? membersLoading : searchLoading) ? (
          <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin" style={{ color: COLORS.border }} /></div>
        ) : displayList.length === 0 ? (
          <div className="flex flex-col items-center py-12">
            <Users className="w-10 h-10 mb-2 opacity-20" style={{ color: COLORS.muted }} />
            <p className="text-sm" style={{ color: COLORS.muted }}>{tab === 'list' ? '暂无成员' : '未找到用户'}</p>
          </div>
        ) : (
          displayList.map((u: any) => (
            <div key={u.id} className="rounded-2xl p-4" style={{ background: COLORS.card, border: `1.5px solid ${COLORS.border}` }}>
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                    <span className="text-sm font-bold" style={{ color: COLORS.dark }}>{u.name || u.username || `用户${u.id}`}</span>
                    {u.phone && <span className="text-xs" style={{ color: COLORS.muted }}>{u.phone}</span>}
                    {u.petIsAdmin && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: "#FEE2E2", color: "#991B1B" }}>管理员</span>
                    )}
                    {u.petRole && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={ROLE_BADGE[u.petRole] ?? ROLE_BADGE.petshop}>
                        {ROLE_LABELS[u.petRole] ?? u.petRole}
                      </span>
                    )}
                  </div>
                  {u.petRemark && <p className="text-xs mt-0.5" style={{ color: COLORS.muted }}>{u.petRemark}</p>}
                </div>
                <button
                  className="ml-2 w-8 h-8 flex items-center justify-center rounded-xl flex-shrink-0"
                  style={{ background: COLORS.lightBg }}
                  onClick={() => setEditingUser(u)}
                >
                  <Pencil className="w-3.5 h-3.5" style={{ color: COLORS.primary }} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {editingUser && (
        <EditRoleModal
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onSave={(role, isAdmin, remark) => setRole.mutate({ userId: editingUser.id, role, isAdmin, remark })}
          isSaving={setRole.isPending}
        />
      )}
    </div>
  );
}

// ===== 机器编辑弹窗 =====
function MachineEditModal({ machine, isNew, onClose, onSave, isSaving }: {
  machine: any;
  isNew: boolean;
  onClose: () => void;
  onSave: (data: any) => void;
  isSaving: boolean;
}) {
  const [machineNo, setMachineNo] = useState(machine.machineNo ?? "");
  const [name, setName] = useState(machine.name ?? "");
  const [petshopName, setPetshopName] = useState(machine.petshopName ?? "");
  const [address, setAddress] = useState(machine.address ?? "");
  const [installDate, setInstallDate] = useState(machine.installDate ?? "");
  const [status, setStatus] = useState<'active' | 'inactive' | 'maintenance'>(machine.status ?? 'active');
  const [petshopRatio, setPetshopRatio] = useState(String(machine.ratios?.petshop ?? 40));
  const [investorRatio, setInvestorRatio] = useState(String(machine.ratios?.investor ?? 35));
  const [promoterRatio, setPromoterRatio] = useState(String(machine.ratios?.promoter ?? 10));
  const [manufacturerRatio, setManufacturerRatio] = useState(String(machine.ratios?.manufacturer ?? 15));

  const totalRatio = [petshopRatio, investorRatio, promoterRatio, manufacturerRatio]
    .reduce((s, v) => s + (parseFloat(v) || 0), 0);

  const inputStyle = { background: COLORS.card, border: `1.5px solid ${COLORS.border}`, color: COLORS.dark };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-t-3xl shadow-2xl overflow-y-auto" style={{ background: COLORS.bg, maxHeight: '90vh' }}>
        <div className="sticky top-0 px-5 pt-5 pb-3" style={{ background: COLORS.bg }}>
          <div className="flex justify-center mb-3">
            <div className="w-10 h-1 rounded-full" style={{ background: COLORS.border }} />
          </div>
          <h3 className="text-base font-bold" style={{ color: COLORS.dark }}>{isNew ? "添加机器" : "编辑机器"}</h3>
        </div>

        <div className="px-5 pb-10 space-y-4">
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: COLORS.muted }}>机器编号 *</label>
            <input type="text" placeholder="如：HJ-001" value={machineNo} onChange={(e) => setMachineNo(e.target.value)}
              className="w-full rounded-2xl px-4 py-3 text-sm focus:outline-none" style={inputStyle} />
          </div>
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: COLORS.muted }}>机器名称/备注</label>
            <input type="text" placeholder="如：北京朝阳1号机" value={name} onChange={(e) => setName(e.target.value)}
              className="w-full rounded-2xl px-4 py-3 text-sm focus:outline-none" style={inputStyle} />
          </div>
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: COLORS.muted }}>宠物店名称</label>
            <input type="text" placeholder="如：XX宠物店" value={petshopName} onChange={(e) => setPetshopName(e.target.value)}
              className="w-full rounded-2xl px-4 py-3 text-sm focus:outline-none" style={inputStyle} />
          </div>
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: COLORS.muted }}>地址</label>
            <input type="text" placeholder="机器安装地址" value={address} onChange={(e) => setAddress(e.target.value)}
              className="w-full rounded-2xl px-4 py-3 text-sm focus:outline-none" style={inputStyle} />
          </div>
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: COLORS.muted }}>安装日期</label>
            <input type="date" value={installDate} onChange={(e) => setInstallDate(e.target.value)}
              className="w-full rounded-2xl px-4 py-3 text-sm focus:outline-none" style={inputStyle} />
          </div>

          <div>
            <label className="text-xs font-medium mb-2 block" style={{ color: COLORS.muted }}>状态</label>
            <div className="grid grid-cols-3 gap-2">
              {(['active', 'inactive', 'maintenance'] as const).map((s) => (
                <button key={s}
                  className="py-2 rounded-2xl text-xs font-medium"
                  style={{
                    background: status === s ? COLORS.primary : COLORS.card,
                    color: status === s ? '#fff' : COLORS.dark,
                    border: `1.5px solid ${status === s ? COLORS.primary : COLORS.border}`,
                  }}
                  onClick={() => setStatus(s)}
                >{STATUS_LABELS[s].label}</button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium" style={{ color: COLORS.muted }}>分润比例（%）</label>
              <span className="text-xs font-bold" style={{ color: Math.abs(totalRatio - 100) < 0.01 ? COLORS.green : COLORS.primary }}>
                合计 {totalRatio.toFixed(0)}%{Math.abs(totalRatio - 100) < 0.01 ? " ✓" : "（需等于100%）"}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "宠物店", value: petshopRatio, set: setPetshopRatio },
                { label: "投资人", value: investorRatio, set: setInvestorRatio },
                { label: "地推", value: promoterRatio, set: setPromoterRatio },
                { label: "厂家", value: manufacturerRatio, set: setManufacturerRatio },
              ].map((item) => (
                <div key={item.label}>
                  <label className="text-[10px] mb-1 block" style={{ color: COLORS.muted }}>{item.label}</label>
                  <input type="number" min="0" max="100" step="1" value={item.value}
                    onChange={(e) => item.set(e.target.value)}
                    className="w-full rounded-xl px-3 py-2 text-sm focus:outline-none" style={inputStyle} />
                </div>
              ))}
            </div>
          </div>

          <button
            className="w-full rounded-2xl py-3.5 text-sm font-bold text-white transition-opacity active:opacity-80 disabled:opacity-40"
            style={{ background: `linear-gradient(135deg, ${COLORS.primary}, #8B3A1E)` }}
            disabled={!machineNo.trim() || isSaving}
            onClick={() => onSave({
              id: isNew ? undefined : machine.id,
              machineNo: machineNo.trim(),
              name: name.trim() || undefined,
              petshopName: petshopName.trim() || undefined,
              address: address.trim() || undefined,
              installDate: installDate || undefined,
              status,
              petshopRatio: parseFloat(petshopRatio) || 40,
              investorRatio: parseFloat(investorRatio) || 35,
              promoterRatio: parseFloat(promoterRatio) || 10,
              manufacturerRatio: parseFloat(manufacturerRatio) || 15,
            })}
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : (isNew ? "添加" : "保存修改")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ===== 管理面板：机器管理 =====
function AdminMachinesPanel({ onBack }: { onBack: () => void }) {
  const [editingMachine, setEditingMachine] = useState<any>(null);
  const [isNew, setIsNew] = useState(false);

  const { data: machines, isLoading, refetch } = trpc.pet.getMyMachines.useQuery();

  const upsertMachine = trpc.pet.adminUpsertMachine.useMutation({
    onSuccess: () => { centerToast.success(isNew ? "添加成功" : "更新成功"); refetch(); setEditingMachine(null); },
    onError: (e) => centerToast.error(`操作失败：${e.message}`),
  });

  return (
    <div className="min-h-screen pb-8" style={{ background: COLORS.bg }}>
      <div className="px-4 pt-12 pb-4 flex items-center justify-between" style={{ background: COLORS.card, borderBottom: `1px solid ${COLORS.border}` }}>
        <div className="flex items-center space-x-3">
          <button onClick={onBack} className="w-9 h-9 flex items-center justify-center rounded-full active:opacity-70" style={{ background: COLORS.lightBg }}>
            <ChevronLeft className="w-5 h-5" style={{ color: COLORS.dark }} />
          </button>
          <div className="flex items-center space-x-2">
            <Cpu className="w-5 h-5" style={{ color: COLORS.primary }} />
            <h1 className="text-base font-bold" style={{ color: COLORS.dark }}>机器管理</h1>
          </div>
        </div>
        <button
          className="flex items-center space-x-1 text-xs font-bold px-3 py-1.5 rounded-xl"
          style={{ background: COLORS.primary, color: "#fff" }}
          onClick={() => { setIsNew(true); setEditingMachine({}); }}
        >
          <Plus className="w-3.5 h-3.5" />
          <span>添加机器</span>
        </button>
      </div>

      <div className="px-4 pt-4 space-y-3">
        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin" style={{ color: COLORS.border }} /></div>
        ) : !machines || machines.length === 0 ? (
          <div className="flex flex-col items-center py-12">
            <img src={EMPTY_IMG} alt="暂无机器" className="w-40 h-40 object-contain mb-3 opacity-70" />
            <p className="text-sm" style={{ color: COLORS.muted }}>暂无机器，点击右上角添加</p>
          </div>
        ) : (
          machines.map((m: any) => {
            const status = STATUS_LABELS[m.status] ?? STATUS_LABELS.active;
            return (
              <div key={m.id} className="rounded-2xl p-4" style={{ background: COLORS.card, border: `1.5px solid ${COLORS.border}` }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: COLORS.lightBg }}>
                      <img src={MACHINE_IMG} alt="机器" className="w-8 h-8 object-contain" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-bold" style={{ color: COLORS.dark }}>{m.machineNo}</span>
                        {m.name && <span className="text-xs" style={{ color: COLORS.muted }}>{m.name}</span>}
                      </div>
                      <div className="flex items-center space-x-1.5 mt-0.5">
                        <div className="w-1.5 h-1.5 rounded-full" style={{ background: status.dot }} />
                        <span className="text-[11px]" style={{ color: status.color }}>{status.label}</span>
                        {m.petshopName && <span className="text-[11px]" style={{ color: COLORS.muted }}>· {m.petshopName}</span>}
                      </div>
                    </div>
                  </div>
                  <button
                    className="ml-2 w-8 h-8 flex items-center justify-center rounded-xl flex-shrink-0"
                    style={{ background: COLORS.lightBg }}
                    onClick={() => { setIsNew(false); setEditingMachine(m); }}
                  >
                    <Pencil className="w-3.5 h-3.5" style={{ color: COLORS.primary }} />
                  </button>
                </div>
                <div className="grid grid-cols-4 gap-1 mt-3">
                  {[
                    { label: "店", ratio: m.ratios?.petshop ?? 40 },
                    { label: "投", ratio: m.ratios?.investor ?? 35 },
                    { label: "推", ratio: m.ratios?.promoter ?? 10 },
                    { label: "厂", ratio: m.ratios?.manufacturer ?? 15 },
                  ].map((item) => (
                    <div key={item.label} className="rounded-xl px-2 py-1.5 text-center" style={{ background: COLORS.lightBg }}>
                      <p className="text-[10px]" style={{ color: COLORS.muted }}>{item.label}</p>
                      <p className="text-xs font-bold" style={{ color: COLORS.dark }}>{item.ratio}%</p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>

      {editingMachine !== null && (
        <MachineEditModal
          machine={editingMachine}
          isNew={isNew}
          onClose={() => setEditingMachine(null)}
          onSave={(data) => upsertMachine.mutate(data)}
          isSaving={upsertMachine.isPending}
        />
      )}
    </div>
  );
}

// ===== 管理面板首页 =====
function AdminPanel({ onBack }: { onBack: () => void }) {
  const [view, setView] = useState<'home' | 'members' | 'machines'>('home');

  if (view === 'members') return <AdminMembersPanel onBack={() => setView('home')} />;
  if (view === 'machines') return <AdminMachinesPanel onBack={() => setView('home')} />;

  return (
    <div className="min-h-screen pb-8" style={{ background: COLORS.bg }}>
      <div className="px-4 pt-12 pb-4 flex items-center space-x-3" style={{ background: COLORS.card, borderBottom: `1px solid ${COLORS.border}` }}>
        <button onClick={onBack} className="w-9 h-9 flex items-center justify-center rounded-full active:opacity-70" style={{ background: COLORS.lightBg }}>
          <ChevronLeft className="w-5 h-5" style={{ color: COLORS.dark }} />
        </button>
        <div className="flex items-center space-x-2">
          <Settings className="w-5 h-5" style={{ color: COLORS.primary }} />
          <h1 className="text-base font-bold" style={{ color: COLORS.dark }}>管理后台</h1>
        </div>
      </div>

      <div className="px-4 pt-6 space-y-3">
        {[
          { icon: Users, label: "成员管理", desc: "分配角色、设置管理员权限", view: 'members' as const },
          { icon: Cpu, label: "机器管理", desc: "添加/编辑机器及分润比例", view: 'machines' as const },
        ].map((item) => (
          <button key={item.view}
            className="w-full rounded-3xl p-5 flex items-center space-x-4 active:scale-[0.99] transition-transform"
            style={{ background: COLORS.card, border: `1.5px solid ${COLORS.border}`, boxShadow: "0 2px 12px rgba(92,61,30,0.08)" }}
            onClick={() => setView(item.view)}
          >
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: `${COLORS.primary}15` }}>
              <item.icon className="w-6 h-6" style={{ color: COLORS.primary }} />
            </div>
            <div className="flex-1 text-left">
              <p className="text-sm font-bold" style={{ color: COLORS.dark }}>{item.label}</p>
              <p className="text-xs mt-0.5" style={{ color: COLORS.muted }}>{item.desc}</p>
            </div>
            <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: COLORS.border }} />
          </button>
        ))}
      </div>
    </div>
  );
}

// ===== 主页面 =====
export default function PetPlatform() {
  const [, navigate] = useLocation();
  const [recordingMachine, setRecordingMachine] = useState<any>(null);
  const [detailMachine, setDetailMachine] = useState<any>(null);
  const [showAdmin, setShowAdmin] = useState(false);

  const { data: roleData, isLoading: roleLoading } = trpc.pet.getMyRole.useQuery();
  const { data: machines, isLoading: machinesLoading, refetch } = trpc.pet.getMyMachines.useQuery();

  const isAdmin = roleData?.isAdmin ?? false;
  const userRole = isAdmin ? "admin" : (roleData?.role ?? "petshop");
  const badge = ROLE_BADGE[userRole] ?? ROLE_BADGE.petshop;

  const totalTodayRevenue = (machines ?? []).reduce((s: number, m: any) => s + m.today.revenue, 0);
  const totalTodayProfit = (machines ?? []).reduce((s: number, m: any) => s + m.today.myProfit, 0);
  const totalMonthRevenue = (machines ?? []).reduce((s: number, m: any) => s + m.month.revenue, 0);
  const totalMonthProfit = (machines ?? []).reduce((s: number, m: any) => s + m.month.myProfit, 0);

  if (showAdmin) return <AdminPanel onBack={() => setShowAdmin(false)} />;
  if (detailMachine) return <MachineDetail machine={detailMachine} userRole={userRole} onBack={() => setDetailMachine(null)} />;

  return (
    <div className="min-h-screen pb-10" style={{ background: COLORS.bg }}>
      {/* 顶部横幅 */}
      <div className="relative">
        <img
          src="https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/pet-platform/banner-teddy-cat-h2.webp"
          alt="宠物氢氧健康舱"
          className="w-full object-contain object-top"
          style={{ display: "block" }}
        />
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 pt-3 pb-2">
          <div className="flex items-center space-x-2">
            <button onClick={() => navigate("/")} className="w-8 h-8 flex items-center justify-center rounded-full active:opacity-70" style={{ background: "rgba(0,0,0,0.22)" }}>
              <ChevronLeft className="w-5 h-5 text-white" />
            </button>
            <img
              src="https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/pet-platform/hageme-logo-transparent.png?v=3"
              alt="HaGeeMe"
              className="h-20 w-auto object-contain"
              style={{ filter: 'drop-shadow(0 1px 4px rgba(0,0,0,0.3))' }}
            />
          </div>
          <button onClick={() => window.location.reload()} className="text-white text-xs font-bold px-4 py-1.5 rounded-full active:opacity-80 shadow-md" style={{ background: "#2A9D8F", letterSpacing: "0.05em" }}>
            刷新
          </button>
        </div>
      </div>

      {/* 内容区 */}
      <div style={{ background: COLORS.bg }}>
        {!roleLoading && (
          <div className="flex items-center space-x-2 px-4 pt-4 pb-0">
            <span className="text-xs font-bold px-3 py-1 rounded-full" style={{ background: badge.bg, color: badge.text }}>
              {ROLE_LABELS[userRole] ?? "访客"}
            </span>
            {roleData?.remark && <span className="text-xs" style={{ color: COLORS.muted }}>{roleData.remark}</span>}
          </div>
        )}

        {/* 汇总数据 */}
        <div className="px-4 pt-3 pb-2">
          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-2xl px-4 py-3.5" style={{ background: `linear-gradient(135deg, ${COLORS.primary}, #8B3A1E)` }}>
              <p className="text-white/80 text-[10px] font-medium mb-1">今日总营业额</p>
              <p className="text-white text-xl font-bold">¥{totalTodayRevenue.toFixed(2)}</p>
            </div>
            <div className="rounded-2xl px-4 py-3.5" style={{ background: `linear-gradient(135deg, #C97A55, ${COLORS.primary})` }}>
              <p className="text-white/80 text-[10px] font-medium mb-1">今日{userRole === "admin" ? "总收入" : "我的分润"}</p>
              <p className="text-white text-xl font-bold">¥{totalTodayProfit.toFixed(2)}</p>
            </div>
            <div className="rounded-2xl px-4 py-3" style={{ background: COLORS.card, border: `1.5px solid ${COLORS.border}` }}>
              <p className="text-[10px] mb-0.5" style={{ color: COLORS.muted }}>本月营业额</p>
              <p className="text-base font-semibold" style={{ color: COLORS.dark }}>¥{totalMonthRevenue.toFixed(2)}</p>
            </div>
            <div className="rounded-2xl px-4 py-3" style={{ background: COLORS.card, border: `1.5px solid ${COLORS.border}` }}>
              <p className="text-[10px] mb-0.5" style={{ color: COLORS.primary }}>本月{userRole === "admin" ? "总收入" : "我的分润"}</p>
              <p className="text-base font-semibold" style={{ color: COLORS.primary }}>¥{totalMonthProfit.toFixed(2)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* 机器列表 */}
      <div className="px-4 pt-3" style={{ background: COLORS.bg }}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <div className="w-1 h-4 rounded-full" style={{ background: COLORS.primary }} />
            <h2 className="text-sm font-bold" style={{ color: COLORS.dark }}>
              我的机器
              {machines && <span className="ml-1.5 text-xs font-normal" style={{ color: COLORS.muted }}>共 {machines.length} 台</span>}
            </h2>
          </div>
          {isAdmin && (
            <button
              className="flex items-center space-x-1 text-xs font-medium px-3 py-1.5 rounded-full active:opacity-70"
              style={{ background: `${COLORS.primary}15`, color: COLORS.primary }}
              onClick={() => setShowAdmin(true)}
            >
              <Settings className="w-3.5 h-3.5" />
              <span>管理后台</span>
            </button>
          )}
        </div>

        {roleLoading || machinesLoading ? (
          <div className="flex flex-col items-center py-16">
            <Loader2 className="w-6 h-6 animate-spin mb-3" style={{ color: COLORS.border }} />
            <p className="text-sm" style={{ color: COLORS.muted }}>加载中...</p>
          </div>
        ) : !roleData && !isAdmin ? (
          <div className="flex flex-col items-center py-10">
            <img src={EMPTY_IMG} alt="暂无数据" className="w-48 h-48 object-contain mb-3 opacity-80" />
            <p className="text-sm font-medium" style={{ color: COLORS.dark }}>您尚未分配宠物平台角色</p>
            <p className="text-xs mt-1" style={{ color: COLORS.muted }}>请联系管理员开通权限</p>
          </div>
        ) : !machines || machines.length === 0 ? (
          <div className="flex flex-col items-center py-10">
            <img src={EMPTY_IMG} alt="暂无机器" className="w-48 h-48 object-contain mb-3 opacity-80" />
            <p className="text-sm font-medium" style={{ color: COLORS.dark }}>暂无关联机器</p>
            <p className="text-xs mt-1" style={{ color: COLORS.muted }}>请联系管理员添加</p>
          </div>
        ) : (
          <div className="space-y-3">
            {machines.map((machine: any) => (
              <MachineCard key={machine.id} machine={machine} userRole={userRole} onRecord={setRecordingMachine} onDetail={setDetailMachine} />
            ))}
          </div>
        )}
      </div>

      {recordingMachine && (
        <RecordModal machine={recordingMachine} onClose={() => setRecordingMachine(null)} onSuccess={() => refetch()} />
      )}
    </div>
  );
}
