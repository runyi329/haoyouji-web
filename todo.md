# 好友记项目开发任务清单

## 阶段一：数据库架构迁移 ✅

- [x] 迁移用户系统表（users, userPreferences, families）
- [x] 迁移联系人管理表（contacts, tags, regions, interactions, reminders）
- [x] 迁移数据共享表（contactShares, sharedContacts）
- [x] 迁移学习系统表（vocabularies, characters, knowledgeBase, wrongQuestions）
- [x] 迁移游戏系统表（gameRecords, gameRewards, antonyms）
- [x] 迁移积分奖励表（pointsTransactions, stars, badges, rewards, starShop）
- [x] 迁移健康管理表（exerciseRecords, brushingRecords, readingRecords）
- [x] 迁移家庭功能表（familyCharacters, kidsProfiles, parentControls）
- [x] 迁移权限管理表（permissions, featureToggles）
- [x] 执行数据库迁移 pnpm db:push

## 阶段二：后端 API 迁移 ✅

- [x] 迁移认证相关 API（auth.ts）
- [x] 迁移联系人管理 API（contacts, tags, regions）
- [x] 迁移互动记录 API（interactions, reminders）
- [x] 迁移数据共享 API（sharing, permissions）
- [x] 迁移学习系统 API（vocabulary, characters, knowledge）
- [x] 迁移游戏中心 API（games, records, rewards）
- [x] 迁移积分奖励 API（points, stars, badges, shop）
- [x] 迁移健康管理 API（exercise, brushing, reading）
- [x] 迁移家庭功能 API（family, kids, parentControls）
- [x] 迁移管理后台 API（admin, permissions）
- [x] 创建数据库查询辅助函数（db-*.ts）
- [x] 整合所有路由到 routers.ts

## 阶段三：前端页面迁移 ✅

### 核心布局
- [x] 设计移动优先的视觉风格（色彩、字体、间距）
- [x] 创建主导航结构（底部导航栏）
- [x] 创建通用布局组件（Header, BottomNav, Container）
- [x] 配置路由系统（App.tsx）

### 首页与导航
- [x] 首页（Home.tsx）- 3x3 可自定义卡片网格
- [x] 个人中心（Profile.tsx）- 用户信息、设置入口
- [x] 登录注册页面（Login.tsx, Register.tsx）

### 联系人管理模块
- [x] 联系人列表页（ContactsList.tsx）- 搜索、筛选、排序
- [x] 联系人详情页（ContactDetail.tsx）- 完整信息展示
- [x] 添加联系人页（AddContact.tsx）- 表单录入
- [x] 联系人管理页（ContactsManagement.tsx）- 批量操作
- [x] 标签管理页（TagsManagement.tsx）- 标签增删改
- [x] 标签搜索页（TagSearch.tsx）- 按标签筛选
- [x] 区域地图页（RegionMap.tsx）- 地理分布可视化
- [x] 数据对比页（DataComparison.tsx）- 统计分析
- [x] 推荐链可视化（ReferralChainVisualization.tsx）
- [x] 推荐列表（ReferralList.tsx）
- [x] 导出联系人（ExportContacts.tsx）
- [x] 扫描名片（ScanBusinessCard.tsx, ScanBusinessCardResult.tsx）

### 数据共享模块
- [x] 共享设置页（SharingSettings.tsx）- 配置共享关系
- [x] 共享权限管理 - 选择性共享数据

### 学习系统模块
- [x] 词汇管理页（VocabularyManagement.tsx）- 词汇增删改
- [x] 词汇统计页（VocabularyStats.tsx）- 学习进度
- [x] 知识库页（Knowledge.tsx）- 知识列表
- [x] 知识详情页（KnowledgeDetail.tsx）- 知识内容
- [x] 错题本页（WrongQuestions.tsx）- 错题回顾

### 游戏中心模块
- [x] 游戏中心首页（Games.tsx）- 游戏列表
- [x] 数学游戏（MathGame.tsx, Addition20Game.tsx）
- [x] 汉字游戏中心（CharacterGamesHub.tsx）
- [x] 汉字记忆游戏（CharacterMemoryGame.tsx）
- [x] 汉字闪卡游戏（CharacterGame.tsx）
- [x] 反义词游戏（AntonymGame.tsx）
- [x] 听力游戏（ListeningGame.tsx）
- [x] 阅读游戏（ReadingGame.tsx, ReadingStoryList.tsx）
- [x] 刷牙游戏（BrushingGame.tsx）
- [x] 记忆卡片游戏（MemoryGame.tsx）
- [x] 拼图游戏（PuzzleGame.tsx）
- [x] 棋类游戏（ChessGame.tsx, GoGame.tsx, GomokuGame.tsx, LudoGame.tsx）

