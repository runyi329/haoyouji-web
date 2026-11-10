import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  calculateOrdinaryTagObservationSummary,
  ordinaryTagObservationKey,
  ordinaryObservationAllocationPatch,
  assertOrdinaryObservationAllocationChange,
  readOrdinaryTagObservationConfig,
  validateOrdinaryTagObservationConfig,
  type OrdinaryTagObservationConfig,
  type OrdinaryTagObservationRecord,
} from '../shared/ordinary-tag-observation';

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  getDbConnection: vi.fn(),
  getDbTransactionConnection: vi.fn(() => { throw new Error('禁止资金连接'); }),
  getLedgerDb: vi.fn(() => { throw new Error('禁止旧账本初始化'); }),
  updateMyInitialBalances: vi.fn(() => { throw new Error('禁止覆盖真实配置'); }),
  ensureLedgerStockPortfolioTables: vi.fn(() => { throw new Error('禁止DDL'); }),
}));
// 必须完整拦截db模块：测试绝不加载生产连接、路由、定时器或执行真实SQL。
vi.mock('./db', () => ({
  getDbConnection: mocks.getDbConnection,
  getDbTransactionConnection: mocks.getDbTransactionConnection,
  getLedgerDb: mocks.getLedgerDb,
}));
vi.mock('./db-ledger', () => ({ updateMyInitialBalances: mocks.updateMyInitialBalances }));
vi.mock('./ledger-stock-portfolio', () => ({ ensureLedgerStockPortfolioTables: mocks.ensureLedgerStockPortfolioTables }));
import {
  adminGetOrdinaryTagObservationConfig,
  adminSetOrdinaryTagObservationConfig,
  getMyOrdinaryTagObservationOverview,
  getOrdinaryTagObservationPreviewSummary,
} from './ordinary-tag-observation';

const CONFIG: OrdinaryTagObservationConfig = {
  enabled: true, initialAmount: 1000, ratio: 50, startDate: '2026-11-02', pauseDate: null,
};
function record(date: string, type: OrdinaryTagObservationRecord['type'], amount: OrdinaryTagObservationRecord['amount'], description?: string): OrdinaryTagObservationRecord {
  return { ledgerId: 37, categoryId: 10, recordDate: date, type, amount, description };
}
function calculate(records: OrdinaryTagObservationRecord[], config: OrdinaryTagObservationConfig = CONFIG, today = '2026-11-09') {
  return calculateOrdinaryTagObservationSummary({ ledgerId: 37, userId: 201, categoryId: 10, categoryName: '普通', config, records, today });
}

