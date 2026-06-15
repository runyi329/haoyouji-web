/**
 * 牙伴齿科管理 - 全部功能列表页
 * 路由：/yaban/features
 * 由首页功能网格末位「更多」入口进入
 * 注意：首页上半部分已展示的功能（预约日程、诊所排班、顾客、随访、运营报表、库存）不在此重复显示；
 *       全部功能不分组，统一平铺显示。
 */
import { useLocation } from "wouter";
import { ChevronLeft } from "lucide-react";
import YabanTabBar from "./YabanTabBar";
import { PageTag } from "@/components/PageTag";
import { toast } from "sonner";

const ICON_BASE = "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/icons/yaban";

type Feature = { name: string; icon: string; route: string; badge?: string };

// 全部功能（已排除首页上半部分已显示的功能，且不分组、平铺显示）
const ALL_FEATURES: Feature[] = [
  { name: "考勤打卡", icon: `${ICON_BASE}/kaoqin_daka.webp`, route: "" },
  { name: "采购", icon: `${ICON_BASE}/caigou.webp`, route: "" },
  { name: "物品", icon: `${ICON_BASE}/wupin.webp`, route: "" },
  { name: "微信咨询", icon: `${ICON_BASE}/weixin_zixun.webp`, route: "" },
  { name: "网络预约", icon: `${ICON_BASE}/wangluo_yuyue.webp`, route: "" },
  { name: "审批", icon: `${ICON_BASE}/shenpi.webp`, route: "" },
  { name: "工作提醒", icon: `${ICON_BASE}/gongzuo_tixing.webp`, route: "" },
  { name: "医患视频", icon: `${ICON_BASE}/yihuan_shipin.webp`, route: "" },
  { name: "增值服务", icon: `${ICON_BASE}/zengzhi_fuwu.webp`, route: "" },
  { name: "领用", icon: `${ICON_BASE}/lingyong.webp`, route: "" },
  { name: "回访管理", icon: `${ICON_BASE}/huifang_guanli.webp`, route: "" },
  { name: "技加工", icon: `${ICON_BASE}/ji_jiagong.webp`, route: "" },
];

export default function YabanFeatures() {
  const [, setLocation] = useLocation();

  const handleClick = (name: string, route?: string) => {
    if (route) {
      setLocation(route);
    } else {
      toast.info(`"${name}" 功能开发中，敬请期待`);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <PageTag code="P322" />

      {/* 顶部导航栏 */}
      <div
        className="text-white sticky top-0 z-40"
        style={{ background: "linear-gradient(135deg, #2196C8 0%, #4DB8E8 100%)" }}
      >
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <button onClick={() => setLocation("/yaban")} className="p-1" aria-label="返回">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <span className="text-base font-bold">全部功能</span>
          <span className="w-6" />
        </div>
      </div>

      {/* 内容区：不分组，统一平铺 */}
      <div className="max-w-lg mx-auto pb-20">
        <div className="bg-white mx-3 mt-3 rounded-xl p-4">
          <div className="grid grid-cols-4 gap-x-2 gap-y-4">
            {ALL_FEATURES.map((feat, idx) => (
              <button
                key={`${feat.name}-${idx}`}
                className="flex flex-col items-center gap-1.5 active:scale-95 transition-transform relative"
                onClick={() => handleClick(feat.name, feat.route)}
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

      <YabanTabBar />
    </div>
  );
}
