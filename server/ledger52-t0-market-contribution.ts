import { TRPCError } from "@trpc/server";
import { getDbConnection } from "./db";
import {
  LEDGER_52_T0_JOURNAL_ID,
  getLedger52T0JournalTeamFinancialFacts,
  type T0JournalProfitShareSnapshot,
} from "./ledger52-t0-journal";
import {
  calculateLedger52T0IncomeByClosing,
  type Ledger52T0IncomeTrade,
} from "./ledger52-t0-team-overview";

export type Ledger52T0MarketContributionFacts = {
  asOf: string;
  complete: true;
  users: Array<{
    userId: number;
    name: string;
    /** 最近推荐人优先；完整全站链，不折叠无业务祖先，也不包含本人。 */
    ancestorUserIds: number[];
    hasActivity: boolean;
    cumulativeDeposit: number;
    cumulativeWithdrawal: number;
    fundingFlows: Array<{ occurredAt: string; kind: "deposit" | "withdrawal"; amount: number }>;
    filledQuantityEth: number;
  }>;
  outputs: Array<{
    id: string;
    sourceUserId: number;
    recipientUserId: number;
    /** 收款人可能没有自己的订单/入金，不能通过业务users名单判断是否属于团队。 */
    recipientAncestorUserIds: number[];
    amount: number;
    occurredAt: string;
    kind: "shared" | "commission";
  }>;
  limitations: string[];
};

type FinancialFacts = Awaited<ReturnType<typeof getLedger52T0JournalTeamFinancialFacts>>;
type Entry = FinancialFacts["entries"][number];
type OpeningLink = { opening: Ledger52T0IncomeTrade; quantity: number; snapshots: T0JournalProfitShareSnapshot[] };
type RawOutput = Omit<Ledger52T0MarketContributionFacts["outputs"][number], "recipientAncestorUserIds">;
const MAX_ANCESTORS = 100;
// users.id / invited_by_user_id 均为既有schema的有符号INT；BIGINT订单ID不使用此上限。
const MAX_USER_ID = 2_147_483_647;
const EPSILON = 0.000001;

function fail(message: string): never {
  throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `市场贡献事实不完整：${message}` });
}

function userId(value: unknown, context: string): number {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0 || id > MAX_USER_ID) fail(`${context}用户ID越界或无效`);
  return id;
}

function finiteNonnegative(value: number, context: string): number {
  if (!Number.isFinite(value) || value < 0) fail(`${context}金额/数量无效`);
  return value;
}

function isoTimestamp(value: string, context: string): string {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) fail(`${context}时间无效`);
  return date.toISOString();
}

function payoutTimestamp(occurredOn: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(occurredOn)) fail("资金流水发生日无效");
  const date = new Date(`${occurredOn}T00:00:00+08:00`);
  if (Number.isNaN(date.getTime()) || new Date(`${occurredOn}T00:00:00Z`).toISOString().slice(0, 10) !== occurredOn) {
    fail("资金流水发生日不是有效自然日");
  }
  return date.toISOString();
}

function isOpening(entry: Pick<Entry, "action"> | Ledger52T0IncomeTrade) {
  return entry.action === "openLong" || entry.action === "openShort";
}

function validAction(entry: Entry) {
  return isOpening(entry) || entry.action === "closeLong" || entry.action === "closeShort";
}

function tradeFromEntry(entry: Entry): Ledger52T0IncomeTrade {
  return {
    id: entry.id, accountId: String(entry.accountId), relatedUserId: entry.relatedUserId ?? 0,
    relatedFundId: entry.relatedFundId === undefined ? undefined : String(entry.relatedFundId),
    action: entry.action, symbol: entry.symbol, instrumentType: entry.instrumentType,
    quantity: entry.quantity, price: entry.price, fee: entry.fee,
    targetPrice: entry.targetPrice, targetOpeningEntryId: entry.targetOpeningEntryId,
    createdAt: entry.createdAt, filledAt: entry.filledAt, isPending: entry.isPending,
  };
}

