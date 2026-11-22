import React, { type ReactElement, type SyntheticEvent } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Router } from "wouter";
import { readFileSync, readdirSync } from "node:fs";
import ts from "typescript";
import sharp from "sharp";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  mibanImageAssets,
  type MibanImageAsset,
  type MibanImageVariant,
} from "../shared/miban-image-assets";
import { midaniangSelectionAssets } from "../shared/midaniang-selection-assets";

// Offline unit boundaries only: React scheduling, external query hooks and COS
// transport are isolated. No app/server/router/DB bootstrap or HTTP is executed.
// Temporary image entries below exist only in this test's in-memory module export;
// the production manifest is never written or substituted with fixture content.
const boundary = vi.hoisted(() => ({
  state: null as null | { useState: (initial: unknown) => unknown },
  attention: undefined as undefined | { brandSlug: string; viewCount: number }[],
  mutateAsync: vi.fn(),
  putObject: vi.fn(),
  getObjectUrl: vi.fn(),
  network: vi.fn(),
}));
vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    useState: (initial: unknown) => boundary.state
      ? boundary.state.useState(initial)
      : actual.useState(initial),
  };
});
vi.mock("../client/src/pages/miban/mibanTrpc", () => ({
  mtrpc: {
    useUtils: () => ({ limitedProduct: { brandAttention: { setData: vi.fn(), invalidate: vi.fn() } } }),
    limitedProduct: {
      brandAttention: { useQuery: () => ({ data: boundary.attention }) },
      recordBrandAttention: { useMutation: () => ({ mutateAsync: boundary.mutateAsync }) },
    },
  },
}));
vi.mock("../client/src/pages/miban/useMibanUsdtCnyRate", () => ({
  useMibanUsdtCnyRate: () => 7,
  cnyToU: (amount: number, rate: number) => amount / rate,
}));
vi.mock("cos-nodejs-sdk-v5", () => ({
  default: class OfflineCOS {
    putObject = boundary.putObject;
    getObjectUrl = boundary.getObjectUrl;
  },
}));
import { MibanImage, getMibanImageSource, getMibanPosterParts, type MibanImageProps } from "../client/src/pages/miban/MibanImage";
import LimitedSale from "../client/src/pages/miban/LimitedSale";
import MidaniangSelection from "../client/src/pages/miban/MidaniangSelection";

const COS_ORIGIN = "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com";
const VARIANTS = ["icon", "thumbnail", "card", "hero", "poster"] as const;
const originalA = `${COS_ORIGIN}/miban-shebei/unit-fixture/source-a.png`;
const originalB = `${COS_ORIGIN}/miban-shebei/unit-fixture/source-b.png`;
const fixtureAsset = (original: string, prefix: string): MibanImageAsset => ({
  original, width: 1280, height: 960, bytes: 200000,
  variants: Object.fromEntries(VARIANTS.map((variant, index) => [variant, {
    src: `${COS_ORIGIN}/miban-shebei/optimized-images/v1/${prefix}${String(index).padStart(19, "0")}-400w.webp`,
    width: 400, height: 300, bytes: 10000,
  }])),
});
const assetsA = fixtureAsset(originalA, "a");
const assetsB = fixtureAsset(originalB, "b");
const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), "utf8");
const pageSource = (name: string) => read(`../client/src/pages/miban/${name}.tsx`);
const parse = (name: string, source = pageSource(name)) => ts.createSourceFile(
  `${name}.tsx`, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX,
);
function walk(node: ts.Node, predicate: (node: ts.Node) => boolean): ts.Node[] {
  const found: ts.Node[] = [];
  const visit = (current: ts.Node) => {
    if (predicate(current)) found.push(current);
    ts.forEachChild(current, visit);
  };
  visit(node);
  return found;
}
type ImageNode = ts.JsxOpeningElement | ts.JsxSelfClosingElement;
const images = (file: ts.SourceFile, tag = "MibanImage") => walk(file, node =>
  (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(file) === tag,
) as ImageNode[];
function attribute(node: ImageNode, name: string, file: ts.SourceFile): string | undefined {
  const prop = node.attributes.properties.find(p => ts.isJsxAttribute(p) && p.name.getText(file) === name);
  if (!prop || !ts.isJsxAttribute(prop)) return undefined;
  if (!prop.initializer) return "true";
  if (ts.isStringLiteral(prop.initializer)) return prop.initializer.text;
  return ts.isJsxExpression(prop.initializer) ? prop.initializer.expression?.getText(file) : prop.initializer.getText(file);
}
function findElements(node: unknown, predicate: (element: ReactElement<any>) => boolean): ReactElement<any>[] {
  if (Array.isArray(node)) return node.flatMap(child => findElements(child, predicate));
  if (!React.isValidElement(node)) return [];
  const element = node as ReactElement<any>;
  return [...(predicate(element) ? [element] : []), ...findElements(element.props.children, predicate)];
}
const errorEvent = (): SyntheticEvent<HTMLImageElement> => ({
  type: "error", currentTarget: { src: "untouched-by-fixture" },
} as unknown as SyntheticEvent<HTMLImageElement>);

// Invoke the real forwardRef render, preserving hook slots across explicit rerenders.
// This deliberately models only useState; it does not pretend to mount a DOM/ref.
function imageHarness(initial: MibanImageProps, ref: React.Ref<HTMLImageElement> = null) {
  let props = initial;
  const slots: unknown[] = [];
  let cursor = 0;
  const writes: unknown[] = [];
  const fixture = {
    useState(initialValue: unknown) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initialValue === "function" ? initialValue() : initialValue;
      return [slots[index], (next: unknown) => {
        slots[index] = typeof next === "function" ? next(slots[index]) : next;
        writes.push(slots[index]);
      }];
    },
    render(next?: MibanImageProps): ReactElement<any> {
      if (next) props = next;
      cursor = 0;
      boundary.state = fixture;
      try {
        return (MibanImage as unknown as {
          render: (props: MibanImageProps, ref: React.Ref<HTMLImageElement>) => ReactElement<any>;
        }).render(props, ref);
      } finally { boundary.state = null; }
    },
    writes,
  };
  return fixture;
}

