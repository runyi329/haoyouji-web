import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ ENV: { forgeApiKey: '', forgeApiUrl: '' }, getDbConnection: vi.fn() }));
vi.mock('./_core/env', () => ({ ENV: mocks.ENV }));
vi.mock('./db', () => ({ getDbConnection: mocks.getDbConnection }));
import { invokeAJInvoiceVision, isSafeAJVisionImageUrl } from './aj-invoice-vision';
let network: ReturnType<typeof vi.fn>;
let conn: any;
beforeEach(() => {
  mocks.ENV.forgeApiKey = ''; mocks.ENV.forgeApiUrl = '';
  conn = { execute: vi.fn(async () => [[{ enabled: 1 }], []]) }; mocks.getDbConnection.mockResolvedValue(conn);
  network = vi.fn(() => { throw new Error('意外网络调用'); }); vi.stubGlobal('fetch', network);
  vi.stubEnv('AJ_INVOICE_VISION_MODEL', ''); vi.stubEnv('AJ_INVOICE_IMAGE_ALLOWED_PREFIXES', 'https://store.example.com/receipts/');
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
const input = { userId: 4, messages: [{ role: 'user' as const, content: 'offline' }], schema: { type: 'object', properties: {}, additionalProperties: false, required: [] } };
describe('视觉服务缺配置安全关闭及存储来源限制（fetch仅stub）', () => {
  it('缺项目key/url/model均在请求前fail-safe，不拿沙箱凭据和默认模型兜底', async () => {
    await expect(invokeAJInvoiceVision(input)).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    mocks.ENV.forgeApiKey = 'offline-key'; await expect(invokeAJInvoiceVision(input)).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    mocks.ENV.forgeApiUrl = 'https://vision.example.com'; await expect(invokeAJInvoiceVision(input)).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' }); expect(network).not.toHaveBeenCalled();
  });
  it('开关数据库不可用、缺行、关闭都不向模型目录请求', async () => {
    mocks.ENV.forgeApiKey = 'offline-key'; mocks.ENV.forgeApiUrl = 'https://vision.example.com'; vi.stubEnv('AJ_INVOICE_VISION_MODEL', 'fixture');
    mocks.getDbConnection.mockResolvedValue(null); await expect(invokeAJInvoiceVision(input)).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    mocks.getDbConnection.mockResolvedValue(conn); conn.execute.mockResolvedValue([[], []]); await expect(invokeAJInvoiceVision(input)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    conn.execute.mockRejectedValue(new Error('missing table')); await expect(invokeAJInvoiceVision(input)).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' }); expect(network).not.toHaveBeenCalled();
  });
  it('模型目录缺能力声明默认不放行，绝不请求识别端点', async () => {
    mocks.ENV.forgeApiKey = 'offline-key'; mocks.ENV.forgeApiUrl = 'https://vision.example.com'; vi.stubEnv('AJ_INVOICE_VISION_MODEL', 'fixture');
    network.mockResolvedValue({ ok: true, json: async () => ({ data: [{ id: 'fixture' }] }) });
    await expect(invokeAJInvoiceVision(input)).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' }); expect(network).toHaveBeenCalledOnce(); expect(network.mock.calls[0][0]).toContain('/v1/models');
  });
  it('上传受控https路径通过；任意外部、伪造子域、http、私网/编码IP均拒绝', () => {
    expect(isSafeAJVisionImageUrl('https://store.example.com/receipts/a.jpg?signature=x')).toBe(true);
    for (const url of ['https://evil.example.com/a.jpg', 'https://store.example.com.evil.com/receipts/a.jpg', 'https://store.example.com/other/a.jpg', 'http://store.example.com/receipts/a.jpg', 'https://127.0.0.1/x', 'https://2130706433/x', 'https://[::1]/x', 'https://10.0.0.1/x', 'https://localhost/x', 'https://a.internal/x', 'https://u:p@store.example.com/receipts/a.jpg', 'https://store.example.com/receipts/%2e%2e/secret']) expect(isSafeAJVisionImageUrl(url)).toBe(false);
    vi.stubEnv('AJ_INVOICE_IMAGE_ALLOWED_PREFIXES', ''); expect(isSafeAJVisionImageUrl('https://store.example.com/receipts/a.jpg')).toBe(false); expect(network).not.toHaveBeenCalled();
  });
  it('只读预览不拿DB或发起网络', async () => {
    vi.stubEnv('PREVIEW_READONLY', 'true'); await expect(invokeAJInvoiceVision(input)).rejects.toMatchObject({ code: 'FORBIDDEN' }); expect(network).not.toHaveBeenCalled();
  });
});
