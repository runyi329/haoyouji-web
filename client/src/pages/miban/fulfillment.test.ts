import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import {
  fulfillmentShippingCsv,
  fulfillmentShippingXlsx,
  parseFulfillmentCsv,
  parseFulfillmentXlsx,
  preflightFulfillmentXlsx,
  inspectFulfillmentZip,
  splitUnfilledFulfillmentRows,
  fulfillmentFailuresCsv,
} from "./fulfillmentFiles";
import {
  applyFulfillmentBatches,
  previewFulfillmentBatches,
  fulfillmentModeError,
  validateFulfillmentDrafts,
  onlyFailedFulfillmentRows,
  isFulfillmentOrderQuery,
  fulfillmentCandidateFromOrder,
  type FulfillmentCandidate,
  type FulfillmentRow,
  type FulfillmentOutcome,
} from "./fulfillmentModel";
const candidate: FulfillmentCandidate = {
  id: 1,
  orderNo: "00012345678901234567890123",
  status: "confirmed",
  receiverName: "张,女士",
  receiverPhone: "0013800000000",
  receiverAddress: "上海\n二区",
  trackingCompany: null,
  trackingNo: null,
  products: "四季水果",
  specifications: "礼盒",
  quantities: "2盒",
};
const row: FulfillmentRow = {
  orderNo: candidate.orderNo,
  trackingCompany: "顺丰",
  trackingNo: "00012345678901234567890123",
};
const header = "订单号,快递公司,快递单号\r\n";
test("CSV handles RFC4180, BOM, arbitrary headers and text tracking identifiers", () => {
  const rows = parseFulfillmentCsv(
    '\uFEFF商品,trackingNo,收货人,trackingCompany,orderNo\r\n"米,粥",00012345678901234567890123,"张\n女士",顺丰,A1'
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].trackingNo, row.trackingNo);
  assert.equal(rows[0].trackingCompany, "顺丰速运");
  assert.equal(rows[0].error, undefined);
  assert.equal(rows[0].orderNo, "A1");
});
test("CSV rejects bad quotes, ambiguous headers, scientific and formula identifiers", () => {
  assert.throws(() => parseFulfillmentCsv(header + 'A1,"顺丰,123'), /未闭合/);
  assert.throws(() => parseFulfillmentCsv(header + 'A1,"顺丰"x,123'), /多余/);
  assert.throws(
    () =>
      parseFulfillmentCsv("订单号,orderNo,快递公司,快递单号\nA1,A1,中通,12"),
    /唯一/
  );
  for (const tracking of ["1.23456E+20", "=1+1", "+123", "@SUM(A1)", "-123"]) {
    assert.ok(parseFulfillmentCsv(header + `A1,中通,${tracking}`)[0].error);
  }
  assert.match(
    parseFulfillmentCsv(header + "A1,中通,123,x")[0].error ?? "",
    /列数/
  );
});
test("CSV accepts 500 but rejects 501 rows and oversized source", () => {
  const rows = Array.from(
    { length: 500 },
    (_, index) => `A${index},中通,00${index}`
  ).join("\n");
  assert.equal(parseFulfillmentCsv(header + rows).length, 500);
  assert.throws(
    () => parseFulfillmentCsv(header + rows + "\nA501,中通,001"),
    /500/
  );
  assert.throws(() => parseFulfillmentCsv("x".repeat(1024 * 1024 + 1)), /1MB/);
});
test("blank template logistics skipped explicitly; partial logistics kept with error", () => {
  const rows = parseFulfillmentCsv(header + "A1,,\nA2,中通,\nA3,中通,123");
  const result = splitUnfilledFulfillmentRows(rows);
  assert.equal(result.unfilled.length, 1);
  assert.equal(result.filled.length, 2);
  assert.match(result.filled[0].error ?? "", /缺少快递单号/);
});
test("CSV download escapes formulas, commas, newline and preserves long numeric ids as text", () => {
  const csv = fulfillmentShippingCsv([
    { ...candidate, products: '=HYPERLINK("https://invalid")' },
  ]);
  assert.ok(csv.includes(`"'${candidate.orderNo}"`));
  assert.ok(csv.includes('"\'0013800000000"'));
  assert.ok(csv.includes("'" + '=HYPERLINK(""'));
  const input = csv.replace(
    /"",""\r\n$/,
    '"中通","\'00012345678901234567890123"\r\n'
  );
  const parsed = parseFulfillmentCsv(input);
  assert.equal(parsed[0].orderNo, candidate.orderNo);
  assert.equal(parsed[0].trackingNo, row.trackingNo);
  assert.equal(parsed[0].error, undefined);
});
test("XLSX export stores order, phone and empty editable logistics as text; exact long number import", async () => {
  const bytes = await fulfillmentShippingXlsx([candidate]);
  const ExcelJS = await import("exceljs");
  const book = new ExcelJS.default.Workbook();
  await book.xlsx.load(
    bytes.buffer as unknown as Parameters<typeof book.xlsx.load>[0]
  );
  const sheet = book.worksheets[0];
  assert.equal(sheet.getCell("A2").value, candidate.orderNo);
  assert.equal(sheet.getCell("A2").numFmt, "@");
  assert.equal(sheet.getCell("C2").value, candidate.receiverPhone);
  assert.equal(sheet.getCell("I2").numFmt, "@");
  sheet.getCell("H2").value = "顺丰";
  sheet.getCell("I2").value = row.trackingNo;
  const parsed = await parseFulfillmentXlsx(
    new Uint8Array(await book.xlsx.writeBuffer())
  );
  assert.equal(parsed[0].trackingNo, row.trackingNo);
  assert.equal(parsed[0].error, undefined);
});
async function customBook(
  value: string | number | { formula: string; result: number },
  fmt?: string
): Promise<Uint8Array> {
  const ExcelJS = await import("exceljs");
  const book = new ExcelJS.default.Workbook();
  const sheet = book.addWorksheet("Sheet");
  sheet.addRow(["订单号", "快递公司", "快递单号"]);
  sheet.addRow(["A1", "中通", value]);
  if (fmt) sheet.getCell("C2").numFmt = fmt;
  return new Uint8Array(await book.xlsx.writeBuffer());
}
test("XLSX strictly rejects formulas, numeric >15 digits and scientific values or format", async () => {
  for (const [value, fmt] of [
    [{ formula: "1+1", result: 2 }, undefined],
    [1234567890123456, undefined],
    [1.23e20, undefined],
    [123, "0.00E+00"],
    ["1.2E+20", undefined],
  ] as const) {
    const bytes = await customBook(value, fmt);
    if (typeof value === "string")
      assert.match(
        (await parseFulfillmentXlsx(bytes))[0].error ?? "",
        /科学计数/
      );
    else
      await assert.rejects(
        () => parseFulfillmentXlsx(bytes),
        /公式|精度|科学计数/
      );
  }
});
test("ZIP precheck rejects malformed, fake size, macros, far cells and multiple sheets", async () => {
  assert.throws(() => inspectFulfillmentZip(new Uint8Array(25)), /ZIP/);
  const original = await customBook("123");
  const entries = inspectFulfillmentZip(original);
  assert.ok(entries.some(entry => entry.name === "xl/workbook.xml"));
  const forged = original.slice();
  const view = new DataView(forged.buffer);
  for (let i = 0; i < forged.length - 46; i++)
    if (view.getUint32(i, true) === 0x02014b50) {
      view.setUint32(i + 24, 100 * 1024 * 1024, true);
      break;
    }
  assert.throws(() => inspectFulfillmentZip(forged), /展开/);
  const lying = original.slice();
  const lie = new DataView(lying.buffer);
  for (let i = 0; i < lying.length - 46; i++)
    if (
      lie.getUint32(i, true) === 0x02014b50 &&
      lie.getUint32(i + 24, true) > 10
    ) {
      lie.setUint32(i + 24, 1, true);
      break;
    }
  await assert.rejects(() => preflightFulfillmentXlsx(lying), /展开/);
  const ExcelJS = await import("exceljs");
  const book = new ExcelJS.default.Workbook();
  book.addWorksheet("Sheet1").addRow(["订单号", "快递公司", "快递单号"]);
  book.addWorksheet("Sheet2");
  await assert.rejects(() => parseFulfillmentXlsxPromise(book), /一张工作表/);
  const far = new ExcelJS.default.Workbook();
  const sheet = far.addWorksheet("Sheet");
  sheet.addRow(["订单号", "快递公司", "快递单号"]);
  sheet.getCell("XFD2").value = "x";
  await assert.rejects(() => parseFulfillmentXlsxPromise(far), /40列|40 列/);
});
async function parseFulfillmentXlsxPromise(book: import("exceljs").Workbook) {
  return parseFulfillmentXlsx(new Uint8Array(await book.xlsx.writeBuffer()));
}
test("ship/correct never mix; source authorization and duplicate tracking validated across batches", () => {
  assert.equal(fulfillmentModeError(candidate, "ship"), undefined);
  assert.ok(fulfillmentModeError(candidate, "correct"));
  assert.ok(fulfillmentModeError({ ...candidate, trackingNo: "old" }, "ship"));
  assert.equal(
    fulfillmentModeError({ ...candidate, status: "shipped" }, "correct"),
    undefined
  );
  for (const status of ["cancelled", "delivered"])
    for (const mode of ["ship", "correct"] as const)
      assert.ok(fulfillmentModeError({ ...candidate, status }, mode));
  const bad = validateFulfillmentDrafts(
    [row, { ...row, orderNo: "other", trackingCompany: "SF" }],
    [candidate],
    "ship"
  );
  assert.ok(bad.every(item => item.error?.includes("同一快递")));
  assert.ok(bad[1].error?.includes("授权"));
});
test("preview calls 100 chunks and requires customer, revision and exact order mapping", async () => {
  const input = Array.from({ length: 205 }, (_, index) => ({
    ...row,
    orderNo: `A${index}`,
  }));
  const sizes: number[] = [];
  const result = await previewFulfillmentBatches(input, async batch => {
    sizes.push(batch.length);
    return {
      validCount: batch.length,
      rows: batch.map((item, index) => ({
        ...item,
        index,
        ok: true,
        revision: "revision",
        order: { ...candidate, orderNo: item.orderNo, shippedAt: null },
      })),
    };
  });
  assert.deepEqual(sizes, [100, 100, 5]);
  assert.equal(result[204].index, 204);
  assert.ok(result.every(item => item.ok));
  const invalid = await previewFulfillmentBatches([row], async () => ({
    validCount: 1,
    rows: [{ ...row, index: 0, ok: true }],
  }));
  assert.equal(invalid[0].ok, false);
  const changed = await previewFulfillmentBatches([row], async () => ({
    validCount: 1,
    rows: [
      { ...row, trackingNo: "changed", index: 0, ok: true, revision: "x" },
    ],
  }));
  assert.equal(changed[0].ok, false);
});
test("apply separates successes, definite failures and unknown; only explicit failures retry", async () => {
  const rows = Array.from({ length: 205 }, (_, index) => ({
    ...row,
    orderNo: `A${index}`,
    revision: "rev",
  }));
  let calls = 0;
  const outcomes = await applyFulfillmentBatches(rows, async batch => {
    calls++;
    if (calls === 2) throw new Error("disconnected");
    return {
      successCount: batch.length - 1,
      results: batch
        .slice(0, -1)
        .map((item, index) => ({
          orderNo: item.orderNo,
          index,
          success: index !== 0,
          error: index === 0 ? "conflict" : undefined,
        })),
    };
  });
  assert.equal(outcomes.length, 205);
  assert.equal(outcomes.filter(item => item.state === "failed").length, 2);
  assert.equal(outcomes.filter(item => item.state === "unknown").length, 102);
  const retry = onlyFailedFulfillmentRows(outcomes);
  assert.deepEqual(
    retry.map(item => item.orderNo),
    ["A0", "A200"]
  );
  const csv = fulfillmentFailuresCsv(outcomes, []);
  assert.ok(!csv.includes('"A1",'));
  assert.ok(csv.includes("人工核验"));
});
test("query invalidation covers admin supplier and personal orders but excludes wallets", () => {
  for (const path of [
    ["supplier", "workspace"],
    ["supplier", "orders"],
    ["supplier", "stats"],
    ["miban", "order", "allOrders"],
    ["order", "myOrders"],
    ["order", "teamOrders"],
  ])
    assert.ok(isFulfillmentOrderQuery([path]));
  assert.equal(isFulfillmentOrderQuery([["wallet", "balance"]]), false);
});
test("admin and supplier use same protocol; legacy straight writes removed; paused admin retains action", () => {
  const page = (name: string) =>
    readFileSync(new URL(`./${name}.tsx`, import.meta.url), "utf8");
  const admin = page("UnifiedAdmin"),
    supplier = page("SupplierCenter"),
    common = page("FulfillmentPanel");
  assert.ok(admin.includes("FulfillmentPanel"));
  assert.ok(supplier.includes("FulfillmentPanel"));
  assert.ok(!admin.includes("importTrackingNumbers.useMutation"));
  assert.ok(!admin.includes('status: "shipped"'));
  assert.ok(!supplier.includes("supplierApi.ship"));
  assert.ok(!supplier.includes("supplierApi.batchShip"));
  assert.ok(
    supplier.includes(
      "const readonly = isAdmin ? readonlyReview : !supplier.active"
    )
  );
  assert.ok(supplier.includes('variant="thumbnail"'));
  assert.ok(supplier.includes("me.isSuccess"));
  assert.ok(common.includes("trpc.supplier.fulfillmentPreview"));
  assert.ok(common.includes("trpc.supplier.fulfillmentApply"));
  assert.ok(common.includes("onlyFailedFulfillmentRows"));
  assert.ok(common.includes("scopeKey"));
});
test("read-only candidate mapper handles ordinary and supplier DTOs without inferred authority", () => {
  const mapped = fulfillmentCandidateFromOrder({
    ...candidate,
    ingredients: JSON.stringify([{ name: "水果", skuName: "箱", quantity: 2 }]),
  });
  assert.equal(mapped?.products, "水果");
  assert.equal(mapped?.quantities, "2");
  assert.equal(fulfillmentCandidateFromOrder({ orderNo: "fake" }), null);
});
