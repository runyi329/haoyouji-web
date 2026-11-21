import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { finitePositive, formatFxEstimate, getUsdtCnyRate } from '../shared/usdt-cny-display';
import { getAfManagementFeeStartAt } from '../shared/af-management-fee-start';
import { formatFunderPendingInterest, resolveFunderInterestEndDate, usesFunderContractInterestPrepayment } from '../shared/funder-interest-period';
import { buildFinanceInterestSummaryInputs, mergeFinanceInterestSummaryResults } from '../client/src/lib/finance-interest-summary';

const root = new URL('../', import.meta.url);
const paths = { fee: 'client/src/pages/AfFeeDetail.tsx', card: 'client/src/pages/FinanceManagement.tsx' };
const source = Object.fromEntries(Object.entries(paths).map(([key, path]) => [key, fs.readFileSync(new URL(path, root), 'utf8')]));
function ast(key: 'fee' | 'card') { return ts.createSourceFile(paths[key], source[key], ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX); }
const common = { React, finitePositive, formatFxEstimate, getUsdtCnyRate, getAfManagementFeeStartAt, formatFunderPendingInterest, resolveFunderInterestEndDate, usesFunderContractInterestPrepayment, buildFinanceInterestSummaryInputs, mergeFinanceInterestSummaryResults, setInterval: () => 0, clearInterval: () => {} };
function execute(key: 'fee' | 'card', names: string[], scope: Record<string, unknown> = {}) {
  const tree = ast(key);
  const body = tree.statements.filter(n => !ts.isImportDeclaration(n) && !ts.isExportDeclaration(n)).map(n => n.getText(tree)).join('\n').replace(/\bexport\s+(default\s+)?/g, '');
  const js = ts.transpileModule(body, { fileName: paths[key], compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React } }).outputText;
  return vm.runInNewContext(`${js}; ({ ${names.join(', ')} });`, { ...common, ...scope });
}
const fee = execute('fee', ['getFinanceFeeDisplay', 'getFinancePaidDisplay', 'convertFinanceDisplayAmount', 'sumFinanceDisplayAmounts', 'financeDisplayFxRate']);
const card = execute('card', ['financeCardConvert', 'financeCardPaid', 'financeCardFxRate', 'financeCardAssetValue', 'financeCardExposure']);
const nativeU = { id: 1001, status: 'active', coin: 'ETH', user_id: 11, username: 'U成员', order_no: 'AF-U-1001', interest_base: '36500', interest_base_currency: 'USDT', interest_rate_currency: 'USDT', interest_rate_annual: '-10', interest_start_date: '2026-11-20', buy_date: '2026-11-20', buy_quantity: '20', buy_price: '1500' };
const nativeCny = { ...nativeU, id: 1002, coin: 'CNY', user_id: 12, username: 'CNY成员', order_no: 'AF-CNY-1002', interest_base_currency: 'CNY', interest_rate_currency: 'CNY', buy_quantity: '36500', buy_price: '1' };
const mixed = { ...nativeCny, id: 1003, username: '跨币成员', user_id: 13, interest_rate_currency: 'USDT' };
const payments = [{ orderId: 1001, currency: 'U', total: 20, exchangeRate: null }, { orderId: 1002, currency: 'CNY', total: 30, exchangeRate: null }];