function side(trade: Ledger52T0IncomeTrade) {
  return trade.action === "openLong" || trade.action === "closeLong" ? "long" : "short";
}

/** 仅用于来源验证，完全沿用既有纯收益引擎的历史严格档位FIFO键与顺序；不另造收益结果。 */
function fifoKey(trade: Ledger52T0IncomeTrade): string {
  const sourcePrice = isOpening(trade) ? trade.price : (trade.targetPrice && trade.targetPrice > 0 ? trade.targetPrice : trade.price);
  const scaled = sourcePrice / 10;
  const archive = (side(trade) === "long" ? Math.ceil(scaled - 1e-9) : Math.floor(scaled + 1e-9)) * 10;
  return [side(trade), archive.toFixed(2), trade.accountId, trade.relatedUserId || "legacy-user", trade.relatedFundId || "legacy-fund"].join(":");
}

function strictFifoLinks(trades: Ledger52T0IncomeTrade[]): Map<string, OpeningLink[]> {
  const queues = new Map<string, Array<{ opening: Ledger52T0IncomeTrade; remaining: number }>>();
  const result = new Map<string, OpeningLink[]>();
  const ordered = [...trades].sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
  for (const trade of ordered) {
    if (trade.isPending || trade.symbol !== "ETH") continue;
    const key = fifoKey(trade);
    const queue = queues.get(key) ?? [];
    if (isOpening(trade)) {
      queue.push({ opening: trade, remaining: trade.quantity });
      queues.set(key, queue);
      continue;
    }
    let remaining = trade.quantity;
    const links: OpeningLink[] = [];
    for (const item of queue) {
      if (trade.targetOpeningEntryId && item.opening.id !== trade.targetOpeningEntryId) continue;
      if (remaining <= EPSILON) break;
      if (item.remaining <= EPSILON) continue;
      const quantity = Math.min(item.remaining, remaining);
      item.remaining -= quantity;
      remaining -= quantity;
      links.push({ opening: item.opening, quantity, snapshots: [] });
      if (trade.targetOpeningEntryId) break;
    }
    if (remaining <= EPSILON && links.length) result.set(trade.id, links);
  }
  return result;
}

function linkedNetPnl(link: OpeningLink, closing: Ledger52T0IncomeTrade): number {
  const opening = link.opening;
  const gross = (side(opening) === "long" ? closing.price - opening.price : opening.price - closing.price) * link.quantity;
  return gross - opening.fee * (link.quantity / opening.quantity) - closing.fee * (link.quantity / closing.quantity);
}

/** 冻结切片必须完整覆盖本单，数量一致且分佣比例合计100%；部分或猜测来源不允许输出。 */
function frozenLinks(
  closing: Ledger52T0IncomeTrade,
  snapshots: T0JournalProfitShareSnapshot[],
  openings: ReadonlyMap<string, Ledger52T0IncomeTrade>,
): OpeningLink[] | null {
  const byOpening = new Map<string, T0JournalProfitShareSnapshot[]>();
  for (const snapshot of snapshots) {
    const rows = byOpening.get(snapshot.openingEntryId) ?? [];
    rows.push(snapshot);
    byOpening.set(snapshot.openingEntryId, rows);
  }
  const links: OpeningLink[] = [];
  for (const [id, rows] of byOpening) {
    const opening = openings.get(id);
    const quantity = rows[0].matchedQuantity;
    const beneficiaries = new Set<number>();
    if (!opening || !Number.isFinite(quantity) || quantity <= 0 || quantity - opening.quantity > EPSILON) return null;
    let percentage = 0;
    for (const row of rows) {
      if (!Number.isFinite(row.matchedQuantity) || Math.abs(row.matchedQuantity - quantity) > EPSILON
        || !Number.isFinite(row.percentage) || row.percentage <= 0 || row.percentage > 100
        || !Number.isSafeInteger(row.beneficiaryUserId) || row.beneficiaryUserId <= 0
        || row.sourceUserId !== opening.relatedUserId || beneficiaries.has(row.beneficiaryUserId)) return null;
      beneficiaries.add(row.beneficiaryUserId);
      percentage += row.percentage;
    }
    if (Math.abs(percentage - 100) > EPSILON) return null;
    links.push({ opening, quantity, snapshots: rows });
  }
  return links.length && Math.abs(links.reduce((sum, link) => sum + link.quantity, 0) - closing.quantity) <= EPSILON ? links : null;
}

