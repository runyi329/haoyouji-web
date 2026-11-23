export type Ledger37PermissionInput = {
  ledgerId: number;
  userId: number;
  ownerId: number | string | null | undefined;
  memberRole?: string | null;
  isViewingAs?: boolean;
};

/** 37号全权只取决于真实账本 ownerId；系统角色、昵称和委派 admin 均不能升级权限。 */
export function isLedger37FullManager(input: Ledger37PermissionInput): boolean {
  const ownerId = Number(input.ownerId);
  return input.ledgerId === 37 && !input.isViewingAs
    && Number.isInteger(ownerId) && ownerId > 0
    && Number.isInteger(input.userId) && input.userId > 0
    && input.userId === ownerId;
}

/** 普通管理员仅可通过受限接口登记日历余额与照片，不能用于股票、设置、钱包、分红或通用交易管理。 */
export function canRecordLedger37Calendar(input: Ledger37PermissionInput): boolean {
  return input.ledgerId === 37 && !input.isViewingAs
    && Number.isInteger(input.userId) && input.userId > 0
    && (isLedger37FullManager(input) || input.memberRole === 'admin');
}
