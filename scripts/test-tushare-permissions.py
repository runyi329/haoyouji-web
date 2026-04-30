#!/usr/bin/env python3
"""
全面测试 Tushare API token 的实际访问权限
逐一测试各接口，记录：可访问 / 积分不足 / 其他错误
"""
import urllib.request
import json
import time

TOKEN = '5762b219a162bab92c913a2281663934b2e20e5e02c07ce7e42dfd79'
URL = 'http://api.tushare.pro'

# 所有待测接口：(api_name, 描述, 最小测试参数)
APIS = [
    # ── A股基础 ──────────────────────────────────────────────
    ('stock_basic',     'A股股票列表',          {'list_status': 'L', 'limit': 5}),
    ('trade_cal',       'A股交易日历',           {'exchange': 'SSE', 'start_date': '20260101', 'end_date': '20260430', 'limit': 5}),
    ('namechange',      '股票曾用名',            {'ts_code': '600000.SH', 'limit': 5}),
    ('hs_const',        '沪深股通成份股',        {'hs_type': 'SH', 'limit': 5}),
    ('stk_rewards',     '管理层薪酬和持股',      {'ts_code': '600000.SH', 'limit': 5}),
    ('new_share',       'IPO新股上市',           {'limit': 5}),

    # ── A股行情 ──────────────────────────────────────────────
    ('daily',           'A股日线行情',           {'ts_code': '600000.SH', 'start_date': '20260401', 'end_date': '20260429', 'limit': 5}),
    ('weekly',          'A股周线行情',           {'ts_code': '600000.SH', 'start_date': '20260101', 'end_date': '20260429', 'limit': 5}),
    ('monthly',         'A股月线行情',           {'ts_code': '600000.SH', 'start_date': '20250101', 'end_date': '20260429', 'limit': 5}),
    ('adj_factor',      '复权因子',              {'ts_code': '600000.SH', 'limit': 5}),
    ('suspend_d',       '停复牌信息',            {'ts_code': '600000.SH', 'limit': 5}),
    ('daily_basic',     '每日行情指标',          {'ts_code': '600000.SH', 'trade_date': '20260425', 'limit': 5}),
    ('stk_limit',       '每日涨跌停价格',        {'trade_date': '20260425', 'limit': 5}),
    ('moneyflow_hsgt',  '沪深股通资金流向',      {'start_date': '20260401', 'end_date': '20260429', 'limit': 5}),

    # ── A股财务 ──────────────────────────────────────────────
    ('income',          '利润表',                {'ts_code': '600000.SH', 'limit': 5}),
    ('balancesheet',    '资产负债表',            {'ts_code': '600000.SH', 'limit': 5}),
    ('cashflow',        '现金流量表',            {'ts_code': '600000.SH', 'limit': 5}),
    ('forecast',        '业绩预告',              {'ts_code': '600000.SH', 'limit': 5}),
    ('express',         '业绩快报',              {'ts_code': '600000.SH', 'limit': 5}),
    ('dividend',        '分红送股',              {'ts_code': '600000.SH', 'limit': 5}),
    ('fina_indicator',  '财务指标数据',          {'ts_code': '600000.SH', 'limit': 5}),
    ('fina_audit',      '财务审计意见',          {'ts_code': '600000.SH', 'limit': 5}),
    ('fina_mainbz',     '主营业务构成',          {'ts_code': '600000.SH', 'limit': 5}),
    ('disclosure_date', '财报披露日期表',        {'ts_code': '600000.SH', 'limit': 5}),

    # ── A股参考数据 ──────────────────────────────────────────
    ('top10_holders',   '前十大股东',            {'ts_code': '600000.SH', 'limit': 5}),
    ('top10_floatholders', '前十大流通股东',     {'ts_code': '600000.SH', 'limit': 5}),
    ('top_list',        '龙虎榜每日明细',        {'trade_date': '20260425', 'limit': 5}),
    ('block_trade',     '大宗交易',              {'ts_code': '600000.SH', 'limit': 5}),
    ('stk_holdernumber','股东人数',              {'ts_code': '600000.SH', 'limit': 5}),
    ('stk_holdertrade', '股东增减持',            {'ts_code': '600000.SH', 'limit': 5}),
    ('repurchase',      '股票回购',              {'ts_code': '600000.SH', 'limit': 5}),
    ('share_float',     '限售股解禁',            {'ts_code': '600000.SH', 'limit': 5}),

    # ── A股特色数据 ──────────────────────────────────────────
    ('moneyflow',       '个股资金流向',          {'ts_code': '600000.SH', 'start_date': '20260401', 'end_date': '20260429', 'limit': 5}),
    ('cyq_perf',        '每日筹码及胜率',        {'ts_code': '600000.SH', 'trade_date': '20260425', 'limit': 5}),
    ('stk_factor',      '股票技术面因子',        {'ts_code': '600000.SH', 'start_date': '20260401', 'end_date': '20260429', 'limit': 5}),
    ('margin',          '融资融券交易汇总',      {'trade_date': '20260425', 'limit': 5}),
    ('margin_detail',   '融资融券交易明细',      {'trade_date': '20260425', 'limit': 5}),

    # ── 指数数据 ──────────────────────────────────────────────
    ('index_basic',     '指数基础信息',          {'market': 'SSE', 'limit': 5}),
    ('index_daily',     '指数日线行情',          {'ts_code': '000001.SH', 'start_date': '20260401', 'end_date': '20260429', 'limit': 5}),
    ('index_weight',    '指数成分和权重',        {'index_code': '000300.SH', 'trade_date': '20260101', 'limit': 5}),
    ('index_dailybasic','大盘每日指标',          {'trade_date': '20260425', 'limit': 5}),
    ('index_classify',  '行业分类',              {'level': 'L1', 'src': 'SW2021', 'limit': 5}),
    ('index_member',    '申万行业成分构成',      {'index_code': '801010.SI', 'limit': 5}),

    # ── ETF基金 ──────────────────────────────────────────────
    ('fund_basic',      '公募基金列表',          {'market': 'E', 'limit': 5}),
    ('fund_daily',      '基金日线行情',          {'ts_code': '159919.SZ', 'start_date': '20260401', 'end_date': '20260429', 'limit': 5}),
    ('fund_nav',        '基金净值',              {'ts_code': '159919.SZ', 'limit': 5}),
    ('fund_portfolio',  '基金持仓数据',          {'ts_code': '159919.SZ', 'limit': 5}),

    # ── 期货数据 ──────────────────────────────────────────────
    ('fut_basic',       '期货合约列表',          {'exchange': 'SHFE', 'limit': 5}),
    ('fut_daily',       '期货日线行情',          {'trade_date': '20260425', 'limit': 5}),
    ('fut_holding',     '期货每日持仓排名',      {'trade_date': '20260425', 'symbol': 'CU', 'limit': 5}),
    ('fut_wsr',         '仓单日报',              {'trade_date': '20260425', 'limit': 5}),
    ('fut_settle',      '期货结算参数',          {'trade_date': '20260425', 'limit': 5}),

    # ── 现货黄金 ──────────────────────────────────────────────
    ('sge_basic',       '上海黄金基础信息',      {'limit': 5}),
    ('sge_daily',       '上海黄金现货日行情',    {'trade_date': '20260425', 'limit': 5}),

    # ── 外汇数据 ──────────────────────────────────────────────
    ('fx_obasic',       '外汇基础信息',          {'limit': 5}),
    ('fx_daily',        '外汇日线行情',          {'ts_code': 'USDCNH.FXCM', 'start_date': '20260401', 'end_date': '20260429', 'limit': 5}),

    # ── 港股数据 ──────────────────────────────────────────────
    ('hk_basic',        '港股列表',              {'limit': 5}),
    ('hk_daily',        '港股日线行情',          {'ts_code': '00700.HK', 'start_date': '20260401', 'end_date': '20260429', 'limit': 5}),
    ('hk_tradecal',     '港股交易日历',          {'start_date': '20260101', 'end_date': '20260430', 'limit': 5}),
    ('hk_hold',         '沪深港通持股明细',      {'trade_date': '20260425', 'limit': 5}),

    # ── 美股数据 ──────────────────────────────────────────────
    ('us_basic',        '美股列表',              {'limit': 5}),
    ('us_daily',        '美股日线行情',          {'ts_code': 'AAPL.O', 'start_date': '20260401', 'end_date': '20260429', 'limit': 5}),
    ('us_tradecal',     '美股交易日历',          {'start_date': '20260101', 'end_date': '20260430', 'limit': 5}),

    # ── 宏观经济 ──────────────────────────────────────────────
    ('cn_gdp',          '国内生产总值(GDP)',      {'limit': 5}),
    ('cn_cpi',          '居民消费价格指数(CPI)',  {'limit': 5}),
    ('cn_ppi',          '工业生产者出厂价格(PPI)',{'limit': 5}),
    ('cn_m',            '货币供应量',            {'limit': 5}),
    ('shibor',          'Shibor利率',            {'start_date': '20260401', 'end_date': '20260429', 'limit': 5}),
    ('libor',           'Libor利率',             {'start_date': '20260401', 'end_date': '20260429', 'limit': 5}),
    ('hibor',           'Hibor利率',             {'start_date': '20260401', 'end_date': '20260429', 'limit': 5}),
    ('wz_index',        '温州民间借贷利率',      {'start_date': '20260101', 'end_date': '20260429', 'limit': 5}),
    ('gz_index',        '广州民间借贷利率',      {'start_date': '20260101', 'end_date': '20260429', 'limit': 5}),
    ('cn_pmi',          '采购经理人指数(PMI)',    {'limit': 5}),
    ('sf_month',        '社会融资规模',          {'limit': 5}),
    ('cn_money_supply', '货币供应量(旧版)',       {'limit': 5}),

    # ── 债券数据 ──────────────────────────────────────────────
    ('bond_basic',      '债券基础信息',          {'limit': 5}),
    ('cb_basic',        '可转债基础信息',        {'limit': 5}),
    ('cb_daily',        '可转债日行情',          {'ts_code': '113050.SH', 'start_date': '20260401', 'end_date': '20260429', 'limit': 5}),
    ('yc_cb',           '中债收益率曲线',        {'curve_type': '0', 'trade_date': '20260425', 'limit': 5}),

    # ── 期权数据 ──────────────────────────────────────────────
    ('opt_basic',       '期权合约信息',          {'exchange': 'SSE', 'limit': 5}),
    ('opt_daily',       '期权日线行情',          {'trade_date': '20260425', 'limit': 5}),
]