function verifiedLinks(
  closing: Ledger52T0IncomeTrade,
  snapshots: T0JournalProfitShareSnapshot[],
  openings: ReadonlyMap<string, Ledger52T0IncomeTrade>,
  fifo: ReadonlyMap<string, OpeningLink[]>,
  businessUserIds: ReadonlySet<number>,
  netPnl: number | null,
): OpeningLink[] | null {
  // 有冻结快照但残缺时不能退回FIFO覆盖错误；无快照的旧单仅接受能完整配对并与旧引擎净收益一致的严格FIFO。
  const links = snapshots.length ? frozenLinks(closing, snapshots, openings) : fifo.get(closing.id) ?? null;
  if (!links || netPnl === null || !Number.isFinite(netPnl)) return null;
  for (const link of links) {
    const opening = link.opening;
    if (opening.isPending || !isOpening(opening) || opening.symbol !== closing.symbol
      || opening.accountId !== closing.accountId || side(opening) !== side(closing)
      || (opening.instrumentType ?? "contract") !== (closing.instrumentType ?? "contract")
      || !businessUserIds.has(opening.relatedUserId)) return null;
  }
  const linkedTotal = links.reduce((sum, link) => sum + linkedNetPnl(link, closing), 0);
  return Number.isFinite(linkedTotal) && Math.abs(linkedTotal - netPnl) <= Math.max(EPSILON, Math.abs(netPnl) * 1e-9) ? links : null;
}

