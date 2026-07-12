# ETH 期权监控工具 TODO

## 核心恢复任务
- [x] 覆盖 drizzle/schema.ts（添加 buy_records 表）
- [x] 覆盖 server/db.ts（添加持仓记录 CRUD）
- [x] 覆盖 server/routers.ts（添加 records 路由）
- [x] 覆盖 server/_core/index.ts（添加 CSP frame-ancestors）
- [x] 覆盖 server/_core/oauth.ts（添加 SSO external-login 端点）
- [x] 覆盖 client/index.html（Nunito 字体 + 标题）
- [x] 覆盖 client/src/index.css（品牌色变量 + 动画）
- [x] 覆盖 client/src/App.tsx（所有路由注册）
- [x] 覆盖 shared/const.ts
- [x] 覆盖 shared/types.ts
- [x] 恢复 client/src/pages/ProductDesign.tsx
- [x] 恢复 client/src/pages/Home.tsx（旧版期权监控）
- [x] 恢复 client/src/pages/HistoryAnalysis.tsx
- [x] 恢复 client/src/pages/AnnualizedChain.tsx
- [x] 恢复 client/src/pages/IVSmile.tsx
- [x] 恢复 client/src/pages/SsoLogin.tsx
- [x] 执行数据库迁移（buy_records 表）
- [x] 运行测试通过（9/9）
- [x] 保存 Checkpoint
