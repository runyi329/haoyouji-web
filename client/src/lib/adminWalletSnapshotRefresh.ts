type WalletSnapshot = { id: number | string; [key: string]: unknown };
type SnapshotUtils = {
  cancel: (input: { userId: number }) => Promise<unknown>;
  invalidate: (input: { userId: number }, filters: { refetchType: "none" }) => Promise<unknown>;
  fetch: (input: { userId: number }, options: { staleTime: number }) => Promise<WalletSnapshot>;
};

/** 提交已经成功后，只读刷新该用户整张钱包；绝不依据调账金额估算可用/冻结或重放写入。 */
export async function refreshAdminWalletSnapshot(
  walletSnapshot: SnapshotUtils,
  userId: number,
): Promise<WalletSnapshot> {
  if (!Number.isSafeInteger(userId) || userId <= 0) throw new Error("钱包刷新用户无效");
  const input = { userId };
  // invalidate 对无缓存的首次请求会复用其旧 Promise。先取消提交前的读取，
  // 再以 staleTime=0 发出提交后的新读取，避免旧余额覆盖已经更新的流水。
  await walletSnapshot.cancel(input);
  await walletSnapshot.invalidate(input, { refetchType: "none" });
  const fresh = await walletSnapshot.fetch(input, { staleTime: 0 });
  if (!fresh || Number(fresh.id) !== userId) throw new Error("钱包刷新结果与目标用户不一致");
  return fresh;
}
