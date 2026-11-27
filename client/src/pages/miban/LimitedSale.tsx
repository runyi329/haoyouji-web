import { Link } from "wouter";
import { ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { mtrpc } from "./mibanTrpc";
import { MibanImage } from "./MibanImage";
import { WangkaBrandCard } from "./WangkaBrandCard";
import { HERBALIFE_THEME } from "../../../../shared/herbalife-theme";
import {
  LINGCHUANG_THEME,
  MIDANIANG_THEME,
  TUOQUETANG_THEME,
  mibanLimitedBrands,
  type MibanLimitedBrand,
} from "../../../../shared/miban-limited-brand-config";

const BRAND_CARD_COS_BASE =
  "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/miban-shebei/brand-cards/v2";
const HERBALIFE_NUTRITION_CARD =
  "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/miban-shebei/brand-cards/v4/herbalife-nutrition-card-stage.webp";
const SEASONAL_FRUITS_CARD =
  "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/miban-shebei/brand-cards/v5/seasonal-fruits-card-rich-stage.webp";
const LINGCHUANG_DUO_CARD =
  "/miban-lingchuang-preview/v6/brand-card-red-white-duo.webp";

const MIDANIANG_BRAND_CARD =
  "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/miban-shebei/midaniang/v1/brand-card-rice-pantry-2e8d06304b9e.webp";
const MIDANIANG_APPROVED_LOGO =
  "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/miban-shebei/midaniang/v1/logo-red-gold-integrated-r1-36e01e489757.webp";

const AMWAY_DAILY_PRODUCTS_STAGE = "/miban-amway/amway-daily-products-stage-v3-home.webp";
const AMWAY_OFFICIAL_LOGO = "/miban-amway/amway-official-logo.png";

const MARYKAY_BEAUTY_PRODUCTS_STAGE = "/miban-marykay/marykay-products-stage-v2-satin.webp";
const MARYKAY_OFFICIAL_LOGO = "/miban-marykay/marykay-official-logo.png";
const NUSKIN_BEAUTY_PRODUCTS_STAGE = "/miban-nuskin/nuskin-products-stage-v2-clear.webp";
const NUSKIN_OFFICIAL_LOGO = "/miban-nuskin/nuskin-official-logo.png";

const BRAND_CARD_FRAME_CLASS =
  "relative min-h-[224px] overflow-hidden rounded-[22px] md:aspect-[16/9]";
const BRAND_CARD_CONTENT_CLASS =
  "relative z-10 flex h-full min-h-[224px] max-w-[58%] flex-col justify-between px-4 py-4 min-[400px]:px-5";
const BRAND_CARD_TITLE_CLASS = "whitespace-nowrap text-[clamp(18px,5.8vw,23px)] font-extrabold leading-tight";
const BRAND_CARD_CTA_CLASS =
  "inline-flex min-h-[32px] w-fit items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-2 text-[11px] font-bold";
const BRAND_CARD_CTA_ICON_CLASS = "h-3.5 w-3.5";

const WINE_TASTING_PREVIEW = "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/miban-shebei/guizhou/brand-card/v1/guizhou-original-stage-bd73885a1d59.webp";
const MOUTAI_OFFICIAL_LOGO = "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/miban-shebei/guizhou/brand-card/v1/moutai-original-logo-6f22c1e6e462.webp";

const BRAND_ORDER = mibanLimitedBrands.map(brand => brand.slug);
type BrandSlug = MibanLimitedBrand["slug"];
type BrandAttention = { brandSlug: string; viewCount: number };

function WineTastingPreviewCard() {
  return (
    <article
      className="relative isolate min-h-[224px] overflow-hidden rounded-[22px]"
      data-testid="brand-card-guizhou"
      style={{
        background: "#F6ECDB",
        clipPath: "inset(0 round 22px)",
        boxShadow: "0 14px 32px rgba(132,77,39,0.14)",
      }}
      aria-label="贵州精选，AI茅台飞天与生肖系列陈列预览"
    >
      <MibanImage
        variant="card"
        src={WINE_TASTING_PREVIEW}
        alt="AI茅台飞天与生肖系列陈列"
        className="pointer-events-none absolute inset-0 h-full w-full object-cover object-right"
        loading="lazy"
      />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(90deg,rgba(250,241,225,0.99) 0%,rgba(250,241,225,0.96) 27%,rgba(250,241,225,0.84) 40%,rgba(250,241,225,0.44) 53%,rgba(250,241,225,0.10) 67%,rgba(250,241,225,0) 78%)",
        }}
      />
      <div className="relative z-10 flex min-h-[224px] max-w-[60%] flex-col justify-between px-5 py-4">
        <div>
          <div className="flex items-center gap-2">
            <MibanImage
              variant="icon"
              src={MOUTAI_OFFICIAL_LOGO}
              alt="贵州茅台官方品牌标识"
              className="h-[68px] w-[68px] shrink-0 object-contain"
              loading="lazy"
            />
            <p className="shrink-0 border-l border-[#A98A63]/35 pl-2 text-[10px] font-medium leading-[18px] tracking-[0.04em] text-[#8C6B50]">
              贵州仁怀<br />茅台镇
            </p>
          </div>
          <h3 className="mt-1.5 whitespace-nowrap text-[23px] font-extrabold leading-tight text-[#5A331B]">
            贵州精选
          </h3>
          <p className="mt-1.5 text-[11px] leading-[18px] text-[#8C6B50]">
            酱香突出，<br />幽雅细腻。
          </p>
        </div>
        <Link
          href="/p/proj_hzxm2t/limited/guizhou"
          className="mt-3 inline-flex w-fit items-center gap-1 whitespace-nowrap rounded-full bg-[#8A5835] px-3 py-2 text-[11px] font-bold text-[#FFF9F0] transition-colors hover:bg-[#794A2B] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8A5835] active:scale-[0.985]"
        >
          查看贵州精选
          <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.5} />
        </Link>
      </div>
    </article>
  );
}

