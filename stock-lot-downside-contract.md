# 欠保证金 R1 日期修订服务端契约

## 2026-11-25需求变更与边界

用户明确选择「允许过去日期，并重算该日起的日结和客户收益」。因此只对计入收益派生口径取消旧「固定历史不重算」约束；真实开仓/卖出/partial成交、原单真实PnL、原始quotes/publications/crypto payload、历史FX锁汇及钱包仍不可改。本轮仅独立worktree代码/mock测试，未执行真实DB查询/DDL/DML、生产POST、完整server/routers、commit/push或实盘/钱包操作。未授权生产apply/回填。

## API、版本和日期

`server/ledger-stock-portfolio.ts` 导出 `getStockLotDownsideRule({ledgerId,categoryId,lotId,userId,systemRole?,isViewingAs?})` 与 `setStockLotDownsideRule({...same,enabled,thresholdPrice?,downsidePercent?,expectedVersion,startDate:string})`。startDate严格有效 `YYYY-MM-DD`，北京业务日期零点为effectiveAt，createdAt为实际服务器保存审计时间，不能伪装成过去。父负责router严格参数与UI默认北京今天。owner-only/viewAs拒绝不变。已完全平仓lot仍不接受设置；持有剩余份额的lot允许回溯重新派生先前partial sale。

get配置读取最高已保存version，包含未来待生效修订。CAS也按最新保存version而非active版本。计价 `selectStockLotDownsideRule(rules,lotId,asOf)` 按该时点已生效且真实持有的规则中最高version选择；新回溯revision不被effectiveAt更晚的旧version盖住。新修订日期前仍按当时旧策略。旧row缺startDate继续原effectiveAt；缺表SELECT只读[]；缺新列以旧columns SELECT回退，不读时迁移。

`StockLotDownsideRule.startDate` 在共享type保留optional仅为旧row兼容；新正式API保存必填。新增baselineStatus ready/pending、baselineSource opening/verified_close、holdingStartAt。未来日期保存pending，baselineRaw/Counted在SQL为NULL，不存today伪未来基准；读取时到日期后使用真实前close/开仓重新解析，缺证据维持null/pending。

## 数学与历史基准

逐lot原币种 `F(P)=P>=K?P:K+(P-K)*downsidePercent/100`。原单价格不变，连续计入价 `C(P)=baselineCountedPrice+F(P)-F(baselineRawPrice)`。基准carry只取新启用日以前适用旧规则，并保留其已计入贡献；日期之后按新F差额。不按比例缩放手续费。

历史基准只取用户日期零点之前、对应最近应完成市场session、已核验真实close；若持仓在启用日同天或以后才真实开仓则用真实unitCost，并以holdingStartAt禁止未持有前计收益。迟到补抓可以验证先前真实close，不把capture时间当price适用时间。参考价、today冒充past、未来证据、缺应有session、冲突价均pending；过去保存缺基准明确拒绝并提示更晚日期。raw证据和FX均不UPDATE。

## 共享纯接口（mixed agent复用）

- `latestStockLotDownsideRule(rules,lotId)`：最高保存version，用于配置/CAS。
- `countedStockLotPrice(rawPrice,selectStockLotDownsideRule(rules,lotId,actualAt))`：当前或真实sale时点纯计价。pending返回null。
- `resolveStockLotDownsideHistoricalRules({rules,lots,quotes,now})`：返回独立新rule对象。lots为`{lotId,symbol,openedAt,unitCost}`；quotes为`{symbol,price,priceDate,quoteAsOf,verified}`。调用者负责已核验与ledger/category scope，解析不读DB，不修改raw规则/quotes。
- `stockLotDownsideHistoricalEntryProof(symbol,at,quotes,now)`：解析业务时点前真实close证据；无证据null。
- `stockLotDownsideMemberOffset({lotId,participationId,assignedAt,startDate?,rules,epochs,asOf,entryRawPrice?,entryQuoteAsOf?})`：个人数量/方向不混总盘。个人epoch rawPrice为真实entry证明，旧counted offset在日期修订后按新C(rawEntry)-rawEntry重新派生；允许数据库秒级assignedAt到实际服务器epoch<=120秒范围，不允许错误历史epoch跨日借用。无epoch则必须真实verified entry close/实际opening证明，不把手工entryPrice当quote。缺证据null。
- `stockLotDownsidePriceAsOf(symbol,date)`：A15:00、NY16:00 DST-safe、crypto15:05真实价适用时点，不按补抓时间。

