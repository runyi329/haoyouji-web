#!/usr/bin/env python3
"""
Patch script: 融资付息订单支持多笔担保物 (collateral_assets JSON 字段)
"""
import re

# ===== 1. 后端 routers.ts =====
with open('server/routers.ts', 'r') as f:
    content = f.read()

# 1a. financeCreateOrder input schema: 添加 collateralAssets
old_create_schema = "        collateralCoin: z.string().optional(),\n        collateralQty: z.string().optional(),\n        financeType: z.enum(['保本分成', '自负盈亏']).optional(),\n      }))\n      .mutation(async ({ ctx, input }) => {\n        const db = await getLedgerDb();\n        const roleRows = await db.execute(\n          sql`SELECT role FROM ledger_members WHERE ledgerId = ${input.ledgerId} AND userId = ${ctx.user.id} LIMIT 1`\n        ) as any;\n        const role = (roleRows[0]?.[0] ?? roleRows[0])?.role;\n        if (role !== 'owner' && role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN', message: '仅管理员可操作' });\n        // 自动建表时添加 collateral_coin / collateral_qty / finance_type 列（如果不存在）"

new_create_schema = "        collateralCoin: z.string().optional(),\n        collateralQty: z.string().optional(),\n        collateralAssets: z.array(z.object({ coin: z.string(), qty: z.string() })).optional(),\n        financeType: z.enum(['保本分成', '自负盈亏']).optional(),\n      }))\n      .mutation(async ({ ctx, input }) => {\n        const db = await getLedgerDb();\n        const roleRows = await db.execute(\n          sql`SELECT role FROM ledger_members WHERE ledgerId = ${input.ledgerId} AND userId = ${ctx.user.id} LIMIT 1`\n        ) as any;\n        const role = (roleRows[0]?.[0] ?? roleRows[0])?.role;\n        if (role !== 'owner' && role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN', message: '仅管理员可操作' });\n        // 自动建表时添加 collateral_coin / collateral_qty / finance_type / collateral_assets 列（如果不存在）"

if old_create_schema in content:
    content = content.replace(old_create_schema, new_create_schema, 1)
    print('1a OK: financeCreateOrder schema 添加 collateralAssets')
else:
    print('1a FAIL')

# 1b. ALTER TABLE 添加 collateral_assets 列
old_alter = "          await conn.execute(`ALTER TABLE finance_interest_orders ADD COLUMN IF NOT EXISTS collateral_coin VARCHAR(20) DEFAULT NULL`);\n          await conn.execute(`ALTER TABLE finance_interest_orders ADD COLUMN IF NOT EXISTS collateral_qty DECIMAL(20,8) DEFAULT NULL`);\n          await conn.execute(`ALTER TABLE finance_interest_orders ADD COLUMN IF NOT EXISTS finance_type VARCHAR(20) DEFAULT '保本分成'`);\n          await conn.end();"

new_alter = "          await conn.execute(`ALTER TABLE finance_interest_orders ADD COLUMN IF NOT EXISTS collateral_coin VARCHAR(20) DEFAULT NULL`);\n          await conn.execute(`ALTER TABLE finance_interest_orders ADD COLUMN IF NOT EXISTS collateral_qty DECIMAL(20,8) DEFAULT NULL`);\n          await conn.execute(`ALTER TABLE finance_interest_orders ADD COLUMN IF NOT EXISTS finance_type VARCHAR(20) DEFAULT '保本分成'`);\n          await conn.execute(`ALTER TABLE finance_interest_orders ADD COLUMN IF NOT EXISTS collateral_assets TEXT DEFAULT NULL`);\n          await conn.end();"

if old_alter in content:
    content = content.replace(old_alter, new_alter, 1)
    print('1b OK: ALTER TABLE 添加 collateral_assets 列')
else:
    print('1b FAIL')

# 1c. INSERT 语句添加 collateral_assets 字段
old_insert = "          sql`INSERT INTO finance_interest_orders (order_no, ledger_id, user_id, coin, amount, buy_price, buy_date, buy_quantity, storage_account, admin_note, public_note, interest_rate_annual, interest_payment_type, interest_base, interest_base_currency, interest_start_date, collateral_coin, collateral_qty, finance_type, created_by)\n              VALUES (${orderNo}, ${input.ledgerId}, ${input.userId}, ${input.coin}, ${input.amount}, ${input.buyPrice || null}, ${input.buyDate || null}, ${input.buyQuantity || null}, ${input.storageAccount || null}, ${input.adminNote || null}, ${input.publicNote || null}, ${input.interestRateAnnual || null}, ${input.interestPaymentType || null}, ${input.interestBase || null}, ${input.interestBaseCurrency || 'USDT'}, ${input.interestStartDate || null}, ${input.collateralCoin || null}, ${input.collateralQty || null}, ${input.financeType || '保本分成'}, ${ctx.user.id})`"

