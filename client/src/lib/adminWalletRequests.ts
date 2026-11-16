// 管理员钱包使用独立请求，防止余额/流水被同批全局统计和长周期走势拖住。
// 不改变接口身份、权限、请求参数或资金重试策略。
export function isAdminWalletRequest(path: string): boolean {
  return path === "adminUser.list"
    || path.startsWith("adminUser.wallet")
    || path.startsWith("adminUser.multiAssetWallet")
    || path === "ledger.afGetMyRechargeHistory";
}

// 调账页自行进行定向同步；两秒全量 ledger.invalidate 会取消正在重读的历史。
export function isAdminRechargeManagementPage(pathname: string): boolean {
  return /^\/ledger\/(?:37|52)\/af-recharge-manage\/?$/.test(pathname.split("?")[0]);
}
