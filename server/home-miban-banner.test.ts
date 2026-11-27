import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mibanImageAssets } from "../shared/miban-image-assets";

const home = readFileSync(new URL("../client/src/pages/Home.tsx", import.meta.url), "utf8");
const banner = home.split('key="p0-miban"')[1]?.split("// 页1：")[0] ?? "";
const original = "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/miban/home-posters/miban-fine-linen-1862f21234d5921a5b67.webp";

describe("global home approved fine-linen Miban banner (offline)", () => {
  it("uses the approved poster through the shared image component", () => {
    expect(home).toContain('import { MibanImage } from "@/pages/miban/MibanImage"');
    expect(banner).toContain("<MibanImage");
    expect(banner).toContain(`src="${original}"`);
    expect(banner).toContain('alt="米伴·米与杂粮"');
    expect(banner).not.toContain("miban-flagship-banner.webp");
    expect(banner).not.toContain("我的饭碗我做主");
  });

  it("uses the verified 960px derivative with a stable 4:3 size and first-screen priority", () => {
    expect(banner).toContain('variant="card"');
    expect(banner).toMatch(/\n\s+priority\s*\n/);
    expect(banner).toContain("width={960}");
    expect(banner).toContain("height={720}");
    const asset = mibanImageAssets[original];
    expect(asset).toMatchObject({ original, width: 2368, height: 1776 });
    expect(asset.variants.card).toMatchObject({ width: 960, height: 720, bytes: 87130 });
    expect(asset.variants.card?.src).toMatch(/\/miban-shebei\/optimized-images\/v1\/[a-f0-9]{20}-960w\.webp$/);
    expect(asset.variants.card!.bytes).toBeLessThan(asset.bytes);
  });

  it("preserves the original Miban destination, cover framing and refresh button", () => {
    expect(home).toContain("const MIBAN_HOME_PATH = '/p/proj_hzxm2t/';");
    expect(banner).toContain("onClick={() => navigate(MIBAN_HOME_PATH)}");
    expect(banner).toContain("objectFit: 'cover', objectPosition: 'left top'");
    expect(banner).toContain("e.stopPropagation(); window.location.reload();");
  });
});
