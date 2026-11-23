import type { CellValue } from "exceljs";
import {
  validateFulfillmentDrafts,
  type FulfillmentCandidate,
  type FulfillmentDraft,
  type FulfillmentOutcome,
} from "./fulfillmentModel";

export const FULFILLMENT_FILE_LIMIT = 5 * 1024 * 1024;
const CSV_LIMIT = 1024 * 1024;
const ZIP_TOTAL_LIMIT = 20 * 1024 * 1024;
const ZIP_ENTRY_LIMIT = 8 * 1024 * 1024;
type RecordRow = { line: number; cells: string[] };
function recordsFromCsv(source: string): RecordRow[] {
  if (new TextEncoder().encode(source).byteLength > CSV_LIMIT)
    throw new Error("CSV 最大 1MB。");
  const input = source.replace(/^\uFEFF/, "");
  const records: RecordRow[] = [];
  let cells: string[] = [],
    cell = "",
    quoted = false,
    closed = false,
    line = 1,
    start = 1;
  const pushCell = () => {
    cells.push(cell.trim());
    cell = "";
    closed = false;
    if (cells.length > 40) throw new Error("最多 40 列。");
  };
  const pushRecord = () => {
    pushCell();
    if (cells.some(Boolean)) records.push({ line: start, cells });
    cells = [];
    if (records.length > 501) throw new Error("最多导入 500 行。");
  };
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else {
        cell += char;
        if (char === "\n" || (char === "\r" && input[i + 1] !== "\n")) line++;
      }
      continue;
    }
    if (char === ",") {
      pushCell();
      continue;
    }
    if (char === "\r" || char === "\n") {
      if (char === "\r" && input[i + 1] === "\n") i++;
      pushRecord();
      line++;
      start = line;
      continue;
    }
    if (char === '"') {
      if (cell.trim() || closed)
        throw new Error(`第 ${line} 行引号位置不正确。`);
      cell = "";
      quoted = true;
      continue;
    }
    if (closed && !/\s/.test(char))
      throw new Error(`第 ${line} 行引号结束后存在多余字符。`);
    cell += char;
  }
  if (quoted) throw new Error(`第 ${start} 行引号未闭合。`);
  if (cell || cells.length || closed) pushRecord();
  return records;
}
const normalizeHeader = (value: string) =>
  value
    .toLowerCase()
    .replace(/[\s_-]/g, "")
    .replace(/[（(]请填写[）)]/g, "");
