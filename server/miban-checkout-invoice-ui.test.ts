import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

vi.mock("react", async () => ({
  ...(await vi.importActual<typeof import("react")>("react")),
  useId: () => "isolated-invoice-field",
}));
import MibanInvoiceRequestForm, {
  createMibanInvoiceDraft,
  validateMibanInvoiceRequest,
  type MibanInvoiceDraft,
} from "../client/src/pages/miban/MibanInvoiceRequestForm";
import { MibanCheckoutConfirmationDetails } from "../client/src/pages/miban/MibanCheckoutConfirmationDetails";
import { MibanOrderInvoiceDetails } from "../client/src/pages/miban/MibanOrderInvoiceDetails";

function findElement(node: any, predicate: (node: any) => boolean): any {
  if (Array.isArray(node)) return node.map(item => findElement(item, predicate)).find(Boolean);
  if (!React.isValidElement(node)) return undefined;
  if (predicate(node)) return node;
  return findElement((node.props as any).children, predicate);
}
const company = (): MibanInvoiceDraft => ({ enabled: true, type: "company", title: "  单元测试有限公司  ", taxNo: "  91330000UNIT  " });
const source = (file: string) => readFileSync(new URL(`../client/src/pages/miban/${file}`, import.meta.url), "utf8");
beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => vi.unstubAllGlobals());

describe("shared invoice form and request validation (isolated, no network)", () => {
  it("defaults off and submits no invoice field, even with invalid residual company data", () => {
    const draft = createMibanInvoiceDraft();
    expect(draft).toEqual({ enabled: false, type: "personal", title: "个人", taxNo: "" });
    expect(validateMibanInvoiceRequest({ ...draft, type: "company", title: "", taxNo: "\n" })).toEqual({ success: true });
    const markup = renderToStaticMarkup(React.createElement(MibanInvoiceRequestForm, { draft, onChange: () => {} }));
    expect(markup).toContain("索取发票");
    expect(markup).toContain('aria-checked="false"');
    expect(markup.match(/<input(?![^>]*aria-hidden)/g)).toBeNull();
    expect(markup).not.toContain("索要发票");
  });
  it("enabling resets personal title and clearing the switch discards previous company data", () => {
    const onChange = vi.fn();
    const element = MibanInvoiceRequestForm({ draft: company(), onChange });
    const toggle = findElement(element, node => node.props["aria-label"] === "索取发票" && typeof node.props.onCheckedChange === "function");
    toggle.props.onCheckedChange(false);
    expect(onChange).toHaveBeenLastCalledWith(createMibanInvoiceDraft());
    toggle.props.onCheckedChange(true);
    expect(onChange).toHaveBeenLastCalledWith({ ...createMibanInvoiceDraft(), enabled: true });
  });
  it("switching to personal immediately clears company tax number and resets title", () => {
    const onChange = vi.fn();
    const element = MibanInvoiceRequestForm({ draft: company(), onChange });
    findElement(element, node => node.type === "button" && node.props.children === "个人").props.onClick();
    expect(onChange).toHaveBeenCalledWith({ enabled: true, type: "personal", title: "个人", taxNo: "" });
    const personal = validateMibanInvoiceRequest({ enabled: true, type: "personal", title: "  张三  ", taxNo: "OLD-COMPANY-TAX-NO" });
    expect(personal).toEqual({ success: true, invoiceRequest: { type: "personal", title: "张三" } });
  });
  it("company requires both fields, trims their edges and does not impose a fabricated tax-number length", () => {
    expect(validateMibanInvoiceRequest(company())).toEqual({ success: true, invoiceRequest: { type: "company", title: "单元测试有限公司", taxNo: "91330000UNIT" } });
    expect(validateMibanInvoiceRequest({ ...company(), taxNo: "" })).toMatchObject({ success: false, errors: { taxNo: "请填写公司税号" } });
    expect(validateMibanInvoiceRequest({ ...company(), title: "  " })).toMatchObject({ success: false, errors: { title: "请填写发票抬头" } });
    const markup = renderToStaticMarkup(React.createElement(MibanInvoiceRequestForm, { draft: company(), onChange: () => {} }));
    expect(markup.match(/<input(?![^>]*aria-hidden)/g)).toHaveLength(2);
    expect(markup).toContain("公司税号");
  });
  it.each(["\n标题", "标题\t", "\u0000标题", "标题\u007f"])("rejects title control characters before trimming: %j", title => {
    expect(validateMibanInvoiceRequest({ ...company(), title })).toMatchObject({ success: false, errors: { title: "发票抬头请勿包含换行等特殊字符" } });
  });
  it("rejects control characters and excessive lengths in company tax number", () => {
    expect(validateMibanInvoiceRequest({ ...company(), taxNo: "\nTAX" })).toMatchObject({ success: false, errors: { taxNo: "税号请勿包含换行等特殊字符" } });
    expect(validateMibanInvoiceRequest({ ...company(), title: "A".repeat(201) }).success).toBe(false);
    expect(validateMibanInvoiceRequest({ ...company(), taxNo: "B".repeat(101) }).success).toBe(false);
  });
  it("pending checkout disables form mutations and keeps inline errors accessible", () => {
    const onChange = vi.fn();
    const element = MibanInvoiceRequestForm({ draft: company(), onChange, disabled: true, errors: { taxNo: "请填写公司税号" } });
    findElement(element, node => typeof node.props.onCheckedChange === "function").props.onCheckedChange(false);
    findElement(element, node => node.type === "button" && node.props.children === "个人").props.onClick();
    expect(onChange).not.toHaveBeenCalled();
    const markup = renderToStaticMarkup(element);
    expect(markup).toContain('aria-invalid="true"');
    expect(markup).toContain('role="alert"');
    expect(markup).toContain("disabled");
  });
});

