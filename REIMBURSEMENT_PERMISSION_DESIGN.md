# 报销功能权限管理设计方案

## 🎭 角色定义

### 当前系统的角色体系

查看现有数据库，账本成员有以下角色：

```typescript
// 从 schema.ts 中的 ledger_members 表
role: ENUM('owner', 'admin', 'member')
```

**现有角色**：
1. **owner（所有者）**：创建账本的人
2. **admin（管理员）**：被所有者指定的管理员
3. **member（成员）**：普通成员

---

## 🔐 报销权限方案

### 方案A：基于现有角色的权限设计（推荐）

#### 权限矩阵

| 操作 | member（员工） | admin（管理员） | owner（所有者） |
|------|----------------|-----------------|-----------------|
| 添加账目 | ✅ | ✅ | ✅ |
| 标记"需要报销" | ✅ | ✅ | ✅ |
| 查看自己的报销状态 | ✅ | ✅ | ✅ |
| **标记"已报销"** | ❌ | ✅ | ✅ |
| 查看所有报销统计 | ❌ | ✅ | ✅ |
| 导出报销清单 | ❌ | ✅ | ✅ |

#### 业务流程

```
员工（member）                财务/管理员（admin/owner）
    │                              │
    ├─ 1. 添加账目                 │
    │   金额：¥128.50              │
    │   ☑ 需要报销                 │
    │                              │
    ├─ 2. 提交后自动标记为         │
    │   "💰 待报销"                │
    │                              │
    │                         ┌────┴────┐
    │                         │ 3. 查看待报销列表
    │                         │    - 员工A: ¥128.50
    │                         │    - 员工B: ¥256.00
    │                         │
    │                         │ 4. 核对后点击
    │                         │   [✓ 标记为已报销]
    │                         │
    │                         └────┬────┘
    │                              │
    ├─ 5. 收到通知                │
    │   "您的账目已报销"           │
    │   状态变为"✅ 已报销"        │
    │                              │
```

#### 界面设计

**员工视角（member）**：
```
┌─────────────────────────────┐
│ 我的账目                     │
├─────────────────────────────┤
│ 🍜 午餐          -¥45.00    │
│    💰 待报销   (待财务确认)  │ ← 只能查看，不能操作
│                            │
│ 🚕 打车          -¥28.50    │
│    ✅ 已报销   2月11日      │
└─────────────────────────────┘
```

**管理员/所有者视角（admin/owner）**：
```
┌─────────────────────────────┐
│ 报销管理                     │
├─────────────────────────────┤
│ 💰 待报销：¥256.80 (3笔)   │
├─────────────────────────────┤
│ 🍜 午餐          -¥45.00    │
│    员工：张三               │
│    💰 待报销               │
│    [✓ 标记为已报销]         │ ← 管理员可以操作
│                            │
│ 🚕 打车          -¥28.50    │
│    员工：李四               │
│    💰 待报销               │
│    [✓ 标记为已报销]         │
└─────────────────────────────┘
```

**账目详情页（根据角色显示不同按钮）**：
```
┌─────────────────────────────┐
│ 账目详情                     │
├─────────────────────────────┤
│ 金额：¥128.50              │
│ 支出人：张三                │
│ 分类：餐饮                  │
│                            │
│ 报销状态：                  │
│ ┌─────────────────────────┐ │
│ │ 💰 待报销               │ │
│ │                         │ │
│ │ [✓ 标记为已报销]        │ │ ← 仅管理员/所有者可见
│ │                         │ │
│ │ 或显示：                │ │
│ │ 等待财务确认...         │ │ ← 普通员工看到的
│ └─────────────────────────┘ │
└─────────────────────────────┘
```

---

### 方案B：新增财务角色（更专业）

#### 新增角色

```sql
-- 修改 ledger_members 表的 role 字段
ALTER TABLE ledger_members 
MODIFY COLUMN role ENUM('owner', 'admin', 'finance', 'member') NOT NULL;
```

#### 权限矩阵

