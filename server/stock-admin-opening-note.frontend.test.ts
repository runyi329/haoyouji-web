import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import * as instruments from '../shared/portfolio-instruments';
import { buildStockMemberRealizedLots, hasStockCustomerActivity } from '../shared/stock-realized-portfolio';
import { summarizeStockCustomerPnl } from '../shared/stock-customer-pnl';

// Execute actual TSX (including the complete page), not copied business logic.
// Only pure shared helpers, inert React hooks and tRPC spies are imported: no DB/HTTP/accounting writes.
const source = readFileSync(new URL('../client/src/pages/StockTagPortfolio.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('actual.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declarations = new Map<string, ts.Node>();
function collect(node: ts.Node) {
  if (ts.isFunctionDeclaration(node) && node.name) declarations.set(node.name.text, node);
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) declarations.set(node.name.text, node.initializer);
  ts.forEachChild(node, collect);
}
collect(ast);
function actual(name: string, scope: Record<string, any> = {}, preview = false) {
  const node = declarations.get(name);
  if (!node) throw new Error(`Missing real TSX function: ${name}`);
  const code = node.getText(ast).replace(/^export\s+(default\s+)?/, '').replaceAll('import.meta.env.DEV', '__preview');
  const js = ts.transpileModule(`const execute = ${code};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React },
  }).outputText;
  return new Function('React', '__preview', ...Object.keys(scope), `${js}; return execute;`)(React, preview, ...Object.values(scope));
}
function nodes(tree: any): any[] {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
}
function text(tree: any): string {
  if (Array.isArray(tree)) return tree.map(text).join('');
  if (tree == null || typeof tree === 'boolean') return '';
  return typeof tree === 'object' ? text(tree.props?.children) : String(tree);
}
function expand(tree: any): any {
  if (Array.isArray(tree)) return tree.map((child, i) => {
    const value = expand(child);
    return React.isValidElement(value) ? React.cloneElement(value, { key: value.key ?? i }) : value;
  });
  if (!tree || typeof tree !== 'object') return tree;
  if (typeof tree.type === 'function') return expand(tree.type(tree.props));
  return React.cloneElement(tree, tree.props, expand(tree.props?.children));
}
function findButton(tree: any, label: string): any {
  const found = nodes(tree).find(node => node.type === 'button' && (text(node).trim() === label || node.props['aria-label'] === label));
  if (!found) throw new Error(`Actual button missing: ${label}`);
  return found;
}
const openedAt = '2026-11-01T02:00:00Z';
const longNote = `  第一行开仓说明\n第二行 <script>alert("unsafe")</script> & <img src=x onerror=alert(1)>\n${'无空格超长文本'.repeat(180)}  `;
function harness(options: { participantView?: boolean; canEdit?: boolean; preview?: boolean } = {}) {
  const state: any[] = []; let cursor = 0;
  const lots: any[] = [
    { id: 11, quantity: 100, unitCost: 10, openedAt, note: 'AAPL第一批开仓', openedEventId: 101 },
    { id: 12, quantity: 50, unitCost: 20, openedAt: '2026-11-02T02:00:00Z', note: '' },
    { id: 13, quantity: 30, unitCost: 30, openedAt: '2026-11-03T02:00:00Z', note: longNote },
  ];
  const positions = [
    { symbol: 'AAPL', stockName: '苹果', currency: 'USD', marketPrice: 12, lots: lots.slice(0, 2) },
    { symbol: 'TSLA', stockName: '特斯拉', currency: 'USD', marketPrice: 35, lots: [lots[2]] },
  ];
  const closed: any = { lotId: 22, sellEventId: 222, symbol: 'MSFT', stockName: '微软', soldQuantity: 5,
    openedAt, unitCost: 10, sellPrice: 9, buyValue: 50, sellValue: 45, accountNetProfit: -5,
    soldAt: '2026-11-10T02:00:00Z', note: '完全已平仓开仓说明', sellNote: '独立卖出说明', openedEventId: 102 };
  const partial: any = { ...closed, lotId: 11, sellEventId: 223, symbol: 'AAPL', stockName: '苹果',
    note: lots[0].note, sellNote: '部分卖出说明', soldAt: '2026-11-11T02:00:00Z', openedEventId: 101 };
  const history: any[] = [
    { id: 101, type: 'buy', status: 'active', symbol: 'AAPL', stockName: '苹果', executionPrice: 10, actualTradedAt: openedAt, note: '不可复活原始历史', quantity: 100 },
    { id: 102, type: 'add', status: 'active', symbol: 'MSFT', executionPrice: 10, actualTradedAt: openedAt, note: '已平仓历史开仓备注', quantity: 5 },
  ];
  const globalData: any = { canEdit: options.canEdit ?? true, viewerUserId: 901, positions, history,
    summary: { usdtCnyRate: null }, soldLots: [closed, partial], realizedLots: [closed, partial] };
  const publicData: any = { positions, summary: { usdtCnyRate: null } };
  const memberData: any = { viewerUserId: 901, positions: positions.map(position => ({ ...position,
    lots: position.lots.map(lot => ({ ...lot, lotId: lot.id, quantity: 6, entryPrice: lot.unitCost })) })),
    summary: {}, history, participations: [], closedLots: [{ ...closed, participationId: 1, realizedPnl: 5 }] };
  const matrix: any = { members: [{ userId: 901, name: '成员甲' }, { userId: 902, name: '成员乙' }],
    lots: lots.map((lot, i) => ({ ...lot, symbol: i === 2 ? 'TSLA' : 'AAPL', participations: [
      { id: lot.id * 10, userId: 901, remainingQuantity: 6, allocatedQuantity: 6, entryPrice: lot.unitCost,
        floatingPnl: -12, realizedPnl: 8, closedQuantity: 1, startDate: '2026-11-01' },
      { id: lot.id * 10 + 1, userId: 902, remainingQuantity: 4, allocatedQuantity: 4, entryPrice: lot.unitCost,
        floatingPnl: -8, realizedPnl: 0, closedQuantity: 0 },
    ] })) };
  const calls: Record<string, any[]> = {};
  const invalidates = Object.fromEntries(['getStockTagPortfolio', 'getStockLotParticipationMatrix',
    'getMyStockTagParticipantPortfolio', 'getStockTagPublicPortfolio', 'getStockTagDailySnapshots'].map(name => [name, vi.fn().mockResolvedValue(undefined)]));
  const mutation = { mutate: vi.fn(), isPending: false };
  let mutationOptions: any;
  const scope: Record<string, any> = {
    ...instruments, instrumentCurrency: instruments.portfolioCurrency, summarizeStockCustomerPnl,
    buildStockMemberRealizedLots, hasStockCustomerActivity,
    useState: (initial: any) => { const i = cursor++; if (!(i in state)) state[i] = typeof initial === 'function' ? initial() : initial;
      return [state[i], (value: any) => { state[i] = typeof value === 'function' ? value(state[i]) : value; }]; },
    useAuth: () => ({ user: { id: 901, name: '成员甲' } }),
    toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() }, eventLabels: {}, eventTone: {},
    trpc: { useUtils: () => ({ ledger: Object.fromEntries(Object.entries(invalidates).map(([name, invalidate]) => [name, { invalidate }])) }),
      stock: { getUsdCnyRate: { useQuery: () => ({ data: { success: true, rate: 7.2 } }) } }, ledger: {},
      searchManualStocks: { useQuery: () => ({ data: { results: [] } }) } },
  };
  const dataMap: Record<string, any> = { getStockTagPortfolio: globalData, getStockTagPublicPortfolio: publicData,
    getMyStockTagParticipantPortfolio: memberData, getStockTagDailySnapshots: [], getStockLotParticipationMatrix: matrix };
  for (const [name, data] of Object.entries(dataMap)) scope.trpc.ledger[name] = { useQuery: (input: any, queryOptions: any) => {
    (calls[name] ??= []).push({ input, options: queryOptions }); return { data, isLoading: false, error: null }; } };
  scope.trpc.ledger.correctStockTagEvent = { useMutation: () => ({ mutate: vi.fn(), isPending: false }) };
  scope.trpc.ledger.updateStockTagLotNote = { useMutation: (next: any) => { mutationOptions = next; return mutation; } };
  for (const name of ['normalizeCurrency', 'money', 'signedMoney', 'formatQuantity', 'formatDateTime', 'daysSinceBeijingDate',
    'formatMonthDay', 'formatQuoteUpdate', 'formatCompactQuoteUpdate', 'localInputTime', 'buildCryptoAwareMemberRealizedLots']) scope[name] = actual(name, scope);
  for (const name of ['ArrowLeft', 'BadgeCheck', 'ChevronDown', 'ChevronUp', 'History', 'Loader2', 'Plus', 'X', 'Avatar', 'AvatarImage',
    'AvatarFallback', 'Label', 'StockNameProfitSummary', 'StockCustomerProfitSummary', 'StockQuoteUpdateIndicator',
    'CryptoAwareObservationAccountSummary', 'CryptoAwareObservationPortfolio', 'StockParticipantProfitChart']) scope[name] = 'span';
  scope.Button = 'button'; scope.Input = 'input';
  for (const name of ['Dialog', 'Sheet', 'StockTagTradeDialog']) scope[name] = (p: any) => p.open ? React.createElement('div', null, p.children) : null;
  for (const name of ['DialogContent', 'DialogHeader', 'DialogTitle', 'SheetContent', 'SheetHeader', 'SheetTitle']) scope[name] = 'div';
  scope.StockTagBuyEditDialog = (p: any) => { scope.buyEditProps = p; return p.order && p.canEdit ? React.createElement('div', { 'data-buy-edit-lot': p.order.lotId }) : null; };
  const props: any = { ledgerId: 37, categoryId: 90250, categoryName: 'R1测试标签', onBack: vi.fn(),
    participantView: options.participantView ?? false, presentationMode: options.participantView ? 'user' : 'admin', effectiveUserId: 901 };
  const component = actual('LegacyStockTagPortfolio', scope, options.preview);
  const render = () => { cursor = 0; return expand(component(props)); };
  const click = (label: string) => findButton(render(), label).props.onClick();
  const noteBlocks = (tree = render()) => nodes(tree).filter(node => node.props?.['data-stock-lot-note-id'] !== undefined);
  const note = (id: number) => noteBlocks().find(node => node.props['data-stock-lot-note-id'] === id);
  const field = (id: number) => nodes(note(id)).find(node => node.type === 'textarea');
  const change = (id: number, value: string) => field(id).props.onChange({ target: { value } });
  const success = () => {
    const payload = mutation.mutate.mock.calls.at(-1)?.[0];
    if (!payload) throw new Error('No offline mutation payload to acknowledge');
    for (const lot of lots) if (lot.id === payload.lotId) lot.note = payload.note;
    for (const lot of globalData.soldLots) if (lot.lotId === payload.lotId) lot.note = payload.note;
    mutation.isPending = false;
    mutationOptions.onSuccess();
  };
  return { render, click, note, noteBlocks, field, change, success, lots, closed, partial, history, globalData, publicData,
    memberData, matrix, calls, mutation, invalidates, scope, props, onError: (error: Error) => mutationOptions.onError(error) };
}
function handlerScope(patch: Record<string, any> = {}) {
  return { canEdit: true, participantView: false, isLocalHotPreview: false, categoryId: 90250, editingLotNoteId: 11,
    lotNoteDraft: '  原样\n开仓说明  ', updateLotNoteMutation: { mutate: vi.fn(), isPending: false },
    setEditingLotNoteId: vi.fn(), setLotNoteDraft: vi.fn(), toast: { info: vi.fn() }, ...patch };
}
function callsInside(name: string, callee: string) {
  const found: ts.CallExpression[] = [];
  const node = declarations.get(name);
  if (!node) throw new Error(`Missing AST integration node: ${name}`);
  function visit(child: ts.Node) {
    if (ts.isCallExpression(child) && child.expression.getText(ast) === callee) found.push(child);
    ts.forEachChild(child, visit);
  }
  visit(node); return found;
}

describe('管理员买入修改入口：实际整页TSX完全离线回归', () => {
  it('所有未展开当前持仓都有修改入口，展开后仍存在', () => {
    const h = harness();
    const edits = (tree: any) => nodes(tree).filter(node => String(node.props?.['aria-label'] || '').startsWith('修改买入持仓编号'));
    expect(edits(h.render())).toHaveLength(3);
    h.click('展开持仓编号 01'); expect(edits(h.render())).toHaveLength(1);
    expect(findButton(h.render(), '修改买入持仓编号 01 苹果')).toBeTruthy();
  });
  it('预填原100股而非部分卖出剩余25股，美元原价10而非人民币72，备注使用批次新版', () => {
    const h = harness(); h.lots[0].quantity = 25; h.click('修改买入持仓编号 01 苹果'); h.render();
    expect(h.scope.buyEditProps.order).toEqual(expect.objectContaining({ eventId: 101, lotId: 11, quantity: 100,
      executionPrice: 10, actualTradedAt: openedAt, note: 'AAPL第一批开仓', minimumQuantity: 10, hasSales: true }));
  });
  it('打开及取消不提交更正或买卖，也不隐藏或展开其他持仓', () => {
    const h = harness(); h.click('修改买入持仓编号 01 苹果'); h.render();
    expect(h.scope.buyEditProps.order.lotId).toBe(11);
    expect(nodes(h.render()).filter(node => String(node.props?.['aria-label'] || '').startsWith('展开持仓编号'))).toHaveLength(3);
    h.scope.buyEditProps.onClose(); h.render(); expect(h.scope.buyEditProps.order).toBeNull();
    expect(h.mutation.mutate).not.toHaveBeenCalled();
  });
  it('已分配但未卖出的批次也可以打开修改，不因已有成员拒绝入口', () => {
    const h = harness(); h.globalData.realizedLots = [h.closed]; h.globalData.soldLots = [h.closed];
    h.click('修改买入持仓编号 01 苹果'); h.render();
    expect(h.scope.buyEditProps.order.hasSales).toBe(false); expect(h.scope.buyEditProps.order.minimumQuantity).toBe(10);
  });
  it('历史超过返回上限时只使用明确initialQuantity，而不猜测剩余数量或同名历史', () => {
    const h = harness(); h.history.splice(0, 1); h.lots[0].initialQuantity = 100; h.lots[0].quantity = 25;
    h.click('修改买入持仓编号 01 苹果'); h.render();
    expect(h.scope.buyEditProps.order.quantity).toBe(100); expect(h.scope.buyEditProps.order.executionPrice).toBe(10);
  });
  it('原信息不完整时禁止猜单，提示刷新，不创建编辑目标', () => {
    const h = harness(); h.click('修改买入持仓编号 02 苹果'); h.render();
    expect(h.scope.buyEditProps.order).toBeNull(); expect(h.scope.toast.error).toHaveBeenCalledWith(expect.stringContaining('原买入信息'));
  });
  it.each([{ participantView: true, canEdit: true }, { participantView: false, canEdit: false }])('普通成员或委派管理员没有买入修改入口或编辑弹窗：%j', options => {
    const h = harness(options); const tree = h.render();
    expect(nodes(tree).some(node => String(node.props?.['aria-label'] || '').startsWith('修改买入持仓编号'))).toBe(false);
    expect(h.scope.buyEditProps).toBeUndefined();
  });
  it('只读热预览传禁写标识，仍可打开预填及取消', () => {
    const h = harness({ preview: true }); h.click('修改买入持仓编号 01 苹果'); h.render();
    expect(h.scope.buyEditProps.readOnlyPreview).toBe(true); expect(h.scope.buyEditProps.order.quantity).toBe(100);
    h.scope.buyEditProps.onClose(); h.render(); expect(h.scope.buyEditProps.order).toBeNull();
  });
});

describe('管理员所有股票列表开仓备注：实际TSX完全离线回归', () => {
  it('AST集成：当前、用户关联明细、已卖出均调用共用渲染，不另抄备注展示', () => {
    for (const name of ['renderHoldingTables', 'renderMemberTables', 'renderSoldLots'])
      expect(callsInside(name, 'renderAdminLotNote'), name).toHaveLength(1);
    expect(callsInside('LegacyStockTagPortfolio', 'resolveLotNote').length).toBeGreaterThanOrEqual(3);
  });
  it('默认所有当前卡无需展开即显示备注、未填写和编辑，保持全部卡', () => {
    const h = harness(); const tree = h.render();
    const current = h.noteBlocks(tree).filter(node => [11, 12, 13].includes(node.props['data-stock-lot-note-id']));
    expect(current.map(node => node.props['data-stock-lot-note-id'])).toEqual([11, 12, 13, 11]);
    expect(text(h.note(11))).toContain('AAPL第一批开仓'); expect(text(h.note(12))).toContain('未填写');
    expect(text(h.note(13))).toContain(longNote);
    for (const id of [11, 12, 13]) expect(findButton(h.note(id), `编辑批次 ${id} 开仓备注`)).toBeTruthy();
    expect(nodes(tree).filter(node => String(node.props?.['aria-label'] || '').startsWith('展开持仓编号')).length).toBe(3);
    expect(text(tree)).not.toContain('成员份额（按当前数量由多到少）');
  });
  it('只编辑默认卡不进入单笔聚焦，也不隐藏其余编号或备注', () => {
    const h = harness(); h.click('编辑批次 11 开仓备注');
    expect(h.field(11).props.value).toBe('AAPL第一批开仓');
    expect(text(h.note(12))).toContain('未填写'); expect(text(h.note(13))).toContain(longNote);
    expect(nodes(h.render()).filter(node => String(node.props?.['aria-label'] || '').startsWith('展开持仓编号'))).toHaveLength(3);
  });
  it('展开与收起当前卡仍仅一次显示该卡开仓备注，无重复编辑器', () => {
    const h = harness(); h.click('展开持仓编号 01');
    const current = nodes(h.render()).find(node => node.key === 'AAPL-11');
    expect(current).toBeTruthy();
    expect(h.noteBlocks(current)).toHaveLength(1); expect(text(current)).toContain('AAPL第一批开仓');
    h.click('收起持仓编号 01'); expect(text(h.note(13))).toContain(longNote);
  });
  it('完全已平仓也有开仓备注和编辑，与独立卖出备注分开', () => {
    const h = harness(); const sold = nodes(h.render()).find(node => node.key === 'sold-22-222');
    expect(text(sold)).toContain('完全已平仓开仓说明'); expect(text(sold)).toContain('卖出备注：独立卖出说明');
    expect(text(h.note(22))).not.toContain('独立卖出说明');
    findButton(sold, '编辑批次 22 开仓备注').props.onClick(); h.change(22, '只修改开仓');
    findButton(h.note(22), '保存备注').props.onClick();
    expect(h.mutation.mutate).toHaveBeenCalledWith({ ledgerId: 37, categoryId: 90250, lotId: 22, note: '只修改开仓' });
    expect(h.closed.sellNote).toBe('独立卖出说明');
  });
  it('部分卖出与当前持仓共享批次备注，成功刷新两处但不改卖出备注', () => {
    const h = harness(); h.click('编辑批次 11 开仓备注'); h.change(11, '同一开仓新版');
    findButton(h.note(11), '保存备注').props.onClick(); h.success();
    const sameLot = h.noteBlocks().filter(node => node.props['data-stock-lot-note-id'] === 11);
    expect(sameLot).toHaveLength(2); expect(sameLot.every(node => text(node).includes('同一开仓新版'))).toBe(true);
    expect(h.partial.sellNote).toBe('部分卖出说明');
  });
  it('管理员用户视角展开成员关联卡使用账户开仓备注，可直接编辑全部关联编号', () => {
    const h = harness(); h.matrix.lots[0].note = '不能错误用矩阵旧备注'; h.click('用户视角');
    expect(h.noteBlocks().filter(node => [12, 13].includes(node.props['data-stock-lot-note-id']))).toHaveLength(0);
    const group = nodes(h.render()).find(node => node.key === '901');
    nodes(group).find(node => node.type === 'button' && node.props['aria-expanded'] === false).props.onClick();
    expect(text(h.note(11))).toContain('AAPL第一批开仓'); expect(text(h.note(11))).not.toContain('不能错误用矩阵旧备注');
    expect(text(h.note(12))).toContain('未填写'); expect(text(h.note(13))).toContain(longNote);
    h.click('编辑批次 13 开仓备注'); expect(h.field(13).props.value).toBe(longNote);
  });
  it.each([{ participantView: true, canEdit: true }, { participantView: false, canEdit: false }])(
    '普通成员/只读页不泄漏开仓或卖出备注，不能出现编辑控件：%j', options => {
      const h = harness(options); const tree = h.render();
      expect(h.noteBlocks(tree)).toHaveLength(0);
      expect(text(tree)).not.toMatch(/AAPL第一批开仓|第一行开仓说明|完全已平仓开仓说明|独立卖出说明|不可复活原始历史|开仓备注|未填写/);
      expect(nodes(tree).some(node => String(node.props?.['aria-label'] || '').includes('开仓备注'))).toBe(false);
      expect(h.calls.getStockLotParticipationMatrix[0].options.enabled).toBe(false);
      if (options.participantView) expect(h.calls.getStockTagPortfolio[0].options.enabled).toBe(false);
      expect(h.mutation.mutate).not.toHaveBeenCalled();
    });
  it('实际R1 AI页签只挂安全子树，备注lot字段不会进入旧组合页', () => {
    const state: any[] = []; let cursor = 0;
    const tabs = actual('R1StockPresentationTabs', { useState: (initial: any) => {
      const i = cursor++; if (!(i in state)) state[i] = initial; return [state[i], (value: any) => { state[i] = value; }];
    }, LegacyStockTagPortfolio: 'legacy', Ledger37AiHome: 'safe-ai' });
    const render = () => { cursor = 0; return tabs({ props: { ledgerId: 37, categoryId: 90250, note: longNote },
      context: { viewerUserId: 901, canManage: true, aiEnabled: true } }); };
    findButton(render(), 'AI').props.onClick();
    expect(nodes(render()).some(node => node.type === 'legacy')).toBe(false);
    const ai = nodes(render()).find(node => node.type === 'safe-ai');
    expect(ai.props).toEqual({ viewerUserId: 901, adminPreview: true, onBack: undefined });
    expect(text(render())).not.toContain(longNote);
  });
  it('长多行备注保持换行/断词，React文本转义而不是HTML或截断', () => {
    const h = harness(); const block = h.note(13); const value = nodes(block).find(node => text(node) === longNote);
    expect(value.props.className).toContain('whitespace-pre-wrap'); expect(value.props.className).toContain('break-words');
    expect(value.props.className).not.toMatch(/truncate|line-clamp|overflow-hidden/);
    expect(nodes(block).some(node => node.props?.dangerouslySetInnerHTML)).toBe(false);
    const html = renderToStaticMarkup(block);
    expect(html).toContain('&lt;script&gt;'); expect(html).toContain('&lt;img'); expect(html).not.toContain('<script>');
    expect(text(block)).toContain(longNote);
  });
  it('编辑使用原始空白换行文本，不trim或把占位未填写带入草稿；取消不提交', () => {
    const h = harness(); h.click('编辑批次 13 开仓备注'); expect(h.field(13).props.value).toBe(longNote);
    h.change(13, '  临时草稿\n  '); findButton(h.note(13), '取消').props.onClick();
    expect(h.field(13)).toBeUndefined(); expect(text(h.note(13))).toContain(longNote); expect(h.mutation.mutate).not.toHaveBeenCalled();
    h.click('编辑批次 12 开仓备注'); expect(h.field(12).props.value).toBe('');
  });
  it('实际textarea限制3000字符且onChange截断超长输入，提交保留原始空白', () => {
    const h = harness(); h.click('编辑批次 12 开仓备注'); expect(h.field(12).props.maxLength).toBe(3000);
    h.change(12, ` \n${'甲'.repeat(3100)}`); expect(h.field(12).props.value).toBe(` \n${'甲'.repeat(2998)}`);
    findButton(h.note(12), '保存备注').props.onClick();
    expect(h.mutation.mutate.mock.calls[0][0].note).toHaveLength(3000);
    expect(h.mutation.mutate.mock.calls[0][0].note.startsWith(' \n')).toBe(true);
  });
  it('清空备注提交空串，成功后不复活immutable原始开仓历史', () => {
    const h = harness(); h.click('编辑批次 11 开仓备注'); h.change(11, '');
    findButton(h.note(11), '保存备注').props.onClick();
    expect(h.mutation.mutate).toHaveBeenCalledWith({ ledgerId: 37, categoryId: 90250, lotId: 11, note: '' }); h.success();
    expect(text(h.note(11))).toContain('未填写'); expect(text(h.note(11))).not.toContain('不可复活原始历史');
    expect(h.history[0].note).toBe('不可复活原始历史');
    h.click('编辑批次 11 开仓备注'); expect(h.field(11).props.value).toBe('');
  });
  it('pending禁保存重入、取消与切换批次，直接执行disabled handlers也被守卫', () => {
    const h = harness(); h.click('编辑批次 11 开仓备注'); h.change(11, '待保存');
    findButton(h.note(11), '保存备注').props.onClick(); h.mutation.isPending = true;
    expect(h.field(11).props.disabled).toBe(true);
    for (const label of ['保存中', '取消']) { const button = findButton(h.note(11), label); expect(button.props.disabled).toBe(true); button.props.onClick(); }
    const other = findButton(h.note(12), '编辑批次 12 开仓备注'); expect(other.props.disabled).toBe(true); other.props.onClick();
    expect(h.field(11).props.value).toBe('待保存'); expect(h.field(12)).toBeUndefined(); expect(h.mutation.mutate).toHaveBeenCalledOnce();
  });
  it('保存成功退出编辑并刷新账户和分配矩阵；只传四个备注业务字段', () => {
    const h = harness(); h.click('编辑批次 12 开仓备注'); h.change(12, '  新备注\n  ');
    findButton(h.note(12), '保存备注').props.onClick();
    expect(h.mutation.mutate.mock.calls[0][0]).toEqual({ ledgerId: 37, categoryId: 90250, lotId: 12, note: '  新备注\n  ' });
    h.success(); expect(h.field(12)).toBeUndefined(); expect(text(h.note(12))).toContain('  新备注\n  ');
    expect(h.invalidates.getStockTagPortfolio).toHaveBeenCalledWith({ ledgerId: 37, categoryId: 90250 });
    expect(h.invalidates.getStockLotParticipationMatrix).toHaveBeenCalledWith({ ledgerId: 37, categoryId: 90250 });
    expect(h.scope.toast.success).toHaveBeenCalledOnce();
  });
  it('保存错误显示反馈并保留草稿以便重试，不刷新假成功数据', () => {
    const h = harness(); h.click('编辑批次 12 开仓备注'); h.change(12, '失败草稿');
    findButton(h.note(12), '保存备注').props.onClick(); h.onError(new Error('离线失败'));
    expect(h.field(12).props.value).toBe('失败草稿'); expect(h.scope.toast.error).toHaveBeenCalledWith('备注保存失败：离线失败');
    expect(h.invalidates.getStockTagPortfolio).not.toHaveBeenCalled();
  });
  it('DEV真实整页仍展示与编辑备注，但保存只toast，不mutation/刷新/篡改正式数据', () => {
    const h = harness({ preview: true }); h.click('编辑批次 11 开仓备注'); h.change(11, '热预览草稿');
    findButton(h.note(11), '保存备注').props.onClick();
    expect(h.scope.toast.info).toHaveBeenCalled(); expect(h.mutation.mutate).not.toHaveBeenCalled();
    expect(h.invalidates.getStockTagPortfolio).not.toHaveBeenCalled(); expect(h.lots[0].note).toBe('AAPL第一批开仓');
    expect(h.field(11).props.value).toBe('热预览草稿');
  });
  it.each([
    { canEdit: false }, { participantView: true }, { editingLotNoteId: 12 },
    { updateLotNoteMutation: { mutate: vi.fn(), isPending: true } },
  ])('实际saveLotNote权限、编辑目标、pending守卫：%j', patch => {
    const scope = handlerScope(patch); actual('saveLotNote', scope)(11); expect(scope.updateLotNoteMutation.mutate).not.toHaveBeenCalled();
  });
  it.each([0, -1, 1.5, NaN, Infinity])('非法批次ID %s不能通过真实begin/save/render', lotId => {
    const scope = handlerScope({ editingLotNoteId: lotId });
    actual('beginLotNoteEdit', scope)(lotId, '不得编辑'); actual('saveLotNote', scope)(lotId);
    expect(scope.setEditingLotNoteId).not.toHaveBeenCalled(); expect(scope.updateLotNoteMutation.mutate).not.toHaveBeenCalled();
    expect(actual('renderAdminLotNote', scope)(lotId, '不得展示')).toBeNull();
  });
  it.each([{ canEdit: false }, { participantView: true }])('真实共用render/begin不能用直接调用绕过权限：%j', patch => {
    const scope = handlerScope(patch); expect(actual('renderAdminLotNote', scope)(11, '秘密')).toBeNull();
    actual('beginLotNoteEdit', scope)(11, '秘密'); expect(scope.setEditingLotNoteId).not.toHaveBeenCalled();
  });
  it.each(['', null, undefined])('原note字段存在即使值%s也不回退历史', value => {
    const scope = { historyRows: [{ id: 101, type: 'buy', status: 'active', symbol: 'AAPL', note: '历史秘密' }] };
    expect(actual('resolveLotNote', scope)({ note: value, openedEventId: 101 }, 'AAPL')).toBe('');
  });
  it('缺note按openedEventId找active buy/add并核对symbol，忽略撤销、卖出及其他股票', () => {
    const historyRows = [
      { id: 101, type: 'buy', status: 'voided', symbol: 'AAPL', note: '撤销不得显示' },
      { id: 101, type: 'sell', status: 'active', symbol: 'AAPL', note: '卖出不得冒充开仓' },
      { id: 101, type: 'buy', status: 'active', symbol: 'TSLA', note: '别的symbol' },
      { id: 102, type: 'buy', status: 'active', symbol: 'AAPL', note: '不同ID' },
      { id: 101, type: 'add', status: 'active', symbol: 'AAPL', note: '精确开仓ID' },
    ];
    const resolve = actual('resolveLotNote', { historyRows });
    expect(resolve({ openedEventId: 101, unitCost: 999, openedAt: '错误时间' }, 'AAPL')).toBe('精确开仓ID');
    expect(resolve({ openedEventId: 999 }, 'AAPL')).toBe('');
  });
  it('缺note无ID按原币价格+时间+symbol匹配，USD换汇后的人民币价格不错误参与回退', () => {
    const h = harness(); delete h.lots[0].note; delete h.lots[0].openedEventId;
    expect(text(h.note(11))).toContain('不可复活原始历史');
    expect(actual('resolveLotNote', { historyRows: h.history })({ unitCost: 72, openedAt }, 'AAPL', 10)).toBe('不可复活原始历史');
    expect(actual('resolveLotNote', { historyRows: h.history })({ unitCost: 72, openedAt }, 'AAPL')).toBe('');
  });
  it('未匹配历史的缺note正常未填写；时间不符/价格不符/symbol不符不串批次', () => {
    const historyRows = [{ type: 'buy', status: 'active', symbol: 'AAPL', executionPrice: 10, actualTradedAt: openedAt, note: '唯一来源' }];
    const resolve = actual('resolveLotNote', { historyRows });
    for (const [lot, symbol] of [[{ unitCost: 11, openedAt }, 'AAPL'], [{ unitCost: 10, openedAt: '2026-11-02T02:00:00Z' }, 'AAPL'],
      [{ unitCost: 10, openedAt }, 'TSLA']] as const) expect(resolve(lot, symbol)).toBe('');
  });
  it('已平仓兼容缺note时同样回退其开仓事件，不误显示sellNote', () => {
    const h = harness(); delete h.closed.note; expect(text(h.note(22))).toContain('已平仓历史开仓备注');
    expect(text(h.note(22))).not.toContain('独立卖出说明');
  });
});