function parseRecords(records: RecordRow[]): FulfillmentDraft[] {
  if (records.length < 2) throw new Error("需要表头和至少一行发货数据。");
  const headers = records[0].cells.map(normalizeHeader);
  const find = (names: string[]) => {
    const aliases = names.map(normalizeHeader);
    const indices = headers.flatMap((value, index) =>
      aliases.includes(value) ? [index] : []
    );
    if (indices.length !== 1)
      throw new Error("表头必须唯一包含：订单号、快递公司、快递单号。");
    return indices[0];
  };
  const order = find(["订单号", "orderNo"]),
    company = find(["快递公司", "物流公司", "trackingCompany"]),
    tracking = find(["快递单号", "物流单号", "运单号", "trackingNo"]);
  // Apostrophe is the deliberate CSV text marker, not a spreadsheet formula.
  const identifier = (value = "") =>
    /^'\d+$/.test(value) ? value.slice(1) : value;
  return validateFulfillmentDrafts(
    records
      .slice(1)
      .map(record => ({
        line: record.line,
        orderNo: identifier(record.cells[order]),
        trackingCompany: record.cells[company] ?? "",
        trackingNo: identifier(record.cells[tracking]),
        error:
          record.cells.length !== headers.length
            ? "列数与表头不一致"
            : undefined,
      }))
  );
}
export function parseFulfillmentCsv(source: string): FulfillmentDraft[] {
  return parseRecords(recordsFromCsv(source));
}
export function splitUnfilledFulfillmentRows(
  rows: readonly FulfillmentDraft[]
): { filled: FulfillmentDraft[]; unfilled: FulfillmentDraft[] } {
  // A downloaded blank template row is skipped only if BOTH logistics cells are blank.
  // Partially filled rows are retained as errors, never silently discarded.
  return {
    filled: rows.filter(
      row => row.trackingCompany.trim() || row.trackingNo.trim()
    ),
    unfilled: rows.filter(
      row => !row.trackingCompany.trim() && !row.trackingNo.trim()
    ),
  };
}
export function fulfillmentCsvCell(value: string): string {
  let text = value;
  if (
    /^[\s\u0000-\u001f]*[=+@-]/.test(text) ||
    /^[\t\r\n]/.test(text) ||
    /^\d+$/.test(text)
  )
    text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
const HEADERS = [
  "订单号",
  "收货人",
  "联系电话",
  "收货地址",
  "商品",
  "规格",
  "数量",
  "快递公司",
  "快递单号",
];
function shippingTable(orders: readonly FulfillmentCandidate[]): string[][] {
  if (orders.length > 500)
    throw new Error("发货表最多 500 笔，请缩小筛选或分批勾选。");
  if (!orders.length) throw new Error("当前没有可导出的订单。");
  return [
    HEADERS,
    ...orders.map(order => [
      order.orderNo,
      order.receiverName,
      order.receiverPhone,
      order.receiverAddress,
      order.products,
      order.specifications,
      order.quantities,
      "",
      "",
    ]),
  ];
}
export function fulfillmentShippingCsv(
  orders: readonly FulfillmentCandidate[]
): string {
  return tableCsv(shippingTable(orders));
}
function tableCsv(table: string[][]): string {
  return `\uFEFF${table.map(row => row.map(fulfillmentCsvCell).join(",")).join("\r\n")}\r\n`;
}
export function fulfillmentFailuresCsv(
  outcomes: readonly FulfillmentOutcome[],
  orders: readonly FulfillmentCandidate[]
): string {
  const candidates = new Map(orders.map(order => [order.orderNo, order]));
  return tableCsv([
    ["订单号", "收货人", "快递公司", "快递单号", "处理状态", "错误"],
    ...outcomes
      .filter(row => row.state !== "success")
      .map(row => [
        row.orderNo,
        candidates.get(row.orderNo)?.receiverName ?? "",
        row.trackingCompany,
        row.trackingNo,
        row.state === "failed"
          ? "失败（可重新预览）"
          : "结果不明（人工核验，禁止自动重试）",
        row.error ?? "服务端拒绝",
      ]),
  ]);
}
async function workbook() {
  const module = await import("exceljs");
  return new module.default.Workbook();
}
export async function fulfillmentShippingXlsx(
  orders: readonly FulfillmentCandidate[]
): Promise<Uint8Array> {
  const book = await workbook();
  const sheet = book.addWorksheet("发货表");
  sheet.addRows(shippingTable(orders));
  sheet.columns = HEADERS.map((_, index) => ({
    width: [28, 16, 22, 40, 36, 30, 20, 20, 30][index],
  }));
  sheet.eachRow(row =>
    row.eachCell({ includeEmpty: true }, cell => {
      cell.numFmt = "@";
      cell.value = String(cell.value ?? "");
    })
  );
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  return new Uint8Array(await book.xlsx.writeBuffer());
}
export function downloadFulfillmentFile(
  content: BlobPart,
  filename: string,
  mime: string
): void {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export type FulfillmentZipEntry = {
  name: string;
  compressed: number;
  expanded: number;
  method: number;
  offset: number;
};
/** ZIP central directory checked before loading ExcelJS/JSZip. ZIP64, encrypted and exotic methods rejected. */
export function inspectFulfillmentZip(
  bytes: Uint8Array
): FulfillmentZipEntry[] {
  if (bytes.length > FULFILLMENT_FILE_LIMIT || bytes.length < 22)
    throw new Error("XLSX 最大 5MB，或文件无效。");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (
      view.getUint32(i, true) === 0x06054b50 &&
      i + 22 + view.getUint16(i + 20, true) === bytes.length
    ) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("无效 ZIP 中央目录。");
  const count = view.getUint16(eocd + 10, true),
    size = view.getUint32(eocd + 12, true),
    offset = view.getUint32(eocd + 16, true);
  if (
    view.getUint16(eocd + 4, true) ||
    view.getUint16(eocd + 6, true) ||
    view.getUint16(eocd + 8, true) !== count ||
    count > 128 ||
    count === 65535 ||
    offset + size !== eocd
  )
    throw new Error("不支持多卷、ZIP64或过多 ZIP 条目。");
  let cursor = offset,
    total = 0;
  const entries: FulfillmentZipEntry[] = [],
    names = new Set<string>();
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > eocd || view.getUint32(cursor, true) !== 0x02014b50)
      throw new Error("损坏的 ZIP 目录。");
    const flags = view.getUint16(cursor + 8, true),
      method = view.getUint16(cursor + 10, true);
    const compressed = view.getUint32(cursor + 20, true),
      expanded = view.getUint32(cursor + 24, true);
    const nameSize = view.getUint16(cursor + 28, true),
      extra = view.getUint16(cursor + 30, true),
      comment = view.getUint16(cursor + 32, true),
      local = view.getUint32(cursor + 42, true);
    if (cursor + 46 + nameSize + extra + comment > eocd)
      throw new Error("损坏的 ZIP 条目。");
    const name = new TextDecoder("utf-8", { fatal: true }).decode(
      bytes.subarray(cursor + 46, cursor + 46 + nameSize)
    );
    if (
      flags & 1 ||
      ![0, 8].includes(method) ||
      /(^\/|\\|(^|\/)\.\.?(\/|$)|\u0000)/.test(name) ||
      names.has(name) ||
      /vbaProject|externalLinks|embeddings|\.bin$/i.test(name)
    )
      throw new Error("拒绝加密、宏、外部链接、重复或不安全 ZIP 路径。");
    if (
      expanded > ZIP_ENTRY_LIMIT ||
      compressed > FULFILLMENT_FILE_LIMIT ||
      expanded > Math.max(compressed, 1) * 200 ||
      (total += expanded) > ZIP_TOTAL_LIMIT
    )
      throw new Error("ZIP 展开体积或压缩比超限，拒绝载入。");
    if (
      local + 30 > offset ||
      view.getUint32(local, true) !== 0x04034b50 ||
      view.getUint16(local + 8, true) !== method ||
      view.getUint16(local + 6, true) !== flags
    )
      throw new Error("ZIP 本地头不匹配。");
    const localNameSize = view.getUint16(local + 26, true),
      localExtra = view.getUint16(local + 28, true);
    const dataOffset = local + 30 + localNameSize + localExtra;
    if (
      dataOffset + compressed > offset ||
      new TextDecoder().decode(
        bytes.subarray(local + 30, local + 30 + localNameSize)
      ) !== name
    )
      throw new Error("ZIP 数据越界或文件名不一致。");
    names.add(name);
    entries.push({ name, compressed, expanded, method, offset: dataOffset });
    cursor += 46 + nameSize + extra + comment;
  }
  if (
    cursor !== eocd ||
    !names.has("[Content_Types].xml") ||
    !names.has("xl/workbook.xml") ||
    entries.filter(entry =>
      /^xl\/worksheets\/sheet[^/]*\.xml$/.test(entry.name)
    ).length !== 1
  )
    throw new Error("仅支持包含一张工作表的 XLSX。");
  return entries;
}
async function boundedZipEntry(
  bytes: Uint8Array,
  entry: FulfillmentZipEntry
): Promise<Uint8Array> {
  const data = bytes.slice(entry.offset, entry.offset + entry.compressed);
  if (entry.method === 0) {
    if (data.length !== entry.expanded)
      throw new Error("ZIP 实际展开大小不符。");
    return data;
  }
  let decoder: DecompressionStream;
  try {
    decoder = new DecompressionStream("deflate-raw");
  } catch {
    throw new Error(
      "当前浏览器不支持安全 XLSX 解压，请使用 UTF-8 CSV 或更新浏览器。"
    );
  }
  const reader = new Blob([data]).stream().pipeThrough(decoder).getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const result = await reader.read();
      if (result.done) break;
      total += result.value.byteLength;
      if (total > entry.expanded || total > ZIP_ENTRY_LIMIT) {
        await reader.cancel();
        throw new Error("ZIP 实际展开体积超限。");
      }
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }
  if (total !== entry.expanded) throw new Error("ZIP 实际展开大小不符。");
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}
/** Validate actual expanded bytes too: a malicious archive can lie about directory sizes. */
export async function preflightFulfillmentXlsx(
  bytes: Uint8Array
): Promise<void> {
  const entries = inspectFulfillmentZip(bytes);
  for (const entry of entries) {
    const expanded = await boundedZipEntry(bytes, entry);
    if (!/\.xml$|\.rels$/.test(entry.name)) continue;
    const xml = new TextDecoder("utf-8", { fatal: true }).decode(expanded);
    if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("拒绝 XML 外部实体。");
    if (/^xl\/worksheets\//.test(entry.name)) {
      if (/<(?:\w+:)?f(?:\s|>)/i.test(xml))
        throw new Error("拒绝包含公式的工作表，请粘贴为纯文本值。");
      const rowMatches = Array.from(
        xml.matchAll(/<row\b[^>]*\br=["'](\d+)["']/g)
      );
      if (
        rowMatches.length > 501 ||
        rowMatches.some(match => Number(match[1]) > 501)
      )
        throw new Error("最多导入 500 行，不支持远端空白行。");
      for (const ref of Array.from(
        xml.matchAll(/<c\b[^>]*\br=["']([A-Z]+)(\d+)["']/g)
      )) {
        let column = 0;
        for (const char of ref[1])
          column = column * 26 + char.charCodeAt(0) - 64;
        if (column > 40 || Number(ref[2]) > 501)
          throw new Error("工作表单元格位置超限：最多500行、40列。");
      }
      for (const match of Array.from(
        xml.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)
      )) {
        if (/\bt=["']e["']/.test(match[1])) throw new Error("拒绝错误单元格。");
        if (!/\bt=["'](?:s|str|inlineStr|b)["']/.test(match[1])) {
          const value = /<v>([^<]*)<\/v>/.exec(match[2])?.[1] ?? "";
          if (
            /[eE]/.test(value) ||
            /^\d{16,}$/.test(value) ||
            (value && !Number.isSafeInteger(Number(value)))
          )
            throw new Error(
              "数值单元格可能丢失精度或为科学计数法，请按文本填写识别码。"
            );
        }
      }
    }
  }
}
function xlsxCellText(value: CellValue, numberFormat: string): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") {
    if (
      !Number.isSafeInteger(value) ||
      String(Math.abs(value)).length > 15 ||
      /[eE][+-]?0/.test(numberFormat)
    )
      throw new Error("数值精度/科学计数格式不安全，请按文本填写单号。");
    return String(value);
  }
  if (typeof value === "object" && "richText" in value)
    return value.richText.map(part => part.text).join("");
  throw new Error("拒绝公式、错误、日期、链接或非文本单元格，请转换为纯文本。");
}
export async function parseFulfillmentXlsx(
  bytes: Uint8Array
): Promise<FulfillmentDraft[]> {
  await preflightFulfillmentXlsx(bytes);
  const book = await workbook();
  // ExcelJS accepts ArrayBuffer at runtime, despite its Node Buffer declaration.
  const buffer = bytes.slice().buffer;
  await book.xlsx.load(
    buffer as unknown as Parameters<typeof book.xlsx.load>[0]
  );
  if (book.worksheets.length !== 1) throw new Error("只允许一张工作表。");
  const sheet = book.worksheets[0];
  if (sheet.rowCount > 501 || sheet.columnCount > 40)
    throw new Error("最多 500 行数据、40 列。");
  const records: RecordRow[] = [];
  sheet.eachRow(row => {
    const cells = Array.from({ length: sheet.columnCount }, (_, index) =>
      xlsxCellText(
        row.getCell(index + 1).value,
        row.getCell(index + 1).numFmt ?? ""
      ).trim()
    );
    if (cells.some(Boolean)) records.push({ line: row.number, cells });
  });
  return parseRecords(records);
}
export async function parseFulfillmentFile(
  file: File
): Promise<FulfillmentDraft[]> {
  if (file.size > FULFILLMENT_FILE_LIMIT)
    throw new Error("文件最大 5MB；CSV 最大 1MB。");
  if (/\.xlsx$/i.test(file.name))
    return parseFulfillmentXlsx(new Uint8Array(await file.arrayBuffer()));
  if (/\.csv$/i.test(file.name)) {
    if (file.size > CSV_LIMIT) throw new Error("CSV 最大 1MB。");
    return parseFulfillmentCsv(
      new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer())
    );
  }
  throw new Error("仅支持 .xlsx 和 UTF-8 .csv，不支持 .xls/.xlsm。");
}
