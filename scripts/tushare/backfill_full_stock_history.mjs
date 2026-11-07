#!/usr/bin/env node
/**
 * A股上市以来历史日线补全。默认只读核验；--apply 才写 ts_daily/ts_stock_lifecycle。
 * 环境：DATABASE_URL（或 ORIGINAL_DATABASE_URL）、TUSHARE_TOKEN。
 * 例：node scripts/tushare/backfill_full_stock_history.mjs --apply --run-dir=/private/run
 * 只增补缺失日线/填充NULL字段，不删除数据、不覆盖现有非空行情、不触碰账户表。
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import mysql from 'mysql2/promise';
import { completedCutoff, isTradeDate, historySegments, validateDailyResponse, summarizeRows } from './stock_history_core.mjs';

const arg = name => process.argv.find(v => v.startsWith(`--${name}=`))?.slice(name.length + 3);
const apply = process.argv.includes('--apply');
const dbUrl = process.env.ORIGINAL_DATABASE_URL || process.env.DATABASE_URL;
const token = process.env.TUSHARE_TOKEN;
if (!dbUrl || !token) throw new Error('请通过环境变量提供数据库连接与Tushare凭证');
const runDir = path.resolve(arg('run-dir') || './stock-history-run');
const cutoff = arg('cutoff') || completedCutoff();
if (!isTradeDate(cutoff) || cutoff > completedCutoff()) throw new Error('截止日不能超出已完成交易日');
const concurrency = Number(arg('concurrency') || 6);
let intervalMs = Number(arg('interval-ms') || 500);
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8 || !Number.isFinite(intervalMs) || intervalMs < 200) throw new Error('并发1-8，请求间隔至少200毫秒');
const requestedCodes = arg('codes')?.split(',').filter(Boolean);
const force = process.argv.includes('--force-recheck');
const STARTED = Date.now();
const FIELDS = 'ts_code,trade_date,open,high,low,close,pre_close,change,pct_chg,vol,amount';
const PRICE_COLUMNS = ['open', 'high', 'low', 'close', 'pre_close', 'chg', 'pct_chg', 'vol', 'amount'];
let aborted = false, nextRequestAt = 0, failures = 0, requests = 0;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const log = (...parts) => console.log(new Date().toISOString(), ...parts);
const jsonString = value => JSON.stringify(value, null, 2) + '\n';
function atomicJSON(filename, value) {
  const tmp = `${filename}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, jsonString(value), { mode: 0o600 });
  fs.renameSync(tmp, filename);
}
function saveGzip(filename, value) {
  const tmp = `${filename}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, gzipSync(JSON.stringify(value)), { mode: 0o600 });
  fs.renameSync(tmp, filename);
}
fs.mkdirSync(runDir, { recursive: true, mode: 0o700 });
for (const dir of ['source', 'before', 'probe']) fs.mkdirSync(path.join(runDir, dir), { recursive: true, mode: 0o700 });
const progressFile = path.join(runDir, 'progress.json');
const progress = fs.existsSync(progressFile) ? JSON.parse(fs.readFileSync(progressFile, 'utf8')) : {
  version: 1, cutoff, startedAt: new Date().toISOString(), completed: {}, failed: {}, verifiedOnly: {},
};
if (progress.version !== 1 || progress.cutoff !== cutoff) throw new Error('断点目录与截止日不匹配，请用原截止日续跑或新目录');
progress.updatedAt = new Date().toISOString();
function saveProgress() { progress.updatedAt = new Date().toISOString(); atomicJSON(progressFile, progress); }

async function throttled() {
  if (aborted) throw new Error('任务已停止');
  const now = Date.now(), slot = Math.max(now, nextRequestAt);
  nextRequestAt = slot + intervalMs;
  await sleep(slot - now);
  if (aborted) throw new Error('任务已停止');
}
function curlApi(params) {
  return new Promise((resolve, reject) => {
    const child = spawn('curl', ['-fsS', '--proto', '=https', '--connect-timeout', '10', '--max-time', '45', '-H', 'Content-Type: application/json', '--data-binary', '@-', 'https://api.tushare.pro'], { stdio: ['pipe', 'pipe', 'pipe'] });
    let body = '', tooLarge = false;
    child.stdout.on('data', chunk => { body += chunk; if (body.length > 15_000_000) { tooLarge = true; child.kill(); } });
    child.stderr.resume();
    child.on('error', () => reject(new Error('行情请求进程启动失败')));
    child.on('close', code => {
      if (code || tooLarge) return reject(new Error('行情网络请求失败或响应过大'));
      try { resolve(JSON.parse(body)); } catch { reject(new Error('行情响应不是有效JSON')); }
    });
    child.stdin.end(JSON.stringify({ api_name: 'daily', token, params: { ...params, limit: 6000 }, fields: FIELDS }));
  });
}
async function fetchSegment(tsCode, segment) {
  const filename = path.join(runDir, 'source', `${tsCode}-${segment.start}-${segment.end}.json.gz`);
  if (fs.existsSync(filename)) return validateDailyResponse(JSON.parse(gunzipSync(fs.readFileSync(filename))), { tsCode, ...segment });
  const probe = path.join(runDir, 'probe', `${tsCode}-${segment.start}-${segment.end}.json`);
  if (fs.existsSync(probe)) {
    const json = JSON.parse(fs.readFileSync(probe, 'utf8'));
    const rows = validateDailyResponse(json, { tsCode, ...segment });
    saveGzip(filename, json);
    return rows;
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await throttled(); requests++;
      const json = await curlApi({ ts_code: tsCode, start_date: segment.start, end_date: segment.end });
      if (json.code !== 0) {
        const message = String(json.msg || '数据源返回错误');
        if (/频|每分钟|rate|limit/i.test(message)) {
          intervalMs = Math.max(intervalMs, 1300);
          nextRequestAt = Math.max(nextRequestAt, Date.now() + 61_000);
          log('数据源限流，降低频率并等待恢复');
        } else if (/权限|无权|token|积分/i.test(message)) { aborted = true; throw new Error('历史接口权限或凭证不足，已停止'); }
        throw new Error(`行情接口失败：${message.slice(0, 180)}`);
      }
      const rows = validateDailyResponse(json, { tsCode, ...segment });
      saveGzip(filename, json);
      return rows;
    } catch (error) {
      if (aborted || attempt === 4) throw error;
      log(tsCode, `${segment.start}-${segment.end}`, `重试${attempt + 1}/4`, error.message);
      await sleep(Math.min(1000 * 2 ** attempt, 15_000));
    }
  }
}

const master = await mysql.createConnection({ uri: dbUrl, connectTimeout: 15_000, enableKeepAlive: true });
let pool;
try {
  const [lock] = await master.execute("SELECT GET_LOCK('a_share_full_history_backfill_v1', 0) AS acquired");
  if (Number(lock[0].acquired) !== 1) throw new Error('已有历史补全正在执行，拒绝并行重复任务');
  pool = mysql.createPool({ uri: dbUrl, connectionLimit: concurrency, connectTimeout: 15_000, enableKeepAlive: true, waitForConnections: true, queueLimit: concurrency * 2 });
  const [indices] = await master.execute("SELECT INDEX_NAME,NON_UNIQUE,GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS cols FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ts_daily' GROUP BY INDEX_NAME,NON_UNIQUE");
  if (!indices.some(row => Number(row.NON_UNIQUE) === 0 && row.cols === 'ts_code,trade_date')) throw new Error('日线表缺少代码+日期唯一约束，拒绝写入');
  const [basicColumns] = await master.execute("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ts_stock_basic'");
  const delistExpr = basicColumns.some(row => row.COLUMN_NAME === 'delist_date') ? 'delist_date' : 'NULL AS delist_date';
  const [stocks] = await master.execute(`SELECT ts_code,name,list_date,list_status,${delistExpr} FROM ts_stock_basic WHERE list_status IN ('L','D') ORDER BY ts_code ASC`);
  if (requestedCodes?.some(code => !stocks.some(s => s.ts_code === code))) throw new Error('指定股票不在当前A股真实列表中');
  if (!fs.existsSync(path.join(runDir, 'basic-before.json'))) atomicJSON(path.join(runDir, 'basic-before.json'), stocks);
  if (apply && !fs.existsSync(path.join(runDir, 'lifecycle-before.json.gz'))) {
    const [before] = await master.execute('SELECT * FROM ts_stock_lifecycle ORDER BY ts_code');
    saveGzip(path.join(runDir, 'lifecycle-before.json.gz'), before);
  }
  const eligible = requestedCodes ? stocks.filter(s => requestedCodes.includes(s.ts_code)) : stocks;
  const todo = eligible.filter(s => force || !progress.completed[s.ts_code]);
  progress.targetStocks = stocks.length;
  progress.scope = requestedCodes || 'all';
  progress.status = 'running';
  delete progress.finishedAt;
  saveProgress();
  log(`模式：${apply ? '真实增补与重算' : '只读核验'}`, `截止${cutoff}`, `目标${eligible.length}只，本次待处理${todo.length}只`, `并发${concurrency}`);
  let processed = 0, cursor = 0;
  const heartbeat = setInterval(() => log('进度', `${processed}/${todo.length}`, '累计完整', Object.keys(progress.completed).length, '本次失败', failures, '接口请求', requests, '运行分钟', ((Date.now() - STARTED) / 60000).toFixed(1)), 30_000);
  let lockCheckPending = false;
  const lockHeartbeat = setInterval(() => {
    if (aborted || lockCheckPending) return;
    lockCheckPending = true;
    master.execute({ sql: "SELECT IS_USED_LOCK('a_share_full_history_backfill_v1') AS owner", timeout: 10_000 }).then(([rows]) => {
      if (Number(rows[0].owner) !== master.threadId) { aborted = true; log('历史任务锁已失效，停止新任务'); }
    }).catch(() => { aborted = true; log('任务锁连接已断开，停止新任务'); }).finally(() => { lockCheckPending = false; });
  }, 20_000);
  const stop = () => { aborted = true; log('收到停止信号，等待当前股票安全结束'); };
  process.once('SIGTERM', stop); process.once('SIGINT', stop);

  async function processStock(stock) {
    const segments = historySegments(stock.list_date, cutoff, stock.delist_date);
    const rows = [];
    for (const segment of segments) rows.push(...await fetchSegment(stock.ts_code, segment));
    const expected = summarizeRows(rows);
    if (expected.totalDays === 0) throw new Error('上市以来数据源未提供任何日线，不能标记全生命周期完成');
    const connection = await pool.getConnection();
    try {
      const end = segments.at(-1).end;
      const [existing] = await connection.execute('SELECT * FROM ts_daily WHERE ts_code=? AND trade_date>=? AND trade_date<=? ORDER BY trade_date', [stock.ts_code, stock.list_date, end]);
      if (apply) {
        const backupPath = path.join(runDir, 'before', `${stock.ts_code}.json.gz`);
        if (!fs.existsSync(backupPath)) saveGzip(backupPath, existing);
        await connection.beginTransaction();
        // 2000×11参数低于MySQL预处理参数上限；减少跨地域连接的往返次数。
        for (let i = 0; i < rows.length; i += 2000) {
          const batch = rows.slice(i, i + 2000);
          const placeholders = batch.map(() => '(?,?,?,?,?,?,?,?,?,?,?)').join(',');
          const values = batch.flatMap(r => [r.tsCode, r.tradeDate, r.open, r.high, r.low, r.close, r.preClose, r.chg, r.pctChg, r.vol, r.amount]);
          const fillNulls = PRICE_COLUMNS.map(col => `\`${col}\`=COALESCE(\`${col}\`,VALUES(\`${col}\`))`).join(',');
          await connection.execute(`INSERT INTO ts_daily (ts_code,trade_date,open,high,low,close,pre_close,chg,pct_chg,vol,amount) VALUES ${placeholders} ON DUPLICATE KEY UPDATE ${fillNulls}`, values);
        }
        const [stored] = await connection.execute('SELECT trade_date,pct_chg FROM ts_daily WHERE ts_code=? AND trade_date>=? AND trade_date<=? ORDER BY trade_date', [stock.ts_code, stock.list_date, end]);
        const actual = summarizeRows(stored.map(r => ({ tradeDate: r.trade_date, pctChg: r.pct_chg == null ? null : Number(r.pct_chg) })));
        const sourceMap = new Map(rows.map(r => [r.tradeDate, Math.sign(r.pctChg)]));
        if (stored.length !== rows.length || stored.some(r => !sourceMap.has(r.trade_date) || Math.sign(Number(r.pct_chg)) !== sourceMap.get(r.trade_date))) throw new Error('数据库历史日期/涨跌方向与源数据不一致，已回滚，需单独核对');
        for (const k of ['upDays', 'downDays', 'flatDays', 'totalDays', 'upRate']) if (actual[k] !== expected[k]) throw new Error(`统计校验不一致：${k}`);
        await connection.execute('INSERT INTO ts_stock_lifecycle (ts_code,up_days,down_days,flat_days,total_days,up_rate) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE up_days=VALUES(up_days),down_days=VALUES(down_days),flat_days=VALUES(flat_days),total_days=VALUES(total_days),up_rate=VALUES(up_rate),updated_at=NOW()', [stock.ts_code, actual.upDays, actual.downDays, actual.flatDays, actual.totalDays, actual.upRate]);
        if (aborted) throw new Error('任务停止，当前股票回滚');
        await connection.commit();
      }
      const record = { name: stock.name, listDate: stock.list_date, listStatus: stock.list_status, requestedThrough: end, segments: segments.length, sourceHash: createHash('sha256').update(JSON.stringify(rows)).digest('hex'), ...expected, priorCachedDays: existing.length, newDays: rows.length - existing.length, verifiedAt: new Date().toISOString() };
      if (apply) progress.completed[stock.ts_code] = record;
      else progress.verifiedOnly[stock.ts_code] = record;
      delete progress.failed[stock.ts_code];
      saveProgress();
      return record;
    } catch (error) {
      if (apply) { try { await connection.rollback(); } catch {} }
      throw error;
    } finally { connection.release(); }
  }
  try {
    await Promise.all(Array.from({ length: concurrency }, async () => {
      while (!aborted && cursor < todo.length) {
        const stock = todo[cursor++];
        try {
          const result = await processStock(stock);
          if (processed < 5 || requestedCodes || (processed + 1) % 50 === 0) log('完成', stock.ts_code, stock.name, `${result.totalDays}天`, `上涨${result.upRate}%`, `新增${result.newDays}天`);
        } catch (error) {
          failures++;
          progress.failed[stock.ts_code] = { name: stock.name, message: String(error.message).slice(0, 350), at: new Date().toISOString() };
          saveProgress(); log('未完成', stock.ts_code, stock.name, error.message);
          if (failures >= 30 && processed < 50) { aborted = true; log('初期失败过多，安全停止以免重复无效请求'); }
        } finally { processed++; }
      }
    }));
  } finally {
    clearInterval(heartbeat); clearInterval(lockHeartbeat);
    process.removeListener('SIGTERM', stop); process.removeListener('SIGINT', stop);
  }
  progress.finishedAt = new Date().toISOString();
  progress.status = aborted ? 'stopped' : failures ? 'partial' : 'complete';
  saveProgress();
  const completeScope = eligible.every(stock => Boolean(progress.completed[stock.ts_code]));
  log('本次结束', `状态${progress.status}`, `累计完整${Object.keys(progress.completed).length}/${stocks.length}`, `未完成记录${Object.keys(progress.failed).length}`, `当前范围完整${completeScope}`);
  if (aborted || failures) process.exitCode = 2;
} finally {
  if (pool) await pool.end();
  try { await master.execute("SELECT RELEASE_LOCK('a_share_full_history_backfill_v1')"); } catch {}
  await master.end();
}
