import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
const deps = vi.hoisted(() => ({ db: vi.fn(), tx: vi.fn() }));
vi.mock('./db', () => ({ getDbConnection: deps.db, getDbTransactionConnection: deps.tx }));
vi.mock('./price-scanner', () => ({ fetchIntradayStockQuotes: vi.fn(), getUsdtCnyRate: () => 7, refreshUsdtCnyRate: vi.fn(), resolveUsStockExchange: vi.fn(), searchManualStocks: vi.fn() }));
vi.mock('./crypto-portfolio-quotes', () => ({ fetchCryptoPortfolioQuotes: vi.fn(), getCachedCryptoPortfolioQuote: vi.fn(), searchCryptoPortfolio: vi.fn() }));
vi.mock('./crypto-portfolio-fx', () => ({ getLiveCryptoUsdtCnyQuote: vi.fn() }));
import { LEDGER37_AI_DISPLAY_KEY as key } from '../shared/ledger37-ai-presentation';
import { getLedger37PresentationContext, setLedger37AiDisplay } from './ledger37-ai-presentation';
import { getR1StockPresentationContext, assertR1RawReadAllowed } from './r1-stock-presentation';
import { getStockTagMode, getStockLotParticipationMatrix, getMyStockTagOverview, getMyStockTagObservationOverview,
  createStockTagEvent, voidStockTagEvent, correctStockTagEvent, updateStockTagLotNote,
  setStockLotObservation, setStockLotParticipation, updateStockTagSale, updateStockTagBuy } from './ledger-stock-portfolio';

