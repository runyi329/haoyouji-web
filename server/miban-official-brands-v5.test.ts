import { describe, expect, it } from "vitest";
import { existsSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import sharp from "sharp";
import { getMibanOfficialProduct, type MibanOfficialMobilePosterPart } from "../shared/miban-official-selection";
import { getOfficialPosterLayout, getOfficialStudyHighlights, getOfficialUsageFacts } from "../shared/miban-official-poster-layout";

const root = process.cwd();
const mk = "https://www.marykay.com.cn/corporatesite/home/products/";
const mkAsset = "https://community-s3.marykay.com.cn/PROD/MyBizIntouch_Content_Cms/ProductResource/";
const amwayAsset = "https://cc-cdn.amway.com.cn/ContentCenter/prod/assets/";
const toothpasteArticle = "https://www.amway.com.cn/Content/newsProduct/newsPersonalCare/Glister_Multi_Action_White_Tea_Toothpaste/news?contentId=2070029098888507394&channelId=100000612";
// Independent frozen expectations transcribed from research/marykay-amway-five/*/research.json.
// No runtime dependency on that external directory or on in-progress design.json files.
const products = [
  { key: "marykay-official-1", name: "幻时佳®臻粹紧颜精华油", price: 568, url: mk + "10226875", sources: 15, substantial: 8, status: "complete", coreSource: "https://community-s3-website.marykay.com.cn/mybizcn/PROD/ProductResource/20250326171446_501.jpg" },
  { key: "marykay-official-2", name: "幻时佳®高阶紧塑精华露", price: 568, url: mk + "10109827", sources: 11, substantial: 8, status: "complete", coreSource: mkAsset + "20230711154218_903.jpg" },
  { key: "marykay-official-3", name: "幻时佳®活颜紧致精华霜", price: 588, url: mk + "10109824", sources: 10, substantial: 7, status: "complete", coreSource: mkAsset + "20230822143412_292.jpg" },
  { key: "marykay-official-4", name: "亮采集效焕白精华液", price: 428, url: mk + "10176596", sources: 8, substantial: 7, status: "complete", coreSource: mkAsset + "20240222174906_638.jpg" },
  { key: "marykay-official-5", name: "幻时佳®多效塑颜眼霜", price: 388, url: mk + "10243289", sources: 10, substantial: 7, status: "complete", coreSource: mkAsset + "20230822141204_693.jpg" },
  { key: "amway-official-1", name: "丽齿健即用漱口水", price: 99, url: "https://mall.amway.com.cn/productDetail?code=41637&skuCode=41637", sources: 12, substantial: 10, status: "complete", coreSource: amwayAsset + "2023-06-16/20230616174615fCwJMMR6nAEAPDsQ2CXWkfN6fzbc6WjZ.jpg" },
  { key: "amway-official-2", name: "雅蜜®滋润身体乳", price: 129, url: "https://mall.amway.com.cn/productDetail?code=41204", sources: 15, substantial: 10, status: "complete", coreSource: "https://resources.amway.com.cn/product/1755672323635/身体乳.jpg" },
  { key: "amway-official-3", name: "丽齿健®多效白茶牙膏", price: 54, url: "https://mall.amway.com.cn/productDetail?code=40860&skuCode=40860", sources: 13, substantial: 10, status: "complete", coreSource: amwayAsset + "2026-06-25/20260625142406Gp3GdyzdPPHii8rtfiiiRhFi3yrA4MjK.jpg" },
  { key: "amway-official-4", name: "安利优生活®浓缩洗洁精", price: 46, url: "https://mall.amway.com.cn/productDetail?code=2540", sources: 4, substantial: 9, status: "complete", coreSource: "https://resources.amway.com.cn/product/1769578267609/33_%E7%9C%8B%E5%9B%BE%E7%8E%8B.jpg" },
  { key: "amway-official-5", name: "雅蜜®滋润沐浴乳", price: 88, url: "https://mall.amway.com.cn/productDetail?code=41200&skuCode=41200", sources: 10, substantial: 9, status: "pending_materials", coreSource: amwayAsset + "2023-12-08/202312082159057zeksmZGQJzeei7T7BJ633sXjNRdWSf2.jpg" },
] as const;
const officialHosts = new Set([
  "www.marykay.com.cn", "m.marykay.com.cn", "community-s3.marykay.com.cn", "community-s3-website.marykay.com.cn",
  "www.amway.com.cn", "mall.amway.com.cn", "resources.amway.com.cn", "cc-cdn.amway.com.cn",
]);
function assertOfficialUrl(value: string | undefined, brand: string) {
  expect(value).toMatch(/^https:\/\//);
  const parsed = new URL(value!);
  expect(officialHosts.has(parsed.hostname)).toBe(true);
  expect(parsed.hostname.endsWith(brand === "marykay" ? ".marykay.com.cn" : ".amway.com.cn")).toBe(true);
  expect(parsed.username + parsed.password).toBe("");
  expect(value).not.toMatch(/placeholder|example\.(?:com|org)|localhost|127\.0\.0\.1/);
}
function partText(part: MibanOfficialMobilePosterPart) {
  return [part.title, part.eyebrow, ...(part.paragraphs ?? []), ...(part.bullets ?? []), ...(part.footnotes ?? []), part.studyNote, ...(part.steps ?? []), ...(part.specs ?? []).map(item => `${item.label} ${item.value}`)].filter(Boolean).join("\n");
}
function bodyText(part: MibanOfficialMobilePosterPart) {
  return [...(part.paragraphs ?? []), ...(part.bullets ?? []), ...(part.footnotes ?? []), ...(part.steps ?? []), ...(part.specs ?? []).map(item => `${item.label} ${item.value}`), ...(part.usageFacts ?? []).map(item => `${item.label} ${item.value}`)].join("\n");
}
async function originalMetadata(brand: string, key: string, sourceUrl: string) {
  // Asset filenames encode the official URL, not the display thumbnail's dimensions.
  const hash = createHash("sha256").update(sourceUrl).digest("hex").slice(0, 12);
  const directory = path.join(root, "client/public/miban-official", brand, key);
  const files = readdirSync(directory).filter(file => file.startsWith(`original-${hash}.`));
  expect(files, `${key}: ${sourceUrl}必须保留可对应的本地原件`).toHaveLength(1);
  return sharp(path.join(directory, files[0])).metadata();
}
function posterParts(key: string) {
  const product = getMibanOfficialProduct(key)!;
  expect(product).toBeDefined();
  expect(product.mobilePoster).toBeDefined();
  return product.mobilePoster!.parts;
}
function metric(key: string, value: string, kind: "self-report" | "evaluation") {
  const part = posterParts(key).find(part => getOfficialStudyHighlights(part).some(item => item.value === value))!;
  expect(part, `${key}: ${value}必须保留有出处的指标`).toBeDefined();
  const highlight = getOfficialStudyHighlights(part).find(item => item.value === value)!;
  expect(highlight.kind).toBe(kind);
  expect(highlight.original.length).toBeGreaterThan(value.length);
  expect(highlight.description.length).toBeGreaterThan(0);
  // Conditions must be in the accessible body/footnotes, not only an optional note.
  return { part, highlight, text: [...(part.paragraphs ?? []), ...(part.footnotes ?? [])].join("\n") };
}

describe("玫琳凯与安利新十款v5真实资料契约", () => {
  for (const expected of products) {
    it(`${expected.key}身份、CNY证据与原海报计数不伪增`, () => {
      const product = getMibanOfficialProduct(expected.key)!;
      expect(product).toBeDefined();
      expect(product.name).toBe(expected.name);
      expect(product.officialUrl).toBe(expected.url);
      expect(product.officialPriceCny).toBe(expected.price);
      expect(product.officialPriceCheckedDate).toBe("2026-11-28");
      expect(product.officialPriceSourceUrl).toBe(expected.url);
      expect(product.detailStatus).toBe(expected.status);
      expect(product.mobilePoster!.sourcePosterCount).toBe(expected.sources);
      expect(product.mobilePoster!.substantialSections).toBe(expected.substantial);
      expect(product.mobilePoster!.substantialSections).toBeGreaterThanOrEqual(7);
      const originalSources = new Set(product.gallery.map(image => image.sourceUrl));
      expect(originalSources.has(expected.coreSource)).toBe(true);
      expect(originalSources.size).toBeGreaterThanOrEqual(expected.sources);
      expect(product.priceNote.length).toBeGreaterThan(20);
      expect(product.priceNote).toMatch(/(?:官网|官方|公司定价)/);
      expect(product.priceNote).toMatch(/(?:实时|动态|汇率|参考)/);
      expect(product.sellable).toBe(false);
      expect(product.status).toBe("information_only");
      for (const field of ["priceCny", "priceU", "skus", "stock", "inventory", "orderPolicy"]) expect(product).not.toHaveProperty(field);
    });
    it(`${expected.key}所有parts采用真实URL、原稿范围或明确文字位置及规范可读内容`, async () => {
      const product = getMibanOfficialProduct(expected.key)!;
      const poster = product.mobilePoster!;
      expect(poster.parts.length).toBeGreaterThanOrEqual(poster.substantialSections);
      expect(new Set(poster.parts.map(part => part.id)).size).toBe(poster.parts.length);
      expect(poster.background).toMatch(/^#[0-9a-f]{6}$/i);
      expect(poster.accent).toMatch(/^#[0-9a-f]{6}$/i);
      const documentedSources = new Set([product.officialUrl, product.heroSourceUrl, ...product.gallery.map(image => image.sourceUrl), ...product.evidence.map(item => item.url)]);
      let readableSections = 0;
      for (const part of poster.parts) {
        expect(part.id.length).toBeGreaterThan(0);
        expect(["image", "info"]).toContain(part.kind);
        assertOfficialUrl(part.sourceUrl, product.brandSlug);
        expect(documentedSources.has(part.sourceUrl)).toBe(true);
        if (part.sourceRange) {
          expect(part.sourceRange).toHaveLength(2);
          const [start, end] = part.sourceRange;
          expect(Number.isFinite(start) && Number.isFinite(end)).toBe(true);
          expect(start).toBeGreaterThanOrEqual(0);
          expect(end).toBeGreaterThan(start);
          const original = product.gallery.find(image => image.sourceUrl === part.sourceUrl);
          expect(original, `${part.id}的像素范围必须映射原始公开文件，不给HTML/视频造像素`).toBeDefined();
          const metadata = await originalMetadata(product.brandSlug, product.key, original!.sourceUrl!);
          expect(end).toBeLessThanOrEqual(metadata.height!);
        } else {
          expect(part.sourceTextLocation!.length).toBeGreaterThan(15);
          expect(part.sourceTextLocation).not.toMatch(/待补|未知|TODO|placeholder/);
        }
        if (part.kind === "image") {
          expect(part.image).toBeDefined();
        } else {
          expect(["note", "study", "certificate", "usage", "product", "ingredients", "feature"]).toContain(part.layout);
          expect(part.title!.length).toBeGreaterThan(0);
          // A real short annotation is sufficient; title/eyebrow alone is not a body.
          expect(bodyText(part).trim().length, `${part.id}必须有实际正文`).toBeGreaterThan(0);
          readableSections++;
        }
        for (const field of ["paragraphs", "bullets", "footnotes", "steps"] as const) {
          for (const value of part[field] ?? []) {
            expect(typeof value).toBe("string");
            expect(value.trim().length).toBeGreaterThan(0);
          }
        }
        for (const spec of part.specs ?? []) {
          expect(typeof spec.label).toBe("string");
          expect(typeof spec.value).toBe("string");
          expect(spec.label.trim().length * spec.value.trim().length).toBeGreaterThan(0);
        }
        for (const fact of part.usageFacts ?? []) {
          expect(typeof fact.label).toBe("string");
          expect(typeof fact.value).toBe("string");
          expect(fact.label.trim().length * fact.value.trim().length).toBeGreaterThan(0);
        }
        for (const image of [part.image, ...(part.photos ?? [])].filter(Boolean)) {
          expect(image!.url).toMatch(new RegExp(`^/miban-official/${product.brandSlug}/`));
          expect(existsSync(path.join(root, "client/public", image!.url))).toBe(true);
          assertOfficialUrl(image!.sourceUrl, product.brandSlug);
          expect(image!.width).toBeGreaterThan(0);
          expect(image!.height).toBeGreaterThan(0);
        }
        if (getOfficialPosterLayout(part) === "study") {
          if (part.studyNote !== undefined) expect(part.studyNote.trim().length).toBeGreaterThan(0);
          const conditions = [...(part.paragraphs ?? []), ...(part.footnotes ?? [])].join("\n");
          expect(conditions.trim().length).toBeGreaterThan(0);
          expect(conditions).toMatch(/研究|测试|消费者|实验|受试|文献|数据|评估|原稿/);
        }
        if (part.studyHighlights) {
          for (const highlight of part.studyHighlights) {
            expect(["self-report", "evaluation"]).toContain(highlight.kind);
            for (const field of ["value", "label", "description", "original"] as const) {
              expect(typeof highlight[field]).toBe("string");
              expect(highlight[field].trim().length).toBeGreaterThan(0);
            }
          }
        }
      }
      expect(readableSections).toBeGreaterThanOrEqual(7);
      expect(poster.parts.some(part => getOfficialPosterLayout(part) === "product")).toBe(true);
      expect(poster.parts.some(part => getOfficialPosterLayout(part) === "usage")).toBe(true);
      expect(product.specification.length).toBeGreaterThan(0);
      expect(product.usage.length).toBeGreaterThan(20);
      expect(product.ingredients.length).toBeGreaterThan(20);
      expect(product.warnings.length).toBeGreaterThan(0);
    });
  }
  it("仅沐浴乳具体操作缺证标pending，完整正文与尚缺包装证据分开标注", () => {
    const pending = products.map(item => getMibanOfficialProduct(item.key)!).filter(item => item.detailStatus === "pending_materials").map(item => item.key);
    expect(pending).toEqual(["amway-official-5"]);
    for (const key of ["amway-official-1", "amway-official-3", "amway-official-5"]) {
      const product = getMibanOfficialProduct(key)!;
      expect(product.mobilePoster).toBeDefined();
      expect(product.limitations).toMatch(/(?:包装|背标|标签)/);
      expect(product.limitations).toMatch(/警示/);
      expect(product.limitations).toMatch(/(?:未取得|待核|待补)/);
    }
    const wash = getMibanOfficialProduct("amway-official-5")!;
    expect(wash.materialsNotice!.trim().length).toBeGreaterThan(0);
    expect(wash.materialsNotice).toMatch(/(?:用量|取用)/);
    expect(wash.materialsNotice).toMatch(/(?:起泡|揉泡|冲洗|步骤)/);
    expect(wash.materialsNotice).toMatch(/频次/);
    expect(wash.officialPriceCny).toBe(88);
    const toothpaste = getMibanOfficialProduct("amway-official-3")!;
    expect(toothpaste.detailStatus).toBe("complete");
    expect(toothpaste.limitations).toMatch(/(?:用量|时长)/);
    expect(toothpaste.limitations).toMatch(/(?:年龄|包装警示)/);
    expect(toothpaste.priceNote).toMatch(/2026-11-28直接核验.*PDP/);
    expect(getMibanOfficialProduct("amway-official-1")!.detailStatus).toBe("complete");
  });
  it("2026-11-28官网PDP公开零售价54有200g和40860直接证据，仍保留包装同价佐证", () => {
    const product = getMibanOfficialProduct("amway-official-3")!;
    expect(product.officialPriceCny).toBe(54);
    expect(product.officialPriceSourceUrl).toBe(product.officialUrl);
    expect(product.priceNote).toMatch(/200\s*g/i);
    expect(product.priceNote).toMatch(/公司定价/);
    expect(product.priceNote).toMatch(/2026-11-28直接核验.*未登录PDP/);
    expect(product.priceNote).toMatch(/54(?:\.00)?/);
    const currentPrice = product.evidence.find(item => item.url === product.officialUrl)!;
    expect(currentPrice).toBeDefined();
    expect(currentPrice.supports).toMatch(/200\s*g/i);
    expect(currentPrice.supports).toMatch(/40860/);
    expect(currentPrice.supports).toMatch(/54(?:\.00)?/);
    expect(currentPrice.supports).toMatch(/未登录PDP公开显示/);
    expect(product.priceSourceNotice).toMatch(/200g.*54元.*已直接核验/);
    const article = product.evidence.find(item => item.url === toothpasteArticle)!;
    expect(article).toBeDefined();
    expect(article.supports).toMatch(/200\s*g/i);
    expect(article.supports).toMatch(/包装公司定价/);
    const packagingUrl = amwayAsset + "2026-06-25/2026062514240768A2yM55JHSRZSzcmbhPtxBZGSrshbAS.jpg";
    const packaging = product.evidence.find(item => item.url === packagingUrl)!;
    expect(packaging).toBeDefined();
    expect(packaging.supports).toMatch(/54(?:\.00)?/);
    expect(packaging.supports).toMatch(/200\s*g/i);
    expect(packaging.supports).toMatch(/公司定价/);
    expect(product.gallery.some(image => image.sourceUrl === packagingUrl)).toBe(true);
    expect(product.limitations).toMatch(/已直接核验.*PDP公开零售价54元/);
    expect(product.limitations).toMatch(/未另行取得独立价格接口原始响应/);
  });
  it("沐浴乳护理FAQ不是完整包装用法，不借用身体乳或海外揉泡冲洗步骤", () => {
    const wash = getMibanOfficialProduct("amway-official-5")!;
    expect(wash.usage).toMatch(/(?:未取得|待补|缺证)/);
    const facts = posterParts(wash.key).filter(part => getOfficialPosterLayout(part) === "usage").flatMap(getOfficialUsageFacts);
    const combined = facts.map(fact => `${fact.label} ${fact.value}`).join("\n");
    expect(combined).toContain("适度清洁");
    expect(combined).toContain("充分保湿");
    expect(combined).not.toMatch(/(?:每日|每天|早晚).*(?:1次|2次|一次|两次)|揉出.*泡沫|建议每天使用|轻柔按摩至吸收/);
    expect(wash.ingredients).not.toMatch(/蜂蜜配方|蜂蜜提取物/);
  });
  it("漱口水15mL至少30秒是真实用法，而不是浓缩稀释用法", () => {
    const mouthwash = getMibanOfficialProduct("amway-official-1")!;
    expect(mouthwash.usage).toContain("15mL");
    expect(mouthwash.usage).toContain("至少30秒");
    expect(mouthwash.usage).toContain("清水漱口一分钟");
    expect(mouthwash.usage).toContain("不要马上清水漱口");
    expect(mouthwash.usage).toContain("不替代刷牙");
    expect(mouthwash.usage).not.toMatch(/1[:：]4|按.*稀释/);
  });
  it("身体乳保留真实包装警示，洗洁精稀释仅采用本次PDP且必须清水洗净", () => {
    const lotion = getMibanOfficialProduct("amway-official-2")!;
    expect(lotion.warnings.join("\n")).toContain("避免直接触及眼睛");
    expect(lotion.warnings.join("\n")).toContain("儿童不易触及");
    expect(lotion.warnings.join("\n")).toContain("避免阳光直射");
    expect(lotion.usage).toContain("建议每天使用");
    const detergent = getMibanOfficialProduct("amway-official-4")!;
    const use = posterParts(detergent.key).filter(part => getOfficialPosterLayout(part) === "usage").map(partText).join("\n") + "\n" + posterParts(detergent.key).flatMap(getOfficialUsageFacts).map(fact => fact.value).join("\n");
    for (const ratio of ["1:2", "1:3", "1:4"]) expect(use).toContain(ratio);
    expect(use).toMatch(/每1\s*L清水加入1\s*m[lL]/i);
    expect(use).toContain("用清水洗净");
    expect(detergent.warnings.join("\n")).toContain("大量清水冲洗");
    expect(posterParts(detergent.key).every(part => getOfficialPosterLayout(part) !== "study" && !part.studyHighlights)).toBe(true);
  });
});

describe("十款新资料的科学指标类型与条件不得混用", () => {
  it("玫琳凯精华油43%评价口径未公开，四项认同为252人三周自评，油性偏好不是减油率", () => {
    const parts = posterParts("marykay-official-1");
    const first = parts.find(part => (part.paragraphs ?? []).some(text => text.includes("43%")))!;
    expect(first).toBeDefined();
    const conditions = [...(first.paragraphs ?? []), ...(first.footnotes ?? [])].join("\n");
    expect(conditions).toContain("43%");
    expect(conditions).toContain("29名");
    expect(conditions).toContain("12周");
    expect(conditions).toContain("每天两次");
    expect(conditions).toMatch(/(?:未披露|未说明|未公开).*评价方法/);
    expect(first.sourceUrl).toBe(products[0].coreSource);
    expect(parts.flatMap(part => part.studyHighlights ?? []).map(item => item.value)).toEqual(["95%", "92%", "91%", "88%"]);
    for (const value of ["95%", "92%", "91%", "88%"]) {
      const study = metric("marykay-official-1", value, "self-report");
      expect(study.text).toContain("252名");
      expect(study.text).toMatch(/三周|3周/);
    }
    const product = getMibanOfficialProduct("marykay-official-1")!;
    expect(product.warnings.join("\n")).toContain("仅在晚上使用");
    expect(product.warnings.join("\n")).toMatch(/不建议与.*防晒.*混合/);
    expect(product.limitations).toMatch(/(?:未|没有).*(?:油性肌|子组|分组).*人数|油性肌.*(?:未|没有).*人数/);
  });
  it("高阶紧塑81/79/84全部为225名女性六周主观自评，视频用量只称适量", () => {
    for (const value of ["81%", "79%", "84%"]) {
      const study = metric("marykay-official-2", value, "self-report");
      expect(study.text).toContain("225名");
      expect(study.text).toMatch(/六周|6周/);
      expect(study.text).toMatch(/每天两次|每天2次/);
    }
    const product = getMibanOfficialProduct("marykay-official-2")!;
    expect(product.usage).toContain("适量");
    expect(product.usage).toMatch(/(?:不提供|没有|未提供).*(?:泵数|毫升)/);
  });
  it("面霜94%自评与89%生物仪器研究分别标注，不解释成弹性提升89%", () => {
    const self = metric("marykay-official-3", "94%", "self-report");
    const evaluation = metric("marykay-official-3", "89%", "evaluation");
    expect(self.text).toContain("226名");
    expect(self.text).toContain("4周");
    expect(evaluation.text).toContain("29名");
    expect(evaluation.text).toContain("12周");
    expect(evaluation.text).toContain("生物仪器研究");
    expect(evaluation.text).toMatch(/(?:未说明|未公开).*(?:口径|比例)|不能.*89%/);
  });
  it("焕白精华实验室29/20/42与46位亚洲女性照片评估分开，双倍是12周对2周", () => {
    for (const value of ["29%", "20%", "42%"]) {
      const lab = metric("marykay-official-4", value, "evaluation");
      expect(lab.text).toContain("实验室");
      expect(lab.text).toMatch(/不是人体|非人体/);
    }
    const parts = posterParts("marykay-official-4");
    const human = parts.find(part => getOfficialPosterLayout(part) === "study" && partText(part).includes("46位"))!;
    expect(partText(human)).toContain("专家评估及仪器测量");
    const doubled = parts.find(part => partText(part).includes("双倍"))!;
    expect(partText(doubled)).toContain("12周");
    expect(partText(doubled)).toContain("2周");
    expect(partText(doubled)).toMatch(/(?:不是|不代表).*100%/);
  });
  it("眼霜92/80/88/81属于226名女性四周消费者测试，不借旧名视频补第三组配方", () => {
    for (const value of ["92%", "80%", "88%", "81%"]) {
      const study = metric("marykay-official-5", value, "self-report");
      expect(study.text).toContain("226名");
      expect(study.text).toContain("4周");
      expect(study.text).toMatch(/每天2次|每天两次/);
    }
    const parts = posterParts("marykay-official-5");
    const ingredients = parts.filter(part => getOfficialPosterLayout(part) === "ingredients").map(partText).join("\n");
    expect(ingredients).toContain("迷迭香叶提取物");
    expect(ingredients).toContain("水解酵母提取物");
    expect(ingredients).toContain("糖脂");
    expect(ingredients).not.toMatch(/七叶树皂苷|浮游生物提取物/);
    expect(getMibanOfficialProduct("marykay-official-5")!.limitations).toMatch(/旧名视频|(?:视频|同配方).*映射/);
    expect(parts.some(part => partText(part).includes("轮刮眼眶"))).toBe(true);
  });
  it("漱口水99.9%体外30秒与多达29%临床对照不同，不增加未公开样本和浓度", () => {
    const bacteria = metric("amway-official-1", "99.9%", "evaluation");
    expect(bacteria.text).toContain("体外");
    expect(bacteria.text).toContain("30秒");
    expect(bacteria.text).toContain("Indiana University School of Dentistry");
    const plaquePart = posterParts("amway-official-1").find(part => getOfficialStudyHighlights(part).some(item => /29%/.test(item.value)))!;
    const plaque = getOfficialStudyHighlights(plaquePart).find(item => /29%/.test(item.value))!;
    expect(plaque.kind).toBe("evaluation");
    expect(partText(plaquePart)).toContain("不含CPC");
    expect(partText(plaquePart)).toMatch(/(?:未|没有).*(?:样本|人数)/);
  });
  it("身体乳当前-57.10不替换为独立文章-48.19，数值脚注消费者自测不是仪器证明", () => {
    const parts = posterParts("amway-official-2");
    const main = parts.map(partText).join("\n");
    expect(main).toContain("-57.10%");
    for (const value of ["112.57%", "-57.10%", "-23.23%", "+16.86%", "+12.77%"]) {
      expect(main).toContain(value);
      const explanation = parts.find(part => (part.paragraphs ?? []).some(text => text.includes(value)) && /(?:未公开|没有公开).*客观测量方法/.test(bodyText(part)))!;
      expect(explanation, `${value}必须在正文说明自测条件与客观方法未公开`).toBeDefined();
      const conditions = bodyText(explanation);
      expect(conditions).toContain("150位");
      expect(conditions).toMatch(/18[–-]50岁/);
      expect(conditions).toContain("2周");
      expect(conditions).toContain("单独使用");
      expect(conditions).toContain("消费者自测");
      expect(conditions).toMatch(/不是.*认可(?:率|人数占比)/);
      expect(parts.flatMap(part => part.studyHighlights ?? []).map(item => item.value)).not.toContain(value);
    }
    const selfReport = parts.flatMap(part => (part.studyHighlights ?? []).map(highlight => ({ part, highlight })));
    expect(selfReport.map(item => item.highlight.value)).toEqual(["97%", "97%", "96%"]);
    for (const { part, highlight } of selfReport) {
      expect(highlight.kind).toBe("self-report");
      expect(highlight.original).toContain(highlight.value);
      expect(highlight.label).toContain("认可");
      expect(bodyText(part)).toContain("150位");
      expect(bodyText(part)).toMatch(/18[–-]50岁/);
      expect(bodyText(part)).toContain("2周");
      expect(bodyText(part)).toContain("单独使用");
      expect(bodyText(part)).toContain("消费者自测");
    }
    const lotion = getMibanOfficialProduct("amway-official-2")!;
    expect(main).not.toContain("-48.19%");
    expect(lotion.warnings.join("\n")).not.toContain("-48.19%");
    expect(lotion.limitations).toMatch(/独立旧文章.*不同百分比.*不并入/);
    expect(main).toMatch(/48小时.*研发报告|研发报告.*48小时/s);
  });
  it("牙膏指数、离体牛牙和消费者自评分型，不把漱口水CPC/99.9%当本品功效", () => {
    for (const value of ["38.67%", "43.52%", "59.08%", "118.32%", "32.28%"]) metric("amway-official-3", value, "evaluation");
    for (const value of ["91%", "95%"]) metric("amway-official-3", value, "self-report");
    const enamel = metric("amway-official-3", "118.32%", "evaluation");
    expect(enamel.text).toContain("离体牛牙");
    expect(enamel.text).toContain("对照组");
    const brightness = metric("amway-official-3", "32.28%", "evaluation");
    expect(brightness.text).toContain("30天");
    const product = getMibanOfficialProduct("amway-official-3")!;
    expect(product.limitations).toMatch(/CPC[^。]*99\.9%[^。]*不属于牙膏/);
    expect(posterParts(product.key).filter(part => getOfficialPosterLayout(part) === "study").flatMap(getOfficialStudyHighlights).map(item => item.value)).not.toContain("99.9%");
  });
  it("沐浴乳32.56/30.43只承认临床评估来源，96/91/93是150人两周自测", () => {
    for (const value of ["+32.56%", "+30.43%"]) {
      const evaluation = metric("amway-official-5", value, "evaluation");
      expect(evaluation.text).toContain("临床测试评估");
      expect(evaluation.text).toMatch(/(?:未|不).*(?:样本|方案)/);
    }
    const consumer = posterParts("amway-official-5").find(part => (part.studyHighlights ?? []).filter(item => item.kind === "self-report").length === 3)!;
    expect(consumer).toBeDefined();
    expect(consumer.studyHighlights!.map(item => item.value.replace(/认可$/, ""))).toEqual(["96%", "91%", "93%"]);
    expect(partText(consumer)).toContain("150位");
    expect(partText(consumer)).toContain("2周");
    expect(partText(consumer)).toContain("单独使用");
    expect(partText(consumer)).toMatch(/18[–-]50岁/);
  });
});
