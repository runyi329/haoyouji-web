/**
 * 股票日线数据定时扫描器
 *
 * 功能：每个交易日北京时间 15:30 精确触发一次，从 Tushare 拉取当天全量日线数据，
 * 增量写入 ts_daily 表（已存在则跳过，避免重复）。
 *
 * 修复（v2）：
 * 1. PM2 cluster 模式下只在 worker id=0（或非 cluster 模式）运行，避免多实例竞争
 * 2. 启动时检查最近 3 个工作日是否有缺失，自动补拉（解决重启导致漏拉问题）
 * 3. 增加重试机制：扫描失败后最多重试 2 次，每次间隔 5 分钟
 */

import mysql from 'mysql2/promise';

const TUSHARE_TOKEN = '5762b219a162bab92c913a2281663934b2e20e5e02c07ce7e42dfd79';
const TUSHARE_URL = 'http://api.tushare.pro';
const DB_URL = process.env.ORIGINAL_DATABASE_URL ?? 'mysql://root:Miao@20190603@124.223.54.69:3306/crm_db';

/** 计算距离下一次 BJT HH:MM 的毫秒数 */
function msUntilBjt(hour: number, minute: number): number {
  const now = new Date();
  const bjtNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const target = new Date(Date.UTC(
    bjtNow.getUTCFullYear(),
    bjtNow.getUTCMonth(),
    bjtNow.getUTCDate(),
    hour - 8,   // 转回 UTC
    minute,
    0, 0
  ));
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

/** 获取北京时间 N 天前的日期字符串，格式 YYYYMMDD */
function getBjtDateOffset(offsetDays: number): string {
  const now = new Date();
  const bjtMs = now.getTime() + 8 * 60 * 60 * 1000 - offsetDays * 24 * 60 * 60 * 1000;
  const bjtDate = new Date(bjtMs);
  const y = bjtDate.getUTCFullYear();
  const m = String(bjtDate.getUTCMonth() + 1).padStart(2, '0');
  const d = String(bjtDate.getUTCDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

/** 判断某天是否是周末（传入 YYYYMMDD 格式） */
function isWeekend(dateStr: string): boolean {
  const y = parseInt(dateStr.slice(0, 4));
  const m = parseInt(dateStr.slice(4, 6)) - 1;
  const d = parseInt(dateStr.slice(6, 8));
  const dow = new Date(Date.UTC(y, m, d)).getUTCDay();
  return dow === 0 || dow === 6;
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

/**
 * 启动时检查最近 5 个工作日是否有缺失数据，自动补拉
 * 解决 PM2 重启导致漏拉的问题
 */
async function checkAndBackfill(): Promise<void> {
  try {
    const conn = await mysql.createConnection(DB_URL);
    let latestDate = '';
    try {
      const [rows] = await conn.execute('SELECT MAX(trade_date) AS latest FROM ts_daily') as any[];
      latestDate = rows[0]?.latest ?? '';
    } finally {
      await conn.end();
    }

    if (!latestDate) return;

    // 检查最近 7 天（覆盖周末）中有哪些工作日缺失
    const today = getBjtTradeDate();
    const missingDates: string[] = [];
    for (let i = 1; i <= 7; i++) {
      const d = getBjtDateOffset(i);
      if (d <= latestDate) break; // 已有数据，不需要再往前查
      if (!isWeekend(d) && d < today) {
        missingDates.push(d);
      }
    }

    if (missingDates.length === 0) {
      console.log(`[股票扫描] 启动检查：数据已是最新（${latestDate}），无需补拉`);
      return;
    }

    console.log(`[股票扫描] 启动检查：发现 ${missingDates.length} 个缺失工作日，开始补拉: ${missingDates.join(', ')}`);
    for (const d of missingDates.reverse()) { // 从早到晚补拉
      try {
        await runDailyScan(d);
        await new Promise(r => setTimeout(r, 500));
      } catch (err) {
        console.error(`[股票扫描] 补拉 ${d} 失败:`, err);
      }
    }
    console.log(`[股票扫描] 启动补拉完成`);
  } catch (err) {
    console.error('[股票扫描] 启动检查失败:', err);
  }
}

/** 递归精确定时：每次触发后自动设置下一个 24 小时定时器，失败时重试 */
function scheduleNext(): void {
  const ms = msUntilBjt(15, 30);
  const nextTime = new Date(Date.now() + ms);
  console.log(`[股票扫描] 下次触发时间: ${nextTime.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })} (BJT 15:30)`);

  setTimeout(async () => {
    try {
      if (!isBjtWeekend()) {
        const tradeDate = getBjtTradeDate();
        console.log(`[股票扫描] 精确触发 BJT 15:30 - ${tradeDate}`);
        // 最多重试 2 次
        let lastErr: any;
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            await runDailyScan(tradeDate);
            lastErr = null;
            break;
          } catch (err) {
            lastErr = err;
            console.error(`[股票扫描] 第 ${attempt} 次执行失败:`, err);
            if (attempt < 3) {
              console.log(`[股票扫描] 5 分钟后重试...`);
              await new Promise(r => setTimeout(r, 5 * 60 * 1000));
            }
          }
        }
        if (lastErr) {
          console.error('[股票扫描] 3 次重试均失败，本次扫描放弃');
        }
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
  // PM2 cluster 模式下，只让 worker id=0 运行（避免多实例竞争）
  // process.env.NODE_APP_INSTANCE 由 PM2 注入，fork 模式下为 undefined
  const instanceId = process.env.NODE_APP_INSTANCE;
  if (instanceId !== undefined && instanceId !== '0') {
    console.log(`[股票扫描] cluster worker ${instanceId}，跳过（只由 worker 0 运行）`);
    return;
  }

  // 启动时检查并补拉缺失数据（延迟 30 秒，等服务完全启动）
  setTimeout(() => {
    checkAndBackfill().catch(err => console.error('[股票扫描] 启动补拉异常:', err));
  }, 30 * 1000);

  scheduleNext();
  console.log('[股票扫描] 已注册，每个交易日北京时间 15:30 精确触发一次（含启动自动补拉）');
}
