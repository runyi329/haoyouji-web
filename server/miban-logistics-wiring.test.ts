import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
describe("物流服务接线与管理权限边界", () => {
  it("正式鉴权上下文忽略所有开发身份旁路", () => {
    const context = source("server/_core/context.ts");
    expect(context).toContain("const canBypass = process.env.NODE_ENV !== 'production' && process.env.DEV_BYPASS_AUTH === 'true'");
    expect(context).toContain("const forcedUserId = canBypass ?");
    expect(context).toContain("if (canBypass && !forcedUserId && !user && !hasAuthHeader)");
  });
  it("管理状态和真实试查均使用现有super_admin专用后端中间件", () => {
    const router = source("server/miban.ts");
    expect(router).toMatch(/const mibanAdminProcedure = protectedProcedure\.use[\s\S]*?role !== "super_admin"[\s\S]*?code: "FORBIDDEN"/);
    expect(router).toContain("logisticsHealth: mibanAdminProcedure.query(() => getLogisticsServiceHealth())");
    expect(router).toContain("logisticsConfiguration: mibanAdminProcedure.query(() => getLogisticsConfigurationStatus())");
    expect(router).toMatch(/logisticsTest: mibanAdminProcedure\s*\.input/);
  });
  it("客户只读本人订单，不接收任意运单号、电话输入", () => {
    const router = source("server/miban.ts");
    const customer = router.slice(router.indexOf("  logistics: protectedProcedure"), router.indexOf("  logisticsConfiguration:"));
    expect(customer).toContain("getMyOrderLogistics(ctx.user!.id, input.orderId)");
    expect(customer).not.toMatch(/phone:|trackingNo:|trackingCompany:/);
  });
  it("双方统一发货提交成功后才发起可选订阅，失败只记日志", () => {
    const service = source("server/miban-fulfillment.ts");
    const success = service.indexOf("results.push({ index, orderNo: row.orderNo, success: true })");
    const subscription = service.indexOf('void import("./miban-logistics-order")');
    expect(success).toBeGreaterThan(-1);
    expect(subscription).toBeGreaterThan(success);
    expect(service.slice(subscription, subscription + 300)).toContain(".catch(() => console.warn");
    expect(service).toContain('process.env.KUAIDI100_SUBSCRIPTION_ENABLED === "true"');
  });
  it("后台刷新仅读健康记录，不刷新包裹，禁用自动轮询和焦点调用", () => {
    const client = source("client/src/pages/miban/LogisticsSetup.tsx");
    expect(client).toContain("order.logisticsHealth.useQuery");
    expect(client).toContain('if (user?.role !== "super_admin") return');
    expect(client).toContain("return <AdminLogisticsStatus key={user.id} />");
    expect(client).toContain("refetchOnWindowFocus: false");
    expect(client).toContain("refetchOnReconnect: false");
    expect(client).not.toMatch(/refetchInterval:\s*[1-9]/);
    expect(client).not.toContain('balanceStatus === "paid"');
  });
});
