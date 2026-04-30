#!/usr/bin/env python3
"""测试港股数据范围和接口情况"""
import urllib.request, json, time

token = '5762b219a162bab92c913a2281663934b2e20e5e02c07ce7e42dfd79'
url = 'http://api.tushare.pro'

def call_api(params, fields='ts_code,trade_date'):
    payload = json.dumps({
        'api_name': 'hk_daily',
        'token': token,
        'params': params,
        'fields': fields
    })
    req = urllib.request.Request(url, data=payload.encode(), headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())

# 测试按股票代码拉取历史数据
print("=== 测试按股票代码拉取 ===")
data = call_api({'ts_code': '00700.HK', 'limit': 5000, 'offset': 0}, 'ts_code,trade_date,open,close')
print(f'code: {data.get("code")}, msg: {data.get("msg", "")}')
items = data['data']['items'] if data.get('data') else []
print(f'腾讯(00700.HK): {len(items)} 条')
if items:
    print('最新:', items[0])
    print('最早:', items[-1])
