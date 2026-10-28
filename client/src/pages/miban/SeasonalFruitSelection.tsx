import { Link } from "wouter";
import { Apple, ArrowLeft, ChevronRight, MapPin } from "lucide-react";
import { mtrpc } from "./mibanTrpc";
import { cnyToU, useMibanUsdtCnyRate } from "./useMibanUsdtCnyRate";

const PEAR_DEADLINE = new Date("2026-07-25T00:00:00+08:00").getTime();
const TIANGUI_PEAR_IMAGE =
  "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/miban-pear/pear_main.webp";
const MAJIAYOU_IMAGE =
  "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/miban-shebei/guangfeng-majiayou/v1/majiayou-hero.webp";

export default function SeasonalFruitSelection() {
  const { data: pearSpecs } = mtrpc.pear.getSpecs.useQuery({
    productKey: "tiangui-pear",
  });
  const usdtCnyRate = useMibanUsdtCnyRate();
  const pearMinPrice =
    pearSpecs && pearSpecs.length > 0
      ? Math.min(
          ...pearSpecs.map((spec: { price: number | string }) =>
            Number(spec.price)
          )
        )
      : 88;
  const pearExpired = Date.now() >= PEAR_DEADLINE;
  const majiayouStartingPriceU = cnyToU(19.9, usdtCnyRate);

  return (
    <div className="min-h-screen bg-[#FAF9F5] pb-8">
      <header className="border-b border-[#E9E6DA] bg-white px-5 pb-4 pt-5">
        <Link
          href="/p/proj_hzxm2t/limited"
          className="inline-flex items-center gap-1 text-[12px] font-medium text-[#8A7B57] active:opacity-65"
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.2} />
          返回
        </Link>
        <div className="mt-3 flex items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-1.5 text-[11px] font-bold tracking-[0.12em] text-[#9B8552]">
              <Apple className="h-3.5 w-3.5" strokeWidth={2.2} />
              四季鲜果
            </div>
            <h1 className="mt-1 text-[22px] font-extrabold tracking-tight text-[#2E3C30]">
              四季水果精选
            </h1>
            <p className="mt-1 text-[11px] text-[#908A7C]">
              随季更新，从产地到餐桌的好水果。
            </p>
          </div>
          <span className="rounded-full bg-[#F3EFE2] px-2.5 py-1 text-[10px] font-bold text-[#88713E]">
            2 款精选
          </span>
        </div>
      </header>

      <section
        className="mx-auto mt-4 w-[calc(100%-2rem)] max-w-[480px]"
        aria-label="四季水果精选商品"
      >
        <div className="mb-3 flex items-end justify-between">
          <div>
            <h2 className="text-[15px] font-extrabold text-[#35352F]">
              当季鲜果
            </h2>
            <p className="mt-1 text-[11px] text-[#A39C8C]">
              供应状态以当季实际供应为准
            </p>
          </div>
          <span className="text-[10px] font-medium text-[#9B8552]">
            随季更新
          </span>
        </div>

        <div className="space-y-3">
          <Link
            href="/p/proj_hzxm2t/limited/guangfeng-majiayou"
            className="block overflow-hidden rounded-[20px] border border-[#DFE7CA] bg-white shadow-[0_6px_16px_rgba(73,91,38,0.09)] active:scale-[0.99]"
          >
            <article className="grid min-h-[174px] grid-cols-[132px_minmax(0,1fr)] max-[360px]:grid-cols-[118px_minmax(0,1fr)]">
              <div className="relative overflow-hidden bg-[#EFF3E3]">
                <img
                  src={MAJIAYOU_IMAGE}
                  alt="广丰马家柚"
                  className="h-full w-full object-cover object-center"
                />
                <span className="absolute left-0 top-3 rounded-r-full bg-[#647B35] px-2.5 py-1 text-[9px] font-bold text-white">
                  秋冬鲜果
                </span>
              </div>

              <div className="flex min-w-0 flex-col justify-between px-3.5 py-3 max-[360px]:px-2.5">
                <div>
                  <span className="text-[10px] font-bold text-[#647B35]">
                    产地鲜果
                  </span>
                  <h3 className="mt-1 text-[17px] font-extrabold leading-5 text-[#2E3C30]">
                    广丰马家柚
                  </h3>
                  <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-[#718064]">
                    江西上饶广丰 · 厚皮玫红果肉 · 果实以当季实物为准
                  </p>
                  <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-[#F2F4E8] px-2 py-0.5 text-[9px] font-medium text-[#647B35]">
                    <MapPin className="h-2.5 w-2.5" strokeWidth={2.3} />
                    江西上饶广丰
                  </span>
                </div>

                <div className="mt-3 flex items-end justify-between gap-2">
                  <div className="tabular-nums leading-none">
                    <div className="text-[20px] font-extrabold tracking-[-0.04em] text-[#C65A42]">
                      {majiayouStartingPriceU.toFixed(2)}
                      <span className="ml-0.5 text-[9px] font-bold tracking-normal">
                        USDT
                      </span>
                      <span className="ml-0.5 text-[10px] font-medium text-[#A39C8C]">
                        起
                      </span>
                    </div>
                    <div className="mt-1 text-[10px] font-medium text-[#A39C8C]">
                      ≈ ¥19.90
                    </div>
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-[#F2F4E8] px-2.5 py-1.5 text-[10px] font-bold text-[#52652B]">
                    查看详情
                    <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.4} />
                  </span>
                </div>
              </div>
            </article>
          </Link>

          <Link
            href="/p/proj_hzxm2t/pear/tiangui"
            className="block overflow-hidden rounded-[20px] border border-[#EAE5D6] bg-white shadow-[0_6px_16px_rgba(77,65,34,0.07)] active:scale-[0.99]"
          >
            <article className="grid min-h-[168px] grid-cols-[132px_minmax(0,1fr)] max-[360px]:grid-cols-[118px_minmax(0,1fr)]">
              <div className="relative overflow-hidden bg-[#F2F0E9]">
                <img
                  src={TIANGUI_PEAR_IMAGE}
                  alt="天桂梨"
                  className="h-full w-full object-cover object-center"
                />
                <span
                  className="absolute left-0 top-3 rounded-r-full px-2.5 py-1 text-[9px] font-bold text-white"
                  style={{ background: pearExpired ? "#A9A9A4" : "#D99A35" }}
                >
                  {pearExpired ? "本季已结束" : "夏日限定"}
                </span>
              </div>

              <div className="flex min-w-0 flex-col justify-between px-3.5 py-3 max-[360px]:px-2.5">
                <div>
                  <span className="text-[10px] font-bold text-[#9B8552]">
                    产地鲜果
                  </span>
                  <h3 className="mt-1 text-[17px] font-extrabold leading-5 text-[#2E3C30]">
                    天桂梨
                  </h3>
                  <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-[#918B7E]">
                    江西广丰 · 地理标志产品 · 夏日第一口清甜
                  </p>
                  <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-[#F3F0E8] px-2 py-0.5 text-[9px] font-medium text-[#867650]">
                    <MapPin className="h-2.5 w-2.5" strokeWidth={2.3} />
                    江西广丰
                  </span>
                </div>

                <div className="mt-3 flex items-end justify-between gap-2">
                  <div className="tabular-nums leading-none">
                    {pearExpired ? (
                      <span className="text-[12px] font-bold text-[#A49F95]">
                        本季已结束
                      </span>
                    ) : (
                      <>
                        <span className="text-[11px] font-bold text-[#D68B24]">
                          ¥
                        </span>
                        <span className="ml-0.5 text-[22px] font-extrabold tracking-[-0.04em] text-[#D68B24]">
                          {pearMinPrice.toFixed(0)}
                        </span>
                        <span className="ml-0.5 text-[10px] text-[#A39C8C]">
                          起
                        </span>
                      </>
                    )}
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-[#F3EFE2] px-2.5 py-1.5 text-[10px] font-bold text-[#806A38]">
                    查看详情
                    <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.4} />
                  </span>
                </div>
              </div>
            </article>
          </Link>
        </div>
      </section>

      <p className="px-5 pt-6 text-center text-[11px] text-[#B6B0A3]">
        更多应季水果正在甄选中
      </p>
    </div>
  );
}
