import { readFileSync } from 'node:fs';
import React from 'react';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as instruments from '../../../shared/portfolio-instruments';

// Beijing is already November 25 while UTC remains November 24.
const now = Date.parse('2026-11-24T16:05:00.000Z');
const today = '2026-11-25';
const source = readFileSync(new URL('./StockTagDownsideRulePanel.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('StockTagDownsideRulePanel.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const fullModuleJs = ts.transpileModule(ast.statements.filter(node => !ts.isImportDeclaration(node)).map(node => node.getText(ast)).join('\n').replaceAll('import.meta.env.DEV', '__dev'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
}).outputText;
function nodes(tree: any): any[] {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
}
function text(tree: any): string {
  if (Array.isArray(tree)) return tree.map(text).join('');
  if (tree == null || typeof tree === 'boolean') return '';
  return typeof tree === 'object' ? text(tree.props?.children) : String(tree);
}
function harness(options: { dev?: boolean; readOnlyPreview?: boolean; canEdit?: boolean; isViewingAs?: boolean; onPreviewDownsideChange?: (lotId: number, rule: any) => void | Promise<void>; rule?: any; queryData?: any; queryError?: Error; queryPending?: boolean } = {}) {
  const states: any[] = [], effects: any[] = [], queued: (() => void)[] = [];
  let cursor = 0, effectCursor = 0, mutationOptions: any, queryOptions: any, queryInput: any;
  const mutation = { mutate: vi.fn(), isPending: false };
  const query = { data: options.queryData ?? null, isPending: options.queryPending ?? false, isFetching: false, error: options.queryError ?? null, refetch: vi.fn().mockResolvedValue(undefined) };
  const invalidates = Object.fromEntries(['getStockLotDownsideRule', 'getStockTagPortfolio', 'getStockLotParticipationMatrix', 'getMyStockTagParticipantPortfolio', 'getStockTagPublicPortfolio', 'getStockTagDailySnapshots', 'getStockTagCalendar', 'getMyR1AiParticipationPortfolio', 'getMyLedger37AiStockPool', 'getMyLedger37AiWalletValue', 'getMyLedger37HoldingSources', 'getMyStockTagOverview', 'getMyStockTagObservationOverview', 'getCategories'].map(name => [name, vi.fn().mockResolvedValue(undefined)]));
  const invalidateAll = vi.fn().mockResolvedValue(undefined);
  const props = { categoryId: 90250, order: { lotId: 11, eventId: 101, stockName: '苹果', symbol: 'AAPL', marketPrice: 9, currentCountedPrice: 9, quantity: 100, executionPrice: 8, actualTradedAt: '2026-11-01T00:00:00Z', note: '' }, canEdit: options.canEdit ?? true, isViewingAs: options.isViewingAs ?? false, readOnlyPreview: options.readOnlyPreview ?? false, onClose: vi.fn(), onPendingChange: vi.fn(), previewDownsideRule: options.rule, onPreviewDownsideChange: options.onPreviewDownsideChange };
  const scope = {
    ...instruments,
    useState: (initial: any) => {
      const i = cursor++;
      if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial;
      return [states[i], (value: any) => { states[i] = typeof value === 'function' ? value(states[i]) : value; }];
    },
    useEffect: (fn: () => void, deps: any[]) => {
      const i = effectCursor++;
      if (!effects[i] || deps.some((value, n) => !Object.is(value, effects[i][n]))) { effects[i] = [...deps]; queued.push(fn); }
    },
    toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
    trpc: {
      useUtils: () => ({ invalidate: invalidateAll, ledger: Object.fromEntries(Object.entries(invalidates).map(([name, invalidate]) => [name, { invalidate }])) }),
      ledger: {
        getStockLotDownsideRule: { useQuery: (input: any, opts: any) => { queryInput = input; queryOptions = opts; return query; } },
        setStockLotDownsideRule: { useMutation: (opts: any) => { mutationOptions = opts; return mutation; } },
        updateStockTagBuy: { useMutation: () => { throw new Error('Right panel cannot write original orders'); } },
      },
    },
    Button: 'button', Input: 'input', Label: 'label',
  };
  const exports: any = {};
  new Function('exports', 'React', '__dev', ...Object.keys(scope), fullModuleJs)(exports, React, options.dev ?? false, ...Object.values(scope));
  const renderOnce = () => { cursor = effectCursor = 0; return exports.StockTagDownsideRulePanel(props); };
  const render = () => {
    let tree = renderOnce();
    for (let i = 0; queued.length && i < 10; i++) { queued.splice(0).forEach(fn => fn()); tree = renderOnce(); }
    if (queued.length) throw new Error('Effects did not settle');
    return tree;
  };
  const field = (suffix: string) => {
    const result = nodes(render()).find(node => node.props?.id === `stock-downside-${suffix}`);
    if (!result) throw new Error(`Missing field ${suffix}`);
    return result;
  };
  const change = (suffix: string, value: string | boolean) => field(suffix).props.onChange({ target: suffix === 'enabled' ? { checked: value } : { value } });
  const save = () => nodes(render()).find(node => node.type === 'button' && /^保存/.test(text(node)))!.props.onClick();
  return { props, scope, query, mutation, invalidates, invalidateAll, render, field, change, save, validate: exports.validateStockTagDownsideDraft, beijingDate: exports.beijingStockTagDownsideDate, validDate: exports.isValidStockTagDownsideStartDate, options: () => ({ queryOptions, queryInput }), success: (rule?: any) => mutationOptions.onSuccess(rule), error: (message: string) => mutationOptions.onError(new Error(message)) };
}

beforeEach(() => { vi.spyOn(Date, 'now').mockReturnValue(now); });
afterEach(() => { vi.restoreAllMocks(); });

describe('欠保证金右页签：真实完整TSX离线测试', () => {
  it('默认关闭、20%、门槛默认真实价；显示原币真实价和计入价', () => {
    const h = harness();
    expect(h.field('enabled').props.checked).toBe(false);
    expect(h.field('enabled').props['aria-checked']).toBe(false);
    expect(text(h.render())).toContain('从选定启用日期起的价格变动完全计入');
    expect(h.field('percent').props.value).toBe('20');
    expect(h.field('threshold').props.value).toBe('9');
    expect(h.field('start-date').props.value).toBe(today);
    expect(text(h.render())).toContain('实际当前价 · USD');
    expect(text(h.render())).toContain('当前计入价 · USD');
    expect(text(h.render())).toContain('不是实际股票保本承诺');
    expect(text(h.render())).toContain('剩20%保证金');
    expect(h.options().queryInput).toEqual({ ledgerId: 37, categoryId: 90250, lotId: 11 });
    expect(h.options().queryOptions.enabled).toBe(true);
  });
  it('改为剩30%保证金时文案和实际计入数值同步，0%仍有效', async () => {
    const h = harness();
    h.change('percent', '30');
    expect(text(h.render())).toContain('剩30%保证金');
    expect(text(h.render())).toContain('门槛以下的变动按30%计算');
    await h.save();
    expect(h.mutation.mutate).toHaveBeenCalledWith(expect.objectContaining({ downsidePercent: 30 }));
    h.change('percent', '0');
    expect(text(h.render())).toContain('剩0%保证金');
    expect(source).not.toContain('跌破后计入（%）');
  });
  it('右侧0%可独立保存，无修改原因/买入字段/客户端生效时间，CAS版本准确', async () => {
    const h = harness({ queryData: { lotId: 11, version: 3, enabled: true, thresholdPrice: 10, downsidePercent: 20, effectiveAt: '2026-11-25T01:00:00Z' } });
    h.change('percent', '0'); await h.save();
    expect(h.mutation.mutate).toHaveBeenCalledWith({ ledgerId: 37, categoryId: 90250, lotId: 11, enabled: true, thresholdPrice: 10, downsidePercent: 0, startDate: today, expectedVersion: 3 });
    expect(h.mutation.mutate.mock.calls[0][0]).not.toHaveProperty('effectiveAt');
    expect(h.mutation.mutate.mock.calls[0][0]).not.toHaveProperty('eventId');
    expect(h.mutation.mutate.mock.calls[0][0]).not.toHaveProperty('createdAt');
    expect(h.mutation.mutate.mock.calls[0][0]).not.toHaveProperty('auditTime');
    expect(h.props.onClose).not.toHaveBeenCalled();
  });
  it('允许100和小数比例，拒绝负数/101/空白/非有限比例', async () => {
    for (const percent of ['-1', '101', '', ' ', 'oops', 'Infinity', 'NaN']) {
      const h = harness(); h.change('percent', percent); await h.save();
      expect(h.mutation.mutate, percent).not.toHaveBeenCalled();
      expect(h.scope.toast.error).toHaveBeenCalledWith('剩余保证金比例须为0–100%');
    }
    for (const percent of ['0', '20.5', '100']) {
      const h = harness(); h.change('percent', percent); await h.save();
      expect(h.mutation.mutate).toHaveBeenCalledWith(expect.objectContaining({ downsidePercent: Number(percent) }));
    }
  });
  it('无效门槛拒绝，不写原单或规则', async () => {
    for (const threshold of ['0', '-1', '', ' ', 'NaN', 'Infinity']) {
      const h = harness(); h.change('threshold', threshold); await h.save();
      expect(h.mutation.mutate).not.toHaveBeenCalled();
      expect(h.scope.toast.error).toHaveBeenCalledWith('请输入大于0的价格门槛');
    }
  });
  it('普通成员/AI/代看不渲染且不启用owner规则查询', () => {
    for (const options of [{ canEdit: false }, { isViewingAs: true }]) {
      const h = harness(options); expect(h.render()).toBeNull();
      expect(h.options().queryOptions.enabled).toBe(false);
      expect(h.mutation.mutate).not.toHaveBeenCalled();
    }
  });
  it('DEV和只读预览没有显式回调时真实保存禁用，直接调用也不写', async () => {
    for (const options of [{ dev: true }, { readOnlyPreview: true }]) {
      const h = harness(options);
      const save = nodes(h.render()).find(node => node.type === 'button' && text(node) === '保存预览规则');
      expect(save.props.disabled).toBe(true); await h.save();
      expect(h.options().queryOptions.enabled).toBe(false);
      expect(h.mutation.mutate).not.toHaveBeenCalled();
      expect(h.invalidateAll).not.toHaveBeenCalled();
    }
  });
  it('显式异步预览允许0比例，仅本地callback，成功状态不冒充真实保存', async () => {
    const onPreviewDownsideChange = vi.fn().mockResolvedValue(undefined);
    const h = harness({ dev: true, readOnlyPreview: true, onPreviewDownsideChange });
    h.change('enabled', true); h.change('threshold', '10'); h.change('percent', '0');
    await h.save();
    expect(onPreviewDownsideChange).toHaveBeenCalledWith(11, { enabled: true, thresholdPrice: 10, downsidePercent: 0, startDate: today, expectedVersion: 0 });
    expect(text(h.render())).toContain('本地预览规则已保存');
    expect(h.mutation.mutate).not.toHaveBeenCalled(); expect(h.invalidateAll).not.toHaveBeenCalled();
    expect(h.props.onClose).not.toHaveBeenCalled();
  });
  it('本地保存后父组件更新version并结束pending，成功反馈不被重新预填清除', async () => {
    let finish!: () => void;
    const waiting = new Promise<void>(resolve => { finish = resolve; });
    const initial = { lotId: 11, version: 1, enabled: true, thresholdPrice: 10, downsidePercent: 20, startDate: '2026-11-20' };
    const h = harness({ dev: true, rule: initial, onPreviewDownsideChange: () => waiting });
    h.change('percent', '30'); h.change('start-date', '2026-11-23');
    const saving = h.save();
    h.props.previewDownsideRule = { ...initial, version: 2, downsidePercent: 30, startDate: '2026-11-23' };
    h.render();
    finish(); await saving;
    expect(text(h.render())).toContain('本地预览规则已保存');
    expect(h.field('start-date').props.value).toBe('2026-11-23');
    h.props.previewDownsideRule = { ...initial, version: 3 };
    expect(text(h.render())).not.toContain('本地预览规则已保存');
    expect(h.mutation.mutate).not.toHaveBeenCalled();
  });
  it('预览失败保留草稿、不提示成功、不写真实规则', async () => {
    const onPreviewDownsideChange = vi.fn().mockRejectedValue(new Error('本地版本冲突'));
    const h = harness({ dev: true, onPreviewDownsideChange });
    h.change('percent', '0'); await h.save();
    expect(h.field('percent').props.value).toBe('0');
    expect(h.scope.toast.error).toHaveBeenCalledWith('预览规则保存失败：本地版本冲突');
    expect(h.scope.toast.success).not.toHaveBeenCalled(); expect(h.mutation.mutate).not.toHaveBeenCalled();
  });
  it('预览callback即使误传正式环境也不能劫持真实规则保存', async () => {
    const onPreviewDownsideChange = vi.fn(); const h = harness({ onPreviewDownsideChange });
    await h.save(); expect(onPreviewDownsideChange).not.toHaveBeenCalled();
    expect(h.mutation.mutate).toHaveBeenCalledOnce();
  });
  it('读取中或读取错误时不可用旧version/默认off覆盖服务器', async () => {
    for (const options of [{ queryPending: true }, { queryError: new Error('离线') }]) {
      const h = harness(options); await h.save(); expect(h.mutation.mutate).not.toHaveBeenCalled();
    }
  });
  it('保存pending禁重复保存和关闭，成功刷新所有计入口径，失败只重读规则', async () => {
    const h = harness(); await h.save(); h.mutation.isPending = true; await h.save();
    const cancel = nodes(h.render()).find(node => node.type === 'button' && text(node) === '取消');
    expect(cancel.props.disabled).toBe(true); cancel.props.onClick();
    expect(h.props.onClose).not.toHaveBeenCalled(); expect(h.mutation.mutate).toHaveBeenCalledOnce();
    h.success(); expect(h.props.onClose).toHaveBeenCalledOnce();
    expect(h.invalidateAll).not.toHaveBeenCalled();
    for (const invalidate of Object.values(h.invalidates)) expect(invalidate).toHaveBeenCalledOnce();
    const failed = harness(); failed.render(); failed.error('版本冲突');
    expect(failed.query.refetch).toHaveBeenCalledOnce(); expect(failed.props.onClose).not.toHaveBeenCalled();
  });
  it('正式保存只失效本标签及37号AI、日历、概览，不发起全站重载', () => {
    const h = harness(); h.render(); h.success({ baselineStatus: 'ready' });
    expect(h.invalidateAll).not.toHaveBeenCalled();
    expect(h.invalidates.getStockLotDownsideRule).toHaveBeenCalledWith({ ledgerId: 37, categoryId: 90250, lotId: 11 });
    for (const name of ['getStockTagPortfolio', 'getStockLotParticipationMatrix', 'getMyStockTagParticipantPortfolio', 'getStockTagPublicPortfolio', 'getStockTagDailySnapshots', 'getStockTagCalendar']) {
      expect(h.invalidates[name]).toHaveBeenCalledWith({ ledgerId: 37, categoryId: 90250 });
    }
    for (const name of ['getMyR1AiParticipationPortfolio', 'getMyLedger37AiStockPool', 'getMyLedger37AiWalletValue', 'getMyLedger37HoldingSources', 'getMyStockTagOverview', 'getMyStockTagObservationOverview', 'getCategories']) {
      expect(h.invalidates[name]).toHaveBeenCalledWith({ ledgerId: 37 });
    }
  });
  it('切换批次重新预填，不沿用上一批比例；原币USDT不误转人民币', () => {
    const h = harness({ dev: true, rule: { lotId: 11, version: 1, enabled: true, thresholdPrice: 10, downsidePercent: 0 } });
    expect(h.field('percent').props.value).toBe('0');
    h.props.order = { ...h.props.order, lotId: 12, symbol: 'CRYPTO:BTC-USDT', marketPrice: 90000, currentCountedPrice: 90100 };
    h.props.previewDownsideRule = null;
    expect(h.field('percent').props.value).toBe('20'); expect(h.field('enabled').props.checked).toBe(false);
    expect(text(h.render())).toContain('USDT 90,000'); expect(text(h.render())).toContain('USDT 90,100');
  });
});

describe('欠保证金启用日期：可过去且重算日期起日结与客户收益', () => {
  it('日期位于价格门槛下方同一左列，比例保持右列，不限制今天或未来', () => {
    const h = harness();
    const grid = nodes(h.render()).find(node => node.props?.className === 'grid grid-cols-2 gap-3');
    const [left, right] = grid.props.children;
    expect(nodes(left).filter(node => node.type === 'label').map(node => node.props.htmlFor)).toEqual(['stock-downside-threshold', 'stock-downside-start-date']);
    expect(nodes(right).some(node => node.props?.id === 'stock-downside-percent')).toBe(true);
    expect(nodes(right).some(node => node.props?.id === 'stock-downside-start-date')).toBe(false);
    expect(text(nodes(left).find(node => node.props?.htmlFor === 'stock-downside-start-date'))).toBe('启用日期');
    expect(h.field('start-date').props.type).toBe('date');
    expect(h.field('start-date').props).not.toHaveProperty('min');
    expect(h.field('start-date').props).not.toHaveProperty('max');
  });
  it('默认北京时间今天，跨UTC午夜、年末及机器时区不截错一天', () => {
    const h = harness();
    expect(h.field('start-date').props.value).toBe('2026-11-25');
    expect(h.beijingDate('2026-11-24T15:59:59Z')).toBe('2026-11-24');
    expect(h.beijingDate('2026-11-24T16:00:00Z')).toBe('2026-11-25');
    expect(h.beijingDate(new Date('2026-12-31T16:00:00Z'))).toBe('2027-01-01');
    expect(h.beijingDate('bad-date')).toBe('');
  });
  it('优先saved.startDate；旧规则effectiveAt按北京日期兼容，无两字段才今天', () => {
    const rule = { lotId: 11, version: 3, enabled: true, thresholdPrice: 10, downsidePercent: 20 };
    for (const options of [
      { queryData: { ...rule, startDate: '2026-11-01', effectiveAt: '2026-11-24T16:05:00Z' } },
      { dev: true, rule: { ...rule, startDate: '2026-11-01', effectiveAt: '2026-11-24T16:05:00Z' } },
    ]) expect(harness(options).field('start-date').props.value).toBe('2026-11-01');
    expect(harness({ queryData: { ...rule, effectiveAt: '2026-11-01T16:05:00Z' } }).field('start-date').props.value).toBe('2026-11-02');
    expect(harness({ dev: true, rule }).field('start-date').props.value).toBe(today);
  });
  it('选择过去日期不自动写，明确重算而非仅展示日期；30文案仍真实30payload', async () => {
    const h = harness(); const orderBefore = { ...h.props.order };
    h.change('enabled', true); h.change('percent', '30'); h.change('start-date', '2026-11-02');
    expect(h.mutation.mutate).not.toHaveBeenCalled();
    expect(h.field('start-date').props.value).toBe('2026-11-02');
    expect(text(h.render())).toContain('剩30%保证金');
    expect(text(h.render())).toContain('选定启用日期起的汇总、日结和客户收益将按新比例重算；原始成交、真实行情和单股真实盈亏不变');
    for (const stale of ['从保存时', '不追改', '不回改固定历史', '此前已计入的影响保留', '仅从保存时起生效']) expect(text(h.render())).not.toContain(stale);
    await h.save();
    expect(h.mutation.mutate).toHaveBeenCalledWith(expect.objectContaining({ enabled: true, downsidePercent: 30, startDate: '2026-11-02' }));
    expect(h.props.order).toEqual(orderBefore);
  });
  it('未来日期及闰年有效日可保存，不假设开仓min、不生成effectiveAt或审计时间', async () => {
    for (const startDate of ['2027-01-01', '2028-02-29', '2026-10-01']) {
      const h = harness(); h.change('start-date', startDate); await h.save();
      expect(h.mutation.mutate).toHaveBeenCalledWith(expect.objectContaining({ startDate }));
      for (const field of ['effectiveAt', 'createdAt', 'auditTime', 'actualTradedAt']) expect(h.mutation.mutate.mock.calls[0][0]).not.toHaveProperty(field);
    }
  });
  it('空日期及伪有效日期被真实保存校验拒绝，不能Date滚动成另一日', async () => {
    for (const startDate of ['', ' ', '2026-02-30', '2026-02-29', '2026-04-31', '2026-00-01', '2026-13-01', '2026-11-00', '0000-01-01', '2026-1-01', '2026-01-1', '2026-11-25T00:00:00Z', 'not-a-date']) {
      const h = harness(); h.change('start-date', startDate); await h.save();
      expect(h.mutation.mutate, startDate).not.toHaveBeenCalled();
      expect(h.scope.toast.error).toHaveBeenCalledWith('请选择有效的启用日期（YYYY-MM-DD）');
    }
    const h = harness();
    expect(h.validDate('2000-02-29')).toBe(true); expect(h.validDate('2100-02-29')).toBe(false);
  });
  it('显式本地callback保存过去日期+0比例+原读取版本，仅本地试用标识保留', async () => {
    const callback = vi.fn().mockResolvedValue(undefined);
    const h = harness({ dev: true, onPreviewDownsideChange: callback, rule: { lotId: 11, version: 4, enabled: true, thresholdPrice: 10, downsidePercent: 20, startDate: '2026-11-20' } });
    h.change('percent', '0'); h.change('start-date', '2026-11-01');
    expect(callback).not.toHaveBeenCalled(); await h.save();
    expect(callback).toHaveBeenCalledWith(11, { enabled: true, thresholdPrice: 10, downsidePercent: 0, startDate: '2026-11-01', expectedVersion: 4 });
    expect(text(h.render())).toContain('仅本地试用，不改正式账目');
    expect(h.mutation.mutate).not.toHaveBeenCalled(); expect(h.invalidateAll).not.toHaveBeenCalled();
  });
  it('本地非法日期也不触发callback或正式mutation', async () => {
    const callback = vi.fn(); const h = harness({ dev: true, onPreviewDownsideChange: callback });
    h.change('start-date', '2026-02-30'); await h.save();
    expect(callback).not.toHaveBeenCalled(); expect(h.mutation.mutate).not.toHaveBeenCalled();
  });
  it('读取loading和pending禁改日期，不用后台刷新覆盖保存草稿', async () => {
    const h = harness({ queryData: { lotId: 11, version: 2, enabled: true, thresholdPrice: 10, downsidePercent: 20, startDate: '2026-11-10' } });
    h.change('percent', '0'); h.change('start-date', '2026-11-01');
    h.query.isFetching = true;
    expect(h.field('start-date').props.disabled).toBe(true); h.change('start-date', '2026-11-03');
    expect(h.field('start-date').props.value).toBe('2026-11-01');
    await h.save(); expect(h.mutation.mutate).not.toHaveBeenCalled();
    h.query.isFetching = false; await h.save(); h.mutation.isPending = true;
    h.change('start-date', '2026-11-04'); expect(h.field('start-date').props.value).toBe('2026-11-01');
    h.mutation.isPending = false;
    expect(h.field('percent').props.value).toBe('0'); expect(h.field('start-date').props.value).toBe('2026-11-01');
  });
  it('同规则新对象不覆盖date草稿，saved规则version或startDate变化才重填', () => {
    const initial = { lotId: 11, version: 2, enabled: true, thresholdPrice: 10, downsidePercent: 20, startDate: '2026-11-10' };
    const h = harness({ queryData: initial }); h.change('start-date', '2026-11-01');
    h.query.data = { ...initial }; expect(h.field('start-date').props.value).toBe('2026-11-01');
    h.query.data = { ...initial, version: 3, startDate: '2026-11-12' };
    expect(h.field('start-date').props.value).toBe('2026-11-12');
    h.query.data = { ...h.query.data, startDate: '2026-11-15' };
    expect(h.field('start-date').props.value).toBe('2026-11-15');
  });
  it('CAS或读取错误保留date/0草稿、阻止旧version写入，成功重读用最新版', async () => {
    const rule = { lotId: 11, version: 2, enabled: true, thresholdPrice: 10, downsidePercent: 20, startDate: '2026-11-10' };
    const h = harness({ queryData: rule }); h.change('percent', '0'); h.change('start-date', '2026-11-01'); await h.save();
    h.mutation.isPending = true; h.error('版本冲突'); h.mutation.isPending = false;
    h.query.error = new Error('重读失败'); h.query.data = { ...rule };
    expect(h.field('start-date').props.value).toBe('2026-11-01'); expect(h.field('percent').props.value).toBe('0');
    await h.save(); expect(h.mutation.mutate).toHaveBeenCalledOnce();
    h.query.error = null; h.query.data = { ...rule, version: 3, startDate: '2026-11-12' };
    expect(h.field('start-date').props.value).toBe('2026-11-12'); await h.save();
    expect(h.mutation.mutate).toHaveBeenLastCalledWith(expect.objectContaining({ expectedVersion: 3, startDate: '2026-11-12' }));
  });
  it('本地失败不回填旧date/比例、不假装成功，异步pending日期禁改', async () => {
    let reject!: (error: Error) => void;
    const callback = vi.fn(() => new Promise<void>((_, no) => { reject = no; }));
    const h = harness({ dev: true, onPreviewDownsideChange: callback });
    h.change('percent', '0'); h.change('start-date', '2026-11-01'); const saving = h.save();
    expect(h.field('start-date').props.disabled).toBe(true); h.change('start-date', '2027-01-01');
    reject(new Error('本地版本冲突')); await saving;
    expect(h.field('start-date').props.value).toBe('2026-11-01'); expect(h.field('percent').props.value).toBe('0');
    expect(h.scope.toast.success).not.toHaveBeenCalled(); expect(h.mutation.mutate).not.toHaveBeenCalled();
  });
  it('成功提示按选定日期重算而非按保存时刻', () => {
    const h = harness(); h.render(); h.success();
    expect(h.scope.toast.success).toHaveBeenCalledWith('欠保证金规则已保存到正式账目，将从选定启用日期起重算可核验的日结和客户收益；缺少历史证据的记录保留待核验');
  });
  it('正式环境明确写入正式账目，点击仅发mutation，服务端成功前不显示已保存', async () => {
    const previewSave = vi.fn(); const h = harness({ onPreviewDownsideChange: previewSave });
    expect(text(h.render())).toContain('保存到正式账目');
    expect(text(h.render())).toContain('保存会写入37号正式账目');
    expect(text(h.render())).not.toContain('本地预览规则已保存');
    await h.save();
    expect(h.mutation.mutate).toHaveBeenCalledOnce();
    expect(previewSave).not.toHaveBeenCalled();
    expect(h.scope.toast.success).not.toHaveBeenCalled();
    h.success({ baselineStatus: 'ready' });
    expect(h.scope.toast.success.mock.calls[0][0]).toContain('已保存到正式账目');
    expect(h.scope.toast.success.mock.calls[0][0]).toContain('保留待核验');
  });
  it('正式未来pending只确认规则保存，不宣称历史已经重算', () => {
    const h = harness(); h.render(); h.success({ baselineStatus: 'pending' });
    expect(h.scope.toast.success).toHaveBeenCalledWith('规则已保存到正式账目，等待启用日期与可核验历史基准；尚未重算');
  });
});

describe('R1父页本地预览回调：完整日期与CAS版本接线', () => {
  const portfolioSource = readFileSync(new URL('../pages/StockTagPortfolio.tsx', import.meta.url), 'utf8');
  const portfolioAst = ts.createSourceFile('StockTagPortfolio.tsx', portfolioSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  function actualPreviewCallback(scope: Record<string, any>) {
    let expression: ts.Expression | undefined;
    function visit(node: ts.Node) {
      if (ts.isJsxAttribute(node) && node.name.getText(portfolioAst) === 'onPreviewDownsideChange' && node.initializer && ts.isJsxExpression(node.initializer)) expression = node.initializer.expression;
      ts.forEachChild(node, visit);
    }
    visit(portfolioAst);
    if (!expression) throw new Error('Missing real portfolio preview callback');
    const js = ts.transpileModule(`const callback = ${expression.getText(portfolioAst)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
    return new Function(...Object.keys(scope), `${js}; return callback;`)(...Object.values(scope));
  }
  it('只显式本地预览+非代看允许callback，date/0值原样传递不临时篡改expectedVersion', async () => {
    const save = vi.fn().mockResolvedValue(undefined), invalidate = vi.fn().mockResolvedValue(undefined);
    const scope = { isLocalHotPreview: true, ruleViewingAs: false, downsidePreview: { rules: { 11: { version: 8 } }, save }, utils: { invalidate } };
    const callback = actualPreviewCallback(scope);
    const values = { enabled: true, thresholdPrice: 10, downsidePercent: 0, startDate: '2026-11-01', expectedVersion: 4 };
    await callback(11, values);
    expect(save).toHaveBeenCalledWith(11, values); expect(save.mock.calls[0][1]).toBe(values);
    expect(invalidate).toHaveBeenCalledOnce();
    for (const patch of [{ isLocalHotPreview: false }, { ruleViewingAs: true }, { downsidePreview: undefined }]) expect(actualPreviewCallback({ ...scope, ...patch })).toBeUndefined();
  });
  it('local CAS失败不自动重试、不覆盖version、不刷新误导成功', async () => {
    const save = vi.fn().mockRejectedValue(new Error('本地版本冲突')), invalidate = vi.fn();
    const callback = actualPreviewCallback({ isLocalHotPreview: true, ruleViewingAs: false, downsidePreview: { rules: { 11: { version: 8 } }, save }, utils: { invalidate } });
    const values = { enabled: true, thresholdPrice: 10, downsidePercent: 30, startDate: '2026-11-01', expectedVersion: 4 };
    await expect(callback(11, values)).rejects.toThrow('本地版本冲突');
    expect(save).toHaveBeenCalledOnce(); expect(save).toHaveBeenCalledWith(11, values); expect(invalidate).not.toHaveBeenCalled();
  });
});

describe('启用日期与可核验基准等待状态', () => {
  it('未来日期仍允许保存但先提示不立即按新规则计入', async () => {
    const h = harness(); h.change('start-date', '2027-01-01');
    expect(text(h.render())).toContain('所选启用日期尚未到达');
    expect(text(h.render())).toContain('不会立即按新规则计入');
    await h.save(); expect(h.mutation.mutate).toHaveBeenCalledWith(expect.objectContaining({ startDate: '2027-01-01' }));
  });
  it('savedRule.pending即使误带旧计入价也显示待更新且明确尚未重算', () => {
    for (const options of [
      { queryData: { lotId: 11, version: 3, enabled: true, thresholdPrice: 10, downsidePercent: 30, startDate: '2027-01-01', baselineStatus: 'pending' } },
      { dev: true, rule: { lotId: 11, version: 3, enabled: true, thresholdPrice: 10, downsidePercent: 30, startDate: '2026-11-01', baselineStatus: 'pending' } },
    ]) {
      const h = harness(options);
      expect(text(h.render())).toContain('等待启用日期与可核验历史基准；尚未重算日结和客户收益');
      const prices = nodes(h.render()).find(node => String(node.props?.className ?? '').includes('rounded-lg bg-[#FFF5F5]'));
      expect(text(prices.props.children[0])).toContain('US$9');
      expect(text(prices.props.children[1])).toContain('待更新');
    }
  });
  it('API保存pending只提示规则已存和等待，不声称日结或客户收益已经重算', () => {
    const h = harness(); h.render(); h.success({ baselineStatus: 'pending' });
    expect(h.scope.toast.success).toHaveBeenCalledWith('规则已保存到正式账目，等待启用日期与可核验历史基准；尚未重算');
    expect(h.invalidateAll).not.toHaveBeenCalled();
    expect(h.invalidates.getStockTagCalendar).toHaveBeenCalledOnce();
    expect(h.invalidates.getMyLedger37AiStockPool).toHaveBeenCalledOnce();
  });
});
