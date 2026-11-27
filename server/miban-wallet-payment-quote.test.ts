import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { z } from "zod";
import { buildMibanWalletPaymentQuote, verifyMibanPaymentQuoteToken } from "./miban-wallet-payment-quote";
import { getMibanOrderWalletPaymentSummary, paymentDecimalUnits } from "../shared/miban-wallet-payment";
import { mibanInvoiceRequestSchema } from "../shared/miban-invoice";
import { mibanReceiverPhoneSchema } from "../shared/miban-shipping";

const now = Date.parse("2026-11-22T04:45:00.000Z");
const key = "isolated-unit-test-key-no-production-access";
const fixture = () => ({
  userId: 28,
  key,
  now,
  cny: { total: "20", frozen: "30", available: "-10" },
  usdt: { total: "100", frozen: "20", available: "80" },
  balances: [
    { assetCode: "ETH", availableBalance: "0.123456789012345678", frozenBalance: "0.5" },
    { assetCode: "SOL", availableBalance: "2", frozenBalance: "1" },
    { assetCode: "BTC", availableBalance: "0", frozenBalance: "1" },
    { assetCode: "AAPL", availableBalance: "100", frozenBalance: "0" },
  ],
  market: {
    prices: { ETH: 2000, SOL: 100, BTC: 90000, AAPL: 250 },
    updatedAt: { ETH: new Date(now - 10_000).toISOString(), SOL: new Date(now - 10_000).toISOString(), BTC: new Date(now - 10_000).toISOString(), AAPL: new Date(now - 10_000).toISOString() },
    health: { ETH: { stale: false }, SOL: { stale: false }, BTC: { stale: false }, AAPL: { stale: false } },
    usdtCnyRate: 6.5,
    usdtCnyFx: { stale: false, observedAt: new Date(now - 1000).toISOString() },
  },
});

