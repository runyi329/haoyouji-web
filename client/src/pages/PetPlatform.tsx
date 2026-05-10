import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Loader2, ChevronLeft, PawPrint, Calendar, MapPin, Settings, RefreshCw, ChevronRight } from "lucide-react";
import { centerToast } from "@/components/ui/center-toast";

// 角色中文名映射
const ROLE_LABELS: Record<string, string> = {
  manufacturer: "厂家",
  investor: "投资人",
  promoter: "地推",
  petshop: "宠物店",
  admin: "管理员",
};

// 角色主题色
const ROLE_COLORS: Record<string, { bg: string; text: string; badge: string }> = {
  manufacturer: { bg: "bg-blue-50", text: "text-blue-700", badge: "bg-blue-100 text-blue-700" },
  investor: { bg: "bg-amber-50", text: "text-amber-700", badge: "bg-amber-100 text-amber-700" },
  promoter: { bg: "bg-green-50", text: "text-green-700", badge: "bg-green-100 text-green-700" },
  petshop: { bg: "bg-purple-50", text: "text-purple-700", badge: "bg-purple-100 text-purple-700" },
  admin: { bg: "bg-red-50", text: "text-red-700", badge: "bg-red-100 text-red-700" },
};

// 机器状态
const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  active: { label: "运行中", color: "text-green-600" },
  inactive: { label: "未启用", color: "text-gray-400" },
  maintenance: { label: "维护中", color: "text-orange-500" },
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
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white rounded-t-3xl p-5 pb-8 shadow-2xl">
        <div className="flex justify-center mb-4">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>
        <h3 className="text-base font-bold text-gray-800 mb-1">录入营业额</h3>
        <p className="text-xs text-gray-400 mb-4">机器：{machine.machineNo} {machine.name ? `· ${machine.name}` : ""}</p>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">日期</label>
            <input
              type="date"
              value={date}
              max={today}
              onChange={(e) => setDate(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:border-[#A80000]"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">营业额（元）</label>
            <input
              type="number"
              placeholder="请输入今日营业额"
              value={revenue}
              onChange={(e) => setRevenue(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:border-[#A80000]"
              min="0"
              step="0.01"
            />
          </div>
          {revenue && !isNaN(parseFloat(revenue)) && (
            <div className="bg-gray-50 rounded-xl p-3 space-y-1.5">
              <p className="text-xs font-medium text-gray-600 mb-2">预计分润</p>
              {[
                { label: "宠物店", ratio: machine.ratios?.petshop ?? 40 },
                { label: "投资人", ratio: machine.ratios?.investor ?? 35 },
                { label: "地推", ratio: machine.ratios?.promoter ?? 10 },
                { label: "厂家", ratio: machine.ratios?.manufacturer ?? 15 },
              ].map((item) => (
                <div key={item.label} className="flex justify-between text-xs">
                  <span className="text-gray-500">{item.label}（{item.ratio}%）</span>
                  <span className="font-medium text-gray-800">
                    ¥{((parseFloat(revenue) * item.ratio) / 100).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <button
          className="w-full mt-4 bg-[#A80000] text-white rounded-xl py-3 text-sm font-semibold active:opacity-80 disabled:opacity-50"
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
      className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden active:scale-[0.99] transition-transform"
      onClick={() => onDetail(machine)}
    >
      {/* 卡片头部 */}
      <div className="flex items-center justify-between px-4 pt-3.5 pb-2.5 border-b border-gray-50">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-[#FFF0F0] rounded-xl flex items-center justify-center">
            <PawPrint className="w-4 h-4 text-[#A80000]" />
          </div>
          <div>
            <div className="flex items-center space-x-1.5">
              <span className="text-sm font-bold text-gray-800">{machine.machineNo}</span>
              {machine.name && <span className="text-xs text-gray-400">{machine.name}</span>}
            </div>
            <span className={`text-[10px] font-medium ${status.color}`}>{status.label}</span>
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-gray-300" />
      </div>

      {/* 地址/门店 */}
      {(machine.petshopName || machine.address) && (
        <div className="flex items-center space-x-1 px-4 py-2 border-b border-gray-50">
          <MapPin className="w-3 h-3 text-gray-300 flex-shrink-0" />
          <span className="text-xs text-gray-400 truncate">
            {machine.petshopName || machine.address}
          </span>
        </div>
      )}

      {/* 数据区 */}
      <div className="grid grid-cols-2 divide-x divide-gray-50 px-0">
        <div className="px-4 py-3">
          <p className="text-[10px] text-gray-400 mb-0.5">今日营业额</p>
          <p className="text-lg font-bold text-gray-800">
            ¥{machine.today.revenue.toFixed(2)}
          </p>
        </div>
        <div className="px-4 py-3">
          <p className="text-[10px] text-gray-400 mb-0.5">
            今日{userRole === "admin" ? "总收入" : "我的分润"}
          </p>
          <p className="text-lg font-bold text-[#A80000]">
            ¥{machine.today.myProfit.toFixed(2)}
          </p>
        </div>
      </div>

      {/* 本月 */}
      <div className="grid grid-cols-2 divide-x divide-gray-50 border-t border-gray-50">
        <div className="px-4 py-2.5">
          <p className="text-[10px] text-gray-400 mb-0.5">本月营业额</p>
          <p className="text-sm font-semibold text-gray-700">¥{machine.month.revenue.toFixed(2)}</p>
        </div>
        <div className="px-4 py-2.5">
          <p className="text-[10px] text-gray-400 mb-0.5">
            本月{userRole === "admin" ? "总收入" : "我的分润"}
          </p>
          <p className="text-sm font-semibold text-[#A80000]">¥{machine.month.myProfit.toFixed(2)}</p>
        </div>
      </div>

      {/* 录入按钮（宠物店/管理员） */}
      {canRecord && (
        <div className="px-4 pb-3.5 pt-2 border-t border-gray-50">
          <button
            className="w-full bg-[#FFF0F0] text-[#A80000] rounded-xl py-2 text-xs font-semibold active:opacity-70 transition-opacity"
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

// 机器详情页（历史记录）
function MachineDetail({ machine, userRole, onBack }: { machine: any; userRole: string; onBack: () => void }) {
  const { data: history, isLoading } = trpc.pet.getMachineHistory.useQuery({ machineId: machine.id });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <div className="bg-white px-4 pt-12 pb-4 flex items-center space-x-3 shadow-sm">
        <button onClick={onBack} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 active:bg-gray-200">
          <ChevronLeft className="w-5 h-5 text-gray-600" />
        </button>
        <div>
          <h1 className="text-base font-bold text-gray-800">{machine.machineNo}</h1>
          {machine.name && <p className="text-xs text-gray-400">{machine.name}</p>}
        </div>
      </div>

      <div className="px-4 py-4 space-y-3">
        {/* 机器信息 */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <h3 className="text-xs font-semibold text-gray-500 mb-3">机器信息</h3>
          <div className="space-y-2">
            {machine.address && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">地址</span>
                <span className="text-gray-700">{machine.address}</span>
              </div>
            )}
            {machine.installDate && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">安装日期</span>
                <span className="text-gray-700">{machine.installDate}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">状态</span>
              <span className={STATUS_LABELS[machine.status]?.color ?? "text-gray-700"}>
                {STATUS_LABELS[machine.status]?.label ?? machine.status}
              </span>
            </div>
          </div>
        </div>

        {/* 分润比例 */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <h3 className="text-xs font-semibold text-gray-500 mb-3">分润比例</h3>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "宠物店", ratio: machine.ratios?.petshop ?? 40, highlight: userRole === "petshop" },
              { label: "投资人", ratio: machine.ratios?.investor ?? 35, highlight: userRole === "investor" },
              { label: "地推", ratio: machine.ratios?.promoter ?? 10, highlight: userRole === "promoter" },
              { label: "厂家", ratio: machine.ratios?.manufacturer ?? 15, highlight: userRole === "manufacturer" },
            ].map((item) => (
              <div
                key={item.label}
                className={`rounded-xl p-3 ${item.highlight ? "bg-[#FFF0F0]" : "bg-gray-50"}`}
              >
                <p className="text-xs text-gray-400">{item.label}</p>
                <p className={`text-lg font-bold ${item.highlight ? "text-[#A80000]" : "text-gray-700"}`}>
                  {item.ratio}%
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* 历史记录 */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50">
            <h3 className="text-xs font-semibold text-gray-500">最近30天记录</h3>
          </div>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-gray-300" />
            </div>
          ) : !history || history.length === 0 ? (
            <div className="flex flex-col items-center py-10 text-gray-300">
              <Calendar className="w-8 h-8 mb-2 opacity-40" />
              <p className="text-sm">暂无营业记录</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {history.map((rec: any) => {
                let myProfit = parseFloat(rec.revenue ?? "0");
                if (userRole === "petshop") myProfit = parseFloat(rec.petshop_profit ?? "0");
                else if (userRole === "investor") myProfit = parseFloat(rec.investor_profit ?? "0");
                else if (userRole === "promoter") myProfit = parseFloat(rec.promoter_profit ?? "0");
                else if (userRole === "manufacturer") myProfit = parseFloat(rec.manufacturer_profit ?? "0");
                return (
                  <div key={rec.id} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-gray-700">{rec.record_date}</p>
                      <p className="text-xs text-gray-400">营业额 ¥{parseFloat(rec.revenue).toFixed(2)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-[#A80000]">
                        ¥{myProfit.toFixed(2)}
                      </p>
                      <p className="text-[10px] text-gray-400">
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
  const roleColor = ROLE_COLORS[userRole] ?? ROLE_COLORS.petshop;

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
    <div className="min-h-screen bg-gray-50 pb-8">
      {/* 顶部导航栏 */}
      <div className="bg-[#A80000] px-4 pt-12 pb-6">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => navigate("/")}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-white/20 active:bg-white/30"
          >
            <ChevronLeft className="w-5 h-5 text-white" />
          </button>
          <div className="flex items-center space-x-2">
            <PawPrint className="w-5 h-5 text-white" />
            <span className="text-white font-bold text-base">宠物氢氧健康舱</span>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="text-white text-sm font-medium bg-white/20 active:bg-white/30 px-3 py-1 rounded-full"
          >
            刷新
          </button>
        </div>

        {/* 角色标签 */}
        {!roleLoading && (
          <div className="flex items-center space-x-2 mb-4">
            <span className="bg-white/20 text-white text-xs px-2.5 py-1 rounded-full font-medium">
              {ROLE_LABELS[userRole] ?? "访客"}
            </span>
            {roleData?.remark && (
              <span className="text-white/70 text-xs">{roleData.remark}</span>
            )}
          </div>
        )}

        {/* 汇总数据卡片 */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white/15 rounded-2xl p-3.5">
            <p className="text-white/70 text-[10px] mb-1">今日总营业额</p>
            <p className="text-white text-xl font-bold">¥{totalTodayRevenue.toFixed(2)}</p>
          </div>
          <div className="bg-white/15 rounded-2xl p-3.5">
            <p className="text-white/70 text-[10px] mb-1">
              今日{userRole === "admin" ? "总收入" : "我的分润"}
            </p>
            <p className="text-white text-xl font-bold">¥{totalTodayProfit.toFixed(2)}</p>
          </div>
          <div className="bg-white/10 rounded-2xl p-3">
            <p className="text-white/60 text-[10px] mb-0.5">本月营业额</p>
            <p className="text-white/90 text-base font-semibold">¥{totalMonthRevenue.toFixed(2)}</p>
          </div>
          <div className="bg-white/10 rounded-2xl p-3">
            <p className="text-white/60 text-[10px] mb-0.5">
              本月{userRole === "admin" ? "总收入" : "我的分润"}
            </p>
            <p className="text-white/90 text-base font-semibold">¥{totalMonthProfit.toFixed(2)}</p>
          </div>
        </div>
      </div>

      {/* 机器列表 */}
      <div className="px-4 pt-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-gray-700">
            我的机器
            {machines && <span className="ml-1.5 text-xs text-gray-400 font-normal">共 {machines.length} 台</span>}
          </h2>
          {userRole === "admin" && (
            <button
              className="flex items-center space-x-1 text-xs text-[#A80000] font-medium"
              onClick={() => navigate("/pet-admin")}
            >
              <Settings className="w-3.5 h-3.5" />
              <span>管理后台</span>
            </button>
          )}
        </div>

        {roleLoading || machinesLoading ? (
          <div className="flex flex-col items-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-gray-300 mb-3" />
            <p className="text-sm text-gray-400">加载中...</p>
          </div>
        ) : !roleData && userRole !== "admin" ? (
          <div className="flex flex-col items-center py-16 text-gray-300">
            <PawPrint className="w-12 h-12 mb-3 opacity-30" />
            <p className="text-sm text-gray-400">您尚未分配宠物平台角色</p>
            <p className="text-xs text-gray-300 mt-1">请联系管理员开通权限</p>
          </div>
        ) : !machines || machines.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-gray-300">
            <PawPrint className="w-12 h-12 mb-3 opacity-30" />
            <p className="text-sm text-gray-400">暂无关联机器</p>
            <p className="text-xs text-gray-300 mt-1">请联系管理员添加</p>
          </div>
        ) : (
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