describe('普通标签观察：AA对赌纯计算', () => {
  it('复用income/expense同日聚合，income>0优先income，方向不是一般市场收益', () => {
    const result = calculate([
      record('2026-11-02', 'income', '600'), record('2026-11-02', 'income', 300),
      record('2026-11-02', 'expense', 800), record('2026-11-03', 'expense', 850),
    ]);
    expect(result.points).toEqual([
      { date: '2026-11-02', balance: 900, pnl: 50, dailyPnl: null },
      { date: '2026-11-03', balance: 850, pnl: 75, dailyPnl: 25 },
    ]);
    expect(result.todayPnl).toBeNull();
    expect(result.status).toBe('active');
  });
  it('首点累计收益不能强制归零；首点没有上一真实余额时dailyPnl为null', () => {
    const result = calculate([record('2026-11-02', 'income', 1200)]);
    expect(result.totalPnl).toBe(-100);
    expect(result.points[0].dailyPnl).toBeNull();
  });
  it('开始日前最后余额只作daily基准，忽略开始日前所有现金流', () => {
    const result = calculate([
      record('2026-10-29', 'income', 1200), record('2026-11-01', 'income', 1100),
      record('2026-11-01', 'transfer', 999, 'capital_add:旧追加'), record('2026-11-01', 'transfer', 888, '旧提现'),
      record('2026-11-02', 'transfer', 100, 'capital_add'), record('2026-11-02', 'income', 1050),
    ]);
    expect(result.points).toEqual([{ date: '2026-11-02', balance: 1050, pnl: 25, dailyPnl: 75 }]);
    expect(result.capitalChange).toBe(100);
    expect(result.withdrawTotal).toBe(0);
  });
  it('同日资金按日期聚合；capital_add追加、其余capital_减少、其余transfer提现', () => {
    const result = calculate([
      record('2026-11-01', 'income', 1000), record('2026-11-02', 'income', 1000),
      record('2026-11-02', 'transfer', -200, 'capital_add更多'),
      record('2026-11-02', 'transfer', 40, 'capital_reduce'), record('2026-11-02', 'transfer', -20, 'capital_other'),
      record('2026-11-02', 'transfer', -30, '提现'),
    ]);
    expect(result.capitalChange).toBe(140);
    expect(result.withdrawTotal).toBe(30);
    expect(result.points[0]).toEqual({ date: '2026-11-02', balance: 1000, pnl: 55, dailyPnl: 55 });
  });
  it('两个余额日期之间的追加和提现只计一次，不把最后全部现金流倒灌历史', () => {
    const result = calculate([
      record('2026-11-02', 'income', 1000), record('2026-11-04', 'income', 1050),
      record('2026-11-03', 'transfer', 100, 'capital_add'), record('2026-11-04', 'transfer', 20, '提现'),
      record('2026-11-06', 'transfer', 500, 'capital_add'),
    ]);
    expect(result.points.map(p => p.pnl)).toEqual([0, 15]);
    expect(result.points[1].dailyPnl).toBe(15);
    expect(result.capitalChange).toBe(100); // 摘要与latestDate同期，余额后流不反推收益。
    expect(result.withdrawTotal).toBe(20);
  });
  it('daily间隔累计在真实余额处归零，跨无余额日仍保留资金变动', () => {
    const result = calculate([
      record('2026-11-02', 'income', 1000), record('2026-11-03', 'transfer', 100, 'capital_add'),
      record('2026-11-04', 'income', 1100), record('2026-11-09', 'expense', 1000),
    ]);
    expect(result.points.map(p => p.dailyPnl)).toEqual([null, 0, 50]);
    expect(result.todayPnl).toBe(50);
  });
  it('暂停包含暂停日本身，未来余额和现金流不能污染冻结结果', () => {
    const result = calculate([
      record('2026-11-01', 'income', 1000), record('2026-11-02', 'income', 950),
      record('2026-11-04', 'transfer', 100, 'capital_add'), record('2026-11-04', 'income', 1000),
      record('2026-11-05', 'transfer', 900, '提现'), record('2026-11-09', 'income', 100),
      record('2026-11-10', 'income', 5000),
    ], { ...CONFIG, pauseDate: '2026-11-04' });
    expect(result.status).toBe('paused');
    expect(result.latestDate).toBe('2026-11-04');
    expect(result.totalPnl).toBe(50);
    expect(result.capitalChange).toBe(100);
    expect(result.withdrawTotal).toBe(0);
    expect(result.todayPnl).toBeNull();
    expect(result.points).toHaveLength(2);
  });
  it('未来开始pending无未来点，未来暂停不提前冻结，today当日可用', () => {
    const rows = [record('2026-11-09', 'income', 900), record('2026-11-10', 'income', 50)];
    const pending = calculate(rows, { ...CONFIG, startDate: '2026-11-10' });
    expect(pending.status).toBe('pending');
    expect(pending.points).toEqual([]);
    expect(pending.totalPnl).toBeNull();
    expect(pending.latestBalance).toBeNull();
    const active = calculate(rows, { ...CONFIG, pauseDate: '2026-11-10' });
    expect(active.status).toBe('active');
    expect(active.latestDate).toBe('2026-11-09');
    expect(active.totalPnl).toBe(50);
  });
  it('today早于所有余额时no_data，而不是0或读取future', () => {
    const result = calculate([record('2026-11-10', 'income', 1000)]);
    expect(result.status).toBe('no_data');
    expect(result.latestDate).toBeNull();
    expect(result.latestBalance).toBeNull();
    expect(result.totalPnl).toBeNull();
    expect(result.todayPnl).toBeNull();
    expect(result.points).toEqual([]);
  });
  it('空数据、只有开始前余额、只有零/缺失/非法余额均无伪造金额', () => {
    for (const rows of [[], [record('2026-11-01', 'income', 900)], [
      record('2026-11-02', 'income', 0), record('2026-11-03', 'expense', null),
      record('2026-11-04', 'income', ''), record('2026-11-05', 'income', 'not money'),
      record('2026-11-06', 'income', Infinity),
    ]]) {
      const result = calculate(rows);
      expect(result.status).toBe('no_data');
      expect(result.points).toEqual([]);
      expect(result.latestBalance).toBeNull();
      expect(result.totalPnl).toBeNull();
    }
  });
  it('只有transfer时保留已知现金流，不虚构余额或收益；暂停也无数据', () => {
    const result = calculate([record('2026-11-02', 'transfer', 100, 'capital_add')], { ...CONFIG, pauseDate: '2026-11-05' });
    expect(result.status).toBe('no_data');
    expect(result.capitalChange).toBe(100);
    expect(result.totalPnl).toBeNull();
  });
  it('关闭仅返回disabled并保留参数，计算无真实转换副作用', () => {
    const config = { ...CONFIG, enabled: false };
    const rows = [record('2026-11-09', 'income', 900)];
    const snapshot = JSON.stringify({ config, rows });
    const result = calculate(rows, config);
    expect(result.status).toBe('disabled');
    expect(result.config).toEqual(config);
    expect(result.points).toEqual([]);
    expect(JSON.stringify({ config, rows })).toBe(snapshot);
  });
  it('按category和ledger双重隔离，排除已删除及非法日期', () => {
    const result = calculate([
      record('2026-11-09', 'income', 900),
      { ...record('2026-11-09', 'income', 8000), categoryId: 11 },
      { ...record('2026-11-09', 'income', 9000), ledgerId: 52 },
      { ...record('2026-11-09', 'income', 7000), deletedAt: '2026-11-09' },
      record('2026-11-99', 'income', 6000),
    ]);
    expect(result.latestBalance).toBe(900);
    expect(result.totalPnl).toBe(50);
  });
  it('乱序、字符串金额和负额按AA绝对金额口径聚合且不修改输入', () => {
    const rows = [record('2026-11-09', 'expense', '-850'), record('2026-11-02', 'income', '-900')];
    const snapshot = JSON.stringify(rows);
    expect(calculate(rows).points.map(p => p.balance)).toEqual([900, 850]);
    expect(JSON.stringify(rows)).toBe(snapshot);
  });
  it('参考初始金额和比例完全独立，不随真实本金/成员比例自动补值', () => {
    expect(calculate([record('2026-11-02', 'income', 200)], { ...CONFIG, initialAmount: 300, ratio: 10 }).totalPnl).toBe(10);
    expect(calculate([record('2026-11-02', 'income', 200)], { ...CONFIG, initialAmount: 0, ratio: 0 }).totalPnl).toBe(0);
  });
  it.each([125, 200, 999])('观察比例%s%%合法，累计与每日收益沿用原公式', ratio => {
    const config = { ...CONFIG, ratio };
    expect(validateOrdinaryTagObservationConfig(config)).toEqual(config);
    const result = calculate([record('2026-11-01', 'income', 1000), record('2026-11-02', 'income', 900), record('2026-11-09', 'income', 850)], config);
    expect(result.status).toBe('active');
    expect(result.totalPnl).toBe(150 * (ratio / 100));
    expect(result.todayPnl).toBe(50 * (ratio / 100));
    expect(result.points[0].dailyPnl).toBe(100 * (ratio / 100));
  });
  it.each([
    ['同日余额', [record('2026-11-02', 'income', Number.MAX_VALUE), record('2026-11-02', 'income', Number.MAX_VALUE)], CONFIG],
    ['同日支出即使income优先', [record('2026-11-02', 'expense', Number.MAX_VALUE), record('2026-11-02', 'expense', Number.MAX_VALUE), record('2026-11-02', 'income', 900)], CONFIG],
    ['同日本金', [record('2026-11-02', 'transfer', Number.MAX_VALUE, 'capital_add'), record('2026-11-02', 'transfer', Number.MAX_VALUE, 'capital_add')], CONFIG],
    ['同日提现', [record('2026-11-02', 'transfer', Number.MAX_VALUE), record('2026-11-02', 'transfer', Number.MAX_VALUE)], CONFIG],
    ['跨日本金无余额', [record('2026-11-02', 'transfer', Number.MAX_VALUE, 'capital_add'), record('2026-11-03', 'transfer', Number.MAX_VALUE, 'capital_add')], CONFIG],
    ['跨日提现无余额', [record('2026-11-02', 'transfer', Number.MAX_VALUE), record('2026-11-03', 'transfer', Number.MAX_VALUE)], CONFIG],
    ['杠杆累计收益', [record('2026-11-02', 'income', Number.MAX_VALUE)], { ...CONFIG, initialAmount: 0, ratio: 200 }],
    ['杠杆每日收益', [record('2026-11-01', 'income', Number.MAX_VALUE), record('2026-11-02', 'income', 1)], { ...CONFIG, initialAmount: 0, ratio: 200 }],
    ['先有有效点再溢出', [record('2026-11-02', 'income', 900), record('2026-11-03', 'income', Number.MAX_VALUE)], { ...CONFIG, initialAmount: 0, ratio: 200 }],
  ])('%s算术溢出明确invalid_config，不输出无限累计或残留收益点', (_, rows, config) => {
    const result = calculate(rows as OrdinaryTagObservationRecord[], config as OrdinaryTagObservationConfig);
    expect(result).toMatchObject({ status: 'invalid_config', points: [], latestDate: null, latestBalance: null, totalPnl: null, todayPnl: null, capitalChange: 0, withdrawTotal: 0 });
  });
  it.each([
    ['无金额', { initialAmount: undefined }], ['金额字符串', { initialAmount: '1000' }],
    ['负金额', { initialAmount: -1 }], ['非有限金额', { initialAmount: Infinity }],
    ['配置乘积溢出', { initialAmount: Number.MAX_VALUE, ratio: 200 }], ['负比例', { ratio: -1 }], ['非有限比例', { ratio: NaN }], ['无限比例', { ratio: Infinity }],
    ['无开关', { enabled: undefined }], ['非法开始日', { startDate: '2026-02-30' }],
    ['日期格式不严格', { startDate: '2026-2-03' }], ['暂停早于开始', { pauseDate: '2026-11-01' }],
    ['空暂停不是null', { pauseDate: '' }], ['无暂停参数', { pauseDate: undefined }],
  ])('拒绝%s，不默认造观察配置', (_, change) => {
    const config = { ...CONFIG, ...change } as OrdinaryTagObservationConfig;
    expect(() => validateOrdinaryTagObservationConfig(config)).toThrow();
    expect(calculate([], config).status).toBe('invalid_config');
  });
  it('专用键仅读取JSON字符串，无观察配置时不能读取真实金额/ratio', () => {
    const key = ordinaryTagObservationKey('普通');
    const balances = { 普通: '100000', 普通__ratio: '100', [key]: JSON.stringify(CONFIG) };
    expect(readOrdinaryTagObservationConfig(balances, '普通')).toEqual(CONFIG);
    expect(readOrdinaryTagObservationConfig(balances, '另一个')).toBeNull();
    expect(readOrdinaryTagObservationConfig({ [key]: CONFIG }, '普通')).toBeNull();
    expect(readOrdinaryTagObservationConfig({ [key]: '{}' }, '普通')).toBeNull();
    expect(readOrdinaryTagObservationConfig({ [key]: 'broken' }, '普通')).toBeNull();
  });
});

