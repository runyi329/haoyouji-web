import { TRPCError } from '@trpc/server';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import sharp from 'sharp';
import { z } from 'zod';
import { withDatabaseLock } from './db';
import { uploadImageToCOS } from './cos-upload';
import { calendarNumberSchema, saveCalendarNumberSchema, getCalendarRecordAccess, type Ledger37Actor } from './ledger37-calendar-recorder';

export const calendarEntrySchema = calendarNumberSchema;
export const uploadCalendarEntryImageSchema = calendarNumberSchema.extend({
  imageData: z.string().max(15 * 1024 * 1024),
}).strict();
export const saveCalendarEntrySchema = calendarNumberSchema.extend({
  amount: saveCalendarNumberSchema.shape.amount,
  overwriteExisting: z.boolean().optional(),
  version: z.string().max(128).nullable(),
  images: z.array(z.object({
    imageUrl: z.string().max(2048),
    uploadToken: z.string().max(4096).optional(),
  }).strict()).max(10),
}).strict();

type Scope = Awaited<ReturnType<typeof getCalendarRecordAccess>>;
type RecordSnapshot = NonNullable<Scope['record']>;
type SaveInput = z.infer<typeof saveCalendarEntrySchema>;
const PURPOSE = 'ledger37-calendar-image-v1';
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_PIXELS = 40_000_000;
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
function scopeInput(input: z.infer<typeof calendarNumberSchema>) {
  return { ledgerId: 37 as const, categoryId: input.categoryId, date: input.date };
}
const uploadClaimSchema = z.object({
  purpose: z.literal(PURPOSE), ledgerId: z.literal(37),
  actorId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  categoryId: calendarNumberSchema.shape.categoryId,
  date: z.string(), imageUrl: z.string().max(2048), expiresAt: z.number().int().positive(),
}).strict();