results = []

print(f"共 {len(APIS)} 个接口待测试，每次间隔 1.5 秒...\n")
print(f"{'接口名':<25} {'描述':<20} {'状态':<12} {'备注'}")
print("-" * 85)

for i, (api_name, desc, params) in enumerate(APIS):
    try:
        payload = json.dumps({
            'api_name': api_name,
            'token': TOKEN,
            'params': params,
            'fields': ''
        })
        req = urllib.request.Request(
            URL,
            data=payload.encode(),
            headers={'Content-Type': 'application/json'}
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read())

        code = data.get('code', -1)
        msg  = data.get('msg', '')
        items = data['data']['items'] if data.get('data') and data['data'].get('items') else []

        if code == 0:
            status = '✅ 可访问'
            note   = f'返回 {len(items)} 条'
        elif code == 40203:
            if '积分' in msg or '权限' in msg:
                status = '🔒 积分不足'
            elif '频率' in msg or '次/天' in msg or '次/分' in msg:
                status = '⏱ 频率超限'
            else:
                status = '❌ 拒绝'
            note = msg[:50]
        elif code == 40001:
            status = '🔒 需要登录'
            note = msg[:50]
        else:
            status = f'⚠ code={code}'
            note = msg[:50]

        results.append((api_name, desc, status, note))
        print(f"{api_name:<25} {desc:<20} {status:<14} {note}")

    except Exception as e:
        results.append((api_name, desc, '❌ 异常', str(e)[:50]))
        print(f"{api_name:<25} {desc:<20} {'❌ 异常':<14} {str(e)[:50]}")

    # 每 2 个请求后多等一下，避免频率超限
    if (i + 1) % 2 == 0:
        time.sleep(2)
    else:
        time.sleep(1.2)

print("\n\n=== 汇总 ===")
accessible = [r for r in results if '✅' in r[2]]
limited     = [r for r in results if '🔒' in r[2] or '积分' in r[2]]
rate_limit  = [r for r in results if '⏱' in r[2]]
other       = [r for r in results if r not in accessible and r not in limited and r not in rate_limit]

print(f"✅ 可访问: {len(accessible)} 个")
print(f"🔒 积分不足: {len(limited)} 个")
print(f"⏱ 频率超限: {len(rate_limit)} 个（今日已超限，实际可能可访问）")
print(f"⚠ 其他: {len(other)} 个")

print("\n✅ 可访问接口列表:")
for r in accessible:
    print(f"  {r[0]:<25} {r[1]}")

print("\n⏱ 频率超限（实际可用，今日已超限）:")
for r in rate_limit:
    print(f"  {r[0]:<25} {r[1]}")
