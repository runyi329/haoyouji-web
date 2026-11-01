export type FunderInterestPeriodOrder = {
  status?: unknown;
  interest_end_date?: unknown;
  settled_at?: unknown;
  contract_interest_end_date?: unknown;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;

/** 将日期值规范为业务使用的 YYYY-MM-DD；不接受无法识别的日期。 */
export function normalizeFunderInterestDate(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;

  if (typeof value === "string") {
    const matched = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (matched) return matched[1];
  }

  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getTime() + BEIJING_OFFSET_MS)
    .toISOString()
    .slice(0, 10);
}

/** 当前北京时间业务日期。 */
export function getFunderBeijingDate(date = new Date()): string {
  return new Date(date.getTime() + BEIJING_OFFSET_MS)
    .toISOString()
    .slice(0, 10);
}

/**
 * 解析订单用于计算利息的终点。
 *
 * 已结订单始终以实际结清日期优先，避免把约定期限误作真实结清事实；
 * 未结订单填写合同截止日后则立即按完整合同期间固定计算，未填写继续累计至今日。
 */
export function resolveFunderInterestEndDate(
  order: FunderInterestPeriodOrder | null | undefined,
  actualSettlementEndDate?: unknown
): string | null {
  const actualEnd = normalizeFunderInterestDate(actualSettlementEndDate);
  if (actualEnd) return actualEnd;

  const status = String(order?.status || "")
    .trim()
    .toLowerCase();
  const isSettled = status === "settled" || status === "completed";
  if (isSettled) {
    return (
      normalizeFunderInterestDate(order?.interest_end_date) ||
      normalizeFunderInterestDate(order?.settled_at)
    );
  }

  return normalizeFunderInterestDate(order?.contract_interest_end_date);
}

/**
 * 北京时间自然日计息天数：开始日和结束日均计入；未提供结束日时累计到当前北京日期。
 */
export function calculateFunderInterestDays(
  interestStartDate: unknown,
  interestEndDate?: unknown,
  now = new Date()
): number {
  const start = normalizeFunderInterestDate(interestStartDate);
  const end =
    normalizeFunderInterestDate(interestEndDate) || getFunderBeijingDate(now);
  if (!start || !end) return 0;

  const startMs = new Date(`${start}T00:00:00+08:00`).getTime();
  const endMs = new Date(`${end}T00:00:00+08:00`).getTime();
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return 0;
  return Math.max(0, Math.floor((endMs - startMs) / DAY_MS) + 1);
}

/** 合同截止日的保存校验。相同日期合法，表示按一天计息。 */
export function isValidFunderContractInterestPeriod(
  interestStartDate: unknown,
  contractInterestEndDate: unknown
): boolean {
  const end = normalizeFunderInterestDate(contractInterestEndDate);
  if (!end) return true;
  const start = normalizeFunderInterestDate(interestStartDate);
  return Boolean(start && end >= start);
}

/**
 * 从计息开始日按自然月生成完整合同周期的最后一天。
 * 例如 2026-09-18 选择一年，结束日为 2027-09-17；首尾日均会参与计息，刚好是一整年。
 */
export function resolveFunderInterestPresetEndDate(
  interestStartDate: unknown,
  durationMonths: number
): string | null {
  const start = normalizeFunderInterestDate(interestStartDate);
  if (!start || !Number.isInteger(durationMonths) || durationMonths <= 0)
    return null;

  const [year, month, day] = start.split("-").map(Number);
  const targetMonthIndex = month - 1 + durationMonths;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const targetMonth = targetMonthIndex % 12;
  // 月末开始的合同按目标月最后一天对齐，例如 1 月 31 日起算一个月，结束于 2 月 28/29 日。
  const targetMonthLastDay = new Date(
    Date.UTC(targetYear, targetMonth + 1, 0)
  ).getUTCDate();
  const nextPeriodStart = Date.UTC(
    targetYear,
    targetMonth,
    Math.min(day, targetMonthLastDay)
  );
  return new Date(nextPeriodStart - DAY_MS).toISOString().slice(0, 10);
}

/**
 * 未结订单一旦设置约定结束日，即采用整期预收展示规则。
 * 这只决定数字如何呈现；利息与担保缺口始终继续使用完整精度计算。
 */
