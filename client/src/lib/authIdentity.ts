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
