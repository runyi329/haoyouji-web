import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import * as instruments from "../shared/portfolio-instruments";
import * as helpers from "../client/src/lib/r1StockPresentation";
import { isR1StockPresentationScope, type R1AiParticipationPortfolio } from "../shared/r1-stock-presentation";
import { buildStockMemberRealizedLots, hasStockCustomerActivity, stockRealizedValueCny } from "../shared/stock-realized-portfolio";
import { summarizeStockCustomerPnl } from "../shared/stock-customer-pnl";

// Actual TSX function bodies, inert hooks only. No application backend, DB, HTTP or writes.
const source = readFileSync(new URL("../client/src/pages/StockTagPortfolio.tsx", import.meta.url), "utf8");
const aiSource = readFileSync(new URL("../client/src/components/R1AiParticipationView.tsx", import.meta.url), "utf8");
const homeSource = readFileSync(new URL("../client/src/components/Ledger37AiHome.tsx", import.meta.url), "utf8");
function actual(source: string, name: string, scope: Record<string, any> = {}) {
  const file = ts.createSourceFile("actual.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let code = "";
  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) code = node.getText(file).replace(/^export\s+(default\s+)?/, "");
    if (ts.isVariableDeclaration(node) && node.name.getText(file) === name && node.initializer) code = node.initializer.getText(file);
    ts.forEachChild(node, visit);
  }
  visit(file);
  if (!code) throw new Error(`Actual frontend function missing: ${name}`);
  const js = ts.transpileModule(`const execute = ${code.replaceAll("import.meta.env.DEV", "false")};`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React } }).outputText;
  return new Function("React", ...Object.keys(scope), `${js}; return execute;`)(React, ...Object.values(scope));
}
function nodes(tree: any): any[] {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return tree && typeof tree === "object" ? [tree, ...nodes(tree.props?.children)] : [];
}
function text(tree: any): string {
  if (Array.isArray(tree)) return tree.map(text).join("");
  if (tree == null || typeof tree === "boolean") return "";
  return typeof tree === "object" ? text(tree.props?.children) : String(tree);
}
function expand(tree: any): any {
  if (Array.isArray(tree)) return tree.map((child, index) => { const expanded = expand(child); return React.isValidElement(expanded) ? React.cloneElement(expanded, { key: expanded.key ?? index }) : expanded; });
  if (!tree || typeof tree !== "object") return tree;
  if (typeof tree.type === "function") return expand(tree.type(tree.props));
  return React.cloneElement(tree, tree.props, expand(tree.props?.children));
}
function hookState() {
  const state: any[] = []; let cursor = 0;
  return { reset: () => { cursor = 0; }, useState: (initial: any) => {
    const i = cursor++; if (!(i in state)) state[i] = typeof initial === "function" ? initial() : initial;
    return [state[i], (value: any) => { state[i] = typeof value === "function" ? value(state[i]) : value; }];
  } };
}
const props = { ledgerId: 37, categoryId: 90250, categoryName: "DO_NOT_RENDER_CATEGORY", onBack: vi.fn(), participantView: true };
const context = { ledgerId: 37 as const, categoryId: 90250, viewerUserId: 901, canManage: false, aiEnabled: false };
function tabs(ctx = context) {
  const hooks = hookState();
  const scope = { useState: hooks.useState, LegacyStockTagPortfolio: "legacy", Ledger37AiHome: "safe" };
  const component = actual(source, "R1StockPresentationTabs", scope);
  const render = () => { hooks.reset(); return component({ props, context: ctx }); };
  return { render, click: (label: string) => nodes(render()).find(n => n.props?.role === "tab" && text(n) === label).props.onClick() };
}
function wrapper(query: any, search = "", effectiveUserId = 901, authUserId = 909, storedViewAs: string | null = null) {
  const get = vi.fn(() => storedViewAs), set = vi.fn();
  const originalStorage = globalThis.sessionStorage;
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: { getItem: get, setItem: set } });
  const spy = vi.fn(() => ({ isFetchedAfterMount: true, ...query }));
  const scope: Record<string, any> = { useAuth: () => ({ user: { id: authUserId } }), useSearch: () => search, resolveR1EffectiveUserId: helpers.resolveR1EffectiveUserId,
    trpc: { ledger: { getLedger37PresentationContext: { useQuery: spy } } }, R1StockPresentationTabs: "tabs", LegacyStockTagPortfolio: "legacy", Ledger37AiStockParticipationView: "safe", isR1StockPresentationScope, ArrowLeft: "span", Loader2: "span" };
  scope.useLedger37PresentationContext = actual(homeSource, "useLedger37PresentationContext", scope);
  scope.Ledger37PresentationPending = actual(homeSource, "Ledger37PresentationPending", scope);
  const render = () => actual(source, "R1StockPresentation", scope)({ ...props, effectiveUserId });
  const finish = () => Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: originalStorage });
  return { render, spy, get, set, finish };
}
const row = (patch = {}): any => ({ id: 1, symbol: "AAPL", stockName: "苹果", currency: "USD", quantity: 6, allocatedQuantity: 10, allocationRatio: 0.1,
  startDate: "2026-11-01", status: "active", floatingPnl: -12, realizedPnl: 8, totalPnl: -4, ...patch });
const dto = (patch: Partial<R1AiParticipationPortfolio> = {}): R1AiParticipationPortfolio => ({ viewerUserId: 901, aiEnabled: true, usdCnyRate: 7, usdtCnyRate: null,
  updatedAt: "2026-11-18", summary: { floatingPnl: -84, realizedPnl: 56, totalPnl: -28 }, participations: [row()],
  recordedMargins: [{ assetCode: "USDT", amount: "100.123456789123456789" }], observation: null, ...patch });
function aiRenderer(data = dto(), rate?: number | null, updating = false) {
  const scope: Record<string, any> = { ...helpers, participationStatus: { pending: "待开始", active: "进行中", paused: "已暂停", closed: "已结束" } };
  scope.ParticipationSummary = actual(aiSource, "ParticipationSummary", scope);
  scope.ParticipationRows = actual(aiSource, "ParticipationRows", scope);
  return expand(actual(aiSource, "R1AiParticipationRenderer", scope)({ portfolio: data, displayUsdCnyRate: rate, updating }));
}
function legacy(participantView = false, presentationMode = "admin") {
  const hooks = hookState(); const calls: Record<string, any[]> = {}; const writes = vi.fn();
  const publicData: any = { positions: [{ symbol: "AAPL", stockName: "苹果", currency: "USD", marketPrice: 12, lots: [{ id: 11, quantity: 100, unitCost: 10, openedAt: "2026-11-01T02:00:00Z" }] }], summary: { usdtCnyRate: null } };
  const memberData: any = { viewerUserId: 901, positions: [{ symbol: "AAPL", lots: [{ id: 11, lotId: 11, quantity: 6, entryPrice: 10 }] }], summary: {}, history: [],
    participations: [{ id: 1, lotId: 11, symbol: "AAPL", stockName: "苹果", startDate: "2026-11-01", openedAt: "2026-11-01", allocatedQuantity: 10,
      remainingQuantity: 6, closedQuantity: 4, closedValue: 32, entryPrice: 10, closedAt: "2026-11-10", realizedPnl: 8, closedBuyValueCny: 40 * 7.2, closedSellValueCny: 32 * 7.2, realizedPnlCny: 8 * 7.2, closedFxLocked: true }],
    closedLots: [{ participationId: 1, lotId: 11, symbol: "AAPL", stockName: "苹果", soldAt: "2026-11-10", soldQuantity: 4, unitCost: 10, sellPrice: 8, buyValue: 40, sellValue: 32, realizedPnl: 8, buyValueCny: 40 * 7.2, sellValueCny: 32 * 7.2, realizedPnlCny: 8 * 7.2, fxLocked: true }] };
  const globalData = { ...publicData, canEdit: true, viewerUserId: 901, history: [], soldLots: [{ lotId: 11, sellEventId: 81, symbol: "AAPL", stockName: "苹果", soldQuantity: 4, unitCost: 10, sellPrice: 8, buyValue: 40, sellValue: 32, accountNetProfit: -8, buyValueCny: 40 * 7.2, sellValueCny: 32 * 7.2, accountNetProfitCny: -8 * 7.2, fxLocked: true }], realizedLots: [{ symbol: "AAPL", buyValue: 40, sellValue: 32, accountNetProfit: -8, buyValueCny: 40 * 7.2, sellValueCny: 32 * 7.2, accountNetProfitCny: -8 * 7.2, fxLocked: true }] };
  const matrix = { members: [{ userId: 901, name: "成员甲" }, { userId: 902, name: "成员乙" }], lots: [{ id: 11, symbol: "AAPL", participations: [
    { id: 1, userId: 901, remainingQuantity: 6, allocatedQuantity: 10, entryPrice: 10, floatingPnl: -12, realizedPnl: 8, closedQuantity: 4, realizedPnlCny: 8 * 7.2, closedFxLocked: true },
    { id: 2, userId: 902, remainingQuantity: 20, allocatedQuantity: 20, entryPrice: 10, floatingPnl: -40, realizedPnl: 0, realizedPnlCny: 0, closedFxLocked: true },
  ] }] };
  const scope: Record<string, any> = { ...instruments, instrumentCurrency: instruments.portfolioCurrency, useState: hooks.useState, useAuth: () => ({ user: { id: 901, name: "成员甲" } }),
    summarizeStockCustomerPnl, hasStockCustomerActivity, buildStockMemberRealizedLots, stockRealizedValueCny, eventLabels: {}, eventTone: {}, trpc: { useUtils: () => ({}),
      stock: { getUsdCnyRate: { useQuery: () => ({ data: { success: true, rate: 7.2 } }) } }, ledger: {}, searchManualStocks: { useQuery: () => ({ data: { results: [] } }) } } };
  const dataMap: Record<string, any> = { getStockTagPortfolio: globalData, getStockTagPublicPortfolio: publicData, getMyStockTagParticipantPortfolio: memberData, getStockTagDailySnapshots: [], getStockLotParticipationMatrix: matrix };
  for (const [name, data] of Object.entries(dataMap)) scope.trpc.ledger[name] = { useQuery: (input: any, options: any) => { (calls[name] ??= []).push({ input, options }); return { data, isLoading: false, error: null }; } };
  for (const name of ["correctStockTagEvent", "updateStockTagLotNote"]) scope.trpc.ledger[name] = { useMutation: () => ({ mutate: writes, mutateAsync: writes }) };
  for (const name of ["normalizeCurrency", "money", "signedMoney", "formatQuantity", "formatDateTime", "daysSinceBeijingDate", "formatMonthDay", "memberClosedHoldingDays", "formatQuoteUpdate", "formatCompactQuoteUpdate", "localInputTime", "buildCryptoAwareMemberRealizedLots", "memberHoldingOrbVisual"]) scope[name] = actual(source, name, scope);
  for (const name of ["ArrowLeft", "BadgeCheck", "ChevronDown", "ChevronUp", "History", "Loader2", "Plus", "X", "Button", "Avatar", "AvatarImage", "AvatarFallback", "Input", "Label", "StockNameProfitSummary", "StockCustomerProfitSummary", "StockQuoteUpdateIndicator", "CryptoAwareObservationAccountSummary", "CryptoAwareObservationPortfolio", "StockParticipantProfitChart"]) scope[name] = "span";
  scope.StockTagBuyEditDialog = (p: any) => p.order && p.canEdit ? React.createElement("div", { "data-buy-edit-lot": p.order.lotId }) : null;
  scope.StockTagBuyCancelDialog = (p: any) => p.order && p.canEdit ? React.createElement("div", { "data-buy-cancel-lot": p.order.lotId }) : null;
  for (const name of ["Dialog", "Sheet", "StockTagTradeDialog"]) scope[name] = (p: any) => p.open ? React.createElement("div", null, p.children) : null;
  for (const name of ["DialogContent", "DialogHeader", "SheetContent", "SheetHeader"]) scope[name] = "div";
  for (const name of ["DialogTitle", "SheetTitle"]) scope[name] = "h2";
  const component = actual(source, "LegacyStockTagPortfolio", scope);
  const render = () => { hooks.reset(); return expand(component({ ...props, participantView, presentationMode, effectiveUserId: 901 })); };
  const click = (label: string) => nodes(render()).find(n => n.type === "button" && (text(n) === label || n.props?.["aria-label"] === label)).props.onClick();
  return { render, click, calls, matrix, memberData, publicData, writes };
}

const memberClosedLot = (index: number): any => ({ participationId: index + 1, lotId: index + 11, symbol: 'AAPL', stockName: `苹果${index + 1}`,
  soldAt: `2026-11-${String(index + 1).padStart(2, '0')}`, soldQuantity: 4, unitCost: 10, sellPrice: 8, buyValue: 40, sellValue: 32, realizedPnl: 8 });
function memberSoldRenderer(lots: any[], summary = { count: lots.length, realizedPnl: 987.65 }, initialPage = 1) {
  let page = initialPage;
  const setPage = (value: any) => { page = typeof value === 'function' ? value(page) : value; };
  const render = () => {
    const scope: Record<string, any> = { ...instruments, instrumentCurrency: instruments.portfolioCurrency,
      participantView: true, soldLots: lots, memberClosedLotsSummary: summary, memberClosedPage: page, setMemberClosedPage: setPage, ChevronDown: 'span' };
    for (const name of ['normalizeCurrency', 'money', 'signedMoney', 'formatQuantity', 'formatDateTime', 'formatMonthDay', 'memberClosedHoldingDays']) scope[name] = actual(source, name, scope);
    return actual(source, 'renderSoldLots', scope)();
  };
  const button = (tree: any, direction: '上一页' | '下一页') => nodes(tree).find(n => n.type === 'button' && n.props?.['aria-label'] === `已结束${direction}`);
  const click = (direction: '上一页' | '下一页') => button(render(), direction).props.onClick();
  return { render, click, button, setPage };
}
const memberSoldRows = (tree: any) => nodes(tree).filter(n => n.props?.['data-member-sold'] !== undefined);
const activeCells = (tree: any) => nodes(tree).filter(n => n.props && ['data-active-date', 'data-active-stock', 'data-active-pnl', 'data-active-percent'].some(field => field in n.props)).map(text);