function stateNames(key: 'fee' | 'card') {
  const names: string[] = [];
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && ts.isArrayBindingPattern(node.name) && node.initializer && ts.isCallExpression(node.initializer) && node.initializer.expression.getText() === 'useState') names.push(node.name.elements[0].getText());
    ts.forEachChild(node, visit);
  }
  visit(ast(key)); return names;
}
function queryProxy(data: Record<string, unknown>) {
  return new Proxy({}, { get: (_target, name: string) => name === 'useQueries' ? (callback: any) => callback({ ledger: { financeGetInterestPaymentSummary: (input: { orderIds: number[] }) => ({ data: Array.isArray(data.financeGetInterestPaymentSummary) ? data.financeGetInterestPaymentSummary.filter((row: any) => input.orderIds.includes(Number(row.orderId))) : data.financeGetInterestPaymentSummary, isSuccess: true, isError: false }) } }) : name === 'useQuery' ? () => ({ data: undefined }) : name === 'useMutation' ? () => ({ mutate: () => {}, isPending: false }) : name === 'useUtils' ? () => queryProxy({}) : name === 'invalidate' ? () => {} : new Proxy(queryProxy(data), { get: (target, method: string) => method === 'useQuery' ? () => ({ data: data[name], isLoading: false }) : Reflect.get(target, method) }) });
}
function renderFee(options: { orders?: any[]; search?: string; direction?: string; group?: string; rate?: number | null; paid?: any } = {}) {
  const orders = options.orders ?? [nativeU, nativeCny];
  const names = stateNames('fee'); let index = 0;
  const state: Record<string, unknown> = { mainTab: 'finance', finGroupFilter: options.group ?? 'byPerson', finSearch: options.search ?? '', finDirectionFilter: options.direction ?? 'all', expandedPersons: new Set(orders.map(o => `fin_${o.username}`)), expandedCoins: new Set(['fin_direction_collect', 'fin_direction_pay', 'fin_type_crypto', 'fin_type_stock']) };
  const rate = options.rate ?? null;
  const Icon = () => React.createElement('svg');
  const api = execute('fee', ['AfFeeDetail'], {
    useState: (initial: any) => [state[names[index++]] ?? (typeof initial === 'function' ? initial() : initial), () => {}],
    useMemo: (fn: () => unknown) => fn(), useRef: (current: unknown) => ({ current }),
    useParams: () => ({ id: '52' }), useLocation: () => ['', () => {}], window: { location: { search: '?tab=finance' } },
    trpc: queryProxy({ financeGetOrders: { orders }, afAdminGetOrders: [], getMembers: orders.map(o => ({ userId: o.user_id, username: o.username })), financeGetInterestPaymentSummary: options.paid ?? payments, getRate: rate === null ? { success: false, money: null } : { success: true, pair: 'USDT/CNY', rate }, getMembersBalance: {} }),
    ArrowLeft: Icon, ChevronDown: Icon, ChevronRight: Icon, DollarSign: Icon, X: Icon, Tooltip: Icon, FunderOrderCard: Icon, GdOrderDetail: Icon,
  });
  return renderToStaticMarkup(React.createElement(api.AfFeeDetail));
}
function renderCard(order: any = nativeU, rate: number | null = null, collateral = [{ coin: 'USDT', qty: '500' }], paid = 20) {
  const Icon = () => React.createElement('svg');
  const api = execute('card', ['FinanceOrderCard'], {
    useState: (initial: any) => [initial === 0 ? 10 : typeof initial === 'function' ? initial() : initial, () => {}],
    useEffect: () => {}, useCallback: (fn: unknown) => fn, useMemo: (fn: () => unknown) => fn(),
    trpc: queryProxy({ financeGetInterestPayments: [] }), Pencil: Icon, Trash2: Icon, ChevronLeft: Icon, ChevronDown: Icon, Plus: Icon, TrendingUp: Icon,
  });
  return renderToStaticMarkup(React.createElement(api.FinanceOrderCard, {
    order: { ...order, asset_type: 'crypto', collateral_assets: collateral, display_config: {} }, cnyRate: rate ?? Number.NaN, totalPaid: paid,
    livePrices: { ETH: 1625.15 }, realMembers: [], ledgerId: 52, isAdmin: false, showPaymentHistory: false,
    currentUser: null, openedPaymentList: [], paymentForm: {}, getPaymentLabel: (v: string) => v, ROLE_OPTIONS: [],
    savedParticipants: [], participantsList: [], ledgerMembers: [], activeUserTab: 'all',
  }));
}