const ownerId = 870413;
const personas = [
  { label: 'real owner with member role', userId: ownerId, memberRole: 'member', systemRole: 'user', full: true, calendar: true },
  { label: 'ledger admin', userId: 201, memberRole: 'admin', systemRole: 'user', full: false, calendar: true },
  { label: 'ordinary member', userId: 201, memberRole: 'member', systemRole: 'user', full: false, calendar: false },
  ...['admin', 'super_admin', 'systemadmin'].map(systemRole => ({ label: `nonowner system ${systemRole}`, userId: 201, memberRole: 'member', systemRole, full: false, calendar: false })),
  { label: 'forged member owner role', userId: 201, memberRole: 'owner', systemRole: 'admin', full: false, calendar: false },
];
const matrix = personas.flatMap(person => [false, true].flatMap(aiEnabled => [false, true].map(isViewingAs => ({ ...person, aiEnabled, isViewingAs }))));
function fixture(person: typeof personas[number], aiEnabled: boolean, storedOwner?: unknown) {
  if (arguments.length < 3) storedOwner = ownerId;
  const log: Array<{ sql: string; values: any[] }> = [];
  const raw = JSON.stringify({ [key]: aiEnabled ? 1 : 0 });
  const conn = { beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), execute: vi.fn(async (sql: string, values: any[] = []) => {
    log.push({ sql, values });
    if (/FROM ledgers l/.test(sql)) return [[{ ledger_id: 37, ledger_owner_id: storedOwner, member_user_id: person.userId, member_role: person.memberRole, initialBalances: raw }]];
    if (/FROM ledger_categories c/.test(sql)) return [[{ id: 301, ledgerId: 37, name: 'R1', parentId: null, accounting_mode: 'stock_portfolio', ledger_owner_id: storedOwner, member_user_id: person.userId, member_role: person.memberRole, initialBalances: raw }]];
    if (/SELECT id, ownerId AS ledger_owner_id FROM ledgers/.test(sql)) return [[{ id: 37, ledger_owner_id: storedOwner }]];
    if (/FROM ledger_members/.test(sql)) return [[{ id: 1, userId: person.userId, role: person.memberRole, initial_balances: raw }, { id: 2, userId: 202, role: 'member', initial_balances: JSON.stringify({ [key]: 1 }) }]];
    if (/information_schema/.test(sql)) return [[]];
    // Owner's old maintenance path is reached, but no real initialization is allowed.
    if (/^\s*(?:CREATE|ALTER)/.test(sql)) throw new Error('OWNER_AUTHORIZED_NO_REAL_DDL');
    throw new Error('离线测试禁止未授权SQL：' + sql);
  }) };
  deps.db.mockResolvedValue(conn); deps.tx.mockResolvedValue(conn);
  return { conn, log };
}
const writes = [
  { name: 'buy', fn: createStockTagEvent, fields: { eventType: 'buy', symbol: 'AAPL', quantity: 1, executionPrice: 10 } },
  { name: 'sell and profit allocation', fn: createStockTagEvent, fields: { eventType: 'sell', lotId: 1, symbol: 'AAPL', quantity: 1, executionPrice: 10, profitAllocations: [{ userId: 202, percentage: 100 }] } },
  { name: 'void', fn: voidStockTagEvent, fields: { eventId: 1, reason: 'offline' } },
  { name: 'correct', fn: correctStockTagEvent, fields: { eventId: 1, eventType: 'buy', reason: 'offline' } },
  { name: 'lot note', fn: updateStockTagLotNote, fields: { lotId: 1, note: 'offline' } },
  { name: 'observation configuration', fn: setStockLotObservation, fields: { lotId: 1, targetUserId: 202, enabled: true, quantity: 1 } },
  { name: 'participation and price/date', fn: setStockLotParticipation, fields: { lotId: 1, targetUserId: 202, quantity: 1, entryPrice: 10, startDate: '2026-11-01' } },
  { name: 'sale price and profit ratios', fn: updateStockTagSale, fields: { eventId: 1, executionPrice: 10, actualTradedAt: '2026-11-01', profitAllocations: [] } },
  { name: 'opening order safe edit', fn: updateStockTagBuy, fields: { lotId: 1, eventId: 1, quantity: 1, executionPrice: 10, actualTradedAt: '2026-11-01T02:00:00.000Z', note: 'offline', reason: 'offline', expected: { quantity: 1, executionPrice: 10, actualTradedAt: '2026-11-01T02:00:00.000Z', note: '' } } },
];
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv('DEV_BYPASS_AUTH', 'false'); vi.stubEnv('PREVIEW_READONLY', 'false'); vi.stubGlobal('fetch', vi.fn(() => { throw new Error('离线禁止网络'); })); });
afterEach(() => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('37 actual owner-only permission matrix and independent calendar capability', () => {
  it.each(matrix)('$label AI=$aiEnabled viewingAs=$isViewingAs context/raw/setter', async person => {
    const f = fixture(person, person.aiEnabled);
    const input = { ledgerId: 37 as const, categoryId: 301, userId: person.userId, systemRole: person.systemRole, isViewingAs: person.isViewingAs };
    const full = person.full && !person.isViewingAs;
    const ai = await getLedger37PresentationContext(input);
    expect(ai).toMatchObject({ canManage: full, canRecordCalendar: person.calendar && !person.isViewingAs, aiEnabled: person.aiEnabled, isViewingAs: person.isViewingAs });
    const r1 = await getR1StockPresentationContext(input);
    expect(r1).toMatchObject({ canManage: full, aiEnabled: person.aiEnabled });
    if (person.aiEnabled && !full) {
      expect(() => assertR1RawReadAllowed(r1)).toThrow('安全参与收益接口');
      await expect(getStockTagMode(input)).rejects.toThrow('安全参与收益接口');
    } else {
      expect(() => assertR1RawReadAllowed(r1)).not.toThrow();
      expect(await getStockTagMode(input)).toMatchObject({ accountingMode: 'stock_portfolio', canEdit: full });
    }
    const setter = { ...input, targetUserId: 202, enabled: true };
    if (full) await expect(setLedger37AiDisplay(setter)).resolves.toEqual({ success: true, aiEnabled: true });
    else await expect(setLedger37AiDisplay(setter)).rejects.toThrow(person.isViewingAs ? '代看' : '所有者');
    expect(f.log.every(row => /^\s*SELECT/.test(row.sql))).toBe(true);
    if (!full) {
      await expect(getStockLotParticipationMatrix(input)).rejects.toThrow(person.aiEnabled ? '安全参与收益接口' : '所有者');
    }
  });
  it.each(matrix)('$label AI=$aiEnabled viewingAs=$isViewingAs rejects every stock write before any side effect', async person => {
    for (const writer of writes) {
      const f = fixture(person, person.aiEnabled);
      const input: any = { ledgerId: 37, categoryId: 301, userId: person.userId, systemRole: person.systemRole, isViewingAs: person.isViewingAs, ...writer.fields };
      if (person.full && !person.isViewingAs) {
        await expect(writer.fn(input), writer.name).rejects.toThrow(writer.name === 'observation configuration' ? '尚未初始化' : 'OWNER_AUTHORIZED_NO_REAL_DDL');
      } else {
        await expect(writer.fn(input), writer.name).rejects.toThrow(person.isViewingAs ? '代看' : '所有者');
        expect(f.log.every(row => /^\s*SELECT/.test(row.sql)), writer.name).toBe(true);
        expect(f.log).toHaveLength(person.isViewingAs ? 0 : 1);
      }
      expect(deps.tx).not.toHaveBeenCalled();
      expect(f.conn.beginTransaction).not.toHaveBeenCalled();
    }
  });
  it.each([undefined, null, '', 0, 201, '201', '870413'])('owner comes only from SQL alias, not names/roles/constants: %s', async storedOwner => {
    const person = personas[0]; fixture(person, true, storedOwner);
    expect((await getLedger37PresentationContext({ ledgerId: 37, userId: person.userId, systemRole: 'admin' })).canManage).toBe(storedOwner === '870413');
  });
  it('ownerId can change without code change; old owner loses full access immediately', async () => {
    const person = personas[1]; fixture(person, false, person.userId);
    expect((await getLedger37PresentationContext({ ledgerId: 37, userId: person.userId })).canManage).toBe(true);
    fixture(person, false, ownerId);
    expect((await getLedger37PresentationContext({ ledgerId: 37, userId: person.userId })).canManage).toBe(false);
  });
  it('non37 overview compatibility stays empty and never reads DB', async () => {
    expect(await getMyStockTagOverview({ ledgerId: 52, userId: 201, systemRole: 'admin' })).toEqual([]);
    expect(await getMyStockTagObservationOverview({ ledgerId: 52, userId: 201 })).toEqual({ categories: [] });
    await expect(createStockTagEvent({ ledgerId: 52, categoryId: 301, userId: ownerId, eventType: 'buy' })).rejects.toThrow('仅适用于37');
    expect(deps.db).not.toHaveBeenCalled(); expect(deps.tx).not.toHaveBeenCalled();
  });
  it('production manager SQL reads ledgers.ownerId, never hardcodes owner ID or display name', () => {
    for (const name of ['ledger37-ai-presentation.ts', 'r1-stock-presentation.ts', 'ledger-stock-portfolio.ts']) {
      const source = readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
      expect(source).toContain('ownerId AS ledger_owner_id');
      expect(source).not.toMatch(/870413|JIMG|canRecordLedger37Calendar.*stock/i);
    }
  });
});
