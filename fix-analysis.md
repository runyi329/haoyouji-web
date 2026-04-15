# 视角切换 Bug 分析

## 用户反馈
管理员切换到"应浩"视角时，看到了不属于应浩的订单（YY0720 是 jennypu 的）。
要求：管理员切换视角后，除底部黄色返回按钮外，看到的内容必须和该成员自己登录看到的完全一致。

## 后端分析 (server/routers.ts:12296-12342)
`funderGetAssetOrders` 后端逻辑是正确的：
- 管理员 isManager=true, isFunder=false
- 当 input.userId 存在时, targetUserId = input.userId (应浩的ID)
- SQL 会按 user_id = targetUserId 过滤

## 前端分析 (client/src/pages/LedgerDetail.tsx)

### 问题1: funderGetAssetSummary 没有传 viewAsUserId
```tsx
// 第1491行 - 只传了 ledgerId，没有传 userId
const { data: funderAssetSummary } = trpc.ledger.funderGetAssetSummary.useQuery(
    { ledgerId: Number(ledgerId) },
    { enabled: isCustomAF && effectiveIsFunder }
);
```
后端 funderGetAssetSummary (12345-12394) 用的是 `ctx.user.id`，不接受 userId 参数。
管理员切换视角后，后端仍然用管理员自己的 user_id 查询，返回的是管理员的汇总（管理员不是 funder，可能返回空）。

### 问题2: funderGetAssetOrders 的 enabled 条件
```tsx
// 第1497-1499行
const { data: funderAssetData } = trpc.ledger.funderGetAssetOrders.useQuery(
    { ledgerId: Number(ledgerId), ...(viewAsUserId ? { userId: viewAsUserId } : {}) },
    { enabled: isCustomAF && (effectiveIsFunder || ((isOwner || isAdmin) && !!viewAsUserId && effectiveIsFunder)), staleTime: 5 * 60 * 1000 }
);
```
enabled 条件简化后 = `isCustomAF && effectiveIsFunder`
当 viewAsUserId 指向 funder 角色时, effectiveIsFunder=true, 会发请求带 userId=viewAsUserId
**后端逻辑正确，应该只返回该用户的订单**

### 可能的真正原因
1. `staleTime: 5 * 60 * 1000` - 5分钟缓存，但 tRPC 的缓存 key 包含参数，不同参数不会复用缓存
2. **更可能的原因**：管理员自己不是 funder，所以管理员视角下 effectiveIsFunder=false，funderGetAssetOrders 不会被调用。
   但管理员可能之前在 FunderManagement 页面查看过全部订单，然后回到 LedgerDetail 切换视角。
   由于 tRPC 查询参数不同（FunderManagement 用 selectedUserId，LedgerDetail 用 viewAsUserId），不会共享缓存。

### 需要修复的地方
1. **funderGetAssetSummary** 后端不支持 userId 参数，管理员切换视角时看到的汇总数据是错的
2. **funderGetAssetOrders** 的 enabled 条件需要简化，确保管理员+viewAsUserId+目标是funder时一定触发
3. 所有 funder 相关查询都需要支持管理员代查
