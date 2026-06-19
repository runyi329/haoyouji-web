/**
 * 牙伴齿科管理 - 首页功能管理页（自定义首页快捷功能）
 * 路由：/yaban/features/customize
 * 由「全部功能」页右上角「编辑首页」进入。
 *
 * 功能：
 * - 上方「首页快捷」：当前已加到首页的功能，可上移/下移排序、移除（最多 7 个）。
 * - 下方「更多功能」：未加入首页的功能，点「+」加到首页快捷。
 * - 保存后写入 localStorage（按门店区分），首页据此渲染。
 */
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useSmartBack } from "@/hooks/useSmartBack";
import { ChevronLeft, ArrowUp, ArrowDown, Minus, Plus, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import {
  ALL_FEATURE_DICT,
  DEFAULT_HOME_KEYS,
  HOME_MAX,
  getFeatureByKey,
  loadHomeFeatureKeys,
  saveHomeFeatureKeys,
  type FeatureDef,
} from "./yabanFeatures";

function getCurrentTenantId(): number | null {
  try {
    const v = localStorage.getItem("yaban_current_tenant");
    return v != null ? Number(v) : null;
  } catch {
    return null;
  }
}

export default function YabanFeaturesCustomize() {
  const [, setLocation] = useLocation();
  const goBack = useSmartBack("/yaban/features");
  const tenantId = getCurrentTenantId();

  const [homeKeys, setHomeKeys] = useState<string[]>([]);

  useEffect(() => {
    setHomeKeys(loadHomeFeatureKeys(tenantId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const homeFeatures = homeKeys
    .map((k) => getFeatureByKey(k))
    .filter((f): f is FeatureDef => !!f);
  const restFeatures = ALL_FEATURE_DICT.filter((f) => !homeKeys.includes(f.key));

  const addToHome = (key: string) => {
    if (homeKeys.includes(key)) return;
    if (homeKeys.length >= HOME_MAX) {
      toast.error(`首页最多放 ${HOME_MAX} 个功能，请先移除部分`);
      return;
    }
    setHomeKeys([...homeKeys, key]);
  };

  const removeFromHome = (key: string) => {
    setHomeKeys(homeKeys.filter((k) => k !== key));
  };

  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= homeKeys.length) return;
    const next = [...homeKeys];
    [next[index], next[target]] = [next[target], next[index]];
    setHomeKeys(next);
  };

  const resetDefault = () => {
    setHomeKeys([...DEFAULT_HOME_KEYS]);
    toast.info("已恢复默认布局，记得点保存");
  };

  const save = () => {
    if (homeKeys.length === 0) {
      toast.error("首页至少保留 1 个功能");
      return;
    }
    saveHomeFeatureKeys(homeKeys, tenantId);
    toast.success("首页布局已保存");
    setLocation("/yaban");
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-28">

      {/* 顶部导航栏 */}
      <div
        className="text-white sticky top-0 z-40"
        style={{ background: "linear-gradient(135deg, #2196C8 0%, #4DB8E8 100%)" }}
      >
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <button onClick={goBack} className="p-1" aria-label="返回">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <span className="text-base font-bold">编辑首页功能</span>
          <button
            onClick={resetDefault}
            className="flex items-center gap-1 text-xs bg-white/15 rounded-full px-2.5 py-1 active:opacity-80"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            恢复默认
          </button>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-3 pt-3 space-y-3">
        {/* 首页快捷区 */}
        <div className="bg-white rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-bold text-gray-800">首页快捷</span>
            <span className="text-xs text-gray-400">{homeKeys.length}/{HOME_MAX}（末位固定「更多」）</span>
          </div>
          {homeFeatures.length === 0 ? (
            <div className="py-6 text-center text-xs text-gray-400">尚未添加，请从下方「更多功能」中添加</div>
          ) : (
            <div className="space-y-2">
              {homeFeatures.map((feat, idx) => (
                <div
                  key={feat.key}
                  className="flex items-center gap-3 border border-gray-100 rounded-xl px-3 py-2"
                >
                  <span className="text-xs text-gray-300 w-4 text-center flex-shrink-0">{idx + 1}</span>
                  <img src={feat.icon} alt="" className="w-9 h-9 object-contain flex-shrink-0" />
                  <span className="flex-1 text-sm text-gray-700 truncate">{feat.name}</span>
                  <button
                    onClick={() => move(idx, -1)}
                    disabled={idx === 0}
                    className="w-7 h-7 rounded-lg bg-gray-50 flex items-center justify-center text-gray-500 disabled:opacity-30 active:scale-95"
                    aria-label="上移"
                  >
                    <ArrowUp className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => move(idx, 1)}
                    disabled={idx === homeFeatures.length - 1}
                    className="w-7 h-7 rounded-lg bg-gray-50 flex items-center justify-center text-gray-500 disabled:opacity-30 active:scale-95"
                    aria-label="下移"
                  >
                    <ArrowDown className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => removeFromHome(feat.key)}
                    className="w-7 h-7 rounded-lg bg-red-50 flex items-center justify-center text-red-500 active:scale-95"
                    aria-label="移除"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 更多功能区 */}
        <div className="bg-white rounded-xl p-4">
          <span className="text-sm font-bold text-gray-800">更多功能</span>
          {restFeatures.length === 0 ? (
            <div className="py-6 text-center text-xs text-gray-400">全部功能都已加到首页</div>
          ) : (
            <div className="grid grid-cols-4 gap-x-2 gap-y-4 mt-3">
              {restFeatures.map((feat) => (
                <button
                  key={feat.key}
                  onClick={() => addToHome(feat.key)}
                  className="flex flex-col items-center gap-1.5 active:scale-95 transition-transform relative"
                >
                  <div className="w-14 h-14 flex items-center justify-center relative">
                    <img src={feat.icon} alt={feat.name} className="w-14 h-14 object-contain" />
                    <span className="absolute -top-0.5 -right-0.5 w-5 h-5 rounded-full bg-[#2196C8] text-white flex items-center justify-center shadow">
                      <Plus className="w-3.5 h-3.5" />
                    </span>
                  </div>
                  <span className="text-[11px] text-gray-600 text-center leading-tight">{feat.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 底部保存条 */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 z-50">
        <div className="max-w-lg mx-auto px-4 py-3">
          <button
            onClick={save}
            className="w-full bg-gradient-to-r from-[#2196C8] to-[#3BA9E0] text-white rounded-xl py-3 text-sm font-bold active:opacity-90"
          >
            保存并应用到首页
          </button>
        </div>
      </div>
    </div>
  );
}