const memberOrbs = (tree: any) => nodes(tree).filter(n => n.props?.['data-member-holding-orb'] !== undefined);
const memberPopup = (tree: any) => nodes(tree).find(n => n.props?.['data-member-holding-popup'] !== undefined);
function orbFixture() {
  const h = legacy(true, 'user');
  h.publicData.positions[0].lots[0].unitCost = 5; // Account rises; this customer's own lot loses.
  h.publicData.positions[0].lots.push(
    { id: 12, quantity: 200, unitCost: 30, openedAt: '2026-11-02T02:00:00Z' },
    { id: 13, quantity: 999, unitCost: 1, openedAt: '2026-11-03T02:00:00Z' },
  );
  h.memberData.positions[0].lots.push({ id: 12001, lotId: 12, quantity: 2, entryPrice: 20 });
  return h;
}
function rgbChannels(color: string) {
  const hex = color.match(/^#([\da-f]{6})$/i);
  if (hex) return [0, 2, 4].map(index => parseInt(hex[1].slice(index, index + 2), 16));
  const rgb = color.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
  if (!rgb) throw new Error(`Unexpected orb color: ${color}`);
  return rgb.slice(1).map(Number);
}

describe("R1 展示升级：真实前端离线执行", () => {
  const amountValues = (tree: any) => nodes(tree).filter(n => n.props?.['data-amount-value'] !== undefined);
  const amountCurrencies = (tree: any) => nodes(tree).filter(n => n.props?.['data-amount-currency'] !== undefined);
  function currencyValueRenderer(usdCnyRate: number | null = 7.2, usdtCnyRate: number | null = 6.8) {
    const scope: Record<string, any> = { ...instruments, usdCnyRate, usdtCnyRate };
    scope.money = actual(source, 'money', scope);
    scope.signedMoney = actual(source, 'signedMoney', scope);
    return { component: actual(source, 'CnyUsdValue', scope), money: scope.money, signedMoney: scope.signedMoney };
  }
  function expectRightAmounts(tree: any, amounts: Array<[string, string]>) {
    const marks = nodes(tree).filter(n => n.props?.['data-amount-value'] !== undefined || n.props?.['data-amount-currency'] !== undefined);
    expect(marks.map(n => n.props['data-amount-currency'] === undefined ? ['value', text(n)] : [n.props['data-amount-currency'], text(n)])).toEqual(
      amounts.flatMap(([value, currency]) => [['value', value], [currency, currency === 'CNY' ? '¥' : currency === 'USD' ? '$' : 'USDT']]),
    );
    for (const unit of amountCurrencies(tree)) {
      expect(unit.type).toBe('span');
      expect(unit.props.className).toContain('text-[8px]');
      expect(unit.props.className).toContain('align-baseline');
    }
    expect(amountValues(tree).every(n => n.type === 'span')).toBe(true);
  }
  it.each(['CNY', 'USD', 'USDT'] as const)('货币右置：真实CnyUsdValue的%s上下行数字各带对应单位，原始小数不反推', nativeCurrency => {
    const h = currencyValueRenderer();
    const tree = h.component({ value: 1234.5678, usdValue: 123.456789, nativeCurrency, signed: true, smallDecimals: true, hideCurrency: true, currencyAfter: true });
    const amounts: Array<[string, string]> = [['+1,234.57', 'CNY']];
    if (nativeCurrency !== 'CNY') amounts.push(['+123.46', nativeCurrency]);
    expectRightAmounts(tree, amounts);
    expect(text(tree)).toBe(amounts.map(([value, currency]) => `${value}${currency === 'CNY' ? '¥' : currency === 'USD' ? '$' : 'USDT'}`).join(''));
    expect(nodes(amountValues(tree)[0]).some(n => n.type === 'span' && text(n) === '.57' && n.props.className?.includes('text-[9px]'))).toBe(true);
  });
  it('货币右置：正负号、有效0、未知、近似标识与缺汇率USDT原币fallback原样保留', () => {
    const h = currencyValueRenderer();
    for (const signed of [false, true]) for (const value of [-12.345, 0, 12.345]) {
      const formatted = signed ? h.signedMoney(value, 'CNY') : h.money(value, 2, 'CNY');
      expectRightAmounts(h.component({ value, signed, currencyAfter: true }), [[formatted.replace('¥', ''), 'CNY']]);
    }
    for (const value of [null, undefined, NaN, Infinity, -Infinity]) {
      const tree = h.component({ value, usdValue: value, nativeCurrency: 'USD', signed: true, smallDecimals: true, currencyAfter: true });
      expect(text(tree)).toBe('—'); expect(amountCurrencies(tree)).toHaveLength(0);
      expect(text(tree)).not.toContain('0.00');
    }
    const approximate = h.component({ value: 720, nativeCurrency: 'USD', currencyAfter: true });
    expect(text(approximate)).toContain('≈ ');
    expectRightAmounts(approximate, [['720.00', 'CNY'], [h.money(720 / 7.2, 2, 'USD').replace('US$', ''), 'USD']]);
    const noFx = currencyValueRenderer(null, null);
    const usd = noFx.component({ value: 72, nativeCurrency: 'USD', currencyAfter: true });
    expectRightAmounts(usd, [['72.00', 'CNY']]); expect(text(usd)).not.toContain('≈');
    const fallback = noFx.component({ value: null, usdValue: -12.345, nativeCurrency: 'USDT', signed: true, smallDecimals: true, currencyAfter: true });
    expectRightAmounts(fallback, [['−12.35', 'USDT']]);
    expect(text(fallback)).toBe('−12.35USDT人民币汇率暂不可用');
    expect(text(fallback)).not.toMatch(/¥|\$|0\.00/);
    const unknown = noFx.component({ value: null, nativeCurrency: 'USDT', currencyAfter: true });
    expect(text(unknown)).toBe('—'); expect(amountCurrencies(unknown)).toHaveLength(0);
  });
  it('货币右置：默认与显式关闭保持管理员prefix、旧hideCurrency和USDT缺FX fallback', () => {
    const h = currencyValueRenderer();
    for (const nativeCurrency of ['CNY', 'USD', 'USDT']) {
      const input = { value: -72, usdValue: -10, nativeCurrency, signed: true, smallDecimals: true };
      const expected = h.signedMoney(-72, 'CNY') + (nativeCurrency === 'CNY' ? '' : h.signedMoney(-10, nativeCurrency));
      for (const patch of [{}, { currencyAfter: false }]) {
        const tree = h.component({ ...input, ...patch });
        expect(text(tree)).toBe(expected); expect(amountCurrencies(tree)).toHaveLength(0);
      }
      const hidden = h.component({ ...input, hideCurrency: true });
      expect(text(hidden)).toBe(expected.replace('¥', '').replace(instruments.portfolioQuotePrefix(nativeCurrency), ''));
      expect(amountCurrencies(hidden)).toHaveLength(0);
    }
    const fallback = currencyValueRenderer(null, null).component({ value: null, usdValue: -10, nativeCurrency: 'USDT', signed: true, hideCurrency: true });
    expect(text(fallback)).toBe('−USDT 10.00人民币汇率暂不可用');
    expect(amountCurrencies(fallback)).toHaveLength(0);
  });
  it('货币右置：真实成员展开六项标题无单位，A股美股数字币各行不串币且顶部表格小球弹窗不变', () => {
    const h = legacy(true, 'user');
    const entries = [['600009.SH', '上海机场', 'CNY'], ['AAPL', '苹果', 'USD'], ['CRYPTO:UNI-USDT', 'Uniswap', 'USDT']] as const;
    h.publicData.summary.usdtCnyRate = 6.8;
    h.publicData.positions = entries.map(([symbol, stockName, currency], index) => ({ symbol, stockName, currency, marketPrice: 12,
      lots: [{ id: index + 11, quantity: 100, unitCost: 10, openedAt: '2026-11-01T02:00:00Z' }] }));
    h.memberData.positions = entries.map(([symbol], index) => ({ symbol, lots: [{ id: index + 11, lotId: index + 11, quantity: 6, entryPrice: 10 }] }));
    const tree = h.render(); const formatter = currencyValueRenderer();
    const rows = nodes(tree).filter(n => n.props?.['data-member-holding'] !== undefined);
    expect(rows).toHaveLength(3);
    rows.forEach((row, index) => {
      const currency = entries[index][2];
      const rate = instruments.portfolioCashMultiplier(currency, 7.2, 6.8)!;
      const labels = ['买入价', '当前价', '当前涨跌', '我的买入价', '持仓价值', '浮动盈亏'];
      const nativeAmounts = [10, 12, 12 - 10, 10, 12 * 6, (10 - 12) * 6];
      labels.forEach((label, metricIndex) => {
        const labelNode = nodes(row).find(n => n.props?.className?.includes('order-last') && text(n) === label);
        expect(labelNode, label).toBeTruthy(); expect(amountCurrencies(labelNode)).toHaveLength(0);
        const cell = nodes(row).find(n => n.type === 'div' && n.props.className?.includes('flex-col') && nodes(n).includes(labelNode));
        const signed = metricIndex === 2 || metricIndex === 5;
        const format = (value: number, code: string) => (signed ? formatter.signedMoney(value, code) : formatter.money(value, 2, code)).replace(instruments.portfolioQuotePrefix(code), '');
        const expected: Array<[string, string]> = [[format(nativeAmounts[metricIndex] * rate, 'CNY'), 'CNY']];
        if (currency !== 'CNY') expected.push([format(nativeAmounts[metricIndex], currency), currency]);
        expectRightAmounts(cell, expected);
      });
      expect(amountCurrencies(row)).toHaveLength(currency === 'CNY' ? 6 : 12);
      const summary = nodes(row).find(n => n.type === 'summary');
      expect(activeCells(summary)).toEqual(['11-01', index === 1 ? 'AAPL' : entries[index][1], formatter.signedMoney((10 - 12) * 6, currency), '-20.00%']);
      expect(amountCurrencies(summary)).toHaveLength(0);
    });
    const topCells = nodes(tree).filter(n => n.type === 'td');
    expect(topCells.length).toBeGreaterThan(0);
    expect(topCells.some(n => text(n).includes('¥'))).toBe(true);
    expect(topCells.flatMap(amountCurrencies)).toHaveLength(0);
    expect(memberOrbs(tree).map(n => [text(n), n.props['data-orb-state'], n.props['data-orb-intensity']])).toEqual([['01', 'loss', '0.4000'], ['02', 'loss', '0.4000'], ['03', 'loss', '0.4000']]);
    const summaries = rows.map(row => renderToStaticMarkup(nodes(row).find(n => n.type === 'summary')));
    memberOrbs(h.render())[1].props.onClick();
    const popup = memberPopup(h.render());
    for (const amount of ['US$10.00', 'US$12.00', 'US$72.00', '−US$12.00']) expect(text(popup)).toContain(amount);
    expect(amountCurrencies(popup)).toHaveLength(0);
    expect(nodes(h.render()).filter(n => n.props?.['data-member-holding'] !== undefined).map(row => renderToStaticMarkup(nodes(row).find(n => n.type === 'summary')))).toEqual(summaries);
    const admin = legacy(false, 'admin'); admin.click('展开持仓编号 01');
    expect(amountCurrencies(admin.render())).toHaveLength(0);
    expect(text(admin.render())).toContain('US$10.00');
    expect(amountCurrencies(aiRenderer())).toHaveLength(0);
  });
  it('编号下拉：真实AST使用默认收起的原生details及首个summary，ChevronDown不代替原生开关', () => {
    const file = ts.createSourceFile('portfolio.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const matches: ts.JsxElement[] = [];
    const visit = (node: ts.Node) => {
      if (ts.isJsxElement(node) && node.openingElement.tagName.getText(file) === 'details'
        && node.openingElement.attributes.properties.some(p => ts.isJsxAttribute(p) && p.name.getText(file) === 'data-member-holding-numbers')) matches.push(node);
      ts.forEachChild(node, visit);
    };
    visit(file);
    expect(matches).toHaveLength(1);
    const details = matches[0];
    expect(details.openingElement.attributes.properties.map(p => p.getText(file))).not.toEqual(expect.arrayContaining([expect.stringMatching(/^(?:open|onClick|onToggle|onKeyDown)(?:\s|=|$)/)]));
    const children = details.children.filter(n => !ts.isJsxText(n) || n.getText(file).trim());
    const summary = children[0];
    expect(ts.isJsxElement(summary)).toBe(true);
    if (!ts.isJsxElement(summary)) throw new Error('Missing native summary');
    expect(summary.openingElement.tagName.getText(file)).toBe('summary');
    expect(summary.getText(file)).toContain('当前持仓编号');
    expect(summary.getText(file)).toMatch(/<ChevronDown\b/);
    expect(summary.getText(file)).not.toMatch(/<button\b|data-member-holding-orb|onClick|onKeyDown|\.mutate/);
  });
  it('编号下拉：本人球仅在summary之外按原顺序显示，容器无事件穿透且展开不写入或泄露他人', () => {
    const h = orbFixture(); const tree = h.render();
    const dropdowns = nodes(tree).filter(n => n.props?.['data-member-holding-numbers'] !== undefined);
    expect(dropdowns).toHaveLength(1);
    const dropdown = dropdowns[0];
    expect(dropdown.type).toBe('details');
    expect(dropdown.props).not.toHaveProperty('open');
    const children = React.Children.toArray(dropdown.props.children) as any[];
    const summary = children[0];
    expect(summary.type).toBe('summary'); expect(text(summary)).toBe('当前持仓编号');
    expect(memberOrbs(summary)).toHaveLength(0);
    const orbs = memberOrbs(dropdown);
    expect(orbs.map(n => [n.type, n.props.type, text(n), n.props['data-member-holding-orb']])).toEqual([
      ['button', 'button', '01', '01'], ['button', 'button', '02', '02'],
    ]);
    expect(memberOrbs(tree)).toEqual(orbs);
    for (const ancestor of nodes(dropdown).filter(n => !orbs.includes(n))) {
      expect(ancestor.props.onClick).toBeUndefined(); expect(ancestor.props.onToggle).toBeUndefined();
    }
    for (const orb of orbs) {
      expect(orb.props['aria-haspopup']).toBe('dialog'); expect(orb.props['aria-expanded']).toBe(false);
      expect(orb.props.disabled).toBe(false); expect(orb.props.onClick).toBeTypeOf('function');
    }
    expect(renderToStaticMarkup(dropdown)).not.toMatch(/\sopen(?:=|\s|>)/);
    expect(text(dropdown)).not.toMatch(/成员乙|200 股|999 股|账户整体持仓|修改|卖出|分配/);
    expect(memberPopup(tree)).toBeUndefined(); expect(h.writes).not.toHaveBeenCalled();
    expect(h.calls.getStockLotParticipationMatrix.every(call => call.options.enabled === false)).toBe(true);
  });
  it('编号球真实helper正负同幅度红绿，固定0至50%映射、深浅单调且饱和', () => {
    const visual = actual(source, 'memberHoldingOrbVisual');
    const profit = visual(20, 100), loss = visual(-20, 100);
    expect(profit).toMatchObject({ state: 'profit', percent: 0.2 });
    expect(loss).toMatchObject({ state: 'loss', percent: -0.2 });
    expect(profit.intensity).toBeCloseTo(0.4); expect(loss.intensity).toBeCloseTo(0.4);
    const red = rgbChannels(profit.style.background), green = rgbChannels(loss.style.background);
    expect(red[0]).toBeGreaterThan(red[1]); expect(green[1]).toBeGreaterThan(green[0]);
    for (const sign of [1, -1]) {
      const shades = [0, 5, 20, 50, 100].map(pnl => visual(sign * pnl, 100));
      expect(shades.map(shade => shade.intensity)).toEqual([0, 0.1, 0.4, 1, 1]);
      expect(shades[1].style.background).not.toBe(shades[2].style.background);
      expect(shades[2].style.background).not.toBe(shades[3].style.background);
      const channels = shades.slice(1, 4).map(shade => rgbChannels(shade.style.background));
      expect(channels[1].every((channel, index) => channel < channels[0][index])).toBe(true);
      expect(channels[2].every((channel, index) => channel < channels[1][index])).toBe(true);
      expect(shades[3].style).toEqual(shades[4].style);
      for (const shade of shades) {
        expect(shade.style.background).toContain('radial-gradient');
        expect(shade.style.boxShadow).toBeTruthy();
      }
    }
    expect(visual(200, 1000).style).toEqual(profit.style);
    expect(visual(-200, 1000).style).toEqual(loss.style);
    expect(visual(0, 100)).toMatchObject({ state: 'flat', percent: 0, intensity: 0 });
  });
  it('编号球真实helper缺失非法收益或非正成本均未知灰色，不冒充有效0', () => {
    const visual = actual(source, 'memberHoldingOrbVisual');
    const unknown = visual(null, 100);
    for (const pnl of [null, undefined, NaN, Infinity, -Infinity, '非法']) {
      expect(visual(pnl, 100)).toEqual(unknown);
    }
    for (const cost of [null, undefined, 0, -100, NaN, Infinity, -Infinity, '非法']) {
      expect(visual(20, cost)).toEqual(unknown);
      expect(visual(0, cost)).toEqual(unknown);
    }
    expect(unknown).toMatchObject({ state: 'unknown', percent: null, intensity: 0 });
    expect(unknown.style).toEqual(visual(0, 100).style);
    expect(unknown.style.background).toContain('radial-gradient');
    const gray = rgbChannels(unknown.style.background);
    expect(Math.max(...gray) - Math.min(...gray)).toBeLessThan(30);
  });
  it('顶部小球只列本人有效lot，红绿读客户个人收益而非账户涨跌，深浅不随同页排名', () => {
    const h = orbFixture();
    const orbs = memberOrbs(h.render());
    expect(orbs.map(orb => [orb.type, text(orb), orb.props['data-orb-state']])).toEqual([
      ['button', '01', 'loss'], ['button', '02', 'profit'],
    ]);
    expect(orbs.map(orb => orb.props['data-member-holding-orb'])).toEqual(['01', '02']);
    expect(Number(orbs[0].props['data-orb-intensity'])).toBeCloseTo(0.4);
    expect(Number(orbs[1].props['data-orb-intensity'])).toBeCloseTo(0.8);
    const visual = actual(source, 'memberHoldingOrbVisual');
    expect(orbs[0].props.style).toEqual(visual(-12, 60).style);
    expect(orbs[1].props.style).toEqual(visual(16, 40).style);
    expect(memberPopup(h.render())).toBeUndefined();
    const totalTree = h.render();
    const totalButton = nodes(totalTree).find(n => n.type === 'button' && n.props?.['aria-label'] === '查看总计计算公式');
    expect(text(totalButton)).toBe('总计');
    const totalGrid = nodes(totalTree).find(n => n.type === 'div' && n.props?.className?.includes('grid-cols-2') && nodes(n).includes(totalButton));
    expect(text(totalGrid)).toContain('幅度'); expect(text(totalGrid)).not.toContain('盈亏幅度');
    totalButton.props.onClick();
    expect(text(h.render())).toContain('总盈亏 = 当前持有仓位的浮动盈亏 + 已平仓累计收益');
    expect(memberPopup(h.render())).toBeUndefined();
    h.publicData.positions[0].lots.push({ id: 14, quantity: 100, unitCost: 5, openedAt: '2026-11-04' });
    h.memberData.positions[0].lots.push({ id: 14001, lotId: 14, quantity: 1, entryPrice: 1000 });
    const moreOrbs = memberOrbs(h.render());
    expect(moreOrbs.slice(0, 2).map(orb => orb.props.style)).toEqual(orbs.map(orb => orb.props.style));
    expect(Number(moreOrbs[2].props['data-orb-intensity'])).toBe(1);
    expect(h.calls.getStockLotParticipationMatrix[0].options.enabled).toBe(false);
  });
  it('编号下拉：点击编号球按原lot匹配单笔本人详情，关闭或本人lot消失立即不渲染', () => {
    const h = orbFixture();
    const panel = (tree: any) => nodes(tree).find(n => n.props?.['aria-label'] === '进行中股票明细');
    const before = renderToStaticMarkup(panel(h.render()));
    memberOrbs(h.render())[1].props.onClick();
    const popup = memberPopup(h.render());
    expect(popup).toBeTruthy(); expect(popup.props['aria-label']).toBe('个人持仓简要详情');
    const title = text(nodes(popup).find(n => n.type === 'h2'));
    expect(title).toContain('02'); expect(title).toContain('AAPL'); expect(title).not.toContain('01');
    const details = text(popup);
    expect(details).toContain('苹果'); expect(details).toContain('AAPL');
    for (const label of ['买入价', '当前价', '持仓价值', '幅度']) expect(details).toContain(label);
    expect(details).toMatch(/(?:个人|浮动)盈亏/);
    expect(details).toMatch(/持仓数量|个人(?:持仓)?数量/);
    for (const amount of ['US$20.00', 'US$12.00', 'US$24.00', '+US$16.00', '+40.00%']) expect(details).toContain(amount);
    expect(details).toContain('2 股');
    expect(details).not.toMatch(/成员乙|200 股|999 股|账户整体持仓|修改|卖出|分配/);
    expect(renderToStaticMarkup(panel(h.render()))).toBe(before);
    h.click('关闭持仓简要详情'); expect(memberPopup(h.render())).toBeUndefined();
    memberOrbs(h.render())[0].props.onClick();
    expect(text(memberPopup(h.render()))).toContain('−US$12.00');
    expect(text(memberPopup(h.render()))).toContain('-20.00%');
    h.click('关闭持仓简要详情');
    memberOrbs(h.render())[1].props.onClick();
    h.memberData.positions[0].lots.splice(1);
    expect(memberPopup(h.render())).toBeUndefined();
    expect(memberOrbs(h.render()).map(text)).toEqual(['01']);
    expect(h.writes).not.toHaveBeenCalled();
  });
  it.each([null, undefined, NaN, Infinity])('小球缺失或非法行情为未知，个人持仓简要不显示有效0收益或幅度：%s', marketPrice => {
    const h = legacy(true, 'user'); h.publicData.positions[0].marketPrice = marketPrice;
    const orb = memberOrbs(h.render())[0];
    expect(orb.props['data-orb-state']).toBe('unknown'); expect(Number(orb.props['data-orb-intensity'])).toBe(0);
    orb.props.onClick();
    const popup = memberPopup(h.render()); expect(popup).toBeTruthy();
    expect(text(popup)).toContain('—'); expect(text(popup)).not.toMatch(/0\.00%|[+−]?US\$0\.00|[+−]?¥0\.00/);
  });
  it.each([0, -10, NaN, Infinity, '非法'])('小球个人成本非正或非法为未知灰，个人持仓简要幅度不补0：%s', entryPrice => {
    const h = legacy(true, 'user'); h.memberData.positions[0].lots[0].entryPrice = entryPrice;
    const orb = memberOrbs(h.render())[0];
    expect(orb.props['data-orb-state']).toBe('unknown'); expect(Number(orb.props['data-orb-intensity'])).toBe(0);
    orb.props.onClick();
    expect(text(memberPopup(h.render()))).toContain('—'); expect(text(memberPopup(h.render()))).not.toContain('0.00%');
  });
  it('编号下拉：管理员无折叠容器且原span不可点击，AI不增加原始持仓或弹框', () => {
    const tree = legacy(false, 'admin').render();
    expect(nodes(tree).filter(n => n.props?.['data-member-holding-numbers'] !== undefined)).toHaveLength(0);
    expect(memberOrbs(tree)).toHaveLength(0); expect(memberPopup(tree)).toBeUndefined();
    expect(nodes(tree).some(n => n.props?.['aria-label'] === '关闭持仓简要详情')).toBe(false);
    const heading = nodes(tree).find(n => n.type === 'div' && text(n.props?.children?.[0]) === '当前账户持仓编号');
    expect(heading).toBeTruthy();
    const orb = nodes(heading).find(n => n.type === 'span' && text(n) === '01');
    expect(orb.type).toBe('span'); expect(orb.props.onClick).toBeUndefined();
    const ai = aiRenderer();
    expect(memberOrbs(ai)).toHaveLength(0); expect(memberPopup(ai)).toBeUndefined();
    expect(aiSource).not.toMatch(/selectedMemberHoldingLotId|memberHoldingOrbVisual|data-member-holding-popup/);
  });
  it('个人持仓简要独立于下方表格和历史分页，开关编号球保留第2页及冻结摘要', () => {
    const h = legacy(true, 'user');
    h.memberData.closedLots = Array.from({ length: 13 }, (_, index) => memberClosedLot(index));
    h.click('历史记录'); h.click('已结束下一页');
    const history = (tree: any) => nodes(tree).find(n => n.props?.['aria-label'] === '已结束股票明细');
    const before = renderToStaticMarkup(history(h.render()));
    expect(memberSoldRows(h.render())).toHaveLength(3);
    memberOrbs(h.render())[0].props.onClick();
    expect(memberPopup(h.render())).toBeTruthy();
    expect(renderToStaticMarkup(history(h.render()))).toBe(before);
    h.click('关闭持仓简要详情');
    expect(renderToStaticMarkup(history(h.render()))).toBe(before);
    expect(nodes(h.render()).find(n => n.props?.['aria-label'] === '已结束下一页').props.disabled).toBe(true);
    h.click('进行中');
    expect(nodes(h.render()).filter(n => n.props?.['data-member-holding'] !== undefined)).toHaveLength(1);
    expect(memberPopup(h.render())).toBeUndefined();
  });
  it("ledger37全股票global门控：改名保留R1，非37仍直接旧组件，无context调用", () => {
    const component = actual(source, "StockTagPortfolio", { isR1StockPresentationScope, LegacyStockTagPortfolio: "legacy", R1StockPresentation: "r1" });
    for (const [ledgerId, categoryId] of [[52, 90250], [59, 222]]) expect(component({ ...props, ledgerId, categoryId }).type).toBe("legacy");
    for (const categoryId of [90249, 222]) expect(component({ ...props, categoryId }).type).toBe("r1");
    expect(component({ ...props, categoryName: "已改名" }).type).toBe("r1");
  });
  it("实际管理员不受父 participantView 限制，三连tab默认管理员", () => {
    const h = tabs({ ...context, canManage: true }); const tree = h.render();
    expect(nodes(tree).filter(n => n.props?.role === "tab").map(text)).toEqual(["用户", "管理员", "AI"]);
    expect(nodes(tree).find(n => n.type === "legacy").props).toMatchObject({ participantView: false, presentationMode: "admin", effectiveUserId: 901 });
  });
  it.each([true, false])("普通/代看canManage=false无三tab，开关=%s决定默认，忽略原admin prop", aiEnabled => {
    const tree = tabs({ ...context, aiEnabled }).render();
    expect(nodes(tree).filter(n => n.props?.role === "tab")).toHaveLength(0);
    const child = nodes(tree).find(n => n.type === (aiEnabled ? "safe" : "legacy"));
    expect(child).toBeTruthy();
    if (!aiEnabled) expect(child.props.participantView).toBe(true);
  });
  it("切tab只改展示目标，用户完整复用原成员组件，AI预览自己，不写身份", () => {
    const h = tabs({ ...context, canManage: true });
    h.click("用户"); expect(nodes(h.render()).find(n => n.type === "legacy").props).toMatchObject({ participantView: true, effectiveUserId: 901 });
    const userKey = nodes(h.render()).find(n => n.key && String(n.key).endsWith(":user"))?.key;
    h.click("AI"); expect(nodes(h.render()).find(n => n.type === "safe").props).toMatchObject({ viewerUserId: 901, adminPreview: true });
    expect(nodes(h.render()).find(n => n.type === "safe").props.categoryId).toBeUndefined();
    expect(nodes(h.render()).some(n => n.type === "legacy")).toBe(false);
    expect(userKey).toBeTruthy(); expect(nodes(h.render()).some(n => n.key === userKey)).toBe(false);
    const tabsCode = source.slice(source.indexOf("function R1StockPresentationTabs"), source.indexOf("export function LegacyStockTagPortfolio"));
    expect(tabsCode).not.toMatch(/sessionStorage|setLocation|\.mutate|setItem/);
  });
  it.each([{ isFetching: true, isFetchedAfterMount: false, data: context }, { isLoading: true }, { error: new Error("failure") }, { data: { ...context, viewerUserId: 902 } }])("首次缓存未确认/未加载/失败/身份不符不挂原始或AI子页：%j", query => {
    const h = wrapper(query); try { const tree = expand(h.render()); expect(nodes(tree).some(n => ["tabs", "legacy", "safe"].includes(n.type))).toBe(false); expect(h.spy).toHaveBeenCalledOnce(); } finally { h.finish(); }
  });
  it('已确认配置在后台刷新时不卸载页面或重置页签', () => {
    const h = wrapper({ data: context, isFetching: true, isFetchedAfterMount: true });
    try { expect(h.render().type).toBe('tabs'); expect(text(h.render())).not.toContain('正在确认'); } finally { h.finish(); }
  });
  it("URL优先session，父effective再auth，globalcontext显式target且无category，禁placeholder复用", () => {
    const h = wrapper({ data: { ...context, viewerUserId: 903 } }, "?viewAs=903", 901, 909, "902");
    try { h.render(); expect(h.spy).toHaveBeenCalledWith({ ledgerId: 37, viewAsUserId: 903 }, expect.objectContaining({ placeholderData: undefined })); expect(h.set).not.toHaveBeenCalled(); } finally { h.finish(); }
    expect(helpers.resolveR1EffectiveUserId("", "902", 901, 909)).toBe(902);
    expect(helpers.resolveR1EffectiveUserId("", null, 901, 909)).toBe(901);
    expect(helpers.resolveR1EffectiveUserId("", null, undefined, 909)).toBe(909);
  });
  it("目标切换 remount key隔离，旧response不能成为新user context", () => {
    const h = wrapper({ data: context }, "?viewAs=902"); try { expect(text(expand(h.render()))).toContain("正在确认"); } finally { h.finish(); }
    const one = wrapper({ data: context }); const two = wrapper({ data: { ...context, viewerUserId: 902 } }, "?viewAs=902");
    try { expect(one.render().key).not.toBe(two.render().key); } finally { one.finish(); two.finish(); }
  });
  it("safe API仅按当前target查询；AI没有任何rawpublic/member/global/matrix/observation hook", () => {
    const safe = vi.fn(() => ({ data: dto(), isFetching: false })), fx = vi.fn(() => ({ data: { success: true, rate: 7.2 } }));
    const scope = { isR1StockPresentationScope, trpc: { ledger: { getMyR1AiParticipationPortfolio: { useQuery: safe } }, stock: { getUsdCnyRate: { useQuery: fx } } }, R1AiParticipationRenderer: "renderer", ArrowLeft: "span", Loader2: "span" };
    const component = actual(aiSource, "R1AiParticipationView", scope);
    const output = component({ ledgerId: 37, categoryId: 90250, viewerUserId: 901, onBack: vi.fn() });
    expect(safe).toHaveBeenCalledWith({ ledgerId: 37, categoryId: 90250, viewAsUserId: 901 }, expect.objectContaining({ placeholderData: undefined }));
    expect(nodes(output).find(n => n.type === "renderer").props.displayUsdCnyRate).toBe(7.2);
    expect(aiSource).not.toMatch(/getStockTag(?:Public)?Portfolio|getMyStockTagParticipantPortfolio|getStockLotParticipationMatrix|getMyStockTagObservationPortfolio|StockTagTradeDialog|StockParticipantProfitChart|categoryName/);
  });
  it("真实AI DOM即使输入夹带敏感字段也不读取，保证金保持登记字符串，无价格/category/admin/trade泄漏", () => {
    const data = dto(); Object.assign(data, { categoryName: "SECRET_TAG", adminName: "SECRET_ADMIN", marketPrice: 987654321, costValue: 54321, history: [{ executionPrice: 888 }] });
    Object.assign(data.participations[0], { entryPrice: 7654321, marketPrice: 987654321, note: "SECRET_TRADE" });
    const html = renderToStaticMarkup(aiRenderer(data));
    expect(html).toContain("苹果"); expect(html).toContain("AAPL"); expect(html).toContain("100.123456789123456789");
    expect(html).not.toMatch(/SECRET|987654321|7654321|54321|买入价|当前价|股价|成交|管理员|做多|做空|博弈|交易者/);
    expect(html).toContain("不表示直接持有股票"); expect(html).toContain("不保证回报");
  });
  it("DTO人民币summary直接展示，记录金额未知不是0；更新中继续保留旧数", () => {
    const tree = aiRenderer(dto({ summary: { floatingPnl: 20, realizedPnl: 30, totalPnl: 50 }, recordedMargins: null }), undefined, true);
    expect(text(nodes(tree).find(n => n.props?.["aria-label"] === "参与收益汇总"))).toContain("+¥50.00");
    expect(text(nodes(tree).find(n => n.props?.["aria-label"] === "已登记保证金"))).toBe("已登记保证金—");
    expect(text(tree)).toContain("更新中，保留上次数据");
  });
  it("同一用户同一FX：真实旧inner总盈亏与AI native换汇一致，部分平仓不双算不翻转", () => {
    const h = legacy(true, "user"); const oldTree = h.render();
    expect(text(oldTree)).toContain("−¥28.80");
    const tree = aiRenderer(dto(), 7.2);
    const summary = nodes(tree).find(n => n.props?.["aria-label"] === "参与收益汇总");
    expect(text(summary)).toContain("−¥86.40"); expect(text(summary)).toContain("+¥57.60"); expect(text(summary)).toContain("−¥28.80");
    expect(helpers.r1SummaryAtDisplayFx(dto().participations, 7.2, null).totalPnl).toBeCloseTo(-28.8);
  });
  it.each([12, -12])("已分配收益正负方向原样，历史值只累计一次：%s", floatingPnl => {
    const rows = [row({ floatingPnl, realizedPnl: 8, totalPnl: floatingPnl + 8 })];
    const summary = helpers.r1SummaryAtDisplayFx(rows, 7.2, null);
    expect(summary.floatingPnl).toBeCloseTo(floatingPnl * 7.2); expect(summary.realizedPnl).toBeCloseTo(8 * 7.2); expect(summary.totalPnl).toBeCloseTo((floatingPnl + 8) * 7.2);
  });
  it("FXnull保留—，不假用0或USD代替USDT；观察折叠独立不混实际汇总", () => {
    const data = dto({ observation: { summary: { floatingPnl: 999, realizedPnl: 111, totalPnl: 1110 }, participations: [row({ id: 2 })] } });
    const tree = aiRenderer(data, null); const summary = nodes(tree).find(n => n.props?.["aria-label"] === "参与收益汇总");
    expect(text(summary)).not.toContain("¥0.00"); expect(text(summary)).toContain("—");
    expect(nodes(tree).find(n => n.type === "details").props.open).toBeUndefined(); expect(text(tree)).toContain("观察 · 不结算");
    expect(helpers.r1ParticipationToCny(2, "USDT", 7.2, null)).toBeNull();
  });
  it.each(['CNY', 'USD', 'USDT'] as const)('观察%s汇总与逐笔使用相同换汇，不把旧原币summary当人民币', currency => {
    const observations = [row({ id: 2, currency, floatingPnl: 10, realizedPnl: 2, totalPnl: 12 })];
    const data = dto({ usdtCnyRate: 6.8, observation: { summary: { floatingPnl: 999, realizedPnl: 888, totalPnl: 1887 }, participations: observations } });
    const tree = aiRenderer(data, data.usdCnyRate);
    const expected = helpers.r1SummaryAtDisplayFx(observations, data.usdCnyRate, data.usdtCnyRate);
    const observationText = text(nodes(tree).find(n => n.type === 'details'));
    expect(observationText).toContain(helpers.r1ParticipationMoney(expected.totalPnl));
    expect(observationText).not.toContain(helpers.r1ParticipationMoney(1887));
    expect(text(nodes(tree).find(n => n.props?.['aria-label'] === '参与收益汇总'))).toContain('−¥28.00');
  });
  it.each(['USD', 'USDT'] as const)('观察%s缺所需汇率时汇总与明细均未知，不冒充人民币原币收益', currency => {
    const data = dto({ usdCnyRate: null, usdtCnyRate: null, observation: { summary: { floatingPnl: 10, realizedPnl: 2, totalPnl: 12 }, participations: [row({ id: 2, currency, floatingPnl: 10, realizedPnl: 2, totalPnl: 12 })] } });
    const observationText = text(nodes(aiRenderer(data, null)).find(n => n.type === 'details'));
    expect(observationText).toContain('—'); expect(observationText).not.toContain('¥12.00'); expect(observationText).not.toContain('¥0.00');
  });
  it("管理员个人bits隐藏但全局账户金额/全部成员/本人普通member不删除", () => {
    const h = legacy(); const tree = h.render(); const output = text(tree);
    expect(output).toContain("账户总盈亏"); expect(output).toContain("+¥1,382.40");
    expect(output).not.toMatch(/我的持仓|我的当前持仓|我的已平仓|我的平仓|我的股数/);
    expect(h.calls.getMyStockTagParticipantPortfolio[0].options.enabled).toBe(false);
    h.click("展开持仓编号 01"); const expanded = text(h.render());
    expect(expanded).toContain("成员甲"); expect(expanded).toContain("成员乙"); expect(expanded).not.toContain("（我）"); expect(expanded).not.toContain("我的份额");
    h.click("用户视角"); expect(text(h.render())).toContain("成员甲"); expect(text(h.render())).toContain("成员乙");
    expect(h.matrix.members).toHaveLength(2);
    for (const name of ["getStockTagPortfolio", "getStockTagPublicPortfolio", "getMyStockTagParticipantPortfolio", "getStockTagDailySnapshots"]) {
      expect(h.calls[name][0].input).toMatchObject({ ledgerId: 37, categoryId: 90250, viewAsUserId: 901 });
      expect(h.calls[name][0].options.placeholderData).toBeUndefined();
    }
  });
  it("非R1旧混合视图的个人叠层仍保留，legacy query input无新身份字段", () => {
    const h = legacy(false, "legacy"); expect(text(h.render())).toContain("我的当前持仓"); expect(text(h.render())).toContain("我的已平仓");
    expect(h.calls.getStockTagPortfolio[0].input).toEqual({ ledgerId: 37, categoryId: 90250 });
  });
  it('用户下方明细默认进行中；切到已结束直接看到逐条摘要，点击下拉原有明细', () => {
    const h = legacy(true, 'user');
    const detailTabs = () => nodes(h.render()).find(n => n.props?.['aria-label'] === '股票明细状态');
    expect(nodes(detailTabs()).filter(n => n.props?.role === 'tab').map(n => [text(n), n.props['aria-selected']])).toEqual([['进行中', true], ['历史记录', false]]);
    expect(nodes(h.render()).filter(n => n.props?.['aria-label'] === '进行中股票明细')).toHaveLength(1);
    expect(nodes(h.render()).filter(n => n.props?.['data-member-sold'] !== undefined)).toHaveLength(0);
    h.click('历史记录');
    expect(nodes(h.render()).filter(n => n.props?.['aria-label'] === '进行中股票明细')).toHaveLength(0);
    const panel = nodes(h.render()).find(n => n.props?.['aria-label'] === '已结束股票明细');
    expect(panel.props.role).toBe('tabpanel');
    const row = nodes(h.render()).find(n => n.props?.['data-member-sold'] !== undefined);
    expect(nodes(panel).filter(n => n.props?.['data-member-sold'] !== undefined)).toHaveLength(1);
    expect(row.type).toBe('details'); expect(row.props.open).toBeUndefined();
    const summary = nodes(row).find(n => n.type === 'summary');
    expect(summary.props.className).toContain('min-h-9'); expect(summary.props.className).toContain('py-0.5');
    expect(summary.props.className).toContain('items-center');
    expect(text(summary)).toContain('苹果'); expect(text(summary)).toContain('11月10日'); expect(text(summary)).toContain('+US$8.00');
    expect(nodes(summary).filter(n => n.props && ['data-closed-date', 'data-closed-stock', 'data-closed-pnl', 'data-closed-percent'].some(field => field in n.props)).map(text)).toEqual(['11月10日', '苹果', '+US$8.00', '+20.00%']);
    expect(row.props.className).not.toMatch(/rounded|border /);
    const heading = nodes(panel).find(n => n.props?.['data-member-sold-header'] !== undefined);
    expect(text(heading)).toContain('平仓日期'); expect(text(heading)).toContain('股票'); expect(text(heading)).toContain('涨跌');
    expect(heading.props.className.match(/grid-cols-\[[^\]]+\]/)?.[0]).toBe(summary.props.className.match(/grid-cols-\[[^\]]+\]/)?.[0]);
    expect(text(summary)).not.toMatch(/买入价|平仓价|买入市值|平仓市值/);
    const quantityCell = nodes(row).find(n => n.props?.['data-closed-detail-cell'] === 'buy-quantity');
    expect((React.Children.toArray(quantityCell.props.children) as any[]).map(text)).toEqual(['4', '股数股']);
    expect(text(row)).toContain('AAPL');
    for (const label of ['买入价', '买入市值', '股数', '平仓价', '平仓市值', '收益']) expect(text(row)).toContain(label);
    expect(text(row)).not.toMatch(/修改|卖出|分配/);
    h.click('进行中');
    expect(nodes(h.render()).filter(n => n.props?.['aria-label'] === '进行中股票明细')).toHaveLength(1);
    expect(nodes(h.render()).filter(n => n.props?.['data-member-sold'] !== undefined)).toHaveLength(0);
  });
  it('成员进行中是一组紧凑表格，仅本人有效批次逐行details，整行摘要保持28px grid', () => {
    const h = legacy(true, 'user');
    h.publicData.positions[0].lots.push(
      { id: 12, quantity: 200, unitCost: 30, openedAt: '2026-11-02T02:00:00Z' },
      { id: 13, quantity: 999, unitCost: 1, openedAt: '2026-11-03T02:00:00Z' },
    );
    h.memberData.positions[0].lots.push({ id: 12, lotId: 12, quantity: 2, entryPrice: 20 });
    const tree = h.render();
    const panel = nodes(tree).find(n => n.props?.['aria-label'] === '进行中股票明细');
    const headers = nodes(panel).filter(n => n.props?.['data-member-holding-header'] !== undefined);
    expect(headers).toHaveLength(1); expect(text(headers[0])).toBe('开仓日期股票涨跌金额涨跌幅');
    const title = nodes(panel).find(n => n.props?.['data-member-holding-title'] !== undefined);
    expect(text(title.props.children[0])).toBe('进行中（2笔）');
    expect(text(title.props.children[1])).toMatch(/^[+−]¥[\d,.]+$/);
    expect(text(title)).not.toContain('浮动盈亏');
    const rows = nodes(panel).filter(n => n.props?.['data-member-holding'] !== undefined);
    expect(rows).toHaveLength(2); expect(new Set(rows.map(row => row.key)).size).toBe(2);
    const firstSummary = nodes(rows[0]).find(n => n.type === 'summary');
    expect(activeCells(firstSummary)).toEqual(['11-01', 'AAPL', '−US$12.00', '-20.00%']);
    expect(activeCells(nodes(rows[1]).find(n => n.type === 'summary'))).toEqual(['11-02', 'AAPL', '+US$16.00', '+40.00%']);
    for (const row of rows) {
      expect(row.type).toBe('details'); expect(row.props.open).toBeUndefined();
      expect(row.props.className).not.toMatch(/rounded|border /);
      expect(nodes(row).filter(n => n.type === 'summary')).toHaveLength(1);
      const summary = nodes(row).find(n => n.type === 'summary');
      for (const style of ['min-h-7', 'items-center', 'grid', 'cursor-pointer', 'list-none']) expect(summary.props.className).toContain(style);
      expect(summary.props.className.split(' min-h-7')[0]).toBe(headers[0].props.className.split(' border-t')[0]);
      expect(text(summary)).not.toMatch(/买入价|当前价|持仓数量|持仓价值|所需保证金/);
      expect(nodes(summary).some(n => n.type === 'button')).toBe(false);
      for (const label of ['买入价', '当前价', '当前涨跌', '我的买入价', '持仓数量', '持仓价值', '浮动盈亏']) expect(text(row)).toContain(label);
      expect(text(row)).toContain('我的配额'); expect(text(row)).toContain('AAPL');
      expect(text(row)).not.toMatch(/修改|卖出|分配|账户整体持仓|成员乙/);
      expect(nodes(row).some(n => n.props?.['data-buy-edit-lot'] !== undefined)).toBe(false);
    }
    expect(text(rows[0])).toContain('6 '); expect(text(tree)).toContain('所需保证金');
    expect(h.calls.getStockLotParticipationMatrix[0].options.enabled).toBe(false);
    h.click('历史记录');
    const closedSummary = nodes(memberSoldRows(h.render())[0]).find(n => n.type === 'summary');
    expect(nodes(closedSummary).filter(n => n.props?.['data-closed-cell'] !== undefined)).toHaveLength(3);
    expect(firstSummary.props.className).toContain('min-h-7');
  });
  it('成员进行中美股摘要统一用证券代码，A股与数字币保留名称，展开详情仍保留全名', () => {
    const entries = [
      ['HOOD', 'Robinhood Markets', 'HOOD'], ['COIN', 'COINBASE GLOBAL A', 'COIN'],
      ['GOOGL', 'Alphabet Class A', 'GOOGL'], ['CRCL', 'CIRCLE INTERNET GROUP A', 'CRCL'],
      ['AAOI', 'APPLIED OPTOELECTRONICS', 'AAOI'], ['MSTR', 'MicroStrategy', 'MSTR'],
      ['BRK-B', 'Berkshire Hathaway Class B', 'BRK-B'],
      ['600009.SH', '上海机场', '上海机场'], ['CRYPTO:UNI-USDT', 'Uniswap', 'Uniswap'],
    ];
    const h = legacy(true, 'user');
    h.publicData.positions = entries.map(([symbol, stockName], index) => ({ symbol, stockName,
      currency: instruments.portfolioCurrency(symbol), marketPrice: 12,
      lots: [{ id: index + 30, quantity: 100, unitCost: 10, openedAt: '2026-11-01T02:00:00Z' }] }));
    h.memberData.positions = entries.map(([symbol], index) => ({ symbol,
      lots: [{ id: index + 30, lotId: index + 30, quantity: 6, entryPrice: 10 }] }));
    const rows = nodes(h.render()).filter(n => n.props?.['data-member-holding'] !== undefined);
    expect(rows).toHaveLength(entries.length);
    rows.forEach((row, index) => {
      const summary = nodes(row).find(n => n.type === 'summary');
      const stock = nodes(summary).find(n => n.props?.['data-active-stock'] !== undefined);
      expect(text(stock)).toBe(entries[index][2]);
      expect(stock.props.title).toContain(entries[index][1]);
      expect(text(row)).toContain(entries[index][1]);
      expect(row.props.open).toBeUndefined();
    });
  });
  it.each([
    { marketPrice: 8, pnl: '+US$12.00', percent: '+20.00%' },
    { marketPrice: 12, pnl: '−US$12.00', percent: '-20.00%' },
    { marketPrice: 10, pnl: 'US$0.00', percent: '0.00%' },
  ])('成员进行中个人原币收益不反号、不用标签总盘或人民币换汇：$marketPrice', ({ marketPrice, pnl, percent }) => {
    const h = legacy(true, 'user');
    h.publicData.positions[0].marketPrice = marketPrice;
    h.publicData.positions[0].lots[0].unitCost = 5;
    const row = nodes(h.render()).find(n => n.props?.['data-member-holding'] !== undefined);
    const summary = nodes(row).find(n => n.type === 'summary');
    expect(activeCells(summary)).toEqual(['11-01', 'AAPL', pnl, percent]);
    expect(text(summary)).not.toContain('¥');
  });
  it.each([null, undefined, NaN, Infinity])('成员进行中缺失或非法行情时个人金额及幅度未知，不补0：%s', marketPrice => {
    const h = legacy(true, 'user'); h.publicData.positions[0].marketPrice = marketPrice;
    const summary = nodes(h.render()).find(n => n.type === 'summary' && n.props?.['aria-label'] === '苹果 进行中详情');
    expect(activeCells(summary)).toEqual(['11-01', 'AAPL', '—', '—']);
  });
  it.each([0, -10, NaN, Infinity, '非法'])('成员进行中个人成本非正或非法时百分比为—，不用标签成本兜底：%s', entryPrice => {
    const h = legacy(true, 'user'); h.memberData.positions[0].lots[0].entryPrice = entryPrice;
    const summary = nodes(h.render()).find(n => n.type === 'summary' && n.props?.['aria-label'] === '苹果 进行中详情');
    expect(text(nodes(summary).find(n => n.props?.['data-active-percent'] !== undefined))).toBe('—');
    if (typeof entryPrice !== 'number' || !Number.isFinite(entryPrice)) expect(text(nodes(summary).find(n => n.props?.['data-active-pnl'] !== undefined))).toBe('—');
  });
  it('用户已结束涨跌幅只读冻结个人收益；成本缺失、非正或非法均不补零', () => {
    const lots: any[] = [];
    const scope: Record<string, any> = { ...instruments, instrumentCurrency: instruments.portfolioCurrency,
      participantView: true, soldLots: lots, memberClosedLotsSummary: undefined, memberClosedPage: 1, setMemberClosedPage: vi.fn(), ChevronDown: 'span' };
    for (const name of ['normalizeCurrency', 'money', 'signedMoney', 'formatQuantity', 'formatDateTime', 'formatMonthDay', 'memberClosedHoldingDays']) scope[name] = actual(source, name, scope);
    const render = actual(source, 'renderSoldLots', scope);
    const lot = { symbol: 'AAPL', stockName: '苹果', soldAt: '2026-11-10', soldQuantity: 4, unitCost: 10, sellPrice: 8, buyValue: 40, sellValue: 32, realizedPnl: 8 };
    for (const buyValue of [null, undefined, 0, -40, NaN, Infinity, '非法']) {
      lots.splice(0, lots.length, { ...lot, buyValue });
      const tree = render();
      expect(text(nodes(tree).find(n => n.props?.['data-closed-percent'] !== undefined))).toBe('—');
      expect(text(nodes(tree).find(n => n.props?.['data-closed-pnl'] !== undefined))).toBe('+US$8.00');
    }
    for (const realizedPnl of [null, undefined, NaN, Infinity, '非法']) {
      lots.splice(0, lots.length, { ...lot, realizedPnl });
      expect(text(nodes(render()).find(n => n.props?.['data-closed-percent'] !== undefined))).toBe('—');
    }
    lots.splice(0, lots.length, { ...lot, realizedPnl: 0 });
    expect(text(nodes(render()).find(n => n.props?.['data-closed-percent'] !== undefined))).toBe('0.00%');
  });
  it('成员已结束13笔按10+3本地翻页，边界禁用且所有页保留全量笔数及累计收益', () => {
    const lots = Array.from({ length: 13 }, (_, index) => memberClosedLot(index));
    const h = memberSoldRenderer(lots);
    const assertSummary = (tree: any) => {
      expect(text(tree)).toContain('13 笔');
      const title = nodes(tree).find(n => n.props?.['data-member-sold-title'] !== undefined);
      expect(title.props.children.map(text)).toEqual(['已结束（13笔）', '+¥987.65']);
      expect(text(title)).not.toContain('累计平仓收益');
      expect(text(tree)).toContain('+¥987.65');
      expect(nodes(tree).find(n => n.type === 'nav' && n.props?.['aria-label'] === '已结束分页')).toBeTruthy();
    };
    const first = h.render(); assertSummary(first);
    expect(memberSoldRows(first)).toHaveLength(10);
    expect(memberSoldRows(first).map(row => text(nodes(row).find(n => n.props?.['data-closed-stock'] !== undefined)))).toEqual(lots.slice(0, 10).map(lot => lot.stockName));
    expect(h.button(first, '上一页').props.disabled).toBe(true);
    expect(h.button(first, '下一页').props.disabled).toBeFalsy();
    h.click('下一页');
    const last = h.render(); assertSummary(last);
    expect(memberSoldRows(last)).toHaveLength(3);
    expect(memberSoldRows(last).map(row => text(nodes(row).find(n => n.props?.['data-closed-stock'] !== undefined)))).toEqual(lots.slice(10).map(lot => lot.stockName));
    expect(h.button(last, '上一页').props.disabled).toBeFalsy();
    expect(h.button(last, '下一页').props.disabled).toBe(true);
    h.click('上一页'); expect(memberSoldRows(h.render())).toHaveLength(10);
    expect(lots).toHaveLength(13);
  });
  it('成员已结束页码clamp：越界回合法页，后台数据缩小不出现空页', () => {
    const lots = Array.from({ length: 13 }, (_, index) => memberClosedLot(index));
    const h = memberSoldRenderer(lots, undefined, 99);
    expect(memberSoldRows(h.render())).toHaveLength(3);
    expect(h.button(h.render(), '下一页').props.disabled).toBe(true);
    h.setPage(0);
    expect(memberSoldRows(h.render())).toHaveLength(10);
    expect(h.button(h.render(), '上一页').props.disabled).toBe(true);
    h.setPage(2); lots.splice(3);
    const shrunk = h.render();
    expect(memberSoldRows(shrunk)).toHaveLength(3);
    expect(memberSoldRows(shrunk).map(row => text(nodes(row).find(n => n.props?.['data-closed-stock'] !== undefined)))).toEqual(lots.map(lot => lot.stockName));
    const nav = nodes(shrunk).find(n => n.type === 'nav' && n.props?.['aria-label'] === '已结束分页');
    if (nav) {
      expect(h.button(shrunk, '上一页').props.disabled).toBe(true);
      expect(h.button(shrunk, '下一页').props.disabled).toBe(true);
    }
  });
  it.each([
    ['同日', '2026-11-10', '2026-11-10', 1],
    ['隔日', '2026-11-10', '2026-11-11', 2],
    ['跨月', '2026-10-31', '2026-11-01', 2],
    ['跨年', '2025-12-31', '2026-01-01', 2],
    ['闰日', '2024-02-28', '2024-03-01', 3],
    ['北京跨0点', '2026-11-10T15:59:59Z', '2026-11-10T16:00:00Z', 2],
    ['北京时间同日', '2026-11-09T16:00:00Z', '2026-11-10T15:59:59Z', 1],
  ])('历史双行持有天数：%s按北京自然日买卖首尾均含且不依赖今天', (_label, start, sold, days) => {
    const holdingDays = actual(source, 'memberClosedHoldingDays');
    expect(holdingDays(start, sold)).toBe(days);
    const spy = vi.spyOn(Date, 'now').mockReturnValue(0);
    try { expect(holdingDays(start, sold)).toBe(days); } finally { spy.mockRestore(); }
  });
  it.each([
    [undefined, '2026-11-10'], [null, '2026-11-10'], ['', '2026-11-10'], ['非法', '2026-11-10'],
    ['2026-02-29', '2026-03-01'], ['2026-11-31', '2026-12-01'], ['2026-13-01', '2026-12-01'],
    ['2026-11-10', undefined], ['2026-11-10', null], ['2026-11-10', '非法'],
    ['2026-11-11', '2026-11-10'], ['2026-11-10T16:00:00Z', '2026-11-10T15:59:59Z'],
  ])('历史双行持有天数：未知非法或反向不补0（%s → %s）', (start, sold) => {
    expect(actual(source, 'memberClosedHoldingDays')(start, sold)).toBeNull();
  });
  it('历史双行真实renderSoldLots每行三列各两行，长名称不拆卡且证券代码原币金额和固定幅度沿用source', () => {
    const entries = [
      { symbol: 'AAPL', stockName: '特别长的苹果公司历史股票名称不拆成单独卡片', realizedPnl: 8, buyValue: 40 },
      { symbol: '600009.SH', stockName: '上海机场', realizedPnl: -6, buyValue: 40 },
      { symbol: 'CRYPTO:UNI-USDT', stockName: 'Uniswap', realizedPnl: 0, buyValue: 40 },
    ];
    const lots = entries.map((entry, index) => ({ ...memberClosedLot(index), ...entry, startDate: '2026-11-01', soldAt: '2026-11-10',
      realizedPnlCny: 99999, fxLocked: true }));
    const tree = memberSoldRenderer(lots).render();
    const rows = memberSoldRows(tree); expect(rows).toHaveLength(3);
    const scope = { ...instruments, instrumentCurrency: instruments.portfolioCurrency } as Record<string, any>;
    for (const name of ['normalizeCurrency', 'money', 'signedMoney']) scope[name] = actual(source, name, scope);
    rows.forEach((row, index) => {
      expect(row.type).toBe('details'); expect(row.props.open).toBeUndefined();
      expect(row.props.className).not.toMatch(/rounded|mb-|space-y|border /);
      const summary = nodes(row).find(n => n.type === 'summary');
      for (const style of ['grid', 'min-h-9', 'py-0.5', 'list-none', 'cursor-pointer', 'grid-cols-[64px_minmax(0,1fr)_110px]']) expect(summary.props.className).toContain(style);
      const cells = React.Children.toArray(summary.props.children) as any[];
      expect(cells).toHaveLength(3);
      expect(cells.map(cell => cell.props['data-closed-cell'])).toEqual(['date', 'stock', 'pnl']);
      const fields = [['data-closed-date', 'data-closed-days'], ['data-closed-stock', 'data-closed-code'], ['data-closed-pnl', 'data-closed-percent']];
      const values = [['11月10日', '10天'], [lots[index].stockName, instruments.portfolioDisplaySymbol(lots[index].symbol)],
        [scope.signedMoney(lots[index].realizedPnl, instruments.portfolioCurrency(lots[index].symbol)), index === 0 ? '+20.00%' : index === 1 ? '-15.00%' : '0.00%']];
      cells.forEach((cell, cellIndex) => {
        const lines = nodes(cell).filter(n => fields[cellIndex].some(field => field in (n.props ?? {})));
        expect(lines).toHaveLength(2); expect(lines.map(text)).toEqual(values[cellIndex]);
        expect(nodes(cell).some(n => n.props?.className?.includes('flex-col') && n.props.className.includes('leading-4') && lines.every(line => nodes(n).includes(line)))).toBe(true);
      });
      expect(nodes(cells[1]).find(n => 'data-closed-stock' in (n.props ?? {})).props.className).toContain('truncate');
      expect(nodes(summary).some(n => n.type === 'button')).toBe(false);
      expect(nodes(cells[2]).some(n => n.props?.className?.includes('group-open/member-sold:rotate-180'))).toBe(true);
      expect(text(cells[2])).not.toContain('99999');
    });
    expect(nodes(tree).some(n => n.props?.className?.includes('divide-y') && rows.every(row => nodes(n).includes(row)))).toBe(true);
  });
  it('历史双行成员起始优先startDate缺失回退本人openedAt，未知与反向显示—不补0天', () => {
    const lots = [
      { ...memberClosedLot(0), startDate: '2026-11-09', openedAt: '2026-01-01', soldAt: '2026-11-10' },
      { ...memberClosedLot(1), openedAt: '2026-11-10T15:59:59Z', soldAt: '2026-11-10T16:00:00Z' },
      { ...memberClosedLot(2), soldAt: '2026-11-10' },
      { ...memberClosedLot(3), startDate: '2026-11-11', soldAt: '2026-11-10' },
      { ...memberClosedLot(4), startDate: '非法', openedAt: '2026-11-01', soldAt: '2026-11-10' },
    ];
    const rows = memberSoldRows(memberSoldRenderer(lots).render());
    expect(rows.map(row => text(nodes(row).find(n => 'data-closed-days' in (n.props ?? {}))))).toEqual(['2天', '2天', '—', '—', '—']);
    expect(rows.map(row => text(nodes(row).find(n => n.type === 'summary'))).join('')).not.toContain('0天');
  });
  it('历史双行管理员分支不增加三列标记，原维护入口和进行中28px布局不变', () => {
    const admin = legacy(false, 'admin').render();
    expect(nodes(admin).some(n => ['data-closed-cell', 'data-closed-days', 'data-closed-code'].some(field => field in (n.props ?? {})))).toBe(false);
    expect(text(admin)).toContain('已卖出'); expect(text(admin)).toContain('账户净盈亏');
    const active = legacy(true, 'user').render();
    const summary = nodes(active).find(n => n.type === 'summary' && n.props?.['aria-label'] === '苹果 进行中详情');
    expect(summary.props.className).toContain('min-h-7');
    expect(activeCells(summary)).toEqual(['11-01', 'AAPL', '−US$12.00', '-20.00%']);
  });
  it('历史双行成员已结束10+3翻页行key隔离，每页details均默认收起，不复用上一页展开节点', () => {
    // Even repeated partial closures of the same participation must remount across pages.
    const lots = Array.from({ length: 13 }, (_, index) => ({ ...memberClosedLot(index), participationId: 1, lotId: 11, soldAt: '2026-11-10' }));
    const h = memberSoldRenderer(lots);
    const firstRows = memberSoldRows(h.render());
    expect(new Set(firstRows.map(row => row.key)).size).toBe(10);
    h.click('下一页');
    const secondRows = memberSoldRows(h.render());
    expect(secondRows.every(row => row.key && !firstRows.some(first => first.key === row.key))).toBe(true);
    for (const row of [...firstRows, ...secondRows]) {
      expect(row.type).toBe('details'); expect(row.props.open).toBeUndefined();
      expect(nodes(row).filter(n => n.type === 'summary')).toHaveLength(1);
    }
  });
  it('历史六格实际AST：单一3列2行、上下同列配对，数字在标题上方且详情头部不重复日期或股数', () => {
    const lot = { ...memberClosedLot(0), startDate: '2026-11-01', soldAt: '2026-11-10' };
    const row = memberSoldRows(memberSoldRenderer([lot]).render())[0];
    const summary = nodes(row).find(n => n.type === 'summary');
    expect(row.type).toBe('details'); expect(row.props.open).toBeUndefined();
    expect(summary.props.className).toContain('cursor-pointer');
    expect(nodes(summary).some(n => n.type === 'button')).toBe(false);
    expect(nodes(summary).filter(n => n.props?.['data-closed-cell'] !== undefined).map(text)).toEqual(['11月10日10天', '苹果1AAPL', '+US$8.00+20.00%']);
    expect(summary.props.className).toContain('grid-cols-[64px_minmax(0,1fr)_110px]');
    const grids = nodes(row).filter(n => n.props?.['data-closed-detail-grid'] !== undefined);
    expect(grids).toHaveLength(1);
    const grid = grids[0];
    expect(grid.props.className.split(/\s+/)).toContain('grid');
    expect(grid.props.className.split(/\s+/)).toContain('grid-cols-3');
    expect(grid.props.className).not.toMatch(/(?:sm:|md:|lg:)?grid-cols-2/);
    const cells = React.Children.toArray(grid.props.children) as any[];
    expect(cells).toHaveLength(6);
    expect(cells.map(cell => cell.props['data-closed-detail-cell'])).toEqual(['buy-price', 'buy-value', 'buy-quantity', 'sell-price', 'sell-value', 'realized-pnl']);
    expect([0, 1, 2].map(i => [cells[i].props['data-closed-detail-cell'], cells[i + 3].props['data-closed-detail-cell']])).toEqual([
      ['buy-price', 'sell-price'], ['buy-value', 'sell-value'], ['buy-quantity', 'realized-pnl'],
    ]);
    const labels = ['买入价', '买入市值', '股数', '平仓价', '平仓市值', '收益'];
    const values = ['10.00', '40.00', '4', '8.00', '32.00', '+8.00'];
    cells.forEach((cell, i) => {
      const lines = React.Children.toArray(cell.props.children) as any[];
      expect(lines).toHaveLength(2);
      expect(text(lines[0])).toBe(values[i]);
      expect(text(lines[1])).toContain(labels[i]);
      expect(text(lines[1])).toBe(labels[i] + (i === 2 ? '股' : 'US$') + (i === 0 ? '11月1日' : i === 3 ? '11月10日' : ''));
      // Row-major placement must not be overridden by CSS ordering or spans.
      expect(cell.props.className ?? '').not.toMatch(/(?:^|\s)(?:(?:col|row)-(?:span|start|end)-|order-)/);
      expect(cell.props.style?.order).toBeUndefined();
      expect(cell.props.style?.gridColumn).toBeUndefined();
      expect(cell.props.style?.gridRow).toBeUndefined();
    });
    const detail = (React.Children.toArray(row.props.children) as any[]).find(child => child.type !== 'summary');
    const outsideGrid = nodes(detail).filter(n => n !== grid && !nodes(grid).includes(n));
    const header = outsideGrid.find(n => n.type === 'div' && !nodes(n).includes(grid));
    expect(text(header)).toContain('苹果1'); expect(text(header)).toContain('AAPL');
    expect(text(header)).not.toMatch(/平仓于|2026-11-10|11月10日|4\s*股/);
    expect(text(detail)).not.toMatch(/平仓于|2026-11-10/);
    expect(nodes(detail).filter(n => n.props?.['data-closed-detail-date'] !== undefined).map(n => [n.props['data-closed-detail-date'], text(n)])).toEqual([['buy-price', '11月1日'], ['sell-price', '11月10日']]);
    expect(nodes(detail).filter(n => n.props?.['data-closed-detail-cell'] === 'buy-quantity')).toHaveLength(1);
    expect(text(detail)).not.toContain('4 股');
  });
  it('历史六格日期实际AST：日期仅在买入价和平仓价旁，优先本人买入日，回退北京日期且未知为—', () => {
    const cases = [
      { fields: { startDate: '2026-11-02', openedAt: '2026-10-01T00:00:00Z', soldAt: '2026-11-10' }, expected: ['11月2日', '11月10日'] },
      { fields: { startDate: null, openedAt: '2026-10-31T17:00:00Z', soldAt: '2026-11-09T16:00:00Z' }, expected: ['11月1日', '11月10日'] },
      { fields: { startDate: null, openedAt: null, soldAt: null }, expected: ['—', '—'] },
      { fields: { startDate: '2026-02-30', openedAt: '2026-10-01', soldAt: '非法' }, expected: ['—', '—'] },
    ];
    for (const { fields, expected } of cases) {
      const row = memberSoldRows(memberSoldRenderer([{ ...memberClosedLot(0), ...fields }]).render())[0];
      const dates = nodes(row).filter(n => n.props?.['data-closed-detail-date'] !== undefined);
      expect(dates.map(n => n.props['data-closed-detail-date'])).toEqual(['buy-price', 'sell-price']);
      expect(dates.map(text)).toEqual(expected);
      for (const date of dates) expect(date.props.className).toContain('text-[8px]');
      expect(nodes(row).filter(n => n.props?.['data-closed-detail-cell'] !== undefined)).toHaveLength(6);
      const detail = (React.Children.toArray(row.props.children) as any[]).find(child => child.type !== 'summary');
      expect(text(detail)).not.toMatch(/平仓于|\d{4}-\d{2}-\d{2}/);
    }
  });
  it('历史六格实际AST：部分卖出买入股数只读本笔soldQuantity，与已平份额成本一致，USD和USDT冻结原币不串', () => {
    const lots = [
      { ...memberClosedLot(0), initialQuantity: 100, remainingQuantity: 96, buyValueCny: 9999, sellValueCny: 8888, realizedPnlCny: -7777, fxLocked: true },
      { ...memberClosedLot(1), symbol: 'CRYPTO:UNI-USDT', stockName: 'Uniswap', initialQuantity: 50, remainingQuantity: 49.875,
        soldQuantity: 0.125, unitCost: 12.5, buyValue: 1.5625, sellPrice: 7.5, sellValue: 0.9375, realizedPnl: 0.4,
        buyValueCny: 9999, sellValueCny: 8888, realizedPnlCny: -7777, fxLocked: true },
    ];
    const formatScope: Record<string, any> = { ...instruments };
    for (const name of ['money', 'signedMoney', 'formatQuantity']) formatScope[name] = actual(source, name, formatScope);
    const assertLots = () => memberSoldRows(memberSoldRenderer(lots).render()).forEach((row, i) => {
      const lot = lots[i]; const currency = instruments.portfolioCurrency(lot.symbol); const unit = instruments.portfolioQuotePrefix(currency);
      const cells = nodes(row).filter(n => n.props?.['data-closed-detail-cell'] !== undefined);
      expect(cells).toHaveLength(6);
      const values = cells.map(cell => text((React.Children.toArray(cell.props.children) as any[])[0]));
      expect(values).toEqual([
        formatScope.money(lot.unitCost, 2, currency).replace(unit, ''), formatScope.money(lot.buyValue, 2, currency).replace(unit, ''),
        formatScope.formatQuantity(lot.soldQuantity),
        formatScope.money(lot.sellPrice, 2, currency).replace(unit, ''), formatScope.money(lot.sellValue, 2, currency).replace(unit, ''),
        formatScope.signedMoney(lot.realizedPnl, currency).replace(unit, ''),
      ]);
      expect(text((React.Children.toArray(cells[2].props.children) as any[])[1])).toBe(`股数${instruments.portfolioQuantityUnit(lot.symbol)}`);
      expect(lot.initialQuantity).toBeGreaterThan(lot.soldQuantity);
      expect(lot.buyValue).toBeCloseTo(lot.unitCost * lot.soldQuantity);
      expect(lot.sellValue).toBeCloseTo(lot.sellPrice * lot.soldQuantity);
      expect(text(nodes(row).find(n => n.props?.['data-closed-pnl'] !== undefined))).toBe(formatScope.signedMoney(lot.realizedPnl, currency));
      expect(text(row)).not.toMatch(/9999|8888|7777|¥/);
      expect(text(row)).not.toContain(currency === 'USD' ? 'USDT' : 'US$');
      expect(text(cells[5])).not.toContain(formatScope.signedMoney(lot.sellValue - lot.buyValue, currency).replace(unit, ''));
    });
    assertLots();
    lots.forEach(lot => { lot.buyValueCny = 123456; lot.sellValueCny = 654321; lot.realizedPnlCny = 987654; });
    assertLots(); // Changing locked CNY records cannot alter historical original-currency cells.
  });
  it('历史六格实际AST：未知金额仍为—不新增补0，保留既有历史fallback边界', () => {
    for (const sellPrice of [null, undefined, NaN, Infinity, -Infinity, '非法']) {
      const row = memberSoldRows(memberSoldRenderer([{ ...memberClosedLot(0), sellPrice }]).render())[0];
      const cell = nodes(row).find(n => n.props?.['data-closed-detail-cell'] === 'sell-price');
      expect(cell).toBeTruthy();
      const value = text((React.Children.toArray(cell.props.children) as any[])[0]);
      expect(value).toBe('—'); expect(value).not.toContain('0.00');
    }
    // null/undefined/NaN historical cost and PNL ||0 fallbacks are pre-existing and not changed by this layout task.
    for (const invalid of ['非法', Infinity, -Infinity]) {
      const row = memberSoldRows(memberSoldRenderer([{ ...memberClosedLot(0), unitCost: invalid, buyValue: invalid, sellValue: invalid, realizedPnl: invalid }]).render())[0];
      for (const id of ['buy-price', 'buy-value', 'sell-value', 'realized-pnl']) {
        const cell = nodes(row).find(n => n.props?.['data-closed-detail-cell'] === id);
        expect(cell, id).toBeTruthy();
        expect(text((React.Children.toArray(cell.props.children) as any[])[0])).toBe('—');
      }
      expect(text(nodes(row).find(n => n.props?.['data-closed-percent'] !== undefined))).toBe('—');
    }
  });
  it('历史六格实际AST：13笔仍10+3分页，摘要冻结且管理员和进行中不新增详情标记', () => {
    const h = memberSoldRenderer(Array.from({ length: 13 }, (_, index) => ({ ...memberClosedLot(index), startDate: '2026-11-01' })));
    const first = h.render(); expect(memberSoldRows(first)).toHaveLength(10);
    expect(nodes(first).filter(n => n.props?.['data-closed-detail-grid'] !== undefined)).toHaveLength(10);
    const title = renderToStaticMarkup(nodes(first).find(n => n.props?.['data-member-sold-title'] !== undefined));
    const firstKeys = memberSoldRows(first).map(row => row.key);
    h.click('下一页'); const second = h.render();
    expect(memberSoldRows(second)).toHaveLength(3);
    expect(nodes(second).filter(n => n.props?.['data-closed-detail-grid'] !== undefined)).toHaveLength(3);
    expect(renderToStaticMarkup(nodes(second).find(n => n.props?.['data-member-sold-title'] !== undefined))).toBe(title);
    expect(h.button(second, '下一页').props.disabled).toBe(true);
    for (const row of memberSoldRows(second)) {
      expect(firstKeys).not.toContain(row.key); expect(row.type).toBe('details'); expect(row.props.open).toBeUndefined();
      const summary = nodes(row).find(n => n.type === 'summary');
      expect(nodes(summary).filter(n => n.props?.['data-closed-cell'] !== undefined).map(n => n.props['data-closed-cell'])).toEqual(['date', 'stock', 'pnl']);
      expect(nodes(summary).filter(n => n.props?.['data-closed-detail-cell'] !== undefined)).toHaveLength(0);
    }
    for (const tree of [legacy(false, 'admin').render(), legacy(true, 'user').render()]) {
      expect(nodes(tree).some(n => 'data-closed-detail-grid' in (n.props ?? {}) || 'data-closed-detail-cell' in (n.props ?? {}))).toBe(false);
    }
    const active = legacy(true, 'user').render();
    const summary = nodes(active).find(n => n.type === 'summary' && n.props?.['aria-label'] === '苹果 进行中详情');
    expect(summary.props.className).toContain('min-h-7');
    expect(activeCells(summary)).toEqual(['11-01', 'AAPL', '−US$12.00', '-20.00%']);
    expect(text(legacy(false, 'admin').render())).toContain('账户净盈亏');
  });
  it('成员真实旧组件切回已结束重置第一页，顶部全量统计不随翻页缩成3笔', () => {
    const h = legacy(true, 'user');
    h.memberData.closedLots = Array.from({ length: 13 }, (_, index) => {
      const lot = memberClosedLot(index);
      return { ...lot, buyValueCny: lot.buyValue * 7.2, sellValueCny: lot.sellValue * 7.2, realizedPnlCny: lot.realizedPnl * 7.2, fxLocked: true };
    });
    h.memberData.participations = h.memberData.closedLots.map((lot: any) => ({ id: lot.participationId, lotId: lot.lotId,
      symbol: lot.symbol, stockName: lot.stockName, startDate: '2026-11-01', openedAt: '2026-11-01', allocatedQuantity: 4,
      remainingQuantity: 0, closedQuantity: lot.soldQuantity, closedValue: lot.sellValue, entryPrice: lot.unitCost, closedAt: lot.soldAt, realizedPnl: lot.realizedPnl,
      closedBuyValueCny: lot.buyValueCny, closedSellValueCny: lot.sellValueCny, realizedPnlCny: lot.realizedPnlCny, closedFxLocked: true }));
    h.click('历史记录');
    const first = h.render(); expect(memberSoldRows(first)).toHaveLength(10);
    const firstNames = memberSoldRows(first).map(row => text(nodes(row).find(n => n.props?.['data-closed-stock'] !== undefined)));
    h.click('已结束下一页');
    const last = h.render(); expect(memberSoldRows(last)).toHaveLength(3); expect(text(last)).toContain('13 笔');
    const scope: Record<string, any> = { ...instruments, instrumentCurrency: instruments.portfolioCurrency };
    for (const name of ['normalizeCurrency', 'money']) scope[name] = actual(source, name, scope);
    const expected = actual(source, 'signedMoney', scope)(13 * 8 * 7.2, 'CNY');
    expect(text(first)).toContain(expected); expect(text(last)).toContain(expected);
    h.click('进行中'); expect(memberSoldRows(h.render())).toHaveLength(0);
    h.click('历史记录');
    const reset = h.render(); expect(memberSoldRows(reset)).toHaveLength(10);
    expect(memberSoldRows(reset).map(row => text(nodes(row).find(n => n.props?.['data-closed-stock'] !== undefined)))).toEqual(firstNames);
    expect(nodes(reset).find(n => n.props?.['aria-label'] === '已结束上一页').props.disabled).toBe(true);
  });
  it('管理员已卖出维护界面保持原样，不挂用户单行折叠记录', () => {
    const tree = legacy(false, 'admin').render();
    expect(text(tree)).toContain('已卖出'); expect(text(tree)).toContain('账户净盈亏');
    expect(nodes(tree).filter(n => n.props?.['data-member-sold'] !== undefined)).toHaveLength(0);
    expect(nodes(tree).filter(n => n.props?.['aria-label'] === '股票明细状态')).toHaveLength(0);
  });
});

