"""
股票量化回测分析服务
FastAPI 微服务，端口 8001
"""
import os
import json
import base64
import tempfile
from datetime import datetime, timedelta
from typing import Optional

import numpy as np
import pandas as pd
import yfinance as yf
import vectorbt as vbt
import plotly.graph_objects as go
from plotly.subplots import make_subplots
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from openai import OpenAI
from fpdf import FPDF

app = FastAPI(title="量化回测服务")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# OpenAI 客户端（使用环境变量中的 API Key）
client = OpenAI(
    api_key=os.environ.get("BUILT_IN_FORGE_API_KEY", os.environ.get("OPENAI_API_KEY", "")),
    base_url=os.environ.get("BUILT_IN_FORGE_API_URL", "https://api.openai.com/v1"),
)


# ─── 请求/响应模型 ─────────────────────────────────────────────

class StrategyRequest(BaseModel):
    description: str  # 自然语言策略描述


class BacktestRequest(BaseModel):
    symbol: str          # 股票代码，如 600519.SS / AAPL
    start_date: str      # 回测开始日期 YYYY-MM-DD
    end_date: str        # 回测结束日期 YYYY-MM-DD
    strategy_type: str   # ma_cross / rsi / price_breakout
    fast_period: int = 20
    slow_period: int = 60
    rsi_period: int = 14
    rsi_buy: float = 30.0
    rsi_sell: float = 70.0
    stop_loss: float = 0.05   # 止损比例
    take_profit: float = 0.0  # 止盈比例（0=不设）
    initial_cash: float = 100000.0


class ParsedStrategy(BaseModel):
    symbol: str
    start_date: str
    end_date: str
    strategy_type: str
    fast_period: int
    slow_period: int
    rsi_period: int
    rsi_buy: float
    rsi_sell: float
    stop_loss: float
    take_profit: float
    description_summary: str


# ─── 工具函数 ─────────────────────────────────────────────────

def fetch_price_data(symbol: str, start: str, end: str) -> pd.DataFrame:
    """获取股价数据，支持 A股（.SS/.SZ）和美股"""
    try:
        ticker = yf.Ticker(symbol)
        df = ticker.history(start=start, end=end, auto_adjust=True)
        if df.empty:
            raise ValueError(f"无法获取 {symbol} 的数据，请检查股票代码")
        return df
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"获取数据失败: {str(e)}")