describe("miban wallet payment signed quote", () => {
  it("binds valid server pricing to the current user for exactly 60 seconds", () => {
    const quote = buildMibanWalletPaymentQuote(fixture());
    const verified = verifyMibanPaymentQuoteToken(quote.quoteToken, 28, key, now);
    expect(Date.parse(verified.expiresAt) - Date.parse(verified.quotedAt)).toBe(60_000);
    expect(verified.assets.find(row => row.assetCode === "ETH")).toMatchObject({ priceCny: "13000", priceUsdt: "2000" });
    expect(verified.usdtCnyRate).toBe("6.5");
  });
  it("retains native precision and already-net available without subtracting frozen again", () => {
    const quote = buildMibanWalletPaymentQuote(fixture());
    expect(quote.assets.find(row => row.assetCode === "ETH")).toMatchObject({ available: "0.123456789012345678", frozen: "0.5" });
    expect(quote.assets.find(row => row.assetCode === "USDT")).toMatchObject({ available: "80", frozen: "20" });
  });
  it("does not let negative unused CNY or frozen-only BTC disable available digital balances", () => {
    const quote = buildMibanWalletPaymentQuote(fixture());
    const verified = verifyMibanPaymentQuoteToken(quote.quoteToken, 28, key, now);
    expect(quote.assets.find(row => row.assetCode === "CNY")?.available).toBe("-10");
    expect(quote.assets.find(row => row.assetCode === "BTC")?.unavailableReason).toContain("冻结");
    expect(verified.assets.map(row => row.assetCode)).toEqual(["USDT", "ETH", "SOL"]);
  });
  it("never includes securities or commodities in a digital-coin quote", () => {
    expect(buildMibanWalletPaymentQuote(fixture()).assets.some(row => row.assetCode === "AAPL")).toBe(false);
  });
  it("rejects another user's quote", () => {
    expect(() => verifyMibanPaymentQuoteToken(buildMibanWalletPaymentQuote(fixture()).quoteToken, 29, key, now)).toThrow("当前用户");
  });
  it("rejects wrong signing keys and payload or signature tampering", () => {
    const quote = buildMibanWalletPaymentQuote(fixture());
    expect(() => verifyMibanPaymentQuoteToken(quote.quoteToken, 28, key + "-other", now)).toThrow("验签");
    const [encoded, signature] = quote.quoteToken.split(".");
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString());
    payload.assets[0].priceCny = "99999";
    const changed = Buffer.from(JSON.stringify(payload)).toString("base64url") + "." + signature;
    expect(() => verifyMibanPaymentQuoteToken(changed, 28, key, now)).toThrow("验签");
  });
  it("rejects equivalent noncanonical signature encodings that could bypass one-use token hashing", () => {
    const [encoded, signature] = buildMibanWalletPaymentQuote(fixture()).quoteToken.split(".");
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const index = alphabet.indexOf(signature.at(-1)!);
    const alternate = signature.slice(0, -1) + alphabet[index + 1];
    expect(Buffer.from(alternate, "base64url").equals(Buffer.from(signature, "base64url"))).toBe(true);
    expect(() => verifyMibanPaymentQuoteToken(`${encoded}.${alternate}`, 28, key, now)).toThrow("验签");
  });
  it("rejects exact-expiry and post-expiry even if pricing was previously valid", () => {
    const quote = buildMibanWalletPaymentQuote(fixture());
    expect(() => verifyMibanPaymentQuoteToken(quote.quoteToken, 28, key, now + 60_000)).toThrow("过期");
    expect(() => verifyMibanPaymentQuoteToken(quote.quoteToken, 28, key, now + 60_001)).toThrow("过期");
  });
  it("fails closed without a configured nontrivial signing key", () => {
    expect(() => buildMibanWalletPaymentQuote({ ...fixture(), key: "" })).toThrow("签名未配置");
    expect(() => buildMibanWalletPaymentQuote({ ...fixture(), key: "short" })).toThrow("签名未配置");
  });
  it("does not use stale or missing FX or a zero fallback for payment", () => {
    const input = fixture();
    expect(() => buildMibanWalletPaymentQuote({ ...input, market: { ...input.market, usdtCnyRate: null } })).toThrow("汇率");
    expect(() => buildMibanWalletPaymentQuote({ ...input, market: { ...input.market, usdtCnyFx: { stale: true } } })).toThrow("汇率");
    expect(() => buildMibanWalletPaymentQuote({ ...input, market: { ...input.market, usdtCnyRate: 0 } })).toThrow("汇率");
  });
  it.each(["stale-health", "old-timestamp", "missing-price", "zero-price"])("disables only invalid quote rows: %s", mode => {
    const input = fixture();
    if (mode === "stale-health") input.market.health.ETH.stale = true;
    if (mode === "old-timestamp") input.market.updatedAt.ETH = new Date(now - 120_001).toISOString();
    if (mode === "missing-price") delete (input.market.prices as Record<string, number>).ETH;
    if (mode === "zero-price") input.market.prices.ETH = 0;
    const quote = buildMibanWalletPaymentQuote(input);
    expect(quote.assets.find(row => row.assetCode === "ETH")?.priceCny).toBeNull();
    expect(quote.assets.find(row => row.assetCode === "SOL")?.priceCny).toBe("650");
    expect(verifyMibanPaymentQuoteToken(quote.quoteToken, 28, key, now).assets.some(row => row.assetCode === "ETH")).toBe(false);
  });
  it("rejects corrupt negative frozen rows rather than making them spendable", () => {
    const input = fixture();
    input.balances[0].frozenBalance = "-1";
    expect(() => buildMibanWalletPaymentQuote(input)).toThrow("冻结台账异常");
  });
  it("rejects malformed and oversized tokens", () => {
    for (const token of ["", "no.signature+", ".", "a".repeat(16001)]) expect(() => verifyMibanPaymentQuoteToken(token, 28, key, now)).toThrow();
  });
  it("retains the exact signed/native price product rather than lossy floating multiplication", () => {
    const input = fixture();
    input.market.prices.ETH = 1234.5678901234567;
    const row = buildMibanWalletPaymentQuote(input).assets.find(row => row.assetCode === "ETH")!;
    expect(paymentDecimalUnits(row.priceCny!)).toBe(paymentDecimalUnits(String(input.market.prices.ETH)) * paymentDecimalUnits("6.5") / (10n ** 18n));
  });
});

