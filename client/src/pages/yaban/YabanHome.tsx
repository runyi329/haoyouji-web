/**
 * 牙伴齿科管理 - 首页（工作 Tab）
 * 路由：/yaban
 * 蓝色系顶栏 + 白色内容区 + 功能网格
 */
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { Search, Plus, ChevronDown, ChevronUp, Settings, RefreshCw, ScanLine, UserPlus, CalendarPlus, PhoneCall, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import YabanCalendar from "./YabanCalendar";
import YabanTabBar from "./YabanTabBar";
import { PageTag } from "@/components/PageTag";
import VersionSwitcher from "@/components/VersionSwitcher";
import { toast } from "sonner";

// COS 图标 URL 基础路径
const ICON_BASE = "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/icons/yaban";

// 我常用的
const FREQUENT_FEATURES = [
  { name: "日程", icon: `${ICON_BASE}/richeng.webp`, route: "/yaban/schedule" },
  { name: "顾客", icon: `${ICON_BASE}/huanzhe.webp`, route: "/yaban/patients" },
  { name: "考勤打卡", icon: `${ICON_BASE}/kaoqin_daka.webp`, route: "" },
];

// 更多功能（4列网格）
const MORE_FEATURES = [
  { name: "随访", icon: `${ICON_BASE}/suifang.webp`, route: "/yaban/followup" },
  { name: "运营报表", icon: `${ICON_BASE}/yunying_baobiao.webp`, route: "" },
  { name: "有数", icon: `${ICON_BASE}/youshu.webp`, route: "" },
  { name: "库存", icon: `${ICON_BASE}/kucun.webp`, route: "" },
  { name: "采购", icon: `${ICON_BASE}/caigou.webp`, route: "" },
  { name: "物品", icon: `${ICON_BASE}/wupin.webp`, route: "" },
  { name: "微信咨询", icon: `${ICON_BASE}/weixin_zixun.webp`, route: "" },
  { name: "网络预约", icon: `${ICON_BASE}/wangluo_yuyue.webp`, route: "" },
  { name: "审批", icon: `${ICON_BASE}/shenpi.webp`, route: "" },
  { name: "工作提醒", icon: `${ICON_BASE}/gongzuo_tixing.webp`, route: "" },
  { name: "医患视频", icon: `${ICON_BASE}/yihuan_shipin.webp`, route: "" },
  { name: "运营报表", icon: `${ICON_BASE}/yunying_baobiao_new.webp`, route: "", badge: "新版" },
  { name: "增值服务", icon: `${ICON_BASE}/zengzhi_fuwu.webp`, route: "" },
  { name: "领用", icon: `${ICON_BASE}/lingyong.webp`, route: "" },
  { name: "回访管理", icon: `${ICON_BASE}/huifang_guanli.webp`, route: "" },
  { name: "技加工", icon: `${ICON_BASE}/ji_jiagong.webp`, route: "" },
  { name: "诊所排班", icon: `${ICON_BASE}/zhensuo_paiban.webp`, route: "" },
];

// 诊所/机构数据（模拟）
const CLINICS = [
  {
    company: "上海德盟（内蒙古）口腔门诊有限公司",
    branches: [
      { name: "内蒙古德盟口腔", id: "nmg" },
    ],
  },
  {
    company: "恒愿齿科",
    branches: [
      { name: "总部", id: "hq", children: [
        { name: "恒愿齿科普陀店", id: "putuo" },
        { name: "恒愿齿科北外滩店", id: "beiwaitan" },
      ]},
    ],
  },
];



// 右上角「+」新增菜单项
const CREATE_MENU = [
  { name: "扫一扫", icon: ScanLine, route: "" },
  { name: "新建顾客", icon: UserPlus, route: "/yaban/patient/create" },
  { name: "新建预约", icon: CalendarPlus, route: "/yaban/schedule/create" },
  { name: "新建随访", icon: PhoneCall, route: "/yaban/followup/create" },
  { name: "新建入库", icon: ArrowDownToLine, route: "" },
  { name: "新建出库", icon: ArrowUpFromLine, route: "" },
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
  const { user } = useAuth();
  const [showClinicPicker, setShowClinicPicker] = useState(false);
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const [currentClinic, setCurrentClinic] = useState("恒愿齿科北外滩店");
  const [expandedCompanies, setExpandedCompanies] = useState<string[]>(["恒愿齿科"]);
  const [expandedGroups, setExpandedGroups] = useState<string[]>(["总部"]);

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

  const toggleCompany = (company: string) => {
    setExpandedCompanies((prev) =>
      prev.includes(company) ? prev.filter((c) => c !== company) : [...prev, company]
    );
  };

  const toggleGroup = (group: string) => {
    setExpandedGroups((prev) =>
      prev.includes(group) ? prev.filter((g) => g !== group) : [...prev, group]
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <PageTag code="P300" />

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
            <span className="text-sm font-bold">{currentClinic}</span>
            {showClinicPicker ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>
          {/* 右侧：刷新 + 版本切换 + 搜索 + 新增 */}
          <div className="flex items-center gap-3">
            <button onClick={() => { window.location.reload(); }}>
              <RefreshCw className="w-5 h-5" />
            </button>
            <VersionSwitcher variant="inline" />
            <button onClick={() => toast.info("搜索功能开发中")}>
              <Search className="w-5 h-5" />
            </button>
            <button onClick={() => setShowCreateMenu(!showCreateMenu)}>
              <Plus className="w-5 h-5" />
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

      {/* 诊所选择下拉面板 - 蓝白清爽风格，与牙办首页一致 */}
      {showClinicPicker && (
        <div className="fixed inset-0 z-50 bg-black/20" onClick={() => setShowClinicPicker(false)}>
          <div
            className="absolute top-[56px] left-3 right-3 bg-white max-w-lg mx-auto rounded-xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {CLINICS.map((clinic, ci) => (
              <div key={clinic.company} className={ci > 0 ? "border-t border-gray-100" : ""}>
                {/* 公司名称 */}
                <button
                  className="w-full flex items-center justify-between px-4 py-3.5"
                  style={{ background: "linear-gradient(135deg, #E8F4FD 0%, #D6EEFB 100%)" }}
                  onClick={() => toggleCompany(clinic.company)}
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-6 h-6 rounded flex items-center justify-center"
                      style={{ background: "linear-gradient(135deg, #2196C8 0%, #4DB8E8 100%)" }}
                    >
                      <span className="text-[9px] font-bold text-white">企</span>
                    </div>
                    <span className="text-[13px] font-bold text-[#1976D2]">{clinic.company}</span>
                  </div>
                  {expandedCompanies.includes(clinic.company) ? (
                    <ChevronUp className="w-4 h-4 text-[#2196C8]" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-[#2196C8]" />
                  )}
                </button>
                {/* 分支机构 */}
                {expandedCompanies.includes(clinic.company) &&
                  clinic.branches.map((branch) => (
                    <div key={branch.id}>
                      {branch.children ? (
                        <>
                          <button
                            className="w-full flex items-center justify-between px-5 py-3 border-b border-gray-100"
                            onClick={() => toggleGroup(branch.name)}
                          >
                            <span className="text-[13px] font-medium text-gray-700">{branch.name}</span>
                            {expandedGroups.includes(branch.name) ? (
                              <ChevronUp className="w-4 h-4 text-gray-400" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-gray-400" />
                            )}
                          </button>
                          {expandedGroups.includes(branch.name) &&
                            branch.children.map((child) => {
                              const active = currentClinic === child.name;
                              return (
                                <button
                                  key={child.id}
                                  className="w-full flex items-center justify-between pl-8 pr-4 py-3 border-b border-gray-100"
                                  style={active ? { background: "linear-gradient(135deg, #E8F4FD 0%, #D6EEFB 100%)" } : undefined}
                                  onClick={() => {
                                    setCurrentClinic(child.name);
                                    setShowClinicPicker(false);
                                  }}
                                >
                                  <span className={`text-[13px] ${active ? "font-bold text-[#1976D2]" : "text-gray-600"}`}>
                                    {child.name}
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
                            })}
                        </>
                      ) : (
                        (() => {
                          const active = currentClinic === branch.name;
                          return (
                            <button
                              className="w-full flex items-center justify-between px-5 py-3 border-b border-gray-100"
                              style={active ? { background: "linear-gradient(135deg, #E8F4FD 0%, #D6EEFB 100%)" } : undefined}
                              onClick={() => {
                                setCurrentClinic(branch.name);
                                setShowClinicPicker(false);
                              }}
                            >
                              <span className={`text-[13px] ${active ? "font-bold text-[#1976D2]" : "text-gray-600"}`}>
                                {branch.name}
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
                        })()
                      )}
                    </div>
                  ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 主内容区 */}
      <div className="max-w-lg mx-auto pb-20">
        {/* 我常用的 */}
        <div className="bg-white mx-3 mt-3 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-bold text-gray-800">我常用的</span>
            <button onClick={() => toast.info("设置功能开发中")}>
              <Settings className="w-4 h-4 text-gray-400" />
            </button>
          </div>
          <div className="flex gap-6">
            {FREQUENT_FEATURES.map((feat) => (
              <button
                key={feat.name}
                className="flex flex-col items-center gap-1.5 active:scale-95 transition-transform"
                onClick={() => handleFeatureClick(feat.name, feat.route)}
              >
                <div className="w-14 h-14 flex items-center justify-center overflow-hidden">
                  <img src={feat.icon} alt={feat.name} className="w-14 h-14 object-contain" />
                </div>
                <span className="text-[11px] text-gray-600">{feat.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 功能推荐横幅 - 也改为蓝色系 */}
        <div className="mx-3 mt-2 bg-gradient-to-r from-[#E8F4FD] to-[#D6EEFB] rounded-lg px-3 py-2 flex items-center">
          <span className="text-[11px] text-[#1976D2] font-bold mr-1">功能推荐</span>
          <span className="text-[9px] bg-[#2196C8] text-white px-1 py-0.5 rounded mr-2">NEW</span>

        </div>

        {/* 工作统计 - 3D立体月历 */}
        <YabanCalendar />

        {/* 更多功能 */}
        <div className="bg-white mx-3 mt-2 rounded-xl p-4">
          <div className="text-sm font-bold text-gray-800 mb-4">更多功能</div>
          <div className="grid grid-cols-4 gap-x-2 gap-y-4">
            {MORE_FEATURES.map((feat, idx) => (
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
          </div>
        </div>
      </div>

      {/* 底部 Tab 栏 */}
      <YabanTabBar />
    </div>
  );
}