export function usesFunderContractInterestPrepayment(
  order: FunderInterestPeriodOrder | null | undefined
): boolean {
  const status = String(order?.status || "")
    .trim()
    .toLowerCase();
  return (
    status === "active" &&
    Boolean(normalizeFunderInterestDate(order?.contract_interest_end_date))
  );
}

/**
 * 待结利息展示：按日累计保留两位小数；整期预收显示四舍五入后的整元。
 * 这样可消除日期/浮点换算使完整一年 60,000 被显示为 59,999 的展示残差。
 * 不得将此结果回写到账务或担保公式。
 */
export function formatFunderPendingInterest(
  value: number,
  useContractPrepayment: boolean
): string {
  const normalizedValue = Number.isFinite(value) ? value : 0;
  const displayValue = useContractPrepayment
    ? Math.round(normalizedValue)
    : normalizedValue;
  return displayValue.toLocaleString(undefined, {
    minimumFractionDigits: useContractPrepayment ? 0 : 2,
    maximumFractionDigits: useContractPrepayment ? 0 : 2,
  });
}

/**
 * 联合订单仅用于界面展示的稳定分段顺序。
 *
 * 主订单仍以 `__primary__` 作为内部储存锚点，后续段也继续保留原数组和 ID；
 * 本函数绝不改变任何持久化顺序，只按计息开始日为用户生成“第 N 段”的显示顺序。
 * 未填写开始日的段排在已填写日期之后；同日或同为空时保留原有顺序。
 */
export type FunderJointSegmentDisplayEntry<T> = {
  id: string;
  isPrimary: boolean;
  /** 原始数组下标；主订单固定为 -1。仅供调用方保留内部储存身份。 */
  sourceIndex: number;
  segment: T | null;
  interestStartDate: string | null;
  displayIndex: number;
};

/**
 * 联合分段的纯展示排序模式。
 *
 * `automatic` 指管理员原先添加的物理先后，不是按日期自动重排；该模式仍以主体、随后
 * 原始子段数组的顺序展示。三种模式均只影响 UI，不能作为保存、钱包、结息或结清的身份。
 */
export type FunderJointSegmentDisplayOrderMode =
  | "ascending"
  | "descending"
  | "automatic";

export function getFunderJointSegmentDisplayOrder<T>(
  primaryInterestStartDate: unknown,
  segments: readonly T[],
  getSegmentId: (segment: T, index: number) => string,
  getSegmentInterestStartDate: (segment: T) => unknown,
  displayOrderMode: FunderJointSegmentDisplayOrderMode = "ascending"
): FunderJointSegmentDisplayEntry<T>[] {
  const entries: Array<Omit<FunderJointSegmentDisplayEntry<T>, "displayIndex">> = [
    {
      id: "__primary__",
      isPrimary: true,
      sourceIndex: -1,
      segment: null,
      interestStartDate: normalizeFunderInterestDate(primaryInterestStartDate),
    },
    ...segments.map((segment, sourceIndex) => ({
      id: getSegmentId(segment, sourceIndex),
      isPrimary: false,
      sourceIndex,
      segment,
      interestStartDate: normalizeFunderInterestDate(
        getSegmentInterestStartDate(segment)
      ),
    })),
  ];

  // 自动＝管理员原添加顺序。返回副本，避免调用者的原始分段数组被展示层影响。
  const orderedEntries = displayOrderMode === "automatic"
    ? [...entries]
    : [...entries].sort((left, right) => {
        if (left.interestStartDate && right.interestStartDate) {
          const dateDifference = left.interestStartDate.localeCompare(
            right.interestStartDate
          );
          if (dateDifference !== 0) {
            return displayOrderMode === "descending"
              ? -dateDifference
              : dateDifference;
          }
        } else if (left.interestStartDate) {
          // 倒排也不把空日期提前：未填写/非法日期始终放在有效日期之后。
          return -1;
        } else if (right.interestStartDate) {
          return 1;
        }

        // sort 的相等稳定性不应成为业务语义；显式保留主订单、随后原数组的既有顺序。
        return left.sourceIndex - right.sourceIndex;
      });

  return orderedEntries.map((entry, displayIndex) => ({ ...entry, displayIndex }));
}
