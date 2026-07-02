# 待推送改动日志

> 每次改动在此登记，积累约10步后统一推送。

---

## 第1步：AI智能路由移至配置最顶部
**文件：** `client/src/components/channel/ChannelConfigTab.tsx`
将"AI 智能路由"block 从"AI 对话"table 下方移到整个配置区域最顶部（return 第一个元素）。如需还原，把顶部的 AI智能路由 block 剪切到"会话上下文轮数"block 之前。

## 第2步：修复正确文件（WecomAdmin.tsx）
**文件：** `client/src/pages/admin/WecomAdmin.tsx`
确认渠道配置页实际渲染在 WecomAdmin.tsx 中，在该文件的 AiDialogSection 组件里完成后续所有改动。

## 第3步：给配置区域加左右边距
**文件：** `client/src/pages/admin/WecomAdmin.tsx`
`pb-8` → `pb-8 px-4`，所有子 Tab 卡片左右各加 16px 边距。

## 第4步：渠道选择改为新页面模式（第一版：下拉）
**文件：** `client/src/pages/admin/WecomAdmin.tsx`
移除横向滚动 channelSelector，将渠道切换整合到蓝色统计卡片点击展开下拉列表。

## 第5步：渠道选择改为新页面模式（最终版）
**文件：** `client/src/pages/admin/WecomAdmin.tsx`
移除蓝色统计卡片（statsBar）。在 ChannelConfigTab 配置区域最顶部加"AI 对话渠道"入口块（普通白色卡片，右箭头），点击进入"选择渠道"新页面（有返回按钮，列出所有渠道，当前选中高亮），选择后返回配置页。给 ChannelConfigTab 新增 `onSelectChannel` prop。

---
**当前未推送：5步**（步骤1~5）

## 第6步：AI对话渠道改为 Tab 导航项
**文件：** `client/src/pages/admin/WecomAdmin.tsx`
将"AI 对话渠道"入口从配置 Tab 内的白色卡片块改为 subTabNav 导航栏里的"渠道"Tab 项（仅在渠道数>1时显示），点击直接进入渠道列表页。同时移除配置 Tab 顶部的 AI对话渠道入口块和 channelSelector 引用。

---
**当前未推送：6步**（步骤1~6）

## 第7步：Tab导航和第一个卡片之间加间距
**文件：** `client/src/pages/admin/WecomAdmin.tsx`
`pb-8 px-4` → `pb-8 px-4 pt-4`，Tab 导航栏和第一个配置卡片之间加 16px 上边距。

---
**当前未推送：7步**（步骤1~7）

## 第8步：每个配置块加独立保存按钮，删底部统一保存按钮
**文件：** `client/src/pages/admin/WecomAdmin.tsx`
- 欢迎语"完成"→"保存"，点击调 handleSave()
- 等待提示语"完成"→"保存"，点击调 handleSave()
- AI智能路由 block 底部加"保存"按钮（调 handleSave()）
- 会话上下文轮数 block 底部加"保存"按钮（调 handleSave()）
- 删除底部统一"保存配置"大按钮

---
**当前未推送：8步**（步骤1~8）

## 第9步：渠道开关移至 Tab 导航栏右侧，后端真正生效
**文件：** `client/src/pages/admin/WecomAdmin.tsx`、`server/wecom-manus-router.ts`

前端：在 `ChannelDetail` 组件的 Tab 导航栏右侧加渠道启用/停用开关（绿色滑动按钮），点击调 PUT `/api/wecom/channels/:id`，立即生效。同时删除 `ChannelConfigTab` 里原来的"渠道状态"block。

后端：`handleKfMsgOrEvent` 查询渠道时同时取 `is_enabled` 字段，若为0则直接 return，不处理该渠道的任何消息。

---
**当前未推送：9步**（步骤1~9）⚠️ 再1步提醒推送

## 第9步补充：开关移至正确位置（AiDialogSection subTabNav 右侧）
**文件：** `client/src/pages/admin/WecomAdmin.tsx`

发现 A127 渠道走的是 `AiDialogSection` 而非 `ChannelDetail`，在 `AiDialogSection` 里新增 `isEnabled`/`togglingEnabled` state 和 `handleToggleEnabled`，并将开关放在 `subTabNav`（Tab 导航栏）右侧固定位置。

---
**当前未推送：9步**（步骤1~9）⚠️ 建议推送

## 第10步：全局 AI 开关移至绿色 header，白色滑块上写"AI"
**文件：** `client/src/pages/admin/WecomAdmin.tsx`、`server/wecom-manus-router.ts`

- 后端新增 `PUT /api/wecom/global-ai-switch` 接口，批量设置所有渠道的 `is_enabled`
- 前端主组件 `WecomAdmin` 绿色 header 右边加全局 AI 开关（白色圆形滑块上写"AI"字样，开启绿色/关闭灰色）
- 删掉 `AiDialogSection` subTabNav 右边的单渠道开关

---
**当前未推送：10步**（步骤1~10）⚠️ 已达10步，建议立即推送！
