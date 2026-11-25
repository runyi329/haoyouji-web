import fs from 'node:fs';
import crypto from 'node:crypto';
import mysql from 'mysql2/promise';
import { portfolioCurrency } from '../shared/portfolio-instruments';
import { buildStockSaleFxLock, ensureStockSaleFxLocksTable, readStockSaleFxLocks, insertStockSaleFxLock, type StockSaleFxQuote } from '../server/stock-sale-fx-locks';

// Explicit, one-time operation. Never called by a GET handler or normal application startup.
const inputPath = process.argv.slice(2).find(arg => !arg.startsWith('--'));
const apply = process.argv.includes('--apply');
if (!inputPath || !process.env.DATABASE_URL) throw new Error('需要基准JSON路径和DATABASE_URL；默认只读预检，--apply才写入锁汇元数据');
const baseline = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const { sha256, ...unsigned } = baseline;
if (crypto.createHash('sha256').update(JSON.stringify(unsigned)).digest('hex') !== sha256) throw new Error('基准完整性校验失败');
if (baseline.version !== 1 || baseline.ledgerId !== 37 || baseline.categoryId !== 90250 || !Array.isArray(baseline.events) || baseline.events.length === 0) throw new Error('只允许已捕获的37号R1基准');
const quote: StockSaleFxQuote = { rate: Number(baseline.rateEvidence?.rate), asOf: baseline.rateEvidence?.asOf,
  source: baseline.rateEvidence?.source, pair: baseline.rateEvidence?.pair, stale: baseline.rateEvidence?.stale };
const locks = baseline.events.map((event: any) => {
  if (event.ledgerId !== 37 || event.categoryId !== 90250 || event.currency !== portfolioCurrency(event.symbol)) throw new Error('基准币种或租户范围不一致');
  const lock = buildStockSaleFxLock({ eventId: event.eventId, ledgerId:37, categoryId:90250,
    currency: event.currency, quote, lockedAt: baseline.capturedAt, lockKind:'existing_baseline' });
  if (lock.cnyRate !== event.cnyRate) throw new Error('基准折算汇率不一致');
  return lock;
});
if (new Set(locks.map((lock: any) => lock.eventId)).size !== locks.length) throw new Error('基准有重复卖出ID');
const conn = await mysql.createConnection({uri:process.env.DATABASE_URL});
try {
  if (!apply) await conn.execute('SET SESSION TRANSACTION READ ONLY');
  // DDL must precede the DML transaction: MySQL DDL implicitly commits.
  if (apply) await ensureStockSaleFxLocksTable(conn);
  await conn.beginTransaction();
  const ids = locks.map((lock: any) => lock.eventId);
  const [rows] = await conn.execute(`SELECT id,symbol,event_type,execution_price,quantity,transaction_fee FROM ledger_stock_events WHERE ledger_id=37 AND category_id=90250 AND status='active' AND event_type IN ('sell','reduce') AND id IN (${ids.map(()=>'?').join(',')})${apply ? ' FOR UPDATE' : ''}`,ids);
  if ((rows as any[]).length !== ids.length) throw new Error('基准卖出已变动，停止锁定');
  for (const row of rows as any[]) {
    const original = baseline.events.find((event: any) => event.eventId === Number(row.id));
    if (!original || original.symbol !== row.symbol || original.eventType !== row.event_type
      || Number(original.executionPrice) !== Number(row.execution_price) || Number(original.quantity) !== Number(row.quantity)
      || Number(original.transactionFee) !== Number(row.transaction_fee)) throw new Error('成交原记录已变动，停止锁定');
  }
  const existing = await readStockSaleFxLocks(conn,{ledgerId:37,categoryId:90250,eventIds:ids});
  let inserted = 0;
  for (const lock of locks) {
    const previous = existing.get(lock.eventId);
    if (previous) {
      if (previous.currency !== lock.currency || previous.cnyRate !== lock.cnyRate) throw new Error('已存在不同冻结汇率，禁止覆盖');
      continue;
    }
    if (apply) { await insertStockSaleFxLock(conn, lock); inserted++; }
  }
  if (apply) await conn.commit(); else await conn.rollback();
  console.log(JSON.stringify({applied:apply,readonly:!apply,ledgerId:37,categoryId:90250,
    capturedAt:baseline.capturedAt,saleEvents:locks.length,alreadyLocked:existing.size,
    pending:locks.length-existing.size,inserted,rates:[...new Set(locks.map((lock: any)=>lock.cnyRate))],
    modifiesOriginalTrades:false,modifiesWallets:false}));
} catch (error) {await conn.rollback();throw error;} finally {await conn.end();}
