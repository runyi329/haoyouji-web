import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
vi.mock("./miban-logistics", () => ({ acceptLogisticsCallback: vi.fn() }));
import { acceptLogisticsCallback } from "./miban-logistics";
import { registerMibanLogisticsCallback } from "./miban-logistics-callback";
import { registerMibanLogisticsPreviewGuard } from "./miban-logistics-preview";
let server: Server;
async function serve(app: express.Express) {
  server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as any).port}`;
}
afterEach(async () => {
  if (server) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  vi.unstubAllEnvs();
});
beforeEach(() => vi.clearAllMocks());
describe("快递100回调HTTP边界", () => {
  it("仅在签名验证并保存成功后返回官方成功响应", async () => {
    vi.mocked(acceptLogisticsCallback).mockResolvedValue(true);
    const app = express(); registerMibanLogisticsCallback(app);
    const base = await serve(app);
    const response = await fetch(`${base}/api/miban/logistics/kuaidi100/callback?id=${"a".repeat(64)}`, { method: "POST", body: new URLSearchParams({ param: "{}", sign: "A".repeat(32) }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ result: true, returnCode: "200", message: "成功" });
    expect(acceptLogisticsCallback).toHaveBeenCalledWith({ id: "a".repeat(64), param: "{}", sign: "A".repeat(32) });
  });
  it("伪造签名拒绝，不能应答成功", async () => {
    vi.mocked(acceptLogisticsCallback).mockResolvedValue(false);
    const app = express(); registerMibanLogisticsCallback(app);
    const base = await serve(app);
    const response = await fetch(`${base}/api/miban/logistics/kuaidi100/callback?id=${"a".repeat(64)}`, { method: "POST", body: new URLSearchParams({ param: "{}", sign: "A".repeat(32) }) });
    expect(response.status).toBe(403);
    expect((await response.json()).result).toBe(false);
  });
  it("路径穿越标识在读取缓存前拒绝", async () => {
    const app = express(); registerMibanLogisticsCallback(app);
    const base = await serve(app);
    const response = await fetch(`${base}/api/miban/logistics/kuaidi100/callback?id=../../secrets`, { method: "POST", body: new URLSearchParams({ param: "{}", sign: "A".repeat(32) }) });
    expect(response.status).toBe(400);
    expect(acceptLogisticsCallback).not.toHaveBeenCalled();
  });
  it("保存异常返回500，不能谎称推送已接收", async () => {
    vi.mocked(acceptLogisticsCallback).mockRejectedValue(new Error("private-data"));
    const app = express(); registerMibanLogisticsCallback(app);
    const base = await serve(app);
    const response = await fetch(`${base}/api/miban/logistics/kuaidi100/callback?id=${"a".repeat(64)}`, { method: "POST", body: new URLSearchParams({ param: "{}", sign: "A".repeat(32) }) });
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("private-data");
  });
});
describe("物流只读热预览门禁", () => {
  it("无专用令牌不能进入，令牌可换取HttpOnly cookie，正式业务写入禁止", async () => {
    vi.stubEnv("NODE_ENV", "development"); vi.stubEnv("FAST_PREVIEW", "true"); vi.stubEnv("MIBAN_PREVIEW_ACCESS_TOKEN", "preview-test-token");
    const app = express(); registerMibanLogisticsPreviewGuard(app);
    app.get("/", (_req, res) => res.json({ ok: true }));
    app.post("/api/trpc/order.logisticsTest", (_req, res) => res.json({ test: true }));
    const base = await serve(app);
    expect((await fetch(base)).status).toBe(403);
    const authorized = await fetch(`${base}/?preview=preview-test-token`);
    expect(authorized.status).toBe(200);
    const cookie = authorized.headers.get("set-cookie")!;
    expect(cookie).toContain("HttpOnly");
    expect((await fetch(`${base}/api/trpc/order.cancel`, { method: "POST", headers: { Cookie: cookie } })).status).toBe(403);
    expect((await fetch(`${base}/api/trpc/order.logisticsTest`, { method: "POST", headers: { Cookie: cookie } })).status).toBe(200);
  });
  it("生产环境忽略预览令牌配置，不注册bypass入口", async () => {
    vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("FAST_PREVIEW", "true"); vi.stubEnv("MIBAN_PREVIEW_ACCESS_TOKEN", "preview-test-token");
    const app = express(); registerMibanLogisticsPreviewGuard(app); app.get("/", (_req, res) => res.json({ ok: true }));
    const response = await fetch(await serve(app));
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