function AmwayDailyPreviewCard() {
  return (
    <article
      className={`${BRAND_CARD_FRAME_CLASS} isolate`}
      data-testid="brand-card-amway"
      style={{
        background: "#243B72",
        clipPath: "inset(0 round 22px)",
        boxShadow: "0 14px 32px rgba(36,59,114,0.20)",
      }}
      aria-label="安利日用精选，AI产品场景预览"
    >
      <MibanImage
        variant="card"
        src={AMWAY_DAILY_PRODUCTS_STAGE}
        alt="安利牙膏横放，丝婷、雅蜜与优生活日用品错落陈列于窗边浅木层架"
        className="pointer-events-none absolute inset-0 h-full w-full object-cover object-right"
        loading="lazy"
      />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(90deg,#243B72 0%,rgba(36,59,114,0.98) 26%,rgba(56,83,154,0.90) 41%,rgba(56,83,154,0.48) 55%,rgba(56,83,154,0.10) 69%,rgba(56,83,154,0) 80%)",
        }}
      />
      <div className={`${BRAND_CARD_CONTENT_CLASS} text-white`}>
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-[34px] w-[64px] shrink-0 items-center justify-center rounded-[3px] bg-white px-1.5 py-1">
              <MibanImage
                variant="icon"
                src={AMWAY_OFFICIAL_LOGO}
                alt="安利官网原始品牌标识"
                className="h-full w-full object-contain"
                loading="lazy"
              />
            </div>
            <p className="min-w-0 text-[11px] font-medium leading-[17px] text-white/80">
              个人护理 ·<br />家居清洁
            </p>
          </div>
          <h3 className={`mt-2 ${BRAND_CARD_TITLE_CLASS}`}>
            安利日用精选
          </h3>
          <p className="mt-2 text-[11px] leading-[18px] text-white/80">
            洁净日常，<br />舒适相伴。
          </p>
        </div>
        <button
          type="button"
          onClick={() => toast.info("安利日用精选商品尚未上架，敬请期待。")}
          className={`mt-3 ${BRAND_CARD_CTA_CLASS} bg-white text-[#243B72] transition-colors hover:bg-[#EDF2FF] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white active:scale-[0.985]`}
        >
          查看日用精选
          <ChevronRight className={BRAND_CARD_CTA_ICON_CLASS} strokeWidth={2.5} />
        </button>
      </div>
    </article>
  );
}

