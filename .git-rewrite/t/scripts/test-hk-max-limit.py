#!/usr/bin/env python3
"""测试hk_daily单次请求最大数据量"""
import urllib.request, json, time

token = '5762b219a162bab92c913a2281663934b2e20e5e02c07ce7e42dfd79'
url = 'http://api.tushare.pro'

def call_api(params, fields='ts_code,trade_date,open,close'):
    payload = json.dumps({
        'api_name': 'hk_daily',
        'token': token,
        'params': params,
        'fields': fields
    })
    req = urllib.request.Request(url, data=payload.encode(), headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read())

# 测试不指定日期，只设置超大limit，看能拿多少
print("=== 测试1: 不指定日期，limit=100000 ===")
data = call_api({'limit': 100000, 'offset': 0})
code = data.get('code')
msg = data.get('msg', '')
items = data['data']['items'] if data.get('data') else []
print(f'code={code}, msg={msg}')
print(f'返回条数: {len(items)}')
if items:
    print('最新:', items[0])
    print('最早:', items[-1])