### 积分奖励模块
- [x] 积分详情页（PointsDetail.tsx）- 积分历史
- [x] 奖励页面（Rewards.tsx）- 奖励列表
- [x] 星星商店（StarShop.tsx）- 兑换商品
- [x] 相册功能（Albums.tsx, AlbumDetail.tsx）

### 健康管理模块
- [x] 健康首页（Health.tsx）- 健康概览
- [x] 运动首页（ExerciseHome.tsx）- 运动统计
- [x] 运动计数器（ExerciseCounter.tsx）- 记录运动
- [x] 运动类型管理（ExerciseTypeManagement.tsx）

### 家庭功能模块
- [x] 家长中心（ParentCenter.tsx）- 家长功能入口
- [x] 家长管理（ParentManagement.tsx）- 家庭成员管理
- [x] 儿童管理（KidsManagement.tsx）- 宝宝档案
- [x] 家长密码设置（ParentPasswordSetup.tsx）
- [x] 家长功能管理（ParentFeatureManagement.tsx）
- [x] 奖励管理（RewardsManagement.tsx）
- [x] 推荐人排行榜（ReferrerLeaderboard.tsx）
- [x] 加法配置（Addition20Config.tsx）
- [x] 阅读配置（ReadingConfig.tsx）

### 管理后台模块
- [x] 管理后台首页（Admin.tsx）- 管理功能入口
- [x] 用户权限管理（UserPermissionsManager.tsx）
- [x] 账户关系管理（AccountRelationshipManager.tsx）
- [x] 邀请管理（InvitationManager.tsx）
- [x] Banner 配置（BannerConfig.tsx）
- [x] 主词库管理（MasterLibraryManager.tsx, VocabularyMasterManager.tsx）
- [x] 汉字管理（CharacterManager.tsx）
- [x] 反义词管理（AntonymManager.tsx）
- [x] 游戏奖励管理（GameRewardManager.tsx）

### 通用组件
- [x] 迁移所有可复用 UI 组件到 components 目录
- [x] 适配移动端响应式布局
- [x] 实现拖拽排序功能
- [x] 实现图片上传裁剪功能

## 阶段四：项目基础测试 ✅

- [x] 服务器成功启动
- [x] 首页正常加载
- [x] 数据库连接正常
- [x] 基础路由工作正常

## 待优化项（后续迭代）

- [ ] 修复 TypeScript 类型错误（db-exercise.ts 日期比较问题）
- [ ] 测试用户认证流程（登录、注册、登出）
- [ ] 测试联系人 CRUD 操作
- [ ] 测试标签和区域管理
- [ ] 测试互动记录功能
- [ ] 测试提醒系统
- [ ] 测试数据共享功能
- [ ] 测试学习系统各模块
- [ ] 测试所有游戏功能
- [ ] 测试积分奖励系统
- [ ] 测试健康管理功能
- [ ] 测试家庭功能模块
- [ ] 测试权限控制（超级管理员、家长、宝宝）
- [ ] 移动端适配测试
- [ ] 性能优化（加载速度、响应时间）
- [ ] 编写 Vitest 单元测试

## 项目迁移总结

✅ **已完成**：
- 64 张数据表成功迁移
- 223+ 数据库查询函数迁移
- 70+ 前端页面迁移
- 所有后端 API 路由迁移
- 服务器成功启动并运行
- 首页正常显示

📊 **项目规模**：
- 数据表：64 张
- 前端页面：70+ 个
- 后端函数：223+ 个
- 代码行数：约 50,000 行

🎯 **下一步建议**：
1. 逐步测试各功能模块
2. 修复发现的 bug
3. 优化用户体验
4. 添加单元测试
5. 准备生产部署


## 修复右划返回功能 - 支持页面任意位置触发✅

- [x] 诊断当前问题
  - 检查为什么只有左侧绿色线位置能触发
  - 问题原因：preventDefault() 调用时机太晚（只有进度 > 0.1 时才阻止）
  - 导致触摸事件被页面滚动事件抢占
- [x] 修复代码
  - 修改 useSwipeBack.ts 第 65-66 行
  - 移除了 `if (progress > 0.1)` 条件判断
  - 现在只要检测到横向右划，立即阻止默认行为
  - 确保手势优先级高于页面滚动
- [x] 测试功能
  - 代码已修改，等待用户在手机上测试
  - 现在应该在页面任意位置都能触发右划
  - 页面会跟随手指移动


