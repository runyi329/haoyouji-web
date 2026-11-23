export type SupplierShippingCsvRow = {
  line: number;
  orderNo: string;
  trackingCompany: string;
  trackingNo: string;
  error?: string;
};

/** RFC 4180 cells, including escaped quotes and quoted newlines. Never split on commas. */
export function parseSupplierShippingCsv(
  source: string
): SupplierShippingCsvRow[] {
  const input = source.replace(/^\uFEFF/, "");
  const records: { line: number; cells: string[] }[] = [];
  let cells: string[] = [];
  let cell = "";
  let inQuotes = false;
  let closedQuote = false;
  let line = 1;
  let recordLine = 1;
  const pushCell = () => {
    cells.push(cell.trim());
    cell = "";
    closedQuote = false;
  };
  const pushRecord = () => {
    pushCell();
    if (cells.some(value => value !== ""))
      records.push({ line: recordLine, cells });
    cells = [];
  };
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
          closedQuote = true;
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
      recordLine = line;
      continue;
    }
    if (char === '"') {
      if (cell.trim() !== "" || closedQuote)
        throw new Error(`第 ${line} 行引号位置不正确。`);
      cell = "";
      inQuotes = true;
      continue;
    }
    if (closedQuote && !/\s/.test(char))
      throw new Error(`第 ${line} 行引号结束后存在多余字符。`);
    cell += char;
  }
  if (inQuotes) throw new Error(`第 ${recordLine} 行的引号未闭合。`);
  if (cell !== "" || cells.length > 0 || closedQuote) pushRecord();
  if (records.length < 2) throw new Error("CSV 需要表头和至少一行发货数据。");
  const normalize = (value: string) =>
    value.toLowerCase().replace(/[\s_-]/g, "");
  const headers = records[0].cells.map(normalize);
  const findHeader = (names: string[]) =>
    headers.findIndex(value => names.map(normalize).includes(value));
  const orderIndex = findHeader(["orderNo", "订单号"]);
  const companyIndex = findHeader(["trackingCompany", "快递公司", "物流公司"]);
  const trackingIndex = findHeader(["trackingNo", "快递单号", "物流单号"]);
  if ([orderIndex, companyIndex, trackingIndex].includes(-1))
    throw new Error(
      "表头需包含：订单号、快递公司、快递单号（或 orderNo、trackingCompany、trackingNo）。"
    );
  const data = records.slice(1);
  if (data.length > 100)
    throw new Error(
      `最多导入 100 行；当前有 ${data.length} 行，请拆分后重试。`
    );
  const counts = new Map<string, number>();
  for (const record of data) {
    const orderNo = record.cells[orderIndex] ?? "";
    if (orderNo) counts.set(orderNo, (counts.get(orderNo) ?? 0) + 1);
  }
  return data.map(record => {
    const orderNo = record.cells[orderIndex] ?? "";
    const trackingCompany = record.cells[companyIndex] ?? "";
    const trackingNo = record.cells[trackingIndex] ?? "";
    const errors: string[] = [];
    if (record.cells.length !== headers.length) errors.push("列数与表头不一致");
    if (!orderNo) errors.push("缺少订单号");
    if (!trackingCompany) errors.push("缺少快递公司");
    if (!trackingNo) errors.push("缺少快递单号");
    if ((counts.get(orderNo) ?? 0) > 1) errors.push("订单号在文件中重复");
    if (
      orderNo.length > 32 ||
      trackingCompany.length > 32 ||
      trackingNo.length > 64
    )
      errors.push("字段过长");
    if (
      [orderNo, trackingCompany, trackingNo].some(value =>
        /[\r\n\u0000]/.test(value)
      )
    )
      errors.push("发货字段不能含换行或空字符");
    return {
      line: record.line,
      orderNo,
      trackingCompany,
      trackingNo,
      ...(errors.length ? { error: errors.join("；") } : {}),
    };
  });
}
