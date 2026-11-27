import { Link } from "wouter";
import { ChevronRight } from "lucide-react";
import { MibanImage } from "./MibanImage";

export const WANGKA_BRAND_CARD_IMAGE = "/miban-wangka/wangka-real-products-abundant-ingredients-v9.webp";
export const WANGKA_BRAND_LOGO = "/icons/chongban-logo-symbol-v3.webp";
export const WANGKA_BRAND_PATH = "/p/proj_hzxm2t/limited/wangka";

export function WangkaBrandCard({
  href = WANGKA_BRAND_PATH,
  priority = false,
  onClick,
  viewCount,
}: {
  href?: string;
  priority?: boolean;
  onClick?: () => void;
  viewCount?: number;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      data-brand-slug="wangka"
      data-testid="brand-card-wangka"
      aria-label="旺咔宠物口粮精选"
      className="block active:scale-[0.985]"
    >
      <article
        className="relative isolate min-h-[224px] overflow-hidden rounded-[22px] md:aspect-[16/9]"
        style={{
          background: "#FFF9F3",
          boxShadow: "0 14px 32px rgba(155,74,101,0.14)",
        }}
      >
        <MibanImage
          variant="card"
          priority={priority}
          src={WANGKA_BRAND_CARD_IMAGE}
          alt="后排海外宠物罐头稳固叠放，加入三款实拍包装，前排丰盛原材料约占右侧三分之一的陈列预览"
          className="pointer-events-none absolute inset-0 h-full w-full object-cover object-right"
        />
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(90deg,#FFF9F3 0%,rgba(255,249,243,0.98) 27%,rgba(255,249,243,0.87) 40%,rgba(255,249,243,0.28) 55%,rgba(255,249,243,0) 68%)",
          }}
        />
        <div className="relative z-10 flex h-full min-h-[224px] max-w-[58%] flex-col justify-between px-4 py-4 min-[400px]:px-5">
          <div>
            <div className="flex items-center gap-2">
              <MibanImage
                variant="icon"
                src={WANGKA_BRAND_LOGO}
                alt="旺咔猫狗立体品牌标志"
                data-testid="wangka-brand-logo"
                className="h-[68px] w-[68px] shrink-0 object-contain"
              />
              <p className="text-[11px] font-medium leading-[18px] tracking-[0.04em] text-[#9C6A74]">全球采购<br />专注进口</p>
            </div>
            <h3 className="mt-1.5 whitespace-nowrap text-[clamp(16px,4.7vw,20px)] font-extrabold leading-tight text-[#B83367]">旺咔宠物口粮精选</h3>
            <p className="mt-1.5 text-[11px] leading-[18px] text-[#9C6A74]">甄选海外优质口粮，<br />关注营养与健康，<br />守护猫狗的每一餐。</p>
          </div>
          <span className="mt-3 inline-flex min-h-[32px] w-fit items-center gap-1.5 whitespace-nowrap rounded-full bg-[#B83367] px-3 py-2 text-[11px] font-bold text-white">
            查看进口精选
            <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.5} />
          </span>
        </div>
        <span
          data-testid="wangka-attention"
          data-view-count={viewCount === undefined ? "unavailable" : String(viewCount)}
          className="pointer-events-none absolute bottom-4 right-4 z-20 rounded-md bg-black/35 px-2 py-1 text-right text-[10px] font-normal leading-[14px] text-white/90 [overflow-wrap:anywhere]"
          style={{ maxWidth: "calc(41% - 16px)" }}
        >
          关注 {viewCount === undefined ? "--" : `+${viewCount}`}
        </span>
      </article>
    </Link>
  );
}
