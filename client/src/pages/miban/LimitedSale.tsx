import { Link } from "wouter";
import { ChevronRight, Sparkles } from "lucide-react";
import { HERBALIFE_THEME } from "../../../../shared/herbalife-theme";
import {
  LINGCHUANG_THEME,
  TUOQUETANG_THEME,
} from "../../../../shared/miban-limited-brand-config";

const BRAND_CARD_COS_BASE =
  "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/miban-shebei/brand-cards/v2";
const HERBALIFE_NUTRITION_CARD =
  "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/miban-shebei/brand-cards/v4/herbalife-nutrition-card-stage.webp";
const SEASONAL_FRUITS_CARD =
  "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/miban-shebei/brand-cards/v5/seasonal-fruits-card-rich-stage.webp";
const LINGCHUANG_PREVIEW_CARD =
  "/miban-lingchuang-preview/v2/brand-card-v2.jpg";

export default function LimitedSale() {
  const localPreviewMode = import.meta.env.DEV;
  return (
    <div
      className="min-h-screen pb-8"
      style={{ background: HERBALIFE_THEME.canvas }}
    >
      <section className="space-y-4 px-5 pt-6" aria-label="精选系列">
        <Link
          href="/p/proj_hzxm2t/limited/herbalife"
          className="block active:scale-[0.985]"
        >
          <article
            className="relative min-h-[208px] overflow-hidden rounded-[22px]"
            style={{
              background: "#F6F8F4",
              boxShadow: "0 14px 32px rgba(59,128,37,0.22)",
            }}
          >
            <img
              src={HERBALIFE_NUTRITION_CARD}
              alt="康宝莱营养精选产品与饮品场景"
              className="pointer-events-none absolute inset-0 h-full w-full object-cover object-center"
            />
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(90deg,rgba(8,79,36,0.96) 0%,rgba(18,111,46,0.91) 43%,rgba(30,130,50,0.46) 61%,rgba(40,141,50,0.06) 79%,rgba(40,141,50,0) 100%)",
              }}
            />
            <div className="relative z-10 flex min-h-[208px] max-w-[58%] flex-col justify-between px-5 py-5 text-white">
              <div>
                <div className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.11em] text-white/80">
                  <Sparkles className="h-3.5 w-3.5" strokeWidth={2.2} />
                  营养精选
                </div>
                <h3 className="mt-2 text-[23px] font-extrabold leading-tight">
                  康宝莱营养精选
                </h3>
                <p className="mt-2 text-[11px] leading-5 text-white/78">
                  营养饮品与日常产品，进入专区查看在售商品。
                </p>
              </div>
              <span
                className="inline-flex w-fit items-center gap-1.5 rounded-full bg-white px-3 py-2 text-[11px] font-bold"
                style={{ color: HERBALIFE_THEME.primary }}
              >
                查看营养精选
                <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.5} />
              </span>
            </div>
          </article>
        </Link>

        <Link
          href="/p/proj_hzxm2t/limited/tuoquetang"
          className="block active:scale-[0.985]"
        >
          <article
            className="relative min-h-[220px] overflow-hidden rounded-[22px]"
            style={{
              background: TUOQUETANG_THEME.primary,
              boxShadow: "0 14px 32px rgba(14,90,80,0.24)",
            }}
          >
            <img
              src={`${BRAND_CARD_COS_BASE}/tuoquetang-product-stage.webp`}
              alt="佗鹊堂蓝布正植物牙膏与复生1号产品静物图"
              className="pointer-events-none absolute inset-0 h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,61,56,0.98)_0%,rgba(8,76,68,0.91)_47%,rgba(8,76,68,0.22)_77%,rgba(8,76,68,0.04)_100%)]" />
            <div className="relative flex min-h-[220px] max-w-[59%] flex-col justify-between px-5 py-5 text-white">
              <div>
                <div className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.11em] text-[#E9D5A5]">
                  <Sparkles className="h-3.5 w-3.5" strokeWidth={2.2} />
                  草本日用 · 正式上架
                </div>
                <h3 className="mt-2 text-[23px] font-extrabold leading-tight">
                  佗鹊堂精选
                </h3>
                <p className="mt-2 text-[11px] leading-5 text-white/78">
                  蓝布正植物牙膏与复生1号，进入专区查看在售商品。
                </p>
              </div>
              <span
                className="inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-2 text-[11px] font-bold"
                style={{
                  background: "#FFF8E8",
                  color: TUOQUETANG_THEME.primary,
                }}
              >
                查看佗鹊堂精选
                <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.5} />
              </span>
            </div>
          </article>
        </Link>

        {localPreviewMode && (
          <Link
            href="/p/proj_hzxm2t/limited/lingchuang?preview=1"
            className="block active:scale-[0.985]"
          >
            <article
              className="relative min-h-[208px] overflow-hidden rounded-[22px]"
              style={{
                background: LINGCHUANG_THEME.primary,
                boxShadow: "0 14px 32px rgba(43,61,154,0.24)",
              }}
            >
              <img
                src={LINGCHUANG_PREVIEW_CARD}
                alt="凌创氨糖透明质酸钠营养固体饮料盒装"
                className="pointer-events-none absolute inset-0 h-full w-full object-cover object-center"
              />
              <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(21,36,111,0.97)_0%,rgba(34,52,139,0.90)_44%,rgba(48,67,161,0.38)_67%,rgba(48,67,161,0.04)_100%)]" />
              <div className="relative z-10 flex min-h-[208px] max-w-[61%] flex-col justify-between px-5 py-5 text-white">
                <div>
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.11em] text-white/80">
                    <Sparkles className="h-3.5 w-3.5" strokeWidth={2.2} />
                    营养固体饮料 · 资料预览
                  </div>
                  <h3 className="mt-2 text-[23px] font-extrabold leading-tight">
                    凌创生物精选
                  </h3>
                  <p className="mt-2 text-[11px] leading-5 text-white/78">
                    10g × 30袋盒装，查看包装、规格与商品资料。
                  </p>
                </div>
                <span
                  className="inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-2 text-[11px] font-bold"
                  style={{
                    background: "#F3F6FF",
                    color: LINGCHUANG_THEME.primary,
                  }}
                >
                  查看资料预览
                  <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.5} />
                </span>
              </div>
            </article>
          </Link>
        )}

        <Link
          href="/p/proj_hzxm2t/limited/fruits"
          className="block active:scale-[0.985]"
        >
          <article
            className="relative min-h-[208px] overflow-hidden rounded-[22px]"
            style={{
              background: "#F8F6EE",
              boxShadow: "0 14px 32px rgba(131,111,61,0.16)",
            }}
          >
            <img
              src={SEASONAL_FRUITS_CARD}
              alt="四季水果精选组合"
              className="pointer-events-none absolute inset-0 h-full w-full object-cover object-center"
            />
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(90deg,rgba(83,91,52,0.95) 0%,rgba(114,121,69,0.86) 44%,rgba(145,148,91,0.43) 63%,rgba(150,151,94,0.06) 82%,rgba(150,151,94,0) 100%)",
              }}
            />
            <div className="relative z-10 flex min-h-[208px] max-w-[58%] flex-col justify-between px-5 py-5 text-white">
              <div>
                <div className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.11em] text-white/80">
                  <Sparkles className="h-3.5 w-3.5" strokeWidth={2.2} />
                  随季更新
                </div>
                <h3 className="mt-2 text-[23px] font-extrabold leading-tight">
                  四季水果精选
                </h3>
                <p className="mt-2 text-[11px] leading-5 text-white/80">
                  汇集各地应季鲜果，进入专区查看当前精选。
                </p>
              </div>
              <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-[#FFFDF7] px-3 py-2 text-[11px] font-bold text-[#6A6B3C]">
                查看水果精选
                <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.5} />
              </span>
            </div>
          </article>
        </Link>
      </section>

      <p className="px-5 pt-7 text-center text-[11px] text-[#C6C0BE]">
        更多健康美丽品牌正在甄选中
      </p>
    </div>
  );
}
