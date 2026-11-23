import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
const deps = vi.hoisted(() => ({ db: vi.fn(), lock: vi.fn(), upload: vi.fn(), sharp: vi.fn(), metadata: vi.fn(), encode: vi.fn() }));
vi.mock('./db', () => ({ getDbConnection: deps.db, withDatabaseLock: deps.lock }));
vi.mock('./cos-upload', () => ({ uploadImageToCOS: deps.upload }));
vi.mock('sharp', () => ({ default: deps.sharp }));
// Use the actual recorder schemas and access helper: never stub away the authorization boundary.
import { calendarNumberSchema, saveCalendarNumberSchema } from './ledger37-calendar-recorder';
import { calendarEntrySchema, uploadCalendarEntryImageSchema, saveCalendarEntrySchema,
  getCalendarEntry, uploadCalendarEntryImage, saveCalendarEntry } from './ledger37-calendar-entry';

const admin = { user: { id: 201 }, realUser: { id: 201 }, isViewingAs: false };
const owner = { user: { id: 100 }, realUser: { id: 100 }, isViewingAs: false };
const input = { ledgerId: 37 as const, categoryId: 90300, date: '2026-11-01' };
const imageData = 'data:image/png;base64,aW1hZ2U=';
const oldUrl = 'https://fixture.invalid/old.webp';
const offlineSecret = 'offline-unit-test-only-hmac-secret';
function fixture() {
  const state = { role: 'admin', ownerId: 100, member: true, memberType: 'real', balances: '{}', permissionAdd: null as string | null,
    category: { id: 90300, ledgerId: 37, name: '普通甲', parentId: null as number | null, isDefault: 0, accountingMode: 'manual_balance', type: 'expense' },
    records: [] as any[], config: {} as any, affected: 1 };
  const log: Array<{ sql: string; values: any[] }> = [];
  const conn = { execute: vi.fn(async (sql: string, values: any[] = []) => {
    log.push({ sql, values });
    if (/FROM ledgers l/.test(sql)) return [[{ ownerId: state.ownerId, memberRole: values[0] === 100 ? 'owner' : state.role,
      memberUserId: state.member && state.memberType !== 'ai' ? values[0] : null, initialBalances: state.balances, permissionAdd: state.permissionAdd }]];
    if (/FROM ledger_categories/.test(sql)) return [[state.category]];
    if (/FROM ledger_tag_config/.test(sql)) return [[state.config]];
    if (/FROM ledger_records/.test(sql)) return [structuredClone(state.records)];
    if (/^UPDATE ledger_records/.test(sql)) {
      if (state.affected === 1) Object.assign(state.records[0], { amount: values[0], images: values[1], imageUrl: values[2], updatedAt: '2026-11-21 00:01:01' });
      return [{ affectedRows: state.affected }];
    }
    if (/^INSERT INTO ledger_records/.test(sql)) {
      if (state.affected === 1) state.records.push(daily({ id: 17, amount: values[0], createdBy: values[3], description: null, imageUrl: values[4], images: values[5] }));
      return [{ affectedRows: state.affected, insertId: 17 }];
    }
    throw new Error('离线测试禁止非白名单SQL: ' + sql);
  }) };
  deps.db.mockResolvedValue(conn);
  let previous = Promise.resolve();
  deps.lock.mockImplementation((_key, operation) => {
    const result = previous.then(operation); previous = result.catch(() => undefined); return result;
  });
  const writes = () => log.filter(row => /^INSERT|^UPDATE|^DELETE|^ALTER|^CREATE/.test(row.sql));
  return { state, conn, log, writes };
}
function daily(extra = {}) { return { id: 16, amount: '123.00', type: 'expense', description: '日余额补录', stock_codes: null,
  reimbursement_status: 'none', pending_type: null, aj_status: null, createdBy: 999,
  imageUrl: oldUrl, images: null, updatedAt: '2026-11-20 12:00:00', ...extra }; }
const save = (extra = {}) => ({ ...input, amount: 5, version: null, images: [], ...extra });
const upload = (extra = {}) => ({ ...input, imageData, ...extra });
async function overwrite(extra = {}) {
  const entry = await getCalendarEntry(admin, input);
  return save({ overwriteExisting: true, version: entry.version, images: entry.images, ...extra });
}
function signClaim(claim: Record<string, unknown>) {
  const body = Buffer.from(JSON.stringify(claim)).toString('base64url');
  const sig = createHmac('sha256', offlineSecret).update(`ledger37-calendar-image-v1\0${body}`).digest('base64url');
  return `${body}.${sig}`;
}

beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-20T16:01:00Z'));
  vi.stubEnv('JWT_SECRET', offlineSecret);
  deps.metadata.mockResolvedValue({ format: 'png', width: 100, height: 80, pages: 1 });
  deps.encode.mockResolvedValue(Buffer.from('normalized-webp'));
  deps.sharp.mockImplementation(() => {
    const pipeline: any = { metadata: deps.metadata, toBuffer: deps.encode };
    for (const method of ['rotate', 'resize', 'webp']) pipeline[method] = vi.fn(() => pipeline);
    return pipeline;
  });
  deps.upload.mockImplementation(async (_data, _folder, filename) => `https://fixture.invalid/${filename}`);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe('37日历照片schema保持纯数字接口与窄字段合同', () => {
  it('get schema复用strict纯数字schema，旧save不接受任何照片字段', () => {
    expect(calendarEntrySchema).toBe(calendarNumberSchema);
    expect(saveCalendarNumberSchema.safeParse({ ...input, amount: 5, images: [] }).success).toBe(false);
    expect(saveCalendarNumberSchema.safeParse({ ...input, amount: 5, version: null }).success).toBe(false);
  });
  it.each([{ ledgerId: 52 }, { date: '2026-11-22' }, { date: '2026-02-30' }, { categoryId: 0 }, { categoryId: 1.5 }, { date: '2026-1-01' }])('非法scope输入%j在任何DB/上传之前拒绝', async change => {
    const f = fixture();
    await expect(getCalendarEntry(admin, { ...input, ...change })).rejects.toThrow();
    await expect(uploadCalendarEntryImage(admin, upload(change))).rejects.toThrow();
    await expect(saveCalendarEntry(admin, save(change))).rejects.toThrow();
    expect(deps.db).not.toHaveBeenCalled(); expect(deps.upload).not.toHaveBeenCalled(); expect(f.writes()).toEqual([]);
  });
  it.each([{ userId: 100 }, { type: 'transfer' }, { description: 'x' }, { createdBy: 100 }, { stockCodes: [] }, { imageUrl: oldUrl }, { categoryName: '别标签' }])('任意非合同字段%j拒绝', async extra => {
    fixture();
    expect(calendarEntrySchema.safeParse({ ...input, ...extra }).success).toBe(false);
    expect(uploadCalendarEntryImageSchema.safeParse(upload(extra)).success).toBe(false);
    await expect(saveCalendarEntry(admin, save(extra))).rejects.toThrow(); expect(deps.db).not.toHaveBeenCalled();
  });
  it('amount明确数字必填、精度/上限、version、照片字段、最多10张严格检查', () => {
    for (const amount of [undefined, null, '5', -1, NaN, Infinity, 100000000, 1.001]) expect(saveCalendarEntrySchema.safeParse(save({ amount })).success).toBe(false);
    for (const amount of [0, 12.34, 99999999.99]) expect(saveCalendarEntrySchema.safeParse(save({ amount })).success).toBe(true);
    expect(saveCalendarEntrySchema.safeParse(save({ version: undefined })).success).toBe(false);
    expect(saveCalendarEntrySchema.safeParse(save({ version: 'x'.repeat(129) })).success).toBe(false);
    expect(saveCalendarEntrySchema.safeParse(save({ images: [{ imageUrl: oldUrl, description: 'bad' }] })).success).toBe(false);
    expect(saveCalendarEntrySchema.safeParse(save({ images: Array.from({ length: 11 }, (_, n) => ({ imageUrl: oldUrl + n })) })).success).toBe(false);
  });
});
describe('复用真实权限helper：拒绝先于锁、上传和数据库写', () => {
  async function rejectAll(f: ReturnType<typeof fixture>, ctx = admin, code = 'FORBIDDEN') {
    await expect(getCalendarEntry(ctx, input)).rejects.toMatchObject({ code });
    await expect(uploadCalendarEntryImage(ctx, upload())).rejects.toMatchObject({ code });
    await expect(saveCalendarEntry(ctx, save())).rejects.toMatchObject({ code });
    expect(f.writes()).toEqual([]); expect(deps.lock).not.toHaveBeenCalled(); expect(deps.upload).not.toHaveBeenCalled(); expect(deps.sharp).not.toHaveBeenCalled();
  }
  it.each(['member', 'viewer', 'funder', 'owner'])('真实非admin成员%s不能因系统身份取得照片权限', async role => {
    const f = fixture(); f.state.role = role; await rejectAll(f, { ...admin, user: { id: 201, role: 'super_admin' } } as typeof admin);
  });
  it.each([{ ...admin, isViewingAs: true }, { ...admin, realUser: { id: 100 } }, { ...owner, isViewingAs: true }])('代看身份拒绝 %j', async ctx => { await rejectAll(fixture(), ctx); });
  it.each(['no-member', 'ai', 'permission-none'])('非真实成员/添加禁用%s拒绝', async mode => {
    const f = fixture(); if (mode === 'no-member') f.state.member = false; if (mode === 'ai') f.state.memberType = 'ai'; if (mode === 'permission-none') f.state.permissionAdd = 'none'; await rejectAll(f);
  });
  it.each([{ ledgerId: 52 }, { parentId: 9 }, { isDefault: 1 }, { accountingMode: 'stock_portfolio' }, { type: 'transfer' }])('跨账本/特殊标签 %j拒绝', async change => {
    const f = fixture(); Object.assign(f.state.category, change); await rejectAll(f);
  });
  it.each(['{"普通甲__visible":0}', '{"__tagVisibilityDefault":0}', 'broken', '[]'])('不可见或损坏标签配置%s拒绝', async balances => {
    const f = fixture(); f.state.balances = balances; await rejectAll(f);
  });
  it('暂停截止日后拒绝', async () => { const f = fixture(); f.state.config.pause_date = '2026-10-31'; await rejectAll(f); });
  it.each([{ type: 'transfer' }, { type: 'income' }, { description: 'capital_add' }, { description: '提现' }, { description: '分红' },
    { reimbursement_status: 'pending' }, { pending_type: 'payable' }, { aj_status: 'pending' }, { stock_codes: '[{"code":"x"}]' }])('特殊记录%j拒绝', async change => {
    const f = fixture(); f.state.records = [daily(change)]; await rejectAll(f, admin, 'CONFLICT');
  });
  it('多条同日记录拒绝', async () => { const f = fixture(); f.state.records = [daily(), daily({ id: 17 })]; await rejectAll(f, admin, 'CONFLICT'); });
  it('锁内重新检查权限撤销时零写', async () => {
    const f = fixture(); deps.lock.mockImplementation(async (_key, operation) => { f.state.role = 'member'; return operation(); });
    await expect(saveCalendarEntry(admin, save())).rejects.toMatchObject({ code: 'FORBIDDEN' }); expect(f.writes()).toEqual([]);
  });
  it('owner也只能使用日历摘要，不泄露成员、备注或特殊状态', async () => {
    const f = fixture(); f.state.records = [daily()];
    expect(await getCalendarEntry(owner, input)).toEqual({ amount: 123, exists: true, categoryName: '普通甲', images: [{ imageUrl: oldUrl }], version: expect.stringMatching(/^[a-f0-9]{64}$/) });
  });
});
describe('图片上传：真实解码前授权、限额、去EXIF重编码和独立凭证', () => {
  it('上传仅返回绑定24h凭证，不创建0记录；路径完全由server生成', async () => {
    const f = fixture(); const uploaded = await uploadCalendarEntryImage(admin, upload());
    expect(f.writes()).toEqual([]); expect(f.state.records).toEqual([]); expect(deps.lock).not.toHaveBeenCalled();
    expect(deps.upload).toHaveBeenCalledWith('data:image/webp;base64,' + Buffer.from('normalized-webp').toString('base64'), 'ledger-photos', expect.stringMatching(/^ledger-photos\/calendar37\/201\/90300\/2026-11-01\/[0-9a-f-]{36}\.webp$/));
    expect(deps.sharp).toHaveBeenCalledWith(expect.any(Buffer), { failOn: 'error', limitInputPixels: 40000000 });
    const pipeline = deps.sharp.mock.results[1].value;
    expect(pipeline.rotate).toHaveBeenCalled(); expect(pipeline.webp).toHaveBeenCalledWith({ quality: 85 }); expect(pipeline.keepMetadata).toBeUndefined();
    expect(uploaded.uploadToken.split('.')).toHaveLength(2);
    const claim = JSON.parse(Buffer.from(uploaded.uploadToken.split('.')[0], 'base64url').toString());
    expect(claim).toEqual({ purpose: 'ledger37-calendar-image-v1', ledgerId: 37, actorId: 201, categoryId: 90300, date: input.date, imageUrl: uploaded.imageUrl, expiresAt: Date.now() + 86400000 });
  });
  it.each(['', '   '])('HMAC服务未配置%s在Sharp/COS前拒绝', async key => {
    const f = fixture(); vi.stubEnv('JWT_SECRET', key);
    await expect(uploadCalendarEntryImage(admin, upload())).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
    expect(deps.upload).not.toHaveBeenCalled(); expect(deps.sharp).not.toHaveBeenCalled(); expect(f.writes()).toEqual([]);
  });
  it.each(['https://fixture.invalid/x.png', 'aW1hZ2U=', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/gif;base64,aW1hZ2U=',
    'data:image/png;base64,!!!!', 'data:image/png;base64,aW1hZ2U', 'data:image/png;base64,aW1hZ2V=', 'data:image/png;base64,'])('不接受URL/路径/错误dataURI %s', async data => {
    const f = fixture(); await expect(uploadCalendarEntryImage(admin, upload({ imageData: data }))).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(deps.upload).not.toHaveBeenCalled(); expect(deps.sharp).not.toHaveBeenCalled(); expect(f.writes()).toEqual([]);
  });
  it('单张10MB字节限制生效，不依赖dataURI字符上限', async () => {
    fixture(); const data = 'data:image/png;base64,' + Buffer.alloc(10 * 1024 * 1024 + 1).toString('base64');
    await expect(uploadCalendarEntryImage(admin, upload({ imageData: data }))).rejects.toMatchObject({ code: 'BAD_REQUEST' }); expect(deps.upload).not.toHaveBeenCalled();
  });
  it.each([{ width: 8000, height: 8000 }, { width: 0 }, { pages: 2 }, { format: 'svg' }])('实际解码像素/格式/多帧限制%j', async extra => {
    fixture(); deps.metadata.mockResolvedValue({ format: 'png', width: 100, height: 80, pages: 1, ...extra });
    await expect(uploadCalendarEntryImage(admin, upload())).rejects.toMatchObject({ code: 'BAD_REQUEST' }); expect(deps.upload).not.toHaveBeenCalled();
  });
  it('真实解码失败不回退原图上传', async () => {
    fixture(); deps.encode.mockRejectedValue(new Error('decode error'));
    await expect(uploadCalendarEntryImage(admin, upload())).rejects.toMatchObject({ code: 'BAD_REQUEST' }); expect(deps.upload).not.toHaveBeenCalled();
  });
  it('COS上传期间撤权，返回前再次授权拒绝，不写记录', async () => {
    const f = fixture(); deps.upload.mockImplementation(async () => { f.state.role = 'member'; return oldUrl; });
    await expect(uploadCalendarEntryImage(admin, upload())).rejects.toMatchObject({ code: 'FORBIDDEN' }); expect(f.writes()).toEqual([]);
  });
});
describe('保存：图片来源限定、版本/CAS和原子数字照片写入', () => {
  it('新记录必须显式amount，上传本身零写，有效token数字+照片一次INSERT', async () => {
    const f = fixture(); const photo = await uploadCalendarEntryImage(admin, upload()); expect(f.writes()).toEqual([]);
    await expect(saveCalendarEntry(admin, { ...input, images: [photo], version: null })).rejects.toThrow(); expect(f.writes()).toEqual([]);
    expect(await saveCalendarEntry(admin, save({ images: [photo], amount: 12.34 }))).toEqual({ success: true });
    expect(f.writes()).toHaveLength(1); const write = f.writes()[0]; expect(write.sql).toContain("VALUES (37, 'expense'");
    expect(write.values).toEqual(['12.34', 90300, input.date, 201, photo.imageUrl, JSON.stringify([photo.imageUrl])]);
    expect(write.sql).toContain("NULL, ?, ?, NULL, 'none', NULL, NULL");
    expect(deps.lock).toHaveBeenCalledWith('ledger37:90300:2026-11-01', expect.any(Function));
    expect((await getCalendarEntry(admin, input)).images).toEqual([{ imageUrl: photo.imageUrl }]);
  });
  it.each(['https://external.invalid/x.png', 'javascript:alert(1)', 'data:image/png;base64,aW1hZ2U=', '/ledger-photos/x.webp', 'https://u:p@fixture.invalid/x'])('任意外部URL/危险URL%s拒绝且零写', async imageUrl => {
    const f = fixture(); await expect(saveCalendarEntry(admin, save({ images: [{ imageUrl }] }))).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(f.writes()).toEqual([]); expect(deps.lock).not.toHaveBeenCalled();
  });
  it('不允许以其他记录图片充当当前记录既有图片', async () => {
    const f = fixture(); f.state.records = [daily({ images: '[]', imageUrl: null })];
    await expect(saveCalendarEntry(admin, await overwrite({ images: [{ imageUrl: oldUrl }] }))).rejects.toMatchObject({ code: 'FORBIDDEN' }); expect(f.writes()).toEqual([]);
  });
  it.each(['actorId', 'categoryId', 'date', 'imageUrl', 'ledgerId', 'purpose', 'expiresAt'])('有效HMAC但绑定字段%s不匹配或过期拒绝', async field => {
    const f = fixture(); const photo = await uploadCalendarEntryImage(admin, upload());
    const claim = JSON.parse(Buffer.from(photo.uploadToken.split('.')[0], 'base64url').toString());
    const changes: Record<string, unknown> = { actorId: 202, categoryId: 90301, date: '2026-11-02', imageUrl: oldUrl, ledgerId: 52, purpose: 'auth', expiresAt: Date.now() };
    photo.uploadToken = signClaim({ ...claim, [field]: changes[field] });
    await expect(saveCalendarEntry(admin, save({ images: [photo] }))).rejects.toMatchObject({ code: 'FORBIDDEN' }); expect(f.writes()).toEqual([]);
  });
  it('篡改签名与认证JWT三段格式不能当上传凭证', async () => {
    const f = fixture(); const photo = await uploadCalendarEntryImage(admin, upload());
    for (const token of [photo.uploadToken.slice(0, -2) + 'aa', photo.uploadToken + '.auth', 'eyJhbGciOiJIUzI1NiJ9.body.signature']) {
      await expect(saveCalendarEntry(admin, save({ images: [{ ...photo, uploadToken: token }] }))).rejects.toMatchObject({ code: 'FORBIDDEN' });
    } expect(f.writes()).toEqual([]);
  });
  it('24小时后凭证过期', async () => {
    const f = fixture(); const photo = await uploadCalendarEntryImage(admin, upload()); vi.advanceTimersByTime(86400000);
    await expect(saveCalendarEntry(admin, save({ images: [photo] }))).rejects.toMatchObject({ code: 'FORBIDDEN' }); expect(f.writes()).toEqual([]);
  });
  it.each([null, '[]', 'null', []].map(images => ({ images })))('兼容旧images=$images，单图显示与无token保留', async ({ images }) => {
    const f = fixture(); f.state.records = [daily({ images })]; const before = { ...f.state.records[0] };
    await saveCalendarEntry(admin, await overwrite());
    expect(f.state.records[0]).toEqual({ ...before, amount: '5.00', images: JSON.stringify([oldUrl]), updatedAt: '2026-11-21 00:01:01' });
    const sql = f.writes()[0].sql;
    expect(sql.split('WHERE')[0].trim()).toBe('UPDATE ledger_records SET amount = ?, images = ?, imageUrl = ?, updatedAt = NOW()');
    expect(sql).toContain("type = 'expense'"); expect(sql).toContain("reimbursement_status = 'none'"); expect(sql).toContain('pending_type IS NULL AND aj_status IS NULL');
    expect(sql).toContain("CAST(NULLIF(CAST(images AS CHAR), 'null') AS JSON) <=> CAST(? AS JSON)"); expect(sql).toContain('BINARY imageUrl <=> BINARY ?');
    expect(sql).toContain('BINARY description <=> BINARY ?'); expect(sql).toContain("CAST(NULLIF(CAST(stock_codes AS CHAR), 'null') AS JSON) <=> CAST(? AS JSON)"); expect(sql).toContain('updatedAt <=> ?');
  });
  it.each([JSON.stringify([oldUrl]), [oldUrl], [{ imageUrl: oldUrl, caption: '保留元数据' }]].map(images => ({ images })))('JSON CAS精确序列化驱动原生值与历史字符串 $images', async ({ images }) => {
    const f = fixture(); f.state.records = [daily({ images, stock_codes: '[]' })];
    await saveCalendarEntry(admin, await overwrite());
    const values = f.writes()[0].values;
    expect(values[7]).toBe(JSON.stringify(images));
    expect(values[10]).toBe(JSON.stringify('[]'));
  });
  it('既有照片元数据保留，摘要不泄漏；不受信任照片不预览', async () => {
    const f = fixture(); const photo = { imageUrl: oldUrl, caption: '旧照片私有字段', createdBy: 999 };
    f.state.records = [daily({ images: JSON.stringify([photo, 'javascript:alert(1)']), imageUrl: 'javascript:alert(2)' })];
    const entry = await getCalendarEntry(admin, input); expect(entry.images).toEqual([{ imageUrl: oldUrl }]);
    await saveCalendarEntry(admin, await overwrite()); expect(JSON.parse(f.state.records[0].images)).toEqual([photo]); expect(f.state.records[0].createdBy).toBe(999);
  });
  it('关联删除仅更新记录，不调用COS删除；重复照片明确拒绝', async () => {
    const f = fixture(); f.state.records = [daily()];
    await expect(saveCalendarEntry(admin, await overwrite({ images: [{ imageUrl: oldUrl }, { imageUrl: oldUrl }] }))).rejects.toMatchObject({ code: 'BAD_REQUEST' }); expect(f.writes()).toEqual([]);
    await saveCalendarEntry(admin, await overwrite({ images: [] })); expect(f.state.records[0].images).toBeNull(); expect(f.state.records[0].imageUrl).toBeNull(); expect(f.writes()).toHaveLength(1); expect(deps.upload).not.toHaveBeenCalled();
  });
  it('existing需要overwriteExisting与精确version；new必须null，全部冲突零写', async () => {
    const f = fixture(); f.state.records = [daily()]; const current = await overwrite();
    for (const extra of [{ overwriteExisting: false }, { version: null }, { version: 'wrong' }]) {
      await expect(saveCalendarEntry(admin, { ...current, ...extra })).rejects.toMatchObject({ code: 'CONFLICT' });
    }
    f.state.records = []; await expect(saveCalendarEntry(admin, current)).rejects.toMatchObject({ code: 'CONFLICT' }); expect(f.writes()).toEqual([]); expect(deps.lock).not.toHaveBeenCalled();
  });
  it.each(['amount', 'images', 'imageUrl', 'description', 'stock_codes', 'updatedAt', 'createdBy'])('内容hash追踪%s变化，锁内再次版本核验阻止覆盖', async field => {
    const f = fixture(); f.state.records = [daily()]; const current = await overwrite();
    const changes: Record<string, unknown> = { amount: '124.00', images: JSON.stringify([oldUrl]), imageUrl: oldUrl + '?changed', description: '普通修改', stock_codes: '[]', updatedAt: '2026-11-21 00:00:00', createdBy: 998 };
    deps.lock.mockImplementation(async (_key, operation) => { f.state.records[0][field] = changes[field]; return operation(); });
    await expect(saveCalendarEntry(admin, current)).rejects.toMatchObject({ code: 'CONFLICT' }); expect(f.writes()).toEqual([]);
  });
  it('CAS affectedRows不是1拒绝成功响应', async () => {
    const f = fixture(); f.state.records = [daily()]; const before = { ...f.state.records[0] }; f.state.affected = 0;
    await expect(saveCalendarEntry(admin, await overwrite())).rejects.toMatchObject({ code: 'CONFLICT' }); expect(f.state.records[0]).toEqual(before);
  });
  it('两个新建请求共享旧锁，只写一个记录；第二个冲突', async () => {
    const f = fixture(); const results = await Promise.allSettled([saveCalendarEntry(admin, save()), saveCalendarEntry(admin, save({ amount: 6 }))]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1); expect(f.writes()).toHaveLength(1); expect(f.state.records).toHaveLength(1);
  });
});
