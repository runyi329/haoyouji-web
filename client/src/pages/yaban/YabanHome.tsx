/**
 * 牙伴齿科管理 - 首页（工作 Tab）
 * 路由：/yaban
 * 模仿恒愿齿科App风格：橙色顶栏 + 白色内容区 + 功能网格
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { Search, Plus, ChevronDown, ChevronUp, Settings, Eye, EyeOff } from "lucide-react";
import YabanTabBar from "./YabanTabBar";
import { PageTag } from "@/components/PageTag";
import { toast } from "sonner";

// COS 图标 URL 基础路径
const ICON_BASE = "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/icons/yaban";

// 我常用的
const FREQUENT_FEATURES = [
  { name: "日程", icon: `${ICON_BASE}/richeng.webp`, route: "" },
  { name: "患者", icon: `${ICON_BASE}/huanzhe.webp`, route: "" },
  { name: "考勤打卡", icon: `${ICON_BASE}/kaoqin_daka.webp`, route: "" },
];

// 更多功能（4列网格）
const MORE_FEATURES = [
  { name: "随访", icon: `${ICON_BASE}/suifang.webp`, route: "" },
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

// 工作统计数据（模拟）
const STATS = [
  { label: "预约", value: "10" },
  { label: "随访", value: "57" },
  { label: "已收费", value: "5" },
  { label: "实收业绩", value: "\u00A54,660.00", showEye: true },
];

export default function YabanHome() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [showClinicPicker, setShowClinicPicker] = useState(false);
  const [currentClinic, setCurrentClinic] = useState("恒愿齿科北外滩店");
  const [expandedCompanies, setExpandedCompanies] = useState<string[]>(["恒愿齿科"]);
  const [expandedGroups, setExpandedGroups] = useState<string[]>(["总部"]);
  const [showRevenue, setShowRevenue] = useState(true);

  const handleFeatureClick = (name: string) => {
    toast.info(`"${name}" 功能开发中，敬请期待`);
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

      {/* 顶部橙色渐变 Header */}
      <div className="bg-gradient-to-r from-[#FF8C00] to-[#FFA500] text-white sticky top-0 z-40">
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
          {/* 右侧：搜索 + 新增 */}
          <div className="flex items-center gap-3">
            <button onClick={() => toast.info("搜索功能开发中")}>
              <Search className="w-5 h-5" />
            </button>
            <button onClick={() => toast.info("新增功能开发中")}>
              <Plus className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* 诊所选择下拉面板 */}
      {showClinicPicker && (
        <div className="fixed inset-0 z-50" onClick={() => setShowClinicPicker(false)}>
          <div
            className="absolute top-[52px] left-0 right-0 bg-[#2C2C3A] text-white max-w-lg mx-auto rounded-b-xl shadow-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {CLINICS.map((clinic) => (
              <div key={clinic.company}>
                {/* 公司名称 */}
                <button
                  className="w-full flex items-center justify-between px-4 py-3 border-b border-white/10"
                  onClick={() => toggleCompany(clinic.company)}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded bg-[#00B4D8] flex items-center justify-center">
                      <span className="text-[8px] font-bold">企</span>
                    </div>
                    <span className="text-sm font-medium">{clinic.company}</span>
                  </div>
                  <span className="text-xs text-gray-400">
                    {expandedCompanies.includes(clinic.company) ? "收起" : "展开"}
                  </span>
                </button>
                {/* 分支机构 */}
                {expandedCompanies.includes(clinic.company) &&
                  clinic.branches.map((branch) => (
                    <div key={branch.id}>
                      {branch.children ? (
                        <>
                          <button
                            className="w-full flex items-center justify-between px-6 py-2.5 border-b border-white/5"
                            onClick={() => toggleGroup(branch.name)}
                          >
                            <span className="text-xs text-gray-300">
                              <span className="text-gray-500 mr-1">|-</span>
                              {branch.name}
                            </span>
                            {expandedGroups.includes(branch.name) ? (
                              <ChevronUp className="w-3.5 h-3.5 text-gray-400" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                            )}
                          </button>
                          {expandedGroups.includes(branch.name) &&
                            branch.children.map((child) => (
                              <button
                                key={child.id}
                                className="w-full flex items-center justify-between px-8 py-2.5 border-b border-white/5"
                                onClick={() => {
                                  setCurrentClinic(child.name);
                                  setShowClinicPicker(false);
                                }}
                              >
                                <span className="text-xs text-gray-300">
                                  <span className="text-gray-500 mr-1">|-</span>
                                  {child.name}
                                </span>
                                {currentClinic === child.name && (
                                  <span className="text-[10px] bg-[#00B4D8] text-white px-2 py-0.5 rounded">
                                    当前
                                  </span>
                                )}
                              </button>
                            ))}
                        </>
                      ) : (
                        <button
                          className="w-full flex items-center px-6 py-2.5 border-b border-white/5"
                          onClick={() => {
                            setCurrentClinic(branch.name);
                            setShowClinicPicker(false);
                          }}
                        >
                          <span className="text-xs text-gray-300">
                            <span className="text-gray-500 mr-1">|-</span>
                            {branch.name}
                          </span>
                        </button>
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
                onClick={() => handleFeatureClick(feat.name)}
              >
                <div className="w-12 h-12 rounded-xl bg-[#00B4D8]/10 flex items-center justify-center overflow-hidden">
                  <img src={feat.icon} alt={feat.name} className="w-10 h-10 object-contain" />
                </div>
                <span className="text-[11px] text-gray-600">{feat.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 功能推荐横幅 */}
        <div className="mx-3 mt-2 bg-gradient-to-r from-[#FFF3E0] to-[#FFE0B2] rounded-lg px-3 py-2 flex items-center">
          <span className="text-[11px] text-[#E65100] font-bold mr-1">功能推荐</span>
          <span className="text-[9px] bg-[#FF5722] text-white px-1 py-0.5 rounded mr-2">NEW</span>
          <span className="text-[11px] text-[#BF360C]">开通分期支付，提升客户成交率、客单价 &gt;</span>
        </div>

        {/* 工作统计 */}
        <div className="bg-white mx-3 mt-2 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-bold text-gray-800">工作统计</span>
            <button onClick={() => toast.info("统计设置开发中")}>
              <Settings className="w-4 h-4 text-gray-400" />
            </button>
          </div>
          <div className="grid grid-cols-4 gap-2 mb-3">
            {STATS.map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-lg font-bold text-gray-800">
                  {stat.showEye && !showRevenue ? "****" : stat.value}
                </div>
                <div className="text-[11px] text-gray-500 flex items-center justify-center gap-0.5">
                  {stat.label}
                  {stat.showEye && (
                    <button onClick={() => setShowRevenue(!showRevenue)}>
                      {showRevenue ? (
                        <Eye className="w-3 h-3 text-gray-400" />
                      ) : (
                        <EyeOff className="w-3 h-3 text-gray-400" />
                      )}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          {/* 新增患者 */}
          <div className="border-t border-gray-100 pt-3">
            <div className="w-24 bg-gray-50 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-gray-800">3</div>
              <div className="text-[11px] text-gray-500 mt-0.5">新增患者</div>
            </div>
          </div>
        </div>

        {/* 更多功能 */}
        <div className="bg-white mx-3 mt-2 rounded-xl p-4">
          <div className="text-sm font-bold text-gray-800 mb-4">更多功能</div>
          <div className="grid grid-cols-4 gap-x-2 gap-y-4">
            {MORE_FEATURES.map((feat, idx) => (
              <button
                key={`${feat.name}-${idx}`}
                className="flex flex-col items-center gap-1.5 active:scale-95 transition-transform relative"
                onClick={() => handleFeatureClick(feat.name)}
              >
                <div className="w-12 h-12 rounded-xl overflow-hidden relative">
                  <img src={feat.icon} alt={feat.name} className="w-full h-full object-contain" />
                  {feat.badge && (
                    <span className="absolute top-0 right-0 text-[8px] bg-[#FF5722] text-white px-1 rounded-bl">
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
