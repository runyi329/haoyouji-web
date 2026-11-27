import { getDbConnection } from "./db";
import { mibanInvoiceRequestSchema, type MibanInvoiceRequest } from "../shared/miban-invoice";

let infrastructure: Promise<void> | null = null;
const missingTable = (error: any) => (error?.code ?? error?.cause?.code) === "ER_NO_SUCH_TABLE";

/** 仅在开启发票或显式探测支持时调用，必须在钱包事务开始之前完成。 */
export async function ensureMibanOrderInvoiceInfrastructure(): Promise<void> {
  if (!infrastructure) infrastructure = (async () => {
    const connection = await getDbConnection();
    if (!connection) throw new Error("发票申请服务暂不可用");
    try {
      await connection.execute(`CREATE TABLE IF NOT EXISTS miban_order_invoice_requests (
        order_id INT NOT NULL,
        user_id INT NOT NULL,
        invoice_type ENUM('personal', 'company') NOT NULL,
        invoice_title VARCHAR(200) NOT NULL,
        tax_no VARCHAR(100) NULL,
        requested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (order_id),
        KEY idx_miban_order_invoice_user (user_id, order_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`, []);
    } finally {
      await connection.end();
    }
  })().catch(() => {
    infrastructure = null;
    // 不传播驱动错误或SQL，避免发票资料意外进入上层日志。
    throw new Error("发票申请服务初始化失败，请稍后重试");
  });
  await infrastructure;
}

/** 调用方提供新订单ID、当前用户和原钱包事务；这里不建表、不提交、不吞掉写入失败。 */
export async function insertMibanOrderInvoiceRequest(params: {
  transaction: any;
  orderId: number;
  userId: number;
  invoiceRequest: MibanInvoiceRequest;
}): Promise<void> {
  if (!params.transaction || typeof params.transaction.execute !== "function"
    || !Number.isSafeInteger(params.orderId) || params.orderId <= 0
    || !Number.isSafeInteger(params.userId) || params.userId <= 0) {
    throw new Error("发票申请必须随订单在原钱包事务中保存");
  }
  const parsed = mibanInvoiceRequestSchema.safeParse(params.invoiceRequest);
  if (!parsed.success) throw new Error("发票申请资料无效，请核对后重新付款");
  const request = parsed.data;
  try {
    await params.transaction.execute(
      `INSERT INTO miban_order_invoice_requests
       (order_id, user_id, invoice_type, invoice_title, tax_no)
       VALUES (?, ?, ?, ?, ?)`,
      [params.orderId, params.userId, request.type, request.title, request.type === "company" ? request.taxNo : null]
    );
  } catch {
    // 抛出无敏感资料的错误，交由 withGlobalWalletTransaction 回滚订单和全部扣款。
    throw new Error("发票申请保存失败，本次下单未完成，请稍后重试");
  }
}

/** 只接收调用方已通过订单所有权/管理员权限检查的ID；历史未建表时不触发DDL。 */
export async function readMibanOrderInvoiceRequests(
  authorizedOrderIds: number[],
  connection?: any
): Promise<Map<number, MibanInvoiceRequest>> {
  const result = new Map<number, MibanInvoiceRequest>();
  const ids = Array.from(new Set(authorizedOrderIds)).filter(id => Number.isSafeInteger(id) && id > 0);
  if (!ids.length) return result;
  const conn = connection ?? await getDbConnection();
  if (!conn) throw new Error("发票申请暂时无法读取");
  try {
    let rows: any;
    try {
      [rows] = await conn.execute(
        `SELECT order_id, invoice_type, invoice_title, tax_no
         FROM miban_order_invoice_requests
         WHERE order_id IN (${ids.map(() => "?").join(",")})`, ids
      );
    } catch (error) {
      if (missingTable(error)) return result;
      throw new Error("发票申请暂时无法读取");
    }
    const authorized = new Set(ids);
    for (const row of Array.isArray(rows) ? rows : []) {
      const orderId = Number(row.order_id);
      if (!authorized.has(orderId)) continue;
      const parsed = mibanInvoiceRequestSchema.safeParse({
        type: row.invoice_type, title: row.invoice_title, taxNo: row.tax_no,
      });
      if (!parsed.success) throw new Error("订单发票申请资料异常，请联系管理员核对");
      result.set(orderId, parsed.data);
    }
    return result;
  } finally {
    // 管理列表传入连接时由原调用方负责释放；共享pool facade的end()已被既有DB模块屏蔽。
    if (!connection) await conn.end();
  }
}