new_insert = "          sql`INSERT INTO finance_interest_orders (order_no, ledger_id, user_id, coin, amount, buy_price, buy_date, buy_quantity, storage_account, admin_note, public_note, interest_rate_annual, interest_payment_type, interest_base, interest_base_currency, interest_start_date, collateral_coin, collateral_qty, finance_type, collateral_assets, created_by)\n              VALUES (${orderNo}, ${input.ledgerId}, ${input.userId}, ${input.coin}, ${input.amount}, ${input.buyPrice || null}, ${input.buyDate || null}, ${input.buyQuantity || null}, ${input.storageAccount || null}, ${input.adminNote || null}, ${input.publicNote || null}, ${input.interestRateAnnual || null}, ${input.interestPaymentType || null}, ${input.interestBase || null}, ${input.interestBaseCurrency || 'USDT'}, ${input.interestStartDate || null}, ${input.collateralCoin || null}, ${input.collateralQty || null}, ${input.financeType || '保本分成'}, ${input.collateralAssets ? JSON.stringify(input.collateralAssets) : null}, ${ctx.user.id})`"

if old_insert in content:
    content = content.replace(old_insert, new_insert, 1)
    print('1c OK: INSERT 添加 collateral_assets')
else:
    print('1c FAIL')

# 1d. financeUpdateOrder input schema: 添加 collateralAssets
old_update_schema = "        collateralCoin: z.string().optional(),\n        collateralQty: z.string().optional(),\n        financeType: z.enum(['保本分成', '自负盈亏']).optional(),\n      }))\n      .mutation(async ({ ctx, input }) => {\n        const db = await getLedgerDb();\n        const roleRows = await db.execute(\n          sql`SELECT role FROM ledger_members WHERE ledgerId = ${input.ledgerId} AND userId = ${ctx.user.id} LIMIT 1`\n        ) as any;\n        const role = (roleRows[0]?.[0] ?? roleRows[0])?.role;\n        if (role !== 'owner' && role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN', message: '仅管理员可操作' });\n        // 动态构建 UPDATE"

new_update_schema = "        collateralCoin: z.string().optional(),\n        collateralQty: z.string().optional(),\n        collateralAssets: z.array(z.object({ coin: z.string(), qty: z.string() })).optional(),\n        financeType: z.enum(['保本分成', '自负盈亏']).optional(),\n      }))\n      .mutation(async ({ ctx, input }) => {\n        const db = await getLedgerDb();\n        const roleRows = await db.execute(\n          sql`SELECT role FROM ledger_members WHERE ledgerId = ${input.ledgerId} AND userId = ${ctx.user.id} LIMIT 1`\n        ) as any;\n        const role = (roleRows[0]?.[0] ?? roleRows[0])?.role;\n        if (role !== 'owner' && role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN', message: '仅管理员可操作' });\n        // 动态构建 UPDATE"

if old_update_schema in content:
    content = content.replace(old_update_schema, new_update_schema, 1)
    print('1d OK: financeUpdateOrder schema 添加 collateralAssets')
else:
    print('1d FAIL')

# 1e. financeUpdateOrder 的 fieldMap 添加 collateralAssets 处理（在 financeType 后面加特殊处理）
old_update_logic = "          collateralCoin: 'collateral_coin', collateralQty: 'collateral_qty',\n          financeType: 'finance_type',\n        };"

new_update_logic = "          collateralCoin: 'collateral_coin', collateralQty: 'collateral_qty',\n          financeType: 'finance_type',\n        };\n        // 特殊处理 collateralAssets（JSON 序列化）\n        if (input.collateralAssets !== undefined) {\n          updateCols.push('collateral_assets = ?');\n          updateVals.push(input.collateralAssets && input.collateralAssets.length > 0 ? JSON.stringify(input.collateralAssets) : null);\n        }"

if old_update_logic in content:
    content = content.replace(old_update_logic, new_update_logic, 1)
    print('1e OK: financeUpdateOrder 添加 collateralAssets 处理')
else:
    print('1e FAIL')

with open('server/routers.ts', 'w') as f:
    f.write(content)

print('\n后端 routers.ts 修改完成')