beforeEach(() => {
  boundary.state = null;
  boundary.attention = undefined;
  boundary.mutateAsync.mockReset();
  boundary.putObject.mockReset().mockImplementation((_params: unknown, callback?: (error: null) => void) => {
    callback?.(null);
    return Promise.resolve({});
  });
  boundary.getObjectUrl.mockReset().mockImplementation((_params: unknown, callback: (error: null, data: { Url: string }) => void) => {
    callback(null, { Url: `${COS_ORIGIN}/unit-signed-preview` });
  });
  boundary.network.mockReset().mockImplementation(() => { throw new Error("Offline unit test must not access HTTP"); });
  vi.stubGlobal("fetch", boundary.network);
  // The repository's Vitest TSX transform uses classic JSX.
  vi.stubGlobal("React", React);
});
afterEach(() => {
  expect(boundary.network).not.toHaveBeenCalled();
  boundary.state = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("MibanImage real SSR and controlled state (offline)", () => {
  beforeEach(() => {
    expect(mibanImageAssets[originalA]).toBeUndefined();
    expect(mibanImageAssets[originalB]).toBeUndefined();
    mibanImageAssets[originalA] = assetsA;
    mibanImageAssets[originalB] = assetsB;
  });
  afterEach(() => {
    delete mibanImageAssets[originalA];
    delete mibanImageAssets[originalB];
  });

  it("defaults to thumbnail / lazy / async / auto in actual SSR", () => {
    const markup = renderToStaticMarkup(React.createElement(MibanImage, { src: originalA, alt: "测试图" }));
    expect(markup).toContain(`src="${assetsA.variants.thumbnail!.src}"`);
    expect(markup).toContain('loading="lazy"');
    expect(markup).toContain('decoding="async"');
    expect(markup).toContain('fetchPriority="auto"');
    expect(markup).toContain('data-miban-image-variant="thumbnail"');
    expect(markup).not.toMatch(/\spriority=/);
  });
  it("priority forces eager / high even when caller requests lazy / low", () => {
    const markup = renderToStaticMarkup(React.createElement(MibanImage, {
      src: originalA, priority: true, loading: "lazy", fetchPriority: "low",
    }));
    expect(markup).toContain('loading="eager"');
    expect(markup).toContain('fetchPriority="high"');
    expect(markup).toContain('decoding="async"');
  });
  it("preserves explicit loading / decoding / fetchPriority without priority", () => {
    const node = imageHarness({ src: originalA, loading: "eager", decoding: "sync", fetchPriority: "low" }).render();
    expect(node.props).toMatchObject({ loading: "eager", decoding: "sync", fetchPriority: "low" });
  });
  it.each(VARIANTS)("resolves the actual mapped %s variant", variant => {
    expect(getMibanImageSource(originalA, variant)).toBe(assetsA.variants[variant]!.src);
    expect(imageHarness({ src: originalA, variant }).render().props.src).toBe(assetsA.variants[variant]!.src);
  });
  it("original variant never rewrites a known mapped image", () => {
    const node = imageHarness({ src: originalA, variant: "original" }).render();
    expect(getMibanImageSource(originalA, "original")).toBe(originalA);
    expect(node.props.src).toBe(originalA);
    expect(node.props.loading).toBe("lazy");
  });
  it("reads optional poster parts without inventing segments for ordinary/unknown images", () => {
    expect(getMibanPosterParts(originalA)).toBeUndefined();
    expect(getMibanPosterParts("https://example.org/unmapped.png")).toBeUndefined();
    const parts = [assetsA.variants.poster!, assetsB.variants.poster!];
    mibanImageAssets[originalA] = { ...assetsA, variants: { poster: { src: originalA, width: 1280, height: 960, bytes: 200000, parts } } };
    expect(getMibanPosterParts(originalA)).toBe(parts);
    expect(getMibanImageSource(originalA, "poster")).toBe(originalA);
  });
  it("preserves a source when its requested variant is absent", () => {
    mibanImageAssets[originalA] = { ...assetsA, variants: { thumbnail: assetsA.variants.thumbnail } };
    expect(getMibanImageSource(originalA, "poster")).toBe(originalA);
    expect(getMibanImageSource(originalA)).toBe(assetsA.variants.thumbnail!.src);
  });
  it.each([
    undefined,
    "",
    "https://example.org/unknown-logo.png",
    `${COS_ORIGIN}/unknown-public-image.webp`,
    `${originalA}?imageMogr2/thumbnail/400x`,
    `${originalA}?q-signature=unit-only`,
    `${originalA}#fragment`,
    `${COS_ORIGIN}/ziding-commercial-alliance/payment-proofs/v1/order/1/user/2/private.webp`,
    `${COS_ORIGIN}/recharge-proofs/private.webp`,
    "data:image/png;base64,dW5pdA==",
    "blob:https://example.org/unit-image",
    "/unknown-local-image.png",
  ])("preserves unsafe or unmapped input exactly: %s", src => {
    for (const variant of [...VARIANTS, "original"] as MibanImageVariant[]) {
      expect(getMibanImageSource(src, variant)).toBe(src);
      expect(imageHarness({ src, variant }).render().props.src).toBe(src);
    }
  });
  it.each(["object", "callback"])("forwards the %s ref and original img props unchanged", kind => {
    const ref = kind === "object" ? React.createRef<HTMLImageElement>() : vi.fn();
    const onLoad = vi.fn();
    const onClick = vi.fn();
    const style = { objectFit: "contain" as const, aspectRatio: "4 / 3" };
    const node = imageHarness({
      src: originalA, alt: "保留语义", id: "unit-image", title: "说明", width: 640, height: 480,
      className: "unit-layout", style, srcSet: "https://example.org/image.png 2x", sizes: "50vw",
      crossOrigin: "anonymous", referrerPolicy: "no-referrer", draggable: false,
      "aria-label": "图片说明", onLoad, onClick,
    }, ref).render();
    expect(node.type).toBe("img");
    expect(node.props).toMatchObject({
      ref, alt: "保留语义", id: "unit-image", title: "说明", width: 640, height: 480,
      className: "unit-layout", srcSet: "https://example.org/image.png 2x", sizes: "50vw",
      crossOrigin: "anonymous", referrerPolicy: "no-referrer", draggable: false,
      "aria-label": "图片说明", onLoad, onClick,
    });
    expect(node.props.style).toBe(style);
    if (kind === "callback") expect(ref).not.toHaveBeenCalled();
  });
  it("first derivative error falls back once, then calls original onError without looping", () => {
    const onError = vi.fn();
    const harness = imageHarness({ src: originalA, onError });
    const first = errorEvent();
    harness.render().props.onError(first);
    expect(onError).not.toHaveBeenCalled();
    expect(harness.writes).toEqual([assetsA.variants.thumbnail!.src]);
    expect(first.currentTarget.src).toBe("untouched-by-fixture");
    const original = harness.render();
    expect(original.props.src).toBe(originalA);
    const second = errorEvent();
    original.props.onError(second);
    expect(onError).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith(second);
    for (let index = 0; index < 3; index++) {
      const node = harness.render();
      expect(node.props.src).toBe(originalA);
      node.props.onError(errorEvent());
    }
    expect(harness.writes).toHaveLength(1);
    expect(onError).toHaveBeenCalledTimes(4);
  });
  it.each(["original", "unmapped"])("direct %s failure calls the caller immediately without scheduling fallback", kind => {
    const onError = vi.fn();
    const harness = imageHarness({ src: kind === "original" ? originalA : "https://example.org/unmapped.webp", variant: kind === "original" ? "original" : "thumbnail", onError });
    const event = errorEvent();
    harness.render().props.onError(event);
    expect(onError).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith(event);
    expect(harness.writes).toEqual([]);
  });
  it("fallback remains safe when the caller supplies no onError", () => {
    const harness = imageHarness({ src: originalA });
    harness.render().props.onError(errorEvent());
    expect(harness.render().props.src).toBe(originalA);
    expect(() => harness.render().props.onError(errorEvent())).not.toThrow();
    expect(harness.writes).toHaveLength(1);
  });
  it("a new source URL does not inherit the preceding SKU's error", () => {
    const onError = vi.fn();
    const harness = imageHarness({ src: originalA, onError });
    harness.render().props.onError(errorEvent());
    expect(harness.render().props.src).toBe(originalA);
    const next = harness.render({ src: originalB, onError });
    expect(next.props.src).toBe(assetsB.variants.thumbnail!.src);
    next.props.onError(errorEvent());
    expect(harness.render().props.src).toBe(originalB);
    expect(harness.writes).toEqual([assetsA.variants.thumbnail!.src, assetsB.variants.thumbnail!.src]);
    expect(onError).not.toHaveBeenCalled();
  });
  it("changing to a different variant URL does not reuse a thumbnail failure", () => {
    const harness = imageHarness({ src: originalA });
    harness.render().props.onError(errorEvent());
    expect(harness.render({ src: originalA, variant: "hero" }).props.src).toBe(assetsA.variants.hero!.src);
  });
  it("a regenerated optimized URL is retried even when the original URL is unchanged", () => {
    const harness = imageHarness({ src: originalA });
    harness.render().props.onError(errorEvent());
    const next = `${COS_ORIGIN}/miban-shebei/optimized-images/v1/cccccccccccccccccccc-400w.webp`;
    mibanImageAssets[originalA] = { ...assetsA, variants: { thumbnail: { src: next, width: 400, height: 300, bytes: 9000 } } };
    expect(harness.render().props.src).toBe(next);
  });
});

describe("generated real manifest (strict completion checks; no HTTP)", () => {
  it("contains real entries after generation instead of vacuously validating an empty manifest", () => {
    expect(Object.keys(mibanImageAssets).length, "Parent must finish generating the real COS manifest before the final run").toBeGreaterThan(0);
  });
  it("maps the actual approved midaniang logo and both real grid keys", () => {
    for (const [src, variant] of [[midaniangSelectionAssets.logo, "icon"], ...Object.values(midaniangSelectionAssets.grid).map(src => [src, "thumbnail"])] as [string, MibanImageVariant][]) {
      const asset = mibanImageAssets[src];
      expect(asset, `missing real source: ${src}`).toBeDefined();
      expect(asset?.original).toBe(src);
      expect(asset?.variants[variant as Exclude<MibanImageVariant, "original">]).toBeDefined();
    }
    // Only actual display roles are required, not redundant thumbnails of logos.
  });
  it("has positive integer bytes/dimensions, public sources, same-bucket variants, no upscale or unsafe URL", () => {
    for (const [source, asset] of Object.entries(mibanImageAssets)) {
      expect(asset.original).toBe(source);
      expect(source.startsWith(`${COS_ORIGIN}/`) || source.startsWith("/miban-")).toBe(true);
      expect(source).not.toMatch(/[?#]|payment-proofs|recharge-proofs|reimbursement-vouchers|ledger-photos|avatars/i);
      for (const value of [asset.width, asset.height, asset.bytes]) {
        expect(Number.isSafeInteger(value)).toBe(true);
        expect(value).toBeGreaterThan(0);
      }
      expect(Object.keys(asset.variants).length).toBeGreaterThan(0);
      for (const [variant, image] of Object.entries(asset.variants)) {
        expect(VARIANTS).toContain(variant);
        expect(image).toBeDefined();
        const url = new URL(image!.src);
        expect(url.origin).toBe(COS_ORIGIN);
        expect(url.search).toBe("");
        expect(url.hash).toBe("");
        expect(url.username).toBe("");
        expect(url.password).toBe("");
        for (const value of [image!.width, image!.height, image!.bytes]) {
          expect(Number.isSafeInteger(value)).toBe(true);
          expect(value).toBeGreaterThan(0);
        }
        expect(image!.width).toBeLessThanOrEqual(asset.width);
        expect(image!.height).toBeLessThanOrEqual(asset.height);
        // One pixel may be rounded in either axis (important for very tall posters).
        expect(Math.min(Math.abs(image!.height - image!.width * asset.height / asset.width), Math.abs(image!.width - image!.height * asset.width / asset.height))).toBeLessThanOrEqual(1.1);
        if (image!.parts?.length) {
          expect(variant).toBe("poster");
          const width = image!.parts[0].width;
          expect(image!.parts.every(part => part.width === width)).toBe(true);
          expect(Math.abs(image!.parts.reduce((sum, part) => sum + part.height, 0) - asset.height * width / asset.width)).toBeLessThanOrEqual(image!.parts.length);
          for (const part of image!.parts) {
            expect(part.width).toBeLessThanOrEqual(asset.width);
            expect(part.height).toBeLessThanOrEqual(1800);
            expect(part.bytes).toBeGreaterThan(0);
            expect(new URL(part.src).origin).toBe(COS_ORIGIN);
            expect(new URL(part.src).pathname).toMatch(/^\/miban-shebei\/optimized-images\/v1\/[a-f0-9]{20}-\d+w\.webp$/);
          }
        } else {
          expect(image!.width).toBeLessThanOrEqual(16383);
          expect(image!.height).toBeLessThanOrEqual(16383);
        }
        // Already-small originals may be retained losslessly; *new* objects must
        // use the generator's versioned content-hash immutable key, not overwrite.
        if (image!.src !== source) {
          expect(url.pathname).toMatch(/^\/miban-shebei\/optimized-images\/v1\/[a-f0-9]{20}-\d+w\.webp$/);
          expect(Number(url.pathname.match(/-(\d+)w\.webp$/)![1])).toBe(image!.width);
        } else {
          expect(image).toMatchObject({ width: asset.width, height: asset.height, bytes: asset.bytes });
        }
      }
    }
  });
  it("validates alpha metadata only when actually present; never invents absent manifest fields", () => {
    for (const asset of Object.values(mibanImageAssets)) {
      const original = asset as MibanImageAsset & { hasAlpha?: boolean };
      if ("hasAlpha" in original) expect(typeof original.hasAlpha).toBe("boolean");
      for (const image of Object.values(asset.variants)) {
        if (image && "hasAlpha" in image) {
          expect(typeof image.hasAlpha).toBe("boolean");
          if (original.hasAlpha === true) expect(image.hasAlpha).toBe(true);
        }
      }
    }
    const script = read("../scripts/miban-optimize-images.ts");
    expect(script).toMatch(/\.webp\(\{[^}]*alphaQuality:\s*100/);
    expect(script).not.toMatch(/\.(flatten|removeAlpha)\s*\(/);
  });
});

const MIGRATED_PAGES = [
  "AdminPanel", "DiyWorkshop", "HerbalifeRedGinsengDetail", "Home", "LimitedBrandProducts",
  "LimitedProductCart", "LimitedProductsPanel", "LimitedSale", "MidaniangOrganicMark",
  "MidaniangSelection", "MidaniangSelectionDetail", "MyOrders", "MyRecipes", "NavBar",
  "ReviewPage", "RiceEncyclopedia", "SeasonalFruitSelection", "TianguiPearDetail", "UnifiedAdmin",
];
describe("page image migration and first-screen policy", () => {
  it("migrates all 19 image-bearing pages and leaves native img only inside MibanImage", () => {
    expect(MIGRATED_PAGES).toHaveLength(19);
    for (const name of MIGRATED_PAGES) {
      const file = parse(name);
      expect(images(file), name).not.toHaveLength(0);
      expect(images(file, "img"), name).toHaveLength(0);
    }
    for (const name of readdirSync(new URL("../client/src/pages/miban/", import.meta.url)).filter(name => name.endsWith(".tsx") && name !== "MibanImage.tsx")) {
      expect(images(parse(name.slice(0, -4)), "img"), name).toHaveLength(0);
    }
    expect(images(parse("MibanImage"), "img")).toHaveLength(1);
  });
  it.each(["herbalife", "tuoquetang", "lingchuang", "fruits", "midaniang"])("actually prioritizes %s when real ranking data puts it first, rather than a fixed brand", slug => {
    boundary.attention = ["herbalife", "tuoquetang", "lingchuang", "fruits", "midaniang"].map(brandSlug => ({ brandSlug, viewCount: brandSlug === slug ? 100 : 0 }));
    const tree = LimitedSale();
    const cards = findElements(tree, node => Boolean(node.props["data-brand-slug"]));
    expect(cards[0].props["data-brand-slug"]).toBe(slug);
    const priority = findElements(tree, node => node.type === MibanImage && node.props.priority === true);
    expect(priority).toHaveLength(1);
    expect(findElements(cards[0], node => node.type === MibanImage)).toContain(priority[0]);
    const markup = renderToStaticMarkup(React.createElement(Router, { ssrPath: "/p/proj_hzxm2t/limited" }, tree));
    // React 19 may also emit a preload link; count the actual image, not that hint.
    const imgTags = markup.match(/<img\b[^>]*>/g) ?? [];
    expect(imgTags.filter(tag => tag.includes('fetchPriority="high"'))).toHaveLength(1);
    expect(imgTags.filter(tag => tag.includes('loading="eager"'))).toHaveLength(1);
    expect(boundary.mutateAsync).not.toHaveBeenCalled();
  });
  it("preserves deterministic brand-order ties and does not count SSR mounts as clicks", () => {
    boundary.attention = [];
    const cards = findElements(LimitedSale(), node => Boolean(node.props["data-brand-slug"]));
    expect(cards.map(node => node.props["data-brand-slug"])).toEqual(["herbalife", "tuoquetang", "lingchuang", "fruits", "midaniang"]);
    expect(boundary.mutateAsync).not.toHaveBeenCalled();
  });
  it("uses identical thumbnail URLs for actual midaniang blurred backgrounds and foreground images", () => {
    const markup = renderToStaticMarkup(React.createElement(Router, { ssrPath: "/p/proj_hzxm2t/limited/midaniang" }, React.createElement(MidaniangSelection)));
    for (const src of Object.values(midaniangSelectionAssets.grid)) {
      const mapped = getMibanImageSource(src, "thumbnail")!;
      expect(markup).toContain(`background-image:url(&quot;${mapped}&quot;)`);
      expect(markup).toContain(`src="${mapped}"`);
    }
    const file = parse("MidaniangSelection");
    const gridImages = images(file).filter(node => attribute(node, "src", file)?.includes(".grid["));
    expect(gridImages).toHaveLength(1);
    expect(attribute(gridImages[0], "variant", file)).toBe("thumbnail");
    expect(pageSource("MidaniangSelection")).toContain('getMibanImageSource(midaniangSelectionAssets.grid[item.key], "thumbnail")');
  });
  it.each(["MidaniangSelectionDetail", "HerbalifeRedGinsengDetail", "TianguiPearDetail"])("keeps below-fold %s posters lazy and never priority/eager", name => {
    const file = parse(name);
    const posters = images(file).filter(node => attribute(node, "variant", file) === "poster");
    expect(posters.length).toBeGreaterThan(0);
    for (const poster of posters) {
      expect(attribute(poster, "loading", file)).toBe("lazy");
      expect(attribute(poster, "priority", file)).toBeUndefined();
      expect(attribute(poster, "decoding", file) ?? "async").toBe("async");
    }
  });
  it("preconnects to the original COS bucket without redirecting the asset host", () => {
    const html = read("../client/index.html");
    for (const relation of ["dns-prefetch", "preconnect"]) {
      expect(html).toContain(`<link rel="${relation}" href="${COS_ORIGIN}"`);
    }
  });
});

describe("lazy routes keep identity, wallet and cart business protections", () => {
  it("declares exactly 20 lazy page modules, with no eager imports for those pages", () => {
    const file = parse("MibanApp");
    const declarations = walk(file, node => ts.isVariableDeclaration(node) && Boolean(node.initializer && ts.isCallExpression(node.initializer) && node.initializer.expression.getText(file) === "lazy")) as ts.VariableDeclaration[];
    const expected = ["Home", "RiceEncyclopedia", "RiceDetail", "DiyWorkshop", "LimitedSale", "AiHealth", "PresetRecipes", "MyRecipes", "MyOrders", "UnifiedAdmin", "MibanWallet", "JoinPage", "BrandAssets", "TianguiPearDetail", "ReviewPage", "HerbalifeRedGinsengDetail", "LimitedBrandProducts", "SeasonalFruitSelection", "MidaniangSelection", "MidaniangSelectionDetail"];
    expect(declarations.map(node => node.name.getText(file)).sort()).toEqual([...expected].sort());
    for (const declaration of declarations) {
      const calls = walk(declaration, node => ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) as ts.CallExpression[];
      expect(calls).toHaveLength(1);
      expect((calls[0].arguments[0] as ts.StringLiteral).text).toBe(`./${declaration.name.getText(file)}`);
    }
    const eager = file.statements.filter(ts.isImportDeclaration).map(node => (node.moduleSpecifier as ts.StringLiteral).text);
    for (const name of expected) expect(eager).not.toContain(`./${name}`);
    const routes = images(file, "Route");
    for (const route of routes) expect(expected).toContain(attribute(route, "component", file));
    expect(images(file, "Suspense").length).toBeGreaterThanOrEqual(2);
    expect(images(file, "LimitedProductCartProvider")).toHaveLength(1);
  });
  it("retains the initial not-ready identity gate before wallet or cart mounting and forces current auth", () => {
    const source = pageSource("MibanApp");
    expect(source).toContain("const [ready, setReady] = useState(false)");
    expect(source).toContain("utils.auth.me.fetch(undefined, { staleTime: 0, retry: false })");
    expect(source).toContain("prepareMibanPersonalQueries(queryClient, fetchCurrentUser.current)");
    expect(source).toMatch(/\.then\(\(\) => \{ if \(mounted\) setReady\(true\); \}\)/);
    expect(source).toMatch(/\.catch\(\(\) => \{ if \(mounted\) setIdentityError\(true\); \}\)/);
    expect(source.indexOf("if (!ready) return")).toBeLessThan(source.indexOf("if (location === `${BASE}/wallet`)"));
    expect(source.indexOf("if (!ready) return")).toBeLessThan(source.indexOf("<LimitedProductCartProvider>"));
    expect(source).toContain("本人账户读取失败，请重试");
    expect(source).toContain("mounted = false");
  });
  it("keeps current-user wallet query cleanup and the original complete Wallet behind its own ready gate", () => {
    const source = pageSource("MibanWallet");
    expect(source).toContain("clearLedgerViewAsState()");
    expect(source).toContain("queryClient.cancelQueries({ predicate })");
    expect(source).toContain("queryClient.removeQueries({ predicate })");
    expect(source).toContain('route[0] === "recharge"');
    expect(source).toContain('route[1] === "afGetMyRechargeHistory"');
    expect(source.indexOf("queryClient.removeQueries")).toBeLessThan(source.indexOf("setReady(true)"));
    expect(source.indexOf("if (!ready) return")).toBeLessThan(source.indexOf('<Wallet appearance="miban" />'));
    expect(source).toContain('import Wallet from "../Wallet"');
    const scope = read("../client/src/lib/miban-wallet-query-scope.ts");
    expect(scope.indexOf("await queryClient.cancelQueries")).toBeLessThan(scope.indexOf("queryClient.removeQueries"));
    expect(scope).toContain("isMibanPersonalQuery(query) && !isAuthMeQuery(query)");
    expect(scope).toContain("await fetchCurrentUser()");
  });
  it("retains signed-quote cart payload, auth/address/pending/payment guards and success-only clearing", () => {
    const source = pageSource("LimitedProductCart");
    const file = parse("LimitedProductCart", source);
    const calls = walk(file, node => ts.isCallExpression(node) && node.expression.getText(file) === "createOrder.mutate") as ts.CallExpression[];
    expect(calls).toHaveLength(1);
    const payload = calls[0].arguments[0] as ts.ObjectLiteralExpression;
    const fields = payload.properties.filter(ts.isPropertyAssignment);
    expect(fields.map(node => node.name.getText(file)).sort()).toEqual(["items", "receiverName", "receiverPhone", "receiverAddress", "userNote", "cnyAmount", "paymentAssets", "paymentQuoteToken"].sort());
    for (const name of ["cnyAmount", "paymentAssets", "paymentQuoteToken"]) {
      expect(fields.find(node => node.name.getText(file) === name)?.initializer.getText(file)).toBe(`payment.${name}`);
    }
    const handlePay = walk(file, node => ts.isVariableDeclaration(node) && node.name.getText(file) === "handlePay")[0];
    const pay = handlePay.getText(file);
    for (const guard of ["if (createOrder.isPending) return", "if (!selectedAddress)", "if (receiverPhoneError)", "if (!payment.canPay)"]) {
      expect(pay).toContain(guard);
      expect(pay.indexOf(guard)).toBeLessThan(pay.indexOf("createOrder.mutate"));
    }
    expect(source).toContain("if (authLoading) return");
    expect(source).toContain("if (!isAuthenticated)");
    expect(source).toContain("useMibanMixedPayment(totalCny, open && isAuthenticated)");
    const hooks = walk(file, node => ts.isCallExpression(node) && node.expression.getText(file) === "mtrpc.limitedProduct.createCartOrder.useMutation") as ts.CallExpression[];
    expect(hooks).toHaveLength(1);
    const options = hooks[0].arguments[0] as ts.ObjectLiteralExpression;
    for (const name of ["onSuccess", "onError"]) {
      const handler = options.properties.find(node => ts.isPropertyAssignment(node) && node.name.getText(file) === name)!;
      expect(walk(handler, node => ts.isCallExpression(node) && node.expression.getText(file) === "clearCart")).toHaveLength(name === "onSuccess" ? 1 : 0);
    }
    expect(source).toContain("setSuccess(data)");
    const payment = pageSource("MibanMixedPayment");
    expect(payment).toContain("const canPay = ready && plan.canPay && reviewed");
    expect(payment).toContain("Date.now() < expires");
    expect(payment).toContain('paymentQuoteToken: ready ? liveQuote!.quoteToken : ""');
  });
});

describe("optimizer script is public-assets-only and preserves source objects", () => {
  it("imports no database, API bootstrap or business write modules and embeds no credentials", () => {
    const source = read("../scripts/miban-optimize-images.ts");
    const file = parse("optimizer", source);
    const imports = file.statements.filter(ts.isImportDeclaration).map(node => (node.moduleSpecifier as ts.StringLiteral).text);
    expect(imports.sort()).toEqual(["node:fs/promises", "node:path", "node:crypto", "cos-nodejs-sdk-v5", "sharp", "../shared/miban-limited-products", "../shared/midaniang-selection-assets", "../shared/miban-image-assets"].sort());
    expect(source).not.toMatch(/\b(getDb|createConnection|createPool|drizzle|appRouter|DATABASE_URL)\b/);
    expect(source).not.toMatch(/\b(?:db|connection|pool)\s*\.\s*(?:insert|update|delete|execute|query)\s*\(/);
    expect(source).not.toMatch(/\b(?:INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|ALTER\s+TABLE)\b/i);
    // A failed secret scan must report only a boolean, never echo the secret.
    expect(/AKID[A-Za-z0-9]{12,}|gh[pousr]_[A-Za-z0-9]{20,}|mysql:\/\//.test(source)).toBe(false);
    const credentials = walk(file, node => ts.isPropertyAssignment(node) && /^(SecretId|SecretKey)$/.test(node.name.getText(file))) as ts.PropertyAssignment[];
    expect(credentials.length).toBeGreaterThan(0);
    for (const property of credentials) expect(ts.isStringLiteral(property.initializer)).toBe(false);
    expect(source).toContain("process.env.COS_SECRET_ID");
    expect(source).toContain("process.env.COS_SECRET_KEY");
    const logs = walk(file, node => ts.isCallExpression(node) && /^console\.(log|warn|error)$/.test(node.expression.getText(file)));
    for (const log of logs) expect(log.getText(file)).not.toMatch(/\b(credential|SecretId|SecretKey|COS_SECRET_ID|COS_SECRET_KEY)\b/);
  });
  it("uploads only new content-hash keys with immutable WebP metadata, no deletes/copies or originals writes", () => {
    const source = read("../scripts/miban-optimize-images.ts");
    const file = parse("optimizer", source);
    const cosCalls = walk(file, node => ts.isCallExpression(node) && node.expression.getText(file).startsWith("cos.")) as ts.CallExpression[];
    expect(cosCalls.map(node => node.expression.getText(file))).toEqual(["cos.sliceUploadFile", "cos.putObject"]);
    expect(source).toContain('crypto.createHash("sha256")');
    expect(source).toContain('`miban-shebei/optimized-images/v1/${digest.slice(0, 20)}-${width}w.webp`');
    expect(source).toContain('ContentType: "image/webp", CacheControl: "public, max-age=31536000, immutable"');
    expect(source).toContain("withoutEnlargement: true");
    expect(source).toContain("(metadata.pages ?? 1) > 1");
    expect(source).toContain("const received = Buffer.from(await response.arrayBuffer())");
    expect(source).toContain("sha(received) !== digest");
    expect(source).toContain('response.headers.get("cache-control")');
    expect(source).not.toMatch(/\b(?:fs\.)?(unlink|rm|truncate)\s*\(|\.deleteObject\s*\(|\.copyObject\s*\(/);
    const writes = walk(file, node => ts.isCallExpression(node) && node.expression.getText(file) === "fs.writeFile") as ts.CallExpression[];
    for (const call of writes) {
      const target = call.arguments[0].getText(file);
      if (target === "cached") {
        const declaration = walk(file, node => ts.isVariableDeclaration(node) && node.name.getText(file) === "cached")[0] as ts.VariableDeclaration;
        expect(declaration.initializer?.getText(file)).toMatch(/^path\.join\(outDir, /);
      } else {
        expect(target).toMatch(/^path\.join\((?:outDir|root, "shared\/miban-image-assets\.ts")/);
        expect(target).not.toMatch(/source|client\/public/);
      }
    }
    const renames = walk(file, node => ts.isCallExpression(node) && node.expression.getText(file) === "fs.rename") as ts.CallExpression[];
    for (const call of renames) {
      // Atomic checkpoint replacement is allowed only inside generated output.
      // Worker count, cache/checkpoint naming and write counts are not business rules.
      for (const argument of call.arguments) {
        expect(argument.getText(file)).toMatch(/^path\.join\(outDir, /);
      }
    }
    expect(source).toContain('value.startsWith(cosBase + "/")');
    expect(source).toContain('value.startsWith("/miban-")');
    expect(source).toContain('payment-proofs|recharge-proofs|reimbursement-vouchers|ledger-photos|avatars|miban-reviews');
    expect(source).toContain('path.resolve(publicRoot, `.${value}`).startsWith(publicRoot + path.sep)');
    expect(source).toContain('args.includes("--refresh") ? []');
    expect(source).toContain('requiredVariants(source).every(variant => assets[source].variants[variant])');
  });
});

describe("actual COS upload helpers with offline SDK: cache scope never includes private ziding", () => {
  let upload: typeof import("./cos-upload");
  let tinyPng: Buffer;
  beforeAll(async () => {
    // Deliberately fake credentials for this isolated constructor; never real secrets.
    vi.stubEnv("COS_SECRET_ID", "offline-unit-id");
    vi.stubEnv("COS_SECRET_KEY", "offline-unit-key");
    upload = await import("./cos-upload");
    tinyPng = await sharp({ create: { width: 2, height: 2, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
  });
  beforeEach(() => { vi.spyOn(console, "log").mockImplementation(() => undefined); });
  afterAll(() => { vi.unstubAllEnvs(); });

  it("adds one-year immutable cache only to uniquely named public miban review uploads", async () => {
    await upload.uploadImageToCOS(tinyPng, "miban-reviews");
    const params = boundary.putObject.mock.calls[0][0];
    expect(params.CacheControl).toBe("public, max-age=31536000, immutable");
    expect(params.Key).toMatch(/^miban-reviews\/\d+-[a-f0-9]+\.jpeg$/);
  });
  it("does not cache a custom review filename which could overwrite a previous object", async () => {
    await upload.uploadImageToCOS(tinyPng, "miban-reviews", "miban-reviews/fixed-name.png");
    const params = boundary.putObject.mock.calls[0][0];
    expect(params.Key).toBe("miban-reviews/fixed-name.png");
    expect(params).not.toHaveProperty("CacheControl");
  });
  it.each(["avatars", "ledger-photos", "payment-qrcodes", "reimbursement-vouchers", "recharge-proofs"] as const)("does not give unrelated/private %s images public immutable caching", async folder => {
    await upload.uploadImageToCOS(tinyPng, folder);
    expect(boundary.putObject.mock.calls[0][0]).not.toHaveProperty("CacheControl");
  });
  it("caches uniquely timestamped assets/miban files without broad prefix matching", async () => {
    await upload.uploadFileToCOS(Buffer.from("unit-file"), "assets/miban", "unit.webp", "image/webp");
    expect(boundary.putObject.mock.calls[0][0]).toMatchObject({ CacheControl: "public, max-age=31536000, immutable", ContentType: "image/webp" });
    expect(boundary.putObject.mock.calls[0][0].Key).toMatch(/^assets\/miban\/\d+-unit\.webp$/);
    for (const folder of ["assets/miban-private", "assets/miban/subfolder", "ziding-commercial-alliance/payment-proofs/v1", "recharge-proofs"]) {
      await upload.uploadFileToCOS(Buffer.from("unit-file"), folder, "unit.webp", "image/webp");
      expect(boundary.putObject.mock.calls.at(-1)![0]).not.toHaveProperty("CacheControl");
    }
  });
  it("actual ziding proof upload keeps private ACL / no-store and returns only an object key", async () => {
    const result = await upload.uploadPrivateZidingPaymentProof({ imageData: `data:image/png;base64,${tinyPng.toString("base64")}`, orderId: 17, ownerUserId: 23 });
    const params = boundary.putObject.mock.calls[0][0];
    expect(params.ACL).toBe("private");
    expect(params.CacheControl).toBe("private, no-store");
    expect(params.Key).toMatch(/^ziding-commercial-alliance\/payment-proofs\/v1\/order\/17\/user\/23\/[a-f0-9-]+\.webp$/);
    expect(result.objectKey).toBe(params.Key);
    expect(result).not.toHaveProperty("url");
    expect(result.byteSize).toBeGreaterThan(0);
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
  });
  it("retains short-lived signed private previews, prefix validation and expiry clamp", async () => {
    const objectKey = "ziding-commercial-alliance/payment-proofs/v1/order/17/user/23/unit.webp";
    await upload.createZidingPaymentProofViewUrl(objectKey, 31536000);
    expect(boundary.getObjectUrl.mock.calls[0][0]).toMatchObject({ Key: objectKey, Sign: true, Method: "GET", Expires: 300 });
    await upload.createZidingPaymentProofViewUrl(objectKey, 1);
    expect(boundary.getObjectUrl.mock.calls[1][0].Expires).toBe(60);
    await expect(upload.createZidingPaymentProofViewUrl("assets/miban/public.webp")).rejects.toThrow("非法的付款凭证对象键");
    expect(boundary.getObjectUrl).toHaveBeenCalledTimes(2);
  });
});
