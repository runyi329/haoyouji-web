export type T0WithdrawalSource = "income" | "principal";

export type T0PayoutAvailability = {
  relatedUserId: number;
  availableAmount?: number | null;
  availableIncomeAmount?: number | null;
  availablePrincipalAmount?: number | null;
  depositTotal?: number;
  incomeWithdrawalTotal?: number;
  principalWithdrawalTotal?: number;
  income?: { total: number } | null;
};

type EditingWithdrawal = {
  relatedUserId: number;
  direction: "deposit" | "withdrawal";
  withdrawalSource?: T0WithdrawalSource;
  amount: number;
};

export function getT0WithdrawalSource(record: { withdrawalSource?: T0WithdrawalSource }): T0WithdrawalSource {
  return record.withdrawalSource === "principal" ? "principal" : "income";
}

export function getT0WithdrawalLabel(source: T0WithdrawalSource): string {
  return source === "principal" ? "本金提现" : "收益提现";
}

/** 额度只认服务端同一成员的完整返回；null/缺字段不是0元，禁止把未知额度当可保存。 */
export function getT0PayoutWithdrawalLimit(
  availability: T0PayoutAvailability | undefined,
  relatedUserId: number,
  source: T0WithdrawalSource,
  editing?: EditingWithdrawal | null,
): number | null {
  if (!availability || relatedUserId <= 0 || availability.relatedUserId !== relatedUserId) return null;
  const raw = source === "principal"
    ? availability.availablePrincipalAmount
    : availability.availableIncomeAmount === undefined ? availability.availableAmount : availability.availableIncomeAmount;
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) return null;
  const current = editing?.direction === "withdrawal"
    && editing.relatedUserId === relatedUserId
    && getT0WithdrawalSource(editing) === source
    && Number.isFinite(editing.amount) && editing.amount > 0
    ? editing.amount : 0;
  if (!current) return raw;
  const cap = source === "principal" ? availability.depositTotal : availability.income?.total;
  const withdrawn = source === "principal" ? availability.principalWithdrawalTotal : availability.incomeWithdrawalTotal;
  if (typeof cap === "number" && Number.isFinite(cap) && typeof withdrawn === "number" && Number.isFinite(withdrawn)) {
    // 在原余额已被截成0时，仍按真实上限减其它提现，不能简单把本笔全额加回。
    const capCents = Math.floor(Math.max(0, cap) * 100 + 0.0000001);
    return Math.max(0, capCents - Math.round(withdrawn * 100) + Math.round(current * 100)) / 100;
  }
  return Math.max(0, Math.round(raw * 100) + Math.round(current * 100)) / 100;
}
