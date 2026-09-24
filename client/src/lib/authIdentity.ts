const LEDGER_VIEW_AS_KEY = 'view-as-user-id';
const SUPER_VIEW_ORIGINAL_USER_KEY = 'super_admin_original_user';
const RUNTIME_USER_INFO_KEY = 'manus-runtime-user-info';

/**
 * 清除账本内的“查看其他用户视角”状态。
 * 该状态只能跟随当前页面会话，绝不能跨真实账号登录或一键切换账号继承。
 */
export function clearLedgerViewAsState(): void {
  try {
    sessionStorage.removeItem(LEDGER_VIEW_AS_KEY);
  } catch {}
}

/**
 * 在账本子页面根据 URL 恢复受控的成员查看上下文。
 * 真实权限仍由服务端请求头和角色校验决定；此处只保证离开账本页后不会丢失已授权的查看目标。
 */
export function restoreLedgerViewAsState(rawUserId: string | null | undefined): number | undefined {
  const userId = Number(rawUserId);
  if (!Number.isInteger(userId) || userId <= 0) return undefined;
  try {
    sessionStorage.setItem(LEDGER_VIEW_AS_KEY, String(userId));
  } catch {}
  return userId;
}

/**
 * 清除一次真实登录会话附带的临时身份状态。
 * 登录和退出时调用，确保 auth token 对应的用户成为默认本人视角。
 */
export function clearTransientIdentityState(): void {
  clearLedgerViewAsState();
  try {
    localStorage.removeItem(SUPER_VIEW_ORIGINAL_USER_KEY);
    localStorage.removeItem(RUNTIME_USER_INFO_KEY);
  } catch {}
}
