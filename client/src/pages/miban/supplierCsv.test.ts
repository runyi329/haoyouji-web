import assert from "node:assert/strict";
import { test } from "node:test";
import { parseSupplierShippingCsv } from "./supplierCsv";

const header = "订单号,快递公司,快递单号\r\n";
test("parses BOM, CRLF and English headers without coercing tracking numbers", () => {
  const rows = parseSupplierShippingCsv(
    "\uFEFForderNo,trackingCompany,trackingNo\r\nA001,顺丰,000123\r\n"
  );
  assert.deepEqual(rows, [
    { line: 2, orderNo: "A001", trackingCompany: "顺丰", trackingNo: "000123" },
  ]);
});
test("preserves quoted commas and escaped quotes", () => {
  const rows = parseSupplierShippingCsv(
    header + 'A1,"快递,公司 ""华东""",0009'
  );
  assert.equal(rows[0].trackingCompany, '快递,公司 "华东"');
  assert.equal(rows[0].error, undefined);
});
test("supports reordered columns and extra exported CSV columns", () => {
  const rows = parseSupplierShippingCsv(
    "商品,快递单号,快递公司,订单号\n米,0101,中通,A1"
  );
  assert.equal(rows[0].orderNo, "A1");
  assert.equal(rows[0].trackingNo, "0101");
});
test("reads quoted multiline cells without shifting subsequent line numbers", () => {
  const rows = parseSupplierShippingCsv(
    header + 'A1,"快递\n公司",123\nA2,中通,456'
  );
  assert.match(rows[0].error ?? "", /换行/);
  assert.equal(rows[1].line, 4);
  assert.equal(rows[1].orderNo, "A2");
});
test("reports missing fields individually without dropping bad rows", () => {
  const rows = parseSupplierShippingCsv(
    header + "A1,中通,123\nA2,,\n,中通,456"
  );
  assert.equal(rows.length, 3);
  assert.equal(rows[0].error, undefined);
  assert.match(rows[1].error ?? "", /缺少快递公司.*缺少快递单号/);
  assert.match(rows[2].error ?? "", /缺少订单号/);
});
test("marks all duplicate order rows invalid", () => {
  const rows = parseSupplierShippingCsv(header + "A1,顺丰,123\nA1,顺丰,456");
  assert.ok(rows.every(row => row.error?.includes("重复")));
});
test("rejects unmatched quotes and invalid closing quote text", () => {
  assert.throws(
    () => parseSupplierShippingCsv(header + 'A1,"顺丰,123'),
    /未闭合/
  );
  assert.throws(
    () => parseSupplierShippingCsv(header + 'A1,"顺丰"错误,123'),
    /多余字符/
  );
});
test("requires correct headers and at least one data row", () => {
  assert.throws(
    () => parseSupplierShippingCsv("订单,公司,单号\nA1,顺丰,123"),
    /表头/
  );
  assert.throws(() => parseSupplierShippingCsv(header), /至少一行/);
});
test("accepts exactly 100 rows and rejects 101", () => {
  const csv = Array.from({ length: 100 }, (_, i) => `A${i},顺丰,00${i}`).join(
    "\n"
  );
  assert.equal(parseSupplierShippingCsv(header + csv).length, 100);
  assert.throws(
    () => parseSupplierShippingCsv(header + csv + "\nA101,顺丰,00101"),
    /最多导入 100 行/
  );
});
test("ignores blank records but validates mismatched columns", () => {
  const rows = parseSupplierShippingCsv(
    header + "\nA1,顺丰,123,额外值\n\nA2,顺丰,456"
  );
  assert.equal(rows.length, 2);
  assert.match(rows[0].error ?? "", /列数/);
  assert.equal(rows[1].error, undefined);
});
