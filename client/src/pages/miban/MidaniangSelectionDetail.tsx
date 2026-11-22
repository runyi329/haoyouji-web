import { Link, useParams } from "wouter";
import { ArrowLeft, ArrowRight } from "lucide-react";
import {
  midaniangSelectionCatalog,
  type MidaniangSelectionItem,
} from "@shared/midaniang-selection-catalog";
import {
  midaniangSelectionAssets,
  midaniangSelectionPosterDimensions,
} from "@shared/midaniang-selection-assets";
import { MIDANIANG_SELECTION_PATH } from "./MidaniangSelection";
import { cnyToU, useMibanUsdtCnyRate } from "./useMibanUsdtCnyRate";
import MidaniangOrganicMark from "./MidaniangOrganicMark";
import MidaniangPurchaseActions from "./MidaniangPurchaseActions";

const POSTER_KEYS = {
  "classic-rice-gift": [
    "classicHero",
    "organicStory",
    "classicPackaging",
    "classicGift",
    "cookingStory",
  ],
  "family-rice-gift": [
    "familyHero",
    "organicStory",
    "familyPackaging",
    "familyMeal",
    "cookingStory",
  ],
} as const;
const POSTER_DESCRIPTIONS = {
  classicHero: "经典大米礼盒 · 米粮与日常心意",
  organicStory: "商家种植理念 · 稻田故事示意，非认证证明",
  classicPackaging: "经典礼盒包装 · 500g×6，净含量3000g（6斤）",
  classicGift: "经典礼盒分享场景示意",
  cookingStory: "煮饭与日常餐桌场景示意",
  familyHero: "给孩子的一份礼物 · 家庭分享心意",
  familyPackaging: "绿色礼盒包装 · 300g×9包，净含量2700g（5.4斤）",
  familyMeal: "家庭餐桌场景示意 · 主食与多样食物搭配",
} as const;

/** Do not fall back to the production SKU or another product. */
export function getMidaniangSelection(
  selectionKey: string | undefined
): MidaniangSelectionItem | undefined {
  if (
    selectionKey !== "classic-rice-gift" &&
    selectionKey !== "family-rice-gift"
  )
    return undefined;
  return midaniangSelectionCatalog.find(item => item.key === selectionKey);
}

