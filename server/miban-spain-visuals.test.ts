import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import sharp from "sharp";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { mibanLimitedBrands } from "../shared/miban-limited-brand-config";
import { getMibanLimitedProduct, mibanLimitedProducts } from "../shared/miban-limited-products";

// Entirely offline: import only the real static catalog, decode local bytes, and
// extract pure presentation expressions. Never import the live page, DB, router,
// availability hooks, payment hooks or order/API harnesses.
const COS = "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com";
const fixtures = [
  {
    id: "romanico", region: "托罗 Toro", winery: "Teso La Monja", year: "2020",
    alcohol: "14.5%vol", grape: "100% 丹魄 Tinta de Toro", grade: "Toro DO",
    ageing: "法国橡木桶陈酿6个月", pairing: ["牛排", "烤羊腿", "硬奶酪", "伊比利亚火腿"],
    legacySha256: "8aa45cf985f12bc252d580ffa13114722e8986abb020f4766370f9aac2e6e267",
    references: [
      `${COS}/assets/romanico-label-closeup-QJ4zBX6VPML4htb6NGWWJM.webp`,
      `${COS}/wine-products/romanico-pairing.webp`,
    ],
  },
  {
    id: "marthu", region: "里奥哈 Rioja", winery: "马约尔酒庄 Bodegas Fuenmayor", year: "2018",
    alcohol: "14.5%vol", grape: "丹魄 Tempranillo", grade: "DOC", ageing: undefined,
    pairing: ["奶酪", "牛排", "肉类"],
    legacySha256: "52a7f6a50a85224a2ae2ab4d1fd39e06aa2e593ee8f57c7d8824cb3b5a7ccf5b",
    references: [`${COS}/wine-products/marthu-hero.webp`, `${COS}/wine-products/marthu-pairing.webp`],
  },
  {
    id: "fidencio", region: "拉曼恰 La Mancha", winery: "圣女酒庄 Virgen de las Viñas", year: "2016",
    alcohol: "13.5%vol", grape: "丹魄 Tempranillo", grade: "DO / RESERVA",
    ageing: "橡木桶陈酿12个月", pairing: ["牛排", "羊排", "硬奶酪"],
    legacySha256: "00a03b2ecf4c5ea3d098303fd01989a16137862030bb59c4b84cb99f2493b76c",
    references: [`${COS}/wine-products/fidencio-hero.webp`, `${COS}/wine-products/fidencio-pairing.webp`],
  },
] as const;
const roles = [
  { name: "list", widthRatio: 4, heightRatio: 5 },
  { name: "hero", widthRatio: 1, heightRatio: 1 },
  { name: "detail", widthRatio: 9, heightRatio: 16 },
] as const;
const imagePath = (id: string, role: string) => `/miban-spain/products/v2/${id}-${role}.webp`;
const fileFor = (path: string) => new URL(`../client/public${path}`, import.meta.url);
const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const normalize = (value: string) => value.replace(/\s/g, "");
function productFor(id: string) {
  const product = getMibanLimitedProduct(`spain-${id}`);
  expect(product, `real catalog product spain-${id}`).toBeDefined();
  return product!;
}
async function decodeWebp(path: string) {
  const file = fileFor(path);
  expect(existsSync(file), `required local asset ${path}`).toBe(true);
  const bytes = readFileSync(file);
  expect(bytes.subarray(0, 4).toString("ascii")).toBe("RIFF");
  expect(bytes.subarray(8, 12).toString("ascii")).toBe("WEBP");
  const metadata = await sharp(bytes, { failOn: "warning" }).metadata();
  expect(metadata.format, path).toBe("webp");
  // metadata alone is not a decode: force the entire image through libvips.
  const decoded = await sharp(bytes, { failOn: "warning" }).raw().toBuffer({ resolveWithObject: true });
  expect(decoded.info.width).toBe(metadata.width);
  expect(decoded.info.height).toBe(metadata.height);
  expect(decoded.info.width).toBeGreaterThan(0);
  expect(decoded.info.height).toBeGreaterThan(0);
  expect(decoded.data.length).toBe(decoded.info.width * decoded.info.height * decoded.info.channels);
  return { bytes, width: decoded.info.width, height: decoded.info.height };
}