describe('融资付息真实生产 helper：FX 是字段依赖而非全表依赖', () => {
  it.each([null, 0, Number.NaN, Infinity])('缺失/非法FX %s 时，同币U及CNY本金/日息照常', rate => {
    expect(fee.getFinanceFeeDisplay(nativeU, rate)).toMatchObject({ base: 36500, daily: 10, baseU: 36500, dailyU: 10 });
    expect(fee.getFinanceFeeDisplay(nativeCny, rate)).toMatchObject({ base: 36500, daily: 10, baseU: null, dailyU: null });
    expect(fee.getFinancePaidDisplay(payments, 1001, 'USDT')).toBe(20);
    expect(fee.getFinancePaidDisplay(payments, 1002, 'CNY')).toBe(30);
  });
  it('跨币日息未知，但原基币日息/本金不消失；null 不强转为0', () => {
    expect(fee.getFinanceFeeDisplay(mixed, null)).toMatchObject({ base: 36500, dailyOriginal: 10, daily: null, dailyU: null });
    expect(fee.convertFinanceDisplayAmount(null, 'CNY', 'CNY', null)).toBeNull();
    expect(fee.convertFinanceDisplayAmount(10, 'CNY', 'USDT', null)).toBeNull();
  });
  it('付款只用自身历史FX，缺历史FX不借今天或固定6.8；同币付款保留', () => {
    expect(fee.getFinancePaidDisplay(payments, 1002, 'USDT')).toBeNull();
    expect(fee.getFinancePaidDisplay([{ orderId: 1002, currency: 'CNY', total: 67.3, exchangeRate: 6.73 }], 1002, 'USDT')).toBeCloseTo(10);
    expect(card.financeCardPaid(payments, 1002, 'CNY')).toBe(30);
    expect(card.financeCardPaid(payments, 1002, 'USDT')).toBeNull();
  });
  it('不完整跨币合计维持null，不跳过未知订单冒充完整总额', () => {
    expect(fee.sumFinanceDisplayAmounts([10, null])).toBeNull();
    expect(fee.sumFinanceDisplayAmounts([10, Number.NaN])).toBeNull();
    expect(fee.sumFinanceDisplayAmounts([10, 20])).toBe(30);
    expect(fee.sumFinanceDisplayAmounts([])).toBe(0);
  });
  it.each(['settled', 'completed'])('冻结%s时有原snapshot才换汇，缺snapshot不今天回填', status => {
    const frozen = { ...nativeCny, status };
    expect(fee.financeDisplayFxRate(frozen, 6.73)).toBeNull();
    expect(card.financeCardFxRate(frozen, 6.73)).toBeNull();
    expect(fee.getFinanceFeeDisplay(frozen, 6.73)).toMatchObject({ daily: 10, baseU: null });
    const snapshot = { ...frozen, settlement_snapshot: JSON.stringify({ usdtCnyRate: 7.25 }) };
    expect(fee.financeDisplayFxRate(snapshot, 6.73)).toBe(7.25);
    expect(card.financeCardFxRate(snapshot, 6.73)).toBe(7.25);
  });
});

describe('实际AfFeeDetail TSX离线render：全表、筛选、各分组入口不被另一单CNY阻断', () => {
  it('人员视图缺FX仍有原币本金、10U/10元日息、20U/30元已付及记录入口', () => {
    const html = renderFee();
    expect(html).toContain('AF-U-1001'); expect(html).toContain('AF-CNY-1002');
    expect(html).toContain('本金(U)'); expect(html).toContain('本金(元)');
    expect(html).toContain('10.00 U/天'); expect(html).toContain('10.00 元/天');
    expect(html).toContain('20.00'); expect(html).toContain('30.00');
    expect(html).toContain('cursor-pointer underline decoration-dotted');
    expect(html).toContain('不代表完整金额'); expect(html).not.toMatch(/NaN|Infinity/);
  });
  it('262单、其中84CNY相关不会退回全量简表', () => {
    const orders = Array.from({ length: 262 }, (_, i) => ({ ...(i < 84 ? nativeCny : nativeU), id: 2000 + i, user_id: 11, username: '批量成员', order_no: `AF-REAL-${i}` }));
    const html = renderFee({ orders, paid: [] });
    expect(html).toContain('262单'); expect(html).toContain('AF-REAL-261');
    expect(html).toContain('日息'); expect(html).not.toContain('原币数量'); expect(html).not.toMatch(/NaN|Infinity/);
  });
  it('搜索后仅U订单，不沿用已过滤CNY订单的dependency告警', () => {
    const html = renderFee({ search: 'AF-U-1001' });
    expect(html).toContain('AF-U-1001'); expect(html).not.toContain('AF-CNY-1002');
    expect(html).not.toContain('当前筛选含待换汇字段');
  });
  it('方向过滤先行，另一收息CNY不会阻断当前付息U', () => {
    const html = renderFee({ orders: [nativeU, { ...nativeCny, interest_rate_annual: '10' }], direction: 'pay' });
    expect(html).toContain('AF-U-1001'); expect(html).not.toContain('AF-CNY-1002');
    expect(html).not.toContain('当前筛选含待换汇字段');
  });
  it.each(['byDate', 'byDirection', 'byType'])('%s分组结构和搜索始终存在，未知U合计明确pending', group => {
    const html = renderFee({ group });
    expect(html).toContain('搜索用户名、订单号、起息日、币种');
    expect(html).toContain('汇率/估值待更新'); expect(html).not.toMatch(/NaN|Infinity/);
    if (group !== 'byDate') { expect(html).toContain('10.00 元/天'); expect(html).toContain('AF-U-1001'); }
  });
  it('跨币本金原基币和原币日息不丢失，目标计价pending', () => {
    const html = renderFee({ orders: [mixed], paid: [] });
    expect(html).toContain('本金(元)'); expect(html).toContain('10.00 元（换汇待更新）/天');
    expect(html).toContain('汇率/估值待更新'); expect(html).not.toMatch(/NaN|Infinity/);
  });
});

