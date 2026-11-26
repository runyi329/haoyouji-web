import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import vm from "node:vm";
import ts from "typescript";
import { z } from "zod";
import { describe, expect, it, vi } from "vitest";
import { MIDANIANG_ANNUAL_MONTHS, getMidaniangAnnualShipDates } from "./midaniang-annual-plan";

/**
 * 隔离安全回归：不运行时 import miban、db、router、钱包或任何业务模块。
 * 仅读取源码，以 TypeScript AST 提取新增 procedure；VM 没有 require/process/fetch。
 * 目录、钱包、库存、事务均为本文件内的测试依赖，不进入产品或页面展示。
 * 付款精度函数也从纯 helper AST 提取，避免 mock 算法掩盖原币尾差。
 */
const source = readFileSync(new URL("./miban.ts", import.meta.url), "utf8");
const parse = (text: string, file = "isolated.ts") => ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
function getRouterProperties(text: string): ts.PropertyAssignment[] {
  const sf = parse(text, "miban.ts");
  let object: ts.ObjectLiteralExpression | undefined;
  sf.forEachChild(node => {
    if (!ts.isVariableStatement(node)) return;
    for (const declaration of node.declarationList.declarations) {
      if (declaration.name.getText(sf) !== "mibanLimitedProductRouter") continue;
      const initializer = declaration.initializer;
      if (initializer && ts.isCallExpression(initializer) && ts.isObjectLiteralExpression(initializer.arguments[0])) object = initializer.arguments[0];
    }
  });
  if (!object) throw new Error("目标 router AST 不存在");
  return object.properties.filter(ts.isPropertyAssignment);
}
const annualProperty = getRouterProperties(source).find(node => node.name.getText() === "createAnnualOrder");
if (!annualProperty) throw new Error("新增年单 procedure 不存在");
const annualExpression = annualProperty.initializer.getText();
function evaluate(text: string, bindings: Record<string, unknown>) {
  const js = ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  const context = vm.createContext(bindings, { codeGeneration: { strings: false, wasm: false } });
  return new vm.Script(js, { filename: "midaniang-annual-plan-isolated.js" }).runInContext(context, { timeout: 1000 });
}
function pureDeclarations(file: string, names: string[]): string {
  const text = readFileSync(new URL(file, import.meta.url), "utf8");
  const sf = parse(text);
  return names.map(name => {
    const declaration = sf.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
    if (!declaration) throw new Error(`纯函数 AST 缺失: ${name}`);
    return declaration.getText(sf).replace(/^export\s+/, "");
  }).join("\n");
}
const paymentPure = evaluate(`
const PAYMENT_SCALE = 10n ** 18n;
const MIBAN_PAYMENT_ASSETS = ["CNY", "USDT", "BTC"];
${pureDeclarations("../shared/miban-wallet-payment.ts", ["paymentDecimalUnits", "paymentUnitsText", "paymentAssetDecimals", "quantum", "normalizeMibanPaymentAssetCode", "normalizeMibanPaymentAssets", "validateMibanPaymentDeductions", "splitMibanPaymentDeductions"])}
({ paymentDecimalUnits, validateMibanPaymentDeductions, splitMibanPaymentDeductions });
`, {}) as {
  paymentDecimalUnits: (value: string | number) => bigint;
  validateMibanPaymentDeductions: (total: number, inputs: any[], prices: any[]) => any[];
  splitMibanPaymentDeductions: (deductions: any[], periods: number) => any[][];
};
const fundingAmounts = evaluate(`${pureDeclarations("./miban-wallet-payment-service.ts", ["mibanFundingDeductionAmounts"])}\nmibanFundingDeductionAmounts;`, {}) as (rows: any[]) => { cnyAmount: string; usdtAmount: string };
const phoneSchema = evaluate(`${pureDeclarations("../shared/miban-shipping.ts", ["normalizeMibanReceiverPhone"])}
const MIBAN_RECEIVER_PHONE_REQUIRED = "手机号必填";
const MIBAN_RECEIVER_PHONE_TOO_SHORT = "手机号不足11位";
const MIBAN_RECEIVER_PHONE_INVALID = "手机号无效";
${(() => {
  const text = readFileSync(new URL("../shared/miban-shipping.ts", import.meta.url), "utf8");
  const sf = parse(text);
  for (const node of sf.statements) if (ts.isVariableStatement(node)) for (const declaration of node.declarationList.declarations) {
    if (declaration.name.getText(sf) === "mibanReceiverPhoneSchema") return `const mibanReceiverPhoneSchema = ${declaration.initializer!.getText(sf)};`;
  }
  throw new Error("电话 schema AST 缺失");
})()}
mibanReceiverPhoneSchema;`, { z });
class MockTRPCError extends Error {
  code: string;
  constructor(options: { code: string; message: string; cause?: unknown }) {
    super(options.message, { cause: options.cause });
    this.code = options.code;
  }
}
const USER_ID = 731;
const VALID_TOKEN = "isolated-signed-quote-not-for-production";
const NOW = "2026-01-31T16:05:00.000Z";
class FixedDate extends Date {
  constructor(value?: any) { super(value === undefined ? NOW : value); }
}
function baseInput() {
  return {
    productKey: "midaniang-classic-rice-gift", skuId: "classic-500g-6", quantity: 2,
    receiverName: "隔离测试收货人", receiverPhone: "13800138000", receiverAddress: "隔离测试地址，不发货",
    cnyAmount: 5472, paymentAssets: [{ assetCode: "CNY", amount: "5472" }], paymentQuoteToken: VALID_TOKEN,
  };
}
type Options = {
  product?: any; sku?: any; reserveFailAt?: number; createFailAt?: number; linkFailAt?: number;
  debitFailure?: boolean; commitFailure?: boolean; snapshotFailure?: boolean;
  unlimitedAt?: number[]; releaseFailAt?: number[]; nullPayment?: boolean; rate?: string;
};
function harness(options: Options = {}) {
  const events: string[] = [];
  const transaction = Object.freeze({ testOnlyTransaction: true });
  const attemptedOrders: any[] = [];
  const committedOrders: any[] = [];
  const product = { key: "midaniang-classic-rice-gift", brand: "米大娘", status: "on_sale", category: "大米礼盒", detail: { title: "测试目录标题", productImage: "test-only.png" }, card: { theme: { accent: "#000000" } }, ...options.product };
  const sku = { id: "classic-500g-6", active: true, maxPurchaseQty: 10, priceCny: 228, quantityPerOrder: 1, unitLabel: "盒", netContentText: "测试规格", name: "测试SKU", ...options.sku };
  const prices = [{ assetCode: "CNY", priceCny: "1", priceUsdt: "0.142857142857142857" }, { assetCode: "USDT", priceCny: "7", priceUsdt: "1" }, { assetCode: "BTC", priceCny: "100000", priceUsdt: "14285.714285714285714285" }];
  let number = 0;
  const mocks = {
    assertAiWalletOperationEnabled: vi.fn(async () => { events.push("wallet-gate"); }),
    getMibanLimitedProduct: vi.fn((key: string) => key === product.key ? product : null),
    getMibanLimitedProductSku: vi.fn((_product: any, id: string) => id === sku.id ? sku : null),
    prepareMibanWalletPayment: vi.fn((args: any) => {
      events.push("prepare");
      if (args.paymentQuoteToken !== VALID_TOKEN) throw new Error("测试签名报价拒绝");
      if (options.nullPayment) return null;
      return { quoteToken: args.paymentQuoteToken, quotedAt: NOW, expiresAt: "2026-02-01T16:05:00Z", usdtCnyRate: options.rate ?? "7.0000", deductions: paymentPure.validateMibanPaymentDeductions(args.totalCny, args.paymentAssets, prices) };
    }),
    ensureMibanWalletPaymentInfrastructure: vi.fn(async () => { events.push("infrastructure"); }),
    createUniqueMibanOrderNo: vi.fn(async () => `AA${String(++number).padStart(4, "0")}`),
    reserveLimitedSkuStock: vi.fn(async (..._args: any[]) => {
      const index = mocks.reserveLimitedSkuStock.mock.calls.length;
      events.push(`reserve:${index}`);
      if (index === options.reserveFailAt) throw new Error(`reserve-failed:${index}`);
      return !options.unlimitedAt?.includes(index);
    }),
    releaseLimitedSkuStock: vi.fn(async (..._args: any[]) => {
      const index = mocks.releaseLimitedSkuStock.mock.calls.length;
      events.push(`release:${index}`);
      if (options.releaseFailAt?.includes(index)) throw new Error(`release-failed:${index}`);
      return true;
    }),
    snapshotLimitedCommissionLines: vi.fn(async (lines: any[]) => {
      if (options.snapshotFailure) throw new Error("snapshot-failed");
      return [{ ...lines[0], commissionEligible: true }];
    }),
    getCommissionTriggerSnapshotForBuyer: vi.fn(async () => "order_confirmed"),
    createOrder: vi.fn(async (data: any, passedTransaction: any) => {
      expect(passedTransaction).toBe(transaction);
      const index = mocks.createOrder.mock.calls.length;
      events.push(`create:${index}`);
      if (index === options.createFailAt) throw new Error(`create-failed:${index}`);
      attemptedOrders.push(data);
      return 1000 + index;
    }),
    linkLimitedStockDeductionToOrder: vi.fn(async (...args: any[]) => {
      expect(args[4]).toBe(transaction);
      const index = mocks.linkLimitedStockDeductionToOrder.mock.calls.length;
      if (index === options.linkFailAt) throw new Error(`link-failed:${index}`);
    }),
    debitMibanWalletPayment: vi.fn(async (args: any) => {
      expect(args.transaction).toBe(transaction);
      events.push("debit");
      if (options.debitFailure) throw new Error("debit-failed");
    }),
    withGlobalWalletTransaction: vi.fn(async (userId: number, work: (tx: any) => Promise<any>) => {
      expect(userId).toBe(USER_ID);
      events.push("begin");
      try {
        const orders = await work(transaction);
        if (options.commitFailure) throw new Error("commit-failed");
        committedOrders.push(...attemptedOrders);
        events.push("commit");
        return orders;
      } catch (error) { events.push("rollback"); throw error; }
    }),
  };
  const protectedProcedure = {
    input(schema: z.ZodType) {
      return { mutation(resolver: (args: any) => Promise<any>) { return { schema, resolver }; } };
    },
  };
  const procedure = evaluate(`(${annualExpression});`, {
    ...mocks, protectedProcedure, z, mibanReceiverPhoneSchema: phoneSchema, TRPCError: MockTRPCError,
    MIDANIANG_ANNUAL_MONTHS, getMidaniangAnnualShipDates,
    paymentDecimalUnits: paymentPure.paymentDecimalUnits,
    splitMibanPaymentDeductions: paymentPure.splitMibanPaymentDeductions,
    mibanFundingDeductionAmounts: fundingAmounts,
    randomUUID: () => "11111111-2222-3333-4444-555555555555", Date: FixedDate,
  }) as { schema: z.ZodType; resolver: (args: any) => Promise<any> };
  return { mocks, product, sku, transaction, attemptedOrders, committedOrders, events,
    run: async (input: any = baseInput()) => procedure.resolver({ input: procedure.schema.parse(input), ctx: { user: { id: USER_ID } } }),
  };
}
function expectReleased(h: ReturnType<typeof harness>, orderNumbers: string[]) {
  expect(h.mocks.releaseLimitedSkuStock).toHaveBeenCalledTimes(orderNumbers.length);
  h.mocks.releaseLimitedSkuStock.mock.calls.forEach((call, index) => {
    expect(call.slice(0, 6)).toEqual([h.product.key, h.sku.id, 2, "order_rollback", null, USER_ID]);
    expect(call[6]).toContain(`#${orderNumbers[index]}`);
  });
}
const orderNumbers = (length: number) => Array.from({ length }, (_, index) => `AA${String(index + 1).padStart(4, "0")}`);

