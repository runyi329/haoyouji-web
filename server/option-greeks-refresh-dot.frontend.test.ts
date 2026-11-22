import { readFileSync } from 'node:fs';
import { createContext, Script } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import * as historical from '../shared/funder-settled-display';

// Execute production AST only: no router imports, real React runtime, network, DB or browser.
function parse(relative: string) {
  return ts.createSourceFile(relative, readFileSync(new URL(`../client/src/${relative}`, import.meta.url), 'utf8'),
    ts.ScriptTarget.Latest, true, relative.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
}
const hookAst = parse('hooks/useOptionGreeks.ts');
const dotAst = parse('components/QuoteRefreshDot.tsx');
const cardAst = parse('components/FunderOrderCard.tsx');
const v2Ast = parse('components/FunderOrderCardV2.tsx');
function nodes<T extends ts.Node>(root: ts.Node, guard: (node: ts.Node) => node is T): T[] {
  const result: T[] = [];
  const visit = (node: ts.Node) => { if (guard(node)) result.push(node); ts.forEachChild(node, visit); };
  visit(root); return result;
}
function required<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`Missing production AST: ${label}`);
  return value;
}
function fn(root: ts.Node, name: string) {
  return required(nodes(root, ts.isFunctionDeclaration).find(node => node.name?.text === name), name);
}
function expr(root: ts.Node, name: string) {
  return required(nodes(root, ts.isVariableDeclaration).find(node => node.name.getText() === name)?.initializer, name).getText();
}
function offlineSource(root: ts.SourceFile) {
  return root.statements.filter(node => !ts.isImportDeclaration(node)).map(node => node.getText().replace(/^export\s+/, '')).join('\n');
}
const createElement = (tag: any, props: any, ...children: any[]) => ({ tag, props: props ?? {}, children });
function text(tree: any): string {
  if (Array.isArray(tree)) return tree.map(text).join('');
  if (tree?.children) return text(tree.children);
  return tree == null || typeof tree === 'boolean' ? '' : String(tree);
}
const forbidden = () => { throw new Error('Network/DB/timers forbidden in offline regression'); };
function evaluate(code: string, bindings: Record<string, any> = {}) {
  const context = createContext({ React: { createElement, Fragment: 'fragment' }, fetch: forbidden,
    XMLHttpRequest: forbidden, WebSocket: forbidden, setTimeout: forbidden, setInterval: forbidden,
    requestAnimationFrame: forbidden, require: forbidden, ...bindings });
  const output = ts.transpileModule(code, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React,
  } }).outputText;
  return new Script(output).runInContext(context, { timeout: 1000 });
}
const card = fn(cardAst, 'FunderOrderCard');
const refreshKeyFn = fn(hookAst, 'getOptionGreeksRefreshKey');
const getRefreshKey = evaluate([
  fn(hookAst, 'hasUsableOptionMarkPrice').getText(), refreshKeyFn.getText(), 'getOptionGreeksRefreshKey;',
].join('\n')) as (raw: any, enabled: boolean, error: unknown, contract: string) => string | null;
const contract = 'ETH-2026-12-25-3000-long_call';
const goodQuote = (overrides: Record<string, any> = {}) => ({ instrumentName: 'ETH-25DEC26-3000-C',
  markPrice: 125, delta: 0.4, gamma: 0.01, theta: -0.3, vega: 1, iv: 0.5, fetchedAt: 100, ...overrides });