def run_backtest(req: BacktestRequest) -> dict:
    """执行回测，返回指标和图表数据"""
    df = fetch_price_data(req.symbol, req.start_date, req.end_date)
    close = df["Close"]
    
    # ── 生成买卖信号 ──
    if req.strategy_type == "ma_cross":
        fast_ma = vbt.MA.run(close, req.fast_period)
        slow_ma = vbt.MA.run(close, req.slow_period)
        entries = fast_ma.ma_crossed_above(slow_ma)
        exits = fast_ma.ma_crossed_below(slow_ma)
    elif req.strategy_type == "rsi":
        rsi = vbt.RSI.run(close, req.rsi_period)
        entries = rsi.rsi_crossed_below(req.rsi_buy)
        exits = rsi.rsi_crossed_above(req.rsi_sell)
    else:  # price_breakout：20日高点突破
        high_20 = close.rolling(20).max().shift(1)
        low_20 = close.rolling(20).min().shift(1)
        entries = close > high_20
        exits = close < low_20

    # ── 执行回测 ──
    sl_stop = req.stop_loss if req.stop_loss > 0 else None
    tp_stop = req.take_profit if req.take_profit > 0 else None
    
    pf = vbt.Portfolio.from_signals(
        close,
        entries,
        exits,
        init_cash=req.initial_cash,
        sl_stop=sl_stop,
        tp_stop=tp_stop,
        freq="D",
    )

    # ── 计算指标 ──
    stats = pf.stats()
    total_return = float(pf.total_return())
    annual_return = float(pf.annualized_return()) if hasattr(pf, 'annualized_return') else (
        (1 + total_return) ** (365 / max((pd.Timestamp(req.end_date) - pd.Timestamp(req.start_date)).days, 1)) - 1
    )
    max_dd = float(pf.max_drawdown())
    sharpe = float(pf.sharpe_ratio()) if not np.isnan(pf.sharpe_ratio()) else 0.0
    
    # 胜率和平均持仓
    trades = pf.trades.records_readable
    win_rate = 0.0
    avg_holding = 0.0
    trade_count = 0
    if len(trades) > 0:
        trade_count = len(trades)
        wins = trades[trades["PnL"] > 0]
        win_rate = len(wins) / trade_count * 100
        if "Duration" in trades.columns:
            avg_holding = float(trades["Duration"].dt.days.mean()) if hasattr(trades["Duration"].dt, "days") else 0.0

    # ── 生成净值曲线图（Plotly JSON）──
    nav = pf.value()
    benchmark = close / close.iloc[0] * req.initial_cash

    fig = make_subplots(
        rows=2, cols=1,
        shared_xaxes=True,
        row_heights=[0.65, 0.35],
        subplot_titles=["资产净值曲线", "K线与买卖信号"],
        vertical_spacing=0.08,
    )

    # 净值曲线
    fig.add_trace(go.Scatter(
        x=nav.index, y=nav.values,
        name="策略净值", line=dict(color="#D32F2F", width=2)
    ), row=1, col=1)
    fig.add_trace(go.Scatter(
        x=benchmark.index, y=benchmark.values,
        name="基准（持有不动）", line=dict(color="#888", width=1.5, dash="dot")
    ), row=1, col=1)

    # K线
    fig.add_trace(go.Candlestick(
        x=df.index,
        open=df["Open"], high=df["High"],
        low=df["Low"], close=df["Close"],
        name="K线",
        increasing_line_color="#D32F2F",
        decreasing_line_color="#2E7D32",
        showlegend=False,
    ), row=2, col=1)

    # 买卖信号标注
    entry_dates = close.index[entries.values] if hasattr(entries, 'values') else close.index[entries]
    exit_dates = close.index[exits.values] if hasattr(exits, 'values') else close.index[exits]
    
    if len(entry_dates) > 0:
        fig.add_trace(go.Scatter(
            x=entry_dates, y=close[entry_dates],
            mode="markers", name="买入",
            marker=dict(symbol="triangle-up", size=10, color="#D32F2F"),
        ), row=2, col=1)
    if len(exit_dates) > 0:
        fig.add_trace(go.Scatter(
            x=exit_dates, y=close[exit_dates],
            mode="markers", name="卖出",
            marker=dict(symbol="triangle-down", size=10, color="#2E7D32"),
        ), row=2, col=1)

    fig.update_layout(
        height=600,
        margin=dict(l=10, r=10, t=40, b=10),
        paper_bgcolor="white",
        plot_bgcolor="#FAFAFA",
        legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1),
        xaxis_rangeslider_visible=False,
        xaxis2_rangeslider_visible=False,
    )

    chart_json = fig.to_json()

    return {
        "metrics": {
            "total_return": round(total_return * 100, 2),
            "annual_return": round(annual_return * 100, 2),
            "max_drawdown": round(max_dd * 100, 2),
            "sharpe_ratio": round(sharpe, 3),
            "win_rate": round(win_rate, 1),
            "avg_holding_days": round(avg_holding, 1),
            "trade_count": trade_count,
            "final_value": round(float(nav.iloc[-1]), 2),
            "initial_cash": req.initial_cash,
        },
        "chart_json": chart_json,
        "symbol": req.symbol,
        "start_date": req.start_date,
        "end_date": req.end_date,
    }


# ─── API 路由 ─────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/parse-strategy")
def parse_strategy(req: StrategyRequest) -> ParsedStrategy:
    """用 LLM 解析自然语言策略描述为结构化参数"""
    today = datetime.now().strftime("%Y-%m-%d")
    three_years_ago = (datetime.now() - timedelta(days=3*365)).strftime("%Y-%m-%d")

    system_prompt = """你是一个专业的量化交易策略解析器。
用户会用中文描述交易策略，你需要将其解析为JSON格式的结构化参数。

strategy_type 只能是以下三种之一：
- ma_cross：均线交叉策略（需要 fast_period 和 slow_period）
- rsi：RSI超买超卖策略（需要 rsi_period、rsi_buy、rsi_sell）
- price_breakout：价格突破策略（N日高点突破买入，N日低点跌破卖出）

A股代码格式：沪市用 .SS 后缀（如 600519.SS），深市用 .SZ 后缀（如 000858.SZ）
美股直接用 ticker（如 AAPL、TSLA）

如果用户没有指定日期，默认回测最近3年。
stop_loss 是止损比例（0.05 = 5%），0 表示不设止损。
take_profit 是止盈比例，0 表示不设止盈。"""

    user_prompt = f"""请解析以下交易策略，返回JSON格式：
{req.description}

今天日期：{today}
默认回测区间：{three_years_ago} 到 {today}

返回格式：
{{
  "symbol": "股票代码",
  "start_date": "YYYY-MM-DD",
  "end_date": "YYYY-MM-DD",
  "strategy_type": "ma_cross|rsi|price_breakout",
  "fast_period": 20,
  "slow_period": 60,
  "rsi_period": 14,
  "rsi_buy": 30.0,
  "rsi_sell": 70.0,
  "stop_loss": 0.05,
  "take_profit": 0.0,
  "description_summary": "一句话总结策略"
}}"""

    try:
        response = client.chat.completions.create(
            model="gpt-4.1-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            response_format={"type": "json_object"},
            temperature=0.1,
        )
        result = json.loads(response.choices[0].message.content)
        return ParsedStrategy(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"策略解析失败: {str(e)}")