| 操作 | member | finance（财务） | admin | owner |
|------|--------|----------------|-------|-------|
| 添加账目 | ✅ | ✅ | ✅ | ✅ |
| 标记"需要报销" | ✅ | ✅ | ✅ | ✅ |
| **标记"已报销"** | ❌ | ✅ | ✅ | ✅ |
| 查看报销统计 | ❌ | ✅ | ✅ | ✅ |
| 导出报销清单 | ❌ | ✅ | ✅ | ✅ |
| 管理成员 | ❌ | ❌ | ✅ | ✅ |
| 删除账本 | ❌ | ❌ | ❌ | ✅ |

#### 优点
- 职责更明确，财务专人负责
- 权限更细粒度
- 符合企业管理规范

#### 缺点
- 需要修改现有角色体系
- 增加系统复杂度
- 小团队可能用不上

---

### 方案C：灵活权限配置（最灵活）

#### 设计思路

在账本设置中，允许所有者配置"谁可以标记已报销"：

```
┌─────────────────────────────┐
│ 账本设置                     │
├─────────────────────────────┤
│ 报销管理权限：               │
│ ○ 仅所有者                  │
│ ● 所有者和管理员            │ ← 默认
│ ○ 所有成员                  │
└─────────────────────────────┘
```

#### 数据库设计

```sql
ALTER TABLE ledgers 
ADD COLUMN reimbursement_permission ENUM('owner', 'admin', 'all') 
DEFAULT 'admin' 
COMMENT '报销标记权限：owner-仅所有者，admin-管理员及以上，all-所有成员';
```

#### 优点
- 最灵活，适应不同团队需求
- 不改变现有角色体系
- 配置简单

#### 缺点
- 可能过于灵活，导致权限混乱
- 需要额外的配置界面

---

## 📊 方案对比

| 特性 | 方案A | 方案B | 方案C |
|------|-------|-------|-------|
| 开发难度 | ⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| 权限清晰度 | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| 灵活性 | ⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐⭐ |
| 适用场景 | 小团队 | 企业 | 通用 |
| 是否改动角色体系 | ❌ | ✅ | ❌ |

---

## 💡 我的推荐

### 推荐：**方案A（基于现有角色）**

**理由**：
1. **无需改动现有角色体系**，开发成本低
2. **权限清晰**：员工申请，管理员审批
3. **符合实际业务流程**：财务/管理员负责报销确认
4. **实现简单**：只需要在前端判断角色，后端验证权限

---

## 🚀 技术实现（方案A）

### 1. 前端权限判断

```typescript
// hooks/usePermission.ts
export function useReimbursementPermission(ledgerId: string) {
  const { data: member } = trpc.getLedgerMember.useQuery({ ledgerId });
  
  return {
    canMarkReimbursed: member?.role === 'admin' || member?.role === 'owner',
    canViewAllReimbursements: member?.role === 'admin' || member?.role === 'owner',
    isOwner: member?.role === 'owner',
  };
}

// 使用示例
function LedgerDetail() {
  const { canMarkReimbursed } = useReimbursementPermission(ledgerId);
  
  return (
    <div>
      {canMarkReimbursed ? (
        <button onClick={markAsReimbursed}>✓ 标记为已报销</button>
      ) : (
        <div className="text-gray-500">等待财务确认...</div>
      )}
    </div>
  );
}
```

### 2. 后端权限验证

```typescript
// server/routers.ts
markReimbursement: protectedProcedure
  .input(z.object({
    recordId: z.string(),
    status: z.enum(['pending', 'completed']),
  }))
  .mutation(async ({ ctx, input }) => {
    // 1. 获取账目信息
    const record = await db.query.ledgerRecords.findFirst({
      where: eq(ledgerRecords.id, input.recordId),
    });
    
    if (!record) throw new Error('账目不存在');
    
    // 2. 检查权限
    const member = await db.query.ledgerMembers.findFirst({
      where: and(
        eq(ledgerMembers.ledgerId, record.ledgerId),
        eq(ledgerMembers.userId, ctx.user.id)
      ),
    });
    
    if (!member) throw new Error('无权限');
    
    // 3. 只有 admin 和 owner 可以标记为已报销
    if (input.status === 'completed') {
      if (member.role !== 'admin' && member.role !== 'owner') {
        throw new Error('只有管理员和所有者可以标记已报销');
      }
    }
    
    // 4. 更新状态
    await db.update(ledgerRecords)
      .set({
        reimbursementStatus: input.status,
        reimbursedAt: input.status === 'completed' ? new Date() : null,
        reimbursedBy: input.status === 'completed' ? ctx.user.id : null,
      })
      .where(eq(ledgerRecords.id, input.recordId));
    
    return { success: true };
  }),
```

