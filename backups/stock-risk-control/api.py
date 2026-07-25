#!/usr/bin/env python3
"""
股票风险特征检测 API
唯一数据源：RULES 列表 —— 改这里，展示表和查询逻辑全部联动

GET  /rules   返回规则配置（前端用于渲染利率加成表）
POST /check   { "stocks": ["000001", "600036"], "base_rate": 12 } 检测股票风险
GET  /ping    健康检查
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import tushare as ts
import pandas as pd
from datetime import datetime, timedelta
import traceback

app = Flask(__name__)
CORS(app)

TOKEN = "5762b219a162bab92c913a2281663934b2e20e5e02c07ce7e42dfd79"
pro = ts.pro_api(TOKEN)

DEFAULT_BASE_RATE = 12.0  # 默认基础年化利率 %

# ============================================================
# ★ 唯一规则数据源 ★
# 修改这里 → 利率加成展示表 & 股票查询检测逻辑 全部自动联动
# ============================================================
RULES = [
    {
        "id": "normal",
        "name": "普通股（无特殊风险）",
        "desc": "无以下任何风险标记，按基础利率计算",
        "prob": 1.81,
        "loss": 27,
        "add_rate": 0.49,
        "level": "base",
        "check_fn": None,
    },
    {
        "id": "net_asset_down",
        "name": "归母净资产持续下降",
        "desc": "近两个完整会计年度归母净资产持续缩减",
        "prob": 3.93,
        "loss": 27,
        "add_rate": 1.06,
        "level": "mid",
        "check_fn": "check_net_asset_down",
    },
    {
        "id": "small_cap",
        "name": "小市值股",
        "desc": "总市值低于阈值，退市风险显著偏高",
        "prob": 1.35,
        "loss": 80,
        "add_rate": 1.08,
        "level": "mid",
        "check_fn": "check_small_cap",
        "threshold": 30,
        "threshold_unit": "亿",
        "threshold_label": "总市值 < {threshold}{threshold_unit}",
    },
    {
        "id": "loss2y",
        "name": "连续两年亏损（ST高危）",
        "desc": "近两个完整会计年度净利润均为负",
        "prob": 5.24,
        "loss": 27,
        "add_rate": 1.41,
        "level": "high",
        "check_fn": "check_loss2y",
    },
    {
        "id": "april_risk",
        "name": "年报季持有亏损记录股",
        "desc": "近两年内有亏损记录，且当前处于4月年报披露期",
        "prob": 5.43,
        "loss": 27,
        "add_rate": 1.47,
        "level": "high",
        "check_fn": "check_april_risk",
    },
    {
        "id": "pledge_high",
        "name": "大股东高比例质押",
        "desc": "大股东质押比例超过阈值，爆仓风险叠加戴帽风险",
        "prob": 2.71,
        "loss": 40,
        "add_rate": 1.08,
        "level": "mid",
        "check_fn": "check_pledge_high",
        "threshold": 70,
        "threshold_unit": "%",
        "threshold_label": "质押比例 > {threshold}{threshold_unit}",
    },
    {
        "id": "margin_blowup",
        "name": "保证金覆盖不足风险",
        "desc": "保证金比例低于股票单日最大跌幅，存在当日穿仓风险。加息幅度随保证金比例和股票类型动态计算",
        "prob_note": "随保证金比例和股票类型动态变化",
        "loss_note": "本金100%（穿仓即全损）",
        "add_rate_note": "10cm+5%保证金: +3.12%  /  10cm+10%: +1.56%  /  20cm+5%: +6.24%  /  20cm+10%: +3.12%",
        "level": "high",
        "check_fn": "check_margin_blowup",
        "is_dynamic": True,
    },
]

# ============================================================
# 检测函数：每个函数返回 dict
#   hit: bool  是否命中
#   detail: str  具体数据说明（命中时显示）
# ============================================================

def fmt_yi(val):
    """将元转为亿元字符串（Tushare财务数据单位为元）"""
    try:
        yi = float(val) / 1e8
        if abs(yi) >= 100:
            return f"{yi:.1f}亿"
        elif abs(yi) >= 1:
            return f"{yi:.2f}亿"
        else:
            wan = float(val) / 1e4
            return f"{wan:.0f}万"
    except:
        return str(val)

def fmt_profit(val):
    """净利润：元 → 亿元，带正负号（Tushare财务数据单位为元）"""
    try:
        yi = float(val) / 1e8
        sign = "+" if yi > 0 else ""
        if abs(yi) >= 100:
            return f"{sign}{yi:.1f}亿"
        elif abs(yi) >= 1:
            return f"{sign}{yi:.2f}亿"
        else:
            wan = float(val) / 1e4
            return f"{sign}{wan:.0f}万"
    except:
        return str(val)


def check_loss2y(ts_code, cache, rule):
    income_df = cache.get("income_df", pd.DataFrame())
    if income_df.empty or len(income_df) < 2:
        return {"hit": False, "detail": "财务数据不足"}
    rows = income_df.head(2)
    profits = []
    for _, row in rows.iterrows():
        year = str(row["end_date"])[:4]
        val = row["n_income_attr_p"]
        profits.append((year, val))
    all_loss = all(v is not None and float(v) < 0 for _, v in profits)
    if all_loss:
        lines = [f"{y}年净利润 {fmt_profit(v)}" for y, v in profits]
        return {"hit": True, "detail": "；".join(lines)}
    return {"hit": False, "detail": ""}


def check_net_asset_down(ts_code, cache, rule):
    bs_df = cache.get("bs_df", pd.DataFrame())
    if bs_df.empty or len(bs_df) < 2:
        return {"hit": False, "detail": "财务数据不足"}
    rows = bs_df.head(3)  # 取3年，展示更丰富
    data = []
    for _, row in rows.iterrows():
        year = str(row["end_date"])[:4]
        val = row["total_hldr_eqy_exc_min_int"]
        data.append((year, val))
    # 判断最近两年是否持续下降
    if len(data) >= 2:
        v0 = data[0][1]  # 最新
        v1 = data[1][1]  # 上一年
        is_down = all(v is not None for v in [v0, v1]) and float(v0) < float(v1)
        if is_down:
            lines = []
            for y, v in data:
                if v is not None:
                    lines.append(f"{y}年 {fmt_yi(float(v))}")
            # 计算降幅
            try:
                pct = (float(v0) - float(v1)) / abs(float(v1)) * 100
                trend = f"同比下降 {abs(pct):.1f}%"
            except:
                trend = "持续下降"
            return {"hit": True, "detail": "；".join(lines) + f"（{trend}）"}
    return {"hit": False, "detail": ""}


def check_small_cap(ts_code, cache, rule):
    mv = cache.get("mv")
    threshold = rule.get("threshold", 30)
    if mv is not None and mv < threshold:
        return {"hit": True, "detail": f"当前总市值 {mv:.2f}亿，低于{threshold}亿警戒线"}
    return {"hit": False, "detail": ""}


def check_april_risk(ts_code, cache, rule):
    if datetime.now().month != 4:
        return {"hit": False, "detail": "当前非4月年报披露期"}
    income_df = cache.get("income_df", pd.DataFrame())
    if income_df.empty:
        return {"hit": False, "detail": ""}
    rows = income_df.head(2)
    for _, row in rows.iterrows():
        val = row["n_income_attr_p"]
        if val is not None and float(val) < 0:
            year = str(row["end_date"])[:4]
            return {"hit": True, "detail": f"当前处于4月年报披露期，{year}年净利润 {fmt_profit(val)}"}
    return {"hit": False, "detail": ""}


def check_pledge_high(ts_code, cache, rule):
    pledge = cache.get("pledge")
    threshold = rule.get("threshold", 70)
    if pledge is not None and pledge > threshold:
        return {"hit": True, "detail": f"大股东质押比例 {pledge:.1f}%，超过{threshold}%警戒线"}
    return {"hit": False, "detail": ""}


# ============================================================
# 穿仓风险检测
# 根据股票类型（10cm/20cm/ST）和保证金比例计算穿仓概率
# ============================================================

# ============================================================
# 真实穿仓概率数据（基于Tushare 2024-2025年实际日线数据）
# 数据来源：2024-2025年所有科创板+创业板股票（20cm）收盘价统计
# 2024年：26,406个股票-交易日，收盘跌>10%共177次，概率0.6703%
# 2025年：16,173个股票-交易日，收盘跌>10%共138次，概率0.8533%
# 穿仓时平均超额跌幅：2024年2.15%，2025年2.33%
# 年化期望损失率（252交易日）：2024年3.63%，2025年5.01%
# ============================================================

# 20cm票真实穿仓概率（收盘价口径）
BLOWUP_REAL = {
    "20cm": {
        # margin_pct -> (单日穿仓概率%, 穿仓时平均超额跌幅%, 年化期望损失率%)
        # 保证金5%：跌>5%即穿仓（概率更高，用跌>5%的历史比例估算约为跌>10%的2.5倍）
        5:  (0.6703 * 2.5, 4.5,  0.6703 * 2.5 / 100 * 4.5 * 252),
        # 保证金10%：直接用实测数据（2024-2025年均值）
        10: (0.7618, 2.24, 3.63 + 5.01) ,  # 两年均值
        # 保证金15%：跌>15%的概率（约为跌>10%的0.35倍）
        15: (0.7618 * 0.35, 3.5, 0.7618 * 0.35 / 100 * 3.5 * 252),
        # 保证金20%：接近跌停，概率极低
        20: (0.7618 * 0.05, 1.5, 0.7618 * 0.05 / 100 * 1.5 * 252),
    },
    "10cm": {
        # 10cm票跌停才能穿10%保证金，跌停概率约0.89%
        5:  (0.89 * 2.0, 3.0, 0.89 * 2.0 / 100 * 3.0 * 252),
        10: (0.89, 1.5, 0.89 / 100 * 1.5 * 252),
        15: (0.0,  0.0, 0.0),   # 10cm票不可能跌超15%
        20: (0.0,  0.0, 0.0),
    },
    "5cm": {
        # ST票5cm，保证金>=5%时不会穿仓
        5:  (0.0, 0.0, 0.0),
        10: (0.0, 0.0, 0.0),
        15: (0.0, 0.0, 0.0),
        20: (0.0, 0.0, 0.0),
    },
}

def get_stock_type(ts_code, info):
    """判断股票类型：20cm/10cm/5cm"""
    market = info.get("market", "")
    name = info.get("name", "")
    # ST股
    if "ST" in name or "*ST" in name:
        return "5cm"
    # 科创板和创业板为20cm
    if market in ("科创板", "创业板") or ts_code.startswith(("688", "300", "301")):
        return "20cm"
    return "10cm"


def check_margin_blowup(ts_code, cache, rule, margin_pct=10):
    """
    保证金覆盖不足风险检测
    margin_pct: 保证金比例（5/10/15/20）
    加息公式：年化期望损失率 = 单日穿仓概率 × 穿仓时平均超额跌幅 × 252交易日
    数据来源：Tushare 2024-2025年实际日线数据
    """
    stock_type = cache.get("stock_type", "10cm")
    real_table = BLOWUP_REAL.get(stock_type, BLOWUP_REAL["10cm"])
    
    # 找到最接近的阈值
    thresholds = sorted(real_table.keys())
    key = min(thresholds, key=lambda x: abs(x - margin_pct))
    blowup_prob_pct, avg_excess_pct, annual_expected_pct = real_table[key]
    
    limit_map = {"10cm": "10%", "20cm": "20%", "5cm": "5%"}
    limit_str = limit_map.get(stock_type, "10%")
    
    # 年化期望损失率即应加息幅度
    add_rate = round(annual_expected_pct, 2)
    add_rate = min(add_rate, 8.0)  # 上限加息8%
    
    detail = (
        f"股票类型 {stock_type}（每日最大跌幅{limit_str}），"
        f"保证金{margin_pct}%，"
        f"实测单日穿仓概率 {blowup_prob_pct:.4f}%，"
        f"穿仓时平均超额跌幅 {avg_excess_pct:.2f}%，"
        f"年化期望损失率 {annual_expected_pct:.2f}%"
    )
    
    # 保证金足够大时不命中（期望损失率接近零）
    if annual_expected_pct < 0.1:
        return {"hit": False, "detail": detail, "blowup_prob": blowup_prob_pct, "add_rate": 0.0}
    
    return {"hit": True, "detail": detail, "blowup_prob": blowup_prob_pct, "add_rate": add_rate}


# 检测函数注册表
CHECKERS = {
    "check_loss2y": check_loss2y,
    "check_net_asset_down": check_net_asset_down,
    "check_small_cap": check_small_cap,
    "check_april_risk": check_april_risk,
    "check_pledge_high": check_pledge_high,
}

# ============================================================
# 数据拉取工具函数
# ============================================================

def normalize_code(code):
    code = code.strip().upper()
    if "." in code:
        return code
    digits = code.replace("SH", "").replace("SZ", "").strip()
    digits = ''.join(filter(str.isdigit, digits)).zfill(6)
    return f"{digits}.SH" if digits.startswith(("6", "5")) else f"{digits}.SZ"


def fetch_cache(ts_code):
    """拉取单只股票所需的所有数据，返回缓存字典"""
    cache = {}
    try:
        end = datetime.now()
        start = end - timedelta(days=365 * 4)
        income = pro.income(
            ts_code=ts_code,
            start_date=start.strftime("%Y%m%d"),
            end_date=end.strftime("%Y%m%d"),
            period_type="A",
            fields="end_date,n_income_attr_p"
        )
        cache["income_df"] = income.sort_values("end_date", ascending=False) if not income.empty else pd.DataFrame()
    except Exception:
        cache["income_df"] = pd.DataFrame()

    try:
        bs = pro.balancesheet(
            ts_code=ts_code,
            start_date=(datetime.now() - timedelta(days=365*4)).strftime("%Y%m%d"),
            end_date=datetime.now().strftime("%Y%m%d"),
            period_type="A",
            fields="end_date,total_hldr_eqy_exc_min_int"
        )
        cache["bs_df"] = bs.sort_values("end_date", ascending=False) if not bs.empty else pd.DataFrame()
    except Exception:
        cache["bs_df"] = pd.DataFrame()

    try:
        today = datetime.now().strftime("%Y%m%d")
        df = pro.daily_basic(ts_code=ts_code, trade_date=today, fields="ts_code,total_mv")
        if df.empty:
            for i in range(1, 10):
                d = (datetime.now() - timedelta(days=i)).strftime("%Y%m%d")
                df = pro.daily_basic(ts_code=ts_code, trade_date=d, fields="ts_code,total_mv")
                if not df.empty:
                    break
        cache["mv"] = float(df.iloc[0]["total_mv"]) / 10000 if not df.empty else None
    except Exception:
        cache["mv"] = None

    try:
        df = pro.pledge_stat(ts_code=ts_code, fields="ts_code,pledge_ratio")
        cache["pledge"] = float(df.iloc[0]["pledge_ratio"]) if not df.empty else None
    except Exception:
        cache["pledge"] = None

    return cache


def check_stock(ts_code, base_rate=None, margin_pct=None):
    """检测单只股票，返回命中规则和应执行利率"""
    if base_rate is None:
        base_rate = DEFAULT_BASE_RATE
    if margin_pct is None:
        margin_pct = 10  # 默认保证金10%

    try:
        info_df = pro.stock_basic(ts_code=ts_code, fields="ts_code,name,market,list_status")
        if info_df.empty:
            return {"error": f"未找到股票 {ts_code}，请检查代码"}
        info = info_df.iloc[0].to_dict()
    except Exception as e:
        return {"error": f"查询失败：{str(e)}"}

    cache = fetch_cache(ts_code)
    # 将股票类型写入cache，供穿仓检测使用
    cache["stock_type"] = get_stock_type(ts_code, info)
    cache["info"] = info

    # 逐条检测规则，收集命中项及详情
    hit_items = []  # [{rule, detail}]
    for rule in RULES:
        fn_name = rule.get("check_fn")
        if not fn_name or fn_name not in CHECKERS:
            continue
        try:
            res = CHECKERS[fn_name](ts_code, cache, rule)
            if res.get("hit"):
                hit_items.append({
                    "rule": rule,
                    "detail": res.get("detail", ""),
                })
        except Exception:
            pass

    # 穿仓风险检测（独立于其他规则）
    margin_res = check_margin_blowup(ts_code, cache, {}, margin_pct=margin_pct)
    margin_item = {
        "id": "margin_blowup",
        "name": f"保证金覆盖不足风险（保证金{margin_pct}%）",
        "add_rate": margin_res["add_rate"],
        "detail": margin_res["detail"],
        "level": "high" if margin_res["hit"] else "base",
        "blowup_prob": round(margin_res["blowup_prob"] * 100, 2),
        "stock_type": cache["stock_type"],
    }

    # 构建加息明细列表（每项命中各加多少）
    rate_breakdown = []
    for item in hit_items:
        r = item["rule"]
        rate_breakdown.append({
            "id": r["id"],
            "name": r["name"],
            "add_rate": r["add_rate"],
            "detail": item["detail"],
            "level": r["level"],
        })

    # 穿仓风险如命中，加入明细
    if margin_res["hit"]:
        rate_breakdown.append(margin_item)

    # 账户利率 = 基础利率 + 所有命中项加息之和（不超过上限）
    if rate_breakdown:
        # 直接求和，不设上限——每项加息都是真实期望损失补偿
        total_add = round(sum(x["add_rate"] for x in rate_breakdown), 2)
        account_rate = round(base_rate + total_add, 2)
    else:
        total_add = 0
        account_rate = base_rate

    # 强平规则计算
    # 强平触发线 = 保证金比例 × 90%
    # 即保证金亏失达到90%时，A方有权强平
    FORCE_CLOSE_RATIO = 0.90  # 默认强平系数
    force_close_pct = round(margin_pct * FORCE_CLOSE_RATIO, 2)  # 跌幅达到这个比例就强平
    stock_type = cache["stock_type"]
    limit_map = {"10cm": 10, "20cm": 20, "5cm": 5}
    daily_limit = limit_map.get(stock_type, 10)
    
    # 强平风险评估：一个跌停能否触发强平
    if daily_limit >= force_close_pct:
        force_close_risk = "high"   # 一个跌停就可能触发强平
    elif daily_limit * 0.9 >= force_close_pct:
        force_close_risk = "medium" # 小幅跌就可能触发
    else:
        force_close_risk = "low"    # 需要连续大幅下跌才触发
    
    force_close_info = {
        "trigger_pct": force_close_pct,          # 跌幅达到这个比例强平
        "margin_pct": margin_pct,
        "force_close_ratio": FORCE_CLOSE_RATIO,
        "daily_limit": daily_limit,
        "stock_type": stock_type,
        "risk_level": force_close_risk,
        "desc": (
            f"保证金{margin_pct}%，亏失达到{force_close_pct}%（即保证金的90%）时强平。"
            f"该股每日最大跌幅{daily_limit}%，"
            + (
                f"一个跌停就可能触发强平。" if force_close_risk == "high"
                else f"跌幅超过{force_close_pct}%即触发强平，盘中可以补仓避免。"
            )
        )
    }
    
    # 构建 all_rules：所有规则的完整列表（包含未命中的）
    all_rules = []
    for rule in RULES:
        fn_name = rule.get("check_fn")
        if not fn_name:
            continue
        # 动态规则（margin_blowup）单独处理，跳过
        if rule.get("is_dynamic"):
            continue
        # 判断是否命中
        is_hit = any(x["rule"]["id"] == rule["id"] for x in hit_items)
        if is_hit:
            # 找到对应的命中详情
            hit_detail = next((x["detail"] for x in hit_items if x["rule"]["id"] == rule["id"]), "")
            all_rules.append({
                "id": rule["id"],
                "name": rule["name"],
                "add_rate": rule.get("add_rate", 0),
                "hit": True,
                "detail": hit_detail,
                "level": rule.get("level", "base"),
            })
        else:
            all_rules.append({
                "id": rule["id"],
                "name": rule["name"],
                "add_rate": rule.get("add_rate", 0),
                "hit": False,
                "detail": "",
                "level": rule.get("level", "base"),
            })
    # 将穿仓风险加入 all_rules
    all_rules.append({
        "id": "margin_blowup",
        "name": margin_item["name"],
        "add_rate": margin_item["add_rate"],
        "hit": margin_res["hit"],
        "detail": margin_item["detail"],
        "level": margin_item["level"],
    })

    return {
        "ts_code": ts_code,
        "name": info.get("name", ts_code),
        "stock_type": cache["stock_type"],
        "market_cap_yi": round(cache["mv"], 2) if cache.get("mv") else None,
        "pledge_ratio": round(cache["pledge"], 1) if cache.get("pledge") else None,
        "hits": [x["id"] for x in rate_breakdown],
        "rate_breakdown": rate_breakdown,
        "all_rules": all_rules,
        "margin_item": margin_item,
        "force_close_info": force_close_info,  # 强平规则
        "total_add": total_add,
        "base_rate": base_rate,
        "margin_pct": margin_pct,
        "account_rate": account_rate,
        "is_multi": len(rate_breakdown) >= 2,
    }


# ============================================================
# API 路由
# ============================================================

@app.route("/rules", methods=["GET"])
def get_rules():
    rules_out = []
    for r in RULES:
        item = {k: v for k, v in r.items() if k != "check_fn"}
        if "threshold_label" in item:
            item["threshold_label"] = item["threshold_label"].format(**item)
        # 动态计算 suggest_rate（基于 DEFAULT_BASE_RATE）
        if item.get("is_dynamic"):
            item["suggest_rate"] = None  # 动态规则无固定建议利率
        else:
            item["suggest_rate"] = round(DEFAULT_BASE_RATE + item.get("add_rate", 0), 2)
        rules_out.append(item)
    return jsonify({"base_rate": DEFAULT_BASE_RATE, "rules": rules_out})


@app.route("/check", methods=["POST"])
def check():
    data = request.get_json()
    stocks_raw = data.get("stocks", [])
    base_rate = float(data.get("base_rate", DEFAULT_BASE_RATE))
    margin_pct = int(data.get("margin_pct", 10))  # 保证金比例，默认10%
    if not stocks_raw:
        # 空股票时，按最高风险情形计算：命中全部规则
        all_add = sum(r["add_rate"] for r in RULES if r.get("add_rate") and r["id"] != "normal")
        worst_rate = round(base_rate + all_add, 2)
        worst_rules = []
        for r in RULES:
            if r["id"] == "normal":
                continue
            worst_rules.append({"id": r["id"], "name": r["name"], "add_rate": r.get("add_rate", 0), "hit": True, "detail": ""})
        # 加上穿仓风险
        worst_rules.append({"id": "margin_blowup", "name": f"保证金覆盖不足风险（保证金{margin_pct}%）", "add_rate": 0, "hit": True, "detail": "含ST及科创/创业板，一个跌停可能即触发穿仓"})
        worst_result = {
            "ts_code": "UNKNOWN",
            "name": "任意股票（含ST/科创/创业板）",
            "account_rate": worst_rate,
            "hits": [r["id"] for r in worst_rules if r["hit"]],
            "all_rules": worst_rules,
            "is_worst_case": True,
        }
        return jsonify({
            "results": [worst_result],
            "account_rate": worst_rate,
            "account_add": round(worst_rate - base_rate, 2),
            "all_hits": worst_result["hits"],
            "base_rate": base_rate,
        })

    results = []
    for raw in stocks_raw[:10]:
        ts_code = normalize_code(raw)
        try:
            result = check_stock(ts_code, base_rate=base_rate, margin_pct=margin_pct)
        except Exception as e:
            result = {"ts_code": ts_code, "error": str(e)}
        results.append(result)

    valid = [r for r in results if "account_rate" in r]
    # 账户整体利率 = 所有股票中最高的应执行利率
    account_rate = max((r["account_rate"] for r in valid), default=base_rate)
    all_hits = list(set(h for r in valid for h in r.get("hits", [])))

    # 写入全局查询历史
    _add_to_history(valid, base_rate)

    return jsonify({
        "results": results,
        "account_rate": round(account_rate, 2),
        "account_add": round(account_rate - base_rate, 2),
        "all_hits": all_hits,
        "base_rate": base_rate,
    })


@app.route("/ping", methods=["GET"])
def ping():
    return jsonify({"status": "ok"})


# ============================================================
# 全局查询历史（内存存储，服务器重启后清空）
# 格式：[{ts_code, name, account_rate, hits, queried_at}, ...]
# ============================================================
import threading
_history_lock = threading.Lock()
_query_history = []   # 最新的在最前
MAX_HISTORY = 50      # 最多保留条数


@app.route("/history", methods=["GET"])
def get_history():
    """GET /history  返回全局查询历史，最新的在前"""
    with _history_lock:
        return jsonify({"history": list(_query_history)})


def _add_to_history(results, base_rate):
    """check 接口成功后调用，将每只股票写入历史"""
    now = datetime.now().strftime("%m-%d %H:%M")
    with _history_lock:
        for r in results:
            if "account_rate" not in r:
                continue
            # 如果已存在相同代码，先删除旧记录
            _query_history[:] = [h for h in _query_history if h["ts_code"] != r["ts_code"]]
            _query_history.insert(0, {
                "ts_code": r["ts_code"],
                "name": r.get("name", r["ts_code"]),
                "account_rate": r["account_rate"],
                "base_rate": base_rate,
                "hits": r.get("hits", []),
                "is_multi": r.get("is_multi", False),
                "queried_at": now,
            })
        # 超出上限时截断
        del _query_history[MAX_HISTORY:]


# 初始化本地股票数据库连接
import sqlite3 as _sqlite3
import os as _os
_DB_PATH = _os.path.join(_os.path.dirname(__file__), "stocks.db")

def _get_db():
    conn = _sqlite3.connect(_DB_PATH)
    conn.row_factory = _sqlite3.Row
    return conn


@app.route("/search", methods=["GET"])
def search_stock():
    """GET /search?code=600519  从本地数据库查询股票名称，毫秒级响应"""
    code = request.args.get("code", "").strip().lstrip("0") # 去除前导零便于匹配
    raw  = request.args.get("code", "").strip()
    if not raw or len(raw) < 4:
        return jsonify({"name": "", "ts_code": ""})
    try:
        conn = _get_db()
        c = conn.cursor()
        # 精确匹配
        c.execute("SELECT name, ts_code FROM stocks WHERE symbol = ?", (raw,))
        row = c.fetchone()
        if row:
            conn.close()
            return jsonify({"name": row["name"], "ts_code": row["ts_code"]})
        conn.close()
        return jsonify({"name": "", "ts_code": ""})
    except Exception as e:
        return jsonify({"name": "", "ts_code": "", "error": str(e)})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5050, debug=False)