function buildOutputs(facts: FinancialFacts, businessUserIds: ReadonlySet<number>, limitations: Set<string>): RawOutput[] {
  // 收益沿用既有非期权已实现算法。保留无关联/已隐藏来源在回放序列中，避免改变其他来源的历史FIFO；最后严格验证输出来源。
  const trades = facts.entries.filter((entry) => validAction(entry) && entry.quantity > 0 && entry.instrumentType !== "option").map(tradeFromEntry);
  const tradeIds = new Set(trades.map((trade) => trade.id));
  const snapshots = facts.profitShareSnapshots.filter((snapshot) => tradeIds.has(snapshot.entryId) && tradeIds.has(snapshot.openingEntryId));
  const snapshotsByClosing = new Map<string, T0JournalProfitShareSnapshot[]>();
  // 也保留缺失开仓的快照供验证：缺失不能伪装成无快照后继续猜测FIFO。
  for (const snapshot of facts.profitShareSnapshots) {
    const rows = snapshotsByClosing.get(snapshot.entryId) ?? [];
    rows.push(snapshot);
    snapshotsByClosing.set(snapshot.entryId, rows);
  }
  const transfersByClosing = new Map<string, FinancialFacts["sharedIncomeTransfers"]>();
  const transferByKey = new Map<string, FinancialFacts["sharedIncomeTransfers"][number]>();
  for (const transfer of facts.sharedIncomeTransfers) {
    if (!tradeIds.has(transfer.closingEntryId)) continue;
    const key = `${transfer.closingEntryId}:${transfer.recipientUserId}`;
    const previous = transferByKey.get(key);
    if (previous) {
      if (previous.id !== transfer.id || previous.amount !== transfer.amount || previous.sourceUserId !== transfer.sourceUserId
        || previous.createdAt !== transfer.createdAt || previous.reducesRegularDistribution !== transfer.reducesRegularDistribution) {
        fail(`平仓${transfer.closingEntryId}共享转账唯一键冲突`);
      }
      continue;
    }
    transferByKey.set(key, transfer);
    const rows = transfersByClosing.get(transfer.closingEntryId) ?? [];
    rows.push(transfer);
    transfersByClosing.set(transfer.closingEntryId, rows);
  }
  const transfers = Array.from(transferByKey.values());
  const allocations = calculateLedger52T0IncomeByClosing({
    trades, snapshots,
    transfers: transfers.map((transfer) => ({ closingEntryId: transfer.closingEntryId, recipientUserId: transfer.recipientUserId, amount: transfer.amount })),
    reductions: facts.sharedIncomeReductions.filter((row) => tradeIds.has(row.closingEntryId)),
  });
  const openings = new Map(trades.filter((trade) => isOpening(trade) && !trade.isPending).map((trade) => [trade.id, trade]));
  const fifo = strictFifoLinks(trades);
  const outputs: RawOutput[] = [];
  const push = (output: RawOutput) => {
    if (output.sourceUserId === output.recipientUserId || output.amount <= 0) return;
    userId(output.sourceUserId, "收益来源");
    userId(output.recipientUserId, "收益收款人");
    if (!Number.isFinite(output.amount)) fail("收益输出金额无效");
    outputs.push(output);
  };
  for (const allocation of allocations) {
    const closing = allocation.closing;
    const closingSnapshots = snapshotsByClosing.get(closing.id) ?? [];
    const closingTransfers = transfersByClosing.get(closing.id) ?? [];
    const hasPositiveDistribution = allocation.allocations.some((line) => line.kind !== "shared" && line.amount > 0 && closingSnapshots.length > 0);
    if (!closingTransfers.length && !hasPositiveDistribution) continue;
    const links = verifiedLinks(closing, closingSnapshots, openings, fifo, businessUserIds, allocation.netPnl);
    if (!links) {
      limitations.add(`平仓${closing.id}无法完整验证实际开仓来源/配对数量/净收益，相关共享及分佣已排除；不推断归管理员。`);
      continue;
    }
    if (allocation.netPnl === null || allocation.netPnl <= 0) {
      if (closingTransfers.length) limitations.add(`平仓${closing.id}当前来源净收益非正，共享输出已排除。`);
      continue;
    }
    const positiveSourcePnl = new Map<number, number>();
    for (const link of links) {
      const source = link.opening.relatedUserId;
      positiveSourcePnl.set(source, (positiveSourcePnl.get(source) ?? 0) + linkedNetPnl(link, closing));
    }
    const sources = Array.from(positiveSourcePnl).filter(([, pnl]) => pnl > 0);
    const positiveTotal = sources.reduce((sum, [, pnl]) => sum + pnl, 0);
    const sharedTotal = closingTransfers.reduce((sum, transfer) => sum + transfer.amount, 0);
    if (!Number.isFinite(sharedTotal) || sharedTotal < 0 || sharedTotal - allocation.netPnl > EPSILON) {
      limitations.add(`平仓${closing.id}共享记录合计无法与当前正向净收益核对，相关输出已排除。`);
      continue;
    }
    for (const transfer of closingTransfers) {
      if (!Number.isFinite(transfer.amount) || transfer.amount <= 0 || !Number.isFinite(transfer.sourceNetPnl) || transfer.sourceNetPnl <= 0) {
        limitations.add(`共享转账${transfer.id}缺少正向实际入账金额/来源净收益，已排除。`);
        continue;
      }
      const occurredAt = isoTimestamp(transfer.createdAt, `共享转账${transfer.id}`);
      // source_user_id可沿用旧管理员/镜像键；权威来源只用本次已验证的真实开仓relatedUserId。
      for (const [sourceUserId, pnl] of sources) {
        push({ id: `shared:${closing.id}:${transfer.id}:${sourceUserId}`, sourceUserId, recipientUserId: transfer.recipientUserId,
          amount: transfer.amount * (pnl / positiveTotal), occurredAt, kind: "shared" });
      }
    }
    // 共享已经由转账唯一键输出，绝不再将引擎的shared收款行记成一次来源输出。
    // 分佣必须有真实filled平仓与完整冻结快照，并且共享扣减后账目守恒；旧无扣减共享不能再次叠加整笔分佣。
    if (!closingSnapshots.length) continue;
    if (allocation.regularDistributable === null || allocation.variance === null || Math.abs(allocation.variance) > EPSILON
      || closingTransfers.some((transfer) => !transfer.reducesRegularDistribution)) {
      limitations.add(`平仓${closing.id}分佣与共享扣减/净实付归属无法完整核对，分佣输出已排除；已验证的共享转账仅保留一次。`);
      continue;
    }
    const occurredAt = isoTimestamp(closing.filledAt ?? closing.createdAt, `平仓${closing.id}`);
    for (const line of allocation.allocations) {
      if (line.kind === "shared" || line.amount <= 0) continue;
      const sourceWeights = new Map<number, number>();
      for (const link of links) {
        for (const snapshot of link.snapshots) {
          if (snapshot.beneficiaryUserId !== line.userId) continue;
          const source = link.opening.relatedUserId;
          sourceWeights.set(source, (sourceWeights.get(source) ?? 0) + linkedNetPnl(link, closing) * (snapshot.percentage / 100));
        }
      }
      // 同一recipient先按各source正净贡献分摊已实现正净实付额；负切片不伪造成正输出，本人利润切片不转移给他人。
      const weights = Array.from(sourceWeights).filter(([, weight]) => weight > 0);
      const totalWeight = weights.reduce((sum, [, weight]) => sum + weight, 0);
      for (const [sourceUserId, weight] of weights) {
        push({ id: `commission:${closing.id}:${sourceUserId}:${line.userId}`, sourceUserId, recipientUserId: line.userId,
          amount: line.amount * (weight / totalWeight), occurredAt, kind: "commission" });
      }
    }
  }
  return outputs;
}

