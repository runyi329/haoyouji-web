import { TRPCError } from "@trpc/server";
import { getShipmentLogistics, subscribeShipmentLogistics, getLogisticsConfigurationStatus } from "./miban-logistics";
import type { LogisticsDetails } from "../shared/miban-logistics";

export type LogisticsOrder = {
  id: number;
  userId: number;
  status: string;
  trackingCompany: string | null;
  trackingNo: string | null;
  receiverPhone: string | null;
};

export function createOrderLogisticsReader(dependencies: {
  findOwnedOrder(userId: number, orderId: number): Promise<LogisticsOrder | null>;
  queryShipment: typeof getShipmentLogistics;
  subscribeShipment: typeof subscribeShipmentLogistics;
  subscriptionEnabled(): boolean;
}) {
  return async (userId: number, orderId: number): Promise<LogisticsDetails> => {
    // Never allow arbitrary carrier/waybill/phone from a customer's browser.
    // Authorization is checked before reading shared caches or contacting a provider.
    const order = await dependencies.findOwnedOrder(userId, orderId);
    if (!order || order.userId !== userId) {
      throw new TRPCError({ code: "NOT_FOUND", message: "订单不存在或无查看权限" });
    }
    const shipment = {
      trackingCompany: order.trackingCompany ?? "",
      trackingNo: order.trackingNo ?? "",
      phone: order.receiverPhone ?? undefined,
    };
    if (!shipment.trackingNo || order.status === "cancelled" || !["shipped", "delivered"].includes(order.status)) {
      return {
        trackingCompany: shipment.trackingCompany, trackingNo: shipment.trackingNo,
        carrierCode: null, state: null, stateLabel: "暂无物流信息",
        records: [], updatedAt: null, source: null, stale: false,
        message: order.status === "cancelled" ? "订单已取消" : order.status === "shipped" ? "商家尚未填写快递单号，请联系商家" : "配货完成后将更新物流信息",
        subscriptionStatus: "disabled", canRetryAt: null,
      };
    }
    const details = await dependencies.queryShipment(shipment);
    // Lazy catch-up for old shipped orders and a failed/missed post-commit subscription.
    // Failed subscription must never change customer order/receipt or wallet settlement.
    if (dependencies.subscriptionEnabled() && order.status === "shipped" && details.state !== "3") {
      void dependencies.subscribeShipment(shipment).catch(() => {
        console.warn("[MibanLogistics] 订阅暂未完成，后续打开详情会重试");
      });
    }
    return details;
  };
}

const projection = "id,userId,status,trackingCompany,trackingNo,receiverPhone";
const readMyLogistics = createOrderLogisticsReader({
  async findOwnedOrder(userId, orderId) {
    // Keep the injectable reader independent of legacy database import-time initialization.
    const { getDbConnection } = await import("./db");
    const connection = await getDbConnection();
    if (!connection) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "订单服务暂不可用，请稍后重试" });
    const [rows] = await connection.execute(`SELECT ${projection} FROM miban_orders WHERE id=? AND userId=? LIMIT 1`, [orderId, userId]);
    return (rows as LogisticsOrder[])[0] ?? null;
  },
  queryShipment: getShipmentLogistics,
  subscribeShipment: subscribeShipmentLogistics,
  subscriptionEnabled: () => getLogisticsConfigurationStatus().subscriptionEnabled,
});

export const getMyOrderLogistics = readMyLogistics;

/** Called only after a successful fulfillment transaction, for admin and suppliers alike. */
export async function subscribeFulfilledOrder(orderNo: string): Promise<void> {
  if (!getLogisticsConfigurationStatus().subscriptionEnabled) return;
  const { getDbConnection } = await import("./db");
  const connection = await getDbConnection();
  if (!connection) return;
  const [rows] = await connection.execute(`SELECT ${projection} FROM miban_orders WHERE orderNo=? AND status='shipped' LIMIT 1`, [orderNo]);
  const order = (rows as LogisticsOrder[])[0];
  if (!order?.trackingNo) return;
  await subscribeShipmentLogistics({
    trackingCompany: order.trackingCompany ?? "",
    trackingNo: order.trackingNo,
    phone: order.receiverPhone ?? undefined,
  });
}
