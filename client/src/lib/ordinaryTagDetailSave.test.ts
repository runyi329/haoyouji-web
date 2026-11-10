import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  buildOrdinaryDetailSavePlan, detailObservationEqual, ordinaryDetailIsChanged, saveOrdinaryDetail,
  type DetailEntry, type DetailSnapshot, type DetailSaveDependencies,
} from './ordinaryTagDetailSave';
import { clearedOrdinaryConfig, ordinaryClearRequest, type OrdinaryClearImpact } from './ordinaryTagMemberClear';
const target = { ledgerId: 37, targetUserId: 201, categoryId: 9, tagName: '普通' };
const entry = (): DetailEntry => ({ amount: '1000', ratio: '20', targetAmount: '200', startDate: '2026-01-01', pauseDate: '', endDate: '', visible: true, pauseHistory: [], margins: [], legacyMarginNoteIds: [] });
const snapshot = (): DetailSnapshot => ({ entry: entry(), observation: { enabled: false, initialAmount: '', ratio: '', startDate: '', pauseDate: '' } });
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const build = (current: DetailSnapshot, saved = snapshot()) => buildOrdinaryDetailSavePlan({ target, current, saved });
const deps = (): DetailSaveDependencies => ({ inFlight: new Set(), confirm: vi.fn(() => true), saveObservation: vi.fn(async () => ({})), saveConfig: vi.fn(async () => ({})), saveWalletPlan: vi.fn(async () => ({})), onObservationSaved: vi.fn(), onConfigSaved: vi.fn(), onWalletSaved: vi.fn() });

