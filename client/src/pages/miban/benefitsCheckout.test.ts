import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BenefitQuote, BenefitResult } from "../../../../shared/miban-benefits";

vi.mock("@/lib/trpc", () => ({ trpc: {} }));
vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => ({ user: null, isAuthenticated: false, loading: false }) }));
vi.mock("./mibanTrpc", () => ({ mtrpc: {} }));
import { benefitsNeedReconfirmation, benefitsResultHash, validBenefitsQuote, MibanBenefitsQuoteSummary, type BenefitsQuoteInput } from "./useMibanBenefitsQuote";
import { MyBenefitsList, myBenefitScopeText, type MyBenefitRule } from "./MyBenefits";
import { MibanCheckoutPaymentAmount } from "./MibanCheckoutPaymentAmount";
import { MibanCheckoutConfirmationDetails } from "./MibanCheckoutConfirmationDetails";
import { MibanPaymentConfirmation, type MibanMixedPayment } from "./MibanMixedPayment";

beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => vi.unstubAllGlobals());
const input: BenefitsQuoteInput = { storefront: "miban-limited", items: [{ productKey: "product", skuId: "sku", quantity: 2 }], mode: "once" };
const result: BenefitResult = { originalCents: 20000, totalCents: 18000, savedCents: 2000, summary: "本人折扣", consumedRuleIds: ["r1"], lines: [{ productKey: "product", skuId: "sku", quantity: 2, originalCents: 20000, totalCents: 18000, ruleId: "r1", ruleName: "本人折扣" }] };
const quote = (overrides: Partial<BenefitQuote> = {}): BenefitQuote => ({ quoteToken: "server-signed-benefits-token", storefront: "miban-limited", result, expiresAt: Date.now() + 300_000, ...overrides });
const source = (file: string) => readFileSync(new URL(file, import.meta.url), "utf8");
const summaryMarkup = (overrides = {}) => renderToStaticMarkup(React.createElement(MibanBenefitsQuoteSummary, { originalCny: 200, benefits: { displayQuote: quote(), loading: false, error: null, notice: null, retry: vi.fn(), ...overrides } }));

describe("benefit quote safety and totals", () => {
  it("accepts a real matching quote and drives a net amount rather than original", () => {
    expect(validBenefitsQuote(quote(), input)).toBe(true);
    expect(quote().result.totalCents / 100).toBe(180);
    expect(quote().result.originalCents / 100).toBe(200);
  });
  it("still requires a signed quote when there is no saving", () => {
    const regular = quote({ result: { ...result, totalCents: 20000, savedCents: 0, consumedRuleIds: [], lines: [{ ...result.lines[0], totalCents: 20000, ruleId: undefined, ruleName: undefined }] } });
    expect(validBenefitsQuote(regular, input)).toBe(true);
    expect(validBenefitsQuote({ ...regular, quoteToken: "" }, input)).toBe(false);
  });
  it.each([
    { expiresAt: 0 },
    { quoteToken: "" },
    { result: { ...result, totalCents: 0 } },
    { result: { ...result, totalCents: NaN } },
    { result: { ...result, savedCents: 0 } },
    { result: { ...result, lines: [] } },
    { result: { ...result, lines: [{ ...result.lines[0], quantity: 1 }] } },
    { result: { ...result, lines: [{ ...result.lines[0], productKey: "other-store" }] } },
    { result: { ...result, lines: [{ ...result.lines[0], totalCents: 17999 }] } },
  ])("blocks invalid, expired, mismatched or inconsistent quote %#", overrides => expect(validBenefitsQuote(quote(overrides), input)).toBe(false));
  it("annual sends monthly quantities and validates the server's twelve-month expansion", () => {
    const annual: BenefitsQuoteInput = { ...input, mode: "annual" };
    const annualQuote = quote({ result: { ...result, originalCents: 240000, totalCents: 216000, savedCents: 24000, lines: [{ ...result.lines[0], quantity: 24, originalCents: 240000, totalCents: 216000 }] } });
    expect(validBenefitsQuote(annualQuote, annual)).toBe(true);
    expect(validBenefitsQuote(annualQuote, input)).toBe(false);
    expect(annual.items[0].quantity).toBe(2);
  });
  it("a newly signed token alone does not force repeated confirmation", () => {
    expect(benefitsNeedReconfirmation(quote(), quote({ quoteToken: "new-token" }))).toBe(false);
  });
  it("same-price rule version, usage count or catalog scope revisions still require reconfirmation", () => {
    const token = (rulesHash: string, nonce: string) => `${Buffer.from(JSON.stringify({ rulesHash, catalogHash: "catalog", nonce })).toString("base64url")}.signature`;
    const displayed = quote({ quoteToken: token("rules-v1-uses0", "old") });
    expect(benefitsNeedReconfirmation(displayed, quote({ quoteToken: token("rules-v1-uses0", "fresh") }))).toBe(false);
    expect(benefitsNeedReconfirmation(displayed, quote({ quoteToken: token("rules-v2-uses1", "fresh") }))).toBe(true);
  });
  it("expiration, amount change, same-price rule/scope change require a new click", () => {
    expect(benefitsNeedReconfirmation(quote({ expiresAt: 0 }), quote())).toBe(true);
    for (const changed of [{ ...result, totalCents: 17999 }, { ...result, consumedRuleIds: ["r2"] }, { ...result, couponId: "coupon2" }, { ...result, lines: [{ ...result.lines[0], ruleId: "r2" }] }]) {
      expect(benefitsNeedReconfirmation(quote(), quote({ result: changed }))).toBe(true);
    }
  });
  it("hash is stable for rule-id order and ignores token/expiry", () => {
    expect(benefitsResultHash({ ...result, consumedRuleIds: ["b", "a"] })).toBe(benefitsResultHash({ ...result, consumedRuleIds: ["a", "b"] }));
  });
});