const parse = (source: string) => ts.createSourceFile("page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function walk(node: ts.Node, visitor: (node: ts.Node) => void) {
  visitor(node);
  ts.forEachChild(node, child => walk(child, visitor));
}
function evaluate(expression: string, bindings: Record<string, unknown>) {
  // Only expressions selected from presentation JSX/declarations are evaluated;
  // this cannot execute the containing page or any imports/live hooks.
  expect(expression).not.toMatch(/useQuery|useMutation|fetch\s*\(|preparePayment|createOrder|walletPayment/);
  const js = ts.transpileModule(`const result = (${expression});\nreturn result;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React },
  }).outputText;
  return new Function(...Object.keys(bindings), js)(...Object.values(bindings));
}
function initializer(ast: ts.SourceFile, name: string) {
  const matches: ts.Expression[] = [];
  walk(ast, node => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name && node.initializer)
      matches.push(node.initializer);
  });
  expect(matches, `one real ${name} presentation flag`).toHaveLength(1);
  return matches[0].getText(ast);
}

describe("Spain v2: nine independently decodable assets and preserved original photography", () => {
  it.each(fixtures.flatMap(wine => roles.map(role => ({ id: wine.id, ...role }))))(
    "$id-$name is an actual WebP with the required ratio from decoded file data",
    async ({ id, name, widthRatio, heightRatio }) => {
      const image = await decodeWebp(imagePath(id, name));
      // 9:16 resized to width 1200 has a fractional ideal height. Permit only
      // the half-pixel rounding inherent in integer pixel dimensions, not a
      // broad floating-point ratio tolerance that could hide a wrong crop.
      const heightError = Math.abs(image.height - image.width * heightRatio / widthRatio);
      const widthError = Math.abs(image.width - image.height * widthRatio / heightRatio);
      expect(Math.min(heightError, widthError), `${id}-${name}: decoded ${image.width}x${image.height}`)
        .toBeLessThanOrEqual(0.5);
    }
  );

  it("does not alias the three roles or reuse one file for multiple wines", () => {
    const paths = fixtures.flatMap(wine => roles.map(role => imagePath(wine.id, role.name)));
    expect(new Set(paths).size).toBe(9);
    const hashes = paths.map(path => createHash("sha256").update(readFileSync(fileFor(path))).digest("hex"));
    expect(new Set(hashes).size, "all nine role-specific files must be distinct").toBe(9);
  });

  it.each(fixtures)("$id keeps its original main file byte-for-byte as a later carousel reference", async wine => {
    const original = await decodeWebp(`/miban-spain/products/${wine.id}-main.webp`);
    expect(createHash("sha256").update(original.bytes).digest("hex")).toBe(wine.legacySha256);
    const product = productFor(wine.id);
    const expectedHeroes = [imagePath(wine.id, "hero"), `/miban-spain/products/${wine.id}-main.webp`, ...wine.references];
    expect(product.card.image).toBe(imagePath(wine.id, "list"));
    expect(product.detail.productImage).toBe(imagePath(wine.id, "list"));
    expect(product.skus[0].image).toBe(imagePath(wine.id, "list"));
    expect(product.detail.heroImages).toEqual(expectedHeroes);
    // SKU hero images take priority in the actual detail page; their first slide
    // must not silently fall back to the list image or a legacy photograph.
    expect(product.skus[0].heroImages).toEqual(expectedHeroes);
    expect(product.detail.detailImages).toEqual([imagePath(wine.id, "detail")]);
    const actualPosters = product.skus[0].detailImages ?? product.detail.detailImages;
    expect(actualPosters).toEqual([imagePath(wine.id, "detail")]);
    expect(product.detail.detailImage).toBeUndefined();
    expect(product.skus[0].detailImage).toBeUndefined();
  });
});

describe("Spain v2: factual information remains separate from designed scenes and general advice", () => {
  it.each(fixtures)("$id exposes its complete original facts without inferring a new vintage", wine => {
    const product = productFor(wine.id);
    const sheet = product.detail.factSheet;
    expect(sheet).toBeDefined();
    expect(sheet!.title.trim().length).toBeGreaterThan(0);
    expect(sheet!.items.length).toBeGreaterThanOrEqual(8);
    expect(new Set(sheet!.items.map(item => normalize(item.label))).size).toBe(sheet!.items.length);
    for (const item of sheet!.items) {
      expect(typeof item.label).toBe("string");
      expect(typeof item.value).toBe("string");
      expect(item.label.trim().length).toBeGreaterThan(0);
      expect(item.value.trim().length).toBeGreaterThan(0);
    }
    const required = [
      { label: /国家|原产国|country/i, value: "西班牙" },
      { label: /产区/, value: wine.region },
      { label: /酒庄/, value: wine.winery },
      { label: /葡萄|品种/, value: wine.grape },
      { label: /原.*年份|年份.*原/, value: wine.year },
      { label: /酒精/, value: wine.alcohol },
      { label: /净含量|规格|容量/, value: "750ml" },
      { label: /等级/, value: wine.grade },
      ...(wine.ageing ? [{ label: /陈酿|橡木/, value: wine.ageing }] : []),
    ];
    for (const fact of required) {
      const matching = sheet!.items.filter(item => fact.label.test(normalize(item.label)));
      expect(matching, `${wine.id}: factual field ${fact.label}`).toHaveLength(1);
      expect(normalize(matching[0].value).replace(/\/瓶$/, "")).toBe(normalize(fact.value));
    }
    const yearNotice = product.detail.notices.find(notice => /年份/.test(notice.label));
    expect(yearNotice?.text).toMatch(/实物酒标/);
    expect(yearNotice?.text).toMatch(/订单确认/);
  });

  it.each(fixtures)("$id has four clearly general serving tips, original pairing and no timed decanting claim", wine => {
    const guide = productFor(wine.id).detail.servingGuide;
    expect(guide).toBeDefined();
    expect(guide!.title.trim().length).toBeGreaterThan(0);
    expect(guide!.items).toHaveLength(4);
    for (const item of guide!.items) {
      expect(item.title.trim().length).toBeGreaterThan(0);
      expect(item.description.trim().length).toBeGreaterThan(0);
    }
    const text = [guide!.note ?? "", ...guide!.items.map(item => `${item.title} ${item.description}`)].join(" ");
    expect(text).toMatch(/一般|通用/);
    expect(text).toMatch(/15\s*[–—\-~～至]\s*18\s*°?\s*C/i);
    expect(text).toMatch(/(?:非|并非|不是|不代表)[^。；]*酒庄[^。；]*(?:官方|固定)|酒庄[^。；]*(?:官方|固定)[^。；]*(?:非|并非|不是|不代表)/);
    const decanting = guide!.items.filter(item => /醒酒/.test(`${item.title} ${item.description}`));
    expect(decanting).toHaveLength(1);
    expect(decanting[0].description).toMatch(/适度|适量|根据|按|视/);
    expect(text).not.toMatch(/(?:\d+|[一二三四五六七八九十半]+)\s*(?:分钟|小时)|\b\d+\s*(?:min(?:ute)?s?|hours?)\b/i);
    const pairing = guide!.items.find(item => /配餐|搭配/.test(item.title));
    expect(pairing).toBeDefined();
    for (const food of wine.pairing) expect(pairing!.description).toContain(food);
    const storage = guide!.items.find(item => /储存|保存|存放/.test(item.title));
    expect(storage).toBeDefined();
    expect(storage!.description).toMatch(/避光/);
    expect(storage!.description).toMatch(/阴凉/);
  });

  it.each(fixtures)("$id discloses the designed scenes and removes duplicated legacy stories and score art", wine => {
    const detail = productFor(wine.id).detail;
    expect(detail.storySections).toBeUndefined();
    expect(JSON.stringify(productFor(wine.id))).not.toMatch(/romanico-detail-scores|romanico-detail-winery|romanico-detail-pairing|RP\s*92|权威评分认证/);
    for (const disclosure of [detail.sourceNote, detail.detailImagesCaption]) {
      expect(disclosure).toMatch(/(?:设计|视觉)(?:演绎|设计)|场景设计/);
      expect(disclosure).toMatch(/(?:并非|非|不是)[^。；]*酒庄[^。；]*实拍/);
    }
  });

  it("does not invent Marthu barrel-ageing months or years", () => {
    const product = productFor("marthu");
    const text = JSON.stringify(product);
    expect(text).not.toMatch(/(?:陈酿|橡木|熟成)[^。；"}]{0,30}(?:\d+|[一二三四五六七八九十]+)\s*(?:个?月|年)|(?:\d+|[一二三四五六七八九十]+)\s*个?月[^。；"}]{0,20}(?:陈酿|橡木|熟成)/);
    expect(product.detail.factSheet!.items.filter(item => /陈酿|橡木/.test(item.label))).toHaveLength(0);
  });

  it("keeps new optional structured content confined to the three Spain products", () => {
    const withFacts = mibanLimitedProducts.filter(product => product.detail.factSheet || product.detail.servingGuide);
    expect(withFacts.map(product => product.key)).toEqual(fixtures.map(wine => `spain-${wine.id}`));
    const types = read("../shared/miban-limited-products.ts");
    expect(types).toMatch(/factSheet\?\s*:/);
    expect(types).toMatch(/servingGuide\?\s*:/);
  });
});

function jsxAttribute(node: ts.JsxOpeningElement | ts.JsxSelfClosingElement, name: string) {
  return node.attributes.properties.find((item): item is ts.JsxAttribute =>
    ts.isJsxAttribute(item) && item.name.getText() === name);
}
function attributeExpression(node: ts.JsxOpeningElement | ts.JsxSelfClosingElement, name: string) {
  const attribute = jsxAttribute(node, name);
  expect(attribute?.initializer && ts.isJsxExpression(attribute.initializer) && attribute.initializer.expression,
    `real ${name} JSX expression`).toBeTruthy();
  return (attribute!.initializer as ts.JsxExpression).expression!;
}
function presentationGates(ast: ts.SourceFile, condition: string) {
  const gates: ts.BinaryExpression[] = [];
  walk(ast, node => {
    if (ts.isJsxExpression(node) && node.expression && ts.isBinaryExpression(node.expression) &&
        node.expression.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken &&
        node.expression.left.getText(ast) === condition) gates.push(node.expression);
  });
  return gates;
}

describe("Spain v2: list fusion is independent of all other brands", () => {
  it("uses the actual flag and thumbnail classes without activating wine fusion for another brand", () => {
    const ast = parse(read("../client/src/pages/miban/LimitedBrandProducts.tsx"));
    const wineFlag = initializer(ast, "useBlendedWineCard");
    const adaptiveFlag = initializer(ast, "useAdaptiveProductCard");
    const thumbnails: ts.JsxSelfClosingElement[] = [];
    walk(ast, node => {
      if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(ast) === "MibanImage" &&
          jsxAttribute(node, "src")?.initializer?.getText(ast) === "{product.card.image}") thumbnails.push(node);
    });
    expect(thumbnails).toHaveLength(1);
    const classes = attributeExpression(thumbnails[0], "className").getText(ast);
    const slugs = [...new Set([...mibanLimitedBrands.map(brand => brand.slug), "spain", "", "not-a-brand"])];
    for (const brandSlug of slugs) {
      const useBlendedWineCard = evaluate(wineFlag, { brandSlug });
      const useAdaptiveProductCard = evaluate(adaptiveFlag, { brandSlug });
      expect(useBlendedWineCard, `wine fusion flag for ${brandSlug}`).toBe(brandSlug === "spain");
      expect(useAdaptiveProductCard).toBe(brandSlug === "tuoquetang" || brandSlug === "lingchuang");
      const className = evaluate(classes, { useBlendedWineCard, useAdaptiveProductCard }) as string;
      if (brandSlug === "spain" || useAdaptiveProductCard) {
        expect(className).toContain("object-cover");
        expect(className).toContain("object-center");
        expect(className).not.toMatch(/\b(?:object-contain|p-3)\b/);
      } else {
        expect(className).toBe("h-full w-full object-contain p-3");
      }
    }
  });

  it("renders the real top/bottom and right white gradients only behind the Spain gate", () => {
    const ast = parse(read("../client/src/pages/miban/LimitedBrandProducts.tsx"));
    const gates = presentationGates(ast, "useBlendedWineCard");
    expect(gates).toHaveLength(1);
    const realGate = gates[0].getText(ast);
    for (const wine of fixtures) {
      const product = productFor(wine.id);
      const html = renderToStaticMarkup(evaluate(realGate, { React, product, useBlendedWineCard: true }) as React.ReactElement);
      expect(html).toContain('aria-hidden="true"');
      expect(html).toContain("pointer-events-none");
      expect(html).toContain("absolute inset-0");
      expect(html).toMatch(/linear-gradient\(180deg,/);
      expect(html).toMatch(/linear-gradient\(90deg,/);
      if (wine.id === "marthu") {
        expect(html).toMatch(/#FFFFFF 0%/i);
        expect(html.match(/#FFFFFF 100%/gi)).toHaveLength(2);
        expect(html).toContain("18%");
        expect(html).toContain("80%");
      } else {
        expect(html).toContain("rgba(255,255,255,0.35) 0%");
        expect(html).toContain("rgba(255,255,255,0) 6%");
        expect(html).toContain("rgba(255,255,255,0) 94%");
        expect(html.match(/#FFFFFF 100%/gi)).toHaveLength(1);
      }
    }
    expect(renderToStaticMarkup(evaluate(realGate, { React, useBlendedWineCard: false }) as React.ReactElement)).toBe("");
    const badgeGates = presentationGates(ast, "!useBlendedWineCard");
    expect(badgeGates).toHaveLength(1);
    const badgeBindings = { React, product: productFor("romanico") };
    const wineBadge = renderToStaticMarkup(evaluate(badgeGates[0].getText(ast), {
      ...badgeBindings, useBlendedWineCard: true,
    }) as React.ReactElement);
    expect(wineBadge).toBe("");
    const existingBadge = renderToStaticMarkup(evaluate(badgeGates[0].getText(ast), {
      ...badgeBindings, useBlendedWineCard: false,
    }) as React.ReactElement);
    expect(existingBadge).toContain(productFor("romanico").card.badge);
    // The established adaptive-card black fade is not repurposed as the new
    // wine fade, so Tuoquetang/Lingchuang retain their previous presentation.
    const adaptiveGates = presentationGates(ast, "useAdaptiveProductCard");
    expect(adaptiveGates).toHaveLength(1);
    expect(adaptiveGates[0].right.getText(ast)).toContain("from-black/20");
  });
});

function realWineInformation() {
  const ast = parse(read("../client/src/pages/miban/MibanWineInformation.tsx"));
  const declaration = ast.statements.find((node): node is ts.FunctionDeclaration =>
    ts.isFunctionDeclaration(node) && node.name?.text === "MibanWineInformation");
  expect(declaration, "real, independent fact/advice presentation component").toBeDefined();
  const source = declaration!.getText(ast).replace(/^export\s+/, "");
  expect(source).not.toMatch(/useQuery|useMutation|useEffect|fetch\s*\(|walletPayment|preparePayment|createOrder|cnyToU/);
  const js = ts.transpileModule(`${source}\nreturn MibanWineInformation;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React },
  }).outputText;
  return new Function("React", js)(React) as React.ComponentType<{
    detail: ReturnType<typeof productFor>["detail"];
    theme: { primary: string; navy: string; muted: string; border: string; surfaceMuted: string };
  }>;
}
// Use the real registered theme; no full component/hook/provider imports.
function wineTheme() {
  const theme = mibanLimitedBrands.find(brand => brand.slug === "spain")?.theme;
  expect(theme).toBeDefined();
  return theme!;
}
function escapedText(text: string) {
  return renderToStaticMarkup(React.createElement("span", null, text)).replace(/^<span>|<\/span>$/g, "");
}

