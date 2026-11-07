import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  calculateWeightedOrderScores,
  DEFAULT_WEIGHTED_ORDER_RULE,
  normalizeWeightedOrderRule,
  type WeightedOrderFact,
  type WeightedOrderRule,
} from "../shared/t0-weighted-order-rule";
import {
  allocateCappedAnnualizedCents,
  getAnnualizedGapWeights,
} from "../shared/t0-annualized-allocation-rule";
import {
  calculateSharedContributionWeights,
  DEFAULT_SHARED_CONTRIBUTION_RULE,
  type SharedContributionFact,
} from "../shared/t0-shared-contribution-rule";
import {
  calculateMarketContributionScores,
  DEFAULT_MARKET_CONTRIBUTION_RULE,
  type MarketContributionFacts,
  type MarketContributionRule,
} from "../shared/t0-market-contribution-rule";

// 仅运行无依赖 shared 工具；synthetic fixture 是测试输入，不是实际页面/收支 mock。
// 禁止导入 server、router、React 页面、DB；生产连接、签名合同只允许日后只读 AST。
const sharedFiles = [
  "t0-weighted-order-rule.ts",
  "t0-annualized-allocation-rule.ts",
  "t0-shared-contribution-rule.ts",
  "t0-market-contribution-rule.ts",
] as const;
function nodes<T extends ts.Node>(root: ts.Node, predicate: (node: ts.Node) => node is T): T[] {
  const result: T[] = [];
  const visit = (node: ts.Node) => {
    if (predicate(node)) result.push(node);
    ts.forEachChild(node, visit);
  };
  visit(root);
  return result;
}
function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const nested of Object.values(value)) freeze(nested);
    Object.freeze(value);
  }
  return value;
}
function order(overrides: Partial<WeightedOrderFact> = {}): WeightedOrderFact {
  return { userId: "a", quantity: 1, price: 100, status: "filled", side: "long", openingFee: 0, ...overrides };
}
const neutralOrderRule: WeightedOrderRule = { distanceInfluence: 0, statusInfluence: 0, pnlInfluence: 0 };
function sharedFact(userId: string, overrides: Partial<SharedContributionFact> = {}): SharedContributionFact {
  return { userId, outgoingAmount: 0, outgoingCount: 0, incomingAmount: 0, incomingCount: 0, ...overrides };
}
type MarketUser = MarketContributionFacts["users"][number];
type MarketOutput = MarketContributionFacts["outputs"][number];
function marketUser(userId: number, overrides: Partial<MarketUser> = {}): MarketUser {
  return {
    userId, name: `synthetic-${userId}`, ancestorUserIds: [], hasActivity: false,
    cumulativeDeposit: 0, cumulativeWithdrawal: 0, fundingFlows: [], filledQuantityEth: 0,
    ...overrides,
  };
}
function output(overrides: Partial<MarketOutput> = {}): MarketOutput {
  return {
    id: "external", sourceUserId: 3, recipientUserId: 99, recipientAncestorUserIds: [],
    amount: 80, occurredAt: "2026-10-10T00:00:00.000Z", kind: "shared", ...overrides,
  };
}
function marketFacts(overrides: Partial<MarketContributionFacts> = {}): MarketContributionFacts {
  return {
    asOf: "2026-10-11T00:00:00.000Z", complete: true,
    users: [
      marketUser(1),
      marketUser(2, { ancestorUserIds: [1] }),
      marketUser(3, {
        ancestorUserIds: [2, 1], hasActivity: true, cumulativeDeposit: 100, cumulativeWithdrawal: 20,
        fundingFlows: [
          { occurredAt: "2026-10-06T00:00:00.000Z", kind: "deposit", amount: 100 },
          { occurredAt: "2026-10-09T00:00:00.000Z", kind: "withdrawal", amount: 20 },
        ], filledQuantityEth: 8,
      }),
    ], outputs: [output()], limitations: [], ...overrides,
  };
}
function marketRule(overrides: Partial<MarketContributionRule> = {}): MarketContributionRule {
  return { ...DEFAULT_MARKET_CONTRIBUTION_RULE, retentionInfluence: 0, ...overrides };
}
function marketRows(facts: MarketContributionFacts, rule = marketRule(), targets = ["1", "2"]) {
  const result = calculateMarketContributionScores(facts, rule, targets);
  expect(result.error).toBeNull();
  return result.rows;
}
function expectClosed(result: ReturnType<typeof calculateMarketContributionScores>) {
  expect(result.rows).toEqual([]);
  expect(result.error).toEqual(expect.any(String));
  expect(result.error!.length).toBeGreaterThan(0);
}