export default function MidaniangSelectionDetail() {
  const params = useParams<{ selectionKey: string }>();
  const usdtCnyRate = useMibanUsdtCnyRate();
  const listHref = MIDANIANG_SELECTION_PATH;
  const item = getMidaniangSelection(params.selectionKey);

  if (!item) {
    return (
      <main
        className="mx-auto min-h-screen w-full max-w-[480px] bg-[#f7f4ee] px-5 py-12 text-center text-[#343a31]"
        data-testid="midaniang-not-found"
      >
        <h1 className="text-[22px] font-medium">商品不存在</h1>
        <p className="mt-4 text-[13px] leading-6 text-[#676b60]">
          未找到这款米大娘商品，请返回列表查看当前两款礼盒。
        </p>
        <Link
          href={listHref}
          aria-label="返回米大娘精选列表"
          className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-full bg-[#8d292c] px-5 text-[13px] text-white"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          返回列表
        </Link>
      </main>
    );
  }

  const isFamily = item.key === "family-rice-gift";
  const priceU = cnyToU(item.priceCny, usdtCnyRate);
  const faqs = [
    {
      question: "两款礼盒有什么区别？",
      answer: `经典大米礼盒为经典包装，已确认500g×6、净含量3000g（6斤）；给孩子的一份礼物为绿色家庭分享包装，已确认300g×9包、净含量2700g（5.4斤）。两款USDT参考价均为${priceU.toFixed(2)} USDT /盒（商家原始推荐零售价 ≈ ¥${item.priceCny.toFixed(2)} /盒，按实时汇率折算），包装差异不表示营养或功能差异。`,
    },
    {
      question: "净含量是多少？",
      answer: isFamily
        ? "绿色礼盒为300g×9包，净含量2700g（5.4斤）。实际规格以实物标签为准。"
        : "经典礼盒为500g×6，净含量3000g（6斤）。配料、日期与其他标示以实物标签为准。",
    },
    {
      question: "怎么买？",
      answer:
        "点击立即购买，核对规格、数量和收货地址，通过米伴钱包完成支付；也可将两款米大娘商品加入购物车合单结算。",
    },
    {
      question: "有机认证信息怎么看？",
      answer:
        "商家确认产品已获有机认证，具体认证范围与有效期以认证证书和实物标签为准；检测报告以对应批次的实际文件为准。",
    },
    {
      question: "儿童可以食用吗？",
      answer:
        "大米是一般主食，不是儿童功能食品，也不是专门的婴儿辅食。家长应结合实际年龄、咀嚼能力及个体情况安排适量分量和软硬度，搭配蔬菜与蛋、豆类等食物，不替代多样饮食。需要特殊饮食安排时请咨询专业人员。",
    },
    {
      question: "煮饭水量要多少？",
      answer:
        "遵照包装和所用电饭煲的说明淘洗、加水，水量可按个人口感调整，充分煮熟。本页不提供适用于所有米种和设备的固定米水比例。",
    },
    {
      question: "如何保存，保质期多久？",
      answer:
        "保存条件与保质期以包装标签标示为准。开封后密封，避光、干燥、防潮；生产日期和保质期以实物包装标签为准。",
    },
  ];

  return (
    <main
      className="mx-auto min-h-screen w-full max-w-[480px] bg-[#f7f4ee] pb-10 text-[#343a31]"
      data-testid="midaniang-selection-detail"
      data-selection-key={item.key}
    >
      <header className="grid min-h-14 grid-cols-[64px_minmax(0,1fr)_64px] items-center border-b border-[#e5e0d5] px-4">
        <Link
          href={listHref}
          aria-label="返回米大娘精选列表"
          className="inline-flex min-h-11 items-center gap-1 text-[12px] text-[#8d292c]"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          返回
        </Link>
        <p className="min-w-0 text-center text-[16px] font-medium tracking-[0.06em]">
          米大娘 · 大米礼盒
        </p>
        <span aria-hidden="true" />
      </header>
      <div className="relative" data-testid="midaniang-detail-hero">
        <div className="aspect-square w-full bg-[#ece8dc]">
          <img
            src={midaniangSelectionAssets.grid[item.key]}
            alt={`米大娘${item.title}礼盒包装示意`}
            width={1024}
            height={1024}
            loading="eager"
            fetchPriority="high"
            className="block h-full w-full object-contain"
            data-testid="midaniang-detail-main-image"
          />
        </div>
        <div className="absolute right-3 top-3 z-10 flex items-start gap-3" data-testid="midaniang-detail-brand-marks">
          <img
            src={midaniangSelectionAssets.logo}
            alt="米大娘品牌标签"
            width={48}
            height={48}
            className="h-12 w-12 object-contain"
            data-testid="midaniang-detail-brand-mark"
          />
          <MidaniangOrganicMark
            variant="large"
            data-testid="midaniang-detail-organic-mark"
          />
        </div>
      </div>
      <section aria-label="商品信息摘要" className="px-5 pb-6 pt-5">
        <p className="text-[11px] tracking-[0.12em] text-[#8d292c]">
          米大娘 / 大米礼盒
        </p>
        <h1 className="mt-2 text-[24px] font-medium leading-9">{item.title}</h1>
        <p className="mt-2 text-[13px] leading-6 text-[#676b60]">
          {item.specification}
        </p>
        <p
          className="mt-2 text-[11px] leading-5 text-[#376443]"
          data-testid="midaniang-detail-organic-status"
        >
          已获有机认证
        </p>
        <p
          className="mt-3 flex flex-wrap items-baseline gap-x-1 tabular-nums text-[#8d292c]"
          data-testid="midaniang-detail-price-u"
        >
          <span className="text-[28px] font-medium">{priceU.toFixed(2)}</span>
          <span className="text-[12px]">USDT /盒</span>
        </p>
        <p
          className="mt-1 text-[11px] text-[#777b70]"
          data-testid="midaniang-detail-price-cny"
        >
          ≈ ¥{item.priceCny.toFixed(2)}
        </p>
        <p className="mt-1 text-[11px] text-[#676b60]">
          人民币为商家原始推荐零售价 · USDT参考价按实时汇率折算
        </p>
        <MidaniangPurchaseActions item={item} />
        <p className="mt-3 text-[11px] leading-6 text-[#777b70]">
          图片为设计展示，商品规格、批次与日期以实物包装标签为准。
        </p>
      </section>
      <nav
        aria-label="详情章节"
        className="grid grid-cols-4 border-y border-[#e5e0d5] px-2"
      >
        {[
          ["product-story", "产品故事"],
          ["specification-info", "规格信息"],
          ["cooking-storage", "食用保存"],
          ["frequently-asked-questions", "常见问题"],
        ].map(([id, label]) => (
          <a
            key={id}
            href={`#${id}`}
            className="flex min-h-12 min-w-0 items-center justify-center text-center text-[12px] text-[#8d292c] focus-visible:outline-[#8d292c]"
          >
            {label}
          </a>
        ))}
      </nav>

      {/* Five original-ratio posters join edge to edge; never crop or pad the images. */}
      <section
        aria-label="产品故事海报，AI重设计示意"
        data-testid="midaniang-poster-stack"
        style={{ margin: 0, padding: 0, border: 0, lineHeight: 0 }}
      >
        {POSTER_KEYS[item.key].map((posterKey, index) => (
          <img
            key={posterKey}
            src={midaniangSelectionAssets.posters[posterKey]}
            alt={POSTER_DESCRIPTIONS[posterKey]}
            width={midaniangSelectionPosterDimensions.width}
            height={midaniangSelectionPosterDimensions.height}
            loading={index === 0 ? "eager" : "lazy"}
            decoding="async"
            data-poster-key={posterKey}
            style={{
              display: "block",
              width: "100%",
              height: "auto",
              margin: 0,
              padding: 0,
              border: 0,
            }}
          />
        ))}
      </section>

      <div className="px-5">
        <section
          id="product-story"
          aria-labelledby="product-story-title"
          className="scroll-mt-16 border-b border-[#e5e0d5] py-8"
        >
          <p className="text-[10px] tracking-[0.16em] text-[#8d292c]">
            01 / 日常心意
          </p>
          <h2 id="product-story-title" className="mt-2 text-[20px] font-medium">
            产品故事
          </h2>
          <p className="mt-4 text-[13px] leading-7 text-[#676b60]">
            品牌：米大娘。{item.description}
            商家产地介绍为五常龙凤山镇；本页依据商家资料整理，场景图片为AI重设计示意，不作为产地溯源或检测证明。
          </p>
          <p className="mt-3 text-[13px] leading-7 text-[#676b60]">
            商家确认产品已获有机认证。一年一季，包装设有编号；实际批次与编号以实物为准。有机认证范围、有效期及批次检测信息以认证证书和对应文件为准。
          </p>
        </section>

        <section
          id="specification-info"
          aria-labelledby="specification-info-title"
          className="scroll-mt-16 border-b border-[#e5e0d5] py-8"
        >
          <p className="text-[10px] tracking-[0.16em] text-[#8d292c]">
            02 / 如实记录
          </p>
          <h2
            id="specification-info-title"
            className="mt-2 text-[20px] font-medium"
          >
            规格信息
          </h2>
          <dl className="mt-5 space-y-4 text-[12px] leading-6">
            {[
              ["品牌", "米大娘"],
              ["商品名称", item.title],
              ["包装", isFamily ? "绿色礼盒 · 家庭分享装" : "经典礼盒"],
              ["商家产地介绍", "五常龙凤山镇"],
              ["参考价", `${priceU.toFixed(2)} USDT /盒`],
              ["规格 / 净含量", item.specification],
              ["配料", "以实物包装标签为准"],
              ["执行标准", "以实物包装标签为准"],
              ["生产日期 / 保质期", "以实物包装标签为准"],
              ["有机认证 / 检测报告", "商家确认已获有机认证，认证范围与批次检测以实际文件为准"],
            ].map(([label, value]) => (
              <div
                key={label}
                className="grid grid-cols-[92px_minmax(0,1fr)] gap-3"
              >
                <dt className="text-[#676b60]">{label}</dt>
                <dd
                  className="min-w-0 break-words"
                  data-testid={
                    label === "参考价"
                      ? "midaniang-specification-price"
                      : undefined
                  }
                >
                  {value}
                  {label === "参考价" && (
                    <p className="mt-1 text-[11px] text-[#777b70]">
                      ≈ ¥{item.priceCny.toFixed(2)} /盒 · 原始推荐零售价
                    </p>
                  )}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-[11px] leading-6 text-[#676b60]">
            配料、执行标准和日期以实物标签为准，认证信息与批次检测报告以实际文件为准。
          </p>
        </section>

        <section
          id="cooking-storage"
          aria-labelledby="cooking-storage-title"
          className="scroll-mt-16 border-b border-[#e5e0d5] py-8"
        >
          <p className="text-[10px] tracking-[0.16em] text-[#8d292c]">
            03 / 好好吃饭
          </p>
          <h2
            id="cooking-storage-title"
            className="mt-2 text-[20px] font-medium"
          >
            食用保存
          </h2>
          <h3 className="mt-5 text-[14px] font-medium">淘洗与煮饭</h3>
          <p className="mt-2 text-[13px] leading-7 text-[#676b60]">
            遵照包装和电饭煲说明淘洗、加水，水量按个人口感调整，并充分煮熟。不同米种、设备和食用偏好可能需要不同水量。
          </p>
          <h3 className="mt-5 text-[14px] font-medium">保存与标签</h3>
          <p className="mt-2 text-[13px] leading-7 text-[#676b60]">
            按包装标示保存；开封后密封、避光、干燥、防潮。生产日期和保质期以实物包装标签为准。
          </p>
          <h3 className="mt-5 text-[14px] font-medium">儿童与家庭餐桌</h3>
          <p className="mt-2 text-[13px] leading-7 text-[#676b60]">
            大米是一般主食，不是功能食品或专门的婴儿辅食。家长应按实际年龄、咀嚼能力及个体情况安排分量和软硬度，搭配蔬菜与蛋、豆类等食物，不替代多样饮食。
          </p>
          <p className="mt-3 text-[11px] leading-6 text-[#777b70]">
            一般均衡饮食参考：
            <a
              href="https://www.mayoclinic.org/healthy-lifestyle/childrens-health/in-depth/nutrition-for-kids/art-20049335"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#8d292c] underline underline-offset-4"
            >
              Mayo Clinic 儿童营养原则
            </a>
            。该来源不评价或背书米大娘产品。
          </p>
        </section>

        <section
          id="frequently-asked-questions"
          aria-labelledby="frequently-asked-questions-title"
          className="scroll-mt-16 py-8"
        >
          <p className="text-[10px] tracking-[0.16em] text-[#8d292c]">
            04 / 先了解，再选择
          </p>
          <h2
            id="frequently-asked-questions-title"
            className="mt-2 text-[20px] font-medium"
          >
            常见问题
          </h2>
          <div className="mt-4 divide-y divide-[#e5e0d5]">
            {faqs.map(faq => (
              <details key={faq.question} className="group py-1">
                <summary className="cursor-pointer py-4 text-[13px] font-medium leading-6 focus-visible:outline-[#8d292c]">
                  {faq.question}
                </summary>
                <p className="pb-4 text-[12px] leading-7 text-[#676b60]">
                  {faq.answer}
                </p>
              </details>
            ))}
          </div>
        </section>
        <footer className="border-t border-[#e5e0d5] pt-5 text-[11px] leading-6 text-[#777b70]">
          <p>
            商品信息由商家提供，包装图片为设计展示。规格和标签信息以实物为准，认证信息由商家确认。
          </p>
          <Link
            href={listHref}
            aria-label="返回米大娘精选列表"
            className="mt-4 inline-flex min-h-11 items-center gap-1 text-[12px] text-[#8d292c]"
          >
            返回米大娘精选列表
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </footer>
      </div>
    </main>
  );
}