describe('ordinary detail baseline and narrow request', () => {
  it('initial opening and changing back are not dirty', () => {
    const saved = snapshot(); const current = clone(saved);
    expect(ordinaryDetailIsChanged(current, saved)).toBe(false);
    current.entry.ratio = '21'; current.entry.targetAmount = '210'; expect(ordinaryDetailIsChanged(current, saved)).toBe(true);
    current.entry.ratio = '20.00'; current.entry.targetAmount = '200.00'; current.entry.amount = '1000.0';
    expect(ordinaryDetailIsChanged(current, saved)).toBe(false); expect(build(current).configRequest).toBeNull();
  });
  it('empty historical ratio/target zero display fallbacks are not edits', () => {
    const saved = snapshot(); saved.entry = { ...saved.entry, amount: '', ratio: '', targetAmount: '' };
    const current = clone(saved); current.entry.ratio = '0'; current.entry.targetAmount = '0';
    expect(ordinaryDetailIsChanged(current, saved)).toBe(false);
  });
  it('unsaved observer on/off seeds do not count as a persisted change', () => {
    const saved = snapshot(), current = clone(saved);
    current.observation = { enabled: false, initialAmount: '1000', ratio: '20', startDate: '2026-01-01', pauseDate: '' };
    expect(ordinaryDetailIsChanged(current, saved)).toBe(false);
    expect(build(current).observationRequest).toBeNull();
  });
  it('any two disabled states ignore inactive references symmetrically in dirty and saving', async () => {
    const variants = [snapshot().observation,
      { enabled: false, initialAmount: '10000', ratio: '100', startDate: '2026-11-11', pauseDate: '' },
      { enabled: false, initialAmount: 'NaN', ratio: '-1', startDate: 'bad', pauseDate: 'Infinity' }];
    for (const a of variants) for (const b of variants) {
      expect(detailObservationEqual(a, b)).toBe(true);
      const saved = { ...snapshot(), observation: b }, current = { ...snapshot(), observation: a };
      expect(ordinaryDetailIsChanged(current, saved)).toBe(false);
      const plan = build(current, saved), d = deps();
      expect(plan.observationRequest).toBeNull(); expect(plan.configRequest).toBeNull();
      await expect(saveOrdinaryDetail(plan, d)).resolves.toBe(true);
      expect(d.saveObservation).not.toHaveBeenCalled(); expect(d.saveConfig).not.toHaveBeenCalled();
    }
  });
  it('actual detail edits save despite blank disabled on/off observation draft', async () => {
    const saved = snapshot(), current = clone(saved), d = deps();
    current.entry.ratio = '125.5'; current.entry.targetAmount = '1255';
    current.observation = { ...current.observation, startDate: '2026-11-11' };
    const plan = build(current, saved);
    expect(plan.observationRequest).toBeNull();
    await saveOrdinaryDetail(plan, d);
    expect(d.saveConfig).toHaveBeenCalledTimes(1); expect(d.saveObservation).not.toHaveBeenCalled();
  });
  it('closing persisted enabled observation submits saved disabled references even with empty draft, never restores actual', async () => {
    const saved = snapshot(); saved.entry.ratio = '0'; saved.entry.targetAmount = '0';
    saved.observation = { enabled: true, initialAmount: '10000', ratio: '100', startDate: '2026-11-11', pauseDate: '' };
    const current = clone(saved); current.observation = snapshot().observation;
    expect(ordinaryDetailIsChanged(current, saved)).toBe(true);
    const plan = build(current, saved), d = deps();
    expect(plan.observationRequest?.config).toEqual({ enabled: false, initialAmount: 10000, ratio: 100, startDate: '2026-11-11', pauseDate: null });
    expect(plan.configRequest).toBeNull();
    await saveOrdinaryDetail(plan, d);
    expect(d.saveObservation).toHaveBeenCalledTimes(1); expect(d.saveConfig).not.toHaveBeenCalled();
    expect(d.confirm).not.toHaveBeenCalled();
  });
  it('normalizes numeric observation references but detects real fields', () => {
    const saved = snapshot(); saved.observation = { enabled: true, initialAmount: '1000', ratio: '20', startDate: '2026-01-01', pauseDate: '' };
    const current = clone(saved); current.observation.ratio = '20.00'; expect(ordinaryDetailIsChanged(current, saved)).toBe(false);
    current.observation.pauseDate = '2026-02-01'; expect(ordinaryDetailIsChanged(current, saved)).toBe(true);
  });
  it('date-only payload sends one scoped key, never defaults or another tag/member', () => {
    const current = snapshot(); current.entry.startDate = '2026-02-01';
    expect(build(current).configRequest).toEqual({ ledgerId: 37, targetUserId: 201, scopedOrdinaryCategoryId: 9, migratedMarginNoteIds: [], balances: { 普通__startDate: '2026-02-01' } });
  });
  it('explicitly persists empty dates instead of reviving the old start', () => {
    const current = snapshot(); current.entry.startDate = '';
    expect(build(current).configRequest?.balances).toEqual({ 普通__startDate: '' });
    const saved = clone(current); current.entry.ratio = '21'; current.entry.targetAmount = '210';
    expect(build(current, saved).configRequest?.balances).toEqual({ 普通: 1000, 普通__ratio: 21, 普通__targetAmount: 210 });
  });
  it('actual triplet above 100 emits exactly three scoped keys with no other-member dependency', async () => {
    const current = snapshot(); current.entry.ratio = '125.5'; current.entry.targetAmount = '1255';
    const plan = build(current);
    expect(plan.configRequest).toEqual({ ledgerId: 37, targetUserId: 201, scopedOrdinaryCategoryId: 9, migratedMarginNoteIds: [], balances: { 普通: 1000, 普通__ratio: 125.5, 普通__targetAmount: 1255 } });
    const d = deps(); expect(await saveOrdinaryDetail(plan, d)).toBe(true);
    expect(d.saveConfig).toHaveBeenCalledWith(plan.configRequest); expect(d.saveObservation).not.toHaveBeenCalled();
    const helper = readFileSync(new URL('./ordinaryTagDetailSave.ts', import.meta.url), 'utf8');
    expect(helper).not.toContain('otherSavedRatio'); expect(helper).not.toContain('100.00000001');
  });
  it('visible is detected but kept on its own independently confirmed save path', () => {
    const current = snapshot(); current.entry.visible = false;
    expect(ordinaryDetailIsChanged(current, snapshot())).toBe(true);
    expect(build(current).configRequest).toBeNull();
  });
  it('materializes selected and still-open pending pause plans on the first save', () => {
    for (const key of ['plan', 'pendingPlan'] as const) {
      const current = snapshot(); current[key] = { userId: 201, tagName: '普通', pauseDate: '2026-03-01', action: 'retain' };
      expect(ordinaryDetailIsChanged(current, snapshot())).toBe(true);
      expect(build(current).configRequest?.balances).toEqual({ 普通__pauseHistory: '[{"pauseDate":"2026-03-01"}]', 普通__pauseDate: '2026-03-01' });
    }
  });
  it('same plan moved from pending to selected is not an actual difference', () => {
    const saved = snapshot(); saved.plan = { userId: 201, tagName: '普通', pauseDate: '2026-03-01', action: 'retain' };
    const current = clone(saved); current.pendingPlan = current.plan; current.plan = null;
    expect(ordinaryDetailIsChanged(current, saved)).toBe(false);
    current.pendingPlan!.action = 'release_wallet_holds'; expect(ordinaryDetailIsChanged(current, saved)).toBe(true);
  });
  it('preserves pause metadata and clears legacy paused field on resume', () => {
    const saved = snapshot(); saved.entry.pauseHistory = [{ pauseDate: '2026-02-01' }];
    const current = clone(saved); current.entry.pauseHistory[0].resumeDate = '2026-03-01';
    expect(build(current, saved).configRequest?.balances).toEqual({ 普通__pauseHistory: '[{"pauseDate":"2026-02-01","resumeDate":"2026-03-01"}]', 普通__pauseDate: '' });
  });
  it('observer enable writes zero real ratio/target only through observation endpoint and never its start as actual', () => {
    const current = snapshot(); current.observation = { enabled: true, initialAmount: '2000', ratio: '40', startDate: '2026-06-01', pauseDate: '' };
    current.entry.ratio = '60'; current.entry.targetAmount = '600'; current.entry.endDate = '2026-08-01';
    const plan = build(current);
    expect(plan.observationRequest?.config.enabled).toBe(true);
    expect(plan.entry.ratio).toBe('0'); expect(plan.entry.targetAmount).toBe('0');
    expect(plan.configRequest?.balances).toEqual({ 普通__endDate: '2026-08-01' });
  });
  it('only changed margin contents emit all compatible margin keys without deleting legacy notes', () => {
    const saved = snapshot(); saved.entry.margins = [{ id: 'm1', coin: 'CNY', amount: '20', notes: [] }]; saved.entry.legacyMarginNoteIds = [777];
    const current = clone(saved); current.entry.margins[0].amount = '20.00'; expect(build(current, saved).configRequest).toBeNull();
    current.entry.margins[0].notes.push({ id: 'n', content: '备注', createdAt: '' });
    const request = build(current, saved).configRequest!;
    expect(Object.keys(request.balances).sort()).toEqual(['普通__margin', '普通__marginCoin', '普通__margins']);
    expect(request.migratedMarginNoteIds).toEqual([]);
  });
});