describe("read-only shipping / invoice confirmation and saved order details", () => {
  const details = (invoiceDraft: MibanInvoiceDraft) => renderToStaticMarkup(React.createElement(MibanCheckoutConfirmationDetails, { receiverName: "张三", receiverPhone: "13800138000", receiverAddress: "北京市朝阳区测试地址", invoiceDraft, userNote: "配送前联系" }));
  it("shows exact company fields and address with no editor, switch, selection or hidden detail step", () => {
    const markup = details(company());
    for (const text of ["张三", "13800138000", "北京市朝阳区测试地址", "公司发票", "单元测试有限公司", "91330000UNIT", "配送前联系"]) expect(markup).toContain(text);
    for (const tag of ["<button", "<input", "<select", "<textarea", "<details", 'role="switch"']) expect(markup).not.toContain(tag);
  });
  it("off shows no residual company fields; personal never displays old tax number", () => {
    const off = details({ ...company(), enabled: false });
    expect(off).toContain("不索取发票");
    expect(off).not.toContain("91330000UNIT");
    const personal = details({ ...company(), type: "personal", title: "个人" });
    expect(personal).toContain("个人发票");
    expect(personal).not.toContain("91330000UNIT");
  });
  it("renders saved requests only when returned by orders and hides tax information from image exports", () => {
    expect(renderToStaticMarkup(React.createElement(MibanOrderInvoiceDetails))).toBe("");
    const markup = renderToStaticMarkup(React.createElement(MibanOrderInvoiceDetails, { invoiceRequest: { type: "company", title: "公司", taxNo: "TAX" } }));
    expect(markup).toContain('data-card-export-hide="true"');
    expect(markup).toContain("发票申请");
    expect(markup).toContain("TAX");
  });
  it("all checkout pages use the same invoice form and one selection stage plus read-only payment confirmation", () => {
    for (const page of ["HerbalifeRedGinsengDetail.tsx", "LimitedProductCart.tsx", "CartDrawer.tsx", "TianguiPearDetail.tsx", "DiyWorkshop.tsx"]) {
      const text = source(page);
      for (const contract of ["MibanInvoiceRequestForm", "validateMibanInvoiceRequest(invoiceDraft)", "MibanWalletAvailableSummary", "MibanPaymentConfirmation", "MibanCheckoutConfirmationDetails", "invoiceSupport.fetch", "staleTime: 0", "retry: false", "checkoutScope", "invoice.invoiceRequest"]) expect(text, `${page}: ${contract}`).toContain(contract);
      expect(text, page).not.toContain("confirmPaymentReview(false)");
      expect(text, page).not.toContain("<MibanMixedPaymentAllocation");
    }
  });
  it("general limited products pass the same validated invoice to single and twelve-month orders", () => {
    const text = source("HerbalifeRedGinsengDetail.tsx");
    expect(text).toContain("createAnnualOrder.mutate(input, callbacks)");
    expect(text).toContain("createOrder.mutate(input, callbacks)");
    expect(text).toContain("invoiceRequest: invoice.invoiceRequest");
    expect(text).toContain("invoiceDraft,");
    expect(text).toContain("if (invoice.invoiceRequest)");
  });
  it("personal and administrator order views display the same saved request, not a local invoice draft", () => {
    for (const file of ["MyOrders.tsx", "UnifiedAdmin.tsx"]) expect(source(file)).toContain("<MibanOrderInvoiceDetails invoiceRequest={order.invoiceRequest} />");
    expect(source("MyOrders.tsx")).toContain('key !== "invoiceRequest"');
  });
});
