#!/usr/bin/env python3
"""
Patch script: FinanceManagement.tsx 支持多笔担保物
"""

with open('client/src/pages/FinanceManagement.tsx', 'r') as f:
    content = f.read()

# ===== 1. formData 初始状态：添加 collateralAssets =====
old_default = """  collateralCoin: 'BTC' as CoinType,
  collateralQty: '',
  financeType: '保本分成' as '保本分成' | '自负盈亏',
};"""

new_default = """  collateralCoin: 'BTC' as CoinType,
  collateralQty: '',
  collateralAssets: [] as { coin: string; qty: string }[],
  financeType: '保本分成' as '保本分成' | '自负盈亏',
};"""

if old_default in content:
    content = content.replace(old_default, new_default, 1)
    print('1 OK: formData 添加 collateralAssets')
else:
    print('1 FAIL')

# ===== 2. 编辑订单时初始化 collateralAssets =====
old_edit_init = """      collateralCoin: (order.collateral_coin || 'BTC') as CoinType,
      collateralQty: order.collateral_qty ? String(parseFloat(order.collateral_qty)) : '',
      financeType: (order.finance_type || '保本分成') as '保本分成' | '自负盈亏',"""

new_edit_init = """      collateralCoin: (order.collateral_coin || 'BTC') as CoinType,
      collateralQty: order.collateral_qty ? String(parseFloat(order.collateral_qty)) : '',
      collateralAssets: (() => {
        try {
          if (order.collateral_assets) return JSON.parse(order.collateral_assets);
        } catch(e) {}
        // 兼容旧数据：将单笔 collateral_coin/qty 转为数组
        if (order.collateral_coin && order.collateral_qty) {
          return [{ coin: order.collateral_coin, qty: String(parseFloat(order.collateral_qty)) }];
        }
        return [];
      })(),
      financeType: (order.finance_type || '保本分成') as '保本分成' | '自负盈亏',"""

if old_edit_init in content:
    content = content.replace(old_edit_init, new_edit_init, 1)
    print('2 OK: 编辑时初始化 collateralAssets')
else:
    print('2 FAIL')

# ===== 3. handleSubmit：传递 collateralAssets =====
# 更新 updateMutation.mutate 调用
old_update_submit = """        collateralCoin: formData.collateralCoin || undefined,
        collateralQty: formData.collateralQty || undefined,
        financeType: formData.financeType,
      });
    } else {
      createMutation.mutate({"""

new_update_submit = """        collateralCoin: formData.collateralCoin || undefined,
        collateralQty: formData.collateralQty || undefined,
        collateralAssets: formData.collateralAssets.length > 0 ? formData.collateralAssets : undefined,
        financeType: formData.financeType,
      });
    } else {
      createMutation.mutate({"""

if old_update_submit in content:
    content = content.replace(old_update_submit, new_update_submit, 1)
    print('3a OK: updateMutation 传递 collateralAssets')
else:
    print('3a FAIL')

# 更新 createMutation.mutate 调用
old_create_submit = """        collateralCoin: formData.collateralCoin || undefined,
        collateralQty: formData.collateralQty || undefined,
        financeType: formData.financeType,
      });
    }
  }
  function handleAddPayment"""

new_create_submit = """        collateralCoin: formData.collateralCoin || undefined,
        collateralQty: formData.collateralQty || undefined,
        collateralAssets: formData.collateralAssets.length > 0 ? formData.collateralAssets : undefined,
        financeType: formData.financeType,
      });
    }
  }
  function handleAddPayment"""

if old_create_submit in content:
    content = content.replace(old_create_submit, new_create_submit, 1)
    print('3b OK: createMutation 传递 collateralAssets')
else:
    print('3b FAIL')

# ===== 4. 替换担保利息表单区域为多笔担保物 UI =====
old_collateral_form = """              {/* 担保利息 */}
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">担保利息</label>
                <div className="rounded-xl border border-gray-200 overflow-hidden">
                  {/* 币种选择 */}
                  <div className="px-4 pt-3 pb-2">
                    <span className="text-xs text-gray-400 block mb-2">担保币种</span>
                    <div className="flex flex-wrap gap-1.5">
                      {COIN_OPTIONS.map(c => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setFormData(d => ({ ...d, collateralCoin: c }))}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                            formData.collateralCoin === c
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-100 text-gray-600'
                          }`}
                        >{c}</button>
                      ))}
                    </div>
                  </div>
                  {/* 数量输入 */}
                  <div className="px-4 py-3 border-t border-gray-100">
                    <span className="text-xs text-gray-400 block mb-1.5">担保数量 ({formData.collateralCoin})</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={formData.collateralQty}
                      onChange={e => setFormData(d => ({ ...d, collateralQty: e.target.value }))}
                      className="w-full bg-transparent text-base focus:outline-none"
                      placeholder="如：12"
                    />
                  </div>
                  {/* 实时担保价值显示 */}
                  <CollateralValueDisplay coin={formData.collateralCoin} qty={formData.collateralQty} ledgerId={ledgerId} />
                </div>
              </div>"""