`server/ledger-stock-portfolio.ts`额外导出内部SELECT-only接口：

```ts
readStockLotDownsideCalendarBaseline(
  categoryId: number,
  snapshotDate: string,
  userId?: number,
  readConnection?: any,
  now = new Date()
)
```

返回指定股票日的新修订snapshot或null，供mixed激活前day baseline。总盘复用stock-only engine，无混合递归；成员独立真实quotes/FX/参与closed历史重建，对mutable配置无法核验的旧参与pending。调用者保留权限检查，此非新public路由。mixed agent应将此基准供其独立pure revalue pipeline，不能混旧fixedprior金额；未接入时必须明确missing baseline pending。

## 贯通与保留

stocks buildPortfolio.summary、getStockTagCurrentMarketValue、member.summary/settlementSummary、AI overview、总/member calendars和getStockTagDailySnapshots复用新修订计入口径。日期配置的总日历读取直接SELECT-only重建真实证据结果，不被旧派生缓存fixedtotal或getLatestDailySnapshots遮蔽；保存dirty后台仍只更新独立derived cache，绝不触发历史quote修复。逐日dailyDelta由新total与新prior重建，保持连续。

position/lot真实marketPrice/marketValue/floatingPnl/unitCost和原订单PnL不覆盖。countedMarketValue/Pnl为独立字段；缺价/基准null不可当0。总/成员DTO新增quoteKind close/reference/live帮助隔离预览区分迟到close和live。普通成员/public剥离owner downsideRule设置。

getSoldLots/partial realizedLots按最新适用日期revision与真实sale时点重价；原frozen sale审计主键保留，旧version countedSalePrice不能阻挡回溯。总新增countedAccountNetProfit/Cny、countedRealizedPnl/Cny、countedSellValue/Cny。member.participations/closedLots保持countedRealizedPnl/Cny，raw salePrice/entryPrice/realizedPnl不改。费用仍100%，sale CNY复用原event immutable FX。新盘尾publication amounts保持真实price总额，新计入值只在独立audit meta/derived读取，不覆盖raw证据字段。

DDL仅代码定义与lazy正式save migration：start_date、nullable pending baselines、baseline_status/source、holding_start_at；append-only scoped UNIQUE version与CAS保留。冻结sale在新版回溯读时纯重价，原audit不UPDATE。保存本身不改真实sale-profit allocation/distributable_amount或钱包。

## 验证与未覆盖

已运行定向：`pnpm exec vitest run server/stock-lot-downside*.test.ts server/stock-total-calendar.test.ts server/stock-member-calendar.test.ts server/ledger-stock-portfolio.permissions.test.ts --reporter=dot`，最终177/177通过（日期纯函数30项，日期mock persistence/access8项，新销售审计2项，原45项+旧日历26项+权限66项）。纯四模块定向tsc通过；ledger esbuild bundle通过且未执行bundle或完整server。mixed agent已在其只读重估读取中动态调用上述股票baseline接口；本agent未运行其专属回归。

新增覆盖有效/invalid日期、今日前close、past/latestretro优先、未来pending/CAS/configread、createdAt真实now、启用前旧策略、真实opening不计持仓前quote、missing/conflicting/history来源、补抓真实价时间、连续daily diff、partial sale原fee/raw不变、lateentry旧epoch重价无虚亏、个人scope、USD原币种及固定FX、旧schema缺列SELECT-only、owner/viewAs无写。没有真实DB回归或生产effect声明。

**未覆盖/边界**：stocks独立观察实时portfolio/观察AI仍沿用旧展示口径（上一轮未接入）；crypto两源由mixed agent独立编辑与测试，本agent未编辑并不替它声称所有baseline接线已经验证。个人历史配置缺不可变revision/真实entry证明的日期仍pending，不伪造；经济更正/作废/重配旧安全guard保留。未运行全仓类型检查或完整server，未生产安装DDL，未推送。

## 日期版真实隔离联调补充（父任务，2026-11-25）

实际完成前端3文件86/86测试，后端18文件426/426定向回归，轻量前端构建及后端静态bundle通过，产物均未执行后台入口。原有routers db.execute未导出警告仍存在，未声称全仓类型检查通过。额外旧混合交易测试只新增空只读规则依赖适配；父修复概览规则读取与日结激活读取复用同一连接，保持旧单连接断言。另修复本地保存后父组件更新版本清除成功反馈的问题，并新增回归。

