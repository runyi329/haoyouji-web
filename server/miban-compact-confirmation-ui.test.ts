import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../client/src/pages/miban/mibanTrpc", () => ({ mtrpc: {} }));
import { MibanPaymentConfirmation, MibanMixedPaymentAllocation, type MibanMixedPayment } from "../client/src/pages/miban/MibanMixedPayment";
import { MibanCheckoutPaymentAmount } from "../client/src/pages/miban/MibanCheckoutPaymentAmount";
import { MibanCheckoutConfirmationDetails } from "../client/src/pages/miban/MibanCheckoutConfirmationDetails";

beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => vi.unstubAllGlobals());
const payment = (overrides: Partial<MibanMixedPayment> = {}) => ({
  deductions: [
    { assetCode: "CNY", amount: "28", cnyValue: "28" },
    { assetCode: "USDT", amount: "20", cnyValue: "140" },
    { assetCode: "ETH", amount: "0.005", cnyValue: "60" },
  ],
  selectedCodes: ["CNY", "USDT", "ETH"],
  totalValueCny: "228",
  remainingCny: "0",
  usdtCnyRate: 7,
  refreshing: false,
  ready: true,
  canPay: true,
  statusMessage: "页面报价已固定，确认付款时核验最新报价",
  refresh: vi.fn(),
  ...overrides,
} as MibanMixedPayment);
const markup = (p: MibanMixedPayment) => renderToStaticMarkup(React.createElement(MibanPaymentConfirmation, { payment: p }));
const offInvoice = { enabled: false, type: "personal" as const, title: "个人", taxNo: "" };

describe("compact readonly payment composition", () => {
  it("shows exact amounts joined by plus and one approximate total instead of a large explanatory scheme", () => {
    const p = payment();
    const html = markup(p);
    for (const item of ["28 人民币", "20 USDT", "0.005 ETH", "合计 ≈", "¥228.00"]) expect(html).toContain(item);
    expect((html.match(/aria-hidden="true"/g) ?? []).length).toBe(2);
    expect(html).not.toMatch(/本次付款方案|已选币种|本次预计扣币|剩余待付|1 U ≈|冻结不参与|服务端验签|页面报价已固定/);
    expect(html).not.toMatch(/<button|<select|<input|<details|<summary/);
    expect(p.refresh).not.toHaveBeenCalled();
  });
  it("uses the same compact view for compatibility callers", () => {
    const p = payment();
    expect(renderToStaticMarkup(React.createElement(MibanMixedPaymentAllocation, { payment: p }))).toBe(markup(p));
  });
  it("never truncates native precision or shows a selected zero-value asset as a debit", () => {
    const p = payment({ selectedCodes: ["CNY", "ETH"], deductions: [{ assetCode: "CNY", amount: "0", cnyValue: "0" }, { assetCode: "ETH", amount: "0.000000000000000001", cnyValue: "228" }] });
    const html = markup(p);
    expect(html).toContain("0.000000000000000001 ETH");
    expect(html).not.toContain('data-payment-deduction-asset="CNY"');
    expect(html).not.toContain("0 人民币");
  });
  it.each([
    { refreshing: true, statusMessage: "正在核验最新报价与余额，请稍候" },
    { ready: false, statusMessage: "最新报价核验失败，未提交订单，请重试刷新报价" },
    { remainingCny: "1", statusMessage: "所选币种可用价值不足，请调整币种或充值" },
    { statusMessage: "报价已更新，请确认本次付款金额" },
  ])("keeps necessary exceptional notice visible: $statusMessage", overrides => {
    const html = markup(payment(overrides));
    expect(html).toContain(overrides.statusMessage);
    expect(html).toContain('role="status"');
    expect(html).not.toMatch(/<button|<input|<select/);
  });
  it("does not invent a payable zero when no deduction exists", () => {
    const html = markup(payment({ deductions: [], ready: false, canPay: false, statusMessage: "钱包报价读取失败，请主动刷新重试" }));
    expect(html).toContain("付款信息待核验");
    expect(html).not.toMatch(/data-payment-deduction-asset/);
    expect(html).toContain("钱包报价读取失败");
  });
});

