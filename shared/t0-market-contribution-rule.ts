export type MarketContributionRule = {
  referrals: number;
  capital: number;
  trading: number;
  output: number;
  indirectDecay: number;
  retentionInfluence: number;
  retentionDays: number;
};

export const DEFAULT_MARKET_CONTRIBUTION_RULE: MarketContributionRule = {
  referrals: 1, capital: 1, trading: 1, output: 1,
  indirectDecay: 0.5, retentionInfluence: 0.5, retentionDays: 30,
};

export type MarketContributionFacts = {
  asOf: string;
  complete: boolean;
  users: Array<{
    userId: number;
    name: string;
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
    recipientAncestorUserIds: number[];
    amount: number;
    occurredAt: string;
    kind: "shared" | "commission";
  }>;
  limitations: string[];
};

export type MarketContributionPreviewRow = {
  userId: string;
  name: string;
  directParticipants: number;
  indirectParticipants: number;
  weightedParticipants: number;
  teamDeposit: number;
  teamWithdrawal: number;
  weightedCapital: number;
  retainedCapitalDays: number;
  weightedTradingEth: number;
  externalOutput: number;
  weightPercentage: number;
};

export function isValidMarketContributionRule(rule: MarketContributionRule) {
  return [rule.referrals, rule.capital, rule.trading, rule.output, rule.indirectDecay, rule.retentionInfluence]
    .every((value) => Number.isFinite(value) && value >= 0 && value <= 1)
    && Number.isInteger(rule.retentionDays) && rule.retentionDays >= 1 && rule.retentionDays <= 365;
}

/** 只计算净外部投入的留存代理，不将提款误称为本金转出，不将此值当账户余额。 */
function retainedExternalCapitalDays(user: MarketContributionFacts["users"][number], asOf: number, days: number) {
  const dayMilliseconds = 86_400_000;
  const start = asOf - days * dayMilliseconds;
  const flows = user.fundingFlows.map((flow) => ({ ...flow, time: Date.parse(flow.occurredAt) }))
    .filter((flow) => flow.time <= asOf).sort((left, right) => left.time - right.time);
  let balance = 0;
  let previous = start;
  let capitalDays = 0;
  for (const flow of flows) {
    if (flow.time > start) {
      capitalDays += Math.max(0, balance) * (flow.time - previous) / dayMilliseconds;
      previous = flow.time;
    }
    balance += flow.kind === "deposit" ? flow.amount : -flow.amount;
  }
  capitalDays += Math.max(0, balance) * (asOf - previous) / dayMilliseconds;
  return capitalDays;
}

/**
 * 只读事实 → 第五项试算。四个量纲先各自归一化，再按管理员相对强度组合。
 * 同一推荐业务在完整祖先链分摊，不能各层重复记满；自己及团队内部输出不计。
 * 没有市场贡献或全部权重关闭时不向无贡献用户均分；不改任何原始收支。
 */
