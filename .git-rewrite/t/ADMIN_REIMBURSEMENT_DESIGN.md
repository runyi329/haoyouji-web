# 账本管理员管理 + 报销功能完整设计

## 📋 需求总结

### 1. 账本管理员管理
- 创始人（owner）可以设置管理员（admin）
- 管理员权限：除了不能删除账本和封存账本，其他权限都有

### 2. 报销功能
- 添加账目时选择报销状态（无需报销/待报销）
- 账目列表显示报销标签
- 管理员可以管理报销（上传凭证、标记已报销）
- 支持修改记录查看

---

## 🗄️ 数据库设计

### 1. 修改 ledger_members 表

**当前问题**：role 只有 `owner` 和 `member`，缺少 `admin`

```sql
-- 修改 role 字段，添加 admin 角色
ALTER TABLE ledger_members 
MODIFY COLUMN role ENUM('owner', 'admin', 'member') DEFAULT 'member' NOT NULL;
```

### 2. 修改 ledger_records 表

**添加报销相关字段**：

```sql
-- 添加报销状态字段
ALTER TABLE ledger_records 
ADD COLUMN reimbursement_status ENUM('none', 'pending', 'completed') 
DEFAULT 'none' 
COMMENT '报销状态：none-无需报销，pending-待报销，completed-已报销';

-- 添加报销金额（预留，支持部分报销）
ADD COLUMN reimbursement_amount DECIMAL(10,2) NULL 
COMMENT '报销金额';

-- 添加报销时间
ADD COLUMN reimbursed_at DATETIME NULL 
COMMENT '报销时间';

-- 添加报销操作人
ADD COLUMN reimbursed_by INT NULL 
COMMENT '报销操作人ID';

-- 添加报销备注
ADD COLUMN reimbursement_notes TEXT NULL 
COMMENT '报销备注';

-- 添加报销凭证图片
ADD COLUMN reimbursement_voucher_url TEXT NULL 
COMMENT '报销凭证图片URL';
```

### 3. 新建报销修改历史表

```sql
CREATE TABLE reimbursement_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  record_id INT NOT NULL COMMENT '账目ID',
  ledger_id INT NOT NULL COMMENT '账本ID',
  operated_by INT NOT NULL COMMENT '操作人ID',
  action VARCHAR(50) NOT NULL COMMENT '操作类型：mark_pending, mark_completed, update',
  old_status ENUM('none', 'pending', 'completed') NULL COMMENT '旧状态',
  new_status ENUM('none', 'pending', 'completed') NULL COMMENT '新状态',
  notes TEXT NULL COMMENT '操作备注',
  voucher_url TEXT NULL COMMENT '凭证URL',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_record_id (record_id),
  INDEX idx_ledger_id (ledger_id)
) COMMENT='报销修改历史记录';
```

---

## 🔌 API 接口设计

### 1. 账本管理员管理

#### 1.1 获取账本成员列表（含角色）
```typescript
getLedgerMembers: {
  input: { ledgerId: number },
  output: {
    members: Array<{
      id: number;
      userId: number;
      username: string;
      nickname: string | null;
      avatar: string | null;
      role: 'owner' | 'admin' | 'member';
      joinedAt: string;
    }>
  }
}
```

#### 1.2 设置成员角色
```typescript
setMemberRole: {
  input: { 
    ledgerId: number;
    memberId: number;
    role: 'admin' | 'member';
  },
  output: { success: boolean }
}
```

**权限验证**：
- 只有 owner 可以设置角色
- 不能修改 owner 的角色
- 不能把自己的角色改为 member

### 2. 报销功能

#### 2.1 标记报销状态（添加/编辑账目时）
```typescript
// 在 addTransaction 和 updateTransaction 中添加 reimbursementStatus 参数
addTransaction: {
  input: {
    // ... 现有字段
    reimbursementStatus: 'none' | 'pending'; // 添加时只能选这两个
  }
}
```

#### 2.2 管理报销（管理员操作）
```typescript
manageReimbursement: {
  input: {
    recordId: number;
    status: 'pending' | 'completed';
    notes?: string;
    voucherImage?: string; // base64 或 URL
  },
  output: { 
    success: boolean;
    voucherUrl?: string; // 如果上传了图片
  }
}
```

**权限验证**：
- 只有 admin 和 owner 可以操作
- 记录修改历史

#### 2.3 获取报销历史
```typescript
getReimbursementHistory: {
  input: { recordId: number },
  output: {
    history: Array<{
      id: number;
      operatedBy: string; // 操作人名称
      action: string;
      oldStatus: string | null;
      newStatus: string | null;
      notes: string | null;
      voucherUrl: string | null;
      createdAt: string;
    }>
  }
}
```

