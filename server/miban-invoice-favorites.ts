import { createHash } from "node:crypto";
import { getDbConnection } from "./db";
import { mibanInvoiceRequestSchema, type MibanInvoiceRequest } from "../shared/miban-invoice";

const HISTORY_ROW_LIMIT = 200;
const FAVORITES_LIMIT = 20;
let infrastructure: Promise<void> | null = null;

function assertUserId(userId: number): void {
  if (!Number.isSafeInteger(userId) || userId <= 0) throw new Error("请登录后使用常用发票");
}

function requestHash(request: MibanInvoiceRequest): string {
  // JSON 数组消除分隔符歧义；个人税号永远为空，不进行大小写等额外转换。
  return createHash("sha256").update(JSON.stringify([
    request.type, request.title, request.type === "company" ? request.taxNo : "",
  ])).digest("hex");
}

function missingTable(error: unknown): boolean {
  const driverError = error as { code?: string; cause?: { code?: string } } | null;
  return (driverError?.code ?? driverError?.cause?.code) === "ER_NO_SUCH_TABLE";
}

/** 私有入口：只有显式保存且资料有效之后才允许建表；不在付款事务内调用。 */
async function ensureInfrastructure(): Promise<void> {
  if (!infrastructure) {
    infrastructure = (async () => {
      const connection = await getDbConnection();
      if (!connection) throw new Error("unavailable");
      try {
        await connection.execute(`CREATE TABLE IF NOT EXISTS miban_invoice_favorites (
          user_id INT NOT NULL,
          request_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
          invoice_type ENUM('personal', 'company') NOT NULL,
          invoice_title VARCHAR(200) NOT NULL,
          tax_no VARCHAR(100) NULL,
          last_used_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          PRIMARY KEY (user_id, request_hash),
          KEY idx_miban_invoice_favorites_user_used (user_id, last_used_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`, []);
      } finally {
        await connection.end();
      }
    })().catch(() => {
      infrastructure = null;
      // 不携带驱动错误、SQL、发票抬头或税号，也不伪报保存成功。
      throw new Error("常用发票初始化失败，请稍后重试");
    });
  }
  await infrastructure;
}

/** 独立于订单/钱包保存。userId 必须由 protected 路由从 ctx 取得。 */
export async function rememberMibanInvoice(
  userId: number,
  invoiceRequest: unknown
): Promise<{ saved: true }> {
  assertUserId(userId);
  const parsed = mibanInvoiceRequestSchema.safeParse(invoiceRequest);
  if (!parsed.success) throw new Error("常用发票资料无效，请核对后重试");
  const request = parsed.data;
  await ensureInfrastructure();
  try {
    const connection = await getDbConnection();
    if (!connection) throw new Error("unavailable");
    try {
      await connection.execute(
        `INSERT INTO miban_invoice_favorites
         (user_id, request_hash, invoice_type, invoice_title, tax_no, last_used_at)
         VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP(6))
         ON DUPLICATE KEY UPDATE last_used_at = CURRENT_TIMESTAMP(6)`,
        [userId, requestHash(request), request.type, request.title, request.type === "company" ? request.taxNo : null]
      );
    } finally {
      await connection.end();
    }
  } catch {
    throw new Error("常用发票保存失败，请稍后重试");
  }
  return { saved: true };
}

function timestamp(value: unknown): number {
  const time = value instanceof Date ? value.getTime()
    : typeof value === "string" && /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})?$/.test(value)
      ? Date.parse(value.replace(" ", "T")) : NaN;
  if (!Number.isFinite(time)) throw new Error("invalid stored timestamp");
  return time;
}

type StoredRequest = {
  user_id: number | string;
  invoice_type: unknown;
  invoice_title: unknown;
  tax_no: unknown;
  used_at: unknown;
};

/** 仅读取当前用户的有限历史；未保存前不建表、不回填、不修改订单申请。 */
export async function readMibanInvoiceFavorites(userId: number): Promise<MibanInvoiceRequest[]> {
  assertUserId(userId);
  try {
    const connection = await getDbConnection();
    if (!connection) throw new Error("unavailable");
    try {
      const readRows = async (query: string): Promise<StoredRequest[]> => {
        try {
          const [rows] = await connection.execute(query, [userId]);
          if (!Array.isArray(rows)) throw new Error("invalid stored rows");
          return rows as StoredRequest[];
        } catch (error) {
          // 首次保存前新表可能不存在；老部署的订单发票表也可能尚未建立。
          if (missingTable(error)) return [];
          throw error;
        }
      };
      const favorites = await readRows(
        `SELECT user_id, invoice_type, invoice_title, tax_no, last_used_at AS used_at
         FROM miban_invoice_favorites WHERE user_id = ?
         ORDER BY last_used_at DESC, request_hash ASC LIMIT ${HISTORY_ROW_LIMIT}`
      );
      const history = await readRows(
        `SELECT user_id, invoice_type, invoice_title, tax_no, requested_at AS used_at
         FROM miban_order_invoice_requests WHERE user_id = ?
         ORDER BY requested_at DESC, order_id DESC LIMIT ${HISTORY_ROW_LIMIT}`
      );
      const candidates: { request: MibanInvoiceRequest; key: string; time: number }[] = [];
      for (const row of favorites.concat(history)) {
        // SQL 已按 user_id 隔离；解析层仍拒绝混入其他用户的资料。
        if (!row || Number(row.user_id) !== userId) continue;
        const parsed = mibanInvoiceRequestSchema.safeParse({
          type: row.invoice_type, title: row.invoice_title, taxNo: row.tax_no,
        });
        if (!parsed.success) throw new Error("invalid stored invoice");
        candidates.push({ request: parsed.data, key: requestHash(parsed.data), time: timestamp(row.used_at) });
      }
      candidates.sort((a, b) => b.time - a.time || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
      const seen = new Set<string>();
      const result: MibanInvoiceRequest[] = [];
      for (const candidate of candidates) {
        if (seen.has(candidate.key)) continue;
        seen.add(candidate.key);
        result.push(candidate.request);
        if (result.length === FAVORITES_LIMIT) break;
      }
      return result;
    } finally {
      await connection.end();
    }
  } catch {
    throw new Error("常用发票暂时无法读取，请稍后重试");
  }
}