describe("T+0 挂单数量加权纯生产规则", () => {
  it("以 ETH 数量而非订单笔数加分，同数量拆单不改变权重", () => {
    const whole = calculateWeightedOrderScores([order({ quantity: 10 })], 100, neutralOrderRule, 0).get("a")!;
    const split = calculateWeightedOrderScores(Array.from({ length: 40 }, () => order({ quantity: 0.25 })), 100, neutralOrderRule, 0).get("a")!;
    expect(whole.score).toBe(10);
    expect(split.score).toBe(whole.score);
    expect(split.filledQuantity).toBe(whole.filledQuantity);
    const pending = calculateWeightedOrderScores([order({ quantity: 20, status: "pending" })], 100, DEFAULT_WEIGHTED_ORDER_RULE, 0).get("a")!;
    expect(pending.score).toBe(5);
  });

  it("pending 与 filled 分别保留数量，待成交无虚拟盈亏且默认仅有四分之一状态权重", () => {
    const user = calculateWeightedOrderScores([
      order({ quantity: 4, status: "pending", price: 90, openingFee: 999 }),
      order({ quantity: 2, status: "filled" }),
    ], 100, { ...DEFAULT_WEIGHTED_ORDER_RULE, pnlInfluence: 0 }, 0).get("a")!;
    expect(user.pendingQuantity).toBe(4);
    expect(user.filledQuantity).toBe(2);
    expect(user.netPnl).toBe(0);
    expect(user.details[0]).toMatchObject({ statusFactor: 0.25, pnlFactor: 1 });
    expect(user.details[0].score).toBeCloseTo(0.25, 12);
    expect(user.details[1]).toMatchObject({ statusFactor: 1, pnlFactor: 1, score: 2 });
  });

  it.each([80, 120, 70, 130])("距离恰达或超过20%%：price=%s 即使全部影响关闭也为零", (price) => {
    for (const status of ["pending", "filled"] as const) {
      for (const rule of [DEFAULT_WEIGHTED_ORDER_RULE, neutralOrderRule]) {
        const user = calculateWeightedOrderScores([order({ price, quantity: 100, status })], 100, rule, 0).get("a")!;
        expect(user.score).toBe(0);
        expect(user.details[0].distanceFactor).toBe(0);
      }
    }
  });

  it("20%范围内仍可获得正权重，距离影响1按平方衰减", () => {
    for (const price of [80.01, 119.99]) {
      expect(calculateWeightedOrderScores([order({ price })], 100, DEFAULT_WEIGHTED_ORDER_RULE, 0).get("a")!.score).toBeGreaterThan(0);
    }
    const atTenPercent = calculateWeightedOrderScores([order({ price: 110 })], 100, { ...DEFAULT_WEIGHTED_ORDER_RULE, pnlInfluence: 0 }, 0).get("a")!;
    expect(atTenPercent.details[0].distanceFactor).toBeCloseTo(0.25, 12);
  });

  it("同一用户多空盈亏先合并、双边真实手续费扣除，不净掉多空数量", () => {
    const user = calculateWeightedOrderScores([
      order({ price: 90, side: "long", openingFee: 0.5 }),
      order({ price: 90, side: "short", openingFee: 0.5 }),
    ], 100, DEFAULT_WEIGHTED_ORDER_RULE).get("a")!;
    expect(user.filledQuantity).toBe(2);
    expect(user.netPnl).toBeCloseTo(-1.072, 12);
    expect(user.netPnlRate).toBeCloseTo(user.netPnl / 180, 12);
    expect(user.details[0].pnlFactor).toBe(user.pnlFactor);
    expect(user.details[1].pnlFactor).toBe(user.pnlFactor);
  });

  it("用户净盈利先合并再赋单一系数，拆亏损单不能刷亏损奖励", () => {
    const facts = [order({ quantity: 2, price: 90 }), order({ quantity: 1, price: 110 })];
    const splitFacts = [facts[0], ...Array.from({ length: 10 }, () => order({ quantity: 0.1, price: 110 }))];
    const whole = calculateWeightedOrderScores(facts, 100, DEFAULT_WEIGHTED_ORDER_RULE, 0).get("a")!;
    const split = calculateWeightedOrderScores(splitFacts, 100, DEFAULT_WEIGHTED_ORDER_RULE, 0).get("a")!;
    expect(whole.netPnl).toBe(10);
    expect(whole.netPnlRate).toBeCloseTo(10 / 290, 12);
    expect(whole.pnlFactor).toBeCloseTo(1 - 0.5 * (10 / 290) / 0.1, 12);
    expect(whole.pnlFactor).toBeLessThan(1);
    expect(whole.details.every((detail) => detail.pnlFactor === whole.pnlFactor)).toBe(true);
    expect(split.netPnl).toBeCloseTo(whole.netPnl, 12);
    expect(split.pnlFactor).toBeCloseTo(whole.pnlFactor, 12);
    expect(split.score).toBeCloseTo(whole.score, 12);
  });

  it("用户间不互相抵消盈亏，pending 不继承同用户 filled 的盈亏系数", () => {
    const scores = calculateWeightedOrderScores([
      order({ userId: "winner", quantity: 2, price: 90 }),
      order({ userId: "loser", quantity: 2, price: 110 }),
      order({ userId: "loser", quantity: 2, price: 100, status: "pending" }),
    ], 100, DEFAULT_WEIGHTED_ORDER_RULE, 0);
    expect(scores.get("winner")!.netPnl).toBe(20);
    expect(scores.get("winner")!.pnlFactor).toBe(0.5);
    expect(scores.get("loser")!.netPnl).toBe(-20);
    expect(scores.get("loser")!.pnlFactor).toBeGreaterThan(1);
    expect(scores.get("loser")!.details[1].pnlFactor).toBe(1);
  });

  it("无有效成交基础时净收益率为null；异常价格/费率不生成权重", () => {
    const pending = calculateWeightedOrderScores([order({ status: "pending" })], 100, DEFAULT_WEIGHTED_ORDER_RULE).get("a")!;
    expect(pending.netPnlRate).toBeNull();
    expect(pending.pnlFactor).toBe(1);
    for (const close of [0, -1, NaN, Infinity]) expect(calculateWeightedOrderScores([order()], close, neutralOrderRule).size).toBe(0);
    for (const fee of [-1, NaN, Infinity]) expect(calculateWeightedOrderScores([order()], 100, neutralOrderRule, fee).size).toBe(0);
    for (const invalid of [order({ quantity: 0 }), order({ quantity: NaN }), order({ price: Infinity }), order({ userId: "" }), order({ openingFee: NaN })]) {
      expect(calculateWeightedOrderScores([invalid], 100, neutralOrderRule).size).toBe(0);
    }
  });

  it("影响强度钳制在0～1，真实工具不改变冻结的规则或输入", () => {
    expect(normalizeWeightedOrderRule({ distanceInfluence: -1, statusInfluence: 2, pnlInfluence: NaN }))
      .toEqual({ distanceInfluence: 0, statusInfluence: 1, pnlInfluence: 1 });
    const facts = freeze([order({ quantity: 2 }), order({ price: 90, status: "pending" })]);
    const rule = freeze({ ...DEFAULT_WEIGHTED_ORDER_RULE });
    const before = structuredClone({ facts, rule });
    calculateWeightedOrderScores(facts, 100, rule);
    expect({ facts, rule }).toEqual(before);
  });
});

