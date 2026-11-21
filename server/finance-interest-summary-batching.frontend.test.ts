import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryObserver, type UseQueryOptions } from '@tanstack/react-query';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { createTRPCQueryUtils } from '@trpc/react-query';
import { createUseQueries } from '@trpc/react-query/shared';
import { initTRPC } from '@trpc/server';
import { z } from 'zod';
import { buildFinanceInterestSummaryInputs, mergeFinanceInterestSummaryResults, type FinanceInterestSummaryRow } from '../client/src/lib/finance-interest-summary';
import { finitePositive, formatFxEstimate, getUsdtCnyRate } from '../shared/usdt-cny-display';
import { getAfManagementFeeStartAt } from '../shared/af-management-fee-start';

// 仅供静态客户端类型推断的小型隔离router；不导入生产router、不启动后端、不连接数据库。
const t = initTRPC.create();
const testRouter = t.router({ ledger: t.router({
  financeGetInterestPaymentSummary: t.procedure.input(z.object({ ledgerId: z.number(), orderIds: z.array(z.number()).max(200) })).query((): FinanceInterestSummaryRow[] => []),
}) });
type TestRouter = typeof testRouter;
type QueryOptions = UseQueryOptions<FinanceInterestSummaryRow[]>;

const file = 'client/src/pages/AfFeeDetail.tsx';
const source = fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const stateNames: string[] = [];
function visit(node: ts.Node) {
  if (ts.isVariableDeclaration(node) && ts.isArrayBindingPattern(node.name) && node.initializer && ts.isCallExpression(node.initializer) && node.initializer.expression.getText() === 'useState') stateNames.push(node.name.elements[0].getText());
  ts.forEachChild(node, visit);
}
visit(tree);
const body = tree.statements.filter(n => !ts.isImportDeclaration(n) && !ts.isExportDeclaration(n)).map(n => n.getText(tree)).join('\n').replace(/\bexport\s+(default\s+)?/g, '');
const js = ts.transpileModule(body, { fileName: file, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React } }).outputText;
const common = { React, finitePositive, formatFxEstimate, getUsdtCnyRate, getAfManagementFeeStartAt, buildFinanceInterestSummaryInputs, mergeFinanceInterestSummaryResults };
const display = vm.runInNewContext(`${js}; ({ getFinancePaidDisplay, getFinancePaidNativeDisplay, financeDisplayFxRate });`, common);

function transport() {
  const calls: Array<{ method: string; input: { ledgerId: number; orderIds: number[] } }> = [];
  let revision = 1;
  const client = createTRPCClient<TestRouter>({ links: [httpBatchLink({ url: 'https://offline.test/api/trpc', fetch: async (url, init) => {
    const inputs = JSON.parse(new URL(String(url)).searchParams.get('input')!);
    const responses = Object.values(inputs).map((input: any) => {
      calls.push({ method: String(init?.method), input });
      return { result: { data: input.orderIds.map((orderId: number) => ({ orderId, currency: 'U', total: input.ledgerId * revision, exchangeRate: null })) } };
    });
    return new Response(JSON.stringify(responses), { headers: { 'Content-Type': 'application/json' } });
  } })] });
  return { client, calls, nextRevision: () => { revision++; } };
}
const baseOrder = { status: 'active', asset_type: 'crypto', coin: 'ETH', user_id: 11, username: '批量成员', interest_base: '36500', interest_base_currency: 'USDT', interest_rate_currency: 'USDT', interest_rate_annual: '-10', interest_start_date: '2026-11-20', buy_date: '2026-11-20', buy_quantity: '20', buy_price: '1500' };
function orders(count: number) { return Array.from({ length: count }, (_, i) => ({ ...baseOrder, id: i + 1, order_no: `AF-BATCH-${i + 1}` })); }

