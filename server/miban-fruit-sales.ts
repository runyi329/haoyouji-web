import { aggregateFruitSales } from "../shared/miban-fruit-sales";

/** 仅执行固定 SELECT，可由正式路由与隔离只读预览共同使用。 */
export async function readMibanFruitSales(connection: {
  execute: (...args: any[]) => Promise<any>;
}) {
  const [orders] = await connection.execute(
    `SELECT recipeName, ingredients, status, walletDeductCny, walletDeductUsdt, totalWeightJin
       FROM miban_orders
      WHERE status <> 'cancelled'
        AND (recipeName LIKE ? OR CAST(ingredients AS CHAR) LIKE ?)` ,
    ["天桂梨%", "%guangfeng-majiayou%"],
  );
  // 下架规格仍用于解释历史订单，不依赖当前售卖开关。
  const [pearSpecs] = await connection.execute(
    `SELECT name, sub, weight_jin AS weightJin
       FROM miban_pear_specs
      WHERE product_key = ?`,
    ["tiangui-pear"],
  );
  return aggregateFruitSales(
    Array.isArray(orders) ? orders : [],
    Array.isArray(pearSpecs) ? pearSpecs : [],
  );
}