/** 仅一个全站最小字段SELECT，不读取wallet/余额/成员页面筛选图，不返回无业务全站用户目录。 */
async function readAncestry(requiredUserIds: ReadonlySet<number>, connection?: import("mysql2/promise").PoolConnection, lockFacts = false) {
  const conn = connection || await getDbConnection();
  if (!conn) fail("数据库连接失败");
  const [result] = await conn.execute(`SELECT id, invited_by_user_id, name FROM users ORDER BY id ASC${lockFacts ? " FOR UPDATE" : ""}`);
  if (!Array.isArray(result)) fail("全站推荐关系查询结果无效");
  const rowsById = new Map<number, { id: unknown; invited_by_user_id: unknown; name: unknown }>();
  for (const row of result as Array<{ id: unknown; invited_by_user_id: unknown; name: unknown }>) {
    const id = userId(row.id, "全站推荐关系");
    if (rowsById.has(id)) fail(`全站用户${id}重复`);
    rowsById.set(id, row);
  }
  const ancestors = new Map<number, number[]>();
  const names = new Map<number, string>();
  for (const requiredId of requiredUserIds) {
    userId(requiredId, "业务或收款人");
    const first = rowsById.get(requiredId);
    if (!first) fail(`业务/收款用户${requiredId}不存在`);
    names.set(requiredId, String(first.name ?? "").trim() || `用户#${requiredId}`);
    const chain: number[] = [];
    const visited = new Set<number>([requiredId]);
    let current = first;
    while (true) {
      const rawParent = current.invited_by_user_id;
      if (rawParent === null || rawParent === 0 || rawParent === "0") break;
      if (rawParent === undefined || rawParent === "") fail(`用户${Number(current.id)}推荐关系数据缺失`);
      const parentId = userId(rawParent, `用户${Number(current.id)}的推荐人`);
      if (visited.has(parentId)) fail(`用户${requiredId}祖先链循环或包含本人（${parentId}）`);
      if (chain.length >= MAX_ANCESTORS) fail(`用户${requiredId}祖先链超过${MAX_ANCESTORS}层`);
      const parent = rowsById.get(parentId);
      if (!parent) fail(`用户${requiredId}祖先${parentId}数据缺失`);
      chain.push(parentId);
      visited.add(parentId);
      current = parent;
    }
    ancestors.set(requiredId, chain);
  }
  return { ancestors, names };
}

