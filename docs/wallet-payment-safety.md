# 全局钱包支付安全规范

更新日期：2026-11-03。适用于脉动网全部商城、全局钱包资金扣款、转账、提现以及减少余额的管理操作。

## 核心规则

**钱包是全局共用的；商城、账本和订单不能侵占冻结资金，不能按账本拆出另一套“可支付余额”。**

- 可用余额 = 该用户该币种总余额 − 全部仍有效的冻结剩余金额。
- 冻结剩余金额 = `amount - released_amount`，仅统计 `status='active'`。不能把已释放金额再次扣除。
- 人民币只使用人民币可用额，USDT只使用USDT可用额。不能把其他币种或冻结资产折算后当作可以支付的余额。
- `[BALANCE_BASE]` 是基础余额的兼容镜像，不可重复计入余额；`[CNY]` 手工流水归人民币，其余有效手工流水归USDT。归类须与数据库前缀匹配/排序规则一致。
- 付款比较不使用 epsilon 放行：不能允许 `扣款 <= 可用余额 + 误差`。
- 正常业务扣款后，相关币种的可用金额不能变成负数。已有历史负可用额的币种只能补入/解冻，不允许继续扣减；另一币种未被使用时不应阻断合法支付。
- 页面看到的余额不是付款凭据。后端必须在事务中锁定用户，重新校验可用金额，缺表、读取异常或冻结台账异常应拒付，不可降级成总余额支付。

## 商城的统一接入方式

权威实现：`server/wallet-funding-guard.ts`。

```ts
import {
  withGlobalWalletTransaction,
  debitGlobalWallet,
} from "./wallet-funding-guard";

const orderId = await withGlobalWalletTransaction(userId, async transaction => {
  // 订单写入必须使用传入的同一独占连接，不能自行获取池或提交事务。
  const orderId = await createOrder(orderFields, transaction);
  await debitGlobalWallet({
    transaction,
    userId,
    cnyAmount: deductCny,
    usdtAmount: deductUsdt,
    note: `商城订单扣款 #${orderNo}`,
    relatedId: orderId,
  });
  return orderId;
});
```

订单、人民币扣款、USDT扣款、辅助流水必须在同一事务中完成；任一步失败整体回滚。人民币够而USDT不够时，不能先扣走人民币再报错。通知等不可回滚的外部动作应在提交后执行。

`getGlobalWalletFundingBalance(userId, assetCode)` 只适合UI/服务端预检；最终扣款仍必须调用事务内安全层。不要在查询接口里使用写入事务来“试扣”。

共用 USDT 负数入账 `addUserBalance` 和人民币负数调整 `adminAdjustCnyBalance` 已加入同样防护。**已处在商城事务内时，不要再调用另起事务的扣款方法；否则会在同一用户行锁上等待自己。** 使用 `debitGlobalWallet` 或在当前连接内调用 `assertGlobalWalletDebit` 后写入。

## 并发和连接要求

- 使用 `getDbTransactionConnection()` 取得独占连接，先 `beginTransaction()`，首个资金读取锁住 `users.id FOR UPDATE`。
- 共用资金消费、转账和37/52资金冻结遵循同一用户锁，从而避免两个请求同时认为余额足够。
- 冻结和手工余额用当前锁定读取，不以较早的普通查询结果进行最终校验。
- `getDbConnection()` 历史上返回共享连接池；不能对它调用 `beginTransaction/commit/rollback` 来冒充独占事务。
- 连接池取得的事务连接必须在 `finally` 中 `release()`。不得关闭整个共享池。
- 必要的表初始化在事务之前完成；订单/扣款事务内禁止DDL。
- 库存预占、钱包资金事务和失败库存回补要区分归属。库存关联进入订单事务时不得自行提交、回滚或释放该连接。

## 管理员操作也不能绕过

负数调账、删除正数手工入账、把正数入账改小、把备注从CNY改成USDT等，都可能减少原币种的余额。须按照**修改前后各币种实际贡献差额**做扣减校验，而不是只检查新金额是否为负。

本轮已覆盖旧手动流水新增/编辑/删除接口、统一调账、通用提现和提现申请、站内转账以及充值/手工流水/余额流水扣回路径。存款增加与合法解冻不属于消费，不应被错误阻断。不要通过调大/调小冻结额或伪造历史充值来补救支付错误。

数字币可用余额与冻结余额由 `db-multi-asset-wallet.ts` 维护。未来商城若新增ETH、SOL等直接支付，必须接入该币种的可用余额扣款和条件更新/事务机制；不可把其冻结余额并入支付余额，也不可直接修改资产余额字段。

## 客户端要求

商城结算查询现有 `recharge.getCnyBalanceSummary` / `getUsdtBalanceSummary`，只使用返回值 `available` 进行显示和支付计算，不能回退 `total`。

余额加载、错误、非法数据时不可支付；本轮页面在后台刷新时也暂停付款，避免使用刷新中的旧值。负可用额显示为0用于支付，但历史欠额保留在后台审计，不能用 `Math.max(0, balance)` 写回数据库清零。付款成功须使两种摘要和原钱包余额缓存都失效刷新。

## 验证与发布

```bash
pnpm exec vitest run server/wallet-funding-guard.test.ts
pnpm check
pnpm build
# 构建自动改动的日志文件不可提交：
git restore -- server/git-log.json
```

测试覆盖冻结余额不消费、已部分释放冻结额、极小精度差额、CNY+USDT同时回滚、并发扣款、消费/负奖励/负佣金/退款扣回/调账/提现等共用入口。测试数据库为隔离模拟，不连接生产数据库。

生产排查仅执行只读核对；不得为了测试支付向真实用户创建订单、钱包流水、冻结或调账。历史异常款项是否补回、冻结是否更正须另行由用户核对授权。按项目规则仅暂存本轮文件，rebase远端main，推送并等待主自动部署成功。