function renderPage(options: {
  count?: number; ledgerId?: number; ids?: number[]; failedBatch?: number; pendingBatch?: number; placeholderBatch?: number;
  cachedFailure?: boolean; rows?: FinanceInterestSummaryRow[]; group?: string; tab?: string;
} = {}) {
  const pageOrders = options.ids ? options.ids.map(id => ({ ...baseOrder, id, order_no: `AF-BATCH-${id}` })) : orders(options.count ?? 262);
  const net = transport();
  const proxy = createUseQueries<TestRouter>(net.client);
  let queries: QueryOptions[] = [];
  const defaultRows = pageOrders.map(o => ({ orderId: o.id, currency: 'U', total: o.id, exchangeRate: null }));
  const data: Record<string, unknown> = {
    financeGetOrders: { orders: pageOrders }, afAdminGetOrders: [], getMembers: [{ userId: 11, username: '批量成员' }], getMembersBalance: {},
    getRate: { success: true, pair: 'USDT/CNY', rate: 6.73 },
  };
  function queryProxy(name = ''): any {
    return new Proxy(() => {}, { get: (_target, key: string) => {
      if (key === 'useQueries') return (callback: any) => {
        queries = callback(proxy);
        return queries.map((query, index) => {
          const input = (query.queryKey![1] as any).input;
          const rows = (options.rows ?? defaultRows).filter(row => input.orderIds.includes(row.orderId));
          const failed = index === options.failedBatch;
          const pending = index === options.pendingBatch;
          return { data: failed && !options.cachedFailure || pending ? undefined : rows, isSuccess: !failed && !pending, isError: failed, isPlaceholderData: index === options.placeholderBatch };
        });
      };
      if (key === 'useQuery') return () => ({ data: data[name], isLoading: false });
      if (key === 'useMutation') return () => ({ mutate: () => {}, isPending: false });
      if (key === 'useUtils') return () => queryProxy();
      if (key === 'invalidate') return () => {};
      return queryProxy(key);
    } });
  }
  const state: Record<string, unknown> = {
    mainTab: options.tab ?? 'finance', finGroupFilter: options.group ?? 'byPerson', expandedPersons: new Set(['fin_批量成员']),
    expandedCoins: new Set(['fin_direction_collect', 'fin_direction_pay', 'fin_type_crypto']),
  };
  let index = 0;
  const Icon = () => React.createElement('svg');
  const api = vm.runInNewContext(`${js}; ({ AfFeeDetail });`, {
    ...common,
    useState: (initial: any) => [state[stateNames[index++]] ?? (typeof initial === 'function' ? initial() : initial), () => {}],
    useMemo: (fn: () => unknown) => fn(), useRef: (current: unknown) => ({ current }),
    useParams: () => ({ id: String(options.ledgerId ?? 52) }), useLocation: () => ['', () => {}], window: { location: { search: '?tab=finance' } },
    trpc: queryProxy(), ArrowLeft: Icon, ChevronDown: Icon, ChevronRight: Icon, DollarSign: Icon, X: Icon, Tooltip: Icon, FunderOrderCard: Icon, GdOrderDetail: Icon,
  });
  const html = renderToStaticMarkup(React.createElement(api.AfFeeDetail));
  return { html, queries, net };
}