export function calculateMarketContributionScores(
  facts: MarketContributionFacts | null | undefined,
  rule: MarketContributionRule,
  targetUserIds?: string[],
): { rows: MarketContributionPreviewRow[]; error: string | null } {
  if (!facts || !facts.complete) return { rows: [], error: "市场贡献数据尚未完整读取，暂不试算" };
  if (!isValidMarketContributionRule(rule)) return { rows: [], error: "请将影响强度设为0～1，留存参考天数设为1～365的整数" };
  const asOf = Date.parse(facts.asOf);
  if (!Number.isFinite(asOf)) return { rows: [], error: "市场贡献核算时间无效，暂不试算" };
  const validUserId = (id: number) => Number.isInteger(id) && id > 0;
  const validAncestry = (ids: number[], selfId: number) => Array.isArray(ids) && ids.every(validUserId)
    && new Set(ids).size === ids.length && !ids.includes(selfId);
  const validAmount = (amount: number) => typeof amount === "number" && Number.isFinite(amount) && amount >= 0;
  if (!Array.isArray(facts.users) || !Array.isArray(facts.outputs)
    || new Set(facts.users.map((user) => user.userId)).size !== facts.users.length
    || facts.users.some((user) => !validUserId(user.userId) || !validAncestry(user.ancestorUserIds, user.userId)
      || ![user.cumulativeDeposit, user.cumulativeWithdrawal, user.filledQuantityEth].every(validAmount)
      || typeof user.hasActivity !== "boolean" || !Array.isArray(user.fundingFlows)
      || user.fundingFlows.some((flow) => !validAmount(flow.amount) || !Number.isFinite(Date.parse(flow.occurredAt))
        || !["deposit", "withdrawal"].includes(flow.kind)))
    || new Set(facts.outputs.map((output) => output.id)).size !== facts.outputs.length
    || facts.outputs.some((output) => !output.id || !validUserId(output.sourceUserId) || !validUserId(output.recipientUserId)
      || !validAncestry(output.recipientAncestorUserIds, output.recipientUserId) || !validAmount(output.amount)
      || !Number.isFinite(Date.parse(output.occurredAt)) || !["shared", "commission"].includes(output.kind))) {
    return { rows: [], error: "市场贡献来源存在缺失或重复记录，暂不生成试算" };
  }

  const usersById = new Map(facts.users.map((user) => [user.userId, user]));
  if (facts.outputs.some((output) => !usersById.has(output.sourceUserId))) return { rows: [], error: "部分收益输出无法追溯来源用户，暂不试算" };
  for (const user of facts.users) {
    const flows = user.fundingFlows.filter((flow) => Date.parse(flow.occurredAt) <= asOf);
    const deposits = flows.filter((flow) => flow.kind === "deposit").reduce((sum, flow) => sum + flow.amount, 0);
    const withdrawals = flows.filter((flow) => flow.kind === "withdrawal").reduce((sum, flow) => sum + flow.amount, 0);
    const tolerance = Math.max(0.000001, (deposits + withdrawals) * 1e-10);
    if (Math.abs(deposits - user.cumulativeDeposit) > tolerance || Math.abs(withdrawals - user.cumulativeWithdrawal) > tolerance) {
      return { rows: [], error: "累计入金提现与逐笔资金明细尚未对齐，暂不计算资金留存" };
    }
  }
  const wanted = targetUserIds ? new Set(targetUserIds) : null;
  if (wanted && Array.from(wanted).some((id) => !usersById.has(Number(id)))) return { rows: [], error: "部分分配候选人尚未包含在完整市场贡献目录中，请重新读取" };
  const rowsById = new Map<string, MarketContributionPreviewRow>();
  for (const user of facts.users) {
    const id = String(user.userId);
    if (wanted && !wanted.has(id)) continue;
    rowsById.set(id, {
      userId: id, name: user.name, directParticipants: 0, indirectParticipants: 0,
      weightedParticipants: 0, teamDeposit: 0, teamWithdrawal: 0, weightedCapital: 0,
      retainedCapitalDays: 0, weightedTradingEth: 0, externalOutput: 0, weightPercentage: 0,
    });
  }
  const creditsByUserId = new Map<number, Array<{ rootId: string; credit: number; depth: number }>>();
  for (const user of facts.users) {
    const raw = user.ancestorUserIds.map((rootId, index) => ({ rootId: String(rootId), depth: index + 1, score: Math.pow(rule.indirectDecay, index) }));
    const total = raw.reduce((sum, ancestor) => sum + ancestor.score, 0);
    const credits = raw.map((ancestor) => ({ rootId: ancestor.rootId, depth: ancestor.depth, credit: total > 0 ? ancestor.score / total : 0 }));
    creditsByUserId.set(user.userId, credits);
    const retainedDays = retainedExternalCapitalDays(user, asOf, rule.retentionDays);
    const netExternalContribution = Math.max(0, user.cumulativeDeposit - user.cumulativeWithdrawal);
    const effectiveCapital = (1 - rule.retentionInfluence) * netExternalContribution
      + rule.retentionInfluence * retainedDays / rule.retentionDays;
    for (const { rootId, credit, depth } of credits) {
      const row = rowsById.get(rootId);
      if (!row) continue;
      // 原始人数/收支可用于核对，但只有归一化贡献份额进入权重，不层层满额计分。
      if (user.hasActivity) {
        if (depth === 1) row.directParticipants += 1;
        else row.indirectParticipants += 1;
        row.weightedParticipants += credit;
      }
      row.teamDeposit += user.cumulativeDeposit;
      row.teamWithdrawal += user.cumulativeWithdrawal;
      row.weightedCapital += credit * effectiveCapital;
      row.retainedCapitalDays += credit * retainedDays;
      row.weightedTradingEth += credit * user.filledQuantityEth;
    }
  }
  for (const output of facts.outputs) {
    if (Date.parse(output.occurredAt) > asOf || output.amount <= 0 || output.sourceUserId === output.recipientUserId) continue;
    for (const { rootId, credit } of creditsByUserId.get(output.sourceUserId) || []) {
      const row = rowsById.get(rootId);
      if (!row || output.recipientUserId === Number(rootId) || output.recipientAncestorUserIds.includes(Number(rootId))) continue;
      row.externalOutput += credit * output.amount;
    }
  }
  const rows = Array.from(rowsById.values());
  const dimensions: Array<{ strength: number; value: (row: MarketContributionPreviewRow) => number }> = [
    { strength: rule.referrals, value: (row) => row.weightedParticipants },
    { strength: rule.capital, value: (row) => row.weightedCapital },
    { strength: rule.trading, value: (row) => row.weightedTradingEth },
    { strength: rule.output, value: (row) => row.externalOutput },
  ];
  const activeDimensions = dimensions.map((dimension) => ({ ...dimension, total: rows.reduce((sum, row) => sum + dimension.value(row), 0) }))
    .filter((dimension) => dimension.strength > 0 && dimension.total > 0.000001);
  const strengthTotal = activeDimensions.reduce((sum, dimension) => sum + dimension.strength, 0);
  if (strengthTotal > 0) {
    for (const row of rows) row.weightPercentage = activeDimensions.reduce((sum, dimension) => sum
      + dimension.strength * dimension.value(row) / dimension.total / strengthTotal, 0) * 100;
  }
  return { rows, error: null };
}