describe('付款原币分组不能被目标币种估值失败吞掉', () => {
  it('跨币利息目标U、付款原币CNY缺历史FX时，保留30元并标转换pending', () => {
    const html = renderFee({ orders: [mixed], paid: [{ orderId: mixed.id, currency: 'CNY', total: 30, exchangeRate: null }] });
    expect(html).toContain('30.00 元（换汇待更新）');
    expect(html).not.toMatch(/NaN|Infinity/);
  });
  it('未知换汇时，混币付款原币只分币合计，不能30元+20U假作50U', () => {
    const api = execute('card', ['financeCardPaidNative']);
    expect(api.financeCardPaidNative([{ orderId: 1, currency: 'CNY', total: 30 }, { orderId: 1, currency: 'U', total: 20 }], 1)).toBe('30.00 元 + 20.00 U');
  });
});

describe('实际FinanceOrderCard TSX及风险helper：纯U计算不需要USDT/CNY', () => {
  it('ETH1625.15仍参与纯U风险，不因USDT/CNY缺失隐藏风险', () => {
    expect(card.financeCardAssetValue({ coin: 'ETH', qty: '20' }, { ETH: 1625.15 }, null)).toBe(32503);
    expect(card.financeCardExposure({ collateral: 500, floatPnl: 100, accrued: 10, paid: 20, lentOut: 0, principal: 0 })).toBe(610);
    const html = renderCard();
    expect(html).toContain('担保缺口'); expect(html).toContain('已付利息');
    expect(html).not.toContain('风险合计暂不确定'); expect(html).not.toMatch(/NaN|Infinity/);
  });
  it('mixed CNY担保缺FX维持unknown，不跳过该资产计算假完整担保/风险', () => {
    expect(card.financeCardAssetValue({ coin: 'CNY', qty: '100' }, { ETH: 1625.15 }, null)).toBeNull();
    expect(card.financeCardExposure({ collateral: null, floatPnl: 100, accrued: 10, paid: 20, lentOut: 0, principal: 0 })).toBeNull();
    const html = renderCard(nativeU, null, [{ coin: 'USDT', qty: '500' }, { coin: 'CNY', qty: '100' }]);
    expect(html).toContain('风险合计暂不确定'); expect(html).toContain('估值待更新');
    expect(html).not.toContain('超过100%'); expect(html).not.toMatch(/NaN|Infinity/);
  });
  it('CNY同币利息/本金仍直接显示元，缺FX只影响U估值与风险', () => {
    expect(card.financeCardConvert(10, 'CNY', 'CNY', null)).toBe(10);
    const html = renderCard(nativeCny, null, [{ coin: 'CNY', qty: '100' }], 30);
    expect(html).toContain('30.00'); expect(html).toContain('元');
    expect(html).toContain('风险合计暂不确定'); expect(html).not.toMatch(/NaN|Infinity/);
  });
  it('缺非FX报价同样不可把null或遗漏报价当0合并风险', () => {
    expect(card.financeCardExposure({ collateral: 500, floatPnl: null, accrued: 10, paid: 20, lentOut: 0, principal: 0 })).toBeNull();
    expect(card.financeCardAssetValue({ coin: 'BTC', qty: '1' }, { ETH: 1625.15 }, 6.73)).toBeNull();
  });
});