function MaryKayBeautyPreviewCard() {
  return (
    <article
      className={`${BRAND_CARD_FRAME_CLASS} isolate`}
      data-testid="brand-card-marykay"
      style={{
        background: "#F6E6E5",
        clipPath: "inset(0 round 22px)",
        boxShadow: "0 14px 32px rgba(152,83,97,0.14)",
      }}
      aria-label="玫琳凯美肤精选，AI产品场景预览"
    >
      <MibanImage
        variant="card"
        src={MARYKAY_BEAUTY_PRODUCTS_STAGE}
        alt="玫琳凯幻时5X精华水、精华乳与眼霜斜向平铺于香槟柔粉丝缎"
        className="pointer-events-none absolute inset-0 h-full w-full object-cover object-right"
        loading="lazy"
      />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: "linear-gradient(90deg,rgba(247,232,232,0.98) 0%,rgba(247,232,232,0.93) 28%,rgba(247,232,232,0.75) 41%,rgba(247,232,232,0.25) 55%,rgba(247,232,232,0) 69%)",
        }}
      />
      <div className={BRAND_CARD_CONTENT_CLASS}>
        <div>
          <div className="flex items-center gap-2">
            <MibanImage
              variant="icon"
              src={MARYKAY_OFFICIAL_LOGO}
              alt="玫琳凯官网原始品牌标识"
              className="h-[34px] w-[64px] shrink-0 object-contain"
              loading="lazy"
            />
            <p className="min-w-0 text-[11px] font-medium leading-[17px] text-[#79575E]">
              幻时5X<br />护肤系列
            </p>
          </div>
          <h3 className={`mt-2 ${BRAND_CARD_TITLE_CLASS} text-[#21201F]`}>
            玫琳凯美肤精选
          </h3>
          <p className="mt-2 text-[11px] leading-[18px] text-[#845561]">
            细致呵护，<br />绽放光采。
          </p>
        </div>
        <button
          type="button"
          onClick={() => toast.info("玫琳凯美肤精选商品尚未上架，敬请期待。")}
          className={`mt-3 ${BRAND_CARD_CTA_CLASS} bg-[#9C5867] text-white transition-colors hover:bg-[#874A58] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9C5867] active:scale-[0.985]`}
        >
          查看美肤精选
          <ChevronRight className={BRAND_CARD_CTA_ICON_CLASS} strokeWidth={2.5} />
        </button>
      </div>
    </article>
  );
}

