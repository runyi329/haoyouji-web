import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import sharp from "sharp";
import { getMibanOfficialBrand, getMibanOfficialProduct, mibanOfficialBrands, mibanOfficialProducts, mibanOfficialBrandPath, mibanOfficialProductPath } from "../shared/miban-official-selection";
import nuskinMobilePoster from "../shared/miban-nuskin-mobile-poster.json";
import nuskinGuide from "../shared/miban-nuskin-product-guide.json";

const root = process.cwd();
const app = readFileSync(path.join(root, "client/src/pages/miban/MibanApp.tsx"), "utf8");
const detail = readFileSync(path.join(root, "client/src/pages/miban/OfficialProductDetail.tsx"), "utf8");
const outerApp = readFileSync(path.join(root, "client/src/App.tsx"), "utf8");
const expected = [
  ["nuskin", "nuskin-official-1", "ageLOC活颜视黄醇精华乳"],
  ["nuskin", "nuskin-official-2", "如新滢白三效爽肤水"],
  ["nuskin", "nuskin-official-3", "荟萃善秀初道水光精华液"],
  ["nuskin", "nuskin-official-4", "新动净痘清露"],
  ["nuskin", "nuskin-official-5", "如新晒特丽密集修护润唇膏"],
  ["marykay", "marykay-official-1", "幻时佳®臻粹紧颜精华油"],
  ["marykay", "marykay-official-2", "幻时佳®高阶紧塑精华露"],
  ["marykay", "marykay-official-3", "幻时佳®活颜紧致精华霜"],
  ["marykay", "marykay-official-4", "亮采集效焕白精华液"],
  ["marykay", "marykay-official-5", "幻时佳®多效塑颜眼霜"],
  ["amway", "amway-official-1", "丽齿健即用漱口水"],
  ["amway", "amway-official-2", "雅蜜®滋润身体乳"],
  ["amway", "amway-official-3", "丽齿健®多效白茶牙膏"],
  ["amway", "amway-official-4", "安利优生活®浓缩洗洁精"],
  ["amway", "amway-official-5", "雅蜜®滋润沐浴乳"],
] as const;