// Minimal React lifecycle: persistent refs/state, Object.is dependency checks, DOM ref attachment,
// cleanup before changed effects and on unmount. Effects never run during render.
function hooksHarness() {
  let cursor = 0;
  const slots: any[] = [];
  const pending: (() => void)[] = [];
  return {
    slots,
    begin() { cursor = 0; },
    useRef(initial: any) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { current: initial };
      return slots[index];
    },
    useState(initial: any) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { value: typeof initial === 'function' ? initial() : initial };
      return [slots[index].value, (next: any) => {
        slots[index].value = typeof next === 'function' ? next(slots[index].value) : next;
      }];
    },
    useEffect(effect: () => any, deps?: any[]) {
      const index = cursor++;
      const previous = slots[index];
      if (!previous || !deps || !previous.deps || deps.some((value, i) => !Object.is(value, previous.deps[i]))) {
        pending.push(() => {
          previous?.cleanup?.();
          slots[index] = { deps: deps?.slice(), effect, cleanup: effect() };
        });
      }
    },
    commit() { pending.splice(0).forEach(job => job()); },
    replayEffects() { slots.filter(slot => slot?.effect).forEach(slot => slot.effect()); },
    unmount() { slots.filter(slot => slot?.effect).forEach(slot => { slot.cleanup?.(); slot.cleanup = undefined; }); },
  };
}
function dotHarness(options: { reduced?: boolean; missingAnimate?: boolean; throws?: boolean; noWindow?: boolean } = {}) {
  const hooks = hooksHarness();
  const cancellations: ReturnType<typeof vi.fn>[] = [];
  const animate = vi.fn((_frames: any, _options: any) => {
    if (options.throws) throw new Error('Unsupported WebView animation');
    const cancel = vi.fn(); cancellations.push(cancel); return { cancel };
  });
  const node = options.missingAnimate ? {} : { animate };
  const matchMedia = vi.fn(() => ({ matches: options.reduced === true }));
  const QuoteRefreshDot = evaluate(`${offlineSource(dotAst)}\nQuoteRefreshDot;`, {
    useRef: hooks.useRef, useEffect: hooks.useEffect,
    ...(options.noWindow ? {} : { window: { matchMedia } }),
  });
  return {
    animate, cancellations, matchMedia, hooks,
    render(refreshKey: string | null, enabled?: boolean) {
      hooks.begin();
      const tree = QuoteRefreshDot({ refreshKey, ...(enabled === undefined ? {} : { enabled }) });
      if (tree?.props.ref && typeof tree.props.ref === 'object') tree.props.ref.current = node;
      hooks.commit(); return tree;
    },
  };
}
function queryHarness(saved: Record<string, number> = {}) {
  const hooks = hooksHarness();
  let query: any = { data: undefined, isLoading: false, isFetching: false, error: null };
  const useQuery = vi.fn((_input: any, _options: any) => query);
  const storage = new Map<string, string>([['haoyouji_option_mark_price_v1', JSON.stringify(saved)]]);
  const useOptionGreeks = evaluate(`${offlineSource(hookAst)}\nuseOptionGreeks;`, {
    useRef: hooks.useRef, useState: hooks.useState, useEffect: hooks.useEffect,
    trpc: { ledger: { deribitGetGreeks: { useQuery } } },
    window: { localStorage: { getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value) } },
  });
  return {
    useQuery, storage,
    render(next: Record<string, any>, params: Record<string, any> = {}) {
      query = { data: undefined, isLoading: false, isFetching: false, error: null, ...next };
      hooks.begin();
      const result = useOptionGreeks({ currency: 'ETH', exerciseDate: '2026-12-25', strikePrice: 3000,
        direction: 'long_call', ...params });
      hooks.commit(); return result;
    },
  };
}
function jsxAttribute(node: ts.JsxSelfClosingElement, name: string) {
  const attribute = required(node.attributes.properties.find((item): item is ts.JsxAttribute =>
    ts.isJsxAttribute(item) && item.name.getText() === name), `${node.tagName.getText()}.${name}`);
  const initializer = required(attribute.initializer, name);
  return required(ts.isJsxExpression(initializer) ? initializer.expression : undefined, `${name} expression`).getText();
}
const evaluateExpr = (expression: string, bindings: Record<string, any> = {}) =>
  evaluate(`(${expression});`, { ...historical, ...bindings });
function noTimers(root: ts.Node) {
  return nodes(root, ts.isCallExpression).filter(node =>
    /(?:^|\.)(?:setInterval|setTimeout|requestAnimationFrame)$/.test(node.expression.getText()));
}

