# 牙班功能改动记录（待提交）

> 本文件记录所有已在本地完成、尚未推送到 GitHub 的改动。
> 最后一次性提交时，以此文件为 commit message 的依据。
> **每次新增改动请追加到对应章节末尾。**

---

## 一、诊所排班页面重构（YabanClinicShift.tsx）

### 1.1 排班抽屉（SchDrawer）整体重构

**改动文件**：`client/src/pages/yaban/YabanClinicShift.tsx`

#### State 重构

- 废弃原来的共用 `workStart / workEnd / breakStart / breakEnd / selDows` 状态
- 新增 `daySettings: Record<number, DaySetting>`：每天（0=周一…6=周日）独立存储时间段
  - `DaySetting = { workStart, workEnd, breakStart, breakEnd, isRest }`
- 新增 `activeDow: number | null`：当前选中查看的天（null = 未选）
- `selDows` 改为从 `daySettings` 派生（`isRest=false` 的天）
- 新增 `curDay`：当前天设置的快捷访问
- 新增 `setCurDay(patch)`：更新当前天设置的便捷方法

#### 从后端加载逻辑

- `getDaySegs` 查询结果按 dow 逐天映射到 `daySettings`
- 加载后自动选中第一个上班天（`activeDow = firstActive.dow`）

#### 星期格子 UI（三态视觉反馈）

| 状态 | 格子背景 | 格子边框 | 格子内容 |
|------|---------|---------|---------|
| 未配置（isRest=true，未点击过） | 浅灰 `#F0F4F8` | 灰色 `LINE` | 「点击设置」提示文字 |
| 已配置（isRest=false，非当前选中） | 浅蓝 `#EBF5FF` | 蓝色 `#90CAF9` | 显示时段，如 `09:00 — 18:00` |
| 当前选中（activeDow === i） | 深蓝 `SKY_D` | 深蓝 `SKY_D` | 显示时段（白色文字） |

- 格子高度：未配置时 60px，已配置时 72px（容纳时段文字）
- 周末格子（周六/日）固定宽 52px，溢出到右侧需滑动查看
- 工作日格子平分屏幕宽度：`calc((100vw - 56px) / 5)`

#### 点击格子交互逻辑

```
点击格子 d：
  setActiveDow(d)  // 切换到该天，下方显示该天时间设置
  if daySettings[d].isRest:
    自动设为上班（isRest = false）
```

- 首次点击未配置格子 → 自动设为上班，下方出现时间选择区
- 点击已配置格子 → 切换到该天，下方显示该天已有设置
- 右上角「设为休息 / 设为上班」按钮可手动切换状态

#### 时间设置区（下方联动）

- `activeDow === null`：显示「点击上方星期格子设置该天时间」提示
- `activeDow !== null`：
  - 标题：「周X 时间设置」+ 右侧「设为休息 / 设为上班」切换
  - 该天为休息日：显示灰色提示框「休息日 · 点击"设为上班"开启该天」
  - 该天为上班日：显示上班时间 + 午休时间（可移除/添加）
  - 时间框实时联动：修改后立即更新 `daySettings[activeDow]`，格子内时段同步刷新

#### 保存逻辑

- 保存按钮遍历 `daySettings` 所有 7 天，调用 `onSaveDaySegs`
- `isTimeErr` 只在当前选中天（`curDay`）存在时才校验

---

### 1.2 其他排班页面改动

#### 时间框（TimeBox）样式

- 大号数字 + AM/PM 显示
- 字体 `system-ui,-apple-system,sans-serif`，`font-weight: 900`

#### 清空排班功能

- 新增「清空排班」按钮，弹出确认框，输入结束日期后调用 `clearOverrides` 接口
- 接口：`trpc.yabanShift.clearOverrides`，参数：`{ staffUserId, fromDate, toDate }`

#### 保存周模板按钮位置

- 位于「其他个性设置」折叠区上方

#### 其他个性设置折叠区

- 包含颜色选择器（色相滑块 + 最近使用颜色）
- 默认折叠，点击展开

---

## 二、后端新增接口（yaban-appointment-router.ts）

**改动文件**：`server/yaban-appointment-router.ts`

### 2.1 `yabanShiftRouter.getDaySegs`

- **类型**：query
- **功能**：获取某员工的按天时段模板（周一~周日各自的时段）
- **参数**：`{ staffUserId: number, tenantId?: number }`
- **返回**：7 条记录数组，每条含 `{ dow, workStart, workEnd, breakStart, breakEnd, overtimeStart, overtimeEnd, isRest }`
- **数据表**：`yaban_shift_day_segs`（按 `tenant_id + staff_user_id + dow` 唯一）

### 2.2 `yabanShiftRouter.saveDaySegs`

- **类型**：mutation
- **功能**：批量 upsert 某员工的按天时段模板（一次传 7 天）
- **参数**：`{ staffUserId, tenantId?, days: DaySegInput[] }`
- **副作用**：同步更新 `yaban_shift_template` 表的 `workDays`（兼容旧逻辑）

### 2.3 `yabanShiftRouter.clearOverrides`

- **类型**：mutation
- **功能**：清空某员工从指定日期到结束日期的所有单日覆盖记录
- **参数**：`{ staffUserId, tenantId?, fromDate: string, toDate: string }`
- **数据表**：`yaban_shift_override`