describe('complete validation before first write', () => {
  it.each([
    ['initialAmount', '观察初始金额未填写'], ['ratio', '观察比例未填写'], ['startDate', '观察开始日期未填写'],
  ] as const)('enabled blank %s rejects with its specific field before any write', async (field, message) => {
    const current = snapshot(), d = deps();
    current.observation = { enabled: true, initialAmount: '10000', ratio: '100', startDate: '2026-11-11', pauseDate: '', [field]: '' };
    current.entry.startDate = '2026-02-01';
    await expect(async () => saveOrdinaryDetail(build(current), d)).rejects.toThrow(message);
    expect(d.saveObservation).not.toHaveBeenCalled(); expect(d.saveConfig).not.toHaveBeenCalled(); expect(d.saveWalletPlan).not.toHaveBeenCalled();
  });
  it('enabled future start and over-100 observation ratio remain legal', () => {
    const current = snapshot(); current.observation = { enabled: true, initialAmount: '10000', ratio: '125.5', startDate: '2026-11-11', pauseDate: '' };
    expect(build(current).observationRequest?.config.ratio).toBe(125.5);
  });
  it('full clearing is rejected before any observation/config request and requires separate confirmation', () => {
    const current = snapshot(); current.entry = { ...current.entry, amount: '0', ratio: '0', targetAmount: '0', startDate: '' };
    expect(() => build(current)).toThrow('完整清空');
    const saved = clone(current); current.entry.startDate = '2026-04-01';
    expect(build(current, saved).configRequest?.balances).toEqual({ 普通__startDate: '2026-04-01' });
  });
  it.each(['', '.', '-1', 'NaN'])('invalid amount %s fails before observation can be saved', amount => {
    const current = snapshot(); current.entry.amount = amount; current.observation = { enabled: false, initialAmount: '1000', ratio: '20', startDate: '2026-01-01', pauseDate: '' };
    expect(() => build(current)).toThrow();
  });
  it.each(['', '.', '-1', 'NaN', 'Infinity', '-Infinity'])('invalid individual ratio %s still rejects before writes', ratio => {
    const current = snapshot(); current.entry.ratio = ratio;
    expect(() => build(current)).toThrow();
  });
  it('finite operands whose allocation formula overflows reject', () => {
    const current = snapshot(); current.entry = { ...current.entry, amount: '1e308', ratio: '200', targetAmount: '1e308' };
    expect(() => build(current)).toThrow('溢出');
  });
  it('invalid changed date, pause chronology and margin reject before writes', () => {
    let current = snapshot(); current.entry.startDate = '2026-02-30'; expect(() => build(current)).toThrow('有效日期');
    current = snapshot(); current.entry.pauseHistory = [{ pauseDate: '2026-03-01', resumeDate: '2026-02-01' }]; expect(() => build(current)).toThrow('顺序');
    current = snapshot(); current.entry.margins = [{ id: 'm', coin: 'CNY', amount: '-', notes: [] }]; expect(() => build(current)).toThrow('金额');
  });
  it('protects global pause and settled history', () => {
    for (const protect of [{ pauseSource: 'tag_global' }, { pauseSettlement: { settlementNo: 'done' } }]) {
      const saved = snapshot(); saved.entry.pauseHistory = [{ pauseDate: '2026-03-01', ...protect }];
      const current = clone(saved); current.entry.pauseHistory = [];
      expect(() => build(current, saved)).toThrow('不可修改');
    }
  });
  it('rejects wrong user/tag pending plan', () => {
    const current = snapshot(); current.pendingPlan = { userId: 202, tagName: '其他', pauseDate: '2026-03-01', action: 'retain' };
    expect(() => build(current)).toThrow('暂停方案');
  });
});