手机390px校验验证过去日期2026-11-23、实际30%保存、20/30/0文字、原单保存禁用、日期在门槛下及无横向溢出；唯一POST为本地preview/downside-rule，无正式tRPC写入。测试产生的本地规则交付前清理。

使用授权SELECT-only真实R1证据：2026-11-21至25五份混合固定日结、39笔真实开仓、367份原股票报价、35份冻结FX和每笔原卖出汇率锁。原始JSON/hash、quotes、FX及真实交易未改。启用前21/22不变；可核验24/25标签日结与25客户累计收益可按新比例派生重算。纯真实历史单例约1.277秒，预览缓存读取约0.015秒。

**真实缺口，禁止声称全部历史完成：** 23日原交易历史与原冻结总额不能完全重建一致，该日标签重估待核验；23/24日14客户中12人的当前参与记录曾在历史日结后变更，旧payload未保存逐笔份额版本，个人scope明确待核验。不得用今天份额、今天价格或实时FX伪造旧历史。须补齐当时可靠逐笔份额/交易修订证据才能消除缺口；后续新日结独立保存historyEvidence，旧raw payload不回填覆盖。独立股票观察实时portfolio仍未覆盖。

本轮未提交/推送，未执行生产DDL/DML、未安装规则表、未启动完整后台或执行bundle。私有预览仅写本地JSON，正式原订单、日结发布和钱包写入全部阻断。

## 正式保存发布准备（2026-11-25 23:38）

用户明确要求写入正式账目，不再仅本地预览。生产构建保留DEV/readOnlyPreview禁写保护；正式入口使用owner/viewAs/CAS保护的tRPC保存，按钮明确“保存到正式账目”，仅收到服务端成功响应后提示正式保存。此前试填的私有本地规则不自动搬入、不自动启用，正式配置由用户在正式站重新保存。

上线前修复两处阻塞：管理员每日盈亏记录保留null/ready/dailyPnlReady，待核验不再转换为0、不借缺口前后的累计值生成假日差；正式保存lot-first事务锁内重新核验开仓active、归属、数量、价格与时间，过期开仓证据拒绝保存并提示刷新。没有改变实际owner权限，也没有扩大普通管理员功能。

本阶段离线验证：前端原3文件88/88、每日快照新纯函数20/20、后端17文件437/437通过；完整生产构建通过，产物未执行。类型验证以同环境同提交未改主线作差分，避免旧基线、工作树绝对路径和路由展开数量误判。原有非本模块的routers db.execute未导出构建警告仍保留，不声称全仓无历史类型错误。

上文各“未提交/推送/生产写入”描述的是当时的阶段状态。实际发布须以最终提交、GitHub自动部署成功及正式站只读回验为准。23/24日历史证据缺口与独立观察未覆盖边界仍有效；正式规则保存不改原交易、钱包、历史行情、原冻结FX或旧raw发布payload。

## 正式保存后性能事故修复（2026-11-26）

日期版ba247797上线后，用户保存规则导致R1读取超过24秒。只读现场未看到长SQL或DDL锁等待；确认`getDbConnection`每次创建新Proxy，使连接身份WeakMap缓存跨请求失效；历史重估重复读与同步CPU放大。为先恢复服务，隔离恢复分支将运行产物原子回切到530319fa，GitHub main仍为ba247797。规则记录保留，不删交易、行情、日结或钱包；回切期间旧版本暂不应用新日期规则。

本次源码修复在ba247797上延续，不合入恢复分支工作流：按真实pool复用end-safe代理，独占事务连接不变；历史证据与派生读取按连接、范围、日期/规则revision单飞，pending始终共享、TTL从成功完成后起计、失败驱逐，fresh保存/成交校验绕缓存。保存仅标记dirty，不立即启动同事件循环的全历史后台重算。激活前baseline只计算目标日及差分必需的前交易日，批量读取14成员参与、关闭、历史FX及epoch，按客户隔离。混合同步与异步计算共用生成器，逐日让出事件循环，真实证据不变。正式保存只失效37号R1、本人概览、日历和AI相关查询，不再触发全站query重载。

红色本人进行中汇总另修新旧DTO兼容：旧本人lot只返回quantity/entryPrice，无逐笔PnL。仅当计入及原PnL字段均缺失时，才用该本人真实剩余数量、入场价和原币真实行情重建；新版明确null、0及缺价格/入场证明仍原样保留，不把真正待核验转成原始收益或零。已结束历史收益及原冻结FX不改。

