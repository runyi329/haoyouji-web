import { useEffect, useState } from "react";
import { Link } from "wouter";
import { ChevronRight, Sparkles } from "lucide-react";
import { mtrpc } from "./mibanTrpc";
import { HERBALIFE_THEME } from "../../../../shared/herbalife-theme";
import { TUOQUETANG_THEME } from "../../../../shared/miban-limited-brand-config";

const BRAND_CARD_COS_BASE =
  "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/miban-shebei/brand-cards/v2";
const HERBALIFE_CN_PRODUCTS_CARD =
  "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/miban-shebei/brand-cards/v3/herbalife-cn-weight-management-products-trimmed.webp";

export default function LimitedSale() {
  const { data: pearSpecs } = mtrpc.pear.getSpecs.useQuery({
    productKey: "tiangui-pear",
  });
  const pearMinPrice =
    pearSpecs && pearSpecs.length > 0
      ? Math.min(...pearSpecs.map((spec: any) => spec.price))
      : 88;

  const pearDeadline = new Date("2026-07-25T00:00:00+08:00").getTime();
  const [pearCountdown, setPearCountdown] = useState("");
  const [pearExpired, setPearExpired] = useState(false);

  useEffect(() => {
    const tick = () => {
      const diff = pearDeadline - Date.now();
      if (diff <= 0) {
        setPearCountdown("已结束");
        setPearExpired(true);
        return;
      }
      const days = Math.floor(diff / 86_400_000);
      const hours = Math.floor((diff % 86_400_000) / 3_600_000);
      const minutes = Math.floor((diff % 3_600_000) / 60_000);
      const seconds = Math.floor((diff % 60_000) / 1_000);
      setPearCountdown(
        `${days}天 ${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
      );
    };

    tick();
    const timer = window.setInterval(tick, 1_000);
    return () => window.clearInterval(timer);
  }, [pearDeadline]);

  const pearCard = (
    <div
      className="relative h-40 overflow-hidden rounded-2xl"
      style={{
        background: pearExpired ? "#EFEFEF" : "#F4F4F4",
        opacity: pearExpired ? 0.7 : 1,
      }}
    >
      <img
        src="https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/miban-pear/pear_main.webp"
        alt="天桂梨"
        className="pointer-events-none absolute right-0 top-0 h-40 w-40 object-contain object-right-top"
        style={{ filter: pearExpired ? "grayscale(60%)" : "none" }}
      />
      <img
        src="https://files.manuscdn.com/user_upload_by_module/session_file/310519663279996243/siulsrQuLsYyDqwV.png"
        alt="地理标志"
        className="pointer-events-none absolute bottom-2 right-10 h-8 w-8 object-contain"
        style={{ filter: pearExpired ? "grayscale(80%)" : "none" }}
      />
      <div
        className="absolute left-0 top-0 flex h-8 w-[72%] items-center gap-2 px-4"
        style={{
          background: pearExpired
            ? "linear-gradient(to right, #999 70%, rgba(153,153,153,0))"
            : "linear-gradient(to right, #FF6900 70%, rgba(255,105,0,0))",
        }}
      >
        {pearExpired ? (
          <span className="text-[12px] font-bold tracking-[0.08em] text-white">
            已下架
          </span>
        ) : (
          <>
            <span className="whitespace-nowrap text-[12px] font-bold tracking-[0.08em] text-white">
              夏季限卖
            </span>
            <span className="text-[12px] text-white/60">·</span>
            <span className="font-mono text-[12px] font-bold tracking-[0.04em] text-white">
              {pearCountdown}
            </span>
          </>
        )}
      </div>
      <div className="absolute bottom-0 left-0 top-9 flex w-[58%] flex-col justify-end px-4 pb-4">
        <h3
          className="text-[16px] font-bold leading-[1.3]"
          style={{ color: pearExpired ? "#999" : "#111" }}
        >
          天桂梨
        </h3>
        <span
          className="mt-1 text-[9px] font-semibold tracking-[0.02em]"
          style={{ color: pearExpired ? "#bbb" : "#4A9E5C" }}
        >
          地理标志产品 · 绿色食品
        </span>
        <span className="mt-1 text-[10px] text-[#AAA]">
          江西广丰 · 糖度 13%+
        </span>
        <div className="mt-2 flex items-center gap-2">
          {!pearExpired && (
            <div
              className="flex items-baseline gap-0.5"
              style={{ color: "#FF6900" }}
            >
              <span className="text-[12px] font-bold">¥</span>
              <span className="text-[24px] font-black leading-none">
                {pearMinPrice}
              </span>
              <span className="ml-0.5 text-[10px] text-[#BBB]">起</span>
            </div>
          )}
          <span
            className="rounded-full px-3 py-1 text-[11px] font-bold text-white"
            style={{ background: pearExpired ? "#CCC" : "#FF6900" }}
          >
            {pearExpired ? "已下架" : "立即购买"}
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <div
      className="min-h-screen pb-8"
      style={{ background: HERBALIFE_THEME.canvas }}
    >
      <section className="space-y-4 px-5 pt-6" aria-label="品牌卡牌">
        <Link
          href="/p/proj_hzxm2t/limited/herbalife"
          className="block active:scale-[0.985]"
        >
          <article
            className="relative min-h-[220px] overflow-hidden rounded-[22px]"
            style={{
              background:
                "radial-gradient(circle at 88% 0%, #9CD85D 0%, rgba(156,216,93,0) 31%), linear-gradient(125deg, #0D572C 0%, #2E9437 57%, #59B941 100%)",
              boxShadow: "0 14px 32px rgba(59,128,37,0.22)",
            }}
          >
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(90deg,rgba(7,70,32,0.94) 0%,rgba(18,111,46,0.86) 47%,rgba(40,141,50,0.24) 75%,rgba(50,143,57,0.02) 100%)",
              }}
            />
            <div className="pointer-events-none absolute bottom-[-28px] right-[-64px] h-[280px] w-[280px]">
              <div className="absolute bottom-4 left-1/2 h-8 w-[188px] -translate-x-1/2 rounded-[50%] bg-[#0A4B28]/35 blur-md" />
              <img
                src={HERBALIFE_CN_PRODUCTS_CARD}
                alt="康宝莱中国官网体重管理系列中文包装产品"
                className="absolute bottom-0 right-0 h-full w-full object-contain drop-shadow-[0_16px_16px_rgba(0,0,0,0.25)]"
              />
            </div>
            <div className="relative z-10 flex min-h-[220px] max-w-[50%] flex-col justify-between px-5 py-5 text-white">
              <div>
                <div className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.11em] text-white/80">
                  <Sparkles className="h-3.5 w-3.5" strokeWidth={2.2} />
                  中国官网系列
                </div>
                <h3 className="mt-2 text-[23px] font-extrabold leading-tight">
                  康宝莱精选
                </h3>
                <p className="mt-2 text-[11px] leading-5 text-white/78">
                  中文包装产品系列，进入专区查看在售商品。
                </p>
              </div>
              <span
                className="inline-flex w-fit items-center gap-1.5 rounded-full bg-white px-3 py-2 text-[11px] font-bold"
                style={{ color: HERBALIFE_THEME.primary }}
              >
                查看康宝莱精选
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
      </section>

      <section className="px-5 pb-1 pt-8" aria-label="时令上新">
        <div className="mb-3 flex items-end justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded bg-[#FF6900] px-2 py-0.5 text-[10px] font-bold text-white">
                限时
              </span>
              <h2 className="text-[17px] font-bold text-[#211C1C]">时令上新</h2>
            </div>
            <p className="mt-1 text-[12px] text-[#9B9290]">
              当季限量，错过等明年
            </p>
          </div>
        </div>
        {pearExpired ? (
          pearCard
        ) : (
          <Link
            href="/p/proj_hzxm2t/pear/tiangui"
            className="block active:scale-[0.985]"
          >
            {pearCard}
          </Link>
        )}
      </section>

      <p className="px-5 pt-7 text-center text-[11px] text-[#C6C0BE]">
        更多健康美丽品牌正在甄选中
      </p>
    </div>
  );
}
