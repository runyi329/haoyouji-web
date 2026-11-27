import React, { type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Router } from "wouter";
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

const previewSlugs = ["guizhou", "amway", "marykay", "nuskin", "jianghai"];
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
  return expand(LimitedSale()).find(el => el.props["data-testid"] === `brand-card-${slug}`)!;
}
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

describe("all limited preview cards share real attention recording", () => {
  it("renders one right-bottom counter for every displayed series and never counts rendering", () => {
    const html = renderToStaticMarkup(React.createElement(Router, { ssrPath: "/p/proj_hzxm2t/limited" }, React.createElement(LimitedSale)));
    for (const slug of mibanLimitedAttentionSlugs) {
      expect(html.match(new RegExp(`data-testid="${slug}-attention"`, "g")), slug).toHaveLength(1);
    }
    expect(boundary.mutateAsync).not.toHaveBeenCalled();
    expect(html).toContain("关注 +0");
    expect(html).toContain("查看江海鲜选");
    expect(html).toContain("jianghai-fresh-selection-stage-v13.webp");
  });

  it.each(previewSlugs)("a real %s card click records one event and updates the displayed count", async slug => {
    const card = cardFor(slug);
    expect(card).toBeTruthy();
    card.props.onClick();
    expect(boundary.mutateAsync).toHaveBeenCalledTimes(1);
    expect(boundary.mutateAsync).toHaveBeenCalledWith({
      brandSlug: slug, eventId: "11111111-1111-4111-8111-000000000001",
    });
    await flush();
    expect(boundary.cache?.find(row => row.brandSlug === slug)?.viewCount).toBe(1);
    const counter = expand(LimitedSale()).find(el => el.props["data-testid"] === `${slug}-attention`)!;
    expect(counter.props["data-view-count"]).toBe("1");
    expect(boundary.invalidate).toHaveBeenCalledTimes(1);
  });

  it.each(["amway", "marykay", "nuskin", "jianghai"])("%s CTA relies on one parent click, not two handlers", async slug => {
    const card = cardFor(slug);
    const button = expand(card).find(el => el.type === "button")!;
    expect(button.props.onClick).toBeUndefined();
    card.props.onClick(); // The native CTA click bubbles to this one parent handler.
    await flush();
    expect(boundary.mutateAsync).toHaveBeenCalledTimes(1);
    expect(boundary.toast).toHaveBeenCalledTimes(1);
  });

  it.each(["amway", "marykay", "nuskin", "jianghai"])("%s keyboard activation increments exactly once", async slug => {
    const card = cardFor(slug);
    const target = {};
    const preventDefault = vi.fn();
    card.props.onKeyDown({ target, currentTarget: target, key: "Enter", preventDefault });
    await flush();
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(boundary.mutateAsync).toHaveBeenCalledTimes(1);
    card.props.onKeyDown({ target: {}, currentTarget: target, key: "Enter", preventDefault });
    expect(boundary.mutateAsync).toHaveBeenCalledTimes(1); // Child button owns native click.
  });

  it("two separate clicks use different event UUIDs and accumulate twice", async () => {
    cardFor("jianghai").props.onClick();
    await flush();
    cardFor("jianghai").props.onClick();
    await flush();
    expect(boundary.mutateAsync).toHaveBeenCalledTimes(2);
    const inputs = boundary.mutateAsync.mock.calls.map(call => call[0]);
    expect(inputs[0].eventId).not.toBe(inputs[1].eventId);
    expect(boundary.cache?.find(row => row.brandSlug === "jianghai")?.viewCount).toBe(2);
  });

  it.each(mibanLimitedAttentionSlugs)("%s frame follows its grid width even when minimum height exceeds the desktop aspect ratio", slug => {
    const article = expand(cardFor(slug)).find(el => el.type === "article")!;
    expect(article.props.className.split(/\s+/)).toContain("w-full");
    expect(article.props.className.split(/\s+/)).toContain("min-w-0");
  });

  it("unknown data is not fabricated as zero and a failed statistic does not block a preview", async () => {
    boundary.cache = undefined;
    const html = renderToStaticMarkup(React.createElement(Router, { ssrPath: "/p/proj_hzxm2t/limited" }, React.createElement(LimitedSale)));
    expect(html).toContain("关注 --");
    boundary.mutateAsync.mockRejectedValue(new Error("offline statistic transport"));
    cardFor("jianghai").props.onClick();
    await flush();
    expect(boundary.toast).toHaveBeenCalledTimes(1);
    expect(boundary.cache).toBeUndefined();
  });
});
