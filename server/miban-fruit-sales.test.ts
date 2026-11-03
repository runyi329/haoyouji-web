import { describe, expect, it } from "vitest";
import {
  aggregateFruitSales,
  type FruitSalesOrder,
} from "../shared/miban-fruit-sales";

const MAJIAYOU = "guangfeng-majiayou";
const PEAR = "tiangui-pear";
const pearSpecs = [
  { name: "12枚礼盒装", sub: "单果250–350g · 12个精选 · 精品礼盒", weightJin: 7 },
  { name: "10斤礼盒装", sub: "单果150–500g · 约20个 · 家庭实惠", weightJin: 10 },
];
const majiayou = (skuId = "majiayou-large-6", quantity = 1) => ({
  kind: "limited_product",
  productKey: MAJIAYOU,
  skuId,
  quantity,
});
const paid = (ingredients: unknown, extra: Partial<FruitSalesOrder> = {}): FruitSalesOrder => ({
  ingredients,
  status: "pending",
  walletDeductCny: "188.00",
  walletDeductUsdt: "0",
  ...extra,
});
const legacyPear = (specName: string, quantity = 1, weightJin = 7) =>
  paid(
    [{ riceId: 47, name: "天桂梨", weightJin: weightJin * quantity }],
    {
      recipeName: `天桂梨 · ${specName}${quantity > 1 ? ` x${quantity}` : ""}`,
      totalWeightJin: String(weightJin * quantity),
    }
  );
const exact = (soldPieces: number, unresolvedOrders = 0) => ({
  soldPieces,
  estimated: false,
  unresolvedOrders,
});

describe("aggregateFruitSales 马家柚逐行颗数", () => {
  it("两箱6个装计12颗，不是2笔或2箱", () => {
    expect(aggregateFruitSales([paid([majiayou("majiayou-large-6", 2)])])[MAJIAYOU])
      .toEqual(exact(12));
  });

  it.each([
    ["majiayou-large-6", 6],
    ["majiayou-small-4", 4],
    ["majiayou-medium-2", 2],
    ["majiayou-small-2", 2],
    ["majiayou-large-2", 2],
  ])("历史SKU %s固定为每箱%i颗", (skuId, pieces) => {
    expect(aggregateFruitSales([paid([majiayou(skuId, 2)])])[MAJIAYOU])
      .toEqual(exact(pieces * 2));
  });

  it("不同SKU、多个订单的颗数累加", () => {
    const orders = [
      paid([majiayou("majiayou-large-6", 2), majiayou("majiayou-small-4", 3)]),
      paid([majiayou("majiayou-medium-2", 2)]),
    ];
    expect(aggregateFruitSales(orders)[MAJIAYOU]).toEqual(exact(28));
  });

  it.each([false, true])("混合订单只统计对应行，JSON序列化=%s", serialize => {
    const lines = [
      { productKey: "herbalife-red-ginseng", quantity: 99, fruitCountPerUnit: 30 },
      majiayou("majiayou-small-4", 2),
      { productKey: PEAR, skuName: "12枚礼盒装", quantity: 2 },
    ];
    const summary = aggregateFruitSales([
      paid(serialize ? JSON.stringify(lines) : lines, { totalWeightJin: "103" }),
    ]);
    expect(summary[MAJIAYOU]).toEqual(exact(8));
    expect(summary[PEAR]).toEqual(exact(24));
  });

  it.each(["fruitCountPerUnit", "piecesPerUnit"])("%s不可变快照优先于SKU与规格名", field => {
    const line = { ...majiayou("majiayou-large-6", 2), skuName: "大果 6个装", [field]: 8 };
    expect(aggregateFruitSales([paid([line])])[MAJIAYOU]).toEqual(exact(16));
  });

  it("果数快照兼容数字字符串", () => {
    expect(aggregateFruitSales([paid([{ ...majiayou(), fruitCountPerUnit: "9", quantity: "2" }])])[MAJIAYOU])
      .toEqual(exact(18));
  });

  it("历史规格快照优先于固定SKU映射，未知旧SKU也可按明确规格计数", () => {
    const lines = [
      { ...majiayou("majiayou-large-6", 2), skuName: "历史大果 4个装" },
      { ...majiayou("retired-sku", 3), skuName: "精选 2颗装", netContentText: "2颗装 · 约7斤/箱" },
    ];
    expect(aggregateFruitSales([paid(lines)])[MAJIAYOU]).toEqual(exact(14));
  });

  it("下架SKU仍统计，且不修改输入", () => {
    const line = Object.freeze({ ...majiayou("majiayou-small-2", 3), active: false });
    const order = Object.freeze(paid(Object.freeze([line])));
    expect(aggregateFruitSales(Object.freeze([order]))[MAJIAYOU]).toEqual(exact(6));
    expect(line.quantity).toBe(3);
  });

  it("同单多条无法解析只计一次未解析，并保留可解析行销量", () => {
    const lines = [majiayou(), majiayou("unknown", 5), majiayou("other-unknown", 2)];
    expect(aggregateFruitSales([paid(lines, { totalWeightJin: "12" })])[MAJIAYOU])
      .toEqual(exact(6, 1));
  });

  it("无对应行数量不能用订单总数量替代", () => {
    const { quantity: _quantity, ...line } = majiayou();
    expect(aggregateFruitSales([paid([line], { totalWeightJin: "2" })])[MAJIAYOU])
      .toEqual(exact(0, 1));
  });

  it.each([0, -1, 1.5, "bad", Infinity])("非法quantity %s不计颗数", quantity => {
    expect(aggregateFruitSales([paid([{ ...majiayou(), quantity }])])[MAJIAYOU])
      .toEqual(exact(0, 1));
  });

  it("无效明确快照和冲突规格不回退猜测", () => {
    const orders = [
      paid([{ ...majiayou(), fruitCountPerUnit: 0 }]),
      paid([{ ...majiayou(), skuName: "4个装", netContentText: "6个装" }]),
      paid([{ ...majiayou(), skuName: "4–6个装" }]),
    ];
    expect(aggregateFruitSales(orders)[MAJIAYOU]).toEqual(exact(0, 3));
  });
});

