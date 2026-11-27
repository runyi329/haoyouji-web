/** Logistics events describe the carrier only, never order receipt or settlement. */
export interface LogisticsRecord {
  time: string;
  context: string;
  status?: string;
}

export interface LogisticsDetails {
  trackingCompany: string;
  trackingNo: string;
  carrierCode: string | null;
  state: string | null;
  stateLabel: string;
  records: LogisticsRecord[];
  updatedAt: string | null;
  source: "query" | "push" | null;
  stale: boolean;
  message: string | null;
  subscriptionStatus:
    | "disabled"
    | "pending"
    | "active"
    | "shutdown"
    | "abort"
    | "error";
  canRetryAt: string | null;
}

/** Carrier delivery/collection are not the buyer's explicit order confirmation. */
export function getLogisticsStateLabel(state: string | null): string {
  const labels: Record<string, string> = {
    "0": "运输中",
    "1": "已揽收",
    "2": "物流异常",
    "3": "承运商已签收",
    "4": "退回签收",
    "5": "派送中",
    "6": "退回中",
    "7": "转投中",
    "8": "清关中",
    "10": "待清关",
    "11": "清关中",
    "12": "已清关",
    "13": "清关异常",
    "14": "拒签",
    "301": "本人签收",
    "302": "他人代收",
    "303": "系统签收",
    "304": "代收点签收",
    "501": "派送中",
    "502": "待取件",
  };
  if (state === null) return "暂无物流状态";
  return Object.hasOwn(labels, state) ? labels[state] : "物流状态待确认";
}

/** Administrator-only telemetry; never contains credentials, raw payloads or phone numbers. */
export type LogisticsFeedbackCategory =
  | "success" | "quota" | "authorization" | "phone" | "rate_limit"
  | "no_data" | "duplicate" | "invalid_request" | "provider" | "aborted";
export interface AdminLogisticsFeedback {
  operation: "query" | "subscription" | "callback";
  code: string;
  category: LogisticsFeedbackCategory;
  message: string;
  at: string;
  carrierCode: string;
  trackingNoMasked: string;
}
export interface AdminLogisticsHealth {
  queryConfigured: boolean;
  subscriptionEnabled: boolean;
  callbackConfigured: boolean;
  balanceStatus: "unknown";
  lastQuery: AdminLogisticsFeedback | null;
  lastSubscription: AdminLogisticsFeedback | null;
  lastCallback: AdminLogisticsFeedback | null;
  recent: AdminLogisticsFeedback[];
  storageWarning: string | null;
  checkedAt: string;
}