function NuSkinBeautyPreviewCard() {
  return (
    <article
      className={`${BRAND_CARD_FRAME_CLASS} isolate`}
      data-testid="brand-card-nuskin"
      style={{
        background: "#EDF5F6",
        clipPath: "inset(0 round 22px)",
        boxShadow: "0 14px 32px rgba(24,116,132,0.14)",
      }}
      aria-label="如新美肤精选，AI产品场景预览"
    >
      <MibanImage
        variant="card"
        src={NUSKIN_BEAUTY_PRODUCTS_STAGE}
        alt="如新新动机iO、平衡净肤露、斜卧眼霜与眼部护理导头置于透明玻璃和弧线光影中"
        className="pointer-events-none absolute inset-0 h-full w-full object-cover object-right"
        loading="lazy"
      />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: "linear-gradient(90deg,rgba(239,246,247,0.98) 0%,rgba(239,246,247,0.94) 28%,rgba(239,246,247,0.79) 41%,rgba(239,246,247,0.30) 55%,rgba(239,246,247,0) 69%)",
        }}
      />
      <div className={BRAND_CARD_CONTENT_CLASS}>
        <div>
          <div className="flex items-center gap-2">
            <MibanImage
              variant="icon"
              src={NUSKIN_OFFICIAL_LOGO}
              alt="如新官网原始品牌标识"
              className="h-[34px] w-[34px] shrink-0 object-contain"
              loading="lazy"
            />
            <p className="min-w-0 text-[11px] font-medium leading-[17px] text-[#425A67]">
              科技美肤 ·<br />净肤护理
            </p>
          </div>
          <h3 className={`mt-2 ${BRAND_CARD_TITLE_CLASS} text-[#243D4A]`}>
            如新美肤精选
          </h3>
          <p className="mt-2 text-[11px] leading-[18px] text-[#425A67]">
            洁净养护，<br />细致每一天。
          </p>
        </div>
        <button
          type="button"
          onClick={() => toast.info("如新美肤精选商品尚未上架，敬请期待。")}
          className={`mt-3 ${BRAND_CARD_CTA_CLASS} bg-[#198E9E] text-white transition-colors hover:bg-[#137D8C] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#198E9E] active:scale-[0.985]`}
        >
          查看美肤精选
          <ChevronRight className={BRAND_CARD_CTA_ICON_CLASS} strokeWidth={2.5} />
        </button>
      </div>
    </article>
  );
}

function AttentionCount({
  brandSlug,
  viewCount,
}: {
  brandSlug: BrandSlug;
  viewCount: number | undefined;
}) {
  return (
    <span
      data-testid={`${brandSlug}-attention`}
      data-view-count={
        viewCount === undefined ? "unavailable" : String(viewCount)
      }
      className="pointer-events-none absolute bottom-4 right-4 z-20 rounded-md bg-black/35 px-2 py-1 text-right text-[10px] font-normal leading-[14px] text-white/90 [overflow-wrap:anywhere]"
      style={{ maxWidth: "calc(41% - 16px)" }}
    >
      关注 {viewCount === undefined ? "--" : `+${viewCount}`}
    </span>
  );
}