describe('sequential acknowledgements and retry', () => {
  it('only this selected row is saved; lock prevents duplicate click including confirmation', async () => {
    const current = snapshot(); current.entry.startDate = '2026-02-01';
    const d = deps(); let release!: () => void;
    d.saveConfig = vi.fn(() => new Promise(resolve => { release = () => resolve({}); }));
    const plan = build(current); const first = saveOrdinaryDetail(plan, d);
    expect(await saveOrdinaryDetail(plan, d)).toBe(false); expect(d.saveConfig).toHaveBeenCalledTimes(1);
    release(); expect(await first).toBe(true); expect(d.inFlight.size).toBe(0);
  });
  it('cancel observation confirmation writes nothing', async () => {
    const current = snapshot(); current.observation = { enabled: true, initialAmount: '1000', ratio: '20', startDate: '2026-03-01', pauseDate: '' };
    const d = deps(); d.confirm = () => false;
    expect(await saveOrdinaryDetail(build(current), d)).toBe(false);
    expect(d.saveObservation).not.toHaveBeenCalled(); expect(d.saveConfig).not.toHaveBeenCalled();
  });
  it('observation succeeded, config failed: retry skips conversion and never restores stale ratio', async () => {
    const current = snapshot(); current.observation = { enabled: true, initialAmount: '1000', ratio: '20', startDate: '2026-05-01', pauseDate: '' }; current.entry.startDate = '2026-02-01';
    const saved = snapshot(), d = deps();
    d.onObservationSaved = plan => { saved.observation = clone(plan.observation); saved.entry.ratio = '0'; saved.entry.targetAmount = '0'; current.entry.ratio = '0'; current.entry.targetAmount = '0'; };
    d.saveConfig = vi.fn(async () => { throw new Error('配置失败'); });
    await expect(saveOrdinaryDetail(build(current, saved), d)).rejects.toThrow('部分已保存');
    const retry = build(current, saved); expect(retry.observationRequest).toBeNull(); expect(retry.configRequest?.balances).toEqual({ 普通__startDate: '2026-02-01' });
    expect(d.saveObservation).toHaveBeenCalledTimes(1); expect(d.saveWalletPlan).not.toHaveBeenCalled();
  });
  it('config succeeded wallet failed: retry skips config; acknowledged wallet is removed and never repeated', async () => {
    const current = snapshot(), saved = snapshot(), d = deps(); current.pendingPlan = { userId: 201, tagName: '普通', pauseDate: '2026-03-01', action: 'settle_and_release' };
    d.onConfigSaved = plan => { saved.entry = clone(plan.entry); current.entry = clone(plan.entry); };
    d.saveWalletPlan = vi.fn(async () => { throw new Error('资金失败'); });
    await expect(saveOrdinaryDetail(build(current, saved), d)).rejects.toThrow('部分已保存');
    const retry = build(current, saved); expect(retry.configRequest).toBeNull(); expect(retry.walletPlan?.action).toBe('settle_and_release');
    d.saveWalletPlan = vi.fn(async () => ({})); d.onWalletSaved = () => { current.pendingPlan = null; current.plan = null; };
    await saveOrdinaryDetail(retry, d); expect(ordinaryDetailIsChanged(current, saved)).toBe(false);
    expect(build(current, saved).walletPlan).toBeNull(); expect(d.saveConfig).toHaveBeenCalledTimes(1);
  });
});

