export type OrdinaryTagVisibilityInput = {
  ledgerId: number;
  targetUserId: number;
  tagName: string;
  visible: boolean;
  hasFinancialRecords?: boolean;
  impactHash?: string;
};
export type OrdinaryTagVisibilityPayload = {
  ledgerId: number;
  targetUserId: number;
  balances: Record<string, number>;
  migratedMarginNoteIds: number[];
  hideAcknowledgements: Array<{ tagName: string; impactHash: string }>;
};
export const ordinaryVisibilityScope = (userId: number, tagName: string) => `${userId}::${tagName}`;

/** 可见性保存不能携带金额、观察、日期、押金或暂停配置。 */
export function ordinaryTagVisibilityPayload(input: OrdinaryTagVisibilityInput): OrdinaryTagVisibilityPayload {
  if (input.ledgerId !== 37 || !Number.isSafeInteger(input.targetUserId) || input.targetUserId <= 0 || !input.tagName) {
    throw new Error('仅支持37号账本有效普通标签成员');
  }
  if (!input.visible && input.hasFinancialRecords && !input.impactHash?.trim()) {
    throw new Error('有账务记录的标签须先完成两次隐藏确认');
  }
  return {
    ledgerId: input.ledgerId,
    targetUserId: input.targetUserId,
    balances: { [`${input.tagName}__visible`]: input.visible ? 1 : 0 },
    migratedMarginNoteIds: [],
    hideAcknowledgements: !input.visible && input.impactHash
      ? [{ tagName: input.tagName, impactHash: input.impactHash }] : [],
  };
}

/** 无dirty副作用；成功或回滚都只替换本用户、本标签的visible。 */
export function patchOrdinaryTagVisible<T extends { visible: boolean }>(
  previous: Record<number, Record<string, T>>, userId: number, tagName: string, visible: boolean, fallback: T,
): Record<number, Record<string, T>> {
  return { ...previous, [userId]: { ...previous[userId], [tagName]: { ...(previous[userId]?.[tagName] ?? fallback), visible } } };
}
export function patchOrdinaryVisibilityCache<T extends { balancesMap: Record<number, Record<string, unknown>> }>(
  previous: T | undefined, input: OrdinaryTagVisibilityInput,
): T | undefined {
  if (!previous) return previous;
  return { ...previous, balancesMap: { ...previous.balancesMap,
    [input.targetUserId]: { ...previous.balancesMap[input.targetUserId], [`${input.tagName}__visible`]: input.visible ? 1 : 0 },
  } };
}

/** 显式点击才执行；DEV在任何POST前返回。调用方的金额/观察/日期草稿不参与此操作。 */
export async function saveOrdinaryTagVisibility(input: OrdinaryTagVisibilityInput, deps: {
  isDev: boolean;
  previousVisible: boolean;
  save: (payload: OrdinaryTagVisibilityPayload) => Promise<unknown>;
  updateVisible: (visible: boolean) => void;
  onSaved: () => void;
}): Promise<void> {
  const payload = ordinaryTagVisibilityPayload(input);
  deps.updateVisible(input.visible);
  if (deps.isDev) return;
  try {
    await deps.save(payload);
  } catch (error) {
    deps.updateVisible(deps.previousVisible);
    throw error;
  }
  deps.updateVisible(input.visible);
  deps.onSaved();
}
