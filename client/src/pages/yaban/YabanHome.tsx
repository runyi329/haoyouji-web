/**
 * 牙伴齿科管理 - 首页（工作 Tab）
 * 路由：/yaban
 * 蓝色系顶栏 + 白色内容区 + 功能网格
 * 权限：员工（clinics 非空）显示工作台；顾客（clinics 为空）显示顾客专属视图
 */
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { ChevronDown, ChevronUp, ScanLine, UserPlus, CalendarPlus, PhoneCall, ArrowDownToLine, ArrowUpFromLine, Grip, MessageCircle, User, Loader2, Building2, Check } from "lucide-react";
import YabanCalendar from "./YabanCalendar";
import YabanTabBar from "./YabanTabBar";
import VersionSwitcher from "@/components/VersionSwitcher";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { loadHomeFeatures } from "./yabanFeatures";

// COS 图标 URL 基础路径
const ICON_BASE = "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/icons/yaban";


// 右上角「+」新增菜单项
const CREATE_MENU = [
  { name: "扫一扫", icon: ScanLine, route: "" },
  { name: "新建顾客", icon: UserPlus, route: "/yaban/patient/create" },
  { name: "新建预约", icon: CalendarPlus, route: "/yaban/schedule/create" },
  { name: "新建随访", icon: PhoneCall, route: "/yaban/followup/create" },
  { name: "新建入库", icon: ArrowDownToLine, route: "/yaban/inventory/inbound" },
  { name: "新建出库", icon: ArrowUpFromLine, route: "/yaban/inventory/outbound" },
];

// ── 顾客专属首页视图 ──────────────────────────────────────────
function CustomerHomeView() {
  const [, setLocation] = useLocation();
  const { data: user } = trpc.auth.me.useQuery();
  const displayName = (user as any)?.name || (user as any)?.username || "顾客";
  const avatar = (user as any)?.avatar as string | undefined;

  return (
    <div className="min-h-screen pb-20" style={{ background: "linear-gradient(180deg, #E8F4FD 0%, #F5F9FE 100%)" }}>
      {/* 顶部蓝色 Header */}
      <div
        className="text-white sticky top-0 z-40"
        style={{ background: "linear-gradient(135deg, #2196C8 0%, #4DB8E8 100%)" }}
      >
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-white/20 flex items-center justify-center">
              <span className="text-[10px] font-bold">牙</span>
            </div>
            <span className="text-sm font-bold">牙伴</span>
          </div>
          <div className="flex items-center gap-2">
            <VersionSwitcher variant="inline" />
          </div>
        </div>
      </div>

      {/* 欢迎卡片 */}
      <div className="max-w-lg mx-auto px-4 mt-6">
        <div
          className="rounded p-5 text-white shadow-lg"
          style={{ background: "linear-gradient(135deg, #2196C8 0%, #4DB8E8 100%)" }}
        >
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-md bg-white/20 ring-2 ring-white/40 overflow-hidden flex items-center justify-center shrink-0">
              {avatar ? (
                <img src={avatar} alt="头像" className="w-full h-full object-cover" />
              ) : (
                <User className="w-7 h-7 text-white" />
              )}
            </div>
            <div>
              <div className="text-base font-bold">你好，{displayName}</div>
              <div className="text-xs text-white/80 mt-0.5">欢迎使用牙伴齿科服务</div>
            </div>
          </div>
        </div>
      </div>

      {/* 微信咨询大按钮 */}
      <div className="max-w-lg mx-auto px-4 mt-5">
        <button
          className="w-full rounded p-5 flex items-center gap-4 shadow-md active:scale-[0.98] transition-transform"
          style={{ background: "linear-gradient(135deg, #1AAD19 0%, #2DC12C 100%)" }}
          onClick={() => setLocation("/yaban/wechat-chat")}
        >
          <div className="w-12 h-12 rounded-md bg-white/20 flex items-center justify-center shrink-0">
            <MessageCircle className="w-7 h-7 text-white" strokeWidth={1.8} />
          </div>
          <div className="text-left flex-1">
            <div className="text-base font-bold text-white">微信咨询</div>
            <div className="text-xs text-white/80 mt-0.5">AI 智能助手在线解答您的问题</div>
          </div>
          <ChevronDown className="w-5 h-5 text-white/60 rotate-[-90deg]" />
        </button>
      </div>

      {/* 快捷入口 */}
      <div className="max-w-lg mx-auto px-4 mt-4">
        <div className="bg-white rounded shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <span className="text-xs font-semibold text-gray-400">我的服务</span>
          </div>
          {[
            { label: "我的积分", hint: "查看积分余额与明细", route: "/yaban/profile" },
            { label: "我的钱包", hint: "查看余额与充值记录", route: "/yaban/wallet" },
            { label: "牙科商城", hint: "浏览并购买牙科产品", route: "/yaban/shop" },
            { label: "我的订单", hint: "查看历史订单与核销", route: "/yaban/shop/my-orders" },
          ].map((item, idx, arr) => (
            <button
              key={item.label}
              className={`w-full flex items-center justify-between px-4 py-3.5 active:bg-[#F0F7FD] transition-colors ${idx !== arr.length - 1 ? "border-b border-gray-100" : ""}`}
              onClick={() => setLocation(item.route)}
            >
              <div className="text-left">
                <div className="text-sm font-medium text-gray-800">{item.label}</div>
                <div className="text-xs text-gray-400 mt-0.5">{item.hint}</div>
              </div>
              <ChevronDown className="w-4 h-4 text-gray-300 rotate-[-90deg]" />
            </button>
          ))}
        </div>
      </div>

      {/* 底部 Tab 栏 */}
      <YabanTabBar />
    </div>
  );
}

