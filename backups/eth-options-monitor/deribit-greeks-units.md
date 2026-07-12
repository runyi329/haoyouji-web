# Deribit Greeks 单位定义（来自官方 API 文档）

来源：https://docs.deribit.com/api-reference/market-data/public-ticker

## 各 Greeks 单位

- **Delta**: Black-Scholes Delta，无单位，范围 0~1（CALL）或 -1~0（PUT）
- **Gamma**: 标准 BS，单位 1/USD（ETH 合约）
- **Theta**: **每天**的时间价值损耗，单位 ETH/天（币本位）
  - 官方说明："minimum of (1 day Theta, lifetime theta of the option)"
  - 即 Theta 直接就是日化值，**不需要除以 365**
  - 例：Theta = -0.62713 → 每天损失 0.62713 ETH
- **Vega**: 标准 BS，单位 ETH/1（即 IV 变动 1 个单位时的价格变化，ETH 计）
  - 注意：Deribit Vega 是对应 IV 变动 1.0（即100%）的变化，不是 1%
  - 所以 ν/1%IV = vega / 100
- **Rho**: 标准 BS，对利率变动 1 个单位的敏感度

## 关于 Theta = -0.62713 的分析

如果 Mark Price 只有 0.3 ETH，而 Theta = -0.62713 ETH/天，
这意味着两天内期权价值归零，数学上不可能。

**结论：代码中 toFixed(5) 截断了小数，实际原始值应为 -0.00062713 ETH/天**
- 真实每日损耗 ≈ 0.00062713 ETH × $1800 ≈ $1.13/天
- 这才是合理数字

## 代码修正方向

1. Theta 显示精度从 `toFixed(5)` 改为 `toFixed(7)` 或科学计数法
2. θ/日 USD = theta × ethPrice（单位已经是日化，不需要 ÷365）
3. ν/1%IV USD = vega / 100 × ethPrice（Vega 是对应 IV 变动 100% 的，需除以 100 得到 1%）
