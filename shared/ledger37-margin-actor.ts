export type Ledger37MarginIdentity = { id: number; name?: string | null; username?: string | null };
export type Ledger37MarginActorContext = {
  user: Ledger37MarginIdentity | null;
  realUser?: Ledger37MarginIdentity | null;
};

/** realUser 由认证上下文保存；有效视角、目标参数和角色均不能授予资金权限。 */
export function getLedger37MarginActor(ctx: Ledger37MarginActorContext): Ledger37MarginIdentity | null {
  if (!ctx.user || !ctx.realUser) return null;
  return ctx.realUser;
}

export function getLedger37MarginPermission(ctx: Ledger37MarginActorContext) {
  const actor = getLedger37MarginActor(ctx);
  return {
    canManageMargins: actor?.id === 870413,
    operator: actor ? { id: actor.id, name: actor.name || actor.username || '' } : null,
  };
}