export default function YabanHome() {
  const [, setLocation] = useLocation();

  // 入口联动：本次会话首次进入牙伴时，先经过 3D 开始页 /yaban/intro。
  // 进过开始页后标记会一直保留，牙伴内部各页面返回首页时不再重复弹开始页，
  // 避免每次返回都要重新过一遍开机画面。
  useEffect(() => {
    try {
      const entered = sessionStorage.getItem("yaban_intro_entered");
      if (entered !== "1") {
        // 本会话尚未看过开始页，跳转开始页（标记由开始页"进入"按钮写入并保留）
        // 用 replace 替换当前 /yaban 历史项，避免历史栈里同时残留 /yaban 与 /yaban/intro，
        // 从而保证看完开始页进入牙伴后点返回能回到上一个外部页面（如积分商城）
        setLocation("/yaban/intro", { replace: true });
      }
      // entered === "1" 时：已看过开始页，直接停留首页，不再删除标记
    } catch {
      // sessionStorage 不可用时不拦截，直接停留首页
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [showClinicPicker, setShowClinicPicker] = useState(false);
  const [showCreateMenu, setShowCreateMenu] = useState(false);

  // 门店列表：来自当前用户实际加入的门店（参加几家显示几家）
  const { data: myClinicsResp, isLoading: clinicsLoading } = trpc.yabanClinic.myClinics.useQuery();
  const clinics = myClinicsResp?.clinics || [];

  // 当前选中门店 tenantId，持久化到 localStorage 以便跨页面一致
  const [currentTenantId, setCurrentTenantId] = useState<number>(() => {
    try {
      const v = localStorage.getItem("yaban_current_tenant");
      return v ? Number(v) : 0;
    } catch {
      return 0;
    }
  });

  // 默认选中第一家（当未选或选中项不在列表中时）
  useEffect(() => {
    if (clinics.length === 0) return;
    const exists = clinics.some((c) => c.tenantId === currentTenantId);
    if (!currentTenantId || !exists) {
      const tid = clinics[0].tenantId;
      setCurrentTenantId(tid);
      try { localStorage.setItem("yaban_current_tenant", String(tid)); } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinics]);

  const currentClinicObj = clinics.find((c) => c.tenantId === currentTenantId) || clinics[0] || null;
  const currentClinic =
    currentClinicObj?.shortName?.trim() || currentClinicObj?.name?.trim() || "暂无门店";
  // 门店名过长时按中点均衡折成上下两行（避免"司"字单独掉行），<=8 字不处理
  const clinicNameLines = (() => {
    const name = currentClinic || "";
    if (name.length <= 8) return [name];
    const mid = Math.ceil(name.length / 2);
    return [name.slice(0, mid), name.slice(mid)];
  })();

  // 首页快捷功能：按当前门店读取用户自定义配置（未配置时回退默认）
  const homeFeatures = loadHomeFeatures(currentTenantId || null);

  const utils = trpc.useUtils();
  const selectClinic = (tid: number) => {
    if (tid === currentTenantId) {
      setShowClinicPicker(false);
      return;
    }
    setCurrentTenantId(tid);
    try { localStorage.setItem("yaban_current_tenant", String(tid)); } catch {}
    setShowClinicPicker(false);
    // 多门店：切店后失效所有查询缓存，使顾客/统计等数据按新门店重新拉取
    try { utils.invalidate(); } catch {}
    toast.success(`已切换门店`);
  };

  const handleFeatureClick = (name: string, route?: string) => {
    if (route) {
      if (route.startsWith("http")) {
        window.open(route, "_blank");
      } else {
        setLocation(route);
      }
    } else {
      toast.info(`"${name}" 功能开发中，敬请期待`);
    }
  };

  const handleCreateMenuClick = (name: string, route: string) => {
    setShowCreateMenu(false);
    if (route) {
      setLocation(route);
    } else {
      toast.info(`"${name}" 功能开发中，敬请期待`);
    }
  };

  // ── 权限判断：clinics 加载完成后，无门店 = 顾客，显示顾客专属视图 ──
  // 顾客（未加入任何门店）→ 显示顾客专属视图（只在确认加载完且无门店时跳转，避免闪烁）
  if (!clinicsLoading && myClinicsResp && clinics.length === 0) {
    return <CustomerHomeView />;
  }

  return (
    <div className="min-h-screen bg-gray-50">

      {/* 顶部蓝色渐变 Header */}
      <div
        className="text-white sticky top-0 z-40"
        style={{ background: "linear-gradient(135deg, #2196C8 0%, #4DB8E8 100%)" }}
      >
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          {/* 左侧：诊所名称 + 下拉（与 YabanClinicHeader 胶囊样式统一） */}
          <button
            className={`flex items-center gap-1.5 rounded-md border border-white/30 bg-white/15 px-3 py-1 text-white backdrop-blur-sm transition active:scale-[0.97] ${
              clinics.length > 1 ? "cursor-pointer hover:bg-white/25" : "cursor-default"
            }`}
            style={{ transitionTimingFunction: "cubic-bezier(0.23, 1, 0.32, 1)", transitionDuration: "160ms" }}
            onClick={() => clinics.length > 1 && setShowClinicPicker(!showClinicPicker)}
          >
            <Building2 size={15} className="shrink-0 opacity-90" />
            <span className="max-w-[8rem] truncate text-sm font-medium">{currentClinic}</span>
            {clinics.length > 1 && (
              showClinicPicker ? (
                <ChevronUp size={15} className="shrink-0 transition-transform duration-200" />
              ) : (
                <ChevronDown size={15} className="shrink-0 transition-transform duration-200" />
              )
            )}
          </button>
          {/* 右侧：版本切换 + 刷新 + 搜索 + 新增（统一3D圆形图标，切换在最左）*/}
          <div className="flex items-center gap-2">
            <VersionSwitcher variant="inline" />
            <button
              onClick={() => { window.location.reload(); }}
              className="w-8 h-8 rounded-md bg-white shadow-sm flex items-center justify-center overflow-hidden active:scale-95 transition"
              aria-label="刷新"
            >
              <img src="/icon-refresh.webp" alt="" className="w-8 h-8 object-cover rounded-md" />
            </button>
            <button
              onClick={() => toast.info("搜索功能开发中")}
              className="w-8 h-8 rounded-md bg-white shadow-sm flex items-center justify-center overflow-hidden active:scale-95 transition"
              aria-label="搜索"
            >
              <img src="/icon-search.webp" alt="" className="w-8 h-8 object-cover rounded-md" />
            </button>
            <button
              onClick={() => setShowCreateMenu(!showCreateMenu)}
              className="w-8 h-8 rounded-md bg-white shadow-sm flex items-center justify-center overflow-hidden active:scale-95 transition"
              aria-label="新增"
            >
              <img src="/icon-add.webp" alt="" className="w-8 h-8 object-cover rounded-md" />
            </button>
          </div>
        </div>
      </div>

      {/* 右上角「+」新增菜单 - 深色卡片下拉，参考原生样式 */}
      {showCreateMenu && (
        <div className="fixed inset-0 z-50" onClick={() => setShowCreateMenu(false)}>
          <div
            className="absolute top-[52px] right-3 max-w-[200px] rounded-md overflow-hidden shadow-2xl"
            style={{ backgroundColor: "#2C3038" }}
            onClick={(e) => e.stopPropagation()}
          >
            {CREATE_MENU.map((item, idx) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.name}
                  className={`w-full flex items-center gap-3 px-5 py-3.5 active:bg-white/10 ${idx > 0 ? "border-t border-white/10" : ""}`}
                  onClick={() => handleCreateMenuClick(item.name, item.route)}
                >
                  <Icon className="w-5 h-5 text-white shrink-0" strokeWidth={1.8} />
                  <span className="text-[15px] text-white whitespace-nowrap">{item.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 门店选择下拉面板（与 YabanClinicHeader 样式统一） */}
      {showClinicPicker && (
        <div className="fixed inset-0 z-50" onClick={() => setShowClinicPicker(false)}>
          <div
            className="absolute top-[56px] left-4 w-72 origin-top-left overflow-hidden rounded-md border border-gray-100 bg-white shadow-lg"
            style={{ animation: "ybClinicIn 150ms cubic-bezier(0.23, 1, 0.32, 1)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-gray-50 px-3 py-2 text-xs font-medium text-gray-400">
              切换所属医院
            </div>
            <div className="max-h-72 overflow-y-auto py-1">
              {clinics.length === 0 ? (
                <div className="px-3 py-4 text-center text-xs text-gray-400">暂未加入任何门店</div>
              ) : (
                clinics.map((clinic) => {
                  const active = clinic.tenantId === currentTenantId;
                  const isModel = clinic.tenantId === 9999;
                  const label = clinic.name?.trim() || clinic.shortName?.trim() || `门店 ${clinic.tenantId}`;
                  return (
                    <button
                      key={clinic.tenantId}
                      type="button"
                      onClick={() => { selectClinic(clinic.tenantId); setShowClinicPicker(false); }}
                      className={`flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm transition-colors ${
                        active ? "bg-cyan-50 text-cyan-900" : "text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate">{label}</span>
                        {isModel && (
                          <span className="shrink-0 rounded bg-amber-100 px-1 text-[10px] font-semibold text-amber-700">
                            演示
                          </span>
                        )}
                      </span>
                      {active && <Check size={15} className="shrink-0 text-cyan-600" />}
                    </button>
                  );
                })
              )}
            </div>
          </div>
          <style>{`
            @keyframes ybClinicIn {
              from { opacity: 0; transform: scale(0.96) translateY(-4px); }
              to { opacity: 1; transform: scale(1) translateY(0); }
            }
          `}</style>
        </div>
      )}

      {/* 主内容区 */}
      <div className="max-w-lg mx-auto pb-20">
        {/* 上半部分：功能网格（2行×4列，末位为「更多」） */}
        <div className="bg-white mx-3 mt-3 rounded-md p-4">
          <div className="grid grid-cols-4 gap-x-2 gap-y-4">
            {homeFeatures.map((feat, idx) => (
              <button
                key={`${feat.name}-${idx}`}
                className="flex flex-col items-center gap-1.5 active:scale-95 transition-transform relative"
                onClick={() => handleFeatureClick(feat.name, feat.route)}
              >
                <div className="w-14 h-14 flex items-center justify-center overflow-hidden relative">
                  <img src={feat.icon} alt={feat.name} className="w-14 h-14 object-contain" />
                  {feat.badge && (
                    <span className="absolute top-0 right-0 text-[8px] bg-[#2196C8] text-white px-1 rounded-bl">
                      {feat.badge}
                    </span>
                  )}
                </div>
                <span className="text-[11px] text-gray-600 text-center leading-tight">{feat.name}</span>
              </button>
            ))}
            {/* 末位：更多入口 */}
            <button
              className="flex flex-col items-center gap-1.5 active:scale-95 transition-transform"
              onClick={() => setLocation("/yaban/features")}
            >
              <div className="w-14 h-14 flex items-center justify-center rounded bg-gray-50">
                <Grip className="w-7 h-7 text-[#2196C8]" strokeWidth={1.8} />
              </div>
              <span className="text-[11px] text-gray-600 text-center leading-tight">更多</span>
            </button>
          </div>
        </div>

        {/* 下半部分：数据报表 / 3D立体月历 */}
        <YabanCalendar tenantId={currentTenantId} />
      </div>

      {/* 底部 Tab 栏 */}
      <YabanTabBar />
    </div>
  );
}