new_collateral_form = """              {/* 担保物（多笔） */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-600">担保物</label>
                  <button
                    type="button"
                    onClick={() => setFormData(d => ({ ...d, collateralAssets: [...d.collateralAssets, { coin: 'BTC', qty: '' }] }))}
                    className="flex items-center gap-1 text-xs text-blue-600 font-medium"
                  >
                    <Plus className="w-3.5 h-3.5" /> 添加担保物
                  </button>
                </div>
                {formData.collateralAssets.length === 0 && (
                  <div className="text-xs text-gray-400 py-2 text-center border border-dashed border-gray-200 rounded-xl">暂无担保物，点击上方添加</div>
                )}
                <div className="space-y-2">
                  {formData.collateralAssets.map((item, idx) => (
                    <div key={idx} className="rounded-xl border border-gray-200 overflow-hidden">
                      <div className="px-4 pt-3 pb-2">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs text-gray-400">担保币种 #{idx + 1}</span>
                          <button
                            type="button"
                            onClick={() => setFormData(d => ({ ...d, collateralAssets: d.collateralAssets.filter((_, i) => i !== idx) }))}
                            className="text-red-400 text-xs"
                          >删除</button>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {COIN_OPTIONS.map(c => (
                            <button
                              key={c}
                              type="button"
                              onClick={() => setFormData(d => {
                                const arr = [...d.collateralAssets];
                                arr[idx] = { ...arr[idx], coin: c };
                                return { ...d, collateralAssets: arr };
                              })}
                              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                                item.coin === c ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
                              }`}
                            >{c}</button>
                          ))}
                        </div>
                      </div>
                      <div className="px-4 py-3 border-t border-gray-100">
                        <span className="text-xs text-gray-400 block mb-1.5">担保数量 ({item.coin})</span>
                        <input
                          type="number"
                          inputMode="decimal"
                          value={item.qty}
                          onChange={e => setFormData(d => {
                            const arr = [...d.collateralAssets];
                            arr[idx] = { ...arr[idx], qty: e.target.value };
                            return { ...d, collateralAssets: arr };
                          })}
                          className="w-full bg-transparent text-base focus:outline-none"
                          placeholder="如：12"
                        />
                      </div>
                      <CollateralValueDisplay coin={item.coin} qty={item.qty} ledgerId={ledgerId} />
                    </div>
                  ))}
                </div>
              </div>"""

if old_collateral_form in content:
    content = content.replace(old_collateral_form, new_collateral_form, 1)
    print('4 OK: 担保物表单改为多笔')
else:
    print('4 FAIL: 未找到担保利息表单')

# ===== 5. 订单列表卡片展示：支持多笔担保物 =====
old_card_collateral = """                      {order.collateral_coin && order.collateral_qty && (
                        <div className="mt-2 pt-2 border-t border-gray-100 space-y-1">
                            <span className="text-xs text-gray-400">担保利息</span>
                            <span className="text-xs font-medium text-gray-700 ml-2">
                              {parseFloat(order.collateral_qty)} {order.collateral_coin}
                            </span>
                          <CollateralValueDisplay coin={order.collateral_coin} qty={String(parseFloat(order.collateral_qty))} ledgerId={ledgerId} />
                        </div>
                      )}"""

new_card_collateral = """                      {(() => {
                        // 多笔担保物：优先读 collateral_assets，兼容旧单笔字段
                        let assets: { coin: string; qty: string }[] = [];
                        try {
                          if (order.collateral_assets) assets = JSON.parse(order.collateral_assets);
                        } catch(e) {}
                        if (assets.length === 0 && order.collateral_coin && order.collateral_qty) {
                          assets = [{ coin: order.collateral_coin, qty: String(parseFloat(order.collateral_qty)) }];
                        }
                        if (assets.length === 0) return null;
                        return (
                          <div className="mt-2 pt-2 border-t border-gray-100 space-y-1">
                            <span className="text-xs text-gray-400">担保物</span>
                            {assets.map((a, i) => (
                              <div key={i} className="flex items-center justify-between">
                                <span className="text-xs font-medium text-gray-700 ml-2">{a.qty} {a.coin}</span>
                                <CollateralValueDisplay coin={a.coin} qty={a.qty} ledgerId={ledgerId} />
                              </div>
                            ))}
                          </div>
                        );
                      })()}"""

if old_card_collateral in content:
    content = content.replace(old_card_collateral, new_card_collateral, 1)
    print('5 OK: 订单卡片展示多笔担保物')
else:
    print('5 FAIL: 未找到订单卡片担保物展示')

with open('client/src/pages/FinanceManagement.tsx', 'w') as f:
    f.write(content)

print('\nFinanceManagement.tsx 修改完成')
