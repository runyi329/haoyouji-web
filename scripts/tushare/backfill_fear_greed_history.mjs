#!/usr/bin/env node
/** Finite A-share sentiment historical aggregation backfill.
 * --apply writes ONLY ai_fear_greed_market_daily. No ledger rows, raw quote rewrites or schedulers.
 * Credentials: DATABASE_URL / ORIGINAL_DATABASE_URL and TUSHARE_TOKEN; HTTPS only.
 */
import fs from 'node:fs';
import path from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import mysql from 'mysql2/promise';
const arg = key => process.argv.find(x => x.startsWith(`--${key}=`))?.slice(key.length + 3);
const apply = process.argv.includes('--apply');
const runDir = path.resolve(arg('run-dir') || './fear-greed-aggregate-run');
const cutoff = arg('cutoff');
const days = Number(arg('days') || 816), maxDays = Number(arg('max-days') || 1000), concurrency = Number(arg('concurrency') || 2);
let interval = Number(arg('interval-ms') || 1500);
const token = process.env.TUSHARE_TOKEN, uri = process.env.ORIGINAL_DATABASE_URL || process.env.DATABASE_URL;
if (!token || !uri) throw new Error('请通过环境变量提供已授权行情和数据库配置');
if (!/^\d{8}$/.test(cutoff || '') || cutoff > new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10).replace(/-/g, '')) throw new Error('必须指定已完成的行情截止日');
if (!Number.isInteger(days) || days < 564 || days > 1000 || !Number.isInteger(concurrency) || concurrency < 1 || concurrency > 2 || !Number.isFinite(interval) || interval < 1300 || !Number.isInteger(maxDays) || maxDays < 1) throw new Error('日期范围或低负载参数无效');
for (const dir of [runDir, ...['source'].map(x => path.join(runDir, x))]) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const coreFile = path.join(runDir, 'market-core.mjs');
await build({ stdin: { contents: `export * from ${JSON.stringify(path.join(root, 'shared/ai-fear-greed-market.ts'))};export * from ${JSON.stringify(path.join(root, 'server/ai-fear-greed-market-store.ts'))};`, resolveDir: root, loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', target: 'node22', outfile: coreFile, logLevel: 'warning' });
const { aggregateAiFearGreedMarketDay, AI_FEAR_GREED_MARKET_SCHEMA_SQL, writeAiFearGreedMarketDay } = await import(pathToFileURL(coreFile).href);
const progressFile = path.join(runDir, 'progress.json');
const progress = fs.existsSync(progressFile) ? JSON.parse(fs.readFileSync(progressFile, 'utf8')) : { version: 2, cutoff, days, mode: apply ? 'apply' : 'verify', completed: {}, failed: {}, startedAt: new Date().toISOString() };
if (progress.version !== 2 || progress.cutoff !== cutoff || progress.days !== days || progress.mode !== (apply ? 'apply' : 'verify')) throw new Error('断点目录的日期、模式或范围不一致');
let stopped = false, nextAt = 0, requestCount = 0, failures = 0, processed = 0;
const started = Date.now(), sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const log = (...args) => console.log(new Date().toISOString(), ...args);
function atomicJSON(file, value) { const temp = file + '.tmp'; fs.writeFileSync(temp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 }); fs.renameSync(temp, file); }
function saveProgress() { progress.updatedAt = new Date().toISOString(); atomicJSON(progressFile, progress); }
const stop = () => { stopped = true; log('停止新日期，保留已核验日期断点'); };
process.once('SIGTERM', stop); process.once('SIGINT', stop);
async function api(name, params, fields) {
  for (let attempt = 0; attempt < 4; attempt++) {
    if (stopped) throw new Error('任务已停止');
    const slot = Math.max(nextAt, Date.now()); nextAt = slot + interval; await sleep(Math.max(0, slot - Date.now()));
    try {
      requestCount++;
      const response = await fetch('https://api.tushare.pro', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ api_name: name, token, params, fields }), signal: AbortSignal.timeout(35000) });
      if (!response.ok) throw new Error('供应商HTTP请求失败');
      const result = await response.json();
      if (result.code !== 0) {
        const message = String(result.msg || '');
        if (/权限|积分|无权|token/i.test(message)) { stopped = true; throw new Error('供应商权限或凭证不足'); }
        if (/频|rate|limit/i.test(message)) { interval = Math.max(interval, 1800); nextAt = Date.now() + 61000; log('供应商限流，降低频率后继续'); }
        throw new Error('供应商未返回成功数据');
      }
      if (!Array.isArray(result.data?.fields) || !Array.isArray(result.data?.items)) throw new Error('供应商结构异常');
      return result.data;
    } catch (error) {
      if (stopped || attempt === 3) throw new Error(error.message.includes('供应商') ? error.message : '行情网络请求失败');
      await sleep(2000 * (attempt + 1));
    }
  }
}
const sourceFields = 'ts_code,trade_date,open,high,low,close,pre_close,change,pct_chg,vol,amount';
async function sourceDay(date) {
  const file = path.join(runDir, 'source', date + '.json.gz');
  if (fs.existsSync(file)) return JSON.parse(gunzipSync(fs.readFileSync(file)));
  const combined = { fields: null, items: [] };
  for (let offset = 0; offset <= 12000; offset += 6000) {
    const data = await api('daily', { trade_date: date, limit: 6000, offset }, sourceFields);
    if (!combined.fields) combined.fields = data.fields;
    if (JSON.stringify(combined.fields) !== JSON.stringify(data.fields)) throw new Error('分页字段口径变化');
    combined.items.push(...data.items);
    if (data.items.length < 6000) break;
    if (offset === 12000) throw new Error('分页超出合理A股范围');
  }
  aggregateAiFearGreedMarketDay(combined.fields, combined.items, date);
  fs.writeFileSync(file, gzipSync(JSON.stringify(combined)), { mode: 0o600 });
  return combined;
}
const master = await mysql.createConnection({ uri, connectTimeout: 15000, enableKeepAlive: true });
let pool, heartbeat;
try {
  const [lock] = await master.execute("SELECT GET_LOCK('a_share_full_history_backfill_v1',0) AS acquired");
  if (Number(lock[0].acquired) !== 1) throw new Error('已有A股历史补齐任务，拒绝重复执行');
  if (apply) await master.execute(AI_FEAR_GREED_MARKET_SCHEMA_SQL);
  const calendarFile = path.join(runDir, 'calendar.json');
  let calendar;
  if (fs.existsSync(calendarFile)) calendar = JSON.parse(fs.readFileSync(calendarFile, 'utf8'));
  else {
    calendar = await api('trade_cal', { exchange: 'SSE', start_date: `${Number(cutoff.slice(0, 4)) - 5}0101`, end_date: cutoff, is_open: '1' }, 'exchange,cal_date,is_open');
    atomicJSON(calendarFile, calendar);
  }
  const di = calendar.fields.indexOf('cal_date'), oi = calendar.fields.indexOf('is_open');
  if (di < 0 || oi < 0) throw new Error('官方交易日历字段不足');
  const openDates = [...new Set(calendar.items.filter(x => Number(x[oi]) === 1).map(x => x[di]))].sort();
  if (openDates.some(x => !/^\d{8}$/.test(x) || x > cutoff) || openDates.length < days) throw new Error('官方交易日历范围不足');
  const target = openDates.slice(-days);
  progress.range = { start: target[0], end: target.at(-1), dates: target.length, calendarSource: 'Tushare trade_cal SSE' };
  if (apply) {
    // Pending placeholders preserve true source trading-day gaps; never bridge over unfetched dates.
    const placeholders = target.map(() => "(?,0,0,0,0,0,0,0,NULL,'pending',?,0,'shu-sz-a-share-v1',NULL)").join(',');
    await master.execute(`INSERT IGNORE INTO ai_fear_greed_market_daily (trade_date,raw_count,valid_count,up_count,down_count,up_amount,down_amount,total_amount,mean_return,source,source_hash,source_rows,universe,verified_at) VALUES ${placeholders}`, target.flatMap(date => [date, '0'.repeat(64)]));
  }
  progress.status = 'running'; saveProgress();
  // Newest first restores a real current score as soon as its complete historical window is available.
  const todo = target.filter(date => !progress.completed[date]).reverse().slice(0, maxDays);
  log('范围', target[0], '至', cutoff, '目标', target.length, '本次', todo.length, '模式', apply ? '独立指数历史入库' : '只读核验');
  pool = mysql.createPool({ uri, connectionLimit: concurrency, connectTimeout: 15000, enableKeepAlive: true, waitForConnections: true, queueLimit: 4 });
  heartbeat = setInterval(() => log('进度', `${Object.keys(progress.completed).length}/${target.length}`, '失败', failures, '请求', requestCount, '分钟', ((Date.now() - started) / 60000).toFixed(1)), 30000);
  async function one(date) {
    const data = await sourceDay(date);
    const row = aggregateAiFearGreedMarketDay(data.fields, data.items, date);
    const hash = createHash('sha256').update(JSON.stringify(data)).digest('hex');
    if (stopped) throw new Error('停止当前日期写入');
    if (apply) await writeAiFearGreedMarketDay(pool, row, hash, data.items.length);
    progress.completed[date] = { sourceRows: data.items.length, rawCount: row.rawCount, validCount: row.validCount, hash, verifiedAt: new Date().toISOString() };
    delete progress.failed[date]; saveProgress();
    if (processed < 3 || (processed + 1) % 25 === 0) log('完成', date, '沪深', row.rawCount, '有效', row.validCount);
  }
  let cursor = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (!stopped && cursor < todo.length) {
      const date = todo[cursor++];
      try { await one(date); }
      catch (error) {
        failures++; progress.failed[date] = { message: error.code ? `数据库错误类别 ${error.code}` : String(error.message).replaceAll(token, '[redacted]').slice(0, 240), at: new Date().toISOString() }; saveProgress();
        log('未补齐', date, progress.failed[date].message);
        if (failures >= 3) { stopped = true; log('累计三次失败，停止以核对数据'); }
      } finally { processed++; }
    }
  }));
  progress.status = stopped ? 'stopped' : target.every(x => progress.completed[x]) ? 'complete' : 'partial';
  progress.finishedAt = new Date().toISOString(); saveProgress();
  log('结束', progress.status, '完整', Object.keys(progress.completed).length, '/', target.length);
  if (failures || stopped) process.exitCode = 2;
} finally {
  clearInterval(heartbeat);
  if (pool) await pool.end();
  try { await master.execute("SELECT RELEASE_LOCK('a_share_full_history_backfill_v1')"); } catch {}
  await master.end();
}