describe('staged clear uses a dedicated receipt-validated first segment', () => {
  const clearTarget = { ...target, memberName: '当前成员' };
  const impact: OrdinaryClearImpact = { ledgerId: 37, userId: 201, categoryId: 9, categoryName: '普通', affectedDays: 1,
    firstDate: '2026-01-01', lastDate: '2026-01-01', impactHash: 'a'.repeat(64), hasConfiguredStartDate: true };
  const staged = (): DetailSnapshot => ({ ...snapshot(), entry: { ...entry(), ...clearedOrdinaryConfig() }, pendingClear: clearTarget });
  const receipt = () => ({ success: true, ledgerId: 37, userId: 201, categoryId: 9, cleared: clearedOrdinaryConfig() });
  const clearPlan = (current = staged(), saved = snapshot()) => buildOrdinaryDetailSavePlan({ target, current, saved,
    clearRequest: ordinaryClearRequest(clearTarget, impact) });
  const clearDeps = (): DetailSaveDependencies => ({ ...deps(), saveClear: vi.fn(async () => receipt()), onClearSaved: vi.fn() });

  it('pending alone remains dirty even when the four baseline fields were already zero', () => {
    const current = staged(), saved = clone(current); saved.pendingClear = null;
    expect(ordinaryDetailIsChanged(current, saved)).toBe(true);
    current.pendingClear = null; expect(ordinaryDetailIsChanged(current, saved)).toBe(false);
  });
  it('pending requires a fresh validated request; unconfirmed/changed scope, fields or observation cannot use the clear path', () => {
    expect(() => build(staged())).toThrow('重新读取并验证影响');
    const cases = [
      { ...staged(), pendingClear: null },
      { ...staged(), pendingClear: { ...clearTarget, targetUserId: 202 } },
      { ...staged(), pendingClear: { ...clearTarget, categoryId: 10 } },
      { ...staged(), pendingClear: { ...clearTarget, tagName: '其他标签' } },
      { ...staged(), entry: { ...staged().entry, amount: '1' } },
      { ...staged(), entry: { ...staged().entry, startDate: '2026-02-01' } },
      { ...staged(), observation: { ...snapshot().observation, enabled: true } },
    ];
    for (const current of cases) expect(() => clearPlan(current)).toThrow('待清空已失效');
    const saved = snapshot(); saved.observation.enabled = true;
    expect(() => clearPlan(staged(), saved)).toThrow('待清空已失效');
  });
  it('clear-only sends one exact scoped request, no ordinary config POST or second confirmation, then acknowledges', async () => {
    const current = staged(), saved = snapshot(), before = clone(saved), d = clearDeps();
    const plan = clearPlan(current, saved);
    expect(saved).toEqual(before); expect(plan.configRequest).toBeNull(); expect(plan.observationRequest).toBeNull();
    expect(await saveOrdinaryDetail(plan, d)).toBe(true);
    expect(d.saveClear).toHaveBeenCalledOnce(); expect(d.saveClear).toHaveBeenCalledWith({ ledgerId: 37, targetUserId: 201, categoryId: 9, impactHash: 'a'.repeat(64) });
    expect(d.onClearSaved).toHaveBeenCalledOnce(); expect(d.onClearSaved).toHaveBeenCalledWith(plan);
    expect(d.confirm).not.toHaveBeenCalled(); expect(d.saveConfig).not.toHaveBeenCalled();
    expect(d.saveObservation).not.toHaveBeenCalled(); expect(d.saveWalletPlan).not.toHaveBeenCalled();
    expect(d.inFlight.size).toBe(0);
  });
  it.each(['scope', 'success', 'amount', 'ratio', 'targetAmount', 'startDate', 'empty'] as const)('invalid %s receipt prevents ack/cache and all later segments, preserving pending', async kind => {
    const current = staged(), saved = snapshot(); current.entry.endDate = '2026-08-01';
    const before = clone(current), baseline = clone(saved), cache = { untouched: true }, d = clearDeps();
    const bad: any = receipt();
    if (kind === 'scope') bad.userId = 202;
    else if (kind === 'success') bad.success = false;
    else if (kind !== 'empty') bad.cleared[kind] = kind === 'startDate' ? '2026-01-01' : '1';
    d.saveClear = vi.fn(async () => kind === 'empty' ? {} : bad);
    d.onClearSaved = vi.fn(() => { saved.entry = { ...saved.entry, ...clearedOrdinaryConfig() }; current.pendingClear = null; cache.untouched = false; });
    await expect(saveOrdinaryDetail(clearPlan(current, saved), d)).rejects.toThrow('回执');
    expect(d.saveClear).toHaveBeenCalledOnce(); expect(d.onClearSaved).not.toHaveBeenCalled();
    expect(d.saveConfig).not.toHaveBeenCalled(); expect(d.onConfigSaved).not.toHaveBeenCalled();
    expect(current).toEqual(before); expect(saved).toEqual(baseline); expect(cache.untouched).toBe(true);
    expect(ordinaryDetailIsChanged(current, saved)).toBe(true); expect(d.inFlight.size).toBe(0);
  });
  it('clear failure preserves draft/baseline and skips all later writes', async () => {
    const current = staged(), saved = snapshot(), d = clearDeps(); current.entry.endDate = '2026-08-01';
    const before = clone(current), baseline = clone(saved);
    d.saveClear = vi.fn(async () => { throw new Error('清空失败'); });
    await expect(saveOrdinaryDetail(clearPlan(current, saved), d)).rejects.toThrow('保存未完成；清空失败');
    expect(d.onClearSaved).not.toHaveBeenCalled(); expect(d.saveConfig).not.toHaveBeenCalled();
    expect(current).toEqual(before); expect(saved).toEqual(baseline); expect(d.inFlight.size).toBe(0);
  });
  it('forged request or missing clear capability rejects before observation/config/wallet can write', async () => {
    for (const invalid of ['forged', 'missingSave', 'missingAck'] as const) {
      const plan = clearPlan(), d = clearDeps();
      plan.configRequest = { ledgerId: 37, targetUserId: 201, scopedOrdinaryCategoryId: 9, migratedMarginNoteIds: [], balances: { 普通__endDate: '2026-08-01' } };
      if (invalid === 'forged') plan.clearRequest = { ...plan.clearRequest! };
      if (invalid === 'missingSave') delete d.saveClear;
      if (invalid === 'missingAck') delete d.onClearSaved;
      await expect(saveOrdinaryDetail(plan, d)).rejects.toThrow(invalid === 'forged' ? '未经有效预检' : '能力不可用');
      expect(d.saveConfig).not.toHaveBeenCalled(); expect(d.saveObservation).not.toHaveBeenCalled(); expect(d.saveWalletPlan).not.toHaveBeenCalled();
      expect(d.inFlight.size).toBe(0);
    }
  });
  it('acknowledges clear before remaining config; later failure keeps pause/margin draft and retry never repeats clear', async () => {
    const current = staged(), saved = snapshot(), d = clearDeps(), events: string[] = [];
    current.entry.endDate = '2026-08-01';
    current.pendingPlan = { userId: 201, tagName: '普通', pauseDate: '2026-03-01', action: 'retain' };
    current.entry.margins = [{ id: 'draft-margin', coin: 'CNY', amount: '10', notes: [{ id: 'n', content: '保留备注', createdAt: '' }] }];
    d.saveClear = vi.fn(async () => { events.push('clear'); return receipt(); });
    d.onClearSaved = vi.fn(() => { events.push('clearAck'); saved.entry = { ...saved.entry, ...clearedOrdinaryConfig() }; current.pendingClear = null; });
    d.saveConfig = vi.fn(async () => { events.push('config'); throw new Error('其余配置失败'); });
    const plan = clearPlan(current, saved);
    expect(Object.keys(plan.configRequest!.balances).sort()).toEqual(['普通__endDate', '普通__margin', '普通__marginCoin', '普通__margins', '普通__pauseDate', '普通__pauseHistory']);
    await expect(saveOrdinaryDetail(plan, d)).rejects.toThrow('部分已保存；其余配置失败');
    expect(events).toEqual(['clear', 'clearAck', 'config']); expect(current.pendingClear).toBeNull();
    expect(current.entry.margins[0].notes[0].content).toBe('保留备注'); expect(current.pendingPlan?.action).toBe('retain');
    expect(saved.entry.pauseHistory).toEqual([]); expect(saved.entry.margins).toEqual([]); expect(ordinaryDetailIsChanged(current, saved)).toBe(true);
    const retry = build(current, saved); expect(retry.clearRequest).toBeNull();
    d.saveConfig = vi.fn(async () => ({}));
    d.onConfigSaved = acknowledged => { saved.entry = clone(acknowledged.entry); current.entry = clone(acknowledged.entry); };
    d.onWalletSaved = () => { current.pendingPlan = null; current.plan = null; };
    expect(await saveOrdinaryDetail(retry, d)).toBe(true); expect(d.saveClear).toHaveBeenCalledOnce();
    expect(d.confirm).not.toHaveBeenCalled(); expect(d.saveWalletPlan).not.toHaveBeenCalled(); expect(ordinaryDetailIsChanged(current, saved)).toBe(false);
  });
});