async function loadFacts(journalOwnerUserId: number, input: { financialFacts?: FinancialFacts; asOf?: string; connection?: import("mysql2/promise").PoolConnection; lockFacts?: boolean } = {}): Promise<Ledger52T0MarketContributionFacts> {
  const conn = input.connection || await getDbConnection();
  if (!conn) fail("数据库连接失败");
  // 专用财务读取器已审核：全历史游标分页，既有只读快照，不调用ensure/行情/自动成交/数据库cache。
  const [facts, deletedResult] = await Promise.all([
    input.financialFacts ? Promise.resolve(input.financialFacts) : getLedger52T0JournalTeamFinancialFacts({ journalOwnerUserId, connection: input.connection, lockFacts: input.lockFacts }),
    conn.execute(
      `SELECT dimension_id FROM ledger52_t0_journal_deleted_dimensions WHERE ledger_id = ? AND user_id = ? AND dimension = 'related_user'${input.lockFacts ? " FOR UPDATE" : ""}`,
      [LEDGER_52_T0_JOURNAL_ID, journalOwnerUserId],
    ),
  ]);
  const asOf = input.asOf || new Date().toISOString();
  const deletedRows = deletedResult[0];
  if (!Array.isArray(deletedRows)) fail("已删除来源查询结果无效");
  const deletedUserIds = new Set((deletedRows as Array<{ dimension_id: unknown }>).map((row) => userId(row.dimension_id, "已删除来源")));
  const businessUserIds = new Set<number>();
  const limitations = new Set<string>([
    "仅统计当前管理流水内仍保留的真实订单（挂单、期权、网格亦计活动）或正向deposit；仅注册、仅提现、仅收款及已删除关联用户目录不单独计有效推荐。",
    "入金/提现金额直接采用既有T+0 payout流水U金额（ETH录入已在原登记时折算），不读取全局wallet，不再乘当前报价。",
    "资金流水occurredOn只有北京时间自然日，occurredAt规范为该日北京时间00:00的ISO，日粒度不代表真实时分秒。",
    "fundingFlows保留所读取的全部资金流水；未来发生日不计入截至asOf的累计入金/提现与入金活动准入，累计金额等于occurredAt<=asOf的对应流水合计。",
    "提现流水不能拆分本金与收益；max(累计入金-累计提现,0)仅可解释为净外部投入代理，不是精准留存本金或账户实际余额。",
    "filledQuantityEth仅累加ETH现货/合约已成交开仓的原始正quantity；不计挂单、平仓、期权、网格或未明确类型的旧单；其他订单活动与入金仍计人数。",
    "收益输出仅采用非期权实际已成交平仓及既有已实现净收益/冻结分佣归属；分佣是现有T+0账本已落账净归属，不是外部钱包转账或提现凭证。不计未来比例、预分配和浮盈。",
    "多来源输出只有完整实际开仓配对可验证时，才按各来源正净收益/对应受益人正净贡献分摊真实输出额；无法验证者明确排除，绝不硬归管理员。",
    "outputs只记录来源给他人的共享/分佣一次，不将收款再次当输出；保留实际source/recipient和收款人完整祖先链，团队内部循环由试算端按root及收款祖先过滤。",
    "祖先链采用读取时users.invited_by_user_id完整全站现行关系，最近祖先优先，不折叠无业务节点；不是交易发生时的历史推荐快照。",
    "订单/分佣/共享/资金采用既有同一只读财务快照；目录删除标记和全站推荐关系由独立最小字段SELECT读取，asOf为本次财务读取完成时点。",
  ]);
  for (const entry of facts.entries) {
    if (!entry.relatedUserId || deletedUserIds.has(entry.relatedUserId)) continue;
    const id = userId(entry.relatedUserId, `订单${entry.id}`);
    if (!validAction(entry)) fail(`订单${entry.id}交易动作无效`);
    finiteNonnegative(entry.quantity, `订单${entry.id}`);
    finiteNonnegative(entry.price, `订单${entry.id}价格`);
    finiteNonnegative(entry.fee, `订单${entry.id}手续费`);
    isoTimestamp(entry.filledAt ?? entry.createdAt, `订单${entry.id}`);
    if (entry.quantity > 0) businessUserIds.add(id);
  }
  for (const flow of facts.payoutCashFlows) {
    if (deletedUserIds.has(flow.relatedUserId)) continue;
    finiteNonnegative(flow.amount, `资金流水${flow.id}`);
    const occurredAt = payoutTimestamp(flow.occurredOn);
    if (flow.direction === "deposit" && flow.amount > 0 && occurredAt <= asOf) businessUserIds.add(userId(flow.relatedUserId, `入金${flow.id}`));
  }
  const rawOutputs = buildOutputs(facts, businessUserIds, limitations).filter((output) => output.occurredAt <= asOf);
  const requiredUserIds = new Set([...businessUserIds, ...rawOutputs.map((output) => output.recipientUserId)]);
  const ancestry = await readAncestry(requiredUserIds, input.connection, input.lockFacts);
  const users: Ledger52T0MarketContributionFacts["users"] = Array.from(businessUserIds).sort((a, b) => a - b).map((id) => ({
    userId: id, name: ancestry.names.get(id)!, ancestorUserIds: ancestry.ancestors.get(id)!, hasActivity: true,
    cumulativeDeposit: 0, cumulativeWithdrawal: 0, fundingFlows: [], filledQuantityEth: 0,
  }));
  const usersById = new Map(users.map((item) => [item.userId, item]));
  for (const flow of facts.payoutCashFlows) {
    const item = usersById.get(flow.relatedUserId);
    if (!item) continue;
    const amount = finiteNonnegative(flow.amount, `资金流水${flow.id}`);
    const occurredAt = payoutTimestamp(flow.occurredOn);
    item.fundingFlows.push({ occurredAt, kind: flow.direction, amount });
    if (occurredAt > asOf) continue;
    if (flow.direction === "deposit") item.cumulativeDeposit += amount;
    else item.cumulativeWithdrawal += amount;
  }
  for (const entry of facts.entries) {
    const item = usersById.get(entry.relatedUserId ?? 0);
    if (!item || entry.isPending || !isOpening(entry) || entry.symbol !== "ETH"
      || (entry.instrumentType !== "spot" && entry.instrumentType !== "contract")) continue;
    item.filledQuantityEth += finiteNonnegative(entry.quantity, `已成交开仓${entry.id}`);
  }
  for (const item of users) {
    finiteNonnegative(item.cumulativeDeposit, `用户${item.userId}累计入金`);
    finiteNonnegative(item.cumulativeWithdrawal, `用户${item.userId}累计提现`);
    finiteNonnegative(item.filledQuantityEth, `用户${item.userId}成交量`);
    item.fundingFlows.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  }
  const outputs = rawOutputs.map((output) => ({ ...output, recipientAncestorUserIds: ancestry.ancestors.get(output.recipientUserId)! }))
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id));
  return { asOf, complete: true, users, outputs, limitations: Array.from(limitations) };
}

/** 路由必须先取得真实admin scope；仅按既有scope给出的管理所有者隔离，无客户端root/配置参数。 */
export function getLedger52T0MarketContributionFacts(input: { journalOwnerUserId: number; financialFacts?: FinancialFacts; asOf?: string; connection?: import("mysql2/promise").PoolConnection; lockFacts?: boolean }): Promise<Ledger52T0MarketContributionFacts> {
  const ownerId = input.journalOwnerUserId;
  if (!Number.isSafeInteger(ownerId) || ownerId <= 0 || ownerId > MAX_USER_ID) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "市场贡献管理流水归属无效" });
  }
  return loadFacts(ownerId, input);
}
