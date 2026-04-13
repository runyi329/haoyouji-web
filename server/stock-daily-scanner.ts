/**
 * 股票日线数据定时扫描器
 *
 * 功能：每个交易日北京时间 15:30 精确触发一次，从 Tushare 拉取当天全量日线数据，
 * 增量写入 ts_daily 表（已存在则跳过，避免重复）。
 *
 * 实现方式：用 setTimeout 精确计算距离下次 BJT 15:30 的毫秒数，到点触发后
 * 再递归设置下一个 24 小时定时器，全天只触发一次，不做无效轮询。
 */

import mysql from 'mysql2/promise';

const TUSHARE_TOKEN = '5762b219a162bab92c913a2281663934b2e20e5e02c07ce7e42dfd79';
const TUSHARE_URL = 'http://api.tushare.pro';
const DB_URL = process.env.ORIGINAL_DATABASE_URL ?? 'mysql://root:Miao@20190603@124.223.54.69:3306/crm_db';

/** 计算距离下一次 BJT HH:MM 的毫秒数 */
function msUntilBjt(hour: number, minute: number): number {
  const now = new Date();
  // 当前 BJT 时间
  const bjtNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  // 今天 BJT 目标时刻（UTC 表示）
  const target = new Date(Date.UTC(
    bjtNow.getUTCFullYear(),
    bjtNow.getUTCMonth(),
    bjtNow.getUTCDate(),
    hour - 8,   // 转回 UTC
    minute,
    0, 0
  ));
  // 如果今天的目标时刻已过，则等到明天同一时刻
  if (target.getTime() <= now.getTime()) {
    target.setUTCDate(target.getUTCDate() + 1);
  }
  return target.getTime() - now.getTime();
}

/** 获取北京时间当前日期字符串，格式 YYYYMMDD */
function getBjtTradeDate(): string {
  const now = new Date();
  const bjtMs = now.getTime() + 8 * 60 * 60 * 1000;
  const bjtDate = new Date(bjtMs);
  const y = bjtDate.getUTCFullYear();
  const m = String(bjtDate.getUTCMonth() + 1).padStart(2, '0');
  const d = String(bjtDate.getUTCDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

/** 判断今天是否是周末（北京时间） */
function isBjtWeekend(): boolean {
  const now = new Date();
  const bjtMs = now.getTime() + 8 * 60 * 60 * 1000;
  const dow = new Date(bjtMs).getUTCDay();
  return dow === 0 || dow === 6;
}

/**
 * 执行一次日线扫描：拉取指定交易日全量数据写入 ts_daily
 */
export async function runDailyScan(tradeDate: string): Promise<void> {
  console.log(`[股票扫描] 开始扫描 ${tradeDate} 日线数据...`);

  // 从 Tushare 按 trade_date 拉取全市场日线（A股约 5500 只，单次上限 8000）
  let allItems: any[] = [];
  let fields: string[] = [];
  const PAGE_SIZE = 8000;
  let offset = 0;

  while (true) {
    const resp = await fetch(TUSHARE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_name: 'daily',
        token: TUSHARE_TOKEN,
        params: { trade_date: tradeDate, limit: PAGE_SIZE, offset },
        fields: 'ts_code,trade_date,open,high,low,close,pre_close,chg,pct_chg,vol,amount',
      }),
      signal: AbortSignal.timeout(30000),
    });
    const json = await resp.json() as any;
    if (json.code !== 0 || !json.data?.items?.length) break;
    if (fields.length === 0) fields = json.data.fields;
    allItems = allItems.concat(json.data.items);
    if (json.data.items.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  if (allItems.length === 0) {
    console.log(`[股票扫描] ${tradeDate} 无数据（可能是非交易日），跳过`);
    return;
  }

  console.log(`[股票扫描] 拉取到 ${allItems.length} 条记录，开始写库...`);

  const fi = (name: string) => fields.indexOf(name);
  const tsCodeIdx = fi('ts_code');
  const tradeDateIdx = fi('trade_date');
  const openIdx = fi('open');
  const highIdx = fi('high');
  const lowIdx = fi('low');
  const closeIdx = fi('close');
  const preCloseIdx = fi('pre_close');
  const chgIdx = fi('chg');
  const pctChgIdx = fi('pct_chg');
  const volIdx = fi('vol');
  const amountIdx = fi('amount');

  const conn = await mysql.createConnection(DB_URL);
  try {
    // 查询当天已有哪些股票，避免重复
    const [existRows] = await conn.execute(
      'SELECT ts_code FROM ts_daily WHERE trade_date = ?', [tradeDate]
    ) as any[];
    const existSet = new Set<string>(existRows.map((r: any) => r.ts_code));
    const newItems = allItems.filter(row => !existSet.has(String(row[tsCodeIdx])));

    console.log(`[股票扫描] 已有 ${existSet.size} 条，新增 ${newItems.length} 条`);
    if (newItems.length === 0) {
      console.log(`[股票扫描] ${tradeDate} 数据已是最新，无需写入`);
      return;
    }

    // 分批 500 条插入
    const BATCH = 500;
    let inserted = 0;
    for (let i = 0; i < newItems.length; i += BATCH) {
      const batch = newItems.slice(i, i + BATCH);
      const placeholders = batch.map(() => '(?,?,?,?,?,?,?,?,?,?,?,NOW())').join(',');
      const values: any[] = [];
      for (const row of batch) {
        values.push(
          String(row[tsCodeIdx]),
          String(row[tradeDateIdx]),
          row[openIdx] != null ? Number(row[openIdx]) : null,
          row[highIdx] != null ? Number(row[highIdx]) : null,
          row[lowIdx] != null ? Number(row[lowIdx]) : null,
          row[closeIdx] != null ? Number(row[closeIdx]) : null,
          row[preCloseIdx] != null ? Number(row[preCloseIdx]) : null,
          row[chgIdx] != null ? Number(row[chgIdx]) : null,
          row[pctChgIdx] != null ? Number(row[pctChgIdx]) : null,
          row[volIdx] != null ? Number(row[volIdx]) : null,
          row[amountIdx] != null ? Number(row[amountIdx]) : null,
        );
      }
      await conn.execute(
        `INSERT INTO ts_daily (ts_code, trade_date, open, high, low, close, pre_close, chg, pct_chg, vol, amount, updated_at) VALUES ${placeholders}`,
        values
      );
      inserted += batch.length;
    }
    console.log(`[股票扫描] ${tradeDate} 写入完成，共插入 ${inserted} 条`);
  } finally {
    await conn.end();
  }
}

/** 递归精确定时：每次触发后自动设置下一个 24 小时定时器 */
function scheduleNext(): void {
  const ms = msUntilBjt(15, 30);
  const nextTime = new Date(Date.now() + ms);
  console.log(`[股票扫描] 下次触发时间: ${nextTime.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })} (BJT 15:30)`);

  setTimeout(async () => {
    try {
      if (!isBjtWeekend()) {
        const tradeDate = getBjtTradeDate();
        console.log(`[股票扫描] 精确触发 BJT 15:30 - ${tradeDate}`);
        await runDailyScan(tradeDate);
      } else {
        console.log(`[股票扫描] 今天是周末，跳过扫描`);
      }
    } catch (err) {
      console.error('[股票扫描] 执行失败:', err);
    } finally {
      scheduleNext(); // 无论成功失败，都设置下一次
    }
  }, ms);
}

/** 启动定时扫描器 */
export function startStockDailyScanner(): void {
  scheduleNext();
  console.log('[股票扫描] 已注册，每个交易日北京时间 15:30 精确触发一次');
}