describe('production refresh-key validity, without API imports', () => {
  it.each([hookAst, dotAst, cardAst])('real modified source parses', ast => {
    expect((ast as any).parseDiagnostics).toEqual([]);
  });
  it('helper remains private and keys include contract plus real fetch timestamp', () => {
    expect(refreshKeyFn.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false).toBe(false);
    expect(getRefreshKey(goodQuote(), true, null, contract)).toBe(`${contract}:100`);
    expect(getRefreshKey(goodQuote({ fetchedAt: 101 }), true, null, contract)).toBe(`${contract}:101`);
    expect(getRefreshKey(goodQuote(), true, undefined, 'BTC-other-contract')).toBe('BTC-other-contract:100');
  });
  it.each([null, undefined])('missing raw quote %s cannot trigger refresh', raw => {
    expect(getRefreshKey(raw, true, null, contract)).toBeNull();
  });
  it.each([0, -1, NaN, Infinity, -Infinity, null, undefined, ''])('invalid/absent mark %s cannot trigger refresh', markPrice => {
    expect(getRefreshKey(goodQuote({ markPrice }), true, null, contract)).toBeNull();
  });
  it.each([0, -1, NaN, Infinity, -Infinity, null, undefined, '100'])('fetchedAt must be a finite positive number, not %s', fetchedAt => {
    expect(getRefreshKey(goodQuote({ fetchedAt }), true, null, contract)).toBeNull();
  });
  it('disabled, source errors, query errors and explicitly stale cache all suppress the key', () => {
    expect(getRefreshKey(goodQuote(), false, null, contract)).toBeNull();
    expect(getRefreshKey(goodQuote({ error: 'unavailable' }), true, null, contract)).toBeNull();
    expect(getRefreshKey(goodQuote(), true, new Error('transport failed'), contract)).toBeNull();
    expect(getRefreshKey(goodQuote({ cacheStale: true }), true, null, contract)).toBeNull();
    expect(getRefreshKey(goodQuote({ cacheStale: false }), true, null, contract)).toBe(`${contract}:100`);
    expect(getRefreshKey(goodQuote({ error: '' }), true, null, contract)).toBe(`${contract}:100`);
  });
  it('identical cached fetches have identical keys even when data objects or prices change', () => {
    const key = getRefreshKey(goodQuote(), true, null, contract);
    expect(getRefreshKey(goodQuote(), true, null, contract)).toBe(key);
    expect(getRefreshKey(goodQuote({ markPrice: 126 }), true, null, contract)).toBe(key);
  });
});