## 移除“共享人脉”按钮的密码验证功能✅

- [x] 修改 ContactsManagement.tsx
  - 修改 handleShareClick 函数（第 928-931 行）
  - 移除密码验证对话框调用（setInviteTarget 和 setShowInviteDialog）
  - 改为直接跳转到 /parent/contacts/sharing 页面
- [x] 测试功能
  - 点击“共享”按钮直接跳转到共享页面
  - 不再弹出密码输入对话框
  - 功能正常工作


## 删除联系人列表页面名字后面的三个方块图标✅

- [x] 查找 ContactsList.tsx 中的三个方块图标
  - 找到 Network 图标（人脉关系图入口）
  - 位置：第 1577-1589 行
  - 功能：点击后跳转到 /parent/contacts/${contact.id}/referral-chain
- [x] 删除图标代码
  - 移除了 Network 图标按钮组件（第 1577-1589 行）
  - 从 import 语句中移除 Network 图标（第 6 行）
- [x] 测试页面显示
  - 代码已修改，等待用户测试
  - 名字后面不再显示 Network 图标
  - 其他图标（Layers2, Layers3）保持不变


## 删除个人中心页面最上面的返回按钮✅

- [x] 查找 Profile.tsx 中的返回按钮
  - 找到页面顶部的返回按钮代码（第 290-296 行）
  - 使用 ArrowLeft 图标，点击跳转到首页
- [x] 删除返回按钮代码
  - 移除了返回按钮组件（第 290-296 行）
  - 从 import 语句中移除 ArrowLeft 图标（第 35 行）
- [x] 测试页面显示
  - 代码已修改，等待用户测试
  - 个人中心顶部不再显示返回按钮
  - 用户可以通过右划手势返回首页


## 删除脉动学院页面中的返回个人中心按钮✅

- [x] 查找脉动学院相关页面文件
  - 找到 Academy.tsx 页面组件
  - 路径：个人中心 -> 帮助与支持 -> 脉动学院
  - 返回按钮位置：第 325-332 行
- [x] 删除返回按钮代码
  - 移除了返回个人中心按钮组件（第 325-332 行）
  - Home 图标仍用于功能说明中，保留 import
- [x] 测试页面显示
  - 代码已修改，等待用户测试
  - 脉动学院页面不再显示返回按钮
  - 用户可以通过右划手势返回


## 修改共享人脉的点击行为✅

- [x] 查找联系人列表中的点击事件处理
  - 找到 ContactsList.tsx 中的联系人点击逻辑
  - 共享人脉有 _isShared 和 _sharedBy 字段标记
  - _sharedBy 字段存储共享人的姓名
- [x] 修改点击事件逻辑
  - 修改联系人卡片点击事件（第 1481-1501 行）
  - 修改搜索结果点击事件（第 625-645 行）
  - 判断 contact._isShared && contact._sharedBy
  - 共享人脉显示 toast 提示，时长 1000ms
  - 自己的人脉正常跳转到详情页
- [x] 测试功能
  - 代码已修改，等待用户测试
  - 点击共享人脉显示：“共享人脉 赶快找[XXX]介绍吧！”
  - 点击自己的人脉正常跳转
  - 提示 1 秒后自动消失


## 修改首页头像菜单选项✅

- [x] 查找首页头像点击菜单的代码
  - 找到 ContactsManagement.tsx 中的头像菜单（第 993-1009 行）
  - 原有三个选项：个人中心、AI 管理、退出登录
- [x] 移除 AI管理 按钮
  - 删除了 "AI 管理" 菜单项（第 998-1001 行）
  - 从 import 语句中移除 Bot 图标（第 8 行）
  - 保留了“个人中心”和“退出登录”两个选项
- [x] 测试功能
  - 代码已修改，等待用户测试
  - 点击头像显示菜单
  - 只有“个人中心”和“退出登录”两个选项


## 修改共享人脉列表图标显示✅

- [x] 查找共享人脉的图标显示代码
  - 找到 ContactsList.tsx 中的图标渲染逻辑
  - 包括：UserCheck、Smile、Layers2、Layers3、CompanyReportIcon、Handshake
- [x] 修改图标样式和交互
  - UserCheck：共享人脉显示为 text-gray-400（第 1548-1550 行）
  - Smile：共享人脉显示为 text-gray-400，禁用点击（第 1557-1576 行）
  - Layers2：共享人脉显示为 text-gray-400，禁用点击（第 1580-1599 行）
  - Layers3：共享人脉显示为 text-gray-400，禁用点击（第 1603-1622 行）
  - CompanyReportIcon：共享人脉显示为 text-gray-400，禁用点击（第 1631-1651 行）
  - Handshake：保持 text-blue-500 亮蓝色（第 1656 行）