### 3. 界面适配

**账目列表页**：
```typescript
// 根据角色显示不同的筛选器
{canViewAllReimbursements ? (
  <ReimbursementFilter 
    value={filter} 
    onChange={setFilter}
    stats={reimbursementStats} // 显示统计
  />
) : (
  <div className="text-sm text-gray-500">
    您的待报销账目：{myPendingCount}笔
  </div>
)}
```

**账目详情页**：
```typescript
// 根据角色显示不同的操作按钮
{reimbursementStatus === 'pending' && (
  canMarkReimbursed ? (
    <button onClick={markAsReimbursed}>
      ✓ 标记为已报销
    </button>
  ) : (
    <div className="text-gray-500">
      💰 等待财务确认...
    </div>
  )
)}
```

---

## 🎨 完整界面流程

### 员工操作流程

**1. 添加账目**
```
┌─────────────────────────────┐
│ 添加账目                     │
├─────────────────────────────┤
│ 金额：¥ 128.50             │
│ 分类：餐饮                  │
│ 日期：2026-02-13           │
│                            │
│ ☑ 需要报销                 │ ← 勾选
│                            │
│ [保存]                      │
└─────────────────────────────┘
```

**2. 查看自己的账目**
```
┌─────────────────────────────┐
│ 我的账目                     │
├─────────────────────────────┤
│ 您的待报销账目：2笔 ¥173.50 │
├─────────────────────────────┤
│ 🍜 午餐          -¥45.00    │
│    💰 待报销   (等待确认)   │
│                            │
│ 🚕 打车          -¥28.50    │
│    ✅ 已报销   2月11日      │
└─────────────────────────────┘
```

### 管理员操作流程

**1. 查看待报销列表**
```
┌─────────────────────────────┐
│ 报销管理                     │
├─────────────────────────────┤
│ 筛选：[待报销▼]             │
│ 💰 待报销：¥256.80 (3笔)   │
├─────────────────────────────┤
│ 🍜 午餐          -¥45.00    │
│    员工：张三   2月10日     │
│    [✓ 已报销] [查看详情]   │
│                            │
│ 🚕 打车          -¥28.50    │
│    员工：李四   2月11日     │
│    [✓ 已报销] [查看详情]   │
│                            │
│ 📄 文具         -¥183.30    │
│    员工：王五   2月12日     │
│    [✓ 已报销] [查看详情]   │
└─────────────────────────────┘
```

**2. 标记已报销**
```
点击 [✓ 已报销] 后：

┌─────────────────────────────┐
│ 确认报销                     │
├─────────────────────────────┤
│ 账目：午餐                  │
│ 金额：¥45.00               │
│ 员工：张三                  │
│                            │
│ 确认已报销？                │
│                            │
│ [取消] [确认]               │
└─────────────────────────────┘

确认后状态变为 ✅ 已报销
```

---

## 📱 通知机制（可选）

### 报销状态变更通知

当管理员标记账目为"已报销"时，可以给员工发送通知：

```typescript
// 简单的站内通知
{
  type: 'reimbursement_completed',
  title: '报销已完成',
  message: '您的账目"午餐 ¥45.00"已报销',
  time: '2026-02-13 14:30',
}
```

**通知显示位置**：
- 顶部通知栏
- 或者在账目列表页显示小红点

---

## ❓ 你的选择

请告诉我：

1. **方案A**：基于现有角色（admin/owner 可标记已报销）✅ 推荐
2. **方案B**：新增财务角色（更专业，但改动大）
3. **方案C**：灵活权限配置（最灵活，但可能过于复杂）

或者你有其他想法？😊