// 历史锁汇回归：真实页面与真实三标签组件，只有 hooks / tRPC 返回值惰性替换。
import * as frozenRealizedHelpers from '../shared/stock-realized-portfolio';
const frozenChartSource = readFileSync(new URL('../client/src/components/StockParticipantProfitChart.tsx', import.meta.url), 'utf8');
function frozenFxPageFixture() {
  const history = [
    { id: 1, lotId: 11, symbol: 'AAPL', stockName: '苹果', currency: 'USD', allocatedQuantity: 10, remainingQuantity: 6,
      closedQuantity: 4, closedValue: 32, entryPrice: 10, realizedPnl: 8, closedBuyValueCny: 250, closedSellValueCny: 200, realizedPnlCny: 50, closedFxLocked: true },
    { id: 2, lotId: 12, symbol: 'MSFT', stockName: '微软', currency: 'USD', allocatedQuantity: 2, remainingQuantity: 0,
      closedQuantity: 2, closedValue: 50, entryPrice: 20, realizedPnl: -10, closedBuyValueCny: 260, closedSellValueCny: 325, realizedPnlCny: -65, closedFxLocked: true },
    { id: 3, lotId: 13, symbol: 'CRYPTO:UNI-USDT', stockName: 'Uniswap', currency: 'USDT', allocatedQuantity: 3, remainingQuantity: 0,
      closedQuantity: 3, closedValue: 24, entryPrice: 10, realizedPnl: 6, closedBuyValueCny: 180, closedSellValueCny: 144, realizedPnlCny: 36, closedFxLocked: true },
    // CNY 的原值天然固定；刻意不提供任何锁字段。
    { id: 4, lotId: 14, symbol: '600009.SH', stockName: '上海机场', currency: 'CNY', allocatedQuantity: 1, remainingQuantity: 0,
      closedQuantity: 1, closedValue: 10, entryPrice: 10, realizedPnl: 0 },
  ].map(row => ({ ...row, startDate: '2026-11-01', openedAt: '2026-11-01', closedAt: '2026-11-10' }));
  const closedLots = history.map(row => ({ participationId: row.id, lotId: row.lotId, symbol: row.symbol, stockName: row.stockName, currency: row.currency,
    soldAt: row.closedAt, soldQuantity: row.closedQuantity, unitCost: row.entryPrice, sellPrice: row.closedValue / row.closedQuantity,
    buyValue: row.closedQuantity * row.entryPrice, sellValue: row.closedValue, realizedPnl: row.realizedPnl,
    buyValueCny: 'closedBuyValueCny' in row ? row.closedBuyValueCny : undefined,
    sellValueCny: 'closedSellValueCny' in row ? row.closedSellValueCny : undefined,
    realizedPnlCny: 'realizedPnlCny' in row ? row.realizedPnlCny : undefined,
    fxLocked: 'closedFxLocked' in row ? row.closedFxLocked : undefined, fxRate: row.currency === 'USDT' ? 6 : 6.25, fxLockedAt: '2026-11-25T04:00:00Z' }));
  const publicData: any = { positions: [{ symbol: 'AAPL', stockName: '苹果', currency: 'USD', marketPrice: 12,
    lots: [{ id: 11, quantity: 100, unitCost: 10, openedAt: '2026-11-01T02:00:00Z' }] }], summary: { usdtCnyRate: 6.8 } };
  const memberData: any = { viewerUserId: 901, positions: [{ symbol: 'AAPL', lots: [{ id: 11, lotId: 11, quantity: 6, entryPrice: 10 }] }],
    summary: {}, history: [], participations: history, closedLots };
  const soldLots = closedLots.map(lot => ({ ...lot, sellEventId: Number(lot.lotId) + 70,
    accountNetProfit: -lot.realizedPnl, accountNetProfitCny: lot.realizedPnlCny === undefined ? undefined : -Number(lot.realizedPnlCny) }));
  const accountData: any = { ...publicData, canEdit: true, viewerUserId: 901, history: [], soldLots, realizedLots: soldLots };
  return { publicData, memberData, accountData };
}
function frozenFxPage(fixture = frozenFxPageFixture(), usdRate = 7, usdtRate: number | null = 6.8, participantView = true) {
  const hooks = hookState(), chartHooks = hookState();
  const scope: Record<string, any> = { ...instruments, ...frozenRealizedHelpers, instrumentCurrency: instruments.portfolioCurrency,
    summarizeStockCustomerPnl, useState: hooks.useState, useAuth: () => ({ user: { id: 901, name: '成员甲' } }),
    trpc: { useUtils: () => ({}), stock: { getUsdCnyRate: { useQuery: () => ({ data: { success: true, rate: usdRate } }) } },
      ledger: {}, searchManualStocks: { useQuery: () => ({ data: { results: [] } }) } } };
  fixture.publicData.summary.usdtCnyRate = usdtRate;
  fixture.accountData.summary.usdtCnyRate = usdtRate;
  const dataMap = { getStockTagPortfolio: fixture.accountData, getStockTagPublicPortfolio: fixture.publicData,
    getMyStockTagParticipantPortfolio: fixture.memberData, getStockTagDailySnapshots: [], getStockLotParticipationMatrix: { members: [], lots: [] } };
  for (const [name, data] of Object.entries(dataMap)) scope.trpc.ledger[name] = { useQuery: () => ({ data, isLoading: false, error: null }) };
  for (const name of ['correctStockTagEvent', 'updateStockTagLotNote']) scope.trpc.ledger[name] = { useMutation: () => ({}) };
  // Bind actual top-level functions, including any newly introduced pure frozen-money reader.
  const ast = ts.createSourceFile('actual-page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  for (const statement of ast.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name?.text === 'LegacyStockTagPortfolio') break;
    if (ts.isFunctionDeclaration(statement) && statement.name) scope[statement.name.text] = actual(source, statement.name.text, scope);
    if (ts.isVariableStatement(statement)) for (const declaration of statement.declarationList.declarations) {
      if (declaration.initializer && (ts.isArrowFunction(declaration.initializer) || ts.isFunctionExpression(declaration.initializer))) {
        const name = declaration.name.getText(ast); scope[name] = actual(source, name, scope);
      }
    }
  }
  scope.eventLabels = {}; scope.eventTone = {};
  for (const name of ['ArrowLeft', 'BadgeCheck', 'ChevronDown', 'ChevronUp', 'History', 'Loader2', 'Plus', 'X', 'Button', 'Avatar', 'AvatarImage', 'AvatarFallback', 'Input', 'Label',
    'StockNameProfitSummary', 'StockCustomerProfitSummary', 'StockQuoteUpdateIndicator', 'CryptoAwareObservationAccountSummary', 'CryptoAwareObservationPortfolio']) scope[name] = 'span';
  scope.StockTagBuyEditDialog = () => null;
  scope.StockTagBuyCancelDialog = () => null;
  for (const name of ['Dialog', 'Sheet', 'StockTagTradeDialog']) scope[name] = (p: any) => p.open ? React.createElement('div', null, p.children) : null;
  for (const name of ['DialogContent', 'DialogHeader', 'SheetContent', 'SheetHeader']) scope[name] = 'div';
  for (const name of ['DialogTitle', 'SheetTitle']) scope[name] = 'h2';
  const chartScope = { useState: chartHooks.useState, scopes: actual(frozenChartSource, 'scopes'), amount: actual(frozenChartSource, 'amount') };
  const Chart = actual(frozenChartSource, 'StockParticipantProfitChart', chartScope);
  scope.StockParticipantProfitChart = (p: any) => { chartHooks.reset(); return Chart(p); };
  const Component = actual(source, 'LegacyStockTagPortfolio', scope);
  const render = () => { hooks.reset(); return expand(Component({ ...props, participantView, presentationMode: participantView ? 'user' : 'admin', effectiveUserId: 901 })); };
  const chart = (tree = render()) => nodes(tree).find(n => n.props?.['aria-label'] === '我的股票盈亏对比');
  const chooseChart = (label: string) => { nodes(chart()).find(n => n.props?.role === 'tab' && text(n).startsWith(`${label}（`)).props.onClick(); return chart(); };
  const history = () => { nodes(render()).find(n => n.type === 'button' && n.props?.role === 'tab' && text(n) === '历史记录').props.onClick(); return render(); };
  return { render, chart, chooseChart, history, fixture };
}
const frozenTableRow = (tree: any, label: string) => nodes(tree).find(n => n.type === 'tr' && nodes(n).some(child => child.type === 'th' && text(child).startsWith(label)));
const frozenTopTotal = (tree: any) => text(nodes(tree).find(n => n.type === 'button' && n.props?.['aria-label'] === '查看总计计算公式')?.props?.children) &&
  text(nodes(tree).find(n => n.type === 'div' && n.props?.children?.[0]?.props?.['aria-label'] === '查看总计计算公式'));