describe("T+0 年化目标补差与整数分封顶纯生产规则", () => {
  it("influence=0仅未达目标的有效用户均分，不把已达标/无目标者带入", () => {
    const rows = [
      { userId: "a", topUp: 10 }, { userId: "b", topUp: 90 },
      { userId: "at-target", topUp: 0 }, { userId: "above-target", topUp: -10 },
      { userId: "unknown", topUp: null }, { userId: "invalid", topUp: NaN },
    ];
    const weights = getAnnualizedGapWeights(rows, 0);
    expect(weights.map(({ row }) => row.userId)).toEqual(["a", "b"]);
    expect(weights.map(({ weight }) => weight)).toEqual([0.5, 0.5]);
  });

  it("influence=1按补差金额，中间强度混合；没有未达标者不生成候选", () => {
    const rows = [{ topUp: 10 }, { topUp: 90 }];
    expect(getAnnualizedGapWeights(rows, 1).map(({ weight }) => weight)).toEqual([0.1, 0.9]);
    const mixed = getAnnualizedGapWeights(rows, 0.5);
    expect(mixed[0].weight).toBeCloseTo(0.3, 12);
    expect(mixed[1].weight).toBeCloseTo(0.7, 12);
    expect(getAnnualizedGapWeights([{ topUp: 0 }, { topUp: null }, { topUp: 0.000001 }], 0)).toEqual([]);
  });

  it("101分均分按最大余数确定性补齐，整数分总额守恒", () => {
    const candidates = ["c", "a", "b"].map((userId) => ({ userId, weight: 1, capCents: 1000 }));
    const result = allocateCappedAnnualizedCents(101, candidates);
    const paid = Object.fromEntries(result.map(({ userId, cents }) => [userId, cents]));
    expect(paid).toEqual({ a: 34, b: 34, c: 33 });
    expect(result.reduce((sum, item) => sum + item.cents, 0)).toBe(101);
    expect(allocateCappedAnnualizedCents(101, [...candidates].reverse()).sort((a, b) => a.userId.localeCompare(b.userId)))
      .toEqual([...result].sort((a, b) => a.userId.localeCompare(b.userId)));
  });

  it("高权重小cap先饱和再重分配，多次饱和也不超过任一目标", () => {
    const candidates = [
      { userId: "a", weight: 100, capCents: 1 },
      { userId: "b", weight: 10, capCents: 2 },
      { userId: "c", weight: 1, capCents: 100 },
    ];
    expect(allocateCappedAnnualizedCents(50, candidates)).toEqual([
      { userId: "a", cents: 1 }, { userId: "b", cents: 2 }, { userId: "c", cents: 47 },
    ]);
    expect(allocateCappedAnnualizedCents(1000, candidates).reduce((sum, row) => sum + row.cents, 0)).toBe(103);
  });

  it("预算超过全体caps时只付cap总额，剩余资金保留而非强制分光", () => {
    const result = allocateCappedAnnualizedCents(100, [
      { userId: "a", weight: 0.5, capCents: 10 }, { userId: "b", weight: 0.5, capCents: 20 },
    ]);
    expect(result).toEqual([{ userId: "a", cents: 10 }, { userId: "b", cents: 20 }]);
    expect(100 - result.reduce((sum, row) => sum + row.cents, 0)).toBe(70);
  });

  it("多组synthetic预算/cap/权重的整数守恒与非负封顶不变量", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const candidates = Array.from({ length: 5 }, (_, index) => ({
        userId: String(index + 1), weight: ((seed * (index + 3)) % 17) + 1,
        capCents: ((seed * (index + 7)) % 53) + 1,
      }));
      const totalCap = candidates.reduce((sum, row) => sum + row.capCents, 0);
      for (const budget of [1, 2, 7, 101, totalCap, totalCap + 1]) {
        const result = allocateCappedAnnualizedCents(budget, candidates);
        expect(result.reduce((sum, row) => sum + row.cents, 0)).toBe(Math.min(budget, totalCap));
        for (const row of result) {
          expect(Number.isSafeInteger(row.cents)).toBe(true);
          expect(row.cents).toBeGreaterThanOrEqual(0);
          expect(row.cents).toBeLessThanOrEqual(candidates.find((item) => item.userId === row.userId)!.capCents);
        }
      }
    }
  });

  it("非法预算不支付，零/负/非整数cap和无效权重不当作有效候选", () => {
    const valid = { userId: "valid", weight: 1, capCents: 100 };
    for (const budget of [0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(allocateCappedAnnualizedCents(budget, [valid])).toEqual([]);
    }
    const result = allocateCappedAnnualizedCents(10, [valid,
      { userId: "zero", weight: 0, capCents: 100 },
      { userId: "negative", weight: -1, capCents: 100 },
      { userId: "nan", weight: NaN, capCents: 100 },
      { userId: "fractional-cap", weight: 1, capCents: 0.5 },
      { userId: "no-cap", weight: 1, capCents: 0 },
    ]);
    expect(result).toEqual([{ userId: "valid", cents: 10 }]);
  });

  it("补差与封顶不修改冻结候选和预算", () => {
    const candidates = freeze([{ userId: "a", weight: 1, capCents: 30 }, { userId: "b", weight: 2, capCents: 40 }]);
    const before = structuredClone(candidates);
    allocateCappedAnnualizedCents(60, candidates);
    getAnnualizedGapWeights(freeze([{ topUp: 10 }, { topUp: 20 }]), 0.5);
    expect(candidates).toEqual(before);
  });
});