#### 2.4 获取报销统计
```typescript
getReimbursementStats: {
  input: { ledgerId: number },
  output: {
    pending: {
      count: number;
      amount: number;
    };
    completed: {
      count: number;
      amount: number;
    };
  }
}
```

---

## 🎨 界面设计

### 1. 账本管理员管理页面

**路由**：`/ledger/:id/admin-management`

**界面结构**：
```
┌─────────────────────────────────────┐
│ ← 账本管理员管理                     │
├─────────────────────────────────────┤
│ 成员列表                            │
├─────────────────────────────────────┤
│ 👤 张三                             │
│    角色：创始人                     │
│    加入时间：2026-01-15             │
├─────────────────────────────────────┤
│ 👤 李四                             │
│    角色：[管理员 ▼]                │ ← 下拉选择
│         ├ 管理员                   │
│         └ 普通成员                 │
│    加入时间：2026-01-20             │
├─────────────────────────────────────┤
│ 👤 王五                             │
│    角色：[普通成员 ▼]              │
│    加入时间：2026-02-01             │
└─────────────────────────────────────┘
```

**权限说明**：
- 只有 owner 可以访问此页面
- 可以设置其他成员为 admin 或 member
- owner 角色不可更改

### 2. 添加账目页面（报销状态选择）

**位置**：支付方式下方

```
┌─────────────────────────────────────┐
│ 添加账目                            │
├─────────────────────────────────────┤
│ 金额：¥ 128.50                     │
│ 分类：餐饮                          │
│ 日期：2026-02-13                   │
│                                    │
│ 支付方式                            │
│ ┌────┬────┬────┬────┬────┐        │
│ │现金│微信│支付宝│银行卡│其他│       │
│ └────┴────┴────┴────┴────┘        │
│                                    │
│ 报销状态                            │
│ ┌──────────┬──────────┐           │
│ │ 无需报销 │ 待报销   │           │ ← 暗色风格，默认选中"无需报销"
│ └──────────┴──────────┘           │
│                                    │
│ [保存]                              │
└─────────────────────────────────────┘
```

**样式**：
- 与支付方式一致的暗色按钮组
- 默认选中"无需报销"
- 点击切换选中状态

### 3. 账目列表（报销标签显示）

```
┌─────────────────────────────────────┐
│ 账目列表                            │
├─────────────────────────────────────┤
│ 🍜 午餐                -¥45.00     │
│    📷 💰待报销                      │ ← 醒目颜色（橙色）
│    2月10日                          │
├─────────────────────────────────────┤
│ 🚕 打车                -¥28.50     │
│    ✅已报销                         │ ← 绿色
│    2月11日                          │
├─────────────────────────────────────┤
│ 📄 文具                -¥183.30    │
│    无需报销                         │ ← 灰色
│    2月12日                          │
└─────────────────────────────────────┘
```

**标签样式**：
- 💰待报销：橙色背景 `#f97316`
- ✅已报销：绿色背景 `#10b981`
- 无需报销：灰色背景 `#6b7280`

### 4. 报销管理弹窗（管理员点击标签）

**触发条件**：
- 管理员/owner 点击"待报销"或"已报销"标签
- 普通成员点击无反应

**弹窗内容**：

#### 4.1 待报销状态
```
┌─────────────────────────────────────┐
│ 报销管理                            │
├─────────────────────────────────────┤
│ 账目信息                            │
│ 金额：¥128.50                      │
│ 分类：餐饮                          │
│ 支出人：张三                        │
│ 日期：2026-02-13                   │
├─────────────────────────────────────┤
│ 报销信息                            │
│                                    │
│ 备注：                              │
│ ┌─────────────────────────────┐   │
│ │ 公司聚餐，已提交报销申请      │   │
│ └─────────────────────────────┘   │
│                                    │
│ 报销凭证：                          │
│ ┌─────────────────────────────┐   │
│ │     [📷 上传转账凭证]        │   │
│ │  或点击拍照                   │   │
│ └─────────────────────────────┘   │
│                                    │
│ [取消]  [✓ 标记为已报销]          │
└─────────────────────────────────────┘
```

#### 4.2 已报销状态
```
┌─────────────────────────────────────┐
│ 报销详情                            │
├─────────────────────────────────────┤
│ 账目信息                            │
│ 金额：¥128.50                      │
│ 分类：餐饮                          │
│ 支出人：张三                        │
│ 日期：2026-02-13                   │
├─────────────────────────────────────┤
│ 报销信息                            │
│                                    │
│ 状态：✅ 已报销                    │
│ 报销时间：2026-02-14 10:30         │
│ 操作人：李四（管理员）              │
│                                    │
│ 备注：公司聚餐，已提交报销申请      │
│                                    │
│ 报销凭证：                          │
│ ┌─────────────────────────────┐   │
│ │   [查看转账凭证图片]          │   │
│ └─────────────────────────────┘   │
│                                    │
│ 修改历史：                          │
│ • 2026-02-14 10:30 李四标记为已报销 │
│ • 2026-02-13 15:20 张三申请报销     │
│                                    │
│ [修改]  [关闭]                     │
└─────────────────────────────────────┘
```