type FixtureMember = { id: number; ledgerId: number; userId: number; role: string; memberType: string; initialBalances: string | null };
type FixtureCategory = { id: number; ledgerId: number; name: string; parentId: number | null; isDefault: number; accountingMode: string };
let members: FixtureMember[];
let categories: FixtureCategory[];
let records: OrdinaryTagObservationRecord[];
let beforeUpdate: (() => void) | null;
let affectedRows: number;
const ADMIN = { ledgerId: 37, categoryId: 10, targetUserId: 201, actorUserId: 100 };
function ownBalances(value: Record<string, unknown>) { members.find(m => m.userId === 201)!.initialBalances = JSON.stringify(value); }
function currentBalances() { return JSON.parse(members.find(m => m.userId === 201)!.initialBalances!); }
function writes() { return mocks.execute.mock.calls.filter(([sql]) => !/^\s*SELECT\b/i.test(sql)); }

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('DEV_BYPASS_AUTH', 'false');
  vi.stubEnv('PREVIEW_READONLY', 'false');
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-09T08:00:00+08:00'));
  members = [
    { id: 1, ledgerId: 37, userId: 100, role: 'owner', memberType: 'real', initialBalances: '{}' },
    { id: 2, ledgerId: 37, userId: 201, role: 'member', memberType: 'real', initialBalances: JSON.stringify({ [ordinaryTagObservationKey('普通')]: JSON.stringify(CONFIG) }) },
    { id: 3, ledgerId: 37, userId: 202, role: 'member', memberType: 'real', initialBalances: JSON.stringify({ [ordinaryTagObservationKey('普通')]: JSON.stringify({ ...CONFIG, initialAmount: 9000 }) }) },
  ];
  categories = [{ id: 10, ledgerId: 37, name: '普通', parentId: null, isDefault: 0, accountingMode: 'manual_balance' }];
  records = [record('2026-11-01', 'income', 1000), record('2026-11-09', 'income', 900)];
  beforeUpdate = null;
  affectedRows = 1;
  mocks.getDbConnection.mockResolvedValue({ execute: mocks.execute });
  mocks.execute.mockImplementation(async (sql: string, values: Array<number | string>) => {
    if (/FROM ledger_members m/.test(sql)) {
      return [members.filter(m => m.ledgerId === values[0] && m.userId === values[1]), []];
    }
    if (/FROM ledger_categories/.test(sql)) {
      return [categories.filter(c => c.ledgerId === values[0] && (values.length === 1 || c.id === values[1])), []];
    }
    if (/FROM ledger_records/.test(sql)) {
      return [records.filter(r => {
        const category = categories.find(c => c.id === r.categoryId && c.ledgerId === r.ledgerId);
        return r.ledgerId === values[1] && category && (category.id === values[2] || category.parentId === values[3])
          && !r.deletedAt && r.recordDate <= values[4];
      }).map(r => ({ ...r, categoryId: values[0] })), []];
    }
    if (/^\s*UPDATE ledger_members/.test(sql)) {
      beforeUpdate?.();
      const [id, ledgerId, userId] = values.slice(-3);
      const member = members.find(m => m.id === id && m.ledgerId === ledgerId && m.userId === userId && m.memberType === 'real');
      if (!member || affectedRows !== 1) return [{ affectedRows: 0 }, []];
      const saved = member.initialBalances ? JSON.parse(member.initialBalances) : {};
      for (let index = 0; index < values.length - 3; index += 2) {
        const key = JSON.parse(String(values[index]).slice(2));
        saved[key] = values[index + 1];
      }
      member.initialBalances = JSON.stringify(saved);
      return [{ affectedRows: 1 }, []];
    }
    throw new Error(`禁止未明确允许的SQL: ${sql}`);
  });
});
afterEach(() => {
  // 即使成功保存也不能获取资金连接、调用真实资金函数或执行DDL。
  expect(mocks.getDbTransactionConnection).not.toHaveBeenCalled();
  expect(mocks.getLedgerDb).not.toHaveBeenCalled();
  expect(mocks.updateMyInitialBalances).not.toHaveBeenCalled();
  expect(mocks.ensureLedgerStockPortfolioTables).not.toHaveBeenCalled();
  for (const [sql] of mocks.execute.mock.calls) {
    expect(sql).not.toMatch(/\b(?:INSERT|DELETE|ALTER|CREATE|DROP|TRUNCATE)\b/i);
    expect(sql).not.toMatch(/\b(?:balance_history|recharge_orders|af_manual_balances|ledger_stock_|wallet|ledger_orders)\b/i);
  }
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('普通标签观察服务：仅mock DB', () => {
  it('admin读取专用配置仅SELECT，不返回真实配置对象', async () => {
    ownBalances({ 普通: '3000', 普通__ratio: '90', 股票__marginEntries: [{ amount: 200 }], [ordinaryTagObservationKey('普通')]: JSON.stringify(CONFIG) });
    expect(await adminGetOrdinaryTagObservationConfig(ADMIN)).toEqual({ config: CONFIG });
    expect(writes()).toEqual([]);
    expect(mocks.execute.mock.calls[0][1]).toEqual([37, 100]);
  });
  it('没有独立键返回null，不借真实初始金额比例默认启用', async () => {
    ownBalances({ 普通: '10000', 普通__ratio: '100' });
    expect(await adminGetOrdinaryTagObservationConfig(ADMIN)).toEqual({ config: null });
    expect(await getMyOrdinaryTagObservationOverview({ ledgerId: 37, userId: 201 })).toEqual({ userId: 201, observations: [] });
    expect(mocks.execute.mock.calls.some(([sql]) => /FROM ledger_records/.test(sql))).toBe(false);
  });
  it.each([125, 200])('开启%s%%杠杆观察只归零真实比例和权益，不产生真实资金', async ratio => {
    const real = { 普通: 1000, 普通__ratio: 150, 普通__targetAmount: 1500, 普通__margin: 200, 其他__ratio: 200 };
    ownBalances(real);
    const config = { ...CONFIG, ratio };
    await expect(adminSetOrdinaryTagObservationConfig({ ...ADMIN, config })).resolves.toEqual({ success: true, config });
    expect(currentBalances()).toEqual({ ...real, 普通__ratio: 0, 普通__targetAmount: 0, [ordinaryTagObservationKey('普通')]: JSON.stringify(config) });
    expect(writes()).toHaveLength(1);
    expect(writes()[0][0]).not.toMatch(/wallet|ledger_records|INSERT|DELETE|JSON_REMOVE/i);
  });
  it('原子UPDATE只改专用字符串键，保留全部真实字段和并发兄弟字段变更', async () => {
    const real = {
      普通: '8888', 普通__ratio: '75', 普通__visible: 0, 普通__startDate: '2026-01-01', 普通__dividend: '30',
      普通__margin: '100', 普通__marginEntries: [{ currency: 'CNY', amount: 100 }],
      股票: '1200', 股票__stockLots: [{ id: 12 }], unrelated: { nested: ['keep'] },
    };
    ownBalances(real);
    beforeUpdate = () => ownBalances({ ...currentBalances(), 普通__margin: '777', concurrentNewKey: 'kept' });
    const config = { ...CONFIG, enabled: false, initialAmount: 222, ratio: 25, pauseDate: '2026-11-09' };
    expect(await adminSetOrdinaryTagObservationConfig({ ...ADMIN, config })).toEqual({ success: true, config });
    expect(writes()).toHaveLength(1);
    const [sql, params] = writes()[0];
    expect(sql.match(/JSON_SET\(/g)).toHaveLength(1);
    expect(sql).toMatch(/SET initial_balances = JSON_SET/);
    expect(sql).not.toMatch(/updatedAt\s*=|balance\s*=|JSON_REMOVE|JSON_MERGE/);
    expect(params).toEqual(['$."普通__ordinaryObservation"', JSON.stringify(config), 2, 37, 201]);
    expect(currentBalances()).toEqual({ ...real, 普通__margin: '777', concurrentNewKey: 'kept', [ordinaryTagObservationKey('普通')]: JSON.stringify(config) });
  });
  it('特殊标签名的JSON路径安全参数化，不注入SQL或写错相邻键', async () => {
    const name = 'A".B\\C';
    categories[0].name = name;
    ownBalances({ [name]: '500', 'A': 'unchanged' });
    await adminSetOrdinaryTagObservationConfig({ ...ADMIN, config: CONFIG });
    expect(writes()[0][1][0]).toBe(`$.${JSON.stringify(ordinaryTagObservationKey(name))}`);
    expect(currentBalances()).toEqual({ [name]: '500', A: 'unchanged', [`${name}__ratio`]: 0, [`${name}__targetAmount`]: 0, [ordinaryTagObservationKey(name)]: JSON.stringify(CONFIG) });
    expect(writes()[0][0]).not.toContain(name);
  });
  it('initial_balances为null允许专用键保存；坏JSON或非对象绝不覆盖真实设置', async () => {
    const member = members.find(m => m.userId === 201)!;
    member.initialBalances = null;
    await adminSetOrdinaryTagObservationConfig({ ...ADMIN, config: CONFIG });
    expect(currentBalances()).toEqual({ 普通__ratio: 0, 普通__targetAmount: 0, [ordinaryTagObservationKey('普通')]: JSON.stringify(CONFIG) });
    mocks.execute.mockClear();
    for (const bad of ['broken', '[]', 'null']) {
      member.initialBalances = bad;
      await expect(adminSetOrdinaryTagObservationConfig({ ...ADMIN, config: CONFIG })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
      expect(member.initialBalances).toBe(bad);
    }
    expect(writes()).toHaveLength(0);
  });
  it.each(['DEV_BYPASS_AUTH', 'PREVIEW_READONLY'])('%s显式禁写，而且不获取任何连接', async (env) => {
    vi.stubEnv(env, 'true');
    await expect(adminSetOrdinaryTagObservationConfig({ ...ADMIN, config: CONFIG })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    expect(mocks.getDbConnection).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it('普通actor不能借target管理员授权；缺actor不降级使用target', async () => {
    await expect(adminGetOrdinaryTagObservationConfig({ ...ADMIN, actorUserId: 201, targetUserId: 100 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(adminSetOrdinaryTagObservationConfig({ ...ADMIN, actorUserId: 0, config: CONFIG })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(writes()).toHaveLength(0);
  });
  it.each(['owner', 'admin'])('真实账本%s可以维护目标成员，不接受全局权限兜底', async (role) => {
    members[0].role = role;
    await expect(adminSetOrdinaryTagObservationConfig({ ...ADMIN, config: CONFIG })).resolves.toMatchObject({ success: true });
  });
  it.each(['ai', 'missing', 'other-ledger'])('目标%s成员拒绝读取/保存', async (kind) => {
    const target = members.find(m => m.userId === 201)!;
    if (kind === 'ai') target.memberType = 'ai';
    if (kind === 'missing') members = members.filter(m => m.userId !== 201);
    if (kind === 'other-ledger') target.ledgerId = 52;
    await expect(adminGetOrdinaryTagObservationConfig(ADMIN)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(adminSetOrdinaryTagObservationConfig({ ...ADMIN, config: CONFIG })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(writes()).toHaveLength(0);
  });
  it('AI管理员即使role=owner也不授权', async () => {
    members[0].memberType = 'ai';
    await expect(adminGetOrdinaryTagObservationConfig(ADMIN)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it.each(['stock', 'child', 'default', 'other-ledger', 'missing'])('排除%s标签，读写都不触发资金/DDL', async (kind) => {
    if (kind === 'stock') categories[0].accountingMode = 'stock_portfolio';
    if (kind === 'child') categories[0].parentId = 99;
    if (kind === 'default') categories[0].isDefault = 1;
    if (kind === 'other-ledger') categories[0].ledgerId = 52;
    if (kind === 'missing') categories = [];
    await expect(adminGetOrdinaryTagObservationConfig(ADMIN)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(adminSetOrdinaryTagObservationConfig({ ...ADMIN, config: CONFIG })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(writes()).toHaveLength(0);
  });
  it('拒绝其他ledger及非法保存配置，不获取连接', async () => {
    await expect(adminGetOrdinaryTagObservationConfig({ ...ADMIN, ledgerId: 52 })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(adminSetOrdinaryTagObservationConfig({ ...ADMIN, config: { ...CONFIG, initialAmount: NaN } })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(getMyOrdinaryTagObservationOverview({ ledgerId: 52, userId: 201 })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(mocks.getDbConnection).not.toHaveBeenCalled();
  });
  it('单键UPDATE未匹配真实成员时不谎报success', async () => {
    affectedRows = 0;
    await expect(adminSetOrdinaryTagObservationConfig({ ...ADMIN, config: CONFIG })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
  });
  it('my只读取当前有效user自己的启用配置，无他人成员/备注/真实设置泄露', async () => {
    records.push(record('2026-11-09', 'transfer', 20, '私密备注不能返回'));
    const result = await getMyOrdinaryTagObservationOverview({ ledgerId: 37, userId: 201, viewAsUserId: 201 });
    expect(result.userId).toBe(201);
    expect(result.observations).toHaveLength(1);
    expect(result.observations[0].config).toEqual(CONFIG);
    expect(result.observations[0].totalPnl).toBe(40);
    expect(result.observations[0].todayPnl).toBe(40);
    expect(JSON.stringify(result)).not.toContain('私密备注');
    expect(JSON.stringify(result)).not.toContain('9000');
    expect(mocks.execute.mock.calls.filter(([sql]) => /FROM ledger_members/.test(sql))).toHaveLength(1);
    expect(mocks.execute.mock.calls[0][1]).toEqual([37, 201]);
    expect(writes()).toHaveLength(0);
  });
  it('伪造viewAsUserId读取第三人立即拒绝，无DB调用', async () => {
    await expect(getMyOrdinaryTagObservationOverview({ ledgerId: 37, userId: 201, viewAsUserId: 202 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(mocks.getDbConnection).not.toHaveBeenCalled();
  });
  it('每次my都重新核验成员；退出/AI不能借缓存读观察', async () => {
    await getMyOrdinaryTagObservationOverview({ ledgerId: 37, userId: 201 });
    members = members.filter(m => m.userId !== 201);
    await expect(getMyOrdinaryTagObservationOverview({ ledgerId: 37, userId: 201 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    members.push({ id: 4, ledgerId: 37, userId: 201, role: 'member', memberType: 'ai', initialBalances: '{}' });
    await expect(getMyOrdinaryTagObservationOverview({ ledgerId: 37, userId: 201 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it.each(['disabled', 'broken', 'missing'])('my%s不可展示或读取行情，不能借第三人配置启用', async (kind) => {
    const balances: Record<string, unknown> = { [ordinaryTagObservationKey('普通')]: JSON.stringify(CONFIG) };
    if (kind === 'disabled') balances[ordinaryTagObservationKey('普通')] = JSON.stringify({ ...CONFIG, enabled: false });
    if (kind === 'broken') balances[ordinaryTagObservationKey('普通')] = 'broken';
    if (kind === 'missing') delete balances[ordinaryTagObservationKey('普通')];
    ownBalances(balances);
    expect(await getMyOrdinaryTagObservationOverview({ ledgerId: 37, userId: 201 })).toEqual({ userId: 201, observations: [] });
    expect(mocks.execute.mock.calls.some(([sql]) => /FROM ledger_records/.test(sql))).toBe(false);
    expect(writes()).toHaveLength(0);
  });
  it.each(['member', 'admin', 'owner'])('my的%s真实标签隐藏但自己的enabled观察仍独立可见，不改真实字段', async (role) => {
    members.find(m => m.userId === 201)!.role = role;
    ownBalances({ 普通__visible: 0, __tagVisibilityDefault: 0, [ordinaryTagObservationKey('普通')]: JSON.stringify(CONFIG) });
    const snapshot = JSON.stringify(members);
    const result = await getMyOrdinaryTagObservationOverview({ ledgerId: 37, userId: 201 });
    expect(result.observations).toHaveLength(1);
    expect(result.observations[0]).toMatchObject({ userId: 201, categoryId: 10, config: CONFIG, totalPnl: 50 });
    expect(JSON.stringify(result)).not.toContain('__visible');
    expect(JSON.stringify(members)).toBe(snapshot);
    expect(writes()).toHaveLength(0);
  });
  it('my混合标签只返回合法且自己显式启用的独立观察，不放开真实股票/默认/子标签', async () => {
    categories.push(
      { ...categories[0], id: 11, name: '禁用' }, { ...categories[0], id: 12, name: '隐藏' },
      { ...categories[0], id: 13, name: '股票', accountingMode: 'stock_portfolio' },
      { ...categories[0], id: 14, name: '子标签', parentId: 10 },
      { ...categories[0], id: 15, name: '默认', isDefault: 1 },
    );
    ownBalances({
      普通__visible: 1, 隐藏__visible: 0,
      [ordinaryTagObservationKey('普通')]: JSON.stringify(CONFIG),
      [ordinaryTagObservationKey('禁用')]: JSON.stringify({ ...CONFIG, enabled: false }),
      [ordinaryTagObservationKey('隐藏')]: JSON.stringify(CONFIG),
      [ordinaryTagObservationKey('股票')]: JSON.stringify(CONFIG),
      [ordinaryTagObservationKey('子标签')]: JSON.stringify(CONFIG),
      [ordinaryTagObservationKey('默认')]: JSON.stringify(CONFIG),
    });
    const result = await getMyOrdinaryTagObservationOverview({ ledgerId: 37, userId: 201 });
    expect(result.observations.map(o => o.categoryName)).toEqual(['普通', '隐藏']);
    expect(mocks.execute.mock.calls.filter(([sql]) => /FROM ledger_records/.test(sql))).toHaveLength(2);
    expect(result.observations[1]).toMatchObject({ status: 'no_data', totalPnl: null, latestBalance: null });
  });
  it('结构完整但非法旧观察参数明确invalid_config，不读取行情', async () => {
    ownBalances({ [ordinaryTagObservationKey('普通')]: JSON.stringify({ ...CONFIG, ratio: -1 }) });
    const result = await getMyOrdinaryTagObservationOverview({ ledgerId: 37, userId: 201 });
    expect(result.observations[0].status).toBe('invalid_config');
    expect(result.observations[0].totalPnl).toBeNull();
    expect(mocks.execute.mock.calls.some(([sql]) => /FROM ledger_records/.test(sql))).toBe(false);
  });
  it('真实源无数据不能假造收益，未来开始不查询行情', async () => {
    records = [];
    expect((await getMyOrdinaryTagObservationOverview({ ledgerId: 37, userId: 201 })).observations[0]).toMatchObject({ status: 'no_data', totalPnl: null, latestBalance: null });
    mocks.execute.mockClear();
    ownBalances({ [ordinaryTagObservationKey('普通')]: JSON.stringify({ ...CONFIG, startDate: '2026-11-10' }) });
    expect((await getMyOrdinaryTagObservationOverview({ ledgerId: 37, userId: 201 })).observations[0].status).toBe('pending');
    expect(mocks.execute.mock.calls.some(([sql]) => /FROM ledger_records/.test(sql))).toBe(false);
  });
  it('SQL使用真实camel字段及accounting_mode、DATE字符串，只读过滤删除/future', async () => {
    await getMyOrdinaryTagObservationOverview({ ledgerId: 37, userId: 201 });
    const [sql, params] = mocks.execute.mock.calls.find(([s]) => /FROM ledger_records/.test(s))!;
    expect(sql).toContain("DATE_FORMAT(r.recordDate, '%Y-%m-%d') AS recordDate");
    expect(sql).toContain('r.deleted_at IS NULL AND r.recordDate <= ?');
    expect(sql).toContain('c.id = r.categoryId AND c.ledgerId = r.ledgerId');
    expect(sql).toContain('(c.id = ? OR c.parentId = ?)');
    expect(sql).not.toMatch(/ledger_id|category_id|record_date|created_by/);
    expect(params).toEqual([10, 37, 10, 10, '2026-11-09']);
    expect(writes()).toHaveLength(0);
  });
  it('同标签直接子分类余额和现金流归并root，非此账本/其他root/孙分类不能混入', async () => {
    categories.push(
      { ...categories[0], id: 11, name: '直接子', parentId: 10 },
      { ...categories[0], id: 12, name: '其他root子', parentId: 99 },
      { ...categories[0], id: 13, name: '孙分类', parentId: 11 },
      { ...categories[0], id: 14, ledgerId: 52, name: '跨账本子', parentId: 10 },
    );
    records.push(
      { ...record('2026-11-09', 'income', 100), categoryId: 11 },
      { ...record('2026-11-09', 'transfer', 100, 'capital_add'), categoryId: 11 },
      { ...record('2026-11-09', 'income', 9000), categoryId: 12 },
      { ...record('2026-11-09', 'income', 9000), categoryId: 13 },
      { ...record('2026-11-09', 'income', 9000), categoryId: 14, ledgerId: 52 },
      { ...record('2026-11-09', 'income', 9000), categoryId: 14 },
    );
    const result = await getMyOrdinaryTagObservationOverview({ ledgerId: 37, userId: 201 });
    expect(result.observations).toHaveLength(1);
    expect(result.observations[0]).toMatchObject({ categoryId: 10, latestBalance: 1000, capitalChange: 100, totalPnl: 50, todayPnl: 50 });
    expect(writes()).toHaveLength(0);
  });
  it('北京时间跨日边界不按UTC昨天丢失today收益', async () => {
    vi.setSystemTime(new Date('2026-11-09T00:01:00+08:00'));
    const result = await getMyOrdinaryTagObservationOverview({ ledgerId: 37, userId: 201 });
    expect(result.observations[0].todayPnl).toBe(50);
    const call = mocks.execute.mock.calls.find(([sql]) => /FROM ledger_records/.test(sql))!;
    expect(call[1][4]).toBe('2026-11-09');
  });
  it('不可解密的transfer备注拒绝伪造提现/本金结果，而不是误当0', async () => {
    vi.stubEnv('ENCRYPTION_KEY', '');
    records.push(record('2026-11-09', 'transfer', 100, 'enc:v1:unreadable'));
    await expect(getMyOrdinaryTagObservationOverview({ ledgerId: 37, userId: 201 })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    expect(writes()).toHaveLength(0);
  });
  it('只读预览需要明确PREVIEW_READONLY，在正式环境拒绝且不读DB', async () => {
    await expect(getOrdinaryTagObservationPreviewSummary({ ...ADMIN, config: CONFIG })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    expect(mocks.getDbConnection).not.toHaveBeenCalled();
  });
  it('只读预览用明确本地配置及真实只读源，开始/暂停与正式共享同一算法，完全不保存', async () => {
    vi.stubEnv('PREVIEW_READONLY', 'true');
    vi.stubEnv('DEV_BYPASS_AUTH', 'true');
    const config = { ...CONFIG, initialAmount: 2000, ratio: 25, pauseDate: '2026-11-03' };
    records.push(record('2026-11-03', 'income', 1500), record('2026-11-03', 'transfer', 100, 'capital_add'));
    const snapshot = JSON.stringify(members);
    const result = await getOrdinaryTagObservationPreviewSummary({ ...ADMIN, config });
    expect(result).toMatchObject({ userId: 201, config, status: 'paused', latestDate: '2026-11-03', latestBalance: 1500, totalPnl: 150, capitalChange: 100 });
    expect(JSON.stringify(members)).toBe(snapshot);
    expect(writes()).toHaveLength(0);
    expect(mocks.execute.mock.calls.find(([sql]) => /FROM ledger_records/.test(sql))![1]).toEqual([10, 37, 10, 10, '2026-11-03']);
  });
  it('只读预览不能通过普通actor冒用目标管理员或AI目标；缺明确金额不补0', async () => {
    vi.stubEnv('PREVIEW_READONLY', 'true');
    await expect(getOrdinaryTagObservationPreviewSummary({ ...ADMIN, actorUserId: 201, config: CONFIG })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    members.find(m => m.userId === 201)!.memberType = 'ai';
    await expect(getOrdinaryTagObservationPreviewSummary({ ...ADMIN, config: CONFIG })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(getOrdinaryTagObservationPreviewSummary({ ...ADMIN, config: { ...CONFIG, initialAmount: undefined } as unknown as OrdinaryTagObservationConfig })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(writes()).toHaveLength(0);
  });
  it('module不引入任何资金/股票初始化依赖，读函数不夹带副作用', () => {
    const source = readFileSync(new URL('./ordinary-tag-observation.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/from ['"].*(?:db-ledger|wallet|funding|stock-portfolio|scheduler)/);
    expect(source).not.toMatch(/\b(?:ensure\w*|updateMyInitialBalances|getDbTransactionConnection|freeze\w*|release\w*)\s*\(/);
    expect(source.match(/\bUPDATE\s+ledger_members\b/g)).toHaveLength(1);
    expect(source).not.toMatch(/\b(?:UPDATE|INSERT INTO|DELETE FROM)\s+(?:users|ledger_records|balance_history|recharge_orders|af_manual_balances|ledger_stock_\w*)/);
  });
});

describe('普通标签内联观察模式：配置转换', () => {
  it('开启观察仅原子归零实际比例和权益，保留本金、押金、日期、可见性、分红和其他标签', async () => {
    const prior = { 普通: 1000, 普通__ratio: 50, 普通__targetAmount: 500, 普通__margin: 200,
      普通__startDate: '2026-01-01', 普通__visible: 1, 普通__dividend: 'keep', 其他__ratio: 30 };
    ownBalances(prior);
    beforeUpdate = () => ownBalances({ ...currentBalances(), 普通__margin: 210, concurrentKey: 'kept' });
    await adminSetOrdinaryTagObservationConfig({ ...ADMIN, config: CONFIG });
    expect(writes()).toHaveLength(1);
    expect(writes()[0][1]).toEqual(['$."普通__ordinaryObservation"', JSON.stringify(CONFIG), '$."普通__ratio"', 0, '$."普通__targetAmount"', 0, 2, 37, 201]);
    expect(currentBalances()).toEqual({ ...prior, 普通__margin: 210, concurrentKey: 'kept', 普通__ratio: 0,
      普通__targetAmount: 0, [ordinaryTagObservationKey('普通')]: JSON.stringify(CONFIG) });
    await adminSetOrdinaryTagObservationConfig({ ...ADMIN, config: { ...CONFIG, enabled: false } });
    expect(currentBalances().普通__ratio).toBe(0);
    expect(currentBalances().普通__targetAmount).toBe(0);
    expect(JSON.parse(currentBalances()[ordinaryTagObservationKey('普通')]).ratio).toBe(50);
  });
  it('模式投影只含允许键，关闭不恢复原份额', () => {
    expect(ordinaryObservationAllocationPatch('普通', CONFIG)).toEqual({
      [ordinaryTagObservationKey('普通')]: JSON.stringify(CONFIG), 普通__ratio: 0, 普通__targetAmount: 0 });
    expect(ordinaryObservationAllocationPatch('普通', { ...CONFIG, enabled: false })).toEqual({
      [ordinaryTagObservationKey('普通')]: JSON.stringify({ ...CONFIG, enabled: false }) });
  });
  it('观察启用后，旧编辑入口必须先关闭观察才可分配正的真实比例与权益', () => {
    const previous = { [ordinaryTagObservationKey('普通')]: JSON.stringify(CONFIG) };
    expect(() => assertOrdinaryObservationAllocationChange(previous, { 普通__ratio: 10 }, '普通')).toThrow('先关闭观察');
    expect(() => assertOrdinaryObservationAllocationChange(previous, { 普通__targetAmount: '10' }, '普通')).toThrow('先关闭观察');
    expect(() => assertOrdinaryObservationAllocationChange(previous, { 普通__margin: 10 }, '普通')).not.toThrow();
    expect(() => assertOrdinaryObservationAllocationChange(previous, { 普通__ratio: 0, 普通__targetAmount: 0 }, '普通')).not.toThrow();
    expect(() => assertOrdinaryObservationAllocationChange(previous, { 其他__ratio: 10 }, '普通')).not.toThrow();
    expect(() => assertOrdinaryObservationAllocationChange({}, { 普通__ratio: 10 }, '普通')).not.toThrow();
    expect(() => assertOrdinaryObservationAllocationChange({ [ordinaryTagObservationKey('普通')]: JSON.stringify({ ...CONFIG, enabled: false }) }, { 普通__ratio: 10 }, '普通')).not.toThrow();
  });
  it.each(['', ' ', 'NaN', 'Infinity', NaN, Infinity, -1, null, undefined, false])('启用观察后非法或负的真实份额不能作为零值放行 %#', value => {
    const previous = { [ordinaryTagObservationKey('普通')]: JSON.stringify(CONFIG) };
    for (const key of ['普通__ratio', '普通__targetAmount']) {
      expect(() => assertOrdinaryObservationAllocationChange(previous, { [key]: value }, '普通')).toThrow('先关闭观察');
    }
  });
  it.each([0, '0', '0.0000'])('启用观察允许明确的零实际份额 %#', value => {
    const previous = { [ordinaryTagObservationKey('普通')]: JSON.stringify(CONFIG) };
    expect(() => assertOrdinaryObservationAllocationChange(previous, { 普通__ratio: value, 普通__targetAmount: value }, '普通')).not.toThrow();
  });
});
