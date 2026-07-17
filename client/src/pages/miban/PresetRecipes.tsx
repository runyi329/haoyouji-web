// @ts-nocheck
import { trpc } from "@/lib/trpc";
import { mtrpc } from "./mibanTrpc";
import { Link } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight, Heart, ShoppingCart } from "lucide-react";

const PRESET_STYLES: Record<string, { accent: string; desc: string }> = {
  "糖友配方": { accent: "#555555", desc: "低 GI 米种为主，稳定血糖，适合糖尿病及糖尿病前期人群" },
  "减脂配方": { accent: "#555555", desc: "高纤维、低热量组合，增加饱腹感，助力健康减重" },
  "孕期配方": { accent: "#555555", desc: "富含叶酸、铁质的米种搭配，呵护孕期营养需求" },
  "补血配方": { accent: "#555555", desc: "黑米、红米为核心，富含花青素与铁元素，改善气血" },
};

export default function PresetRecipes() {
  const { data: presets, isLoading } = mtrpc.preset.list.useQuery();

  return (
    <div className="bg-white min-h-screen">
      <div className="px-4 pt-4 pb-24">
        <h2 className="text-[18px] font-bold text-black mb-1">推荐配方</h2>
        <p className="text-[12px] text-gray-400 mb-4">专业营养师精心调配，针对不同健康需求</p>

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-36 rounded-2xl" />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {presets?.map((preset) => {
              const style = PRESET_STYLES[preset.name] ?? { accent: "#6B4C2A", desc: "" };
              const ingredients: any[] = (() => {
                try { return JSON.parse(preset.ingredients as any ?? "[]"); }
                catch { return []; }
              })();

              return (
                <div key={preset.id} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
                  <div className="flex items-start gap-3 mb-3">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: style.accent + "18" }}
                    >
                      <Heart className="w-5 h-5" style={{ color: style.accent }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-[15px] font-bold text-black">{preset.name}</h3>
                      <p className="text-[11px] text-gray-400 leading-relaxed mt-0.5 line-clamp-2">{style.desc}</p>
                    </div>
                  </div>

                  {ingredients.length > 0 && (
                    <div className="mb-3">
                      <div className="h-2.5 rounded-full overflow-hidden flex mb-2">
                        {ingredients.map((ing: any, i: number) => (
                          <div
                            key={i}
                            style={{ width: `${ing.percentage}%`, backgroundColor: ing.colorHex ?? "#C8A87A" }}
                            title={`${ing.name} ${ing.percentage}%`}
                          />
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {ingredients.map((ing: any, i: number) => (
                          <span key={i} className="flex items-center gap-1 text-[11px] text-gray-400">
                            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: ing.colorHex ?? "#C8A87A" }} />
                            {ing.name} {ing.percentage}%
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-3 border-t border-gray-50">
                    <div>
                      {preset.totalPricePerJin && (
                        <span className="text-[15px] font-bold" style={{ color: "#FF6900" }}>
                          ¥{Number(preset.totalPricePerJin).toFixed(1)}
                          <span className="text-[11px] font-normal text-gray-400">/斤</span>
                        </span>
                      )}
                    </div>
                    <Link href={`/diy?preset=${preset.id}`}>
                      <button
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-semibold text-white active:scale-95 transition-transform bg-black"
                      >
                        <ShoppingCart className="w-3.5 h-3.5" />
                        一键选用
                      </button>
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-6 pt-5 border-t border-gray-100 text-center">
          <p className="text-[12px] text-gray-400 mb-3">没有找到适合的配方？</p>
          <Link href="/ai-health">
            <button className="flex items-center gap-2 mx-auto px-5 py-2.5 rounded-xl border border-gray-200 text-[13px] font-medium text-black active:bg-gray-50">
              <ArrowRight className="w-4 h-4" />
              让 AI 为我定制专属配方
            </button>
          </Link>
        </div>
      </div>
    </div>
  );
}