describe('QuoteRefreshDot executes real TSX with persistent hook refs', () => {
  it('is a named export with default-enabled, fixed 6px span and no timer/CSS animation', () => {
    const dotFunction = fn(dotAst, 'QuoteRefreshDot');
    expect(dotFunction.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)).toBe(true);
    const dot = dotHarness(); const tree = dot.render(`${contract}:100`);
    expect(tree.tag).toBe('span');
    expect(tree.props.style).toMatchObject({ width: 6, height: 6, flexShrink: 0, borderRadius: '50%' });
    expect(tree.props.style.animation).toBeUndefined();
    expect(tree.props.className ?? '').not.toMatch(/animate-|pulse|ping/);
    expect(noTimers(dotAst)).toEqual([]);
    expect(nodes(dotFunction, ts.isCallExpression).filter(node => node.expression.getText() === 'useRef')).toHaveLength(2);
  });
  it('new keys animate exactly once for 2600ms ease-in-out, one iteration', () => {
    const dot = dotHarness(); dot.render(`${contract}:100`);
    expect(dot.animate).toHaveBeenCalledOnce();
    expect(dot.animate.mock.calls[0][1]).toMatchObject({ duration: 2600, easing: 'ease-in-out', iterations: 1 });
    const frames = dot.animate.mock.calls[0][0] as any;
    expect(frames.length).toBeGreaterThanOrEqual(3);
    expect(frames[0].opacity).toBe(frames[frames.length - 1].opacity);
    dot.render(`${contract}:100`); dot.render(`${contract}:100`);
    expect(dot.animate).toHaveBeenCalledOnce();
    // Also exercise the effect's own last-key guard, not merely React dependency de-duplication.
    dot.hooks.replayEffects(); expect(dot.animate).toHaveBeenCalledOnce();
    dot.render(`${contract}:101`); expect(dot.animate).toHaveBeenCalledTimes(2);
    dot.render('BTC-other-contract:101'); expect(dot.animate).toHaveBeenCalledTimes(3);
  });
  it('null/error transitions do not animate or make an old key count as newly fetched', () => {
    const dot = dotHarness(); dot.render(null); expect(dot.animate).not.toHaveBeenCalled();
    dot.render(`${contract}:100`); dot.render(null); dot.render(`${contract}:100`);
    expect(dot.animate).toHaveBeenCalledOnce();
    dot.render(`${contract}:101`); expect(dot.animate).toHaveBeenCalledTimes(2);
  });
  it('cancels previous animation on key change, invalidation and unmount', () => {
    const dot = dotHarness(); dot.render('first'); dot.render('second');
    expect(dot.cancellations[0]).toHaveBeenCalledOnce(); expect(dot.cancellations[1]).not.toHaveBeenCalled();
    dot.render(null); expect(dot.cancellations[1]).toHaveBeenCalledOnce();
    dot.render('third'); dot.hooks.unmount(); expect(dot.cancellations[2]).toHaveBeenCalledOnce();
  });
  it('disabled/history returns null, cancels in-flight animation and never starts one', () => {
    const dot = dotHarness(); expect(dot.render('first', false)).toBeNull();
    expect(dot.animate).not.toHaveBeenCalled(); dot.render('first', true);
    expect(dot.render('second', false)).toBeNull(); expect(dot.cancellations[0]).toHaveBeenCalledOnce();
    dot.render('third', false); expect(dot.animate).toHaveBeenCalledOnce();
  });
  it('reduced-motion keeps static valid green and does not animate', () => {
    const dot = dotHarness({ reduced: true });
    const tree = dot.render('first'); dot.render('second');
    expect(tree.props.style.backgroundColor).toBe('#22A06B');
    expect(dot.matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
    expect(dot.animate).not.toHaveBeenCalled(); dot.hooks.unmount();
  });
  it('missing Web Animations and animation exceptions degrade safely to the static span', () => {
    const missing = dotHarness({ missingAnimate: true });
    expect(missing.render('first').tag).toBe('span'); expect(missing.animate).not.toHaveBeenCalled();
    const throwing = dotHarness({ throws: true });
    expect(throwing.render('first').tag).toBe('span'); expect(throwing.animate).toHaveBeenCalledOnce();
    throwing.render('first'); expect(throwing.animate).toHaveBeenCalledOnce(); throwing.hooks.unmount();
  });
  it('server-side/missing window does not throw', () => {
    const dot = dotHarness({ noWindow: true }); expect(dot.render('first').tag).toBe('span');
  });
  it('valid quote is green, invalid quote grey, with role img and a fixed non-live aria label', () => {
    const dot = dotHarness(); const green = dot.render('first'); const grey = dot.render(null);
    expect(green.props.style.backgroundColor).toBe('#22A06B'); expect(grey.props.style.backgroundColor).toBe('#A8B2C1');
    expect(green.props.role).toBe('img'); expect(grey.props.role).toBe('img');
    expect(green.props['aria-label']).toEqual(expect.any(String));
    expect(green.props['aria-label'].trim()).not.toBe('');
    expect(grey.props['aria-label']).toBe(green.props['aria-label']);
    expect(green.props['aria-live']).toBeUndefined(); expect(grey.props['aria-live']).toBeUndefined();
    expect(dotAst.getText()).not.toContain('aria-live');
  });
});