const success = (data: unknown) => ({ data, isSuccess: true, isError: false });
describe('真实利息汇总helper：有界分批且未知不等于0', () => {
  it.each([[199, [199]], [200, [200]], [201, [200, 1]], [262, [200, 62]], [401, [200, 200, 1]]] as const)('%i单完整覆盖，批次大小%s', (count, lengths) => {
    const ids = orders(count).map(o => o.id);
    const inputs = buildFinanceInterestSummaryInputs(52, ids);
    expect(inputs.map(input => input.orderIds.length)).toEqual(lengths);
    expect(inputs.flatMap(input => input.orderIds)).toEqual(ids);
    expect(inputs.every(input => input.ledgerId === 52)).toBe(true);
    const summary = mergeFinanceInterestSummaryResults(inputs.map(input => success(input.orderIds.map(orderId => ({ orderId, currency: 'U', total: orderId, exchangeRate: null })))), inputs.length, true)!;
    expect(summary).toHaveLength(count);
    expect(display.getFinancePaidDisplay(summary, count, 'USDT')).toBe(count);
  });
  it('重复id去重稳定排序，不重复金额；ledger隔离及订单变化形成不同输入', () => {
    const ids = [201, 1, 200, 1, 201, ...orders(201).map(o => o.id)];
    const a = buildFinanceInterestSummaryInputs(52, ids);
    expect(a).toEqual(buildFinanceInterestSummaryInputs(52, [...ids].reverse()));
    expect(a.flatMap(input => input.orderIds)).toEqual(orders(201).map(o => o.id));
    expect(buildFinanceInterestSummaryInputs(37, ids)).not.toEqual(a);
    expect(buildFinanceInterestSummaryInputs(52, [...ids, 202])).not.toEqual(a);
  });
  it.each([
    { data: undefined, isSuccess: false, isError: false },
    { data: [], isSuccess: false, isError: true },
    { data: [], isSuccess: true, isError: true },
    { data: undefined, isSuccess: true, isError: false },
    { data: [], isSuccess: true, isError: false, isPlaceholderData: true },
  ])('未加载/失败/占位分片均不发布假完整汇总：%j', missing => {
    const summary = mergeFinanceInterestSummaryResults([success([{ orderId: 1, currency: 'U', total: 10, exchangeRate: null }]), missing], 2, true);
    expect(summary).toBeUndefined();
    expect(display.getFinancePaidDisplay(summary, 201, 'USDT')).toBeNull();
    expect(display.getFinancePaidNativeDisplay(summary, 201)).not.toContain('0.00');
  });
  it('空付款只在全批成功时为0，禁用/缺批/未知数据不是0', () => {
    expect(mergeFinanceInterestSummaryResults([success([]), success({})], 2, true)).toEqual([]);
    expect(display.getFinancePaidDisplay([], 201, 'USDT')).toBe(0);
    expect(mergeFinanceInterestSummaryResults([success([])], 2, true)).toBeUndefined();
    expect(mergeFinanceInterestSummaryResults([success([])], 1, false)).toBeUndefined();
    expect(mergeFinanceInterestSummaryResults([success('invalid')], 1, true)).toBeUndefined();
    expect(mergeFinanceInterestSummaryResults([], 0, true)).toEqual([]);
  });
  it('历史FX和混币付款逐行原样保留；缺历史FX不借今日价补全', () => {
    const cny = { orderId: 201, currency: 'CNY', total: 30, exchangeRate: null };
    const u = { orderId: 201, currency: 'U', total: 20, exchangeRate: null };
    const historic = { orderId: 202, currency: 'CNY', total: 72.5, exchangeRate: 7.25 };
    const summary = mergeFinanceInterestSummaryResults([success([]), success([cny, u, historic])], 2, true)!;
    expect(summary).toEqual([cny, u, historic]); expect(summary[0]).toBe(cny);
    expect(display.getFinancePaidDisplay(summary, 201, 'USDT')).toBeNull();
    expect(display.getFinancePaidNativeDisplay(summary, 201)).toBe('30.00 元 + 20.00 U');
    expect(display.getFinancePaidDisplay(summary, 202, 'USDT')).toBe(10);
    expect(display.financeDisplayFxRate({ status: 'settled' }, 6.73)).toBeNull();
    expect(display.financeDisplayFxRate({ status: 'settled', settlement_snapshot: { usdtCnyRate: 7.25 } }, 6.73)).toBe(7.25);
    const legacy = mergeFinanceInterestSummaryResults([success({ 1: 10 }), success({ 201: 20 })], 2, true)!;
    expect(display.getFinancePaidDisplay(legacy, 201, 'USDT')).toBe(20);
    expect(display.getFinancePaidDisplay(legacy, 201, 'CNY')).toBeNull();
  });
});