describe("T+0 共享收支合并归一化纯生产规则", () => {
  it("对外金额/次数先各自归一化再平均，金额量纲不能压倒次数", () => {
    const facts = [
      sharedFact("a", { outgoingAmount: 1000000, outgoingCount: 1 }),
      sharedFact("b", { outgoingAmount: 0, outgoingCount: 9 }),
    ];
    const scores = calculateSharedContributionWeights(facts, { outgoing: 1, incomingAmount: 0, incomingCount: 0 });
    expect(scores[0].outgoingShare).toBeCloseTo(0.55, 12);
    expect(scores[1].outgoingShare).toBeCloseTo(0.45, 12);
    expect(scores[0].weight).toBeCloseTo(0.54, 12);
    expect(scores[1].weight).toBeCloseTo(0.46, 12);
    const scaled = calculateSharedContributionWeights(facts.map((fact) => ({ ...fact, outgoingAmount: fact.outgoingAmount * 1000 })), { outgoing: 1, incomingAmount: 0, incomingCount: 0 });
    expect(scaled.map(({ weight }) => weight)).toEqual(scores.map(({ weight }) => weight));
  });

  it("收到金额与次数使用距最大值的补差，各维度份额总和1", () => {
    const facts = [
      sharedFact("a", { incomingAmount: 10, incomingCount: 1 }),
      sharedFact("b", { incomingAmount: 30, incomingCount: 3 }),
      sharedFact("c", { incomingAmount: 30, incomingCount: 3 }),
    ];
    const result = calculateSharedContributionWeights(facts, DEFAULT_SHARED_CONTRIBUTION_RULE);
    expect(result.map(({ incomingAmountShare }) => incomingAmountShare)).toEqual([1, 0, 0]);
    expect(result.map(({ incomingCountShare }) => incomingCountShare)).toEqual([1, 0, 0]);
    for (const key of ["outgoingShare", "incomingAmountShare", "incomingCountShare", "weight"] as const) {
      expect(result.reduce((sum, row) => sum + row[key], 0)).toBeCloseTo(1, 12);
    }
  });

  it("三项合并后20%均分保障只计一次，非贡献者仅得20%/人数", () => {
    const result = calculateSharedContributionWeights([
      sharedFact("a", { outgoingAmount: 100, outgoingCount: 10 }),
      sharedFact("b", { incomingAmount: 100, incomingCount: 10 }),
    ], DEFAULT_SHARED_CONTRIBUTION_RULE);
    expect(result[0]).toMatchObject({ outgoingShare: 1, incomingAmountShare: 1, incomingCountShare: 1 });
    expect(result[1]).toMatchObject({ outgoingShare: 0, incomingAmountShare: 0, incomingCountShare: 0 });
    expect(result.map(({ weight }) => weight)).toEqual([0.9, 0.1]);
    expect(result.reduce((sum, row) => sum + row.weight, 0)).toBe(1);
  });

  it("影响全部为0时回到旧定义的全体均分，有原始差异也不失效", () => {
    const facts = [sharedFact("a", { outgoingAmount: 100 }), sharedFact("b", { incomingAmount: 999 }), sharedFact("c")];
    const result = calculateSharedContributionWeights(facts, { outgoing: 0, incomingAmount: 0, incomingCount: 0 });
    for (const row of result) expect(row.weight).toBeCloseTo(1 / 3, 12);
    expect(result.reduce((sum, row) => sum + row.weight, 0)).toBeCloseTo(1, 12);
  });

  it("真实收支全0/全相同也按旧定义均分；缺失事实不能冒充0", () => {
    for (const facts of [[sharedFact("a"), sharedFact("b")], [sharedFact("a", { incomingAmount: 10, incomingCount: 2 }), sharedFact("b", { incomingAmount: 10, incomingCount: 2 })]]) {
      expect(calculateSharedContributionWeights(facts, DEFAULT_SHARED_CONTRIBUTION_RULE).map(({ weight }) => weight)).toEqual([0.5, 0.5]);
    }
    for (const invalid of [NaN, Infinity, undefined, null, "0"]) {
      const facts = [sharedFact("a", { outgoingAmount: invalid as number }), sharedFact("b")];
      expect(calculateSharedContributionWeights(facts, DEFAULT_SHARED_CONTRIBUTION_RULE)).toEqual([]);
    }
    expect(calculateSharedContributionWeights([], DEFAULT_SHARED_CONTRIBUTION_RULE)).toEqual([]);
  });

  it("相对影响强度只组合归一化份额，不改冻结历史收支", () => {
    const facts = freeze([sharedFact("a", { outgoingAmount: 100 }), sharedFact("b", { incomingAmount: 100 })]);
    const rule = freeze({ outgoing: 0.25, incomingAmount: 0.75, incomingCount: 0 });
    const before = structuredClone({ facts, rule });
    const result = calculateSharedContributionWeights(facts, rule);
    expect(result.map(({ weight }) => weight)).toEqual([0.9, 0.1]);
    expect({ facts, rule }).toEqual(before);
    for (const invalid of [-1, 1.1, NaN, Infinity]) {
      expect(calculateSharedContributionWeights(facts, { ...rule, outgoing: invalid })).toEqual([]);
    }
  });
});