function bad(message: string): never { throw new TRPCError({ code: 'BAD_REQUEST', message }); }
function conflict(): never { throw new TRPCError({ code: 'CONFLICT', message: '日历记录已变化，请刷新后重新确认覆盖' }); }
function denied(): never { throw new TRPCError({ code: 'FORBIDDEN', message: '图片不属于当前日历记录或上传凭证无效，请重新上传' }); }
function signingKey(): string {
  const key = process.env.JWT_SECRET;
  if (!key?.trim()) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '日历图片凭证服务暂未配置' });
  return key;
}
function signature(body: string, key: string): Buffer {
  // Domain separation plus a two-part format: this credential is never an authentication JWT.
  return createHmac('sha256', key).update(`${PURPOSE}\0${body}`).digest();
}
function previewable(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048 || !/^https?:\/\//i.test(value) || /[\s\u0000-\u001f\u007f]/.test(value)) return false;
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !!url.hostname && !url.username && !url.password; }
  catch { return false; }
}
function parseImages(raw: unknown): unknown[] {
  if (raw == null || raw === '') return [];
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try { parsed = JSON.parse(raw); } catch { return conflict(); }
    // Historical SQL NULL / JSON null / [] all represent no multi-image attachments.
    if (parsed == null) return [];
  }
  if (!Array.isArray(parsed)) return conflict();
  return parsed;
}
function recordImages(record: Scope['record']): Map<string, unknown> {
  const result = new Map<string, unknown>();
  if (!record) return result;
  for (const image of parseImages(record.images)) {
    const url = typeof image === 'string' ? image : image && typeof image === 'object' ? (image as { imageUrl?: unknown }).imageUrl : null;
    if (previewable(url) && !result.has(url)) result.set(url, image);
  }
  // Legacy single image remains visible even when the multi-image field is NULL or [].
  if (previewable(record.imageUrl) && !result.has(record.imageUrl)) result.set(record.imageUrl, record.imageUrl);
  return result;
}
function stable(value: unknown): unknown {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(stable);
  if (typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, val]) => [key, stable(val)]));
  return value;
}
function versionOf(record: Scope['record']): string | null {
  if (!record) return null;
  const fields: Array<keyof RecordSnapshot> = ['id', 'amount', 'type', 'description', 'stock_codes', 'reimbursement_status', 'pending_type', 'aj_status', 'createdBy', 'images', 'imageUrl', 'updatedAt'];
  return createHash('sha256').update(JSON.stringify(fields.map(key => stable(record[key])))).digest('hex');
}
function summary(scope: Scope) {
  const amount = scope.record ? Number(scope.record.amount) : null;
  if (amount !== null && !Number.isFinite(amount)) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '日历数字无效' });
  return { amount, exists: !!scope.record, categoryName: String(scope.category.name),
    images: [...recordImages(scope.record).keys()].map(imageUrl => ({ imageUrl })), version: versionOf(scope.record) };
}
export async function getCalendarEntry(ctx: Ledger37Actor, raw: unknown) {
  const input = calendarEntrySchema.parse(raw);
  return summary(await getCalendarRecordAccess(ctx, input));
}
function verifyUpload(ctx: Ledger37Actor, input: SaveInput, image: SaveInput['images'][number]): void {
  if (!image.uploadToken) return denied();
  const parts = image.uploadToken.split('.');
  if (parts.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(parts[0]) || !/^[A-Za-z0-9_-]{43}$/.test(parts[1])) return denied();
  const supplied = Buffer.from(parts[1], 'base64url');
  const expected = signature(parts[0], signingKey());
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return denied();
  let payload: unknown;
  try { payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')); } catch { return denied(); }
  const parsed = uploadClaimSchema.safeParse(payload);
  if (!parsed.success) return denied();
  const claim = parsed.data;
  if (claim.actorId !== ctx.user.id || claim.categoryId !== input.categoryId || claim.date !== input.date
    || claim.imageUrl !== image.imageUrl || claim.expiresAt <= Date.now()) return denied();
}
function prepareImages(ctx: Ledger37Actor, scope: Scope, input: SaveInput): unknown[] {
  if (scope.record) {
    if (!input.overwriteExisting || input.version !== versionOf(scope.record)) return conflict();
  } else if (input.version !== null) return conflict();
  const existing = recordImages(scope.record);
  const seen = new Set<string>();
  return input.images.map(image => {
    if (!previewable(image.imageUrl)) return denied();
    if (seen.has(image.imageUrl)) return bad('日历照片不能重复');
    seen.add(image.imageUrl);
    // Preserve unexposed metadata of a retained historical photo; clients cannot replace it.
    if (existing.has(image.imageUrl)) return existing.get(image.imageUrl);
    verifyUpload(ctx, input, image);
    return image.imageUrl;
  });
}
export async function uploadCalendarEntryImage(ctx: Ledger37Actor, raw: unknown): Promise<{ imageUrl: string; uploadToken: string }> {
  const input = uploadCalendarEntryImageSchema.parse(raw);
  await getCalendarRecordAccess(ctx, scopeInput(input));
  signingKey(); // Fail before decoding/uploading when credentials cannot be issued.
  const match = /^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(input.imageData);
  if (!match) return bad('仅支持 JPG、PNG 或 WebP 的 base64 图片');
  if (match[2].length > Math.ceil(MAX_BYTES / 3) * 4) return bad('图片不能超过10MB');
  const source = Buffer.from(match[2], 'base64');
  if (!source.length || source.length > MAX_BYTES || source.toString('base64') !== match[2]) return bad('图片base64无效、为空或超过10MB');
  let normalized: Buffer;
  try {
    const options = { failOn: 'error' as const, limitInputPixels: MAX_PIXELS };
    const metadata = await sharp(source, options).metadata();
    const pixels = Number(metadata.width) * Number(metadata.height);
    if (!['jpeg', 'png', 'webp'].includes(metadata.format ?? '') || !Number.isFinite(pixels) || pixels <= 0
      || pixels > MAX_PIXELS || (metadata.pages ?? 1) !== 1) return bad('图片格式、尺寸无效或过大');
    // Sharp removes EXIF/GPS and other metadata by default when re-encoding (no keepMetadata).
    normalized = await sharp(source, options).rotate().resize(1200, 1200, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    return bad('图片无法解码，请使用有效的 JPG、PNG 或 WebP 图片');
  }
  if (!normalized.length || normalized.length > MAX_BYTES) return bad('重编码图片尺寸过大');
  const filename = `ledger-photos/calendar37/${ctx.user.id}/${input.categoryId}/${input.date}/${randomUUID()}.webp`;
  const imageUrl = await uploadImageToCOS(`data:image/webp;base64,${normalized.toString('base64')}`, 'ledger-photos', filename);
  // Upload does not create a ledger record. Revocation during COS transfer must prevent signing.
  await getCalendarRecordAccess(ctx, scopeInput(input));
  if (!previewable(imageUrl)) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '图片上传地址无效' });
  const body = Buffer.from(JSON.stringify({ purpose: PURPOSE, ledgerId: 37, actorId: ctx.user.id,
    categoryId: input.categoryId, date: input.date, imageUrl, expiresAt: Date.now() + TOKEN_TTL_MS })).toString('base64url');
  return { imageUrl, uploadToken: `${body}.${signature(body, signingKey()).toString('base64url')}` };
}
// mysql2's default parser decodes JSON columns. Historical Drizzle writes can contain a
// JSON string holding an array, not an actual array: preserve that distinction for CAS.
function jsonParameter(raw: unknown): string | null {
  if (raw == null) return null;
  return JSON.stringify(raw);
}
// mysql2 decodes both SQL NULL and JSON null as null. Normalize only those two
// representations in CAS; quoted legacy strings and actual arrays remain distinct.
export async function saveCalendarEntry(ctx: Ledger37Actor, raw: unknown): Promise<{ success: true }> {
  const input = saveCalendarEntrySchema.parse(raw);
  prepareImages(ctx, await getCalendarRecordAccess(ctx, scopeInput(input)), input);
  return withDatabaseLock(`ledger37:${input.categoryId}:${input.date}`, async () => {
    const scope = await getCalendarRecordAccess(ctx, scopeInput(input));
    const storedImages = prepareImages(ctx, scope, input);
    const images = storedImages.length ? JSON.stringify(storedImages) : null;
    const imageUrl = input.images[0]?.imageUrl ?? null;
    const record = scope.record;
    if (record) {
      const [result] = await scope.connection.execute(`UPDATE ledger_records SET amount = ?, images = ?, imageUrl = ?, updatedAt = NOW()
        WHERE id = ? AND ledgerId = 37 AND categoryId = ? AND recordDate = ? AND type = 'expense' AND deleted_at IS NULL
        AND reimbursement_status = 'none' AND pending_type IS NULL AND aj_status IS NULL
        AND amount = ? AND CAST(NULLIF(CAST(images AS CHAR), 'null') AS JSON) <=> CAST(? AS JSON) AND BINARY imageUrl <=> BINARY ?
        AND BINARY description <=> BINARY ? AND CAST(NULLIF(CAST(stock_codes AS CHAR), 'null') AS JSON) <=> CAST(? AS JSON)
        AND createdBy = ? AND updatedAt <=> ?`,
      [input.amount.toFixed(2), images, imageUrl, record.id, input.categoryId, input.date,
        record.amount, jsonParameter(record.images), record.imageUrl, record.description, jsonParameter(record.stock_codes), record.createdBy, record.updatedAt]);
      if (Number(result.affectedRows) !== 1) return conflict();
    } else {
      const [result] = await scope.connection.execute(`INSERT INTO ledger_records (ledgerId, type, amount, categoryId, recordDate, createdBy,
        description, imageUrl, images, stock_codes, reimbursement_status, pending_type, pending_include_stats)
        VALUES (37, 'expense', ?, ?, ?, ?, NULL, ?, ?, NULL, 'none', NULL, NULL)`,
      [input.amount.toFixed(2), input.categoryId, input.date, ctx.user.id, imageUrl, images]);
      if (Number(result.affectedRows) !== 1) return conflict();
    }
    // Removing an association never deletes the COS object.
    return { success: true };
  });
}