describe('真实AfFeeDetail TSX：同源tRPC批量GET和缓存', () => {
  it.each([[199, [199]], [200, [200]], [201, [200, 1]], [262, [200, 62]], [401, [200, 200, 1]]] as const)('%i单页面实际生成%s的读取请求，无末尾丢单', async (count, lengths) => {
    const { html, queries, net } = renderPage({ count });
    expect(queries.map(q => (q.queryKey![1] as any).input.orderIds.length)).toEqual(lengths);
    expect(html).toContain(`AF-BATCH-${count}`);
    expect(html).not.toContain('已付待加载');
    const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    try {
      const rows = await Promise.all(queries.map(q => cache.fetchQuery(q)));
      expect(net.calls.map(call => call.input.orderIds.length)).toEqual(lengths);
      expect(net.calls.every(call => call.method === 'GET' && call.input.ledgerId === 52)).toBe(true);
      const summary = mergeFinanceInterestSummaryResults(rows.map(success), queries.length, true)!;
      expect(summary).toHaveLength(count);
      expect(display.getFinancePaidDisplay(summary, count, 'USDT')).toBe(52);
    } finally { cache.clear(); }
  });
  it.each(['pending', 'failed', 'cachedFailure', 'placeholder'])('%s时全批完整性门控实际TSX已付、待付、缺口，不伪报0', reason => {
    const { html } = renderPage({ count: 201, pendingBatch: reason === 'pending' ? 1 : undefined, failedBatch: reason === 'failed' || reason === 'cachedFailure' ? 1 : undefined, cachedFailure: reason === 'cachedFailure', placeholderBatch: reason === 'placeholder' ? 1 : undefined });
    expect(html).toContain('AF-BATCH-201');
    expect(html).toContain('已付待加载');
    expect(html).toContain('待付及缺口暂不确定');
    if (reason.includes('Failure') || reason === 'failed') expect(html).toContain('已付利息加载失败');
    const paidCells = [...html.matchAll(/<span[^>]*>已付\(U\)<\/span><span[^>]*>([^<]*)<\/span>/g)].map(match => match[1]);
    expect(paidCells).toHaveLength(201);
    expect(paidCells.every(value => value === '已付待加载')).toBe(true);
    expect(html).not.toMatch(/NaN|Infinity/);
  });
  it('实际页面重复ID不重复查询，切tab只禁用GET，不另造cache', () => {
    const a = renderPage({ ids: [201, 1, 1, 200, 201] });
    expect((a.queries[0].queryKey![1] as any).input.orderIds).toEqual([1, 200, 201]);
    const disabled = renderPage({ count: 201, tab: 'gujian' });
    expect(disabled.queries.every(query => query.enabled === false)).toBe(true);
  });
  it('实际tRPC procedure缓存按ledger/订单隔离，原invalidate使所有活跃分批GET重新读取', async () => {
    const a = renderPage({ count: 262, ledgerId: 52 });
    const b = renderPage({ count: 262, ledgerId: 37 });
    const changed = renderPage({ count: 263, ledgerId: 52 });
    expect(a.queries[0].queryKey).not.toEqual(b.queries[0].queryKey);
    expect(a.queries[1].queryKey).not.toEqual(changed.queries[1].queryKey);
    const net = transport();
    const proxy = createUseQueries<TestRouter>(net.client);
    const cache = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    const utils = createTRPCQueryUtils<TestRouter>({ client: net.client, queryClient: cache });
    const queries = [...buildFinanceInterestSummaryInputs(52, orders(262).map(o => o.id)), ...buildFinanceInterestSummaryInputs(37, orders(262).map(o => o.id))].map(input => proxy.ledger.financeGetInterestPaymentSummary(input));
    const observers = queries.map(query => new QueryObserver(cache, query));
    const unsubs = observers.map(observer => observer.subscribe(() => {}));
    try {
      await Promise.all(queries.map(query => cache.fetchQuery(query)));
      expect(net.calls).toHaveLength(4);
      expect(cache.getQueryData<any[]>(queries[1].queryKey!)![0].total).toBe(52);
      expect(cache.getQueryData<any[]>(queries[3].queryKey!)![0].total).toBe(37);
      net.nextRevision();
      await utils.ledger.financeGetInterestPaymentSummary.invalidate();
      expect(net.calls).toHaveLength(8);
      expect(net.calls.every(call => call.method === 'GET' && call.input.orderIds.length <= 200)).toBe(true);
      expect(cache.getQueryData<any[]>(queries[1].queryKey!)![0].total).toBe(104);
      expect(cache.getQueryData<any[]>(queries[3].queryKey!)![0].total).toBe(74);
      expect(net.calls.filter(call => call.input.ledgerId === 52).flatMap(call => call.input.orderIds)).toContain(262);
    } finally { unsubs.forEach(unsubscribe => unsubscribe()); cache.clear(); }
  });
  it('禁用自建汇总cache，不提高API上限，不改付款mutation刷新入口', () => {
    expect(source).toContain('trpc.useQueries(');
    expect(source).toContain('utils.ledger.financeGetInterestPaymentSummary.invalidate();');
    expect(source).not.toMatch(/financeGetInterestPaymentSummary\.useQuery\(/);
    expect(source).not.toMatch(/finOrderIds\.slice\(|queryKey\s*:/);
    const routerSource = fs.readFileSync(new URL('./routers.ts', import.meta.url), 'utf8');
    const start = routerSource.indexOf('financeGetInterestPaymentSummary: protectedProcedure');
    expect(routerSource.slice(start, start + 250)).toContain('orderIds: z.array(z.number()).max(200)');
  });
});