function dimensionalFacts(): MarketContributionFacts {
  return marketFacts({ users: [marketUser(1), marketUser(2),
    marketUser(3, {
      ancestorUserIds: [1], hasActivity: true, cumulativeDeposit: 100, filledQuantityEth: 1,
      fundingFlows: [{ occurredAt: "2026-10-01T00:00:00Z", kind: "deposit", amount: 100 }],
    }),
    marketUser(4, {
      ancestorUserIds: [2], hasActivity: true, cumulativeDeposit: 300, filledQuantityEth: 3,
      fundingFlows: [{ occurredAt: "2026-10-01T00:00:00Z", kind: "deposit", amount: 300 }],
    }),
  ], outputs: [output({ id: "a", sourceUserId: 3, amount: 1000 }), output({ id: "b", sourceUserId: 4, amount: 3000 })] });
}

describe("T+0 市场贡献四维与祖先信用纯生产规则", () => {
  it("推荐人数/USDT资金/ETH交易/USDT输出四维先分别归一，权重守恒", () => {
    const rows = marketRows(dimensionalFacts());
    expect(rows[0]).toMatchObject({ weightedParticipants: 1, weightedCapital: 100, weightedTradingEth: 1, externalOutput: 1000 });
    expect(rows[0].weightPercentage).toBe(31.25);
    expect(rows[1].weightPercentage).toBe(68.75);
    expect(rows.reduce((sum, row) => sum + row.weightPercentage, 0)).toBe(100);
  });

  it("各量纲同比缩放不改变组合权重，不能把USDT/ETH数值直接相加", () => {
    const facts = dimensionalFacts();
    const original = marketRows(facts);
    const scaled = marketRows({ ...facts,
      users: facts.users.map((user) => ({ ...user, cumulativeDeposit: user.cumulativeDeposit * 1000000,
        fundingFlows: user.fundingFlows.map((flow) => ({ ...flow, amount: flow.amount * 1000000 })),
        filledQuantityEth: user.filledQuantityEth * 1000,
      })), outputs: facts.outputs.map((item) => ({ ...item, amount: item.amount / 100 })),
    });
    expect(scaled.map(({ weightPercentage }) => weightPercentage)).toEqual(original.map(({ weightPercentage }) => weightPercentage));
  });

  it("只合并开启且有贡献的维度，相对强度有效，空维度不稀释总权重", () => {
    const rows = marketRows(dimensionalFacts(), marketRule({ referrals: 1, capital: 0.5, trading: 0, output: 0 }));
    expect(rows[0].weightPercentage).toBeCloseTo((0.5 + 0.5 * 0.25) / 1.5 * 100, 12);
    const facts = dimensionalFacts();
    facts.outputs = [];
    const withoutOutput = marketRows(facts, marketRule({ referrals: 0, capital: 1, trading: 0, output: 1 }));
    expect(withoutOutput.map(({ weightPercentage }) => weightPercentage)).toEqual([25, 75]);
  });

  it("间推信用=0只给direct祖先，原始间推人数可核对但不得获权重", () => {
    const rows = marketRows(marketFacts(), marketRule({ indirectDecay: 0 }));
    expect(rows[0]).toMatchObject({ directParticipants: 0, indirectParticipants: 1, weightedParticipants: 0, weightedCapital: 0, weightedTradingEth: 0, externalOutput: 0, weightPercentage: 0 });
    expect(rows[1]).toMatchObject({ directParticipants: 1, weightedParticipants: 1, weightedCapital: 80, weightedTradingEth: 8, externalOutput: 80, weightPercentage: 100 });
  });

  it("间推信用=1在完整祖先链均摊，同一业务总信用不层层记满", () => {
    const rows = marketRows(marketFacts(), marketRule({ indirectDecay: 1 }));
    for (const row of rows) expect(row).toMatchObject({ weightedParticipants: 0.5, weightedCapital: 40, weightedTradingEth: 4, externalOutput: 40, weightPercentage: 50 });
    expect(rows.reduce((sum, row) => sum + row.weightedParticipants, 0)).toBe(1);
    expect(rows.reduce((sum, row) => sum + row.weightedCapital, 0)).toBe(80);
    expect(rows.reduce((sum, row) => sum + row.weightedTradingEth, 0)).toBe(8);
    expect(rows.reduce((sum, row) => sum + row.externalOutput, 0)).toBe(80);
  });

  it.each([0, 0.25, 0.5, 0.75, 1])("祖先衰减%s的每业务总贡献不超过原值，候选子集不重新放大信用", (indirectDecay) => {
    const facts = marketFacts();
    const rows = marketRows(facts, marketRule({ indirectDecay }));
    expect(rows.reduce((sum, row) => sum + row.weightedParticipants, 0)).toBeCloseTo(1, 12);
    expect(rows.reduce((sum, row) => sum + row.weightedCapital, 0)).toBeCloseTo(80, 12);
    expect(rows.reduce((sum, row) => sum + row.weightedTradingEth, 0)).toBeCloseTo(8, 12);
    expect(rows.reduce((sum, row) => sum + row.externalOutput, 0)).toBeCloseTo(80, 12);
    const subset = marketRows(facts, marketRule({ indirectDecay }), ["1"]);
    expect(subset[0].weightedCapital).toBe(rows[0].weightedCapital);
    expect(subset[0].weightedTradingEth).toBe(rows[0].weightedTradingEth);
    expect(subset[0].externalOutput).toBe(rows[0].externalOutput);
  });

  it("root本人、自己、root团队内的输出排除，仅真实外部输出计入", () => {
    const facts = marketFacts();
    facts.users.push(marketUser(4, { ancestorUserIds: [1] }), marketUser(5, { ancestorUserIds: [3, 2, 1] }));
    facts.outputs = [
      output({ id: "root", recipientUserId: 1, amount: 1000 }),
      output({ id: "self", recipientUserId: 3, recipientAncestorUserIds: [2, 1], amount: 1000 }),
      output({ id: "sibling", recipientUserId: 4, recipientAncestorUserIds: [1], amount: 1000 }),
      output({ id: "descendant", recipientUserId: 5, recipientAncestorUserIds: [3, 2, 1], amount: 1000 }),
      output({ id: "valid", amount: 80 }),
      output({ id: "future", amount: 1000, occurredAt: "2026-10-12T00:00:00Z" }),
    ];
    const rows = marketRows(facts, marketRule({ indirectDecay: 1 }), ["1"]);
    expect(rows[0].externalOutput).toBe(40);
  });

  it("无市场贡献时保持0而非给全体均分，所有四维关闭也保持0", () => {
    const facts = marketFacts({ users: [marketUser(1), marketUser(2)], outputs: [] });
    expect(marketRows(facts).map(({ weightPercentage }) => weightPercentage)).toEqual([0, 0]);
    expect(marketRows(marketFacts(), marketRule({ referrals: 0, capital: 0, trading: 0, output: 0 })).map(({ weightPercentage }) => weightPercentage)).toEqual([0, 0]);
    const mixed = marketRows(dimensionalFacts(), marketRule(), ["1", "2", "3"]);
    expect(mixed.find((row) => row.userId === "3")!.weightPercentage).toBe(0);
  });

  it("完整已解析外部recipient链可不在候选目录；带root链的未知recipient仍属内部", () => {
    const facts = marketFacts({ outputs: [output({ id: "known-external", amount: 80 }), output({ id: "outside-source-directory", recipientUserId: 999, recipientAncestorUserIds: [1], amount: 1000 })] });
    expect(marketRows(facts, marketRule({ indirectDecay: 1 }), ["1"])[0].externalOutput).toBe(40);
  });

  it.each([undefined, null, [99], [1, 1], [0], [1.5]])("未知recipient没有有效已解析链 %j 时fail-closed，不能冒充外部奖励", (chain) => {
    const facts = marketFacts({ outputs: [output({ recipientAncestorUserIds: chain as number[] })] });
    expectClosed(calculateMarketContributionScores(facts, marketRule()));
  });

  it("真实纯工具不改变冻结的用户链、资金flows、历史输出或规则", () => {
    const facts = freeze(marketFacts());
    const rule = freeze(marketRule());
    const before = structuredClone({ facts, rule });
    marketRows(facts, rule);
    expect({ facts, rule }).toEqual(before);
  });
});

