/**
 * 港股日线数据定时扫描器
 *
 * 功能：每个港股交易日北京时间 16:30 首次触发（港股 16:00 收盘，留半小时等数据入库），
 * 若 Tushare 无数据则每小时重试至 21:00，从 Tushare 拉取当天全量港股日线数据，
 * 增量写入 hk_daily 表（已存在则跳过），并自动计算全生命周期趋势统计写入 hk_trend_cache。
 *
 * 与 A 股的主要差异：
 * 1. 使用 Tushare hk_daily 接口（而非 daily）
 * 2. 港股无涨跌停，用涨跌幅分布代替涨停聚集效应
 * 3. 表名前缀用 hk_ 代替 ts_
 * 4. 港股节假日（香港公众假期）需单独判断
 */
import mysql from 'mysql2/promise';

const TUSHARE_TOKEN = '5762b219a162bab92c913a2281663934b2e20e5e02c07ce7e42dfd79';
const TUSHARE_URL = 'https://api.tushare.pro';
const DB_URL = process.env.ORIGINAL_DATABASE_URL ?? 'mysql://root:Miao@20190603@124.223.54.69:3306/crm_db';

// 港股节假日（2025-2026年香港公众假期，不开市）
const HK_HOLIDAYS = new Set([
  // 2025
  '20250101', // 元旦
  '20250129', '20250130', '20250131', // 农历新年
  '20250404', // 清明节
  '20250418', // 耶稣受难节
  '20250419', // 耶稣受难节翌日
  '20250421', // 复活节星期一
  '20250501', // 劳动节
  '20250531', // 佛诞
  '20250702', // 香港回归纪念日（补假）
  '20251001', // 国庆节
  '20251007', // 重阳节
  '20251225', '20251226', // 圣诞节
  // 2026
  '20260101', // 元旦
  '20260217', '20260218', '20260219', // 农历新年
  '20260403', // 耶稣受难节
  '20260404', // 耶稣受难节翌日
  '20260406', // 复活节星期一
  '20260501', // 劳动节
  '20260520', // 佛诞
  '20260701', // 香港回归纪念日
  '20261001', // 国庆节
  '20261225', '20261226', // 圣诞节
]);

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

/** 判断某天是否是港股非交易日（周末或香港公众假期） */
function isHkNonTradingDay(dateStr: string): boolean {
  return isWeekend(dateStr) || HK_HOLIDAYS.has(dateStr);
}

/** 判断今天（北京时间）是否是港股非交易日 */
function isBjtHkNonTradingDay(): boolean {
  const today = getBjtTradeDate();
  return isHkNonTradingDay(today);
}

/**
 * 从数据库读取港股首日开盘价缓存
 */