describe("米大娘年单：真实 AST mutation / 无生产服务隔离", () => {
  it("只新增年单接口，既有 router 每个属性与发布基准原文指纹一致", () => {
    // 基准3aae608ba8132a1d953ef8bb7fa8eddfae26f0a6的initializer原文SHA256；不依赖移动HEAD或浅克隆历史。
    const baseline: Record<string, string> = {
      brandAttention: "3128c3c47908f29141af78c86714559bf295fd8c30ce09e3a93bc0d8738ebbb8",
      recordBrandAttention: "c1f2dd6a3cd2e3cbee49666e02862af6105998a6b53610e6271befe477d0c497",
      publicAvailability: "15ec4b70d775cd7c44ae5de61c068a97fa4eae923fb4e6bb1c8cf655da67dd91",
      adminSalesStats: "d64a9b65137f4b7e3e9af17752c0bd196db162c53357c35db10ba8c0ca226b42",
      adminCatalog: "42880028c7d42476ed02ec5b73875d85ae8e02f8831adc63e7614deca9aebd62",
      adminUpdateSkuState: "9f98cd77115bafdd412a0ebb4f894088a4d851a824b03a775aec793ba3575c6a",
      adminUpdateCategoryCommissionState: "8f72fea1a31281e38a8af817230d6f97393b420447489d4c3456ea92a2cda0b7",
      adminStockMovements: "6ea94254b083ddc2961ce53c0ab8e05ffb184bcc668a029052f5998bc7d8c3bb",
      adminOrders: "5a217656525e22fd68bddb298bab4cd5c15c4263003708360d0be3b0ff409849",
      createOrder: "05acee199135b9f98a2b85f0e8e64d23865e0ddb4324f013ed6cb8a3119517d8",
      createCartOrder: "292ff8bd430853f92165f23a5dfdbd60b27447d4b7578322a3951261a796399e",
    };
    const current = getRouterProperties(source);
    expect(current.map(node => node.name.getText()).filter(name => name !== "createAnnualOrder")).toEqual(Object.keys(baseline));
    for (const [name, fingerprint] of Object.entries(baseline)) {
      const initializer = current.find(node => node.name.getText() === name)?.initializer.getText();
      expect(createHash("sha256").update(initializer ?? "").digest("hex")).toBe(fingerprint);
    }
    expect(annualExpression).toMatch(/^protectedProcedure\s*\.input/);
    expect(annualExpression).not.toMatch(/\b(?:import\s*\(|require\s*\(|getDb\s*\(|fetch\s*\()/);
  });

  it.each([
    ["经典礼盒", "midaniang-classic-rice-gift", "classic-500g-6"],
    ["儿童礼盒", "midaniang-family-rice-gift", "family-300g-9"],
  ])("%s：12个真实月单参数、一次全年扣款、每月SKU价量与奖金快照", async (_label, productKey, skuId) => {
    const h = harness({ product: { key: productKey }, sku: { id: skuId } });
    const result = await h.run({ ...baseInput(), productKey, skuId, totalCny: 1, priceCny: 1, unitPriceCny: 1, subscriptionMonths: 1 });
    expect(result).toMatchObject({ orderCount: 12, subscriptionMonths: 12, monthlyQuantity: 2, monthlyCny: 456, totalCny: 5472 });
    expect(result.orderIds).toEqual(Array.from({ length: 12 }, (_, index) => 1001 + index));
    expect(new Set(result.orderNos).size).toBe(12);
    expect(result.subscriptionGroupId).toHaveLength(32);
    expect(h.mocks.prepareMibanWalletPayment).toHaveBeenCalledWith(expect.objectContaining({ userId: USER_ID, totalCny: 5472 }));
    expect(h.mocks.reserveLimitedSkuStock).toHaveBeenCalledTimes(12);
    expect(h.mocks.createOrder).toHaveBeenCalledTimes(12);
    expect(h.mocks.debitMibanWalletPayment).toHaveBeenCalledTimes(1);
    expect(h.mocks.withGlobalWalletTransaction).toHaveBeenCalledTimes(1);
    expect(h.mocks.linkLimitedStockDeductionToOrder).toHaveBeenCalledTimes(12);
    expect(h.mocks.releaseLimitedSkuStock).not.toHaveBeenCalled();
    expect(h.events.indexOf("infrastructure")).toBeLessThan(h.events.indexOf("begin"));
    expect(h.events.indexOf("debit")).toBeGreaterThan(h.events.indexOf("create:12"));
    expect(h.events.at(-1)).toBe("commit");
    expect(h.committedOrders).toHaveLength(12);
    h.attemptedOrders.forEach((order, index) => {
      expect(order).toMatchObject({ userId: USER_ID, totalPrice: "456.00", walletDeductCny: "456", walletDeductUsdt: "0", subscriptionMonths: 12, subscriptionIndex: index + 1, subscriptionGroupId: result.subscriptionGroupId, scheduledShipDate: result.scheduledShipDates[index] });
      expect(JSON.parse(order.ingredients)[0]).toMatchObject({ productKey, skuId, quantity: 2, unitPriceCny: 228, lineTotalCny: 456, commissionEligible: true, commissionBaseCny: 456 });
      expect(h.mocks.reserveLimitedSkuStock.mock.calls[index]).toEqual([productKey, skuId, 2, USER_ID, result.orderNos[index]]);
    });
    expect(result.scheduledShipDates[0]).toBe("2026-02-01");
  });

  it("CNY/USDT/BTC 12期原币BigInt严格守恒，各币原生精度及最后一期尾差不丢失", async () => {
    const h = harness();
    const paymentAssets = [{ assetCode: "CNY", amount: "100.01" }, { assetCode: "USDT", amount: "700.00000001" }, { assetCode: "BTC", amount: "0.004719899999300001" }];
    await h.run({ ...baseInput(), cnyAmount: 100.01, paymentAssets });
    const { payment, orders } = h.mocks.debitMibanWalletPayment.mock.calls[0][0];
    expect(orders).toHaveLength(12);
    expect(payment.deductions.map((row: any) => ({ assetCode: row.assetCode, amount: row.amount }))).toEqual(paymentAssets);
    for (const asset of paymentAssets) {
      const rows = orders.map((order: any) => order.deductions.find((row: any) => row.assetCode === asset.assetCode));
      const units = rows.map((row: any) => paymentPure.paymentDecimalUnits(row?.amount ?? "0"));
      const total = paymentPure.paymentDecimalUnits(asset.amount);
      const quantum = 10n ** BigInt(asset.assetCode === "CNY" ? 16 : asset.assetCode === "USDT" ? 10 : 0);
      expect(units.reduce((sum: bigint, amount: bigint) => sum + amount, 0n)).toBe(total);
      expect(units.slice(0, 11).every((amount: bigint) => amount === units[0] && amount % quantum === 0n)).toBe(true);
      expect(units[11]).toBe(total - units[0] * 11n);
      rows.forEach((row: any) => {
        expect(paymentPure.paymentDecimalUnits(row.cnyValue)).toBe(paymentPure.paymentDecimalUnits(row.amount) * paymentPure.paymentDecimalUnits(row.priceCny) / (10n ** 18n));
        expect(row.priceCny).toBe(payment.deductions.find((item: any) => item.assetCode === asset.assetCode).priceCny);
      });
    }
  });

  it.each([
    ["其他品牌产品key", { productKey: "herbalife-red-ginseng" }],
    ["零数量", { quantity: 0 }], ["负数量", { quantity: -1 }], ["小数数量", { quantity: 1.5 }],
    ["字符串数量", { quantity: "2" }], ["超过总上限", { quantity: 11 }], ["无穷数量", { quantity: Infinity }],
    ["缺token", { paymentQuoteToken: undefined }], ["空token", { paymentQuoteToken: "  " }],
    ["缺所选币量", { paymentAssets: undefined }], ["空所选币量", { paymentAssets: [] }],
  ])("输入层拒绝%s，不发生业务调用", async (_label, override) => {
    const h = harness();
    await expect(h.run({ ...baseInput(), ...override })).rejects.toThrow();
    expect(h.mocks.assertAiWalletOperationEnabled).not.toHaveBeenCalled();
    expect(h.mocks.reserveLimitedSkuStock).not.toHaveBeenCalled();
    expect(h.mocks.debitMibanWalletPayment).not.toHaveBeenCalled();
  });

  it.each([
    ["目录品牌非米大娘", { product: { brand: "康宝莱" } }, {}, "米大娘"],
    ["商品停售", { product: { status: "off_sale" } }, {}, "米大娘"],
    ["SKU关闭", { sku: { active: false } }, {}, "规格"],
    ["不存在SKU", {}, { skuId: "unknown-sku" }, "规格"],
    ["服务端SKU数量上限", { sku: { maxPurchaseQty: 1 } }, {}, "最多"],
    ["非法服务端价格", { sku: { priceCny: NaN } }, {}, "金额"],
    ["不能回退legacy支付", { nullPayment: true }, {}, "签名"],
    ["CNY字段不能覆盖币量", {}, { cnyAmount: 1 }, "分配额"],
    ["签名依赖拒绝token", {}, { paymentQuoteToken: "invalid-token" }, "签名"],
    ["过低支付额不能覆盖服务端SKU价", {}, { cnyAmount: 1, paymentAssets: [{ assetCode: "CNY", amount: "1" }] }, "不足"],
    ["无效汇率", { rate: "0" }, {}, "汇率"],
  ] as Array<[string, Options, Record<string, unknown>, string]>)("服务端拒绝%s且不占库不建单", async (_label, options, override, message) => {
    const h = harness(options);
    await expect(h.run({ ...baseInput(), ...override })).rejects.toThrow(message);
    expect(h.mocks.reserveLimitedSkuStock).not.toHaveBeenCalled();
    expect(h.mocks.withGlobalWalletTransaction).not.toHaveBeenCalled();
    expect(h.mocks.debitMibanWalletPayment).not.toHaveBeenCalled();
  });

  it.each([1, 6, 12])("第%d月预占抛错，仅释放此前全部成功月份", async failedMonth => {
    const h = harness({ reserveFailAt: failedMonth });
    await expect(h.run()).rejects.toThrow(`reserve-failed:${failedMonth}`);
    expectReleased(h, orderNumbers(failedMonth - 1));
    expect(h.mocks.withGlobalWalletTransaction).not.toHaveBeenCalled();
    expect(h.mocks.createOrder).not.toHaveBeenCalled();
  });

  it.each([
    ["第1月订单创建", { createFailAt: 1 }, "create-failed:1"],
    ["第7月订单创建", { createFailAt: 7 }, "create-failed:7"],
    ["第12月订单创建", { createFailAt: 12 }, "create-failed:12"],
    ["库存关联", { linkFailAt: 8 }, "link-failed:8"],
    ["全年一次扣款", { debitFailure: true }, "debit-failed"],
    ["钱包事务提交", { commitFailure: true }, "commit-failed"],
    ["奖金快照", { snapshotFailure: true }, "snapshot-failed"],
  ] as Array<[string, Options, string]>)("%s失败释放全部12月预占；无成功月单提交", async (_label, options, error) => {
    const h = harness(options);
    await expect(h.run()).rejects.toThrow(error);
    expectReleased(h, orderNumbers(12));
    expect(h.committedOrders).toEqual([]);
    if (!options.snapshotFailure) expect(h.events.indexOf("rollback")).toBeLessThan(h.events.indexOf("release:1"));
    if (options.createFailAt || options.linkFailAt || options.snapshotFailure) expect(h.mocks.debitMibanWalletPayment).not.toHaveBeenCalled();
  });

  it("库存回补第1和第5次抛错，仍尝试余下全部月份且明确报告失败", async () => {
    const h = harness({ debitFailure: true, releaseFailAt: [1, 5] });
    let error: any;
    try { await h.run(); } catch (caught) { error = caught; }
    expect(error).toMatchObject({ code: "INTERNAL_SERVER_ERROR", message: expect.stringContaining("部分预留库存释放失败") });
    expect(error.cause.message).toBe("release-failed:1");
    expectReleased(h, orderNumbers(12));
    expect(h.events.at(-1)).toBe("release:12");
  });

  it("不限库存返回false不是预占失败，不错误关联或回补这些月份", async () => {
    const h = harness({ unlimitedAt: [1, 5, 12], debitFailure: true });
    await expect(h.run()).rejects.toThrow("debit-failed");
    const reserved = orderNumbers(12).filter((_number, index) => ![1, 5, 12].includes(index + 1));
    expect(h.mocks.linkLimitedStockDeductionToOrder).toHaveBeenCalledTimes(9);
    expectReleased(h, reserved);
  });
});

describe("纯年单日期：UTC+8公历月底夹紧", () => {
  it("固定12期，1月31日遇非闰年2月夹到28，3月恢复31且跨年", () => {
    expect(MIDANIANG_ANNUAL_MONTHS).toBe(12);
    expect(getMidaniangAnnualShipDates(new Date("2026-01-31T04:00:00Z"))).toEqual([
      "2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30", "2026-05-31", "2026-06-30",
      "2026-07-31", "2026-08-31", "2026-09-30", "2026-10-31", "2026-11-30", "2026-12-31",
    ]);
  });
  it("闰年2月夹到29，后续月份仍按首月31日计算", () => {
    expect(getMidaniangAnnualShipDates(new Date("2028-01-31T03:00:00Z")).slice(0, 4)).toEqual(["2028-01-31", "2028-02-29", "2028-03-31", "2028-04-30"]);
  });
  it("UTC 12月31日16:00已是北京时间新年，不能误用UTC日期", () => {
    const dates = getMidaniangAnnualShipDates(new Date("2026-12-31T16:00:00Z"));
    expect(dates).toHaveLength(12);
    expect(dates[0]).toBe("2027-01-01");
    expect(dates[11]).toBe("2027-12-01");
    expect(getMidaniangAnnualShipDates(new Date("2026-12-31T15:59:59Z"))[0]).toBe("2026-12-31");
  });
  it("无效基准日期明确拒绝", () => {
    expect(() => getMidaniangAnnualShipDates(new Date("invalid"))).toThrow("基准日期无效");
  });
});
