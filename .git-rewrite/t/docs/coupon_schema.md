# 卡券功能数据库设计

## 表结构设计

### 1. coupons（卡券表）
存储卡券的基本信息

| 字段名 | 类型 | 说明 | 约束 |
|--------|------|------|------|
| id | varchar(36) | 卡券ID | 主键 |
| creator_id | varchar(36) | 创建者用户ID | 外键 → users.id |
| title | varchar(200) | 卡券标题 | 非空 |
| description | text | 卡券描述 | 可空 |
| template_type | varchar(50) | 模板类型（占位符） | 默认 'default' |
| template_data | json | 模板数据（占位符） | 可空 |
| valid_from | datetime | 有效期开始时间 | 非空 |
| valid_until | datetime | 有效期结束时间 | 非空 |
| created_at | datetime | 创建时间 | 自动生成 |
| updated_at | datetime | 更新时间 | 自动更新 |

### 2. coupon_recipients（卡券接收记录表）
记录卡券发送给哪些用户

| 字段名 | 类型 | 说明 | 约束 |
|--------|------|------|------|
| id | varchar(36) | 记录ID | 主键 |
| coupon_id | varchar(36) | 卡券ID | 外键 → coupons.id |
| recipient_id | varchar(36) | 接收者用户ID | 外键 → users.id |
| status | enum | 状态：unused/used | 默认 'unused' |
| received_at | datetime | 接收时间 | 自动生成 |

索引：
- `idx_coupon_id` (coupon_id)
- `idx_recipient_id` (recipient_id)
- `idx_status` (status)

### 3. coupon_usage（卡券使用/核销记录表）
记录卡券的使用情况

| 字段名 | 类型 | 说明 | 约束 |
|--------|------|------|------|
| id | varchar(36) | 记录ID | 主键 |
| recipient_record_id | varchar(36) | 接收记录ID | 外键 → coupon_recipients.id |
| coupon_id | varchar(36) | 卡券ID | 外键 → coupons.id |
| user_id | varchar(36) | 使用者用户ID | 外键 → users.id |
| used_at | datetime | 使用时间 | 自动生成 |
| notes | text | 使用备注 | 可空 |

索引：
- `idx_coupon_id` (coupon_id)
- `idx_user_id` (user_id)

## 权限控制逻辑

### 发送卡券权限
- 用户A只能发送卡券给**已被A共享人脉**的用户
- 查询条件：`contact_shares` 表中 `sharer_id = A` 的所有 `shared_with_id`

### 接收卡券权限
- 用户B只能接收**已共享人脉给B**的用户发来的卡券
- 查询条件：`contact_shares` 表中 `shared_with_id = B` 的所有 `sharer_id`

## API接口设计

### 1. 获取我收到的卡券
- `GET /api/coupons/received`
- 返回：卡券列表（包含发送者信息、使用状态）

### 2. 获取我发出的卡券
- `GET /api/coupons/sent`
- 返回：卡券列表（包含接收人数、已使用人数）

### 3. 创建卡券
- `POST /api/coupons/create`
- 参数：
  - title: 标题
  - description: 描述
  - valid_from: 有效期开始
  - valid_until: 有效期结束
  - recipient_ids: 接收者ID数组（'all' 或具体ID列表）

### 4. 获取可发送的用户列表
- `GET /api/coupons/available-recipients`
- 返回：已共享人脉的用户列表

### 5. 使用/核销卡券
- `POST /api/coupons/:id/use`
- 参数：
  - notes: 使用备注（可选）

### 6. 获取卡券详情
- `GET /api/coupons/:id`
- 返回：卡券详情（包含使用记录）

### 7. 获取卡券核销记录
- `GET /api/coupons/:id/usage`
- 返回：核销记录列表（仅发送者可见）
