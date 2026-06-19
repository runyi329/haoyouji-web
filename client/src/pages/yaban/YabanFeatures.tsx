/**
 * 牙伴齿科管理 - 全部功能列表页
 * 路由：/yaban/features
 * 由首页功能网格末位「更多」入口进入。
 * 说明：功能全集来自共享字典；已加到首页的功能不在此重复显示。
 *       右上角「编辑首页」可自定义首页快捷功能与顺序。
 */
import { useLocation } from "wouter";
import { ChevronLeft, Settings2 } from "lucide-react";
import YabanTabBar from "./YabanTabBar";
import { toast } from "sonner";
import { ALL_FEATURE_DICT, loadHomeFeatureKeys } from "./yabanFeatures";

function getCurrentTenantId(): number | null {
  try {
    const v = localStorage.getItem("yaban_current_tenant");
    return v != null ? Number(v) : null;
  } catch {
    return null;
  }
}

export default function YabanFeatures() {
  const [, setLocation] = useLocation();
  const tenantId = getCurrentTenantId();

  // 已加到首页的功能不在此重复展示
  const homeKeys = loadHomeFeatureKeys(tenantId);
  const features = ALL_FEATURE_DICT.filter((f) => !homeKeys.includes(f.key));

  const handleClick = (name: string, route?: string) => {
    if (route) {
      setLocation(route);
    } else {
      toast.info(`"${name}" 功能开发中，敬请期待`);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">

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
          <button
            onClick={() => setLocation("/yaban/features/customize")}
            className="flex items-center gap-1 text-xs bg-white/15 rounded-full px-2.5 py-1 active:opacity-80"
          >
            <Settings2 className="w-3.5 h-3.5" />
            编辑首页
          </button>
        </div>
      </div>

      {/* 内容区：不分组，统一平铺 */}
      <div className="max-w-lg mx-auto pb-20">
        <div className="bg-white mx-3 mt-3 rounded-xl p-4">
          {features.length === 0 ? (
            <div className="py-8 text-center text-xs text-gray-400">全部功能都已加到首页</div>
          ) : (
            <div className="grid grid-cols-4 gap-x-2 gap-y-4">
              {features.map((feat) => (
                <button
                  key={feat.key}
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
          )}
        </div>
      </div>

      <YabanTabBar />
    </div>
  );
}