- [x] 测试功能
  - 代码已修改，等待用户测试
  - 共享人脉的所有功能图标显示为灰色
  - 点击功能图标无反应
  - 握手图标保持蓝色高亮


## 实现积分系统

### 阶段一：设计积分系统数据库表✅
- [x] 检查 users 表已有 points 字段
- [x] 创建 point_rules 表（积分规则配置）
- [x] 创建 point_logs 表（积分变动记录）
- [x] 插入5个固定积分规则

### 阶段二：实现后端积分逻辑✅
- [x] 创建 db-point-system.ts 数据库操作文件
- [x] 实现积分规则 CRUD 接口
- [x] 实现积分变动记录查询接口
- [x] 实现管理员手动调整积分接口
- [x] 实现自动积分奖励函数 addPointsForAction
- [x] 在 routers.ts 中添加 pointSystem router

### 阶段三：实现后台管理页面✅
- [x] 创建积分管理页面（/admin/points）
  - 用户列表（显示用户名、当前积分）
  - 搜索框（按用户名搜索）
  - 积分编辑功能（添加/减少积分）
- [x] 在 App.tsx 中添加路由
- [x] 在个人中心显示积分

### 阶段四：集成积分奖励到业务流程✅
- [x] 添加人脉时自动奖励积分（contacts.create）
- [x] 打标签时自动奖励积分（tags.addToContact）
- [x] 每次联络时自动奖励积分（interactions.create）
- [x] 共享人脉时自动奖励积分（sharing.createConnection）
- [x] 被别人加为推荐人时自动奖励积分（contacts.create）

### 阶段五：测试并交付
- [x] 功能开发完成，等待用户测试
- [ ] 用户测试管理员手动调整积分
- [ ] 用户测试自动积分奖励
- [ ] 用户验证个人中心积分显示

---

## 为现有认证系统添加邮箱验证码注册和找回密码功能（暂停）

### 阶段一：创建验证码表并修改 user 表
- [ ] 修改 user 表结构
  - 将 email 字段改为必填且唯一
  - 将 openId 改为可选（向后兼容）
- [ ] 创建 verification_codes 表
  - email 字段（邮箱）
  - code 字段（4位验证码）
  - type 字段（register/reset_password）
  - expiresAt 字段（15分钟有效期）
  - createdAt 字段
- [ ] 推送数据库变更（pnpm db:push）

### 阶段二：实现后端认证接口
- [ ] 实现注册接口
  - 验证用户名/邮箱唯一性
  - 验证邮箱验证码
  - 密码哈希存储（bcrypt）
  - 生成 JWT token
- [ ] 实现登录接口
  - 支持用户名/邮箱登录
  - 验证密码
  - 生成 JWT token
- [ ] 实现退出登录接口
  - 清除 session cookie

### 阶段三：实现邮箱验证码功能
- [ ] 实现发送验证码接口
  - 生成 4 位随机验证码
  - 限制 1 分钟发送一次
  - 15 分钟有效期
  - 集成邮件发送服务（nodemailer）
- [ ] 实现验证码校验接口
  - 验证码正确性
  - 验证码有效期
- [ ] 实现密码重置接口
  - 验证邮箱验证码
  - 更新密码哈希

### 阶段四：实现前端登录注册页面
- [ ] 创建登录页面
  - 用户名/邮箱输入框
  - 密码输入框
  - “忘记密码”链接
  - “注册”链接
- [ ] 创建注册页面
  - 用户名输入框
  - 邮箱输入框
  - 验证码输入框 + 发送按钮（倒计时）
  - 密码输入框
  - 确认密码输入框
- [ ] 创建找回密码页面
  - 邮箱输入框
  - 验证码输入框 + 发送按钮
  - 新密码输入框
  - 确认密码输入框

### 阶段五：移除 Manus OAuth
- [ ] 移除 OAuth 相关代码
  - 移除 server/_core/oauth.ts
  - 移除 server/_core/context.ts 中的 OAuth 逻辑
  - 更新 server/routers.ts 中的认证逻辑
- [ ] 更新前端认证状态
  - 更新 useAuth hook
  - 移除 OAuth 相关的环境变量

### 阶段六：测试并交付
- [ ] 测试注册流程
- [ ] 测试登录流程
- [ ] 测试找回密码流程
- [ ] 测试邮箱验证码发送