async function loadHkFirstOpenCache(conn: mysql.Connection): Promise<Map<string, number>> {
  const firstOpen = new Map<string, number>();
  try {
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS hk_first_open_cache (
        ts_code VARCHAR(20) NOT NULL PRIMARY KEY,
        first_open DECIMAL(12,4) NOT NULL,
        first_date VARCHAR(8) NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    const [rows] = await conn.execute('SELECT ts_code, first_open FROM hk_first_open_cache') as any[];
    for (const row of rows) {
      firstOpen.set(row.ts_code, parseFloat(row.first_open));
    }
    console.log(`[港股扫描] 首日开盘价缓存加载 ${firstOpen.size} 只股票`);
  } catch (err) {
    console.warn('[港股扫描] 首日开盘价缓存读取失败:', err);
  }
  return firstOpen;
}

/**
 * 根据当天行情数据更新港股首日开盘价缓存（新股上市时写入）
 */
async function updateHkFirstOpenCache(
  conn: mysql.Connection,
  tradeDate: string,
  items: any[][],
  fields: string[]
): Promise<void> {
  const tsCodeIdx = fields.indexOf('ts_code');
  const openIdx = fields.indexOf('open');
  if (tsCodeIdx < 0 || openIdx < 0) return;

  // 检查哪些股票在 hk_first_open_cache 中还没有记录
  const [existing] = await conn.execute('SELECT ts_code FROM hk_first_open_cache') as any[];
  const existingSet = new Set(existing.map((r: any) => r.ts_code));

  const newEntries: any[] = [];
  for (const row of items) {
    const code = String(row[tsCodeIdx]);
    const open = row[openIdx] != null ? parseFloat(row[openIdx]) : null;
    if (!existingSet.has(code) && open && open > 0) {
      newEntries.push([code, open, tradeDate]);
    }
  }

  if (newEntries.length > 0) {
    const BATCH = 500;
    for (let i = 0; i < newEntries.length; i += BATCH) {
      const batch = newEntries.slice(i, i + BATCH);
      await conn.execute(
        `INSERT IGNORE INTO hk_first_open_cache (ts_code, first_open, first_date) VALUES ${batch.map(() => '(?,?,?)').join(',')}`,
        batch.flat()
      );
    }
    console.log(`[港股扫描] 首日开盘价缓存新增 ${newEntries.length} 只股票`);
  }
}

/**
 * 根据当天行情数据计算并写入 hk_trend_cache（全生命周期趋势）
 */
async function updateHkTrendCache(
  conn: mysql.Connection,
  tradeDate: string,
  items: any[][],
  fields: string[]
): Promise<void> {
  // 确保表存在
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS hk_trend_cache (
      id INT AUTO_INCREMENT PRIMARY KEY,
      trade_date VARCHAR(8) NOT NULL,
      market VARCHAR(10) NOT NULL DEFAULT 'all',
      above INT NOT NULL DEFAULT 0,
      below INT NOT NULL DEFAULT 0,
      equal_cnt INT NOT NULL DEFAULT 0,
      UNIQUE KEY uk_date_market (trade_date, market)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  const firstOpen = await loadHkFirstOpenCache(conn);
  if (firstOpen.size === 0) {
    console.warn('[港股扫描] 首日开盘价缓存为空，跳过趋势缓存更新');
    return;
  }

  const tsCodeIdx = fields.indexOf('ts_code');
  const closeIdx = fields.indexOf('close');

  let above = 0, below = 0, equal = 0;
  for (const row of items) {
    const code = String(row[tsCodeIdx]);
    const close = row[closeIdx] != null ? parseFloat(row[closeIdx]) : null;
    if (!close || close <= 0) continue;
    const fo = firstOpen.get(code);
    if (!fo || fo <= 0) continue;
    const diff = (close - fo) / fo;
    if (diff > 0.001) above++;
    else if (diff < -0.001) below++;
    else equal++;
  }

  await conn.execute(`
    INSERT INTO hk_trend_cache (trade_date, market, above, below, equal_cnt)
    VALUES (?, 'all', ?, ?, ?)
    ON DUPLICATE KEY UPDATE above=VALUES(above), below=VALUES(below), equal_cnt=VALUES(equal_cnt)
  `, [tradeDate, above, below, equal]);

  console.log(`[港股扫描] hk_trend_cache 已更新 ${tradeDate}：↑${above}/↓${below}/=${equal}`);
}

/**
 * 根据当天行情数据计算并写入 hk_pct_distribution（涨跌幅分布，替代A股涨停聚集效应）
 */
async function updateHkPctDistribution(
  conn: mysql.Connection,
  tradeDate: string,
  items: any[][],
  fields: string[]
): Promise<void> {
  // 确保表存在
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS hk_pct_distribution (
      id INT AUTO_INCREMENT PRIMARY KEY,
      trade_date VARCHAR(8) NOT NULL UNIQUE,
      total_count INT NOT NULL DEFAULT 0,
      buckets_json TEXT NOT NULL,
      up5_count INT NOT NULL DEFAULT 0,
      down5_count INT NOT NULL DEFAULT 0,
      up10_count INT NOT NULL DEFAULT 0,
      down10_count INT NOT NULL DEFAULT 0
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  const pctChgIdx = fields.indexOf('pct_chg');
  if (pctChgIdx < 0) return;

  const bucketMap = new Map<number, number>();
  let total = 0;
  let up5 = 0, down5 = 0, up10 = 0, down10 = 0;

  for (const row of items) {
    const pct = row[pctChgIdx];
    if (pct == null) continue;
    const pctNum = parseFloat(pct);
    if (isNaN(pctNum)) continue;

    // 统计特殊区间
    if (pctNum >= 5) up5++;
    if (pctNum <= -5) down5++;
    if (pctNum >= 10) up10++;
    if (pctNum <= -10) down10++;

    // 按 0.5% 分桶，范围 -15% ~ +15%
    const clamped = Math.max(-15, Math.min(15, pctNum));
    const bucket = Math.round(clamped * 2) / 2;
    bucketMap.set(bucket, (bucketMap.get(bucket) ?? 0) + 1);
    total++;
  }

  // 生成完整区间列表
  const buckets: { bucket: number; count: number }[] = [];
  for (let v = -15; v <= 15.01; v += 0.5) {
    const bv = Math.round(v * 2) / 2;
    buckets.push({ bucket: bv, count: bucketMap.get(bv) ?? 0 });
  }

  await conn.execute(`
    INSERT INTO hk_pct_distribution (trade_date, total_count, buckets_json, up5_count, down5_count, up10_count, down10_count)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      total_count=VALUES(total_count), buckets_json=VALUES(buckets_json),
      up5_count=VALUES(up5_count), down5_count=VALUES(down5_count),
      up10_count=VALUES(up10_count), down10_count=VALUES(down10_count)
  `, [tradeDate, total, JSON.stringify(buckets), up5, down5, up10, down10]);

  console.log(`[港股扫描] hk_pct_distribution 已更新 ${tradeDate}，共 ${total} 只，涨5%+: ${up5}，跌5%+: ${down5}`);
}

/**
 * 执行一次港股日线扫描：拉取指定交易日全量数据写入 hk_daily，并更新相关统计表
 * 返回 true 表示有数据写入，false 表示 Tushare 无数据（可能是非交易日或数据未入库）
 */
export async function runHkDailyScan(tradeDate: string): Promise<boolean> {
  console.log(`[港股扫描] 开始扫描 ${tradeDate} 日线数据...`);

  let allItems: any[][] = [];
  let fields: string[] = [];
  const PAGE_SIZE = 5000;
  let offset = 0;

  // 分页拉取港股日线数据
  while (true) {
    const resp = await fetch(TUSHARE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_name: 'hk_daily',
        token: TUSHARE_TOKEN,
        params: { trade_date: tradeDate, limit: PAGE_SIZE, offset },
        fields: 'ts_code,trade_date,open,high,low,close,pre_close,chg,pct_chg,vol,amount',
      }),
      signal: AbortSignal.timeout(30000),
    });

    const json = await resp.json() as any;
    if (json.code !== 0) {
      console.error(`[港股扫描] Tushare 错误: code=${json.code}, msg=${json.msg}`);
      return false;
    }

    const data = json.data;
    if (!data?.items?.length) {
      if (offset === 0) {
        console.log(`[港股扫描] ${tradeDate} Tushare 无数据（可能是非交易日或数据未入库）`);
        return false;
      }
      break; // 已拉完所有数据
    }

    if (fields.length === 0) fields = data.fields;
    allItems = allItems.concat(data.items);
    console.log(`[港股扫描] 已拉取 ${allItems.length} 条...`);

    if (data.items.length < PAGE_SIZE) break; // 最后一页
    offset += PAGE_SIZE;

    // 避免频率限制（hk_daily 限制 2次/分钟）
    await new Promise(r => setTimeout(r, 35000));
  }

  console.log(`[港股扫描] ${tradeDate} 共拉取 ${allItems.length} 条港股日线数据`);

  const conn = await mysql.createConnection(DB_URL);
  try {
    // 确保 hk_daily 表存在
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS hk_daily (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ts_code VARCHAR(20) NOT NULL,
        trade_date VARCHAR(8) NOT NULL,
        open DECIMAL(12,4),
        high DECIMAL(12,4),
        low DECIMAL(12,4),
        close DECIMAL(12,4),
        pre_close DECIMAL(12,4),
        chg DECIMAL(12,4),
        pct_chg DECIMAL(8,4),
        vol DECIMAL(20,4),
        amount DECIMAL(20,4),
        UNIQUE KEY uk_code_date (ts_code, trade_date),
        INDEX idx_trade_date (trade_date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // 批量写入 hk_daily
    const fi = (name: string) => fields.indexOf(name);
    const BATCH = 500;
    let inserted = 0;

    for (let i = 0; i < allItems.length; i += BATCH) {
      const batch = allItems.slice(i, i + BATCH);
      const placeholders = batch.map(() => '(?,?,?,?,?,?,?,?,?,?,?)').join(',');
      const values: any[] = [];
      for (const row of batch) {
        values.push(
          row[fi('ts_code')], row[fi('trade_date')],
          row[fi('open')] != null ? Number(row[fi('open')]) : null,
          row[fi('high')] != null ? Number(row[fi('high')]) : null,
          row[fi('low')] != null ? Number(row[fi('low')]) : null,
          row[fi('close')] != null ? Number(row[fi('close')]) : null,
          row[fi('pre_close')] != null ? Number(row[fi('pre_close')]) : null,
          row[fi('chg')] != null ? Number(row[fi('chg')]) : null,
          row[fi('pct_chg')] != null ? Number(row[fi('pct_chg')]) : null,
          row[fi('vol')] != null ? Number(row[fi('vol')]) : null,
          row[fi('amount')] != null ? Number(row[fi('amount')]) : null,
        );
      }
      await conn.execute(
        `INSERT INTO hk_daily (ts_code, trade_date, open, high, low, close, pre_close, chg, pct_chg, vol, amount)
         VALUES ${placeholders}
         ON DUPLICATE KEY UPDATE
           open=VALUES(open), high=VALUES(high), low=VALUES(low), close=VALUES(close),
           pre_close=VALUES(pre_close), chg=VALUES(chg), pct_chg=VALUES(pct_chg),
           vol=VALUES(vol), amount=VALUES(amount)`,
        values
      );
      inserted += batch.length;
    }
    console.log(`[港股扫描] hk_daily 已写入 ${inserted} 条`);

    // 更新首日开盘价缓存（新股上市时写入）
    await updateHkFirstOpenCache(conn, tradeDate, allItems, fields);

    // 更新全生命周期趋势缓存
    await updateHkTrendCache(conn, tradeDate, allItems, fields);

    // 更新涨跌幅分布统计
    await updateHkPctDistribution(conn, tradeDate, allItems, fields);

  } finally {
    await conn.end();
  }

  return true;
}

/**
 * 启动时检查最近 7 天是否有缺失的港股数据，自动补拉
 */
async function checkAndBackfillHk(): Promise<void> {
  try {
    const conn = await mysql.createConnection(DB_URL);
    let latestDate = '';
    try {
      try {
        const [rows] = await conn.execute("SELECT MAX(trade_date) AS latest FROM hk_trend_cache WHERE market='all'") as any[];
        latestDate = rows[0]?.latest ?? '';
      } catch {
        const [rows] = await conn.execute('SELECT MAX(trade_date) AS latest FROM hk_daily') as any[];
        latestDate = rows[0]?.latest ?? '';
      }
    } finally {
      await conn.end();
    }

    if (!latestDate) {
      console.log('[港股扫描] 启动检查：数据库无历史数据，跳过补拉');
      return;
    }

    const today = getBjtTradeDate();
    const missingDates: string[] = [];
    for (let i = 1; i <= 10; i++) {
      const d = getBjtDateOffset(i);
      if (d <= latestDate) break;
      if (!isHkNonTradingDay(d) && d < today) {
        missingDates.push(d);
      }
    }

    // 若当前北京时间已过 16:30，且今天是港股交易日，且今天数据还没有，立即补拉今天
    const nowBjt = new Date(Date.now() + 8 * 60 * 60 * 1000);
    const bjHour = nowBjt.getUTCHours();
    const bjMin = nowBjt.getUTCMinutes();
    const pastHkClose = bjHour > 16 || (bjHour === 16 && bjMin >= 30);
    if (pastHkClose && !isBjtHkNonTradingDay() && latestDate < today) {
      missingDates.push(today);
    }

    if (missingDates.length === 0) {
      console.log(`[港股扫描] 启动检查：数据已是最新（${latestDate}），无需补拉`);
      return;
    }

    console.log(`[港股扫描] 启动检查：发现 ${missingDates.length} 个缺失交易日，开始补拉: ${missingDates.join(', ')}`);
    for (const d of missingDates.reverse()) {
      try {
        await runHkDailyScan(d);
        await new Promise(r => setTimeout(r, 40000)); // 避免频率限制
      } catch (err) {
        console.error(`[港股扫描] 补拉 ${d} 失败:`, err);
      }
    }
    console.log('[港股扫描] 启动补拉完成');
  } catch (err) {
    console.error('[港股扫描] 启动检查失败:', err);
  }
}

/**
 * 每日定时扫描：16:30 首次触发（港股 16:00 收盘，留 30 分钟等数据入库）。
 * 若 Tushare 当天数据尚未入库（返回空），则每隔 1 小时自动重试，最多重试到 21:00。
 * 一旦成功写入数据，停止当天重试，并安排下一个港股交易日 16:30 的定时器。
 */
function scheduleHkNext(retryHour?: number, retryMinute?: number): void {
  let ms: number;
  let label: string;
  if (retryHour !== undefined) {
    ms = msUntilBjt(retryHour, retryMinute ?? 0);
    label = `BJT ${retryHour}:${String(retryMinute ?? 0).padStart(2, '0')}（重试）`;
  } else {
    ms = msUntilBjt(16, 30);
    label = 'BJT 16:30';
  }

  const nextTime = new Date(Date.now() + ms);
  console.log(`[港股扫描] 下次触发时间: ${nextTime.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })} (${label})`);

  setTimeout(async () => {
    let scheduledRetry = false;
    try {
      if (!isBjtHkNonTradingDay()) {
        const tradeDate = getBjtTradeDate();
        const triggerLabel = retryHour !== undefined ? `${retryHour}:00 重试` : '16:30 首触';
        console.log(`[港股扫描] 触发 ${triggerLabel} - ${tradeDate}`);

        let gotData = false;
        let lastErr: any;

        // 最多 3 次网络重试（针对超时/网络错误，非数据为空）
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            const result = await runHkDailyScan(tradeDate);
            gotData = result === true;
            lastErr = null;
            break;
          } catch (err) {
            lastErr = err;
            console.error(`[港股扫描] 第 ${attempt} 次执行失败:`, err);
            if (attempt < 3) {
              console.log('[港股扫描] 5 分钟后重试...');
              await new Promise(r => setTimeout(r, 5 * 60 * 1000));
            }
          }
        }

        if (lastErr) {
          console.error('[港股扫描] 3 次重试均失败，本次扫描放弃');
        }

        if (!gotData) {
          // Tushare 无数据，判断是否还有重试机会（最多到 21:00）
          const currentHour = retryHour ?? 16;
          if (currentHour < 21) {
            const nextRetry = currentHour + 1;
            console.log(`[港股扫描] ${tradeDate} Tushare 暂无数据，将在 ${nextRetry}:00 重试`);
            scheduleHkNext(nextRetry, 0);
            scheduledRetry = true;
          } else {
            console.log(`[港股扫描] ${tradeDate} 已重试至 21:00 仍无数据，放弃，等待明天`);
          }
        } else {
          console.log(`[港股扫描] ${tradeDate} 数据写入成功，停止重试`);
        }
      } else {
        console.log('[港股扫描] 今天是港股非交易日，跳过扫描');
      }
    } catch (err) {
      console.error('[港股扫描] 执行失败:', err);
    } finally {
      if (!scheduledRetry) {
        scheduleHkNext(); // 安排明天 16:30
      }
    }
  }, ms);
}

/** 启动港股定时扫描器 */
export function startHkStockDailyScanner(): void {
  const instanceId = process.env.NODE_APP_INSTANCE;
  if (instanceId !== undefined && instanceId !== '0') {
    console.log(`[港股扫描] cluster worker ${instanceId}，跳过（只由 worker 0 运行）`);
    return;
  }

  // 启动时检查并补拉缺失数据（延迟 60 秒，等服务完全启动）
  setTimeout(() => {
    checkAndBackfillHk().catch(err => console.error('[港股扫描] 启动补拉异常:', err));
  }, 60 * 1000);

  scheduleHkNext();
  console.log('[港股扫描] 已注册，每个港股交易日北京时间 16:30 首触，无数据则每小时重试至 21:00（含启动自动补拉）');
}