describe("T+0 市场贡献留存截止时间与资金完整性纯生产规则", () => {
  it("按同一asOf与实际时刻积分，同日期内小时差不能被吞掉", () => {
    const facts = marketFacts({ asOf: "2026-10-05T00:00:00Z", outputs: [] });
    facts.users[2] = marketUser(3, {
      ancestorUserIds: [2, 1], cumulativeDeposit: 130, cumulativeWithdrawal: 40,
      fundingFlows: [
        { occurredAt: "2026-10-03T12:00:00Z", kind: "deposit", amount: 30 },
        { occurredAt: "2026-10-01T00:00:00Z", kind: "deposit", amount: 100 },
        { occurredAt: "2026-10-03T00:00:00Z", kind: "withdrawal", amount: 40 },
      ],
    });
    const rows = marketRows(facts, marketRule({ indirectDecay: 0, retentionInfluence: 1, retentionDays: 4 }));
    expect(rows[1].retainedCapitalDays).toBe(365);
    expect(rows[1].weightedCapital).toBe(365 / 4);
  });

  it("同一timestamp的入金/提现顺序不改变留存；窗口前资金正确带入", () => {
    const flows: MarketUser["fundingFlows"] = [
      { occurredAt: "2026-09-20T00:00:00Z", kind: "deposit", amount: 100 },
      { occurredAt: "2026-10-03T00:00:00Z", kind: "withdrawal", amount: 40 },
      { occurredAt: "2026-10-03T00:00:00Z", kind: "deposit", amount: 30 },
    ];
    const facts = marketFacts({ asOf: "2026-10-05T00:00:00Z", outputs: [] });
    facts.users[2] = marketUser(3, { ancestorUserIds: [2, 1], cumulativeDeposit: 130, cumulativeWithdrawal: 40, fundingFlows: flows });
    const rule = marketRule({ indirectDecay: 0, retentionInfluence: 1, retentionDays: 4 });
    const rows = marketRows(facts, rule);
    expect(rows[1].retainedCapitalDays).toBe(380);
    facts.users[2].fundingFlows = [flows[0], flows[2], flows[1]];
    expect(marketRows(facts, rule)[1].retainedCapitalDays).toBe(rows[1].retainedCapitalDays);
  });

  it("future flow保留在事实但不入累计或留存，恰好asOf的flow入累计而不制造时长", () => {
    const facts = marketFacts({ asOf: "2026-10-05T00:00:00Z", outputs: [] });
    facts.users[2] = marketUser(3, {
      ancestorUserIds: [2, 1], cumulativeDeposit: 120,
      fundingFlows: [
        { occurredAt: "2026-10-01T00:00:00Z", kind: "deposit", amount: 100 },
        { occurredAt: "2026-10-05T00:00:00Z", kind: "deposit", amount: 20 },
        { occurredAt: "2026-10-06T00:00:00Z", kind: "deposit", amount: 1000000000 },
      ],
    });
    const rows = marketRows(facts, marketRule({ indirectDecay: 0, retentionInfluence: 1, retentionDays: 4 }));
    expect(rows[1].teamDeposit).toBe(120);
    expect(rows[1].retainedCapitalDays).toBe(400);
    expect(rows[1].weightedCapital).toBe(100);
    facts.users[2].cumulativeDeposit += 1000000000;
    expectClosed(calculateMarketContributionScores(facts, marketRule()));
  });

  it("提现超过入金时资金留存不会成为负分或被误当本金余额", () => {
    const facts = marketFacts({ asOf: "2026-10-05T00:00:00Z", outputs: [] });
    facts.users[2] = marketUser(3, {
      ancestorUserIds: [2, 1], cumulativeDeposit: 100, cumulativeWithdrawal: 150,
      fundingFlows: [
        { occurredAt: "2026-09-20T00:00:00Z", kind: "deposit", amount: 100 },
        { occurredAt: "2026-10-03T00:00:00Z", kind: "withdrawal", amount: 150 },
      ],
    });
    const noRetention = marketRows(facts, marketRule({ indirectDecay: 0, retentionInfluence: 0, retentionDays: 4 }));
    expect(noRetention[1].weightedCapital).toBe(0);
    const retention = marketRows(facts, marketRule({ indirectDecay: 0, retentionInfluence: 1, retentionDays: 4 }));
    expect(retention[1].retainedCapitalDays).toBe(200);
    expect(retention[1].weightedCapital).toBe(50);
  });

  it("累计金额与逐笔flows不一致/遗漏时fail-closed，不用零补足缺失数据", () => {
    for (const mutate of [
      (facts: MarketContributionFacts) => { facts.users[2].fundingFlows = []; },
      (facts: MarketContributionFacts) => { facts.users[2].cumulativeDeposit += 1; },
      (facts: MarketContributionFacts) => { facts.users[2].cumulativeWithdrawal += 1; },
      (facts: MarketContributionFacts) => { facts.users[2].fundingFlows.pop(); },
      (facts: MarketContributionFacts) => { facts.users[2].fundingFlows = undefined as unknown as MarketUser["fundingFlows"]; },
      (facts: MarketContributionFacts) => { facts.users[2].cumulativeDeposit = undefined as unknown as number; },
    ]) {
      const facts = marketFacts();
      mutate(facts);
      expectClosed(calculateMarketContributionScores(facts, marketRule()));
    }
  });

  it("未完整读取/核算时点异常/未知目标候选时fail-closed", () => {
    for (const facts of [null, undefined, marketFacts({ complete: false }), marketFacts({ asOf: "invalid" })]) {
      expectClosed(calculateMarketContributionScores(facts, marketRule()));
    }
    expectClosed(calculateMarketContributionScores(marketFacts(), marketRule(), ["999"]));
  });

  it("重复用户/输出、未知来源、循环祖先、非法flow时fail-closed", () => {
    for (const mutate of [
      (facts: MarketContributionFacts) => { facts.users.push({ ...facts.users[0] }); },
      (facts: MarketContributionFacts) => { facts.outputs.push({ ...facts.outputs[0] }); },
      (facts: MarketContributionFacts) => { facts.outputs[0].sourceUserId = 999; },
      (facts: MarketContributionFacts) => { facts.users[2].ancestorUserIds = [3]; },
      (facts: MarketContributionFacts) => { facts.users[2].ancestorUserIds = [1, 1]; },
      (facts: MarketContributionFacts) => { facts.users[2].fundingFlows[0].occurredAt = "invalid"; },
      (facts: MarketContributionFacts) => { facts.users[2].fundingFlows[0].amount = -1; },
      (facts: MarketContributionFacts) => { facts.users[2].fundingFlows[0].kind = "transfer" as "deposit"; },
      (facts: MarketContributionFacts) => { facts.outputs[0].amount = NaN; },
      (facts: MarketContributionFacts) => { facts.outputs[0].recipientUserId = 0; },
    ]) {
      const facts = marketFacts();
      mutate(facts);
      expectClosed(calculateMarketContributionScores(facts, marketRule()));
    }
  });

  it("market规则非法强度/非整数留存天数不试算", () => {
    for (const rule of [marketRule({ indirectDecay: -1 }), marketRule({ retentionInfluence: 1.1 }),
      marketRule({ referrals: NaN }), marketRule({ capital: Infinity }),
      marketRule({ retentionDays: 0 }), marketRule({ retentionDays: 366 }), marketRule({ retentionDays: 1.5 }),
    ]) expectClosed(calculateMarketContributionScores(marketFacts(), rule));
  });
});

