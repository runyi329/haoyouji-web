#!/usr/bin/env python3
"""
Patch: CryptoPrediction.tsx 融资付息卡片支持多笔担保物汇总
"""

with open('client/src/pages/CryptoPrediction.tsx', 'r') as f:
    content = f.read()

# 替换担保物计算和展示区域
# 旧代码：只读单笔 collateral_coin / collateral_qty
old_collateral_block = """                              {(() => {
                                const collCoin = order.collateral_coin;
                                const collQty = parseFloat(order.collateral_qty || '0');
                                const hasCollateral = collCoin && collQty > 0;
                                const collPrice = hasCollateral ? (financeLivePrices[collCoin] || 0) : 0;
                                const collValue = collQty * collPrice;
                                const financeType = order.finance_type || '保本分成';
                                // 担保缺口计算：
                                // 保本分成：净担保价值（担保价值 - 已产生利息）- 基数（买入价值 × 24%）
                                //   净担保价值 >= 基数 → 超过100%；否则显示负缺口（红色）
                                // 自负盈亏：当前市值 + 担保价值 - 买入价值（原逻辑）
                                let gap: number | null = null;
                                if (hasCollateral && collPrice > 0) {
                                  if (financeType === '保本分成') {
                                    // 基数 = 买入价值 × 24%
                                    const base = buyValue * 0.24;
                                    // 代付利息 = 待付利息（负利率时为代垫金额，即 unpaidInterest 的绝对值）
                                    // unpaidInterest 已是正数（isNegativeRate 时代表代付金额）
                                    const advancedInterest = isNegativeRate ? unpaidInterest : 0;
                                    // 净担保价值 = 担保价值 - 代付利息
                                    const netCollValue = collValue - advancedInterest;
                                    // 缺口 = 净担保价值 - 基数（负数表示不足）
                                    gap = netCollValue - base;
                                  } else {
                                    // 自负盈亏：
                                    // USDT（稳定币）：担保价值 - 买入价值 - 待收利息
                                    // 其他币种：当前市值 + 担保价值 - 买入价值 - 待收利息
                                    if (order.coin === 'USDT') {
                                      gap = collValue - buyValue - unpaidInterest;
                                    } else if (coinPrice > 0) {
                                      gap = marketValue + collValue - buyValue - unpaidInterest;
                                    }
                                  }
                                }
                                const _isSoldOrder = String(order.admin_note || '').includes('[已卖出]');
                                if (_isSoldOrder) return null;
                                return hasCollateral ? (
                                  <>
                                    <div className="flex items-center justify-between mt-0.5 text-xs">
                                      <span className="text-gray-400">担保利息</span>
                                      <span className="font-medium" style={{ color: '#4B5563' }}>
                                        {collQty % 1 === 0 ? collQty.toFixed(0) : collQty}{collCoin}
                                      </span>
                                    </div>
                                    <div className="flex items-center justify-between mt-0.5 text-xs">
                                      <span className="text-gray-400">担保价值</span>
                                      <span className="font-medium" style={{ color: '#4B5563' }}>
                                        {collPrice > 0 ? `${collValue.toLocaleString(undefined, { maximumFractionDigits: 0 })} U` : '---'}
                                      </span>
                                    </div>"""

new_collateral_block = """                              {(() => {
                                // 多笔担保物：优先读 collateral_assets，兼容旧单笔字段
                                let collAssets: { coin: string; qty: string }[] = [];
                                try {
                                  if (order.collateral_assets) collAssets = JSON.parse(order.collateral_assets);
                                } catch(e) {}
                                if (collAssets.length === 0 && order.collateral_coin && order.collateral_qty) {
                                  collAssets = [{ coin: order.collateral_coin, qty: String(parseFloat(order.collateral_qty)) }];
                                }
                                const hasCollateral = collAssets.length > 0;
                                // 计算各笔担保价值和总担保价值
                                const collAssetValues = collAssets.map(a => {
                                  const qty = parseFloat(a.qty || '0');
                                  const price = financeLivePrices[a.coin] || 0;
                                  return { coin: a.coin, qty, price, value: qty * price };
                                });
                                const collValue = collAssetValues.reduce((s, a) => s + a.value, 0);
                                const allPricesLoaded = collAssets.length === 0 || collAssetValues.every(a => a.price > 0);
                                // 兼容旧变量（弹窗计算用）
                                const collCoin = order.collateral_coin || (collAssets[0]?.coin ?? '');
                                const collQty = parseFloat(order.collateral_qty || collAssets[0]?.qty || '0');
                                const collPrice = financeLivePrices[collCoin] || 0;
                                const financeType = order.finance_type || '保本分成';
                                // 担保缺口计算（多笔汇总）
                                let gap: number | null = null;
                                if (hasCollateral && allPricesLoaded) {
                                  if (financeType === '保本分成') {
                                    const base = buyValue * 0.24;
                                    const advancedInterest = isNegativeRate ? unpaidInterest : 0;
                                    const netCollValue = collValue - advancedInterest;
                                    gap = netCollValue - base;
                                  } else {
                                    if (order.coin === 'USDT') {
                                      gap = collValue - buyValue - unpaidInterest;
                                    } else if (coinPrice > 0) {
                                      gap = marketValue + collValue - buyValue - unpaidInterest;
                                    }
                                  }
                                }
                                const _isSoldOrder = String(order.admin_note || '').includes('[已卖出]');
                                if (_isSoldOrder) return null;
                                return hasCollateral ? (
                                  <>
                                    {/* 多笔担保物逐行展示 */}
                                    {collAssets.map((a, i) => {
                                      const av = collAssetValues[i];
                                      return (
                                        <div key={i} className="flex items-center justify-between mt-0.5 text-xs">
                                          <span className="text-gray-400">{collAssets.length > 1 ? `担保物${i+1}` : '担保物'}</span>
                                          <span className="font-medium" style={{ color: '#4B5563' }}>
                                            {av.qty % 1 === 0 ? av.qty.toFixed(0) : av.qty} {a.coin}
                                            {av.price > 0 ? ` ≈ ${av.value.toLocaleString(undefined, { maximumFractionDigits: 0 })} U` : ''}
                                          </span>
                                        </div>
                                      );
                                    })}
                                    <div className="flex items-center justify-between mt-0.5 text-xs">
                                      <span className="text-gray-400">担保价值{collAssets.length > 1 ? '(合计)' : ''}</span>
                                      <span className="font-medium" style={{ color: '#4B5563' }}>
                                        {allPricesLoaded && collValue > 0 ? `${collValue.toLocaleString(undefined, { maximumFractionDigits: 0 })} U` : '---'}
                                      </span>
                                    </div>"""

if old_collateral_block in content:
    content = content.replace(old_collateral_block, new_collateral_block, 1)
    print('OK: 多笔担保物计算和展示替换成功')
else:
    print('FAIL: 未找到担保物代码块')
    # 调试
    idx = content.find('const collCoin = order.collateral_coin;')
    print(f'  collCoin 位置: {idx}')

with open('client/src/pages/CryptoPrediction.tsx', 'w') as f:
    f.write(content)

print('CryptoPrediction.tsx 修改完成')
