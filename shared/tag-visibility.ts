/** 仅37号账本未来加入的非-owner真人成员使用默认隐藏策略。 */
export const TAG_VISIBILITY_DEFAULT_LEDGER_ID = 37;
export const TAG_VISIBILITY_DEFAULT_KEY = "__tagVisibilityDefault";

/** 与真人成员的 INSERT 同句写入；其他账本和 owner 保持原来的 null。 */
export function createNewMemberInitialBalances(ledgerId: number, role = "member"): string | null {
  if (ledgerId !== TAG_VISIBILITY_DEFAULT_LEDGER_ID || role === "owner") return null;
  return JSON.stringify({ [TAG_VISIBILITY_DEFAULT_KEY]: 0 });
}

/** 显式设置优先；旧账号缺失标签仍可见，默认标记为0的新账号缺失标签不可见。 */
export function readTagVisible(
  balances: Record<string, unknown> | null | undefined,
  tagName: string,
): boolean {
  const explicitVisibility = balances?.[`${tagName}__visible`];
  if (explicitVisibility !== null && explicitVisibility !== undefined) {
    return Number(explicitVisibility) !== 0;
  }
  const defaultVisibility = balances?.[TAG_VISIBILITY_DEFAULT_KEY];
  return defaultVisibility === null || defaultVisibility === undefined || Number(defaultVisibility) !== 0;
}