export default function LimitedSale() {
  const utils = mtrpc.useUtils();
  const { data: attentionData } = mtrpc.limitedProduct.brandAttention.useQuery(
    undefined,
    {
      staleTime: 0,
      refetchOnMount: true,
      refetchOnWindowFocus: true,
      refetchInterval: 30000,
    }
  );
  const brandAttention = attentionData as BrandAttention[] | undefined;
  const recordAttention = mtrpc.limitedProduct.recordBrandAttention.useMutation(
    {
      // TanStack retries the same input, including its eventId, after navigation.
      retry: 2,
    }
  );

  function recordBrandClick(brandSlug: BrandSlug) {
    // Only an actual Link click creates an event; never count mounts or refetches.
    // A Promise callback survives unmount, unlike mutate(input, { onSuccess }).
    try {
      const eventId = crypto.randomUUID();
      void recordAttention
        .mutateAsync({ brandSlug, eventId })
        .then((result: BrandAttention & { counted: boolean }) => {
          utils.limitedProduct.brandAttention.setData(
            undefined,
            (previous: BrandAttention[] | undefined) => {
              // Without a completed GET, other brands' counts are still unknown.
              if (previous === undefined) return previous;
              const existing = previous.find(
                item => item.brandSlug === result.brandSlug
              );
              const updated = {
                brandSlug: result.brandSlug,
                // Concurrent click responses can arrive out of order.
                viewCount: Math.max(existing?.viewCount ?? 0, result.viewCount),
              };
              return existing
                ? previous.map(item =>
                    item.brandSlug === result.brandSlug ? updated : item
                  )
                : [...previous, updated];
            }
          );
          return utils.limitedProduct.brandAttention.invalidate();
        })
        .catch(() => {
          // Statistics failures must never interrupt normal Link navigation.
        });
    } catch {
      // Even unavailable browser crypto must not block entering a brand.
    }
  }

  const viewCountFor = (brandSlug: BrandSlug) =>
    brandAttention === undefined
      ? undefined
      : (brandAttention.find(item => item.brandSlug === brandSlug)?.viewCount ??
        0);
  const sortedBrands = [...BRAND_ORDER].sort(
    (a, b) =>
      (viewCountFor(b) ?? 0) - (viewCountFor(a) ?? 0) ||
      BRAND_ORDER.indexOf(a) - BRAND_ORDER.indexOf(b)
  );

  const brandCards = {
    herbalife: (
      <Link
        key="herbalife"
        data-brand-slug="herbalife"
        data-testid="brand-card-herbalife"
        href="/p/proj_hzxm2t/limited/herbalife"
        onClick={() => recordBrandClick("herbalife")}
        className="block active:scale-[0.985]"
      >
        <article
          className={BRAND_CARD_FRAME_CLASS}
          style={{
            background: "#F6F8F4",
            boxShadow: "0 14px 32px rgba(59,128,37,0.22)",
          }}
        >
          <MibanImage
            variant="card"
            priority={sortedBrands[0] === "herbalife"}
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
          <div className={`${BRAND_CARD_CONTENT_CLASS} text-white`}>
            <div>
              <div className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.11em] text-white/80">
                营养精选
              </div>
              <h3 className={`mt-2 ${BRAND_CARD_TITLE_CLASS}`}>
                康宝莱营养精选
              </h3>
              <p className="mt-2 text-[11px] leading-5 text-white/78">
                营养饮品与日常产品，进入专区查看在售商品。
              </p>
            </div>
            <span
              className={`${BRAND_CARD_CTA_CLASS} bg-white`}
              style={{ color: HERBALIFE_THEME.primary }}
            >
              查看营养精选
              <ChevronRight className={BRAND_CARD_CTA_ICON_CLASS} strokeWidth={2.5} />
            </span>
          </div>
          <AttentionCount
            brandSlug="herbalife"
            viewCount={viewCountFor("herbalife")}
          />
        </article>
      </Link>
    ),
    tuoquetang: (
      <Link
        key="tuoquetang"
        data-brand-slug="tuoquetang"
        data-testid="brand-card-tuoquetang"
        href="/p/proj_hzxm2t/limited/tuoquetang"
        onClick={() => recordBrandClick("tuoquetang")}
        className="block active:scale-[0.985]"
      >
        <article
          className={BRAND_CARD_FRAME_CLASS}
          style={{
            background: TUOQUETANG_THEME.primary,
            boxShadow: "0 14px 32px rgba(14,90,80,0.24)",
          }}
        >
          <MibanImage
            variant="card"
            priority={sortedBrands[0] === "tuoquetang"}
            src={`${BRAND_CARD_COS_BASE}/tuoquetang-product-stage.webp`}
            alt="佗鹊堂蓝布正植物牙膏与复生1号产品静物图"
            className="pointer-events-none absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,61,56,0.98)_0%,rgba(8,76,68,0.91)_47%,rgba(8,76,68,0.22)_77%,rgba(8,76,68,0.04)_100%)]" />
          <div className={`${BRAND_CARD_CONTENT_CLASS} text-white`}>
            <div>
              <div className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.11em] text-[#E9D5A5]">
                草本日用
              </div>
              <h3 className={`mt-2 ${BRAND_CARD_TITLE_CLASS}`}>
                佗鹊堂精选
              </h3>
              <p className="mt-2 text-[11px] leading-5 text-white/78">
                蓝布正植物牙膏与复生1号，进入专区查看在售商品。
              </p>
            </div>
            <span
              className={BRAND_CARD_CTA_CLASS}
              style={{
                background: "#FFF8E8",
                color: TUOQUETANG_THEME.primary,
              }}
            >
              查看佗鹊堂精选
              <ChevronRight className={BRAND_CARD_CTA_ICON_CLASS} strokeWidth={2.5} />
            </span>
          </div>
          <AttentionCount
            brandSlug="tuoquetang"
            viewCount={viewCountFor("tuoquetang")}
          />
        </article>
      </Link>
    ),
    lingchuang: (
      <Link
        key="lingchuang"
        data-brand-slug="lingchuang"
        data-testid="brand-card-lingchuang"
        href="/p/proj_hzxm2t/limited/lingchuang"
        onClick={() => recordBrandClick("lingchuang")}
        className="block active:scale-[0.985]"
      >
        <article
          className={BRAND_CARD_FRAME_CLASS}
          style={{
            background: "#8D2D3A",
            boxShadow: "0 14px 32px rgba(106,45,51,0.18)",
          }}
        >
          <MibanImage
            variant="card"
            priority={sortedBrands[0] === "lingchuang"}
            src={LINGCHUANG_DUO_CARD}
            alt="凌创PQQ透明质酸钠与氨糖透明质酸钠营养固体饮料"
            className="pointer-events-none absolute inset-0 h-full w-full object-cover object-center"
          />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(101,34,43,0.96)_0%,rgba(126,48,57,0.89)_43%,rgba(143,55,64,0.39)_63%,rgba(143,55,64,0.06)_80%,rgba(143,55,64,0)_100%)]" />
          <div className={`${BRAND_CARD_CONTENT_CLASS} text-white`}>
            <div>
              <div className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.11em] text-white/80">
                营养固体饮料
              </div>
              <h3 className={`mt-2 ${BRAND_CARD_TITLE_CLASS}`}>
                凌创生物精选
              </h3>
              <p className="mt-2 text-[11px] leading-5 text-white/78">
                两款独立条包，进入专区查看在售商品。
              </p>
            </div>
            <span
              className={BRAND_CARD_CTA_CLASS}
              style={{
                background: "#FFFDF9",
                color: "#8D2D3A",
              }}
            >
              查看凌创精选
              <ChevronRight className={BRAND_CARD_CTA_ICON_CLASS} strokeWidth={2.5} />
            </span>
          </div>
          <AttentionCount
            brandSlug="lingchuang"
            viewCount={viewCountFor("lingchuang")}
          />
        </article>
      </Link>
    ),
    fruits: (
      <Link
        key="fruits"
        data-brand-slug="fruits"
        data-testid="brand-card-fruits"
        href="/p/proj_hzxm2t/limited/fruits"
        onClick={() => recordBrandClick("fruits")}
        className="block active:scale-[0.985]"
      >
        <article
          className={BRAND_CARD_FRAME_CLASS}
          style={{
            background: "#F8F6EE",
            boxShadow: "0 14px 32px rgba(131,111,61,0.16)",
          }}
        >
          <MibanImage
            variant="card"
            priority={sortedBrands[0] === "fruits"}
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
          <div className={`${BRAND_CARD_CONTENT_CLASS} text-white`}>
            <div>
              <div className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.11em] text-white/80">
                随季更新
              </div>
              <h3 className={`mt-2 ${BRAND_CARD_TITLE_CLASS}`}>
                四季水果精选
              </h3>
              <p className="mt-2 text-[11px] leading-5 text-white/80">
                汇集各地应季鲜果，进入专区查看当前精选。
              </p>
            </div>
            <span className={`${BRAND_CARD_CTA_CLASS} bg-[#FFFDF7] text-[#6A6B3C]`}>
              查看水果精选
              <ChevronRight className={BRAND_CARD_CTA_ICON_CLASS} strokeWidth={2.5} />
            </span>
          </div>
          <AttentionCount
            brandSlug="fruits"
            viewCount={viewCountFor("fruits")}
          />
        </article>
      </Link>
    ),
    midaniang: (
      <Link
        key="midaniang"
        data-brand-slug="midaniang"
        data-testid="brand-card-midaniang"
        href="/p/proj_hzxm2t/limited/midaniang"
        onClick={() => recordBrandClick("midaniang")}
        className="block active:scale-[0.985]"
      >
        <article
          className={BRAND_CARD_FRAME_CLASS}
          style={{
            background: "#FFFDF9",
            boxShadow: "0 14px 32px rgba(144,104,55,0.16)",
          }}
        >
          <MibanImage
            variant="card"
            priority={sortedBrands[0] === "midaniang"}
            src={MIDANIANG_BRAND_CARD}
            alt="米大娘五常大米礼盒为主，搭配亚麻籽油与大米年糕的米粮系列陈列"
            data-testid="midaniang-stage"
            className="pointer-events-none absolute inset-0 h-full w-full object-cover object-right"
          />
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "linear-gradient(90deg,#FFFFFF 0%,rgba(255,255,255,0.98) 29%,rgba(255,255,255,0.88) 43%,rgba(255,255,255,0.28) 58%,rgba(255,255,255,0) 72%)",
            }}
          />
          <div className={BRAND_CARD_CONTENT_CLASS}>
            <div>
              <div className="flex items-center gap-2">
                <MibanImage
                  variant="icon"
                  src={MIDANIANG_APPROVED_LOGO}
                  alt="米大娘红金交织Logo，右上角R1标签"
                  data-testid="midaniang-approved-logo"
                  className="h-[68px] w-[68px] shrink-0 object-contain"
                />
                <p className="text-[11px] font-medium leading-[18px] tracking-[0.04em]" style={{ color: MIDANIANG_THEME.muted }}>
                  东北五常<br />龙凤山镇
                </p>
              </div>
              <h3 className={`mt-1.5 whitespace-nowrap ${BRAND_CARD_TITLE_CLASS}`} style={{ color: MIDANIANG_THEME.primary }}>
                米大娘精选
              </h3>
              <p className="mt-1.5 text-[11px] leading-[18px]" style={{ color: MIDANIANG_THEME.muted }}>
                五常大米为主，<br />甄选米粮与食用油好物。
              </p>
            </div>
            <span
              className={`mt-3 ${BRAND_CARD_CTA_CLASS} text-white`}
              style={{ background: MIDANIANG_THEME.primary }}
            >
              查看米大娘精选
              <ChevronRight className={BRAND_CARD_CTA_ICON_CLASS} strokeWidth={2.5} />
            </span>
          </div>
          <AttentionCount brandSlug="midaniang" viewCount={viewCountFor("midaniang")} />
        </article>
      </Link>
    ),
    wangka: (
      <WangkaBrandCard
        key="wangka"
        priority={sortedBrands[0] === "wangka"}
        onClick={() => recordBrandClick("wangka")}
        viewCount={viewCountFor("wangka")}
      />
    ),
  };

  return (
    <div
      className="min-h-screen pb-8"
      style={{ background: HERBALIFE_THEME.canvas }}
    >
      <section
        className="mx-auto grid w-full max-w-[1040px] grid-cols-1 gap-4 px-5 pt-6 md:grid-cols-2"
        aria-label="精选系列"
        data-testid="limited-brand-list"
      >
        <WineTastingPreviewCard />
        {sortedBrands.map(brandSlug => brandCards[brandSlug])}
        <AmwayDailyPreviewCard />
        <MaryKayBeautyPreviewCard />
        <NuSkinBeautyPreviewCard />
      </section>

      <p className="px-5 pt-7 text-center text-[11px] text-[#C6C0BE]">
        更多健康美丽品牌正在甄选中
      </p>
    </div>
  );
}