describe("Spain v2: real fact/advice presentation, with no API or payment execution", () => {
  it.each(fixtures)("$id renders every factual field and all four advice cards in the actual presentation component", wine => {
    const Information = realWineInformation();
    const detail = productFor(wine.id).detail;
    const html = renderToStaticMarkup(React.createElement(Information, { detail, theme: wineTheme() }));
    expect(html).toContain('data-testid="wine-fact-sheet"');
    expect(html).toContain('data-testid="wine-serving-guide"');
    expect(html).toContain(escapedText(detail.factSheet!.title));
    expect(html).toContain(escapedText(detail.servingGuide!.title));
    expect(html.match(/<dt\b/g)).toHaveLength(detail.factSheet!.items.length);
    expect(html.match(/<dd\b/g)).toHaveLength(detail.factSheet!.items.length);
    expect(html.match(/<article\b/g)).toHaveLength(4);
    for (const item of detail.factSheet!.items) {
      expect(html).toContain(escapedText(item.label));
      expect(html).toContain(escapedText(item.value));
    }
    for (const item of detail.servingGuide!.items) {
      expect(html).toContain(escapedText(item.title));
      expect(html).toContain(escapedText(item.description));
    }
    if (detail.servingGuide!.note) expect(html).toContain(escapedText(detail.servingGuide!.note));
    expect(html).toContain("实际批次以酒标及订单确认为准");
    expect(html).not.toMatch(/<button|USDT|支付|钱包/);
  });

  it("returns no markup for every other real catalog product lacking the optional facts/advice", () => {
    const Information = realWineInformation();
    const others = mibanLimitedProducts.filter(product => product.brand !== "西班牙");
    expect(others.length).toBeGreaterThan(0);
    for (const product of others) {
      expect(renderToStaticMarkup(React.createElement(Information, {
        detail: product.detail, theme: wineTheme(),
      })), product.key).toBe("");
    }
  });

  it("keeps each optional section independent without synthesizing facts or advice", () => {
    const Information = realWineInformation();
    const detail = productFor("romanico").detail;
    const factsOnly = renderToStaticMarkup(React.createElement(Information, {
      detail: { ...detail, servingGuide: undefined }, theme: wineTheme(),
    }));
    expect(factsOnly).toContain('data-testid="wine-fact-sheet"');
    expect(factsOnly).not.toContain('data-testid="wine-serving-guide"');
    const guideOnly = renderToStaticMarkup(React.createElement(Information, {
      detail: { ...detail, factSheet: undefined }, theme: wineTheme(),
    }));
    expect(guideOnly).not.toContain('data-testid="wine-fact-sheet"');
    expect(guideOnly).toContain('data-testid="wine-serving-guide"');
  });

  it("connects the real optional information component to the existing detail product/theme", () => {
    const source = read("../client/src/pages/miban/HerbalifeRedGinsengDetail.tsx");
    expect(source).toContain('from "./MibanWineInformation"');
    const ast = parse(source);
    const instances: ts.JsxSelfClosingElement[] = [];
    walk(ast, node => {
      if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(ast) === "MibanWineInformation") instances.push(node);
    });
    expect(instances).toHaveLength(1);
    expect(attributeExpression(instances[0], "detail").getText(ast)).toBe("currentProduct.detail");
    expect(attributeExpression(instances[0], "theme").getText(ast)).toBe("theme");
  });

  it("renders the actual bottom white hero fade only on the first Spain slide", () => {
    const ast = parse(read("../client/src/pages/miban/HerbalifeRedGinsengDetail.tsx"));
    const flag = initializer(ast, "isSpainProduct");
    const gates = presentationGates(ast, "isSpainProduct && index === 0");
    expect(gates).toHaveLength(1);
    for (const currentBrand of [...mibanLimitedBrands, undefined]) {
      const isSpainProduct = evaluate(flag, { currentBrand });
      expect(isSpainProduct).toBe(currentBrand?.slug === "spain");
      for (const index of [0, 1, 2, 3]) {
        const html = renderToStaticMarkup(evaluate(gates[0].getText(ast), { React, isSpainProduct, index }) as React.ReactElement);
        if (currentBrand?.slug === "spain" && index === 0) {
          expect(html).toContain('data-testid="spain-detail-hero-blend"');
          expect(html).toContain('aria-hidden="true"');
          expect(html).toContain("pointer-events-none");
          expect(html).toContain("bottom-0");
          expect(html).toContain("bg-gradient-to-t from-white to-transparent");
        } else expect(html).toBe("");
      }
    }
  });
});
