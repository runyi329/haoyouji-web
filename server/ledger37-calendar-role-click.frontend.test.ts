import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { canRecordLedger37Calendar } from '../shared/ledger37-permissions';
import { getBeijingLedgerRecordToday } from '../shared/ledger-record-date';

const read = (path: string) => readFileSync(new URL(`../client/src/${path}`, import.meta.url), 'utf8');
const aa = read('pages/LedgerDetailAA.tsx');
const recorder = read('components/Ledger37CalendarRecorder.tsx');
const dialog = read('components/Ledger37CalendarNumberDialog.tsx');
const main = read('main.tsx');
function bind(expression: string, bindings: Record<string, any>) {
  const code = ts.transpileModule(`const actual = ${expression};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  return new Function(...Object.keys(bindings), `${code}; return actual;`)(...Object.values(bindings));
}
function sourceAst(source: string) {
  return ts.createSourceFile('actual.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}
function actual(source: string, name: string, bindings: Record<string, any>) {
  const ast = sourceAst(source); let expression = '';
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) expression = node.initializer!.getText(ast);
    ts.forEachChild(node, visit);
  };
  visit(ast);
  if (!expression) throw new Error(`Missing actual expression ${name}`);
  return bind(expression, bindings);
}
function handlers(source: string, marker: string, bindings: Record<string, any>) {
  const ast = sourceAst(source); const found: Record<string, Function> = {};
  const visit = (node: ts.Node) => {
    if (ts.isJsxOpeningElement(node) && node.getText(ast).includes(marker)) {
      for (const attr of node.attributes.properties) {
        if (ts.isJsxAttribute(attr) && attr.name.getText(ast).startsWith('on')
          && attr.initializer && ts.isJsxExpression(attr.initializer) && attr.initializer.expression) {
          found[attr.name.getText(ast)] = bind(attr.initializer.expression.getText(ast), bindings);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(ast); return found;
}
function harness(overrides: Record<string, any> = {}) {
  let editor: any = null; let mounts = 0;
  const bindings: Record<string, any> = {
    ledgerId: 37, canRecordCalendarNumber: true, canOpenCalendarDayDetail: false,
    day: 24, getDateStr: () => '2026-11-24', isNonTrading: false,
    getBeijingLedgerRecordToday, selectedTagId: 7,
    isSelectedStockPortfolio: false, selectedTag: { name: '余额' }, selectedStockCalendarTag: null,
    dayMap: new Map([['2026-11-24', { records: [{ images: ['offline-test.jpg'] }] }]]),
    openCalendarDayAttachments: vi.fn(), setCalendarDateDetail: vi.fn(), setShowImagePreview: vi.fn(),
    setShowStockPortfolio: vi.fn(),
    setCalendarNumberEditor: vi.fn((update: any) => {
      const next = typeof update === 'function' ? update(editor) : update;
      if (next !== editor) mounts++;
      editor = next;
    }),
    ...overrides,
  };
  bindings.dayDateStr = bindings.getDateStr(bindings.day);
  bindings.hasImages = bindings.dayMap.get(bindings.dayDateStr)?.records?.some((record: any) => (
    (Array.isArray(record.images) && record.images.length > 0) || Boolean(record.imageUrl)
  ));
  bindings.isFutureCalendarDay = bindings.ledgerId === 37 && bindings.dayDateStr > getBeijingLedgerRecordToday();
  bindings.canRecordCalendarCell = actual(aa, 'canRecordCalendarCell', bindings);
  bindings.canOpenCalendarCell = actual(aa, 'canOpenCalendarCell', bindings);
  bindings.handleDayClick = actual(aa, 'handleDayClick', bindings);
  bindings.openCalendarNumberEditor = actual(aa, 'openCalendarNumberEditor', bindings);
  return {
    bindings, events: handlers(aa, 'if (canRecordCalendarCell && selectedTagId)', bindings),
    editor: () => editor, mounts: () => mounts,
  };
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-27T08:00:00Z')); });
afterEach(() => vi.useRealTimers());

describe('管理员单击编辑；普通用户有照片单击预览、无照片不响应：执行真实日期事件', () => {
  it.each([false, true])('有/无照片=%s，管理员第一次点击直接进入余额和照片登记，不弹预览', (hasImages) => {
    const h = harness({ dayMap: new Map([['2026-11-24', { records: [{ images: hasImages ? ['offline-test.jpg'] : [] }] }]]) });
    h.events.onClick();
    expect(h.editor()).toEqual({ categoryId: 7, date: '2026-11-24' });
    expect(h.bindings.openCalendarDayAttachments).not.toHaveBeenCalled();
    expect(h.bindings.setCalendarDateDetail).toHaveBeenCalledWith(null);
    expect(h.bindings.setShowImagePreview).toHaveBeenCalledWith(false);
  });
  it('真实owner同样第一次点击进入窄登记页，连续点击同scope不重复挂载', () => {
    const h = harness({ canOpenCalendarDayDetail: true });
    h.events.onClick(); const current = h.editor();
    expect(current).toEqual({ categoryId: 7, date: '2026-11-24' });
    h.events.onClick(); vi.advanceTimersByTime(700); h.events.onClick();
    expect(h.editor()).toBe(current); expect(h.mounts()).toBe(1);
    expect(h.bindings.openCalendarDayAttachments).not.toHaveBeenCalled();
  });
  it('今天尚无登记也能单击进入，不要求已有余额、收益或照片', () => {
    const h = harness({ day: 27, getDateStr: () => '2026-11-27', dayMap: new Map() });
    h.events.onClick();
    expect(h.editor()).toEqual({ categoryId: 7, date: '2026-11-27' });
  });
  it.each([
    { memberRole: 'admin', userId: 2040145 },
    { memberRole: 'owner', userId: 870413 },
  ])('真实可登记身份 $memberRole 单击只开放窄登记', identity => {
    const canRecordCalendarNumber = canRecordLedger37Calendar({ ledgerId: 37, ownerId: 870413, ...identity });
    expect(canRecordCalendarNumber).toBe(true);
    const h = harness({ canRecordCalendarNumber }); h.events.onClick();
    expect(h.editor()).toEqual({ categoryId: 7, date: '2026-11-24' });
  });
  it.each([
    { memberRole: 'member', userId: 510025 },
    { memberRole: 'owner', userId: 510025 },
    { memberRole: 'super_admin', userId: 510025 },
    { memberRole: 'admin', userId: 510025, isViewingAs: true },
    { memberRole: 'owner', userId: 870413, isViewingAs: true },
  ])('普通/伪owner/系统角色/代看身份 $memberRole 有照片仅预览，不登记', identity => {
    const canRecordCalendarNumber = canRecordLedger37Calendar({ ledgerId: 37, ownerId: 870413, ...identity });
    expect(canRecordCalendarNumber).toBe(false);
    const h = harness({ canRecordCalendarNumber }); h.events.onClick();
    expect(h.bindings.openCalendarDayAttachments).toHaveBeenCalledWith('2026-11-24');
    expect(h.editor()).toBeNull(); expect(h.bindings.setCalendarDateDetail).not.toHaveBeenCalled();
  });
  it.each([
    { records: [] }, { records: [{ images: [] }] }, { records: [{ images: null }] },
    { records: [{ imageUrl: '' }] }, { records: [{ stockCodes: ['AAPL'] }] },
  ])('普通用户无照片记录$records时单击无反应，即使已有数字或股票代码', ({ records }) => {
    const h = harness({ canRecordCalendarNumber: false, dayMap: new Map([['2026-11-24', { records, expense: 123 }]]) });
    expect(h.bindings.canOpenCalendarCell).toBeFalsy(); h.events.onClick();
    expect(h.bindings.openCalendarDayAttachments).not.toHaveBeenCalled();
    expect(h.bindings.setCalendarDateDetail).not.toHaveBeenCalled();
    expect(h.bindings.setShowStockPortfolio).not.toHaveBeenCalled(); expect(h.editor()).toBeNull();
  });
  it('普通用户旧imageUrl照片同样可单击预览；重复点击始终不会进入编辑', () => {
    const h = harness({ canRecordCalendarNumber: false, dayMap: new Map([['2026-11-24', { records: [{ imageUrl: 'offline-test.jpg' }] }]]) });
    h.events.onClick(); h.events.onClick();
    expect(h.bindings.openCalendarDayAttachments).toHaveBeenCalledWith('2026-11-24');
    expect(h.editor()).toBeNull(); expect(h.bindings.setCalendarNumberEditor).not.toHaveBeenCalled();
  });
  it('未来日即使有照片或直接调用处理函数也不能打开登记或预览', () => {
    for (const canRecordCalendarNumber of [true, false]) {
      const h = harness({ canRecordCalendarNumber, getDateStr: () => '2999-01-01', dayMap: new Map([['2999-01-01', { records: [{ images: ['offline-test.jpg'] }] }]]) });
      h.events.onClick(); h.bindings.handleDayClick(1); h.bindings.openCalendarNumberEditor(1);
      expect(h.editor()).toBeNull(); expect(h.bindings.openCalendarDayAttachments).not.toHaveBeenCalled();
    }
  });
  it('股票日历原有持仓入口和非37通用单击快览未受普通账户改动影响', () => {
    const member = harness({ canRecordCalendarNumber: false, isSelectedStockPortfolio: true });
    member.events.onClick(); expect(member.bindings.setShowStockPortfolio).toHaveBeenCalledWith(true);
    const owner = harness({ isSelectedStockPortfolio: true, canOpenCalendarDayDetail: true });
    owner.events.onClick(); expect(owner.bindings.setCalendarDateDetail).toHaveBeenCalledWith(expect.objectContaining({ isStockPortfolio: true }));
    const other = harness({ ledgerId: 52, canRecordCalendarNumber: false, canOpenCalendarDayDetail: true });
    other.events.onClick(); expect(other.bindings.setCalendarDateDetail).toHaveBeenCalled();
  });
  it('非交易日、股票标签、没有选择标签及无登记权限均不能单击录入', () => {
    for (const patch of [{ isNonTrading: true }, { isSelectedStockPortfolio: true }, { selectedTagId: null }, { canRecordCalendarNumber: false }]) {
      const h = harness(patch); h.events.onClick(); expect(h.editor()).toBeNull();
    }
  });
  it('日期按钮只保留原生click，不再绑定双击计时或自定义触摸容错', () => {
    expect(Object.keys(harness().events)).toEqual(['onClick']);
    for (const marker of ['ledger-calendar-double-tap', 'calendarNumberTapRef', 'calendarNumberTouchRef']) expect(aa).not.toContain(marker);
  });
});

describe('AI管理员日历同样单击登记，不开放成员或代看的登记资格', () => {
  it('第一次click就开页，不依赖PointerEvent和双击时间间隔', () => {
    const openNumber = vi.fn();
    const events = handlers(recorder, 'if (enabled) openNumber(dayDate)', { enabled: true, dayDate: '2026-11-24', openNumber });
    events.onClick(); expect(openNumber).toHaveBeenCalledOnce(); expect(openNumber).toHaveBeenCalledWith('2026-11-24');
    expect(Object.keys(events)).toEqual(['onClick']);
  });
  it('禁用日期单击仍不调用开页；绕过按钮也不能开未来日或没有标签的登记', () => {
    const openNumber = vi.fn();
    const events = handlers(recorder, 'if (enabled) openNumber(dayDate)', { enabled: false, dayDate: '2999-01-01', openNumber });
    events.onClick(); expect(openNumber).not.toHaveBeenCalled();
    for (const selectedId of [7, null]) {
      const setDate = vi.fn(); const open = actual(recorder, 'openNumber', { selectedId, today: '2026-11-27', setDate });
      open('2999-01-01'); expect(setDate).not.toHaveBeenCalled();
      if (!selectedId) { open('2026-11-24'); expect(setDate).not.toHaveBeenCalled(); }
    }
  });
  it('提示文字改为点击，组件不再包含双击和触摸配对逻辑', () => {
    expect(recorder).toContain('点击日期登记，在放大镜中查看照片');
    for (const marker of ['双击', 'onDoubleClick', 'ledger-calendar-double-tap', 'lastTap', 'touchOrigin']) expect(recorder).not.toContain(marker);
  });
});

describe('登记页仍阻止开页尾随click误操作，照片上传与放大功能保持不变', () => {
  it.each(['onPointerDownCapture', 'onTouchStartCapture', 'onMouseDownCapture'])('%s之后真实click可用；无输入来源的残余click仍拦截', start => {
    const freshPointer = { current: false };
    const events = handlers(dialog, 'onTouchStartCapture', { freshPointer });
    const residual = { detail: 1, preventDefault: vi.fn(), stopPropagation: vi.fn() };
    events.onClickCapture(residual); expect(residual.preventDefault).toHaveBeenCalledOnce();
    events[start]({ button: 0 });
    const real = { detail: 1, preventDefault: vi.fn(), stopPropagation: vi.fn() };
    events.onClickCapture(real); expect(real.preventDefault).not.toHaveBeenCalled();
  });
  it('键盘click不拦，放大镜只更新预览，不保存/上传', () => {
    const events = handlers(dialog, 'onTouchStartCapture', { freshPointer: { current: false } });
    const keyboard = { detail: 0, preventDefault: vi.fn(), stopPropagation: vi.fn() };
    events.onClickCapture(keyboard); expect(keyboard.preventDefault).not.toHaveBeenCalled();
    const setPreview = vi.fn();
    const zoom = handlers(dialog, 'setPreview(image.imageUrl)', { setPreview, image: { imageUrl: 'offline-test.jpg' } });
    zoom.onClick(); expect(setPreview).toHaveBeenCalledWith('offline-test.jpg');
  });
  it('getCalendarEntry仍精确匹配独立httpLink和相同认证fetch', () => {
    const ast = sourceAst(main); let condition = '';
    const visit = (node: ts.Node) => {
      if (ts.isMethodDeclaration(node) && node.name.getText(ast) === 'condition') condition = node.getText(ast);
      ts.forEachChild(node, visit);
    };
    visit(ast);
    const route = bind(`({${condition}}).condition`, { isAdminWalletRequest: () => false, isT0JournalRequest: () => false });
    expect(route({ path: 'ledger.getCalendarEntry' })).toBe(true);
    expect(route({ path: 'ledger.getCalendarEntryExtra' })).toBe(false);
    expect(route({ path: 'ledger.getTransactions' })).toBe(false);
    expect(main).toContain('true: httpLink({ url: trpcEndpoint, transformer: superjson, fetch: trpcFetch })');
  });
});
