# 银行卡和数字钱包数据库Schema设计

## 1. 银行卡表 (bank_cards)

### 字段设计

| 字段名 | 类型 | 说明 | 加密 | 索引 |
|--------|------|------|------|------|
| id | VARCHAR(36) | 主键UUID | 否 | PRIMARY |
| user_id | VARCHAR(36) | 用户ID | 否 | INDEX |
| card_number | TEXT | 银行卡号 | **是** | 否 |
| card_holder | TEXT | 持卡人姓名 | **是** | 否 |
| bank_name | VARCHAR(100) | 开户行名称 | 否 | 否 |
| card_type | ENUM | 卡类型：debit(借记卡)/credit(信用卡) | 否 | 否 |
| is_default | BOOLEAN | 是否默认卡 | 否 | 否 |
| notes | TEXT | 备注 | 否 | 否 |
| created_at | TIMESTAMP | 创建时间 | 否 | 否 |
| updated_at | TIMESTAMP | 更新时间 | 否 | 否 |

### 约束
- 每个用户只能有一张默认银行卡
- 删除时需要检查是否被其他功能引用

---

## 2. 数字钱包表 (digital_wallets)

### 字段设计

| 字段名 | 类型 | 说明 | 加密 | 索引 |
|--------|------|------|------|------|
| id | VARCHAR(36) | 主键UUID | 否 | PRIMARY |
| user_id | VARCHAR(36) | 用户ID | 否 | INDEX |
| wallet_type | ENUM | 钱包类型：alipay(支付宝)/wechat(微信支付)/dcep(数字人民币)/other(其他) | 否 | 否 |
| account | TEXT | 账号/手机号 | **是** | 否 |
| account_name | TEXT | 账户名 | **是** | 否 |
| is_default | BOOLEAN | 是否默认钱包 | 否 | 否 |
| notes | TEXT | 备注 | 否 | 否 |
| created_at | TIMESTAMP | 创建时间 | 否 | 否 |
| updated_at | TIMESTAMP | 更新时间 | 否 | 否 |

### 约束
- 每个用户只能有一个默认数字钱包
- 删除时需要检查是否被其他功能引用

---

## 3. 使用场景

### 场景1：财务报销
- 用户选择收款银行卡或钱包
- 系统记录报销记录时关联账户ID

### 场景2：账本AA
- 用户选择付款/收款方式
- 记录交易时关联账户信息

### 场景3：积分提现
- 用户选择提现到哪个账户
- 系统处理提现时获取账户信息

### 场景4：接受红包
- 用户选择收款账户
- 系统记录红包领取时关联账户

### 场景5：平台充值
- 用户选择付款方式
- 系统处理充值时获取账户信息

---

## 4. 加密方案

### 加密字段
- `card_number` - 银行卡号
- `card_holder` - 持卡人姓名
- `account` - 钱包账号
- `account_name` - 钱包账户名

### 加密方法
使用项目现有的 `encryptFields` 和 `decryptFields` 函数

### 脱敏显示
- 银行卡号：显示后4位，如 `**** **** **** 1234`
- 手机号：显示前3位和后4位，如 `138****5678`
- 支付宝账号：根据类型（手机号/邮箱）进行相应脱敏

---

## 5. API接口设计

### 银行卡管理
- `POST /api/bank-cards` - 添加银行卡
- `GET /api/bank-cards` - 获取银行卡列表
- `PUT /api/bank-cards/:id` - 更新银行卡
- `DELETE /api/bank-cards/:id` - 删除银行卡
- `PUT /api/bank-cards/:id/set-default` - 设置默认银行卡

### 数字钱包管理
- `POST /api/digital-wallets` - 添加数字钱包
- `GET /api/digital-wallets` - 获取数字钱包列表
- `PUT /api/digital-wallets/:id` - 更新数字钱包
- `DELETE /api/digital-wallets/:id` - 删除数字钱包
- `PUT /api/digital-wallets/:id/set-default` - 设置默认数字钱包

---

## 6. 前端页面设计

### 页面结构
```
基本信息页面
├── Tab 1: 个人信息（现有）
├── Tab 2: 银行卡管理（新增）
└── Tab 3: 数字钱包（新增）
```

### 银行卡管理页面
- 银行卡列表（脱敏显示）
- 添加银行卡按钮
- 每张卡显示：银行名称、卡号后4位、卡类型、默认标记
- 操作：编辑、删除、设为默认

### 数字钱包管理页面
- 钱包列表（脱敏显示）
- 添加钱包按钮
- 每个钱包显示：钱包类型图标、账号脱敏、默认标记
- 操作：编辑、删除、设为默认
