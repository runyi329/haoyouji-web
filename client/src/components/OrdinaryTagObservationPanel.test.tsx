import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const state = vi.hoisted(() => ({ data: undefined as any, error: undefined as any, inputs: [] as any[] }));
vi.mock('@/lib/trpc', () => ({ trpc: { ledger: { getMyOrdinaryTagObservationOverview: { useQuery: (input: any, options: any) => { state.inputs.push({ input, options }); return { data: state.data, error: state.error, isFetching: false, refetch: vi.fn() }; } } } } }));
import OrdinaryTagObservationPanel from './OrdinaryTagObservationPanel';
const summary = (userId = 11, categoryId = 21, totalPnl: number | null = 80) => ({ ledgerId: 37, userId, categoryId, categoryName: `标签${categoryId}`, config: { enabled: true, initialAmount: 1000, ratio: 10, startDate: '2026-11-01', pauseDate: null }, status: totalPnl === null ? 'no_data' : 'active', latestDate: '2026-11-06', latestBalance: 200, capitalChange: 0, withdrawTotal: 0, totalPnl, todayPnl: 3, points: [] });
const render = (userId = 11, categoryId?: number) => renderToStaticMarkup(createElement(OrdinaryTagObservationPanel, { ledgerId: 37, userId, categoryId }));
describe('普通标签观察面板', () => {
  beforeEach(() => { state.data = undefined; state.error = undefined; state.inputs.length = 0; });
  it('无配置时不插入虚构的观察金额', () => { state.data = { userId: 11, observations: [] }; expect(render()).toBe(''); });
  it('绑定当前用户查询并独立标记非实账', () => { state.data = { userId: 11, observations: [summary()] }; const html = render(); expect(html).toContain('观察账户'); expect(html).toContain('不计入实账'); expect(html).toContain('+¥80.00'); expect(state.inputs[0].input.viewAsUserId).toBe(11); expect(state.inputs[0].options.retry).toBe(false); });
  it('切换身份拒绝显示旧用户响应', () => { state.data = { userId: 11, observations: [summary()] }; expect(render(12)).toBe(''); });
  it('响应中夹带第三人行也不可展示', () => { state.data = { userId: 11, observations: [summary(12)] }; expect(render()).toBe(''); });
  it('单标签仅展示该标签观察，禁用配置不会混入', () => { const disabled = summary(11, 23); disabled.config.enabled = false; state.data = { userId: 11, observations: [summary(), summary(11, 22), disabled] }; const html = render(11, 21); expect(html).toContain('标签21'); expect(html).not.toContain('标签22'); expect(html).not.toContain('标签23'); });
  it('无真实余额记录显示缺失而不是零回报', () => { state.data = { userId: 11, observations: [summary(11, 21, null)] }; const html = render(); expect(html).toContain('暂无余额记录'); expect(html).toContain('—'); expect(html).not.toContain('¥0.00'); });
  it('读取失败提供重试而不假装无数据', () => { state.error = new Error('读取失败'); const html = render(); expect(html).toContain('观察数据读取失败'); expect(html).toContain('重试'); });
  it('非37号不展示观察入口', () => { state.data = { userId: 11, observations: [summary()] }; expect(renderToStaticMarkup(createElement(OrdinaryTagObservationPanel, { ledgerId: 52, userId: 11 }))).toBe(''); });
});
