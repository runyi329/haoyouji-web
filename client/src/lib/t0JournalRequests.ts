// 只改变首屏journal的传输方式；认证头、接口权限、输入、缓存键及重试仍由原链路处理。
export function isT0JournalRequest(path: string): boolean {
  return path === "ledger.t0GetJournal";
}