---

## 三、数据库变更（已手动执行）

### 3.1 新增表 `yaban_shift_day_segs`

```sql
CREATE TABLE yaban_shift_day_segs (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tenant_id     INT NOT NULL,
  staff_user_id INT NOT NULL,
  dow           TINYINT NOT NULL COMMENT '0=周一,1=周二,...,6=周日',
  work_start    VARCHAR(8) NOT NULL DEFAULT '09:00',
  work_end      VARCHAR(8) NOT NULL DEFAULT '18:00',
  break_start   VARCHAR(8) NULL,
  break_end     VARCHAR(8) NULL,
  overtime_start VARCHAR(8) NULL,
  overtime_end   VARCHAR(8) NULL,
  is_rest       TINYINT(1) NOT NULL DEFAULT 0,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_tenant_staff_dow (tenant_id, staff_user_id, dow)
);
```

### 3.2 扩展 `yaban_comm_record.record_type` 枚举

- 在原有枚举值基础上新增 `system` 值，用于系统自动写入的沟通记录（如预约联动）

---

## 四、已在上一次提交中上线的功能（参考）

> commit: `c4b976eff` — feat: 邀请二维码按钮、顾客头像修复、预约联动沟通记录

- **邀请二维码**：`YabanProfile.tsx` 右上角加方形圆角二维码按钮，点击弹出专属邀请二维码弹窗
- **顾客头像修复**：`YabanPatientDetail.tsx` 头像区域去掉蓝色渐变背景，改为圆形无留白
- **预约→沟通联动**：`yaban-appointment-router.ts` 新建预约时自动在顾客沟通动态插入系统记录（`biz_type=appointment`），支持按姓名自动匹配 `patientId`
- **历史数据补录**：何素珍的历史预约已手动补写沟通记录

---

## 五、本轮新增改动（排班抽屉深度优化）

### 5.1 格子样式：方案4（AM/PM 左右两列）

- 格子内容改为左右两列：左列 AM（上午开始—结束），右列 PM（下午开始—结束），中间竖线分隔
- 「周X」标题始终 15px 加粗，格子高度 100px
- 格子间距从 6px 缩小到 3px，格子宽度相应增大
- AM/PM 两列各自向外留 padding，文字不贴竖线
- 内容区固定高度 56px，`overflow: hidden` 防溢出

### 5.2 时间段改为「上午 + 下午」两行

- 废弃「上班时间 + 午休时间」的概念
- 改为两行时间框：上午（06:00–13:00）和下午（11:00–18:00）
- 下午开始时间的 `min` 动态跟随上午结束时间，防止时间倒序
- 校验逻辑：`上午开始 < 上午结束 ≤ 下午开始 < 下午结束`
- 去掉「上午」「下午」标签文字，AM/PM 本身已区分

### 5.3 格子三态视觉（重新定义）

| 状态 | 触发条件 | 格子显示 | 高度 |
|------|---------|---------|------|
| 待设置 | 初始 / 未点击 | 「待设置」灰色文字 | 72px |
| 已设时间（work） | 拨动时间后 | AM/PM 两列时间 | 100px |
| 休息日（rest） | 点「休息日」按钮 | 「休息日」文字，灰蓝底色 | 100px |

### 5.4 点击格子交互逻辑（简化）

- 点击「待设置」格子 → 直接进入上班状态（`status: 'work'`），下方立即显示时间框
- 如果前面已有设好时间的工作日，自动复制其时间作为默认值
- 右上角「休息日」按钮：点击切换为休息状态
- 右上角「上班」按钮（休息状态时显示）：点击恢复上班+时间框

### 5.5 保存按钮两态

- **无已保存数据**：蓝色「保存为长期周模板」
- **有已保存工作日**：灰色「编辑长期模板」（只读模式，格子不可点）
  - 点击「编辑长期模板」→ 进入编辑模式，格子可点，按钮变回「保存为长期周模板」
  - 保存成功后自动退回只读模式

### 5.6 个性设置区统一行式布局

- 每项统一：左侧 52px 灰色小标签 + 右侧 flex:1 主内容区
- 节假日处理：两个等宽胶囊按钮（「节假日自动休息」/「节假日仍然排班」）
- 营业时间：与节假日同款样式，圆角容器内竖线分隔左右时间框
- 个性设置默认只读，点「编辑个性设置」进入编辑模式，统一「保存个性设置」一次保存
- 保存只弹一条 toast，不重复提示

### 5.7 数据加载修复

- `useEffect` 加载后端数据时：只加载 `isRest=false` 的工作日记录，其余保持 `pending`
- `selDows`（共 X 天工作日）只计算 `status=work` 的天
- 保存时 `pending` 和 `rest` 都作为休息日存入后端

---

## 六、待确认 / 后续计划

- [x] 排班格子视觉反馈效果确认
- [x] 时间段改为上午/下午两行
- [x] 个性设置行式布局统一
- [x] 保存按钮两态（只读/编辑）
- [ ] 后续如有新改动，继续追加到本文件对应章节
- [ ] 推送后删除或归档本文件

---

*最后更新：2026-07-03*