describe("米伴三品牌各五款官方只读资料", () => {
  it("十五款按各品牌已核验五款清单完整保留，不重复或串品牌", () => {
    expect(mibanOfficialBrands).toHaveLength(3);
    expect(mibanOfficialProducts).toHaveLength(15);
    expect(new Set(mibanOfficialProducts.map(product => product.key)).size).toBe(15);
    expect(mibanOfficialProducts.map(product => product.key)).toEqual(expected.map(([, key]) => key));
    for (const slug of ["nuskin", "marykay", "amway"]) {
      expect(mibanOfficialProducts.filter(product => product.brandSlug === slug).map(product => product.key)).toEqual(expected.filter(([brand]) => brand === slug).map(([, key]) => key));
    }
  });
  for (const [slug, key, name] of expected) {
    it(`${key}的真实名称与品牌匹配`, () => {
      expect(getMibanOfficialBrand(slug)).toBeDefined();
      const product = getMibanOfficialProduct(key)!;
      expect(product.name).toBe(name);
      expect(product.brandSlug).toBe(slug);
      expect(mibanOfficialProducts.filter(item => item.brandSlug === slug)).toHaveLength(5);
    });
    it(`${key}资料不能进入交易、库存和订单系统`, () => {
      const product = getMibanOfficialProduct(key)!;
      expect(product.sellable).toBe(false);
      expect(product.status).toBe("information_only");
      for (const field of ["skus", "priceCny", "stock", "inventory", "orderPolicy"]) expect(product).not.toHaveProperty(field);
    });
    it(`${key}的所有官网图片本地存在且有出处`, () => {
      const product = getMibanOfficialProduct(key)!;
      for (const url of [product.heroImageUrl, ...product.gallery.map(image => image.url)]) {
        expect(url.startsWith(`/miban-official/${slug}/`)).toBe(true);
        expect(existsSync(path.join(root, "client/public", url))).toBe(true);
      }
      expect(product.evidence.length).toBeGreaterThanOrEqual(2);
      expect(product.officialUrl).toMatch(/^https:\/\//);
      expect(product.features.length).toBeGreaterThanOrEqual(key === "nuskin-official-5" ? 1 : 3);
      expect(product.summary.length).toBeGreaterThan(10);
    });
    it(`${key}分类和具体单品路径匹配且顺序优先`, () => {
      expect(mibanOfficialBrandPath(slug)).toBe(`/p/proj_hzxm2t/limited/${slug}`);
      expect(mibanOfficialProductPath(key)).toBe(`/p/proj_hzxm2t/limited/official/${key}`);
      expect(app).toContain(`path={\`${'${BASE}'}/limited/${slug}\`}`);
      expect(app.indexOf(`path={\`${'${BASE}'}/limited/official/:productKey\`}`)).toBeLessThan(app.indexOf(`path={\`${'${BASE}'}/limited/:productKey\`}`));
      const officialRoute = 'path="/p/proj_hzxm2t/limited/official/:productKey"';
      expect(outerApp).toContain(officialRoute);
      expect(outerApp.indexOf(officialRoute)).toBeLessThan(outerApp.indexOf('path="/p/proj_hzxm2t/limited/:productKey"'));
    });
  }
  it("保留米伴本人身份读取门，不伪造匿名或管理员身份", () => {
    expect(app.indexOf("if (!ready)")).toBeLessThan(app.indexOf("<LimitedProductCartProvider>"));
    expect(app).toContain("prepareMibanPersonalQueries");
  });
  it("资料页不调用购物或付款接口，来源仅保留在内部数据", () => {
    expect(detail).not.toMatch(/trpc|addToCart|createOrder|initInventory/);
    expect(detail).not.toContain("product.limitations");
    expect(detail).toContain("此页不收款、不创建订单");
  });
  it("详情页移除官网、补充资料和资料来源的底部入口", () => {
    expect(detail).not.toContain("查看中国官网原始介绍");
    expect(detail).not.toContain("查看官网补充资料");
    expect(detail).not.toContain(">资料来源<");
    expect(detail).not.toContain("product.evidence.filter");
    expect(detail).not.toContain('target="_blank"');
    expect(getMibanOfficialProduct("nuskin-official-1")!.evidence.length).toBeGreaterThanOrEqual(2);
  });
  it("按用户要求展示官网零售价，不混用会员价或米伴自定售价", () => {
    expect(detail).toContain("data-official-sale-price");
    expect(detail).toContain("product.officialPriceCny");
    const priceComponent = readFileSync(path.join(root, "client/src/pages/miban/OfficialReferencePrice.tsx"), "utf8");
    expect(detail).toContain("<OfficialReferencePrice priceCny={salePrice}");
    expect(priceComponent).toContain("官网零售价");
    expect(detail).not.toContain("product.displaySalePriceCny");
    expect(detail).not.toContain("米伴售价");
    expect(detail).toContain('Number.isFinite(salePrice)');
    expect(priceComponent).toContain("minimumFractionDigits: 2");
    expect(priceComponent).toContain("priceU.toFixed(2)");
  });
  it("十五款人民币参考基价有核验日期和准确来源，牙膏有当前PDP与包装同价证据", () => {
    const prices = [665, 335, 300, 350, 85, 568, 568, 588, 428, 388, 99, 129, 54, 46, 88];
    for (const [index, [, key]] of expected.entries()) {
      const product = getMibanOfficialProduct(key)!;
      expect(product.officialPriceCny).toBe(prices[index]);
      expect(product.officialPriceCheckedDate).toBe("2026-11-28");
      if (key === "amway-official-3") {
        expect(product.officialPriceSourceUrl).toBe(product.officialUrl);
        expect(product.priceNote).toMatch(/公司定价/);
        expect(product.priceNote).toMatch(/2026-11-28直接核验.*未登录PDP/);
        expect(product.priceNote).toMatch(/40860.*54\.00/);
      } else if (key.startsWith("nuskin-")) {
        expect(product.officialPriceSourceUrl).toMatch(/^https:\/\/china\.nuskin\.com\//);
      } else {
        expect(product.officialPriceSourceUrl).toBe(product.officialUrl);
      }
      expect(product.sellable).toBe(false);
    }
    const selection = readFileSync(path.join(root, "client/src/pages/miban/OfficialBrandSelection.tsx"), "utf8");
    expect(selection).toContain("data-official-card-price");
    expect(selection).toContain("product.officialPriceCny");
    expect(selection).not.toContain("各详情页附中国官网原始介绍链接");
  });
  it("如新五款官网零售价按对应编号核验，不采用会员价或未加载占位0", () => {
    const prices = [665, 335, 300, 350, 85];
    const codes = ["29004312", "29102733", "29002527", "29002539", "29110369"];
    for (let index = 0; index < prices.length; index++) {
      const product = getMibanOfficialProduct(`nuskin-official-${index + 1}`)!;
      expect(product.officialPriceCny).toBe(prices[index]);
      expect(product.officialPriceCheckedDate).toBe("2026-11-28");
      expect(product.officialUrl).toContain(`/productdetail/${codes[index]}`);
      expect(product.officialPriceSourceUrl).toMatch(/^https:\/\/china\.nuskin\.com\//);
    }
  });
  for (const key of ["nuskin-official-2", "nuskin-official-3", "nuskin-official-4", "nuskin-official-5"]) {
    it(`${key}完整正文才使用海报组件，资料不足则明确标记待补`, () => {
      const product = getMibanOfficialProduct(key)!;
      expect(product.cardImageUrl).toMatch(/^\/miban-official\/nuskin\//);
      expect(existsSync(path.join(root, "client/public", product.cardImageUrl!))).toBe(true);
      if (product.detailStatus === "complete") {
        expect(product.heroLayout).toBe("poster");
        const poster = product.mobilePoster!;
        expect(poster.sourcePosterCount).toBeGreaterThan(0);
        expect(poster.substantialSections).toBeGreaterThanOrEqual(key === "nuskin-official-5" ? 6 : 7);
        expect(poster.parts.length).toBeGreaterThanOrEqual(7);
        expect(poster.parts.filter(part => part.kind === "info").length).toBeGreaterThan(0);
        const groups = new Map<string, Array<[number, number]>>();
        for (const part of poster.parts) {
          expect(part.sourceUrl).toMatch(/^https?:\/\//);
          if (part.sourceRange) {
            expect(part.sourceRange).toHaveLength(2);
            const [start, end] = part.sourceRange;
            expect(end).toBeGreaterThan(start);
            const ranges = groups.get(part.sourceUrl!) ?? [];
            ranges.push([start, end]);
            groups.set(part.sourceUrl!, ranges);
          } else {
            expect(part.kind).toBe("info");
            expect(part.sourceTextLocation!.length).toBeGreaterThan(15);
          }
          for (const image of [part.image, ...(part.photos ?? [])].filter(Boolean)) {
            expect(existsSync(path.join(root, "client/public", image!.url))).toBe(true);
            expect(image!.sourceUrl).toMatch(/^https?:\/\//);
            expect(image!.width).toBeGreaterThan(0);
            expect(image!.height).toBeGreaterThan(0);
          }
        }
        for (const [sourceUrl, ranges] of groups) {
          const original = product.gallery.find(image => image.sourceUrl === sourceUrl);
          expect(original).toBeDefined();
          expect(ranges[0][0]).toBe(0);
          expect(ranges.at(-1)![1]).toBe(original!.height);
          ranges.forEach((range, index) => { if (index) expect(range[0]).toBe(ranges[index - 1][1]); });
        }
      } else {
        expect(product.detailStatus).toBe("pending_materials");
        expect(product.mobilePoster).toBeUndefined();
        expect(product.heroLayout).toBe("packaging");
        expect(product.gallery.every(image => image.kind === "packaging")).toBe(true);
        expect(detail).toContain("data-official-details-pending");
      }
    });
  }
  it("其余四款现已全部取得同款完整正文，润唇膏实际6章不可伪增研究", () => {
    for (const key of ["nuskin-official-2", "nuskin-official-3", "nuskin-official-4", "nuskin-official-5"]) {
      expect(getMibanOfficialProduct(key)!.detailStatus).toBe("complete");
      expect(getMibanOfficialProduct(key)!.mobilePoster!.sourcePosterCount).toBe(1);
    }
    const lip = getMibanOfficialProduct("nuskin-official-5")!;
    expect(lip.mobilePoster!.substantialSections).toBe(6);
    expect(lip.mobilePoster!.parts).toHaveLength(7);
    expect(lip.specification).toContain("3.5g");
    expect(lip.usage).toContain("约0.5厘米");
    expect(lip.usage).toContain("若干分钟");
    expect(lip.ingredients).toContain("不等同于产品功效");
    expect(lip.limitations).toContain("没有SPF/PA数据");
    expect(lip.mobilePoster!.parts.every(part => !part.studyHighlights)).toBe(true);
  });
  it("新增海报不接入交易、不生成空说明卡，仍隐藏重复白底用法", () => {
    const poster = readFileSync(path.join(root, "client/src/pages/miban/OfficialMobilePoster.tsx"), "utf8");
    expect(poster).toContain("data-official-mobile-info");
    expect(poster).toContain("MobileCopy");
    expect(poster).not.toMatch(/trpc|addToCart|createOrder/);
    expect(detail).toContain("Boolean(product.mobilePoster)");
    expect(detail).toContain("<OfficialMobilePoster poster={product.mobilePoster}");
  });
  it("详情海报无逐图图注和留白，保持原顺序连续拼接", () => {
    expect(detail).toContain("data-official-poster-stack");
    expect(detail).toContain("lineHeight: 0");
    expect(detail).not.toContain("<figcaption");
    expect(detail).not.toContain('className="mb-4"');
  });
  it("如新保留一张完整原版长海报，不切图或用包装照凑数", () => {
    const product = getMibanOfficialProduct("nuskin-official-1")!;
    expect(product.gallery).toHaveLength(1);
    expect(product.gallery[0].url).toBe("/miban-official/nuskin/detail-full-original.jpg");
    expect(product.gallery[0].sourceUrl).toBe("https://img.cn.nuskin.com/supplychain-prod/undefined/6X4HW6iEpZ.jpg");
    expect(product.limitations).toContain("790×18973");
  });
  it("如新完整营销首图按自然比例铺满，不挤进包装方框", () => {
    const product = getMibanOfficialProduct("nuskin-official-1")!;
    expect(product.heroLayout).toBe("poster");
    expect(product.heroImageSize).toEqual({ width: 790, height: 1320 });
    expect(product.heroImageUrl).toBe("/miban-official/nuskin/hero-official-full-cover.webp");
    expect(product.cardImageUrl).toBe("/miban-official/nuskin/official-pack.webp");
    expect(detail).toContain('data-official-hero-layout');
    expect(detail).toContain('isFullPosterHero ? "w-full" : "aspect-square w-full"');
    expect(detail).toContain('objectPosition: "center"');
    expect(product.gallery[0].width).toBe(790);
    expect(product.gallery[0].height).toBe(18973);
  });
  it("如新研究卡适配不伪增官方海报数量，不遗漏原稿范围", () => {
    expect(nuskinMobilePoster.sourcePosterCount).toBe(1);
    expect(nuskinMobilePoster.sourceHeight).toBe(18973);
    const parts = nuskinMobilePoster.parts;
    expect(parts[0].startY).toBe(0);
    expect(parts.at(-1)!.endY).toBe(18973);
    parts.forEach((part, index) => {
      expect(part.endY).toBeGreaterThan(part.startY);
      if (index) expect(part.startY).toBe(parts[index - 1].endY);
    });
    const component = readFileSync(path.join(root, "client/src/pages/miban/NuskinMobilePoster.tsx"), "utf8");
    expect(component).toContain("data-nuskin-comparison-grid");
    expect(component).toContain("grid-cols-2");
    expect(component).toContain("part.citation");
    expect(component).not.toMatch(/trpc|addToCart|createOrder/);
    expect(parts.filter(part => part.kind === "study")).toHaveLength(8);
    for (const part of parts) {
      const assets = [part.url, part.chart?.url, ...(part.comparisons ?? []).flatMap(column => column.images.map(image => image.url))].filter(Boolean);
      for (const url of assets) expect(existsSync(path.join(root, "client/public", url!))).toBe(true);
    }
  });
  it("下方AI研究卡采用短标签和分项说明，保留完整研究来源", () => {
    const lower = nuskinMobilePoster.parts.filter(part => part.id.startsWith("peptide-study-"));
    expect(lower).toHaveLength(4);
    for (const part of lower) {
      expect(part.citation!.length).toBeGreaterThan(30);
      expect(part.studyNotes!.length).toBeGreaterThanOrEqual(3);
      expect(part.findingChunks!.join("")).toBe(part.finding);
      for (const column of part.comparisons!) {
        expect(column.label.length).toBeLessThanOrEqual(8);
        expect(column.images[0].url).toContain("/mobile-studies-clean/");
      }
    }
    const component = readFileSync(path.join(root, "client/src/pages/miban/NuskinMobilePoster.tsx"), "utf8");
    expect(component).toContain("data-nuskin-comparison-label");
    expect(component).toContain("data-nuskin-study-notes");
    expect(component).toContain("ResearchText");
  });
  it("如新使用说明接入单源连续海报，不保留重复白底说明", () => {
    expect(nuskinGuide.source.startY).toBe(16270);
    expect(nuskinGuide.source.endY).toBe(18973);
    expect(nuskinGuide.source.sourcePosterCount).toBe(1);
    expect(nuskinMobilePoster.parts.at(-1)!.kind).toBe("guide");
    expect(detail).toContain('const hasMobileGuide = product.key === "nuskin-official-1" || Boolean(product.mobilePoster)');
    expect(detail).toContain("!hasMobileGuide && <section");
    expect(detail).not.toContain("!hasNuskinGuide && <section");
    expect(nuskinGuide.presentationNote).toContain("不是新增官方海报");
    const component = readFileSync(path.join(root, "client/src/pages/miban/NuskinProductGuide.tsx"), "utf8");
    expect(component).toContain("data-nuskin-product-guide");
    expect(component).toContain("data-nuskin-guide-section");
    expect(component).toContain("product.ingredients");
    expect(component).toContain("product.warnings[0]");
    expect(component).not.toMatch(/trpc|addToCart|createOrder/);
  });
  it("如新一般用法与三周耐受日期按官网原图保留", () => {
    expect(nuskinGuide.usage.frequency).toBe("1次/天");
    expect(nuskinGuide.usage.time).toBe("夜间使用");
    expect(nuskinGuide.usage.steps).toEqual(["洁面", "爽肤", "视黄醇精华乳", "润肤"]);
    expect(nuskinGuide.tolerance.officialSchedule).toEqual([
      { week: 1, retinolDays: [1, 4, 7], hydrationDays: [1, 3, 5, 7], unmarkedDays: [2, 6] },
      { week: 2, retinolDays: [2, 4, 6], hydrationDays: [3, 6], unmarkedDays: [1, 5, 7] },
      { week: 3, retinolDays: [1, 2, 3, 4, 5, 6, 7], hydrationDays: [2, 5], unmarkedDays: [] },
    ]);
    expect(nuskinGuide.tolerance.sourceNote).toContain("不能解释为停用");
    expect(nuskinGuide.sunAdvice.text).toContain("带有SPF防晒功能");
  });
  it("如新产品说明保留规格和完整注意事项，使用原始包装照片", () => {
    expect(nuskinGuide.product.originalSpecification).toBe("30ml/瓶 *1瓶");
    expect(nuskinGuide.product.details).toContainEqual({ label: "保质期", value: "24个月" });
    expect(nuskinGuide.product.details).toContainEqual({ label: "产地", value: "中国" });
    expect(nuskinGuide.product.notices[0].text).toBe("本产品已经检验合格，本品可能对少数人体有过敏反应，如有不适，请立即停用。");
    expect(nuskinGuide.product.notices[1].text).toBe("请勿置于极度高温、低温或是阳光直射的地方。");
    expect(nuskinGuide.product.photo.width).toBe(103);
    expect(nuskinGuide.product.photo.height).toBe(284);
    expect(existsSync(path.join(root, "client/public", nuskinGuide.product.photo.url))).toBe(true);
  });
  it("玫琳凯保留十五个官方原始文件的顺序与来源及两份完整GIF动画", async () => {
    const product = getMibanOfficialProduct("marykay-official-1")!;
    const base = "https://community-s3-website.marykay.com.cn/mybizcn/PROD/ProductResource/";
    const originals = [
      "20261027175908_93.jpg", "20250326171438_805.jpg", "20250326171442_735.jpg",
      "20250326171446_501.jpg", "20250326171450_771.jpg", "20250327140333_486.gif",
      "20250326171506_424.jpg", "20250326171511_114.jpg", "20250326171521_201.gif",
      "20250326171530_960.jpg", "20250414101842_375.jpg", "20250326171540_782.jpg",
      "20250326171545_144.jpg", "20250326171549_327.jpg", "20250326171553_593.jpg",
    ];
    expect(product.gallery).toHaveLength(15);
    expect(product.gallery.map(image => image.sourceUrl)).toEqual(originals.map(file => base + file));
    const animations = new Map([
      [5, { frames: 39, sha256: "68be35fd7d6722b7cf265f1f6d1b53686f75ee0fc7114d53e700787978e2d5ef" }],
      [8, { frames: 32, sha256: "1ecdd4378f3e49a14b49e03da5e6542a610b4644d34099f08402c6d746aa885f" }],
    ]);
    for (const [index, image] of product.gallery.entries()) {
      expect(image.url).toMatch(/^\/miban-official\/marykay\//);
      expect(existsSync(path.join(root, "client/public", image.url))).toBe(true);
      if (originals[index].endsWith(".gif")) {
        const expected = animations.get(index)!;
        const sourceHash = createHash("sha256").update(image.sourceUrl!).digest("hex").slice(0, 12);
        const originalPath = path.join(root, "client/public/miban-official/marykay/marykay-official-1", `original-${sourceHash}.gif`);
        expect(existsSync(originalPath)).toBe(true);
        const bytes = readFileSync(originalPath);
        expect(bytes.subarray(0, 6).toString()).toMatch(/^GIF8[79]a$/);
        expect(createHash("sha256").update(bytes).digest("hex")).toBe(expected.sha256);
        const original = await sharp(originalPath, { animated: true }).metadata();
        expect(original.format).toBe("gif");
        expect(original.pages).toBe(expected.frames);
        // The mobile asset is animated WebP; a still or changed source must not pass.
        const metadata = await sharp(path.join(root, "client/public", image.url), { animated: true }).metadata();
        expect(metadata.format).toBe("webp");
        expect(metadata.pages).toBe(expected.frames);
        expect(metadata.loop).toBe(original.loop);
        expect(metadata.delay).toEqual(original.delay);
        expect([metadata.width, metadata.pageHeight]).toEqual([image.width, image.height]);
      }
    }
  });
  it("安利漱口水十二源和十章正文已完整，仍明确完整包装背标缺证", () => {
    const product = getMibanOfficialProduct("amway-official-1")!;
    expect(product.gallery).toHaveLength(12);
    expect(new Set(product.gallery.map(image => image.sourceUrl)).size).toBe(12);
    expect(product.mobilePoster!.sourcePosterCount).toBe(12);
    expect(product.mobilePoster!.substantialSections).toBe(10);
    expect(product.detailStatus).toBe("complete");
    expect(product.limitations).toMatch(/(?:包装|标签|背标)/);
    expect(product.limitations).toMatch(/全成分/);
    expect(product.limitations).toMatch(/警示未取得/);
    expect(product.usage).toContain("15mL");
    expect(product.usage).toContain("至少30秒");
    expect(product.limitations).not.toContain("尚不是达到七八张以上的完整详情页");
  });
  it("未知品牌和商品保持不可用", () => {
    expect(getMibanOfficialBrand("unknown")).toBeUndefined();
    expect(getMibanOfficialProduct("unknown")).toBeUndefined();
  });
});