describe("all limited checkout paths and disabled guards", () => {
  const detail = source("./HerbalifeRedGinsengDetail.tsx");
  const cart = source("./LimitedProductCart.tsx");
  it.each([["detail", detail], ["cart", cart]])("%s uses net total and benefits token, refreshes benefits before existing wallet confirmation", (_, text) => {
    expect(text).toContain("const payableTotalCny = benefits.totalCny");
    expect(text).toContain("useMibanMixedPayment(payableTotalCny,");
    expect(text).toContain("benefitsQuoteToken: benefitsQuote.quoteToken");
    expect(text).toContain("!benefits.ready");
    expect(text).toContain("!benefits.isCurrent(benefitsQuote)");
    expect(text.indexOf("await benefits.refreshForConfirmation()")).toBeLessThan(text.indexOf(".preparePayment()"));
    expect(text).toContain("scope !== latestCheckoutScope.current");
    expect(text).not.toContain("mutateAsync(");
    expect(text).toContain("<MibanCheckoutPaymentAmount totalCny={payableTotalCny}");
  });
  it("single, annual and cart each transmit benefits token with no annual fallback", () => {
    expect(detail).toContain("createOrder = mtrpc.limitedProduct.createOrder.useMutation");
    expect(detail).toContain("createAnnualOrder = mtrpc.limitedProduct.createAnnualOrder.useMutation");
    expect(detail).toMatch(/if \(isAnnualPlan\) \{\s*createAnnualOrder\.mutate\(input, callbacks\);\s*\} else \{\s*createOrder\.mutate\(input, callbacks\)/);
    expect(cart).toContain("mtrpc.limitedProduct.createCartOrder.useMutation");
    expect(cart).toContain("createOrder.mutate({ ...orderInput, ...preparedPayment, benefitsQuoteToken: benefitsQuote.quoteToken })");
    expect(detail).toContain('mode: isAnnualPlan ? "annual" : "once"');
    expect(detail).toContain("periodTotalsCny");
    expect(detail).not.toContain("orderSuccess.annual.monthlyCny.toFixed(2)");
  });
  it("real useQuery has confirmation/auth/cart-only enabled and no polling or data clearing", () => {
    const hook = source("./useMibanBenefitsQuote.tsx");
    expect(hook).toContain("trpc.benefits.quote.useQuery(input");
    expect(hook).toContain("enabled: active");
    expect(hook).toContain("enabled && !!owner && items.length > 0");
    expect(hook).toContain("refetchInterval: false");
    expect(hook).toContain("refetchOnWindowFocus: true");
    expect(hook).toContain("displayQuote ? displayQuote.result.totalCents / 100 : 0");
    expect(hook).not.toMatch(/setInterval|removeQueries|resetQueries|initialData|placeholderData|\bany\b|ts-nocheck/);
    expect(detail).toContain("enabled: isCheckoutPage && isAuthenticated && !authLoading");
    expect(cart).toContain("enabled: open && checkoutOpen && isAuthenticated && !authLoading && validBenefitCart");
  });
  it("normal rice, DIY, fruit-specific and legacy cart paths are outside this benefit storefront change", () => {
    for (const file of ["./DiyWorkshop.tsx", "./CartDrawer.tsx", "./TianguiPearDetail.tsx"]) expect(source(file)).not.toContain("useMibanBenefitsQuote");
  });
});

describe("compact price-area states and personal rule list", () => {
  it("shows original amount and automatic saving, never exchange-rate explanations", () => {
    const html = summaryMarkup();
    expect(html).toContain("商品原价 ¥200.00");
    expect(html).toContain("已自动选用：本人折扣 / 已优惠¥20.00");
    expect(html).not.toMatch(/汇率|1 U|定时|<input|<select/);
  });
  it("keeps the previous real net quote and fixed row height while loading or error, error includes retry", () => {
    for (const override of [{ loading: true }, { error: "优惠报价读取失败，请重试" }]) {
      const html = summaryMarkup(override);
      expect(html).toContain("已优惠¥20.00");
      expect(html).toContain("min-h-[64px]");
      expect(html).toContain("h-5");
    }
    expect(summaryMarkup({ error: "优惠报价读取失败，请重试" })).toContain("重试</button>");
  });
  it("no-benefit is a real normal-price state rather than demo benefits", () => {
    expect(summaryMarkup({ displayQuote: quote({ result: { ...result, savedCents: 0 } }) })).toContain("正常售价，暂无可用优惠");
    expect(summaryMarkup({ displayQuote: null, loading: true })).toContain("正在查询本人优惠");
  });
  it("shows only owned rules with dates/count/kind/scope and strips internal notes from markup", () => {
    const rule: MyBenefitRule = { id: "r1", userId: "28", kind: "threshold", name: "本人满减", scope: "all", targets: [], value: 20, threshold: 200, starts: "2020-01-01", ends: "", unlimited: false, maxUses: 3, uses: 1, state: "active", created: "2020-01-01", version: 1 };
    const html = renderToStaticMarkup(React.createElement(MyBenefitsList, { userId: "28", rules: [{ ...rule, note: "INTERNAL-NOTE" } as MyBenefitRule, { ...rule, id: "r2", userId: "29", name: "OTHER-USER" }] }));
    for (const value of ["本人满减", "满200减20", "限时商城全场", "2020-01-01", "长期有效", "可用2次"]) expect(html).toContain(value);
    expect(html).not.toMatch(/INTERNAL-NOTE|OTHER-USER|管理|等级/);
    expect(myBenefitScopeText({ ...rule, scope: "product", targets: ["limited:herbalife-red-ginseng"] })).not.toContain("limited:");
    expect(renderToStaticMarkup(React.createElement(MyBenefitsList, { userId: "28", rules: [] }))).toContain("暂无专属优惠");
  });
  it("protected my query never accepts another userId or invokes admin catalog", () => {
    const text = source("./MyBenefits.tsx");
    expect(text).toContain("trpc.benefits.my.useQuery({ storefront: MIBAN_BENEFITS_STOREFRONT }");
    expect(text).toContain("rule.userId === requestOwner");
    expect(text).not.toMatch(/benefits\.catalog|benefits\.users|benefits\.save|initialData|\bany\b|ts-nocheck/);
    for (const value of ["本人优惠读取失败", "正在读取本人优惠", "我的优惠", "重试"]) expect(text).toContain(value);
  });
  it("uses the actual personal page and per-order snapshot component exactly once without a replacement route", () => {
    const text = source("./MyOrders.tsx");
    expect(text).toContain("<MyBenefits />");
    expect((text.match(/<MibanOrderBenefitsDetails order=\{order\}/g) ?? []).length).toBe(1);
  });
});

it("renders real components for opt-in isolated mobile QA with no app or network requests", async () => {
  const directory = process.env.MIBAN_BENEFITS_QA_DIR;
  if (!directory) return;
  const { mkdirSync, writeFileSync, readdirSync } = await import("node:fs");
  const { resolve } = await import("node:path");
  mkdirSync(directory, { recursive: true });
  const assets = resolve(process.cwd(), "dist/public/assets");
  const styles = readdirSync(assets).filter(name => /^index-.*\.css$/.test(name)).map(name => `<link rel="stylesheet" href="file://${assets}/${name}">`).join("");
  const payment = { deductions: [{ assetCode: "CNY", amount: "28", cnyValue: "28" }, { assetCode: "USDT", amount: "21.714285714285714285", cnyValue: "152" }], selectedCodes: ["CNY", "USDT"], totalValueCny: "180", remainingCny: "0", usdtCnyRate: 7, refreshing: false, ready: true, canPay: true, statusMessage: "页面报价已固定，确认付款时核验最新报价" } as unknown as MibanMixedPayment;
  const body = renderToStaticMarkup(React.createElement("main", { style: { width: 390, maxWidth: "100%", margin: "0 auto", background: "white", padding: 16 }, "data-miban-checkout": "true" },
    React.createElement("p", { className: "mb-3 text-[11px] text-gray-400" }, "离线真实组件QA · 未下单/未扣款"),
    React.createElement("h2", { className: "text-[18px] font-extrabold text-gray-900" }, "钱包支付"),
    React.createElement(MibanCheckoutPaymentAmount, { totalCny: 180, usdtCnyRate: 7, accent: "#0D7A3E" },
      React.createElement(MibanBenefitsQuoteSummary, { originalCny: 200, benefits: { displayQuote: quote(), loading: false, error: null, notice: null, retry: () => {} } }),
      React.createElement(MibanPaymentConfirmation, { payment, accent: "#0D7A3E" })),
    React.createElement(MibanCheckoutConfirmationDetails, { items: [{ name: "米大娘礼盒（离线组件QA）", specification: "经典款 · 5斤", quantity: "每月2份，共24份" }], deliverySchedule: "每月发货，共12个月，非一次发完", receiverName: "离线组件QA", receiverPhone: "--", receiverAddress: "仅排版检查，未提交任何客户资料", invoiceDraft: { enabled: false, type: "personal", title: "", taxNo: "" } }),
    React.createElement("button", { type: "button", disabled: true, className: "mt-4 min-h-12 w-full rounded-[4px] bg-gray-300 px-3 py-3 text-[13px] font-extrabold text-white" }, "确认支付（离线QA不可付款）"),
    React.createElement("h3", { className: "mt-6 text-[13px] font-bold text-gray-800" }, "请求中 / 错误固定高度检查"),
    React.createElement(MibanBenefitsQuoteSummary, { originalCny: 200, benefits: { displayQuote: quote(), loading: true, error: null, notice: null, retry: () => {} } }),
    React.createElement(MibanBenefitsQuoteSummary, { originalCny: 200, benefits: { displayQuote: quote(), loading: false, error: "优惠报价读取失败，请重试；未提交订单", notice: null, retry: () => {} } }),
  ));
  writeFileSync(resolve(directory, "confirmation-mobile.html"), `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>米伴优惠离线手机确认QA</title>${styles}<style>body{margin:0;background:#f5f5f5}[data-benefits-quote-summary]{min-height:64px;box-sizing:border-box}</style></head><body>${body}</body></html>\n`);
});