describe("four actual checkout quote schemas / no router execution", () => {
  const source = readFileSync(new URL("./miban.ts", import.meta.url), "utf8");
  const ast = ts.createSourceFile("miban.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const routes = [
    ["mibanOrderRouter", "create", "order.create", false],
    ["mibanLimitedProductRouter", "createAnnualOrder", "limitedProduct.createAnnualOrder", true],
    ["mibanLimitedProductRouter", "createOrder", "limitedProduct.createOrder", false],
    ["mibanLimitedProductRouter", "createCartOrder", "limitedProduct.createCartOrder", false],
  ] as const;
  function schemaFor(routerName: string, routeName: string): z.ZodObject<any> {
    let schemaExpression: ts.Expression | undefined;
    for (const node of ast.statements) if (ts.isVariableStatement(node)) {
      for (const declaration of node.declarationList.declarations) {
        if (declaration.name.getText(ast) !== routerName || !declaration.initializer || !ts.isCallExpression(declaration.initializer)) continue;
        const object = declaration.initializer.arguments[0];
        if (!ts.isObjectLiteralExpression(object)) continue;
        const route = object.properties.find(property => ts.isPropertyAssignment(property) && property.name.getText(ast) === routeName);
        if (!route || !ts.isPropertyAssignment(route)) continue;
        const visit = (child: ts.Node) => {
          if (ts.isCallExpression(child) && ts.isPropertyAccessExpression(child.expression) && child.expression.name.text === "input") {
            schemaExpression = child.arguments[0];
          }
          ts.forEachChild(child, visit);
        };
        visit(route.initializer);
      }
    }
    if (!schemaExpression) throw new Error(`真实输入schema缺失: ${routerName}.${routeName}`);
    // 仅运行 input 参数，不运行 procedure/resolver；VM 无 require、process、fetch 或真实业务依赖。
    const js = ts.transpileModule(`(${schemaExpression.getText(ast)});`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
    return new vm.Script(js).runInContext(vm.createContext({ z, mibanReceiverPhoneSchema, mibanInvoiceRequestSchema }, {
      codeGeneration: { strings: false, wasm: false },
    }), { timeout: 1000 });
  }
  it("paymentAssets schema belongs to exactly the four released order routes", () => {
    const actualPaths: string[] = [];
    for (const node of ast.statements) if (ts.isVariableStatement(node)) {
      for (const declaration of node.declarationList.declarations) {
        if (!declaration.initializer || !ts.isCallExpression(declaration.initializer)) continue;
        const object = declaration.initializer.arguments[0];
        if (!object || !ts.isObjectLiteralExpression(object)) continue;
        for (const property of object.properties) if (ts.isPropertyAssignment(property)) {
          const visit = (child: ts.Node) => {
            if (ts.isPropertyAssignment(child) && child.name.getText(ast) === "paymentAssets" && child.initializer.getText(ast).startsWith("z.array(")) {
              actualPaths.push(`${declaration.name.getText(ast)}.${property.name.getText(ast)}`);
            }
            ts.forEachChild(child, visit);
          };
          visit(property.initializer);
        }
      }
    }
    expect(actualPaths).toEqual(routes.map(([routerName, routeName]) => `${routerName}.${routeName}`));
    expect(source.match(/paymentAssets: z\.array/g)).toHaveLength(4);
  });
  it.each(routes)("%s.%s retains exact native fields and optional real invoice schema (%s)", (routerName, routeName, _path, annual) => {
    const schema = schemaFor(routerName, routeName);
    const native = [{ assetCode: "ETH", amount: "0.000000000000000001" }];
    expect(schema.shape.paymentAssets.parse(native)).toEqual(native);
    expect(() => schema.shape.paymentAssets.parse([])).toThrow();
    expect(() => schema.shape.paymentAssets.parse(Array.from({ length: 37 }, () => native[0]))).toThrow();
    expect(() => schema.shape.paymentAssets.parse([{ assetCode: "ETH", amount: 1 }])).toThrow();
    expect(schema.shape.paymentAssets.isOptional()).toBe(!annual);
    expect(schema.shape.paymentQuoteToken.isOptional()).toBe(!annual);
    expect(() => schema.shape.paymentQuoteToken.parse("x".repeat(16001))).toThrow();
    if (annual) {
      expect(() => schema.shape.paymentAssets.parse(undefined)).toThrow();
      expect(() => schema.shape.paymentQuoteToken.parse("  ")).toThrow();
    }
    expect(schema.shape.invoiceRequest.parse(undefined)).toBeUndefined();
    expect(schema.shape.invoiceRequest.parse({ type: "personal", title: " 个人 ", taxNo: "残留税号" })).toEqual({ type: "personal", title: "个人" });
    expect(schema.shape.invoiceRequest.parse({ type: "company", title: " 公司 ", taxNo: " 非18位税号 " })).toEqual({ type: "company", title: "公司", taxNo: "非18位税号" });
    expect(() => schema.shape.invoiceRequest.parse({ type: "company", title: "公司" })).toThrow();
  });
});

describe("native wallet order display", () => {
  it("shows native coin snapshots, including tiny amounts, without current market repricing", () => {
    expect(getMibanOrderWalletPaymentSummary({ walletPayments: [{ assetCode: "ETH", amount: "0.000000000000000001" }, { assetCode: "SOL", amount: "2" }] })).toBe("0.000000000000000001 ETH + 2 SOL");
  });
  it("keeps absent or empty side-table records on the old-order compatibility path", () => {
    expect(getMibanOrderWalletPaymentSummary({})).toBeNull();
    expect(getMibanOrderWalletPaymentSummary({ walletPayments: [] })).toBeNull();
  });
  it("does not invent zero-paid U when native payment data is corrupt", () => {
    expect(getMibanOrderWalletPaymentSummary({ walletPayments: [{ assetCode: "AAPL", amount: "1" }] })).toBe("支付记录待核实");
  });
});