describe('useOptionGreeks real hook preserves polling, fallback and settled isolation', () => {
  it('keeps the existing three-second query cadence and exposes refreshKey from raw data', () => {
    const hook = queryHarness(); const result = hook.render({ data: goodQuote() });
    expect(result.refreshKey).toBe(`${contract}:100`); expect(result.data.markPrice).toBe(125);
    expect(hook.useQuery).toHaveBeenCalledWith({ currency: 'ETH', exerciseDate: '2026-12-25', strikePrice: 3000,
      direction: 'long_call' }, expect.objectContaining({ enabled: true, staleTime: 3000, refetchInterval: 3000, retry: 1 }));
    expect(noTimers(hookAst)).toEqual([]);
    const refreshCalls = nodes(fn(hookAst, 'useOptionGreeks'), ts.isCallExpression)
      .filter(node => node.expression.getText() === 'getOptionGreeksRefreshKey');
    expect(refreshCalls).toHaveLength(1);
    expect(refreshCalls[0].arguments.map(argument => argument.getText())).toEqual(['rawData', 'enabled', 'query.error', 'contractKey']);
  });
  it('a background fetch or repeated cached object does not generate another animation', () => {
    const hook = queryHarness(); const dot = dotHarness();
    const first = hook.render({ data: goodQuote() }); dot.render(first.refreshKey);
    const cached = hook.render({ data: goodQuote(), isFetching: true }); dot.render(cached.refreshKey);
    expect(cached.loading).toBe(true); expect(cached.refreshKey).toBe(first.refreshKey);
    expect(dot.animate).toHaveBeenCalledOnce();
    dot.render(hook.render({ data: goodQuote({ fetchedAt: 101 }) }).refreshKey);
    expect(dot.animate).toHaveBeenCalledTimes(2);
  });
  it.each(['raw-error', 'query-error', 'stale-cache'])('%s retains usable display price but removes the success key', kind => {
    const hook = queryHarness();
    const result = hook.render({ data: goodQuote(kind === 'raw-error' ? { error: 'upstream failed' } :
      kind === 'stale-cache' ? { cacheStale: true } : {}), error: kind === 'query-error' ? { message: 'failed' } : null });
    expect(result.data.markPrice).toBe(125); expect(result.refreshKey).toBeNull();
    if (kind === 'query-error') expect(result.error).toBe('failed');
  });
  it.each([undefined, null, goodQuote({ markPrice: 0, fetchedAt: 200 }), goodQuote({ markPrice: null, fetchedAt: 200 })])
  ('missing current mark %s preserves session data, never labels fallback as fresh', raw => {
    const hook = queryHarness(); hook.render({ data: goodQuote() });
    const result = hook.render({ data: raw, isFetching: true });
    expect(result.data.markPrice).toBe(125); expect(result.data.fetchedAt).toBe(100);
    expect(result.refreshKey).toBeNull(); expect(result.loading).toBe(true);
  });
  it('persisted positive mark survives a cold mount and cannot borrow raw fetchedAt for a pulse', () => {
    const hook = queryHarness({ [contract]: 88 });
    const result = hook.render({ data: goodQuote({ markPrice: 0, fetchedAt: 200 }) });
    expect(result.data.markPrice).toBe(88); expect(result.data.fetchedAt).toBe(200);
    expect(result.refreshKey).toBeNull();
    const empty = queryHarness({ [contract]: 88 }).render({ data: undefined });
    expect(empty.data.markPrice).toBe(88); expect(empty.refreshKey).toBeNull();
  });
  it('a changed contract cannot inherit another contract session fallback', () => {
    const hook = queryHarness(); hook.render({ data: goodQuote() });
    const missing = hook.render({ data: null }, { strikePrice: 4000 });
    expect(missing.data).toBeNull(); expect(missing.refreshKey).toBeNull();
    expect(hook.render({ data: goodQuote({ fetchedAt: 200 }) }, { strikePrice: 4000 }).refreshKey)
      .toBe('ETH-2026-12-25-4000-long_call:200');
  });
  it('disabled settled orders hide all live/cached values and stop polling eligibility', () => {
    const hook = queryHarness({ [contract]: 88 }); hook.render({ data: goodQuote() });
    const result = hook.render({ data: goodQuote({ fetchedAt: 200 }), isLoading: true, isFetching: true,
      error: { message: 'hidden live failure' } }, { enabled: false });
    expect(result).toMatchObject({ data: null, loading: false, error: null, markPriceDirection: 'same', refreshKey: null });
    expect(hook.useQuery.mock.calls.at(-1)?.[1].enabled).toBe(false);
  });
  it('first-load and query-error semantics stay intact', () => {
    const hook = queryHarness();
    expect(hook.render({ isLoading: true })).toMatchObject({ loading: true, refreshKey: null });
    expect(hook.render({ error: { message: 'offline' } })).toMatchObject({ error: 'offline', refreshKey: null });
  });
  it('same-contract up/down comparison and persisted price fallback stay intact', () => {
    const hook = queryHarness(); const quote100 = goodQuote({ markPrice: 100 });
    expect(hook.render({ data: quote100 }).markPriceDirection).toBe('same');
    const quote120 = goodQuote({ markPrice: 120, fetchedAt: 101 });
    hook.render({ data: quote120 }); expect(hook.render({ data: quote120 }).markPriceDirection).toBe('up');
    const quote90 = goodQuote({ markPrice: 90, fetchedAt: 102 });
    hook.render({ data: quote90 }); expect(hook.render({ data: quote90 }).markPriceDirection).toBe('down');
    expect(JSON.parse(hook.storage.get('haoyouji_option_mark_price_v1')!)[contract]).toBe(90);
  });
});