describe("prominent order amount and product/delivery confirmation", () => {
  it("shows prominent amount with compact composition inside the same card", () => {
    const html = renderToStaticMarkup(React.createElement(MibanCheckoutPaymentAmount, { totalCny: 228, usdtCnyRate: 7, accent: "#8d292c" }, React.createElement(MibanPaymentConfirmation, { payment: payment() })));
    for (const word of ["本次应付", "USDT", "≈ ¥228.00", "付款构成", "text-[30px]", "rounded-[4px]"]) expect(html).toContain(word);
    expect(html).not.toContain("本次付款方案");
  });
  it.each([NaN, 0, -1])("does not invent a conversion at invalid rate %s", rate => {
    const html = renderToStaticMarkup(React.createElement(MibanCheckoutPaymentAmount, { totalCny: 228, usdtCnyRate: rate }));
    expect(html).toContain("--");
    expect(html).toContain("¥228.00");
    expect(html).not.toMatch(/Infinity|NaN/);
  });
  it("shows every real product name, specification, quantity and delivery alongside address and company invoice", () => {
    const html = renderToStaticMarkup(React.createElement(MibanCheckoutConfirmationDetails, {
      items: [{ name: "米大娘礼盒", specification: "经典款 · 5斤", quantity: "每月2份，共24份" }, { name: "营养粉", specification: "4g × 14条", quantity: "1盒" }],
      deliveryMethod: "快递配送", deliverySchedule: "每月发货，共12个月，非一次发完", receiverName: "张三", receiverPhone: "13800138000", receiverAddress: "北京市朝阳区详细收货地址", invoiceDraft: { enabled: true, type: "company", title: "示例有限公司", taxNo: "EXAMPLE-TAX" }, userNote: "配送前联系",
    }));
    for (const value of ["米大娘礼盒", "经典款 · 5斤", "每月2份，共24份", "营养粉", "4g × 14条", "1盒", "配送方式", "快递配送", "非一次发完", "张三", "示例有限公司", "EXAMPLE-TAX", "配送前联系"]) expect(html).toContain(value);
    expect((html.match(/data-checkout-product-name/g) ?? []).length).toBe(2);
    expect(html).not.toMatch(/<input|<select|<button|<details/);
  });
  it("invoice off and personal still remove any residual company tax number", () => {
    for (const invoiceDraft of [{ ...offInvoice, type: "company" as const, taxNo: "OLD-TAX" }, { ...offInvoice, enabled: true, taxNo: "OLD-TAX" }]) {
      const html = renderToStaticMarkup(React.createElement(MibanCheckoutConfirmationDetails, { receiverName: "张三", receiverPhone: "13800138000", receiverAddress: "地址", invoiceDraft }));
      expect(html).not.toContain("OLD-TAX");
      expect(html).toContain("快递配送");
    }
  });
  it("every checkout uses the same prominent amount, readonly product confirmation and account-scoped invoice form", () => {
    for (const file of ["HerbalifeRedGinsengDetail.tsx", "LimitedProductCart.tsx", "CartDrawer.tsx", "DiyWorkshop.tsx", "TianguiPearDetail.tsx"]) {
      const text = readFileSync(new URL(`../client/src/pages/miban/${file}`, import.meta.url), "utf8");
      for (const marker of ["<MibanCheckoutPaymentAmount", "<MibanPaymentConfirmation", "<MibanCheckoutConfirmationDetails", "items=", "<MibanInvoiceRequestForm userId={user?.id}"]) expect(text, `${file}: ${marker}`).toContain(marker);
      expect(text).not.toContain("<MibanMixedPaymentAllocation");
    }
  });
});

// 仅在显式开启的离线QA执行中输出实际组件HTML，不挂载应用或模拟接口。
// 该文件不对用户发布，不含真实客户资料，也绝不触发订单/钱包请求。
it("can render the actual compact components for explicitly isolated layout QA", async () => {
  const directory = process.env.MIBAN_ISOLATED_QA_DIR;
  if (!directory) return;
  const { writeFileSync, readdirSync } = await import("node:fs");
  const { resolve } = await import("node:path");
  const assets = resolve(process.cwd(), "dist/public/assets");
  const css = readdirSync(assets).find(name => /^index-.*\.css$/.test(name));
  expect(css).toBeTruthy();
  const cssLink = `file://${assets}/${css}`;
  const body = renderToStaticMarkup(React.createElement("main", { className: "mx-auto w-full max-w-[480px] bg-white p-5", "data-miban-checkout": "true" },
    React.createElement("p", { className: "mb-3 text-[11px] text-gray-400" }, "离线组件布局检查 · 未提交订单或付款"),
    React.createElement("h2", { className: "text-[19px] font-extrabold text-gray-900" }, "钱包支付"),
    React.createElement(MibanCheckoutPaymentAmount, { totalCny: 228, usdtCnyRate: 7, accent: "#8d292c" }, React.createElement(MibanPaymentConfirmation, { payment: payment(), accent: "#8d292c" })),
    React.createElement(MibanCheckoutConfirmationDetails, { items: [{ name: "离线商品规格布局检查", specification: "5斤礼盒 · 经典款", quantity: "1盒" }], receiverName: "组件检查", receiverPhone: "--", receiverAddress: "此地址仅用于离线排版检查，未提交任何资料", invoiceDraft: { enabled: true, type: "company", title: "离线组件检查", taxNo: "TEST-NOT-SAVED" } }),
    React.createElement("button", { type: "button", disabled: true, className: "mt-4 min-h-12 w-full rounded-[4px] bg-[#8d292c] px-3 py-3 text-[13px] font-extrabold text-white" }, "确认支付（仅离线样式检查）"),
  ));
  writeFileSync(resolve(directory, "isolated-compact-confirmation.html"), `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>离线真实组件布局检查</title><link rel="stylesheet" href="${cssLink}"></head><body style="margin:0;background:#f5f5f5">${body}</body></html>\n`);
});