describe('page integration safety contracts (offline)', () => {
  const source = readFileSync(new URL('../pages/LedgerAAInitialBalance.tsx', import.meta.url), 'utf8');
  it('detail hides top save, uses current-user detail save and single bottom label', () => {
    expect(source).toContain('renderOrdinaryTagEditor(userId, category, member, true)');
    expect(source).toMatch(/if \(isOrdinaryDetail\) \{\s*if \(await handleSaveOrdinaryDetail\(userId, category\)\) \{\s*setTagEditModal\(null\);\s*setTargetTotalInput\(''\);\s*\}\s*return;/);
    expect(source).toContain("{isSaving ? '保存中...' : '保存'}");
    expect(source).toContain('|| !detailChanged');
  });
  it('clear impact is disabled until click, checks eligibility and uses fresh response', () => {
    const block = source.slice(source.indexOf('const ordinaryClearImpactQuery'), source.indexOf('const [activeStockParticipationCategoryId'));
    expect(block).toContain('enabled: false');
    expect(block.indexOf('ordinaryClearGate.observationBlocked')).toBeLessThan(block.indexOf('await ordinaryClearImpactQuery.refetch()'));
    expect(block).toContain('impact: fresh.data'); expect(block).toContain('ordinaryClearPreflightInFlight.current.add(scope)');
    expect(block).not.toContain('impact: ordinaryClearImpactQuery.data');
  });
  it('previews reject explicit wallet plans before first save; existing wallet mutations remain separate', () => {
    const block = source.slice(source.indexOf('const handleSaveOrdinaryDetail'), source.indexOf('const renderOrdinaryTagSaveControls'));
    expect(block.indexOf('capabilities?.walletActions === false')).toBeLessThan(block.indexOf('await saveOrdinaryDetail'));
    expect(block.indexOf('hasPendingWalletAction')).toBeLessThan(block.indexOf('await saveOrdinaryDetail'));
    expect(block).not.toContain('setMutation.mutateAsync');
    expect(block).not.toContain('handleSaveOrdinaryTag(');
    expect(block).not.toContain('setDirtyUsers(');
  });
});