describe("T+0 shared生产工具AST隔离边界（不加载server模块）", () => {
  it.each(sharedFiles)("%s只含纯声明，无模块依赖/动态import/require或顶层执行", (file) => {
    const source = readFileSync(new URL(`../shared/${file}`, import.meta.url), "utf8");
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    expect(nodes(ast, ts.isImportDeclaration)).toEqual([]);
    expect(nodes(ast, ts.isImportEqualsDeclaration)).toEqual([]);
    expect(nodes(ast, ts.isExportDeclaration).filter((node) => node.moduleSpecifier)).toEqual([]);
    expect(nodes(ast, ts.isCallExpression).filter((node) => node.expression.kind === ts.SyntaxKind.ImportKeyword
      || (ts.isIdentifier(node.expression) && node.expression.text === "require"))).toEqual([]);
    expect(ast.statements.every((node) => ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node)
      || ts.isFunctionDeclaration(node) || ts.isVariableStatement(node))).toBe(true);
    for (const statement of ast.statements.filter(ts.isVariableStatement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (declaration.initializer) {
          const eagerExpressions: string[] = [];
          const visitInitializer = (node: ts.Node) => {
            // 定义纯函数不会执行函数体；IIFE的外层CallExpression仍会被检测。
            if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) return;
            if (ts.isCallExpression(node) || ts.isNewExpression(node)) eagerExpressions.push(node.getText(ast));
            ts.forEachChild(node, visitInitializer);
          };
          visitInitializer(declaration.initializer);
          expect(eagerExpressions).toEqual([]);
        }
      }
    }
  });
});
