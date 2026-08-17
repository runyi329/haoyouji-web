export type SmartAccountingLastPage = 'reimbursement' | 'loans';

function getStorageKey(userId: number | string) {
  return `smart_accounting_last_page:${userId}`;
}

/**
 * 记录用户从智能会计返回首页前的最后功能页。
 * 使用用户 ID 隔离，刷新页面或重新登录后仍可恢复该用户的上次位置。
 */
export function setSmartAccountingLastPage(
  userId: number | string | null | undefined,
  page: SmartAccountingLastPage,
) {
  if (userId == null) return;
  try {
    localStorage.setItem(getStorageKey(userId), page);
  } catch {
    // 隐私模式或存储不可用时保留默认入口，不影响正常导航。
  }
}

/** 默认进入报销申请单，只有显式记录为 loans 时才恢复贷款管理。 */
export function getSmartAccountingLastPage(
  userId: number | string | null | undefined,
): SmartAccountingLastPage {
  if (userId == null) return 'reimbursement';
  try {
    return localStorage.getItem(getStorageKey(userId)) === 'loans'
      ? 'loans'
      : 'reimbursement';
  } catch {
    return 'reimbursement';
  }
}

export function getSmartAccountingRoute(
  userId: number | string | null | undefined,
) {
  return getSmartAccountingLastPage(userId) === 'loans'
    ? '/credit-cards?from=home'
    : '/ledger/76/add?from=home';
}
