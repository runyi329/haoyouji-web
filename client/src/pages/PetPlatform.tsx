import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Loader2, ChevronLeft, PawPrint, Calendar, MapPin, Settings, ChevronRight } from "lucide-react";
import { centerToast } from "@/components/ui/center-toast";
import { PageTag } from "@/components/PageTag";

// 插画资源 CDN URL
const BANNER_IMG = "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/pet-platform/banner-teddy-cat-h2.webp";
const EMPTY_IMG = "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/pet/empty-state.webp";
const MACHINE_IMG = "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/pet/machine-icon.webp";

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

// 录入营业额弹窗
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

// 机器卡片
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

// 机器详情页
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

// 主页面
export default function PetPlatform() {
  const [, navigate] = useLocation();
  const [recordingMachine, setRecordingMachine] = useState<any>(null);
  const [detailMachine, setDetailMachine] = useState<any>(null);

  const { data: roleData, isLoading: roleLoading } = trpc.pet.getMyRole.useQuery();
  const { data: machines, isLoading: machinesLoading, refetch } = trpc.pet.getMyMachines.useQuery();

  const userRole = roleData?.role ?? "petshop";
  const badge = ROLE_BADGE[userRole] ?? ROLE_BADGE.petshop;

  // 汇总数据
  const totalTodayRevenue = (machines ?? []).reduce((s: number, m: any) => s + m.today.revenue, 0);
  const totalTodayProfit = (machines ?? []).reduce((s: number, m: any) => s + m.today.myProfit, 0);
  const totalMonthRevenue = (machines ?? []).reduce((s: number, m: any) => s + m.month.revenue, 0);
  const totalMonthProfit = (machines ?? []).reduce((s: number, m: any) => s + m.month.myProfit, 0);

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
      <PageTag code="P161" />
      {/* ===== 顶部插画横幅（完整显示插画） ===== */}
      <div className="relative">
        {/* 插画完整显示，不裁剪 */}
        <img
          src="https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/pet/banner-new.webp"
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
                今日{userRole === "admin" ? "总收入" : "我的分润"}
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
                本月{userRole === "admin" ? "总收入" : "我的分润"}
              </p>
              <p className="text-base font-semibold" style={{ color: COLORS.primary }}>¥{totalMonthProfit.toFixed(2)}</p>
            </div>
          </div>
        </div>
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
              我的机器
              {machines && (
                <span className="ml-1.5 text-xs font-normal" style={{ color: COLORS.muted }}>
                  共 {machines.length} 台
                </span>
              )}
            </h2>
          </div>
          {userRole === "admin" && (
            <button
              className="flex items-center space-x-1 text-xs font-medium px-3 py-1.5 rounded-full active:opacity-70"
              style={{ background: `${COLORS.primary}15`, color: COLORS.primary }}
              onClick={() => navigate("/pet-admin")}
            >
              <Settings className="w-3.5 h-3.5" />
              <span>管理后台</span>
            </button>
          )}
        </div>

        {/* 加载状态 */}
        {roleLoading || machinesLoading ? (
          <div className="flex flex-col items-center py-16">
            <Loader2 className="w-6 h-6 animate-spin mb-3" style={{ color: COLORS.border }} />
            <p className="text-sm" style={{ color: COLORS.muted }}>加载中...</p>
          </div>
        ) : !roleData && userRole !== "admin" ? (
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
                userRole={userRole}
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