describe("aggregateFruitSales 已付款/履约口径", () => {
  it.each(["cancelled", "canceled"])("取消%s即使已扣款也排除", status => {
    expect(aggregateFruitSales([paid([majiayou()], { status })])[MAJIAYOU])
      .toEqual(exact(0));
  });

  it.each(["pending", "unknown", null])("未付款且状态%s不计入销量或未解析", status => {
    expect(aggregateFruitSales([paid([majiayou("unknown")], {
      status, walletDeductCny: "0", walletDeductUsdt: null,
    })])[MAJIAYOU]).toEqual(exact(0));
  });

  it.each(["confirmed", "packing", "shipped", "delivered"])("履约状态%s无钱包实扣记录仍计入", status => {
    expect(aggregateFruitSales([paid([majiayou()], {
      status, walletDeductCny: "0", walletDeductUsdt: "0",
    })])[MAJIAYOU]).toEqual(exact(6));
  });

  it("pending只要人民币或USDT有正数实扣就计入", () => {
    expect(aggregateFruitSales([
      paid([majiayou()]),
      paid([majiayou()], { walletDeductCny: "0", walletDeductUsdt: "0.01" }),
      paid([majiayou()], { walletDeductCny: "invalid", walletDeductUsdt: "-1" }),
      paid([majiayou()], { walletDeductCny: "188oops", walletDeductUsdt: "0" }),
    ])[MAJIAYOU]).toEqual(exact(12));
  });
});

