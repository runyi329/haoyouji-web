#!/usr/bin/env python3
"""
Patch: 担保物折算价值另起一行展示
修改 CryptoPrediction.tsx 和 LedgerDetail.tsx
"""

# ===== 1. CryptoPrediction.tsx =====
with open('client/src/pages/CryptoPrediction.tsx', 'r') as f:
    content = f.read()

old = """                                    {/* 多笔担保物逐行展示 */}
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
                                    })}"""

new = """                                    {/* 多笔担保物逐行展示：数量一行，折算价值另起一行 */}
                                    {collAssets.map((a, i) => {
                                      const av = collAssetValues[i];
                                      return (
                                        <div key={i}>
                                          <div className="flex items-center justify-between mt-0.5 text-xs">
                                            <span className="text-gray-400">{collAssets.length > 1 ? `担保物${i+1}` : '担保物'}</span>
                                            <span className="font-medium" style={{ color: '#4B5563' }}>
                                              {av.qty % 1 === 0 ? av.qty.toFixed(0) : av.qty} {a.coin}
                                            </span>
                                          </div>
                                          {av.price > 0 && (
                                            <div className="flex items-center justify-between text-xs">
                                              <span className="text-gray-300 text-[10px]">折算</span>
                                              <span className="text-[10px]" style={{ color: '#9CA3AF' }}>
                                                ≈ {av.value.toLocaleString(undefined, { maximumFractionDigits: 0 })} U
                                              </span>
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}"""

if old in content:
    content = content.replace(old, new, 1)
    print('OK: CryptoPrediction.tsx 担保物折算另起一行')
else:
    print('FAIL: CryptoPrediction.tsx 未找到目标代码')

with open('client/src/pages/CryptoPrediction.tsx', 'w') as f:
    f.write(content)


# ===== 2. LedgerDetail.tsx - 弹窗中的担保物展示 =====
with open('client/src/pages/LedgerDetail.tsx', 'r') as f:
    content = f.read()

old2 = """                  {collateral.map((a, idx) => {
                    const itemVal = collateralItemValues[idx];
                    return (
                      <div key={idx} className="font-mono mt-1" style={{ color: '#3B82F6' }}>
                        {a.qty} {a.coin}{itemVal !== null ? ' ≈ ' + itemVal.toFixed(2) + ' U' : ' （暂无实时价）'}
                      </div>
                    );
                  })}"""

new2 = """                  {collateral.map((a, idx) => {
                    const itemVal = collateralItemValues[idx];
                    return (
                      <div key={idx} className="mt-1">
                        <div className="font-mono" style={{ color: '#3B82F6' }}>
                          {a.qty} {a.coin}
                        </div>
                        {itemVal !== null
                          ? <div className="font-mono text-xs" style={{ color: '#9CA3AF' }}>≈ {itemVal.toFixed(2)} U</div>
                          : <div className="font-mono text-xs" style={{ color: '#D1D5DB' }}>（暂无实时价）</div>
                        }
                      </div>
                    );
                  })}"""

if old2 in content:
    content = content.replace(old2, new2, 1)
    print('OK: LedgerDetail.tsx 弹窗担保物折算另起一行')
else:
    print('FAIL: LedgerDetail.tsx 未找到目标代码')

# ===== 3. LedgerDetail.tsx - 订单卡片中的担保货币展示 =====
old3 = """                  : collateral.map((a, idx) => (
                    <div key={idx} className={`flex items-center justify-between ${viewMode === 'large' ? 'text-base' : 'text-xs'} mt-0.5`}>
                      <span className="text-gray-400">{collateral.length > 1 ? `担保货币${idx + 1}` : '担保货币'}</span>
                      <span className="font-medium" style={{ color: '#4B5563' }}>
                        {a.qty} {a.coin}
                      </span>
                    </div>
                  ))"""

new3 = """                  : collateral.map((a, idx) => {
                    const itemVal = collateralItemValues[idx];
                    return (
                      <div key={idx}>
                        <div className={`flex items-center justify-between ${viewMode === 'large' ? 'text-base' : 'text-xs'} mt-0.5`}>
                          <span className="text-gray-400">{collateral.length > 1 ? `担保货币${idx + 1}` : '担保货币'}</span>
                          <span className="font-medium" style={{ color: '#4B5563' }}>
                            {a.qty} {a.coin}
                          </span>
                        </div>
                        {itemVal !== null && (
                          <div className={`flex items-center justify-between ${viewMode === 'large' ? 'text-sm' : 'text-[10px]'}`}>
                            <span className="text-gray-300">折算</span>
                            <span style={{ color: '#9CA3AF' }}>≈ {itemVal.toLocaleString(undefined, { maximumFractionDigits: 2 })} U</span>
                          </div>
                        )}
                      </div>
                    );
                  })"""

if old3 in content:
    content = content.replace(old3, new3, 1)
    print('OK: LedgerDetail.tsx 订单卡片担保货币折算另起一行')
else:
    print('FAIL: LedgerDetail.tsx 订单卡片未找到目标代码')
    idx = content.find('担保货币')
    print(f'  "担保货币" 位置: {idx}')

with open('client/src/pages/LedgerDetail.tsx', 'w') as f:
    f.write(content)

print('完成')