const frozenChartItems = (tree: any) => nodes(tree).filter(n => n.props?.role === 'listitem').map(n => n.props['aria-label']);
const frozenChartTotals = (tree: any) => nodes(tree).filter(n => /^(盈利|亏损|合计) /.test(n.props?.['aria-label'] || '')).map(n => n.props['aria-label']);

describe('历史锁汇：真实页面 AST 离线回归', () => {
  it('历史锁汇：相同固定历史在 USD/CNY 7 与 8 下标题和上方结束价值完全不变，当前价值与总计仍实时变化', () => {
    const before = frozenFxPage(undefined, 7), after = frozenFxPage(undefined, 8);
    const a = before.history(), b = after.history();
    const title = (tree: any) => nodes(tree).find(n => n.props?.['data-member-sold-title'] !== undefined);
    expect(text(title(a))).toBe('已结束（4笔）+¥21.00');
    expect(renderToStaticMarkup(title(a))).toBe(renderToStaticMarkup(title(b)));
    const ended = frozenTableRow(a, '已结束');
    expect(text(ended)).toContain('¥700.00'); expect(text(ended)).toContain('¥679.00');
    // Includes raw auxiliary amounts: historical USD must not be reverse-derived using live FX.
    expect(renderToStaticMarkup(ended)).toBe(renderToStaticMarkup(frozenTableRow(b, '已结束')));
    expect(text(frozenTableRow(a, '进行中'))).toContain('¥504.00');
    expect(text(frozenTableRow(b, '进行中'))).toContain('¥576.00');
    expect(frozenTopTotal(a)).toContain('−¥63.00'); expect(frozenTopTotal(b)).toContain('−¥75.00');
    expect(memberSoldRows(a)).toHaveLength(4);
    expect(nodes(memberSoldRows(a)[0]).filter(n => n.props?.['data-closed-percent'] !== undefined).map(text)).toEqual(['+20.00%']);
  });
  it('历史锁汇：真实三标签进行中/已结束/全部分流和数量，部分平仓与完全结束各计一次且冻结行及已结束合计不随即期率变化', () => {
    const before = frozenFxPage(undefined, 7), after = frozenFxPage(undefined, 8);
    expect(nodes(before.chart()).filter(n => n.props?.role === 'tab').map(text)).toEqual(['进行中（1）', '已结束（4）', '全部（4）']);
    const endedA = before.chooseChart('已结束'), endedB = after.chooseChart('已结束');
    expect(frozenChartItems(endedA)).toEqual(['微软 −¥65.00', '苹果 +¥50.00', 'Uniswap +¥36.00', '上海机场 ¥0.00']);
    expect(frozenChartItems(endedA)).toEqual(frozenChartItems(endedB));
    expect(frozenChartTotals(endedA)).toEqual(['合计 +¥21.00']);
    expect(frozenChartTotals(endedB)).toEqual(frozenChartTotals(endedA));
    expect(frozenChartItems(before.chooseChart('进行中'))).toEqual(['苹果 −¥84.00']);
    expect(frozenChartItems(after.chooseChart('进行中'))).toEqual(['苹果 −¥96.00']);
    const allA = before.chooseChart('全部'), allB = after.chooseChart('全部');
    expect(frozenChartItems(allA)).toContain('苹果 −¥34.00'); expect(frozenChartItems(allB)).toContain('苹果 −¥46.00');
    expect(frozenChartTotals(allA)).toContain('合计 −¥63.00'); expect(frozenChartTotals(allB)).toContain('合计 −¥75.00');
    expect(frozenChartItems(before.chooseChart('已结束'))).toEqual(frozenChartItems(endedA));
  });
  it.each(['USD', 'USDT'] as const)('历史锁汇：%s缺锁不借当前率或补零，历史CNY标题/结束价值/三标签未知但原币金额和涨跌幅保留', currency => {
    const fixture = frozenFxPageFixture();
    fixture.memberData.participations = fixture.memberData.participations.filter((row: any) => row.currency === currency).slice(0, 1);
    fixture.memberData.closedLots = fixture.memberData.closedLots.filter((row: any) => row.currency === currency).slice(0, 1);
    for (const row of fixture.memberData.participations) Object.assign(row, { closedBuyValueCny: null, closedSellValueCny: null, realizedPnlCny: null, closedFxLocked: false });
    for (const row of fixture.memberData.closedLots) Object.assign(row, { buyValueCny: null, sellValueCny: null, realizedPnlCny: null, fxLocked: false, fxRate: null, fxLockedAt: null });
    const h = frozenFxPage(fixture, 8, 7.7), tree = h.history();
    const title = nodes(tree).find(n => n.props?.['data-member-sold-title'] !== undefined);
    expect(text(title)).toBe('已结束（1笔）—'); expect(text(title)).not.toContain('0.00');
    const ended = frozenTableRow(tree, '已结束'); expect(text(ended)).toContain('—'); expect(text(ended)).not.toContain('¥0.00');
    expect(frozenTopTotal(tree)).toContain('—');
    const lot = memberSoldRows(tree)[0];
    expect(text(nodes(lot).find(n => n.props?.['data-closed-pnl'] !== undefined))).toBe(currency === 'USD' ? '+US$8.00' : '+USDT 6.00');
    expect(text(nodes(lot).find(n => n.props?.['data-closed-percent'] !== undefined))).toBe('+20.00%');
    if (currency === 'USDT') expect(text(lot)).not.toContain('US$');
    expect(frozenChartItems(h.chooseChart('已结束'))).toEqual([`${currency === 'USD' ? '苹果' : 'Uniswap'} 暂未估值`]);
    expect(frozenChartTotals(h.chart())).toEqual(['合计 暂未估值']);
  });
  it('历史锁汇：锁定有效0不fallback原币或当前率；CNY没有锁字段仍天然等于原值', () => {
    const fixture = frozenFxPageFixture();
    fixture.memberData.participations = fixture.memberData.participations.filter((row: any) => row.id === 1 || row.id === 4);
    fixture.memberData.closedLots = fixture.memberData.closedLots.filter((row: any) => row.participationId === 1 || row.participationId === 4);
    Object.assign(fixture.memberData.participations[0], { closedBuyValueCny: 0, closedSellValueCny: 0, realizedPnlCny: 0 });
    Object.assign(fixture.memberData.closedLots[0], { buyValueCny: 0, sellValueCny: 0, realizedPnlCny: 0 });
    const h = frozenFxPage(fixture, 8), tree = h.history();
    expect(text(nodes(tree).find(n => n.props?.['data-member-sold-title'] !== undefined))).toBe('已结束（2笔）¥0.00');
    expect(text(frozenTableRow(tree, '已结束'))).toContain('¥10.00');
    expect(frozenChartItems(h.chooseChart('已结束'))).toEqual(['苹果 ¥0.00', '上海机场 ¥0.00']);
    expect(frozenChartTotals(h.chart())).toEqual(['合计 ¥0.00']);
  });
  it('历史锁汇：USDT锁值不需要live USDT率，更不能用live USD率；未知当前行情不污染冻结历史', () => {
    const fixture = frozenFxPageFixture();
    fixture.memberData.participations = fixture.memberData.participations.filter((row: any) => row.currency === 'USDT');
    fixture.memberData.closedLots = fixture.memberData.closedLots.filter((row: any) => row.currency === 'USDT');
    fixture.publicData.positions[0].marketPrice = null;
    const h = frozenFxPage(fixture, 8, null), tree = h.history();
    expect(text(nodes(tree).find(n => n.props?.['data-member-sold-title'] !== undefined))).toBe('已结束（1笔）+¥36.00');
    expect(text(frozenTableRow(tree, '已结束'))).toContain('¥180.00'); expect(text(frozenTableRow(tree, '已结束'))).toContain('¥144.00');
    expect(frozenChartItems(h.chooseChart('已结束'))).toEqual(['Uniswap +¥36.00']);
    expect(frozenChartItems(h.chooseChart('进行中'))).toEqual(['苹果 暂未估值']);
  });
  it('历史锁汇：管理员账户已平仓金额及净盈亏固定，仍有余仓的realizedLots也计入且账户当前浮盈继续变化', () => {
    const before = frozenFxPage(undefined, 7, 6.8, false), after = frozenFxPage(undefined, 8, 7.7, false);
    const closed = (tree: any) => nodes(tree).find(n => n.type === 'div' && n.key === '已平仓');
    const a = before.render(), b = after.render();
    expect(text(closed(a))).toContain('¥700.00'); expect(text(closed(a))).toContain('¥679.00'); expect(text(closed(a))).toContain('−¥21.00');
    expect(renderToStaticMarkup(closed(a))).toBe(renderToStaticMarkup(closed(b)));
    const soldCard = (tree: any) => nodes(tree).find(n => n.key === 'sold-11-81');
    // 管理员成交卡原币固定展示保留；其上方人民币汇总必须读锁值。
    for (const amount of ['US$40.00', 'US$32.00', '−US$8.00']) expect(text(soldCard(a))).toContain(amount);
    expect(renderToStaticMarkup(soldCard(a))).toBe(renderToStaticMarkup(soldCard(b)));
    expect(text(a)).toContain('+¥1,379.00'); expect(text(b)).toContain('+¥1,579.00');
  });
});