@app.post("/backtest")
def backtest(req: BacktestRequest) -> dict:
    """执行回测并返回结果"""
    try:
        return run_backtest(req)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"回测执行失败: {str(e)}")


@app.post("/export-pdf")
def export_pdf(data: dict) -> dict:
    """生成PDF报告，返回 base64 编码"""
    try:
        metrics = data.get("metrics", {})
        symbol = data.get("symbol", "")
        start_date = data.get("start_date", "")
        end_date = data.get("end_date", "")
        strategy_desc = data.get("strategy_desc", "")
        chart_image_b64 = data.get("chart_image_b64", "")

        pdf = FPDF()
        pdf.add_page()
        
        # 尝试加载中文字体，失败则用默认字体
        font_paths = [
            "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
            "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
        ]
        font_loaded = False
        for fp in font_paths:
            if os.path.exists(fp):
                pdf.add_font("CJK", "", fp, uni=True)
                font_loaded = True
                break
        
        def set_font(size=12, style=""):
            if font_loaded:
                pdf.set_font("CJK", style, size)
            else:
                pdf.set_font("Helvetica", style, size)

        # 标题
        pdf.set_fill_color(211, 47, 47)
        pdf.rect(0, 0, 210, 30, "F")
        set_font(18, "B")
        pdf.set_text_color(255, 255, 255)
        pdf.set_xy(10, 8)
        pdf.cell(0, 14, "股票量化回测分析报告", ln=True)

        pdf.set_text_color(0, 0, 0)
        pdf.set_xy(10, 35)
        set_font(10)
        pdf.cell(0, 6, f"股票代码：{symbol}    回测区间：{start_date} ~ {end_date}", ln=True)
        pdf.cell(0, 6, f"生成时间：{datetime.now().strftime('%Y-%m-%d %H:%M')}", ln=True)

        # 策略描述
        pdf.set_xy(10, 52)
        set_font(12, "B")
        pdf.cell(0, 8, "策略描述", ln=True)
        set_font(10)
        pdf.multi_cell(190, 6, strategy_desc or "用户自定义策略")

        # 核心指标
        pdf.set_xy(10, pdf.get_y() + 5)
        set_font(12, "B")
        pdf.cell(0, 8, "核心回测指标", ln=True)

        indicator_data = [
            ("总收益率", f"{metrics.get('total_return', 0):.2f}%"),
            ("年化收益率", f"{metrics.get('annual_return', 0):.2f}%"),
            ("最大回撤", f"{metrics.get('max_drawdown', 0):.2f}%"),
            ("夏普比率", f"{metrics.get('sharpe_ratio', 0):.3f}"),
            ("胜率", f"{metrics.get('win_rate', 0):.1f}%"),
            ("交易次数", f"{metrics.get('trade_count', 0)} 次"),
            ("平均持仓天数", f"{metrics.get('avg_holding_days', 0):.1f} 天"),
            ("最终资产", f"¥{metrics.get('final_value', 0):,.2f}"),
        ]

        set_font(10)
        y = pdf.get_y()
        for i, (label, value) in enumerate(indicator_data):
            col = i % 2
            row = i // 2
            x = 10 + col * 95
            yy = y + row * 12
            pdf.set_xy(x, yy)
            pdf.set_fill_color(249, 249, 249)
            pdf.rect(x, yy, 90, 10, "F")
            pdf.set_xy(x + 2, yy + 2)
            pdf.cell(44, 6, label + "：")
            pdf.set_xy(x + 46, yy + 2)
            color = (211, 47, 47) if "收益" in label or "胜率" in label else (0, 0, 0)
            pdf.set_text_color(*color)
            pdf.cell(42, 6, value)
            pdf.set_text_color(0, 0, 0)

        # 图表（如果有）
        if chart_image_b64:
            try:
                img_data = base64.b64decode(chart_image_b64)
                with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
                    tmp.write(img_data)
                    tmp_path = tmp.name
                pdf.set_xy(10, pdf.get_y() + 55)
                set_font(12, "B")
                pdf.cell(0, 8, "净值曲线图", ln=True)
                pdf.image(tmp_path, x=10, w=190)
                os.unlink(tmp_path)
            except Exception:
                pass

        # 风险提示
        pdf.set_xy(10, pdf.get_y() + 5)
        set_font(9)
        pdf.set_text_color(150, 150, 150)
        pdf.multi_cell(190, 5, "风险提示：历史回测结果不代表未来收益，投资有风险，入市需谨慎。本报告仅供参考，不构成投资建议。")

        pdf_bytes = pdf.output(dest="S").encode("latin-1")
        pdf_b64 = base64.b64encode(pdf_bytes).decode("utf-8")
        return {"pdf_base64": pdf_b64}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF生成失败: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