describe("aggregateFruitSales 历史天桂梨", () => {
  it("12枚礼盒装 x2为24颗，无需依赖当前规格", () => {
    expect(aggregateFruitSales([legacyPear("12枚礼盒装", 2)])[PEAR]).toEqual(exact(24));
  });

  it.each(["x", "X", "×"])("标题尾部%s2都表示两盒，JSON字符串兼容", sign => {
    const order = legacyPear("12枚礼盒装", 2);
    order.recipeName = `天桂梨 · 12枚礼盒装 ${sign}2`;
    order.ingredients = JSON.stringify(order.ingredients);
    expect(aggregateFruitSales([order], pearSpecs)[PEAR]).toEqual(exact(24));
  });

  it("10斤规格仅约20个，两箱计约40颗并标记估算", () => {
    expect(aggregateFruitSales([legacyPear("10斤礼盒装", 2, 10)], pearSpecs)[PEAR])
      .toEqual({ soldPieces: 40, estimated: true, unresolvedOrders: 0 });
  });

  it("只要混合了估算销量，汇总必须保留estimated", () => {
    expect(aggregateFruitSales([
      legacyPear("10斤礼盒装", 2, 10), legacyPear("12枚礼盒装"),
    ], pearSpecs)[PEAR]).toEqual({ soldPieces: 52, estimated: true, unresolvedOrders: 0 });
  });

  it("历史标题自己包含约20个时也不能标为精确", () => {
    expect(aggregateFruitSales([legacyPear("10斤礼盒装（约20个）", 2, 10)])[PEAR])
      .toEqual({ soldPieces: 40, estimated: true, unresolvedOrders: 0 });
  });

  it("规格缺失不能从钱、总重量或当前其他规格反推果数", () => {
    const missing = legacyPear("家庭装", 2, 10);
    expect(aggregateFruitSales([missing], pearSpecs)[PEAR]).toEqual(exact(0, 1));
    expect(aggregateFruitSales([legacyPear("10斤礼盒装", 2, 10)], [
      { name: "10斤礼盒装", sub: "单果150–500g · 家庭实惠", weightJin: 10 },
    ])[PEAR]).toEqual(exact(0, 1));
  });

  it("仅安全匹配完整规格名，并核对历史重量一致", () => {
    const orders = [
      legacyPear("10斤礼盒", 2, 10),
      legacyPear("10斤礼盒装", 2, 8),
    ];
    expect(aggregateFruitSales(orders, pearSpecs)[PEAR]).toEqual(exact(0, 2));
    expect(aggregateFruitSales([legacyPear("10斤礼盒装", 2, 10)], [
      ...pearSpecs, { name: "10斤礼盒装", sub: "约30个", weightJin: 10 },
    ])[PEAR]).toEqual(exact(0, 1));
  });

  it("范围颗数、无效尾部数量不猜", () => {
    const orders = ["10–12枚礼盒装", "12枚礼盒装 x0", "12枚礼盒装 x2.5"]
      .map(name => legacyPear(name));
    expect(aggregateFruitSales(orders, pearSpecs)[PEAR]).toEqual(exact(0, 3));
  });

  it("riceId=47但不是天桂梨不误计；标题单独存在且缺行记录未解析", () => {
    expect(aggregateFruitSales([paid([{ riceId: 47, name: "其他食品", weightJin: 7 }])], pearSpecs)[PEAR])
      .toEqual(exact(0));
    expect(aggregateFruitSales([paid([], { recipeName: "天桂梨 · 12枚礼盒装" })], pearSpecs)[PEAR])
      .toEqual(exact(0, 1));
  });

  it("混合历史订单不拿其他商品总重量折算梨颗数", () => {
    const order = legacyPear("10斤礼盒装", 2, 10);
    order.ingredients = [...(order.ingredients as object[]), majiayou()];
    order.totalWeightJin = "21";
    const sales = aggregateFruitSales([order], pearSpecs);
    expect(sales[MAJIAYOU]).toEqual(exact(6));
    expect(sales[PEAR]).toEqual({ soldPieces: 40, estimated: true, unresolvedOrders: 0 });
  });
});

describe("aggregateFruitSales 数据容错", () => {
  it.each(["{broken-json", "null", "{}", undefined])("坏JSON/非数组%s不崩并保留已识别水果未解析", ingredients => {
    const result = aggregateFruitSales([
      paid(ingredients, { recipeName: "广丰马家柚 · 大果 6个装" }),
      paid(ingredients, { recipeName: "天桂梨 · 12枚礼盒装" }),
      paid(ingredients, { recipeName: "普通大米" }),
    ], pearSpecs);
    expect(result[MAJIAYOU]).toEqual(exact(0, 1));
    expect(result[PEAR]).toEqual(exact(0, 1));
  });

  it("数组中空行和非对象行不会崩溃", () => {
    expect(aggregateFruitSales([paid([null, "bad", 47, [], majiayou()])])[MAJIAYOU])
      .toEqual(exact(6));
  });

  it("空订单返回两个固定键及完整字段", () => {
    expect(aggregateFruitSales([])).toEqual({
      [MAJIAYOU]: exact(0), [PEAR]: exact(0),
    });
  });
});