**点击"修改"**：
- 可以修改备注
- 可以重新上传凭证
- 可以改回"待报销"状态
- 所有修改都记录到历史

---

## 🔐 权限矩阵

| 功能 | owner | admin | member |
|------|-------|-------|--------|
| 设置管理员 | ✅ | ❌ | ❌ |
| 删除账本 | ✅ | ❌ | ❌ |
| 封存账本 | ✅ | ❌ | ❌ |
| 添加账目 | ✅ | ✅ | ✅ |
| 标记"待报销" | ✅ | ✅ | ✅ |
| 管理报销（标记已报销） | ✅ | ✅ | ❌ |
| 上传报销凭证 | ✅ | ✅ | ❌ |
| 查看报销历史 | ✅ | ✅ | ✅ |
| 修改已报销状态 | ✅ | ✅ | ❌ |

---

## 📱 交互流程

### 流程1：员工申请报销
```
1. 员工添加账目
   ↓
2. 选择"待报销"
   ↓
3. 保存账目
   ↓
4. 账目列表显示"💰待报销"标签
   ↓
5. 等待管理员处理
```

### 流程2：管理员处理报销
```
1. 管理员查看账目列表
   ↓
2. 点击"💰待报销"标签
   ↓
3. 弹出报销管理界面
   ↓
4. 输入备注、上传凭证
   ↓
5. 点击"标记为已报销"
   ↓
6. 状态变为"✅已报销"
   ↓
7. 记录到修改历史
```

### 流程3：管理员修改报销
```
1. 管理员点击"✅已报销"标签
   ↓
2. 查看报销详情和历史
   ↓
3. 点击"修改"
   ↓
4. 修改备注或凭证
   ↓
5. 或改回"待报销"状态
   ↓
6. 保存修改
   ↓
7. 记录到修改历史
```

---

## 🎯 实现优先级

### Phase 1：基础功能（本次实现）
1. ✅ 数据库迁移（添加字段和表）
2. ✅ 账本管理员管理页面
3. ✅ 添加账目的报销状态选择
4. ✅ 账目列表的报销标签显示
5. ✅ 报销管理弹窗（基础版）

### Phase 2：增强功能（后续）
1. 报销统计页面
2. 报销筛选和搜索
3. 批量报销操作
4. 报销导出（Excel）
5. 报销通知

---

## 🛠️ 技术实现要点

### 1. 图片上传（报销凭证）
- 复用现有的 `uploadLedgerImage` API
- 存储到 COS 的 `reimbursement-vouchers/` 文件夹
- 自动压缩（800x800, 80%质量）

### 2. 权限验证
```typescript
// hooks/usePermission.ts
export function useReimbursementPermission(ledgerId: string) {
  const { data: member } = trpc.getLedgerMember.useQuery({ ledgerId });
  
  return {
    canManageReimbursement: member?.role === 'admin' || member?.role === 'owner',
    canSetAdmin: member?.role === 'owner',
    isOwner: member?.role === 'owner',
  };
}
```

### 3. 报销标签组件
```typescript
// components/ReimbursementBadge.tsx
interface Props {
  status: 'none' | 'pending' | 'completed';
  onClick?: () => void;
  canManage: boolean;
}

export function ReimbursementBadge({ status, onClick, canManage }: Props) {
  const badges = {
    none: { text: '无需报销', color: 'bg-gray-500' },
    pending: { text: '💰待报销', color: 'bg-orange-500' },
    completed: { text: '✅已报销', color: 'bg-green-500' },
  };
  
  const badge = badges[status];
  
  return (
    <span 
      className={`${badge.color} text-white px-2 py-1 rounded text-xs ${canManage ? 'cursor-pointer' : ''}`}
      onClick={canManage ? onClick : undefined}
    >
      {badge.text}
    </span>
  );
}
```

---

## 📝 待确认问题

1. ✅ 报销凭证图片存储位置：`reimbursement-vouchers/` 文件夹
2. ✅ 普通成员能否查看报销历史：可以
3. ✅ 是否支持部分报销：预留字段，暂不实现
4. ✅ 报销状态能否从"已报销"改回"待报销"：可以（管理员权限）

---

**设计完成时间**：2026-02-13