describe('历史锁汇：AI 安全实际 AST 展示一致性', () => {
  const metric = (tree: any, label: string) => nodes(tree).find(n => n.type === 'div' && n.key === label);
  const summary = (tree: any) => nodes(tree).find(n => n.props?.['aria-label'] === '参与收益汇总');
  it('历史锁汇：AI部分结束与完全结束历史固定跨live 7/8不变，当前分配及累计仅随余仓浮动变化', () => {
    const rows = [row({ realizedPnl: 8, realizedPnlCny: 50 }), row({ id: 2, symbol: 'MSFT', stockName: '微软', quantity: 0,
      allocatedQuantity: 2, status: 'closed', floatingPnl: 0, realizedPnl: -10, realizedPnlCny: -65, totalPnl: -10 })];
    const data = dto({ summary: { floatingPnl: -84, realizedPnl: -15, totalPnl: -99 }, participations: rows });
    const a = aiRenderer(data, 7), b = aiRenderer(data, 8);
    expect(text(metric(summary(a), '历史分配收益'))).toBe('历史分配收益−¥15.00');
    expect(renderToStaticMarkup(metric(summary(a), '历史分配收益'))).toBe(renderToStaticMarkup(metric(summary(b), '历史分配收益')));
    expect(text(metric(summary(a), '当前分配收益'))).toBe('当前分配收益−¥84.00');
    expect(text(metric(summary(b), '当前分配收益'))).toBe('当前分配收益−¥96.00');
    expect(text(summary(a))).toContain('累计分配收益−¥99.00'); expect(text(summary(b))).toContain('累计分配收益−¥111.00');
    const articleA = nodes(a).filter(n => n.type === 'article'), articleB = nodes(b).filter(n => n.type === 'article');
    expect(articleA).toHaveLength(2);
    expect(text(metric(articleA[0], '历史分配收益'))).toBe('历史分配收益+¥50.00原币 +US$8.00');
    expect(text(metric(articleA[1], '历史分配收益'))).toBe('历史分配收益−¥65.00原币 −US$10.00');
    articleA.forEach((article, index) => expect(renderToStaticMarkup(metric(article, '历史分配收益'))).toBe(renderToStaticMarkup(metric(articleB[index], '历史分配收益'))));
    expect(text(articleA[0])).toContain('累计分配收益−¥34.00'); expect(text(articleB[0])).toContain('累计分配收益−¥46.00');
  });
  it('历史锁汇：AI显式固定null保持未知不借即时率，原币保留；固定0仍是0而非fallback', () => {
    for (const realizedPnlCny of [null, 0]) {
      const rows = [row({ realizedPnl: 8, realizedPnlCny })];
      const data = dto({ participations: rows, summary: { floatingPnl: -84, realizedPnl: realizedPnlCny, totalPnl: realizedPnlCny === null ? null : -84 } });
      for (const rate of [7, 8]) {
        const tree = aiRenderer(data, rate), article = nodes(tree).find(n => n.type === 'article');
        expect(text(metric(article, '历史分配收益'))).toBe(`历史分配收益${realizedPnlCny === null ? '—' : '¥0.00'}原币 +US$8.00`);
        expect(text(metric(summary(tree), '历史分配收益'))).toBe(`历史分配收益${realizedPnlCny === null ? '—' : '¥0.00'}`);
        expect(text(article)).not.toContain(rate === 7 ? '+¥56.00' : '+¥64.00');
        if (realizedPnlCny === null) { expect(text(article)).toContain('累计分配收益—'); expect(text(summary(tree))).toContain('累计分配收益—'); }
      }
    }
  });
});