最终离线回归：前端3文件92项、node:test每日快照20项、后端20文件471项通过；旧日历权限测试只补新增只读规则依赖mock，非owner禁止读取规则及共享总盘的断言增强，未放宽权限。完整生产静态构建通过，未执行后台产物。无缓存类型第一轮发现两处新增ES5集合迭代错误，已用Array.from保持原语义修复；最终类型差分及部署以发布回执为准，不能将历史全仓类型报错宣称为零。

匿名真实fixture性能对照（39lots、344participations、117closures、5日发布、14baseline成员、367quotes；模拟规则非正式设置复刻）：全历史baseline1711.5ms→单日355.3ms，混合同步1851.3ms→664.5ms；异步658.0ms、5次yield、最大同步段164.8ms；8并发同revision只load一次、628.5ms。新旧JSON、sync/async输出相同；这些是沙箱fixture，不是生产耗时保证。独立只读审查追加48组股票日期/暂停/平仓/缺证据等价及4组混合多日等价，未发现新增原收益/FX污染阻塞。

历史23/24日证据缺口与独立股票观察未覆盖边界继续有效。跨进程或独立新publication可能在短TTL内暂时显示旧/待核验结果，不用实时价格或FX伪补历史。实际重新上线须等待修复提交部署成功并回验总盘、本人逐笔计入字段、日历及52号依赖，不能仅凭HTML200宣布全站恢复。

最终无缓存tsc已完整结束；归一化对ba247797已复验诊断身份为2462→2462，新增0、修复后的新增ES5错误消除，没有修改tsconfig或类型baseline。验证脚本初次将tsc的正常诊断退出码2误判为执行失败，读取完整日志并检查结尾和数量后修正了工具判断，不重跑或隐藏已有诊断。生产构建原有非本模块db.execute未导出警告仍存在。

## 晚补录交易的发布时证据恢复（2026-11-26）

用户授权修复并推送23/24日日历待更新。只读定位：一笔股票实际成交日为23日、服务器销售和份额闭仓登记于24日上午；23日原15:05快照仍持有该批次。回溯读以当前交易史复算旧快照，会纳入原发布时尚未登记的销售，导致23日旧经济对账失败，继而24日日差缺前日可靠基准。成员另有24日晚登记、物理日结25日生效的数字币批次，顶层时间守卫此前与builder的未来物理批次跳过顺序不一致。

新增`buildLegacyCryptoPublicationHistory`为SELECT证据的纯内存还原：使用原`publishedAt`、开仓服务器登记时间，以及独立销售分配`created_at`/服务器登记时间和闭仓`closed_at`/服务器登记时间，筛除原发布时尚未登记的事实。仅当成员当前`updatedAt`与完整不可变闭仓记录时间精确对应、数量守恒且该成员原经济逐字段一致时，才派生恢复剩余份额与已知分配时点；任意未知编辑或缺证据不倒改更新时间、不假设旧份额。

候选历史与可信范围分离：新增`publicationHistoryByDate`携带`verifiedTotal`、`verifiedMemberIds`和`verifiedObservationIds`，总盘、各成员、各观察账户独立核验成本/市值/浮动/已实现/累计、各原币PnL及持仓数。未验证范围仍执行既有经济对账和时间守卫，不能把候选历史交给旧`historyByDate`的全范围可信入口。已有原`historyEvidence`优先，不回填或覆盖旧JSON。真实成交日、行情、原FX锁、费用、原交易、钱包和权限不修改。

成员/观察顶层未来判定改为与builder一致的真实市场anchor及物理生效日，只有可证明尚未生效的新批次不污染过去日；把旧参与日期向后改的未知变更仍待核验。历史恢复查询在原连接/标签/日期/规则单飞缓存loader内批量执行，新增两条租户隔离SELECT；有原发布证据的标签无需这两条查询，不建立新表、后台任务或全站刷新。

真实冻结样本回放已确认23/24/25日总盘及所核对成员累计/日差均ready，原始JSON哈希不变。23/24日此次已证明的缺口可恢复，不代表所有更早未知历史或独立观察入口已全部修复。新增匿名纯恢复、有效日/信任隔离及SELECT-only集成回归；定向24文件542项通过。扩大回归中的四个旧测试故障在已上线89431fc独立基线同样51项失败，新增失败0，未借此修改无关页面。完整静态构建通过且未执行后台产物；类型闸口及生产恢复以最终发布回执为准。
