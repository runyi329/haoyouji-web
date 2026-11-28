import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import sharp from "sharp";
import { getMibanOfficialProduct } from "../shared/miban-official-selection";
import { getOfficialPosterLayout, getOfficialStudyHighlights, getOfficialUsageFacts } from "../shared/miban-official-poster-layout";
import { getOfficialImmersiveVisual } from "../shared/miban-official-immersive-visuals";
const root = process.cwd();
const component = readFileSync(path.join(root, "client/src/pages/miban/OfficialMobilePoster.tsx"), "utf8");
const detail = readFileSync(path.join(root, "client/src/pages/miban/OfficialProductDetail.tsx"), "utf8");

describe("如新五款连续沉浸式手机海报", () => {
  it("采用完整官方场景和原稿匹配的全宽画布，而非照片套浅色圆角卡", () => {
    const css = readFileSync(path.join(root, "client/src/pages/miban/OfficialMobilePoster.css"), "utf8");
    expect(component).toContain('data-official-poster-style={isNuskin ? "nuskin-immersive-v4" : "official-immersive-v5"}');
    expect(component).toContain('product?.brandSlug === "nuskin"');
    expect(component).toContain("data-official-full-scene");
    expect(component).toContain("getOfficialImmersiveVisual");
    expect(component).not.toContain("const PANEL");
    expect(component).not.toMatch(/rounded-\[(12|14|22)px\]/);
    expect(css).toContain("border-radius:0");
    expect(css).toContain("var(--poster-from),var(--poster-to)");
    expect(css).toContain('data-official-poster-product="nuskin-official-5"');
    expect(css).toContain("official-poster-evidence");
    expect(component).toContain("text-[26px]");
  });
  it("四款17个完整场景与原资料逐段同源同范围，不重复包装图充数量", () => {
    let sceneCount = 0;
    for (const key of ["nuskin-official-2", "nuskin-official-3", "nuskin-official-4", "nuskin-official-5"]) {
      const product = getMibanOfficialProduct(key)!;
      for (const part of product.mobilePoster!.parts) {
        const visual = getOfficialImmersiveVisual(key, part.id)!;
        expect(visual).toBeDefined();
        expect(visual.source).toBe(part.sourceUrl);
        expect(visual.from).toMatch(/^#[0-9a-f]{6}$/);
        expect(visual.to).toMatch(/^#[0-9a-f]{6}$/);
        if (part.sourceRange) expect(visual.range).toEqual(part.sourceRange);
        else expect(visual.textLocation).toBe(part.sourceTextLocation);
        if (visual.scene) {
          sceneCount++;
          expect(visual.scene.height).toBe(part.sourceRange![1] - part.sourceRange![0]);
          expect(visual.scene.width).toBe(product.gallery[0].width);
          expect(existsSync(path.join(root, "client/public", visual.scene.url))).toBe(true);
          expect(["study", "usage", "product", "certificate"]).not.toContain(getOfficialPosterLayout(part));
        }
      }
    }
    expect(sceneCount).toBe(17);
  });
  it("首款研究和指南同样去掉卡片，原始科学图不做裁剪、滤镜或混合", () => {
    const study = readFileSync(path.join(root, "client/src/pages/miban/NuskinMobilePoster.tsx"), "utf8");
    const guide = readFileSync(path.join(root, "client/src/pages/miban/NuskinProductGuide.tsx"), "utf8");
    expect(study).not.toContain("rounded-");
    expect(guide).not.toContain("rounded-");
    expect(study).toContain('filter: "none", mixBlendMode: "normal"');
    expect(study).toContain("data-nuskin-study-notes");
    expect(guide).toContain("data-nuskin-tolerance-days");
  });
  it("爽肤水的人体评价突出原文4周、30分钟、31天但保留完整条件", () => {
    const part = getMibanOfficialProduct("nuskin-official-2")!.mobilePoster!.parts.find(part => part.title === "功效测试")!;
    expect(getOfficialPosterLayout(part)).toBe("study");
    const highlights = getOfficialStudyHighlights(part);
    expect(highlights.map(item => item.value)).toEqual(["4周", "30分钟", "31天"]);
    expect(highlights.map(item => item.original)).toEqual(part.bullets);
    expect(part.paragraphs!.join("\n")).toContain("受试者32人");
    expect(part.paragraphs!.join("\n")).toContain("30名健康女性");
    expect(component).toContain("part.paragraphs.map");
    expect(component).toContain("数据来源与测试条件");
  });
  it("系列方案包含非本款研究结论说明时仍为普通介绍，不能冒充人体评价", () => {
    const part = getMibanOfficialProduct("nuskin-official-2")!.mobilePoster!.parts.find(part => part.title?.includes("三阶段"))!;
    expect(getOfficialPosterLayout(part)).toBe("feature");
  });
  it("水光精华90/87/83/80百分比是自评认可人数，不是提升幅度", () => {
    const part = getMibanOfficialProduct("nuskin-official-3")!.mobilePoster!.parts.find(part => part.title?.includes("28天"))!;
    expect(getOfficialPosterLayout(part)).toBe("study");
    const highlights = getOfficialStudyHighlights(part);
    expect(highlights.map(item => item.value)).toEqual(["90%", "87%", "83%", "80%"]);
    expect(highlights.every(item => item.kind === "self-report")).toBe(true);
    expect(highlights.map(item => item.original)).toEqual(part.bullets);
    expect(component).toContain("百分比为消费者自评认可人数占比，不是功效提升幅度");
    expect(part.paragraphs![0]).toContain("30名受试者");
    expect(part.paragraphs![0]).toContain("28天");
  });
  it("用法按官方2-3泵、每日早晚呈现，不能从没有原文的章节推断用量", () => {
    const part = getMibanOfficialProduct("nuskin-official-3")!.mobilePoster!.parts.find(part => part.steps?.length)!;
    expect(getOfficialPosterLayout(part)).toBe("usage");
    expect(getOfficialUsageFacts(part)).toEqual([{ label: "使用时段", value: "每日早晚" }, { label: "参考用量", value: "2-3泵" }]);
    expect(getOfficialUsageFacts({ id: "empty", kind: "info", title: "使用方法" })).toEqual([]);
    expect(component).toContain("data-official-mobile-steps");
  });
  it("产品说明采用首款同样的产品照片及规格表格，证照仍采用真实原图可放大", () => {
    const parts = getMibanOfficialProduct("nuskin-official-2")!.mobilePoster!.parts;
    expect(getOfficialPosterLayout(parts.find(part => part.title?.includes("持证"))!)).toBe("certificate");
    expect(getOfficialPosterLayout(parts.find(part => part.specs?.some(spec => spec.label === "保质期"))!)).toBe("product");
    expect(component).toContain('layout === "product" ? "产品说明"');
    expect(component).toContain("data-official-zoom-image");
    expect(component).toContain('variant="original"');
    expect(component).not.toMatch(/trpc|addToCart|createOrder|generateImage/);
  });
  it("详情接入章节导航，首款继续使用原专用海报和使用说明，不被通用组件覆盖", () => {
    expect(detail).toContain("data-official-detail-navigation");
    expect(detail).toContain('product.key !== "nuskin-official-1"');
    expect(detail).toContain('product.key === "nuskin-official-1" ? <NuskinMobilePoster />');
    expect(detail).toContain("<OfficialMobilePoster poster={product.mobilePoster} product={product}");
    expect(detail).not.toContain('target="_blank"');
  });
  it("净痘清露研究即使附受试者规格仍归研究，主指标严格限定黑头粉刺数量", () => {
    const product = getMibanOfficialProduct("nuskin-official-4")!;
    const part = product.mobilePoster!.parts.find(part => part.layout === "study")!;
    expect(getOfficialPosterLayout(part)).toBe("study");
    expect(part.specs!.some(spec => spec.label === "受试者人数" && spec.value === "33位")).toBe(true);
    const highlights = getOfficialStudyHighlights(part);
    expect(highlights.map(item => item.value)).toEqual(["-56.46%", "93.9%", "78.8%", "97%", "93.9%", "75.8%", "90.9%", "87.9%", "90.9%"]);
    expect(highlights[0].primary).toBe(true);
    expect(highlights[0].label).toBe("面部黑头粉刺数量");
    expect(highlights[0].description).toContain("不代表全部痘痘");
    expect(highlights[2].description).toBe("去除脸部痘痕");
    expect(part.studyNote).toContain("不代表各项功效提升幅度");
  });
  it("净痘清露两种用法保留不同频率与三岁以下儿童警示", () => {
    const product = getMibanOfficialProduct("nuskin-official-4")!;
    const spot = product.mobilePoster!.parts.find(part => part.id.endsWith("spot-application"))!;
    const face = product.mobilePoster!.parts.find(part => part.id.endsWith("full-face-application"))!;
    expect(getOfficialUsageFacts(spot)).toEqual([{ label: "局部湿敷", value: "10-15分钟" }, { label: "建议频率", value: "每天2-3次" }]);
    expect(getOfficialUsageFacts(face)).toEqual([{ label: "使用频率", value: "早晚各1次" }]);
    expect(product.warnings.join("\n")).toContain("三岁以下儿童勿用");
    expect(product.usage).toContain("可以在精华液步骤单独使用");
  });
  it("润唇膏没有研究数据，不造研究卡或旧版防晒系数，保留可读成分脚注", () => {
    const product = getMibanOfficialProduct("nuskin-official-5")!;
    const parts = product.mobilePoster!.parts;
    expect(parts.every(part => getOfficialPosterLayout(part) !== "study")).toBe(true);
    const ingredients = parts.find(part => part.layout === "ingredients")!;
    expect(ingredients.bullets).toHaveLength(6);
    expect(ingredients.footnotes![0]).toContain("不等同于产品功效");
    expect(component).toContain("data-official-mobile-footnotes");
    expect(product.specification).toContain("3.5g");
    expect(product.specification).toContain("36个月");
    expect(JSON.stringify(parts)).not.toMatch(/SPF15|SPF20|4\.2g|临床研究/);
    expect(parts.find(part => part.id.endsWith("usage-lipstick-base"))!.steps!.join("\n")).toContain("若干分钟");
  });
  it("正文没有独立gallery也能显示海报，导航只显示实际存在的用法和产品说明", () => {
    expect(detail).toContain("posters.length > 0 || product.mobilePoster");
    expect(detail).toContain("getOfficialPosterLayout(part)");
    expect(detail).toContain(".filter(section => section.exists)");
    expect(detail).toContain("detailSections.map");
  });
});

describe("玫琳凯与安利十款v5连续场景和原始科学证据", () => {
  it("新十款按本品牌背景与墨色适配，仍保持如新v4专用风格", () => {
    expect(component).toContain('data-official-poster-style={isNuskin ? "nuskin-immersive-v4" : "official-immersive-v5"}');
    expect(component).toContain('data-official-poster-brand={product?.brandSlug ?? "official"}');
    expect(component).toContain("const from = visual?.from ?? poster.background");
    expect(component).toContain("const to = visual?.to ?? poster.background");
    expect(component).toContain("contrast(lightInk) > contrast(darkInk)");
    expect(component).toContain('part.eyebrow === "NU SKIN" && product?.brandSlug !== "nuskin"');
    expect(component).not.toMatch(/trpc|addToCart|createOrder|generateImage/);
  });
  it("新十款逐章同源场景保留真实像素与比例，完整证照或教学图也可原样满铺", async () => {
    for (const brand of ["marykay", "amway"]) {
      for (let index = 1; index <= 5; index++) {
        const key = `${brand}-official-${index}`;
        const product = getMibanOfficialProduct(key)!;
        let sceneCount = 0;
        const canvases = new Set<string>();
        for (const part of product.mobilePoster!.parts) {
          const visual = getOfficialImmersiveVisual(key, part.id)!;
          expect(visual).toBeDefined();
          expect(visual.source).toBe(part.sourceUrl);
          expect(visual.from).toMatch(/^#[0-9a-f]{6}$/i);
          expect(visual.to).toMatch(/^#[0-9a-f]{6}$/i);
          if (part.sourceRange) expect(visual.range).toEqual(part.sourceRange);
          else expect(visual.textLocation).toBe(part.sourceTextLocation);
          if (visual.scene) {
            sceneCount++;
            expect(existsSync(path.join(root, "client/public", visual.scene.url))).toBe(true);
            expect(visual.scene.width).toBeGreaterThan(0);
            expect(visual.scene.height).toBeGreaterThan(0);
            const scenePath = path.join(root, "client/public", visual.scene.url);
            const scene = await sharp(scenePath).metadata();
            expect([scene.width, scene.height]).toEqual([visual.scene.width, visual.scene.height]);
            const source = product.gallery.find(image => image.sourceUrl === part.sourceUrl)!;
            expect(source, `${part.id}满铺图须可追溯到已保留的原稿`).toBeDefined();
            expect(part.sourceRange).toBeDefined();
            const hash = createHash("sha256").update(part.sourceUrl!).digest("hex").slice(0, 12);
            const directory = path.join(root, "client/public/miban-official", brand, key);
            const originals = readdirSync(directory).filter(file => file.startsWith(`original-${hash}.`));
            expect(originals).toHaveLength(1);
            const original = await sharp(path.join(directory, originals[0])).metadata();
            const mobilePath = path.join(root, "client/public", source.url);
            const mobile = await sharp(mobilePath).metadata();
            const [start, end] = part.sourceRange!;
            expect(start).toBeGreaterThanOrEqual(0);
            expect(end).toBeLessThanOrEqual(original.height!);
            expect(end).toBeGreaterThan(start);
            // Mary Kay removes only desktop side whitespace. Amway's large guide
            // is uniformly downsampled: original 4500×8000, mobile 1500×2667.
            const scale = mobile.height! / original.height!;
            const top = Math.round(start * scale);
            const height = Math.round(end * scale) - top;
            expect(scene.width).toBe(mobile.width);
            expect(Math.abs(scene.height! - height)).toBeLessThanOrEqual(1);
            // Compare source-matched pixels, allowing only normal WebP encoding noise.
            const expectedPixels = await sharp(mobilePath).extract({ left: 0, top, width: mobile.width!, height }).resize(96, 96, { fit: "fill" }).removeAlpha().toColourspace("srgb").raw().toBuffer();
            const scenePixels = await sharp(scenePath).resize(96, 96, { fit: "fill" }).removeAlpha().toColourspace("srgb").raw().toBuffer();
            expect(scenePixels.length).toBe(expectedPixels.length);
            const difference = scenePixels.reduce((total, value, pixel) => total + Math.abs(value - expectedPixels[pixel]), 0) / scenePixels.length;
            expect(difference, `${part.id}不能重绘、加滤镜或丢失原范围证据`).toBeLessThan(8);
            if (getOfficialPosterLayout(part) === "certificate") {
              expect(part.sourceRange).toEqual([0, original.height]);
            }
          } else if (part.kind === "info") {
            canvases.add(getOfficialPosterLayout(part));
          }
          for (const photo of part.photos ?? []) {
            const metadata = await sharp(path.join(root, "client/public", photo.url)).metadata();
            expect([metadata.width, metadata.height]).toEqual([photo.width, photo.height]);
          }
        }
        expect(sceneCount).toBeGreaterThan(0);
        expect(canvases.has("product"), `${key}规格必须有手机画布`).toBe(true);
        if (key !== "amway-official-4") expect(canvases.has("study"), `${key}研究须有可读手机画布`).toBe(true);
        if (key !== "amway-official-5") expect(canvases.has("usage"), `${key}已取得具体用法须有手机画布`).toBe(true);
      }
    }
  });
  it("满铺场景保留可访问正文与脚注，研究图保持原图比例且可放大", () => {
    const css = readFileSync(path.join(root, "client/src/pages/miban/OfficialMobilePoster.css"), "utf8");
    expect(component).toContain('data-official-full-scene className="block h-auto w-full"');
    expect(component).toContain('className="official-scene-transcript" data-official-mobile-copy');
    expect(component).toContain('data-official-mobile-footnotes className="official-scene-transcript"');
    expect(component).toContain('layout === "study" || layout === "certificate" ? "unaltered-evidence" : "edge-blended-scene"');
    expect(component).toContain('variant="original"');
    expect(component).toContain('className="block h-auto w-full object-contain"');
    expect(component).toContain("data-official-zoom-image");
    expect(css).toContain("official-poster-evidence");
    for (const selector of [".official-poster-evidence", ".official-poster-evidence > img"]) {
      const rule = css.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]+)\\}`))?.[1];
      expect(rule, `${selector}必须明确无滤镜、无混合、无遮罩`).toBeDefined();
      expect(rule).toMatch(/filter:\s*none/);
      expect(rule).toMatch(/mix-blend-mode:\s*normal/);
      expect(rule).toMatch(/mask-image:\s*none/);
    }
  });
});
