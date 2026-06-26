/**
 * Black-Scholes 期权定价模型
 * 用于计算期权价格、希腊字母及P&L曲线
 */

/**
 * 标准正态分布累积分布函数
 * 使用 Horner's method 多项式近似，精度 < 1.5e-7
 */
export function normalCDF(x: number): number {
  // Rational approximation for the complementary error function
  const t = 1.0 / (1.0 + 0.2316419 * Math.abs(x));
  const d = 0.3989422820 * Math.exp(-x * x / 2);
  const poly = t * (0.3193815 + t * (-0.3565638 + t * (1.7814779 + t * (-1.8212560 + t * 1.3302744))));
  const p = 1 - d * poly;
  return x >= 0 ? p : 1 - p;
}

/** 标准正态分布概率密度函数 */
export function normalPDF(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

export interface BSParams {
  S: number;   // 标的资产当前价格
  K: number;   // 行权价
  T: number;   // 到期时间（年）
  r: number;   // 无风险利率（年化）
  sigma: number; // 隐含波动率（年化）
  type: "call" | "put";
}

export interface BSResult {
  price: number;
  delta: number;
  gamma: number;
  theta: number; // 每日Theta（除以365）
  vega: number;  // 1%波动率变化对应的价格变化
  d1: number;
  d2: number;
}

/**
 * Black-Scholes 定价与希腊字母计算
 */
export function blackScholes(params: BSParams): BSResult {
  const { S, K, T, r, sigma, type } = params;

  // 防止除零
  if (T <= 0 || sigma <= 0 || S <= 0 || K <= 0) {
    const intrinsic =
      type === "call" ? Math.max(S - K, 0) : Math.max(K - S, 0);
    return { price: intrinsic, delta: 0, gamma: 0, theta: 0, vega: 0, d1: 0, d2: 0 };
  }

  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;

  let price: number;
  let delta: number;

  if (type === "call") {
    price = S * normalCDF(d1) - K * Math.exp(-r * T) * normalCDF(d2);
    delta = normalCDF(d1);
  } else {
    price = K * Math.exp(-r * T) * normalCDF(-d2) - S * normalCDF(-d1);
    delta = normalCDF(d1) - 1;
  }

  const gamma = normalPDF(d1) / (S * sigma * sqrtT);
  // Theta: 年化 → 日化（除以365）
  const thetaAnnual =
    type === "call"
      ? -(S * normalPDF(d1) * sigma) / (2 * sqrtT) - r * K * Math.exp(-r * T) * normalCDF(d2)
      : -(S * normalPDF(d1) * sigma) / (2 * sqrtT) + r * K * Math.exp(-r * T) * normalCDF(-d2);
  const theta = thetaAnnual / 365;

  // Vega: 1%波动率变化
  const vega = (S * normalPDF(d1) * sqrtT) / 100;

  return { price, delta, gamma, theta, vega, d1, d2 };
}

export interface PositionForCalc {
  contractType: "call" | "put";
  direction: "long" | "short";
  strikePrice: number;
  entryPrice: number;
  quantity: number;
  expiryDate: string; // YYYY-MM-DD
}

export interface GreeksSummary {
  netDelta: number;
  netGamma: number;
  netTheta: number;
  netVega: number;
  totalCost: number;
  totalPositions: number;
}

/**
 * 计算组合希腊字母汇总
 */
export function calcPortfolioGreeks(
  positions: PositionForCalc[],
  ethPrice: number,
  iv: number,
  riskFreeRate: number
): GreeksSummary {
  let netDelta = 0;
  let netGamma = 0;
  let netTheta = 0;
  let netVega = 0;
  let totalCost = 0;

  const now = new Date();

  for (const pos of positions) {
    const expiryMs = new Date(pos.expiryDate).getTime();
    const T = Math.max((expiryMs - now.getTime()) / (1000 * 60 * 60 * 24 * 365), 0);
    const sign = pos.direction === "long" ? 1 : -1;
    const qty = pos.quantity;

    const bs = blackScholes({
      S: ethPrice,
      K: pos.strikePrice,
      T,
      r: riskFreeRate,
      sigma: iv,
      type: pos.contractType,
    });

    netDelta += sign * bs.delta * qty;
    netGamma += sign * bs.gamma * qty;
    netTheta += sign * bs.theta * qty;
    netVega  += sign * bs.vega  * qty;
    totalCost += pos.entryPrice * qty * (pos.direction === "long" ? 1 : -1);
  }

  return {
    netDelta,
    netGamma,
    netTheta,
    netVega,
    totalCost,
    totalPositions: positions.length,
  };
}

/**
 * 计算到期P&L曲线（在到期日时，期权价值 = 内在价值）
 * 返回 [ethPrice, pnl] 数组
 */
export function calcExpiryPnL(
  positions: PositionForCalc[],
  priceRange: [number, number],
  steps = 100
): Array<{ price: number; pnl: number }> {
  const [minP, maxP] = priceRange;
  const step = (maxP - minP) / steps;
  const result: Array<{ price: number; pnl: number }> = [];

  for (let i = 0; i <= steps; i++) {
    const S = minP + i * step;
    let totalPnL = 0;

    for (const pos of positions) {
      const sign = pos.direction === "long" ? 1 : -1;
      const qty = pos.quantity;
      // 到期内在价值
      const intrinsic =
        pos.contractType === "call"
          ? Math.max(S - pos.strikePrice, 0)
          : Math.max(pos.strikePrice - S, 0);
      // P&L = (到期价值 - 开仓成本) × 方向 × 数量
      const pnl = sign * (intrinsic - pos.entryPrice) * qty;
      totalPnL += pnl;
    }

    result.push({ price: parseFloat(S.toFixed(2)), pnl: parseFloat(totalPnL.toFixed(2)) });
  }

  return result;
}
