/**
 * 牙伴齿科管理 - 首页（工作 Tab）
 * 路由：/yaban
 * 蓝色系顶栏 + 白色内容区 + 功能网格
 */
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { ChevronDown, ChevronUp, ScanLine, UserPlus, CalendarPlus, PhoneCall, ArrowDownToLine, ArrowUpFromLine, Grip } from "lucide-react";
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
  const { data: myClinicsResp } = trpc.yabanClinic.myClinics.useQuery();
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

  const currentClinic =
    clinics.find((c) => c.tenantId === currentTenantId)?.name ||
    (clinics.length > 0 ? clinics[0].name : "暂无门店");
  // 门店名过长时按中点均衡折成上下两行（避免“司”字单独掉行），<=8 字不处理
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
      setLocation(route);
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

  return (
    <div className="min-h-screen bg-gray-50">

      {/* 顶部蓝色渐变 Header */}
      <div
        className="text-white sticky top-0 z-40"
        style={{ background: "linear-gradient(135deg, #2196C8 0%, #4DB8E8 100%)" }}
      >
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          {/* 左侧：诊所名称 + 下拉 */}
          <button
            className="flex items-center gap-1.5"
            onClick={() => setShowClinicPicker(!showClinicPicker)}
          >
            <div className="w-6 h-6 rounded bg-white/20 flex items-center justify-center">
              <span className="text-[10px] font-bold">企</span>
            </div>
            <span className="text-sm font-bold text-left leading-tight">
              {clinicNameLines.map((line, i) => (
                <span key={i} className="block">{line}</span>
              ))}
            </span>
            {showClinicPicker ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>
          {/* 右侧：版本切换 + 刷新 + 搜索 + 新增（统一3D圆形图标，切换在最左）*/}
          <div className="flex items-center gap-2">
            <VersionSwitcher variant="inline" />
            <button
              onClick={() => { window.location.reload(); }}
              className="w-8 h-8 rounded-full bg-white shadow-sm flex items-center justify-center overflow-hidden active:scale-95 transition"
              aria-label="刷新"
            >
              <img src="/icon-refresh.webp" alt="" className="w-8 h-8 object-cover rounded-full" />
            </button>
            <button
              onClick={() => toast.info("搜索功能开发中")}
              className="w-8 h-8 rounded-full bg-white shadow-sm flex items-center justify-center overflow-hidden active:scale-95 transition"
              aria-label="搜索"
            >
              <img src="/icon-search.webp" alt="" className="w-8 h-8 object-cover rounded-full" />
            </button>
            <button
              onClick={() => setShowCreateMenu(!showCreateMenu)}
              className="w-8 h-8 rounded-full bg-white shadow-sm flex items-center justify-center overflow-hidden active:scale-95 transition"
              aria-label="新增"
            >
              <img src="/icon-add.webp" alt="" className="w-8 h-8 object-cover rounded-full" />
            </button>
          </div>
        </div>
      </div>

      {/* 右上角「+」新增菜单 - 深色卡片下拉，参考原生样式 */}
      {showCreateMenu && (
        <div className="fixed inset-0 z-50" onClick={() => setShowCreateMenu(false)}>
          <div
            className="absolute top-[52px] right-3 max-w-[200px] rounded-xl overflow-hidden shadow-2xl"
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

      {/* 门店选择下拉面板 - 平铺列表，来自用户实际加入的门店 */}
      {showClinicPicker && (
        <div className="fixed inset-0 z-50 bg-black/20" onClick={() => setShowClinicPicker(false)}>
          <div
            className="absolute top-[56px] left-3 right-3 bg-white max-w-lg mx-auto rounded-xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 标题条 */}
            <div
              className="px-4 py-3 border-b border-gray-100"
              style={{ background: "linear-gradient(135deg, #E8F4FD 0%, #D6EEFB 100%)" }}
            >
              <div className="flex items-center gap-2.5">
                <div
                  className="w-6 h-6 rounded flex items-center justify-center"
                  style={{ background: "linear-gradient(135deg, #2196C8 0%, #4DB8E8 100%)" }}
                >
                  <span className="text-[9px] font-bold text-white">企</span>
                </div>
                <span className="text-[13px] font-bold text-[#1976D2]">我的门店</span>
              </div>
            </div>
            {/* 门店列表 */}
            {clinics.length === 0 ? (
              <div className="px-5 py-6 text-center text-[13px] text-gray-400">暂未加入任何门店</div>
            ) : (
              clinics.map((clinic) => {
                const active = clinic.tenantId === currentTenantId;
                return (
                  <button
                    key={clinic.tenantId}
                    className="w-full flex items-center justify-between px-5 py-3.5 border-b border-gray-100 last:border-b-0"
                    style={active ? { background: "linear-gradient(135deg, #E8F4FD 0%, #D6EEFB 100%)" } : undefined}
                    onClick={() => selectClinic(clinic.tenantId)}
                  >
                    <span className={`text-[13px] ${active ? "font-bold text-[#1976D2]" : "text-gray-700"}`}>
                      {clinic.name}
                    </span>
                    {active && (
                      <span
                        className="text-[11px] text-white px-2.5 py-1 rounded-md font-medium"
                        style={{ background: "linear-gradient(135deg, #2196C8 0%, #4DB8E8 100%)" }}
                      >
                        当前
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* 主内容区 */}
      <div className="max-w-lg mx-auto pb-20">
        {/* 上半部分：功能网格（2行×4列，末位为「更多」） */}
        <div className="bg-white mx-3 mt-3 rounded-xl p-4">
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
              <div className="w-14 h-14 flex items-center justify-center rounded-2xl bg-gray-50">
                <Grip className="w-7 h-7 text-[#2196C8]" strokeWidth={1.8} />
              </div>
              <span className="text-[11px] text-gray-600 text-center leading-tight">更多</span>
            </button>
          </div>
        </div>

        {/* 下半部分：数据报表 / 3D立体月历 */}
        <YabanCalendar />
      </div>

      {/* 底部 Tab 栏 */}
      <YabanTabBar />
    </div>
  );
}
