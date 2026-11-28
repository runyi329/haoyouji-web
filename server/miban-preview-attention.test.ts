import { readFileSync } from "node:fs";
import React, { type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Link, Router } from "wouter";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

// Offline test boundary only. Production cards use the real tRPC procedures;
// no fixture data, fake counts or fake transport is added to the application.
const boundary = vi.hoisted(() => ({
  cache: undefined as { brandSlug: string; viewCount: number }[] | undefined,
  mutateAsync: vi.fn(),
  invalidate: vi.fn(),
  setData: vi.fn(),
  toast: vi.fn(),
}));
vi.mock("../client/src/pages/miban/mibanTrpc", () => ({
  mtrpc: {
    useUtils: () => ({ limitedProduct: { brandAttention: {
      setData: boundary.setData, invalidate: boundary.invalidate,
    } } }),
    limitedProduct: {
      brandAttention: { useQuery: () => ({ data: boundary.cache }) },
      recordBrandAttention: { useMutation: () => ({ mutateAsync: boundary.mutateAsync }) },
    },
  },
}));
vi.mock("sonner", () => ({ toast: { info: boundary.toast } }));
import LimitedSale from "../client/src/pages/miban/LimitedSale";
import { mibanLimitedAttentionSlugs } from "../shared/miban-limited-brand-config";

const expectedSlugs = [
  "herbalife", "tuoquetang", "lingchuang", "fruits", "midaniang", "wangka",
  "spain", "guizhou", "amway", "marykay", "nuskin", "jianghai",
];
const navigationSlugs = ["herbalife", "tuoquetang", "lingchuang", "fruits", "midaniang", "wangka", "spain", "guizhou", "amway", "marykay", "nuskin"];
const navigationHref = (slug: string) => `/p/proj_hzxm2t/limited/${slug === "guizhou" ? "moutai-feitian" : slug}`;
const previewMessages: Record<string, string> = {
  jianghai: "江海鲜选商品尚未上架，敬请期待。",
};
function expand(node: unknown): ReactElement<any>[] {
  if (Array.isArray(node)) return node.flatMap(expand);
  if (!React.isValidElement(node)) return [];
  const el = node as ReactElement<any>;
  if (typeof el.type === "function" &&
      (/PreviewCard$/.test(el.type.name) || el.type.name === "AttentionCount" || el.type.name === "WangkaBrandCard")) {
    return expand((el.type as (props: any) => ReactElement)(el.props));
  }
  return [el, ...expand(el.props.children)];
}
function cardFor(slug: string) {
  const cards = expand(LimitedSale()).filter(el => el.props["data-testid"] === `brand-card-${slug}`);
  expect(cards, `${slug} must have one card`).toHaveLength(1);
  return cards[0];
}
function ctaFor(slug: string, card = cardFor(slug)) {
  const ctas = expand(card).filter(el => el.props["data-testid"] === `brand-cta-${slug}`);
  expect(ctas, `${slug} must have one CTA inside its card`).toHaveLength(1);
  return ctas[0];
}
const markupFor = (node: ReactElement) => renderToStaticMarkup(
  React.createElement(Router, { ssrPath: "/p/proj_hzxm2t/limited" }, node),
);
const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };

beforeEach(() => {
  vi.stubGlobal("React", React);
  let sequence = 0;
  vi.stubGlobal("crypto", { randomUUID: () => `11111111-1111-4111-8111-${String(++sequence).padStart(12, "0")}` });
  boundary.cache = mibanLimitedAttentionSlugs.map(brandSlug => ({ brandSlug, viewCount: 0 }));
  boundary.mutateAsync.mockReset().mockImplementation(async ({ brandSlug }) => {
    const current = boundary.cache?.find(row => row.brandSlug === brandSlug)?.viewCount ?? 0;
    return { brandSlug, viewCount: current + 1, counted: true };
  });
  boundary.setData.mockReset().mockImplementation((_input, update) => { boundary.cache = update(boundary.cache); });
  boundary.invalidate.mockReset().mockResolvedValue(undefined);
  boundary.toast.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe("all limited brand cards record attention only through their CTA", () => {
  it("renders all 12 series with one right-bottom counter and one CTA each, without counting renders", () => {
    expect([...mibanLimitedAttentionSlugs]).toEqual(expectedSlugs);
    const html = markupFor(React.createElement(LimitedSale));
    for (const slug of expectedSlugs) {
      expect(html.match(new RegExp(`data-testid="brand-card-${slug}"`, "g")), slug).toHaveLength(1);
      expect(html.match(new RegExp(`data-testid="brand-cta-${slug}"`, "g")), slug).toHaveLength(1);
      expect(html.match(new RegExp(`data-testid="${slug}-attention"`, "g")), slug).toHaveLength(1);
    }
    markupFor(React.createElement(LimitedSale));
    expect(boundary.mutateAsync).not.toHaveBeenCalled();
    expect(boundary.toast).not.toHaveBeenCalled();
    expect(html).toContain("关注 +0");
    expect(html).toContain("查看江海鲜选");
    expect(html).toContain("jianghai-fresh-selection-stage-v13.webp");
    expect(html).toContain("spain-bodega-stage-v1.webp");
    expect(html).toContain("查看西班牙精选");
  });

  it("keeps SpainSelectionPreviewCard once, fixed immediately after Guizhou even when attention changes", () => {
    const source = readFileSync(new URL("../client/src/pages/miban/LimitedSale.tsx", import.meta.url), "utf8");
    expect(source).toContain("function SpainSelectionPreviewCard(");
    expect(source.match(/<SpainSelectionPreviewCard\b/g)).toHaveLength(1);
    expect(source).not.toContain("西班牙精选商品尚未上架，敬请期待。");
    for (const counts of [{ spain: 999, guizhou: 1 }, { spain: 1, guizhou: 999 }]) {
      boundary.cache = expectedSlugs.map(brandSlug => ({
        brandSlug, viewCount: brandSlug === "spain" ? counts.spain : brandSlug === "guizhou" ? counts.guizhou : 50,
      }));
      const cards = expand(LimitedSale()).filter(el => el.props["data-brand-slug"]);
      const order = cards.map(el => el.props["data-brand-slug"]);
      expect(order).toHaveLength(expectedSlugs.length);
      expect(new Set(order).size).toBe(expectedSlugs.length);
      expect(order.slice(0, 2)).toEqual(["guizhou", "spain"]);
      expect(boundary.mutateAsync).not.toHaveBeenCalled();
      expect(boundary.toast).not.toHaveBeenCalled();
    }
  });

  it("spainLink navigates to the real series and counts only its CTA, never the old unlisted toast", async () => {
    const spainLink = ctaFor("spain");
    expect(spainLink.type).toBe(Link);
    expect(spainLink.props.href).toBe("/p/proj_hzxm2t/limited/spain");
    const event = { preventDefault: vi.fn(), stopPropagation: vi.fn() };
    spainLink.props.onClick(event);
    await flush();
    expect(boundary.mutateAsync).toHaveBeenCalledTimes(1);
    expect(boundary.mutateAsync).toHaveBeenCalledWith({
      brandSlug: "spain", eventId: "11111111-1111-4111-8111-000000000001",
    });
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(event.stopPropagation).not.toHaveBeenCalled();
    expect(boundary.toast).not.toHaveBeenCalled();
  });

  it("uses the same 68px icon and layout classes as Midaniang, with a separate photo background", () => {
    const spain = cardFor("spain");
    const flag = expand(spain).find(node => node.props["data-testid"] === "spain-selection-flag")!;
    const stage = expand(spain).find(node => node.props["data-testid"] === "spain-selection-stage")!;
    expect(flag.props.className).toBe("h-[68px] w-[68px] shrink-0 object-contain");
    expect(flag.props.src).toBe("/miban-spain/spain-flag-r1.webp");
    expect(stage.props.src).toBe("/miban-spain/spain-bodega-stage-v1.webp");
    const spainTitle = expand(spain).find(node => node.type === "h3")!;
    const riceTitle = expand(cardFor("midaniang")).find(node => node.type === "h3")!;
    for (const token of ["mt-1.5", "text-[clamp(18px,5.8vw,23px)]", "font-extrabold", "leading-tight"]) {
      expect(spainTitle.props.className).toContain(token);
      expect(riceTitle.props.className).toContain(token);
    }
  });

  it.each(expectedSlugs)("a missing %s row remains unknown while other real values are displayed", slug => {
    boundary.cache = expectedSlugs.filter(brandSlug => brandSlug !== slug).map(brandSlug => ({ brandSlug, viewCount: 27 }));
    const html = markupFor(React.createElement(LimitedSale));
    const missing = expand(cardFor(slug)).find(el => el.props["data-testid"] === `${slug}-attention`)!;
    expect(missing.props["data-view-count"]).toBe("unavailable");
    expect(html.match(/关注 --/g)).toHaveLength(1);
    expect(html.match(/关注 \+27/g)).toHaveLength(expectedSlugs.length - 1);
    expect(html).not.toContain("关注 +0");
    expect(boundary.mutateAsync).not.toHaveBeenCalled();
  });

  it("an empty completed GET never fabricates twelve zero values", () => {
    boundary.cache = [];
    const html = markupFor(React.createElement(LimitedSale));
    expect(html.match(/关注 --/g)).toHaveLength(expectedSlugs.length);
    expect(html).not.toContain("关注 +0");
    expect(boundary.mutateAsync).not.toHaveBeenCalled();
  });

  it.each(expectedSlugs)("%s is a noninteractive article with exactly one native Link/button CTA", slug => {
    const card = cardFor(slug);
    const cta = ctaFor(slug, card);
    expect(card.type).toBe("article");
    expect(card.props["data-brand-slug"]).toBe(slug);
    expect(card.props.href).toBeUndefined();
    for (const node of expand(card)) {
      // Card, image, copy and counter must not own click or keyboard activation.
      expect(node.props.onKeyDown).toBeUndefined();
      expect(node.props.role).not.toBe("button");
      expect(node.props.tabIndex).toBeUndefined();
      if (node !== cta) expect(node.props.onClick).toBeUndefined();
    }
    const interactive = expand(card).filter(node => node.type === Link || node.type === "a" || node.type === "button");
    expect(interactive).toEqual([cta]);
    expect(cta.props.onClick).toEqual(expect.any(Function));
    const html = markupFor(card);
    if (navigationSlugs.includes(slug)) {
      expect(cta.type).toBe(Link);
      expect(cta.props.href).toBe(navigationHref(slug));
      expect(html).toMatch(new RegExp(`<a\\b[^>]*data-testid="brand-cta-${slug}"`));
      expect(html).toContain(`href="${navigationHref(slug)}"`);
    } else {
      expect(cta.type).toBe("button");
      expect(cta.props.type).toBe("button");
      expect(cta.props.href).toBeUndefined();
      expect(html).toMatch(new RegExp(`<button\\b[^>]*data-testid="brand-cta-${slug}"`));
    }
    // Native keyboard activation is exercised in the browser, not synthesized
    // by calling a parent onKeyDown from this offline React-element boundary.
    expect(boundary.mutateAsync).not.toHaveBeenCalled();
    expect(boundary.toast).not.toHaveBeenCalled();
  });

  it.each(expectedSlugs)("one real %s CTA click records exactly one event and updates only its count", async slug => {
    const cta = ctaFor(slug);
    expect(boundary.mutateAsync).not.toHaveBeenCalled();
    cta.props.onClick();
    expect(boundary.mutateAsync).toHaveBeenCalledTimes(1);
    expect(boundary.mutateAsync).toHaveBeenCalledWith({
      brandSlug: slug, eventId: "11111111-1111-4111-8111-000000000001",
    });
    await flush();
    expect(boundary.cache?.find(row => row.brandSlug === slug)?.viewCount).toBe(1);
    expect(boundary.cache?.filter(row => row.brandSlug !== slug).every(row => row.viewCount === 0)).toBe(true);
    const counter = expand(cardFor(slug)).find(el => el.props["data-testid"] === `${slug}-attention`)!;
    expect(counter.props["data-view-count"]).toBe("1");
    expect(boundary.setData).toHaveBeenCalledTimes(1);
    expect(boundary.invalidate).toHaveBeenCalledTimes(1);
    if (previewMessages[slug]) {
      expect(boundary.toast).toHaveBeenCalledTimes(1);
      expect(boundary.toast).toHaveBeenCalledWith(previewMessages[slug]);
    } else {
      expect(boundary.toast).not.toHaveBeenCalled();
    }
  });

  it.each(expectedSlugs)("two separate %s CTA clicks use different UUIDs and accumulate twice", async slug => {
    ctaFor(slug).props.onClick();
    await flush();
    ctaFor(slug).props.onClick();
    await flush();
    expect(boundary.mutateAsync).toHaveBeenCalledTimes(2);
    const inputs = boundary.mutateAsync.mock.calls.map(call => call[0]);
    expect(inputs.map(input => input.brandSlug)).toEqual([slug, slug]);
    expect(inputs.map(input => input.eventId)).toEqual([
      "11111111-1111-4111-8111-000000000001",
      "11111111-1111-4111-8111-000000000002",
    ]);
    expect(inputs[0].eventId).not.toBe(inputs[1].eventId);
    expect(boundary.cache?.find(row => row.brandSlug === slug)?.viewCount).toBe(2);
  });

  it.each(expectedSlugs)("%s frame retains w-full/min-w-0 despite its minimum height", slug => {
    const card = cardFor(slug);
    expect(card.type).toBe("article");
    expect(card.props.className.split(/\s+/)).toContain("w-full");
    expect(card.props.className.split(/\s+/)).toContain("min-w-0");
  });

  it("unknown data stays unavailable, even when a CTA event succeeds before the GET", async () => {
    boundary.cache = undefined;
    const html = markupFor(React.createElement(LimitedSale));
    expect(html.match(/关注 --/g)).toHaveLength(expectedSlugs.length);
    expect(html).not.toContain("关注 +0");
    for (const slug of expectedSlugs) {
      const counter = expand(cardFor(slug)).find(el => el.props["data-testid"] === `${slug}-attention`)!;
      expect(counter.props["data-view-count"]).toBe("unavailable");
    }
    expect(boundary.mutateAsync).not.toHaveBeenCalled();
    ctaFor("jianghai").props.onClick();
    await flush();
    expect(boundary.mutateAsync).toHaveBeenCalledTimes(1);
    expect(boundary.toast).toHaveBeenCalledWith(previewMessages.jianghai);
    expect(boundary.cache).toBeUndefined();
    expect(markupFor(React.createElement(LimitedSale)).match(/关注 --/g)).toHaveLength(expectedSlugs.length);
  });

  it.each(expectedSlugs)("failed %s statistics neither intercept navigation nor suppress the preview hint", async slug => {
    boundary.cache = undefined;
    boundary.mutateAsync.mockRejectedValue(new Error("offline statistic transport"));
    const cta = ctaFor(slug);
    const event = { preventDefault: vi.fn(), stopPropagation: vi.fn() };
    expect(() => cta.props.onClick(event)).not.toThrow();
    await flush();
    expect(boundary.mutateAsync).toHaveBeenCalledTimes(1);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(event.stopPropagation).not.toHaveBeenCalled();
    expect(boundary.cache).toBeUndefined();
    expect(boundary.setData).not.toHaveBeenCalled();
    expect(boundary.invalidate).not.toHaveBeenCalled();
    if (previewMessages[slug]) {
      expect(boundary.toast).toHaveBeenCalledTimes(1);
      expect(boundary.toast).toHaveBeenCalledWith(previewMessages[slug]);
    } else {
      expect(cta.type).toBe(Link);
      expect(cta.props.href).toBe(navigationHref(slug));
      expect(boundary.toast).not.toHaveBeenCalled();
    }
  });

  it.each(["herbalife", "guizhou", "spain", "jianghai"])("unavailable crypto for %s does not block navigation or the preview hint", slug => {
    vi.stubGlobal("crypto", { randomUUID: () => { throw new Error("offline crypto"); } });
    const cta = ctaFor(slug);
    const event = { preventDefault: vi.fn(), stopPropagation: vi.fn() };
    expect(() => cta.props.onClick(event)).not.toThrow();
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(event.stopPropagation).not.toHaveBeenCalled();
    expect(boundary.mutateAsync).not.toHaveBeenCalled();
    if (previewMessages[slug]) {
      expect(boundary.toast).toHaveBeenCalledTimes(1);
      expect(boundary.toast).toHaveBeenCalledWith(previewMessages[slug]);
    } else {
      expect(cta.props.href).toBe(navigationHref(slug));
      expect(boundary.toast).not.toHaveBeenCalled();
    }
  });
});
