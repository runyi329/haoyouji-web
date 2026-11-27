import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("./db", () => ({ getDbConnection: vi.fn() }));
vi.mock("./miban-logistics", () => ({ getShipmentLogistics: vi.fn(), subscribeShipmentLogistics: vi.fn(), getLogisticsConfigurationStatus: () => ({ subscriptionEnabled: false }) }));
import { createOrderLogisticsReader, type LogisticsOrder } from "./miban-logistics-order";

const order: LogisticsOrder = { id: 12, userId: 9, status: "shipped", trackingCompany: "中通快递", trackingNo: "ABC123456", receiverPhone: "13800138000" };
const details = { trackingCompany: "中通快递", trackingNo: "ABC123456", carrierCode: "zhongtong", state: "0", stateLabel: "运输中", records: [], updatedAt: null, source: null, stale: false, message: null, subscriptionStatus: "disabled", canRetryAt: null };
function setup(found: LogisticsOrder | null = order, enabled = false) {
  const findOwnedOrder = vi.fn().mockResolvedValue(found);
  const queryShipment = vi.fn().mockResolvedValue(details);
  const subscribeShipment = vi.fn().mockResolvedValue(undefined);
  return { read: createOrderLogisticsReader({ findOwnedOrder, queryShipment, subscribeShipment, subscriptionEnabled: () => enabled }), findOwnedOrder, queryShipment, subscribeShipment };
}
describe("本人订单物流权限与发货边界", () => {
  beforeEach(() => vi.clearAllMocks());
  it("仅查询本人订单并使用数据库已有电话", async () => {
    const s = setup();
    const response = await s.read(9, 12);
    expect(s.findOwnedOrder).toHaveBeenCalledWith(9, 12);
    expect(s.queryShipment).toHaveBeenCalledWith({ trackingCompany: order.trackingCompany, trackingNo: order.trackingNo, phone: order.receiverPhone });
    expect(response).not.toHaveProperty("phone");
    expect(response).not.toHaveProperty("receiverPhone");
  });
  it.each([null, { ...order, userId: 10 }])("无权订单先拒绝，不能读缓存或调用外部接口", async found => {
    const s = setup(found);
    await expect(s.read(9, 12)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(s.queryShipment).not.toHaveBeenCalled();
    expect(s.subscribeShipment).not.toHaveBeenCalled();
  });
  it.each(["pending", "cancelled", "packing"])("%s状态不调用外部物流", async status => {
    const s = setup({ ...order, status });
    const response = await s.read(9, 12);
    expect(s.queryShipment).not.toHaveBeenCalled();
    expect(response.records).toEqual([]);
    expect(response).not.toHaveProperty("phone");
  });
  it("已发货未填单号准确提示且不返回电话", async () => {
    const s = setup({ ...order, trackingNo: null });
    const response = await s.read(9, 12);
    expect(response.message).toContain("尚未填写快递单号");
    expect(response).not.toHaveProperty("phone");
    expect(s.queryShipment).not.toHaveBeenCalled();
  });
  it("订阅关闭时不提交；已启用时补订阅仍不更改订单状态", async () => {
    const s = setup(order, true);
    await s.read(9, 12);
    expect(s.subscribeShipment).toHaveBeenCalledOnce();
    expect(order.status).toBe("shipped");
  });
  it("承运商签收不自动确认收货或继续订阅", async () => {
    const s = setup(order, true);
    s.queryShipment.mockResolvedValue({ ...details, state: "3", stateLabel: "已签收" });
    await s.read(9, 12);
    expect(s.subscribeShipment).not.toHaveBeenCalled();
    expect(order.status).toBe("shipped");
  });
});