describe('ordinary FunderOrderCard AST wiring and retained historical/body display', () => {
  it('only the ordinary Greeks title is wired to QuoteRefreshDot, never V2', () => {
    const imports = nodes(cardAst, ts.isImportDeclaration).filter(node => node.moduleSpecifier.getText().includes('QuoteRefreshDot'));
    expect(imports).toHaveLength(1);
    expect(imports[0].importClause?.namedBindings?.getText()).toContain('QuoteRefreshDot');
    const dots = nodes(card, ts.isJsxSelfClosingElement).filter(node => node.tagName.getText() === 'QuoteRefreshDot');
    expect(dots).toHaveLength(1);
    const title = required(nodes(card, ts.isJsxElement).filter(node => node.openingElement.tagName.getText() === 'div'
      && nodes(node, ts.isJsxText).some(item => item.text.trim() === 'Greeks')
      && nodes(node, ts.isJsxSelfClosingElement).some(item => item.tagName.getText() === 'QuoteRefreshDot'))
      .sort((a, b) => a.getText().length - b.getText().length)[0], 'Greeks title containing dot');
    expect(title.getText()).not.toContain('刷新中'); expect(title.getText()).not.toContain('greeksResult.loading');
    expect(card.getText()).not.toContain('刷新中...');
    const dot = dots[0];
    expect(evaluateExpr(jsxAttribute(dot, 'refreshKey'), { greeksResult: { refreshKey: 'fresh' }, isSettlementFinal: false,
      isPricingFrozen: false })).toBe('fresh');
    expect(evaluateExpr(jsxAttribute(dot, 'enabled'), { isSettlementFinal: false, isPricingFrozen: false })).toBe(true);
    expect(evaluateExpr(jsxAttribute(dot, 'enabled'), { isSettlementFinal: true, isPricingFrozen: true })).toBe(false);
    expect(v2Ast.getText()).not.toContain('QuoteRefreshDot');
  });
  it('first-load body and initial transport failure remain visible, not moved into the title', () => {
    const loading = required(nodes(card, ts.isJsxExpression).filter(node => node.getText()
      .includes('greeksResult.loading && !greeksResult.data && <div'))
      .sort((a, b) => a.getText().length - b.getText().length)[0], 'Greeks first-load body');
    const error = required(nodes(card, ts.isJsxExpression).filter(node => node.getText()
      .includes('greeksResult.error && !greeksResult.data && <div'))
      .sort((a, b) => a.getText().length - b.getText().length)[0], 'Greeks query error body');
    expect(text(evaluateExpr(required(loading.expression, 'loading expression').getText(),
      { greeksResult: { loading: true, data: null } }))).toBe('加载中...');
    expect(text(evaluateExpr(required(error.expression, 'error expression').getText(),
      { greeksResult: { error: 'offline', data: null } }))).toBe('获取失败: offline');
    expect(evaluateExpr(required(loading.expression, 'loading expression').getText(),
      { greeksResult: { loading: true, data: goodQuote() } })).toBe(false);
  });
  it('settled zero-price/zero-Greek snapshots override live data; missing history never borrows current quote', () => {
    const bindings = { isPricingFrozen: true, greeksResult: { data: goodQuote() }, settlementSnapshot: {
      version: 2, optionQuote: { markPriceUsdt: 0, delta: 0, gamma: 0, theta: 0, vega: 0, iv: 0 },
    } };
    const saved = evaluateExpr(expr(card, 'optionGreeksData'), bindings);
    expect(saved).toMatchObject({ markPrice: 0, delta: 0, iv: 0 });
    expect(evaluateExpr(expr(card, 'historicalGreeksMissing'), { isSettlementFinal: true, optionGreeksData: saved })).toBe(false);
    expect(evaluateExpr(expr(card, 'optionGreeksData'), { ...bindings, settlementSnapshot: null })).toBeNull();
    expect(evaluateExpr(expr(card, 'optionGreeksData'), { ...bindings, isPricingFrozen: false })).toEqual(goodQuote());
    const details = required(nodes(card, ts.isJsxElement).find(node => node.openingElement.tagName.getText() === 'details'
      && node.getText().includes('历史 Greeks 未保存')), 'historical Greeks details');
    expect(text(evaluateExpr(details.getText()))).toContain('不使用当前行情补历史');
    expect(details.openingElement.attributes.properties.some(attribute => attribute.getText() === 'open')).toBe(false);
  });
  it('settled and unsupported/offscreen orders remain ineligible for live Greeks queries', () => {
    const remote = expr(card, 'shouldLoadRemoteDetails');
    expect(evaluateExpr(remote, { isSettlementFinal: true, previewMode: true, jointSegmentMode: true, cardNearViewport: true })).toBe(false);
    const query = required(nodes(card, ts.isCallExpression).find(node => node.expression.getText() === 'useOptionGreeks'), 'card Greeks hook call');
    const params = required(query.arguments[0], 'Greeks parameters');
    const enabled = required(nodes(params, ts.isPropertyAssignment).find(node => node.name.getText() === 'enabled')?.initializer, 'card Greeks enabled');
    const base = { shouldLoadRemoteDetails: true, isOptionOrder: true, optionGreeksSupported: true,
      optionInfo: { exerciseDate: '2026-12-25', strikePrice: 3000 } };
    expect(evaluateExpr(enabled.getText(), base)).toBe(true);
    for (const overrides of [{ shouldLoadRemoteDetails: false }, { optionGreeksSupported: false }, { isOptionOrder: false }]) {
      expect(evaluateExpr(enabled.getText(), { ...base, ...overrides })).toBe(false);
    }
  });
  it('ordinary IV keeps its historical-number guard and genuine zero display', () => {
    const iv = required(nodes(card, ts.isJsxExpression).filter(node => node.getText()
      .includes('readFunderHistoricalNumber(d.iv) !== null && <div'))
      .sort((a, b) => a.getText().length - b.getText().length)[0], 'ordinary IV row');
    const expression = required(iv.expression, 'IV row expression').getText();
    const bindings = { d: { iv: 0 }, formatFxEstimate: (value: number, _method: string, dp: number) => value.toFixed(dp) };
    expect(text(evaluateExpr(expression, bindings))).toBe('IV0.0%');
    expect(evaluateExpr(expression, { ...bindings, d: { iv: null } })).toBe(false);
  });
});
